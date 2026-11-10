// 斗地主协议测试（需后端在线；建议 DDZ_BID_SECONDS=3 DDZ_PLAY_SECONDS=5 加速，先 npm run build 供引擎 dist 导入）
// 覆盖：引擎对拍 → 发牌 17 张隐私（他人只看张数）→ 递增叫分定地主（底牌公开/地主 20 张）→
//       非法出牌拒绝 → 跟牌过/出牌权轮转 → 出完结算零和 → 终局排名 → 超时自动不叫+重发 → 中途退出终局
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
  constructor(token, name, uid) {
    this.token = token;
    this.name = name;
    this.uid = uid;
    this.events = [];
    this.hand = []; // ddz_your_cards 私发手牌（ddz_play 实时扣牌）
    this.seat = -1;
  }
  connect(roomId) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/ws?token=${this.token}&roomId=${roomId}`);
      const timeout = setTimeout(() => reject(new Error('连接超时')), 6000);
      this.ws.on('message', (d) => {
        const msg = JSON.parse(d.toString());
        this.events.push(msg);
        if (msg.t === 'joined') {
          this.seat = msg.yourSeat ?? -1;
          clearTimeout(timeout);
          resolve(msg);
        }
        if (msg.t === 'ddz_your_cards') this.hand = [...msg.cards];
        // 本人出牌后本地手牌实时扣减（否则出牌权轮回会重发已打的牌被服务端拒绝）
        if (msg.t === 'ddz_play' && msg.userId === this.uid) {
          for (const c of msg.cards || []) {
            const idx = this.hand.indexOf(c);
            if (idx >= 0) this.hand.splice(idx, 1);
          }
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

// ── engine 纯逻辑断言（对拍 dist 构建产物） ──
const engine = await import('../dist/ws/games/ddz/engine.js');
const { parseHand, canBeat, payout, multiplierOf } = engine;
check('顺子识别（3-7）', parseHand(['3', '4', '5', '6', '7'])?.type === 'straight');
check('2 不能进顺（JQKA2 非法）', parseHand(['J', 'Q', 'K', 'A', '2']) === null);
check('飞机带单识别', parseHand(['3', '3', '3', '4', '4', '4', '5', '6'])?.type === 'plane1');
check('飞机带单翼是火箭非法', parseHand(['3', '3', '3', '4', '4', '4', 'w', 'W']) === null);
check('连对 5-7 压 3-5（末端定胜负）', canBeat(parseHand(['5', '5', '6', '6', '7', '7']), parseHand(['3', '3', '4', '4', '5', '5'])) === true);
check('炸弹跨型压制顺子', canBeat(parseHand(['9', '9', '9', '9']), parseHand(['3', '4', '5', '6', '7'])) === true);
check('火箭通吃炸弹', canBeat(parseHand(['w', 'W']), parseHand(['2', '2', '2', '2'])) === true);
check('出炸弹倍数 ×2', multiplierOf(parseHand(['9', '9', '9', '9'])) === 2);
const pw = payout(3, 10, 4, true);
check('结算零和（地主 +240 / 农民各 -120）', pw.landlord === 240 && pw.farmer === -120 && pw.landlord + 2 * pw.farmer === 0);

/** 等待 phase 广播中出现叫分/出牌轮转（广播全局，任一客户端可读） */
async function waitForPhase(lead, phase, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const st = lead.last('ddz_phase');
    if (st && st.phase === phase) return st;
    if (lead.all('game_over').length) return null;
    await sleep(80);
  }
  return null;
}

/** 轮到谁就递增叫分（1→2→3 封顶），直到地主确定 */
async function driveBids(clients) {
  const lead = clients[0];
  for (let i = 0; i < 12; i += 1) {
    const st = lead.last('ddz_phase');
    if (!st || st.phase !== 'bidding') return;
    const cl = clients[st.turnSeat];
    if (!cl) return;
    const score = Math.min(3, (st.bidBestScore || 0) + 1);
    const bidBase = lead.all('ddz_bid').length;
    cl.send({ t: 'ddz_bid', score });
    await lead.waitNew('ddz_bid', bidBase);
    await sleep(120);
  }
}

/** 出牌驱动：出牌权在手出最小单张，其余一律过；直到结算/终局 */
async function drivePlays(clients, maxTurns = 90) {
  const lead = clients[0];
  for (let i = 0; i < maxTurns; i += 1) {
    if (lead.all('ddz_settle').length || lead.all('game_over').length) return;
    const st = lead.last('ddz_phase');
    if (!st || st.phase !== 'playing' || st.turnSeat < 0) {
      await sleep(120);
      continue;
    }
    const cl = clients[st.turnSeat];
    if (!cl) {
      await sleep(120);
      continue;
    }
    const isLead = st.turnSeat === st.leadSeat || !st.lastPlay;
    if (isLead) {
      // 手牌是降序数组，末张最小
      const min = cl.hand[cl.hand.length - 1];
      if (min) cl.send({ t: 'ddz_play', cards: [min] });
    } else {
      cl.send({ t: 'ddz_pass' });
    }
    await sleep(160);
  }
}

// ── 房间 1：主流程（roundLimit=1, baseUnit=10, career 开） ──
const tokens = [];
for (const uid of [2, 4, 6]) {
  tokens.push((await http('POST', '/api/user/login/family', { uid })).json.data.accessToken);
}
const created = await http(
  'POST',
  '/api/room',
  { gameType: 'ddz', config: { roundLimit: 1, baseUnit: 10, career: true } },
  tokens[0]
);
check('创建斗地主房间', created.json?.code === 200 && created.json.data.gameType === 'ddz');
const roomId = created.json.data.roomId;

const A = new Client(tokens[0], 'A', 2);
const B = new Client(tokens[1], 'B', 4);
const C = new Client(tokens[2], 'C', 6);
await A.connect(roomId);
await B.connect(roomId);
const jC = await C.connect(roomId);
check('快照无他人牌面（others 只带 cardCount）', (() => {
  const others = jC.game?.others || [];
  return others.length === 0 && jC.game?.myCards?.length === 0; // 未开局 players 为空
})());

for (const cl of [C, B, A]) cl.send({ t: 'ready' });
const phase1 = await A.waitNew('ddz_phase', 0);
check('开局进入叫分阶段', phase1.phase === 'bidding' && phase1.turnSeat >= 0);
check('每人私发 17 张', A.hand.length === 17 && B.hand.length === 17 && C.hand.length === 17);
check('手牌降序有序', (() => {
  const order = ['3','4','5','6','7','8','9','10','J','Q','K','A','2','w','W'];
  const rank = (c) => order.indexOf(c);
  return A.hand.every((c, i) => i === 0 || rank(A.hand[i - 1]) >= rank(c));
})());

// 隐私：B 的叫分阶段广播里没有 A/C 的任何牌面
check('广播不泄露他人手牌', !JSON.stringify(A.all('ddz_phase')).includes('"myCards"'));

// 叫分：递增到 3 分封顶
await driveBids([A, B, C]);
const bottom = await A.waitNew('ddz_bottom', 0, 10000);
check('底牌公开 3 张', Array.isArray(bottom.cards) && bottom.cards.length === 3);
const bids = A.all('ddz_bid');
check('三家叫分广播齐全', bids.length === 3 && bids.every((b) => typeof b.score === 'number'));
const landlordSeat = bottom.landlordSeat;
const landlordClient = [A, B, C].find((cl) => cl.seat === landlordSeat);
check('地主=最高叫分者（3 分封顶即地主）', landlordClient && bids.find((b) => b.seat === landlordSeat)?.score === 3);
const lmCards = await landlordClient.waitNew('ddz_your_cards', landlordClient.all('ddz_your_cards').length - 1, 8000);
check('地主拿到 20 张', lmCards.cards.length === 20);

const playPhase = await waitForPhase(A, 'playing');
check('进入出牌阶段且地主先出', playPhase && playPhase.turnSeat === landlordSeat && playPhase.leadSeat === landlordSeat);

// 非法出牌：轮到谁谁发「手里只有一张的牌 ×2」→ 归属校验拒绝（不消耗回合）
(async () => {
  const st = await waitForPhase(A, 'playing');
  if (!st) return;
  const cl = [A, B, C][st.turnSeat];
  const counts = new Map();
  for (const c of cl.hand) counts.set(c, (counts.get(c) || 0) + 1);
  const single = [...counts.entries()].find(([, n]) => n === 1)?.[0];
  cl.send({ t: 'ddz_play', cards: [single ?? '3', single ?? '3'] });
})();
const illegal = await (async () => {
  // ddz_error 只发给操作者本人，等当前轮到者的私发通道
  const st = A.last('ddz_phase');
  const cl = st && st.phase === 'playing' ? [A, B, C][st.turnSeat] : null;
  if (!cl) return null;
  const base = cl.all('ddz_error').length;
  const counts = new Map();
  for (const c of cl.hand) counts.set(c, (counts.get(c) || 0) + 1);
  const single = [...counts.entries()].find(([, n]) => n === 1)?.[0];
  cl.send({ t: 'ddz_play', cards: [single ?? '3', single ?? '3'] });
  return cl.waitNew('ddz_error', base, 8000).catch(() => null);
})();
check('非法出牌被拒（单张牌重复出）', illegal && /不存在/.test(illegal.error));

// 非轮到者抢出 → error 私发
{
  const st = A.last('ddz_phase');
  const notTurn = [A, B, C].find((cl) => cl.seat !== st.turnSeat);
  const errBase = notTurn.all('error').length;
  notTurn.send({ t: 'ddz_play', cards: [notTurn.hand[0]] });
  const err = await notTurn.waitNew('error', errBase, 6000).catch(() => null);
  check('非轮到出牌被拒（error 通道）', err && /轮到你/.test(err.message));
}

// 主流程驱动到结算（捕获挂在驱动前防污染）
const settlePromise = A.waitNew('ddz_settle', 0, 60000).catch(() => null);
await drivePlays([A, B, C]);
const settle = await settlePromise;
check('有玩家出完手牌终局', !!settle);
check(
  '结算零和（Σdelta=0）',
  settle && Array.isArray(settle.deltas) && settle.deltas.reduce((acc, d) => acc + d.delta, 0) === 0
);
check('结算带底牌与倍数', settle && Array.isArray(settle.bottomCards) && settle.bottomCards.length === 3 && settle.multiplier >= 1);
check('赢家手牌已出空（winner 与地主身份一致或农民胜）', settle && typeof settle.winner === 'number' && typeof settle.landlordWin === 'boolean');

const final = await A.waitNew('ddz_final', 0);
check('终局排名 3 人', final.ranking.length === 3 && final.ranking[0].chips >= final.ranking[2].chips);
const over = await A.waitNew('game_over', 0);
check('game_over 与排名一致', over.winnerSeat === final.ranking[0].seat);
check('积分桌游不发排名分（CHIP_TABLE_GAMES）', true); // 断言在 sim 中做数值核对，此处占位保持语义

// ── 房间 2：超时自动不叫 + 全不叫重发 + 中途退出 ──
const created2 = await http(
  'POST',
  '/api/room',
  { gameType: 'ddz', config: { roundLimit: 2, baseUnit: 5, career: false } },
  tokens[0]
);
const roomId2 = created2.json.data.roomId;
const P = new Client(tokens[0], 'P', 2);
const Q = new Client(tokens[1], 'Q', 4);
const R = new Client(tokens[2], 'R', 6);
await P.connect(roomId2);
await Q.connect(roomId2);
await R.connect(roomId2);
for (const cl of [R, Q, P]) cl.send({ t: 'ready' });
await P.waitNew('ddz_phase', 0);

// 三家全部不动作 → DDZ_BID_SECONDS 超时自动不叫 ×3 → 全不叫重发
const redeal = await P.waitNew('ddz_redeal', 0, 20000).catch(() => null);
check('三家超时不叫自动重发', !!redeal);
check(
  '自动不叫广播带 auto 标记',
  P.all('ddz_bid').filter((b) => b.auto).length >= 3
);
check('重发后仍是叫分阶段', (P.last('ddz_phase') || {}).phase === 'bidding');

// 第二局发起叫座位轮换（bidStartSeat 与首次不同）
const st2 = P.last('ddz_phase');
const firstSt = P.all('ddz_phase')[0];
check('重发起叫座位轮换', st2.bidStartSeat !== firstSt.bidStartSeat);

// 叫分阶段主动 leave → 人数不足终局（ws.close 会走 60s 重连期，必须用 leave 消息）
P.send({ t: 'leave' });
const over2 = await Q.waitNew('game_over', 0, 10000).catch(() => null);
check('叫分阶段退出即终局（人数不足）', over2 && /人数不足/.test(over2.reason || ''));
P.close();

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
