<template>
  <div class="chat-media-composer">
    <input ref="imageInput" class="sr-only" type="file" accept="image/*" @change="handleImageSelected" />
    <n-button size="small" secondary :disabled="disabled || uploading" @click="imageInput?.click()">
      <i class="ui-icon ui-icon-image mr-1" aria-hidden="true"></i>{{ uploading ? '上传中…' : '发送图片' }}
    </n-button>
    <button
      type="button"
      class="hold-to-talk"
      :class="{ 'hold-to-talk--active': recording }"
      :disabled="disabled || uploading"
      @pointerdown.prevent="startRecording"
      @pointerup.prevent="finishRecording"
      @pointercancel="cancelRecording"
      @keydown.space.prevent="startRecording"
      @keyup.space.prevent="finishRecording"
      @contextmenu.prevent
    >
      <i class="ui-icon ui-icon-microphone mr-1" aria-hidden="true"></i>{{ uploading ? '发送中…' : recording ? `松开发送 ${elapsedSeconds || 1}s` : '按住 说话' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { NButton, useMessage } from 'naive-ui';
import { uploadFile } from '@/api/common';
import type { ChatMediaPayload } from '@/api/message';
import { getAudioFileExtension, selectAudioMimeType } from '@/services/chatMedia';

const props = defineProps<{ disabled?: boolean; groupId?: number }>();
const emit = defineEmits<{
  send: [payload: { type: 'image' | 'voice'; media: ChatMediaPayload }];
}>();

const message = useMessage();
const imageInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const recording = ref(false);
const elapsedSeconds = ref(0);
let recorder: MediaRecorder | null = null;
let recordingStream: MediaStream | null = null;
let recordingStartedAt = 0;
let recordingTimer: number | null = null;
let chunks: Blob[] = [];
let discardRecording = false;
let isPressing = false;

async function uploadMedia(file: File, type: 'image' | 'voice', durationSeconds?: number) {
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    form.append('purpose', 'chat');
    if (props.groupId) form.append('groupId', String(props.groupId));
    const { file: uploaded } = await uploadFile(form);
    emit('send', {
      type,
      media: {
        url: uploaded.fileUrl,
        fileId: uploaded.id,
        mimeType: uploaded.mimeType,
        fileName: uploaded.originalName,
        fileSize: uploaded.fileSize,
        ...(durationSeconds ? { durationSeconds } : {}),
      },
    });
  } catch (error: any) {
    message.error(`上传失败: ${error.message}`);
  } finally {
    uploading.value = false;
  }
}

async function handleImageSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { message.warning('请选择图片文件'); return; }
  if (file.size > 10 * 1024 * 1024) { message.warning('图片不能超过 10MB'); return; }
  await uploadMedia(file, 'image');
}

async function startRecording(event?: PointerEvent | KeyboardEvent) {
  if (isPressing || recording.value || props.disabled || uploading.value) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    message.error('当前浏览器不支持语音录制');
    return;
  }

  isPressing = true;
  if (event && 'pointerId' in event) {
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    if (!isPressing) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    recordingStream = stream;
    const mimeType = selectAudioMimeType();
    recorder = mimeType
      ? new MediaRecorder(recordingStream, { mimeType })
      : new MediaRecorder(recordingStream);
    chunks = [];
    discardRecording = false;
    recordingStartedAt = Date.now();
    elapsedSeconds.value = 0;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = handleRecordingStopped;
    recorder.start();
    recording.value = true;
    recordingTimer = window.setInterval(() => {
      elapsedSeconds.value = Math.min(60, Math.max(1, Math.floor((Date.now() - recordingStartedAt) / 1000)));
      if (elapsedSeconds.value >= 60) finishRecording();
    }, 250);
  } catch (error: any) {
    releaseRecordingResources();
    message.error(`无法使用麦克风: ${error.message}`);
  }
}

function finishRecording() {
  isPressing = false;
  if (recorder?.state === 'recording') recorder.stop();
}

function cancelRecording() {
  isPressing = false;
  discardRecording = true;
  if (recorder?.state === 'recording') recorder.stop();
  else releaseRecordingResources();
}

function handleRecordingStopped() {
  const durationSeconds = Math.min(60, Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000)));
  const mimeType = recorder?.mimeType || 'audio/webm';
  const audio = new Blob(chunks, { type: mimeType });
  const shouldUpload = !discardRecording && audio.size > 0;
  releaseRecordingResources();
  if (!shouldUpload) return;
  const file = new File([audio], `voice-${Date.now()}.${getAudioFileExtension(mimeType)}`, { type: mimeType });
  void uploadMedia(file, 'voice', durationSeconds);
}

function releaseRecordingResources() {
  isPressing = false;
  if (recordingTimer !== null) window.clearInterval(recordingTimer);
  recordingTimer = null;
  recordingStream?.getTracks().forEach(track => track.stop());
  recordingStream = null;
  recorder = null;
  chunks = [];
  recording.value = false;
  elapsedSeconds.value = 0;
}

onBeforeUnmount(cancelRecording);
</script>

<style scoped>
.chat-media-composer { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 0; }
.hold-to-talk { flex: 1; min-width: 150px; min-height: 34px; padding: 5px 18px; border: 1px solid #d9d9d9; border-radius: 6px; color: #333; background: #f7f7f7; font-size: 14px; font-weight: 500; user-select: none; touch-action: none; cursor: pointer; }
.hold-to-talk:hover { background: #eee; }
.hold-to-talk--active { background: #d9d9d9; transform: scale(.99); }
.hold-to-talk:disabled { color: #aaa; cursor: not-allowed; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
