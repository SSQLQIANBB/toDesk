<template>
  <n-layout has-sider class="h-full w-full bg-gradient-to-br from-slate-50 to-slate-100">
    <n-layout-sider 
      bordered 
      :width="280" 
      content-class="flex flex-col bg-white shadow-lg"
    >
      <!-- 用户信息卡片 -->
      <div class="p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white">
        <div class="flex items-center gap-3 mb-3">
          <n-avatar 
            :size="48" 
            :src="authUser?.avatar || undefined"
            class="cursor-pointer ring-2 ring-white ring-opacity-50"
            @click="goToProfile"
          >
            {{ authUser?.nickname?.charAt(0) || authUser?.username?.charAt(0) || '?' }}
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
      <n-tabs type="line" animated justify-content="space-evenly" class="flex-1 flex flex-col" pane-class="flex-1" style="overflow: hidden;">
        <!-- 在线用户 -->
        <n-tab-pane name="users" tab="在线用户" display-directive="show:lazy" class="flex flex-col h-full">
          <div class="px-4 py-3 text-xs text-gray-500 font-semibold border-b bg-gray-50">
            在线用户 ({{ userList.length }})
          </div>
          <n-scrollbar style="flex: 1; max-height: calc(100vh - 280px);">
            <ul class="p-3 space-y-2">
              <n-badge 
                :offset="[-8, 8]" 
                class="w-full" 
                :value="unReadMessageCount[user.socketId] || 0" 
                :max="99"
                :show="!!unReadMessageCount[user.socketId]"
                v-for="user in userList" 
                :key="user.socketId"
              >
                <li 
                  class="w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-blue-50 hover:shadow-md border"
                  :class="contactUser?.socketId === user.socketId ? 'bg-blue-100 border-blue-300 shadow-md' : 'bg-white border-gray-200'"
                  @click="selectContact(user)"
                >
                  <n-avatar :size="40" :src="user.avatar || undefined">
                    {{ user.nickname?.charAt(0) || user.username?.charAt(0) || '?' }}
                  </n-avatar>
                  <div class="flex-1">
                    <div class="font-semibold text-sm">{{ user.nickname || user.username || `用户-${user.socketId?.slice(0, 4)}` }}</div>
                    <div class="text-xs text-gray-500">ID: {{ user?.socketId?.slice(0, 8) }}...</div>
                  </div>
                  <div class="w-2 h-2 rounded-full bg-green-400"></div>
                </li>
              </n-badge>

              <n-empty 
                v-if="!userList.length" 
                class="h-full flex items-center justify-center py-12" 
                description="暂无在线用户" 
                size="small"
              >
                <template #icon>
                  <n-icon size="48" color="#d0d0d0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  </n-icon>
                </template>
              </n-empty>
            </ul>
          </n-scrollbar>
        </n-tab-pane>

        <!-- 我的群组 -->
        <n-tab-pane name="groups" tab="我的群组" display-directive="show:lazy" class="flex flex-col h-full">
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
                    {{ group.name?.charAt(0) || 'G' }}
                  </n-avatar>
                  <div class="flex-1">
                    <div class="font-semibold text-sm">{{ group.name }}</div>
                    <div class="text-xs text-gray-500">成员: {{ group.memberCount || 0 }}</div>
                  </div>
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
        <header class="h-16 shadow-sm flex items-center px-6 bg-gradient-to-r from-white to-gray-50 border-b">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center text-white font-bold">
              {{ contactUser.socketId.slice(0, 2) }}
            </div>
            <div>
              <div class="font-bold text-base">用户-{{ contactUser.socketId.slice(0, 4) }}</div>
              <div class="text-xs text-gray-500">{{ contactUser.socketId }}</div>
            </div>
          </div>
        </header>
        <n-scrollbar class="grow p-4" ref="scrollbarRef">
          <ul class="space-y-3">
            <li class="flex flex-col w-full" :class="msg.from === currentUser?.socketId ? 'items-end' : 'items-start'" v-for="(msg, index) in currentMessageList" :key="index">
              <span class="text-xs text-gray-400 mb-1">{{msg.time}}</span>
              <div class="p-3 rounded-lg max-w-[60%] overflow-hidden text-wrap break-words shadow-sm transition-all hover:shadow-md" 
                   :class="msg.from === currentUser?.socketId ? 'bg-gradient-to-br from-blue-400 to-blue-500 text-white' : 'bg-gradient-to-br from-green-400 to-green-500 text-white'">
                {{ msg.message }}
              </div>
            </li>
          </ul>
        </n-scrollbar>
        
        <ToolBar ref="toolBarRef" :socket="socket" :contact-user="contactUser" />

        <div class="h-32 border-t bg-white">
          <TextMsg @send="sendMsg" />
        </div>
      </div>
      <div class="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100" v-else>
        <n-empty description="请从左侧选择一个联系人开始聊天" size="large">
          <template #icon>
            <n-icon size="80" color="#b0b0b0">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
              </svg>
            </n-icon>
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
import { useRouter } from 'vue-router';
import { io, type Socket } from 'socket.io-client';
import { useMessage, useDialog } from 'naive-ui';
import { useAuth } from '@/stores/auth';
import { getMyGroups, type Group } from '@/api/group';
import { getOfflineMessages, markMessagesAsRead, type OfflineMessage } from '@/api/message';
import { getPendingInvitations, acceptInvitation, rejectInvitation, type GroupInvitation } from '@/api/invitation';
import TextMsg from '@/components/TextMsg.vue';
import ToolBar from './components/ToolBar.vue';
import notificationService from '@/services/notificationService';

const router = useRouter();
const { currentUser: authUser, token, clearAuth } = useAuth();

type User = {
  id: number;
  socketId: string;
  username?: string;
  nickname?: string;
  avatar?: string;
  status?: 'online' | 'offline' | 'busy';
}

type MessageInfo = {
  time: string;
  from: string;
  message: string;
}

let socket: Socket | null = null;
const online = ref(false);
const loading = ref(false);

const message = useMessage();
const dialog = useDialog();

const currentUser = ref<User | null>(null);
const contactUser = ref<User | null>(null);

const userList = ref<User[]>([]);
const myGroups = ref<Group[]>([]);
const offlineMessages = ref<OfflineMessage[]>([]);
const pendingInvitations = ref<GroupInvitation[]>([]);

// 计算用户状态（基于Socket连接状态）
const userStatus = computed(() => {
  return online.value ? 'online' : 'offline';
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
  User['socketId'],
  MessageInfo[]
>();

const unReadMessageCount = ref<Record<string, number>>({});
const currentMessageList = ref<MessageInfo[]>([]);

// refs
const scrollbarRef = ref();
const toolBarRef = ref();

// 退出登录
async function handleLogout() {
  disconnect();
  clearAuth();
  await router.push('/login');
  window.location.reload(); // 确保完全重置状态
}

function initialSocket() {
  socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
    path: '/meeting'
  });
  loading.value = true;
  
  // 连接建立后立即认证
  socket.on('connect', () => {
    console.log('Socket已连接:', socket?.id);
    
    // 立即进行认证
    socket?.emit('authenticate', { 
      token: token.value,
      nickname: authUser.value?.nickname,
      avatar: authUser.value?.avatar
    });
  })

  // 认证成功
  socket.on('authenticated', (data) => {
    console.log('认证成功:', data);
    currentUser.value = data;
    online.value = true;
    loading.value = false;
    message.success('连接成功！');
  })
  
  // 认证失败
  socket.on('auth_error', (data) => {
    console.error('认证失败:', data);
    message.error('认证失败: ' + data.message);
    loading.value = false;
    online.value = false;
  })

  // 用户列表
  socket.on('user_list', (list: User[]) => {
    console.log('收到用户列表:', list);
    // 过滤掉当前用户
    userList.value = list.filter(u => u.id !== authUser.value?.id && u.socketId !== socket?.id)
    console.log('过滤后的用户列表:', userList.value);
  })

  // 私信
  socket.on('private_message', (data) => {
    console.log('receive-message:', data);

    setMessage(data.from, data)

    const count = unReadMessageCount.value[data.from] || 0
    unReadMessageCount.value[data.from] = count + 1

    if (data.from === contactUser.value?.socketId) {
      currentMessageList.value = privateMessageMap.get(data.from) || []
      scrollToBottom();
    }

    // 如果窗口未聚焦或不是当前联系人，显示桌面通知
    if (document.hidden || data.from !== contactUser.value?.socketId) {
      const sender = userList.value.find(u => u.socketId === data.from);
      const senderName = sender?.nickname || sender?.username || '未知用户';
      notificationService.showMessage(
        senderName,
        data.message,
        sender?.avatar,
        () => {
          // 点击通知时聚焦窗口并选择该联系人
          window.focus();
          if (sender) {
            selectContact(sender);
          }
        }
      );
    }
  })

  // WebRTC信令监听
  socket.on('webrtc_offer', (data) => {
    console.log('收到offer:', data);
    toolBarRef.value?.handleOffer(data.offer);
  })

  socket.on('webrtc_answer', (data) => {
    console.log('收到answer:', data);
    toolBarRef.value?.handleAnswer(data.answer);
  })

  socket.on('webrtc_ice', (data) => {
    console.log('收到ice candidate:', data);
    toolBarRef.value?.handleIceCandidate(data.candidate);
  })

  socket.on('webrtc_call_request', (data) => {
    console.log('收到呼叫请求:', data);
    toolBarRef.value?.handleIncomingCall(data);
    
    // 显示来电通知
    const caller = userList.value.find(u => u.socketId === data.from);
    const callerName = caller?.nickname || caller?.username || '未知用户';
    const callType = data.deviceType === 'camera' ? 'video' : data.deviceType === 'screen' ? 'screen' : 'audio';
    notificationService.showCall(callerName, callType, caller?.avatar);
  })

  socket.on('webrtc_call_response', (data) => {
    console.log('收到呼叫响应:', data);
    toolBarRef.value?.handleCallResponse(data);
  })

  socket.on('webrtc_hangup', () => {
    console.log('对方挂断');
    toolBarRef.value?.handleHangup();
  })
}

function setMessage(id: string, data: MessageInfo) {
  const list = privateMessageMap.get(id) || [];

  privateMessageMap.set(id, [...list, data])
}

function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  online.value = false;
  userList.value = [];
  contactUser.value = null;
  currentMessageList.value = [];
  currentUser.value = null;
}


function selectContact(user: User) {
  contactUser.value = user;

  if (unReadMessageCount.value[user.socketId]) {
    unReadMessageCount.value[user.socketId] = 0
  }

  currentMessageList.value = privateMessageMap.get(user.socketId) || []
}

function sendMsg(v: string) {
  console.log(v)

  // 私信
  socket?.emit('private_message', {
    to: contactUser.value,
    message: v,
  })
  
  setMessage(contactUser.value!.socketId, {
    from: socket?.id!,
    message: v,
    time: new Date().toLocaleString()
  })

  currentMessageList.value = privateMessageMap.get(contactUser.value!.socketId) || []
  scrollToBottom();
}

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    scrollbarRef.value?.scrollTo({ top: scrollbarRef.value.$el.scrollHeight, behavior: 'smooth' });
  });
}

// 加载群组列表
async function loadMyGroups() {
  try {
    const res = await getMyGroups();
    myGroups.value = res.groups || [];
  } catch (error: any) {
    console.error('加载群组列表失败:', error);
  }
}

// 加载离线消息
async function loadOfflineMessages() {
  try {
    const res = await getOfflineMessages();
    offlineMessages.value = res.messages || [];
    
    if (offlineMessages.value.length > 0) {
      // 显示桌面通知
      notificationService.showSystem(
        '离线消息',
        `您有 ${offlineMessages.value.length} 条新消息`,
        () => {
          window.focus();
          showOfflineMessagesDialog();
        }
      );
      
      // 显示离线消息对话框
      showOfflineMessagesDialog();
    }
  } catch (error: any) {
    console.error('加载离线消息失败:', error);
  }
}

// 加载群组邀请
async function loadPendingInvitations() {
  try {
    const res = await getPendingInvitations();
    pendingInvitations.value = res.invitations || [];
    
    if (pendingInvitations.value.length > 0) {
      // 显示桌面通知
      pendingInvitations.value.forEach(inv => {
        notificationService.showInvitation(
          inv.group.name,
          inv.inviter.nickname || inv.inviter.username,
          inv.inviter.avatar,
          () => {
            window.focus();
            showInvitationsDialog();
          }
        );
      });
      
      // 显示邀请对话框
      showInvitationsDialog();
    }
  } catch (error: any) {
    console.error('加载群组邀请失败:', error);
  }
}

// 显示离线消息对话框
function showOfflineMessagesDialog() {
  const messageList = offlineMessages.value.map(msg => 
    `${msg.sender.nickname || msg.sender.username}: ${msg.message}`
  ).join('\n\n');
  
  dialog.info({
    title: `您有 ${offlineMessages.value.length} 条离线消息`,
    content: messageList,
    positiveText: '已读',
    onPositiveClick: async () => {
      const messageIds = offlineMessages.value.map(msg => msg.id);
      try {
        await markMessagesAsRead(messageIds);
        offlineMessages.value = [];
        message.success('消息已标记为已读');
      } catch (error: any) {
        message.error('标记失败: ' + error.message);
      }
    }
  });
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

const handleVisible = () => {
  console.log('--', document.visibilityState)
  if (document.visibilityState === 'visible') {
    if (contactUser.value && unReadMessageCount.value[contactUser.value.socketId]) {
      unReadMessageCount.value[contactUser.value.socketId] = 0
    }
  }
}
onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisible);
  
  // 请求通知权限
  await notificationService.requestPermission();
  
  // 自动连接Socket
  if (authUser.value && token.value) {
    initialSocket();
    // 加载数据
    loadMyGroups();
    loadOfflineMessages();
    loadPendingInvitations();
  }
});

onUnmounted(() => {
  disconnect();
  document.removeEventListener('visibilitychange', handleVisible);
});
</script>
