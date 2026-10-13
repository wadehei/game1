<template>
  <div class="panel">
    <h2 class="panel-title">🎙️ 语音配音（爸爸妈妈的原声）</h2>

    <div class="hint">
      逐条录制下面的台词，孩子端会<b>优先播放你的录音</b>，未录制的台词自动使用系统语音。
      对着台词用平时和孩子说话的语气读即可；不满意可重录或删除。
    </div>

    <div v-if="micError" class="mic-error">🎤 {{ micError }}</div>

    <div class="line-list">
      <div v-for="line in LINES" :key="line.key" class="line-row" :class="{ recorded: recordedKeys.has(line.key) }">
        <div class="line-head">
          <span class="line-scene">{{ line.scene }}</span>
          <span v-if="recordedKeys.has(line.key)" class="ok-badge">已配音</span>
        </div>
        <div class="line-text">“{{ line.text }}”</div>

        <div class="line-actions">
          <template v-if="recordingKey === line.key">
            <span class="rec-dot"></span>
            <span class="rec-time">{{ recSeconds }}s</span>
            <button class="act-btn stop" @click="stopRecording">■ 停止</button>
          </template>
          <template v-else>
            <button class="act-btn rec" :disabled="!!recordingKey" @click="startRecording(line.key)">● 录音</button>
            <button
              v-if="pendingKey === line.key && pendingUrl"
              class="act-btn play"
              @click="playPending"
            >▶ 试听</button>
            <button
              v-if="pendingKey === line.key && pendingUrl"
              class="act-btn save"
              :disabled="saving"
              @click="save(line.key)"
            >{{ saving ? '保存中…' : '保存' }}</button>
            <button
              v-if="recordedKeys.has(line.key) && pendingKey !== line.key"
              class="act-btn play"
              @click="playRecorded(line.key)"
            >▶ 试听</button>
            <button
              v-if="recordedKeys.has(line.key)"
              class="act-btn danger"
              @click="remove(line.key)"
            >删除</button>
          </template>
        </div>
      </div>
    </div>

    <div v-if="message" class="msg">{{ message }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { listVoiceLines, uploadVoice, deleteVoice, type VoiceLineStatus } from '@/api/admin';

const LINES = [
  { key: 'memory_intro', scene: '记忆翻牌 · 入场', text: '翻一翻卡片，找出两个一样的图案' },
  { key: 'fruit_intro', scene: '接水果 · 入场', text: '移动篮子，接住水果，小心炸弹哦' },
  { key: 'puzzle_intro', scene: '拼图 · 入场', text: '点一点小方块，把图片拼回原样' },
  { key: 'balloon_intro', scene: '打气球 · 入场', text: '点一点屏幕，把气球打爆吧' },
  { key: 'tank_intro', scene: '坦克大战 · 入场', text: '左右移动坦克，打败坏坦克' },
  { key: 'mole_intro', scene: '打地鼠 · 入场', text: '打地鼠咯！小兔子是好朋友，不能打哦' },
  { key: 'simon_intro', scene: '音乐记忆 · 入场', text: '记住闪光的顺序，然后跟着点' },
  { key: 'math_correct', scene: '数学 · 答对', text: '答对啦！' },
  { key: 'math_wrong', scene: '数学 · 答错', text: '再想一想哦' },
  { key: 'result_win', scene: '通用 · 通关', text: '恭喜你，通关啦！你真棒！' },
  { key: 'result_lose', scene: '通用 · 失败', text: '没关系，再试一次，你可以的！' },
  { key: 'rest_start', scene: '护眼休息', text: '让眼睛休息一下，抬头看看窗外最远的地方' },
];

const recordedKeys = reactive(new Set<string>());
const recordingKey = ref<string | null>(null);
const recSeconds = ref(0);
const pendingKey = ref<string | null>(null);
const pendingUrl = ref<string | null>(null);
const saving = ref(false);
const message = ref('');
const micError = ref('');

let mediaRecorder: MediaRecorder | null = null;
let audioStream: MediaStream | null = null;
let chunks: Blob[] = [];
let pendingBlob: Blob | null = null;
let secTimer: ReturnType<typeof setInterval> | null = null;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
let pendingAudio: HTMLAudioElement | null = null;

const flash = (text: string) => {
  message.value = text;
  setTimeout(() => {
    message.value = '';
  }, 2500);
};

const loadList = async () => {
  const list: VoiceLineStatus[] = await listVoiceLines().catch(() => []);
  recordedKeys.clear();
  list.forEach((v) => recordedKeys.add(v.key));
};

const cleanupPending = () => {
  pendingKey.value = null;
  pendingUrl.value = null;
  pendingBlob = null;
  if (pendingAudio) {
    pendingAudio.pause();
    pendingAudio = null;
  }
};

const startRecording = async (key: string) => {
  micError.value = '';
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    micError.value = '无法访问麦克风，请检查浏览器权限（需 HTTPS 或 localhost）';
    return;
  }
  cleanupPending();
  chunks = [];
  const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  mediaRecorder = new MediaRecorder(audioStream, mime ? { mimeType: mime } : undefined);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    audioStream?.getTracks().forEach((t) => t.stop());
    audioStream = null;
    if (secTimer) clearInterval(secTimer);
    if (autoStopTimer) clearTimeout(autoStopTimer);
    recordingKey.value = null;
    if (chunks.length === 0) return;
    pendingBlob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' });
    pendingUrl.value = URL.createObjectURL(pendingBlob);
    pendingKey.value = key;
  };
  mediaRecorder.start();
  recordingKey.value = key;
  recSeconds.value = 0;
  secTimer = setInterval(() => {
    recSeconds.value++;
  }, 1000);
  // 最长 15 秒自动停
  autoStopTimer = setTimeout(() => {
    if (recordingKey.value) stopRecording();
  }, 15000);
};

const stopRecording = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
};

const playPending = () => {
  if (!pendingUrl.value) return;
  pendingAudio?.pause();
  pendingAudio = new Audio(pendingUrl.value);
  pendingAudio.play().catch(() => {});
};

const playRecorded = (key: string) => {
  const list = [...recordedKeys];
  void list;
  pendingAudio?.pause();
  pendingAudio = new Audio(`/api/voice/${key}?v=${Date.now()}`);
  pendingAudio.play().catch(() => {});
};

const save = async (key: string) => {
  if (!pendingBlob || saving.value) return;
  saving.value = true;
  try {
    await uploadVoice(key, pendingBlob);
    recordedKeys.add(key);
    cleanupPending();
    flash('已保存，孩子端下次进入游戏生效');
    await loadList();
  } catch {
    flash('保存失败，请重试');
  } finally {
    saving.value = false;
  }
};

const remove = async (key: string) => {
  if (!confirm('删除这条录音？删除后该台词回退为系统语音。')) return;
  await deleteVoice(key).catch(() => {});
  recordedKeys.delete(key);
  flash('已删除，回退系统语音');
};

onMounted(loadList);
onUnmounted(() => {
  stopRecording();
  audioStream?.getTracks().forEach((t) => t.stop());
  if (secTimer) clearInterval(secTimer);
  if (autoStopTimer) clearTimeout(autoStopTimer);
});
</script>

<style scoped>
.panel-title {
  font-size: 19px;
  margin: 0 0 12px;
}

.hint {
  font-size: 13px;
  color: #777;
  line-height: 1.7;
  background: #eef6fd;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 14px;
}

.mic-error {
  background: #fdecea;
  color: #e74c3c;
  font-size: 13px;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 12px;
}

.line-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.line-row {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  border: 1px solid #eef1f4;
}

.line-row.recorded {
  border-left: 4px solid #27ae60;
}

.line-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.line-scene {
  font-size: 12px;
  color: #888;
}

.ok-badge {
  font-size: 10px;
  color: #27ae60;
  background: rgba(39, 174, 96, 0.12);
  padding: 2px 8px;
  border-radius: 8px;
}

.line-text {
  font-size: 15px;
  color: #2c3e50;
  margin-bottom: 10px;
}

.line-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.act-btn {
  border: none;
  background: #eef1f4;
  color: #555;
  font-size: 12px;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
}

.act-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.act-btn.rec {
  background: #fdecea;
  color: #e74c3c;
  font-weight: bold;
}

.act-btn.stop {
  background: #e74c3c;
  color: #fff;
  font-weight: bold;
}

.act-btn.play {
  background: #eef6fd;
  color: #2980b9;
}

.act-btn.save {
  background: #27ae60;
  color: #fff;
  font-weight: bold;
}

.act-btn.danger {
  background: #fdecea;
  color: #e74c3c;
}

.rec-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #e74c3c;
  animation: blink 1s ease infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.rec-time {
  font-size: 13px;
  color: #e74c3c;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}

.msg {
  margin-top: 14px;
  font-size: 13px;
  color: #27ae60;
}
</style>
