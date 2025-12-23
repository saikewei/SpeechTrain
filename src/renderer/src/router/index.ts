import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import PracticePage from '../views/PracticePage.vue'
import ResultPage from '../views/ResultPage.vue' // 导入结算页面

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: HomePage
    },
    {
      path: '/practice/:id',
      name: 'Practice',
      component: PracticePage
    },
    {
      // 结算页面路由
      path: '/result',
      name: 'Result',
      component: ResultPage
    }
  ]
})

export default router
