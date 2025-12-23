<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Course, CourseContent, AnalysisResult, ScoreRecord } from '../../../shared/types'

const router = useRouter()

// 状态定义
type State = 'idle' | 'recording' | 'analyzing' | 'result'
const currentState = ref<State>('idle')

const isLoading = ref(true)
const course = ref<Course | undefined>(undefined)
const currentSentence = ref<CourseContent | undefined>(undefined)
const currentIndex = ref(0)
const currentPhonemes = ref<string>('')

// 添加：收集所有句子的得分记录
const sentenceResults = ref<Array<{ text: string; score: number; timestamp: number }>>([])

// 播放示例语音相关
const isPlayingExample = ref(false)
const isTTSConfigured = ref(false)
let exampleAudioContext: AudioContext | null = null

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

    // 检查 TTS 是否配置
    isTTSConfigured.value = await window.api.ttsIsConfigured()
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
  if (playbackAudioContext) {
    stopPlayback()
  }
  if (exampleAudioContext) {
    stopExamplePlayback()
  }
})

// 播放示例语音
const playExampleAudio = async (): Promise<void> => {
  if (!currentSentence.value || isPlayingExample.value || !isTTSConfigured.value) return

  try {
    isPlayingExample.value = true

    // 调用 TTS API
    const audioData = (await window.api.ttsSynthesize(
      currentSentence.value.text,
      course.value?.lang || 'en'
    )) as ArrayBuffer | Uint8Array | number[]

    // 确保数据是 ArrayBuffer 类型
    let audioBuffer: ArrayBuffer
    if (audioData instanceof ArrayBuffer) {
      audioBuffer = audioData
    } else if (audioData instanceof Uint8Array) {
      audioBuffer = audioData.buffer as ArrayBuffer
    } else if (Array.isArray(audioData)) {
      audioBuffer = new Uint8Array(audioData).buffer
    } else {
      throw new Error('不支持的音频数据格式')
    }

    // 创建 AudioContext 播放
    exampleAudioContext = new AudioContext()
    const decodedData = await exampleAudioContext.decodeAudioData(audioBuffer)

    const source = exampleAudioContext.createBufferSource()
    source.buffer = decodedData
    source.connect(exampleAudioContext.destination)

    source.onended = () => {
      isPlayingExample.value = false
      if (exampleAudioContext) {
        exampleAudioContext.close()
        exampleAudioContext = null
      }
    }

    source.start(0)
  } catch (error) {
    console.error('播放示例语音失败:', error)
    alert('播放失败: ' + (error as Error).message)
    isPlayingExample.value = false
    if (exampleAudioContext) {
      await exampleAudioContext.close()
      exampleAudioContext = null
    }
  }
}

const stopExamplePlayback = (): void => {
  if (exampleAudioContext) {
    exampleAudioContext.close()
    exampleAudioContext = null
  }
  isPlayingExample.value = false
}

// --- 录音相关变量 ---
let audioContext: AudioContext | null = null
let mediaStream: MediaStream | null = null
let scriptProcessor: ScriptProcessorNode | null = null
let audioInput: MediaStreamAudioSourceNode | null = null
const recordedChunks: Float32Array[] = [] // 暂存录音片段
let recordedAudioData: Float32Array | null = null // 保存完整录音数据

// 开始录音
const startRecording = async (): Promise<void> => {
  if (isPlayingExample.value) {
    stopExamplePlayback()
  }
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

  // 保存录音数据用于播放
  recordedAudioData = fullAudioData

  console.log('录音数据长度:', fullAudioData.length)
  console.log(fullAudioData)

  // 3. 发送给后端分析
  analyzeAudio(fullAudioData)
}

const result = ref<AnalysisResult | null>(null)
const llmAnalysis = ref<string>('')
const isLLMAnalyzing = ref(false)
const showLLMDialog = ref(false)

// 调用后端 API
const analyzeAudio = async (pcmData: Float32Array): Promise<void> => {
  try {
    if (!currentSentence.value) return

    result.value = await window.api.analyzeRawAudio(pcmData, currentSentence.value.text)
    currentState.value = 'result'

    // 启动 LLM 分析(异步进行,不阻塞结果展示)
    isLLMAnalyzing.value = true
    llmAnalysis.value = ''

    try {
      // 将 Float32Array 转换为普通数组传递给后端
      const pcmArray = Array.from(pcmData)
      const llm_result = await window.api.llmAnalyzeAudio(
        pcmArray,
        `请评价这段音频的发音质量。原文是:"${currentSentence.value.text}"。`
      )
      llmAnalysis.value = llm_result
      console.log('LLM 分析结果:', llm_result)
    } catch (error) {
      // 识别 abort 错误,不显示提示
      const errorMessage = (error as Error).message || String(error)
      if (
        errorMessage.includes('LLM_REQUEST_ABORTED') ||
        errorMessage.includes('Request aborted')
      ) {
        console.log('LLM 分析被新请求中断')
        // 不显示错误信息,这是正常的中断行为
      } else {
        console.error('LLM 分析失败:', error)
        llmAnalysis.value = '⚠️ AI 分析服务暂时不可用'
      }
    } finally {
      isLLMAnalyzing.value = false
    }

    console.log('分析结果:', result.value)
  } catch (error) {
    console.error('分析失败:', error)
    alert('分析失败,请重试')
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

const saveSentenceResult = (): void => {
  if (!currentSentence.value || !result.value) return

  sentenceResults.value.push({
    text: currentSentence.value.text,
    score: getDisplayScore(result.value.overall_score),
    timestamp: Date.now()
  })
}

const nextSentence = (): void => {
  if (!course.value) return

  // 保存当前句子的得分
  saveSentenceResult()

  currentIndex.value += 1
  currentSentence.value = course.value.content[currentIndex.value]
  currentPhonemes.value = ''
  window.api.phonemize(currentSentence.value.text).then((phonemes) => {
    currentPhonemes.value = phonemes
  })
  currentState.value = 'idle'
  recordedChunks.length = 0
  result.value = null
  recordedAudioData = null
  isPlayingRecording.value = false
}

const endCourse = (): void => {
  if (!course.value) {
    router.push({ name: 'Home' })
    return
  }

  // 保存当前句子的得分
  saveSentenceResult()

  // 计算平均分并保存到历史记录
  const avgScore = Math.round(
    sentenceResults.value.reduce((sum, r) => sum + r.score, 0) / sentenceResults.value.length
  )

  window.api.saveScoreRecord({
    courseId: course.value.id,
    courseTitle: course.value.title,
    averageScore: avgScore,
    timestamp: Date.now(),
    details: sentenceResults.value.map((r) => ({ text: r.text, score: r.score }))
  } as ScoreRecord)

  // 课程结束，跳转到结算页面
  router.push({
    name: 'Result',
    query: {
      title: course.value.title,
      results: JSON.stringify(sentenceResults.value)
    }
  })
}

const hasNextSentence = computed((): boolean => {
  if (!course.value) return false
  return currentIndex.value + 1 < course.value.content.length
})

const retry = (): void => {
  currentState.value = 'idle'
  recordedChunks.length = 0
  result.value = null
  recordedAudioData = null
  isPlayingRecording.value = false
  llmAnalysis.value = ''
  isLLMAnalyzing.value = false
  showLLMDialog.value = false
}

// 打开 LLM 分析对话框
const openLLMDialog = (): void => {
  showLLMDialog.value = true
}

// 关闭 LLM 分析对话框
const closeLLMDialog = (): void => {
  showLLMDialog.value = false
}

// 计算指数化后的得分
const getDisplayScore = (score: number): number => {
  return Math.round(Math.exp(score) * 100)
}

// 根据得分获取颜色等级
const getScoreLevel = (score: number): 'good' | 'medium' | 'bad' => {
  const displayScore = getDisplayScore(score)
  if (displayScore >= 70) return 'good'
  if (displayScore >= 40) return 'medium'
  return 'bad'
}

// 播放录音相关
const isPlayingRecording = ref(false)
let playbackAudioContext: AudioContext | null = null

const playRecording = async (): Promise<void> => {
  if (!recordedAudioData || isPlayingRecording.value) return

  try {
    isPlayingRecording.value = true

    // 创建新的 AudioContext 用于播放
    playbackAudioContext = new AudioContext({ sampleRate: 16000 })

    // 创建 AudioBuffer
    const audioBuffer = playbackAudioContext.createBuffer(
      1, // 单声道
      recordedAudioData.length,
      16000 // 采样率
    )

    // 将录音数据复制到 AudioBuffer
    audioBuffer.copyToChannel(recordedAudioData as Float32Array<ArrayBuffer>, 0)

    // 创建 BufferSource 并播放
    const source = playbackAudioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(playbackAudioContext.destination)

    // 播放结束后重置状态
    source.onended = () => {
      isPlayingRecording.value = false
      if (playbackAudioContext) {
        playbackAudioContext.close()
        playbackAudioContext = null
      }
    }

    source.start(0)
  } catch (error) {
    console.error('播放录音失败:', error)
    isPlayingRecording.value = false
    if (playbackAudioContext) {
      await playbackAudioContext.close()
      playbackAudioContext = null
    }
  }
}

const stopPlayback = (): void => {
  if (playbackAudioContext) {
    playbackAudioContext.close()
    playbackAudioContext = null
  }
  isPlayingRecording.value = false
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
        <!-- 结果模式下：显示彩色单词和音素 -->
        <div v-if="currentState === 'result'" class="result-text">
          <div v-for="(wordData, idx) in result?.words" :key="idx" class="word-container">
            <div class="word" :class="getScoreLevel(wordData.score)">
              <span class="word-text">{{ wordData.word }}</span>
              <div class="word-score">{{ getDisplayScore(wordData.score) }}</div>
            </div>
            <div class="phonemes">
              <span
                v-for="(phoneme, pIdx) in wordData.phonemes"
                :key="pIdx"
                class="phoneme"
                :class="getScoreLevel(phoneme.score)"
                :title="`得分: ${getDisplayScore(phoneme.score)}`"
              >
                {{ phoneme.ipa }}
              </span>
            </div>
          </div>
        </div>

        <!-- 普通模式下：显示纯文本 -->
        <div v-else>
          <h2 class="main-text">{{ currentSentence?.text }}</h2>
          <div class="phonetic">{{ currentPhonemes }}</div>
        </div>

        <button
          v-if="currentState !== 'result' && isTTSConfigured"
          class="example-audio-btn"
          :disabled="isPlayingExample"
          @click="playExampleAudio"
        >
          {{ isPlayingExample ? '🔊 播放中...' : '🔊 听示例' }}
        </button>

        <div v-if="!isTTSConfigured && currentState !== 'result'" class="tts-warning">
          ⚠️ TTS 未配置，无法播放示例语音
        </div>
      </div>

      <!-- 2. 评分反馈圆环 (仅在结果页显示) -->
      <div
        v-if="currentState === 'result'"
        class="score-circle"
        :class="result ? getScoreLevel(result.overall_score) : ''"
      >
        <div class="score-number">{{ result ? getDisplayScore(result.overall_score) : 'N/A' }}</div>
        <div class="score-label">总分</div>
      </div>

      <!-- AI 分析按钮 (仅在结果页显示) -->
      <button
        v-if="currentState === 'result'"
        class="ai-analysis-btn"
        :disabled="isLLMAnalyzing && !llmAnalysis"
        @click="openLLMDialog"
      >
        <span v-if="isLLMAnalyzing && !llmAnalysis" class="btn-loading">
          <span class="mini-spinner"></span>
          AI 分析中...
        </span>
        <span v-else> 🤖 查看 AI 详细分析 </span>
      </button>

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
      <div v-else class="result-actions">
        <button class="play-btn" :disabled="isPlayingRecording" @click="playRecording">
          {{ isPlayingRecording ? '⏸️ 播放中...' : '▶️ 播放录音' }}
        </button>
        <button class="retry-btn" @click="retry">再来一次</button>
        <button v-if="hasNextSentence" class="next-btn" @click="nextSentence">下一句 →</button>
        <button v-else class="end-btn" @click="endCourse">结束课程</button>
      </div>
    </div>

    <!-- LLM 分析对话框 -->
    <div v-if="showLLMDialog" class="dialog-overlay" @click="closeLLMDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header">
          <h3>🤖 AI 详细分析</h3>
          <button class="close-btn" @click="closeLLMDialog">✕</button>
        </div>

        <div class="dialog-body">
          <!-- 加载状态 -->
          <div v-if="isLLMAnalyzing && !llmAnalysis" class="analysis-loading">
            <div class="loading-spinner"></div>
            <p>AI 正在分析您的发音...</p>
          </div>

          <!-- 分析结果 -->
          <div v-else-if="llmAnalysis" class="analysis-content">
            <pre>{{ llmAnalysis }}</pre>
          </div>

          <!-- 无结果提示 -->
          <div v-else class="analysis-empty">
            <p>暂无分析结果</p>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="dialog-close-btn" @click="closeLLMDialog">关闭</button>
        </div>
      </div>
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

.end-btn {
  padding: 15px 40px;
  background: #27ae60;
  color: white;
  border: none;
  border-radius: 30px;
  font-size: 1.2rem;
  cursor: pointer;
  transition: background 0.2s;
}

.end-btn:hover {
  background: #219150;
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
  font-size: 1.5rem;
  font-weight: bold;
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  justify-content: center;
  align-items: flex-start;
}

.word-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.word {
  position: relative;
  cursor: default;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f0f0f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.word.good {
  background: #d4edda;
  border: 2px solid #28a745;
}

.word.medium {
  background: #fff3cd;
  border: 2px solid #ffc107;
}

.word.bad {
  background: #f8d7da;
  border: 2px solid #dc3545;
}

.word-text {
  font-size: 1.5rem;
}

.word-score {
  font-size: 0.9rem;
  color: #666;
  font-weight: normal;
}

.phonemes {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
}

.phoneme {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-family: monospace;
  background: #f0f0f0;
  cursor: help;
  transition: transform 0.2s;
}

.phoneme:hover {
  transform: scale(1.1);
}

.phoneme.good {
  background: #c3e6cb;
  color: #155724;
}

.phoneme.medium {
  background: #fff3cd;
  color: #856404;
}

.phoneme.bad {
  background: #f5c6cb;
  color: #721c24;
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
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: white;
  transition: all 0.3s;
}

.score-circle.good {
  border: 5px solid #28a745;
  box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
}

.score-circle.good .score-number {
  color: #28a745;
}

.score-circle.medium {
  border: 5px solid #ffc107;
  box-shadow: 0 4px 15px rgba(255, 193, 7, 0.3);
}

.score-circle.medium .score-number {
  color: #ffc107;
}

.score-circle.bad {
  border: 5px solid #dc3545;
  box-shadow: 0 4px 15px rgba(220, 53, 69, 0.3);
}

.score-circle.bad .score-number {
  color: #dc3545;
}

.score-number {
  font-size: 2.5rem;
  font-weight: bold;
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

.result-actions {
  display: flex;
  gap: 15px;
  align-items: center;
}

.play-btn {
  padding: 15px 30px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 30px;
  font-size: 1.1rem;
  cursor: pointer;
  transition: background 0.2s;
}

.play-btn:hover:not(:disabled) {
  background: #2980b9;
}

.play-btn:disabled {
  background: #95a5a6;
  cursor: not-allowed;
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

.retry-btn {
  padding: 15px 40px;
  background: #86c24e;
  color: white;
  border: none;
  border-radius: 30px;
  font-size: 1.2rem;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: #6bbf3a;
}

.example-audio-btn {
  margin-top: 15px;
  padding: 10px 25px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.example-audio-btn:hover:not(:disabled) {
  background: #2980b9;
  transform: translateY(-2px);
}

.example-audio-btn:disabled {
  background: #95a5a6;
  cursor: not-allowed;
}

.tts-warning {
  margin-top: 10px;
  font-size: 0.9rem;
  color: #e67e22;
}

/* AI 分析按钮 */
.ai-analysis-btn {
  margin-top: 20px;
  padding: 12px 30px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 25px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-analysis-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
}

.ai-analysis-btn:disabled {
  background: linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%);
  cursor: not-allowed;
  box-shadow: none;
}

.btn-loading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mini-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* 对话框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  animation: fadeIn 0.2s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.dialog-content {
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s;
}

@keyframes slideUp {
  from {
    transform: translateY(50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-header h3 {
  margin: 0;
  font-size: 1.3rem;
  color: #2c3e50;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #999;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f0f0f0;
  color: #666;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  min-height: 200px;
}

.analysis-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: #666;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #f0f0f0;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

.analysis-content {
  text-align: left;
}

.analysis-content pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
  font-size: 1rem;
  line-height: 1.8;
  color: #2c3e50;
  margin: 0;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border-left: 4px solid #667eea;
}

.analysis-empty {
  padding: 40px;
  text-align: center;
  color: #999;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
}

.dialog-close-btn {
  padding: 10px 30px;
  background: #f0f0f0;
  color: #666;
  border: none;
  border-radius: 20px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.dialog-close-btn:hover {
  background: #e0e0e0;
}

/* 对话框滚动条样式 */
.dialog-body::-webkit-scrollbar {
  width: 8px;
}

.dialog-body::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.dialog-body::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 4px;
}

.dialog-body::-webkit-scrollbar-thumb:hover {
  background: #999;
}
</style>
