import { describe, expect, it, vi } from 'vitest';
import { getAudioFileExtension, resolveChatMediaUrl, selectAudioMimeType } from '@/services/chatMedia';

describe('聊天媒体工具', () => {
  it('保留 HTTPS 地址并解析站内上传地址', () => {
    expect(resolveChatMediaUrl('https://files.example.com/a.png')).toBe('https://files.example.com/a.png');
    expect(resolveChatMediaUrl('/uploads/a.png')).toMatch(/\/uploads\/a\.png$/);
  });

  it('选择浏览器支持的录音格式和扩展名', () => {
    vi.stubGlobal('MediaRecorder', { isTypeSupported: (type: string) => type === 'audio/webm' });
    expect(selectAudioMimeType()).toBe('audio/webm');
    expect(getAudioFileExtension('audio/ogg;codecs=opus')).toBe('ogg');
    expect(getAudioFileExtension('audio/webm')).toBe('webm');
    vi.unstubAllGlobals();
  });
});
