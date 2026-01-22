#!/usr/bin/env node

/**
 * Cleanup Orphaned API Key Hash Mappings
 *
 * This script cleans up orphaned entries in the apikey:hash_map Redis hash.
 * Orphaned entries occur when:
 * 1. An API Key was regenerated but the old hash mapping wasn't deleted (due to the bug)
 * 2. An API Key was deleted but the hash mapping remains
 * 3. The hash mapping points to a non-existent API Key
 *
 * Usage:
 *   node scripts/cleanup-orphaned-apikey-hashes.js --host <host> --port <port> [options]
 *
 * Required Options:
 *   --host <host>        Redis host (e.g., localhost or redis.example.com)
 *   --port <port>        Redis port (e.g., 6379)
 *
 * Optional Options:
 *   --password <pass>    Redis password (if authentication is required)
 *   --db <number>        Redis database number (default: 0)
 *   --dry-run            Show what would be deleted without actually deleting
 *
 * Examples:
 *   # Dry run on local Redis
 *   node scripts/cleanup-orphaned-apikey-hashes.js --host localhost --port 6379 --dry-run
 *
 *   # Execute cleanup on production Redis with password
 *   node scripts/cleanup-orphaned-apikey-hashes.js --host redis.prod.com --port 6379 --password mypass
 *
 *   # Cleanup on specific database
 *   node scripts/cleanup-orphaned-apikey-hashes.js --host localhost --port 6379 --db 1
 */

const Redis = require('ioredis')

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    host: null,
    port: null,
    password: null,
    db: 0,
    isDryRun: false
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--host':
        options.host = args[++i]
        break
      case '--port':
        options.port = parseInt(args[++i], 10)
        break
      case '--password':
        options.password = args[++i]
        break
      case '--db':
        options.db = parseInt(args[++i], 10)
        break
      case '--dry-run':
        options.isDryRun = true
        break
      case '--help':
      case '-h':
        console.log(`
Cleanup Orphaned API Key Hash Mappings

Usage:
  node scripts/cleanup-orphaned-apikey-hashes.js --host <host> --port <port> [options]

Required Options:
  --host <host>        Redis host (e.g., localhost or redis.example.com)
  --port <port>        Redis port (e.g., 6379)

Optional Options:
  --password <pass>    Redis password (if authentication is required)
  --db <number>        Redis database number (default: 0)
  --dry-run            Show what would be deleted without actually deleting
  --help, -h           Show this help message

Examples:
  # Dry run on local Redis
  node scripts/cleanup-orphaned-apikey-hashes.js --host localhost --port 6379 --dry-run

  # Execute cleanup on production Redis with password
  node scripts/cleanup-orphaned-apikey-hashes.js --host redis.prod.com --port 6379 --password mypass

  # Cleanup on specific database
  node scripts/cleanup-orphaned-apikey-hashes.js --host localhost --port 6379 --db 1
`)
        process.exit(0)
        break
      default:
        console.error(`Unknown option: ${arg}`)
        console.error('Use --help to see available options')
        process.exit(1)
    }
  }

  // Validate required options
  if (!options.host || !options.port) {
    console.error('❌ Error: --host and --port are required')
    console.error('Use --help to see usage information')
    process.exit(1)
  }

  return options
}

const options = parseArgs()

// Initialize Redis client
const redis = new Redis({
  host: options.host,
  port: options.port,
  password: options.password,
  db: options.db,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000)
    return delay
  }
})

const { isDryRun } = options

async function cleanupOrphanedHashes() {
  console.log('🔍 Starting cleanup of orphaned API Key hash mappings...')
  console.log(`Redis: ${options.host}:${options.port} (DB: ${options.db})`)
  console.log(
    `Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (will delete orphaned entries)'}`
  )
  console.log('')

  try {
    // Get all entries from apikey:hash_map
    const hashMap = await redis.hgetall('apikey:hash_map')
    const totalEntries = Object.keys(hashMap).length

    console.log(`📊 Found ${totalEntries} entries in apikey:hash_map`)
    console.log('')

    if (totalEntries === 0) {
      console.log('✅ No entries to check. Exiting.')
      return
    }

    let validCount = 0
    let orphanedCount = 0
    let mismatchCount = 0
    const orphanedHashes = []

    // Check each hash mapping
    for (const [hashedKey, keyId] of Object.entries(hashMap)) {
      // Check if the API Key exists
      const keyData = await redis.hgetall(`apikey:${keyId}`)

      if (!keyData || Object.keys(keyData).length === 0) {
        // API Key doesn't exist - orphaned mapping
        console.log(`❌ Orphaned: hash mapping points to non-existent key ${keyId}`)
        orphanedHashes.push({ hashedKey, keyId, reason: 'key_not_found' })
        orphanedCount++
        continue
      }

      // Check if the stored hash matches the mapping
      if (keyData.apiKey !== hashedKey) {
        // Hash mismatch - the key was regenerated but old mapping remains
        console.log(
          `⚠️  Mismatch: hash ${hashedKey.substring(0, 16)}... points to key ${keyId}, but key has different hash ${keyData.apiKey.substring(0, 16)}...`
        )
        orphanedHashes.push({
          hashedKey,
          keyId,
          reason: 'hash_mismatch',
          currentHash: keyData.apiKey
        })
        mismatchCount++
        continue
      }

      // Valid mapping
      validCount++
    }

    console.log('')
    console.log('📈 Summary:')
    console.log(`  ✅ Valid mappings: ${validCount}`)
    console.log(`  ❌ Orphaned (key not found): ${orphanedCount}`)
    console.log(`  ⚠️  Mismatched (old hash): ${mismatchCount}`)
    console.log(`  🗑️  Total to remove: ${orphanedHashes.length}`)
    console.log('')

    if (orphanedHashes.length === 0) {
      console.log('✅ No orphaned entries found. Database is clean!')
      return
    }

    if (isDryRun) {
      console.log('🔍 DRY RUN: The following entries would be deleted:')
      orphanedHashes.forEach(({ hashedKey, keyId, reason, currentHash }) => {
        console.log(`  - Hash: ${hashedKey.substring(0, 32)}... → Key: ${keyId} (${reason})`)
        if (currentHash) {
          console.log(`    Current hash: ${currentHash.substring(0, 32)}...`)
        }
      })
      console.log('')
      console.log('💡 Run without --dry-run to actually delete these entries')
    } else {
      console.log('🗑️  Deleting orphaned entries...')

      // Delete orphaned hash mappings
      const hashesToDelete = orphanedHashes.map(({ hashedKey }) => hashedKey)

      if (hashesToDelete.length > 0) {
        const deleted = await redis.hdel('apikey:hash_map', ...hashesToDelete)
        console.log(`✅ Deleted ${deleted} orphaned hash mappings`)
      }

      console.log('')
      console.log('✅ Cleanup completed successfully!')
    }

    // Log details to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const logFile = `logs/apikey-cleanup-${timestamp}.json`
    const fs = require('fs')
    const path = require('path')

    // Ensure logs directory exists
    const logsDir = path.dirname(logFile)
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true })
    }

    fs.writeFileSync(
      logFile,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          mode: isDryRun ? 'dry-run' : 'live',
          summary: {
            total: totalEntries,
            valid: validCount,
            orphaned: orphanedCount,
            mismatched: mismatchCount,
            removed: isDryRun ? 0 : orphanedHashes.length
          },
          orphanedEntries: orphanedHashes
        },
        null,
        2
      )
    )
    console.log(`📝 Detailed log saved to: ${logFile}`)
  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    throw error
  } finally {
    await redis.quit()
  }
}

// Run the cleanup
cleanupOrphanedHashes()
  .then(() => {
    console.log('')
    console.log('✅ Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('')
    console.error('❌ Script failed:', error)
    process.exit(1)
  })
