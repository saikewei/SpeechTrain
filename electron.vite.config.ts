import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: {
          // 主窗口入口
          index: resolve(__dirname, 'src/renderer/index.html'),
          // 启动画面入口 (必须添加这个，否则打包后文件会丢失)
          splash: resolve(__dirname, 'src/renderer/splash.html')
        }
      }
    }
  }
})
