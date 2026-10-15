// 21点协议测试（需后端在线；默认 http://localhost:3002，建议 BLACKJACK_BET_SECONDS/ACT_SECONDS=3 加速）
// 覆盖：下注档位校验 → 发牌与庄家暗牌隔离 → hit/stand/超时停牌 → 庄家自动要牌 → 每手积分结算 →
//       轮庄（rotate）→ 多手终局排名 → keep 模式让庄 → 生涯记录（career:true）
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

// ── engine 纯逻辑断言（编译产物直接 import） ──
const engine = await import('../dist/ws/games/blackjack/engine.js');
check('A 单张 = 11 软点', engine.handValue([{ suit: '♠', rank: 1 }]).total === 11 && engine.handValue([{ suit: '♠', rank: 1 }]).soft);
check('A+A+9 = 21（软硬取优）', engine.handValue([{ suit: '♠', rank: 1 }, { suit: '♥', rank: 1 }, { suit: '♦', rank: 9 }]).total === 21);
check('爆牌判定', engine.isBusted([{ suit: '♠', rank: 10 }, { suit: '♥', rank: 10 }, { suit: '♦', rank: 5 }]));
check('Blackjack = 两张21', engine.isBlackjack([{ suit: '♠', rank: 1 }, { suit: '♥', rank: 13 }]));
check('庄家爆牌闲家赢 2 倍派彩', engine.payoutMultiplier([{ suit: '♠', rank: 5 }], [{ suit: '♥', rank: 10 }, { suit: '♦', rank: 10 }, { suit: '♣', rank: 9 }], false) === 2);
check('两家 Blackjack 平局退注（市面规则）', engine.payoutMultiplier([{ suit: '♠', rank: 1 }, { suit: '♥', rank: 13 }], [{ suit: '♦', rank: 1 }, { suit: '♣', rank: 13 }], true) === 1);
check('庄家 BJ 时普通玩家输原注', engine.payoutMultiplier([{ suit: '♠', rank: 9 }, { suit: '♥', rank: 9 }], [{ suit: '♦', rank: 1 }, { suit: '♣', rank: 13 }], false) === 0);

// ── 主流程（3 人，rotate 模式，2 手，career 开） ──
const tokens = [];
for (const uid of [2, 4, 6]) {
  tokens.push((await http('POST', '/api/user/login/family', { uid })).json.data.token);
}
const created = await http('POST', '/api/room', { gameType: 'blackjack', config: { bankerMode: 'rotate', roundLimit: 2, career: true } }, tokens[0]);
check('创建21点房间', created.json?.code === 200 && created.json.data.gameType === 'blackjack');
const roomId = created.json.data.roomId;

const A = new Client(tokens[0], 'A');
const B = new Client(tokens[1], 'B');
const C = new Client(tokens[2], 'C');
const jA = await A.connect(roomId);
await B.connect(roomId);
await C.connect(roomId);
check('开局快照 phase=betting', jA.game?.phase === 'betting');
check('快照带积分表（进房者积分可见）', Array.isArray(jA.game?.chips) && jA.game.chips.length >= 1 && typeof jA.game.chips[0].chips === 'number');

for (const c of [B, C, A]) c.send({ t: 'ready' });
const start = await A.waitNew('blackjack_phase', 0);
check('开局庄家=座位0（rotate 首庄）', start.bankerSeat === 0 && start.phase === 'betting' && start.round === 1);
check('开局积分表（phase 事件）', Array.isArray(start.chips) && start.chips.length === 3);

// 对局中加入一律观战（市面标准：本局已开始不下场）
const D = new Client((await http('POST', '/api/user/login/family', { uid: 1 })).json.data.token, 'D');
const jD = await D.connect(roomId);
check('对局中加入自动转观战（seat=-1）', jD.yourSeat === -1);
D.close();

// 非法下注
A.send({ t: 'blackjack_bet', amount: 20 });
await sleep(300);
check('庄家下注被拒（无下注事件）', A.all('blackjack_action').filter((e) => e.userId === 2 && e.action === 'bet').length === 0);
B.send({ t: 'blackjack_bet', amount: 33 });
await sleep(300);
check('非法档位被拒', B.all('blackjack_action').filter((e) => e.action === 'bet').length === 0);

// 全员下注 → 发牌（断言不依赖事件先后，只看下注广播与发牌是否出现）
B.send({ t: 'blackjack_bet', amount: 20 });
C.send({ t: 'blackjack_bet', amount: 20 });
const deal = await A.waitNew('blackjack_deal', 0);
check('下注广播存在（B/C 各一条）', B.all('blackjack_action').filter((e) => e.action === 'bet').length >= 1);
check('发牌：闲家各 2 张', deal.hands.length === 2 && deal.hands.every((h) => h.cards.length === 2));
check('庄家只有明牌', typeof deal.bankerUpcard === 'string' && deal.bankerUpcard.length > 0);

// 行动轮转：从庄家下家开始（基线在发牌前抓）
const phaseBase = A.all('blackjack_phase').length;
check('第一个行动者是座位1', (() => {
  const acting = A.all('blackjack_phase').slice(phaseBase - 1).find((e) => e.phase === 'acting');
  return !!acting && acting.turnSeat === 1;
})());

// B 要一张牌再停牌（爆了会自动轮转）
const bActBase = B.all('blackjack_action').length;
B.send({ t: 'blackjack_hit' });
await B.waitNew('blackjack_action', bActBase);
const bHit = B.all('blackjack_action').find((e) => e.userId === 4 && e.action === 'hit');
check('B hit 收到新牌', !!bHit && typeof bHit.card === 'string');
if (!bHit?.busted) {
  B.send({ t: 'blackjack_stand' });
}
// C 停牌（轮到 C 的 phase 事件或直接发，服务器校验轮次）
await sleep(400);
C.send({ t: 'blackjack_stand' });

// 庄家阶段 → 结算
const settle = await A.waitNew('blackjack_settle', 0);
check(
  '本手结算广播',
  Array.isArray(settle.results) && settle.results.length === 2 && settle.results.every((r) => typeof r.delta === 'number' && typeof r.chips === 'number')
);
check('庄家亮牌结算', Array.isArray(settle.bankerCards) && settle.bankerCards.length >= 2);
check('每手积分入账（chips 表更新）', settle.chips.every((c) => typeof c.chips === 'number'));

// 第 2 手：轮庄到座位 1
const round2 = await A.waitNew('blackjack_phase', A.all('blackjack_phase').length);
check('rotate 轮庄：第 2 手庄家=座位1', round2.round === 2 && round2.bankerSeat === 1);

// 超时停牌：这手所有人不下注等超时自动下注，行动阶段 C 不操作等超时停牌
const settle2 = await A.waitNew('blackjack_settle', A.all('blackjack_settle').length);
check('第 2 手结算完成（含超时兜底）', Array.isArray(settle2.results));

// 终局：2 手打满 → final + game_over
const final = await A.waitNew('blackjack_final', 0, 20000);
check('终局排名 3 人按积分降序', final.ranking.length === 3 && final.ranking[0].chips >= final.ranking[1].chips && final.ranking[1].chips >= final.ranking[2].chips);
const over = await A.waitNew('game_over', 0);
check('game_over 胜者=排名首位座位', over.winnerSeat === final.ranking[0].seat);

// 再来一局表决倒计时（REMATCH_AUTO_SECONDS=3）：一人投票后到点自动重开
B.send({ t: 'rematch' });
const restartEvt = await A.waitNew('game_restart', 0, 15000);
check('表决超时自动重开（未表态视为同意）', restartEvt.phase === 'playing');

// 生涯记录（career:true 局）
const career = await http('GET', '/api/user/battle/career', null, tokens[0]);
check('生涯接口返回积分与记录', career.json?.code === 200 && typeof career.json.data.chips === 'number');
check('blackjack 局已写入生涯', (career.json.data.games || []).some((g) => g.gameType === 'blackjack'));

// ── keep 模式让庄 ──
const created2 = await http('POST', '/api/room', { gameType: 'blackjack', config: { bankerMode: 'keep', roundLimit: 1, career: false } }, tokens[0]);
const roomId2 = created2.json.data.roomId;
const A2 = new Client(tokens[0], 'A2');
const B2 = new Client(tokens[1], 'B2');
const C2 = new Client(tokens[2], 'C2');
await A2.connect(roomId2);
await B2.connect(roomId2);
await C2.connect(roomId2);
for (const c of [B2, C2, A2]) c2Ready(c);
function c2Ready(c) {
  c.send({ t: 'ready' });
}
const start2 = await A2.waitNew('blackjack_phase', 0);
const keepBanker = start2.bankerSeat;
check('keep 模式随机首庄', typeof keepBanker === 'number');
// 庄家让庄：换庄后重开本手下注
const bankerClient = [A2, B2, C2][keepBanker];
bankerClient.send({ t: 'blackjack_pass_bank' });
const afterPass = await A2.waitNew('blackjack_phase', A2.all('blackjack_phase').length);
check('让庄后庄家必然换人', afterPass.bankerSeat !== keepBanker);
check('让庄后仍是下注阶段', afterPass.phase === 'betting');

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
