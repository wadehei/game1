<template>
  <div class="panel">
    <h2 class="panel-title">👪 角色管理</h2>

    <div v-if="loading" class="empty">加载中…</div>

    <div v-else class="member-list">
      <div v-for="u in users" :key="u.id" class="member-card" :class="{ guest: !u.isFamily }">
        <PlayerAvatar :avatar="u.avatar" :size="46" />
        <div class="member-main">
          <template v-if="editingId === u.id">
            <input v-model="editNickname" class="edit-input" maxlength="12" />
            <div class="emoji-mini">
              <span
                v-for="e in EMOJIS"
                :key="e"
                class="emoji-pick"
                :class="{ picked: editAvatar === e }"
                @click="editAvatar = e"
              >{{ e }}</span>
            </div>
          </template>
          <template v-else>
            <div class="member-name">
              {{ u.nickname }}
              <span v-if="!u.isFamily" class="guest-tag">游客</span>
            </div>
            <div class="member-meta">
              Lv.{{ u.level }} · ⭐{{ u.totalStars }} · 玩过 {{ u.gamesPlayed }} 个游戏
              <template v-if="u.lastActiveAt"> · 最近 {{ timeAgo(u.lastActiveAt) }}</template>
            </div>
          </template>
        </div>
        <div class="member-actions">
          <template v-if="editingId === u.id">
            <button class="act-btn save" @click="saveEdit(u.id)">保存</button>
            <button class="act-btn" @click="editingId = null">取消</button>
          </template>
          <template v-else>
            <button class="act-btn" @click="startEdit(u)">编辑</button>
            <button class="act-btn warn" @click="resetProgress(u)">重置进度</button>
            <button class="act-btn danger" @click="removeUser(u)">删除</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getUsers, updateUser, resetUserProgress, deleteUser, type AdminUser } from '@/api/admin';
import PlayerAvatar from '@/components/PlayerAvatar.vue';

const EMOJIS = ['🐰', '🐻', '🐼', '🦊', '🐸', '🐵', '🐯', '🦁', '🐷', '🐨', '👑', '🦄', '🌟', '🌸', '🤖', '😊'];

const users = ref<AdminUser[]>([]);
const loading = ref(true);
const editingId = ref<number | null>(null);
const editNickname = ref('');
const editAvatar = ref('');

const load = async () => {
  loading.value = true;
  users.value = await getUsers().catch(() => []);
  loading.value = false;
};

const startEdit = (u: AdminUser) => {
  editingId.value = u.id;
  editNickname.value = u.nickname;
  editAvatar.value = u.avatar || '😊';
};

const saveEdit = async (id: number) => {
  await updateUser(id, { nickname: editNickname.value, avatar: editAvatar.value }).catch(() => {});
  editingId.value = null;
  await load();
};

const resetProgress = async (u: AdminUser) => {
  if (!confirm(`确定重置「${u.nickname}」的全部游戏进度吗？星星和关卡会清零，角色保留。`)) return;
  await resetUserProgress(u.id).catch(() => {});
  await load();
};

const removeUser = async (u: AdminUser) => {
  if (!confirm(`确定删除「${u.nickname}」吗？其全部数据（进度/星星/时长）将不可恢复。`)) return;
  await deleteUser(u.id).catch(() => {});
  await load();
};

const timeAgo = (iso: string): string => {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
};

onMounted(load);
</script>

<style scoped>
.panel-title {
  font-size: 19px;
  margin: 0 0 16px;
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.member-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  flex-wrap: wrap;
}

.member-card.guest {
  opacity: 0.75;
}

.member-main {
  flex: 1;
  min-width: 160px;
}

.member-name {
  font-size: 15px;
  font-weight: 600;
}

.guest-tag {
  font-size: 10px;
  color: #999;
  background: #f0f0f0;
  padding: 2px 7px;
  border-radius: 8px;
  margin-left: 6px;
}

.member-meta {
  font-size: 12px;
  color: #999;
  margin-top: 3px;
}

.edit-input {
  width: 100%;
  max-width: 220px;
  padding: 8px 10px;
  border: 2px solid #3498db;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.emoji-mini {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.emoji-pick {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  border-radius: 8px;
  cursor: pointer;
  border: 2px solid transparent;
}

.emoji-pick.picked {
  border-color: #3498db;
  background: rgba(52, 152, 219, 0.1);
}

.member-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.act-btn {
  border: none;
  background: #eef1f4;
  color: #666;
  font-size: 12px;
  padding: 7px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.act-btn:hover {
  background: #e0e5e9;
}

.act-btn.save {
  background: #3498db;
  color: #fff;
}

.act-btn.warn {
  background: #fef3e2;
  color: #e67e22;
}

.act-btn.danger {
  background: #fdecea;
  color: #e74c3c;
}

.empty {
  text-align: center;
  color: #bbb;
  padding: 20px 0;
}

@media (max-width: 480px) {
  .member-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
