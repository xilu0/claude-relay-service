# Feature Specification: Generative Media Billing Support

**Feature Branch**: `001-image-billing`
**Created**: 2025-12-31
**Status**: Draft
**Input**: User description: "图片生成模型计费支持 - 支持图片生成模型的正确计费，涵盖按图片数量计费、按图片token计费、混合计费（token + 图片）模式"

## Clarifications

### Session 2025-12-31

- Q: Should video generation billing be included in this feature alongside image billing? → A: Rename feature to "Generative Media Billing" covering image, video, and future audio modes
- Q: How should the system obtain video duration for billing? → A: Parse duration from upstream API response (standard field like `duration_seconds` or `metadata.duration`)
- Q: Should media billing be limited to Gemini API accounts only, or cover all account types? → A: All accounts - cover all account types with media generation support (Gemini, OpenAI/DALL-E, Bedrock, etc.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate Cost Calculation for Image Generation Requests (Priority: P1)

As a system administrator, I need the cost calculation system to correctly calculate costs for image generation models so that usage statistics and billing are accurate.

**Why this priority**: This is the core functionality - without accurate cost calculation, all downstream features (statistics, billing, quotas) will show incorrect data. Currently, image model billing is completely non-functional.

**Independent Test**: Can be fully tested by sending a request to an image generation model (e.g., dall-e-3) and verifying the cost is calculated using the per-image pricing instead of returning zero or incorrect token-based cost.

**Acceptance Scenarios**:

1. **Given** a request to `dall-e-3` model that generates 2 images, **When** the system calculates cost, **Then** the cost equals `2 × output_cost_per_image` from the pricing data
2. **Given** a request to `gemini-3-pro-image-preview` that uses 100 input tokens, 500 output tokens, and generates 1 image, **When** the system calculates cost, **Then** the cost equals token costs plus image costs (mixed billing)
3. **Given** an image generation model with `output_cost_per_image_token` pricing, **When** the system calculates cost, **Then** the system uses token-based image pricing when per-image pricing is unavailable

---

### User Story 2 - Accurate Cost Calculation for Video Generation Requests (Priority: P1)

As a system administrator, I need the cost calculation system to correctly calculate costs for video generation models using time-based pricing so that usage statistics and billing are accurate.

**Why this priority**: Video generation is a high-cost operation and incorrect billing can lead to significant financial discrepancies. This is equally critical as image billing.

**Independent Test**: Can be fully tested by sending a request to a video generation model (e.g., gemini/veo-3.1-generate-preview) and verifying the cost is calculated using the per-second pricing multiplied by video duration.

**Acceptance Scenarios**:

1. **Given** a request to `gemini/veo-3.1-generate-preview` that generates a 10-second video, **When** the system calculates cost, **Then** the cost equals `10 × output_cost_per_second` ($4.00 at $0.40/second)
2. **Given** a video generation request with associated input tokens, **When** the system calculates cost, **Then** the cost equals token costs plus video duration costs (mixed billing)
3. **Given** a video generation model with no duration data returned, **When** the system calculates cost, **Then** the system logs a warning and records zero video cost rather than failing

---

### User Story 3 - Media Usage Tracking in Statistics (Priority: P2)

As a system administrator, I need to see generative media usage (images generated, video seconds produced) in the usage statistics alongside token usage, so I can understand resource consumption patterns.

**Why this priority**: Once cost calculation works, tracking media counts provides visibility into usage patterns and enables quota management for media-heavy workloads.

**Independent Test**: Can be tested by making media generation requests and verifying the dashboard/statistics show image counts and video duration separately from token counts.

**Acceptance Scenarios**:

1. **Given** an API key has made requests generating 10 images and 60 seconds of video, **When** viewing usage statistics, **Then** the statistics display image count (10) and video duration (60s) separately from token counts
2. **Given** a mixed request with text tokens, image output, and video output, **When** recording usage, **Then** all metrics (tokens, images, video seconds) are recorded and persisted
3. **Given** usage data exists for media generation, **When** querying historical statistics, **Then** media usage data is available for the same time periods as token data

---

### User Story 4 - Backward Compatibility for Token-Only Models (Priority: P3)

As a developer, I need the system to continue working correctly for all existing token-based models when media billing is added, so that no regressions occur.

**Why this priority**: Ensuring backward compatibility protects existing functionality while adding new capabilities.

**Independent Test**: Can be tested by running requests to any token-based model (e.g., claude-3-opus) and verifying cost calculation returns the same results as before the change.

**Acceptance Scenarios**:

1. **Given** a request to a token-only model (e.g., `claude-3-opus`), **When** usage data has no media fields, **Then** cost calculation works exactly as before with zero media costs
2. **Given** a model without media pricing fields in the pricing data, **When** calculating costs, **Then** the system calculates only token-based costs without errors
3. **Given** an existing API key with historical token-only usage, **When** querying statistics after the update, **Then** historical data remains accurate and accessible

---

### User Story 5 - Detailed Cost Breakdown (Priority: P4)

As a system administrator, I need to see a breakdown of costs between token usage, image generation, and video generation in the cost details, so I can understand what drives costs.

**Why this priority**: Cost breakdown provides transparency and helps optimize resource allocation, but is not required for basic billing accuracy.

**Independent Test**: Can be tested by inspecting the cost calculation response for a mixed request and verifying separate fields for token costs, image costs, and video costs.

**Acceptance Scenarios**:

1. **Given** a cost calculation for a mixed model request, **When** reviewing the cost breakdown, **Then** I can see separate values for token costs, image costs, and video costs
2. **Given** a pure video generation request with no token or image usage, **When** reviewing the cost breakdown, **Then** token and image costs show zero and video costs show the full amount

---

### Edge Cases

- What happens when pricing data has both `output_cost_per_image` and `output_cost_per_image_token`? **System uses `output_cost_per_image` as primary, falling back to token-based if image count is unavailable.**
- What happens when a media generation request returns no usage data from the upstream API? **System logs a warning and records zero cost rather than failing.**
- What happens when a model is configured as `mode: "image_generation"` but has no image pricing fields? **System falls back to token-based pricing if available, otherwise records zero cost with a warning.**
- How does the system handle pixel-based pricing (DALL-E specific)? **If `input_cost_per_pixel` or `output_cost_per_pixel` fields exist and pixel counts are available, use pixel-based calculation. Otherwise fall back to per-image pricing.**
- What happens when image resolution is provided but pixel counts are not? **System calculates pixels from resolution string (e.g., "1024x1024" = 1,048,576 pixels) if pixel pricing is configured.**
- What happens when video duration is not provided by the upstream API? **System logs a warning and records zero video cost; does not attempt to estimate duration.**
- How does the system handle fractional video seconds? **System uses the exact duration value (floating point) for cost calculation without rounding.**
- What happens when a future `mode: "audio_generation"` model is encountered? **System treats it as an extensible media type; if `output_cost_per_second` exists, uses time-based billing; otherwise logs warning and records zero media cost.**

## Requirements *(mandatory)*

### Functional Requirements

#### Image Generation Billing
- **FR-001**: System MUST detect image generation models by checking `mode === "image_generation"` in pricing data
- **FR-002**: System MUST calculate image output costs using `output_cost_per_image × output_images` when this pricing field exists
- **FR-003**: System MUST calculate image input costs using `input_cost_per_image × input_images` when this pricing field exists
- **FR-004**: System MUST support token-based image pricing using `output_cost_per_image_token × output_tokens` as a fallback when per-image pricing is unavailable
- **FR-005**: System MUST support pixel-based pricing using `input_cost_per_pixel × input_pixels` and `output_cost_per_pixel × output_pixels` when these fields exist
- **FR-006**: System MUST parse image resolution strings (e.g., "1024x1024") to calculate pixel counts when resolution is provided but pixel counts are not

#### Video Generation Billing
- **FR-007**: System MUST detect video generation models by checking `mode === "video_generation"` in pricing data
- **FR-008**: System MUST calculate video output costs using `output_cost_per_second × output_duration_seconds` when this pricing field exists
- **FR-009**: System MUST support fractional seconds in video duration calculations (no rounding)
- **FR-010**: System MUST parse video duration from upstream API response fields (e.g., `duration_seconds`, `metadata.duration`, or equivalent)

#### General Media Billing
- **FR-011**: System MUST support mixed billing where token costs and media costs (image/video) are calculated independently and summed
- **FR-012**: System MUST record media usage metrics (input_images, output_images, output_duration_seconds) in ALL usage tracking paths:
  - **FR-012a**: API Key level usage (`usage:*` Redis keys) - per-key media tracking
  - **FR-012b**: Account level usage (`account_usage:*` Redis keys) - per-account media tracking
  - **FR-012c**: Model statistics (`account_usage:model:*` Redis keys) - per-model media aggregation
  - **FR-012d**: Admin dashboard endpoints (`/admin/model-stats`, `/admin/usage-costs`) - media cost display
- **FR-013**: System MUST maintain backward compatibility - requests without media data MUST calculate costs using existing token-only logic
- **FR-014**: System MUST return detailed cost breakdown including separate media cost fields in the calculation response
- **FR-015**: System MUST handle missing or zero media counts gracefully without errors
- **FR-016**: System MUST be extensible to support future media modes (e.g., `audio_generation`) using the same time-based or unit-based pricing patterns

### Key Entities

- **Usage**: Extended to include media-related fields:
  - Image: input_images, output_images, image_resolution, input_pixels, output_pixels
  - Video: output_duration_seconds
  - (Future) Audio: output_duration_seconds
  - Alongside existing token fields (input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens)

- **Pricing**: Contains model pricing data including:
  - mode identifier (`image_generation`, `video_generation`, future `audio_generation`)
  - Image pricing: input_cost_per_image, output_cost_per_image, output_cost_per_image_token, input_cost_per_pixel, output_cost_per_pixel
  - Video pricing: output_cost_per_second
  - (Future) Audio pricing: output_cost_per_second

- **Cost Result**: Extended response structure containing:
  - Token costs: inputCost, outputCost, cacheCreateCost, cacheReadCost
  - Image costs: imageInputCost, imageOutputCost
  - Video costs: videoOutputCost
  - Totals: imageTotalCost, videoTotalCost, mediaTotalCost, totalCost
  - Flags: isImageModel, isVideoModel, isMediaModel

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All image generation models with `mode: "image_generation"` in pricing data have accurate cost calculation based on their pricing fields (100% accuracy vs manual calculation)
- **SC-002**: All video generation models with `mode: "video_generation"` in pricing data have accurate cost calculation based on duration × per-second rate (100% accuracy vs manual calculation)
- **SC-003**: Usage statistics correctly display image counts and video duration for all requests to media generation models
- **SC-004**: All existing token-based models continue to calculate costs identically to before the change (zero regressions)
- **SC-005**: Cost calculation for mixed billing models (token + image + video) returns correct combined total within 0.001 USD precision
- **SC-006**: System processes media generation requests without additional latency overhead (< 5ms added to cost calculation)

## Assumptions

- The upstream API responses provide media metrics (image counts, video duration) in a parseable format (either directly or derivable from response structure)
- Pricing data is already populated with media-specific fields for relevant models (as indicated in the feature description)
- The existing cost calculation infrastructure (pricingService, costCalculator) supports extension without architectural changes
- Media metrics from upstream APIs are reliable and accurate
- Video duration is provided in seconds (or convertible to seconds) by upstream APIs
- Initial implementation targets Gemini API for video duration parsing; OpenAI and Bedrock video support will be added when those providers offer video generation APIs
