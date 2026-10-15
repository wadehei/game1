<template>
  <div class="zjh-wrap">
    <!-- 终局：全员胜利结算面板（带动画） -->
    <BattleResultPanel
      v-if="phase === 'ended' && final"
      title="♠️ 三张牌比大小 战局结算"
      :ranking="final.ranking"
      :my-id="myId"
      :reason="final.reason"
      :members="members"
    />

    <template v-else>
      <!-- 重开/待开局的空档：状态未到，先占位避免 0/0 NaN 闪现 -->
      <div v-if="!state?.round" class="idle-tip pre-start">等待开局…</div>
      <template v-else>
      <!-- 状态条 -->
      <div class="zjh-status">
        <span class="round">第 {{ state?.round || 0 }}/{{ state?.totalRounds || 0 }} 手</span>
        <span class="pot">池子 <b>{{ state?.pot || 0 }}</b></span>
        <span class="stake">单注 {{ state?.stake || 0 }}（看家 {{ (state?.stake || 0) * 2 }}）</span>
        <span class="round-no">第 {{ state?.roundNo || 1 }} 轮</span>
        <span v-if="remainSec > 0 && state?.phase === 'betting'" class="timer" :class="{ hurry: remainSec <= 5 }">{{ remainSec }}s</span>
      </div>

      <!-- 我的下注流水（整局累计） -->
      <BetLedger v-if="myLedger.length" :entries="myLedger" theme="purple" />

      <!-- 亮牌区（摊牌） -->
      <div v-if="showdown" class="showdown">
        <div class="sd-title"> 🔔 开牌！</div>
        <div v-for="r in showdown.reveals" :key="r.userId" class="sd-row" :class="{ me: r.userId === myId }">
          <span class="sd-name">{{ nameOfUser(r.userId) }}</span>
          <span v-for="(c, i) in r.cards" :key="i" class="pcard sm" :class="{ red: isRed(c) }">{{ c }}</span>
          <span class="sd-type">{{ r.typeName }}</span>
        </div>
      </div>

      <!-- 其他玩家 -->
      <div class="others">
        <div v-for="o in othersView" :key="o.userId" class="o-cell" :class="{ act: state?.turnSeat === o.seat, fold: o.folded }">
          <div class="o-name">{{ o.nickname }}<template v-if="o.userId === myId">（我）</template></div>
          <div class="o-tag">
            {{ o.folded ? '🚫 已弃' : o.allIn ? '💰 all-in' : o.seen ? '👀 已看' : '🙈 闷牌' }}
          </div>
          <div class="o-bet">投 {{ o.betTotal || 0 }}</div>
        </div>
      </div>

      <!-- 我的手牌 -->
      <div class="my-cards" @click="!state?.mySeen && canActNow && doLook()">
        <template v-if="state?.myCards?.length">
          <span v-for="(c, i) in state.myCards" :key="i" class="pcard flip" :class="{ red: isRed(c) }">{{ c }}</span>
          <span v-if="state?.myRank" class="my-rank">{{ state.myRank }}</span>
        </template>
        <template v-else>
          <span v-for="n in 3" :key="n" class="pcard back" />
          <span class="look-hint">{{ canActNow ? '点击看牌' : '闷牌中' }}</span>
        </template>
      </div>

      <!-- 比牌结果浮层（我参与的） -->
      <div v-if="compareCards" class="cmp-pop" @click="dismissCompare">
        <div class="cmp-title">{{ compareCards.result === 'win' ? '🎉 比牌获胜！' : '😭 比牌输了，自动弃牌' }}</div>
        <div class="cmp-row">
          <span>我的牌：</span>
          <span v-for="(c, i) in compareCards.myCards" :key="i" class="pcard xs" :class="{ red: isRed(c) }">{{ c }}</span>
          <b>{{ compareCards.myType }}</b>
        </div>
        <div class="cmp-row">
          <span>对方牌：</span>
          <span v-for="(c, i) in compareCards.oppCards" :key="i" class="pcard xs" :class="{ red: isRed(c) }">{{ c }}</span>
          <b>{{ compareCards.oppType }}</b>
        </div>
        <div class="cmp-tip">点击关闭</div>
      </div>

      <!-- 本手结算 -->
      <div v-if="settle" class="settle-bar">
        <div class="s-title">{{ nameOfUser(settle.winner) }} 赢得 {{ settle.winAmount }} 分{{ settle.reason === 'others_folded' ? '（无需开牌）' : '' }}<span v-if="nextRemain > 0" class="s-next">· 下一手 {{ nextRemain }}s</span></div>
        <div v-for="d in settle.deltas" :key="d.userId" class="s-item">
          {{ d.nickname }} <b :class="d.delta > 0 ? 'pos' : d.delta < 0 ? 'neg' : ''">{{ d.delta > 0 ? `+${d.delta}` : d.delta }}</b>
        </div>
      </div>

      <!-- 操作区 -->
      <div v-if="canActNow" class="actions mine">
        <button v-if="!state?.mySeen" class="btn look" @click="doLook">看牌</button>
        <button class="btn call" @click="emit('action', { t: 'zjh_call' })">
          跟注 {{ state?.mySeen ? (state?.stake || 0) * 2 : state?.stake || 0 }}
        </button>
        <button
          v-for="amt in raiseOptions"
          :key="amt"
          class="btn raise"
          :disabled="(state?.stake || 0) >= (state?.stakeCap || 100)"
          @click="emit('action', { t: 'zjh_raise', amount: amt })"
        >
          +{{ amt }}
        </button>
        <button v-if="canCompare" class="btn compare" @click="pickingTarget = !pickingTarget">比牌 {{ (state?.stake || 0) * 2 }}</button>
        <button class="btn fold" @click="emit('action', { t: 'zjh_fold' })">弃牌</button>
      </div>
      <div v-else-if="state?.phase === 'betting' && state?.turnSeat >= 0" class="idle-tip">
        等待 {{ nameOfSeat(state.turnSeat) }} 行动…
      </div>
      <div v-else class="idle-tip">{{ state?.phase === 'showdown' ? '开牌结算中…' : '等待下一手…' }}</div>

      <!-- 比牌选人 -->
      <div v-if="pickingTarget" class="target-pick">
        <div class="tp-title">选择比牌对象（费用 {{ (state?.stake || 0) * 2 }}）</div>
        <div class="tp-list">
          <button v-for="o in compareTargets" :key="o.userId" class="tp-btn" @click="pickTarget(o.userId)">
            {{ o.nickname }}
          </button>
        </div>
        <button class="tp-cancel" @click="pickingTarget = false">取消</button>
      </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useUserStore } from '@/store/user';
import { soundManager } from '@/utils/sound';
import BattleResultPanel from './BattleResultPanel.vue';
import BetLedger, { type BetLedgerEntry } from './BetLedger.vue';

const props = defineProps<{
  state: any;
  events: Record<string, any>;
  members: Array<{ userId: number; nickname: string; avatar?: string; seat: number }>;
  phase: string;
  mySeat: number;
}>();

const emit = defineEmits<{ (e: 'action', action: Record<string, unknown>): void }>();

const userStore = useUserStore();
const myId = computed(() => userStore.userInfo?.id || 0);

const final = computed(() => props.events.final);
const showdown = computed(() => props.events.showdown);
const settle = computed(() => props.events.settle);
const compareCards = computed(() => props.events.compareCards);

const pickingTarget = ref(false);
const compareVisibleUntil = ref(0);
void compareVisibleUntil;

const canActNow = computed(() => props.phase === 'playing' && props.state?.phase === 'betting' && props.state?.turnSeat === props.mySeat && !props.state?.myFolded && !props.state?.myAllIn);
const canCompare = computed(() => canActNow.value && (props.state?.roundNo || 1) >= (props.state?.compareMinRound || 3));
const raiseOptions = computed<number[]>(() => props.state?.raiseSteps || [10, 20, 50]);
const compareTargets = computed(() => (props.state?.others || []).filter((o: any) => !o.folded && !o.allIn && o.userId !== myId.value));

// 轮到自己行动：提示音（仅状态切换沿触发，进房即轮到不响）
watch(canActNow, (now, before) => {
  if (now && !before) soundManager.playTurn();
});

const othersView = computed<any[]>(() => props.state?.others || []);

// 我的下注流水：后端 myBetLog（每手 底注+跟注/加注/比牌 的投入与输赢）转通用展示结构
const myLedger = computed<BetLedgerEntry[]>(() =>
  (props.state?.myBetLog || []).map((e: any) => ({
    round: e.round,
    bet: e.betTotal,
    note: '',
    delta: e.delta,
    tag: e.delta === null ? '' : e.ended === 'win' ? '赢' : e.ended === 'fold' ? '弃牌' : '开牌',
  }))
);

const doLook = () => emit('action', { t: 'zjh_look' });
const dismissCompare = () => (props.events.compareCards = null);
const pickTarget = (userId: number) => {
  pickingTarget.value = false;
  emit('action', { t: 'zjh_compare', target: userId });
};

const nameOfUser = (userId: number): string => {
  const m = props.members?.find((x) => x.userId === userId);
  if (!m) return `角色${userId}`;
  return m.userId === myId.value ? `${m.nickname}（我）` : m.nickname;
};
const nameOfSeat = (seat: number): string => {
  const m = props.members?.find((x) => x.seat === seat);
  if (!m) return `座位${seat + 1}`;
  return m.userId === myId.value ? `${m.nickname}（我）` : m.nickname;
};
const isRed = (card: string): boolean => card.includes('♥') || card.includes('♦');

const remainSec = ref(0);
const nextRemain = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    remainSec.value = Math.max(0, Math.ceil(((props.state?.deadline || 0) - Date.now()) / 1000));
    nextRemain.value =
      props.state?.phase === 'settle' && props.state?.nextDeadline ? Math.max(0, Math.ceil((props.state.nextDeadline - Date.now()) / 1000)) : 0;
  }, 400);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.zjh-wrap {
  background: linear-gradient(160deg, #3b1f4e 0%, #241238 100%);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 10px;
  color: #f4effa;
}

.zjh-status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #d9c8ee;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.pot b {
  color: #ffe27a;
}

.timer {
  font-weight: bold;
  color: #7bed9f;
}

.timer.hurry {
  color: #ff9f9f;
}

.showdown {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.sd-title {
  font-size: 13px;
  font-weight: bold;
  color: #ffe27a;
  margin-bottom: 6px;
}

.sd-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 0;
  font-size: 12px;
}

.sd-row.me {
  outline: 1px solid #7ea0ff;
  border-radius: 6px;
}

.sd-name {
  min-width: 58px;
}

.sd-type {
  color: #ffe27a;
  font-weight: bold;
}

.others {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  overflow-x: auto;
}

.o-cell {
  flex: 1;
  min-width: 88px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 7px 8px;
  border: 2px solid transparent;
  text-align: center;
}

.o-cell.act {
  border-color: #ffe27a;
}

.o-cell.fold {
  opacity: 0.45;
}

.o-name {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.o-tag {
  font-size: 10px;
  color: #d9c8ee;
  margin: 3px 0;
}

.o-bet {
  font-size: 10px;
  color: #ffe27a;
}

.my-cards {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 8px;
  min-height: 72px;
  position: relative;
}

.pcard {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 60px;
  background: #fff;
  color: #222;
  border-radius: 7px;
  font-size: 16px;
  font-weight: bold;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}

.pcard.red {
  color: #d63031;
}

.pcard.sm {
  width: 32px;
  height: 44px;
  font-size: 12px;
}

.pcard.xs {
  width: 26px;
  height: 36px;
  font-size: 11px;
}

.pcard.back {
  background: repeating-linear-gradient(45deg, #4a2a68, #4a2a68 4px, #3a2054 4px, #3a2054 8px);
  cursor: pointer;
}

.pcard.flip {
  animation: flip-in 0.35s ease backwards;
}

@keyframes flip-in {
  from {
    transform: rotateY(90deg);
  }
  to {
    transform: rotateY(0);
  }
}

.my-rank {
  position: absolute;
  right: 12px;
  bottom: 8px;
  background: #ffe27a;
  color: #5b4300;
  font-size: 12px;
  font-weight: bold;
  border-radius: 10px;
  padding: 2px 8px;
}

.look-hint {
  font-size: 12px;
  color: #d9c8ee;
}

.cmp-pop {
  background: rgba(0, 0, 0, 0.55);
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 8px;
}

.cmp-title {
  font-size: 13px;
  font-weight: bold;
  margin-bottom: 6px;
}

.cmp-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 2px 0;
}

.cmp-tip {
  font-size: 10px;
  color: #d9c8ee;
  margin-top: 6px;
  text-align: right;
}

.settle-bar {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 6px 10px;
  margin-bottom: 8px;
  font-size: 12px;
}

.s-title {
  font-weight: bold;
  color: #ffe27a;
  margin-bottom: 4px;
}

.s-item {
  display: inline-flex;
  gap: 6px;
  margin-right: 12px;
}

.s-item b.pos {
  color: #7bed9f;
}

.s-item b.neg {
  color: #ff9f9f;
}

.actions {
  display: flex;
  align-items: center;
  gap: 7px;
  justify-content: center;
  flex-wrap: wrap;
  padding: 4px 0;
}

.actions.mine .btn {
  animation: btn-pulse 1.6s ease-in-out infinite;
}

@keyframes btn-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 226, 122, 0);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(255, 226, 122, 0.35);
  }
}

.s-next {
  color: #d9c8ee;
  font-weight: normal;
  font-size: 11px;
  margin-left: 6px;
}

.pre-start {
  padding: 30px 0;
}

.btn {
  border: none;
  border-radius: 10px;
  padding: 9px 13px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.4;
}

.btn.look {
  background: #ffe27a;
  color: #5b4300;
}

.btn.call {
  background: #7bed9f;
  color: #14432a;
}

.btn.raise {
  background: #7ea0ff;
  color: #14264d;
}

.btn.compare {
  background: #ffcf5c;
  color: #5b4300;
}

.btn.fold {
  background: rgba(255, 255, 255, 0.14);
  color: #ff9f9f;
}

.idle-tip {
  text-align: center;
  font-size: 12px;
  color: #d9c8ee;
  padding: 6px 0;
}

.target-pick {
  background: rgba(0, 0, 0, 0.4);
  border-radius: 12px;
  padding: 10px;
  margin-top: 8px;
}

.tp-title {
  font-size: 12px;
  margin-bottom: 8px;
}

.tp-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tp-btn {
  border: 2px solid #ffe27a;
  background: transparent;
  color: #fff;
  border-radius: 10px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
}

.tp-cancel {
  border: none;
  background: transparent;
  color: #d9c8ee;
  font-size: 12px;
  margin-top: 8px;
  cursor: pointer;
}
</style>
