import { ref, computed } from 'vue';
import type { User } from '@/api/auth';
import { logout } from '@/api/auth';

// 用户状态管理
const currentUser = ref<User | null>(null);
const token = ref<string | null>(null);
const refreshToken = ref<string | null>(null);

// 初始化：从localStorage恢复token和用户信息
function initAuth() {
  const savedToken = localStorage.getItem('token');
  const savedRefreshToken = localStorage.getItem('refreshToken');
  const savedUser = localStorage.getItem('user');
  
  if (savedToken) {
    token.value = savedToken;
  }
  
  if (savedRefreshToken) {
    refreshToken.value = savedRefreshToken;
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

// 设置用户信息和token（兼容旧版本单token）
function setAuth(user: User, authToken: string, authRefreshToken?: string) {
  currentUser.value = user;
  token.value = authToken;
  
  localStorage.setItem('token', authToken);
  localStorage.setItem('user', JSON.stringify(user));
  
  if (authRefreshToken) {
    refreshToken.value = authRefreshToken;
    localStorage.setItem('refreshToken', authRefreshToken);
  }
}

// 更新 access token（用于刷新）
function updateToken(newAccessToken: string, newRefreshToken?: string) {
  token.value = newAccessToken;
  localStorage.setItem('token', newAccessToken);
  
  if (newRefreshToken) {
    refreshToken.value = newRefreshToken;
    localStorage.setItem('refreshToken', newRefreshToken);
  }
}

// 只清理本地认证状态，被动鉴权失败时不能再次请求受保护的登出接口
function clearAuthLocal() {
  currentUser.value = null;
  token.value = null;
  refreshToken.value = null;

  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

// 清除认证信息
async function clearAuth() {
  // 调用后端登出接口
  if (token.value) {
    try {
      await logout();
    } catch (error) {
      console.error('登出请求失败:', error);
    }
  }

  clearAuthLocal();
}

// 更新用户信息
function updateUserInfo(user: Partial<User>) {
  if (currentUser.value) {
    currentUser.value = { ...currentUser.value, ...user };
    localStorage.setItem('user', JSON.stringify(currentUser.value));
  }
}

function restoreUser(user: User) {
  currentUser.value = user;
  localStorage.setItem('user', JSON.stringify(user));
}

// 是否已登录
const isAuthenticated = computed(() => !!token.value);

export function useAuth() {
  return {
    currentUser,
    token,
    refreshToken,
    isAuthenticated,
    initAuth,
    setAuth,
    updateToken,
    clearAuth,
    clearAuthLocal,
    updateUserInfo,
    restoreUser,
  };
}

