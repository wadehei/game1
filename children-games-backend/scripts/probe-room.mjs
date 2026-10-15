// 临时：连房间 dump 快照 game 字段
import WebSocket from 'ws';

const roomId = process.argv[2];
const uid = process.argv[3] || 2;
const data = await fetch('http://localhost:3002/api/user/login/family', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }) }).then((r) => r.json()).then((r) => r.data);
const ws = new WebSocket(`ws://localhost:3002/ws?token=${data.token}&roomId=${roomId}`);
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.t === 'joined' || m.t === 'snapshot') {
    console.log(m.t, '| game keys:', m.game ? Object.keys(m.game).join(',') : 'NO GAME');
    console.log('betLedger:', JSON.stringify(m.game?.betLedger)?.slice(0, 500));
    console.log('ended:', JSON.stringify(m.game?.ended)?.slice(0, 150));
    process.exit(0);
  }
});
setTimeout(() => {
  console.log('timeout');
  process.exit(1);
}, 5000);
