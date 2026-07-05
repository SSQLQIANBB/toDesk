import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import MediaVideo from './MediaVideo.vue';

describe('MediaVideo', () => {
  it('两名成员进入同一群组视频时，本地和远端画面都绑定且符合自动播放策略', async () => {
    const aliceStream = { id: 'alice-stream' } as MediaStream;
    const bobStream = { id: 'bob-stream' } as MediaStream;

    const aliceLocal = mount(MediaVideo, {
      props: { stream: aliceStream, local: true },
    });
    const aliceRemote = mount(MediaVideo, {
      props: { stream: bobStream, local: false },
    });
    const bobLocal = mount(MediaVideo, {
      props: { stream: bobStream, local: true },
    });
    const bobRemote = mount(MediaVideo, {
      props: { stream: aliceStream, local: false },
    });
    await nextTick();

    const localVideo = aliceLocal.get('video').element as HTMLVideoElement;
    const remoteVideo = aliceRemote.get('video').element as HTMLVideoElement;

    expect(localVideo.srcObject).toBe(aliceStream);
    expect(remoteVideo.srcObject).toBe(bobStream);
    expect((bobLocal.get('video').element as HTMLVideoElement).srcObject).toBe(bobStream);
    expect((bobRemote.get('video').element as HTMLVideoElement).srcObject).toBe(aliceStream);
    expect(localVideo.autoplay).toBe(true);
    expect(localVideo.playsInline).toBe(true);
    expect(localVideo.muted).toBe(true);
    expect(remoteVideo.autoplay).toBe(true);
    expect(remoteVideo.playsInline).toBe(true);
  });
});
