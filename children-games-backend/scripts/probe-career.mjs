// 临时：查生产生涯流水
const BASE = process.env.BASE || 'http://49.232.231.35';
const uid = process.argv[2] || 2;
const login = await fetch(`${BASE}/api/user/login/family`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }) }).then((r) => r.json());
const career = await fetch(`${BASE}/api/user/battle/career`, { headers: { Authorization: `Bearer ${login.data.token}` } }).then((r) => r.json());
console.log('uid', uid, 'chips:', career.data.chips);
for (const r of career.data.recent.slice(0, 8)) {
  console.log(r.gameType, r.result, 'delta=' + r.chipsDelta, 'after=' + r.chipsAfter, r.createdAt);
}
