# Feature Specification: Fix Ghost Account Bug After Deletion

**Feature Branch**: `001-fix-ghost-accounts`
**Created**: 2025-12-31
**Status**: Draft
**Input**: User description: "删除claude console帐号后，有概率会再出现异常状态的帐号，status: error, errorMessage: Account not found"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Deletes Claude Console Account Permanently (Priority: P1)

An administrator deletes a Claude Console account from the management dashboard. The account should be completely removed and never reappear in any system listing or API response, regardless of any background cleanup processes running.

**Why this priority**: This is the core bug being fixed. Ghost accounts cause confusion, pollute the dashboard, and may interfere with account scheduling/selection logic.

**Independent Test**: Can be fully tested by deleting a Claude Console account, waiting for cleanup cycles to run, and verifying the account never reappears in any listing.

**Acceptance Scenarios**:

1. **Given** an existing Claude Console account in the system, **When** admin deletes the account via the dashboard, **Then** the account is completely removed from all data structures and never appears in subsequent account listings.

2. **Given** a deleted Claude Console account, **When** the rate limit cleanup service runs its periodic cleanup cycle, **Then** no partial account data is recreated.

3. **Given** a deleted Claude Console account, **When** any background service attempts to update account status (rate limit, block, usage reset), **Then** the operation is silently skipped without creating any new data.

---

### User Story 2 - System Validates Account Existence Before Updates (Priority: P1)

All background services and maintenance routines that update account data must first verify the account exists with valid required fields before performing any write operations.

**Why this priority**: This prevents the root cause of the bug - background services recreating deleted accounts by writing partial data to non-existent storage locations.

**Independent Test**: Can be tested by mocking a scenario where cleanup service attempts to update a non-existent account ID and verifying no data is created.

**Acceptance Scenarios**:

1. **Given** a non-existent account ID, **When** `updateAccount()` is called with any updates, **Then** the operation returns early without creating any data.

2. **Given** a non-existent account ID, **When** `removeAccountRateLimit()` is called, **Then** no data is created or modified.

3. **Given** a non-existent account ID, **When** `blockAccount()` is called, **Then** no data is created or modified.

---

### User Story 3 - System Cleans Up Invalid Account Data (Priority: P2)

The system should detect and clean up any existing ghost accounts (accounts with missing required fields) during startup or periodic maintenance.

**Why this priority**: This addresses existing corrupted data and provides ongoing protection against future occurrences.

**Independent Test**: Can be tested by manually creating a partial account record (simulating a ghost account) and verifying the cleanup routine removes it.

**Acceptance Scenarios**:

1. **Given** an account record with ID but missing required fields (apiUrl, apiKey, name), **When** the account listing is retrieved, **Then** the invalid account is automatically cleaned up and not returned in the listing.

2. **Given** existing ghost accounts in the system, **When** admin views the accounts dashboard, **Then** only valid accounts with all required fields are displayed.

---

### Edge Cases

- What happens when deletion occurs while a cleanup job is actively processing that account? The cleanup job should handle the race condition gracefully by checking existence before each write.
- How does the system handle accounts that were corrupted by previous bug occurrences? Existing ghost accounts should be detected by missing required fields and cleaned up automatically.
- What happens if storage connection fails during the existence check? The update operation should fail safely without creating partial data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST verify account existence (valid record with required fields) before any update operation.
- **FR-002**: System MUST NOT create new account records when updating non-existent accounts - operations must be no-ops.
- **FR-003**: The `deleteAccount()` operation MUST ensure complete removal of all associated data structures for the account.
- **FR-004**: The `getAllAccounts()` method MUST filter out and clean up any accounts missing required fields (id, name, platform, apiUrl/apiKey or equivalent credentials).
- **FR-005**: The rate limit cleanup service MUST check account existence before attempting to update rate limit status.
- **FR-006**: The `blockAccount()` method MUST verify account exists before writing block status.
- **FR-007**: The `removeAccountRateLimit()` method MUST verify account exists before clearing rate limit data.
- **FR-008**: The `removeAccountBlocked()` method MUST verify account exists before clearing blocked status.
- **FR-009**: The `resetDailyUsage()` method MUST verify account exists before resetting usage data.
- **FR-010**: System MUST log a warning when an update operation is skipped due to non-existent account, for debugging purposes.

### Key Entities

- **Claude Console Account**: Represents a Claude Console API account with required fields including id, name, platform, apiUrl, apiKey, status.
- **Ghost Account**: An invalid account state where a record exists with account ID but is missing required fields - these should be detected and removed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After deleting any Claude Console account, 100% of subsequent account listings (within any time window) show zero instances of that account ID.
- **SC-002**: Zero ghost accounts appear in the admin dashboard after running the cleanup service.
- **SC-003**: All update operations on non-existent accounts complete without error and without creating any data.
- **SC-004**: Existing ghost accounts in the system are automatically cleaned up within one cleanup cycle.

## Assumptions

- The bug affects Claude Console accounts specifically, though the same pattern may exist in other account services and should be reviewed.
- The required fields for a valid Claude Console account are: id, name, platform, apiUrl, apiKey.
- Background cleanup services run periodically and may process accounts at any time.
- Write operations to non-existent records in the storage layer can create partial records - this is the underlying cause of ghost account creation.
