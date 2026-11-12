<template>
  <div v-if="show" class="settings-panel">
    <div class="sp-row">
      <span class="sp-icon">{{ volume === 0 ? '🔇' : '🔊' }}</span>
      <span class="sp-label">音效音量</span>
      <input
        class="sp-slider"
        type="range"
        min="0"
        max="100"
        :value="Math.round(volume * 100)"
        @input="onVolumeInput"
      />
      <span class="sp-num">{{ Math.round(volume * 100) }}%</span>
    </div>
    <button class="sp-test" @click="$emit('testSound')">点一下试听</button>
    <div class="sp-row" style="margin-top: 10px">
      <span class="sp-icon">🎨</span>
      <span class="sp-label">主题</span>
      <div class="theme-chips">
        <button
          v-for="opt in THEME_OPTIONS"
          :key="opt.value"
          class="theme-chip"
          :class="{ picked: themeChoice === opt.value }"
          @click="$emit('pickTheme', opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
    <div class="sp-tip">背景音乐功能即将上线</div>
  </div>
</template>

<script setup lang="ts">
import { type ThemeChoice } from '@/utils/theme';

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'auto', label: '跟随系统' },
  { value: 'light', label: '日间' },
  { value: 'dark', label: '夜间' },
];

defineProps<{
  show: boolean;
  volume: number;
  themeChoice: ThemeChoice;
}>();

const emit = defineEmits<{
  testSound: [];
  pickTheme: [value: ThemeChoice];
  volumeChange: [value: number];
}>();

const onVolumeInput = (e: Event) => {
  const target = e.target as HTMLInputElement;
  emit('volumeChange', Number(target.value) / 100);
};
</script>

<style scoped>
.settings-panel {
  background: #fff;
  border-radius: 14px;
  padding: 12px 16px;
  margin-bottom: 16px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.sp-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sp-icon {
  font-size: 18px;
}

.sp-label {
  font-size: 13px;
  color: #555;
  flex-shrink: 0;
}

.sp-slider {
  flex: 1;
}

.sp-num {
  font-size: 12px;
  color: #667eea;
  width: 38px;
  text-align: right;
}

.sp-test {
  margin-top: 8px;
  border: 1px solid #e3e8ef;
  background: #fafbfc;
  color: #666;
  font-size: 12px;
  padding: 5px 14px;
  border-radius: 10px;
  cursor: pointer;
}

.theme-chips {
  display: flex;
  gap: 6px;
  flex: 1;
}

.theme-chip {
  border: 2px solid #e3e8ef;
  background: #fafbfc;
  color: #666;
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 12px;
  cursor: pointer;
}

.theme-chip.picked {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.08);
  color: #667eea;
  font-weight: 600;
}

.sp-tip {
  margin-top: 6px;
  font-size: 11px;
  color: #b3bac4;
}
</style>
