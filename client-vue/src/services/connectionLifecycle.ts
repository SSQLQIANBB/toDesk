export type MeetingConnectionStatus = 'disconnected' | 'connecting' | 'authenticated';

export class ConnectionLifecycle {
  private status: MeetingConnectionStatus = 'disconnected';
  private readonly authenticatedSubscribers = new Set<() => void>();

  transition(nextStatus: MeetingConnectionStatus) {
    const previousStatus = this.status;
    this.status = nextStatus;

    // 已认证状态只在真实状态转换时通知，页面重新订阅不会收到历史事件。
    if (nextStatus === 'authenticated' && previousStatus !== 'authenticated') {
      this.authenticatedSubscribers.forEach(handler => handler());
    }
  }

  subscribeAuthenticated(handler: () => void) {
    this.authenticatedSubscribers.add(handler);
    return () => this.authenticatedSubscribers.delete(handler);
  }

  getStatus() {
    return this.status;
  }

  getSubscriberCount() {
    return this.authenticatedSubscribers.size;
  }
}
