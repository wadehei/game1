<template>
  <div v-if="show" class="level-modal" @click.self="$emit('close')">
    <div class="level-content">
      <div class="level-title">🎯 选择关卡</div>
      <div class="level-hint">已解锁 1 ~ {{ maxLevel }} 关</div>
      <div class="level-stepper">
        <button class="step-btn" :disabled="selected <= 1" @click="change(-1)">−</button>
        <div class="level-num">{{ selected }}</div>
        <button class="step-btn" :disabled="selected >= maxLevel" @click="change(1)">+</button>
      </div>
      <div class="level-btns">
        <button class="btn-cancel" @click="$emit('close')">取消</button>
        <button class="btn-start" @click="$emit('select', selected)">开始！</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  show: boolean;
  maxLevel: number;
  current: number;
}>();

defineEmits<{
  close: [];
  select: [level: number];
}>();

const selected = ref(props.current);

watch(() => props.show, (visible) => {
  if (visible) {
    selected.value = props.current;
  }
});

const change = (delta: number) => {
  selected.value = Math.max(1, Math.min(props.maxLevel, selected.value + delta));
};
</script>

<style scoped>
.level-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 150;
  animation: levelFadeIn 0.25s ease;
}

@keyframes levelFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.level-content {
  background: #fff;
  border-radius: 24px;
  padding: 30px;
  text-align: center;
  width: 90%;
  max-width: 300px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: levelBounceIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes levelBounceIn {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.level-title {
  font-size: 21px;
  font-weight: bold;
  color: #333;
}

.level-hint {
  font-size: 13px;
  color: #999;
  margin-top: 6px;
}

.level-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  margin: 24px 0;
}

.step-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 30px;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.12s ease, opacity 0.12s ease;
  touch-action: manipulation;
}

.step-btn:active {
  transform: scale(0.9);
}

.step-btn:disabled {
  opacity: 0.3;
  cursor: default;
}

.level-num {
  font-size: 48px;
  font-weight: bold;
  color: #333;
  min-width: 90px;
  font-variant-numeric: tabular-nums;
}

.level-btns {
  display: flex;
  gap: 12px;
}

.btn-cancel,
.btn-start {
  flex: 1;
  padding: 13px;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  touch-action: manipulation;
}

.btn-cancel {
  background: #f0f0f0;
  color: #666;
}

.btn-start {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
  color: #fff;
}

.btn-start:active {
  transform: scale(0.96);
}
</style>
