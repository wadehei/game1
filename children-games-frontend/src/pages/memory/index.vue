<template>
  <div class="memory-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      headerClass="memory-header"
      level-selectable
      @toggleSound="sounds.toggleSound"
      @goBack="router.back()"
      @selectLevel="openLevelSelect"
    />

    <!-- 游戏画布 -->
    <div class="game-board" :style="{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }">
      <div
        v-for="(card, index) in cards"
        :key="index"
        class="card"
        :class="{ flipped: card.flipped || card.matched, matched: card.matched }"
        :style="{ animationDelay: `${index * 0.05}s` }"
        @click="flipCard(index)"
      >
        <div class="card-inner">
          <div class="card-front">
            <img :src="getAnimalImage(card.emoji)" class="card-image" alt="animal" />
          </div>
          <div class="card-back">
            <span class="card-question">⭐</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '恭喜通关！' : '时间到，再试一次！'"
      :info="`用时: ${levelConfig.timeLimit - timeLeft}秒 · 步数: ${moves}步`"
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
import { getLevelOverride } from '@/api/game';
import { speak } from '@/utils/voice';
import { useAdaptiveAssist } from '@/composables/useAdaptiveAssist';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';

import dogSvg from '@/static/images/games/memory/dog.svg';
import catSvg from '@/static/images/games/memory/cat.svg';
import pandaSvg from '@/static/images/games/memory/panda.svg';
import foxSvg from '@/static/images/games/memory/fox.svg';
import frogSvg from '@/static/images/games/memory/frog.svg';
import monkeySvg from '@/static/images/games/memory/monkey.svg';
import pigSvg from '@/static/images/games/memory/pig.svg';
import cowSvg from '@/static/images/games/memory/cow.svg';
import chickenSvg from '@/static/images/games/memory/chicken.svg';
import octopusSvg from '@/static/images/games/memory/octopus.svg';
import lionSvg from '@/static/images/games/memory/lion.svg';
import tigerSvg from '@/static/images/games/memory/tiger.svg';
import bearSvg from '@/static/images/games/memory/bear.svg';
import koalaSvg from '@/static/images/games/memory/koala.svg';
import rabbitSvg from '@/static/images/games/memory/rabbit.svg';
import dragonSvg from '@/static/images/games/memory/dragon.svg';

const emojiToSvg: Record<string, string> = {
  '🐶': dogSvg,
  '🐱': catSvg,
  '🐼': pandaSvg,
  '🦊': foxSvg,
  '🐸': frogSvg,
  '🐵': monkeySvg,
  '🐷': pigSvg,
  '🐮': cowSvg,
  '🐔': chickenSvg,
  '🐙': octopusSvg,
  '🦁': lionSvg,
  '🐯': tigerSvg,
  '🐻': bearSvg,
  '🐨': koalaSvg,
  '🐰': rabbitSvg,
  '🐲': dragonSvg,
};
const getAnimalImage = (emoji: string): string => emojiToSvg[emoji] || dogSvg;

interface Card {
  id: number;
  emoji: string;
  flipped: boolean;
  matched: boolean;
}

const router = useRouter();
const emojis = ['🐶', '🐱', '🐼', '🦊', '🐸', '🐵', '🐷', '🐮', '🐔', '🐙', '🦁', '🐯', '🐻', '🐨', '🐰', '🐲'];

const sounds = useGameSounds();

const currentLevel = ref(1);
const moves = ref(0);
const timeLeft = ref(60);
const cards = ref<Card[]>([]);
const flippedCards = ref<number[]>([]);
const showResult = ref(false);
const gameWon = ref(false);
const stars = ref(0);
const paused = ref(false);
const showLevelSelect = ref(false);
let levelSelectPaused = false;
const { loadStartLevel, saveProgress: saveGameProgress } = useGameProgress('memory');
const assist = useAdaptiveAssist('memory');
let timer: ReturnType<typeof setInterval> | null = null;
let gameEnded = false;
let autoPausedByHidden = false;
let autoPausedByRest = false;

const levelConfig = ref({
  pairs: 2,
  timeLimit: 90,
});

const gridSize = computed(() => {
  const total = levelConfig.value.pairs * 2;
  // 选能整除排列的列数，避免最后一行缺角（6 张 → 3×2，10 张 → 5×2）
  let cols = Math.ceil(Math.sqrt(total));
  while (cols < total && total % cols !== 0) {
    cols++;
  }
  return cols;
});

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '时间', value: `${timeLeft.value}s`, valueClass: timeLeft.value <= 10 ? 'warning' : '' },
  { label: '步数', value: moves.value },
]);

const initGame = () => {
  const { pairs } = levelConfig.value;
  const selectedEmojis = emojis.slice(0, pairs);
  const cardPairs = [...selectedEmojis, ...selectedEmojis];

  // Fisher-Yates 均匀洗牌
  cards.value = shuffle(cardPairs).map((emoji, index) => ({
    id: index,
    emoji,
    flipped: false,
    matched: false,
  }));

  moves.value = 0;
  timeLeft.value = levelConfig.value.timeLimit;
  flippedCards.value = [];
  showResult.value = false;
  gameWon.value = false;
  stars.value = 0;
  gameEnded = false;
  paused.value = false;

  startTimer();
};

// 均匀洗牌，避免 sort(random) 的分布偏差
const shuffle = <T,>(arr: T[]): T[] => {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
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

const chooseLevel = async (level: number) => {
  levelSelectPaused = false;
  showLevelSelect.value = false;
  currentLevel.value = level;
  await applyLevelConfig(level);
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

const flipCard = (index: number) => {
  const card = cards.value[index];
  if (paused.value || card.flipped || card.matched || flippedCards.value.length >= 2) return;

  card.flipped = true;
  flippedCards.value.push(index);
  sounds.play('click');

  if (flippedCards.value.length === 2) {
    moves.value++;
    checkMatch();
  }
};

const checkMatch = () => {
  const [first, second] = flippedCards.value;
  const card1 = cards.value[first];
  const card2 = cards.value[second];

  if (card1.emoji === card2.emoji) {
    card1.matched = true;
    card2.matched = true;
    flippedCards.value = [];
    sounds.play('match');
    checkWin();
  } else {
    sounds.play('bounce');
    setTimeout(() => {
      card1.flipped = false;
      card2.flipped = false;
      flippedCards.value = [];
    }, 800);
  }
};

const checkWin = () => {
  const allMatched = cards.value.every(card => card.matched);
  if (allMatched) {
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
    const timeUsed = levelConfig.value.timeLimit - timeLeft.value;
    const timeRatio = timeUsed / levelConfig.value.timeLimit;
    const moveRatio = moves.value / levelConfig.value.pairs;

    if (timeRatio < 0.5 && moveRatio < 2.5) {
      stars.value = 3;
    } else if (timeRatio < 0.7 && moveRatio < 3.5) {
      stars.value = 2;
    } else {
      stars.value = 1;
    }

    assist.record(true);
    // 保存进度
    saveProgress();
  } else {
    sounds.play('fail');
    assist.record(false);
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

const applyLevelConfig = async (level: number) => {
  const a = assist.level();
  levelConfig.value = {
    pairs: Math.min(2 + Math.floor((level - 1) / 2), 8),
    timeLimit: Math.round(Math.max(90 - (level - 1) * 3, 30) * (1 + 0.3 * a)),
  };
  // 后台难度覆盖优先（离线/未配置时用内置公式）
  const override = await getLevelOverride('memory', level);
  if (override && currentLevel.value === level) {
    levelConfig.value = { ...levelConfig.value, ...override };
  }
};

const nextLevel = async () => {
  currentLevel.value++;
  sounds.play('levelUp');
  // 更新关卡配置
  await applyLevelConfig(currentLevel.value);
  initGame();
};

onMounted(async () => {
  sounds.init();

  // 续关：从上次通关的关卡继续
  currentLevel.value = await loadStartLevel();
  await applyLevelConfig(currentLevel.value);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  document.addEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.addEventListener(GAME_RESUME_EVENT, handleRestResume);
  initGame();
  speak('翻一翻卡片，找出两个一样的图案');
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  document.removeEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.removeEventListener(GAME_RESUME_EVENT, handleRestResume);
  stopTimer();
});
</script>

<style scoped>
.memory-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  position: relative;
}

.memory-header {
  background: rgba(255, 255, 255, 0.2);
  margin-bottom: 12px;
}

:deep(.memory-header .label) {
  color: rgba(255, 255, 255, 0.9);
}

:deep(.memory-header .value) {
  color: #fff;
}

:deep(.memory-header .value.warning) {
  color: #FFD700;
}

:deep(.memory-header .sound-btn) {
  background: rgba(255, 255, 255, 0.2);
}

:deep(.memory-header .back-btn) {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.game-board {
  display: grid;
  gap: 10px;
  padding: 12px;
  max-width: 400px;
  margin: 0 auto;
}

.card {
  aspect-ratio: 1;
  perspective: 1000px;
  cursor: pointer;
  animation: cardAppear 0.3s ease backwards;
}

@keyframes cardAppear {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.card.matched {
  animation: matchGlow 0.5s ease;
}

@keyframes matchGlow {
  0% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0.7); }
  50% { box-shadow: 0 0 20px 10px rgba(255, 215, 0, 0.3); }
  100% { box-shadow: 0 0 0 0 rgba(255, 215, 0, 0); }
}

.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s;
  transform-style: preserve-3d;
}

.card.flipped .card-inner {
  transform: rotateY(180deg);
}

.card-front,
.card-back {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-front {
  background: #fff;
  transform: rotateY(180deg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-back {
  /* 圆点纹理 + 渐变底：比纯色卡背更有"卡牌感" */
  background-image:
    radial-gradient(rgba(255, 255, 255, 0.4) 2.5px, transparent 2.5px),
    linear-gradient(135deg, #FFB347 0%, #FF9A56 100%);
  background-size: 18px 18px, 100% 100%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.card-back::after {
  content: '';
  position: absolute;
  inset: 5px;
  border: 2px dashed rgba(255, 255, 255, 0.65);
  border-radius: 7px;
}

.card-image {
  width: 70%;
  height: 70%;
  object-fit: contain;
}

.card-question {
  font-size: 30px;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.25));
}

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
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  margin-bottom: 10px;
}

.btn-resume:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-quit {
  background: #f0f0f0;
  color: #666;
}

.btn-quit:hover {
  background: #e5e5e5;
}
</style>
