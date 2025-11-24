# 通话增强功能使用指南

## 📋 功能概览

ToDesk 现已支持以下通话增强功能：

1. ✅ **屏幕共享标注** - 实时标注、画笔、箭头、文字、矩形等
2. ✅ **录制功能** - 录制视频通话和屏幕共享
3. ✅ **虚拟背景** - 模糊背景、纯色背景、图片背景

---

## 1. 🎨 屏幕共享标注功能

### 组件路径
`client-vue/src/components/ScreenAnnotation.vue`

### 功能特性

#### 绘图工具
- **画笔** - 自由绘制
- **箭头** - 指向标注
- **矩形** - 框选区域
- **文字** - 添加文本说明
- **橡皮擦** - 清除标注

#### 操作功能
- **颜色选择** - 8种预设颜色 + 自定义颜色
- **线宽调节** - 1-20px 可调
- **撤销** - 撤销上一步操作
- **清空** - 清除所有标注

### 使用方法

```vue
<template>
  <div class="screen-share-container">
    <!-- 视频流 -->
    <video ref="videoRef" :srcObject="screenStream"></video>
    
    <!-- 标注层（覆盖在视频上方） -->
    <ScreenAnnotation
      :width="videoWidth"
      :height="videoHeight"
      :show-toolbar="true"
      @close="handleCloseAnnotation"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ScreenAnnotation from '@/components/ScreenAnnotation.vue';

const screenStream = ref<MediaStream | null>(null);
const videoWidth = ref(1920);
const videoHeight = ref(1080);

function handleCloseAnnotation() {
  // 关闭标注
}
</script>

<style scoped>
.screen-share-container {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
```

### 键盘快捷键（可扩展）
- `Ctrl + Z` - 撤销
- `Ctrl + Shift + Z` - 重做
- `Delete` - 清空画布
- `Esc` - 关闭标注

### 标注数据结构

```typescript
interface DrawAction {
  tool: 'pen' | 'arrow' | 'rect' | 'text' | 'eraser';
  points: Point[];      // 坐标点数组
  color: string;        // 颜色
  lineWidth: number;    // 线宽
  text?: string;        // 文字内容（仅text工具）
}

interface Point {
  x: number;
  y: number;
}
```

---

## 2. 📹 录制功能

### 组件路径
`client-vue/src/components/MediaRecorder.vue`

### 功能特性

#### 录制控制
- **开始录制** - 一键开始
- **暂停/继续** - 录制过程可暂停
- **停止录制** - 结束录制
- **实时计时** - 显示录制时长

#### 录制输出
- **格式**: WebM (VP9 编码)
- **码率**: 2.5 Mbps
- **分辨率**: 原始流分辨率
- **音频**: 支持音频录制

#### 后处理
- **视频预览** - 录制完成后预览
- **文件下载** - 保存到本地
- **文件信息** - 显示时长和大小

### 使用方法

```vue
<template>
  <div>
    <!-- 视频流 -->
    <video ref="videoRef" :srcObject="mediaStream"></video>
    
    <!-- 录制控制 -->
    <MediaRecorder
      :stream="mediaStream"
      @recording-start="handleRecordingStart"
      @recording-stop="handleRecordingStop"
      @recording-error="handleRecordingError"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import MediaRecorder from '@/components/MediaRecorder.vue';

const mediaStream = ref<MediaStream | null>(null);

function handleRecordingStart() {
  console.log('录制开始');
}

function handleRecordingStop(blob: Blob) {
  console.log('录制完成，大小:', blob.size);
  // 可以上传到服务器
  // uploadRecording(blob);
}

function handleRecordingError(error: Error) {
  console.error('录制错误:', error);
}
</script>
```

### 浏览器兼容性

| 浏览器 | 版本要求 | 支持情况 |
|--------|----------|----------|
| Chrome | ≥ 49 | ✅ 完全支持 |
| Firefox | ≥ 25 | ✅ 完全支持 |
| Safari | ≥ 14.1 | ✅ 完全支持 |
| Edge | ≥ 79 | ✅ 完全支持 |

### 录制格式支持

```typescript
// 检查格式支持
const formats = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

formats.forEach(format => {
  console.log(`${format}:`, MediaRecorder.isTypeSupported(format));
});
```

---

## 3. 🖼️ 虚拟背景功能

### 组件路径
`client-vue/src/components/VirtualBackground.vue`

### 功能特性

#### 背景效果
1. **无效果** - 原始视频
2. **模糊背景** - 背景模糊（5-50px 可调）
3. **纯色背景** - 自定义颜色背景
4. **图片背景** - 上传自定义背景图

### 使用方法

```vue
<template>
  <div>
    <!-- 原始视频流 -->
    <video 
      v-if="!processedStream" 
      :srcObject="originalStream"
    ></video>
    
    <!-- 处理后的视频流 -->
    <video 
      v-else 
      :srcObject="processedStream"
    ></video>
    
    <!-- 虚拟背景控制 -->
    <VirtualBackground
      :stream="originalStream"
      @stream-updated="handleStreamUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import VirtualBackground from '@/components/VirtualBackground.vue';

const originalStream = ref<MediaStream | null>(null);
const processedStream = ref<MediaStream | null>(null);

function handleStreamUpdated(stream: MediaStream) {
  processedStream.value = stream;
  // 使用处理后的流
}
</script>
```

### 性能优化建议

1. **降低分辨率** - 处理 480p 或 720p 视频
2. **降低帧率** - 15-30 FPS 即可
3. **使用 Web Workers** - 将处理放到后台线程
4. **硬件加速** - 启用浏览器硬件加速

### 高级版本（可选）

使用 AI 人像分割（需要额外库）：

```bash
# 安装依赖
npm install @tensorflow/tfjs @tensorflow-models/body-pix
```

```typescript
import * as bodyPix from '@tensorflow-models/body-pix';

// 加载模型
const net = await bodyPix.load({
  architecture: 'MobileNetV1',
  outputStride: 16,
  multiplier: 0.75,
  quantBytes: 2
});

// 分割人像
const segmentation = await net.segmentPerson(video);
```

---

## 4. 📱 集成示例

### 在群组屏幕共享中使用

```vue
<!-- client-vue/src/views/groupScreen.vue -->
<template>
  <div class="group-screen-container">
    <!-- 屏幕共享视频 -->
    <div class="screen-video-wrapper">
      <video ref="screenVideoRef" autoplay></video>
      
      <!-- 标注层 -->
      <ScreenAnnotation
        v-if="showAnnotation"
        :width="screenWidth"
        :height="screenHeight"
        :show-toolbar="true"
        @close="showAnnotation = false"
      />
    </div>

    <!-- 控制栏 -->
    <div class="controls">
      <!-- 录制 -->
      <MediaRecorder
        :stream="screenStream"
        @recording-start="onRecordingStart"
        @recording-stop="onRecordingStop"
      />
      
      <!-- 标注 -->
      <n-button
        @click="showAnnotation = !showAnnotation"
        :type="showAnnotation ? 'primary' : 'default'"
      >
        {{ showAnnotation ? '关闭标注' : '开启标注' }}
      </n-button>
      
      <!-- 停止共享 -->
      <n-button type="error" @click="stopScreenShare">
        停止共享
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ScreenAnnotation from '@/components/ScreenAnnotation.vue';
import MediaRecorder from '@/components/MediaRecorder.vue';

const screenStream = ref<MediaStream | null>(null);
const showAnnotation = ref(false);
const screenWidth = ref(1920);
const screenHeight = ref(1080);

function onRecordingStart() {
  console.log('开始录制屏幕共享');
}

function onRecordingStop(blob: Blob) {
  console.log('录制完成，文件大小:', blob.size);
  // 可以上传到服务器保存
}
</script>
```

### 在群组视频通话中使用

```vue
<!-- client-vue/src/views/groupVideo.vue -->
<template>
  <div class="group-video-container">
    <!-- 本地视频 -->
    <div class="local-video-wrapper">
      <video ref="localVideoRef" muted autoplay></video>
      
      <!-- 虚拟背景控制 -->
      <VirtualBackground
        :stream="localStream"
        @stream-updated="handleLocalStreamUpdated"
      />
    </div>

    <!-- 远程视频列表 -->
    <div class="remote-videos">
      <div 
        v-for="member in remoteMembers" 
        :key="member.socketId"
        class="remote-video-item"
      >
        <video :ref="el => remoteVideoRefs[member.socketId] = el" autoplay></video>
      </div>
    </div>

    <!-- 控制栏 -->
    <div class="controls">
      <!-- 录制 -->
      <MediaRecorder
        :stream="localStream"
      />
      
      <!-- 其他控制 -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import VirtualBackground from '@/components/VirtualBackground.vue';
import MediaRecorder from '@/components/MediaRecorder.vue';

const localStream = ref<MediaStream | null>(null);

function handleLocalStreamUpdated(stream: MediaStream) {
  // 使用虚拟背景处理后的流
  localStream.value = stream;
  // 发送给其他参与者
  // sendStreamToPeers(stream);
}
</script>
```

---

## 5. 🔧 API 参考

### ScreenAnnotation 组件

#### Props
```typescript
interface ScreenAnnotationProps {
  width?: number;          // 画布宽度（默认：容器宽度）
  height?: number;         // 画布高度（默认：容器高度）
  showToolbar?: boolean;   // 显示工具栏（默认：true）
}
```

#### Events
```typescript
interface ScreenAnnotationEvents {
  close: () => void;       // 关闭标注
}
```

#### Methods
```typescript
// 通过 ref 调用
const annotationRef = ref<InstanceType<typeof ScreenAnnotation>>();

annotationRef.value?.undo();     // 撤销
annotationRef.value?.clear();    // 清空
```

### MediaRecorder 组件

#### Props
```typescript
interface MediaRecorderProps {
  stream?: MediaStream | null;  // 要录制的流
  mimeType?: string;            // MIME类型（默认：'video/webm;codecs=vp9'）
}
```

#### Events
```typescript
interface MediaRecorderEvents {
  'recording-start': () => void;
  'recording-stop': (blob: Blob) => void;
  'recording-error': (error: Error) => void;
}
```

#### Methods
```typescript
const recorderRef = ref<InstanceType<typeof MediaRecorder>>();

recorderRef.value?.startRecording();   // 开始录制
recorderRef.value?.stopRecording();    // 停止录制
recorderRef.value?.togglePause();      // 暂停/继续
```

### VirtualBackground 组件

#### Props
```typescript
interface VirtualBackgroundProps {
  stream?: MediaStream | null;  // 原始视频流
}
```

#### Events
```typescript
interface VirtualBackgroundEvents {
  'stream-updated': (stream: MediaStream) => void;  // 处理后的流
}
```

#### Methods
```typescript
const bgRef = ref<InstanceType<typeof VirtualBackground>>();

bgRef.value?.applyEffect('blur');      // 应用效果
bgRef.value?.stopProcessing();         // 停止处理
```

---

## 6. 🎯 最佳实践

### 性能优化

1. **按需启用功能**
```typescript
// 只在需要时启用标注
const showAnnotation = ref(false);

// 只在需要时启用录制
const isRecording = ref(false);

// 只在需要时启用虚拟背景
const enableVirtualBG = ref(false);
```

2. **流管理**
```typescript
// 正确管理媒体流
onUnmounted(() => {
  if (stream.value) {
    stream.value.getTracks().forEach(track => track.stop());
  }
});
```

3. **内存管理**
```typescript
// 清理 Blob URL
const blobUrl = URL.createObjectURL(blob);
// 使用后
URL.revokeObjectURL(blobUrl);
```

### 用户体验

1. **加载提示**
```vue
<n-spin v-if="loading" description="正在处理视频...">
  <div style="height: 400px"></div>
</n-spin>
```

2. **错误处理**
```typescript
try {
  await startRecording();
} catch (error) {
  message.error('录制失败: ' + error.message);
}
```

3. **权限请求**
```typescript
// 请求屏幕共享权限
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: true,
  audio: true
});
```

---

## 7. 📊 浏览器支持

| 功能 | Chrome | Firefox | Safari | Edge |
|------|--------|---------|--------|------|
| 屏幕标注 | ✅ | ✅ | ✅ | ✅ |
| 媒体录制 | ✅ | ✅ | ✅ | ✅ |
| 虚拟背景 | ✅ | ✅ | ⚠️ | ✅ |

⚠️ Safari 的虚拟背景功能性能较低，建议使用简化效果。

---

## 8. 🐛 常见问题

### Q: 标注无法显示？
**A**: 检查 Canvas 的 z-index 是否高于视频元素。

### Q: 录制文件太大？
**A**: 降低码率或使用 H.264 编码：
```typescript
const options = {
  mimeType: 'video/webm;codecs=h264',
  videoBitsPerSecond: 1000000  // 1 Mbps
};
```

### Q: 虚拟背景卡顿？
**A**: 
1. 降低视频分辨率
2. 降低处理帧率
3. 使用更简单的效果（如纯色背景）

---

## 9. 🚀 未来增强

### 计划功能
- [ ] AI 人像分割（精确抠图）
- [ ] 美颜滤镜
- [ ] 实时字幕
- [ ] 屏幕录制上传到云端
- [ ] 标注协同（多人同时标注）
- [ ] 3D 虚拟背景

---

## 📞 技术支持

如有问题，请查看：
- 组件源码: `client-vue/src/components/`
- 示例代码: 本文档
- GitHub Issues: [项目地址]

**更新日期**: 2025-11-24  
**版本**: v2.2.0  
**作者**: AI Assistant

