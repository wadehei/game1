<template>
  <div class="battle-mode">
    <div class="battle-entry" @click="$emit('enter')">
      <span class="battle-icon">♟️</span>
      <div class="battle-text">
        <div class="battle-title">对战大厅</div>
        <div class="battle-desc">创建房间，把房间码发给朋友；或输入房间码加入</div>
      </div>
      <span class="battle-arrow">›</span>
    </div>
    <div class="battle-tips card">
      <div class="battle-tip-line">
        🎲 已上线：比大小 · 21点 · 五子棋 · 答题对战 · 你画我猜 · 谁是卧底 · UNO
      </div>
      <div class="battle-tip-line">💬 房间内可文字/表情/语音聊天</div>
      <div class="battle-tip-line">🔒 积分仅站内娱乐，随账号永久跟随</div>
    </div>
    <button class="go-battle-btn" @click="$emit('enter')">⚔️ 进入对战大厅</button>
  </div>
</template>

<script setup lang="ts">
defineEmits<{
  enter: [];
}>();
</script>

<style scoped>
.battle-mode .battle-entry {
  margin-bottom: 12px;
}

.battle-tips {
  background: #fff;
  border-radius: 14px;
  padding: 14px 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  margin-bottom: 14px;
}

.battle-tip-line {
  font-size: 13px;
  color: #666;
  line-height: 1.9;
}

.go-battle-btn {
  width: 100%;
  padding: 15px;
  border: none;
  border-radius: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.35);
}

.battle-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: linear-gradient(135deg, #1a1a2e 0%, #5f27cd 100%);
  border-radius: 16px;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(95, 39, 205, 0.35);
}

.battle-icon {
  font-size: 28px;
}

.battle-text {
  flex: 1;
}

.battle-title {
  font-size: 16px;
  font-weight: bold;
  color: #fff;
}

.battle-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 2px;
}

.battle-arrow {
  font-size: 22px;
  color: rgba(255, 255, 255, 0.6);
}
</style>
