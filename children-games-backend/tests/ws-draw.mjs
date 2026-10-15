// 你画我猜协议测试（需后端在线，默认 http://localhost:3002；需 3 个角色）
// 覆盖：画家独占校验 → 笔画转发与重放 → 猜词判定（归一化）→ 猜对防剧透 → skip 扣分 → 重连重放 → 终局排名
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
  close() {
    this.ws?.close();
  }
}

// ── 开始（3 人：uid 2/4/6） ──
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
let C = new Client(tokens[2], 'C');
await A.connect(roomId);
await B.connect(roomId);
await C.connect(roomId);
check('三人进房', true);

for (const c of [B, C, A]) c.send({ t: 'ready' });
const start = await A.waitNew('game_start', 0, 12000);
check('三人准备后开局', start.phase === 'playing');

// 选词阶段：候选词只私发画家
const candidatesA = await A.waitNew('draw_candidates', 0);
check('候选词私发画家（3 个）', Array.isArray(candidatesA.words) && candidatesA.words.length === 3);
check('候选词未泄露给猜词者', !B.last('draw_candidates') && !C.last('draw_candidates'));

// 画家（座位0 = uid2 = A）选词
A.send({ t: 'draw_pick', index: 0 });
const round1 = await A.waitNew('draw_round', 1); // 基线1=选词阶段那条
check('进入作画阶段', round1.phase === 'drawing' && round1.drawerSeat === 0);
const wordMsg = A.last('draw_word');
check('画家私发词', !!wordMsg && wordMsg.word.length > 0);
check('猜词者未收到词', !B.last('draw_word') && !C.last('draw_word'));
const WORD = wordMsg.word;

// 非画家发笔画应被拒
B.send({ t: 'draw_stroke', points: [[0.5, 0.5]], color: '#333', width: 6 });
await sleep(200);
const drawErr = B.last('error');
check('非画家发笔画被拒', !!drawErr && /画家/.test(drawErr.message || ''));

// 画家发两笔（一笔连续两批 + 第二笔），B/C 收到转发
A.send({ t: 'draw_stroke', points: [[0.1, 0.1], [0.2, 0.2]], color: '#333333', width: 6, cont: false });
await sleep(150);
A.send({ t: 'draw_stroke', points: [[0.3, 0.3]], color: '#333333', width: 6, cont: true });
await sleep(300);
const strokesB = B.all('draw_stroke');
check('猜词者收到笔画转发', strokesB.length === 2);

// 重连：C 断开重连，快照带全量笔迹
C.close();
await sleep(300);
const C2 = new Client(tokens[2], 'C');
await C2.connect(roomId);
const snapStrokes = (C2.last('joined') || C2.last('snapshot'))?.game?.strokes;
check('重连者快照含全量笔迹', Array.isArray(snapStrokes) && snapStrokes.length === 2);
C = C2;

// 猜词：B 先猜错（可见），再猜对
// 市面画猜标配：时间过半揭示首字（后端 DRAW_SECONDS=8 时 4s 广播）
const hint = await A.waitNew('draw_hint', 0, 20000);
check('时间过半揭示首字', typeof hint.char === 'string' && hint.char.length === 1);

B.send({ t: 'guess', content: '随便猜的错答案' });
await sleep(200);
const wrongChat = B.all('chat').at(-1);
check('未猜对作为聊天下转', !!wrongChat && wrongChat.content === '随便猜的错答案');

B.send({ t: 'guess', content: `  ${WORD.toUpperCase()}  ` }); // 归一化：空格+大小写
await sleep(200);
const gr = B.last('guess_result');
check('归一化猜对判定', !!gr && gr.correct === true && gr.userId === 4);

// 猜对后 B 再发含词的消息不得广播（防剧透）
B.send({ t: 'guess', content: `答案是${WORD}` });
await sleep(200);
const chatsA = A.all('chat').filter((c) => c.userId === 4);
check('猜对者后续消息不广播', chatsA.length === 1); // 只有最初那条错答案

// C 也猜对 → 全员猜对，回合提前结束
C.send({ t: 'guess', content: WORD });
const roundEnd = await A.waitNew('draw_round_end', 0);
check('全员猜对提前结束回合', roundEnd.word === WORD);
check('回合得分已广播', Array.isArray(roundEnd.scores) && roundEnd.scores.length === 3);

// 画家换了（座位 1 = uid4 = B）
const round2 = await A.waitNew('draw_round', 1);
check('下一回合画家轮换', round2.drawerSeat === 1 && round2.round === 2);

// skip：第2回合进入作画后，画家 B 跳过（扣 2 分）
let r2drawing = null;
const d1 = Date.now() + 15000;
while (Date.now() < d1) {
  const dr = A.all('draw_round').at(-1);
  if (dr && dr.round === 2 && dr.phase === 'drawing') {
    r2drawing = dr;
    break;
  }
  await sleep(200);
}
check('第2回合进入作画', !!r2drawing);
const bScoreBefore = roundEnd.scores.find((s) => s.userId === 4)?.total ?? 0;
B.send({ t: 'draw_skip' });
const roundEnd2 = await A.waitNew('draw_round_end', 1, 15000);
const bScoreAfter = roundEnd2.scores.find((s) => s.userId === 4)?.total ?? 0;
check('跳过扣画家 2 分', bScoreAfter === bScoreBefore - 2);

// 结束剩余回合到终局：每回合等自动选词后，由当前画家主动跳过（快速推进）
const bySeat = { 0: A, 1: B, 2: C };
let finalDraw = null;
const finishDeadline = Date.now() + 120000;
const skipRounds = new Set([2]); // 第2回合已由上方 skip 测试处理
while (Date.now() < finishDeadline) {
  const fin = A.last('draw_final');
  if (fin) {
    finalDraw = fin;
    break;
  }
  const lastRound = A.all('draw_round').at(-1);
  if (lastRound && lastRound.phase === 'drawing' && !skipRounds.has(lastRound.round)) {
    skipRounds.add(lastRound.round);
    bySeat[lastRound.drawerSeat]?.send({ t: 'draw_skip' });
  }
  await sleep(300);
}
check('全部回合完成到终局', !!finalDraw && Array.isArray(finalDraw.ranking));

A.close();
B.close();
C.close();

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount > 0 ? 1 : 0);
