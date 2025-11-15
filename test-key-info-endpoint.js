#!/usr/bin/env node

/**
 * 测试 /api/v1/key-info 端点
 * 验证是否正确返回周限制字段（weeklyResetTime、weeklyCost等）
 */

const http = require('http')

// 配置
const HOST = 'localhost'
const PORT = process.env.PORT || 8080
const API_KEY = process.env.TEST_API_KEY || 'cr_test_key' // 从环境变量读取或使用默认值

async function testKeyInfoEndpoint() {
  console.log('🧪 测试 /api/v1/key-info 端点...\n')

  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: '/api/v1/key-info',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    }

    const req = http.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        console.log(`📡 HTTP Status: ${res.statusCode}\n`)

        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data)
            console.log('✅ 成功响应！\n')
            console.log('📊 返回数据结构：')
            console.log(JSON.stringify(jsonData, null, 2))
            console.log('\n')

            // 验证关键字段
            console.log('🔍 验证关键字段：')
            const { keyInfo } = jsonData

            const checks = [
              { field: 'id', exists: !!keyInfo?.id },
              { field: 'name', exists: !!keyInfo?.name },
              { field: 'tokenLimit', exists: keyInfo?.tokenLimit !== undefined },
              { field: 'usage', exists: !!keyInfo?.usage },
              { field: 'weeklyCostLimit', exists: keyInfo?.weeklyCostLimit !== undefined },
              { field: 'weeklyCost', exists: keyInfo?.weeklyCost !== undefined },
              { field: 'weeklyResetTime', exists: !!keyInfo?.weeklyResetTime },
              { field: 'boosterPackAmount', exists: keyInfo?.boosterPackAmount !== undefined },
              { field: 'boosterPackUsed', exists: keyInfo?.boosterPackUsed !== undefined }
            ]

            checks.forEach(({ field, exists }) => {
              const icon = exists ? '✅' : '❌'
              console.log(`  ${icon} ${field}: ${exists ? '存在' : '缺失'}`)
            })

            console.log('\n')

            // 验证 weeklyResetTime 格式
            if (keyInfo?.weeklyResetTime) {
              const resetTime = new Date(keyInfo.weeklyResetTime)
              console.log('🕐 周限制重置时间：')
              console.log(`  原始值: ${keyInfo.weeklyResetTime}`)
              console.log(`  解析后: ${resetTime.toLocaleString('zh-CN')}`)
              console.log(`  有效性: ${!isNaN(resetTime.getTime()) ? '✅ 有效' : '❌ 无效'}`)
            }

            const allFieldsPresent = checks.every((c) => c.exists)
            if (allFieldsPresent) {
              console.log('\n✅ 所有关键字段验证通过！')
              resolve(jsonData)
            } else {
              console.log('\n⚠️ 部分字段缺失，请检查代码实现')
              reject(new Error('部分字段缺失'))
            }
          } catch (error) {
            console.error('❌ JSON 解析失败:', error.message)
            console.error('原始响应:', data)
            reject(error)
          }
        } else if (res.statusCode === 401) {
          console.log('⚠️ 认证失败（401）：API Key 可能无效')
          console.log('提示：请设置环境变量 TEST_API_KEY 为有效的 API Key')
          console.log('示例：TEST_API_KEY=cr_your_real_key node test-key-info-endpoint.js\n')
          console.log('响应内容:', data)
          resolve({ status: 401, message: '需要有效的 API Key' })
        } else {
          console.error(`❌ 请求失败 (${res.statusCode})`)
          console.error('响应内容:', data)
          reject(new Error(`HTTP ${res.statusCode}`))
        }
      })
    })

    req.on('error', (error) => {
      console.error('❌ 请求错误:', error.message)
      console.log('\n提示：请确认服务正在运行（npm start 或 npm run service:status）')
      reject(error)
    })

    req.end()
  })
}

// 运行测试
if (require.main === module) {
  testKeyInfoEndpoint()
    .then(() => {
      console.log('\n✅ 测试完成！')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n❌ 测试失败:', error.message)
      process.exit(1)
    })
}

module.exports = { testKeyInfoEndpoint }
