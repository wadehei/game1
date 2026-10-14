// 对战房间 WS 协议全流程测试（需后端在线，默认 http://localhost:3002）
// 覆盖：建房 → 双人加入 → 准备开局 → 落子/判负 → 聊天/表情/快捷用语 → 语音上传拉取 → 再来一局换色 → 认输 → 解散清场
import WebSocket from 'ws';

const BASE = process.env.BASE || 'http://localhost:3002';
let pass = 0;
let failCount = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  cond ? pass++ : failCount++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const http = async (method, path, body, token, raw = false) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': raw ? 'audio/webm' : 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  try {
    return { status: res.status, json: JSON.parse(buf.toString()), buf };
  } catch {
    return { status: res.status, json: null, buf };
  }
};

class Client {
  constructor(name, token) {
    this.name = name;
    this.token = token;
    this.events = [];
    this.ws = null;
  }
  connect(roomId) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:3002/ws?token=${this.token}&roomId=${roomId}`);
      const timeout = setTimeout(() => reject(new Error('连接超时')), 5000);
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
  async waitFor(t, timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.events.find((e) => e.t === t);
      if (found) return found;
      await sleep(50);
    }
    throw new Error(`等待 ${t} 超时`);
  }
  last(t) {
    return [...this.events].reverse().find((e) => e.t === t);
  }
  close() {
    this.ws?.close();
  }
}

// ── 开始 ──
const loginA = await http('POST', '/api/user/login/family', { uid: 2 });
const loginB = await http('POST', '/api/user/login/family', { uid: 4 });
check('角色 A/B 登录', loginA.json?.code === 200 && loginB.json?.code === 200);
const tokenA = loginA.json.data.token;
const tokenB = loginB.json.data.token;

const created = await http('POST', '/api/room', { gameType: 'gomoku' }, tokenA);
check('A 创建房间', created.json?.code === 200 && /^\d{4}$/.test(created.json.data.roomId));
const roomId = created.json.data.roomId;

const A = new Client('A', tokenA);
const B = new Client('B', tokenB);
const joinedA = await A.connect(roomId);
check('A 进房，执黑（座位0）', joinedA.yourSeat === 0 && joinedA.phase === 'waiting');
const joinedB = await B.connect(roomId);
check('B 进房，执白（座位1）', joinedB.yourSeat === 1);
check('A 收到 B 进房通知', await A.waitFor('member_update').then(() => true));

// 准备开局
B.send({ t: 'ready' });
await A.waitFor('member_update');
A.send({ t: 'ready' });
const startA = await A.waitFor('game_start');
const startB = await B.waitFor('game_start');
check('双方准备后开局', startA.t === 'game_start' && startB.t === 'game_start');

// 落子：A 先手。B 抢先落子应报错
B.send({ t: 'move', x: 0, y: 0 });
const errB = await B.waitFor('error');
check('白棋先落子被拒', !!errB.message);

// A 连下五子获胜（第5手 (7,7) 在下面补）
const moves = [
  ['A', 5, 7], ['B', 5, 8],
  ['A', 6, 7], ['B', 6, 8],
  ['A', 8, 7], ['B', 8, 8],
  ['A', 9, 7], ['B', 9, 8],
];
for (const [who, x, y] of moves) {
  (who === 'A' ? A : B).send({ t: 'move', x, y });
  await sleep(80);
}
A.send({ t: 'move', x: 7, y: 7 });
const overA = await A.waitFor('game_over');
check('A 五连获胜', overA.winnerSeat === 0 && overA.reason === '五连成线');
const overB = await B.waitFor('game_over');
check('B 同步收到胜负', overB.winnerSeat === 0);
await sleep(100);
const moveA = A.last('move');
check('胜局连线已标记', (moveA.winLine || []).length === 5 && moveA.winner === 1);

// 聊天：文字/表情/快捷用语
A.send({ t: 'chat', kind: 'text', content: '下得不错！' });
await sleep(350); // 服务端 300ms 限流（防刷屏），按人类手速发送
A.send({ t: 'chat', kind: 'emoji', content: '😎' });
await sleep(350);
A.send({ t: 'chat', kind: 'quick', content: '快点吧，我等到花儿都谢了～' });
await sleep(200);
await sleep(200);
const bChatText = B.events.filter((e) => e.t === 'chat');
check('B 收到 3 条聊天', bChatText.length === 3 && bChatText[0].content === '下得不错！');
check('聊天带昵称与类型', bChatText[0].nickname && bChatText[1].kind === 'emoji' && bChatText[2].kind === 'quick');

// 语音：A 上传，双方可拉取
const fakeAudio = Buffer.from('fake-voice-bytes-for-test');
const up = await http('POST', `/api/room/${roomId}/voice?duration=3`, fakeAudio, tokenA, true);
check('A 上传语音', up.json?.code === 200 && !!up.json.data.voiceId);
const voiceMsgA = await A.waitFor('voice');
const voiceMsgB = await B.waitFor('voice');
check('双方收到语音广播', voiceMsgA.voiceId === up.json.data.voiceId && voiceMsgB.duration === 3);
const downA = await http('GET', `/api/room/${roomId}/voice/${up.json.data.voiceId}`, null, tokenB);
check('B 拉取语音字节一致', downA.buf.equals(fakeAudio));
// 不在房间里的人不能拉取
const outsider = await http('POST', '/api/user/login/family', { uid: 6 });
const noAuth = await http('GET', `/api/room/${roomId}/voice/${up.json.data.voiceId}`, null, outsider.json.data.token);
check('房间外人拉取语音被拒', noAuth.status === 403);

// 再来一局：双方表决 → 重开并交换颜色
A.send({ t: 'rematch' });
await A.waitFor('rematch_vote');
B.send({ t: 'rematch' });
const restartA = await A.waitFor('game_restart');
check('双方表决后重开', restartA.t === 'game_restart');
await sleep(100);
const seatA = A.last('snapshot').members.find((m) => m.userId === 2)?.seat;
const seatB = B.last('snapshot').members.find((m) => m.userId === 4)?.seat;
check('重开后交换黑白', seatA === 1 && seatB === 0);

// 认输：A 认输，B 胜
A.send({ t: 'resign' });
await sleep(150);
const resignOver = B.last('game_over');
check('A 认输，B 胜', resignOver.winnerSeat === 0 && resignOver.reason === '对方认输');

// 解散：只有房主能解散，聊天语音随房间销毁
B.send({ t: 'disband' });
const errNotHost = await B.waitFor('error');
check('非房主解散被拒', !!errNotHost.message);
A.send({ t: 'disband' });
const closedA = await A.waitFor('closed');
const closedB = await B.waitFor('closed');
check('房主解散，全员收到通知', !!closedA.reason && !!closedB.reason);
const gone = await http('POST', '/api/user/login/family', { uid: 3 });
const rejoin = await http('POST', '/api/room', { gameType: 'gomoku' }, gone.json.data.token);
check('解散后原房间码失效（新建房间码不同或旧码不存在）', rejoin.json.data.roomId !== roomId);

A.close();
B.close();

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount > 0 ? 1 : 0);
