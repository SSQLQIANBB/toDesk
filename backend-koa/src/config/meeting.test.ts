import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  connection: null as null | ((socket: any) => void),
  broadcasts: [] as { rooms: string[]; event: string; payload: any }[],
  members: vi.fn(),
  start: vi.fn(),
}));
vi.mock('socket.io', () => ({ Server: class {
  on(_event: string, callback: (socket: any) => void) { mock.connection = callback; }
  emit() {}
  to(rooms: string[]) { return { emit: (event: string, payload: any) => mock.broadcasts.push({ rooms, event, payload }) }; }
} }));
vi.mock('../utils/jwt', () => ({ verifyToken: (token: string) => ({ userId: Number(token), username: `user${token}` }) }));
vi.mock('../models', () => ({
  GroupMember: { findAll: mock.members },
  User: { findByPk: async () => ({ status: 'online' }) },
  GroupMessage: {}, Message: {},
}));
vi.mock('../services/groupSessionService', () => ({ GroupSessionService: class {
  start = mock.start;
  async getGroupState() { return { video: null, screen: null }; }
} }));
vi.mock('../services/redisGroupSessionStore', () => ({ RedisGroupSessionStore: class {} }));
vi.mock('../services/redisScreenAnnotationStore', () => ({ RedisScreenAnnotationStore: class {} }));
import initialMeeting from './meeting';

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
    expect(mock.broadcasts[0]!.rooms).not.toContain('socket-3');
  });
});
