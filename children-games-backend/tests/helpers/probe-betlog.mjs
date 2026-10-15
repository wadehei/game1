// 临时探针：以 uid2 身份连房间，打印快照里的 myBetLog
const uid = Number(process.argv[2] || 2);
const roomId = process.argv[3];
const login = await fetch('http://localhost:3002/api/user/login/family', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ uid }),
}).then((r) => r.json());
const WebSocket = (await import('ws')).default;
const ws = new WebSocket(`ws://localhost:3002/ws?token=${login.data.token}&roomId=${roomId}`);
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.t === 'joined') {
    console.log(JSON.stringify({ phase: m.phase, game: { round: m.game?.round, phase: m.game?.phase, myBetLog: m.game?.myBetLog, chips: m.game?.chips, myStake: m.game?.myStake } }, null, 2));
    ws.close();
    process.exit(0);
  }
});
setTimeout(() => process.exit(1), 5000);
