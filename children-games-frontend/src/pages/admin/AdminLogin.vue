<template>
  <div class="admin-login">
    <div class="login-card">
      <div class="login-icon">🔐</div>
      <div class="login-title">家长后台</div>
      <div class="login-sub">请输入管理密码</div>
      <input
        v-model="password"
        class="login-input"
        type="password"
        placeholder="管理密码"
        @keyup.enter="doLogin"
      />
      <div v-if="error" class="login-error">{{ error }}</div>
      <button class="login-btn" :disabled="!password || loading" @click="doLogin">
        {{ loading ? '验证中…' : '进入后台' }}
      </button>
      <button class="login-back" @click="router.push('/')">返回游戏</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { adminLogin, isAdminLoggedIn } from '@/api/admin';

const router = useRouter();
const password = ref('');
const error = ref('');
const loading = ref(false);

onMounted(() => {
  if (isAdminLoggedIn()) {
    router.replace('/admin');
  }
});

const doLogin = async () => {
  if (!password.value || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    await adminLogin(password.value);
    router.replace('/admin');
  } catch (e: any) {
    error.value = e?.response?.data?.message || '登录失败，请重试';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.admin-login {
  min-height: 100vh;
  background: linear-gradient(180deg, #2c3e50 0%, #34495e 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-card {
  background: #fff;
  border-radius: 20px;
  padding: 34px 28px;
  width: 100%;
  max-width: 340px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-icon {
  font-size: 44px;
}

.login-title {
  font-size: 22px;
  font-weight: bold;
  color: #2c3e50;
  margin-top: 8px;
}

.login-sub {
  font-size: 13px;
  color: #999;
  margin: 6px 0 20px;
}

.login-input {
  width: 100%;
  padding: 13px;
  border: 2px solid #e5e5e5;
  border-radius: 14px;
  font-size: 16px;
  text-align: center;
  outline: none;
  box-sizing: border-box;
}

.login-input:focus {
  border-color: #34495e;
}

.login-error {
  color: #e74c3c;
  font-size: 13px;
  margin-top: 8px;
}

.login-btn {
  width: 100%;
  margin-top: 16px;
  padding: 13px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #2c3e50 0%, #4a6274 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.login-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.login-back {
  width: 100%;
  margin-top: 10px;
  padding: 11px;
  border: none;
  background: none;
  color: #999;
  font-size: 13px;
  cursor: pointer;
}
</style>
