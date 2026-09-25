import { beforeEach, describe, expect, it, vi } from 'vitest';
const sockets = vi.hoisted(() => ({ io: vi.fn(), sockets: [] as any[] }));
vi.mock('socket.io-client', () => ({ io: sockets.io }));
import { SocketRemoteControllerAdapter, validRemoteConnecting } from '@/services/remoteControlAdapter';
const sid = '11111111-1111-4111-8111-111111111111';
const authVersion = '22222222-2222-4222-8222-222222222222';
const target = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';
const token = `header.${btoa(JSON.stringify({ userId: 2, sid, authVersion, exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
beforeEach(() => {
  vi.clearAllMocks(); sockets.sockets = [];
  sockets.io.mockImplementation((_url, options) => {
    const handlers = new Map<string, Array<(...args: any[]) => void>>();
    const socket: any = { id: 'ctrl-socket', connected: true, options, handlers, ack: null,
      on: (event: string, listener: (...args: any[]) => void) => { handlers.set(event, [...handlers.get(event) || [], listener]); return socket; },
      once: (event: string, listener: (...args: any[]) => void) => socket.on(event, listener),
      off: (event: string, listener: (...args: any[]) => void) => { handlers.set(event, (handlers.get(event) || []).filter(fn => fn !== listener)); return socket; },
      connect: () => { for (const listener of [...handlers.get('connect') || []]) listener(); },
      disconnect: vi.fn(), removeAllListeners: () => handlers.clear(),
      emit: (_event: string, _envelope: unknown, ack: (value: unknown) => void) => { socket.ack = ack; },
      receive: (event: string, value: unknown) => { for (const listener of [...handlers.get(event) || []]) listener(value); },
    };
    sockets.sockets.push(socket); return socket;
  });
});
function connecting(instanceId: string) {
  const endpoint = { userId: 1, sid, authVersion, endpointId: target, connectionId: 'host-socket', generation: 1 };
  return { sessionId, revision: 1, authorizationRevision: 1, controlEpoch: 1, scope: 'control', host: endpoint, controller: { ...endpoint, userId: 2, endpointId: instanceId, connectionId: 'ctrl-socket' }, consentNonce: 'AQ'.repeat(21) + 'A', screenId: 'screen', negotiationId: '55555555-5555-4555-8555-555555555555', hardDeadline: Date.now() + 60000 };
}
describe('生产远控信令适配器', () => {
  it('构造不连接，使用独立namespace/path且不自动重连', () => {
    const adapter = new SocketRemoteControllerAdapter(token, 'web', vi.fn());
    expect(sockets.io).toHaveBeenCalledWith(expect.stringContaining('/remote-control'), expect.objectContaining({ path: '/meeting', autoConnect: false, reconnection: false, auth: expect.objectContaining({ token, platform: 'web', role: 'controller' }) }));
    adapter.dispose();
  });
  it('拒绝当前账号下不同实例收到的connecting，不能凭同账号冒充当前主控', async () => {
    const event = vi.fn();
    const adapter = new SocketRemoteControllerAdapter(token, 'web', event);
    const pending = adapter.request(target, 'control');
    await Promise.resolve();
    const socket = sockets.sockets[0];
    socket.ack({ ok: true, sessionId, revision: 0, state: 'pending' }); await pending;
    socket.receive('remote:connecting', connecting('66666666-6666-4666-8666-666666666666'));
    expect(event).toHaveBeenCalledWith({ type: 'ended', reason: 'REMOTE_CONNECTING_INVALID' });
    expect(event.mock.calls.some(([value]) => value.type === 'connecting')).toBe(false);
  });
  it('只接受匹配目标、sid、实例与socket代次的严格bootstrap', async () => {
    const event = vi.fn();
    const adapter = new SocketRemoteControllerAdapter(token, 'web', event);
    const pending = adapter.request(target, 'control'); await Promise.resolve();
    const socket = sockets.sockets[0];
    socket.ack({ ok: true, sessionId, revision: 0, state: 'pending' }); await pending;
    const payload = connecting(socket.options.auth.controllerInstanceId);
    socket.receive('remote:connecting', payload);
    expect(event).toHaveBeenCalledWith({ type: 'connecting', value: payload });
    expect(validRemoteConnecting({ ...payload, untrusted: true })).toBe(false);
    expect(validRemoteConnecting({ ...payload, host: { ...payload.host, extra: true } })).toBe(false);
    adapter.dispose();
  });
});
