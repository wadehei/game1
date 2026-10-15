// 临时：验证备份导出包含全部表
import 'dotenv/config';

const login = await fetch('http://localhost:3002/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) }).then((r) => r.json());
const res = await fetch('http://localhost:3002/api/admin/backup', { headers: { Authorization: `Bearer ${login.data.token}` } });
const sql = await res.text();
const tables = [...sql.matchAll(/^-- (\w+)（/gm)].map((m) => m[1]);
console.log('status:', res.status);
console.log('tables:', tables.join(', '));
for (const t of ['battle_records', 'quiz_questions', 'feedbacks', 'feedback_replies']) {
  const n = (sql.match(new RegExp(`INSERT INTO \\\`${t}\\\``, 'g')) || []).length;
  console.log(`${t}: ${n} 行 INSERT`);
}
