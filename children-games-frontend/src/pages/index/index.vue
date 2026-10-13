<template>
  <div class="home-page">
    <!-- 顶部状态栏 -->
    <div class="header">
      <div class="user-info" @click="goToUser">
        <img class="avatar" :src="userInfo?.avatar || defaultAvatar" alt="avatar" />
        <div class="user-details">
          <div class="nickname">{{ userInfo?.nickname || '点击登录' }}</div>
          <div class="level-badge">
            <span class="level-text">Lv.{{ userInfo?.level || 1 }}</span>
          </div>
        </div>
      </div>
      <div class="star-count" :class="{ pulse: starPulse }">
        <span class="star-icon">⭐</span>
        <span class="star-num">{{ userInfo?.totalStars || 0 }}</span>
      </div>
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
              关卡 {{ getGameLevel(game.id) }}/{{ game.totalLevels }}<template v-if="getScoreText(game.id)"> · {{ getScoreText(game.id) }}</template>
            </span>
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: `${Math.min((getGameLevel(game.id) / game.totalLevels) * 100, 100)}%` }"
              />
            </div>
          </div>
        </div>
        <div class="game-stars">
          <span v-for="i in 3" :key="i" class="star" :class="{ active: i <= getGameStars(game.id) }">⭐</span>
        </div>
      </div>
    </div>

    <!-- 每日任务 -->
    <div class="daily-task card">
      <div class="task-header">
        <span class="task-title">📋 每日任务</span>
        <span class="task-progress">{{ dailyTask.completedGames }}/{{ dailyTask.taskGoal }}</span>
      </div>
      <div class="task-content">
        <span class="task-desc">今天完成 {{ dailyTask.taskGoal }} 个不同的游戏</span>
        <div class="task-reward">
          <template v-if="dailyTask.claimed">
            <span class="reward-claimed">✅ 已领取</span>
          </template>
          <template v-else>
            <span>奖励: </span>
            <span class="reward-num">+{{ dailyTask.rewardStars }} ⭐</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/store/user';
import { useGameStore } from '@/store/game';
import { testLogin } from '@/api/user';
import { getAllProgress, getDailyTask, type DailyTaskInfo } from '@/api/game';
import { soundManager } from '@/utils/sound';
import iconMemorySvg from '@/static/images/games/lobby/icon-memory.svg';
import iconFruitSvg from '@/static/images/games/lobby/icon-fruit.svg';
import iconPuzzleSvg from '@/static/images/games/lobby/icon-puzzle.svg';
import iconBalloonSvg from '@/static/images/games/lobby/icon-balloon.svg';
import iconTankSvg from '@/static/images/games/lobby/icon-tank.svg';
import iconMoleSvg from '@/static/images/games/lobby/icon-mole.svg';
import iconSimonSvg from '@/static/images/games/lobby/icon-simon.svg';
import iconMathSvg from '@/static/images/games/lobby/icon-math.svg';
import defaultAvatar from '@/static/images/avatar.svg';

const router = useRouter();
const userStore = useUserStore();
const gameStore = useGameStore();

const userInfo = computed(() => userStore.userInfo);
const dailyTask = ref<DailyTaskInfo>({ completedGames: 0, taskGoal: 3, rewardStars: 10, claimed: false });
const starPulse = ref(false);

// 星星数变化时触发脉冲动画
watch(() => userInfo.value?.totalStars, () => {
  starPulse.value = true;
  setTimeout(() => { starPulse.value = false; }, 350);
});

const games = [
  { id: 'memory', name: '记忆翻牌', totalLevels: 20, icon: iconMemorySvg, bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'fruit', name: '接水果', totalLevels: 30, icon: iconFruitSvg, bgColor: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  { id: 'puzzle', name: '拼图游戏', totalLevels: 25, icon: iconPuzzleSvg, bgColor: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { id: 'balloon', name: '打气球', totalLevels: 30, icon: iconBalloonSvg, bgColor: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  { id: 'tank', name: '坦克大战', totalLevels: 25, icon: iconTankSvg, bgColor: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  { id: 'mole', name: '打地鼠', totalLevels: 20, icon: iconMoleSvg, bgColor: 'linear-gradient(135deg, #a8e063 0%, #56ab2f 100%)' },
  { id: 'simon', name: '音乐记忆', totalLevels: 15, icon: iconSimonSvg, bgColor: 'linear-gradient(135deg, #1a1a2e 0%, #5f27cd 100%)' },
  { id: 'math', name: '数学小怪兽', totalLevels: 20, icon: iconMathSvg, bgColor: 'linear-gradient(135deg, #43C59E 0%, #2d9d7a 100%)' },
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

// 最高纪录文案（步数类游戏越小越好，文案区分）
const SCORE_LABELS: Record<string, string> = {
  fruit: '最高 {v} 分',
  balloon: '最高 {v} 分',
  tank: '最高 {v} 分',
  mole: '最多 {v} 只',
  simon: '最长 {v} 步',
  memory: '最快 {v} 步',
  puzzle: '最少 {v} 步',
};

const getScoreText = (gameId: string): string => {
  const progress = gameStore.getProgress(gameId);
  const highScore = progress?.highScore || 0;
  if (!highScore) return '';
  const tpl = SCORE_LABELS[gameId];
  return tpl ? tpl.replace('{v}', String(highScore)) : '';
};

const goToUser = () => {
  if (!userStore.isLoggedIn()) {
    testLogin('小朋友');
  } else {
    router.push('/user');
  }
};

const goToGame = (gameId: string) => {
  soundManager.playClick();
  router.push(`/${gameId}`);
};

onMounted(async () => {
  soundManager.init();
  if (!userStore.isLoggedIn()) {
    try {
      await testLogin('小朋友');
    } catch (e) {
      console.log('游客登录失败（离线模式）', e);
    }
  }
  try {
    await getAllProgress();
  } catch (e) {
    console.log('获取进度失败', e);
  }
  try {
    dailyTask.value = await getDailyTask();
  } catch (e) {
    console.log('获取每日任务失败', e);
  }
});
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #FFE5E5 0%, #F5F5F5 100%);
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
  background: linear-gradient(135deg, #FFE66D 0%, #FFB347 100%);
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
  background: #FFF9E6;
  padding: 8px 16px;
  border-radius: 16px;
}

.star-count.pulse {
  animation: pulse 0.3s ease;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

.star-icon {
  font-size: 20px;
  margin-right: 6px;
}

.star-num {
  font-size: 18px;
  font-weight: bold;
  color: #FFB347;
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
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  animation: slideInUp 0.5s ease backwards;
}

.game-card:nth-child(1) { animation-delay: 0.1s; }
.game-card:nth-child(2) { animation-delay: 0.2s; }
.game-card:nth-child(3) { animation-delay: 0.3s; }
.game-card:nth-child(4) { animation-delay: 0.4s; }
.game-card:nth-child(5) { animation-delay: 0.5s; }

.game-card:hover, .game-card:active {
  transform: scale(1.03);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}

@keyframes slideInUp {
  from { transform: translateY(30px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
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
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
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
  color: #FF6B6B;
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

.task-reward {
  font-size: 14px;
  color: #666;
}

.reward-num {
  color: #FFB347;
  font-weight: bold;
}

.reward-claimed {
  color: #43a047;
  font-weight: bold;
}
</style>
