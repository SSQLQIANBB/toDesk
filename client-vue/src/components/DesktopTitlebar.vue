<template>
  <header class="desktop-titlebar" data-tauri-drag-region aria-label="窗口标题栏">
    <span data-tauri-drag-region>ToDesk</span>
  </header>
</template>

<style scoped>
.desktop-titlebar {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 44px;
  padding: 0 16px 0 96px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  font-size: 13px;
  font-weight: 600;
  user-select: none;
  cursor: default;
}
</style>
