<template>
  <img v-if="isUrl" class="player-avatar" :src="avatar" :style="sizeStyle" alt="头像" />
  <span v-else class="player-avatar avatar-emoji" :style="[sizeStyle, emojiBgStyle]">{{ emoji }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  /** 头像：URL 或 emoji 角色（空则用默认） */
  avatar?: string;
  /** 显示尺寸 px */
  size?: number;
}>(), {
  avatar: '',
  size: 44,
});

// 支持 http(s) 外链与站内相对路径（/api/avatars/...，本地上传的照片）
const isUrl = computed(() => /^(https?:)?\//.test(props.avatar));
const emoji = computed(() => (props.avatar && !isUrl.value ? props.avatar : '😊'));
const sizeStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size * 0.58)}px`,
}));
// 按角色内容分配固定的柔和底色，能区分成员
const AVATAR_COLORS = ['#FFE0B2', '#B2DFDB', '#E1BEE7', '#FFCCBC', '#C5CAE9', '#FFF9C4', '#B2EBF2', '#F8BBD0'];
const emojiBgStyle = computed(() => {
  const idx = [...(props.avatar || '')].reduce((sum, ch) => sum + (ch.codePointAt(0) || 0), 0);
  return { background: AVATAR_COLORS[idx % AVATAR_COLORS.length] };
});
</script>

<style scoped>
.player-avatar {
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.avatar-emoji {
  border: 2px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}
</style>
