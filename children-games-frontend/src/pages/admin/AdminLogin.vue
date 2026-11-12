<template>
  <div class="admin-login">
    <div class="login-card">
      <div class="login-icon">🔐</div>
      <div class="login-title">家长后台</div>

      <!-- 第一步：管理密码 -->
      <template v-if="step === 'password'">
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
      </template>

      <!-- 第二步：两步验证码（启用 2FA 的管理员账号） -->
      <template v-else>
        <div class="login-sub">请输入认证器中的 6 位验证码</div>
        <input
          v-model="twoFactorCode"
          class="login-input"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          placeholder="000000"
          @keyup.enter="doVerify2fa"
        />
        <div v-if="error" class="login-error">{{ error }}</div>
        <button
          class="login-btn"
          :disabled="twoFactorCode.length !== 6 || loading"
          @click="doVerify2fa"
        >
          {{ loading ? '验证中…' : '验证并进入' }}
        </button>
        <button class="login-back" @click="backToPassword">返回重新输入密码</button>
      </template>

      <button v-if="step === 'password'" class="login-back" @click="router.push('/')">
        返回游戏
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { adminLogin, verify2faLogin, isAdminLoggedIn } from '@/api/admin';

const router = useRouter();
const step = ref<'password' | 'totp'>('password');
const password = ref('');
const twoFactorCode = ref('');
const tempToken = ref('');
const error = ref('');
const loading = ref(false);

onMounted(() => {
  if (isAdminLoggedIn()) {
    router.replace('/admin');
  }
});

const extractError = (e: unknown, fallback: string): string =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

const doLogin = async () => {
  if (!password.value || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    const result = await adminLogin(password.value);
    if (result.require2FA && result.tempToken) {
      // 启用 2FA：进入验证码第二步（正式 token 由 verify 接口签发）
      tempToken.value = result.tempToken;
      twoFactorCode.value = '';
      step.value = 'totp';
      return;
    }
    router.replace('/admin');
  } catch (e: unknown) {
    error.value = extractError(e, '登录失败，请重试');
  } finally {
    loading.value = false;
  }
};

const doVerify2fa = async () => {
  if (twoFactorCode.value.length !== 6 || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    await verify2faLogin(tempToken.value, twoFactorCode.value);
    router.replace('/admin');
  } catch (e: unknown) {
    error.value = extractError(e, '验证码不正确，请重试');
  } finally {
    loading.value = false;
  }
};

const backToPassword = () => {
  step.value = 'password';
  tempToken.value = '';
  twoFactorCode.value = '';
  error.value = '';
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
