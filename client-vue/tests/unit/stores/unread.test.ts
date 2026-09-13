import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUnreadStore } from '../../../src/stores/unread';

beforeEach(() => setActivePinia(createPinia()));

describe('全局未读消息', () => {
  it('跨会话分别计数，同一消息不会重复计数，打开会话后清零', () => {
    const unread = useUnreadStore();
    unread.receivePrivate(11, 2, false);
    unread.receivePrivate(11, 2, false);
    unread.receivePrivate(12, 3, false);
    unread.receiveGroup(21, 7, false);
    unread.receiveGroup(22, 7, true);
    expect(unread.privateCounts).toEqual({ 2: 1, 3: 1 });
    expect(unread.groupCounts).toEqual({ 7: 1 });
    expect(unread.total).toBe(3);
    unread.readPrivate(2);
    unread.readGroup(7);
    expect(unread.total).toBe(1);
  });

  it('登出后清除计数和去重状态', () => {
    const unread = useUnreadStore();
    unread.receivePrivate(11, 2, false);
    unread.reset();
    unread.receivePrivate(11, 2, false);
    expect(unread.privateCounts[2]).toBe(1);
  });
});
