// 家长后台控制台回归（需后端在线）：发积分链路 + 列表字段真实性
// 覆盖：登录 → 列表 battleChips 为真实值（非兜底 1000）→ delta 增减 → set 设定 → 持久化 → 非法参数拒绝
import 'dotenv/config';

const BASE = process.env.BASE || 'http://localhost:3002';
let pass = 0;
let failCount = 0;
const check = (label, cond) => {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  cond ? pass++ : failCount++;
};

const api = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

// 登录（密码来自后端 .env，不硬编码）
const login = await api('POST', '/api/admin/login', { password: process.env.ADMIN_PASSWORD });
check('管理员登录', login?.code === 200 && !!login.data?.token);
const token = login.data.token;

// 列表：battleChips 必须是数字（回归：曾因查询缺字段恒显 1000）
const list = await api('GET', '/api/admin/users', null, token);
check('用户列表返回', list?.code === 200 && Array.isArray(list.data) && list.data.length > 0);
const numericChips = list.data.every((u) => typeof u.battleChips === 'number');
check('列表 battleChips 为真实数值（非兜底 1000）', numericChips);
const distinct = new Set(list.data.map((u) => u.battleChips)).size;
check('列表积分存在差异值（非全员 1000）', distinct > 1);

// 发积分：delta 增减 → 精确 +100
const target = list.data[0];
const afterDelta = await api('PUT', `/api/admin/users/${target.id}/chips`, { delta: 100 }, token);
check('delta +100 生效', afterDelta?.code === 200 && afterDelta.data.battleChips === target.battleChips + 100);

// 设定：set 覆盖为固定值
const afterSet = await api('PUT', `/api/admin/users/${target.id}/chips`, { set: 777 }, token);
check('set 设为 777 生效', afterSet?.code === 200 && afterSet.data.battleChips === 777);

// 持久化：重新拉列表值仍在（曾因字段缺失被兜底 1000 覆盖显示）
const list2 = await api('GET', '/api/admin/users', null, token);
const persisted = list2.data.find((u) => u.id === target.id)?.battleChips;
check('重拉列表积分持久化（777）', persisted === 777);

// 非法参数：delta 0 / 缺参 → 拒绝
const bad0 = await api('PUT', `/api/admin/users/${target.id}/chips`, { delta: 0 }, token);
check('delta=0 被拒绝', bad0?.code !== 200);
const badNone = await api('PUT', `/api/admin/users/${target.id}/chips`, {}, token);
check('缺参数被拒绝', badNone?.code !== 200);

// 还原目标用户积分
const restore = await api('PUT', `/api/admin/users/${target.id}/chips`, { set: target.battleChips }, token);
check('测试后积分还原', restore?.code === 200 && restore.data.battleChips === target.battleChips);

// ── 删除在房成员：立即请出（不等 60s 掉线判定） ──
const WebSocket = (await import('ws')).default;
const tempLogin = await api('POST', '/api/user/login/family', { nickname: '删除测试临时', avatar: '🤖' });
check('临时测试成员创建', tempLogin?.code === 200 && !!tempLogin.data?.token);
const tempUid = tempLogin.data.userInfo.id;
const tempRoom = await api('POST', '/api/room', { gameType: 'zjh', config: { career: false } }, tempLogin.data.token);
check('临时成员建房', tempRoom?.code === 200 && !!tempRoom.data.roomId);

const tempWs = new WebSocket(`ws://localhost:3002/ws?token=${tempLogin.data.token}&roomId=${tempRoom.data.roomId}`);
const tempEvents = [];
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('连接超时')), 6000);
  tempWs.on('message', (d) => {
    const m = JSON.parse(d.toString());
    tempEvents.push(m);
    if (m.t === 'joined') { clearTimeout(t); resolve(m); }
  });
  tempWs.on('error', (e) => { clearTimeout(t); reject(e); });
});
check('临时成员已进房', tempEvents.some((e) => e.t === 'joined'));

const del = await api('DELETE', `/api/admin/users/${tempUid}`, null, token);
check('删除在房成员成功', del?.code === 200);

// WS 应收到 closed（含删除原因），连接被服务端断开
// 消息可能先于 DELETE 响应到达：先查缓存，再挂监听兜底
let closedEvt = tempEvents.find((e) => e.t === 'closed') || null;
if (!closedEvt) {
  closedEvt = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 5000);
    tempWs.on('message', (d) => {
      const m = JSON.parse(d.toString());
      tempEvents.push(m);
      if (m.t === 'closed') { clearTimeout(t); resolve(m); }
    });
    tempWs.on('close', () => { clearTimeout(t); resolve(tempEvents.find((e) => e.t === 'closed') || null); });
  });
}
check('被删成员立即收到 closed 通知并断开', !!closedEvt && (closedEvt.reason || '').includes('删除'));
if (!closedEvt || !(closedEvt.reason || '').includes('删除')) {
  console.log('[dbg] tempEvents:', JSON.stringify(tempEvents.map((e) => ({ t: e.t, reason: e.reason }))), '| closedEvt:', JSON.stringify(closedEvt));
}
tempWs.close();

const listAfter = await api('GET', '/api/admin/users', null, token);
check('成员列表不再包含被删用户', listAfter?.code === 200 && !listAfter.data.some((u) => u.id === tempUid));
const delAgain = await api('DELETE', `/api/admin/users/${tempUid}`, null, token);
check('重复删除返回 404', delAgain?.code === 404);

console.log(`\n结果: ${pass} 通过, ${failCount} 失败`);
process.exit(failCount ? 1 : 0);
