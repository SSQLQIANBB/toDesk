<template>
  <n-layout has-sider class="h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100">
    <!-- 侧边栏 -->
    <n-layout-sider 
      bordered 
      :width="280" 
      content-class="flex flex-col bg-white shadow-lg"
    >
      <!-- 群组信息卡片 -->
      <div class="p-4 bg-gradient-to-r from-purple-500 to-pink-600 text-white">
        <div class="flex items-center gap-3">
          <n-avatar :size="50" :src="groupInfo?.avatar || undefined">
            {{ groupInfo?.name?.charAt(0) || '?' }}
          </n-avatar>
          <div class="flex-1">
            <div class="font-bold text-base">{{ groupInfo?.name || '加载中...' }}</div>
            <div class="text-xs opacity-90 mt-1">{{ members.length }} 成员在线</div>
          </div>
        </div>
      </div>

      <!-- 成员列表 -->
      <div class="px-4 py-3 text-xs text-gray-500 font-semibold border-b bg-gray-50">
        群组成员 ({{ members.length }})
      </div>
      <ul class="flex-1 p-3 overflow-y-auto space-y-2">
        <li 
          v-for="member in members" 
          :key="member.id"
          class="flex items-center gap-3 p-3 rounded-lg bg-white border border-gray-200"
        >
          <n-avatar :size="40" :src="member.avatar || undefined">
            {{ member.nickname?.charAt(0) || member.username?.charAt(0) }}
          </n-avatar>
          <div class="flex-1">
            <div class="font-semibold text-sm">{{ member.nickname || member.username }}</div>
            <div class="flex items-center gap-2 text-xs text-gray-500 mt-1">
              <n-tag v-if="member.role === 'owner'" type="warning" size="tiny">群主</n-tag>
              <n-tag v-else-if="member.role === 'admin'" type="InfoFilled" size="tiny">管理员</n-tag>
              <span v-if="member.canSpeak === false" class="text-red-500">🔇 禁言</span>
            </div>
          </div>
          <div class="w-2 h-2 rounded-full" :class="member.online ? 'bg-green-400' : 'bg-gray-300'"></div>
        </li>

        <n-empty 
          v-if="members.length === 0" 
          class="h-full flex items-center justify-center" 
          description="暂无成员" 
          size="small"
        />
      </ul>

      <!-- 底部操作栏 -->
      <div class="p-3 border-t bg-gray-50 space-y-2">
        <n-button block secondary @click="handleVideoCall">
          <template #icon>
            <n-icon :component="VideocamFilled" />
          </template>
          发起视频通话
        </n-button>
        <n-button block secondary @click="handleScreenShare">
          <template #icon>
            <n-icon :component="ScreenShareFilled" />
          </template>
          发起屏幕共享
        </n-button>
        <n-button block secondary @click="goBack">
          <template #icon>
            <n-icon :component="ArrowBackFilled" />
          </template>
          返回
        </n-button>
      </div>
    </n-layout-sider>

    <!-- 主聊天区 -->
    <n-layout-content content-class="w-full flex flex-col">
      <div class="h-full w-full flex flex-col bg-white">
        <!-- 聊天头部 -->
        <header class="h-16 shadow-sm flex items-center px-6 bg-gradient-to-r from-white to-gray-50 border-b">
          <div class="flex items-center gap-3 flex-1">
            <n-avatar :size="40" :src="groupInfo?.avatar || undefined">
              {{ groupInfo?.name?.charAt(0) }}
            </n-avatar>
            <div>
              <div class="font-bold text-base">{{ groupInfo?.name }}</div>
              <div class="text-xs text-gray-500">{{ groupInfo?.description || '暂无简介' }}</div>
            </div>
          </div>
          <n-button secondary @click="showGroupDetail = true">
            <template #icon>
              <n-icon :component="InfoFilled" />
            </template>
            群组详情
          </n-button>
        </header>

        <!-- 消息列表 -->
        <n-scrollbar class="flex-1 p-4" ref="scrollbarRef">
          <ul class="space-y-4">
            <li 
              v-for="(msg, index) in messages" 
              :key="index"
              class="flex flex-col"
              :class="msg.isMine ? 'items-end' : 'items-start'"
            >
              <div class="flex items-end gap-2 max-w-[70%]" :class="msg.isMine ? 'flex-row-reverse' : 'flex-row'">
                <n-avatar :size="32" :src="msg.user?.avatar || undefined">
                  {{ msg.user?.nickname?.charAt(0) || msg.user?.username?.charAt(0) || '?' }}
                </n-avatar>
                <div>
                  <div class="flex items-center gap-2 mb-1" :class="msg.isMine ? 'flex-row-reverse' : 'flex-row'">
                    <span class="text-xs font-semibold text-gray-600">
                      {{ msg.user?.nickname || msg.user?.username || '未知用户' }}
                    </span>
                    <span class="text-xs text-gray-400">{{ msg.time }}</span>
                  </div>
                  <div 
                    class="p-3 rounded-lg shadow-sm break-words"
                    :class="msg.isMine 
                      ? 'bg-gradient-to-br from-blue-400 to-blue-500 text-white rounded-br-none' 
                      : 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-800 rounded-bl-none'"
                  >
                    {{ msg.message }}
                  </div>
                </div>
              </div>
            </li>

            <n-empty 
              v-if="messages.length === 0" 
              class="py-20" 
              description="暂无消息，开始聊天吧" 
              size="large"
            />
          </ul>
        </n-scrollbar>

        <!-- 输入框 -->
        <footer class="p-4 border-t bg-gray-50">
          <div class="flex gap-3">
            <n-input
              v-model:value="inputMessage"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 4 }"
              placeholder="输入消息... (Enter发送，Shift+Enter换行)"
              :disabled="!canSpeak"
              @keydown.enter.exact.prevent="handleSend"
            />
            <n-button 
              type="primary" 
              :disabled="!inputMessage.trim() || !canSpeak"
              @click="handleSend"
            >
              发送
            </n-button>
          </div>
          <div v-if="!canSpeak" class="text-xs text-red-500 mt-2">
            您已被禁言，无法发送消息
          </div>
        </footer>
      </div>
    </n-layout-content>

    <!-- 群组详情抽屉 -->
    <n-drawer v-model:show="showGroupDetail" :width="400" placement="right">
      <n-drawer-content title="群组详情">
        <n-spin :show="detailLoading">
          <div class="space-y-4">
            <!-- 群组信息 -->
            <div class="text-center">
              <n-avatar :size="80" :src="groupInfo?.avatar || undefined">
                {{ groupInfo?.name?.charAt(0) }}
              </n-avatar>
              <h3 class="text-xl font-bold mt-3">{{ groupInfo?.name }}</h3>
              <p class="text-sm text-gray-500 mt-1">{{ groupInfo?.description }}</p>
            </div>

            <n-divider />

            <!-- 群组统计 -->
            <div class="grid grid-cols-2 gap-4 text-center">
              <div class="p-3 bg-blue-50 rounded-lg">
                <div class="text-2xl font-bold text-blue-600">{{ members.length }}</div>
                <div class="text-xs text-gray-500 mt-1">群组成员</div>
              </div>
              <div class="p-3 bg-green-50 rounded-lg">
                <div class="text-2xl font-bold text-green-600">{{ onlineCount }}</div>
                <div class="text-xs text-gray-500 mt-1">在线成员</div>
              </div>
            </div>

            <n-divider />

            <!-- 快捷操作 -->
            <div class="space-y-2">
              <n-button block secondary @click="handleVideoCall">
                <template #icon>
                  <n-icon :component="VideocamFilled" />
                </template>
                发起视频通话
              </n-button>
              <n-button block secondary @click="handleScreenShare">
                <template #icon>
                  <n-icon :component="ScreenShareFilled" />
                </template>
                发起屏幕共享
              </n-button>
            </div>
          </div>
        </n-spin>
      </n-drawer-content>
    </n-drawer>
  </n-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage, type ScrollbarInst } from 'naive-ui';
import { ArrowBackFilled, VideocamFilled, ScreenShareFilled, InfoFilled } from '@vicons/material';
import { getGroupDetail, type GroupMember } from '@/api/group';
import { useAuth } from '@/stores/auth';
import { io, Socket } from 'socket.io-client';
import notificationService from '@/services/notificationService';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const { currentUser, token } = useAuth();

const groupId = ref(parseInt(route.params.id as string));
const socket = ref<Socket | null>(null);
const scrollbarRef = ref<ScrollbarInst | null>(null);

const detailLoading = ref(false);
const showGroupDetail = ref(false);

const groupInfo = ref<any>(null);
const members = ref<(GroupMember & { online?: boolean })[]>([]);
const messages = ref<any[]>([]);
const inputMessage = ref('');

// 当前用户是否可以发言
const canSpeak = computed(() => {
  const myMember = members.value.find(m => m.id === currentUser.value?.id);
  return myMember?.canSpeak !== false;
});

// 在线成员数量
const onlineCount = computed(() => {
  return members.value.filter(m => m.online).length;
});

// 加载群组详情
async function loadGroupDetail() {
  try {
    detailLoading.value = true;
    const detail = await getGroupDetail(groupId.value);
    groupInfo.value = detail.group;
    members.value = detail.members.map(m => ({ ...m, online: false }));
  } catch (error: any) {
    message.error('加载群组详情失败: ' + error.message);
    router.back();
  } finally {
    detailLoading.value = false;
  }
}

// 初始化Socket连接
function initSocket() {
  socket.value = io('http://localhost:3000', {
    path: '/meeting',
    auth: {
      token: token.value,
    },
  });

  // 认证
  socket.value.emit('authenticate', {
    token: token.value,
    nickname: currentUser.value?.nickname,
    avatar: currentUser.value?.avatar,
  });

  // 认证成功后加入群组
  socket.value.on('authenticated', () => {
    socket.value?.emit('join_group', { groupId: groupId.value });
  });

  // 接收群组成员列表
  socket.value.on('group_members', (data: { groupId: number; members: any[] }) => {
    if (data.groupId === groupId.value) {
      // 更新成员在线状态
      data.members.forEach(socketMember => {
        const member = members.value.find(m => m.id === socketMember.id);
        if (member) {
          member.online = true;
        }
      });
    }
  });

  // 新成员加入
  socket.value.on('group_member_joined', (data: { groupId: number; member: any }) => {
    if (data.groupId === groupId.value) {
      const member = members.value.find(m => m.id === data.member.id);
      if (member) {
        member.online = true;
      }
      message.info(`${data.member.nickname || data.member.username} 加入了群组`);
    }
  });

  // 成员离开
  socket.value.on('group_member_left', (_data: { socketId: string }) => {
    // 这里需要通过socketId找到对应的成员
    // 简化处理，可以在后端返回userId
  });

  // 接收群组消息
  socket.value.on('group_message', (data: any) => {
    if (data.groupId === groupId.value) {
      messages.value.push({
        message: data.message,
        time: data.time,
        user: data.user,
        isMine: false,
      });
      scrollToBottom();
      
      // 如果窗口未聚焦，显示桌面通知
      if (document.hidden && data.user?.id !== currentUser.value?.id) {
        notificationService.showGroupMessage(
          groupInfo.value?.name || '群组',
          data.user?.nickname || data.user?.username || '群成员',
          data.message,
          data.user?.avatar,
          () => {
            window.focus();
          }
        );
      }
    }
  });

  // 监听视频通话开始
  socket.value.on('group_call_started', (data: any) => {
    if (data.groupId === groupId.value) {
      const callType = data.deviceType === 2 ? '屏幕共享' : '视频通话';
      message.info(`${data.user?.nickname || data.user?.username} 发起了${callType}`);
    }
  });
}

// 发送消息
function handleSend() {
  if (!inputMessage.value.trim()) return;
  if (!canSpeak.value) {
    message.warning('您已被禁言');
    return;
  }

  const msg = {
    message: inputMessage.value,
    time: new Date().toLocaleString(),
    user: {
      id: currentUser.value?.id,
      username: currentUser.value?.username,
      nickname: currentUser.value?.nickname,
      avatar: currentUser.value?.avatar,
    },
    isMine: true,
  };

  messages.value.push(msg);
  socket.value?.emit('group_message', {
    groupId: groupId.value,
    message: inputMessage.value,
  });

  inputMessage.value = '';
  scrollToBottom();
}

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    scrollbarRef.value?.scrollTo({ top: 999999, behavior: 'smooth' });
  });
}

// 发起视频通话
function handleVideoCall() {
  router.push(`/group-video/${groupId.value}`);
}

// 发起屏幕共享
function handleScreenShare() {
  router.push(`/group-screen/${groupId.value}`);
}

// 返回
function goBack() {
  router.back();
}

onMounted(async () => {
  // 请求通知权限
  await notificationService.requestPermission();
  
  await loadGroupDetail();
  initSocket();
});

onUnmounted(() => {
  if (socket.value) {
    socket.value.emit('leave_group', { groupId: groupId.value });
    socket.value.disconnect();
  }
});
</script>

