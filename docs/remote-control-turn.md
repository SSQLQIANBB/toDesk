# 远控复用 TURN：接口、接入与部署核对

本轮源码 `0.4.0-beta.1`，构建号 5。复用现有视频通话的 `turn.sycsq.top:3478`，视频通话配置未改动。远控新增会话短期凭据和原生签名配置，不把视频端固定密码作为生产远控的回退配置。

## 已实现

`GET /api/remote-control/sessions/:id/ice` 使用现有 Bearer 登录认证，并要求：

- Redis 中存在当前 `connecting/active` 会话且已接受，连接期限和会话期限未到；请求的 `userId/sid/authVersion` 与其中一端完全匹配。
- 数据库重新检查两端账户版本、登录、设备和临时许可撤销状态。检查后重新读取会话，端点换代、状态结束或修订变化均拒绝签发。
- 配置有效且 Ed25519 签名密钥窗口足够。返回 `Cache-Control: no-store`，不在日志记录密码、共享密钥、候选内容或签名载荷。

响应包含 `iceServers`、`iceTransportPolicy`、`expiresAt` 和 `proof`。后者采用现有 `rc-signed-v1` 签名格式，`audience=todesk-native-ice`、`purpose=ice-config`，绑定 sessionId、两端全部身份字段、issuedAt、sessionExpiresAt 和同一份 ICE 配置。该证明不能作为 connection 或 lease 凭据使用。

TURN 用户名为 `到期秒数:rc:不透明端点标识`；密码为共享密钥对完整用户名的 HMAC-SHA1，再 Base64 编码。到期固定为 `floor((hardDeadline + 5分钟)/1000)`，重试不延长，用户名不包含账户或登录 ID。会话结束时本地立即停止媒体、释放连接；TURN 端已有 allocation 的释放时间另受其协议和配置控制，凭据到期不等于立即撤销已建中继。[coturn 官方认证说明](https://github.com/coturn/coturn/blob/master/README.turnserver)

浏览器在创建 PeerConnection 前验证地址格式、凭据字段和覆盖整场会话的有效期。支持 `all`（直连优先、TURN 后备）与 `relay`（强制中继），跳过原生不解析的 `.local` mDNS host 候选，保留数字 host/srflx/relay。

原生 `PreparedHost::configure_ice` / `HostTransport::configure_ice` 先使用内置公钥验签，再比对本机同意的会话及端点和单调截止时间；仅允许在首次 offer 前配置一次。配置经认证的继承管道传给 GStreamer；不经进程参数、环境变量或日志。引擎应用 STUN、多个 TURN URL 和策略后回报无凭据的 `network-configured`，原生收到该事件后才接受 answer。未提供配置仍是原有回环测试模式；错误配置不会自动退回回环或固定密码。

GStreamer URI 转换会分别转义用户名中的 `:` 及密码中的 `+ / =`。`turns:` 只接受 TCP；是否能连通还取决于服务端 TLS 监听与证书。[GStreamer 官方 TURN 配置说明](https://gstreamer.freedesktop.org/documentation/webrtc/index.html#webrtcbin:turn-server)

## 核对现有服务，无需在聊天中发送密钥

1. 在部署机器上确定实际运行的 TURN 软件、版本、加载的配置文件，以及容器/服务管理器是否覆盖配置。仅查看文件名、参数名和是否设置；不要粘贴完整配置、启动环境、数据库密码或启动命令中的 secret。
2. 检查有效配置是否开启 `use-auth-secret`，以及是否配置 `static-auth-secret` 或数据库 `turn_secret`。若已开启，在服务器内部把同一份 secret 注入后端 `REMOTE_TURN_SHARED_SECRET`，本实现要求 32–1024 字符。若是 `lt-cred-mech` 加固定 `user`/用户表而没有 REST 认证，固定密码不能用来生成 REST 临时凭据。
3. 如当前仅支持固定账号，先在测试配置中核对该 coturn 版本与现有账号的兼容性，再制定认证迁移。不要直接覆盖或切换线上认证。可继续共用已有主机及网络资源，必要时先隔离监听/实例验证；本轮没有改动或重启线上 TURN。
4. 核对 3478 UDP/TCP、实际 relay 端口范围及服务器 NAT 映射；TURN TLS 只在监听、证书与域名均正确时加入 `turns:域名:端口?transport=tcp`。HTTPS 域名可访问不能替代 TURN 检查。核对双方系统时间，避免时间戳凭据被提前判过期。
5. 按下面表格配置后端；Ed25519 公钥同时须进入原生可信密钥发布配置。仅 `/signing-keys` 返回了公钥不会让原生自动信任它。
6. 用已接受且仍存活的测试会话获取 ICE 响应。分别只保留 UDP、TCP、TLS（若部署）的一条 TURN URL 做强制 relay 验证，再恢复 `all` 验证局域网/跨 NAT。旧登录、已撤销设备/许可、未接受和已结束会话应拒绝签发；最后重新测试视频通话。

| 后端变量 | 配置说明 |
| --- | --- |
| `REMOTE_TURN_SHARED_SECRET` | 必填才可签发，纯服务端；不是客户端 TURN 密码 |
| `REMOTE_TURN_URLS` | 逗号分隔 1–4 个地址，默认现有 3478 UDP/TCP；明确填写 transport |
| `REMOTE_STUN_URL` | 默认同域名 3478；空字符串禁用；relay 策略不下发 STUN |
| `REMOTE_ICE_TRANSPORT_POLICY` | `all` 或 `relay`，默认 `all` |
| `REMOTE_CONTROL_SIGNING_KEY_*` | 既有 Ed25519 部署密钥和 Unix 毫秒窗口，至少覆盖本次会话结束及 5 分钟余量 |

目前 URL 支持域名或 IPv4 字面量；不支持 IPv6 方括号形式的服务器 URL。ICE 候选支持数值 IPv4/IPv6。

缺失 TURN secret 返回 `503 REMOTE_ICE_UNCONFIGURED`，地址/策略配置不合法返回 `503 REMOTE_ICE_CONFIGURATION_INVALID`，缺少签名密钥返回 `503 REMOTE_SIGNING_UNAVAILABLE`，签名窗口不足返回 `503 REMOTE_ICE_SIGNING_WINDOW`。非参与方为 403，不存在为 404，不可签发状态为 409。密钥未确认时不会伪装成连接成功。

## 可复用的原生 relay 验证脚本

先构建仅开发使用的原生入口：

```sh
cargo build --manifest-path client-vue/src-tauri/Cargo.toml --features remote-control-harness --bin remote-control-host-harness
```

`scripts/remote-control-turn-probe.mjs` 从 stdin 接收一个 JSON，格式为 `{"iceServers":[{"urls":["一条TURN地址"],"username":"临时用户名","credential":"临时密码"}]}`。使用本机受限临时文件或内部管道传入；不要把 JSON 直接写进命令行或提交仓库。输入文件只包含短期客户端凭据，不需要共享密钥。

```sh
REMOTE_CONTROL_PROBE_PYTHON=/path/to/gstreamer-sdk/bin/python \
  node scripts/remote-control-turn-probe.mjs < /private/path/ice-probe.json
```

脚本使用公开测试签名密钥和本地测试同意，验证原生签名配置、真实 GStreamer / Chromium ICE、DTLS 和两条 DataChannel，读取选中的候选对而非仅以“收到了 relay 候选”判成功。不会发媒体租约，不启动屏幕源或 OS 输入。输出仅有类型、协议和退出结果，不输出地址、凭据、完整 SDP。凭据必须在脚本完成期间有效；分别以单个 UDP/TCP URL 运行。它不能证明生产账号授权、两台电脑互连或完整安装包已通过验收。

## 本轮验证与边界

| 验证 | 结果 |
| --- | --- |
| 后端 | 24 文件、158 测试通过，含真实 HTTP、HMAC/签名、登录隔离、授权撤销、检查期间换代、固定到期与配置错误 |
| 前端 | 57 文件、269 测试通过；前后端类型检查通过 |
| Rust | 121 测试通过，2 项环境测试忽略；含错误签名/会话/端点/用途/有效期、配置重放、引擎确认及候选过滤 |
| Python 引擎 | 31 项引擎测试通过，含 IPC 的 Python 总计 38 项通过；含时间戳和 Base64 转义、配置顺序、候选策略与不启动媒体 |
| 现有公网 TURN UDP | 真实 GStreamer ↔ Chromium，双方选中 relay，`relayProtocol=udp`，DTLS + 双通道成功，原生/引擎退出成功；无采屏、无 OS 输入 |
| 现有公网 TURN TCP | 同上，`relayProtocol=tcp`；无采屏、无 OS 输入 |
| 错误 TURN 密码 | 强制 relay 无法建立并超时，未启动采集、未回退直连，原生/引擎均退出 |
| WK 回环媒体回归 | 授权前零帧，真实屏幕 H264 1280×720 首帧约 867ms，停止约 111ms，停止后帧不再推进，采集/引擎退出 |

公网两次验证使用现有视频通话配置中的客户端凭据，只证明服务及远控网络栈可共用。**尚未确认线上 REST shared secret，因此未声称新签发的短期凭据已在现网通过。** TLS、两台不同网络电脑、断网/防火墙/短期凭据自然过期、媒体质量等仍待联调。前端生产构建、版本来源检查与 10 项版本/发布测试也已通过。

产品被控 Socket 适配器、真实账户/设备在线流程与原生启动尚未全部接通；远控发布门禁保持关闭。本轮不更新已安装应用或内置资源包，也不部署服务端。新增原生配置命令需重新打包引擎并绑定新 manifest 后才会进入安装包。
