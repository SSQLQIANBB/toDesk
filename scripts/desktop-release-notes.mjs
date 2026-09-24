import { pathToFileURL } from 'node:url';

export function desktopReleaseNotes(repository, version) {
  const base = `https://github.com/${repository}/releases/download/desktop-v${version}`;
  return `## 下载 ToDesk ${version}

请按电脑系统选择安装包，点击下方对应的下载链接：

| 你的电脑 | 下载入口 | 安装方式 |
| --- | --- | --- |
| Windows 电脑（64 位 Intel / AMD） | [下载 Windows 安装包（.exe）](${base}/ToDesk_${version}_x64-setup.exe) | 双击安装程序 |
| Mac（Apple 芯片，M 系列） | [下载 macOS 安装包 · Apple 芯片（.dmg）](${base}/ToDesk_${version}_aarch64.dmg) | 打开后将 ToDesk 拖入“应用程序” |
| Mac（Intel 芯片） | [下载 macOS 安装包 · Intel 芯片（.dmg）](${base}/ToDesk_${version}_x64.dmg) | 打开后将 ToDesk 拖入“应用程序” |

**不确定 Mac 的芯片？** 点击屏幕左上角苹果菜单 →“关于本机”：显示 Apple M 系列芯片请选择“Apple 芯片”；显示 Intel 处理器请选择“Intel 芯片”。Mac 需要 macOS 12 或更新版本。

**请不要下载 Source code (zip) / Source code (tar.gz) 来安装。** 它们是供开发者使用的源码压缩包。SHA256SUMS.txt 是校验文件，也不是安装包。

## 安装说明

当前 Windows 安装包未签名，macOS 使用临时签名、未经过 Apple 公证，首次打开可能被系统拦截。
安装包连接构建时配置的在线服务；本次发布不包含应用内自动更新。
可使用 [SHA256SUMS.txt](${base}/SHA256SUMS.txt) 校验下载文件。
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GH_REPO, RELEASE_VERSION } = process.env;
  if (!GH_REPO || !RELEASE_VERSION) throw new Error('缺少 GH_REPO 或 RELEASE_VERSION');
  process.stdout.write(desktopReleaseNotes(GH_REPO, RELEASE_VERSION));
}
