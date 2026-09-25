/** Release allowlist stays closed until the native M0 report has passed, independently of UI build flags. */
export function getRemoteControlCapabilities() {
  return {
    protocolVersion: 1 as const,
    desktopControllerEnabled: false,
    desktopHostEnabled: false,
    webControllerReleaseEnabled: false,
    releasedPlatforms: [] as string[],
    engineRequired: true,
    reason: 'NATIVE_VALIDATION_PENDING',
  };
}
