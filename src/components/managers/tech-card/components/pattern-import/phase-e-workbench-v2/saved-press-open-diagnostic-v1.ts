import { abortableAdminService } from 'api/api';
import type { common_Size } from 'api/proto-http/admin';
import { prepareActualBodySourceCutContactV1 } from 'components/cloth-simulation-spike/actual-body-source-cut-contact-v1';
import {
  projectCurrentModelDisplayedTriangleBodyInputV1,
  type ModelDisplayedTriangleBodyOwnedInputV1,
} from 'components/cloth-simulation-spike/model-displayed-triangle-body-input-v1';
import {
  prepareRegisteredSourceCutPreviewV1,
  type RegisteredSourceCutPreviewInputV1,
} from 'components/cloth-simulation-spike/prepare-registered-source-cut-preview-v1';
import { runRegisteredSourceCutPreviewV1 } from 'components/cloth-simulation-spike/run-directed-source-cut-preview-v1';
import type { DxfGarmentExplicitPiecePlacementV1 } from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import { prepareSourceCutContactMeshV1 } from 'lib/cloth/runtime/cpu/source-cut-contact-mesh-v1';
import { snapshotGarmentStagedSourceCutCoreV1 } from 'lib/cloth/runtime/webgpu/garment-staged-source-cut-core-v1';
import type { XpbdDeviceLease } from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import { sha256Hex } from 'lib/features/sha256';
import type { CadWorkbenchSavedPatternScopeV1 } from './cad-workbench-physical-host-v1';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from './saved-card-production-projection-v1';
import { readSavedCompleteAssemblyNativeStitchAnchorsV1 } from './saved-complete-assembly-native-stitch-anchors-v1';
import { readCurrentSavedNeutralPlacementModelV1 } from './saved-cross-material-placement-model-binding-v1';
import { resolveSavedFullAssemblyDiagnosticProfileV1 } from './saved-full-assembly-diagnostic-profile-v1';
import {
  projectSavedNativePressOpenTargetV1,
  type SavedNativePressOpenTargetV1,
} from './saved-native-press-open-target-v1';
import { readSavedWholeAssemblyPlacementDocumentV10 } from './saved-whole-assembly-placement-document-v10';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 } from './zero-operation-saved-card-authority-v1';

export const SAVED_PRESS_OPEN_DIAGNOSTIC_DEGREES_V1 = 30;
const activation = [{ requestedReductionM: 0, maximumReductionM: 0 }] as const;

const hashPositions = (positions: Float32Array) =>
  sha256Hex(new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength));

/** Read the saved grade and mannequin, then prepare a separate two-piece comparison. */
export async function prepareSavedPressOpenDiagnosticV1(
  input: Readonly<{
    pattern: CadWorkbenchSavedPatternScopeV1;
    operationNumber: number;
    authority: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1;
    dictionary: readonly common_Size[];
    orderSizeIds: (ids: number[]) => number[];
    sizeNameById: ReadonlyMap<number, string>;
    body: ModelDisplayedTriangleBodyOwnedInputV1;
    isCurrent: () => boolean;
  }>,
  signal: AbortSignal,
) {
  const { pattern, operationNumber, authority, dictionary, orderSizeIds, sizeNameById, body } =
    input;
  const isCurrent = () => !signal.aborted && input.isCurrent() && body.isCurrent();
  const requireCurrent = () => {
    signal.throwIfAborted();
    if (!isCurrent()) throw new Error('The Press operation, pattern size, or mannequin changed.');
  };
  requireCurrent();
  if (pattern.row.scopeKey !== 'main') throw new Error('Select the saved Main pattern set.');
  const exact = await authority.resolveExactCurrentCard(pattern.row, signal);
  const projection = {
    card: buildPatternImportDxfPhaseESavedCardContextV1(exact.techCard, orderSizeIds, sizeNameById),
    cardLockVersion: exact.row.cardLockVersion,
  };
  const grade = projection.card.sizes.filter(({ token }) => token === pattern.sizeToken);
  if (grade.length !== 1) throw new Error('Select one exact saved size.');
  const [complete, displayedModel] = await Promise.all([
    readCompleteSavedAssemblySourceV1(abortableAdminService(signal), exact.row, {}, signal),
    readCurrentSavedNeutralPlacementModelV1(body, signal),
  ]);
  const garmentLayout = await readSavedWholeAssemblyPlacementDocumentV10(complete, signal);
  if (
    garmentLayout.layout.sizeId !== grade[0].sizeId ||
    garmentLayout.layout.sizeToken !== pattern.sizeToken ||
    canonical(garmentLayout.body) !== canonical(displayedModel)
  )
    throw new Error('Select the same saved size and mannequin as the whole assembly placement.');
  const displayed = projectCurrentModelDisplayedTriangleBodyInputV1(body);
  if (!displayed) throw new Error('The displayed mannequin is no longer current.');
  const native = await readSavedCompleteAssemblyNativeStitchAnchorsV1(
    complete,
    projection,
    { card: exact.techCard, sizeDictionary: dictionary, selectedSizeId: grade[0].sizeId },
    signal,
  );
  requireCurrent();
  const target = projectSavedNativePressOpenTargetV1(native, operationNumber);
  const verify = async (active: AbortSignal) => {
    const fresh = await readCompleteSavedAssemblySourceV1(
      abortableAdminService(active),
      exact.row,
      {
        expectedServerAssemblyRevision: complete.serverAssemblyRevision,
        expectedCompleteSourceSha256: complete.sourceSha256,
      },
      active,
    );
    if (!isCurrent() || fresh.priorCarrier?.sidecarSha256 !== garmentLayout.sha256)
      throw new Error('The saved Assembly Order or its placement changed during Press preview.');
  };

  const mannequin = prepareActualBodySourceCutContactV1(
    displayed.bodyPositionsM,
    displayed.bodyTriangles,
    130_000_000,
  );
  const signedVolume = mannequin.bodyAudit.topology.signedVolumeM3;
  if (Math.abs(signedVolume) <= 1e-12)
    throw new Error('The displayed mannequin has no verified outward surface.');
  const runnerBody = {
    positionsM: displayed.bodyPositionsM,
    triangles: displayed.bodyTriangles,
    positionsSha256: displayed.hashes.bodyPositionsFloat32LeSha256,
    trianglesSha256: displayed.hashes.bodyTrianglesUint32LeSha256,
    outwardSign: signedVolume > 0 ? (1 as const) : (-1 as const),
  };
  const plan = await prepareComparison(
    target,
    garmentLayout.sha256,
    runnerBody.positionsSha256,
    isCurrent,
    signal,
  );
  const before = prepareRegisteredSourceCutPreviewV1(plan[0], signal);
  const after = prepareRegisteredSourceCutPreviewV1(plan[1], signal);
  const a = snapshotGarmentStagedSourceCutCoreV1(before.material);
  const b = snapshotGarmentStagedSourceCutCoreV1(after.material);
  const mesh = prepareSourceCutContactMeshV1(a.cut, 35_000);
  const [initialPositionsSha256, pressedPositionsSha256, baselineRest, pressedRest] =
    await Promise.all([
      hashPositions(a.uploads.positions),
      hashPositions(b.uploads.positions),
      sha256Hex(new Uint8Array(a.uploads.cutBendRest)),
      sha256Hex(new Uint8Array(b.uploads.cutBendRest)),
    ]);
  if (
    !initialPositionsSha256 ||
    initialPositionsSha256 !== pressedPositionsSha256 ||
    !baselineRest ||
    !pressedRest ||
    baselineRest === pressedRest ||
    !mesh.validateSelfIntersection(a.uploads.positions).passed ||
    !mannequin.validateFrame(mesh, a.uploads.positions).passed
  )
    throw new Error(
      'The two Press cases must start from the same clear cut and differ at the hinges.',
    );
  await verify(signal);
  return {
    target,
    plan,
    body: runnerBody,
    verify,
    isCurrent,
    initialPositionsSha256,
    initialCutFaces: mesh.triangles.length / 3,
    baselineRest,
    pressedRest,
    initial: {
      positionsM: before.surface.project(a.uploads.positions),
      drawRanges: before.surface.drawRanges,
    },
  };
}

async function prepareComparison(
  target: SavedNativePressOpenTargetV1,
  layoutSha256: string,
  bodySha256: string,
  isCurrent: () => boolean,
  signal: AbortSignal,
) {
  const profile = resolveSavedFullAssemblyDiagnosticProfileV1(
    'browser-medium-isotropic-diagnostic',
    '1',
  );
  if (!profile) throw new Error('The Press diagnostic material profile is unavailable.');
  const material = {
    ...profile.material,
    id: 'yoke-fine-press-diagnostic-material',
    validSolverRange: { ...profile.material.validSolverRange, minEdgeM: 0.001 },
  };
  const pieces = target.pieces.map(({ pieceId, ringMm, lineMm }, index) => {
    const side = target.stitch.sections[0][index === 0 ? 'sideA' : 'sideB'];
    const { startMm: a, endMm: b } = side.intervals[0];
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    const tx = dx / length,
      ty = dy / length;
    // Fixed comparison pose beside the verified body. It never replaces the saved layout.
    const placement: DxfGarmentExplicitPiecePlacementV1 = {
      pieceId,
      sourceOriginM: [(a[0] + b[0]) / 2000, (a[1] + b[1]) / 2000, 0],
      rotationRowMajor: [ty, -tx, 0, tx, ty, 0, 0, 0, 1],
      translationM: [0.28, 1.05, index === 0 ? 0.27 : 0.273],
    };
    return { pieceId, ringMm, angleDeg: 0, phaseX: 0.365, phaseY: 0.815, placement, lineMm };
  });
  const pieceIds = pieces.map(({ pieceId }) => pieceId);
  const makeSource = async (degrees: number): Promise<RegisteredSourceCutPreviewInputV1> => {
    const sourceFingerprint = await sha256Hex(
      new TextEncoder().encode(
        canonical({
          intent: 'saved-press-open-comparison/1',
          complete: target.sourceSha256,
          layoutSha256,
          bodySha256,
          operation: target.operationNumber,
          pieces,
          stitch: target.stitch,
          degrees,
        }),
      ),
    );
    signal.throwIfAborted();
    return {
      sourceFingerprint,
      spacingMm: 12,
      pieces: pieces.map(({ lineMm, ...piece }) => ({
        ...piece,
        pressAxes: [{ lineMm, angleRad: (degrees * Math.PI) / 180, maximumHingeLengthMm: 8 }],
      })),
      stitches: [target.stitch],
      sampling: { minSegmentMm: 1, maxSegmentMm: 5.001, maxPairs: 512 },
      material: {
        grains: pieceIds.map((pieceId) => ({ pieceId, grainDegrees: 0 })),
        assignments: [{ id: material.id, materialRevision: material.revision, pieceIds }],
        materials: [material],
        continuumMaterials: [{ ...profile.continuumMaterial, materialId: material.id }],
        materialOptions: profile.materialSolver,
      },
      parameters: {
        dtS: profile.materialSolver.dtS,
        solverIterations: profile.materialSolver.solverIterations,
        frameCount: 1,
        gravityMps2Y: 0,
        windAccelerationMps2Z: 0,
        distanceComplianceMPerN: 2e-7,
        seamComplianceMPerN: 1e-8,
      },
      assertCurrentSource: isCurrent,
    };
  };
  return Promise.all([makeSource(0), makeSource(SAVED_PRESS_OPEN_DIAGNOSTIC_DEGREES_V1)] as const);
}

export async function runSavedPressOpenDiagnosticV1(
  prepared: Awaited<ReturnType<typeof prepareSavedPressOpenDiagnosticV1>>,
  lease: XpbdDeviceLease,
  signal: AbortSignal,
) {
  const run = (source: RegisteredSourceCutPreviewInputV1) =>
    runRegisteredSourceCutPreviewV1(
      {
        source,
        body: prepared.body,
        expectedInitialPositionsSha256: prepared.initialPositionsSha256,
        ownedLease: lease,
        schedule: activation,
      },
      signal,
    );
  await prepared.verify(signal);
  const control = await run(prepared.plan[0]);
  const pressed = await run(prepared.plan[1]);
  if (
    !pressed.frame.frame ||
    control.frame.frame !== pressed.frame.frame ||
    control.positionsM.length !== pressed.positionsM.length ||
    canonical(control.drawRanges) !== canonical(pressed.drawRanges)
  )
    throw new Error(
      'Press comparison requires the same full cut and two accepted physical frames.',
    );

  let maximumNormalDisplacementMm = 0;
  for (let i = 2; i < control.positionsM.length; i += 3) {
    maximumNormalDisplacementMm = Math.max(
      maximumNormalDisplacementMm,
      1000 * Math.abs(pressed.positionsM[i] - control.positionsM[i]),
    );
  }
  if (!(maximumNormalDisplacementMm > 0))
    throw new Error('The Press target did not produce a measurable response.');
  await prepared.verify(signal);
  return { control, pressed, maximumNormalDisplacementMm, isCurrent: prepared.isCurrent };
}
