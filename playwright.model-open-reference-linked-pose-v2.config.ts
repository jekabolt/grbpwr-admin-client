import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const DEV_PORT = 4547;
const NODE = JSON.stringify(process.execPath);
const REPO_ROOT = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  testDir: 'tests/cloth',
  testMatch: 'model-open-reference-linked-pose-v2.spec.ts',
  // The saved-pose card needs the RPC feature flag and is covered by the dedicated
  // playwright.model-card-saved-pose-v1.config.ts fixture.
  grepInvert: /renders the saved pose read-only in the on-demand Models card/u,
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${DEV_PORT}`,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  expect: { timeout: 180_000 },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: `${NODE} scripts/model-open-reference-linked-pose-v2-dev-server.mjs`,
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${DEV_PORT}/__model-open-reference-preview-v1`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
