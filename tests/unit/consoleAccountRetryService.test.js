/**
 * Console Account Retry Service Unit Tests
 *
 * Tests for non-streaming request usage callback functionality
 * Regression test for bug introduced in commit 90516a85
 */

const consoleAccountRetryService = require('../../src/services/consoleAccountRetryService')

// Mock dependencies
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}))

jest.mock('../../src/services/unifiedClaudeScheduler', () => ({
  _getAllAvailableAccounts: jest.fn(),
  _sortAccountsByPriority: jest.fn((accounts) => accounts),
  _updateSessionActivity: jest.fn().mockResolvedValue(undefined),
  _setSessionMapping: jest.fn().mockResolvedValue(undefined),
  _addToStableAccountSessions: jest.fn().mockResolvedValue(undefined),
  _removeFromStableAccountSessions: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('../../src/services/claudeConsoleRelayService', () => ({
  relayConsoleMessages: jest.fn(),
  relayStreamRequestWithUsageCapture: jest.fn()
}))

jest.mock('../../src/services/requestFailureAlertService', () => ({
  sendAlert: jest.fn().mockResolvedValue(undefined)
}))

const logger = require('../../src/utils/logger')
const unifiedClaudeScheduler = require('../../src/services/unifiedClaudeScheduler')
const claudeConsoleRelayService = require('../../src/services/claudeConsoleRelayService')

describe('ConsoleAccountRetryService', () => {
  let mockReq
  let mockRes
  let mockApiKeyData

  beforeEach(() => {
    jest.clearAllMocks()

    mockReq = {
      body: { model: 'claude-3-opus-20240229', messages: [] },
      apiKey: { id: 'test-key-id', name: 'Test Key' }
    }

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false
    }

    mockApiKeyData = {
      id: 'test-key-id',
      name: 'Test Key',
      permissions: ['all']
    }
  })

  describe('Non-streaming request usage callback', () => {
    const mockAccount = {
      accountId: 'account-123',
      accountType: 'claude-console',
      name: 'Test Account',
      priority: 1
    }

    const mockUsageData = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    }

    beforeEach(() => {
      unifiedClaudeScheduler._getAllAvailableAccounts.mockResolvedValue([mockAccount])
    })

    test('should call usageCallback when non-streaming request succeeds with usage data', async () => {
      const usageCallback = jest.fn()

      claudeConsoleRelayService.relayConsoleMessages.mockResolvedValue({
        status: 200,
        data: {
          content: [{ type: 'text', text: 'Hello' }],
          usage: mockUsageData
        }
      })

      const result = await consoleAccountRetryService.handleConsoleRequestWithRetry(
        mockReq,
        mockRes,
        mockApiKeyData,
        false, // isStream
        { usageCallback }
      )

      expect(result).toBe(true)
      expect(usageCallback).toHaveBeenCalledTimes(1)
      expect(usageCallback).toHaveBeenCalledWith({
        ...mockUsageData,
        accountId: mockAccount.accountId
      })
      expect(mockRes.status).toHaveBeenCalledWith(200)
    })

    test('should not call usageCallback when response has no usage data', async () => {
      const usageCallback = jest.fn()

      claudeConsoleRelayService.relayConsoleMessages.mockResolvedValue({
        status: 200,
        data: {
          content: [{ type: 'text', text: 'Hello' }]
          // No usage field
        }
      })

      const result = await consoleAccountRetryService.handleConsoleRequestWithRetry(
        mockReq,
        mockRes,
        mockApiKeyData,
        false,
        { usageCallback }
      )

      expect(result).toBe(true)
      expect(usageCallback).not.toHaveBeenCalled()
    })

    test('should not retry when usageCallback throws error (regression test)', async () => {
      const usageCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error')
      })

      claudeConsoleRelayService.relayConsoleMessages.mockResolvedValue({
        status: 200,
        data: {
          content: [{ type: 'text', text: 'Hello' }],
          usage: mockUsageData
        }
      })

      const result = await consoleAccountRetryService.handleConsoleRequestWithRetry(
        mockReq,
        mockRes,
        mockApiKeyData,
        false,
        { usageCallback }
      )

      // Should still return success despite callback error
      expect(result).toBe(true)
      expect(mockRes.status).toHaveBeenCalledWith(200)
      // Should only call relay once (no retry)
      expect(claudeConsoleRelayService.relayConsoleMessages).toHaveBeenCalledTimes(1)
      // Should log the error
      expect(logger.error).toHaveBeenCalledWith(
        '❌ Failed to execute usage callback:',
        expect.any(Error)
      )
    })

    test('should work without usageCallback option', async () => {
      claudeConsoleRelayService.relayConsoleMessages.mockResolvedValue({
        status: 200,
        data: {
          content: [{ type: 'text', text: 'Hello' }],
          usage: mockUsageData
        }
      })

      const result = await consoleAccountRetryService.handleConsoleRequestWithRetry(
        mockReq,
        mockRes,
        mockApiKeyData,
        false
        // No options
      )

      expect(result).toBe(true)
      expect(mockRes.status).toHaveBeenCalledWith(200)
    })
  })

  describe('_updateStickySession stable account reverse index', () => {
    const stableAccount = {
      accountId: 'stable-new',
      accountType: 'claude-console',
      name: 'Stable New',
      isStableAccount: true
    }

    const sharedAccount = {
      accountId: 'shared-new',
      accountType: 'claude-console',
      name: 'Shared New',
      isStableAccount: false
    }

    const oldStickyId = 'stable-old'

    test('should remove old index when remapping stable → shared account', async () => {
      await consoleAccountRetryService._updateStickySession(
        'session-hash-abc',
        sharedAccount,
        oldStickyId
      )

      // Old account's reverse index entry must be removed
      expect(unifiedClaudeScheduler._removeFromStableAccountSessions).toHaveBeenCalledWith(
        oldStickyId,
        'session-hash-abc'
      )
      // New mapping must be created
      expect(unifiedClaudeScheduler._setSessionMapping).toHaveBeenCalledWith(
        'session-hash-abc',
        sharedAccount.accountId,
        'claude-console'
      )
      // Shared account is not stable — must NOT add to reverse index
      expect(unifiedClaudeScheduler._addToStableAccountSessions).not.toHaveBeenCalled()
    })

    test('should remove old index and add new index when remapping stable → stable account', async () => {
      await consoleAccountRetryService._updateStickySession(
        'session-hash-def',
        stableAccount,
        oldStickyId
      )

      // Old account's reverse index entry must be removed
      expect(unifiedClaudeScheduler._removeFromStableAccountSessions).toHaveBeenCalledWith(
        oldStickyId,
        'session-hash-def'
      )
      // New mapping must be created
      expect(unifiedClaudeScheduler._setSessionMapping).toHaveBeenCalledWith(
        'session-hash-def',
        stableAccount.accountId,
        'claude-console'
      )
      // New account is stable — must add to reverse index
      expect(unifiedClaudeScheduler._addToStableAccountSessions).toHaveBeenCalledWith(
        stableAccount.accountId,
        'session-hash-def'
      )
    })
  })
})
