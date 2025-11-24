<template>
  <div class="h-screen w-full bg-gray-900 flex flex-col">
    <!-- 头部控制栏 -->
    <header class="h-16 bg-gray-800 flex items-center justify-between px-6 shadow-lg">
      <div class="flex items-center gap-4">
        <n-avatar :size="40" :src="groupInfo?.avatar || undefined" class="ring-2 ring-white">
          {{ groupInfo?.name?.charAt(0) }}
        </n-avatar>
        <div class="text-white">
          <div class="font-bold">{{ groupInfo?.name }}</div>
          <div class="text-xs text-gray-400">{{ members.length }} 人参与通话</div>
        </div>
      </div>
      
      <div class="flex items-center gap-3">
        <!-- 麦克风控制 -->
        <n-tooltip>
          <template #trigger>
            <n-button
              circle
              :type="isMicMuted ? 'error' : 'default'"
              @click="toggleMic"
              :disabled="!canSpeak"
            >
              <template #icon>
                <n-icon :component="isMicMuted ? MicOffFilled : MicFilled" />
              </template>
            </n-button>
          </template>
          {{ isMicMuted ? '打开麦克风' : '关闭麦克风' }}
        </n-tooltip>

        <!-- 摄像头控制 -->
        <n-tooltip>
          <template #trigger>
            <n-button
              circle
              :type="isCameraOff ? 'error' : 'default'"
              @click="toggleCamera"
            >
              <template #icon>
                <n-icon :component="isCameraOff ? VideocamOffFilled : VideocamFilled" />
              </template>
            </n-button>
          </template>
          {{ isCameraOff ? '打开摄像头' : '关闭摄像头' }}
        </n-tooltip>

        <!-- 设置 -->
        <n-dropdown v-if="isOwner" :options="settingsOptions" @select="handleSettingSelect">
          <n-button circle>
            <template #icon>
              <n-icon :component="SettingsFilled" />
            </template>
          </n-button>
        </n-dropdown>

        <!-- 退出通话 -->
        <n-button type="error" @click="handleHangup">
          <template #icon>
            <n-icon :component="CallEndFilled" />
          </template>
          退出通话
        </n-button>
      </div>
    </header>

    <!-- 视频区域 -->
    <div class="flex-1 overflow-hidden p-4">
      <div class="h-full grid gap-4" :class="videoGridClass">
        <!-- 本地视频 -->
        <div class="relative bg-gray-800 rounded-lg overflow-hidden shadow-xl">
          <video
            ref="localVideoRef"
            autoplay
            muted
            playsinline
            class="w-full h-full object-cover"
            :class="{ 'mirror': !isCameraOff }"
          ></video>
          <div class="absolute bottom-3 left-3 bg-black bg-opacity-60 px-3 py-1 rounded-full">
            <span class="text-white text-sm font-semibold">
              {{ currentUser?.nickname || currentUser?.username }} (我)
            </span>
          </div>
          <div v-if="isCameraOff" class="absolute inset-0 flex items-center justify-center bg-gray-700">
            <n-avatar :size="80" :src="currentUser?.avatar || undefined">
              {{ currentUser?.nickname?.charAt(0) || currentUser?.username?.charAt(0) }}
            </n-avatar>
          </div>
          <div v-if="isMicMuted" class="absolute top-3 right-3 bg-red-500 p-2 rounded-full">
            <n-icon :component="MicOffFilled" :size="16" color="white" />
          </div>
        </div>

        <!-- 远程视频 -->
        <div
          v-for="peer in remotePeers"
          :key="peer.userId"
          class="relative bg-gray-800 rounded-lg overflow-hidden shadow-xl"
        >
          <video
            :ref="el => setRemoteVideoRef(peer.userId, el)"
            autoplay
            playsinline
            class="w-full h-full object-cover"
          ></video>
          <div class="absolute bottom-3 left-3 bg-black bg-opacity-60 px-3 py-1 rounded-full">
            <span class="text-white text-sm font-semibold">
              {{ peer.user?.nickname || peer.user?.username }}
            </span>
          </div>
          <div v-if="peer.isCameraOff" class="absolute inset-0 flex items-center justify-center bg-gray-700">
            <n-avatar :size="80" :src="peer.user?.avatar || undefined">
              {{ peer.user?.nickname?.charAt(0) || peer.user?.username?.charAt(0) }}
            </n-avatar>
          </div>
          <div v-if="peer.isMicMuted" class="absolute top-3 right-3 bg-red-500 p-2 rounded-full">
            <n-icon :component="MicOffFilled" :size="16" color="white" />
          </div>
        </div>
      </div>
    </div>

    <!-- 成员控制抽屉 (仅群主可见) -->
    <n-drawer v-model:show="showMemberControl" :width="350" placement="right">
      <n-drawer-content title="成员控制">
        <div class="space-y-3">
          <div
            v-for="member in members"
            :key="member.id"
            class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
          >
            <div class="flex items-center gap-3">
              <n-avatar :size="40" :src="member.avatar || undefined">
                {{ member.nickname?.charAt(0) || member.username?.charAt(0) }}
              </n-avatar>
              <div>
                <div class="font-semibold">{{ member.nickname || member.username }}</div>
                <div class="text-xs text-gray-500">
                  <n-tag v-if="member.role === 'owner'" type="warning" size="tiny">群主</n-tag>
                  <n-tag v-else-if="member.role === 'admin'" type="info" size="tiny">管理员</n-tag>
                </div>
              </div>
            </div>
            <div v-if="member.id !== currentUser?.id && isOwner" class="flex flex-col gap-2">
              <n-switch
                :value="member.canSpeak"
                @update:value="(val: boolean) => handleControlMemberMic(member.socketId || '', val)"
                size="small"
              >
                <template #checked>可发言</template>
                <template #unchecked>禁言</template>
              </n-switch>
            </div>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { 
  MicFilled, 
  MicOffFilled, 
  VideocamFilled, 
  VideocamOffFilled, 
  CallEndFilled, 
  SettingsFilled 
} from '@vicons/material';
import { io, Socket } from 'socket.io-client';
import { getGroupDetail, type GroupMember } from '@/api/group';
import { useAuth } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const { currentUser, token } = useAuth();

const groupId = ref(parseInt(route.params.id as string));
const socket = ref<Socket | null>(null);

const localVideoRef = ref<HTMLVideoElement | null>(null);
const remoteVideoRefs = reactive<Map<number, HTMLVideoElement>>(new Map());

const groupInfo = ref<any>(null);
const members = ref<(GroupMember & { socketId?: string; online?: boolean })[]>([]);
const remotePeers = ref<any[]>([]);

const isMicMuted = ref(false);
const isCameraOff = ref(false);
const showMemberControl = ref(false);

const localStream = ref<MediaStream | null>(null);
const peerConnections = reactive<Map<string, RTCPeerConnection>>(new Map());

// 是否是群主
const isOwner = computed(() => {
  const myMember = members.value.find(m => m.id === currentUser.value?.id);
  return myMember?.role === 'owner';
});

// 是否可以发言
const canSpeak = computed(() => {
  const myMember = members.value.find(m => m.id === currentUser.value?.id);
  return myMember?.canSpeak !== false;
});

// 视频网格布局类
const videoGridClass = computed(() => {
  const total = remotePeers.value.length + 1;
  if (total === 1) return 'grid-cols-1';
  if (total === 2) return 'grid-cols-2';
  if (total <= 4) return 'grid-cols-2 grid-rows-2';
  if (total <= 6) return 'grid-cols-3 grid-rows-2';
  if (total <= 9) return 'grid-cols-3 grid-rows-3';
  return 'grid-cols-4';
});

// 设置选项
const settingsOptions = computed(() => [
  {
    label: '成员控制',
    key: 'members',
  },
]);

// 设置远程视频引用
function setRemoteVideoRef(userId: number, el: any) {
  if (el) {
    remoteVideoRefs.set(userId, el);
  }
}

// 加载群组详情
async function loadGroupDetail() {
  try {
    const detail = await getGroupDetail(groupId.value);
    groupInfo.value = detail.group;
    members.value = detail.members;
  } catch (error: any) {
    message.error('加载群组详情失败: ' + error.message);
    router.back();
  }
}

// 初始化本地媒体流
async function initLocalStream() {
  try {
    localStream.value = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: true,
    });

    if (localVideoRef.value) {
      localVideoRef.value.srcObject = localStream.value;
    }
  } catch (error: any) {
    message.error('获取媒体设备失败: ' + error.message);
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

  socket.value.emit('authenticate', {
    token: token.value,
    nickname: currentUser.value?.nickname,
    avatar: currentUser.value?.avatar,
  });

  socket.value.on('authenticated', () => {
    socket.value?.emit('join_group', { groupId: groupId.value });
    socket.value?.emit('group_call_start', { 
      groupId: groupId.value, 
      deviceType: 1 // 1: 视频通话
    });
  });

  // 接收群组成员列表
  socket.value.on('group_members', (data: any) => {
    if (data.groupId === groupId.value) {
      data.members.forEach((member: any) => {
        if (member.id !== currentUser.value?.id) {
          createPeerConnection(member.socketId, member);
        }
      });
    }
  });

  // 新成员加入
  socket.value.on('group_member_joined', (data: any) => {
    if (data.groupId === groupId.value && data.member.id !== currentUser.value?.id) {
      createPeerConnection(data.member.socketId, data.member);
    }
  });

  // WebRTC 信令
  socket.value.on('group_webrtc_offer', async (data: any) => {
    await handleOffer(data.from, data.offer);
  });

  socket.value.on('group_webrtc_answer', async (data: any) => {
    await handleAnswer(data.from, data.answer);
  });

  socket.value.on('group_webrtc_ice', async (data: any) => {
    await handleIceCandidate(data.from, data.candidate);
  });

  // 麦克风权限变化
  socket.value.on('mic_permission_changed', (data: any) => {
    if (data.groupId === groupId.value) {
      if (!data.canSpeak) {
        isMicMuted.value = true;
        message.warning('您已被群主禁言');
      } else {
        message.success('您已被允许发言');
      }
    }
  });

  // 成员麦克风状态变化
  socket.value.on('member_mic_changed', (data: any) => {
    const peer = remotePeers.value.find(p => p.socketId === data.socketId);
    if (peer) {
      peer.isMicMuted = data.muted;
    }
  });
}

// 创建对等连接
async function createPeerConnection(socketId: string, user: any) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  });

  // 添加本地流
  localStream.value?.getTracks().forEach(track => {
    pc.addTrack(track, localStream.value!);
  });

  // 处理远程流
  pc.ontrack = (event) => {
    const peer = remotePeers.value.find(p => p.socketId === socketId);
    if (peer && event.streams[0]) {
      peer.stream = event.streams[0];
      const videoEl = remoteVideoRefs.get(peer.userId);
      if (videoEl) {
        videoEl.srcObject = event.streams[0];
      }
    }
  };

  // ICE 候选
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.value?.emit('group_webrtc_ice', {
        to: socketId,
        candidate: event.candidate,
        groupId: groupId.value,
      });
    }
  };

  peerConnections.set(socketId, pc);

  // 添加到远程对等列表
  remotePeers.value.push({
    socketId,
    userId: user.id,
    user,
    stream: null,
    isMicMuted: false,
    isCameraOff: false,
  });

  // 创建并发送 offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  socket.value?.emit('group_webrtc_offer', {
    to: socketId,
    offer,
    deviceType: 1,
    groupId: groupId.value,
  });
}

// 处理 offer
async function handleOffer(from: string, offer: RTCSessionDescriptionInit) {
  let pc = peerConnections.get(from);
  
  if (!pc) {
    // 如果连接不存在，创建新的
    const member = members.value.find(m => m.socketId === from);
    if (member) {
      await createPeerConnection(from, member);
      pc = peerConnections.get(from);
    }
  }

  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.value?.emit('group_webrtc_answer', {
      to: from,
      answer,
    });
  }
}

// 处理 answer
async function handleAnswer(from: string, answer: RTCSessionDescriptionInit) {
  const pc = peerConnections.get(from);
  if (pc) {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
}

// 处理 ICE 候选
async function handleIceCandidate(from: string, candidate: RTCIceCandidateInit) {
  const pc = peerConnections.get(from);
  if (pc) {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

// 切换麦克风
function toggleMic() {
  if (!canSpeak.value) {
    message.warning('您已被禁言');
    return;
  }

  isMicMuted.value = !isMicMuted.value;
  localStream.value?.getAudioTracks().forEach(track => {
    track.enabled = !isMicMuted.value;
  });

  socket.value?.emit('toggle_mic', {
    groupId: groupId.value,
    muted: isMicMuted.value,
  });
}

// 切换摄像头
function toggleCamera() {
  isCameraOff.value = !isCameraOff.value;
  localStream.value?.getVideoTracks().forEach(track => {
    track.enabled = !isCameraOff.value;
  });
}

// 控制成员麦克风
function handleControlMemberMic(socketId: string, canSpeak: boolean) {
  socket.value?.emit('control_member_mic', {
    groupId: groupId.value,
    targetSocketId: socketId,
    canSpeak,
  });
  
  // 更新本地数据
  const member = members.value.find(m => m.socketId === socketId);
  if (member) {
    member.canSpeak = canSpeak;
  }
}

// 处理设置选择
function handleSettingSelect(key: string) {
  if (key === 'members') {
    showMemberControl.value = true;
  }
}

// 挂断
function handleHangup() {
  // 停止本地流
  localStream.value?.getTracks().forEach(track => track.stop());
  
  // 关闭所有对等连接
  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();
  
  // 通知服务器
  socket.value?.emit('group_call_end', { groupId: groupId.value });
  socket.value?.emit('leave_group', { groupId: groupId.value });
  socket.value?.disconnect();
  
  router.back();
}

onMounted(async () => {
  await loadGroupDetail();
  await initLocalStream();
  initSocket();
});

onUnmounted(() => {
  handleHangup();
});
</script>

<style scoped>
.mirror {
  transform: scaleX(-1);
}
</style>

