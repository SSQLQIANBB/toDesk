import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  connection: null as null | ((socket: any) => void),
  broadcasts: [] as { rooms: string[]; event: string; payload: any }[],
  members: vi.fn(),
  start: vi.fn(),
}));
vi.mock('socket.io', () => ({ Server: class {
  on(_event: string, callback: (socket: any) => void) { mock.connection = callback; }
  emit(event: string, payload: any) { mock.broadcasts.push({ rooms: [], event, payload }); }
  to(rooms: string[]) { return { emit: (event: string, payload: any) => mock.broadcasts.push({ rooms, event, payload }) }; }
} }));
vi.mock('../../../src/utils/jwt', () => ({ verifyToken: (token: string) => ({ userId: Number(token), username: `user${token}` }) }));
vi.mock('../../../src/services/tokenVersionService', () => ({ isTokenVersionCurrent: async () => true }));
vi.mock('../../../src/models', () => ({
  GroupMember: { findAll: mock.members },
  User: { findByPk: async () => ({ status: 'online' }), update: vi.fn() },
  GroupMessage: {}, Message: {},
}));
vi.mock('../../../src/services/groupSessionService', () => ({ GroupSessionService: class {
  start = mock.start;
  async getGroupState() { return { video: null, screen: null }; }
} }));
vi.mock('../../../src/services/redisGroupSessionStore', () => ({ RedisGroupSessionStore: class {} }));
vi.mock('../../../src/services/redisScreenAnnotationStore', () => ({ RedisScreenAnnotationStore: class {} }));
import initialMeeting from '../../../src/config/meeting';

function connect(id: number) {
  const handlers = new Map<string, Function>();
  const socket = {
    id: `socket-${id}`, on: (event: string, handler: Function) => handlers.set(event, handler),
    emit: vi.fn(), join: vi.fn(),
  };
  mock.connection!(socket);
  return { socket, handlers };
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.broadcasts.length = 0;
  mock.members.mockResolvedValue([{ userId: 1 }, { userId: 2 }]);
  mock.start.mockImplementation(async (groupId, type, owner) => ({ created: true, session: {
    groupId, type, channelId: `group:${groupId}:${type}`,
    ownerUserId: owner.id, ownerSocketId: owner.socketId, startedAt: '2026-09-12',
  } }));
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
