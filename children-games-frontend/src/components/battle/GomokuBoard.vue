<template>
  <div class="board-wrap">
    <div class="board">
      <template v-for="y in BOARD_SIZE" :key="`r${y}`">
        <div
          v-for="x in BOARD_SIZE"
          :key="`c${x}`"
          class="cell"
          :class="{ win: isWin(x - 1, y - 1) }"
          @click="tap(x - 1, y - 1)"
        >
          <span
            v-if="stoneAt(x - 1, y - 1)"
            class="stone"
            :class="[stoneAt(x - 1, y - 1) === 1 ? 'black' : 'white', { last: isLast(x - 1, y - 1) }]"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const BOARD_SIZE = 15;
const BLACK = 1;

interface BoardState {
  board: number[][];
  turn: number;
  winner: number;
  winLine: [number, number][];
  lastMove: { x: number; y: number } | null;
}

const props = defineProps<{
  state: BoardState;
  phase: string;
  mySeat: number;
}>();

const emit = defineEmits<{ (e: 'action', action: Record<string, unknown>): void }>();

const myColor = computed(() => (props.mySeat === 0 ? BLACK : props.mySeat === 1 ? 2 : 0));

const stoneAt = (x: number, y: number): number => props.state.board?.[y]?.[x] || 0;
const isLast = (x: number, y: number): boolean =>
  !!props.state.lastMove && props.state.lastMove.x === x && props.state.lastMove.y === y;
const isWin = (x: number, y: number): boolean => props.state.winLine.some(([wx, wy]) => wx === x && wy === y);

const tap = (x: number, y: number): void => {
  if (props.phase !== 'playing' || props.mySeat < 0) return;
  if (props.state.turn !== myColor.value) return;
  if (stoneAt(x, y)) return;
  emit('action', { t: 'move', x, y });
};
</script>

<style scoped>
.board-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
}

.board {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 0;
  background: linear-gradient(135deg, #f5deb3 0%, #e8c88f 100%);
  padding: 4px;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  touch-action: manipulation;
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1;
}

.cell {
  position: relative;
  border-right: 1px solid rgba(120, 80, 30, 0.35);
  border-bottom: 1px solid rgba(120, 80, 30, 0.35);
  cursor: pointer;
}

.cell:nth-child(15n) {
  border-right: none;
}

.cell:nth-last-child(-n + 15) {
  border-bottom: none;
}

.cell.win {
  background: rgba(230, 126, 34, 0.35);
}

.stone {
  position: absolute;
  inset: 8%;
  border-radius: 50%;
  animation: drop 0.15s ease;
}

.stone.black {
  background: radial-gradient(circle at 35% 35%, #555, #111);
}

.stone.white {
  background: radial-gradient(circle at 35% 35%, #fff, #c9c9c9);
}

.stone.last::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22%;
  height: 22%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #e74c3c;
}

@keyframes drop {
  from {
    transform: scale(0.6);
    opacity: 0.4;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
