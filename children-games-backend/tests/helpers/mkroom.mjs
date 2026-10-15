// 临时：为浏览器实测建房间并打印 token/房间号
const post = async (path, body, token) => {
  const res = await fetch('http://localhost:3002' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};
const gameType = process.argv[2] || 'blackjack';
const config = gameType === 'zjh' ? { roundLimit: 3, career: false, timeoutFold: false } : { bankerMode: 'rotate', roundLimit: 3, career: false };
const login = await post('/api/user/login/family', { uid: 2 });
const room = await post('/api/room', { gameType, config }, login.data.token);
console.log('ROOM=' + room.data.roomId);
console.log('TOKEN=' + login.data.token);
console.log('USER=' + JSON.stringify(login.data.userInfo));
