<template>
  <div class="panel">
    <h2 class="panel-title">🎚️ 关卡难度配置</h2>

    <div class="hint">
      列出每个关卡的<b>当前生效配置</b>（内置公式 + 此处自定义合并后的结果）。点击任意关卡进入编辑：<b>改过的字段会保存为该关的自定义配置</b>，改回原值或用「恢复默认」即回到内置难度。保存后，孩子重新进入该关卡立即生效。
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

    <!-- 关卡列表 -->
    <div class="level-list">
      <div
        v-for="lv in visibleLevels"
        :key="lv"
        class="level-row"
        :class="{ custom: !!overrideMap.get(lv), editing: editingLevel === lv }"
        @click="editRow(lv)"
      >
        <span class="lv-num">第 {{ lv }} 关</span>
        <span class="lv-config">{{ formatLevelConfig(gameId, effectiveOf(lv)) }}</span>
        <span v-if="overrideMap.get(lv)" class="lv-badge">自定义</span>
        <div class="row-actions" @click.stop>
          <button v-if="overrideMap.get(lv)" class="act-btn danger" @click="removeRow(lv)">恢复默认</button>
        </div>
      </div>
    </div>

    <button class="extend-btn" @click="listExtent += 10">
      ＋ 显示更多关卡（当前列出 1 ~ 第 {{ visibleLevels.length }} 关）
    </button>

    <!-- 编辑表单 -->
    <div class="form-card" :class="{ visible: editingLevel !== null }">
      <div class="form-title">
        编辑第 {{ editingLevel ?? formLevel }} 关
        <span v-if="editingLevel !== null" class="form-tip">改动过的字段会保存为自定义配置</span>
      </div>
      <div v-for="f in fields" :key="f.key" class="form-row">
        <label class="form-label">
          {{ f.label }}
          <span v-if="customKeys.has(f.key)" class="custom-mark">已自定义</span>
        </label>
        <label v-if="f.isBool" class="bool-label">
          <input
            v-model="formValues[f.key]"
            type="checkbox"
            @change="markCustom(f.key)"
          />
          {{ formValues[f.key] ? '开启' : '关闭' }}
        </label>
        <input
          v-else
          v-model="formValues[f.key]"
          class="form-input"
          type="number"
          :step="f.step || 'any'"
          @input="markCustom(f.key)"
        />
      </div>
      <div class="form-btns">
        <button class="act-btn" @click="resetForm">取消编辑</button>
        <button class="act-btn save" :disabled="!formLevel || formLevel < 1 || saving" @click="save">
          {{ saving ? '保存中…' : '保存修改' }}
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
import {
  defaultLevelConfig,
  formatLevelConfig,
  LEVEL_FIELD_DEFS,
  type LevelConfigValue,
  type LevelConfigMap,
} from '@/utils/levelDefaults';

const gameId = ref('memory');
const overrides = ref<LevelOverrideRow[]>([]);
const listExtent = ref(0);
const editingLevel = ref<number | null>(null);
const formLevel = ref<number | null>(null);
const formValues = reactive<Record<string, string | boolean>>({});
const customKeys = ref<Set<string>>(new Set());
const snapshot = ref<Record<string, LevelConfigValue>>({});
const saving = ref(false);
const message = ref('');
const msgIsError = ref(false);

const fields = computed(() => LEVEL_FIELD_DEFS[gameId.value] || []);
const totalLevels = computed(() => GAMES.find((g) => g.id === gameId.value)?.totalLevels || 20);
const visibleLevels = computed(() => {
  const max = totalLevels.value + listExtent.value;
  return Array.from({ length: max }, (_, i) => i + 1);
});

const overrideMap = computed(() => {
  const map = new Map<number, Record<string, LevelConfigValue>>();
  overrides.value.forEach((row) => map.set(row.level, row.config));
  return map;
});

const effectiveOf = (level: number): LevelConfigMap => ({
  ...defaultLevelConfig(gameId.value, level),
  ...(overrideMap.value.get(level) || {}),
});

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
  listExtent.value = 0;
  loadList();
};

// ─── 编辑 ────────────────────────────────
const editRow = (level: number) => {
  editingLevel.value = level;
  formLevel.value = level;
  const eff = effectiveOf(level);
  snapshot.value = { ...eff };
  customKeys.value = new Set(Object.keys(overrideMap.value.get(level) || {}));
  Object.keys(formValues).forEach((k) => delete formValues[k]);
  fields.value.forEach((f) => {
    const v = eff[f.key];
    formValues[f.key] = typeof v === 'boolean' ? v : String(v ?? '');
  });
};

const resetForm = () => {
  editingLevel.value = null;
  formLevel.value = null;
  customKeys.value = new Set();
  Object.keys(formValues).forEach((k) => delete formValues[k]);
};

/** 输入与基准不同 → 记为自定义；改回原值 → 取消自定义 */
const markCustom = (key: string) => {
  const def = fields.value.find((f) => f.key === key);
  if (!def) return;
  const cur = formValues[key];
  const base = snapshot.value[key];
  if (def.isBool) {
    if (Boolean(cur) !== Boolean(base)) {
      customKeys.value.add(key);
    } else {
      customKeys.value.delete(key);
    }
  } else {
    const n = Number(cur);
    if (cur !== '' && Number.isFinite(n) && n !== Number(base)) {
      customKeys.value.add(key);
    } else {
      customKeys.value.delete(key);
    }
  }
};

const save = async () => {
  if (!formLevel.value || formLevel.value < 1 || saving.value) return;
  const config: Record<string, LevelConfigValue> = {};
  for (const key of customKeys.value) {
    const def = fields.value.find((f) => f.key === key);
    if (!def) continue;
    if (def.isBool) {
      config[key] = Boolean(formValues[key]);
    } else {
      const n = Number(formValues[key]);
      if (!Number.isFinite(n)) {
        showMessage(`「${def.label}」请填写数字`, true);
        return;
      }
      config[key] = n;
    }
  }
  if (Object.keys(config).length === 0) {
    showMessage('没有改动过的字段——修改任意字段后再保存', true);
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

const removeRow = async (level: number) => {
  if (!confirm(`删除第 ${level} 关的自定义配置，恢复内置默认难度？`)) return;
  await deleteLevelOverride(gameId.value, level).catch(() => {});
  showMessage(`第 ${level} 关已恢复默认难度`);
  if (editingLevel.value === level) {
    resetForm();
  }
  await loadList();
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
  margin-bottom: 14px;
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

.level-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  max-height: 46vh;
  overflow-y: auto;
  padding-right: 2px;
}

.level-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #eef1f4;
  border-radius: 12px;
  padding: 9px 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  flex-wrap: wrap;
}

.level-row:hover {
  border-color: #3498db;
}

.level-row.custom {
  border-left: 4px solid #3498db;
}

.level-row.editing {
  background: rgba(52, 152, 219, 0.06);
  border-color: #3498db;
}

.lv-num {
  font-size: 13px;
  font-weight: bold;
  color: #2c3e50;
  width: 60px;
  flex-shrink: 0;
}

.lv-config {
  flex: 1;
  font-size: 12px;
  color: #666;
  min-width: 200px;
}

.lv-badge {
  font-size: 10px;
  color: #3498db;
  background: rgba(52, 152, 219, 0.12);
  padding: 2px 8px;
  border-radius: 8px;
  flex-shrink: 0;
}

.row-actions {
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

.extend-btn {
  width: 100%;
  padding: 10px;
  border: 2px dashed #d5dbe0;
  border-radius: 12px;
  background: none;
  color: #888;
  font-size: 13px;
  cursor: pointer;
  margin-bottom: 16px;
}

.extend-btn:hover {
  color: #3498db;
  border-color: #3498db;
}

.form-card {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  max-width: 560px;
  opacity: 0.55;
  transition: opacity 0.2s ease;
}

.form-card.visible {
  opacity: 1;
}

.form-title {
  font-size: 15px;
  font-weight: bold;
  margin-bottom: 14px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.form-tip {
  font-size: 12px;
  color: #999;
  font-weight: normal;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.form-label {
  width: 200px;
  font-size: 13px;
  color: #555;
  flex-shrink: 0;
}

.custom-mark {
  color: #3498db;
  font-size: 11px;
  margin-left: 4px;
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

  .level-list {
    max-height: 38vh;
  }
}
</style>
