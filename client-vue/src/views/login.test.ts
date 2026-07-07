import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginView from './login.vue';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  replace: vi.fn(),
  setAuth: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@/api/auth', () => ({
  register: vi.fn(),
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({ setAuth: mocks.setAuth, login: mocks.login }),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}));

vi.mock('naive-ui', async importOriginal => {
  const actual = await importOriginal<typeof import('naive-ui')>();
  return {
    ...actual,
    useMessage: () => ({ error: mocks.error, success: mocks.success }),
  };
});

const FormStub = defineComponent({
  template: '<form><slot /></form>',
  setup(_, { expose }) {
    expose({ validate: () => Promise.resolve() });
  },
});

const ButtonStub = defineComponent({
  props: {
    loading: Boolean,
    disabled: Boolean,
  },
  emits: ['click'],
  template: `
    <button
      type="button"
      :disabled="disabled"
      :data-loading="String(loading)"
      @click="$emit('click')"
    ><slot /></button>
  `,
});

function mountLogin() {
  return mount(LoginView, {
    global: {
      stubs: {
        NCard: { template: '<section><slot name="header" /><slot /></section>' },
        NTabs: { template: '<div><slot /></div>' },
        NTabPane: { template: '<div><slot /></div>' },
        NForm: FormStub,
        NFormItem: { template: '<label><slot /></label>' },
        NInput: { template: '<input />' },
        NButton: ButtonStub,
        NIcon: { template: '<i />' },
      },
    },
  });
}

describe('login button state', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset());
  });

  it('请求期间按钮 loading 且禁用，重复点击不会发送第二次请求', async () => {
    let resolveLogin!: (value: any) => void;
    mocks.login.mockImplementation(() => new Promise(resolve => {
      resolveLogin = resolve;
    }));
    const wrapper = mountLogin();
    const button = wrapper.findAll('button')[0]!;

    await button.trigger('click');
    await flushPromises();

    expect(button.attributes('data-loading')).toBe('true');
    expect(button.attributes('disabled')).toBeDefined();
    await button.trigger('click');
    expect(mocks.login).toHaveBeenCalledTimes(1);

    resolveLogin({
      user: { id: 1, username: 'owner' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    await flushPromises();
  });

  it('登录失败或异常后恢复按钮状态', async () => {
    mocks.login.mockRejectedValue(new Error('登录失败'));
    const wrapper = mountLogin();
    const button = wrapper.findAll('button')[0]!;

    await button.trigger('click');
    await flushPromises();

    expect(button.attributes('data-loading')).toBe('false');
    expect(button.attributes('disabled')).toBeUndefined();
    expect(mocks.error).toHaveBeenCalledWith('登录失败');
  });
});
