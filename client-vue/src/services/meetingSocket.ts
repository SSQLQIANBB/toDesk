import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/stores/auth';

type PresenceStatus = 'online' | 'offline' | 'busy';

let socket: Socket | null = null;

function authenticate() {
  const { currentUser, token } = useAuth();

  if (!token.value) return;

  socket?.emit('authenticate', {
    token: token.value,
    nickname: currentUser.value?.nickname,
    avatar: currentUser.value?.avatar,
  });
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
  }

  socket.off('connect', authenticate);
  socket.on('connect', authenticate);

  if (socket.connected) {
    authenticate();
  }

  return socket;
}

export function disconnectMeetingSocket() {
  socket?.disconnect();
  socket = null;
}

export function updateMeetingStatus(status: PresenceStatus) {
  connectMeetingSocket().emit('status_update', { status });
}
