<template>
  <div class="chat-media-composer">
    <input ref="imageInput" class="sr-only" type="file" accept="image/*" @change="handleImageSelected" />
    <n-button size="small" secondary :disabled="disabled || uploading" @click="imageInput?.click()">
      {{ uploading ? '上传中…' : '发送图片' }}
    </n-button>
    <template v-if="recording">
      <span class="recording-time">录音中 {{ elapsedSeconds }}s / 60s</span>
      <n-button size="small" type="primary" :disabled="uploading" @click="finishRecording">发送语音</n-button>
      <n-button size="small" secondary @click="cancelRecording">取消</n-button>
    </template>
    <n-button v-else size="small" secondary :disabled="disabled || uploading" @click="startRecording">
      录制语音
    </n-button>
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

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    message.error('当前浏览器不支持语音录制');
    return;
  }

  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
  if (recorder?.state === 'recording') recorder.stop();
}

function cancelRecording() {
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
.recording-time { color: #ef4444; font-size: 12px; font-variant-numeric: tabular-nums; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
