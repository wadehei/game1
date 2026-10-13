require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({ host: 'localhost', port: 3306, user: 'root', password: process.env.DB_PASSWORD });
  const [users] = await conn.query('SELECT id, nickname, openid, totalStars FROM children_games.users ORDER BY id');
  const [pt] = await conn.query('SELECT COUNT(*) AS n FROM children_games.user_playtime');
  const [gp] = await conn.query('SELECT COUNT(*) AS n FROM children_games.game_progress');
  fs.writeFileSync('users-check.txt', [
    'users: ' + JSON.stringify(users),
    'playtime rows: ' + pt[0].n,
    'progress rows: ' + gp[0].n,
  ].join('\n'));
  await conn.end();
  process.exit(0);
})().catch((e) => {
  fs.writeFileSync('users-check.txt', 'FAIL: ' + e.message);
  process.exit(0);
});
