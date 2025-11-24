import { http } from '@/utils/request';

export interface User {
  id: number;
  username: string;
  nickname?: string;
  avatar?: string;
  email?: string;
  phone?: string;
  bio?: string;
  status?: 'online' | 'offline' | 'busy';
}

export interface LoginParams {
  username: string;
  password: string;
}

export interface RegisterParams {
  username: string;
  password: string;
  nickname?: string;
  email?: string;
  phone?: string;
}

/**
 * 用户登录
 */
export function login(params: LoginParams) {
  return http.post<{ token: string; user: User; message: string }>('/api/auth/login', params);
}

/**
 * 用户注册
 */
export function register(params: RegisterParams) {
  return http.post<{ token: string; user: User; message: string }>('/api/auth/register', params);
}

/**
 * 获取当前用户信息
 */
export function getCurrentUser() {
  return http.get<{ user: User }>('/api/auth/me');
}

/**
 * 更新用户信息
 */
export function updateUser(data: Partial<User>) {
  return http.put<{ user: User; message: string }>('/api/auth/me', data);
}

/**
 * 获取用户列表
 */
export function getUserList() {
  return http.get<{ users: User[] }>('/api/auth/users');
}

/**
 * 用户登出
 */
export function logout() {
  return http.post<{ message: string }>('/api/auth/logout');
}

/**
 * 修改密码
 */
export function changePassword(oldPassword: string, newPassword: string) {
  return http.post<{ message: string }>('/api/auth/change-password', { oldPassword, newPassword });
}

