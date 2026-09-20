<template>
  <n-image
    v-if="type === 'image'"
    class="chat-image"
    :src="resolvedUrl"
    :alt="media.fileName || '聊天图片'"
    object-fit="contain"
    @load="emit('loaded')"
  />
  <template v-else>
    <button
      type="button"
      class="chat-voice"
      :class="{ 'chat-voice--mine': isMine, 'chat-voice--playing': playing }"
      :style="{ width: voiceWidth }"
      :aria-label="playing ? '暂停语音' : `播放 ${media.durationSeconds} 秒语音`"
      @click="togglePlayback"
    >
      <svg class="chat-voice__wave" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10v4 M20 10v4" />
        <path d="M8 6v12 M16 7v10" />
        <path d="M12 3v18" />
      </svg>
      <span class="chat-voice__duration">{{ media.durationSeconds }}″</span>
    </button>
    <audio
      ref="audioRef"
      :src="resolvedUrl"
      preload="metadata"
      hidden
      @loadedmetadata="emit('loaded')"
      @play="playing = true"
      @pause="playing = false"
      @ended="handleEnded"
    />
  </template>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { NImage } from 'naive-ui';
import type { ChatMediaPayload } from '@/api/message';
import { resolveChatMediaUrl } from '@/services/chatMedia';

const props = withDefaults(defineProps<{
  type: 'image' | 'voice';
  media: ChatMediaPayload;
  isMine?: boolean;
}>(), { isMine: false });
const emit = defineEmits<{ loaded: [] }>();

const resolvedUrl = computed(() => resolveChatMediaUrl(props.media.url));
const audioRef = ref<HTMLAudioElement | null>(null);
const playing = ref(false);
const voiceWidth = computed(() => `${Math.min(220, 86 + (props.media.durationSeconds || 1) * 3)}px`);

function togglePlayback() {
  const audio = audioRef.value;
  if (!audio) return;
  if (!audio.paused) {
    audio.pause();
    return;
  }
  void audio.play().catch(() => { playing.value = false; });
}

function handleEnded() {
  playing.value = false;
  if (audioRef.value) audioRef.value.currentTime = 0;
}
</script>

<style scoped>
.chat-image { display: block; max-width: min(320px, 70vw); }
.chat-image :deep(img) { display: block; width: auto; max-width: 100%; max-height: 320px; border-radius: 10px; object-fit: contain; }
.chat-voice { display: flex; align-items: center; gap: 8px; min-width: 86px; min-height: 36px; padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; }
.chat-voice--mine { flex-direction: row-reverse; }
.chat-voice--mine .chat-voice__wave { transform: scaleX(-1); }
.chat-voice__wave { width: 24px; height: 24px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.chat-voice__duration { flex: none; font-size: 13px; font-variant-numeric: tabular-nums; }
.chat-voice--playing .chat-voice__wave path { animation: voice-wave 1s ease-in-out infinite; }
.chat-voice--playing .chat-voice__wave path:nth-child(2) { animation-delay: .12s; }
.chat-voice--playing .chat-voice__wave path:nth-child(3) { animation-delay: .24s; }
@keyframes voice-wave { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
</style>
