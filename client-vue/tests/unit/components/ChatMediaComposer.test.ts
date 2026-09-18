import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  stopTrack: vi.fn(),
  recorder: null as FakeMediaRecorder | null,
}));

vi.mock('@/api/common', () => ({ uploadFile: mocks.uploadFile }));
vi.mock('naive-ui', async importOriginal => ({
  ...await importOriginal<typeof import('naive-ui')>(),
  useMessage: () => ({ error: vi.fn(), warning: vi.fn() }),
}));

class FakeMediaRecorder {
  static isTypeSupported() { return true; }
  state: RecordingState = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor() { mocks.recorder = this; }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['voice'], { type: this.mimeType }) } as BlobEvent);
    this.onstop?.();
  }
}

import ChatMediaComposer from '../../../src/components/ChatMediaComposer.vue';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recorder = null;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: mocks.stopTrack }] }) },
  });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  mocks.uploadFile.mockResolvedValue({ file: {
    id: 1,
    fileUrl: 'https://files.example.com/voice.webm',
    mimeType: 'audio/webm',
    originalName: 'voice.webm',
    fileSize: 5,
  } });
});

describe('聊天语音录制', () => {
  it('按住开始录音，松开后上传并发送语音', async () => {
    const wrapper = mount(ChatMediaComposer, {
      global: { stubs: { NButton: { template: '<button><slot /></button>' } } },
    });
    const button = wrapper.find('.hold-to-talk');

    expect(button.text()).toContain('按住');
    await button.trigger('pointerdown');
    await flushPromises();
    expect(button.text()).toContain('松开发送');

    await button.trigger('pointerup');
    await flushPromises();
    expect(mocks.uploadFile).toHaveBeenCalledOnce();
    expect(wrapper.emitted('send')?.[0]?.[0]).toMatchObject({
      type: 'voice',
      media: { durationSeconds: 1 },
    });
    expect(mocks.stopTrack).toHaveBeenCalledOnce();
  });

  it('麦克风授权完成前松手时不再启动录音', async () => {
    let allowMicrophone!: (stream: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValueOnce(new Promise(resolve => { allowMicrophone = resolve; }) as Promise<MediaStream>);
    const wrapper = mount(ChatMediaComposer, {
      global: { stubs: { NButton: { template: '<button><slot /></button>' } } },
    });
    const button = wrapper.find('.hold-to-talk');

    button.element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    button.element.dispatchEvent(new Event('pointerup', { bubbles: true }));
    allowMicrophone({ getTracks: () => [{ stop: mocks.stopTrack }] } as unknown as MediaStream);
    await flushPromises();

    expect(mocks.recorder).toBeNull();
    expect(mocks.stopTrack).toHaveBeenCalledOnce();
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });
});
