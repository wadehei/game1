<template>
  <!-- 家长验证弹层 -->
  <div
    v-if="showGate"
    class="parent-overlay"
    @click.self="closeGate"
  >
    <div class="parent-content">
      <div class="parent-title">🔐 家长验证</div>
      <div class="parent-question">
        {{ gateQuestion.a }} + {{ gateQuestion.b }} = ?
      </div>
      <input
        v-model="gateAnswer"
        class="parent-input"
        type="number"
        inputmode="numeric"
        placeholder="请输入答案"
      />
      <div v-if="gateError" class="parent-error">答案不对，再试试～</div>
      <div class="parent-btns">
        <button class="p-btn-cancel" @click="closeGate">取消</button>
        <button class="p-btn-confirm" @click="confirmGate">确认</button>
      </div>
    </div>
  </div>

  <!-- 家长中心面板 -->
  <div
    v-if="showPanel"
    class="parent-overlay"
    @click.self="showPanel = false"
  >
    <div class="parent-content">
      <div class="parent-title">👪 家长中心</div>
      <div class="panel-row">
        <span class="panel-label">今日已玩</span>
        <strong class="panel-value">{{ todayMinutes }} 分钟</strong>
        <button class="mini-btn" @click="resetPlayTime">清零</button>
      </div>
      <div class="panel-col">
        <span class="panel-label">护眼提醒间隔（连续游玩后休息 20 秒）</span>
        <div class="interval-chips">
          <button
            v-for="opt in intervalOptions"
            :key="opt.value"
            class="chip"
            :class="{ active: restInterval === opt.value }"
            @click="saveInterval(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <button class="p-btn-confirm full" @click="showPanel = false">
        完成
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  getRestIntervalMinutes,
  getTodayPlaySeconds,
  resetTodayPlayTime,
} from "@/composables/usePlayTimeGuard";

const emit = defineEmits<{
  (e: "verified"): void;
}>();

const showGate = ref(false);
const showPanel = ref(false);
const gateQuestion = ref({ a: 0, b: 0 });
const gateAnswer = ref("");
const gateError = ref(false);
const todayMinutes = ref(Math.ceil(getTodayPlaySeconds() / 60));
const restInterval = ref(getRestIntervalMinutes());
const intervalOptions = [
  { value: 15, label: "15 分钟" },
  { value: 20, label: "20 分钟" },
  { value: 30, label: "30 分钟" },
  { value: 0, label: "关闭" },
];

const openGate = () => {
  gateQuestion.value = {
    a: 12 + Math.floor(Math.random() * 18),
    b: 12 + Math.floor(Math.random() * 18),
  };
  gateAnswer.value = "";
  gateError.value = false;
  showGate.value = true;
};

const closeGate = () => {
  showGate.value = false;
};

const confirmGate = () => {
  if (
    parseInt(gateAnswer.value, 10) ===
    gateQuestion.value.a + gateQuestion.value.b
  ) {
    showGate.value = false;
    todayMinutes.value = Math.ceil(getTodayPlaySeconds() / 60);
    restInterval.value = getRestIntervalMinutes();
    showPanel.value = true;
    emit("verified");
  } else {
    gateError.value = true;
  }
};

const handleResetPlayTime = () => {
  resetTodayPlayTime();
  todayMinutes.value = 0;
};

const saveInterval = (value: number) => {
  restInterval.value = value;
  try {
    localStorage.setItem("parent_rest_interval", String(value));
  } catch {
    // ignore
  }
};

// 暴露给父组件
defineExpose({ openGate, handleResetPlayTime });
</script>

<style scoped>
.parent-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: parentFadeIn 0.25s ease;
}

@keyframes parentFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.parent-content {
  background: #fff;
  border-radius: 20px;
  padding: 28px;
  width: 90%;
  max-width: 320px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: parentBounceIn 0.35s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes parentBounceIn {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.parent-title {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  text-align: center;
}

.parent-question {
  font-size: 30px;
  font-weight: bold;
  color: #667eea;
  text-align: center;
  margin: 18px 0;
}

.parent-input {
  width: 100%;
  padding: 13px;
  border: 2px solid #e5e5e5;
  border-radius: 14px;
  font-size: 18px;
  text-align: center;
  outline: none;
  transition: border-color 0.2s ease;
}

.parent-input:focus {
  border-color: #667eea;
}

.parent-error {
  color: #ff6b6b;
  font-size: 13px;
  text-align: center;
  margin-top: 8px;
}

.parent-btns {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.p-btn-cancel,
.p-btn-confirm {
  flex: 1;
  padding: 13px;
  border-radius: 18px;
  font-size: 15px;
  font-weight: 600;
  border: none;
  cursor: pointer;
}

.p-btn-cancel {
  background: #f0f0f0;
  color: #666;
}

.p-btn-confirm {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
}

.p-btn-confirm.full {
  width: 100%;
  margin-top: 20px;
}

.panel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px solid #f0f0f0;
}

.panel-label {
  font-size: 14px;
  color: #666;
  flex: 1;
}

.panel-value {
  font-size: 16px;
  color: #333;
}

.mini-btn {
  padding: 6px 14px;
  border: none;
  border-radius: 12px;
  background: #f0f0f0;
  color: #666;
  font-size: 13px;
  cursor: pointer;
}

.panel-col {
  padding: 14px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.interval-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  padding: 8px 16px;
  border-radius: 16px;
  border: 2px solid #e5e5e5;
  background: #fff;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip.active {
  border-color: #667eea;
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
  font-weight: bold;
}
</style>
