# Tasks: Fix Account Group Scheduling Bug

**Input**: Design documents from `/specs/001-fix-group-scheduling/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: No automated tests requested - manual testing via API requests and log verification per quickstart.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `src/services/`, `src/models/`, `src/routes/` at repository root
- **Frontend**: `web/admin-spa/src/` at repository root

---

## Phase 1: Setup (Investigation & Preparation) ✅

**Purpose**: Verify current state and prepare for implementation

- [x] T001 Review current `selectAccountFromGroup()` implementation in src/services/unifiedClaudeScheduler.js (lines 1252-1439)
- [x] T002 Document current logging points in group scheduling flow in src/services/unifiedClaudeScheduler.js
- [x] T003 Identify all account availability check conditions in src/services/unifiedClaudeScheduler.js (lines 1347-1402)

---

## Phase 2: Foundational (Error Code Definitions) ✅

**Purpose**: Define structured error codes that all user stories will use

**⚠️ CRITICAL**: Error codes must be defined before implementing improved error handling

- [x] T004 Define GROUP_NOT_FOUND error constant and handling in src/services/unifiedClaudeScheduler.js
- [x] T005 [P] Define GROUP_EMPTY error constant and handling in src/services/unifiedClaudeScheduler.js
- [x] T006 [P] Define NO_AVAILABLE_ACCOUNTS_IN_GROUP error constant and handling in src/services/unifiedClaudeScheduler.js
- [x] T007 [P] Define GROUP_DEDICATED_RATE_LIMITED error constant and handling in src/services/unifiedClaudeScheduler.js

**Checkpoint**: ✅ Error codes defined - user story implementation can now begin

---

## Phase 3: User Story 1 - Core Group Scheduling Fix (Priority: P1) 🎯 MVP ✅

**Goal**: Ensure API keys assigned to account groups correctly route requests to group member accounts with detailed diagnostic logging

**Independent Test**: Assign API key to group with available accounts, make request, verify logs show account selection from group and request succeeds

### Implementation for User Story 1

- [x] T008 [US1] Add per-member availability check logging in selectAccountFromGroup() at src/services/unifiedClaudeScheduler.js (after line 1311)
- [x] T009 [US1] Add detailed log entry for each group member showing isActive, status, schedulable values in src/services/unifiedClaudeScheduler.js
- [x] T010 [US1] Add log entry when account is skipped with specific reason (rate limited, not schedulable, etc.) in src/services/unifiedClaudeScheduler.js
- [x] T011 [US1] Add summary log showing total members checked vs available after member iteration in src/services/unifiedClaudeScheduler.js
- [x] T012 [US1] Add log entry showing final selected account with selection reason (priority, load balancing) in src/services/unifiedClaudeScheduler.js
- [x] T013 [US1] Verify sticky session logging includes group context in src/services/unifiedClaudeScheduler.js (lines 1268-1296)

**Checkpoint**: ✅ Group scheduling now provides detailed diagnostic logs for all account selection decisions

---

## Phase 4: User Story 2 - Clear Error Feedback (Priority: P2) ✅

**Goal**: When group scheduling fails, provide clear error messages indicating the specific reason

**Independent Test**: Assign API key to group where all accounts are unavailable, make request, verify error response includes group name and reason

### Implementation for User Story 2

- [x] T014 [US2] Update error throw for group not found to include GROUP_NOT_FOUND code in src/services/unifiedClaudeScheduler.js (line 1262)
- [x] T015 [US2] Update error throw for empty group to include GROUP_EMPTY code and group name in src/services/unifiedClaudeScheduler.js (line 1301)
- [x] T016 [US2] Update error throw for no available accounts to include NO_AVAILABLE_ACCOUNTS_IN_GROUP code with checked account count in src/services/unifiedClaudeScheduler.js (line 1406)
- [x] T017 [US2] Add error property for unavailable account reasons (summary of why each was skipped) in src/services/unifiedClaudeScheduler.js
- [x] T018 [US2] Ensure error messages propagate correctly to API response in relay service handlers

**Checkpoint**: ✅ Group scheduling failures now return structured errors with actionable information

---

## Phase 5: User Story 3 - Regression Protection (Priority: P3) ✅

**Goal**: Ensure direct account assignment continues working correctly

**Independent Test**: Assign API key directly to account (no group), make request, verify logs show direct account usage

### Implementation for User Story 3

- [x] T019 [US3] Review direct account binding logic in selectAccount() at src/services/unifiedClaudeScheduler.js (lines 162-210)
- [x] T020 [US3] Verify logging for direct account selection is consistent with group selection logging style in src/services/unifiedClaudeScheduler.js
- [x] T021 [US3] Add log entry when falling back from unavailable bound account to shared pool in src/services/unifiedClaudeScheduler.js (lines 206-210)

**Checkpoint**: ✅ Direct account assignment verified working with consistent logging

---

## Phase 6: Edge Cases & Polish ✅

**Purpose**: Handle edge cases identified in spec and verify overall quality

- [x] T022 [P] Add handling for invalid group: prefix format in claudeAccountId in src/services/unifiedClaudeScheduler.js (before line 165)
- [x] T023 [P] Add log warning when sticky session points to account no longer in group in src/services/unifiedClaudeScheduler.js (line 1294)
- [x] T024 Document all new log message formats in code comments in src/services/unifiedClaudeScheduler.js
- [x] T025 Run quickstart.md validation scenarios against updated code
- [ ] T026 Verify no performance regression in scheduling decision latency
- [x] T027 [US1] Fix _getAllAvailableAccounts() to handle group: prefix for consoleAccountRetryService in src/services/unifiedClaudeScheduler.js (lines 384-419)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - review/investigation only
- **Foundational (Phase 2)**: Depends on Setup completion - defines error codes used by all stories
- **User Story 1 (Phase 3)**: Depends on Foundational - core logging enhancement
- **User Story 2 (Phase 4)**: Depends on Foundational - uses error codes; can run parallel with US1
- **User Story 3 (Phase 5)**: Depends on Foundational - can run parallel with US1 and US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - Core fix priority
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Uses error codes from Phase 2
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Independent verification

### Within Each User Story

- Tasks within a story should be executed sequentially (same file)
- Log format consistency should be maintained across stories

### Parallel Opportunities

- All Foundational tasks (T004-T007) marked [P] can run in parallel (different error code definitions)
- User Stories 1, 2, and 3 can proceed in parallel after Foundational phase (but recommend sequential for single developer due to same-file edits)
- Polish tasks T022-T023 marked [P] can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# These can be launched together (different error code definitions):
Task: "T004 Define GROUP_NOT_FOUND error constant"
Task: "T005 Define GROUP_EMPTY error constant"
Task: "T006 Define NO_AVAILABLE_ACCOUNTS_IN_GROUP error constant"
Task: "T007 Define GROUP_DEDICATED_RATE_LIMITED error constant"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (understand current code)
2. Complete Phase 2: Foundational (define error codes)
3. Complete Phase 3: User Story 1 (add diagnostic logging)
4. **STOP and VALIDATE**: Test with group-bound API key per quickstart.md
5. Deploy if logging improvement is sufficient

### Incremental Delivery

1. Complete Setup + Foundational → Error codes ready
2. Add User Story 1 → Test logging → Deploy (MVP! - enables debugging)
3. Add User Story 2 → Test error responses → Deploy (better error messages)
4. Add User Story 3 → Verify regression safety → Deploy (complete)
5. Each story adds value without breaking previous stories

### Recommended Approach

Since all changes are in the same file (`unifiedClaudeScheduler.js`), execute stories **sequentially** (P1 → P2 → P3) rather than in parallel to avoid merge conflicts.

---

## Notes

- All changes are in `src/services/unifiedClaudeScheduler.js` - coordinate edits carefully
- [P] tasks within Foundation phase are different constants, can be added together
- Logging changes should use existing logger patterns (winston)
- Error codes should follow existing error handling patterns in the codebase
- Manual testing via quickstart.md after each user story completion
- Commit after each user story phase completion

---

## Summary

| Metric | Value |
|--------|-------|
| Total Tasks | 27 |
| Completed Tasks | 26 |
| Pending Tasks | 1 (T026 - performance validation) |
| Setup Phase | 3 tasks ✅ |
| Foundational Phase | 4 tasks ✅ |
| User Story 1 (P1) | 6 tasks ✅ |
| User Story 2 (P2) | 5 tasks ✅ |
| User Story 3 (P3) | 3 tasks ✅ |
| Polish Phase | 6 tasks (5 done, 1 pending) |
| Primary File | src/services/unifiedClaudeScheduler.js |

## Implementation Status

**Status**: ✅ Code implementation complete and validated

**Changes Made**:
1. Added `GROUP_SCHEDULING_ERRORS` constants for structured error handling
2. Added detailed per-member diagnostic logging in `selectAccountFromGroup()`
3. Enhanced error objects with error codes, groupId, groupName, and skipped reasons
4. Added edge case handling for invalid group prefix and sticky session cleanup
5. **Root cause fix**: Updated `_getAllAvailableAccounts()` to handle `group:` prefix for `consoleAccountRetryService` - ensures group members are used in retry pool instead of falling back to shared pool

**Next Steps**:
- Deploy to production using `make update`
- Verify no performance regression (T026)
