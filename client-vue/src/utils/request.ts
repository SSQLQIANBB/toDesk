import { useAuth } from '@/stores/auth';
import router from '@/router';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  _retry?: boolean;
}

// 刷新token的Promise，用于防止并发刷新
let refreshTokenPromise: Promise<boolean> | null = null;

/**
 * 刷新 access token
 */
async function refreshAccessToken(): Promise<boolean> {
  const { refreshToken, updateToken, clearAuth } = useAuth();

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
      // refresh token 也失效了
      await clearAuth();
      return false;
    }

    const data = await response.json();
    updateToken(data.accessToken, data.refreshToken);
    return true;
  } catch (error) {
    console.error('Refresh token failed:', error);
    await clearAuth();
    return false;
  }
}

/**
 * 统一的HTTP请求方法
 */
export async function request<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', headers = {}, body, _retry = false } = options;

  // 获取token
  const token = localStorage.getItem('token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  headers['Content-Type'] = 'application/json';

  const config: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${url}`, config);
    
    // 特殊处理：如果是刷新token的请求，直接返回
    if (url.includes('/refresh-token')) {
      return await response.json();
    }

    const data = await response.json();

    if (!response.ok) {
      // 如果是401未授权错误，且未重试过
      if (response.status === 401 && !_retry) {
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

        router.push('/login');
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
