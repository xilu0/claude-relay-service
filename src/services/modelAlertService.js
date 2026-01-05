/**
 * Model Alert Service
 * Handles detection and alerting for non-Claude model responses from Console accounts
 */

const config = require('../../config/config')
const logger = require('../utils/logger')
const redis = require('../models/redis')
const webhookService = require('./webhookService')
const { isValidClaudeModel, CLAUDE_MODEL_KEYWORDS } = require('../utils/modelValidator')
const { getISOStringWithTimezone } = require('../utils/dateHelper')

class ModelAlertService {
  constructor() {
    this.throttleKeyPrefix = 'model_alert_throttle:'
    this.throttleTTL = 60 // 1 minute rate limit
  }

  /**
   * Check model validity and send alert if invalid
   * This is the main entry point called from relay services
   *
   * @param {Object} context - Alert context
   * @param {string} context.modelName - The detected model name
   * @param {string} context.apiKeyName - API Key name for identification
   * @param {string} [context.apiKeyId] - Optional API Key ID
   * @param {string} context.accountId - Console account ID
   * @param {string} context.accountName - Console account name
   * @returns {Promise<void>}
   */
  async checkAndAlert(context) {
    // Feature toggle check
    if (!config.consoleModelAlert?.enabled) {
      logger.debug('🔕 Console model alert feature is disabled')
      return
    }

    const { modelName, apiKeyName, apiKeyId, accountId, accountName } = context

    // Validate model
    if (isValidClaudeModel(modelName)) {
      // Valid Claude model, no alert needed
      return
    }

    // Model is invalid - check rate limit before sending alert
    const canAlert = await this.canSendAlert(accountId)
    if (!canAlert) {
      logger.debug(
        `🔕 Model alert suppressed for account ${accountName} (${accountId}) - rate limited`
      )
      return
    }

    // Build and send alert
    const alertData = this.buildAlertPayload({
      modelName,
      apiKeyName,
      apiKeyId,
      accountId,
      accountName
    })

    logger.warn(
      `⚠️ Non-Claude model detected: "${modelName}" for account ${accountName} (${accountId}), sending alert`
    )

    await webhookService.sendNotification('modelAnomaly', alertData)
  }

  /**
   * Check if alert can be sent (rate limit check)
   * Uses Redis SET NX EX for atomic rate limiting
   *
   * @param {string} accountId - Account ID to check
   * @returns {Promise<boolean>} True if alert can be sent, false if rate limited
   */
  async canSendAlert(accountId) {
    const throttleKey = `${this.throttleKeyPrefix}${accountId}`
    // SET key "1" EX 60 NX - returns OK if set, null if exists
    const client = redis.getClientSafe()
    const result = await client.set(throttleKey, '1', 'EX', this.throttleTTL, 'NX')
    return result === 'OK'
  }

  /**
   * Build the ModelAlertEvent payload for webhook notification
   *
   * @param {Object} params - Payload parameters
   * @param {string} params.modelName - Detected model name
   * @param {string} params.apiKeyName - API Key name
   * @param {string} [params.apiKeyId] - Optional API Key ID
   * @param {string} params.accountId - Console account ID
   * @param {string} params.accountName - Console account name
   * @returns {Object} ModelAlertEvent payload
   */
  buildAlertPayload({ modelName, apiKeyName, apiKeyId, accountId, accountName }) {
    const payload = {
      apiKeyName,
      accountId,
      accountName,
      detectedModel: modelName || '(empty)',
      expectedModels: CLAUDE_MODEL_KEYWORDS,
      timestamp: getISOStringWithTimezone(new Date())
    }

    // Add optional apiKeyId if provided
    if (apiKeyId) {
      payload.apiKeyId = apiKeyId
    }

    return payload
  }
}

module.exports = new ModelAlertService()
