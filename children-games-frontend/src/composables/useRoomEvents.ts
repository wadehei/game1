import { Ref } from 'vue';
import { soundManager } from '@/utils/sound';
import { showToast } from '@/utils/toastBus';
import type {
  MemberInfo,
  ChatItem,
  VoiceItem,
  S2CJoined,
  S2CSnapshot,
  S2CMemberUpdate,
  S2CGomokuMove,
  S2CGameStart,
  S2CGameRestart,
  S2CGameOver,
  S2CError,
  S2CRematchVote,
  S2CRematchDeadline,
  S2CChat,
  S2CVoice,
  S2CClosed,
  S2CQuizEvent,
  S2CDrawEvent,
  S2CSpyEvent,
  S2CUnoEvent,
  S2CBlackjackEvent,
  S2CZjhEvent,
} from '@children-games/shared';
import type { GameState, GameEvents, TypedWsLike, TypedRoomEventContext, GomokuGameState } from './wsTypes';

export interface RoomEventContext extends TypedRoomEventContext {}

interface WsLike extends TypedWsLike {}

// ─── composable ────────────────────────────────────
export const useRoomEvents = (
  ws: WsLike,
  ctx: RoomEventContext,
) => {
  const {
    myId, mySeat, gameType, members, phase,
    board, game, chatList, voiceList,
    overReason, rematchVotes, rematchDeadlineAt,
    lastWsError, gameEvents,
    applySnapshot, scrollChat, leaveToLobby,
  } = ctx;

  // ── 通用事件 ──
  const registerCommon = () => {
    ws.on('joined', (m: S2CJoined) => {
      mySeat.value = m.yourSeat;
      applySnapshot(m as unknown as S2CSnapshot);
    });
    ws.on('snapshot', applySnapshot);
    ws.on('member_update', (m: S2CMemberUpdate) => (members.value = m.members || []));
    ws.on('move', (m: S2CGomokuMove) => {
      if (board.value[m.y]) board.value[m.y][m.x] = m.color;
      if (game.value && 'turn' in game.value) {
        (game.value as GomokuGameState).turn = m.turn;
        (game.value as GomokuGameState).lastMove = m.lastMove;
        if (m.winner) {
          (game.value as GomokuGameState).winner = m.winner;
          (game.value as GomokuGameState).winLine = m.winLine || [];
        }
      }
      soundManager.playClick();
    });
    ws.on('game_start', (m: S2CGameStart) => {
      phase.value = m.phase;
      board.value = Array.from({ length: 15 }, () => Array(15).fill(0));
      game.value = { board: board.value, turn: 1, winner: 0, winLine: [], lastMove: null } as GomokuGameState;
      Object.keys(gameEvents.value).forEach((k) => {
        gameEvents.value[k as keyof GameEvents] = null;
      });
    });
    ws.on('game_restart', (m: S2CGameRestart) => {
      phase.value = m.phase;
      board.value = Array.from({ length: 15 }, () => Array(15).fill(0));
      game.value = { board: board.value, turn: 1, winner: 0, winLine: [], lastMove: null } as GomokuGameState;
      Object.keys(gameEvents.value).forEach((k) => {
        gameEvents.value[k as keyof GameEvents] = null;
      });
    });
    ws.on('game_over', (m: S2CGameOver) => {
      phase.value = 'ended';
      overReason.value = m.reason || '';
      if (gameType.value === 'gomoku' && game.value && 'winner' in game.value) {
        (game.value as GomokuGameState).winner = m.winnerSeat === 0 ? 1 : m.winnerSeat === 1 ? 2 : 3;
      }
      rematchVotes.value = [];
    });
    ws.on('error', (m: S2CError) => {
      lastWsError.value = m.message || '';
      setTimeout(() => (lastWsError.value = ''), 2500);
    });
    ws.on('rematch_vote', (m: S2CRematchVote) => {
      rematchVotes.value = m.userIds || [];
    });
    ws.on('rematch_deadline', (m: S2CRematchDeadline) => {
      rematchDeadlineAt.value = Number(m.deadline) || 0;
    });
    ws.on('chat', (m: S2CChat) => {
      chatList.value.push(m);
      if (chatList.value.length > 100) chatList.value.shift();
      scrollChat();
    });
    ws.on('voice', (m: S2CVoice) => {
      voiceList.value.push(m);
      if (voiceList.value.length > 50) voiceList.value.shift();
      scrollChat();
    });
    ws.on('closed', (m: S2CClosed) => {
      showToast(m.reason || '房间已解散');
      ws.close();
      leaveToLobby();
    });
    ws.on('error', (m: S2CError) => {
      if (m.message?.includes('房间不存在')) {
        showToast(m.message, 'error');
        ws.close();
        leaveToLobby();
      }
    });
    ws.on('disconnected', () => {
      // wsStatus 由 room.vue 监听 ws 自身状态处理
    });
  };

  // ── 答题对战 ──
  const registerQuiz = () => {
    ws.on('quiz_question', (m: Extract<S2CQuizEvent, { t: 'quiz_question' }>) => {
      gameEvents.value.question = m;
      gameEvents.value.result = null;
      gameEvents.value.final = null;
    });
    ws.on('quiz_result', (m: Extract<S2CQuizEvent, { t: 'quiz_result' }>) => {
      gameEvents.value.result = m;
    });
    ws.on('quiz_final', (m: Extract<S2CQuizEvent, { t: 'quiz_final' }>) => {
      gameEvents.value.final = m;
    });
  };

  // ── 你画我猜 ──
  const registerDraw = () => {
    ws.on('draw_round', (m: Extract<S2CDrawEvent, { t: 'draw_round' }>) => {
      gameEvents.value.round = { ...m, ts: Date.now() };
      gameEvents.value.stroke = null;
      gameEvents.value.final = null;
      gameEvents.value.hint = null;
      gameEvents.value.guessResult = [];
      if (game.value && typeof game.value === 'object') {
        const drawState = game.value as DrawGameState;
        drawState.phase = m.phase;
        drawState.drawerSeat = m.drawerSeat;
        drawState.isDrawer = mySeat.value >= 0 && m.drawerSeat === mySeat.value;
        drawState.round = m.round;
        drawState.totalRounds = m.totalRounds;
        drawState.deadline = m.deadline || 0;
        drawState.wordLen = m.wordLen || 0;
        drawState.category = m.category || '';
        drawState.word = null;
        drawState.strokes = [];
        drawState.myGuessed = false;
        drawState.guessedUserIds = [];
      }
    });
    ws.on('guess_result', (m: Extract<S2CDrawEvent, { t: 'guess_result' }>) => {
      const list = Array.isArray(gameEvents.value.guessResult) ? gameEvents.value.guessResult : [];
      list.push(m);
      gameEvents.value.guessResult = list;
      if (m.userId === myId.value && game.value && typeof game.value === 'object') {
        const drawState = game.value as DrawGameState;
        drawState.myGuessed = true;
        if (Array.isArray(drawState.guessedUserIds)) drawState.guessedUserIds.push(m.userId);
      }
    });
    ws.on('draw_candidates', (m: Extract<S2CDrawEvent, { t: 'draw_candidates' }>) => {
      gameEvents.value.candidates = m.words || [];
    });
    ws.on('draw_word', (m: Extract<S2CDrawEvent, { t: 'draw_word' }>) => {
      if (game.value && typeof game.value === 'object') {
        (game.value as DrawGameState).word = m.word;
      }
    });
    ws.on('draw_hint', (m: Extract<S2CDrawEvent, { t: 'draw_hint' }>) => {
      gameEvents.value.hint = m;
    });
    ws.on('draw_stroke', (m: Extract<S2CDrawEvent, { t: 'draw_stroke' }>) => {
      gameEvents.value.stroke = m;
    });
    ws.on('draw_undo', () => {
      gameEvents.value.undo = { ts: Date.now() };
    });
    ws.on('draw_clear', () => {
      gameEvents.value.clear = { ts: Date.now() };
    });
    ws.on('draw_round_end', (m: Extract<S2CDrawEvent, { t: 'draw_round_end' }>) => {
      gameEvents.value.roundEnd = m;
    });
    ws.on('draw_final', (m: Extract<S2CDrawEvent, { t: 'draw_final' }>) => {
      gameEvents.value.final = m;
      phase.value = 'ended';
    });
  };

  // ── 卧底 ──
  const registerSpy = () => {
    ws.on('spy_phase', (m: Extract<S2CSpyEvent, { t: 'spy_phase' }>) => {
      gameEvents.value.phase = m;
      if (game.value && typeof game.value === 'object') {
        const spyState = game.value as SpyGameState;
        spyState.phase = m.phase;
        spyState.deadline = m.deadline || 0;
        spyState.alive = m.alive || spyState.alive;
        spyState.isRevote = !!m.isRevote;
        spyState.revotePool = m.revotePool || null;
        spyState.votedCount = 0;
        spyState.total = (m.alive || []).length;
      }
    });
    ws.on('spy_deal', (m: Extract<S2CSpyEvent, { t: 'spy_deal' }>) => {
      gameEvents.value.deal = m;
    });
    ws.on('spy_vote_update', (m: Extract<S2CSpyEvent, { t: 'spy_vote_update' }>) => {
      gameEvents.value.voteUpdate = m;
      if (game.value && typeof game.value === 'object') {
        const spyState = game.value as SpyGameState;
        spyState.votedCount = m.votedCount;
        spyState.total = m.total;
      }
    });
    ws.on('spy_vote_result', (m: Extract<S2CSpyEvent, { t: 'spy_vote_result' }>) => {
      gameEvents.value.voteResult = m;
    });
    ws.on('spy_eliminated', (m: Extract<S2CSpyEvent, { t: 'spy_eliminated' }>) => {
      gameEvents.value.eliminated = m;
    });
    ws.on('spy_final', (m: Extract<S2CSpyEvent, { t: 'spy_final' }>) => {
      gameEvents.value.final = m;
      phase.value = 'ended';
    });
  };

  // ── UNO ──
  const registerUno = () => {
    ws.on('uno_state', (m: Extract<S2CUnoEvent, { t: 'uno_state' }>) => {
      gameEvents.value.uno_state = m;
      gameEvents.value.turn = { seat: m.turnSeat, seq: Date.now() };
      if (game.value && typeof game.value === 'object') {
        const unoState = game.value as UnoGameState;
        unoState.top = m.top;
        unoState.currentColor = m.currentColor;
        unoState.direction = m.direction;
        unoState.turnSeat = m.turnSeat;
        unoState.counts = m.counts;
      }
    });
    ws.on('uno_turn', (m: Extract<S2CUnoEvent, { t: 'uno_turn' }>) => {
      gameEvents.value.turn = { ...m, seq: Date.now() };
      if (game.value && typeof game.value === 'object') {
        (game.value as UnoGameState).turnSeat = m.seat;
      }
    });
    ws.on('uno_played', (m: Extract<S2CUnoEvent, { t: 'uno_played' }>) => {
      gameEvents.value.uno_played = m;
      if (game.value && typeof game.value === 'object') {
        const unoState = game.value as UnoGameState;
        unoState.top = m.card;
        if (m.chooseColor) unoState.currentColor = m.chooseColor;
      }
    });
    ws.on('uno_hand', (m: Extract<S2CUnoEvent, { t: 'uno_hand' }>) => {
      gameEvents.value.uno_hand = m;
    });
    ws.on('uno_drew', (m: Extract<S2CUnoEvent, { t: 'uno_drew' }>) => {
      gameEvents.value.drew = { ...m, seq: Date.now() };
    });
    ws.on('uno_final', (m: Extract<S2CUnoEvent, { t: 'uno_final' }>) => {
      gameEvents.value.final = m;
      phase.value = 'ended';
    });
  };

  // ── 21点 ──
  const registerBlackjack = () => {
    const seatOfUser = (userId: number): number =>
      members.value.find((m) => m.userId === userId)?.seat ?? -1;
    const bjEntry = (userId: number, round: number) => {
      if (!game.value || typeof game.value !== 'object') return null;
      const bjState = game.value as BlackjackGameState;
      const log: Array<{ userId: number; round: number; stake: number; doubled: boolean; delta: number | null; outcome: string | null }> = bjState.betLedger || [];
      let entry = log.find((e) => e.userId === userId && e.round === round && e.delta === null);
      if (!entry) {
        entry = { userId, round, stake: 0, doubled: false, delta: null, outcome: null };
        bjState.betLedger = [...log, entry];
      }
      return entry;
    };

    ws.on('blackjack_phase', (m: Extract<S2CBlackjackEvent, { t: 'blackjack_phase' }>) => {
      if (game.value && typeof game.value === 'object') {
        const bjState = game.value as BlackjackGameState;
        const newRound = bjState.round !== m.round;
        bjState.round = m.round;
        bjState.totalRounds = m.totalRounds;
        bjState.phase = m.phase;
        bjState.bankerSeat = m.bankerSeat;
        bjState.turnSeat = m.turnSeat;
        bjState.deadline = m.deadline || 0;
        bjState.chips = m.chips || bjState.chips;
        bjState.canPassBank = !!m.canPassBank;
        bjState.isBanker = m.bankerSeat === mySeat.value;
        if (newRound && m.phase === 'betting') {
          gameEvents.value.handsView = [];
          bjState.myCards = [];
          bjState.myStake = 0;
          bjState.myDone = false;
          bjState.myBusted = false;
          bjState.myNatural = false;
          bjState.myDoubled = false;
          bjState.bankerCards = [];
          bjState.bankerValue = null;
          bjState.lastResults = null;
        }
      }
    });
    ws.on('blackjack_deal', (m: Extract<S2CBlackjackEvent, { t: 'blackjack_deal' }>) => {
      soundManager.playDeal();
      gameEvents.value.handsView = (m.hands || []).map((h) => ({
        ...h,
        seat: seatOfUser(h.userId),
        done: !!h.natural,
        busted: false,
      }));
      const mine = (m.hands || []).find((h) => h.userId === myId.value);
      if (game.value && typeof game.value === 'object') {
        const bjState = game.value as BlackjackGameState;
        bjState.myCards = mine ? [...mine.cards] : [];
        bjState.myStake = mine?.stake || 0;
        bjState.myNatural = !!mine?.natural;
        bjState.myDone = !!mine?.natural;
        if (bjState.isBanker) {
          bjState.bankerCards = m.bankerUpcard ? [m.bankerUpcard] : [];
        } else {
          bjState.bankerCards = m.bankerUpcard ? [m.bankerUpcard] : [];
        }
      }
    });
    ws.on('blackjack_your_banker', (m: Extract<S2CBlackjackEvent, { t: 'blackjack_your_banker' }>) => {
      if (game.value && typeof game.value === 'object') {
        (game.value as BlackjackGameState).bankerCards = m.cards || [];
      }
    });
    ws.on('blackjack_action', (m: Extract<S2CBlackjackEvent, { t: 'blackjack_action' }>) => {
      if (!game.value || typeof game.value !== 'object') return;
      const bjState = game.value as BlackjackGameState;
      if (m.action === 'banker_hit') {
        bjState.bankerCards = [...(bjState.bankerCards || []), m.card];
        bjState.bankerValue = m.total;
        return;
      }
      if (m.action === 'hit' || m.action === 'double') {
        const finished = m.action === 'double' || !!m.busted || m.total === 21;
        if (m.userId === myId.value) {
          bjState.myCards = [...(bjState.myCards || []), m.card];
          if (m.action === 'double') bjState.myStake = m.stake;
          bjState.myDone = finished;
          bjState.myBusted = !!m.busted;
        }
        if (m.action === 'double') {
          gameEvents.value.doubled = { userId: m.userId, stake: m.stake, seq: Date.now() };
          const entry = bjEntry(m.userId, bjState.round);
          if (entry) {
            entry.stake = m.stake;
            entry.doubled = true;
          }
        }
        const item = (gameEvents.value.handsView || []).find((x: any) => x.userId === m.userId);
        if (item && m.userId !== myId.value) {
          item.cards = [...(item.cards || []), m.card];
          item.done = finished;
          item.busted = !!m.busted;
        } else if (item) {
          item.done = finished;
          item.busted = !!m.busted;
        }
        return;
      }
      if (m.action === 'stand') {
        if (m.userId === myId.value) bjState.myDone = true;
        const item = (gameEvents.value.handsView || []).find((x: any) => x.userId === m.userId);
        if (item) item.done = true;
        return;
      }
      if (m.action === 'bet' && m.stake) {
        soundManager.playChip();
        const entry = bjEntry(m.userId, bjState.round);
        if (entry) entry.stake = m.stake;
        const item = (gameEvents.value.handsView || []).find((x: any) => x.userId === m.userId);
        if (item) item.stake = m.stake;
      }
    });
    ws.on('blackjack_settle', (m: Extract<S2CBlackjackEvent, { t: 'blackjack_settle' }>) => {
      if (game.value && typeof game.value === 'object') {
        const bjState = game.value as BlackjackGameState;
        bjState.lastResults = m.results || [];
        bjState.chips = m.chips || bjState.chips;
        bjState.bankerCards = m.bankerCards || [];
        bjState.bankerValue = m.bankerValue ?? bjState.bankerValue;
        bjState.phase = 'settle';
        for (const r of m.results || []) {
          const entry = (bjState.betLedger || []).find(
            (e) => e.userId === r.userId && e.round === m.round && e.delta === null,
          );
          if (entry) {
            entry.delta = r.delta;
            entry.outcome = r.outcome;
          }
        }
        bjState.nextDeadline = m.nextDeadline || 0;
        const mySettle = (m.results || []).find((r) => r.userId === myId.value);
        if (mySettle) {
          if (mySettle.delta > 0) soundManager.playSuccess();
          else if (mySettle.delta < 0) soundManager.playFail();
        }
      }
      for (const r of m.results || []) {
        const item = (gameEvents.value.handsView || []).find((x: any) => x.userId === r.userId);
        if (item) {
          item.done = true;
          if (r.outcome === 'bust') item.busted = true;
          if (r.outcome === 'blackjack') item.natural = true;
        }
      }
    });
    ws.on('blackjack_final', (m: Extract<S2CBlackjackEvent, { t: 'blackjack_final' }>) => {
      gameEvents.value.final = m;
      phase.value = 'ended';
    });
  };

  // ── 炸金花 ──
  const registerZjh = () => {
    const resetZjhOthers = () => {
      if (game.value && typeof game.value === 'object') {
        const zjhState = game.value as ZjhGameState;
        zjhState.others = members.value
          .filter((m) => m.seat >= 0 && m.userId !== myId.value)
          .map((m) => ({
            userId: m.userId, nickname: m.nickname, seat: m.seat,
            seen: false, folded: false, allIn: false, betTotal: 10,
          }));
      }
    };

    ws.on('zjh_phase', (m: Extract<S2CZjhEvent, { t: 'zjh_phase' }>) => {
      if (game.value && typeof game.value === 'object') {
        const zjhState = game.value as ZjhGameState;
        const newHand = zjhState.round !== m.round;
        zjhState.round = m.round;
        zjhState.totalRounds = m.totalRounds;
        zjhState.phase = m.phase;
        zjhState.dealerSeat = m.dealerSeat;
        zjhState.pot = m.pot;
        zjhState.stake = m.stake;
        zjhState.roundNo = m.roundNo;
        zjhState.turnSeat = m.turnSeat;
        zjhState.deadline = m.deadline || 0;
        zjhState.compareMinRound = m.compareMinRound || 3;
        zjhState.aliveCount = m.aliveCount;
        zjhState.chips = m.chips || zjhState.chips;
        if (newHand && m.phase === 'betting') {
          zjhState.myCards = null;
          zjhState.mySeen = false;
          zjhState.myFolded = false;
          zjhState.myAllIn = false;
          zjhState.myBetTotal = 10;
          zjhState.myRank = null;
          gameEvents.value.showdown = null;
          gameEvents.value.settle = null;
          gameEvents.value.compareCards = null;
          resetZjhOthers();
          if (Array.isArray(m.entrants)) {
            const log: Array<{ userId: number; round: number; betTotal: number; delta: number | null; ended: string | null }> = zjhState.betLedger || [];
            for (const uid of m.entrants) {
              if (!log.some((e) => e.userId === uid && e.round === m.round)) {
                log.push({ userId: uid, round: m.round, betTotal: 10, delta: null, ended: null });
              }
            }
            zjhState.betLedger = [...log];
          }
        }
      }
    });
    ws.on('zjh_your_cards', (m: Extract<S2CZjhEvent, { t: 'zjh_your_cards' }>) => {
      if (game.value && typeof game.value === 'object') {
        const zjhState = game.value as ZjhGameState;
        zjhState.myCards = m.cards || [];
        zjhState.mySeen = true;
        zjhState.myRank = m.rank || null;
        soundManager.playFlip();
      }
    });
    ws.on('zjh_action', (m: Extract<S2CZjhEvent, { t: 'zjh_action' }>) => {
      if (!game.value || typeof game.value !== 'object') return;
      const zjhState = game.value as ZjhGameState;
      const others = zjhState.others || [];
      if (m.action === 'look') {
        const o = others.find((x) => x.userId === m.userId);
        if (o) o.seen = true;
        return;
      }
      if (m.action === 'call' || m.action === 'timeout_call') {
        zjhState.pot = m.pot ?? zjhState.pot;
        zjhState.stake = m.stake ?? zjhState.stake;
        if (m.action === 'call') soundManager.playChip();
        const o = others.find((x) => x.userId === m.userId);
        if (o) {
          o.betTotal = (o.betTotal || 0) + (m.cost || 0);
          if (m.allIn) o.allIn = true;
        }
        const entry = (zjhState.betLedger || []).find(
          (e) => e.userId === m.userId && e.round === zjhState.round && e.delta === null,
        );
        if (entry) entry.betTotal += m.cost || 0;
        return;
      }
      if (m.action === 'fold' || m.action === 'timeout_fold') {
        const o = others.find((x) => x.userId === m.userId);
        if (o) o.folded = true;
        zjhState.aliveCount = m.aliveCount ?? zjhState.aliveCount;
        if (m.userId === myId.value) zjhState.myFolded = true;
      }
    });
    ws.on('zjh_compare', (m: Extract<S2CZjhEvent, { t: 'zjh_compare' }>) => {
      if (!game.value || typeof game.value !== 'object') return;
      const zjhState = game.value as ZjhGameState;
      const others = zjhState.others || [];
      const loser = others.find((x) => x.userId === m.loser);
      if (loser) loser.folded = true;
      const winner = others.find((x) => x.userId === m.winner);
      if (winner) winner.seen = true;
      const prevPot = zjhState.pot || 0;
      zjhState.pot = m.pot ?? zjhState.pot;
      zjhState.aliveCount = m.aliveCount ?? zjhState.aliveCount;
      if (m.loser === myId.value) zjhState.myFolded = true;
      const cmpLog: Array<{ userId: number; round: number; betTotal: number; delta: number | null; ended: string | null }> = zjhState.betLedger || [];
      const cmpEntry = cmpLog.find(
        (e) => e.userId === m.from && e.round === zjhState.round && e.delta === null,
      );
      if (cmpEntry) cmpEntry.betTotal += typeof m.cost === 'number' ? m.cost : Math.max(0, (m.pot || 0) - prevPot);
      gameEvents.value.yanpai = { from: m.from, to: m.to, seq: Date.now() };
      gameEvents.value.compare = { ...m, seq: Date.now() };
      zjhState.compareLog = [
        ...(zjhState.compareLog || []),
        { round: zjhState.round, from: m.from, to: m.to, winner: m.winner, seq: Date.now() },
      ];
    });
    ws.on('zjh_compare_cards', (m: Extract<S2CZjhEvent, { t: 'zjh_compare_cards' }>) => {
      gameEvents.value.compareCards = m;
    });
    ws.on('zjh_showdown', (m: Extract<S2CZjhEvent, { t: 'zjh_showdown' }>) => {
      gameEvents.value.showdown = m;
      if (game.value && typeof game.value === 'object') {
        (game.value as ZjhGameState).phase = 'showdown';
      }
    });
    ws.on('zjh_settle', (m: Extract<S2CZjhEvent, { t: 'zjh_settle' }>) => {
      gameEvents.value.settle = m;
      if (game.value && typeof game.value === 'object') {
        const zjhState = game.value as ZjhGameState;
        zjhState.pot = 0;
        zjhState.phase = 'settle';
        zjhState.nextDeadline = m.nextDeadline || 0;
        if (Array.isArray(m.deltas)) {
          zjhState.chips = m.deltas.map((d) => ({ userId: d.userId, chips: d.chips }));
          const meDelta = m.deltas.find((d) => d.userId === myId.value);
          if (meDelta) zjhState.myChips = meDelta.chips;
          const othersNow = zjhState.others || [];
          const isFolded = (uid: number) =>
            uid === myId.value ? zjhState.myFolded : !!othersNow.find((x) => x.userId === uid)?.folded;
          for (const d of m.deltas) {
            const entry = (zjhState.betLedger || []).find(
              (e) => e.userId === d.userId && e.round === m.round && e.delta === null,
            );
            if (entry) {
              entry.delta = d.delta;
              entry.ended = m.winner === d.userId ? 'win' : isFolded(d.userId) ? 'fold' : 'showdown';
            }
          }
        }
        const meInDeltas = Array.isArray(m.deltas) ? m.deltas.find((d) => d.userId === myId.value) : null;
        if (meInDeltas) {
          if (meInDeltas.delta > 0) soundManager.playSuccess();
          else if (meInDeltas.delta < 0) soundManager.playFail();
        }
      }
    });
    ws.on('zjh_final', (m: Extract<S2CZjhEvent, { t: 'zjh_final' }>) => {
      gameEvents.value.final = m;
      phase.value = 'ended';
    });
  };

  // ── 注册全部事件 ──
  const registerAll = () => {
    registerCommon();
    registerQuiz();
    registerDraw();
    registerSpy();
    registerUno();
    registerBlackjack();
    registerZjh();
  };

  return { registerAll };
};
