<template>
  <n-config-provider style="height: 100%; overflow: auto;">
    <n-message-provider>
      <n-notification-provider>
      <n-dialog-provider>
        <GroupCallInvitations />
        <GlobalPrivateCall />
        <GlobalMessages />
        <RouterView />
      </n-dialog-provider>
      </n-notification-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { useSocketStore } from '@/stores/socket';
import GroupCallInvitations from '@/components/GroupCallInvitations.vue';
import GlobalPrivateCall from '@/components/GlobalPrivateCall.vue';
import GlobalMessages from '@/components/GlobalMessages.vue';
import { useUnreadStore } from '@/stores/unread';

const authStore = useAuthStore();
const { token, currentUser } = storeToRefs(authStore);
const socketStore = useSocketStore();

watch(
  [token, currentUser],
  ([currentToken, user]) => {
    if (currentToken && user) {
      socketStore.connect(currentToken, user);
    } else {
      socketStore.disconnect();
      useUnreadStore().reset();
    }
  },
  { immediate: true },
);
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

#app {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

html,
body {
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
}

button,
input,
textarea,
select {
  max-width: 100%;
}

@media (max-width: 767px) {
  #app .h-screen { height: 100dvh; }
  #app .mobile-sidebar-toggle,
  #app .mobile-sidebar-close {
    min-height: 40px;
    padding-inline: 14px;
    border-radius: 999px;
    box-shadow: 0 3px 12px #0f172a14;
  }
  #app .mobile-sidebar-toggle { margin-right: 12px; }
  #app .mobile-sidebar-close { margin: 12px; }
  .n-modal-container .n-card,
  .n-modal-container .n-dialog {
    max-width: calc(100vw - 24px);
    max-height: calc(100dvh - 24px);
    overflow: auto;
  }
}
</style>
