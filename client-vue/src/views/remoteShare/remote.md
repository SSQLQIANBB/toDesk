## 功能模块
- socket管理
  1. 连接socket
  2. p2p端点设置（用户名，用户ID）
  3. 用户消息通讯；on:message & socket.to(socketId).emit('message');
  4. 在线用户列表；（用户名、用户ID、socketId）
  5. ICE/offer/answer传输；
  6. 视频发起；
  7. 群聊（视频、聊天）；
  8. 屏幕共享；

- P2P功能
  1. RTCPeerConnection
  2. 信令服务-socket
  3. STUN&TURN服务
  4. offer/answer/candidate
  5. 视频|语音流传输

- 插件
  1. socket.io-client & socket.io