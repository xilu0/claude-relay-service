# Quickstart: Generative Media Billing Support

**Date**: 2025-12-31
**Feature**: 001-image-billing

## Overview

This guide explains how to implement and test the generative media billing feature.

---

## Prerequisites

1. Node.js 18+
2. Redis running locally or via Docker
3. Existing claude-relay-service codebase

---

## Implementation Steps

### Step 1: Extend pricingService.calculateCost()

Location: `src/services/pricingService.js`

```javascript
// Add at the start of calculateCost() method
const isImageModel = pricing?.mode === 'image_generation'
const isVideoModel = pricing?.mode === 'video_generation'
const isMediaModel = isImageModel || isVideoModel

// Calculate image costs
let imageInputCost = 0
let imageOutputCost = 0

if (isImageModel) {
  const inputImages = usage.input_images || 0
  const outputImages = usage.output_images || 0

  // Priority: per-image → per-pixel → per-token
  if (pricing.output_cost_per_image && outputImages > 0) {
    imageOutputCost = outputImages * pricing.output_cost_per_image
  } else if (pricing.output_cost_per_image_token && usage.output_tokens) {
    imageOutputCost = usage.output_tokens * pricing.output_cost_per_image_token
  }

  if (pricing.input_cost_per_image && inputImages > 0) {
    imageInputCost = inputImages * pricing.input_cost_per_image
  }
}

// Calculate video costs
let videoOutputCost = 0
if (isVideoModel && pricing.output_cost_per_second) {
  const durationSeconds = usage.output_duration_seconds || 0
  videoOutputCost = durationSeconds * pricing.output_cost_per_second
}

// Add to return object
const imageTotalCost = imageInputCost + imageOutputCost
const mediaTotalCost = imageTotalCost + videoOutputCost
const totalCost = inputCost + outputCost + cacheCreateCost + cacheReadCost + mediaTotalCost

return {
  // ... existing fields ...
  imageInputCost,
  imageOutputCost,
  imageTotalCost,
  videoOutputCost,
  mediaTotalCost,
  totalCost,
  isImageModel,
  isVideoModel,
  isMediaModel,
  pricing: {
    // ... existing pricing fields ...
    inputPerImage: pricing?.input_cost_per_image || 0,
    outputPerImage: pricing?.output_cost_per_image || 0,
    outputPerImageToken: pricing?.output_cost_per_image_token || 0,
    outputPerSecond: pricing?.output_cost_per_second || 0
  }
}
```

### Step 2: Update apiKeyService.recordUsageWithDetails()

Location: `src/services/apiKeyService.js`

```javascript
// Extract media fields from usage object
const inputImages = usageObject.input_images || 0
const outputImages = usageObject.output_images || 0
const outputDurationSeconds = usageObject.output_duration_seconds || 0

// Include in Redis usage record
await redis.addUsageRecord(keyId, {
  // ... existing fields ...
  inputImages,
  outputImages,
  outputDurationSeconds,
  mediaCost: costInfo.mediaTotalCost || 0
})
```

### Step 3: Capture Media Metrics in Relay Services

Location: `src/services/geminiRelayService.js`

```javascript
// Parse image count from response
function parseImageCount(response) {
  // Gemini returns images in candidates[].content.parts[]
  const parts = response?.candidates?.[0]?.content?.parts || []
  return parts.filter(p => p.inline_data?.mime_type?.startsWith('image/')).length
}

// Parse video duration from response
function parseVideoDuration(response) {
  return response?.video?.duration_seconds || 0
}

// Include in usage recording
const usage = {
  input_tokens: response.usageMetadata?.promptTokenCount || 0,
  output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
  output_images: parseImageCount(response),
  output_duration_seconds: parseVideoDuration(response)
}
```

---

## Testing

### Unit Test: Image Billing

```javascript
// tests/unit/mediaBilling.test.js
const pricingService = require('../../src/services/pricingService')

describe('Media Billing', () => {
  test('calculates image cost correctly', () => {
    const usage = { output_images: 2 }
    const model = 'dall-e-3'

    const result = pricingService.calculateCost(usage, model)

    expect(result.isImageModel).toBe(true)
    expect(result.imageOutputCost).toBeGreaterThan(0)
    expect(result.totalCost).toBe(result.imageOutputCost)
  })

  test('calculates video cost correctly', () => {
    const usage = { output_duration_seconds: 10 }
    const model = 'gemini/veo-3.1-generate-preview'

    const result = pricingService.calculateCost(usage, model)

    expect(result.isVideoModel).toBe(true)
    expect(result.videoOutputCost).toBe(10 * 0.40) // $0.40/second
  })

  test('handles mixed billing (token + image)', () => {
    const usage = {
      input_tokens: 100,
      output_tokens: 500,
      output_images: 1
    }
    const model = 'gemini/gemini-3-pro-image-preview'

    const result = pricingService.calculateCost(usage, model)

    expect(result.inputCost).toBeGreaterThan(0)
    expect(result.outputCost).toBeGreaterThan(0)
    expect(result.imageOutputCost).toBeGreaterThan(0)
    expect(result.totalCost).toBe(
      result.inputCost + result.outputCost + result.imageOutputCost
    )
  })

  test('backward compatible with token-only models', () => {
    const usage = { input_tokens: 100, output_tokens: 500 }
    const model = 'claude-3-opus'

    const result = pricingService.calculateCost(usage, model)

    expect(result.isMediaModel).toBe(false)
    expect(result.mediaTotalCost).toBe(0)
    expect(result.totalCost).toBe(result.inputCost + result.outputCost)
  })
})
```

### Run Tests

```bash
npm test -- --testPathPattern=mediaBilling
```

---

## Verification Checklist

- [ ] `pricingService.calculateCost()` detects `mode: "image_generation"`
- [ ] `pricingService.calculateCost()` detects `mode: "video_generation"`
- [ ] Image cost calculated using `output_cost_per_image`
- [ ] Video cost calculated using `output_cost_per_second`
- [ ] Mixed billing sums token + media costs
- [ ] Token-only models return `mediaTotalCost: 0`
- [ ] Redis usage records include `inputImages`, `outputImages`, `outputDurationSeconds`
- [ ] No performance regression (< 5ms overhead)

---

## Troubleshooting

### Cost shows as zero for image model

1. Check if model exists in pricing data: `pricingService.getModelPricing('model-name')`
2. Verify `mode` field is `"image_generation"`
3. Verify `output_cost_per_image` or fallback fields exist
4. Ensure `output_images` is being captured from API response

### Video duration not being recorded

1. Check Gemini API response structure for `duration_seconds` field
2. Verify relay service is parsing the correct path in response
3. Add logging: `logger.debug('Video duration:', response.video?.duration_seconds)`

### Historical data missing media fields

This is expected. Historical usage records won't have media fields. They will appear as 0 in aggregations.
