<template>
  <n-config-provider style="height: 100%; overflow: auto;">
    <n-message-provider>
      <n-dialog-provider>
        <RouterView />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useAuth } from '@/stores/auth';
import { useSocketStore } from '@/stores/socket';

const { token, currentUser } = useAuth();
const socketStore = useSocketStore();

watch(
  [token, currentUser],
  ([currentToken, user]) => {
    if (currentToken && user) {
      socketStore.connect(currentToken, user);
    } else {
      socketStore.disconnect();
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
</style>
