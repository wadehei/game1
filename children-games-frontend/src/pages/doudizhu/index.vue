<template>
  <div class="doudizhu-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="audioSynth.isMuted()"
      header-class="doudizhu-header"
      @toggle-sound="toggleSound"
      @go-back="router.back()"
    />

    <!-- 游戏区域 -->
    <div class="game-area">
      <!-- 上方对手 -->
      <div class="opponent-area top">
        <div class="player-info">
          <span class="role-icon">{{ players[2]?.isLandlord ? '👑' : '🎮' }}</span>
          <span class="player-name">{{ players[2]?.name || '对手' }}</span>
          <span class="card-count">{{ players[2]?.cards.length || 0 }}张</span>
        </div>
        <div class="opponent-cards">
          <CardBack v-for="i in players[2]?.cards.length || 0" :key="i" :width="30" :height="42" />
        </div>
        <div v-if="lastPlayByPlayer[2]" class="play-area">
          <CardItem
            v-for="card in lastPlayByPlayer[2]"
            :key="card.id"
            :card="card"
            :width="45"
            :height="63"
          />
        </div>
      </div>

      <!-- 中间区域：底牌 + 出牌区 -->
      <div class="center-area">
        <!-- 底牌 -->
        <div v-if="showBottomCards" class="bottom-cards">
          <div class="label">底牌</div>
          <div class="cards">
            <CardItem
              v-for="card in bottomCards"
              :key="card.id"
              :card="card"
              :width="40"
              :height="56"
            />
          </div>
        </div>

        <!-- 左侧对手出牌 -->
        <div v-if="lastPlayByPlayer[1]" class="side-play left">
          <CardItem
            v-for="card in lastPlayByPlayer[1]"
            :key="card.id"
            :card="card"
            :width="45"
            :height="63"
          />
        </div>

        <!-- 右侧提示（pass等） -->
        <div v-if="currentAction" class="action-display">
          <span class="action-text">{{ currentAction }}</span>
        </div>
      </div>

      <!-- 下方：玩家手牌 -->
      <div class="player-area bottom">
        <div class="player-info">
          <span class="role-icon">{{ players[0]?.isLandlord ? '👑' : '🎮' }}</span>
          <span class="player-name">{{ players[0]?.name || '你' }}</span>
        </div>
        <HandCards
          :cards="players[0]?.cards || []"
          :selected-ids="selectedCardIds"
          :selectable="isMyTurn"
          @select="selectCard"
          @deselect="deselectCard"
        />
      </div>

      <!-- 左侧对手信息 -->
      <div class="opponent-info left-info">
        <div class="player-info vertical">
          <span class="role-icon">{{ players[1]?.isLandlord ? '👑' : '🎮' }}</span>
          <span class="player-name">{{ players[1]?.name || '对手' }}</span>
          <span class="card-count">{{ players[1]?.cards.length || 0 }}张</span>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div v-if="gameStatus === 'playing' && isMyTurn" class="action-bar">
      <button class="action-btn hint" @click="showHint">提示</button>
      <button class="action-btn pass" :disabled="!canPass" @click="playPass">不出</button>
      <button class="action-btn play" :disabled="selectedCardIds.length === 0" @click="playCards">
        出牌
      </button>
    </div>

    <!-- 叫地主按钮 -->
    <div v-if="gameStatus === 'bidding' && currentBidder === 0" class="bid-bar">
      <button class="bid-btn no" @click="bid(0)">不叫</button>
      <button class="bid-btn" @click="bid(1)">1分</button>
      <button class="bid-btn" @click="bid(2)">2分</button>
      <button class="bid-btn yes" @click="bid(3)">3分</button>
    </div>

    <!-- 开始按钮 -->
    <div v-if="gameStatus === 'waiting'" class="start-bar">
      <button class="start-btn" @click="startGame">开始游戏</button>
    </div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '恭喜获胜！' : '再接再厉！'"
      :info="resultInfo"
      @retry="restartGame"
      @next="nextLevel"
    />

    <!-- 暂停 -->
    <PauseMenu :show="paused" @pause="pauseGame" @resume="resumeGame" @quit="quitGame" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { Card, GameStatus, Player, PatternResult, CardPattern, AIDifficulty } from './utils/types';
import { dealCards, sortCards } from './utils/deck';
import { analyzePattern, canBeat, findBeatingPlays } from './utils/pattern';
import { decideAIPlay, decideAIBid, AIContext } from './utils/ai';
import { getAudioSynth } from './audio/synth';
import { useGameProgress } from '@/composables/useGameProgress';
import { useGameLifecycle } from '@/composables/useGameLifecycle';
import { getLevelOverride } from '@/api/game';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';
import CardItem from './components/CardItem.vue';
import CardBack from './components/CardBack.vue';
import HandCards from './components/HandCards.vue';

const router = useRouter();
const audioSynth = getAudioSynth();

const { loadStartLevel, saveProgress, recordPlay } = useGameProgress('doudizhu');
const currentLevel = ref(1);

// 关卡配置（支持云端覆盖）
interface LevelConfig {
  aiDifficulty: AIDifficulty;
  playerFirstBid: boolean;
  aiThinkTime: number;
  targetMultiplier: number;
}

const defaultLevelConfig = (level: number): LevelConfig => {
  let aiDifficulty: AIDifficulty = 'easy';
  if (level > 20) aiDifficulty = 'hard';
  else if (level > 10) aiDifficulty = 'normal';

  return {
    aiDifficulty,
    playerFirstBid: level <= 5,
    aiThinkTime: Math.max(2000 - level * 50, 500),
    targetMultiplier: Math.min(2 + Math.floor(level / 5), 8),
  };
};

const levelConfig = ref<LevelConfig>(defaultLevelConfig(1));

// 游戏状态
const gameStatus = ref<GameStatus>(GameStatus.Waiting);
const players = ref<Player[]>([]);
const bottomCards = ref<Card[]>([]);
const showBottomCards = ref(false);
const currentPlayer = ref(0);
const landlordPlayer = ref(-1);
const currentBid = ref(0);
const currentBidder = ref(0);
const highestBidder = ref(-1); // 最高叫分者
const multiplier = ref(1);
const lastPlay = ref<PatternResult | null>(null);
const lastPlayByPlayer = ref<(Card[] | null)[]>([null, null, null]);
const lastActivePlayer = ref(-1);
const passCount = ref(0);

// 玩家操作
const selectedCardIds = ref<number[]>([]);
const paused = ref(false);
const showResult = ref(false);
const gameWon = ref(false);
const stars = ref(0);
const resultInfo = ref('');
const currentAction = ref('');
const bidCount = ref(0); // 叫分次数追踪

// 计算属性
const isMyTurn = computed(() => {
  return gameStatus.value === GameStatus.Playing && currentPlayer.value === 0 && !paused.value;
});

const canPass = computed(() => {
  return lastPlay.value !== null && lastActivePlayer.value !== 0;
});

const headerItems = computed(() => [
  { label: '关卡', value: currentLevel.value },
  { label: '倍数', value: `x${multiplier.value}` },
  { label: '底分', value: currentBid.value || '叫分中' },
]);

// 初始化游戏
const initGame = () => {
  const [hand0, hand1, hand2, bottom] = dealCards();

  players.value = [
    { id: 0, name: '你', cards: hand0, isLandlord: false, isHuman: true },
    { id: 1, name: '电脑A', cards: hand1, isLandlord: false, isHuman: false },
    { id: 2, name: '电脑B', cards: hand2, isLandlord: false, isHuman: false },
  ];

  bottomCards.value = bottom;
  showBottomCards.value = false;
  currentPlayer.value = 0;
  landlordPlayer.value = -1;
  currentBid.value = 0;
  currentBidder.value = Math.floor(Math.random() * 3);
  highestBidder.value = -1;
  multiplier.value = 1;
  lastPlay.value = null;
  lastPlayByPlayer.value = [null, null, null];
  lastActivePlayer.value = -1;
  passCount.value = 0;
  selectedCardIds.value = [];
  showResult.value = false;
  gameStatus.value = GameStatus.Waiting;
  bidCount.value = 0; // 重置叫分次数
};

// 开始游戏（进入叫地主阶段）
const startGame = () => {
  audioSynth.resume();
  audioSynth.play('deal');
  gameStatus.value = GameStatus.Dealing;

  // 发牌动画（简化：直接发完）
  setTimeout(() => {
    audioSynth.playDeal();
    gameStatus.value = GameStatus.Bidding;

    // 如果是AI先叫，触发AI叫分
    if (currentBidder.value !== 0) {
      setTimeout(aiBid, 1000);
    }
  }, 500);
};

// AI叫分
const aiBid = () => {
  if (gameStatus.value !== GameStatus.Bidding) return;
  if (currentBidder.value === 0) return;

  const player = players.value[currentBidder.value];
  const bid = decideAIBid(player.cards, currentBid.value, levelConfig.value.aiDifficulty);
  bidCount.value++;

  if (bid > currentBid.value) {
    currentBid.value = bid;
    highestBidder.value = currentBidder.value;
    audioSynth.play('bid');
    currentAction.value = `${player.name} 叫 ${bid} 分`;
  } else {
    currentAction.value = `${player.name} 不叫`;
  }

  // 检查叫分是否结束
  if (currentBid.value === 3) {
    // 叫3分直接成为地主
    finishBidding();
  } else if (bidCount.value >= 3 && currentBid.value === 0) {
    // 所有人都不叫，重新发牌
    currentAction.value = '所有人都不叫，重新发牌...';
    setTimeout(() => {
      initGame();
      startGame();
    }, 2000);
  } else if (bidCount.value >= 3) {
    // 三人都叫过分，最高分者成为地主
    finishBidding();
  } else {
    // 下一个玩家叫分
    currentBidder.value = (currentBidder.value + 1) % 3;

    if (currentBidder.value === 0) {
      // 轮到玩家叫分
      currentAction.value = '';
    } else {
      setTimeout(aiBid, 1500);
    }
  }
};

// 玩家叫分
const bid = (score: number) => {
  audioSynth.play('bid');
  bidCount.value++;

  if (score > currentBid.value) {
    currentBid.value = score;
    highestBidder.value = 0; // 玩家是索引0
  }

  // 检查是否结束
  if (currentBid.value === 3) {
    // 叫3分直接成为地主
    finishBidding();
  } else if (bidCount.value >= 3 && currentBid.value === 0) {
    // 所有人都不叫，重新发牌
    currentAction.value = '所有人都不叫，重新发牌...';
    setTimeout(() => {
      initGame();
      startGame();
    }, 2000);
  } else if (bidCount.value >= 3) {
    // 三人都叫过分，最高分者成为地主
    finishBidding();
  } else {
    currentBidder.value = (currentBidder.value + 1) % 3;
    if (currentBidder.value !== 0) {
      setTimeout(aiBid, 1000);
    }
  }
};

// 完成叫地主
const finishBidding = () => {
  // 确定地主（使用最高叫分者，而非最后叫分者）
  if (landlordPlayer.value === -1) {
    if (currentBid.value === 0) {
      // 所有人都不叫的情况不应该走到这里，但做防御处理
      currentAction.value = '所有人都不叫，重新发牌...';
      setTimeout(() => {
        initGame();
        startGame();
      }, 2000);
      return;
    }
    landlordPlayer.value = highestBidder.value;
  }

  // 设置地主标志
  players.value[landlordPlayer.value].isLandlord = true;

  // 把底牌给地主（不可变更新，不直接修改原数组）
  const updatedCards = sortCards([
    ...players.value[landlordPlayer.value].cards,
    ...bottomCards.value,
  ]);
  players.value[landlordPlayer.value] = {
    ...players.value[landlordPlayer.value],
    cards: updatedCards,
  };

  showBottomCards.value = true;
  audioSynth.play('landlord');

  // 开始出牌
  setTimeout(() => {
    gameStatus.value = GameStatus.Playing;
    currentPlayer.value = landlordPlayer.value;
    currentAction.value = '';

    if (currentPlayer.value !== 0) {
      setTimeout(aiPlay, 1000);
    }
  }, 1500);
};

// 选牌
const selectCard = (card: Card) => {
  if (!selectedCardIds.value.includes(card.id)) {
    selectedCardIds.value.push(card.id);
    audioSynth.play('select');
  }
};

const deselectCard = (card: Card) => {
  selectedCardIds.value = selectedCardIds.value.filter((id) => id !== card.id);
  audioSynth.play('deselect');
};

// 出牌
const playCards = () => {
  if (selectedCardIds.value.length === 0) return;

  // 输入验证：确保选中的牌都在自己手牌中
  const myHand = players.value[0].cards;
  const myHandIds = new Set(myHand.map((c) => c.id));
  const invalidIds = selectedCardIds.value.filter((id) => !myHandIds.has(id));
  if (invalidIds.length > 0) {
    currentAction.value = '选择了不存在的牌';
    setTimeout(() => (currentAction.value = ''), 1500);
    return;
  }

  // 数量上限校验
  if (selectedCardIds.value.length > 20) {
    currentAction.value = '出牌数量过多';
    setTimeout(() => (currentAction.value = ''), 1500);
    return;
  }

  const selectedCards = myHand.filter((c) => selectedCardIds.value.includes(c.id));
  const pattern = analyzePattern(selectedCards);

  if (pattern.pattern === CardPattern.Invalid) {
    currentAction.value = '无效牌型';
    setTimeout(() => (currentAction.value = ''), 1500);
    return;
  }

  // 检查是否能打过上家
  if (lastPlay.value && canBeat(pattern, lastPlay.value) === false) {
    currentAction.value = '打不过上家';
    setTimeout(() => (currentAction.value = ''), 1500);
    return;
  }

  // 出牌
  executePlay(0, selectedCards, pattern);
};

// 不出
const playPass = () => {
  if (!canPass.value) return;

  audioSynth.play('pass');
  lastPlayByPlayer.value[0] = null;
  passCount.value++;
  currentAction.value = '不出';

  setTimeout(() => {
    currentAction.value = '';
    nextPlayer();
  }, 800);
};

// 提示
const showHint = () => {
  if (!lastPlay.value) {
    // 自由出牌，提示最小的单张
    const card = players.value[0].cards[0];
    selectedCardIds.value = [card.id];
    audioSynth.play('hint');
    return;
  }

  const beating = findBeatingPlays(players.value[0].cards, lastPlay.value);
  if (beating.length > 0) {
    selectedCardIds.value = beating[0].cards.map((c) => c.id);
    audioSynth.play('hint');
  } else {
    currentAction.value = '没有能打的牌';
    setTimeout(() => (currentAction.value = ''), 1500);
  }
};

// 执行出牌
const executePlay = (playerIdx: number, cards: Card[], pattern: PatternResult) => {
  // 从手牌移除（使用 ID 比较确保正确移除）
  const player = players.value[playerIdx];
  const playIds = new Set(cards.map((c) => c.id));
  player.cards = player.cards.filter((c) => !playIds.has(c.id));

  // 更新状态
  lastPlay.value = pattern;
  lastPlayByPlayer.value[playerIdx] = cards;
  lastActivePlayer.value = playerIdx;
  passCount.value = 0;
  selectedCardIds.value = [];

  // 更新倍数
  if (pattern.pattern === CardPattern.Bomb) {
    multiplier.value *= 2;
    audioSynth.playPlaySound('bomb');
  } else if (pattern.pattern === CardPattern.Rocket) {
    multiplier.value *= 2;
    audioSynth.playPlaySound('rocket');
  } else {
    audioSynth.playPlaySound(pattern.pattern);
  }

  // 检查是否获胜
  if (player.cards.length === 0) {
    endGame(playerIdx);
    return;
  }

  // 下一个玩家
  setTimeout(nextPlayer, 500);
};

// 下一个玩家
const nextPlayer = () => {
  currentPlayer.value = (currentPlayer.value + 1) % 3;

  // 如果回到最后出牌的玩家，清空lastPlay（新一轮）
  if (currentPlayer.value === lastActivePlayer.value) {
    lastPlay.value = null;
    lastPlayByPlayer.value = [null, null, null];
  }

  // AI出牌
  if (currentPlayer.value !== 0) {
    setTimeout(aiPlay, 800);
  }
};

// AI出牌
const aiPlay = () => {
  if (gameStatus.value !== GameStatus.Playing) return;
  if (currentPlayer.value === 0) return;

  const playerIdx = currentPlayer.value;
  const player = players.value[playerIdx];

  const isFreePlay = !lastPlay.value || lastActivePlayer.value === playerIdx;
  const aiDifficulty = levelConfig.value.aiDifficulty;

  // 构建 AI 上下文
  const context: AIContext = {
    handSizes: [
      players.value[0].cards.length,
      players.value[1].cards.length,
      players.value[2].cards.length,
    ] as [number, number, number],
    multiplier: multiplier.value,
  };

  if (isFreePlay) {
    // 自由出牌
    const play = decideAIPlay(
      player.cards,
      null,
      playerIdx,
      playerIdx,
      landlordPlayer.value,
      aiDifficulty,
      context
    );
    if (play) {
      const pattern = analyzePattern(play);
      executePlay(playerIdx, play, pattern);
    }
    return;
  }

  // 跟牌
  const cards = decideAIPlay(
    player.cards,
    lastPlay.value,
    lastActivePlayer.value,
    playerIdx,
    landlordPlayer.value,
    aiDifficulty,
    context
  );

  if (cards) {
    const pattern = analyzePattern(cards);
    executePlay(playerIdx, cards, pattern);
  } else {
    // pass
    audioSynth.play('pass');
    lastPlayByPlayer.value[playerIdx] = null;
    passCount.value++;
    currentAction.value = `${player.name} 不出`;

    setTimeout(() => {
      currentAction.value = '';
      nextPlayer();
    }, 800);
  }
};

// 游戏结束
const endGame = (winnerIdx: number) => {
  gameStatus.value = GameStatus.Finished;

  const isLandlordWin = winnerIdx === landlordPlayer.value;
  const playerIsLandlord = landlordPlayer.value === 0;

  // 判断玩家是否获胜
  if (playerIsLandlord) {
    gameWon.value = isLandlordWin;
  } else {
    gameWon.value = !isLandlordWin;
  }

  // 春天/反春天判定（×2 倍数）
  // 春天：地主获胜且两个农民都没出过牌
  // 反春天：农民获胜且地主只出过一手牌
  const landlordCardsPlayed = players.value[landlordPlayer.value]?.cards.length === 0;
  if (isLandlordWin) {
    // 地主胜：检查春天（农民均未出牌 —— 通过手牌数判断：农民手牌仍为17张说明没出过）
    const farmersAllUnplayed = players.value.every((p) => p.isLandlord || p.cards.length === 17);
    if (farmersAllUnplayed) {
      multiplier.value *= 2;
    }
  } else if (!landlordCardsPlayed || players.value[landlordPlayer.value]?.cards.length === 16) {
    // 农民胜：地主只出了1手牌就输了 = 反春天
    // 地主初始17+3=20张，出1手后至少剩余16张
    const landlordRemaining = players.value[landlordPlayer.value]?.cards.length ?? 20;
    if (landlordRemaining >= 16) {
      multiplier.value *= 2;
    }
  }

  // 计算星级
  if (gameWon.value) {
    // 检查是否达到目标倍数
    const reachTarget = multiplier.value >= levelConfig.value.targetMultiplier;

    if (reachTarget && multiplier.value >= 4) {
      stars.value = 3;
    } else if (reachTarget || multiplier.value >= 2) {
      stars.value = 2;
    } else {
      stars.value = 1;
    }
    audioSynth.play('win');
    saveProgress({ level: currentLevel.value, score: multiplier.value, stars: stars.value });
  } else {
    stars.value = 0;
    audioSynth.play('lose');
    // 失败也记录游玩次数
    recordPlay();
  }

  resultInfo.value = `倍数: x${multiplier.value} · 目标: x${levelConfig.value.targetMultiplier}`;
  showResult.value = true;
};

// 重新开始
const restartGame = () => {
  initGame();
  startGame();
};

const nextLevel = async () => {
  currentLevel.value++;
  audioSynth.play('levelUp');
  await loadLevelConfig(currentLevel.value);
  initGame();
  startGame();
};

// 音效控制
const toggleSound = () => {
  audioSynth.toggleMute();
};

// 暂停
const pauseGame = () => {
  paused.value = true;
};

const resumeGame = () => {
  paused.value = false;
};

const quitGame = () => {
  router.back();
};

// 生命周期
let autoPausedByRest = false;

const handlePause = () => {
  if (!paused.value) {
    autoPausedByRest = true;
    pauseGame();
  }
};

const handleResume = () => {
  if (autoPausedByRest) {
    autoPausedByRest = false;
    resumeGame();
  }
};

// 加载关卡配置（支持云端覆盖）
const loadLevelConfig = async (level: number) => {
  const base = defaultLevelConfig(level);
  levelConfig.value = base;

  // 尝试读取云端覆盖
  const override = await getLevelOverride('doudizhu', level);
  if (override && currentLevel.value === level) {
    levelConfig.value = {
      aiDifficulty: (override.aiDifficulty as AIDifficulty) || base.aiDifficulty,
      playerFirstBid: override.playerFirstBid ?? base.playerFirstBid,
      aiThinkTime: override.aiThinkTime ?? base.aiThinkTime,
      targetMultiplier: override.targetMultiplier ?? base.targetMultiplier,
    };
  }
};

useGameLifecycle({ onPause: handlePause, onResume: handleResume });

onMounted(async () => {
  audioSynth.init();
  currentLevel.value = await loadStartLevel();
  await loadLevelConfig(currentLevel.value);
  initGame();
});

onUnmounted(() => {
  audioSynth.destroy();
});
</script>

<style scoped>
.doudizhu-game {
  height: 100vh;
  background: linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%);
  padding: 10px;
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.doudizhu-header {
  background: rgba(0, 0, 0, 0.3);
  margin-bottom: 10px;
  flex-shrink: 0;
}

:deep(.doudizhu-header .label) {
  color: rgba(255, 255, 255, 0.7);
}

:deep(.doudizhu-header .value) {
  color: white;
}

:deep(.doudizhu-header .sound-btn) {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

:deep(.doudizhu-header .back-btn) {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.game-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.opponent-area {
  display: flex;
  align-items: center;
  padding: 10px;
  gap: 10px;
}

.opponent-area.top {
  justify-content: center;
}

.opponent-cards {
  display: flex;
  gap: 2px;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.3);
  padding: 6px 12px;
  border-radius: 20px;
  color: white;
  font-size: 14px;
}

.player-info .role-icon {
  font-size: 18px;
}

.card-count {
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.center-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  min-height: 100px;
}

.bottom-cards {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.bottom-cards .label {
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}

.bottom-cards .cards {
  display: flex;
  gap: 5px;
}

.side-play {
  position: absolute;
  display: flex;
  gap: 3px;
}

.side-play.left {
  left: 60px;
  top: 50%;
  transform: translateY(-50%);
}

.action-display {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.6);
  padding: 10px 20px;
  border-radius: 20px;
  color: white;
  font-size: 16px;
}

.player-area.bottom {
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.opponent-info.left-info {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
}

.player-info.vertical {
  flex-direction: column;
  padding: 10px;
}

/* 操作按钮 */
.action-bar,
.bid-bar,
.start-bar {
  display: flex;
  justify-content: center;
  gap: 15px;
  padding: 15px;
  flex-shrink: 0;
}

.action-btn,
.bid-btn,
.start-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 25px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.action-btn:disabled,
.bid-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.hint {
  background: #2196f3;
  color: white;
}

.action-btn.pass {
  background: #757575;
  color: white;
}

.action-btn.play {
  background: #4caf50;
  color: white;
}

.bid-btn {
  background: #ff9800;
  color: white;
}

.bid-btn.no {
  background: #757575;
}

.bid-btn.yes {
  background: #f44336;
}

.start-btn {
  background: #4caf50;
  color: white;
  padding: 15px 40px;
  font-size: 18px;
}

.action-btn:not(:disabled):hover,
.bid-btn:not(:disabled):hover,
.start-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.play-area {
  display: flex;
  gap: 3px;
}
</style>
