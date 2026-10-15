<template>
  <div class="room-page">
    <!-- 顶栏 -->
    <div class="room-top">
      <button class="rt-exit" @click="askExit">‹ 退出</button>
      <div class="rt-code" @click="copyCode" title="复制邀请链接，朋友点开直接进房">
        房间 <b>{{ roomId }}</b>
        <span class="rt-copy">{{ copied ? '链接已复制' : '复制链接' }}</span>
      </div>
      <button v-if="isHost" class="rt-disband" @click="askDisband">解散</button>
      <span v-else class="rt-placeholder" />
    </div>

    <!-- 连接状态 -->
    <div v-if="wsStatus !== 'open'" class="conn-tip">连接中…（断线会自动重连）</div>

    <!-- 座位条：通用网格（全部成员可见） -->
    <div class="seats-grid">
      <div
        v-for="m in members"
        :key="m.userId"
        class="seat-cell"
        :class="{ active: isActiveMember(m), off: !m.online }"
      >
        <div class="cell-top">
          <PlayerAvatar :avatar="m.avatar" :size="30" />
          <span v-if="m.userId === hostUserId" class="host-mark" title="房主">👑</span>
        </div>
        <div class="cell-name">{{ m.nickname }}<template v-if="m.userId === myId">（我）</template></div>
        <div class="cell-state">{{ memberState(m) }}</div>
      </div>
    </div>

    <!-- 状态条 -->
    <div v-if="lastWsError" class="conn-tip">{{ lastWsError }}</div>
    <div class="status-line">
      <template v-if="phase === 'waiting'">
        {{ waitingText }}
      </template>
      <template v-else-if="phase === 'playing'">
        {{ playingStatusText }}
      </template>
      <template v-else>
        {{ overText }}
      </template>
    </div>

    <!-- 游戏区 -->
    <GamePanel
      :game-type="gameType"
      :game-state="game"
      :phase="phase"
      :my-seat="mySeat"
      :events="gameEvents"
      :members="members"
      @action="onGameAction"
    />

    <!-- 操作区 -->
    <div class="actions">
      <template v-if="phase === 'waiting' && mySeat >= 0">
        <button v-if="!myReady" class="act ready" @click="send({ t: 'ready' })">准备</button>
        <button v-else class="act cancel-ready" @click="send({ t: 'ready' })">取消准备</button>
      </template>
      <template v-if="phase === 'playing' && mySeat >= 0 && !chipTableGames.includes(gameType)">
        <button class="act resign" @click="askResign">认输</button>
      </template>
      <template v-if="phase === 'ended' && mySeat >= 0">
        <button class="act ready" :disabled="myRematch" @click="send({ t: 'rematch' })">
          {{ myRematch ? '已表决，等对方…' : '再来一局' }}
        </button>
        <span v-if="rematchCountdown > 0" class="rematch-timer">⏱ {{ rematchCountdown }}s 后自动重开</span>
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
          :placeholder="gameType === 'draw' && phase === 'playing' ? '在这里输入你猜的词…' : '说点什么…'"
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
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '@/store/user';
import { useRoomWs } from '@/composables/useRoomWs';
import { useRecorder } from '@/composables/useRecorder';
import { fetchRoomVoice, uploadRoomVoice } from '@/api/room';
import { QUICK_PHRASES, ROOM_EMOJIS } from '@/utils/quickChat';
import { soundManager } from '@/utils/sound';
import GamePanel from '@/components/battle/GamePanel.vue';


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
const gameType = ref('gomoku');
const members = ref<MemberInfo[]>([]);
const phase = ref<'waiting' | 'playing' | 'ended'>('waiting');
const hostUserId = ref(0);
const mySeat = ref(-1);
const board = ref<number[][]>(Array.from({ length: 15 }, () => Array(15).fill(0)));
const game = ref<any>({ board, turn: 1, winner: 0, winLine: [] as [number, number][], lastMove: null });
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

/** 牌类（积分桌）游戏：无"认输"，退出按弃牌处理 */
const chipTableGames = ['blackjack', 'zjh'];

const isHost = computed(() => hostUserId.value === myId.value);
const myColor = computed(() => (mySeat.value === 0 ? BLACK : mySeat.value === 1 ? WHITE : 0));
const myReady = computed(() => members.value.find((m) => m.userId === myId.value)?.ready || false);
const rematchVotes = ref<number[]>([]);
const gameEvents = reactive<Record<string, any>>({
  question: null as any,
  result: null as any,
  final: null as any,
  round: null as any,
  stroke: null as any,
  undo: null as any,
  clear: null as any,
  guessResult: null as any,
  roundEnd: null as any,
  phase: null as any,
  deal: null as any,
  voteUpdate: null as any,
  voteResult: null as any,
  eliminated: null as any,
  handsView: null as any,
  showdown: null as any,
  settle: null as any,
  compareCards: null as any,
  hint: null as any,
});
const lastWsError = ref('');
const rematchDeadlineAt = ref(0);
const nowTick = ref(0);
const rematchCountdown = computed(() => {
  if (!rematchDeadlineAt.value || phase.value !== 'ended') return 0;
  return Math.max(0, Math.ceil((rematchDeadlineAt.value - nowTick.value) / 1000));
});
setInterval(() => (nowTick.value = Date.now()), 500);
const myRematch = computed(() => rematchVotes.value.includes(myId.value));
const players = computed(() => members.value.filter((m) => m.seat >= 0));
// 终局数据：优先实时 final 事件，兜底快照里的 ended 摘要（刷新/重连后事件已丢）
const finalData = computed<any | null>(() => gameEvents.final || game.value?.ended || null);

const memberState = (m: { userId: number; seat: number; ready: boolean; online: boolean }): string => {
  if (!m.online) return '离线';
  if (m.seat < 0) return '观战';
  if (phase.value === 'waiting') return m.ready ? '已准备' : '未准备';
  if (chipTableGames.includes(gameType.value) && phase.value === 'playing') {
    const chips = (game.value.chips || []).find((c: any) => c.userId === m.userId)?.chips;
    if (chips !== undefined && chips <= 0) return '破产观战中';
  }
  if (gameType.value === 'spy') {
    if (phase.value === 'ended') {
      const spies: number[] = finalData.value?.spyUserIds || [];
      return spies.includes(m.userId) ? '🕵️ 卧底' : '🙂 平民';
    }
    const eliminated = (game.value.eliminated || []).some((e: any) => e.userId === m.userId);
    return eliminated ? '出局' : '存活';
  }
  if (phase.value === 'ended') {
    if (gameType.value === 'gomoku') {
      return game.value.winner === m.seat + 1 ? '获胜 🎉' : game.value.winner === 3 ? '平局' : '惜败';
    }
    const top = finalData.value?.ranking?.[0];
    return top && top.userId === m.userId ? '🏆 第一名' : '已结束';
  }
  if (gameType.value === 'draw' && phase.value === 'playing') {
    return game.value.drawerSeat === m.seat ? '🎨 画中' : '猜词中';
  }
  if (gameType.value === 'uno' && phase.value === 'playing') {
    return game.value.turnSeat === m.seat ? '出牌中' : '';
  }
  if (gameType.value === 'quiz' && phase.value === 'playing') {
    const s = (game.value.scores || []).find((x: any) => x.userId === m.userId);
    return s ? `${s.total} 分` : '答题中';
  }
  if (gameType.value === 'blackjack' && phase.value === 'playing') {
    if (game.value.bankerSeat === m.seat) return '🎲 庄家';
    const h = (gameEvents.handsView || []).find((x: any) => x.userId === m.userId);
    if (h?.busted) return '💥 爆牌';
    if (h?.natural) return '✨ Blackjack';
    if (h?.done) return '🛑 停牌';
    if (h?.stake) return `押 ${h.stake}`;
    return game.value.phase === 'betting' ? '下注中' : '行动中';
  }
  if (gameType.value === 'zjh' && phase.value === 'playing') {
    const o = (game.value.others || []).find((x: any) => x.userId === m.userId);
    const self = m.userId === myId.value;
    const folded = self ? game.value.myFolded : o?.folded;
    const allIn = self ? game.value.myAllIn : o?.allIn;
    const seen = self ? game.value.mySeen : o?.seen;
    if (folded) return '🚫 已弃';
    if (allIn) return '💰 all-in';
    if (game.value.turnSeat === m.seat) return seen ? '👀 行动中' : '🙈 行动中';
    return seen ? '👀 已看' : '🙈 闷牌';
  }
  if (gameType.value === 'gomoku' && phase.value === 'playing') {
    return m.seat === 0 ? '执黑' : '执白';
  }
  return '';
};

const isActiveMember = (m: { userId: number; seat: number }): boolean => {
  if (phase.value !== 'playing') return false;
  if (gameType.value === 'gomoku') return game.value.turn === (m.seat === 0 ? 1 : 2);
  if (gameType.value === 'uno') return game.value.turnSeat === m.seat;
  if (gameType.value === 'draw') return game.value.drawerSeat === m.seat && game.value.word != null;
  return false;
};

const waitingText = computed(() => {
  if (players.value.length < 2) return '等待另一位玩家加入…把房间码发给朋友吧';
  if (mySeat.value >= 0) return myReady.value ? '等待对方准备…' : '准备好了就点「准备」开局';
  return '等待玩家准备开局…';
});

const overText = computed(() => {
  if (gameType.value === 'gomoku') {
    if (game.value.winner === 3) return overReason.value ? `平局！（${overReason.value}）` : '平局！';
    const winnerSeat = game.value.winner - 1;
    const w = members.value.find((m) => m.seat === winnerSeat);
    const who = w ? (w.userId === myId.value ? '你' : w.nickname) : '';
    const reason = overReason.value ? `（${overReason.value}）` : '';
    return `${who}获胜！${reason}`;
  }
  if (gameType.value === 'spy') {
    const f = finalData.value;
    if (f?.winner === 'civilian') return '🎉 卧底全部出局，平民胜利！';
    if (f?.winner === 'spy') return '🕵️ 卧底胜利，潜伏到了最后！';
    return overReason.value ? `对局结束（${overReason.value}）` : '对局结束';
  }
  // 排名制游戏（你画我猜/答题对战/UNO）：取第一名
  const top = finalData.value?.ranking?.[0];
  if (top) {
    const who = top.userId === myId.value ? '你' : top.nickname;
    return gameType.value === 'draw' ? `🏆 ${who}以 ${top.total} 分夺冠！` : `🎉 ${who}获胜！`;
  }
  return overReason.value ? `对局结束（${overReason.value}）` : '对局结束';
});

const playingStatusText = computed(() => {
  if (mySeat.value < 0) return '对局进行中，你正在观战';
  const gt = gameType.value;
  if (gt === 'gomoku') return game.value.turn === myColor.value ? '轮到你落子' : '等待对方落子…';
  if (gt === 'uno') {
    if (game.value.turnSeat === mySeat.value) return '轮到你出牌';
    const name = members.value.find((m) => m.seat === game.value.turnSeat)?.nickname;
    return name ? `等待 ${name} 出牌…` : '对局进行中';
  }
  if (gt === 'draw') {
    if (game.value.drawerSeat === mySeat.value) return game.value.phase === 'picking' ? '轮到你选词' : '你来画，大家来猜';
    return game.value.myGuessed ? '你已猜对，等其他小伙伴…' : '看画面猜词，在下方输入你的答案';
  }
  if (gt === 'spy') {
    return game.value.phase === 'vote' ? '🗳️ 投票中，点击玩家名牌投票' : '🗣️ 描述阶段（线下口头描述）';
  }
  if (gt === 'quiz') return game.value.myAnswered ? '你已作答，等待出下一题…' : '答题进行中，拼手速！';
  if (gt === 'blackjack') {
    if (game.value.isBanker) return game.value.phase === 'dealer' ? '庄家自动结算中…' : '你是庄家，等待闲家行动';
    if (game.value.phase === 'betting') return game.value.myStake ? '已下注，等待其他玩家…' : '请选择下注金额';
    if (game.value.phase === 'acting') return game.value.turnSeat === mySeat.value ? '轮到你行动（要牌/停牌/加倍）' : '等待其他玩家行动…';
    if (game.value.phase === 'dealer') return '庄家结算中…';
    return '本手结算中…';
  }
  if (gt === 'zjh') {
    if (game.value.phase === 'showdown') return '开牌！比大小…';
    if (game.value.phase === 'settle') return '本手结算中…';
    if (game.value.turnSeat === mySeat.value) {
      if (game.value.myFolded) return '你已弃牌，观战中';
      if (game.value.myAllIn) return '你已 all-in，等待开牌';
      return game.value.mySeen ? '轮到你行动（跟注/加注/比牌/弃牌）' : '轮到你：可先看牌再行动';
    }
    const name = members.value.find((m) => m.seat === game.value.turnSeat)?.nickname;
    return name ? `等待 ${name} 行动…` : '对局进行中';
  }
  return '对局进行中';
});

const scrollChat = () => nextTick(() => chatListEl.value?.scrollTo({ top: chatListEl.value.scrollHeight }));

const applySnapshot = (s: any) => {
  members.value = s.members || [];
  phase.value = s.phase;
  hostUserId.value = s.hostUserId;
  if (s.gameType) gameType.value = s.gameType;
  board.value = s.game?.board || board.value;
  // 保留 serializeFor 的全部字段（各游戏自带结构：五子棋棋盘/UNO 手牌+顶牌/卧底身份等）
  game.value = { ...(s.game || {}) };
  chatList.value = s.chat || [];
  const me = members.value.find((m) => m.userId === myId.value);
  if (me) mySeat.value = me.seat;
  if (s.gameType === 'quiz' && s.qid) {
    gameEvents.question = { ...s.game, ...s, scores: s.game?.scores || [] };
  }
  scrollChat();
};

const send = (obj: Record<string, unknown>) => ws.send(obj);

const onGameAction = (action: Record<string, unknown>) => {
  soundManager.playClick();
  send(action);
};

const sendText = () => {
  const text = chatInput.value.trim();
  if (!text) return;
  if (gameType.value === 'draw' && phase.value === 'playing') {
    send({ t: 'guess', content: text });
  } else {
    send({ t: 'chat', kind: 'text', content: text });
  }
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
// 返回大厅：优先弹掉房间这条历史（go(-1)），避免 replace 产生两条连续 /battle 导致要按两次返回
// 直接输网址进入房间（无上一页）时才 replace 兜底
const leaveToLobby = () => {
  const pos = Number(window.history.state?.position ?? 0);
  if (pos > 0) router.go(-1);
  else router.replace('/battle');
};

const doExit = () => {
  send({ t: 'leave' });
  ws.close();
  leaveToLobby();
};

const askExit = () => {
  if (phase.value === 'playing' && mySeat.value >= 0) {
    const isChipTable = chipTableGames.includes(gameType.value);
    confirmBox.value = {
      text: isChipTable ? '对局正在进行，退出将按弃牌处理，已投入的积分不退，确定退出？' : '对局正在进行，退出将判你认输，确定退出？',
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
      leaveToLobby();
    },
  };
};

const copyCode = async () => {
  try {
    // 复制整体邀请链接：对方点击直接进房（未登录会先到选角色页，登录后自动回到本房间）
    const link = `${location.origin}${location.pathname}#/battle/room/${roomId}`;
    await navigator.clipboard.writeText(link);
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
    board.value = Array.from({ length: 15 }, () => Array(15).fill(0));
    game.value = { board: board.value, turn: 1, winner: 0, winLine: [], lastMove: null };
    Object.keys(gameEvents).forEach((k) => (gameEvents[k] = null));
  });
  ws.on('game_restart', (m: any) => {
    phase.value = m.phase;
    board.value = Array.from({ length: 15 }, () => Array(15).fill(0));
    game.value = { board: board.value, turn: 1, winner: 0, winLine: [], lastMove: null };
    Object.keys(gameEvents).forEach((k) => (gameEvents[k] = null));
  });
  ws.on('game_over', (m: any) => {
    phase.value = 'ended';
    overReason.value = m.reason || '';
    // 五子棋用黑/白映射；其他游戏的结算文案走 final 事件（ranking/胜负方），不依赖 winner
    if (gameType.value === 'gomoku') {
      game.value.winner = m.winnerSeat === 0 ? 1 : m.winnerSeat === 1 ? 2 : 3;
    }
    rematchVotes.value = [];
  });
  ws.on('quiz_question', (m: any) => {
    gameEvents.question = m;
    gameEvents.result = null;
    gameEvents.final = null;
  });
  ws.on('quiz_result', (m: any) => {
    gameEvents.result = m;
  });
  ws.on('quiz_final', (m: any) => {
    gameEvents.final = m;
  });
  ws.on('draw_round', (m: any) => {
    gameEvents.round = { ...m, ts: Date.now() };
    gameEvents.stroke = null;
    gameEvents.final = null;
    gameEvents.hint = null;
    gameEvents.guessResult = []; // 新回合重置猜对名单
    // 同步回合状态到 game（DrawGame 模板按 state.phase 切换选词/作画）
    if (game.value && typeof game.value === 'object') {
      game.value.phase = m.phase;
      game.value.drawerSeat = m.drawerSeat;
      game.value.isDrawer = mySeat.value >= 0 && m.drawerSeat === mySeat.value;
      game.value.round = m.round;
      game.value.totalRounds = m.totalRounds;
      game.value.deadline = m.deadline || 0;
      game.value.wordLen = m.wordLen || 0;
      game.value.category = m.category || '';
      game.value.word = null;
      game.value.strokes = [];
      game.value.myGuessed = false;
      game.value.guessedUserIds = [];
    }
  });
  ws.on('guess_result', (m: any) => {
    // 累积成本回合猜对名单（DrawGame 按数组渲染）
    const list = Array.isArray(gameEvents.guessResult) ? gameEvents.guessResult : [];
    list.push(m);
    gameEvents.guessResult = list;
    if (m.userId === myId.value && game.value && typeof game.value === 'object') {
      game.value.myGuessed = true;
      if (Array.isArray(game.value.guessedUserIds)) game.value.guessedUserIds.push(m.userId);
    }
  });
  ws.on('draw_candidates', (m: any) => {
    gameEvents.candidates = m.words || [];
  });
  ws.on('draw_word', (m: any) => {
    // 画家的词（私发）：同步到 state 供词牌显示
    if (game.value && typeof game.value === 'object') game.value.word = m.word;
  });
  ws.on('draw_hint', (m: any) => {
    gameEvents.hint = m; // 时间过半揭示首字（市面画猜标配）
  });
  ws.on('draw_stroke', (m: any) => {
    gameEvents.stroke = m;
  });
  ws.on('draw_undo', () => {
    gameEvents.undo = { ts: Date.now() };
  });
  ws.on('draw_clear', () => {
    gameEvents.clear = { ts: Date.now() };
  });

  ws.on('draw_round_end', (m: any) => {
    gameEvents.roundEnd = m;
  });
  ws.on('draw_final', (m: any) => {
    gameEvents.final = m;
    phase.value = 'ended';
  });
  ws.on('spy_phase', (m: any) => {
    gameEvents.phase = m;
    // 阶段切换同步进 state（SpyGame 模板按 state.phase 切换描述/投票 UI，快照只在建房/大事件时发）
    if (game.value && typeof game.value === 'object') {
      game.value.phase = m.phase;
      game.value.deadline = m.deadline || 0;
      game.value.alive = m.alive || game.value.alive;
      game.value.isRevote = !!m.isRevote;
      game.value.revotePool = m.revotePool || null;
      game.value.votedCount = 0;
      game.value.total = (m.alive || []).length;
    }
  });
  ws.on('spy_deal', (m: any) => {
    gameEvents.deal = m;
  });
  ws.on('spy_vote_update', (m: any) => {
    gameEvents.voteUpdate = m;
    if (game.value && typeof game.value === 'object') {
      game.value.votedCount = m.votedCount;
      game.value.total = m.total;
    }
  });
  ws.on('spy_vote_result', (m: any) => {
    gameEvents.voteResult = m;
  });
  ws.on('spy_eliminated', (m: any) => {
    gameEvents.eliminated = m;
  });
  ws.on('spy_final', (m: any) => {
    gameEvents.final = m;
    phase.value = 'ended';
  });
  ws.on('uno_state', (m: any) => {
    gameEvents.uno_state = m;
    gameEvents.turn = { seat: m.turnSeat, seq: Date.now() };
    // 同步公共状态到 game（UnoGame 从 state 读顶牌/颜色/回合）
    if (game.value && typeof game.value === 'object') {
      game.value.top = m.top;
      game.value.currentColor = m.currentColor;
      game.value.direction = m.direction;
      game.value.turnSeat = m.turnSeat;
      game.value.counts = m.counts;
    }
  });
  ws.on('uno_turn', (m: any) => {
    gameEvents.turn = { ...m, seq: Date.now() };
    if (game.value && typeof game.value === 'object') game.value.turnSeat = m.seat;
  });
  ws.on('uno_played', (m: any) => {
    gameEvents.uno_played = m;
    if (game.value && typeof game.value === 'object') {
      game.value.top = m.card;
      if (m.chooseColor) game.value.currentColor = m.chooseColor;
    }
  });
  ws.on('uno_hand', (m: any) => {
    gameEvents.uno_hand = m;
  });
  ws.on('uno_drew', (m: any) => {
    gameEvents.drew = { ...m, seq: Date.now() };
  });
  ws.on('uno_final', (m: any) => {
    gameEvents.final = m;
    phase.value = 'ended';
  });
  // ── 21点 ──
  const seatOfUser = (userId: number): number => members.value.find((m) => m.userId === userId)?.seat ?? -1;
  /** 我的下注流水：按手取条目（无则建），delta=null 表示未结算 */
  const myBetEntry = (round: number) => {
    if (!game.value || typeof game.value !== 'object') return null;
    const log: any[] = game.value.myBetLog || [];
    let entry = log.find((e) => e.round === round && e.delta === null);
    if (!entry) {
      entry = { round, stake: 0, doubled: false, delta: null, outcome: null };
      game.value.myBetLog = [...log, entry];
    }
    return entry;
  };
  ws.on('blackjack_phase', (m: any) => {
    if (game.value && typeof game.value === 'object') {
      const newRound = game.value.round !== m.round;
      game.value.round = m.round;
      game.value.totalRounds = m.totalRounds;
      game.value.phase = m.phase;
      game.value.bankerSeat = m.bankerSeat;
      game.value.turnSeat = m.turnSeat;
      game.value.deadline = m.deadline || 0;
      game.value.chips = m.chips || game.value.chips;
      game.value.canPassBank = !!m.canPassBank;
      game.value.isBanker = m.bankerSeat === mySeat.value;
      if (newRound && m.phase === 'betting') {
        gameEvents.handsView = [];
        game.value.myCards = [];
        game.value.myStake = 0;
        game.value.myDone = false;
        game.value.myBusted = false;
        game.value.myNatural = false;
        game.value.myDoubled = false;
        game.value.bankerCards = [];
        game.value.bankerValue = null;
        game.value.lastResults = null;
      }
    }
  });
  ws.on('blackjack_deal', (m: any) => {
    gameEvents.handsView = (m.hands || []).map((h: any) => ({
      ...h,
      seat: seatOfUser(h.userId),
      done: !!h.natural,
      busted: false,
    }));
    const mine = (m.hands || []).find((h: any) => h.userId === myId.value);
    if (game.value && typeof game.value === 'object') {
      game.value.myCards = mine ? [...mine.cards] : [];
      game.value.myStake = mine?.stake || 0;
      game.value.myNatural = !!mine?.natural;
      game.value.myDone = !!mine?.natural;
      if (game.value.isBanker) {
        game.value.bankerCards = m.bankerUpcard ? [m.bankerUpcard] : [];
      } else {
        game.value.bankerCards = m.bankerUpcard ? [m.bankerUpcard] : [];
      }
    }
  });
  ws.on('blackjack_your_banker', (m: any) => {
    if (game.value && typeof game.value === 'object') game.value.bankerCards = m.cards || [];
  });
  ws.on('blackjack_action', (m: any) => {
    if (!game.value || typeof game.value !== 'object') return;
    if (m.action === 'banker_hit') {
      game.value.bankerCards = [...(game.value.bankerCards || []), m.card];
      game.value.bankerValue = m.total;
      return;
    }
    if (m.action === 'hit' || m.action === 'double') {
      if (m.userId === myId.value) {
        game.value.myCards = [...(game.value.myCards || []), m.card];
        if (m.action === 'double') {
          game.value.myStake = m.stake;
          const entry = myBetEntry(game.value.round);
          if (entry) {
            entry.stake = m.stake;
            entry.doubled = true;
          }
        }
        game.value.myDone = true;
        game.value.myBusted = !!m.busted;
      }
      // 全房间「我要加倍」动态弹框 + 语音通知（BlackjackGame 消费）
      if (m.action === 'double') {
        gameEvents.doubled = { userId: m.userId, stake: m.stake, seq: Date.now() };
      }
      const item = (gameEvents.handsView || []).find((x: any) => x.userId === m.userId);
      if (item && m.userId !== myId.value) {
        item.cards = [...(item.cards || []), m.card];
        item.done = true;
        item.busted = !!m.busted;
      } else if (item) {
        item.done = true;
        item.busted = !!m.busted;
      }
      return;
    }
    if (m.action === 'stand') {
      if (m.userId === myId.value) game.value.myDone = true;
      const item = (gameEvents.handsView || []).find((x: any) => x.userId === m.userId);
      if (item) item.done = true;
      return;
    }
    if (m.action === 'bet' && m.stake) {
      if (m.userId === myId.value) {
        const entry = myBetEntry(game.value.round);
        if (entry) entry.stake = m.stake;
      }
      const item = (gameEvents.handsView || []).find((x: any) => x.userId === m.userId);
      if (item) item.stake = m.stake;
    }
  });
  ws.on('blackjack_settle', (m: any) => {
    if (game.value && typeof game.value === 'object') {
      game.value.lastResults = m.results || [];
      game.value.chips = m.chips || game.value.chips;
      game.value.bankerCards = m.bankerCards || [];
      game.value.bankerValue = m.bankerValue ?? game.value.bankerValue;
      game.value.phase = 'settle';
      const mine = (m.results || []).find((r: any) => r.userId === myId.value);
      const entry = (game.value.myBetLog || []).find((e: any) => e.round === m.round && e.delta === null);
      if (mine && entry) {
        entry.delta = mine.delta;
        entry.outcome = mine.outcome;
      }
      game.value.nextDeadline = m.nextDeadline || 0;
    }
    // 结算同步爆牌/自然杰克状态到视图
    for (const r of m.results || []) {
      const item = (gameEvents.handsView || []).find((x: any) => x.userId === r.userId);
      if (item) {
        item.done = true;
        if (r.outcome === 'bust') item.busted = true;
        if (r.outcome === 'blackjack') item.natural = true;
      }
    }
  });
  ws.on('blackjack_final', (m: any) => {
    gameEvents.final = m;
    phase.value = 'ended';
  });

  // ── 三张牌比大小 ──
  const resetZjhOthers = () => {
    game.value.others = members.value
      .filter((m) => m.seat >= 0 && m.userId !== myId.value)
      .map((m) => ({ userId: m.userId, nickname: m.nickname, seat: m.seat, seen: false, folded: false, allIn: false, betTotal: 10 }));
  };
  ws.on('zjh_phase', (m: any) => {
    if (game.value && typeof game.value === 'object') {
      const newHand = game.value.round !== m.round;
      game.value.round = m.round;
      game.value.totalRounds = m.totalRounds;
      game.value.phase = m.phase;
      game.value.dealerSeat = m.dealerSeat;
      game.value.pot = m.pot;
      game.value.stake = m.stake;
      game.value.roundNo = m.roundNo;
      game.value.turnSeat = m.turnSeat;
      game.value.deadline = m.deadline || 0;
      game.value.compareMinRound = m.compareMinRound || 3;
      game.value.aliveCount = m.aliveCount;
      game.value.chips = m.chips || game.value.chips;
      if (newHand && m.phase === 'betting') {
        game.value.myCards = null;
        game.value.mySeen = false;
        game.value.myFolded = false;
        game.value.myAllIn = false;
        game.value.myBetTotal = 10;
        game.value.myRank = null;
        gameEvents.showdown = null;
        gameEvents.settle = null;
        gameEvents.compareCards = null;
        resetZjhOthers();
        // 我付了底注 → 新增本手流水（entrants=付底注入局的玩家）
        const log: any[] = game.value.myBetLog || [];
        if (Array.isArray(m.entrants) && m.entrants.includes(myId.value) && !log.some((e) => e.round === m.round)) {
          game.value.myBetLog = [...log, { round: m.round, betTotal: 10, delta: null, ended: null }];
        }
      }
    }
  });
  ws.on('zjh_your_cards', (m: any) => {
    if (game.value && typeof game.value === 'object') {
      game.value.myCards = m.cards || [];
      game.value.mySeen = true;
      game.value.myRank = m.rank || null;
    }
  });
  ws.on('zjh_action', (m: any) => {
    if (!game.value || typeof game.value !== 'object') return;
    const others = game.value.others || [];
    if (m.action === 'look') {
      const o = others.find((x: any) => x.userId === m.userId);
      if (o) o.seen = true;
      return;
    }
    if (m.action === 'call' || m.action === 'timeout_call') {
      game.value.pot = m.pot ?? game.value.pot;
      game.value.stake = m.stake ?? game.value.stake;
      const o = others.find((x: any) => x.userId === m.userId);
      if (o) {
        o.betTotal = (o.betTotal || 0) + (m.cost || 0);
        if (m.allIn) o.allIn = true;
      }
      if (m.userId === myId.value) {
        const log: any[] = game.value.myBetLog || [];
        const entry = log.find((e) => e.round === game.value.round && e.delta === null);
        if (entry) entry.betTotal += m.cost || 0;
      }
      return;
    }
    if (m.action === 'fold' || m.action === 'timeout_fold') {
      const o = others.find((x: any) => x.userId === m.userId);
      if (o) o.folded = true;
      game.value.aliveCount = m.aliveCount ?? game.value.aliveCount;
      if (m.userId === myId.value) game.value.myFolded = true;
    }
  });
  ws.on('zjh_compare', (m: any) => {
    const others = game.value?.others || [];
    const loser = others.find((x: any) => x.userId === m.loser);
    if (loser) loser.folded = true;
    const winner = others.find((x: any) => x.userId === m.winner);
    if (winner) winner.seen = true;
    if (game.value && typeof game.value === 'object') {
      const prevPot = game.value.pot || 0;
      game.value.pot = m.pot ?? game.value.pot;
      game.value.aliveCount = m.aliveCount ?? game.value.aliveCount;
      if (m.loser === myId.value) game.value.myFolded = true;
      // 发起比牌者的花费 = 池子增量（比牌广播不带 cost）
      if (m.from === myId.value) {
        const log: any[] = game.value.myBetLog || [];
        const entry = log.find((e) => e.round === game.value.round && e.delta === null);
        if (entry) entry.betTotal += Math.max(0, (m.pot || 0) - prevPot);
      }
      // 全房间「我要验牌」动态弹框 + 语音通知（ZjhGame 消费）
      gameEvents.yanpai = { from: m.from, to: m.to, seq: Date.now() };
    }
  });
  ws.on('zjh_compare_cards', (m: any) => {
    gameEvents.compareCards = m;
  });
  ws.on('zjh_showdown', (m: any) => {
    gameEvents.showdown = m;
    if (game.value && typeof game.value === 'object') game.value.phase = 'showdown';
  });
  ws.on('zjh_settle', (m: any) => {
    gameEvents.settle = m;
    if (game.value && typeof game.value === 'object') {
      game.value.pot = 0;
      game.value.phase = 'settle';
      game.value.nextDeadline = m.nextDeadline || 0;
      if (Array.isArray(m.deltas)) {
        game.value.chips = m.deltas.map((d: any) => ({ userId: d.userId, chips: d.chips }));
        const meDelta = m.deltas.find((d: any) => d.userId === myId.value);
        if (meDelta) {
          game.value.myChips = meDelta.chips;
          const entry = (game.value.myBetLog || []).find((e: any) => e.round === m.round && e.delta === null);
          if (entry) {
            entry.delta = meDelta.delta;
            entry.ended = m.winner === myId.value ? 'win' : game.value.myFolded ? 'fold' : 'showdown';
          }
        }
      }
    }
  });
  ws.on('zjh_final', (m: any) => {
    gameEvents.final = m;
    phase.value = 'ended';
  });
  ws.on('error', (m: any) => {
    lastWsError.value = m.message || '';
    setTimeout(() => (lastWsError.value = ''), 2500);
  });
  ws.on('rematch_vote', (m: any) => {
    rematchVotes.value = m.userIds || [];
  });
  ws.on('rematch_deadline', (m: any) => {
    rematchDeadlineAt.value = Number(m.deadline) || 0;
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
    leaveToLobby();
  });
  ws.on('error', (m: any) => {
    if (m.message?.includes('房间不存在')) {
      alert(m.message);
      ws.close();
      leaveToLobby();
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
.seats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.seat-cell {
  background: #fff;
  border: 2px solid #e3e8ef;
  border-radius: 12px;
  padding: 8px 6px;
  text-align: center;
}

.seat-cell.active {
  border-color: #667eea;
  background: #eef1fd;
}

.seat-cell.off {
  opacity: 0.55;
}

.cell-top {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  min-height: 30px;
}

.host-mark {
  position: absolute;
  top: -4px;
  right: -2px;
  font-size: 12px;
}

.cell-name {
  font-size: 12px;
  font-weight: bold;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cell-state {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
  min-height: 14px;
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

.act.cancel-ready {
  background: #fff;
  color: #888;
  border: 1px solid #dfe3ea;
}

.act.resign {
  background: #fff;
  color: #e74c3c;
  border: 1px solid #f0c4bd;
}

.act:disabled {
  opacity: 0.5;
}

.rematch-timer {
  font-size: 12px;
  color: #e67e22;
  align-self: center;
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
