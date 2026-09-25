# 应用图标

`todesk-icon.png` 是用户提供的蓝青色握手图标原图。保留原图的颜色、背景和构图，通过 Tauri 图标工具统一生成平台资源。

在仓库根目录执行 `node scripts/generate-app-icons.mjs`，更新：

- Web 标签页 PNG / ICO、兼容旧链接的 SVG、Apple 触屏图标。
- 登录页与 Web 通知使用的 `client-vue/public/app-icon.png`。
- 桌面窗口与托盘 PNG、Windows ICO、macOS ICNS。

不要单独修改派生文件；替换原图后重新运行生成命令。图标修改需要重新构建 Web 或桌面安装包才会出现在已部署或已安装的应用中。
