/**
 * 斗地主出牌逻辑 composable
 * 管理选牌、出牌验证、AI 出牌、回合切换
 */

import { ref, type Ref } from 'vue';
import { Card, GameStatus, Player, PatternResult, CardPattern, AIDifficulty } from '../utils/types';
import { analyzePattern, canBeat, findBeatingPlays } from '../utils/pattern';
import { decideAIPlay, AIContext } from '../utils/ai';
import { AudioSynth } from '../audio/synth';
import type { LevelConfig } from './useBidding';

export interface UseCardPlayParams {
  players: Ref<Player[]>;
  gameStatus: Ref<GameStatus>;
  currentPlayer: Ref<number>;
  landlordPlayer: Ref<number>;
  multiplier: Ref<number>;
  currentAction: Ref<string>;
  paused: Ref<boolean>;
  levelConfig: Ref<LevelConfig>;
  audioSynth: AudioSynth;
  onWin: (winnerIdx: number) => void;
}

export function useCardPlay(params: UseCardPlayParams) {
  const {
    players,
    gameStatus,
    currentPlayer,
    landlordPlayer,
    multiplier,
    currentAction,
    paused: _paused,
    levelConfig,
    audioSynth,
    onWin,
  } = params;

  // 出牌专属状态
  const selectedCardIds = ref<number[]>([]);
  const lastPlay = ref<PatternResult | null>(null);
  const lastPlayByPlayer = ref<(Card[] | null)[]>([null, null, null]);
  const lastActivePlayer = ref(-1);
  const passCount = ref(0);

  // 计算是否可 pass
  const canPass = () => {
    return lastPlay.value !== null && lastActivePlayer.value !== 0;
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

  // 执行出牌（通用）
  const executePlay = (playerIdx: number, cards: Card[], pattern: PatternResult) => {
    const player = players.value[playerIdx];
    const playIds = new Set(cards.map((c) => c.id));
    player.cards = player.cards.filter((c) => !playIds.has(c.id));

    lastPlay.value = pattern;
    lastPlayByPlayer.value[playerIdx] = cards;
    lastActivePlayer.value = playerIdx;
    passCount.value = 0;
    selectedCardIds.value = [];

    if (pattern.pattern === CardPattern.Bomb) {
      multiplier.value *= 2;
      audioSynth.playPlaySound('bomb');
    } else if (pattern.pattern === CardPattern.Rocket) {
      multiplier.value *= 2;
      audioSynth.playPlaySound('rocket');
    } else {
      audioSynth.playPlaySound(pattern.pattern);
    }

    if (player.cards.length === 0) {
      onWin(playerIdx);
      return;
    }

    setTimeout(nextPlayer, 500);
  };

  // 下一个玩家
  const nextPlayer = () => {
    currentPlayer.value = (currentPlayer.value + 1) % 3;

    if (currentPlayer.value === lastActivePlayer.value) {
      lastPlay.value = null;
      lastPlayByPlayer.value = [null, null, null];
    }

    if (currentPlayer.value !== 0) {
      setTimeout(aiPlay, 800);
    }
  };

  // 玩家出牌
  const playCards = () => {
    if (selectedCardIds.value.length === 0) return;

    const myHand = players.value[0].cards;
    const myHandIds = new Set(myHand.map((c) => c.id));
    const invalidIds = selectedCardIds.value.filter((id) => !myHandIds.has(id));
    if (invalidIds.length > 0) {
      currentAction.value = '选择了不存在的牌';
      setTimeout(() => (currentAction.value = ''), 1500);
      return;
    }

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

    if (lastPlay.value && canBeat(pattern, lastPlay.value) === false) {
      currentAction.value = '打不过上家';
      setTimeout(() => (currentAction.value = ''), 1500);
      return;
    }

    executePlay(0, selectedCards, pattern);
  };

  // 不出
  const playPass = () => {
    if (!canPass()) return;

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

  // AI 出牌
  const aiPlay = () => {
    if (gameStatus.value !== GameStatus.Playing) return;
    if (currentPlayer.value === 0) return;

    const playerIdx = currentPlayer.value;
    const player = players.value[playerIdx];

    const isFreePlay = !lastPlay.value || lastActivePlayer.value === playerIdx;
    const aiDifficulty: AIDifficulty = levelConfig.value.aiDifficulty;

    const context: AIContext = {
      handSizes: [
        players.value[0].cards.length,
        players.value[1].cards.length,
        players.value[2].cards.length,
      ] as [number, number, number],
      multiplier: multiplier.value,
    };

    if (isFreePlay) {
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

  // 重置出牌状态
  const resetPlayState = () => {
    selectedCardIds.value = [];
    lastPlay.value = null;
    lastPlayByPlayer.value = [null, null, null];
    lastActivePlayer.value = -1;
    passCount.value = 0;
  };

  return {
    selectedCardIds,
    lastPlay,
    lastPlayByPlayer,
    lastActivePlayer,
    passCount,
    canPass,
    selectCard,
    deselectCard,
    playCards,
    playPass,
    showHint,
    executePlay,
    nextPlayer,
    aiPlay,
    resetPlayState,
  };
}
