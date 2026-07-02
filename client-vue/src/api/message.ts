import { http } from '@/utils/request';
import type { User } from './auth';

export interface OfflineMessage {
  id: number;
  fromUserId: number;
  toUserId: number;
  message: string;
  isRead: boolean;
  createdAt: string;
  sender: User;
}

export interface PrivateMessage extends OfflineMessage {
  receiver?: User;
}

export interface GroupHistoryMessage {
  id: number;
  groupId: number;
  userId: number;
  message: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  createdAt: string;
  sender: User;
}

export function getOfflineMessages() {
  return http.get<{ messages: OfflineMessage[] }>('/api/messages/offline');
}

export function markMessagesAsRead(messageIds: number[]) {
  return http.post<{ message: string }>('/api/messages/mark-read', { messageIds });
}

export function getUnreadCount() {
  return http.get<{ count: number }>('/api/messages/unread-count');
}

export function getPrivateMessages(contactUserId: number, limit = 50, offset = 0) {
  const query = new URLSearchParams({
    contactUserId: String(contactUserId),
    limit: String(limit),
    offset: String(offset),
  });

  return http.get<{ messages: PrivateMessage[]; hasMore: boolean }>(`/api/messages/private?${query}`);
}

export function getGroupMessages(groupId: number, limit = 50, offset = 0) {
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  return http.get<{ messages: GroupHistoryMessage[]; hasMore: boolean }>(`/api/messages/group/${groupId}?${query}`);
}
