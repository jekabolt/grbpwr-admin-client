import { expect, test, type Locator, type Page } from '@playwright/test';

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

// Desktop model form shows one measurement group at a time; hidden groups stay mounted.
function measurementField(page: Page, label: string): Locator {
  return page.getByRole('textbox', { name: label, exact: true, includeHidden: true });
}

async function revealMeasurement(page: Page, input: Locator) {
  const group = page.locator('[data-measurement-group]', { has: input });
  if ((await group.count()) === 0 || !(await group.isHidden())) return;
  const title = await group.getAttribute('aria-label');
  await page
    .getByRole('radiogroup', { name: 'measurement group' })
    .getByRole('radio', { name: new RegExp(`^${title} \\d+/\\d+$`) })
    .click();
  await expect(input).toBeVisible();
}

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

  const waistGuideInput = measurementField(page, 'waist');
  await revealMeasurement(page, waistGuideInput);
  await waistGuideInput.focus();
  await expect(canvas).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_WAIST',
  );
  await expect(canvas).toHaveAttribute('data-measurement-guide-status', 'visible');
  await expect(page.getByTestId('measurement-surface-active-guide-label')).toHaveText('waist');

  await revealMeasurement(page, measurementField(page, 'inseam'));
  await measurementField(page, 'inseam').focus();
  await expect(canvas).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_INSEAM',
  );
  // Inseam draws an x-ray line from the crotch to the floor: a visual guide, not a measured path.
  await expect(canvas).toHaveAttribute('data-measurement-guide-status', 'limited');
  await expect(canvas).toHaveAttribute('data-measurement-guide-path-count', '1');
  await expect(canvas).toHaveAttribute('data-measurement-guide-air', 'x-ray');
  await expect(page.getByTestId('measurement-surface-active-guide-label')).toHaveText('inseam');

  await expect(measurementApplication).toHaveAttribute('data-application-status', 'partial');
  await expect(measurementApplication).toContainText(
    'limited by safe range: arm length centerline proxy',
  );
  await expect(measurementApplication).toContainText('not modeled: inseam');
  // `edit pose` is off by default: no joint editor on the canvas until the checkbox is on.
  const editPose = page.getByRole('checkbox', { name: 'edit pose', exact: true });
  await expect(editPose).not.toBeChecked();
  await expect(canvas).toHaveAttribute('data-joint-editor-mode', 'off');
  await editPose.check();
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
    await expect(measurementField(page, label)).toHaveValue(value);
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

  const chest = measurementField(page, 'chest');
  await revealMeasurement(page, chest);
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

  await revealMeasurement(page, chest);
  // The female bust proxy with a proportional ribcage reaches ~1100 mm without an under bust, so
  // the safe-range probe sits above that (it was 1040 on the pre-bust legacy chest path).
  await chest.fill('1200');
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

  await revealMeasurement(page, chest);
  await chest.fill('960');
  await chest.blur();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  await expect(measurementApplication).toHaveAttribute('data-application-status', 'partial');

  const acrossShoulder = measurementField(page, 'across shoulder');
  await revealMeasurement(page, acrossShoulder);
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

  const sleeveLength = measurementField(page, 'sleeve length');
  const beforeArmLengthSourceRevision = await canvas.getAttribute('data-source-revision');
  await revealMeasurement(page, sleeveLength);
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

  await revealMeasurement(page, sleeveLength);
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

  await revealMeasurement(page, sleeveLength);
  await sleeveLength.fill('600');
  await sleeveLength.blur();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );

  const thigh = measurementField(page, 'thigh');
  const beforeThighSourceRevision = await canvas.getAttribute('data-source-revision');
  await revealMeasurement(page, thigh);
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

  await revealMeasurement(page, thigh);
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

  await revealMeasurement(page, thigh);
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
  await expect(measurementField(page, 'height')).toHaveValue('1730');
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
    await expect(measurementField(page, label)).toHaveValue('');
  }

  await page.getByRole('combobox', { name: 'select' }).click();
  await page.getByRole('option', { name: 'women' }).click();
  for (const [label, value] of REQUIRED_CREATE_MEASUREMENTS) {
    const input = measurementField(page, label);
    await revealMeasurement(page, input);
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

  const chest = measurementField(page, 'chest');
  await revealMeasurement(page, chest);
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

  const chest = measurementField(page, 'chest');
  for (const value of ['930', '940', '950', '960']) {
    await revealMeasurement(page, chest);
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
    const input = measurementField(page, label);
    await revealMeasurement(page, input);
    await input.fill(value);
    await input.blur();
  }
  await revealMeasurement(page, measurementField(page, 'under bust'));
  await expect(measurementField(page, 'under bust')).toBeVisible();
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
  const wrist = measurementField(page, 'wrist');
  await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
  await expect(canvas).toHaveAttribute(
    'data-source-revision',
    new RegExp(`basisKind=${basisKind}`),
  );
  const frameAudits: Array<
    { edit: string; label: 'high hip' | 'knee' } & Awaited<ReturnType<typeof stopFrameGapAudit>>
  > = [];

  // Every field draws a line now; the wrist ring sits far from every edited region and follows
  // the same mesh, so canvas screenshots still differ only where the body geometry does.
  const bodyScreenshot = async () => {
    await revealMeasurement(page, wrist);
    await wrist.focus();
    await expect(canvas).toHaveAttribute(
      'data-active-measurement-guide',
      'BODY_MEASUREMENT_NAME_WRIST',
    );
    await expect(canvas).toHaveAttribute('data-measurement-guide-view', 'front');
    await page.mouse.move(0, 0);
    return canvas.screenshot();
  };
  const edit = async (label: 'high hip' | 'knee', value: string) => {
    const before = await canvas.getAttribute('data-source-revision');
    const keysBefore = await appliedOrLimitedKeys(measurementApplication);
    await startFrameGapAudit(page);
    const input = measurementField(page, label);
    await revealMeasurement(page, input);
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
  const highHipField = measurementField(page, 'high hip');
  await revealMeasurement(page, highHipField);
  await highHipField.focus();
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
  const kneeField = measurementField(page, 'knee');
  await revealMeasurement(page, kneeField);
  await kneeField.focus();
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
    const input = measurementField(page, label);
    await revealMeasurement(page, input);
    await input.fill(value);
    await input.blur();
  }
  await exerciseHighHipAndKnee(page, 'neutral');
});

const NECK_SHOTS_DIR = '../tmp/plans/mannequin-beta/shots';

async function exerciseNeck(page: import('@playwright/test').Page, basisKind: string) {
  const preview = page.getByTestId('model-open-reference-preview');
  const status = page.getByTestId('model-open-reference-preview-status');
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  const measurementApplication = page.getByTestId(
    'model-open-reference-measurement-application-status',
  );
  const wrist = measurementField(page, 'wrist');
  await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
  await expect(canvas).toHaveAttribute(
    'data-source-revision',
    new RegExp(`basisKind=${basisKind}`),
  );
  // Every field draws a line now; the wrist ring sits far from every edited region and follows
  // the same mesh, so canvas screenshots still differ only where the body geometry does.
  const bodyScreenshot = async () => {
    await revealMeasurement(page, wrist);
    await wrist.focus();
    await expect(canvas).toHaveAttribute(
      'data-active-measurement-guide',
      'BODY_MEASUREMENT_NAME_WRIST',
    );
    await expect(canvas).toHaveAttribute('data-measurement-guide-view', 'front');
    await page.mouse.move(0, 0);
    return canvas.screenshot();
  };
  const edit = async (label: 'neck' | 'neck base', value: string) => {
    const before = await canvas.getAttribute('data-source-revision');
    const keysBefore = await appliedOrLimitedKeys(measurementApplication);
    const input = measurementField(page, label);
    await revealMeasurement(page, input);
    await input.fill(value);
    await input.blur();
    await expect
      .poll(() => canvas.getAttribute('data-source-revision'), { timeout: 180_000 })
      .not.toBe(before);
    await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
    await expect(preview).toHaveAttribute('data-body-display-ownership', 'current');
    const keysAfter = await appliedOrLimitedKeys(measurementApplication);
    for (const key of keysBefore) expect(keysAfter.has(key), `${label} kept ${key}`).toBe(true);
    return { revision: await canvas.getAttribute('data-source-revision'), keysAfter };
  };

  // Neck base stays honestly unsupported (listed by label) and is never derived from neck.
  await edit('neck base', '370');
  await expect(measurementApplication).toHaveAttribute(
    'data-unsupported',
    /neck base circumference/u,
  );
  const baselineShape = await bodyScreenshot();

  const neck = await edit('neck', '310');
  await expect(measurementApplication).toHaveAttribute(
    'data-unsupported',
    /neck base circumference/u,
  );
  const neckShape = await bodyScreenshot();
  const neckField = measurementField(page, 'neck');
  await revealMeasurement(page, neckField);
  await neckField.focus();
  await expect(canvas).toHaveAttribute(
    'data-active-measurement-guide',
    'BODY_MEASUREMENT_NAME_NECK',
  );
  await page.mouse.move(0, 0);
  const guideStatus = await canvas.getAttribute('data-measurement-guide-status');
  await canvas.screenshot({ path: `${NECK_SHOTS_DIR}/neck-client-${basisKind}.png` });

  if (basisKind === 'male') {
    // Male neck station is too close to the head joint: honest notApplied, unchanged neck.
    expect(neck.keysAfter.has('neckCircumferenceMm')).toBe(false);
    await expect(measurementApplication).toHaveAttribute(
      'data-not-applied',
      /neckCircumferenceMm/u,
    );
    expect(neckShape.equals(baselineShape)).toBe(true);
  } else {
    expect(neck.revision).toMatch(/(?:represented|limited)=[^;]*neckCircumferenceMm/u);
    expect(neck.keysAfter.has('neckCircumferenceMm')).toBe(true);
    await expect(measurementApplication).not.toHaveAttribute(
      'data-not-applied',
      /neckCircumferenceMm/u,
    );
    expect(neckShape.equals(baselineShape)).toBe(false);
    expect(guideStatus).toBe('visible');
  }
  await expect(status).not.toContainText('Preview failed');
  console.info(
    `MANNEQUIN_NECK_V1=${JSON.stringify({
      basisKind,
      applied: neck.keysAfter.has('neckCircumferenceMm'),
      limited: ((await measurementApplication.getAttribute('data-limited')) ?? '').includes(
        'neckCircumferenceMm',
      ),
      guideStatus,
    })}`,
  );
}

test('neck applies as a bounded proxy on female and neutral, and is honestly not applied on male', async ({
  page,
}) => {
  test.setTimeout(900_000);
  await prewarmDevRuntime(page);
  await page.goto(DEV_ROUTE);
  await exerciseNeck(page, 'female');

  await page.getByRole('button', { name: 'switch to model beta' }).click();
  await expect(page.getByTestId('model-form-smoke-model-id')).toHaveText('8402');
  await exerciseNeck(page, 'male');

  await page.getByRole('button', { name: 'show create form' }).click();
  await page.getByRole('combobox', { name: 'select' }).click();
  await page.getByRole('option', { name: 'unisex' }).click();
  for (const [label, value] of REQUIRED_CREATE_MEASUREMENTS) {
    const input = measurementField(page, label);
    await revealMeasurement(page, input);
    await input.fill(value);
    await input.blur();
  }
  await exerciseNeck(page, 'neutral');
});

async function exerciseBust(page: import('@playwright/test').Page, basisKind: 'female' | 'male') {
  const preview = page.getByTestId('model-open-reference-preview');
  const status = page.getByTestId('model-open-reference-preview-status');
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  const measurementApplication = page.getByTestId(
    'model-open-reference-measurement-application-status',
  );
  await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
  await expect(canvas).toHaveAttribute(
    'data-source-revision',
    new RegExp(`basisKind=${basisKind}`),
  );
  const edit = async (label: 'chest' | 'under bust', value: string) => {
    const before = await canvas.getAttribute('data-source-revision');
    const input = measurementField(page, label);
    await revealMeasurement(page, input);
    await input.fill(value);
    await input.blur();
    await expect
      .poll(() => canvas.getAttribute('data-source-revision'), { timeout: 180_000 })
      .not.toBe(before);
    await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
    await expect(preview).toHaveAttribute('data-body-display-ownership', 'current');
    return {
      applied: (await measurementApplication.getAttribute('data-applied')) ?? '',
      limited: (await measurementApplication.getAttribute('data-limited')) ?? '',
    };
  };
  const chest = await edit('chest', '835');
  const underBust = await edit('under bust', '720');
  const wide = await edit('chest', '1000');
  console.info(`MANNEQUIN_BUST_V1=${JSON.stringify({ basisKind, chest, underBust, wide })}`);
  if (basisKind === 'female') {
    expect(underBust.applied).toMatch(/chestCircumferenceMm/u);
    expect(underBust.limited).not.toMatch(/chestCircumferenceMm/u);
    expect(`${underBust.applied},${underBust.limited}`).toMatch(/underBustCircumferenceMm/u);
    // Beyond the bust range: clamped and named, never hidden, never a whole-body rollback.
    expect(wide.limited).toMatch(/chestCircumferenceMm/u);
    expect(wide.applied).toMatch(/waistCircumferenceMm/u);
    expect(`${wide.applied},${wide.limited}`).toMatch(/underBustCircumferenceMm/u);
  } else {
    expect(`${underBust.applied},${underBust.limited}`).toMatch(/chestCircumferenceMm/u);
    expect(`${wide.applied},${wide.limited}`).toMatch(/chestCircumferenceMm/u);
    expect(wide.applied).toMatch(/waistCircumferenceMm/u);
  }
  await expect(status).not.toContainText('Preview failed');
}

test('female chest and under bust reshape the bust; male keeps its chest path', async ({
  page,
}) => {
  test.setTimeout(900_000);
  await prewarmDevRuntime(page);
  await page.goto(DEV_ROUTE);
  await exerciseBust(page, 'female');

  await page.getByRole('button', { name: 'switch to model beta' }).click();
  await expect(page.getByTestId('model-form-smoke-model-id')).toHaveText('8402');
  await exerciseBust(page, 'male');
});

// Report section 8: a line "reads" when at least 90 highlight-blue px show in the 1440x1000 canvas.
async function canvasPixelStats(
  page: import('@playwright/test').Page,
  canvas: import('@playwright/test').Locator,
  baseline?: string,
) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const png = (await canvas.screenshot()).toString('base64');
  return page.evaluate(
    async ({ png, baseline }) => {
      const decode = async (data: string) => {
        const bitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${data}`)).blob(),
        );
        const scratch = document.createElement('canvas');
        scratch.width = bitmap.width;
        scratch.height = bitmap.height;
        const context = scratch.getContext('2d')!;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const image = await decode(png);
      const margin = 10;
      let blue = 0;
      for (let y = margin; y < image.height - margin; y += 1) {
        for (let x = margin; x < image.width - margin; x += 1) {
          const offset = (y * image.width + x) * 4;
          const [r, g, b] = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
          if (b > 140 && b - r > 70 && b - g > 70) blue += 1;
        }
      }
      let changedFraction = null as number | null;
      if (baseline) {
        const other = await decode(baseline);
        let changed = 0;
        for (let offset = 0; offset < image.data.length; offset += 4) {
          const delta =
            Math.abs(image.data[offset] - other.data[offset]) +
            Math.abs(image.data[offset + 1] - other.data[offset + 1]) +
            Math.abs(image.data[offset + 2] - other.data[offset + 2]);
          if (delta > 48) changed += 1;
        }
        changedFraction = changed / (image.data.length / 4);
      }
      return { blue, changedFraction, png };
    },
    { png, baseline },
  );
}

async function guideFrameGaps(
  page: import('@playwright/test').Page,
  canvas: import('@playwright/test').Locator,
) {
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.5);
  return page.evaluate(async () => {
    const target = document.querySelector<HTMLCanvasElement>(
      '[data-testid="measurement-watertight-surface-v1-canvas"]',
    )!;
    const gaps: number[] = [];
    let last = performance.now();
    for (let frame = 0; frame < 90; frame += 1) {
      target.dispatchEvent(
        new WheelEvent('wheel', { deltaY: frame % 2 ? 40 : -40, bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      gaps.push(now - last);
      last = now;
    }
    gaps.sort((a, b) => a - b);
    return {
      p50: Number(gaps[Math.floor(gaps.length * 0.5)].toFixed(2)),
      p95: Number(gaps[Math.floor(gaps.length * 0.95)].toFixed(2)),
    };
  });
}

interface GuideLineCheck {
  readonly label: string;
  readonly name: string;
  readonly status: 'visible' | 'limited';
  readonly view: 'front' | 'back' | 'side';
  readonly air: string;
  readonly minBlueDesktop: number;
  readonly minBluePhone: number;
}

// Thresholds sit at about half of the female blue px measured for guide-v4 at DPR 2 (shots JSON).
const GUIDE_V4_LINES: readonly GuideLineCheck[] = [
  {
    label: 'neck base',
    name: 'BODY_MEASUREMENT_NAME_NECK_BASE',
    status: 'limited',
    view: 'front',
    air: 'none',
    minBlueDesktop: 330,
    minBluePhone: 240,
  },
  {
    label: 'inseam',
    name: 'BODY_MEASUREMENT_NAME_INSEAM',
    status: 'limited',
    view: 'front',
    air: 'x-ray',
    minBlueDesktop: 1500,
    minBluePhone: 1270,
  },
  {
    label: 'hps height',
    name: 'BODY_MEASUREMENT_NAME_HPS_HEIGHT',
    status: 'visible',
    view: 'front',
    air: 'none',
    minBlueDesktop: 2650,
    minBluePhone: 1870,
  },
  {
    label: 'hps to waist (front)',
    name: 'BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT',
    status: 'limited',
    view: 'front',
    air: 'none',
    minBlueDesktop: 560,
    minBluePhone: 390,
  },
  {
    label: 'shoulder length',
    name: 'BODY_MEASUREMENT_NAME_SHOULDER_LENGTH',
    status: 'limited',
    view: 'front',
    air: 'none',
    minBlueDesktop: 190,
    minBluePhone: 150,
  },
  {
    label: 'shoulder drop',
    name: 'BODY_MEASUREMENT_NAME_SHOULDER_DROP',
    status: 'limited',
    view: 'front',
    air: 'caliper',
    minBlueDesktop: 450,
    minBluePhone: 360,
  },
  {
    label: 'armscye depth',
    name: 'BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH',
    status: 'limited',
    view: 'back',
    air: 'caliper',
    minBlueDesktop: 480,
    minBluePhone: 370,
  },
  {
    label: 'armscye circumference',
    name: 'BODY_MEASUREMENT_NAME_ARMSCYE_CIRCUMFERENCE',
    status: 'limited',
    view: 'front',
    air: 'none',
    minBlueDesktop: 225,
    minBluePhone: 175,
  },
  {
    label: 'hps to bust apex',
    name: 'BODY_MEASUREMENT_NAME_HPS_TO_BUST_APEX',
    status: 'limited',
    view: 'front',
    air: 'none',
    minBlueDesktop: 330,
    minBluePhone: 245,
  },
  {
    label: 'bust apex to apex',
    name: 'BODY_MEASUREMENT_NAME_BUST_APEX_TO_APEX',
    status: 'limited',
    view: 'front',
    air: 'none',
    minBlueDesktop: 440,
    minBluePhone: 310,
  },
];

// Lines the owner reported as wrong or barely visible on the phone (17.11), checked there too.
const PHONE_LINES: readonly GuideLineCheck[] = [
  {
    label: 'chest',
    name: 'BODY_MEASUREMENT_NAME_CHEST',
    status: 'visible',
    view: 'front',
    air: 'none',
    minBlueDesktop: 600,
    minBluePhone: 420,
  },
  {
    label: 'across shoulder',
    name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER',
    status: 'limited',
    view: 'front',
    air: 'x-ray',
    minBlueDesktop: 480,
    minBluePhone: 445,
  },
  {
    label: 'sleeve length',
    name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH',
    status: 'limited',
    view: 'back',
    air: 'x-ray',
    minBlueDesktop: 900,
    minBluePhone: 780,
  },
];

/**
 * Posed wrist ring at DPR 2 on the dev page: 183 px with the 2 mm lift off the skin, 150 px with
 * bare vertices tied in depth with the skin. The floor sits between them so a lost lift fails.
 */
const POSED_WRIST_MIN_BLUE = 165;
const PHONE_REST_STAGE = [318, 328] as const;
const PHONE_TYPING_STAGE = [390, 410] as const;

test.describe('guide lines at DPR 2', () => {
  test.use({ deviceScaleFactor: 2 });

  test('hidden measurement lines read through the body and from their own view', async ({
    page,
  }) => {
    test.setTimeout(600_000);
    await prewarmDevRuntime(page);
    await page.goto(DEV_ROUTE);
    const status = page.getByTestId('model-open-reference-preview-status');
    const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
    await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
    await expect(canvas).toHaveAttribute('data-source-revision', /basisKind=female/u);
    await expect(canvas).toHaveAttribute('data-view-preset', 'front');

    const focusField = async (label: string, name: string) => {
      const input = measurementField(page, label);
      await revealMeasurement(page, input);
      await input.focus();
      await expect(canvas).toHaveAttribute('data-active-measurement-guide', name);
      await page.mouse.move(0, 0);
      return input;
    };

    // Front surface ring: the owner's own camera, for the blur comparison and the frame-time
    // baseline (every field draws a line now, so no guide-free field is left).
    await focusField('wrist', 'BODY_MEASUREMENT_NAME_WRIST');
    await expect(canvas).toHaveAttribute('data-measurement-guide-view', 'front');
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera', 'owner');
    await expect(canvas).toHaveAttribute('data-measurement-guide-air', 'none');
    const ownerFrame = await canvasPixelStats(page, canvas);
    const framesWithoutGuide = await guideFrameGaps(page, canvas);
    await page.mouse.move(0, 0);

    // X-ray class: the chord through the torso reads, the camera stays where the owner left it.
    await focusField('across shoulder', 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER');
    await expect(canvas).toHaveAttribute('data-measurement-guide-air', 'x-ray');
    await expect(canvas).toHaveAttribute('data-measurement-guide-view', 'front');
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera', 'owner');
    const acrossShoulder = await canvasPixelStats(page, canvas);
    expect(acrossShoulder.blue, 'across shoulder blue px').toBeGreaterThanOrEqual(90);
    const framesWithXRay = await guideFrameGaps(page, canvas);
    await page.mouse.move(0, 0);

    // Back-view class: focus turns to the back, blur returns to the owner's front camera.
    const cbField = await focusField('cb neck to waist', 'BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST');
    await expect(canvas).toHaveAttribute('data-measurement-guide-view', 'back');
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera', 'turned-back');
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera-motion', 'still');
    await expect(canvas).toHaveAttribute('data-view-preset', 'front');
    const cbNeckToWaist = await canvasPixelStats(page, canvas);
    expect(cbNeckToWaist.blue, 'cb neck to waist blue px').toBeGreaterThanOrEqual(90);
    await cbField.blur();
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera', 'owner');
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera-motion', 'still');
    await focusField('wrist', 'BODY_MEASUREMENT_NAME_WRIST');
    const restored = await canvasPixelStats(page, canvas, ownerFrame.png);
    expect(restored.changedFraction, 'camera back where the owner left it').toBeLessThan(0.005);

    // Side-view caliper class: the depth reads across the body from the side.
    await focusField('chest depth', 'BODY_MEASUREMENT_NAME_CHEST_DEPTH');
    await expect(canvas).toHaveAttribute('data-measurement-guide-air', 'caliper');
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera', 'turned-side');
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera-motion', 'still');
    const chestDepth = await canvasPixelStats(page, canvas);
    expect(chestDepth.blue, 'chest depth blue px').toBeGreaterThanOrEqual(90);
    const framesWithCaliper = await guideFrameGaps(page, canvas);

    // guide-v4: the lines the owner could not see on 17.11, each from its own view. The first one
    // comes straight after the side-view chest depth: a field without a back/side view faces the
    // front again.
    const newLines: Record<string, number> = {};
    for (const line of GUIDE_V4_LINES) {
      await focusField(line.label, line.name);
      await expect(canvas).toHaveAttribute('data-measurement-guide-status', line.status);
      await expect(canvas).toHaveAttribute('data-measurement-guide-view', line.view);
      await expect(canvas).toHaveAttribute('data-measurement-guide-air', line.air);
      await expect(canvas).toHaveAttribute('data-measurement-guide-camera-motion', 'still');
      await expect(canvas).toHaveAttribute(
        'data-camera-facing',
        line.view === 'back' ? 'back' : 'front',
      );
      const stats = await canvasPixelStats(page, canvas);
      newLines[line.label] = stats.blue;
      expect(stats.blue, `${line.label} blue px`).toBeGreaterThanOrEqual(line.minBlueDesktop);
    }

    console.info(
      `MANNEQUIN_GUIDE_LINES_V3=${JSON.stringify({
        blue: {
          acrossShoulder: acrossShoulder.blue,
          cbNeckToWaist: cbNeckToWaist.blue,
          chestDepth: chestDepth.blue,
          ...newLines,
        },
        restoredChangedFraction: restored.changedFraction,
        frameGapsMs: { framesWithoutGuide, framesWithXRay, framesWithCaliper },
      })}`,
    );
  });

  test('measurement lines read on a phone portrait stage while a field is typed', async ({
    page,
  }) => {
    test.setTimeout(600_000);
    const rest = { width: 390, height: 844 };
    await page.setViewportSize(rest);
    await prewarmDevRuntime(page);
    await page.goto(DEV_ROUTE);
    const status = page.getByTestId('model-open-reference-preview-status');
    const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
    await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
    await expect(canvas).toHaveAttribute('data-source-revision', /basisKind=female/u);
    // Keyboard down: the dev page's phone stage at rest (the unit test's phone stage).
    const restBox = (await canvas.boundingBox())!;
    expect(Math.round(restBox.width)).toBe(PHONE_REST_STAGE[0]);
    expect(Math.round(restBox.height)).toBe(PHONE_REST_STAGE[1]);

    const blue: Record<string, number> = {};
    let typingStage: [number, number] | null = null;
    for (const line of [...PHONE_LINES, ...GUIDE_V4_LINES]) {
      await page.setViewportSize(rest);
      const input = measurementField(page, line.label);
      await revealMeasurement(page, input);
      // Keyboard up, emulated as in the quiz spec: about 474 px stay visible above it.
      await page.setViewportSize({ width: 390, height: 474 });
      await input.focus();
      await expect(canvas).toHaveAttribute('data-active-measurement-guide', line.name);
      await expect(canvas).toHaveAttribute('data-measurement-guide-status', line.status);
      await expect(canvas).toHaveAttribute('data-measurement-guide-view', line.view);
      await expect(canvas).toHaveAttribute('data-measurement-guide-camera-motion', 'still');
      await page.mouse.move(0, 0);
      const box = (await canvas.boundingBox())!;
      typingStage ??= [Math.round(box.width), Math.round(box.height)];
      const stats = await canvasPixelStats(page, canvas);
      blue[line.label] = stats.blue;
      expect(stats.blue, `${line.label} blue px on the phone`).toBeGreaterThanOrEqual(
        line.minBluePhone,
      );
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    }

    // Live beta 17.11: chest depth turns the camera to the side, a tap on the stage hands it to the
    // owner, and the next field without a back/side view still faces the front.
    await page.setViewportSize(rest);
    const chestDepth = measurementField(page, 'chest depth');
    await revealMeasurement(page, chestDepth);
    await page.setViewportSize({ width: 390, height: 474 });
    await chestDepth.focus();
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera', 'turned-side');
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera-motion', 'still');
    await expect(canvas).toHaveAttribute('data-camera-facing', 'side');
    const typingBox = (await canvas.boundingBox())!;
    await page.mouse.click(typingBox.x + typingBox.width / 2, typingBox.y + typingBox.height / 2);
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera', /^owner/u);
    await expect(canvas).toHaveAttribute('data-camera-facing', 'side');
    await page.setViewportSize(rest);
    const shoulderLength = measurementField(page, 'shoulder length');
    await revealMeasurement(page, shoulderLength);
    await page.setViewportSize({ width: 390, height: 474 });
    await shoulderLength.focus();
    await expect(canvas).toHaveAttribute(
      'data-active-measurement-guide',
      'BODY_MEASUREMENT_NAME_SHOULDER_LENGTH',
    );
    await expect(canvas).toHaveAttribute('data-measurement-guide-camera-motion', 'still');
    await expect(canvas).toHaveAttribute('data-camera-facing', 'front');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    // Typing: the stage spans the width above the keyboard bar (the unit test's typing stage).
    expect(typingStage![0]).toBe(PHONE_TYPING_STAGE[0]);
    expect(Math.abs(typingStage![1] - PHONE_TYPING_STAGE[1])).toBeLessThanOrEqual(2);
    console.info(
      `MANNEQUIN_GUIDE_LINES_V4_PHONE=${JSON.stringify({
        restStage: [Math.round(restBox.width), Math.round(restBox.height)],
        typingStage,
        blue,
      })}`,
    );
  });

  test('a posed wrist ring draws on the posed body', async ({ page }) => {
    test.setTimeout(600_000);
    await prewarmDevRuntime(page);
    await page.goto(DEV_ROUTE);
    const status = page.getByTestId('model-open-reference-preview-status');
    const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
    const poseDraft = page.locator('[data-pose-draft]');
    await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
    await expect(canvas).toHaveAttribute('data-view-preset', 'front');

    const wrist = measurementField(page, 'wrist');
    const wristBlue = async (shot: string) => {
      await revealMeasurement(page, wrist);
      await wrist.focus();
      await expect(canvas).toHaveAttribute(
        'data-active-measurement-guide',
        'BODY_MEASUREMENT_NAME_WRIST',
      );
      await expect(canvas).toHaveAttribute('data-measurement-guide-status', 'visible');
      await expect(canvas).toHaveAttribute('data-measurement-guide-camera-motion', 'still');
      await expect(canvas).toHaveAttribute('data-camera-facing', 'front');
      await page.mouse.move(0, 0);
      const stats = await canvasPixelStats(page, canvas);
      await canvas.screenshot({ path: `${NECK_SHOTS_DIR}/guide-v4-wrist-${shot}-female.png` });
      await wrist.blur();
      return stats.blue;
    };
    const restBlue = await wristBlue('rest');

    // Raise the left arm by its wrist marker, then put edit pose away so no marker is drawn.
    const editPose = page.getByRole('checkbox', { name: 'edit pose', exact: true });
    await editPose.check();
    await expect(canvas).toHaveAttribute('data-joint-editor-mode', 'edit-pose');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const markers = JSON.parse(
      (await canvas.getAttribute('data-projected-joint-markers')) ?? '[]',
    ) as readonly Readonly<{ id: string; screenX: number; screenY: number }>[];
    const marker = markers.find(({ id }) => id === 'left-wrist');
    expect(marker, 'left wrist marker').toBeDefined();
    const start = { x: box.x + marker!.screenX, y: box.y + marker!.screenY };
    const sourceBefore = await canvas.getAttribute('data-source-revision');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await expect(canvas).toHaveAttribute('data-position-dragging', 'true');
    await page.mouse.move(start.x + 40, start.y - 60, { steps: 10 });
    await page.mouse.up();
    await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
    await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(sourceBefore);
    await expect(status).toContainText('Preview partial', { timeout: 180_000 });
    await expect(poseDraft).toHaveAttribute('data-pose-draft', 'custom');
    await editPose.uncheck();
    await expect(canvas).toHaveAttribute('data-joint-editor-mode', 'off');
    await expect(poseDraft).toHaveAttribute('data-pose-draft', 'custom');

    const posedBlue = await wristBlue('posed');
    console.info(`MANNEQUIN_GUIDE_POSED_WRIST=${JSON.stringify({ restBlue, posedBlue })}`);
    expect(posedBlue, 'posed wrist blue px').toBeGreaterThanOrEqual(POSED_WRIST_MIN_BLUE);
  });
});
