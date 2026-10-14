<template>
  <div class="room-page">
    <!-- 顶栏 -->
    <div class="room-top">
      <button class="rt-exit" @click="askExit">‹ 退出</button>
      <div class="rt-code" @click="copyCode">
        房间 <b>{{ roomId }}</b>
        <span class="rt-copy">{{ copied ? '已复制' : '复制' }}</span>
      </div>
      <button v-if="isHost" class="rt-disband" @click="askDisband">解散</button>
      <span v-else class="rt-placeholder" />
    </div>

    <!-- 连接状态 -->
    <div v-if="wsStatus !== 'open'" class="conn-tip">连接中…（断线会自动重连）</div>

    <!-- 座位 -->
    <div class="seats">
      <div class="seat" :class="{ active: phase === 'playing' && game.turn === BLACK }">
        <div class="seat-stone black" />
        <div class="seat-name">{{ seatName(0) }}</div>
        <div class="seat-state">{{ seatState(0) }}</div>
      </div>
      <div class="vs">VS</div>
      <div class="seat" :class="{ active: phase === 'playing' && game.turn === WHITE }">
        <div class="seat-stone white" />
        <div class="seat-name">{{ seatName(1) }}</div>
        <div class="seat-state">{{ seatState(1) }}</div>
      </div>
    </div>
    <div v-if="spectatorCount > 0" class="spectators">👀 {{ spectatorCount }} 人观战</div>

    <!-- 状态条 -->
    <div class="status-line">
      <template v-if="phase === 'waiting'">
        {{ waitingText }}
      </template>
      <template v-else-if="phase === 'playing'">
        {{ !mySeatHasPlayer ? '对局进行中，你正在观战' : game.turn === myColor ? '轮到你落子' : '等待对方落子…' }}
      </template>
      <template v-else>
        {{ overText }}
      </template>
    </div>

    <!-- 棋盘 -->
    <div class="board-wrap">
      <div class="board">
        <template v-for="y in BOARD_SIZE" :key="`r${y}`">
          <div
            v-for="x in BOARD_SIZE"
            :key="`c${x}`"
            class="cell"
            :class="{ win: isWinCell(x - 1, y - 1) }"
            @click="tapCell(x - 1, y - 1)"
          >
            <span
              v-if="stoneAt(x - 1, y - 1)"
              class="stone"
              :class="[stoneAt(x - 1, y - 1) === 1 ? 'black' : 'white', { last: isLast(x - 1, y - 1) }]"
            />
          </div>
        </template>
      </div>
    </div>

    <!-- 操作区 -->
    <div class="actions">
      <button v-if="phase === 'waiting' && mySeat >= 0 && !myReady" class="act ready" @click="send({ t: 'ready' })">
        准备
      </button>
      <template v-if="phase === 'playing' && mySeat >= 0">
        <button class="act resign" @click="askResign">认输</button>
      </template>
      <template v-if="phase === 'ended' && mySeat >= 0">
        <button class="act ready" :disabled="myRematch" @click="send({ t: 'rematch' })">
          {{ myRematch ? '已表决，等对方…' : '再来一局' }}
        </button>
      </template>
    </div>

    <!-- 聊天区 -->
    <div class="chat-card">
      <div class="chat-list" ref="chatListEl">
        <div v-for="(m, i) in chatList" :key="i" class="chat-msg" :class="{ mine: m.userId === myId }">
          <template v-if="m.kind === 'emoji'">
            <span class="chat-nick">{{ m.userId === myId ? '我' : m.nickname }}</span>
            <span class="chat-emoji">{{ m.content }}</span>
          </template>
          <template v-else-if="m.kind === 'quick'">
            <span class="chat-nick">{{ m.userId === myId ? '我' : m.nickname }}</span>
            <span class="chat-quick">【快捷】{{ m.content }}</span>
          </template>
          <template v-else>
            <span class="chat-nick">{{ m.userId === myId ? '我' : m.nickname }}</span>
            <span class="chat-text">{{ m.content }}</span>
          </template>
        </div>
        <div v-for="v in voiceList" :key="v.voiceId" class="chat-msg" :class="{ mine: v.userId === myId }">
          <span class="chat-nick">{{ v.userId === myId ? '我' : v.nickname }}</span>
          <button class="voice-bubble" :class="{ playing: playingVoice === v.voiceId }" @click="playVoice(v)">
            ▶ {{ playingVoice === v.voiceId ? '播放中' : `${v.duration}"` }}
          </button>
        </div>
        <div v-if="!chatList.length && !voiceList.length" class="chat-empty">还没有人说话，来打个招呼吧～</div>
      </div>

      <!-- 录音状态 -->
      <div v-if="recorder.recording.value" class="rec-bar">
        <span class="rec-dot" /> 正在录音 {{ recorder.seconds.value }}"（松开发送）
      </div>

      <!-- 快捷面板 -->
      <div v-if="panel === 'emoji'" class="panel">
        <div class="panel-grid">
          <button v-for="e in ROOM_EMOJIS" :key="e" class="emoji-cell" @click="sendQuick('emoji', e)">{{ e }}</button>
        </div>
      </div>
      <div v-if="panel === 'quick'" class="panel">
        <button v-for="p in QUICK_PHRASES" :key="p" class="phrase-cell" @click="sendQuick('quick', p)">{{ p }}</button>
      </div>

      <!-- 输入栏 -->
      <div class="chat-bar">
        <button class="bar-btn" :class="{ on: panel === 'emoji' }" @click="panel = panel === 'emoji' ? '' : 'emoji'">😊</button>
        <button class="bar-btn" :class="{ on: panel === 'quick' }" @click="panel = panel === 'quick' ? '' : 'quick'">💬</button>
        <input
          v-model="chatInput"
          class="chat-input"
          maxlength="100"
          placeholder="说点什么…"
          @keyup.enter="sendText"
        />
        <button
          class="bar-btn mic"
          :class="{ rec: recorder.recording.value }"
          @mousedown.prevent="micDown"
          @mouseup.prevent="micUp"
          @touchstart.prevent="micDown"
          @touchend.prevent="micUp"
          @touchcancel.prevent="micUp"
        >🎙️</button>
        <button class="send-btn" :disabled="!chatInput.trim()" @click="sendText">发送</button>
      </div>
      <div v-if="recorder.error.value" class="rec-err">{{ recorder.error.value }}</div>
    </div>

    <!-- 确认弹层 -->
    <div v-if="confirmBox" class="mask" @click.self="confirmBox = null">
      <div class="confirm">
        <div class="confirm-text">{{ confirmBox.text }}</div>
        <div class="confirm-btns">
          <button class="c-cancel" @click="confirmBox = null">取消</button>
          <button class="c-ok" @click="confirmBox.ok(); confirmBox = null">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/store/user';
import { useRoomWs } from '@/composables/useRoomWs';
import { useRecorder } from '@/composables/useRecorder';
import { fetchRoomVoice, uploadRoomVoice } from '@/api/room';
import { QUICK_PHRASES, ROOM_EMOJIS } from '@/utils/quickChat';
import { soundManager } from '@/utils/sound';

const BOARD_SIZE = 15;
const BLACK = 1;
const WHITE = 2;

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const roomId = String(route.params.roomId || '');

const myId = computed(() => userStore.userInfo?.id || 0);

interface MemberInfo {
  userId: number;
  nickname: string;
  avatar: string;
  seat: number;
  ready: boolean;
  online: boolean;
}
interface ChatItem {
  userId: number;
  nickname: string;
  kind: 'text' | 'emoji' | 'quick';
  content: string;
  ts: number;
}
interface VoiceItem {
  voiceId: string;
  userId: number;
  nickname: string;
  duration: number;
  ts: number;
}

const wsStatus = ref<'connecting' | 'open' | 'closed'>('closed');
const members = ref<MemberInfo[]>([]);
const phase = ref<'waiting' | 'playing' | 'ended'>('waiting');
const hostUserId = ref(0);
const mySeat = ref(-1);
const board = ref<number[][]>(Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0)));
const game = ref({ turn: BLACK, winner: 0, winLine: [] as [number, number][], lastMove: null as { x: number; y: number } | null });
const chatList = ref<ChatItem[]>([]);
const voiceList = ref<VoiceItem[]>([]);
const overReason = ref('');

const chatInput = ref('');
const panel = ref<'' | 'emoji' | 'quick'>('');
const chatListEl = ref<HTMLElement | null>(null);
const playingVoice = ref('');
const confirmBox = ref<{ text: string; ok: () => void } | null>(null);

const recorder = useRecorder();

const ws = useRoomWs();

const isHost = computed(() => hostUserId.value === myId.value);
const myColor = computed(() => (mySeat.value === 0 ? BLACK : mySeat.value === 1 ? WHITE : 0));
const mySeatHasPlayer = computed(() => mySeat.value >= 0);
const myReady = computed(() => members.value.find((m) => m.userId === myId.value)?.ready || false);
const rematchVotes = ref<number[]>([]);
const myRematch = computed(() => rematchVotes.value.includes(myId.value));
const spectatorCount = computed(() => members.value.filter((m) => m.seat < 0).length);
const players = computed(() => members.value.filter((m) => m.seat >= 0));

const seatName = (seat: number): string => {
  const m = members.value.find((x) => x.seat === seat);
  if (!m) return '等待加入…';
  return `${m.nickname}${m.userId === myId.value ? '（我）' : ''}${m.online ? '' : ' · 离线'}`;
};

const seatState = (seat: number): string => {
  const m = members.value.find((x) => x.seat === seat);
  if (!m) return '';
  if (phase.value === 'waiting') return m.ready ? '已准备' : '未准备';
  if (phase.value === 'ended') return game.value.winner === seat + 1 ? '获胜 🎉' : game.value.winner === 3 ? '平局' : '惜败';
  return seat === 0 ? '执黑' : '执白';
};

const waitingText = computed(() => {
  if (players.value.length < 2) return '等待另一位玩家加入…把房间码发给朋友吧';
  if (mySeat.value >= 0) return myReady.value ? '等待对方准备…' : '准备好了就点「准备」开局';
  return '等待玩家准备开局…';
});

const overText = computed(() => {
  if (game.value.winner === 3) return '棋盘已满，平局！';
  const winnerSeat = game.value.winner - 1;
  const w = members.value.find((m) => m.seat === winnerSeat);
  const who = w ? (w.userId === myId.value ? '你' : w.nickname) : '';
  return `${who}获胜！（${overReason.value}）`;
});

const stoneAt = (x: number, y: number): number => board.value[y]?.[x] || 0;
const isLast = (x: number, y: number): boolean => !!game.value.lastMove && game.value.lastMove.x === x && game.value.lastMove.y === y;
const isWinCell = (x: number, y: number): boolean => game.value.winLine.some(([wx, wy]) => wx === x && wy === y);

const scrollChat = () => nextTick(() => chatListEl.value?.scrollTo({ top: chatListEl.value.scrollHeight }));

const applySnapshot = (s: any) => {
  members.value = s.members || [];
  phase.value = s.phase;
  hostUserId.value = s.hostUserId;
  board.value = s.game?.board || board.value;
  game.value = {
    turn: s.game?.turn ?? BLACK,
    winner: s.game?.winner ?? 0,
    winLine: s.game?.winLine || [],
    lastMove: s.game?.lastMove || null,
  };
  chatList.value = s.chat || [];
  const me = members.value.find((m) => m.userId === myId.value);
  if (me) mySeat.value = me.seat;
  scrollChat();
};

const send = (obj: Record<string, unknown>) => ws.send(obj);

const tapCell = (x: number, y: number) => {
  if (phase.value !== 'playing' || mySeat.value < 0) return;
  if (game.value.turn !== myColor.value) return;
  if (stoneAt(x, y)) return;
  soundManager.playClick();
  send({ t: 'move', x, y });
};

const sendText = () => {
  const text = chatInput.value.trim();
  if (!text) return;
  send({ t: 'chat', kind: 'text', content: text });
  chatInput.value = '';
};

const sendQuick = (kind: 'emoji' | 'quick', content: string) => {
  send({ t: 'chat', kind, content });
  panel.value = '';
};

// ── 语音：按住说话 ──
let micHold = false;
const micDown = async () => {
  if (micHold || recorder.recording.value) return;
  micHold = true;
  await recorder.start();
};
const micUp = async () => {
  if (!micHold) return;
  micHold = false;
  const result = await recorder.stop();
  if (!result || result.duration < 1) return; // 太短丢弃
  try {
    await uploadRoomVoice(roomId, result.blob, result.duration);
    // 服务端广播给全房间（包括自己），语音气泡由 voice 事件统一渲染
  } catch (e) {
    recorder.error.value = e instanceof Error ? e.message : '语音发送失败';
  }
};

let voiceAudio: HTMLAudioElement | null = null;
const playVoice = async (v: VoiceItem) => {
  if (playingVoice.value === v.voiceId) {
    voiceAudio?.pause();
    playingVoice.value = '';
    return;
  }
  voiceAudio?.pause();
  playingVoice.value = v.voiceId;
  try {
    const blob = await fetchRoomVoice(roomId, v.voiceId);
    const audio = new Audio(URL.createObjectURL(blob));
    voiceAudio = audio;
    audio.onended = () => (playingVoice.value = '');
    await audio.play();
  } catch {
    playingVoice.value = '';
  }
};

// ── 退出/解散 ──
const doExit = () => {
  send({ t: 'leave' });
  ws.close();
  router.replace('/battle');
};

const askExit = () => {
  if (phase.value === 'playing' && mySeat.value >= 0) {
    confirmBox.value = {
      text: '对局正在进行，退出将判你认输，确定退出？',
      ok: () => {
        send({ t: 'resign' });
        doExit();
      },
    };
    return;
  }
  doExit();
};

const askDisband = () => {
  confirmBox.value = {
    text: '解散后房间立即销毁，聊天和语音全部清空，确定？',
    ok: () => {
      send({ t: 'disband' });
      ws.close();
      router.replace('/battle');
    },
  };
};

const copyCode = async () => {
  try {
    await navigator.clipboard.writeText(roomId);
    setTimeout(() => (copied.value = false), 1500);
    copied.value = true;
  } catch {
    // 剪贴板不可用时静默
  }
};
const copied = ref(false);

const askResign = () => {
  confirmBox.value = {
    text: '确定认输吗？',
    ok: () => send({ t: 'resign' }),
  };
};

onMounted(() => {
  ws.on('joined', (m: any) => {
    mySeat.value = m.yourSeat;
    wsStatus.value = 'open';
    applySnapshot(m);
  });
  ws.on('snapshot', applySnapshot);
  ws.on('member_update', (m: any) => (members.value = m.members || []));
  ws.on('move', (m: any) => {
    if (board.value[m.y]) board.value[m.y][m.x] = m.color;
    game.value.turn = m.turn;
    game.value.lastMove = m.lastMove;
    if (m.winner) {
      game.value.winner = m.winner;
      game.value.winLine = m.winLine || [];
    }
    soundManager.playClick();
  });
  ws.on('game_start', (m: any) => {
    phase.value = m.phase;
    board.value = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    game.value = { turn: BLACK, winner: 0, winLine: [], lastMove: null };
  });
  ws.on('game_restart', (m: any) => {
    phase.value = m.phase;
    board.value = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    game.value = { turn: BLACK, winner: 0, winLine: [], lastMove: null };
  });
  ws.on('game_over', (m: any) => {
    phase.value = 'ended';
    overReason.value = m.reason || '';
    rematchVotes.value = [];
  });
  ws.on('rematch_vote', (m: any) => {
    rematchVotes.value = m.userIds || [];
  });
  ws.on('chat', (m: any) => {
    chatList.value.push(m);
    if (chatList.value.length > 100) chatList.value.shift();
    scrollChat();
  });
  ws.on('voice', (m: any) => {
    voiceList.value.push(m);
    if (voiceList.value.length > 50) voiceList.value.shift();
    scrollChat();
  });
  ws.on('closed', (m: any) => {
    alert(m.reason || '房间已解散');
    ws.close();
    router.replace('/battle');
  });
  ws.on('error', (m: any) => {
    if (m.message?.includes('房间不存在')) {
      alert(m.message);
      ws.close();
      router.replace('/battle');
    }
  });
  ws.on('disconnected', () => {
    wsStatus.value = 'closed';
  });

  ws.connect(roomId);
});
</script>

<style scoped>
.room-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f5f7fa 0%, #e8ecf1 100%);
  padding: 12px;
  max-width: 500px;
  margin: 0 auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.room-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.rt-exit,
.rt-disband {
  border: none;
  background: #fff;
  font-size: 13px;
  font-weight: bold;
  padding: 7px 12px;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.rt-exit {
  color: #667eea;
}

.rt-disband {
  color: #e74c3c;
}

.rt-code {
  font-size: 14px;
  color: #555;
  cursor: pointer;
  user-select: none;
}

.rt-code b {
  font-size: 18px;
  letter-spacing: 4px;
  color: #333;
}

.rt-copy {
  font-size: 11px;
  color: #667eea;
  margin-left: 4px;
}

.rt-placeholder {
  width: 52px;
}

.conn-tip {
  text-align: center;
  font-size: 12px;
  color: #e67e22;
  padding: 4px 0;
}

/* 座位 */
.seats {
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 6px;
}

.seat {
  flex: 1;
  background: #fff;
  border-radius: 12px;
  padding: 8px 10px;
  text-align: center;
  border: 2px solid transparent;
}

.seat.active {
  border-color: #667eea;
}

.seat-stone {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  margin: 0 auto 4px;
}

.seat-stone.black {
  background: radial-gradient(circle at 35% 35%, #555, #111);
}

.seat-stone.white {
  background: radial-gradient(circle at 35% 35%, #fff, #ccc);
  border: 1px solid #ddd;
}

.seat-name {
  font-size: 13px;
  font-weight: bold;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.seat-state {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.vs {
  align-self: center;
  font-size: 15px;
  font-weight: bold;
  color: #b3bac4;
}

.spectators {
  text-align: center;
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
}

.status-line {
  text-align: center;
  font-size: 13px;
  color: #555;
  padding: 4px 0 8px;
}

/* 棋盘 */
.board-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 10px;
}

.board {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 0;
  background: linear-gradient(135deg, #f5deb3 0%, #e8c88f 100%);
  padding: 4px;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  touch-action: manipulation;
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1;
}

.cell {
  position: relative;
  border-right: 1px solid rgba(120, 80, 30, 0.35);
  border-bottom: 1px solid rgba(120, 80, 30, 0.35);
  cursor: pointer;
}

.cell:nth-child(15n) {
  border-right: none;
}

.cell:nth-last-child(-n + 15) {
  border-bottom: none;
}

.cell.win {
  background: rgba(230, 126, 34, 0.35);
}

.stone {
  position: absolute;
  inset: 8%;
  border-radius: 50%;
  animation: drop 0.15s ease;
}

.stone.black {
  background: radial-gradient(circle at 35% 35%, #555, #111);
}

.stone.white {
  background: radial-gradient(circle at 35% 35%, #fff, #c9c9c9);
}

.stone.last::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22%;
  height: 22%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: #e74c3c;
}

@keyframes drop {
  from {
    transform: scale(0.6);
    opacity: 0.4;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* 操作 */
.actions {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 10px;
}

.act {
  border: none;
  font-size: 14px;
  font-weight: bold;
  padding: 10px 26px;
  border-radius: 12px;
  cursor: pointer;
}

.act.ready {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.act.resign {
  background: #fff;
  color: #e74c3c;
  border: 1px solid #f0c4bd;
}

.act:disabled {
  opacity: 0.5;
}

/* 聊天 */
.chat-card {
  flex: 1;
  background: #fff;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  max-height: 260px;
  min-height: 120px;
}

.chat-msg {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 0;
}

.chat-msg.mine {
  justify-content: flex-end;
}

.chat-nick {
  font-size: 11px;
  color: #a0a6b0;
  flex-shrink: 0;
}

.chat-text {
  font-size: 13px;
  color: #333;
  word-break: break-all;
  background: #f4f6f9;
  border-radius: 10px;
  padding: 4px 10px;
}

.chat-msg.mine .chat-text {
  background: #eef1fd;
  color: #4a55c7;
}

.chat-emoji {
  font-size: 30px;
  line-height: 1.1;
}

.chat-quick {
  font-size: 13px;
  color: #b3541e;
  background: #fdf3ea;
  border-radius: 10px;
  padding: 4px 10px;
}

.voice-bubble {
  border: none;
  background: #eef1fd;
  color: #4a55c7;
  font-size: 13px;
  font-weight: bold;
  border-radius: 16px;
  padding: 7px 14px;
  cursor: pointer;
}

.voice-bubble.playing {
  background: #667eea;
  color: #fff;
}

.chat-empty {
  text-align: center;
  font-size: 12px;
  color: #c3c8d0;
  padding: 14px 0;
}

.rec-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #e74c3c;
  padding: 5px 12px 0;
}

.rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e74c3c;
  animation: blink 0.8s infinite;
}

@keyframes blink {
  50% {
    opacity: 0.2;
  }
}

.panel {
  border-top: 1px dashed #e8ecf1;
  padding: 10px;
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
}

.emoji-cell {
  border: none;
  background: transparent;
  font-size: 26px;
  padding: 4px 0;
  cursor: pointer;
}

.phrase-cell {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: #f8f9fb;
  color: #444;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 10px;
  margin-bottom: 6px;
  cursor: pointer;
}

.chat-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid #f0f2f5;
}

.bar-btn {
  border: none;
  background: #f0f2f5;
  font-size: 18px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
}

.bar-btn.on {
  background: #eef1fd;
}

.bar-btn.mic.rec {
  background: #fdecea;
  animation: blink 0.8s infinite;
}

.chat-input {
  flex: 1;
  border: none;
  background: #f4f6f9;
  border-radius: 18px;
  padding: 9px 14px;
  font-size: 13px;
  color: #333;
  min-width: 0;
}

.chat-input:focus {
  outline: none;
}

.send-btn {
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 13px;
  font-weight: bold;
  padding: 9px 14px;
  border-radius: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.send-btn:disabled {
  opacity: 0.5;
}

.rec-err {
  font-size: 12px;
  color: #e74c3c;
  padding: 0 12px 8px;
}

/* 弹层 */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.confirm {
  background: #fff;
  border-radius: 14px;
  padding: 20px;
  width: 280px;
}

.confirm-text {
  font-size: 14px;
  color: #333;
  text-align: center;
  margin-bottom: 16px;
}

.confirm-btns {
  display: flex;
  gap: 10px;
}

.c-cancel,
.c-ok {
  flex: 1;
  border: none;
  font-size: 14px;
  font-weight: bold;
  padding: 10px;
  border-radius: 10px;
  cursor: pointer;
}

.c-cancel {
  background: #f0f2f5;
  color: #666;
}

.c-ok {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}
</style>
