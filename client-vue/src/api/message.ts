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

/**
 * 获取离线消息
 */
export function getOfflineMessages() {
  return http.get<{ messages: OfflineMessage[] }>('/api/messages/offline');
}

/**
 * 标记消息为已读
 */
export function markMessagesAsRead(messageIds: number[]) {
  return http.post<{ message: string }>('/api/messages/mark-read', { messageIds });
}

/**
 * 获取未读消息数量
 */
export function getUnreadCount() {
  return http.get<{ count: number }>('/api/messages/unread-count');
}

