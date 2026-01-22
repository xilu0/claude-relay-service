# API Key Hash Mapping 清理指南

## 问题背景

由于代码 bug，API Key 重新生成后，旧的哈希映射没有被正确删除，导致旧的 API Key 仍然可以使用。这是一个安全漏洞。

## 修复步骤

### 1. 在本地准备脚本

确保你有以下文件：
- `scripts/cleanup-orphaned-apikey-hashes.js`
- `package.json` (需要 ioredis 依赖)

### 2. 安装依赖

```bash
npm install ioredis
```

### 3. 连接到生产 Redis 进行清理

#### 方式一：通过 SSH 隧道（推荐）

如果生产 Redis 不允许外网直接访问，先建立 SSH 隧道：

```bash
# 在本地终端建立 SSH 隧道
ssh -L 6380:localhost:6379 cc2

# 保持这个终端打开，在另一个终端执行清理脚本
node scripts/cleanup-orphaned-apikey-hashes.js \
  --host localhost \
  --port 6380 \
  --dry-run
```

#### 方式二：直接连接（如果 Redis 允许外网访问）

```bash
# 先干跑查看会删除什么
node scripts/cleanup-orphaned-apikey-hashes.js \
  --host redis.prod.example.com \
  --port 6379 \
  --password your-redis-password \
  --dry-run

# 确认无误后执行实际清理
node scripts/cleanup-orphaned-apikey-hashes.js \
  --host redis.prod.example.com \
  --port 6379 \
  --password your-redis-password
```

### 4. 查看清理结果

脚本会输出：
- ✅ 有效的映射数量
- ❌ 孤立的映射（Key 不存在）
- ⚠️ 不匹配的映射（旧的哈希）

详细日志会保存到 `logs/apikey-cleanup-*.json`

### 5. 部署代码修复

清理完成后，部署以下修复文件到生产环境：
- `src/models/redis.js`
- `src/services/apiKeyService.js`

然后重启服务：
```bash
# 根据你的部署方式
make restart-claude-relay
# 或
docker restart cc-club-claude-relay-1
```

## 命令行参数说明

### 必需参数
- `--host <host>` - Redis 主机地址
- `--port <port>` - Redis 端口

### 可选参数
- `--password <pass>` - Redis 密码（如果需要认证）
- `--db <number>` - Redis 数据库编号（默认 0）
- `--dry-run` - 干跑模式，只显示会删除什么，不实际删除
- `--help` - 显示帮助信息

## 使用示例

### 示例 1：本地测试（干跑）
```bash
node scripts/cleanup-orphaned-apikey-hashes.js \
  --host localhost \
  --port 6379 \
  --dry-run
```

### 示例 2：通过 SSH 隧道连接生产环境
```bash
# 终端 1：建立隧道
ssh -L 6380:localhost:6379 cc2

# 终端 2：执行清理（干跑）
node scripts/cleanup-orphaned-apikey-hashes.js \
  --host localhost \
  --port 6380 \
  --dry-run

# 确认无误后执行实际清理
node scripts/cleanup-orphaned-apikey-hashes.js \
  --host localhost \
  --port 6380
```

### 示例 3：直接连接生产 Redis（带密码）
```bash
node scripts/cleanup-orphaned-apikey-hashes.js \
  --host redis.prod.example.com \
  --port 6379 \
  --password "your-secure-password" \
  --dry-run
```

### 示例 4：指定数据库编号
```bash
node scripts/cleanup-orphaned-apikey-hashes.js \
  --host localhost \
  --port 6379 \
  --db 1 \
  --dry-run
```

## 预期输出

### 干跑模式输出示例
```
🔍 Starting cleanup of orphaned API Key hash mappings...
Redis: localhost:6379 (DB: 0)
Mode: DRY RUN (no changes will be made)

📊 Found 279 entries in apikey:hash_map

⚠️  Mismatch: hash f631a0781f8f5ff6... points to key 081fefd7-..., but key has different hash 87b8e6c27be5b65f...

📈 Summary:
  ✅ Valid mappings: 278
  ❌ Orphaned (key not found): 0
  ⚠️  Mismatched (old hash): 1
  🗑️  Total to remove: 1

🔍 DRY RUN: The following entries would be deleted:
  - Hash: f631a0781f8f5ff6... → Key: 081fefd7-... (hash_mismatch)
    Current hash: 87b8e6c27be5b65f...

💡 Run without --dry-run to actually delete these entries
📝 Detailed log saved to: logs/apikey-cleanup-2026-01-14T16-31-19-273Z.json
```

### 实际清理输出示例
```
🔍 Starting cleanup of orphaned API Key hash mappings...
Redis: localhost:6379 (DB: 0)
Mode: LIVE (will delete orphaned entries)

📊 Found 279 entries in apikey:hash_map

⚠️  Mismatch: hash f631a0781f8f5ff6... points to key 081fefd7-..., but key has different hash 87b8e6c27be5b65f...

📈 Summary:
  ✅ Valid mappings: 278
  ❌ Orphaned (key not found): 0
  ⚠️  Mismatched (old hash): 1
  🗑️  Total to remove: 1

🗑️  Deleting orphaned entries...
✅ Deleted 1 orphaned hash mappings

✅ Cleanup completed successfully!
📝 Detailed log saved to: logs/apikey-cleanup-2026-01-14T16-35-42-123Z.json
```

## 安全注意事项

1. **始终先运行 `--dry-run`**：确认要删除的内容是合理的
2. **备份 Redis 数据**：如果可能，在清理前备份 Redis
3. **低峰期执行**：选择业务低峰期执行清理操作
4. **保留日志**：保存清理日志文件以备查
5. **验证修复**：清理后测试 API Key 重新生成功能是否正常

## 故障排查

### 连接失败
```
Error: connect ECONNREFUSED
```
**解决方案**：检查 Redis 地址、端口是否正确，防火墙是否开放

### 认证失败
```
Error: NOAUTH Authentication required
```
**解决方案**：添加 `--password` 参数

### 权限不足
```
Error: NOPERM this user has no permissions
```
**解决方案**：确保 Redis 用户有 HGETALL、HDEL 权限

## 验证修复

清理完成并部署代码后，验证修复是否生效：

```bash
# 运行测试脚本
node scripts/test-apikey-regeneration.js
```

预期输出：
```
✅ ALL TESTS PASSED!

The bug has been successfully fixed:
  ✓ Old hash mapping is removed after regeneration
  ✓ Old API Key no longer works
  ✓ New API Key works correctly
  ✓ No orphaned hash mappings remain
```

## 联系支持

如有问题，请查看：
- 详细日志：`logs/apikey-cleanup-*.json`
- 错误日志：控制台输出
