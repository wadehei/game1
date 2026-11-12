<template>
  <div class="chat-card">
    <div ref="chatListEl" class="chat-list">
      <div
        v-for="(m, i) in chatList"
        :key="i"
        class="chat-msg"
        :class="{ mine: m.userId === myId }"
      >
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
      <div
        v-for="v in voiceList"
        :key="v.voiceId"
        class="chat-msg"
        :class="{ mine: v.userId === myId }"
      >
        <span class="chat-nick">{{ v.userId === myId ? '我' : v.nickname }}</span>
        <button
          class="voice-bubble"
          :class="{ playing: playingVoice === v.voiceId }"
          @click="$emit('playVoice', v)"
        >
          ▶ {{ playingVoice === v.voiceId ? '播放中' : `${v.duration}"` }}
        </button>
      </div>
      <div v-if="!chatList.length && !voiceList.length" class="chat-empty">
        还没有人说话，来打个招呼吧～
      </div>
    </div>

    <!-- 录音状态 -->
    <div v-if="recording" class="rec-bar">
      <span class="rec-dot" /> 正在录音 {{ recSeconds }}"（松开发送）
    </div>

    <!-- 快捷面板 -->
    <div v-if="panel === 'emoji'" class="panel">
      <div class="panel-grid">
        <button
          v-for="e in ROOM_EMOJIS"
          :key="e"
          class="emoji-cell"
          @click="$emit('sendQuick', 'emoji', e)"
        >
          {{ e }}
        </button>
      </div>
    </div>
    <div v-if="panel === 'quick'" class="panel">
      <button
        v-for="p in QUICK_PHRASES"
        :key="p"
        class="phrase-cell"
        @click="$emit('sendQuick', 'quick', p)"
      >
        {{ p }}
      </button>
    </div>

    <!-- 输入栏 -->
    <div class="chat-bar">
      <button class="bar-btn" :class="{ on: panel === 'emoji' }" @click="togglePanel('emoji')">
        😊
      </button>
      <button class="bar-btn" :class="{ on: panel === 'quick' }" @click="togglePanel('quick')">
        💬
      </button>
      <input
        v-model="chatInput"
        class="chat-input"
        maxlength="100"
        :placeholder="inputPlaceholder"
        @keyup.enter="handleSendText"
      />
      <button
        class="bar-btn mic"
        :class="{ rec: recording }"
        @mousedown.prevent="$emit('micDown')"
        @mouseup.prevent="$emit('micUp')"
        @touchstart.prevent="$emit('micDown')"
        @touchend.prevent="$emit('micUp')"
        @touchcancel.prevent="$emit('micUp')"
      >
        🎙️
      </button>
      <button class="send-btn" :disabled="!chatInput.trim()" @click="handleSendText">发送</button>
    </div>
    <div v-if="recError" class="rec-err">{{ recError }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { QUICK_PHRASES, ROOM_EMOJIS } from '@/utils/quickChat';

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

const props = defineProps<{
  chatList: ChatItem[];
  voiceList: VoiceItem[];
  myId: number;
  playingVoice: string;
  gameType: string;
  phase: string;
  recording: boolean;
  recSeconds: number;
  recError: string;
}>();

const emit = defineEmits<{
  (e: 'sendText', text: string): void;
  (e: 'sendQuick', kind: 'emoji' | 'quick', content: string): void;
  (e: 'playVoice', v: VoiceItem): void;
  (e: 'micDown'): void;
  (e: 'micUp'): void;
}>();

const chatInput = ref('');
const panel = ref<'' | 'emoji' | 'quick'>('');
const chatListEl = ref<HTMLElement | null>(null);

const inputPlaceholder = computed(() =>
  props.gameType === 'draw' && props.phase === 'playing' ? '在这里输入你猜的词…' : '说点什么…'
);

const togglePanel = (type: 'emoji' | 'quick') => {
  panel.value = panel.value === type ? '' : type;
};

const handleSendText = () => {
  const text = chatInput.value.trim();
  if (!text) return;
  emit('sendText', text);
  chatInput.value = '';
};

const scrollChat = () =>
  nextTick(() => chatListEl.value?.scrollTo({ top: chatListEl.value!.scrollHeight }));

defineExpose({ scrollChat });
</script>

<style scoped>
.chat-card {
  flex: 1;
  background: #fff;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
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
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 58px;
  background: #fff;
  border: 1px solid #e8ecf1;
  border-radius: 12px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
  padding: 10px;
  z-index: 30;
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
</style>
