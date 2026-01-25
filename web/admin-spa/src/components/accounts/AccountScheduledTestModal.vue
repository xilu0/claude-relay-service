<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    @click.self="closeModal"
  >
    <div
      class="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
      @click.stop
    >
      <!-- Header -->
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
          Configure Scheduled Testing
        </h3>
        <button
          class="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          @click="closeModal"
        >
          <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M6 18L18 6M6 6l12 12"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </button>
      </div>

      <!-- Account Info -->
      <div class="mb-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
        <p class="text-sm font-medium text-blue-900 dark:text-blue-300">
          Account: <span class="font-bold">{{ accountName }}</span>
        </p>
        <p class="text-xs text-blue-700 dark:text-blue-400">Platform: {{ platform }}</p>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="py-8 text-center">
        <div
          class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"
        ></div>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading configuration...</p>
      </div>

      <!-- Form -->
      <div v-else class="space-y-4">
        <!-- Enable Toggle -->
        <div
          class="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-700"
        >
          <div>
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200">
              Enable Scheduled Testing
            </label>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Automatically test this account at scheduled times
            </p>
          </div>
          <button
            :class="[
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
              config.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
            ]"
            @click="toggleEnabled"
          >
            <span
              :class="[
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                config.enabled ? 'translate-x-6' : 'translate-x-1'
              ]"
            />
          </button>
        </div>

        <!-- Cron Expression -->
        <div v-if="config.enabled">
          <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
            Schedule (Cron Expression)
          </label>
          <input
            v-model="config.cronExpression"
            class="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
            placeholder="* * * * *"
            type="text"
            @input="validateCron"
          />
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Format: minute hour day month weekday (e.g., "0 8 * * *" = daily at 8 AM)
          </p>
          <p
            v-if="cronValidationMessage"
            :class="[
              'mt-1 text-xs',
              cronValidationMessage.valid
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            ]"
          >
            {{ cronValidationMessage.message || 'Valid cron expression' }}
          </p>

          <!-- Quick Presets -->
          <div class="mt-3">
            <p class="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Quick Presets:</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="preset in cronPresets"
                :key="preset.value"
                class="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                @click="applyPreset(preset.value)"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>
        </div>

        <!-- Model Selection -->
        <div v-if="config.enabled">
          <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
            Test Model
          </label>
          <select
            v-model="config.model"
            class="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option v-for="model in availableModels" :key="model" :value="model">
              {{ model }}
            </option>
          </select>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Model to use for testing the account
          </p>
        </div>

        <!-- Test History -->
        <div v-if="config.enabled">
          <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">
            Recent Test History
          </label>

          <!-- History Records -->
          <div
            v-if="testHistory.length > 0"
            class="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50"
          >
            <div
              v-for="(record, index) in testHistory"
              :key="index"
              class="flex items-center justify-between text-xs"
            >
              <div class="flex items-center gap-2">
                <!-- Success Icon -->
                <svg
                  v-if="record.success"
                  class="h-4 w-4 text-green-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    clip-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    fill-rule="evenodd"
                  />
                </svg>
                <!-- Failure Icon -->
                <svg v-else class="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    clip-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    fill-rule="evenodd"
                  />
                </svg>

                <!-- Timestamp -->
                <span class="text-gray-600 dark:text-gray-400">
                  {{ formatTimestamp(record.timestamp) }}
                </span>
              </div>

              <!-- Latency or Error -->
              <span
                v-if="record.success && record.duration"
                class="text-gray-500 dark:text-gray-500"
              >
                {{ Math.round(record.duration) }}ms
              </span>
              <span
                v-else-if="record.error"
                class="max-w-[200px] truncate text-red-500"
                :title="record.error"
              >
                {{ record.error }}
              </span>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-else
            class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-800/50"
          >
            <svg
              class="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            <p class="text-sm text-gray-500 dark:text-gray-400">No test records yet</p>
          </div>
        </div>

        <!-- Error Message -->
        <div v-if="errorMessage" class="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
          <p class="text-sm text-red-600 dark:text-red-400">{{ errorMessage }}</p>
        </div>

        <!-- Action Buttons -->
        <div class="flex justify-end gap-3 pt-4">
          <button
            class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            :disabled="saving"
            @click="closeModal"
          >
            Cancel
          </button>
          <button
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            :disabled="isSaveDisabled"
            @click="saveConfig"
          >
            <span v-if="saving" class="flex items-center gap-2">
              <div
                class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
              ></div>
              Saving...
            </span>
            <span v-else>Save Configuration</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { apiClient } from '@/config/api'

export default {
  name: 'AccountScheduledTestModal',
  props: {
    accountId: {
      type: String,
      required: true
    },
    accountName: {
      type: String,
      required: true
    },
    platform: {
      type: String,
      required: true,
      validator: (value) => ['claude', 'claude-console', 'gemini'].includes(value)
    },
    isOpen: {
      type: Boolean,
      default: false
    }
  },
  emits: ['close', 'saved'],
  data() {
    return {
      loading: false,
      saving: false,
      errorMessage: '',
      cronValidationMessage: null,
      testHistory: [],
      config: {
        enabled: false,
        cronExpression: '* * * * *',
        model: 'claude-haiku-4-5-20251001'
      },
      cronPresets: [
        { label: 'Every Hour', value: '0 * * * *' },
        { label: 'Every 6 Hours', value: '0 */6 * * *' },
        { label: 'Daily 8 AM', value: '0 8 * * *' },
        { label: 'Daily 12 PM', value: '0 12 * * *' },
        { label: 'Weekly Sunday', value: '0 0 * * 0' }
      ]
    }
  },
  computed: {
    availableModels() {
      // Platform-specific models
      const models = {
        claude: [
          'claude-haiku-4-5-20251001',
          'claude-sonnet-4-5-20250929',
          'claude-opus-4-5-20251101'
        ],
        'claude-console': [
          'claude-haiku-4-5-20251001',
          'claude-sonnet-4-5-20250929',
          'claude-opus-4-5-20251101'
        ],
        gemini: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash']
      }
      return models[this.platform] || models.claude
    },
    apiEndpoint() {
      const platformMap = {
        claude: 'claude-accounts',
        'claude-console': 'claude-console-accounts',
        gemini: 'gemini-accounts'
      }
      return `/admin/${platformMap[this.platform] || 'claude-accounts'}/${this.accountId}/test-config`
    },
    isSaveDisabled() {
      // 正在保存时禁用
      if (this.saving) {
        return true
      }

      // 如果测试已启用
      if (this.config.enabled) {
        // 如果还未验证（cronValidationMessage 为 null）
        if (this.cronValidationMessage === null) {
          // 只要有 cron 表达式，就允许保存（保存时会触发验证）
          return !this.config.cronExpression
        }

        // 如果已经验证，只有验证失败时才禁用按钮
        return !this.cronValidationMessage.valid
      }

      // 如果测试未启用，允许保存
      return false
    }
  },
  watch: {
    async isOpen(newVal) {
      if (newVal) {
        this.initializeDefaultModel()
        await this.loadConfig()
      }
    }
  },
  mounted() {
    // 组件首次创建时，如果 isOpen 已经是 true，watch 不会触发
    // 所以需要在 mounted 中也调用 loadConfig
    if (this.isOpen) {
      this.initializeDefaultModel()
      this.loadConfig()
    }
  },
  methods: {
    initializeDefaultModel() {
      // Set appropriate default model based on platform
      if (this.platform === 'gemini') {
        this.config.model = 'gemini-2.0-flash-exp'
      } else if (this.platform === 'claude-console') {
        this.config.model = 'claude-haiku-4-5-20251001'
      } else {
        this.config.model = 'claude-haiku-4-5-20251001'
      }
    },

    async loadConfig() {
      /* eslint-disable no-console */
      console.log('🔍 loadConfig called', {
        accountId: this.accountId,
        platform: this.platform,
        apiEndpoint: this.apiEndpoint
      })
      /* eslint-enable no-console */

      this.loading = true
      this.errorMessage = ''
      this.cronValidationMessage = null // 重置验证状态

      try {
        /* eslint-disable no-console */
        console.log('📡 Fetching config from:', this.apiEndpoint)
        const response = await apiClient.get(this.apiEndpoint)
        console.log('✅ Got response:', response)
        /* eslint-enable no-console */

        if (response.success) {
          this.config = { ...this.config, ...response.data }
          /* eslint-disable-next-line no-console */
          console.log('✅ Config loaded:', this.config)

          // 加载成功后立即验证 cron 表达式
          if (this.config.cronExpression) {
            await this.validateCron()
          }

          // Load test history
          await this.loadTestHistory()
        } else {
          /* eslint-disable-next-line no-console */
          console.warn('⚠️ Response success is false:', response)
        }
      } catch (error) {
        /* eslint-disable-next-line no-console */
        console.error('❌ Failed to load config:', error)
        this.errorMessage = 'Failed to load configuration. Using defaults.'
        // 即使加载失败，也验证默认的 cron 表达式
        if (this.config.cronExpression) {
          await this.validateCron()
        }
      } finally {
        this.loading = false
      }
    },

    async loadTestHistory() {
      try {
        const historyEndpoint = this.apiEndpoint.replace('/test-config', '/test-history')
        const historyResponse = await apiClient.get(historyEndpoint)

        if (historyResponse.success && historyResponse.data) {
          this.testHistory = Array.isArray(historyResponse.data) ? historyResponse.data : []
        } else {
          this.testHistory = []
        }
      } catch (error) {
        /* eslint-disable-next-line no-console */
        console.warn('Failed to load test history:', error)
        this.testHistory = [] // Fail silently, don't block UI
      }
    },

    async validateCron() {
      if (!this.config.cronExpression) {
        this.cronValidationMessage = { valid: false, message: 'Cron expression is required' }
        return
      }

      try {
        const platformPath =
          this.platform === 'claude'
            ? 'claude-accounts'
            : this.platform === 'claude-console'
              ? 'claude-console-accounts'
              : 'gemini-accounts'

        const response = await apiClient.post(
          `/admin/${platformPath}/${this.accountId}/test-schedule-validate`,
          {
            cronExpression: this.config.cronExpression
          }
        )

        // 检查后端响应格式
        if (response.data && typeof response.data.valid === 'boolean') {
          this.cronValidationMessage = response.data
        } else {
          // 后端返回格式异常，使用客户端验证
          throw new Error('Invalid response format from server')
        }
      } catch (error) {
        // 回退到客户端验证
        const cronRegex =
          /^(\*|([0-5]?\d))\s+(\*|([01]?\d|2[0-3]))\s+(\*|([12]?\d|3[01]))\s+(\*|([1-9]|1[0-2]))\s+(\*|[0-6])$/

        if (cronRegex.test(this.config.cronExpression.trim())) {
          this.cronValidationMessage = {
            valid: true,
            message: 'Valid cron expression (client-side validation)'
          }
        } else {
          this.cronValidationMessage = {
            valid: false,
            message: error.response?.data?.message || 'Invalid cron expression format'
          }
        }
      }
    },

    applyPreset(cronValue) {
      this.config.cronExpression = cronValue
      this.validateCron()
    },

    async toggleEnabled() {
      const willBeEnabled = !this.config.enabled

      // 如果要启用，先验证 cron 表达式
      if (willBeEnabled && this.config.cronExpression) {
        await this.validateCron()
        await this.$nextTick()

        // 如果验证失败，不允许启用
        if (!this.cronValidationMessage?.valid) {
          this.errorMessage = 'Please fix the cron expression before enabling'
          return // 不切换状态
        }
      }

      // 验证通过或禁用操作，切换状态
      this.config.enabled = willBeEnabled

      // 清除错误信息
      if (this.config.enabled) {
        this.errorMessage = ''
      }
    },

    async saveConfig() {
      // 如果启用了测试，二次验证 cron 表达式
      if (this.config.enabled) {
        if (!this.config.cronExpression) {
          this.errorMessage = 'Cron expression is required when testing is enabled'
          return
        }

        // 如果还未验证或验证失败，先验证
        if (!this.cronValidationMessage || !this.cronValidationMessage.valid) {
          await this.validateCron()

          // 验证后仍然失败，不允许保存
          if (!this.cronValidationMessage?.valid) {
            this.errorMessage = 'Please fix the cron expression before saving'
            return
          }
        }
      }

      this.saving = true
      this.errorMessage = ''

      try {
        const response = await apiClient.put(this.apiEndpoint, this.config)
        if (response.success) {
          this.$emit('saved')
          this.closeModal()
        }
      } catch (error) {
        /* eslint-disable-next-line no-console */
        console.error('Failed to save test config:', error)
        this.errorMessage =
          error.response?.data?.message || error.message || 'Failed to save configuration'
      } finally {
        this.saving = false
      }
    },

    closeModal() {
      this.$emit('close')
      this.errorMessage = ''
      this.cronValidationMessage = null
      this.testHistory = []
    },

    formatTimestamp(timestamp) {
      if (!timestamp) return 'Unknown'
      const date = new Date(timestamp)
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
    }
  }
}
</script>

<style scoped>
/* Additional styles if needed */
</style>
