<template>
  <!-- 仅提供透明拖动热区；红黄绿按钮由 macOS 原生绘制。 -->
  <div class="desktop-window-drag-region" :class="{ 'desktop-window-drag-region--chat': isChat }" data-tauri-drag-region aria-hidden="true"></div>
  <div v-if="isChat" class="desktop-chat-top-drag-region" data-tauri-drag-region aria-hidden="true"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const isChat = computed(() => route.path === '/remote' || route.path.startsWith('/group-chat/'));
</script>

<style scoped>
.desktop-window-drag-region {
  position: fixed;
  inset: 0 0 auto;
  z-index: 20;
  height: 44px;
  background: transparent;
  user-select: none;
  cursor: default;
}

/* 聊天区只保留顶边拖动热区，不遮挡上移后的标题及群组操作。 */
.desktop-window-drag-region--chat {
  width: 320px;
}

.desktop-chat-top-drag-region {
  position: fixed;
  top: 0;
  left: 320px;
  right: 0;
  height: 8px;
  z-index: 20;
  user-select: none;
}
</style>
