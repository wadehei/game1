// 多人坦克 v1 协议测试：开局快照 / 移动 tick / 开火击毁 / 终局排名（加速 TANK_MATCH_SECONDS=8）
import WebSocket from 'ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BASE = process.env.BASE || 'http://localhost:3002';
const WS_BASE = process.env.WS_BASE || 'ws://localhost:3002/ws';

let pass = 0;
let fail = 0;
const check = (label, cond) => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  return cond;
};

const http = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

class Client {
  constructor(token, name) {
    this.token = token;
    this.name = name;
    this.events = [];
    this.ws = null;
  }
  connect(roomId) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}?token=${this.token}&roomId=${roomId}`);
      const t = setTimeout(() => reject(new Error('连接超时')), 8000);
      this.ws.on('message', (d) => {
        const m = JSON.parse(d.toString());
        this.events.push(m);
        // 快照展开并入 joined 事件（wsServer 单消息发齐）
        if (m.t === 'joined') {
          clearTimeout(t);
          resolve(m);
        }
      });
      this.ws.on('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  }
  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }
  async waitNew(t, baseline, timeout = 8000) {
    const base = baseline ?? this.events.filter((e) => e.t === t).length;
    const start = this.events.filter((e) => e.t === t).length;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const arr = this.events.filter((e) => e.t === t);
      if (arr.length > Math.max(base, start)) return arr[arr.length - 1];
      await sleep(60);
    }
    return null;
  }
}

const tokens = [];
for (const uid of [2, 4]) {
  tokens.push((await http('POST', '/api/user/login/family', { uid })).data.accessToken);
}
const created = await http('POST', '/api/room', { gameType: 'tank' }, tokens[0]);
check('创建坦克房间', created.code === 200 && created.data.gameType === 'tank');
const roomId = created.data.roomId;

const A = new Client(tokens[0], 'A');
const B = new Client(tokens[1], 'B');
await A.connect(roomId);
await B.connect(roomId);
A.send({ t: 'ready' });
B.send({ t: 'ready' });

const start = await A.waitNew('tank_start');
check('开局 tank_start 带障碍与出生点', start && Array.isArray(start.walls) && start.players.length === 2 && start.arena.w === 640);

const tick0 = await A.waitNew('tank_tick');
check('10Hz tick 快照广播', tick0 && Array.isArray(tick0.players) && tick0.players.length === 2 && typeof tick0.remainMs === 'number');

// 移动：A 向右推进 1.5s，位置应明显变化
const px0 = A.events.filter((e) => e.t === 'tank_tick').at(-1).players.find((p) => p.userId === 2).x;
A.send({ t: 'tank_move', dir: 1 });
await sleep(1500);
A.send({ t: 'tank_move', dir: -1 });
const px1 = A.events.filter((e) => e.t === 'tank_tick').at(-1).players.find((p) => p.userId === 2).x;
check('移动意图驱动位置变化（服务器权威）', px1 > px0 + 50);

// 开火：左上角 A（seat0, 朝右）与右上角 B（seat1, 朝左）同 y——A 回到出生点向右开火可直击 B
// 连发直到击毁（HP=3，一发只掉 1）：向对面出生点方向持续开火
const boom = await (async () => {
  for (let i = 0; i < 12; i += 1) {
    A.send({ t: 'tank_fire' });
    await sleep(700);
    const b = A.events.filter((e) => e.t === 'tank_boom').at(-1);
    if (b) return b;
  }
  return null;
})();
check('子弹命中产生击毁事件', boom && typeof boom.killerUserId === 'number' && boom.kills >= 1);
check('被击毁者进入复活等待', boom && boom.respawnMs > 0);

// 终局（TANK_MATCH_SECONDS=8 加速）：等 tank_final + game_over
const final = await A.waitNew('tank_final', 0, 15000);
check('加速终局 tank_final 带排名', final && Array.isArray(final.ranking) && final.ranking.length === 2);
const gameOver = A.events.filter((e) => e.t === 'game_over').at(-1);
check('game_over 广播（积分结算挂点）', gameOver && typeof gameOver.winnerSeat === 'number');

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
