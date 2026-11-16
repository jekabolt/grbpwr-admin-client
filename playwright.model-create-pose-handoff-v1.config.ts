import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const DEV_PORT = 4581;
const NODE = JSON.stringify(process.execPath);
const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));
const DEV_ROUTE = '/__model-create-pose-handoff-v1';

export default defineConfig({
  testDir: 'tests/cloth',
  testMatch: 'model-create-pose-handoff-v1.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${DEV_PORT}`,
    viewport: { width: 1440, height: 1000 },
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
    command: `${NODE} scripts/model-create-pose-handoff-dev-server.mjs`,
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${DEV_PORT}${DEV_ROUTE}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
