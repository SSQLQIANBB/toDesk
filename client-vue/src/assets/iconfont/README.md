# 项目图标

当前界面使用 Iconfont「to desk」项目导出的本地字体。

- 项目：https://www.iconfont.cn/manage/index?manage_type=myprojects&projectId=5236601
- 字体：iconfont.woff2
- 图标清单及编码：iconfont.json（48 个图标）
- 业务类名映射：../../style/iconfont.css（44 个业务图标）

使用 `<i class="iconfont icon-microphone" aria-hidden="true"></i>`。
保留现有业务类名，图标继承控件字号和颜色；纯图标按钮须提供 aria-label。
入口继续引入 style/iconfont.css，不直接引入下载包 CSS，避免固定 16px 字号影响布局。
下载包中的 CSS、JS 和 demo 保留供查阅，不在应用入口加载。

更新时覆盖导出文件，并根据 iconfont.json 同步业务映射中的 Unicode。
挂断图标已为横向，不需要额外旋转。Naive UI 内置图标仍由组件库管理，动态语音波形由组件绘制。

public/favicon.svg 仍采用 Remix Icon v4.6.0 的 computer-line 字形。
LICENSE 为此 favicon 素材的 Apache-2.0 授权，不代表 Iconfont 商城图标的授权。
商城图标来源及授权以 Iconfont 项目和原作者说明为准。
