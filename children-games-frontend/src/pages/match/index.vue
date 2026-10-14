<template>
  <div class="match-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="sounds.isMuted.value"
      headerClass="match-header"
      level-selectable
      @toggleSound="sounds.toggleSound"
      @goBack="router.back()"
      @selectLevel="openLevelSelect"
    />

    <!-- 状态提示 -->
    <div class="status-bar">
      <span class="status-text">{{ statusText }}</span>
    </div>

    <!-- 连线棋盘：左列 + 连线 + 右列 -->
    <div class="match-board">
      <svg class="lines-svg" :viewBox="`0 0 100 ${svgHeight}`" preserveAspectRatio="none">
        <line
          v-for="(line, i) in lines"
          :key="i"
          :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2"
          :class="['match-line', { wrong: line.wrong }]"
        />
      </svg>

      <div class="item-col left-col">
        <button
          v-for="item in leftItems"
          :key="item.id"
          class="match-item"
          :class="itemClass(item, 'left')"
          @click="tapItem(item, 'left')"
        >
          <span v-if="item.emojiCount" class="emoji-count">
            <span v-for="n in item.emojiCount" :key="n">{{ item.emoji }}</span>
          </span>
          <span v-else-if="item.emoji" class="item-emoji">{{ item.emoji }}</span>
          <span v-else class="item-text">{{ item.text }}</span>
        </button>
      </div>

      <div class="col-gap" />

      <div class="item-col right-col">
        <button
          v-for="item in rightItems"
          :key="item.id"
          class="match-item"
          :class="itemClass(item, 'right')"
          @click="tapItem(item, 'right')"
        >
          <span v-if="item.emojiCount" class="emoji-count">
            <span v-for="n in item.emojiCount" :key="n">{{ item.emoji }}</span>
          </span>
          <span v-else-if="item.emoji" class="item-emoji">{{ item.emoji }}</span>
          <span v-else class="item-text">{{ item.text }}</span>
        </button>
      </div>
    </div>

    <div class="tip-text">点击左边和右边一对好朋友的文字或图片！</div>

    <!-- 游戏结果弹窗（通关自动开始下一关） -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '全部连对啦！' : '时间到了，再试一次！'"
      :info="`剩余 ${timeLeft} 秒`"
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
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameProgress } from '@/composables/useGameProgress';
import { GAME_PAUSE_EVENT, GAME_RESUME_EVENT } from '@/utils/gameEvents';
import { getLevelOverride } from '@/api/game';
import { speak } from '@/utils/voice';
import { defaultLevelConfig } from '@/utils/levelDefaults';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';

interface Item {
  id: string; // 唯一键（左右两侧同 pair 的 id 相同）
  emoji?: string;
  emojiCount?: number;
  text?: string;
  bg?: string;
}

const router = useRouter();
const sounds = useGameSounds();
const { loadStartLevel, saveProgress: saveGameProgress, recordPlay } = useGameProgress('match');

const currentLevel = ref(1);
const timeLeft = ref(120);
const showResult = ref(false);
const gameWon = ref(false);
const stars = ref(0);
const showLevelSelect = ref(false);
const paused = ref(false);

const leftItems = ref<Item[]>([]);
const rightItems = ref<Item[]>([]);
const matchedIds = ref<Set<string>>(new Set());
const selected = ref<{ item: Item; side: 'left' | 'right' } | null>(null);
const wrongPair = ref<{ left: string; right: string } | null>(null);

const levelConfig = ref<Record<string, any>>({ pairs: 3, timeLimit: 120 });

let gameEnded = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;

// ── 内容池（三种类型按关卡轮换） ──
const COUNT_POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ANIMAL_PAIRS: [string, string][] = [
  ['🐰', '🥕'], ['🐼', '🎋'], ['🐱', '🐟'], ['🐭', '🧀'],
  ['🐶', '🦴'], ['🐒', '🍌'], ['🐘', '🍉'], ['🐿️', '🌰'],
];
const COLOR_PAIRS: [string, string][] = [
  ['🔴', '红'], ['🟡', '黄'], ['🟢', '绿'], ['🔵', '蓝'], ['🟣', '紫'], ['🟠', '橙'],
];

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const buildRound = (level: number, pairs: number) => {
  const typeIdx = Math.floor((level - 1) / 3) % 3;
  const left: Item[] = [];
  const right: Item[] = [];

  if (typeIdx === 0) {
    // 数字 ↔ 数量（左右两侧共用配对 id，判定按 id 相等）
    const nums = shuffle(COUNT_POOL).slice(0, pairs);
    for (const n of nums) {
      left.push({ id: `p-${n}`, text: String(n) });
      right.push({ id: `p-${n}`, emoji: '🍎', emojiCount: n });
    }
  } else if (typeIdx === 1) {
    // 动物 ↔ 爱吃的食物
    const ps = shuffle(ANIMAL_PAIRS).slice(0, pairs);
    for (const [animal, food] of ps) {
      left.push({ id: `p-${animal}`, emoji: animal });
      right.push({ id: `p-${animal}`, emoji: food });
    }
  } else {
    // 颜色圆点 ↔ 汉字
    const ps = shuffle(COLOR_PAIRS).slice(0, pairs);
    for (const [dot, label] of ps) {
      left.push({ id: `p-${label}`, emoji: dot });
      right.push({ id: `p-${label}`, text: label });
    }
  }

  leftItems.value = left;
  rightItems.value = shuffle(right);
  matchedIds.value = new Set();
  selected.value = null;
  wrongPair.value = null;
};

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '进度', value: `${matchedIds.value.size}/${levelConfig.value.pairs}` },
  { label: '时间', value: `${timeLeft.value}s` },
]);

const statusText = computed(() => {
  if (gameEnded) return gameWon.value ? '全部连对，太棒了！' : '时间到啦～';
  if (paused.value) return '游戏暂停中';
  if (selected.value) return '再点右边配对的小伙伴';
  return '点击左边和右边一对好朋友';
});

// ── 连线坐标 ──
const svgHeight = computed(() => Math.max(leftItems.value.length, rightItems.value.length) * 20);
const lines = computed(() => {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; wrong?: boolean }> = [];
  const li = leftItems.value.findIndex((it) => matchedIds.value.has(it.id) || (wrongPair.value && wrongPair.value.left === it.id));
  if (li === -1) return lines;
  const leftY = li * 20 + 10;
  const rightIdx = rightItems.value.findIndex((it) => it.id === (wrongPair.value ? selectedPairRightId.value : li >= 0 ? leftItems.value[li]?.id : ''));
  lines.push({
    x1: 28, y1: leftY,
    x2: 72, y2: rightIdx * 20 + 10,
    wrong: !!wrongPair.value,
  });
  return lines;
});
const selectedPairRightId = ref('');

const itemClass = (item: Item, side: 'left' | 'right') => ({
  selected: selected.value?.side === side && selected.value.item.id === item.id,
  matched: matchedIds.value.has(item.id),
  wrong: !!wrongPair.value && ((side === 'left' && wrongPair.value.left === item.id) || (side === 'right' && wrongPair.value.right === item.id)),
});

// ── 交互 ──
const tapItem = (item: Item, side: 'left' | 'right') => {
  if (gameEnded || paused.value) return;
  if (matchedIds.value.has(item.id)) return;
  sounds.play('click');

  if (side === 'left') {
    selected.value = { item, side };
    return;
  }
  if (!selected.value) return;

  if (selected.value.item.id === item.id) {
    // 配对成功
    matchedIds.value.add(item.id);
    selectedPairRightId.value = item.id;
    selected.value = null;
    sounds.play('match');
    if (matchedIds.value.size >= levelConfig.value.pairs) {
      endGame(true);
    }
  } else {
    // 配对失败：闪红
    wrongPair.value = { left: selected.value.item.id, right: item.id };
    selectedPairRightId.value = item.id;
    sounds.play('fail');
    setTimeout(() => {
      wrongPair.value = null;
      selected.value = null;
    }, 500);
  }
};

// ── 计时 ──
const tick = () => {
  if (paused.value || gameEnded) return;
  timeLeft.value -= 1;
  if (timeLeft.value <= 0) {
    timeLeft.value = 0;
    endGame(false);
  }
};

// ── 生命周期流程 ──
const initGame = () => {
  gameEnded = false;
  showResult.value = false;
  gameWon.value = false;
  stars.value = 0;
  timeLeft.value = levelConfig.value.timeLimit;
  buildRound(currentLevel.value, levelConfig.value.pairs);
  sounds.play('click');
  speak('把左边和右边一对好朋友连起来吧！');
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, 1000);
  nextTick(() => renderFonts());
};

const renderFonts = () => void 0;

const endGame = (won: boolean) => {
  if (gameEnded) return;
  gameEnded = true;
  gameWon.value = won;
  if (tickTimer) clearInterval(tickTimer);
  if (won) {
    sounds.play('match');
    const ratio = timeLeft.value / levelConfig.value.timeLimit;
    stars.value = ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
    saveGameProgress({ level: currentLevel.value + 1, score: timeLeft.value, stars: stars.value });
  } else {
    sounds.play('fail');
  }
  recordPlay();
  showResult.value = true;
};

const restartGame = () => initGame();

const nextLevel = async () => {
  currentLevel.value += 1;
  sounds.play('levelUp');
  await applyLevelConfig(currentLevel.value);
  initGame();
};

const applyLevelConfig = async (level: number) => {
  const base = defaultLevelConfig('match', level);
  levelConfig.value = { ...base };
  const override = await getLevelOverride('match', level);
  if (override && currentLevel.value === level) {
    levelConfig.value = { ...levelConfig.value, ...override };
  }
};

// ── 暂停（手动 + 护眼） ──
const pauseGame = () => (paused.value = true);
const resumeGame = () => (paused.value = false);

const handleRestPause = () => {
  paused.value = true;
};
const handleRestResume = () => {
  paused.value = false;
};

const openLevelSelect = () => {
  if (!gameEnded) paused.value = true;
  showLevelSelect.value = true;
};

const chooseLevel = async (level: number) => {
  showLevelSelect.value = false;
  paused.value = false;
  currentLevel.value = level;
  await applyLevelConfig(level);
  initGame();
};

const quitGame = () => {
  router.back();
};

onMounted(async () => {
  sounds.init();
  document.addEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.addEventListener(GAME_RESUME_EVENT, handleRestResume);

  currentLevel.value = await loadStartLevel();
  await applyLevelConfig(currentLevel.value);
  initGame();
});

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
  document.removeEventListener(GAME_PAUSE_EVENT, handleRestPause);
  document.removeEventListener(GAME_RESUME_EVENT, handleRestResume);
});
</script>

<style scoped>
.match-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #fdeff4 0%, #e8ecf1 100%);
  padding: 16px;
  box-sizing: border-box;
}

.status-bar {
  text-align: center;
  margin-bottom: 10px;
}

.status-text {
  background: #fff;
  border-radius: 12px;
  padding: 8px 18px;
  font-size: 14px;
  color: #555;
  display: inline-block;
}

.match-board {
  position: relative;
  display: flex;
  justify-content: space-between;
  max-width: 420px;
  margin: 0 auto;
}

.lines-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.match-line {
  stroke: #27ae60;
  stroke-width: 1.4;
  stroke-linecap: round;
}

.match-line.wrong {
  stroke: #e74c3c;
}

.item-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 38%;
  z-index: 2;
}

.col-gap {
  width: 24%;
}

.match-item {
  border: 2px solid #e3e8ef;
  background: #fff;
  border-radius: 14px;
  padding: 12px 8px;
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.12s ease;
}

.match-item.selected {
  border-color: #667eea;
  background: #eef1fd;
  transform: scale(1.03);
}

.match-item.matched {
  border-color: #27ae60;
  background: #e9f7ef;
  opacity: 0.75;
}

.match-item.wrong {
  border-color: #e74c3c;
  background: #fdecea;
  animation: shake 0.4s;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

.item-emoji {
  font-size: 30px;
}

.item-text {
  font-size: 18px;
  font-weight: bold;
  color: #333;
}

.emoji-count {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  font-size: 18px;
  line-height: 1.1;
  max-width: 100%;
}

.tip-text {
  text-align: center;
  font-size: 12px;
  color: #b3bac4;
  margin-top: 12px;
}
</style>
