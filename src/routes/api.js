const express = require('express')
const claudeRelayService = require('../services/claudeRelayService')
const claudeConsoleRelayService = require('../services/claudeConsoleRelayService')
const bedrockRelayService = require('../services/bedrockRelayService')
const ccrRelayService = require('../services/ccrRelayService')
const bedrockAccountService = require('../services/bedrockAccountService')
const unifiedClaudeScheduler = require('../services/unifiedClaudeScheduler')
const apiKeyService = require('../services/apiKeyService')
const redis = require('../models/redis')
const { authenticateApiKey } = require('../middleware/auth')
const logger = require('../utils/logger')
const { getEffectiveModel, parseVendorPrefixedModel } = require('../utils/modelHelper')
const sessionHelper = require('../utils/sessionHelper')
const { updateRateLimitCounters } = require('../utils/rateLimitHelper')
const { sanitizeUpstreamError } = require('../utils/errorSanitizer')
const modelService = require('../services/modelService')
const requestFailureAlertService = require('../services/requestFailureAlertService')
const consoleAccountRetryService = require('../services/consoleAccountRetryService')
const router = express.Router()

/**
 * 规范化 usage 数据，提取 token 信息和模型名称
 * @param {Object} usageData - 从 SSE 流中收集的 usage 数据
 * @param {string} fallbackModel - 备选模型名称（从请求中获取）
 * @returns {Object} 规范化后的 usage 数据
 */
function normalizeUsageData(usageData, fallbackModel, reqHeaders, reqBody) {
  const inputTokens = usageData.input_tokens || 0
  const outputTokens = usageData.output_tokens || 0

  // 兼容处理：如果有详细的 cache_creation 对象，使用它；否则使用总的 cache_creation_input_tokens
  let cacheCreateTokens = usageData.cache_creation_input_tokens || 0
  let ephemeral5mTokens = 0
  let ephemeral1hTokens = 0

  if (usageData.cache_creation && typeof usageData.cache_creation === 'object') {
    ephemeral5mTokens = usageData.cache_creation.ephemeral_5m_input_tokens || 0
    ephemeral1hTokens = usageData.cache_creation.ephemeral_1h_input_tokens || 0
    cacheCreateTokens = ephemeral5mTokens + ephemeral1hTokens
  }

  const cacheReadTokens = usageData.cache_read_input_tokens || 0
  // 优先使用响应中的 model，如果没有则从请求中获取作为备选
  const model = usageData.model || fallbackModel || 'unknown'

  // 构建 usage 对象
  const usageObject = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: cacheCreateTokens,
    cache_read_input_tokens: cacheReadTokens
  }

  // 如果有详细的缓存创建数据，添加到 usage 对象中
  if (ephemeral5mTokens > 0 || ephemeral1hTokens > 0) {
    usageObject.cache_creation = {
      ephemeral_5m_input_tokens: ephemeral5mTokens,
      ephemeral_1h_input_tokens: ephemeral1hTokens
    }
  }

  // 附加请求元数据用于计费特性检测（fast mode、context-1m 等）
  if (reqHeaders?.['anthropic-beta']) {
    usageObject.request_anthropic_beta = reqHeaders['anthropic-beta']
  }
  if (reqBody?.speed) {
    usageObject.request_speed = reqBody.speed
  }
  // 响应中的 speed 字段（由上游 API 返回）
  if (usageData.speed) {
    usageObject.speed = usageData.speed
  }

  return {
    inputTokens,
    outputTokens,
    cacheCreateTokens,
    cacheReadTokens,
    model,
    usageObject,
    totalTokens: inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens
  }
}

function queueRateLimitUpdate(
  rateLimitInfo,
  usageSummary,
  model,
  context = '',
  useBooster = false,
  usageObject = null
) {
  if (!rateLimitInfo) {
    return Promise.resolve({ totalTokens: 0, totalCost: 0 })
  }

  const label = context ? ` (${context})` : ''

  return updateRateLimitCounters(rateLimitInfo, usageSummary, model, useBooster, usageObject)
    .then(({ totalTokens, totalCost }) => {
      if (totalTokens > 0) {
        logger.api(`📊 Updated rate limit token count${label}: +${totalTokens} tokens`)
      }
      if (typeof totalCost === 'number' && totalCost > 0) {
        logger.api(`💰 Updated rate limit cost count${label}: +$${totalCost.toFixed(6)}`)
      }
      return { totalTokens, totalCost }
    })
    .catch((error) => {
      logger.error(`❌ Failed to update rate limit counters${label}:`, error)
      return { totalTokens: 0, totalCost: 0 }
    })
}

// 🔧 共享的消息处理函数
async function handleMessagesRequest(req, res) {
  // 在函数级别声明这些变量，以便在 catch 块中也能访问
  let accountId = null
  let accountType = null
  let accountName = null

  try {
    const startTime = Date.now()

    // Claude 服务权限校验，阻止未授权的 Key
    if (!apiKeyService.hasPermission(req.apiKey.permissions, 'claude')) {
      return res.status(403).json({
        error: {
          type: 'permission_error',
          message: '此 API Key 无权访问 Claude 服务'
        }
      })
    }

    // 🔄 并发满额重试标志：最多重试一次（使用req对象存储状态）
    if (req._concurrencyRetryAttempted === undefined) {
      req._concurrencyRetryAttempted = false
    }

    // 严格的输入验证
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Request body must be a valid JSON object'
      })
    }

    if (!req.body.messages || !Array.isArray(req.body.messages)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Missing or invalid field: messages (must be an array)'
      })
    }

    if (req.body.messages.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Messages array cannot be empty'
      })
    }

    // 模型限制（黑名单）校验：统一在此处处理（去除供应商前缀）
    if (
      req.apiKey.enableModelRestriction &&
      Array.isArray(req.apiKey.restrictedModels) &&
      req.apiKey.restrictedModels.length > 0
    ) {
      const effectiveModel = getEffectiveModel(req.body.model || '')
      if (req.apiKey.restrictedModels.includes(effectiveModel)) {
        return res.status(403).json({
          error: {
            type: 'forbidden',
            message: '暂无该模型访问权限'
          }
        })
      }
    }

    // 检查是否为流式请求
    const isStream = req.body.stream === true

    // 临时修复新版本客户端，删除context_management字段，避免报错
    // if (req.body.context_management) {
    //   delete req.body.context_management
    // }

    // 遍历tools数组，删除input_examples字段
    // if (req.body.tools && Array.isArray(req.body.tools)) {
    //   req.body.tools.forEach((tool) => {
    //     if (tool && typeof tool === 'object' && tool.input_examples) {
    //       delete tool.input_examples
    //     }
    //   })
    // }

    logger.api(
      `🚀 Processing ${isStream ? 'stream' : 'non-stream'} request for key: ${req.apiKey.name}`
    )

    if (isStream) {
      // 流式响应 - 只使用官方真实usage数据
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('X-Accel-Buffering', 'no') // 禁用 Nginx 缓冲

      // 禁用 Nagle 算法，确保数据立即发送
      if (res.socket && typeof res.socket.setNoDelay === 'function') {
        res.socket.setNoDelay(true)
      }

      // 流式响应不需要额外处理，中间件已经设置了监听器

      let usageDataCaptured = false

      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(req.body)

      // 使用统一调度选择账号（传递请求的模型）
      const requestedModel = req.body.model
      try {
        const selection = await unifiedClaudeScheduler.selectAccountForApiKey(
          req.apiKey,
          sessionHash,
          requestedModel
        )
        ;({ accountId, accountType, accountName = null } = selection)
      } catch (error) {
        if (error.code === 'CLAUDE_DEDICATED_RATE_LIMITED') {
          const limitMessage = claudeRelayService._buildStandardRateLimitMessage(
            error.rateLimitEndAt
          )
          res.status(403)
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: 'upstream_rate_limited',
              message: limitMessage
            })
          )
          return
        }
        throw error
      }

      // 根据账号类型选择对应的转发服务并调用
      if (accountType === 'claude-official') {
        // 官方Claude账号使用原有的转发服务（会自己选择账号）
        await claudeRelayService.relayStreamRequestWithUsageCapture(
          req.body,
          req.apiKey,
          res,
          req.headers,
          (usageData) => {
            // 回调函数：当检测到完整usage数据时记录真实token使用量
            logger.info(
              '🎯 Usage callback triggered with complete data:',
              JSON.stringify(usageData, null, 2)
            )

            if (
              usageData &&
              usageData.input_tokens !== undefined &&
              usageData.output_tokens !== undefined
            ) {
              const {
                inputTokens,
                outputTokens,
                cacheCreateTokens,
                cacheReadTokens,
                model,
                usageObject,
                totalTokens
              } = normalizeUsageData(usageData, req.body.model, req.headers, req.body)
              const { accountId: usageAccountId } = usageData

              apiKeyService
                .recordUsageWithDetails(
                  req.apiKey.id,
                  usageObject,
                  model,
                  usageAccountId,
                  'claude',
                  req.apiKey.useBooster
                )
                .catch((error) => {
                  logger.error('❌ Failed to record stream usage:', error)
                })

              queueRateLimitUpdate(
                req.rateLimitInfo,
                { inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens },
                model,
                'claude-stream',
                req.apiKey.useBooster,
                usageObject
              )

              usageDataCaptured = true
              logger.api(
                `📊 Stream usage recorded (real) - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Cache Create: ${cacheCreateTokens}, Cache Read: ${cacheReadTokens}, Total: ${totalTokens} tokens`
              )
            } else {
              logger.warn(
                '⚠️ Usage callback triggered but data is incomplete:',
                JSON.stringify(usageData)
              )
            }
          }
        )
      } else if (accountType === 'claude-console') {
        // Claude Console账号使用重试服务（尝试所有可用账户，自动告警）
        logger.debug(`[DEBUG] Using consoleAccountRetryService for stream Console request`)
        try {
          await consoleAccountRetryService.handleConsoleRequestWithRetry(
            req,
            res,
            req.apiKey,
            true /* isStream */,
            {
              stickyAccountId: accountId,
              sessionHash,
              usageCallback: (usageData) => {
                // 回调函数：当检测到完整usage数据时记录真实token使用量
                logger.info(
                  '🎯 [Console] Usage callback triggered with complete data:',
                  JSON.stringify(usageData, null, 2)
                )

                if (
                  usageData &&
                  usageData.input_tokens !== undefined &&
                  usageData.output_tokens !== undefined
                ) {
                  const {
                    inputTokens,
                    outputTokens,
                    cacheCreateTokens,
                    cacheReadTokens,
                    model,
                    usageObject,
                    totalTokens
                  } = normalizeUsageData(usageData, req.body.model, req.headers, req.body)
                  const { accountId: usageAccountId } = usageData

                  apiKeyService
                    .recordUsageWithDetails(
                      req.apiKey.id,
                      usageObject,
                      model,
                      usageAccountId,
                      'claude-console',
                      req.apiKey.useBooster
                    )
                    .catch((error) => {
                      logger.error('❌ Failed to record Console stream usage:', error)
                    })

                  queueRateLimitUpdate(
                    req.rateLimitInfo,
                    { inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens },
                    model,
                    'claude-console-stream',
                    req.apiKey.useBooster,
                    usageObject
                  )

                  usageDataCaptured = true
                  logger.api(
                    `📊 Console stream usage recorded - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Cache Create: ${cacheCreateTokens}, Cache Read: ${cacheReadTokens}, Total: ${totalTokens} tokens`
                  )
                } else {
                  logger.warn(
                    '⚠️ [Console] Usage callback triggered but data is incomplete:',
                    JSON.stringify(usageData)
                  )
                }
              }
            }
          )
          // 流式请求已处理，标记usage已捕获
          usageDataCaptured = true
        } catch (error) {
          // 重试服务已发送响应，记录错误并确保流关闭
          logger.error('❌ Console stream retry service error:', error.message)
          if (!res.finished) {
            res.end() // 确保流被正确关闭，避免连接挂起
          }
        }
      } else if (accountType === 'bedrock') {
        // Bedrock账号使用Bedrock转发服务
        try {
          const bedrockAccountResult = await bedrockAccountService.getAccount(accountId)
          if (!bedrockAccountResult.success) {
            throw new Error('Failed to get Bedrock account details')
          }

          const result = await bedrockRelayService.handleStreamRequest(
            req.body,
            bedrockAccountResult.data,
            res
          )

          // 记录Bedrock使用统计
          if (result.usage) {
            const inputTokens = result.usage.input_tokens || 0
            const outputTokens = result.usage.output_tokens || 0

            apiKeyService
              .recordUsage(
                req.apiKey.id,
                inputTokens,
                outputTokens,
                0,
                0,
                result.model,
                accountId,
                req.apiKey.useBooster
              )
              .catch((error) => {
                logger.error('❌ Failed to record Bedrock stream usage:', error)
              })

            queueRateLimitUpdate(
              req.rateLimitInfo,
              {
                inputTokens,
                outputTokens,
                cacheCreateTokens: 0,
                cacheReadTokens: 0
              },
              result.model,
              'bedrock-stream',
              req.apiKey.useBooster
            )

            usageDataCaptured = true
            logger.api(
              `📊 Bedrock stream usage recorded - Model: ${result.model}, Input: ${inputTokens}, Output: ${outputTokens}, Total: ${inputTokens + outputTokens} tokens`
            )
          }
        } catch (error) {
          logger.error('❌ Bedrock stream request failed:', error)
          if (!res.headersSent) {
            return res.status(500).json({ error: 'Bedrock service error', message: error.message })
          }
          return undefined
        }
      } else if (accountType === 'ccr') {
        // CCR账号使用CCR转发服务（需要传递accountId）
        await ccrRelayService.relayStreamRequestWithUsageCapture(
          req.body,
          req.apiKey,
          res,
          req.headers,
          (usageData) => {
            // 回调函数：当检测到完整usage数据时记录真实token使用量
            logger.info(
              '🎯 CCR usage callback triggered with complete data:',
              JSON.stringify(usageData, null, 2)
            )

            if (
              usageData &&
              usageData.input_tokens !== undefined &&
              usageData.output_tokens !== undefined
            ) {
              // 使用统一的 usage 数据规范化函数
              const normalized = normalizeUsageData(
                usageData,
                req.body.model,
                req.headers,
                req.body
              )
              const {
                inputTokens,
                outputTokens,
                cacheCreateTokens,
                cacheReadTokens,
                model,
                usageObject,
                totalTokens
              } = normalized

              // 记录真实的token使用量（包含模型信息和所有4种token以及账户ID）
              const usageAccountId = usageData.accountId

              apiKeyService
                .recordUsageWithDetails(
                  req.apiKey.id,
                  usageObject,
                  model,
                  usageAccountId,
                  'ccr',
                  req.apiKey.useBooster
                )
                .catch((error) => {
                  logger.error('❌ Failed to record CCR stream usage:', error)
                })

              queueRateLimitUpdate(
                req.rateLimitInfo,
                {
                  inputTokens,
                  outputTokens,
                  cacheCreateTokens,
                  cacheReadTokens
                },
                model,
                'ccr-stream',
                req.apiKey.useBooster,
                usageObject
              )

              usageDataCaptured = true
              logger.api(
                `📊 CCR stream usage recorded (real) - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Cache Create: ${cacheCreateTokens}, Cache Read: ${cacheReadTokens}, Total: ${totalTokens} tokens`
              )
            } else {
              logger.warn(
                '⚠️ CCR usage callback triggered but data is incomplete:',
                JSON.stringify(usageData)
              )
            }
          },
          accountId
        )
      }

      // 流式请求完成后 - 如果没有捕获到usage数据，记录警告但不进行估算
      setTimeout(() => {
        if (!usageDataCaptured) {
          logger.warn(
            '⚠️ No usage data captured from SSE stream - no statistics recorded (official data only)'
          )
        }
      }, 1000) // 1秒后检查
    } else {
      // 非流式响应 - 只使用官方真实usage数据
      logger.info('📄 Starting non-streaming request', {
        apiKeyId: req.apiKey.id,
        apiKeyName: req.apiKey.name
      })

      // 生成会话哈希用于sticky会话
      const sessionHash = sessionHelper.generateSessionHash(req.body)

      // 使用统一调度选择账号（传递请求的模型）
      const requestedModel = req.body.model
      try {
        const selection = await unifiedClaudeScheduler.selectAccountForApiKey(
          req.apiKey,
          sessionHash,
          requestedModel
        )
        ;({ accountId, accountType, accountName = null } = selection)
      } catch (error) {
        if (error.code === 'CLAUDE_DEDICATED_RATE_LIMITED') {
          const limitMessage = claudeRelayService._buildStandardRateLimitMessage(
            error.rateLimitEndAt
          )
          return res.status(403).json({
            error: 'upstream_rate_limited',
            message: limitMessage
          })
        }
        throw error
      }

      // 根据账号类型选择对应的转发服务
      let response
      logger.debug(`[DEBUG] Request query params: ${JSON.stringify(req.query)}`)
      logger.debug(`[DEBUG] Request URL: ${req.url}`)
      logger.debug(`[DEBUG] Request path: ${req.path}`)

      if (accountType === 'claude-official') {
        // 官方Claude账号使用原有的转发服务
        response = await claudeRelayService.relayRequest(
          req.body,
          req.apiKey,
          req,
          res,
          req.headers
        )
      } else if (accountType === 'claude-console') {
        // Claude Console账号使用重试服务（尝试所有可用账户，自动告警）
        logger.debug(`[DEBUG] Using consoleAccountRetryService for non-stream Console request`)
        const handled = await consoleAccountRetryService.handleConsoleRequestWithRetry(
          req,
          res,
          req.apiKey,
          false /* isStream */,
          {
            stickyAccountId: accountId,
            sessionHash,
            usageCallback: (usageData) => {
              // 回调函数：记录非流式请求的 usage 统计
              logger.info(
                '🎯 [Console] Non-stream usage callback triggered:',
                JSON.stringify(usageData, null, 2)
              )

              if (
                usageData &&
                usageData.input_tokens !== undefined &&
                usageData.output_tokens !== undefined
              ) {
                const {
                  inputTokens,
                  outputTokens,
                  cacheCreateTokens,
                  cacheReadTokens,
                  model,
                  usageObject,
                  totalTokens
                } = normalizeUsageData(usageData, req.body.model, req.headers, req.body)
                const { accountId: usageAccountId } = usageData

                apiKeyService
                  .recordUsageWithDetails(
                    req.apiKey.id,
                    usageObject,
                    model,
                    usageAccountId,
                    'claude-console',
                    req.apiKey.useBooster
                  )
                  .catch((error) => {
                    logger.error('❌ Failed to record Console non-stream usage:', error)
                  })

                queueRateLimitUpdate(
                  req.rateLimitInfo,
                  { inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens },
                  model,
                  'claude-console-non-stream',
                  req.apiKey.useBooster,
                  usageObject
                )

                logger.api(
                  `📊 Console non-stream usage recorded - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Cache Create: ${cacheCreateTokens}, Cache Read: ${cacheReadTokens}, Total: ${totalTokens} tokens`
                )
              } else {
                logger.warn(
                  '⚠️ [Console] Non-stream usage callback triggered but data is incomplete:',
                  JSON.stringify(usageData)
                )
              }
            }
          }
        )
        if (handled) {
          // 重试服务已处理响应（成功或503失败）
          return undefined
        }
        // 如果未处理（不应该发生），继续后续流程
        logger.warn('⚠️ Console retry service did not handle the request, this is unexpected')
        response = {
          statusCode: 500,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Internal error', message: 'Request not handled' }),
          accountId
        }
      } else if (accountType === 'bedrock') {
        // Bedrock账号使用Bedrock转发服务
        try {
          const bedrockAccountResult = await bedrockAccountService.getAccount(accountId)
          if (!bedrockAccountResult.success) {
            throw new Error('Failed to get Bedrock account details')
          }

          const result = await bedrockRelayService.handleNonStreamRequest(
            req.body,
            bedrockAccountResult.data,
            req.headers
          )

          // 构建标准响应格式
          response = {
            statusCode: result.success ? 200 : 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.success ? result.data : { error: result.error }),
            accountId
          }

          // 如果成功，添加使用统计到响应数据中
          if (result.success && result.usage) {
            const responseData = JSON.parse(response.body)
            responseData.usage = result.usage
            response.body = JSON.stringify(responseData)
          }
        } catch (error) {
          logger.error('❌ Bedrock non-stream request failed:', error)
          response = {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Bedrock service error', message: error.message }),
            accountId
          }
        }
      } else if (accountType === 'ccr') {
        // CCR账号使用CCR转发服务
        logger.debug(`[DEBUG] Calling ccrRelayService.relayRequest with accountId: ${accountId}`)
        response = await ccrRelayService.relayRequest(
          req.body,
          req.apiKey,
          req,
          res,
          req.headers,
          accountId
        )
      }

      logger.info('📡 Claude API response received', {
        statusCode: response.statusCode,
        headers: JSON.stringify(response.headers),
        bodyLength: response.body ? response.body.length : 0
      })

      // 检查非成功状态码，发送告警
      if (response.statusCode && response.statusCode >= 400) {
        let errorMessage = 'Unknown error'
        try {
          const errorBody = JSON.parse(response.body)
          errorMessage = errorBody.message || errorBody.error || JSON.stringify(errorBody)
        } catch {
          errorMessage = response.body?.substring(0, 200) || 'Unknown error'
        }

        requestFailureAlertService
          .sendAlert({
            apiKeyId: req.apiKey?.id,
            apiKeyName: req.apiKey?.name,
            accountId,
            accountName,
            accountType: accountType || 'claude',
            errorCode: `HTTP_${response.statusCode}`,
            statusCode: response.statusCode,
            errorMessage
          })
          .catch((alertError) => {
            logger.error('Failed to send request failure alert:', alertError)
          })
      }

      res.status(response.statusCode)

      // 设置响应头，避免 Content-Length 和 Transfer-Encoding 冲突
      const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length']
      Object.keys(response.headers).forEach((key) => {
        if (!skipHeaders.includes(key.toLowerCase())) {
          res.setHeader(key, response.headers[key])
        }
      })

      let usageRecorded = false

      // 尝试解析JSON响应并提取usage信息
      try {
        const jsonData = JSON.parse(response.body)

        logger.info('📊 Parsed Claude API response:', JSON.stringify(jsonData, null, 2))

        // 从Claude API响应中提取usage信息（完整的token分类体系）
        if (
          jsonData.usage &&
          jsonData.usage.input_tokens !== undefined &&
          jsonData.usage.output_tokens !== undefined
        ) {
          const inputTokens = jsonData.usage.input_tokens || 0
          const outputTokens = jsonData.usage.output_tokens || 0
          const cacheCreateTokens = jsonData.usage.cache_creation_input_tokens || 0
          const cacheReadTokens = jsonData.usage.cache_read_input_tokens || 0
          // Parse the model to remove vendor prefix if present (e.g., "ccr,gemini-2.5-pro" -> "gemini-2.5-pro")
          const rawModel = jsonData.model || req.body.model || 'unknown'
          const { baseModel } = parseVendorPrefixedModel(rawModel)
          const model = baseModel || rawModel

          // 记录真实的token使用量（包含模型信息和所有4种token以及账户ID）
          const { accountId: responseAccountId } = response
          await apiKeyService.recordUsage(
            req.apiKey.id,
            inputTokens,
            outputTokens,
            cacheCreateTokens,
            cacheReadTokens,
            model,
            responseAccountId,
            req.apiKey.useBooster || false // 传递是否使用加油包
          )

          await queueRateLimitUpdate(
            req.rateLimitInfo,
            {
              inputTokens,
              outputTokens,
              cacheCreateTokens,
              cacheReadTokens
            },
            model,
            'claude-non-stream',
            req.apiKey.useBooster,
            jsonData.usage
          )

          usageRecorded = true
          logger.api(
            `📊 Non-stream usage recorded (real) - Model: ${model}, Input: ${inputTokens}, Output: ${outputTokens}, Cache Create: ${cacheCreateTokens}, Cache Read: ${cacheReadTokens}, Total: ${inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens} tokens`
          )
        } else {
          logger.warn('⚠️ No usage data found in Claude API JSON response')
        }

        res.json(jsonData)
      } catch (parseError) {
        logger.warn('⚠️ Failed to parse Claude API response as JSON:', parseError.message)
        logger.info('📄 Raw response body:', response.body)
        res.send(response.body)
      }

      // 如果没有记录usage，只记录警告，不进行估算
      if (!usageRecorded) {
        logger.warn(
          '⚠️ No usage data recorded for non-stream request - no statistics recorded (official data only)'
        )
      }
    }

    const duration = Date.now() - startTime
    logger.api(`✅ Request completed in ${duration}ms for key: ${req.apiKey.name}`)
    return undefined
  } catch (error) {
    let handledError = error

    // 🔄 并发满额降级处理：捕获CONSOLE_ACCOUNT_CONCURRENCY_FULL错误
    if (
      handledError.code === 'CONSOLE_ACCOUNT_CONCURRENCY_FULL' &&
      !req._concurrencyRetryAttempted
    ) {
      req._concurrencyRetryAttempted = true
      logger.warn(
        `⚠️ Console account ${handledError.accountId} concurrency full, attempting fallback to other accounts...`
      )

      // 只有在响应头未发送时才能重试
      if (!res.headersSent) {
        try {
          // 清理粘性会话映射（如果存在）
          const sessionHash = sessionHelper.generateSessionHash(req.body)
          await unifiedClaudeScheduler.clearSessionMapping(sessionHash)

          logger.info('🔄 Session mapping cleared, retrying handleMessagesRequest...')

          // 递归重试整个请求处理（会选择新账户）
          return await handleMessagesRequest(req, res)
        } catch (retryError) {
          // 重试失败
          if (retryError.code === 'CONSOLE_ACCOUNT_CONCURRENCY_FULL') {
            logger.error('❌ All Console accounts reached concurrency limit after retry')
            return res.status(503).json({
              error: 'service_unavailable',
              message:
                'All available Claude Console accounts have reached their concurrency limit. Please try again later.'
            })
          }
          // 其他错误继续向下处理
          handledError = retryError
        }
      } else {
        // 响应头已发送，无法重试
        logger.error('❌ Cannot retry concurrency full error - response headers already sent')
        if (!res.destroyed && !res.finished) {
          res.end()
        }
        return undefined
      }
    }

    // 🚫 第二次并发满额错误：已经重试过，直接返回503
    if (
      handledError.code === 'CONSOLE_ACCOUNT_CONCURRENCY_FULL' &&
      req._concurrencyRetryAttempted
    ) {
      logger.error('❌ All Console accounts reached concurrency limit (retry already attempted)')
      if (!res.headersSent) {
        return res.status(503).json({
          error: 'service_unavailable',
          message:
            'All available Claude Console accounts have reached their concurrency limit. Please try again later.'
        })
      } else {
        if (!res.destroyed && !res.finished) {
          res.end()
        }
        return undefined
      }
    }

    logger.error('❌ Claude relay error:', handledError.message, {
      code: handledError.code,
      stack: handledError.stack
    })

    // 发送请求失败告警（内置限流防止告警风暴）
    requestFailureAlertService
      .sendAlert({
        apiKeyId: req.apiKey?.id,
        apiKeyName: req.apiKey?.name,
        accountId: accountId || handledError.accountId,
        accountName: accountName || handledError.accountName,
        accountType: accountType || 'claude',
        errorCode: handledError.code || 'UNKNOWN_ERROR',
        statusCode: handledError.statusCode || 500,
        errorMessage: handledError.message
      })
      .catch((alertError) => {
        logger.error('Failed to send request failure alert:', alertError)
      })

    // 确保在任何情况下都能返回有效的JSON响应
    if (!res.headersSent) {
      // 根据错误类型设置适当的状态码
      let statusCode = 500
      let errorType = 'Relay service error'

      if (
        handledError.message.includes('Connection reset') ||
        handledError.message.includes('socket hang up')
      ) {
        statusCode = 502
        errorType = 'Upstream connection error'
      } else if (handledError.message.includes('Connection refused')) {
        statusCode = 502
        errorType = 'Upstream service unavailable'
      } else if (handledError.message.includes('timeout')) {
        statusCode = 504
        errorType = 'Upstream timeout'
      } else if (
        handledError.message.includes('resolve') ||
        handledError.message.includes('ENOTFOUND')
      ) {
        statusCode = 502
        errorType = 'Upstream hostname resolution failed'
      }

      return res.status(statusCode).json({
        error: errorType,
        message: handledError.message || 'An unexpected error occurred',
        timestamp: new Date().toISOString()
      })
    } else {
      // 如果响应头已经发送，尝试结束响应
      if (!res.destroyed && !res.finished) {
        res.end()
      }
      return undefined
    }
  }
}

// 🚀 Claude API messages 端点 - /api/v1/messages
router.post('/v1/messages', authenticateApiKey, handleMessagesRequest)

// 🚀 Claude API messages 端点 - /claude/v1/messages (别名)
router.post('/claude/v1/messages', authenticateApiKey, handleMessagesRequest)

// 📋 模型列表端点 - Anthropic 官方 API 格式
// GET /v1/models - 返回 Claude 模型列表（Anthropic 格式）
// 支持分页参数: limit (默认 20, 最大 100), after_id, before_id
router.get('/v1/models', authenticateApiKey, async (req, res) => {
  try {
    // 解析分页参数
    const limit = parseInt(req.query.limit) || 20
    const after_id = req.query.after_id || null
    const before_id = req.query.before_id || null

    // 获取 Anthropic 格式的模型列表
    const result = modelService.getClaudeModelsAnthropic({
      limit,
      after_id,
      before_id
    })

    // 可选：根据 API Key 的模型限制过滤
    if (req.apiKey.enableModelRestriction && req.apiKey.restrictedModels?.length > 0) {
      result.data = result.data.filter((model) => req.apiKey.restrictedModels.includes(model.id))
      // 更新分页信息
      result.first_id = result.data.length > 0 ? result.data[0].id : null
      result.last_id = result.data.length > 0 ? result.data[result.data.length - 1].id : null
    }

    res.json(result)
  } catch (error) {
    logger.error('❌ Models list error:', error)
    res.status(500).json({
      type: 'error',
      error: {
        type: 'api_error',
        message: 'Failed to get models list'
      }
    })
  }
})

// 📋 单个模型端点 - Anthropic 官方 API 格式
// GET /v1/models/:model_id - 返回单个 Claude 模型信息
router.get('/v1/models/:model_id', authenticateApiKey, async (req, res) => {
  try {
    const { model_id } = req.params

    // 检查模型访问权限
    if (req.apiKey.enableModelRestriction && req.apiKey.restrictedModels?.length > 0) {
      if (!req.apiKey.restrictedModels.includes(model_id)) {
        return res.status(404).json({
          type: 'error',
          error: {
            type: 'not_found_error',
            message: `Model not found: ${model_id}`
          }
        })
      }
    }

    const model = modelService.getClaudeModelAnthropic(model_id)

    if (!model) {
      return res.status(404).json({
        type: 'error',
        error: {
          type: 'not_found_error',
          message: `Model not found: ${model_id}`
        }
      })
    }

    res.json(model)
  } catch (error) {
    logger.error('❌ Get model error:', error)
    res.status(500).json({
      type: 'error',
      error: {
        type: 'api_error',
        message: 'Failed to get model'
      }
    })
  }
})

// 🏥 健康检查端点
router.get('/health', async (req, res) => {
  try {
    const healthStatus = await claudeRelayService.healthCheck()

    res.status(healthStatus.healthy ? 200 : 503).json({
      status: healthStatus.healthy ? 'healthy' : 'unhealthy',
      service: 'claude-relay-service',
      version: '1.0.0',
      ...healthStatus
    })
  } catch (error) {
    logger.error('❌ Health check error:', error)
    res.status(503).json({
      status: 'unhealthy',
      service: 'claude-relay-service',
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

// 📊 API Key状态检查端点 - /api/v1/key-info
router.get('/v1/key-info', authenticateApiKey, async (req, res) => {
  try {
    const usage = await apiKeyService.getUsageStats(req.apiKey.id)

    // 获取周限制重置时间
    const weeklyResetTime = await redis.getWeeklyCostResetTime(req.apiKey.id)

    // 获取加油包使用情况
    const boosterPackUsed = await redis.getBoosterPackUsed(req.apiKey.id)

    // 获取周限制激活状态
    const isWeeklyCostActive = await redis.isWeeklyCostActive(req.apiKey.id)

    const weeklyCostLimit = req.apiKey.weeklyCostLimit || 0
    const weeklyCost = req.apiKey.weeklyCost || 0

    res.json({
      keyInfo: {
        id: req.apiKey.id,
        name: req.apiKey.name,
        tokenLimit: req.apiKey.tokenLimit,
        usage,
        // 周限制信息
        weeklyCostLimit,
        weeklyCost,
        weeklyResetTime: weeklyResetTime.toISOString(),
        isWeeklyCostActive: isWeeklyCostActive || false,
        weeklyRemaining: Math.max(0, weeklyCostLimit - weeklyCost),
        weeklyUsagePercentage: weeklyCostLimit > 0 ? (weeklyCost / weeklyCostLimit) * 100 : 0,
        // 加油包信息
        boosterPackAmount: req.apiKey.boosterPackAmount || 0,
        boosterPackUsed
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Key info error:', error)
    res.status(500).json({
      error: 'Failed to get key info',
      message: error.message
    })
  }
})

// 📈 使用统计端点 - /api/v1/usage
router.get('/v1/usage', authenticateApiKey, async (req, res) => {
  try {
    const usage = await apiKeyService.getUsageStats(req.apiKey.id)

    res.json({
      usage,
      limits: {
        tokens: req.apiKey.tokenLimit,
        requests: 0 // 请求限制已移除
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ Usage stats error:', error)
    res.status(500).json({
      error: 'Failed to get usage stats',
      message: error.message
    })
  }
})

// 👤 用户信息端点 - Claude Code 客户端需要
router.get('/v1/me', authenticateApiKey, async (req, res) => {
  try {
    // 返回基础用户信息
    res.json({
      id: `user_${req.apiKey.id}`,
      type: 'user',
      display_name: req.apiKey.name || 'API User',
      created_at: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ User info error:', error)
    res.status(500).json({
      error: 'Failed to get user info',
      message: error.message
    })
  }
})

// 💰 余额/限制端点 - Claude Code 客户端需要
router.get('/v1/organizations/:org_id/usage', authenticateApiKey, async (req, res) => {
  try {
    const usage = await apiKeyService.getUsageStats(req.apiKey.id)

    res.json({
      object: 'usage',
      data: [
        {
          type: 'credit_balance',
          credit_balance: req.apiKey.tokenLimit - (usage.totalTokens || 0)
        }
      ]
    })
  } catch (error) {
    logger.error('❌ Organization usage error:', error)
    res.status(500).json({
      error: 'Failed to get usage info',
      message: error.message
    })
  }
})

// 🔢 Token计数端点 - count_tokens beta API
router.post('/v1/messages/count_tokens', authenticateApiKey, async (req, res) => {
  // 检查权限
  if (
    req.apiKey.permissions &&
    req.apiKey.permissions !== 'all' &&
    req.apiKey.permissions !== 'claude'
  ) {
    return res.status(403).json({
      error: {
        type: 'permission_error',
        message: 'This API key does not have permission to access Claude'
      }
    })
  }

  logger.info(`🔢 Processing token count request for key: ${req.apiKey.name}`)

  const sessionHash = sessionHelper.generateSessionHash(req.body)
  const requestedModel = req.body.model
  const maxAttempts = 2
  let attempt = 0

  const processRequest = async () => {
    const { accountId, accountType } = await unifiedClaudeScheduler.selectAccountForApiKey(
      req.apiKey,
      sessionHash,
      requestedModel
    )

    if (accountType === 'ccr') {
      throw Object.assign(new Error('Token counting is not supported for CCR accounts'), {
        httpStatus: 501,
        errorPayload: {
          error: {
            type: 'not_supported',
            message: 'Token counting is not supported for CCR accounts'
          }
        }
      })
    }

    if (accountType === 'bedrock') {
      throw Object.assign(new Error('Token counting is not supported for Bedrock accounts'), {
        httpStatus: 501,
        errorPayload: {
          error: {
            type: 'not_supported',
            message: 'Token counting is not supported for Bedrock accounts'
          }
        }
      })
    }

    const relayOptions = {
      skipUsageRecord: true,
      customPath: '/v1/messages/count_tokens'
    }

    const response =
      accountType === 'claude-official'
        ? await claudeRelayService.relayRequest(
            req.body,
            req.apiKey,
            req,
            res,
            req.headers,
            relayOptions
          )
        : await claudeConsoleRelayService.relayRequest(
            req.body,
            req.apiKey,
            req,
            res,
            req.headers,
            accountId,
            relayOptions
          )

    res.status(response.statusCode)

    const skipHeaders = ['content-encoding', 'transfer-encoding', 'content-length']
    Object.keys(response.headers).forEach((key) => {
      if (!skipHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, response.headers[key])
      }
    })

    try {
      const jsonData = JSON.parse(response.body)
      if (response.statusCode < 200 || response.statusCode >= 300) {
        const sanitizedData = sanitizeUpstreamError(jsonData)
        res.json(sanitizedData)
      } else {
        res.json(jsonData)
      }
    } catch (parseError) {
      res.send(response.body)
    }

    logger.info(`✅ Token count request completed for key: ${req.apiKey.name}`)
  }

  while (attempt < maxAttempts) {
    try {
      await processRequest()
      return
    } catch (error) {
      if (error.code === 'CONSOLE_ACCOUNT_CONCURRENCY_FULL') {
        logger.warn(
          `⚠️ Console account concurrency full during count_tokens (attempt ${attempt + 1}/${maxAttempts})`
        )
        if (attempt < maxAttempts - 1) {
          try {
            await unifiedClaudeScheduler.clearSessionMapping(sessionHash)
          } catch (clearError) {
            logger.error('❌ Failed to clear session mapping for count_tokens retry:', clearError)
            if (!res.headersSent) {
              return res.status(500).json({
                error: {
                  type: 'server_error',
                  message: 'Failed to count tokens'
                }
              })
            }
            if (!res.destroyed && !res.finished) {
              res.end()
            }
            return
          }
          attempt += 1
          continue
        }
        if (!res.headersSent) {
          return res.status(503).json({
            error: 'service_unavailable',
            message:
              'All available Claude Console accounts have reached their concurrency limit. Please try again later.'
          })
        }
        if (!res.destroyed && !res.finished) {
          res.end()
        }
        return
      }

      if (error.httpStatus) {
        return res.status(error.httpStatus).json(error.errorPayload)
      }

      // 客户端断开连接不是错误，使用 INFO 级别
      if (error.message === 'Client disconnected') {
        logger.info('🔌 Client disconnected during token count request')
        if (!res.headersSent) {
          return res.status(499).end() // 499 Client Closed Request
        }
        if (!res.destroyed && !res.finished) {
          res.end()
        }
        return
      }

      logger.error('❌ Token count error:', error)
      if (!res.headersSent) {
        return res.status(500).json({
          error: {
            type: 'server_error',
            message: 'Failed to count tokens'
          }
        })
      }

      if (!res.destroyed && !res.finished) {
        res.end()
      }
      return
    }
  }
})

// Claude Code 客户端遥测端点 - 返回成功响应避免 404 日志
router.post('/api/event_logging/batch', (req, res) => {
  res.status(200).json({ success: true })
})

module.exports = router
module.exports.handleMessagesRequest = handleMessagesRequest
