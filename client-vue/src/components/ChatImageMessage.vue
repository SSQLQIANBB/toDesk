<template>
  <n-image
    class="chat-image"
    :class="{ 'chat-image--mine': isMine }"
    :src="resolvedUrl"
    :alt="media.fileName || '聊天图片'"
    object-fit="contain"
  >
    <template #placeholder>
      <span class="chat-image__status chat-image__loading" role="status">图片加载中…</span>
    </template>
    <template #error>
      <span class="chat-image__status chat-image__error" role="status">图片加载失败</span>
    </template>
  </n-image>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NImage } from 'naive-ui';
import type { ChatMediaPayload } from '@/api/message';
import { resolveChatMediaUrl } from '@/services/chatMedia';

const props = defineProps<{ media: ChatMediaPayload; isMine: boolean }>();
const resolvedUrl = computed(() => resolveChatMediaUrl(props.media.url));
</script>

<style scoped>
/* 历史消息没有图片尺寸，固定预览区域避免资源加载改变消息高度。 */
.chat-image { position: relative; display: block; width: 320px; max-width: 100%; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 10px; }
.chat-image :deep(img) { display: block; width: 100%; height: 100%; object-fit: contain; object-position: left center; }
.chat-image--mine :deep(img) { object-position: right center; }
.chat-image__status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; color: inherit; opacity: .7; }
.chat-image:has(.chat-image__error) .chat-image__loading { display: none; }
</style>
