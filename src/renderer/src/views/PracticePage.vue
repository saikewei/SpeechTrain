<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import type { Course, CourseContent, AnalysisResult } from '../../../shared/types'

const router = useRouter()

// 状态定义
type State = 'idle' | 'recording' | 'analyzing' | 'result'
const currentState = ref<State>('idle')

const isLoading = ref(true)
const course = ref<Course | undefined>(undefined)
const currentSentence = ref<CourseContent | undefined>(undefined)
const currentIndex = ref(0)
const currentPhonemes = ref<string>('')

onMounted(async () => {
  try {
    isLoading.value = true
    const courseId = router.currentRoute.value.params.id as string
    // 调用 preload 中暴露的 API 获取课程详情
    course.value = await window.api.getCourseDetail(courseId)
    window.api.setEspeakLanguage(course.value?.lang || 'en')
    currentPhonemes.value = await window.api.phonemize(course.value?.content[0].text || '')
    console.log('Phonemes:', currentPhonemes.value)
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

onUnmounted(() => {
  if (currentState.value === 'recording') {
    stopRecording()
  }
})

// --- 录音相关变量 ---
let audioContext: AudioContext | null = null
let mediaStream: MediaStream | null = null
let scriptProcessor: ScriptProcessorNode | null = null
let audioInput: MediaStreamAudioSourceNode | null = null
const recordedChunks: Float32Array[] = [] // 暂存录音片段

// 开始录音
const startRecording = async (): Promise<void> => {
  try {
    // 1. 获取麦克风权限
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // 2. 创建 AudioContext
    audioContext = new window.AudioContext({ sampleRate: 16000 })
    // 3. 创建源节点
    audioInput = audioContext.createMediaStreamSource(mediaStream)
    // 4. 创建处理节点 (缓冲区大小 4096)
    // ScriptProcessorNode 虽然被标记为废弃，但在 Electron 环境下依然稳定且简单
    scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1)
    // 5. 监听音频处理事件
    scriptProcessor.onaudioprocess = (event) => {
      if (currentState.value !== 'recording') return
      const inputBuffer = event.inputBuffer
      const inputData = inputBuffer.getChannelData(0) // 获取单声道数据
      // 复制一份数据存起来 (Float32Array)
      recordedChunks.push(new Float32Array(inputData))
    }
    // 6. 连接节点: Source -> Processor -> Destination
    audioInput.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)
    // 清空旧数据
    recordedChunks.length = 0
    currentState.value = 'recording'
  } catch (err) {
    console.error('无法启动录音:', err)
    alert('无法访问麦克风，请检查权限设置。')
  }
}

// 停止录音并合并数据
const stopRecording = async (): Promise<void> => {
  if (currentState.value !== 'recording') return
  // 1. 停止处理
  if (scriptProcessor) {
    scriptProcessor.disconnect()
    scriptProcessor = null
  }
  if (audioInput) {
    audioInput.disconnect()
    audioInput = null
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop())
    mediaStream = null
  }
  if (audioContext) {
    await audioContext.close()
    audioContext = null
  }
  currentState.value = 'analyzing'
  // 2. 合并所有片段为一个大的 Float32Array
  const totalLength = recordedChunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const fullAudioData = new Float32Array(totalLength)
  let offset = 0
  for (const chunk of recordedChunks) {
    fullAudioData.set(chunk, offset)
    offset += chunk.length
  }

  console.log('录音数据长度:', fullAudioData.length)
  console.log(fullAudioData)
  // 3. 发送给后端分析
  analyzeAudio(fullAudioData)
}

const result = ref<AnalysisResult | null>(null)

// 调用后端 API
const analyzeAudio = async (pcmData: Float32Array): Promise<void> => {
  try {
    if (!currentSentence.value) return

    result.value = await window.api.analyzeRawAudio(pcmData, currentSentence.value.text)
    currentState.value = 'result'

    console.log('分析结果:', result.value)
  } catch (error) {
    console.error('分析失败:', error)
    alert('分析失败，请重试')
    currentState.value = 'idle'
  }
}

const toggleRecord = (): void => {
  if (currentState.value === 'idle') {
    startRecording()
  } else if (currentState.value === 'recording') {
    stopRecording()
  }
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
  recordedChunks.length = 0
  result.value = null
}
</script>

<template>
  <div class="practice-page">
    <!-- 顶部导航 -->
    <div class="top-bar">
      <button class="back-btn" @click="router.back()">← 退出</button>
      <div class="progress">Lesson 1: {{ currentIndex + 1 }}/{{ course?.content.length }}</div>
    </div>

    <!-- 主要内容区 -->
    <div class="content-area">
      <!-- 1. 句子展示区 -->
      <div class="sentence-card">
        <!-- 结果模式下：显示彩色单词 -->
        <div v-if="currentState === 'result'" class="result-text"></div>

        <!-- 普通模式下：显示纯文本 -->
        <div v-else>
          <h2 class="main-text">{{ currentSentence?.text }}</h2>
          <div class="phonetic">{{ currentPhonemes }}</div>
        </div>
      </div>

      <!-- 2. 评分反馈圆环 (仅在结果页显示) -->
      <div v-if="currentState === 'result'" class="score-circle">
        <div class="score-number">{{ result ? result.overall_score : '' }}</div>
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
        :disabled="currentState === 'analyzing'"
        @click="toggleRecord"
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
  user-select: none;
}

.main-text {
  user-select: text;
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
