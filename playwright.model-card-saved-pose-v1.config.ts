import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const NODE = JSON.stringify(process.execPath);
const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  testDir: 'tests/cloth',
  testMatch: 'model-open-reference-linked-pose-v2.spec.ts',
  grep: /renders the saved pose read-only in the on-demand Models card/u,
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4551',
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  expect: { timeout: 180_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `${NODE} scripts/model-card-saved-pose-v1-dev-server.mjs`,
    cwd: REPO_ROOT,
    url: 'http://127.0.0.1:4551/__model-card-list-preview-v1',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
