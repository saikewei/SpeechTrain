import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import PracticePage from '../views/PracticePage.vue' // 导入新页面

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: HomePage
    },
    {
      // 动态路由，:id 代表课程ID
      path: '/practice/:id',
      name: 'Practice',
      component: PracticePage
    }
  ]
})

export default router
