# Implementation Plan: Fix Account Group Scheduling Bug

**Branch**: `001-fix-group-scheduling` | **Date**: 2026-01-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-fix-group-scheduling/spec.md`

## Summary

Fix the account group scheduling feature where API keys assigned to account groups are not correctly routing requests to group member accounts. Investigation shows the scheduling code is correct but there may be edge cases or specific scenarios causing failures. The fix involves adding detailed diagnostic logging, validating type comparisons, and ensuring consistent account availability checks across all account types (Claude OAuth, Claude Console, CCR).

## Technical Context

**Language/Version**: Node.js 18+ (ES2020+)
**Primary Dependencies**: Express.js 4.18.2, ioredis 5.3.2, winston 3.11.0
**Storage**: Redis (hash storage with `account_group:{id}` and `account_group_members:{id}` patterns)
**Testing**: Manual testing via API requests with group-assigned API keys; log verification
**Target Platform**: Linux server (Docker container)
**Project Type**: Web application (backend API relay service)
**Performance Goals**: Maintain current request latency (<500ms p95 for scheduling decisions)
**Constraints**: Zero downtime deployment; backward compatible with existing API keys and groups
**Scale/Scope**: ~100 API keys, ~10 account groups, ~50 accounts

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No project-specific constitution defined. Proceeding with standard development practices:
- ✅ Changes are backward compatible
- ✅ No new dependencies introduced
- ✅ Follows existing code patterns
- ✅ Includes appropriate logging for debugging

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-group-scheduling/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── services/
│   ├── unifiedClaudeScheduler.js    # Primary fix location - selectAccountFromGroup()
│   ├── accountGroupService.js       # Group membership management
│   ├── claudeConsoleAccountService.js  # Console account retrieval
│   ├── claudeAccountService.js      # OAuth account retrieval
│   └── apiKeyService.js             # API key data access
├── models/
│   └── redis.js                     # Redis data access layer
└── routes/
    └── admin.js                     # API key update endpoints

web/admin-spa/src/
├── components/
│   ├── apikeys/
│   │   ├── EditApiKeyModal.vue      # API key editing
│   │   └── CreateApiKeyModal.vue    # API key creation
│   └── common/
│       └── AccountSelector.vue      # Group selection component
```

**Structure Decision**: Existing monolithic backend with Vue.js SPA frontend. Changes focused on `src/services/unifiedClaudeScheduler.js` with potential minor updates to related services for enhanced logging.

## Complexity Tracking

No complexity violations. This is a bug fix with minimal scope:
- Single primary file modification (`unifiedClaudeScheduler.js`)
- Enhanced logging (no architectural changes)
- No new patterns or abstractions required
