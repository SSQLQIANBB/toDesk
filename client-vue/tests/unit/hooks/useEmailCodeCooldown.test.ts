import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEmailCodeCooldown } from '../../../src/hooks/useEmailCodeCooldown';

const Host = defineComponent({
  setup() {
    return useEmailCodeCooldown();
  },
  template: '<div />',
});

describe('邮箱验证码倒计时', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('刷新后继续按剩余时间倒计时，并按邮箱和用途区分', async () => {
    const first = mount(Host);
    first.vm.start('register', ' Test@Example.com ');
    expect(first.vm.remaining('register', 'test@example.com')).toBe(60);
    expect(first.vm.remaining('reset', 'test@example.com')).toBe(0);
    expect(first.vm.remaining('register', 'other@example.com')).toBe(0);
    first.unmount();

    vi.advanceTimersByTime(30_000);
    const reloaded = mount(Host);
    expect(reloaded.vm.remaining('register', '')).toBe(30);
    expect(reloaded.vm.remaining('register', 'test@example.com')).toBe(30);

    vi.advanceTimersByTime(30_000);
    await nextTick();
    expect(reloaded.vm.remaining('register', 'test@example.com')).toBe(0);
    reloaded.unmount();
  });
});
