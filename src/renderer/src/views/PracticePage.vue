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

// 调用后端 API
const analyzeAudio = async (pcmData: Float32Array): Promise<void> => {
  try {
    if (!currentSentence.value) return

    result.value = await window.api.analyzeRawAudio(pcmData, currentSentence.value.text)
    currentState.value = 'result'
    // 将 Float32Array 转换为普通数组传递给后端
    const pcmArray = Array.from(pcmData)
    const llm_result = await window.api.llmAnalyzeAudio(
      pcmArray,
      `这是一个口语练习者的录音，原文是"${currentSentence.value.text}"，请客观评价他的发音质量。如果发音不好，请指出具体的错误之处，并给出改进建议。`
    )
    console.log('LLM 分析结果:', llm_result)

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

const retry = (): void => {
  currentState.value = 'idle'
  recordedChunks.length = 0
  result.value = null
  recordedAudioData = null
  isPlayingRecording.value = false
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
        <button class="next-btn" @click="nextSentence">下一句 →</button>
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
  background: #7f8c8d;
  color: white;
  border: none;
  border-radius: 30px;
  font-size: 1.2rem;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-btn:hover {
  background: #95a5a6;
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
