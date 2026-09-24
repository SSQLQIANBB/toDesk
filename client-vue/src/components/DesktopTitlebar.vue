<template>
  <!-- 仅提供透明拖动热区；红黄绿按钮由 macOS 原生绘制。 -->
  <div class="desktop-window-drag-region" data-tauri-drag-region aria-hidden="true"></div>
</template>

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
</style>
