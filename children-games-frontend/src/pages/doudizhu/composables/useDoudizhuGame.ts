/**
 * 斗地主游戏编排 composable
 * 创建共享状态，组合 useBidding + useCardPlay，管理生命周期
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { Card, GameStatus, Player, AIDifficulty } from '../utils/types';
import { dealCards } from '../utils/deck';
import { getAudioSynth, AudioSynth } from '../audio/synth';
import { useGameProgress } from '@/composables/useGameProgress';
import { useGameLifecycle } from '@/composables/useGameLifecycle';
import { getLevelOverride } from '@/api/game';
import { useBidding, type LevelConfig } from './useBidding';
import { useCardPlay } from './useCardPlay';

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

export function useDoudizhuGame() {
  const router = useRouter();
  const audioSynth: AudioSynth = getAudioSynth();
  const { loadStartLevel, saveProgress, recordPlay } = useGameProgress('doudizhu');

  // ─── 共享状态 ───
  const gameStatus = ref<GameStatus>(GameStatus.Waiting);
  const players = ref<Player[]>([]);
  const bottomCards = ref<Card[]>([]);
  const showBottomCards = ref(false);
  const currentPlayer = ref(0);
  const landlordPlayer = ref(-1);
  const multiplier = ref(1);
  const currentAction = ref('');

  // UI 状态
  const paused = ref(false);
  const showResult = ref(false);
  const gameWon = ref(false);
  const stars = ref(0);
  const resultInfo = ref('');

  // 关卡配置
  const currentLevel = ref(1);
  const levelConfig = ref<LevelConfig>(defaultLevelConfig(1));

  // ─── 子 composable ───

  const bidding = useBidding({
    players,
    gameStatus,
    landlordPlayer,
    bottomCards,
    showBottomCards,
    currentPlayer,
    currentAction,
    levelConfig,
    audioSynth,
    onBiddingComplete: () => {
      if (currentPlayer.value !== 0) {
        setTimeout(() => cardPlay.aiPlay(), 1000);
      }
    },
    onRedeal: () => {
      initGame();
      startGame();
    },
  });

  const cardPlay = useCardPlay({
    players,
    gameStatus,
    currentPlayer,
    landlordPlayer,
    multiplier,
    currentAction,
    paused,
    levelConfig,
    audioSynth,
    onWin: (winnerIdx) => {
      endGame(winnerIdx);
    },
  });

  // ─── 游戏初始化 ───

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
    multiplier.value = 1;
    currentAction.value = '';
    showResult.value = false;
    gameStatus.value = GameStatus.Waiting;

    bidding.resetBidding();
    cardPlay.resetPlayState();
  };

  // ─── 开始游戏 ───

  const startGame = () => {
    audioSynth.resume();
    audioSynth.play('deal');
    gameStatus.value = GameStatus.Dealing;

    setTimeout(() => {
      audioSynth.playDeal();
      gameStatus.value = GameStatus.Bidding;

      if (bidding.currentBidder.value !== 0) {
        setTimeout(bidding.aiBid, 1000);
      }
    }, 500);
  };

  // ─── 游戏结束 ───

  const endGame = (winnerIdx: number) => {
    gameStatus.value = GameStatus.Finished;

    const isLandlordWin = winnerIdx === landlordPlayer.value;
    const playerIsLandlord = landlordPlayer.value === 0;

    gameWon.value = playerIsLandlord ? isLandlordWin : !isLandlordWin;

    // 春天/反春天判定
    if (isLandlordWin) {
      const farmersAllUnplayed = players.value.every((p) => p.isLandlord || p.cards.length === 17);
      if (farmersAllUnplayed) {
        multiplier.value *= 2;
      }
    } else {
      const landlordRemaining = players.value[landlordPlayer.value]?.cards.length ?? 20;
      if (landlordRemaining >= 16) {
        multiplier.value *= 2;
      }
    }

    if (gameWon.value) {
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
      recordPlay();
    }

    resultInfo.value = `倍数: x${multiplier.value} · 目标: x${levelConfig.value.targetMultiplier}`;
    showResult.value = true;
  };

  // ─── 关卡控制 ───

  const restartGame = () => {
    initGame();
    startGame();
  };

  const nextLevel = async () => {
    currentLevel.value++;
    audioSynth.play('win');
    await loadLevelConfig(currentLevel.value);
    initGame();
    startGame();
  };

  // ─── 音效/暂停 ───

  const toggleSound = () => {
    audioSynth.toggleMute();
  };

  const pauseGame = () => {
    paused.value = true;
  };

  const resumeGame = () => {
    paused.value = false;
  };

  const quitGame = () => {
    router.back();
  };

  // ─── 生命周期 ───

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

  useGameLifecycle({ onPause: handlePause, onResume: handleResume });

  // ─── 关卡配置加载 ───

  const loadLevelConfig = async (level: number) => {
    const base = defaultLevelConfig(level);
    levelConfig.value = base;

    const override = await getLevelOverride('doudizhu', level);
    if (override && currentLevel.value === level) {
      levelConfig.value = {
        aiDifficulty: (override.aiDifficulty as unknown as AIDifficulty) || base.aiDifficulty,
        playerFirstBid: (override.playerFirstBid as boolean) ?? base.playerFirstBid,
        aiThinkTime: (override.aiThinkTime as number) ?? base.aiThinkTime,
        targetMultiplier: (override.targetMultiplier as number) ?? base.targetMultiplier,
      };
    }
  };

  // ─── 计算属性 ───

  const isMyTurn = computed(() => {
    return gameStatus.value === GameStatus.Playing && currentPlayer.value === 0 && !paused.value;
  });

  const headerItems = computed(() => [
    { label: '关卡', value: currentLevel.value },
    { label: '倍数', value: `x${multiplier.value}` },
    { label: '底分', value: bidding.currentBid.value || '叫分中' },
  ]);

  // ─── 挂载 ───

  onMounted(async () => {
    audioSynth.init();
    currentLevel.value = await loadStartLevel();
    await loadLevelConfig(currentLevel.value);
    initGame();
  });

  onUnmounted(() => {
    audioSynth.destroy();
  });

  return {
    // 共享状态
    gameStatus,
    players,
    bottomCards,
    showBottomCards,
    currentPlayer,
    landlordPlayer,
    multiplier,
    currentAction,
    currentLevel,

    // UI 状态
    paused,
    showResult,
    gameWon,
    stars,
    resultInfo,

    // 叫分
    currentBid: bidding.currentBid,
    currentBidder: bidding.currentBidder,
    bid: bidding.bid,

    // 出牌
    selectedCardIds: cardPlay.selectedCardIds,
    lastPlayByPlayer: cardPlay.lastPlayByPlayer,
    isMyTurn,
    canPass: cardPlay.canPass,
    selectCard: cardPlay.selectCard,
    deselectCard: cardPlay.deselectCard,
    playCards: cardPlay.playCards,
    playPass: cardPlay.playPass,
    showHint: cardPlay.showHint,

    // 控制
    headerItems,
    startGame,
    restartGame,
    nextLevel,
    toggleSound,
    pauseGame,
    resumeGame,
    quitGame,

    // 暴露给 template 的额外引用
    audioSynth,
  };
}
