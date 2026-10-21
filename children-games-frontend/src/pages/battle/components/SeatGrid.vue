<template>
  <div class="seats-grid">
    <div
      v-for="m in members"
      :key="m.userId"
      class="seat-cell"
      :class="{ active: isActive(m), off: !m.online }"
    >
      <div class="cell-top">
        <PlayerAvatar :avatar="m.avatar" :size="30" />
        <span v-if="m.userId === hostUserId" class="host-mark" title="房主">👑</span>
      </div>
      <div class="cell-name">
        {{ m.nickname }}<template v-if="m.userId === myId">（我）</template>
      </div>
      <div class="cell-state">{{ getState(m) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PlayerAvatar from "@/components/PlayerAvatar.vue";

export interface SeatMember {
  userId: number;
  nickname: string;
  avatar: string;
  seat: number;
  ready: boolean;
  online: boolean;
}

defineProps<{
  members: SeatMember[];
  hostUserId: number;
  myId: number;
  getState: (m: SeatMember) => string;
  isActive: (m: SeatMember) => boolean;
}>();
</script>

<style scoped>
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
</style>
