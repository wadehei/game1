<template>
  <div class="bj-wrap">
    <!-- 终局：全员胜利结算面板（带动画） -->
    <BattleResultPanel
      v-if="phase === 'ended' && final"
      title="🃏 21点 战局结算"
      :ranking="final.ranking"
      :my-id="myId"
      :reason="final.reason"
      :members="members"
    />

    <template v-else>
      <!-- 状态条 -->
      <div class="bj-status">
        <span class="round">第 {{ state?.round || 0 }}/{{ state?.totalRounds || 0 }} 手</span>
        <span class="banker">庄家：{{ nameOfSeat(state?.bankerSeat) }}</span>
        <span v-if="phaseText" class="phase">{{ phaseText }}</span>
        <span v-if="remainSec > 0 && (state?.phase === 'betting' || state?.phase === 'acting')" class="timer" :class="{ hurry: remainSec <= 5 }">{{ remainSec }}s</span>
      </div>

      <!-- 我的下注流水（整局累计） -->
      <BetLedger v-if="myLedger.length" :entries="myLedger" theme="green" />

      <!-- 庄家区 -->
      <div class="banker-area" :class="{ turn: state?.phase === 'dealer' }">
        <div class="area-label">庄家{{ isBanker ? '（你）' : '' }}</div>
        <div class="cards">
          <span v-for="(c, i) in state?.bankerCards || []" :key="i" class="pcard" :class="{ red: isRed(c) }">{{ c }}</span>
          <span v-if="!state?.bankerCards?.length" class="card-back" />
        </div>
        <span v-if="state?.bankerValue" class="value-badge">{{ state.bankerValue }}</span>
      </div>

      <!-- 闲家区 -->
      <div class="players-row">
        <div v-for="o in othersView" :key="o.userId" class="p-cell" :class="{ act: state?.turnSeat === o.seat, bust: o.busted }">
          <div class="p-name">{{ nameOfUser(o.userId) }}</div>
          <div class="cards small">
            <span v-for="(c, i) in o.cards || []" :key="i" class="pcard sm" :class="{ red: isRed(c) }">{{ c }}</span>
            <span v-if="!o.cards?.length" class="waiting">{{ o.stake ? `${o.stake}分` : '…' }}</span>
          </div>
          <div class="p-tag">
            {{ o.busted ? '💥 爆牌' : o.natural ? '✨ Blackjack' : o.done ? '🛑 停牌' : o.stake ? `押 ${o.stake}` : '思考中' }}
          </div>
        </div>
        <div v-if="!othersView.length" class="empty-tip">等待其他玩家下注…</div>
      </div>

      <!-- 我的手牌 -->
      <div v-if="!isBanker && myInView" class="my-area" :class="{ bust: state?.myBusted }">
        <div class="my-label">
          我的手牌 <span v-if="state?.myNatural" class="natural">✨ Blackjack！</span>
          <span v-if="state?.myBusted" class="bust-tag">💥 爆了</span>
        </div>
        <div class="cards">
          <span v-for="(c, i) in state?.myCards || []" :key="i" class="pcard" :class="{ red: isRed(c), deal: i >= myCardsLenAtDeal }">{{ c }}</span>
        </div>
        <div class="my-meta">本手押注 {{ state?.myStake || 0 }} 分<template v-if="state?.myDoubled">（已加倍）</template></div>
      </div>

      <!-- 本手结算浮条 -->
      <div v-if="lastResults" class="settle-bar">
        <div v-for="r in lastResults" :key="r.userId" class="s-item">
          {{ nameOfUser(r.userId) }}
          <b :class="r.delta > 0 ? 'pos' : r.delta < 0 ? 'neg' : ''">{{ r.delta > 0 ? `+${r.delta}` : r.delta }}</b>
          <span class="outcome">{{ outcomeText(r.outcome) }}</span>
        </div>
      </div>

      <!-- 操作区 -->
      <div v-if="canBet" class="actions">
        <span class="hint">下注：</span>
        <button
          v-for="amt in state?.betOptions || []"
          :key="amt"
          class="btn bet"
          :disabled="(myChips || 0) < amt"
          @click="emit('action', { t: 'blackjack_bet', amount: amt })"
        >
          {{ amt }}
        </button>
      </div>
      <div v-else-if="myTurnToAct" class="actions">
        <button class="btn hit" @click="emit('action', { t: 'blackjack_hit' })">要牌</button>
        <button class="btn stand" @click="emit('action', { t: 'blackjack_stand' })">停牌</button>
        <button v-if="canDouble" class="btn double" @click="emit('action', { t: 'blackjack_double' })">加倍</button>
      </div>
      <div v-else-if="canPassBank" class="actions">
        <button class="btn pass" @click="emit('action', { t: 'blackjack_pass_bank' })">让庄给下家</button>
      </div>
      <div v-else class="idle-tip">{{ idleText }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useUserStore } from '@/store/user';
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
const isBanker = computed(() => !!props.state?.isBanker);
const myChips = computed(() => props.state?.chips?.find((c: any) => c.userId === myId.value)?.chips ?? 0);
const myTurnToAct = computed(() => props.phase === 'playing' && props.state?.phase === 'acting' && props.state?.turnSeat === props.mySeat && !props.state?.myDone);
const canBet = computed(() => props.phase === 'playing' && props.state?.phase === 'betting' && !isBanker.value && !props.state?.myStake && (myChips.value || 0) > 0);
const canDouble = computed(() => (props.state?.myCards?.length || 0) === 2 && (myChips.value || 0) >= (props.state?.myStake || 0));
const canPassBank = computed(() => props.phase === 'playing' && props.state?.canPassBank && isBanker.value);
const myInView = computed(() => (props.state?.myCards?.length || 0) > 0 || props.state?.myStake);

// 发牌动画基准（只对新增牌做入场动画的占位；简化：首两张不动画）
const myCardsLenAtDeal = ref(99);

/** 闲家视图：优先用 deal/action 拼装的明牌（events.handsView），快照兜底只给张数 */
const othersView = computed<any[]>(() => {
  const view = props.events.handsView as Array<{ userId: number; seat: number; cards: string[]; stake: number; done: boolean; busted: boolean; natural: boolean }> | undefined;
  if (view?.length) {
    return view.filter((v) => v.userId !== myId.value);
  }
  return (props.state?.others || []).map((o: any) => ({ ...o, seat: seatOfUser(o.userId), cards: [] }));
});

const lastResults = computed(() => props.state?.lastResults || null);

// 我的下注流水：后端 myBetLog（每手 押注/加倍/输赢）转通用展示结构
const myLedger = computed<BetLedgerEntry[]>(() =>
  (props.state?.myBetLog || []).map((e: any) => ({
    round: e.round,
    bet: e.stake,
    note: e.doubled ? '加倍' : '',
    delta: e.delta,
    tag: e.delta === null ? '' : outcomeText(e.outcome),
  }))
);

const phaseText = computed(() => {
  const p = props.state?.phase;
  if (p === 'betting') return '下注阶段';
  if (p === 'acting') return '行动阶段';
  if (p === 'dealer') return '庄家结算中';
  if (p === 'settle') return '本手结算';
  return '';
});

const idleText = computed(() => {
  if (isBanker.value) return props.state?.phase === 'dealer' ? '庄家自动要牌中…' : '你是庄家，等待闲家行动';
  if (props.state?.phase === 'betting') return props.state?.myStake ? '已下注，等待其他玩家…' : '等待其他玩家下注…';
  if (props.state?.phase === 'acting') return '等待其他玩家行动…';
  if (props.state?.phase === 'settle') return '本手结算中…';
  return '等待开局…';
});

const nameOfSeat = (seat: number): string => {
  const m = props.members?.find((x) => x.seat === seat);
  if (!m) return `座位${seat + 1}`;
  return m.userId === myId.value ? `${m.nickname}（我）` : m.nickname;
};
const nameOfUser = (userId: number): string => {
  const m = props.members?.find((x) => x.userId === userId);
  if (!m) return `角色${userId}`;
  return m.userId === myId.value ? `${m.nickname}（我）` : m.nickname;
};
const seatOfUser = (userId: number): number => props.members?.find((x) => x.userId === userId)?.seat ?? -1;
const isRed = (card: string): boolean => card.includes('♥') || card.includes('♦');
const outcomeText = (o: string): string => ({ win: '赢', lose: '输', push: '平', bust: '爆牌', blackjack: 'Blackjack' })[o] || o;

// 倒计时
const remainSec = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    remainSec.value = Math.max(0, Math.ceil(((props.state?.deadline || 0) - Date.now()) / 1000));
  }, 400);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.bj-wrap {
  background: linear-gradient(160deg, #1e3a2f 0%, #14352c 100%);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 10px;
  color: #f2f7f5;
}

.bj-status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #cfe3da;
  margin-bottom: 8px;
}

.timer {
  font-weight: bold;
  color: #7bed9f;
}

.timer.hurry {
  color: #ff9f9f;
}

.banker-area,
.my-area {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 8px 10px;
  margin-bottom: 8px;
  position: relative;
}

.banker-area.turn {
  outline: 2px solid #ffe27a;
}

.area-label,
.my-label {
  font-size: 11px;
  color: #9fc4b6;
  margin-bottom: 4px;
}

.natural {
  color: #ffe27a;
  font-weight: bold;
}

.bust-tag {
  color: #ff9f9f;
  font-weight: bold;
}

.cards {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  min-height: 44px;
  align-items: center;
}

.pcard {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 52px;
  background: #fff;
  color: #222;
  border-radius: 6px;
  font-size: 15px;
  font-weight: bold;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35);
}

.pcard.red {
  color: #d63031;
}

.pcard.sm {
  width: 30px;
  height: 42px;
  font-size: 12px;
}

.card-back {
  display: inline-block;
  width: 38px;
  height: 52px;
  border-radius: 6px;
  background: repeating-linear-gradient(45deg, #35506b, #35506b 4px, #2a4058 4px, #2a4058 8px);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.35);
}

.value-badge {
  position: absolute;
  right: 10px;
  top: 8px;
  background: #ffe27a;
  color: #5b4300;
  font-size: 12px;
  font-weight: bold;
  border-radius: 10px;
  padding: 2px 8px;
}

.players-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin-bottom: 8px;
}

.p-cell {
  flex: 1;
  min-width: 96px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  padding: 8px;
  border: 2px solid transparent;
}

.p-cell.act {
  border-color: #7ea0ff;
}

.p-cell.bust {
  opacity: 0.55;
}

.p-name {
  font-size: 11px;
  color: #cfe3da;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.waiting {
  font-size: 12px;
  color: #9fc4b6;
}

.p-tag {
  font-size: 10px;
  color: #9fc4b6;
  margin-top: 4px;
}

.my-meta {
  font-size: 11px;
  color: #9fc4b6;
  margin-top: 4px;
}

.settle-bar {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 6px 10px;
  margin-bottom: 8px;
  font-size: 12px;
}

.s-item {
  display: flex;
  gap: 6px;
  align-items: baseline;
  padding: 2px 0;
}

.s-item b.pos {
  color: #7bed9f;
}

.s-item b.neg {
  color: #ff9f9f;
}

.outcome {
  color: #9fc4b6;
  font-size: 11px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  padding: 4px 0;
}

.hint {
  font-size: 12px;
  color: #9fc4b6;
}

.btn {
  border: none;
  border-radius: 10px;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: bold;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.4;
}

.btn.bet {
  background: #ffe27a;
  color: #5b4300;
}

.btn.hit {
  background: #7bed9f;
  color: #14432a;
}

.btn.stand {
  background: #7ea0ff;
  color: #14264d;
}

.btn.double {
  background: #ffcf5c;
  color: #5b4300;
}

.btn.pass {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}

.idle-tip,
.empty-tip {
  text-align: center;
  font-size: 12px;
  color: #9fc4b6;
  padding: 6px 0;
}
</style>
