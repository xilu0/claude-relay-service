# Implementation Plan: Fix Ghost Account Bug After Deletion

**Branch**: `001-fix-ghost-accounts` | **Date**: 2025-12-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-fix-ghost-accounts/spec.md`

## Summary

Fix a bug where deleted Claude Console accounts reappear as ghost accounts with `status: "error"` and `errorMessage: "Account not found"`. The root cause is that Redis `hset()` operations in background services create new hashes when called on non-existent account IDs. The fix adds existence validation before all write operations in `claudeConsoleAccountService.js`.

## Technical Context

**Language/Version**: Node.js 18+ (>=18.0.0 per package.json)
**Primary Dependencies**: Express.js 4.18.2, ioredis 5.3.2, winston 3.11.0
**Storage**: Redis (hash storage with `claude_console_account:{id}` key pattern)
**Testing**: Jest 29.7.0 with SuperTest 6.3.3
**Target Platform**: Linux server (Docker deployment supported)
**Project Type**: Web application (Express.js backend + Vue.js admin SPA)
**Performance Goals**: N/A (bug fix, no performance changes)
**Constraints**: Must not break existing API contracts; backward compatible
**Scale/Scope**: Single service file modification + cleanup service update

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution not yet configured for this project (template placeholders present). Proceeding with standard Node.js best practices:

| Gate | Status | Notes |
|------|--------|-------|
| Code formatting | PASS | Prettier configured, will run before commit |
| Testing | PASS | Jest available, tests will be added |
| Logging | PASS | Winston logger with structured format in use |
| Error handling | PASS | Following existing try/catch patterns |

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-ghost-accounts/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── services/
│   ├── claudeConsoleAccountService.js  # PRIMARY: Add existence checks
│   └── rateLimitCleanupService.js      # SECONDARY: Update cleanup logic
├── routes/
│   └── admin.js                        # Reference only (calls service methods)
└── utils/
    └── logger.js                       # Existing logging utility

tests/                                  # Currently empty - tests to be added
```

**Structure Decision**: This is a bug fix within the existing monolithic structure. Changes are isolated to `src/services/claudeConsoleAccountService.js` with a secondary update to `src/services/rateLimitCleanupService.js`.

## Complexity Tracking

No constitution violations. This is a straightforward defensive programming fix.

## Phase 0: Research Findings

### Root Cause Analysis

**Decision**: Add existence validation guard at the start of all Redis write operations

**Rationale**:
- Redis `hset()` creates a new hash if the key doesn't exist
- When background services (rate limit cleanup, status updates) call methods like `blockAccount()` or `removeAccountRateLimit()` on a deleted account ID, they inadvertently recreate partial records
- These partial records lack required fields (apiUrl, apiKey, name) and appear as ghost accounts

**Alternatives Considered**:
1. ~~Soft deletes~~ - Rejected: Adds complexity, doesn't prevent the underlying issue
2. ~~Redis key expiration~~ - Rejected: Accounts are long-lived, doesn't solve race conditions
3. **Existence check before write** - Chosen: Minimal change, follows existing patterns, prevents issue at source

### Affected Methods

| Method | Line | Current Behavior | Required Change |
|--------|------|-----------------|-----------------|
| `updateAccount()` | 286 | Has existence check | No change needed |
| `deleteAccount()` | 432 | Properly deletes | No change needed |
| `blockAccount()` | 1010 | No check, uses hset | Add existence check |
| `removeAccountRateLimit()` | 525 | No check, uses hset | Add existence check |
| `markAccountRateLimited()` | 459 | No check, uses hset | Add existence check |
| `markAccountUnauthorized()` | 690 | No check, uses hset | Add existence check |
| `markConsoleAccountBlocked()` | 736 | No check, uses hset | Add existence check |
| `removeAccountBlocked()` | 802 | No check, uses hset | Add existence check |
| `markAccountOverloaded()` | 913 | No check, uses hset | Add existence check |
| `removeAccountOverload()` | 955 | No check, uses hset | Add existence check |

### Existence Check Pattern

```javascript
// Pattern from updateAccount() - lines 286-290
const existingAccount = await client.hgetall(`${this.ACCOUNT_KEY_PREFIX}${accountId}`)
if (!existingAccount || Object.keys(existingAccount).length === 0) {
  logger.warn(`⚠️ Attempted to update non-existent account: ${accountId}`)
  return null  // or throw new Error('Account not found')
}
```

### Ghost Account Cleanup

**Decision**: Add validation in `getAllAccounts()` to detect and remove invalid accounts

**Required Fields for Valid Account**:
- `id` (string, required)
- `name` (string, required)
- `platform` (string, must be 'claude-console')
- `apiUrl` (string, required)
- `apiKey` (string, encrypted, required)

## Phase 1: Design

### Data Model

See [data-model.md](./data-model.md) for detailed entity definitions.

**Claude Console Account - Required Fields**:
```
id: string (UUID)
name: string (display name)
platform: 'claude-console'
apiUrl: string (Claude Console API endpoint)
apiKey: string (encrypted)
status: 'active' | 'error' | 'blocked' | 'rate_limited'
```

**Ghost Account Detection Criteria**:
An account record is considered a ghost if ANY of these are true:
- Missing `id` field
- Missing `name` field
- Missing `apiUrl` field
- Missing `apiKey` field
- `platform` is not 'claude-console'

### API Contracts

No new API endpoints. Existing endpoints maintain backward compatibility.

**Behavioral Changes** (internal, not API-breaking):
- Write operations on non-existent accounts now return early/log warning
- `getAllAccounts()` filters out and cleans up ghost accounts
- Dashboard lists only show valid accounts

### Implementation Strategy

**Approach**: Create a reusable existence check helper method

```javascript
/**
 * Check if account exists and has valid required fields
 * @param {string} accountId - Account ID to check
 * @returns {Promise<boolean>} - True if account exists and is valid
 */
async accountExists(accountId) {
  const client = redis.getClientSafe()
  const accountData = await client.hgetall(`${this.ACCOUNT_KEY_PREFIX}${accountId}`)

  if (!accountData || Object.keys(accountData).length === 0) {
    return false
  }

  // Check required fields
  const requiredFields = ['id', 'name', 'apiUrl', 'apiKey']
  return requiredFields.every(field => accountData[field])
}
```

**Apply to each affected method**:
```javascript
async blockAccount(accountId, reason) {
  if (!await this.accountExists(accountId)) {
    logger.warn(`⚠️ Attempted to block non-existent account: ${accountId}`)
    return null
  }
  // ... existing implementation
}
```

### Testing Strategy

**Unit Tests** (new file: `src/services/__tests__/claudeConsoleAccountService.test.js`):
1. Test `accountExists()` returns false for non-existent ID
2. Test `accountExists()` returns false for partial/ghost account
3. Test `accountExists()` returns true for valid account
4. Test each affected method returns null/early when account doesn't exist
5. Test that no Redis hset is called when account doesn't exist

**Integration Tests**:
1. Delete account → verify gone from all listings
2. Delete account → run cleanup service → verify no resurrection
3. Create ghost account manually → verify cleanup removes it

## Quickstart

See [quickstart.md](./quickstart.md) for step-by-step implementation guide.

## Next Steps

Run `/speckit.tasks` to generate the detailed task breakdown.
