<template>
  <n-layout has-sider class="h-full w-full bg-gradient-to-br from-slate-50 to-slate-100">
    <n-layout-sider
      class="remote-sidebar"
      :class="{ 'mobile-open': mobileSidebarOpen }"
      bordered
      :width="280"
      :collapsed-width="0"
      collapse-mode="transform"
      :show-trigger="false"
      content-class="flex flex-col bg-white shadow-lg"
    >
      <n-button class="mobile-sidebar-close" secondary @click="mobileSidebarOpen = false">关闭列表</n-button>
      <!-- 用户信息卡片 -->
      <div class="p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white">
        <div class="flex items-center gap-3 mb-3">
          <n-avatar 
            :size="48" 
            :src="authUser?.avatar || undefined"
            class="cursor-pointer ring-2 ring-white ring-opacity-50 bg-[#E7F2FF] text-[#137FFF] font-bold"
            @click="goToProfile"
          >
            <span v-if="!authUser?.avatar">{{ authUser?.nickname?.charAt(0) || authUser?.username?.charAt(0) || '?' }}</span>
          </n-avatar>
          <div class="flex-1">
            <div class="font-bold text-sm">{{ authUser?.nickname || authUser?.username || '未登录' }}</div>
            <div class="flex items-center gap-2 mt-1">
              <span class="w-2 h-2 rounded-full animate-pulse" :class="getStatusColor(userStatus)"></span>
              <span class="text-xs opacity-90">{{ getStatusText(userStatus) }}</span>
            </div>
          </div>
          <n-button 
            type="error" 
            size="small" 
            strong
            secondary
            @click="handleLogout"
          >
            退出登录
          </n-button>
        </div>
        <!-- 快捷操作 -->
        <div class="flex gap-2">
          <n-button size="small" secondary block @click="goToProfile">
            个人中心
          </n-button>
        </div>
      </div>

      <!-- Tab 切换 -->
      <n-tabs v-model:value="activeTab" type="line" animated justify-content="space-evenly" class="flex-1 flex flex-col" pane-class="flex-1" style="overflow: hidden;">
        <!-- 联系人 -->
        <n-tab-pane name="users" :tab="unread.privateTotal ? `联系人 (${unread.privateTotal})` : '联系人'" display-directive="show:lazy" class="flex flex-col h-full pt-0">
          <div class="px-4 py-3 text-xs text-gray-500 font-semibold border-b bg-gray-50 flex items-center justify-between gap-2">
            <span>联系人 ({{ displayUsers.length }})</span>
            <span v-if="unread.privateTotal > 0" class="contact-unread-badge" aria-label="未读消息">{{ unread.privateTotal > 99 ? '99+' : unread.privateTotal }}</span>
          </div>
          <n-scrollbar style="flex: 1; max-height: calc(100vh - 280px);">
            <ul class="p-3 space-y-2">
              <n-badge 
                :offset="[-8, 8]" 
                class="w-full" 
                :value="unReadMessageCount[user.id] || 0"
                :max="99"
                :show="!!unReadMessageCount[user.id]"
                v-for="user in displayUsers"
                :key="user.id"
              >
                <li 
                  class="w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-blue-50 hover:shadow-md border"
                  :class="contactUser?.id === user.id ? 'bg-blue-100 border-blue-300 shadow-md' : 'bg-white border-gray-200'"
                  @click="selectContact(user)"
                >
                  <n-avatar :size="40" :src="user.avatar || undefined" class="flex-shrink-0">
                    <span v-if="!user.avatar">{{ user.nickname?.charAt(0) || user.username?.charAt(0) || '?' }}</span>
                  </n-avatar>
                  <div class="flex-1 w-0">
                    <div class="font-semibold text-base">{{ user.nickname || user.username || `用户-${user.id}` }}</div>
                    <div class="text-xs text-gray-500 truncate">{{ user.bio || '人很懒，无简介~' }}</div>
                  </div>
                  <div class="w-2 h-2 rounded-full" :class="getStatusColor(user?.status || 'online')" ></div>
                </li>
              </n-badge>

              <n-empty 
                v-if="!displayUsers.length"
                class="h-full flex items-center justify-center py-12" 
                description="暂无联系人"
                size="small"
              >
                <template #icon>
                  <n-icon size="32" color="#d0d0d0" :component="PersonOutline" />
                </template>
              </n-empty>
            </ul>
          </n-scrollbar>
        </n-tab-pane>

        <!-- 我的群组 -->
        <n-tab-pane name="groups" :tab="unread.groupTotal ? `我的群组 (${unread.groupTotal})` : '我的群组'" display-directive="show:lazy" class="flex flex-col h-full pt-0">
          <div class="px-4 py-3 text-xs text-gray-500 font-semibold border-b bg-gray-50 flex items-center justify-between">
            <span>我的群组 ({{ myGroups.length }})</span>
            <n-button size="tiny" @click="goToGroups">管理</n-button>
          </div>
          <n-scrollbar style="flex: 1; max-height: calc(100vh - 280px);">
            <div class="p-3">
              <n-button block secondary @click="goToGroups" class="mb-3">
                + 创建/管理群组
              </n-button>
              
              <div v-if="myGroups.length > 0" class="space-y-2 mt-3">
                <div 
                  v-for="group in myGroups" 
                  :key="group.id"
                  class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-blue-50 hover:shadow-md border bg-white border-gray-200"
                  @click="goToGroupChat(group.id)"
                >
                  <n-avatar :size="40" :src="group.avatar || undefined">
                    <span v-if="!group.avatar">{{ group.name?.charAt(0) || 'G' }}</span>
                  </n-avatar>
                  <div class="flex-1 min-w-0">
                    <div class="font-semibold text-sm truncate">{{ group.name }}</div>
                    <div class="text-xs text-gray-500">成员: {{ group.memberCount || 0 }}</div>
                  </div>
                  <n-badge :value="unread.groupCounts[group.id] || 0" :max="99" :show="!!unread.groupCounts[group.id]" />
                </div>
              </div>
              
              <n-empty 
                v-else 
                description="暂无群组" 
                size="small"
                class="py-8"
              >
                <template #extra>
                  <n-button size="small" @click="goToGroups">
                    创建群组
                  </n-button>
                </template>
              </n-empty>
            </div>
          </n-scrollbar>
        </n-tab-pane>
      </n-tabs>
    </n-layout-sider>

    <n-layout-content content-class="w-full flex flex-col">
      <div v-if="contactUser" class="h-full w-full flex flex-col bg-white">
        <!-- 聊天头部 -->
        <header class="min-h-16 shadow-sm flex items-center px-3 sm:px-6 py-2 bg-gradient-to-r from-white to-gray-50 border-b">
          <n-button class="mobile-sidebar-toggle" secondary aria-label="打开联系人列表" @click="mobileSidebarOpen = true">☰</n-button>
          <div class="flex items-center gap-3 w-0 flex-grow overflow-hidden">
            <n-avatar :size="40" :src="contactUser.avatar || undefined" class="flex-shrink-0">
              <span v-if="!contactUser.avatar">{{ contactUser.nickname?.charAt(0) || contactUser.username?.charAt(0) || '?' }}</span>
            </n-avatar>
            <div class="flex-grow-1 w-auto overflow-hidden">
              <div class="font-bold text-base">{{ contactUser.nickname || contactUser.username || `用户-${contactUser.id}` }}</div>
              <div class="text-xs text-nowrap text-gray-500 truncate">{{ contactUser.bio || '人很懒，无简介~' }}</div>
            </div>
          </div>
        </header>
        <n-scrollbar class="grow p-4" ref="scrollbarRef">
          <ul class="space-y-3">
            <li class="flex flex-col w-full" :class="msg.fromUserId === authUser?.id ? 'items-end' : 'items-start'" v-for="(msg, index) in currentMessageList" :key="index">
              <span class="text-xs text-gray-400 mb-1">{{msg.time}}</span>
              <div class="p-3 rounded-lg max-w-[88%] sm:max-w-[60%] overflow-hidden text-wrap break-words shadow-sm transition-all hover:shadow-md"
                   :class="msg.fromUserId === authUser?.id ? 'bg-gradient-to-br from-blue-400 to-blue-500 text-white' : 'bg-gradient-to-br from-green-400 to-green-500 text-white'">
                {{ msg.message }}
              </div>
            </li>
          </ul>
        </n-scrollbar>
        
        <ToolBar :contact-user="contactUser" />

        <div class="h-32 border-t bg-white">
          <TextMsg @send="sendMsg" />
        </div>
      </div>
      <div class="h-full w-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-50 to-slate-100" v-else>
        <n-button class="mobile-sidebar-toggle" secondary @click="mobileSidebarOpen = true">打开联系人列表</n-button>
        <n-empty description="请从左侧选择一个联系人开始聊天" size="large">
          <template #icon>
            <n-icon size="50" color="#b0b0b0" :component="ChatboxEllipsesOutline" />
          </template>
          <template #extra>
            <div class="text-sm text-gray-500 mt-2">
              您可以发送消息、进行视频通话或屏幕共享
            </div>
          </template>
        </n-empty>
      </div>
    </n-layout-content>
    </n-layout>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, nextTick, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Socket } from 'socket.io-client';
import { storeToRefs } from 'pinia';
import { useMessage, useDialog } from 'naive-ui';
import { useAuthStore } from '@/stores/auth';
import { getUserList, type User as BasicUser } from '@/api/auth';
import { useSocketStore, type OnlineUser } from '@/stores/socket';
import { useUnreadStore } from '@/stores/unread';
import { getMyGroups, type Group } from '@/api/group';
import { getOfflineMessages, getPrivateMessages, markMessagesAsRead } from '@/api/message';
import { getPendingInvitations, acceptInvitation, rejectInvitation, type GroupInvitation } from '@/api/invitation';
import TextMsg from '@/components/TextMsg.vue';
import ToolBar from './components/ToolBar.vue';
import notificationService from '@/services/notificationService';
import { mergeContactPresence } from '@/services/contactPresence';
import {
  getRemoteTabQuery,
  parseRemoteTab,
  type RemoteTab,
} from '@/services/remoteTabState';
import { ChatboxEllipsesOutline, PersonOutline } from '@vicons/ionicons5';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const { currentUser: authUser, token } = storeToRefs(authStore);
const socketStore = useSocketStore();
const unread = useUnreadStore();
const { socket, authenticated: online, userList } = storeToRefs(socketStore);
const activeTab = ref<RemoteTab>(parseRemoteTab(route.query.tab));
const mobileSidebarOpen = ref(false);

type User = OnlineUser;

type MessageInfo = {
  time: string;
  from?: string;
  fromUserId: number;
  toUserId?: number;
  message: string;
}

const message = useMessage();
const dialog = useDialog();

const contactUser = ref<User | null>(null);
const knownContacts = ref<BasicUser[]>([]);

const myGroups = ref<Group[]>([]);
const pendingInvitations = ref<GroupInvitation[]>([]);

// 计算用户状态（基于Socket连接状态）
const userStatus = computed(() => {
  if (!online.value) return 'offline';
  return authUser.value?.status || 'online';
});

// 获取状态颜色
function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    online: 'bg-green-300',
    busy: 'bg-yellow-300',
    offline: 'bg-gray-300',
  };
  return colors[status] || 'bg-gray-300';
}

// 获取状态文本
function getStatusText(status: string) {
  const texts: Record<string, string> = {
    online: '在线',
    busy: '忙碌',
    offline: '离线',
  };
  return texts[status] || '离线';
}

// 私信本地存储
const privateMessageMap = new Map<
  User['id'],
  MessageInfo[]
>();

const unReadMessageCount = computed(() => unread.privateCounts);
const displayUsers = computed<User[]>(() => {
  return mergeContactPresence(knownContacts.value, Object.values(unread.privateContacts), userList.value, authUser.value?.id);
});

async function loadContacts() {
  try {
    knownContacts.value = (await getUserList()).users;
  } catch (error) {
    console.error('加载联系人失败:', error);
  }
}
const currentMessageList = ref<MessageInfo[]>([]);

// refs
const scrollbarRef = ref();

// 退出登录
async function handleLogout() {
  await authStore.logout({ navigate: true });
}

// 私信
function handlePrivateMessage(data: any) {
  console.log('receive-message:', data);

  const senderId = Number(data.fromUserId);
  setMessage(senderId, {
    from: data.from,
    fromUserId: senderId,
    toUserId: data.toUserId,
    message: data.message,
    time: data.time || new Date().toLocaleString(),
  });


  if (senderId === contactUser.value?.id) {
    currentMessageList.value = privateMessageMap.get(senderId) || [];
    scrollToBottom();
  }


}

function setMessage(id: number, data: MessageInfo) {
  const list = privateMessageMap.get(id) || [];

  privateMessageMap.set(id, [...list, data])
}

function bindPageSocketEvents(target: Socket) {
  target.on('private_message', handlePrivateMessage);
}

function unbindPageSocketEvents(target: Socket | null | undefined) {
  target?.off('private_message', handlePrivateMessage);
}


async function selectContact(user: User) {
  mobileSidebarOpen.value = false;
  contactUser.value = user;
  unread.activePrivateUserId = user.id;

  try {
    const res = await getPrivateMessages(user.id);
    const history = res.messages.map((msg) => ({
      fromUserId: msg.fromUserId,
      toUserId: msg.toUserId,
      message: msg.message,
      time: new Date(msg.createdAt).toLocaleString(),
    }));
    privateMessageMap.set(user.id, history);
    currentMessageList.value = history;
    const ids = res.messages.filter(msg => msg.fromUserId === user.id && !msg.isRead).map(msg => msg.id);
    if (ids.length) await markMessagesAsRead(ids);
    unread.readPrivate(user.id);
  } catch (error: any) {
    message.error('加载聊天记录失败: ' + error.message);
    currentMessageList.value = privateMessageMap.get(user.id) || []
  }
}
function sendMsg(v: string) {
  console.log(v)
  if (!contactUser.value || !authUser.value) return;

  // 私信
  socket.value?.emit('private_message', {
    to: contactUser.value,
    message: v,
  })
  
  setMessage(contactUser.value.id, {
    from: socket.value?.id!,
    fromUserId: authUser.value.id,
    toUserId: contactUser.value.id,
    message: v,
    time: new Date().toLocaleString()
  })

  currentMessageList.value = privateMessageMap.get(contactUser.value.id) || []
  scrollToBottom();
}

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    scrollbarRef.value?.scrollTo({ top: 999999, behavior: 'smooth' });
  });
}

// 加载群组列表
async function loadMyGroups() {
  try {
    const res = await getMyGroups();
    myGroups.value = res.groups || [];
    socketStore.setSubscribedGroups(myGroups.value.map(group => group.id));
  } catch (error: any) {
    console.error('加载群组列表失败:', error);
  }
}

// 将离线私信纳入未读列表，不再打断当前页面
async function loadOfflineMessages() {
  try {
    const res = await getOfflineMessages();
    res.messages?.forEach(item => {
      unread.rememberSender(item.sender);
      unread.receivePrivate(item.id, item.fromUserId, false);
    });
  } catch (error) {
    console.error('加载离线消息失败:', error);
  }
}

// 加载群组邀请
async function loadPendingInvitations() {
  try {
    const res = await getPendingInvitations();
    pendingInvitations.value = res.invitations || [];
    
    if (pendingInvitations.value.length > 0) {
      if (document.hidden) {
        pendingInvitations.value.forEach(inv => {
          void notificationService.showInvitation(
            inv.group.name,
            inv.inviter.nickname || inv.inviter.username,
            inv.inviter.avatar,
            () => { window.focus(); showInvitationsDialog(); },
          );
        });
      } else {
        notificationService.playAlert('invitation');
      }

      // 显示邀请对话框
      showInvitationsDialog();
    }
  } catch (error: any) {
    console.error('加载群组邀请失败:', error);
  }
}

// 显示群组邀请对话框
function showInvitationsDialog() {
  if (pendingInvitations.value.length === 0) return;
  
  const invitation = pendingInvitations.value[0];
  if (!invitation) return;
  
  dialog.warning({
    title: '群组邀请',
    content: `${invitation.inviter?.nickname || invitation.inviter?.username || '某用户'} 邀请您加入群组 "${invitation.group?.name || '未知群组'}"`,
    positiveText: '接受',
    negativeText: '拒绝',
    onPositiveClick: async () => {
      try {
        if (!invitation?.id) return;
        await acceptInvitation(invitation.id);
        message.success('已加入群组');
        pendingInvitations.value = pendingInvitations.value.filter(inv => inv.id !== invitation.id);
        loadMyGroups(); // 重新加载群组列表
        
        // 如果还有其他邀请，继续显示
        if (pendingInvitations.value.length > 0) {
          setTimeout(() => showInvitationsDialog(), 500);
        }
      } catch (error: any) {
        message.error('接受邀请失败: ' + error.message);
      }
    },
    onNegativeClick: async () => {
      try {
        if (!invitation?.id) return;
        await rejectInvitation(invitation.id);
        message.info('已拒绝邀请');
        pendingInvitations.value = pendingInvitations.value.filter(inv => inv.id !== invitation.id);
        
        // 如果还有其他邀请，继续显示
        if (pendingInvitations.value.length > 0) {
          setTimeout(() => showInvitationsDialog(), 500);
        }
      } catch (error: any) {
        message.error('拒绝邀请失败: ' + error.message);
      }
    }
  });
}

// 跳转到个人中心
const goToProfile = () => {
  router.push('/profile');
};

// 跳转到群组管理
const goToGroups = () => {
  router.push('/groups');
};

// 跳转到群组聊天
const goToGroupChat = (groupId: number) => {
  router.push(`/group-chat/${groupId}`);
};

// 监听消息列表变化，自动滚动到底部
watch(() => currentMessageList.value.length, () => {
  scrollToBottom();
});

watch(activeTab, (tab) => {
  if (route.query.tab === tab) return;
  void router.replace({
    path: '/remote',
    query: getRemoteTabQuery(tab),
  });
});

watch([displayUsers, () => route.query.contact], ([users, contact]) => {
  const selected = users.find(item => item.id === contactUser.value?.id);
  if (selected && contactUser.value !== selected) contactUser.value = selected;
  const user = users.find(item => item.id === Number(contact));
  if (user && contactUser.value?.id !== user.id) void selectContact(user);
}, { immediate: true });

watch(() => route.query.tab, (tab) => {
  activeTab.value = parseRemoteTab(tab);
});

watch(socket, (nextSocket, previousSocket) => {
  unbindPageSocketEvents(previousSocket);
  if (nextSocket) bindPageSocketEvents(nextSocket);
}, { immediate: true });

const handleVisible = () => {
  console.log('--', document.visibilityState)
  if (document.visibilityState === 'visible') {
    if (contactUser.value && unReadMessageCount.value[contactUser.value.id]) {
      void selectContact(contactUser.value);
    }
  }
}
onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisible);

  if (authUser.value && token.value) {
    await Promise.all([
      loadContacts(),
      loadMyGroups(),
      loadOfflineMessages(),
      loadPendingInvitations(),
    ]);
  }
});

onUnmounted(() => {
  unbindPageSocketEvents(socket.value);
  unread.activePrivateUserId = null;
  document.removeEventListener('visibilitychange', handleVisible);
});
</script>

<style scoped>
.contact-unread-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: #e11d48; color: #fff; font-size: 11px; line-height: 1; }
@media (max-width: 767px) {
  :deep(.remote-sidebar) {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 20;
    max-width: calc(100vw - 44px);
    transform: translateX(-100%);
    transition: transform .2s ease;
  }
  :deep(.remote-sidebar.mobile-open) { transform: translateX(0); }
}
.mobile-sidebar-toggle { display: none; }
.mobile-sidebar-close { display: none; }
@media (max-width: 767px) { .mobile-sidebar-toggle, .mobile-sidebar-close { display: inline-flex; } }
.n-tabs.n-tabs--top .n-tab-pane {
  padding-top: 0px;
}
</style>
