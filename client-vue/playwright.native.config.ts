import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/native',
  workers: 1,
  timeout: 60000,
});
