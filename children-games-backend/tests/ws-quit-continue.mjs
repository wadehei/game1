// 对局中退出续局测试：退出是否终局由各游戏 handler 判定（wsServer.handleLeave 只在返回 ended 时终局）
// 覆盖：21点庄家中途退出=本手作废全员退注续局（已停牌的手不得叠加到重发的一手）
//       三张牌玩家中途退出=视作弃牌续局（存活玩家继续） / 五子棋退出=对方判负（回归保护）
// 需后端在线且带加速变量（BLACKJACK_BET_SECONDS/ACT_SECONDS=3、ZJH_BET_SECONDS=5）
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
      this.ws.on('error', reject);
    });
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  all(t) {
    return this.events.filter((e) => e.t === t);
  }
  last(t) {
    const list = this.all(t);
    return list.length ? list[list.length - 1] : null;
  }
  async waitNew(t, baseline, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const list = this.all(t);
      if (list.length > baseline) return list[list.length - 1];
      await sleep(120);
    }
    throw new Error(`等待 ${t} 超时（基线 ${baseline}）`);
  }
  close() {
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
  }
}

const login = async (uid) => (await http('POST', '/api/user/login/family', { uid })).json.data.token;

// ═══ 场景 1：21点 庄家中途退出 → 续局 + 全员退注 + 重发不叠牌 ═══
{
  const tokens = [];
  for (const uid of [2, 4, 6]) tokens.push(await login(uid));
  const created = await http('POST', '/api/room', { gameType: 'blackjack', config: { bankerMode: 'rotate', roundLimit: 3, career: false } }, tokens[0]);
  const roomId = created.json.data.roomId;
  const A = new Client(tokens[0], 'A庄');
  const B = new Client(tokens[1], 'B');
  const C = new Client(tokens[2], 'C');
  await A.connect(roomId);
  await B.connect(roomId);
  await C.connect(roomId);
  for (const c of [B, C, A]) c.send({ t: 'ready' });
  const start = await A.waitNew('blackjack_phase', 0);
  check('21点开局（庄=座位0）', start.bankerSeat === 0);

  B.send({ t: 'blackjack_bet', amount: 10 });
  C.send({ t: 'blackjack_bet', amount: 10 });
  await A.waitNew('blackjack_deal', 0);
  const bActBase = B.all('blackjack_action').length;
  B.send({ t: 'blackjack_stand' }); // B 停牌 → done 手（若残留将叠加发牌）
  await B.waitNew('blackjack_action', bActBase);
  await sleep(300);
  const chipsBefore = A.last('blackjack_phase')?.chips?.find((c) => c.userId === 4)?.chips ?? -1;

  const goBase = B.all('game_over').length;
  const phaseBase = B.all('blackjack_phase').length;
  A.send({ t: 'leave' }); // 庄家中途退出
  await sleep(1500);
  check('庄家退出后对局继续（无 game_over）', B.all('game_over').length === goBase);
  const reopen = B.all('blackjack_phase').slice(phaseBase).find((e) => e.phase === 'betting');
  check('庄位顺移后重新进入下注阶段（B 接庄）', !!reopen && reopen.bankerSeat === 1);
  const bChips = (reopen?.chips || []).find((c) => c.userId === 4)?.chips ?? -1;
  check('已停牌的 B 注金随本手作废退还（+10）', bChips === chipsBefore + 10);

  // C 重新下注 → 第二次发牌：只有闲家 C，恰好 2 张（B 的旧手不得残留叠加）
  C.send({ t: 'blackjack_bet', amount: 10 });
  const deal2 = await B.waitNew('blackjack_deal', 1);
  const bHand = deal2.hands.find((h) => h.userId === 4);
  const cHand = deal2.hands.find((h) => h.userId === 6);
  check('旧庄家 B 不再持有闲家手牌', !bHand);
  check('重发后 C 恰好 2 张（无叠牌污染）', !!cHand && cHand.cards.length === 2 && deal2.hands.every((h) => h.cards.length === 2));

  // 续局能正常打到结算（只有 C 一个闲家）
  const settleBase = B.all('blackjack_settle').length;
  if (cHand && cHand.cards.length === 2 && !cHand.natural) {
    const cAct2 = C.all('blackjack_action').length;
    C.send({ t: 'blackjack_stand' });
    await C.waitNew('blackjack_action', cAct2);
  }
  const settle = await B.waitNew('blackjack_settle', settleBase);
  check('续局正常结算（仅 C 一家）', Array.isArray(settle.results) && settle.results.length === 1 && settle.results[0].userId === 6);
  A.close();
  B.close();
  C.close();
}

// ═══ 场景 2：三张牌 玩家中途退出 → 视作弃牌续局 ═══
{
  const tokens = [];
  for (const uid of [2, 4, 6]) tokens.push(await login(uid));
  const created = await http('POST', '/api/room', { gameType: 'zjh', config: { roundLimit: 3, career: false, timeoutFold: true } }, tokens[0]);
  const roomId = created.json.data.roomId;
  const A = new Client(tokens[0], 'A');
  const B = new Client(tokens[1], 'B');
  const C = new Client(tokens[2], 'C');
  await A.connect(roomId);
  await B.connect(roomId);
  await C.connect(roomId);
  for (const c of [B, C, A]) c.send({ t: 'ready' });
  const start = await A.waitNew('zjh_phase', 0);
  check('三张牌开局', start.round === 1 && start.aliveCount === 3);

  // B（座位1，庄家下家=当前行动者）退出 → 弃牌，A/C 继续
  const goBase = A.all('game_over').length;
  const phaseBase = A.all('zjh_phase').length;
  B.send({ t: 'leave' });
  await sleep(800);
  check('三张牌一人退出后对局继续（无 game_over）', A.all('game_over').length === goBase);
  const after = A.all('zjh_phase').slice(phaseBase).at(-1);
  check('存活人数=2（退出者视作弃牌）', !!after && after.aliveCount === 2);
  check('轮转到剩余玩家', !!after && (after.turnSeat === 2 || after.turnSeat === 0));

  // A/C 能继续正常行动（A 跟注不报错）
  const turnPhase = after;
  if (turnPhase && turnPhase.turnSeat === 0) {
    A.send({ t: 'zjh_call' });
    const err = A.all('error').at(-1);
    check('剩余玩家可正常跟注', !err || typeof err.message !== 'string');
  }
  A.close();
  B.close();
  C.close();
}

// ═══ 场景 3：五子棋 退出=对方判负（回归保护） ═══
{
  const tokens = [];
  for (const uid of [2, 4]) tokens.push(await login(uid));
  const created = await http('POST', '/api/room', { gameType: 'gomoku' }, tokens[0]);
  const roomId = created.json.data.roomId;
  const A = new Client(tokens[0], 'A');
  const B = new Client(tokens[1], 'B');
  await A.connect(roomId);
  await B.connect(roomId);
  for (const c of [B, A]) c.send({ t: 'ready' });
  await A.waitNew('game_start', 0);
  A.send({ t: 'leave' });
  const over = await B.waitNew('game_over', 0);
  check('五子棋退出=对方获胜终局', over.winnerSeat === 1 && over.reason === '对方退出了对局');
  A.close();
  B.close();
}

console.log(`\n合计：${pass} 通过，${failCount} 失败`);
process.exit(failCount ? 1 : 0);
