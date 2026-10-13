<template>
  <transition name="toast-pop">
    <div v-if="current" class="achievement-toast">
      <div class="toast-body">
        <span class="toast-shine">✨</span>
        <span class="toast-icon">{{ current.icon }}</span>
        <div class="toast-text">
          <div class="toast-label">解锁新成就！</div>
          <div class="toast-name">{{ current.name }}</div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { pendingAchievements, shiftAchievement, type AchievementMeta } from '@/utils/achievementBus';

const current = ref<AchievementMeta | null>(null);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

watch(pendingAchievements, (queue) => {
  if (current.value || queue.length === 0) return;
  showNext();
}, { deep: true });

const showNext = () => {
  const next = shiftAchievement();
  if (!next) return;
  current.value = next;
  hideTimer = setTimeout(() => {
    current.value = null;
    // 稍作间隔后展示下一条
    setTimeout(() => {
      if (pendingAchievements.value.length > 0) {
        showNext();
      }
    }, 600);
  }, 2600);
};
</script>

<style scoped>
.achievement-toast {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 400;
  /* fixed + left:50% 会按剩余空间收缩，显式按内容取宽，避免文字被挤成竖排 */
  width: max-content;
  max-width: 86vw;
}

.toast-body {
  display: flex;
  align-items: center;
  gap: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  padding: 14px 24px;
  border-radius: 20px;
  box-shadow: 0 12px 40px rgba(102, 126, 234, 0.5);
}

.toast-shine {
  font-size: 22px;
  animation: shineSpin 1.6s ease infinite;
}

@keyframes shineSpin {
  0%, 100% { transform: scale(1) rotate(0deg); }
  50% { transform: scale(1.25) rotate(18deg); }
}

.toast-icon {
  font-size: 40px;
  animation: iconBounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes iconBounce {
  from { transform: scale(0) rotate(-180deg); }
  to { transform: scale(1) rotate(0deg); }
}

.toast-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 1px;
}

.toast-name {
  font-size: 18px;
  font-weight: bold;
}

.toast-pop-enter-active {
  transition: all 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

.toast-pop-leave-active {
  transition: all 0.3s ease;
}

.toast-pop-enter-from,
.toast-pop-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-24px) scale(0.85);
}
</style>
