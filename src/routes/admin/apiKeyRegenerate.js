/**
 * API Key 重新生成路由
 * 用于更新 API Key 值，同时保留使用历史数据
 */

const express = require('express')
const apiKeyService = require('../../services/apiKeyService')
const { authenticateAdmin } = require('../../middleware/auth')
const logger = require('../../utils/logger')

const router = express.Router()

// 🔄 重新生成API Key（更新key值，保留历史数据）
router.post('/api-keys/:keyId/regenerate', authenticateAdmin, async (req, res) => {
  try {
    const { keyId } = req.params

    const result = await apiKeyService.regenerateApiKey(keyId)

    logger.success(`🔄 Admin regenerated API key: ${keyId} (${result.name})`)
    return res.json({
      success: true,
      message: 'API Key 已重新生成，请妥善保管新密钥',
      data: {
        id: result.id,
        name: result.name,
        apiKey: result.key, // 新密钥（仅返回一次）
        updatedAt: result.updatedAt
      }
    })
  } catch (error) {
    logger.error('❌ Failed to regenerate API key:', error)

    if (error.message === 'API key not found') {
      return res.status(404).json({
        success: false,
        error: 'API Key 不存在'
      })
    }

    return res.status(500).json({
      success: false,
      error: '重新生成 API Key 失败',
      message: error.message
    })
  }
})

module.exports = router
