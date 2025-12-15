#!/usr/bin/env node
/**
 * 清理孤立的账号使用统计数据
 *
 * 当删除账号时，account_usage:* 相关数据没有被清理，导致这些孤立数据会
 * 影响 Accounts 页面的加载性能（SCAN 操作需要遍历这些无用数据）。
 *
 * 此脚本会：
 * 1. 获取所有活跃账号的 ID（包括所有账号类型）
 * 2. 扫描所有 account_usage:* 键
 * 3. 识别不属于任何活跃账号的孤立数据
 * 4. 删除这些孤立数据
 *
 * 使用方法：
 *   node scripts/cleanup-orphaned-account-usage.js           # 干跑模式（只显示，不删除）
 *   node scripts/cleanup-orphaned-account-usage.js --execute # 实际执行删除
 */

const path = require('path')

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const Redis = require('ioredis')

// Redis 配置
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0
}

// 账号类型前缀映射
const ACCOUNT_TYPE_PREFIXES = {
  claude: 'claude:account:',
  claudeConsole: 'claude_console_account:',
  bedrock: 'bedrock_account:',
  gemini: 'gemini:account:',
  droid: 'droid:account:',
  ccr: 'ccr_account:',
  openaiResponses: 'openai_responses_account:',
  azureOpenai: 'azure_openai_account:',
  openai: 'openai_account:',
  geminiApi: 'gemini_api_account:'
}

// account_usage 相关的键模式
const ACCOUNT_USAGE_PATTERNS = ['account_usage:*', 'account:overload:*', 'concurrency:*']

async function scanKeys(client, pattern) {
  const keys = []
  let cursor = '0'

  do {
    const [nextCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 1000)
    cursor = nextCursor
    keys.push(...batch)
  } while (cursor !== '0')

  return keys
}

async function getAllActiveAccountIds(client) {
  const activeIds = new Set()

  console.log('\n正在获取所有活跃账号...')

  for (const [type, prefix] of Object.entries(ACCOUNT_TYPE_PREFIXES)) {
    // 先尝试从索引获取（如果存在）
    const indexKey = `${prefix}_index`
    const indexMembers = await client.smembers(indexKey)

    if (indexMembers.length > 0) {
      indexMembers.forEach((id) => activeIds.add(id))
      console.log(`  ${type}: ${indexMembers.length} 个账号（从索引）`)
    } else {
      // 回退到 SCAN
      const keys = await scanKeys(client, `${prefix}*`)
      const ids = keys.filter((k) => !k.endsWith('_index')).map((k) => k.replace(prefix, ''))
      ids.forEach((id) => activeIds.add(id))
      if (ids.length > 0) {
        console.log(`  ${type}: ${ids.length} 个账号（从 SCAN）`)
      }
    }
  }

  console.log(`\n总计活跃账号: ${activeIds.size} 个`)
  return activeIds
}

function extractAccountIdFromKey(key) {
  // account_usage:{accountId}
  // account_usage:daily:{accountId}:{date}
  // account_usage:monthly:{accountId}:{month}
  // account_usage:hourly:{accountId}:{hour}
  // account_usage:model:daily:{accountId}:{model}:{date}
  // account_usage:model:monthly:{accountId}:{model}:{month}
  // account_usage:model:hourly:{accountId}:{model}:{hour}
  // account:overload:{accountId}
  // concurrency:{accountId}

  if (key.startsWith('account_usage:model:')) {
    // account_usage:model:daily:{accountId}:{model}:{date}
    const parts = key.split(':')
    if (parts.length >= 4) {
      return parts[3]
    }
  } else if (
    key.startsWith('account_usage:daily:') ||
    key.startsWith('account_usage:monthly:') ||
    key.startsWith('account_usage:hourly:')
  ) {
    // account_usage:daily:{accountId}:{date}
    const parts = key.split(':')
    if (parts.length >= 3) {
      return parts[2]
    }
  } else if (key.startsWith('account_usage:')) {
    // account_usage:{accountId}
    const parts = key.split(':')
    if (parts.length >= 2) {
      return parts[1]
    }
  } else if (key.startsWith('account:overload:')) {
    // account:overload:{accountId}
    const parts = key.split(':')
    if (parts.length >= 3) {
      return parts[2]
    }
  } else if (key.startsWith('concurrency:')) {
    // concurrency:{accountId}
    const parts = key.split(':')
    if (parts.length >= 2) {
      return parts[1]
    }
  }

  return null
}

async function findOrphanedKeys(client, activeIds) {
  const orphanedKeys = []

  console.log('\n正在扫描孤立数据...')

  for (const pattern of ACCOUNT_USAGE_PATTERNS) {
    const keys = await scanKeys(client, pattern)
    console.log(`  ${pattern}: ${keys.length} 个键`)

    for (const key of keys) {
      const accountId = extractAccountIdFromKey(key)
      if (accountId && !activeIds.has(accountId)) {
        orphanedKeys.push({ key, accountId })
      }
    }
  }

  return orphanedKeys
}

async function main() {
  const executeMode = process.argv.includes('--execute')

  console.log('='.repeat(60))
  console.log('孤立账号使用数据清理工具')
  console.log('='.repeat(60))
  console.log(`模式: ${executeMode ? '执行删除' : '干跑模式（只显示，不删除）'}`)

  const client = new Redis(redisConfig)

  try {
    // 测试连接
    await client.ping()
    console.log('Redis 连接成功')

    // 获取所有活跃账号 ID
    const activeIds = await getAllActiveAccountIds(client)

    // 查找孤立数据
    const orphanedKeys = await findOrphanedKeys(client, activeIds)

    // 按账号 ID 分组统计
    const orphanedByAccount = {}
    for (const { key, accountId } of orphanedKeys) {
      if (!orphanedByAccount[accountId]) {
        orphanedByAccount[accountId] = []
      }
      orphanedByAccount[accountId].push(key)
    }

    console.log('\n' + '='.repeat(60))
    console.log('扫描结果')
    console.log('='.repeat(60))
    console.log(`发现 ${Object.keys(orphanedByAccount).length} 个已删除账号的残留数据`)
    console.log(`总计 ${orphanedKeys.length} 个孤立键`)

    if (orphanedKeys.length > 0) {
      console.log('\n孤立数据详情:')
      for (const [accountId, keys] of Object.entries(orphanedByAccount)) {
        console.log(`\n  账号 ID: ${accountId}`)
        console.log(`  孤立键数: ${keys.length}`)
        if (keys.length <= 5) {
          keys.forEach((k) => console.log(`    - ${k}`))
        } else {
          keys.slice(0, 3).forEach((k) => console.log(`    - ${k}`))
          console.log(`    ... 还有 ${keys.length - 3} 个`)
        }
      }

      if (executeMode) {
        console.log('\n' + '='.repeat(60))
        console.log('开始删除孤立数据...')
        console.log('='.repeat(60))

        // 批量删除
        const batchSize = 100
        let deletedCount = 0

        for (let i = 0; i < orphanedKeys.length; i += batchSize) {
          const batch = orphanedKeys.slice(i, i + batchSize).map((item) => item.key)
          await client.del(...batch)
          deletedCount += batch.length
          console.log(`  已删除 ${deletedCount}/${orphanedKeys.length} 个键...`)
        }

        console.log(`\n删除完成！共删除 ${deletedCount} 个孤立键`)
      } else {
        console.log('\n' + '-'.repeat(60))
        console.log('这是干跑模式，没有删除任何数据。')
        console.log('要实际执行删除，请运行:')
        console.log('  node scripts/cleanup-orphaned-account-usage.js --execute')
        console.log('-'.repeat(60))
      }
    } else {
      console.log('\n没有发现孤立数据，无需清理。')
    }
  } catch (error) {
    console.error('错误:', error.message)
    process.exit(1)
  } finally {
    await client.quit()
  }
}

main()
