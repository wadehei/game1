<template>
  <div class="profile-page">
    <!-- 顶栏 -->
    <div class="fb-topbar">
      <button class="fb-back" @click="goBack">‹ 返回</button>
      <span class="fb-title">👤 个人中心</span>
      <span class="fb-placeholder" />
    </div>

    <!-- 头像与昵称 -->
    <div class="section card">
      <div class="section-title">头像与昵称</div>
      <div class="avatar-row">
        <PlayerAvatar :avatar="avatar" :size="72" />
        <div class="nick-box">
          <span class="nick-label">昵称</span>
          <input v-model="nickname" class="nick-input" maxlength="12" placeholder="输入昵称" />
        </div>
      </div>

      <!-- emoji 形象 -->
      <div class="sub-title">选一个 emoji 形象</div>
      <div class="emoji-grid">
        <button
          v-for="e in AVATARS"
          :key="e"
          class="emoji-cell"
          :class="{ picked: avatar === e }"
          @click="avatar = e"
        >{{ e }}</button>
      </div>

      <!-- 上传照片 -->
      <label class="upload-btn">
        📷 上传照片做头像
        <input type="file" accept="image/*" class="file-input" @change="onPhotoPick" />
      </label>
      <div v-if="uploadTip" class="upload-tip">{{ uploadTip }}</div>
    </div>

    <!-- 头像历史 -->
    <div class="section card">
      <div class="section-title">头像历史<span class="sub-hint">点一下即可换回（最多保留 12 个）</span></div>
      <div v-if="history.length === 0" class="history-empty">还没有历史头像，换一次头像就有了～</div>
      <div v-else class="history-grid">
        <button
          v-for="(h, i) in history"
          :key="i"
          class="history-cell"
          :class="{ current: h === avatar }"
          @click="pickHistory(h)"
        >
          <PlayerAvatar :avatar="h" :size="48" />
          <span v-if="h === avatar" class="current-mark">当前</span>
        </button>
      </div>
    </div>

    <!-- 保存 -->
    <button class="save-btn" :disabled="saving" @click="save">
      {{ saving ? '保存中…' : '保存' }}
    </button>
    <div v-if="msg" class="msg" :class="{ err: isErr }">{{ msg }}</div>

    <!-- 切换角色 -->
    <div class="section card switch-role" @click="$router.push('/profiles')">
      <div class="switch-row">
        <span class="switch-icon">🔄</span>
        <div class="switch-main">
          <div class="switch-title">切换角色</div>
          <div class="switch-desc">回到家庭成员选择页</div>
        </div>
        <span class="pe-arrow">›</span>
      </div>
    </div>

    <!-- 未来扩展占位 -->
    <div class="section card coming">
      <div class="section-title">对战战绩 <span class="soon">即将上线</span></div>
      <div class="coming-desc">你的五子棋/答题/UNO 战绩将在这里展示</div>
    </div>
    <div class="section card coming">
      <div class="section-title">勋章墙 <span class="soon">即将上线</span></div>
      <div class="coming-desc">集齐星星解锁专属勋章</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/store/user';
import { getUserInfo, updateUserInfo } from '@/api/user';
import { uploadPhotoAvatar } from '@/utils/avatarUpload';
import PlayerAvatar from '@/components/PlayerAvatar.vue';

const AVATARS = ['🐰', '🐻', '🐼', '🦊', '🐸', '🐵', '🐯', '🦁', '🐷', '🐨', '👑', '🤖', '👻', '🦄', '🐢', '🐝'];

const router = useRouter();
const userStore = useUserStore();

const avatar = ref('🐰');
const nickname = ref('');
const history = ref<string[]>([]);
const saving = ref(false);
const msg = ref('');
const isErr = ref(false);
const uploadTip = ref('');

const goBack = () => router.back();

const refreshFromStore = () => {
  const info = userStore.userInfo;
  if (info) {
    avatar.value = info.avatar || '🐰';
    nickname.value = info.nickname || '';
  }
};

const pickHistory = async (h: string) => {
  if (h === avatar.value) return;
  avatar.value = h;
  // 切历史头像立即生效（同时维护历史顺序）
  try {
    const res = await updateUserInfo({ avatar: h });
    applyResult(res);
    msg.value = '头像已切换';
    isErr.value = false;
    setTimeout(() => (msg.value = ''), 1500);
  } catch (e) {
    isErr.value = true;
    msg.value = e instanceof Error ? e.message : '切换失败';
  }
};

const applyResult = (res: any) => {
  if (res?.avatarHistory) {
    history.value = res.avatarHistory;
  }
  userStore.setUserInfo({
    ...(userStore.userInfo || {}),
    id: res?.id ?? userStore.userInfo?.id ?? 0,
    nickname: res?.nickname ?? nickname.value,
    avatar: res?.avatar ?? avatar.value,
  } as any);
};

const save = async () => {
  if (saving.value) return;
  const name = nickname.value.trim();
  if (!name) {
    isErr.value = true;
    msg.value = '昵称不能为空';
    return;
  }
  saving.value = true;
  try {
    const res = await updateUserInfo({ nickname: name, avatar: avatar.value });
    applyResult(res);
    isErr.value = false;
    msg.value = '✅ 已保存';
    setTimeout(() => (msg.value = ''), 1800);
  } catch (e) {
    isErr.value = true;
    msg.value = e instanceof Error ? e.message : '保存失败';
  } finally {
    saving.value = false;
  }
};

const onPhotoPick = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploadTip.value = '上传中…';
  try {
    const url = await uploadPhotoAvatar(file);
    avatar.value = url;
    const res = await updateUserInfo({ avatar: url });
    applyResult(res);
    uploadTip.value = '✅ 照片头像已生效';
  } catch (err) {
    uploadTip.value = err instanceof Error ? err.message : '上传失败';
  }
};

onMounted(async () => {
  refreshFromStore();
  // 拉最新资料（含头像历史）
  try {
    const info = await getUserInfo();
    if (info) {
      avatar.value = info.avatar || '🐰';
      nickname.value = info.nickname || '';
      history.value = (info as any).avatarHistory || [];
    }
  } catch {
    // ignore
  }
});
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f5f7fa 0%, #e8ecf1 100%);
  padding: 16px;
  max-width: 500px;
  margin: 0 auto;
  box-sizing: border-box;
}

.fb-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.fb-back {
  border: none;
  background: #fff;
  color: #667eea;
  font-size: 14px;
  font-weight: bold;
  padding: 8px 14px;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.fb-title {
  font-size: 17px;
  font-weight: bold;
  color: #333;
}

.fb-placeholder {
  width: 64px;
}

.section {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  margin-bottom: 14px;
}

.section-title {
  font-size: 15px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
}

.sub-hint {
  font-size: 11px;
  font-weight: normal;
  color: #b3bac4;
  margin-left: 8px;
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}

.nick-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.nick-label {
  font-size: 12px;
  color: #999;
}

.nick-input {
  border: 2px solid #e3e8ef;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 14px;
  color: #333;
}

.nick-input:focus {
  outline: none;
  border-color: #667eea;
}

.sub-title {
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
}

.emoji-cell {
  border: 2px solid transparent;
  background: #f8f9fb;
  font-size: 22px;
  padding: 6px 0;
  border-radius: 10px;
  cursor: pointer;
}

.emoji-cell.picked {
  border-color: #667eea;
  background: #eef1fd;
}

.upload-btn {
  display: block;
  margin-top: 12px;
  border: 2px dashed #c9d1f5;
  border-radius: 10px;
  padding: 10px;
  text-align: center;
  font-size: 13px;
  color: #667eea;
  cursor: pointer;
}

.file-input {
  display: none;
}

.upload-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #27ae60;
  text-align: center;
}

.history-empty {
  font-size: 13px;
  color: #b5bac2;
  text-align: center;
  padding: 8px 0;
}

.history-grid {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.history-cell {
  position: relative;
  border: 2px solid #e3e8ef;
  background: #f8f9fb;
  border-radius: 12px;
  padding: 6px;
  cursor: pointer;
}

.history-cell.current {
  border-color: #667eea;
}

.current-mark {
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  background: #667eea;
  color: #fff;
  border-radius: 8px;
  padding: 0 6px;
  white-space: nowrap;
}

.save-btn {
  width: 100%;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 15px;
  font-weight: bold;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  margin-bottom: 8px;
}

.save-btn:disabled {
  opacity: 0.6;
}

.msg {
  text-align: center;
  font-size: 13px;
  color: #27ae60;
  margin-bottom: 10px;
}

.msg.err {
  color: #e74c3c;
}

.coming .soon {
  font-size: 10px;
  color: #fff;
  background: #c3c8d0;
  border-radius: 8px;
  padding: 1px 8px;
  margin-left: 6px;
  font-weight: normal;
}

.coming-desc {
  font-size: 12px;
  color: #b5bac2;
}
.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.switch-icon {
  font-size: 22px;
}

.switch-title {
  font-size: 14px;
  font-weight: bold;
  color: #333;
}

.switch-desc {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}
</style>
