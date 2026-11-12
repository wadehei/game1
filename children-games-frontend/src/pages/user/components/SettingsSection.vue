<template>
  <div class="settings-section card">
    <div class="setting-item" @click="$emit('feedback')">
      <span class="setting-icon">💬</span>
      <span class="setting-text">意见反馈</span>
      <span class="setting-arrow">›</span>
    </div>
    <div class="setting-item" @click="$emit('parentCenter')">
      <span class="setting-icon">👪</span>
      <span class="setting-text">家长中心</span>
      <span class="setting-arrow">›</span>
    </div>
    <div class="setting-item" @click="$emit('logout')">
      <span class="setting-icon">🚪</span>
      <span class="setting-text">退出登录</span>
      <span class="setting-arrow">›</span>
    </div>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  (e: 'feedback'): void;
  (e: 'parentCenter'): void;
  (e: 'logout'): void;
}>();
</script>

<style scoped>
.card {
  background: #fff;
  padding: 20px;
  border-radius: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.settings-section {
  padding: 0;
  overflow: hidden;
}

.setting-item {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.setting-item:hover {
  background: #f9f9f9;
}

.setting-icon {
  font-size: 22px;
  margin-right: 12px;
}

.setting-text {
  font-size: 16px;
  color: #333;
  flex: 1;
}

.setting-arrow {
  font-size: 24px;
  color: #ccc;
}
</style>
