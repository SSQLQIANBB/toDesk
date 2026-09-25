import { describe, expect, it, vi } from 'vitest';
import { createMediaOccupancy } from '@/services/mediaOccupancy';

describe('统一媒体占用', () => {
  it('任何私聊/群组媒体与远控互斥，旧释放不能释放新会话', () => {
    const media = createMediaOccupancy();
    const first = media.acquire('group-call', 'group-1')!;
    expect(media.acquire('remote-control', 'remote-1')).toBeNull();
    expect(media.acquire('private-call', 'private-1')).toBeNull();
    first.release();
    const second = media.acquire('remote-control', 'remote-1')!;
    first.release();
    expect(second.isCurrent()).toBe(true);
    expect(media.current.value?.kind).toBe('remote-control');
  });
  it('屏幕选择跨路由交接保持同一占用且更新停止回调', () => {
    const media = createMediaOccupancy();
    const captureCleanup = vi.fn();
    const pageCleanup = vi.fn();
    const pending = media.acquire('group-screen', 'screen-1', captureCleanup)!;
    expect(media.acquire('group-screen', 'screen-1', pageCleanup)).toBe(pending);
    media.stop('LOGOUT');
    expect(pageCleanup).toHaveBeenCalledWith('LOGOUT');
    expect(captureCleanup).not.toHaveBeenCalled();
    expect(pending.isCurrent()).toBe(false);
    expect(media.current.value).toBeNull();
  });
});
