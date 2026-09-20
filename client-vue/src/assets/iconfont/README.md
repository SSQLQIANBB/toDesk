# 项目图标

当前使用 Remix Icon v4.6.0 字体版，固定版本并本地托管，不依赖第三方 CDN。
这是本地 icon font，不是 Iconfont.cn 上创建的私有项目。

- 上游：https://github.com/Remix-Design/RemixIcon/tree/v4.6.0
- 字体：https://raw.githubusercontent.com/Remix-Design/RemixIcon/v4.6.0/fonts/remixicon.woff2
- 编码表：https://raw.githubusercontent.com/Remix-Design/RemixIcon/v4.6.0/fonts/remixicon.css
- 授权：本目录 LICENSE（此版本为 Apache-2.0）
- 业务映射：../../style/iconfont.css

使用 `<i class="iconfont icon-microphone" aria-hidden="true"></i>`。
图标继承所在控件的字号、颜色；纯图标按钮须提供 aria-label 或可访问名称。
动态图标通过 class 切换，例如麦克风的 icon-microphone / icon-microphone-off。

新增图标时从上述版本编码表选择语义一致的字形，在 iconfont.css 中添加业务名称映射。
如改用 Iconfont.cn 项目导出包，替换字体文件及编码映射，保留业务类名即可。
Naive UI 内置的加载、输入框与弹窗图标仍由组件库管理；语音波形属于动态状态绘制。

浏览器标签图标 public/favicon.svg 使用同版本 computer-line 字形，添加蓝色圆角背景。
