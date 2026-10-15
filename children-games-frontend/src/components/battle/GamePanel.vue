<template>
  <GomokuBoard
    v-if="gameType === 'gomoku'"
    :state="gameState"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <QuizGame
    v-else-if="gameType === 'quiz'"
    :question="events.question"
    :result="events.result"
    :final="events.final || gameState?.ended || null"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <DrawGame
    v-else-if="gameType === 'draw'"
    :state="gameState"
    :events="events"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <SpyGame
    v-else-if="gameType === 'spy'"
    :state="gameState"
    :events="events"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <UnoGame
    v-else-if="gameType === 'uno'"
    :state="gameState"
    :events="events"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <BlackjackGame
    v-else-if="gameType === 'blackjack'"
    :state="gameState"
    :events="events"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <ZjhGame
    v-else-if="gameType === 'zjh'"
    :state="gameState"
    :events="events"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <!-- 后续游戏组件在此按 gameType 挂载 -->
  <div v-else class="game-placeholder">该游戏暂未开放</div>
</template>

<script setup lang="ts">
import GomokuBoard from './GomokuBoard.vue';
import QuizGame from './QuizGame.vue';
import DrawGame from './DrawGame.vue';
import SpyGame from './SpyGame.vue';
import UnoGame from './UnoGame.vue';
import BlackjackGame from './BlackjackGame.vue';
import ZjhGame from './ZjhGame.vue';

defineProps<{
  gameType: string;
  gameState: any;
  phase: string;
  mySeat: number;
  members: Array<{ userId: number; nickname: string; avatar: string; seat: number; ready: boolean; online: boolean }>;
  events: Record<string, any>;
}>();

const emit = defineEmits<{ (e: 'action', action: Record<string, unknown>): void }>();
</script>

<style scoped>
.game-placeholder {
  text-align: center;
  color: #b5bac2;
  font-size: 13px;
  padding: 30px 0;
}
</style>
