import { app } from 'electron'
import path from 'path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// 定义 C++ 插件的类型接口 (为了代码提示)
interface NativeAddon {
  new (modelPath: string, vocabPath: string, espeakPath: string): SpeechEngineInstance
}

interface SpeechEngineInstance {
  // 重载1: 传文件路径
  analyze(wavPath: string, text: string): AnalysisResult
  // 重载2: 传 PCM 内存数据
  analyze(pcmData: Float32Array, sampleRate: number, channels: number, text: string): AnalysisResult
  phonemize(text: string): string
  setLanguage(lang: string): void
}

// 定义返回结果的类型 (根据你的 C++ 结构)
export interface AnalysisResult {
  overall_score: number
  words: Array<{
    word: string
    score: number
    phonemes: Array<{ ipa: string; score: number; is_good: boolean }>
  }>
}

class SpeechService {
  private engine: SpeechEngineInstance | null = null

  constructor() {
    this.init()
  }

  private init(): void {
    try {
      // 1. 智能处理 C++ 插件的路径
      // 开发环境: ../../resources/bin/SpeechNode.node (假设)
      // 生产环境: ./bin/SpeechNode.node (取决于 electron-builder 配置)
      let addonPath = ''
      if (app.isPackaged) {
        addonPath = path.join(process.resourcesPath, 'bin', 'speech_core.node')
      } else {
        // 这里填你开发环境编译出来的实际绝对路径，或者相对路径
        // 注意：如果你更改了 C++ 项目名称，这里的文件名也要改
        addonPath = path.join(__dirname, '..', '..', 'resources', 'bin', 'speech_core.node')
      }

      console.log(`[SpeechService] Loading addon from: ${addonPath}`)

      // 动态 require，并强制转换为类型
      const NativeModule = require(addonPath) as { SpeechEngine: NativeAddon }

      // 2. 智能处理资源路径
      const resPath = app.isPackaged
        ? process.resourcesPath
        : path.join(app.getAppPath(), 'resources') // electron-vite 常用路径

      console.log('[SpeechService] Loading AI Models from:', resPath)

      // 3. 实例化 C++ 对象
      this.engine = new NativeModule.SpeechEngine(
        path.join(resPath, 'models/wav2vec2.onnx'),
        path.join(resPath, 'models/vocab.json'),
        resPath // espeak-ng-data 的父目录
      )

      console.log('[SpeechService] Speech Engine initialized successfully.')
    } catch (e) {
      console.error('[SpeechService] Failed to initialize Speech Engine:', e)
      // 这里可以做降级处理，或者弹窗报错
    }
  }

  /**
   * 通过文件路径分析 (传统方式)
   */
  public analyze(wavPath: string, text: string): AnalysisResult {
    if (!this.engine) {
      throw new Error('Speech Engine is not ready.')
    }

    try {
      console.time('InferenceFile')
      const result = this.engine.analyze(wavPath, text)
      console.timeEnd('InferenceFile')
      return result
    } catch (e) {
      console.error('[SpeechService] C++ Error:', e)
      throw new Error('Analysis failed inside native module.')
    }
  }

  /**
   * 通过内存数据分析 (高性能方式)
   * 直接传递 Float32Array，无需写入磁盘
   * * @param pcmData - 音频数据 (Web Audio API getChannelData 返回的)
   * @param sampleRate - 采样率 (例如 16000)
   * @param channels - 通道数 (通常为 1)
   * @param text - 目标文本
   */
  public analyzeRaw(
    pcmData: Float32Array,
    sampleRate: number,
    channels: number,
    text: string
  ): AnalysisResult {
    if (!this.engine) {
      throw new Error('Speech Engine is not ready.')
    }

    try {
      console.time('InferenceRaw')
      // 直接调用 C++ 的重载方法
      const result = this.engine.analyze(pcmData, sampleRate, channels, text)
      console.timeEnd('InferenceRaw')
      return result
    } catch (e) {
      console.error('[SpeechService] C++ Raw Error:', e)
      throw new Error('Raw Analysis failed inside native module.')
    }
  }

  public phonemize(text: string): string {
    if (!this.engine) {
      throw new Error('Speech Engine is not ready.')
    }

    try {
      const result = this.engine.phonemize(text) // 使用 any 绕过类型检查
      return result
    } catch (e) {
      console.error('[SpeechService] C++ Phonemize Error:', e)
      throw new Error('Phonemization failed inside native module.')
    }
  }

  public setLanguage(lang: string): void {
    if (!this.engine) {
      throw new Error('Speech Engine is not ready.')
    }

    try {
      this.engine.setLanguage(lang)
    } catch (e) {
      console.error('[SpeechService] C++ SetLanguage Error:', e)
      throw new Error('Setting language failed inside native module.')
    }
  }
}

// 导出单例
export const speechService = new SpeechService()
