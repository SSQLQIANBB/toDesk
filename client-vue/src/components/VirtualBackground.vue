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
import { ref, watch, onUnmounted } from 'vue';
import { useMessage } from 'naive-ui';
import type { UploadFileInfo } from 'naive-ui';

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

// Canvas
const canvasRef = ref<HTMLCanvasElement>();
let animationFrameId: number | null = null;
let processedStream: MediaStream | null = null;

// 应用效果
async function applyEffect(effect: typeof currentEffect.value) {
  currentEffect.value = effect;

  if (effect === 'none') {
    stopProcessing();
    return;
  }

  if (!props.stream) {
    message.warning('没有可用的视频流');
    return;
  }

  startProcessing();
}

// 开始处理
function startProcessing() {
  if (!props.stream || !canvasRef.value) return;

  const canvas = canvasRef.value;
  const video = document.createElement('video');
  video.srcObject = props.stream;
  video.play();

  video.onloadedmetadata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    processFrame(video, canvas);
  };
}

// 停止处理
function stopProcessing() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (processedStream) {
    processedStream.getTracks().forEach(track => track.stop());
    processedStream = null;
  }
}

// 处理每一帧
function processFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 绘制视频帧
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 应用效果
  switch (currentEffect.value) {
    case 'blur':
      applyBlurEffect(ctx, canvas);
      break;
    case 'color':
      applyColorEffect(ctx, canvas);
      break;
    case 'image':
      applyImageEffect(ctx, canvas);
      break;
  }

  // 创建处理后的流
  if (!processedStream) {
    processedStream = canvas.captureStream(30);
    emit('stream-updated', processedStream);
  }

  // 继续处理下一帧
  animationFrameId = requestAnimationFrame(() => processFrame(video, canvas));
}

// 应用模糊效果（简化版 - 对整个画面模糊）
function applyBlurEffect(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  // 简化版：对整个画面应用模糊滤镜
  ctx.filter = `blur(${blurAmount.value}px)`;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.putImageData(imageData, 0, 0);
  ctx.filter = 'none';
}

// 应用纯色背景效果
function applyColorEffect(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  // 简化版：在视频下方绘制纯色背景
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = backgroundColor.value;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.7;
  ctx.putImageData(imageData, 0, 0);
  ctx.globalAlpha = 1.0;
}

// 应用图片背景效果
function applyImageEffect(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  if (!backgroundImage.value) return;

  // 简化版：先绘制背景图片，再叠加视频
  ctx.drawImage(backgroundImage.value, 0, 0, canvas.width, canvas.height);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.7;
  ctx.putImageData(imageData, 0, 0);
  ctx.globalAlpha = 1.0;
}

// 更新模糊强度
function updateBlurAmount() {
  if (currentEffect.value === 'blur') {
    // 重新应用效果
    applyEffect('blur');
  }
}

// 更新背景颜色
function updateBackgroundColor() {
  if (currentEffect.value === 'color') {
    // 重新应用效果
    applyEffect('color');
  }
}

// 处理图片上传
function handleImageUpload(options: { fileList: UploadFileInfo[] }) {
  const file = options.fileList[0];
  if (!file.file) return;

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
  reader.readAsDataURL(file.file);
}

// 监听流变化
watch(() => props.stream, (newStream) => {
  if (newStream && currentEffect.value !== 'none') {
    startProcessing();
  }
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

