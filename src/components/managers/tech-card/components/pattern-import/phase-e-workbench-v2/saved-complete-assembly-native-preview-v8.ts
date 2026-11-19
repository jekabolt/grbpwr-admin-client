import type { DirectedSourceCutPreviewInputV1 } from 'components/cloth-simulation-spike/run-directed-source-cut-preview-v1';
import type { readSavedCompleteAssemblyNativePhysicalSourceV8 } from './saved-complete-assembly-native-stitch-review-v8';
import { resolveSavedFullAssemblyDiagnosticProfileV1 } from './saved-full-assembly-diagnostic-profile-v1';

type SavedSource = Awaited<ReturnType<typeof readSavedCompleteAssemblyNativePhysicalSourceV8>>;
type Placement = DirectedSourceCutPreviewInputV1['placement'];

const initialReductionM = 0.0004;
const contract = Object.freeze({
  requestedReductionM: initialReductionM,
  maximumReductionM: initialReductionM,
});
const hold = Object.freeze({ requestedReductionM: 0, maximumReductionM: 0 });
export const SAVED_CROSS_MATERIAL_DIAGNOSTIC_SCHEDULE_V1 = Object.freeze([
  ...Array(8).fill(contract),
  hold,
  hold,
]) satisfies Parameters<
  typeof import('components/cloth-simulation-spike/run-directed-source-cut-preview-v1').runDirectedSourceCutPreviewV1
>[0]['schedule'];

export function buildSavedCrossMaterialDiagnosticInputsV1(
  source: SavedSource,
  placement: Placement,
  assertCurrentSource: () => boolean,
): DirectedSourceCutPreviewInputV1 {
  const profile = resolveSavedFullAssemblyDiagnosticProfileV1(
    'browser-medium-isotropic-diagnostic',
    '1',
  );
  if (!profile) throw new Error('The medium diagnostic cloth profile is unavailable.');
  const side = (index: 0 | 1) => {
    const cut = source.cuts[index];
    const member = source.document.selection.members[index];
    const phases = index === 0 ? { phaseX: 0.2, phaseY: 0.6 } : { phaseX: 0.6, phaseY: 0.8 };
    return {
      carrierPieceId: cut.pieceLineKey,
      spanPieceId: member.pieceId,
      spanContourId: member.contourId,
      sourceSha256: cut.row.sha256,
      patternLineKey: cut.row.patternLineKey,
      ringMm: cut.ringMm,
      angleDeg: 0,
      ...phases,
    };
  };
  const sides = [side(0), side(1)] as const;
  const pieceIds = sides.map(({ carrierPieceId }) => carrierPieceId);
  const { material, continuumMaterial, materialSolver } = profile;
  return {
    sourceFingerprint: source.sha256,
    operationOrder: source.document.selection.operationOrdinal,
    expectedGridSha256: source.document.review.gridSha256,
    grid: source.gridRequest,
    spacingMm: 48,
    sides,
    material: {
      grains: pieceIds.map((pieceId) => ({ pieceId, grainDegrees: 0 })),
      assignments: [{ id: material.id, materialRevision: material.revision, pieceIds }],
      materials: [material],
      continuumMaterials: [continuumMaterial],
      materialOptions: materialSolver,
    },
    parameters: {
      dtS: materialSolver.dtS,
      solverIterations: materialSolver.solverIterations,
      frameCount: 4,
      gravityMps2Y: -9.81,
      windAccelerationMps2Z: 0,
      distanceComplianceMPerN: 2e-7,
      seamComplianceMPerN: 1e-8,
    },
    placement,
    assertCurrentSource,
  };
}
