<template>
  <n-layout has-sider class="h-full w-full bg-slate-50">
    <n-layout-sider content-class="flex flex-col bg-gray-100">
      <div class="h-10 px-2 flex items-center gap-2 rounded-md bg-neutral-300">
        <span class="font-bold">匿名用户 {{ currentUser?.socketId?.slice(0, 2) }}</span>
        <span class="w-[10px] h-[10px] rounded-full" :class="online ? 'bg-lime-400' : 'bg-gray-400'"></span>
        <n-button :type="online ? 'error' : 'primary'" :loading="loading" size="tiny" text class="ml-auto" @click="changeOnline">{{ online ? '退出' : '登录' }}</n-button>
      </div>
      <div class="p-2 text-xs border-b">在线用户</div>
      <ul class="grow p-2 flex flex-col gap-2">
        <n-badge :offset="[-5, 5]" class="w-full" :value="unReadMessageCount?.[user.socketId]" :max="99" v-for="user in userList" :key="user.socketId">
          <li class="h-16 w-full flex items-center px-4 shadow rounded cursor-pointer" @click="selectContact(user)">
            <span class="font-bold">用户{{ user?.socketId?.slice(0, 2) }}</span>
          </li>
        </n-badge>

        <n-empty class="h-full justify-center" v-if="!userList.length" description="暂无用户" size="small"></n-empty>
      </ul>
    </n-layout-sider>
    <n-layout-content content-class="w-full">
      <div v-if="contactUser" class="h-full w-full flex flex-col ">
        <header class="h-16 shadow flex items-center p-4">
          <span class="font-bold ">用户-{{ contactUser.socketId.slice(0, 4) }}</span>
        </header>
        <n-scrollbar class="grow p-4" content-class="[&>li+li]:mt-4">
          <li class="list-none flex flex-col w-full overflow-hidden" :class="msg.from === currentUser?.socketId ? 'items-end' : 'items-start'" v-for="(msg, index) in currentMessageList" :key="index">
            <span class="text-xs text-gray-400">{{msg.time}}</span>
            <div class="p-2 rounded-md max-w-[60%] overflow-hidden text-wrap break-all" :class="msg.from === currentUser?.socketId ? 'bg-violet-400' : 'bg-emerald-300'">{{ msg.message }}</div>
          </li>
        </n-scrollbar>
        
        <ToolBar>

        </ToolBar>
        <div class="h-1/5">
          <TextMsg @send="sendMsg" />
        </div>
      </div>
      <div class="h-full w-full flex items-center justify-center" v-else>
        <n-empty description="请选择联系人"></n-empty>
      </div>
    </n-layout-content>
    </n-layout>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { useMessage } from 'naive-ui';
import TextMsg from '@/components/TextMsg.vue';
import ToolBar from './components/ToolBar.vue';

type User = {
  id: string;
  socketId: string;
  // name: string
}

type MessageInfo = {
    time: string;
    from: string;
    message: string;
  }

let socket: Socket | null = null;
const online = ref(false);
const loading = ref(false);

const __MAX_COUNT__ = 3;
let count = 0;

const message = useMessage();

const currentUser = ref<User | null>(null);
const contactUser  =ref<User | null>(null)

const userList = ref<User[]>([])

const privateMessageMap = new Map<
  User['socketId'],
  MessageInfo[]
>();

const unReadMessageCount = ref<Record<string, number> | null>(null)
const currentMessageList = ref<MessageInfo[]>([])

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
    count = 0;
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
    }
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
}

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