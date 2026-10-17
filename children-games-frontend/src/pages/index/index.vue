<template>
  <div class="home-page">
    <!-- 顶部状态栏 -->
    <div class="header">
      <div class="user-info" @click="goToProfiles">
        <PlayerAvatar :avatar="userInfo?.avatar" :size="50" />
        <div class="user-details">
          <div class="nickname">{{ userInfo?.nickname || "选个角色" }}</div>
          <div class="level-badge">
            <span class="level-text">Lv.{{ userInfo?.level || 1 }}</span>
          </div>
        </div>
      </div>
      <div class="header-right">
        <div class="star-count" :class="{ pulse: starPulse }">
          <span class="star-icon">⭐</span>
          <span class="star-num">{{ userInfo?.totalStars || 0 }}</span>
        </div>
        <button class="settings-btn" @click="showSettings = !showSettings">⚙️</button>
      </div>
    </div>

    <!-- 快捷设置：音量 -->
    <div v-if="showSettings" class="settings-panel">
      <div class="sp-row">
        <span class="sp-icon">{{ volume === 0 ? '🔇' : '🔊' }}</span>
        <span class="sp-label">音效音量</span>
        <input
          class="sp-slider"
          type="range"
          min="0"
          max="100"
          :value="Math.round(volume * 100)"
          @input="onVolumeInput"
        />
        <span class="sp-num">{{ Math.round(volume * 100) }}%</span>
      </div>
      <button class="sp-test" @click="testSound">点一下试听</button>
      <div class="sp-row" style="margin-top: 10px">
        <span class="sp-icon">🎨</span>
        <span class="sp-label">主题</span>
        <div class="theme-chips">
          <button
            v-for="opt in THEME_OPTIONS"
            :key="opt.value"
            class="theme-chip"
            :class="{ picked: themeChoice === opt.value }"
            @click="pickTheme(opt.value)"
          >{{ opt.label }}</button>
        </div>
      </div>
      <div class="sp-tip">背景音乐功能即将上线</div>
    </div>

    <!-- 好友对战入口 -->
    <div class="battle-entry" @click="goBattle">
      <span class="battle-icon">♟️</span>
      <div class="battle-text">
        <div class="battle-title">好友对战</div>
        <div class="battle-desc">和朋友实时连线，聊天开黑</div>
      </div>
      <span class="battle-arrow">›</span>
    </div>

    <!-- 游戏列表 -->
    <div class="game-list">
      <div
        v-for="game in games"
        :key="game.id"
        class="game-card"
        :style="{ background: game.bgColor }"
        @click="goToGame(game.id)"
      >
        <div class="game-icon">
          <img :src="game.icon" :alt="game.name" class="icon-image" />
        </div>
        <div class="game-info">
          <div class="game-name">{{ game.name }}</div>
          <div class="game-progress">
            <span class="progress-text">
              关卡 {{ getGameLevel(game.id) }}/{{ game.totalLevels
              }}<template v-if="getScoreText(game.id)">
                · {{ getScoreText(game.id) }}</template
              >
            </span>
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{
                  width: `${Math.min((getGameLevel(game.id) / game.totalLevels) * 100, 100)}%`,
                }"
              />
            </div>
          </div>
        </div>
        <div class="card-right">
          <div class="game-stars">
            <span
              v-for="i in 3"
              :key="i"
              class="star"
              :class="{ active: i <= getGameStars(game.id) }"
              >⭐</span
            >
          </div>
          <button class="board-btn" @click.stop="openBoard(game.id, game.name)">
            🏆 排行
          </button>
        </div>
      </div>
    </div>

    <!-- 家庭排行榜弹层 -->
    <LeaderboardModal
      :show="!!boardGame"
      :game-id="boardGame?.id || ''"
      :game-name="boardGame?.name || ''"
      @close="boardGame = null"
    />

    <!-- 每日任务 -->
    <div class="daily-task card">
      <div class="task-header">
        <span class="task-title">📋 每日任务</span>
        <span class="task-progress"
          >{{ dailyTask.completedGames }}/{{ dailyTask.taskGoal }}</span
        >
      </div>
      <div class="task-content">
        <span class="task-desc"
          >今天完成 {{ dailyTask.taskGoal }} 个不同的游戏</span
        >
        <div class="task-reward">
          <template v-if="dailyTask.claimed">
            <span class="reward-claimed">✅ 已完成</span>
          </template>
          <template v-else>
            <span>奖励: </span>
            <span class="reward-num">+{{ dailyTask.rewardStars }} ⭐</span>
          </template>
        </div>
      </div>
      <!-- 智能引导：任务未完成时，直接跳到今天还没玩过的游戏 -->
      <button
        v-if="!dailyTask.claimed && nextTaskGame"
        class="task-go-btn"
        @click="goToGame(nextTaskGame.id)"
      >
        ▶ 去玩「{{ nextTaskGame.name }}」
      </button>
    </div>

    <!-- 意见反馈入口 -->
    <button class="feedback-entry" @click="goFeedback">💬 意见反馈</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/store/user";
import { useGameStore } from "@/store/game";
import { getUserInfo } from "@/api/user";
import { getAllProgress, getDailyTask, type DailyTaskInfo } from "@/api/game";
import { soundManager } from "@/utils/sound";
import { formatScore } from "@/utils/gameMeta";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import LeaderboardModal from "@/components/LeaderboardModal.vue";
import iconMemorySvg from "@/static/images/games/lobby/icon-memory.svg";
import iconFruitSvg from "@/static/images/games/lobby/icon-fruit.svg";
import iconPuzzleSvg from "@/static/images/games/lobby/icon-puzzle.svg";
import iconBalloonSvg from "@/static/images/games/lobby/icon-balloon.svg";
import iconTankSvg from "@/static/images/games/lobby/icon-tank.svg";
import iconMoleSvg from "@/static/images/games/lobby/icon-mole.svg";
import iconSimonSvg from "@/static/images/games/lobby/icon-simon.svg";
import iconMathSvg from "@/static/images/games/lobby/icon-math.svg";
import iconMatchSvg from "@/static/images/games/lobby/icon-match.svg";
import iconMatch3Svg from "@/static/images/games/lobby/icon-match3.svg";
import iconBrickSvg from "@/static/images/games/lobby/icon-brick.svg";

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
  },
);

const games = [
  {
    id: "memory",
    name: "记忆翻牌",
    totalLevels: 20,
    icon: iconMemorySvg,
    bgColor: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  {
    id: "fruit",
    name: "接水果",
    totalLevels: 30,
    icon: iconFruitSvg,
    bgColor: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  },
  {
    id: "puzzle",
    name: "拼图游戏",
    totalLevels: 25,
    icon: iconPuzzleSvg,
    bgColor: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  },
  {
    id: "balloon",
    name: "打气球",
    totalLevels: 30,
    icon: iconBalloonSvg,
    bgColor: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  },
  {
    id: "tank",
    name: "坦克大战",
    totalLevels: 25,
    icon: iconTankSvg,
    bgColor: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  },
  {
    id: "mole",
    name: "打地鼠",
    totalLevels: 20,
    icon: iconMoleSvg,
    bgColor: "linear-gradient(135deg, #a8e063 0%, #56ab2f 100%)",
  },
  {
    id: "simon",
    name: "音乐记忆",
    totalLevels: 15,
    icon: iconSimonSvg,
    bgColor: "linear-gradient(135deg, #1a1a2e 0%, #5f27cd 100%)",
  },
  {
    id: "math",
    name: "数学小怪兽",
    totalLevels: 20,
    icon: iconMathSvg,
    bgColor: "linear-gradient(135deg, #43C59E 0%, #2d9d7a 100%)",
  },
  {
    id: "match",
    name: "快乐连线",
    totalLevels: 20,
    icon: iconMatchSvg,
    bgColor: "linear-gradient(135deg, #a18cd1 0%, #7c3aed 100%)",
  },
  {
    id: "match3",
    name: "消消乐",
    totalLevels: 20,
    icon: iconMatch3Svg,
    bgColor: "linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)",
  },
  {
    id: "brick",
    name: "打砖块",
    totalLevels: 20,
    icon: iconBrickSvg,
    bgColor: "linear-gradient(135deg, #4D96FF 0%, #6BCB77 100%)",
  },
];

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
  if (!highScore) return "";
  return formatScore(gameId, highScore);
};

const goToProfiles = () => {
  soundManager.playClick();
  router.push("/profile");
};

const goToGame = (gameId: string) => {
  soundManager.playClick();
  router.push(`/${gameId}`);
};

const goFeedback = () => {
  soundManager.playClick();
  router.push("/feedback");
};

const showSettings = ref(false);
const volume = ref(0.6);
const onVolumeInput = (e: Event) => {
  volume.value = Number((e.target as HTMLInputElement).value) / 100;
  soundManager.setVolume(volume.value);
};
const testSound = () => soundManager.playSuccess();

// 主题切换（夜间/日间/跟随系统）
import { getThemeChoice, setTheme, type ThemeChoice } from "@/utils/theme";
const themeChoice = ref<ThemeChoice>(getThemeChoice());
const THEME_OPTIONS = [
  { value: "auto" as ThemeChoice, label: "跟随系统" },
  { value: "light" as ThemeChoice, label: "日间" },
  { value: "dark" as ThemeChoice, label: "夜间" },
];
const pickTheme = (v: ThemeChoice) => {
  themeChoice.value = v;
  setTheme(v);
};

const goBattle = () => {
  soundManager.playClick();
  router.push("/battle");
};

onMounted(async () => {
  soundManager.init();
  volume.value = soundManager.getVolume();
  // 路由守卫保证进入首页前已有角色；这里刷新星星/等级快照
  try {
    await getUserInfo();
  } catch (e: any) {
    // 401/404 = 凭证失效或角色已不存在（如还原数据库），清掉坏档案引导重选
    const status = e?.response?.status;
    if (status === 401 || status === 404) {
      userStore.logout();
      router.replace("/profiles");
      return;
    }
    console.log("刷新用户信息失败", e);
  }
  try {
    await getAllProgress();
  } catch (e) {
    console.log("获取进度失败", e);
  }
  try {
    dailyTask.value = await getDailyTask();
  } catch (e) {
    console.log("获取每日任务失败", e);
  }
});
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #ffe5e5 0%, #f5f5f5 100%);
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: #fff;
  border-radius: 16px;
  margin-bottom: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
}

.user-info {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  margin-right: 12px;
}

.user-details {
  display: flex;
  flex-direction: column;
}

.nickname {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.level-badge {
  background: linear-gradient(135deg, #ffe66d 0%, #ffb347 100%);
  padding: 2px 10px;
  border-radius: 10px;
  margin-top: 4px;
}

.level-text {
  font-size: 11px;
  color: #fff;
  font-weight: bold;
}

.star-count {
  display: flex;
  align-items: center;
  background: #fff9e6;
  padding: 8px 16px;
  border-radius: 16px;
}

.star-count.pulse {
  animation: pulse 0.3s ease;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
}

.star-icon {
  font-size: 20px;
  margin-right: 6px;
}

.star-num {
  font-size: 18px;
  font-weight: bold;
  color: #ffb347;
}

.game-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 20px;
}

.game-card {
  display: flex;
  align-items: center;
  padding: 20px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  animation: slideInUp 0.5s ease backwards;
}

.game-card:nth-child(1) {
  animation-delay: 0.1s;
}
.game-card:nth-child(2) {
  animation-delay: 0.2s;
}
.game-card:nth-child(3) {
  animation-delay: 0.3s;
}
.game-card:nth-child(4) {
  animation-delay: 0.4s;
}
.game-card:nth-child(5) {
  animation-delay: 0.5s;
}

.game-card:hover,
.game-card:active {
  transform: scale(1.03);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

@keyframes slideInUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.game-icon {
  width: 60px;
  height: 60px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
}

.icon-image {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.game-info {
  flex: 1;
}

.game-name {
  font-size: 18px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 8px;
}

.game-progress {
  display: flex;
  align-items: center;
}

.progress-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  margin-right: 8px;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 5px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #fff;
  border-radius: 5px;
  transition: width 0.3s;
}

.game-stars {
  display: flex;
  gap: 2px;
}

.card-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.board-btn {
  border: none;
  background: rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 11px;
  font-weight: bold;
  padding: 4px 10px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  touch-action: manipulation;
}

.board-btn:active {
  transform: scale(0.92);
  background: rgba(255, 255, 255, 0.45);
}

.star {
  font-size: 16px;
  opacity: 0.4;
}

.star.active {
  opacity: 1;
}

.daily-task {
  background: #fff;
  padding: 20px;
  border-radius: 16px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.task-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.task-progress {
  font-size: 14px;
  color: #ff6b6b;
  font-weight: bold;
}

.task-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.task-desc {
  font-size: 14px;
  color: #666;
}

.task-go-btn {
  margin-top: 10px;
  width: 100%;
  padding: 9px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.task-go-btn:active {
  transform: scale(0.97);
}

.task-reward {
  font-size: 14px;
  color: #666;
}

.reward-num {
  color: #ffb347;
  font-weight: bold;
}

.reward-claimed {
  color: #43a047;
  font-weight: bold;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-btn {
  border: none;
  background: #fff;
  font-size: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.settings-panel {
  background: #fff;
  border-radius: 14px;
  padding: 12px 16px;
  margin-bottom: 16px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.sp-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sp-icon {
  font-size: 18px;
}

.sp-label {
  font-size: 13px;
  color: #555;
  flex-shrink: 0;
}

.sp-slider {
  flex: 1;
}

.sp-num {
  font-size: 12px;
  color: #667eea;
  width: 38px;
  text-align: right;
}

.sp-test {
  margin-top: 8px;
  border: 1px solid #e3e8ef;
  background: #fafbfc;
  color: #666;
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 10px;
  cursor: pointer;
}

.theme-chips {
  display: flex;
  gap: 6px;
  flex: 1;
}

.theme-chip {
  border: 2px solid #e3e8ef;
  background: #fafbfc;
  color: #666;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 12px;
  cursor: pointer;
}

.theme-chip.picked {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.08);
  color: #667eea;
  font-weight: 600;
}

.sp-tip {
  margin-top: 6px;
  font-size: 11px;
  color: #b3bac4;
}

.battle-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: linear-gradient(135deg, #1a1a2e 0%, #5f27cd 100%);
  border-radius: 16px;
  margin-bottom: 16px;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(95, 39, 205, 0.35);
}

.battle-icon {
  font-size: 28px;
}

.battle-text {
  flex: 1;
}

.battle-title {
  font-size: 16px;
  font-weight: bold;
  color: #fff;
}

.battle-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 2px;
}

.battle-arrow {
  font-size: 22px;
  color: rgba(255, 255, 255, 0.6);
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
