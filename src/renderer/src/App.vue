<script setup lang="ts">
// App.vue 现在主要作为布局入口
</script>

<template>
  <div class="app-container">
    <!-- 路由出口：页面组件会显示在这里 -->
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<style>
/* 全局简单样式 */
body {
  margin: 0;
  font-family: sans-serif;
  background: #f0f2f5;
}

nav {
  background: #fff;
  padding: 15px;
  border-bottom: 1px solid #ddd;
  font-weight: bold;
}
</style>
