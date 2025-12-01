<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// 模拟数据：支持的语种
const languages = ['英语', '法语', '德语', '西班牙语']
const currentLang = ref('英语')

// 模拟数据：课程列表
const courses = [
  // --- 英语课程 ---
  { id: 1, title: '基础单词练习', lang: '英语', level: 'Easy', count: 20, icon: '🍎' },
  { id: 2, title: '进阶词汇挑战', lang: '英语', level: 'Medium', count: 30, icon: '🚀' },
  { id: 3, title: '日常口语对话', lang: '英语', level: 'Easy', count: 15, icon: '🗣️' },
  { id: 4, title: '商务英语长难句', lang: '英语', level: 'Hard', count: 10, icon: '💼' },
  { id: 5, title: '经典电影台词', lang: '英语', level: 'Medium', count: 12, icon: '🎬' },

  // --- 法语课程 ---
  { id: 6, title: '基础单词练习', lang: '法语', level: 'Easy', count: 15, icon: '🥐' },
  { id: 7, title: '旅行必备短语', lang: '法语', level: 'Medium', count: 25, icon: '✈️' },
  { id: 8, title: '浪漫诗歌朗读', lang: '法语', level: 'Hard', count: 8, icon: '🌹' },

  // --- 德语课程 ---
  { id: 9, title: '基础单词练习', lang: '德语', level: 'Easy', count: 20, icon: '🍺' },
  { id: 10, title: '科技与工程词汇', lang: '德语', level: 'Hard', count: 15, icon: '⚙️' },
  { id: 11, title: '日常问候语', lang: '德语', level: 'Easy', count: 10, icon: '👋' },

  // --- 西班牙语课程 ---
  { id: 12, title: '基础单词练习', lang: '西班牙语', level: 'Easy', count: 20, icon: '💃' },
  { id: 13, title: '常用生活俚语', lang: '西班牙语', level: 'Medium', count: 18, icon: '🌮' },
  { id: 14, title: '足球解说金句', lang: '西班牙语', level: 'Hard', count: 12, icon: '⚽' }
]

// 根据选择的语种过滤课程
const filteredCourses = computed(() => {
  return courses.filter((c) => c.lang === currentLang.value)
})

const startPractice = (courseId: number): void => {
  // 跳转到练习页，并带上课程ID
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

    <!-- 课程卡片网格 -->
    <div class="course-grid">
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
  background: rgba(0, 255, 170, 0.573);
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
</style>
