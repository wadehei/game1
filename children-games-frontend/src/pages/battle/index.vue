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
      <div class="game-cards">
        <button
          v-for="g in games"
          :key="g.type"
          class="game-card"
          :class="{ active: selected === g.type }"
          @click="selected = g.type"
        >
          <span class="gc-icon">{{ g.emoji }}</span>
          <span class="gc-title">{{ g.title }}</span>
          <span class="gc-desc">{{ g.desc }}</span>
          <span class="gc-range">{{ g.minPlayers }}~{{ g.maxPlayers }} 人</span>
        </button>
      </div>

      <!-- 建房配置（牌类；进游戏前设置，游戏期间不可改） -->
      <div v-if="selected === 'blackjack'" class="cfg">
        <div class="cfg-title">🃏 21点 房间设置</div>
        <div class="cfg-row">
          <span class="cfg-label">庄家模式</span>
          <div class="seg">
            <button
              v-for="m in BANKER_MODES"
              :key="m.value"
              class="seg-btn"
              :class="{ on: bjBankerMode === m.value }"
              @click="bjBankerMode = m.value as 'rotate' | 'winner' | 'keep'"
            >
              {{ m.label }}
            </button>
          </div>
        </div>
        <div class="cfg-row">
          <span class="cfg-label">局数</span>
          <input v-model.number="bjRounds" class="cfg-num" type="number" min="2" max="20" />
          <span class="cfg-note">打满即结算（2~20 手）</span>
        </div>
      </div>
      <div v-if="selected === 'zjh'" class="cfg">
        <div class="cfg-title">♠️ 炸金花 房间设置</div>
        <div class="cfg-row">
          <span class="cfg-label">特殊 235</span>
          <button class="switch" :class="{ on: zjhSpecial235 }" @click="zjhSpecial235 = !zjhSpecial235">
            <span class="knob" />
          </button>
          <span class="cfg-note">不同花 2-3-5 反杀豹子</span>
        </div>
        <div class="cfg-row">
          <span class="cfg-label">超时动作</span>
          <div class="seg">
            <button class="seg-btn" :class="{ on: zjhTimeoutFold }" @click="zjhTimeoutFold = true">自动弃牌</button>
            <button class="seg-btn" :class="{ on: !zjhTimeoutFold }" @click="zjhTimeoutFold = false">自动跟注</button>
          </div>
        </div>
        <div class="cfg-row">
          <span class="cfg-label">庄家模式</span>
          <div class="seg">
            <button class="seg-btn" :class="{ on: zjhBankerMode === 'rotate' }" @click="zjhBankerMode = 'rotate'">轮庄</button>
            <button class="seg-btn" :class="{ on: zjhBankerMode === 'winner' }" @click="zjhBankerMode = 'winner'">赢家坐庄</button>
          </div>
        </div>
        <div class="cfg-row">
          <span class="cfg-label">必闷轮数</span>
          <div class="seg">
            <button v-for="n in [0, 1, 2]" :key="n" class="seg-btn" :class="{ on: zjhMustBlind === n }" @click="zjhMustBlind = n">
              {{ n === 0 ? '不限' : `前${n}轮` }}
            </button>
          </div>
        </div>
        <div class="cfg-row">
          <span class="cfg-label">局数</span>
          <input v-model.number="zjhRounds" class="cfg-num" type="number" min="2" max="30" />
          <span class="cfg-note">打满即结算（2~30 手）</span>
        </div>
      </div>
      <div v-if="selected === 'blackjack' || selected === 'zjh'" class="cfg-row career-row">
        <span class="cfg-label">战绩计入生涯</span>
        <button class="switch" :class="{ on: careerOn }" @click="careerOn = !careerOn">
          <span class="knob" />
        </button>
        <span class="cfg-note">关闭后只动积分、不记战绩</span>
      </div>

      <button class="create-btn" :disabled="creating" @click="create">
        {{ creating ? '创建中…' : `创建「${selectedTitle}」房间` }}
      </button>
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
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { createRoom, getGameList } from '@/api/room';

const router = useRouter();
const creating = ref(false);
const joinCode = ref('');
const errMsg = ref('');
const games = ref<Array<{ type: string; title: string; emoji: string; desc: string; minPlayers: number; maxPlayers: number }>>([]);
const selected = ref('gomoku');
const selectedTitle = computed(() => games.value.find((g) => g.type === selected.value)?.title || '五子棋');

// 建房配置（牌类）
const BANKER_MODES = [
  { value: 'rotate', label: '轮流坐庄' },
  { value: 'winner', label: '赢家坐庄' },
  { value: 'keep', label: '持续坐庄可让庄' },
];
const bjBankerMode = ref<'rotate' | 'winner' | 'keep'>('rotate');
const bjRounds = ref(8);
const zjhSpecial235 = ref(true);
const zjhTimeoutFold = ref(true);
const zjhRounds = ref(15);
const zjhBankerMode = ref<'rotate' | 'winner'>('rotate');
const zjhMustBlind = ref(0);
const careerOn = ref(true);

const buildConfig = (): Record<string, unknown> | undefined => {
  if (selected.value === 'blackjack') {
    return { bankerMode: bjBankerMode.value, roundLimit: clampRound(bjRounds.value, 2, 20, 8), career: careerOn.value };
  }
  if (selected.value === 'zjh') {
    return {
      special235: zjhSpecial235.value,
      timeoutFold: zjhTimeoutFold.value,
      roundLimit: clampRound(zjhRounds.value, 2, 30, 15),
      career: careerOn.value,
      bankerMode: zjhBankerMode.value,
      mustBlindRounds: zjhMustBlind.value,
    };
  }
  return undefined;
};
const clampRound = (v: number, min: number, max: number, dft: number): number => {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return dft;
  return Math.min(max, Math.max(min, n));
};

onMounted(async () => {
  games.value = await getGameList().catch(() => [{ type: 'gomoku', title: '五子棋', emoji: '⚫', desc: '', minPlayers: 2, maxPlayers: 2 }]);
});

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
    const { roomId } = await createRoom(selected.value, buildConfig());
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

.game-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.game-card {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  grid-template-areas: "icon title range" "icon desc range";
  column-gap: 10px;
  align-items: center;
  border: 2px solid #e3e8ef;
  background: #fafbfc;
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  text-align: left;
  transition: all 0.12s ease;
}

.game-card.active {
  border-color: #667eea;
  background: #eef1fd;
}

.gc-icon {
  grid-area: icon;
  font-size: 24px;
}

.gc-title {
  grid-area: title;
  font-size: 14px;
  font-weight: bold;
  color: #333;
}

.gc-desc {
  grid-area: desc;
  font-size: 11px;
  color: #999;
}

.gc-range {
  grid-area: range;
  font-size: 11px;
  color: #b3bac4;
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

/* 建房配置 */
.cfg {
  background: #f8f9fd;
  border: 1px solid #eef1fd;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 10px;
}

.cfg-title {
  font-size: 13px;
  font-weight: bold;
  color: #444;
  margin-bottom: 10px;
}

.cfg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
}

.career-row {
  padding: 4px 2px 12px;
}

.cfg-label {
  font-size: 13px;
  color: #555;
  min-width: 74px;
}

.cfg-note {
  font-size: 11px;
  color: #a0a6b0;
}

.cfg-num {
  width: 64px;
  border: 2px solid #e3e8ef;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 14px;
  text-align: center;
}

.seg {
  display: flex;
  gap: 0;
  border: 1.5px solid #e3e8ef;
  border-radius: 9px;
  overflow: hidden;
}

.seg-btn {
  border: none;
  background: #fff;
  color: #888;
  font-size: 12px;
  padding: 7px 10px;
  cursor: pointer;
}

.seg-btn.on {
  background: #667eea;
  color: #fff;
  font-weight: bold;
}

.switch {
  width: 44px;
  height: 25px;
  border-radius: 13px;
  border: none;
  background: #d5dae3;
  position: relative;
  cursor: pointer;
  transition: background 0.15s;
}

.switch.on {
  background: #667eea;
}

.switch .knob {
  position: absolute;
  top: 2.5px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.15s;
}

.switch.on .knob {
  left: 21px;
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
