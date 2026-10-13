require('dotenv').config();
const fs = require('fs');
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({ host: 'localhost', port: 3306, user: 'root', password: process.env.DB_PASSWORD });
  const out = [];
  const cols = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA='children_games'
       AND ((TABLE_NAME='game_progress' AND COLUMN_NAME='levelStars')
         OR (TABLE_NAME='users' AND COLUMN_NAME='achievements'))`
  );
  out.push(`新列存在: ${cols[0].map((c) => c.TABLE_NAME + '.' + c.COLUMN_NAME).join(', ') || '无（会被自动补列修复）'}`);
  const [tables] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA='children_games' AND TABLE_NAME IN ('app_settings','user_playtime')`
  );
  out.push(`新表存在: ${tables.map((t) => t.TABLE_NAME).join(', ') || '无（会被自动建表修复）'}`);
  const [users] = await conn.query('SELECT COUNT(*) AS n FROM children_games.users');
  const [stars] = await conn.query('SELECT IFNULL(SUM(total_stars),0) AS s FROM children_games.users');
  out.push(`成员 ${users[0].n} 个，总星星 ${stars[0].s}`);
  fs.writeFileSync('schema-check.txt', out.join('\n'));
  await conn.end();
})().catch((e) => fs.writeFileSync('schema-check.txt', 'FAIL: ' + e.message));
