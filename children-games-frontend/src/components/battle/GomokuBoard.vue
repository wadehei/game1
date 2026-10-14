<template>
  <div class="board-wrap">
    <div class="board-frame">
      <svg
        ref="svgEl"
        class="board-svg"
        :viewBox="`-0.5 -0.5 ${BOARD_SIZE} ${BOARD_SIZE}`"
        @pointerdown.prevent="tap"
      >
        <defs>
          <radialGradient id="stoneBlack" cx="0.35" cy="0.35" r="0.75">
            <stop offset="0%" stop-color="#5a5a5a" />
            <stop offset="100%" stop-color="#0d0d0d" />
          </radialGradient>
          <radialGradient id="stoneWhite" cx="0.35" cy="0.35" r="0.75">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="100%" stop-color="#c4c4c4" />
          </radialGradient>
        </defs>
        <!-- 网格线 -->
        <line
          v-for="i in BOARD_SIZE"
          :key="`h${i}`"
          :x1="0" :y1="i - 1" :x2="BOARD_SIZE - 1" :y2="i - 1"
          class="grid-line"
        />
        <line
          v-for="i in BOARD_SIZE"
          :key="`v${i}`"
          :x1="i - 1" :y1="0" :x2="i - 1" :y2="BOARD_SIZE - 1"
          class="grid-line"
        />
        <!-- 星位 -->
        <circle v-for="([sx, sy]) in STAR_POINTS" :key="`s${sx}-${sy}`" :cx="sx" :cy="sy" r="0.12" class="star" />
        <!-- 胜利连线 -->
        <line
          v-if="state.winLine.length >= 2"
          :x1="state.winLine[0][0]" :y1="state.winLine[0][1]"
          :x2="state.winLine.at(-1)![0]" :y2="state.winLine.at(-1)![1]"
          class="win-line"
        />
        <!-- 棋子：落在线条交点 -->
        <template v-for="(row, y) in state.board" :key="`row${y}`">
          <template v-for="(cell, x) in row" :key="`c${x}-${y}`">
            <circle
              v-if="cell !== 0"
              :cx="x" :cy="y" r="0.44"
              class="stone"
              :class="[cell === 1 ? 'black' : 'white', { last: isLast(x, y) }]"
            />
          </template>
        </template>
        <!-- 最后一手标记 -->
        <circle
          v-if="state.lastMove"
          :cx="state.lastMove.x" :cy="state.lastMove.y" r="0.1"
          class="last-mark"
          :class="{ light: state.board[state.lastMove.y]?.[state.lastMove.x] === 1 }"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

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

const svgEl = ref<SVGSVGElement | null>(null);

// 15 路棋盘星位
const STAR_POINTS: [number, number][] = [
  [3, 3], [11, 3], [3, 11], [11, 11], [7, 7],
];

const isLast = (x: number, y: number): boolean =>
  !!props.state.lastMove && props.state.lastMove.x === x && props.state.lastMove.y === y;

const myColor = props.mySeat === 0 ? BLACK : props.mySeat === 1 ? 2 : 0;

const tap = (e: PointerEvent) => {
  if (props.phase !== 'playing' || props.mySeat < 0) return;
  if (props.state.turn !== myColor) return;
  const svg = svgEl.value;
  if (!svg) return;
  // 屏幕坐标 → SVG 逻辑坐标，取最近交点
  const rect = svg.getBoundingClientRect();
  const nx = (e.clientX - rect.left) / rect.width;
  const ny = (e.clientY - rect.top) / rect.height;
  // viewBox 从 -0.5 开始：逻辑坐标 = nx * SIZE - 0.5
  const lx = nx * BOARD_SIZE - 0.5;
  const ly = ny * BOARD_SIZE - 0.5;
  const x = Math.round(lx);
  const y = Math.round(ly);
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
  if (props.state.board[y]?.[x]) return;
  emit('action', { t: 'move', x, y });
};
</script>

<style scoped>
.board-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
}

.board-frame {
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1;
  background: linear-gradient(135deg, #f5deb3 0%, #e8c88f 100%);
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  padding: 2px;
  box-sizing: border-box;
}

.board-svg {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: manipulation;
  cursor: pointer;
}

.grid-line {
  stroke: rgba(110, 70, 25, 0.65);
  stroke-width: 0.03;
}

.star {
  fill: rgba(110, 70, 25, 0.85);
}

.win-line {
  stroke: #e67e22;
  stroke-width: 0.14;
  stroke-linecap: round;
}

.stone.black {
  fill: url(#stoneBlack);
}

.stone.white {
  fill: url(#stoneWhite);
  stroke: rgba(0, 0, 0, 0.15);
  stroke-width: 0.03;
}

.stone.last {
  stroke: #e74c3c;
  stroke-width: 0.07;
}

.last-mark {
  fill: #e74c3c;
}

.last-mark.light {
  fill: #fff;
}
</style>
