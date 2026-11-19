<template>
  <div class="skeleton" :class="[`skeleton--${variant}`, { 'skeleton--animate': animate }]">
    <slot>
      <!-- 默认骨架：根据 variant 渲染不同形状 -->
      <template v-if="variant === 'text'">
        <div
          v-for="i in lines"
          :key="i"
          class="skeleton-line"
          :style="{ width: lineWidth(i) }"
        ></div>
      </template>
      <div v-else-if="variant === 'card'" class="skeleton-card">
        <div class="skeleton-card__header">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-card__title">
            <div class="skeleton-line skeleton-line--short"></div>
          </div>
        </div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line skeleton-line--medium"></div>
      </div>
      <template v-else-if="variant === 'list'">
        <div v-for="i in lines" :key="i" class="skeleton-list-item">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-list-item__content">
            <div class="skeleton-line skeleton-line--short"></div>
            <div class="skeleton-line"></div>
          </div>
        </div>
      </template>
      <div v-else class="skeleton-rect" :style="{ width, height }"></div>
    </slot>
  </div>
</template>

<script setup lang="ts">
/**
 * 骨架屏组件
 * 用于页面/组件加载时占位，提升用户体验
 */
withDefaults(
  defineProps<{
    /** 骨架类型 */
    variant?: 'rect' | 'text' | 'card' | 'list';
    /** 行数（text/list 模式） */
    lines?: number;
    /** 宽度（rect 模式） */
    width?: string;
    /** 高度（rect 模式） */
    height?: string;
    /** 是否显示动画 */
    animate?: boolean;
  }>(),
  {
    variant: 'rect',
    lines: 3,
    width: '100%',
    height: '20px',
    animate: true,
  }
);

// 每行宽度递减，模拟真实文本
const lineWidth = (index: number): string => {
  const widths = ['100%', '85%', '70%', '60%', '50%'];
  return widths[(index - 1) % widths.length];
};
</script>

<style scoped>
.skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 基础骨架元素 */
.skeleton-line,
.skeleton-avatar,
.skeleton-rect,
.skeleton-card,
.skeleton-list-item {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  border-radius: 4px;
}

/* 动画效果 */
.skeleton--animate .skeleton-line,
.skeleton--animate .skeleton-avatar,
.skeleton--animate .skeleton-rect,
.skeleton--animate .skeleton-card,
.skeleton--animate .skeleton-list-item {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* 线条变体 */
.skeleton-line {
  height: 14px;
}

.skeleton-line--short {
  width: 40%;
}

.skeleton-line--medium {
  width: 70%;
}

/* 矩形变体 */
.skeleton-rect {
  min-height: 20px;
}

/* 头像 */
.skeleton-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 卡片变体 */
.skeleton-card {
  padding: 16px;
  border-radius: 12px;
}

.skeleton-card__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.skeleton-card__title {
  flex: 1;
}

/* 列表变体 */
.skeleton-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.skeleton-list-item__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 暗色模式 */
@media (prefers-color-scheme: dark) {
  .skeleton-line,
  .skeleton-avatar,
  .skeleton-rect,
  .skeleton-card,
  .skeleton-list-item {
    background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%);
  }

  .skeleton--animate .skeleton-line,
  .skeleton--animate .skeleton-avatar,
  .skeleton--animate .skeleton-rect,
  .skeleton--animate .skeleton-card,
  .skeleton--animate .skeleton-list-item {
    background: linear-gradient(90deg, #2a2a2a 25%, #3a3a3a 50%, #2a2a2a 75%);
    background-size: 200% 100%;
  }
}
</style>
