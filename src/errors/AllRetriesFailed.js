/**
 * 所有重试都失败的错误类
 */
class AllRetriesFailed extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'AllRetriesFailed'

    const {
      accountId,
      accountName,
      errorCode,
      statusCode,
      originalMessage,
      retryRound,
      maxRetries
    } = options

    this.accountId = accountId
    this.accountName = accountName
    this.errorCode = errorCode
    this.statusCode = statusCode
    this.originalMessage = originalMessage
    this.retryRound = retryRound
    this.maxRetries = maxRetries
  }
}

module.exports = AllRetriesFailed
