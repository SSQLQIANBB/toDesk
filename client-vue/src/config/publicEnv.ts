export interface PublicEnvSource {
  VITE_API_BASE_URL?: string;
  VITE_SOCKET_URL?: string;
}

function normalizePublicUrl(value: string | undefined, name: keyof PublicEnvSource) {
  const normalized = value?.trim().replace(/\/+$/, '') || '';
  if (!normalized) return '';

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${name} 必须是完整的 HTTP(S) 地址`);
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error(`${name} 只能使用不包含凭据的 HTTP(S) 地址`);
  }

  return normalized;
}

export function createPublicEnv(source: PublicEnvSource) {
  return Object.freeze({
    apiBaseUrl: normalizePublicUrl(source.VITE_API_BASE_URL, 'VITE_API_BASE_URL'),
    socketUrl: normalizePublicUrl(source.VITE_SOCKET_URL, 'VITE_SOCKET_URL'),
  });
}
