/**
 * Model Validator Utility
 * Validates Claude model names for the Console Model Alert feature
 */

/**
 * Valid Claude model tier keywords
 * @type {string[]}
 */
const CLAUDE_MODEL_KEYWORDS = ['haiku', 'sonnet', 'opus']

/**
 * Validates if the given model name is a valid Claude model
 * Checks for presence of tier keywords (haiku, sonnet, opus) case-insensitively
 *
 * @param {string} modelName - The model name to validate
 * @returns {boolean} True if the model is a valid Claude model, false otherwise
 */
function isValidClaudeModel(modelName) {
  // Handle missing or empty model field as invalid
  if (!modelName || typeof modelName !== 'string') {
    return false
  }

  const lowerModel = modelName.toLowerCase()
  return CLAUDE_MODEL_KEYWORDS.some((keyword) => lowerModel.includes(keyword))
}

module.exports = {
  isValidClaudeModel,
  CLAUDE_MODEL_KEYWORDS
}
