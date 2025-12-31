# Tasks: Generative Media Billing Support

**Input**: Design documents from `/specs/001-image-billing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Unit tests included as this is a billing feature requiring accuracy verification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (No Code Changes)

**Purpose**: Verify prerequisites and understand existing code

- [x] T001 Read and understand pricingService.calculateCost() in src/services/pricingService.js
- [x] T002 [P] Read and understand costCalculator.calculateCost() in src/utils/costCalculator.js
- [x] T003 [P] Read and understand apiKeyService.recordUsageWithDetails() in src/services/apiKeyService.js
- [x] T004 [P] Review sample pricing data structure for media models in data/model_pricing.json

**Checkpoint**: Existing code patterns understood, ready to implement

---

## Phase 2: Foundational (Shared Helper Functions)

**Purpose**: Core utilities that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Add parseResolutionToPixels() helper function in src/services/pricingService.js
- [x] T006 Add isMediaModel(), isImageGenerationModel(), isVideoGenerationModel() helper functions in src/services/pricingService.js

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Accurate Cost Calculation for Image Generation (Priority: P1) 🎯 MVP

**Goal**: Implement accurate cost calculation for image generation models using per-image, per-pixel, or token-based pricing

**Independent Test**: Send request to image generation model (e.g., dall-e-3) and verify cost is calculated using per-image pricing

### Implementation for User Story 1

- [x] T007 [US1] Add image model detection (mode === "image_generation") in pricingService.calculateCost() in src/services/pricingService.js
- [x] T008 [US1] Implement image output cost calculation (output_cost_per_image × output_images) in src/services/pricingService.js
- [x] T009 [US1] Implement image input cost calculation (input_cost_per_image × input_images) in src/services/pricingService.js
- [x] T010 [US1] Implement pixel-based pricing fallback (input_cost_per_pixel, output_cost_per_pixel) in src/services/pricingService.js
- [x] T011 [US1] Implement token-based image pricing fallback (output_cost_per_image_token) in src/services/pricingService.js
- [x] T012 [US1] Add imageInputCost, imageOutputCost, imageTotalCost, isImageModel to return structure in src/services/pricingService.js
- [x] T013 [US1] Add inputPerImage, outputPerImage, outputPerImageToken, inputPerPixel, outputPerPixel to pricing object in return structure in src/services/pricingService.js
- [x] T014 [US1] Update totalCost calculation to include imageTotalCost in src/services/pricingService.js
- [x] T015 [US1] Update costCalculator.calculateCost() to propagate image cost fields in src/utils/costCalculator.js

### Tests for User Story 1

- [x] T016 [P] [US1] Create test file tests/unit/mediaBilling.test.js with image billing test cases
- [x] T017 [US1] Add test: image model detection returns isImageModel=true in tests/unit/mediaBilling.test.js
- [x] T018 [US1] Add test: per-image pricing calculates correctly in tests/unit/mediaBilling.test.js
- [x] T019 [US1] Add test: pixel-based pricing calculates correctly in tests/unit/mediaBilling.test.js
- [x] T019a [P] [US1] Add test: parseResolutionToPixels handles edge cases (valid "1024x1024", invalid "abc", null, empty) in tests/unit/mediaBilling.test.js
- [x] T019b [P] [US1] Add test: pixel-based pricing returns zero for invalid/missing resolution in tests/unit/mediaBilling.test.js
- [x] T020 [US1] Add test: token fallback pricing works when per-image missing in tests/unit/mediaBilling.test.js
- [x] T021 [US1] Add test: mixed billing (token + image) sums correctly in tests/unit/mediaBilling.test.js

**Checkpoint**: Image billing fully functional - can calculate costs for DALL-E, Gemini image models

---

## Phase 4: User Story 2 - Accurate Cost Calculation for Video Generation (Priority: P1)

**Goal**: Implement accurate cost calculation for video generation models using time-based pricing

**Independent Test**: Send request to video generation model (e.g., gemini/veo-3.1-generate-preview) and verify cost = duration × per-second rate

### Implementation for User Story 2

- [x] T022 [US2] Add video model detection (mode === "video_generation") in pricingService.calculateCost() in src/services/pricingService.js
- [x] T023 [US2] Implement video output cost calculation (output_cost_per_second × output_duration_seconds) in src/services/pricingService.js
- [x] T024 [US2] Add videoOutputCost, isVideoModel to return structure in src/services/pricingService.js
- [x] T025 [US2] Add outputPerSecond to pricing object in return structure in src/services/pricingService.js
- [x] T026 [US2] Add isMediaModel flag (isImageModel || isVideoModel) to return structure in src/services/pricingService.js
- [x] T027 [US2] Add mediaTotalCost (imageTotalCost + videoOutputCost) to return structure in src/services/pricingService.js
- [x] T028 [US2] Update totalCost calculation to include mediaTotalCost in src/services/pricingService.js
- [x] T029 [US2] Update costCalculator.calculateCost() to propagate video cost fields in src/utils/costCalculator.js

### Tests for User Story 2

- [x] T030 [P] [US2] Add test: video model detection returns isVideoModel=true in tests/unit/mediaBilling.test.js
- [x] T031 [P] [US2] Add test: per-second pricing calculates correctly in tests/unit/mediaBilling.test.js
- [x] T032 [P] [US2] Add test: fractional seconds supported (no rounding) in tests/unit/mediaBilling.test.js
- [x] T033 [P] [US2] Add test: zero duration returns zero video cost in tests/unit/mediaBilling.test.js

**Checkpoint**: Video billing fully functional - can calculate costs for Gemini Veo models

---

## Phase 5: User Story 3 - Media Usage Tracking in Statistics (Priority: P2)

**Goal**: Record and display image counts and video duration in usage statistics

**Independent Test**: Make media generation requests, verify dashboard shows image count and video duration separately from tokens

### Implementation for User Story 3

- [x] T034 [US3] Extend apiKeyService.recordUsageWithDetails() to accept media fields (input_images, output_images, output_duration_seconds) in src/services/apiKeyService.js
- [x] T035 [US3] Add media fields to usage record object in apiKeyService.recordUsageWithDetails() in src/services/apiKeyService.js
- [x] T036 [US3] Add media usage increment to Redis daily usage hash in src/services/apiKeyService.js
- [x] T037 [US3] Add incrementMediaUsage() method to Redis model in src/models/redis.js
- [x] T038 [US3] Parse image count from Gemini API response in src/handlers/geminiHandlers.js (parseImageCountFromResponse helper)
- [x] T039 [US3] Parse video duration from Gemini API response in src/handlers/geminiHandlers.js (parseVideoDurationFromResponse helper)
- [x] T040 [US3] Pass media metrics to recordUsageWithDetails() in src/handlers/geminiHandlers.js (all recordUsage calls updated)

### Account-Level Media Tracking (FR-012b, FR-012c, FR-012d)

- [x] T040a [US3] Update incrementAccountUsage() in src/models/redis.js to accept inputImages, outputImages, outputDurationSeconds parameters
- [x] T040b [US3] Add media fields (outputImages, outputDurationSeconds) to account model daily/monthly/hourly Redis hashes in src/models/redis.js
- [x] T040c [US3] Update getAccountDailyCost() in src/models/redis.js to include media fields in usage object for cost calculation
- [x] T040d [US3] Update recordUsageWithDetails() in src/services/apiKeyService.js to pass media fields to incrementAccountUsage()
- [x] T040e [US3] Update /admin/model-stats endpoint in src/routes/admin.js to aggregate outputImages field
- [x] T040f [US3] Update /admin/usage-costs endpoint in src/routes/admin.js to include media fields in cost calculation

### Tests for User Story 3

- [x] T041 [P] [US3] Add test: recordUsageWithDetails accepts media fields in tests/unit/mediaBilling.test.js
- [x] T042 [P] [US3] Add test: media usage recorded to Redis in tests/unit/mediaBilling.test.js

**Checkpoint**: Media usage tracking complete - API Key, Account, and Admin endpoints all include media metrics

---

## Phase 6: User Story 4 - Backward Compatibility for Token-Only Models (Priority: P3)

**Goal**: Ensure existing token-based models continue working unchanged

**Independent Test**: Send request to token-only model (e.g., claude-3-opus), verify cost calculation identical to before

### Implementation for User Story 4

- [x] T043 [US4] Ensure calculateCost returns zero for all media fields when usage has no media data in src/services/pricingService.js
- [x] T044 [US4] Ensure calculateCost returns isMediaModel=false for non-media models in src/services/pricingService.js
- [x] T045 [US4] Ensure recordUsageWithDetails works with legacy usage objects (no media fields) in src/services/apiKeyService.js

### Tests for User Story 4

- [x] T046 [P] [US4] Add test: token-only model returns mediaTotalCost=0 in tests/unit/mediaBilling.test.js
- [x] T047 [P] [US4] Add test: token-only model returns isMediaModel=false in tests/unit/mediaBilling.test.js
- [x] T048 [P] [US4] Add test: legacy usage object (no media fields) works correctly in tests/unit/mediaBilling.test.js
- [x] T049 [P] [US4] Add test: totalCost for token-only model equals inputCost + outputCost + cacheCosts in tests/unit/mediaBilling.test.js

**Checkpoint**: Backward compatibility verified - no regressions for existing token-based billing

---

## Phase 7: User Story 5 - Detailed Cost Breakdown (Priority: P4)

**Goal**: Return separate cost fields for tokens, images, and video in calculation response

**Independent Test**: Inspect calculateCost response for mixed request, verify separate fields for each cost type

### Implementation for User Story 5

- [x] T050 [US5] Verify all cost breakdown fields (inputCost, outputCost, imageInputCost, imageOutputCost, videoOutputCost) are present in return in src/services/pricingService.js
- [x] T051 [US5] Verify all pricing rate fields are present in pricing object in src/services/pricingService.js
- [x] T052 [US5] Update formatCost() to handle media costs if needed in src/services/pricingService.js

### Tests for User Story 5

- [x] T053 [P] [US5] Add test: mixed request returns all cost breakdown fields in tests/unit/mediaBilling.test.js
- [x] T054 [P] [US5] Add test: pure video request returns token costs as zero in tests/unit/mediaBilling.test.js
- [x] T055 [P] [US5] Add test: pure image request returns video cost as zero in tests/unit/mediaBilling.test.js

**Checkpoint**: Cost breakdown complete - administrators can see detailed cost attribution

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [x] T056 Run all tests with npm test to verify no regressions
- [x] T057 Run npm run lint to ensure code style compliance
- [x] T058 Format code with npx prettier --write src/services/pricingService.js src/utils/costCalculator.js src/services/apiKeyService.js
- [x] T059 Verify quickstart.md examples work correctly
- [x] T060 Test with real pricing data for dall-e-3, gemini-3-pro-image-preview, gemini/veo-3.1-generate-preview

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - read-only exploration
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational - core image billing
- **User Story 2 (Phase 4)**: Depends on Foundational - can run parallel to US1
- **User Story 3 (Phase 5)**: Depends on US1 and US2 (needs cost calculation working first)
- **User Story 4 (Phase 6)**: Can run parallel to US1/US2 after Foundational
- **User Story 5 (Phase 7)**: Depends on US1 and US2 (verifies their outputs)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
Foundational (Phase 2)
        │
        ├──────────────┬──────────────┐
        ▼              ▼              ▼
   User Story 1   User Story 2   User Story 4
   (Image)        (Video)        (Backward Compat)
        │              │
        └──────┬───────┘
               ▼
         User Story 3
         (Usage Tracking)
               │
               ▼
         User Story 5
         (Cost Breakdown)
               │
               ▼
            Polish
```

### Parallel Opportunities

**Within User Story 1**:
- T016-T021 (tests) can run in parallel after T015

**Within User Story 2**:
- T030-T033 (tests) can run in parallel after T029

**Within User Story 3**:
- T041-T042 (tests) can run in parallel after T040

**Within User Story 4**:
- T046-T049 (tests) can run in parallel after T045

**Within User Story 5**:
- T053-T055 (tests) can run in parallel after T052

**Cross-Story Parallelism**:
- US1 and US2 can be developed in parallel (different billing types)
- US4 can be developed in parallel with US1/US2 (verifies existing behavior)

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all tests for User Story 1 together:
Task: "T016 Create test file tests/unit/mediaBilling.test.js"
Task: "T017 Add test: image model detection"
Task: "T018 Add test: per-image pricing"
Task: "T019 Add test: pixel-based pricing"
Task: "T020 Add test: token fallback pricing"
Task: "T021 Add test: mixed billing"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (understand existing code)
2. Complete Phase 2: Foundational (helper functions)
3. Complete Phase 3: User Story 1 (image billing)
4. Complete Phase 4: User Story 2 (video billing)
5. **STOP and VALIDATE**: Test with real models (dall-e-3, gemini-3-pro-image-preview, veo)
6. Deploy if ready - media billing is functional

### Full Feature Delivery

1. MVP (above)
2. Add User Story 3 → Media usage tracking works
3. Add User Story 4 → Backward compatibility verified
4. Add User Story 5 → Cost breakdown complete
5. Complete Polish → Ready for production

---

## Notes

- [P] tasks = different files or independent test cases
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- pricingService.js is the primary file for US1 and US2 implementation
- Tests added after implementation due to project's existing patterns
