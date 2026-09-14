import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findBinding: vi.fn(),
  findUser: vi.fn(),
  consume: vi.fn(),
  issue: vi.fn(),
}));
vi.mock('../../../src/config/redis', () => ({ default: { incr: vi.fn(async () => 1), expire: vi.fn() } }));
vi.mock('../../../src/models', () => ({
  UserEmail: { findOne: mocks.findBinding, findByPk: vi.fn(async () => null) },
  User: { findByPk: mocks.findUser },
}));
vi.mock('../../../src/services/redisService', () => ({ default: { delRefreshToken: vi.fn() } }));
vi.mock('../../../src/services/emailVerificationService', () => ({
  normalizeEmail: (value: string) => value,
  consumeEmailCode: mocks.consume,
  isMailConfigured: () => true,
  issueEmailCode: mocks.issue,
}));
vi.mock('../../../src/services/tokenVersionService', () => ({ invalidateUserTokens: vi.fn() }));

import { resetPassword, sendLoginCode } from '../../../src/controller/authEmailController';

beforeEach(() => { vi.clearAllMocks(); });

describe('邮箱找回密码', () => {
  it('只信任验证绑定表，不能凭旧用户资料邮箱找回', async () => {
    mocks.findBinding.mockResolvedValue(null);
    const ctx = { request: { body: { email: 'legacy@example.com', code: '123456', newPassword: 'Newpass1!' } }, status: 200 } as any;
    await resetPassword(ctx);
    expect(ctx.status).toBe(400);
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it('新密码不符合规则时拒绝重置，且不消耗验证码', async () => {
    const ctx = { request: { body: { email: 'test@example.com', code: '123456', newPassword: 'Weakpass😊1' } }, status: 200 } as any;
    await resetPassword(ctx);
    expect(ctx.status).toBe(400);
    expect(mocks.findBinding).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});

describe('邮箱验证码登录发码', () => {
  it('对未绑定邮箱和冷却中的邮箱返回相同提示', async () => {
    const ctx = { request: { body: { email: 'alice@example.com' } }, ip: '127.0.0.1', status: 200 } as any;
    mocks.findBinding.mockResolvedValue(null);
    await sendLoginCode(ctx);
    expect(ctx.status).toBe(200);
    expect(ctx.body.message).toBe('验证码已发送');
    expect(mocks.issue).not.toHaveBeenCalled();
    const neutralMessage = ctx.body.message;

    mocks.findBinding.mockResolvedValue({ userId: 7 });
    mocks.issue.mockResolvedValue('cooldown');
    await sendLoginCode(ctx);
    expect(ctx.status).toBe(200);
    expect(ctx.body.message).toBe(neutralMessage);
    expect(mocks.issue).toHaveBeenCalledWith('login', 'alice@example.com');
  });
});
