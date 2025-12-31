# Implementation Plan: Generative Media Billing Support

**Branch**: `001-image-billing` | **Date**: 2025-12-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-image-billing/spec.md`

## Summary

Implement accurate cost calculation for generative media models (image generation, video generation, and future audio modes) by extending the existing pricing and usage tracking infrastructure. The system will detect media model types via the `mode` field in pricing data and apply the appropriate billing formula (per-image, per-second, per-pixel, or token-based fallback).

## Technical Context

**Language/Version**: Node.js 18+
**Primary Dependencies**: Express.js, ioredis, axios, winston
**Storage**: Redis (existing infrastructure)
**Testing**: Jest + SuperTest
**Target Platform**: Linux server / Docker
**Project Type**: Single backend service with web admin SPA
**Performance Goals**: < 5ms additional latency for cost calculation
**Constraints**: Backward compatible with existing token-only billing
**Scale/Scope**: All account types (Gemini, OpenAI/DALL-E, Bedrock, Azure, Droid, etc.)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is a template without specific constraints. The implementation follows existing patterns in the codebase:

| Gate | Status | Notes |
|------|--------|-------|
| Library-First | ✅ PASS | Extending existing pricingService and costCalculator |
| Test-First | ⚠️ DEFERRED | Project lacks comprehensive tests; will add focused tests |
| Backward Compatibility | ✅ PASS | FR-013 requires existing behavior unchanged |
| Simplicity | ✅ PASS | Minimal changes to existing architecture |

## Project Structure

### Documentation (this feature)

```text
specs/001-image-billing/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - internal feature)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── services/
│   ├── pricingService.js       # MODIFY: Add media cost calculation
│   ├── apiKeyService.js        # MODIFY: Add media usage recording
│   ├── geminiRelayService.js   # MODIFY: Capture image/video usage
│   ├── openaiRelayService.js   # MODIFY: Capture DALL-E image usage
│   └── bedrockRelayService.js  # MODIFY: Capture Bedrock image usage
├── utils/
│   └── costCalculator.js       # MODIFY: Add media cost support
└── models/
    └── redis.js                # MODIFY: Add media usage storage

tests/
└── unit/
    └── mediaBilling.test.js    # NEW: Media billing unit tests
```

**Structure Decision**: Single backend modification extending existing services. No new directories needed.

## Complexity Tracking

> No constitution violations requiring justification.

## Architecture Overview

### Current Flow (Token-Only)
```
Request → Relay Service → Upstream API → Parse usage (tokens only)
       → pricingService.calculateCost() → Record usage → Response
```

### New Flow (Media-Aware)
```
Request → Relay Service → Upstream API → Parse usage (tokens + media metrics)
       → pricingService.calculateCost() → Detect mode → Apply billing formula
       → Record usage (tokens + images/video duration) → Response
```

### Key Design Decisions

1. **Mode Detection**: Use `mode` field from pricing data (`image_generation`, `video_generation`)
2. **Fallback Chain**: `output_cost_per_image` → `output_cost_per_image_token` → token-based
3. **Mixed Billing**: Token costs and media costs are calculated independently and summed
4. **Extensibility**: Future audio modes use the same pattern (`output_cost_per_second`)

## Implementation Phases

### Phase 1: Core Billing Logic (Priority P1)
1. Extend `pricingService.calculateCost()` to detect media models
2. Implement image billing formulas (per-image, per-pixel, per-token fallback)
3. Implement video billing formula (per-second)
4. Extend return structure with media cost breakdown

### Phase 2: Usage Capture (Priority P1)
1. Modify relay services to capture media metrics from upstream responses
2. Extend `apiKeyService.recordUsageWithDetails()` for media fields
3. Update Redis storage for media usage statistics

### Phase 3: Backward Compatibility & Testing (Priority P3)
1. Ensure token-only models work unchanged
2. Add unit tests for billing calculations
3. Add integration tests for end-to-end flow

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `src/services/pricingService.js` | Add `calculateMediaCost()`, extend `calculateCost()` | P1 |
| `src/utils/costCalculator.js` | Add media cost support, delegate to pricingService | P1 |
| `src/services/apiKeyService.js` | Extend `recordUsageWithDetails()` for media metrics, pass media to `incrementAccountUsage()` | P2 |
| `src/handlers/geminiHandlers.js` | Parse image count, video duration from response | P2 |
| `src/models/redis.js` | Add media usage increment methods, extend `incrementAccountUsage()` for media fields, update `getAccountDailyCost()` | P2 |
| `src/routes/admin.js` | Update `/admin/model-stats` and `/admin/usage-costs` endpoints for media cost aggregation | P2 |

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Upstream API doesn't provide media metrics | High | Log warning, record zero cost (graceful degradation) |
| Pricing data missing media fields | Medium | Fall back to token-based or zero cost |
| Performance regression | Medium | Cache pricing lookups, benchmark < 5ms |
| Breaking existing billing | High | Comprehensive backward compatibility tests |
