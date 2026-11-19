import { chromium, expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type {} from '../../scripts/cloth/generic-observed-webgpu-v1';

test('actual generic16/32 executes three DXF panels against displayed V11 body on one borrowed device', async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  let page: Page | null = null;
  const errors: string[] = [];
  try {
    page = await browser.newPage({ viewport: { width: 1300, height: 1100 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (
        url.protocol === 'data:' ||
        url.protocol === 'blob:' ||
        (url.hostname === '127.0.0.1' && url.port === '4596')
      )
        await route.continue();
      else {
        errors.push(`Unexpected remote request: ${url.origin}${url.pathname}`);
        await route.abort();
      }
    });
    await page.goto('http://127.0.0.1:4596/__cloth-generic-observed-webgpu-v1');
    await page.waitForFunction(
      () => {
        const value = globalThis.__GENERIC_OBSERVED_WEBGPU_V1__;
        return value && ['ready', 'body-blocked'].includes(value.status);
      },
      undefined,
      { timeout: 180000 },
    );
    expect(await page.evaluate(() => globalThis.__GENERIC_OBSERVED_WEBGPU_V1__?.status)).toBe(
      'ready',
    );
    await page.getByRole('button', { name: 'Run genuine generic 16 / 32', exact: true }).click();
    await page.waitForFunction(
      () => {
        const value = globalThis.__GENERIC_OBSERVED_WEBGPU_V1__;
        return value && (value.status === 'preview-ready' || value.status === 'blocked');
      },
      undefined,
      { timeout: 700000 },
    );
    expect(await page.evaluate(() => globalThis.__GENERIC_OBSERVED_WEBGPU_V1__?.status)).toBe(
      'preview-ready',
    );
    const visible = await page.evaluate(
      () => globalThis.__GENERIC_OBSERVED_WEBGPU_V1__?.previewReceipt,
    );
    expect(visible?.visibleHeatmapRendered).toBe(true);
    expect(visible?.frames).toBe(32);
    expect(visible?.units).toBe('dimensionless');
    expect(visible?.stressPaComputed).toBe(false);
    const display = page.locator('canvas[aria-label="Actual generic frame32 strain preview"]');
    await expect(display).toHaveAttribute(
      'data-generic-observed-strain-frame-sha256',
      visible!.frameReportSha256,
    );
    await display.screenshot({
      path: test.info().outputPath('generic-observed-actual-frame32-strain.png'),
    });
    await expect(display).toHaveAttribute(
      'data-generic-observed-strain-frame-sha256',
      visible!.frameReportSha256,
    );
    await page.getByRole('button', { name: 'Release numeric preview', exact: true }).click();
    await page.waitForFunction(
      () => globalThis.__GENERIC_OBSERVED_WEBGPU_V1__?.cleanupCompleted === true,
      undefined,
      { timeout: 60000 },
    );
    const result = await page.evaluate(() => globalThis.__GENERIC_OBSERVED_WEBGPU_V1__);
    expect(result?.error).toBeNull();
    expect(result?.status).toBe('completed');
    expect(result?.result16?.status).toBe('diagnostic-completed');
    expect(result?.result32?.status).toBe('diagnostic-completed');
    expect(result?.result32?.checkpoint16Matched).toBe(true);
    expect(result?.result32?.strain?.passed).toBe(true);
    expect(result?.borrowedBodySurvived).toBe(true);
    expect(result?.leaseReleasedByHarness).toBe(true);
    expect(result?.sessionCleanup?.deviceDestroyed).toBe(true);
    expect(result?.previewClearedOnRelease).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    try {
      if (page && !page.isClosed()) {
        const json = await page.evaluate(() =>
          JSON.stringify(globalThis.__GENERIC_OBSERVED_WEBGPU_V1__, (_key, value: unknown) => {
            if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>);
            if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
            return value;
          }),
        );
        await writeFile(
          test.info().outputPath('generic-observed-webgpu-evidence.json'),
          json ?? 'null',
        );
        await writeFile(
          test.info().outputPath('generic-observed-webgpu-errors.json'),
          JSON.stringify(errors, null, 2),
        );
        await page.screenshot({
          path: test.info().outputPath('generic-observed-numeric-harness.png'),
        });
      }
    } finally {
      await browser.close();
    }
  }
});
