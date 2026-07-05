<template>
  <div class="min-h-screen flex items-center justify-center p-3 sm:p-6 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
    <div class="w-full max-w-md">
      <n-card class="shadow-2xl">
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
import { login, register } from '@/api/auth';
import { useAuth } from '@/stores/auth';
import { createLoginController } from '@/services/loginController';

const router = useRouter();
const route = useRoute();
const message = useMessage();
const { setAuth } = useAuth();

const activeTab = ref<'login' | 'register'>('login');
const registerLoading = ref(false);
const loginController = createLoginController({
  login,
  setAuth,
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

    setAuth(res.user, res.accessToken, res.refreshToken);
    message.success('注册成功');
    await router.replace('/remote');
  } catch (error: any) {
    message.error(error.message || '注册失败');
  } finally {
    registerLoading.value = false;
  }
}
</script>

