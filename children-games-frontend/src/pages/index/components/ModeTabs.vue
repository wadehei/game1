<template>
  <div class="mode-tabs">
    <button
      class="mode-tab kids"
      :class="{ active: mode === 'kids' }"
      @click="$emit('select', 'kids')"
    >
      <span class="mode-icon">🧒</span>
      <span class="mode-label">小朋友游戏</span>
    </button>
    <button
      class="mode-tab battle"
      :class="{ active: mode === 'battle' }"
      @click="$emit('select', 'battle')"
    >
      <span class="mode-icon">⚔️</span>
      <span class="mode-label">好友对战</span>
    </button>
  </div>
</template>

<script setup lang="ts">
export type HomeMode = 'kids' | 'battle';

defineProps<{
  mode: HomeMode;
}>();

defineEmits<{
  select: [mode: HomeMode];
}>();
</script>

<style scoped>
.mode-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.mode-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  border: 2px solid #e3e8ef;
  border-radius: 16px;
  background: #fff;
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-tab .mode-icon {
  font-size: 26px;
}

.mode-tab .mode-label {
  font-size: 14px;
  font-weight: 600;
}

.mode-tab.kids.active {
  border-color: #6bcb77;
  background: rgba(107, 203, 119, 0.08);
  color: #2d9d7a;
}

.mode-tab.battle.active {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.08);
  color: #667eea;
}
</style>
