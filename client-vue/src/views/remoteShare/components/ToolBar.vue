<template>
  <div v-if="isSupportMedia" class="h-12 flex items-center gap-2 px-3 bg-gradient-to-r from-slate-200 to-slate-300 border-t border-slate-400 shadow-sm">
    <n-tooltip placement="top">
      <template #trigger>
        <n-button 
          circle 
          :type="connectionType === DEVICE_TYPE.SCREEN && isConnected ? 'error' : 'default'"
          :disabled="isConnecting || !contactUser"
          @click="handleMedia(DEVICE_TYPE.SCREEN)"
          class="transition-all hover:scale-110"
        >
          <template #icon>
            <n-icon :size="20"><DeviceMeetingRoomRemote16Filled /></n-icon>
          </template>
        </n-button>
      </template>
      {{ contactUser ? '屏幕共享' : '请先选择联系人' }}
    </n-tooltip>
    
    <n-tooltip placement="top">
      <template #trigger>
        <n-button 
          circle 
          :type="connectionType === DEVICE_TYPE.CAMERA && isConnected ? 'error' : 'default'"
          :disabled="isConnecting || !contactUser"
          @click="handleMedia(DEVICE_TYPE.CAMERA)"
          class="transition-all hover:scale-110"
        >
          <template #icon>
            <n-icon :size="20"><Video16Filled /></n-icon>
          </template>
        </n-button>
      </template>
      {{ contactUser ? '视频通话' : '请先选择联系人' }}
    </n-tooltip>

    <n-button 
      v-if="isConnected"
      circle 
      type="error"
      :loading="isConnecting"
      @click="hangup"
      class="ml-auto transition-all hover:scale-110"
    >
      <template #icon>
        <n-icon :size="20"><CallEnd24Regular /></n-icon>
      </template>
    </n-button>

    <n-tag v-if="isConnected" type="success" size="small" class="ml-2">
      <template #icon>
        <n-icon><Wifi124Regular /></n-icon>
      </template>
      已连接
    </n-tag>
  </div>
  <n-alert v-else title="" type="error" size="small">
    <template #header>
      <div class="text-sm">您的浏览器不支持WebRTC，请使用Chrome、Firefox或Edge等现代浏览器</div>
    </template>
  </n-alert>

  <!-- 视频通话窗口 -->
  <n-modal
    v-model:show="connectModalShow"
    :mask-closable="false"
    preset="card"
    class="w-auto"
    :style="{
      width: connectionType === DEVICE_TYPE.CAMERA ? '80vw' : '90vw',
      maxWidth: '1400px'
    }"
  >
    <template #header>
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold">
          {{ connectionType === DEVICE_TYPE.SCREEN ? '屏幕共享' : '视频通话' }} - {{ contactUserName }}
        </span>
        <n-space>
          <n-tag v-if="connectionStatus === 'connecting'" type="warning" size="small">
            连接中...
          </n-tag>
          <n-tag v-else-if="connectionStatus === 'connected'" type="success" size="small">
            已连接
          </n-tag>
          <n-tag v-else type="error" size="small">
            未连接
          </n-tag>
        </n-space>
      </div>
    </template>

    <div class="flex gap-4" :class="connectionType === DEVICE_TYPE.CAMERA ? 'flex-row' : 'flex-col'">
      <!-- 对方画面 -->
      <div class="relative bg-gray-900 rounded-lg overflow-hidden" 
           :class="connectionType === DEVICE_TYPE.CAMERA ? 'flex-1' : 'w-full aspect-video'">
        <div v-if="!isRemoteStreamReady" class="absolute inset-0 flex items-center justify-center text-white">
          <n-spin size="large" />
          <span class="ml-4">等待对方连接...</span>
        </div>
        <video ref="videoRef" class="w-full h-full object-contain" autoplay playsinline />
        <div class="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
          对方画面
        </div>
      </div>

      <!-- 我的画面（仅视频通话时显示） -->
      <div v-if="connectionType === DEVICE_TYPE.CAMERA" 
           class="relative bg-gray-900 rounded-lg overflow-hidden w-80 aspect-video">
        <video ref="videoSelfRef" class="w-full h-full object-cover" autoplay playsinline muted />
        <div class="absolute bottom-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
          我的画面
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-center gap-4">
        <n-button type="error" @click="hangup" size="large">
          <template #icon>
            <n-icon><CallEnd24Regular /></n-icon>
          </template>
          挂断
        </n-button>
      </div>
    </template>
  </n-modal>

  <!-- 来电提示 -->
  <n-modal
    v-model:show="incomingCallShow"
    :mask-closable="false"
    preset="dialog"
    title="来电提示"
    positive-text="接听"
    negative-text="拒绝"
    @positive-click="acceptCall"
    @negative-click="rejectCall"
  >
    <div class="text-center py-4">
      <n-icon size="60" color="#18a058" class="mb-4">
        <Video16Filled />
      </n-icon>
      <p class="text-lg">
        <span class="font-bold">{{ incomingCallFrom }}</span> 
        {{ incomingCallType === DEVICE_TYPE.SCREEN ? '请求屏幕共享' : '发起视频通话' }}
      </p>
    </div>
  </n-modal>
</template>

<script lang="ts" setup>
import { DeviceMeetingRoomRemote16Filled, Video16Filled, CallEnd24Regular, Wifi124Regular } from '@vicons/fluent'
import { nextTick, ref, computed } from 'vue';
import { cameraConstraints, screenRecordConstraints } from './config';
import { useMessage } from 'naive-ui';
import type { Socket } from 'socket.io-client';

enum DEVICE_TYPE {
  CAMERA = 0,
  SCREEN = 1,
}

enum RTC_TYPE {
  CALLER = 0, // 主动呼叫 
  CALLEE = 1 // 被呼叫
}

type User = {
  id: number;
  socketId: string;
  username?: string;
  nickname?: string;
  avatar?: string;
}

const props = defineProps<{
  socket: Socket | null;
  contactUser: User | null;
}>();

const message = useMessage();

const isSupportMedia = ref(!!navigator?.mediaDevices?.getUserMedia)

// 连接状态
const connectionType = ref<DEVICE_TYPE | null>(null);
const connectionStatus = ref<'disconnected' | 'connecting' | 'connected'>('disconnected');
const connectModalShow = ref(false);
const isConnecting = ref(false);
const isConnected = ref(false);
const isRemoteStreamReady = ref(false);

// 来电相关
const incomingCallShow = ref(false);
const incomingCallFrom = ref('');
const incomingCallType = ref<DEVICE_TYPE>(DEVICE_TYPE.CAMERA);
const incomingCallFromSocketId = ref('');

let currentStream: MediaStream | null = null;
const videoRef = ref<HTMLVideoElement | null>(null)
const videoSelfRef = ref<HTMLVideoElement | null>(null)

const contactUserName = computed(() => {
  return props.contactUser ? `用户${props.contactUser.socketId.slice(0, 4)}` : '';
});

// 发起通话
async function handleMedia(type = DEVICE_TYPE.CAMERA) {
  if (!props.contactUser) {
    message.warning('请先选择联系人');
    return;
  }

  if (isConnected.value) {
    message.warning('已有进行中的通话');
    return;
  }

  try {
    isConnecting.value = true;
    connectionStatus.value = 'connecting';
    connectionType.value = type;

    // 先获取媒体流
    await initDeviceMedia(type);

    // 发送呼叫请求
    props.socket?.emit('webrtc_call_request', {
      to: props.contactUser,
      deviceType: type
    });

    message.info('正在呼叫...');
  } catch (error: any) {
    console.error('发起通话失败:', error);
    message.error('无法访问设备: ' + error.message);
    stopTrack();
    isConnecting.value = false;
    connectionStatus.value = 'disconnected';
  }
}

let peer: RTCPeerConnection | null = null;

// 初始化用户媒体
async function initDeviceMedia(type = DEVICE_TYPE.CAMERA) {
  const mediaDevices = navigator.mediaDevices;

  try {
    if (type === DEVICE_TYPE.CAMERA) {
      currentStream = await mediaDevices.getUserMedia(cameraConstraints);
    } else {
      currentStream = await mediaDevices.getDisplayMedia(screenRecordConstraints);

      // 监听屏幕共享停止
      currentStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        hangup();
      });
    }

    // 显示自己的画面
    if (type === DEVICE_TYPE.CAMERA) {
      nextTick(() => {
        if (videoSelfRef.value && currentStream) {
          videoSelfRef.value.srcObject = currentStream;
        }
      });
    }
  } catch (error) {
    console.error('获取媒体设备失败:', error);
    throw error;
  }
}

// 注销媒体流及video
function stopTrack() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }

  if (videoRef.value) {
    videoRef.value.srcObject = null;
  }

  if (videoSelfRef.value) {
    videoSelfRef.value.srcObject = null;
  }
}

// 初始化RTC连接
async function initRTC(type = RTC_TYPE.CALLER) {
  try {
    // 创建RTCPeerConnection
    peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // 添加本地媒体流
    if (currentStream) {
      currentStream.getTracks().forEach(track => {
        peer?.addTrack(track, currentStream!);
      });
    }

    // 监听远程媒体流
    peer.ontrack = (e) => {
      console.log('收到远程媒体流');
      isRemoteStreamReady.value = true;
      if (videoRef.value && e.streams[0]) {
        videoRef.value.srcObject = e.streams[0] as any;
      }
    };

    // 监听ICE候选
    peer.onicecandidate = (e) => {
      if (e.candidate && props.contactUser) {
        props.socket?.emit('webrtc_ice', {
          to: props.contactUser,
          candidate: e.candidate
        });
      }
    };

    // 监听连接状态
    peer.onconnectionstatechange = () => {
      console.log('连接状态:', peer?.connectionState);
      if (peer?.connectionState === 'connected') {
        connectionStatus.value = 'connected';
        isConnected.value = true;
        isConnecting.value = false;
        message.success('连接成功');
      } else if (peer?.connectionState === 'failed' || peer?.connectionState === 'disconnected') {
        connectionStatus.value = 'disconnected';
        message.error('连接失败或已断开');
        hangup();
      }
    };

    // 呼叫方：创建offer
    if (type === RTC_TYPE.CALLER) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      props.socket?.emit('webrtc_offer', {
        to: props.contactUser,
        offer,
        deviceType: connectionType.value
      });
    }
  } catch (error) {
    console.error('初始化RTC失败:', error);
    message.error('初始化连接失败');
    hangup();
  }
}

// 接听方：创建answer
async function createAnswer() {
  try {
    if (!peer) return;

    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    props.socket?.emit('webrtc_answer', {
      to: props.contactUser,
      answer
    });
  } catch (error) {
    console.error('创建应答失败:', error);
    message.error('创建应答失败');
  }
}

// 处理收到的offer
async function handleOffer(offer: RTCSessionDescriptionInit) {
  try {
    if (!peer) {
      await initRTC(RTC_TYPE.CALLEE);
    }

    await peer?.setRemoteDescription(new RTCSessionDescription(offer));
    await createAnswer();
  } catch (error) {
    console.error('处理offer失败:', error);
    message.error('处理呼叫失败');
  }
}

// 处理收到的answer
async function handleAnswer(answer: RTCSessionDescriptionInit) {
  try {
    await peer?.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (error) {
    console.error('处理answer失败:', error);
    message.error('处理应答失败');
  }
}

// 处理收到的ICE候选
async function handleIceCandidate(candidate: RTCIceCandidate) {
  try {
    if (peer && candidate) {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.error('添加ICE候选失败:', error);
  }
}

// 处理来电请求
function handleIncomingCall(data: { from: string; deviceType: DEVICE_TYPE }) {
  incomingCallFromSocketId.value = data.from;
  incomingCallFrom.value = `用户${data.from.slice(0, 4)}`;
  incomingCallType.value = data.deviceType;
  incomingCallShow.value = true;
}

// 接听来电
async function acceptCall() {
  try {
    incomingCallShow.value = false;
    isConnecting.value = true;
    connectionStatus.value = 'connecting';
    connectionType.value = incomingCallType.value;
    connectModalShow.value = true;

    // 获取媒体流
    await initDeviceMedia(incomingCallType.value);

    // 发送接听响应
    props.socket?.emit('webrtc_call_response', {
      to: { socketId: incomingCallFromSocketId.value },
      accepted: true
    });

    // 初始化RTC作为被叫方
    await initRTC(RTC_TYPE.CALLEE);
  } catch (error: any) {
    console.error('接听失败:', error);
    message.error('无法访问设备: ' + error.message);
    rejectCall();
  }
}

// 拒绝来电
function rejectCall() {
  incomingCallShow.value = false;
  props.socket?.emit('webrtc_call_response', {
    to: { socketId: incomingCallFromSocketId.value },
    accepted: false
  });
  message.info('已拒绝来电');
}

// 处理呼叫响应
async function handleCallResponse(data: { accepted: boolean }) {
  if (data.accepted) {
    connectModalShow.value = true;
    // 对方接听，初始化RTC作为主叫方
    await initRTC(RTC_TYPE.CALLER);
  } else {
    message.warning('对方拒绝了您的呼叫');
    stopTrack();
    isConnecting.value = false;
    connectionStatus.value = 'disconnected';
    connectionType.value = null;
  }
}

// 挂断
function hangup() {
  // 通知对方挂断
  if (isConnected.value && props.contactUser) {
    props.socket?.emit('webrtc_hangup', {
      to: props.contactUser
    });
  }

  // 清理资源
  stopTrack();
  
  if (peer) {
    peer.close();
    peer = null;
  }

  connectModalShow.value = false;
  isConnecting.value = false;
  isConnected.value = false;
  isRemoteStreamReady.value = false;
  connectionStatus.value = 'disconnected';
  connectionType.value = null;

  message.info('通话已结束');
}

// 处理对方挂断
function handleHangup() {
  message.info('对方已挂断');
  hangup();
}

// 暴露给父组件的方法
defineExpose({
  handleOffer,
  handleAnswer,
  handleIceCandidate,
  handleIncomingCall,
  handleCallResponse,
  handleHangup
})
</script>

<!-- screen -->
caller: 创建rtc --> 接受媒体流
callee: 初始化媒体设备 --> 创建rtc --> 传输媒体流

<!-- camera -->
caller: 创建rtc --> 接受媒体流
callee: 初始化媒体设备 --> 创建rtc --> 传输媒体流