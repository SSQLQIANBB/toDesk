# 远控签名凭据与主控接入合同

此文件补充设计 v2 第 6.3/6.4 节，对应签名器、Rust/浏览器校验器、原生确认与主控适配器。设备密钥和原生确认接入见[身份说明](./2026-09-26-remote-control-native-identity.md)。生产 namespace 仍关闭；本合同不能视为正式 sidecar、OS 输入执行或完整远控联调已经完成。

## 1. 签名与密钥

签名信封固定为以下四个字段，拒绝未知字段，不允许调用者指定算法、公钥或密钥 URL：

```ts
type SignedEnvelope = {
  format: 'rc-signed-v1';
  keyId: string;
  payload: string;   // 无 padding 的规范 base64url，解码后为 UTF-8 JSON
  signature: string; // Ed25519 的 64 字节签名，规范 base64url
};
```

签名原文是 `UTF8("todesk-remote-control/v1\n" + keyId + "\n" + payload)`。校验原始 payload 字节后再严格解析 JSON，不重新序列化对象再验签。payload 编码长度最多 16 KiB；标识字符串最多 128 个 ASCII 字符；序号/时间戳必须为 JavaScript 安全整数。nonce/challenge 为原生 CSPRNG 生成的 32 字节规范 base64url；DTLS 指纹固定为 SHA-256 的 64 位大写十六进制，不含冒号。

服务端密钥独立于账号 JWT，必须显式配置以下环境变量，时间单位为 Unix 毫秒：

- `REMOTE_CONTROL_SIGNING_KEY_ID`
- `REMOTE_CONTROL_SIGNING_PRIVATE_KEY`：Ed25519 PKCS#8 PEM
- `REMOTE_CONTROL_SIGNING_KEY_NOT_BEFORE`
- `REMOTE_CONTROL_SIGNING_KEY_NOT_AFTER`

缺省不生成密钥，也不从 JWT secret 派生。配置不完整、算法错误或有效期错误时拒绝提供可用凭据。已登录浏览器从固定的 `GET /api/remote-control/signing-keys` 获取 `{ keys: [{ keyId, publicKey, notBefore, notAfter }] }`；`publicKey` 是 32 字节 Ed25519 公钥的 base64url，接口不返回私钥，设置 `Cache-Control: no-store`。原生端使用签名应用/部署配置内固定的公钥，不能把网页传入的 key ring 当可信来源。校验器最多允许两个公钥用于有界轮换，当前签发配置只使用一个活动 key；旧 key 的分发重叠仍需部署实现。

测试向量见 `fixtures/remote-control-credentials-v1.json`，使用公开的 RFC 8032 测试种子，仅用于 Node/Rust/浏览器互通测试，绝不能用于部署。

## 2. 原生确认请求与本地同意证明

服务端先签发独立用途的原生确认请求，不能把建连凭据当作用户同意：

```ts
type RemoteApprovalClaims = {
  protocolVersion: 1; issuer: 'todesk-remote-control';
  audience: 'todesk-native-approval'; purpose: 'approval-request';
  approvalId: string; action: 'accept' | 'grant-control';
  sessionId: string; host: Endpoint; controller: Endpoint;
  requestedScope: 'view' | 'control';
  authorizationRevision: number; controlEpoch: number;
  hostKeyVersion: number; hostKeyFingerprint: string;
  screenId: 'primary'; issuedAt: number; expiresAt: number; sessionExpiresAt: number;
};
```

`approvalId` 是每次确认的 UUID；权限与控制代次为当前会话值加一。`hostKeyFingerprint` 是注册设备 SPKI DER 的 SHA-256 小写十六进制。请求最多有效 45 秒，且受当前会话 deadline 和签名 key 截止约束；`sessionExpiresAt` 为原会话绝对截止，最多一小时。原生从固定可信公钥验签，并核对系统凭据存储内的本机密钥；网页不能提供信任根、确认结果或任意待签文字。

第一版原生确认限定主显示器，窗口只展示签名内的请求方账号/端点/会话身份与权限。确认前尚未进行 SDP 协商，因此本请求不包含 DTLS 指纹；后续建连凭据必须把本地同意与真实传输绑定。`approvalId`、截止和原生操作代次共同阻止重复确认与停止后迟到确认；本地超时使用单调时钟。重新控制被拒绝时保留观看状态，不能把拒绝解释为控制同意。

设备以 `keyId = device:<deviceId>:<keyVersion>` 签名，body 为：

```ts
type Endpoint = {
  userId: number; sid: string; authVersion: string;
  endpointId: string; connectionId: string; generation: number;
};
type HostConsentClaims = {
  protocolVersion: 1; purpose: 'host-consent';
  approvalId: string;
  action: 'accept' | 'grant-control';
  sessionId: string; host: Endpoint; controller: Endpoint;
  requestedScope: 'view' | 'control'; decision: 'view' | 'control' | 'reject';
  consentNonce: string; screenId: string;
  authorizationRevision: number; controlEpoch: number;
  issuedAt: number; expiresAt: number;
};
```

`approvalId` 必须匹配服务端当前未消费的确认请求，端点、权限、屏幕、代次和有效期也必须与该请求一致。`authorizationRevision/controlEpoch` 必须等于待变更会话中的对应值加一。初次接受限 pending；恢复控制限 active(view)，必须重新生成 nonce 并由原生重新确认。设备已撤销、账号/登录会话/连接代次不符、超时或观看请求升级为控制均拒绝。该证明最多有效 45 秒，并受当前会话 deadline 限制。

验签只证明设备私钥持有者签名；私钥必须保存在系统受保护凭据存储，且同意签名只能由独立本地授权流程触发，不能开放任意消息签名 invoke。原生实现与实际验证范围以实施进度为准，生产媒体链路尚未接通。服务端验证返回冻结对象，签发器只接受校验器实际产生的对象，普通 `{ accepted: true }` 或复制对象不能作为授权。

暂停后原同意只能继续观看，不能签发新控制代次；恢复控制需要新的同意证明。运行时还必须在每次变更/签发前复查双方持久认证、设备撤销、当前连接与发布状态，签名器本身不代替这些数据库/Redis 校验。

## 3. 建连凭据与媒体租约

共享 body：

```ts
type CredentialClaims = {
  protocolVersion: 1;
  issuer: 'todesk-remote-control'; audience: 'todesk-remote-peer';
  purpose: 'connection' | 'lease';
  sessionId: string; host: Endpoint; controller: Endpoint;
  negotiationId: string; hostFingerprint: string; controllerFingerprint: string;
  consentNonce: string; screenId: string; scope: 'view' | 'control';
  authorizationRevision: number; controlEpoch: number;
  issuedAt: number; expiresAt: number;
  leaseSeq?: number; challenge?: string;
};
```

connection 仅在 connecting 状态签发，最多 30 秒，不能携带 leaseSeq/challenge，也不授权画面或输入。它绑定已验签的本地同意及双方 SDP/实际 DTLS 指纹，只允许完成无画面的协议握手。native 校验时还要匹配内存中的 LocalConsent 和实际 PeerConnection 的 ObservedTransport，不能用网页自报指纹替代。

lease 仅在 active 状态签发，必须携带正整数 leaseSeq 与 challenge，最多 15 秒，且受会话绝对期限与签名 key 有效期限制。原生每次用随机 challenge 与递增序号申请，只保留当前申请；响应只能消费一次。原生截止点取 `challenge 发送的单调时钟 + 签名 TTL`，并裁剪到本地同意截止点；晚到响应、重放或系统时钟回退不能延长有效期。浏览器同样校验签名绝对截止并使用本地单调定时器，收到租约不自动恢复暂停的输入。

低于已见授权/控制代次的租约拒绝；签名降级到 view 可以保留画面，恢复 control 必须与当前本地同意的准确代次相等。Rust 的 `replace_local_consent` 仅允许同一存活、只观看会话更新更高代次与新 nonce，不更换端点/屏幕/DTLS，不延长本地绝对期限，也不打开输入。任一已验证租约到期后整个 authority 终止，不能用新 challenge 恢复同场会话；续租回复必须在前一租约到期前抵达。

校验得到 VerifiedLease 不代表输入 armed，OS 输入仍须独立满足输入票据、焦点、布局、系统权限和看门狗条件。Rust 校验器失败后不可继续使用此前 authority；实际引擎集成时调用方必须同步关输入并停媒体。

## 4. 主控适配器事件

namespace `/remote-control`，Socket.IO path `/meeting`；关闭自动重连。终态、断线或代次变化销毁连接，不能恢复旧授权。

| 事件 | 合同 |
| --- | --- |
| `remote:connecting` | 本地接受验签并提交 connecting 后通知主控：`sessionId, revision, authorizationRevision, controlEpoch, scope, host, controller, consentNonce, screenId, negotiationId, hardDeadline`。此时主控再取现有会话级 ICE 接口。 |
| `remote:signal` | 已授权连接内的 offer/answer/candidate；绑定 session/generation/negotiationId；SDP 最多 64 KiB、candidate 最多 4 KiB、每代最多 128 个。主控只发送 offer，被控只发送 answer。 |
| `remote:connection-proof` | 包装为 `{ sessionId, proof: SignedEnvelope }`，从已验证的 SDP 取得双方指纹后发送 connection 信封。客户端校验凭据，并对实际 DTLS 对端证书的 DER 字节计算 SHA-256 后比较指纹，之后才执行状态通道 hello。缺少实际证书读取能力时停止连接。 |
| `remote:ready` | 已验凭据、hello 和协议后的确认；可以报告实际指纹与 negotiationId。普通 state/ACK、channel open 或收到视频轨道都不能自动代替 ready 的条件。 |
| `remote:lease` | 包装为 `{ sessionId, proof: SignedEnvelope }`，双方 ready 进入 active 后签发媒体/控制租约；宿主 challenge 与续租序号必须来自原生，主控不得伪造宿主续租。 |
| `remote:control-approved` | 重新本地确认后通知主控新 nonce/授权代次：`sessionId, host, controller, consentNonce, screenId, negotiationId, authorizationRevision, controlEpoch`。端点、屏幕和协商不能变化；该消息只更新待验预期，仍须核对新的 control 租约后由主控显式继续操作。 |
| `remote:state` / `remote:ended` | 更新状态与结束；只能降低本地能力，不能单独授予画面/控制。 |

状态通道使用可靠有序 `rc-state-v1`，输入通道使用可靠有序 `rc-input-v1`。状态消息共同头为 `version, sessionId, negotiationId, connectionGeneration, type, payload`。hello 绑定同一 connection proof，心跳、屏幕布局、input-arm/input-armed、input-window/input-ack、pause/end 已接主控 peer 与 Rust HostRuntime。开发 sidecar 只透传有界原始通道字节，Rust 负责解析、授权及输入执行；CLI 测试使用记录型执行器。

心跳 `renderedFrames` 只在真实呈现/解码计数增加时推进呈现活性，重复值不刷新计时，倒退拒绝。主控在同一状态通道上先报告当前帧数，再发送 input-arm；原生要求 capture/encoded/forwarded/rendered 四阶段均健康才能启用输入。发送端前三阶段通过认证 IPC 的 `media-progress` 报告原始单调时钟进度，任一阶段 3 秒停滞暂停、10 秒结束；租约续签和数据心跳不延长进度截止。恢复画面不自动恢复控制。字段与校验合同见[独立画面活性](./2026-09-26-remote-control-native-supervisor.md#31-独立画面活性)。

## 5. 当前验证边界

签名测试使用真实 Ed25519 实现，覆盖篡改、错误 kid/用途、端点与指纹不符、代次降级、迟到与重复租约、暂停后的旧同意重用。Node、Rust 和浏览器使用相同签名向量；浏览器通过 WebCrypto 验证，算法不支持则停止。真实 Chromium 测试使用合成视频及临时签名密钥验证主控行为，包括实际 DTLS 证书绑定、新 nonce 重新授权和画面冻结超时；它不替代被控端授权链路验收。

`fixtures/remote-control-native-approval-v1.json` 提供原生登记、服务端确认请求和设备同意证明的跨语言向量，使用公开 RFC 8032 测试种子，包含中文设备别名及精确 canonical JSON。测试种子绝不能用于真实设备或部署。

早期 macOS 屏幕实验与进程清理证据见 [M0 记录](./2026-09-25-remote-control-m0-validation.md)，后续带签名授权、真实 DTLS 与 Rust 监督的开发闭环见[原生监督说明](./2026-09-26-remote-control-native-supervisor.md)及[实施进度](./2026-09-25-remote-control-implementation.md)。设备身份与系统确认的实际测试边界见[身份说明](./2026-09-26-remote-control-native-identity.md)；正式签名 sidecar、实际 OS 输入验收与跨平台/TURN 仍需继续实施。

参考：[Ed25519-dalek 2.1.1](https://docs.rs/crate/ed25519-dalek/2.1.1)、[Tauri capabilities](https://v2.tauri.app/security/capabilities/)。本地安装的库源码用于核对 API 与编译兼容性。
