import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { RemoteControlPeer, type RemotePeerOptions } from '@/services/remoteControlPeer';

const certificate = new Uint8Array([1, 2, 3]).buffer;
const fingerprint = createHash('sha256').update(new Uint8Array(certificate)).digest('hex').toUpperCase();
const endpoint = { userId: 1, sid: 'sid', authVersion: 'version', endpointId: 'device', connectionId: 'socket', generation: 1 };
const binding = { sessionId: 'session', host: endpoint, controller: { ...endpoint, userId: 2 }, negotiationId: 'negotiation', consentNonce: 'nonce', screenId: 'primary' };
const envelope = { format: 'rc-signed-v1' as const, keyId: 'test', payload: 'payload', signature: 'signature' };
class Channel {
  readyState = 'open'; bufferedAmount = 0;
  send = vi.fn((_data: string) => {});
  close = vi.fn();
  onmessage: ((event: { data: string }) => void) | null = null;
}
class Stream {
  tracks: MediaStreamTrack[] = [];
  addTrack(track: MediaStreamTrack) { this.tracks.push(track); }
  getVideoTracks() { return this.tracks; }
  getTracks() { return this.tracks; }
}
let peer: RemoteControlPeer;
let state: Channel;
let input: Channel;
let video: HTMLVideoElement;
let rendered: (() => void) | null;
let now: number;
const onPause = vi.fn();
const onEnd = vi.fn();
const onArmed = vi.fn();
const messages = () => state.send.mock.calls.map(([value]) => JSON.parse(value));
function host(type: string, payload: object = {}) {
  state.onmessage?.({ data: JSON.stringify({ version: 1, sessionId: binding.sessionId, negotiationId: binding.negotiationId, connectionGeneration: 1, type, payload }) });
}
function render() { const callback = rendered; rendered = null; callback?.(); }
function acceptArm() {
  const request = messages().find(message => message.type === 'input-arm').payload;
  const context = { ...request, sessionId: binding.sessionId, inputEpoch: 1 };
  host('input-armed', context);
  host('input-window', { ...context, inputWindowId: 'ticket' });
}
beforeEach(async () => {
  vi.useFakeTimers(); vi.clearAllMocks(); now = 0; rendered = null;
  let leaseSeq = 0;
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('MediaStream', Stream);
  vi.stubGlobal('RTCRtpReceiver', { getCapabilities: () => ({ codecs: [{ mimeType: 'video/VP8', clockRate: 90000 }] }) });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  state = new Channel(); input = new Channel();
  const rtc = {
    addTransceiver: () => ({ setCodecPreferences: vi.fn() }),
    createDataChannel: (label: string) => label === 'rc-state-v1' ? state : input,
    sctp: { transport: { state: 'connected', getRemoteCertificates: () => [certificate] } },
    localDescription: { sdp: `a=fingerprint:sha-256 ${fingerprint}\r\n` },
    remoteDescription: { sdp: `a=fingerprint:sha-256 ${fingerprint}\r\n` },
    close: vi.fn(),
    ontrack: null as ((event: { track: object }) => void) | null,
  };
  const verifyProof: RemotePeerOptions['verifyProof'] = async (_proof, _keys, _binding, purpose) => ({
    envelope, deadline: 15000,
    claims: { ...binding, hostFingerprint: fingerprint, controllerFingerprint: fingerprint, protocolVersion: 1, issuer: 'todesk-remote-control', audience: 'todesk-remote-peer', purpose, scope: 'control', authorizationRevision: 1, controlEpoch: 1, issuedAt: 0, expiresAt: 15000, ...(purpose === 'lease' ? { leaseSeq: ++leaseSeq, challenge: 'challenge' } : {}) },
  });
  peer = new RemoteControlPeer({ binding, iceServers: [], iceTransportPolicy: 'all', keys: [], onSignal: vi.fn(), onReady: vi.fn(), onStream: vi.fn(), onPauseInput: onPause, onEnd, onInputArmed: onArmed, now: () => now, createPeer: () => rtc as unknown as RTCPeerConnection, verifyProof });
  video = document.createElement('video'); video.tabIndex = 0; document.body.append(video); video.focus();
  video.play = vi.fn().mockResolvedValue(undefined);
  video.requestVideoFrameCallback = vi.fn(callback => { rendered = () => callback(now, {} as VideoFrameCallbackMetadata); return 1; });
  video.cancelVideoFrameCallback = vi.fn();
  peer.attachVideo(video);
  rtc.ontrack?.({ track: { kind: 'video', stop: vi.fn(), onended: null } });
  await peer.installConnectionProof(envelope);
  host('hello', { proofSignature: envelope.signature });
  await peer.installMediaLease(envelope);
  host('layout', { screenId: 'primary', layoutVersion: 1 });
  state.send.mockClear();
});
afterEach(() => { peer.end('TEST_CLEANUP'); video.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('主控启用输入前报告真实渲染进度', () => {
  it('首帧之后在同一通道先报告渲染计数再请求启用，仍须宿主窗口才可输入', async () => {
    render();
    expect(peer.requestInputArm()).toBe(true);
    expect(messages().map(message => message.type)).toEqual(['heartbeat', 'input-arm']);
    expect(messages()[0].payload).toEqual({ renderedFrames: 1 });
    expect(peer.input.armed).toBe(false);
    now = 100; await vi.advanceTimersByTimeAsync(100);
    expect(messages()).toHaveLength(2); // Explicit progress report replaces this periodic heartbeat.
    acceptArm();
    expect(peer.input.armed).toBe(true);
  });
  it('没有渲染帧时不发送心跳授权暗示或启用请求', () => {
    expect(peer.requestInputArm()).toBe(false);
    expect(state.send).not.toHaveBeenCalled();
    expect(peer.input.armed).toBe(false);
  });
  it.each(['closed', 'heartbeat-failed', 'arm-failed'] as const)('%s 时请求失败且不保留可接受的启用请求', failure => {
    render();
    if (failure === 'closed') state.readyState = 'closed';
    else if (failure === 'heartbeat-failed') state.send.mockImplementationOnce(() => { throw new Error('closed'); });
    else state.send.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('closed'); });
    expect(peer.requestInputArm()).toBe(false);
    expect(peer.input.armed).toBe(false);
    if (failure !== 'arm-failed') expect(messages().some(message => message.type === 'input-arm')).toBe(false);
    else {
      acceptArm(); // A late response to a failed send cannot reopen input.
      expect(peer.input.armed).toBe(false);
    }
  });
  it('宿主因画面冻结暂停后，新帧与续租均不能自动恢复旧控制授权', async () => {
    render(); peer.requestInputArm(); acceptArm();
    host('pause', { reason: 'REMOTE_CAPTURE_STALLED' });
    expect(peer.input.armed).toBe(false);
    expect(onPause).toHaveBeenCalledWith('REMOTE_HOST_PAUSED');
    now = 100; render(); state.send.mockClear();
    await peer.installMediaLease(envelope);
    expect(peer.requestInputArm()).toBe(false);
    expect(peer.sendInput({ type: 'key', payload: { code: 'KeyA', down: true } })).toBe(false);
    expect(state.send).not.toHaveBeenCalled();
  });
  it('尚未启用输入时收到宿主暂停仍通知界面请求新许可', () => {
    render();
    host('pause', { reason: 'REMOTE_CAPTURE_STALLED' });
    expect(onPause).toHaveBeenCalledExactlyOnceWith('REMOTE_HOST_PAUSED');
    expect(peer.requestInputArm()).toBe(false);
    expect(state.send).not.toHaveBeenCalled();
  });
});
