import { expect, test, type Locator, type Page } from '@playwright/test';

const DEV_ROUTE = '/__model-form-personalized-preview-v1';

interface PoseLegV9 {
  readonly hipForwardDeg: number;
  readonly hipSideDeg: number;
  readonly kneeBendDeg: number;
  readonly ankleBendDeg: number;
}

interface PoseArmV9 {
  readonly shoulderRaiseDegrees: number;
  readonly shoulderForwardDegrees: number;
  readonly elbowBendDegrees: number;
  readonly wristBendDegrees: number;
}

interface PoseV9 {
  readonly headPitchDeg: number;
  readonly headYawDeg: number;
  readonly headSideDeg: number;
  readonly shoulderProtractionDeg: number;
  readonly shoulderElevationDeg: number;
  readonly shoulderLevelDeg: number;
  readonly armMode: 'linked' | 'independent';
  readonly legMode: 'linked' | 'independent';
  readonly leftLeg: PoseLegV9;
  readonly rightLeg: PoseLegV9;
  readonly leftArm: PoseArmV9;
  readonly rightArm: PoseArmV9;
}

interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

interface LiveJointOverlayGroupV10 {
  readonly headM: readonly [number, number, number];
  readonly tailM: readonly [number, number, number];
}

function liveJointOverlayGroupsFromSignature(
  signature: string | null,
): ReadonlyMap<string, LiveJointOverlayGroupV10> {
  if (!signature) throw new Error('The live joint-overlay signature is missing.');
  const rows = JSON.parse(signature) as readonly (readonly [string, ...number[]])[];
  return new Map(
    rows.map((row) => [
      row[0],
      {
        headM: [row[1], row[2], row[3]],
        tailM: [row[4], row[5], row[6]],
      },
    ]),
  );
}

function liveJointDistanceV10(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function poseFromSourceRevision(sourceRevision: string | null): PoseV9 {
  const encoded = sourceRevision?.match(/(?:^|;)editorPoseV9=([^;]+)/u)?.[1];
  if (!encoded) throw new Error('The committed V9 pose is missing from the body source revision.');
  return JSON.parse(decodeURIComponent(encoded)) as PoseV9;
}

function alternatingOffsets(limit: number, step: number): number[] {
  const offsets = [0];
  for (let value = step; value <= limit; value += step) offsets.push(value, -value);
  return offsets;
}

async function findMarker(options: {
  readonly page: Page;
  readonly canvas: Locator;
  readonly groupId: string;
  readonly region: 'head' | 'wrists' | 'ankles';
}): Promise<CanvasPoint> {
  const { page, canvas, groupId, region } = options;
  await canvas.screenshot();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  const centerX = bounds.x + bounds.width / 2;
  const xOffsets =
    region === 'head'
      ? alternatingOffsets(Math.min(90, bounds.width * 0.1), 18)
      : region === 'wrists'
        ? [120, -120, 102, -102, 138, -138, 84, -84, 156, -156, 66, -66, 48, -48]
        : [60, -60, 78, -78, 42, -42, 96, -96, 24, -24, 0];
  const startFraction = region === 'head' ? 0.08 : region === 'wrists' ? 0.22 : 0.68;
  const endFraction = region === 'head' ? 0.32 : region === 'wrists' ? 0.55 : 0.9;
  const startY = bounds.y + bounds.height * startFraction;
  const endY = bounds.y + bounds.height * endFraction;
  let selectedTarget = false;
  selectionScan: for (let y = startY; y <= endY; y += 18) {
    for (const offsetX of xOffsets) {
      const point = { x: centerX + offsetX, y };
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      const isPositionTarget = (await canvas.getAttribute('data-position-dragging')) === 'true';
      if (isPositionTarget) {
        const selectedGroup = await canvas.getAttribute('data-selected-joint-group');
        await page.mouse.up();
        await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
          'Preview partial',
        );
        if (selectedGroup === groupId) {
          selectedTarget = true;
          break selectionScan;
        }
        continue;
      }
      await page.mouse.up();
    }
  }
  if (!selectedTarget) {
    throw new Error(
      `Could not select ${groupId}; last selected group was ${await canvas.getAttribute('data-selected-joint-group')}.`,
    );
  }

  // Selecting a joint introduces its rotation ring. Re-scan the enlarged marker and return a
  // marker-owned pixel rather than replaying the first point, which can now belong to the ring.
  for (let y = startY; y <= endY; y += 18) {
    for (const offsetX of xOffsets) {
      const point = { x: centerX + offsetX, y };
      await page.mouse.move(point.x, point.y);
      if ((await canvas.getAttribute('data-hovered-joint-group')) !== groupId) continue;
      if ((await canvas.getAttribute('data-transform-hover-axis')) !== 'none') continue;
      await page.mouse.down();
      const isPositionTarget = (await canvas.getAttribute('data-position-dragging')) === 'true';
      if (isPositionTarget) {
        await page.mouse.up();
        await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
          'Preview partial',
        );
        return point;
      }
      await page.mouse.up();
    }
  }
  throw new Error(
    `Could not locate a marker-owned pixel for ${groupId}; last selected group was ${await canvas.getAttribute('data-selected-joint-group')}.`,
  );
}

async function dragPositionTarget(options: {
  readonly page: Page;
  readonly canvas: Locator;
  readonly start: CanvasPoint;
  readonly deltaX: number;
  readonly deltaY: number;
}) {
  const { page, canvas, start, deltaX, deltaY } = options;
  const sourceBefore = await canvas.getAttribute('data-source-revision');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'true');
  await page.mouse.move(start.x + deltaX, start.y + deltaY, { steps: 10 });
  const duringDrag = await canvas.evaluate((element) => ({
    dragging: element.dataset.positionDragging,
    live: element.dataset.livePositionStatus,
    sourceRevision: element.dataset.sourceRevision,
  }));
  expect(duringDrag).toEqual({
    dragging: 'true',
    live: 'updated',
    sourceRevision: sourceBefore,
  });
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(sourceBefore);
  return await canvas.getAttribute('data-source-revision');
}

async function dragPositionTargetWithAnatomicalCandidates(options: {
  readonly page: Page;
  readonly canvas: Locator;
  readonly groupId: string;
  readonly region: 'head' | 'wrists' | 'ankles';
  readonly candidates: readonly CanvasPoint[];
}) {
  const { page, canvas, groupId, region, candidates } = options;
  const preview = page.getByTestId('model-open-reference-preview');
  for (const delta of candidates) {
    const start = await findMarker({ page, canvas, groupId, region });
    const sourceBefore = await canvas.getAttribute('data-source-revision');
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await expect(canvas).toHaveAttribute('data-position-dragging', 'true');
    await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 10 });
    await expect(canvas).toHaveAttribute('data-live-position-status', 'updated');
    const admissibility = await preview.getAttribute('data-pose-admissibility');
    await page.mouse.up();
    await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
    await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
      'Preview partial',
    );
    if (admissibility === 'admitted') {
      await expect
        .poll(() => canvas.getAttribute('data-source-revision'), { timeout: 15_000 })
        .not.toBe(sourceBefore);
      return await canvas.getAttribute('data-source-revision');
    }
    await expect(canvas).toHaveAttribute('data-source-revision', sourceBefore ?? '');
  }
  throw new Error(`${groupId} rejected every bounded anatomical drag candidate.`);
}

async function dragEmptyCanvas(page: Page, canvas: Locator) {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  const start = {
    x: bounds.x + bounds.width * 0.08,
    y: bounds.y + bounds.height * 0.88,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + Math.min(120, bounds.width * 0.2), start.y - 20, { steps: 8 });
  await page.mouse.up();
}

async function expectPositionHit(options: {
  readonly page: Page;
  readonly canvas: Locator;
  readonly point: CanvasPoint;
  readonly groupId: string;
}) {
  const { page, canvas, point, groupId } = options;
  await page.mouse.move(point.x, point.y);
  await expect(canvas).toHaveAttribute('data-hovered-joint-group', groupId);
  await expect(canvas).toHaveCSS('cursor', 'grab');
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'true');
  await expect(canvas).toHaveAttribute('data-gizmo-dragging', 'false');
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
}

test('shoulder marker live-drags posture without taking wrist, torso, or camera controls', async ({
  page,
}) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  const preview = page.getByTestId('model-open-reference-preview');
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );

  const shoulder = await findHoverMarkerCenter({
    page,
    canvas,
    groupId: 'left-shoulder-group',
    leftFraction: 0.5,
    rightFraction: 0.75,
    topFraction: 0.18,
    bottomFraction: 0.38,
  });
  const sourceBefore = await canvas.getAttribute('data-source-revision');
  await page.mouse.move(shoulder.x, shoulder.y);
  await expect(canvas).toHaveCSS('cursor', 'grab');
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'true');
  await expect(canvas).toHaveAttribute('data-gizmo-dragging', 'false');
  await page.mouse.move(shoulder.x, shoulder.y - 58, { steps: 12 });
  await expect(canvas).toHaveAttribute('data-live-position-status', 'updated');
  await expect(canvas).toHaveAttribute('data-source-revision', sourceBefore ?? '');
  await expect(preview).toHaveAttribute('data-pose-admissibility', 'admitted');
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(sourceBefore);
  const shoulderPose = poseFromSourceRevision(await canvas.getAttribute('data-source-revision'));
  expect(Math.abs(shoulderPose.shoulderElevationDeg)).toBeGreaterThan(0);
  expect(shoulderPose.shoulderLevelDeg).toBe(0);
  expect(shoulderPose.leftArm).toEqual(shoulderPose.rightArm);

  const wrist = await findHoverMarkerCenter({
    page,
    canvas,
    groupId: 'left-wrist',
    leftFraction: 0.5,
    rightFraction: 0.8,
    topFraction: 0.22,
    bottomFraction: 0.58,
  });
  await expectPositionHit({ page, canvas, point: wrist, groupId: 'left-wrist' });
  const torso = await findHoverMarkerCenter({
    page,
    canvas,
    groupId: 'torso-group',
    leftFraction: 0.42,
    rightFraction: 0.58,
    topFraction: 0.28,
    bottomFraction: 0.6,
  });
  await expectPositionHit({ page, canvas, point: torso, groupId: 'torso-group' });

  const cameraSource = await canvas.getAttribute('data-source-revision');
  const cameraRenderCount = Number(await canvas.getAttribute('data-render-count'));
  await dragEmptyCanvas(page, canvas);
  await expect(canvas).toHaveAttribute('data-source-revision', cameraSource ?? '');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-render-count')))
    .toBeGreaterThan(cameraRenderCount);
});

async function attemptExtremePositionDrag(options: {
  readonly page: Page;
  readonly canvas: Locator;
  readonly start: CanvasPoint;
  readonly target: CanvasPoint;
  readonly expectedBlocker?: RegExp;
}) {
  const { page, canvas, start, target, expectedBlocker } = options;
  const preview = page.getByTestId('model-open-reference-preview');
  const sourceBefore = await canvas.getAttribute('data-source-revision');
  const renderCountBefore = Number(await canvas.getAttribute('data-render-count'));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'true');
  await page.mouse.move(target.x, target.y);
  await expect(canvas).toHaveAttribute('data-live-position-status', 'updated');
  await expect(canvas).toHaveAttribute('data-source-revision', sourceBefore ?? '');
  if (expectedBlocker) {
    await expect(preview).toHaveAttribute('data-pose-admissibility', 'blocked');
    await expect(preview).toHaveAttribute('data-pose-blockers', expectedBlocker);
  } else {
    await expect(preview).toHaveAttribute('data-pose-admissibility', 'admitted');
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-render-count')))
      .toBeGreaterThan(renderCountBefore);
  }
  const admissibility = await preview.getAttribute('data-pose-admissibility');
  const blockers = await preview.getAttribute('data-pose-blockers');
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  return {
    admissibility,
    blockers,
    sourceBefore,
    sourceAfter: await canvas.getAttribute('data-source-revision'),
  };
}

async function settlePointerOnEmptyCanvas(page: Page, canvas: Locator) {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 12, box!.y + box!.height - 12);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function ribcageBandScreenshot(page: Page, canvas: Locator) {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  return page.screenshot({
    clip: {
      x: bounds.x + bounds.width * 0.31,
      y: bounds.y + bounds.height * 0.28,
      width: bounds.width * 0.38,
      height: bounds.height * 0.28,
    },
  });
}

async function findHoverMarker(options: {
  readonly page: Page;
  readonly canvas: Locator;
  readonly groupId: string;
  readonly xOffsets: readonly number[];
  readonly startFraction: number;
  readonly endFraction: number;
}): Promise<CanvasPoint> {
  const { page, canvas, groupId, xOffsets, startFraction, endFraction } = options;
  await canvas.screenshot();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  const centerX = bounds.x + bounds.width / 2;
  for (
    let y = bounds.y + bounds.height * startFraction;
    y <= bounds.y + bounds.height * endFraction;
    y += 12
  ) {
    for (const offsetX of xOffsets) {
      const point = { x: centerX + offsetX, y };
      await page.mouse.move(point.x, point.y);
      if ((await canvas.getAttribute('data-hovered-joint-group')) === groupId) return point;
    }
  }
  throw new Error(`Could not hover ${groupId}.`);
}

async function findHoverMarkerCenter(options: {
  readonly page: Page;
  readonly canvas: Locator;
  readonly groupId: string;
  readonly leftFraction: number;
  readonly rightFraction: number;
  readonly topFraction: number;
  readonly bottomFraction: number;
}): Promise<CanvasPoint> {
  const { page, canvas, groupId, leftFraction, rightFraction, topFraction, bottomFraction } =
    options;
  await canvas.screenshot();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  let seed: CanvasPoint | null = null;
  for (
    let y = bounds.y + bounds.height * topFraction;
    y <= bounds.y + bounds.height * bottomFraction && seed === null;
    y += 12
  ) {
    for (
      let x = bounds.x + bounds.width * leftFraction;
      x <= bounds.x + bounds.width * rightFraction;
      x += 12
    ) {
      await page.mouse.move(x, y);
      if ((await canvas.getAttribute('data-hovered-joint-group')) === groupId) {
        seed = { x, y };
        break;
      }
    }
  }
  if (!seed) throw new Error(`Could not locate the projected ${groupId} marker.`);
  const horizontalHits: number[] = [];
  for (let x = seed.x - 40; x <= seed.x + 40; x += 1) {
    await page.mouse.move(x, seed.y);
    if ((await canvas.getAttribute('data-hovered-joint-group')) === groupId) horizontalHits.push(x);
  }
  expect(horizontalHits.length).toBeGreaterThan(2);
  const centerX = (Math.min(...horizontalHits) + Math.max(...horizontalHits)) / 2;
  const verticalHits: number[] = [];
  for (let y = seed.y - 48; y <= seed.y + 48; y += 1) {
    await page.mouse.move(centerX, y);
    if ((await canvas.getAttribute('data-hovered-joint-group')) === groupId) verticalHits.push(y);
  }
  expect(verticalHits.length).toBeGreaterThan(2);
  const centerY = (Math.min(...verticalHits) + Math.max(...verticalHits)) / 2;
  return { x: centerX, y: centerY };
}

async function refineHoverMarkerCenter(options: {
  readonly page: Page;
  readonly canvas: Locator;
  readonly groupId: string;
  readonly seed: CanvasPoint;
}): Promise<CanvasPoint> {
  const { page, canvas, groupId, seed } = options;
  const horizontalHits: number[] = [];
  for (let x = seed.x - 40; x <= seed.x + 40; x += 4) {
    await page.mouse.move(x, seed.y);
    if ((await canvas.getAttribute('data-hovered-joint-group')) === groupId) horizontalHits.push(x);
  }
  expect(horizontalHits.length).toBeGreaterThan(2);
  const centerX = (Math.min(...horizontalHits) + Math.max(...horizontalHits)) / 2;
  const verticalHits: number[] = [];
  for (let y = seed.y - 48; y <= seed.y + 48; y += 1) {
    await page.mouse.move(centerX, y);
    if ((await canvas.getAttribute('data-hovered-joint-group')) === groupId) verticalHits.push(y);
  }
  expect(verticalHits.length).toBeGreaterThan(2);
  return {
    x: centerX,
    y: (Math.min(...verticalHits) + Math.max(...verticalHits)) / 2,
  };
}

async function ringGesturePoints(
  page: Page,
  canvas: Locator,
  pivot: CanvasPoint,
): Promise<{ readonly start: CanvasPoint; readonly tangent: CanvasPoint }> {
  for (const radius of [36, 44, 52, 60, 68, 76]) {
    for (let degrees = 0; degrees < 360; degrees += 15) {
      const radians = (degrees * Math.PI) / 180;
      const radial = { x: Math.cos(radians), y: Math.sin(radians) };
      const start = { x: pivot.x + radial.x * radius, y: pivot.y + radial.y * radius };
      await page.mouse.move(start.x, start.y);
      if ((await canvas.getAttribute('data-transform-hover-axis')) !== 'none') {
        return { start, tangent: { x: -radial.y, y: radial.x } };
      }
    }
  }
  throw new Error('Could not hit the selected local rotation ring.');
}

async function dragSelectedRing(options: {
  readonly page: Page;
  readonly canvas: Locator;
  readonly pivot: CanvasPoint;
  readonly direction: 1 | -1;
  readonly distance?: number;
}) {
  const { page, canvas, pivot, direction, distance = 110 } = options;
  const points = await ringGesturePoints(page, canvas, pivot);
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-gizmo-dragging', 'true');
  await page.mouse.move(
    points.start.x + points.tangent.x * distance * direction,
    points.start.y + points.tangent.y * distance * direction,
    { steps: 10 },
  );
  const preview = page.getByTestId('model-open-reference-preview');
  const during = {
    admissibility: await preview.getAttribute('data-pose-admissibility'),
    blockers: await preview.getAttribute('data-pose-blockers'),
  };
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-gizmo-dragging', 'false');
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  return {
    ...during,
    sourceRevision: await canvas.getAttribute('data-source-revision'),
  };
}

test('ModelForm V9 live-drags head and leg while empty space remains the camera', async ({
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
  const preview = page.getByTestId('model-open-reference-preview');
  await expect(preview).toHaveAttribute('data-pose-controls', 'full-body-v9');
  await expect(page.getByTestId('model-open-reference-direct-pose-control-v9')).toBeVisible();
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  await expect(canvas).toHaveAttribute('data-joint-editor-mode', 'edit-pose');

  await expect(page.getByRole('button', { name: 'camera mode' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'edit pose mode' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /apply pose/i })).toHaveCount(0);
  await expect(preview.getByRole('slider')).toHaveCount(0);
  await expect(preview.getByLabel('Pose joint', { exact: true })).toHaveCount(0);
  await expect(preview.getByLabel('Joint axis', { exact: true })).toHaveCount(0);
  await expect(preview.getByRole('spinbutton', { name: 'Joint angle' })).toHaveCount(0);
  await expect(page.getByText(/visual reference only/i)).toHaveCount(0);
  await expect(page.getByText(/inverseKinematicsApplied=/i)).toHaveCount(0);
  await expect(page.getByText(/waist \/ hip \d\/2/i)).toHaveCount(0);
  const visibleToolbarButtons = await page
    .getByRole('toolbar', { name: 'Mannequin pose tools' })
    .getByRole('button')
    .allTextContents();
  expect(visibleToolbarButtons.map((label) => label.trim().toLowerCase())).toEqual([
    'symmetry',
    'undo',
    'reset',
  ]);

  const headPoint = await findMarker({ page, canvas, groupId: 'head-group', region: 'head' });
  const headRevision = await dragPositionTarget({
    page,
    canvas,
    start: headPoint,
    deltaX: 48,
    deltaY: -24,
  });
  const headPose = poseFromSourceRevision(headRevision);
  expect(
    Math.abs(headPose.headPitchDeg) +
      Math.abs(headPose.headYawDeg) +
      Math.abs(headPose.headSideDeg),
  ).toBeGreaterThan(0);

  const movedHeadPoint = await findMarker({
    page,
    canvas,
    groupId: 'head-group',
    region: 'head',
  });
  const secondHeadRevision = await dragPositionTarget({
    page,
    canvas,
    start: movedHeadPoint,
    deltaX: -30,
    deltaY: 32,
  });
  expect(secondHeadRevision).not.toBe(headRevision);
  const secondHeadPose = poseFromSourceRevision(secondHeadRevision);
  expect(
    Math.abs(secondHeadPose.headPitchDeg) +
      Math.abs(secondHeadPose.headYawDeg) +
      Math.abs(secondHeadPose.headSideDeg),
  ).toBeGreaterThan(0);

  // Return to the anatomical baseline before exercising the independent leg target. The second
  // head drag intentionally reaches a near-limit posture; composing that edge case with the ankle
  // drag is correctly rejected by the production admissibility gate.
  await page.getByRole('button', { name: 'reset', exact: true }).click();
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(secondHeadRevision);
  await expect(preview).toHaveAttribute('data-pose-admissibility', 'admitted');
  const resetRevision = await canvas.getAttribute('data-source-revision');
  await page.getByRole('button', { name: 'symmetry', exact: true }).click();
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(resetRevision);
  const independentRevision = await canvas.getAttribute('data-source-revision');
  expect(poseFromSourceRevision(independentRevision).legMode).toBe('independent');

  const legRevision = await dragPositionTargetWithAnatomicalCandidates({
    page,
    canvas,
    groupId: 'left-ankle',
    region: 'ankles',
    candidates: [
      { x: 34, y: -42 },
      { x: -34, y: -42 },
      { x: 18, y: -18 },
      { x: -18, y: -18 },
    ],
  });
  const legPose = poseFromSourceRevision(legRevision);
  expect(legPose.legMode).toBe('independent');
  expect(legPose.leftLeg).not.toEqual(legPose.rightLeg);
  expect(
    Math.abs(legPose.leftLeg.hipForwardDeg) +
      Math.abs(legPose.leftLeg.hipSideDeg) +
      Math.abs(legPose.leftLeg.kneeBendDeg) +
      Math.abs(legPose.leftLeg.ankleBendDeg),
  ).toBeGreaterThan(0);

  const cameraSource = await canvas.getAttribute('data-source-revision');
  const cameraRenderCount = Number(await canvas.getAttribute('data-render-count'));
  const cameraBefore = await canvas.screenshot();
  await dragEmptyCanvas(page, canvas);
  await expect(canvas).toHaveAttribute('data-source-revision', cameraSource ?? '');
  await expect(canvas).toHaveAttribute('data-selected-joint-group', 'left-ankle');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-render-count')))
    .toBeGreaterThan(cameraRenderCount);
  const cameraAfter = await canvas.screenshot();
  expect(cameraAfter.equals(cameraBefore)).toBe(false);

  expect(
    requests.filter(({ method }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)),
  ).toEqual([]);
  expect(requests.filter(({ url }) => new URL(url).pathname.startsWith('/api/'))).toEqual([]);
  await expect(page.getByTestId('model-form-smoke-mutation-calls')).toHaveText('0');
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('clean ModelForm V9 lowers linked arms beside the thighs with a 56 px wrist target', async ({
  page,
}) => {
  const requests: Array<{ method: string; url: string }> = [];
  page.on('request', (request) => requests.push({ method: request.method(), url: request.url() }));

  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );

  const initialWrist = await findMarker({
    page,
    canvas,
    groupId: 'left-wrist',
    region: 'wrists',
  });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  const target = {
    x: bounds.x + bounds.width / 2 + 30,
    y: bounds.y + bounds.height * 0.577,
  };
  const wristRevision = await dragPositionTarget({
    page,
    canvas,
    start: initialWrist,
    deltaX: target.x - initialWrist.x,
    deltaY: target.y - initialWrist.y,
  });
  const wristPose = poseFromSourceRevision(wristRevision);
  expect(wristPose.armMode).toBe('linked');
  expect(wristPose.leftArm).toEqual(wristPose.rightArm);
  expect(wristPose.leftArm.elbowBendDegrees).toBe(0);

  const leftShoulder = await findHoverMarkerCenter({
    page,
    canvas,
    groupId: 'left-shoulder-group',
    leftFraction: 0.5,
    rightFraction: 0.63,
    topFraction: 0.18,
    bottomFraction: 0.38,
  });
  // Move the selected rotation ring off the wrist before measuring its full 56 px position target.
  await expectPositionHit({
    page,
    canvas,
    point: leftShoulder,
    groupId: 'left-shoulder-group',
  });
  await findHoverMarkerCenter({
    page,
    canvas,
    groupId: 'right-shoulder-group',
    leftFraction: 0.37,
    rightFraction: 0.5,
    topFraction: 0.18,
    bottomFraction: 0.38,
  });
  const leftWrist = await findHoverMarkerCenter({
    page,
    canvas,
    groupId: 'left-wrist',
    leftFraction: 0.48,
    rightFraction: 0.62,
    topFraction: 0.34,
    bottomFraction: 0.58,
  });
  await findHoverMarkerCenter({
    page,
    canvas,
    groupId: 'right-wrist',
    leftFraction: 0.38,
    rightFraction: 0.52,
    topFraction: 0.34,
    bottomFraction: 0.58,
  });

  await expectPositionHit({
    page,
    canvas,
    point: { x: leftWrist.x + 24, y: leftWrist.y },
    groupId: 'left-wrist',
  });
  await expectPositionHit({
    page,
    canvas,
    point: leftShoulder,
    groupId: 'left-shoulder-group',
  });
  await expectPositionHit({
    page,
    canvas,
    point: { x: leftWrist.x + 27, y: leftWrist.y },
    groupId: 'left-wrist',
  });

  const ring = await ringGesturePoints(page, canvas, leftWrist);
  await page.mouse.move(ring.start.x, ring.start.y);
  await expect(canvas).toHaveAttribute('data-hovered-joint-group', '');
  await expect(canvas).toHaveCSS('cursor', 'grab');
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
  await expect(canvas).toHaveAttribute('data-gizmo-dragging', 'true');
  await page.mouse.up();

  const cameraSource = await canvas.getAttribute('data-source-revision');
  const cameraRenderCount = Number(await canvas.getAttribute('data-render-count'));
  await dragEmptyCanvas(page, canvas);
  await expect(canvas).toHaveAttribute('data-source-revision', cameraSource ?? '');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-render-count')))
    .toBeGreaterThan(cameraRenderCount);
  expect(
    requests.filter(({ method }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)),
  ).toEqual([]);
  expect(requests.filter(({ url }) => new URL(url).pathname.startsWith('/api/'))).toEqual([]);
  await expect(page.getByTestId('model-form-smoke-mutation-calls')).toHaveText('0');
});

test('direct ankle and wrist drags retain a non-crossing last-valid pose with ground support', async ({
  page,
}) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;

  const ankleStart = await findMarker({
    page,
    canvas,
    groupId: 'left-ankle',
    region: 'ankles',
  });
  await settlePointerOnEmptyCanvas(page, canvas);
  const legBefore = await canvas.screenshot();
  const legDrag = await attemptExtremePositionDrag({
    page,
    canvas,
    start: ankleStart,
    target: {
      x: bounds.x + bounds.width * 0.15,
      y: bounds.y + bounds.height * 0.48,
    },
    expectedBlocker: /leg-overlap|no-grounded-foot/u,
  });
  await settlePointerOnEmptyCanvas(page, canvas);
  const legAfter = await canvas.screenshot();
  expect(legDrag.sourceAfter).toBe(legDrag.sourceBefore);
  expect(legDrag.blockers).toMatch(/leg-overlap|no-grounded-foot/u);
  expect(legAfter.equals(legBefore)).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  const freshBox = await canvas.boundingBox();
  expect(freshBox).not.toBeNull();
  const freshBounds = freshBox!;
  const wristStart = await findMarker({
    page,
    canvas,
    groupId: 'left-wrist',
    region: 'wrists',
  });
  await settlePointerOnEmptyCanvas(page, canvas);
  const armBefore = await canvas.screenshot();
  const armDrag = await attemptExtremePositionDrag({
    page,
    canvas,
    start: wristStart,
    target: {
      x: freshBounds.x + freshBounds.width / 2,
      y: freshBounds.y + freshBounds.height * 0.32,
    },
    expectedBlocker: /arm-overlap/u,
  });
  await settlePointerOnEmptyCanvas(page, canvas);
  const armAfter = await canvas.screenshot();
  expect(armDrag.admissibility).toBe('blocked');
  expect(armDrag.blockers).toMatch(/arm-overlap/u);
  expect(armDrag.sourceAfter).toBe(armDrag.sourceBefore);
  expect(armAfter.equals(armBefore)).toBe(true);
  await expect(page.getByTestId('model-form-smoke-mutation-calls')).toHaveText('0');
});

test('side-view elbow ring admits anterior flexion and cannot reverse past neutral', async ({
  page,
}) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  const preview = page.getByTestId('model-open-reference-preview');
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  await page.getByRole('img', { name: /3D mannequin joint editor/i }).press('ArrowLeft');
  await expect(canvas).toHaveAttribute('data-view-preset', 'side');
  const marker = await findHoverMarker({
    page,
    canvas,
    groupId: 'left-elbow',
    xOffsets: [0, -18, 18, -36, 36, -54, 54, -72, 72],
    startFraction: 0.2,
    endFraction: 0.55,
  });
  const pivot = await refineHoverMarkerCenter({
    page,
    canvas,
    groupId: 'left-elbow',
    seed: marker,
  });
  await page.mouse.click(pivot.x, pivot.y);
  await expect(canvas).toHaveAttribute('data-selected-joint-group', 'left-elbow');
  await expect(canvas).toHaveAttribute('data-selected-joint-channel', 'elbowBendDeg');
  await expect(canvas).toHaveAttribute('data-transform-axis', 'z');

  await settlePointerOnEmptyCanvas(page, canvas);
  const neutralSource = await canvas.getAttribute('data-source-revision');
  const reverse = await dragSelectedRing({
    page,
    canvas,
    pivot,
    direction: 1,
    distance: 720,
  });
  await settlePointerOnEmptyCanvas(page, canvas);
  expect(reverse.admissibility).toBe('admitted');
  expect(reverse.blockers).toBe('');
  expect(reverse.sourceRevision).toBe(neutralSource);
  expect(poseFromSourceRevision(reverse.sourceRevision).leftArm.elbowBendDegrees).toBe(0);

  const flexed = await dragSelectedRing({
    page,
    canvas,
    pivot,
    direction: -1,
    distance: 720,
  });
  expect(flexed.admissibility).toBe('admitted');
  expect(flexed.blockers).toBe('');
  expect(flexed.sourceRevision).not.toBe(neutralSource);
  const flexedArm = poseFromSourceRevision(flexed.sourceRevision).leftArm;
  expect(flexedArm.shoulderRaiseDegrees).toBe(0);
  expect(flexedArm.shoulderForwardDegrees).toBe(0);
  expect(flexedArm.elbowBendDegrees).toBeGreaterThanOrEqual(30);
  expect(flexedArm.elbowBendDegrees).toBeLessThanOrEqual(100);
  expect(flexedArm.wristBendDegrees).toBe(0);
  await expect(preview).toHaveAttribute('data-pose-admissibility', 'admitted');

  await page.getByRole('img', { name: /3D mannequin joint editor/i }).press('ArrowLeft');
  await expect(canvas).toHaveAttribute('data-view-preset', 'side');
  const flexedElbowSeed = await findHoverMarker({
    page,
    canvas,
    groupId: 'left-elbow',
    xOffsets: [0, -18, 18, -36, 36, -54, 54],
    startFraction: 0.2,
    endFraction: 0.55,
  });
  const flexedElbow = await refineHoverMarkerCenter({
    page,
    canvas,
    groupId: 'left-elbow',
    seed: flexedElbowSeed,
  });
  const flexedWristSeed = await findHoverMarker({
    page,
    canvas,
    groupId: 'left-wrist',
    xOffsets: [-36, -54, -18, -72, 0, -90, 18, -108, 36],
    startFraction: 0.22,
    endFraction: 0.6,
  });
  const flexedWrist = await refineHoverMarkerCenter({
    page,
    canvas,
    groupId: 'left-wrist',
    seed: flexedWristSeed,
  });
  expect(flexedWrist.x).toBeLessThan(flexedElbow.x - 8);
  await settlePointerOnEmptyCanvas(page, canvas);
  await canvas.screenshot({ path: '/tmp/model-form-v9-safe-elbow-side.png' });
});

test('under-bust rebuilds an independent ribcage band without resetting the V9 pose', async ({
  page,
}) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  const status = page.getByTestId('model-open-reference-preview-status');
  await expect(status).toContainText('Preview partial: A-rest', { timeout: 180_000 });
  await page.getByRole('img', { name: /3D mannequin joint editor/i }).press('ArrowLeft');
  await expect(canvas).toHaveAttribute('data-view-preset', 'side');
  const marker = await findHoverMarker({
    page,
    canvas,
    groupId: 'left-elbow',
    xOffsets: [0, -18, 18, -36, 36, -54, 54, -72, 72],
    startFraction: 0.2,
    endFraction: 0.55,
  });
  const pivot = await refineHoverMarkerCenter({
    page,
    canvas,
    groupId: 'left-elbow',
    seed: marker,
  });
  await page.mouse.click(pivot.x, pivot.y);
  const flexed = await dragSelectedRing({
    page,
    canvas,
    pivot,
    direction: -1,
    distance: 720,
  });
  expect(flexed.admissibility).toBe('admitted');
  const posedSource = flexed.sourceRevision;
  const posedV9 = poseFromSourceRevision(posedSource);
  expect(posedV9.leftArm.elbowBendDegrees).toBeGreaterThanOrEqual(30);

  await page.getByRole('img', { name: /3D mannequin joint editor/i }).press('Home');
  await expect(canvas).toHaveAttribute('data-view-preset', 'front');
  await settlePointerOnEmptyCanvas(page, canvas);
  const baselineRibcageBand = await ribcageBandScreenshot(page, canvas);
  const chest = page.getByRole('textbox', { name: 'chest', exact: true });
  const underBust = page.getByRole('textbox', { name: 'under bust', exact: true });
  await expect(chest).toHaveValue('920');
  await expect(underBust).toHaveValue('');
  await underBust.fill('800');
  await underBust.blur();
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(posedSource);
  await expect(status).toContainText('Preview partial', { timeout: 180_000 });
  const underBustSource = await canvas.getAttribute('data-source-revision');
  expect(underBustSource).toMatch(/represented=[^;]*underBustCircumferenceMm/u);
  expect(underBustSource).toMatch(/represented=[^;]*chestCircumferenceMm/u);
  expect(poseFromSourceRevision(underBustSource)).toEqual(posedV9);
  await expect(chest).toHaveValue('920');
  await expect(underBust).toHaveValue('800');
  await expect(canvas).toHaveAttribute('data-view-preset', 'front');
  await settlePointerOnEmptyCanvas(page, canvas);
  const underBustRibcageBand = await ribcageBandScreenshot(page, canvas);
  expect(underBustRibcageBand.equals(baselineRibcageBand)).toBe(false);
});

test('hostile wrist drag keeps the last-valid source and canvas', async ({ page }) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  const preview = page.getByTestId('model-open-reference-preview');
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  const wrist = await findHoverMarker({
    page,
    canvas,
    groupId: 'left-wrist',
    xOffsets: [150, 132, 168, 114, 186, 96, 204],
    startFraction: 0.2,
    endFraction: 0.6,
  });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  const sourceBefore = await canvas.getAttribute('data-source-revision');
  await page.mouse.move(wrist.x, wrist.y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'true');
  await expect(canvas).toHaveAttribute('data-selected-joint-group', 'left-wrist');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const lastValidCanvas = await canvas.screenshot();
  const lastValidOverlaySignature = await canvas.getAttribute('data-live-joint-overlay-signature');
  const lastValidOverlayStatus = await canvas.getAttribute('data-live-joint-overlay-status');
  const lastValidVisibility = await canvas.getAttribute('data-selected-joint-visibility');
  await page.mouse.move(bounds.x + bounds.width * 0.45, bounds.y + bounds.height * 0.5);
  await expect(preview).toHaveAttribute('data-pose-admissibility', 'blocked');
  await expect(preview).toHaveAttribute(
    'data-pose-blockers',
    /left-arm-overlap|left-elbow-direction/u,
  );
  const blockedFeedback = page.getByTestId('model-open-reference-pose-blocked-status');
  await expect(blockedFeedback).toContainText(
    /limb would overlap|joint would bend in the wrong direction/u,
  );
  await expect(blockedFeedback).not.toContainText(/left-arm-overlap|left-elbow-direction/u);
  await expect(canvas).toHaveAttribute('data-source-revision', sourceBefore ?? '');
  const blockedCanvas = await canvas.screenshot({
    path: '/tmp/model-form-v9-hostile-wrist-blocked.png',
  });
  expect(blockedCanvas.equals(lastValidCanvas)).toBe(true);
  await expect(canvas).toHaveAttribute(
    'data-live-joint-overlay-signature',
    lastValidOverlaySignature ?? '',
  );
  await expect(canvas).toHaveAttribute(
    'data-live-joint-overlay-status',
    lastValidOverlayStatus ?? 'applied',
  );
  await expect(canvas).toHaveAttribute(
    'data-selected-joint-visibility',
    lastValidVisibility ?? 'visible',
  );
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  await expect(canvas).toHaveAttribute('data-source-revision', sourceBefore ?? '');
});

test('rear-view anterior arm stays admitted and uses an occluded-joint X-ray cue', async ({
  page,
}) => {
  await page.goto(DEV_ROUTE, { waitUntil: 'domcontentloaded' });
  const preview = page.getByTestId('model-open-reference-preview');
  const canvas = page.getByTestId('measurement-watertight-surface-v1-canvas');
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial: A-rest',
    { timeout: 180_000 },
  );
  const image = page.getByRole('img', { name: /3D mannequin joint editor/i });
  await image.press('ArrowRight');
  await expect(canvas).toHaveAttribute('data-view-preset', 'back');
  await page.getByRole('button', { name: 'symmetry' }).click();

  const wrist = await findHoverMarker({
    page,
    canvas,
    groupId: 'right-wrist',
    xOffsets: [150, 132, 168, 114, 186, 96, 204, -150, -132, -168],
    startFraction: 0.2,
    endFraction: 0.62,
  });
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const bounds = box!;
  const sourceBefore = await canvas.getAttribute('data-source-revision');
  await page.mouse.move(wrist.x, wrist.y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'true');
  await expect(canvas).toHaveAttribute('data-selected-joint-group', 'right-wrist');
  const finalTarget = {
    x: bounds.x + bounds.width * 0.55,
    y: bounds.y + bounds.height * 0.36,
  };
  const intermediateTarget = {
    x: wrist.x + (finalTarget.x - wrist.x) * 0.5,
    y: wrist.y + (finalTarget.y - wrist.y) * 0.5,
  };
  await page.mouse.move(intermediateTarget.x, intermediateTarget.y, { steps: 6 });
  await expect(canvas).toHaveAttribute('data-live-position-status', 'updated');
  await expect(canvas).toHaveAttribute('data-live-joint-overlay-status', 'updated');
  await expect(preview).toHaveAttribute('data-pose-admissibility', 'admitted');
  const intermediateSignature = await canvas.getAttribute('data-live-joint-overlay-signature');
  const intermediateGroups = liveJointOverlayGroupsFromSignature(intermediateSignature);
  const intermediateCanvas = await canvas.screenshot();

  await page.mouse.move(finalTarget.x, finalTarget.y, { steps: 6 });
  await expect(canvas).toHaveAttribute('data-live-position-status', 'updated');
  await expect(canvas).toHaveAttribute('data-live-joint-overlay-status', 'updated');
  await expect(preview).toHaveAttribute('data-pose-admissibility', 'admitted');
  await expect(preview).toHaveAttribute('data-pose-blockers', '');
  await expect(canvas).toHaveAttribute('data-view-preset', 'back');
  await expect
    .poll(() => canvas.getAttribute('data-live-joint-overlay-signature'))
    .not.toBe(intermediateSignature);
  const finalSignature = await canvas.getAttribute('data-live-joint-overlay-signature');
  const finalGroups = liveJointOverlayGroupsFromSignature(finalSignature);
  const intermediateWrist = intermediateGroups.get('right-wrist');
  const finalWrist = finalGroups.get('right-wrist');
  const intermediateElbow = intermediateGroups.get('right-elbow');
  const finalElbow = finalGroups.get('right-elbow');
  expect(intermediateWrist).toBeDefined();
  expect(finalWrist).toBeDefined();
  expect(intermediateElbow).toBeDefined();
  expect(finalElbow).toBeDefined();
  expect(liveJointDistanceV10(intermediateWrist!.headM, finalWrist!.headM)).toBeGreaterThan(1e-5);
  expect(liveJointDistanceV10(intermediateElbow!.headM, finalElbow!.headM)).toBeGreaterThan(1e-5);
  const finalValidCanvas = await canvas.screenshot();
  expect(finalValidCanvas.equals(intermediateCanvas)).toBe(false);
  await expect(canvas).toHaveAttribute('data-selected-joint-visibility', 'occluded', {
    timeout: 15_000,
  });
  const finalVisibility = await canvas.getAttribute('data-selected-joint-visibility');

  await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5);
  await expect(preview).toHaveAttribute('data-pose-admissibility', 'blocked');
  await expect(preview).toHaveAttribute(
    'data-pose-blockers',
    /right-arm-overlap|right-elbow-direction/u,
  );
  await expect(page.getByTestId('model-open-reference-pose-blocked-status')).toContainText(
    /limb would overlap|joint would bend in the wrong direction/u,
  );
  await expect(page.getByTestId('model-open-reference-pose-blocked-status')).not.toContainText(
    /right-arm-overlap|right-elbow-direction/u,
  );
  await expect(canvas).toHaveAttribute('data-live-joint-overlay-status', 'updated');
  await expect(canvas).toHaveAttribute('data-live-joint-overlay-signature', finalSignature ?? '');
  await expect(canvas).toHaveAttribute(
    'data-selected-joint-visibility',
    finalVisibility ?? 'occluded',
  );
  const hostileCanvas = await canvas.screenshot({
    path: '/tmp/model-form-v10-live-overlay-hostile-retained.png',
  });
  expect(hostileCanvas.equals(finalValidCanvas)).toBe(true);
  await expect(canvas).toHaveAttribute('data-source-revision', sourceBefore ?? '');
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  await expect(canvas).toHaveAttribute('data-view-preset', 'back');
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(sourceBefore);
  await expect(canvas).toHaveAttribute('data-selected-joint-visibility', 'occluded', {
    timeout: 15_000,
  });
  await canvas.screenshot({ path: '/tmp/model-form-v9-rear-occluded-xray.png' });
  await image.press('Home');
  await expect(canvas).toHaveAttribute('data-view-preset', 'front');
  await expect(canvas).toHaveAttribute('data-selected-joint-visibility', 'visible', {
    timeout: 15_000,
  });
  await settlePointerOnEmptyCanvas(page, canvas);
  const cameraSource = await canvas.getAttribute('data-source-revision');
  const cameraRenderCount = Number(await canvas.getAttribute('data-render-count'));
  const cameraBefore = await canvas.screenshot();
  await dragEmptyCanvas(page, canvas);
  await expect(canvas).toHaveAttribute('data-source-revision', cameraSource ?? '');
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-render-count')))
    .toBeGreaterThan(cameraRenderCount);
  const cameraAfter = await canvas.screenshot();
  expect(cameraAfter.equals(cameraBefore)).toBe(false);
});
