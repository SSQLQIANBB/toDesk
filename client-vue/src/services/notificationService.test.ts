import { beforeEach, describe, expect, it, vi } from 'vitest';

const created: { title: string; options: NotificationOptions }[] = [];
const sounds: { src: string }[] = [];
const play = vi.fn().mockResolvedValue(undefined);
const askPermission = vi.fn();

class BrowserNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = askPermission;
  onclick: ((event: Event) => void) | null = null;
  constructor(title: string, options: NotificationOptions) { created.push({ title, options }); }
  close() {}
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  created.length = 0;
  sounds.length = 0;
  BrowserNotification.permission = 'granted';
  vi.stubGlobal('Notification', BrowserNotification);
  vi.stubGlobal('Audio', class {
    src = ''; volume = 0; currentTime = 0; play = play;
    constructor() { sounds.push(this); }
  });
});

describe('通知设置', () => {
  it('通知类型、消息预览和声音设置控制实际发送结果', async () => {
    const { default: service } = await import('./notificationService');
    expect(atob(sounds[0]!.src.split(',')[1]!).slice(0, 4)).toBe('RIFF');
    service.updatePreferences({ notifyPrivateMessage: false, messagePreview: false });
    expect(await service.showMessage('小明', '秘密内容')).toBe(false);
    expect(created).toHaveLength(0);
    expect(play).not.toHaveBeenCalled();

    service.updatePreferences({ notifyPrivateMessage: true, notifyGroupMessage: false });
    expect(await service.showMessage('小明', '秘密内容')).toBe(true);
    expect(created[0]?.options.body).toBe('收到一条私聊消息');
    expect(play).toHaveBeenCalledOnce();
    expect(await service.showGroupMessage('测试群', '小红', '群内秘密')).toBe(false);
    expect(created).toHaveLength(1);

    service.disableSound();
    service.updatePreferences({ notifyGroupMessage: true });
    expect(await service.showGroupMessage('测试群', '小红', '群内秘密')).toBe(true);
    expect(created[1]?.options.body).toBe('收到一条群组消息');
    expect(play).toHaveBeenCalledOnce();

    service.updatePreferences({ notifyCall: false, notifyInvitation: false });
    expect(await service.showCall('小明', 'video')).toBe(false);
    expect(await service.showInvitation('测试群', '小红')).toBe(false);
    service.playAlert('call');
    service.playAlert('invitation');
    expect(created).toHaveLength(2);
    expect(play).toHaveBeenCalledOnce();
  });

  it('未授权时不自动请求权限，测试通知只在真正创建后返回成功', async () => {
    BrowserNotification.permission = 'default';
    askPermission.mockImplementation(async () => { BrowserNotification.permission = 'granted'; return 'granted'; });
    const { default: service } = await import('./notificationService');
    expect(await service.showSystem('测试通知', '检查通知')).toBe(false);
    expect(askPermission).not.toHaveBeenCalled();
    expect(await service.requestPermission()).toBe(true);
    expect(await service.showSystem('测试通知', '检查通知')).toBe(true);
    expect(created[0]).toMatchObject({ title: '测试通知', options: { body: '检查通知' } });

    service.disable();
    expect(await service.showSystem('测试通知', '检查通知')).toBe(false);
    expect(created).toHaveLength(1);
  });
});
