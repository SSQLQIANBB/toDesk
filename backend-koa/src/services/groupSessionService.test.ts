import { describe, expect, it } from 'vitest';
import {
  GroupSessionService,
  type GroupSession,
  type GroupSessionStore,
} from './groupSessionService';

class MemorySessionStore implements GroupSessionStore {
  private readonly sessions = new Map<string, GroupSession>();

  async create(key: string, session: GroupSession) {
    if (this.sessions.has(key)) return false;
    this.sessions.set(key, session);
    return true;
  }

  async get(key: string) {
    return this.sessions.get(key) ?? null;
  }

  async delete(key: string) {
    return this.sessions.delete(key);
  }
}

describe('GroupSessionService', () => {
  it('让第二名成员使用与发起者相同的群组视频频道', async () => {
    const service = new GroupSessionService(new MemorySessionStore());

    const started = await service.start(7, 'video', { id: 1, socketId: 'socket-a' });
    const joined = await service.start(7, 'video', { id: 2, socketId: 'socket-b' });

    expect(started.session.channelId).toBe('group:7:video');
    expect(joined.created).toBe(false);
    expect(joined.session.channelId).toBe(started.session.channelId);
    expect(joined.session.ownerUserId).toBe(1);
  });

  it('同时保存视频和屏幕共享状态供后进入成员恢复', async () => {
    const service = new GroupSessionService(new MemorySessionStore());

    await service.start(7, 'video', { id: 1, socketId: 'socket-a' });
    await service.start(7, 'screen', { id: 2, socketId: 'socket-b' });

    await expect(service.getGroupState(7)).resolves.toMatchObject({
      video: { channelId: 'group:7:video', ownerUserId: 1 },
      screen: { channelId: 'group:7:screen', ownerUserId: 2 },
    });
  });

  it('非发起者离开不会结束会话，发起者结束后状态恢复为空', async () => {
    const service = new GroupSessionService(new MemorySessionStore());
    await service.start(7, 'video', { id: 1, socketId: 'socket-a' });

    await expect(service.end(7, 'video', 2)).resolves.toBe(false);
    await expect(service.getGroupState(7)).resolves.toMatchObject({
      video: { ownerUserId: 1 },
    });

    await expect(service.end(7, 'video', 1)).resolves.toBe(true);
    await expect(service.getGroupState(7)).resolves.toEqual({
      video: null,
      screen: null,
    });
  });
});
