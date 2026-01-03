# 异常捕获和自动重试实现指南

## 已完成的实现

### 1. 核心基础设施 ✅

#### src/utils/retryHelper.js
- `calculateBackoffDelay(retryCount, baseDelay, maxDelay)` - 计算指数退避延迟
- `sleep(ms)` - 异步睡眠函数
- `retryWithBackoff(fn, options)` - 通用重试框架

#### src/errors/AllRetriesFailed.js
- 自定义错误类，包含失败的详细信息
- 属性：accountId, accountName, errorCode, statusCode, originalMessage, retryRound, maxRetries

#### src/utils/retryHelper.js
- 完整的指数退避重试框架

### 2. 调度和重试服务 ✅

#### src/services/unifiedClaudeScheduler.js
- 新增方法 `selectAccountWithRetryLoop(apiKeyId, apiKeyData, request, onFailure, options)`
- 实现多轮轮询重试逻辑
- 每轮尝试所有可用账户，失败后指数延迟后再来一遍

#### src/services/consoleAccountRetryService.js (新增)
- `handleConsoleRequestWithRetry(req, res, apiKeyData, isStream, options)`
- 专门处理Console账户的多轮重试
- 流式和非流式请求的统一处理
- 完整的webhook告警集成

### 3. 转发服务改进 ✅

#### src/services/claudeConsoleRelayService.js
- 新增方法 `relayConsoleMessages(accountId, requestBody, apiKeyId)`
- 返回标准化格式：`{status, data}`
- 用于重试服务的多轮重试

### 4. 监控和告警 ✅

#### src/utils/webhookNotifier.js
- 新增方法 `sendRequestFailureAlert(options)`
- 参数包含：apiKeyId, apiKeyName, accountId, accountName, errorCode, statusCode, errorMessage, retryRound, maxRetries, isFinal
- 发送详细的失败告警

#### src/services/apiKeyService.js
- 新增方法 `getApiKeyName(keyId)` - 快速获取API Key名称

## 集成步骤 - 在 src/routes/api.js 中

### 第1步：导入新的服务
在 src/routes/api.js 的顶部添加：
```javascript
const consoleAccountRetryService = require('../services/consoleAccountRetryService');
```

### 第2步：修改 handleMessagesRequest 中的 Console 账户处理
找到这个部分：
```javascript
} else if (accountType === 'claude-console') {
  // Claude Console账号使用Console转发服务（需要传递accountId）
  await claudeConsoleRelayService.relayStreamRequestWithUsageCapture(...)
```

替换为：
```javascript
} else if (accountType === 'claude-console') {
  // 使用新的重试服务处理Console账户
  const maxRetries = parseInt(process.env.RELAY_MAX_RETRIES) || 3;
  const baseDelay = parseInt(process.env.RELAY_RETRY_BASE_DELAY) || 1000;
  const maxDelay = parseInt(process.env.RELAY_RETRY_MAX_DELAY) || 30000;

  const handled = await consoleAccountRetryService.handleConsoleRequestWithRetry(
    req,
    res,
    req.apiKey,
    isStream,
    { maxRetries, baseDelay, maxDelay }
  );

  if (handled) {
    const duration = Date.now() - startTime;
    logger.api(`✅ Request completed in ${duration}ms for key: ${req.apiKey.name}`);
    return undefined;
  }
```

### 第3步：环境变量配置
在 .env 或 config.js 中添加：
```bash
# 重试配置
RELAY_MAX_RETRIES=3              # 最多重试3轮
RELAY_RETRY_BASE_DELAY=1000      # 基础延迟1秒
RELAY_RETRY_MAX_DELAY=30000      # 最大延迟30秒
```

## 核心流程说明

### 多轮重试算法
```
第1轮：立即尝试所有可用Console账户
  ├─ 账户A → 成功200/201 → 返回响应
  ├─ 账户A → 失败非200 → webhook告警 → 尝试账户B
  ├─ 账户B → 失败 → webhook告警 → 尝试账户C
  └─ 账户C → 全部失败

延迟1秒（指数退避）

第2轮：再试一遍所有账户
  ├─ 账户A → 成功200/201 → 返回响应
  └─ ...

延迟2秒（指数退避）

第3轮：最后一轮尝试
  └─ ...

所有3轮都失败 → 发送最终告警 → 返回503 Service Unavailable
```

### Webhook告警内容
每次失败（包括最终失败）都会发送告警：
```javascript
{
  timestamp: '2024-01-03T...',
  type: 'request_failure_alert',
  isFinal: false|true,           // 最终失败时为true
  retry: {
    round: 1,                      // 当前重试轮数
    maxRetries: 3                  // 最大重试轮数
  },
  apiKey: {
    id: 'key-id',
    name: 'API Key Name'           // 用户输入的名称
  },
  account: {
    id: 'account-id',
    name: 'Account Name'
  },
  error: {
    code: 'UNKNOWN_ERROR',         // 错误代码
    httpStatus: 429,               // HTTP状态码
    message: 'Rate limited'        // 错误信息
  }
}
```

## 关键特性

✅ **用户永不收到错误** - 仅在全部重试失败时返回503（通用错误）
✅ **完整的告警链** - 每次失败都发送webhook，管理员可追踪问题
✅ **多轮轮询重试** - 所有账户尝试完一轮后，指数延迟后再来一遍
✅ **优先级保持** - 每轮都按优先级顺序尝试账户
✅ **快速失败转移** - 任一账户返回200/201立即返回成功
✅ **完整的异常捕获** - 网络错误、超时、API错误都被处理

## 测试场景

### 1. 单个账户故障
- Console账户A: 返回529
- 预期：立即切换到账户B，单轮成功

### 2. 多个账户故障
- 账户A、B、C都返回429（速率限制）
- 预期：尝试A→B→C失败 → 延迟1秒 → 再试A→B→C → 最终失败返回503

### 3. 网络超时
- 账户A: DNS超时
- 预期：异常被捕获，发送告警，继续尝试账户B

### 4. 所有重试都失败
- 所有账户在3轮重试中都失败
- 预期：返回503，发送最终告警（isFinal: true）

## 性能考虑

- **延迟**：最坏情况 1+2+4=7秒（3轮延迟）+ 请求时间
- **告警数量**：如果有3个账户和3轮重试，单次请求最多发送9个告警+1个最终告警
- **并发**：每个账户的并发限制在relayConsoleMessages中强制检查

## 故障排查

### 1. Webhook没有收到告警
检查：
- `WEBHOOK_ENABLED=true`
- Webhook URLs在webhookService中配置正确
- 查看logs/webhook-*.log日志

### 2. 重试没有触发
检查：
- `RELAY_MAX_RETRIES`环境变量是否设置
- Console账户是否可用（isActive=true, status=active）
- 查看日志中的"Starting retry loop"消息

### 3. 返回错误而不是503
可能原因：
- consoleAccountRetryService未正确集成到api.js
- handleConsoleRequestWithRetry返回值未被正确处理

## 注意事项

1. **流式响应**：流式请求成功会立即开始发送SSE数据，无法重试（头已发送）
2. **粘性会话**：重试时可能在不同账户之间切换，破坏会话连续性
3. **成本计算**：失败的请求（非200/201）不计入成本统计
4. **并发释放**：失败的请求需要在catch块中释放并发计数
