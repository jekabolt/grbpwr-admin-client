import type {
  PatternImportDxfProductGarmentMeshComposerProjectionV2,
  PatternImportDxfProductGarmentMeshComposerSnapshotV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import type { PatternImportDxfProductConfirmedAnnularIntentV1 } from 'lib/cloth/domain/pattern-import-dxf-product-confirmed-annular-intent-v1';
import type {
  DxfProductTwoPanelSkirtBoundarySelectionV1,
  DxfProductTwoPanelSkirtPlacementSemanticsRequestV1,
} from 'lib/cloth/domain/dxf-product-two-panel-skirt-placement-semantics-v1';
import type { ClothBoundarySample } from 'lib/cloth/mesh/cloth-mesh-ir';
import type { BetaSkirtCanonicalMediumDisplayedBodyProjectionV2 } from './beta-skirt-canonical-medium-displayed-body-admission-v2';

/** The caller obtains this binding from the genuine current displayed-body projection.
 * This maps an authored target identity only; it does not admit a caller-shaped body. */
export function qualifiedTwoPanelPlacementBodyTargetV1(
  binding: BetaSkirtCanonicalMediumDisplayedBodyProjectionV2['binding'],
): DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['body'] {
  if (binding.basisKind !== 'neutral' || binding.posePresetId !== 'a-rest')
    throw new TypeError(
      'The qualified placement target requires the accepted neutral A-rest body.',
    );
  return {
    providerId: binding.modelId,
    providerRevision: binding.modelContentRevision,
    bodyId: binding.modelId,
    bodyRevision: binding.modelContentRevision,
    poseKind: 'A',
    poseRevision: binding.posePresetId,
    collisionLodId: 'rendered-body-13380v-26756t',
    landmarks: {
      revision: `${binding.modelContentRevision}:landmarks-v1`,
      waistCenterId: 'waist-center',
      hipLeftId: 'hip-left',
      hipRightId: 'hip-right',
    },
  };
}

export const QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1 = [
  'waist',
  'hem',
  'leftSeam',
  'rightSeam',
] as const;
export type QualifiedTwoPanelBoundaryRoleV1 =
  (typeof QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1)[number];
export type QualifiedTwoPanelCurveSpanV1 = Readonly<{
  firstCurveKey: string;
  lastCurveKey: string;
  traversal: 'forward' | 'reverse';
}>;
export type QualifiedTwoPanelPlacementDraftV1 = Readonly<{
  composerCanonicalSha256: string;
  frontPieceId: string;
  backPieceId: string;
  leftSeamId: string;
  rightSeamId: string;
  boundaries: Readonly<
    Record<
      'front' | 'back',
      Readonly<Record<QualifiedTwoPanelBoundaryRoleV1, QualifiedTwoPanelCurveSpanV1>>
    >
  >;
  canonicalProfileReviewed: boolean;
  neutralTargetConfirmed: boolean;
}>;
export type QualifiedTwoPanelGarmentRoleDraftV1 = Pick<
  QualifiedTwoPanelPlacementDraftV1,
  | 'composerCanonicalSha256'
  | 'frontPieceId'
  | 'backPieceId'
  | 'leftSeamId'
  | 'rightSeamId'
  | 'boundaries'
>;
export type QualifiedTwoPanelGarmentProfileIntentV1 = Pick<
  PatternImportDxfProductConfirmedAnnularIntentV1,
  'garment' | 'policy' | 'annularParameters'
>;
export type QualifiedTwoPanelBoundaryCurveV1 = Readonly<{
  key: string;
  contourId: string;
  sourceCurveId: string;
  sampleCount: number;
}>;
type Projection = PatternImportDxfProductGarmentMeshComposerProjectionV2;
type Snapshot = PatternImportDxfProductGarmentMeshComposerSnapshotV2;
type CurveGroup = QualifiedTwoPanelBoundaryCurveV1 &
  Readonly<{ samples: readonly ClothBoundarySample[] }>;

function createRoleDraft(composerCanonicalSha256: string): QualifiedTwoPanelGarmentRoleDraftV1 {
  const roles = () =>
    Object.fromEntries(
      QUALIFIED_TWO_PANEL_BOUNDARY_ROLES_V1.map((role) => [
        role,
        {
          firstCurveKey: '',
          lastCurveKey: '',
          traversal: 'forward' as const,
        },
      ]),
    ) as Record<QualifiedTwoPanelBoundaryRoleV1, QualifiedTwoPanelCurveSpanV1>;
  return {
    composerCanonicalSha256,
    frontPieceId: '',
    backPieceId: '',
    leftSeamId: '',
    rightSeamId: '',
    boundaries: { front: roles(), back: roles() },
  };
}
export function createQualifiedTwoPanelPlacementDraftV1(
  composerCanonicalSha256: string,
): QualifiedTwoPanelPlacementDraftV1 {
  return {
    ...createRoleDraft(composerCanonicalSha256),
    canonicalProfileReviewed: false,
    neutralTargetConfirmed: false,
  };
}

function requireSource(snapshot: Snapshot, projection: Projection) {
  if (
    projection.composerCanonicalSha256 !== snapshot.seal.canonicalSha256 ||
    projection.phase2ArtifactSha256 !== snapshot.seals.phase2ArtifactSha256 ||
    snapshot.mesh.pieceCount !== 2 ||
    snapshot.mesh.seamCount !== 2 ||
    projection.mesh.pieceRanges.length !== 2 ||
    projection.mesh.seams.length !== 2
  )
    throw new TypeError('The exact two-piece saved mesh changed. Choose its garment roles again.');
}

function curveGroups(projection: Projection, pieceId: string): CurveGroup[][] {
  const ranges = projection.mesh.pieceRanges.filter((range) => range.pieceId === pieceId);
  if (ranges.length !== 1) throw new TypeError('Choose one exact mesh piece.');
  const range = ranges[0]!;
  const byContour = new Map<string, ClothBoundarySample[]>();
  for (const sample of projection.mesh.boundarySamples.filter(
    (sample) => sample.pieceId === pieceId,
  )) {
    if (
      !sample.contourId ||
      !sample.sourceCurveId ||
      !Number.isFinite(sample.normalizedArc) ||
      sample.normalizedArc < 0 ||
      sample.normalizedArc >= 1 ||
      !Number.isSafeInteger(sample.vertexIndex) ||
      sample.vertexIndex < range.vertexOffset ||
      sample.vertexIndex >= range.vertexOffset + range.vertexCount
    )
      throw new TypeError('The selected piece has invalid exact boundary provenance.');
    const samples = byContour.get(sample.contourId) ?? [];
    samples.push(sample);
    byContour.set(sample.contourId, samples);
  }
  if (!byContour.size) throw new TypeError('The selected piece has no exact boundary curves.');
  return [...byContour].map(([contourId, unsorted]) => {
    const samples = [...unsorted].sort((a, b) => a.normalizedArc - b.normalizedArc);
    if (
      samples.length < 3 ||
      samples.length > 4_096 ||
      new Set(samples.map((sample) => sample.normalizedArc)).size !== samples.length ||
      new Set(samples.map((sample) => sample.vertexIndex)).size !== samples.length
    )
      throw new TypeError('Boundary samples must have unique contour positions and vertex IDs.');
    const groups: {
      key: string;
      contourId: string;
      sourceCurveId: string;
      sampleCount: number;
      samples: ClothBoundarySample[];
    }[] = [];
    const seen = new Set<string>();
    for (const sample of samples) {
      let group = groups[groups.length - 1];
      if (group?.sourceCurveId !== sample.sourceCurveId) {
        if (seen.has(sample.sourceCurveId))
          throw new TypeError('A source curve occurs in disconnected boundary runs.');
        seen.add(sample.sourceCurveId);
        group = {
          key: JSON.stringify([contourId, sample.sourceCurveId]),
          contourId,
          sourceCurveId: sample.sourceCurveId,
          sampleCount: 0,
          samples: [],
        };
        groups.push(group);
      }
      group.samples.push(sample);
      group.sampleCount += 1;
    }
    return groups;
  });
}

/** Options are exact source IDs, ordered solely by contour normalizedArc provenance. */
export function listQualifiedTwoPanelBoundaryCurvesV1(
  projection: Projection,
  pieceId: string,
): QualifiedTwoPanelBoundaryCurveV1[] {
  return curveGroups(projection, pieceId).flatMap((groups) =>
    groups.map(({ key, contourId, sourceCurveId, sampleCount }) => ({
      key,
      contourId,
      sourceCurveId,
      sampleCount,
    })),
  );
}

/** Coordinates below are display-only. Curve identity/order comes from provenance above. */
export function previewQualifiedTwoPanelBoundaryCurvesV1(projection: Projection, pieceId: string) {
  const coordinates: number[][] = [];
  const paths = curveGroups(projection, pieceId).flatMap((groups) =>
    groups.map((group, index) => {
      const vertices = [
        ...group.samples.map((sample) => sample.vertexIndex),
        groups[(index + 1) % groups.length]!.samples[0]!.vertexIndex,
      ];
      const points = vertices.map((vertex) => {
        const x = projection.mesh.restPositions2Mm[vertex * 2];
        const y = -projection.mesh.restPositions2Mm[vertex * 2 + 1]!;
        if (!Number.isFinite(x) || !Number.isFinite(y))
          throw new TypeError('Boundary preview coordinates are unavailable.');
        const point = [x!, y];
        coordinates.push(point);
        return point;
      });
      return {
        key: group.key,
        contourId: group.contourId,
        sourceCurveId: group.sourceCurveId,
        d: points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${y}`).join(' '),
      };
    }),
  );
  const xs = coordinates.map(([x]) => x!);
  const ys = coordinates.map(([, y]) => y!);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const width = Math.max(...xs) - x;
  const height = Math.max(...ys) - y;
  const margin = Math.max(width, height, 1) * 0.08;
  return {
    paths,
    viewBox: `${x - margin} ${y - margin} ${width + margin * 2} ${height + margin * 2}`,
  };
}

/** A user-selected ordered curve span includes its exact terminal next contour sample.
 * Reverse traversal is explicit; no seam role, screen location or coordinate is inferred. */
export function selectQualifiedTwoPanelBoundarySpanV1(
  projection: Projection,
  pieceId: string,
  selection: QualifiedTwoPanelCurveSpanV1,
): DxfProductTwoPanelSkirtBoundarySelectionV1 {
  if (
    !selection.firstCurveKey ||
    !selection.lastCurveKey ||
    (selection.traversal !== 'forward' && selection.traversal !== 'reverse')
  )
    throw new TypeError('Choose the first and last exact source curves for every boundary role.');
  const all = curveGroups(projection, pieceId);
  const matches = all.filter((groups) =>
    groups.some((group) => group.key === selection.firstCurveKey),
  );
  if (matches.length !== 1)
    throw new TypeError('The first source curve is absent or ambiguous on this piece.');
  const groups = matches[0]!;
  const first = groups.findIndex((group) => group.key === selection.firstCurveKey);
  const last = groups.findIndex((group) => group.key === selection.lastCurveKey);
  if (last < 0) throw new TypeError('A role span must stay on one exact piece and contour.');
  const step = selection.traversal === 'forward' ? 1 : -1;
  const selected: CurveGroup[] = [];
  for (
    let index = first;
    selected.length <= groups.length;
    index = (index + step + groups.length) % groups.length
  ) {
    selected.push(groups[index]!);
    if (index === last) break;
  }
  if (selected.length > 64)
    throw new TypeError('This qualified role supports at most 64 exact source curves.');
  const vertices =
    selection.traversal === 'forward'
      ? [
          ...selected.flatMap((group) => group.samples.map((sample) => sample.vertexIndex)),
          groups[(last + 1) % groups.length]!.samples[0]!.vertexIndex,
        ]
      : [
          groups[(first + 1) % groups.length]!.samples[0]!.vertexIndex,
          ...selected.flatMap((group) =>
            [...group.samples].reverse().map((sample) => sample.vertexIndex),
          ),
        ];
  if (vertices.length < 2 || new Set(vertices).size !== vertices.length)
    throw new TypeError('A role span must be a connected open boundary segment.');
  return {
    contourId: selected[0]!.contourId,
    sourceCurveIds: selected.map((group) => group.sourceCurveId) as [string, ...string[]],
    boundaryVertexIndices: vertices as [number, number, ...number[]],
  };
}

/** Pure explicit role/profile construction only. Shared by both target versions; no body is
 * generated, admitted or inferred here. Consumers must first validate the source binding. */
function buildGarmentProfile(
  snapshot: Snapshot,
  projection: Projection,
  draft: QualifiedTwoPanelGarmentRoleDraftV1,
  profileReviewed: boolean,
): QualifiedTwoPanelGarmentProfileIntentV1 {
  if (!profileReviewed)
    throw new TypeError('Review and select the canonical annular placement profile.');
  const { frontPieceId, backPieceId, leftSeamId, rightSeamId } = draft;
  if (
    !frontPieceId ||
    !backPieceId ||
    frontPieceId === backPieceId ||
    ![frontPieceId, backPieceId].every((id) => snapshot.assembly.pieceIds.includes(id)) ||
    !leftSeamId ||
    !rightSeamId ||
    leftSeamId === rightSeamId ||
    ![leftSeamId, rightSeamId].every((id) => snapshot.assembly.seamIds.includes(id))
  )
    throw new TypeError(
      'Explicitly choose distinct front/back pieces and left/right Assembly seams.',
    );
  if (frontPieceId !== 'FRONT' || backPieceId !== 'BACK')
    throw new TypeError(
      'The reviewed canonical profile currently requires FRONT as front and BACK as back.',
    );
  const boundary = (side: 'front' | 'back', pieceId: string) => {
    const select = (role: QualifiedTwoPanelBoundaryRoleV1) =>
      selectQualifiedTwoPanelBoundarySpanV1(projection, pieceId, draft.boundaries[side][role]);
    return {
      pieceId,
      waist: select('waist'),
      hem: select('hem'),
      leftSeam: select('leftSeam'),
      rightSeam: select('rightSeam'),
    };
  };
  const parameters = (pieceId: string, mirror: 1 | -1) => ({
    pieceId,
    planarApexMm: [0, 0] as const,
    planarStartRayUnit2: [Math.cos(0.64) * mirror, Math.sin(0.64) * mirror] as const,
    planarAngularDirection: -1 as const,
    planarStartSeamId: leftSeamId,
    waistSlantRadiusMm: 700,
    hemSlantRadiusMm: 900,
    sectorSpanRad: 0.64,
  });
  const id = 'canonical-medium-authored-annular-mapping';
  const revision = 'canonical-medium-authored-annular-mapping-v1';
  return {
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
      boundaries: [boundary('front', frontPieceId), boundary('back', backPieceId)],
    },
    policy: {
      id: 'canonical-medium-actual-body-static-placement-policy',
      revision: 'canonical-medium-actual-body-static-placement-policy-v1',
      mapping: { kind: 'authored-annular-sector-conical', id, revision },
      authoredClearanceM: 0.008,
      clothThicknessM: 0.002,
      retention: {
        id: 'canonical-medium-waist-boundary-support',
        revision: 'canonical-medium-waist-boundary-support-v1',
        kind: 'waist-boundary-support',
      },
    },
    annularParameters: {
      id,
      revision,
      units: { planar: 'mm', body: 'm', angle: 'rad' },
      waistReferenceColliderId: 'waist-collider',
      seamAnchor: { seamId: leftSeamId, bodyAngleRad: 0 },
      pieces: [parameters(frontPieceId, 1), parameters(backPieceId, -1)],
      acceptance: {
        id: 'canonical-acceptance',
        revision: 'canonical-acceptance-v1',
        parameterResidualMm: 0.01,
        parameterResidualRad: 0.000001,
        conicalIdentityResidualM: 0.00000001,
        maxAbsEdgeStretchDelta: 0.01,
        maxAbsAreaScaleDelta: 0.02,
        minNormalizedOrientationDot: 0.999,
        maxAbsWarpGreenStrain: 0.01,
        maxAbsWeftGreenStrain: 0.01,
        maxAbsShear: 0.01,
        selfIntersectionPolicyRevision: 'self-intersection-policy-v1',
      },
    },
  };
}

/** Shared data construction, never an owner, source authentication or physical qualification. */
export const qualifiedTwoPanelPlacementAuthoringInternalsV1 = Object.freeze({
  createRoleDraft,
  requireSource,
  buildGarmentProfile,
});

/** Explicit reviewed parameters for the existing canonical annular gate. These are requested
 * values, not geometry evidence or body admission. Other shapes still fail downstream gates. */
export function buildQualifiedTwoPanelPlacementIntentV1(
  input: Readonly<{
    composerSnapshot: Snapshot;
    composerProjection: Projection;
    draft: QualifiedTwoPanelPlacementDraftV1;
    bodyTarget: DxfProductTwoPanelSkirtPlacementSemanticsRequestV1['body'] | null;
  }>,
): PatternImportDxfProductConfirmedAnnularIntentV1 {
  const { composerSnapshot: snapshot, composerProjection: projection, draft, bodyTarget } = input;
  requireSource(snapshot, projection);
  if (draft.composerCanonicalSha256 !== snapshot.seal.canonicalSha256)
    throw new TypeError('The saved source changed. Choose its garment roles again.');
  if (!bodyTarget || bodyTarget.poseKind !== 'A' || !draft.neutralTargetConfirmed)
    throw new TypeError('Select a current body and confirm the neutral A placement target.');
  const profile = buildGarmentProfile(snapshot, projection, draft, draft.canonicalProfileReviewed);
  return {
    confirmed: true,
    garment: profile.garment,
    body: structuredClone(bodyTarget),
    policy: profile.policy,
    bodyIntent: {
      kind: 'confirmed-neutral-A-target',
      confirmed: true,
      displayedBodyAdmission: false,
    },
    operation: {
      sourceOperationNumber: snapshot.assembly.sourceOperationNumber,
      pieceIds: [...snapshot.assembly.pieceIds],
      seamIds: [...snapshot.assembly.seamIds],
    },
    annularParameters: profile.annularParameters,
  };
}
