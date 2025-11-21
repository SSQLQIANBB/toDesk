<template>
  <div v-if="isSupportMedia" class="flex items-center gap-2 px-3 bg-slate-300">
    <n-button text @click="handleMedia(DEVICE_TYPE.SCREEN)"><n-icon :size="18"><DeviceMeetingRoomRemote16Filled /></n-icon></n-button>
    <n-button text @click="handleMedia(DEVICE_TYPE.CAMERA)"><n-icon :size="18"><Video16Filled /></n-icon></n-button>
  </div>
  <n-alert v-else title="" type="error" size="small">
    <template #header>
      <div class="text-sm">您的浏览器不支持WebRTC，请使用Chrome、Firefox或Edge等现代浏览器</div>
    </template>
  </n-alert>

  <n-modal
    v-model:show="connectModalShow"
    :mask-closable="false"
    :show-mask="false"
  >
    <div class="bg-white w-[480px] aspect-video">
      <span>
        对方画面
      </span>
      <video ref="videoRef" class="w-full h-full" autoplay />
    </div>
    <div v-if="connectionType === DEVICE_TYPE.CAMERA">
      <span>
        我的画面
      </span>
      <video ref="videoSelfRef" autoplay  />
    </div>
  </n-modal>
</template>

<script lang="ts" setup>
import { DeviceMeetingRoomRemote16Filled, Video16Filled } from '@vicons/fluent'
import { nextTick, ref } from 'vue';
import { cameraConstraints, screenRecordConstraints } from './config';

enum DEVICE_TYPE {
  CAMERA = 0,
  SCREEN = 1,
}

enum RTC_TYPE {
  CALLER = 0, // 主动呼叫 
  CALLEE = 1 // 被呼叫
}

const emit = defineEmits<{
  (e: 'offer', v: RTCSessionDescriptionInit): void,
  (e: 'answer', v: RTCSessionDescriptionInit): void,
  (e: 'ice', v: RTCIceCandidate): void
}>();

const isSupportMedia = ref(!!navigator?.mediaDevices?.getUserMedia)

// 链接类型
const connectionType = ref<DEVICE_TYPE | null>(null);
const connectModalShow = ref(false);
let currentStream: MediaStream | null = null;
const videoRef = ref<HTMLVideoElement | null>(null)
const videoSelfRef = ref<HTMLVideoElement | null>(null)

async function handleMedia(type = DEVICE_TYPE.CAMERA) {
  stopTrack();

  await initDeviceMedia(type)

  connectModalShow.value = true;

  nextTick(() => {
    if (videoRef.value && currentStream) {
      videoRef.value.srcObject = currentStream
    }
  })
}

let peer: RTCPeerConnection | null = null;

// 初始化用户媒体
async function initDeviceMedia(type = DEVICE_TYPE.CAMERA) {
  const mediaDevices = navigator.mediaDevices;

  if (type === DEVICE_TYPE.CAMERA) {
    currentStream = await mediaDevices.getUserMedia(cameraConstraints)
  } else {
    currentStream = await mediaDevices.getDisplayMedia(screenRecordConstraints);

    currentStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      stopTrack();

      connectModalShow.value = false;
    })
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
}

async function initRTC(type = RTC_TYPE.CALLER) {
// 创建
  peer = new RTCPeerConnection();

  // 呼叫方
  if (type === RTC_TYPE.CALLER) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    emit('offer', offer);

    peer.onicecandidate = (e) => {
      emit('ice', e.candidate!)
    }
  } else { // 被呼叫方
    const answer = await peer.createAnswer();

    await peer.setLocalDescription(answer);

    emit('answer', answer)
  }
  

  if (currentStream && peer) {
    currentStream?.getTracks().forEach(track => {
      peer?.addTrack(track, currentStream!)
    })
  }

  peer.ontrack = (e) => {
    if (videoRef.value) {
      videoRef.value.srcObject = e.streams[0] as any
    }
  }
}

// 设置远程描述session(offer|answer)
function setRemoteDescription(session: RTCSessionDescriptionInit) {
  peer?.setRemoteDescription(session)
}

// 添加远程协议
function setICECandidate(candidate: RTCIceCandidate) {
  peer?.addIceCandidate(candidate)
}
// 主动
async function caller() {

} 

// 被动
async function callee(offer: RTCSessionDescriptionInit) {
  
}

defineExpose({
  setRemoteDescription,
  setICECandidate,
})
</script>

<!-- screen -->
caller: 创建rtc --> 接受媒体流
callee: 初始化媒体设备 --> 创建rtc --> 传输媒体流

<!-- camera -->
caller: 创建rtc --> 接受媒体流
callee: 初始化媒体设备 --> 创建rtc --> 传输媒体流