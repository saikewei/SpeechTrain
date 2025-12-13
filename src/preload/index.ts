import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getCourseList: () => ipcRenderer.invoke('get-course-list'),
  getCourseDetail: (id: string) => ipcRenderer.invoke('get-course-detail', id),
  phonemize: (text: string) => ipcRenderer.invoke('phonemize', text),
  setEspeakLanguage: (lang: string) => ipcRenderer.invoke('set-espeak-language', lang),
  analyzeRawAudio: (pcmData: Float32Array, text: string) =>
    ipcRenderer.invoke('analyze-raw-audio', pcmData, text)
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
