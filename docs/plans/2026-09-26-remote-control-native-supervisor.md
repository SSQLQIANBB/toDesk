# 原生监督、媒体进程与输入执行边界

本轮继续实施[设计 v2](./2026-09-25-remote-control-design.md)。在现有身份、授权和主控协议上，增加原生会话运行时、继承管道认证协议、开发媒体进程以及 macOS 输入执行器。发布门禁仍关闭；本机开发验证不能替代签名安装包、人工系统确认、实际键鼠和跨网络验收。

## 1. 会话由原生持有

`HostRuntime` 从 `IdentityState` 领取已经过原生确认的 `LocalConsent`，将其与已验签的建连凭据和实际 DTLS 证书指纹绑定。只有握手完成并安装有效租约后，才允许媒体进程启动采屏。输入还需要控制范围、显式 arm、新输入代次和原生生成的短期票据。

独立原生监督线程每 100ms 检查会话期限、身份代次、租约、双方心跳、系统权限、媒体进程和四阶段画面活性。本地停止、身份重置、授权失效或进程错误会释放已持有的按键/鼠标并终止媒体；释放失败保留待释放记录，后续继续尝试。降级观看和暂停输入不凭旧租约恢复控制。新控制授权仍需原生确认、新授权代次和重新 arm。

这层不是 Tauri 通用命令：网页不能注入 `LocalConsent`、宣称原生 ready、传入任意程序路径或直接调用 OS 输入。

## 2. 继承管道认证协议

Rust 监督进程为每次启动生成独立 32 字节密钥和 32 字节 launchId。首个 stdin 行是一次性 bootstrap：

```json
{"protocolVersion":1,"sessionId":"会话 UUID","launchId":"base64url","key":"base64url"}
```

bootstrap 最多 2KiB，只通过继承管道传递；密钥不进入命令行、环境变量、文件或日志。后续每个方向使用独立连续序号，从 1 开始，每行最多 128KiB：

```text
body = UTF8(JSON({sessionId, launchId, seq, kind, payload}))
encoded = base64url(body)
mac = HMAC-SHA256(key, UTF8("todesk-host-ipc/v1\n" + direction + "\n" + encoded))
line = JSON({format:"rc-ipc-v1", payload:encoded, mac:base64url(mac)}) + LF
```

方向只能是 `supervisor-to-engine` 或 `engine-to-supervisor`。base64url 无填充且必须规范编码。MAC 错误、重放、跳号、跨会话/进程复制、反射、超限或非法结构都会使当前 codec 永久失效。HMAC 对编码后的原始 payload 签名，不依赖不同语言对 JSON 键顺序的处理。画面数据不经过这个控制管道。

命令为 `offer`、`ice`、`send-channel`、`start-media`、`renew-media`、`stop-media`、`heartbeat`、`stop`。事件为 `ready`、`answer`、`ice`、`dtls`、`channel-open`、`channel-data`、`media-started`、`media-progress`、`media-stopped`、`stopped`、`error`。`ready` 仅表示进程就绪，不表示授权通过。通道 `data` 是无填充 base64url 编码的 UTF-8 原始字节，通道名称严格限定为 `rc-state-v1`/`rc-input-v1`，均为可靠有序。

`start-media`/`renew-media` 包含 `mediaLeaseSeq`、`ttlMs`、十进制字符串 `monotonicDeadlineNs`。双方显式使用同机 `CLOCK_MONOTONIC`；监督进程先读内核时钟，再计算原生租约的剩余时间，避免排队延长权限。媒体进程取接收时间加 TTL 与绝对期限的较小值，TTL 不超过 15 秒，续租不能复活已到期的媒体会话。

进程读写、队列和清理有界；EOF、心跳丢失、输出背压或停止指令触发退出并回收采屏子进程。正式资源必须来自编译时固定路径与 SHA256 清单，当前清单为空。开发路径仅由 `remote-control-harness` feature 的独立 CLI 接受，不提供网页调用入口。

## 3. 媒体与输入执行

开发引擎使用 GStreamer 真实 PeerConnection，从 SCTP/RTP 的 DTLS transport 读取证书，将 PEM 转 DER 后计算 SHA256。它不把 SDP 中的指纹直接当作握手证据。ScreenCaptureKit → VideoToolbox H.264 的采屏进程在首个有效媒体租约到来后启动，之前 appsrc 不产生画面。

当前开发传输只接受 loopback host ICE，不使用 STUN/TURN。采屏保持既有实验限制：主屏、1280×720、最高 15fps、无音频、单次最多 45 秒；不能据此声称已满足一小时产品会话要求。Python SDK、插件和脚本也还不是可发布的签名 sidecar。

### 3.1 独立画面活性

原生同时检查四个阶段，任一阶段停滞 3 秒即暂停输入并释放按键，停滞满 10 秒结束整个会话。首次启动以媒体启动时间计时，四阶段都出现有效进度前不能 arm。心跳、续租、重复进度或其他阶段继续工作均不能重置停滞阶段的计时。

| 阶段 | 推进条件 |
| --- | --- |
| capture | SCK 的完整有效像素帧，或已有有效像素时的健康 idle 回调；空白、暂停、停止和非法状态不计入。重复编码缓存像素不推进此阶段。 |
| encoded | VideoToolbox 成功产出并完成 AU 格式校验，在写管道前记录；提交编码任务本身不算输出。管道阻塞由后续 forwarded 停滞及源进程背压检查覆盖。 |
| forwarded | GStreamer `push-buffer` 成功接收新 AU；它只证明本机转发，不能替代实际呈现。 |
| rendered | 主控真实呈现/解码计数 `renderedFrames` 增加；同值心跳不推进，倒退拒绝。 |

Swift 每 250ms 报告 capture/encoded 的原始事件时间；Python 独立记录 forwarded，并每 250ms 发送以下认证 `media-progress` payload。Rust 的管道读取线程校验并保存快照，监督线程直接读取，不依赖网页或 CLI 事件循环转发：

```json
{"captureSeq":1,"captureMonotonicNs":"1234567890","encodedSeq":1,"encodedMonotonicNs":"1234567900","forwardedSeq":1,"forwardedMonotonicNs":"1234567910"}
```

payload 恰好包含这六个字段。序号为不超过 `2^53-1` 的无符号整数；时间为规范十进制 u64 字符串，来自同机 `CLOCK_MONOTONIC`。初值必须为序号 0 / 时间 `"0"`；序号增加必须伴随时间增加，同序号只接受相同时间。未来时间、倒退、未知字段或任一无效阶段使整个更新失败。Rust 在采样内核时钟前取得 `Instant`，按原始事件年龄保守映射截止；排队或重传不能把事件变新。Swift 非阻塞诊断写入丢弃快照时也不刷新事件时间。

输入执行截止取四阶段最后进度加 3 秒的最小值，并与租约、输入票据和心跳截止共同限制每次 OS post；权限/布局检查后再次核对截止。画面恢复只恢复观看健康，不恢复旧控制代次。主控在发出 input-arm 前，先经同一有序状态通道发送当前真实帧数。暂停后迟到且结构/会话/控制代次/布局均合法的输入不执行、不 ACK，继续观看；输入代次不得超过成功 arm 的最高发放值，暂停/释放不抬高此上界。非法消息仍结束会话。

源进程另有 12 秒采集停滞兜底，给原生 3/10 秒策略留出执行时间；监督心跳仍是 3 秒。开发探针可分别冻结 capture、encoded、forwarded、rendered，并测试 capture 恢复。Swift 故障参数仅在 `REMOTE_CONTROL_TEST_FAULTS` 编译启用，普通构建拒绝参数；Python 故障参数必须由测试启动显式开启，IPC 不可启用故障或修改程序路径。发布清单不包含测试引擎。

### 3.2 输入执行边界

实际键鼠验收还需验证内容矩形、缩放/DPI、旋转与主屏坐标的一致性。

`input.rs` 对消息大小、结构、类型、坐标、键码、序号、票据、授权代次及布局做验证。执行前再次检查真实系统权限和布局，按键/鼠标 down 成功后才记入释放记录，未持有的 up 不注入系统。文字提交限制长度并按 commitId 防重放。macOS 适配器使用 CoreGraphics；Windows 当前返回不支持。

测试使用记录型输入执行器，**没有向当前桌面注入真实键鼠事件**。因此测试证明门禁与释放记录行为，不能替代 Accessibility 权限、人机交互、多布局和实际按键释放验证。

## 4. 可重复验证

```sh
python3 -m unittest discover -s scripts -p 'test_remote_control_*.py' -v
cargo test --locked --manifest-path client-vue/src-tauri/Cargo.toml
cargo build --locked --manifest-path client-vue/src-tauri/Cargo.toml --features remote-control-harness --bin remote-control-host-harness
REMOTE_CONTROL_PROBE_PYTHON=/tmp/todesk-gstreamer-m0-1.28.7/bin/python node scripts/remote-control-supervisor-probe.mjs --source=screen
REMOTE_CONTROL_PROBE_PYTHON=/tmp/todesk-gstreamer-m0-1.28.7/bin/python node scripts/remote-control-supervisor-probe.mjs --source=screen --stop-mode=lease-expiry
REMOTE_CONTROL_PROBE_PYTHON=/tmp/todesk-gstreamer-m0-1.28.7/bin/python node scripts/remote-control-supervisor-probe.mjs --source=screen --stop-mode=pause --scope=control
REMOTE_CONTROL_PROBE_PYTHON=/tmp/todesk-gstreamer-m0-1.28.7/bin/python node scripts/remote-control-supervisor-probe.mjs --source=screen --stop-mode=capture-freeze --scope=control
REMOTE_CONTROL_PROBE_PYTHON=/tmp/todesk-gstreamer-m0-1.28.7/bin/python node scripts/remote-control-supervisor-probe.mjs --source=screen --stop-mode=capture-recover --scope=control
```

SDK 路径按本机准备情况指定。真实采屏验证要求 macOS 屏幕录制权限，运行时不会保存画面文件。CLI 测试同意使用公开 RFC 测试密钥和 feature 隔离的记录执行器；该结果不等于用户已经在产品系统弹窗中同意了一次连接。

另外三个冻结模式为 `encode-freeze`、`forward-freeze`、`render-freeze`。冻结测试每 4 秒安装新的 15 秒签名租约，防止将租约到期误当画面检测成功。后三种模式仅在测试主控中停用其视频定时器，仍发送真实帧数心跳，用于独立证明 Rust 的 3/10 秒策略；capture 场景保持主控检测正常运行，并确认缓存视频继续播放。所有模式都使用记录型输入执行器。

实测结果与尚未完成的项目统一记录在[实施进度](./2026-09-25-remote-control-implementation.md)。
