<template>
  <div
    class="card-item"
    :class="{
      selected: selected,
      disabled: disabled,
      'is-joker': cardData.isJoker,
    }"
    :style="{ width: `${cardWidth}px`, height: `${cardHeight}px` }"
    @click="$emit('click', card)"
  >
    <div class="card-face">
      <!-- 左上角 -->
      <div class="corner corner-top" :style="{ color: cardData.color }">
        <span class="value">{{ cardData.displayName }}</span>
        <span class="suit">{{ cardData.suitSymbol }}</span>
      </div>

      <!-- 中心 -->
      <div class="center" :style="{ color: cardData.color }">
        <template v-if="cardData.isJoker">
          <span class="joker-star">★</span>
          <span class="joker-text">{{ cardData.isBigJoker ? '大' : '小' }}</span>
        </template>
        <template v-else>
          <span class="suit-large">{{ cardData.suitSymbol }}</span>
        </template>
      </div>

      <!-- 右下角（倒置） -->
      <div class="corner corner-bottom" :style="{ color: cardData.color }">
        <span class="value">{{ cardData.displayName }}</span>
        <span class="suit">{{ cardData.suitSymbol }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Card } from '../utils/types';
import { getCardRenderData, CardRenderData } from '../utils/cardRenderer';

const props = withDefaults(
  defineProps<{
    card: Card;
    selected?: boolean;
    disabled?: boolean;
    width?: number;
    height?: number;
  }>(),
  {
    selected: false,
    disabled: false,
    width: 60,
    height: 84,
  }
);

defineEmits<{
  (e: 'click', card: Card): void;
}>();

const cardData = computed<CardRenderData>(() => {
  return getCardRenderData(props.card);
});

const cardWidth = computed(() => props.width);
const cardHeight = computed(() => props.height);
</script>

<style scoped>
.card-item {
  position: relative;
  border-radius: 6px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  user-select: none;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.card-item:hover:not(.disabled) {
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.card-item.selected {
  transform: translateY(-16px);
  box-shadow: 0 6px 16px rgba(76, 175, 80, 0.4);
  border: 2px solid #4caf50;
}

.card-item.disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.card-item.is-joker {
  background: linear-gradient(135deg, #fff8e1 0%, #ffffff 100%);
}

.card-face {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  border: 1px solid #ccc;
  overflow: hidden;
}

.corner {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.corner-top {
  top: 4px;
  left: 4px;
}

.corner-bottom {
  bottom: 4px;
  right: 4px;
  transform: rotate(180deg);
}

.corner .value {
  font-size: 12px;
  font-weight: bold;
  font-family: Arial, sans-serif;
}

.corner .suit {
  font-size: 10px;
  margin-top: 1px;
}

.center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.suit-large {
  font-size: 28px;
}

.joker-star {
  font-size: 24px;
  color: #ffd700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.joker-text {
  font-size: 14px;
  font-weight: bold;
  margin-top: 4px;
}
</style>
