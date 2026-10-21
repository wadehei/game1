<template>
  <div class="room-page">
    <!-- 顶栏 -->
    <TopBar
      :room-id="roomId"
      :is-host="isHost"
      :copied="copied"
      @exit="askExit"
      @disband="askDisband"
      @copy-code="copyCode"
    />

    <!-- 连接状态 -->
    <div v-if="wsStatus !== 'open'" class="conn-tip">连接中…（断线会自动重连）</div>

    <!-- 座位条 -->
    <SeatGrid
      :members="members"
      :host-user-id="hostUserId"
      :my-id="myId"
      :get-state="memberState"
      :is-active="isActiveMember"
    />

    <!-- 状态条 -->
    <StatusLine
      :phase="phase"
      :waiting-text="waitingText"
      :playing-status-text="playingStatusText"
      :over-text="overText"
      :last-ws-error="lastWsError"
    />

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
    <ChatPanel
      ref="chatPanelRef"
      :chat-list="chatList"
      :voice-list="voiceList"
      :my-id="myId"
      :playing-voice="playingVoice"
      :game-type="gameType"
      :phase="phase"
      :recording="recorder.recording.value"
      :rec-seconds="recorder.seconds.value"
      :rec-error="recorder.error.value"
      @send-text="handleSendText"
      @send-quick="sendQuick"
      @play-voice="playVoice"
      @mic-down="micDown"
      @mic-up="micUp"
    />

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
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useUserStore } from "@/store/user";
import { useRoomWs } from "@/composables/useRoomWs";
import { useRoomEvents } from "@/composables/useRoomEvents";
import { useRecorder } from "@/composables/useRecorder";
import { useMemberState } from "@/composables/useMemberState";
import type { GameEvents } from "@/composables/wsTypes";
import type { S2CSnapshot, S2CQuizEvent } from "@children-games/shared";
import { fetchRoomVoice, uploadRoomVoice } from "@/api/room";
import { showToast } from "@/utils/toastBus";
import { soundManager } from "@/utils/sound";
import GamePanel from "@/components/battle/GamePanel.vue";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import TopBar from "./components/TopBar.vue";
import SeatGrid from "./components/SeatGrid.vue";
import StatusLine from "./components/StatusLine.vue";
import ChatPanel from "./components/ChatPanel.vue";

const BLACK = 1;
const WHITE = 2;

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const roomId = String(route.params.roomId || "");

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
  kind: "text" | "emoji" | "quick";
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

const gameType = ref("gomoku");
const members = ref<MemberInfo[]>([]);
const phase = ref<"waiting" | "playing" | "ended">("waiting");
const hostUserId = ref(0);
const mySeat = ref(-1);
const board = ref<number[][]>(
  Array.from({ length: 15 }, () => Array(15).fill(0)),
);
const game = ref<any>({
  board,
  turn: 1,
  winner: 0,
  winLine: [] as [number, number][],
  lastMove: null,
});
const chatList = ref<ChatItem[]>([]);
const voiceList = ref<VoiceItem[]>([]);
const overReason = ref("");

const playingVoice = ref("");
const confirmBox = ref<{ text: string; ok: () => void } | null>(null);

const recorder = useRecorder();

const ws = useRoomWs();
const wsStatus = ws.status;

/** 牌类（积分桌）游戏：无"认输"，退出按弃牌处理 */
const chipTableGames = ["blackjack", "zjh"];

const isHost = computed(() => hostUserId.value === myId.value);
const myColor = computed(() =>
  mySeat.value === 0 ? BLACK : mySeat.value === 1 ? WHITE : 0,
);
const myReady = computed(
  () => members.value.find((m) => m.userId === myId.value)?.ready || false,
);
const rematchVotes = ref<number[]>([]);
const gameEvents = reactive<Partial<GameEvents>>({
  question: null,
  result: null,
  final: null,
  round: null,
  stroke: null,
  undo: null,
  clear: null,
  guessResult: null,
  roundEnd: null,
  phase: null,
  deal: null,
  voteUpdate: null,
  voteResult: null,
  eliminated: null,
  handsView: null,
  showdown: null,
  settle: null,
  compareCards: null,
  hint: null,
});
const lastWsError = ref("");
const rematchDeadlineAt = ref(0);
const nowTick = ref(0);
const rematchCountdown = computed(() => {
  if (!rematchDeadlineAt.value || phase.value !== "ended") return 0;
  return Math.max(0, Math.ceil((rematchDeadlineAt.value - nowTick.value) / 1000));
});
const tickTimer = setInterval(() => (nowTick.value = Date.now()), 500);
const myRematch = computed(() => rematchVotes.value.includes(myId.value));

// 终局数据：优先实时 final 事件，兜底快照里的 ended 摘要（刷新/重连后事件已丢）
const finalData = computed<any | null>(
  () => gameEvents.final || game.value?.ended || null,
);

// 使用 composable 获取成员状态函数
const { memberState, isActiveMember } = useMemberState({
  myId,
  gameType,
  phase,
  game,
  gameEvents,
  finalData,
  chipTableGames,
});

const players = computed(() => members.value.filter((m) => m.seat >= 0));

const waitingText = computed(() => {
  if (players.value.length < 2)
    return "等待另一位玩家加入…把房间码发给朋友吧";
  if (mySeat.value >= 0)
    return myReady.value ? "等待对方准备…" : "准备好了就点「准备」开局";
  return "等待玩家准备开局…";
});

const overText = computed(() => {
  if (gameType.value === "gomoku") {
    if (game.value.winner === 3)
      return overReason.value ? `平局！（${overReason.value}）` : "平局！";
    const winnerSeat = game.value.winner - 1;
    const w = members.value.find((m) => m.seat === winnerSeat);
    const who = w ? (w.userId === myId.value ? "你" : w.nickname) : "";
    const reason = overReason.value ? `（${overReason.value}）` : "";
    return `${who}获胜！${reason}`;
  }
  if (gameType.value === "spy") {
    const f = finalData.value;
    if (f?.winner === "civilian") return "🎉 卧底全部出局，平民胜利！";
    if (f?.winner === "spy") return "🕵️ 卧底胜利，潜伏到了最后！";
    return overReason.value ? `对局结束（${overReason.value}）` : "对局结束";
  }
  // 排名制游戏（你画我猜/答题对战/UNO）：取第一名
  const top = finalData.value?.ranking?.[0];
  if (top) {
    const who = top.userId === myId.value ? "你" : top.nickname;
    return gameType.value === "draw"
      ? `🏆 ${who}以 ${top.total} 分夺冠！`
      : `🎉 ${who}获胜！`;
  }
  return overReason.value ? `对局结束（${overReason.value}）` : "对局结束";
});

const playingStatusText = computed(() => {
  if (mySeat.value < 0) return "对局进行中，你正在观战";
  const gt = gameType.value;
  if (gt === "gomoku")
    return game.value.turn === myColor.value ? "轮到你落子" : "等待对方落子…";
  if (gt === "uno") {
    if (game.value.turnSeat === mySeat.value) return "轮到你出牌";
    const name = members.value.find(
      (m) => m.seat === game.value.turnSeat,
    )?.nickname;
    return name ? `等待 ${name} 出牌…` : "对局进行中";
  }
  if (gt === "draw") {
    if (game.value.drawerSeat === mySeat.value)
      return game.value.phase === "picking" ? "轮到你选词" : "你来画，大家来猜";
    return game.value.myGuessed
      ? "你已猜对，等其他小伙伴…"
      : "看画面猜词，在下方输入你的答案";
  }
  if (gt === "spy") {
    return game.value.phase === "vote"
      ? "🗳️ 投票中，点击玩家名牌投票"
      : "🗣️ 描述阶段（线下口头描述）";
  }
  if (gt === "quiz")
    return game.value.myAnswered
      ? "你已作答，等待出下一题…"
      : "答题进行中，拼手速！";
  if (gt === "blackjack") {
    if (game.value.isBanker)
      return game.value.phase === "dealer"
        ? "庄家自动结算中…"
        : "你是庄家，等待闲家行动";
    if (game.value.phase === "betting")
      return game.value.myStake
        ? "已下注，等待其他玩家…"
        : "请选择下注金额";
    if (game.value.phase === "acting")
      return game.value.turnSeat === mySeat.value
        ? "轮到你行动（要牌/停牌/加倍）"
        : "等待其他玩家行动…";
    if (game.value.phase === "dealer") return "庄家结算中…";
    return "本手结算中…";
  }
  if (gt === "zjh") {
    if (game.value.phase === "showdown") return "开牌！比大小…";
    if (game.value.phase === "settle") return "本手结算中…";
    if (game.value.turnSeat === mySeat.value) {
      if (game.value.myFolded) return "你已弃牌，观战中";
      if (game.value.myAllIn) return "你已 all-in，等待开牌";
      return game.value.mySeen
        ? "轮到你行动（跟注/加注/比牌/弃牌）"
        : "轮到你：可先看牌再行动";
    }
    const name = members.value.find(
      (m) => m.seat === game.value.turnSeat,
    )?.nickname;
    return name ? `等待 ${name} 行动…` : "对局进行中";
  }
  return "对局进行中";
});

const scrollChat = () =>
  nextTick(() => {
    // ChatPanel 内部的 scrollChat 通过 expose 调用
  });

const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null);

const applySnapshot = (s: S2CSnapshot) => {
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
  if (s.gameType === "quiz" && s.qid) {
    gameEvents.question = { ...s.game, ...s, scores: s.game?.scores || [] } as S2CQuizEvent;
  }
  chatPanelRef.value?.scrollChat();
};

const send = (obj: Record<string, unknown>) => ws.send(obj);

const onGameAction = (action: Record<string, unknown>) => {
  soundManager.playClick();
  send(action);
};

const handleSendText = (text: string) => {
  if (gameType.value === "draw" && phase.value === "playing") {
    send({ t: "guess", content: text });
  } else {
    send({ t: "chat", kind: "text", content: text });
  }
};

const sendQuick = (kind: "emoji" | "quick", content: string) => {
  send({ t: "chat", kind, content });
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
    recorder.error.value =
      e instanceof Error ? e.message : "语音发送失败";
  }
};

let voiceAudio: HTMLAudioElement | null = null;
const playVoice = async (v: VoiceItem) => {
  if (playingVoice.value === v.voiceId) {
    voiceAudio?.pause();
    playingVoice.value = "";
    return;
  }
  voiceAudio?.pause();
  playingVoice.value = v.voiceId;
  try {
    const blob = await fetchRoomVoice(roomId, v.voiceId);
    const audio = new Audio(URL.createObjectURL(blob));
    voiceAudio = audio;
    audio.onended = () => (playingVoice.value = "");
    await audio.play();
  } catch {
    playingVoice.value = "";
  }
};

// ── 退出/解散 ──
const leaveToLobby = () => {
  const pos = Number(window.history.state?.position ?? 0);
  if (pos > 0) router.go(-1);
  else router.replace("/battle");
};

const doExit = () => {
  send({ t: "leave" });
  ws.close();
  leaveToLobby();
};

const askExit = () => {
  if (phase.value === "playing" && mySeat.value >= 0) {
    const isChipTable = chipTableGames.includes(gameType.value);
    confirmBox.value = {
      text: isChipTable
        ? "对局正在进行，退出将按弃牌处理，已投入的积分不退，确定退出？"
        : "对局正在进行，退出将判你认输，确定退出？",
      ok: () => {
        send({ t: "resign" });
        doExit();
      },
    };
    return;
  }
  doExit();
};

const askDisband = () => {
  confirmBox.value = {
    text: "解散后房间立即销毁，聊天和语音全部清空，确定？",
    ok: () => {
      send({ t: "disband" });
      ws.close();
      leaveToLobby();
    },
  };
};

const copied = ref(false);

const copyCode = async () => {
  try {
    const link = `${location.origin}${location.pathname}#/battle/room/${roomId}`;
    await navigator.clipboard.writeText(link);
    setTimeout(() => (copied.value = false), 1500);
    copied.value = true;
  } catch {
    // 剪贴板不可用时静默
  }
};

const askResign = () => {
  confirmBox.value = {
    text: "确定认输吗？",
    ok: () => send({ t: "resign" }),
  };
};

// ── 注册 WS 事件（提取到 composable） ──
const { registerAll } = useRoomEvents(ws, {
  myId,
  mySeat,
  gameType,
  members,
  phase,
  hostUserId,
  board,
  game,
  chatList,
  voiceList,
  overReason,
  rematchVotes,
  rematchDeadlineAt,
  lastWsError,
  gameEvents,
  applySnapshot,
  scrollChat: () => chatPanelRef.value?.scrollChat(),
  leaveToLobby,
});

onMounted(() => {
  registerAll();
  ws.connect(roomId);
});

onUnmounted(() => {
  clearInterval(tickTimer);
  ws.close();
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

.conn-tip {
  text-align: center;
  font-size: 12px;
  color: #e67e22;
  padding: 4px 0;
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
