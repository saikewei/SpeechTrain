<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { Course, CourseContent } from '../../../shared/types'

const router = useRouter()

// 状态定义
type State = 'idle' | 'recording' | 'analyzing' | 'result'
const currentState = ref<State>('idle')

const isLoading = ref(true)
const course = ref<Course | undefined>(undefined)
const currentSentence = ref<CourseContent | undefined>(undefined)
const currentIndex = ref(0)

onMounted(async () => {
  try {
    isLoading.value = true
    const courseId = router.currentRoute.value.params.id as string
    // 调用 preload 中暴露的 API 获取课程详情
    course.value = await window.api.getCourseDetail(courseId)
    if (!course.value) {
      console.error('Course not found:', courseId)
      return
    }
    currentSentence.value = course.value.content[0]
  } catch (error) {
    console.error('Failed to load practice data:', error)
  } finally {
    isLoading.value = false
  }
})

// 模拟评分结果结构
interface WordScore {
  word: string
  score: number // 0-100
  isGood: boolean
}
const resultScore = ref(0)
const resultWords = ref<WordScore[]>([])

// --- 模拟逻辑 (未来替换为真实 API) ---
const toggleRecord = (): void => {
  if (currentState.value === 'idle') {
    // 开始录音
    currentState.value = 'recording'
  } else if (currentState.value === 'recording') {
    // 停止录音并分析
    currentState.value = 'analyzing'
    simulateAnalysis()
  }
}

const simulateAnalysis = (): void => {
  setTimeout(() => {
    // 模拟后端返回的数据
    const words = currentSentence.value?.text.split(' ') || []
    const mockResult = words.map((w) => ({
      word: w,
      score: Math.floor(Math.random() * 40) + 60, // 随机 60-100 分
      isGood: Math.random() > 0.3 // 70% 概率读得好
    }))

    // 计算总分
    const total = mockResult.reduce((acc, cur) => acc + cur.score, 0) / mockResult.length

    resultScore.value = Math.round(total)
    resultWords.value = mockResult
    currentState.value = 'result'
  }, 1500) // 假装分析了 1.5秒
}

const nextSentence = (): void => {
  if (!course.value) return
  currentIndex.value += 1
  if (currentIndex.value >= course.value.content.length) {
    // 课程结束，返回首页
    router.push('/')
    return
  }
  currentSentence.value = course.value.content[currentIndex.value]
  currentState.value = 'idle'
  resultWords.value = []
}
</script>

<template>
  <div class="practice-page">
    <!-- 顶部导航 -->
    <div class="top-bar">
      <button class="back-btn" @click="router.back()">← 退出</button>
      <div class="progress">Lesson 1: 3/10</div>
    </div>

    <!-- 主要内容区 -->
    <div class="content-area">
      <!-- 1. 句子展示区 -->
      <div class="sentence-card">
        <!-- 结果模式下：显示彩色单词 -->
        <div v-if="currentState === 'result'" class="result-text">
          <span
            v-for="(item, index) in resultWords"
            :key="index"
            :class="['word', item.isGood ? 'good' : 'bad']"
          >
            {{ item.word }}
            <!-- 悬浮显示分数 -->
            <span class="score-tooltip">{{ item.score }}</span>
          </span>
        </div>

        <!-- 普通模式下：显示纯文本 -->
        <h2 v-else>{{ currentSentence?.text }}</h2>
      </div>

      <!-- 2. 评分反馈圆环 (仅在结果页显示) -->
      <div v-if="currentState === 'result'" class="score-circle">
        <div class="score-number">{{ resultScore }}</div>
        <div class="score-label">总分</div>
      </div>

      <!-- 3. 状态提示 -->
      <div class="status-text">
        <span v-if="currentState === 'idle'">点击麦克风开始跟读</span>
        <span v-if="currentState === 'recording'" class="recording-dot"
          >🔴 正在录音... (点击停止)</span
        >
        <span v-if="currentState === 'analyzing'">🤖 AI 正在分析您的发音...</span>
      </div>
    </div>

    <!-- 底部操作区 -->
    <div class="action-bar">
      <button
        v-if="currentState !== 'result'"
        class="mic-btn"
        :class="{ recording: currentState === 'recording', disabled: currentState === 'analyzing' }"
        @click="toggleRecord"
        :disabled="currentState === 'analyzing'"
      >
        <span class="mic-icon">🎙️</span>
      </button>

      <button v-else class="next-btn" @click="nextSentence">下一句 →</button>
    </div>
  </div>
</template>

<style scoped>
.practice-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
}

.top-bar {
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #666;
}
.back-btn {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  color: #666;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 20px;
  text-align: center;
}

.sentence-card h2 {
  font-size: 2rem;
  color: #2c3e50;
  margin-bottom: 10px;
}
.phonetic {
  color: #7f8c8d;
  font-family: monospace;
  font-size: 1.2rem;
}

/* 结果单词样式 */
.result-text {
  font-size: 2rem;
  font-weight: bold;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.word {
  position: relative;
  cursor: default;
  padding: 0 2px;
  border-radius: 4px;
}
.word.good {
  color: #27ae60;
}
.word.bad {
  color: #e74c3c;
  text-decoration: underline;
  text-decoration-style: wavy;
}

/* 简单的 Tooltip */
.score-tooltip {
  visibility: hidden;
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: #333;
  color: white;
  font-size: 0.8rem;
  padding: 4px 8px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}
.word:hover .score-tooltip {
  visibility: visible;
  opacity: 1;
}

/* 评分圆环 */
.score-circle {
  margin: 30px 0;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: 5px solid #42b883;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: white;
  box-shadow: 0 4px 15px rgba(66, 184, 131, 0.2);
}
.score-number {
  font-size: 2.5rem;
  font-weight: bold;
  color: #42b883;
}
.score-label {
  font-size: 0.8rem;
  color: #666;
}

.status-text {
  margin-top: 20px;
  height: 24px;
  color: #666;
}
.recording-dot {
  color: #e74c3c;
  animation: pulse 1.5s infinite;
}

/* 底部操作栏 */
.action-bar {
  padding: 40px;
  display: flex;
  justify-content: center;
  background: white;
  border-top: 1px solid #eee;
}

.mic-btn {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: none;
  background: #42b883;
  color: white;
  font-size: 2rem;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(66, 184, 131, 0.4);
  transition: all 0.3s;
}
.mic-btn:hover {
  transform: scale(1.05);
}
.mic-btn.recording {
  background: #e74c3c;
  box-shadow: 0 0 0 10px rgba(231, 76, 60, 0.2);
}
.mic-btn.disabled {
  background: #ccc;
  cursor: not-allowed;
  box-shadow: none;
}

.next-btn {
  padding: 15px 40px;
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 30px;
  font-size: 1.2rem;
  cursor: pointer;
  transition: background 0.2s;
}
.next-btn:hover {
  background: #34495e;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}
</style>
