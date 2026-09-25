# 远控 M0 原生能力验证记录

首次记录：2026-09-25；续行验证：2026-09-26。对应设计 v2 第 6.1、6.4、7.4 节。

**结论：原生能力握手和安全门禁基础已经落地；完整远控引擎尚未通过 M0，不开放被控能力。** `engineReady`、`canCapture`、`canInjectInput` 均明确为 `false`。这不是一个可操作远端桌面的版本。

## 1. 本次交付边界

| 内容 | 已交付 | 未宣称完成的部分 |
| --- | --- | --- |
| 原生能力报告 | Tauri `remote_control_capabilities`，实际平台、版本、架构及无弹窗权限探测 | 不能以系统权限通过推断媒体引擎或键鼠注入已可用 |
| 命令权限 | `AppManifest::commands` 显式纳入 ACL，仅本地 main 窗口获准；新增限定用途登记、原生系统确认和显式身份重建，命令内再次校验窗口 | 未开放媒体启动、OS 输入或任意签名命令 |
| 设备密钥与同意 | OS 凭据存储、固定编译公钥、原生系统决定、内存 LocalConsent；共享 Node/Rust 向量与取消/回放/失败测试 | 真实系统交互、Windows 和正式签名安装包仍需单独验收；尚未接媒体引擎 |
| 本地停止 | `remote_control_stop` 幂等关闭监督状态并清除同意，令等待中确认失效；托盘退出/应用退出复用停止路径 | 当前没有活动引擎、OS 注入或媒体可停止；将来必须消费实际释放计划并停采集。原生窗口迟到结果无效，不等于窗口一定立即关闭 |
| 门禁内核 | 纯 Rust 单元测试覆盖协议、代次、序号、输入票据、短租约与停止；新增 Ed25519 凭据验证、本地同意/对端指纹绑定、单次 challenge 与过期后不可恢复校验 | 无生产激活入口；尚未把可信本地确认与真实 PeerConnection 指纹传入校验器，也没有生产后台看门狗线程或实际注入器 |
| macOS 原生探针 | 可重复编译、运行权限与 ScreenCaptureKit 单帧验证工具 | 独立探针不代表签名安装包的权限、媒体互通或性能验收 |
| 编码与浏览器互通 PoC | 合成 VP8 保留独立验证；新增连续真实桌面 ScreenCaptureKit → VideoToolbox 硬件 H.264 → 继承管道 → GStreamer → Chromium，DataChannel 回传同时通过 | 当前仅本机 loopback 的显式开发探针，尚未接生产授权、签名 sidecar、TURN 或实际输入 |

未新增网页可直接调用的采屏、键鼠、shell、任意进程或通过 boolean 升级权限的命令；原生确认必须先验服务端签名，再取得本机系统窗口的明确决定。能力探测不调用 `CGRequestScreenCaptureAccess`，不以 `AXIsProcessTrustedWithOptions(prompt=true)` 弹窗，也不创建密钥。macOS 的 `denied` 表示当前未授予，系统预检 API 无法进一步区分从未询问和用户明确拒绝。

## 2. 前后端合同

`invoke('remote_control_capabilities')` 返回：

```json
{
  "runtime": "tauri",
  "platform": "macos",
  "osVersion": "26.3.1",
  "arch": "aarch64",
  "protocolVersion": 1,
  "engineReady": false,
  "canCapture": false,
  "canInjectInput": false,
  "deviceRegistrationReady": true,
  "deviceIdentityResetReady": true,
  "consentPromptReady": false,
  "permissions": {
    "screenCapture": "granted",
    "inputControl": "denied"
  },
  "reason": "ENGINE_NOT_READY"
}
```

该示例权限来自本次独立探针进程，不是对所有 ToDesk 安装的固定结果。Tauri 命令每次调用在自身进程重新探测；macOS 权限受运行进程、安装位置和签名影响。平台/架构采用 Rust 运行目标值（`macos`、`windows`；`aarch64`、`x86_64` 等），OS 版本来自 macOS `sw_vers` 或 Windows `RtlGetVersion`。不支持/无法确定版本的平台返回 `PLATFORM_UNSUPPORTED`。Windows 输入受桌面和 UIPI 影响，目前相关权限保守返回 `unknown`。

`invoke('remote_control_stop')` 不接收参数，成功返回空值。用于退出登录/账号切换前本地停止；命令不依赖网络，也不允许调用者提供新会话或授权资料。前端应等待该调用完成。

新增登记/重建就绪字段表示当前平台存在 OS 凭据实现，不保证当前钥匙串访问一定成功，也不开放远控引擎。示例中的确认字段为 false，因为编译信任文件默认是空数组；命令及配置详见[原生身份说明](./2026-09-26-remote-control-native-identity.md)。

## 3. 可重复验证

在项目根目录执行：

```sh
cargo check --locked --manifest-path client-vue/src-tauri/Cargo.toml
cargo test --locked --manifest-path client-vue/src-tauri/Cargo.toml
bash scripts/remote-control-native-probe.sh
```

原生探针使用同一份 `platform.rs`，不需要 Cargo 下载依赖。脚本随后运行纯 Rust 门禁测试；macOS 下编译 Swift SDK 验证。默认只探测权限并构造一个**不发布**的键盘事件。

已有屏幕权限的开发环境可显式运行：

```sh
bash scripts/remote-control-native-probe.sh --capture-one-frame
```

该选项只在权限预检已通过后启动 ScreenCaptureKit，采集一帧 320×180 图像到内存后停止；输出尺寸和成功/失败状态，不保存或传输屏幕内容。权限未通过时直接报告阻塞，不弹出权限申请，不改变系统设置。没有任何选项会真正发布系统键鼠事件。

将参数替换为 `--encode-one-frame` 可继续把同一真实屏幕帧送入 VideoToolbox H.264 硬件编码；输出 profile-level-id、SPS/PPS 数量和编码字节数，不输出图像/编码内容。

原生 WebRTC ↔ 浏览器互通 PoC 当前仅支持 macOS，在隔离临时目录安装官方 GStreamer Python SDK（本次使用约 991 MiB，不添加到生产依赖）：

```sh
python3 -m venv /tmp/todesk-gstreamer-m0-1.28.7
/tmp/todesk-gstreamer-m0-1.28.7/bin/python -m pip install --only-binary=:all: gstreamer-bundle==1.28.7
REMOTE_CONTROL_PROBE_PYTHON=/tmp/todesk-gstreamer-m0-1.28.7/bin/python node scripts/remote-control-webrtc-probe.mjs
```

该脚本默认采用 `videotestsrc` **合成球形图像**，不是桌面采集。只有显式 `--source=screen` 才启动下一节的真实屏幕源。主控浏览器生成 offer，原生 `webrtcbin` 回 answer；信令走继承的 stdin/stdout，不开放 HTTP/WebSocket 服务。原生 libnice 只绑定 127.0.0.1，不配置 STUN/TURN。数据通道仅回传一个固定探针字符串，不解析控制指令。测试通过后关闭 PeerConnection、浏览器和原生媒体管线；屏幕内容、完整 SDP、ICE 不写入文件。

SDK 全插件扫描在本机首次加载较慢，脚本改为显式加载 coreelements/app/videotestsrc/videoconvertscale/vpx/videoparsersbad/rtp/rtpmanager/nice/dtls/srtp/sctp/webrtc 共 13 个必需插件。开发用完整 bundle 包括额外 GPL/restricted 包；它们不在本次加载列表，生产打包仍必须逐库核实许可证与分发要求，不能直接复制完整开发 SDK。

真实桌面 H.264 与停止验证命令：

```sh
REMOTE_CONTROL_PROBE_PYTHON=/tmp/todesk-gstreamer-m0-1.28.7/bin/python node scripts/remote-control-webrtc-probe.mjs --source=screen
REMOTE_CONTROL_PROBE_PYTHON=/tmp/todesk-gstreamer-m0-1.28.7/bin/python node scripts/remote-control-webrtc-probe.mjs --source=screen --stop-mode=pipe-close
python3 scripts/remote-control-screen-lifecycle.py
```

脚本自动在临时目录编译 `remote-control-screen-source.swift`，结束后删除探针可执行文件。它采用 SCK 实际屏幕，1280×720、15fps 上限、约 1Mbps 的 VT 硬件 H.264 目标码率；不启用音频、不发布任何 OS 输入。采屏权限预检不通过直接失败，不申请权限。原生只通过继承管道输出帧：4 字节大端 AU 长度、8 字节大端 PTS 纳秒、Annex-B H.264；单帧最多 4MiB。GStreamer `appsrc` 收到完整帧后接 `h264parse/rtph264pay/webrtcbin`，不经过 Tauri/浏览器 IPC。

VT 禁用帧重排并每秒强制 IDR；静态画面可以重复最近一份真实采屏像素，编码计数和 SCK 完整采屏计数分别报告，不把重复编码计为新采屏。早期探针的监督心跳和采集活性均为 3 秒；后续版本保持监督心跳 3 秒，把源进程采集兜底改为 12 秒，由 Rust 独立执行四阶段活性的 3 秒暂停/10 秒结束，详见[监督说明](./2026-09-26-remote-control-native-supervisor.md)。媒体管道背压超过 500ms 结束。stdin EOF、stdout 关闭、SIGTERM 均走原生停止；开发探针另设 45 秒硬上限。该早期媒体协议没有生产启动 nonce/签名验收，不可直接充当发布引擎。

首次联调定位并修复了动态 RTP payload 错配：Chromium 本次 H.264 offer 的 payload 是 103，合成 VP8 是 96；将 `rtph264pay` 固定为 96 会造成 DTLS/DataChannel 正常但视频零解码。现在按 offer 中 `H264 + profile-level-id=42001f + packetization-mode=1` 精确选择 payload，参数顺序不影响匹配，不支持时明确拒绝。

## 4. 本次实测证据

| 项目 | 环境与结果 |
| --- | --- |
| 执行机器 | macOS 26.3.1 (25D2128)，Apple Silicon `aarch64` |
| 工具链 | Rust/Cargo 1.97.1；Apple clang 17.0.0；CommandLineTools macOS SDK 26.2 |
| Tauri | 锁文件 Tauri 2.11.6 / tauri-build 2.6.3；新增命令后的 `cargo check` 通过 |
| Rust 单元测试 | 媒体/租约续行时 21 项通过；本次身份续行后 `cargo test --locked` 默认 33 项通过、1 项忽略，覆盖跨语言登记/同意、停止/超时、重放和重建部分失败。默认测试不访问真实钥匙串 |
| 原生凭据存储 | 单独执行临时 Keychain 测试通过（约 0.09s），禁止系统弹框，完成写/读/删并确认不存在；未创建生产设备密钥。系统确认窗口尚未人工交互，Windows 未实测 |
| macOS 预检 | 独立 Rust 探针 `screenCapture=granted`，`inputControl=denied`；未弹窗/改权限 |
| ScreenCaptureKit | 成功收到完整 320×180 真实屏幕帧并执行 `stopCapture`；不保存帧 |
| VideoToolbox | 真实采屏帧 H.264 硬编码通过；`hardware=true`、profile-level-id `420014`、2 组参数集、AVCC NAL 长度字段 4 字节；约 6.5 KiB/帧（随实际画面变化） |
| GStreamer | 系统最初未安装；继续在 `/tmp/todesk-gstreamer-m0-1.28.7` 安装官方 1.28.7 wheels，最小插件集合加载成功 |
| 原生 WebRTC/Chromium | GStreamer 1.28.7 → Chromium 149.0.7827.55；合成视频 VP8 320×180，连接 `connected`，实测至少 5 帧呈现、10 帧解码，DataChannel 固定消息回传成功 |
| 连续真实桌面/H.264 | SCK → VT 硬编码 → 继承管道 → GStreamer → 同机 Chromium；1280×720，`42001f` / packetization-mode=1，31 帧呈现、40 帧解码、DataChannel 回传成功；原生 41 个采集帧、40 个编码帧、176,051 字节、约 3.09 秒运行 |
| 首帧与解码 | 真实 H.264 多次运行首帧 554–1,097ms；本次 40 帧累计浏览器解码耗时 36.7ms。首帧从创建浏览器 PeerConnection 计时，不包含编译/SDK 启动，也不是远程操作端到端延迟；短时本机数据不代表公网或持续性能 |
| 全链路停止 | 正常停止 47ms；主控信令 stdin 关闭测试 50ms；原生报告 `captureStopped=true`、exit 0，排空解码后连续观察 500ms 呈现帧数不再增加，采屏子进程不存在 |
| libwebrtc | 当前 Cargo/原生项目未集成；本机常用库目录未发现可链接库；未执行源码构建，未固定可发布版本 |
| Windows | 本次无 Windows 执行环境，未宣称通过采屏/SendInput/安装验证 |

门禁验证包括：默认和停止后拒绝输入、仅观看拒绝输入、序号缺失与重放关闭门禁、错误 session/协议/代次/布局关闭门禁、输入票据在 500ms 到期、任一路心跳在 3 秒到期、P2P 心跳仍正常时租约在 15 秒终止、权限丢失停止媒体、幂等释放本会话账本、代次溢出终止。租约截止以 challenge 发出时计时，延迟回复不能重新获得完整 15 秒。

上述 Rust 测试验证状态机和签名协议，不等于 OS 实际释放按键或网络黑洞下实时调度的验收；真实媒体进程的故障清理另外记录在下节。签名的字节格式、密钥配置与接入顺序见 [协议补充](./2026-09-26-remote-control-wire-protocol.md)。

### 4.1 真实采屏进程停止矩阵

`remote-control-screen-lifecycle.py` 每项均先收到至少 8 个真实屏幕 H.264 帧，再触发故障；测试只消费并丢弃帧，不落盘。此处验证真实媒体进程退出，与前述纯 Rust 状态机测试分别记录。

| 故障/动作 | 实测停止耗时 | 结果 |
| --- | --- | --- |
| 受控 `stop` | 37ms | `LOCAL_STOP`，`stopCapture` 成功，exit 0 |
| 监督 stdin 关闭 | 47ms | `SUPERVISOR_PIPE_CLOSED`，`stopCapture` 成功，exit 0 |
| 媒体 stdout 消费端关闭 | 77ms | `OUTPUT_PIPE_CLOSED`，`stopCapture` 成功，exit 0 |
| 保留管道、停止发送心跳 | 2,855ms | `SUPERVISOR_TIMEOUT`，符合从上次心跳起 3 秒上限；exit 0 |
| 发送 SIGTERM | 42ms | `TERMINATED`，`stopCapture` 成功，exit 0 |
| 强杀正在接收真实帧的父监督进程 | 27ms | 父进程 -9；采屏子进程检测管道关闭、执行 `stopCapture` 并退出，随后确认 PID 不存在 |

这里的父进程强杀用独立测试监督器，以便外部观察者继续读取子进程的停止报告；不等同于已经测试完整 Tauri 的崩溃与所有进程组合。未执行实际按键注入，所以也不声称验证了 OS 卡键补偿。所有探针浏览器、媒体与采屏子进程均已清理。

## 5. 引擎选型与剩余发布门槛

尚未完成生产引擎选型。libwebrtc 仍未集成；GStreamer 1.28.7 已作为可运行候选完成合成 VP8 和真实桌面 H.264 的 Chromium 通路及 DataChannel 实验。这支持继续集成，但不足以发布远控。WKWebView/Edge、强制 TURN、持续性能、初始化期间故障、锁屏/权限撤销与输入闭环仍未测试；当前辅助功能权限为 `denied`，实际 OS 注入没有执行。剩余问题是生产引擎、授权链路、安全监督与平台发布验收。

| 必须继续验证 | 通过条件 |
| --- | --- |
| 固定原生依赖 | 固定源代码 revision/版本、可重复构建、逐项许可证与 codec 分发清单；明确更新责任 |
| 视频通路 | ScreenCaptureKit/Windows 采屏直接接编码器与原生 WebRTC；确认 H.264 profile/packetization 或 VP8 的实际互通 |
| 编码与性能 | 硬编码与软编码回退、1080p/30fps 上限、CPU/内存/功耗、包体；断流时及时停输入 |
| 受限输入 | 正常交互桌面的实际注入、缩放/负原点/键盘布局/中文；有授权的本地同意不能由远端伪造触发 |
| 原生授权 | 已实现的系统确认、OS 密钥和服务器验签需通过真实系统/签名包测试，并与媒体引擎的 challenge 消费、实际 DTLS 指纹与停止路径连通 |
| 监督与停止 | 固定签名 sidecar、继承管道、随机 nonce；运行独立看门狗，接通释放账本与真正停媒体；分别强杀宿主/引擎 |
| 实机与网络 | Windows 11 x64、macOS 13+ Intel/ARM 分别验证；断网、锁屏、权限撤销、强制 TURN relay |
| 正式安装 | Developer ID 签名/公证、Windows 签名安装、升级权限归属；现有 ad-hoc 签名不能计入通过 |

在以上条件通过前，保持原生 `engineReady=false`，服务器发布开关关闭。更改该常量需要同时交付真正引擎握手和实机验收记录，不能以环境变量或前端标志覆盖。

参考：[Tauri 命令权限与 AppManifest](https://v2.tauri.app/security/capabilities/)、[Apple 屏幕权限预检](https://developer.apple.com/documentation/coregraphics/cgpreflightscreencaptureaccess())、[GStreamer webrtcbin](https://gstreamer.freedesktop.org/documentation/webrtc/)、[GStreamer 官方二进制/Python SDK](https://gstreamer.freedesktop.org/download/)、[GStreamer 1.28.7 bundle](https://pypi.org/project/gstreamer-bundle/1.28.7/)。API 无弹窗语义也对照了本机 SDK `CGWindow.h`、`AXUIElement.h` 声明。
