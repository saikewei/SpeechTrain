import { createApp } from 'vue'
import App from './App.vue'
import router from './router' // 导入路由
import './assets/main.css' // 假设你有这个样式文件，保留原样即可

const app = createApp(App)

app.use(router) // 使用路由
app.mount('#app')
