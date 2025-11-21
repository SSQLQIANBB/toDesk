export const cameraConstraints = {
  audio: false,
  video: {
    width: 1920,
    height: 1080,
    // deviceId, 设备ID
    frameRate: { ideal: 10, max: 15 }, // 帧率

    // facingMode: 'user' | 'environment' // 移动端 “前置” “后置”摄像头
    //#region 曝光控制
    exposureMode: "continuous",     // "manual" | "single-shot" | "continuous"
    exposureCompensation: 1.0,      // 曝光补偿值 (-2.0 到 +2.0)
    exposureTime: 10000,             // 曝光时间(微秒)，仅在manual模式下有效
    //#endregion

    //#region 对焦控制
    focusMode: "continuous",        // "manual" | "single-shot" | "continuous"
    focusDistance: 0.5,             // 对焦距离 (0.0-1.0)，仅manual模式有效
    pointsOfInterest: [{x: 0.5, y: 0.5}], // 对焦点坐标 (归一化坐标)
    //#endregion

    //#region 图像质量控制
    brightness: 1,                  // 亮度 (-1.0 到 +1.0)
    contrast: 1,                    // 对比度 (-1.0 到 +1.0)
    saturation: 1,                  // 饱和度 (-1.0 到 +1.0)
    sharpness: 1,                   // 锐度 (0.0-1.0)
    colorTemperature: 6500,         // 色温 (开尔文温度，如 6500K)
    whiteBalanceMode: "continuous",  // "manual" | "single-shot" | "continuous"
    //#endregion

    //#region 相机硬件控制
    iso: 100,                       // ISO感光度
    zoom: 10.0,                      // 数字缩放 (1.0为无缩放)
    torch: true,                   // 闪光灯控制
    pan: 180,                         // 水平旋转角度 (-180°到+180°)
    tilt: 90                         // 垂直倾斜角度 (-180°到+180°)
    //#endregion
  },
}

export const screenRecordConstraints = {
  video: {
    displaySurface: 'browser', // 'monitor' | 'window' | 'browser'
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
  audio: true, // 打开音频录制
}