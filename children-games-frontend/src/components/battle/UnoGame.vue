<template>
  <div class="uno-wrap">
    <!-- 终局 -->
    <template v-if="phase === 'ended' && final">
      <div class="uno-final">
        <div class="uf-title">🏁 UNO 结束（{{ final.reason }}）</div>
        <div v-for="(r, i) in final.ranking" :key="r.userId" class="uf-row" :class="{ me: r.userId === myId, top: i === 0 }">
          <span class="uf-rank">{{ ['🥇', '🥈', '🥉'][i] || `${i + 1}.` }}</span>
          <span class="uf-name">{{ r.nickname }}<template v-if="r.userId === myId">（我）</template></span>
          <span class="uf-score">{{ i === 0 ? '获胜 🎉' : `剩 ${r.penalty} 分` }}</span>
        </div>
        <div class="uf-tip">等待房主发起「再来一局」</div>
      </div>
    </template>

    <template v-else>
      <!-- 状态条 -->
      <div class="uno-status">
        <span class="color-lamp" :class="currentColor" />
        <span>{{ currentColorLabel }}</span>
        <span class="dir">{{ direction === 1 ? '↻ 顺时针' : '↺ 逆时针' }}</span>
        <span class="turn">{{ turnText }}</span>
      </div>

      <!-- 牌堆 / 弃牌堆 / 各家牌数 -->
      <div class="table">
        <div class="pile draw-pile" @click="doDraw">
          <span class="pile-label">摸牌</span>
        </div>
        <div class="pile discard" :style="{ borderColor: colorCss(top?.color || '') }">
          <span class="pile-card" :style="{ color: textColor(top) }">{{ cardLabel(top) }}</span>
        </div>
        <div class="counts">
          <div v-for="c in counts" :key="c.userId" class="count-row" :class="{ active: c.userId === turnSeat, me: c.userId === myId }">
            {{ nameOf(c.userId) }}：{{ c.count }} 张
          </div>
        </div>
      </div>

      <!-- 万能选色 -->
      <div v-if="pickingColor" class="color-picker">
        <div class="cp-title">选择颜色</div>
        <div class="cp-colors">
          <button v-for="c in UNO_COLORS" :key="c" class="cp-color" :class="c" @click="confirmColor(c)" />
        </div>
      </div>

      <!-- 手牌 -->
      <div class="hand">
        <button
          v-for="card in myHand"
          :key="card.id"
          class="uno-card"
          :class="{ playable: isPlayable(card), wild: card.color === 'wild' }"
          :disabled="!myTurn || !isPlayable(card)"
          :style="{ borderColor: colorCss(card.color), color: textColor(card) }"
          @click="play(card)"
        >
          {{ cardLabel(card) }}
        </button>
        <div v-if="myHand.length === 0" class="hand-empty">你的手牌出完了</div>
      </div>
      <div class="hand-tip">
        {{ myTurn ? (drawnThisTurn ? '已摸牌：能出就出，不能出点「跳过」' : '轮到你了：出牌或点「摸牌」') : '等待其他玩家…' }}
      </div>
      <button v-if="myTurn && drawnThisTurn" class="pass-btn" @click="emit('action', { t: 'uno_pass' })">跳过</button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useUserStore } from '@/store/user';

const UNO_COLORS = ['red', 'yellow', 'green', 'blue'];

interface Card {
  id: string;
  color: string;
  kind: string;
}

const props = defineProps<{
  state: any; // serializeFor
  events: Record<string, any>;
  members: Array<{ userId: number; nickname: string; seat: number }>;
  phase: string;
  mySeat: number;
}>();

const emit = defineEmits<{ (e: 'action', action: Record<string, unknown>): void }>();

const userStore = useUserStore();
const myId = computed(() => userStore.userInfo?.id || 0);

const myHand = computed<Card[]>(() => {
  const fromEvent = props.events?.uno_hand?.cards;
  if (Array.isArray(fromEvent) && fromEvent.length) return fromEvent;
  return props.state?.myHand || [];
});
const top = computed<Card | null>(() => props.state?.top || null);
const currentColor = computed(() => props.state?.currentColor || 'red');
const direction = computed(() => props.state?.direction || 1);
const turnSeat = computed(() => props.state?.turnSeat ?? -1);
const counts = computed<any[]>(() => props.state?.counts || []);
const drawnThisTurn = computed(() => {
  // 以最近一次 uno_drew/uno_turn 事件判断（简化：uno_turn 重置，uno_drew 标记）
  const drew = props.events.drew as any;
  const turn = props.events.turn as any;
  if (turn && drew && Number(drew.seq) >= Number(turn.seq)) return true;
  return drawnLocal.value;
});
const drawnLocal = ref(false);
const myTurn = computed(() => props.phase === 'playing' && turnSeat.value === (props.members.find((m) => m.userId === myId.value)?.seat ?? -1));
// 终局：优先实时事件，兜底快照里的 ended 摘要（刷新/重连后事件已丢）
const final = computed<any | null>(() => props.events.final || props.state?.ended || null);
const pickingColor = ref(false);
const pendingCard = ref<Card | null>(null);

const nameOf = (userId: number): string => {
  if (userId === myId.value) return '我';
  return props.members?.find((m) => m.userId === userId)?.nickname || `角色${userId}`;
};

const colorCss = (color: string): string => ({ red: '#e74c3c', yellow: '#f1c40f', green: '#27ae60', blue: '#2980b9', wild: '#667eea' }[color] || '#999');
const textColor = (card: Card | null): string => {
  if (!card) return '#999';
  if (card.color === 'wild') return '#667eea';
  if (card.color === 'yellow') return '#b8860b';
  return colorCss(card.color);
};
const cardLabel = (card: Card | null): string => {
  if (!card) return '—';
  const labels: Record<string, string> = { skip: '⊘ 跳过', reverse: '⇄ 反转', draw2: '+2', wild: '万能', wild4: '万能+4' };
  return labels[card.kind] || card.kind;
};
const currentColorLabel = computed(() => {
  const map: Record<string, string> = { red: '🔴 红色', yellow: '🟡 黄色', green: '🟢 绿色', blue: '🔵 蓝色' };
  return map[currentColor.value] || '';
});

const isPlayable = (card: Card): boolean => {
  if (!myTurn.value || !top.value) return false;
  if (card.color === 'wild') return true;
  if (card.color === currentColor.value) return true;
  return card.kind === top.value.kind;
};

const turnSeq = ref(0);
const drawnLocalGuard = () => {
  turnSeq.value += 1;
  drawnLocal.value = false;
};
void drawnLocalGuard;

const play = (card: Card) => {
  if (!isPlayable(card)) return;
  if (card.color === 'wild') {
    pendingCard.value = card;
    pickingColor.value = true;
    return;
  }
  emit('action', { t: 'uno_play', cardId: card.id });
  drawnLocal.value = false;
};

const confirmColor = (c: string) => {
  if (!pendingCard.value) return;
  emit('action', { t: 'uno_play', cardId: pendingCard.value.id, chooseColor: c });
  pickingColor.value = false;
  pendingCard.value = null;
  drawnLocal.value = false;
};

const doDraw = () => {
  if (!myTurn.value || drawnThisTurn.value) return;
  emit('action', { t: 'uno_draw' });
  drawnLocal.value = true;
};

const turnText = computed(() => {
  if (props.phase !== 'playing') return '';
  const seatName = nameOfBySeat(turnSeat.value);
  return myTurn.value ? '你的回合' : `${seatName} 的回合`;
});
const nameOfBySeat = (seat: number): string => {
  const m = props.members.find((x) => x.seat === seat);
  if (!m) return '?';
  return m.userId === myId.value ? '我' : m.nickname;
};
</script>

<style scoped>
.uno-wrap {
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  margin-bottom: 10px;
}

.uno-status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #555;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.color-lamp {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #ddd;
}

.color-lamp.red { background: #e74c3c; }
.color-lamp.yellow { background: #f1c40f; }
.color-lamp.green { background: #27ae60; }
.color-lamp.blue { background: #2980b9; }

.turn {
  font-weight: bold;
  color: #667eea;
}

.table {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

.pile {
  width: 74px;
  height: 104px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.draw-pile {
  background: #f0f2f5;
  border: 2px dashed #c3c8d0;
  cursor: pointer;
  flex-direction: column;
}

.draw-pile:active {
  transform: scale(0.96);
}

.pile-label {
  font-size: 12px;
  color: #888;
}

.discard {
  border: 3px solid #999;
  background: #fffdf7;
}

.pile-card {
  font-size: 22px;
  font-weight: bold;
}

.counts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.count-row {
  font-size: 12px;
  color: #888;
  padding: 3px 10px;
  border-radius: 8px;
  background: #f8f9fb;
}

.count-row.active {
  color: #667eea;
  background: #eef1fd;
  font-weight: bold;
}

.count-row.me {
  border: 1px solid #c9d1f5;
}

.color-picker {
  background: #fff8e8;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 10px;
  text-align: center;
}

.cp-title {
  font-size: 12px;
  color: #555;
  margin-bottom: 8px;
}

.cp-colors {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.cp-color {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  cursor: pointer;
}

.cp-color.red { background: #e74c3c; }
.cp-color.yellow { background: #f1c40f; }
.cp-color.green { background: #27ae60; }
.cp-color.blue { background: #2980b9; }

.hand {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.uno-card {
  width: 58px;
  height: 84px;
  border-radius: 10px;
  border: 3px solid #ddd;
  background: #fff;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.12s ease;
  word-break: break-word;
  padding: 4px;
}

.uno-card.wild {
  background: linear-gradient(135deg, #e74c3c 0%, #f1c40f 40%, #27ae60 70%, #2980b9 100%);
  color: #fff;
}

.uno-card.playable {
  transform: translateY(-6px);
  box-shadow: 0 4px 10px rgba(102, 126, 234, 0.35);
}

.uno-card:disabled {
  opacity: 0.45;
  cursor: default;
  transform: none;
  box-shadow: none;
}

.hand-empty {
  font-size: 13px;
  color: #27ae60;
  padding: 20px 0;
}

.hand-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
  text-align: center;
}

.pass-btn {
  display: block;
  margin: 6px auto 0;
  border: 1px solid #e3e8ef;
  background: #fff;
  color: #888;
  font-size: 12px;
  padding: 6px 18px;
  border-radius: 10px;
  cursor: pointer;
}

.uno-final .uf-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin-bottom: 10px;
}

.uf-row {
  display: flex;
  gap: 10px;
  background: #f8f9fb;
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 6px;
}

.uf-row.top {
  background: #fff8e8;
}

.uf-row.me {
  border: 2px solid #667eea;
}

.uf-rank {
  width: 30px;
}

.uf-name {
  flex: 1;
  text-align: left;
  font-size: 14px;
  color: #333;
}

.uf-score {
  font-weight: bold;
  color: #667eea;
}

.uf-tip {
  font-size: 12px;
  color: #999;
  margin-top: 6px;
}
</style>
