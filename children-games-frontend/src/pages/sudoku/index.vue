<template>
  <div class="sudoku-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      header-class="sudoku-header"
      level-selectable
      @toggle-sound="sounds.toggleSound"
      @go-back="router.back()"
      @select-level="openLevelSelect"
    />

    <!-- 状态提示 -->
    <div class="status-bar">
      <span class="status-text">{{ statusText }}</span>
    </div>

    <!-- 数独盘面 -->
    <div class="sudoku-board" :class="{ 'size-6': gridSize === 6 }">
      <button
        v-for="(cell, idx) in grid"
        :key="idx"
        class="cell"
        :class="cellClass(idx)"
        :disabled="!!givenCells[idx] || gameEnded || paused"
        @click="tapCell(idx)"
      >
        <span v-if="cell" class="cell-emoji">{{ symbols[cell - 1] }}</span>
      </button>
    </div>

    <!-- 符号盘 -->
    <div class="symbol-palette">
      <button
        v-for="(sym, i) in symbols"
        :key="sym"
        class="palette-btn"
        :class="{ done: remainingCount(i + 1) === 0 }"
        :disabled="gameEnded || paused"
        @click="tapSymbol(i + 1)"
      >
        <span class="palette-emoji">{{ sym }}</span>
        <span class="palette-count">{{ remainingCount(i + 1) }}</span>
      </button>
    </div>

    <div class="tip-text">每一行、每一列、每个彩色框里，小动物都不能重复哦！</div>

    <!-- 游戏结果弹窗（通关自动开始下一关） -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '数独完成啦！' : '时间到了，再试一次！'"
      :info="gameWon ? `用时 ${elapsedSec} 秒 · 错 ${mistakes} 次` : '慢慢想，不着急'"
      @retry="restartGame"
      @next="nextLevel"
    />

    <!-- 暂停 -->
    <PauseMenu :show="paused" @pause="pauseGame" @resume="resumeGame" @quit="quitGame" />

    <!-- 选关弹层 -->
    <LevelSelectModal
      :show="showLevelSelect"
      :max-level="currentLevel"
      :current="currentLevel"
      @select="chooseLevel"
      @close="showLevelSelect = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameProgress } from '@/composables/useGameProgress';
import { useGameLifecycle } from '@/composables/useGameLifecycle';
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';
import { getLevelOverride } from '@/api/game';
import { playVoice, speak } from '@/utils/voice';
import { defaultLevelConfig } from '@/utils/levelDefaults';
import { generatePuzzle, findConflicts, type SudokuPuzzle } from '@/utils/sudokuEngine';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';

const router = useRouter();
const sounds = useGameSounds();
const { loadStartLevel, saveProgress: saveGameProgress, recordPlay } = useGameProgress('sudoku');
const assist = useAdaptiveAssist('sudoku');

const currentLevel = ref(1);
const timeLeft = ref(150);
const showResult = ref(false);
const gameWon = ref(false);
const stars = ref(0);
const showLevelSelect = ref(false);
const paused = ref(false);

const gridSize = ref(4);
const boxRows = ref(2);
const boxCols = ref(2);
const symbols = ref<string[]>(['🐰', '🐱', '🐼', '🦊']);
const grid = ref<number[]>([]);
const givenCells = ref<number[]>([]);
const selectedCell = ref(-1);
const wrongCell = ref(-1);
const mistakes = ref(0);

const levelConfig = ref<Record<string, number>>({ gridSize: 4, prefilled: 11, timeLimit: 150 });

let gameEnded = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;

// 4×4 与 6×6 的符号表（6×6 只用前 6 个，视觉差异要大）
const SYMBOLS_4 = ['🐰', '🐱', '🐼', '🦊'];
const SYMBOLS_6 = ['🐰', '🐱', '🐼', '🦊', '🐵', '🐸'];

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '空格', value: grid.value.filter((v) => !v).length },
  { label: '时间', value: `${timeLeft.value}s` },
]);

const statusText = computed(() => {
  if (gameEnded) return gameWon.value ? '全部填对，太厉害了！' : '时间到啦～';
  if (paused.value) return '游戏暂停中';
  if (selectedCell.value >= 0) return '点下面的小动物填进去';
  return '点一个空格子，再点小动物';
});

const elapsedSec = computed(() => levelConfig.value.timeLimit - timeLeft.value);

const conflicts = computed(() =>
  findConflicts(grid.value, gridSize.value, boxRows.value, boxCols.value)
);

/** 该符号还剩几个没放（符号盘计数，放满变灰） */
const remainingCount = (v: number): number =>
  gridSize.value - grid.value.filter((c) => c === v).length;

const cellClass = (idx: number) => ({
  given: !!givenCells.value[idx],
  selected: selectedCell.value === idx,
  conflict: conflicts.value.has(idx),
  wrong: wrongCell.value === idx,
  dim:
    selectedCell.value >= 0 &&
    grid.value[selectedCell.value] !== 0 &&
    grid.value[idx] === grid.value[selectedCell.value] &&
    idx !== selectedCell.value,
});

// ── 交互 ──
const tapCell = (idx: number): void => {
  if (gameEnded || paused.value || givenCells.value[idx]) return;
  sounds.play('click');
  if (selectedCell.value === idx) {
    selectedCell.value = -1;
    return;
  }
  selectedCell.value = idx;
  if (grid.value[idx] !== 0) return; // 已填格：仅改选，便于换动物
};

const tapSymbol = (v: number): void => {
  if (gameEnded || paused.value) return;
  if (selectedCell.value < 0 || givenCells.value[selectedCell.value]) return;
  const idx = selectedCell.value;
  const prev = grid.value[idx];
  if (prev === v) {
    grid.value[idx] = 0; // 再点同符号=擦除
    sounds.play('click');
    return;
  }
  grid.value[idx] = v;
  if (findConflicts(grid.value, gridSize.value, boxRows.value, boxCols.value).has(idx)) {
    // 放错：标红计数，可改
    mistakes.value += 1;
    wrongCell.value = idx;
    sounds.play('fail');
    setTimeout(() => {
      wrongCell.value = -1;
    }, 600);
    speakMistakeOnce();
    return;
  }
  sounds.play('match');
  checkWin();
};

let mistakeSpoken = false;
const speakMistakeOnce = (): void => {
  if (mistakeSpoken) return;
  mistakeSpoken = true;
  speak('哎呀，有小动物重复了，换一个试试');
};

const checkWin = (): void => {
  if (grid.value.some((v) => !v)) return;
  if (conflicts.value.size > 0) return;
  endGame(true);
};

// ── 计时 ──
const tick = (): void => {
  if (paused.value || gameEnded) return;
  timeLeft.value -= 1;
  if (timeLeft.value <= 0) {
    timeLeft.value = 0;
    endGame(false);
  }
};

// ── 生命周期流程 ──
const initGame = (): void => {
  gameEnded = false;
  showResult.value = false;
  gameWon.value = false;
  stars.value = 0;
  mistakes.value = 0;
  mistakeSpoken = false;
  selectedCell.value = -1;
  wrongCell.value = -1;
  timeLeft.value = levelConfig.value.timeLimit;

  const size = levelConfig.value.gridSize;
  gridSize.value = size;
  boxRows.value = 2;
  boxCols.value = size / 2;
  symbols.value = size === 4 ? SYMBOLS_4 : SYMBOLS_6;

  const puzzle: SudokuPuzzle | null = generatePuzzle(
    size,
    boxRows.value,
    boxCols.value,
    levelConfig.value.prefilled
  );
  if (!puzzle) {
    // 理论不可达（回溯在 4/6 阶必成功）；兜底重试一次
    const retry = generatePuzzle(size, boxRows.value, boxCols.value, levelConfig.value.prefilled);
    if (!retry) return;
    applyPuzzle(retry);
  } else {
    applyPuzzle(puzzle);
  }

  sounds.play('click');
  playVoice('sudoku_intro', '把每行每列每宫填满，小动物不能重复哦');
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, 1000);
};

const applyPuzzle = (puzzle: SudokuPuzzle): void => {
  grid.value = [...puzzle.given];
  givenCells.value = puzzle.given.map((v) => (v === 0 ? 0 : 1));
};

const endGame = (won: boolean): void => {
  if (gameEnded) return;
  gameEnded = true;
  gameWon.value = won;
  if (tickTimer) clearInterval(tickTimer);
  const ratio = timeLeft.value / levelConfig.value.timeLimit;
  if (won) {
    sounds.play('success');
    stars.value = ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
    assist.record(true);
    // 胜局计入进度（成绩=用时秒，越小越好）；失败局记一局游玩
    saveGameProgress({
      level: currentLevel.value + 1,
      score: elapsedSec.value,
      stars: stars.value,
    });
  } else {
    sounds.play('fail');
    assist.record(false);
    recordPlay();
  }
  showResult.value = true;
};

const restartGame = (): void => initGame();

const nextLevel = async (): Promise<void> => {
  currentLevel.value += 1;
  sounds.play('levelUp');
  await applyLevelConfig(currentLevel.value);
  initGame();
};

const applyLevelConfig = async (level: number): Promise<void> => {
  const base = defaultLevelConfig('sudoku', level);
  levelConfig.value = { ...base };
  const override = await getLevelOverride('sudoku', level);
  if (override) {
    // sudoku 的字段白名单全为数值（gridSize/prefilled/timeLimit）
    levelConfig.value = { ...levelConfig.value, ...override } as Record<string, number>;
  }
  // 自适应辅助：连败后加时 / 增加预填格（孩子无感知）
  const assistLevel = assist.level();
  if (assistLevel >= 1) levelConfig.value.timeLimit += 30;
  if (assistLevel >= 2) levelConfig.value.prefilled += 2;
};

// ── 暂停（手动 + 护眼） ──
const pauseGame = (): void => {
  paused.value = true;
};
const resumeGame = (): void => {
  paused.value = false;
};

useGameLifecycle({ onPause: () => (paused.value = true), onResume: () => (paused.value = false) });

const openLevelSelect = (): void => {
  if (!gameEnded) paused.value = true;
  showLevelSelect.value = true;
};

const chooseLevel = async (level: number): Promise<void> => {
  showLevelSelect.value = false;
  paused.value = false;
  currentLevel.value = level;
  await applyLevelConfig(level);
  initGame();
};

const quitGame = (): void => {
  router.back();
};

onMounted(async () => {
  sounds.init();
  currentLevel.value = await loadStartLevel();
  await applyLevelConfig(currentLevel.value);
  initGame();
});

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});
</script>

<style scoped>
.sudoku-game {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px 24px;
  background: linear-gradient(160deg, #fdf6ec 0%, #fdebd3 55%, #f9e2c0 100%);
  box-sizing: border-box;
  overflow-x: hidden;
}

.status-bar {
  margin: 8px 0 12px;
}

.status-text {
  font-size: 16px;
  color: #8a6d3b;
  font-weight: 600;
}

/* ── 盘面 ── */
.sudoku-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(64px, 84px));
  gap: 6px;
  background: #fff;
  padding: 10px;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(180, 140, 80, 0.18);
}

.sudoku-board.size-6 {
  grid-template-columns: repeat(6, minmax(46px, 62px));
}

.cell {
  aspect-ratio: 1;
  border: 2px solid #f2e3c9;
  border-radius: 10px;
  background: #fffdf7;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.12s ease,
    border-color 0.15s ease;
  font-size: 30px;
  line-height: 1;
  padding: 0;
}

.size-6 .cell {
  font-size: 24px;
  border-radius: 8px;
}

.cell.given {
  background: #f6ead2;
  cursor: default;
}

.cell.selected {
  border-color: #f0a24b;
  background: #fff3dd;
  transform: scale(1.05);
}

.cell.dim {
  background: #ffedd9;
}

.cell.conflict,
.cell.wrong {
  border-color: #e56b6f;
  background: #ffe4e4;
  animation: shake 0.4s ease;
}

.cell.conflict .cell-emoji,
.cell.wrong .cell-emoji {
  opacity: 0.75;
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  75% {
    transform: translateX(4px);
  }
}

/* ── 符号盘 ── */
.symbol-palette {
  display: flex;
  gap: 12px;
  margin-top: 18px;
}

.palette-btn {
  position: relative;
  min-width: 64px;
  padding: 10px 12px 8px;
  border: 2px solid #f2e3c9;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    opacity 0.15s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.palette-btn:active {
  transform: scale(0.94);
}

.palette-btn.done {
  opacity: 0.35;
}

.palette-emoji {
  font-size: 30px;
  line-height: 1.1;
}

.palette-count {
  font-size: 12px;
  color: #b08d55;
  font-weight: 700;
}

.tip-text {
  margin-top: 14px;
  font-size: 14px;
  color: #a58757;
  text-align: center;
}

@media (max-width: 420px) {
  .sudoku-board {
    grid-template-columns: repeat(4, minmax(58px, 1fr));
    width: 100%;
  }

  .sudoku-board.size-6 {
    grid-template-columns: repeat(6, minmax(40px, 1fr));
  }

  .cell {
    font-size: 26px;
  }

  .size-6 .cell {
    font-size: 20px;
  }

  .palette-btn {
    min-width: 56px;
  }
}
</style>
