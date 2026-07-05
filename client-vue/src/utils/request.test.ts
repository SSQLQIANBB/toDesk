import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/stores/auth';
import { request } from './request';

const routerMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  currentRoute: {
    value: { fullPath: '/groups?view=mine' },
  },
}));

vi.mock('@/router', () => ({
  default: routerMocks,
}));

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function resetAuth() {
  const auth = useAuth();
  auth.currentUser.value = null;
  auth.token.value = null;
  auth.refreshToken.value = null;
  localStorage.clear();
  return auth;
}

describe('request authentication recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    routerMocks.replace.mockReset();
    routerMocks.push.mockReset();
    routerMocks.currentRoute.value.fullPath = '/groups?view=mine';
    resetAuth();
  });

  it('多个并发 401 只刷新、清理和跳转一次', async () => {
    const auth = useAuth();
    auth.setAuth(
      { id: 1, username: 'owner' },
      'expired-access-token',
      'expired-refresh-token',
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/logout')) {
        return jsonResponse(200, { message: 'ok' });
      }
      if (url.includes('/api/auth/refresh-token')) {
        return jsonResponse(401, { error: 'refresh token 已失效' });
      }
      return jsonResponse(401, { error: 'access token 已失效' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.allSettled([
      request('/api/groups/my'),
      request('/api/messages/offline'),
    ]);

    expect(fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/auth/refresh-token'))).toHaveLength(1);
    expect(routerMocks.replace).toHaveBeenCalledTimes(1);
    expect(routerMocks.replace).toHaveBeenCalledWith({
      name: 'Login',
      query: { redirect: '/groups?view=mine' },
    });
    expect(auth.token.value).toBeNull();
    expect(auth.refreshToken.value).toBeNull();
    expect(auth.currentUser.value).toBeNull();

    await Promise.allSettled([request('/api/groups/late-response')]);
    expect(routerMocks.replace).toHaveBeenCalledTimes(1);
  });

  it('刷新成功后只重试原请求一次并更新 token', async () => {
    const auth = useAuth();
    auth.setAuth(
      { id: 1, username: 'owner' },
      'expired-access-token',
      'valid-refresh-token',
    );
    let resourceRequests = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/auth/refresh-token')) {
        return jsonResponse(200, {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        });
      }
      resourceRequests += 1;
      return resourceRequests === 1
        ? jsonResponse(401, { error: 'expired' })
        : jsonResponse(200, { value: 'ok' });
    }));

    await expect(request<{ value: string }>('/api/groups/my')).resolves.toEqual({ value: 'ok' });
    expect(resourceRequests).toBe(2);
    expect(auth.token.value).toBe('new-access-token');
    expect(routerMocks.replace).not.toHaveBeenCalled();
  });

  it('403 权限不足不会清除登录状态', async () => {
    const auth = useAuth();
    auth.setAuth({ id: 1, username: 'owner' }, 'valid-token', 'valid-refresh');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(403, { error: '没有权限' }),
    ));

    await expect(request('/api/groups/7')).rejects.toThrow('没有权限');
    expect(auth.token.value).toBe('valid-token');
    expect(routerMocks.replace).not.toHaveBeenCalled();
  });

  it('登录接口 401 不刷新且不产生重定向循环', async () => {
    const auth = useAuth();
    auth.setAuth({ id: 1, username: 'owner' }, 'old-token', 'old-refresh');
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, { error: '用户名或密码错误' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/api/auth/login', {
      method: 'POST',
      body: { username: 'owner', password: 'wrong' },
    })).rejects.toThrow('用户名或密码错误');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(routerMocks.replace).not.toHaveBeenCalled();
    expect(auth.token.value).toBe('old-token');
  });

  it('没有 refreshToken 时直接统一退出并保留原访问地址', async () => {
    const auth = useAuth();
    auth.setAuth({ id: 1, username: 'owner' }, 'expired-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(401, { error: 'expired' }),
    ));

    await expect(request('/api/groups/my')).rejects.toThrow();

    expect(routerMocks.replace).toHaveBeenCalledTimes(1);
    expect(routerMocks.replace).toHaveBeenCalledWith({
      name: 'Login',
      query: { redirect: '/groups?view=mine' },
    });
    expect(auth.token.value).toBeNull();
  });

  it('路由守卫恢复用户的 401 交由守卫跳转，不发起嵌套路由导航', async () => {
    const auth = useAuth();
    auth.setAuth({ id: 1, username: 'owner' }, 'expired-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(401, { error: 'expired' }),
    ));

    await expect(request('/api/auth/me', {
      _skipAuthRedirect: true,
    } as any)).rejects.toThrow('expired');

    expect(routerMocks.replace).not.toHaveBeenCalled();
  });
});
