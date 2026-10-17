// 临时：难度覆盖保存直测
import 'dotenv/config';

const login = await fetch('http://localhost:3002/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) }).then((r) => r.json());
const put = await fetch('http://localhost:3002/api/admin/levels/memory/999', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.data.token}` },
  body: JSON.stringify({ pairs: 8 }),
}).then((r) => r.json());
console.log('PUT memory/999:', JSON.stringify(put));
const del = await fetch('http://localhost:3002/api/admin/levels/memory/999', { method: 'DELETE', headers: { Authorization: `Bearer ${login.data.token}` } }).then((r) => r.json());
console.log('DELETE:', JSON.stringify(del));
process.exit(0);
