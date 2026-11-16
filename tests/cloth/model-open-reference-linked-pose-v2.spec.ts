import { expect, test, type Page, type TestInfo } from '@playwright/test';

const POSE_ASSET_NAMES = [
  'makehuman-hm08-repaired-core-rig-v1',
  'makehuman-hm08-repaired-waist-hip-rig-anchor-deltas-v1',
] as const;

function authenticatedPoseAssetFetches(urls: readonly string[]): string[] {
  return urls.filter(
    (url) => POSE_ASSET_NAMES.some((name) => url.includes(name)) && !url.includes('?import&url'),
  );
}

async function buildAndWait(page: Page) {
  await page.getByRole('button', { name: /build preview/i }).click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready',
    { timeout: 180_000 },
  );
}

async function markCanvas(page: Page) {
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toBeVisible();
  await canvas.evaluate((element) => element.setAttribute('data-linked-v2-browser-marker', 'same'));
  return canvas;
}

function desktopOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop interaction gate.');
}

function mobileOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile layout gate.');
}

function trackMainFrameNavigations(page: Page) {
  const navigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
  return navigations;
}

function expectNoUnexpectedNavigation(navigations: readonly string[]) {
  expect(navigations).toEqual([]);
}

function storedModelFixture(id: number, name: string, waistMm: number) {
  return {
    id,
    model: {
      name,
      gender: id === 1 ? 'GENDER_ENUM_FEMALE' : 'GENDER_ENUM_MALE',
      measurements: [
        { name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: id === 1 ? 1720 : 1840 },
        { name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', valueMm: id === 1 ? 420 : 470 },
        { name: 'BODY_MEASUREMENT_NAME_CHEST', valueMm: id === 1 ? 920 : 1040 },
        { name: 'BODY_MEASUREMENT_NAME_WAIST', valueMm: waistMm },
        { name: 'BODY_MEASUREMENT_NAME_HIP', valueMm: id === 1 ? 980 : 1020 },
        { name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', valueMm: id === 1 ? 600 : 650 },
        { name: 'BODY_MEASUREMENT_NAME_INSEAM', valueMm: id === 1 ? 800 : 860 },
      ],
      defaultSizeIds: [],
      mediaIds: [],
    },
    media: [],
  };
}

test('applies linked pose controls without replacing the retained canvas', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  const requests: string[] = [];
  const navigations = trackMainFrameNavigations(page);
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/__model-open-reference-preview-v1?basis=female&controls=linked-v2');
  await expect(page.getByTestId('model-open-reference-fixture-controls')).toHaveText('linked-v2');
  navigations.length = 0;
  await expect(page.getByTestId('model-open-reference-preview')).toHaveAttribute(
    'data-pose-controls',
    'linked-v2',
  );
  await expect(page.getByText(/actualRenderedGarmentPairEvaluated=false/)).toBeVisible();
  await expect(page.getByText(/fitClaimEligible=false/)).toBeVisible();
  await expect(page.getByText(/runtimeCollisionEligible=false/)).toBeVisible();

  await buildAndWait(page);
  await expect(page.getByText('preview A-rest', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Pose is preview-only and is not saved with the model.'),
  ).toBeVisible();
  const canvas = await markCanvas(page);

  const range = page.getByRole('slider', { name: 'Linked shoulder and forearm relaxation' });
  await expect(range).toHaveAttribute('min', '0');
  await expect(range).toHaveAttribute('max', '4');
  await expect(range).toHaveAttribute('step', '1');
  await expect(range).toHaveAttribute(
    'aria-valuetext',
    'A-rest, shoulder 0 degrees, forearm 0 degrees',
  );

  const box = await range.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 1, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width - 1, box!.y + box!.height / 2, { steps: 6 });
  await expect(page.getByText('preview A-rest', { exact: true })).toBeVisible();
  await expect(page.getByText('draft relax 4°', { exact: true })).toBeVisible();
  await page.mouse.up();

  await expect(canvas).toHaveAttribute('data-linked-v2-browser-marker', 'same');
  await expect(page.getByText('preview relax 4°', { exact: true })).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready',
  );
  await expect(page.getByText('limb proxies 0/4', { exact: true }).first()).toBeVisible();
  const firstAuthenticatedPoseFetches = authenticatedPoseAssetFetches(requests);
  // The beta shape/length owner and the linked-pose owner authenticate the same exact rig pair
  // independently on their first use; later linked edits must reuse those four fetches.
  expect(firstAuthenticatedPoseFetches).toHaveLength(4);

  const keyboardCanvas = await markCanvas(page);
  await range.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('draft relax 3°', { exact: true })).toBeVisible();
  await expect(page.getByText('preview relax 4°', { exact: true })).toBeVisible();
  await expect(keyboardCanvas).toHaveAttribute('data-linked-v2-browser-marker', 'same');
  await expect(page.getByText('preview relax 3°', { exact: true })).toBeVisible({
    timeout: 180_000,
  });
  expect(authenticatedPoseAssetFetches(requests)).toEqual(firstAuthenticatedPoseFetches);

  const nearTCanvas = await markCanvas(page);
  await page.getByRole('button', { name: 'Select Near-T linked display pose' }).click();
  await expect(nearTCanvas).toHaveAttribute('data-linked-v2-browser-marker', 'same');
  await expect(page.getByText('preview raise 25°', { exact: true })).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByRole('slider', { name: 'Linked upper-arm raise' })).toHaveAttribute(
    'aria-valuetext',
    'upper arm 25 degrees',
  );
  expect(authenticatedPoseAssetFetches(requests)).toEqual(firstAuthenticatedPoseFetches);

  const resetCanvas = await markCanvas(page);
  await page.getByRole('button', { name: 'reset pose' }).click();
  await expect(page.getByText('preview A-rest', { exact: true })).toBeVisible({
    timeout: 180_000,
  });
  await expect(resetCanvas).toBeVisible();
  expect(authenticatedPoseAssetFetches(requests)).toEqual(firstAuthenticatedPoseFetches);
  expectNoUnexpectedNavigation(navigations);
});

test('keeps the applied mesh when a linked pose update fails', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const navigations = trackMainFrameNavigations(page);
  await page.goto('/__model-open-reference-preview-v1?basis=female&controls=linked-v2');
  await expect(page.getByTestId('model-open-reference-fixture-controls')).toHaveText('linked-v2');
  navigations.length = 0;
  await buildAndWait(page);
  const canvas = await markCanvas(page);
  await expect(page.getByText('preview A-rest', { exact: true })).toBeVisible();

  for (const assetName of POSE_ASSET_NAMES) {
    await page.route(`**/*${assetName}*`, (route) => route.abort('failed'));
  }

  await page.getByRole('button', { name: 'Select Relaxed linked display pose' }).click();
  await expect(page.getByText('pose update failed', { exact: true })).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByText('preview A-rest', { exact: true })).toBeVisible();
  await expect(page.getByTestId('model-open-reference-linked-pose-status-v2')).toContainText(
    'Draft relax 4° is unapplied',
  );
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Previous preview pose remains visible',
  );
  await expect(canvas).toHaveAttribute('data-linked-v2-browser-marker', 'same');

  await page.getByRole('button', { name: 'reset pose' }).click();
  await expect(page.getByText('pose update failed', { exact: true })).toHaveCount(0);
  await expect(page.getByText('draft A-rest', { exact: true })).toBeVisible();
  await expect(page.getByText('preview A-rest', { exact: true })).toBeVisible();
  await expect(page.getByTestId('model-open-reference-linked-pose-status-v2')).toContainText(
    'Preview A-rest',
  );
  await expect(canvas).toHaveAttribute('data-linked-v2-browser-marker', 'same');
  expectNoUnexpectedNavigation(navigations);
});

test('keeps the native linked range usable in the mobile layout', async ({ page }, testInfo) => {
  mobileOnly(testInfo);
  const navigations = trackMainFrameNavigations(page);
  await page.goto('/__model-open-reference-preview-v1?basis=neutral&controls=linked-v2');
  await expect(page.getByTestId('model-open-reference-fixture-controls')).toHaveText('linked-v2');
  navigations.length = 0;
  await buildAndWait(page);

  const range = page.getByRole('slider', { name: 'Linked shoulder and forearm relaxation' });
  await expect(range).toBeVisible();
  await expect(range).toHaveAttribute('type', 'range');
  const viewport = page.viewportSize();
  const box = await range.boundingBox();
  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);

  await range.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('draft relax 1°', { exact: true })).toBeVisible();
  await expect(page.getByText('preview relax 1°', { exact: true })).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toBeVisible();
  expectNoUnexpectedNavigation(navigations);
});

test('auto-builds the compact card preview without interactive pose controls', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  const navigations = trackMainFrameNavigations(page);
  await page.goto('/__model-open-reference-preview-v1?basis=male&controls=linked-v2&variant=card');
  navigations.length = 0;

  const preview = page.getByTestId('model-open-reference-preview');
  await expect(preview).toHaveAttribute('data-preview-variant', 'card');
  await expect(preview).toHaveAttribute('data-render-mode', 'on-demand');
  await expect(page.getByText('visual reference only · not proof of garment fit')).toBeVisible();
  await expect(page.getByRole('button', { name: /build preview/i })).toHaveCount(0);
  await expect(page.getByRole('slider')).toHaveCount(0);
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready.',
    { timeout: 180_000 },
  );
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toBeVisible();
  expectNoUnexpectedNavigation(navigations);
});

test('applies bounded full-body local-FK controls while retaining the canvas', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  const requests: string[] = [];
  const navigations = trackMainFrameNavigations(page);
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/__model-open-reference-preview-v1?basis=male&controls=full-body-v3');
  navigations.length = 0;

  await expect(page.getByTestId('model-open-reference-fixture-controls')).toHaveText(
    'full-body-v3',
  );
  const preview = page.getByTestId('model-open-reference-preview');
  await expect(preview).toHaveAttribute('data-pose-controls', 'full-body-v3');
  await expect(page.getByRole('slider')).toHaveCount(7);
  await expect(page.getByRole('slider', { name: 'Body forward and back bend' })).toHaveAttribute(
    'min',
    '-20',
  );
  await expect(page.getByRole('slider', { name: 'Linked arm raise' })).toHaveAttribute('max', '60');
  await expect(page.getByRole('slider', { name: 'Linked elbow bend' })).toHaveAttribute(
    'max',
    '100',
  );
  expect(authenticatedPoseAssetFetches(requests)).toEqual([]);

  await page.getByRole('button', { name: 'apply pose' }).click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready: A-rest',
    { timeout: 180_000 },
  );
  expect(authenticatedPoseAssetFetches(requests)).toEqual([]);
  const canvas = await markCanvas(page);
  const viewport = page.getByRole('img', { name: /Keyboard: Left for side/i });
  await viewport.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(canvas).toHaveAttribute('data-view-preset', 'side');
  await page.keyboard.press('Home');
  await expect(canvas).toHaveAttribute('data-view-preset', 'front');

  await page.getByRole('slider', { name: 'Body forward and back bend' }).fill('14');
  await page.getByRole('slider', { name: 'Body side bend' }).fill('-6');
  await page.getByRole('slider', { name: 'Body twist' }).fill('8');
  await page.getByRole('slider', { name: 'Linked arm raise' }).fill('35');
  await page.getByRole('slider', { name: 'Linked arms forward and back' }).fill('18');
  await page.getByRole('slider', { name: 'Linked elbow bend' }).fill('50');
  await page.getByRole('slider', { name: 'Linked wrist bend' }).fill('-10');
  await expect(page.getByText('Draft pose differs from the visible preview.')).toBeVisible();
  await page.getByRole('button', { name: 'apply pose' }).click();

  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready: body 14/-6/8°, arms raise 35° / forward 18°, elbows 50°, wrists -10°',
    { timeout: 180_000 },
  );
  await expect(canvas).toHaveAttribute('data-linked-v2-browser-marker', 'same');
  await expect(page.getByText('pivot residual ≤ 1e-7 m', { exact: true })).toBeVisible();
  expect(authenticatedPoseAssetFetches(requests)).toHaveLength(2);
  expectNoUnexpectedNavigation(navigations);
});

test('applies independent V4 arms and relinks explicitly without replacing the canvas', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/__model-open-reference-preview-v1?basis=male&controls=full-body-v4');

  const preview = page.getByTestId('model-open-reference-preview');
  await expect(preview).toHaveAttribute('data-pose-controls', 'full-body-v4');
  await expect(page.getByRole('slider')).toHaveCount(7);
  await page.getByRole('button', { name: 'apply pose' }).click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready: A-rest',
    { timeout: 180_000 },
  );
  expect(authenticatedPoseAssetFetches(requests)).toEqual([]);
  await page.getByRole('button', { name: 'unlink arms' }).click();
  await expect(page.getByRole('slider')).toHaveCount(11);
  await expect(page.getByText('arms independent', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'apply pose' })).toBeDisabled();

  await page.getByRole('slider', { name: 'Body twist' }).fill('8');
  await page.getByRole('slider', { name: 'Left arm raise' }).fill('35');
  await page.getByRole('slider', { name: 'Right arm raise' }).fill('10');
  await page.getByRole('slider', { name: 'Left elbow bend' }).fill('50');
  await page.getByRole('slider', { name: 'Right elbow bend' }).fill('20');
  await page.getByRole('button', { name: 'apply pose' }).click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready: body 0/0/8°, left arm 35/0/50/0°, right arm 10/0/20/0°',
    { timeout: 180_000 },
  );
  const canvas = await markCanvas(page);
  expect(authenticatedPoseAssetFetches(requests)).toHaveLength(2);

  await page.getByRole('button', { name: 'link from right' }).click();
  await expect(page.getByRole('slider')).toHaveCount(7);
  await expect(page.getByRole('slider', { name: 'Linked arm raise' })).toHaveValue('10');
  await expect(page.getByRole('slider', { name: 'Linked elbow bend' })).toHaveValue('20');
  await page.getByRole('button', { name: 'apply pose' }).click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready: body 0/0/8°, linked arms raise/forward/elbow/wrist 10/0/20/0°',
    { timeout: 180_000 },
  );
  await expect(canvas).toHaveAttribute('data-linked-v2-browser-marker', 'same');
  expect(authenticatedPoseAssetFetches(requests)).toHaveLength(2);
});

test('keeps V4 independent controls touch-safe without horizontal overflow', async ({
  page,
}, testInfo) => {
  mobileOnly(testInfo);
  await page.goto('/__model-open-reference-preview-v1?basis=female&controls=full-body-v4');
  const unlink = page.getByRole('button', { name: 'unlink arms' });
  const unlinkBox = await unlink.boundingBox();
  expect(unlinkBox).not.toBeNull();
  expect(unlinkBox!.height).toBeGreaterThanOrEqual(44);
  await unlink.click();

  await expect(page.getByRole('slider')).toHaveCount(11);
  const leftRaise = page.getByRole('slider', { name: 'Left arm raise' });
  const sliderBox = await leftRaise.boundingBox();
  expect(sliderBox).not.toBeNull();
  expect(sliderBox!.height).toBeGreaterThanOrEqual(44);
  const linkFromLeft = page.getByRole('button', { name: 'link from left' });
  const linkBox = await linkFromLeft.boundingBox();
  expect(linkBox).not.toBeNull();
  expect(linkBox!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('keeps model tiles free of the retired 3D preview control', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/api/admin/model/list')
      ? {
          models: [storedModelFixture(1, 'Alex', 740), storedModelFixture(2, 'Morgan', 850)],
          total: 2,
        }
      : {};
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/__model-card-list-preview-v1');
  await expect(page.getByTestId('model-card-list-dev-page')).toBeVisible();
  await expect(page.getByTestId('model-card-list-item')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /3D preview/iu })).toHaveCount(0);
  await expect(page.locator('[data-testid^="model-card-mannequin-toggle-"]')).toHaveCount(0);
  await expect(page.getByTestId('model-card-mannequin-preview')).toHaveCount(0);
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toHaveCount(0);
  expect(authenticatedPoseAssetFetches(requests)).toEqual([]);

  await page.getByText('Alex', { exact: true }).click();
  await expect(page).toHaveURL(/\/models\/1$/u);
});
