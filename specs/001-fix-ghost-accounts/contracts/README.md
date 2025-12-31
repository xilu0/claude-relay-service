# API Contracts: Fix Ghost Account Bug

**Feature**: 001-fix-ghost-accounts
**Date**: 2025-12-31

## Overview

This bug fix does not introduce any new API endpoints. All changes are internal behavioral modifications to existing service methods.

## Behavioral Changes

### Affected Internal Methods

These methods now check for account existence before performing write operations:

| Method | Previous Behavior | New Behavior |
|--------|------------------|--------------|
| `blockAccount(id, reason)` | Always wrote to Redis | Returns `null` if account doesn't exist |
| `removeAccountRateLimit(id)` | Always wrote to Redis | Returns `null` if account doesn't exist |
| `markAccountRateLimited(id, duration)` | Always wrote to Redis | Returns `null` if account doesn't exist |
| `markAccountUnauthorized(id, reason)` | Always wrote to Redis | Returns `null` if account doesn't exist |
| `markConsoleAccountBlocked(id, reason)` | Always wrote to Redis | Returns `null` if account doesn't exist |
| `removeAccountBlocked(id)` | Always wrote to Redis | Returns `null` if account doesn't exist |
| `markAccountOverloaded(id, reason)` | Always wrote to Redis | Returns `null` if account doesn't exist |
| `removeAccountOverload(id)` | Always wrote to Redis | Returns `null` if account doesn't exist |

### API Endpoint Impact

| Endpoint | Impact |
|----------|--------|
| `GET /admin/claude-console-accounts` | Ghost accounts no longer appear in list |
| `DELETE /admin/claude-console-accounts/:id` | No change (already works correctly) |
| `PUT /admin/claude-console-accounts/:id` | No change (already has existence check) |

## Backward Compatibility

- All existing API contracts are preserved
- Callers of internal methods should handle `null` return values (already expected pattern)
- No breaking changes to external APIs
