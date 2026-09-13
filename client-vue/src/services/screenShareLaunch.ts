const captured = new Map<number, MediaStream>();

// 在用户点击按钮的手势内申请屏幕，跨路由交给共享页使用。
export async function captureGroupScreen(groupId: number) {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  captured.get(groupId)?.getTracks().forEach(track => track.stop());
  captured.set(groupId, stream);
  return stream;
}
export function takeCapturedGroupScreen(groupId: number) {
  const stream = captured.get(groupId) || null;
  captured.delete(groupId);
  return stream;
}
export function discardCapturedGroupScreen(groupId: number) {
  takeCapturedGroupScreen(groupId)?.getTracks().forEach(track => track.stop());
}
