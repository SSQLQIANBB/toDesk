# 远控画面布局与指针坐标合同

本补充定义采集端、原生监督器和 Web 主控之间的坐标边界。P0 仍仅捕获主显示器；布局变化结束当前会话，不能用旧坐标继续输入。此合同不替代真实系统键鼠、不同显示配置和签名安装包验收。

## 1. 三种坐标不能混用

1. 主控鼠标事件的 `clientX/clientY` 与视频元素矩形属于浏览器 CSS 像素。
2. `encodedSize/contentRect` 属于实际解码视频帧的像素。`contentRect` 只包含完整主屏的有效画面，不包含编码帧中的黑边。
3. 原生 `displayBounds` 属于 CoreGraphics 全局逻辑点，可包含负原点；`displayPixels` 是与当前画面方向一致的物理像素尺寸。

浏览器的 `devicePixelRatio` 不参与换算。采集端的 Retina 倍率也不能再次乘到输入坐标上。旋转后的画面与原生全局逻辑坐标使用相同的当前显示方向，主控和执行器不对归一化坐标重复旋转。

## 2. 布局消息

Swift 首个有效完整帧建立布局，Python 经认证 IPC 发出 `media-layout`，Rust 校验并通过可靠有序状态通道发送 `layout`。两者 payload 相同：

```json
{
  "screenId": "primary",
  "layoutVersion": 1,
  "geometry": {
    "displayId": 1,
    "coordinateSpace": "quartz-global-logical",
    "displayBounds": { "x": 0, "y": 0, "width": 1440, "height": 900 },
    "displayPixels": { "width": 2880, "height": 1800 },
    "rotationDegrees": 0,
    "encodedSize": { "width": 1280, "height": 720 },
    "contentRect": { "x": 64, "y": 0, "width": 1152, "height": 720 }
  }
}
```

各层只允许已定义字段。`layoutVersion` 为正安全整数，`displayId` 为正 u32；编码及物理像素尺寸为 1–16384 的整数；逻辑尺寸为 1–16384 的有限数，逻辑原点绝对值不超过 1,000,000。`contentRect` 可以有有限小数，必须非空、完整落在编码帧内。旋转仅允许 0/90/180/270 度。采集源还必须利用帧附件核对完整屏幕与等比例缩放，不能将窗口或任意局部截图冒充整个主屏。

布局未知不能 arm。原生要独立读取主屏快照并与采集声明比对；主控必须确认真实 `videoWidth/videoHeight` 与 `encodedSize` 一致。重复消息只能重述完全相同的布局。任一布局字段变化，即使 `layoutVersion` 未变化，也要结束会话并释放本会话持有的输入；新布局必须重新建连和授权。

## 3. ScreenCaptureKit 元数据

Apple 的 SDK 声明区分了 surface 中以点为单位的 `contentRect`、像素/点倍率 `scaleFactor`，以及原始内容到 surface 内容的 `contentScale`；采集配置的目标矩形则使用输出像素。实际采集以每帧附件及像素缓冲区为准，不能只信任配置的 1280×720。[Apple 帧元数据](https://developer.apple.com/documentation/screencapturekit/scstreamframeinfo)、[目标矩形](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/destinationrect)

当前整屏路径中，输出像素内容矩形为附件 `contentRect × scaleFactor`；`contentScale` 用于核对原始完整屏幕尺寸，不能再乘进输出矩形。缺少附件、尺寸不符、部分裁剪、无效矩形和布局变化均失败关闭。健康 idle 回调只复用已验证的布局，不能用 idle 建立首次布局。

物理像素读取 `CGDisplayCopyDisplayMode` 的 `pixelWidth/pixelHeight`，不能假设 `CGDisplayPixelsWide/High` 就是 Retina backing 尺寸。先用 display mode 的逻辑宽高与 `CGDisplayBounds` 匹配：直接匹配时保留像素宽高，交换匹配时交换像素宽高，无法匹配时停止。这样既不猜测旋转模式的宽高排列，也不重复旋转视频。

本机只读观测：逻辑主屏 1920×1080，mode 像素 3840×2160，`CGDisplayPixelsWide/High` 返回 1920×1080；1280×720 缓冲区的附件矩形为 640×360，`scaleFactor=2`，`contentScale≈1/3`。这些数值证明上述换算在本机当前配置成立，不能当作所有显示器的实测结论。

## 4. 两层黑边与原生映射

主控先按居中的 `object-fit: contain` 去除元素的 CSS 黑边，换算到编码帧像素；再检查点是否位于 `contentRect` 内。落在任一层黑边、视频尚无尺寸或布局不匹配时返回无坐标，不发送指针事件。有效点归一化为：

```text
x = (frameX - contentRect.x) / contentRect.width
y = (frameY - contentRect.y) / contentRect.height
```

输入消息中的 `x/y` 因而相对有效屏幕内容，范围为 `[0,1]`。键鼠协议仍绑定 `layoutVersion`、控制/输入代次及短期原生票据。原生映射为：

```text
pointX = bounds.x + min(x * bounds.width, bounds.width - bounds.width / pixels.width)
pointY = bounds.y + min(y * bounds.height, bounds.height - bounds.height / pixels.height)
```

中心精确落在逻辑中心，边缘钳制到最后一个物理像素对应的逻辑位置，不跨到邻接屏幕。原生在实际 post 前复查本机布局与截止时间；浏览器的前置检查不能代替原生校验。

## 5. 验证与边界

共享[坐标向量](../../fixtures/remote-control-layout-v1.json)同时供前端和 Rust 测试使用，覆盖 Retina 横屏、双层黑边、负原点、竖屏旋转、中心与边缘。旋转和负原点的合成测试不代表已切换本机显示配置实测。

开发探针的 `--layout=letterbox` 仅在测试编译的源进程中设置真实 SCK `destinationRect`，验证编码帧内四边黑边；`--stop-mode=layout-change` 仅在测试宏中改变待验证布局，走同一个拒绝与停止路径，不修改用户系统显示设置。普通源构建拒绝这些参数。所有探针均使用记录型输入，不向桌面注入系统事件，也不保存画面文件。

```sh
python3 scripts/remote-control-geometry-check.py
cargo build --locked --manifest-path client-vue/src-tauri/Cargo.toml --features remote-control-harness --bin remote-control-host-harness
REMOTE_CONTROL_PROBE_PYTHON=/tmp/todesk-gstreamer-m0-1.28.7/bin/python node scripts/remote-control-supervisor-probe.mjs --source=screen --scope=control --layout=letterbox
REMOTE_CONTROL_PROBE_PYTHON=/tmp/todesk-gstreamer-m0-1.28.7/bin/python node scripts/remote-control-supervisor-probe.mjs --source=screen --scope=control --stop-mode=layout-change
```

实际执行结果见[实施进度](./2026-09-25-remote-control-implementation.md)。产品发布、真实 OS 输入、实体旋转屏幕和 Windows 仍需独立验收。
