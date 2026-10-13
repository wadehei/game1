import { ref, onUnmounted } from 'vue';
import { emitGamePause, emitGameResume } from '@/utils/gameEvents';

/** 游戏页面路由（大厅/个人中心不计入连续游玩时间） */
const GAME_ROUTES = new Set(['/memory', '/fruit', '/puzzle', '/balloon', '/tank', '/mole', '/simon', '/math']);

/** 每次护眼休息的时长（秒） */
const REST_DURATION = 20;

const todayKey = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `playtime_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

/** 家长设置的护眼提醒间隔（分钟），0 为关闭 */
export const getRestIntervalMinutes = (): number => {
  try {
    const v = parseInt(localStorage.getItem('parent_rest_interval') || '', 10);
    return Number.isFinite(v) && v >= 0 ? v : 20;
  } catch {
    return 20;
  }
};

export const getTodayPlaySeconds = (): number => {
  try {
    return parseInt(localStorage.getItem(todayKey()) || '0', 10) || 0;
  } catch {
    return 0;
  }
};

export const resetTodayPlayTime = (): void => {
  try {
    localStorage.setItem(todayKey(), '0');
  } catch {
    // ignore
  }
};

/**
 * 连续游玩时长守卫：
 * - 只在游戏页面且页面可见时计时
 * - 连续游玩达到提醒间隔后全屏护眼休息（暂停所有游戏），倒数结束自动恢复
 */
export function usePlayTimeGuard(routePath: () => string) {
  const restShow = ref(false);
  const restCountdown = ref(REST_DURATION);
  const todayMinutes = ref(Math.ceil(getTodayPlaySeconds() / 60));

  let continuousSeconds = 0;
  let todaySeconds = getTodayPlaySeconds();
  let persistCounter = 0;
  let ticker: number | null = null;
  let countdownTimer: number | null = null;

  const startRest = () => {
    restShow.value = true;
    restCountdown.value = REST_DURATION;
    emitGamePause();
    countdownTimer = window.setInterval(() => {
      restCountdown.value--;
      if (restCountdown.value <= 0) {
        endRest();
      }
    }, 1000);
  };

  const endRest = () => {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    restShow.value = false;
    continuousSeconds = 0;
    emitGameResume();
  };

  const skipRest = () => endRest();

  const persist = () => {
    try {
      localStorage.setItem(todayKey(), String(todaySeconds));
    } catch {
      // ignore
    }
  };

  ticker = window.setInterval(() => {
    if (restShow.value || document.hidden || !GAME_ROUTES.has(routePath())) {
      return;
    }
    continuousSeconds++;
    todaySeconds++;
    todayMinutes.value = Math.ceil(todaySeconds / 60);

    persistCounter++;
    if (persistCounter >= 15) {
      persistCounter = 0;
      persist();
    }

    const interval = getRestIntervalMinutes();
    if (interval > 0 && continuousSeconds >= interval * 60) {
      persist();
      startRest();
    }
  }, 1000);

  onUnmounted(() => {
    persist();
    if (ticker) clearInterval(ticker);
    if (countdownTimer) clearInterval(countdownTimer);
  });

  return { restShow, restCountdown, todayMinutes, skipRest };
}
