const cron = require('node-cron')
const logger = require('../utils/logger')
const redis = require('../models/redis')

/**
 * 账户测试调度服务
 * 功能：
 * - 支持自定义 cron 表达式的定时测试
 * - 自动刷新配置（每60秒）
 * - 并发控制（最多3个测试同时进行）
 * - 测试失败自动标记账户为错误状态
 * - 发送 Webhook 通知
 * - 支持多平台：claude、claude-console、gemini
 */
class AccountTestSchedulerService {
  constructor() {
    this.tasks = new Map() // accountKey -> { task: ScheduledTask, cronExpression: string }
    this.isRunning = false
    this.refreshInterval = null
    this.supportedPlatforms = ['claude', 'claude-console', 'gemini']
    this.concurrentTests = new Set() // 追踪当前并发测试
    this.maxConcurrentTests = 3 // 最大并发测试数量
  }

  /**
   * 启动调度服务
   */
  async start() {
    if (this.isRunning) {
      logger.warn('⚠️ Account test scheduler is already running')
      return
    }

    logger.info('🚀 Starting account test scheduler service...')

    try {
      // 初始加载所有配置
      await this._refreshAllTasks()

      // 定期刷新配置（每60秒）
      this.refreshInterval = setInterval(async () => {
        try {
          await this._refreshAllTasks()
        } catch (error) {
          logger.error('❌ Failed to refresh account test tasks:', error)
        }
      }, 60000) // 60秒

      this.isRunning = true
      logger.success('✅ Account test scheduler service started')
    } catch (error) {
      logger.error('❌ Failed to start account test scheduler:', error)
      throw error
    }
  }

  /**
   * 停止调度服务
   */
  stop() {
    if (!this.isRunning) {
      return
    }

    logger.info('🛑 Stopping account test scheduler service...')

    // 停止刷新定时器
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = null
    }

    // 停止所有 cron 任务
    for (const [accountKey, { task }] of this.tasks.entries()) {
      try {
        task.stop()
        logger.info(`✅ Stopped task for ${accountKey}`)
      } catch (error) {
        logger.error(`❌ Failed to stop task for ${accountKey}:`, error)
      }
    }

    this.tasks.clear()
    this.isRunning = false
    logger.success('✅ Account test scheduler service stopped')
  }

  /**
   * 验证 cron 表达式
   */
  validateCronExpression(cronExpression) {
    try {
      if (!cronExpression || typeof cronExpression !== 'string') {
        return { valid: false, message: 'Cron expression is required and must be a string' }
      }

      const isValid = cron.validate(cronExpression)
      if (!isValid) {
        return { valid: false, message: 'Invalid cron expression format' }
      }

      return { valid: true }
    } catch (error) {
      return { valid: false, message: error.message }
    }
  }

  /**
   * 手动触发测试（用于 UI 测试按钮）
   */
  async triggerTest(accountId, platform, model) {
    try {
      logger.info(`🔍 Manually triggering test for ${platform}:${accountId}`)

      // 检查并发限制
      if (this.concurrentTests.size >= this.maxConcurrentTests) {
        logger.warn(`⚠️ Max concurrent tests (${this.maxConcurrentTests}) reached, queueing...`)
      }

      await this._runAccountTest(accountId, platform, model)
      return { success: true }
    } catch (error) {
      logger.error(`❌ Manual test failed for ${platform}:${accountId}:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 刷新所有测试任务
   */
  async _refreshAllTasks() {
    try {
      const allEnabledAccounts = []

      // 从 Redis 加载所有平台的启用账户
      for (const platform of this.supportedPlatforms) {
        const accounts = await redis.getEnabledTestAccounts(platform)
        allEnabledAccounts.push(...accounts)
      }

      logger.info(`🔄 Refreshing test tasks: ${allEnabledAccounts.length} enabled accounts found`)

      // 跟踪当前应该存在的 task
      const currentAccountKeys = new Set()

      // 创建或更新任务
      for (const { accountId, platform, config } of allEnabledAccounts) {
        const accountKey = `${platform}:${accountId}`
        currentAccountKeys.add(accountKey)

        const { cronExpression, model } = config

        // 验证 cron 表达式
        const validation = this.validateCronExpression(cronExpression)
        if (!validation.valid) {
          logger.error(`❌ Invalid cron expression for ${accountKey}: ${validation.message}`)
          continue
        }

        // 检查是否需要更新任务
        const existingTask = this.tasks.get(accountKey)
        if (existingTask && existingTask.cronExpression === cronExpression) {
          // cron 表达式未变化，跳过
          continue
        }

        // 停止旧任务（如果存在）
        if (existingTask) {
          existingTask.task.stop()
          logger.info(`🔄 Updating task for ${accountKey}`)
        }

        // 创建新任务
        await this._createOrUpdateTask(accountKey, cronExpression, () =>
          this._runAccountTest(accountId, platform, model)
        )
      }

      // 移除不再需要的任务
      for (const [accountKey, { task }] of this.tasks.entries()) {
        if (!currentAccountKeys.has(accountKey)) {
          task.stop()
          this.tasks.delete(accountKey)
          logger.info(`🗑️ Removed task for ${accountKey} (disabled or deleted)`)
        }
      }
    } catch (error) {
      logger.error('❌ Failed to refresh tasks:', error)
    }
  }

  /**
   * 创建或更新 cron 任务
   */
  async _createOrUpdateTask(accountKey, cronExpression, testFn) {
    try {
      // 创建 cron 任务
      const task = cron.schedule(
        cronExpression,
        async () => {
          try {
            logger.info(`⏰ Cron triggered test for ${accountKey}`)
            await testFn()
          } catch (error) {
            logger.error(`❌ Cron task execution failed for ${accountKey}:`, error)
          }
        },
        {
          scheduled: true,
          timezone: 'Asia/Shanghai' // 可配置时区
        }
      )

      this.tasks.set(accountKey, { task, cronExpression })
      logger.success(`✅ Created cron task for ${accountKey} with schedule: ${cronExpression}`)
    } catch (error) {
      logger.error(`❌ Failed to create task for ${accountKey}:`, error)
    }
  }

  /**
   * 执行账户测试（带并发控制）
   */
  async _runAccountTest(accountId, platform, model) {
    const accountKey = `${platform}:${accountId}`

    // 防止同一账户的重叠测试
    if (this.concurrentTests.has(accountKey)) {
      logger.warn(`⚠️ Test for ${accountKey} is already running, skipping.`)
      return
    }

    // 等待并发限制
    while (this.concurrentTests.size >= this.maxConcurrentTests) {
      logger.info(
        `⏳ Waiting for concurrent test slot (${this.concurrentTests.size}/${this.maxConcurrentTests})`
      )
      await new Promise((resolve) => setTimeout(resolve, 5000)) // 等5秒后重试
    }

    this.concurrentTests.add(accountKey)

    try {
      logger.info(`🧪 Running test for ${accountKey}`)

      const startTime = Date.now()
      let result

      // 根据平台调用不同的测试方法
      switch (platform) {
        case 'claude':
          result = await this._testClaudeAccount(accountId, model)
          break
        case 'claude-console':
          result = await this._testClaudeConsoleAccount(accountId, model)
          break
        case 'gemini':
          result = await this._testGeminiAccount(accountId, model)
          break
        default:
          throw new Error(`Unsupported platform: ${platform}`)
      }

      const duration = Date.now() - startTime

      // 保存测试结果
      await redis.saveAccountTestResult(accountId, platform, {
        timestamp: new Date().toISOString(),
        success: result.success,
        error: result.error || '',
        duration,
        usage: result.usage || {}
      })

      // 更新最后测试时间
      await redis.setAccountLastTestTime(accountId, platform, new Date().toISOString())

      if (result.success) {
        logger.success(`✅ Test passed for ${accountKey} (${duration}ms)`)
      } else {
        logger.error(`❌ Test failed for ${accountKey}: ${result.error}`)

        // 标记账户为错误状态
        await this._markAccountAsError(accountId, platform, result.error)

        // 停止该账户的定时任务
        const task = this.tasks.get(accountKey)
        if (task) {
          task.task.stop()
          this.tasks.delete(accountKey)
          logger.info(`🛑 Stopped task for ${accountKey} due to test failure`)
        }
      }
    } catch (error) {
      logger.error(`❌ Test execution failed for ${accountKey}:`, error)

      // 保存失败结果
      await redis.saveAccountTestResult(accountId, platform, {
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message,
        duration: 0
      })

      // 标记账户为错误状态
      await this._markAccountAsError(accountId, platform, error.message)
    } finally {
      this.concurrentTests.delete(accountKey)
    }
  }

  /**
   * 测试 Claude 官方账户
   */
  async _testClaudeAccount(accountId, model) {
    try {
      const claudeRelayService = require('./claudeRelayService')
      return await claudeRelayService.testAccountConnectionSync(accountId, model)
    } catch (error) {
      logger.error(`❌ Claude test failed for ${accountId}:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 测试 Claude Console 账户
   */
  async _testClaudeConsoleAccount(accountId, model) {
    try {
      const claudeConsoleRelayService = require('./claudeConsoleRelayService')
      return await claudeConsoleRelayService.testAccountConnectionSync(accountId, model)
    } catch (error) {
      logger.error(`❌ Claude Console test failed for ${accountId}:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 测试 Gemini 账户
   */
  async _testGeminiAccount(accountId, model) {
    try {
      const geminiAccountService = require('./geminiAccountService')

      // 检查是否有 testAccount 方法
      if (typeof geminiAccountService.testAccount === 'function') {
        return await geminiAccountService.testAccount(accountId, model)
      }

      // 如果没有 testAccount 方法，使用基础连接测试
      logger.warn(`⚠️ geminiAccountService.testAccount not found, using basic test`)
      const account = await redis.getAccount('gemini', accountId)
      if (!account || account.status !== 'active') {
        return { success: false, error: 'Account not found or not active' }
      }

      return { success: true }
    } catch (error) {
      logger.error(`❌ Gemini test failed for ${accountId}:`, error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 标记账户为错误状态
   */
  async _markAccountAsError(accountId, platform, errorMessage) {
    try {
      logger.warn(`⚠️ Marking ${platform}:${accountId} as error due to test failure`)

      // 获取账户数据
      const account = await redis.getAccount(platform, accountId)
      if (!account) {
        logger.error(`❌ Account not found: ${platform}:${accountId}`)
        return
      }

      // 更新账户状态
      await redis.updateAccount(platform, accountId, {
        status: 'error',
        isActive: false,
        schedulable: false,
        errorMessage: `Scheduled test failed: ${errorMessage}`,
        lastError: new Date().toISOString()
      })

      logger.success(`✅ Account ${platform}:${accountId} marked as error`)

      // 发送 Webhook 通知
      try {
        const webhookService = require('./webhookService')
        if (typeof webhookService.notifyAccountTestFailed === 'function') {
          await webhookService.notifyAccountTestFailed(accountId, platform, errorMessage)
        } else {
          logger.warn('⚠️ webhookService.notifyAccountTestFailed not found')
        }
      } catch (webhookError) {
        logger.error('❌ Failed to send webhook notification:', webhookError)
      }
    } catch (error) {
      logger.error(`❌ Failed to mark account as error:`, error)
    }
  }
}

// 导出单例
const schedulerService = new AccountTestSchedulerService()
module.exports = schedulerService
