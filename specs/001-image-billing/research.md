# Research: Generative Media Billing Support

**Date**: 2025-12-31
**Feature**: 001-image-billing

## Executive Summary

This research documents findings from analyzing the existing codebase and pricing data to support implementation of generative media billing (image, video, audio modes).

---

## 1. Pricing Data Structure

### Decision
Use the existing `mode` field in pricing data to detect media generation models.

### Rationale
The pricing data from LiteLLM already includes a `mode` field that identifies model types:
- `image_generation` - Image generation models (DALL-E, Gemini image, etc.)
- `video_generation` - Video generation models (Gemini Veo, etc.)
- `audio_generation` - Future audio models

### Evidence
Sample pricing entries from `model_prices_and_context_window.json`:

```json
"gemini/gemini-3-pro-image-preview": {
    "mode": "image_generation",
    "output_cost_per_image": 0.134,
    "input_cost_per_image": 0.0011
}

"gemini/veo-3.1-generate-preview": {
    "mode": "video_generation",
    "output_cost_per_second": 0.40
}

"dall-e-3": {
    "mode": "image_generation",
    "output_cost_per_image": 0.040  // 1024x1024
}
```

### Alternatives Considered
1. **Model name pattern matching** - Rejected: Brittle, requires maintenance as new models added
2. **Separate pricing lookup** - Rejected: Duplicates existing infrastructure

---

## 2. Billing Formulas

### Decision
Implement a prioritized fallback chain for each media type.

### Image Billing Formula
```
Priority 1: output_cost_per_image × output_images
Priority 2: input_cost_per_image × input_images
Priority 3: output_cost_per_image_token × output_tokens (image-specific token cost)
Priority 4: Fallback to standard token billing if none of above available
```

### Video Billing Formula
```
video_cost = output_cost_per_second × output_duration_seconds
```

### Pixel Billing Formula (DALL-E specific)
```
pixel_cost = (input_cost_per_pixel × input_pixels) + (output_cost_per_pixel × output_pixels)
```

Where pixels can be derived from resolution:
```javascript
// Parse "1024x1024" → 1048576 pixels
const [width, height] = resolution.split('x').map(Number)
const pixels = width * height
```

### Mixed Billing (Token + Media)
```
total_cost = token_cost + image_cost + video_cost
```

### Rationale
This approach:
1. Uses the most specific pricing when available
2. Falls back gracefully when data is missing
3. Allows mixed billing for models like Gemini that charge for both tokens AND images

---

## 3. Existing Code Integration Points

### pricingService.js (`calculateCost` method)

**Current signature**:
```javascript
calculateCost(usage, modelName)
```

**Current return structure**:
```javascript
{
  inputCost, outputCost, cacheCreateCost, cacheReadCost,
  ephemeral5mCost, ephemeral1hCost, totalCost,
  hasPricing, isLongContextRequest, pricing: {...}
}
```

**Proposed extension**:
```javascript
{
  // Existing fields unchanged
  inputCost, outputCost, cacheCreateCost, cacheReadCost,
  ephemeral5mCost, ephemeral1hCost, totalCost,
  hasPricing, isLongContextRequest,

  // NEW: Media cost fields
  imageInputCost: 0,
  imageOutputCost: 0,
  imageTotalCost: 0,
  videoOutputCost: 0,
  mediaTotalCost: 0,
  isImageModel: false,
  isVideoModel: false,
  isMediaModel: false,

  pricing: {
    // Existing
    input, output, cacheCreate, cacheRead, ephemeral1h,
    // NEW
    inputPerImage: 0,
    outputPerImage: 0,
    outputPerImageToken: 0,
    outputPerSecond: 0,
    inputPerPixel: 0,
    outputPerPixel: 0
  }
}
```

### costCalculator.js

Already delegates to `pricingService.calculateCost()` for complex cases. Will need minimal changes - just ensure media cost fields are propagated correctly.

### apiKeyService.js (`recordUsageWithDetails` method)

**Current usage object accepted**:
```javascript
{
  input_tokens, output_tokens,
  cache_creation_input_tokens, cache_read_input_tokens
}
```

**Proposed extension**:
```javascript
{
  // Existing token fields
  input_tokens, output_tokens,
  cache_creation_input_tokens, cache_read_input_tokens,

  // NEW: Media fields
  input_images: 0,
  output_images: 0,
  image_resolution: null,  // e.g., "1024x1024"
  input_pixels: 0,
  output_pixels: 0,
  output_duration_seconds: 0  // Video duration
}
```

---

## 4. Upstream API Response Formats

### Gemini API (Image Generation)
```json
{
  "candidates": [...],
  "usageMetadata": {
    "promptTokenCount": 100,
    "candidatesTokenCount": 500,
    "totalTokenCount": 600
  }
  // Note: Image count may need to be inferred from response structure
}
```

### Gemini API (Video Generation - Veo)
```json
{
  "video": {
    "uri": "...",
    "duration_seconds": 10.5
  },
  "usageMetadata": {...}
}
```

### OpenAI API (DALL-E)
```json
{
  "created": 1234567890,
  "data": [
    {"url": "...", "revised_prompt": "..."},
    {"url": "..."}  // Multiple images
  ]
}
// Image count = data.length
```

### Decision
Parse media metrics from response structure:
- Image count: Count items in response array or explicit field
- Video duration: Read from `duration_seconds` field
- Resolution: Read from request parameters or response metadata

---

## 5. Redis Storage for Media Usage

### Decision
Extend existing usage tracking to include media metrics.

### Current Redis Keys
```
usage:daily:{date}:{keyId}:{model}
usage:account:{accountId}:{date}
usage:global:{date}
```

### Proposed Additional Fields
```javascript
// Add to existing usage hash
{
  // Existing
  inputTokens: 0,
  outputTokens: 0,
  cacheCreateTokens: 0,
  cacheReadTokens: 0,

  // NEW
  inputImages: 0,
  outputImages: 0,
  outputDurationSeconds: 0,  // Video
  mediaCost: 0
}
```

### Rationale
Using the same Redis key structure with additional fields:
1. Maintains consistency with existing patterns
2. Enables media usage queries with same time-based aggregation
3. Backward compatible - missing fields default to 0

---

## 6. Performance Considerations

### Decision
No caching changes needed for media billing specifically.

### Rationale
1. `pricingService` already caches pricing data in memory
2. Mode detection is O(1) lookup from cached pricing object
3. Cost calculation is simple arithmetic (< 1ms)
4. Total added latency estimated < 5ms per request

### Benchmark Plan
1. Add timing instrumentation to `calculateCost()`
2. Log p95 latency for media vs non-media models
3. Alert if > 5ms threshold exceeded

---

## 7. Error Handling Strategy

### Decision
Graceful degradation with logging, never fail requests.

| Scenario | Behavior |
|----------|----------|
| Missing media fields in usage | Use 0, log debug |
| Missing media pricing fields | Fall back to token billing, log warning |
| Missing mode field | Treat as token-only model |
| Parse error on resolution | Use 0 pixels, log warning |
| Missing video duration | Use 0 seconds, log warning |

### Rationale
Cost tracking failures should never block API requests. The relay service's primary function is forwarding requests; billing is secondary.

---

## 8. Test Strategy

### Unit Tests
1. `pricingService.calculateCost()` with image models
2. `pricingService.calculateCost()` with video models
3. Mixed billing (token + image)
4. Fallback chain (image → token fallback)
5. Backward compatibility (no media fields)

### Integration Tests
1. Gemini image generation end-to-end
2. DALL-E image generation end-to-end
3. Video generation end-to-end (when available)

### Test Data
Use sample pricing entries with known costs to verify calculation accuracy.

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Mode Detection | Use `mode` field from pricing data |
| Image Billing | Priority: per-image → per-token → standard token |
| Video Billing | `output_cost_per_second × duration` |
| Mixed Billing | Sum token + media costs independently |
| Storage | Extend existing Redis usage hashes |
| Error Handling | Graceful degradation, never fail requests |
| Performance | No additional caching needed, target < 5ms |
