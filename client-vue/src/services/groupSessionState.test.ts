import { describe, expect, it } from 'vitest';
import {
  createGroupSessionState,
  type GroupSession,
} from './groupSessionState';

const videoSession: GroupSession = {
  groupId: 7,
  type: 'video',
  channelId: 'group:7:video',
  ownerUserId: 1,
  ownerSocketId: 'socket-a',
  startedAt: '2026-07-05T10:00:00.000Z',
};

const screenSession: GroupSession = {
  ...videoSession,
  type: 'screen',
  channelId: 'group:7:screen',
};

describe('groupSessionState', () => {
  it('视频开始后其他成员按钮显示进入视频', () => {
    const state = createGroupSessionState();
    state.applyStarted(videoSession);

    expect(state.getButtonLabel(7, 'video')).toBe('进入视频');
  });

  it('屏幕共享开始后其他成员按钮显示进入共享', () => {
    const state = createGroupSessionState();
    state.applyStarted(screenSession);

    expect(state.getButtonLabel(7, 'screen')).toBe('进入共享');
  });

  it('后进入群组的成员可从服务端快照恢复状态，结束后按钮恢复', () => {
    const state = createGroupSessionState();
    state.applySnapshot(7, { video: videoSession, screen: screenSession });

    expect(state.getButtonLabel(7, 'video')).toBe('进入视频');
    expect(state.getButtonLabel(7, 'screen')).toBe('进入共享');

    state.applyEnded(7, 'video');
    state.applyEnded(7, 'screen');

    expect(state.getButtonLabel(7, 'video')).toBe('发起视频通话');
    expect(state.getButtonLabel(7, 'screen')).toBe('发起屏幕共享');
  });

  it('删除群组时清理该群组的视频和共享状态，不影响其他群组', () => {
    const state = createGroupSessionState();
    state.applySnapshot(7, { video: videoSession, screen: screenSession });
    state.applyStarted({
      ...videoSession,
      groupId: 8,
      channelId: 'group:8:video',
    });

    state.clearGroup(7);

    expect(state.getSession(7, 'video')).toBeNull();
    expect(state.getSession(7, 'screen')).toBeNull();
    expect(state.getSession(8, 'video')).not.toBeNull();
  });
});
