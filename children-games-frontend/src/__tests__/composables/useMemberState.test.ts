import { describe, it, expect } from 'vitest';
import { ref, computed } from 'vue';
import { useMemberState } from '@/composables/useMemberState';
import { createMockParams, createMockMember } from './useMemberState/helpers';

describe('composables/useMemberState', () => {
  // ─── 基础状态 ─────────────────────────────────────────

  describe('基础状态', () => {
    it('离线 → "离线"', () => {
      const params = createMockParams();
      const { memberState } = useMemberState(params);
      const member = createMockMember({ online: false });

      expect(memberState(member)).toBe('离线');
    });

    it('观战 → "观战"', () => {
      const params = createMockParams();
      const { memberState } = useMemberState(params);
      const member = createMockMember({ seat: -1 });

      expect(memberState(member)).toBe('观战');
    });

    it('等待阶段 + 已准备 → "已准备"', () => {
      const params = createMockParams({ phase: ref('waiting') });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ ready: true });

      expect(memberState(member)).toBe('已准备');
    });

    it('等待阶段 + 未准备 → "未准备"', () => {
      const params = createMockParams({ phase: ref('waiting') });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ ready: false });

      expect(memberState(member)).toBe('未准备');
    });
  });

  // ─── spy 游戏 ─────────────────────────────────────────

  describe('spy 游戏', () => {
    it('ended 阶段 + 卧底 → "🕵️ 卧底"', () => {
      const params = createMockParams({
        gameType: ref('spy'),
        phase: ref('ended'),
        finalData: computed(() => ({ spyUserIds: [1, 2] })),
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('🕵️ 卧底');
    });

    it('ended 阶段 + 平民 → "🙂 平民"', () => {
      const params = createMockParams({
        gameType: ref('spy'),
        phase: ref('ended'),
        finalData: computed(() => ({ spyUserIds: [1, 2] })),
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 3 });

      expect(memberState(member)).toBe('🙂 平民');
    });

    it('playing 阶段 + 出局 → "出局"', () => {
      const params = createMockParams({
        gameType: ref('spy'),
        phase: ref('playing'),
        game: ref({ eliminated: [{ userId: 1 }] }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('出局');
    });

    it('playing 阶段 + 存活 → "存活"', () => {
      const params = createMockParams({
        gameType: ref('spy'),
        phase: ref('playing'),
        game: ref({ eliminated: [] }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('存活');
    });
  });

  // ─── gomoku 游戏 ──────────────────────────────────────

  describe('gomoku 游戏', () => {
    it('ended 阶段 + 获胜 → "获胜 🎉"', () => {
      const params = createMockParams({
        gameType: ref('gomoku'),
        phase: ref('ended'),
        game: ref({ winner: 1 }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ seat: 0 }); // seat 0 → winner 1

      expect(memberState(member)).toBe('获胜 🎉');
    });

    it('ended 阶段 + 平局 → "平局"', () => {
      const params = createMockParams({
        gameType: ref('gomoku'),
        phase: ref('ended'),
        game: ref({ winner: 3 }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(memberState(member)).toBe('平局');
    });

    it('ended 阶段 + 惜败 → "惜败"', () => {
      const params = createMockParams({
        gameType: ref('gomoku'),
        phase: ref('ended'),
        game: ref({ winner: 2 }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ seat: 0 }); // winner 是 2，我是 seat 0

      expect(memberState(member)).toBe('惜败');
    });

    it('playing 阶段 + 执黑 → "执黑"', () => {
      const params = createMockParams({
        gameType: ref('gomoku'),
        phase: ref('playing'),
        game: ref({ turn: 1 }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(memberState(member)).toBe('执黑');
    });

    it('playing 阶段 + 执白 → "执白"', () => {
      const params = createMockParams({
        gameType: ref('gomoku'),
        phase: ref('playing'),
        game: ref({ turn: 1 }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ seat: 1 });

      expect(memberState(member)).toBe('执白');
    });
  });

  // ─── draw 游戏 ────────────────────────────────────────

  describe('draw 游戏', () => {
    it('playing 阶段 + 画中 → "🎨 画中"', () => {
      const params = createMockParams({
        gameType: ref('draw'),
        phase: ref('playing'),
        game: ref({ drawerSeat: 0 }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(memberState(member)).toBe('🎨 画中');
    });

    it('playing 阶段 + 猜词中 → "猜词中"', () => {
      const params = createMockParams({
        gameType: ref('draw'),
        phase: ref('playing'),
        game: ref({ drawerSeat: 0 }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ seat: 1 });

      expect(memberState(member)).toBe('猜词中');
    });
  });

  // ─── uno 游戏 ─────────────────────────────────────────

  describe('uno 游戏', () => {
    it('playing 阶段 + 出牌中 → "出牌中"', () => {
      const params = createMockParams({
        gameType: ref('uno'),
        phase: ref('playing'),
        game: ref({ turnSeat: 0 }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(memberState(member)).toBe('出牌中');
    });

    it('playing 阶段 + 非出牌 → ""', () => {
      const params = createMockParams({
        gameType: ref('uno'),
        phase: ref('playing'),
        game: ref({ turnSeat: 0 }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ seat: 1 });

      expect(memberState(member)).toBe('');
    });
  });

  // ─── quiz 游戏 ────────────────────────────────────────

  describe('quiz 游戏', () => {
    it('playing 阶段 + 有分数 → "X 分"', () => {
      const params = createMockParams({
        gameType: ref('quiz'),
        phase: ref('playing'),
        game: ref({ scores: [{ userId: 1, total: 10 }] }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('10 分');
    });

    it('playing 阶段 + 无分数 → "答题中"', () => {
      const params = createMockParams({
        gameType: ref('quiz'),
        phase: ref('playing'),
        game: ref({ scores: [] }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('答题中');
    });
  });

  // ─── blackjack 游戏 ──────────────────────────────────

  describe('blackjack 游戏', () => {
    it('playing 阶段 + 庄家 → "🎲 庄家"', () => {
      const params = createMockParams({
        gameType: ref('blackjack'),
        phase: ref('playing'),
        game: ref({ bankerSeat: 0, phase: 'playing' }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(memberState(member)).toBe('🎲 庄家');
    });

    it('playing 阶段 + 爆牌 → "💥 爆牌"', () => {
      const params = createMockParams({
        gameType: ref('blackjack'),
        phase: ref('playing'),
        game: ref({ bankerSeat: -1, phase: 'playing' }) as any,
        gameEvents: { handsView: [{ userId: 1, busted: true }] },
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('💥 爆牌');
    });

    it('playing 阶段 + Blackjack → "✨ Blackjack"', () => {
      const params = createMockParams({
        gameType: ref('blackjack'),
        phase: ref('playing'),
        game: ref({ bankerSeat: -1, phase: 'playing' }) as any,
        gameEvents: { handsView: [{ userId: 1, natural: true }] },
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('✨ Blackjack');
    });

    it('playing 阶段 + 停牌 → "🛑 停牌"', () => {
      const params = createMockParams({
        gameType: ref('blackjack'),
        phase: ref('playing'),
        game: ref({ bankerSeat: -1, phase: 'playing' }) as any,
        gameEvents: { handsView: [{ userId: 1, done: true }] },
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('🛑 停牌');
    });

    it('playing 阶段 + 已押注 → "押 X"', () => {
      const params = createMockParams({
        gameType: ref('blackjack'),
        phase: ref('playing'),
        game: ref({ bankerSeat: -1, phase: 'playing' }) as any,
        gameEvents: { handsView: [{ userId: 1, stake: 100 }] },
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('押 100');
    });

    it('playing 阶段 + 下注中 → "下注中"', () => {
      const params = createMockParams({
        gameType: ref('blackjack'),
        phase: ref('playing'),
        game: ref({ bankerSeat: -1, phase: 'betting' }) as any,
        gameEvents: { handsView: [] },
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('下注中');
    });

    it('playing 阶段 + 行动中 → "行动中"', () => {
      const params = createMockParams({
        gameType: ref('blackjack'),
        phase: ref('playing'),
        game: ref({ bankerSeat: -1, phase: 'playing' }) as any,
        gameEvents: { handsView: [] },
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('行动中');
    });
  });

  // ─── zjh 游戏 ─────────────────────────────────────────

  describe('zjh 游戏', () => {
    it('playing 阶段 + 已弃 → "🚫 已弃"', () => {
      const params = createMockParams({
        gameType: ref('zjh'),
        phase: ref('playing'),
        game: ref({ myFolded: true, others: [] }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('🚫 已弃');
    });

    it('playing 阶段 + all-in → "💰 all-in"', () => {
      const params = createMockParams({
        gameType: ref('zjh'),
        phase: ref('playing'),
        game: ref({ myFolded: false, myAllIn: true, others: [] }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('💰 all-in');
    });

    it('playing 阶段 + 自己的回合 + 已看 → "👀 行动中"', () => {
      const params = createMockParams({
        gameType: ref('zjh'),
        phase: ref('playing'),
        game: ref({
          myFolded: false,
          myAllIn: false,
          mySeen: true,
          turnSeat: 0,
          others: [],
        }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1, seat: 0 });

      expect(memberState(member)).toBe('👀 行动中');
    });

    it('playing 阶段 + 自己的回合 + 未看 → "🙈 行动中"', () => {
      const params = createMockParams({
        gameType: ref('zjh'),
        phase: ref('playing'),
        game: ref({
          myFolded: false,
          myAllIn: false,
          mySeen: false,
          turnSeat: 0,
          others: [],
        }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1, seat: 0 });

      expect(memberState(member)).toBe('🙈 行动中');
    });

    it('playing 阶段 + 对手 + 已看 → "👀 已看"', () => {
      const params = createMockParams({
        gameType: ref('zjh'),
        phase: ref('playing'),
        game: ref({ myFolded: false, others: [{ userId: 2, seen: true }] }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 2 });

      expect(memberState(member)).toBe('👀 已看');
    });

    it('playing 阶段 + 对手 + 未看 → "🙈 闷牌"', () => {
      const params = createMockParams({
        gameType: ref('zjh'),
        phase: ref('playing'),
        game: ref({ myFolded: false, others: [{ userId: 2, seen: false }] }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 2 });

      expect(memberState(member)).toBe('🙈 闷牌');
    });
  });

  // ─── chipTableGames 破产观战 ──────────────────────────

  describe('chipTableGames 破产观战', () => {
    it('blackjack + 破产 → "破产观战中"', () => {
      const params = createMockParams({
        gameType: ref('blackjack'),
        phase: ref('playing'),
        game: ref({ chips: [{ userId: 1, chips: 0 }], phase: 'playing' }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('破产观战中');
    });

    it('zjh + 破产 → "破产观战中"', () => {
      const params = createMockParams({
        gameType: ref('zjh'),
        phase: ref('playing'),
        game: ref({ chips: [{ userId: 1, chips: -10 }], others: [] }) as any,
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('破产观战中');
    });
  });

  // ─── ended 阶段通用 ──────────────────────────────────

  describe('ended 阶段通用', () => {
    it('第一名 → "🏆 第一名"', () => {
      const params = createMockParams({
        gameType: ref('memory'),
        phase: ref('ended'),
        finalData: computed(() => ({ ranking: [{ userId: 1 }] })),
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 1 });

      expect(memberState(member)).toBe('🏆 第一名');
    });

    it('非第一名 → "已结束"', () => {
      const params = createMockParams({
        gameType: ref('memory'),
        phase: ref('ended'),
        finalData: computed(() => ({ ranking: [{ userId: 1 }] })),
      });
      const { memberState } = useMemberState(params);
      const member = createMockMember({ userId: 2 });

      expect(memberState(member)).toBe('已结束');
    });
  });

  // ─── isActiveMember ──────────────────────────────────

  describe('isActiveMember', () => {
    it('非 playing 阶段 → false', () => {
      const params = createMockParams({ phase: ref('waiting') });
      const { isActiveMember } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(isActiveMember(member)).toBe(false);
    });

    it('gomoku + 我的回合 → true', () => {
      const params = createMockParams({
        gameType: ref('gomoku'),
        phase: ref('playing'),
        game: ref({ turn: 1 }) as any,
      });
      const { isActiveMember } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(isActiveMember(member)).toBe(true);
    });

    it('gomoku + 对方回合 → false', () => {
      const params = createMockParams({
        gameType: ref('gomoku'),
        phase: ref('playing'),
        game: ref({ turn: 2 }) as any,
      });
      const { isActiveMember } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(isActiveMember(member)).toBe(false);
    });

    it('uno + 我的回合 → true', () => {
      const params = createMockParams({
        gameType: ref('uno'),
        phase: ref('playing'),
        game: ref({ turnSeat: 0 }) as any,
      });
      const { isActiveMember } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(isActiveMember(member)).toBe(true);
    });

    it('draw + 我是画手 + 有词 → true', () => {
      const params = createMockParams({
        gameType: ref('draw'),
        phase: ref('playing'),
        game: ref({ drawerSeat: 0, word: '苹果' }) as any,
      });
      const { isActiveMember } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(isActiveMember(member)).toBe(true);
    });

    it('draw + 我是画手 + 无词 → false', () => {
      const params = createMockParams({
        gameType: ref('draw'),
        phase: ref('playing'),
        game: ref({ drawerSeat: 0, word: null }) as any,
      });
      const { isActiveMember } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(isActiveMember(member)).toBe(false);
    });

    it('其他游戏 → false', () => {
      const params = createMockParams({
        gameType: ref('memory'),
        phase: ref('playing'),
      });
      const { isActiveMember } = useMemberState(params);
      const member = createMockMember({ seat: 0 });

      expect(isActiveMember(member)).toBe(false);
    });
  });
});
