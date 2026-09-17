import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  connection: null as null | ((socket: any) => void),
  broadcasts: [] as { rooms: string[]; event: string; payload: any }[],
  members: vi.fn(),
  start: vi.fn(),
  get: vi.fn(),
  end: vi.fn(),
  messageCreate: vi.fn(),
  groupMessageCreate: vi.fn(),
  session: null as any,
}));
vi.mock('socket.io', () => ({ Server: class {
  on(_event: string, callback: (socket: any) => void) { mock.connection = callback; }
  emit(event: string, payload: any) { mock.broadcasts.push({ rooms: [], event, payload }); }
  to(rooms: string | string[]) { return { emit: (event: string, payload: any) => mock.broadcasts.push({ rooms: Array.isArray(rooms) ? rooms : [rooms], event, payload }) }; }
} }));
vi.mock('../../../src/utils/jwt', () => ({ verifyToken: (token: string) => ({ userId: Number(token), username: `user${token}` }) }));
vi.mock('../../../src/services/tokenVersionService', () => ({ isTokenVersionCurrent: async () => true }));
vi.mock('../../../src/models', () => ({
  GroupMember: { findAll: mock.members },
  User: { findByPk: async () => ({ status: 'online' }), update: vi.fn() },
  GroupMessage: { create: mock.groupMessageCreate },
  Message: { create: mock.messageCreate },
}));
vi.mock('../../../src/services/groupSessionService', () => ({ GroupSessionService: class {
  start = mock.start;
  get = mock.get;
  end = mock.end;
  async getGroupState() { return { video: null, audio: null, screen: null }; }
} }));
vi.mock('../../../src/services/redisGroupSessionStore', () => ({ RedisGroupSessionStore: class {} }));
vi.mock('../../../src/services/redisScreenAnnotationStore', () => ({ RedisScreenAnnotationStore: class {} }));
import initialMeeting from '../../../src/config/meeting';

function connect(id: number) {
  const handlers = new Map<string, Function>();
  const socket = {
    id: `socket-${id}`, on: (event: string, handler: Function) => handlers.set(event, handler),
    emit: vi.fn(), join: vi.fn(),
    to: (rooms: string | string[]) => ({
      emit: (event: string, payload: any) => mock.broadcasts.push({
        rooms: Array.isArray(rooms) ? rooms : [rooms],
        event,
        payload,
      }),
    }),
  };
  mock.connection!(socket);
  return { socket, handlers };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.broadcasts.length = 0;
  mock.members.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);
  mock.start.mockImplementation(async (groupId, type, owner) => {
    mock.session = {
      groupId,
      type,
      channelId: `group:${groupId}:${type}`,
      ownerUserId: owner.id,
      ownerSocketId: owner.socketId,
      startedAt: new Date(10_000).toISOString(),
    };
    return { created: true, session: mock.session };
  });
  mock.get.mockImplementation(async () => mock.session);
  mock.end.mockResolvedValue(true);
  mock.messageCreate.mockImplementation(async input => ({
    id: 99,
    ...input,
    createdAt: new Date('2026-09-17T12:00:00Z'),
    toJSON: () => ({ id: 99, ...input, createdAt: '2026-09-17T12:00:00.000Z' }),
  }));
  mock.groupMessageCreate.mockImplementation(async input => ({
    id: 100,
    ...input,
    createdAt: new Date('2026-09-17T12:00:00Z'),
    toJSON: () => ({ id: 100, ...input, createdAt: '2026-09-17T12:00:00.000Z' }),
  }));
});

describe('私聊通话历史', () => {
  it('从双方实际接通开始计时，并在挂断后同步给双方', async () => {
    initialMeeting({} as any);
    const alice = connect(1);
    const bob = connect(2);
    await alice.handlers.get('authenticate')!({ token: '1' });
    await bob.handlers.get('authenticate')!({ token: '2' });

    alice.handlers.get('webrtc_call_request')!({ to: { socketId: 'socket-2' }, deviceType: 0 });
    await bob.handlers.get('webrtc_call_response')!({ to: { socketId: 'socket-1' }, accepted: true });

    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    alice.handlers.get('webrtc_call_connected')!({ to: { socketId: 'socket-2' } });
    now.mockReturnValue(75_000);
    await bob.handlers.get('webrtc_hangup')!({ to: { socketId: 'socket-1' } });
    now.mockRestore();

    expect(mock.messageCreate).toHaveBeenCalledWith(expect.objectContaining({
      fromUserId: 1,
      toUserId: 2,
      message: '__TODESK_CALL_HISTORY__:{"type":"video","status":"completed","durationSeconds":65}',
      isRead: true,
    }));
    expect(mock.broadcasts).toContainEqual({
      rooms: ['socket-1', 'socket-2'],
      event: 'private_call_history',
      payload: expect.objectContaining({
        id: 99,
        message: '[视频通话] 通话时长 01:05',
        messageType: 'call',
        call: { type: 'video', status: 'completed', durationSeconds: 65 },
      }),
    });
  });
});

describe('群组邀请发送范围', () => {
  it.each([1, 2])('deviceType=%s 时未加入群组 Socket 房间的在线成员也收到邀请', async deviceType => {
    initialMeeting({} as any);
    const alice = connect(1);
    const bob = connect(2);
    const outsider = connect(3);
    await alice.handlers.get('authenticate')!({ token: '1' });
    await bob.handlers.get('authenticate')!({ token: '2' });
    await outsider.handlers.get('authenticate')!({ token: '3' });
    await alice.handlers.get('group_call_start')!({ groupId: 7, deviceType });
    expect(bob.socket.join).not.toHaveBeenCalled();
    expect(mock.members).toHaveBeenCalledWith({ where: { groupId: 7 } });
    expect(mock.broadcasts).toContainEqual({
      rooms: ['socket-1', 'socket-2'], event: 'group_call_started',
      payload: expect.objectContaining({ groupId: 7, deviceType }),
    });
    expect(mock.broadcasts.find(item => item.event === 'group_call_started')!.rooms).not.toContain('socket-3');
  });
});

describe('群组通话历史', () => {
  it('群组视频结束后保存发起人和会话时长', async () => {
    initialMeeting({} as any);
    const alice = connect(11);
    await alice.handlers.get('authenticate')!({ token: '11' });
    await alice.handlers.get('group_call_start')!({ groupId: 7, deviceType: 1 });

    const now = vi.spyOn(Date, 'now').mockReturnValue(75_000);
    await alice.handlers.get('group_call_end')!({ groupId: 7, deviceType: 1 });
    now.mockRestore();

    expect(mock.groupMessageCreate).toHaveBeenCalledWith(expect.objectContaining({
      groupId: 7,
      userId: 11,
      message: '__TODESK_CALL_HISTORY__:{"type":"video","status":"completed","durationSeconds":65}',
      messageType: 'system',
    }));
    expect(mock.broadcasts).toContainEqual({
      rooms: ['group_7'],
      event: 'group_message',
      payload: expect.objectContaining({
        id: 100,
        message: '[视频通话] 通话时长 01:05',
        messageType: 'call',
        call: { type: 'video', status: 'completed', durationSeconds: 65 },
      }),
    });
  });
});

describe('在线状态增量同步', () => {
  it('只向新连接发送全量快照，后续只广播变化', async () => {
    initialMeeting({} as any);
    const alice = connect(101);
    const bob = connect(102);
    await alice.handlers.get('authenticate')!({ token: '101' });
    await bob.handlers.get('authenticate')!({ token: '102' });

    expect(bob.socket.emit).toHaveBeenCalledWith('user_list', expect.arrayContaining([
      expect.objectContaining({ id: 101 }), expect.objectContaining({ id: 102 }),
    ]));
    expect(mock.broadcasts.filter(item => item.event === 'user_list')).toHaveLength(0);
    expect(mock.broadcasts.filter(item => item.event === 'user_presence')).toHaveLength(2);

    await bob.handlers.get('status_update')!({ status: 'busy' });
    await bob.handlers.get('status_update')!({ status: 'busy' });
    expect(mock.broadcasts.filter(item => item.event === 'user_presence' && item.payload.userId === 102)).toHaveLength(2);

    await bob.handlers.get('disconnect')!();
    expect(mock.broadcasts.at(-1)).toEqual({ rooms: [], event: 'user_presence', payload: { userId: 102 } });
  });

  it('同一用户的一个设备断开后仍显示另一个在线设备', async () => {
    initialMeeting({} as any);
    const first = connect(103);
    const second = connect(104);
    await first.handlers.get('authenticate')!({ token: '103' });
    await second.handlers.get('authenticate')!({ token: '103' });
    await second.handlers.get('disconnect')!();

    expect(mock.broadcasts.at(-1)).toEqual({
      rooms: [], event: 'user_presence',
      payload: { userId: 103, user: expect.objectContaining({ socketId: 'socket-103' }) },
    });
  });
});
