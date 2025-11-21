# Remote 远程桌面/视频通话功能使用说明

## 🎯 功能概述

本项目实现了基于 WebRTC 的实时音视频通讯功能，支持：
- 📹 **视频通话** - 点对点视频聊天
- 🖥️ **屏幕共享** - 实时共享屏幕内容
- 💬 **即时消息** - 文字聊天功能
- 👥 **在线用户列表** - 查看当前在线用户

## 🚀 快速开始

### 1. 安装依赖

#### 后端
```bash
cd backend-koa
pnpm install
# 注意：需要安装uuid包
pnpm add uuid
pnpm add -D @types/uuid
```

#### 前端
```bash
cd client-vue
pnpm install
```

### 2. 启动项目

#### 启动后端服务
```bash
cd backend-koa
pnpm dev
# 服务运行在 http://localhost:3000
```

#### 启动前端服务
```bash
cd client-vue
pnpm dev
# 通常运行在 http://localhost:5173
```

### 3. 使用功能

1. **登录连接**
   - 打开浏览器访问前端地址
   - 点击右上角"登录"按钮连接服务器
   - 系统会自动分配一个匿名用户ID

2. **选择联系人**
   - 从左侧用户列表中选择要联系的用户
   - 点击用户卡片即可开始聊天

3. **发送消息**
   - 在底部输入框输入文字
   - 按 Enter 换行，Ctrl+Enter 发送消息
   - 点击"发送"按钮发送

4. **视频通话**
   - 选择联系人后，点击工具栏的"视频通话"按钮（摄像头图标）
   - 等待对方接听
   - 对方会收到来电提示，可选择接听或拒绝
   - 连接成功后可以进行双向视频通话

5. **屏幕共享**
   - 选择联系人后，点击工具栏的"屏幕共享"按钮（屏幕图标）
   - 浏览器会提示选择要共享的屏幕/窗口/标签页
   - 对方接听后可以看到您的屏幕内容

6. **结束通话**
   - 点击红色"挂断"按钮结束通话
   - 或者在屏幕共享时停止共享也会自动结束

## 🏗️ 技术架构

### 前端技术栈
- **Vue 3** - 渐进式JavaScript框架
- **TypeScript** - 类型安全
- **Naive UI** - Vue 3 组件库
- **Tailwind CSS** - 实用优先的CSS框架
- **Socket.IO Client** - WebSocket客户端
- **WebRTC** - 实时音视频通讯

### 后端技术栈
- **Koa** - Node.js Web框架
- **Socket.IO** - WebSocket服务端
- **TypeScript** - 类型安全

### 通信流程

#### WebRTC信令流程
```
呼叫方                    服务器                    接收方
  |                        |                        |
  |--webrtc_call_request-->|--webrtc_call_request-->|
  |                        |                        |
  |<--webrtc_call_response-|<-webrtc_call_response--|
  |                        |                        |
  |--webrtc_offer--------->|--webrtc_offer--------->|
  |                        |                        |
  |<--webrtc_answer--------|<--webrtc_answer--------|
  |                        |                        |
  |--webrtc_ice----------->|--webrtc_ice----------->|
  |<--webrtc_ice-----------|<--webrtc_ice-----------|
  |                        |                        |
  |<======== P2P连接建立 ========>|
```

## 📁 项目结构

```
toDesk/
├── backend-koa/           # 后端服务
│   └── src/
│       ├── config/
│       │   └── meeting.ts # WebRTC信令服务器
│       └── app.ts         # 应用入口
│
└── client-vue/            # 前端应用
    └── src/
        └── views/
            └── remoteShare/
                ├── index.vue              # 主页面
                └── components/
                    ├── ToolBar.vue       # 工具栏（视频/屏幕按钮）
                    └── config.ts         # 媒体设备配置
```

## 🔧 核心功能实现

### 1. Socket.IO 信令服务
后端实现了以下信令转发：
- `webrtc_offer` - WebRTC offer 信令
- `webrtc_answer` - WebRTC answer 信令
- `webrtc_ice` - ICE candidate 信令
- `webrtc_call_request` - 呼叫请求
- `webrtc_call_response` - 呼叫响应
- `webrtc_hangup` - 挂断通知

### 2. WebRTC 连接建立
使用 RTCPeerConnection API 建立点对点连接：
- 配置 STUN 服务器用于 NAT 穿透
- 交换 SDP (Session Description Protocol)
- 交换 ICE candidates
- 建立媒体流传输

### 3. 媒体设备访问
- 摄像头：使用 `getUserMedia` API
- 屏幕共享：使用 `getDisplayMedia` API
- 支持音频和视频轨道控制

## 🎨 UI 优化亮点

1. **现代化设计**
   - 渐变色背景
   - 圆角卡片设计
   - 阴影效果增强层次感

2. **交互反馈**
   - 悬停动画效果
   - 加载状态提示
   - 连接状态实时显示

3. **响应式布局**
   - 自适应不同屏幕尺寸
   - 视频窗口根据类型自动调整

4. **用户体验**
   - 未读消息角标
   - 自动滚动到最新消息
   - 来电弹窗提示

## ⚙️ 配置说明

### 媒体设备配置 (config.ts)

#### 摄像头配置
```typescript
cameraConstraints = {
  audio: true,
  video: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: 'user'
  }
}
```

#### 屏幕共享配置
```typescript
screenRecordConstraints = {
  video: {
    cursor: 'always',
    displaySurface: 'monitor',
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 60 }
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
}
```

### STUN/TURN 服务器配置

默认使用 Google 公共 STUN 服务器：
```typescript
{
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}
```

如需更好的连接性能，建议配置 TURN 服务器。

## 🐛 故障排除

### 1. 无法访问摄像头/麦克风
- 检查浏览器权限设置
- 确保使用 HTTPS 或 localhost
- 检查是否有其他应用占用设备

### 2. 无法建立连接
- 检查防火墙设置
- 确认 WebSocket 连接正常
- 查看浏览器控制台错误信息

### 3. 视频卡顿
- 检查网络带宽
- 降低视频分辨率和帧率
- 考虑配置 TURN 服务器

## 📝 注意事项

1. **浏览器兼容性**
   - 推荐使用 Chrome、Firefox、Edge 等现代浏览器
   - Safari 需要较新版本才能完整支持

2. **安全性**
   - 生产环境必须使用 HTTPS
   - 建议添加用户认证机制
   - 注意保护用户隐私

3. **性能优化**
   - 大规模部署建议使用专业的媒体服务器（如 Janus、Jitsi）
   - 考虑使用 SFU (Selective Forwarding Unit) 架构

## 🔮 未来规划

- [ ] 用户认证和授权
- [ ] 文件传输功能
- [ ] 录制功能
- [ ] 多人视频会议
- [ ] 屏幕共享时的标注工具
- [ ] 聊天记录持久化
- [ ] 移动端适配

## 📄 许可证

MIT License

---

**开发者**: AI Assistant  
**最后更新**: 2025-11-21

