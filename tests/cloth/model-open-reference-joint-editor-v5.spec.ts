import { expect, test, type Page, type TestInfo } from '@playwright/test';

type CanvasPoint = Readonly<{ x: number; y: number }>;

async function hoveredMarkerPoint(
  page: Page,
  canvas: ReturnType<Page['getByTestId']>,
  groupId: string,
): Promise<CanvasPoint> {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  for (let y = bounds.height * 0.12; y <= bounds.height * 0.88; y += 10) {
    for (let x = bounds.width * 0.18; x <= bounds.width * 0.82; x += 10) {
      await page.mouse.move(bounds.x + x, bounds.y + y);
      if ((await canvas.getAttribute('data-hovered-joint-group')) === groupId) return { x, y };
    }
  }
  throw new Error(`Could not hover the ${groupId} marker.`);
}

async function dragCanvas(page: Page, canvas: ReturnType<Page['getByTestId']>) {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  const start = { x: bounds.x + bounds.width * 0.12, y: bounds.y + bounds.height * 0.18 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + Math.min(140, bounds.width * 0.2), start.y + 30, { steps: 8 });
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
          () => {
            stats.live = Math.max(0, stats.live - 1);
          },
          { once: true },
        );
      }
      return context;
    };
    (
      globalThis as typeof globalThis & {
        __modelOpenReferenceV5WebglStats?: typeof stats;
      }
    ).__modelOpenReferenceV5WebglStats = stats;
  });
}

async function webglContextStats(page: Page) {
  return page.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __modelOpenReferenceV5WebglStats?: { live: number; maxLive: number };
        }
      ).__modelOpenReferenceV5WebglStats ?? { live: -1, maxLive: -1 },
  );
}

async function buildAndWaitForJointOverlay(page: Page) {
  await page.getByRole('button', { name: 'apply pose' }).click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready',
    { timeout: 180_000 },
  );
  await expect(page.getByTestId('model-open-reference-joint-overlay-status-v5')).toContainText(
    'Joint markers are ready',
    { timeout: 180_000 },
  );
}

function desktopOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop interaction gate.');
}

function mobileOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile layout gate.');
}

test('edits an allowlisted semantic joint draft without replacing the canvas', async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo);
  await page.goto('/__model-open-reference-preview-v1?basis=male&controls=full-body-v5');
  await expect(page.getByTestId('model-open-reference-fixture-controls')).toHaveText(
    'full-body-v5',
  );
  await expect(page.getByRole('radio', { name: 'Torso group', exact: true })).toBeVisible();
  await expect(
    page.getByRole('radio', { name: 'Left shoulder and upper arm', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Right wrist', exact: true })).toBeVisible();
  await expect(page.getByText(/inverseKinematicsApplied=false/)).toBeVisible();

  await buildAndWaitForJointOverlay(page);
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await canvas.evaluate((element) => element.setAttribute('data-v5-browser-marker', 'same'));
  const initialRevision = await canvas.getAttribute('data-source-revision');

  const cameraMode = page.getByRole('button', { name: 'camera mode' });
  const editMode = page.getByRole('button', { name: 'edit pose mode' });
  await expect(cameraMode).toHaveAttribute('aria-pressed', 'true');
  await editMode.click();
  await expect(editMode).toHaveAttribute('aria-pressed', 'true');
  const stage = canvas.locator('..');
  await expect(stage).toHaveAttribute('aria-label', /joint editor/i);
  await expect(stage).not.toHaveAttribute('aria-label', /drag to orbit/i);
  await expect(canvas).toHaveAttribute('data-joint-editor-mode', 'edit-pose');

  const torsoRadio = page.getByRole('radio', { name: 'Torso group', exact: true });
  const leftElbowRadio = page.getByRole('radio', { name: 'Left elbow', exact: true });
  await leftElbowRadio.check();
  const leftElbowMarker = await hoveredMarkerPoint(page, canvas, 'left-elbow');
  await torsoRadio.check();
  await canvas.click({ position: leftElbowMarker });
  await expect(leftElbowRadio).toBeChecked();
  await expect(canvas).toHaveAttribute('data-selected-joint-group', 'left-elbow');

  const editBeforeDrag = await canvas.screenshot();
  await dragCanvas(page, canvas);
  const editAfterDrag = await canvas.screenshot();
  expect(editAfterDrag.equals(editBeforeDrag)).toBe(true);
  await cameraMode.click();
  const cameraBeforeDrag = await canvas.screenshot();
  await dragCanvas(page, canvas);
  const cameraAfterDrag = await canvas.screenshot();
  expect(cameraAfterDrag.equals(cameraBeforeDrag)).toBe(false);
  await editMode.click();

  const selectedRotation = page.getByRole('slider', {
    name: /Selected joint rotation: Left elbow bend, local Z/i,
  });
  await selectedRotation.focus();
  await page.keyboard.press('ArrowRight');
  await expect(selectedRotation).toHaveValue('1');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(selectedRotation).toHaveValue('6');
  await page.keyboard.press('Escape');
  await expect(selectedRotation).toHaveValue('0');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(selectedRotation).toHaveValue('6');
  await expect(canvas).toHaveAttribute('data-source-revision', initialRevision ?? '');
  await expect(canvas).toHaveAttribute('data-v5-browser-marker', 'same');

  await page.getByRole('button', { name: 'apply pose' }).click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready',
    { timeout: 180_000 },
  );
  await expect(page.getByTestId('model-open-reference-joint-overlay-status-v5')).toContainText(
    'Joint markers are ready',
    { timeout: 180_000 },
  );
  await expect(canvas).toHaveAttribute('data-v5-browser-marker', 'same');
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(initialRevision);

  await cameraMode.click();
  await stage.focus();
  await page.keyboard.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-view-preset', 'back');
  await editMode.click();
  await stage.dispatchEvent('keydown', { key: 'ArrowLeft' });
  await expect(canvas).toHaveAttribute('data-view-preset', 'back');
});

test('keeps the ready body when the optional joint overlay rejects', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await page.goto(
    '/__model-open-reference-preview-v1?basis=female&controls=full-body-v5&jointOverlay=reject',
  );
  await page.getByRole('button', { name: 'apply pose' }).click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview ready',
    { timeout: 180_000 },
  );
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toBeVisible();
  await expect(page.getByTestId('model-open-reference-joint-overlay-status-v5')).toHaveText(
    'Joint controls unavailable; sliders remain available.',
  );
  await expect(page.getByRole('button', { name: 'edit pose mode' })).toBeDisabled();
  await expect(page.getByTestId('model-open-reference-preview-status')).not.toContainText(
    'Preview failed',
  );
});

test('keeps the V5 rail usable without horizontal overflow on mobile', async ({
  page,
}, testInfo) => {
  mobileOnly(testInfo);
  await page.goto('/__model-open-reference-preview-v1?basis=female&controls=full-body-v5');
  await expect(page.getByRole('radio', { name: 'Right wrist', exact: true })).toBeVisible();
  await buildAndWaitForJointOverlay(page);
  await expect(page.getByRole('button', { name: 'edit pose mode' })).toBeEnabled();
  await page.getByRole('button', { name: 'edit pose mode' }).click();
  await expect(page.getByTestId('measurement-watertight-surface-v1-canvas')).toHaveAttribute(
    'data-joint-editor-mode',
    'edit-pose',
  );
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

test('releases its only WebGL context when the V5 preview unmounts', async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await installWebglContextCounter(page);
  await page.goto(
    '/__model-open-reference-preview-v1?basis=male&controls=full-body-v5&staleRig=joint-overlay',
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
