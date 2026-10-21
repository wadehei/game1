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
    <CareerSection :career="career" />

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
    <ProfilePinSection ref="profilePinRef" :avatar="userInfo?.avatar || ''" />

    <!-- 设置 -->
    <SettingsSection
      @feedback="goFeedback"
      @parent-center="openParentGate"
      @logout="handleLogout"
    />

    <!-- 家长中心组件 -->
    <ParentCenter ref="parentCenterRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/store/user";
import { getAchievements, type AchievementInfo } from "@/api/game";
import { getMyCareer, type MyCareer } from "@/api/user";
import { confirmAction } from "@/utils/confirmBus";
import CareerSection from "./components/CareerSection.vue";
import ProfilePinSection from "./components/ProfilePinSection.vue";
import SettingsSection from "./components/SettingsSection.vue";
import ParentCenter from "./components/ParentCenter.vue";
import PlayerAvatar from "@/components/PlayerAvatar.vue";

const router = useRouter();
const userStore = useUserStore();

const userInfo = computed(() => userStore.userInfo);
const totalGamesPlayed = ref(0);
const achievements = ref<AchievementInfo[]>([]);
const achievementCount = computed(
  () => achievements.value.filter((a) => a.unlocked).length,
);

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

// ─── 我的生涯 ────────────────────────────────
const career = ref<MyCareer | null>(null);

// ─── 组件引用 ────────────────────────────────
const profilePinRef = ref<InstanceType<typeof ProfilePinSection> | null>(null);
const parentCenterRef = ref<InstanceType<typeof ParentCenter> | null>(null);

// ─── 事件处理 ────────────────────────────────
const goFeedback = () => {
  router.push("/feedback");
};

const openParentGate = () => {
  parentCenterRef.value?.openGate();
};

const handleLogout = async () => {
  const ok = await confirmAction({
    title: "退出登录？",
    detail: "返回选角页，进度不会丢失。",
    confirmText: "退出",
  });
  if (!ok) return;
  userStore.logout();
  router.push("/profiles");
};

onMounted(async () => {
  try {
    achievements.value = await getAchievements();
  } catch {
    // 获取成就失败，保持默认空数组
  }
  try {
    career.value = await getMyCareer();
  } catch {
    // 获取生涯失败，保持默认
  }
  // 初始口令状态：探测一次（输错也算错，用设置接口无法探测——改由成员列表接口无此信息，
  // 这里用 profiles 公开列表查询自己是否带锁）
  try {
    const profiles = await fetch("/api/user/profiles").then((r) => r.json());
    const me = (
      (profiles.data || []) as { id: number; hasPin?: boolean }[]
    ).find((p) => p.id === userStore.userInfo?.id);
    if (profilePinRef.value) {
      profilePinRef.value.hasPin = !!me?.hasPin;
    }
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
