# Data Model: Claude Console Model Alert

**Date**: 2026-01-05
**Feature**: 001-console-model-alert

## Entities

### ModelAlertEvent

模型异常告警事件，用于webhook通知payload。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| apiKeyName | string | Yes | 请求使用的API Key名称，方便识别 |
| apiKeyId | string | No | API Key ID（可选） |
| accountId | string | Yes | Claude Console账户ID |
| accountName | string | Yes | Claude Console账户名称 |
| detectedModel | string | Yes | 检测到的非Claude模型名称 |
| expectedModels | string[] | Yes | 预期的Claude模型关键字列表 ['haiku', 'sonnet', 'opus'] |
| timestamp | string | Yes | 事件发生时间（ISO 8601格式） |

**Example**:
```json
{
  "apiKeyName": "production-key",
  "apiKeyId": "key_abc123",
  "accountId": "console_def456",
  "accountName": "Main Console Account",
  "detectedModel": "gpt-4-turbo",
  "expectedModels": ["haiku", "sonnet", "opus"],
  "timestamp": "2026-01-05T10:30:00.000Z"
}
```

### AlertRateLimit (Redis)

告警频率限制状态，存储在Redis中。

| Field | Type | Storage | Description |
|-------|------|---------|-------------|
| key | string | Redis Key | 格式: `model_alert_throttle:{accountId}` |
| value | string | Redis Value | 固定值 "1" 表示已告警 |
| ttl | number | Redis TTL | 60秒过期时间 |

**Redis Operations**:
- SET with NX (set if not exists) + EX 60
- Key自动过期，无需手动清理

## State Transitions

### Alert Flow States

```
┌─────────────────────────────────────────────────────────────────┐
│                      Response Received                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Feature Enabled Check                           │
│           (CONSOLE_MODEL_ALERT_ENABLED)                         │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ Yes                           │ No
                ▼                               ▼
┌─────────────────────────────┐    ┌──────────────────────────────┐
│     Extract Model Name      │    │   Skip Detection (No-op)     │
│   from response.model or    │    └──────────────────────────────┘
│   message_start.message.model│
└───────────────┬─────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│              Model Validation                                    │
│    Contains 'haiku', 'sonnet', or 'opus' (case-insensitive)?    │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ Yes (Valid)                   │ No (Invalid)
                ▼                               ▼
┌─────────────────────────────┐    ┌──────────────────────────────┐
│      No Action Needed       │    │   Check Rate Limit           │
│     (Normal Operation)      │    │   (Redis NX check)           │
└─────────────────────────────┘    └───────────────┬──────────────┘
                                                   │
                            ┌──────────────────────┴───────────────┐
                            │ Can Alert                │ Throttled │
                            ▼                          ▼           │
               ┌──────────────────────────┐   ┌───────────────────┐
               │   Send Webhook Alert     │   │  Log Suppressed   │
               │   (modelAnomaly type)    │   │  (debug level)    │
               └──────────────────────────┘   └───────────────────┘
```

## Validation Rules

### Model Name Validation

```javascript
function isValidClaudeModel(modelName) {
  if (!modelName || typeof modelName !== 'string') {
    return false  // Missing or empty model triggers alert
  }

  const lowerModel = modelName.toLowerCase()
  const claudeKeywords = ['haiku', 'sonnet', 'opus']

  return claudeKeywords.some(keyword => lowerModel.includes(keyword))
}
```

### Rate Limit Check

```javascript
async function canSendAlert(accountId) {
  const throttleKey = `model_alert_throttle:${accountId}`
  // SET key "1" EX 60 NX - returns OK if set, null if exists
  const result = await redis.set(throttleKey, '1', 'EX', 60, 'NX')
  return result === 'OK'
}
```

## Configuration Schema

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| CONSOLE_MODEL_ALERT_ENABLED | boolean | true | 功能总开关 |

### Config Object

```javascript
// config/config.js additions
consoleModelAlert: {
  enabled: process.env.CONSOLE_MODEL_ALERT_ENABLED !== 'false'
}
```

## Integration Points

### Data Sources

1. **API Key Information**: From `apiKeyData` parameter in relay functions
   - `apiKeyData.name` - API Key名称
   - `apiKeyData.id` - API Key ID

2. **Account Information**: From `account` object (fetched via `claudeConsoleAccountService.getAccount()`)
   - `account.id` or `accountId` parameter
   - `account.name`

3. **Model Information**:
   - Non-streaming: `response.data.model`
   - Streaming: `data.message.model` from `message_start` SSE event

### Data Consumers

1. **webhookService.sendNotification('modelAnomaly', data)**
   - Sends to all enabled webhook platforms
   - Uses existing notification infrastructure
