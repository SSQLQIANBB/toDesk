import { mount, shallowMount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { NImage } from 'naive-ui';
import ChatMediaMessage from '../../../src/components/ChatMediaMessage.vue';

const image = {
  url: 'https://files.example.com/photo.png',
  mimeType: 'image/png',
  fileName: 'photo.png',
};

const voice = {
  url: 'https://files.example.com/voice.webm',
  mimeType: 'audio/webm',
  durationSeconds: 8,
};

describe('聊天媒体消息', () => {
  it('图片使用 Naive UI 站内预览，不渲染跳转链接', () => {
    const wrapper = shallowMount(ChatMediaMessage, {
      props: { type: 'image', media: image },
    });

    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.findComponent(NImage).props('src')).toBe(image.url);
  });

  it('语音显示为消息气泡并可点击播放', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const wrapper = mount(ChatMediaMessage, {
      props: { type: 'voice', media: voice, isMine: true },
    });

    expect(wrapper.find('.chat-voice').classes()).toContain('chat-voice--mine');
    expect(wrapper.find('.chat-voice__duration').text()).toBe('8″');
    expect(wrapper.find('audio').attributes('controls')).toBeUndefined();
    await wrapper.find('.chat-voice').trigger('click');
    expect(play).toHaveBeenCalledOnce();
  });
});
