import { describe, expect, it } from 'vitest';
import { getRemoteTabQuery, parseRemoteTab } from './remoteTabState';

describe('remoteTabState', () => {
  it('直接访问 Remote 页面时使用在线用户默认 Tab', () => {
    expect(parseRemoteTab(undefined)).toBe('users');
    expect(parseRemoteTab('users')).toBe('users');
  });

  it('从路由参数恢复我的群组 Tab', () => {
    expect(parseRemoteTab('groups')).toBe('groups');
  });

  it('非法或多值参数回退到在线用户', () => {
    expect(parseRemoteTab('invalid')).toBe('users');
    expect(parseRemoteTab(['groups', 'users'])).toBe('users');
  });

  it('默认 Tab 不产生临时参数，群组 Tab 使用短期路由参数', () => {
    expect(getRemoteTabQuery('users')).toEqual({});
    expect(getRemoteTabQuery('groups')).toEqual({ tab: 'groups' });
  });
});
