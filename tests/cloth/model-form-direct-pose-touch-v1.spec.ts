import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';

const DEV_ROUTE = '/__model-form-personalized-preview-v1';

interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

interface ProjectedJointMarker {
  readonly id: string;
  readonly screenX: number;
  readonly screenY: number;
}

async function dispatchTouch(
  session: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  point?: CanvasPoint,
) {
  await session.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: point
      ? [
          {
            x: point.x,
            y: point.y,
            radiusX: 10,
            radiusY: 10,
            force: 1,
            id: 1,
          },
        ]
      : [],
  });
}

async function touchTap(session: CDPSession, point: CanvasPoint) {
  await dispatchTouch(session, 'touchStart', point);
  await dispatchTouch(session, 'touchEnd');
}

async function projectedJointMarkers(
  session: CDPSession,
  canvas: Locator,
): Promise<readonly ProjectedJointMarker[]> {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await touchTap(session, { x: box!.x + 8, y: box!.y + 8 });
  await expect.poll(() => canvas.getAttribute('data-projected-joint-markers')).not.toBeNull();
  const encoded = await canvas.getAttribute('data-projected-joint-markers');
  if (!encoded) throw new Error('The projected mobile joint-marker receipt is missing.');
  return JSON.parse(encoded) as readonly ProjectedJointMarker[];
}

async function projectedJointPoint(options: {
  readonly session: CDPSession;
  readonly canvas: Locator;
  readonly groupId: string;
}) {
  const { session, canvas, groupId } = options;
  const markers = await projectedJointMarkers(session, canvas);
  const marker = markers.find(({ id }) => id === groupId);
  if (!marker) throw new Error(`The projected receipt does not contain ${groupId}.`);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + marker.screenX, y: box!.y + marker.screenY };
}

async function touchDrag(options: {
  readonly session: CDPSession;
  readonly start: CanvasPoint;
  readonly target: CanvasPoint;
  readonly steps?: number;
}) {
  const { session, start, target, steps = 10 } = options;
  await dispatchTouch(session, 'touchStart', start);
  for (let index = 1; index <= steps; index += 1) {
    await dispatchTouch(session, 'touchMove', {
      x: start.x + ((target.x - start.x) * index) / steps,
      y: start.y + ((target.y - start.y) * index) / steps,
    });
  }
  await dispatchTouch(session, 'touchEnd');
}

async function dragJointWithCandidates(options: {
  readonly page: Page;
  readonly session: CDPSession;
  readonly canvas: Locator;
  readonly groupId: string;
  readonly targets: (start: CanvasPoint) => readonly CanvasPoint[];
}) {
  const { page, session, canvas, groupId, targets } = options;
  const preview = page.getByTestId('model-open-reference-preview');
  const receipts: string[] = [];
  for (const target of targets(await projectedJointPoint({ session, canvas, groupId }))) {
    const start = await projectedJointPoint({ session, canvas, groupId });
    const sourceBefore = await canvas.getAttribute('data-source-revision');
    await dispatchTouch(session, 'touchStart', start);
    await expect(canvas).toHaveAttribute('data-position-dragging', 'true');
    await expect(canvas).toHaveAttribute('data-selected-joint-group', groupId);
    for (let index = 1; index <= 10; index += 1) {
      await dispatchTouch(session, 'touchMove', {
        x: start.x + ((target.x - start.x) * index) / 10,
        y: start.y + ((target.y - start.y) * index) / 10,
      });
    }
    await expect(canvas).toHaveAttribute('data-live-position-status', 'updated');
    await expect(canvas).toHaveAttribute('data-source-revision', sourceBefore ?? '');
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const admitted = (await preview.getAttribute('data-pose-admissibility')) === 'admitted';
    receipts.push(
      JSON.stringify({
        admissibility: await preview.getAttribute('data-pose-admissibility'),
        blockers: await preview.getAttribute('data-pose-blockers'),
        start,
        target,
      }),
    );
    await dispatchTouch(session, 'touchEnd');
    await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
    if (admitted) {
      await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(sourceBefore);
      return await canvas.getAttribute('data-source-revision');
    }
    await expect(canvas).toHaveAttribute('data-source-revision', sourceBefore ?? '');
  }
  throw new Error(
    `${groupId} rejected every bounded mobile touch candidate: ${receipts.join('; ')}`,
  );
}

async function farthestEmptyPoint(session: CDPSession, canvas: Locator) {
  const markers = await projectedJointMarkers(session, canvas);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const candidates = [
    [0.06, 0.08],
    [0.94, 0.08],
    [0.06, 0.9],
    [0.94, 0.9],
    [0.06, 0.5],
    [0.94, 0.5],
  ] as const;
  const selected = candidates
    .map(([xFraction, yFraction]) => {
      const point = { x: box!.width * xFraction, y: box!.height * yFraction };
      const clearance = Math.min(
        ...markers.map(({ screenX, screenY }) => Math.hypot(point.x - screenX, point.y - screenY)),
      );
      return { point, clearance };
    })
    .sort((left, right) => right.clearance - left.clearance)[0];
  expect(selected.clearance).toBeGreaterThan(40);
  return { x: box!.x + selected.point.x, y: box!.y + selected.point.y };
}

test('mobile touch edits wrist and ankle live while empty canvas stays camera-owned', async ({
  page,
}) => {
  const requests: Array<{ method: string; url: string }> = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  const form = page.getByTestId('model-form-personalized-preview-dev-page').locator('form');
  const guided = page.getByTestId('measurements-guided-entry');
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(guided).toBeVisible();
  await expect(form.locator('[data-model-measurement]')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'chest', exact: true })).toHaveValue('920');
  await expect(page.getByTestId('model-open-reference-direct-pose-control-v9')).toHaveCount(0);

  await page.getByRole('radio', { name: 'table', exact: true }).tap();
  await expect(guided).toHaveCount(0);
  await expect(form.locator('[data-model-measurement]')).toHaveCount(34);
  await expect(page.getByRole('textbox', { name: 'chest', exact: true })).toHaveValue('920');
  await expect(page.getByTestId('model-open-reference-direct-pose-control-v9')).toBeVisible();
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  await expect(canvas).toHaveAttribute('data-joint-editor-mode', 'edit-pose');

  await page.evaluate(() => {
    const pointerTypes: string[] = [];
    const record = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) return;
      pointerTypes.push(`${event.type}:${event.pointerType}`);
      event.target.dataset.testPointerTypes = pointerTypes.join(',');
    };
    document.addEventListener('pointerdown', record, true);
    document.addEventListener('pointermove', record, true);
    document.addEventListener('pointerup', record, true);
  });
  const session = await page.context().newCDPSession(page);

  const wristRevision = await dragJointWithCandidates({
    page,
    session,
    canvas,
    groupId: 'left-wrist',
    targets: (start) => [
      { x: start.x - 12, y: start.y + 10 },
      { x: start.x + 12, y: start.y + 10 },
      { x: start.x - 8, y: start.y - 8 },
      { x: start.x + 8, y: start.y - 8 },
    ],
  });
  expect(wristRevision).toContain('editorPoseV9=');
  await expect(canvas).toHaveAttribute('data-test-pointer-types', /pointerdown:touch/);
  await expect(canvas).toHaveAttribute('data-test-pointer-types', /pointermove:touch/);
  await expect(canvas).toHaveAttribute('data-test-pointer-types', /pointerup:touch/);

  await page.getByRole('button', { name: 'reset', exact: true }).tap();
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(wristRevision);
  const resetRevision = await canvas.getAttribute('data-source-revision');
  await page.getByRole('button', { name: 'symmetry', exact: true }).tap();
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(resetRevision);

  const ankleRevision = await dragJointWithCandidates({
    page,
    session,
    canvas,
    groupId: 'left-ankle',
    targets: (start) => [
      { x: start.x + 10, y: start.y - 10 },
      { x: start.x - 10, y: start.y - 10 },
      { x: start.x + 8, y: start.y + 8 },
      { x: start.x - 8, y: start.y + 8 },
    ],
  });
  expect(ankleRevision).toContain('editorPoseV9=');

  const cameraSource = await canvas.getAttribute('data-source-revision');
  const cameraRenderCount = Number(await canvas.getAttribute('data-render-count'));
  const cameraBefore = await canvas.screenshot();
  const emptyStart = await farthestEmptyPoint(session, canvas);
  await touchDrag({
    session,
    start: emptyStart,
    target: { x: emptyStart.x + 72, y: emptyStart.y - 12 },
    steps: 8,
  });
  await expect(canvas).toHaveAttribute('data-source-revision', cameraSource ?? '');
  await expect(canvas).toHaveAttribute('data-selected-joint-group', 'left-ankle');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-render-count')))
    .toBeGreaterThan(cameraRenderCount);
  const cameraAfter = await canvas.screenshot();
  expect(cameraAfter.equals(cameraBefore)).toBe(false);

  await page.getByRole('radio', { name: 'guided', exact: true }).tap();
  await expect(guided).toBeVisible();
  await expect(form.locator('[data-model-measurement]')).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'chest', exact: true })).toHaveValue('920');
  await expect(page.getByTestId('model-open-reference-direct-pose-control-v9')).toHaveCount(0);

  expect(
    requests.filter(({ method }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)),
  ).toEqual([]);
  expect(requests.filter(({ url }) => new URL(url).pathname.startsWith('/api/'))).toEqual([]);
  await expect(page.getByTestId('model-form-smoke-mutation-calls')).toHaveText('0');
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
