import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const DEV_PORT = 4423;
const NODE = JSON.stringify(process.execPath);
const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  testDir: 'tests/cloth',
  testMatch: 'model-form-mannequin-binding-v1.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${DEV_PORT}`,
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  expect: { timeout: 60_000 },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `${NODE} scripts/model-form-mannequin-binding-dev-server.mjs`,
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${DEV_PORT}/__model-open-reference-preview-v1`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
