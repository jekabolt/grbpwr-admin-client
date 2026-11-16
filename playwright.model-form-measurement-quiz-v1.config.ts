import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const DEV_PORT = 4573;
const DEV_ROUTE = '/__model-form-personalized-preview-v1';
const NODE = JSON.stringify(process.execPath);
const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  testDir: 'tests/cloth',
  testMatch: 'model-form-measurement-quiz-v1.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${DEV_PORT}`,
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  expect: { timeout: 60_000 },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: `${NODE} scripts/model-form-personalized-preview-dev-server.mjs`,
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${DEV_PORT}${DEV_ROUTE}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
