import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { loadCourses } from './courseService'
import { speechService } from './SpeechService'
import { ttsService } from './ttsService'

app.commandLine.appendSwitch('no-sandbox')
// 定义两个窗口变量
let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null

function createSplashWindow(): void {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 300,
    frame: false, // 无边框
    alwaysOnTop: true,
    transparent: true, // 如果你想做圆角或透明背景
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // 加载 splash.html
  // 注意：你需要确保构建工具会把 splash.html 复制到输出目录
  // 或者直接用 data url 加载简单的 HTML
  if (is.dev) {
    // 开发模式
    splashWindow.loadFile(join(__dirname, '../../src/renderer/splash.html'))
  } else {
    // 生产模式
    splashWindow.loadFile(join(__dirname, '../renderer/splash.html'))
  }

  splashWindow.on('closed', () => {
    splashWindow = null
  })
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 900,
    show: false, // 先隐藏，等准备好了再显示
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    // 主窗口准备好后，显示主窗口，关闭 Splash
    mainWindow?.show()
    if (splashWindow) {
      splashWindow.close()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createSplashWindow()

  // 2. 异步初始化 AI 引擎 (耗时操作)
  try {
    // 稍微延迟一下，让 Splash 窗口有机会渲染出来
    await new Promise((resolve) => setTimeout(resolve, 500))
    await speechService.initialize()
  } catch (error) {
    console.error('Failed to initialize AI engine:', error)
    // 这里可以弹窗提示用户，然后退出
  }

  createWindow()

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 获取课程列表 (只返回元数据，不返回具体 content 以减少流量)
  ipcMain.handle('get-course-list', () => {
    const allData = loadCourses()
    // 只返回列表页需要的信息
    return allData.map(({ id, title, lang, level, icon, content }) => ({
      id,
      title,
      lang,
      level,
      icon,
      count: content?.length || 0
    }))
  })

  // 获取单个课程的详细内容
  ipcMain.handle('get-course-detail', (_event, courseId) => {
    const allData = loadCourses()
    return allData.find((c) => c.id === courseId)
  })

  // 音素化
  ipcMain.handle('phonemize', (_event, text: string) => {
    return speechService.phonemize(text)
  })

  // 设置语言
  ipcMain.handle('set-espeak-language', (_event, lang: string) => {
    switch (lang) {
      case '英语':
        lang = 'en-us'
        break
      case '中文':
        lang = 'zh'
        break
      case '日语':
        lang = 'ja'
        break
      case '法语':
        lang = 'fr'
        break
      case '德语':
        lang = 'de'
        break
      case '西班牙语':
        lang = 'es'
        break
      default:
        lang = 'en-us'
    }
    console.log(`[Main] Setting eSpeak language to: ${lang}`)
    speechService.setLanguage(lang)
  })

  // 分析音频数据 (高性能方式)
  ipcMain.handle('analyze-raw-audio', (_event, pcmData: Float32Array, text: string) => {
    const result = speechService.analyzeRaw(pcmData, 16000, 1, text)
    return result
  })

  // TTS 相关 API
  ipcMain.handle('tts-synthesize', async (_event, text: string, langCode: string) => {
    try {
      const audioBuffer = await ttsService.synthesize(text, langCode)
      return audioBuffer
    } catch (error) {
      console.error('[Main] TTS 合成失败:', error)
      throw error
    }
  })

  ipcMain.handle('tts-get-languages', () => {
    return ttsService.getSupportedLanguages()
  })

  ipcMain.handle('tts-is-configured', () => {
    return ttsService.isConfigured()
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
