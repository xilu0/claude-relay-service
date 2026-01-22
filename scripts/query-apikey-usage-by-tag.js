#!/usr/bin/env node
/**
 * 查询指定标签的 API Key 在某日的美金使用量
 *
 * 用法: node scripts/query-apikey-usage-by-tag.js -t <tag> [-d <date>] [-r <redis_url>]
 *
 * 参数:
 *   -t, --tag          标签名称 (必填，如: ultra, max, pro, free)
 *   -d, --date         查询日期 (格式: YYYY-MM-DD，默认: 昨天)
 *   -r, --redis        Redis URL (默认: redis://localhost:6379)
 *   --help             显示帮助
 *
 * 示例:
 *   node scripts/query-apikey-usage-by-tag.js -t ultra -r redis://127.0.0.1:6380
 *   node scripts/query-apikey-usage-by-tag.js -t pro -d 2026-01-13
 *   node scripts/query-apikey-usage-by-tag.js -t free
 *   ssh -v -N -L 6380:localhost:6379 cc2
 *
 * 注意: 脚本会自动分批查询所有匹配的 API Keys（每批 50 个），对用户透明
 */

const Redis = require('ioredis')

// ========== 参数解析 ==========
function buildRedisUrl() {
  // 优先使用 REDIS_URL，否则从 REDIS_HOST/PORT/PASSWORD 构建
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL
  }
  const host = process.env.REDIS_HOST || 'localhost'
  const port = process.env.REDIS_PORT || '6379'
  const password = process.env.REDIS_PASSWORD
  if (password) {
    return `redis://:${password}@${host}:${port}`
  }
  return `redis://${host}:${port}`
}

function parseArgs() {
  const args = process.argv.slice(2)
  const config = {
    tag: null,
    date: null, // 默认昨天，在 main 中计算
    redis: buildRedisUrl()
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]

    switch (arg) {
      case '-t':
      case '--tag':
        config.tag = next
        i++
        break
      case '-d':
      case '--date':
        config.date = next
        i++
        break
      case '-r':
      case '--redis':
        config.redis = next
        i++
        break
      case '--help':
        showHelp()
        process.exit(0)
    }
  }

  return config
}

function showHelp() {
  console.log(`
查询指定标签的 API Key 在某日的美金使用量

用法: node scripts/query-apikey-usage-by-tag.js -t <tag> [options]

参数:
  -t, --tag          标签名称 (必填，如: ultra, max, pro, free)
  -d, --date         查询日期 (格式: YYYY-MM-DD，默认: 昨天)
  -r, --redis        Redis URL (默认: redis://localhost:6379)
  --help             显示帮助

示例:
  node scripts/query-apikey-usage-by-tag.js -t ultra
  node scripts/query-apikey-usage-by-tag.js -t pro -d 2026-01-13
  node scripts/query-apikey-usage-by-tag.js -t free -r redis://127.0.0.1:6380

输出说明:
  - 自动查询所有匹配标签的 API Keys（分批处理，对用户透明）
  - 显示每个 API Key 的当日费用
  - 计算总费用和平均费用
  - 按费用从高到低排序
`)
}

// ========== 工具函数 ==========
// 时区偏移（默认 UTC+8，与服务端保持一致）
const TIMEZONE_OFFSET = parseInt(process.env.TIMEZONE_OFFSET) || 8

function getDateInTimezone(date = new Date()) {
  const offsetMs = TIMEZONE_OFFSET * 3600000
  return new Date(date.getTime() + offsetMs)
}

function getDateStringInTimezone(date = new Date()) {
  const tzDate = getDateInTimezone(date)
  return `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}-${String(tzDate.getUTCDate()).padStart(2, '0')}`
}

function getYesterdayString() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return getDateStringInTimezone(yesterday)
}

function validateDateFormat(dateStr) {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateStr)) {
    return false
  }
  const date = new Date(dateStr)
  return date instanceof Date && !isNaN(date)
}

// ========== 主逻辑 ==========
async function main() {
  const config = parseArgs()

  // 验证必填参数
  if (!config.tag) {
    console.error('❌ 错误: 必须提供标签名称 (-t)')
    console.error('   使用 --help 查看帮助')
    process.exit(1)
  }

  // 设置默认日期为昨天
  if (!config.date) {
    config.date = getYesterdayString()
  }

  // 验证日期格式
  if (!validateDateFormat(config.date)) {
    console.error(`❌ 错误: 日期格式无效 (${config.date})，请使用 YYYY-MM-DD 格式`)
    process.exit(1)
  }

  let redis
  try {
    redis = new Redis(config.redis, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100
    })

    console.log(`🔗 连接 Redis: ${config.redis}`)

    // 1. 获取所有 API Keys（使用索引优化）
    console.log(`🔍 搜索标签: ${config.tag}`)

    let allApiKeys = []
    const indexData = await redis.hgetall('apikey:index')

    if (indexData && Object.keys(indexData).length > 0) {
      // 使用索引（O(1) 性能）
      allApiKeys = Object.entries(indexData)
        .map(([id, json]) => {
          try {
            return { id, ...JSON.parse(json) }
          } catch {
            return null
          }
        })
        .filter(Boolean)
    } else {
      // 降级：扫描所有 apikey:* 键
      console.log('⚠️  API Key 索引为空，使用扫描方式')
      const keys = []
      const stream = redis.scanStream({
        match: 'apikey:*',
        count: 100
      })

      stream.on('data', (resultKeys) => {
        keys.push(...resultKeys)
      })

      await new Promise((resolve, reject) => {
        stream.on('end', resolve)
        stream.on('error', reject)
      })

      for (const key of keys) {
        if (key === 'apikey:hash_map' || key === 'apikey:index') {
          continue
        }
        const keyData = await redis.hgetall(key)
        if (keyData && Object.keys(keyData).length > 0) {
          allApiKeys.push({ id: key.replace('apikey:', ''), ...keyData })
        }
      }
    }

    // 2. 过滤出包含指定标签的 API Keys（不区分大小写）
    const tagLower = config.tag.toLowerCase()
    const matchedKeys = allApiKeys.filter((key) => {
      // 跳过已删除的 Key
      if (key.isDeleted === 'true') {
        return false
      }

      let tags = []
      try {
        tags = key.tags ? JSON.parse(key.tags) : []
      } catch (e) {
        tags = []
      }

      // 不区分大小写匹配
      return tags.some((tag) => tag.toLowerCase() === tagLower)
    })

    if (matchedKeys.length === 0) {
      console.error(`❌ 未找到包含标签 "${config.tag}" 的 API Key`)
      process.exit(1)
    }

    console.log(`✅ 找到 ${matchedKeys.length} 个匹配的 API Keys`)
    console.log(`📊 查询日期: ${config.date}`)

    // 3. 分批查询所有 API Keys 的费用（每批 50 个，避免一次性查询过多）
    const BATCH_SIZE = 50
    const totalBatches = Math.ceil(matchedKeys.length / BATCH_SIZE)
    const allResults = []

    console.log(
      `🔄 开始查询费用数据 (共 ${matchedKeys.length} 个 Keys，分 ${totalBatches} 批处理)...\n`
    )

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * BATCH_SIZE
      const endIndex = Math.min(startIndex + BATCH_SIZE, matchedKeys.length)
      const batchKeys = matchedKeys.slice(startIndex, endIndex)

      // 显示进度
      process.stdout.write(
        `   批次 ${batchIndex + 1}/${totalBatches}: 查询 ${startIndex + 1}-${endIndex} ... `
      )

      // 查询当前批次的费用
      for (const key of batchKeys) {
        const costKey = `usage:cost:daily:${key.id}:${config.date}`
        const cost = await redis.get(costKey)
        const costValue = parseFloat(cost || 0)

        allResults.push({
          id: key.id,
          name: key.name || '(未命名)',
          description: key.description || '',
          cost: costValue
        })
      }

      console.log('✓')
    }

    console.log(`\n✅ 费用数据查询完成\n`)

    // 4. 按费用从高到低排序
    allResults.sort((a, b) => b.cost - a.cost)

    // 5. 计算统计信息
    const totalCost = allResults.reduce((sum, r) => sum + r.cost, 0)
    const averageCost = totalCost / allResults.length
    const nonZeroCount = allResults.filter((r) => r.cost > 0).length
    const maxCost = allResults.length > 0 ? allResults[0].cost : 0
    const minCost = allResults.length > 0 ? allResults[allResults.length - 1].cost : 0

    // 6. 输出结果表格
    console.log('='.repeat(100))
    console.log(
      `${'序号'.padEnd(6)} ${'API Key ID'.padEnd(30)} ${'名称'.padEnd(25)} ${'费用 (USD)'.padStart(12)}`
    )
    console.log('-'.repeat(100))

    allResults.forEach((result, index) => {
      const seq = String(index + 1).padEnd(6)
      const id = result.id.length > 28 ? `${result.id.substring(0, 28)}..` : result.id
      const name = result.name.length > 23 ? `${result.name.substring(0, 23)}..` : result.name
      const cost = `$${result.cost.toFixed(2)}`

      console.log(`${seq} ${id.padEnd(30)} ${name.padEnd(25)} ${cost.padStart(12)}`)
    })

    console.log('='.repeat(100))

    // 7. 输出统计信息
    console.log('\n📈 统计信息:')
    console.log(`   标签: ${config.tag}`)
    console.log(`   日期: ${config.date}`)
    console.log(`   总 Key 数量: ${allResults.length}`)
    console.log(`   有使用的 Key 数量: ${nonZeroCount}`)
    console.log(`   总费用: $${totalCost.toFixed(2)}`)
    console.log(`   平均费用: $${averageCost.toFixed(2)}`)
    console.log(`   最高费用: $${maxCost.toFixed(2)}`)
    console.log(`   最低费用: $${minCost.toFixed(2)}`)
  } catch (error) {
    console.error('❌ 错误:', error.message)
    process.exit(1)
  } finally {
    if (redis) {
      await redis.quit()
    }
  }
}

main()
