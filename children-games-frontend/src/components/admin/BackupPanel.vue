<template>
  <div class="panel">
    <h2 class="panel-title">💾 数据备份</h2>

    <div class="card">
      <p class="desc">
        备份包含全部业务数据：成员档案（含对战积分）、游戏进度、星星、成就、每日任务、游玩时长、对战流水、题库、意见反馈。
        下载的 <code>.sql</code> 文件请妥善保存，需要时可通过 MySQL 导入恢复。
      </p>
      <button class="dl-btn" :disabled="downloading" @click="download">
        {{ downloading ? '导出中…' : '⬇️ 下载数据备份 (.sql)' }}
      </button>
      <div v-if="done" class="done-tip">✅ 备份文件已开始下载</div>
      <div v-if="error" class="err-tip">导出失败，请稍后再试</div>

      <div class="auto-section">
        <div class="auto-title">🕐 每日自动备份（服务器磁盘，保留最近 7 份，每天 03:05 生成）</div>
        <div v-if="!autos.length" class="auto-empty">暂无自动备份</div>
        <div v-for="a in autos" :key="a.file" class="auto-row">
          <span class="auto-file">{{ a.file }}</span>
          <span class="auto-size">{{ (a.size / 1024).toFixed(1) }} KB</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { downloadBackup, listAutoBackups, type AutoBackup } from '@/api/admin';

const downloading = ref(false);
const done = ref(false);
const error = ref(false);
const autos = ref<AutoBackup[]>([]);

const load = async () => {
  autos.value = await listAutoBackups().catch(() => []);
};

const download = async () => {
  downloading.value = true;
  done.value = false;
  error.value = false;
  try {
    await downloadBackup();
    done.value = true;
    await load();
  } catch {
    error.value = true;
  } finally {
    downloading.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.panel-title {
  font-size: 19px;
  margin: 0 0 16px;
}

.card {
  background: #fff;
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  max-width: 520px;
}

.desc {
  font-size: 13px;
  color: #666;
  line-height: 1.8;
  margin: 0 0 16px;
}

code {
  background: #f4f6f7;
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 12px;
}

.dl-btn {
  padding: 13px 24px;
  border: none;
  border-radius: 12px;
  background: #27ae60;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.dl-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.done-tip {
  margin-top: 12px;
  font-size: 13px;
  color: #27ae60;
}

.err-tip {
  margin-top: 12px;
  font-size: 13px;
  color: #e74c3c;
}

.auto-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

.auto-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
}

.auto-empty {
  font-size: 12px;
  color: #bbb;
}

.auto-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  font-size: 12px;
  color: #666;
  border-bottom: 1px dashed #f0f0f0;
}

.auto-file {
  font-family: monospace;
}

.auto-size {
  color: #999;
}
</style>
