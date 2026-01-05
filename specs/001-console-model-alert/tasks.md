# Tasks: Claude Console Model Alert

**Input**: Design documents from `/specs/001-console-model-alert/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Not explicitly requested in spec - test tasks excluded.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Exact file paths included in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration and utility infrastructure for model alert feature

- [x] T001 [P] Add consoleModelAlert configuration in config/config.js (CONSOLE_MODEL_ALERT_ENABLED env var, default true)
- [x] T002 [P] Create model validator utility in src/utils/modelValidator.js (isValidClaudeModel function)
- [x] T003 Create modelAlertService skeleton in src/services/modelAlertService.js (checkAndAlert method signature)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core alert service that all user stories depend on

**Note**: User Story 1 and 2 are both P1 priority and tightly coupled - they will be combined in Phase 3.

- [x] T004 Implement modelAlertService.checkAndAlert() base logic in src/services/modelAlertService.js
- [x] T005 [FR-006] Add modelAnomaly notification type to webhookService in src/services/webhookService.js (title, level, sound mappings) - uses existing webhook configuration infrastructure

**Checkpoint**: Foundation ready - user story integration can begin

---

## Phase 3: User Stories 1 & 2 - Core Detection and Alert Content (Priority: P1) MVP

**Goal**: Detect non-Claude model responses and send webhook alerts with complete context information

**Independent Test**:
- Send a request through Console relay that returns a non-Claude model name (e.g., "gpt-4")
- Verify webhook alert is received with all context fields (API Key Name, Account ID, Account Name, Model Name, Timestamp)

### Implementation for User Stories 1 & 2

- [x] T006 [US1] Implement isValidClaudeModel() in src/utils/modelValidator.js (case-insensitive check for haiku/sonnet/opus)
- [x] T007 [US1] Handle missing/empty model field as invalid in src/utils/modelValidator.js
- [x] T008 [US2] Build ModelAlertEvent payload structure in src/services/modelAlertService.js (apiKeyName, accountId, accountName, detectedModel, expectedModels, timestamp)
- [x] T009 [US1] [US2] Integrate model check into non-streaming flow in src/services/claudeConsoleRelayService.js relayRequest() method (after line 306, async non-blocking)
- [x] T010 [US1] [US2] Integrate model check into streaming flow in src/services/claudeConsoleRelayService.js _makeClaudeConsoleStreamRequest() (in message_start handler, with duplicate check flag)
- [x] T011 [US1] Add fail-safe error handling wrapper for model check calls in src/services/claudeConsoleRelayService.js (try-catch with logger.warn)
- [x] T012 [US2] Add apiKeyId (optional) to ModelAlertEvent in src/services/modelAlertService.js

**Checkpoint**: Non-Claude model responses now trigger webhook alerts with full context. MVP complete.

---

## Phase 4: User Story 3 - Alert Rate Limiting (Priority: P2)

**Goal**: Prevent alert fatigue by limiting same-account alerts to 1 per minute

**Independent Test**:
- Trigger multiple non-Claude model responses for the same account within 1 minute
- Verify only 1 webhook alert is sent
- Verify different accounts can still alert independently
- Verify alert can be sent again after 1 minute

### Implementation for User Story 3

- [x] T013 [US3] Implement canSendAlert() rate limit check in src/services/modelAlertService.js (Redis SET NX EX 60)
- [x] T014 [US3] Add throttle key pattern model_alert_throttle:{accountId} in src/services/modelAlertService.js
- [x] T015 [US3] Integrate rate limit check before webhook send in src/services/modelAlertService.js checkAndAlert()
- [x] T016 [US3] Add debug logging for suppressed alerts in src/services/modelAlertService.js

**Checkpoint**: Rate limiting prevents alert storms while allowing legitimate alerts through

---

## Phase 5: User Story 4 - Feature Toggle Control (Priority: P2)

**Goal**: Allow administrators to enable/disable the model alert feature via configuration

**Independent Test**:
- Set CONSOLE_MODEL_ALERT_ENABLED=false
- Trigger non-Claude model response
- Verify no webhook alert is sent
- Set back to true (or unset), verify alerts resume

### Implementation for User Story 4

- [x] T017 [US4] Add feature toggle check at start of checkAndAlert() in src/services/modelAlertService.js
- [x] T018 [US4] Add debug logging when feature is disabled in src/services/modelAlertService.js
- [x] T019 [US4] Document CONSOLE_MODEL_ALERT_ENABLED in config/config.js comments

**Checkpoint**: Feature can be toggled on/off via environment variable

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T020 [P] Add JSDoc comments to modelValidator.js functions in src/utils/modelValidator.js
- [x] T021 [P] Add JSDoc comments to modelAlertService.js functions in src/services/modelAlertService.js
- [x] T022 Run quickstart.md validation - execute manual test steps:
  - Start service with feature enabled (default)
  - Configure a test Console account
  - Send request that returns non-Claude model (e.g., mock "gpt-4" response)
  - Verify webhook notification received with correct payload structure
  - Verify rate limiting (second alert within 1 min is suppressed)
  - Test with CONSOLE_MODEL_ALERT_ENABLED=false (no alert sent)
- [x] T023 Format all modified files with prettier (npm run format)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion
- **User Stories 1 & 2 (Phase 3)**: Depends on Foundational - delivers MVP
- **User Story 3 (Phase 4)**: Depends on Phase 3 (needs core alert flow)
- **User Story 4 (Phase 5)**: Depends on Phase 3 (needs core alert flow)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Stories 1 & 2 (P1)**: Combined as MVP - tightly coupled detection + alert content
- **User Story 3 (P2)**: Can start after MVP - adds rate limiting layer
- **User Story 4 (P2)**: Can start after MVP - adds configuration layer
- **User Stories 3 & 4**: Can be done in parallel (different concerns)

### Within Each Phase

- Config before services
- Utilities before services
- Core implementation before integration
- Integration into existing code last

### Parallel Opportunities

**Phase 1**:
- T001 and T002 can run in parallel (different files)

**Phase 3** (after T006):
- T008 and T009 can start once T006-T007 complete

**Phase 4 & 5**:
- These entire phases can run in parallel (after Phase 3)

**Phase 6**:
- T020 and T021 can run in parallel (different files)

---

## Parallel Example: Phase 1 Setup

```bash
# Launch setup tasks in parallel:
Task: "Add consoleModelAlert configuration in config/config.js"
Task: "Create model validator utility in src/utils/modelValidator.js"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T005)
3. Complete Phase 3: User Stories 1 & 2 (T006-T012)
4. **STOP and VALIDATE**: Test MVP independently
   - Trigger non-Claude model response
   - Verify webhook received with all fields
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add User Stories 1 & 2 → Test → Deploy (MVP!)
3. Add User Story 3 → Test rate limiting → Deploy
4. Add User Story 4 → Test toggle → Deploy
5. Polish → Final validation → Complete

### File Change Summary

| File | Action | Tasks |
|------|--------|-------|
| config/config.js | Modify | T001, T019 |
| src/utils/modelValidator.js | Create | T002, T006, T007, T020 |
| src/services/modelAlertService.js | Create | T003, T004, T008, T012, T013-T018, T021 |
| src/services/webhookService.js | Modify | T005 |
| src/services/claudeConsoleRelayService.js | Modify | T009, T010, T011 |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- User Stories 1 & 2 combined as they're both P1 and tightly coupled
- All changes are non-blocking to existing relay flow
- Fail-safe error handling ensures alerts never break main functionality
- Commit after each task or logical group
