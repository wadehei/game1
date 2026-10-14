<template>
  <div class="quiz-wrap">
    <!-- 终局排名 -->
    <template v-if="phase === 'ended' && final">
      <div class="quiz-final">
        <div class="qf-title">🏁 竞答结束</div>
        <div class="qf-list">
          <div v-for="(r, i) in final.ranking" :key="r.userId" class="qf-row" :class="{ me: r.userId === myId, top: i === 0 }">
            <span class="qf-rank">{{ ['🥇', '🥈', '🥉'][i] || `${i + 1}.` }}</span>
            <span class="qf-name">{{ r.nickname }}<template v-if="r.userId === myId">（我）</template></span>
            <span class="qf-score">{{ r.total }} 分</span>
          </div>
        </div>
        <div class="qf-tip">等待房主发起「再来一局」，将换一组新题</div>
      </div>
    </template>

    <template v-else-if="question && (question.index >= 0)">
      <!-- 倒计时条 -->
      <div class="timer-bar">
        <div class="timer-fill" :class="{ hurry: remainSec <= 5 }" :style="{ width: `${remainPct}%` }" />
        <span class="timer-num">{{ remainSec }}s</span>
        <span class="timer-progress">{{ question.index + 1 }}/{{ question.total }}</span>
      </div>

      <!-- 题目 -->
      <div class="quiz-card">
        <div class="quiz-text">{{ question.text }}</div>
        <div class="quiz-options">
          <button
            v-for="(opt, i) in question.options"
            :key="i"
            class="quiz-opt"
            :class="optClass(i)"
            :disabled="locked"
            @click="answer(i)"
          >
            <span class="opt-key">{{ 'ABCD'[i] }}</span>
            <span class="opt-text">{{ opt }}</span>
            <span v-if="revealed && i === result?.answer" class="opt-mark">✓</span>
            <span v-else-if="revealed && myChoice === i && i !== result?.answer" class="opt-mark wrong">✗</span>
          </button>
        </div>
        <div class="quiz-meta">
          {{ locked ? '已作答，等待其他人…' : '点击选项作答' }}
        </div>
      </div>

      <!-- 揭晓过渡 -->
      <div v-if="revealed && result" class="reveal-tip">
        <span v-for="d in result.delta" :key="d.userId" class="reveal-item" :class="{ gain: d.gained > 0 }">
          {{ nameOf(d.userId) }} {{ d.gained > 0 ? `+${d.gained}` : '+0' }}
        </span>
      </div>

      <!-- 实时积分 -->
      <div class="score-bar">
        <span v-for="s in scores" :key="s.userId" class="score-item" :class="{ me: s.userId === myId }">
          {{ nameOf(s.userId) }} {{ s.total }}分
        </span>
      </div>
    </template>

    <div v-else class="quiz-idle">题目准备中…</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useUserStore } from '@/store/user';

const props = defineProps<{
  question: any; // quiz_question 事件 / 快照拼装
  result: any; // quiz_result 事件
  final: any; // quiz_final 事件
  phase: string;
  mySeat: number;
}>();

const emit = defineEmits<{ (e: 'action', action: Record<string, unknown>): void }>();

const userStore = useUserStore();
const myId = computed(() => userStore.userInfo?.id || 0);

const myChoice = ref<number | null>(null);
const remainSec = ref(15);
const remainPct = ref(100);
let tickTimer: ReturnType<typeof setInterval> | null = null;

const revealed = computed(() => !!props.result && props.result.qid === props.question?.qid);
const locked = computed(() => myChoice.value !== null || revealed.value || props.mySeat < 0);

const scores = computed<any[]>(() => props.question?.scores || props.final?.ranking?.map((r: any) => ({ userId: r.userId, total: r.total })) || []);
const nameOf = (userId: number): string => {
  if (userId === myId.value) return '我';
  return props.question?.members?.find((m: any) => m.userId === userId)?.nickname || `角色${userId}`;
};

const startTick = () => {
  if (tickTimer) clearInterval(tickTimer);
  const update = () => {
    const deadline = props.question?.deadline || 0;
    const remainMs = Math.max(0, deadline - Date.now());
    remainSec.value = Math.ceil(remainMs / 1000);
    remainPct.value = props.question?.deadline ? (remainMs / 15000) * 100 : 100;
  };
  update();
  tickTimer = setInterval(update, 250);
};

watch(
  () => props.question?.qid,
  () => {
    myChoice.value = null;
    startTick();
  }
);

const answer = (choice: number) => {
  if (locked.value) return;
  myChoice.value = choice;
  emit('action', { t: 'quiz_answer', qid: props.question.qid, choice });
};

onMounted(startTick);
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});

const optClass = (i: number) => ({
  chosen: myChoice.value === i && !revealed.value,
  correct: revealed.value && props.result?.answer === i,
  mywrong: revealed.value && myChoice.value === i && i !== props.result?.answer,
  dim: revealed.value && i !== props.result?.answer && myChoice.value !== i,
});
</script>

<style scoped>
.quiz-wrap {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 10px;
}

.quiz-idle {
  text-align: center;
  color: #b5bac2;
  font-size: 13px;
  padding: 20px 0;
}

.timer-bar {
  position: relative;
  height: 20px;
  background: #f0f2f5;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 12px;
}

.timer-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  border-radius: 10px;
  transition: width 0.25s linear;
}

.timer-fill.hurry {
  background: linear-gradient(90deg, #e74c3c, #c0392b);
}

.timer-num {
  position: absolute;
  right: 8px;
  top: 2px;
  font-size: 11px;
  font-weight: bold;
  color: #555;
}

.timer-progress {
  position: absolute;
  left: 8px;
  top: 2px;
  font-size: 11px;
  color: #777;
}

.quiz-text {
  font-size: 15px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
  word-break: break-all;
}

.quiz-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quiz-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 2px solid #e3e8ef;
  background: #fafbfc;
  border-radius: 12px;
  padding: 11px 12px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  text-align: left;
  transition: all 0.12s ease;
}

.quiz-opt:disabled {
  cursor: default;
}

.quiz-opt.chosen {
  border-color: #667eea;
  background: #eef1fd;
}

.quiz-opt.correct {
  border-color: #27ae60;
  background: #e9f7ef;
}

.quiz-opt.mywrong {
  border-color: #e74c3c;
  background: #fdecea;
}

.quiz-opt.dim {
  opacity: 0.5;
}

.opt-key {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #667eea;
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
}

.quiz-opt.correct .opt-key {
  background: #27ae60;
}

.quiz-opt.mywrong .opt-key {
  background: #e74c3c;
}

.opt-text {
  flex: 1;
  word-break: break-all;
}

.opt-mark {
  font-weight: bold;
  color: #27ae60;
}

.opt-mark.wrong {
  color: #e74c3c;
}

.quiz-meta {
  margin-top: 10px;
  text-align: center;
  font-size: 12px;
  color: #999;
}

.reveal-tip {
  text-align: center;
  font-size: 13px;
  color: #555;
  padding: 6px 0;
}

.reveal-item {
  display: inline-block;
  margin: 0 8px;
  padding: 2px 10px;
  border-radius: 10px;
  background: #f0f2f5;
  color: #999;
}

.reveal-item.gain {
  background: #e9f7ef;
  color: #27ae60;
  font-weight: bold;
}

.score-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 8px;
}

.score-item {
  font-size: 12px;
  color: #888;
  background: #f8f9fb;
  border-radius: 10px;
  padding: 3px 10px;
}

.score-item.me {
  color: #667eea;
  background: #eef1fd;
  font-weight: bold;
}

.quiz-final {
  text-align: center;
}

.qf-title {
  font-size: 17px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
}

.qf-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.qf-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f8f9fb;
  border-radius: 10px;
  padding: 9px 14px;
}

.qf-row.top {
  background: #fff8e8;
}

.qf-row.me {
  border: 2px solid #667eea;
}

.qf-rank {
  width: 34px;
  font-size: 15px;
  font-weight: bold;
}

.qf-name {
  flex: 1;
  text-align: left;
  font-size: 14px;
  color: #333;
}

.qf-score {
  font-size: 15px;
  font-weight: bold;
  color: #667eea;
}

.qf-tip {
  font-size: 12px;
  color: #999;
}
</style>
