# Research: Fix Ghost Account Bug

**Feature**: 001-fix-ghost-accounts
**Date**: 2025-12-31

## Problem Statement

Deleted Claude Console accounts occasionally reappear in the system with:
- `status: "error"`
- `errorMessage: "Account not found"`
- Missing required fields (email, apiUrl, apiKey, etc.)

## Root Cause Investigation

### Finding 1: Redis hset Creates New Hashes

**Discovery**: Redis `hset()` command creates a new hash if the key doesn't exist.

```javascript
// This creates claude_console_account:{id} even if it didn't exist before
await client.hset(`claude_console_account:${accountId}`, { status: 'blocked' })
```

**Impact**: Background services calling update methods on deleted accounts inadvertently recreate partial records.

### Finding 2: Methods Missing Existence Checks

**Analysis of claudeConsoleAccountService.js** (1,522 lines):

| Method | Line | Has Check | Uses hset |
|--------|------|-----------|-----------|
| `updateAccount()` | 286 | Yes | Yes |
| `deleteAccount()` | 432 | Yes | No (uses del) |
| `blockAccount()` | 1010 | **No** | Yes |
| `removeAccountRateLimit()` | 525 | **No** | Yes |
| `markAccountRateLimited()` | 459 | **No** | Yes |
| `markAccountUnauthorized()` | 690 | **No** | Yes |
| `markConsoleAccountBlocked()` | 736 | **No** | Yes |
| `removeAccountBlocked()` | 802 | **No** | Yes |
| `markAccountOverloaded()` | 913 | **No** | Yes |
| `removeAccountOverload()` | 955 | **No** | Yes |

### Finding 3: rateLimitCleanupService Triggers Issue

**File**: `src/services/rateLimitCleanupService.js` (lines 282-340)

The `cleanupClaudeConsoleAccounts()` method:
1. Calls `getAllAccounts()` to get all account IDs
2. For each account, calls `updateAccount()` or `removeAccountRateLimit()`
3. If account was deleted between step 1 and 2, these calls recreate partial records

### Finding 4: Existing Pattern Available

**Good example from updateAccount() lines 286-290**:
```javascript
const existingAccount = await client.hgetall(`${this.ACCOUNT_KEY_PREFIX}${accountId}`)
if (!existingAccount || Object.keys(existingAccount).length === 0) {
  logger.warn('Account not found for update:', accountId)
  throw new Error('Account not found')
}
```

## Solution Decision

**Decision**: Add existence validation guard to all affected methods

**Rationale**:
1. **Minimal change**: Only requires adding a check at the start of each method
2. **Follows existing patterns**: Same approach used in `updateAccount()`
3. **Prevents issue at source**: No partial records can be created
4. **Backward compatible**: Methods return null instead of throwing (to not break callers)

**Alternatives Rejected**:

| Alternative | Reason Rejected |
|-------------|-----------------|
| Soft deletes | Adds complexity; doesn't prevent underlying issue |
| Redis key TTL | Accounts are long-lived; doesn't solve race conditions |
| Distributed locks | Over-engineered for this use case |
| Event sourcing | Major architectural change for simple bug fix |

## Implementation Approach

### Helper Method

Create reusable `accountExists(accountId)` method:
- Checks if Redis hash exists
- Validates required fields are present
- Returns boolean (safe for conditional checks)

### Apply to Each Affected Method

Pattern:
```javascript
async methodName(accountId, ...args) {
  if (!await this.accountExists(accountId)) {
    logger.warn(`⚠️ Attempted to ${action} non-existent account: ${accountId}`)
    return null
  }
  // ... existing implementation
}
```

### Ghost Account Cleanup

Enhance `getAllAccounts()` to:
1. Filter out accounts missing required fields
2. Optionally delete invalid accounts automatically
3. Log when ghost accounts are detected and cleaned

## Verification Plan

1. **Unit test**: Mock Redis, verify no hset on non-existent account
2. **Integration test**: Delete account, run cleanup, verify no resurrection
3. **Manual test**: Check dashboard shows no ghost accounts after fix
