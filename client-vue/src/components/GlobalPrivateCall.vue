<template>
  <!-- 通话始终挂载在应用顶层；视频可以缩成浮窗继续聊天。 -->
  <div
    v-if="connectModalShow"
    class="private-call"
    :class="{ 'private-call--compact': !isFullscreen && connectionType === DEVICE_TYPE.CAMERA }"
    :style="floatingStyle"
    role="dialog"
    :aria-modal="isFullscreen"
    :aria-label="connectionType === DEVICE_TYPE.SCREEN ? '屏幕共享' : '视频通话'"
  >
    <header class="private-call__header" @pointerdown="beginFloatingDrag">
      <div class="private-call__title">
        <strong>{{ connectionType === DEVICE_TYPE.SCREEN ? '屏幕共享' : '视频通话' }} · {{ contactUserName }}</strong>
        <span class="private-call__status">{{ connectionStatus === 'connected' ? '已连接' : '连接中' }}</span>
      </div>
      <div class="private-call__actions">
        <n-button v-if="connectionType === DEVICE_TYPE.CAMERA" size="small" secondary @click="toggleFullscreen">
          {{ isFullscreen ? '取消全屏' : '全屏' }}
        </n-button>
        <n-button size="small" type="error" @click="hangup">挂断</n-button>
      </div>
    </header>
    <div v-if="connectionType === DEVICE_TYPE.CAMERA" class="private-call__controls">
      <n-button size="small" secondary :aria-pressed="isMicrophoneMuted" @click="toggleMicrophone">
        {{ isMicrophoneMuted ? '开启麦克风' : '静音' }}
      </n-button>
      <n-button size="small" secondary :aria-pressed="isCameraOff" @click="toggleCamera">
        {{ isCameraOff ? '开启摄像头' : '关闭摄像头' }}
      </n-button>
    </div>
    <div class="private-call__stage">
      <div class="private-call__remote" :class="{ 'private-call__video--local': isLocalMain }" @pointerdown="beginFloatingDrag">
        <div v-if="!mainStreamReady && !isLocalMain" class="private-call__waiting">
          {{ isConnected ? '对方已连接，等待画面…' : '等待对方连接…' }}
        </div>
        <video ref="videoRef" autoplay playsinline :muted="isLocalMain" />
        <div v-if="isLocalMain && isCameraOff" class="private-call__waiting">摄像头已关闭</div>
        <span class="private-call__caption">{{ isLocalMain ? (connectionType === DEVICE_TYPE.SCREEN ? '我的共享画面' : '我') : '对方画面' }}</span>
      </div>
      <div v-if="connectionType === DEVICE_TYPE.CAMERA" class="private-call__self" :class="{ 'private-call__video--local': !isLocalMain }"
        role="button" tabindex="0" aria-label="交换大小画面" @click="swapVideos" @keydown.enter="swapVideos" @keydown.space.prevent="swapVideos">
        <video ref="videoSelfRef" autoplay playsinline :muted="!isLocalMain" />
        <div v-if="!smallStreamReady" class="private-call__waiting">{{ isLocalMain ? '等待对方画面…' : '等待摄像头…' }}</div>
        <div v-if="!isLocalMain && isCameraOff" class="private-call__waiting">摄像头已关闭</div>
        <span class="private-call__caption">{{ isLocalMain ? '对方' : '我' }}</span>
      </div>
    </div>
  </div>

  <!-- 来电提示 -->
  <n-modal
    v-model:show="incomingCallShow"
    :mask-closable="false"
    :close-on-esc="false"
    preset="dialog"
    class="private-invite"
    :style="{ background: '#172033', color: '#f8fafc', width: 'min(340px, calc(100vw - 24px))', borderRadius: '18px', boxShadow: '0 18px 48px #02061766' }"
    title="来电提示"
    @close="rejectCall"
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
import { Video16Filled } from '@vicons/fluent'
import { nextTick, ref, computed, watch, onBeforeUnmount } from 'vue';
import { useSocketStore } from '@/stores/socket';
import { usePrivateCallStore } from '@/stores/privateCall';
import notificationService from '@/services/notificationService';
import { cameraConstraints, screenRecordConstraints } from '@/views/remoteShare/components/config';
import { useMessage, NModal, NButton, NIcon } from 'naive-ui';


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

const socketStore = useSocketStore();
const callStore = usePrivateCallStore();
const activePeer = ref<User | null>(null);
const socket = computed(() => socketStore.socket);
let generation = 0;
let pendingIce: RTCIceCandidateInit[] = [];

const message = useMessage();



// 连接状态
const connectionType = ref<DEVICE_TYPE | null>(null);
const connectionStatus = ref<'disconnected' | 'connecting' | 'connected'>('disconnected');
const connectModalShow = ref(false);
const isFullscreen = ref(true);
const isConnecting = ref(false);
const isConnected = ref(false);
const isScreenSender = ref(false);
const showLocalMain = ref(false);
const isMicrophoneMuted = ref(false);
const isCameraOff = ref(false);
const mainStreamReady = ref(false);
const smallStreamReady = ref(false);
const isLocalMain = computed(() => connectionType.value === DEVICE_TYPE.SCREEN ? isScreenSender.value : showLocalMain.value);
const floatingPosition = ref<{ left: number; top: number } | null>(null);
const floatingStyle = computed(() => !isFullscreen.value && floatingPosition.value
  ? { left: `${floatingPosition.value.left}px`, top: `${floatingPosition.value.top}px`, right: 'auto', bottom: 'auto' }
  : undefined);
const callWindowRef = ref<HTMLElement | null>(null);
let dragOffset: { x: number; y: number } | null = null;

// 来电相关
const incomingCallShow = ref(false);
const incomingCallFrom = ref('');
const incomingCallType = ref<DEVICE_TYPE>(DEVICE_TYPE.CAMERA);
const incomingCallFromSocketId = ref('');

let currentStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
const videoRef = ref<HTMLVideoElement | null>(null)
const videoSelfRef = ref<HTMLVideoElement | null>(null)

const contactUserName = computed(() => {
  return activePeer.value?.nickname || activePeer.value?.username || '对方';
});

function attachVideo(element: HTMLVideoElement | null, stream: MediaStream | null, muted: boolean) {
  if (!element) return;
  if (element.srcObject !== stream) element.srcObject = stream;
  element.muted = muted;
  if (stream) {
    try { void element.play()?.catch(() => {}); } catch { /* 浏览器自动播放策略会拒绝，原生 controls 仍可继续显示画面。 */ }
  }
}

function syncVideos() {
  const main = isLocalMain.value ? currentStream : remoteStream;
  const small = isLocalMain.value ? remoteStream : currentStream;
  attachVideo(videoRef.value, main, isLocalMain.value);
  attachVideo(videoSelfRef.value, connectionType.value === DEVICE_TYPE.CAMERA ? small : null, !isLocalMain.value);
  mainStreamReady.value = !!main?.getVideoTracks().length;
  smallStreamReady.value = !!small?.getVideoTracks().length;
}

function swapVideos() {
  showLocalMain.value = !showLocalMain.value;
  void nextTick(syncVideos);
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
  stopFloatingDrag();
}

function toggleMicrophone() {
  if (!currentStream) return;
  isMicrophoneMuted.value = !isMicrophoneMuted.value;
  currentStream.getAudioTracks().forEach(track => { track.enabled = !isMicrophoneMuted.value; });
}

function toggleCamera() {
  if (!currentStream) return;
  isCameraOff.value = !isCameraOff.value;
  currentStream.getVideoTracks().forEach(track => { track.enabled = !isCameraOff.value; });
}

function moveFloatingWindow(event: PointerEvent) {
  if (!dragOffset || !callWindowRef.value) return;
  const rect = callWindowRef.value.getBoundingClientRect();
  floatingPosition.value = {
    left: Math.min(Math.max(8, event.clientX - dragOffset.x), Math.max(8, window.innerWidth - rect.width - 8)),
    top: Math.min(Math.max(8, event.clientY - dragOffset.y), Math.max(8, window.innerHeight - rect.height - 8)),
  };
}

function clampFloatingPosition() {
  if (!floatingPosition.value || !callWindowRef.value) return;
  const rect = callWindowRef.value.getBoundingClientRect();
  floatingPosition.value = {
    left: Math.min(floatingPosition.value.left, Math.max(8, window.innerWidth - rect.width - 8)),
    top: Math.min(floatingPosition.value.top, Math.max(8, window.innerHeight - rect.height - 8)),
  };
}

function stopFloatingDrag() {
  dragOffset = null;
  window.removeEventListener('pointermove', moveFloatingWindow);
  window.removeEventListener('pointerup', stopFloatingDrag);
  window.removeEventListener('pointercancel', stopFloatingDrag);
}

function beginFloatingDrag(event: PointerEvent) {
  if (isFullscreen.value || connectionType.value !== DEVICE_TYPE.CAMERA || (event.target as HTMLElement).closest('button')) return;
  const element = (event.currentTarget as HTMLElement).closest('.private-call') as HTMLElement | null;
  if (!element) return;
  callWindowRef.value = element;
  const rect = element.getBoundingClientRect();
  dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  window.addEventListener('pointermove', moveFloatingWindow);
  window.addEventListener('pointerup', stopFloatingDrag);
  window.addEventListener('pointercancel', stopFloatingDrag);
  event.preventDefault();
}

// 发起通话
async function handleMedia(type = DEVICE_TYPE.CAMERA) {
  if (!activePeer.value) {
    message.warning('请先选择联系人');
    return;
  }

  if (isConnected.value || isConnecting.value) {
    message.warning('已有进行中的通话');
    return;
  }

  try {
    isConnecting.value = true;
    connectionStatus.value = 'connecting';
    connectionType.value = type;
    isScreenSender.value = type === DEVICE_TYPE.SCREEN;

    const attempt = generation;
    // 先获取媒体流
    await initDeviceMedia(type);
    if (attempt !== generation) { stopTrack(); return; }
    connectModalShow.value = true;
    isFullscreen.value = true;
    await nextTick();
    syncVideos();

    // 发送呼叫请求
    socket.value?.emit('webrtc_call_request', {
      to: activePeer.value,
      deviceType: type
    });

    message.info('正在呼叫...');
  } catch (error: any) {
    console.error('发起通话失败:', error);
    message.error('无法访问设备: ' + error.message);
    stopTrack();
    isConnecting.value = false;
    cleanup();
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

    await nextTick();
    syncVideos();
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
  remoteStream = null;
}

// 初始化RTC连接
async function initRTC(type = RTC_TYPE.CALLER) {
  try {
    // 创建RTCPeerConnection
    peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: 'stun:turn.sycsq.top:3478'
        },
        {
          urls: [
            'turn:turn.sycsq.top:3478?transport=udp',
            'turn:turn.sycsq.top:3478?transport=tcp'
          ],
          username: 'todesk',
          credential: 'BOcYoq/Q4QEZTzhod7JmJ51S1gqSkVMe'
        }
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
      if (e.streams?.[0]) remoteStream = e.streams[0];
      else if (e.track) {
        remoteStream ||= new MediaStream();
        if (!remoteStream.getTracks().includes(e.track)) remoteStream.addTrack(e.track);
      }
      syncVideos();
    };

    // 监听ICE候选
    peer.onicecandidate = (e) => {
      if (e.candidate && activePeer.value) {
        socket.value?.emit('webrtc_ice', {
          to: activePeer.value,
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

      socket.value?.emit('webrtc_offer', {
        to: activePeer.value,
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

    socket.value?.emit('webrtc_answer', {
      to: activePeer.value,
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
    await flushIce();
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
    await flushIce();
  } catch (error) {
    console.error('处理answer失败:', error);
    message.error('处理应答失败');
  }
}

// 处理收到的ICE候选
async function handleIceCandidate(candidate: RTCIceCandidate) {
  try {
    if (!peer?.remoteDescription) { pendingIce.push(candidate); return; }
    await peer.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (error) {
    console.error('添加ICE候选失败:', error);
  }
}

async function flushIce() {
  for (const candidate of pendingIce.splice(0)) {
    await peer?.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

// 全局接收来电；回复始终发送给来电方，而不是聊天页选中的联系人。
function handleIncomingCall(data: { from: string; deviceType: DEVICE_TYPE; user?: User }) {
  if (data.deviceType !== DEVICE_TYPE.CAMERA && data.deviceType !== DEVICE_TYPE.SCREEN) return;
  if (activePeer.value || incomingCallShow.value) {
    if (activePeer.value?.socketId !== data.from) {
      socket.value?.emit('webrtc_call_response', { to: { socketId: data.from }, accepted: false });
    }
    return;
  }
  activePeer.value = { ...(data.user || socketStore.userList.find(user => user.socketId === data.from)), socketId: data.from, id: data.user?.id || 0 };
  incomingCallFromSocketId.value = data.from;
  incomingCallFrom.value = contactUserName.value;
  incomingCallType.value = data.deviceType;
  incomingCallShow.value = true;
  if (document.hidden) void notificationService.showCall(incomingCallFrom.value, data.deviceType === DEVICE_TYPE.SCREEN ? 'screen' : 'video', data.user?.avatar, () => window.focus());
  else notificationService.playAlert('call');
}

// 接听来电
async function acceptCall() {
  try {
    incomingCallShow.value = false;
    isConnecting.value = true;
    connectionStatus.value = 'connecting';
    connectionType.value = incomingCallType.value;
    connectModalShow.value = true;
    isFullscreen.value = true;
    isScreenSender.value = false;

    const attempt = generation;
    // 共享接收方只观看对方屏幕，无需选择自己的屏幕。
    if (incomingCallType.value === DEVICE_TYPE.CAMERA) await initDeviceMedia(DEVICE_TYPE.CAMERA);
    if (attempt !== generation) { stopTrack(); return; }
    await nextTick();
    syncVideos();
    await initRTC(RTC_TYPE.CALLEE);
    if (!peer) return;

    // 发送接听响应
    socket.value?.emit('webrtc_call_response', {
      to: { socketId: incomingCallFromSocketId.value },
      accepted: true
    });


  } catch (error: any) {
    console.error('接听失败:', error);
    message.error('无法访问设备: ' + error.message);
    rejectCall();
  }
}

// 拒绝来电
function rejectCall() {
  incomingCallShow.value = false;
  socket.value?.emit('webrtc_call_response', {
    to: { socketId: incomingCallFromSocketId.value },
    accepted: false
  });
  cleanup();
  message.info('已拒绝来电');
}

// 处理呼叫响应
async function handleCallResponse(data: { accepted: boolean }) {
  if (data.accepted) {
    connectModalShow.value = true;
    await nextTick();
    syncVideos();
    // 对方接听，初始化RTC作为主叫方
    await initRTC(RTC_TYPE.CALLER);
  } else {
    message.warning('对方拒绝了您的呼叫');
    cleanup();
  }
}

// 挂断
function hangup() {
  // 通知对方挂断
  if (activePeer.value) {
    socket.value?.emit('webrtc_hangup', {
      to: activePeer.value
    });
  }

  cleanup();
}

function cleanup() {
  generation++;
  stopFloatingDrag();
  pendingIce = [];
  incomingCallShow.value = false;
  activePeer.value = null;
  // 清理资源
  stopTrack();

  if (peer) {
    peer.close();
    peer = null;
  }

  connectModalShow.value = false;
  isFullscreen.value = true;
  floatingPosition.value = null;
  callWindowRef.value = null;
  isScreenSender.value = false;
  showLocalMain.value = false;
  isMicrophoneMuted.value = false;
  isCameraOff.value = false;
  mainStreamReady.value = false;
  smallStreamReady.value = false;
  isConnecting.value = false;
  isConnected.value = false;
  connectionStatus.value = 'disconnected';
  connectionType.value = null;


}

// 处理对方挂断
function handleHangup() {
  message.info('对方已挂断');
  cleanup();
}

watch([isConnecting, isConnected, incomingCallShow], values => {
  callStore.busy = values.some(Boolean);
}, { flush: 'sync' });

watch(() => callStore.request, request => {
  if (!request) return;
  callStore.request = null;
  if (activePeer.value) { message.warning('已有进行中的通话'); return; }
  activePeer.value = request.user;
  void handleMedia(request.type);
}, { flush: 'sync' });

const handlers: Record<string, (data: any) => void> = {
  webrtc_call_request: handleIncomingCall,
  webrtc_offer: data => { if (data.from === activePeer.value?.socketId && !incomingCallShow.value) void handleOffer(data.offer); },
  webrtc_answer: data => { if (data.from === activePeer.value?.socketId) void handleAnswer(data.answer); },
  webrtc_ice: data => { if (data.from === activePeer.value?.socketId) void handleIceCandidate(data.candidate); },
  webrtc_call_response: data => { if (data.from === activePeer.value?.socketId) void handleCallResponse(data); },
  webrtc_hangup: data => { if (data.from === activePeer.value?.socketId) handleHangup(); },
  disconnect: cleanup,
};
watch(socket, (target, previous) => {
  Object.entries(handlers).forEach(([event, handler]) => previous?.off(event, handler));
  cleanup();
  Object.entries(handlers).forEach(([event, handler]) => target?.on(event, handler));
}, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => {
  window.removeEventListener('resize', clampFloatingPosition);
  Object.entries(handlers).forEach(([event, handler]) => socket.value?.off(event, handler));
  hangup();
});
window.addEventListener('resize', clampFloatingPosition);
</script>

<style scoped>
.private-call { position: fixed; inset: 0; z-index: 3000; display: flex; flex-direction: column; background: #0b1220; color: #f8fafc; }
.private-call__header { min-height: 64px; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px clamp(12px, 3vw, 32px); background: #151f30; border-bottom: 1px solid #334155; }
.private-call__title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.private-call__title strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.private-call__status { color: #86efac; font-size: 12px; }
.private-call__actions { display: flex; gap: 8px; flex: none; }
.private-call__controls { display: flex; justify-content: center; gap: 10px; padding: 9px 12px; background: #111b2b; border-bottom: 1px solid #273449; }
.private-call__controls :deep(.n-button) { min-width: 106px; border-radius: 999px; }
.private-call__stage { flex: 1; min-height: 0; display: grid; place-items: center; padding: clamp(8px, 2vw, 24px); }
.private-call__remote { position: relative; width: 100%; height: 100%; min-height: 0; background: #020617; border-radius: 14px; overflow: hidden; }
.private-call__remote video { width: 100%; height: 100%; object-fit: contain; }
.private-call__self { position: absolute; right: clamp(16px, 3vw, 40px); bottom: clamp(20px, 4vw, 44px); width: clamp(130px, 20vw, 270px); aspect-ratio: 4 / 3; border: 2px solid #64748b; border-radius: 12px; overflow: hidden; background: #111827; box-shadow: 0 10px 30px #0008; cursor: pointer; }
.private-call__self:focus-visible { outline: 3px solid #60a5fa; outline-offset: 3px; }
.private-call__self video { width: 100%; height: 100%; object-fit: cover; }
.private-call__video--local video { transform: scaleX(-1); }
.private-call__caption { position: absolute; left: 10px; bottom: 10px; padding: 4px 8px; border-radius: 6px; background: #0009; font-size: 12px; }
.private-call__waiting { position: absolute; inset: 0; display: grid; place-items: center; color: #cbd5e1; }
.private-call--compact { inset: auto 16px 16px auto; width: min(360px, calc(100vw - 24px)); height: 280px; border: 1px solid #475569; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px #0008; }
.private-call--compact .private-call__header { min-height: 44px; padding: 6px 10px; font-size: 12px; cursor: grab; touch-action: none; user-select: none; }
.private-call--compact .private-call__header:active { cursor: grabbing; }
.private-call--compact .private-call__controls { padding: 5px; gap: 6px; }
.private-call--compact .private-call__controls :deep(.n-button) { min-width: 0; }
.private-call--compact .private-call__stage { padding: 0; }
.private-call--compact .private-call__remote { border-radius: 0; cursor: grab; touch-action: none; }
.private-call--compact .private-call__remote:active { cursor: grabbing; }
.private-call--compact .private-call__self { right: 8px; bottom: 8px; width: 84px; border-radius: 7px; }
.private-call--compact .private-call__status, .private-call--compact .private-call__caption { display: none; }
:global(.private-invite .n-dialog__title), :global(.private-invite .n-dialog__content) { color: #f8fafc; }
@media (max-width: 600px) {
  .private-call__header { min-height: 56px; padding: 8px 12px; }
  .private-call__title strong { max-width: 40vw; font-size: 13px; }
  .private-call__stage { padding: 0; }
  .private-call__remote { border-radius: 0; }
  .private-call__self { right: 10px; bottom: max(18px, env(safe-area-inset-bottom)); width: 32vw; }
  .private-call--compact { right: 8px; bottom: max(8px, env(safe-area-inset-bottom)); height: 250px; }
}
</style>
