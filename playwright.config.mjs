import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // Uma nova tentativa só no CI: runners compartilhados oscilam e o custo
  // de repetir um fluxo isolado é menor que o de um falso negativo.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: process.env.LENSCLICK_E2E_URL || 'http://127.0.0.1:4174'
  }
});
