// 浏览器实测陪玩脚本（21点/三张牌比大小）：node tests/helpers/card-copilot.mjs blackjack|zjh <roomId>
// 行为：join+ready；21点自动下最小注+轮到就停牌；三张牌比大小自动跟注；事件摘要打到 stdout
import WebSocket from 'ws';

const [, , mode, roomId] = process.argv;
if (!mode || !roomId) {
  console.error('用法: node card-copilot.mjs blackjack|zjh <roomId>');
  process.exit(1);
}
const BASE = process.env.COPILOT_BASE || 'http://localhost:3002';
const uid = Number(process.env.COPILOT_UID) || 4;

const login = async (uid) => {
  const res = await fetch(`${BASE}/api/user/login/family`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  }).then((r) => r.json());
  return res.data.token;
};

const token = await login(uid);
const ws = new WebSocket(`ws://localhost:3002/ws?token=${token}&roomId=${roomId}`);
const send = (obj) => ws.send(JSON.stringify(obj));
let mySeat = -1;
let lastActKey = '';

ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.t === 'joined') {
    mySeat = m.yourSeat ?? -1;
    console.log('[copilot] joined seat=', mySeat, 'phase=', m.phase);
    send({ t: 'ready' });
  }
  if (m.t === 'game_start' || m.t === 'game_restart') send({ t: 'ready' });
  if (m.t === 'snapshot' && typeof m.yourSeat === 'number') mySeat = m.yourSeat;

  if (m.t === 'blackjack_phase' && m.phase === 'betting' && m.bankerSeat !== mySeat) {
    const key = `bet:${m.round}`;
    if (lastActKey !== key) {
      lastActKey = key;
      send({ t: 'blackjack_bet', amount: 10 });
    }
  }
  if (m.t === 'blackjack_phase' && m.phase === 'acting' && m.turnSeat === mySeat) {
    const key = `act:${m.round}`;
    if (lastActKey !== key) {
      lastActKey = key;
      send({ t: 'blackjack_stand' });
    }
  }
  if (m.t === 'zjh_phase' && m.phase === 'betting' && m.turnSeat === mySeat) {
    const key = `zjh:${m.roundNo}:${m.turnSeat}`;
    if (lastActKey !== key) {
      lastActKey = key;
      send({ t: 'zjh_call' });
    }
  }
  if (m.t === 'blackjack_settle' || m.t === 'zjh_settle') console.log('[copilot] settle', JSON.stringify(m.deltas || m.results));
  if (m.t === 'blackjack_final' || m.t === 'zjh_final') console.log('[copilot] final', JSON.stringify(m.ranking));
  if (m.t === 'game_over') setTimeout(() => send({ t: 'rematch' }), 1200);
});
ws.on('open', () => console.log('[copilot] ws open'));
ws.on('error', (e) => console.error('[copilot] error', e.message));
