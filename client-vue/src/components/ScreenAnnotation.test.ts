import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ScreenAnnotation from './ScreenAnnotation.vue';

const context = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  fillText: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  rect: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
};

async function dispatchPointer(
  element: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
) {
  element.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    clientX,
    clientY,
  }));
  await nextTick();
}

describe('ScreenAnnotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  });

  it('共享者完成绘制时发出 0 到 1 的相对坐标', async () => {
    const wrapper = mount(ScreenAnnotation, {
      props: {
        editable: true,
        actions: [],
        drafts: [],
        showToolbar: true,
      },
    });
    const canvas = wrapper.get('canvas');
    vi.spyOn(canvas.element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await dispatchPointer(canvas.element, 'pointerdown', 20, 20);
    await dispatchPointer(canvas.element, 'pointermove', 100, 50);
    await dispatchPointer(canvas.element, 'pointerup', 100, 50);

    expect(wrapper.emitted('complete')?.[0]?.[0]).toMatchObject({
      points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.5 }],
    });
  });

  it('观看者画布不接收绘制操作', async () => {
    const wrapper = mount(ScreenAnnotation, {
      props: {
        editable: false,
        actions: [],
        drafts: [],
        showToolbar: false,
      },
    });

    const canvas = wrapper.get('canvas');
    await dispatchPointer(canvas.element, 'pointerdown', 20, 20);
    await dispatchPointer(canvas.element, 'pointerup', 30, 30);

    expect(wrapper.emitted('complete')).toBeUndefined();
    expect(wrapper.get('canvas').classes()).toContain('annotation-canvas--readonly');
  });

  it('组件卸载时移除窗口 resize 监听', () => {
    const removeEventListener = vi.spyOn(window, 'removeEventListener');
    const wrapper = mount(ScreenAnnotation, {
      props: {
        editable: false,
        actions: [],
        drafts: [],
      },
    });

    wrapper.unmount();

    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
