import { describe, expect, it, vi } from 'vitest';
import { ConnectionLifecycle } from './connectionLifecycle';

describe('ConnectionLifecycle', () => {
  it('首次连接成功只提示一次，重复 authenticated 不重复提示', () => {
    const lifecycle = new ConnectionLifecycle();
    const notified = vi.fn();
    lifecycle.subscribeAuthenticated(notified);

    lifecycle.transition('connecting');
    lifecycle.transition('authenticated');
    lifecycle.transition('authenticated');

    expect(notified).toHaveBeenCalledTimes(1);
  });

  it('页面离开再返回不会回放已有连接状态', () => {
    const lifecycle = new ConnectionLifecycle();
    const firstMount = vi.fn();
    const removeFirstMount = lifecycle.subscribeAuthenticated(firstMount);

    lifecycle.transition('connecting');
    lifecycle.transition('authenticated');
    removeFirstMount();

    const secondMount = vi.fn();
    lifecycle.subscribeAuthenticated(secondMount);

    expect(firstMount).toHaveBeenCalledTimes(1);
    expect(secondMount).not.toHaveBeenCalled();
  });

  it('断线后重新连接成功可以再次提示一次', () => {
    const lifecycle = new ConnectionLifecycle();
    const notified = vi.fn();
    lifecycle.subscribeAuthenticated(notified);

    lifecycle.transition('authenticated');
    lifecycle.transition('disconnected');
    lifecycle.transition('connecting');
    lifecycle.transition('authenticated');

    expect(notified).toHaveBeenCalledTimes(2);
  });

  it('多次挂载和卸载不会累积连接监听器', () => {
    const lifecycle = new ConnectionLifecycle();

    for (let index = 0; index < 5; index += 1) {
      const unsubscribe = lifecycle.subscribeAuthenticated(vi.fn());
      expect(lifecycle.getSubscriberCount()).toBe(1);
      unsubscribe();
      expect(lifecycle.getSubscriberCount()).toBe(0);
    }
  });
});
