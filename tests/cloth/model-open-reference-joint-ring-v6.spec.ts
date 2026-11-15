import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

type CanvasPoint = Readonly<{ x: number; y: number }>;

async function ringGesturePoints(
  page: Page,
  canvas: Locator,
): Promise<{
  start: CanvasPoint;
  tangent: CanvasPoint;
}> {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  const selectedGroup = await canvas.getAttribute('data-selected-joint-group');
  if (!selectedGroup) throw new Error('The rotation ring has no selected joint group.');
  let pivot: CanvasPoint | null = null;
  for (let y = bounds.height * 0.1; y <= bounds.height * 0.9 && !pivot; y += 10) {
    for (let x = bounds.width * 0.15; x <= bounds.width * 0.85; x += 10) {
      await page.mouse.move(bounds.x + x, bounds.y + y);
      if ((await canvas.getAttribute('data-hovered-joint-group')) === selectedGroup) {
        pivot = { x, y };
        break;
      }
    }
  }
  if (!pivot) throw new Error(`Could not locate the ${selectedGroup} ring pivot.`);
  const horizontalHits: number[] = [];
  for (let x = pivot.x - 44; x <= pivot.x + 44; x += 2) {
    await page.mouse.move(bounds.x + x, bounds.y + pivot.y);
    if ((await canvas.getAttribute('data-hovered-joint-group')) === selectedGroup) {
      horizontalHits.push(x);
    }
  }
  const centerX = (Math.min(...horizontalHits) + Math.max(...horizontalHits)) / 2;
  const verticalHits: number[] = [];
  for (let y = pivot.y - 52; y <= pivot.y + 52; y += 2) {
    await page.mouse.move(bounds.x + centerX, bounds.y + y);
    if ((await canvas.getAttribute('data-hovered-joint-group')) === selectedGroup) {
      verticalHits.push(y);
    }
  }
  pivot = {
    x: centerX,
    y: (Math.min(...verticalHits) + Math.max(...verticalHits)) / 2,
  };
  for (let radius = 20; radius <= 110; radius += 4) {
    for (let degrees = 0; degrees < 360; degrees += 10) {
      const radians = (degrees * Math.PI) / 180;
      const radial = { x: Math.cos(radians), y: Math.sin(radians) };
      const start = { x: pivot.x + radial.x * radius, y: pivot.y + radial.y * radius };
      await page.mouse.move(bounds.x + start.x, bounds.y + start.y);
      if ((await canvas.getAttribute('data-transform-hover-axis')) !== 'none') {
        return { start, tangent: { x: -radial.y, y: radial.x } };
      }
    }
  }
  throw new Error(`Could not hit the ${selectedGroup} local rotation ring.`);
}

async function dragRing(
  page: Page,
  canvas: Locator,
  direction: 1 | -1,
  finish: 'up' | 'escape' | 'cancel' = 'up',
) {
  const points = await ringGesturePoints(page, canvas);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  const start = { x: bounds.x + points.start.x, y: bounds.y + points.start.y };
  const distance = Math.min(90, Math.max(55, Math.min(bounds.width, bounds.height) * 0.1));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    start.x + points.tangent.x * distance * direction,
    start.y + points.tangent.y * distance * direction,
    { steps: 8 },
  );
  if (finish === 'escape') {
    await page.keyboard.press('Escape');
    await page.mouse.up();
  } else if (finish === 'cancel') {
    await canvas.dispatchEvent('pointercancel', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 0,
    });
    await page.mouse.up();
  } else {
    await page.mouse.up();
  }
}

async function dragRingUntilChanged(page: Page, canvas: Locator, slider: Locator) {
  const initial = await slider.inputValue();
  for (const direction of [1, -1] as const) {
    await dragRing(page, canvas, direction);
    const next = await slider.inputValue();
    if (next !== initial) return { direction, initial, next };
  }
  throw new Error('Direct rotation ring drag did not update the selected semantic draft.');
}

async function dragCanvasAwayFromGizmo(page: Page, canvas: Locator) {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  const start = { x: bounds.x + bounds.width * 0.08, y: bounds.y + bounds.height * 0.88 };
  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(50);
  await page.mouse.down();
  await page.mouse.move(start.x + Math.min(140, bounds.width * 0.2), start.y - 25, { steps: 8 });
  await page.mouse.up();
}

async function installWebglContextCounter(page: Page) {
  await page.addInitScript(() => {
    const stats = { live: 0, maxLive: 0 };
    const tracked = new WeakSet<HTMLCanvasElement>();
    const prototype = HTMLCanvasElement.prototype as unknown as {
      getContext: (...args: unknown[]) => unknown;
    };
    const originalGetContext = prototype.getContext;
    prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      const context = originalGetContext.apply(this, args);
      const kind = args[0];
      if (
        context &&
        (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') &&
        !tracked.has(this)
      ) {
        tracked.add(this);
        stats.live += 1;
        stats.maxLive = Math.max(stats.maxLive, stats.live);
        this.addEventListener(
          'webglcontextlost',
          () => (stats.live = Math.max(0, stats.live - 1)),
          {
            once: true,
          },
        );
      }
      return context;
    };
    (
      globalThis as typeof globalThis & {
        __modelOpenReferenceV6WebglStats?: typeof stats;
      }
    ).__modelOpenReferenceV6WebglStats = stats;
  });
}

async function webglContextStats(page: Page) {
  return page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __modelOpenReferenceV6WebglStats?: { live: number; maxLive: number };
        }
      ).__modelOpenReferenceV6WebglStats ?? { live: -1, maxLive: -1 },
  );
}

async function buildAndWaitForJointOverlay(page: Page) {
  await page.getByRole('button', { name: 'apply pose' }).click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready',
    { timeout: 180_000 },
  );
  await expect(page.getByTestId('model-open-reference-joint-overlay-status-v5')).toContainText(
    /rotation ring.*ready/i,
    { timeout: 180_000 },
  );
}

function desktopOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop direct-manipulation gate.');
}

function mobileOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile fallback gate.');
}

test('uses a real local-axis ring for a retained draft and explicit Apply', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await page.goto('/__model-open-reference-preview-v1?basis=male&controls=full-body-v6');
  await expect(page.getByTestId('model-open-reference-fixture-controls')).toHaveText(
    'full-body-v6',
  );
  await buildAndWaitForJointOverlay(page);

  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  const stage = canvas.locator('..');
  const editMode = page.getByRole('button', { name: 'edit pose mode' });
  const cameraMode = page.getByRole('button', { name: 'camera mode' });
  await page.getByRole('radio', { name: 'Left elbow', exact: true }).check();
  await editMode.click();
  await expect(canvas).toHaveAttribute('data-transform-axis', 'z');
  await canvas.evaluate((element) => element.setAttribute('data-v6-retained-canvas', 'same'));
  const initialRevision = await canvas.getAttribute('data-source-revision');
  const slider = page.getByRole('slider', {
    name: /Selected joint rotation: Left elbow bend, local Z/i,
  });
  const changed = await dragRingUntilChanged(page, canvas, slider);
  expect(Number(changed.next)).toBeGreaterThan(0);
  await expect(canvas).toHaveAttribute('data-source-revision', initialRevision ?? '');
  await expect(canvas).toHaveAttribute('data-v6-retained-canvas', 'same');
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready',
  );

  const settledValue = await slider.inputValue();
  await dragRing(page, canvas, changed.direction, 'escape');
  await expect(slider).toHaveValue(settledValue);
  await expect(canvas).toHaveAttribute('data-gizmo-dragging', 'false');
  await dragRing(page, canvas, changed.direction, 'cancel');
  await expect(slider).toHaveValue(settledValue);
  await expect(canvas).toHaveAttribute('data-gizmo-dragging', 'false');

  await page.mouse.move(0, 0);
  const editBeforeOrbit = await canvas.screenshot();
  await dragCanvasAwayFromGizmo(page, canvas);
  const editAfterOrbit = await canvas.screenshot();
  expect(editAfterOrbit.equals(editBeforeOrbit)).toBe(true);
  await cameraMode.click();
  const cameraBeforeOrbit = await canvas.screenshot();
  await dragCanvasAwayFromGizmo(page, canvas);
  const cameraAfterOrbit = await canvas.screenshot();
  expect(cameraAfterOrbit.equals(cameraBeforeOrbit)).toBe(false);

  await editMode.click();
  await page.getByRole('button', { name: 'apply pose' }).click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready',
    { timeout: 180_000 },
  );
  await expect(page.getByTestId('model-open-reference-joint-overlay-status-v5')).toContainText(
    /rotation ring.*ready/i,
    { timeout: 180_000 },
  );
  await expect(canvas).toHaveAttribute('data-v6-retained-canvas', 'same');
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(initialRevision);
  await expect(cameraMode).toHaveAttribute('aria-pressed', 'true');
  await editMode.click();
  await expect(canvas).toHaveAttribute('data-transform-axis', 'z');
  await expect(stage).toHaveAttribute('aria-label', /joint editor/i);
});

test('keeps independent right-side ring edits on the selected arm', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.goto('/__model-open-reference-preview-v1?basis=female&controls=full-body-v6');
  await page.getByRole('button', { name: 'unlink arms' }).click();
  await buildAndWaitForJointOverlay(page);
  await page.getByRole('radio', { name: 'Right elbow', exact: true }).check();
  await page.getByRole('button', { name: 'edit pose mode' }).click();
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toHaveAttribute('data-transform-axis', 'z');
  const rightSlider = page.getByRole('slider', {
    name: /Selected joint rotation: Right elbow bend, local Z/i,
  });
  const changed = await dragRingUntilChanged(page, canvas, rightSlider);
  expect(Number(changed.next)).toBeGreaterThan(0);
  await page.getByRole('radio', { name: 'Left elbow', exact: true }).check();
  await expect(
    page.getByRole('slider', { name: /Selected joint rotation: Left elbow bend, local Z/i }),
  ).toHaveValue('0');
});

test('keeps the built V6 rail as the complete coarse-pointer fallback', async ({
  page,
}, testInfo) => {
  mobileOnly(testInfo);
  await page.goto('/__model-open-reference-preview-v1?basis=female&controls=full-body-v6');
  await buildAndWaitForJointOverlay(page);
  await page.getByRole('button', { name: 'edit pose mode' }).click();
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toHaveAttribute('data-joint-editor-mode', 'edit-pose');
  await expect(canvas).toHaveAttribute('data-transform-axis', 'none');
  for (const name of ['camera mode', 'edit pose mode']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  for (const name of ['Torso group', 'Left elbow', 'Right wrist']) {
    const labelBox = await page.getByLabel(name, { exact: true }).locator('..').boundingBox();
    expect(labelBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('releases its only WebGL context when the V6 preview unmounts', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await installWebglContextCounter(page);
  await page.goto(
    '/__model-open-reference-preview-v1?basis=male&controls=full-body-v6&staleRig=joint-overlay',
  );
  await page.getByRole('button', { name: 'apply pose' }).click();
  await expect(page.getByTestId('model-open-reference-fake-timer-status')).toHaveText('scheduled');
  await page
    .getByTestId('model-open-reference-run-fake-timer')
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByTestId('model-open-reference-await-boundary')).toHaveText(
    'joint-overlay',
    { timeout: 180_000 },
  );
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toBeVisible();
  await expect.poll(() => webglContextStats(page)).toEqual({ live: 1, maxLive: 1 });
  await page
    .getByTestId('model-open-reference-unmount')
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toHaveCount(0);
  await expect.poll(() => webglContextStats(page)).toEqual({ live: 0, maxLive: 1 });
});
