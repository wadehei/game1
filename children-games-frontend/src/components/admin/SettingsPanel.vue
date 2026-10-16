<template>
  <div class="panel">
    <h2 class="panel-title">⏰ 护眼策略</h2>

    <div class="card">
      <div class="field">
        <div class="field-label">连续游玩提醒间隔</div>
        <div class="field-desc">孩子连续玩到设定时长后，全屏休息 20 秒。0 表示关闭提醒。此设置为全局默认，手机上的家长中心仍可单独覆盖。</div>
        <div class="chips">
          <button
            v-for="opt in OPTIONS"
            :key="opt.value"
            class="chip"
            :class="{ active: interval === opt.value }"
            @click="interval = opt.value"
          >{{ opt.label }}</button>
        </div>
      </div>
      <button class="save-btn" :disabled="saving" @click="save">
        {{ saving ? '保存中…' : '保存设置' }}
      </button>
      <div v-if="saved" class="saved-tip">✅ 已保存，孩子下次进游戏生效</div>

      <div class="voice-section">
        <div class="field-label">语音引导试听</div>
        <div class="voice-desc">当前音色：{{ voiceName }}</div>
        <div class="voice-tip">游戏内的引导/读题/鼓励语音使用同一音色。若音色较机械，建议用 Edge 浏览器打开本应用（自带"晓晓"等自然语音，效果明显更好）。</div>
        <button class="voice-btn" @click="testVoice">🔊 试听一段</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getSettings, updateSettings } from '@/api/admin';
import { showToast } from '@/utils/toastBus';
import { speak, currentVoiceName } from '@/utils/voice';

const OPTIONS = [
  { value: 15, label: '15 分钟' },
  { value: 20, label: '20 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '60 分钟' },
  { value: 0, label: '关闭' },
];

const interval = ref(20);
const saving = ref(false);
const saved = ref(false);
const voiceName = ref('检测中…');

const testVoice = () => {
  voiceName.value = currentVoiceName();
  speak('小朋友你好！答对啦，你真棒！要不要再玩一局呀？');
};

onMounted(async () => {
  const s = await getSettings().catch(() => null);
  if (s) {
    interval.value = s.restIntervalMinutes;
  }
  // 音色列表异步加载，稍后读取
  setTimeout(() => {
    voiceName.value = currentVoiceName();
  }, 600);
});

const save = async () => {
  saving.value = true;
  saved.value = false;
  try {
    await updateSettings({ restIntervalMinutes: interval.value });
    saved.value = true;
    setTimeout(() => {
      saved.value = false;
    }, 2500);
  } catch {
    showToast('保存失败，请稍后重试', 'error');
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.panel-title {
  font-size: 19px;
  margin: 0 0 16px;
}

.card {
  background: #fff;
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  max-width: 520px;
}

.field-label {
  font-size: 15px;
  font-weight: 600;
}

.field-desc {
  font-size: 13px;
  color: #999;
  margin: 8px 0 14px;
  line-height: 1.6;
}

.chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  padding: 9px 18px;
  border-radius: 18px;
  border: 2px solid #e5e5e5;
  background: #fff;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip.active {
  border-color: #3498db;
  background: rgba(52, 152, 219, 0.08);
  color: #3498db;
  font-weight: bold;
}

.save-btn {
  margin-top: 18px;
  padding: 12px 28px;
  border: none;
  border-radius: 12px;
  background: #3498db;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.saved-tip {
  margin-top: 12px;
  font-size: 13px;
  color: #27ae60;
}

.voice-section {
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px solid #f0f0f0;
}

.voice-desc {
  font-size: 13px;
  color: #3498db;
  margin: 8px 0 6px;
  font-weight: 600;
}

.voice-tip {
  font-size: 12px;
  color: #999;
  line-height: 1.7;
  margin-bottom: 12px;
}

.voice-btn {
  padding: 10px 22px;
  border: none;
  border-radius: 12px;
  background: #f0f4f8;
  color: #2c3e50;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.voice-btn:hover {
  background: #e4ebf2;
}
</style>
