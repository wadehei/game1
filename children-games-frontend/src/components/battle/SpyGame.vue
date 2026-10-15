<template>
  <div class="spy-wrap">
    <!-- 终局 -->
    <template v-if="phase === 'ended' && final">
      <div class="spy-final">
        <div class="sf-title">{{ final?.winner === 'civilian' ? '🎉 平民胜利' : '🕵️ 卧底胜利' }}</div>
        <div class="sf-words">平民词「{{ final?.words.civilian }}」 vs 卧底词「{{ final?.words.spy }}」</div>
        <div class="sf-spies">卧底是：{{ spyNames(final?.spyUserIds || []) || '无' }}</div>
        <div class="sf-tip">等待房主发起「再来一局」</div>
      </div>
    </template>

    <template v-else>
      <!-- 身份卡 -->
      <div class="id-card" :class="{ spy: me?.role === 'spy' }" @click="showWord = !showWord">
        <div class="id-label">{{ me?.role === 'spy' ? '你是卧底 🕵️' : '你是平民 🙂' }}（点击{{ showWord ? '隐藏' : '查看' }}词）</div>
        <div v-if="showWord" class="id-word">{{ me?.word }}</div>
        <div v-else class="id-hint">词与「{{ state?.pairCategory }}」相关</div>
      </div>

      <!-- 阶段状态 -->
      <div class="spy-status">
        <template v-if="state?.phase === 'talk'">
          🗣️ 描述阶段（线下口头描述）· 剩 {{ remainSec }}s
        </template>
        <template v-else-if="state?.phase === 'vote'">
          🗳️ 投票阶段 · 剩 {{ remainSec }}s
          <template v-if="state?.isRevote"> · 平票重投，只能投候选人</template>
        </template>
        <template v-else>等待开局…</template>
      </div>

      <!-- 投票进度 -->
      <div v-if="state?.phase === 'vote'" class="vote-progress">
        已投 {{ state?.votedCount ?? 0 }} / {{ state?.total ?? 0 }} 人
      </div>

      <!-- 存活玩家 / 投票目标 -->
      <div class="alive-grid">
        <button
          v-for="uid in state?.alive || []"
          :key="uid"
          class="alive-cell"
          :class="{ me: uid === myId, voted: myVote === uid, candidate: state?.isRevote && !(state?.revotePool || []).includes(uid) }"
          :disabled="!canVote || uid === myId"
          @click="vote(uid)"
        >
          {{ nameOf(uid) }}
        </button>
      </div>
      <div v-if="state?.phase === 'vote' && state?.isRevote" class="revote-tip">
        ⚠️ 平票重投：只能投 {{ (state?.revotePool || []).map(nameOf).join('、') }}
      </div>
      <div v-if="myVoted" class="voted-tip">已投票（阶段内可改票）</div>

      <!-- 出局名单 -->
      <div v-if="eliminatedList.length" class="eliminated">
        已出局：
        <span v-for="e in eliminatedList" :key="e.userId" class="elim-tag">
          {{ nameOf(e.userId) }}（{{ e.role === 'spy' ? '卧底' : '平民' }}）
        </span>
      </div>

      <!-- 本轮投票结果 -->
      <div v-if="voteResult" class="vote-result">
        <div class="vr-title">投票结果</div>
        <div v-for="c in voteResult.counts" :key="c.target" class="vr-row">
          {{ nameOf(c.target) }}：{{ c.count }} 票
        </div>
        <div class="vr-out">
          {{ voteResult.out ? `${nameOf(voteResult.out)} 被淘汰（${voteResult.outRole === 'spy' ? '卧底' : '平民'}）` : '平票/弃权过多，无人出局' }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useUserStore } from '@/store/user';

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

const showWord = ref(false);
const remainSec = ref(0);
const myVote = ref<number | null>(null);
let tickTimer: ReturnType<typeof setInterval> | null = null;

const me = computed(() => props.state?.me || null);
const voteResult = computed(() => props.events.voteResult);
const eliminatedList = computed(() => props.state?.eliminated || []);
// 终局：优先实时事件，兜底快照里的 ended 摘要（刷新/重连后事件已丢）
const final = computed<any | null>(() => props.events.final || props.state?.ended || null);

const nameOf = (userId: number): string => {
  if (userId === myId.value) return '我';
  return props.members?.find((m) => m.userId === userId)?.nickname || `角色${userId}`;
};

const spyNames = (userIds: number[]): string => userIds.map(nameOf).join('、');

const canVote = computed(
  () => props.state?.phase === 'vote' && me.value?.alive && props.phase === 'playing'
);

const myVoted = computed(() => myVote.value !== null || props.state?.votedCount === props.state?.total);

watch(
  () => props.state?.phase,
  () => {
    myVote.value = null;
  }
);
watch(
  () => props.events.phase,
  (m: any) => {
    if (m?.deadline) remainSec.value = Math.ceil((m.deadline - Date.now()) / 1000);
  }
);

const tick = ref(0);
onMounted(() => {
  tickTimer = setInterval(() => {
    tick.value += 1;
    remainSec.value = Math.max(0, Math.ceil(((props.state?.deadline || 0) - Date.now()) / 1000));
  }, 500);
});
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer);
});
void tick;

const vote = (target: number) => {
  if (!canVote.value) return;
  myVote.value = target;
  emit('action', { t: 'spy_vote', target });
};
</script>

<style scoped>
.spy-wrap {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 10px;
}

.id-card {
  background: linear-gradient(135deg, #43cea2 0%, #185a9d 100%);
  border-radius: 14px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  margin-bottom: 10px;
}

.id-card.spy {
  background: linear-gradient(135deg, #2c3e50 0%, #4ca1af 100%);
}

.id-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 6px;
}

.id-word {
  font-size: 22px;
  font-weight: bold;
  color: #fff;
  letter-spacing: 4px;
}

.id-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}

.spy-status {
  text-align: center;
  font-size: 13px;
  color: #555;
  padding: 4px 0 8px;
}

.vote-progress {
  text-align: center;
  font-size: 12px;
  color: #2980b9;
  margin-bottom: 6px;
}

.alive-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 8px;
}

.alive-cell {
  border: 2px solid #e3e8ef;
  background: #fafbfc;
  color: #333;
  font-size: 13px;
  padding: 10px 4px;
  border-radius: 10px;
  cursor: pointer;
  word-break: break-all;
}

.alive-cell.me {
  border-color: #667eea;
}

.alive-cell.voted {
  border-color: #e67e22;
  background: #fdf2e4;
  font-weight: bold;
}

.alive-cell.candidate {
  opacity: 0.35;
}

.alive-cell:disabled {
  cursor: default;
}

.revote-tip,
.voted-tip {
  font-size: 12px;
  color: #e67e22;
  text-align: center;
  margin-bottom: 6px;
}

.eliminated {
  font-size: 12px;
  color: #888;
  margin-top: 6px;
}

.elim-tag {
  background: #f0f2f5;
  border-radius: 8px;
  padding: 1px 8px;
  margin-right: 6px;
}

.vote-result {
  background: #f8f9fb;
  border-radius: 10px;
  padding: 10px 14px;
  margin-top: 8px;
}

.vr-title {
  font-size: 13px;
  font-weight: bold;
  color: #333;
  margin-bottom: 4px;
}

.vr-row {
  font-size: 13px;
  color: #666;
  padding: 2px 0;
}

.vr-out {
  margin-top: 6px;
  font-size: 13px;
  font-weight: bold;
  color: #e74c3c;
}

.spy-final {
  text-align: center;
  padding: 10px 0;
}

.sf-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  margin-bottom: 8px;
}

.sf-words {
  font-size: 14px;
  color: #555;
  margin-bottom: 6px;
}

.sf-spies {
  font-size: 14px;
  color: #e74c3c;
  margin-bottom: 6px;
}

.sf-tip {
  font-size: 12px;
  color: #999;
}
</style>
