<template>
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
            <div class="trend-bar" :style="{ height: trendBarHeight(d.seconds) }" />
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
            关卡 {{ g.currentLevel }}/{{ gameTotal(g.gameId) }} · ⭐{{ g.stars }}
            <template v-if="g.playCount > 0">
              · {{ g.winCount }}胜/{{ g.playCount }}局{{
                g.playCount > 0 ? `（${Math.round((g.winCount / g.playCount) * 100)}%）` : ''
              }}</template
            >
            <template v-if="g.lastPlayedAt"> · {{ timeAgo(g.lastPlayedAt) }}</template>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="career-empty">还没开始冒险，去玩一局点亮生涯吧！🚀</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getGameMeta, formatScore } from '@/utils/gameMeta';
import type { MyCareer, CareerGame } from '@/api/user';

const props = defineProps<{
  career: MyCareer | null;
}>();

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

const joinedDays = computed(() => {
  if (!props.career?.user.joinedAt) return '-';
  return Math.max(
    1,
    Math.ceil((Date.now() - new Date(props.career.user.joinedAt).getTime()) / 86400000)
  );
});

const playTimeText = computed(() => {
  const s = props.career?.totals.playSeconds || 0;
  if (s < 60) return `${s}秒`;
  if (s < 3600) return `${Math.floor(s / 60)}分`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h}时${m}分` : `${h}时`;
});

const winRateText = computed(() => {
  const t = props.career?.totals;
  if (!t || t.playCount === 0) return '-';
  return `${Math.round((t.winCount / t.playCount) * 100)}%`;
});

const trendMax = computed(() =>
  Math.max(...(props.career?.last7?.map((d) => d.seconds) || [0]), 1)
);

const trendBarHeight = (seconds: number): string => {
  const pct = Math.max((seconds / trendMax.value) * 100, 4);
  return `${pct}%`;
};

const gameName = (id: string): string => getGameMeta(id)?.name || id;
const gameIcon = (id: string): string => games.find((g) => g.id === id)?.icon || '🎮';
const gameTotal = (id: string): number => getGameMeta(id)?.totalLevels || 20;

const recordText = (g: CareerGame): string => {
  if (!g.highScore) return '';
  return formatScore(g.gameId, g.highScore);
};

const timeAgo = (iso: string): string => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}天前` : `${Math.floor(d / 30)}个月前`;
};
</script>

<style scoped>
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

.game-icon {
  font-size: 22px;
}

.game-name {
  font-size: 15px;
  color: #333;
  flex: 1;
  font-weight: 500;
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
</style>
