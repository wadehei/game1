<template>
  <div class="home-page">
    <HomeHeader
      :user-info="userInfo"
      :total-stars="userInfo?.totalStars || 0"
      :star-pulse="starPulse"
      @click-avatar="goToProfiles"
      @toggle-settings="showSettings = !showSettings"
    />

    <HomeSettingsPanel
      :show="showSettings"
      :volume="volume"
      :theme-choice="themeChoice"
      @test-sound="testSound"
      @volume-change="onVolumeChange"
      @pick-theme="pickTheme"
    />

    <ModeTabs :mode="homeMode" @select="pickMode" />

    <BattleModeEntry v-if="homeMode === 'battle'" @enter="goBattle" />

    <template v-else>
      <GameList
        :games="games"
        :get-level="getGameLevel"
        :get-stars="getGameStars"
        :get-score-text="getScoreText"
        @select-game="goToGame"
        @open-board="openBoard"
      />

      <DailyTaskCard :task="dailyTask" :next-game="nextTaskGame" @go-game="goToGame" />
    </template>

    <LeaderboardModal
      :show="!!boardGame"
      :game-id="boardGame?.id || ''"
      :game-name="boardGame?.name || ''"
      @close="boardGame = null"
    />

    <button class="feedback-entry" @click="goFeedback">💬 意见反馈</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/store/user';
import { useGameStore } from '@/store/game';
import { getUserInfo, logoutNotify } from '@/api/user';
import { getAllProgress, getDailyTask, type DailyTaskInfo } from '@/api/game';
import { soundManager } from '@/utils/sound';
import { formatScore } from '@/utils/gameMeta';
import { games } from '@/utils/gameCatalog';
import { getThemeChoice, setTheme, type ThemeChoice } from '@/utils/theme';
import LeaderboardModal from '@/components/LeaderboardModal.vue';
import HomeHeader from './components/HomeHeader.vue';
import HomeSettingsPanel from './components/HomeSettingsPanel.vue';
import GameList from './components/GameList.vue';
import DailyTaskCard from './components/DailyTaskCard.vue';
import BattleModeEntry from './components/BattleModeEntry.vue';
import ModeTabs, { type HomeMode } from './components/ModeTabs.vue';
import { storage } from '@/utils/storage';

const router = useRouter();
const userStore = useUserStore();
const gameStore = useGameStore();

const userInfo = computed(() => userStore.userInfo);
const dailyTask = ref<DailyTaskInfo>({
  completedGames: 0,
  playedGames: [],
  taskGoal: 3,
  rewardStars: 10,
  claimed: false,
});

// 任务未完成时，推荐今天还没玩过的第一个游戏
const nextTaskGame = computed(() => {
  const played = new Set(dailyTask.value.playedGames || []);
  return games.find((g) => !played.has(g.id)) || null;
});

const starPulse = ref(false);
const boardGame = ref<{ id: string; name: string } | null>(null);

const openBoard = (id: string, name: string) => {
  boardGame.value = { id, name };
};

// 星星数变化时触发脉冲动画
watch(
  () => userInfo.value?.totalStars,
  () => {
    starPulse.value = true;
    setTimeout(() => {
      starPulse.value = false;
    }, 350);
  }
);

const getGameLevel = (gameId: string): number => {
  const progress = gameStore.getProgress(gameId);
  return progress?.currentLevel || 1;
};

// 卡片上的星星 = 当前关卡拿到的星级
const getGameStars = (gameId: string): number => {
  const progress = gameStore.getProgress(gameId);
  if (!progress) return 0;
  return Math.min(progress.levelStars?.[String(progress.currentLevel)] || 0, 3);
};

const getScoreText = (gameId: string): string => {
  const progress = gameStore.getProgress(gameId);
  const highScore = progress?.highScore || 0;
  if (!highScore) return '';
  return formatScore(gameId, highScore);
};

const goToProfiles = () => {
  soundManager.playClick();
  router.push('/profile');
};

const goToGame = (gameId: string) => {
  soundManager.playClick();
  router.push(`/${gameId}`);
};

const goFeedback = () => {
  soundManager.playClick();
  router.push('/feedback');
};

// ── 设置面板 ──
const showSettings = ref(false);
const volume = ref(0.6);
const onVolumeChange = (v: number) => {
  volume.value = v;
  soundManager.setVolume(v);
};
const testSound = () => soundManager.playSuccess();

// ── 主题切换 ──
const themeChoice = ref<ThemeChoice>(getThemeChoice());
const pickTheme = (v: ThemeChoice) => {
  themeChoice.value = v;
  setTheme(v);
};

// ── 首页双入口：小朋友游戏 / 好友对战 ──
const MODE_KEY = 'home_mode';
const homeMode = ref<HomeMode>((storage.getItem(MODE_KEY) as HomeMode) || 'kids');
const pickMode = (m: HomeMode) => {
  homeMode.value = m;
  soundManager.playClick();
  try {
    storage.setItem(MODE_KEY, m);
  } catch {
    // ignore
  }
};

const goBattle = () => {
  soundManager.playClick();
  router.push('/battle');
};

onMounted(async () => {
  soundManager.init();
  volume.value = soundManager.getVolume();
  try {
    await getUserInfo();
  } catch (e: unknown) {
    const status = isAxiosError(e) ? e.response?.status : undefined;
    if (status === 401 || status === 404) {
      logoutNotify();
      userStore.logout();
      router.replace('/profiles');
      return;
    }
  }
  try {
    await getAllProgress();
  } catch {
    // 获取进度失败，保持默认空状态
  }
  try {
    dailyTask.value = await getDailyTask();
  } catch {
    // 获取每日任务失败，保持默认
  }
});

function isAxiosError(e: unknown): e is { response?: { status?: number } } {
  return typeof e === 'object' && e !== null && 'isAxiosError' in e;
}
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #ffe5e5 0%, #f5f5f5 100%);
  padding: 20px;
}

.feedback-entry {
  display: block;
  margin: 0 auto;
  border: none;
  background: transparent;
  color: #999;
  font-size: 13px;
  padding: 8px 16px;
  cursor: pointer;
}

.feedback-entry:active {
  color: #667eea;
}
</style>
