import { expect, test } from '@playwright/test';

const REQUIRED_CREATE_MEASUREMENTS = [
  ['height', '1720'],
  ['across shoulder', '420'],
  ['chest', '920'],
  ['waist', '740'],
  ['hip', '980'],
  ['sleeve length', '600'],
  ['inseam', '800'],
] as const;

const DEV_ROUTE = '/__model-form-personalized-preview-v1';
const PREWARM_QUIET_MS = 1_000;
const QUALITY_WORKER_MEASURE = 'measurement-open-reference-display-quality-worker/v1';
const LIMB_COMPOSITION_MEASURE = 'measurement-open-reference-limb-composition/v1';
const LIMB_WORKER_MEASURE = 'measurement-open-reference-limb-final-closure-worker/v1';
const BUILD_STAGE_MEASURE = 'model-open-reference-build-stage/v12';
const SURFACE_WORKER_MEASURE = 'measurement-watertight-surface-worker/v1';
const LIVE_SESSION_STAGE_MEASURE = 'makehuman-full-body-live-fk-session-stage/v5';
const SIDE_SEAM_WORKER_MEASURE = 'makehuman-arm-side-seam-assist-worker/v1';
const BETA_SHAPE_STAGE_MEASURE = 'measurement-open-reference-beta-shape-stage/v1';
const BETA_TORSO_WORKER_MEASURE = 'measurement-open-reference-beta-torso-worker/v1';
const KNEE_WORKER_MEASURE = 'measurement-open-reference-knee-proxy-worker/v1';

function v9PoseFromSourceRevision(sourceRevision: string | null): Record<string, unknown> {
  const encoded = sourceRevision?.match(/(?:^|;)editorPoseV9=([^;]+)/u)?.[1];
  if (!encoded) throw new Error('The V9 editor pose is missing from the source revision.');
  return JSON.parse(decodeURIComponent(encoded)) as Record<string, unknown>;
}

function numericLeaves(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(numericLeaves);
}

function expectArestV9Source(sourceRevision: string | null) {
  const pose = v9PoseFromSourceRevision(sourceRevision);
  expect(pose.armMode).toBe('linked');
  expect(pose.legMode).toBe('linked');
  expect(numericLeaves(pose).every((value) => value === 0)).toBe(true);
}

function retryablePrewarmFailure(reason: unknown): boolean {
  return (
    reason instanceof Error &&
    /ERR_NETWORK_IO_SUSPENDED|context|navigation|destroyed|Failed to fetch dynamically imported module|outdated optimize dep/i.test(
      reason.message,
    )
  );
}

async function mainFrameStayedQuiet(
  page: import('@playwright/test').Page,
  quietMs: number,
): Promise<boolean> {
  try {
    await page.waitForEvent('framenavigated', {
      predicate: (frame) => frame === page.mainFrame(),
      timeout: quietMs,
    });
    return false;
  } catch (reason: unknown) {
    if (reason instanceof Error && /timeout/i.test(reason.message)) return true;
    throw reason;
  }
}

async function prewarmDevRuntime(page: import('@playwright/test').Page) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
      await page.evaluate(async () => {
        const paths = [
          '/src/components/shared/measurement-watertight-surface-v1-stage.tsx',
          '/src/lib/cloth/body/measurement-open-reference-uniform-waist-hip-runtime-v1.ts',
          '/src/lib/cloth/body/measurement-open-reference-beta-shape-runtime-v1.ts',
          '/src/lib/cloth/body/makehuman-torso-shape-delta-bundle-v1.ts',
          '/src/lib/cloth/body/makehuman-clo-like-pose-display-v3.ts',
          '/src/lib/cloth/body/makehuman-full-body-local-fk-runtime-v4.ts',
          '/src/lib/cloth/body/makehuman-full-body-joint-overlay-runtime-v5.ts',
          '/src/lib/cloth/body/makehuman-full-body-live-fk-session-v5.ts',
          '/src/lib/cloth/body/makehuman-arm-body-part-ik-v1.ts',
          '/src/lib/cloth/body/makehuman-leg-body-part-ik-v1.ts',
          '/src/lib/cloth/body/makehuman-head-aim-ik-v1.ts',
          '/src/components/managers/model/components/model-open-reference-joint-ring-contract-v6.ts',
        ];
        await Promise.all(paths.map((path) => import(/* @vite-ignore */ path)));
      });
      if (await mainFrameStayedQuiet(page, PREWARM_QUIET_MS)) return;
    } catch (reason: unknown) {
      if (!retryablePrewarmFailure(reason) || attempt === 4) throw reason;
    }
  }
  throw new Error('Unable to prewarm the ModelForm V9 runtime modules deterministically.');
}

async function frontTorsoScreenshot(
  page: import('@playwright/test').Page,
  canvas: import('@playwright/test').Locator,
) {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  return page.screenshot({
    clip: {
      x: bounds.x + bounds.width * 0.29,
      y: bounds.y + bounds.height * 0.16,
      width: bounds.width * 0.42,
      height: bounds.height * 0.42,
    },
  });
}

test('real ModelForm auto-binds edit/create measurements to its V9 mannequin', async ({ page }) => {
  const mainFrameNavigations: string[] = [];
  const requests: Array<{ method: string; postData: string | null; url: string }> = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (request) => {
    requests.push({
      method: request.method(),
      postData: request.postData(),
      url: request.url(),
    });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) mainFrameNavigations.push(frame.url());
  });
  await prewarmDevRuntime(page);

  await page.goto(DEV_ROUTE);
  mainFrameNavigations.length = 0;
  requests.length = 0;
  consoleErrors.length = 0;
  pageErrors.length = 0;
  await expect(
    page.getByTestId('model-form-personalized-preview-dev-page').locator('form'),
  ).toBeVisible();
  await expect(page.getByTestId('model-form-smoke-model-id')).toHaveText('8401');
  await expect(page.getByTestId('model-open-reference-preview')).toHaveAttribute(
    'data-pose-controls',
    'full-body-v9',
  );
  await expect(page.getByTestId('model-open-reference-direct-pose-control-v9')).toBeVisible();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  const measurementApplication = page.getByTestId(
    'model-open-reference-measurement-application-status',
  );
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_CHEST',
  );
  await expect(canvas).toHaveAttribute('data-measurement-guide-status', 'visible');
  await expect(canvas).toHaveAttribute('data-measurement-guide-path-count', '1');
  await expect(canvas).toHaveAttribute('data-measurement-guide-visual-only', 'true');
  await expect(page.getByTestId('measurement-surface-active-guide-label')).toHaveText('chest');

  const waistGuideInput = page.getByRole('textbox', { name: 'waist', exact: true });
  await waistGuideInput.focus();
  await expect(canvas).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_WAIST',
  );
  await expect(canvas).toHaveAttribute('data-measurement-guide-status', 'visible');
  await expect(page.getByTestId('measurement-surface-active-guide-label')).toHaveText('waist');

  await page.getByRole('textbox', { name: 'inseam', exact: true }).focus();
  await expect(canvas).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_INSEAM',
  );
  await expect(canvas).toHaveAttribute('data-measurement-guide-status', 'unsupported');
  await expect(canvas).toHaveAttribute('data-measurement-guide-path-count', '0');
  await expect(page.getByTestId('measurement-surface-active-guide-label')).toHaveCount(0);

  await expect(measurementApplication).toHaveAttribute('data-application-status', 'partial');
  await expect(measurementApplication).toContainText(
    'limited by safe range: arm length centerline proxy',
  );
  await expect(measurementApplication).toContainText('not modeled: inseam');
  await expect(canvas).toHaveAttribute('data-joint-editor-mode', 'edit-pose');
  await expect(page.getByRole('button', { name: /apply pose/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'camera mode' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'edit pose mode' })).toHaveCount(0);

  await expect(page.getByRole('textbox', { name: 'name', exact: true })).toHaveValue(
    'receipt 84 alpha',
  );
  await expect(page.getByRole('combobox', { name: 'select' })).toContainText('women');
  for (const [label, value] of [
    ['bicep', '300'],
    ['wrist', '170'],
    ['calf', '370'],
    ['ankle', '230'],
  ] as const) {
    await expect(page.getByRole('textbox', { name: label, exact: true })).toHaveValue(value);
  }
  expect(requests.filter(({ url }) => new URL(url).pathname.startsWith('/api/'))).toEqual([]);

  const alphaSourceRevision = await canvas.getAttribute('data-source-revision');
  expect(alphaSourceRevision).toMatch(/inputHash=[0-9a-f]{8}/u);
  expect(alphaSourceRevision).not.toContain('input=');
  expect(alphaSourceRevision).toContain('measurement-open-reference-beta-shape-runtime/v1');
  expect(alphaSourceRevision).toMatch(/represented=[^;]*chestCircumferenceMm/u);
  expectArestV9Source(alphaSourceRevision);
  await page.mouse.move(0, 0);
  const baselineShape = await canvas.screenshot();
  const baselineFrontTorso = await frontTorsoScreenshot(page, canvas);

  const chest = page.getByRole('textbox', { name: 'chest', exact: true });
  await chest.fill('960');
  await chest.blur();
  await expect
    .poll(() => canvas.getAttribute('data-source-revision'))
    .not.toBe(alphaSourceRevision);
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  await expect(canvas).toBeVisible();
  const chestSourceRevision = await canvas.getAttribute('data-source-revision');
  expect(chestSourceRevision).toContain('measurement-open-reference-beta-shape-runtime/v1');
  expect(chestSourceRevision).toMatch(/represented=[^;]*chestCircumferenceMm/u);
  expectArestV9Source(chestSourceRevision);
  await expect(measurementApplication).toHaveAttribute('data-application-status', 'partial');
  await expect(measurementApplication).toHaveAttribute('data-applied', /chestCircumferenceMm/u);
  await page.mouse.move(0, 0);
  const chestShape = await canvas.screenshot();
  const chestFrontTorso = await frontTorsoScreenshot(page, canvas);
  expect(chestShape.equals(baselineShape)).toBe(false);
  expect(chestFrontTorso.equals(baselineFrontTorso)).toBe(false);

  await chest.fill('1040');
  await chest.blur();
  await expect
    .poll(() => canvas.getAttribute('data-source-revision'))
    .not.toBe(chestSourceRevision);
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  await expect(measurementApplication).toHaveAttribute('data-application-status', 'partial');
  await expect(measurementApplication).not.toHaveAttribute('data-applied', /chestCircumferenceMm/u);
  await expect(measurementApplication).toHaveAttribute('data-limited', /chestCircumferenceMm/u);
  await expect(measurementApplication).not.toHaveAttribute(
    'data-not-applied',
    /chestCircumferenceMm/u,
  );
  await expect(measurementApplication).toContainText('limited by safe range');

  await chest.fill('960');
  await chest.blur();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  await expect(measurementApplication).toHaveAttribute('data-application-status', 'partial');

  const acrossShoulder = page.getByRole('textbox', { name: 'across shoulder', exact: true });
  await acrossShoulder.fill('440');
  await acrossShoulder.blur();
  await expect
    .poll(() => canvas.getAttribute('data-source-revision'))
    .not.toBe(chestSourceRevision);
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  const shoulderSourceRevision = await canvas.getAttribute('data-source-revision');
  expect(shoulderSourceRevision).toContain('measurement-open-reference-beta-shape-runtime/v1');
  expect(shoulderSourceRevision).toMatch(/represented=[^;]*shoulderBreadthMm/u);
  expect(shoulderSourceRevision).toMatch(/represented=[^;]*chestCircumferenceMm/u);
  expectArestV9Source(shoulderSourceRevision);
  await page.mouse.move(0, 0);
  const shoulderShape = await canvas.screenshot();
  expect(shoulderShape.equals(chestShape)).toBe(false);

  const sleeveLength = page.getByRole('textbox', { name: 'sleeve length', exact: true });
  const beforeArmLengthSourceRevision = await canvas.getAttribute('data-source-revision');
  await sleeveLength.fill('560');
  await sleeveLength.blur();
  await expect
    .poll(() => canvas.getAttribute('data-source-revision'))
    .not.toBe(beforeArmLengthSourceRevision);
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  const shortArmSourceRevision = await canvas.getAttribute('data-source-revision');
  expect(shortArmSourceRevision).toContain('armLengthMm=limited-centerline-proxy');
  await expect(measurementApplication).toHaveAttribute('data-limited', /armLengthMm/u);
  await expect(measurementApplication).not.toHaveAttribute('data-not-applied', /armLengthMm/u);
  await expect(measurementApplication).toContainText('arm length centerline proxy');
  await page.mouse.move(0, 0);
  const shortArmShape = await canvas.screenshot();

  await sleeveLength.fill('640');
  await sleeveLength.blur();
  await expect
    .poll(() => canvas.getAttribute('data-source-revision'))
    .not.toBe(shortArmSourceRevision);
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  const longArmSourceRevision = await canvas.getAttribute('data-source-revision');
  expect(longArmSourceRevision).toContain('armLengthMm=limited-centerline-proxy');
  await page.mouse.move(0, 0);
  const longArmShape = await canvas.screenshot();
  expect(longArmShape.equals(shortArmShape)).toBe(false);

  await sleeveLength.fill('600');
  await sleeveLength.blur();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );

  const thigh = page.getByRole('textbox', { name: 'thigh', exact: true });
  const beforeThighSourceRevision = await canvas.getAttribute('data-source-revision');
  await thigh.fill('560');
  await thigh.blur();
  await expect
    .poll(() => canvas.getAttribute('data-source-revision'))
    .not.toBe(beforeThighSourceRevision);
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  const representedThighSourceRevision = await canvas.getAttribute('data-source-revision');
  expect(representedThighSourceRevision).toMatch(/represented=[^;]*thighCircumferenceMm/u);
  await expect(measurementApplication).toHaveAttribute('data-applied', /thighCircumferenceMm/u);
  await expect(measurementApplication).not.toHaveAttribute('data-limited', /thighCircumferenceMm/u);

  await thigh.fill('700');
  await thigh.blur();
  await expect
    .poll(() => canvas.getAttribute('data-source-revision'))
    .not.toBe(representedThighSourceRevision);
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  const limitedThighSourceRevision = await canvas.getAttribute('data-source-revision');
  expect(limitedThighSourceRevision).toContain('limited=armLengthMm,thighCircumferenceMm');
  await expect(measurementApplication).toHaveAttribute('data-limited', /thighCircumferenceMm/u);
  await expect(measurementApplication).not.toHaveAttribute(
    'data-not-applied',
    /thighCircumferenceMm/u,
  );
  await expect(measurementApplication).toContainText(
    'arm length centerline proxy, thigh circumference',
  );
  await expect(measurementApplication).not.toContainText('not modeled: thigh circumference');

  await thigh.fill('560');
  await thigh.blur();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );

  await page.getByRole('button', { name: 'switch to model beta' }).click();
  await expect(page.getByTestId('model-form-smoke-model-id')).toHaveText('8402');
  await expect(page.getByRole('textbox', { name: 'name', exact: true })).toHaveValue(
    'receipt 84 beta',
  );
  await expect(page.getByRole('textbox', { name: 'height', exact: true })).toHaveValue('1730');
  await expect(page.getByRole('combobox', { name: 'select' })).toContainText('men');
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  await expect(canvas).toBeVisible();

  await page.getByRole('button', { name: 'show create form' }).click();
  await expect(page.getByTestId('model-form-smoke-model-id')).toHaveText('create');
  await expect(page.getByRole('textbox', { name: 'name', exact: true })).toHaveValue('');
  await expect(page.getByText(/preview blocked/i)).toBeVisible();
  await expect(canvas).toHaveCount(0);
  for (const [label] of REQUIRED_CREATE_MEASUREMENTS) {
    await expect(page.getByRole('textbox', { name: label, exact: true })).toHaveValue('');
  }

  await page.getByRole('combobox', { name: 'select' }).click();
  await page.getByRole('option', { name: 'women' }).click();
  for (const [label, value] of REQUIRED_CREATE_MEASUREMENTS) {
    const input = page.getByRole('textbox', { name: label, exact: true });
    await input.fill(value);
    await input.blur();
  }
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  await expect(canvas).toBeVisible();

  expect(requests.filter(({ url }) => new URL(url).pathname.startsWith('/api/'))).toEqual([]);
  expect(
    requests.filter(({ method }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)),
  ).toEqual([]);
  expect(requests.map(({ postData }) => postData ?? '').join('\n')).not.toMatch(
    /(?:displayMesh|rendererDisplayMesh|positions|indices)/,
  );
  await expect(page.getByTestId('model-form-smoke-mutation-calls')).toHaveText('0');
  await expect(
    page.locator('input[name*="mesh"], textarea[name*="mesh"], input[name*="pose"]'),
  ).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(mainFrameNavigations).toEqual([]);
});

test('continuous measurement typing retains the last-valid V9 canvas until replacement is ready', async ({
  page,
}) => {
  await prewarmDevRuntime(page);
  await page.goto(DEV_ROUTE);

  const preview = page.getByTestId('model-open-reference-preview');
  const status = page.getByTestId('model-open-reference-preview-status');
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
  await expect(preview).toHaveAttribute('data-body-display-ownership', 'current');
  await expect(canvas).toHaveCSS('opacity', '1');
  const lastValidSourceRevision = await canvas.getAttribute('data-source-revision');
  expect(lastValidSourceRevision).toBeTruthy();

  await canvas.evaluate((node) => {
    const audit = { node, sawOpacityZero: false };
    (
      window as typeof window & {
        __modelFormRetainedCanvasAudit?: typeof audit;
      }
    ).__modelFormRetainedCanvasAudit = audit;
    const recordOpacity = () => {
      if (getComputedStyle(node).opacity === '0') audit.sawOpacityZero = true;
    };
    recordOpacity();
    new MutationObserver(recordOpacity).observe(node, {
      attributes: true,
      attributeFilter: ['style'],
    });
  });

  const chest = page.getByRole('textbox', { name: 'chest', exact: true });
  await chest.focus();
  await chest.selectText();
  await chest.pressSequentially('9');

  await expect(preview).toHaveAttribute('data-body-display-ownership', 'retained-invalid');
  const retainedStatus = page.getByTestId('model-open-reference-body-display-status');
  await expect(retainedStatus).toContainText('current entered values are not applied');
  await expect(retainedStatus).toHaveAttribute('role', 'status');
  await expect(status).toHaveAttribute('aria-hidden', 'true');
  await expect(status).not.toHaveAttribute('role', /.+/u);
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('data-source-revision', lastValidSourceRevision ?? '');
  await expect(canvas).toHaveCSS('opacity', '1');
  await expect(page.getByTestId('model-open-reference-measurement-application-status')).toHaveCount(
    0,
  );

  await chest.pressSequentially('60', { delay: 50 });
  await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
  await expect(preview).toHaveAttribute('data-body-display-ownership', 'current');
  await expect(retainedStatus).toHaveCount(0);
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).not.toHaveAttribute('aria-hidden', 'true');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveCSS('opacity', '1');
  await expect
    .poll(() => canvas.getAttribute('data-source-revision'))
    .not.toBe(lastValidSourceRevision);
  expect(
    await canvas.evaluate((node) => {
      const audit = (
        window as typeof window & {
          __modelFormRetainedCanvasAudit?: {
            node: Element;
            sawOpacityZero: boolean;
          };
        }
      ).__modelFormRetainedCanvasAudit;
      return {
        sameNode: audit?.node === node,
        sawOpacityZero: audit?.sawOpacityZero ?? true,
      };
    }),
  ).toEqual({ sameNode: true, sawOpacityZero: false });
});

test('rapid valid measurement edits coalesce while the quality gate leaves animation frames live', async ({
  page,
}) => {
  await prewarmDevRuntime(page);
  await page.goto(DEV_ROUTE);

  const preview = page.getByTestId('model-open-reference-preview');
  const status = page.getByTestId('model-open-reference-preview-status');
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
  const previousSourceRevision = await canvas.getAttribute('data-source-revision');
  expect(previousSourceRevision).toBeTruthy();

  await page.evaluate(
    ([
      measureName,
      limbMeasureName,
      limbWorkerMeasureName,
      buildStageMeasureName,
      surfaceWorkerMeasureName,
      liveSessionStageMeasureName,
      sideSeamWorkerMeasureName,
      betaShapeStageMeasureName,
      betaTorsoWorkerMeasureName,
    ]) => {
      performance.clearMeasures(measureName);
      performance.clearMeasures(limbMeasureName);
      performance.clearMeasures(limbWorkerMeasureName);
      performance.clearMeasures(buildStageMeasureName);
      performance.clearMeasures(surfaceWorkerMeasureName);
      performance.clearMeasures(liveSessionStageMeasureName);
      performance.clearMeasures(sideSeamWorkerMeasureName);
      performance.clearMeasures(betaShapeStageMeasureName);
      performance.clearMeasures(betaTorsoWorkerMeasureName);
      const audit = {
        active: true,
        frames: 0,
        lastAt: performance.now(),
        maximumGapMs: 0,
        gaps: [] as Array<{ startAt: number; endAt: number; gapMs: number }>,
      };
      (
        window as typeof window & {
          __modelFormWorkerFrameAudit?: typeof audit;
        }
      ).__modelFormWorkerFrameAudit = audit;
      const frame = (at: number) => {
        const gapMs = at - audit.lastAt;
        audit.frames += 1;
        audit.maximumGapMs = Math.max(audit.maximumGapMs, gapMs);
        audit.gaps.push({ startAt: audit.lastAt, endAt: at, gapMs });
        audit.lastAt = at;
        if (audit.active) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
    [
      QUALITY_WORKER_MEASURE,
      LIMB_COMPOSITION_MEASURE,
      LIMB_WORKER_MEASURE,
      BUILD_STAGE_MEASURE,
      SURFACE_WORKER_MEASURE,
      LIVE_SESSION_STAGE_MEASURE,
      SIDE_SEAM_WORKER_MEASURE,
      BETA_SHAPE_STAGE_MEASURE,
      BETA_TORSO_WORKER_MEASURE,
    ],
  );
  const startedAt = Date.now();

  const chest = page.getByRole('textbox', { name: 'chest', exact: true });
  for (const value of ['930', '940', '950', '960']) {
    await chest.fill(value);
    await page.waitForTimeout(20);
  }

  await expect(preview).toHaveAttribute('data-body-display-ownership', 'current', {
    timeout: 180_000,
  });
  await expect
    .poll(() => canvas.getAttribute('data-source-revision'), { timeout: 180_000 })
    .not.toBe(previousSourceRevision);
  const evidence = await page.evaluate(
    ([
      measureName,
      limbMeasureName,
      limbWorkerMeasureName,
      buildStageMeasureName,
      surfaceWorkerMeasureName,
      liveSessionStageMeasureName,
      sideSeamWorkerMeasureName,
      betaShapeStageMeasureName,
      betaTorsoWorkerMeasureName,
    ]) => {
      const audit = (
        window as typeof window & {
          __modelFormWorkerFrameAudit?: {
            active: boolean;
            frames: number;
            maximumGapMs: number;
            gaps: Array<{ startAt: number; endAt: number; gapMs: number }>;
          };
        }
      ).__modelFormWorkerFrameAudit;
      if (audit) audit.active = false;
      const measures = performance.getEntriesByName(measureName) as PerformanceMeasure[];
      const limbMeasures = performance.getEntriesByName(limbMeasureName) as PerformanceMeasure[];
      const limbWorkerMeasures = performance.getEntriesByName(
        limbWorkerMeasureName,
      ) as PerformanceMeasure[];
      const buildStageMeasures = performance.getEntriesByName(
        buildStageMeasureName,
      ) as PerformanceMeasure[];
      const backgroundMeasures = [
        surfaceWorkerMeasureName,
        liveSessionStageMeasureName,
        sideSeamWorkerMeasureName,
        betaShapeStageMeasureName,
        betaTorsoWorkerMeasureName,
      ].flatMap((name) =>
        (performance.getEntriesByName(name) as PerformanceMeasure[]).map((measure) => ({
          name,
          startTime: measure.startTime,
          durationMs: measure.duration,
          stage: (measure.detail as { stage?: string } | null)?.stage ?? null,
          workerDurationMs:
            (measure.detail as { workerDurationMs?: number } | null)?.workerDurationMs ?? null,
        })),
      );
      const workerGaps = (audit?.gaps ?? []).filter((gap) =>
        measures.some(
          (measure) =>
            gap.startAt < measure.startTime + measure.duration && gap.endAt > measure.startTime,
        ),
      );
      const maximumGap = (audit?.gaps ?? []).reduce<{
        startAt: number;
        endAt: number;
        gapMs: number;
      } | null>((largest, gap) => (!largest || gap.gapMs > largest.gapMs ? gap : largest), null);
      return {
        frames: audit?.frames ?? 0,
        maximumGapMs: audit?.maximumGapMs ?? Number.POSITIVE_INFINITY,
        maximumGap,
        workerFrameCount: workerGaps.length,
        maximumWorkerGapMs: Math.max(0, ...workerGaps.map(({ gapMs }) => gapMs)),
        workerJobs: measures.length,
        workerWallMs: measures.map((measure) => measure.duration),
        workerComputeMs: measures.map((measure) => {
          const detail = measure.detail as { workerDurationMs?: number } | null;
          return detail?.workerDurationMs ?? null;
        }),
        limbComposition: limbMeasures.map((measure) => ({
          durationMs: measure.duration,
          stage: (measure.detail as { stage?: string } | null)?.stage ?? 'unknown',
        })),
        limbWorker: limbWorkerMeasures.map((measure) => ({
          startTime: measure.startTime,
          durationMs: measure.duration,
          workerDurationMs:
            (measure.detail as { workerDurationMs?: number } | null)?.workerDurationMs ?? null,
        })),
        buildStages: buildStageMeasures.map((measure) => ({
          startTime: measure.startTime,
          durationMs: measure.duration,
          stage: (measure.detail as { stage?: string } | null)?.stage ?? 'unknown',
        })),
        backgroundMeasures,
      };
    },
    [
      QUALITY_WORKER_MEASURE,
      LIMB_COMPOSITION_MEASURE,
      LIMB_WORKER_MEASURE,
      BUILD_STAGE_MEASURE,
      SURFACE_WORKER_MEASURE,
      LIVE_SESSION_STAGE_MEASURE,
      SIDE_SEAM_WORKER_MEASURE,
      BETA_SHAPE_STAGE_MEASURE,
      BETA_TORSO_WORKER_MEASURE,
    ],
  );
  const report = {
    ...evidence,
    totalElapsedMs: Date.now() - startedAt,
  };
  console.info(`MANNEQUIN_WORKER_DEBOUNCE_V1=${JSON.stringify(report)}`);

  expect(evidence.workerJobs).toBe(1);
  expect(evidence.frames).toBeGreaterThan(5);
  expect(evidence.workerFrameCount).toBeGreaterThan(5);
  expect(evidence.maximumWorkerGapMs).toBeLessThan(100);
  expect(evidence.maximumGapMs).toBeLessThan(500);
  expect(evidence.workerComputeMs[0]).toBeGreaterThan(0);
  expect(
    evidence.backgroundMeasures.filter(({ name }) => name === BETA_TORSO_WORKER_MEASURE),
  ).toHaveLength(1);
  expect(
    evidence.backgroundMeasures.filter(({ name }) => name === SIDE_SEAM_WORKER_MEASURE),
  ).toHaveLength(1);
});

test('real ModelForm admits female, male and neutral open-reference bases', async ({ page }) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  const status = page.getByTestId('model-open-reference-preview-status');
  await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
  await expect(canvas).toHaveAttribute('data-source-revision', /basisKind=female/u);

  await page.getByRole('button', { name: 'switch to model beta' }).click();
  await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
  await expect(canvas).toHaveAttribute('data-source-revision', /basisKind=male/u);

  await page.getByRole('button', { name: 'show create form' }).click();
  await page.getByRole('combobox', { name: 'select' }).click();
  await page.getByRole('option', { name: 'unisex' }).click();
  for (const [label, value] of REQUIRED_CREATE_MEASUREMENTS) {
    const input = page.getByRole('textbox', { name: label, exact: true });
    await input.fill(value);
    await input.blur();
  }
  await expect(page.getByRole('textbox', { name: 'under bust', exact: true })).toBeVisible();
  await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
  await expect(canvas).toHaveAttribute('data-source-revision', /basisKind=neutral/u);
  await expect(status).not.toContainText('Preview failed');
});

type HighHipKneeFrameGapV1 = { startAt: number; endAt: number; gapMs: number };

async function startFrameGapAudit(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const startedAt = performance.now();
    const audit = {
      active: true,
      startedAt,
      lastAt: startedAt,
      maximumGapMs: 0,
      gaps: [] as HighHipKneeFrameGapV1[],
    };
    (window as typeof window & { __highHipKneeFrameAudit?: typeof audit }).__highHipKneeFrameAudit =
      audit;
    const frame = (at: number) => {
      const gapMs = at - audit.lastAt;
      audit.maximumGapMs = Math.max(audit.maximumGapMs, gapMs);
      audit.gaps.push({ startAt: audit.lastAt, endAt: at, gapMs });
      audit.lastAt = at;
      if (audit.active) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/**
 * Frame evidence for one edit: the torso and knee worker solves it ran, the longest frame gap
 * while either solve was in flight, and the longest gaps overall with the measures they overlap.
 */
async function stopFrameGapAudit(page: import('@playwright/test').Page) {
  return page.evaluate(
    ([torsoWorkerMeasureName, kneeWorkerMeasureName]) => {
      const audit = (
        window as typeof window & {
          __highHipKneeFrameAudit?: {
            active: boolean;
            startedAt: number;
            maximumGapMs: number;
            gaps: HighHipKneeFrameGapV1[];
          };
        }
      ).__highHipKneeFrameAudit;
      if (!audit) {
        return {
          maximumGapMs: Number.POSITIVE_INFINITY,
          workerSolveGapMs: Number.POSITIVE_INFINITY,
          torsoWorkerJobs: 0,
          kneeWorkerJobs: 0,
          longestGaps: [],
        };
      }
      audit.active = false;
      const measures = (performance.getEntriesByType('measure') as PerformanceMeasure[]).filter(
        (measure) => measure.startTime >= audit.startedAt,
      );
      const overlaps = (gap: HighHipKneeFrameGapV1, measure: PerformanceMeasure) =>
        measure.startTime < gap.endAt && measure.startTime + measure.duration > gap.startAt;
      const workerSolves = measures.filter(
        ({ name }) => name === torsoWorkerMeasureName || name === kneeWorkerMeasureName,
      );
      const longestGaps = audit.gaps
        .filter(({ gapMs }) => gapMs > 100)
        .sort((left, right) => right.gapMs - left.gapMs)
        .slice(0, 3)
        .map((gap) => ({
          gapMs: Math.round(gap.gapMs),
          overlaps: measures
            .filter((measure) => overlaps(gap, measure))
            .map((measure) => {
              const stage = (measure.detail as { stage?: string } | null)?.stage;
              return `${measure.name}${stage ? `:${stage}` : ''}=${Math.round(measure.duration)}`;
            }),
        }));
      return {
        maximumGapMs: audit.maximumGapMs,
        workerSolveGapMs: Math.max(
          0,
          ...audit.gaps
            .filter((gap) => workerSolves.some((measure) => overlaps(gap, measure)))
            .map(({ gapMs }) => gapMs),
        ),
        torsoWorkerJobs: workerSolves.filter(({ name }) => name === torsoWorkerMeasureName).length,
        kneeWorkerJobs: workerSolves.filter(({ name }) => name === kneeWorkerMeasureName).length,
        longestGaps,
      };
    },
    [BETA_TORSO_WORKER_MEASURE, KNEE_WORKER_MEASURE],
  );
}

async function appliedOrLimitedKeys(
  measurementApplication: import('@playwright/test').Locator,
): Promise<Set<string>> {
  const applied = (await measurementApplication.getAttribute('data-applied')) ?? '';
  const limited = (await measurementApplication.getAttribute('data-limited')) ?? '';
  return new Set([...applied.split(','), ...limited.split(',')].filter(Boolean));
}

async function exerciseHighHipAndKnee(page: import('@playwright/test').Page, basisKind: string) {
  const preview = page.getByTestId('model-open-reference-preview');
  const status = page.getByTestId('model-open-reference-preview-status');
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  const measurementApplication = page.getByTestId(
    'model-open-reference-measurement-application-status',
  );
  const inseam = page.getByRole('textbox', { name: 'inseam', exact: true });
  await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
  await expect(canvas).toHaveAttribute(
    'data-source-revision',
    new RegExp(`basisKind=${basisKind}`),
  );
  const frameAudits: Array<
    { edit: string; label: 'high hip' | 'knee' } & Awaited<ReturnType<typeof stopFrameGapAudit>>
  > = [];

  // The inseam guide draws no path, so canvas screenshots compare body geometry only.
  const bodyScreenshot = async () => {
    await inseam.focus();
    await expect(canvas).toHaveAttribute('data-measurement-guide-path-count', '0');
    await page.mouse.move(0, 0);
    return canvas.screenshot();
  };
  const edit = async (label: 'high hip' | 'knee', value: string) => {
    const before = await canvas.getAttribute('data-source-revision');
    const keysBefore = await appliedOrLimitedKeys(measurementApplication);
    await startFrameGapAudit(page);
    const input = page.getByRole('textbox', { name: label, exact: true });
    await input.fill(value);
    await input.blur();
    await expect
      .poll(() => canvas.getAttribute('data-source-revision'), { timeout: 180_000 })
      .not.toBe(before);
    await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
    await expect(preview).toHaveAttribute('data-body-display-ownership', 'current');
    frameAudits.push({ edit: `${label}=${value}`, label, ...(await stopFrameGapAudit(page)) });
    const keysAfter = await appliedOrLimitedKeys(measurementApplication);
    // Nothing that was applied before rolls back because of the new field.
    for (const key of keysBefore) expect(keysAfter.has(key), `${label} kept ${key}`).toBe(true);
    return { revision: await canvas.getAttribute('data-source-revision'), keysAfter };
  };

  const baselineKeys = await appliedOrLimitedKeys(measurementApplication);
  expect(baselineKeys.has('waistCircumferenceMm')).toBe(true);
  expect(baselineKeys.has('hipCircumferenceMm')).toBe(true);
  const baselineShape = await bodyScreenshot();

  const highHip = await edit('high hip', '870');
  expect(highHip.revision).toMatch(/(?:represented|limited)=[^;]*highHipCircumferenceMm/u);
  expect(highHip.keysAfter.has('highHipCircumferenceMm')).toBe(true);
  await expect(measurementApplication).not.toHaveAttribute(
    'data-not-applied',
    /highHipCircumferenceMm/u,
  );
  const highHipShape = await bodyScreenshot();
  expect(highHipShape.equals(baselineShape)).toBe(false);
  await page.getByRole('textbox', { name: 'high hip', exact: true }).focus();
  await expect(canvas).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_HIGH_HIP',
  );
  await expect(canvas).toHaveAttribute('data-measurement-guide-status', 'visible');

  const knee = await edit('knee', '380');
  expect(knee.revision).toMatch(/(?:represented|limited)=[^;]*kneeCircumferenceMm/u);
  expect(knee.keysAfter.has('kneeCircumferenceMm')).toBe(true);
  await expect(measurementApplication).not.toHaveAttribute(
    'data-not-applied',
    /kneeCircumferenceMm/u,
  );
  const kneeShape = await bodyScreenshot();
  expect(kneeShape.equals(highHipShape)).toBe(false);
  await page.getByRole('textbox', { name: 'knee', exact: true }).focus();
  await expect(canvas).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_KNEE',
  );
  await expect(canvas).toHaveAttribute('data-measurement-guide-status', 'visible');

  // Far outside the +/-10% deformation-safety bound: clamped and named, never hidden.
  await edit('high hip', '1300');
  await expect(measurementApplication).toHaveAttribute('data-limited', /highHipCircumferenceMm/u);
  await expect(measurementApplication).toContainText('limited by safe range');
  await expect(measurementApplication).toContainText('high hip circumference');
  await edit('knee', '600');
  await expect(measurementApplication).toHaveAttribute('data-limited', /kneeCircumferenceMm/u);
  await expect(measurementApplication).toContainText('knee circumference');
  await expect(measurementApplication).toHaveAttribute('data-limited', /highHipCircumferenceMm/u);
  await expect(status).not.toContainText('Preview failed');

  console.info(
    `MANNEQUIN_HIGH_HIP_KNEE_V1=${JSON.stringify({ basisKind, frameAudits, highHip: highHip.revision?.match(/represented=[^;]*/u)?.[0] ?? null })}`,
  );
  // Both new section solves ran on the worker path; the worker measure exists only there. Frame
  // timing is logged above as evidence. The frame budgets belong to the debounce test: across 12
  // edits on a loaded machine a renderer-wide stall (gaps that overlap no runtime stage) would
  // fail any per-edit bound here.
  for (const audit of frameAudits) {
    if (audit.label === 'high hip') expect(audit.torsoWorkerJobs, audit.edit).toBeGreaterThan(0);
    else expect(audit.kneeWorkerJobs, audit.edit).toBeGreaterThan(0);
  }
}

test('high hip and knee apply as bounded proxies on female, male and neutral bases', async ({
  page,
}) => {
  test.setTimeout(900_000);
  await prewarmDevRuntime(page);
  await page.goto(DEV_ROUTE);
  await exerciseHighHipAndKnee(page, 'female');

  await page.getByRole('button', { name: 'switch to model beta' }).click();
  await expect(page.getByTestId('model-form-smoke-model-id')).toHaveText('8402');
  await exerciseHighHipAndKnee(page, 'male');

  await page.getByRole('button', { name: 'show create form' }).click();
  await page.getByRole('combobox', { name: 'select' }).click();
  await page.getByRole('option', { name: 'unisex' }).click();
  for (const [label, value] of REQUIRED_CREATE_MEASUREMENTS) {
    const input = page.getByRole('textbox', { name: label, exact: true });
    await input.fill(value);
    await input.blur();
  }
  await exerciseHighHipAndKnee(page, 'neutral');
});
