<template>
  <div class="h-screen w-full bg-gray-900 flex flex-col">
    <!-- 头部控制栏 -->
    <header class="h-16 bg-gray-800 flex items-center justify-between px-6 shadow-lg">
      <div class="flex items-center gap-4">
        <n-avatar :size="40" :src="groupInfo?.avatar || undefined" class="ring-2 ring-white">
          {{ groupInfo?.name?.charAt(0) }}
        </n-avatar>
        <div class="text-white">
          <div class="font-bold">{{ groupInfo?.name }} - 屏幕共享</div>
          <div class="text-xs text-gray-400">
            {{ isSharing ? '正在共享屏幕' : '观看屏幕共享' }} · {{ members.length }} 人参与
          </div>
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

        <!-- 标注工具 -->
        <n-tooltip v-if="isSharing || sharer">
          <template #trigger>
            <n-button
              circle
              :type="showAnnotation ? 'primary' : 'default'"
              @click="showAnnotation = !showAnnotation"
            >
              <template #icon>
                <n-icon>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </n-icon>
              </template>
            </n-button>
          </template>
          {{ showAnnotation ? '关闭标注' : '开启标注' }}
        </n-tooltip>

        <!-- 录制功能 -->
        <MediaRecorder
          v-if="isSharing || sharer"
          :stream="screenStream"
          @recording-start="handleRecordingStart"
          @recording-stop="handleRecordingStop"
        />

        <!-- 视频质量设置 -->
        <n-dropdown :options="qualityOptions" @select="handleQualityChange">
          <n-button circle>
            <template #icon>
              <n-icon :component="TuneFilled" />
            </template>
          </n-button>
        </n-dropdown>

        <!-- 成员控制 (仅群主) -->
        <n-button v-if="isOwner" circle @click="showMemberControl = true">
          <template #icon>
            <n-icon :component="PeopleFilled" />
          </template>
        </n-button>

        <!-- 开始/停止共享 -->
        <n-button v-if="!isSharing && !sharer" type="primary" @click="startScreenShare">
          <template #icon>
            <n-icon :component="ScreenShareFilled" />
          </template>
          开始共享
        </n-button>
        <n-button v-if="isSharing" type="warning" @click="stopScreenShare">
          <template #icon>
            <n-icon :component="CancelPresentationFilled" />
          </template>
          停止共享
        </n-button>

        <!-- 退出 -->
        <n-button type="error" @click="handleExit">
          <template #icon>
            <n-icon :component="CallEndFilled" />
          </template>
          退出
        </n-button>
      </div>
    </header>

    <!-- 主内容区 -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 屏幕共享主区域 -->
      <div class="flex-1 p-4 flex items-center justify-center">
        <div class="relative w-full h-full bg-gray-800 rounded-lg overflow-hidden shadow-2xl">
          <!-- 共享屏幕视频 -->
          <video
            v-if="isSharing || sharer"
            ref="screenVideoRef"
            autoplay
            playsinline
            class="w-full h-full object-contain"
          ></video>
          
          <!-- 无共享提示 -->
          <div v-else class="absolute inset-0 flex flex-col items-center justify-center text-white">
            <n-icon :component="ScreenShareFilled" :size="80" class="text-gray-600 mb-4" />
            <h3 class="text-xl font-bold mb-2">等待屏幕共享</h3>
            <p class="text-gray-400">暂无成员共享屏幕</p>
          </div>

          <!-- 共享者信息 -->
          <div v-if="sharer" class="absolute top-4 left-4 bg-black bg-opacity-70 px-4 py-2 rounded-lg">
            <div class="flex items-center gap-2 text-white">
              <n-avatar :size="30" :src="sharer.avatar || undefined">
                {{ sharer.nickname?.charAt(0) || sharer.username?.charAt(0) }}
              </n-avatar>
              <span class="font-semibold">
                {{ sharer.nickname || sharer.username }} 正在共享
              </span>
            </div>
          </div>

          <!-- 视频质量指示器 -->
          <div class="absolute top-4 right-4 bg-black bg-opacity-70 px-3 py-1 rounded-full">
            <span class="text-white text-sm">{{ currentQualityLabel }}</span>
          </div>

          <!-- 控制覆盖层 (鼠标悬停显示) -->
          <div v-if="isSharing" class="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 px-4 py-2 rounded-lg">
            <span class="text-white text-sm">正在共享您的屏幕</span>
          </div>
        </div>
      </div>

      <!-- 侧边栏 - 参与者列表 -->
      <div class="w-64 bg-gray-800 p-4 overflow-y-auto">
        <div class="text-white font-semibold mb-4">参与者 ({{ members.length }})</div>
        <div class="space-y-2">
          <div
            v-for="member in members"
            :key="member.id"
            class="flex items-center gap-3 p-2 bg-gray-700 rounded-lg"
          >
            <n-avatar :size="36" :src="member.avatar || undefined">
              {{ member.nickname?.charAt(0) || member.username?.charAt(0) }}
            </n-avatar>
            <div class="flex-1 min-w-0">
              <div class="text-white text-sm font-medium truncate">
                {{ member.nickname || member.username }}
                {{ member.id === currentUser?.id ? ' (我)' : '' }}
              </div>
              <div class="flex items-center gap-1">
                <n-tag v-if="member.role === 'owner'" type="warning" size="tiny">群主</n-tag>
                <n-icon v-if="member.isMicMuted" :component="MicOffFilled" :size="14" color="#ef4444" />
              </div>
            </div>
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { 
  MicFilled, 
  MicOffFilled, 
  CallEndFilled, 
  ScreenShareFilled, 
  CancelPresentationFilled,
  TuneFilled,
  PeopleFilled
} from '@vicons/material';
import { io, Socket } from 'socket.io-client';
import { getGroupDetail, type GroupMember } from '@/api/group';
import { useAuth } from '@/stores/auth';
import ScreenAnnotation from '@/components/ScreenAnnotation.vue';
import MediaRecorder from '@/components/MediaRecorder.vue';

const route = useRoute();
const router = useRouter();
const message = useMessage();
const { currentUser, token } = useAuth();

const groupId = ref(parseInt(route.params.id as string));
const socket = ref<Socket | null>(null);

const screenVideoRef = ref<HTMLVideoElement | null>(null);

const groupInfo = ref<any>(null);
const members = ref<(GroupMember & { socketId?: string; isMicMuted?: boolean })[]>([]);

const isSharing = ref(false); // 当前用户是否正在共享
const sharer = ref<any>(null); // 当前共享者信息
const isMicMuted = ref(false);
const showMemberControl = ref(false);
const showAnnotation = ref(false); // 是否显示标注

const localStream = ref<MediaStream | null>(null);
const peerConnection = ref<RTCPeerConnection | null>(null);
const currentQuality = ref('high'); // 当前视频质量
const screenStream = computed(() => localStream.value); // 用于录制

// 视频质量配置
const qualityPresets = {
  low: { width: 1280, height: 720, frameRate: 15 },
  medium: { width: 1920, height: 1080, frameRate: 24 },
  high: { width: 1920, height: 1080, frameRate: 30 },
  ultra: { width: 2560, height: 1440, frameRate: 30 },
};

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

// 当前质量标签
const currentQualityLabel = computed(() => {
  const labels: any = {
    low: '流畅 720p',
    medium: '标清 1080p',
    high: '高清 1080p',
    ultra: '超清 2K',
  };
  return labels[currentQuality.value];
});

// 质量选项
const qualityOptions = computed(() => [
  { label: '流畅 720p@15fps', key: 'low' },
  { label: '标清 1080p@24fps', key: 'medium' },
  { label: '高清 1080p@30fps', key: 'high' },
  { label: '超清 2K@30fps', key: 'ultra' },
]);

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
  });

  // 接收群组成员列表
  socket.value.on('group_members', (data: any) => {
    if (data.groupId === groupId.value) {
      // 更新成员列表
      data.members.forEach((socketMember: any) => {
        const member = members.value.find(m => m.id === socketMember.id);
        if (member) {
          member.socketId = socketMember.socketId;
        }
      });
    }
  });

  // 通话开始
  socket.value.on('group_call_started', (data: any) => {
    if (data.groupId === groupId.value && data.deviceType === 2) {
      // 屏幕共享开始
      if (data.from !== socket.value?.id) {
        sharer.value = data.user;
        message.info(`${data.user?.nickname || data.user?.username} 开始共享屏幕`);
      }
    }
  });

  // 通话结束
  socket.value.on('group_call_ended', (data: any) => {
    if (data.groupId === groupId.value) {
      if (sharer.value && data.from === sharer.value.socketId) {
        sharer.value = null;
        message.info('屏幕共享已结束');
      }
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
    const member = members.value.find(m => m.socketId === data.socketId);
    if (member) {
      member.isMicMuted = data.muted;
    }
  });
}

// 开始屏幕共享
async function startScreenShare() {
  try {
    const preset = qualityPresets[currentQuality.value as keyof typeof qualityPresets];
    
    // 获取屏幕共享流
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        frameRate: { ideal: preset.frameRate },
      },
      audio: false,
    });

    // 获取音频流 (如果需要语音)
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    // 合并流
    localStream.value = new MediaStream([
      ...screenStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ]);

    // 显示本地屏幕
    if (screenVideoRef.value && localStream.value) {
      screenVideoRef.value.srcObject = localStream.value;
    }

    isSharing.value = true;

    // 通知服务器开始共享
    socket.value?.emit('group_call_start', {
      groupId: groupId.value,
      deviceType: 2, // 2: 屏幕共享
    });

    // 监听屏幕共享停止
    const videoTrack = screenStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        stopScreenShare();
      };
    }

    // 向所有成员发送流
    broadcastStream();
  } catch (error: any) {
    message.error('开始屏幕共享失败: ' + error.message);
  }
}

// 停止屏幕共享
function stopScreenShare() {
  localStream.value?.getTracks().forEach(track => track.stop());
  localStream.value = null;
  isSharing.value = false;

  if (peerConnection.value) {
    peerConnection.value.close();
    peerConnection.value = null;
  }

  socket.value?.emit('group_call_end', { groupId: groupId.value });
  message.info('已停止屏幕共享');
}

// 广播流到所有成员
async function broadcastStream() {
  // 这里简化处理，实际应该为每个成员创建独立的连接
  // 在实际应用中，应该使用 SFU (Selective Forwarding Unit) 服务器
}

// 创建对等连接
async function createPeerConnection(socketId: string) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  });

  // 添加本地流
  if (isSharing.value && localStream.value) {
    localStream.value.getTracks().forEach(track => {
      pc.addTrack(track, localStream.value!);
    });
  }

  // 处理远程流
  pc.ontrack = (event) => {
    if (screenVideoRef.value && event.streams[0]) {
      screenVideoRef.value.srcObject = event.streams[0];
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

  peerConnection.value = pc;

  // 创建并发送 offer
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  socket.value?.emit('group_webrtc_offer', {
    to: socketId,
    offer,
    deviceType: 2,
    groupId: groupId.value,
  });
}

// 处理 offer
async function handleOffer(_from: string, offer: RTCSessionDescriptionInit) {
  await createPeerConnection(_from);
  
  if (peerConnection.value) {
    await peerConnection.value.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.value.createAnswer();
    await peerConnection.value.setLocalDescription(answer);
    
    socket.value?.emit('group_webrtc_answer', {
      to: _from,
      answer,
    });
  }
}

// 处理 answer
async function handleAnswer(_from: string, answer: RTCSessionDescriptionInit) {
  if (peerConnection.value) {
    await peerConnection.value.setRemoteDescription(new RTCSessionDescription(answer));
  }
}

// 处理 ICE 候选
async function handleIceCandidate(_from: string, candidate: RTCIceCandidateInit) {
  if (peerConnection.value) {
    await peerConnection.value.addIceCandidate(new RTCIceCandidate(candidate));
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

// 修改视频质量
async function handleQualityChange(key: string) {
  currentQuality.value = key;
  message.success(`视频质量已切换为 ${currentQualityLabel.value}`);
  
  // 如果正在共享，重新获取流
  if (isSharing.value) {
    const wasSharing = isSharing.value;
    stopScreenShare();
    if (wasSharing) {
      await startScreenShare();
    }
  }
}

// 退出
function handleExit() {
  if (isSharing.value) {
    stopScreenShare();
  }
  
  socket.value?.emit('leave_group', { groupId: groupId.value });
  socket.value?.disconnect();
  
  router.back();
}

// 录制功能回调
function handleRecordingStart() {
  message.success('开始录制屏幕共享');
}

function handleRecordingStop(blob: Blob) {
  message.success(`录制完成，文件大小: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
  // 可以在这里上传到服务器
}

onMounted(async () => {
  await loadGroupDetail();
  initSocket();
});

onUnmounted(() => {
  handleExit();
});
</script>

