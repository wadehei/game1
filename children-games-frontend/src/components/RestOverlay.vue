<template>
  <div v-if="show" class="rest-overlay">
    <div class="rest-content">
      <span class="rest-icon">👀</span>
      <div class="rest-title">让眼睛休息一下</div>
      <div class="rest-desc">抬头看看窗外最远的地方，一起倒数吧！</div>
      <div class="rest-count">{{ countdown }}</div>
      <div
        class="rest-skip"
        @pointerdown="startSkipHold"
        @pointerup="cancelSkipHold"
        @pointerleave="cancelSkipHold"
      >
        {{ skipHolding ? '松手前再等一下…' : '家长长按 2 秒可跳过' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { playVoice } from '@/utils/voice';

const props = defineProps<{
  show: boolean;
  countdown: number;
}>();

const emit = defineEmits<{ skip: [] }>();

// 休息开始时播报（有家长录音用原声）
watch(
  () => props.show,
  (visible) => {
    if (visible) {
      playVoice('rest_start', '让眼睛休息一下，抬头看看窗外最远的地方');
    }
  }
);

const skipHolding = ref(false);
let skipTimer: ReturnType<typeof setTimeout> | null = null;

const startSkipHold = () => {
  skipHolding.value = true;
  skipTimer = setTimeout(() => {
    skipHolding.value = false;
    emit('skip');
  }, 2000);
};

const cancelSkipHold = () => {
  skipHolding.value = false;
  if (skipTimer) {
    clearTimeout(skipTimer);
    skipTimer = null;
  }
};
</script>

<style scoped>
.rest-overlay {
  position: fixed;
  inset: 0;
  background: linear-gradient(180deg, #2c786c 0%, #1d4e45 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  animation: restFadeIn 0.4s ease;
}

@keyframes restFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.rest-content {
  text-align: center;
  color: #fff;
  padding: 24px;
}

.rest-icon {
  font-size: 72px;
  display: block;
  animation: eyeBlink 3s ease infinite;
}

@keyframes eyeBlink {
  0%, 90%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.1); }
}

.rest-title {
  font-size: 26px;
  font-weight: bold;
  margin-top: 16px;
}

.rest-desc {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.85);
  margin-top: 10px;
}

.rest-count {
  font-size: 84px;
  font-weight: bold;
  margin-top: 18px;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
}

.rest-skip {
  margin-top: 28px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  padding: 10px;
  user-select: none;
  -webkit-user-select: none;
}
</style>
