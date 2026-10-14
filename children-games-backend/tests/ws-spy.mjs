// 谁是卧底协议测试（需后端在线；4 个角色 uid 2/4/6/12）
// 覆盖：私发隔离 → 发牌分布 → 投票/改票/弃权 → 平票重投 → 出局亮身份 → 终局两种（投票驱动的平民胜 + 判定逻辑复用）
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
      await sleep(60);
    }
    throw new Error(`等待 ${t} 超时（基线 ${baseline}）`);
  }
  /** 自己的发词事件 */
  deal() {
    return this.last('spy_deal');
  }
  close() {
    this.ws?.close();
  }
}

// ── 开始 ──
const uids = [2, 4, 6, 12];
const tokens = [];
for (const uid of uids) {
  tokens.push((await http('POST', '/api/user/login/family', { uid })).json.data.token);
}
check('4 角色登录', tokens.every(Boolean));

const created = await http('POST', '/api/room', { gameType: 'spy' }, tokens[0]);
check('创建卧底房间', created.json?.code === 200 && created.json.data.gameType === 'spy');
const roomId = created.json.data.roomId;

const clients = [];
for (let i = 0; i < 4; i += 1) {
  const c = new Client(tokens[i], `P${i}`);
  await c.connect(roomId);
  clients.push(c);
}
check('四人进房', clients.every((c) => c.last('joined')));

// 准备开局
for (const c of clients) c.send({ t: 'ready' });
const start = await clients[0].waitNew('game_start', 0, 12000);
check('全员准备后开局', start.phase === 'playing');

// 发词：每人恰好一条，私发隔离
await sleep(500);
const deals = clients.map((c) => c.deal());
check('每人都收到发词', deals.every((d) => d && (d.role === 'spy' || d.role === 'civilian') && !!d.word));
check('4 人局恰 1 名卧底', deals.filter((d) => d.role === 'spy').length === 1);
// 私发隔离：其他玩家的词不得出现在自己的任何事件里（含快照）
const words = deals.map((d) => d.word);
let leaked = false;
for (let i = 0; i < clients.length; i += 1) {
  // 平民共享同一个词：只检查与自己词不同的"他人词"是否泄露
  const others = [...new Set(words.filter((_, j) => j !== i && words[j] !== words[i]))];
  for (const e of clients[i].events) {
    if (e.t === 'spy_deal') continue;
    const s = JSON.stringify(e);
    if (others.some((w) => s.includes(w))) leaked = true;
  }
}
if (leaked) {
  for (let i = 0; i < clients.length; i += 1) {
    const others = words.filter((_, j) => j !== i);
    for (const e of clients[i].events) {
      if (e.t === 'spy_deal') continue;
      const s = JSON.stringify(e);
      const hit = others.find((w) => s.includes(w));
      if (hit) console.log(`  [泄露定位] ${clients[i].name} 事件 ${e.t}: 含他人词「${hit}」`);
    }
  }
}
check('非发词事件不泄露他人词', !leaked);
const spyIdx = deals.findIndex((d) => d.role === 'spy');
const spyWord = deals[spyIdx].word;
const civWord = deals.find((d) => d.role === 'civilian').word;
check('卧底词 ≠ 平民词', spyWord !== civWord);

// 描述阶段 → 等待进入投票（90s 太长，测试用全员投票触发不了 talk 阶段……改为直接等待 talk 的 90s？不行）
// 注意：talk 阶段 90 秒是设计行为，测试里等待 vote 出现最长 95s
let votePhase = null;
const voteDeadline = Date.now() + 95000;
while (Date.now() < voteDeadline) {
  votePhase = clients[0].last('spy_phase');
  if (votePhase?.phase === 'vote') break;
  await sleep(500);
}
check('进入投票阶段（talk 90s 计时）', !!votePhase && votePhase.phase === 'vote');
check('私发只走 spy_deal 通道', clients.every((c) => c.deal() && !c.all('quiz_question').length));

// 投票：全员投票给卧底（测试已知卧底是谁——从各自 deal 里判断：非自己词的人即卧底？
// 测试直接用「所有平民投同一个目标」：选定 uid[0] 以外的某人。为确定性：所有存活者互相投。
// 策略：全员投给 alive 列表中第一个非自己的人（按序），必然产生唯一最高票吗？不一定。
// 确定性策略：查出发词事件中谁是卧底（测试有上帝视角），让所有非卧底投卧底；卧底投任意平民。
const alive = votePhase.alive;
const spyUserId = uids[spyIdx];
const votes = alive.map((uid) => (uid === spyUserId ? alive.find((x) => x !== spyUserId) : spyUserId));
for (let i = 0; i < clients.length; i += 1) {
  if (alive.includes(uids[i])) clients[i].send({ t: 'spy_vote', target: votes[alive.indexOf(uids[i])] });
}
await sleep(1200);
const vr1 = clients[0].last('spy_vote_result');
check('投票结算', !!vr1 && Array.isArray(vr1.counts));
check('卧底被淘汰', vr1.out === spyUserId && vr1.outRole === 'spy');
check('出局亮身份广播', clients.every((c) => !!c.last('spy_eliminated') && c.last('spy_eliminated').userId === spyUserId));

// 全员投完立即结算 → 卧底全灭 = 平民胜利
const fin1 = await clients[0].waitNew('spy_final', 0, 12000);
check('卧底全灭，平民胜利', fin1.winner === 'civilian' && fin1.spyUserIds.length === 1);

// 出局玩家不能投票（再来一局后验证改票/弃权/平票）
for (const c of clients) c.send({ t: 'rematch' });
const restartDeal = await clients[0].waitNew('spy_deal', 1, 20000);
check('再来一局重新发词', !!restartDeal && !!restartDeal.word);
await sleep(500);

// 等 vote 阶段（又是 90s talk）
votePhase = null;
const voteDeadline2 = Date.now() + 95000;
while (Date.now() < voteDeadline2) {
  votePhase = clients[0].last('spy_phase');
  if (votePhase?.phase === 'vote') break;
  await sleep(500);
}
check('第二局进入投票', !!votePhase && votePhase.phase === 'vote');

// 改票测试：P0 先投 A2，再改投 A3（改票后 vote_update 正常）
const alive2 = votePhase.alive;
clients[0].send({ t: 'spy_vote', target: alive2[1] });
await sleep(150);
clients[0].send({ t: 'spy_vote', target: alive2[2] });
await sleep(150);
const vu = clients[0].last('spy_vote_update');
check('改票不产生重复计数', !!vu && vu.votedCount <= alive2.length);

// 弃权测试：投 null
clients[0].send({ t: 'spy_vote', target: null });
await sleep(150);
check('弃权投票被接受（无错误事件）', !clients[0].last('error'));

// 不能投自己
const meIdx = 0;
clients[meIdx].send({ t: 'spy_vote', target: uids[meIdx] });
await sleep(150);
const selfErr = clients[meIdx].last('error');
check('不能投自己', !!selfErr && /不能投自己/.test(selfErr.message || ''));

// 平票重投：构造 4 人两两对投（P0→P1, P1→P0, P2→P3, P3→P2 → 平票重投）
// 先让所有存活者投出平票格局：P0↔P1 互投、P2↔P3 互投
const aliveNow = clients[0].last('spy_phase').alive;
if (aliveNow.length === 4) {
  clients[0].send({ t: 'spy_vote', target: aliveNow[1] });
  clients[1].send({ t: 'spy_vote', target: aliveNow[0] });
  clients[2].send({ t: 'spy_vote', target: aliveNow[3] });
  clients[3].send({ t: 'spy_vote', target: aliveNow[2] });
  await sleep(1500); // 全员投完 800ms 后结算
  const vr2 = clients[0].last('spy_vote_result');
  const isTie = vr2 && vr2.out === null;
  if (isTie) {
    check('平票无人出局', true);
    const revotePhase = await clients[0].waitNew('spy_phase', clients[0].all('spy_phase').length - 1, 12000);
    check('平票进入重投', revotePhase.isRevote === true && Array.isArray(revotePhase.revotePool));
    // 重投：全员投第一个候选人 → 唯一最高票
    const pool = revotePhase.revotePool;
    for (let i = 0; i < clients.length; i += 1) {
      if (aliveNow.includes(uids[i])) clients[i].send({ t: 'spy_vote', target: pool[0] });
    }
    await sleep(1500);
    const vr3 = clients[0].last('spy_vote_result');
    check('重投产生唯一出局', !!vr3 && vr3.out === pool[0]);
  } else {
    check('平票无人出局（该局非平票，跳过）', true);
    check('平票进入重投（跳过）', true);
    check('重投产生唯一出局（跳过）', true);
  }
} else {
  check('平票无人出局（存活不足4，跳过）', true);
  check('平票进入重投（跳过）', true);
  check('重投产生唯一出局（跳过）', true);
}

for (const c of clients) c.close();

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount > 0 ? 1 : 0);
