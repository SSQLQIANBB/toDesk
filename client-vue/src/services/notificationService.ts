/**
 * 通知服务 - 管理桌面通知、声音提醒等
 */

export type NotificationType = 'private' | 'group' | 'call' | 'invitation' | 'system';
export type NotificationPreferences = {
  messagePreview: boolean;
  notifyPrivateMessage: boolean;
  notifyGroupMessage: boolean;
  notifyCall: boolean;
  notifyInvitation: boolean;
};

const defaultPreferences: NotificationPreferences = {
  messagePreview: true,
  notifyPrivateMessage: true,
  notifyGroupMessage: true,
  notifyCall: true,
  notifyInvitation: true,
};

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  type?: NotificationType;
  onClick?: () => void;
  silent?: boolean; // 是否静音
}

class NotificationService {
  private permission: NotificationPermission = 'default';
  private enabled: boolean = true;
  private soundEnabled: boolean = true;
  private notificationSound: HTMLAudioElement | null = null;
  private preferences: NotificationPreferences = { ...defaultPreferences };

  constructor() {
    this.init();
  }

  /**
   * 初始化通知服务
   */
  async init() {
    // 检查浏览器是否支持通知
    this.permission = 'Notification' in window ? Notification.permission : 'denied';

    // 从 localStorage 读取用户设置
    const savedEnabled = localStorage.getItem('notification_enabled');
    const savedSoundEnabled = localStorage.getItem('notification_sound_enabled');

    if (savedEnabled !== null) {
      this.enabled = savedEnabled === 'true';
    }

    if (savedSoundEnabled !== null) {
      this.soundEnabled = savedSoundEnabled === 'true';
    }

    try {
      const saved = JSON.parse(localStorage.getItem('notify_settings') || '{}');
      for (const key of Object.keys(defaultPreferences) as (keyof NotificationPreferences)[]) {
        if (typeof saved[key] === 'boolean') this.preferences[key] = saved[key];
      }
    } catch (error) {
      console.warn('通知设置格式无效，使用默认值:', error);
    }

    // 初始化音频
    this.initAudio();
  }

  /** 创建可播放的短提示音；原来的固定 data URL 并不是完整的 WAV 文件。 */
  private initAudio() {
    try {
      this.notificationSound = new Audio();
      const sampleRate = 8000;
      const sampleCount = 1600;
      const bytes = new Uint8Array(44 + sampleCount * 2);
      const view = new DataView(bytes.buffer);
      const label = (offset: number, value: string) => {
        for (let index = 0; index < value.length; index++) bytes[offset + index] = value.charCodeAt(index);
      };
      label(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true);
      label(8, 'WAVE'); label(12, 'fmt ');
      view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      label(36, 'data'); view.setUint32(40, sampleCount * 2, true);
      for (let index = 0; index < sampleCount; index++) {
        const seconds = index / sampleRate;
        const amplitude = Math.sin(2 * Math.PI * 800 * seconds) * Math.exp(-seconds * 18);
        view.setInt16(44 + index * 2, Math.round(amplitude * 11000), true);
      }
      this.notificationSound.src = `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
      this.notificationSound.volume = 0.5;
    } catch (error) {
      console.warn('音频初始化失败:', error);
    }
  }

  /**
   * 请求通知权限
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      return false;
    }

    this.permission = Notification.permission;
    if (this.permission === 'granted') {
      return true;
    }

    try {
      this.permission = await Notification.requestPermission();
      return this.permission === 'granted';
    } catch (error) {
      console.error('请求通知权限失败:', error);
      return false;
    }
  }

  /**
   * 显示通知
   */
  async show(options: NotificationOptions): Promise<boolean> {
    if (!this.shouldNotify(options.type || 'system')) return false;
    this.playAlert(options.type || 'system', options.silent);
    if (!this.enabled || this.getPermission() !== 'granted') return false;

    // 创建通知
    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        tag: options.tag,
        requireInteraction: false, // 自动关闭
        silent: true, // 统一使用可由声音开关控制的应用提示音
      });

      // 点击通知时的回调
      if (options.onClick) {
        notification.onclick = (event) => {
          event.preventDefault();
          window.focus(); // 聚焦窗口
          options.onClick?.();
          notification.close();
        };
      }

      // 3秒后自动关闭
      setTimeout(() => {
        notification.close();
      }, 5000);
      return true;
    } catch (error) {
      console.error('显示通知失败:', error);
      return false;
    }
  }

  getPreferences(): NotificationPreferences { return { ...this.preferences }; }

  updatePreferences(value: Partial<NotificationPreferences>) {
    this.preferences = { ...this.preferences, ...value };
    localStorage.setItem('notify_settings', JSON.stringify(this.preferences));
  }

  shouldNotify(type: NotificationType): boolean {
    const keys: Partial<Record<NotificationType, keyof NotificationPreferences>> = {
      private: 'notifyPrivateMessage', group: 'notifyGroupMessage',
      call: 'notifyCall', invitation: 'notifyInvitation',
    };
    const key = keys[type];
    return key ? this.preferences[key] : true;
  }

  previewMessage(message: string, type: 'private' | 'group'): string {
    return this.preferences.messagePreview ? message : type === 'private' ? '收到一条私聊消息' : '收到一条群组消息';
  }

  playAlert(type: NotificationType, silent = false) {
    if (!silent && this.shouldNotify(type)) this.playSound(type);
  }

  /**
   * 播放提示音
   */
  private playSound(type?: NotificationType) {
    if (!this.soundEnabled || !this.notificationSound) {
      return;
    }

    try {
      // 重置音频
      this.notificationSound.currentTime = 0;
      
      // 根据不同类型调整音量和音调（可选）
      switch (type) {
        case 'call':
          this.notificationSound.volume = 0.7;
          break;
        case 'invitation':
          this.notificationSound.volume = 0.6;
          break;
        case 'system':
          this.notificationSound.volume = 0.4;
          break;
        default:
          this.notificationSound.volume = 0.5;
      }

      // 播放音频
      this.notificationSound.play().catch(error => {
        console.warn('播放提示音失败:', error);
      });
    } catch (error) {
      console.warn('播放提示音失败:', error);
    }
  }

  /**
   * 显示消息通知
   */
  async showMessage(from: string, message: string, avatar?: string, onClick?: () => void) {
    return this.show({
      title: `新消息 - ${from}`,
      body: this.previewMessage(message, 'private'),
      icon: avatar,
      tag: `message-${from}`,
      type: 'private',
      onClick,
    });
  }

  /**
   * 显示群组消息通知
   */
  async showGroupMessage(groupName: string, from: string, message: string, avatar?: string, onClick?: () => void) {
    return this.show({
      title: `${groupName}`,
      body: this.preferences.messagePreview ? `${from}: ${message}` : '收到一条群组消息',
      icon: avatar,
      tag: `group-message-${groupName}`,
      type: 'group',
      onClick,
    });
  }

  /**
   * 显示通话通知
   */
  async showCall(from: string, type: 'video' | 'audio' | 'screen', avatar?: string, onClick?: () => void) {
    const typeText = type === 'video' ? '视频通话' : type === 'audio' ? '语音通话' : '屏幕共享';
    return this.show({
      title: `来电 - ${from}`,
      body: `${from} 邀请您进行${typeText}`,
      icon: avatar,
      tag: `call-${from}`,
      type: 'call',
      onClick,
      silent: false, // 通话通知不静音
    });
  }

  /**
   * 显示群组邀请通知
   */
  async showInvitation(groupName: string, from: string, avatar?: string, onClick?: () => void) {
    return this.show({
      title: '群组邀请',
      body: `${from} 邀请您加入群组 "${groupName}"`,
      icon: avatar,
      tag: `invitation-${groupName}`,
      type: 'invitation',
      onClick,
    });
  }

  /**
   * 显示系统通知
   */
  async showSystem(title: string, message: string, onClick?: () => void) {
    return this.show({
      title,
      body: message,
      type: 'system',
      onClick,
    });
  }

  /**
   * 启用通知
   */
  enable() {
    this.enabled = true;
    localStorage.setItem('notification_enabled', 'true');
  }

  /**
   * 禁用通知
   */
  disable() {
    this.enabled = false;
    localStorage.setItem('notification_enabled', 'false');
  }

  /**
   * 启用声音
   */
  enableSound() {
    this.soundEnabled = true;
    localStorage.setItem('notification_sound_enabled', 'true');
    this.playSound('system');
  }

  /**
   * 禁用声音
   */
  disableSound() {
    this.soundEnabled = false;
    localStorage.setItem('notification_sound_enabled', 'false');
  }

  /**
   * 获取通知是否启用
   */
  isEnabled(): boolean {
    return this.enabled && this.getPermission() === 'granted';
  }

  /**
   * 获取声音是否启用
   */
  isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  /**
   * 获取权限状态
   */
  getPermission(): NotificationPermission {
    this.permission = 'Notification' in window ? Notification.permission : 'denied';
    return this.permission;
  }
}

// 导出单例
const notificationService = new NotificationService();
export default notificationService;

