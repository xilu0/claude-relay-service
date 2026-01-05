# Implementation Plan: Claude Console Model Alert

**Branch**: `001-console-model-alert` | **Date**: 2026-01-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-console-model-alert/spec.md`

## Summary

实现Claude Console账户的模型异常检测和告警功能。当Console账户API响应中的模型不属于Claude系列（haiku、sonnet、opus）时，自动触发webhook告警通知。告警包含API Key Name、账户信息、异常模型名称和时间戳。支持告警频率限制（同一账户1分钟内最多1次）和功能开关（默认开启）。

## Technical Context

**Language/Version**: Node.js 18+ (ES2020+)
**Primary Dependencies**: Express.js 4.18.2, ioredis 5.3.2, axios 1.6.0, winston 3.11.0
**Storage**: Redis (existing infrastructure, ioredis client)
**Testing**: Jest 29.7.0 + SuperTest 6.3.3
**Target Platform**: Linux server (Docker/Node.js)
**Project Type**: Single (existing monolith service)
**Performance Goals**: Model validation within 100ms of response receipt
**Constraints**: Non-blocking operation, must not impact existing relay flow latency
**Scale/Scope**: Integrate with existing claudeConsoleRelayService, webhookService

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution file contains template placeholders - no specific gates defined. Following project's existing patterns:

- [x] **Existing Patterns**: Follow claudeConsoleRelayService.js patterns for response handling
- [x] **Webhook Integration**: Use existing webhookService.sendNotification() API
- [x] **Configuration**: Follow config/config.js environment variable patterns
- [x] **Redis Storage**: Use existing redis model patterns for rate limiting
- [x] **Logging**: Use existing winston logger patterns
- [x] **Non-blocking**: Model detection must not block response delivery to client

## Project Structure

### Documentation (this feature)

```text
specs/001-console-model-alert/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # Phase 1 output (N/A - internal feature)
```

### Source Code (repository root)

```text
src/
├── services/
│   ├── claudeConsoleRelayService.js  # Modify: Add model detection hooks
│   ├── webhookService.js             # Existing: Use for notifications
│   └── modelAlertService.js          # New: Model alert logic
├── utils/
│   └── modelValidator.js             # New: Claude model validation
config/
└── config.js                         # Modify: Add feature toggle
```

**Structure Decision**: Extend existing single-project structure. Add new modelAlertService.js for alert logic and modelValidator.js for model validation. Integrate into existing claudeConsoleRelayService.js response handling flow.

## Complexity Tracking

No violations - feature follows existing patterns and infrastructure.
