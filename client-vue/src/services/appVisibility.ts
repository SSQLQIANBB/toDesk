import { isTauri } from '@tauri-apps/api/core';

export function isAppInBackground(): boolean {
  // Windows 窗口被其他应用遮挡时未必触发 visibilitychange，也不应把消息标为已读。
  return document.hidden || (isTauri() && !document.hasFocus());
}
