import { afterEach, describe, expect, it, vi } from 'vitest';
import { getVideoFileExtension, selectVideoMimeType } from '@/services/recordingFormat';

afterEach(() => vi.unstubAllGlobals());

describe('跨平台录制格式', () => {
  it('WebKit 仅支持 MP4 时回退并使用匹配扩展名', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (type: string) => type === 'video/mp4' });
    expect(selectVideoMimeType()).toBe('video/mp4');
    expect(getVideoFileExtension('video/mp4;codecs=avc1')).toBe('mp4');
  });
  it('保留支持的 WebM 格式', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
    expect(selectVideoMimeType()).toBe('video/webm;codecs=vp9');
    expect(getVideoFileExtension(selectVideoMimeType())).toBe('webm');
  });
  it('不支持录制时不抛异常', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(selectVideoMimeType()).toBe('');
  });
});
