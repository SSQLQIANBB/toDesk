import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Koa from 'koa';
import { createServer, type Server } from 'http';
import { Op } from 'sequelize';
import { generateKeyPairSync } from 'crypto';

const mocks = vi.hoisted(() => ({ validate: vi.fn(), devices: vi.fn(), sessions: vi.fn(), revoke: vi.fn() }));
vi.mock('../../../src/config/redis', () => ({ default: {} }));
vi.mock('../../../src/services/loginSessionService', () => ({ validateAuthenticatedSession: mocks.validate }));
vi.mock('../../../src/models/RemoteControl', () => ({
  RemoteDevice: { findAll: mocks.devices, findOne: mocks.revoke },
  RemoteSessionRecord: { findAll: mocks.sessions }, AssistanceGrant: {},
}));
import remoteRouter from '../../../src/router/remoteControl';
let server: Server, origin: string;
beforeAll(async () => {
  const app = new Koa(); app.use(remoteRouter.routes()).use(remoteRouter.allowedMethods());
  server = createServer(app.callback());
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.validate.mockResolvedValue({ userId: 7, sid: 'session-7' });
  mocks.devices.mockResolvedValue([]); mocks.sessions.mockResolvedValue([]); mocks.revoke.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
const read = (path: string, token = 'valid') => fetch(`${origin}/api/remote-control${path}`, { headers: { Authorization: `Bearer ${token}` } });

describe('远控REST真实HTTP权限边界', () => {
  it('签名公钥接口要求登录，只返回显式配置的公钥与有效期', async () => {
    expect((await fetch(`${origin}/api/remote-control/signing-keys`)).status).toBe(401);
    const pair = generateKeyPairSync('ed25519');
    const now = Date.now();
    vi.stubEnv('REMOTE_CONTROL_SIGNING_KEY_ID', 'deployment-test');
    vi.stubEnv('REMOTE_CONTROL_SIGNING_PRIVATE_KEY', pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    vi.stubEnv('REMOTE_CONTROL_SIGNING_KEY_NOT_BEFORE', String(now));
    vi.stubEnv('REMOTE_CONTROL_SIGNING_KEY_NOT_AFTER', String(now + 60000));
    const response = await read('/signing-keys');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ keys: [{ keyId: 'deployment-test', publicKey: pair.publicKey.export({ format: 'jwk' }).x,
      notBefore: now, notAfter: now + 60000 }] });
  });
  it('缺少登录或已撤销sid不可读取设备/会话', async () => {
    expect((await fetch(`${origin}/api/remote-control/devices`)).status).toBe(401);
    mocks.validate.mockRejectedValue(new Error('revoked'));
    expect((await read('/sessions')).status).toBe(401);
    expect(mocks.sessions).not.toHaveBeenCalled();
  });
  it('设备与历史查询绑定当前账号，输出不包含设备密钥或登录sid', async () => {
    mocks.devices.mockResolvedValue([{ id: 'device', alias: 'Mac', platform: 'macos', publicKey: 'secret-key-metadata', fingerprint: 'fingerprint', ownerUserId: 7 }]);
    const devices = await (await read('/devices')).json();
    expect(mocks.devices.mock.calls[0][0].where).toEqual({ ownerUserId: 7 });
    expect(devices.devices[0]).toEqual({ deviceId: 'device', alias: 'Mac', platform: 'macos' });
    await read('/sessions');
    expect(mocks.sessions.mock.calls[0][0].where[Op.or]).toEqual([{ controllerUserId: 7 }, { hostUserId: 7 }]);
  });
  it('未验收时不返回聊天在线用户为远控目标，不向任意会话发放ICE凭据', async () => {
    expect(await (await read('/targets?userId=8')).json()).toEqual({ targets: [] });
    const ice = await read('/sessions/00000000-0000-4000-8000-000000000000/ice');
    expect(ice.status).toBe(503);
    expect((await ice.json()).code).toBe('NATIVE_VALIDATION_PENDING');
  });
  it('不能通过删除其他账号设备枚举其存在状态', async () => {
    const response = await fetch(`${origin}/api/remote-control/devices/00000000-0000-4000-8000-000000000000`, {
      method: 'DELETE', headers: { Authorization: 'Bearer valid' },
    });
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('TARGET_UNAVAILABLE');
    expect(mocks.revoke.mock.calls[0][0].where.ownerUserId).toBe(7);
  });
});
