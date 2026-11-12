<template>
  <div v-if="lastWsError" class="conn-tip" data-testid="ws-error">{{ lastWsError }}</div>
  <div class="status-line" data-testid="status-line">
    <template v-if="phase === 'waiting'">
      <span data-testid="waiting-text">{{ waitingText }}</span>
    </template>
    <template v-else-if="phase === 'playing'">
      <span data-testid="playing-text">{{ playingStatusText }}</span>
    </template>
    <template v-else>
      <span data-testid="over-text">{{ overText }}</span>
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
