import { sha256Hex } from 'lib/features/sha256';
import { prepareSourceCutContactMeshV1 } from 'lib/cloth/runtime/cpu/source-cut-contact-mesh-v1';
import { snapshotGarmentStagedSourceCutCoreV1 } from 'lib/cloth/runtime/webgpu/garment-staged-source-cut-core-v1';
import type { SavedFullAssemblyRegisteredCutSourceV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-registered-cut-source-v1';
import type { SavedFullAssemblyPhysicalSnapshotProjectionV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-physical-snapshot-production-v1';
import type { ModelDisplayedTriangleBodyInputProjectionV1 } from './model-displayed-triangle-body-input-v1';
import { prepareActualBodySourceCutContactV1 } from './actual-body-source-cut-contact-v1';
import {
  prepareRegisteredSourceCutPreviewV1,
  type RegisteredSourceCutPreviewInputV1,
} from './prepare-registered-source-cut-preview-v1';

type Durable = Pick<
  SavedFullAssemblyPhysicalSnapshotProjectionV1,
  'outer' | 'graph' | 'graphCanonicalSha256' | 'physicalInitialization'
>;

/** Admit the first cleared frame, then take one bounded 0.1 mm approach step. */
export const SAVED_REGISTERED_CUT_ACTIVATION_V1 = [
  { requestedReductionM: 0, maximumReductionM: 0 },
  { requestedReductionM: 0.0001, maximumReductionM: 0.00011 },
] as const;

export async function prepareSavedV7RegisteredCutPreviewV1(
  durable: Durable,
  cut: SavedFullAssemblyRegisteredCutSourceV1,
  observed: ModelDisplayedTriangleBodyInputProjectionV1,
  assertCurrentSource: () => boolean,
  signal: AbortSignal,
) {
  const { graph, physicalInitialization } = durable;
  const { geometry, displayedModel } = physicalInitialization.observedTarget.target;
  if (
    observed.identity.modelId !== displayedModel.modelId ||
    observed.identity.modelContentRevision !== displayedModel.modelContentRevision ||
    observed.hashes.bodyPositionsFloat32LeSha256 !== geometry.positionsFloat32LeSha256 ||
    observed.hashes.bodyTrianglesUint32LeSha256 !== geometry.trianglesUint32LeSha256
  )
    throw new Error('The displayed mannequin no longer matches the saved placement.');
  const { placements } = physicalInitialization;
  const { materials, continuumMaterials, materialSolver } = graph.compile;
  const pieces = cut.pieces.map(({ pieceId, ringMm }, index) => {
    const placement = placements.find((entry) => entry.pieceId === pieceId);
    if (!placement) throw new Error('A complete cut piece has no saved placement.');
    // Offset the two carrier grids independently. These are meshing phases, not garment transforms.
    const [phaseX, phaseY] = index === 0 ? [0.2, 0.6] : [0.6, 0.8];
    return { pieceId, ringMm, placement, angleDeg: 0, phaseX, phaseY };
  });
  const sourceFingerprint = await sha256Hex(
    new TextEncoder().encode(
      JSON.stringify([
        'saved-native-registered-cut/1',
        durable.outer.sha256,
        durable.graphCanonicalSha256,
        graph.source.nativeDxfSha256,
        observed.hashes,
        cut,
        placements,
      ]),
    ),
  );
  const source: RegisteredSourceCutPreviewInputV1 = {
    sourceFingerprint,
    pieces,
    stitches: cut.stitches,
    spacingMm: 48,
    sampling: { minSegmentMm: 1, maxSegmentMm: 5.001, maxPairs: 512 },
    material: {
      grains: graph.pieces.map(({ pieceId, grainDegrees }) => ({ pieceId, grainDegrees })),
      assignments: materials.map(({ id, revision }) => ({
        id,
        materialRevision: revision,
        pieceIds: graph.pieces
          .filter((piece) => piece.materialId === id && piece.materialRevision === revision)
          .map(({ pieceId }) => pieceId),
      })),
      materials,
      continuumMaterials,
      materialOptions: materialSolver,
    },
    parameters: {
      dtS: materialSolver.dtS,
      solverIterations: materialSolver.solverIterations,
      frameCount: 1,
      gravityMps2Y: -9.81,
      windAccelerationMps2Z: 0,
      distanceComplianceMPerN: 2e-7,
      seamComplianceMPerN: 1e-8,
    },
    assertCurrentSource,
    placementPolicy: 'separate-overlapping-layers',
  };
  const prepared = prepareRegisteredSourceCutPreviewV1(source, signal, {
    positionsM: observed.bodyPositionsM,
    triangles: observed.bodyTriangles,
  });
  const { cut: mesh, uploads } = snapshotGarmentStagedSourceCutCoreV1(prepared.material);
  const initialPositionsSha256 = await sha256Hex(
    new Uint8Array(
      uploads.positions.buffer,
      uploads.positions.byteOffset,
      uploads.positions.byteLength,
    ),
  );
  if (!initialPositionsSha256)
    throw new Error('The checked starting positions could not be hashed.');
  const garment = prepareSourceCutContactMeshV1(mesh, 35_000);
  const mannequin = prepareActualBodySourceCutContactV1(
    observed.bodyPositionsM,
    observed.bodyTriangles,
    130_000_000,
  );
  const signedVolume = mannequin.bodyAudit.topology.signedVolumeM3;
  const bodyContact = mannequin.validateFrame(garment, uploads.positions);
  const clothContact = garment.validateSelfIntersection(uploads.positions);
  signal.throwIfAborted();
  if (!assertCurrentSource()) throw new Error('The saved cut or placement changed.');
  if (Math.abs(signedVolume) <= 1e-12 || !bodyContact.passed || !clothContact.passed)
    throw new Error(
      'The complete cut intersects the mannequin or another cloth piece. Edit the saved placement.',
    );
  return {
    source,
    initial: {
      positionsM: prepared.surface.project(uploads.positions),
      drawRanges: prepared.surface.drawRanges,
    },
    body: {
      positionsM: observed.bodyPositionsM,
      triangles: observed.bodyTriangles,
      positionsSha256: geometry.positionsFloat32LeSha256,
      trianglesSha256: geometry.trianglesUint32LeSha256,
      outwardSign: signedVolume > 0 ? (1 as const) : (-1 as const),
    },
    proof: {
      sourceFingerprint,
      initialPositionsSha256,
      dxfSha256: graph.source.nativeDxfSha256,
      placementSha256: durable.outer.sha256,
      bodyPositionsSha256: geometry.positionsFloat32LeSha256,
      bodyTrianglesSha256: geometry.trianglesUint32LeSha256,
      pieces: pieces.length,
      triangles: garment.topology.reduce((count, entry) => count + entry.triangleCount, 0),
      bodyContactPassed: bodyContact.passed,
      clothContactPassed: clothContact.passed,
      derivedPlacement: prepared.derivedPlacement,
    },
  };
}
