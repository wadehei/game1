<template>
  <div class="table-scene-3d" :class="{ dim: loading }">
    <div ref="containerRef" class="table-canvas"></div>
    <div v-if="loading" class="table-loading">
      <div class="spinner"></div>
      <span>牌桌上桌中…</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { createBattleTable3D, type BattleTable3D, type TableSnapshot } from './tableScene3d';
import { detectWebGL, startFpsGuard, type FpsGuard } from '@/composables/use3dGuard';

const props = defineProps<{
  /** 桌面快照（父组件响应式提供，场景每帧读取） */
  snapshot: TableSnapshot;
}>();

const emit = defineEmits<{
  /** WebGL 不可用/初始化失败/持续低帧 → 请父级切回 2D */
  (e: 'fallback'): void;
}>();

const containerRef = ref<HTMLElement | null>(null);
const loading = ref(true);

let table3d: BattleTable3D | null = null;
let fpsGuard: FpsGuard | null = null;

onMounted(async () => {
  if (!containerRef.value) return;
  if (!detectWebGL()) {
    emit('fallback');
    return;
  }
  try {
    table3d = await createBattleTable3D({
      container: containerRef.value,
      getState: () => props.snapshot,
    });
    table3d.startRenderLoop();
    loading.value = false;
    fpsGuard = startFpsGuard({ onFallback: () => emit('fallback') });
  } catch {
    emit('fallback');
  }
});

onUnmounted(() => {
  fpsGuard?.stop();
  fpsGuard = null;
  table3d?.dispose();
  table3d = null;
});
</script>

<style scoped>
.table-scene-3d {
  position: relative;
  width: 100%;
  height: 190px;
  border-radius: 12px;
  overflow: hidden;
  background: #2c3a4e;
}

.table-scene-3d.dim {
  min-height: 190px;
}

.table-canvas {
  width: 100%;
  height: 100%;
}

.table-canvas :deep(canvas) {
  display: block;
}

.table-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(44, 58, 78, 0.85);
  color: #dfe6f0;
  font-size: 13px;
}

.spinner {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #ffd54f;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
