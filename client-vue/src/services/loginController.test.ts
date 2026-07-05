import { describe, expect, it, vi } from 'vitest';
import { createLoginController } from './loginController';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const loginResult = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: { id: 1, username: 'owner' },
  message: '登录成功',
};

describe('loginController', () => {
  it('按请求、写入完整状态、跳转的顺序完成登录', async () => {
    const calls: string[] = [];
    const controller = createLoginController({
      login: vi.fn(async () => {
        calls.push('login');
        return loginResult;
      }),
      setAuth: vi.fn(() => calls.push('setAuth')),
      navigate: vi.fn(async () => {
        calls.push('navigate');
      }),
      showSuccess: vi.fn(),
      showError: vi.fn(),
    });

    await controller.submit({
      validate: async () => calls.push('validate'),
      credentials: { username: 'owner', password: 'password' },
      redirect: '/groups',
    });

    expect(calls).toEqual(['validate', 'login', 'setAuth', 'navigate']);
    expect(controller.loading.value).toBe(false);
  });

  it('点击后立即 loading，请求未结束前不会重复提交', async () => {
    const pending = deferred<typeof loginResult>();
    const login = vi.fn(() => pending.promise);
    const controller = createLoginController({
      login,
      setAuth: vi.fn(),
      navigate: vi.fn(),
      showSuccess: vi.fn(),
      showError: vi.fn(),
    });
    const submission = {
      validate: vi.fn().mockResolvedValue(undefined),
      credentials: { username: 'owner', password: 'password' },
      redirect: undefined,
    };

    const first = controller.submit(submission);
    const second = controller.submit(submission);
    await Promise.resolve();

    expect(controller.loading.value).toBe(true);
    expect(login).toHaveBeenCalledTimes(1);

    pending.resolve(loginResult);
    await Promise.all([first, second]);
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('没有 redirect 时进入首页，合法 redirect 返回原页面', async () => {
    const navigate = vi.fn();
    const controller = createLoginController({
      login: vi.fn().mockResolvedValue(loginResult),
      setAuth: vi.fn(),
      navigate,
      showSuccess: vi.fn(),
      showError: vi.fn(),
    });

    await controller.submit({
      validate: vi.fn(),
      credentials: { username: 'owner', password: 'password' },
      redirect: undefined,
    });
    await controller.submit({
      validate: vi.fn(),
      credentials: { username: 'owner', password: 'password' },
      redirect: '/group-chat/7',
    });

    expect(navigate).toHaveBeenNthCalledWith(1, '/remote');
    expect(navigate).toHaveBeenNthCalledWith(2, '/group-chat/7');
  });

  it.each([
    ['登录失败', () => Promise.reject(new Error('用户名或密码错误'))],
    ['请求异常', () => Promise.reject(new TypeError('network error'))],
  ])('%s 后恢复 loading 并保留凭据对象', async (_name, login) => {
    const credentials = { username: 'owner', password: 'password' };
    const showError = vi.fn();
    const controller = createLoginController({
      login,
      setAuth: vi.fn(),
      navigate: vi.fn(),
      showSuccess: vi.fn(),
      showError,
    });

    await controller.submit({
      validate: vi.fn(),
      credentials,
      redirect: undefined,
    });

    expect(controller.loading.value).toBe(false);
    expect(credentials).toEqual({ username: 'owner', password: 'password' });
    expect(showError).toHaveBeenCalledOnce();
  });

  it('跳转完成前保持 loading，避免成功后再次点击', async () => {
    const navigation = deferred<void>();
    const controller = createLoginController({
      login: vi.fn().mockResolvedValue(loginResult),
      setAuth: vi.fn(),
      navigate: vi.fn(() => navigation.promise),
      showSuccess: vi.fn(),
      showError: vi.fn(),
    });

    const submit = controller.submit({
      validate: vi.fn(),
      credentials: { username: 'owner', password: 'password' },
      redirect: undefined,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.loading.value).toBe(true);
    navigation.resolve();
    await submit;
    expect(controller.loading.value).toBe(false);
  });
});
