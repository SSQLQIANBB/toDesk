import { describe, expect, it, vi } from 'vitest';
import { RemotePeerRegistry } from './remotePeerRegistry';

function member(socketId = 'socket-a') {
  return { id: 2, socketId, username: 'member-2', nickname: '成员二' };
}

describe('RemotePeerRegistry', () => {
  it('同一远端成员的加入、发布或订阅事件触发多次时只保留一个窗口', () => {
    const createConnection = vi.fn(() => ({ close: vi.fn() }));
    const registry = new RemotePeerRegistry(createConnection);

    registry.upsert(member());
    registry.upsert(member());
    registry.upsert(member());

    expect(registry.values()).toHaveLength(1);
    expect(createConnection).toHaveBeenCalledTimes(1);
  });

  it('用户断线重连后替换旧连接而不增加窗口', () => {
    const oldConnection = { close: vi.fn() };
    const newConnection = { close: vi.fn() };
    const createConnection = vi
      .fn()
      .mockReturnValueOnce(oldConnection)
      .mockReturnValueOnce(newConnection);
    const registry = new RemotePeerRegistry(createConnection);

    registry.upsert(member('socket-old'));
    registry.upsert(member('socket-new'));

    expect(oldConnection.close).toHaveBeenCalledOnce();
    expect(registry.values()).toHaveLength(1);
    expect(registry.get(2)?.socketId).toBe('socket-new');
  });

  it('重连后迟到的旧 socket 离开事件不会删除新窗口', () => {
    const registry = new RemotePeerRegistry(() => ({ close: vi.fn() }));
    registry.upsert(member('socket-old'));
    registry.upsert(member('socket-new'));

    registry.remove(2, 'socket-old');

    expect(registry.values()).toHaveLength(1);
    expect(registry.get(2)?.socketId).toBe('socket-new');
  });

  it('用户退出后关闭连接并删除对应视频窗口', () => {
    const connection = { close: vi.fn() };
    const registry = new RemotePeerRegistry(() => connection);
    registry.upsert(member());

    registry.remove(2);

    expect(connection.close).toHaveBeenCalledOnce();
    expect(registry.values()).toEqual([]);
  });

  it('无论视频元素或远端流谁先到达都能正确绑定 srcObject', () => {
    const registry = new RemotePeerRegistry(() => ({ close: vi.fn() }));
    const firstVideo = document.createElement('video');
    const firstStream = { id: 'stream-first' } as MediaStream;
    registry.upsert(member());
    registry.setStream(2, firstStream);
    registry.bindVideo(2, firstVideo);
    expect(firstVideo.srcObject).toBe(firstStream);

    const secondVideo = document.createElement('video');
    const secondStream = { id: 'stream-second' } as MediaStream;
    registry.upsert({ ...member(), id: 3, socketId: 'socket-b' });
    registry.bindVideo(3, secondVideo);
    registry.setStream(3, secondStream);
    expect(secondVideo.srcObject).toBe(secondStream);
  });
});
