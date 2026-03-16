const logger = require('../utils/logger')
const { calculateBackoffDelay, sleep } = require('../utils/retryHelper')
const AllRetriesFailed = require('../errors/AllRetriesFailed')
const unifiedClaudeScheduler = require('./unifiedClaudeScheduler')
const claudeConsoleRelayService = require('./claudeConsoleRelayService')
const requestFailureAlertService = require('./requestFailureAlertService')

/**
 * Claude Console 账户的多轮重试服务
 * 负责：
 * 1. 轮流尝试所有可用的Console账户
 * 2. 全部账户失败后进行多轮重试
 * 3. 每次失败发送webhook告警
 * 4. 返回200/201响应或最终失败
 */
class ConsoleAccountRetryService {
  /**
   * 带多轮重试的Console账户请求处理
   * @param {Object} req - Express request对象
   * @param {Object} res - Express response对象
   * @param {Object} apiKeyData - API Key数据
   * @param {boolean} isStream - 是否为流式请求
   * @param {Object} options - 配置选项
   * @returns {boolean} 是否已处理（true表示已发送响应）
   */
  async handleConsoleRequestWithRetry(req, res, apiKeyData, isStream = false, options = {}) {
    const apiKeyId = req.apiKey?.id
    const apiKeyName = req.apiKey?.name || 'Unknown'
    // 重试参数：默认只重试 1 轮，减少 Redis 查询压力
    // 每轮尝试所有可用账户，1 轮通常足够（多账户场景）
    const {
      maxRetries = 1,
      baseDelay = 2000,
      maxDelay = 120000,
      usageCallback = null,
      stickyAccountId = null,
      sessionHash = null
    } = options

    try {
      // 定义失败回调：发送webhook告警（经过节流服务）
      const onFailure = async (account, error, retryRound, totalRetries) => {
        try {
          await requestFailureAlertService.sendAlert({
            apiKeyId,
            apiKeyName,
            accountId: account?.accountId,
            accountName: account?.name,
            accountType: 'claude-console',
            errorCode: error.errorCode,
            statusCode: error.statusCode,
            errorMessage: error.message,
            retryRound: retryRound + 1,
            maxRetries: totalRetries
          })
        } catch (alertError) {
          logger.error('Failed to send failure alert:', alertError)
          // 告警失败不应影响请求处理，继续进行
        }
      }

      // 多轮重试循环
      for (let retryRound = 0; retryRound < maxRetries; retryRound++) {
        // 轮间延迟（指数退避）
        if (retryRound > 0) {
          const delay = calculateBackoffDelay(retryRound - 1, baseDelay, maxDelay)
          logger.info(
            `⏳ Console account retry round ${retryRound + 1}/${maxRetries}, waiting ${delay}ms...`
          )
          await sleep(delay)
        } else {
          logger.info(`🔄 Starting Console account retry loop, round 1/${maxRetries}`)
        }

        // 获取可用的Console账户（粘性会话账户优先）
        const availableAccounts = await this._getAvailableConsoleAccounts(
          apiKeyData,
          req.body?.model,
          stickyAccountId
        )

        if (availableAccounts.length === 0) {
          throw new AllRetriesFailed('No available Claude Console accounts', {
            errorCode: 'NO_CONSOLE_ACCOUNTS',
            statusCode: 503,
            retryRound,
            maxRetries
          })
        }

        // 轮内账户循环
        let lastError = null

        for (const account of availableAccounts) {
          try {
            logger.debug(
              `📤 Trying Console account ${account.name} (priority: ${account.priority}) in round ${retryRound + 1}`
            )

            let result

            if (isStream) {
              // 流式请求：直接处理并返回
              // ⚠️ 原子性保证：relayStreamRequestWithUsageCapture 必须满足：
              //   - 成功：发送响应headers并完成流传输
              //   - 失败：在发送任何headers前抛出异常（保证能被catch块处理）
              result = await claudeConsoleRelayService.relayStreamRequestWithUsageCapture(
                req.body,
                req.apiKey,
                res,
                req.headers,
                usageCallback, // 传递usage回调以记录token使用统计
                account.accountId
              )

              // 流式请求成功（已发送响应）
              // 更新粘性会话映射：确保后续请求继续使用同一账户以利用缓存
              if (sessionHash) {
                this._updateStickySession(sessionHash, account, stickyAccountId).catch((err) =>
                  logger.error('Failed to update sticky session after stream success:', err)
                )
              }
              return true
            } else {
              // 非流式请求
              result = await claudeConsoleRelayService.relayConsoleMessages(
                account.accountId,
                req.body,
                apiKeyId
              )

              // 检查响应状态
              if (result.status === 200 || result.status === 201) {
                logger.info(`✅ Console request succeeded with account ${account.name}`)

                // 更新粘性会话映射：确保后续请求继续使用同一账户以利用缓存
                if (sessionHash) {
                  this._updateStickySession(sessionHash, account, stickyAccountId).catch((err) =>
                    logger.error('Failed to update sticky session after non-stream success:', err)
                  )
                }

                // 记录非流式请求的 usage 统计
                if (result.data?.usage && usageCallback) {
                  try {
                    const usageData = {
                      ...result.data.usage,
                      accountId: account.accountId
                    }
                    usageCallback(usageData)
                  } catch (callbackError) {
                    logger.error('❌ Failed to execute usage callback:', callbackError)
                  }
                }

                // 返回成功响应
                res.status(result.status).json(result.data)
                return true
              }
            }

            // 非成功响应：记录错误并继续下一个账户
            // 多账户重试的核心逻辑：任何失败都尝试其他账户，账户异常状态由 relayConsoleMessages 内部标记
            lastError = {
              account,
              statusCode: result.status,
              errorCode: result.data?.error || 'UNKNOWN_ERROR',
              message: result.data?.message || 'Unknown error'
            }

            logger.warn(
              `⚠️ Console account ${account.name} returned ${result.status}, trying next...`
            )

            await onFailure(account, lastError, retryRound, maxRetries)
            continue
          } catch (error) {
            // 🚨 检查headers是否已发送（流式请求失败时）
            // 如果已发送，无法继续重试，必须抛出错误
            if (res.headersSent) {
              logger.error(
                `❌ Response headers already sent for account ${account.name}, cannot retry further.`
              )
              throw error
            }

            // 异常：记录并继续下一个账户
            // 优先使用流式错误中的详细信息（statusCode, errorCode）
            lastError = {
              account,
              statusCode: error.statusCode || null,
              errorCode: error.errorCode || error.code || 'EXCEPTION',
              message: error.message
            }

            logger.warn(
              `❌ Console account ${account.name} raised exception: [${lastError.errorCode}] ${error.message}${error.statusCode ? ` (HTTP ${error.statusCode})` : ''}, trying next...`
            )

            await onFailure(account, lastError, retryRound, maxRetries)
            continue
          }
        }

        // 该轮所有账户都失败
        logger.warn(
          `⚠️ All ${availableAccounts.length} Console accounts failed in round ${retryRound + 1}/${maxRetries}`
        )

        if (retryRound === maxRetries - 1) {
          // 已经是最后一轮
          throw new AllRetriesFailed('All Console account retry rounds exhausted', {
            accountId: lastError?.account?.accountId,
            accountName: lastError?.account?.name,
            errorCode: lastError?.errorCode,
            statusCode: lastError?.statusCode,
            originalMessage: lastError?.message,
            retryRound,
            maxRetries
          })
        }
      }
    } catch (error) {
      if (error instanceof AllRetriesFailed) {
        // 所有重试都失败
        logger.error(`❌ All Console account retry attempts exhausted for API Key ${apiKeyName}`)

        // 发送最终告警
        try {
          await requestFailureAlertService.sendAlert({
            apiKeyId,
            apiKeyName,
            accountId: error.accountId,
            accountName: error.accountName,
            accountType: 'claude-console',
            errorCode: error.errorCode || 'ALL_RETRIES_FAILED',
            statusCode: error.statusCode || 503,
            errorMessage: error.originalMessage || error.message,
            retryRound: error.maxRetries,
            maxRetries: error.maxRetries,
            isFinal: true
          })
        } catch (alertError) {
          logger.error('Failed to send final alert:', alertError)
        }

        // 返回503而非原始错误
        if (!res.headersSent) {
          res.status(503).json({
            error: 'service_unavailable',
            message:
              'Service temporarily unavailable. The system has attempted to process your request with all available Claude Console accounts.'
          })
        }
        return true
      }

      // 其他未预期的错误
      logger.error('Unexpected error in Console account retry:', error)

      try {
        await requestFailureAlertService.sendAlert({
          apiKeyId,
          apiKeyName,
          accountType: 'claude-console',
          errorCode: 'INTERNAL_ERROR',
          statusCode: 500,
          errorMessage: error.message
        })
      } catch (alertError) {
        logger.error('Failed to send error alert:', alertError)
      }

      if (!res.headersSent) {
        res.status(500).json({
          error: 'internal_server_error',
          message: 'An unexpected error occurred while processing your request.'
        })
      }
      return true
    }
  }

  /**
   * 获取所有可用的Claude Console账户
   * @param {Object} apiKeyData - API Key数据
   * @param {string} requestedModel - 请求的模型
   * @param {string|null} stickyAccountId - 粘性会话绑定的账户ID（优先使用）
   * @returns {Promise<Array>} 可用账户列表（粘性账户优先，其余按优先级排序）
   */
  async _getAvailableConsoleAccounts(apiKeyData, requestedModel = null, stickyAccountId = null) {
    try {
      // 使用unifiedClaudeScheduler的现有逻辑来获取Console账户
      const availableAccounts = await unifiedClaudeScheduler._getAllAvailableAccounts(
        apiKeyData,
        requestedModel,
        false
      )

      // 过滤出只有Console类型的账户
      const consoleAccounts = availableAccounts.filter(
        (acc) => acc.accountType === 'claude-console'
      )

      // 🔧 按优先级排序（复用调度器的排序逻辑，确保高优先级账户先被尝试）
      const sorted = unifiedClaudeScheduler._sortAccountsByPriority(consoleAccounts)

      // 🎯 粘性会话：将绑定的账户移到列表最前面，确保优先使用以利用缓存
      if (stickyAccountId) {
        const stickyIndex = sorted.findIndex((acc) => acc.accountId === stickyAccountId)
        if (stickyIndex > 0) {
          const [stickyAccount] = sorted.splice(stickyIndex, 1)
          sorted.unshift(stickyAccount)
          logger.info(
            `🎯 Sticky session: prioritized account ${stickyAccount.name} (${stickyAccountId}) for cache reuse`
          )
        } else if (stickyIndex === 0) {
          logger.debug(`🎯 Sticky session: account ${stickyAccountId} already first in list`)
        } else {
          logger.warn(
            `⚠️ Sticky session account ${stickyAccountId} not found in available accounts, falling back to priority order`
          )
        }
      }

      return sorted
    } catch (error) {
      logger.error('Failed to get available Console accounts:', error)
      return []
    }
  }

  /**
   * 更新粘性会话映射
   * 请求成功后调用：如果使用的是粘性绑定的账户则刷新活跃时间；
   * 如果是回退到其他账户，则更新映射到实际使用的账户
   * @param {string} sessionHash - 会话哈希
   * @param {Object} account - 实际成功使用的账户
   * @param {string|null} stickyAccountId - 原粘性绑定的账户ID
   */
  async _updateStickySession(sessionHash, account, stickyAccountId) {
    try {
      if (account.accountId === stickyAccountId) {
        // 使用的是粘性绑定的账户，刷新活跃时间
        await unifiedClaudeScheduler._updateSessionActivity(sessionHash, {
          accountId: account.accountId,
          accountType: 'claude-console'
        })
      } else {
        // 回退到了其他账户，更新映射
        // 先从旧账户的稳定会话反向索引中移除
        if (stickyAccountId) {
          await unifiedClaudeScheduler._removeFromStableAccountSessions(
            stickyAccountId,
            sessionHash
          )
        }
        await unifiedClaudeScheduler._setSessionMapping(
          sessionHash,
          account.accountId,
          'claude-console'
        )
        // 如果新账户是稳定账户，添加到反向索引
        if (account.isStableAccount) {
          await unifiedClaudeScheduler._addToStableAccountSessions(account.accountId, sessionHash)
        }
        logger.info(
          `🔄 Sticky session remapped: ${sessionHash.substring(0, 8)}... → ${account.name} (${account.accountId})`
        )
      }
    } catch (error) {
      logger.error('Failed to update sticky session mapping:', error)
    }
  }
}

module.exports = new ConsoleAccountRetryService()
