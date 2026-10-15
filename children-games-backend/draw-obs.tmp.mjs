import WebSocket from 'ws';
const fs = await import('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const roomId = fs.readFileSync('/tmp/draw-room.txt', 'utf-8').trim();
const uid = Number(process.argv[2]);
const login = await (await fetch('http://localhost:3002/api/user/login/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }) })).json();
const ws = new WebSocket(`ws://localhost:3002/ws?token=${login.data.token}&roomId=${roomId}`);
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.t === 'joined') ws.send(JSON.stringify({ t: 'ready' }));
  if (m.t === 'draw_round' && m.phase === 'drawing' && m.drawerSeat === seatOf(uid)) {
    setTimeout(() => ws.send(JSON.stringify({ t: 'draw_skip' })), 2000);
  }
});
function seatOf(uid) {
  return { 4: 1, 9: 2 }[uid];
}
ws.on('open', () => console.log('观察者', uid, '就绪'));
await sleep(300000);
process.exit(0);
