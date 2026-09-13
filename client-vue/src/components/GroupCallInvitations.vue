<template><span v-if="false" /></template>

<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { useDialog, type DialogReactive } from 'naive-ui';
import { useRouter } from 'vue-router';
import { useSocketStore } from '@/stores/socket';
import { useAuthStore } from '@/stores/auth';
import type { GroupSession } from '@/services/groupSessionState';

const dialog = useDialog();
const router = useRouter();
const socketStore = useSocketStore();
const authStore = useAuthStore();
const pending = new Map<string, DialogReactive>();
const seen = new Set<string>();

function dismissAll() {
  pending.forEach(item => item.destroy());
  pending.clear();
  seen.clear();
}

function handleStarted(data: GroupSession & {
  deviceType?: number;
  user?: { nickname?: string; username?: string };
}) {
  if (!authStore.currentUser || data.ownerUserId === authStore.currentUser.id) return;
  const type = data.type || (data.deviceType === 2 ? 'screen' : 'video');
  const path = `/group-${type}/${data.groupId}`;
  if (router.currentRoute.value.path === path) return;
  const key = `${data.groupId}:${type}`;
  const eventId = `${key}:${data.startedAt}`;
  if (seen.has(eventId)) return;
  seen.add(eventId);
  pending.get(key)?.destroy();
  const label = type === 'screen' ? '屏幕共享' : '视频通话';
  pending.set(key, dialog.info({
    title: `群组${label}邀请`,
    content: `${data.user?.nickname || data.user?.username || '群成员'} 邀请你加入群组 ${data.groupId} 的${label}`,
    positiveText: '接受邀请',
    negativeText: '暂不加入',
    onPositiveClick: () => {
      pending.delete(key);
      void router.push(path);
    },
    onNegativeClick: () => { pending.delete(key); },
    onClose: () => { pending.delete(key); },
    maskClosable: false,
  }));
}

function handleEnded(data: { groupId: number; type?: string; deviceType?: number }) {
  const key = `${data.groupId}:${data.type || (data.deviceType === 2 ? 'screen' : 'video')}`;
  pending.get(key)?.destroy();
  pending.delete(key);
}

watch(() => socketStore.socket, (socket, previous) => {
  previous?.off('group_call_started', handleStarted);
  previous?.off('group_call_ended', handleEnded);
  previous?.off('disconnect', dismissAll);
  dismissAll();
  socket?.on('group_call_started', handleStarted);
  socket?.on('group_call_ended', handleEnded);
  socket?.on('disconnect', dismissAll);
}, { immediate: true });

onBeforeUnmount(() => {
  socketStore.socket?.off('group_call_started', handleStarted);
  socketStore.socket?.off('group_call_ended', handleEnded);
  socketStore.socket?.off('disconnect', dismissAll);
  dismissAll();
});
</script>
