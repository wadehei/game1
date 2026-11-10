import { computed, type Ref, type ComputedRef } from 'vue';
import type {
  GameState,
  FinalData,
  GomokuGameState,
  QuizGameState,
  DrawGameState,
  SpyGameState,
  UnoGameState,
  BlackjackGameState,
  ZjhGameState,
  DdzGameState,
} from './wsTypes';

export interface MemberInfo {
  userId: number;
  nickname: string;
  avatar: string;
  seat: number;
  ready: boolean;
  online: boolean;
}

interface UseMemberStateParams {
  myId: ComputedRef<number>;
  gameType: Ref<string>;
  phase: Ref<'waiting' | 'playing' | 'ended'>;
  game: Ref<GameState>;
  gameEvents: Record<string, unknown>;
  finalData: ComputedRef<FinalData | null>;
  chipTableGames: string[];
}

export function useMemberState({
  myId,
  gameType,
  phase,
  game,
  gameEvents,
  finalData,
  chipTableGames,
}: UseMemberStateParams) {
  const memberState = (m: {
    userId: number;
    seat: number;
    ready: boolean;
    online: boolean;
  }): string => {
    if (!m.online) return '离线';
    if (m.seat < 0) return '观战';
    if (phase.value === 'waiting') return m.ready ? '已准备' : '未准备';
    // 各分支按 gameType 已互斥，game.value 必为对应游戏的状态对象，用窄化断言取字段
    if (chipTableGames.includes(gameType.value) && phase.value === 'playing') {
      const g = game.value as BlackjackGameState | ZjhGameState;
      const chips = (g.chips as Array<{ userId: number; chips: number }> | undefined) || [];
      if (chips.some((c) => c.userId === m.userId && c.chips <= 0)) return '破产观战中';
    }
    if (gameType.value === 'spy') {
      const g = game.value as SpyGameState;
      if (phase.value === 'ended') {
        const spies: number[] = finalData.value?.spyUserIds || [];
        return spies.includes(m.userId) ? '🕵️ 卧底' : '🙂 平民';
      }
      const eliminated = (g.eliminated || []).some((e) => e.userId === m.userId);
      return eliminated ? '出局' : '存活';
    }
    if (phase.value === 'ended') {
      if (gameType.value === 'gomoku') {
        const g = game.value as GomokuGameState;
        return g.winner === m.seat + 1 ? '获胜 🎉' : g.winner === 3 ? '平局' : '惜败';
      }
      const top = finalData.value?.ranking?.[0];
      return top && top.userId === m.userId ? '🏆 第一名' : '已结束';
    }
    if (gameType.value === 'draw' && phase.value === 'playing') {
      const g = game.value as DrawGameState;
      return g.drawerSeat === m.seat ? '🎨 画中' : '猜词中';
    }
    if (gameType.value === 'uno' && phase.value === 'playing') {
      const g = game.value as UnoGameState;
      return g.turnSeat === m.seat ? '出牌中' : '';
    }
    if (gameType.value === 'quiz' && phase.value === 'playing') {
      const g = game.value as QuizGameState;
      const s = (g.scores || []).find((x) => x.userId === m.userId);
      return s ? `${s.total} 分` : '答题中';
    }
    if (gameType.value === 'blackjack' && phase.value === 'playing') {
      const g = game.value as BlackjackGameState;
      if (g.bankerSeat === m.seat) return '🎲 庄家';
      const h =
        (gameEvents.handsView as
          | Array<{
              userId: number;
              busted?: boolean;
              natural?: boolean;
              done?: boolean;
              stake?: number;
            }>
          | undefined) || [];
      const hit = h.find((x) => x.userId === m.userId);
      if (hit?.busted) return '💥 爆牌';
      if (hit?.natural) return '✨ Blackjack';
      if (hit?.done) return '🛑 停牌';
      if (hit?.stake) return `押 ${hit.stake}`;
      return g.phase === 'betting' ? '下注中' : '行动中';
    }
    if (gameType.value === 'zjh' && phase.value === 'playing') {
      const g = game.value as ZjhGameState;
      const o = (g.others || []).find((x) => x.userId === m.userId);
      const self = m.userId === myId.value;
      const folded = self ? g.myFolded : o?.folded;
      const allIn = self ? g.myAllIn : o?.allIn;
      const seen = self ? g.mySeen : o?.seen;
      if (folded) return '🚫 已弃';
      if (allIn) return '💰 all-in';
      if (g.turnSeat === m.seat) return seen ? '👀 行动中' : '🙈 行动中';
      return seen ? '👀 已看' : '🙈 闷牌';
    }
    if (gameType.value === 'ddz' && phase.value === 'playing') {
      const g = game.value as DdzGameState;
      if (g.phase === 'bidding') {
        const o = (g.others || []).find((x) => x.userId === m.userId);
        const self = m.userId === myId.value;
        const bid = self ? g.myBid : (o?.bid ?? null);
        if (bid === null) return '思考中';
        return bid === 0 ? '不叫' : `叫 ${bid} 分`;
      }
      const isLm = g.landlordSeat === m.seat;
      return isLm ? '👑 地主' : g.turnSeat === m.seat ? '出牌中' : '农民';
    }
    if (gameType.value === 'gomoku' && phase.value === 'playing') {
      return m.seat === 0 ? '执黑' : '执白';
    }
    return '';
  };

  const isActiveMember = (m: { userId: number; seat: number }): boolean => {
    if (phase.value !== 'playing') return false;
    if (gameType.value === 'gomoku')
      return (game.value as GomokuGameState).turn === (m.seat === 0 ? 1 : 2);
    if (gameType.value === 'uno') return (game.value as UnoGameState).turnSeat === m.seat;
    if (gameType.value === 'draw') {
      const g = game.value as DrawGameState;
      return g.drawerSeat === m.seat && g.word != null;
    }
    return false;
  };

  return { memberState, isActiveMember };
}
