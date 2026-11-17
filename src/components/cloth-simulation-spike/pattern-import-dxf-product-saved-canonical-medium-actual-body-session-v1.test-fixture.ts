import type { DxfProductTwoPanelSkirtBoundarySelectionV1 } from 'lib/cloth/domain/dxf-product-two-panel-skirt-placement-semantics-v1';
import type {
  PatternImportDxfProductGarmentMeshComposerProjectionV2,
  PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import { PATTERN_IMPORT_DXF_PRODUCT_CANONICAL_MEDIUM_BETA_ANNULAR_SECTOR_FIXTURE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';

import { BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1 } from './beta-skirt-canonical-medium-product-placement-v1';
import type { BetaSkirtG3b2PreviewMannequinResultV1 } from './beta-skirt-g3b2-preview-mannequin-contract-v1';
import type { PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1 } from './pattern-import-dxf-product-saved-canonical-medium-authored-input-contract-v1';

type ReadyMannequin = Extract<BetaSkirtG3b2PreviewMannequinResultV1, { status: 'ready' }>;
type Projection = PatternImportDxfProductGarmentMeshComposerProjectionV2;

type SourceCurve = Readonly<{
  sourceCurveId: string;
  contourId: string;
  firstArc: number;
}>;

function sourceCurves(projection: Projection, pieceId: string): readonly SourceCurve[] {
  const grouped = new Map<string, SourceCurve>();
  for (const sample of projection.mesh.boundarySamples
    .filter((candidate) => candidate.pieceId === pieceId)
    .sort((left, right) => left.normalizedArc - right.normalizedArc)) {
    if (!grouped.has(sample.sourceCurveId))
      grouped.set(sample.sourceCurveId, {
        sourceCurveId: sample.sourceCurveId,
        contourId: sample.contourId,
        firstArc: sample.normalizedArc,
      });
  }
  return [...grouped.values()].sort((left, right) => left.firstArc - right.firstArc);
}

function seamVertices(projection: Projection, seamId: string, pieceId: string): number[] {
  const seam = projection.mesh.seams.find((candidate) => candidate.seamId === seamId);
  const range = projection.mesh.pieceRanges.find((candidate) => candidate.pieceId === pieceId);
  if (!seam || !range) throw new Error('Canonical-medium authored fixture lost a seam identity.');
  return Array.from(seam.vertexPairs).filter(
    (vertexIndex) =>
      vertexIndex >= range.vertexOffset && vertexIndex < range.vertexOffset + range.vertexCount,
  );
}

function unsewnCurveVertices(
  projection: Projection,
  pieceId: string,
  sourceCurveIds: readonly string[],
): number[] {
  const samples = projection.mesh.boundarySamples
    .filter((sample) => sample.pieceId === pieceId)
    .sort((left, right) => left.normalizedArc - right.normalizedArc);
  const selected = samples.filter((sample) => sourceCurveIds.includes(sample.sourceCurveId));
  if (selected.length < 2)
    throw new Error('Canonical-medium authored fixture lost source-curve samples.');
  const lastIndex = samples.findIndex(
    ({ vertexIndex }) => vertexIndex === selected[selected.length - 1]!.vertexIndex,
  );
  return [
    ...selected.map(({ vertexIndex }) => vertexIndex),
    samples[(lastIndex + 1) % samples.length]!.vertexIndex,
  ];
}

function selection(
  curves: readonly [SourceCurve, ...SourceCurve[]],
  boundaryVertexIndices: readonly number[],
): DxfProductTwoPanelSkirtBoundarySelectionV1 {
  if (boundaryVertexIndices.length < 2)
    throw new Error('Canonical-medium authored fixture has an empty boundary selection.');
  return {
    contourId: curves[0].contourId,
    sourceCurveIds: curves.map(({ sourceCurveId }) => sourceCurveId) as [string, ...string[]],
    boundaryVertexIndices: [...boundaryVertexIndices] as [number, number, ...number[]],
  };
}

function boundaryRoles(
  projection: Projection,
  pieceId: string,
  leftSeamId: string,
  rightSeamId: string,
) {
  const curves = sourceCurves(projection, pieceId);
  const fixture = PATTERN_IMPORT_DXF_PRODUCT_CANONICAL_MEDIUM_BETA_ANNULAR_SECTOR_FIXTURE_V1;
  const hemCount = fixture.hemArcSegmentCount ?? fixture.arcSegmentCount;
  const waistCount = fixture.waistArcSegmentCount ?? fixture.arcSegmentCount;
  if (curves.length !== hemCount + waistCount + 2)
    throw new Error('Canonical-medium authored fixture lost its exact 40/50/2 curve partition.');
  const startRadial = curves[0]!;
  const hem = curves.slice(1, hemCount + 1) as [SourceCurve, ...SourceCurve[]];
  const endRadial = curves[hemCount + 1]!;
  const waist = curves.slice(hemCount + 2) as [SourceCurve, ...SourceCurve[]];
  const ids = (values: readonly SourceCurve[]) => values.map(({ sourceCurveId }) => sourceCurveId);
  return {
    pieceId,
    waist: selection(waist, unsewnCurveVertices(projection, pieceId, ids(waist))),
    hem: selection(hem, unsewnCurveVertices(projection, pieceId, ids(hem))),
    leftSeam: selection([endRadial], seamVertices(projection, leftSeamId, pieceId)),
    rightSeam: selection([startRadial], seamVertices(projection, rightSeamId, pieceId)),
  };
}

/**
 * Test-only authored sidecar. Curve identities and roles are asserted from the exact fixture here;
 * production placement receives this data explicitly and never infers it from extrema or layers.
 */
export function createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture(input: {
  composerSnapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2;
  composerProjection: Projection;
  mannequin: ReadyMannequin;
}): PatternImportDxfProductSavedCanonicalMediumAuthoredInputV1 {
  const frontPieceId = 'FRONT';
  const backPieceId = 'BACK';
  const leftSeamId = 'side-close';
  const rightSeamId = 'side-open';
  const display = input.mannequin.composition.displayBinding;
  if (display.basisKind !== 'neutral' || display.posePresetId !== 'a-rest')
    throw new Error('Canonical-medium actual-body fixture requires the neutral A-rest display.');
  return {
    semantics: {
      origin: input.composerSnapshot.origin,
      garment: {
        kind: 'two-panel-skirt',
        frontPieceId,
        backPieceId,
        leftSeamId,
        rightSeamId,
        circumferentialOrder: {
          direction: 'clockwise-seen-from-above',
          pieceIds: [frontPieceId, backPieceId],
        },
        boundaries: [
          boundaryRoles(input.composerProjection, frontPieceId, leftSeamId, rightSeamId),
          boundaryRoles(input.composerProjection, backPieceId, leftSeamId, rightSeamId),
        ],
      },
      body: {
        providerId: display.modelId,
        providerRevision: display.modelContentRevision,
        bodyId: display.modelId,
        bodyRevision: display.modelContentRevision,
        poseKind: 'A',
        poseRevision: display.posePresetId,
        collisionLodId: 'rendered-body-13380v-26756t',
        landmarks: {
          revision: `${display.modelContentRevision}:landmarks-v1`,
          waistCenterId: 'waist-center',
          hipLeftId: 'hip-left',
          hipRightId: 'hip-right',
        },
      },
      policy: {
        id: 'canonical-medium-actual-body-static-placement-policy',
        revision: 'canonical-medium-actual-body-static-placement-policy-v1',
        mapping: {
          kind: 'authored-annular-sector-conical',
          id: 'canonical-medium-authored-annular-mapping',
          revision: 'canonical-medium-authored-annular-mapping-v1',
        },
        authoredClearanceM: 0.008,
        clothThicknessM: 0.002,
        retention: {
          id: 'canonical-medium-waist-boundary-support',
          revision: 'canonical-medium-waist-boundary-support-v1',
          kind: 'waist-boundary-support',
        },
      },
    },
    displayBody: {
      modelId: display.modelId,
      modelContentRevision: display.modelContentRevision,
      inputFingerprint: display.inputFingerprint,
      basisKind: display.basisKind,
      posePresetId: display.posePresetId,
    },
    frame: BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_AUTHORED_FRAME_V1,
  };
}
