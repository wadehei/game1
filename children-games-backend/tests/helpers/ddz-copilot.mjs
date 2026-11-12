// 斗地主陪玩机器人（浏览器实测用）：自动 ready/叫分/出牌
// 用法：COPILOT_UID=4 COPILOT_BASE=http://localhost:3002 node tests/helpers/ddz-copilot.mjs <roomId>
//   COPILOT_BASE 默认 http://localhost:3002（WS 仍连 localhost:3002；测生产时本地 SSH 隧道或改代码）
//   COPILOT_UID 默认 4（另一路开 6；12 在生产可用）
const BASE = process.env.COPILOT_BASE || 'http://localhost:3002';
const WS_BASE = 'ws://localhost:3002/ws';
const uid = Number(process.env.COPILOT_UID || 4);
const roomId = process.argv[2];
if (!roomId) {
  console.error('用法: node tests/helpers/ddz-copilot.mjs <roomId>');
  process.exit(1);
}

const post = async (path, body, token) => {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
};

const login = await post('/api/user/login/family', { uid });
const token = login?.data?.accessToken || login?.data?.token;
if (!token) {
  console.error(`[ddz-copilot] uid ${uid} 登录失败`, JSON.stringify(login).slice(0, 200));
  process.exit(1);
}
const nickname = login.data.userInfo?.nickname || `uid${uid}`;

const WebSocket = (await import('ws')).default;
const ws = new WebSocket(`${WS_BASE}?token=${token}&roomId=${roomId}`);
let mySeat = -1;
let myUid = login.data.userInfo?.id || 0;
let hand = [];
const log = (...a) => console.log(`[ddz-copilot:${nickname}]`, ...a);

ws.on('open', () => log('已连接'));
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.t === 'joined') {
    mySeat = m.yourSeat ?? -1;
    ws.send(JSON.stringify({ t: 'ready' }));
    log('入房 seat =', mySeat, '已 ready');
  }
  if (m.t === 'game_start' || m.t === 'game_restart') {
    setTimeout(() => ws.send(JSON.stringify({ t: 'ready' })), 300);
  }
  if (m.t === 'ddz_your_cards') hand = [...m.cards];
  if (m.t === 'ddz_play' && m.userId === myUid) {
    for (const c of m.cards || []) {
      const i = hand.indexOf(c);
      if (i >= 0) hand.splice(i, 1);
    }
  }
  if (m.t === 'ddz_phase' && m.phase === 'bidding' && m.turnSeat === mySeat) {
    const score = Math.min(3, (m.bidBestScore || 0) + 1);
    setTimeout(() => ws.send(JSON.stringify({ t: 'ddz_bid', score })), 600);
  }
  if (m.t === 'ddz_phase' && m.phase === 'playing' && m.turnSeat === mySeat) {
    setTimeout(() => {
      const isLead = m.turnSeat === m.leadSeat || !m.lastPlay;
      if (isLead) {
        const min = hand.at(-1);
        if (min) {
          ws.send(JSON.stringify({ t: 'ddz_play', cards: [min] }));
          log('出牌', min);
        }
      } else {
        ws.send(JSON.stringify({ t: 'ddz_pass' }));
        log('不出');
      }
    }, 700);
  }
  if (m.t === 'game_over') log('终局:', m.reason || '', '1.5s 后自动再来一局');
  if (m.t === 'game_over') setTimeout(() => ws.send(JSON.stringify({ t: 'rematch' })), 1500);
});
ws.on('error', (e) => log('WS 错误', e.message));
ws.on('close', () => {
  log('连接关闭，30 分钟保活退出');
  process.exit(0);
});
// 保活 30 分钟
setTimeout(() => process.exit(0), 30 * 60 * 1000).unref();
