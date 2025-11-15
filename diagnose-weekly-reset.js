#!/usr/bin/env node

/**
 * 诊断周限截止时间不显示的问题
 * 检查后端 API 响应和数据结构
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

// 读取管理员凭据
function getAdminCredentials() {
  try {
    const initFilePath = path.join(__dirname, 'data', 'init.json')
    const initData = JSON.parse(fs.readFileSync(initFilePath, 'utf8'))
    return {
      username: initData.adminUsername || 'admin',
      password: initData.adminPassword || 'admin'
    }
  } catch (error) {
    console.error('❌ 无法读取管理员凭据:', error.message)
    return { username: 'admin', password: 'admin' }
  }
}

// 管理员登录
async function adminLogin(username, password) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ username, password })

    const options = {
      hostname: 'localhost',
      port: 8080,
      path: '/admin/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }

    const req = http.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data)
            const cookies = res.headers['set-cookie']
            const tokenCookie = cookies?.find((c) => c.startsWith('admin_token='))
            const token = tokenCookie?.split(';')[0].split('=')[1]

            resolve({ success: true, token, data: jsonData })
          } catch (error) {
            reject(new Error('JSON 解析失败: ' + error.message))
          }
        } else {
          reject(new Error(`登录失败: HTTP ${res.statusCode} - ${data}`))
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.write(postData)
    req.end()
  })
}

// 获取 API Keys 数据
async function getApiKeys(token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: '/admin/api-keys',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `admin_token=${token}`
      }
    }

    const req = http.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data)
            resolve({ success: true, data: jsonData })
          } catch (error) {
            reject(new Error('JSON 解析失败: ' + error.message))
          }
        } else {
          reject(new Error(`请求失败: HTTP ${res.statusCode} - ${data}`))
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.end()
  })
}

// 分析 API Key 数据
function analyzeApiKey(key, index) {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`📋 API Key #${index + 1}: ${key.name || 'Unnamed'}`)
  console.log(`${'='.repeat(70)}`)

  console.log(`\n🔑 基本信息:`)
  console.log(`  - ID: ${key.id}`)
  console.log(`  - Name: ${key.name}`)
  console.log(`  - Status: ${key.isActive ? '✅ 活跃' : '❌ 禁用'}`)

  console.log(`\n💰 周限制相关字段:`)
  console.log(`  - weeklyCostLimit: ${key.weeklyCostLimit} (类型: ${typeof key.weeklyCostLimit})`)
  console.log(`  - weeklyCost: ${key.weeklyCost} (类型: ${typeof key.weeklyCost})`)
  console.log(
    `  - weeklyResetTime: ${key.weeklyResetTime} (类型: ${typeof key.weeklyResetTime})`
  )

  // 检查显示条件
  console.log(`\n🔍 显示条件检查:`)
  const condition1 = key.weeklyCostLimit > 0
  const condition2 = !!key.weeklyResetTime

  console.log(`  - weeklyCostLimit > 0: ${condition1} ${condition1 ? '✅' : '❌'}`)
  console.log(`  - weeklyResetTime 存在: ${condition2} ${condition2 ? '✅' : '❌'}`)
  console.log(`  - 最终条件: ${condition1 && condition2} ${condition1 && condition2 ? '✅ 应该显示' : '❌ 不会显示'}`)

  // 如果有 weeklyResetTime，验证格式
  if (key.weeklyResetTime) {
    console.log(`\n⏰ 时间信息:`)
    try {
      const resetTime = new Date(key.weeklyResetTime)
      const now = new Date()
      const diffMs = resetTime - now
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

      console.log(`  - 原始值: ${key.weeklyResetTime}`)
      console.log(`  - 解析后: ${resetTime.toLocaleString('zh-CN')}`)
      console.log(`  - 有效性: ${!isNaN(resetTime.getTime()) ? '✅ 有效' : '❌ 无效'}`)
      console.log(`  - 距离现在: ${diffDays}天${diffHours}时`)
    } catch (error) {
      console.log(`  ❌ 时间解析失败: ${error.message}`)
    }
  }

  // 其他限制字段
  console.log(`\n📊 其他限制:`)
  console.log(`  - dailyCostLimit: ${key.dailyCostLimit}`)
  console.log(`  - totalCostLimit: ${key.totalCostLimit}`)
  console.log(`  - rateLimitWindow: ${key.rateLimitWindow}`)
}

// 主函数
async function main() {
  console.log(`\n${'*'.repeat(70)}`)
  console.log(`🔍 周限截止时间显示诊断工具`)
  console.log(`${'*'.repeat(70)}\n`)

  try {
    // 1. 获取凭据
    console.log('📌 步骤 1: 读取管理员凭据...')
    const credentials = getAdminCredentials()
    console.log(`✅ 用户名: ${credentials.username}`)

    // 2. 登录
    console.log('\n📌 步骤 2: 管理员登录...')
    const loginResult = await adminLogin(credentials.username, credentials.password)
    console.log('✅ 登录成功')

    // 3. 获取 API Keys
    console.log('\n📌 步骤 3: 获取 API Keys 数据...')
    const apiKeysResult = await getApiKeys(loginResult.token)
    const apiKeys = apiKeysResult.data

    if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
      console.log('⚠️  没有找到 API Keys')
      return
    }

    console.log(`✅ 找到 ${apiKeys.length} 个 API Keys`)

    // 4. 分析每个 API Key
    console.log('\n📌 步骤 4: 分析 API Key 数据...')
    apiKeys.forEach((key, index) => {
      analyzeApiKey(key, index)
    })

    // 5. 总结
    console.log(`\n${'='.repeat(70)}`)
    console.log(`📊 诊断总结`)
    console.log(`${'='.repeat(70)}\n`)

    const keysWithWeeklyLimit = apiKeys.filter((k) => k.weeklyCostLimit > 0)
    const keysWithResetTime = apiKeys.filter((k) => k.weeklyResetTime)
    const keysShowable = apiKeys.filter((k) => k.weeklyCostLimit > 0 && k.weeklyResetTime)

    console.log(`总 API Keys 数量: ${apiKeys.length}`)
    console.log(
      `设置了周限制的: ${keysWithWeeklyLimit.length} (weeklyCostLimit > 0)`
    )
    console.log(
      `有重置时间的: ${keysWithResetTime.length} (weeklyResetTime 存在)`
    )
    console.log(`应该显示截止时间的: ${keysShowable.length} (两个条件都满足)`)

    if (keysShowable.length === 0) {
      console.log('\n❌ 问题原因: 没有 API Key 同时满足两个显示条件!')
      console.log('\n💡 可能的原因:')
      console.log('  1. 所有 API Key 的 weeklyCostLimit 都是 0 (未设置周限制)')
      console.log('  2. weeklyResetTime 字段为 null 或 undefined')
      console.log('  3. 后端代码未正确返回数据')
    } else {
      console.log('\n✅ 数据看起来正常，应该会显示周限截止时间')
      console.log('\n💡 如果前端仍然不显示，请检查:')
      console.log('  1. 浏览器缓存（强制刷新: Ctrl+Shift+R）')
      console.log('  2. 前端构建是否包含最新代码')
      console.log('  3. 浏览器控制台是否有 JavaScript 错误')
    }

    console.log(`\n${'*'.repeat(70)}\n`)
  } catch (error) {
    console.error('\n❌ 诊断失败:', error.message)
    console.error('详细错误:', error)
    process.exit(1)
  }
}

// 运行主函数
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ 未捕获的错误:', error)
    process.exit(1)
  })
}

module.exports = { main, analyzeApiKey, getApiKeys, adminLogin }
