<template>
  <div class="annotation-container" ref="containerRef">
    <!-- 画布层 -->
    <canvas 
      ref="canvasRef" 
      class="annotation-canvas"
      @mousedown="startDrawing"
      @mousemove="draw"
      @mouseup="stopDrawing"
      @mouseleave="stopDrawing"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="stopDrawing"
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
          @click="undo" 
          :disabled="history.length === 0"
          size="small"
        >
          <template #icon>
            <n-icon><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg></n-icon>
          </template>
          撤销
        </n-button>

        <n-button 
          @click="clear" 
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
import { ref, onMounted, onUnmounted, watch } from 'vue';

interface Point {
  x: number;
  y: number;
}

interface DrawAction {
  tool: string;
  points: Point[];
  color: string;
  lineWidth: number;
  text?: string;
}

const props = defineProps<{
  width?: number;
  height?: number;
  showToolbar?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// Refs
const containerRef = ref<HTMLDivElement>();
const canvasRef = ref<HTMLCanvasElement>();

// 绘图状态
const isDrawing = ref(false);
const currentTool = ref<'pen' | 'arrow' | 'rect' | 'text' | 'eraser'>('pen');
const currentColor = ref('#FF0000');
const lineWidth = ref(3);
const startPoint = ref<Point>({ x: 0, y: 0 });
const currentPoints = ref<Point[]>([]);

// 历史记录
const history = ref<DrawAction[]>([]);

// 文字输入
const showTextInput = ref(false);
const textInput = ref('');
const textPosition = ref<Point>({ x: 0, y: 0 });

// 颜色预设
const colorSwatches = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00', 
  '#FF00FF', '#00FFFF', '#FFFFFF', '#000000'
];

let ctx: CanvasRenderingContext2D | null = null;

onMounted(() => {
  initCanvas();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.addEventListener('resize', handleResize);
});

function initCanvas() {
  if (!canvasRef.value || !containerRef.value) return;

  const canvas = canvasRef.value;
  const container = containerRef.value;

  // 设置画布大小
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
  const oldHistory = [...history.value];
  initCanvas();
  history.value = oldHistory;
  redraw();
}

function getMousePos(e: MouseEvent | Touch): Point {
  if (!canvasRef.value) return { x: 0, y: 0 };
  
  const rect = canvasRef.value.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function startDrawing(e: MouseEvent) {
  e.preventDefault();
  isDrawing.value = true;
  startPoint.value = getMousePos(e);
  currentPoints.value = [startPoint.value];

  if (currentTool.value === 'text') {
    textPosition.value = startPoint.value;
    showTextInput.value = true;
    isDrawing.value = false;
  }
}

function draw(e: MouseEvent) {
  if (!isDrawing.value || !ctx) return;
  e.preventDefault();

  const currentPoint = getMousePos(e);
  currentPoints.value.push(currentPoint);

  // 清空画布并重绘
  redraw();

  // 绘制当前正在画的内容
  ctx.save();
  ctx.strokeStyle = currentColor.value;
  ctx.lineWidth = lineWidth.value;

  switch (currentTool.value) {
    case 'pen':
      drawPath(currentPoints.value);
      break;
    case 'arrow':
      drawArrow(startPoint.value, currentPoint);
      break;
    case 'rect':
      drawRect(startPoint.value, currentPoint);
      break;
    case 'eraser':
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = lineWidth.value * 3;
      drawPath(currentPoints.value);
      break;
  }

  ctx.restore();
}

function stopDrawing() {
  if (!isDrawing.value) return;

  // 保存到历史记录
  if (currentPoints.value.length > 0) {
    history.value.push({
      tool: currentTool.value,
      points: [...currentPoints.value],
      color: currentColor.value,
      lineWidth: lineWidth.value,
    });
  }

  isDrawing.value = false;
  currentPoints.value = [];
}

function drawPath(points: Point[]) {
  if (!ctx || points.length < 2) return;

  const firstPoint = points[0];
  if (!firstPoint) return;

  ctx.beginPath();
  ctx.moveTo(firstPoint.x, firstPoint.y);
  
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    if (point) {
      ctx.lineTo(point.x, point.y);
    }
  }
  
  ctx.stroke();
}

function drawArrow(start: Point, end: Point) {
  if (!ctx) return;

  const headLength = 15;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  // 画线
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // 画箭头
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - Math.PI / 6),
    end.y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + Math.PI / 6),
    end.y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function drawRect(start: Point, end: Point) {
  if (!ctx) return;

  const width = end.x - start.x;
  const height = end.y - start.y;

  ctx.beginPath();
  ctx.rect(start.x, start.y, width, height);
  ctx.stroke();
}

function drawText(point: Point, text: string, color: string) {
  if (!ctx) return;

  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${lineWidth.value * 8}px Arial`;
  ctx.fillText(text, point.x, point.y);
  ctx.restore();
}

function confirmText() {
  if (!textInput.value) {
    showTextInput.value = false;
    return;
  }

  history.value.push({
    tool: 'text',
    points: [textPosition.value],
    color: currentColor.value,
    lineWidth: lineWidth.value,
    text: textInput.value,
  });

  redraw();
  textInput.value = '';
  showTextInput.value = false;
}

function redraw() {
  if (!ctx || !canvasRef.value) return;

  // 清空画布
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);

  // 重绘所有历史记录
  history.value.forEach((action) => {
    ctx!.save();
    ctx!.strokeStyle = action.color;
    ctx!.lineWidth = action.lineWidth;

    switch (action.tool) {
      case 'pen':
        drawPath(action.points);
        break;
      case 'arrow':
        if (action.points.length >= 2) {
          const start = action.points[0];
          const end = action.points[action.points.length - 1];
          if (start && end) {
            drawArrow(start, end);
          }
        }
        break;
      case 'rect':
        if (action.points.length >= 2) {
          const start = action.points[0];
          const end = action.points[action.points.length - 1];
          if (start && end) {
            drawRect(start, end);
          }
        }
        break;
      case 'text':
        if (action.text && action.points.length > 0) {
          const point = action.points[0];
          if (point) {
            drawText(point, action.text, action.color);
          }
        }
        break;
      case 'eraser':
        ctx!.globalCompositeOperation = 'destination-out';
        ctx!.lineWidth = action.lineWidth * 3;
        drawPath(action.points);
        break;
    }

    ctx!.restore();
  });
}

function undo() {
  if (history.value.length > 0) {
    history.value.pop();
    redraw();
  }
}

function clear() {
  history.value = [];
  redraw();
}

function handleTouchStart(e: TouchEvent) {
  e.preventDefault();
  if (e.touches.length > 0) {
    const touch = e.touches[0];
    startDrawing(touch as any);
  }
}

function handleTouchMove(e: TouchEvent) {
  e.preventDefault();
  if (e.touches.length > 0) {
    const touch = e.touches[0];
    draw(touch as any);
  }
}

// 监听画布大小变化
watch(() => [props.width, props.height], () => {
  initCanvas();
});
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
}
</style>

