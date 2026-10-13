<template>
  <div class="user-page">
    <!-- 用户信息卡片 -->
    <div class="user-card">
      <img class="avatar" :src="userInfo?.avatar || defaultAvatar" alt="avatar" />
      <div class="user-details">
        <div class="nickname">{{ userInfo?.nickname || '未登录' }}</div>
        <div class="level-info">
          <div class="level-badge">
            <span class="level-text">Lv.{{ userInfo?.level || 1 }}</span>
          </div>
          <div class="exp-bar">
            <div class="exp-fill" :style="{ width: `${expProgress}%` }" />
          </div>
          <span class="exp-text">{{ currentExp }}/{{ nextLevelExp }} 经验</span>
        </div>
      </div>
    </div>

    <!-- 统计数据 -->
    <div class="stats-card card">
      <div class="stat-item">
        <div class="stat-num">{{ userInfo?.totalStars || 0 }}</div>
        <div class="stat-label">⭐ 总星星</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">{{ totalGamesPlayed }}</div>
        <div class="stat-label">🎮 游戏次数</div>
      </div>
      <div class="stat-item">
        <div class="stat-num">{{ achievementCount }}</div>
        <div class="stat-label">🏆 成就</div>
      </div>
    </div>

    <!-- 游戏进度 -->
    <div class="progress-section card">
      <div class="section-title">🎮 游戏进度</div>
      <div class="progress-list">
        <div v-for="game in games" :key="game.id" class="progress-item">
          <div class="progress-header">
            <span class="game-icon">{{ game.icon }}</span>
            <span class="game-name">{{ game.name }}</span>
            <span class="game-level">关卡 {{ getGameLevel(game.id) }}/{{ game.totalLevels }}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${Math.min((getGameLevel(game.id) / game.totalLevels) * 100, 100)}%` }" />
          </div>
        </div>
      </div>
    </div>

    <!-- 成就展示 -->
    <div class="achievement-section card">
      <div class="section-title">🏆 成就徽章</div>
      <div class="achievement-list">
        <div v-for="ach in achievements" :key="ach.id" class="achievement-item" :class="{ locked: !ach.unlocked }">
          <div class="ach-icon-wrapper">
            <span class="ach-icon">{{ ach.icon }}</span>
          </div>
          <span class="ach-name">{{ ach.name }}</span>
        </div>
      </div>
    </div>

    <!-- 设置 -->
    <div class="settings-section card">
      <div class="setting-item" @click="openParentGate">
        <span class="setting-icon">👪</span>
        <span class="setting-text">家长中心</span>
        <span class="setting-arrow">›</span>
      </div>
      <div class="setting-item" @click="handleLogout">
        <span class="setting-icon">🚪</span>
        <span class="setting-text">退出登录</span>
        <span class="setting-arrow">›</span>
      </div>
    </div>

    <!-- 家长验证弹层 -->
    <div v-if="showParentGate" class="parent-overlay" @click.self="closeParentGate">
      <div class="parent-content">
        <div class="parent-title">🔐 家长验证</div>
        <div class="parent-question">{{ gateQuestion.a }} + {{ gateQuestion.b }} = ?</div>
        <input
          v-model="gateAnswer"
          class="parent-input"
          type="number"
          inputmode="numeric"
          placeholder="请输入答案"
        />
        <div v-if="gateError" class="parent-error">答案不对，再试试～</div>
        <div class="parent-btns">
          <button class="p-btn-cancel" @click="closeParentGate">取消</button>
          <button class="p-btn-confirm" @click="confirmGate">确认</button>
        </div>
      </div>
    </div>

    <!-- 家长中心面板 -->
    <div v-if="showParentPanel" class="parent-overlay" @click.self="showParentPanel = false">
      <div class="parent-content">
        <div class="parent-title">👪 家长中心</div>
        <div class="panel-row">
          <span class="panel-label">今日已玩</span>
          <strong class="panel-value">{{ todayMinutes }} 分钟</strong>
          <button class="mini-btn" @click="resetPlayTime">清零</button>
        </div>
        <div class="panel-col">
          <span class="panel-label">护眼提醒间隔（连续游玩后休息 20 秒）</span>
          <div class="interval-chips">
            <button
              v-for="opt in intervalOptions"
              :key="opt.value"
              class="chip"
              :class="{ active: restInterval === opt.value }"
              @click="saveInterval(opt.value)"
            >{{ opt.label }}</button>
          </div>
        </div>
        <button class="p-btn-confirm full" @click="showParentPanel = false">完成</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/store/user';
import { useGameStore } from '@/store/game';
import { getAchievements, type AchievementInfo } from '@/api/game';
import { getRestIntervalMinutes, getTodayPlaySeconds, resetTodayPlayTime } from '@/composables/usePlayTimeGuard';
import defaultAvatar from '@/static/images/avatar.svg';

const router = useRouter();
const userStore = useUserStore();
const gameStore = useGameStore();

const userInfo = computed(() => userStore.userInfo);
const totalGamesPlayed = ref(0);
const achievementCount = computed(() => achievements.value.filter((a) => a.unlocked).length);

const games = [
  { id: 'memory', name: '记忆翻牌', totalLevels: 20, icon: '🧠' },
  { id: 'fruit', name: '接水果', totalLevels: 30, icon: '🍎' },
  { id: 'puzzle', name: '拼图游戏', totalLevels: 25, icon: '🧩' },
  { id: 'balloon', name: '打气球', totalLevels: 30, icon: '🎈' },
  { id: 'tank', name: '坦克大战', totalLevels: 25, icon: '🚀' },
  { id: 'mole', name: '打地鼠', totalLevels: 20, icon: '🐹' },
  { id: 'simon', name: '音乐记忆', totalLevels: 15, icon: '🎵' },
  { id: 'math', name: '数学小怪兽', totalLevels: 20, icon: '👾' },
];

const achievements = ref<AchievementInfo[]>([]);

// 等级经验：与后端一致，每 15 颗星升一级
const LEVEL_STAR_THRESHOLD = 15;

const currentExp = computed(() => {
  const stars = userInfo.value?.totalStars || 0;
  return stars % LEVEL_STAR_THRESHOLD;
});

const nextLevelExp = LEVEL_STAR_THRESHOLD;

const expProgress = computed(() => {
  return (currentExp.value / nextLevelExp) * 100;
});

const getGameLevel = (gameId: string): number => {
  const progress = gameStore.getProgress(gameId);
  return progress?.currentLevel || 1;
};

const handleLogout = () => {
  if (confirm('确定要退出登录吗？')) {
    userStore.logout();
    alert('已退出登录');
    router.push('/');
  }
};

// ─── 家长中心 ────────────────────────────
const showParentGate = ref(false);
const showParentPanel = ref(false);
const gateQuestion = ref({ a: 0, b: 0 });
const gateAnswer = ref('');
const gateError = ref(false);
const todayMinutes = ref(Math.ceil(getTodayPlaySeconds() / 60));
const restInterval = ref(getRestIntervalMinutes());
const intervalOptions = [
  { value: 15, label: '15 分钟' },
  { value: 20, label: '20 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 0, label: '关闭' },
];

const openParentGate = () => {
  gateQuestion.value = {
    a: 12 + Math.floor(Math.random() * 18),
    b: 12 + Math.floor(Math.random() * 18),
  };
  gateAnswer.value = '';
  gateError.value = false;
  showParentGate.value = true;
};

const closeParentGate = () => {
  showParentGate.value = false;
};

const confirmGate = () => {
  if (parseInt(gateAnswer.value, 10) === gateQuestion.value.a + gateQuestion.value.b) {
    showParentGate.value = false;
    todayMinutes.value = Math.ceil(getTodayPlaySeconds() / 60);
    restInterval.value = getRestIntervalMinutes();
    showParentPanel.value = true;
  } else {
    gateError.value = true;
  }
};

const resetPlayTime = () => {
  resetTodayPlayTime();
  todayMinutes.value = 0;
};

const saveInterval = (value: number) => {
  restInterval.value = value;
  try {
    localStorage.setItem('parent_rest_interval', String(value));
  } catch {
    // ignore
  }
};

onMounted(async () => {
  try {
    achievements.value = await getAchievements();
  } catch (e) {
    console.log('获取成就失败', e);
  }
});
</script>

<style scoped>
.user-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f5f7fa 0%, #e8ecf1 100%);
  padding: 20px;
  max-width: 500px;
  margin: 0 auto;
}

/* 用户卡片 */
.user-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 20px;
  padding: 24px;
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
  position: relative;
  overflow: hidden;
}

.user-card::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 200px;
  height: 200px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
}

.avatar {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.5);
  margin-right: 16px;
  object-fit: cover;
  z-index: 1;
}

.user-details {
  flex: 1;
  z-index: 1;
}

.nickname {
  font-size: 22px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 10px;
}

.level-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.level-badge {
  background: rgba(255, 255, 255, 0.25);
  padding: 4px 12px;
  border-radius: 12px;
  backdrop-filter: blur(10px);
}

.level-text {
  font-size: 13px;
  color: #fff;
  font-weight: bold;
}

.exp-bar {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  overflow: hidden;
}

.exp-fill {
  height: 100%;
  background: linear-gradient(90deg, #FFE66D 0%, #FFB347 100%);
  border-radius: 10px;
  transition: width 0.3s ease;
}

.exp-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
}

/* 统计卡片 */
.stats-card {
  display: flex;
  justify-content: space-around;
  background: #fff;
  padding: 20px;
  border-radius: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-num {
  font-size: 28px;
  font-weight: bold;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.stat-label {
  font-size: 13px;
  color: #666;
  margin-top: 6px;
}

/* 通用卡片样式 */
.card {
  background: #fff;
  padding: 20px;
  border-radius: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.section-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid #f0f0f0;
}

/* 游戏进度 */
.progress-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.progress-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.game-icon {
  font-size: 22px;
}

.game-name {
  font-size: 15px;
  color: #333;
  flex: 1;
  font-weight: 500;
}

.game-level {
  font-size: 13px;
  color: #667eea;
  font-weight: bold;
}

.progress-bar {
  height: 8px;
  background: #f0f0f0;
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  border-radius: 10px;
  transition: width 0.3s ease;
}

/* 成就展示 */
.achievement-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.achievement-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 8px;
  background: linear-gradient(135deg, #f9f9f9 0%, #f0f0f0 100%);
  border-radius: 12px;
  transition: all 0.3s ease;
}

.achievement-item:not(.locked):hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
}

.achievement-item.locked {
  opacity: 0.5;
  filter: grayscale(1);
}

.ach-icon-wrapper {
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 50%;
  margin-bottom: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.ach-icon {
  font-size: 28px;
}

.ach-name {
  font-size: 12px;
  color: #666;
  text-align: center;
  font-weight: 500;
}

/* 设置 */
.settings-section {
  padding: 0;
  overflow: hidden;
}

.setting-item {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.setting-item:hover {
  background: #f9f9f9;
}

.setting-icon {
  font-size: 22px;
  margin-right: 12px;
}

.setting-text {
  font-size: 16px;
  color: #333;
  flex: 1;
}

.setting-arrow {
  font-size: 24px;
  color: #ccc;
}

/* 家长验证 / 家长中心弹层 */
.parent-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: parentFadeIn 0.25s ease;
}

@keyframes parentFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.parent-content {
  background: #fff;
  border-radius: 20px;
  padding: 28px;
  width: 90%;
  max-width: 320px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: parentBounceIn 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes parentBounceIn {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.parent-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  text-align: center;
}

.parent-question {
  font-size: 30px;
  font-weight: bold;
  color: #667eea;
  text-align: center;
  margin: 18px 0;
}

.parent-input {
  width: 100%;
  padding: 13px;
  border: 2px solid #e5e5e5;
  border-radius: 14px;
  font-size: 18px;
  text-align: center;
  outline: none;
  transition: border-color 0.2s ease;
}

.parent-input:focus {
  border-color: #667eea;
}

.parent-error {
  color: #FF6B6B;
  font-size: 13px;
  text-align: center;
  margin-top: 8px;
}

.parent-btns {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.p-btn-cancel,
.p-btn-confirm {
  flex: 1;
  padding: 13px;
  border-radius: 18px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
}

.p-btn-cancel {
  background: #f0f0f0;
  color: #666;
}

.p-btn-confirm {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.p-btn-confirm.full {
  width: 100%;
  margin-top: 20px;
}

.panel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px solid #f0f0f0;
}

.panel-label {
  font-size: 14px;
  color: #666;
  flex: 1;
}

.panel-value {
  font-size: 16px;
  color: #333;
}

.mini-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 12px;
  background: #f0f0f0;
  color: #666;
  font-size: 13px;
  cursor: pointer;
}

.panel-col {
  padding: 14px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.interval-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  padding: 8px 16px;
  border-radius: 16px;
  border: 2px solid #e5e5e5;
  background: #fff;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip.active {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
  font-weight: bold;
}

/* 响应式 */
@media (max-width: 375px) {
  .user-page {
    padding: 16px;
  }

  .achievement-list {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
