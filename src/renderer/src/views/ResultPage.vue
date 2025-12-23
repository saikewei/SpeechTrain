<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

interface SentenceResult {
  text: string
  score: number
  timestamp: number
}

const courseTitle = ref<string>('')
const results = ref<SentenceResult[]>([])

onMounted(() => {
  // 从路由参数获取数据
  courseTitle.value = (route.query.title as string) || '课程练习'
  const resultsData = route.query.results as string
  if (resultsData) {
    try {
      results.value = JSON.parse(resultsData)
    } catch (error) {
      console.error('解析结果数据失败:', error)
    }
  }
})

// 计算平均分
const averageScore = computed(() => {
  if (results.value.length === 0) return 0
  const total = results.value.reduce((sum, item) => sum + item.score, 0)
  return Math.round(total / results.value.length)
})

// 计算最高分
const maxScore = computed(() => {
  if (results.value.length === 0) return 0
  return Math.max(...results.value.map((item) => item.score))
})

// 计算最低分
const minScore = computed(() => {
  if (results.value.length === 0) return 0
  return Math.min(...results.value.map((item) => item.score))
})

// 获取等级评价
const getGrade = (score: number): string => {
  if (score >= 90) return '优秀'
  if (score >= 80) return '良好'
  if (score >= 70) return '中等'
  if (score >= 60) return '及格'
  return '需要加强'
}

// 获取等级颜色
const getGradeColor = (score: number): string => {
  if (score >= 90) return '#28a745'
  if (score >= 80) return '#17a2b8'
  if (score >= 70) return '#ffc107'
  if (score >= 60) return '#fd7e14'
  return '#dc3545'
}

// 返回首页
const backToHome = (): void => {
  router.push('/')
}

// 查看详细记录
const showDetailsDialog = ref(false)
const openDetailsDialog = (): void => {
  showDetailsDialog.value = true
}
const closeDetailsDialog = (): void => {
  showDetailsDialog.value = false
}
</script>

<template>
  <div class="result-page">
    <!-- 头部 -->
    <div class="header">
      <h1>🎉 课程完成</h1>
      <p class="course-title">{{ courseTitle }}</p>
    </div>

    <!-- 主要统计区 -->
    <div class="stats-container">
      <!-- 平均分圆环 -->
      <div class="score-circle-large">
        <div class="score-number" :style="{ color: getGradeColor(averageScore) }">
          {{ averageScore }}
        </div>
        <div class="score-label">平均分</div>
        <div class="grade-badge" :style="{ background: getGradeColor(averageScore) }">
          {{ getGrade(averageScore) }}
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="stats-cards">
        <div class="stat-card">
          <div class="stat-icon">📝</div>
          <div class="stat-value">{{ results.length }}</div>
          <div class="stat-label">完成句子</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">🏆</div>
          <div class="stat-value">{{ maxScore }}</div>
          <div class="stat-label">最高分</div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">📊</div>
          <div class="stat-value">{{ minScore }}</div>
          <div class="stat-label">最低分</div>
        </div>
      </div>
    </div>

    <!-- 查看详细记录按钮 -->
    <button class="view-details-btn" @click="openDetailsDialog">📋 查看详细记录</button>

    <!-- 底部操作 -->
    <div class="action-bar">
      <button class="home-btn" @click="backToHome">返回首页</button>
    </div>

    <!-- 详细记录对话框 -->
    <div v-if="showDetailsDialog" class="dialog-overlay" @click="closeDetailsDialog">
      <div class="dialog-content" @click.stop>
        <div class="dialog-header">
          <h3>📋 详细记录</h3>
          <button class="close-btn" @click="closeDetailsDialog">✕</button>
        </div>

        <div class="dialog-body">
          <div v-if="results.length === 0" class="empty-state">
            <p>暂无记录</p>
          </div>
          <div v-else class="details-list">
            <div v-for="(result, index) in results" :key="index" class="detail-item">
              <div class="item-index">{{ index + 1 }}</div>
              <div class="item-text">{{ result.text }}</div>
              <div class="item-score" :style="{ color: getGradeColor(result.score) }">
                {{ result.score }}
              </div>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="dialog-close-btn" @click="closeDetailsDialog">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.result-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  color: white;
}

.header {
  text-align: center;
  margin-bottom: 40px;
}

.header h1 {
  font-size: 2.5rem;
  margin: 0 0 10px 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
}

.course-title {
  font-size: 1.2rem;
  opacity: 0.9;
  margin: 0;
}

.stats-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
  margin-bottom: 40px;
}

.score-circle-large {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  position: relative;
}

.score-number {
  font-size: 4rem;
  font-weight: bold;
  line-height: 1;
}

.score-label {
  font-size: 1rem;
  color: #666;
  margin-top: 5px;
}

.grade-badge {
  position: absolute;
  bottom: -15px;
  padding: 8px 20px;
  border-radius: 20px;
  color: white;
  font-weight: bold;
  font-size: 0.9rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.stats-cards {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  justify-content: center;
}

.stat-card {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  padding: 25px 35px;
  border-radius: 16px;
  text-align: center;
  min-width: 140px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s;
}

.stat-card:hover {
  transform: translateY(-5px);
}

.stat-icon {
  font-size: 2.5rem;
  margin-bottom: 10px;
}

.stat-value {
  font-size: 2.5rem;
  font-weight: bold;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 0.9rem;
  opacity: 0.9;
}

.view-details-btn {
  margin-bottom: 30px;
  padding: 15px 40px;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(10px);
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 30px;
  color: white;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.view-details-btn:hover {
  background: rgba(255, 255, 255, 0.35);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

/* 对话框样式 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  animation: fadeIn 0.2s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.dialog-content {
  background: white;
  border-radius: 20px;
  width: 90%;
  max-width: 800px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  animation: slideUp 0.3s;
  overflow: hidden;
}

@keyframes slideUp {
  from {
    transform: translateY(50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.dialog-header {
  padding: 25px 30px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-header h3 {
  margin: 0;
  font-size: 1.5rem;
}

.close-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  font-size: 1.5rem;
  color: white;
  cursor: pointer;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: rotate(90deg);
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 25px 30px;
  min-height: 300px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: #999;
  font-size: 1.1rem;
}

.details-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 18px 20px;
  background: #f8f9fa;
  border-radius: 12px;
  transition: all 0.2s;
  border-left: 4px solid transparent;
}

.detail-item:hover {
  background: #e9ecef;
  transform: translateX(5px);
  border-left-color: #667eea;
}

.item-index {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  flex-shrink: 0;
  font-size: 1.1rem;
}

.item-text {
  flex: 1;
  text-align: left;
  color: #2c3e50;
  font-size: 1rem;
  line-height: 1.5;
}

.item-score {
  font-size: 1.8rem;
  font-weight: bold;
  flex-shrink: 0;
  min-width: 60px;
  text-align: right;
}

.dialog-footer {
  padding: 20px 30px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  background: #f8f9fa;
}

.dialog-close-btn {
  padding: 12px 35px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 25px;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.dialog-close-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.action-bar {
  width: 100%;
  max-width: 400px;
  margin-top: 20px;
}

.home-btn {
  width: 100%;
  padding: 18px;
  background: white;
  color: #667eea;
  border: none;
  border-radius: 30px;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 6px 25px rgba(0, 0, 0, 0.2);
  transition: all 0.3s;
}

.home-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}

/* 对话框滚动条样式 */
.dialog-body::-webkit-scrollbar {
  width: 10px;
}

.dialog-body::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 5px;
}

.dialog_body::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 5px;
}

.dialog_body::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
}
</style>
