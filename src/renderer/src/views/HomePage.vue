<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { CourseSummary } from '../../../shared/types'

const router = useRouter()

// 状态：课程列表 (初始为空)
const courses = ref<CourseSummary[]>([])
const currentLang = ref(localStorage.getItem('lastSelectedLang') || '英语')
const isLoading = ref(true)

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
</script>

<template>
  <div class="home-page">
    <header class="header">
      <h1>🗣️ 口语训练营</h1>
      <p>选择一门语言开始练习</p>
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
.header h1 {
  margin: 0;
  color: #2c3e50;
}
.header p {
  color: #7f8c8d;
  margin-top: 5px;
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
</style>
