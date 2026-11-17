/**
 * useRoomEvents - 通用事件处理（所有游戏共享）
 */
import { showToast } from '@/utils/toastBus';
import type {
  S2CJoined,
  S2CSnapshot,
  S2CMemberUpdate,
  S2CGameStart,
  S2CGameRestart,
  S2CGameOver,
  S2CError,
  S2CRematchVote,
  S2CRematchDeadline,
  S2CChat,
  S2CVoice,
  S2CClosed,
} from '@children-games/shared';
import type { RoomEventContext, WsLike } from './types';
import type { GomokuGameState } from '../wsTypes';

export function registerCommon(ws: WsLike, ctx: RoomEventContext) {
  const {
    mySeat,
    gameType,
    members,
    phase,
    board,
    game,
    chatList,
    voiceList,
    overReason,
    rematchVotes,
    rematchDeadlineAt,
    lastWsError,
    gameEvents,
    applySnapshot,
    scrollChat,
    leaveToLobby,
  } = ctx;

  ws.on('joined', (m: S2CJoined) => {
    mySeat.value = m.yourSeat;
    applySnapshot(m as unknown as S2CSnapshot);
  });

  ws.on('snapshot', applySnapshot);

  ws.on('member_update', (m: S2CMemberUpdate) => {
    members.value = m.members || [];
  });

  /** 重置游戏状态（game_start 和 game_restart 共用） */
  const resetGameState = (targetPhase: 'waiting' | 'playing' | 'ended') => {
    phase.value = targetPhase;
    if (gameType.value === 'gomoku') {
      // 五子棋必须同时重建 game.value 并与 board.value 绑定为同一数组：
      // move 事件写 board.value[y][x]，棋盘组件渲染的是 game.value.board（room.vue
      // applySnapshot 建立的同引用绑定），只重置 board 会脱钩 → 落子不显示、rematch 残留上局
      board.value = Array.from({ length: 15 }, () => Array(15).fill(0));
      game.value = {
        board: board.value,
        turn: 1,
        winner: 0,
        winLine: [],
        lastMove: null,
      } as GomokuGameState;
    }
    Object.keys(gameEvents).forEach((k) => {
      (gameEvents as Record<string, unknown>)[k] = null;
    });
  };

  ws.on('game_start', (m: S2CGameStart) => {
    resetGameState(m.phase);
  });

  ws.on('game_restart', (m: S2CGameRestart) => {
    resetGameState(m.phase);
  });

  ws.on('game_over', (m: S2CGameOver) => {
    phase.value = 'ended';
    overReason.value = m.reason || '';
    // 认输/超时/对方退出路径没有 move 事件携带 winner，必须从 winnerSeat 回填：
    // 0=黑胜→1、1=白胜→2、-1=平局→3（room.vue 的 overText 直接读 g.winner）
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
}
