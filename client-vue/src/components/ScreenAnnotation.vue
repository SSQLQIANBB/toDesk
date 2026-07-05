<template>
  <div class="annotation-container" ref="containerRef">
    <!-- 画布层 -->
    <canvas
      ref="canvasRef"
      class="annotation-canvas"
      :class="{ 'annotation-canvas--readonly': !editable }"
      @pointerdown="startDrawing"
      @pointermove="draw"
      @pointerup="stopDrawing"
      @pointercancel="stopDrawing"
      @pointerleave="stopDrawing"
    ></canvas>

    <!-- 工具栏 -->
    <div v-if="showToolbar" class="annotation-toolbar">
      <n-space>
        <!-- 工具选择 -->
        <n-button-group>
          <n-button
            :type="currentTool === 'pen' ? 'primary' : 'default'"
            @click="currentTool = 'pen'"
            size="small"
          >
            <template #icon>
              <n-icon><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></n-icon>
            </template>
            画笔
          </n-button>
          <n-button
            :type="currentTool === 'arrow' ? 'primary' : 'default'"
            @click="currentTool = 'arrow'"
            size="small"
          >
            <template #icon>
              <n-icon><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M1.01 21.99l3.12-8.73L12 16.98l-7.72 5.01zm7.62-11.5L21.5 4 15.01 16.87l-6.38-6.38z"/></svg></n-icon>
            </template>
            箭头
          </n-button>
          <n-button
            :type="currentTool === 'rect' ? 'primary' : 'default'"
            @click="currentTool = 'rect'"
            size="small"
          >
            <template #icon>
              <n-icon><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg></n-icon>
            </template>
            矩形
          </n-button>
          <n-button
            :type="currentTool === 'text' ? 'primary' : 'default'"
            @click="currentTool = 'text'"
            size="small"
          >
            <template #icon>
              <n-icon><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4v3h5.5v12h3V7H19V4z"/></svg></n-icon>
            </template>
            文字
          </n-button>
          <n-button
            :type="currentTool === 'eraser' ? 'primary' : 'default'"
            @click="currentTool = 'eraser'"
            size="small"
          >
            <template #icon>
              <n-icon><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 0 1-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0M4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z"/></svg></n-icon>
            </template>
            橡皮
          </n-button>
        </n-button-group>

        <!-- 颜色选择 -->
        <n-color-picker
          v-model:value="currentColor"
          :show-alpha="false"
          size="small"
          :swatches="colorSwatches"
        />

        <!-- 线宽 -->
        <n-slider
          v-model:value="lineWidth"
          :min="1"
          :max="20"
          :step="1"
          style="width: 100px"
        />

        <!-- 操作按钮 -->
        <n-button
          @click="emit('undo')"
          :disabled="actions.length === 0"
          size="small"
        >
          <template #icon>
            <n-icon><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg></n-icon>
          </template>
          撤销
        </n-button>

        <n-button
          @click="emit('clear')"
          type="warning"
          size="small"
        >
          <template #icon>
            <n-icon><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></n-icon>
          </template>
          清空
        </n-button>

        <n-button
          @click="$emit('close')"
          type="error"
          size="small"
        >
          关闭标注
        </n-button>
      </n-space>
    </div>

    <!-- 文字输入对话框 -->
    <n-modal v-model:show="showTextInput" preset="dialog" title="输入文字">
      <n-input
        v-model:value="textInput"
        type="textarea"
        placeholder="请输入文字..."
        :autosize="{ minRows: 3, maxRows: 5 }"
      />
      <template #action>
        <n-button @click="showTextInput = false">取消</n-button>
        <n-button type="primary" @click="confirmText">确定</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import {
  type AnnotationAction,
  type AnnotationDraft,
  type AnnotationPoint,
  type AnnotationTool,
} from '@/services/screenAnnotationState';

const props = withDefaults(defineProps<{
  width?: number;
  height?: number;
  showToolbar?: boolean;
  editable: boolean;
  actions: AnnotationAction[];
  drafts: AnnotationDraft[];
}>(), {
  showToolbar: false,
});

const emit = defineEmits<{
  close: [];
  draft: [action: AnnotationDraft];
  complete: [action: AnnotationDraft];
  undo: [];
  clear: [];
}>();

// Refs
const containerRef = ref<HTMLDivElement>();
const canvasRef = ref<HTMLCanvasElement>();

// 绘图状态
const isDrawing = ref(false);
const currentTool = ref<AnnotationTool>('pen');
const currentColor = ref('#FF0000');
const lineWidth = ref(3);
const currentActionId = ref('');
const currentPoints = ref<AnnotationPoint[]>([]);

// 文字输入
const showTextInput = ref(false);
const textInput = ref('');
const textPosition = ref<AnnotationPoint>({ x: 0, y: 0 });

// 颜色预设
const colorSwatches = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
  '#FF00FF', '#00FFFF', '#FFFFFF', '#000000',
];

let ctx: CanvasRenderingContext2D | null = null;
let draftTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  initCanvas();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  clearDraftTimer();
});

function initCanvas() {
  if (!canvasRef.value || !containerRef.value) return;

  const canvas = canvasRef.value;
  const container = containerRef.value;
  canvas.width = props.width || container.clientWidth;
  canvas.height = props.height || container.clientHeight;

  ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  redraw();
}

function handleResize() {
  initCanvas();
}

function createActionId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `annotation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 坐标按画布显示区域归一化，保证不同屏幕尺寸绘制在相同位置。
function getRelativePoint(event: PointerEvent): AnnotationPoint {
  const rect = canvasRef.value?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return { x: 0, y: 0 };
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function getRelativeLineWidth() {
  const rect = canvasRef.value?.getBoundingClientRect();
  return lineWidth.value / Math.max(rect?.width || 1, rect?.height || 1);
}

function getCurrentDraft(): AnnotationDraft {
  return {
    actionId: currentActionId.value,
    tool: currentTool.value,
    points: [...currentPoints.value],
    color: currentColor.value,
    lineWidth: getRelativeLineWidth(),
  };
}

function startDrawing(event: PointerEvent) {
  if (!props.editable) return;
  event.preventDefault();
  currentActionId.value = createActionId();
  currentPoints.value = [getRelativePoint(event)];

  if (currentTool.value === 'text') {
    textPosition.value = currentPoints.value[0]!;
    showTextInput.value = true;
    return;
  }

  isDrawing.value = true;
}

function draw(event: PointerEvent) {
  if (!props.editable || !isDrawing.value || !ctx) return;
  event.preventDefault();
  currentPoints.value.push(getRelativePoint(event));
  redraw();
  drawAction(getCurrentDraft());
  scheduleDraft();
}

function stopDrawing(event?: PointerEvent) {
  if (!props.editable || !isDrawing.value) return;
  event?.preventDefault();
  if (event && event.type === 'pointerup') {
    const lastPoint = getRelativePoint(event);
    const previous = currentPoints.value[currentPoints.value.length - 1];
    if (!previous || previous.x !== lastPoint.x || previous.y !== lastPoint.y) {
      currentPoints.value.push(lastPoint);
    }
  }

  clearDraftTimer();
  const action = getCurrentDraft();
  if (action.points.length > 1) emit('complete', action);
  isDrawing.value = false;
  currentPoints.value = [];
  currentActionId.value = '';
  redraw();
}

function scheduleDraft() {
  if (draftTimer) return;
  draftTimer = setTimeout(() => {
    draftTimer = null;
    if (isDrawing.value) emit('draft', getCurrentDraft());
  }, 50);
}

function clearDraftTimer() {
  if (!draftTimer) return;
  clearTimeout(draftTimer);
  draftTimer = null;
}

function toCanvasPoint(point: AnnotationPoint): AnnotationPoint {
  return {
    x: point.x * (canvasRef.value?.width || 0),
    y: point.y * (canvasRef.value?.height || 0),
  };
}

function drawPath(points: AnnotationPoint[]) {
  if (!ctx || points.length < 2) return;
  const firstPoint = toCanvasPoint(points[0]!);
  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y);
  points.slice(1).forEach((point) => {
    const canvasPoint = toCanvasPoint(point);
    ctx!.lineTo(canvasPoint.x, canvasPoint.y);
  });
  ctx.stroke();
}

function drawArrow(start: AnnotationPoint, end: AnnotationPoint) {
  if (!ctx) return;
  const canvasStart = toCanvasPoint(start);
  const canvasEnd = toCanvasPoint(end);
  const headLength = 15;
  const angle = Math.atan2(canvasEnd.y - canvasStart.y, canvasEnd.x - canvasStart.x);

  ctx.beginPath();
  ctx.moveTo(canvasStart.x, canvasStart.y);
  ctx.lineTo(canvasEnd.x, canvasEnd.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(canvasEnd.x, canvasEnd.y);
  ctx.lineTo(
    canvasEnd.x - headLength * Math.cos(angle - Math.PI / 6),
    canvasEnd.y - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(canvasEnd.x, canvasEnd.y);
  ctx.lineTo(
    canvasEnd.x - headLength * Math.cos(angle + Math.PI / 6),
    canvasEnd.y - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.stroke();
}

function drawRect(start: AnnotationPoint, end: AnnotationPoint) {
  if (!ctx) return;
  const canvasStart = toCanvasPoint(start);
  const canvasEnd = toCanvasPoint(end);
  ctx.beginPath();
  ctx.rect(
    canvasStart.x,
    canvasStart.y,
    canvasEnd.x - canvasStart.x,
    canvasEnd.y - canvasStart.y,
  );
  ctx.stroke();
}

function drawText(point: AnnotationPoint, text: string, color: string, width: number) {
  if (!ctx) return;
  const canvasPoint = toCanvasPoint(point);
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${Math.max(12, width * 8)}px Arial`;
  ctx.fillText(text, canvasPoint.x, canvasPoint.y);
  ctx.restore();
}

function drawAction(action: AnnotationDraft | AnnotationAction) {
  if (!ctx || action.points.length === 0) return;
  const pixelLineWidth = action.lineWidth * Math.max(
    canvasRef.value?.width || 1,
    canvasRef.value?.height || 1,
  );
  ctx.save();
  ctx.strokeStyle = action.color;
  ctx.lineWidth = pixelLineWidth;

  const start = action.points[0]!;
  const end = action.points[action.points.length - 1]!;
  switch (action.tool) {
    case 'pen':
      drawPath(action.points);
      break;
    case 'arrow':
      drawArrow(start, end);
      break;
    case 'rect':
      drawRect(start, end);
      break;
    case 'text':
      if (action.text) drawText(start, action.text, action.color, pixelLineWidth);
      break;
    case 'eraser':
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = pixelLineWidth * 3;
      drawPath(action.points);
      break;
  }
  ctx.restore();
}

function confirmText() {
  const text = textInput.value.trim();
  if (text && props.editable) {
    emit('complete', {
      actionId: currentActionId.value,
      tool: 'text',
      points: [textPosition.value],
      color: currentColor.value,
      lineWidth: getRelativeLineWidth(),
      text,
    });
  }
  textInput.value = '';
  currentActionId.value = '';
  showTextInput.value = false;
}

function redraw() {
  if (!ctx || !canvasRef.value) return;
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
  props.actions.forEach(drawAction);
  props.drafts.forEach(drawAction);
}

watch(
  () => [props.width, props.height, props.actions, props.drafts],
  () => initCanvas(),
  { deep: true },
);
</script>

<style scoped>
.annotation-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.annotation-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  z-index: 10;
  touch-action: none;
}

.annotation-canvas--readonly {
  cursor: default;
  pointer-events: none;
}

.annotation-toolbar {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.95);
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 20;
  backdrop-filter: blur(10px);
  max-width: calc(100vw - 24px);
  overflow-x: auto;
}

@media (max-width: 640px) {
  .annotation-toolbar {
    top: 8px;
    padding: 8px;
  }
}
</style>

