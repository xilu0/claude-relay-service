/**
 * API Key Service Tests - Regeneration and Hash Mapping
 *
 * Tests for the bug fix where old API Keys remained valid after regeneration
 * due to orphaned hash mappings in Redis.
 */

const Redis = require('ioredis')
const config = require('../config/config')
const apiKeyService = require('../src/services/apiKeyService')

// Mock Redis client for testing
let redis

// Test data
const testUserId = 'test-user-123'
const testUserType = 'user'

describe('API Key Regeneration and Hash Mapping', () => {
  beforeAll(async () => {
    // Initialize Redis connection
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0
    })
  })

  afterAll(async () => {
    // Clean up Redis connection
    if (redis) {
      await redis.quit()
    }
  })

  describe('API Key Regeneration', () => {
    let originalKeyId
    let originalApiKey
    let originalHashedKey
    let newApiKey

    beforeEach(async () => {
      // Create a test API Key
      const result = await apiKeyService.createApiKey({
        name: 'Test Key for Regeneration',
        userId: testUserId,
        userType: testUserType,
        limit: 1000
      })

      originalKeyId = result.id
      originalApiKey = result.apiKey
      originalHashedKey = apiKeyService._hashApiKey(originalApiKey)
    })

    afterEach(async () => {
      // Clean up test data
      if (originalKeyId) {
        try {
          await apiKeyService.deleteApiKey(originalKeyId, testUserId, testUserType)
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    })

    test('should remove old hash mapping after regeneration', async () => {
      // Verify old key exists in hash map
      const oldMapping = await redis.hget('apikey:hash_map', originalHashedKey)
      expect(oldMapping).toBe(originalKeyId)

      // Regenerate the API Key
      const result = await apiKeyService.regenerateApiKey(originalKeyId)
      newApiKey = result.apiKey
      const newHashedKey = apiKeyService._hashApiKey(newApiKey)

      // Verify old hash mapping is removed
      const oldMappingAfter = await redis.hget('apikey:hash_map', originalHashedKey)
      expect(oldMappingAfter).toBeNull()

      // Verify new hash mapping exists
      const newMapping = await redis.hget('apikey:hash_map', newHashedKey)
      expect(newMapping).toBe(originalKeyId)
    })

    test('should fail authentication with old API Key after regeneration', async () => {
      // Regenerate the API Key
      const result = await apiKeyService.regenerateApiKey(originalKeyId)
      newApiKey = result.apiKey

      // Try to validate old API Key - should fail
      const oldKeyValidation = await apiKeyService.validateApiKey(originalApiKey)
      expect(oldKeyValidation).toBeNull()
    })

    test('should successfully authenticate with new API Key after regeneration', async () => {
      // Regenerate the API Key
      const result = await apiKeyService.regenerateApiKey(originalKeyId)
      newApiKey = result.apiKey

      // Validate new API Key - should succeed
      const newKeyValidation = await apiKeyService.validateApiKey(newApiKey)
      expect(newKeyValidation).not.toBeNull()
      expect(newKeyValidation.id).toBe(originalKeyId)
      expect(newKeyValidation.isActive).toBe('true')
    })

    test('should only have one hash mapping per API Key after regeneration', async () => {
      // Regenerate the API Key
      const result = await apiKeyService.regenerateApiKey(originalKeyId)
      newApiKey = result.apiKey
      const newHashedKey = apiKeyService._hashApiKey(newApiKey)

      // Get all hash mappings
      const allMappings = await redis.hgetall('apikey:hash_map')

      // Count how many mappings point to this key ID
      const mappingsForThisKey = Object.entries(allMappings).filter(
        ([hash, keyId]) => keyId === originalKeyId
      )

      // Should only have one mapping (the new one)
      expect(mappingsForThisKey.length).toBe(1)
      expect(mappingsForThisKey[0][0]).toBe(newHashedKey)
    })
  })

  describe('API Key Soft Delete', () => {
    let keyId
    let apiKey
    let hashedKey

    beforeEach(async () => {
      // Create a test API Key
      const result = await apiKeyService.createApiKey({
        name: 'Test Key for Soft Delete',
        userId: testUserId,
        userType: testUserType,
        limit: 1000
      })

      keyId = result.id
      apiKey = result.apiKey
      hashedKey = apiKeyService._hashApiKey(apiKey)
    })

    afterEach(async () => {
      // Clean up test data
      if (keyId) {
        try {
          await apiKeyService.deleteApiKey(keyId, testUserId, testUserType)
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    })

    test('should remove hash mapping after soft delete', async () => {
      // Verify hash mapping exists
      const mappingBefore = await redis.hget('apikey:hash_map', hashedKey)
      expect(mappingBefore).toBe(keyId)

      // Soft delete the API Key
      await apiKeyService.softDeleteApiKey(keyId, testUserId, testUserType)

      // Verify hash mapping is removed
      const mappingAfter = await redis.hget('apikey:hash_map', hashedKey)
      expect(mappingAfter).toBeNull()
    })

    test('should fail authentication after soft delete', async () => {
      // Soft delete the API Key
      await apiKeyService.softDeleteApiKey(keyId, testUserId, testUserType)

      // Try to validate - should fail
      const validation = await apiKeyService.validateApiKey(apiKey)
      expect(validation).toBeNull()
    })
  })

  describe('API Key Restore', () => {
    let keyId
    let apiKey
    let hashedKey

    beforeEach(async () => {
      // Create and soft delete a test API Key
      const result = await apiKeyService.createApiKey({
        name: 'Test Key for Restore',
        userId: testUserId,
        userType: testUserType,
        limit: 1000
      })

      keyId = result.id
      apiKey = result.apiKey
      hashedKey = apiKeyService._hashApiKey(apiKey)

      // Soft delete it
      await apiKeyService.softDeleteApiKey(keyId, testUserId, testUserType)
    })

    afterEach(async () => {
      // Clean up test data
      if (keyId) {
        try {
          await apiKeyService.deleteApiKey(keyId, testUserId, testUserType)
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    })

    test('should restore hash mapping after restore', async () => {
      // Verify hash mapping is removed after soft delete
      const mappingBefore = await redis.hget('apikey:hash_map', hashedKey)
      expect(mappingBefore).toBeNull()

      // Restore the API Key
      await apiKeyService.restoreApiKey(keyId, testUserId, testUserType)

      // Verify hash mapping is restored
      const mappingAfter = await redis.hget('apikey:hash_map', hashedKey)
      expect(mappingAfter).toBe(keyId)
    })

    test('should successfully authenticate after restore', async () => {
      // Restore the API Key
      await apiKeyService.restoreApiKey(keyId, testUserId, testUserType)

      // Validate - should succeed
      const validation = await apiKeyService.validateApiKey(apiKey)
      expect(validation).not.toBeNull()
      expect(validation.id).toBe(keyId)
      expect(validation.isActive).toBe('true')
    })
  })

  describe('API Key Hard Delete', () => {
    let keyId
    let apiKey
    let hashedKey

    beforeEach(async () => {
      // Create a test API Key
      const result = await apiKeyService.createApiKey({
        name: 'Test Key for Hard Delete',
        userId: testUserId,
        userType: testUserType,
        limit: 1000
      })

      keyId = result.id
      apiKey = result.apiKey
      hashedKey = apiKeyService._hashApiKey(apiKey)
    })

    test('should remove hash mapping after hard delete', async () => {
      // Verify hash mapping exists
      const mappingBefore = await redis.hget('apikey:hash_map', hashedKey)
      expect(mappingBefore).toBe(keyId)

      // Hard delete the API Key
      await apiKeyService.deleteApiKey(keyId, testUserId, testUserType)

      // Verify hash mapping is removed
      const mappingAfter = await redis.hget('apikey:hash_map', hashedKey)
      expect(mappingAfter).toBeNull()

      // Verify API Key data is removed
      const keyData = await redis.hgetall(`apikey:${keyId}`)
      expect(Object.keys(keyData).length).toBe(0)
    })

    test('should fail authentication after hard delete', async () => {
      // Hard delete the API Key
      await apiKeyService.deleteApiKey(keyId, testUserId, testUserType)

      // Try to validate - should fail
      const validation = await apiKeyService.validateApiKey(apiKey)
      expect(validation).toBeNull()
    })
  })
})
