import { defineConfig, devices } from '@playwright/test';

// Screenshot test of the public /ui-kit page (`yarn test:ui-kit`). Its own port, not :4040: other
// sessions keep a dev server there, and reusing one would test THEIR checkout.
const PORT = 4417;

export default defineConfig({
  testDir: 'tests/ui-kit',
  snapshotPathTemplate: '{testDir}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixels: 0 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `yarn vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/ui-kit`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
