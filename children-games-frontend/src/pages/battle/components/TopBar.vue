<template>
  <div class="room-top">
    <button class="rt-exit" @click="$emit('exit')">‹ 退出</button>
    <div class="rt-code" @click="$emit('copyCode')" title="复制邀请链接，朋友点开直接进房">
      房间 <b>{{ roomId }}</b>
      <span class="rt-copy">{{ copied ? '链接已复制' : '复制链接' }}</span>
    </div>
    <button v-if="isHost" class="rt-disband" @click="$emit('disband')">解散</button>
    <span v-else class="rt-placeholder" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  roomId: string;
  isHost: boolean;
  copied: boolean;
}>();

defineEmits<{
  (e: "exit"): void;
  (e: "disband"): void;
  (e: "copyCode"): void;
}>();
</script>

<style scoped>
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
</style>
