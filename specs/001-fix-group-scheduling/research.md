# Research: Fix Account Group Scheduling Bug

**Feature**: 001-fix-group-scheduling
**Date**: 2026-01-09
**Status**: Complete

## Research Tasks

### 1. Root Cause Analysis

**Task**: Investigate why group scheduling may fail while direct account assignment works

**Findings**:

Based on production log analysis and code review, the group scheduling code path in `selectAccountFromGroup()` appears to be functioning correctly. Evidence:
- Logs show: `🎯 API key ... is bound to group ..., selecting from group`
- Logs show: `👥 Selecting account from group: ... (claude)`
- Logs show: `🎯 Using sticky session account from group: ... (claude-console)`

**Decision**: The issue is likely scenario-specific, not a systemic code bug. Need enhanced logging to capture specific failure conditions.

**Rationale**: Production logs demonstrate successful group scheduling for multiple API keys. The reported issue may be related to:
1. Specific account availability conditions (all members unavailable)
2. Specific API key configuration edge cases
3. Intermittent timing issues

**Alternatives Considered**:
- Complete rewrite of group scheduling logic (rejected - existing logic is correct)
- Add fallback to shared pool (rejected - would mask the actual issue)

---

### 2. Type Comparison Validation

**Task**: Verify that `isActive` type comparisons are handled correctly for all account types

**Findings**:

Code analysis of `claudeConsoleAccountService.getAccount()` (lines 302-350):
```javascript
accountData.isActive = accountData.isActive === 'true'  // Line 333
accountData.schedulable = accountData.schedulable !== 'false'  // Line 334
```

The service correctly converts Redis string values to JavaScript booleans before returning.

In `selectAccountFromGroup()` (lines 1347-1351):
```javascript
const isActive =
  accountType === 'claude-official'
    ? account.isActive === 'true'
    : account.isActive === true
```

**Decision**: No type comparison bug exists. The code correctly handles:
- Claude OAuth accounts: compares string `'true'` (raw Redis value)
- Claude Console accounts: compares boolean `true` (converted by service)

**Rationale**: The `claudeConsoleAccountService.getAccount()` returns processed data with `isActive` as boolean, while `redis.getClaudeAccount()` returns raw hash data with `isActive` as string. The scheduler code accounts for this difference.

---

### 3. Account Availability Conditions

**Task**: Document all conditions that make an account unavailable for group scheduling

**Findings**:

An account in a group is considered **unavailable** if any of these conditions are true:

| Condition | OAuth Check | Console Check | CCR Check |
|-----------|-------------|---------------|-----------|
| isActive false | `account.isActive === 'true'` fails | `account.isActive === true` fails | `account.isActive === true` fails |
| Bad status | `status !== 'error' && status !== 'blocked'` fails | `status === 'active'` fails | `status === 'active'` fails |
| Not schedulable | `_isSchedulable(schedulable)` returns false | Same | Same |
| Model not supported | `_isModelSupportedByAccount()` returns false | Same | Same |
| Rate limited | `isAccountRateLimited()` returns true | Same | Same |
| Opus rate limited | `isAccountOpusRateLimited()` returns true | N/A | N/A |
| Concurrency limit | N/A | `currentConcurrency >= maxConcurrentTasks` | N/A |

**Decision**: Add detailed logging for each availability check to identify exactly why accounts are being skipped.

---

### 4. Logging Enhancement Strategy

**Task**: Determine what additional logging is needed to diagnose issues

**Findings**:

Current logging in `selectAccountFromGroup()`:
- ✅ Logs when entering group selection
- ✅ Logs when sticky session is used
- ✅ Logs when account not found
- ❌ Does NOT log individual account availability check results
- ❌ Does NOT log why specific accounts were skipped

**Decision**: Add per-account availability check logging:
```javascript
logger.info(`📋 Checking group member: ${account.name} (${memberId}) - ` +
  `isActive: ${isActive}, status: ${status}, schedulable: ${account.schedulable}`)
```

**Rationale**: Without per-account logging, it's impossible to determine why group scheduling fails when all accounts appear healthy in the database.

---

### 5. Error Code Standardization

**Task**: Define error codes for group scheduling failures

**Findings**:

Current error handling throws generic Error with message strings. Need structured error codes.

**Decision**: Use these error codes:

| Error Code | Condition | HTTP Status |
|------------|-----------|-------------|
| `GROUP_NOT_FOUND` | Group ID doesn't exist | 404 |
| `GROUP_EMPTY` | Group has no members | 503 |
| `NO_AVAILABLE_ACCOUNTS_IN_GROUP` | All members unavailable | 503 |
| `GROUP_DEDICATED_RATE_LIMITED` | All members rate limited | 429 |

**Rationale**: Structured error codes enable:
- Better frontend error handling
- Easier log analysis
- Consistent API responses

---

## Summary of Decisions

1. **No systemic code bug** - Group scheduling logic is correct
2. **Enhanced logging required** - Add per-account availability check logs
3. **Error code standardization** - Introduce structured error codes
4. **No type comparison issues** - Code correctly handles string vs boolean `isActive`
5. **Backward compatible** - All changes are additive (logging, error codes)

## Next Steps

Proceed to Phase 1 with:
- Data model documentation (existing entities)
- No new API contracts needed (bug fix only)
- Quickstart guide for testing the fix
