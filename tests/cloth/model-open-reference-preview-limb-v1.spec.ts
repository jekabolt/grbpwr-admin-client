import { expect, test, type Page } from '@playwright/test';

const LIMB_ASSET = 'makehuman-hm08-limb-circumference-deltas-v1';

function matchingRequests(urls: readonly string[], name: string): string[] {
  return urls.filter((url) => url.includes(name));
}

function authenticatedLimbFetches(urls: readonly string[]): string[] {
  return matchingRequests(urls, LIMB_ASSET).filter((url) => !url.includes('?import&url'));
}

async function prewarmLimbRuntimeModule(page: Page) {
  await page.goto('/__model-open-reference-preview-v1?basis=female');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.evaluate(async () => {
        const modulePath =
          '/src/lib/cloth/body/measurement-open-reference-limb-subset-runtime-loader-v1.ts';
        const loader = (await import(/* @vite-ignore */ modulePath)) as {
          loadMeasurementOpenReferenceLimbSubsetRuntimeModuleV1: () => Promise<unknown>;
        };
        await loader.loadMeasurementOpenReferenceLimbSubsetRuntimeModuleV1();
      });
      return;
    } catch (reason: unknown) {
      if (!(reason instanceof Error) || !/context|navigation|destroyed/i.test(reason.message)) {
        throw reason;
      }
      await page.waitForLoadState('domcontentloaded');
    }
  }
  throw new Error('Unable to prewarm the dev-only limb runtime module deterministically.');
}

async function buildAndWait(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole('button', { name: /build preview/i }).click();
    const status = page.getByTestId('model-open-reference-preview-status');
    await expect(status).toContainText(/Building|Preparing|Preview ready/);
    const settled = await expect
      .poll(() => status.textContent(), { timeout: 60_000 })
      .toMatch(/Preview ready|Preview not built/)
      .then(() => status.textContent());
    if (settled?.includes('Preview ready')) return;
  }
  throw new Error('Preview did not survive the dev-server dependency optimization reload.');
}

test('keeps the limb asset unloaded when optional limb values are absent', async ({ page }) => {
  await prewarmLimbRuntimeModule(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/__model-open-reference-preview-v1?basis=female');

  await expect(page.getByText('limb proxies 0/4', { exact: true })).toBeVisible();
  expect(authenticatedLimbFetches(requests)).toEqual([]);
  await buildAndWait(page);
  await expect(page.getByTestId('model-open-reference-limb-outcome')).toContainText(
    'No optional bicep, wrist, calf or ankle value was entered',
  );
  expect(authenticatedLimbFetches(requests)).toEqual([]);
});

test('loads and authenticates the exact limb asset only after A-rest BUILD', async ({ page }) => {
  await prewarmLimbRuntimeModule(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/__model-open-reference-preview-v1?basis=female&limbs=all');

  await expect(page.getByTestId('model-open-reference-fixture-limbs')).toHaveText('all');
  expect(authenticatedLimbFetches(requests)).toEqual([]);
  await buildAndWait(page);
  await expect(page.getByText('limb proxies 4/4', { exact: true })).toBeVisible();
  expect(authenticatedLimbFetches(requests)).toHaveLength(1);
});

test('fails closed to waist/hip shape on tampered limb bytes and retries a clean rebuild', async ({
  page,
}) => {
  await prewarmLimbRuntimeModule(page);
  const tamperPattern = `**/${LIMB_ASSET}.bin*`;
  await page.route(tamperPattern, async (route) => {
    if (route.request().url().includes('?import&url')) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.body();
    body[body.length - 1] ^= 1;
    await route.fulfill({ response, body });
  });
  await page.goto('/__model-open-reference-preview-v1?basis=female&limbs=all');
  await buildAndWait(page);

  await expect(page.getByText('limb proxies 0/4', { exact: true })).toBeVisible();
  await expect(page.getByTestId('model-open-reference-limb-outcome')).toContainText(
    'SHA-256 authentication failed',
  );
  await expect(
    page.locator('[data-testid="measurement-watertight-surface-v1-canvas"]'),
  ).toHaveCount(1);

  await page.unroute(tamperPattern);
  await buildAndWait(page);
  await expect(page.getByTestId('model-open-reference-limb-outcome')).not.toContainText(
    'SHA-256 authentication failed',
  );
});

test('omits every limb proxy and request for non-A pose while continuing pose from waist/hip', async ({
  page,
}) => {
  await prewarmLimbRuntimeModule(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/__model-open-reference-preview-v1?basis=neutral&pose=near-t&limbs=all');
  await buildAndWait(page);

  await expect(page.getByText('limb proxies 0/4', { exact: true })).toBeVisible();
  await expect(page.getByTestId('model-open-reference-limb-outcome')).toContainText(
    'Non-A limb joint-anchor deltas are not admitted',
  );
  await expect(page.getByTestId('model-open-reference-pose-outcome')).toContainText(
    'Bounded near-T applied',
  );
  expect(authenticatedLimbFetches(requests)).toEqual([]);
});

type LimbAwaitBoundary = 'limb-loader' | 'limb-solve';
type Invalidation = 'input' | 'unmount';

for (const boundary of ['limb-loader', 'limb-solve'] as const) {
  for (const invalidation of ['input', 'unmount'] as const) {
    test(`drops stale limb result after ${invalidation} at ${boundary}`, async ({ page }) => {
      await prewarmLimbRuntimeModule(page);
      const parameters = new URLSearchParams({
        staleRig: boundary,
        settle: 'resolve',
        limbs: 'all',
      });
      await page.goto(`/__model-open-reference-preview-v1?${parameters}`);
      await page.getByRole('button', { name: 'build preview' }).click();
      await page
        .getByTestId('model-open-reference-run-fake-timer')
        .evaluate((element: HTMLElement) => element.click());
      await expect(page.getByTestId('model-open-reference-await-boundary')).toHaveText(
        boundary satisfies LimbAwaitBoundary,
      );
      await expect(page.getByTestId('model-open-reference-source-status')).toHaveText('ready');

      if (invalidation === 'input') {
        await page
          .getByTestId('model-open-reference-invalidate-input')
          .evaluate((element: HTMLElement) => element.click());
        await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
          'Preview not built',
        );
      } else {
        await page
          .getByTestId('model-open-reference-unmount')
          .evaluate((element: HTMLElement) => element.click());
        await expect(page.getByTestId('model-open-reference-preview')).toHaveCount(0);
      }
      await page
        .getByTestId('model-open-reference-settle-deferred')
        .evaluate((element: HTMLElement) => element.click());
      await expect(page.getByTestId('model-open-reference-await-boundary')).toHaveText('settled');
      await expect(
        page.locator('[data-testid="measurement-watertight-surface-v1-canvas"]'),
      ).toHaveCount(0);
      await expect(page.getByText(/Preview failed:/)).toHaveCount(0);
      await expect(page.getByText(/limb proxies [1-4]\/4/, { exact: true })).toHaveCount(0);
    });
  }
}
