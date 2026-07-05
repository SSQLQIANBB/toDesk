import { useAuth } from '@/stores/auth';
import router from '@/router';
import { getAuthRedirect } from '@/services/authNavigation';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  _retry?: boolean;
  _skipAuthRedirect?: boolean;
}

// 刷新token的Promise，用于防止并发刷新
let refreshTokenPromise: Promise<boolean> | null = null;
let authFailurePromise: Promise<void> | null = null;
let authFailureHandled = false;

function skipsAutomaticAuthRecovery(url: string) {
  return [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh-token',
    '/api/auth/logout',
  ].some(path => url.startsWith(path));
}

/**
 * 刷新 access token
 */
async function refreshAccessToken(): Promise<boolean> {
  const { refreshToken, updateToken } = useAuth();

  if (!refreshToken.value) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: refreshToken.value }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    updateToken(data.accessToken, data.refreshToken);
    return true;
  } catch (error) {
    console.error('Refresh token failed:', error);
    return false;
  }
}

async function handleAuthenticationFailure() {
  const auth = useAuth();
  if (authFailureHandled) {
    if (!auth.token.value) return;
    // 已存在新的登录状态，后续 401 属于新的会话。
    authFailureHandled = false;
  }

  if (!authFailurePromise) {
    authFailureHandled = true;
    authFailurePromise = (async () => {
      const redirect = getAuthRedirect(router.currentRoute.value.fullPath);
      auth.clearAuthLocal();
      await router.replace({
        name: 'Login',
        query: redirect ? { redirect } : {},
      });
    })().finally(() => {
      authFailurePromise = null;
    });
  }

  await authFailurePromise;
}

/**
 * 统一的HTTP请求方法
 */
export async function request<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    _retry = false,
    _skipAuthRedirect = false,
  } = options;
  const requestHeaders = { ...headers };

  // 获取token
  const token = localStorage.getItem('token');
  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  requestHeaders['Content-Type'] = 'application/json';

  const config: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${url}`, config);
    
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && !skipsAutomaticAuthRecovery(url)) {
        if (!_retry) {
          // 使用共享的 refreshTokenPromise 防止并发刷新
          if (!refreshTokenPromise) {
            refreshTokenPromise = refreshAccessToken().finally(() => {
              refreshTokenPromise = null;
            });
          }

          const refreshSuccess = await refreshTokenPromise;
          if (refreshSuccess) {
            // 刷新成功，重试原始请求
            return request<T>(url, { ...options, _retry: true });
          }
        }

        if (_skipAuthRedirect) {
          throw new Error(data.error || 'Login expired, please sign in again');
        }
        await handleAuthenticationFailure();
        throw new Error('Login expired, please sign in again');
      }

      throw new Error(data.error || 'Request failed');
    }

    return data;
  } catch (error: any) {
    console.error('Request error:', error);
    throw error;
  }
}

// 便捷方法
export const http = {
  get: <T = any>(url: string) => request<T>(url, { method: 'GET' }),
  post: <T = any>(url: string, body?: any) => request<T>(url, { method: 'POST', body }),
  put: <T = any>(url: string, body?: any) => request<T>(url, { method: 'PUT', body }),
  delete: <T = any>(url: string) => request<T>(url, { method: 'DELETE' }),
};
