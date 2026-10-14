<template>
  <div v-if="show" class="result-modal">
    <div ref="contentRef" class="result-content">
      <span class="result-icon">{{ icon }}</span>
      <span class="result-title">{{ title }}</span>
      <div class="result-stars">
        <span v-for="i in 3" :key="i" class="star" :class="{ active: i <= stars }">⭐</span>
      </div>
      <div v-if="info" class="result-info">{{ info }}</div>
      <div v-if="autoNext && won" class="auto-next-tip" @click="cancelAuto">
        {{ autoCountdown > 0 ? `${autoCountdown} 秒后自动开始下一关` : '自动开始中…' }}
        <span class="cancel-hint">点击这里取消</span>
      </div>
      <div class="result-buttons">
        <button class="btn-retry" @click="cancelAuto(); $emit('retry')">再玩一次</button>
        <button v-if="won" class="btn-next" @click="cancelAuto(); $emit('next')">下一关</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { playVoice, stopSpeaking } from '@/utils/voice';
import { createStarRain } from '@/utils/animations';

const props = withDefaults(
  defineProps<{
    show: boolean;
    won: boolean;
    stars: number;
    icon?: string;
    title?: string;
    info?: string;
    autoNext?: boolean; // 通关后倒计时自动进入下一关（默认开启）
  }>(),
  { autoNext: true },
);



const contentRef = ref<HTMLElement | null>(null);

// 通关自动开始下一关：3 秒倒计时，点击提示可取消
const emit = defineEmits<{
  retry: [];
  next: [];
}>();

const autoCountdown = ref(3);
let autoTimer: ReturnType<typeof setInterval> | null = null;

const stopAuto = () => {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
};

const cancelAuto = () => stopAuto();

watch(
  () => [props.show, props.won, props.autoNext],
  ([show, won, auto]) => {
    stopAuto();
    autoCountdown.value = 3;
    if (show && won && auto !== false) {
      autoTimer = setInterval(() => {
        autoCountdown.value -= 1;
        if (autoCountdown.value <= 0) {
          stopAuto();
          emit('next');
        }
      }, 1000);
    }
  },
  { immediate: true }
);

// 弹出时语音鼓励；赢了来一场星星雨
watch(() => props.show, (visible) => {
  if (!visible) {
    stopSpeaking();
    return;
  }
  nextTick(() => {
    if (props.won) {
      playVoice('result_win', '恭喜你，通关啦！你真棒！');
      if (contentRef.value) {
        createStarRain(contentRef.value);
      }
    } else {
      playVoice('result_lose', '没关系，再试一次，你可以的！');
    }
  });
});
</script>

<style scoped>
.auto-next-tip {
  margin-top: 10px;
  font-size: 13px;
  color: #667eea;
  text-align: center;
  cursor: pointer;
}

.cancel-hint {
  font-size: 11px;
  color: #b3bac4;
  margin-left: 6px;
  text-decoration: underline;
}

.result-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.result-content {
  position: relative;
  background: #fff;
  border-radius: 20px;
  padding: 32px;
  text-align: center;
  width: 90%;
  max-width: 320px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
  overflow: hidden;
}

@keyframes bounceIn {
  from { transform: scale(0.3); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.result-icon {
  font-size: 64px;
  display: block;
  margin-bottom: 12px;
}

.result-title {
  font-size: 22px;
  font-weight: bold;
  color: #333;
  margin-bottom: 20px;
  display: block;
}

.result-stars {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}

.star {
  font-size: 32px;
  opacity: 0.3;
  transition: opacity 0.3s;
}

.star.active {
  opacity: 1;
  animation: starAppear 0.4s ease backwards;
}

.result-stars .star:nth-child(1) { animation-delay: 0.2s; }
.result-stars .star:nth-child(2) { animation-delay: 0.4s; }
.result-stars .star:nth-child(3) { animation-delay: 0.6s; }

@keyframes starAppear {
  from { transform: scale(0) rotate(-180deg); opacity: 0; }
  to { transform: scale(1) rotate(0); opacity: 1; }
}

.result-info {
  margin-bottom: 24px;
  font-size: 14px;
  color: #666;
}

.result-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn-retry,
.btn-next {
  padding: 12px 28px;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-retry:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn-next:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.btn-retry {
  background: #f0f0f0;
  color: #666;
}

.btn-next {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}
</style>
