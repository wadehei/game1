<template>
  <div class="battle-page">
    <!-- 顶栏 -->
    <div class="fb-topbar">
      <button class="fb-back" @click="goBack">‹ 返回</button>
      <span class="fb-title">🎯 好友对战</span>
      <span class="fb-placeholder" />
    </div>

    <div class="hero card">
      <div class="hero-icon">♟️</div>
      <div class="hero-text">
        <div class="hero-title">和朋友实时连线</div>
        <div class="hero-desc">创建房间把房间码发给朋友，输入即可同房间对战</div>
      </div>
    </div>

    <!-- 创建房间 -->
    <div class="section card">
      <div class="section-title">创建房间</div>
      <button class="create-btn" :disabled="creating" @click="create">
        {{ creating ? '创建中…' : '⚫ 开一局五子棋' }}
      </button>
      <div class="game-desc">15路棋盘 · 黑棋先手 · 五连成线获胜，支持观战和再来一局</div>
    </div>

    <!-- 加入房间 -->
    <div class="section card">
      <div class="section-title">加入房间</div>
      <div class="join-row">
        <input
          v-model="joinCode"
          class="join-input"
          inputmode="numeric"
          maxlength="4"
          placeholder="输入 4 位房间码"
          @keyup.enter="join"
        />
        <button class="join-btn" :disabled="joinCode.length !== 4" @click="join">加入</button>
      </div>
      <div v-if="errMsg" class="err">{{ errMsg }}</div>
    </div>

    <div class="tips card">
      <div class="section-title">玩法说明</div>
      <div class="tip-line">💬 房间内可以发文字、表情、快捷用语和语音</div>
      <div class="tip-line">🎙️ 语音消息只在房间内有效，房间解散后自动清空</div>
      <div class="tip-line">📱 手机切出去再回来，30 秒内重连不断局</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { createRoom } from '@/api/room';

const router = useRouter();
const creating = ref(false);
const joinCode = ref('');
const errMsg = ref('');

const goBack = () => {
  const pos = Number(window.history.state?.position ?? 0);
  if (pos > 0) router.back();
  else router.replace('/');
};

const create = async () => {
  if (creating.value) return;
  creating.value = true;
  errMsg.value = '';
  try {
    const { roomId } = await createRoom('gomoku');
    router.push(`/battle/room/${roomId}`);
  } catch (e) {
    errMsg.value = e instanceof Error ? e.message : '创建失败，请重试';
  } finally {
    creating.value = false;
  }
};

const join = () => {
  const code = joinCode.value.trim();
  if (!/^\d{4}$/.test(code)) {
    errMsg.value = '房间码是 4 位数字';
    return;
  }
  errMsg.value = '';
  router.push(`/battle/room/${code}`);
};
</script>

<style scoped>
.battle-page {
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

.hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  margin-bottom: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
}

.hero-icon {
  font-size: 38px;
}

.hero-title {
  font-size: 17px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 4px;
}

.hero-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
}

.section {
  padding: 16px;
  margin-bottom: 14px;
  background: #fff;
  border-radius: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
}

.create-btn {
  width: 100%;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 16px;
  font-weight: bold;
  padding: 13px;
  border-radius: 12px;
  cursor: pointer;
}

.create-btn:disabled {
  opacity: 0.6;
}

.game-desc {
  margin-top: 10px;
  font-size: 12px;
  color: #999;
  text-align: center;
}

.join-row {
  display: flex;
  gap: 8px;
}

.join-input {
  flex: 1;
  border: 2px solid #e3e8ef;
  border-radius: 12px;
  padding: 11px 14px;
  font-size: 18px;
  letter-spacing: 6px;
  text-align: center;
  color: #333;
  min-width: 0;
}

.join-input:focus {
  outline: none;
  border-color: #667eea;
}

.join-btn {
  border: none;
  background: #27ae60;
  color: #fff;
  font-size: 15px;
  font-weight: bold;
  padding: 0 22px;
  border-radius: 12px;
  cursor: pointer;
}

.join-btn:disabled {
  opacity: 0.5;
}

.err {
  margin-top: 10px;
  font-size: 13px;
  color: #e74c3c;
}

.tips {
  padding: 16px;
  background: #fff;
  border-radius: 16px;
}

.tip-line {
  font-size: 13px;
  color: #666;
  padding: 4px 0;
}
</style>
