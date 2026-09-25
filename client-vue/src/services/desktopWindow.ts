import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

const titleRegions = '.chat-header, .group-im-shell header, .desktop-call-header';
const interactive = 'button, a, input, textarea, select, [role="button"], [role="switch"], [contenteditable]:not([contenteditable="false"]), [data-no-drag]';

/** 标题内容可拖动，原生全屏状态控制窗口按钮的预留空间。 */
export function installDesktopWindowControls(): () => void {
  if (!isTauri()) return () => {};
  const window = getCurrentWindow();
  const root = document.documentElement;
  const unlisteners: Array<() => void> = [];
  let disposed = false;
  let fullscreen = false;
  let revision = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  async function refreshFullscreen() {
    const current = ++revision;
    try {
      const value = await window.isFullscreen();
      if (disposed || current !== revision) return;
      fullscreen = value;
      root.classList.toggle('desktop-fullscreen', value);
    } catch (error) {
      if (!disposed) console.warn('无法读取窗口全屏状态', error);
    }
  }

  function onWindowChange() {
    void refreshFullscreen();
    clearTimeout(settleTimer);
    // macOS 全屏动画结束后再次读取，避免保留过渡期间的状态。
    settleTimer = setTimeout(() => void refreshFullscreen(), 350);
  }

  function onMouseDown(event: MouseEvent) {
    if (fullscreen || event.defaultPrevented || event.button !== 0 || event.detail > 1) return;
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(titleRegions) || target.closest(interactive)) return;
    event.preventDefault();
    void window.startDragging().catch(error => console.warn('无法拖动窗口', error));
  }

  function register(pending: Promise<() => void>) {
    void pending.then(unlisten => {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    }).catch(error => {
      if (!disposed) console.warn('无法监听窗口状态', error);
    });
  }

  document.addEventListener('mousedown', onMouseDown);
  register(window.onResized(onWindowChange));
  register(window.onFocusChanged(onWindowChange));
  void refreshFullscreen();

  return () => {
    disposed = true;
    ++revision;
    clearTimeout(settleTimer);
    document.removeEventListener('mousedown', onMouseDown);
    for (const unlisten of unlisteners) unlisten();
    root.classList.remove('desktop-fullscreen');
  };
}
