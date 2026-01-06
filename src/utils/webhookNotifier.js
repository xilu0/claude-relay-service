const logger = require('./logger')
const webhookService = require('../services/webhookService')
const { getISOStringWithTimezone } = require('./dateHelper')

class WebhookNotifier {
  constructor() {
    // 保留此类用于兼容性，实际功能委托给webhookService
  }

  /**
   * 发送账号异常通知
   * @param {Object} notification - 通知内容
   * @param {string} notification.accountId - 账号ID
   * @param {string} notification.accountName - 账号名称
   * @param {string} notification.platform - 平台类型 (claude-oauth, claude-console, gemini)
   * @param {string} notification.status - 异常状态 (unauthorized, blocked, error)
   * @param {string} notification.errorCode - 异常代码
   * @param {string} notification.reason - 异常原因
   * @param {string} notification.timestamp - 时间戳
   */
  async sendAccountAnomalyNotification(notification) {
    try {
      // 使用新的webhookService发送通知
      await webhookService.sendNotification('accountAnomaly', {
        accountId: notification.accountId,
        accountName: notification.accountName,
        platform: notification.platform,
        status: notification.status,
        errorCode:
          notification.errorCode || this._getErrorCode(notification.platform, notification.status),
        reason: notification.reason,
        timestamp: notification.timestamp || getISOStringWithTimezone(new Date())
      })
    } catch (error) {
      logger.error('Failed to send account anomaly notification:', error)
    }
  }

  /**
   * 测试Webhook连通性（兼容旧接口）
   * @param {string} url - Webhook URL
   * @param {string} type - 平台类型（可选）
   */
  async testWebhook(url, type = 'custom') {
    try {
      // 创建临时平台配置
      const platform = {
        type,
        url,
        enabled: true,
        timeout: 10000
      }

      const result = await webhookService.testWebhook(platform)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 发送账号事件通知
   * @param {string} eventType - 事件类型 (account.created, account.updated, account.deleted, account.status_changed)
   * @param {Object} data - 事件数据
   */
  async sendAccountEvent(eventType, data) {
    try {
      // 使用webhookService发送通知
      await webhookService.sendNotification('accountEvent', {
        eventType,
        ...data,
        timestamp: data.timestamp || getISOStringWithTimezone(new Date())
      })
    } catch (error) {
      logger.error(`Failed to send account event (${eventType}):`, error)
    }
  }

  /**
   * 获取错误代码映射
   * @param {string} platform - 平台类型
   * @param {string} status - 状态
   * @param {string} _reason - 原因 (未使用)
   */
  _getErrorCode(platform, status, _reason) {
    const errorCodes = {
      'claude-oauth': {
        unauthorized: 'CLAUDE_OAUTH_UNAUTHORIZED',
        blocked: 'CLAUDE_OAUTH_BLOCKED',
        error: 'CLAUDE_OAUTH_ERROR',
        disabled: 'CLAUDE_OAUTH_MANUALLY_DISABLED'
      },
      'claude-console': {
        blocked: 'CLAUDE_CONSOLE_BLOCKED',
        error: 'CLAUDE_CONSOLE_ERROR',
        disabled: 'CLAUDE_CONSOLE_MANUALLY_DISABLED'
      },
      gemini: {
        error: 'GEMINI_ERROR',
        unauthorized: 'GEMINI_UNAUTHORIZED',
        disabled: 'GEMINI_MANUALLY_DISABLED'
      },
      openai: {
        error: 'OPENAI_ERROR',
        unauthorized: 'OPENAI_UNAUTHORIZED',
        blocked: 'OPENAI_RATE_LIMITED',
        disabled: 'OPENAI_MANUALLY_DISABLED'
      }
    }

    return errorCodes[platform]?.[status] || 'UNKNOWN_ERROR'
  }

  /**
   * 发送请求失败告警
   * @param {Object} options - 告警选项
   * @param {string} options.apiKeyId - API Key ID
   * @param {string} options.apiKeyName - API Key名称
   * @param {string} options.accountId - 账户ID
   * @param {string} options.accountName - 账户名称
   * @param {string} options.errorCode - 错误代码
   * @param {number} options.statusCode - HTTP状态码
   * @param {string} options.errorMessage - 错误消息
   * @param {number} options.retryRound - 重试轮数
   * @param {number} options.maxRetries - 最大重试次数
   * @param {boolean} options.isFinal - 是否为最终失败
   */
  async sendRequestFailureAlert(options) {
    try {
      const {
        apiKeyId,
        apiKeyName,
        accountId,
        accountName,
        accountType,
        errorCode,
        statusCode,
        errorMessage,
        retryRound = 'N/A',
        maxRetries = 'N/A',
        isFinal = false
      } = options

      // 判断账户选择状态
      const hasAccountInfo = accountId && accountId !== 'N/A'
      const accountStatus = hasAccountInfo ? '已选择账户' : '未选择到账户（错误发生在账户选择阶段）'

      const alertMessage = {
        timestamp: getISOStringWithTimezone(new Date()),
        type: 'request_failure_alert',
        isFinal,
        retry: {
          round: retryRound,
          maxRetries
        },
        apiKey: {
          id: apiKeyId,
          name: apiKeyName
        },
        account: {
          id: accountId || null,
          name: accountName || null,
          type: accountType || 'unknown',
          status: accountStatus
        },
        error: {
          code: errorCode,
          httpStatus: statusCode || 'N/A',
          message: errorMessage
        }
      }

      // 使用webhookService发送通知
      await webhookService.sendNotification('request_failure_alert', alertMessage)
    } catch (error) {
      logger.error('Failed to send request failure alert:', error)
      // 告警失败不应影响请求处理
    }
  }
}

module.exports = new WebhookNotifier()
