<template>
  <div class="chat-media-composer" :class="{ compact }">
    <input ref="imageInput" class="sr-only" type="file" accept="image/*" @change="handleImageSelected" />
    <n-button aria-label="发送图片" title="发送图片" size="small" secondary :loading="uploadingType === 'image'" :disabled="disabled || uploading || recording" @click="imageInput?.click()">
      <template #icon><i class="ui-icon ui-icon-image" aria-hidden="true"></i></template>
      <span v-if="!compact">发送图片</span>
    </n-button>
    <button
      type="button"
      class="hold-to-talk"
      aria-label="按住说话，松开发送" title="按住说话，松开发送"
      :class="{ 'hold-to-talk--active': recording, 'hold-to-talk--cancel': cancelIntent }"
      :disabled="disabled || uploading"
      @pointerdown.prevent="startRecording"
      @pointerup.prevent="finishRecording"
      @pointermove="updateCancelIntent"
      @lostpointercapture="isPressing && cancelRecording()"
      @keydown.esc.prevent="cancelRecording"
      @blur="isPressing && cancelRecording()"
      @pointercancel="cancelRecording"
      @keydown.space.prevent="startRecording"
      @keyup.space.prevent="finishRecording"
      @contextmenu.prevent
    >
      <i class="ui-icon ui-icon-microphone mr-1" aria-hidden="true"></i><span :class="{ 'sr-only': compact }">{{ uploading ? '发送中…' : recording ? `松开发送 ${elapsedSeconds || 1}s` : '按住 说话' }}</span>
    </button>
    <div v-if="recording || uploadingType === 'voice'" class="recording-status" :class="{ 'recording-status--cancel': cancelIntent, 'recording-status--uploading': uploading }" role="status">
      <span class="recording-capsule">
        <span class="recording-wave" aria-hidden="true"><i v-for="bar in 4" :key="bar"></i></span>
        <span>{{ uploading ? '语音发送中…' : cancelIntent ? '松开取消' : '松开发送' }}</span>
        <strong v-if="recording">{{ elapsedSeconds || 1 }}s</strong>
      </span>
      <span v-if="recording" class="recording-hint">{{ cancelIntent ? '移回继续录音' : elapsedSeconds >= 50 ? `还可录制 ${60 - elapsedSeconds}s · 上滑取消` : '上滑取消发送' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { NButton, useMessage } from 'naive-ui';
import { uploadFile } from '@/api/common';
import type { ChatMediaPayload } from '@/api/message';
import { getAudioFileExtension, selectAudioMimeType } from '@/services/chatMedia';

const props = defineProps<{ disabled?: boolean; groupId?: number; compact?: boolean }>();
const emit = defineEmits<{
  send: [payload: { type: 'image' | 'voice'; media: ChatMediaPayload }];
}>();

const message = useMessage();
const imageInput = ref<HTMLInputElement | null>(null);
const uploadingType = ref<'image' | 'voice' | null>(null);
const uploading = computed(() => uploadingType.value !== null);
const recording = ref(false);
const cancelIntent = ref(false);
let pressStartY = 0;
const elapsedSeconds = ref(0);
let recorder: MediaRecorder | null = null;
let recordingStream: MediaStream | null = null;
let recordingStartedAt = 0;
let recordingTimer: number | null = null;
let chunks: Blob[] = [];
let discardRecording = false;
let isPressing = false;

async function uploadMedia(file: File, type: 'image' | 'voice', durationSeconds?: number) {
  uploadingType.value = type;
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
    uploadingType.value = null;
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
    pressStartY = event.clientY;
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

function updateCancelIntent(event: PointerEvent) {
  if (isPressing) cancelIntent.value = pressStartY - event.clientY >= 48;
}

function finishRecording() {
  if (cancelIntent.value) {
    cancelRecording();
    return;
  }
  isPressing = false;
  if (recorder?.state === 'recording') recorder.stop();
}

function cancelRecording() {
  if (!isPressing && !recording.value) return;
  isPressing = false;
  discardRecording = true;
  if (recorder?.state === 'recording') recorder.stop();
  else if (!recorder) releaseRecordingResources();
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
  cancelIntent.value = false;
  elapsedSeconds.value = 0;
}

onBeforeUnmount(cancelRecording);
</script>

<style scoped>
.chat-media-composer { position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 0; }
.hold-to-talk { flex: 1; min-width: 150px; min-height: 34px; padding: 5px 18px; border: 1px solid #d9d9d9; border-radius: 6px; color: #333; background: #f7f7f7; font-size: 14px; font-weight: 500; user-select: none; touch-action: none; cursor: pointer; }
.hold-to-talk:hover { background: #eee; }
.hold-to-talk--active { background: #d9d9d9; transform: scale(.99); }
.hold-to-talk:disabled { color: #aaa; cursor: not-allowed; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

.compact { position: relative; display: flex; flex: none; flex-wrap: nowrap; gap: 8px; padding: 0; }
.compact :deep(.n-button), .compact .hold-to-talk { flex: none; width: 36px; min-width: 0; height: 40px; min-height: 40px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: #94a3b8; font-size: 20px; }
.compact :deep(.n-button__icon) { margin: 0; }
.compact :deep(.n-button__border), .compact :deep(.n-button__state-border) { display: none; }
.compact .ui-icon { margin: 0; }
.compact .hold-to-talk--active { color: #2563eb; background: #eff6ff; }
.compact .hold-to-talk { background: #eff6ff; color: #2563eb; transition: background .2s, color .2s, transform .2s; }
.compact .hold-to-talk:hover { background: #dbeafe; }
.compact .hold-to-talk--active { background: #fef2f2; color: #dc2626; }
.compact .hold-to-talk--cancel { background: #fee2e2; color: #b91c1c; }
.recording-status { position: absolute; bottom: calc(100% + 8px); left: 0; z-index: 1; display: flex; align-items: center; gap: 8px; width: max-content; max-width: calc(100vw - 40px); padding: 4px; border-radius: 20px; background: #fff; }
.recording-capsule { display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px; border: 1px solid #fecaca; border-radius: 999px; background: #fef2f2; color: #dc2626; font-size: 12px; font-weight: 500; white-space: nowrap; box-shadow: 0 1px 3px #dc26260d; }
.recording-capsule strong { font-family: monospace; font-variant-numeric: tabular-nums; }
.recording-status--cancel .recording-capsule { color: #fff; background: #dc2626; border-color: #dc2626; }
.recording-status--uploading .recording-capsule { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
.recording-hint { color: #94a3b8; font-size: 11px; }
.recording-wave { display: flex; align-items: center; gap: 2px; height: 16px; }
.recording-wave i { width: 2px; height: 12px; border-radius: 2px; background: currentColor; animation: recording-wave 1.2s infinite ease-in-out; }
.recording-wave i:nth-child(2) { animation-delay: .2s; }
.recording-wave i:nth-child(3) { animation-delay: .4s; }
.recording-wave i:nth-child(4) { animation-delay: .1s; }
@keyframes recording-wave { 0%, 100% { transform: scaleY(.3); } 50% { transform: scaleY(1); } }
@media (prefers-reduced-motion: reduce) { .recording-wave i { animation: none; } }
@media (max-width: 767px) { .compact { gap: 0; } .compact :deep(.n-button), .compact .hold-to-talk { width: 30px; } }
</style>
