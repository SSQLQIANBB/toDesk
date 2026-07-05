export type GroupSessionType = 'video' | 'screen';

export type GroupSessionOwner = {
  id: number;
  socketId: string;
};

export type GroupSession = {
  groupId: number;
  type: GroupSessionType;
  channelId: string;
  ownerUserId: number;
  ownerSocketId: string;
  startedAt: string;
};

export type GroupSessionState = {
  video: GroupSession | null;
  screen: GroupSession | null;
};

export interface GroupSessionStore {
  create(key: string, session: GroupSession): Promise<boolean>;
  get(key: string): Promise<GroupSession | null>;
  delete(key: string): Promise<boolean>;
}

export class GroupSessionService {
  constructor(private readonly store: GroupSessionStore) {}

  private getKey(groupId: number, type: GroupSessionType) {
    return `group:session:${groupId}:${type}`;
  }

  private getChannelId(groupId: number, type: GroupSessionType) {
    return `group:${groupId}:${type}`;
  }

  async start(groupId: number, type: GroupSessionType, owner: GroupSessionOwner) {
    const key = this.getKey(groupId, type);
    const session: GroupSession = {
      groupId,
      type,
      channelId: this.getChannelId(groupId, type),
      ownerUserId: owner.id,
      ownerSocketId: owner.socketId,
      startedAt: new Date().toISOString(),
    };

    // Redis 的 NX 写入保证多人同时点击时仍只创建一个群组会话。
    const created = await this.store.create(key, session);
    if (created) return { created, session };

    const existing = await this.store.get(key);
    return { created: false, session: existing || session };
  }

  async get(groupId: number, type: GroupSessionType) {
    return this.store.get(this.getKey(groupId, type));
  }

  async getGroupState(groupId: number): Promise<GroupSessionState> {
    const [video, screen] = await Promise.all([
      this.get(groupId, 'video'),
      this.get(groupId, 'screen'),
    ]);
    return { video, screen };
  }

  async end(groupId: number, type: GroupSessionType, userId: number) {
    const key = this.getKey(groupId, type);
    const session = await this.store.get(key);
    if (!session || session.ownerUserId !== userId) return false;
    return this.store.delete(key);
  }
}
