import { expect, test, type Locator, type Page } from '@playwright/test';

const MODEL_ID = 8401;
const DETAIL_ROUTE = `/models/${MODEL_ID}`;
const REQUIRED_CREATE_MEASUREMENTS = [
  ['height', '1720'],
  ['across shoulder', '420'],
  ['chest', '920'],
  ['waist', '740'],
  ['hip', '980'],
  ['sleeve length', '600'],
  ['inseam', '800'],
] as const;

interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

interface DirectPoseV9 {
  readonly [key: string]: unknown;
}

function storedModel() {
  return {
    id: MODEL_ID,
    model: {
      name: 'session pose detail fixture',
      comment: 'server baseline',
      gender: 'GENDER_ENUM_FEMALE',
      measurements: [
        { name: 'BODY_MEASUREMENT_NAME_HEIGHT', valueMm: 1720 },
        { name: 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', valueMm: 420 },
        { name: 'BODY_MEASUREMENT_NAME_CHEST', valueMm: 920 },
        { name: 'BODY_MEASUREMENT_NAME_WAIST', valueMm: 740 },
        { name: 'BODY_MEASUREMENT_NAME_HIP', valueMm: 980 },
        { name: 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', valueMm: 600 },
        { name: 'BODY_MEASUREMENT_NAME_INSEAM', valueMm: 800 },
        { name: 'BODY_MEASUREMENT_NAME_BICEP', valueMm: 300 },
        { name: 'BODY_MEASUREMENT_NAME_WRIST', valueMm: 170 },
        { name: 'BODY_MEASUREMENT_NAME_CALF', valueMm: 370 },
        { name: 'BODY_MEASUREMENT_NAME_ANKLE', valueMm: 230 },
      ],
      thumbnailId: 0,
      mediaIds: [],
      defaultSizeIds: [],
    },
    createdAt: '2026-11-15T00:00:00Z',
    updatedAt: '2026-11-15T00:00:00Z',
    media: [],
  };
}

function poseFromSourceRevision(sourceRevision: string | null): DirectPoseV9 {
  const encoded = sourceRevision?.match(/(?:^|;)editorPoseV9=([^;]+)/u)?.[1];
  if (!encoded) throw new Error('The V9 pose is missing from the source revision.');
  return JSON.parse(decodeURIComponent(encoded)) as DirectPoseV9;
}

function expectNeutralPose(pose: DirectPoseV9) {
  const numbers = (value: unknown): number[] => {
    if (typeof value === 'number') return [value];
    if (!value || typeof value !== 'object') return [];
    return Object.values(value).flatMap(numbers);
  };
  expect(numbers(pose).every((value) => value === 0)).toBe(true);
}

function expectChangedPose(pose: DirectPoseV9) {
  const numbers = (value: unknown): number[] => {
    if (typeof value === 'number') return [value];
    if (!value || typeof value !== 'object') return [];
    return Object.values(value).flatMap(numbers);
  };
  expect(numbers(pose).some((value) => value !== 0)).toBe(true);
}

function objectKeysDeep(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(objectKeysDeep);
  return Object.entries(value).flatMap(([key, nested]) => [key, ...objectKeysDeep(nested)]);
}

async function installAuthenticatedProductBackend(page: Page) {
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ exp: 4_102_444_800 }));
    localStorage.setItem('authToken', `test.${payload}.signature`);
  });
  let model = storedModel();
  let getModelCalls = 0;
  const updateRequests: unknown[] = [];
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    let body: unknown = {};
    if (pathname.endsWith(`/api/admin/model/${MODEL_ID}`) && request.method() === 'GET') {
      getModelCalls += 1;
      body = { model };
    } else if (pathname.endsWith('/api/admin/model/update')) {
      const payload = JSON.parse(request.postData() ?? '{}') as {
        id?: number;
        model?: typeof model.model;
      };
      updateRequests.push(payload);
      if (payload.id === MODEL_ID && payload.model) {
        model = {
          ...model,
          model: payload.model,
          updatedAt: '2026-11-15T00:01:00Z',
        };
      }
    } else if (pathname.endsWith('/api/admin/model/list')) {
      body = { models: [model], total: 1 };
    } else if (pathname.endsWith('/api/admin/dictionary')) {
      body = { dictionary: {} };
    } else if (pathname.endsWith('/api/admin/accounts/me')) {
      body = { account: { username: 'browser-gate', isSuper: true, permissions: [] } };
    } else if (pathname.endsWith('/api/admin/accounts/sections')) {
      body = { sections: [] };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return {
    getModelCalls: () => getModelCalls,
    updateRequests,
  };
}

async function waitForReadySession(page: Page) {
  await expect(page.getByText('edit model', { exact: true })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toHaveText(
    'session pose · not saved',
    { timeout: 180_000 },
  );
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
    { timeout: 180_000 },
  );
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  return canvas;
}

async function findHead(page: Page, canvas: Locator): Promise<CanvasPoint> {
  await canvas.scrollIntoViewIfNeeded();
  await canvas.screenshot();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  const centerX = bounds.x + bounds.width / 2;
  const offsets = [0, 18, -18, 36, -36, 54, -54, 72, -72];
  for (let y = bounds.y + bounds.height * 0.08; y <= bounds.y + bounds.height * 0.32; y += 12) {
    for (const offset of offsets) {
      const point = { x: centerX + offset, y };
      await page.mouse.move(point.x, point.y);
      if ((await canvas.getAttribute('data-hovered-joint-group')) === 'head-group') return point;
    }
  }
  throw new Error('Could not hover the head position target.');
}

async function beginAcceptedPoseDrag(page: Page, canvas: Locator) {
  const head = await findHead(page, canvas);
  await page.mouse.move(head.x, head.y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'true');
  await page.mouse.move(head.x + 48, head.y - 24, { steps: 10 });
  await expect(page.getByTestId('model-open-reference-preview')).toHaveAttribute(
    'data-pose-admissibility',
    'admitted',
  );
  await expect(canvas).toHaveAttribute('data-live-position-status', 'updated');
}

async function commitAcceptedPoseDrag(page: Page, canvas: Locator) {
  const sourceBefore = await canvas.getAttribute('data-source-revision');
  await beginAcceptedPoseDrag(page, canvas);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(sourceBefore);
  return poseFromSourceRevision(await canvas.getAttribute('data-source-revision'));
}

async function expectCancelledPoseDrag(
  page: Page,
  canvas: Locator,
  finish: 'escape' | 'pointercancel',
) {
  const sourceBefore = await canvas.getAttribute('data-source-revision');
  const poseBefore = poseFromSourceRevision(sourceBefore);
  await beginAcceptedPoseDrag(page, canvas);
  if (finish === 'escape') {
    await page.keyboard.press('Escape');
  } else {
    await canvas.dispatchEvent('pointercancel', {
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: 0,
    });
  }
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
  await expect(canvas).toHaveAttribute('data-source-revision', sourceBefore ?? '');
  expect(poseFromSourceRevision(await canvas.getAttribute('data-source-revision'))).toEqual(
    poseBefore,
  );
}

test('product Model detail owns a route-lifetime pose outside UpdateModel', async ({ page }) => {
  const backend = await installAuthenticatedProductBackend(page);
  await page.goto(DETAIL_ROUTE, { waitUntil: 'domcontentloaded' });
  const canvas = await waitForReadySession(page);
  const sessionStatus = page.getByTestId('model-mannequin-pose-session-status');
  const undo = page.getByRole('button', { name: 'undo', exact: true });
  const reset = page.getByRole('button', { name: 'reset', exact: true });
  const save = page.getByRole('button', { name: 'save', exact: true });
  await expect(undo).toBeDisabled();

  // The real form registers its sparse nested measurement fields after mount, which makes this
  // synthetic server fixture dirty before pose interaction. Establish a clean saved baseline so
  // the assertion below measures pose-only dirtiness rather than registration normalization.
  if (await save.isEnabled()) {
    await save.press('Enter');
    await expect.poll(() => backend.updateRequests.length).toBe(1);
    await expect.poll(() => backend.getModelCalls()).toBeGreaterThan(1);
  }
  await expect(save).toBeDisabled();
  const cleanUpdateCount = backend.updateRequests.length;

  await expectCancelledPoseDrag(page, canvas, 'pointercancel');
  await expect(undo).toBeDisabled();
  await expectCancelledPoseDrag(page, canvas, 'escape');
  await expect(undo).toBeDisabled();

  const firstPose = await commitAcceptedPoseDrag(page, canvas);
  expectChangedPose(firstPose);
  await expect(sessionStatus).toHaveText('session pose · not saved · changed');
  await expect(undo).toBeEnabled();
  await expect(save).toBeDisabled();
  await undo.click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  expectNeutralPose(poseFromSourceRevision(await canvas.getAttribute('data-source-revision')));
  await expect(undo).toBeDisabled();

  const exactPose = await commitAcceptedPoseDrag(page, canvas);
  await reset.click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  expectNeutralPose(poseFromSourceRevision(await canvas.getAttribute('data-source-revision')));
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  expect(poseFromSourceRevision(await canvas.getAttribute('data-source-revision'))).toEqual(
    exactPose,
  );

  const chest = page.getByRole('textbox', { name: 'chest', exact: true });
  const underBust = page.getByRole('textbox', { name: 'under bust', exact: true });
  const beforeChest = await canvas.getAttribute('data-source-revision');
  await chest.fill('960');
  await chest.blur();
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(beforeChest);
  expect(poseFromSourceRevision(await canvas.getAttribute('data-source-revision'))).toEqual(
    exactPose,
  );
  const beforeUnderBust = await canvas.getAttribute('data-source-revision');
  await underBust.fill('800');
  await underBust.blur();
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(beforeUnderBust);
  expect(poseFromSourceRevision(await canvas.getAttribute('data-source-revision'))).toEqual(
    exactPose,
  );
  await expect(save).toBeEnabled();
  await save.press('Enter');
  await expect.poll(() => backend.updateRequests.length).toBe(cleanUpdateCount + 1);
  await expect.poll(() => backend.getModelCalls()).toBeGreaterThan(1);
  const updatePayloadKeys = objectKeysDeep(backend.updateRequests.at(-1));
  expect(
    updatePayloadKeys.filter((key) => /pose|displayMesh|positions|indices/iu.test(key)),
  ).toEqual([]);
  await expect(sessionStatus).toHaveText('session pose · not saved · changed');
  expect(poseFromSourceRevision(await canvas.getAttribute('data-source-revision'))).toEqual(
    exactPose,
  );
  expect(page.url()).toContain(DETAIL_ROUTE);
});

test('reload honestly drops the edit-route session pose', async ({ page }) => {
  await installAuthenticatedProductBackend(page);
  await page.goto(DETAIL_ROUTE, { waitUntil: 'domcontentloaded' });
  const canvas = await waitForReadySession(page);
  await commitAcceptedPoseDrag(page, canvas);
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toContainText('changed');
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloadedCanvas = await waitForReadySession(page);
  expectNeutralPose(
    poseFromSourceRevision(await reloadedCanvas.getAttribute('data-source-revision')),
  );
});

test('leaving Model detail and browser back starts a fresh session pose', async ({ page }) => {
  await installAuthenticatedProductBackend(page);
  await page.goto(DETAIL_ROUTE, { waitUntil: 'domcontentloaded' });
  const canvas = await waitForReadySession(page);
  await commitAcceptedPoseDrag(page, canvas);
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toContainText('changed');
  await page.goto('/models', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/models$/u);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  const returnedCanvas = await waitForReadySession(page);
  expectNeutralPose(
    poseFromSourceRevision(await returnedCanvas.getAttribute('data-source-revision')),
  );
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toHaveText(
    'session pose · not saved',
  );
});

test('product create mode keeps the temporary-pose legacy undo owner', async ({ page }) => {
  await installAuthenticatedProductBackend(page);
  await page.goto('/add-model', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('new model', { exact: true })).toBeVisible({ timeout: 180_000 });
  await page.getByRole('combobox', { name: 'select' }).click();
  await page.getByRole('option', { name: 'women' }).click();
  for (const [label, value] of REQUIRED_CREATE_MEASUREMENTS) {
    const input = page.getByRole('textbox', { name: label, exact: true });
    await input.fill(value);
    await input.blur();
  }
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
    { timeout: 180_000 },
  );
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const sessionStatus = page.getByTestId('model-mannequin-pose-session-status');
  const undo = page.getByRole('button', { name: 'undo', exact: true });
  await expect(sessionStatus).toHaveText('temporary pose · not saved');
  await expect(undo).toBeDisabled();
  const posed = await commitAcceptedPoseDrag(page, canvas);
  expectChangedPose(posed);
  await expect(sessionStatus).toHaveText('temporary pose · not saved');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  expectNeutralPose(poseFromSourceRevision(await canvas.getAttribute('data-source-revision')));
  await expect(undo).toBeDisabled();
});
