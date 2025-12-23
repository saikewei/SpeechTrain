import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { SettingsData, ScoreRecord } from '../shared/types'

// Custom APIs for renderer
const api = {
  getCourseList: () => ipcRenderer.invoke('get-course-list'),
  getCourseDetail: (id: string) => ipcRenderer.invoke('get-course-detail', id),
  phonemize: (text: string) => ipcRenderer.invoke('phonemize', text),
  setEspeakLanguage: (lang: string) => ipcRenderer.invoke('set-espeak-language', lang),
  analyzeRawAudio: (pcmData: Float32Array, text: string) =>
    ipcRenderer.invoke('analyze-raw-audio', pcmData, text),
  // TTS APIs
  ttsSynthesize: (text: string, langCode: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('tts-synthesize', text, langCode),
  ttsGetLanguages: (): Promise<Array<{ code: string; name: string; voice: string }>> =>
    ipcRenderer.invoke('tts-get-languages'),
  ttsIsConfigured: (): Promise<boolean> => ipcRenderer.invoke('tts-is-configured'),
  // LLM 音频分析
  llmAnalyzeAudio: (audioBuffer: number[], prompt: string): Promise<string> =>
    ipcRenderer.invoke('llm-analyze-audio', audioBuffer, prompt),
  // Settings APIs
  getSettings: (): Promise<SettingsData> => ipcRenderer.invoke('get-settings'),
  updateSettings: (newSettings: Partial<SettingsData>): Promise<void> =>
    ipcRenderer.invoke('update-settings', newSettings),
  // Score history APIs
  saveScoreRecord: (record: ScoreRecord): Promise<void> =>
    ipcRenderer.invoke('save-score-record', record),
  getScoreHistory: (): Promise<ScoreRecord[]> => ipcRenderer.invoke('get-score-history'),
  clearScoreHistory: (): Promise<void> => ipcRenderer.invoke('clear-score-history')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
