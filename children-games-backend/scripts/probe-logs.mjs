// 临时：查错误日志
import 'dotenv/config';

const BASE = process.env.BASE || 'http://localhost:3002';
const login = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) }).then((r) => r.json());
const logs = await fetch(`${BASE}/api/admin/logs?limit=30`, { headers: { Authorization: `Bearer ${login.data.token}` } }).then((r) => r.json());
for (const l of (logs.data || []).slice(0, 15)) {
  console.log(`[${l.source}]`, l.message.slice(0, 220), l.detail ? ' || ' + l.detail.slice(0, 260) : '');
}
process.exit(0);
