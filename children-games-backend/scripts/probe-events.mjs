// 临时：最小 21点事件流探针
import WebSocket from 'ws';

const BASE = process.env.BASE || 'http://localhost:3002';
const login = async (uid) => (await fetch(`${BASE}/api/user/login/family`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }) }).then((r) => r.json())).data;

const a = await login(2);
const b = await login(4);
const room = await fetch(`${BASE}/api/room`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` }, body: JSON.stringify({ gameType: 'blackjack', config: { bankerMode: 'rotate', roundLimit: 1, career: false } }) }).then((r) => r.json());
console.log('room', room.data.roomId);

const mk = (token, name) => {
  const ws = new WebSocket(`ws://localhost:3002/ws?token=${token}&roomId=${room.data.roomId}`);
  const ev = [];
  ws.on('message', (d) => ev.push(JSON.parse(d.toString())));
  ws.on('close', (code) => ev.push({ t: `__closed:${code}` }));
  ws.on('error', (e) => ev.push({ t: `__error:${e.message}` }));
  return { ws, ev, send: (o) => ws.send(JSON.stringify(o)) };
};
const A = mk(a.token, 'A');
const B = mk(b.token, 'B');
await new Promise((r) => setTimeout(r, 500));
B.send({ t: 'ready' });
A.send({ t: 'ready' });
await new Promise((r) => setTimeout(r, 1000));
B.send({ t: 'blackjack_bet', amount: 10 });
await new Promise((r) => setTimeout(r, 3000));
for (const [name, c] of [['A', A], ['B', B]]) {
  console.log(`--- ${name} (${c.ev.length} 事件) ---`);
  for (const e of c.ev) console.log(' ', e.t, e.action || '', e.phase || '', JSON.stringify(e.hands || e.results || '').slice(0, 120));
}
process.exit(0);
