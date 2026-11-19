import { decodeParticleMassGpuV1 } from 'lib/cloth/compiler/material-package';
import { compileRegularSourceCutCarrierV1 } from 'lib/cloth/compiler/regular-source-cut-carrier-v1';
import { compileSourceCutCarrierMaterialV1 } from 'lib/cloth/compiler/source-cut-carrier-material-v1';
import { prepareSourceCutSeamEmbeddingV1 } from 'lib/cloth/compiler/source-cut-embedded-seam-grid-v1';
import {
  compileSourceCutRegisteredStitchPairsV1,
  type RegisteredSourceCutStitchV1,
} from 'lib/cloth/compiler/source-cut-registered-stitch-pairs-v1';
import type { DxfGarmentExplicitPiecePlacementV1 } from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import { assertDxfGarmentExplicitRigidPlacementV1 } from 'lib/cloth/domain/dxf-garment-physical-initialization-v1';
import { prepareSourceCutContactMeshV1 } from 'lib/cloth/runtime/cpu/source-cut-contact-mesh-v1';
import { prepareSourceCutSurfaceProjectionV1 } from 'lib/cloth/runtime/cpu/source-cut-surface-projection-v1';
import {
  prepareGarmentStagedSourceCutCoreV1,
  prepareGarmentStagedSourceCutSeamsV1,
  snapshotGarmentStagedSourceCutCoreV1,
} from 'lib/cloth/runtime/webgpu/garment-staged-source-cut-core-v1';

import { prepareActualBodySourceCutContactV1 } from './actual-body-source-cut-contact-v1';

type Carrier = Parameters<typeof compileRegularSourceCutCarrierV1>[0];
type Core = Parameters<typeof prepareGarmentStagedSourceCutCoreV1>[0];

export type RegisteredSourceCutPreviewInputV1 = Readonly<{
  /** Fingerprint of the currently verified cut, sewing, and placement source. */
  sourceFingerprint: string;
  spacingMm: number;
  pieces: readonly (Carrier['pieces'][number] &
    Readonly<{
      /** Rigid placement in the same material coordinate system as ringMm and stitches. */
      placement: DxfGarmentExplicitPiecePlacementV1;
    }>)[];
  stitches: readonly RegisteredSourceCutStitchV1[];
  sampling: Parameters<typeof compileSourceCutRegisteredStitchPairsV1>[1];
  material: Pick<
    Core,
    'grains' | 'assignments' | 'materials' | 'continuumMaterials' | 'materialOptions'
  >;
  parameters: Core['parameters'];
  placementPolicy?: 'separate-overlapping-layers';
  assertCurrentSource: () => boolean;
}>;

/** Prepare the existing staged solver from complete material outlines and saved inboard stitches. */
export function prepareRegisteredSourceCutPreviewV1(
  input: RegisteredSourceCutPreviewInputV1,
  signal?: AbortSignal,
  displayedBody?: Readonly<{ positionsM: Float32Array; triangles: Uint32Array }>,
) {
  const { assertCurrentSource, pieces, stitches, sampling, material, parameters } = input;
  const requireCurrent = () => {
    signal?.throwIfAborted();
    if (assertCurrentSource() !== true) throw new Error('The saved cut and stitch source changed.');
  };
  requireCurrent();
  const { sourceFingerprint, spacingMm } = input;
  if (!/^[a-f0-9]{64}$/.test(sourceFingerprint) || stitches.length === 0)
    throw new RangeError('A verified source digest and at least one saved stitch are required.');
  const placements = new Map(
    pieces.map(({ pieceId, placement }) => {
      assertDxfGarmentExplicitRigidPlacementV1(placement);
      if (placement.pieceId !== pieceId)
        throw new RangeError('The saved placement names a different cut piece.');
      return [pieceId, placement] as const;
    }),
  );
  const { mesh, cuts, materialPositionsMm, pressHingeTargets } = compileRegularSourceCutCarrierV1(
    { sourceFingerprint, spacingMm, maximumTriangleTests: 2_000_000, pieces },
    signal,
  );
  const pairs = compileSourceCutRegisteredStitchPairsV1(stitches, sampling, signal);
  const maxTriangleTests = 2_000_000;
  const embeddings = new Map<string, ReturnType<typeof prepareSourceCutSeamEmbeddingV1>>();
  let triangleTests = 0;
  for (const stitch of stitches) {
    for (const { sideA, sideB } of stitch.sections) {
      for (const { pieceId, intervals } of [sideA, sideB]) {
        const cut = cuts.get(pieceId);
        if (!cut) throw new RangeError('A saved stitch references a piece outside this cut.');
        let embedding = embeddings.get(pieceId);
        if (!embedding) {
          embedding = prepareSourceCutSeamEmbeddingV1(mesh, pieceId, cut.cut, maxTriangleTests);
          embeddings.set(pieceId, embedding);
        }
        const stations = [
          { positionMm: intervals[0].startMm },
          ...intervals.map(({ endMm }) => ({ positionMm: endMm })),
        ];
        triangleTests += embedding.triangleTests(stations.length);
        if (triangleTests > maxTriangleTests)
          throw new RangeError('Saved stitch coverage exceeds the allowed triangle tests.');
        embedding.embed(stations, signal);
      }
    }
  }
  requireCurrent();

  const cutTolerances = {
    absoluteAreaToleranceMm2: 1e-6,
    relativeAreaTolerance: 1e-8,
    centroidToleranceMm: 1e-6,
  };
  const cutMaterial = compileSourceCutCarrierMaterialV1(
    mesh,
    material.grains,
    material.assignments,
    material.materials,
    material.materialOptions,
    cuts,
    cutTolerances,
  );
  const world = new Float32Array(mesh.restPositions2Mm.length * 2);
  for (const { pieceId, vertexOffset, vertexCount } of mesh.pieceRanges) {
    signal?.throwIfAborted();
    const { sourceOriginM, rotationRowMajor: r, translationM } = placements.get(pieceId)!;
    for (let i = vertexOffset; i < vertexOffset + vertexCount; i++) {
      const x = materialPositionsMm[2 * i] * 0.001 - sourceOriginM[0];
      const y = materialPositionsMm[2 * i + 1] * 0.001 - sourceOriginM[1];
      const z = -sourceOriginM[2];
      world.set(
        [
          translationM[0] + (r[0] * x + r[1] * y + r[2] * z),
          translationM[1] + (r[3] * x + r[4] * y + r[5] * z),
          translationM[2] + (r[6] * x + r[7] * y + r[8] * z),
          decodeParticleMassGpuV1(cutMaterial.cutParticleMassRecords, i).inverseMassKgInv,
        ],
        4 * i,
      );
    }
  }
  const clearance = input.placementPolicy
    ? deriveCutPlacement(world, mesh, placements, cutMaterial, displayedBody, requireCurrent)
    : null;
  const prepared = prepareGarmentStagedSourceCutCoreV1(
    {
      ...material,
      mesh,
      cutByPiece: cuts,
      cutTolerances,
      currentPositionsMInvMass: clearance?.positions ?? world,
      parameters,
      pressHingeTargets,
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
  const seams = prepareGarmentStagedSourceCutSeamsV1(
    prepared,
    pairs,
    { maxTriangleTests, maxSupportBytes: 96_000 },
    signal,
  );
  const { cut } = snapshotGarmentStagedSourceCutCoreV1(prepared);
  const surface = prepareSourceCutSurfaceProjectionV1(cut, 35_000);
  requireCurrent();
  return {
    material: prepared,
    seams,
    surface,
    sourceFingerprint,
    derivedPlacement: clearance?.detail,
  };
}

function deriveCutPlacement(
  world: Float32Array,
  mesh: Core['mesh'],
  placements: ReadonlyMap<string, DxfGarmentExplicitPiecePlacementV1>,
  cut: ReturnType<typeof compileSourceCutCarrierMaterialV1>,
  body: Readonly<{ positionsM: Float32Array; triangles: Uint32Array }> | undefined,
  requireCurrent: () => void,
) {
  if (!body) throw new RangeError('Full-cut placement requires the current displayed mannequin.');
  const cloth = prepareSourceCutContactMeshV1(cut, 35_000);
  const mannequin = prepareActualBodySourceCutContactV1(
    body.positionsM,
    body.triangles,
    130_000_000,
  );
  const passes = (positions: Float32Array) => {
    requireCurrent();
    return (
      cloth.validateSelfIntersection(positions).passed &&
      mannequin.validateFrame(cloth, positions).passed
    );
  };
  if (passes(world)) return { positions: world, detail: undefined };
  const [first, second] = mesh.pieceRanges;
  if (mesh.pieceRanges.length !== 2)
    throw new RangeError('The saved full-cut pieces collide at this placement.');
  const rotationA = placements.get(first.pieceId)!.rotationRowMajor;
  const rotationB = placements.get(second.pieceId)!.rotationRowMajor;
  const normal = [rotationA[2], rotationA[5], rotationA[8]] as const;
  const parallel = normal[0] * rotationB[2] + normal[1] * rotationB[5] + normal[2] * rotationB[8];
  if (Math.abs(parallel) < 1 - 1e-8)
    throw new RangeError('The two cut planes must be parallel for automatic layer separation.');

  const horizontalCenter = (values: Float32Array, stride: 3 | 4) => {
    let minX = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < values.length; i += stride) {
      minX = Math.min(minX, values[i]);
      maxX = Math.max(maxX, values[i]);
      minZ = Math.min(minZ, values[i + 2]);
      maxZ = Math.max(maxZ, values[i + 2]);
    }
    return [(minX + maxX) / 2, (minZ + maxZ) / 2] as const;
  };
  const [clothX, clothZ] = horizontalCenter(world, 4);
  const [bodyX, bodyZ] = horizontalCenter(body.positionsM, 3);
  const dx = clothX - bodyX,
    dz = clothZ - bodyZ;
  const length = Math.hypot(dx, dz);
  const outward = length > 1e-8 ? [dx / length, 0, dz / length] : [0, 0, 0];
  // Keep any correction small enough for a deliberate edit in the placement tool.
  for (const gapMm of [0, 2, 4]) {
    for (const outwardMm of [0, 2, 4, 6, 8, 10, 12]) {
      if ((gapMm === 0 && outwardMm === 0) || (length <= 1e-8 && outwardMm !== 0)) continue;
      const positions = world.slice();
      for (const [index, range] of [first, second].entries()) {
        const layerOffsetM = ((index === 0 ? -1 : 1) * gapMm) / 2000;
        for (let i = range.vertexOffset; i < range.vertexOffset + range.vertexCount; i++) {
          for (let axis = 0; axis < 3; axis++) {
            positions[i * 4 + axis] +=
              normal[axis] * layerOffsetM + (outward[axis] * outwardMm) / 1000;
          }
        }
      }
      if (passes(positions)) {
        return {
          positions,
          detail: Object.freeze({
            gapMm,
            outwardMm,
            outward: Object.freeze(outward),
            normal: Object.freeze(normal),
          }),
        };
      }
    }
  }
  throw new RangeError(
    'The full cut still intersects cloth or the mannequin. Move the saved pieces apart.',
  );
}
