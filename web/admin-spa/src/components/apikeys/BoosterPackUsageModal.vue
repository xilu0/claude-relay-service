<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
    @click.self="close"
  >
    <div class="w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
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
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">加油包使用详情</h3>
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
      <div class="max-h-[calc(100vh-12rem)] overflow-y-auto p-6">
        <!-- Summary Cards -->
        <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div class="text-sm text-gray-500 dark:text-gray-400">总金额</div>
            <div class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              ${{ apiKey?.boosterPackAmount?.toFixed(2) || '0.00' }}
            </div>
          </div>
          <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div class="text-sm text-gray-500 dark:text-gray-400">已使用</div>
            <div class="mt-1 text-2xl font-bold text-orange-600 dark:text-orange-400">
              ${{ apiKey?.boosterPackUsed?.toFixed(2) || '0.00' }}
            </div>
          </div>
          <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-700/50">
            <div class="text-sm text-gray-500 dark:text-gray-400">剩余</div>
            <div class="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
              ${{ remaining.toFixed(2) }}
            </div>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="mb-6">
          <div class="mb-2 flex items-center justify-between text-sm">
            <span class="text-gray-700 dark:text-gray-300">使用进度</span>
            <span class="font-medium text-gray-900 dark:text-white">{{ usagePercentage }}%</span>
          </div>
          <div class="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              class="h-full rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-500"
              :style="{ width: usagePercentage + '%' }"
            ></div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="mb-6">
          <div class="border-b border-gray-200 dark:border-gray-700">
            <nav class="-mb-px flex space-x-8">
              <button
                :class="[
                  'whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors',
                  activeTab === 'history'
                    ? 'border-orange-500 text-orange-600 dark:border-orange-400 dark:text-orange-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'
                ]"
                @click="activeTab = 'history'"
              >
                使用历史
              </button>
              <button
                :class="[
                  'whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors',
                  activeTab === 'chart'
                    ? 'border-orange-500 text-orange-600 dark:border-orange-400 dark:text-orange-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'
                ]"
                @click="activeTab = 'chart'"
              >
                使用趋势
              </button>
            </nav>
          </div>
        </div>

        <!-- History Table -->
        <div v-show="activeTab === 'history'">
          <div v-if="loading" class="py-8 text-center">
            <div
              class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-orange-500"
            ></div>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">加载中...</p>
          </div>
          <div v-else-if="records.length === 0" class="py-8 text-center">
            <svg
              class="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">暂无使用记录</p>
          </div>
          <div v-else class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    时间
                  </th>
                  <th
                    class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    模型
                  </th>
                  <th
                    class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-700 dark:text-gray-300"
                  >
                    金额
                  </th>
                </tr>
              </thead>
              <tbody
                class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800"
              >
                <tr
                  v-for="record in records"
                  :key="record.timestamp"
                  class="hover:bg-gray-50 dark:hover:bg-gray-700/30"
                >
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    {{ formatTimestamp(record.timestamp) }}
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {{ record.model }}
                  </td>
                  <td
                    class="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-orange-600 dark:text-orange-400"
                  >
                    ${{ record.amount.toFixed(6) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Trend Chart -->
        <div v-show="activeTab === 'chart'">
          <div v-if="loading" class="py-8 text-center">
            <div
              class="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-orange-500"
            ></div>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">加载中...</p>
          </div>
          <div v-else-if="!stats || stats.recordCount === 0" class="py-8 text-center">
            <svg
              class="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
              />
            </svg>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">暂无统计数据</p>
          </div>
          <div v-else>
            <canvas ref="chartCanvas"></canvas>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div
        class="flex items-center justify-end space-x-3 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-700/50"
      >
        <button
          class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          @click="close"
        >
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useApiKeysStore } from '@/stores/apiKeys'
import Chart from 'chart.js/auto'

const props = defineProps({
  isOpen: Boolean,
  apiKey: Object
})

const emit = defineEmits(['close'])

const apiKeysStore = useApiKeysStore()
const activeTab = ref('history')
const loading = ref(false)
const records = ref([])
const stats = ref(null)
const chartCanvas = ref(null)
let chartInstance = null

const remaining = computed(() => {
  const amount = props.apiKey?.boosterPackAmount || 0
  const used = props.apiKey?.boosterPackUsed || 0
  return Math.max(0, amount - used)
})

const usagePercentage = computed(() => {
  const amount = props.apiKey?.boosterPackAmount || 0
  if (amount === 0) return 0
  const used = props.apiKey?.boosterPackUsed || 0
  return Math.min(100, Math.round((used / amount) * 100))
})

const formatTimestamp = (timestamp) => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const loadData = async () => {
  if (!props.apiKey?.id) return

  loading.value = true
  try {
    // 加载使用记录 - 默认查询最近30天
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recordsData = await apiKeysStore.fetchBoosterPackRecords(
      props.apiKey.id,
      thirtyDaysAgo,
      Date.now()
    )
    records.value = recordsData.sort((a, b) => b.timestamp - a.timestamp)

    // 加载统计数据
    const statsData = await apiKeysStore.fetchBoosterPackStats(props.apiKey.id, 'day')
    stats.value = statsData
  } catch (error) {
    console.error('Failed to load booster pack data:', error)
  } finally {
    loading.value = false
  }
}

const renderChart = () => {
  if (!chartCanvas.value || !stats.value || !stats.value.byPeriod) return

  try {
    // 销毁旧图表
    if (chartInstance) {
      chartInstance.destroy()
      chartInstance = null
    }

    const ctx = chartCanvas.value.getContext('2d')
    if (!ctx) {
      console.error('Failed to get canvas context')
      return
    }

    const periods = Object.keys(stats.value.byPeriod).sort()
    const amounts = periods.map((period) => stats.value.byPeriod[period])

    // Validate data
    if (periods.length === 0 || amounts.some((amount) => isNaN(amount))) {
      console.warn('Invalid chart data', { periods, amounts })
      return
    }

    // 判断暗黑模式
    const isDark = document.documentElement.classList.contains('dark')

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: periods,
        datasets: [
          {
            label: '每日使用金额',
            data: amounts,
            borderColor: 'rgb(251, 146, 60)',
            backgroundColor: 'rgba(251, 146, 60, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: isDark ? 'rgb(209, 213, 219)' : 'rgb(55, 65, 81)'
            }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                return '金额: $' + context.parsed.y.toFixed(6)
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: isDark ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)'
            },
            grid: {
              color: isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)'
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: isDark ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)',
              callback: function (value) {
                return '$' + value.toFixed(2)
              }
            },
            grid: {
              color: isDark ? 'rgba(75, 85, 99, 0.3)' : 'rgba(229, 231, 235, 0.8)'
            }
          }
        }
      }
    })
  } catch (error) {
    console.error('Failed to render chart:', error)
    // Optionally show error message to user
  }
}

const close = () => {
  emit('close')
}

watch(
  () => props.isOpen,
  async (newValue) => {
    if (newValue) {
      await loadData()
      if (activeTab.value === 'chart') {
        nextTick(() => renderChart())
      }
    }
  }
)

watch(activeTab, async (newValue) => {
  if (newValue === 'chart') {
    await nextTick()
    renderChart()
  }
})

// 监听暗黑模式变化，重新渲染图表
const observer = new MutationObserver(() => {
  if (activeTab.value === 'chart' && chartInstance) {
    renderChart()
  }
})

onMounted(() => {
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  })
})

// 清理资源，防止内存泄漏
onUnmounted(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  // 停止监听暗黑模式变化
  observer.disconnect()
})
</script>
