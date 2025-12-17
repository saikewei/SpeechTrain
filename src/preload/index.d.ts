import { ElectronAPI } from '@electron-toolkit/preload'
import { Course, CourseSummary } from '../shared/types'
import { AnalysisResult } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      // 列表返回的是摘要信息数组
      getCourseList: () => Promise<CourseSummary[]>
      // 详情返回的是完整课程对象
      getCourseDetail: (id: string) => Promise<Course | undefined>

      // 音素化
      phonemize: (text: string) => Promise<string>
      // 设置语言
      setEspeakLanguage: (lang: string) => Promise<void>
      // 分析音频
      analyzeRawAudio: (pcmData: Float32Array, text: string) => Promise<AnalysisResult>
      ttsSynthesize: (text: string, langCode: string) => Promise<ArrayBuffer>
      ttsGetLanguages: () => Promise<Array<{ code: string; name: string; voice: string }>>
      ttsIsConfigured: () => Promise<boolean>
    }
  }
}
