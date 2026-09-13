import type { User } from '@/api/auth';
import type { OnlineUser } from '@/stores/socket';

export function mergeContactPresence(
  knownUsers: User[],
  messageSenders: User[],
  onlineUsers: OnlineUser[],
  ownUserId?: number,
): OnlineUser[] {
  const contacts = new Map<number, OnlineUser>();
  for (const user of [...knownUsers, ...messageSenders]) {
    if (user.id !== ownUserId) contacts.set(user.id, { ...user, socketId: '', status: 'offline' });
  }
  for (const user of onlineUsers) {
    if (user.id !== ownUserId) contacts.set(user.id, user);
  }
  return [...contacts.values()];
}
