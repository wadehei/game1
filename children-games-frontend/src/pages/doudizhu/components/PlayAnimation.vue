<template>
  <Transition
    :name="transitionName"
    @before-enter="onBeforeEnter"
    @enter="onEnter"
    @after-enter="onAfterEnter"
    @before-leave="onBeforeLeave"
    @leave="onLeave"
    @after-leave="onAfterLeave"
  >
    <div v-if="visible" class="play-animation" :style="containerStyle">
      <CardItem
        v-for="(card, index) in cards"
        :key="card.id"
        :card="card"
        :width="cardWidth"
        :height="cardHeight"
        :style="getCardStyle(index)"
        class="animated-card"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Card, CardPattern } from '../utils/types';
import CardItem from './CardItem.vue';

const props = withDefaults(
  defineProps<{
    cards: Card[];
    visible: boolean;
    fromPosition?: { x: number; y: number };
    toPosition?: { x: number; y: number };
    pattern?: CardPattern;
    cardWidth?: number;
    cardHeight?: number;
    duration?: number;
  }>(),
  {
    fromPosition: () => ({ x: 0, y: 0 }),
    toPosition: () => ({ x: 0, y: 0 }),
    cardWidth: 50,
    cardHeight: 70,
    duration: 300,
  }
);

const emit = defineEmits<{
  (e: 'animation-start'): void;
  (e: 'animation-end'): void;
}>();

const transitionName = ref('play');
const animationPhase = ref<'idle' | 'entering' | 'visible' | 'leaving'>('idle');

const containerStyle = computed(() => {
  if (animationPhase.value === 'entering') {
    return {
      transform: `translate(${props.toPosition.x - props.fromPosition.x}px, ${props.toPosition.y - props.fromPosition.y}px)`,
      transition: `transform ${props.duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
    };
  }
  return {};
});

const getCardStyle = (index: number) => {
  const offset = (index - (props.cards.length - 1) / 2) * 25;
  return {
    marginLeft: index > 0 ? '-20px' : '0',
    transform: `translateX(${offset}px)`,
    transition: `transform ${props.duration}ms ease-out ${index * 30}ms`,
  };
};

// 特殊牌型效果
const getSpecialEffect = (): string => {
  switch (props.pattern) {
    case CardPattern.Bomb:
      return 'bomb-effect';
    case CardPattern.Rocket:
      return 'rocket-effect';
    case CardPattern.Straight:
    case CardPattern.StraightPair:
      return 'straight-effect';
    case CardPattern.Airplane:
    case CardPattern.AirplaneWithSingles:
    case CardPattern.AirplaneWithPairs:
      return 'airplane-effect';
    case CardPattern.FourWithTwo:
    case CardPattern.FourWithTwoPairs:
      return 'four-effect';
    default:
      return '';
  }
};

const onBeforeEnter = (el: Element) => {
  animationPhase.value = 'entering';
  emit('animation-start');

  const htmlEl = el as HTMLElement;
  htmlEl.style.transform = `translate(${props.fromPosition.x - props.toPosition.x}px, ${props.fromPosition.y - props.toPosition.y}px) scale(0.5)`;
  htmlEl.style.opacity = '0';
};

const onEnter = (el: Element, done: () => void) => {
  const htmlEl = el as HTMLElement;

  // 强制重排
  void htmlEl.offsetHeight;

  htmlEl.style.transform = 'translate(0, 0) scale(1)';
  htmlEl.style.opacity = '1';

  setTimeout(done, props.duration);
};

const onAfterEnter = () => {
  animationPhase.value = 'visible';
};

const onBeforeLeave = (el: Element) => {
  animationPhase.value = 'leaving';
};

const onLeave = (el: Element, done: () => void) => {
  const htmlEl = el as HTMLElement;
  htmlEl.style.transform = 'scale(0.5)';
  htmlEl.style.opacity = '0';

  setTimeout(done, props.duration);
};

const onAfterLeave = () => {
  animationPhase.value = 'idle';
  emit('animation-end');
};

// 监听牌型变化，应用特殊效果
watch(
  () => props.pattern,
  (newPattern) => {
    if (newPattern === CardPattern.Bomb) {
      transitionName.value = 'bomb';
    } else if (newPattern === CardPattern.Rocket) {
      transitionName.value = 'rocket';
    } else if (
      newPattern === CardPattern.Airplane ||
      newPattern === CardPattern.AirplaneWithSingles ||
      newPattern === CardPattern.AirplaneWithPairs
    ) {
      transitionName.value = 'airplane';
    } else {
      transitionName.value = 'play';
    }
  }
);
</script>

<style scoped>
.play-animation {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.animated-card {
  will-change: transform;
}

/* 普通出牌动画 */
.play-enter-active,
.play-leave-active {
  transition: all 0.3s ease;
}

.play-enter-from {
  opacity: 0;
  transform: translateY(50px) scale(0.8);
}

.play-leave-to {
  opacity: 0;
  transform: translateY(-50px) scale(0.8);
}

/* 炸弹动画 */
.bomb-enter-active {
  animation: bombIn 0.5s ease-out;
}

.bomb-leave-active {
  animation: bombOut 0.3s ease-in;
}

@keyframes bombIn {
  0% {
    opacity: 0;
    transform: scale(0.3) rotate(-10deg);
  }
  50% {
    transform: scale(1.2) rotate(5deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

@keyframes bombOut {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.5);
  }
}

/* 火箭动画 */
.rocket-enter-active {
  animation: rocketIn 0.6s ease-out;
}

@keyframes rocketIn {
  0% {
    opacity: 0;
    transform: translateY(100px) scale(0.5);
  }
  50% {
    transform: translateY(-20px) scale(1.1);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 顺子动画 */
.straight-enter-active .animated-card {
  animation: cardFlip 0.4s ease-out backwards;
}

@keyframes cardFlip {
  0% {
    opacity: 0;
    transform: rotateY(90deg);
  }
  100% {
    opacity: 1;
    transform: rotateY(0);
  }
}

/* 飞机动画 - 波浪式入场 */
.airplane-enter-active {
  animation: airplaneIn 0.6s ease-out;
}

.airplane-enter-active .animated-card {
  animation: airplaneCard 0.5s ease-out backwards;
}

@keyframes airplaneIn {
  0% {
    opacity: 0;
    transform: translateX(-100px) rotate(-5deg);
  }
  50% {
    transform: translateX(10px) rotate(2deg);
  }
  100% {
    opacity: 1;
    transform: translateX(0) rotate(0);
  }
}

@keyframes airplaneCard {
  0% {
    opacity: 0;
    transform: translateY(-30px) scale(0.8);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 四带二动画 - 中心爆发 */
.four-effect .animated-card:nth-child(1),
.four-effect .animated-card:nth-child(2),
.four-effect .animated-card:nth-child(3),
.four-effect .animated-card:nth-child(4) {
  animation: fourBurst 0.4s ease-out;
}

@keyframes fourBurst {
  0% {
    opacity: 0;
    transform: scale(0) rotate(180deg);
  }
  60% {
    transform: scale(1.1) rotate(-10deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0);
  }
}

/* 炸弹增强效果 - 屏幕震动 */
.bomb-effect {
  animation: screenShake 0.3s ease-out;
}

@keyframes screenShake {
  0%,
  100% {
    transform: translate(0, 0);
  }
  10% {
    transform: translate(-5px, -5px);
  }
  20% {
    transform: translate(5px, -5px);
  }
  30% {
    transform: translate(-5px, 5px);
  }
  40% {
    transform: translate(5px, 5px);
  }
  50% {
    transform: translate(-3px, -3px);
  }
  60% {
    transform: translate(3px, -3px);
  }
  70% {
    transform: translate(-3px, 3px);
  }
  80% {
    transform: translate(3px, 3px);
  }
  90% {
    transform: translate(-1px, -1px);
  }
}

/* 火箭增强效果 - 火焰拖尾 */
.rocket-effect::before {
  content: '';
  position: absolute;
  bottom: -20px;
  left: 50%;
  width: 40px;
  height: 60px;
  background: linear-gradient(
    to top,
    rgba(255, 100, 0, 0.8) 0%,
    rgba(255, 200, 0, 0.6) 40%,
    rgba(255, 255, 100, 0.4) 70%,
    transparent 100%
  );
  transform: translateX(-50%);
  animation: flameFlicker 0.15s infinite alternate;
  border-radius: 50% 50% 20% 20%;
  filter: blur(3px);
}

@keyframes flameFlicker {
  0% {
    opacity: 0.8;
    transform: translateX(-50%) scaleY(1) scaleX(1);
  }
  100% {
    opacity: 1;
    transform: translateX(-48%) scaleY(1.1) scaleX(0.9);
  }
}

/* 最后一张牌发光效果 */
.last-card-glow {
  animation: lastCardPulse 1s ease-in-out infinite;
}

@keyframes lastCardPulse {
  0%,
  100% {
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
  }
  50% {
    box-shadow:
      0 0 25px rgba(255, 215, 0, 0.9),
      0 0 40px rgba(255, 165, 0, 0.5);
  }
}
</style>
