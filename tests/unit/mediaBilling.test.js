/**
 * Media Billing Unit Tests
 *
 * Tests for generative media billing support (image, video, audio modes)
 * Feature: 001-image-billing
 */

const pricingService = require('../../src/services/pricingService')

// Mock pricing data for testing
const mockImagePricing = {
  mode: 'image_generation',
  output_cost_per_image: 0.04,
  input_cost_per_image: 0.001,
  input_cost_per_token: 0.000001,
  output_cost_per_token: 0.000002
}

const mockPixelPricing = {
  mode: 'image_generation',
  input_cost_per_pixel: 0.00000001,
  output_cost_per_pixel: 0.00000002,
  input_cost_per_token: 0.000001,
  output_cost_per_token: 0.000002
}

const mockTokenFallbackPricing = {
  mode: 'image_generation',
  output_cost_per_image_token: 0.00001,
  input_cost_per_token: 0.000001,
  output_cost_per_token: 0.000002
}

const mockVideoPricing = {
  mode: 'video_generation',
  output_cost_per_second: 0.4,
  input_cost_per_token: 0.000001,
  output_cost_per_token: 0.000002
}

const mockTokenOnlyPricing = {
  mode: 'chat',
  input_cost_per_token: 0.000003,
  output_cost_per_token: 0.000015
}

describe('Media Billing', () => {
  // Store original method to restore after tests
  let originalGetModelPricing

  beforeAll(() => {
    originalGetModelPricing = pricingService.getModelPricing.bind(pricingService)
  })

  afterAll(() => {
    pricingService.getModelPricing = originalGetModelPricing
  })

  // ========== Helper Function Tests ==========

  describe('parseResolutionToPixels', () => {
    test('parses valid resolution string correctly', () => {
      const result = pricingService.parseResolutionToPixels('1024x1024')
      expect(result).toEqual({ width: 1024, height: 1024, pixels: 1048576 })
    })

    test('parses non-square resolution correctly', () => {
      const result = pricingService.parseResolutionToPixels('512x768')
      expect(result).toEqual({ width: 512, height: 768, pixels: 393216 })
    })

    test('returns zero for invalid resolution string', () => {
      const result = pricingService.parseResolutionToPixels('invalid')
      expect(result).toEqual({ width: 0, height: 0, pixels: 0 })
    })

    test('returns zero for null input', () => {
      const result = pricingService.parseResolutionToPixels(null)
      expect(result).toEqual({ width: 0, height: 0, pixels: 0 })
    })

    test('returns zero for empty string', () => {
      const result = pricingService.parseResolutionToPixels('')
      expect(result).toEqual({ width: 0, height: 0, pixels: 0 })
    })

    test('returns zero for partial resolution (missing dimension)', () => {
      const result = pricingService.parseResolutionToPixels('1024')
      expect(result).toEqual({ width: 0, height: 0, pixels: 0 })
    })
  })

  describe('isMediaModel', () => {
    test('returns true for image_generation mode', () => {
      expect(pricingService.isMediaModel({ mode: 'image_generation' })).toBe(true)
    })

    test('returns true for video_generation mode', () => {
      expect(pricingService.isMediaModel({ mode: 'video_generation' })).toBe(true)
    })

    test('returns true for audio_generation mode', () => {
      expect(pricingService.isMediaModel({ mode: 'audio_generation' })).toBe(true)
    })

    test('returns false for chat mode', () => {
      expect(pricingService.isMediaModel({ mode: 'chat' })).toBe(false)
    })

    test('returns false for null pricing', () => {
      expect(pricingService.isMediaModel(null)).toBe(false)
    })

    test('returns false for pricing without mode', () => {
      expect(pricingService.isMediaModel({})).toBe(false)
    })
  })

  describe('isImageGenerationModel', () => {
    test('returns true for image_generation mode', () => {
      expect(pricingService.isImageGenerationModel({ mode: 'image_generation' })).toBe(true)
    })

    test('returns false for video_generation mode', () => {
      expect(pricingService.isImageGenerationModel({ mode: 'video_generation' })).toBe(false)
    })

    test('returns false for null', () => {
      expect(pricingService.isImageGenerationModel(null)).toBe(false)
    })
  })

  describe('isVideoGenerationModel', () => {
    test('returns true for video_generation mode', () => {
      expect(pricingService.isVideoGenerationModel({ mode: 'video_generation' })).toBe(true)
    })

    test('returns false for image_generation mode', () => {
      expect(pricingService.isVideoGenerationModel({ mode: 'image_generation' })).toBe(false)
    })

    test('returns false for null', () => {
      expect(pricingService.isVideoGenerationModel(null)).toBe(false)
    })
  })

  // ========== Image Model Detection Tests (US1) ==========

  describe('Image Model Detection', () => {
    test('image model detection returns isImageModel=true', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockImagePricing)

      const result = pricingService.calculateCost({ output_images: 1 }, 'dall-e-3')

      expect(result.isImageModel).toBe(true)
      expect(result.isVideoModel).toBe(false)
      expect(result.isMediaModel).toBe(true)
    })

    test('token-only model returns isImageModel=false', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockTokenOnlyPricing)

      const result = pricingService.calculateCost(
        { input_tokens: 100, output_tokens: 500 },
        'claude-3-opus'
      )

      expect(result.isImageModel).toBe(false)
      expect(result.isVideoModel).toBe(false)
      expect(result.isMediaModel).toBe(false)
    })
  })

  // ========== Per-Image Pricing Tests (US1) ==========

  describe('Per-Image Pricing', () => {
    test('per-image pricing calculates correctly', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockImagePricing)

      const usage = { output_images: 2 }
      const result = pricingService.calculateCost(usage, 'dall-e-3')

      expect(result.imageOutputCost).toBe(0.08) // 2 × $0.04
      expect(result.isImageModel).toBe(true)
    })

    test('input and output images calculated separately', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockImagePricing)

      const usage = { input_images: 1, output_images: 3 }
      const result = pricingService.calculateCost(usage, 'gemini-image')

      expect(result.imageInputCost).toBe(0.001) // 1 × $0.001
      expect(result.imageOutputCost).toBe(0.12) // 3 × $0.04
      expect(result.imageTotalCost).toBe(0.121)
    })

    test('zero output images returns zero image cost', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockImagePricing)

      const usage = { output_images: 0 }
      const result = pricingService.calculateCost(usage, 'dall-e-3')

      expect(result.imageOutputCost).toBe(0)
      expect(result.imageTotalCost).toBe(0)
    })
  })

  // ========== Pixel-Based Pricing Tests (US1) ==========

  describe('Pixel-Based Pricing', () => {
    test('pixel-based pricing calculates correctly', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockPixelPricing)

      const usage = {
        output_images: 1,
        output_pixels: 1048576 // 1024x1024
      }
      const result = pricingService.calculateCost(usage, 'dall-e-2')

      expect(result.imageOutputCost).toBeCloseTo(0.02097152, 6) // 1048576 × $0.00000002
      expect(result.isImageModel).toBe(true)
    })

    test('pixel-based pricing returns zero for invalid/missing resolution', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockPixelPricing)

      const usage = {
        output_images: 1,
        image_resolution: 'invalid'
      }
      const result = pricingService.calculateCost(usage, 'dall-e-2')

      // Without valid pixels, should fall back to zero (no per-image pricing in mock)
      expect(result.imageOutputCost).toBe(0)
    })

    test('resolution string parsed to pixels when pixels not provided', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockPixelPricing)

      const usage = {
        output_images: 1,
        image_resolution: '1024x1024'
      }
      const result = pricingService.calculateCost(usage, 'dall-e-2')

      expect(result.imageOutputCost).toBeCloseTo(0.02097152, 6) // 1048576 × $0.00000002
    })
  })

  // ========== Token Fallback Pricing Tests (US1) ==========

  describe('Token Fallback Pricing', () => {
    test('token fallback pricing works when per-image missing', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockTokenFallbackPricing)

      const usage = {
        output_images: 1,
        output_tokens: 1000
      }
      const result = pricingService.calculateCost(usage, 'image-model')

      // Uses output_cost_per_image_token since output_cost_per_image is missing
      expect(result.imageOutputCost).toBe(0.01) // 1000 × $0.00001
      expect(result.isImageModel).toBe(true)
    })
  })

  // ========== Mixed Billing Tests (US1) ==========

  describe('Mixed Billing (Token + Image)', () => {
    test('mixed billing (token + image) sums correctly', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockImagePricing)

      const usage = {
        input_tokens: 100,
        output_tokens: 500,
        output_images: 1
      }
      const result = pricingService.calculateCost(usage, 'gemini-image')

      // Token costs: 100 × $0.000001 + 500 × $0.000002 = $0.0001 + $0.001 = $0.0011
      // Image costs: 1 × $0.04 = $0.04
      // Total: $0.0411
      expect(result.inputCost).toBeCloseTo(0.0001, 6)
      expect(result.outputCost).toBeCloseTo(0.001, 6)
      expect(result.imageOutputCost).toBe(0.04)
      expect(result.totalCost).toBeCloseTo(0.0411, 4)
    })
  })

  // ========== Video Model Detection Tests (US2) ==========

  describe('Video Model Detection', () => {
    test('video model detection returns isVideoModel=true', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockVideoPricing)

      const result = pricingService.calculateCost({ output_duration_seconds: 10 }, 'gemini-veo')

      expect(result.isVideoModel).toBe(true)
      expect(result.isImageModel).toBe(false)
      expect(result.isMediaModel).toBe(true)
    })
  })

  // ========== Video Pricing Tests (US2) ==========

  describe('Video Per-Second Pricing', () => {
    test('per-second pricing calculates correctly', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockVideoPricing)

      const usage = { output_duration_seconds: 10 }
      const result = pricingService.calculateCost(usage, 'gemini-veo')

      expect(result.videoOutputCost).toBe(4.0) // 10 × $0.40
      expect(result.isVideoModel).toBe(true)
    })

    test('fractional seconds supported (no rounding)', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockVideoPricing)

      const usage = { output_duration_seconds: 10.5 }
      const result = pricingService.calculateCost(usage, 'gemini-veo')

      expect(result.videoOutputCost).toBe(4.2) // 10.5 × $0.40
    })

    test('zero duration returns zero video cost', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockVideoPricing)

      const usage = { output_duration_seconds: 0 }
      const result = pricingService.calculateCost(usage, 'gemini-veo')

      expect(result.videoOutputCost).toBe(0)
    })
  })

  // ========== Backward Compatibility Tests (US4) ==========

  describe('Backward Compatibility', () => {
    test('token-only model returns mediaTotalCost=0', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockTokenOnlyPricing)

      const usage = { input_tokens: 100, output_tokens: 500 }
      const result = pricingService.calculateCost(usage, 'claude-3-opus')

      expect(result.mediaTotalCost).toBe(0)
      expect(result.imageInputCost).toBe(0)
      expect(result.imageOutputCost).toBe(0)
      expect(result.videoOutputCost).toBe(0)
    })

    test('token-only model returns isMediaModel=false', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockTokenOnlyPricing)

      const usage = { input_tokens: 100, output_tokens: 500 }
      const result = pricingService.calculateCost(usage, 'claude-3-opus')

      expect(result.isMediaModel).toBe(false)
      expect(result.isImageModel).toBe(false)
      expect(result.isVideoModel).toBe(false)
    })

    test('legacy usage object (no media fields) works correctly', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockTokenOnlyPricing)

      const usage = {
        input_tokens: 100,
        output_tokens: 500
        // No media fields
      }
      const result = pricingService.calculateCost(usage, 'claude-3-opus')

      expect(result.hasPricing).toBe(true)
      expect(result.mediaTotalCost).toBe(0)
      expect(result.totalCost).toBeGreaterThan(0)
    })

    test('totalCost for token-only model equals inputCost + outputCost + cacheCosts', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue({
        ...mockTokenOnlyPricing,
        cache_creation_input_token_cost: 0.000004,
        cache_read_input_token_cost: 0.0000003
      })

      const usage = {
        input_tokens: 100,
        output_tokens: 500,
        cache_creation_input_tokens: 50,
        cache_read_input_tokens: 200
      }
      const result = pricingService.calculateCost(usage, 'claude-3-opus')

      const expectedTotal =
        result.inputCost + result.outputCost + result.cacheCreateCost + result.cacheReadCost
      expect(result.totalCost).toBeCloseTo(expectedTotal, 10)
      expect(result.mediaTotalCost).toBe(0)
    })
  })

  // ========== Cost Breakdown Tests (US5) ==========

  describe('Cost Breakdown', () => {
    test('mixed request returns all cost breakdown fields', () => {
      // Mock a model that supports both tokens and images
      pricingService.getModelPricing = jest.fn().mockReturnValue({
        mode: 'image_generation',
        input_cost_per_token: 0.000001,
        output_cost_per_token: 0.000002,
        output_cost_per_image: 0.05
      })

      const usage = {
        input_tokens: 100,
        output_tokens: 500,
        output_images: 2
      }
      const result = pricingService.calculateCost(usage, 'gemini-image')

      expect(result).toHaveProperty('inputCost')
      expect(result).toHaveProperty('outputCost')
      expect(result).toHaveProperty('imageInputCost')
      expect(result).toHaveProperty('imageOutputCost')
      expect(result).toHaveProperty('imageTotalCost')
      expect(result).toHaveProperty('videoOutputCost')
      expect(result).toHaveProperty('mediaTotalCost')
      expect(result).toHaveProperty('totalCost')

      expect(result.imageOutputCost).toBe(0.1) // 2 × $0.05
    })

    test('pure video request returns token costs as zero', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockVideoPricing)

      const usage = { output_duration_seconds: 5 }
      const result = pricingService.calculateCost(usage, 'gemini-veo')

      expect(result.inputCost).toBe(0)
      expect(result.outputCost).toBe(0)
      expect(result.videoOutputCost).toBe(2.0) // 5 × $0.40
      expect(result.totalCost).toBe(2.0)
    })

    test('pure image request returns video cost as zero', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockImagePricing)

      const usage = { output_images: 2 }
      const result = pricingService.calculateCost(usage, 'dall-e-3')

      expect(result.videoOutputCost).toBe(0)
      expect(result.imageOutputCost).toBe(0.08) // 2 × $0.04
      expect(result.totalCost).toBe(0.08)
    })
  })

  // ========== Pricing Rates in Return Object ==========

  describe('Pricing Rates', () => {
    test('media pricing rates are included in return object', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue({
        mode: 'image_generation',
        input_cost_per_image: 0.001,
        output_cost_per_image: 0.04,
        output_cost_per_image_token: 0.00001,
        input_cost_per_pixel: 0.00000001,
        output_cost_per_pixel: 0.00000002,
        output_cost_per_second: 0.5,
        input_cost_per_token: 0.000001,
        output_cost_per_token: 0.000002
      })

      const result = pricingService.calculateCost({ output_images: 1 }, 'test-model')

      expect(result.pricing.inputPerImage).toBe(0.001)
      expect(result.pricing.outputPerImage).toBe(0.04)
      expect(result.pricing.outputPerImageToken).toBe(0.00001)
      expect(result.pricing.inputPerPixel).toBe(0.00000001)
      expect(result.pricing.outputPerPixel).toBe(0.00000002)
      expect(result.pricing.outputPerSecond).toBe(0.5)
    })
  })

  // ========== Media Usage Tracking (US3) ==========

  describe('Media Usage Tracking', () => {
    test('calculateCost returns media fields for use in usage tracking', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockImagePricing)

      const usage = {
        input_tokens: 100,
        output_tokens: 500,
        input_images: 2,
        output_images: 3
      }

      const result = pricingService.calculateCost(usage, 'gemini-3-pro-image-preview')

      // Verify that all fields needed for usage tracking are present
      expect(result).toHaveProperty('imageInputCost')
      expect(result).toHaveProperty('imageOutputCost')
      expect(result).toHaveProperty('imageTotalCost')
      expect(result).toHaveProperty('isImageModel')
      expect(result).toHaveProperty('isMediaModel')

      // Verify costs are calculated correctly
      expect(result.imageInputCost).toBe(0.002) // 2 × $0.001
      expect(result.imageOutputCost).toBe(0.12) // 3 × $0.04
      expect(result.isImageModel).toBe(true)
      expect(result.isMediaModel).toBe(true)
    })

    test('calculateCost returns video duration fields for usage tracking', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockVideoPricing)

      const usage = {
        output_duration_seconds: 15.5
      }

      const result = pricingService.calculateCost(usage, 'gemini/veo-3.1-generate-preview')

      // Verify video tracking fields are present
      expect(result).toHaveProperty('videoOutputCost')
      expect(result).toHaveProperty('isVideoModel')
      expect(result).toHaveProperty('mediaTotalCost')

      // Verify costs are calculated correctly
      expect(result.videoOutputCost).toBe(6.2) // 15.5 × $0.40
      expect(result.isVideoModel).toBe(true)
      expect(result.isMediaModel).toBe(true)
    })

    test('mixed media usage returns all tracking fields', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue({
        mode: 'image_generation',
        input_cost_per_token: 0.000001,
        output_cost_per_token: 0.000002,
        input_cost_per_image: 0.001,
        output_cost_per_image: 0.05
      })

      const usage = {
        input_tokens: 1000,
        output_tokens: 2000,
        input_images: 1,
        output_images: 2
      }

      const result = pricingService.calculateCost(usage, 'test-image-model')

      // All tracking fields should be present
      expect(result.inputCost).toBeDefined()
      expect(result.outputCost).toBeDefined()
      expect(result.imageInputCost).toBeDefined()
      expect(result.imageOutputCost).toBeDefined()
      expect(result.imageTotalCost).toBeDefined()
      expect(result.mediaTotalCost).toBeDefined()
      expect(result.totalCost).toBeDefined()

      // Token costs
      expect(result.inputCost).toBe(0.001) // 1000 × $0.000001
      expect(result.outputCost).toBe(0.004) // 2000 × $0.000002

      // Image costs
      expect(result.imageInputCost).toBe(0.001) // 1 × $0.001
      expect(result.imageOutputCost).toBe(0.1) // 2 × $0.05

      // Totals
      expect(result.imageTotalCost).toBe(0.101) // 0.001 + 0.1
      expect(result.mediaTotalCost).toBe(0.101) // no video
      expect(result.totalCost).toBeCloseTo(0.106) // tokens + media
    })

    test('usage object with media fields is accepted by pricingService', () => {
      pricingService.getModelPricing = jest.fn().mockReturnValue(mockImagePricing)

      // This is the format that recordUsageWithDetails receives
      const usageObject = {
        input_tokens: 500,
        output_tokens: 1000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        input_images: 0,
        output_images: 4,
        output_duration_seconds: 0,
        image_resolution: '1024x1024'
      }

      const result = pricingService.calculateCost(usageObject, 'dall-e-3')

      expect(result.imageOutputCost).toBe(0.16) // 4 × $0.04
      expect(result.isImageModel).toBe(true)
      expect(result.totalCost).toBeGreaterThan(0)
    })
  })
})
