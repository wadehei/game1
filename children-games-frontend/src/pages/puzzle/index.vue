<template>
  <div class="puzzle-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      headerClass="puzzle-header"
      level-selectable
      @toggleSound="sounds.toggleSound"
      @goBack="router.back()"
      @selectLevel="openLevelSelect"
    />

    <!-- 原图预览 -->
    <div class="preview-section">
      <img class="preview-image" :src="currentImage" alt="preview" />
      <span class="preview-text">原图预览</span>
    </div>

    <!-- 拼图区域 -->
    <div class="puzzle-board" :style="{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }">
      <div
        v-for="(piece, index) in pieces"
        :key="index"
        class="puzzle-piece"
        :class="{ empty: piece.isEmpty, selected: selectedPiece === index, movable: adjacentToEmpty.has(index) && !piece.isEmpty, 'win-glow': gameWon && !piece.isEmpty }"
        @click="selectPiece(index)"
      >
        <img
          v-if="!piece.isEmpty"
          class="piece-image"
          :src="piece.image"
          :style="{
            width: pieceWidth * gridSize + 'px',
            height: pieceHeight * gridSize + 'px',
            transform: `translate(-${piece.offsetX}px, -${piece.offsetY}px)`
          }"
        />
      </div>
    </div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '恭喜通关！' : '时间到，再试一次！'"
      @retry="restartGame"
      @next="nextLevel"
    />

    <!-- 暂停按钮 -->
    <div class="pause-btn" @click="pauseGame">
      <span>⏸️</span>
    </div>

    <!-- 暂停弹层 -->
    <div v-if="paused" class="pause-overlay">
      <div class="pause-content">
        <span class="pause-icon">⏸️</span>
        <div class="pause-title">游戏暂停</div>
        <button class="btn-resume" @click="resumeGame">继续游戏</button>
        <button class="btn-quit" @click="quitGame">退出游戏</button>
      </div>
    </div>

    <!-- 选关弹层 -->
    <LevelSelectModal
      :show="showLevelSelect"
      :max-level="currentLevel"
      :current="currentLevel"
      @select="chooseLevel"
      @close="closeLevelSelect"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameProgress } from '@/composables/useGameProgress';
import { GAME_PAUSE_EVENT, GAME_RESUME_EVENT } from '@/utils/gameEvents';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';

import puzzle1 from '@/static/images/games/puzzle/puzzle-1.svg';
import puzzle2 from '@/static/images/games/puzzle/puzzle-2.svg';
import puzzle3 from '@/static/images/games/puzzle/puzzle-3.svg';

interface PuzzlePiece {
  id: number;
  isEmpty: boolean;
  image: string;
  offsetX: number;
  offsetY: number;
  correctPosition: number;
}

const router = useRouter();
const sounds = useGameSounds();

const images = [puzzle1, puzzle2, puzzle3];

const currentLevel = ref(1);
const moves = ref(0);
const timeLeft = ref(120);
const pieces = ref<PuzzlePiece[]>([]);
const selectedPiece = ref<number | null>(null);
const showResult = ref(false);
const gameWon = ref(false);
const stars = ref(0);
const paused = ref(false);
const showLevelSelect = ref(false);
let levelSelectPaused = false;
const { loadStartLevel, saveProgress: saveGameProgress } = useGameProgress('puzzle');
let timer: ReturnType<typeof setInterval> | null = null;
let gameEnded = false;
let autoPausedByHidden = false;
let autoPausedByRest = false;

const gridSize = computed(() => Math.min(3 + Math.floor(currentLevel.value / 5), 5));

// 本关时限（不低于 60 秒，避免高关卡出现 0 秒）
const levelTimeLimit = computed(() => Math.max(180 - currentLevel.value * 2, 60));
const pieceWidth = computed(() => 300 / gridSize.value);
const pieceHeight = computed(() => 300 / gridSize.value);
const currentImage = computed(() => images[(currentLevel.value - 1) % images.length]);

const adjacentToEmpty = computed(() => {
  const emptyIndex = pieces.value.findIndex(p => p.isEmpty);
  const result = new Set<number>();
  const size = gridSize.value;
  const emptyRow = Math.floor(emptyIndex / size);
  const emptyCol = emptyIndex % size;

  // Check all 4 directions
  [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr, dc]) => {
    const r = emptyRow + dr;
    const c = emptyCol + dc;
    if (r >= 0 && r < size && c >= 0 && c < size) {
      result.add(r * size + c);
    }
  });
  return result;
});

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '时间', value: `${timeLeft.value}s`, valueClass: timeLeft.value <= 30 ? 'warning' : '' },
  { label: '步数', value: moves.value },
]);

const initGame = () => {
  const size = gridSize.value;
  const total = size * size;

  // 创建拼图块
  const newPieces: PuzzlePiece[] = [];
  for (let i = 0; i < total - 1; i++) {
    const row = Math.floor(i / size);
    const col = i % size;
    newPieces.push({
      id: i,
      isEmpty: false,
      image: currentImage.value,
      offsetX: col * pieceWidth.value,
      offsetY: row * pieceHeight.value,
      correctPosition: i,
    });
  }

  // 添加空格
  newPieces.push({
    id: total - 1,
    isEmpty: true,
    image: '',
    offsetX: 0,
    offsetY: 0,
    correctPosition: total - 1,
  });

  // 打乱（确保可解）
  pieces.value = shufflePuzzle(newPieces);

  moves.value = 0;
  timeLeft.value = levelTimeLimit.value;
  selectedPiece.value = null;
  showResult.value = false;
  gameWon.value = false;
  stars.value = 0;
  gameEnded = false;
  paused.value = false;

  startTimer();
};

const shufflePuzzle = (arr: PuzzlePiece[]): PuzzlePiece[] => {
  const result = [...arr];
  const size = gridSize.value;
  const total = size * size;

  // Start from solved state and make random valid moves
  let emptyIdx = total - 1;
  const moveCount = total * 20; // enough shuffling

  for (let i = 0; i < moveCount; i++) {
    const emptyRow = Math.floor(emptyIdx / size);
    const emptyCol = emptyIdx % size;
    const neighbors: number[] = [];

    if (emptyRow > 0) neighbors.push(emptyIdx - size);
    if (emptyRow < size - 1) neighbors.push(emptyIdx + size);
    if (emptyCol > 0) neighbors.push(emptyIdx - 1);
    if (emptyCol < size - 1) neighbors.push(emptyIdx + 1);

    const randomNeighbor = neighbors[Math.floor(Math.random() * neighbors.length)];
    [result[emptyIdx], result[randomNeighbor]] = [result[randomNeighbor], result[emptyIdx]];
    emptyIdx = randomNeighbor;
  }

  return result;
};

const stopTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

const startTimer = () => {
  stopTimer();
  timer = setInterval(() => {
    if (timeLeft.value > 0) {
      timeLeft.value--;
    } else {
      endGame(false);
    }
  }, 1000);
};

const pauseGame = () => {
  paused.value = true;
  stopTimer();
};

const resumeGame = () => {
  if (gameEnded) return;
  paused.value = false;
  startTimer();
};

const quitGame = () => {
  router.back();
};

// ─── 选关 ────────────────────────────────
const openLevelSelect = () => {
  if (!gameEnded && !paused.value) {
    levelSelectPaused = true;
    pauseGame();
  }
  showLevelSelect.value = true;
};

const closeLevelSelect = () => {
  showLevelSelect.value = false;
  if (levelSelectPaused) {
    levelSelectPaused = false;
    resumeGame();
  }
};

const chooseLevel = (level: number) => {
  levelSelectPaused = false;
  showLevelSelect.value = false;
  currentLevel.value = level;
  initGame();
};

// 切后台自动暂停，回到游戏继续
const handleVisibilityChange = () => {
  if (document.hidden) {
    if (!paused.value) {
      autoPausedByHidden = true;
      pauseGame();
    }
  } else if (autoPausedByHidden) {
    autoPausedByHidden = false;
    resumeGame();
  }
};

// 护眼休息等全局层叫停/恢复
const handleRestPause = () => {
  if (!gameEnded && !paused.value) {
    autoPausedByRest = true;
    pauseGame();
  }
};

const handleRestResume = () => {
  if (autoPausedByRest) {
    autoPausedByRest = false;
    resumeGame();
  }
};

const selectPiece = (index: number) => {
  const piece = pieces.value[index];
  if (piece.isEmpty || paused.value) return;

  const emptyIndex = pieces.value.findIndex(p => p.isEmpty);

  // If clicked piece is adjacent to empty slot, swap immediately
  if (isAdjacent(index, emptyIndex)) {
    [pieces.value[index], pieces.value[emptyIndex]] =
      [pieces.value[emptyIndex], pieces.value[index]];
    moves.value++;
    sounds.play('bounce');
    checkWin();
  } else {
    // Not adjacent — just show selection highlight briefly
    selectedPiece.value = index;
    sounds.play('click');
    // Clear selection after a moment
    setTimeout(() => {
      if (selectedPiece.value === index) {
        selectedPiece.value = null;
      }
    }, 300);
  }
};

const isAdjacent = (index1: number, index2: number): boolean => {
  const size = gridSize.value;
  const row1 = Math.floor(index1 / size);
  const col1 = index1 % size;
  const row2 = Math.floor(index2 / size);
  const col2 = index2 % size;

  return (Math.abs(row1 - row2) === 1 && col1 === col2) ||
         (Math.abs(col1 - col2) === 1 && row1 === row2);
};

const checkWin = () => {
  const isComplete = pieces.value.every((piece, index) => piece.correctPosition === index);
  if (isComplete) {
    endGame(true);
  }
};

const endGame = (won: boolean) => {
  if (gameEnded) return;
  gameEnded = true;

  stopTimer();
  paused.value = false;
  gameWon.value = won;

  if (won) {
    sounds.play('success');
    const timeUsed = levelTimeLimit.value - timeLeft.value;
    const timeRatio = timeUsed / levelTimeLimit.value;

    if (timeRatio < 0.5 && moves.value < gridSize.value * gridSize.value * 2) {
      stars.value = 3;
    } else if (timeRatio < 0.7) {
      stars.value = 2;
    } else {
      stars.value = 1;
    }
    saveProgress();
  } else {
    sounds.play('fail');
  }

  showResult.value = true;
};

const saveProgress = () => {
  saveGameProgress({
    level: currentLevel.value,
    score: moves.value,
    stars: stars.value,
  });
};

const restartGame = () => {
  initGame();
};

const nextLevel = () => {
  currentLevel.value++;
  sounds.play('levelUp');
  initGame();
};

onMounted(async () => {
  sounds.init();

  // 续关：从上次通关的关卡继续
  currentLevel.value = await loadStartLevel();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.addEventListener(GAME_RESUME_EVENT, handleRestResume);
  initGame();
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.removeEventListener(GAME_RESUME_EVENT, handleRestResume);
  stopTimer();
});
</script>

<style scoped>
.puzzle-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #4facfe 0%, #00f2fe 100%);
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
}

.puzzle-header {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}

:deep(.puzzle-header .label) {
  color: rgba(255, 255, 255, 0.9);
}

:deep(.puzzle-header .value) {
  color: #fff;
}

:deep(.puzzle-header .value.warning) {
  color: #FFD700;
}

:deep(.puzzle-header .sound-btn) {
  background: rgba(255, 255, 255, 0.2);
}

:deep(.puzzle-header .back-btn) {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.preview-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 16px;
}

.preview-image {
  width: 100px;
  height: 100px;
  border-radius: 12px;
  border: 3px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.preview-text {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  margin-top: 6px;
  font-weight: 500;
}

.puzzle-board {
  display: grid;
  gap: 3px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 10px;
  max-width: 320px;
  margin: 0 auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.puzzle-piece {
  aspect-ratio: 1;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.puzzle-piece:hover {
  transform: scale(1.05);
}

.puzzle-piece.empty {
  background: rgba(0, 0, 0, 0.1);
}

.puzzle-piece.selected {
  box-shadow: 0 0 0 3px #FFE66D;
  transform: scale(1.05);
}

.puzzle-piece.movable {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.6);
  cursor: pointer;
}

.puzzle-piece.win-glow {
  animation: winGlow 1s ease;
}

@keyframes winGlow {
  0% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.7); }
  50% { box-shadow: 0 0 15px 5px rgba(255, 215, 0, 0.4); }
  100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0); }
}

.piece-image {
  position: absolute;
  top: 0;
  left: 0;
}

/* 暂停按钮 */
.pause-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(8px);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 20;
  transition: all 0.2s ease;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.pause-btn:hover {
  background: rgba(255, 255, 255, 0.4);
  transform: scale(1.1);
}

.pause-btn:active {
  transform: scale(0.95);
}

.pause-btn span {
  font-size: 20px;
  line-height: 1;
}

/* 暂停弹层 */
.pause-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: pauseFadeIn 0.25s ease;
}

@keyframes pauseFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.pause-content {
  background: #fff;
  border-radius: 20px;
  padding: 32px;
  text-align: center;
  width: 90%;
  max-width: 300px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: pauseBounceIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes pauseBounceIn {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.pause-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 8px;
}

.pause-title {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  margin-bottom: 20px;
}

.btn-resume,
.btn-quit {
  display: block;
  width: 100%;
  padding: 13px;
  border-radius: 20px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-resume {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  color: #fff;
  margin-bottom: 10px;
}

.btn-resume:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(79, 172, 254, 0.4);
}

.btn-quit {
  background: #f0f0f0;
  color: #666;
}

.btn-quit:hover {
  background: #e5e5e5;
}

/* 响应式 */
@media (max-width: 480px) {
  .puzzle-board {
    max-width: 280px;
  }
}
</style>
