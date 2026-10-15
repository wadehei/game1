// 浏览器实测陪玩脚本：Node 玩家配合浏览器里的真人玩家开房对战
// 用法：node tests/helpers/copilot.mjs draw <roomId>   （uid 4/6 两名猜词者）
//       node tests/helpers/copilot.mjs spy  <roomId>   （uid 4/6/12 三名投票者）
// 行为：自动 join+ready；draw 模式轮询 /tmp/copilot-guess.txt（内容=当前要猜的词，浏览器端画家可见后写入）
//       spy 模式投票阶段自动投第一个非自己的存活玩家（重投时投候选人池内）；事件全部打到 stdout 供断言
import WebSocket from 'ws';

const [, , mode, roomId] = process.argv;
if (!mode || !roomId) {
  console.error('用法: node copilot.mjs draw|spy <roomId>');
  process.exit(1);
}
const BASE = 'http://localhost:3002';
const UIDS = mode === 'spy' ? [4, 6, 12] : [4, 6];

const login = async (uid) => {
  const res = await fetch(`${BASE}/api/user/login/family`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid }),
  }).then((r) => r.json());
  return res.data.token;
};

const fs = await import('fs');
const path = await import('path');
// Windows node 下 /tmp 不可靠（解析为当前盘符 \tmp），猜词文件放项目目录
const GUESS_FILE = path.join(process.cwd(), '.copilot-guess.tmp');
let lastGuessFileMtime = 0;
let lastGuessedWord = '';

class Client {
  constructor(token, uid, name) {
    this.uid = uid;
    this.name = name;
    this.events = [];
    this.ws = new WebSocket(`ws://localhost:3002/ws?token=${token}&roomId=${roomId}`);
    this.ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      this.events.push(msg);
      if (msg.t === 'joined') {
        this.snapshot = msg;
        this.ws.send(JSON.stringify({ t: 'ready' }));
        if (msg.phase === 'ended') setTimeout(() => this.ws.send(JSON.stringify({ t: 'rematch' })), 1500);
      }
      if (msg.t === 'game_start' || msg.t === 'game_restart') this.ws.send(JSON.stringify({ t: 'ready' }));
      if (msg.t === 'game_over') {
        // 自动同意再来一局（浏览器实测快速重开）
        setTimeout(() => this.ws.send(JSON.stringify({ t: 'rematch' })), 1000);
      }
      if (msg.t === 'draw_candidates' && mode === 'draw') {
        // 画家立即选第一个词（不等 10s 超时随机选），词随日志可见
        setTimeout(() => this.ws.send(JSON.stringify({ t: 'draw_pick', index: 0 })), 800);
      }
      console.log(`[${this.name}] ${JSON.stringify(msg).slice(0, 300)}`);
    });
    this.ws.on('open', () => console.log(`[${this.name}] connected`));
  }
  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }
  latest(t) {
    return [...this.events].reverse().find((e) => e.t === t);
  }
}

const clients = [];
for (const uid of UIDS) {
  const token = await login(uid);
  clients.push(new Client(token, uid, `uid${uid}`));
}
await new Promise((r) => setTimeout(r, 1500));

if (mode === 'draw') {
  // 轮询猜词命令文件：内容=要猜的词（由测试者从浏览器画家词牌读出后写入）
  // uid4 每回合作画阶段先猜一个固定错误词（测猜错转聊天），uid6 负责猜对；文件变更后两人都猜
  setInterval(() => {
    try {
      const mtime = fs.statSync(GUESS_FILE).mtimeMs;
      if (mtime > lastGuessFileMtime) {
        lastGuessFileMtime = mtime;
        const word = fs.readFileSync(GUESS_FILE, 'utf-8').trim();
        if (word && word !== lastGuessedWord) {
          lastGuessedWord = word;
          clients[0].send({ t: 'guess', content: '随便猜一个' });
          setTimeout(() => clients[0].send({ t: 'guess', content: word }), 600);
          setTimeout(() => clients[1].send({ t: 'guess', content: word }), 1200);
          console.log(`[copilot] 已下发猜词: ${word}`);
        }
      }
    } catch {
      /* 文件不存在时静默 */
    }
  }, 400);
} else if (mode === 'spy') {
  // 投票阶段自动投票：投第一个非自己的存活玩家；重投时限定候选池
  for (const c of clients) {
    setInterval(() => {
      const phase = c.latest('spy_phase');
      if (!phase || phase.phase !== 'vote') return;
      const lastUpdate = c.latest('spy_vote_update');
      // 用事件时间粗判：每个 vote 阶段只投一次（phase deadline 距收到 <1s 时已投过则跳过）
      if (c.lastVoteKey === `${phase.deadline}`) return;
      c.lastVoteKey = `${phase.deadline}`;
      setTimeout(() => {
        const p2 = c.latest('spy_phase');
        if (!p2 || p2.phase !== 'vote' || p2.deadline !== phase.deadline) return;
        let pool = (p2.isRevote ? p2.revotePool : p2.alive) || [];
        const target = pool.find((id) => id !== c.uid);
        if (target !== undefined) {
          c.send({ t: 'spy_vote', target });
          console.log(`[copilot] ${c.name} 投给 ${target}`);
        }
      }, 1200);
    }, 700);
  }
}

// 保活 30 分钟
await new Promise((r) => setTimeout(r, 30 * 60 * 1000));
process.exit(0);
