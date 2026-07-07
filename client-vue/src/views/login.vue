<template>
  <div class="login-page relative min-h-[100dvh] overflow-hidden flex items-center justify-center px-4 py-6 sm:p-6">
    <div class="cosmic-orb cosmic-orb-primary" aria-hidden="true"></div>
    <div class="cosmic-orb cosmic-orb-secondary" aria-hidden="true"></div>
    <div class="star-field star-field-one" aria-hidden="true">
      <span v-for="index in 14" :key="`star-one-${index}`" class="star"></span>
    </div>
    <div class="star-field star-field-two" aria-hidden="true">
      <span v-for="index in 14" :key="`star-two-${index}`" class="star"></span>
    </div>
    <div class="orbit-line orbit-line-one" aria-hidden="true"></div>
    <div class="orbit-line orbit-line-two" aria-hidden="true"></div>
    <div class="astronaut-scene" aria-hidden="true">
      <div class="astronaut">
        <div class="astronaut-backpack"></div>
        <div class="astronaut-head"></div>
        <div class="astronaut-arm astronaut-arm-left"></div>
        <div class="astronaut-arm astronaut-arm-right"></div>
        <div class="astronaut-body">
          <div class="astronaut-panel"></div>
        </div>
        <div class="astronaut-leg astronaut-leg-left"></div>
        <div class="astronaut-leg astronaut-leg-right"></div>
      </div>
    </div>

    <div class="relative z-20 w-full max-w-md">
      <n-card class="login-card shadow-2xl">
        <template #header>
          <div class="text-center">
            <h1 class="text-3xl font-bold text-gray-800">ToDesk</h1>
            <p class="text-sm text-gray-500 mt-2">远程协作平台</p>
          </div>
        </template>

        <n-tabs v-model:value="activeTab" type="segment" animated>
          <!-- 登录 -->
          <n-tab-pane name="login" tab="登录">
            <n-form ref="loginFormRef" :model="loginForm" :rules="loginRules" class="mt-4">
              <n-form-item path="username" label="用户名">
                <n-input 
                  v-model:value="loginForm.username" 
                  placeholder="请输入用户名"
                  @keyup.enter="handleLogin"
                >
                  <template #prefix>
                    <n-icon :component="PersonFilled" />
                  </template>
                </n-input>
              </n-form-item>

              <n-form-item path="password" label="密码">
                <n-input 
                  v-model:value="loginForm.password" 
                  type="password"
                  show-password-on="click"
                  placeholder="请输入密码"
                  @keyup.enter="handleLogin"
                >
                  <template #prefix>
                    <n-icon :component="LockFilled" />
                  </template>
                </n-input>
              </n-form-item>

              <n-button 
                type="primary" 
                block 
                size="large"
                :loading="loading"
                :disabled="loading"
                @click="handleLogin"
                class="mt-2"
              >
                登录
              </n-button>
            </n-form>
          </n-tab-pane>

          <!-- 注册 -->
          <n-tab-pane name="register" tab="注册">
            <n-form ref="registerFormRef" :model="registerForm" :rules="registerRules" class="mt-4">
              <n-form-item path="username" label="用户名">
                <n-input 
                  v-model:value="registerForm.username" 
                  placeholder="请输入用户名"
                >
                  <template #prefix>
                    <n-icon :component="PersonFilled" />
                  </template>
                </n-input>
              </n-form-item>

              <n-form-item path="password" label="密码">
                <n-input 
                  v-model:value="registerForm.password" 
                  type="password"
                  show-password-on="click"
                  placeholder="请输入密码"
                >
                  <template #prefix>
                    <n-icon :component="LockFilled" />
                  </template>
                </n-input>
              </n-form-item>

              <n-form-item path="confirmPassword" label="确认密码">
                <n-input 
                  v-model:value="registerForm.confirmPassword" 
                  type="password"
                  show-password-on="click"
                  placeholder="请再次输入密码"
                >
                  <template #prefix>
                    <n-icon :component="LockFilled" />
                  </template>
                </n-input>
              </n-form-item>

              <n-form-item path="nickname" label="昵称（可选）">
                <n-input 
                  v-model:value="registerForm.nickname" 
                  placeholder="请输入昵称"
                />
              </n-form-item>

              <n-button 
                type="primary" 
                block 
                size="large"
                :loading="registerLoading"
                :disabled="registerLoading"
                @click="handleRegister"
                class="mt-2"
              >
                注册
              </n-button>
            </n-form>
          </n-tab-pane>
        </n-tabs>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage, type FormInst, type FormRules } from 'naive-ui';
import { PersonFilled, LockFilled } from '@vicons/material';
import { register, type LoginParams, type User } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { createLoginController } from '@/services/loginController';

const router = useRouter();
const route = useRoute();
const message = useMessage();
const authStore = useAuthStore();

const activeTab = ref<'login' | 'register'>('login');
const registerLoading = ref(false);
const loginController = createLoginController({
  login: (credentials: LoginParams) => authStore.login(credentials) as Promise<{
    accessToken: string;
    refreshToken: string;
    user: User;
    message?: string;
  }>,
  navigate: path => router.replace(path),
  showSuccess: text => message.success(text),
  showError: text => message.error(text),
});
const { loading } = loginController;

// 登录表单
const loginFormRef = ref<FormInst | null>(null);
const loginForm = ref({
  username: '',
  password: '',
});

const loginRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
  ],
};

// 注册表单
const registerFormRef = ref<FormInst | null>(null);
const registerForm = ref({
  username: '',
  password: '',
  confirmPassword: '',
  nickname: '',
});

const registerRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度在3-20个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6个字符', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value) => {
        return value === registerForm.value.password;
      },
      message: '两次输入的密码不一致',
      trigger: 'blur',
    },
  ],
};

// 登录
async function handleLogin() {
  await loginController.submit({
    validate: () => loginFormRef.value?.validate() || Promise.resolve(),
    credentials: {
      username: loginForm.value.username,
      password: loginForm.value.password,
    },
    redirect: route.query.redirect,
  });
}

// 注册
async function handleRegister() {
  if (registerLoading.value) return;
  registerLoading.value = true;
  try {
    await registerFormRef.value?.validate();

    const res = await register({
      username: registerForm.value.username,
      password: registerForm.value.password,
      nickname: registerForm.value.nickname || undefined,
    });

    authStore.setAuth(res.user, res.accessToken, res.refreshToken);
    message.success('注册成功');
    await router.replace('/remote');
  } catch (error: any) {
    message.error(error.message || '注册失败');
  } finally {
    registerLoading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  isolation: isolate;
  background:
    radial-gradient(circle at 18% 18%, rgba(95, 195, 255, 0.34), transparent 30%),
    radial-gradient(circle at 80% 18%, rgba(135, 92, 255, 0.32), transparent 28%),
    linear-gradient(135deg, #07111f 0%, #101a3d 46%, #1d1442 100%);
}

.login-page::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: radial-gradient(circle at center, black, transparent 76%);
}

.login-page::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    radial-gradient(circle at 50% 120%, rgba(19, 127, 255, 0.28), transparent 42%),
    linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.34) 100%);
}

.cosmic-orb,
.star-field,
.orbit-line,
.astronaut-scene {
  position: absolute;
  pointer-events: none;
}

.cosmic-orb {
  z-index: 2;
  border-radius: 999px;
  filter: blur(6px);
  opacity: 0.88;
}

.cosmic-orb-primary {
  width: clamp(180px, 30vw, 420px);
  height: clamp(180px, 30vw, 420px);
  left: max(-120px, -8vw);
  top: max(-96px, -6vw);
  background: radial-gradient(circle, rgba(43, 210, 255, 0.58), rgba(43, 210, 255, 0.08) 62%, transparent 70%);
}

.cosmic-orb-secondary {
  width: clamp(220px, 36vw, 520px);
  height: clamp(220px, 36vw, 520px);
  right: max(-180px, -10vw);
  bottom: max(-160px, -10vw);
  background: radial-gradient(circle, rgba(156, 104, 255, 0.48), rgba(156, 104, 255, 0.08) 60%, transparent 72%);
}

.star-field {
  inset: -140px 0 auto;
  z-index: 4;
  height: 720px;
  animation: star-fall 13s linear infinite;
}

.star-field-two {
  animation-delay: -6.5s;
}

.star {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 14px rgba(167, 220, 255, 0.9);
}

.star::before,
.star::after {
  content: '';
  position: absolute;
  border-radius: inherit;
  background: inherit;
  box-shadow: inherit;
}

.star::before {
  width: 5px;
  height: 5px;
  left: 48px;
  top: 72px;
  opacity: 0.62;
}

.star::after {
  width: 2px;
  height: 2px;
  left: -36px;
  top: 132px;
  opacity: 0.78;
}

.star:nth-child(1) { left: 6%; top: 8%; }
.star:nth-child(2) { left: 16%; top: 22%; }
.star:nth-child(3) { left: 27%; top: 4%; }
.star:nth-child(4) { left: 38%; top: 27%; }
.star:nth-child(5) { left: 48%; top: 13%; }
.star:nth-child(6) { left: 58%; top: 31%; }
.star:nth-child(7) { left: 67%; top: 7%; }
.star:nth-child(8) { left: 78%; top: 24%; }
.star:nth-child(9) { left: 88%; top: 12%; }
.star:nth-child(10) { left: 94%; top: 34%; }
.star:nth-child(11) { left: 12%; top: 42%; }
.star:nth-child(12) { left: 34%; top: 51%; }
.star:nth-child(13) { left: 64%; top: 46%; }
.star:nth-child(14) { left: 84%; top: 55%; }

.orbit-line {
  z-index: 3;
  border: 1px solid rgba(142, 207, 255, 0.18);
  border-radius: 999px;
  transform: rotate(-18deg);
}

.orbit-line-one {
  width: min(78vw, 980px);
  height: min(36vw, 440px);
  right: -18vw;
  top: 12vh;
}

.orbit-line-two {
  width: min(54vw, 680px);
  height: min(26vw, 330px);
  left: -16vw;
  bottom: 8vh;
}

.astronaut-scene {
  z-index: 5;
  right: clamp(24px, 9vw, 160px);
  bottom: clamp(40px, 9vh, 120px);
  width: clamp(132px, 17vw, 240px);
  height: clamp(158px, 20vw, 288px);
  opacity: 0.82;
  animation: astronaut-float 6.5s ease-in-out infinite;
}

.astronaut {
  position: relative;
  width: 100%;
  height: 100%;
  transform: rotate(-10deg);
}

.astronaut-backpack,
.astronaut-head,
.astronaut-body,
.astronaut-arm,
.astronaut-leg {
  position: absolute;
}

.astronaut-backpack {
  width: 42%;
  height: 50%;
  top: 27%;
  left: 29%;
  border-radius: 46% 46% 16% 16%;
  background: linear-gradient(135deg, #6d92aa, #a9ccda);
}

.astronaut-head {
  z-index: 3;
  width: 42%;
  height: 28%;
  top: 10%;
  left: 29%;
  border-radius: 50%;
  background: linear-gradient(90deg, #dce7ef 0 50%, #fff 50% 100%);
  box-shadow: inset -10px -10px 24px rgba(83, 113, 139, 0.18);
}

.astronaut-head::after {
  content: '';
  position: absolute;
  width: 62%;
  height: 56%;
  left: 19%;
  top: 22%;
  border-radius: 16px;
  background: linear-gradient(180deg, #26d5f7 0 52%, #057eb1 52% 100%);
  box-shadow: inset 0 8px 14px rgba(255, 255, 255, 0.18);
}

.astronaut-body {
  z-index: 2;
  width: 38%;
  height: 36%;
  top: 36%;
  left: 31%;
  border-radius: 42% / 22%;
  background: linear-gradient(90deg, #dce7ef 0 50%, #fff 50% 100%);
}

.astronaut-panel {
  position: absolute;
  width: 66%;
  height: 38%;
  top: 20%;
  left: 17%;
  border-radius: 8px;
  background: #b8d2ef;
}

.astronaut-panel::before {
  content: '';
  position: absolute;
  width: 44%;
  height: 12%;
  left: 12%;
  top: 22%;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 9px 0 #fff, 0 18px 0 #fff;
}

.astronaut-panel::after {
  content: '';
  position: absolute;
  width: 13%;
  aspect-ratio: 1;
  right: 14%;
  top: 24%;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 16px 0 3px #fff;
}

.astronaut-arm {
  z-index: 1;
  width: 34%;
  height: 12%;
  top: 42%;
  background: #eef5f8;
}

.astronaut-arm-left {
  left: 12%;
  border-radius: 0 0 0 999px;
  transform: rotate(-20deg);
}

.astronaut-arm-right {
  right: 12%;
  border-radius: 0 0 999px 0;
  transform: rotate(20deg);
}

.astronaut-leg {
  z-index: 1;
  width: 14%;
  height: 22%;
  bottom: 12%;
  background: #eef5f8;
}

.astronaut-leg-left {
  left: 33%;
  transform: rotate(18deg);
}

.astronaut-leg-right {
  right: 32%;
  transform: rotate(-18deg);
}

.astronaut-leg::after {
  content: '';
  position: absolute;
  width: 160%;
  height: 34%;
  bottom: -22%;
  border-bottom: 6px solid #76a1bd;
  background: inherit;
}

.astronaut-leg-left::after {
  right: 0;
  border-radius: 24px 0 0 0;
}

.astronaut-leg-right::after {
  left: 0;
  border-radius: 0 24px 0 0;
}

:deep(.login-card) {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow:
    0 28px 90px rgba(0, 0, 0, 0.34),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px);
}

:deep(.login-card .n-card-header) {
  padding-top: 30px;
}

:deep(.login-card .n-card__content) {
  padding-bottom: 30px;
}

@keyframes star-fall {
  0% {
    opacity: 0;
    transform: translate3d(0, -18%, 0);
  }
  12% {
    opacity: 1;
  }
  100% {
    opacity: 0.9;
    transform: translate3d(0, 96vh, 0);
  }
}

@keyframes astronaut-float {
  0%,
  100% {
    transform: translate3d(0, 0, 0) rotate(-3deg);
  }
  50% {
    transform: translate3d(-10px, -18px, 0) rotate(4deg);
  }
}

@media (max-width: 640px) {
  .login-page {
    align-items: flex-start;
    padding-top: max(28px, env(safe-area-inset-top));
    padding-bottom: max(24px, env(safe-area-inset-bottom));
  }

  .star-field {
    height: 520px;
    opacity: 0.62;
  }

  .orbit-line {
    opacity: 0.42;
  }

  .astronaut-scene {
    right: -20px;
    bottom: 10px;
    width: 118px;
    height: 142px;
    opacity: 0.24;
  }

  :deep(.login-card) {
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.92);
  }

  :deep(.login-card .n-card-header) {
    padding-top: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .star-field,
  .astronaut-scene {
    animation: none;
  }
}
</style>
