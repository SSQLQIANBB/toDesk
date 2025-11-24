import { useAuth } from '@/stores/auth';
import router from '@/router';

// HTTP请求工具类
const API_BASE_URL = 'http://localhost:3000';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
}

/**
 * 统一的HTTP请求方法
 */
export async function request<T = any>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', headers = {}, body } = options;

  // 获取token
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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
    const data = await response.json();

    if (!response.ok) {
      // 如果是401未授权错误，清除认证信息并跳转到登录页
      if (response.status === 401) {
        const { clearAuth } = useAuth();
        clearAuth();
        router.push('/login');
      }
      throw new Error(data.error || '请求失败');
    }

    return data;
  } catch (error: any) {
    console.error('请求错误:', error);
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

