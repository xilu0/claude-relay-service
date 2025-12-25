#!/usr/bin/env node
/**
 * 远程重建 API Key 索引
 *
 * 用法:
 *   node scripts/rebuild-apikey-index.js -u <username> -p <password> [-s <server>]
 *
 * 参数:
 *   -u, --username   管理员用户名 (必填)
 *   -p, --password   管理员密码 (必填)
 *   -s, --server     服务器地址 (默认: https://claude-code.club)
 *   -h, --help       显示帮助
 *
 * 示例:
 *   node scripts/rebuild-apikey-index.js -u admin -p mypassword
 *   node scripts/rebuild-apikey-index.js -u admin -p mypassword -s https://my-server.com
 */

const https = require('https')
const http = require('http')

// ========== 参数解析 ==========
function parseArgs() {
  const args = process.argv.slice(2)
  const config = {
    username: null,
    password: null,
    server: 'https://claude-code.club'
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const next = args[i + 1]

    switch (arg) {
      case '-u':
      case '--username':
        config.username = next
        i++
        break
      case '-p':
      case '--password':
        config.password = next
        i++
        break
      case '-s':
      case '--server':
        config.server = next
        i++
        break
      case '-h':
      case '--help':
        showHelp()
        process.exit(0)
    }
  }

  return config
}

function showHelp() {
  console.log(`
远程重建 API Key 索引

用法: node scripts/rebuild-apikey-index.js -u <username> -p <password> [options]

参数:
  -u, --username   管理员用户名 (必填)
  -p, --password   管理员密码 (必填)
  -s, --server     服务器地址 (默认: https://claude-code.club)
  -h, --help       显示帮助

示例:
  node scripts/rebuild-apikey-index.js -u admin -p mypassword
  node scripts/rebuild-apikey-index.js -u admin -p mypassword -s https://my-server.com
`)
}

// ========== HTTP 请求工具 ==========
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const client = urlObj.protocol === 'https:' ? https : http

    const req = client.request(
      url,
      {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) })
          } catch {
            resolve({ status: res.statusCode, data })
          }
        })
      }
    )

    req.on('error', reject)
    if (options.body) {
      req.write(JSON.stringify(options.body))
    }
    req.end()
  })
}

// ========== 主逻辑 ==========
async function main() {
  const config = parseArgs()

  // 验证必填参数
  if (!config.username || !config.password) {
    console.error('❌ 错误: 必须提供用户名 (-u) 和密码 (-p)')
    console.error('   使用 -h 查看帮助')
    process.exit(1)
  }

  try {
    // 1. 登录获取 token
    console.log(`🔐 正在登录 ${config.server}...`)
    const loginRes = await request(`${config.server}/web/auth/login`, {
      method: 'POST',
      body: { username: config.username, password: config.password }
    })

    if (loginRes.status !== 200 || !loginRes.data.token) {
      console.error('❌ 登录失败:', loginRes.data.message || loginRes.data)
      process.exit(1)
    }

    const { token } = loginRes.data
    console.log('✅ 登录成功\n')

    // 2. 调用重建索引 API
    console.log('🔧 正在重建 API Key 索引...')
    const rebuildRes = await request(`${config.server}/admin/rebuild-apikey-index`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    })

    if (rebuildRes.status !== 200 || !rebuildRes.data.success) {
      console.error('❌ 重建索引失败:', rebuildRes.data.message || rebuildRes.data)
      process.exit(1)
    }

    console.log('✅ 重建索引成功!')
    console.log(`   已索引 ${rebuildRes.data.data.indexedCount} 个 API Keys`)
  } catch (error) {
    console.error('❌ 错误:', error.message)
    process.exit(1)
  }
}

main()
