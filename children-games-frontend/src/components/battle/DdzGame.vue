<template>
  <div class="ddz-wrap">
    <!-- 终局：全员胜利结算面板（带动画） -->
    <BattleResultPanel
      v-if="phase === 'ended' && final"
      title="🃏 斗地主 战局结算"
      :ranking="final.ranking"
      :my-id="myId"
      :reason="final.reason"
      :members="members"
    />

    <template v-else>
      <!-- 重开/待开局的空档：状态未到，先占位避免闪现 -->
      <div v-if="!state?.round" class="idle-tip pre-start">等待开局…</div>
      <template v-else>
        <!-- 状态条 -->
        <div class="ddz-status">
          <span class="round">第 {{ state?.round || 0 }}/{{ state?.totalRounds || 0 }} 局</span>
          <span v-if="state?.phase !== 'bidding'" class="stake">
            底注 <b>{{ (state?.bidBase || 0) * (state?.baseUnit || 0) }}</b>
          </span>
          <span v-if="(state?.multiplier || 1) > 1" class="mult"
            >倍数 ×{{ state?.multiplier }}</span
          >
          <span v-if="remainSec > 0" class="timer" :class="{ hurry: remainSec <= 5 }"
            >{{ remainSec }}s</span
          >
        </div>

        <!-- 每局流水（全员可见，行高亮自己） -->
        <BetLedger
          v-if="betLedger.length"
          :entries="betLedger"
          :members="members"
          :my-id="myId"
          theme="green"
        />

        <!-- 其他玩家（2 家） -->
        <div class="others">
          <div
            v-for="o in othersView"
            :key="o.userId"
            class="o-cell"
            :class="{ act: state?.turnSeat === o.seat }"
          >
            <div class="o-name">
              <span v-if="o.isLandlord" class="crown">👑</span>{{ o.nickname }}
            </div>
            <div class="o-tag">
              {{ o.bid === null ? '🤔 思考中' : o.bid === 0 ? '不叫' : `叫 ${o.bid} 分` }}
            </div>
            <div class="o-count">剩 {{ o.cardCount }} 张</div>
          </div>
        </div>

        <!-- 底牌（地主确定后公开） -->
        <div v-if="bottomCards" class="bottom-cards">
          <span class="bc-label">底牌</span>
          <span v-for="(c, i) in bottomCards" :key="i" class="pcard xs" :class="cardCls(c)">{{
            c
          }}</span>
          <span v-if="landlordName" class="bc-landlord">👑 {{ landlordName }}</span>
        </div>

        <!-- 中央出牌区：显示最后出牌 / 过 -->
        <div class="table-center">
          <template v-if="state?.phase === 'bidding'">
            <span class="tc-tip">叫地主中（{{ state?.bidBestScore || 0 }} 分起）</span>
          </template>
          <template v-else-if="state?.lastPlay">
            <span class="tc-name">{{ nameOfSeat(state.lastPlay.seat) }}</span>
            <span
              v-for="(c, i) in state.lastPlay.cards"
              :key="i"
              class="pcard sm"
              :class="cardCls(c)"
              >{{ c }}</span
            >
            <span class="tc-type">{{ state.lastPlay.cardType }}</span>
          </template>
          <template v-else-if="state?.phase === 'playing'">
            <span class="tc-tip">{{ nameOfSeat(state?.leadSeat) }} 的出牌权，任意出牌</span>
          </template>
          <template v-else>
            <span class="tc-tip">本局结算中…</span>
          </template>
        </div>

        <!-- 我的手牌（点击选牌，选中的上浮） -->
        <div class="my-cards">
          <button
            v-for="(c, i) in myCardsView"
            :key="i"
            class="pcard mine"
            :class="[cardCls(c), { sel: selected.has(i) }]"
            @click="toggleCard(i)"
          >
            {{ c }}
          </button>
          <div v-if="!myCardsView.length" class="look-hint">
            {{ state?.phase === 'bidding' ? '等待发牌…' : '本局已出完，等待结算' }}
          </div>
        </div>

        <!-- 本局结算 -->
        <div v-if="settle" class="settle-bar">
          <div class="s-title">
            {{ nameOfUser(settle.winner) }} {{ settle.landlordWin ? '（地主）' : '' }}本局获胜
            <span v-if="settle.spring === 'spring'" class="s-spring">🌸 春天 ×2</span>
            <span v-else-if="settle.spring === 'anti'" class="s-spring">🌾 反春 ×2</span>
            <span class="s-unit"
              >单局 {{ settle.unitScore }} 分（{{ settle.bid }} × {{ settle.baseUnit }} ×
              {{ settle.multiplier }}）</span
            >
            <span v-if="nextRemain > 0" class="s-next">· 下一局 {{ nextRemain }}s</span>
          </div>
          <div v-for="d in settle.deltas" :key="d.userId" class="s-item">
            {{ d.nickname }}<template v-if="d.role === 'landlord'">👑</template>
            <b :class="d.delta > 0 ? 'pos' : d.delta < 0 ? 'neg' : ''">{{
              d.delta > 0 ? `+${d.delta}` : d.delta
            }}</b>
          </div>
        </div>

        <!-- 操作区：叫分 -->
        <div v-if="myTurnToBid" class="actions mine">
          <button class="btn pass" @click="emit('action', { t: 'ddz_bid', score: 0 })">不叫</button>
          <button
            v-for="s in [1, 2, 3]"
            :key="s"
            class="btn call"
            :disabled="s <= (state?.bidBestScore || 0)"
            @click="emit('action', { t: 'ddz_bid', score: s })"
          >
            {{ s }} 分
          </button>
        </div>
        <!-- 操作区：出牌 -->
        <div v-else-if="myTurnToPlay" class="actions mine">
          <button class="btn play" :disabled="!selected.size" @click="playSelected">
            出牌{{ selected.size ? `（${selected.size} 张）` : '' }}
          </button>
          <button class="btn pass" :disabled="isLead" @click="emit('action', { t: 'ddz_pass' })">
            不出
          </button>
        </div>
        <div v-else-if="state?.phase === 'bidding' && state?.turnSeat >= 0" class="idle-tip">
          等待 {{ nameOfSeat(state.turnSeat) }} 叫分…
        </div>
        <div v-else-if="state?.phase === 'playing' && state?.turnSeat >= 0" class="idle-tip">
          等待 {{ nameOfSeat(state.turnSeat) }} 出牌…
        </div>
        <div v-else class="idle-tip">等待下一局…</div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useUserStore } from '@/store/user';
import { soundManager } from '@/utils/sound';
import BattleResultPanel from './BattleResultPanel.vue';
import BetLedger from './BetLedger.vue';
import type { DdzGameState } from '@/composables/wsTypes';

const props = defineProps<{
  state: DdzGameState;
  events: Record<string, any>;
  members: Array<{ userId: number; nickname: string; avatar?: string; seat: number }>;
  phase: string;
  mySeat: number;
}>();

const emit = defineEmits<{ (e: 'action', action: Record<string, unknown>): void }>();

const userStore = useUserStore();
const myId = computed(() => userStore.userInfo?.id || 0);

const final = computed(() => props.events.final);
const settle = computed(() => props.events.ddz_settle);
const bottomCards = computed(
  () => (props.events.ddz_bottom?.cards || props.state?.bottomCards) ?? null
);
const myCardsView = computed(() => props.state?.myCards || []);

/** 选中的手牌下标（同点数牌按张区分） */
const selected = ref(new Set<number>());
const toggleCard = (i: number) => {
  const next = new Set(selected.value);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  selected.value = next;
};
// 新一局发牌后清空选择
watch(
  () => props.state?.round,
  () => {
    selected.value = new Set();
  }
);
watch(
  () => props.state?.phase,
  (p) => {
    if (p === 'bidding') selected.value = new Set();
  }
);

const isMyTurn = computed(
  () => props.phase === 'playing' && props.state?.turnSeat === props.mySeat
);
const myTurnToBid = computed(() => isMyTurn.value && props.state?.phase === 'bidding');
const myTurnToPlay = computed(() => isMyTurn.value && props.state?.phase === 'playing');
const isLead = computed(() => props.state?.leadSeat === props.mySeat || !props.state?.lastPlay);

// 轮到自己：提示音（仅状态切换沿触发）
watch(isMyTurn, (now, before) => {
  if (now && !before) soundManager.playTurn();
});

const playSelected = () => {
  const cards = [...selected.value].map((i) => myCardsView.value[i]);
  if (!cards.length) return;
  emit('action', { t: 'ddz_play', cards });
  selected.value = new Set();
};

const othersView = computed<any[]>(() => props.state?.others || []);
const landlordName = computed(() => {
  const seat = props.state?.landlordSeat;
  if (seat === null || seat === undefined) return '';
  return nameOfSeat(seat);
});

const betLedger = computed<any[]>(() =>
  (props.state?.betLedger || []).map((e) => ({
    userId: e.userId,
    round: e.round,
    bet: e.bid * (props.state?.baseUnit || 1),
    delta: e.delta,
    tag: e.delta === null ? '' : e.ended || '',
  }))
);

/** 牌面样式：双王高亮、2 金色 */
const cardCls = (c: string): string => {
  if (c === 'W') return 'joker-big';
  if (c === 'w') return 'joker-small';
  if (c === '2') return 'gold';
  return '';
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

const remainSec = ref(0);
const nextRemain = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  timer = setInterval(() => {
    remainSec.value = Math.max(0, Math.ceil(((props.state?.deadline || 0) - Date.now()) / 1000));
    nextRemain.value =
      props.state?.phase === 'settle' && props.events.ddz_settle?.nextDeadline
        ? Math.max(0, Math.ceil((props.events.ddz_settle.nextDeadline - Date.now()) / 1000))
        : 0;
  }, 400);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.ddz-wrap {
  background: linear-gradient(160deg, #1f3a2e 0%, #12271d 100%);
  border-radius: 14px;
  padding: 12px;
  margin-bottom: 10px;
  color: #effaf3;
  position: relative;
}

.ddz-status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #c8e9d8;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.stake b {
  color: #ffe27a;
}

.mult {
  color: #ff9f6b;
  font-weight: bold;
}

.timer {
  font-weight: bold;
  color: #7bed9f;
}

.timer.hurry {
  color: #ff9f9f;
}

.others {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.o-cell {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 12px;
  border: 1px solid transparent;
}

.o-cell.act {
  border-color: #7bed9f;
  background: rgba(123, 237, 159, 0.12);
}

.o-name {
  font-weight: bold;
  margin-bottom: 2px;
}

.crown {
  margin-right: 3px;
}

.o-tag {
  color: #c8e9d8;
}

.o-count {
  color: #ffe27a;
}

/* 底牌 */
.bottom-cards {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 8px;
  font-size: 12px;
}

.bc-label {
  color: #c8e9d8;
}

.bc-landlord {
  color: #ffe27a;
}

/* 中央出牌区 */
.table-center {
  display: flex;
  align-items: center;
  gap: 5px;
  justify-content: center;
  min-height: 44px;
  background: rgba(0, 0, 0, 0.18);
  border-radius: 10px;
  padding: 6px 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.tc-name {
  color: #c8e9d8;
  margin-right: 4px;
}

.tc-type {
  color: #ffe27a;
  font-weight: bold;
  margin-left: 4px;
}

.tc-tip {
  color: #9fc7b2;
  font-size: 12px;
}

/* 牌面 */
.pcard {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fdfdf8;
  color: #1c2438;
  border-radius: 6px;
  font-weight: bold;
  border: 1px solid #d9d9d0;
}

.pcard.xs {
  font-size: 11px;
  padding: 2px 5px;
}

.pcard.sm {
  font-size: 13px;
  padding: 4px 8px;
}

.pcard.mine {
  font-size: 16px;
  padding: 10px 9px;
  min-width: 34px;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

.pcard.mine.sel {
  transform: translateY(-10px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
  border-color: #7bed9f;
}

.pcard.joker-big {
  color: #d63031;
  border-color: #d63031;
}

.pcard.joker-small {
  color: #0984e3;
  border-color: #0984e3;
}

.pcard.gold {
  color: #b8860b;
}

/* 我的手牌 */
.my-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  min-height: 56px;
  align-items: flex-end;
  padding: 12px 0 6px;
}

.look-hint {
  color: #9fc7b2;
  font-size: 12px;
}

/* 结算条 */
.settle-bar {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 8px 10px;
  margin-top: 6px;
  font-size: 12px;
}

.s-title {
  color: #ffe27a;
  font-weight: bold;
  margin-bottom: 5px;
}

.s-spring {
  color: #ff9ff3;
  margin-left: 6px;
}

.s-unit {
  color: #c8e9d8;
  font-weight: normal;
  margin-left: 6px;
}

.s-next {
  color: #7bed9f;
}

.s-item {
  display: inline-block;
  margin-right: 12px;
}

.s-item .pos {
  color: #7bed9f;
}

.s-item .neg {
  color: #ff9f9f;
}

/* 操作区 */
.actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 10px;
}

.actions .btn {
  border: none;
  border-radius: 9px;
  padding: 9px 16px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
}

.actions .btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn.call {
  background: linear-gradient(135deg, #ff9f43, #ee5a24);
  color: #fff;
}

.btn.play {
  background: linear-gradient(135deg, #7bed9f, #10ac84);
  color: #fff;
}

.btn.pass {
  background: rgba(255, 255, 255, 0.14);
  color: #effaf3;
}

.idle-tip {
  text-align: center;
  color: #9fc7b2;
  font-size: 12px;
  padding: 10px 0;
}

.pre-start {
  padding: 30px 0;
}
</style>
