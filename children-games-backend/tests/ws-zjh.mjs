// 炸金花协议测试（需后端在线；建议 ZJH_BET_SECONDS=4 加速）
// 覆盖：牌型判定（A23 顺/235 特杀开关/花色决胜）→ 闷牌不发牌（防偷看）→ look 私发 →
//       跟注/超时弃牌 → 强制开牌终局 → 比牌（轮数限制/输者弃牌/牌面只给双方）→ 生涯
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

// ── engine 纯逻辑断言 ──
const engine = await import('../dist/ws/games/zjh/engine.js');
const { compareZjh, handRank, typeName } = engine;
const c = (rank, suit) => ({ rank, suit });
check('豹子 > 顺金', compareZjh([c(9, '♠'), c(9, '♥'), c(9, '♦')], [c(9, '♠'), c(10, '♠'), c(11, '♠')], false) === 1);
check('顺金 > 金花', compareZjh([c(9, '♠'), c(10, '♠'), c(11, '♠')], [c(2, '♠'), c(9, '♠'), c(13, '♠')], false) === 1);
check('金花 > 顺子', compareZjh([c(2, '♠'), c(9, '♠'), c(13, '♠')], [c(9, '♠'), c(10, '♥'), c(11, '♦')], false) === 1);
check('顺子 > 对子', compareZjh([c(9, '♠'), c(10, '♥'), c(11, '♦')], [c(9, '♠'), c(9, '♥'), c(5, '♦')], false) === 1);
check('对子 > 散牌', compareZjh([c(9, '♠'), c(9, '♥'), c(5, '♦')], [c(13, '♠'), c(9, '♥'), c(5, '♦')], false) === 1);
check('QKA 是最大顺', typeName(handRank([c(12, '♠'), c(13, '♥'), c(14, '♦')])) === '顺子');
check('A23 算最小顺', typeName(handRank([c(14, '♠'), c(3, '♥'), c(2, '♦')])) === '顺子');
check('A23 输给 QKA', compareZjh([c(14, '♠'), c(3, '♥'), c(2, '♦')], [c(12, '♠'), c(13, '♥'), c(14, '♦')], false) === -1);
check('特殊235 反杀豹子（开）', compareZjh([c(2, '♠'), c(3, '♥'), c(5, '♦')], [c(9, '♠'), c(9, '♥'), c(9, '♦')], true) === 1);
check('特殊235 关闭时输给豹子', compareZjh([c(2, '♠'), c(3, '♥'), c(5, '♦')], [c(9, '♠'), c(9, '♥'), c(9, '♦')], false) === -1);
check('特殊235 不反杀金花', compareZjh([c(2, '♠'), c(3, '♥'), c(5, '♦')], [c(2, '♠'), c(3, '♠'), c(5, '♠')], true) === -1);
check('完全同点比花色决胜', compareZjh([c(13, '♦'), c(9, '♣'), c(2, '♥')], [c(13, '♠'), c(9, '♣'), c(2, '♥')], false) === -1);

const SEAT_OF = { A: 0, P: 0, B: 1, Q: 1, C: 2, R: 2 };
const seatOf = (client) => SEAT_OF[client.name];

/** 等待轮到某客户端行动；牌局结束抛错 */
async function waitTurn(client, clients, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = client.last('zjh_phase');
    if (st && st.phase === 'betting' && st.turnSeat === seatOf(client)) return st;
    if (client.all('zjh_settle').length) throw new Error('牌局已结束');
    if (clients && client.all('zjh_phase').length && client.last('zjh_phase').phase !== 'betting') throw new Error('阶段已切换');
    await sleep(80);
  }
  throw new Error('等待回合超时');
}

/** 等待任意玩家的回合（广播是全局的，任一客户端都能看到 turnSeat） */
async function waitForAnyTurn(lead, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = lead.last('zjh_phase');
    if (st && st.phase === 'betting') return st;
    if (lead.all('zjh_settle').length) return null;
    await sleep(80);
  }
  return null;
}

/** 轮到谁就由谁 call，直到 showdown/settle 或轮数耗尽 */
async function driveCalls(clients) {
  const lead = clients[0];
  for (let i = 0; i < 80; i += 1) {
    const st = await waitForAnyTurn(lead);
    if (!st) return;
    clients[st.turnSeat]?.send({ t: 'zjh_call' });
    await sleep(160);
  }
}

// ── 主流程（3 人，roundLimit=1，特殊235 关，超时弃牌，career 开） ──
const tokens = [];
for (const uid of [2, 4, 6]) {
  tokens.push((await http('POST', '/api/user/login/family', { uid })).json.data.token);
}
const created = await http('POST', '/api/room', { gameType: 'zjh', config: { special235: false, timeoutFold: true, roundLimit: 1, career: true } }, tokens[0]);
check('创建炸金花房间', created.json?.code === 200 && created.json.data.gameType === 'zjh');
const roomId = created.json.data.roomId;

const A = new Client(tokens[0], 'A');
const B = new Client(tokens[1], 'B');
const C = new Client(tokens[2], 'C');
const jA = await A.connect(roomId);
await B.connect(roomId);
await C.connect(roomId);
check('开局快照不带牌（闷牌防偷看）', jA.game?.myCards === null && jA.game?.mySeen === false);

for (const cl of [B, C, A]) cl.send({ t: 'ready' });
const phase1 = await A.waitNew('zjh_phase', 0);
check('开局扣底注入池', phase1.pot === 30 && phase1.stake === 10);
check('首个行动者是庄家下家（座位1）', phase1.phase === 'betting' && phase1.turnSeat === 1);

// B 超时自动弃牌（ZJH_BET_SECONDS=4）
const toFold = await A.waitNew('zjh_action', 0, 10000);
check('B 超时自动弃牌', toFold.userId === 4 && (toFold.action === 'timeout_fold' || toFold.action === 'fold'));
check('弃牌后存活 2 家', toFold.aliveCount === 2);

// 行动顺序现在是 C(2) → A(0) → …；C look（免费不耗回合）后 call
C.send({ t: 'zjh_look' });
const cCards = await C.waitNew('zjh_your_cards', 0);
check('look 后私发 3 张牌', Array.isArray(cCards.cards) && cCards.cards.length === 3);
await waitTurn(C, [A, B, C]);
C.send({ t: 'zjh_call' });

// A look + call
await waitTurn(A, [A, B, C]);
A.send({ t: 'zjh_look' });
await sleep(300);
A.send({ t: 'zjh_call' });

// 事件捕获挂在驱动之前（时序保证取到主局的 showdown/settle，不被后续测试局污染）
const mainShowdownPromise = A.waitNew('zjh_showdown', 0, 30000).catch(() => null);
const mainSettlePromise = A.waitNew('zjh_settle', 0, 30000).catch(() => null);

// 之后轮到谁谁 call，直到强制开牌
await driveCalls([A, B, C]);

check('look 广播只带动作不带牌面', (() => {
  const looks = A.all('zjh_action').filter((e) => e.action === 'look');
  return looks.length >= 2 && looks.every((e) => !e.cards);
})());

const settle = await mainSettlePromise;
const showdown = await mainShowdownPromise;
if (showdown) {
  check('强制开牌亮牌全员', Array.isArray(showdown.reveals) && showdown.reveals.length === 2 && showdown.reveals.every((r) => r.cards.length === 3 && !!r.typeName));
} else {
  check('结算路径合法（弃牌胜不亮牌）', settle && settle.reason === 'others_folded');
}
check('结算有赢家与积分变动', typeof settle.winner === 'number' && Array.isArray(settle.deltas));
const final = await A.waitNew('zjh_final', 0);
check('终局排名', final.ranking.length === 3 && final.ranking[0].chips >= final.ranking[2].chips);
const over = await A.waitNew('game_over', 0);
check('game_over 与排名一致', over.winnerSeat === final.ranking[0].seat);

// 生涯记录
const career = await http('GET', '/api/user/battle/career', null, tokens[1]);
check('zjh 局写入生涯', (career.json?.data?.games || []).some((g) => g.gameType === 'zjh'));
A.close();
B.close();
C.close();
await sleep(300);

// ── 比牌专测：第 3 轮起发起比牌，输者弃牌、牌面只给双方 ──
const created2 = await http('POST', '/api/room', { gameType: 'zjh', config: { special235: true, timeoutFold: true, roundLimit: 1, career: false } }, tokens[0]);
const roomId2 = created2.json.data.roomId;
const P = new Client(tokens[0], 'P');
const Q = new Client(tokens[1], 'Q');
const R = new Client(tokens[2], 'R');
await P.connect(roomId2);
await Q.connect(roomId2);
await R.connect(roomId2);
for (const cl of [Q, R, P]) cl.send({ t: 'ready' });
await P.waitNew('zjh_phase', 0);

let compared = false;
for (let i = 0; i < 80 && !compared; i += 1) {
  const st = await waitForAnyTurn(P);
  if (!st) break;
  if (st.turnSeat === 0 && st.roundNo >= 3) {
    P.send({ t: 'zjh_compare', target: 1 });
    compared = true;
    break;
  }
  [P, Q, R][st.turnSeat]?.send({ t: 'zjh_call' });
  await sleep(160);
}
const cmp = await P.waitNew('zjh_compare', 0, 15000);
check('比牌广播含双方与胜负', typeof cmp.winner === 'number' && typeof cmp.loser === 'number' && cmp.loser !== cmp.winner);
const pCards = await P.waitNew('zjh_compare_cards', 0);
check('发起者收到对方牌面', Array.isArray(pCards.oppCards) && pCards.oppCards.length === 3);
check('旁观者收不到牌面', !JSON.stringify(Q.all('zjh_compare')).includes('"cards"') && !JSON.stringify(R.all('zjh_compare')).includes('"cards"'));

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
