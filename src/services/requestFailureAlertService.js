/**
 * Request Failure Alert Service
 * Handles detection and alerting for API request failures across all account types
 * Includes rate limiting to prevent alert storms
 */

const logger = require('../utils/logger')
const redis = require('../models/redis')
const webhookNotifier = require('../utils/webhookNotifier')

class RequestFailureAlertService {
  constructor() {
    this.throttleKeyPrefix = 'request_failure_throttle:'
    // Default 60 seconds, configurable via environment variable
    this.throttleTTL = parseInt(process.env.REQUEST_FAILURE_ALERT_THROTTLE_TTL) || 60
  }

  /**
   * Send request failure alert with rate limiting
   * Rate limit key: {apiKeyId}:{accountType} - 1 alert per combination per minute
   *
   * @param {Object} options - Alert options
   * @param {string} options.apiKeyId - API Key ID
   * @param {string} options.apiKeyName - API Key name
   * @param {string} [options.accountId] - Account ID (optional)
   * @param {string} [options.accountName] - Account name (optional)
   * @param {string} options.accountType - Account type (claude-official, claude-console, gemini, etc.)
   * @param {string} options.errorCode - Error code
   * @param {number} [options.statusCode] - HTTP status code
   * @param {string} options.errorMessage - Error message
   * @returns {Promise<boolean>} True if alert was sent, false if rate limited
   */
  async sendAlert(options) {
    // Feature toggle check
    if (process.env.REQUEST_FAILURE_ALERT_ENABLED === 'false') {
      logger.debug('🔕 Request failure alert feature is disabled')
      return false
    }

    const {
      apiKeyId,
      apiKeyName,
      accountId,
      accountName,
      accountType,
      errorCode,
      statusCode,
      errorMessage
    } = options

    // Skip if no API key info (shouldn't happen but be safe)
    if (!apiKeyId) {
      logger.debug('🔕 Request failure alert skipped - no API key ID')
      return false
    }

    // Rate limit check: per API key + account type combination
    const canAlert = await this.canSendAlert(apiKeyId, accountType)
    if (!canAlert) {
      logger.debug(
        `🔕 Request failure alert suppressed for ${apiKeyName} + ${accountType} - rate limited (${this.throttleTTL}s window)`
      )
      return false
    }

    // Log the alert being sent
    logger.warn(
      `🔴 Sending request failure alert: API Key "${apiKeyName}", Account Type "${accountType}", Error: ${errorCode} (${statusCode || 'N/A'})`
    )

    // Send alert via webhookNotifier
    try {
      await webhookNotifier.sendRequestFailureAlert({
        apiKeyId,
        apiKeyName,
        accountId,
        accountName,
        accountType,
        errorCode,
        statusCode,
        errorMessage
      })
      return true
    } catch (error) {
      logger.error('Failed to send request failure alert:', error)
      return false
    }
  }

  /**
   * Check if alert can be sent (rate limit check)
   * Uses Redis SET NX EX for atomic rate limiting
   *
   * @param {string} apiKeyId - API Key ID
   * @param {string} accountType - Account type
   * @returns {Promise<boolean>} True if alert can be sent, false if rate limited
   */
  async canSendAlert(apiKeyId, accountType) {
    const throttleKey = `${this.throttleKeyPrefix}${apiKeyId}:${accountType}`
    try {
      // SET key "1" EX ttl NX - returns OK if set, null if exists
      const client = redis.getClientSafe()
      const result = await client.set(throttleKey, '1', 'EX', this.throttleTTL, 'NX')
      return result === 'OK'
    } catch (error) {
      logger.error('Failed to check rate limit for request failure alert:', error)
      // On error, allow the alert to go through (fail open for alerting)
      return true
    }
  }
}

module.exports = new RequestFailureAlertService()
