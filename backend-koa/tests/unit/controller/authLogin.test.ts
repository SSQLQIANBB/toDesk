import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUserByName: vi.fn(),
  findUserById: vi.fn(),
  findBindingByEmail: vi.fn(),
  findBindingById: vi.fn(),
  consumeCode: vi.fn(),
  verifyPassword: vi.fn(),
  setRefreshToken: vi.fn(),
  generateTokenPair: vi.fn(),
}));

vi.mock('../../../src/models', () => ({
  User: { findOne: mocks.findUserByName, findByPk: mocks.findUserById },
  UserEmail: { findOne: mocks.findBindingByEmail, findByPk: mocks.findBindingById },
}));
vi.mock('../../../src/services/emailVerificationService', () => ({
  normalizeEmail: (value: unknown) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ? value.trim().toLowerCase() : null,
  consumeEmailCode: mocks.consumeCode,
}));
vi.mock('../../../src/utils/crypto', () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock('../../../src/utils/jwt', () => ({ generateTokenPair: mocks.generateTokenPair }));
vi.mock('../../../src/services/tokenVersionService', () => ({ getTokenVersion: vi.fn(async () => 'v1') }));
vi.mock('../../../src/services/redisService', () => ({ default: { setRefreshToken: mocks.setRefreshToken } }));

import { login, loginWithEmailCode } from '../../../src/controller/authController';

function makeUser() {
  const user = {
    id: 7,
    phone: null,
    status: 'offline',
    get: vi.fn(() => ({ id: 7, username: 'alice', password: 'hashed', nickname: 'Alice', avatar: null })),
    update: vi.fn(async (changes: { status: string }) => { user.status = changes.status; }),
  };
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUserByName.mockResolvedValue(null);
  mocks.findUserById.mockResolvedValue(null);
  mocks.findBindingByEmail.mockResolvedValue(null);
  mocks.findBindingById.mockResolvedValue({ email: 'alice@example.com' });
  mocks.verifyPassword.mockReturnValue(true);
  mocks.consumeCode.mockResolvedValue(true);
  mocks.generateTokenPair.mockReturnValue({ accessToken: 'access', refreshToken: 'refresh' });
});

describe('登录方式', () => {
  it('用户名和密码登录沿用原有令牌与在线状态流程', async () => {
    const user = makeUser();
    mocks.findUserByName.mockResolvedValue(user);
    const ctx = { request: { body: { username: 'alice', password: 'old-password' } }, status: 200 } as any;
    await login(ctx);
    expect(mocks.findUserByName).toHaveBeenCalledWith({ where: { username: 'alice' } });
    expect(mocks.verifyPassword).toHaveBeenCalledWith('old-password', 'hashed');
    expect(user.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'online' }));
    expect(mocks.setRefreshToken).toHaveBeenCalledWith(7, 'refresh');
    expect(ctx.body.user.email).toBe('alice@example.com');
  });

  it('账号密码登录通过已验证的邮箱绑定查找用户', async () => {
    const user = makeUser();
    mocks.findBindingByEmail.mockResolvedValue({ userId: 7 });
    mocks.findUserById.mockResolvedValue(user);
    const ctx = { request: { body: { username: ' Alice@Example.com ', password: 'old-password' } }, status: 200 } as any;
    await login(ctx);
    expect(mocks.findBindingByEmail).toHaveBeenCalledWith({ where: { email: 'alice@example.com' } });
    expect(mocks.findUserById).toHaveBeenCalledWith(7);
    expect(mocks.findUserByName).toHaveBeenCalledWith({ where: { username: ' Alice@Example.com ' } });
    expect(ctx.body.accessToken).toBe('access');
  });

  it('用户名恰好是邮箱格式时仍优先按原用户名登录', async () => {
    const user = makeUser();
    mocks.findUserByName.mockResolvedValue(user);
    const ctx = { request: { body: { username: 'alice@example.com', password: 'old-password' } }, status: 200 } as any;
    await login(ctx);
    expect(ctx.body.accessToken).toBe('access');
    expect(mocks.findBindingByEmail).not.toHaveBeenCalled();
  });

  it('未验证的邮箱资料不能用于账号密码登录', async () => {
    const ctx = { request: { body: { username: 'legacy@example.com', password: 'old-password' } }, status: 200 } as any;
    await login(ctx);
    expect(ctx.status).toBe(401);
    expect(mocks.generateTokenPair).not.toHaveBeenCalled();
  });

  it('验证码登录消费登录专用验证码并复用相同的登录状态', async () => {
    const user = makeUser();
    mocks.findBindingByEmail.mockResolvedValue({ userId: 7 });
    mocks.findUserById.mockResolvedValue(user);
    const ctx = { request: { body: { email: ' Alice@Example.com ', code: '123456' } }, status: 200 } as any;
    await loginWithEmailCode(ctx);
    expect(mocks.consumeCode).toHaveBeenCalledWith('login', 'alice@example.com', '123456');
    expect(ctx.body.accessToken).toBe('access');
    expect(ctx.body.refreshToken).toBe('refresh');
    expect(user.status).toBe('online');
  });

  it('未绑定邮箱和错误验证码均不签发令牌', async () => {
    const ctx = { request: { body: { email: 'missing@example.com', code: '123456' } }, status: 200 } as any;
    await loginWithEmailCode(ctx);
    expect(ctx.status).toBe(401);
    expect(mocks.consumeCode).not.toHaveBeenCalled();
    mocks.findBindingByEmail.mockResolvedValue({ userId: 7 });
    mocks.consumeCode.mockResolvedValue(false);
    await loginWithEmailCode(ctx);
    expect(ctx.status).toBe(401);
    expect(mocks.generateTokenPair).not.toHaveBeenCalled();
  });
});
