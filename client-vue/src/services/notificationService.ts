/**
 * 通知服务 - 管理桌面通知、声音提醒等
 */

export type NotificationType = 'message' | 'call' | 'invitation' | 'system';

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
  private audioContext: AudioContext | null = null;
  private notificationSound: HTMLAudioElement | null = null;

  constructor() {
    this.init();
  }

  /**
   * 初始化通知服务
   */
  async init() {
    // 检查浏览器是否支持通知
    if (!('Notification' in window)) {
      console.warn('此浏览器不支持桌面通知');
      this.enabled = false;
      return;
    }

    this.permission = Notification.permission;

    // 从 localStorage 读取用户设置
    const savedEnabled = localStorage.getItem('notification_enabled');
    const savedSoundEnabled = localStorage.getItem('notification_sound_enabled');

    if (savedEnabled !== null) {
      this.enabled = savedEnabled === 'true';
    }

    if (savedSoundEnabled !== null) {
      this.soundEnabled = savedSoundEnabled === 'true';
    }

    // 初始化音频
    this.initAudio();
  }

  /**
   * 初始化音频
   */
  private initAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // 创建消息提示音（简单的"叮"声）
      this.notificationSound = new Audio();
      // 使用 data URL 创建简单的提示音
      const audioData = this.generateNotificationBeep();
      this.notificationSound.src = audioData;
      this.notificationSound.volume = 0.5;
    } catch (error) {
      console.warn('音频初始化失败:', error);
    }
  }

  /**
   * 生成通知提示音
   */
  private generateNotificationBeep(): string {
    // 使用 Web Audio API 生成简单的提示音
    if (!this.audioContext) return '';

    const sampleRate = this.audioContext.sampleRate;
    const duration = 0.2; // 200ms
    const frequency = 800; // 800Hz

    const length = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // 生成正弦波
      data[i] = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 10);
    }

    // 将 AudioBuffer 转换为 WAV 格式的 Data URL
    // 这里简化处理，实际项目中可以使用外部音频文件
    return 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGm+DyvmwhBSuBzvLZiTcIGWi77eefTRAMUKfj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606+uoVRQKRpvg8r5sIQUrga7y2Ik3CBlou+3nn00QDFCn4/C2YxwGOJHX8sx5LAUkd8fw3ZBAI='; // 简化的示例
  }

  /**
   * 请求通知权限
   */
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      return false;
    }

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
  async show(options: NotificationOptions) {
    // 检查是否启用通知
    if (!this.enabled) {
      console.log('通知已禁用');
      return;
    }

    // 检查权限
    if (this.permission !== 'granted') {
      const granted = await this.requestPermission();
      if (!granted) {
        console.warn('通知权限未授予');
        return;
      }
    }

    // 播放提示音
    if (this.soundEnabled && !options.silent) {
      this.playSound(options.type);
    }

    // 创建通知
    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        tag: options.tag,
        requireInteraction: false, // 自动关闭
        silent: options.silent || !this.soundEnabled, // 如果已经播放了自定义音效，则静音系统通知
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
    } catch (error) {
      console.error('显示通知失败:', error);
    }
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
    await this.show({
      title: `新消息 - ${from}`,
      body: message,
      icon: avatar,
      tag: `message-${from}`,
      type: 'message',
      onClick,
    });
  }

  /**
   * 显示群组消息通知
   */
  async showGroupMessage(groupName: string, from: string, message: string, avatar?: string, onClick?: () => void) {
    await this.show({
      title: `${groupName}`,
      body: `${from}: ${message}`,
      icon: avatar,
      tag: `group-message-${groupName}`,
      type: 'message',
      onClick,
    });
  }

  /**
   * 显示通话通知
   */
  async showCall(from: string, type: 'video' | 'audio' | 'screen', avatar?: string, onClick?: () => void) {
    const typeText = type === 'video' ? '视频通话' : type === 'audio' ? '语音通话' : '屏幕共享';
    await this.show({
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
    await this.show({
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
    await this.show({
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
    return this.enabled && this.permission === 'granted';
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
    return this.permission;
  }
}

// 导出单例
const notificationService = new NotificationService();
export default notificationService;

