<template>
  <div class="game-header" :class="headerClass">
    <div v-for="(item, index) in items" :key="item.label" class="header-item">
      <span class="label">{{ item.label }}</span>
      <span
        v-if="index === 0 && levelSelectable"
        class="value value-clickable"
        :class="item.valueClass"
        title="点击选择关卡"
        @click="$emit('selectLevel')"
      >{{ item.value }}</span>
      <span v-else class="value" :class="item.valueClass">{{ item.value }}</span>
    </div>
    <button class="sound-btn" @click="$emit('toggleSound')">
      {{ muted ? '🔇' : '🔊' }}
    </button>
    <button class="back-btn" @click="$emit('goBack')">
      ←
    </button>
  </div>
</template>

<script setup lang="ts">
interface HeaderItem {
  label: string;
  value: string | number;
  valueClass?: string;
}

defineProps<{
  items: HeaderItem[];
  muted: boolean;
  headerClass?: string;
  /** 首个（关卡）数据可点击，弹出选关 */
  levelSelectable?: boolean;
}>();

defineEmits<{
  toggleSound: [];
  goBack: [];
  selectLevel: [];
}>();
</script>

<style scoped>
.game-header {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 12px 50px;
  border-radius: 16px;
  align-items: center;
  position: relative;
}

.header-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 56px;
}

.label {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 4px;
}

.value {
  font-size: 20px;
  font-weight: bold;
}

.value-clickable {
  cursor: pointer;
  text-decoration: underline dotted rgba(128, 128, 128, 0.5);
  text-underline-offset: 4px;
}

.sound-btn {
  background: rgba(0, 0, 0, 0.1);
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.sound-btn:hover {
  background: rgba(0, 0, 0, 0.15);
  transform: scale(1.1);
}

.sound-btn:active {
  transform: scale(0.95);
}

.back-btn {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.1);
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  color: inherit;
  flex-shrink: 0;
}

.back-btn:hover {
  background: rgba(0, 0, 0, 0.18);
  transform: translateY(-50%) scale(1.1);
}

.back-btn:active {
  transform: translateY(-50%) scale(0.95);
}

/* Responsive */
@media (max-width: 480px) {
  .game-header {
    padding: 10px 16px;
    gap: 12px;
  }

  .value {
    font-size: 18px;
  }
}
</style>
