<template>
  <div class="profile-edit card">
    <div class="profile-entry" @click="$router.push('/profile')">
      <PlayerAvatar :avatar="avatar" :size="52" />
      <div class="pe-main">
        <div class="pe-title">👤 个人中心</div>
        <div class="pe-desc">头像 · 昵称 · 头像历史</div>
      </div>
      <span class="pe-arrow">›</span>
    </div>

    <div class="section-title pin-title">🔑 角色口令</div>
    <div class="pin-desc">
      设置 4 位数字口令后，切换这个角色需要先输口令，别人就不能随便玩你的档案啦。
    </div>
    <div class="pin-status">
      <span :class="['pin-state', hasPin ? 'on' : '']">{{
        hasPin ? '🔒 已设置口令' : '🔓 未设置'
      }}</span>
    </div>
    <template v-if="hasPin">
      <input
        v-model="pinOld"
        class="pin-input"
        type="password"
        inputmode="numeric"
        maxlength="4"
        placeholder="当前口令"
      />
      <input
        v-model="pinNew"
        class="pin-input"
        type="password"
        inputmode="numeric"
        maxlength="4"
        placeholder="新口令（4 位数字，留空=清除）"
      />
    </template>
    <template v-else>
      <input
        v-model="pinNew"
        class="pin-input"
        type="password"
        inputmode="numeric"
        maxlength="4"
        placeholder="设置 4 位数字口令"
      />
    </template>
    <button class="save-profile-btn pin-btn" :disabled="savingPin" @click="savePin">
      {{ savingPin ? '处理中…' : hasPin ? '修改 / 清除口令' : '设置口令' }}
    </button>
    <div v-if="pinMsg" class="pin-msg" :class="{ err: pinIsErr }">
      {{ pinMsg }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { updateMyPin } from '@/api/user';
import PlayerAvatar from '@/components/PlayerAvatar.vue';

defineProps<{
  avatar: string;
}>();

const hasPin = ref(false);
const pinOld = ref('');
const pinNew = ref('');
const savingPin = ref(false);
const pinMsg = ref('');
const pinIsErr = ref(false);

const flashPin = (text: string, isErr = false) => {
  pinMsg.value = text;
  pinIsErr.value = isErr;
  setTimeout(() => {
    pinMsg.value = '';
  }, 3000);
};

const savePin = async () => {
  if (savingPin.value) return;
  if (hasPin.value && !/^\d{4}$/.test(pinOld.value)) {
    flashPin('请先输入当前口令（4 位数字）', true);
    return;
  }
  if (pinNew.value && !/^\d{4}$/.test(pinNew.value)) {
    flashPin('新口令需为 4 位数字', true);
    return;
  }
  savingPin.value = true;
  try {
    const result = await updateMyPin({
      oldPin: pinOld.value || undefined,
      newPin: pinNew.value,
    });
    hasPin.value = result.hasPin;
    pinOld.value = '';
    pinNew.value = '';
    flashPin(result.hasPin ? '口令已设置 🔒' : '口令已清除 🔓');
  } catch (e: any) {
    flashPin(e?.message || '操作失败，请重试', true);
  } finally {
    savingPin.value = false;
  }
};

// 暴露给父组件，用于初始化 hasPin 状态
defineExpose({ hasPin });
</script>

<style scoped>
.card {
  background: #fff;
  padding: 20px;
  border-radius: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.section-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 2px solid #f0f0f0;
}

.profile-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 4px 14px;
  border-bottom: 1px dashed #e3e8ef;
  margin-bottom: 14px;
  cursor: pointer;
}

.pe-title {
  font-size: 15px;
  font-weight: bold;
  color: #333;
}

.pe-desc {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.pe-arrow {
  margin-left: auto;
  font-size: 20px;
  color: #c3c8d0;
}

.pin-title {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid #f0f0f0;
}

.pin-desc {
  font-size: 12px;
  color: #999;
  line-height: 1.7;
  margin-bottom: 8px;
}

.pin-status {
  margin-bottom: 8px;
}

.pin-state {
  font-size: 13px;
  color: #999;
}

.pin-state.on {
  color: #27ae60;
  font-weight: 600;
}

.pin-input {
  width: 100%;
  margin-bottom: 8px;
  padding: 11px 12px;
  border: 2px solid #e5e5e5;
  border-radius: 12px;
  font-size: 16px;
  letter-spacing: 6px;
  outline: none;
  box-sizing: border-box;
}

.pin-input:focus {
  border-color: #667eea;
}

.save-profile-btn {
  width: 100%;
  margin-top: 4px;
  padding: 12px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.save-profile-btn:disabled {
  opacity: 0.5;
}

.pin-btn {
  background: linear-gradient(135deg, #43a047 0%, #66bb6a 100%);
}

.pin-msg {
  margin-top: 10px;
  font-size: 13px;
  color: #27ae60;
}

.pin-msg.err {
  color: #e74c3c;
}
</style>
