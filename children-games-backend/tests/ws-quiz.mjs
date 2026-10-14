// 答题对战协议测试（需后端在线，默认 http://localhost:3002）
// 覆盖：开局抽题 → 防作弊 → 抢答计分 → 重复/过期作答拒绝 → 重连恢复 → 完整对局排名 → 再来一局换题
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
  constructor(token) {
    this.token = token;
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
  /** 等待某类型事件数量超过基线（拿到"新"事件而非旧事件） */
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

// ── 开始 ──
const tokenA = (await http('POST', '/api/user/login/family', { uid: 2 })).json.data.token;
const tokenB = (await http('POST', '/api/user/login/family', { uid: 4 })).json.data.token;
check('角色 A/B 登录', !!tokenA && !!tokenB);

const created = await http('POST', '/api/room', { gameType: 'quiz' }, tokenA);
check('创建答题房间', created.json?.code === 200 && created.json.data.gameType === 'quiz');
const roomId = created.json.data.roomId;

const A = new Client(tokenA);
let B = new Client(tokenB);
await A.connect(roomId);
const jb = await B.connect(roomId);
check('双方进房', jb.yourSeat === 1);

B.send({ t: 'ready' });
A.send({ t: 'ready' });
const startA = await A.waitNew('game_start', 0, 12000);
check('全员准备后开局', startA.phase === 'playing');

const q1 = await A.waitNew('quiz_question', 0);
check('下发第一题', q1.index === 0 && Array.isArray(q1.options) && q1.options.length === 4);
check('防作弊：题目事件不含答案', !('answer' in q1) && !('correct' in q1));

const qid = q1.qid;
A.send({ t: 'quiz_answer', qid, choice: 0 });
await sleep(300);
B.send({ t: 'quiz_answer', qid, choice: 0 });

A.send({ t: 'quiz_answer', qid, choice: 1 });
await sleep(150);
const dupErr = A.last('error');
check('重复作答被拒', !!dupErr && /已经作答/.test(dupErr.message || ''));

const r1 = await A.waitNew('quiz_result', 0);
check('揭晓含正确答案与分差', typeof r1.answer === 'number' && Array.isArray(r1.delta));
const dA = r1.delta.find((d) => d.userId === 2);
const dB = r1.delta.find((d) => d.userId === 4);
if (r1.answer === 0) {
  check('速度加成：先答者得分不低于后答者', dA.gained >= dB.gained && dA.gained >= 10);
} else {
  check('都答错得 0 分', dA.gained === 0 && dB.gained === 0);
}
check('总分累计正确', dA.total === dA.gained && dB.total === dB.gained);

// 第二题到达后，用旧 qid 作答应被拒
const q2 = await A.waitNew('quiz_question', 1);
A.send({ t: 'quiz_answer', qid: q1.qid, choice: 0 }); // 旧 qid
await sleep(150);
const oldErr = A.last('error');
check('过期 qid 作答被拒', !!oldErr && /题目已切换/.test(oldErr.message || ''));

// 重连：B 断开重连，快照恢复当前题（q2）
B.close();
await sleep(300);
B = new Client(tokenB);
const jb2 = await B.connect(roomId);
const snapQ = jb2.game;
check('重连恢复当前题目', snapQ?.qid === q2.qid && typeof snapQ?.deadline === 'number' && !('answer' in snapQ));

// 两人持续作答直到终局
const finalBaseline = A.all('quiz_final').length;
let final = null;
const finishDeadline = Date.now() + 150000;
while (Date.now() < finishDeadline) {
  const fin = A.last('quiz_final');
  if (fin) {
    final = fin;
    break;
  }
  const lastQ = A.last('quiz_question');
  const lastR = A.last('quiz_result');
  if (lastQ && (!lastR || lastR.qid !== lastQ.qid)) {
    A.send({ t: 'quiz_answer', qid: lastQ.qid, choice: 0 });
    B.send({ t: 'quiz_answer', qid: lastQ.qid, choice: 0 });
  }
  await sleep(200);
}
check('完整对局到终局排名', !!final && Array.isArray(final.ranking) && final.ranking.length === 2);
check('排名按总分降序', final.ranking[0].total >= final.ranking[1].total);

// 再来一局：等一条"新"的 index=0 题目
const qBaseline = A.all('quiz_question').length;
A.send({ t: 'rematch' });
B.send({ t: 'rematch' });
let restartQ = null;
const rDeadline = Date.now() + 20000;
while (Date.now() < rDeadline) {
  const all = A.all('quiz_question');
  if (all.length > qBaseline && all.at(-1).index === 0) {
    restartQ = all.at(-1);
    break;
  }
  await sleep(100);
}
check('再来一局重新出题', !!restartQ && restartQ.qid !== undefined);
A.close();
B.close();

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount > 0 ? 1 : 0);
