// 答题对战 handler：全员同时竞答，服务端驱动题目推进，按作答速度加分
// 防作弊红线：quiz_question 事件与 serializeFor 输出中永不包含 answer
import { getRoom, type Room, type Member } from '../roomManager';
import { addTimer, clearRoomTimers } from '../roomManager';
import type { ActionResult, GameHandler } from './types';
import { getRoomBus } from '../bus';
import { QuizQuestion } from '../../models';

const QUESTION_SECONDS = 15;
const REVEAL_SECONDS = 3;
const FIRST_DELAY_MS = 1500;

interface QuizQ {
  qid: number;
  text: string;
  options: string[];
  answer: number;
}

interface QuizState {
  questions: QuizQ[];
  total: number;
  index: number; // -1 = 尚未开始出题
  deadline: number;
  scores: Map<number, number>; // userId -> 总分
  answers: Map<number, Map<number, number>>; // index -> userId -> choice
  answerTs: Map<number, Map<number, number>>; // index -> userId -> 作答时间戳
  revealTimer: NodeJS.Timeout | null;
  nextTimer: NodeJS.Timeout | null;
}

const QUESTION_COUNT = 10;

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const playingUsers = (room: Room): Member[] => [...room.members.values()].filter((m) => m.seat >= 0);

const clearQuizTimers = (state: QuizState): void => {
  if (state.revealTimer) clearTimeout(state.revealTimer);
  if (state.nextTimer) clearTimeout(state.nextTimer);
  state.revealTimer = null;
  state.nextTimer = null;
};

export const quizHandler: GameHandler<QuizState> = {
  type: 'quiz',
  title: '答题对战',
  emoji: '🧠',
  desc: '全员同时竞答 10 题，答得又对又快分更高',
  minPlayers: 2,
  maxPlayers: 8,
  allowSpectators: true,
  rematchSwapSeats: false,

  create(): QuizState {
    return {
      questions: [],
      total: 0,
      index: -1,
      deadline: 0,
      scores: new Map(),
      answers: new Map(),
      answerTs: new Map(),
      revealTimer: null,
      nextTimer: null,
    };
  },

  // 开局：随机抽取题目，稍后开始第一题
  start(room): void {
    clearQuizTimers(room.game);
    clearRoomTimers(room);
    void (async () => {
      try {
        const rows = await QuizQuestion.findAll();
        if (rows.length === 0) {
          getRoomBus().broadcast(room, { t: 'error', message: '题库为空，请联系管理员导入题目' });
          return;
        }
        const picked = shuffle(rows).slice(0, Math.min(QUESTION_COUNT, rows.length));
        const st = room.game as QuizState;
        st.questions = picked.map((r) => ({
          qid: r.id,
          text: r.text,
          options: (r.options as string[]) || [],
          answer: r.answer,
        }));
        st.total = st.questions.length;
        st.index = -1;
        st.scores = new Map();
        st.answers = new Map();
        st.answerTs = new Map();
        playingUsers(room).forEach((m) => st.scores.set(m.userId, 0));

        const first = addTimer(
          room,
          setTimeout(() => {
            const r = getRoom(room.id);
            if (r) nextQuestion(r);
          }, FIRST_DELAY_MS)
        );
        void first;
      } catch (err) {
        getRoomBus().broadcast(room, {
          t: 'error',
          message: `题目加载失败: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    })();
  },

  onPlayerQuit(room: Room, member: Member): ActionResult | void {
    room.game.scores.delete(member.userId);
    // 人走光了由房间层解散；有存活玩家则对局继续，不强制终局
    const players = [...room.members.values()].filter((m) => m.seat >= 0);
    if (players.length === 0) {
      return { ended: { winnerSeat: -1, reason: '玩家全部离开' } };
    }
    if (room.phase === 'playing' && players.length < 2) {
      // 只剩一人：直接判其获胜结束
      return { ended: { winnerSeat: players[0].seat, reason: '其他玩家已离开' } };
    }
    return undefined;
  },

  onAction(room: Room, member: Member, action: string, payload: any): ActionResult {
    if (action !== 'quiz_answer') return { error: '未知的游戏操作' };
    if (room.phase !== 'playing' || member.seat < 0) return { error: '当前不能作答' };

    const st = room.game as QuizState;
    const index = st.index;
    if (index < 0 || index >= st.total) return { error: '当前没有进行中的题目' };
    const q = st.questions[index];
    if (Number(payload?.qid) !== q.qid) return { error: '题目已切换' };
    if (Date.now() > st.deadline) return { error: '本题作答时间已结束' };

    if (!st.answers.has(index)) st.answers.set(index, new Map());
    const perQ = st.answers.get(index)!;
    if (perQ.has(member.userId)) return { error: '你已经作答过本题' };

    const choice = Number(payload?.choice);
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return { error: '无效的选项' };

    perQ.set(member.userId, choice);
    if (!st.answerTs.has(index)) st.answerTs.set(index, new Map());
    st.answerTs.get(index)!.set(member.userId, Date.now());

    // 全员（玩家席位）答完 → 立即揭晓
    const players = playingUsers(room);
    if (players.length > 0 && players.every((m) => perQ.has(m.userId))) {
      reveal(room);
    }
    return {};
  },

  serializeFor(room: Room, viewer: Member): Record<string, unknown> {
    const st = room.game as QuizState;
    if (st.index < 0 || st.index >= st.total) {
      return {
        total: st.total,
        index: st.index,
        scores: [...st.scores].map(([userId, total]) => ({ userId, total })),
      };
    }
    const q = st.questions[st.index];
    return {
      total: st.total,
      index: st.index,
      deadline: st.deadline,
      qid: q.qid,
      text: q.text,
      options: q.options,
      myAnswered: st.answers.get(st.index)?.has(viewer.userId) || false,
      scores: [...st.scores].map(([userId, total]) => ({ userId, total })),
    };
  },
};

/** 推进到下一题；题目用完则终局 */
function nextQuestion(room: Room): void {
  const st = room.game as QuizState;
  st.index += 1;
  if (st.index >= st.total) {
    finish(room);
    return;
  }
  const q = st.questions[st.index];
  st.deadline = Date.now() + QUESTION_SECONDS * 1000;
  const bus = getRoomBus();
  bus.broadcast(room, {
    t: 'quiz_question',
    index: st.index,
    total: st.total,
    qid: q.qid,
    text: q.text,
    options: q.options,
    deadline: st.deadline,
  });

  const timer = setTimeout(() => {
    const r = getRoom(room.id);
    if (r && (r.game as QuizState).index === st.index && r.phase === 'playing') {
      reveal(r);
    }
  }, QUESTION_SECONDS * 1000);
  st.revealTimer = timer;
  addTimer(room, timer);
}

/** 揭晓答案与得分，随后进入下一题 */
function reveal(room: Room): void {
  const st = room.game as QuizState;
  clearQuizTimers(st);
  const q = st.questions[st.index];
  const perQ = st.answers.get(st.index) || new Map<number, number>();
  const tsMap = st.answerTs.get(st.index) || new Map<number, number>();
  const qStart = st.deadline - QUESTION_SECONDS * 1000;

  const delta = playingUsers(room).map((m) => {
    const choice = perQ.get(m.userId);
    let gained = 0;
    if (choice === q.answer) {
      const ts = tsMap.get(m.userId) || st.deadline;
      const remainSec = Math.max(0, Math.min(QUESTION_SECONDS, (st.deadline - ts) / 1000));
      gained = 10 + Math.min(5, Math.ceil(remainSec * 0.5));
    }
    const total = (st.scores.get(m.userId) || 0) + gained;
    st.scores.set(m.userId, total);
    return { userId: m.userId, gained, total };
  });

  const bus = getRoomBus();
  bus.broadcast(room, { t: 'quiz_result', qid: q.qid, answer: q.answer, delta });

  const isLast = st.index >= st.total - 1;
  const timer = setTimeout(
    () => {
      const r = getRoom(room.id);
      if (!r) return;
      if (isLast) {
        finish(r);
      } else {
        nextQuestion(r);
      }
    },
    isLast ? 2500 : REVEAL_SECONDS * 1000
  );
  st.nextTimer = timer;
  addTimer(room, timer);
}

/** 终局：按总分排名 */
function finish(room: Room): void {
  const st = room.game as QuizState;
  clearQuizTimers(st);
  const ranking = [...st.scores]
    .map(([userId, total]) => {
      const m = room.members.get(userId);
      return { userId, nickname: m?.nickname || `角色${userId}`, total };
    })
    .sort((a, b) => b.total - a.total);

  const bus = getRoomBus();
  bus.broadcast(room, { t: 'quiz_final', ranking });

  const topSeat = ranking.length
    ? room.members.get(ranking[0].userId)?.seat ?? -1
    : -1;
  // 通过 bus 广播 game_over（ended 由 handler 返回通道不便在定时器里使用）
  bus.broadcast(room, { t: 'game_over', winnerSeat: topSeat >= 0 ? topSeat : -1, reason: '竞答结束' });
  room.phase = 'ended';
  clearRoomTimers(room);
}
