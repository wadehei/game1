import WebSocket from 'ws';
const login = await (await fetch('http://localhost:3002/api/user/login/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 7 }) })).json();
const ws = new WebSocket(`ws://localhost:3002/ws?token=${login.data.token}&roomId=2594`);
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.t === 'joined') { console.log('zj 已加入 seat', m.yourSeat); ws.send(JSON.stringify({ t: 'ready' })); }
});
ws.on('open', () => console.log('zj 已连接'));
await sleep(280000);
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
