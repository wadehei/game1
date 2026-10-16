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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { downloadBackup } from '@/api/admin';

const downloading = ref(false);
const done = ref(false);
const error = ref(false);

const download = async () => {
  downloading.value = true;
  done.value = false;
  error.value = false;
  try {
    await downloadBackup();
    done.value = true;
  } catch {
    error.value = true;
  } finally {
    downloading.value = false;
  }
};
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
</style>
