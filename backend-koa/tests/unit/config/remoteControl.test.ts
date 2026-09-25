import { describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ validate: vi.fn() }));
vi.mock('../../../src/services/loginSessionService', () => ({ validateAuthenticatedSession: mock.validate }));
import { initializeRemoteControl } from '../../../src/config/remoteControl';
import { getRemoteControlCapabilities } from '../../../src/services/remoteControlPolicy';

describe('未验收原生引擎的发布门禁', () => {
  it('主控/被控/Web均关闭，客户端自报权限不能绕过namespace校验', async () => {
    const use = vi.fn();
    const of = vi.fn(() => ({ use }));
    initializeRemoteControl({ of } as any);
    expect(of).toHaveBeenCalledWith('/remote-control');
    mock.validate.mockResolvedValue({ userId: 1, sid: 'login' });
    const next = vi.fn();
    await use.mock.calls[0][0]({ handshake: { auth: { token: 'valid', role: 'host', engineReady: true, canInjectInput: true } } }, next);
    expect(next.mock.calls[0][0].data.code).toBe('NATIVE_VALIDATION_PENDING');
    expect(getRemoteControlCapabilities()).toMatchObject({ desktopHostEnabled: false, desktopControllerEnabled: false, webControllerReleaseEnabled: false, releasedPlatforms: [] });
  });
  it('旧sid/缺少凭据均拒绝，不作为匿名功能协商放行', async () => {
    const use = vi.fn();
    initializeRemoteControl({ of: () => ({ use }) } as any);
    mock.validate.mockRejectedValue(new Error('revoked'));
    const next = vi.fn();
    await use.mock.calls[0][0]({ handshake: { auth: { token: 'expired' } } }, next);
    expect(next.mock.calls[0][0].data.code).toBe('AUTH_REVOKED');
  });
});
