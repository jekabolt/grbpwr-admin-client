import { createHash } from 'node:crypto';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

const MODEL_ID = 8401;
const DETAIL_ROUTE = `/models/${MODEL_ID}`;
const INITIAL_REVISION = '9007199254740993';

interface DirectPoseV9 {
  readonly bodyFlexionDegrees: number;
  readonly bodySideBendDegrees: number;
  readonly bodyTwistDegrees: number;
  readonly armMode: 'linked' | 'independent';
  readonly leftArm: ArmPose;
  readonly rightArm: ArmPose;
  readonly headPitchDeg: number;
  readonly headYawDeg: number;
  readonly headSideDeg: number;
  readonly shoulderProtractionDeg: number;
  readonly shoulderElevationDeg: number;
  readonly shoulderLevelDeg: number;
  readonly legMode: 'linked' | 'independent';
  readonly leftLeg: LegPose;
  readonly rightLeg: LegPose;
}

interface ArmPose {
  readonly shoulderRaiseDegrees: number;
  readonly shoulderForwardDegrees: number;
  readonly elbowBendDegrees: number;
  readonly wristBendDegrees: number;
}

interface LegPose {
  readonly hipForwardDeg: number;
  readonly hipSideDeg: number;
  readonly kneeBendDeg: number;
  readonly ankleBendDeg: number;
}

interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

const ZERO_ARM: ArmPose = Object.freeze({
  shoulderRaiseDegrees: 0,
  shoulderForwardDegrees: 0,
  elbowBendDegrees: 0,
  wristBendDegrees: 0,
});
const ZERO_LEG: LegPose = Object.freeze({
  hipForwardDeg: 0,
  hipSideDeg: 0,
  kneeBendDeg: 0,
  ankleBendDeg: 0,
});

function pose(overrides: Partial<DirectPoseV9> = {}): DirectPoseV9 {
  return Object.freeze({
    bodyFlexionDegrees: 0,
    bodySideBendDegrees: 0,
    bodyTwistDegrees: 0,
    armMode: 'linked' as const,
    leftArm: ZERO_ARM,
    rightArm: ZERO_ARM,
    headPitchDeg: 0,
    headYawDeg: 0,
    headSideDeg: 0,
    shoulderProtractionDeg: 0,
    shoulderElevationDeg: 0,
    shoulderLevelDeg: 0,
    legMode: 'linked' as const,
    leftLeg: ZERO_LEG,
    rightLeg: ZERO_LEG,
    ...overrides,
  });
}

function storedModel() {
  return {
    id: MODEL_ID,
    model: {
      name: 'durable pose detail fixture',
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

function canonicalDocument(value: DirectPoseV9) {
  return {
    schema: 'grbpwr.model-mannequin-pose/v2',
    poseSpace: 'makehuman-open-reference/direct-pose-v9',
    pose: value,
  };
}

function canonicalSha(value: DirectPoseV9) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalDocument(value)))
    .digest('hex');
}

function wirePose(value: DirectPoseV9) {
  return {
    schemaVersion: 2,
    poseSpace: 'MODEL_MANNEQUIN_POSE_SPACE_MAKEHUMAN_OPEN_REFERENCE_DIRECT_POSE_V9',
    bodyFlexionDegrees: value.bodyFlexionDegrees,
    bodySideBendDegrees: value.bodySideBendDegrees,
    bodyTwistDegrees: value.bodyTwistDegrees,
    armMode:
      value.armMode === 'linked'
        ? 'MODEL_MANNEQUIN_ARM_MODE_LINKED'
        : 'MODEL_MANNEQUIN_ARM_MODE_INDEPENDENT',
    leftArm: value.leftArm,
    rightArm: value.rightArm,
    headPitchDegrees: value.headPitchDeg,
    headYawDegrees: value.headYawDeg,
    headSideDegrees: value.headSideDeg,
    legMode:
      value.legMode === 'linked'
        ? 'MODEL_MANNEQUIN_LEG_MODE_LINKED'
        : 'MODEL_MANNEQUIN_LEG_MODE_INDEPENDENT',
    leftLeg: {
      hipForwardDegrees: value.leftLeg.hipForwardDeg,
      hipSideDegrees: value.leftLeg.hipSideDeg,
      kneeBendDegrees: value.leftLeg.kneeBendDeg,
      ankleBendDegrees: value.leftLeg.ankleBendDeg,
    },
    rightLeg: {
      hipForwardDegrees: value.rightLeg.hipForwardDeg,
      hipSideDegrees: value.rightLeg.hipSideDeg,
      kneeBendDegrees: value.rightLeg.kneeBendDeg,
      ankleBendDegrees: value.rightLeg.ankleBendDeg,
    },
    canonicalSha256: canonicalSha(value),
    shoulderProtractionDegrees: value.shoulderProtractionDeg,
    shoulderElevationDegrees: value.shoulderElevationDeg,
    shoulderLevelDegrees: value.shoulderLevelDeg,
  };
}

function storedPose(value: DirectPoseV9, revision = INITIAL_REVISION) {
  return {
    modelId: MODEL_ID,
    pose: wirePose(value),
    revision,
    updatedAt: '2026-11-15T00:00:00Z',
    updatedBy: 'browser-gate',
  };
}

function directPoseFromWire(value: ReturnType<typeof wirePose>): DirectPoseV9 {
  return pose({
    bodyFlexionDegrees: value.bodyFlexionDegrees,
    bodySideBendDegrees: value.bodySideBendDegrees,
    bodyTwistDegrees: value.bodyTwistDegrees,
    armMode: value.armMode === 'MODEL_MANNEQUIN_ARM_MODE_LINKED' ? 'linked' : 'independent',
    leftArm: value.leftArm,
    rightArm: value.rightArm,
    headPitchDeg: value.headPitchDegrees,
    headYawDeg: value.headYawDegrees,
    headSideDeg: value.headSideDegrees,
    legMode: value.legMode === 'MODEL_MANNEQUIN_LEG_MODE_LINKED' ? 'linked' : 'independent',
    leftLeg: {
      hipForwardDeg: value.leftLeg.hipForwardDegrees,
      hipSideDeg: value.leftLeg.hipSideDegrees,
      kneeBendDeg: value.leftLeg.kneeBendDegrees,
      ankleBendDeg: value.leftLeg.ankleBendDegrees,
    },
    rightLeg: {
      hipForwardDeg: value.rightLeg.hipForwardDegrees,
      hipSideDeg: value.rightLeg.hipSideDegrees,
      kneeBendDeg: value.rightLeg.kneeBendDegrees,
      ankleBendDeg: value.rightLeg.ankleBendDegrees,
    },
    shoulderProtractionDeg: value.shoulderProtractionDegrees,
    shoulderElevationDeg: value.shoulderElevationDegrees,
    shoulderLevelDeg: value.shoulderLevelDegrees,
  });
}

function poseFromSourceRevision(sourceRevision: string | null): DirectPoseV9 {
  const encoded = sourceRevision?.match(/(?:^|;)editorPoseV9=([^;]+)/u)?.[1];
  if (!encoded) throw new Error('The V9 pose is missing from the source revision.');
  return JSON.parse(decodeURIComponent(encoded)) as DirectPoseV9;
}

function expectNeutralPose(value: DirectPoseV9) {
  const numbers = (candidate: unknown): number[] => {
    if (typeof candidate === 'number') return [candidate];
    if (!candidate || typeof candidate !== 'object') return [];
    return Object.values(candidate).flatMap(numbers);
  };
  expect(numbers(value).every((number) => number === 0)).toBe(true);
}

type PoseReadMode = 'absent' | 'error' | 'stored';

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installBackend(
  page: Page,
  options: {
    readonly initialPose?: DirectPoseV9;
    readonly initialRead?: PoseReadMode;
    readonly canWrite?: boolean;
  } = {},
) {
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ exp: 4_102_444_800 }));
    localStorage.setItem('authToken', `test.${payload}.signature`);
  });
  let model = storedModel();
  let poseReadMode: PoseReadMode = options.initialRead ?? 'stored';
  let saved =
    poseReadMode === 'stored'
      ? storedPose(options.initialPose ?? pose({ headYawDeg: 6 }))
      : undefined;
  let poseGets = 0;
  let posePuts = 0;
  let modelUpdates = 0;
  let conflictNext = false;

  await page.route('**/api/admin/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith(`/api/admin/model/${MODEL_ID}/mannequin-pose`)) {
      if (request.method() === 'GET') {
        poseGets += 1;
        if (poseReadMode === 'error') {
          await fulfill(route, { message: 'pose backend unavailable' }, 503);
          return;
        }
        await fulfill(route, { storedPose: saved });
        return;
      }
      posePuts += 1;
      const requestBody = JSON.parse(request.postData() ?? '{}') as {
        expectedRevision?: string;
        pose?: ReturnType<typeof wirePose>;
      };
      if (conflictNext) {
        conflictNext = false;
        saved = storedPose(pose({ headYawDeg: -6 }), String(BigInt(saved?.revision ?? '0') + 1n));
        await fulfill(route, { message: 'revision conflict' }, 409);
        return;
      }
      expect(requestBody.expectedRevision).toBe(saved?.revision);
      expect(typeof requestBody.expectedRevision).toBe('string');
      if (!requestBody.pose) throw new Error('Pose PUT is missing pose.');
      saved = storedPose(
        directPoseFromWire(requestBody.pose),
        String(BigInt(saved?.revision ?? '0') + 1n),
      );
      await fulfill(route, { storedPose: saved });
      return;
    }
    if (pathname.endsWith(`/api/admin/model/${MODEL_ID}`) && request.method() === 'GET') {
      await fulfill(route, { model });
      return;
    }
    if (pathname.endsWith('/api/admin/model/update')) {
      modelUpdates += 1;
      const payload = JSON.parse(request.postData() ?? '{}') as {
        id?: number;
        model?: typeof model.model;
      };
      if (payload.id === MODEL_ID && payload.model) model = { ...model, model: payload.model };
      await fulfill(route, {});
      return;
    }
    if (pathname.endsWith('/api/admin/model/list')) {
      await fulfill(route, { models: [model], total: 1 });
      return;
    }
    if (pathname.endsWith('/api/admin/dictionary')) {
      await fulfill(route, { dictionary: {} });
      return;
    }
    if (pathname.endsWith('/api/admin/accounts/me')) {
      await fulfill(route, {
        account:
          options.canWrite === false
            ? {
                username: 'read-only-browser-gate',
                isSuper: false,
                permissions: [{ section: 'models', access: 'ACCESS_LEVEL_READ' }],
              }
            : { username: 'browser-gate', isSuper: true, permissions: [] },
      });
      return;
    }
    if (pathname.endsWith('/api/admin/accounts/sections')) {
      await fulfill(route, { sections: [{ key: 'models', name: 'Models' }] });
      return;
    }
    await fulfill(route, {});
  });

  return {
    allowPoseRead: () => {
      poseReadMode = saved ? 'stored' : 'absent';
    },
    forceConflict: () => {
      conflictNext = true;
    },
    poseGets: () => poseGets,
    posePuts: () => posePuts,
    modelUpdates: () => modelUpdates,
    stored: () => saved,
  };
}

async function waitForReadyDurable(page: Page) {
  await expect(page.getByText('edit model', { exact: true })).toBeVisible({ timeout: 180_000 });
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

// Desktop model form: joints drag and pose tools show only with `edit pose` on (off by default).
async function turnOnEditPose(page: Page) {
  const editPose = page.getByRole('checkbox', { name: 'edit pose', exact: true });
  if (!(await editPose.isChecked())) await editPose.check();
  await expect(editPose).toBeChecked();
}

async function commitPoseDrag(page: Page, canvas: Locator) {
  await turnOnEditPose(page);
  const sourceBefore = await canvas.getAttribute('data-source-revision');
  const head = await findHead(page, canvas);
  await page.mouse.move(head.x, head.y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'true');
  await page.mouse.move(head.x + 48, head.y - 24, { steps: 10 });
  await expect(page.getByTestId('model-open-reference-preview')).toHaveAttribute(
    'data-pose-admissibility',
    'admitted',
  );
  await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-position-dragging', 'false');
  await expect.poll(() => canvas.getAttribute('data-source-revision')).not.toBe(sourceBefore);
  await expect(page.getByTestId('model-open-reference-preview-status')).toContainText(
    'Preview partial',
  );
  return poseFromSourceRevision(await canvas.getAttribute('data-source-revision'));
}

test('durable pose loads, saves with lossless CAS, survives ordinary Save and reload', async ({
  page,
}) => {
  const initial = pose({ headYawDeg: 6 });
  const backend = await installBackend(page, { initialPose: initial });
  await page.goto(DETAIL_ROUTE, { waitUntil: 'domcontentloaded' });
  const canvas = await waitForReadyDurable(page);
  expect(poseFromSourceRevision(await canvas.getAttribute('data-source-revision'))).toEqual(
    initial,
  );
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toHaveText('pose · saved');

  const ordinarySave = page.getByRole('button', { name: 'save', exact: true });
  const comment = page.locator('textarea#comment');
  await expect(comment).toBeVisible();
  await comment.fill('ordinary model edit');
  await ordinarySave.press('Enter');
  await expect.poll(() => backend.modelUpdates()).toBe(1);
  expect(backend.posePuts()).toBe(0);

  const changed = await commitPoseDrag(page, canvas);
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toHaveText(
    'pose · unsaved',
  );
  await page.getByRole('button', { name: 'save pose', exact: true }).click();
  await expect.poll(() => backend.posePuts()).toBe(1);
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toHaveText('pose · saved');
  expect(backend.stored()?.revision).toBe('9007199254740994');

  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloaded = await waitForReadyDurable(page);
  const reloadedPose = poseFromSourceRevision(await reloaded.getAttribute('data-source-revision'));
  expect(reloadedPose).toEqual(changed);
  expect(reloadedPose.leftArm.elbowBendDegrees).toBe(0);
  expect(reloadedPose.rightArm.elbowBendDegrees).toBe(0);
});

test('successful empty GET alone hydrates a neutral durable baseline', async ({ page }) => {
  await installBackend(page, { initialRead: 'absent' });
  await page.goto(DETAIL_ROUTE, { waitUntil: 'domcontentloaded' });
  const canvas = await waitForReadyDurable(page);
  expectNeutralPose(poseFromSourceRevision(await canvas.getAttribute('data-source-revision')));
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toHaveText(
    'pose · not saved',
  );
});

test('failed GET blocks preview until an explicit retry succeeds', async ({ page }) => {
  const backend = await installBackend(page, { initialRead: 'error' });
  await page.goto(DETAIL_ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('saved pose not loaded')).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('model-open-reference-preview')).toHaveCount(0);
  expect(backend.poseGets()).toBe(2);
  backend.allowPoseRead();
  await page.getByRole('button', { name: 'retry pose', exact: true }).click();
  const canvas = await waitForReadyDurable(page);
  expectNeutralPose(poseFromSourceRevision(await canvas.getAttribute('data-source-revision')));
});

test('409 preserves local draft and requires explicit keep-mine or reload-theirs resolution', async ({
  page,
}) => {
  const backend = await installBackend(page, { initialPose: pose({ headYawDeg: 6 }) });
  await page.goto(DETAIL_ROUTE, { waitUntil: 'domcontentloaded' });
  const canvas = await waitForReadyDurable(page);
  const local = await commitPoseDrag(page, canvas);
  backend.forceConflict();
  await page.getByRole('button', { name: 'save pose', exact: true }).click();
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toHaveText(
    'pose · conflict · unsaved',
  );
  expect(poseFromSourceRevision(await canvas.getAttribute('data-source-revision'))).toEqual(local);
  await expect(page.getByRole('button', { name: 'keep mine', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'reload theirs', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'keep mine', exact: true }).click();
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toHaveText(
    'pose · unsaved',
  );
  expect(poseFromSourceRevision(await canvas.getAttribute('data-source-revision'))).toEqual(local);
  await page.getByRole('button', { name: 'save pose', exact: true }).click();
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toHaveText('pose · saved');

  await commitPoseDrag(page, canvas);
  backend.forceConflict();
  await page.getByRole('button', { name: 'save pose', exact: true }).click();
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toContainText('conflict');
  const theirs = backend.stored();
  await page.getByRole('button', { name: 'reload theirs', exact: true }).click();
  await expect(page.getByTestId('model-mannequin-pose-session-status')).toHaveText('pose · saved');
  expect(poseFromSourceRevision(await canvas.getAttribute('data-source-revision'))).toEqual(
    pose({ headYawDeg: -6 }),
  );
  expect(theirs?.revision).toBe('9007199254740996');
});

test('read-only model access never exposes the durable save action', async ({ page }) => {
  await installBackend(page, { canWrite: false });
  await page.goto(DETAIL_ROUTE, { waitUntil: 'domcontentloaded' });
  await waitForReadyDurable(page);
  await turnOnEditPose(page);
  await expect(page.getByRole('toolbar', { name: 'Mannequin pose tools' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'save pose', exact: true })).toHaveCount(0);
});
