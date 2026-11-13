<template>
  <div class="doudizhu-3d-demo">
    <div ref="containerRef" class="table-container"></div>

    <div class="overlay-ui">
      <div class="info-panel">
        <h3>🃏 斗地主 3D 原型</h3>
        <p>这是一个 3D 牌桌的原型演示</p>
        <p class="tech">技术栈: Three.js + Vue 3</p>
      </div>

      <div class="controls">
        <button :disabled="isDealing" @click="demoDeal">
          {{ isDealing ? '发牌中...' : '发牌演示' }}
        </button>
        <button @click="resetScene">重置场景</button>
        <button @click="goBack">返回 2D 版本</button>
      </div>
    </div>

    <div v-if="isLoading" class="loading">
      <div class="spinner"></div>
      <p>加载 3D 场景中...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { DoudizhuTable3D, createTable3D } from '../utils/table3d';

const router = useRouter();
const containerRef = ref<HTMLElement | null>(null);
const isLoading = ref(true);
const isDealing = ref(false);

let table3d: DoudizhuTable3D | null = null;

const demoDeal = async () => {
  if (!table3d || isDealing.value) return;

  isDealing.value = true;

  // 创建3副牌（每人17张）
  const playerCards = [];

  for (let p = 0; p < 3; p++) {
    const cards = [];
    for (let i = 0; i < 17; i++) {
      const value = 3 + (i % 13);
      const suit = Math.floor(Math.random() * 4);
      const faceUp = p === 0; // 只有玩家牌面朝上
      const card = table3d.createCard(value, suit, faceUp);
      cards.push(card);
    }
    playerCards.push(cards);
  }

  await table3d.dealCardsAnimation(playerCards);
  isDealing.value = false;
};

const resetScene = () => {
  if (!table3d) return;

  // 清理所有牌
  // 重新初始化
  demoDeal();
};

const goBack = () => {
  router.push('/doudizhu');
};

onMounted(() => {
  if (!containerRef.value) return;

  // 检查 Three.js 是否可用
  if (typeof THREE === 'undefined') {
    console.warn('Three.js 未加载，3D 功能不可用');
    isLoading.value = false;
    return;
  }

  try {
    table3d = createTable3D({
      container: containerRef.value,
      onViewChange: (camera) => {
        // 可以在这里更新 UI 元素位置
      },
    });

    table3d.startRenderLoop();
    isLoading.value = false;
  } catch (e) {
    console.error('3D 初始化失败:', e);
    isLoading.value = false;
  }
});

onUnmounted(() => {
  if (table3d) {
    table3d.dispose();
    table3d = null;
  }
});
</script>

<style scoped>
.doudizhu-3d-demo {
  position: relative;
  width: 100%;
  height: 100vh;
  background: #1b5e20;
  overflow: hidden;
}

.table-container {
  width: 100%;
  height: 100%;
}

.overlay-ui {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
}

.info-panel {
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 15px 20px;
  border-radius: 12px;
  pointer-events: auto;
}

.info-panel h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.info-panel p {
  margin: 4px 0;
  font-size: 13px;
  opacity: 0.8;
}

.info-panel .tech {
  color: #4caf50;
  font-family: monospace;
}

.controls {
  display: flex;
  gap: 10px;
  pointer-events: auto;
}

.controls button {
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  background: #4caf50;
  color: white;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.controls button:hover:not(:disabled) {
  background: #66bb6a;
  transform: translateY(-2px);
}

.controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  color: white;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
