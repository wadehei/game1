// 你画我猜掉线处置测试（需后端在线，默认 http://localhost:3002；3 个角色 uid 2/4/6）
// 覆盖：画家掉线 → 当前回合立即结束轮到下一位（不再卡满 90s）；猜词方全掉线 → 回合立即结束
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
  async waitNew(t, baseline, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const all = this.all(t);
      if (all.length > baseline) return all.at(-1);
      await sleep(60);
    }
    throw new Error(`等待 ${t} 超时（基线 ${baseline}）`);
  }
  close() {
    this.ws?.close();
  }
}

// ── 开始（3 人：uid 2/4/6，座位 0/1/2） ──
const tokens = [];
for (const uid of [2, 4, 6]) {
  tokens.push((await http('POST', '/api/user/login/family', { uid })).json.data.token);
}
check('3 角色登录', tokens.every(Boolean));

const created = await http('POST', '/api/room', { gameType: 'draw' }, tokens[0]);
check('创建你画我猜房间', created.json?.code === 200 && created.json.data.gameType === 'draw');
const roomId = created.json.data.roomId;

const A = new Client(tokens[0], 'A');
const B = new Client(tokens[1], 'B');
const C = new Client(tokens[2], 'C');
await A.connect(roomId);
await B.connect(roomId);
await C.connect(roomId);

for (const c of [B, C, A]) c.send({ t: 'ready' });
const startMsg = await A.waitNew('game_start', 0);
check('开局', startMsg.phase === 'playing');
const round1 = await A.waitNew('draw_round', 0);
check('第 1 回合画家是座位 0（A）', round1.drawerSeat === 0 && round1.round === 1);

// ── 场景 1：画家掉线 → 回合立即结束，轮到下一位在线玩家 ──
const bRoundsBefore = B.all('draw_round').length;
A.close();
const t0 = Date.now();
const round2 = await B.waitNew('draw_round', bRoundsBefore);
const elapsed = Date.now() - t0;
check(`画家掉线后 ${elapsed}ms 内结束当前回合（远小于 90s）`, elapsed < 8000);
check('第 2 回合画家轮到座位 1（B）', round2.drawerSeat === 1 && round2.round === 2);

// ── 场景 2：猜词方全部掉线 → 回合立即结束 ──
const cands = await B.waitNew('draw_candidates', 0);
check('画家 B 收到选词', Array.isArray(cands.words) && cands.words.length === 3);
const bRoundsBefore2 = B.all('draw_round').length;
B.send({ t: 'draw_pick', index: 0 });
const drawPhase = await B.waitNew('draw_round', bRoundsBefore2);
check('进入作画阶段', drawPhase.phase === 'drawing');

const bRoundEndsBefore = B.all('draw_round_end').length;
const bRoundsBefore3 = B.all('draw_round').length;
C.close();
const t1 = Date.now();
const roundEnd = await B.waitNew('draw_round_end', bRoundEndsBefore);
const elapsed2 = Date.now() - t1;
check(`猜词方掉线后 ${elapsed2}ms 内结束回合（远小于 90s）`, elapsed2 < 8000);
check('回合结束原因=猜词玩家掉线', roundEnd.reason === '猜词玩家都掉线了');

// ── 场景 3：唯一在线玩家继续当画家（在线池轮转兜底） ──
const round3 = await B.waitNew('draw_round', bRoundsBefore3);
check('第 3 回合画家仍是 B（仅剩在线玩家）', round3.drawerSeat === 1 && round3.round === 3);

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
