<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-3 sm:p-6 overflow-x-hidden">
    <div class="max-w-4xl mx-auto">
      <!-- 页面头部 -->
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h1 class="text-2xl sm:text-3xl font-bold text-gray-800">个人中心</h1>
          <p class="text-gray-500 mt-1">管理您的个人信息</p>
        </div>
        <n-button @click="goBack" secondary>
          <template #icon>
            <n-icon :component="ArrowBackFilled" />
          </template>
          返回
        </n-button>
      </div>

      <!-- 用户信息卡片 -->
      <n-card class="shadow-lg">
        <n-tabs type="line" animated>
          <!-- 基本信息 -->
          <n-tab-pane name="basic" tab="基本信息">
            <n-form ref="formRef" :model="formData" :rules="rules" label-placement="left" label-width="100">
              <!-- 头像 -->
              <n-form-item label="头像">
                <div class="flex items-center gap-4">
                  <n-avatar 
                    :size="80" 
                    :src="formData.avatar || undefined"
                    class="shadow-md"
                  >
                    {{ formData.nickname?.charAt(0) || formData.username?.charAt(0) || '?' }}
                  </n-avatar>
                  <div class="flex flex-col gap-2">
                    <n-upload
                      :custom-request="handleAvatarUpload"
                      :show-file-list="false"
                      accept="image/*"
                    >
                      <n-button size="small" secondary>上传头像</n-button>
                    </n-upload>
                    <p class="text-xs text-gray-500">支持 JPG、PNG 格式，最大 2MB</p>
                  </div>
                </div>
              </n-form-item>

              <!-- 用户名 -->
              <n-form-item label="用户名">
                <n-input 
                  v-model:value="formData.username" 
                  disabled
                  placeholder="用户名不可修改"
                />
              </n-form-item>

              <!-- 昵称 -->
              <n-form-item label="昵称" path="nickname">
                <n-input 
                  v-model:value="formData.nickname" 
                  placeholder="请输入昵称"
                  maxlength="50"
                  show-count
                />
              </n-form-item>

              <!-- 邮箱 -->
              <n-form-item label="邮箱" path="email">
                <n-input 
                  v-model:value="formData.email" 
                  placeholder="请输入邮箱"
                  type="email"
                />
              </n-form-item>

              <!-- 手机号 -->
              <n-form-item label="手机号" path="phone">
                <n-input 
                  v-model:value="formData.phone" 
                  placeholder="请输入手机号"
                  maxlength="20"
                />
              </n-form-item>

              <!-- 个人简介 -->
              <n-form-item label="个人简介">
                <n-input
                  v-model:value="formData.bio"
                  type="textarea"
                  placeholder="介绍一下自己吧..."
                  :rows="4"
                  maxlength="200"
                  show-count
                />
              </n-form-item>

              <!-- 操作按钮 -->
              <n-form-item>
                <div class="flex gap-3">
                  <n-button 
                    type="primary" 
                    :loading="loading"
                    @click="handleSubmit"
                  >
                    保存修改
                  </n-button>
                  <n-button @click="handleReset">
                    重置
                  </n-button>
                </div>
              </n-form-item>
            </n-form>
          </n-tab-pane>

          <!-- 账户安全 -->
          <n-tab-pane name="security" tab="账户安全">
            <div class="space-y-6">
              <!-- 修改密码 -->
              <div class="p-4 bg-gray-50 rounded-lg">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="font-semibold text-gray-800">修改密码</h3>
                    <p class="text-sm text-gray-500 mt-1">定期修改密码，保护账户安全</p>
                  </div>
                  <n-button type="primary" secondary @click="showPasswordModal = true">
                    修改密码
                  </n-button>
                </div>
              </div>

              <!-- 账户状态 -->
              <div class="p-4 bg-gray-50 rounded-lg">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="font-semibold text-gray-800">账户状态</h3>
                    <p class="text-sm text-gray-500 mt-1">
                      当前状态：<n-tag :type="statusColor" size="small">{{ statusText }}</n-tag>
                    </p>
                  </div>
                  <n-select
                    v-model:value="formData.status"
                    :options="statusOptions"
                    style="width: 120px"
                    @update:value="handleStatusChange"
                  />
                </div>
              </div>

              <!-- 最后登录 -->
              <div class="p-4 bg-gray-50 rounded-lg">
                <h3 class="font-semibold text-gray-800">登录信息</h3>
                <p class="text-sm text-gray-500 mt-2">
                  最后登录时间：{{ lastLoginTime }}
                </p>
              </div>
            </div>
          </n-tab-pane>

          <!-- 通知设置 -->
          <n-tab-pane name="notification" tab="通知设置">
            <div class="space-y-6">
              <!-- 桌面通知 -->
              <div class="p-4 bg-gray-50 rounded-lg">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="font-semibold text-gray-800">桌面通知</h3>
                    <p class="text-sm text-gray-500 mt-1">
                      <span v-if="notificationPermission === 'granted'" class="text-green-600">✓ 已启用</span>
                      <span v-else-if="notificationPermission === 'denied'" class="text-red-600">✗ 已拒绝</span>
                      <span v-else class="text-yellow-600">⚠ 未请求</span>
                      - 接收新消息、通话等桌面通知
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <n-switch 
                      v-model:value="notificationEnabled" 
                      @update:value="handleNotificationToggle"
                      :disabled="notificationPermission !== 'granted'"
                    />
                    <n-button 
                      v-if="notificationPermission !== 'granted'" 
                      size="small" 
                      type="primary"
                      @click="requestNotificationPermission"
                    >
                      请求权限
                    </n-button>
                  </div>
                </div>
              </div>

              <!-- 声音提醒 -->
              <div class="p-4 bg-gray-50 rounded-lg">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="font-semibold text-gray-800">声音提醒</h3>
                    <p class="text-sm text-gray-500 mt-1">收到新消息时播放提示音</p>
                  </div>
                  <n-switch 
                    v-model:value="soundEnabled" 
                    @update:value="handleSoundToggle"
                  />
                </div>
              </div>

              <!-- 消息预览 -->
              <div class="p-4 bg-gray-50 rounded-lg">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="font-semibold text-gray-800">消息预览</h3>
                    <p class="text-sm text-gray-500 mt-1">在通知中显示消息内容</p>
                  </div>
                  <n-switch v-model:value="messagePreview" />
                </div>
              </div>

              <!-- 通知类型设置 -->
              <div class="p-4 bg-gray-50 rounded-lg">
                <h3 class="font-semibold text-gray-800 mb-3">通知类型</h3>
                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm">私聊消息</span>
                    <n-switch v-model:value="notifyPrivateMessage" />
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-sm">群组消息</span>
                    <n-switch v-model:value="notifyGroupMessage" />
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-sm">来电通知</span>
                    <n-switch v-model:value="notifyCall" />
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-sm">群组邀请</span>
                    <n-switch v-model:value="notifyInvitation" />
                  </div>
                </div>
              </div>

              <!-- 测试通知 -->
              <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="font-semibold text-blue-800">测试通知</h3>
                    <p class="text-sm text-blue-600 mt-1">发送一条测试通知，检查设置是否生效</p>
                  </div>
                  <n-button 
                    type="info" 
                    @click="sendTestNotification"
                    :disabled="!notificationEnabled || notificationPermission !== 'granted'"
                  >
                    发送测试
                  </n-button>
                </div>
              </div>
            </div>
          </n-tab-pane>
        </n-tabs>
      </n-card>

      <!-- 修改密码弹窗 -->
      <n-modal v-model:show="showPasswordModal" preset="card" title="修改密码" style="width: min(500px, calc(100vw - 24px))">
        <n-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules">
          <n-form-item label="当前密码" path="oldPassword">
            <n-input 
              v-model:value="passwordForm.oldPassword" 
              type="password"
              placeholder="请输入当前密码"
            />
          </n-form-item>
          <n-form-item label="新密码" path="newPassword">
            <n-input 
              v-model:value="passwordForm.newPassword" 
              type="password"
              placeholder="请输入新密码（至少6位）"
            />
          </n-form-item>
          <n-form-item label="确认密码" path="confirmPassword">
            <n-input 
              v-model:value="passwordForm.confirmPassword" 
              type="password"
              placeholder="请再次输入新密码"
            />
          </n-form-item>
        </n-form>
        <template #footer>
          <div class="flex justify-end gap-3">
            <n-button @click="showPasswordModal = false">取消</n-button>
            <n-button type="primary" :loading="passwordLoading" @click="handleChangePassword">
              确认修改
            </n-button>
          </div>
        </template>
      </n-modal>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage, type FormInst, type FormRules, type UploadCustomRequestOptions } from 'naive-ui';
import { ArrowBackFilled } from '@vicons/material';
import { getCurrentUser, updateUser } from '@/api/auth';
import { useAuth } from '@/stores/auth';
import { useSocketStore } from '@/stores/socket';
import notificationService from '@/services/notificationService';

const router = useRouter();
const message = useMessage();
const { updateUserInfo } = useAuth();
const socketStore = useSocketStore();

const formRef = ref<FormInst | null>(null);
const passwordFormRef = ref<FormInst | null>(null);
const loading = ref(false);
const passwordLoading = ref(false);
const showPasswordModal = ref(false);

// 表单数据
const formData = reactive({
  username: '',
  nickname: '',
  email: '',
  phone: '',
  avatar: '',
  bio: '',
  status: 'online' as 'online' | 'offline' | 'busy',
});

// 密码表单
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

// 表单验证规则
const rules: FormRules = {
  nickname: [
    { max: 50, message: '昵称最多50个字符', trigger: 'blur' },
  ],
  email: [
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' },
  ],
  phone: [
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' },
  ],
};

const passwordRules: FormRules = {
  oldPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少6个字符', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value) => {
        return value === passwordForm.newPassword;
      },
      message: '两次输入的密码不一致',
      trigger: 'blur',
    },
  ],
};

// 状态选项
const statusOptions = [
  { label: '在线', value: 'online' },
  { label: '忙碌', value: 'busy' },
  { label: '离线', value: 'offline' },
];

const statusColor = computed(() => {
  const colorMap = {
    online: 'success',
    busy: 'warning',
    offline: 'default',
  };
  return colorMap[formData.status] as any;
});

const statusText = computed(() => {
  const textMap = {
    online: '在线',
    busy: '忙碌',
    offline: '离线',
  };
  return textMap[formData.status];
});

const lastLoginTime = computed(() => {
  // 这里可以从用户数据中获取
  return new Date().toLocaleString();
});

// 通知设置
const notificationPermission = ref<NotificationPermission>('default');
const notificationEnabled = ref(false);
const soundEnabled = ref(true);
const messagePreview = ref(true);
const notifyPrivateMessage = ref(true);
const notifyGroupMessage = ref(true);
const notifyCall = ref(true);
const notifyInvitation = ref(true);

// 初始化通知设置
function initNotificationSettings() {
  notificationPermission.value = notificationService.getPermission();
  notificationEnabled.value = notificationService.isEnabled();
  soundEnabled.value = notificationService.isSoundEnabled();
  
  // 从 localStorage 加载通知类型设置
  const savedNotifySettings = localStorage.getItem('notify_settings');
  if (savedNotifySettings) {
    try {
      const settings = JSON.parse(savedNotifySettings);
      messagePreview.value = settings.messagePreview ?? true;
      notifyPrivateMessage.value = settings.notifyPrivateMessage ?? true;
      notifyGroupMessage.value = settings.notifyGroupMessage ?? true;
      notifyCall.value = settings.notifyCall ?? true;
      notifyInvitation.value = settings.notifyInvitation ?? true;
    } catch (error) {
      console.error('加载通知设置失败:', error);
    }
  }
}

// 保存通知类型设置
function saveNotifySettings() {
  const settings = {
    messagePreview: messagePreview.value,
    notifyPrivateMessage: notifyPrivateMessage.value,
    notifyGroupMessage: notifyGroupMessage.value,
    notifyCall: notifyCall.value,
    notifyInvitation: notifyInvitation.value,
  };
  localStorage.setItem('notify_settings', JSON.stringify(settings));
}

watch(
  [messagePreview, notifyPrivateMessage, notifyGroupMessage, notifyCall, notifyInvitation],
  saveNotifySettings
);

// 请求通知权限
async function requestNotificationPermission() {
  const granted = await notificationService.requestPermission();
  if (granted) {
    notificationPermission.value = 'granted';
    notificationEnabled.value = true;
    message.success('通知权限已授予');
  } else {
    message.error('通知权限被拒绝');
  }
}

// 切换通知开关
function handleNotificationToggle(value: boolean) {
  if (value) {
    notificationService.enable();
    message.success('桌面通知已开启');
  } else {
    notificationService.disable();
    message.success('桌面通知已关闭');
  }
}

// 切换声音开关
function handleSoundToggle(value: boolean) {
  if (value) {
    notificationService.enableSound();
    message.success('声音提醒已开启');
  } else {
    notificationService.disableSound();
    message.success('声音提醒已关闭');
  }
}

// 发送测试通知
async function sendTestNotification() {
  await notificationService.showSystem(
    '测试通知',
    '这是一条测试通知，您的通知设置已生效！'
  );
  message.success('测试通知已发送');
}

// 加载用户信息
async function loadUserInfo() {
  try {
    const { user } = await getCurrentUser();
    Object.assign(formData, user);
  } catch (error: any) {
    message.error('加载用户信息失败: ' + error.message);
  }
}

// 处理头像上传
async function handleAvatarUpload({ file }: UploadCustomRequestOptions) {
  const maxSize = 2 * 1024 * 1024; // 2MB
  
  if (file.file && file.file.size > maxSize) {
    message.error('图片大小不能超过 2MB');
    return;
  }

  try {
    // 将图片转换为base64
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (e.target?.result) {
        formData.avatar = e.target.result as string;
        message.success('头像上传成功');
      }
    };
    reader.onerror = () => {
      message.error('图片读取失败');
    };
    if (file.file) {
      reader.readAsDataURL(file.file);
    }
  } catch (error: any) {
    message.error('上传失败: ' + error.message);
  }
}

// 提交表单
async function handleSubmit() {
  try {
    await formRef.value?.validate();
    loading.value = true;

    const { user } = await updateUser({
      nickname: formData.nickname,
      email: formData.email,
      phone: formData.phone,
      avatar: formData.avatar,
      bio: formData.bio,
      status: formData.status,
    });

    updateUserInfo(user);
    message.success('保存成功');
  } catch (error: any) {
    if (error.message) {
      message.error('保存失败: ' + error.message);
    }
  } finally {
    loading.value = false;
  }
}

// 重置表单
function handleReset() {
  loadUserInfo();
  message.info('已重置');
}

// 修改密码
async function handleChangePassword() {
  try {
    await passwordFormRef.value?.validate();
    passwordLoading.value = true;

    const { changePassword } = await import('@/api/auth');
    await changePassword(passwordForm.oldPassword, passwordForm.newPassword);
    
    message.success('密码修改成功，请重新登录');
    showPasswordModal.value = false;
    
    // 清空表单
    passwordForm.oldPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
    
    // 延迟后登出
    setTimeout(async () => {
      const { clearAuth } = useAuth();
      await clearAuth();
      router.push('/login');
    }, 1500);
  } catch (error: any) {
    if (error.message) {
      message.error('修改失败: ' + error.message);
    }
  } finally {
    passwordLoading.value = false;
  }
}

// 修改状态
async function handleStatusChange() {
  try {
    const result = await updateUser({ status: formData.status });
    console.log('状态更新结果:', result);
    updateUserInfo({ status: formData.status });
    socketStore.updateStatus(formData.status);
    message.success('状态修改成功');
  } catch (error: any) {
    console.error('状态修改失败:', error);
    message.error('状态修改失败: ' + error.message);
  }
}

// 返回
function goBack() {
  router.back();
}

onMounted(() => {
  loadUserInfo();
  initNotificationSettings();
});
</script>

<style scoped>
:deep(.n-card) {
  border-radius: 12px;
}
</style>

