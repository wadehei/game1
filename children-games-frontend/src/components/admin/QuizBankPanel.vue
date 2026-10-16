<template>
  <div class="panel">
    <div class="panel-head">
      <h2 class="panel-title">📚 题库（答题对战）</h2>
      <div class="head-actions">
        <button class="act-btn" @click="load">刷新</button>
        <button class="act-btn" @click="openCreate">新增题目</button>
        <button class="act-btn" @click="showImport = true">批量导入</button>
      </div>
    </div>

    <!-- 筛选 -->
    <div class="filter-row">
      <button
        v-for="c in CATEGORIES"
        :key="c"
        class="filter-btn"
        :class="{ active: filter === c }"
        @click="filter = filter === c ? '' : c"
      >{{ c }}</button>
    </div>

    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="list.length === 0" class="empty">暂无题目</div>

    <div v-else class="quiz-list">
      <div v-for="q in list" :key="q.id" class="quiz-card">
        <div class="q-head">
          <span class="q-cat">{{ q.category }}</span>
          <span class="q-diff">{{ '★'.repeat(q.difficulty) }}</span>
          <span class="q-actions">
            <button class="mini-a" @click="openEdit(q)">编辑</button>
            <button class="mini-a danger" @click="remove(q)">删除</button>
          </span>
        </div>
        <div class="q-text">{{ q.text }}</div>
        <div class="q-options">
          <span
            v-for="(o, i) in q.options"
            :key="i"
            class="q-opt"
            :class="{ correct: i === q.answer }"
          >{{ 'ABCD'[i] }}. {{ o }}</span>
        </div>
      </div>
    </div>

    <div class="pager" v-if="total > LIMIT">
      <button class="act-btn" :disabled="page <= 1" @click="prev">上一页</button>
      <span class="page-info">{{ page }} / {{ Math.ceil(total / LIMIT) }}</span>
      <button class="act-btn" :disabled="page >= Math.ceil(total / LIMIT)" @click="next">下一页</button>
    </div>

    <!-- 编辑/新增弹层 -->
    <div v-if="editing" class="mask" @click.self="editing = null">
      <div class="editor">
        <div class="e-title">{{ editing.id ? '编辑题目' : '新增题目' }}</div>
        <textarea v-model="editing.text" class="e-text" rows="3" maxlength="500" placeholder="题干" />
        <div v-for="(o, i) in editing.options" :key="i" class="e-opt-row">
          <label class="e-radio">
            <input type="radio" name="correct" :checked="editing.answer === i" @change="editing.answer = i" />
            正确
          </label>
          <input v-model="editing.options[i]" class="e-input" :placeholder="'选项 ' + 'ABCD'[i]" maxlength="100" />
        </div>
        <div class="e-row">
          <select v-model="editing.category" class="e-select">
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
          <select v-model.number="editing.difficulty" class="e-select">
            <option :value="1">★ 简单</option>
            <option :value="2">★★ 中等</option>
            <option :value="3">★★★ 困难</option>
          </select>
        </div>
        <div v-if="editError" class="e-err">{{ editError }}</div>
        <div class="e-btns">
          <button class="act-btn" @click="editing = null">取消</button>
          <button class="act-btn primary" @click="save">保存</button>
        </div>
      </div>
    </div>

    <!-- 批量导入弹层 -->
    <div v-if="showImport" class="mask" @click.self="showImport = false">
      <div class="editor">
        <div class="e-title">批量导入（JSON）</div>
        <div class="e-hint">
          格式：[{"text":"题干","options":["A","B","C","D"],"answer":0,"category":"综合"}]，重复题干自动跳过
        </div>
        <textarea v-model="importJson" class="e-text import" rows="10" placeholder='[{"text":"...","options":["...","...","...","..."],"answer":0}]' />
        <div v-if="importMsg" class="e-err">{{ importMsg }}</div>
        <div class="e-btns">
          <button class="act-btn" @click="showImport = false">取消</button>
          <button class="act-btn primary" @click="doImport">导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import {
  adminQuizList,
  adminQuizCreate,
  adminQuizUpdate,
  adminQuizDelete,
  adminQuizImport,
  type AdminQuizQuestion,
} from '@/api/admin';
import { confirmAction } from '@/utils/confirmBus';

const CATEGORIES = ['综合', '科学', '影视', '历史', '地理'];
const LIMIT = 20;

const list = ref<AdminQuizQuestion[]>([]);
const total = ref(0);
const page = ref(1);
const filter = ref('');
const loading = ref(true);
const editing = ref<null | { id: number; text: string; options: string[]; answer: number; category: string; difficulty: number }>(null);
const editError = ref('');
const showImport = ref(false);
const importJson = ref('');
const importMsg = ref('');

const load = async () => {
  loading.value = true;
  const res = await adminQuizList(page.value, filter.value).catch(() => ({ list: [], total: 0 }));
  list.value = res.list;
  total.value = res.total;
  loading.value = false;
};

const prev = () => {
  page.value -= 1;
  load();
};
const next = () => {
  page.value += 1;
  load();
};

const blank = () => ({ id: 0, text: '', options: ['', '', '', ''], answer: 0, category: '综合', difficulty: 1 });

const openCreate = () => {
  editError.value = '';
  editing.value = reactive(blank());
};

const openEdit = (q: AdminQuizQuestion) => {
  editError.value = '';
  editing.value = reactive({ ...q, options: [...q.options] });
};

const save = async () => {
  if (!editing.value) return;
  const payload = {
    text: editing.value.text.trim(),
    options: editing.value.options.map((o) => o.trim()),
    answer: editing.value.answer,
    category: editing.value.category,
    difficulty: editing.value.difficulty,
  };
  try {
    if (editing.value.id) {
      await adminQuizUpdate(editing.value.id, payload);
    } else {
      await adminQuizCreate(payload);
    }
    editing.value = null;
    await load();
  } catch (e) {
    editError.value = e instanceof Error ? e.message : '保存失败';
  }
};

const remove = async (q: AdminQuizQuestion) => {
  const ok = await confirmAction({ title: `删除「${q.text.slice(0, 20)}…」？`, danger: true, confirmText: '删除' });
  if (!ok) return;
  await adminQuizDelete(q.id).catch(() => {});
  await load();
};

const doImport = async () => {
  importMsg.value = '';
  try {
    const questions = JSON.parse(importJson.value);
    const res = await adminQuizImport(questions);
    importMsg.value = `✅ ${res.created ? '新增 ' + res.created + ' 题' : ''}${res.skipped ? '，跳过 ' + res.skipped + ' 条' : ''}`;
    await load();
  } catch (e) {
    importMsg.value = e instanceof Error ? e.message : '导入失败（JSON 格式错误？）';
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
  flex-wrap: wrap;
  gap: 8px;
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

.act-btn.primary {
  background: #667eea;
  color: #fff;
}

.act-btn:disabled {
  opacity: 0.5;
}

.filter-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.filter-btn {
  border: 2px solid #e3e8ef;
  background: #fff;
  color: #666;
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 14px;
  cursor: pointer;
}

.filter-btn.active {
  border-color: #667eea;
  color: #667eea;
  font-weight: bold;
}

.quiz-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quiz-card {
  background: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.q-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.q-cat {
  font-size: 11px;
  color: #667eea;
  background: #eef1fd;
  border-radius: 8px;
  padding: 1px 8px;
  font-weight: bold;
}

.q-diff {
  font-size: 10px;
  color: #f39c12;
}

.q-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.mini-a {
  border: none;
  background: transparent;
  color: #667eea;
  font-size: 12px;
  cursor: pointer;
}

.mini-a.danger {
  color: #e74c3c;
}

.q-text {
  font-size: 13px;
  color: #333;
  margin-bottom: 6px;
}

.q-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}

.q-opt {
  font-size: 12px;
  color: #666;
}

.q-opt.correct {
  color: #27ae60;
  font-weight: bold;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 14px;
}

.page-info {
  font-size: 12px;
  color: #888;
}

.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}

.editor {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  width: min(560px, 92vw);
  max-height: 86vh;
  overflow-y: auto;
}

.e-title {
  font-size: 15px;
  font-weight: bold;
  color: #333;
  margin-bottom: 12px;
}

.e-text {
  width: 100%;
  box-sizing: border-box;
  border: 2px solid #e3e8ef;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  color: #333;
  resize: vertical;
  font-family: inherit;
  margin-bottom: 10px;
}

.e-text.import {
  font-family: monospace;
  font-size: 12px;
}

.e-opt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.e-radio {
  font-size: 12px;
  color: #27ae60;
  display: flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.e-input {
  flex: 1;
  border: 2px solid #e3e8ef;
  border-radius: 8px;
  padding: 7px 10px;
  font-size: 13px;
  color: #333;
}

.e-row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.e-select {
  border: 2px solid #e3e8ef;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  color: #333;
  background: #fff;
}

.e-hint {
  font-size: 11px;
  color: #999;
  margin-bottom: 8px;
  word-break: break-all;
}

.e-err {
  font-size: 12px;
  color: #e74c3c;
  margin-bottom: 8px;
}

.e-btns {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.empty {
  text-align: center;
  color: #bbb;
  font-size: 13px;
  padding: 30px 0;
}
</style>
