import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const DEV_PORT = 4564;
const NODE = JSON.stringify(process.execPath);
const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  testDir: 'tests/cloth',
  testMatch: 'model-form-direct-pose-touch-v1.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${DEV_PORT}`,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  expect: { timeout: 60_000 },
  projects: [
    {
      name: 'mobile-chromium-touch',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: `${NODE} scripts/model-form-direct-pose-v9-dev-server.mjs`,
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${DEV_PORT}/__model-form-personalized-preview-v1`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
