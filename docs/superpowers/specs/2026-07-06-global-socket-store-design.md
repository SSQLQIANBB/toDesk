# 全局 Socket Store 简化设计

## 目标

将 `/meeting` Socket 从页面级生命周期提升为登录会话级生命周期：

- 用户登录或刷新页面恢复登录态后立即连接 Socket，与当前路由无关。
- 用户退出登录或本地认证失效后断开 Socket 并清空相关状态。
- Socket 实例、连接状态、认证状态和在线用户列表由唯一的 Pinia Store 管理。
- 全局在线用户列表排除当前登录用户。
- 删除 `ConnectionLifecycle` 和 `meetingSocket` 两层重复抽象。
- 保留群聊、群视频、群屏幕、在线状态、私信和 WebRTC 信令等现有功能。

## 非目标

- 不修改后端 Socket.IO 协议、事件名称或 `/meeting` 路径。
- 不重写 WebRTC、群组会话或消息业务。
- 不调整 `remoteShare` 的视觉样式。
- 不把聊天记录、未读数或当前联系人提升为全局状态。

## 架构

新增 `client-vue/src/stores/socket.ts`，使用 Pinia Composition Store，作为前端唯一的 `/meeting` Socket 所有者。

Store 状态：

- `socket`: 当前 Socket.IO 客户端实例。
- `connected`: 传输层是否已连接。
- `authenticated`: 服务端是否已完成用户认证。
- `userList`: 服务端 `user_list` 事件中的在线用户，过滤当前登录用户。
- `joinedGroupIds`: 当前需要保持订阅的群组 ID 集合，用于重连后恢复群组房间。

Store 操作：

- `connect(token, user)`: 创建或复用 Socket，绑定一次全局事件，并在已连接时发起认证。
- `authenticate(token, user)`: 发送 `authenticate`，支持 Token 刷新后重新认证。
- `disconnect()`: 主动断开、解除全局事件并清空会话状态。
- `joinGroup(groupId)` / `leaveGroup(groupId)`: 管理群组房间订阅。
- `updateStatus(status)`: 发送在线状态更新。

`ConnectionLifecycle` 的状态机和订阅集合由 Store 中的响应式布尔状态替代。页面不再订阅人工生命周期通知，直接读取 `authenticated` 或监听实际 Socket 业务事件。

## 登录生命周期

根组件负责协调认证 Store 与 Socket Store：

1. 应用启动时，认证 Store 从本地存储恢复 Token 和用户。
2. 根组件使用立即执行的响应式监听观察 Token 和当前用户。
3. Token 与用户同时存在时调用 `socketStore.connect(token, user)`。
4. Token 更新时，Store 使用新 Token 再次发送认证，不创建第二个 Socket。
5. Token 或用户被清除时调用 `socketStore.disconnect()`。

该设计避免认证 Store 和 Socket Store 互相导入，防止循环依赖。登出接口仍由认证 Store 调用；本地认证状态清除后，根组件统一触发 Socket 断开。

## 事件所有权

Store 永久持有、只绑定一次的全局事件：

- `connect`
- `disconnect`
- `authenticated`
- `auth_error`
- `user_list`
- `group_call_state`
- `group_call_started`
- `group_call_ended`

`group_call_*` 事件继续更新现有 `groupSessionState`，因为它承载实际群视频和群屏幕业务状态，不属于重复的连接生命周期抽象。

页面只绑定自己使用期间需要的功能事件，并在卸载时用同一个具名处理函数解除：

- `remoteShare`: 私信、点对点 WebRTC 呼叫和信令事件。
- 群聊页面：群消息和成员在线事件。
- 群视频、群屏幕页面：各自媒体信令事件。

页面卸载不得调用全局 `disconnect()`，也不得清空全局 `userList`。

## 页面迁移

### `remoteShare/index.vue`

- 删除本地 `socket`、`online`、`userList` 和 `initialSocket`。
- 使用 `storeToRefs(socketStore)` 获取 Socket、认证状态和在线用户列表。
- 页面挂载时只绑定私信/WebRTC事件，卸载时只解绑这些事件。
- 退出登录只调用认证 Store 的 `clearAuth`；全局监听负责断开 Socket。
- 保留当前未提交的样式和图标调整。

### 群组相关页面

- `groups.vue`、`groupChat.vue`、`groupVideo.vue`、`groupScreen.vue` 改用 Socket Store 的 `joinGroup`、`leaveGroup` 和全局 Socket。
- 已加入群组集合保存在 Store 中；Socket 重连并认证成功后自动重新发送 `join_group`。
- `profile.vue` 改用 Store 的 `updateStatus`。

完成迁移后删除：

- `client-vue/src/services/meetingSocket.ts`
- `client-vue/src/services/connectionLifecycle.ts`
- `client-vue/src/services/connectionLifecycle.test.ts`

## 异常处理

- 传输断开：`connected` 和 `authenticated` 设为 `false`，`userList` 清空；Socket.IO 自动重连。
- 重连成功：使用最新 Token 重新认证，认证成功后恢复群组订阅。
- 认证失败：`authenticated` 设为 `false`，清空 `userList`；不在 Socket Store 内直接跳转路由或清理 Token，避免与 HTTP 鉴权逻辑竞争。
- 登出：认证 Store 先完成登出请求，再清理本地认证；根组件观察到认证清空后断开 Socket。
- 页面重复挂载：所有页面事件使用具名函数成对 `on`/`off`，防止监听器累积。

## 测试

新增 Socket Store 单元测试，使用可控的 Socket 工厂或 Socket mock 验证：

- 登录后只创建一个 Socket。
- 连接后发送认证信息。
- Token 更新时复用 Socket 并重新认证。
- `user_list` 排除当前用户。
- 断开或登出时清空在线用户。
- 认证重连后恢复已加入群组。
- 重复调用 `connect` 不重复绑定全局监听器。

更新或新增页面测试，验证：

- `remoteShare` 不再负责连接和断开全局 Socket。
- 页面卸载只解除页面业务监听。

最终运行客户端单元测试、类型检查和生产构建。
