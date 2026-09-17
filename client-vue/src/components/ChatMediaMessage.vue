<template>
  <a
    v-if="type === 'image'"
    :href="resolvedUrl"
    target="_blank"
    rel="noopener noreferrer"
    class="chat-image-link"
  >
    <img :src="resolvedUrl" :alt="media.fileName || '聊天图片'" class="chat-image" />
  </a>
  <div v-else class="chat-voice">
    <audio :src="resolvedUrl" controls preload="metadata" />
    <span>{{ media.durationSeconds }} 秒</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMediaPayload } from '@/api/message';
import { resolveChatMediaUrl } from '@/services/chatMedia';

const props = defineProps<{
  type: 'image' | 'voice';
  media: ChatMediaPayload;
}>();

const resolvedUrl = computed(() => resolveChatMediaUrl(props.media.url));
</script>

<style scoped>
.chat-image-link { display: block; max-width: min(320px, 70vw); }
.chat-image { display: block; width: auto; max-width: 100%; max-height: 320px; border-radius: 10px; object-fit: contain; }
.chat-voice { display: flex; align-items: center; gap: 8px; min-width: min(300px, 70vw); }
.chat-voice audio { width: 100%; min-width: 0; height: 36px; }
.chat-voice span { flex: none; font-size: 12px; color: #64748b; }
</style>
