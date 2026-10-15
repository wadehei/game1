// 21点庄家 Blackjack 专项测试（需后端以 BLACKJACK_RIGGED=banker 启动：庄家固定发 BJ）
// 覆盖：庄家 BJ 立即开牌（无行动阶段）→ 非 BJ 玩家输原注 / 玩家 BJ 平局退注 → 终局正常
import WebSocket from 'ws';

const BASE = process.env.BASE || 'http://localhost:3002';
const WS_BASE = process.env.WS_BASE || 'ws://localhost:3002';
let pass = 0;
let failCount = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  cond ? pass++ : failCount++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const http = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
};

class Client {
  constructor(token, name) {
    this.token = token;
    this.name = name;
    this.events = [];
  }
  connect(roomId) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws?token=${this.token}&roomId=${roomId}`);
      const timeout = setTimeout(() => reject(new Error('连接超时')), 6000);
      this.ws.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        this.events.push(msg);
        if (msg.t === 'joined') {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
      this.ws.on('error', (e) => {
        clearTimeout(timeout);
        reject(e);
      });
    });
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  all(t) {
    return this.events.filter((e) => e.t === t);
  }
  last(t) {
    return this.all(t).at(-1);
  }
  async waitNew(t, baseline, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const all = this.all(t);
      if (all.length > baseline) return all.at(-1);
      await sleep(80);
    }
    throw new Error(`等待 ${t} 超时（基线 ${baseline}）`);
  }
  close() {
    this.ws?.close();
  }
}

const tokens = [];
for (const uid of [2, 4, 6]) {
  tokens.push((await http('POST', '/api/user/login/family', { uid })).json.data.token);
}
const created = await http('POST', '/api/room', { gameType: 'blackjack', config: { bankerMode: 'rotate', roundLimit: 1, career: false } }, tokens[0]);
check('创建房间', created.json?.code === 200);
const roomId = created.json.data.roomId;

const A = new Client(tokens[0], 'A');
const B = new Client(tokens[1], 'B');
const C = new Client(tokens[2], 'C');
await A.connect(roomId);
await B.connect(roomId);
await C.connect(roomId);
for (const c of [B, C, A]) c.send({ t: 'ready' });
await A.waitNew('blackjack_phase', 0);

// 全员下注 → 发牌（庄家固定 BJ，应立即开牌）
const dealBase = A.all('blackjack_deal').length;
B.send({ t: 'blackjack_bet', amount: 20 });
C.send({ t: 'blackjack_bet', amount: 20 });
const deal = await A.waitNew('blackjack_deal', dealBase);
check('发牌庄家 BJ（upcard=A）', deal.bankerUpcard.includes('A'));

// 庄家 BJ 立即开牌：不应进入行动阶段（无 turnSeat>0 的 acting）
const acting = A.all('blackjack_phase').filter((e) => e.phase === 'acting' && e.turnSeat >= 0);
check('庄家 BJ 无行动阶段', acting.length === 0);

const settle = await A.waitNew('blackjack_settle', 0);
check('庄家 BJ 立即结算且值为 21', settle.bankerValue === 21 && settle.bankerCards.length === 2);
check('非 BJ 玩家输原注（-20）', settle.results.filter((r) => r.outcome === 'lose').every((r) => r.delta === -20));
const bjPlayers = settle.results.filter((r) => r.outcome === 'push');
check('玩家 BJ 平局退注（0）', bjPlayers.every((r) => r.delta === 0));

const final = await A.waitNew('blackjack_final', 0);
check('一手后正常终局', final.ranking.length === 3);
const over = await A.waitNew('game_over', 0);
check('game_over 正常广播', typeof over.winnerSeat === 'number');

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
