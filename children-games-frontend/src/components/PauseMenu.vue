<template>
  <div v-if="!hideButton" class="pause-btn" :style="btnTop !== undefined ? { top: btnTop + 'px' } : undefined" @click="$emit('pause')">
    <span>⏸️</span>
  </div>

  <div v-if="show" class="pause-overlay">
    <div class="pause-content">
      <span class="pause-icon">⏸️</span>
      <div class="pause-title">游戏暂停</div>
      <button class="btn-resume" @click="$emit('resume')">继续游戏</button>
      <button class="btn-quit" @click="$emit('quit')">退出游戏</button>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  show: boolean;
  /** 隐藏悬浮按钮（如结算弹窗期间），仅保留弹层 */
  hideButton?: boolean;
  /** 悬浮按钮的 top 偏移（px），用于头部为 fixed 布局的游戏 */
  btnTop?: number;
}>(), {
  hideButton: false,
});

defineEmits<{
  pause: [];
  resume: [];
  quit: [];
}>();
</script>

<style scoped>
.pause-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(8px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 20;
  transition: all 0.2s ease;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.pause-btn:hover {
  background: rgba(255, 255, 255, 0.4);
  transform: scale(1.1);
}

.pause-btn:active {
  transform: scale(0.95);
}

.pause-btn span {
  font-size: 20px;
  line-height: 1;
}

.pause-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: pauseFadeIn 0.25s ease;
}

@keyframes pauseFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.pause-content {
  background: #fff;
  border-radius: 20px;
  padding: 32px;
  text-align: center;
  width: 90%;
  max-width: 300px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: pauseBounceIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes pauseBounceIn {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.pause-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 8px;
}

.pause-title {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  margin-bottom: 20px;
}

.btn-resume,
.btn-quit {
  display: block;
  width: 100%;
  padding: 13px;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-resume {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  margin-bottom: 10px;
}

.btn-resume:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-quit {
  background: #f0f0f0;
  color: #666;
}

.btn-quit:hover {
  background: #e5e5e5;
}
</style>
