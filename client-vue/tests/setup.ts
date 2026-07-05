import { vi } from 'vitest';

Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
  configurable: true,
  writable: true,
  value: null,
});

Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});
