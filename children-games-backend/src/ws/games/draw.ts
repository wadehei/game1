// 你画我猜 handler：轮流作画 + 实时笔迹转发 + 猜词判定
// 笔迹坐标为 0~1 归一化，各端按画布尺寸换算；服务端存全量 strokes 供重连/新进重放
import wordsJson from './draw-words.json';
import { getRoom, type Room, type Member } from '../roomManager';
import { addTimer, clearRoomTimers } from '../roomManager';
import type { ActionResult, GameHandler } from './types';
import { getRoomBus } from '../bus';

const PICK_SECONDS = 10;
const DRAW_SECONDS = 90;
const STROKE_INTERVAL_MS = 100; // 10Hz 节流
const MAX_STROKES = 500;

interface WordItem {
  word: string;
  category: string;
  difficulty: number;
}

const WORDS = wordsJson as unknown as WordItem[];

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const normalize = (s: string): string => String(s || '').trim().toLowerCase().replace(/\s+/g, '');

const players = (room: Room): Member[] => [...room.members.values()].filter((m) => m.seat >= 0);

interface DrawState {
  round: number; // 当前第几回合（从 1 开始）
  totalRounds: number;
  drawerSeat: number;
  phase: 'picking' | 'drawing';
  candidates: string[];
  word: string | null;
  category: string;
  strokes: any[];
  guessed: Set<number>; // 已猜对的 userId
  scores: Map<number, number>;
  deadline: number;
  startedAt: number;
  lastStrokeAt: number;
  roundTimer: NodeJS.Timeout | null;
  drawSeq: number;
}

const endRound = (room: Room, reason: string): void => {
  const st = room.game as DrawState;
  if (st.roundTimer) clearTimeout(st.roundTimer);
  st.roundTimer = null;
  const bus = getRoomBus();
  bus.broadcast(room, {
    t: 'draw_round_end',
    word: st.word,
    category: st.category,
    reason,
    scores: [...st.scores].map(([userId, total]) => ({ userId, total })),
  });

  // 判断是否全部回合完成
  if (st.round >= st.totalRounds) {
    const ranking = [...st.scores]
      .map(([userId, total]) => {
        const m = room.members.get(userId);
        return { userId, nickname: m?.nickname || `角色${userId}`, total };
      })
      .sort((a, b) => b.total - a.total);
    bus.broadcast(room, { t: 'draw_final', ranking });
    room.phase = 'ended';
    clearRoomTimers(room);
    room.game = { ...st, ranking };
    return;
  }

  // 下一回合：按下座位顺序找下一位还在房间里的玩家
  const seats = players(room).map((m) => m.seat).sort((a, b) => a - b);
  let next = st.drawerSeat;
  for (const s2 of [...seats, ...seats]) {
    if (s2 > st.drawerSeat) {
      next = s2;
      break;
    }
  }
  st.round += 1;
  st.drawerSeat = next;
  st.phase = 'picking';
  st.word = null;
  st.strokes = [];
  st.guessed = new Set();
  st.candidates = shuffle(WORDS).slice(0, 3).map((w) => w.word);
  bus.broadcast(room, { t: 'draw_round', drawerSeat: st.drawerSeat, round: st.round, totalRounds: st.totalRounds, phase: 'picking' });

  const drawer = players(room).find((m) => m.seat === st.drawerSeat);
  if (drawer) bus.sendToUser(room, drawer.userId, { t: 'draw_candidates', words: st.candidates });

  const timer = setTimeout(() => {
    const r = getRoom(room.id);
    if (r && (r.game as DrawState).phase === 'picking' && (r.game as DrawState).round === st.round) {
      // 超时未选词：随机选一个
      const s = r.game as DrawState;
      beginDrawing(r, s.candidates[Math.floor(Math.random() * s.candidates.length)]);
    }
  }, PICK_SECONDS * 1000);
  st.roundTimer = timer;
  addTimer(room, timer);
};

const beginDrawing = (room: Room, word: string): void => {
  const st = room.game as DrawState;
  const info = WORDS.find((w) => w.word === word);
  st.phase = 'drawing';
  st.word = word;
  st.category = info?.category || '';
  st.strokes = [];
  st.guessed = new Set();
  st.deadline = Date.now() + DRAW_SECONDS * 1000;
  st.startedAt = Date.now();
  st.lastStrokeAt = 0;

  const bus = getRoomBus();
  const drawer = players(room).find((m) => m.seat === st.drawerSeat);
  bus.broadcast(room, {
    t: 'draw_round',
    drawerSeat: st.drawerSeat,
    round: st.round,
    totalRounds: st.totalRounds,
    phase: 'drawing',
    wordLen: word.length,
    category: st.category,
    deadline: st.deadline,
  });
  if (drawer) bus.sendToUser(room, drawer.userId, { t: 'draw_word', word });

  const timer = setTimeout(() => {
    const r = getRoom(room.id);
    if (r && (r.game as DrawState).phase === 'drawing' && (r.game as DrawState).round === st.round) {
      endRound(r, '时间到');
    }
  }, DRAW_SECONDS * 1000);
  st.roundTimer = timer;
  addTimer(room, timer);
};

export const drawHandler: GameHandler<DrawState> = {
  type: 'draw',
  title: '你画我猜',
  emoji: '🎨',
  desc: '一人作画其他人猜，猜得越快分越高',
  minPlayers: 3,
  maxPlayers: 8,
  allowSpectators: true,
  rematchSwapSeats: false,

  create(): DrawState {
    return {
      round: 0,
      totalRounds: 0,
      drawerSeat: -1,
      phase: 'picking',
      candidates: [],
      word: null,
      category: '',
      strokes: [],
      guessed: new Set(),
      scores: new Map(),
      deadline: 0,
      startedAt: 0,
      lastStrokeAt: 0,
      roundTimer: null,
      drawSeq: 0,
    };
  },

  // 开局：回合数 = 参与人数（每人画一次），初始分数归零
  start(room): void {
    const st = room.game as DrawState;
    const list = players(room);
    st.totalRounds = list.length;
    st.round = 0;
    st.scores = new Map();
    list.forEach((m) => st.scores.set(m.userId, 0));

    // 从座位 0 开始（座位可能不连续，取最小座位玩家）
    const first = list.reduce((a, b) => (a.seat < b.seat ? a : b));
    st.drawerSeat = first.seat;
    st.round = 1;
    st.phase = 'picking';
    st.word = null;
    st.strokes = [];
    st.guessed = new Set();
    st.candidates = shuffle(WORDS).slice(0, 3).map((w) => w.word);

    const bus = getRoomBus();
    bus.broadcast(room, {
      t: 'draw_round',
      drawerSeat: st.drawerSeat,
      round: st.round,
      totalRounds: st.totalRounds,
      phase: 'picking',
    });
    if (first) bus.sendToUser(room, first.userId, { t: 'draw_candidates', words: st.candidates });

    const timer = setTimeout(() => {
      const r = getRoom(room.id);
      if (r && (r.game as DrawState).phase === 'picking' && (r.game as DrawState).round === 1) {
        const s = r.game as DrawState;
        beginDrawing(r, s.candidates[Math.floor(Math.random() * s.candidates.length)]);
      }
    }, PICK_SECONDS * 1000);
    st.roundTimer = timer;
    addTimer(room, timer);
  },

  onPlayerQuit(room: Room, member: Member): ActionResult | void {
    const st = room.game as DrawState;
    st.scores.delete(member.userId);
    const list = players(room);
    if (list.length < 3 && room.phase !== 'ended') {
      const ranking = [...st.scores]
        .map(([userId, total]) => {
          const m = room.members.get(userId);
          return { userId, nickname: m?.nickname || `角色${userId}`, total };
        })
        .sort((a, b) => b.total - a.total);
      clearRoomTimers(room);
      room.phase = 'ended';
      room.game = { ...st, ranking };
      getRoomBus().broadcast(room, { t: 'draw_final', ranking, reason: '人数不足，提前结束' });
      return { ended: { winnerSeat: ranking[0] ? (room.members.get(ranking[0].userId)?.seat ?? -1) : -1, reason: '人数不足，提前结束' } };
    }
    // 画家退出：立即结束当前回合
    if (member.seat === st.drawerSeat && room.phase !== 'ended') {
      endRound(room, '画家离开了');
    }
    return undefined;
  },

  onAction(room: Room, member: Member, action: string, payload: any): ActionResult {
    const st = room.game as DrawState;
    const isDrawer = member.seat === st.drawerSeat;
    const bus = getRoomBus();

    if (action === 'draw_pick') {
      if (room.phase !== 'playing' || st.phase !== 'picking' || !isDrawer) return { error: '现在不是你选词的时候' };
      const word = st.candidates[Number(payload?.index)] || st.candidates[0];
      beginDrawing(room, word);
      return {};
    }

    if (action === 'draw_stroke') {
      if (room.phase !== 'playing' || st.phase !== 'drawing' || !isDrawer) return { error: '只有画家能画画' };
      // 不做服务端节流：客户端已按 10Hz 批量发送，静默丢包会造成其他端笔迹断层
      const stroke = {
        seq: ++st.drawSeq,
        points: payload?.points || [],
        color: String(payload?.color || '#333'),
        width: Number(payload?.width) || 4,
      };
      if (JSON.stringify(stroke).length > 4096) return { error: '笔迹数据过大' };
      st.strokes.push(stroke);
      if (st.strokes.length > MAX_STROKES) st.strokes.shift();
      bus.broadcast(room, { t: 'draw_stroke', stroke }, member.userId); // 画家自己已本地绘制
      return {};
    }

    if (action === 'draw_undo') {
      if (room.phase !== 'playing' || st.phase !== 'drawing' || !isDrawer) return { error: '只有画家能撤销' };
      st.strokes.pop();
      bus.broadcast(room, { t: 'draw_undo' });
      return {};
    }

    if (action === 'draw_clear') {
      if (room.phase !== 'playing' || st.phase !== 'drawing' || !isDrawer) return { error: '只有画家能清空' };
      st.strokes = [];
      bus.broadcast(room, { t: 'draw_clear' });
      return {};
    }

    if (action === 'draw_skip') {
      if (room.phase !== 'playing' || st.phase !== 'drawing' || !isDrawer) return { error: '只有画家能跳过' };
      st.scores.set(member.userId, Math.max(0, (st.scores.get(member.userId) || 0) - 2));
      endRound(room, '画家跳过了');
      return {};
    }

    if (action === 'guess') {
      if (room.phase !== 'playing' || st.phase !== 'drawing') return { error: '当前没有进行中的猜词' };
      if (isDrawer) return { error: '画家不能猜词' };
      const raw = String(payload?.content || '').trim().slice(0, 50);
      if (!raw) return { error: '请输入猜词内容' };

      // 已经猜对的人不再参与判定与广播（防剧透）
      if (st.guessed.has(member.userId)) return {};

      const correct = normalize(raw) === normalize(st.word || '');
      if (correct) {
        st.guessed.add(member.userId);
        const elapsed = Date.now() - st.startedAt;
        const gained = Math.max(5, 10 - Math.floor(elapsed / 9000));
        st.scores.set(member.userId, (st.scores.get(member.userId) || 0) + gained);
        const drawerUserId = players(room).find((m) => m.seat === st.drawerSeat)?.userId;
        if (drawerUserId) st.scores.set(drawerUserId, (st.scores.get(drawerUserId) || 0) + 3);
        bus.broadcast(room, { t: 'guess_result', userId: member.userId, nickname: member.nickname, correct: true });
        bus.broadcast(room, { t: 'chat', userId: 0, nickname: '系统', kind: 'text', content: `${member.nickname} 猜对了！`, ts: Date.now() });

        // 全部猜对 → 提前结束回合
        const remaining = players(room).filter((m) => m.seat !== st.drawerSeat && !st.guessed.has(m.userId));
        if (remaining.length === 0) {
          endRound(room, '所有人都猜对了');
        }
        return {};
      }

      // 未猜对：作为普通聊天下转
      bus.broadcast(room, { t: 'chat', userId: member.userId, nickname: member.nickname, kind: 'text', content: raw, ts: Date.now() });
      return {};
    }

    return { error: '未知的游戏操作' };
  },

  serializeFor(room: Room, viewer: Member): Record<string, unknown> {
    const st = room.game as DrawState;
    const isDrawer = viewer.seat === st.drawerSeat;
    return {
      round: st.round,
      totalRounds: st.totalRounds,
      drawerSeat: st.drawerSeat,
      phase: st.phase,
      wordLen: st.word?.length || 0,
      category: st.category,
      deadline: st.deadline,
      isDrawer,
      word: isDrawer ? st.word : null, // 词只有画家能拿到
      myGuessed: st.guessed.has(viewer.userId),
      strokes: st.strokes,
      scores: [...st.scores].map(([userId, total]) => ({ userId, total })),
    };
  },
};
