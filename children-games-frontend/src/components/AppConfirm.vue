<template>
  <div v-if="pendingConfirm" class="confirm-mask" @click.self="settleConfirm(false)">
    <div class="confirm-card">
      <div class="c-title">{{ pendingConfirm.title }}</div>
      <div v-if="pendingConfirm.detail" class="c-detail">{{ pendingConfirm.detail }}</div>
      <div class="c-actions">
        <button class="c-btn cancel" @click="settleConfirm(false)">{{ pendingConfirm.cancelText || '取消' }}</button>
        <button class="c-btn ok" :class="{ danger: pendingConfirm.danger }" @click="settleConfirm(true)">
          {{ pendingConfirm.confirmText || '确定' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { pendingConfirm, settleConfirm } from '@/utils/confirmBus';
</script>

<style scoped>
/* 不用 <transition>：确认框的显隐必须同步卸载，不依赖 rAF/transitionend
  （后台标签页/遮挡窗口会暂停 rAF，transition 驱动的弹框会永不关闭且挡住整页点击） */
.confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.confirm-card {
  width: 100%;
  max-width: 320px;
  background: #fff;
  border-radius: 16px;
  padding: 20px 18px 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
  animation: card-pop 0.18s ease-out;
}

@keyframes card-pop {
  from {
    transform: scale(0.92);
    opacity: 0.6;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.c-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  text-align: center;
}

.c-detail {
  margin-top: 8px;
  font-size: 13px;
  color: #777;
  line-height: 1.5;
  text-align: center;
  word-break: break-all;
}

.c-actions {
  margin-top: 18px;
  display: flex;
  gap: 10px;
}

.c-btn {
  flex: 1;
  border: none;
  border-radius: 22px;
  padding: 10px 0;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
}

.c-btn.cancel {
  background: #f0f2f5;
  color: #666;
}

.c-btn.ok {
  background: var(--primary-color, #ff6b6b);
  color: #fff;
}

.c-btn.ok.danger {
  background: #e74c3c;
}
</style>
