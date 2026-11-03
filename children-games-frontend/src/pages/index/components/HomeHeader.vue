<template>
  <div class="header">
    <div class="user-info" @click="$emit('clickAvatar')">
      <PlayerAvatar :avatar="userInfo?.avatar" :size="50" />
      <div class="user-details">
        <div class="nickname">{{ userInfo?.nickname || '选个角色' }}</div>
        <div class="level-badge">
          <span class="level-text">Lv.{{ userInfo?.level || 1 }}</span>
        </div>
      </div>
    </div>
    <div class="header-right">
      <div class="star-count" :class="{ pulse: starPulse }">
        <span class="star-icon">⭐</span>
        <span class="star-num">{{ totalStars }}</span>
      </div>
      <button class="settings-btn" @click="$emit('toggleSettings')">⚙️</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import PlayerAvatar from '@/components/PlayerAvatar.vue';

interface UserInfo {
  nickname?: string;
  avatar?: string;
  level?: number;
}

defineProps<{
  userInfo: UserInfo | null;
  totalStars: number;
  starPulse: boolean;
}>();

defineEmits<{
  clickAvatar: [];
  toggleSettings: [];
}>();
</script>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: #fff;
  border-radius: 16px;
  margin-bottom: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
}

.user-info {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  margin-right: 12px;
}

.user-details {
  display: flex;
  flex-direction: column;
}

.nickname {
  font-size: 16px;
  font-weight: bold;
  color: #333;
}

.level-badge {
  background: linear-gradient(135deg, #ffe66d 0%, #ffb347 100%);
  padding: 2px 10px;
  border-radius: 10px;
  margin-top: 4px;
}

.level-text {
  font-size: 11px;
  color: #fff;
  font-weight: bold;
}

.star-count {
  display: flex;
  align-items: center;
  background: #fff9e6;
  padding: 8px 16px;
  border-radius: 16px;
}

.star-count.pulse {
  animation: pulse 0.3s ease;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
}

.star-icon {
  font-size: 20px;
  margin-right: 6px;
}

.star-num {
  font-size: 18px;
  font-weight: bold;
  color: #ffb347;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-btn {
  border: none;
  background: #fff;
  font-size: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}
</style>
