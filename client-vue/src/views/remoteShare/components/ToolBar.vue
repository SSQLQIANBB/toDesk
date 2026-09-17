<template>
  <div class="flex gap-2 border-t p-3">
    <n-button :disabled="!contactUser || calls.busy" @click="start(1)">屏幕共享</n-button>
    <n-button :disabled="!contactUser || calls.busy" @click="start(0)">视频通话</n-button>
    <n-button :disabled="!contactUser || calls.busy" @click="start(2)">语音通话</n-button>
  </div>
</template>
<script setup lang="ts">
import { NButton } from 'naive-ui';
import { usePrivateCallStore, type CallUser } from '@/stores/privateCall';
const props = defineProps<{ contactUser: CallUser | null }>();
const calls = usePrivateCallStore();
function start(type: 0 | 1 | 2) {
  if (props.contactUser) calls.request = { user: props.contactUser, type };
}
</script>
