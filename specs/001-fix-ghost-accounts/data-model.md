# Data Model: Fix Ghost Account Bug

**Feature**: 001-fix-ghost-accounts
**Date**: 2025-12-31

## Entities

### Claude Console Account

**Storage**: Redis Hash
**Key Pattern**: `claude_console_account:{id}`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string (UUID) | Yes | Unique account identifier |
| name | string | Yes | Display name for the account |
| platform | string | Yes | Must be 'claude-console' |
| apiUrl | string | Yes | Claude Console API endpoint URL |
| apiKey | string (encrypted) | Yes | API key for authentication |
| status | enum | No | 'active', 'error', 'blocked', 'rate_limited' |
| isActive | boolean | No | Whether account is enabled |
| priority | number | No | Scheduling priority (1-100) |
| proxy | JSON string | No | Proxy configuration |
| description | string | No | Account description |
| createdAt | ISO datetime | No | Creation timestamp |
| updatedAt | ISO datetime | No | Last update timestamp |
| lastUsedAt | ISO datetime | No | Last usage timestamp |
| errorMessage | string | No | Error details if status is 'error' |
| rateLimitedAt | ISO datetime | No | When rate limiting started |
| blockedAt | ISO datetime | No | When blocking started |
| overloadedAt | ISO datetime | No | When overload started |

**Validation Rules**:
- `id` must be a valid UUID
- `name` must be non-empty string
- `apiUrl` must be valid URL
- `apiKey` must be non-empty (stored encrypted)
- `platform` must equal 'claude-console'

### Ghost Account (Invalid State)

A ghost account is a Redis hash that exists but is missing required fields.

**Detection Criteria**:
```
isGhostAccount = (
  !accountData.id ||
  !accountData.name ||
  !accountData.apiUrl ||
  !accountData.apiKey ||
  accountData.platform !== 'claude-console'
)
```

**Example Ghost Account Data**:
```json
{
  "id": "a2559e14-793a-4d97-a1db-007cebe305c1",
  "status": "error",
  "errorMessage": "Account not found",
  "platform": "claude",
  "schedulable": "true"
}
```

Note: Missing `name`, `apiUrl`, `apiKey` - this is a ghost account.

## State Transitions

### Account Lifecycle

```
┌─────────────┐
│   Created   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│   Active    │◄───►│ Rate Limited│
└──────┬──────┘     └─────────────┘
       │
       ├─────────────►┌─────────────┐
       │              │   Blocked   │
       │              └─────────────┘
       │
       ▼
┌─────────────┐
│   Deleted   │ ─ ─ ─ ▶ (No Redis key exists)
└─────────────┘
```

### Deletion Process

```
Before Fix:
1. deleteAccount() removes Redis hash
2. Background service calls updateAccount() on deleted ID
3. Redis hset creates partial hash ← BUG!
4. Ghost account appears in listings

After Fix:
1. deleteAccount() removes Redis hash
2. Background service calls updateAccount() on deleted ID
3. accountExists() returns false
4. Method returns early without Redis write ← FIXED!
5. No ghost account created
```

## Redis Key Patterns

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `claude_console_account:{id}` | Hash | Account data |
| `shared_claude_console_accounts` | Set | Set of active account IDs |
| `rate_limit:{accountId}` | String | Rate limit state |
| `overload:{accountId}` | String | Overload state |

## Data Integrity Checks

### Required Fields Validation

```javascript
const REQUIRED_FIELDS = ['id', 'name', 'apiUrl', 'apiKey']

function isValidAccount(accountData) {
  if (!accountData || Object.keys(accountData).length === 0) {
    return false
  }
  return REQUIRED_FIELDS.every(field => accountData[field])
}
```

### Ghost Account Cleanup Query

```javascript
// Pseudo-code for cleanup
async function cleanupGhostAccounts() {
  const keys = await client.keys('claude_console_account:*')
  for (const key of keys) {
    const data = await client.hgetall(key)
    if (!isValidAccount(data)) {
      await client.del(key)
      logger.warn(`Cleaned up ghost account: ${key}`)
    }
  }
}
```
