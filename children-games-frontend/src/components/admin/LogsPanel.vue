<template>
  <div class="panel">
    <div class="panel-head">
      <h2 class="panel-title">🐞 错误日志</h2>
      <div class="head-actions">
        <button class="act-btn" @click="load">刷新</button>
        <button class="act-btn danger" @click="clearAll">清空</button>
      </div>
    </div>

    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="logs.length === 0" class="empty">🎉 没有任何错误记录</div>

    <div v-else class="log-list">
      <div v-for="(log, i) in logs" :key="i" class="log-row" :class="`src-${log.source}`">
        <div class="log-line1">
          <span class="log-source">{{ sourceLabel(log.source) }}</span>
          <span class="log-time">{{ formatTime(log.time) }}</span>
        </div>
        <div class="log-msg">{{ log.message }}</div>
        <pre v-if="log.detail" class="log-detail">{{ log.detail }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getErrorLogs, clearErrorLogs, type AdminErrorLog } from '@/api/admin';

const logs = ref<AdminErrorLog[]>([]);
const loading = ref(true);

const load = async () => {
  loading.value = true;
  logs.value = await getErrorLogs(200).catch(() => []);
  loading.value = false;
};

const clearAll = async () => {
  if (!confirm('确定清空全部错误日志吗？')) return;
  await clearErrorLogs().catch(() => {});
  await load();
};

const sourceLabel = (source: string): string =>
  ({ server: '服务器', client: '客户端', process: '进程', raw: '原始' })[source] || source;

const formatTime = (iso: string): string => {
  if (!iso) return '';
  return iso.replace('T', ' ').slice(5, 19);
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

.act-btn.danger {
  background: #fdecea;
  color: #e74c3c;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-row {
  background: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  border-left: 4px solid #e74c3c;
}

.log-row.src-client {
  border-left-color: #f39c12;
}

.log-row.src-process {
  border-left-color: #8e44ad;
}

.log-line1 {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}

.log-source {
  font-size: 11px;
  font-weight: bold;
  color: #fff;
  background: #95a5a6;
  padding: 1px 8px;
  border-radius: 8px;
}

.log-time {
  font-size: 12px;
  color: #bbb;
}

.log-msg {
  font-size: 13px;
  color: #333;
  word-break: break-all;
}

.log-detail {
  margin: 6px 0 0;
  font-size: 11px;
  color: #888;
  background: #f7f8f9;
  border-radius: 8px;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 140px;
  overflow-y: auto;
}

.empty {
  text-align: center;
  color: #bbb;
  font-size: 13px;
  padding: 30px 0;
}
</style>
