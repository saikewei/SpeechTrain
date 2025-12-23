<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { CourseSummary, SettingsData } from '../../../shared/types'

const router = useRouter()

// 状态：课程列表 (初始为空)
const courses = ref<CourseSummary[]>([])
const currentLang = ref(localStorage.getItem('lastSelectedLang') || '英语')
const isLoading = ref(true)

// 设置对话框相关状态
const showSettings = ref(false)
const settingsForm = ref<SettingsData>({
  AZURE_TTS_KEY: '',
  AZURE_TTS_REGION: 'eastasia',
  DASHSCOPE_API_KEY: ''
})
const isSavingSettings = ref(false)

// Toast 通知状态
const toast = ref({
  show: false,
  message: '',
  type: 'success' as 'success' | 'error'
})

// 显示 Toast 通知
const showToast = (message: string, type: 'success' | 'error' = 'success'): void => {
  toast.value = { show: true, message, type }
  setTimeout(() => {
    toast.value.show = false
  }, 3000)
}

// 新增：监听语种变化并保存
watch(currentLang, (newLang) => {
  localStorage.setItem('lastSelectedLang', newLang)
})

// 计算属性：从已加载的课程中动态提取语种列表
const languages = computed(() => {
  const langs = new Set(courses.value.map((c) => c.lang))
  // 如果还没加载到数据，显示默认列表，避免界面塌陷
  if (langs.size === 0) return ['英语']
  return Array.from(langs)
})

// 生命周期：组件挂载时调用后端接口
onMounted(async () => {
  try {
    isLoading.value = true
    // 调用 preload 中暴露的 API
    const data = await window.api.getCourseList()
    courses.value = data

    // 智能切换语种：如果当前选中的语种不在列表中，自动切换到第一个可用的语种
    if (data.length > 0) {
      const availableLangs = new Set(data.map((c) => c.lang))
      if (!availableLangs.has(currentLang.value)) {
        currentLang.value = data[0].lang
      }
    }
  } catch (error) {
    console.error('Failed to load courses:', error)
  } finally {
    isLoading.value = false
  }
})

// 根据选择的语种过滤课程
const filteredCourses = computed(() => {
  return courses.value.filter((c) => c.lang === currentLang.value)
})

const startPractice = (courseId: string | number): void => {
  router.push(`/practice/${courseId}`)
}

// 打开设置对话框
const openSettings = async (): Promise<void> => {
  try {
    const settings = await window.api.getSettings()
    settingsForm.value = { ...settings }
    showSettings.value = true
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
}

// 保存设置
const saveSettings = async (): Promise<void> => {
  try {
    isSavingSettings.value = true
    const plainSettings = JSON.parse(JSON.stringify(settingsForm.value)) as SettingsData
    await window.api.updateSettings(plainSettings)
    showSettings.value = false
    showToast('设置已保存成功!', 'success')
  } catch (error) {
    console.error('Failed to save settings:', error)
    showToast('保存失败,请重试', 'error')
  } finally {
    isSavingSettings.value = false
  }
}

// 关闭设置对话框
const closeSettings = (): void => {
  showSettings.value = false
}
</script>

<template>
  <div class="home-page">
    <header class="header">
      <div class="header-top">
        <div>
          <h1>🗣️ 口语训练营</h1>
          <p>选择一门语言开始练习</p>
        </div>
        <button class="settings-btn" title="设置" @click="openSettings">⚙️</button>
      </div>
    </header>

    <!-- 语种切换 -->
    <div class="lang-tabs">
      <button
        v-for="lang in languages"
        :key="lang"
        :class="['tab-btn', { active: currentLang === lang }]"
        @click="currentLang = lang"
      >
        {{ lang }}
      </button>
    </div>

    <!-- 加载中提示 -->
    <div v-if="isLoading" class="loading-state">加载课程中...</div>

    <!-- 课程卡片网格 -->
    <div v-else class="course-grid">
      <div
        v-for="course in filteredCourses"
        :key="course.id"
        class="course-card"
        @click="startPractice(course.id)"
      >
        <div class="card-icon">{{ course.icon }}</div>
        <div class="card-info">
          <h3>{{ course.title }}</h3>
          <div class="tags">
            <span class="tag level">{{ course.level }}</span>
            <span class="tag count">{{ course.count }} 句</span>
          </div>
        </div>
        <div class="play-icon">▶</div>
      </div>

      <!-- 空状态提示 -->
      <div v-if="filteredCourses.length === 0" class="empty-state">
        <p>暂无该语种的课程</p>
      </div>
    </div>

    <!-- 设置对话框 -->
    <div v-if="showSettings" class="modal-overlay" @click.self="closeSettings">
      <div class="settings-modal">
        <div class="modal-header">
          <h2>⚙️ 设置</h2>
          <button class="close-btn" @click="closeSettings">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label for="azure-key">Azure TTS API Key</label>
            <input
              id="azure-key"
              v-model="settingsForm.AZURE_TTS_KEY"
              type="password"
              placeholder="输入 Azure TTS API Key"
            />
          </div>

          <div class="form-group">
            <label for="azure-region">Azure TTS Region</label>
            <input
              id="azure-region"
              v-model="settingsForm.AZURE_TTS_REGION"
              type="text"
              placeholder="例如: eastasia"
            />
          </div>

          <div class="form-group">
            <label for="dashscope-key">DashScope API Key</label>
            <input
              id="dashscope-key"
              v-model="settingsForm.DASHSCOPE_API_KEY"
              type="password"
              placeholder="输入 DashScope API Key"
            />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeSettings">取消</button>
          <button class="btn btn-primary" :disabled="isSavingSettings" @click="saveSettings">
            {{ isSavingSettings ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
    <!-- Toast 通知 -->
    <Transition name="toast">
      <div v-if="toast.show" :class="['toast', `toast-${toast.type}`]">
        <span class="toast-icon">{{ toast.type === 'success' ? '✓' : '✕' }}</span>
        <span class="toast-message">{{ toast.message }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.home-page {
  padding: 30px;
  max-width: 800px;
  margin: 0 auto;
}
.header {
  margin-bottom: 30px;
}
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.header h1 {
  margin: 0;
  color: #2c3e50;
}
.header p {
  color: #7f8c8d;
  margin-top: 5px;
}

/* 设置按钮 */
.settings-btn {
  padding: 10px 15px;
  border: none;
  background: #f0f2f5;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.5rem;
  transition: all 0.3s;
}
.settings-btn:hover {
  background: #e0e0e0;
  transform: scale(1.1);
}

/* 语种切换 */
.lang-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  flex-wrap: wrap;
}
.tab-btn {
  padding: 8px 20px;
  border: none;
  background: #e0e0e0;
  border-radius: 20px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
}
.tab-btn.active {
  background: #42b883;
  color: white;
  transform: scale(1.05);
}

/* 卡片网格 */
.course-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}
.course-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}
.course-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}
.card-icon {
  font-size: 2.5rem;
}
.card-info h3 {
  margin: 0 0 8px 0;
  font-size: 1.1rem;
}
.tags {
  display: flex;
  gap: 8px;
  font-size: 0.8rem;
}
.tag {
  padding: 2px 8px;
  border-radius: 4px;
  background: #f0f2f5;
  color: #666;
}
.play-icon {
  margin-left: auto;
  color: #42b883;
  font-size: 1.2rem;
  opacity: 0;
  transition: opacity 0.2s;
}
.course-card:hover .play-icon {
  opacity: 1;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
  grid-column: 1 / -1;
}

/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-header {
  padding: 20px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-header h2 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.5rem;
}

.close-btn {
  border: none;
  background: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #999;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #2c3e50;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #42b883;
}

.modal-footer {
  padding: 20px;
  border-top: 1px solid #e0e0e0;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #e0e0e0;
  color: #333;
}

.btn-secondary:hover:not(:disabled) {
  background: #d0d0d0;
}

.btn-primary {
  background: #42b883;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #35a372;
}

/* Toast 通知样式 */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 16px 20px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  min-width: 280px;
  font-size: 14px;
}

.toast-success {
  background: #f0f9ff;
  border-left: 4px solid #42b883;
  color: #2c3e50;
}

.toast-error {
  background: #fff5f5;
  border-left: 4px solid #f56565;
  color: #2c3e50;
}

.toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-weight: bold;
  font-size: 16px;
}

.toast-success .toast-icon {
  background: #42b883;
  color: white;
}

.toast-error .toast-icon {
  background: #f56565;
  color: white;
}

.toast-message {
  flex: 1;
  font-weight: 500;
}

/* Toast 动画 */
.toast-enter-active {
  animation: toast-in 0.3s ease-out;
}

.toast-leave-active {
  animation: toast-out 0.3s ease-in;
}

@keyframes toast-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes toast-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
</style>
