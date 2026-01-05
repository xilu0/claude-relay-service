# Research: Claude Console Model Alert

**Date**: 2026-01-05
**Feature**: 001-console-model-alert

## 1. Model Detection Integration Points

### Decision: Hook into existing response processing flow

**Rationale**:
- `claudeConsoleRelayService.js` already parses response data in both `relayRequest()` (non-streaming) and `_makeClaudeConsoleStreamRequest()` (streaming)
- Non-streaming: Model info available in `response.data.model` after axios call (line 306-307)
- Streaming: Model info captured in `collectedUsageData.model` from `message_start` event (line 743)
- Both paths already extract model information for usage tracking

**Alternatives considered**:
- Middleware approach: Would add complexity and require duplicate parsing
- Post-response hook: Current flow already has natural integration points

## 2. Claude Model Validation Logic

### Decision: Case-insensitive substring matching for "haiku", "sonnet", "opus"

**Rationale**:
- Claude model names follow pattern: `claude-{version}-{tier}-{date}` (e.g., `claude-3-5-sonnet-20241022`)
- The tier keywords (haiku, sonnet, opus) are unique identifiers across all Claude models
- Case-insensitive matching handles edge cases like "Claude-Sonnet" or "HAIKU"
- Simple implementation: `model.toLowerCase().includes('haiku') || .includes('sonnet') || .includes('opus')`

**Alternatives considered**:
- Regex pattern matching: More complex, no added benefit for current use case
- Model name whitelist: Requires maintenance as new models are released

## 3. Webhook Alert Type

### Decision: New notification type `modelAnomaly`

**Rationale**:
- Existing `webhookService.sendNotification(type, data)` supports custom types
- `getNotificationTitle()` can be extended to handle `modelAnomaly` type
- Fits existing notification type pattern: `accountAnomaly`, `quotaWarning`, `systemError`, etc.

**Alert data structure**:
```javascript
{
  apiKeyName: string,        // From apiKeyData.name
  apiKeyId: string,          // Optional, from apiKeyData.id
  accountId: string,         // Console account ID
  accountName: string,       // Console account name
  detectedModel: string,     // The non-Claude model detected
  expectedModels: string[],  // ['haiku', 'sonnet', 'opus']
  timestamp: string          // ISO timestamp
}
```

## 4. Rate Limiting Implementation

### Decision: Redis key with TTL for per-account alert throttling

**Rationale**:
- Existing pattern: Project uses Redis for rate limiting (see `rate_limit:*` keys in CLAUDE.md)
- Key pattern: `model_alert_throttle:{accountId}` with 60-second TTL
- Simple SET NX (set if not exists) check before sending alert

**Implementation**:
```javascript
const throttleKey = `model_alert_throttle:${accountId}`
const canAlert = await redis.set(throttleKey, '1', 'EX', 60, 'NX')
if (canAlert) {
  await webhookService.sendNotification('modelAnomaly', alertData)
}
```

**Alternatives considered**:
- In-memory rate limiting: Would not work across multiple instances
- Sliding window: Overkill for 1-minute throttle requirement

## 5. Feature Toggle Configuration

### Decision: Environment variable `CONSOLE_MODEL_ALERT_ENABLED` (default: true)

**Rationale**:
- Follows existing config pattern in `config/config.js`
- Boolean toggle, simple to check: `config.consoleModelAlert.enabled`
- Default true as per spec requirement

**Configuration structure**:
```javascript
// config/config.js
consoleModelAlert: {
  enabled: process.env.CONSOLE_MODEL_ALERT_ENABLED !== 'false', // Default true
}
```

## 6. Non-Streaming Response Detection

### Decision: Check model after successful response, before returning to client

**Integration point**: After line 306 in `relayRequest()`:
```javascript
const responseBody = typeof response.data === 'string'
  ? response.data
  : JSON.stringify(response.data)
```

**Implementation**:
- Extract model from parsed response data
- Call modelAlertService.checkAndAlert() asynchronously (non-blocking)
- Continue with normal response flow

## 7. Streaming Response Detection

### Decision: Check model from `message_start` event in SSE parsing

**Integration point**: Inside `message_start` handling block (lines 737-760):
```javascript
if (data.type === 'message_start' && data.message && data.message.usage) {
  collectedUsageData.model = data.message.model
  // Add model check here
}
```

**Implementation**:
- Extract model from `data.message.model`
- Call modelAlertService.checkAndAlert() asynchronously
- Single check per stream (use flag to prevent duplicates)

## 8. Error Handling Strategy

### Decision: Fail-safe with logging, never block main flow

**Rationale**:
- Model alert is a monitoring feature, not critical path
- Any error in alert logic should be logged but not propagate
- Use try-catch wrapper with logger.warn() for failures

**Pattern**:
```javascript
try {
  await modelAlertService.checkAndAlert(context)
} catch (error) {
  logger.warn('Model alert check failed:', error.message)
  // Continue with normal response flow
}
```

## Summary

All technical decisions aligned with existing codebase patterns. No external dependencies needed. Implementation uses existing Redis, webhookService, and logging infrastructure.
