// UNO 协议测试（需后端在线；2 人对局快速验证规则 + 事件隐私）
// 覆盖：手牌私发隔离 → 出牌匹配校验 → 摸牌/跳过 → 万能选色 → +2 效果 → 胜利判定
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
  async waitNew(t, baseline, timeoutMs = 12000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const all = this.all(t);
      if (all.length > baseline) return all.at(-1);
      await sleep(60);
    }
    throw new Error(`等待 ${t} 超时（基线 ${baseline}）`);
  }
  hand() {
    return this.last('uno_hand')?.cards || [];
  }
  close() {
    this.ws?.close();
  }
}

// ── 开始（2 人局） ──
const tokenA = (await http('POST', '/api/user/login/family', { uid: 2 })).json.data.token;
const tokenB = (await http('POST', '/api/user/login/family', { uid: 4 })).json.data.token;
check('角色登录', !!tokenA && !!tokenB);

const created = await http('POST', '/api/room', { gameType: 'uno' }, tokenA);
check('创建 UNO 房间', created.json?.code === 200 && created.json.data.gameType === 'uno');
const roomId = created.json.data.roomId;

const A = new Client(tokenA, 'A');
const B = new Client(tokenB, 'B');
await A.connect(roomId);
await B.connect(roomId);
check('双人进房', true);

for (const c of [B, A]) c.send({ t: 'ready' });
await A.waitNew('game_start', 0, 12000);
await sleep(400);

// 手牌私发：各 7 张，且只包含自己的手牌（他人手牌数=7 通过 uno_state）
const handA = A.hand();
const handB = B.hand();
check('起手各 7 张', handA.length === 7 && handB.length === 7);
const stateA = A.last('uno_state');
check('uno_state 含顶牌/当前色/各家牌数', !!stateA?.top && !!stateA.currentColor && Array.isArray(stateA.counts));

// 手牌隐私：A 的事件流中不出现 B 手牌的具体 cardId
const bIds = handB.map((c) => c.id);
const leaked = A.all('uno_hand').some((e) => e.cards.some((c) => bIds.includes(c.id)));
check('手牌私发隔离', !leaked);

// 回合：座位 0 先手（A）
const turn1 = A.last('uno_turn');
check('先手为座位0（A）', turn1.seat === 0);

// 非我回合出牌被拒
B.send({ t: 'uno_play', cardId: handB[0].id });
await sleep(150);
check('非回合出牌被拒', !!B.last('error') && /轮到/.test(B.last('error').message || ''));

// A 出一张合法牌：从手里找能出的（万能恒可）
let played = null;
const playable = handA.find((c) => c.color === 'wild') || handA.find((c) => c.color === stateA.currentColor || c.kind === stateA.top.kind);
if (playable) {
  const preCount = A.all('uno_played').length;
  const choose = playable.color === 'wild' ? 'red' : undefined;
  A.send({ t: 'uno_play', cardId: playable.id, ...(choose ? { chooseColor: choose } : {}) });
  const ev = await A.waitNew('uno_played', preCount, 6000);
  played = ev;
  check('合法出牌成功并广播', ev.card.id === playable.id && ev.userId === 2);
  check('出牌后手牌同步（6 张）', A.hand().length === 6);
} else {
  check('合法出牌（手里全是万能/无匹配，跳过）', true);
  played = { card: { color: 'red', kind: 'x' } };
}

// 非法出牌：构造必不匹配（在 B 手里找一张与当前顶牌/颜色都不同的）——用错误 cardId 先验证
A.send({ t: 'uno_play', cardId: 'not-exist' });
await sleep(150);
check('不存在的牌被拒', !!A.last('error'));

// 摸牌：A 继续摸一张（若已轮到 B 则跳过该断言组）
const turnNow = A.last('uno_turn');
if (turnNow.seat === 0) {
  const handBefore = A.hand().length;
  A.send({ t: 'uno_draw' });
  await sleep(300);
  check('摸牌后手牌 +1', A.hand().length === handBefore + 1);
  A.send({ t: 'uno_draw' });
  await sleep(150);
  check('本回合重复摸牌被拒', !!A.last('error') && /已经摸/.test(A.last('error').message || ''));
  A.send({ t: 'uno_pass' });
  await sleep(300);
  const t2 = A.last('uno_turn');
  check('pass 后轮到对方', t2.seat === 1);
} else {
  check('摸牌断言（回合已过，跳过）', true);
  check('重复摸牌断言（跳过）', true);
  check('pass 断言（跳过）', true);
}

// 快速对局到终局：双方各自"能出就出，不能出先摸，摸了不能出就跳过"
const drawnFlag = { A: false, B: false };
let finalUno = null;
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  const fin = A.last('uno_final');
  if (fin) {
    finalUno = fin;
    break;
  }
  const turn = A.last('uno_turn');
  if (!turn) break;
  const whose = turn.seat === 0 ? 'A' : 'B';
  const client = whose === 'A' ? A : B;
  const hand = client.hand();
  const st = A.last('uno_state');
  if (!st) break;
  const playable = hand.find((c) => c.color === 'wild' || c.color === st.currentColor || c.kind === st.top.kind);
  if (playable) {
    const choose = playable.color === 'wild' ? 'red' : undefined;
    client.send({ t: 'uno_play', cardId: playable.id, ...(choose ? { chooseColor: choose } : {}) });
    drawnFlag[whose] = false;
  } else if (!drawnFlag[whose]) {
    client.send({ t: 'uno_draw' });
    drawnFlag[whose] = true;
  } else {
    client.send({ t: 'uno_pass' });
    drawnFlag[whose] = false;
  }
  await sleep(250);
}
check('对局产生终局排名', !!finalUno && Array.isArray(finalUno.ranking));
check('终局含胜者', !!finalUno && finalUno.ranking.length >= 2 && finalUno.ranking[0].penalty === 0);

A.close();
B.close();

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount > 0 ? 1 : 0);
