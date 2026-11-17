// 坦克对决走查陪玩：uid4 join+ready+每秒随机移动方向+开火
import WebSocket from 'ws';
const roomId = process.argv[2];
const login = await fetch('http://localhost:3002/api/user/login/family', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 4 }),
}).then((r) => r.json());
const token = login.data.accessToken || login.data.token;
const ws = new WebSocket(`ws://localhost:3002/ws?token=${token}&roomId=${roomId}`);
ws.on('open', () => console.log('[tank] open'));
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.t === 'joined') { console.log('[tank] joined'); ws.send(JSON.stringify({ t: 'ready' })); }
  if (m.t === 'game_start') console.log('[tank] game_start');
  if (m.t === 'tank_state') console.log('[tank] state tick, players=', (m.players || []).length);
  if (m.t === 'error') console.log('[tank] ERROR', m.message);
});
setInterval(() => { ws.send(JSON.stringify({ t: 'tank_move', dir: Math.floor(Math.random() * 4) })); }, 800);
setInterval(() => { ws.send(JSON.stringify({ t: 'tank_fire' })); }, 1200);
setTimeout(() => process.exit(0), 45000);
