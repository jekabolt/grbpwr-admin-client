import { createHash } from 'node:crypto';
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

interface WebGlContextProbe {
  created: number;
  live: number;
  lost: number;
  maxLive: number;
}

async function installWebGlContextProbe(page: Page) {
  await page.addInitScript(() => {
    const browserWindow = window as typeof window & {
      __modelCardWebGlContextProbe?: WebGlContextProbe;
    };
    const probe: WebGlContextProbe = { created: 0, live: 0, lost: 0, maxLive: 0 };
    browserWindow.__modelCardWebGlContextProbe = probe;
    const countedContexts = new WeakSet<object>();
    const lostContexts = new WeakSet<object>();
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    HTMLCanvasElement.prototype.getContext = function (
      ...args: Parameters<typeof originalGetContext>
    ) {
      const context = Reflect.apply(originalGetContext, this, args) as RenderingContext | null;
      const contextName = String(args[0]);
      if (
        context &&
        (contextName === 'webgl' ||
          contextName === 'webgl2' ||
          contextName === 'experimental-webgl') &&
        !countedContexts.has(context)
      ) {
        countedContexts.add(context);
        probe.created += 1;
        probe.live += 1;
        probe.maxLive = Math.max(probe.maxLive, probe.live);

        const webGlContext = context as WebGLRenderingContext;
        const extension = webGlContext.getExtension('WEBGL_lose_context');
        if (extension) {
          const originalLoseContext = extension.loseContext.bind(extension);
          extension.loseContext = () => {
            if (!lostContexts.has(context)) {
              lostContexts.add(context);
              probe.lost += 1;
              probe.live -= 1;
            }
            originalLoseContext();
          };
        }
      }
      return context;
    } as typeof originalGetContext;
  });
}

function readWebGlContextProbe(page: Page): Promise<WebGlContextProbe> {
  return page.evaluate(() => {
    const probe = (window as typeof window & { __modelCardWebGlContextProbe?: WebGlContextProbe })
      .__modelCardWebGlContextProbe;
    if (!probe) throw new Error('WebGL context probe was not installed.');
    return { ...probe };
  });
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

function storedCardPoseFixture(modelId: number) {
  const arm = {
    shoulderRaiseDegrees: 0,
    shoulderForwardDegrees: 0,
    elbowBendDegrees: 0,
    wristBendDegrees: 0,
  };
  const leg = { hipForwardDeg: 0, hipSideDeg: 0, kneeBendDeg: 0, ankleBendDeg: 0 };
  const pose = {
    bodyFlexionDegrees: 0,
    bodySideBendDegrees: 0,
    bodyTwistDegrees: 0,
    armMode: 'linked',
    leftArm: arm,
    rightArm: arm,
    headPitchDeg: 0,
    headYawDeg: 10,
    headSideDeg: 0,
    shoulderProtractionDeg: 0,
    shoulderElevationDeg: 0,
    shoulderLevelDeg: 0,
    legMode: 'linked',
    leftLeg: leg,
    rightLeg: leg,
  } as const;
  const canonicalSha256 = createHash('sha256')
    .update(
      JSON.stringify({
        schema: 'grbpwr.model-mannequin-pose/v2',
        poseSpace: 'makehuman-open-reference/direct-pose-v9',
        pose,
      }),
    )
    .digest('hex');
  return {
    modelId,
    revision: '11',
    updatedAt: '2026-11-15T00:00:00Z',
    updatedBy: 'browser-gate',
    pose: {
      schemaVersion: 2,
      poseSpace: 'MODEL_MANNEQUIN_POSE_SPACE_MAKEHUMAN_OPEN_REFERENCE_DIRECT_POSE_V9',
      bodyFlexionDegrees: pose.bodyFlexionDegrees,
      bodySideBendDegrees: pose.bodySideBendDegrees,
      bodyTwistDegrees: pose.bodyTwistDegrees,
      armMode: 'MODEL_MANNEQUIN_ARM_MODE_LINKED',
      leftArm: pose.leftArm,
      rightArm: pose.rightArm,
      headPitchDegrees: pose.headPitchDeg,
      headYawDegrees: pose.headYawDeg,
      headSideDegrees: pose.headSideDeg,
      shoulderProtractionDegrees: pose.shoulderProtractionDeg,
      shoulderElevationDegrees: pose.shoulderElevationDeg,
      shoulderLevelDegrees: pose.shoulderLevelDeg,
      legMode: 'MODEL_MANNEQUIN_LEG_MODE_LINKED',
      leftLeg: {
        hipForwardDegrees: pose.leftLeg.hipForwardDeg,
        hipSideDegrees: pose.leftLeg.hipSideDeg,
        kneeBendDegrees: pose.leftLeg.kneeBendDeg,
        ankleBendDegrees: pose.leftLeg.ankleBendDeg,
      },
      rightLeg: {
        hipForwardDegrees: pose.rightLeg.hipForwardDeg,
        hipSideDegrees: pose.rightLeg.hipSideDeg,
        kneeBendDegrees: pose.rightLeg.kneeBendDeg,
        ankleBendDegrees: pose.rightLeg.ankleBendDeg,
      },
      canonicalSha256,
    },
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

test('keeps exactly one on-demand mannequin active across real Models cards', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await installWebGlContextProbe(page);
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
  await expect(page.getByTestId('model-card-mannequin-preview')).toHaveCount(0);
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toHaveCount(0);
  expect(authenticatedPoseAssetFetches(requests)).toEqual([]);

  const alexToggle = page.getByRole('button', { name: 'mannequin preview for Alex', exact: true });
  await expect(alexToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(alexToggle).toHaveText('mannequin');
  const toggleBox = await alexToggle.boundingBox();
  expect(toggleBox).not.toBeNull();
  expect(toggleBox!.width).toBeGreaterThanOrEqual(44);
  expect(toggleBox!.height).toBeGreaterThanOrEqual(44);
  await alexToggle.click();
  await expect(alexToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(alexToggle).toHaveText('photo');
  const preview = page.getByTestId('model-card-mannequin-preview');
  await expect(preview).toHaveCount(1);
  await expect(preview).toHaveAttribute('data-model-id', '1');
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready.',
    { timeout: 180_000 },
  );
  const staticViewport = page.getByRole('img', { name: /Static front view/i });
  await expect(staticViewport).toHaveCount(1);
  await expect(staticViewport).not.toHaveAttribute('tabindex');
  await expect(staticViewport).not.toHaveAttribute('aria-label', /Drag|wheel|Keyboard/iu);
  expect(requests.filter((url) => /\/api\/admin\/model\/get(?:\?|$)/u.test(url))).toEqual([]);
  const firstCanvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(firstCanvas).toHaveCount(1);
  await expect.poll(async () => (await readWebGlContextProbe(page)).live).toBe(1);
  expect(await readWebGlContextProbe(page)).toMatchObject({ created: 1, live: 1, maxLive: 1 });
  await firstCanvas.evaluate((element) => element.setAttribute('data-model-card-marker', 'alex'));

  const morganToggle = page.getByRole('button', {
    name: 'mannequin preview for Morgan',
    exact: true,
  });
  await morganToggle.click();
  await expect(morganToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(alexToggle).toHaveAttribute('aria-pressed', 'false');
  await expect(preview).toHaveCount(1);
  await expect(preview).toHaveAttribute('data-model-id', '2');
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready',
    { timeout: 180_000 },
  );
  const secondCanvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(secondCanvas).toHaveCount(1);
  await expect(secondCanvas).not.toHaveAttribute('data-model-card-marker', 'alex');
  await expect.poll(async () => (await readWebGlContextProbe(page)).live).toBe(1);
  expect(await readWebGlContextProbe(page)).toMatchObject({
    created: 2,
    live: 1,
    lost: 1,
    maxLive: 1,
  });
  const cardPoseAssetFetches = authenticatedPoseAssetFetches(requests);
  expect(cardPoseAssetFetches).toHaveLength(2);
  expect(
    cardPoseAssetFetches.map((url) => POSE_ASSET_NAMES.find((name) => url.includes(name))).sort(),
  ).toEqual([...POSE_ASSET_NAMES].sort());

  await morganToggle.click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toHaveCount(0);
  await expect.poll(async () => (await readWebGlContextProbe(page)).live).toBe(0);
  expect(await readWebGlContextProbe(page)).toMatchObject({ lost: 2, maxLive: 1 });

  await alexToggle.click();
  await expect(preview).toHaveCount(1);
  await page.getByPlaceholder('search by name').fill('Alex');
  await expect(preview).toHaveCount(0);
  await expect(alexToggle).toHaveAttribute('aria-pressed', 'false');
});

test('renders the saved pose read-only in the on-demand Models card', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  let poseGets = 0;
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const body = pathname.endsWith('/api/admin/model/list')
      ? { models: [storedModelFixture(1, 'Alex', 740)], total: 1 }
      : pathname.endsWith('/api/admin/model/1/mannequin-pose')
        ? { storedPose: storedCardPoseFixture(1) }
        : {};
    if (pathname.endsWith('/api/admin/model/1/mannequin-pose')) poseGets += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/__model-card-list-preview-v1');
  await expect(page.getByTestId('model-card-mannequin-preview')).toHaveCount(0);
  expect(poseGets).toBe(0);

  await page.getByRole('button', { name: 'mannequin preview for Alex', exact: true }).click();
  const preview = page.getByTestId('model-card-mannequin-preview');
  await expect(preview).toHaveAttribute('data-pose-resource-status', 'found');
  await expect(preview).toHaveAttribute('data-pose-display', 'saved');
  await expect(page.getByTestId('model-open-reference-preview')).toHaveAttribute(
    'data-pose-controls',
    'full-body-v9',
  );
  await expect(page.getByTestId('model-open-reference-preview')).toHaveAttribute(
    'data-pose-draft',
    'custom',
  );
  await expect(page.getByTestId('model-open-reference-preview')).toHaveAttribute(
    'data-pose-viewport-editing',
    'disabled',
  );
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: custom full-body pose. Some entered measurement morphs were limited or not applied.',
    { timeout: 180_000 },
  );
  for (const testId of [
    'model-open-reference-side-seam-status',
    'model-open-reference-measurement-application-status',
  ]) {
    const status = page.getByTestId(testId);
    if ((await status.count()) > 0) await expect(status).toHaveClass(/\bsr-only\b/u);
  }
  const previewBox = await preview.boundingBox();
  const canvasBox = await preview
    .getByTestId('measurement-watertight-surface-v1-canvas')
    .boundingBox();
  expect(previewBox).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.y - previewBox!.y).toBeLessThanOrEqual(2);
  expect(canvasBox!.y + canvasBox!.height).toBeLessThanOrEqual(
    previewBox!.y + previewBox!.height + 1,
  );
  expect(canvasBox!.height).toBeGreaterThanOrEqual(previewBox!.height * 0.9);
  await expect(page.getByRole('button', { name: /save pose|reset pose|undo pose/iu })).toHaveCount(
    0,
  );
  expect(poseGets).toBe(1);
});

test('fails closed for duplicate and missing Models-card ids', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/api/admin/model/list')
      ? {
          models: [
            storedModelFixture(1, 'Duplicate A', 740),
            storedModelFixture(1, 'Duplicate B', 760),
            { ...storedModelFixture(3, 'Missing', 780), id: undefined },
            storedModelFixture(2, 'Valid', 850),
          ],
          total: 4,
        }
      : {};
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/__model-card-list-preview-v1');
  await expect(page.getByTestId('model-card-list-item')).toHaveCount(4);
  await expect(page.locator('[data-model-card-id-status="duplicate"]')).toHaveCount(2);
  await expect(page.locator('[data-model-card-id-status="invalid"]')).toHaveCount(1);
  await expect(page.locator('[data-model-card-id-status="valid"]')).toHaveCount(1);

  await expect(
    page.getByRole('button', {
      name: 'mannequin unavailable for Duplicate A: duplicate model ID',
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: 'mannequin unavailable for Duplicate B: duplicate model ID',
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'mannequin unavailable for Missing: invalid model ID' }),
  ).toBeDisabled();
  await expect(page.getByTestId('model-card-mannequin-preview')).toHaveCount(0);

  const validToggle = page.getByRole('button', {
    name: 'mannequin preview for Valid',
    exact: true,
  });
  await validToggle.click();
  await expect(validToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('model-card-mannequin-preview')).toHaveCount(1);
  await expect(page.getByTestId('model-card-mannequin-preview')).toHaveAttribute(
    'data-model-id',
    '2',
  );
});

test('keeps the Models-card mannequin toggle touch-safe on mobile', async ({ page }, testInfo) => {
  mobileOnly(testInfo);
  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/api/admin/model/list')
      ? { models: [storedModelFixture(1, 'Alex', 740)], total: 1 }
      : {};
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/__model-card-list-preview-v1');
  const toggle = page.getByRole('button', { name: 'mannequin preview for Alex', exact: true });
  const box = await toggle.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const initialUrl = page.url();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(page.url()).toBe(initialUrl);
});
