# Tasks: Fix Ghost Account Bug After Deletion

**Input**: Design documents from `/specs/001-fix-ghost-accounts/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested in spec. Unit tests included as part of implementation quality assurance.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Project type**: Web application (Express.js backend)
- **Primary file**: `src/services/claudeConsoleAccountService.js`
- **Secondary file**: `src/services/rateLimitCleanupService.js`

---

## Phase 1: Setup

**Purpose**: Preparation and understanding of existing code

- [x] T001 Read and understand existing claudeConsoleAccountService.js patterns in src/services/claudeConsoleAccountService.js
- [x] T002 [P] Identify all methods using hset without existence checks in src/services/claudeConsoleAccountService.js
- [x] T003 [P] Review rateLimitCleanupService.js for calls to affected methods in src/services/rateLimitCleanupService.js

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the reusable helper method that all user story implementations depend on

**CRITICAL**: User story implementations cannot begin until accountExists() helper is complete

- [x] T004 Add accountExists(accountId) helper method to src/services/claudeConsoleAccountService.js
- [x] T005 Add isValidAccountData(accountData) helper method to src/services/claudeConsoleAccountService.js

**Checkpoint**: Foundation ready - existence check helpers available for all affected methods ✅

---

## Phase 3: User Story 1 - Admin Deletes Account Permanently (Priority: P1)

**Goal**: Deleted accounts never reappear regardless of background service activity

**Independent Test**: Delete a Claude Console account, wait for cleanup cycles, verify account ID never appears in any listing

### Implementation for User Story 1

- [x] T006 [US1] Add existence check to markAccountRateLimited() in src/services/claudeConsoleAccountService.js (line ~459)
- [x] T007 [P] [US1] Add existence check to removeAccountRateLimit() in src/services/claudeConsoleAccountService.js (line ~525)
- [x] T008 [P] [US1] Add existence check to markAccountUnauthorized() in src/services/claudeConsoleAccountService.js (line ~690)
- [x] T009 [P] [US1] Add existence check to markConsoleAccountBlocked() in src/services/claudeConsoleAccountService.js (line ~736)
- [x] T010 [P] [US1] Add existence check to removeAccountBlocked() in src/services/claudeConsoleAccountService.js (line ~802)
- [x] T011 [P] [US1] Add existence check to markAccountOverloaded() in src/services/claudeConsoleAccountService.js (line ~913)
- [x] T012 [P] [US1] Add existence check to removeAccountOverload() in src/services/claudeConsoleAccountService.js (line ~955)
- [x] T013 [P] [US1] Add existence check to blockAccount() in src/services/claudeConsoleAccountService.js (line ~1010)
- [x] T013a [P] [US1] Verify resetDailyUsage() already has existence check via getAccount()/updateAccount() - SAFE
- [x] T014 [US1] Run npm run lint to verify code formatting in src/services/claudeConsoleAccountService.js

**Checkpoint**: All 9 affected methods now have existence guards - deleted accounts cannot be recreated by any background operation ✅

---

## Phase 4: User Story 2 - System Validates Existence Before Updates (Priority: P1)

**Goal**: All background services verify account existence before any write operations

**Independent Test**: Mock cleanup service calling update on non-existent account ID, verify no Redis data created

### Implementation for User Story 2

- [x] T015 [US2] Review rateLimitCleanupService.cleanupClaudeConsoleAccounts() in src/services/rateLimitCleanupService.js (line ~282)
- [x] T016 [US2] Ensure cleanup service handles null returns from account service methods in src/services/rateLimitCleanupService.js
- [x] T017 [US2] Add logging when operations are skipped due to non-existent accounts in src/services/claudeConsoleAccountService.js

**Checkpoint**: Background services now gracefully handle deleted accounts without creating ghost data ✅

---

## Phase 5: User Story 3 - System Cleans Up Invalid Account Data (Priority: P2)

**Goal**: Existing ghost accounts are detected and automatically cleaned up

**Independent Test**: Create a partial Redis hash manually (ghost account), retrieve account list, verify ghost is removed

### Implementation for User Story 3

- [x] T018 [US3] Add ghost account detection logic to getAllAccounts() in src/services/claudeConsoleAccountService.js (line ~171)
- [x] T019 [US3] Add cleanupGhostAccounts(accountIds) helper method to src/services/claudeConsoleAccountService.js
- [x] T020 [US3] Integrate ghost cleanup into getAllAccounts() flow in src/services/claudeConsoleAccountService.js
- [x] T021 [US3] Add warning log when ghost accounts are detected and cleaned in src/services/claudeConsoleAccountService.js

**Checkpoint**: Any existing ghost accounts will be automatically cleaned up when accounts are listed ✅

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [x] T022 Run npm run lint to verify all code formatting
- [x] T023 Test manual deletion flow via admin dashboard at /admin-next/ (E2E test with Chrome DevTools)
- [x] T024 Verify no ghost accounts appear in /admin/claude-console-accounts API response (verified via E2E)
- [x] T025 Run quickstart.md verification checklist in specs/001-fix-ghost-accounts/quickstart.md
- [x] T026 Format all modified files with npx prettier --write src/services/claudeConsoleAccountService.js

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 and US2 can proceed in parallel
  - US3 can proceed in parallel with US1/US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Independent of US1
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Independent of US1/US2

### Within Each User Story

- T006-T013a (US1): All marked [P] can run in parallel (different methods in same file)
- T015-T017 (US2): Sequential (reviewing before modifying)
- T018-T021 (US3): Sequential (building on previous changes)

### Parallel Opportunities

```text
After T005 completes:
├── US1: T006, T007, T008, T009, T010, T011, T012, T013, T013a (all parallel)
├── US2: T015 → T016 → T017 (sequential)
└── US3: T018 → T019 → T020 → T021 (sequential)
```

---

## Parallel Example: User Story 1

```bash
# After T005 (accountExists helper) is complete, launch all method updates in parallel:
Task T006: "Add existence check to markAccountRateLimited()"
Task T007: "Add existence check to removeAccountRateLimit()"
Task T008: "Add existence check to markAccountUnauthorized()"
Task T009: "Add existence check to markConsoleAccountBlocked()"
Task T010: "Add existence check to removeAccountBlocked()"
Task T011: "Add existence check to markAccountOverloaded()"
Task T012: "Add existence check to removeAccountOverload()"
Task T013: "Add existence check to blockAccount()"
Task T013a: "Add existence check to resetDailyUsage()"

# All 9 methods are independent sections of the same file - can be edited in parallel
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T005)
3. Complete Phase 3: User Story 1 (T006-T014)
4. **STOP and VALIDATE**: Delete an account, verify it doesn't reappear
5. Deploy/demo if ready - core bug is fixed!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test deletion flow → **Bug fixed!** (MVP)
3. Add User Story 2 → Test cleanup service behavior → Background services safe
4. Add User Story 3 → Test ghost cleanup → Existing corrupted data cleaned
5. Each story adds protection without breaking previous fixes

### Task Execution Summary

| Phase | Tasks | Parallel? |
|-------|-------|-----------|
| Setup | T001-T003 | T002, T003 parallel |
| Foundational | T004-T005 | Sequential |
| US1 (P1) | T006-T014 (incl. T013a) | T006-T013a all parallel |
| US2 (P1) | T015-T017 | Sequential |
| US3 (P2) | T018-T021 | Sequential |
| Polish | T022-T026 | Sequential |

---

## Notes

- All changes are in a single primary file: `src/services/claudeConsoleAccountService.js`
- Secondary file `src/services/rateLimitCleanupService.js` only needs review/minor updates
- [P] tasks within US1 can be parallelized as they modify different methods
- Verify each existence check logs a warning when skipping operations
- Run `npm run lint` after each phase to catch formatting issues early
- Commit after each user story completion for easy rollback
