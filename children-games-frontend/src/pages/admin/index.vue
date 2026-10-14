<template>
  <div class="admin-page">
    <!-- 手机端顶栏 -->
    <div class="mobile-top">
      <span class="brand">🛠️ 家长后台</span>
      <button class="logout-link" @click="logout">退出</button>
    </div>

    <div class="admin-body">
      <!-- PC 侧边栏 -->
      <aside class="sidebar">
        <div class="brand">🛠️ 家长后台</div>
        <nav class="nav">
          <button
            v-for="tab in TABS"
            :key="tab.key"
            class="nav-item"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            <span class="nav-icon">{{ tab.icon }}</span>{{ tab.label }}
          </button>
        </nav>
        <button class="logout-btn" @click="logout">退出登录</button>
      </aside>

      <!-- 手机端标签栏 -->
      <nav class="mobile-tabs">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          class="mobile-tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <span>{{ tab.icon }}</span>{{ tab.label }}
        </button>
      </nav>

      <!-- 内容区 -->
      <main class="content">
        <DashboardPanel v-show="activeTab === 'dashboard'" />
        <MembersPanel v-show="activeTab === 'members'" />
        <FeedbackPanel v-show="activeTab === 'feedback'" />
        <LevelConfigPanel v-show="activeTab === 'levels'" />
        <VoicePanel v-show="activeTab === 'voice'" />
        <SettingsPanel v-show="activeTab === 'settings'" />
        <LogsPanel v-show="activeTab === 'logs'" />
        <BackupPanel v-show="activeTab === 'backup'" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { adminLogout } from '@/api/admin';
import DashboardPanel from '@/components/admin/DashboardPanel.vue';
import MembersPanel from '@/components/admin/MembersPanel.vue';
import FeedbackPanel from '@/components/admin/FeedbackPanel.vue';
import SettingsPanel from '@/components/admin/SettingsPanel.vue';
import BackupPanel from '@/components/admin/BackupPanel.vue';
import LevelConfigPanel from '@/components/admin/LevelConfigPanel.vue';
import LogsPanel from '@/components/admin/LogsPanel.vue';
import VoicePanel from '@/components/admin/VoicePanel.vue';

const router = useRouter();
const activeTab = ref('dashboard');

const TABS = [
  { key: 'dashboard', label: '数据看板', icon: '📊' },
  { key: 'members', label: '角色管理', icon: '👪' },
  { key: 'feedback', label: '意见反馈', icon: '💬' },
  { key: 'levels', label: '难度配置', icon: '🎚️' },
  { key: 'voice', label: '语音配音', icon: '🎙️' },
  { key: 'settings', label: '护眼策略', icon: '⏰' },
  { key: 'logs', label: '错误日志', icon: '🐞' },
  { key: 'backup', label: '数据备份', icon: '💾' },
];

const logout = () => {
  adminLogout();
  router.replace('/admin');
};
</script>

<style scoped>
.admin-page {
  min-height: 100vh;
  background: #f0f2f5;
  color: #2c3e50;
}

.mobile-top {
  display: none;
}

.admin-body {
  display: flex;
  min-height: 100vh;
}

/* PC 侧边栏 */
.sidebar {
  width: 200px;
  background: #2c3e50;
  color: #ecf0f1;
  padding: 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  flex-shrink: 0;
}

.brand {
  font-size: 17px;
  font-weight: bold;
  padding: 0 6px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px;
  border: none;
  border-radius: 10px;
  background: none;
  color: #bdc3c7;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-item.active {
  background: #3498db;
  color: #fff;
  font-weight: 600;
}

.logout-btn {
  padding: 10px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  color: #bdc3c7;
  font-size: 13px;
  cursor: pointer;
}

.logout-btn:hover {
  color: #fff;
  background: rgba(231, 76, 60, 0.6);
}

.content {
  flex: 1;
  padding: 22px;
  min-width: 0;
}

/* 手机端 */
@media (max-width: 768px) {
  .sidebar {
    display: none;
  }

  /* 主体纵向堆叠：标签栏整行在上、内容在下，避免标签挤占内容宽度 */
  .admin-body {
    flex-direction: column;
  }

  .mobile-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #2c3e50;
    color: #fff;
    padding: 12px 16px;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .mobile-top .brand {
    font-size: 15px;
  }

  .logout-link {
    border: none;
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 12px;
  }

  .mobile-tabs {
    display: flex;
    width: 100%;
    background: #fff;
    border-bottom: 1px solid #e5e5e5;
    overflow-x: auto;
    position: sticky;
    top: 44px;
    z-index: 9;
  }

  .mobile-tab {
    flex: 1;
    min-width: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 4px;
    border: none;
    background: none;
    color: #999;
    font-size: 11px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
  }

  .mobile-tab span {
    font-size: 19px;
  }

  .mobile-tab.active {
    color: #3498db;
    border-bottom-color: #3498db;
    font-weight: 600;
  }

  .content {
    padding: 14px;
    width: 100%;
    box-sizing: border-box;
  }
}

@media (min-width: 769px) {
  .mobile-tabs {
    display: none;
  }
}
</style>
