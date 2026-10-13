<template>
  <div class="profiles-page">
    <div class="page-title">🎮 谁来玩？</div>
    <div class="page-subtitle">点头像选角色，比一比谁更厉害！</div>

    <!-- 成员列表：按总星星排序，就是家庭总榜 -->
    <div class="profile-list">
      <div v-for="(p, index) in profiles" :key="p.id" class="profile-card" :class="{ me: p.id === myUserId }" @click="selectProfile(p)">
        <span class="rank-badge">{{ index + 1 }}</span>
        <PlayerAvatar :avatar="p.avatar" :size="64" />
        <div class="profile-name">{{ p.nickname }}</div>
        <div class="profile-stats">Lv.{{ p.level }} · ⭐{{ p.totalStars }}</div>
        <span v-if="p.hasPin" class="lock-badge">🔒</span>
      </div>

      <div class="profile-card create-card" @click="openCreate">
        <div class="create-plus">＋</div>
        <div class="profile-name">新角色</div>
      </div>
    </div>

    <!-- 口令键盘（锁定角色验证） -->
    <PinPad
      v-if="pinTarget"
      :title="`${pinTarget.nickname} 的口令`"
      :error="pinError"
      @complete="submitPin"
      @cancel="pinTarget = null"
    />

    <!-- 创建角色弹层 -->
    <div v-if="creating" class="create-overlay" @click.self="creating = false">
      <div class="create-content">
        <div class="create-title">创建新角色</div>
        <input v-model="nickname" class="create-input" maxlength="12" placeholder="起个名字吧" />
        <div class="emoji-label">选一个你的角色</div>
        <div class="emoji-grid">
          <span
            v-for="e in EMOJIS"
            :key="e"
            class="emoji-cell"
            :class="{ picked: pickedEmoji === e }"
            @click="pickedEmoji = e"
          >{{ e }}</span>
        </div>
        <div class="create-btns">
          <button class="c-btn cancel" @click="creating = false">取消</button>
          <button class="c-btn ok" :disabled="!canCreate" @click="createProfile">开始冒险！</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { familyLogin, getProfiles, type FamilyProfile } from '@/api/user';
import { useUserStore } from '@/store/user';
import PlayerAvatar from '@/components/PlayerAvatar.vue';
import PinPad from '@/components/PinPad.vue';

const EMOJIS = ['🐰', '🐻', '🐼', '🦊', '🐸', '🐵', '🐯', '🦁', '🐷', '🐨', '👑', '🦄', '🌟', '🌸'];

const router = useRouter();
const userStore = useUserStore();

const profiles = ref<FamilyProfile[]>([]);
const creating = ref(false);
const nickname = ref('');
const pickedEmoji = ref('');
const canCreate = computed(() => !!nickname.value.trim() && !!pickedEmoji.value);
const myUserId = computed(() => userStore.userInfo?.id);

const loadProfiles = async () => {
  try {
    profiles.value = await getProfiles();
  } catch {
    profiles.value = [];
  }
};

const enter = () => {
  router.replace('/');
};

// ─── 口令保护的角色 ────────────────────────────────
const pinTarget = ref<FamilyProfile | null>(null);
const pinError = ref('');

const selectProfile = async (p: FamilyProfile) => {
  if (p.hasPin) {
    // 有口令：先弹键盘验证（登录调用时携带 pin）
    pinError.value = '';
    pinTarget.value = p;
    return;
  }
  try {
    await familyLogin({ uid: p.id });
    enter();
  } catch (e) {
    console.log('角色登录失败', e);
  }
};

const submitPin = async (pin: string) => {
  if (!pinTarget.value) return;
  try {
    await familyLogin({ uid: pinTarget.value.id, pin });
    pinTarget.value = null;
    enter();
  } catch (e: any) {
    pinError.value = e?.response?.data?.message || '口令不正确，再试试';
  }
};

const openCreate = () => {
  nickname.value = '';
  pickedEmoji.value = '';
  creating.value = true;
};

const createProfile = async () => {
  if (!canCreate.value) return;
  try {
    await familyLogin({ nickname: nickname.value, avatar: pickedEmoji.value });
    creating.value = false;
    enter();
  } catch (e) {
    console.log('创建角色失败', e);
  }
};

onMounted(loadProfiles);
</script>

<style scoped>
.profiles-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #FFE5E5 0%, #F5F5F5 100%);
  padding: 28px 20px;
}

.page-title {
  font-size: 28px;
  font-weight: bold;
  color: #333;
  text-align: center;
}

.page-subtitle {
  font-size: 14px;
  color: #999;
  text-align: center;
  margin: 8px 0 24px;
}

.profile-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  max-width: 420px;
  margin: 0 auto;
}

.profile-card {
  position: relative;
  background: #fff;
  border-radius: 20px;
  padding: 20px 12px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  border: 3px solid transparent;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.profile-card:active {
  transform: scale(0.96);
}

.profile-card.me {
  border-color: #667eea;
}

.rank-badge {
  position: absolute;
  top: 8px;
  left: 10px;
  font-size: 13px;
  font-weight: bold;
  color: #FFB347;
}

.lock-badge {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 14px;
}

.profile-name {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin-top: 10px;
}

.profile-stats {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.create-card {
  justify-content: center;
  min-height: 150px;
  background: rgba(255, 255, 255, 0.6);
  border: 2px dashed #ccc;
  box-shadow: none;
}

.create-plus {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #f0f0f0;
  color: #999;
  font-size: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 创建弹层 */
.create-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: createFadeIn 0.25s ease;
}

@keyframes createFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.create-content {
  background: #fff;
  border-radius: 24px;
  padding: 28px 24px;
  width: 90%;
  max-width: 340px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: createBounceIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes createBounceIn {
  from { transform: scale(0.5); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.create-title {
  font-size: 19px;
  font-weight: bold;
  color: #333;
  text-align: center;
}

.create-input {
  width: 100%;
  margin-top: 16px;
  padding: 13px;
  border: 2px solid #e5e5e5;
  border-radius: 14px;
  font-size: 16px;
  text-align: center;
  outline: none;
}

.create-input:focus {
  border-color: #667eea;
}

.emoji-label {
  font-size: 13px;
  color: #999;
  margin: 16px 0 8px;
  text-align: center;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 8px;
}

.emoji-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  border-radius: 12px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.12s ease;
}

.emoji-cell:active {
  transform: scale(0.9);
}

.emoji-cell.picked {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
}

.create-btns {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.c-btn {
  flex: 1;
  padding: 13px;
  border-radius: 18px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
}

.c-btn.cancel {
  background: #f0f0f0;
  color: #666;
}

.c-btn.ok {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.c-btn.ok:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
