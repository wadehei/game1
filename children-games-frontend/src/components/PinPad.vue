<template>
  <div class="pin-pad-overlay" @click.self="$emit('cancel')">
    <div class="pin-pad">
      <div class="pin-title">{{ title }}</div>
      <div class="pin-dots">
        <span v-for="i in 4" :key="i" class="dot" :class="{ filled: i <= pin.length }"></span>
      </div>
      <div v-if="error" class="pin-error">{{ error }}</div>
      <div class="keys">
        <button v-for="k in [1, 2, 3, 4, 5, 6, 7, 8, 9]" :key="k" class="key" @click="press(String(k))">{{ k }}</button>
        <span class="key blank"></span>
        <button class="key" @click="press('0')">0</button>
        <button class="key del" @click="del">⌫</button>
      </div>
      <button class="pin-cancel" @click="$emit('cancel')">取消</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  title?: string;
  error?: string;
}>(), {
  title: '请输入口令',
  error: '',
});

const emit = defineEmits<{
  complete: [pin: string];
  cancel: [];
}>();

const pin = ref('');

const press = (digit: string) => {
  if (pin.value.length >= 4) return;
  pin.value += digit;
  if (pin.value.length === 4) {
    // 输满 4 位自动提交
    setTimeout(() => {
      emit('complete', pin.value);
      pin.value = '';
    }, 150);
  }
};

const del = () => {
  pin.value = pin.value.slice(0, -1);
};

// 外部报错后清空重输
watch(() => props.error, (v) => {
  if (v) pin.value = '';
});
</script>

<style scoped>
.pin-pad-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.pin-pad {
  background: #fff;
  border-radius: 24px;
  padding: 26px 22px 20px;
  width: 88%;
  max-width: 300px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.pin-title {
  font-size: 16px;
  font-weight: bold;
  color: #2c3e50;
}

.pin-dots {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin: 16px 0 6px;
}

.dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #c9d4e0;
  transition: all 0.15s ease;
}

.dot.filled {
  background: #5b8def;
  border-color: #5b8def;
  transform: scale(1.1);
}

.pin-error {
  font-size: 12px;
  color: #e74c3c;
  min-height: 18px;
  margin-bottom: 4px;
}

.keys {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 8px;
}

.key {
  aspect-ratio: 1.35;
  border: none;
  border-radius: 16px;
  background: #f0f4f8;
  font-size: 24px;
  font-weight: bold;
  color: #2c3e50;
  cursor: pointer;
  transition: all 0.1s ease;
  touch-action: manipulation;
}

.key:active {
  transform: scale(0.92);
  background: #dde7f0;
}

.key.del {
  font-size: 20px;
  color: #888;
}

.key.blank {
  background: none;
}

.pin-cancel {
  margin-top: 14px;
  border: none;
  background: none;
  color: #999;
  font-size: 13px;
  cursor: pointer;
  padding: 6px;
}
</style>
