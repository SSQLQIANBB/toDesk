import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/stores/auth';
import {
  groupSessionState,
  type GroupSession,
  type GroupSessionType,
} from './groupSessionState';
import { ConnectionLifecycle } from './connectionLifecycle';

type PresenceStatus = 'online' | 'offline' | 'busy';

let socket: Socket | null = null;
const joinedGroups = new Set<number>();
const connectionLifecycle = new ConnectionLifecycle();

function rejoinGroups() {
  for (const groupId of joinedGroups) {
    socket?.emit('join_group', { groupId });
  }
}

function authenticate() {
  const { currentUser, token } = useAuth();

  if (!token.value) return;

  socket?.emit('authenticate', {
    token: token.value,
    nickname: currentUser.value?.nickname,
    avatar: currentUser.value?.avatar,
  });
}

function bindSharedEvents(target: Socket) {
  const handleAuthenticated = () => rejoinGroups();
  const handleState = (data: {
    groupId: number;
    sessions: { video: GroupSession | null; screen: GroupSession | null };
  }) => {
    groupSessionState.applySnapshot(data.groupId, data.sessions);
  };
  const handleStarted = (data: GroupSession & { deviceType?: number }) => {
    const type: GroupSessionType = data.type || (data.deviceType === 2 ? 'screen' : 'video');
    groupSessionState.applyStarted({ ...data, type });
  };
  const handleEnded = (data: { groupId: number; type?: GroupSessionType; deviceType?: number }) => {
    const type: GroupSessionType = data.type || (data.deviceType === 2 ? 'screen' : 'video');
    groupSessionState.applyEnded(data.groupId, type);
  };

  target.on('connect', () => {
    connectionLifecycle.transition('connecting');
  });
  target.on('authenticated', () => {
    connectionLifecycle.transition('authenticated');
    handleAuthenticated();
  });
  target.on('disconnect', () => {
    connectionLifecycle.transition('disconnected');
  });
  target.on('group_call_state', handleState);
  target.on('group_call_started', handleStarted);
  target.on('group_call_ended', handleEnded);
}

export function getMeetingSocket() {
  return socket;
}

export function connectMeetingSocket() {
  if (socket?.connected) {
    return socket;
  }

  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      path: '/meeting',
    });
    bindSharedEvents(socket);
  }

  socket.off('connect', authenticate);
  socket.on('connect', authenticate);

  return socket;
}

export function disconnectMeetingSocket() {
  socket?.disconnect();
  socket = null;
  connectionLifecycle.transition('disconnected');
  joinedGroups.clear();
}

export function updateMeetingStatus(status: PresenceStatus) {
  connectMeetingSocket().emit('status_update', { status });
}

export function joinMeetingGroup(groupId: number) {
  joinedGroups.add(groupId);
  const target = connectMeetingSocket();
  if (target.connected) {
    target.emit('join_group', { groupId });
  }
  return target;
}

export function leaveMeetingGroup(groupId: number) {
  joinedGroups.delete(groupId);
  socket?.emit('leave_group', { groupId });
}

export function onMeetingAuthenticated(handler: () => void) {
  const target = connectMeetingSocket();
  target.on('authenticated', handler);
  if (connectionLifecycle.getStatus() === 'authenticated') queueMicrotask(handler);
  return () => target.off('authenticated', handler);
}

export function subscribeMeetingAuthenticated(handler: () => void) {
  connectMeetingSocket();
  return connectionLifecycle.subscribeAuthenticated(handler);
}

export function getMeetingConnectionStatus() {
  return connectionLifecycle.getStatus();
}
