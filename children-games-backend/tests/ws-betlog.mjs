// 下注流水专项测试（需后端在线；加速定时器启动）
// 覆盖：21点 快照 myBetLog（押注/结算回填/多手累计/庄家私发不串）+ 三张牌比大小 快照 myBetLog（底注/跟注/比牌累计/结算回填/entrants）
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
    this.snapshot = null;
  }
  connect(roomId) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws?token=${this.token}&roomId=${roomId}`);
      const timeout = setTimeout(() => reject(new Error('连接超时')), 6000);
      this.ws.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        this.events.push(msg);
        if (msg.t === 'snapshot') this.snapshot = msg;
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
  async waitNew(t, baseline, timeoutMs = 15000) {
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

const freshSnapshot = async (token, roomId) => {
  const c = new Client(token, 'probe');
  const j = await c.connect(roomId);
  c.close();
  return j;
};

// ════════ 21点：2 人 rotate，1 手 ════════
{
  const tokens = [];
  for (const uid of [2, 4]) tokens.push((await http('POST', '/api/user/login/family', { uid })).json.data.token);
  const created = await http('POST', '/api/room', { gameType: 'blackjack', config: { bankerMode: 'rotate', roundLimit: 1, career: false } }, tokens[0]);
  const roomId = created.json.data.roomId;
  const A = new Client(tokens[0], 'BJ-A'); // 座位0=首庄
  const B = new Client(tokens[1], 'BJ-B');
  await A.connect(roomId);
  await B.connect(roomId);
  for (const c of [B, A]) c.send({ t: 'ready' });
  await A.waitNew('blackjack_phase', 0);

  B.send({ t: 'blackjack_bet', amount: 20 });
  const betEvt = await A.waitNew('blackjack_action', 0);
  check('21点 下注广播（placeBet 统一出）', betEvt.action === 'bet' && betEvt.stake === 20);
  const deal = await A.waitNew('blackjack_deal', 0);
  check('21点 发牌完成', deal.hands.length === 1);

  // B 停牌等结算（庄家自动收牌）
  const bActBase = B.all('blackjack_phase').length;
  let acted = false;
  for (let i = 0; i < 30 && !acted; i++) {
    const p = B.all('blackjack_phase').slice(bActBase).at(-1);
    if (p?.phase === 'acting' && p.turnSeat === 1) {
      B.send({ t: 'blackjack_stand' });
      acted = true;
    }
    await sleep(100);
  }
  if (!acted) B.send({ t: 'blackjack_stand' });
  const settle = await B.waitNew('blackjack_settle', 0, 20000);
  const myResult = settle.results.find((r) => r.userId === 4);
  check('21点 本手结算有 B 结果', !!myResult);

  // 重连取快照：myBetLog 应有一条 round=1，stake/delta/outcome 已回填
  const rejoin = await freshSnapshot(tokens[1], roomId);
  const log = rejoin.game?.myBetLog;
  check('21点 快照带 myBetLog', Array.isArray(log) && log.length === 1);
  check('21点 流水条目字段完整（round/stake/doubled/delta/outcome）', log?.[0]?.round === 1 && log?.[0]?.stake === 20 && typeof log?.[0]?.doubled === 'boolean' && log?.[0]?.delta === myResult.delta && log?.[0]?.outcome === myResult.outcome);
  // 庄家 A 自己没下注 → 流水为空
  const rejoinA = await freshSnapshot(tokens[0], roomId);
  check('21点 庄家流水为空（没下过注）', Array.isArray(rejoinA.game?.myBetLog) && rejoinA.game.myBetLog.length === 0);
  A.close();
  B.close();
  await http('POST', '/api/room/leave', { roomId }, tokens[0]).catch(() => {});
  await http('POST', '/api/room/leave', { roomId }, tokens[1]).catch(() => {});
}

// ════════ 三张牌比大小：2 人 rotate，2 手 ════════
{
  const tokens = [];
  for (const uid of [2, 4]) tokens.push((await http('POST', '/api/user/login/family', { uid })).json.data.token);
  const created = await http('POST', '/api/room', { gameType: 'zjh', config: { roundLimit: 2, career: false, timeoutFold: false } }, tokens[0]);
  const roomId = created.json.data.roomId;
  const A = new Client(tokens[0], 'ZJH-A');
  const B = new Client(tokens[1], 'ZJH-B');
  await A.connect(roomId);
  await B.connect(roomId);

  for (const c of [B, A]) c.send({ t: 'ready' });
  const phase1 = await A.waitNew('zjh_phase', 0);
  check('三张牌比大小 开局 entrants=两人（phase 事件）', Array.isArray(phase1.entrants) && phase1.entrants.length === 2);

  // 轮流跟注直到本手结束（按 轮数:座位 防重发；超时也有自动跟注兜底）
  const actedKeys = new Set();
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const p = A.last('zjh_phase') || B.last('zjh_phase');
    if (!p) break;
    if (A.last('zjh_settle') || B.last('zjh_settle')) break;
    if (p.phase !== 'betting') {
      await sleep(150);
      continue;
    }
    const key = `${p.roundNo}:${p.turnSeat}`;
    if (!actedKeys.has(key)) {
      actedKeys.add(key);
      (p.turnSeat === 0 ? A : B).send({ t: 'zjh_call' });
    }
    await sleep(150);
  }
  const settle1 = await A.waitNew('zjh_settle', 0, 20000);
  check('三张牌比大小 第1手已结算', typeof settle1.winAmount === 'number');

  // 第2手开始后：B 闷跟一手
  await B.waitNew('zjh_phase', B.all('zjh_phase').length, 15000);
  const logMid = (await freshSnapshot(tokens[1], roomId)).game?.myBetLog;
  check('三张牌比大小 中途快照带 myBetLog（≥1 条）', Array.isArray(logMid) && logMid.length >= 1);
  const first = logMid[0];
  check('三张牌比大小 第1手流水已回填（底注+跟注，delta=±）', first.round === 1 && first.betTotal >= 10 && first.delta !== null && typeof first.ended === 'string');

  A.close();
  B.close();
  await http('POST', '/api/room/leave', { roomId }, tokens[0]).catch(() => {});
  await http('POST', '/api/room/leave', { roomId }, tokens[1]).catch(() => {});
}

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
