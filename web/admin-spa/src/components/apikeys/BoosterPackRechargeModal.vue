<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
    @click.self="close"
  >
    <div class="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
      <!-- Header -->
      <div
        class="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700"
      >
        <div class="flex items-center space-x-3">
          <div
            class="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500"
          >
            <svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M13 10V3L4 14h7v7l9-11h-7z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">充值加油包</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ apiKey?.name || '' }}</p>
          </div>
        </div>
        <button
          class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          @click="close"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              d="M6 18L18 6M6 6l12 12"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="p-6">
        <!-- Current Status -->
        <div class="mb-6 rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
          <div class="mb-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div class="text-gray-500 dark:text-gray-400">当前总额</div>
              <div class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                ${{ currentAmount.toFixed(2) }}
              </div>
            </div>
            <div>
              <div class="text-gray-500 dark:text-gray-400">剩余额度</div>
              <div class="mt-1 text-lg font-semibold text-green-600 dark:text-green-400">
                ${{ remaining.toFixed(2) }}
              </div>
            </div>
          </div>
          <div class="mt-2">
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="text-gray-600 dark:text-gray-400">已使用</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ usagePercentage }}%</span>
            </div>
            <div class="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
              <div
                class="h-full rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-500"
                :style="{ width: usagePercentage + '%' }"
              ></div>
            </div>
          </div>
        </div>

        <!-- Amount Input -->
        <div class="mb-6">
          <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            新的总金额 (美元)
          </label>
          <div class="relative">
            <div
              class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-gray-400"
            >
              $
            </div>
            <input
              v-model="newAmount"
              class="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-7 pr-3 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500 dark:focus:border-orange-400 dark:focus:ring-orange-400"
              min="0"
              placeholder="0.00"
              step="0.01"
              type="number"
              @keyup.enter="submit"
            />
          </div>
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            设置为新的加油包总金额，可以大于或小于当前金额
          </p>
        </div>

        <!-- Preview -->
        <div
          v-if="newAmount && parseFloat(newAmount) !== currentAmount"
          class="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20"
        >
          <div class="flex items-start">
            <svg
              class="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            <div class="ml-3">
              <h4 class="text-sm font-medium text-orange-800 dark:text-orange-300">变更预览</h4>
              <div class="mt-2 text-sm text-orange-700 dark:text-orange-400">
                <div>
                  总金额: ${{ currentAmount.toFixed(2) }} → ${{ parseFloat(newAmount).toFixed(2) }}
                </div>
                <div class="mt-1">
                  变化:
                  <span
                    :class="
                      amountDiff >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    "
                  >
                    {{ amountDiff >= 0 ? '+' : '' }}${{ amountDiff.toFixed(2) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Error Message -->
        <div
          v-if="error"
          class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
        >
          {{ error }}
        </div>
      </div>

      <!-- Footer -->
      <div
        class="flex items-center justify-end space-x-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-700/50"
      >
        <button
          class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          :disabled="loading"
          @click="close"
        >
          取消
        </button>
        <button
          class="rounded-lg bg-gradient-to-r from-yellow-400 to-orange-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="loading || !isValid"
          @click="submit"
        >
          <span v-if="loading" class="flex items-center">
            <svg
              class="mr-2 h-4 w-4 animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            处理中...
          </span>
          <span v-else>确认充值</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useApiKeysStore } from '@/stores/apiKeys'
import { showToast } from '@/utils/toast'

const props = defineProps({
  isOpen: Boolean,
  apiKey: {
    type: Object,
    default: () => null
  }
})

const emit = defineEmits(['close', 'success'])

const apiKeysStore = useApiKeysStore()
const newAmount = ref('')
const loading = ref(false)
const error = ref(null)

const currentAmount = computed(() => props.apiKey?.boosterPackAmount || 0)
const currentUsed = computed(() => props.apiKey?.boosterPackUsed || 0)

const remaining = computed(() => {
  return Math.max(0, currentAmount.value - currentUsed.value)
})

const usagePercentage = computed(() => {
  if (currentAmount.value === 0) return 0
  return Math.min(100, Math.round((currentUsed.value / currentAmount.value) * 100))
})

const amountDiff = computed(() => {
  if (!newAmount.value) return 0
  return parseFloat(newAmount.value) - currentAmount.value
})

const isValid = computed(() => {
  if (!newAmount.value) return false
  const amount = parseFloat(newAmount.value)
  return !isNaN(amount) && amount >= 0
})

const submit = async () => {
  if (!isValid.value || loading.value) return

  error.value = null
  loading.value = true

  try {
    await apiKeysStore.setBoosterPackAmount(props.apiKey.id, newAmount.value)
    showToast('success', '加油包充值成功')
    emit('success')
    close()
  } catch (err) {
    error.value = err.message || '充值失败'
    showToast('error', error.value)
  } finally {
    loading.value = false
  }
}

const close = () => {
  newAmount.value = ''
  error.value = null
  emit('close')
}

watch(
  () => props.isOpen,
  (newValue) => {
    if (newValue) {
      newAmount.value = currentAmount.value.toString()
    }
  }
)
</script>
