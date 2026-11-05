<template>
  <div class="math-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="engine.headerItems.value"
      :muted="engine.sounds.isMuted.value"
      header-class="math-header"
      level-selectable
      @toggle-sound="engine.sounds.toggleSound"
      @go-back="router.back()"
      @select-level="engine.openLevelSelect"
    />

    <!-- 计时展示 -->
    <div class="timer-bar">⏱️ {{ engine.timeCost.value }} 秒</div>

    <!-- 小怪兽 + 题目 -->
    <div class="monster-area">
      <div class="monster" :class="engine.monsterState.value">👾</div>
      <div class="bubble">{{ engine.hintText.value }}</div>
    </div>

    <!-- 苹果演示区 -->
    <div class="visual-area">
      <template v-if="engine.question.value.mode === 'count'">
        <div class="apple-group">
          <span v-for="n in engine.question.value.countA" :key="n" class="apple">{{
            engine.question.value.icon
          }}</span>
        </div>
      </template>
      <template v-else>
        <div class="apple-group">
          <span v-for="n in engine.question.value.countA" :key="'a' + n" class="apple">{{
            engine.question.value.icon
          }}</span>
        </div>
        <span class="math-sign">{{ engine.question.value.subtract ? '-' : '+' }}</span>
        <div class="apple-group">
          <span
            v-for="n in engine.question.value.countB"
            :key="'b' + n"
            class="apple"
            :style="
              engine.question.value.subtract && n <= engine.question.value.countB
                ? 'opacity:0.25'
                : ''
            "
            >{{ engine.question.value.icon }}</span
          >
        </div>
      </template>
    </div>

    <!-- 选项 -->
    <div class="options">
      <button
        v-for="option in engine.question.value.options"
        :key="option"
        class="option-btn"
        @click="engine.answerQuestion(option)"
      >
        {{ option }}
      </button>
    </div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="engine.showResult.value"
      :won="true"
      :stars="engine.stars.value"
      icon="🎉"
      title="小怪兽吃饱啦！"
      :info="`答对 ${engine.correctCount.value} 题 · 用时 ${engine.finalSeconds.value} 秒`"
      @retry="engine.restartGame"
      @next="engine.nextLevel"
    />

    <!-- 暂停 -->
    <PauseMenu
      :show="engine.paused.value"
      @pause="engine.pauseGame"
      @resume="engine.resumeGame"
      @quit="engine.quitGame"
    />

    <!-- 选关弹层 -->
    <LevelSelectModal
      :show="engine.showLevelSelect.value"
      :max-level="engine.currentLevel.value"
      :current="engine.currentLevel.value"
      @select="engine.chooseLevel"
      @close="engine.showLevelSelect.value = false"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useMathEngine } from '@/composables/useMathEngine';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import LevelSelectModal from '@/components/LevelSelectModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';

const router = useRouter();
const engine = useMathEngine();

onMounted(async () => {
  await engine.onMountedSetup();
});

onUnmounted(() => {
  engine.onUnmountedCleanup();
});
</script>

<style scoped>
.math-game {
  min-height: 100vh;
  background: linear-gradient(180deg, #43c59e 0%, #2d9d7a 100%);
  padding: 20px;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.math-header {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  margin-bottom: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

:deep(.math-header .label) {
  color: #1d6f56;
  font-weight: 600;
}

:deep(.math-header .value) {
  color: #14513f;
}

:deep(.math-header .sound-btn),
:deep(.math-header .back-btn) {
  background: rgba(67, 197, 158, 0.15);
}

.timer-bar {
  text-align: center;
  font-size: 15px;
  font-weight: bold;
  color: #14513f;
  background: rgba(255, 255, 255, 0.45);
  display: table;
  margin: 0 auto 10px;
  padding: 5px 16px;
  border-radius: 14px;
  font-variant-numeric: tabular-nums;
}

.monster-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 14px;
}

.monster {
  font-size: 76px;
  line-height: 1.1;
  filter: drop-shadow(0 5px 8px rgba(0, 0, 0, 0.25));
}

.monster.idle {
  animation: monsterFloat 2.6s ease-in-out infinite;
}

.monster.happy {
  animation: monsterHappy 0.6s ease;
}

.monster.shake {
  animation: monsterShake 0.5s ease;
}

@keyframes monsterFloat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

@keyframes monsterHappy {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  30% {
    transform: translateY(-16px) scale(1.15) rotate(-6deg);
  }
  60% {
    transform: translateY(-4px) scale(1.08) rotate(5deg);
  }
}

@keyframes monsterShake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-9px) rotate(-4deg);
  }
  40% {
    transform: translateX(9px) rotate(4deg);
  }
  60% {
    transform: translateX(-6px);
  }
  80% {
    transform: translateX(6px);
  }
}

.bubble {
  position: relative;
  background: #fff;
  border-radius: 16px;
  padding: 10px 20px;
  font-size: 16px;
  font-weight: bold;
  color: #14513f;
  margin-top: 8px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
}

.bubble::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  border: 8px solid transparent;
  border-bottom-color: #fff;
  border-top: 0;
}

.visual-area {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  flex-wrap: wrap;
  min-height: 120px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 20px;
  padding: 16px;
  max-width: 420px;
  margin: 0 auto 20px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}

.apple-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  max-width: 180px;
}

.apple {
  font-size: 30px;
  line-height: 1;
  animation: appleIn 0.3s ease backwards;
}

@keyframes appleIn {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.math-sign {
  font-size: 34px;
  font-weight: bold;
  color: #fff;
}

.options {
  display: flex;
  justify-content: center;
  gap: 14px;
  max-width: 420px;
  margin: 0 auto;
}

.option-btn {
  flex: 1;
  max-width: 110px;
  padding: 18px 0;
  font-size: 30px;
  font-weight: bold;
  color: #fff;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
  box-shadow: 0 6px 0 rgba(0, 0, 0, 0.18);
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.option-btn:nth-child(1) {
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5253 100%);
}
.option-btn:nth-child(2) {
  background: linear-gradient(135deg, #ff9f43 0%, #feca57 100%);
}
.option-btn:nth-child(3) {
  background: linear-gradient(135deg, #54a0ff 0%, #2e86de 100%);
}

.option-btn:active {
  transform: translateY(4px);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.18);
}

@media (max-width: 380px) {
  .option-btn {
    font-size: 26px;
    padding: 15px 0;
  }

  .apple {
    font-size: 26px;
  }
}
</style>
