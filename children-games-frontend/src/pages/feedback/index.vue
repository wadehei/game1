<template>
  <div class="feedback-page">
    <!-- 顶栏 -->
    <div class="fb-topbar">
      <button class="fb-back" @click="goBack">‹ 返回</button>
      <span class="fb-title">💬 意见反馈</span>
      <span class="fb-placeholder" />
    </div>

    <!-- 提交表单 -->
    <div class="fb-form card">
      <div class="fb-desc">发现 bug、想要新功能？说说你的想法，也可以看看大家的反馈并回复～</div>
      <div class="fb-types">
        <button
          v-for="t in FB_TYPES"
          :key="t.value"
          class="fb-type"
          :class="{ active: fbType === t.value }"
          @click="fbType = t.value"
        >{{ t.label }}</button>
      </div>
      <textarea v-model="fbContent" class="fb-input" rows="4" maxlength="1000" placeholder="说说你的想法（最多 1000 字）" />
      <button class="fb-submit" :disabled="fbSubmitting || !fbContent.trim()" @click="submitFb">
        {{ fbSubmitting ? '提交中…' : '提交反馈' }}
      </button>
      <div v-if="fbMsg" class="fb-msg" :class="{ err: fbIsErr }">{{ fbMsg }}</div>
    </div>

    <!-- 列表标签 -->
    <div class="fb-tabs">
      <button class="fb-tab" :class="{ active: activeTab === 'all' }" @click="switchTab('all')">
        大家的反馈
      </button>
      <button class="fb-tab" :class="{ active: activeTab === 'mine' }" @click="switchTab('mine')">
        我的反馈
      </button>
    </div>

    <!-- 反馈列表 -->
    <div v-if="loading" class="fb-empty">加载中…</div>
    <div v-else-if="feedbacks.length === 0" class="fb-empty">
      {{ activeTab === 'mine' ? '你还没有反馈过，来提第一条吧～' : '还没有反馈，来提第一条吧～' }}
    </div>
    <div v-else class="fb-list">
      <div v-for="f in feedbacks" :key="f.id" class="fb-item" :class="{ mine: f.userId === myId }">
        <div class="fb-line1">
          <span class="fb-author">{{ f.user?.nickname || `角色#${f.userId}` }}<template v-if="f.userId === myId">（我）</template></span>
          <span class="fb-status" :class="f.status">{{ statusLabel(f.status) }}</span>
        </div>
        <div class="fb-line2">
          <span class="fb-type-tag">{{ typeLabel(f.type) }}</span>
          <span class="fb-time">{{ formatFbTime(f.createdAt) }}</span>
        </div>
        <div class="fb-content">{{ f.content }}</div>

        <!-- 回复列表 -->
        <div v-if="f.replies.length" class="fb-replies">
          <div v-for="r in f.replies" :key="r.id" class="fb-reply" :class="{ official: r.isAdmin }">
            <span class="fb-reply-author">{{ r.isAdmin ? '📣 官方回复' : r.user?.nickname || `角色#${r.userId}` }}</span>
            <span class="fb-reply-content">{{ r.content }}</span>
            <span class="fb-reply-time">{{ formatFbTime(r.createdAt) }}</span>
          </div>
        </div>

        <!-- 回复输入 -->
        <div v-if="replyForId === f.id" class="fb-reply-box">
          <input
            v-model="replyContent"
            class="fb-reply-input"
            maxlength="500"
            placeholder="回复…（最多 500 字）"
            @keyup.enter="sendReply(f)"
          />
          <button class="fb-reply-send" :disabled="replySubmitting || !replyContent.trim()" @click="sendReply(f)">发送</button>
        </div>
        <button class="fb-reply-toggle" @click="toggleReply(f)">
          {{ replyForId === f.id ? '收起' : `回复${f.replies.length ? `（${f.replies.length}）` : ''}` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/store/user';
import {
  submitFeedback,
  getFeedbacks,
  addFeedbackReply,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackType,
  type FeedbackStatus,
  type FeedbackItem,
} from '@/api/feedback';

const router = useRouter();
const userStore = useUserStore();

const FB_TYPES = (Object.keys(FEEDBACK_TYPE_LABELS) as FeedbackType[]).map((v) => ({ value: v, label: FEEDBACK_TYPE_LABELS[v] }));
const fbType = ref<FeedbackType>('suggestion');
const fbContent = ref('');
const fbSubmitting = ref(false);
const fbMsg = ref('');
const fbIsErr = ref(false);

const activeTab = ref<'all' | 'mine'>('all');
const feedbacks = ref<FeedbackItem[]>([]);
const loading = ref(true);
const myId = computed(() => userStore.userInfo?.id || 0);

// 回复交互
const replyForId = ref<number | null>(null);
const replyContent = ref('');
const replySubmitting = ref(false);

const typeLabel = (t: FeedbackType): string => FEEDBACK_TYPE_LABELS[t] || t;
const statusLabel = (s: FeedbackStatus): string => FEEDBACK_STATUS_LABELS[s] || s;
const formatFbTime = (iso: string): string => (iso || '').replace('T', ' ').slice(5, 16);

const goBack = () => {
  router.back();
};

const loadFeedbacks = async () => {
  loading.value = true;
  try {
    feedbacks.value = await getFeedbacks(activeTab.value === 'mine');
  } catch {
    feedbacks.value = [];
  }
  loading.value = false;
};

const switchTab = async (tab: 'all' | 'mine') => {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  replyForId.value = null;
  await loadFeedbacks();
};

const submitFb = async () => {
  const text = fbContent.value.trim();
  if (!text || fbSubmitting.value) return;
  fbSubmitting.value = true;
  fbMsg.value = '';
  try {
    await submitFeedback({ type: fbType.value, content: text, page: '意见反馈页' });
    fbContent.value = '';
    fbIsErr.value = false;
    fbMsg.value = '✅ 提交成功，感谢反馈！';
    // 切到"我的反馈"让提交者立刻看到自己那条
    if (activeTab.value !== 'mine') {
      activeTab.value = 'mine';
    }
    await loadFeedbacks();
  } catch (e) {
    fbIsErr.value = true;
    fbMsg.value = e instanceof Error ? e.message : '提交失败，请重试';
  } finally {
    fbSubmitting.value = false;
  }
};

const toggleReply = (f: FeedbackItem) => {
  replyForId.value = replyForId.value === f.id ? null : f.id;
  replyContent.value = '';
};

const sendReply = async (f: FeedbackItem) => {
  const text = replyContent.value.trim();
  if (!text || replySubmitting.value) return;
  replySubmitting.value = true;
  try {
    await addFeedbackReply(f.id, text);
    replyContent.value = '';
    replyForId.value = null;
    await loadFeedbacks();
  } catch (e) {
    fbIsErr.value = true;
    fbMsg.value = e instanceof Error ? e.message : '回复失败，请重试';
  } finally {
    replySubmitting.value = false;
  }
};

onMounted(loadFeedbacks);
</script>

<style scoped>
.feedback-page {
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

.fb-desc {
  font-size: 13px;
  color: #888;
  margin-bottom: 12px;
}

.fb-types {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.fb-type {
  border: 2px solid #e3e8ef;
  background: #fff;
  color: #666;
  font-size: 13px;
  padding: 7px 14px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.fb-type.active {
  border-color: #667eea;
  background: #eef1fd;
  color: #667eea;
  font-weight: bold;
}

.fb-input {
  width: 100%;
  box-sizing: border-box;
  border: 2px solid #e3e8ef;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 14px;
  color: #333;
  resize: vertical;
  font-family: inherit;
  margin-bottom: 12px;
}

.fb-input:focus {
  outline: none;
  border-color: #667eea;
}

.fb-submit {
  width: 100%;
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 15px;
  font-weight: bold;
  padding: 11px;
  border-radius: 12px;
  cursor: pointer;
}

.fb-submit:disabled {
  opacity: 0.5;
}

.fb-msg {
  margin-top: 10px;
  font-size: 13px;
  color: #27ae60;
  text-align: center;
}

.fb-msg.err {
  color: #e74c3c;
}

.fb-tabs {
  display: flex;
  gap: 8px;
  margin: 16px 0 12px;
}

.fb-tab {
  flex: 1;
  border: 2px solid #e3e8ef;
  background: #fff;
  color: #666;
  font-size: 14px;
  font-weight: bold;
  padding: 9px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.fb-tab.active {
  border-color: #667eea;
  background: #eef1fd;
  color: #667eea;
}

.fb-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fb-item {
  background: #fff;
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.fb-item.mine {
  background: #f3f5fd;
}

.fb-line1 {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.fb-line2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.fb-author {
  font-size: 13px;
  font-weight: bold;
  color: #333;
}

.fb-type-tag {
  font-size: 11px;
  color: #667eea;
  background: #eef1fd;
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: bold;
}

.fb-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
}

.fb-status.pending {
  color: #e67e22;
  background: #fdf2e4;
}

.fb-status.processing {
  color: #2980b9;
  background: #e8f2fb;
}

.fb-status.done {
  color: #27ae60;
  background: #e9f7ef;
}

.fb-content {
  font-size: 13px;
  color: #444;
  word-break: break-all;
  margin-bottom: 6px;
}

.fb-time {
  font-size: 11px;
  color: #b5bac2;
}

.fb-replies {
  border-top: 1px dashed #e3e8ef;
  margin-top: 4px;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fb-reply {
  background: #f8f9fb;
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 12px;
}

.fb-item.mine .fb-reply {
  background: #fff;
}

.fb-reply.official {
  background: #fff8e8;
}

.fb-reply-author {
  font-weight: bold;
  color: #667eea;
  margin-right: 6px;
}

.fb-reply.official .fb-reply-author {
  color: #e67e22;
}

.fb-reply-content {
  color: #444;
  word-break: break-all;
}

.fb-reply-time {
  display: block;
  font-size: 10px;
  color: #c3c8d0;
  margin-top: 2px;
}

.fb-reply-box {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.fb-reply-input {
  flex: 1;
  border: 2px solid #e3e8ef;
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 13px;
  color: #333;
  min-width: 0;
}

.fb-reply-input:focus {
  outline: none;
  border-color: #667eea;
}

.fb-reply-send {
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  padding: 0 14px;
  border-radius: 10px;
  cursor: pointer;
}

.fb-reply-send:disabled {
  opacity: 0.5;
}

.fb-reply-toggle {
  border: none;
  background: transparent;
  color: #999;
  font-size: 12px;
  padding: 6px 0 0;
  cursor: pointer;
}

.fb-reply-toggle:active {
  color: #667eea;
}

.fb-empty {
  text-align: center;
  color: #b5bac2;
  font-size: 13px;
  padding: 30px 0;
}
</style>
