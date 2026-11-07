<template>
  <div class="tank-wrap">
    <div class="tank-status">
      <template v-if="phase === 'ended' && final">
        <span class="tf-title">🏁 坦克对决结束</span>
      </template>
      <template v-else-if="snapshot">
        <span>
          ⚔️ 击杀 {{ myKills }} · HP {{ myHp }}/{{ maxHp }}
          <template v-if="leader"> ·领先 {{ leader.name }} {{ leader.kills }} 杀</template>
        </span>
        <span class="tank-timer">{{ Math.ceil(remainSec) }}s</span>
      </template>
      <template v-else>
        <span>等待开局…</span>
      </template>
    </div>

    <div class="canvas-box">
      <canvas ref="canvasRef" class="tank-canvas"></canvas>
      <div v-if="boomFlash" class="boom-flash">💥 {{ boomFlash }}</div>
    </div>

    <!-- 触屏操控：方向 + 开火 -->
    <div v-if="phase === 'playing'" class="tank-controls">
      <div class="dpad">
        <button
          class="dp up"
          @pointerdown.prevent="move(0)"
          @pointerup="move(-1)"
          @pointercancel="move(-1)"
          @pointerleave="move(-1)"
        >
          ▲
        </button>
        <button
          class="dp left"
          @pointerdown.prevent="move(3)"
          @pointerup="move(-1)"
          @pointercancel="move(-1)"
          @pointerleave="move(-1)"
        >
          ◀
        </button>
        <button
          class="dp right"
          @pointerdown.prevent="move(1)"
          @pointerup="move(-1)"
          @pointercancel="move(-1)"
          @pointerleave="move(-1)"
        >
          ▶
        </button>
        <button
          class="dp down"
          @pointerdown.prevent="move(2)"
          @pointerup="move(-1)"
          @pointercancel="move(-1)"
          @pointerleave="move(-1)"
        >
          ▼
        </button>
      </div>
      <button class="fire-btn" @click.stop="fire">开火</button>
    </div>

    <!-- 终局面板 -->
    <div v-if="phase === 'ended' && final" class="tank-final">
      <div class="tf-head">{{ final.reason }} · 击杀榜</div>
      <div
        v-for="(r, i) in final.ranking"
        :key="r.userId"
        class="tf-row"
        :class="{ me: r.userId === myId }"
      >
        <span class="tf-rank">{{ i + 1 }}.</span>
        <span class="tf-name"
          >{{ nameOf(r.userId) }}<template v-if="r.userId === myId">（我）</template></span
        >
        <span class="tf-score">{{ r.total }} 杀</span>
      </div>
      <div class="qf-tip">等待房主发起「再来一局」</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useUserStore } from '@/store/user';

interface TankPlayerView {
  userId: number;
  seat: number;
  x: number;
  y: number;
  dir: number;
  hp: number;
  alive: boolean;
  kills: number;
}
interface TankBulletView {
  id: number;
  ownerId: number;
  x: number;
  y: number;
  dir: number;
}
interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface TickSnapshot {
  players: TankPlayerView[];
  bullets: TankBulletView[];
  remainMs: number;
}

const props = defineProps<{
  state: unknown; // serializeFor 快照（重连兜底）
  events: Record<string, unknown>;
  members: Array<{ userId: number; nickname: string }>;
  phase: string;
  mySeat: number;
}>();

const emit = defineEmits<{ (e: 'action', action: Record<string, unknown>): void }>();

const userStore = useUserStore();
const myId = computed(() => userStore.userInfo?.id || 0);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const boomFlash = ref('');

const arena = ref<{ w: number; h: number }>({ w: 640, h: 480 });
const walls = ref<Wall[]>([]);
const tankSize = ref(34);
const snapshot = ref<TickSnapshot | null>(null);
const maxHp = ref(3);

const final = computed(
  () =>
    (props.events.final as
      { ranking: Array<{ userId: number; total: number }>; reason: string } | null | undefined) ??
    null
);
const myKills = computed(
  () => snapshot.value?.players.find((p) => p.userId === myId.value)?.kills ?? 0
);
const myHp = computed(() => snapshot.value?.players.find((p) => p.userId === myId.value)?.hp ?? 0);
const leader = computed(() => {
  const top = [...(snapshot.value?.players ?? [])].sort((a, b) => b.kills - a.kills)[0];
  if (!top || top.kills === 0) return null;
  return { name: nameOf(top.userId), kills: top.kills };
});
const remainSec = computed(() => (snapshot.value?.remainMs ?? 0) / 1000);

const nameOf = (userId: number): string =>
  props.members.find((m) => m.userId === userId)?.nickname || `角色${userId}`;

// ── 快照接入 ──
watch(
  () => props.events.tankStart,
  (m: unknown) => {
    const ev = m as {
      walls: Wall[];
      arena: { w: number; h: number };
      size: number;
      players: TankPlayerView[];
      seconds: number;
    } | null;
    if (!ev) return;
    walls.value = ev.walls;
    arena.value = ev.arena;
    tankSize.value = ev.size;
    maxHp.value = Math.max(...ev.players.map((p) => p.hp), 3);
    snapshot.value = { players: ev.players, bullets: [], remainMs: ev.seconds * 1000 };
  }
);
watch(
  () => props.events.tankTick,
  (m: unknown) => {
    if (m) snapshot.value = m as TickSnapshot;
  }
);
watch(
  () => props.events.tankBoom,
  (m: unknown) => {
    const ev = m as { userId: number; killerUserId: number; kills: number } | null;
    if (!ev) return;
    boomFlash.value =
      ev.userId === myId.value
        ? '你被击毁了！'
        : ev.killerUserId === myId.value
          ? '击毁！漂亮！'
          : '';
    setTimeout(() => (boomFlash.value = ''), 1600);
  }
);

// ── 渲染循环（rAF 常驻，快照驱动） ──
const TANK_COLORS = ['#667eea', '#e8447f', '#43c59e', '#f0a24b'];
let rafId = 0;

const render = (): void => {
  rafId = requestAnimationFrame(render);
  const canvas = canvasRef.value;
  const snap = snapshot.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = (cssW * arena.value.h) / arena.value.w;
  if (canvas.width !== Math.round(cssW * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  const scale = (cssW * dpr) / arena.value.w;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, arena.value.w, arena.value.h);
  // 底色
  ctx.fillStyle = '#eef3ea';
  ctx.fillRect(0, 0, arena.value.w, arena.value.h);
  // 墙
  ctx.fillStyle = '#8d99ae';
  for (const w of walls.value) ctx.fillRect(w.x, w.y, w.w, w.h);
  if (!snap) return;
  // 子弹
  ctx.fillStyle = '#333';
  for (const b of snap.bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // 坦克
  const S = tankSize.value;
  for (const p of snap.players) {
    const color = TANK_COLORS[p.seat % TANK_COLORS.length];
    ctx.globalAlpha = p.alive ? 1 : 0.25;
    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y, S, S);
    // 炮管
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    const cx = p.x + S / 2;
    const cy = p.y + S / 2;
    const d = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ][p.dir] as [number, number];
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + d[0] * (S / 2 + 7), cy + d[1] * (S / 2 + 7));
    ctx.stroke();
    // HP 点
    for (let i = 0; i < maxHp.value; i += 1) {
      ctx.fillStyle = i < p.hp ? '#2ecc71' : '#ddd';
      ctx.fillRect(p.x + i * 8, p.y - 8, 6, 5);
    }
    // 名字
    ctx.fillStyle = '#333';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = 1;
    ctx.fillText(p.userId === myId.value ? '我' : nameOf(p.userId), cx, p.y + S + 12);
    ctx.globalAlpha = 1;
  }
};

// ── 操控 ──
const move = (dir: number): void => {
  emit('action', { t: 'tank_move', dir });
};
const fire = (): void => {
  emit('action', { t: 'tank_fire' });
};

onMounted(() => {
  rafId = requestAnimationFrame(render);
});
onUnmounted(() => cancelAnimationFrame(rafId));
</script>

<style scoped>
.tank-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tank-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  color: #444;
  background: #f6f7fb;
  border-radius: 10px;
  padding: 8px 12px;
}

.tank-timer {
  font-weight: bold;
  color: #667eea;
}

.canvas-box {
  position: relative;
}

.tank-canvas {
  width: 100%;
  aspect-ratio: 4 / 3;
  border: 2px solid #d9dfeb;
  border-radius: 12px;
  background: #eef3ea;
  display: block;
  touch-action: none;
}

.boom-flash {
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.7);
  color: #ffd76e;
  font-size: 18px;
  font-weight: bold;
  padding: 10px 18px;
  border-radius: 12px;
  animation: boomPop 0.25s ease;
}

@keyframes boomPop {
  from {
    transform: translate(-50%, -50%) scale(0.6);
  }
  to {
    transform: translate(-50%, -50%) scale(1);
  }
}

/* ── 操控 ── */
.tank-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 6px;
}

.dpad {
  position: relative;
  width: 132px;
  height: 132px;
  flex-shrink: 0;
}

.dp {
  position: absolute;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 12px;
  background: #eef0f6;
  color: #556;
  font-size: 17px;
  cursor: pointer;
  touch-action: none;
  user-select: none;
}

.dp:active {
  background: #c9d2f2;
}

.dp.up {
  top: 0;
  left: 44px;
}

.dp.down {
  bottom: 0;
  left: 44px;
}

.dp.left {
  left: 0;
  top: 44px;
}

.dp.right {
  right: 0;
  top: 44px;
}

.fire-btn {
  width: 84px;
  height: 84px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #e8447f 0%, #c2429c 100%);
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(232, 68, 127, 0.4);
  touch-action: manipulation;
}

.fire-btn:active {
  transform: scale(0.94);
}

/* ── 终局 ── */
.tank-final {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
}

.tf-head {
  font-weight: bold;
  color: #333;
  margin-bottom: 8px;
  text-align: center;
}

.tf-row {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  font-size: 14px;
}

.tf-row.me {
  background: rgba(102, 126, 234, 0.12);
}

.tf-name {
  flex: 1;
}

.tf-score {
  font-weight: bold;
  color: #e8447f;
}

.qf-tip {
  text-align: center;
  color: #999;
  font-size: 13px;
  margin-top: 8px;
}
</style>
