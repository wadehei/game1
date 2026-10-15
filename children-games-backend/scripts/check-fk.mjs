// 临时：检查各表外键约束（验证 deleteUser 是否会被 feedback 等数据卡住）
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
const [rows] = await conn.query(
  `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, CONSTRAINT_NAME
   FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
  [process.env.DB_NAME]
);
console.log(JSON.stringify(rows, null, 1));
await conn.end();
