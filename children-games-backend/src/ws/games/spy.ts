// 谁是卧底 handler：线上只做「发词 + 计时 + 投票 + 判定」，描述环节线下口头进行
// 词/身份通过 serializeFor 按人私发；出局者身份公开
import pairsJson from './spy-word-pairs.json';
import type { Room, Member } from '../roomManager';
import { addTimer, clearRoomTimers } from '../roomManager';
import type { ActionResult, GameHandler } from './types';
import { getRoomBus } from '../bus';
import { getRoom } from '../roomManager';

// 时长可通过环境变量缩短（测试/演示用）：SPY_TALK_SECONDS / SPY_VOTE_SECONDS
const TALK_SECONDS = Math.max(5, Number(process.env.SPY_TALK_SECONDS) || 90);
const VOTE_SECONDS = Math.max(5, Number(process.env.SPY_VOTE_SECONDS) || 60);

interface WordPair {
  civilian: string;
  spy: string;
  category: string;
}

const PAIRS = pairsJson as unknown as WordPair[];

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

interface RoleInfo {
  role: 'civilian' | 'spy';
  word: string;
  alive: boolean;
}

interface SpyState {
  round: number;
  phase: 'talk' | 'vote' | 'ended';
  deadline: number;
  roles: Map<number, RoleInfo>;
  votes: Map<number, number | null>; // userId -> 目标 userId | null(弃权)
  isRevote: boolean;
  revotePool: number[] | null;
  pair: WordPair;
}

const aliveIds = (room: Room): number[] =>
  [...(room.game as SpyState).roles]
    .filter(([, r]) => r.alive)
    .map(([userId]) => userId);

const aliveSpies = (room: Room): number =>
  [...(room.game as SpyState).roles].filter(([, r]) => r.role === 'spy' && r.alive).length;

const aliveCivilians = (room: Room): number =>
  [...(room.game as SpyState).roles].filter(([, r]) => r.role === 'civilian' && r.alive).length;

/** 胜负判定：卧底全灭=平民胜；存活卧底数 >= 存活平民数=卧底胜；否则 null（继续） */
const evaluateWinner = (room: Room): 'civilian' | 'spy' | null => {
  const spies = aliveSpies(room);
  const civilians = aliveCivilians(room);
  if (spies === 0) return 'civilian';
  if (spies >= civilians) return 'spy';
  return null;
};

const finish = (room: Room, winner: 'civilian' | 'spy'): void => {
  const st = room.game as SpyState;
  void st;
  clearRoomTimers(room);
  st.phase = 'ended';
  room.phase = 'ended';
  const spyUserIds = [...st.roles].filter(([, r]) => r.role === 'spy').map(([userId]) => userId);
  const bus = getRoomBus();
  bus.broadcast(room, {
    t: 'spy_final',
    winner,
    spyUserIds,
    words: { civilian: st.pair.civilian, spy: st.pair.spy },
  });
  bus.broadcast(room, {
    t: 'game_over',
    winnerSeat: -1,
    reason: winner === 'civilian' ? '卧底全部出局，平民胜利' : '卧底存活，卧底胜利',
  });
};

const enterVote = (room: Room): void => {
  const st = room.game as SpyState;
  st.phase = 'vote';
  st.votes = new Map();
  st.deadline = Date.now() + VOTE_SECONDS * 1000;
  getRoomBus().broadcast(room, {
    t: 'spy_phase',
    phase: 'vote',
    deadline: st.deadline,
    alive: aliveIds(room),
    isRevote: st.isRevote,
    revotePool: st.revotePool,
  });

  const timer = setTimeout(() => {
    const r = getRoom(room.id);
    if (r && (r.game as SpyState).phase === 'vote') {
      tally(r);
    }
  }, VOTE_SECONDS * 1000);
  addTimer(room, timer);
};

const enterTalk = (room: Room): void => {
  const st = room.game as SpyState;
  st.phase = 'talk';
  st.votes = new Map();
  st.deadline = Date.now() + TALK_SECONDS * 1000;
  getRoomBus().broadcast(room, {
    t: 'spy_phase',
    phase: 'talk',
    deadline: st.deadline,
    alive: aliveIds(room),
    isRevote: false,
    revotePool: null,
  });

  const timer = setTimeout(() => {
    const r = getRoom(room.id);
    if (r && (r.game as SpyState).phase === 'talk') {
      enterVote(r);
    }
  }, TALK_SECONDS * 1000);
  addTimer(room, timer);
};

const tally = (room: Room): void => {
  const st = room.game as SpyState;
  const ids = aliveIds(room);
  const counts = new Map<number, number>();
  for (const voterId of ids) {
    const target = st.votes.get(voterId);
    if (target === undefined || target === null) continue; // 未投票/弃权
    if (!ids.includes(target)) continue; // 投给已出局者无效
    counts.set(target, (counts.get(target) || 0) + 1);
  }

  const countedList = [...counts.entries()].map(([target, count]) => ({ target, count }));
  let max = 0;
  for (const c of counts.values()) max = Math.max(max, c);
  const top = max > 0 ? [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id) : [];
  const bus = getRoomBus();

  if (top.length === 0) {
    // 全员弃权/未投：无人出局
    st.isRevote = false;
    st.revotePool = null;
    st.round += 1;
    bus.broadcast(room, { t: 'spy_vote_result', counts: countedList, out: null, outRole: null });
    enterTalk(room);
    return;
  }

  if (top.length > 1 && !st.isRevote) {
    // 首次平票：重投，仅可投平票候选人
    st.isRevote = true;
    st.revotePool = top;
    enterVote(room);
    return;
  }

  if (top.length > 1) {
    // 重投仍平：无人出局
    st.isRevote = false;
    st.revotePool = null;
    st.round += 1;
    bus.broadcast(room, { t: 'spy_vote_result', counts: countedList, out: null, outRole: null });
    enterTalk(room);
    return;
  }

  // 最高票唯一：出局并亮身份
  const outId = top[0];
  const outRole = st.roles.get(outId)!.role;
  st.roles.get(outId)!.alive = false;
  st.isRevote = false;
  st.revotePool = null;

  bus.broadcast(room, {
    t: 'spy_vote_result',
    counts: countedList,
    out: outId,
    outRole,
  });
  bus.broadcast(room, { t: 'spy_eliminated', userId: outId, role: outRole });

  const winner = evaluateWinner(room);
  if (winner) {
    finish(room, winner);
    return;
  }
  st.round += 1;
  enterTalk(room);
};

export const spyHandler: GameHandler<SpyState> = {
  type: 'spy',
  title: '谁是卧底',
  emoji: '🕵️',
  desc: '线下口头描述，线上发词投票判定（4 人起）',
  minPlayers: 4,
  maxPlayers: 12,
  allowSpectators: false,
  rematchSwapSeats: false,

  create(): SpyState {
    return {
      round: 1,
      phase: 'talk',
      deadline: 0,
      roles: new Map(),
      votes: new Map(),
      isRevote: false,
      revotePool: null,
      pair: PAIRS[0],
    };
  },

  // 开局：随机词对 + 随机卧底（≥7 人 2 卧底），私发词
  start(room): ActionResult | void {
    const st = room.game as SpyState;
    const players = [...room.members.values()].filter((m) => m.seat >= 0);
    st.pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];

    const spyCount = players.length >= 7 ? 2 : 1;
    const spies = new Set(shuffle(players.map((m) => m.userId)).slice(0, spyCount));

    st.roles = new Map();
    const toMember: NonNullable<ActionResult['toMember']> = [];
    for (const m of players) {
      const role: 'civilian' | 'spy' = spies.has(m.userId) ? 'spy' : 'civilian';
      const word = role === 'spy' ? st.pair.spy : st.pair.civilian;
      st.roles.set(m.userId, { role, word, alive: true });
      toMember.push({ userId: m.userId, msg: { t: 'spy_deal', role, word } });
    }

    st.round = 1;
    st.isRevote = false;
    st.revotePool = null;
    st.votes = new Map();

    const result: ActionResult = {
      toMember,
      broadcast: [
        {
          t: 'spy_phase',
          phase: 'talk',
          deadline: Date.now() + TALK_SECONDS * 1000,
          alive: players.map((m) => m.userId),
          isRevote: false,
          revotePool: null,
        },
      ],
    };
    // 描述阶段计时：到点自动进入投票
    const timer = setTimeout(() => {
      const r = getRoom(room.id);
      if (r && (r.game as SpyState).phase === 'talk') {
        enterVote(r);
      }
    }, TALK_SECONDS * 1000);
    addTimer(room, timer);
    return result;
  },

  onPlayerQuit(room: Room, member: Member): ActionResult | void {
    const st = room.game as SpyState;
    const role = st.roles.get(member.userId);
    if (role) role.alive = false; // 离开视为出局（不单独亮身份，但参与判定）
    if (room.phase === 'ended') return undefined;
    const winner = evaluateWinner(room);
    if (winner) {
      finish(room, winner);
      return {
        ended: {
          winnerSeat: -1,
          reason: winner === 'civilian' ? '卧底全部出局，平民胜利' : '卧底存活，卧底胜利',
        },
      };
    }
    // 投票阶段有存活玩家退出：作废本轮投票重新投票
    if (st.phase === 'vote') {
      enterVote(room);
    }
    return undefined;
  },

  onAction(room: Room, member: Member, action: string, payload: any): ActionResult {
    if (action !== 'spy_vote') return { error: '未知的游戏操作' };
    const st = room.game as SpyState;
    if (room.phase !== 'playing' || st.phase !== 'vote') return { error: '当前不是投票阶段' };
    const myRole = st.roles.get(member.userId);
    if (!myRole?.alive) return { error: '出局玩家不能投票' };

    const target = payload?.target === null ? null : Number(payload?.target);
    if (target !== null) {
      if (!Number.isInteger(target)) return { error: '无效的投票目标' };
      const targetRole = st.roles.get(target);
      if (!targetRole?.alive) return { error: '投票目标已出局' };
      if (st.revotePool && !st.revotePool.includes(target)) return { error: '本轮只能投给平票候选人' };
      if (target === member.userId && !st.isRevote) return { error: '不能投自己' };
    }

    st.votes.set(member.userId, target);

    // 只广播已投票人数，防跟票
    const ids = aliveIds(room);
    const votedCount = [...st.votes.keys()].filter((v) => ids.includes(v)).length;
    getRoomBus().broadcast(room, { t: 'spy_vote_update', votedCount, total: ids.length });

    // 全员投完立即结算
    if (ids.every((id) => st.votes.has(id))) {
      const timer = setTimeout(() => {
        const r = getRoom(room.id);
        if (r && (r.game as SpyState).phase === 'vote') {
          tally(r);
        }
      }, 800);
      addTimer(room, timer);
    }
    return {};
  },

  serializeFor(room: Room, viewer: Member): Record<string, unknown> {
    const st = room.game as SpyState;
    const mine = st.roles.get(viewer.userId);
    const eliminated = [...st.roles]
      .filter(([, r]) => !r.alive)
      .map(([userId, r]) => ({ userId, role: r.role }));
    const ids = aliveIds(room);
    const votedCount = [...st.votes.keys()].filter((v) => ids.includes(v)).length;
    return {
      round: st.round,
      phase: st.phase,
      deadline: st.deadline,
      alive: ids,
      me: mine ? { role: mine.role, word: mine.word, alive: mine.alive } : null,
      eliminated,
      isRevote: st.isRevote,
      revotePool: st.revotePool,
      votedCount,
      total: ids.length,
      pairCategory: st.pair.category,
    };
  },
};
