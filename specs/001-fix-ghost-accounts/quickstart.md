# Quickstart: Fix Ghost Account Bug

**Feature**: 001-fix-ghost-accounts
**Date**: 2025-12-31

## Prerequisites

- Node.js 18+
- Redis running locally or accessible
- Project dependencies installed (`npm install`)

## Step-by-Step Implementation

### Step 1: Add accountExists() Helper Method

**File**: `src/services/claudeConsoleAccountService.js`

Add this method to the ClaudeConsoleAccountService class:

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

### Step 2: Add Existence Check to Each Affected Method

For each of these methods, add the guard at the beginning:

#### blockAccount() - around line 1010
```javascript
async blockAccount(accountId, reason) {
  if (!await this.accountExists(accountId)) {
    logger.warn(`⚠️ Attempted to block non-existent account: ${accountId}`)
    return null
  }
  // ... rest of existing implementation
}
```

#### removeAccountRateLimit() - around line 525
```javascript
async removeAccountRateLimit(accountId) {
  if (!await this.accountExists(accountId)) {
    logger.warn(`⚠️ Attempted to remove rate limit for non-existent account: ${accountId}`)
    return null
  }
  // ... rest of existing implementation
}
```

#### markAccountRateLimited() - around line 459
```javascript
async markAccountRateLimited(accountId, duration) {
  if (!await this.accountExists(accountId)) {
    logger.warn(`⚠️ Attempted to mark rate limited non-existent account: ${accountId}`)
    return null
  }
  // ... rest of existing implementation
}
```

#### markAccountUnauthorized() - around line 690
```javascript
async markAccountUnauthorized(accountId, reason) {
  if (!await this.accountExists(accountId)) {
    logger.warn(`⚠️ Attempted to mark unauthorized non-existent account: ${accountId}`)
    return null
  }
  // ... rest of existing implementation
}
```

#### markConsoleAccountBlocked() - around line 736
```javascript
async markConsoleAccountBlocked(accountId, reason) {
  if (!await this.accountExists(accountId)) {
    logger.warn(`⚠️ Attempted to mark blocked non-existent account: ${accountId}`)
    return null
  }
  // ... rest of existing implementation
}
```

#### removeAccountBlocked() - around line 802
```javascript
async removeAccountBlocked(accountId) {
  if (!await this.accountExists(accountId)) {
    logger.warn(`⚠️ Attempted to remove blocked status for non-existent account: ${accountId}`)
    return null
  }
  // ... rest of existing implementation
}
```

#### markAccountOverloaded() - around line 913
```javascript
async markAccountOverloaded(accountId, reason) {
  if (!await this.accountExists(accountId)) {
    logger.warn(`⚠️ Attempted to mark overloaded non-existent account: ${accountId}`)
    return null
  }
  // ... rest of existing implementation
}
```

#### removeAccountOverload() - around line 955
```javascript
async removeAccountOverload(accountId) {
  if (!await this.accountExists(accountId)) {
    logger.warn(`⚠️ Attempted to remove overload status for non-existent account: ${accountId}`)
    return null
  }
  // ... rest of existing implementation
}
```

### Step 3: Add Ghost Account Cleanup to getAllAccounts()

**File**: `src/services/claudeConsoleAccountService.js`

In the `getAllAccounts()` method, add validation and cleanup:

```javascript
async getAllAccounts() {
  const client = redis.getClientSafe()
  const keys = await client.keys(`${this.ACCOUNT_KEY_PREFIX}*`)
  const accounts = []
  const ghostAccountIds = []

  for (const key of keys) {
    const accountData = await client.hgetall(key)

    // Validate required fields
    if (!this.isValidAccountData(accountData)) {
      const accountId = key.replace(this.ACCOUNT_KEY_PREFIX, '')
      ghostAccountIds.push(accountId)
      logger.warn(`⚠️ Detected ghost account: ${accountId}`)
      continue  // Skip invalid accounts
    }

    accounts.push(this.parseAccountData(accountData))
  }

  // Cleanup ghost accounts in background
  if (ghostAccountIds.length > 0) {
    this.cleanupGhostAccounts(ghostAccountIds).catch(err => {
      logger.error('Failed to cleanup ghost accounts:', err)
    })
  }

  return accounts
}

isValidAccountData(accountData) {
  if (!accountData || Object.keys(accountData).length === 0) {
    return false
  }
  const requiredFields = ['id', 'name', 'apiUrl', 'apiKey']
  return requiredFields.every(field => accountData[field])
}

async cleanupGhostAccounts(accountIds) {
  const client = redis.getClientSafe()
  for (const accountId of accountIds) {
    await client.del(`${this.ACCOUNT_KEY_PREFIX}${accountId}`)
    logger.info(`🧹 Cleaned up ghost account: ${accountId}`)
  }
}
```

### Step 4: Run Tests

```bash
# Run linting
npm run lint

# Run tests (once test file is created)
npm test

# Start the service and verify
npm run dev
```

### Step 5: Manual Verification

1. Open admin dashboard at `/admin-next/`
2. Verify no ghost accounts appear in Claude Console accounts list
3. Delete an account
4. Wait for cleanup service to run (or trigger manually)
5. Verify deleted account doesn't reappear

## Verification Checklist

- [ ] `accountExists()` helper added
- [ ] All 8 affected methods have existence checks
- [ ] `getAllAccounts()` filters and cleans ghost accounts
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] Manual verification confirms no ghost accounts
- [ ] Code formatted with Prettier
