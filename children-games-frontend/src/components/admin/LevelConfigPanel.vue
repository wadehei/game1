<template>
  <div class="panel">
    <h2 class="panel-title">🎚️ 关卡难度配置</h2>

    <div class="hint">
      只需配置想调整的关卡和字段：孩子端进入该关时会<b>优先使用这里的数值</b>，没填的字段和未配置的关卡仍走内置默认难度。
      保存后，孩子重新进入该关卡立即生效。
    </div>

    <!-- 游戏选择 -->
    <div class="game-chips">
      <button
        v-for="g in GAMES"
        :key="g.id"
        class="chip"
        :class="{ active: gameId === g.id }"
        @click="selectGame(g.id)"
      >{{ g.name }}</button>
    </div>

    <!-- 已有覆盖列表 -->
    <div v-if="overrides.length" class="override-list">
      <div v-for="row in overrides" :key="row.level" class="override-row">
        <span class="ov-level">第 {{ row.level }} 关</span>
        <span class="ov-config">{{ formatConfig(row.config) }}</span>
        <div class="ov-actions">
          <button class="act-btn" @click="editRow(row)">编辑</button>
          <button class="act-btn danger" @click="removeRow(row.level)">恢复默认</button>
        </div>
      </div>
    </div>
    <div v-else class="empty">该游戏暂无自定义配置，全部使用内置默认难度</div>

    <!-- 编辑表单 -->
    <div class="form-card">
      <div class="form-title">{{ editingLevel ? `编辑第 ${editingLevel} 关` : '新增关卡配置' }}</div>
      <div class="form-row">
        <label class="form-label">关卡编号</label>
        <input v-model.number="formLevel" class="form-input level-input" type="number" min="1" max="999" />
      </div>
      <div v-for="f in fields" :key="f.key" class="form-row">
        <label class="form-label">{{ f.label }}</label>
        <label v-if="f.isBool" class="bool-label">
          <input v-model="formValues[f.key]" type="checkbox" />
          {{ formValues[f.key] ? '开启' : '关闭' }}
        </label>
        <input
          v-else
          v-model="formValues[f.key]"
          class="form-input"
          type="number"
          :step="f.step || 'any'"
          placeholder="留空 = 使用默认"
        />
      </div>
      <div class="form-btns">
        <button class="act-btn" @click="resetForm">清空</button>
        <button class="act-btn save" :disabled="!formLevel || formLevel < 1" @click="save">
          {{ saving ? '保存中…' : '保存配置' }}
        </button>
      </div>
      <div v-if="message" class="msg" :class="{ err: msgIsError }">{{ message }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  getLevelOverrides,
  saveLevelOverride,
  deleteLevelOverride,
  type LevelOverrideRow,
} from '@/api/admin';
import { GAMES } from '@/utils/gameMeta';

interface FieldDef {
  key: string;
  label: string;
  isBool?: boolean;
  step?: string;
}

const FIELD_SCHEMAS: Record<string, FieldDef[]> = {
  memory: [
    { key: 'pairs', label: '卡片对数（2~8）' },
    { key: 'timeLimit', label: '时限（秒）' },
  ],
  fruit: [
    { key: 'spawnRate', label: '掉落间隔（毫秒，越小越难）' },
    { key: 'fallSpeed', label: '下落速度' },
    { key: 'bombChance', label: '炸弹概率 0~1', step: '0.01' },
    { key: 'targetScore', label: '目标分数' },
  ],
  puzzle: [
    { key: 'gridSize', label: '拼图边长（2~6 格）' },
    { key: 'timeLimit', label: '时限（秒）' },
  ],
  balloon: [
    { key: 'spawnRate', label: '上浮间隔（毫秒，越小越难）' },
    { key: 'moveSpeed', label: '上浮速度' },
    { key: 'targetScore', label: '目标分数' },
    { key: 'bullets', label: '子弹数' },
  ],
  tank: [
    { key: 'enemyCount', label: '敌人数量' },
    { key: 'enemySpeed', label: '敌人速度' },
    { key: 'enemyFireRate', label: '敌人开火率 0~1', step: '0.01' },
    { key: 'bossLevel', label: 'Boss 关', isBool: true },
  ],
  mole: [
    { key: 'spawnInterval', label: '出洞间隔（毫秒，越小越难）' },
    { key: 'upDuration', label: '露头时长（毫秒，越小越难）' },
    { key: 'bunnyChance', label: '兔子概率 0~1', step: '0.01' },
    { key: 'timeLimit', label: '时限（秒）' },
    { key: 'targetHits', label: '目标击中数' },
  ],
  simon: [{ key: 'seqLength', label: '记忆序列步数' }],
  math: [{ key: 'targetCorrect', label: '答对题数' }],
};

const gameId = ref('memory');
const overrides = ref<LevelOverrideRow[]>([]);
const editingLevel = ref<number | null>(null);
const formLevel = ref<number | null>(null);
const formValues = reactive<Record<string, string | boolean>>({});
const saving = ref(false);
const message = ref('');
const msgIsError = ref(false);

const fields = computed(() => FIELD_SCHEMAS[gameId.value] || []);

const resetForm = () => {
  editingLevel.value = null;
  formLevel.value = null;
  Object.keys(formValues).forEach((k) => delete formValues[k]);
};

const showMessage = (text: string, isError = false) => {
  message.value = text;
  msgIsError.value = isError;
  setTimeout(() => {
    message.value = '';
  }, 3000);
};

const loadList = async () => {
  overrides.value = await getLevelOverrides(gameId.value).catch(() => []);
};

const selectGame = (id: string) => {
  gameId.value = id;
  resetForm();
  loadList();
};

const editRow = (row: LevelOverrideRow) => {
  editingLevel.value = row.level;
  formLevel.value = row.level;
  Object.keys(formValues).forEach((k) => delete formValues[k]);
  fields.value.forEach((f) => {
    const v = row.config[f.key];
    if (f.isBool) {
      formValues[f.key] = Boolean(v);
    } else if (v !== undefined) {
      formValues[f.key] = String(v);
    }
  });
};

const removeRow = async (level: number) => {
  if (!confirm(`删除第 ${level} 关的自定义配置，恢复内置默认难度？`)) return;
  await deleteLevelOverride(gameId.value, level).catch(() => {});
  showMessage(`第 ${level} 关已恢复默认难度`);
  await loadList();
};

const save = async () => {
  if (!formLevel.value || formLevel.value < 1 || saving.value) return;
  const config: Record<string, number | boolean> = {};
  for (const f of fields.value) {
    const raw = formValues[f.key];
    if (f.isBool) {
      config[f.key] = Boolean(raw);
    } else if (raw !== undefined && raw !== '' && raw !== null) {
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        showMessage(`「${f.label}」请填写数字`, true);
        return;
      }
      config[f.key] = num;
    }
  }
  if (Object.keys(config).length === 0) {
    showMessage('至少填写一个配置项', true);
    return;
  }
  saving.value = true;
  try {
    await saveLevelOverride(gameId.value, Math.round(formLevel.value), config);
    showMessage(`第 ${formLevel.value} 关配置已保存`);
    resetForm();
    await loadList();
  } catch (e: any) {
    showMessage(e?.response?.data?.message || '保存失败', true);
  } finally {
    saving.value = false;
  }
};

const formatConfig = (config: Record<string, number | boolean>): string => {
  const defs = FIELD_SCHEMAS[gameId.value] || [];
  return Object.entries(config)
    .map(([k, v]) => {
      const label = defs.find((d) => d.key === k)?.label || k;
      return `${label.split('（')[0]} ${v}`;
    })
    .join(' · ');
};

onMounted(() => loadList());
</script>

<style scoped>
.panel-title {
  font-size: 19px;
  margin: 0 0 12px;
}

.hint {
  font-size: 13px;
  color: #777;
  line-height: 1.7;
  background: #eef6fd;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 14px;
}

.game-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.chip {
  padding: 8px 16px;
  border-radius: 16px;
  border: 2px solid #e5e5e5;
  background: #fff;
  color: #666;
  font-size: 13px;
  cursor: pointer;
}

.chip.active {
  border-color: #3498db;
  background: rgba(52, 152, 219, 0.08);
  color: #3498db;
  font-weight: bold;
}

.override-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.override-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  flex-wrap: wrap;
}

.ov-level {
  font-size: 14px;
  font-weight: bold;
  color: #2c3e50;
  width: 66px;
  flex-shrink: 0;
}

.ov-config {
  flex: 1;
  font-size: 13px;
  color: #666;
  min-width: 200px;
}

.ov-actions {
  display: flex;
  gap: 6px;
}

.act-btn {
  border: none;
  background: #eef1f4;
  color: #666;
  font-size: 12px;
  padding: 7px 12px;
  border-radius: 10px;
  cursor: pointer;
}

.act-btn.danger {
  background: #fdecea;
  color: #e74c3c;
}

.act-btn.save {
  background: #3498db;
  color: #fff;
}

.empty {
  color: #bbb;
  font-size: 13px;
  padding: 8px 0 16px;
}

.form-card {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  max-width: 520px;
}

.form-title {
  font-size: 15px;
  font-weight: bold;
  margin-bottom: 14px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.form-label {
  width: 190px;
  font-size: 13px;
  color: #555;
  flex-shrink: 0;
}

.form-input {
  flex: 1;
  padding: 9px 12px;
  border: 2px solid #e5e5e5;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  min-width: 0;
}

.form-input:focus {
  border-color: #3498db;
}

.level-input {
  max-width: 120px;
}

.bool-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}

.form-btns {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 14px;
}

.msg {
  margin-top: 12px;
  font-size: 13px;
  color: #27ae60;
}

.msg.err {
  color: #e74c3c;
}

@media (max-width: 480px) {
  .form-row {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }

  .form-label {
    width: auto;
  }
}
</style>
