<template>
  <div class="draw-wrap">
    <!-- 状态条 -->
    <div class="draw-status">
      <template v-if="phase === 'ended' && final">
        <span class="df-title">🏁 你画我猜结束</span>
      </template>
      <template v-else-if="phase === 'playing' && state?.phase === 'picking'">
        <span v-if="!(isDrawer && candidates.length)">✏️ {{ nameOf(state?.drawerSeat) }} 正在选词…（第 {{ state?.round }}/{{ state?.totalRounds }} 回合）</span>
        <span v-else class="pick-tip">选一个词来画：</span>
      </template>
      <template v-else-if="phase === 'playing' && state?.phase === 'drawing'">
        <span>
          🎨 {{ isDrawer ? '你来画！' : `${nameOf(state?.drawerSeat)} 正在画` }}
          · {{ state?.category }} · {{ state?.wordLen }} 个字
          <template v-if="hintChar"> · 💡 首字「{{ hintChar }}」</template>
          <template v-if="state?.myGuessed"> · ✅ 你已猜对</template>
        </span>
        <span class="draw-timer" :class="{ hurry: remainSec <= 10 }">{{ remainSec }}s</span>
      </template>
      <template v-else>
        <span>等待开局…</span>
      </template>
    </div>

    <!-- 画布 -->
    <div class="canvas-box">
      <canvas
        ref="canvasEl"
        class="draw-canvas"
        :class="{ drawing: canDraw }"
        @pointerdown.prevent="onDown"
        @pointermove.prevent="onMove"
        @pointerup.prevent="onUp"
        @pointercancel.prevent="onUp"
      />
      <div v-if="phase === 'playing' && isDrawer && state?.phase === 'drawing'" class="drawer-word">
        【{{ state?.word }}】
      </div>
    </div>

    <!-- 画家选词 -->
    <div v-if="phase === 'playing' && isDrawer && state?.phase === 'picking' && candidates.length" class="pick-row">
      <button v-for="(w, i) in candidates" :key="w" class="pick-btn" @click="emit('action', { t: 'draw_pick', index: i })">
        {{ w }}
      </button>
    </div>

    <!-- 画家工具条 -->
    <div v-if="phase === 'playing' && isDrawer && state?.phase === 'drawing'" class="tools">
      <button
        v-for="c in COLORS"
        :key="c"
        class="tool-color"
        :class="{ on: curColor === c }"
        :style="{ background: c }"
        @click="curColor = c"
      />
      <button
        v-for="w in [3, 6, 12]"
        :key="w"
        class="tool-width"
        :class="{ on: curWidth === w }"
        @click="curWidth = w"
      >
        <span class="w-dot" :style="{ width: w + 3 + 'px', height: w + 3 + 'px' }" />
      </button>
      <button class="tool-act" @click="emit('action', { t: 'draw_undo' })">撤销</button>
      <button class="tool-act" @click="emit('action', { t: 'draw_clear' })">清空</button>
      <button class="tool-act skip" @click="emit('action', { t: 'draw_skip' })">跳过(-2)</button>
    </div>

    <!-- 猜对名单 -->
    <div v-if="phase === 'playing' && state?.phase === 'drawing'" class="guessed-bar">
      已猜对 {{ guessedCount }} 人
      <span v-for="g in guessedNames" :key="g" class="guessed-name">{{ g }}</span>
    </div>

    <!-- 终局 -->
    <div v-if="phase === 'ended' && final" class="draw-final">
      <div class="df-title">🏁 排名</div>
      <div v-for="(r, i) in final.ranking" :key="r.userId" class="df-row" :class="{ me: r.userId === myId }">
        <span class="df-rank">{{ i + 1 }}.</span>
        <span class="df-name">{{ r.nickname }}<template v-if="r.userId === myId">（我）</template></span>
        <span class="df-score">{{ r.total }} 分</span>
      </div>
      <div class="qf-tip">等待房主发起「再来一局」</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useUserStore } from '@/store/user';

const COLORS = ['#333333', '#e74c3c', '#2980b9', '#27ae60', '#f39c12', '#8e44ad'];
const COLORS_CSS = { red: '#e74c3c', blue: '#2980b9', green: '#27ae60', yellow: '#f1c40f' } as Record<string, string>;

interface Batch {
  points: number[][];
  color: string;
  width: number;
  cont?: boolean;
}

const props = defineProps<{
  state: any; // serializeFor 输出
  events: Record<string, any>;
  members: Array<{ userId: number; nickname: string; seat: number }>;
  phase: string;
  mySeat: number;
}>();

const emit = defineEmits<{ (e: 'action', action: Record<string, unknown>): void }>();

const userStore = useUserStore();
const myId = computed(() => userStore.userInfo?.id || 0);

const isDrawer = computed(() => !!props.state?.isDrawer);
const canDraw = computed(() => isDrawer.value && props.state?.phase === 'drawing' && props.phase === 'playing');
// 猜对名单：快照带 guessedUserIds（重连恢复），guess_result 事件实时追加
const guessedIds = computed<number[]>(() => {
  const ids = new Set<number>((props.state?.guessedUserIds as number[]) || []);
  for (const g of Array.isArray(props.events.guessResult) ? props.events.guessResult : []) {
    if (g.correct) ids.add(g.userId);
  }
  return [...ids];
});
const guessedCount = computed(() => guessedIds.value.length);
const guessedNames = computed(() => guessedIds.value.map(nameOfUser));

// 终局：优先实时事件，兜底快照里的 ended 摘要（刷新/重连后事件已丢）
const final = computed<any | null>(() => props.events.final || props.state?.ended || null);
// 时间过半揭示的首字（画家不需要）
const hintChar = computed(() => (isDrawer.value ? '' : props.events.hint?.char || ''));
// 候选词用本地 ref 保存：draw_candidates 私发事件早于 game_start 到达，
// 而 game_start 会把 events 全部清空，直接读 events.candidates 会丢
const candidates = ref<any[]>([]);
watch(
  () => props.events.candidates,
  (v: any) => {
    if (Array.isArray(v) && v.length) candidates.value = v;
  },
  { immediate: true }
);
const remainSec = computed(() => Math.max(0, Math.ceil(((props.state?.deadline || 0) - Date.now()) / 1000)));

const nameOf = (seat: number): string => {
  const m = props.members?.find((x) => x.seat === seat);
  if (!m) return `座位${seat + 1}`;
  return m.userId === myId.value ? `${m.nickname}（我）` : m.nickname;
};

const nameOfUser = (userId: number): string => {
  if (userId === myId.value) return '我';
  return props.members?.find((x) => x.userId === userId)?.nickname || `角色${userId}`;
};

// ── 画布 ──
const canvasEl = ref<HTMLCanvasElement | null>(null);
const curColor = ref('#333333');
const curWidth = ref(6);
const batches = ref<Batch[]>([]); // 本地渲染用批序列
let currentBatch: Batch | null = null;
let pendingPoints: number[][] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let lastEmitAt = 0;

const ctx2d = (): CanvasRenderingContext2D | null => {
  const c = canvasEl.value;
  if (!c) return null;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  return ctx;
};

const syncCanvasSize = () => {
  const c = canvasEl.value;
  if (!c) return;
  const ratio = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== w * ratio || c.height !== h * ratio) {
    c.width = w * ratio;
    c.height = h * ratio;
  }
};

const renderAll = () => {
  syncCanvasSize();
  const c = canvasEl.value;
  const ctx = ctx2d();
  if (!c || !ctx) return;
  const W = c.width;
  const H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let prevEnd: number[] | null = null;
  for (const b of batches.value) {
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.width * (W / 400);
    ctx.beginPath();
    const pts = (b.cont && prevEnd ? [prevEnd, ...b.points] : b.points).map(([nx, ny]) => [nx * W, ny * H]);
    if (pts.length === 1) {
      const [px, py] = pts[0];
      ctx.arc(px, py, (b.width * (W / 400)) / 2, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      prevEnd = [b.points[b.points.length - 1][0], b.points[b.points.length - 1][1]];
      continue;
    }
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
    const lastPt = b.points[b.points.length - 1];
    prevEnd = [lastPt[0], lastPt[1]];
  }
};

const toNorm = (e: PointerEvent): number[] => {
  const c = canvasEl.value!;
  const rect = c.getBoundingClientRect();
  return [
    Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
  ];
};

let drawing = false;
let lastSentPoint: number[] | null = null; // 上一批发出的最后一个点：续批带上它，其他端笔迹才能无缝衔接
const onDown = (e: PointerEvent) => {
  if (!canDraw.value) return;
  drawing = true;
  lastSentPoint = null;
  const p = toNorm(e);
  currentBatch = { points: [p], color: curColor.value, width: curWidth.value, cont: false };
  batches.value.push(currentBatch);
  pendingPoints = [p]; // 落点也入队：纯点击（不成笔画）也要发给其他端显示为圆点
  renderAll();
  lastEmitAt = Date.now();
  if (!flushTimer) {
    flushTimer = setInterval(() => {
      const batch = currentBatch;
      if (!drawing || !batch || pendingPoints.length === 0) return;
      const now = Date.now();
      if (now - lastEmitAt < 100) return; // 10Hz
      lastEmitAt = now;
      const points = lastSentPoint ? [lastSentPoint, ...pendingPoints] : pendingPoints;
      lastSentPoint = pendingPoints[pendingPoints.length - 1];
      pendingPoints = [];
      emit('action', { t: 'draw_stroke', points, color: batch.color, width: batch.width });
    }, 100);
  }
};

const onMove = (e: PointerEvent) => {
  if (!drawing || !canDraw.value) return;
  const p = toNorm(e);
  if (!currentBatch) return;
  const last = currentBatch.points[currentBatch.points.length - 1];
  if (last && Math.abs(last[0] - p[0]) + Math.abs(last[1] - p[1]) < 0.002) return;
  currentBatch.points.push(p);
  pendingPoints.push(p);
  renderAll();
};

const onUp = () => {
  if (!drawing) return;
  drawing = false;
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  // 把余下的点补发（带上衔接点，服务端每批独立存档，快照重放可还原完整笔迹）
  if (currentBatch && pendingPoints.length > 0) {
    const pts = lastSentPoint ? [lastSentPoint, ...pendingPoints] : pendingPoints;
    emit('action', { t: 'draw_stroke', points: pts, color: currentBatch.color, width: currentBatch.width });
  }
  pendingPoints = [];
  currentBatch = null;
  lastSentPoint = null;
  renderAll();
};

// ── 事件 → 渲染列表 ──
watch(
  () => props.events.stroke,
  (m: any) => {
    if (!m?.stroke) return;
    batches.value.push(m.stroke);
    renderAll();
  }
);
watch(
  () => props.events.undo,
  () => {
    batches.value.pop();
    renderAll();
  }
);
watch(
  () => props.events.clear,
  () => {
    batches.value = [];
    renderAll();
  }
);
// 快照带全量笔迹（重连/新进重放）
watch(
  () => props.state?.strokes,
  (strokes: any) => {
    if (Array.isArray(strokes)) {
      batches.value = strokes;
      renderAll();
    }
  },
  { deep: false }
);
// 新回合清空画布与候选词（仅真实 round 事件触发；game_start 置 null 时不清，候选词本地副本要保留）
watch(
  () => props.events.round,
  (m: any) => {
    if (!m) return;
    batches.value = [];
    candidates.value = [];
    renderAll();
  }
);
// 倒计时刷新
const tick = ref(0);
let tickTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  tickTimer = setInterval(() => (tick.value += 1), 500);
  syncCanvasSize();
  renderAll();
});
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
  if (flushTimer) clearInterval(flushTimer);
});
watch(tick, () => {
  if (props.state?.phase === 'drawing') renderAll();
});
</script>

<style scoped>
.draw-wrap {
  background: #fff;
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 10px;
}

.draw-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #555;
  margin-bottom: 8px;
}

.draw-timer {
  font-weight: bold;
  color: #667eea;
}

.draw-timer.hurry {
  color: #e74c3c;
}

.canvas-box {
  position: relative;
}

.draw-canvas {
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #fffdf7;
  border: 2px solid #e8e0cd;
  border-radius: 12px;
  touch-action: none;
  display: block;
}

.draw-canvas.drawing {
  cursor: crosshair;
}

.drawer-word {
  position: absolute;
  top: 8px;
  right: 10px;
  background: rgba(102, 126, 234, 0.9);
  color: #fff;
  font-size: 13px;
  font-weight: bold;
  padding: 3px 10px;
  border-radius: 10px;
}

.tools {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.tool-color {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid transparent;
  cursor: pointer;
}

.tool-color.on {
  border-color: #667eea;
}

.tool-width {
  border: none;
  background: #f0f2f5;
  border-radius: 8px;
  padding: 0 10px;
  height: 26px;
  display: flex;
  align-items: center;
  cursor: pointer;
}

.tool-width.on {
  background: #eef1fd;
}

.w-dot {
  border-radius: 50%;
  background: #333;
  display: block;
}

.tool-act {
  border: 1px solid #e3e8ef;
  background: #fff;
  color: #666;
  font-size: 12px;
  padding: 5px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.tool-act.skip {
  color: #e74c3c;
}

.guessed-bar {
  margin-top: 8px;
  font-size: 12px;
  color: #27ae60;
}

.guessed-name {
  background: #e9f7ef;
  border-radius: 8px;
  padding: 1px 8px;
  margin-left: 6px;
}

.draw-final .df-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin-bottom: 10px;
}

.df-row {
  display: flex;
  gap: 10px;
  background: #f8f9fb;
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 6px;
}

.df-row.me {
  border: 2px solid #667eea;
}

.df-rank {
  width: 24px;
  color: #888;
}

.df-name {
  flex: 1;
  text-align: left;
  font-size: 14px;
  color: #333;
}

.df-score {
  font-weight: bold;
  color: #667eea;
}

.qf-tip {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
}
.pick-tip {
  color: #667eea;
  font-weight: bold;
}

.pick-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.pick-btn {
  flex: 1;
  border: 2px solid #667eea;
  background: #eef1fd;
  color: #333;
  font-size: 14px;
  font-weight: bold;
  padding: 10px;
  border-radius: 10px;
  cursor: pointer;
}
</style>
