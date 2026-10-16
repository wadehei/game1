<template>
  <div class="app-toast-wrap">
    <div v-for="t in shown" :key="t.id" class="app-toast" :class="t.kind">
      <span class="t-icon">{{ t.kind === 'error' ? '⚠️' : '💡' }}</span>
      <span class="t-text">{{ t.text }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { toastQueue, type ToastMsg } from '@/utils/toastBus';

const shown = ref<ToastMsg[]>([]);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

// 队列有新消息就整批上屏，整体停留 2.6s 后清空（提示类消息频率低，无需逐条排队）。
// 不用 <transition>：toast 显隐必须同步卸载，不依赖 rAF/transitionend（后台标签页会暂停 rAF 导致元素永不消失）
watch(
  toastQueue,
  (queue) => {
    if (queue.length === 0) return;
    shown.value = [...queue];
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      shown.value = [];
      toastQueue.value = [];
    }, 2600);
  },
  { deep: true }
);

onBeforeUnmount(() => {
  if (hideTimer) clearTimeout(hideTimer);
});
</script>

<style scoped>
.app-toast-wrap {
  position: fixed;
  top: 52px;
  left: 0;
  right: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.app-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 82vw;
  padding: 10px 18px;
  border-radius: 12px;
  background: rgba(30, 35, 48, 0.92);
  color: #fff;
  font-size: 14px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  animation: toast-in 0.22s ease-out;
}

.app-toast.error {
  background: rgba(140, 38, 38, 0.94);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(-14px) scale(0.94);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.t-icon {
  flex-shrink: 0;
}

.t-text {
  min-width: 0;
  word-break: break-all;
}
</style>
