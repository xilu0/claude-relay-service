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
  _sortAccountsByPriority: jest.fn((accounts) => accounts)
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
})
