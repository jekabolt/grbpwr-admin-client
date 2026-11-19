import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/cloth',
  testMatch: 'generic-observed-webgpu-v1.spec.ts',
  fullyParallel: false,
  preserveOutput: 'always',
  workers: 1,
  retries: 0,
  timeout: 900000,
  expect: { timeout: 30000 },
  reporter: 'list',
  outputDir: 'test-results/generic-observed-webgpu-v1',
  webServer: {
    command: 'node scripts/generic-observed-webgpu-v1-dev-server.mjs',
    url: 'http://127.0.0.1:4596/__cloth-generic-observed-webgpu-v1',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
