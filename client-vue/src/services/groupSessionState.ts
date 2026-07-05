import { reactive } from 'vue';

export type GroupSessionType = 'video' | 'screen';

export type GroupSession = {
  groupId: number;
  type: GroupSessionType;
  channelId: string;
  ownerUserId: number;
  ownerSocketId: string;
  startedAt: string;
};

export type GroupSessionSnapshot = {
  video: GroupSession | null;
  screen: GroupSession | null;
};

function getKey(groupId: number, type: GroupSessionType) {
  return `${groupId}:${type}`;
}

export function createGroupSessionState() {
  const sessions = reactive(new Map<string, GroupSession>());

  function applySnapshot(groupId: number, snapshot: GroupSessionSnapshot) {
    for (const type of ['video', 'screen'] as const) {
      const session = snapshot[type];
      if (session) {
        sessions.set(getKey(groupId, type), session);
      } else {
        sessions.delete(getKey(groupId, type));
      }
    }
  }

  function applyStarted(session: GroupSession) {
    sessions.set(getKey(session.groupId, session.type), session);
  }

  function applyEnded(groupId: number, type: GroupSessionType) {
    sessions.delete(getKey(groupId, type));
  }

  function getSession(groupId: number, type: GroupSessionType) {
    return sessions.get(getKey(groupId, type)) || null;
  }

  function getButtonLabel(groupId: number, type: GroupSessionType) {
    if (getSession(groupId, type)) {
      return type === 'video' ? '进入视频' : '进入共享';
    }
    return type === 'video' ? '发起视频通话' : '发起屏幕共享';
  }

  function clearGroup(groupId: number) {
    sessions.delete(getKey(groupId, 'video'));
    sessions.delete(getKey(groupId, 'screen'));
  }

  return {
    sessions,
    applySnapshot,
    applyStarted,
    applyEnded,
    getSession,
    getButtonLabel,
    clearGroup,
  };
}

export const groupSessionState = createGroupSessionState();
