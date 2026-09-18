import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.LENSCLICK_E2E_URL || 'http://127.0.0.1:4174'
  }
});
