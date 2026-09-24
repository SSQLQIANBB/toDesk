<template>
  <n-modal :show="true" preset="card" title="裁剪头像" class="avatar-crop-modal"
    style="width: min(420px, calc(100vw - 24px))" :mask-closable="false" :close-on-esc="!uploading"
    :closable="!uploading" @close="emit('cancel')" @update:show="!$event && emit('cancel')">
    <p class="crop-hint">拖动图片调整位置，缩放后确认上传</p>
    <canvas ref="canvas" width="512" height="512" class="crop-preview" aria-label="头像裁剪预览"
      @pointerdown="startDrag" @pointermove="drag" @pointerup="endDrag" @pointercancel="endDrag" />
    <p v-if="loadError" role="alert">图片无法读取，请重新选择 JPG 或 PNG 图片</p>
    <label class="crop-zoom">缩放
      <input v-model.number="zoom" type="range" min="1" max="3" step="0.01" aria-label="头像缩放" :disabled="!ready || uploading" />
    </label>
    <template #footer>
      <div class="crop-actions">
        <n-button :disabled="uploading" @click="emit('cancel')">取消</n-button>
        <n-button type="primary" :disabled="!ready" :loading="uploading" @click="upload">确认裁剪并上传</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { NButton, NModal, useMessage } from 'naive-ui';
import { uploadFile } from '@/api/common';

const props = defineProps<{ file: File }>();
const emit = defineEmits<{ cancel: []; uploaded: [url: string] }>();
const message = useMessage();
const canvas = ref<HTMLCanvasElement | null>(null);
const zoom = ref(1);
const ready = ref(false);
const loadError = ref(false);
const uploading = ref(false);
const photo = new Image();
const sourceUrl = URL.createObjectURL(props.file);
let offsetX = 0;
let offsetY = 0;
let pointer: { id: number; x: number; y: number } | null = null;
let disposed = false;

function draw() {
  if (!ready.value || !canvas.value) return;
  const side = Math.min(photo.naturalWidth, photo.naturalHeight) / zoom.value;
  const x = (photo.naturalWidth - side) / 2 * (1 + offsetX);
  const y = (photo.naturalHeight - side) / 2 * (1 + offsetY);
  const context = canvas.value.getContext('2d')!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 512, 512);
  context.drawImage(photo, x, y, side, side, 0, 0, 512, 512);
}

function startDrag(event: PointerEvent) {
  if (!ready.value || uploading.value || event.button !== 0) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.value!.setPointerCapture(event.pointerId);
}

function drag(event: PointerEvent) {
  if (!pointer || event.pointerId !== pointer.id) return;
  const side = Math.min(photo.naturalWidth, photo.naturalHeight) / zoom.value;
  const ratio = side / canvas.value!.getBoundingClientRect().width;
  const travelX = (photo.naturalWidth - side) / 2;
  const travelY = (photo.naturalHeight - side) / 2;
  if (travelX > 0) offsetX = Math.max(-1, Math.min(1, offsetX - (event.clientX - pointer.x) * ratio / travelX));
  if (travelY > 0) offsetY = Math.max(-1, Math.min(1, offsetY - (event.clientY - pointer.y) * ratio / travelY));
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  draw();
}

function endDrag(event: PointerEvent) {
  if (pointer?.id === event.pointerId) pointer = null;
}

async function upload() {
  if (uploading.value) return;
  uploading.value = true;
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.value!.toBlob(value => value ? resolve(value) : reject(new Error('图片裁剪失败')), 'image/jpeg', 0.9);
    });
    if (disposed) return;
    const form = new FormData();
    form.append('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    form.append('purpose', 'avatar');
    const { file } = await uploadFile(form);
    if (!disposed) emit('uploaded', file.fileUrl);
  } catch (error: any) {
    if (!disposed) message.error('上传失败: ' + error.message);
  } finally {
    uploading.value = false;
  }
}

watch(zoom, draw);
onMounted(() => {
  photo.onload = () => { ready.value = true; draw(); };
  photo.onerror = () => { loadError.value = true; };
  photo.src = sourceUrl;
});
onBeforeUnmount(() => {
  disposed = true;
  photo.onload = null;
  photo.onerror = null;
  URL.revokeObjectURL(sourceUrl);
});
</script>

<style scoped>
.crop-hint { margin-bottom: 16px; color: #64748b; }
.crop-preview { display: block; width: 280px; max-width: 100%; height: auto; margin: auto; border-radius: 50%; background: #f1f5f9; touch-action: none; cursor: grab; }
.crop-preview:active { cursor: grabbing; }
.crop-zoom { display: flex; align-items: center; gap: 16px; margin-top: 20px; color: #475569; }
.crop-zoom input { flex: 1; min-width: 0; accent-color: #2563eb; }
.crop-actions { display: flex; justify-content: flex-end; gap: 12px; }
</style>
