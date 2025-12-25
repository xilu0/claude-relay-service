#!/usr/bin/env node
/**
 * 构建 API Key 索引
 *
 * 用于一次性迁移：从现有 apikey:* 数据构建 apikey:index 索引
 * 优化分页查询性能，将 O(N) 次 Redis 命令降低到 O(1)
 *
 * 用法:
 *   node scripts/build-apikey-index.js              # 本地执行
 *   node scripts/build-apikey-index.js --dry-run    # 干跑模式，不实际写入
 *   node scripts/build-apikey-index.js --force      # 强制重建（先删除现有索引）
 *
 * 远程执行（通过 API）:
 *   curl -X POST https://your-server/admin/rebuild-apikey-index \
 *     -H "Authorization: Bearer <token>"
 */

require('dotenv').config()
const redis = require('../src/models/redis')

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isForce = args.includes('--force')

async function main() {
  console.log('🔧 API Key 索引构建工具')
  console.log('='.repeat(50))

  if (isDryRun) {
    console.log('⚠️  干跑模式：不会实际写入数据\n')
  }

  try {
    // 连接 Redis
    await redis.connect()
    console.log('✅ Redis 连接成功\n')

    // 检查现有索引
    const existingIndex = await redis.client.hgetall('apikey:index')
    const existingCount = existingIndex ? Object.keys(existingIndex).length : 0

    if (existingCount > 0) {
      console.log(`📊 现有索引包含 ${existingCount} 条记录`)

      if (isForce) {
        console.log('🗑️  强制模式：删除现有索引...')
        if (!isDryRun) {
          await redis.client.del('apikey:index')
        }
        console.log('✅ 现有索引已删除\n')
      } else {
        console.log('ℹ️  使用 --force 参数可强制重建索引\n')
      }
    }

    // 扫描所有 API Keys
    console.log('📡 扫描 API Keys...')
    const keys = await redis.scanKeys('apikey:*')
    const apiKeyIds = keys.filter((k) => k !== 'apikey:hash_map' && k !== 'apikey:index')

    console.log(`📋 找到 ${apiKeyIds.length} 个 API Keys\n`)

    if (apiKeyIds.length === 0) {
      console.log('⚠️  没有需要索引的 API Keys')
      await redis.disconnect()
      process.exit(0)
    }

    // 构建索引
    console.log('🔨 构建索引...')
    let successCount = 0
    let errorCount = 0

    for (const key of apiKeyIds) {
      const keyId = key.replace('apikey:', '')

      try {
        const keyData = await redis.client.hgetall(key)

        if (keyData && Object.keys(keyData).length > 0) {
          if (!isDryRun) {
            await redis.updateApiKeyIndex(keyId, keyData)
          }
          successCount++

          // 每 100 条打印进度
          if (successCount % 100 === 0) {
            console.log(`   已处理 ${successCount}/${apiKeyIds.length}...`)
          }
        }
      } catch (error) {
        console.error(`   ❌ 处理 ${keyId} 失败:`, error.message)
        errorCount++
      }
    }

    console.log(`\n${'='.repeat(50)}`)
    console.log('📊 构建完成:')
    console.log(`   ✅ 成功: ${successCount}`)
    console.log(`   ❌ 失败: ${errorCount}`)

    if (isDryRun) {
      console.log('\n⚠️  干跑模式：未实际写入数据')
      console.log('   移除 --dry-run 参数以执行实际迁移')
    } else {
      // 验证索引
      const newIndex = await redis.client.hgetall('apikey:index')
      const newCount = newIndex ? Object.keys(newIndex).length : 0
      console.log(`\n✅ 索引已创建，共 ${newCount} 条记录`)
    }
  } catch (error) {
    console.error('\n❌ 执行失败:', error.message)
    process.exit(1)
  } finally {
    await redis.disconnect()
    console.log('\n👋 完成')
    process.exit(0)
  }
}

main()
