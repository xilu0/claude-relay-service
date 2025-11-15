const redis = require('../models/redis')
const pricingService = require('../services/pricingService')
const CostCalculator = require('./costCalculator')

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

async function updateRateLimitCounters(rateLimitInfo, usageSummary, model, useBooster = false) {
  if (!rateLimitInfo) {
    return { totalTokens: 0, totalCost: 0 }
  }

  const client = redis.getClient()
  if (!client) {
    throw new Error('Redis 未连接，无法更新限流计数')
  }

  const inputTokens = toNumber(usageSummary.inputTokens)
  const outputTokens = toNumber(usageSummary.outputTokens)
  const cacheCreateTokens = toNumber(usageSummary.cacheCreateTokens)
  const cacheReadTokens = toNumber(usageSummary.cacheReadTokens)

  const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens

  // 使用加油包时，不更新时间窗口的 token 计数
  if (totalTokens > 0 && rateLimitInfo.tokenCountKey && !useBooster) {
    await client.incrby(rateLimitInfo.tokenCountKey, Math.round(totalTokens))
  }

  let totalCost = 0
  const usagePayload = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: cacheCreateTokens,
    cache_read_input_tokens: cacheReadTokens
  }

  try {
    const costInfo = pricingService.calculateCost(usagePayload, model)
    const { totalCost: calculatedCost } = costInfo || {}
    if (typeof calculatedCost === 'number') {
      totalCost = calculatedCost
    }
  } catch (error) {
    // 忽略此处错误，后续使用备用计算
    totalCost = 0
  }

  if (totalCost === 0) {
    try {
      const fallback = CostCalculator.calculateCost(usagePayload, model)
      const { costs } = fallback || {}
      if (costs && typeof costs.total === 'number') {
        totalCost = costs.total
      }
    } catch (error) {
      totalCost = 0
    }
  }

  // 使用加油包时，不更新时间窗口的成本计数
  if (totalCost > 0 && rateLimitInfo.costCountKey && !useBooster) {
    await client.incrbyfloat(rateLimitInfo.costCountKey, totalCost)

    // 同时激活周限窗口（确保逻辑一致性）
    // 从 costCountKey 提取 keyId: rate_limit:cost:{keyId}
    const keyId = rateLimitInfo.costCountKey.split(':')[2]
    if (keyId) {
      const weeklyWindowKey = `usage:cost:weekly:window_start:${keyId}`
      const exists = await client.exists(weeklyWindowKey)

      if (!exists) {
        // 首次使用，创建周限窗口
        const now = Date.now()
        const windowDuration = 7 * 24 * 60 * 60 * 1000 // 7天
        await client.set(weeklyWindowKey, now, 'PX', windowDuration)
        await client.set(`usage:cost:weekly:total:${keyId}`, 0, 'PX', windowDuration)
      }
    }
  }

  return { totalTokens, totalCost }
}

module.exports = {
  updateRateLimitCounters
}
