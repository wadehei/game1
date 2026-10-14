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
    :final="events.final"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <!-- 后续游戏组件在此按 gameType 挂载：draw / spy / uno -->
  <div v-else class="game-placeholder">该游戏暂未开放</div>
</template>

<script setup lang="ts">
import GomokuBoard from './GomokuBoard.vue';
import QuizGame from './QuizGame.vue';

defineProps<{
  gameType: string;
  gameState: any;
  phase: string;
  mySeat: number;
  events: { question: any; result: any; final: any };
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
