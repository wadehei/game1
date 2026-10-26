import { computed, type Ref, type ComputedRef } from 'vue';

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
  game: Ref<any>;
  gameEvents: Record<string, any>;
  finalData: ComputedRef<any>;
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
    if (chipTableGames.includes(gameType.value) && phase.value === 'playing') {
      const chips = (game.value.chips || []).find((c: any) => c.userId === m.userId)?.chips;
      if (chips !== undefined && chips <= 0) return '破产观战中';
    }
    if (gameType.value === 'spy') {
      if (phase.value === 'ended') {
        const spies: number[] = finalData.value?.spyUserIds || [];
        return spies.includes(m.userId) ? '🕵️ 卧底' : '🙂 平民';
      }
      const eliminated = (game.value.eliminated || []).some((e: any) => e.userId === m.userId);
      return eliminated ? '出局' : '存活';
    }
    if (phase.value === 'ended') {
      if (gameType.value === 'gomoku') {
        return game.value.winner === m.seat + 1
          ? '获胜 🎉'
          : game.value.winner === 3
            ? '平局'
            : '惜败';
      }
      const top = finalData.value?.ranking?.[0];
      return top && top.userId === m.userId ? '🏆 第一名' : '已结束';
    }
    if (gameType.value === 'draw' && phase.value === 'playing') {
      return game.value.drawerSeat === m.seat ? '🎨 画中' : '猜词中';
    }
    if (gameType.value === 'uno' && phase.value === 'playing') {
      return game.value.turnSeat === m.seat ? '出牌中' : '';
    }
    if (gameType.value === 'quiz' && phase.value === 'playing') {
      const s = (game.value.scores || []).find((x: any) => x.userId === m.userId);
      return s ? `${s.total} 分` : '答题中';
    }
    if (gameType.value === 'blackjack' && phase.value === 'playing') {
      if (game.value.bankerSeat === m.seat) return '🎲 庄家';
      const h = (gameEvents.handsView || []).find((x: any) => x.userId === m.userId);
      if (h?.busted) return '💥 爆牌';
      if (h?.natural) return '✨ Blackjack';
      if (h?.done) return '🛑 停牌';
      if (h?.stake) return `押 ${h.stake}`;
      return game.value.phase === 'betting' ? '下注中' : '行动中';
    }
    if (gameType.value === 'zjh' && phase.value === 'playing') {
      const o = (game.value.others || []).find((x: any) => x.userId === m.userId);
      const self = m.userId === myId.value;
      const folded = self ? game.value.myFolded : o?.folded;
      const allIn = self ? game.value.myAllIn : o?.allIn;
      const seen = self ? game.value.mySeen : o?.seen;
      if (folded) return '🚫 已弃';
      if (allIn) return '💰 all-in';
      if (game.value.turnSeat === m.seat) return seen ? '👀 行动中' : '🙈 行动中';
      return seen ? '👀 已看' : '🙈 闷牌';
    }
    if (gameType.value === 'gomoku' && phase.value === 'playing') {
      return m.seat === 0 ? '执黑' : '执白';
    }
    return '';
  };

  const isActiveMember = (m: { userId: number; seat: number }): boolean => {
    if (phase.value !== 'playing') return false;
    if (gameType.value === 'gomoku') return game.value.turn === (m.seat === 0 ? 1 : 2);
    if (gameType.value === 'uno') return game.value.turnSeat === m.seat;
    if (gameType.value === 'draw')
      return game.value.drawerSeat === m.seat && game.value.word != null;
    return false;
  };

  return { memberState, isActiveMember };
}
