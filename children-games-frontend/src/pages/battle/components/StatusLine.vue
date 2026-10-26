<template>
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
</template>

<script setup lang="ts">
defineProps<{
  phase: 'waiting' | 'playing' | 'ended';
  waitingText: string;
  playingStatusText: string;
  overText: string;
  lastWsError: string;
}>();
</script>

<style scoped>
.conn-tip {
  text-align: center;
  font-size: 12px;
  color: #e67e22;
  padding: 4px 0;
}

.status-line {
  text-align: center;
  font-size: 13px;
  color: #555;
  padding: 4px 0 8px;
}
</style>
