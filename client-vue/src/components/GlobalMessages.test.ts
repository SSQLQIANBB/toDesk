import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  create: vi.fn(),
  push: vi.fn(),
  receivePrivate: vi.fn(() => true),
  receiveGroup: vi.fn(() => true),
}));
vi.mock('naive-ui', () => ({ useNotification: () => ({ create: mocks.create }) }));
vi.mock('vue-router', async importOriginal => ({
  ...await importOriginal<typeof import('vue-router')>(),
  useRouter: () => ({ push: mocks.push, currentRoute: { value: { path: '/groups' } } }),
}));
vi.mock('@/stores/socket', () => ({ useSocketStore: () => ({
  authenticated: false, userList: [], setSubscribedGroups: vi.fn(),
  socket: {
    on: (event: string, handler: Function) => mocks.handlers.set(event, handler),
    off: (event: string) => mocks.handlers.delete(event),
  },
}) }));
vi.mock('@/stores/unread', () => ({ useUnreadStore: () => ({
  total: 0, activePrivateUserId: null, rememberSender: vi.fn(),
  receivePrivate: mocks.receivePrivate, receiveGroup: mocks.receiveGroup,
}) }));
vi.mock('@/services/notificationService', () => ({ default: { showMessage: vi.fn(), showSystem: vi.fn() } }));
import GlobalMessages from './GlobalMessages.vue';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
});

describe('全局消息提示', () => {
  it('私信和群消息显示发送人及单行内容，点击内容进入会话', () => {
    const wrapper = mount(GlobalMessages);
    mocks.handlers.get('private_message')!({ id: 11, fromUserId: 2, sender: { nickname: '小明' }, message: '你好' });
    mocks.handlers.get('group_message')!({ id: 12, groupId: 7, user: { nickname: '小红' }, message: '开会了' });

    expect(mocks.create).toHaveBeenCalledTimes(2);
    const privateOptions = mocks.create.mock.calls[0]![0];
    const groupOptions = mocks.create.mock.calls[1]![0];
    expect(privateOptions).toMatchObject({ title: '小明：消息', closable: false });
    expect(groupOptions).toMatchObject({ title: '小红：消息', closable: false });
    const privateContent = privateOptions.content();
    const groupContent = groupOptions.content();
    expect(privateContent.children).toBe('内容：你好');
    expect(groupContent.children).toBe('内容：开会了');
    privateContent.props.onClick();
    groupContent.props.onClick();
    expect(mocks.push).toHaveBeenCalledWith({ path: '/remote', query: { tab: 'users', contact: '2' } });
    expect(mocks.push).toHaveBeenCalledWith('/group-chat/7');
    wrapper.unmount();
  });
});
