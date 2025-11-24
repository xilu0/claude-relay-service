#!/usr/bin/env node

/**
 * 测试 /admin/api-keys 端点是否返回 weeklyResetTime 字段
 */

const http = require('http')

async function testWeeklyResetTimeAPI() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: '/admin/api-keys',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }

    const req = http.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        console.log(`\n📡 HTTP Status: ${res.statusCode}\n`)

        if (res.statusCode === 401) {
          console.log('⚠️  需要管理员认证，但我们可以看到端点是否可访问\n')
          resolve({ needsAuth: true })
          return
        }

        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data)
            const apiKeys = jsonData

            if (Array.isArray(apiKeys) && apiKeys.length > 0) {
              console.log(`✅ 找到 ${apiKeys.length} 个 API Keys\n`)

              const firstKey = apiKeys[0]
              console.log('🔍 检查第一个 API Key 的字段：\n')
              console.log(`  - id: ${firstKey.id}`)
              console.log(`  - name: ${firstKey.name}`)
              console.log(`  - weeklyCostLimit: ${firstKey.weeklyCostLimit}`)
              console.log(`  - weeklyCost: ${firstKey.weeklyCost}`)
              console.log(`  - weeklyResetTime: ${firstKey.weeklyResetTime}`)

              if (firstKey.weeklyResetTime) {
                const resetTime = new Date(firstKey.weeklyResetTime)
                console.log(`\n✅ weeklyResetTime 字段存在！`)
                console.log(`  - 原始值: ${firstKey.weeklyResetTime}`)
                console.log(`  - 解析后: ${resetTime.toLocaleString('zh-CN')}`)
                console.log(`  - 有效性: ${!isNaN(resetTime.getTime()) ? '✅ 有效' : '❌ 无效'}`)
              } else {
                console.log(`\n❌ weeklyResetTime 字段缺失或为 falsy 值`)
                console.log(`  - 值: ${JSON.stringify(firstKey.weeklyResetTime)}`)
              }

              console.log(`\n📋 完整的 API Key 对象（前200字符）:`)
              console.log(JSON.stringify(firstKey, null, 2).substring(0, 200) + '...\n')

              resolve({ success: true, hasWeeklyResetTime: !!firstKey.weeklyResetTime })
            } else {
              console.log('⚠️  没有找到 API Keys\n')
              resolve({ success: true, noKeys: true })
            }
          } catch (error) {
            console.error('❌ JSON 解析失败:', error.message)
            console.error('原始响应:', data.substring(0, 200))
            reject(error)
          }
        } else {
          console.error(`❌ 请求失败 (${res.statusCode})`)
          console.error('响应内容:', data.substring(0, 200))
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      })
    })

    req.on('error', (error) => {
      console.error('❌ 请求错误:', error.message)
      console.log('\n提示：请确认服务正在运行（npm run service:status）')
      reject(error)
    })

    req.end()
  })
}

// 运行测试
if (require.main === module) {
  testWeeklyResetTimeAPI()
    .then((result) => {
      console.log('\n✅ 测试完成！')
      console.log('结果:', JSON.stringify(result, null, 2))
      process.exit(result.success && result.hasWeeklyResetTime ? 0 : 1)
    })
    .catch((error) => {
      console.error('\n❌ 测试失败:', error.message)
      process.exit(1)
    })
}

module.exports = { testWeeklyResetTimeAPI }
