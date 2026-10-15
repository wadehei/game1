<template>
  <div class="bet-ledger" :class="`theme-${theme}`">
    <button class="bl-head" @click="open = !open">
      <span class="bl-title">💰 投注明细</span>
      <span class="bl-sum">
        我的投入 <b>{{ myBet }}</b> 分
        <template v-if="hasMySettled"> · 我的输赢 <b :class="myNet > 0 ? 'pos' : myNet < 0 ? 'neg' : ''">{{ myNetText }}</b></template>
      </span>
      <span class="bl-toggle">{{ open ? '收起 ▲' : `全员 ${entries.length} 条 ▼` }}</span>
    </button>
    <div v-if="open" class="bl-list">
      <div v-for="(e, i) in sorted" :key="i" class="bl-row" :class="{ mine: e.userId === myId }">
        <span class="bl-round">第{{ e.round }}手</span>
        <span class="bl-name">{{ nameOf(e.userId) }}<template v-if="e.userId === myId">（我）</template></span>
        <span class="bl-bet">投 {{ e.bet }} 分<template v-if="e.note">（{{ e.note }}）</template></span>
        <span class="bl-tag">{{ e.tag || (e.delta === null ? '未结算' : '') }}</span>
        <span class="bl-delta" :class="e.delta == null ? '' : e.delta > 0 ? 'pos' : e.delta < 0 ? 'neg' : ''">
          {{ e.delta === null ? '—' : e.delta > 0 ? `+${e.delta}` : e.delta }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

export interface BetLedgerEntry {
  userId: number;
  round: number;
  /** 本手投入（含加注/加倍/比牌费） */
  bet: number;
  /** 附加说明（如「加倍」） */
  note?: string;
  /** 本手净输赢，null=未结算 */
  delta: number | null;
  /** 结果文案（赢/输/平/爆牌/弃牌…） */
  tag?: string;
}

const props = withDefaults(
  defineProps<{
    entries: BetLedgerEntry[];
    members: Array<{ userId: number; nickname: string }>;
    myId: number;
    theme?: 'green' | 'purple';
  }>(),
  { theme: 'green' }
);

const open = ref(false);

const sorted = computed(() => [...props.entries].sort((a, b) => a.round - b.round));
const nameOf = (uid: number): string => props.members.find((m) => m.userId === uid)?.nickname || `角色${uid}`;

const myEntries = computed(() => props.entries.filter((e) => e.userId === props.myId));
const myBet = computed(() => myEntries.value.reduce((s, e) => s + (e.bet || 0), 0));
const mySettled = computed(() => myEntries.value.filter((e) => e.delta !== null));
const hasMySettled = computed(() => mySettled.value.length > 0);
const myNet = computed(() => mySettled.value.reduce((s, e) => s + (e.delta || 0), 0));
const myNetText = computed(() => (myNet.value > 0 ? `+${myNet.value}` : `${myNet.value}`));
</script>

<style scoped>
.bet-ledger {
  border-radius: 10px;
  margin-bottom: 8px;
  font-size: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}

.bl-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.bl-title {
  font-weight: bold;
  white-space: nowrap;
}

.bl-sum {
  flex: 1;
  color: #cfe3da;
  min-width: 0;
}

.theme-purple .bl-sum {
  color: #d9c8ee;
}

.bl-sum b {
  color: #ffe27a;
}

.bl-sum b.pos {
  color: #7bed9f;
}

.bl-sum b.neg {
  color: #ff9f9f;
}

.bl-toggle {
  font-size: 11px;
  color: #9fc4b6;
  white-space: nowrap;
}

.theme-purple .bl-toggle {
  color: #d9c8ee;
}

.bl-list {
  padding: 2px 10px 7px;
  max-height: 168px;
  overflow-y: auto;
}

.bl-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
}

.bl-row.mine .bl-name {
  color: #ffe27a;
}

.bl-round {
  color: #9fc4b6;
  white-space: nowrap;
}

.theme-purple .bl-round {
  color: #d9c8ee;
}

.bl-name {
  flex-shrink: 0;
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bl-bet {
  flex: 1;
  min-width: 0;
}

.bl-tag {
  color: #9fc4b6;
  font-size: 11px;
  white-space: nowrap;
}

.theme-purple .bl-tag {
  color: #d9c8ee;
}

.bl-delta {
  min-width: 34px;
  text-align: right;
  font-weight: bold;
}

.bl-delta.pos {
  color: #7bed9f;
}

.bl-delta.neg {
  color: #ff9f9f;
}
</style>
