<template>
  <div class="panel">
    <div class="panel-head">
      <h2 class="panel-title">📈 行为埋点</h2>
      <div class="head-right">
        <select v-model.number="days" class="days-select" @change="load">
          <option :value="1">近 1 天</option>
          <option :value="7">近 7 天</option>
          <option :value="30">近 30 天</option>
        </select>
        <button class="refresh-btn" :disabled="loading" @click="load">
          {{ loading ? '刷新中…' : '🔄 刷新' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="empty-tip">{{ error }}</div>

    <template v-if="summary">
      <!-- 总量指标卡 -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-num">{{ summary.total }}</div>
          <div class="stat-label">事件总数（{{ summary.days }} 天）</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ gameStarts }}</div>
          <div class="stat-label">开局次数</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ mode3dPct === null ? '-' : mode3dPct + '%' }}</div>
          <div class="stat-label">3D 使用率（开局口径）</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ summary.byType['fps_fallback'] ?? 0 }}</div>
          <div class="stat-label">低帧回退次数</div>
        </div>
      </div>

      <!-- 按游戏 -->
      <div class="section">
        <h3 class="section-title">按游戏（事件量）</h3>
        <table class="ev-table">
          <thead>
            <tr>
              <th>游戏</th>
              <th>开局</th>
              <th>3D 开局占比</th>
              <th>事件总量</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in gameRows" :key="row.gameId">
              <td>{{ row.gameId }}</td>
              <td>{{ row.starts }}</td>
              <td>{{ row.mode3dPct === null ? '-' : row.mode3dPct + '%' }}</td>
              <td>{{ row.total }}</td>
            </tr>
            <tr v-if="!gameRows.length">
              <td colspan="4" class="empty-tip">暂无数据（埋点刚上线，玩几局再来看）</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 按类型 -->
      <div class="section">
        <h3 class="section-title">按类型</h3>
        <div class="type-chips">
          <span v-for="(count, type) in summary.byType" :key="type" class="type-chip">
            {{ type }} · {{ count }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getEventsSummary, type EventsSummary } from '@/api/admin';

const days = ref(7);
const loading = ref(false);
const error = ref('');
const summary = ref<EventsSummary | null>(null);

const gameStarts = computed(() => summary.value?.byType['game_start'] ?? 0);

const mode3dPct = computed<number | null>(() => {
  const s = summary.value;
  if (!s) return null;
  let d2 = 0;
  let d3 = 0;
  for (const m of Object.values(s.modeByGame)) {
    d2 += m['2d'];
    d3 += m['3d'];
  }
  if (d2 + d3 === 0) return null;
  return Math.round((d3 / (d2 + d3)) * 100);
});

interface GameRow {
  gameId: string;
  starts: number;
  total: number;
  mode3dPct: number | null;
}

const gameRows = computed<GameRow[]>(() => {
  const s = summary.value;
  if (!s) return [];
  const ids = new Set([...Object.keys(s.byGame), ...Object.keys(s.modeByGame)]);
  return [...ids]
    .map((gameId) => {
      const m = s.modeByGame[gameId];
      const starts = m ? m['2d'] + m['3d'] : 0;
      return {
        gameId,
        starts,
        total: s.byGame[gameId] ?? 0,
        mode3dPct: starts > 0 ? Math.round(((m?.['3d'] ?? 0) / starts) * 100) : null,
      };
    })
    .sort((a, b) => b.total - a.total);
});

const load = async (): Promise<void> => {
  loading.value = true;
  error.value = '';
  try {
    summary.value = await getEventsSummary(days.value);
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.head-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.days-select {
  border: 1px solid #dfe3ea;
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 12px;
  background: #fff;
}

.ev-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.ev-table th,
.ev-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #f0f2f5;
  text-align: left;
}

.ev-table th {
  color: #8a93a6;
  font-weight: 500;
}

.type-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.type-chip {
  background: #f4f6fa;
  border-radius: 12px;
  padding: 4px 12px;
  font-size: 12px;
  color: #4a5568;
}

.empty-tip {
  color: #8a93a6;
  font-size: 12px;
  padding: 8px 2px;
}
</style>
