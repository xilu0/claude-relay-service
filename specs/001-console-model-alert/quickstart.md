# Quickstart: Claude Console Model Alert

**Date**: 2026-01-05
**Feature**: 001-console-model-alert

## Overview

This feature adds automatic model anomaly detection for Claude Console accounts. When a response contains a non-Claude model name (i.e., not containing "haiku", "sonnet", or "opus"), the system sends a webhook alert with context information.

## Prerequisites

- Node.js 18+
- Redis running (existing infrastructure)
- Webhook configured via admin interface or existing webhookConfigService

## Quick Setup

### 1. Enable the Feature (Optional - Default ON)

The feature is enabled by default. To disable:

```bash
# .env
CONSOLE_MODEL_ALERT_ENABLED=false
```

### 2. Verify Webhook Configuration

Ensure webhook notifications are enabled in the system:

```bash
# Check webhook config via admin API
curl http://localhost:8080/admin/webhook/configs
```

Or verify through the web admin interface at `/admin-next/`.

## Testing the Feature

### Manual Test

1. Configure a Claude Console account with a test API that returns a non-Claude model
2. Send a request through the relay
3. Verify webhook notification is received

### Expected Alert Payload

```json
{
  "type": "modelAnomaly",
  "service": "claude-relay-service",
  "timestamp": "2026-01-05T10:30:00.000+08:00",
  "data": {
    "apiKeyName": "test-key",
    "apiKeyId": "key_123",
    "accountId": "console_456",
    "accountName": "Test Console Account",
    "detectedModel": "gpt-4-turbo",
    "expectedModels": ["haiku", "sonnet", "opus"]
  }
}
```

## Configuration Reference

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| CONSOLE_MODEL_ALERT_ENABLED | true | Enable/disable model anomaly detection |

## Troubleshooting

### Alerts Not Sending

1. Check feature is enabled:
   ```javascript
   // In Node.js console
   const config = require('./config/config')
   console.log(config.consoleModelAlert.enabled)
   ```

2. Verify webhook is configured and enabled:
   ```bash
   npm run cli status
   ```

3. Check logs for errors:
   ```bash
   tail -f logs/claude-relay-*.log | grep -i "model"
   ```

### Too Many Alerts

Rate limiting is automatic (1 alert per account per minute). If still receiving too many:
- Check if multiple Console accounts are affected
- Review account configurations

### Alert Payload Missing Information

Ensure the Console account has a name configured. Check via admin interface or:
```bash
curl http://localhost:8080/admin/claude-console-accounts
```

## Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `config/config.js` | Modified | Add consoleModelAlert configuration |
| `src/services/claudeConsoleRelayService.js` | Modified | Add model detection hooks |
| `src/services/modelAlertService.js` | New | Model alert business logic |
| `src/utils/modelValidator.js` | New | Claude model validation utility |

## Related Documentation

- [spec.md](./spec.md) - Feature specification
- [research.md](./research.md) - Technical research and decisions
- [data-model.md](./data-model.md) - Data structures and state machine
