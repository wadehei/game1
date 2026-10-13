<template>
  <div v-if="show" class="board-modal" @click.self="$emit('close')">
    <div class="board-content">
      <div class="board-title">🏆 {{ gameName }}·家庭排行</div>

      <div v-if="loading" class="board-loading">加载中…</div>

      <template v-else>
        <div v-if="rows.length === 0" class="board-empty">
          还没有记录，快来抢占第一名！🚀
        </div>
        <div v-for="row in rows" v-else :key="row.userId" class="board-row" :class="{ me: row.userId === myUserId }">
          <span class="rank-medal">{{ medal(row.rank) }}</span>
          <PlayerAvatar :avatar="row.avatar" :size="38" />
          <span class="row-name">{{ row.nickname }}</span>
          <span class="row-score">{{ formatScore(gameId, row.highScore) }}</span>
        </div>
      </template>

      <button class="board-close" @click="$emit('close')">关闭</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getLeaderboard } from '@/api/game';
import { useUserStore } from '@/store/user';
import { formatScore } from '@/utils/gameMeta';
import PlayerAvatar from '@/components/PlayerAvatar.vue';

interface LeaderboardRow {
  rank: number;
  userId: number;
  nickname: string;
  avatar: string;
  highScore: number;
  level: number;
}

const props = defineProps<{
  show: boolean;
  gameId: string;
  gameName: string;
}>();

defineEmits<{ close: [] }>();

const userStore = useUserStore();
const myUserId = computed(() => userStore.userInfo?.id);
const loading = ref(false);
const rows = ref<LeaderboardRow[]>([]);

const medal = (rank: number): string => ({ 1: '🥇', 2: '🥈', 3: '🥉' }[rank as 1 | 2 | 3] || `${rank}`);

watch(() => props.show, async (visible) => {
  if (!visible) return;
  loading.value = true;
  rows.value = [];
  try {
    rows.value = await getLeaderboard(props.gameId, 20);
  } catch {
    rows.value = [];
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.board-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 150;
  animation: boardFadeIn 0.25s ease;
}

@keyframes boardFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.board-content {
  background: #fff;
  border-radius: 24px;
  padding: 26px 22px;
  width: 90%;
  max-width: 340px;
  max-height: 76vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: boardBounceIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes boardBounceIn {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.board-title {
  font-size: 19px;
  font-weight: bold;
  color: #333;
  text-align: center;
  margin-bottom: 16px;
}

.board-loading,
.board-empty {
  text-align: center;
  color: #999;
  font-size: 14px;
  padding: 26px 0;
}

.board-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 14px;
}

.board-row.me {
  background: rgba(102, 126, 234, 0.12);
}

.rank-medal {
  width: 30px;
  text-align: center;
  font-size: 17px;
  font-weight: bold;
  color: #999;
  flex-shrink: 0;
}

.row-name {
  flex: 1;
  font-size: 15px;
  color: #333;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-score {
  font-size: 15px;
  font-weight: bold;
  color: #FF6B6B;
  flex-shrink: 0;
}

.board-close {
  display: block;
  width: 100%;
  margin-top: 16px;
  padding: 13px;
  border: none;
  border-radius: 18px;
  background: #f0f0f0;
  color: #666;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
</style>
