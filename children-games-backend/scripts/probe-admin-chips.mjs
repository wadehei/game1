// 临时：验证管理端发积分链路（BASE 可配）
import 'dotenv/config';

const BASE = process.env.BASE || 'http://localhost:3002';
const login = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) }).then((r) => r.json());
if (login.code !== 200) { console.log('登录失败:', JSON.stringify(login)); process.exit(1); }
const token = login.data.token;

const list = await fetch(`${BASE}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
const ssh = (list.data || []).find((u) => u.nickname === 'ssh');
console.log('ssh 当前积分:', ssh?.battleChips, '| id:', ssh?.id);

if (!ssh) process.exit(0);
const before = ssh.battleChips;
const adj = await fetch(`${BASE}/api/admin/users/${ssh.id}/chips`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ delta: 100 }),
}).then((r) => r.json());
console.log('delta+100 响应:', JSON.stringify(adj).slice(0, 200));

const list2 = await fetch(`${BASE}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
const ssh2 = (list2.data || []).find((u) => u.nickname === 'ssh');
console.log('发放后列表积分:', ssh2?.battleChips, '|（发放前', before, '）');

// 还原
await fetch(`${BASE}/api/admin/users/${ssh.id}/chips`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ set: before }),
});
console.log('已还原为', before);
