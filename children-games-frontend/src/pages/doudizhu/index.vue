<template>
  <div class="doudizhu-game">
    <!-- 游戏头部 -->
    <GameHeader
      :items="headerItems"
      :muted="audioSynth.isMuted()"
      header-class="doudizhu-header"
      @toggle-sound="toggleSound"
      @go-back="router.back()"
    />

    <!-- 游戏区域 -->
    <div class="game-area">
      <!-- 上方对手 -->
      <div class="opponent-area top">
        <div class="player-info">
          <span class="role-icon">{{ players[2]?.isLandlord ? '👑' : '🎮' }}</span>
          <span class="player-name">{{ players[2]?.name || '对手' }}</span>
          <span class="card-count">{{ players[2]?.cards.length || 0 }}张</span>
        </div>
        <div class="opponent-cards">
          <CardBack v-for="i in players[2]?.cards.length || 0" :key="i" :width="30" :height="42" />
        </div>
        <div v-if="lastPlayByPlayer[2]" class="play-area">
          <CardItem
            v-for="card in lastPlayByPlayer[2]"
            :key="card.id"
            :card="card"
            :width="45"
            :height="63"
          />
        </div>
      </div>

      <!-- 中间区域：底牌 + 出牌区 -->
      <div class="center-area">
        <!-- 底牌 -->
        <div v-if="showBottomCards" class="bottom-cards">
          <div class="label">底牌</div>
          <div class="cards">
            <CardItem
              v-for="card in bottomCards"
              :key="card.id"
              :card="card"
              :width="40"
              :height="56"
            />
          </div>
        </div>

        <!-- 左侧对手出牌 -->
        <div v-if="lastPlayByPlayer[1]" class="side-play left">
          <CardItem
            v-for="card in lastPlayByPlayer[1]"
            :key="card.id"
            :card="card"
            :width="45"
            :height="63"
          />
        </div>

        <!-- 右侧提示（pass等） -->
        <div v-if="currentAction" class="action-display">
          <span class="action-text">{{ currentAction }}</span>
        </div>
      </div>

      <!-- 下方：玩家手牌 -->
      <div class="player-area bottom">
        <div class="player-info">
          <span class="role-icon">{{ players[0]?.isLandlord ? '👑' : '🎮' }}</span>
          <span class="player-name">{{ players[0]?.name || '你' }}</span>
        </div>
        <HandCards
          :cards="players[0]?.cards || []"
          :selected-ids="selectedCardIds"
          :selectable="isMyTurn"
          @select="selectCard"
          @deselect="deselectCard"
        />
      </div>

      <!-- 左侧对手信息 -->
      <div class="opponent-info left-info">
        <div class="player-info vertical">
          <span class="role-icon">{{ players[1]?.isLandlord ? '👑' : '🎮' }}</span>
          <span class="player-name">{{ players[1]?.name || '对手' }}</span>
          <span class="card-count">{{ players[1]?.cards.length || 0 }}张</span>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div v-if="gameStatus === 'playing' && isMyTurn" class="action-bar">
      <button class="action-btn hint" @click="showHint">提示</button>
      <button class="action-btn pass" :disabled="!canPass()" @click="playPass">不出</button>
      <button class="action-btn play" :disabled="selectedCardIds.length === 0" @click="playCards">
        出牌
      </button>
    </div>

    <!-- 叫地主按钮 -->
    <div v-if="gameStatus === 'bidding' && currentBidder === 0" class="bid-bar">
      <button class="bid-btn no" @click="bid(0)">不叫</button>
      <button class="bid-btn" @click="bid(1)">1分</button>
      <button class="bid-btn" @click="bid(2)">2分</button>
      <button class="bid-btn yes" @click="bid(3)">3分</button>
    </div>

    <!-- 开始按钮 -->
    <div v-if="gameStatus === 'waiting'" class="start-bar">
      <button class="start-btn" @click="startGame">开始游戏</button>
    </div>

    <!-- 游戏结果弹窗 -->
    <ResultModal
      :show="showResult"
      :won="gameWon"
      :stars="stars"
      :icon="gameWon ? '🎉' : '💪'"
      :title="gameWon ? '恭喜获胜！' : '再接再厉！'"
      :info="resultInfo"
      @retry="restartGame"
      @next="nextLevel"
    />

    <!-- 暂停 -->
    <PauseMenu :show="paused" @pause="pauseGame" @resume="resumeGame" @quit="quitGame" />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useDoudizhuGame } from './composables/useDoudizhuGame';
import GameHeader from '@/components/GameHeader.vue';
import ResultModal from '@/components/ResultModal.vue';
import PauseMenu from '@/components/PauseMenu.vue';
import CardItem from './components/CardItem.vue';
import CardBack from './components/CardBack.vue';
import HandCards from './components/HandCards.vue';

const router = useRouter();

const {
  gameStatus,
  players,
  bottomCards,
  showBottomCards,
  currentBidder,
  selectedCardIds,
  lastPlayByPlayer,
  paused,
  showResult,
  gameWon,
  stars,
  resultInfo,
  currentAction,
  isMyTurn,
  canPass,
  headerItems,
  audioSynth,
  startGame,
  bid,
  selectCard,
  deselectCard,
  playCards,
  playPass,
  showHint,
  restartGame,
  nextLevel,
  toggleSound,
  pauseGame,
  resumeGame,
  quitGame,
} = useDoudizhuGame();
</script>

<style scoped>
.doudizhu-game {
  height: 100vh;
  background: linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%);
  padding: 10px;
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
}

.doudizhu-header {
  background: rgba(0, 0, 0, 0.3);
  margin-bottom: 10px;
  flex-shrink: 0;
}

:deep(.doudizhu-header .label) {
  color: rgba(255, 255, 255, 0.7);
}

:deep(.doudizhu-header .value) {
  color: white;
}

:deep(.doudizhu-header .sound-btn) {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

:deep(.doudizhu-header .back-btn) {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}

.game-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}

.opponent-area {
  display: flex;
  align-items: center;
  padding: 10px;
  gap: 10px;
}

.opponent-area.top {
  justify-content: center;
}

.opponent-cards {
  display: flex;
  gap: 2px;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.3);
  padding: 6px 12px;
  border-radius: 20px;
  color: white;
  font-size: 14px;
}

.player-info .role-icon {
  font-size: 18px;
}

.card-count {
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.center-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  min-height: 100px;
}

.bottom-cards {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.bottom-cards .label {
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}

.bottom-cards .cards {
  display: flex;
  gap: 5px;
}

.side-play {
  position: absolute;
  display: flex;
  gap: 3px;
}

.side-play.left {
  left: 60px;
  top: 50%;
  transform: translateY(-50%);
}

.action-display {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.6);
  padding: 10px 20px;
  border-radius: 20px;
  color: white;
  font-size: 16px;
}

.player-area.bottom {
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.opponent-info.left-info {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
}

.player-info.vertical {
  flex-direction: column;
  padding: 10px;
}

/* 操作按钮 */
.action-bar,
.bid-bar,
.start-bar {
  display: flex;
  justify-content: center;
  gap: 15px;
  padding: 15px;
  flex-shrink: 0;
}

.action-btn,
.bid-btn,
.start-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 25px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.action-btn:disabled,
.bid-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.hint {
  background: #2196f3;
  color: white;
}

.action-btn.pass {
  background: #757575;
  color: white;
}

.action-btn.play {
  background: #4caf50;
  color: white;
}

.bid-btn {
  background: #ff9800;
  color: white;
}

.bid-btn.no {
  background: #757575;
}

.bid-btn.yes {
  background: #f44336;
}

.start-btn {
  background: #4caf50;
  color: white;
  padding: 15px 40px;
  font-size: 18px;
}

.action-btn:not(:disabled):hover,
.bid-btn:not(:disabled):hover,
.start-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.play-area {
  display: flex;
  gap: 3px;
}
</style>
