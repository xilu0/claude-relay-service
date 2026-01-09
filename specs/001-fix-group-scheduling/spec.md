# Feature Specification: Fix Account Group Scheduling Bug

**Feature Branch**: `001-fix-group-scheduling`
**Created**: 2026-01-09
**Status**: Implemented
**Input**: User description: "我发现帐号分组调度未生效，即给某个api key配置专属帐号到指定分组未成功调度，直接设置专属帐号是有效的。需要找到根因，解决"

## Investigation Summary

### Current Behavior Analysis

Based on production log analysis, the account group scheduling system **appears to be working correctly** in most cases:

1. API keys bound to groups are correctly detected: `🎯 API key ... is bound to group ...`
2. The scheduler correctly selects accounts from groups: `👥 Selecting account from group: ...`
3. Sticky sessions work within groups: `🎯 Using sticky session account from group: ...`

### Potential Root Causes Identified

1. **Account Availability Issues**: Group members may have:
   - `schedulable: false` - Account excluded from scheduling
   - `status: unauthorized` or `status: error` - Account not in active state
   - `isActive: false` - Account disabled

2. **Empty Groups**: Groups with no available members will fail scheduling

3. **Type Comparison Bug (Potential)**: In `selectAccountFromGroup()`, the `isActive` check for Claude Console accounts compares `account.isActive === true`, but if `getAccount()` doesn't properly convert the Redis string to boolean, this comparison would fail

4. **Logging Anomaly**: Logs show `accountType: group` which is not a valid account type - this suggests a logging bug or incorrect data flow

5. **Retry Service Pool Issue** *(Root Cause Found)*: The `_getAllAvailableAccounts()` method is called by `consoleAccountRetryService` for building the retry pool. When `claudeAccountId` contains `group:` prefix, this method tries to look it up as a regular OAuth account (which fails), then falls back to the shared pool. The shared pool excludes accounts with `accountType: group`, causing the originally selected group account to be bypassed in favor of shared pool accounts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin Assigns API Key to Account Group (Priority: P1)

An administrator wants to assign an API key to an account group so that requests using that API key are routed to accounts within the specified group.

**Why this priority**: This is the core functionality that is reported as broken. Without this working, the entire group scheduling feature is unusable.

**Independent Test**: Can be tested by creating an API key, assigning it to a group with available accounts, and verifying requests are routed to group members.

**Acceptance Scenarios**:

1. **Given** an API key is assigned to a group with at least one available account, **When** a request is made using that API key, **Then** the request is routed to an account within the assigned group
2. **Given** an API key is assigned to a group, **When** the group has multiple available accounts, **Then** the scheduler selects accounts based on priority and load balancing rules
3. **Given** an API key is assigned to a group, **When** a sticky session exists for the request, **Then** the same account is used if it's still available and belongs to the group

---

### User Story 2 - Graceful Fallback When Group Has No Available Accounts (Priority: P2)

When all accounts in a group are unavailable (rate limited, unauthorized, disabled, or not schedulable), the system should provide clear error feedback.

**Why this priority**: Important for operational visibility and debugging, but secondary to core functionality.

**Independent Test**: Can be tested by assigning an API key to a group where all accounts are unavailable and verifying the error response.

**Acceptance Scenarios**:

1. **Given** an API key is assigned to a group with no available accounts, **When** a request is made, **Then** the system returns a clear error message indicating no accounts are available in the group
2. **Given** an API key is assigned to a group, **When** all accounts become unavailable during operation, **Then** subsequent requests fail with appropriate error messages

---

### User Story 3 - Direct Account Assignment Works Correctly (Priority: P3)

Direct account assignment (without groups) should continue to work as expected, serving as a baseline for comparison.

**Why this priority**: This is reported as working correctly, so it's lower priority but important for regression testing.

**Independent Test**: Can be tested by assigning an API key directly to an account and verifying requests are routed to that specific account.

**Acceptance Scenarios**:

1. **Given** an API key is directly assigned to a specific account, **When** a request is made, **Then** the request is routed to that specific account
2. **Given** an API key is directly assigned to an unavailable account, **When** a request is made, **Then** the system falls back to the shared pool with appropriate logging

---

### Edge Cases

- What happens when a group exists but has zero members?
- How does the system handle when the assigned group ID doesn't exist?
- What happens when an account is removed from a group while a sticky session points to it?
- How does the system behave when all group members are rate limited simultaneously?
- What happens when the `claudeAccountId` field contains an invalid `group:` prefix format?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST correctly parse `group:` prefix in `claudeAccountId` field and route to group scheduling logic
- **FR-002**: System MUST iterate through all group members and check availability using consistent type comparisons
- **FR-003**: System MUST correctly handle both Claude OAuth accounts (`claude:account:`) and Claude Console accounts (`claude_console_account:`) within the same group
- **FR-004**: System MUST log detailed information when group scheduling fails, including which accounts were checked and why they were unavailable
- **FR-005**: System MUST return appropriate error codes when group scheduling fails (e.g., `GROUP_NOT_FOUND`, `NO_AVAILABLE_ACCOUNTS_IN_GROUP`)
- **FR-006**: System MUST maintain sticky session behavior within groups - same session should use same account if available

### Key Entities

- **API Key**: Contains `claudeAccountId` field which may hold `group:{groupId}` value
- **Account Group**: Contains group metadata (id, name, platform) and references to member accounts
- **Group Members**: Set of account IDs belonging to a group, stored in `account_group_members:{groupId}`
- **Account**: Individual Claude OAuth or Console account with availability status (isActive, status, schedulable)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: API keys assigned to groups with available accounts successfully route 100% of requests to group members
- **SC-002**: Group scheduling logs clearly indicate which account was selected and why
- **SC-003**: When group scheduling fails, error messages clearly indicate the reason (empty group, no available accounts, group not found)
- **SC-004**: Direct account assignment continues to work with 100% success rate (no regression)
- **SC-005**: Sticky sessions within groups maintain consistency - same session uses same account across requests when available

## Assumptions

- The `claudeConsoleAccountService.getAccount()` method correctly converts Redis string values to appropriate JavaScript types (boolean for `isActive`, etc.)
- Group membership data in Redis (`account_group_members:{groupId}`) is accurate and up-to-date
- The frontend correctly sends `group:{groupId}` format when a group is selected in the API key configuration
