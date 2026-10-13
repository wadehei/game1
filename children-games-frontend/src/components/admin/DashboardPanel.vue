<template>
  <div class="panel">
    <h2 class="panel-title">📊 数据看板</h2>

    <!-- 指标卡 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-num">{{ overview?.familyMembers ?? '-' }}</div>
        <div class="stat-label">家庭成员</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ overview?.totalStars ?? '-' }}</div>
        <div class="stat-label">家庭总星星</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ todayPlayText }}</div>
        <div class="stat-label">今日游玩时长</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">{{ overview?.todayActiveUsers ?? '-' }}</div>
        <div class="stat-label">今日活跃</div>
      </div>
    </div>

    <!-- 成员星星对比 -->
    <div class="section" v-if="overview?.members?.length">
      <h3 class="section-title">成员星星</h3>
      <div class="bar-list">
        <div v-for="m in overview.members" :key="m.id" class="bar-row">
          <span class="bar-name">{{ m.avatar }} {{ m.nickname }}</span>
          <div class="bar-track">
            <div class="bar-fill" :style="{ width: starBarWidth(m.totalStars) }" />
          </div>
          <span class="bar-value">⭐{{ m.totalStars }}</span>
        </div>
      </div>
    </div>

    <!-- 最近动态 -->
    <div class="section">
      <h3 class="section-title">最近游玩动态</h3>
      <div v-if="!overview?.activity?.length" class="empty">还没有游玩记录</div>
      <div v-for="(a, i) in overview?.activity || []" :key="i" class="activity-row">
        <PlayerAvatar :avatar="a.avatar" :size="34" />
        <span class="act-name">{{ a.nickname }}</span>
        <span class="act-desc">玩了 {{ gameMetaName(a.gameId) }} 第 {{ a.currentLevel }} 关</span>
        <span class="act-time">{{ timeAgo(a.updatedAt) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getOverview, type Overview } from '@/api/admin';
import { getGameMeta } from '@/utils/gameMeta';
import PlayerAvatar from '@/components/PlayerAvatar.vue';

const overview = ref<Overview | null>(null);

const todayPlayText = computed(() => {
  const s = overview.value?.todayPlaySeconds || 0;
  return s >= 60 ? `${Math.round(s / 60)} 分` : `${s} 秒`;
});

const starBarWidth = (stars: number): string => {
  const max = Math.max(...(overview.value?.members.map((m) => m.totalStars) || [1]), 1);
  return `${Math.max((stars / max) * 100, 4)}%`;
};

const gameMetaName = (id: string): string => getGameMeta(id)?.name || id;

const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
};

onMounted(async () => {
  overview.value = await getOverview().catch(() => null);
});
</script>

<style scoped>
.panel-title {
  font-size: 19px;
  margin: 0 0 16px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
}

.stat-card {
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.stat-num {
  font-size: 26px;
  font-weight: bold;
  color: #2c3e50;
}

.stat-label {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.section {
  margin-top: 20px;
  background: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.section-title {
  font-size: 15px;
  margin: 0 0 12px;
}

.bar-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bar-name {
  width: 90px;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-track {
  flex: 1;
  height: 12px;
  background: #eef1f4;
  border-radius: 6px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #f6d365 0%, #fda085 100%);
  border-radius: 6px;
  transition: width 0.4s ease;
}

.bar-value {
  width: 60px;
  text-align: right;
  font-size: 13px;
  font-weight: bold;
  color: #e67e22;
}

.activity-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.activity-row:last-child {
  border-bottom: none;
}

.act-name {
  font-size: 14px;
  font-weight: 600;
  width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.act-desc {
  flex: 1;
  font-size: 13px;
  color: #666;
}

.act-time {
  font-size: 12px;
  color: #bbb;
  flex-shrink: 0;
}

.empty {
  text-align: center;
  color: #bbb;
  font-size: 13px;
  padding: 18px 0;
}
</style>
