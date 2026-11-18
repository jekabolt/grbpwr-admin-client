import type { DxfExactNativeCrossRowSeamGridRequestV1 } from 'lib/cloth/domain/dxf-exact-native-seam-grid-v1';
import { captureActualBodyTriangleGeometryV1 } from 'lib/cloth/body/actual-body-triangle-aabb-tree-v1';
import { decodeParticleMassGpuV1 } from 'lib/cloth/compiler/material-package';
import { compileRegularSourceCutCarrierV1 } from 'lib/cloth/compiler/regular-source-cut-carrier-v1';
import { compileSourceCutCarrierMaterialV1 } from 'lib/cloth/compiler/source-cut-carrier-material-v1';
import { compileSourceCutEmbeddedSeamGridV1 } from 'lib/cloth/compiler/source-cut-embedded-seam-grid-v1';
import { prepareSourceCutSurfaceProjectionV1 } from 'lib/cloth/runtime/cpu/source-cut-surface-projection-v1';
import {
  prepareGarmentStagedSourceCutCoreV1,
  prepareGarmentStagedSourceCutSeamsV1,
  snapshotGarmentStagedSourceCutCoreV1,
} from 'lib/cloth/runtime/webgpu/garment-staged-source-cut-core-v1';

import {
  continueStagedSourceCutFramesV1,
  runStagedSourceCutFramesV1,
} from './run-staged-source-cut-frames-v1';

type Core = Parameters<typeof prepareGarmentStagedSourceCutCoreV1>[0];
type Frame = Parameters<typeof runStagedSourceCutFramesV1>[0]['frame'];
type NativeSide = Omit<
  Parameters<typeof compileSourceCutEmbeddedSeamGridV1>[0]['bindings'][number],
  'cut'
> &
  Omit<Parameters<typeof compileRegularSourceCutCarrierV1>[0]['pieces'][number], 'pieceId'>;

export type DirectedSourceCutPreviewInputV1 = Readonly<{
  sourceFingerprint: string;
  operationOrder: number;
  expectedGridSha256: string;
  grid: DxfExactNativeCrossRowSeamGridRequestV1;
  sides: readonly [NativeSide, NativeSide];
  spacingMm: number;
  material: Pick<
    Core,
    'grains' | 'assignments' | 'materials' | 'continuumMaterials' | 'materialOptions'
  >;
  parameters: Core['parameters'];
  placement: Readonly<{
    centerM: readonly [number, number, number];
    depthOffsetsM: readonly [number, number];
  }>;
  assertCurrentSource: () => boolean;
}>;

export type DirectedSourceCutPiecePlacementV1 = Readonly<{
  pieceId: string;
  originMm: readonly [number, number];
  centerM: readonly [number, number, number];
  cos: number;
  sin: number;
}>;

function requireCurrent(check: () => boolean, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const current: unknown = check();
  if (current !== true) {
    void Promise.resolve(current).catch(() => {});
    throw new Error('The authored directed seam source is stale or its check is asynchronous.');
  }
}

async function sha256(values: Float32Array | Float64Array | Uint32Array) {
  const bytes = new Uint8Array(values.byteLength);
  bytes.set(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Compile the authenticated material rings and replay the bound grid before allocating a GPU run. */
export async function prepareDirectedSourceCutPreviewV1(
  input: DirectedSourceCutPreviewInputV1,
  signal?: AbortSignal,
) {
  requireCurrent(input.assertCurrentSource, signal);
  const { centerM, depthOffsetsM } = input.placement;
  if (
    centerM.length !== 3 ||
    depthOffsetsM.length !== 2 ||
    ![...centerM, ...depthOffsetsM].every(
      (value) => Number.isFinite(value) && Math.abs(value) <= 10,
    ) ||
    depthOffsetsM[0] === depthOffsetsM[1]
  )
    throw new RangeError(
      'The directed source preview needs two finite separated placement planes.',
    );

  const { mesh, cuts, materialPositionsMm } = compileRegularSourceCutCarrierV1(
    {
      sourceFingerprint: input.sourceFingerprint,
      spacingMm: input.spacingMm,
      maximumTriangleTests: 2_000_000,
      pieces: input.sides.map(({ carrierPieceId, ringMm, angleDeg, phaseX, phaseY }) => ({
        pieceId: carrierPieceId,
        ringMm,
        angleDeg,
        phaseX,
        phaseY,
      })),
    },
    signal,
  );
  const bind = ({
    carrierPieceId,
    spanPieceId,
    spanContourId,
    sourceSha256,
    patternLineKey,
  }: NativeSide) => ({
    carrierPieceId,
    spanPieceId,
    spanContourId,
    sourceSha256,
    patternLineKey,
    cut: cuts.get(carrierPieceId)!.cut,
  });
  const grid = await compileSourceCutEmbeddedSeamGridV1(
    {
      grid: input.grid,
      expectedGridSha256: input.expectedGridSha256,
      operationOrder: input.operationOrder,
      carrierMesh: mesh,
      bindings: [bind(input.sides[0]), bind(input.sides[1])],
      maxTriangleTests: 2_000_000,
    },
    signal,
  );
  requireCurrent(input.assertCurrentSource, signal);

  const [a, b] = grid.witness.sides;
  const start = a.samples[0].positionMm;
  const finish = a.samples.at(-1)!.positionMm;
  const dx = finish[0] - start[0];
  const dy = finish[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (!(length > 0 && Number.isFinite(length)))
    throw new RangeError('The directed seam endpoints do not define a placement axis.');
  const cos = dx / length;
  const sin = dy / length;
  const { grains, assignments, materials, continuumMaterials, materialOptions } = input.material;
  const cutTolerances = {
    absoluteAreaToleranceMm2: 1e-6,
    relativeAreaTolerance: 1e-8,
    centroidToleranceMm: 1e-6,
  };
  const cutMaterial = compileSourceCutCarrierMaterialV1(
    mesh,
    grains,
    assignments,
    materials,
    materialOptions,
    cuts,
    cutTolerances,
  );
  const world = new Float32Array(mesh.restPositions2Mm.length * 2);
  const piecePlacements: DirectedSourceCutPiecePlacementV1[] = [];
  for (const [side, { pieceId, vertexOffset, vertexCount }] of mesh.pieceRanges.entries()) {
    const samples = [a, b][side].samples;
    const [first, last] = [samples[0].positionMm, samples.at(-1)!.positionMm];
    const mx = (first[0] + last[0]) / 2;
    const my = (first[1] + last[1]) / 2;
    const planeM = centerM[2] + depthOffsetsM[side];
    piecePlacements.push(
      Object.freeze({
        pieceId,
        originMm: Object.freeze([mx, my] as const),
        centerM: Object.freeze([centerM[0], centerM[1], planeM] as const),
        cos,
        sin,
      }),
    );
    for (let i = vertexOffset; i < vertexOffset + vertexCount; i++) {
      const x = materialPositionsMm[2 * i] - mx;
      const y = materialPositionsMm[2 * i + 1] - my;
      world.set(
        [
          centerM[0] + (cos * x + sin * y) * 0.001,
          centerM[1] + (-sin * x + cos * y) * 0.001,
          planeM,
          decodeParticleMassGpuV1(cutMaterial.cutParticleMassRecords, i).inverseMassKgInv,
        ],
        4 * i,
      );
    }
  }
  const material = prepareGarmentStagedSourceCutCoreV1(
    {
      mesh,
      grains,
      assignments,
      materials,
      continuumMaterials,
      materialOptions,
      cutByPiece: cuts,
      cutTolerances,
      currentPositionsMInvMass: world,
      parameters: input.parameters,
      budgets: {
        maxParticles: 2_000,
        maxTriangles: 5_000,
        maxConstraintCount: 15_000,
        maxGpuBytes: 16 * 1024 * 1024,
        maxDispatches: 120_000,
        maxConstraintInvocations: 50_000_000,
        maxWorkgroupsPerDispatch: 65_535,
      },
    },
    signal,
  );
  const pairs = grid.pairs.map(({ operationOrder, seamId, sourcePairIndex }, index) => ({
    operationOrder,
    seamId,
    sourcePairIndex,
    sideA: { pieceId: input.sides[0].carrierPieceId, positionMm: a.samples[index].positionMm },
    sideB: { pieceId: input.sides[1].carrierPieceId, positionMm: b.samples[index].positionMm },
  }));
  const seams = prepareGarmentStagedSourceCutSeamsV1(material, pairs, {
    maxTriangleTests: 2_000_000,
    maxSupportBytes: 96_000,
  });
  const cut = snapshotGarmentStagedSourceCutCoreV1(material).cut;
  const surface = prepareSourceCutSurfaceProjectionV1(cut, 35_000);
  const [carrierPositionsSha256, carrierTrianglesSha256, initialPositionsSha256] =
    await Promise.all([sha256(materialPositionsMm), sha256(mesh.triangles), sha256(world)]);
  requireCurrent(input.assertCurrentSource, signal);
  return {
    material,
    seams,
    surface,
    placement: Object.freeze({
      gridSha256: grid.witness.canonicalSha256,
      pieces: Object.freeze(piecePlacements),
      carrierMaterialPositionsFloat64LeSha256: carrierPositionsSha256,
      carrierTrianglesUint32LeSha256: carrierTrianglesSha256,
      positionsInvMassFloat32LeSha256: initialPositionsSha256,
    }),
  };
}

/** The Workbench retains its renderer lease and source authority for the entire run. */
export async function runDirectedSourceCutPreviewV1(
  input: Readonly<{
    source: DirectedSourceCutPreviewInputV1;
    ownedLease: Parameters<typeof runStagedSourceCutFramesV1>[0]['ownedLease'];
    body: Readonly<{
      positionsM: Float32Array;
      triangles: Uint32Array;
      positionsSha256: string;
      trianglesSha256: string;
      outwardSign: 1 | -1;
    }>;
    schedule: readonly Readonly<{
      requestedReductionM: number;
      maximumReductionM: number;
    }>[];
  }>,
  signal?: AbortSignal,
) {
  const {
    sourceFingerprint,
    expectedGridSha256,
    operationOrder,
    assertCurrentSource: check,
  } = input.source;
  requireCurrent(check, signal);
  const schedule = input.schedule.map((command) => ({ ...command }));
  if (schedule.length < 1 || schedule.length > 40)
    throw new RangeError('A bounded directed preview contraction schedule is required.');
  const {
    positionsSha256: expectedPositions,
    trianglesSha256: expectedTriangles,
    outwardSign,
  } = input.body;
  const body = captureActualBodyTriangleGeometryV1(input.body.positionsM, input.body.triangles);
  const [positionsSha256, trianglesSha256] = await Promise.all([
    sha256(body.positions),
    sha256(body.triangles),
  ]);
  if (positionsSha256 !== expectedPositions || trianglesSha256 !== expectedTriangles)
    throw new RangeError('The renderer body differs from the body bound to this directed run.');
  requireCurrent(check, signal);
  const { material, seams, surface } = await prepareDirectedSourceCutPreviewV1(
    input.source,
    signal,
  );
  const command = (index: number) => ({
    ...schedule[index],
    operationOrder,
    action: index === 0 ? ('activate' as const) : ('contract' as const),
  });
  const frame: Frame = {
    material,
    seams,
    bodyPositionsM: body.positions,
    bodyTriangles: body.triangles,
    bodyOutwardSign: outwardSign,
    intent: command(0),
    budgets: {
      maxGpuBytes: 16 * 1024 * 1024,
      maxDispatches: 120_000,
      maxPaddedInvocations: 50_000_000,
      maxContactTriangleVisits: 500_000_000,
    },
  };
  let receipt = await runStagedSourceCutFramesV1(
    {
      frame,
      ownedLease: input.ownedLease,
      assertCurrentSource: check,
      maxCopyBytes: 32 * 1024 * 1024,
    },
    signal,
  );
  for (let index = 1; index < schedule.length; index++)
    receipt = await continueStagedSourceCutFramesV1(receipt, command(index), signal);
  requireCurrent(check, signal);
  return {
    positionsM: surface.project(receipt.positionsMInvMass),
    drawRanges: surface.drawRanges,
    frame: receipt.validated.at(-1)!,
    deviceIdentity: receipt.deviceIdentity,
    shaderIdentities: receipt.shaderIdentities,
    body: { positionsSha256, trianglesSha256 },
    source: { sourceFingerprint, gridSha256: expectedGridSha256, operationOrder },
  };
}
