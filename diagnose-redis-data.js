#!/usr/bin/env node

/**
 * 直接从 Redis 读取数据诊断问题
 */

const Redis = require('ioredis')

async function diagnose() {
  console.log('\n' + '*'.repeat(70))
  console.log('🔍 Redis 数据诊断工具 - 检查周限截止时间')
  console.log('*'.repeat(70) + '\n')

  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  })

  try {
    // 1. 获取所有 API Key
    console.log('📌 步骤 1: 获取所有 API Keys...\n')
    const apiKeyKeys = await redis.keys('apikey:*')
    const apiKeyHashKeys = apiKeyKeys.filter((k) => !k.includes(':hash:'))

    console.log(`找到 ${apiKeyHashKeys.length} 个 API Keys\n`)

    if (apiKeyHashKeys.length === 0) {
      console.log('❌ 没有找到任何 API Key')
      redis.disconnect()
      return
    }

    // 2. 分析每个 API Key
    for (let i = 0; i < apiKeyHashKeys.length; i++) {
      const keyData = await redis.hgetall(apiKeyHashKeys[i])
      const keyId = apiKeyHashKeys[i].replace('apikey:', '')

      console.log('='.repeat(70))
      console.log(`📋 API Key #${i + 1}: ${keyData.name || 'Unnamed'}`)
      console.log('='.repeat(70))

      console.log(`\n🔑 基本信息:`)
      console.log(`  - ID: ${keyId}`)
      console.log(`  - Name: ${keyData.name}`)

      // 3. 获取周限制数据
      console.log(`\n💰 周限制数据:`)

      const weeklyCostLimit = parseFloat(keyData.weeklyCostLimit || 0)
      console.log(`  - weeklyCostLimit (Redis Hash): ${weeklyCostLimit}`)

      const weeklyCost = await redis.get(`usage:cost:weekly:total:${keyId}`)
      console.log(`  - weeklyCost (Redis Key): ${weeklyCost || 0}`)

      const weeklyWindowStart = await redis.get(`usage:cost:weekly:window_start:${keyId}`)
      console.log(`  - weekly window_start: ${weeklyWindowStart || 'NULL'}`)

      if (weeklyWindowStart) {
        const windowDuration = 7 * 24 * 60 * 60 * 1000
        const resetTime = new Date(parseInt(weeklyWindowStart) + windowDuration)
        const now = new Date()
        const diffMs = resetTime - now
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

        console.log(`\n⏰ 计算的重置时间:`)
        console.log(`  - 周期起点: ${new Date(parseInt(weeklyWindowStart)).toLocaleString('zh-CN')}`)
        console.log(`  - 重置时间: ${resetTime.toISOString()}`)
        console.log(`  - 本地时间: ${resetTime.toLocaleString('zh-CN')}`)
        console.log(`  - 距离现在: ${diffDays}天${diffHours}时`)
      } else {
        const defaultResetTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        console.log(`\n⏰ 默认重置时间 (无活跃周期):`)
        console.log(`  - ${defaultResetTime.toISOString()}`)
        console.log(`  - 本地时间: ${defaultResetTime.toLocaleString('zh-CN')}`)
      }

      // 4. 检查显示条件
      console.log(`\n🔍 前端显示条件检查:`)
      const shouldShow = weeklyCostLimit > 0 && (weeklyWindowStart || true)
      console.log(`  - weeklyCostLimit > 0: ${weeklyCostLimit > 0 ? '✅' : '❌'} (${weeklyCostLimit})`)
      console.log(`  - 有周期数据或使用默认值: ✅`)
      console.log(`  - 应该显示: ${shouldShow ? '✅ 是' : '❌ 否'}`)

      console.log('\n')
    }

    // 5. 总结
    console.log('='.repeat(70))
    console.log('📊 诊断总结')
    console.log('='.repeat(70) + '\n')

    let hasWeeklyLimit = 0
    for (const key of apiKeyHashKeys) {
      const keyData = await redis.hgetall(key)
      if (parseFloat(keyData.weeklyCostLimit || 0) > 0) {
        hasWeeklyLimit++
      }
    }

    console.log(`总 API Keys 数量: ${apiKeyHashKeys.length}`)
    console.log(`设置了周限制的: ${hasWeeklyLimit}`)

    if (hasWeeklyLimit === 0) {
      console.log('\n❌ 问题根源: 所有 API Key 的 weeklyCostLimit 都是 0!')
      console.log('\n💡 解决方案:')
      console.log('  1. 在管理界面编辑 API Key，设置"周费用限制"')
      console.log('  2. 或使用 Redis 命令设置: redis-cli HSET api_key:ID weeklyCostLimit 500')
    } else {
      console.log('\n✅ 有 API Key 设置了周限制，应该会显示')
    }

    console.log('\n' + '*'.repeat(70) + '\n')

  } catch (error) {
    console.error('\n❌ 诊断失败:', error.message)
    console.error(error)
  } finally {
    redis.disconnect()
  }
}

diagnose().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
