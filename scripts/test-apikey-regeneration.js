#!/usr/bin/env node

/**
 * Manual Test Script for API Key Regeneration Bug Fix
 *
 * This script manually tests the fix for the bug where old API Keys
 * remained valid after regeneration.
 *
 * Usage:
 *   node scripts/test-apikey-regeneration.js
 */

const Redis = require('ioredis')
const config = require('../config/config')
const apiKeyService = require('../src/services/apiKeyService')
const redisClient = require('../src/models/redis')

// Initialize Redis client for direct queries
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db || 0
})

// Test data
const testCreatedBy = 'admin'
const testCreatedByType = 'admin'

async function testApiKeyRegeneration() {
  console.log('🧪 Testing API Key Regeneration Bug Fix')
  console.log('='.repeat(60))
  console.log('')

  // Wait for Redis connection
  console.log('🔌 Connecting to Redis...')
  await redisClient.connect()
  console.log('✅ Redis connected')
  console.log('')

  let keyId = null
  let oldApiKey = null
  let oldHashedKey = null
  let newApiKey = null
  let newHashedKey = null

  try {
    // Step 1: Create a test API Key
    console.log('📝 Step 1: Creating test API Key...')
    const createResult = await apiKeyService.createApiKey({
      name: 'Test Key for Regeneration',
      createdBy: testCreatedBy,
      createdByType: testCreatedByType,
      tokenLimit: 1000
    })

    keyId = createResult.id
    oldApiKey = createResult.apiKey
    oldHashedKey = apiKeyService._hashApiKey(oldApiKey)

    console.log(`✅ Created API Key: ${keyId}`)
    console.log(`   Old Key: ${oldApiKey.substring(0, 20)}...`)
    console.log(`   Old Hash: ${oldHashedKey.substring(0, 32)}...`)
    console.log('')

    // Step 2: Verify old key works
    console.log('🔍 Step 2: Verifying old key works...')
    const oldKeyValidation = await apiKeyService.validateApiKey(oldApiKey)
    if (!oldKeyValidation || !oldKeyValidation.valid) {
      throw new Error('Old key validation failed - key should be valid')
    }
    console.log('✅ Old key is valid (as expected)')
    console.log('')

    // Step 3: Check old hash mapping exists
    console.log('🔍 Step 3: Checking old hash mapping in Redis...')
    const oldMapping = await redis.hget('apikey:hash_map', oldHashedKey)
    if (oldMapping !== keyId) {
      throw new Error(`Old hash mapping incorrect: expected ${keyId}, got ${oldMapping}`)
    }
    console.log(`✅ Old hash mapping exists: ${oldHashedKey.substring(0, 32)}... → ${keyId}`)
    console.log('')

    // Step 4: Regenerate the API Key
    console.log('🔄 Step 4: Regenerating API Key...')
    const regenResult = await apiKeyService.regenerateApiKey(keyId)
    newApiKey = regenResult.key // Note: regenerateApiKey returns 'key' not 'apiKey'
    newHashedKey = apiKeyService._hashApiKey(newApiKey)

    console.log(`✅ Regenerated API Key`)
    console.log(`   New Key: ${newApiKey.substring(0, 20)}...`)
    console.log(`   New Hash: ${newHashedKey.substring(0, 32)}...`)
    console.log('')

    // Step 5: Verify old hash mapping is removed (THE BUG FIX)
    console.log('🔍 Step 5: Verifying old hash mapping is removed...')
    const oldMappingAfter = await redis.hget('apikey:hash_map', oldHashedKey)
    if (oldMappingAfter !== null) {
      console.log('❌ FAILED: Old hash mapping still exists!')
      console.log(`   Old hash: ${oldHashedKey.substring(0, 32)}... → ${oldMappingAfter}`)
      throw new Error('Bug still exists: old hash mapping was not removed')
    }
    console.log('✅ Old hash mapping removed (bug fixed!)')
    console.log('')

    // Step 6: Verify new hash mapping exists
    console.log('🔍 Step 6: Verifying new hash mapping exists...')
    const newMapping = await redis.hget('apikey:hash_map', newHashedKey)
    if (newMapping !== keyId) {
      throw new Error(`New hash mapping incorrect: expected ${keyId}, got ${newMapping}`)
    }
    console.log(`✅ New hash mapping exists: ${newHashedKey.substring(0, 32)}... → ${keyId}`)
    console.log('')

    // Step 7: Verify old key no longer works (THE BUG FIX)
    console.log('🔍 Step 7: Verifying old key no longer works...')
    const oldKeyValidationAfter = await apiKeyService.validateApiKey(oldApiKey)
    if (oldKeyValidationAfter && oldKeyValidationAfter.valid) {
      console.log('❌ FAILED: Old key still works!')
      console.log(`   Old key: ${oldApiKey.substring(0, 20)}...`)
      throw new Error('Bug still exists: old key still validates')
    }
    console.log('✅ Old key no longer works (bug fixed!)')
    console.log('')

    // Step 8: Verify new key works
    console.log('🔍 Step 8: Verifying new key works...')
    const newKeyValidation = await apiKeyService.validateApiKey(newApiKey)
    if (!newKeyValidation || !newKeyValidation.valid) {
      throw new Error('New key validation failed - key should be valid')
    }
    if (newKeyValidation.keyData.id !== keyId) {
      throw new Error(`New key ID mismatch: expected ${keyId}, got ${newKeyValidation.keyData.id}`)
    }
    console.log('✅ New key works correctly')
    console.log('')

    // Step 9: Verify only one hash mapping exists for this key
    console.log('🔍 Step 9: Verifying only one hash mapping exists...')
    const allMappings = await redis.hgetall('apikey:hash_map')
    const mappingsForThisKey = Object.entries(allMappings).filter(([_hash, id]) => id === keyId)
    if (mappingsForThisKey.length !== 1) {
      console.log('❌ FAILED: Multiple hash mappings found!')
      mappingsForThisKey.forEach(([hash, id]) => {
        console.log(`   ${hash.substring(0, 32)}... → ${id}`)
      })
      throw new Error(`Expected 1 mapping, found ${mappingsForThisKey.length}`)
    }
    console.log(`✅ Only one hash mapping exists for key ${keyId}`)
    console.log('')

    // Success!
    console.log('='.repeat(60))
    console.log('✅ ALL TESTS PASSED!')
    console.log('='.repeat(60))
    console.log('')
    console.log('The bug has been successfully fixed:')
    console.log('  ✓ Old hash mapping is removed after regeneration')
    console.log('  ✓ Old API Key no longer works')
    console.log('  ✓ New API Key works correctly')
    console.log('  ✓ No orphaned hash mappings remain')
    console.log('')
  } catch (error) {
    console.error('')
    console.error('='.repeat(60))
    console.error('❌ TEST FAILED')
    console.error('='.repeat(60))
    console.error('')
    console.error('Error:', error.message)
    console.error('')
    if (error.stack) {
      console.error('Stack trace:')
      console.error(error.stack)
    }
    process.exit(1)
  } finally {
    // Cleanup
    if (keyId) {
      try {
        console.log('🧹 Cleaning up test data...')
        await apiKeyService.deleteApiKey(keyId, testCreatedBy, testCreatedByType)
        console.log('✅ Test data cleaned up')
      } catch (error) {
        console.error('⚠️  Failed to cleanup test data:', error.message)
      }
    }

    // Close Redis connection
    await redis.quit()
  }
}

// Run the test
testApiKeyRegeneration()
  .then(() => {
    console.log('')
    console.log('✅ Test script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('')
    console.error('❌ Test script failed:', error)
    process.exit(1)
  })
