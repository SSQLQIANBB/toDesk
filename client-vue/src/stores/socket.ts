import { ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { io, type Socket } from 'socket.io-client';
import type { User } from '@/api/auth';
import {
  groupSessionState,
  type GroupSession,
  type GroupSessionType,
} from '@/services/groupSessionState';
import { refreshAccessToken } from '@/utils/request';
import { useAuthStore } from './auth';
import { pinia } from '@/stores';

export type PresenceStatus = 'online' | 'offline' | 'busy';
export type OnlineUser = User & { socketId: string };

type GroupSessionEvent = Omit<GroupSession, 'type'> & {
  type?: GroupSessionType;
  deviceType?: number;
};

export const useSocketStore = defineStore('socket', () => {
  const socket = shallowRef<Socket | null>(null);
  const connected = ref(false);
  const authenticated = ref(false);
  const userList = ref<OnlineUser[]>([]);
  const joinedGroupIds = new Set<number>();

  let credentials: { token: string; user: User } | null = null;

  function authenticate() {
    if (!socket.value?.connected || !credentials) return;

    socket.value.emit('authenticate', {
      token: credentials.token,
      nickname: credentials.user.nickname,
      avatar: credentials.user.avatar,
    });
  }

  function handleConnect() {
    connected.value = true;
    authenticated.value = false;
    authenticate();
  }

  function handleDisconnect() {
    connected.value = false;
    authenticated.value = false;
    userList.value = [];
  }

  function handleAuthenticated() {
    authenticated.value = true;
    joinedGroupIds.forEach(groupId => {
      socket.value?.emit('join_group', { groupId });
    });
  }

  async function handleAuthError() {
    const authStore = useAuthStore(pinia);
    const res = await refreshAccessToken();

    if (!res) {
      await authStore.logout({ callApi: false, navigate: true });
    }
    authenticated.value = false;
    userList.value = [];
  }

  function handleUserList(users: OnlineUser[]) {
    userList.value = users.filter(user => (
      user.id !== credentials?.user.id && user.socketId !== socket.value?.id
    ));
  }

  function resolveSessionType(data: { type?: GroupSessionType; deviceType?: number }) {
    return data.type || (data.deviceType === 2 ? 'screen' : 'video');
  }

  function handleGroupCallState(data: {
    groupId: number;
    sessions: { video: GroupSession | null; screen: GroupSession | null };
  }) {
    groupSessionState.applySnapshot(data.groupId, data.sessions);
  }

  function handleGroupCallStarted(data: GroupSessionEvent) {
    groupSessionState.applyStarted({
      ...data,
      type: resolveSessionType(data),
    });
  }

  function handleGroupCallEnded(data: {
    groupId: number;
    type?: GroupSessionType;
    deviceType?: number;
  }) {
    groupSessionState.applyEnded(data.groupId, resolveSessionType(data));
  }

  function bindEvents(target: Socket) {
    target.on('connect', handleConnect);
    target.on('disconnect', handleDisconnect);
    target.on('authenticated', handleAuthenticated);
    target.on('auth_error', handleAuthError);
    target.on('user_list', handleUserList);
    target.on('group_call_state', handleGroupCallState);
    target.on('group_call_started', handleGroupCallStarted);
    target.on('group_call_ended', handleGroupCallEnded);
  }

  function unbindEvents(target: Socket) {
    target.off('connect', handleConnect);
    target.off('disconnect', handleDisconnect);
    target.off('authenticated', handleAuthenticated);
    target.off('auth_error', handleAuthError);
    target.off('user_list', handleUserList);
    target.off('group_call_state', handleGroupCallState);
    target.off('group_call_started', handleGroupCallStarted);
    target.off('group_call_ended', handleGroupCallEnded);
  }

  function connect(token: string, user: User) {
    console.log('【socket】---------connect', token, user)
    credentials = { token, user };

    if (!socket.value) {
      const target = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
        path: '/meeting',
        autoConnect: false,
      });

      socket.value = target;

      bindEvents(target);
      target.connect();
    } else if (!socket.value.connected) {
      socket.value.connect();
    } else {
      authenticate();
    }

    return socket.value;
  }

  function disconnect() {
    if (socket.value) {
      unbindEvents(socket.value);
      socket.value.disconnect();
    }

    socket.value = null;
    credentials = null;
    connected.value = false;
    authenticated.value = false;
    userList.value = [];
    joinedGroupIds.clear();
  }

  function joinGroup(groupId: number) {
    joinedGroupIds.add(groupId);
    if (authenticated.value) socket.value?.emit('join_group', { groupId });
  }

  function leaveGroup(groupId: number) {
    joinedGroupIds.delete(groupId);
    if (authenticated.value) socket.value?.emit('leave_group', { groupId });
  }

  function updateStatus(status: PresenceStatus) {
    if (authenticated.value) socket.value?.emit('status_update', { status });
  }

  return {
    socket,
    connected,
    authenticated,
    userList,
    connect,
    disconnect,
    joinGroup,
    leaveGroup,
    updateStatus,
  };
});
