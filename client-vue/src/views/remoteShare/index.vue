<template>
  <n-layout has-sider class="h-full w-full bg-gradient-to-br from-slate-50 to-slate-100">
    <n-layout-sider 
      bordered 
      :width="280" 
      content-class="flex flex-col bg-white shadow-lg"
    >
      <!-- 用户信息卡片 -->
      <div class="p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-white bg-opacity-20 flex items-center justify-center font-bold text-lg">
            {{ currentUser?.socketId?.slice(0, 2) || '?' }}
          </div>
          <div class="flex-1">
            <div class="font-bold text-sm">匿名用户 {{ currentUser?.socketId?.slice(0, 4) }}</div>
            <div class="flex items-center gap-2 mt-1">
              <span class="w-2 h-2 rounded-full animate-pulse" :class="online ? 'bg-green-300' : 'bg-gray-300'"></span>
              <span class="text-xs opacity-90">{{ online ? '在线' : '离线' }}</span>
            </div>
          </div>
          <n-button 
            :type="online ? 'error' : 'success'" 
            :loading="loading" 
            size="small" 
            strong
            secondary
            @click="changeOnline"
          >
            {{ online ? '退出' : '登录' }}
          </n-button>
        </div>
      </div>

      <!-- 在线用户列表 -->
      <div class="px-4 py-3 text-xs text-gray-500 font-semibold border-b bg-gray-50">
        在线用户 ({{ userList.length }})
      </div>
      <ul class="flex-1 p-3 overflow-y-auto space-y-2">
        <n-badge 
          :offset="[-8, 8]" 
          class="w-full" 
          :value="unReadMessageCount?.[user.socketId]" 
          :max="99" 
          v-for="user in userList" 
          :key="user.socketId"
        >
          <li 
            class="w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-blue-50 hover:shadow-md border"
            :class="contactUser?.socketId === user.socketId ? 'bg-blue-100 border-blue-300 shadow-md' : 'bg-white border-gray-200'"
            @click="selectContact(user)"
          >
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white font-bold">
              {{ user?.socketId?.slice(0, 2) }}
            </div>
            <div class="flex-1">
              <div class="font-semibold text-sm">用户-{{ user?.socketId?.slice(0, 4) }}</div>
              <div class="text-xs text-gray-500">ID: {{ user?.socketId?.slice(0, 8) }}...</div>
            </div>
            <div class="w-2 h-2 rounded-full bg-green-400"></div>
          </li>
        </n-badge>

        <n-empty 
          v-if="!userList.length" 
          class="h-full flex items-center justify-center" 
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
import { onMounted, onUnmounted, ref, nextTick, watch } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { useMessage } from 'naive-ui';
import TextMsg from '@/components/TextMsg.vue';
import ToolBar from './components/ToolBar.vue';

type User = {
  id: string;
  socketId: string;
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

const currentUser = ref<User | null>(null);
const contactUser = ref<User | null>(null);

const userList = ref<User[]>([]);

// 私信本地存储
const privateMessageMap = new Map<
  User['socketId'],
  MessageInfo[]
>();

const unReadMessageCount = ref<Record<string, number> | null>(null);
const currentMessageList = ref<MessageInfo[]>([]);

// refs
const scrollbarRef = ref();
const toolBarRef = ref();

function changeOnline() {
  if (!online.value) {
    loading.value = true;
    initialSocket();
  } else {
    disconnect()
  }
}
function initialSocket() {
  socket = io('http://localhost:3000', {
    path: '/meeting'
  });
  loading.value = true;
  // 连接时
  socket.on('connect', () => {
    console.log('connect:', socket)
  })

  socket.on('connected', (data) => {
    console.log('connected:', data)
    currentUser.value = data
    message.success('连接成功！')
    online.value = true;
    loading.value = false;
  })

  // 用户列表
  socket.on('user_list', (list: User[]) => {
    console.log(list);

    userList.value = list.filter(u => u.id !== currentUser.value?.id)
  })

  // 私信
  socket.on('private_message', (data) => {
    console.log('receive-message:', data);

    setMessage(data.from, data)

    const count = unReadMessageCount.value?.[data.from] || 0
    unReadMessageCount.value = {
      ...unReadMessageCount.value,
      [data.from]: count + 1,
    }

    if (data.from === contactUser.value?.socketId) {
      currentMessageList.value = privateMessageMap.get(data.from) || []
      scrollToBottom();
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
  socket?.disconnect()
  online.value = false;
  userList.value = []
  contactUser.value = null
  currentMessageList.value = []
}


function selectContact(user: User) {
  contactUser.value = user;

  if (unReadMessageCount.value?.[user.socketId]) {
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

// 监听消息列表变化，自动滚动到底部
watch(() => currentMessageList.value.length, () => {
  scrollToBottom();
});

const handleVisible = () => {
  console.log('--', document.visibilityState)
  if (document.visibilityState === 'visible') {
    if (unReadMessageCount.value && contactUser.value && unReadMessageCount.value[contactUser.value.socketId] !== undefined) {
      unReadMessageCount.value[contactUser.value.socketId] = 0
    }
  }
}
onMounted(() => {
  document.addEventListener('visibilitychange', handleVisible)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisible)
})
</script>