# 桌面版本发布

开发分支为 `feature/desktop-tauri`。桌面端使用独立的 `desktop-v` 标签前缀，避免与网页版本混淆。下载地址：<https://github.com/SSQLQIANBB/toDesk/releases>。

## 一次发布的操作

1. 在准备发布的提交中，同步修改 `client-vue/src-tauri/tauri.conf.json` 的 `version` 与 `client-vue/src-tauri/Cargo.toml` 的 `[package].version`。例如首次发布 `0.1.0`，下一版 `0.1.1`。这两个值是桌面版本；根目录和前端 `package.json` 的版本不作为桌面发布版本。
2. 修改版本后运行 `cargo check --manifest-path client-vue/src-tauri/Cargo.toml`，同步提交 `Cargo.lock`，确认功能和测试通过。
3. 提交并推送代码，再推送对应版本标签。以当前 `0.1.0` 为例，在仓库根目录执行：

```sh
node scripts/desktop-release.mjs desktop-v0.1.0
git push origin feature/desktop-tauri
git tag -a desktop-v0.1.0 -m "发布桌面端 0.1.0"
git push origin desktop-v0.1.0
```

测试版可使用 `0.2.0-beta.1` 与 `desktop-v0.2.0-beta.1`，流程会自动标记为 GitHub Prerelease。已发布标签不可重复使用或移动；修复后请递增版本号。

标签必须指向包含 `.github/workflows/desktop-release.yml` 的提交；无需先合并 master。普通分支推送不创建 Release。工作流由 GitHub 自带的 `GITHUB_TOKEN` 发布，不需要额外的个人访问令牌。

## 自动流程

1. 校验标签、Tauri 配置与 Rust 包版本是否一致，不一致时在构建前失败。
2. 运行前端测试、类型检查（打包前执行）、Rust 编译并构建三个安装包。Windows 还运行现有的 WebView2 原生测试。
3. 三个平台全部成功后，检查安装包数量并生成 `SHA256SUMS.txt`。
4. 创建 Release 草稿，附加所有安装包及 SHA-256 校验文件；上传全部成功后发布，避免用户看到缺少平台附件的正式版本。

失败的构建不会发布 Release。若上传阶段中断，可在 Actions 中重跑失败任务，流程会补齐同一个草稿的附件；已公开发布的版本不会被覆盖。

| 系统 | 下载文件 | 安装方式 |
| --- | --- | --- |
| Windows x64 | `ToDesk_0.1.0_x64-setup.exe` | 运行安装程序 |
| Apple 芯片 Mac | `ToDesk_0.1.0_aarch64.dmg` | 打开后拖入 Applications |
| Intel Mac | `ToDesk_0.1.0_x64.dmg` | 打开后拖入 Applications |

文件名中的版本随配置变化。Mac 需要 macOS 12 或更新版本。

每次发布会自动在说明顶部生成 Windows、Mac（Apple 芯片）、Mac（Intel 芯片）三个中文下载入口，直接指向该版本的安装包。Mac 用户可在苹果菜单 →“关于本机”查看芯片类型。GitHub 自动附带的 `Source code (zip)` 和 `Source code (tar.gz)` 是源码，不是安装包；`SHA256SUMS.txt` 仅用于校验。

## 服务地址与签名

- 安装包默认连接 `https://www.sycsq.top`。可在仓库 Settings → Secrets and variables → Actions → Variables 中设置 `DESKTOP_SERVER_URL`，填不含 `/api` 的 HTTPS 根地址。
- 普通手动构建可通过 `server_url` 输入覆盖地址；标签发布使用仓库变量或默认地址。
- 当前 Windows 安装包未签名；Mac 使用 ad-hoc 临时签名，未经过 Apple 公证。下载后可能被系统阻止，公开分发前建议接入正式证书与公证。参见 [Tauri macOS 签名文档](https://v2.tauri.app/distribute/sign/macos/)。
- GitHub Releases 提供版本列表和下载安装包；应用内检查更新、静默升级尚未实现。
- 构建成功不等于全部设备功能已验收，尤其 macOS 屏幕共享受 WKWebView 兼容性影响；人工验收清单见 [桌面端说明](WINDOWS_DESKTOP.md)。

## 本次本地验证

- 前端 143 项单元测试通过，类型检查通过。
- 桌面 hash 路由、刷新和服务地址导航测试通过；模拟原生 CSP 的登录样式回归测试通过，Mac 原生窗口截图确认输入框、标签和图标正常。
- Mac ARM64 `.app` / `.dmg` 实际构建成功，签名完整性校验通过，应用启动进入登录页。
- Release 校验脚本包含正式版、测试版、标签不一致、Rust 版本不一致和非法版本号测试。
- Windows 和 Intel Mac 构建由 GitHub Actions 执行；真实设备音视频、通知与屏幕共享需要分别验收。
