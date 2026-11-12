<template>
  <GomokuBoard
    v-if="gameType === 'gomoku'"
    :state="gameState as GomokuGameState"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <QuizGame
    v-else-if="gameType === 'quiz'"
    :question="events.question ?? null"
    :result="events.result ?? null"
    :final="events.final || (gameState as QuizGameState).ended || null"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <DrawGame
    v-else-if="gameType === 'draw'"
    :state="gameState as DrawGameState"
    :events="events"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <SpyGame
    v-else-if="gameType === 'spy'"
    :state="gameState as SpyGameState"
    :events="events"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <UnoGame
    v-else-if="gameType === 'uno'"
    :state="gameState as UnoGameState"
    :events="events"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <BlackjackGame
    v-else-if="gameType === 'blackjack'"
    :state="gameState as BlackjackGameState"
    :events="events"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <ZjhGame
    v-else-if="gameType === 'zjh'"
    :state="gameState as ZjhGameState"
    :events="events"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <TankGame
    v-else-if="gameType === 'tank'"
    :state="gameState"
    :events="events"
    :members="members"
    :phase="phase"
    :my-seat="mySeat"
    @action="emit('action', $event)"
  />
  <DdzGame
    v-else-if="gameType === 'ddz'"
    :state="gameState as DdzGameState"
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
import TankGame from './TankGame.vue';
import DdzGame from './DdzGame.vue';
import type {
  GameState,
  GameEvents,
  GomokuGameState,
  QuizGameState,
  DrawGameState,
  SpyGameState,
  UnoGameState,
  BlackjackGameState,
  ZjhGameState,
  DdzGameState,
} from '@/composables/wsTypes';

// gameState/events 由 room.vue 按 gameType 填充，模板内按分支窄化为对应游戏的形状
defineProps<{
  gameType: string;
  gameState: GameState;
  phase: string;
  mySeat: number;
  members: Array<{
    userId: number;
    nickname: string;
    avatar: string;
    seat: number;
    ready: boolean;
    online: boolean;
  }>;
  events: Partial<GameEvents>;
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
