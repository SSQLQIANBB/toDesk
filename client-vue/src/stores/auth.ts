import { ref, computed } from 'vue';
import type { User } from '@/api/auth';

// 用户状态管理
const currentUser = ref<User | null>(null);
const token = ref<string | null>(null);

// 初始化：从localStorage恢复token和用户信息
function initAuth() {
  const savedToken = localStorage.getItem('token');
  const savedUser = localStorage.getItem('user');
  
  if (savedToken) {
    token.value = savedToken;
  }
  
  if (savedUser) {
    try {
      currentUser.value = JSON.parse(savedUser);
    } catch (error) {
      console.error('解析用户信息失败:', error);
      localStorage.removeItem('user');
    }
  }
}

// 设置用户信息和token
function setAuth(user: User, authToken: string) {
  currentUser.value = user;
  token.value = authToken;
  
  localStorage.setItem('token', authToken);
  localStorage.setItem('user', JSON.stringify(user));
}

// 清除认证信息
async function clearAuth() {
  // 调用后端登出接口
  if (token.value) {
    try {
      const { logout } = await import('@/api/auth');
      await logout();
    } catch (error) {
      console.error('登出请求失败:', error);
    }
  }
  
  currentUser.value = null;
  token.value = null;
  
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// 更新用户信息
function updateUserInfo(user: Partial<User>) {
  if (currentUser.value) {
    currentUser.value = { ...currentUser.value, ...user };
    localStorage.setItem('user', JSON.stringify(currentUser.value));
  }
}

// 是否已登录
const isAuthenticated = computed(() => !!token.value);

export function useAuth() {
  return {
    currentUser,
    token,
    isAuthenticated,
    initAuth,
    setAuth,
    clearAuth,
    updateUserInfo,
  };
}

