<template>
  <div class="brp-mask">
    <!-- 彩带 -->
    <div class="confetti">
      <span v-for="n in 24" :key="n" class="confetti-bit" :style="confettiStyle(n)" />
    </div>

    <div class="brp-card">
      <div class="brp-title">{{ title }}</div>
      <!-- 冠军 -->
      <div class="champ" :class="{ pop: show }">
        <div class="champ-crown">👑</div>
        <div class="champ-avatar">{{ champAvatar }}</div>
        <div class="champ-name">{{ champ?.nickname }}<template v-if="champ?.userId === myId">（我）</template></div>
        <div class="champ-chips">{{ champ?.chips ?? 0 }} 分</div>
      </div>
      <!-- 排名 -->
      <div class="rows">
        <div v-for="(r, i) in ranking" :key="r.userId" class="row" :class="{ me: r.userId === myId, top: i === 0 }" :style="{ animationDelay: `${0.15 + i * 0.12}s` }">
          <span class="rank">{{ ['🥇', '🥈', '🥉'][i] || `${i + 1}.` }}</span>
          <span class="name">{{ r.nickname }}<template v-if="r.userId === myId">（我）</template></span>
          <span class="delta" :class="{ pos: (r.delta || 0) > 0, neg: (r.delta || 0) < 0 }">
            {{ (r.delta || 0) > 0 ? '+' : '' }}{{ r.delta || 0 }}
          </span>
          <span class="chips">{{ r.chips }}</span>
        </div>
      </div>
      <div v-if="reason" class="reason">{{ reason }}</div>
      <div class="tip">等待房主发起「再来一局」</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

const props = defineProps<{
  title: string;
  ranking: Array<{ userId: number; nickname: string; chips: number; delta?: number }>;
  myId: number;
  reason?: string;
  members?: Array<{ userId: number; avatar?: string }>;
}>();

const champ = computed(() => props.ranking?.[0] || null);
const champAvatar = computed(() => {
  const m = props.members?.find((x) => x.userId === champ.value?.userId);
  return m?.avatar && m.avatar.length <= 4 ? m.avatar : '🏆';
});
const show = ref(false);
onMounted(() => setTimeout(() => (show.value = true), 60));

const CONFETTI_COLORS = ['#667eea', '#f39c12', '#27ae60', '#e74c3c', '#8e44ad', '#2980b9'];
const confettiStyle = (n: number) => ({
  left: `${(n * 37) % 100}%`,
  background: CONFETTI_COLORS[n % CONFETTI_COLORS.length],
  animationDelay: `${(n % 8) * 0.18}s`,
  animationDuration: `${2.4 + (n % 5) * 0.4}s`,
  transform: `rotate(${n * 30}deg)`,
});
</script>

<style scoped>
.brp-mask {
  position: relative;
  background: linear-gradient(160deg, #1b2350 0%, #2d3a8c 100%);
  border-radius: 16px;
  padding: 18px 14px 14px;
  overflow: hidden;
  text-align: center;
  color: #fff;
}

.confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.confetti-bit {
  position: absolute;
  top: -12px;
  width: 7px;
  height: 12px;
  border-radius: 2px;
  opacity: 0.85;
  animation: drop linear infinite;
}

@keyframes drop {
  0% {
    transform: translateY(-20px) rotate(0deg);
    opacity: 0.9;
  }
  100% {
    transform: translateY(340px) rotate(540deg);
    opacity: 0.2;
  }
}

.brp-title {
  font-size: 15px;
  font-weight: bold;
  opacity: 0.9;
  margin-bottom: 10px;
}

.champ {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  transform: scale(0.5);
  opacity: 0;
  transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s;
}

.champ.pop {
  transform: scale(1);
  opacity: 1;
}

.champ-crown {
  font-size: 26px;
  margin-bottom: -6px;
  animation: bob 1.6s ease-in-out infinite;
}

@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

.champ-avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, #ffe27a, #f0a72e);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.25);
}

.champ-name {
  font-size: 16px;
  font-weight: bold;
  margin-top: 6px;
}

.champ-chips {
  font-size: 13px;
  color: #ffe27a;
}

.rows {
  margin-top: 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 7px 12px;
  margin-bottom: 6px;
  font-size: 13px;
  animation: slide-in 0.4s ease backwards;
}

.row.top {
  background: rgba(255, 226, 122, 0.18);
}

.row.me {
  outline: 2px solid #7ea0ff;
}

@keyframes slide-in {
  from {
    transform: translateX(-24px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.rank {
  width: 26px;
  text-align: left;
}

.name {
  flex: 1;
  text-align: left;
}

.delta {
  font-weight: bold;
  min-width: 40px;
}

.delta.pos {
  color: #7bed9f;
}

.delta.neg {
  color: #ff9f9f;
}

.chips {
  min-width: 44px;
  text-align: right;
  color: #ffe27a;
  font-weight: bold;
}

.reason {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 4px;
}

.tip {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 10px;
}
</style>
