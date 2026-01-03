/**
 * 计算指数退避延迟时间
 * @param {number} retryCount 重试次数（0开始）
 * @param {number} baseDelay 基础延迟（ms）
 * @param {number} maxDelay 最大延迟（ms）
 * @returns {number} 延迟时间（ms）
 */
function calculateBackoffDelay(retryCount, baseDelay = 1000, maxDelay = 30000) {
  const delay = baseDelay * Math.pow(2, retryCount)
  return Math.min(delay, maxDelay)
}

/**
 * 睡眠函数
 * @param {number} ms 毫秒数
 * @returns {Promise<void>}
 */
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 使用指数退避进行重试
 * @param {Function} fn 要执行的异步函数
 * @param {Object} options 重试选项
 * @param {number} options.maxRetries 最大重试次数
 * @param {number} options.baseDelay 基础延迟（ms）
 * @param {number} options.maxDelay 最大延迟（ms）
 * @param {Function} options.onRetry 重试回调函数
 * @param {Function} options.shouldRetry 判断是否应该重试的函数
 * @returns {Promise} 函数执行结果
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    onRetry = null,
    shouldRetry = null
  } = options

  let lastError

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // 检查是否应该重试
      if (shouldRetry && !shouldRetry(error)) {
        throw error
      }

      // 如果是最后一次尝试，抛出错误
      if (attempt === maxRetries - 1) {
        throw error
      }

      // 计算延迟
      const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay)

      // 调用重试回调
      if (onRetry) {
        await onRetry(error, attempt + 1, delay)
      }

      // 等待延迟
      await sleep(delay)
    }
  }

  throw lastError
}

module.exports = {
  calculateBackoffDelay,
  sleep,
  retryWithBackoff
}
