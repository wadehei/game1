<template>
  <div id="app">
    <router-view />
    <RestOverlay :show="restShow" :countdown="restCountdown" @skip="skipRest" />
    <AchievementToast />
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import RestOverlay from '@/components/RestOverlay.vue';
import AchievementToast from '@/components/AchievementToast.vue';
import { usePlayTimeGuard } from '@/composables/usePlayTimeGuard';
import { initVoice } from '@/utils/voice';

const route = useRoute();
const { restShow, restCountdown, skipRest } = usePlayTimeGuard(() => route.path);

// 预热语音引擎（首次手势后可朗读引导语）
initVoice();

// 游戏过程中防止屏幕休眠（支持 WakeLock 的浏览器）
let wakeLock: any = null;
const requestWakeLock = async () => {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await (navigator as any).wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    }
  } catch {
    // 不支持或被系统拒绝，静默降级
  }
};

const handleVisibilityForWakeLock = () => {
  if (!document.hidden) {
    requestWakeLock();
  }
};

document.addEventListener('visibilitychange', handleVisibilityForWakeLock);
requestWakeLock();
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: #f5f5f5;
  width: 100%;
  height: 100%;
  /* 孩子乱滑不触发下拉刷新/橡皮筋，双击不缩放 */
  overscroll-behavior: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

#app {
  width: 100%;
  min-height: 100vh;
}

/* 全局颜色变量 */
:root {
  --primary-color: #FF6B6B;
  --secondary-color: #4ECDC4;
  --accent-color: #FFE66D;
  --text-color: #333333;
  --text-light: #666666;
  --bg-color: #F7F7F7;
  --card-bg: #FFFFFF;
}

/* 通用样式 */
.container {
  padding: 20px;
}

.card {
  background: var(--card-bg);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.btn-primary {
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 25px;
  padding: 12px 30px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
}

.btn-secondary {
  background: var(--secondary-color);
  color: #fff;
  border: none;
  border-radius: 25px;
  padding: 12px 30px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
}
</style>
