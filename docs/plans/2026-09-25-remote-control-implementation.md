# 远程控制实施进度

首次实施：2026-09-25；续行实施：2026-09-26。依据 [设计 v2](./2026-09-25-remote-control-design.md)，签名与主控信令合同见[协议补充](./2026-09-26-remote-control-wire-protocol.md)。

当前已完成真实 macOS 画面链路、设备身份、授权、原生监督和四阶段画面活性，并通过开发 CLI 将 Rust 授权租约、实际 DTLS、采屏进程与现有 Web 主控接通。**仍不是可发布的键鼠远控版本**：实际 OS 输入、产品系统确认和生产信令尚未完成整体实机验收，所有远控发布入口保持关闭。

## 1. 已实现

| 范围 | 实际代码与行为 |
| --- | --- |
| 多设备认证 | `LoginSession` 按 sid 隔离刷新凭据，MySQL 持久化非空 authVersion；登录、刷新、注销、改密和重置密码接入事务式签发/撤销。注销专用路径允许正确签名但已过期的 access 撤销自身有效 sid，普通接口仍拒绝过期凭据。旧版缺 sid 的 JWT 拒绝并要求重新登录。 |
| 刷新重试与并发 | 刷新哈希 CAS、用户→会话统一锁顺序、同 requestId 的短时加密响应恢复；HTTP/Socket 共用前端刷新，防止迟到响应恢复已退出/切换身份。 |
| 存活 Socket 撤销 | 原 `/meeting` 认证使用 sid 权威校验，后续事件重新检查；撤销事件断开匹配连接，不能仅从在线列表删除后继续保留收发能力。 |
| 设备身份基础 | `POST /api/remote-control/device-challenges` 与 `POST /devices` 验证一次性 Ed25519 签名，绑定账号/sid/nonce/别名/平台；密钥指纹唯一、挑战有期限且只能消费一次。注册不意味着设备在线或可控。 |
| 设备管理界面 | 个人中心“远程设备”及远控页面复用管理组件；Web 可查看/撤销本人设备，桌面根据原生能力登记当前设备。取消、注销和账号切换阻断迟到提交；已发出的 REST 请求不假装回滚。已撤销身份需原生明确确认重建后再登记。 |
| 设备/历史接口 | 已登录用户可查询自己的设备、撤销设备和读取自身近 30 天会话记录；模型和显式迁移已加入，尚不创建真实远控历史。 |
| 会话域服务 | 独立 request/respond/ready/pause/grant-control/cancel/end 状态转换，校验双方连接身份；Redis Lua 原子占用两端、CAS、幂等、终态和历史 outbox。创建前写 MySQL 请求记录并校验许可、设备和登录会话，结束优先写 Redis。生产信令请求入口尚未开放。 |
| 会话运行时 | 接入应用启动/退出：有界超时扫描、撤销索引、幂等事件归档、Redis 丢失后的 interrupted 对账、服务重启终止旧会话；迟到清理/ACK 不删除新状态，账号版本撤销事件支持乱序。 |
| 历史保留 | 查询与清理统一使用 30 天窗口；仅删除过期终态记录及对应事件，SQL 事务保证整体回滚；保护未确认 outbox（含延期重试）与活动会话，Redis 失败不删除。按游标分批扫描，排空后每小时检查。 |
| 签名授权 | 新增仅用于原生提示的 approval-request，与设备同意通过 approvalId 精确绑定；已有独立 Ed25519 建连/租约签名器与公钥接口、Rust/浏览器验签。严格绑定端点、同意 nonce、屏幕、协商与 DTLS 指纹，短租约单次 challenge，过期不恢复旧会话。 |
| 授权协调服务 | 新增 prepareApproval→consent→bindTransport→双方 ready→native challenge lease 流程，每步复核登录/设备/连接权威，拒绝网页自报 ready/challenge；重新控制被拒绝保留观看。上下文容量与并发有界，重启不恢复授权；生产 presence/native transport 适配器尚未接入。 |
| 发布门禁 | `/remote-control` namespace 与 REST capability 接口独立于旧 `webrtc_*`；未通过 M0 的版本拒绝远控连接，不能靠自报 isDesktop/engineReady 绕过。 |
| 前端环境与入口 | `isTauri()` + 原生能力 + 服务端发布状态综合判断；主控与被控权限分开，工具栏隐藏未发布入口；直达 `/remote-control` 展示真实不可用状态。 |
| 主控传输与界面 | 新增接收视频的 PeerConnection、可靠输入/状态双通道、受限 SDP/ICE、签名握手/租约验证、常驻会话界面和独立 Socket 适配器；未授权不发布视频轨道，画面冻结 3 秒暂停输入、10 秒结束。完整应用被控端仍缺生产原生接入。 |
| 前端输入 | 单一可靠有序通道发送器、移动合并后连续 seq、500ms 票据、坐标黑边过滤、积压暂停、ACK 代次校验与本地停止；显式文字提交等到新票据才发送，超时/失焦取消且保留文字。已接主控 peer 与原生门禁，OS 执行器尚未实机验收。 |
| 媒体互斥 | 私聊通话、群音视频、群屏幕共享和远控共用占用协调器；异步采集完成后再次检查占用，退出释放，文字聊天不占用媒体。 |
| 原生基础 | 无弹窗系统权限探测、显式 Tauri 命令 ACL、幂等本地停止入口、纯 Rust 会话/租约/输入票据/释放计划门禁。无媒体或注入启动命令。 |
| 原生设备与同意 | 私钥使用 OS 凭据存储，限定用途登记签名；固定编译公钥验签后才弹原生系统确认，选择结果由原生生成签名和 LocalConsent，网页不能传 accepted。停止、超时和重复确认失败关闭；默认可信公钥为空，确认功能不可用。详见[身份说明](./2026-09-26-remote-control-native-identity.md)。 |
| 原生媒体实验 | macOS ScreenCaptureKit→VideoToolbox 硬件 H.264→继承管道→GStreamer→Chromium 的真实画面链路通过；1280×720、15fps 上限、首帧约 554–1,097ms。正常停止、断管道、心跳超时和父进程强杀共六种情况均停止采屏并退出，无孤儿进程。仅限本机实验，未接产品授权链路。 |
| 原生监督与认证 IPC | `HostRuntime`/`HostSupervisor` 接入 LocalConsent、已验证租约、原生 ready、权限、100ms 独立检查与停止/重置；每次进程启动独立 HMAC 密钥、双向连续序号、固定资源路径/hash、消息/队列/清理有界。默认 sidecar 清单为空。详见[监督与输入说明](./2026-09-26-remote-control-native-supervisor.md)。 |
| 独立画面活性 | capture/encoded/forwarded/rendered 四阶段分别推进；原始单调时间通过认证 IPC 传递，3 秒停滞暂停输入、10 秒结束。缓存重复编码、心跳、续租不能掩盖采集冻结；恢复画面不恢复旧控制代次，合法在途输入丢弃且不 ACK。 |
| 原生输入执行器 | 严格输入解码、完整身份/租约/布局绑定、500ms 原生票据、执行前截止时间检查、成功 down 记账和有限释放重试；macOS CoreGraphics 主屏键鼠/Unicode 适配器已编译，测试用记录执行器，未实际注入桌面。 |
| 带授权的开发闭环 | feature 隔离 CLI 使用公开测试密钥与测试同意；GStreamer 读取真实 DTLS 证书，Rust 安装签名租约后才启动采屏，现有 `RemoteControlPeer` 验签接收真实画面。正常停止、租约到期、父进程强杀、stdin EOF 和暂停继续观看均通过。 |

关键落点：

- 后端：`backend-koa/src/services/loginSessionService.ts`、`remoteControlProtocol.ts`、`remoteControlService.ts`、`redisRemoteSessionStore.ts`、`remoteDeviceProof.ts`、`remoteCredentials.ts`、`remoteAuthorizationCoordinator.ts`、`remoteControlRuntime.ts`、`remoteSessionHistory.ts`。
- 前端：`client-vue/src/services/remoteControlPeer.ts`、`remoteControlProof.ts`、`remoteControlAdapter.ts`、`remoteControlInput.ts`、`remoteDeviceNative.ts`、`mediaOccupancy.ts`；`stores/remoteDevices.ts`、`remoteControlSession.ts`；`components/RemoteDeviceSettings.vue`、`GlobalRemoteControl.vue`。
- 原生：`client-vue/src-tauri/src/remote_control/identity.rs`、`device_store.rs`、`authorization.rs`、`guard.rs`、`input.rs`、`ipc.rs`、`host_runtime.rs`、`host_process.rs`、`media_liveness.rs`；`scripts/remote-control-screen-source.swift`、`remote-control-host-engine.py`、`remote-control-supervisor-probe.mjs`。历史媒体实测见 [M0 记录](./2026-09-25-remote-control-m0-validation.md)。

## 2. 当前明确不提供的能力

- 创建临时协助许可返回 `NATIVE_VALIDATION_PENDING`；目标发现返回空列表，不能沿用聊天用户在线状态冒充可控设备。
- 活动信令 namespace 拒绝连接；产品 request/accept/SDP/ICE/ready/lease 尚未整体接通，开发 CLI 不替代真实账号和设备在线权威，ICE 凭据接口不会返回静态凭据。
- 授权协调服务仍通过可信适配器接口依赖真实在线证明、SDP/DTLS 证据和原生 challenge；目前没有生产适配器，不能把测试用私有注册表当作实际设备权威。
- 原生确认、密钥、输入执行器与认证 IPC 已落地，但当前真实媒体验证使用 feature 隔离的开发 CLI、测试同意和记录型输入；系统确认窗口、签名 sidecar 和实际 OS 按键释放尚未整体实测。释放失败只做有界重试，不保证权限被撤销后 OS 一定接受 key-up。
- 输入坐标尚需完成真实内容矩形、主屏缩放/DPI、旋转与原生坐标的对齐验收；当前开发视频固定 1280×720，不足以证明任意屏幕配置都能准确点击。
- 无 Windows 实机、TURN 公网强制中继、签名安装包和完整性能报告；文件传输、剪贴板、多屏切换、无人值守均未实现。

上述未完成项不得通过修改 `engineReady` 或发布常量绕过。当前已验证本机媒体探针真实停采屏与主控 PeerConnection 清理；实际 OS 按键释放、正式安装包及跨网络行为仍须独立验收。

会话运行时当前按单个活动后端实例实现，接入与清理共享同一 Redis 连接。多实例部署需要先补会话所有权、路由及退出时在途请求协调，不能直接横向扩容后启用远控。

## 3. 数据库升级

本次只新增和测试迁移文件，**未修改现有业务/生产数据库**。现有数据库上线新服务前必须按 [迁移说明](../../backend-koa/migrations/README.md)停写备份并依次执行：

1. `20260925-login-sessions.up.sql`。
2. `20260925-remote-control.up.sql`。
3. `20260926-remote-lifecycle.up.sql`。
4. 同步更新前后端；用户重新登录，旧版无 sid 的访问/刷新令牌不再接受。

不使用 `DB_SYNC_ALTER=true` 代替迁移，不混跑新旧认证版本。回滚保留会话撤销/设备/历史数据，不能回滚到重新接受 null authVersion 的实现。

## 4. 验证方式

```sh
pnpm test
pnpm typecheck
pnpm --filter client-vue build
VITE_API_BASE_URL=http://127.0.0.1:3000 VITE_SOCKET_URL=http://127.0.0.1:3000 pnpm --filter client-vue desktop:web:build
pnpm --filter backend-koa test:remote:integration
pnpm --filter client-vue test:e2e tests/e2e/remote-control-peer.spec.ts
cargo check --locked --manifest-path client-vue/src-tauri/Cargo.toml
cargo test --locked --manifest-path client-vue/src-tauri/Cargo.toml
bash scripts/remote-control-native-probe.sh
REMOTE_CONTROL_PROBE_PYTHON=/tmp/todesk-gstreamer-m0-1.28.7/bin/python node scripts/remote-control-webrtc-probe.mjs --source=screen
python3 scripts/remote-control-screen-lifecycle.py
```

Redis 集成测试自行创建临时 Unix socket 实例并清理，不连接应用 Redis。MySQL 测试使用 `AUTH_TEST_MYSQL_URL`，只允许 `todesk_auth_test_` 前缀的临时测试库；从 `backend-koa` 运行 `pnpm exec vitest run --config vitest.integration.config.ts`，连接配置与运行方法见迁移说明。没有配置的 MySQL 集成测试跳过，不能用普通单测通过代替实测数据库证据。

本次已在独立临时 MySQL/Redis 实例验证刷新与撤销竞态、事务回滚、迁移、占用竞争和签名证明；原生采屏/媒体验证详见 M0 记录。系统权限与签名包、不同 OS/架构、真实键鼠行为不能由前端 mock 或纯 Rust 测试替代。

2026-09-25 第一轮验证：后端 103 项单测、前端 183 项单测、18 项真实 MySQL/Redis 集成测试、13 项 Rust 测试通过。2026-09-26 续行新增真实画面、签名协议、生命周期和主控浏览器验证，结果见下述续行记录及 M0 报告。所有数据库集成测试使用隔离实例，未连接现有业务数据库。构建仍有原有样式深度选择器与打包体积提示。

### 2026-09-26 第一轮续行验证：媒体与租约

| 验证范围 | 结果与证据边界 |
| --- | --- |
| 后端单元测试 | 22 个文件、112 项通过；含 Node/Rust 共用签名向量、拒绝篡改/复制授权、改密撤销乱序与签名公钥接口。 |
| 前端单元测试 | 50 个文件、204 项通过；覆盖签名、占用互斥、取消后迟到采集、文字票据等待与跨会话队列计数隔离。 |
| 真实 MySQL/Redis | 5 个文件、36 项通过，其中生命周期套件 18 项；包含超时 CAS、归档重试、重启/退出、Redis 丢失、30 天清理及事务失败保护。临时 MySQL 已关闭，未操作业务库。 |
| Rust | `cargo check --locked` 与 21 项测试通过；覆盖签名绑定、单次 challenge、租约过期不可复活和新本地同意恢复控制，未执行 OS 注入。 |
| 真实 Chromium 主控 | 1 项端到端用例通过（约 14 秒）：真实 WebRTC、DTLS 证书指纹、WebCrypto 签名、有序输入、重新授权，以及视频冻结但心跳正常时 3 秒暂停/10 秒结束。视频源为测试画布，不代表真实被控端联调。 |
| 类型检查与 Web 构建 | 前后端类型检查、最终 `client-vue build` 通过。仍有既有深度选择器和包体积提示，未将其当作远控验收结果。 |
| 桌面前端构建 | `desktop:web:build`（包含 `vue-tsc`）通过，使用显式 localhost 测试地址；未修改 `.env`，产物不作为可发布安装包。 |
| 真实 macOS 画面 | ScreenCaptureKit/VideoToolbox/GStreamer 到 Chromium 解码和 DataChannel 回传通过；首帧约 554–1,097ms，仅本机短时采样。 |
| 原生进程清理 | 正常停止、stdin EOF、stdout 断开、心跳丢失、SIGTERM、父进程 SIGKILL 共 6 种场景通过；各场景均已产生至少 8 帧再触发停止，停止采屏并退出。 |

源代码检查与文档链接检查通过。该验证记录不等同于完整安装包、公网中继或实际远程键鼠功能验收。

### 2026-09-26 第二轮续行验证：设备身份与授权协调

| 验证范围 | 结果与证据边界 |
| --- | --- |
| 后端 | 23 个文件、138 项单测与类型检查通过；其中授权协调器 24 项，覆盖真实签名闭环、失效身份/提示/DTLS、拒绝后保留观看、异步续租跨期限、并发容量和外部结束后的有界回收。 |
| 前端 | 53 个单测文件、229 项通过；包含设备登记、身份重建、取消/注销/账号切换、共享刷新取消和界面测试。最终 Web 与桌面前端构建（含类型检查）通过。 |
| 真实浏览器界面 | Chromium 1440px 与 390px 两档 2 项通过；个人中心设备列表、Web 隐藏原生操作、撤销取消/确认和无横向溢出均验证，窄屏截图已目检。 |
| 原生 | `cargo check --locked` 通过；默认 33 项测试通过、1 项 OS 存储测试忽略。共享 Node/Rust 向量包含中文设备名、签名提示与同意证明。 |
| macOS Keychain | 默认忽略的随机测试 service 读写/删除测试已单独通过，禁止弹框，清理后确认凭据不存在；未创建真实设备身份。 |
| 代码与配置 | 发布门禁保持关闭，可信原生公钥文件默认 `[]`；未改业务数据库，也未新增迁移。新增 macOS 依赖要求 Rust ≥ 1.85，本轮在 Rust 1.97.1 编译。 |

系统确认窗口尚未人工交互，Windows 尚未实测；授权协调器通过受信适配器接口验证，测试使用私有句柄注册表和真实签名，不能代替实际设备在线/原生传输。上一轮真实画面与数据库结果保留为历史证据，本轮没有把它们重复记作新增验证。

### 2026-09-26 第三轮续行验证：原生监督与授权媒体闭环

| 验证范围 | 结果与证据边界 |
| --- | --- |
| Rust | 默认 69 项通过、1 项 Keychain 测试忽略；`cargo fmt --check`、`cargo check --locked` 与 debug harness 构建通过。包含输入门禁、Unicode 分段、租约/票据截止、身份撤销、独立监督、释放/终止失败重试、实际无害子进程回收和递归重复 JSON 键拒绝。没有实际 OS 输入。 |
| Python/IPC | 19 项通过；共享 Rust/Python 固定 MAC 向量，涵盖篡改、反射、重放、乱序、截断、超限、重复字段、数值溢出、排队不延长媒体期限、无 DTLS/双通道不得采屏、禁止命令覆盖程序路径。 |
| 独立媒体进程 | 租约到期、stdin EOF、监督心跳丢失 3 例真实 loopback 通过；实际双方 DTLS 证书哈希匹配，授权前零帧，授权后真实采屏，结束后画面不再推进、采屏子进程退出。 |
| Rust + 现有主控组件 | 使用真实 `RemoteControlPeer` 的 6 种开发场景通过：正常停止、租约到期、父进程 SIGKILL、stdin EOF、暂停后继续观看，以及控制范围下的记录型输入/暂停。均为真实 H.264 1280×720 画面，采屏与引擎 PID 均确认退出，未保存画面文件。 |
| 授权与输入 | 未安装租约时 frames/published 均为 0；仅观看不能 arm。控制范围先显式 arm，再经实际数据通道发送点击 down/up 与中文/emoji 文字，Rust 门禁返回 ACK `[1,2,3]`；暂停后继续播放，旧控制代次不能重新 arm。CLI 执行器仅记录/接收测试输入，不发送 OS 事件。 |
| 本机时延样本 | 从首个租约安装到首帧约 647–1,173ms；7 秒租约约 7,088–7,109ms 完成停止；正常停止/EOF 确认约 62–88ms。最终回收修复后，控制/暂停及租约到期两例已重新通过。这是少量本机样本，不代表 P95 或跨网络指标。 |
| 发布与外部状态 | `engineReady/canCapture/canInjectInput` 仍为 false，可信公钥与 sidecar 清单默认 `[]`。harness 仅 debug feature，release 启用会编译失败。未部署、未修改业务数据库、未创建真实设备身份。 |

本轮修复了联调发现的解释器路径丢失虚拟环境、IPC 并发序号入队竞态、正常 EOF 被误报错误、主屏选择不一致和子进程终止失败未继续回收等问题。此轮尚未完成的发送端独立画面活性已在下轮补齐；实际系统确认/键鼠、签名包、Windows 与 TURN 仍需验收。

### 2026-09-26 第四轮续行验证：四阶段画面活性

| 验证范围 | 结果与证据边界 |
| --- | --- |
| Rust | 85 项通过、1 项 Keychain 测试忽略；格式检查、`cargo check --locked` 和 debug harness 构建通过。包含进度缺失/重复/倒退/未来时间、排队不延长截止、四阶段独立冻结、恢复不自动 arm、执行跨活性截止、暂停后合法在途输入及租约到期竞争。错误会话/控制代次/布局与未来输入代次均拒绝，旧输入代次可丢弃。全部使用记录/模拟输入执行器。 |
| Swift/Python | Swift 普通和测试构建均通过，普通构建拒绝故障参数；Python 28 项通过（引擎 21、IPC 7），校验源/转发进度独立、无效更新原子拒绝和测试开关边界。 |
| 前端 | 54 个文件、236 项单测、类型检查及 1 项真实 Chromium WebRTC 测试通过；input-arm 前先有序上报真实帧数，未 arm 时收到原生暂停仍更新界面，恢复帧与续租不恢复控制。 |
| 真实采集冻结 | 缓存 H.264 仍播放、双向心跳与续租正常；最终复测约 3,031ms 暂停、10,025ms 以 `MediaStalled` 结束。暂停后实际数据通道迟到输入被丢弃，无执行/ACK，也不提前结束观看。 |
| 真实采集恢复 | 测试冻结 4.5 秒后恢复，约 2,943ms 暂停；健康恢复后继续观看超过原始 10 秒截止。主控拒绝旧控制 arm，直接发送旧 input-arm 给原生也未获授权且未结束观看。 |
| 分阶段冻结 | 编码冻结约 2,964/10,117ms、转发冻结约 2,919/10,019ms、浏览器呈现冻结约 3,315/10,382ms 分别暂停/结束，原因均为 `MediaStalled`。后两种保持上游采集/编码正常；测试主控停用自身视频定时器但继续发送真实帧数，独立证明原生监督生效。 |
| 授权与清理 | 五种冻结/恢复场景均在授权前零帧，首帧后经真实通道完成记录型输入 ACK `[1,2,3]`；每 4 秒续签 15 秒租约，均安装至少 3 个租约。结束后采屏/引擎 PID 退出、视频计数不再推进，无画面文件。 |
| 常规回归 | 控制范围暂停后继续观看通过；7 秒租约约 7,113ms 后正常停止、CLI exit 0。修复到期时最后心跳/challenge 被误报错误的竞争；原生先独立确认截止，再分类同时发生的引擎退出，提前故障仍按失败处理。两例均确认子进程退出。 |

本轮只验证本机短时开发链路，不代表性能分位数或发布安装包。故障注入受测试编译/启动参数限制，生产能力门禁和空可信清单保持不变；没有实际 OS 输入、部署或业务数据库变更。协议与复现命令见[原生监督说明](./2026-09-26-remote-control-native-supervisor.md)。

## 5. 接下来的实施顺序

1. 完成视频内容矩形、主屏缩放/DPI、旋转与原生指针坐标合同及回归，验证黑边和布局变化不会导致偏移或误点。
2. 将真实画面链路整理为可发布原生引擎，固定最小依赖、许可证和可重现打包；将监督与认证 IPC 接入正式资源包，完成人工系统确认及密钥的实机/签名包验收，移除测试 CLI/密钥依赖；验证 WKWebView 与软编码回退。
3. 在已明确授权的测试电脑上验证 macOS 输入执行器、Unicode、退出/断网/冻结时停止与按键释放；macOS 需实际运行客户端获辅助功能权限，Windows 输入和采屏需独立实现与实机验证。
4. 接通设备在线/临时许可/会话信令和生产停止路径，将已实现的主控、会话运行时与原生被控端连成桌面闭环。
5. 完成 TURN、公网/失败场景、正式安装包和设计指标验收，按平台开放桌面后再开放 Web 主控。
