<template>
  <div class="virtual-background">
    <!-- 背景效果选择器 -->
    <n-popover trigger="click" placement="top">
      <template #trigger>
        <n-button circle>
          <template #icon>
            <n-icon size="20">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM5 17l3.5-4.5 2.5 3.01L14.5 11l4.5 6H5z"/>
              </svg>
            </n-icon>
          </template>
        </n-button>
      </template>

      <n-space vertical>
        <n-text strong>背景效果</n-text>

        <!-- 无效果 -->
        <n-card
          :class="['background-option', currentEffect === 'none' && 'selected']"
          size="small"
          hoverable
          @click="applyEffect('none')"
        >
          <div class="option-content">
            <n-icon size="32">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                <path d="M3.5 3.5l17 17"/>
              </svg>
            </n-icon>
            <n-text>无效果</n-text>
          </div>
        </n-card>

        <!-- 模糊背景 -->
        <n-card
          :class="['background-option', currentEffect === 'blur' && 'selected']"
          size="small"
          hoverable
          @click="applyEffect('blur')"
        >
          <div class="option-content">
            <div class="blur-preview"></div>
            <n-text>模糊背景</n-text>
          </div>
        </n-card>

        <!-- 模糊强度 -->
        <n-space v-if="currentEffect === 'blur'" vertical size="small">
          <n-text depth="3">模糊强度</n-text>
          <n-slider
            v-model:value="blurAmount"
            :min="5"
            :max="50"
            :step="5"
            @update:value="updateBlurAmount"
          />
        </n-space>

        <!-- 纯色背景 -->
        <n-card
          :class="['background-option', currentEffect === 'color' && 'selected']"
          size="small"
          hoverable
          @click="applyEffect('color')"
        >
          <div class="option-content">
            <div class="color-preview" :style="{ background: backgroundColor }"></div>
            <n-text>纯色背景</n-text>
          </div>
        </n-card>

        <!-- 颜色选择 -->
        <n-color-picker
          v-if="currentEffect === 'color'"
          v-model:value="backgroundColor"
          @update:value="updateBackgroundColor"
        />

        <!-- 图片背景 -->
        <n-card
          :class="['background-option', currentEffect === 'image' && 'selected']"
          size="small"
          hoverable
          @click="applyEffect('image')"
        >
          <div class="option-content">
            <n-icon size="32">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
            </n-icon>
            <n-text>图片背景</n-text>
          </div>
        </n-card>

        <!-- 上传图片 -->
        <n-upload
          v-if="currentEffect === 'image'"
          @change="handleImageUpload"
          accept="image/*"
          :max="1"
          :show-file-list="false"
        >
          <n-button size="small" block>上传图片</n-button>
        </n-upload>
      </n-space>
    </n-popover>

    <!-- 隐藏的canvas用于处理 -->
    <canvas ref="canvasRef" style="display: none"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, toRaw } from 'vue';
import { useMessage } from 'naive-ui';
import type { UploadFileInfo } from 'naive-ui';
import { createSegmenter, composeBackground, stopProcessedVideo, type Segmenter } from '@/services/backgroundProcessor';

interface VirtualBackgroundProps {
  stream?: MediaStream | null;
}

const props = defineProps<VirtualBackgroundProps>();

const emit = defineEmits<{
  (e: 'stream-updated', stream: MediaStream): void;
}>();

const message = useMessage();

// 状态
const currentEffect = ref<'none' | 'blur' | 'color' | 'image'>('none');
const blurAmount = ref(20);
const backgroundColor = ref('#00AA00');
const backgroundImage = ref<HTMLImageElement | null>(null);

const canvasRef = ref<HTMLCanvasElement>();
let animationFrameId: number | null = null;
let processedStream: MediaStream | null = null;
let inputVideo: HTMLVideoElement | null = null;
let segmenter: Segmenter | null = null;
let generation = 0;

async function applyEffect(effect: typeof currentEffect.value) {
  currentEffect.value = effect;
  if (effect === 'none') {
    if (props.stream) emit('stream-updated', toRaw(props.stream));
    stopProcessing();
    return;
  }
  if (!props.stream) { message.warning('没有可用的视频流'); return; }
  if (effect === 'image' && !backgroundImage.value) {
    message.info('请上传背景图片');
    return;
  }
  // 样式变更由现有处理循环读取，避免创建多条并行捕获流。
  if (!inputVideo) await startProcessing();
}

async function startProcessing() {
  stopProcessing();
  const source = props.stream ? toRaw(props.stream) : null;
  const canvas = canvasRef.value;
  if (!source || !canvas) return;
  const run = generation;
  const video = document.createElement('video');
  inputVideo = video;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = source;
  try {
    await video.play();
    if (run !== generation) return;
    const processor = await createSegmenter();
    if (run !== generation) { await processor.close(); return; }
    segmenter = processor;
    processor.onResults(results => {
      if (run !== generation || currentEffect.value === 'none') return;
      if (canvas.width !== (video.videoWidth || 1280)) canvas.width = video.videoWidth || 1280;
      if (canvas.height !== (video.videoHeight || 720)) canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器不支持画布处理');
      composeBackground(ctx, results, canvas.width, canvas.height, {
        effect: currentEffect.value, blur: blurAmount.value,
        color: backgroundColor.value, image: backgroundImage.value,
      });
      if (!processedStream) {
        processedStream = canvas.captureStream(30);
        source.getAudioTracks().forEach(track => processedStream!.addTrack(track));
        emit('stream-updated', processedStream);
      }
    });
    const frame = async () => {
      if (run !== generation) return;
      try {
        if (video.readyState >= 2) await processor.send({ image: video });
        if (run === generation) animationFrameId = requestAnimationFrame(() => { void frame(); });
      } catch (error) { fail(error, run); }
    };
    await frame();
  } catch (error) { fail(error, run); }
}

function fail(error: unknown, run: number) {
  if (run !== generation) return;
  console.error('背景处理失败', error);
  currentEffect.value = 'none';
  if (props.stream) emit('stream-updated', toRaw(props.stream));
  stopProcessing();
  message.error('背景效果暂不可用，已恢复原始摄像头画面');
}

function stopProcessing() {
  generation++;
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  if (inputVideo) { inputVideo.pause(); inputVideo.srcObject = null; }
  inputVideo = null;
  const previous = segmenter;
  segmenter = null;
  if (previous) void previous.close().catch(() => {});
  stopProcessedVideo(processedStream);
  processedStream = null;
}

function updateBlurAmount() { /* 下一帧使用当前设置 */ }
function updateBackgroundColor() { /* 下一帧使用当前设置 */ }

// 处理图片上传
function handleImageUpload(options: { fileList: UploadFileInfo[] }) {
  const file = options.fileList[0]?.file;
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      backgroundImage.value = img;
      if (currentEffect.value === 'image') {
        applyEffect('image');
      }
      message.success('背景图片已设置');
    };
    img.src = e.target?.result as string;
  };
  reader.readAsDataURL(file);
}

// 监听流变化
watch(() => props.stream, (newStream) => {
  stopProcessing();
  if (newStream && currentEffect.value !== 'none') void startProcessing();
});

// 组件卸载时清理
onUnmounted(() => {
  stopProcessing();
});

defineExpose({
  applyEffect,
  stopProcessing,
});
</script>

<style scoped>
.virtual-background {
  display: inline-block;
}

.background-option {
  cursor: pointer;
  transition: all 0.3s;
  border: 2px solid transparent;
}

.background-option:hover {
  border-color: #18a058;
}

.background-option.selected {
  border-color: #18a058;
  background: rgba(24, 160, 88, 0.1);
}

.option-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px;
}

.blur-preview {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  filter: blur(8px);
  border-radius: 8px;
}

.color-preview {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  border: 2px solid #e0e0e0;
}
</style>

