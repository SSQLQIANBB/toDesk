<template>
  <video
    ref="videoRef"
    autoplay
    playsinline
    :muted="local"
    class="w-full h-full object-cover"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, toRaw, watch } from 'vue';

const props = defineProps<{
  stream?: MediaStream | null;
  local?: boolean;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);

watch(
  [videoRef, () => props.stream],
  ([video, stream]) => {
    if (!video) return;
    video.srcObject = stream ? toRaw(stream) : null;
    if (stream) {
      void video.play().catch(() => {
        // 远端音频可能需要一次用户交互，流会保留在元素上等待浏览器允许播放。
      });
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (videoRef.value) videoRef.value.srcObject = null;
});
</script>
