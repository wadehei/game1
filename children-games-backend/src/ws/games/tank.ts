// 多人坦克 v1 handler：服务器权威 10Hz tick，输入意图式移动（dir 边沿触发），射击冷却+弹上限
// 竞技类：局终按击杀排名走 game_over 统一积分结算（30/15/5）；掉线玩家停移动，60s 判离场由 wsServer 处置
import type { Room, Member } from '../roomManager';
import { addTimer, getRoom } from '../roomManager';
import type { ActionResult, GameHandler } from './types';
import { getRoomBus } from '../bus';
import { getSeatedPlayers, buildRanking } from './helpers';

const TICK_MS = 100; // 服务器 tick 周期
const TANK_SPEED = 130; // 坦克速度（单位/秒）
const BULLET_SPEED = 260; // 子弹速度（单位/秒）
const TANK_SIZE = 34;
const FIRE_COOLDOWN_MS = 600;
const MAX_LIVE_BULLETS = 3; // 每人同时在场弹上限
const MAX_HP = 3;
const RESPAWN_MS = 3000;
const MATCH_SECONDS = Math.max(8, Number(process.env.TANK_MATCH_SECONDS) || 180);
const KILL_TARGET = 10; // 先到 10 杀提前终局

const ARENA_W = 640;
const ARENA_H = 480;

/**
 * 地图集（v2 轮换）：每张图的上下/左右出生走廊（坦克 34px）必须畅通——
 * 上走廊 y30~64、下走廊 y416~450、左列 x30~64、右列 x576~610，摆障碍前先对照
 */
const MAPS: Array<Array<{ x: number; y: number; w: number; h: number }>> = [
  [
    // 经典：中央竖墙 + 两侧横墙
    { x: 280, y: 90, w: 80, h: 300 },
    { x: 110, y: 215, w: 120, h: 50 },
    { x: 410, y: 215, w: 120, h: 50 },
  ],
  [
    // 四柱：中央四块柱子
    { x: 150, y: 130, w: 80, h: 80 },
    { x: 410, y: 130, w: 80, h: 80 },
    { x: 150, y: 270, w: 80, h: 80 },
    { x: 410, y: 270, w: 80, h: 80 },
  ],
  [
    // 双闸：两段错位竖墙 + 中央横墙
    { x: 200, y: 80, w: 50, h: 180 },
    { x: 390, y: 220, w: 50, h: 180 },
    { x: 280, y: 215, w: 80, h: 50 },
  ],
];
const POWERUP_MS = Math.max(500, Number(process.env.TANK_POWERUP_MS) || 8000);
const POWERUP_SIZE = 26;
const POWERUP_TTL_MS = 15000;
const RAPID_MS = 10000; // 快速开火持续时长（冷却减半）

const SPAWNS = [
  { x: 30, y: 30, dir: 1 }, // 左上，朝右
  { x: ARENA_W - TANK_SIZE - 30, y: 30, dir: 3 }, // 右上，朝左
  { x: 30, y: ARENA_H - TANK_SIZE - 30, dir: 1 }, // 左下
  { x: ARENA_W - TANK_SIZE - 30, y: ARENA_H - TANK_SIZE - 30, dir: 3 }, // 右下
];

/** dir: 0=上 1=右 2=下 3=左 */
const DIR_VEC: Array<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

interface TankPlayer {
  seat: number;
  x: number;
  y: number;
  dir: number; // 朝向
  intent: number; // 移动意图：-1 停 / 0~3 方向
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  respawnAt: number; // 0=无需复活
  lastFireAt: number;
  rapidUntil: number; // 快速开火截止时间戳（0=无）
}

interface Bullet {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  dir: number;
}

interface Powerup {
  id: number;
  kind: 'heal' | 'rapid';
  x: number;
  y: number;
  expireAt: number;
}

interface TankState {
  started: boolean;
  endAt: number; // 开局时间戳+时长
  tickTimer: NodeJS.Timeout | null;
  walls: Array<{ x: number; y: number; w: number; h: number }>;
  players: Map<number, TankPlayer>;
  bullets: Bullet[];
  bulletSeq: number;
  powerups: Powerup[];
  powerupSeq: number;
  nextPowerupAt: number;
  ranking: Array<{ userId: number; nickname: string; total: number; seat: number }> | null;
}

const hitRect = (
  x: number,
  y: number,
  w: number,
  h: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean => x < rx + rw && x + w > rx && y < ry + rh && y + h > ry;

/** 坦克与墙/边界是否重叠 */
const collides = (
  x: number,
  y: number,
  walls: Array<{ x: number; y: number; w: number; h: number }>
): boolean => {
  if (x < 0 || y < 0 || x + TANK_SIZE > ARENA_W || y + TANK_SIZE > ARENA_H) return true;
  return walls.some((w) => hitRect(x, y, TANK_SIZE, TANK_SIZE, w.x, w.y, w.w, w.h));
};

/** 子弹点是否撞墙/出界 */
const bulletBlocked = (
  x: number,
  y: number,
  walls: Array<{ x: number; y: number; w: number; h: number }>
): boolean => {
  if (x < 0 || y < 0 || x > ARENA_W || y > ARENA_H) return true;
  return walls.some((w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h);
};

const playerPayload = (st: TankState) =>
  [...st.players.entries()].map(([userId, p]) => ({
    userId,
    seat: p.seat,
    x: Math.round(p.x),
    y: Math.round(p.y),
    dir: p.dir,
    hp: p.hp,
    alive: p.alive,
    kills: p.kills,
  }));

const tickPayload = (st: TankState) => ({
  t: 'tank_tick',
  players: playerPayload(st),
  bullets: st.bullets.map((b) => ({
    id: b.id,
    ownerId: b.ownerId,
    x: Math.round(b.x),
    y: Math.round(b.y),
    dir: b.dir,
  })),
  powerups: st.powerups.map((u) => ({
    id: u.id,
    kind: u.kind,
    x: Math.round(u.x),
    y: Math.round(u.y),
  })),
  remainMs: Math.max(0, st.endAt - Date.now()),
});

const aliveCount = (st: TankState): number =>
  [...st.players.values()].filter((p) => p.alive).length;

/** 局终：击杀排名 → tank_final + game_over（积分统一结算挂点） */
const finish = (room: Room, st: TankState, reason: string): void => {
  if (st.tickTimer) {
    clearInterval(st.tickTimer);
    st.tickTimer = null;
  }
  room.phase = 'ended';
  st.ranking = buildRanking(getSeatedPlayers(room), (m) => ({
    score: st.players.get(m.userId)?.kills ?? 0,
  })) as unknown as Array<{ userId: number; nickname: string; total: number; seat: number }>;
  const bus = getRoomBus();
  bus.broadcast(room, { t: 'tank_final', ranking: st.ranking, reason });
  bus.broadcast(room, { t: 'game_over', winnerSeat: st.ranking[0]?.seat ?? -1, reason });
};

/** 单次 tick：移动→子弹→复活→终局判定→广播 */
const tick = (room: Room): void => {
  const r = getRoom(room.id);
  if (!r || r.phase !== 'playing') return;
  const st = r.game as TankState;
  const bus = getRoomBus();
  const dt = TICK_MS / 1000;

  // 1) 坦克移动（轴分离碰撞）
  for (const p of st.players.values()) {
    if (!p.alive) continue;
    if (p.intent < 0) continue;
    p.dir = p.intent;
    const [dx, dy] = DIR_VEC[p.intent];
    const nx = p.x + dx * TANK_SPEED * dt;
    const ny = p.y + dy * TANK_SPEED * dt;
    if (!collides(nx, p.y, st.walls)) p.x = nx;
    if (!collides(p.x, ny, st.walls)) p.y = ny;
  }

  // 2) 子弹推进 + 碰撞
  const survivors: Bullet[] = [];
  outer: for (const b of st.bullets) {
    const [dx, dy] = DIR_VEC[b.dir];
    b.x += dx * BULLET_SPEED * dt;
    b.y += dy * BULLET_SPEED * dt;
    if (bulletBlocked(b.x, b.y, st.walls)) continue; // 撞墙消失
    for (const [uid, p] of st.players) {
      if (!p.alive || uid === b.ownerId) continue;
      if (hitRect(b.x, b.y, 4, 4, p.x, p.y, TANK_SIZE, TANK_SIZE)) {
        p.hp -= 1;
        if (p.hp <= 0) {
          p.alive = false;
          p.deaths += 1;
          p.respawnAt = Date.now() + RESPAWN_MS;
          const killer = st.players.get(b.ownerId);
          if (killer) killer.kills += 1;
          bus.broadcast(r, {
            t: 'tank_boom',
            userId: uid,
            killerUserId: b.ownerId,
            kills: killer?.kills ?? 0,
            respawnMs: RESPAWN_MS,
          });
        } else {
          bus.broadcast(r, { t: 'tank_hit', userId: uid, hp: p.hp, byUserId: b.ownerId });
        }
        continue outer;
      }
    }
    survivors.push(b);
  }
  st.bullets = survivors.filter((b) => st.players.has(b.ownerId));

  // 3) 复活
  const now = Date.now();
  for (const p of st.players.values()) {
    if (!p.alive && p.respawnAt > 0 && now >= p.respawnAt) {
      const spawn = SPAWNS[st.players.size === 2 ? (p.seat === 0 ? 0 : 1) : p.seat % SPAWNS.length];
      p.x = spawn.x;
      p.y = spawn.y;
      p.dir = spawn.dir;
      p.intent = -1;
      p.hp = MAX_HP;
      p.alive = true;
      p.respawnAt = 0;
      p.rapidUntil = 0;
    }
  }

  // 3.5) 道具：过期清理 → 生成（首个固定在上走廊中央，便于学习拾取）→ 碰撞拾取
  st.powerups = st.powerups.filter((u) => u.expireAt > now);
  if (now >= st.nextPowerupAt && st.powerups.length < 3) {
    st.nextPowerupAt = now + POWERUP_MS;
    const fixed = st.powerupSeq === 0;
    let ux = 0;
    let uy = 0;
    let ok = false;
    for (let tries = 0; tries < 24 && !ok; tries += 1) {
      if (fixed) {
        ux = 300;
        uy = 40; // 上走廊中央（三张图均畅通）
      } else {
        ux = 70 + Math.random() * (ARENA_W - 140 - POWERUP_SIZE);
        uy = 70 + Math.random() * (ARENA_H - 140 - POWERUP_SIZE);
      }
      ok =
        !bulletBlocked(ux + POWERUP_SIZE / 2, uy + POWERUP_SIZE / 2, st.walls) &&
        ![...st.players.values()].some(
          (p) =>
            p.alive && hitRect(ux, uy, POWERUP_SIZE, POWERUP_SIZE, p.x, p.y, TANK_SIZE, TANK_SIZE)
        ) &&
        !st.powerups.some((u) =>
          hitRect(ux, uy, POWERUP_SIZE, POWERUP_SIZE, u.x, u.y, POWERUP_SIZE, POWERUP_SIZE)
        );
      if (fixed) break;
    }
    if (ok) {
      st.powerupSeq += 1;
      st.powerups.push({
        id: st.powerupSeq,
        kind: fixed ? 'rapid' : Math.random() < 0.5 ? 'heal' : 'rapid',
        x: ux,
        y: uy,
        expireAt: now + POWERUP_TTL_MS,
      });
    }
  }
  for (const [uid, p] of st.players) {
    if (!p.alive) continue;
    const idx = st.powerups.findIndex((u) =>
      hitRect(p.x, p.y, TANK_SIZE, TANK_SIZE, u.x, u.y, POWERUP_SIZE, POWERUP_SIZE)
    );
    if (idx < 0) continue;
    const u = st.powerups[idx];
    st.powerups.splice(idx, 1);
    if (u.kind === 'heal') {
      p.hp = Math.min(MAX_HP, p.hp + 1);
    } else {
      p.rapidUntil = now + RAPID_MS;
    }
    bus.broadcast(r, { t: 'tank_pickup', userId: uid, kind: u.kind });
  }

  // 4) 终局判定：时间到 或 有人达到击杀目标
  let top: TankPlayer | null = null;
  for (const p of st.players.values()) {
    if (!top || p.kills > top.kills) top = p;
  }
  if (now >= st.endAt || (top && top.kills >= KILL_TARGET)) {
    finish(r, st, now >= st.endAt ? '时间到' : '达成击杀目标');
    return;
  }

  // 5) 广播快照
  bus.broadcast(r, tickPayload(st));
};

export const tankHandler: GameHandler<TankState> = {
  type: 'tank',
  title: '坦克对决',
  emoji: '🛡️',
  desc: '多人实时坦克大战，击杀多为王，积分随账号永久跟随',
  minPlayers: 2,
  maxPlayers: 4,
  allowSpectators: true,
  rematchSwapSeats: false,
  validActions: new Set(['tank_move', 'tank_fire']),

  create(): TankState {
    return {
      started: false,
      endAt: 0,
      tickTimer: null,
      walls: MAPS[0],
      players: new Map(),
      bullets: [],
      bulletSeq: 0,
      powerups: [],
      powerupSeq: 0,
      nextPowerupAt: 0,
      ranking: null,
    };
  },

  start(room): ActionResult | void {
    const st = room.game as TankState;
    if (st.started) return;
    st.started = true;
    st.walls = MAPS[Math.floor(Math.random() * MAPS.length)];
    const players = getSeatedPlayers(room);
    st.players = new Map();
    st.bullets = [];
    st.powerups = [];
    st.powerupSeq = 0;
    st.nextPowerupAt = Date.now() + POWERUP_MS;
    players.forEach((m, i) => {
      const spawn = SPAWNS[i % SPAWNS.length];
      st.players.set(m.userId, {
        seat: m.seat,
        x: spawn.x,
        y: spawn.y,
        dir: spawn.dir,
        intent: -1,
        hp: MAX_HP,
        alive: true,
        kills: 0,
        deaths: 0,
        respawnAt: 0,
        lastFireAt: 0,
        rapidUntil: 0,
      });
    });
    st.endAt = Date.now() + MATCH_SECONDS * 1000;
    getRoomBus().broadcast(room, {
      t: 'tank_start',
      seconds: MATCH_SECONDS,
      walls: st.walls,
      arena: { w: ARENA_W, h: ARENA_H },
      size: TANK_SIZE,
      players: playerPayload(st),
    });
    // 10Hz tick：登记到房间定时器，销毁统一清理（clearTimeout 对 interval 句柄同样生效）
    const timer = setInterval(() => tick(room), TICK_MS);
    st.tickTimer = timer;
    addTimer(room, timer);
  },

  onPlayerQuit(room: Room, member: Member): ActionResult | void {
    const st = room.game as TankState;
    st.players.delete(member.userId);
    st.bullets = st.bullets.filter((b) => b.ownerId !== member.userId);
    const remaining = getSeatedPlayers(room);
    if (remaining.length < 2 && room.phase === 'playing') {
      finish(room, st, '人数不足，提前结束');
      return { ended: { winnerSeat: st.ranking?.[0]?.seat ?? -1, reason: '人数不足，提前结束' } };
    }
    return undefined;
  },

  onMemberOffline(room: Room, member: Member): void {
    const st = room.game as TankState;
    const p = st.players.get(member.userId);
    if (p) p.intent = -1; // 掉线即停车，60s 判离场由 wsServer 处置
  },

  onAction(
    room: Room,
    member: Member,
    action: string,
    payload: Record<string, unknown>
  ): ActionResult {
    const st = room.game as TankState;
    if (room.phase !== 'playing') return { error: '对局未在进行中' };
    const p = st.players.get(member.userId);
    if (!p) return { error: '你不在本场对局中' };

    if (action === 'tank_move') {
      const dir = Math.trunc(Number(payload?.dir));
      p.intent = dir >= 0 && dir <= 3 ? dir : -1;
      return {};
    }
    if (action === 'tank_fire') {
      if (!p.alive) return { error: '复活中' };
      const now = Date.now();
      const cooldown = now < p.rapidUntil ? FIRE_COOLDOWN_MS / 2 : FIRE_COOLDOWN_MS;
      if (now - p.lastFireAt < cooldown) return {};
      if (st.bullets.filter((b) => b.ownerId === member.userId).length >= MAX_LIVE_BULLETS)
        return {};
      p.lastFireAt = now;
      if (p.intent >= 0) p.dir = p.intent;
      const [dx, dy] = DIR_VEC[p.dir];
      st.bulletSeq += 1;
      st.bullets.push({
        id: st.bulletSeq,
        ownerId: member.userId,
        x: p.x + TANK_SIZE / 2 + dx * (TANK_SIZE / 2 + 4),
        y: p.y + TANK_SIZE / 2 + dy * (TANK_SIZE / 2 + 4),
        dir: p.dir,
      });
      return {};
    }
    return { error: '未知的游戏操作' };
  },

  serializeFor(room: Room, _viewer: Member): Record<string, unknown> {
    const st = room.game as TankState;
    return {
      ...tickPayload(st),
      started: st.started,
      walls: st.walls,
      arena: { w: ARENA_W, h: ARENA_H },
      size: TANK_SIZE,
      killTarget: KILL_TARGET,
      ended: st.ranking ? { ranking: st.ranking } : null,
    };
  },
};
