import WebSocket from 'ws';
const fs = await import('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const roomId = fs.readFileSync('/tmp/draw-room.txt', 'utf-8').trim();
const login = await (await fetch('http://localhost:3002/api/user/login/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 9 }) })).json();
const ws = new WebSocket(`ws://localhost:3002/ws?token=${login.data.token}&roomId=${roomId}`);
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.t === 'joined') ws.send(JSON.stringify({ t: 'ready' }));
});
ws.on('open', () => console.log('uid9 已加入并准备'));
await sleep(280000);
process.exit(0);
