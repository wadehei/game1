<template>
  <div class="panel">
    <div class="panel-head">
      <h2 class="panel-title">💬 意见反馈</h2>
      <div class="head-actions">
        <button class="act-btn" @click="load">刷新</button>
      </div>
    </div>

    <!-- 状态筛选 -->
    <div class="status-filter">
      <button
        v-for="opt in FILTERS"
        :key="opt.value"
        class="filter-btn"
        :class="{ active: filter === opt.value }"
        @click="filter = opt.value"
      >
        {{ opt.label }}
        <span class="count">{{ countOf(opt.value) }}</span>
      </button>
    </div>

    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="filteredList.length === 0" class="empty">📭 暂无反馈</div>

    <div v-else class="fb-list">
      <div
        v-for="f in filteredList"
        :key="f.id"
        class="fb-card"
        :class="`st-${f.status}`"
      >
        <div class="fb-head">
          <div class="fb-user">
            <PlayerAvatar :avatar="f.user?.avatar" :size="28" />
            <span class="fb-nickname">{{
              f.user?.nickname || `角色#${f.userId}`
            }}</span>
          </div>
          <div class="fb-meta">
            <span class="fb-type-tag">{{ typeLabel(f.type) }}</span>
            <span class="fb-status" :class="f.status">{{
              statusLabel(f.status)
            }}</span>
            <span class="fb-time">{{ formatTime(f.createdAt) }}</span>
          </div>
        </div>
        <div class="fb-content">{{ f.content }}</div>
        <div v-if="f.page" class="fb-page">📍 来自：{{ f.page }}</div>

        <!-- 回复列表 -->
        <div v-if="f.replies.length" class="fb-replies">
          <div
            v-for="r in f.replies"
            :key="r.id"
            class="fb-reply"
            :class="{ official: r.isAdmin }"
          >
            <span class="fb-reply-author">{{
              r.isAdmin ? "📣 官方" : r.user?.nickname || `角色#${r.userId}`
            }}</span>
            <span class="fb-reply-content">{{ r.content }}</span>
            <span class="fb-reply-time">{{ formatTime(r.createdAt) }}</span>
          </div>
        </div>

        <!-- 官方回复输入 -->
        <div class="reply-row">
          <input
            v-model="replyContent[f.id]"
            class="reply-input"
            maxlength="500"
            placeholder="官方回复（所有用户可见）"
            @keyup.enter="sendReply(f)"
          />
          <button
            class="reply-send"
            :disabled="!replyContent[f.id]?.trim() || replying"
            @click="sendReply(f)"
          >
            发送
          </button>
        </div>

        <div class="fb-ops">
          <div class="status-btns">
            <button
              v-for="opt in STATUS_ACTIONS"
              :key="opt.value"
              class="st-btn"
              :class="[opt.value, { current: f.status === opt.value }]"
              @click="setStatus(f, opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div class="note-row">
          <input
            v-model="f.adminNote"
            class="note-input"
            placeholder="内部备注（不展示给用户）"
            @change="saveNote(f)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import {
  adminGetFeedbacks,
  adminUpdateFeedback,
  adminAddReply,
} from "@/api/admin";
import {
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/api/feedback";

const list = ref<FeedbackItem[]>([]);
const loading = ref(true);
const filter = ref<"all" | FeedbackStatus>("all");
const replyContent = reactive<Record<number, string>>({});
const replying = ref(false);

const FILTERS: { value: "all" | FeedbackStatus; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待处理" },
  { value: "processing", label: "处理中" },
  { value: "done", label: "已完成" },
];

const STATUS_ACTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: "pending", label: "待处理" },
  { value: "processing", label: "处理中" },
  { value: "done", label: "已完成" },
];

const filteredList = computed(() =>
  filter.value === "all"
    ? list.value
    : list.value.filter((f) => f.status === filter.value),
);

const countOf = (value: "all" | FeedbackStatus): number =>
  value === "all"
    ? list.value.length
    : list.value.filter((f) => f.status === value).length;

const typeLabel = (t: string): string =>
  FEEDBACK_TYPE_LABELS[t as keyof typeof FEEDBACK_TYPE_LABELS] || t;
const statusLabel = (s: string): string =>
  FEEDBACK_STATUS_LABELS[s as keyof typeof FEEDBACK_STATUS_LABELS] || s;

const formatTime = (iso: string): string =>
  (iso || "").replace("T", " ").slice(5, 16);

const load = async () => {
  loading.value = true;
  list.value = await adminGetFeedbacks().catch(() => []);
  loading.value = false;
};

const setStatus = async (f: FeedbackItem, status: FeedbackStatus) => {
  if (f.status === status) return;
  const updated = await adminUpdateFeedback(f.id, { status }).catch(() => null);
  if (updated) f.status = updated.status;
};

const saveNote = async (f: FeedbackItem) => {
  await adminUpdateFeedback(f.id, { adminNote: f.adminNote }).catch(() => {});
};

const sendReply = async (f: FeedbackItem) => {
  const text = (replyContent[f.id] || "").trim();
  if (!text || replying.value) return;
  replying.value = true;
  try {
    await adminAddReply(f.id, text);
    replyContent[f.id] = "";
    await load();
  } catch {
    // 留在输入框，用户可重试
  } finally {
    replying.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.panel-title {
  font-size: 19px;
  margin: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.head-actions {
  display: flex;
  gap: 8px;
}

.act-btn {
  border: none;
  background: #eef1f4;
  color: #666;
  font-size: 12px;
  padding: 7px 14px;
  border-radius: 10px;
  cursor: pointer;
}

.status-filter {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.filter-btn {
  border: 2px solid #e3e8ef;
  background: #fff;
  color: #666;
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.filter-btn.active {
  border-color: #667eea;
  color: #667eea;
  font-weight: bold;
}

.filter-btn .count {
  font-size: 11px;
  background: #eef1f4;
  border-radius: 8px;
  padding: 1px 7px;
  color: #888;
}

.filter-btn.active .count {
  background: #eef1fd;
  color: #667eea;
}

.fb-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fb-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  border-left: 4px solid #e67e22;
}

.fb-card.st-processing {
  border-left-color: #2980b9;
}

.fb-card.st-done {
  border-left-color: #27ae60;
}

.fb-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.fb-user {
  display: flex;
  align-items: center;
  gap: 6px;
}

.fb-nickname {
  font-size: 13px;
  font-weight: bold;
  color: #333;
}

.fb-meta {
  display: flex;
  align-items: center;
  gap: 8px;
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

.fb-time {
  font-size: 12px;
  color: #bbb;
}

.fb-content {
  font-size: 13px;
  color: #333;
  word-break: break-all;
  margin-bottom: 6px;
}

.fb-page {
  font-size: 11px;
  color: #999;
  margin-bottom: 8px;
}

.fb-replies {
  border-top: 1px dashed #eee;
  margin-top: 4px;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.fb-reply {
  background: #f8f9fb;
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 12px;
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

.reply-row {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.reply-input {
  flex: 1;
  border: 1px solid #e3e8ef;
  border-radius: 10px;
  padding: 7px 10px;
  font-size: 12px;
  color: #333;
  min-width: 0;
}

.reply-input:focus {
  outline: none;
  border-color: #667eea;
}

.reply-send {
  border: none;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  padding: 0 14px;
  border-radius: 10px;
  cursor: pointer;
}

.reply-send:disabled {
  opacity: 0.5;
}

.fb-ops {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.status-btns {
  display: flex;
  gap: 6px;
}

.st-btn {
  border: 1px solid #e3e8ef;
  background: #fff;
  color: #888;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 10px;
  cursor: pointer;
}

.st-btn.processing:hover {
  border-color: #2980b9;
  color: #2980b9;
}

.st-btn.done:hover {
  border-color: #27ae60;
  color: #27ae60;
}

.st-btn.current {
  border-color: currentColor;
  font-weight: bold;
}

.st-btn.current.pending {
  color: #e67e22;
}

.st-btn.current.processing {
  color: #2980b9;
}

.st-btn.current.done {
  color: #27ae60;
}

.note-row {
  margin-top: 8px;
}

.note-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #eee;
  background: #f8f9fb;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 12px;
  color: #555;
}

.note-input:focus {
  outline: none;
  border-color: #667eea;
  background: #fff;
}

.empty {
  text-align: center;
  color: #bbb;
  font-size: 13px;
  padding: 30px 0;
}
</style>
