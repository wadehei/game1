<template>
  <div class="user-page">
    <!-- 用户信息卡片 -->
    <div class="user-card">
      <PlayerAvatar :avatar="userInfo?.avatar" :size="70" />
      <div class="user-details">
        <div class="nickname">{{ userInfo?.nickname || "未登录" }}</div>
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

    <!-- 我的生涯 -->
    <div class="career-section card">
      <div class="section-title">🏁 我的生涯</div>

      <!-- 最近 7 天游玩趋势 -->
      <div v-if="career && trendMax > 0" class="trend-block">
        <div class="trend-title">📈 最近 7 天</div>
        <div class="trend-bars">
          <div
            v-for="d in career.last7"
            :key="d.date"
            class="trend-col"
            :title="`${d.label} ${Math.round(d.seconds / 60)} 分钟`"
          >
            <div class="trend-bar-wrap">
              <div
                class="trend-bar"
                :style="{ height: trendBarHeight(d.seconds) }"
              />
            </div>
            <span class="trend-label">{{ d.label }}</span>
          </div>
        </div>
      </div>

      <!-- 生涯总览 -->
      <div v-if="career" class="career-overview">
        <div class="ov-item">
          <div class="ov-num">{{ joinedDays }}</div>
          <div class="ov-label">加入天数</div>
        </div>
        <div class="ov-item">
          <div class="ov-num">{{ playTimeText }}</div>
          <div class="ov-label">累计{{ career.totals.playDays }} 天</div>
        </div>
        <div class="ov-item">
          <div class="ov-num">{{ career.totals.playCount }}</div>
          <div class="ov-label">总局数</div>
        </div>
        <div class="ov-item">
          <div class="ov-num">{{ winRateText }}</div>
          <div class="ov-label">通关率</div>
        </div>
        <div class="ov-item">
          <div class="ov-num">{{ career.totals.achievementCount }}</div>
          <div class="ov-label">成就</div>
        </div>
        <div class="ov-item">
          <div class="ov-num">+{{ career.totals.rewardStars }}</div>
          <div class="ov-label">任务奖励⭐</div>
        </div>
      </div>

      <!-- 各游戏生涯 -->
      <div v-if="career && career.games.length" class="career-list">
        <div v-for="g in career.games" :key="g.gameId" class="career-row">
          <span class="game-icon">{{ gameIcon(g.gameId) }}</span>
          <div class="career-main">
            <div class="career-line1">
              <span class="game-name">{{ gameName(g.gameId) }}</span>
              <span class="career-record">{{ recordText(g) }}</span>
            </div>
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{
                  width: `${Math.min((g.currentLevel / gameTotal(g.gameId)) * 100, 100)}%`,
                }"
              />
            </div>
            <div class="career-line2">
              关卡 {{ g.currentLevel }}/{{ gameTotal(g.gameId) }} · ⭐{{
                g.stars
              }}
              <template v-if="g.playCount > 0">
                · {{ g.winCount }}胜/{{ g.playCount }}局{{
                  g.playCount > 0
                    ? `（${Math.round((g.winCount / g.playCount) * 100)}%）`
                    : ""
                }}</template
              >
              <template v-if="g.lastPlayedAt">
                · {{ timeAgo(g.lastPlayedAt) }}</template
              >
            </div>
          </div>
        </div>
      </div>
      <div v-else class="career-empty">
        还没开始冒险，去玩一局点亮生涯吧！🚀
      </div>
    </div>

    <!-- 成就展示 -->

    <!-- 成就展示 -->
    <div class="achievement-section card">
      <div class="section-title">🏆 成就徽章</div>
      <div class="achievement-list">
        <div
          v-for="ach in achievements"
          :key="ach.id"
          class="achievement-item"
          :class="{ locked: !ach.unlocked }"
        >
          <div class="ach-icon-wrapper">
            <span class="ach-icon">{{ ach.icon }}</span>
          </div>
          <span class="ach-name">{{ ach.name }}</span>
        </div>
      </div>
    </div>

    <!-- 我的资料 + 角色口令 -->
    <div class="profile-edit card">
      <div
        class="profile-entry"
        @click="$router.push('/profile')"
      >
        <PlayerAvatar :avatar="userInfo?.avatar" :size="52" />
        <div class="pe-main">
          <div class="pe-title">👤 个人中心</div>
          <div class="pe-desc">头像 · 昵称 · 头像历史</div>
        </div>
        <span class="pe-arrow">›</span>
      </div>

      <div class="section-title pin-title">🔑 角色口令</div>
      <div class="pin-desc">
        设置 4
        位数字口令后，切换这个角色需要先输口令，别人就不能随便玩你的档案啦。
      </div>
      <div class="pin-status">
        <span :class="['pin-state', hasPin ? 'on' : '']">{{
          hasPin ? "🔒 已设置口令" : "🔓 未设置"
        }}</span>
      </div>
      <template v-if="hasPin">
        <input
          v-model="pinOld"
          class="pin-input"
          type="password"
          inputmode="numeric"
          maxlength="4"
          placeholder="当前口令"
        />
        <input
          v-model="pinNew"
          class="pin-input"
          type="password"
          inputmode="numeric"
          maxlength="4"
          placeholder="新口令（4 位数字，留空=清除）"
        />
      </template>
      <template v-else>
        <input
          v-model="pinNew"
          class="pin-input"
          type="password"
          inputmode="numeric"
          maxlength="4"
          placeholder="设置 4 位数字口令"
        />
      </template>
      <button
        class="save-profile-btn pin-btn"
        :disabled="savingPin"
        @click="savePin"
      >
        {{ savingPin ? "处理中…" : hasPin ? "修改 / 清除口令" : "设置口令" }}
      </button>
      <div v-if="pinMsg" class="pin-msg" :class="{ err: pinIsErr }">
        {{ pinMsg }}
      </div>
    </div>

    <!-- 设置 -->
    <div class="settings-section card">
      <div class="setting-item" @click="goFeedback">
        <span class="setting-icon">💬</span>
        <span class="setting-text">意见反馈</span>
        <span class="setting-arrow">›</span>
      </div>
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
    <div
      v-if="showParentGate"
      class="parent-overlay"
      @click.self="closeParentGate"
    >
      <div class="parent-content">
        <div class="parent-title">🔐 家长验证</div>
        <div class="parent-question">
          {{ gateQuestion.a }} + {{ gateQuestion.b }} = ?
        </div>
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
    <div
      v-if="showParentPanel"
      class="parent-overlay"
      @click.self="showParentPanel = false"
    >
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
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <button class="p-btn-confirm full" @click="showParentPanel = false">
          完成
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/store/user";
import { useGameStore } from "@/store/game";
import { getAchievements, type AchievementInfo } from "@/api/game";
import {
  updateUserInfo,
  updateMyPin,
  getMyCareer,
  type MyCareer,
  type CareerGame,
} from "@/api/user";
import { uploadPhotoAvatar } from "@/utils/avatarUpload";
import { soundManager } from "@/utils/sound";
import { getGameMeta, formatScore } from "@/utils/gameMeta";
import {
  getRestIntervalMinutes,
  getTodayPlaySeconds,
  resetTodayPlayTime,
} from "@/composables/usePlayTimeGuard";
import PlayerAvatar from "@/components/PlayerAvatar.vue";

const router = useRouter();
const userStore = useUserStore();
const gameStore = useGameStore();

const userInfo = computed(() => userStore.userInfo);
const totalGamesPlayed = ref(0);
const achievementCount = computed(
  () => achievements.value.filter((a) => a.unlocked).length,
);

const games = [
  { id: "memory", name: "记忆翻牌", totalLevels: 20, icon: "🧠" },
  { id: "fruit", name: "接水果", totalLevels: 30, icon: "🍎" },
  { id: "puzzle", name: "拼图游戏", totalLevels: 25, icon: "🧩" },
  { id: "balloon", name: "打气球", totalLevels: 30, icon: "🎈" },
  { id: "tank", name: "坦克大战", totalLevels: 25, icon: "🚀" },
  { id: "mole", name: "打地鼠", totalLevels: 20, icon: "🐹" },
  { id: "simon", name: "音乐记忆", totalLevels: 15, icon: "🎵" },
  { id: "math", name: "数学小怪兽", totalLevels: 20, icon: "👾" },
];

const achievements = ref<AchievementInfo[]>([]);

const goFeedback = () => {
  router.push('/feedback');
};

// ─── 我的生涯 ────────────────────────────────
const career = ref<MyCareer | null>(null);

const joinedDays = computed(() => {
  if (!career.value?.user.joinedAt) return "-";
  return Math.max(
    1,
    Math.ceil(
      (Date.now() - new Date(career.value.user.joinedAt).getTime()) / 86400000,
    ),
  );
});

const playTimeText = computed(() => {
  const s = career.value?.totals.playSeconds || 0;
  if (s < 60) return `${s}秒`;
  if (s < 3600) return `${Math.floor(s / 60)}分`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h}时${m}分` : `${h}时`;
});

const winRateText = computed(() => {
  const t = career.value?.totals;
  if (!t || t.playCount === 0) return "-";
  return `${Math.round((t.winCount / t.playCount) * 100)}%`;
});

const trendMax = computed(() =>
  Math.max(...(career.value?.last7?.map((d) => d.seconds) || [0]), 1),
);
const trendBarHeight = (seconds: number): string => {
  const pct = Math.max((seconds / trendMax.value) * 100, 4);
  return `${pct}%`;
};

const gameName = (id: string): string => getGameMeta(id)?.name || id;
const gameIcon = (id: string): string =>
  games.find((g) => g.id === id)?.icon || "🎮";
const gameTotal = (id: string): number => getGameMeta(id)?.totalLevels || 20;

const recordText = (g: CareerGame): string => {
  if (!g.highScore) return "";
  return formatScore(g.gameId, g.highScore);
};

const timeAgo = (iso: string): string => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min}分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}天前` : `${Math.floor(d / 30)}个月前`;
};

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
  if (confirm("确定要退出登录吗？")) {
    userStore.logout();
    router.push("/profiles");
  }
};

// ─── 我的资料 + 角色口令 ────────────────────────────────
const AVATARS = [
  "🐰",
  "🐻",
  "🐼",
  "🦊",
  "🐸",
  "🐵",
  "🐯",
  "🦁",
  "🐷",
  "🐨",
  "👑",
  "🦄",
  "🌟",
  "🌸",
];
const editNickname = ref(userInfo.value?.nickname || "");
const editAvatar = ref(userInfo.value?.avatar || "😊");
const savingProfile = ref(false);
const uploadTip = ref("");
const isPhotoAvatar = computed(() => /^\//.test(editAvatar.value));

const onPhotoPick = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploadTip.value = "照片上传中…";
  try {
    editAvatar.value = await uploadPhotoAvatar(file);
    uploadTip.value = "照片已上传，记得点「保存资料」生效";
  } catch (e) {
    uploadTip.value = "上传失败，请换张图片试试";
  } finally {
    input.value = "";
    setTimeout(() => {
      uploadTip.value = "";
    }, 4000);
  }
};

const saveProfile = async () => {
  if (!editNickname.value.trim() || savingProfile.value) return;
  savingProfile.value = true;
  try {
    await updateUserInfo({
      nickname: editNickname.value.trim(),
      avatar: editAvatar.value,
    });
    if (userInfo.value) {
      userStore.setUserInfo({
        ...userInfo.value,
        nickname: editNickname.value.trim(),
        avatar: editAvatar.value,
      });
    }
  } catch {
    // 保存失败静默（下次进入重取）
  } finally {
    savingProfile.value = false;
  }
};

const hasPin = ref(false);
const volume = ref(soundManager.getVolume());

const onVolumeChange = (event: Event) => {
  // 滑杆 0~100 → 音量 0~1
  const v = parseFloat((event.target as HTMLInputElement).value) / 100;
  volume.value = v;
  soundManager.setVolume(v);
  soundManager.playClick();
};
const pinOld = ref("");
const pinNew = ref("");
const savingPin = ref(false);
const pinMsg = ref("");
const pinIsErr = ref(false);

const flashPin = (text: string, isErr = false) => {
  pinMsg.value = text;
  pinIsErr.value = isErr;
  setTimeout(() => {
    pinMsg.value = "";
  }, 3000);
};

const savePin = async () => {
  if (savingPin.value) return;
  if (hasPin.value && !/^\d{4}$/.test(pinOld.value)) {
    flashPin("请先输入当前口令（4 位数字）", true);
    return;
  }
  if (pinNew.value && !/^\d{4}$/.test(pinNew.value)) {
    flashPin("新口令需为 4 位数字", true);
    return;
  }
  savingPin.value = true;
  try {
    const result = await updateMyPin({
      oldPin: pinOld.value || undefined,
      newPin: pinNew.value,
    });
    hasPin.value = result.hasPin;
    pinOld.value = "";
    pinNew.value = "";
    flashPin(result.hasPin ? "口令已设置 🔒" : "口令已清除 🔓");
  } catch (e: any) {
    flashPin(e?.message || "操作失败，请重试", true);
  } finally {
    savingPin.value = false;
  }
};

// ─── 家长中心 ────────────────────────────
const showParentGate = ref(false);
const showParentPanel = ref(false);
const gateQuestion = ref({ a: 0, b: 0 });
const gateAnswer = ref("");
const gateError = ref(false);
const todayMinutes = ref(Math.ceil(getTodayPlaySeconds() / 60));
const restInterval = ref(getRestIntervalMinutes());
const intervalOptions = [
  { value: 15, label: "15 分钟" },
  { value: 20, label: "20 分钟" },
  { value: 30, label: "30 分钟" },
  { value: 0, label: "关闭" },
];

const openParentGate = () => {
  gateQuestion.value = {
    a: 12 + Math.floor(Math.random() * 18),
    b: 12 + Math.floor(Math.random() * 18),
  };
  gateAnswer.value = "";
  gateError.value = false;
  showParentGate.value = true;
};

const closeParentGate = () => {
  showParentGate.value = false;
};

const confirmGate = () => {
  if (
    parseInt(gateAnswer.value, 10) ===
    gateQuestion.value.a + gateQuestion.value.b
  ) {
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
    localStorage.setItem("parent_rest_interval", String(value));
  } catch {
    // ignore
  }
};

onMounted(async () => {
  try {
    achievements.value = await getAchievements();
  } catch (e) {
    console.log("获取成就失败", e);
  }
  try {
    career.value = await getMyCareer();
  } catch (e) {
    console.log("获取生涯失败", e);
  }
  // 初始口令状态：探测一次（输错也算错，用设置接口无法探测——改由成员列表接口无此信息，
  // 这里用 profiles 公开列表查询自己是否带锁）
  try {
    const profiles = await fetch("/api/user/profiles").then((r) => r.json());
    const me = (
      (profiles.data || []) as { id: number; hasPin?: boolean }[]
    ).find((p) => p.id === userStore.userInfo?.id);
    hasPin.value = !!me?.hasPin;
  } catch {
    // ignore
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
  content: "";
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
  background: linear-gradient(90deg, #ffe66d 0%, #ffb347 100%);
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

/* 我的生涯 */
.trend-block {
  margin-bottom: 16px;
}

.trend-title {
  font-size: 13px;
  color: #888;
  margin-bottom: 8px;
}

.trend-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 90px;
}

.trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.trend-bar-wrap {
  flex: 1;
  width: 100%;
  max-width: 36px;
  display: flex;
  align-items: flex-end;
  background: #f4f6f9;
  border-radius: 8px;
  overflow: hidden;
}

.trend-bar {
  width: 100%;
  background: linear-gradient(180deg, #8fb4e8 0%, #5b8def 100%);
  border-radius: 8px 8px 0 0;
  min-height: 4px;
  transition: height 0.4s ease;
}

.trend-label {
  font-size: 10px;
  color: #aaa;
  margin-top: 4px;
}

.career-overview {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.ov-item {
  background: #f7f9fc;
  border-radius: 12px;
  padding: 12px 6px;
  text-align: center;
}

.ov-num {
  font-size: 20px;
  font-weight: bold;
  color: #5b6ee2;
}

.ov-label {
  font-size: 11px;
  color: #999;
  margin-top: 3px;
}

.career-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.career-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.career-main {
  flex: 1;
  min-width: 0;
}

.career-line1 {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.career-record {
  font-size: 12px;
  color: #e67e22;
  font-weight: 600;
  flex-shrink: 0;
}

.career-line2 {
  font-size: 11px;
  color: #999;
  margin-top: 4px;
}

.career-empty {
  text-align: center;
  color: #bbb;
  font-size: 13px;
  padding: 14px 0;
}

/* 我的资料 + 口令 */
.volume-slider {
  flex: 1;
  accent-color: #667eea;
}

.volume-num {
  width: 44px;
  text-align: right;
  font-size: 13px;
  color: #666;
  flex-shrink: 0;
}

.avatar-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.me-photo-btn {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 2px dashed #c9c9c9;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
}

.me-photo-btn:hover {
  border-color: #667eea;
}

.me-photo-icon {
  font-size: 20px;
}

.photo-input {
  display: none;
}

.upload-tip {
  font-size: 12px;
  color: #667eea;
  margin-top: -6px;
  margin-bottom: 8px;
}
.profile-edit {
  /* 卡片基础样式沿用 .card */
}

.edit-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.edit-label {
  width: 40px;
  font-size: 14px;
  color: #666;
  flex-shrink: 0;
}

.edit-input {
  flex: 1;
  padding: 10px 12px;
  border: 2px solid #e5e5e5;
  border-radius: 12px;
  font-size: 15px;
  outline: none;
}

.edit-input:focus {
  border-color: #667eea;
}

.edit-emojis {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.edit-emoji {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  border-radius: 10px;
  cursor: pointer;
  border: 2px solid transparent;
}

.edit-emoji.picked {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.08);
}

.save-profile-btn {
  width: 100%;
  margin-top: 4px;
  padding: 12px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.save-profile-btn:disabled {
  opacity: 0.5;
}

.pin-title {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #f0f0f0;
}

.pin-desc {
  font-size: 12px;
  color: #999;
  line-height: 1.7;
  margin-bottom: 8px;
}

.pin-status {
  margin-bottom: 8px;
}

.pin-state {
  font-size: 13px;
  color: #999;
}

.pin-state.on {
  color: #27ae60;
  font-weight: 600;
}

.pin-input {
  width: 100%;
  margin-bottom: 8px;
  padding: 11px 12px;
  border: 2px solid #e5e5e5;
  border-radius: 12px;
  font-size: 16px;
  letter-spacing: 6px;
  outline: none;
  box-sizing: border-box;
}

.pin-input:focus {
  border-color: #667eea;
}

.pin-btn {
  background: linear-gradient(135deg, #43a047 0%, #66bb6a 100%);
}

.pin-msg {
  margin-top: 10px;
  font-size: 13px;
  color: #27ae60;
}

.pin-msg.err {
  color: #e74c3c;
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
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
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
  from {
    transform: scale(0.6);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
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
  color: #ff6b6b;
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
.profile-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 4px 14px;
  border-bottom: 1px dashed #e3e8ef;
  margin-bottom: 14px;
  cursor: pointer;
}

.pe-title {
  font-size: 15px;
  font-weight: bold;
  color: #333;
}

.pe-desc {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.pe-arrow {
  margin-left: auto;
  font-size: 20px;
  color: #c3c8d0;
}

</style>
