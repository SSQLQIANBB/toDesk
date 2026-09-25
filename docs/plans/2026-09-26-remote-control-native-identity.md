# 原生设备身份与确认接入

对应[设计 v2](./2026-09-25-remote-control-design.md)与[签名协议](./2026-09-26-remote-control-wire-protocol.md)。设备身份管理与远控发布独立：登记成功不代表设备在线，也不会开始采屏或执行系统输入。完整完成范围见[实施进度](./2026-09-25-remote-control-implementation.md)。

## 1. 设备登记

个人中心的“远程设备”设置用于查看与撤销本人设备。支持原生凭据存储的桌面客户端还可显式登记当前设备；Web 不显示原生登记操作。发起远控的主控端无需先登记本机。

流程为认证 REST 挑战 → `remote_control_register_device({ challenge, alias })` → REST 提交证明。原生自行构造 canonical JSON、当前平台和公钥，签名用途固定为 `register-device`；不接受任意消息签名。后端验证挑战所属账号/sid、期限、一次性消费和 Ed25519 签名后保存公钥。

私钥种子仅保存在系统凭据存储及原生进程内存：macOS 使用 Keychain，Windows 实现使用 Credential Manager。没有明文文件回退，不返回私钥给 Vue；无法读取原凭据时不自动生成替代密钥。内存种子使用清零容器。系统凭据存储保护不等同于硬件内不可导出的密钥。

身份按本地账号 ID 区分，当前假定一个安装对应固定的服务端部署。开发与生产或多个独立后端若复用同一应用标识、凭据命名空间和账号编号，需要先设计部署隔离，不能把切换 API 地址当作身份迁移。

## 2. 撤销与重建

撤销保留服务端的旧公钥与撤销记录，旧公钥不能再次登记。界面遇到 `DEVICE_KEY_UNAVAILABLE` 时提供显式重建流程：`remote_control_reset_identity({ userId })` 必须通过独立系统窗口确认，取消返回 `reset: false`。重建不恢复旧许可、不撤销审计数据，也不自动登记新身份；用户需再次登记。

提交 REST 后取消操作不能保证服务端回滚，界面要求刷新列表确认结果。注销、账号切换和页面取消会阻止旧挑战或旧签名继续提交，也会丢弃迟到响应。

## 3. 原生同意

`remote_control_confirm_request({ request })` 仅接受服务端签名信封。以下内容均不能由网页提供：可信公钥集、确认决定、窗口文本、任意签名内容或 LocalConsent。

原生先验证用途、期限、双方身份、设备指纹、主显示器范围和代次，再显示原生系统确认窗口。关闭、Escape 和取消均不授权；选择控制需要明确选择权限。签名返回值包含准确的 `approvalId` 和原生随机 `consentNonce`。确认结果只建立原生内存中的本地同意记录，不自动开媒体或输入。

确认期限同时使用单调时钟。`remote_control_stop` 使等待中的操作代次失效并清除本地同意；即使旧系统窗口稍后收到批准，也不能产生有效返回结果。系统对话框的关闭能力取决于平台 API，不能把“停止使结果无效”描述成“立即关闭了所有窗口”。

重新请求控制需要存活的观看会话、新请求编号及更高代次。拒绝重新控制保留观看；恢复控制仍须新的签名租约及主控显式继续操作。正式媒体引擎还需要把已验证租约、暂停和结束同步到原生状态。

## 4. 可信公钥与发布

原生通过编译时包含的 `client-vue/src-tauri/remote-control-trusted-keys.json` 固定信任根。默认文件是空数组，确认功能保持不可用；没有随机密钥、账号 JWT 派生或网页传入 key ring 的回退。部署配置应与后端独立 Ed25519 签名器一致，最多两个公钥用于有界轮换：

```ts
type PinnedKey = {
  keyId: string;
  publicKey: string; // 32 字节 Ed25519 公钥的规范 base64url
  notBefore: number; // Unix 毫秒
  notAfter: number;
};
```

这里只包含公钥，不得放入服务端私钥或设备私钥。更新信任根需要重新构建并交付可信安装包；测试向量中的公开种子和测试公钥不能用于部署。

新增原生命令只允许主窗口使用，Tauri AppManifest 与 capability 明确列出，原生还检查窗口标签。`engineReady`、`canCapture`、`canInjectInput` 以及服务端远控发布开关继续关闭。

macOS 凭据依赖采用锁文件中的 `security-framework 3.7.0`，需要 Rust 1.85 或以上，项目声明已相应更新。本轮实际编译工具链为 Rust 1.97.1；没有声称完整依赖图已在最低版本验证。

## 5. 验证边界

Node/Rust 共享登记、确认请求和设备签名向量；默认测试使用内存凭据存储，不创建真实设备密钥，也不自动点击系统授权窗口。真实平台存储、真实系统交互、完整签名安装包和 Windows 运行验证应分别记录，不能用 mock 或编译通过替代。

身份实现阶段 Rust 默认测试 33 项通过，1 项 OS 测试默认忽略；后者已单独执行通过。后续原生监督阶段的新增测试见[实施进度](./2026-09-25-remote-control-implementation.md)。OS 存储复测命令为：

```sh
cargo test --locked --manifest-path client-vue/src-tauri/Cargo.toml temporary_keychain_roundtrip -- --ignored --test-threads=1
```

该测试使用随机 `top.sycsq.todesk.test-only.*` service，禁止 Keychain 弹框，写入、读回、删除并确认条目不存在；成功或失败均有清理路径，没有创建生产设备凭据。实际系统确认窗口尚未人工点击，Windows 实现尚未在 Windows 编译或运行，LocalConsent 尚未接生产媒体或 OS 输入。

参考：[Tauri 原生 Dialog](https://v2.tauri.app/plugin/dialog/)、[security-framework 凭据 API](https://docs.rs/security-framework/latest/security_framework/passwords/index.html)。
