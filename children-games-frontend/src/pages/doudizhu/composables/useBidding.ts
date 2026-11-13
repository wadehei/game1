/**
 * 斗地主叫分逻辑 composable
 * 管理叫分阶段的状态机和 AI 叫分决策
 */

import { ref, type Ref } from 'vue';
import { Card, GameStatus, Player, AIDifficulty } from '../utils/types';
import { sortCards } from '../utils/deck';
import { decideAIBid } from '../utils/ai';
import { AudioSynth } from '../audio/synth';

export interface LevelConfig {
  aiDifficulty: AIDifficulty;
  playerFirstBid: boolean;
  aiThinkTime: number;
  targetMultiplier: number;
}

export interface UseBiddingParams {
  players: Ref<Player[]>;
  gameStatus: Ref<GameStatus>;
  landlordPlayer: Ref<number>;
  bottomCards: Ref<Card[]>;
  showBottomCards: Ref<boolean>;
  currentPlayer: Ref<number>;
  currentAction: Ref<string>;
  levelConfig: Ref<LevelConfig>;
  audioSynth: AudioSynth;
  onBiddingComplete: () => void;
  onRedeal: () => void;
}

export function useBidding(params: UseBiddingParams) {
  const {
    players,
    gameStatus,
    landlordPlayer,
    bottomCards,
    showBottomCards,
    currentPlayer,
    currentAction,
    levelConfig,
    audioSynth,
    onBiddingComplete,
    onRedeal,
  } = params;

  // 叫分专属状态
  const currentBid = ref(0);
  const currentBidder = ref(0);
  const highestBidder = ref(-1);
  const bidCount = ref(0);

  // 检查叫分是否结束
  const checkBiddingEnd = () => {
    if (currentBid.value === 3) {
      finishBidding();
    } else if (bidCount.value >= 3 && currentBid.value === 0) {
      currentAction.value = '所有人都不叫，重新发牌...';
      setTimeout(() => {
        onRedeal();
      }, 2000);
    } else if (bidCount.value >= 3) {
      finishBidding();
    } else {
      currentBidder.value = (currentBidder.value + 1) % 3;
      if (currentBidder.value === 0) {
        currentAction.value = '';
      } else {
        setTimeout(aiBid, 1500);
      }
    }
  };

  // AI 叫分
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

    checkBiddingEnd();
  };

  // 玩家叫分
  const bid = (score: number) => {
    audioSynth.play('bid');
    bidCount.value++;

    if (score > currentBid.value) {
      currentBid.value = score;
      highestBidder.value = 0;
    }

    if (currentBid.value === 3) {
      finishBidding();
    } else if (bidCount.value >= 3 && currentBid.value === 0) {
      currentAction.value = '所有人都不叫，重新发牌...';
      setTimeout(() => {
        onRedeal();
      }, 2000);
    } else if (bidCount.value >= 3) {
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
    if (landlordPlayer.value === -1) {
      if (currentBid.value === 0) {
        currentAction.value = '所有人都不叫，重新发牌...';
        setTimeout(() => {
          onRedeal();
        }, 2000);
        return;
      }
      landlordPlayer.value = highestBidder.value;
    }

    players.value[landlordPlayer.value].isLandlord = true;

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

    setTimeout(() => {
      gameStatus.value = GameStatus.Playing;
      currentPlayer.value = landlordPlayer.value;
      currentAction.value = '';
      onBiddingComplete();
    }, 1500);
  };

  // 重置叫分状态
  const resetBidding = () => {
    currentBid.value = 0;
    currentBidder.value = Math.floor(Math.random() * 3);
    highestBidder.value = -1;
    bidCount.value = 0;
  };

  return {
    currentBid,
    currentBidder,
    highestBidder,
    bidCount,
    bid,
    aiBid,
    resetBidding,
  };
}
