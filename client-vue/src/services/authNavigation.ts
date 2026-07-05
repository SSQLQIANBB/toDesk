import type { LocationQueryValue } from 'vue-router';

function isSafeInternalPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  const path = value.split(/[?#]/, 1)[0];
  return path !== '/login';
}

export function getAuthRedirect(path: string) {
  return isSafeInternalPath(path) ? path : undefined;
}

export function resolvePostLoginPath(
  redirect: LocationQueryValue | LocationQueryValue[] | undefined,
) {
  if (typeof redirect !== 'string') return '/remote';
  return getAuthRedirect(redirect) || '/remote';
}
