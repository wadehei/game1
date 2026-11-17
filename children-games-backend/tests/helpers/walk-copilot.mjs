// 走查陪玩客户端：配合浏览器真人玩家
//   node tests/helpers/walk-copilot.mjs gomoku <roomId>   （uid4 自动 join+ready+轮流自动落子）
//   node tests/helpers/walk-copilot.mjs uno <roomId>      （uid4 自动 join+ready+轮到就出第一张可出的牌/摸牌）
// 事件全打 stdout，60s 后自动退出
import WebSocket from 'ws';

const [, , mode, roomId] = process.argv;
if (!mode || !roomId) {
  console.error('用法: node walk-copilot.mjs gomoku|uno <roomId>');
  process.exit(1);
}
const BASE = 'http://localhost:3002';

const login = async (uid) => {
  const res = await fetch(`${BASE}/api/user/login/family`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  }).then((r) => r.json());
  return res.data.accessToken || res.data.token;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const token = await login(4);
const events = [];
let hand = [];
let board = null;

const ws = new WebSocket(`ws://localhost:3002/ws?token=${token}&roomId=${roomId}`);
ws.on('open', () => console.log('[copilot] joined'));
ws.on('message', (d) => {
  const msg = JSON.parse(d.toString());
  events.push(msg);
  if (msg.t === 'joined') {
    console.log('[copilot] joined seat=', msg.yourSeat);
    ws.send(JSON.stringify({ t: 'ready' }));
  }
  if (msg.t === 'snapshot') {
    console.log('[copilot] snapshot phase=', msg.phase);
    if (msg.phase === 'waiting') ws.send(JSON.stringify({ t: 'ready' }));
    if (mode === 'gomoku' && msg.game?.board) board = msg.game.board;
    if (mode === 'uno' && msg.game?.myCards) hand = msg.game.myCards;
  }
  if (msg.t === 'game_start') console.log('[copilot] game_start');
  if (msg.t === 'move') {
    if (mode === 'gomoku' && board) {
      board[msg.y][msg.x] = msg.color;
      setTimeout(autoGomoku, 600);
    }
  }
  if (msg.t === 'uno_hand') hand = msg.cards || [];
  if (mode === 'uno') {
    if (msg.t === 'uno_state') {
      console.log('[copilot] uno_state turn=', msg.turnSeat, 'color=', msg.currentColor, 'top=', JSON.stringify(msg.top));
      unoTop = msg.top;
      setTimeout(autoUno, 700);
    }
    if (msg.t === 'uno_turn') {
      console.log('[copilot] uno_turn seat=', msg.seat);
    }
    if (msg.t === 'uno_drew') {
      console.log('[copilot] uno_drew userId=', msg.userId);
    }
  }
  if (mode === 'quiz' && msg.t === 'quiz_question') {
    const choice = Math.floor(Math.random() * (msg.options?.length || 4));
    console.log('[copilot] quiz_answer choice=', choice, 'qid=', msg.qid);
    setTimeout(() => ws.send(JSON.stringify({ t: 'quiz_answer', choice, qid: msg.qid })), 600);
  }
  if (msg.t === 'game_over') console.log('[copilot] game_over winnerSeat=', msg.winnerSeat, 'reason=', msg.reason);
  if (msg.t === 'error') console.log('[copilot] ERROR:', msg.message);
});

// 五子棋：找中心附近第一个空位落子
let gomokuStep = 0;
function autoGomoku() {
  if (!board) return;
  const N = board.length;
  for (let r = 2; r < N; r++) {
    for (let y = Math.floor(N / 2) - r; y <= Math.floor(N / 2) + r; y++) {
      for (let x = Math.floor(N / 2) - r; x <= Math.floor(N / 2) + r; x++) {
        if (board[y]?.[x] === 0) {
          gomokuStep += 1;
          console.log(`[copilot] move (${x},${y}) step${gomokuStep}`);
          ws.send(JSON.stringify({ t: 'move', x, y }));
          return;
        }
      }
    }
  }
}

// UNO：出第一张颜色/数字匹配的牌；没有就摸牌，摸完 pass
let unoDrawnThisTurn = false;
let unoTop = null;
function autoUno() {
  const st = events.filter((e) => e.t === 'uno_state').at(-1);
  if (!st) return;
  const me = events.filter((e) => e.t === 'joined').at(-1);
  const mySeat = me?.yourSeat ?? 0;
  if (st.turnSeat !== mySeat) { unoDrawnThisTurn = false; return; }
  const top = unoTop;
  const match = hand.find(
    (c) =>
      c.id &&
      c.id !== top?.id &&
      (c.color === 'wild' || c.color === top?.color || (c.value && c.value === top?.value))
  );
  if (match) {
    console.log('[copilot] uno_play', match.id, match.color, match.value ?? '');
    hand = hand.filter((c) => c.id !== match.id);
    unoDrawnThisTurn = false;
    ws.send(
      JSON.stringify({
        t: 'uno_play',
        cardId: match.id,
        ...(match.color === 'wild' ? { chooseColor: 'red' } : {}),
      })
    );
  } else if (!unoDrawnThisTurn) {
    console.log('[copilot] uno_draw');
    unoDrawnThisTurn = true;
    ws.send(JSON.stringify({ t: 'uno_draw' }));
  } else {
    console.log('[copilot] uno_pass');
    unoDrawnThisTurn = false;
    ws.send(JSON.stringify({ t: 'uno_pass' }));
  }
}

setTimeout(() => {
  console.log('[copilot] timeout exit');
  process.exit(0);
}, 60000);
