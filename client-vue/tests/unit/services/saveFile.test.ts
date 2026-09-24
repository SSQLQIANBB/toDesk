import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isTauri, save, writeFile } = vi.hoisted(() => ({
  isTauri: vi.fn(), save: vi.fn(), writeFile: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile }));
import { saveFile } from '../../../src/services/saveFile';

beforeEach(() => {
  vi.clearAllMocks();
  isTauri.mockReturnValue(true);
});

describe('桌面录制保存', () => {
  const arrayBuffer = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
  const blob = { arrayBuffer } as unknown as Blob;

  it('只写入用户选择的路径', async () => {
    save.mockResolvedValue('C:\\Users\\test\\Videos\\meeting.webm');
    writeFile.mockResolvedValue(undefined);
    expect(await saveFile(blob, 'meeting.webm')).toBe(true);
    expect(save).toHaveBeenCalledWith({ defaultPath: 'meeting.webm', filters: [{ name: 'WebM 视频', extensions: ['webm'] }] });
    expect(writeFile).toHaveBeenCalledWith('C:\\Users\\test\\Videos\\meeting.webm', new Uint8Array([1, 2, 3]));
  });

  it('取消后不读取或写入数据', async () => {
    save.mockResolvedValue(null);
    expect(await saveFile(blob, 'meeting.webm')).toBe(false);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('磁盘写入失败向调用方报告，不报告保存成功', async () => {
    save.mockResolvedValue('C:\\meeting.webm');
    writeFile.mockRejectedValue(new Error('disk full'));
    await expect(saveFile(blob, 'meeting.webm')).rejects.toThrow('disk full');
  });
});
