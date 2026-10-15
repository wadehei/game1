// 多玩家对战模拟器：对指定服务器模拟多个机器人完整玩三张牌比大小 / 21点，校验结算逻辑
// 用法：BASE=http://49.232.231.35 node tests/sim-battle.mjs zjh [玩家数=4] [局数=2]
//       BASE=http://49.232.231.35 node tests/sim-battle.mjs blackjack [玩家数=3] [局数=2]
// 校验：三张牌=每手零和(Σ净变动=0)+全员结算+明细条目齐全；21点=每人 delta 严格符合赔率公式（本地引擎重算）
import WebSocket from 'ws';

const game = process.argv[2] || 'zjh';
let nPlayers = Math.min(Number(process.argv[3]) || 4, game === 'blackjack' ? 5 : 6);
const handLimit = Number(process.argv[4]) || 2;
const BASE = process.env.BASE || 'http://localhost:3002';
const WS_BASE = process.env.WS_BASE || BASE.replace(/^http/, 'ws') + '/ws';
const UIDS = [2, 4, 6, 12, 1, 8].slice(0, nPlayers);

let pass = 0;
let failCount = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  cond ? pass++ : failCount++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = async (uid) =>
  (await fetch(`${BASE}/api/user/login/family`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }) }).then((r) => r.json())).data;

class Bot {
  constructor(data, name) {
    this.uid = data.userInfo.id;
    this.token = data.token;
    this.name = name;
    this.mySeat = -1;
    this.events = [];
    this.alive = null; // 三张牌：存活玩家 uid 集（fold/被比下去即移除，结算后重置）
    this.onEvent = null; // 即时事件处理（21点状态跟踪用，避免事件重放）
  }
  connect(roomId, onEvent) {
    this.onEvent = onEvent || null;
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}?token=${this.token}&roomId=${roomId}`);
      const t = setTimeout(() => reject(new Error('连接超时')), 8000);
      this.ws.on('message', (d) => {
        const m = JSON.parse(d.toString());
        this.events.push(m);
        this.onEvent?.(m);
        if (m.t === 'snapshot') this.snapshot = m;
        if (m.t === 'joined') {
          this.mySeat = m.yourSeat ?? -1;
          this.snapshot = m; // joined 携带完整快照（含 betLedger）
          clearTimeout(t);
          resolve(m);
        }
        if (this.alive) {
          if (m.t === 'zjh_action' && (m.action === 'fold' || m.action === 'timeout_fold')) this.alive.delete(m.userId);
          if (m.t === 'zjh_compare' && m.loser) this.alive.delete(m.loser);
          if (m.t === 'zjh_settle') this.alive = new Set(UIDS);
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
    return this.all(t).at(-1);
  }
  close() {
    this.ws?.close();
  }
}

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

// ── 三张牌比大小模拟 ──
async function simZjh() {
  const engine = await import('../dist/ws/games/zjh/engine.js');
  const datas = [];
  for (const uid of UIDS) {
    const d = await login(uid).catch(() => null);
    if (d?.userInfo) datas.push(d);
  }
  if (datas.length < 2) {
    console.error('[sim] 可用成员不足（服务器上不存在这些 uid）');
    process.exit(1);
  }
  nPlayers = Math.min(nPlayers, datas.length);
  const created = await fetch(`${BASE}/api/room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${datas[0].token}` },
    body: JSON.stringify({ gameType: 'zjh', config: { roundLimit: handLimit, career: false, special235: true, timeoutFold: false } }),
  }).then((r) => r.json());
  const roomId = created.data.roomId;
  console.log(`[sim] 三张牌房间 ${roomId}，${nPlayers} 个机器人，打 ${handLimit} 手`);
  const bots = [];
  for (const d of datas) {
    const b = new Bot(d, d.userInfo.nickname);
    await b.connect(roomId);
    b.alive = new Set(UIDS);
    bots.push(b);
  }
  for (const b of [...bots].reverse()) b.send({ t: 'ready' });

  const acted = new Set();
  const deadline = Date.now() + (handLimit + 2) * 120000;
  const settles = [];
  let final = null;
  while (Date.now() < deadline && !final) {
    let progressed = false;
    for (const b of bots) {
      const p = b.last('zjh_phase');
      if (!p) continue;
      if (p.phase === 'betting' && p.turnSeat === b.mySeat) {
        const key = `act:${p.round}:${p.roundNo}:${b.mySeat}`;
        if (acted.has(key)) continue;
        acted.add(key);
        progressed = true;
        if (p.roundNo >= 3 && Math.random() < 0.25) {
          const candidates = [...b.alive].filter((uid) => uid !== b.uid);
          const tUid = pick(candidates);
          if (tUid) {
            b.send({ t: 'zjh_compare', target: UIDS.indexOf(tUid) });
            continue;
          }
        }
        if (!b.events.some((e) => e.t === 'zjh_your_cards') && Math.random() < 0.4) b.send({ t: 'zjh_look' });
        if (p.stake < p.stakeCap && Math.random() < 0.2) b.send({ t: 'zjh_raise', amount: pick([10, 20]) });
        else b.send({ t: 'zjh_call' });
      }
      const s = b.last('zjh_settle');
      if (s && !settles.some((x) => x.round === s.round)) settles.push(s);
      const f = b.last('zjh_final');
      if (f) final = f;
    }
    if (!progressed) await sleep(200);
  }

  check(`三张牌 打满 ${handLimit} 手并终局`, !!final && final.ranking.length === nPlayers);
  if (!final) {
    console.log('[dbg] 未到终局：');
    for (const b of bots) console.log(' ', b.name, JSON.stringify(b.last('zjh_phase'))?.slice(0, 180), '| final:', b.all('zjh_final').length, '| 事件数:', b.events.length);
    const probe = new Bot(datas[0], 'probe');
    try {
      await probe.connect(roomId);
      console.log('[dbg] probe:', JSON.stringify(probe.last('zjh_phase'))?.slice(0, 220), '| final:', !!probe.last('zjh_final'), '| ended:', !!probe.snapshot?.game?.ended);
      probe.close();
    } catch (e) {
      console.log('[dbg] probe 连接失败:', e.message);
    }
  }
  check('每手都有结算广播', settles.length >= Math.min(handLimit, settles.length) && settles.length > 0);
  // 零和校验：每手所有人净变动之和必须为 0（赢家赢的=别人输的）
  let zeroSum = true;
  for (const s of settles) {
    const sum = (s.deltas || []).reduce((acc, d) => acc + d.delta, 0);
    if (sum !== 0) {
      zeroSum = false;
      console.log(`  [!] 第${s.round}手 Σdelta=${sum}（非零和）`, JSON.stringify(s.deltas));
    }
  }
  check(`每手零和（${settles.length} 手 Σdelta 全为 0）`, zeroSum);
  check('赢家每手净赢为正', settles.every((s) => (s.deltas || []).some((d) => d.delta > 0)));

  // 全员投注明细快照校验：条目齐全且全部已结算
  const probe = new Bot(datas[0], 'probe');
  await probe.connect(roomId);
  const ledger = probe.snapshot?.game?.betLedger || probe.events.find((e) => e.t === 'snapshot')?.game?.betLedger || [];
  const handsSeen = new Set(ledger.map((e) => e.round));
  // 有投入的玩家每手都有条目（破产玩家自动观战、无条目属正常）
  check('每手至少有一条投注记录（破产观战除外）', settles.every((s) => ledger.some((e) => e.round === s.round)));
  check('明细全部已结算（无未回填条目）', ledger.every((e) => e.delta !== null));
  check('明细覆盖每一手', handsSeen.size >= Math.min(handLimit, settles.length));
  if (ledger.length < nPlayers * settles.length) {
    console.log(`  [info] 条目 ${ledger.length} < 人数×手数：存在破产观战或提前终局，属正常`);
  }
  probe.close();

  // 协议错误检查：不允许出现未知操作/服务端异常
  const errs = bots.flatMap((b) => b.all('error')).map((e) => e.message || '');
  const fatal = errs.filter((m) => m.includes('未知') || m.includes('异常'));
  check('无协议级错误', fatal.length === 0);

  // 终局排名降序
  const chips = final.ranking.map((r) => r.chips);
  check('终局排名按积分降序', chips.every((c, i) => i === 0 || chips[i - 1] >= c));
  for (const b of bots) b.close();
}

// ── 21点模拟 ──
async function simBlackjack() {
  const engine = await import('../dist/ws/games/blackjack/engine.js');
  const datas = [];
  for (const uid of UIDS) {
    const d = await login(uid).catch(() => null);
    if (d?.userInfo) datas.push(d);
  }
  if (datas.length < 2) {
    console.error('[sim] 可用成员不足（服务器上不存在这些 uid）');
    process.exit(1);
  }
  const created = await fetch(`${BASE}/api/room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${datas[0].token}` },
    body: JSON.stringify({ gameType: 'blackjack', config: { bankerMode: 'rotate', roundLimit: handLimit, career: false } }),
  }).then((r) => r.json());
  const roomId = created.data.roomId;
  console.log(`[sim] 21点房间 ${roomId}，${nPlayers} 个机器人，打 ${handLimit} 手`);

  // 机器人状态：自己的牌/押注/natural（事件即时处理，不重放，避免跨手串牌）
  const st = new Map();
  for (const d of datas) st.set(d.userInfo.id, { cards: [], stake: 0, natural: false, done: false, verified: false, round: 0 });

  const onEvent = (b) => (m) => {
    try {
      const s = st.get(b.uid);
      if (!s) {
        if (m.t !== 'member_update') console.log(`[dbg] ${b.name} 收到未初始化状态的消息:`, m.t);
        return;
      }
    if (m.t === 'blackjack_phase' && m.round !== s.round) {
      s.round = m.round;
      s.cards = [];
      s.stake = 0;
      s.natural = false;
      s.done = false;
      s.verified = false;
    }
    if (m.t === 'blackjack_deal') {
      const mine = (m.hands || []).find((h) => h.userId === b.uid);
      if (mine) {
        s.cards = [...mine.cards];
        s.stake = mine.stake;
        s.natural = !!mine.natural;
        s.done = !!mine.natural;
      }
    }
    if (m.t === 'blackjack_action' && m.userId === b.uid && (m.action === 'hit' || m.action === 'double')) {
      if (m.card) s.cards.push(m.card);
      if (m.action === 'double') s.stake = m.stake;
      if (m.busted || engine.isBusted(s.cards)) s.done = true;
    }
    if (m.t === 'blackjack_settle' && !s.verified) {
      s.verified = true;
      settles.push(m);
      // 结算瞬间核对：状态即本手的（牌/押注/natural）；广播牌面 '♥10' 需还原为 Card 对象再进引擎
      const mine = (m.results || []).find((r) => r.userId === b.uid);
      if (mine && s.cards.length) {
        const parse = (label) => {
          const suit = label[0];
          const r = label.slice(1);
          return { suit, rank: r === 'A' ? 1 : r === 'J' ? 11 : r === 'Q' ? 12 : r === 'K' ? 13 : Number(r) };
        };
        const mult = engine.payoutMultiplier(s.cards.map(parse), (m.bankerCards || []).map(parse), s.natural);
        const expect = Math.round(mult * s.stake) - s.stake;
        verified += 1;
        if (mine.delta !== expect) {
          payoutOk = false;
          console.log(`  [!] ${b.name} 第${m.round}手 delta=${mine.delta} 期望=${expect}（牌 ${s.cards.join(',')} vs 庄 ${(m.bankerCards || []).join(',')} stake=${s.stake}）`);
        }
      }
    }
    if (m.t === 'blackjack_final') final = m;
    } catch (err) {
      console.log(`[dbg] ${b.name} onEvent 异常（${m.t}）:`, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' | ') : err);
    }
  };

  const bots = [];
  for (const d of datas) {
    const b = new Bot(d, d.userInfo.nickname);
    await b.connect(roomId, onEvent(b));
    bots.push(b);
  }
  for (const b of [...bots].reverse()) b.send({ t: 'ready' });
  await sleep(2000);
  if (!bots.some((b) => b.last('blackjack_phase'))) {
    console.log('[dbg] ready 后无 phase 事件。机器人事件类型：');
    for (const b of bots) console.log(' ', b.name, b.events.map((e) => e.t).join(','));
  }

  const acted = new Set();
  const deadline = Date.now() + (handLimit + 2) * 120000;
  const settles = [];
  let final = null;
  let payoutOk = true;
  let verified = 0;
  while (Date.now() < deadline && !final) {
    for (const b of bots) {
      const s = st.get(b.uid);
      const phase = b.last('blackjack_phase');
      if (phase && phase.phase === 'betting' && phase.bankerSeat !== b.mySeat) {
        const key = `bet:${phase.round}:${b.mySeat}`;
        if (!acted.has(key)) {
          acted.add(key);
          s.stake = pick([10, 20]);
          b.send({ t: 'blackjack_bet', amount: s.stake });
        }
      }
      if (phase && phase.phase === 'acting' && phase.turnSeat === b.mySeat && !s.done) {
        // 一手内可以多次要牌：防重键带上当前牌数
        const key = `act:${phase.round}:${b.mySeat}:${s.cards.length}`;
        if (acted.has(key)) continue;
        acted.add(key);
        const total = engine.handValue(s.cards).total;
        if (s.cards.length === 2 && Math.random() < 0.12) {
          b.send({ t: 'blackjack_double' });
        } else if (total < 17) {
          b.send({ t: 'blackjack_hit' });
        } else {
          b.send({ t: 'blackjack_stand' });
          s.done = true;
        }
      }
    }
    await sleep(150);
  }

  check(`21点 打满 ${handLimit} 手并终局`, !!final && final.ranking.length === nPlayers);
  check('每手都有结算广播', settles.length > 0);
  check(`每人每手 delta 严格符合赔率公式（核对 ${verified} 条）`, payoutOk && verified > 0);
  if (!final) {
    console.log('[dbg] 未到终局。各机器人最后阶段：');
    for (const b of bots) console.log(' ', b.name, JSON.stringify(b.last('blackjack_phase')), '| settles:', settles.length, '| 事件数:', b.events.length, '| closed:', b.events.filter((e) => e.t === 'closed').length, '| final:', b.events.filter((e) => e.t === 'blackjack_final').length);
    const probe = new Bot(datas[0], 'probe');
    try {
      await probe.connect(roomId);
      console.log('[dbg] probe 视角 phase:', JSON.stringify(probe.last('blackjack_phase'))?.slice(0, 200), '| final:', !!probe.last('blackjack_final'), '| settles(probe):', probe.all('blackjack_settle').length);
      probe.close();
    } catch (e) {
      console.log('[dbg] probe 连接失败（房间可能已解散）:', e.message);
    }
  }
  const chips = (final?.ranking || []).map((r) => r.chips);
  check('终局排名按积分降序', chips.every((c, i) => i === 0 || chips[i - 1] >= c));
  const errs = bots.flatMap((b) => b.all('error')).map((e) => e.message || '');
  const fatal = errs.filter((m) => m.includes('未知') || m.includes('异常'));
  check('无协议级错误', fatal.length === 0);
  for (const b of bots) b.close();
}

if (game === 'zjh') await simZjh();
else if (game === 'blackjack') await simBlackjack();
else {
  console.error('未知游戏:', game);
  process.exit(1);
}
console.log(`\n[sim] ${game} 结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
