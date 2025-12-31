# Data Model: Generative Media Billing Support

**Date**: 2025-12-31
**Feature**: 001-image-billing

## Overview

This document describes the data model extensions required to support generative media billing. The design extends existing entities rather than creating new ones.

---

## 1. Usage Object (Extended)

The usage object is passed between services to track resource consumption per request.

### Current Structure
```javascript
{
  input_tokens: number,
  output_tokens: number,
  cache_creation_input_tokens: number,
  cache_read_input_tokens: number,
  cache_creation?: {
    ephemeral_5m_input_tokens: number,
    ephemeral_1h_input_tokens: number
  }
}
```

### Extended Structure
```javascript
{
  // Token fields (unchanged)
  input_tokens: number,           // Input tokens consumed
  output_tokens: number,          // Output tokens generated
  cache_creation_input_tokens: number,
  cache_read_input_tokens: number,
  cache_creation?: {
    ephemeral_5m_input_tokens: number,
    ephemeral_1h_input_tokens: number
  },

  // NEW: Image fields
  input_images: number,           // Number of input images (e.g., image-to-image)
  output_images: number,          // Number of generated images
  image_resolution: string | null, // Resolution string (e.g., "1024x1024")
  input_pixels: number,           // Total input pixels (computed from resolution)
  output_pixels: number,          // Total output pixels (computed from resolution)

  // NEW: Video fields
  output_duration_seconds: number // Video duration in seconds (float)
}
```

### Validation Rules
| Field | Type | Default | Constraints |
|-------|------|---------|-------------|
| `input_images` | number | 0 | >= 0, integer |
| `output_images` | number | 0 | >= 0, integer |
| `image_resolution` | string\|null | null | Format: "WxH" (e.g., "1024x1024") |
| `input_pixels` | number | 0 | >= 0, integer |
| `output_pixels` | number | 0 | >= 0, integer |
| `output_duration_seconds` | number | 0 | >= 0, float |

---

## 2. Pricing Object (Reference)

The pricing object comes from external pricing data. No changes needed to the storage format, but we need to document the media-specific fields we consume.

### Media Pricing Fields (Read-Only)
```javascript
{
  // Mode identifier
  mode: "image_generation" | "video_generation" | "audio_generation" | "chat" | "completion",

  // Image pricing (optional)
  input_cost_per_image: number,        // USD per input image
  output_cost_per_image: number,       // USD per output image
  output_cost_per_image_token: number, // USD per output token (image-specific)
  input_cost_per_pixel: number,        // USD per input pixel
  output_cost_per_pixel: number,       // USD per output pixel

  // Video pricing (optional)
  output_cost_per_second: number,      // USD per second of video

  // Standard token pricing (always present)
  input_cost_per_token: number,
  output_cost_per_token: number,
  cache_creation_input_token_cost: number,
  cache_read_input_token_cost: number
}
```

---

## 3. Cost Result Object (Extended)

The cost calculation result returned by `pricingService.calculateCost()`.

### Current Structure
```javascript
{
  inputCost: number,
  outputCost: number,
  cacheCreateCost: number,
  cacheReadCost: number,
  ephemeral5mCost: number,
  ephemeral1hCost: number,
  totalCost: number,
  hasPricing: boolean,
  isLongContextRequest: boolean,
  pricing: {
    input: number,
    output: number,
    cacheCreate: number,
    cacheRead: number,
    ephemeral1h: number
  }
}
```

### Extended Structure
```javascript
{
  // Token costs (unchanged)
  inputCost: number,
  outputCost: number,
  cacheCreateCost: number,
  cacheReadCost: number,
  ephemeral5mCost: number,
  ephemeral1hCost: number,

  // NEW: Media costs
  imageInputCost: number,         // Cost for input images
  imageOutputCost: number,        // Cost for output images
  imageTotalCost: number,         // imageInputCost + imageOutputCost
  videoOutputCost: number,        // Cost for video output (duration-based)
  mediaTotalCost: number,         // imageTotalCost + videoOutputCost

  // Total (updated to include media)
  totalCost: number,              // tokenCosts + mediaTotalCost

  // Flags
  hasPricing: boolean,
  isLongContextRequest: boolean,
  isImageModel: boolean,          // NEW: mode === "image_generation"
  isVideoModel: boolean,          // NEW: mode === "video_generation"
  isMediaModel: boolean,          // NEW: isImageModel || isVideoModel

  // Pricing rates used
  pricing: {
    // Token rates (unchanged)
    input: number,
    output: number,
    cacheCreate: number,
    cacheRead: number,
    ephemeral1h: number,

    // NEW: Media rates
    inputPerImage: number,
    outputPerImage: number,
    outputPerImageToken: number,
    inputPerPixel: number,
    outputPerPixel: number,
    outputPerSecond: number
  }
}
```

---

## 4. Redis Usage Storage (Extended)

### Daily Usage Hash
**Key Pattern**: `usage:daily:{YYYY-MM-DD}:{keyId}:{model}`

### Current Fields
```
inputTokens: string (number as string)
outputTokens: string
cacheCreateTokens: string
cacheReadTokens: string
cost: string (USD as string)
requestCount: string
```

### Extended Fields
```
inputTokens: string
outputTokens: string
cacheCreateTokens: string
cacheReadTokens: string
cost: string                    # Total cost (tokens + media)

# NEW: Media fields
inputImages: string             # Total input images
outputImages: string            # Total output images
outputDurationSeconds: string   # Total video seconds (float as string)
mediaCost: string               # Media-only cost (USD as string)

requestCount: string
```

### Account Usage Hash
**Key Pattern**: `usage:account:{accountId}:{YYYY-MM-DD}`

Same field extensions as daily usage.

### Global Usage Hash
**Key Pattern**: `usage:global:{YYYY-MM-DD}`

Same field extensions as daily usage.

---

## 5. Usage Record Object

Individual request records stored for detailed history.

### Current Structure
```javascript
{
  timestamp: string,      // ISO 8601
  model: string,
  accountId: string | null,
  inputTokens: number,
  outputTokens: number,
  cacheCreateTokens: number,
  cacheReadTokens: number,
  cost: number
}
```

### Extended Structure
```javascript
{
  timestamp: string,
  model: string,
  accountId: string | null,

  // Token usage
  inputTokens: number,
  outputTokens: number,
  cacheCreateTokens: number,
  cacheReadTokens: number,

  // NEW: Media usage
  inputImages: number,
  outputImages: number,
  outputDurationSeconds: number,

  // Costs
  cost: number,           // Total cost
  mediaCost: number       // NEW: Media portion of cost
}
```

---

## 6. Entity Relationships

```
┌─────────────────┐
│    API Key      │
└────────┬────────┘
         │ 1:N
         ▼
┌─────────────────┐      ┌─────────────────┐
│  Usage Record   │──────│  Cost Result    │
│  (per request)  │      │  (computed)     │
└────────┬────────┘      └─────────────────┘
         │                        │
         │ aggregates to          │ derived from
         ▼                        ▼
┌─────────────────┐      ┌─────────────────┐
│  Daily Usage    │      │  Pricing Data   │
│  (Redis hash)   │      │  (JSON file)    │
└─────────────────┘      └─────────────────┘
```

---

## 7. State Transitions

Media billing has no state transitions - it's a pure calculation based on usage and pricing data.

---

## 8. Backward Compatibility

### Missing Fields Handling

All new fields have sensible defaults:

| New Field | Default | Behavior when absent |
|-----------|---------|---------------------|
| `input_images` | 0 | Treated as zero images |
| `output_images` | 0 | Treated as zero images |
| `image_resolution` | null | Skip pixel calculation |
| `output_duration_seconds` | 0 | Treated as zero video duration |
| `mediaCost` | 0 | Only token cost tracked |

### Legacy Usage Objects

Old usage objects without media fields will:
1. Calculate token costs normally
2. Return 0 for all media costs
3. Set `isImageModel`, `isVideoModel`, `isMediaModel` to false

### Redis Data Migration

No migration needed. New fields will appear as usage is recorded. Historical data will simply not have media fields (treated as 0).

---

## 9. Helper Functions

### Resolution to Pixels
```javascript
function parseResolutionToPixels(resolution) {
  if (!resolution || typeof resolution !== 'string') {
    return { width: 0, height: 0, pixels: 0 }
  }
  const match = resolution.match(/^(\d+)x(\d+)$/)
  if (!match) {
    return { width: 0, height: 0, pixels: 0 }
  }
  const width = parseInt(match[1], 10)
  const height = parseInt(match[2], 10)
  return { width, height, pixels: width * height }
}
```

### Mode Detection
```javascript
function isMediaModel(pricing) {
  if (!pricing || !pricing.mode) return false
  return ['image_generation', 'video_generation', 'audio_generation'].includes(pricing.mode)
}

function isImageGenerationModel(pricing) {
  return pricing?.mode === 'image_generation'
}

function isVideoGenerationModel(pricing) {
  return pricing?.mode === 'video_generation'
}
```
