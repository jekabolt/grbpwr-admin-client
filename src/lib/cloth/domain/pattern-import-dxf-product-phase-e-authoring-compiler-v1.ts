import type { DxfAssemblyOperationV1, DxfMaterialAssignmentV1 } from './dxf-assembly-handoff-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_INTENT_V1,
  type PatternImportDxfProductPhaseEIntentV1,
} from './pattern-import-dxf-product-phase-e-intent-v1';
import type { PatternImportDxfTwoSidedSeamToleranceV1 } from './pattern-import-dxf-two-sided-seam-mapping-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from './pattern-import-dxf-product-phase-e-authoring-catalog-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_SUBMISSION_V1 =
  'pattern-import-dxf-product-phase-e-authoring-submission/1' as const;

export type PatternImportDxfProductPhaseEAuthoringSubmissionV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_SUBMISSION_V1;
  expectedCatalogCanonicalSha256: string;
  importGeneration: number;
  documentId: string;
  revision: string;
  physicalSurface: PatternImportDxfProductPhaseEIntentV1['physicalSurface'];
  seam: PatternImportDxfProductPhaseEIntentV1['seams'][0];
  operations: readonly DxfAssemblyOperationV1[];
  materials: readonly DxfMaterialAssignmentV1[];
  tolerance: PatternImportDxfTwoSidedSeamToleranceV1;
}>;

export type PatternImportDxfProductPhaseEAuthoringCompileResultV1 =
  | Readonly<{
      ok: true;
      intent: PatternImportDxfProductPhaseEIntentV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_COMPILER_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      intent: null;
      blockers: readonly [
        Readonly<{
          code:
            | 'invalid-authoring-input'
            | 'catalog-seal-mismatch'
            | 'piece-coverage-mismatch'
            | 'contour-choice-mismatch'
            | 'anchor-choice-mismatch'
            | 'physical-surface-choice-mismatch';
          detail: string;
        }>,
      ];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_COMPILER_CLAIMS_V1 = Object.freeze({
  catalogSealFreshVerified: true,
  importGenerationBoundToIntent: true,
  pieceContourAndAnchorChoicesExactMatched: true,
  seamPairingInferred: false,
  directionInferred: false,
  physicalSurfaceInferred: false,
  operationOrderInferred: false,
  materialRevisionInferred: false,
  registryAdmissionPerformed: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  catalogSealFreshVerified: false as const,
  importGenerationBoundToIntent: false as const,
  pieceContourAndAnchorChoicesExactMatched: false as const,
  seamPairingInferred: false as const,
  directionInferred: false as const,
  physicalSurfaceInferred: false as const,
  operationOrderInferred: false as const,
  materialRevisionInferred: false as const,
  registryAdmissionPerformed: false as const,
  productionReady: false as const,
});

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocked(
  code: Extract<
    PatternImportDxfProductPhaseEAuthoringCompileResultV1,
    { ok: false }
  >['blockers'][0]['code'],
  detail: string,
): PatternImportDxfProductPhaseEAuthoringCompileResultV1 {
  return Object.freeze({
    ok: false as const,
    intent: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as Extract<
      PatternImportDxfProductPhaseEAuthoringCompileResultV1,
      { ok: false }
    >['blockers'],
    claims: BLOCKED_CLAIMS,
  });
}

function exactPhysicalSurface(
  value: PatternImportDxfProductPhaseEIntentV1['physicalSurface'],
): boolean {
  return (
    (value?.mode === 'sewing-surface' && value.seamAllowancePhysical === false) ||
    (value?.mode === 'cut-surface' && value.seamAllowancePhysical === true)
  );
}

/**
 * Compiles deliberate catalog choices into the exact narrow intent. This is shape validation only;
 * the registry still fresh-rebuilds Phase-D and runs authoritative Phase-E admission.
 */
export async function compilePatternImportDxfProductPhaseEIntentV1(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  submission: PatternImportDxfProductPhaseEAuthoringSubmissionV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductPhaseEAuthoringCompileResultV1> {
  if (
    !catalog ||
    catalog.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1 ||
    catalog.geometryCoordinatesExposed !== false ||
    catalog.rawDxfExposed !== false ||
    catalog.assemblyInferred !== false ||
    !submission ||
    submission.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_SUBMISSION_V1 ||
    !SHA256.test(submission.expectedCatalogCanonicalSha256 ?? '') ||
    !Number.isSafeInteger(submission.importGeneration) ||
    submission.importGeneration <= 0 ||
    !STABLE_ID.test(submission.documentId ?? '') ||
    !STABLE_ID.test(submission.revision ?? '') ||
    !exactPhysicalSurface(submission.physicalSurface) ||
    !Array.isArray(submission.operations) ||
    !Array.isArray(submission.materials) ||
    !submission.tolerance
  )
    return blocked(
      'invalid-authoring-input',
      'Exact catalog, import generation, document revision, physical surface, operations and materials are required.',
    );
  const { canonicalSha256, ...unsignedCatalog } = catalog;
  const freshCatalogSha256 = await computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
    unsignedCatalog,
    crypto,
  );
  if (
    !freshCatalogSha256 ||
    canonicalSha256 !== freshCatalogSha256 ||
    submission.expectedCatalogCanonicalSha256 !== freshCatalogSha256
  )
    return blocked(
      'catalog-seal-mismatch',
      'The authoring submission does not bind the exact fresh catalog.',
    );
  if (
    catalog.pieces.length !== 2 ||
    new Set(catalog.pieces.map(({ pieceId }) => pieceId)).size !== 2
  )
    return blocked(
      'piece-coverage-mismatch',
      'The V1 authoring compiler requires exactly two catalog pieces.',
    );
  const seam = submission.seam;
  if (
    !seam ||
    !STABLE_ID.test(seam.id ?? '') ||
    !STABLE_ID.test(seam.operationId ?? '') ||
    seam.mapping !== 'equal' ||
    seam.lengthRatio !== 1 ||
    !Array.isArray(seam.sides) ||
    seam.sides.length !== 2
  )
    return blocked(
      'invalid-authoring-input',
      'One explicit equal two-sided seam and its operation are required.',
    );
  const seenPieces = new Set<string>();
  for (const side of seam.sides) {
    const pieces = catalog.pieces.filter(
      ({ pieceId, pieceLineKey }) => pieceId === side.pieceId && pieceLineKey === side.pieceLineKey,
    );
    if (pieces.length !== 1 || seenPieces.has(side.pieceId))
      return blocked(
        'piece-coverage-mismatch',
        'The authored seam must cover both catalog pieces exactly once.',
      );
    seenPieces.add(side.pieceId);
    const contours = pieces[0].contours.filter(({ contourId }) => contourId === side.contourId);
    if (contours.length !== 1)
      return blocked(
        'contour-choice-mismatch',
        'Each authored side must name one exact catalog contour.',
      );
    const expectedRole =
      submission.physicalSurface.mode === 'sewing-surface' ? 'sewing-boundary' : 'cut-boundary';
    if (contours[0].role !== expectedRole)
      return blocked(
        'physical-surface-choice-mismatch',
        `The explicit ${submission.physicalSurface.mode} requires ${expectedRole} contours.`,
      );
    if (
      !Array.isArray(side.anchors) ||
      side.anchors.length !== 2 ||
      side.anchors[0] === side.anchors[1] ||
      side.anchors.some(
        (anchor: string) =>
          contours[0].boundaryVertices.filter(({ vertexId }) => vertexId === anchor).length !== 1,
      ) ||
      !['forward', 'reverse'].includes(side.direction)
    )
      return blocked(
        'anchor-choice-mismatch',
        'Each side needs two distinct catalog boundary vertices and an explicit direction.',
      );
  }
  if (seenPieces.size !== 2)
    return blocked('piece-coverage-mismatch', 'Both catalog pieces must be authored exactly once.');

  const intent: PatternImportDxfProductPhaseEIntentV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_INTENT_V1,
    scopeKey: catalog.scopeKey,
    sizeToken: catalog.sizeToken,
    importGeneration: submission.importGeneration,
    documentId: submission.documentId,
    revision: submission.revision,
    physicalSurface:
      submission.physicalSurface.mode === 'sewing-surface'
        ? { mode: 'sewing-surface', seamAllowancePhysical: false }
        : { mode: 'cut-surface', seamAllowancePhysical: true },
    seams: [
      {
        id: seam.id,
        operationId: seam.operationId,
        sides: [
          {
            pieceLineKey: seam.sides[0].pieceLineKey,
            pieceId: seam.sides[0].pieceId,
            contourId: seam.sides[0].contourId,
            anchors: [seam.sides[0].anchors[0], seam.sides[0].anchors[1]],
            direction: seam.sides[0].direction,
          },
          {
            pieceLineKey: seam.sides[1].pieceLineKey,
            pieceId: seam.sides[1].pieceId,
            contourId: seam.sides[1].contourId,
            anchors: [seam.sides[1].anchors[0], seam.sides[1].anchors[1]],
            direction: seam.sides[1].direction,
          },
        ],
        mapping: 'equal',
        lengthRatio: 1,
      },
    ],
    operations: submission.operations.map(({ id, stage, order, kind, seamIds }) => ({
      id,
      stage,
      order,
      kind,
      seamIds: [...seamIds],
    })),
    materials: submission.materials.map(({ id, pieceIds, materialRevision }) => ({
      id,
      pieceIds: [...pieceIds],
      materialRevision,
    })),
    tolerance: {
      endpointMm: submission.tolerance.endpointMm,
      fullLengthMm: submission.tolerance.fullLengthMm,
      fullLengthRelative: submission.tolerance.fullLengthRelative,
    },
  };
  return deepFreeze({
    ok: true as const,
    intent,
    blockers: [] as const,
    claims: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_COMPILER_CLAIMS_V1,
  });
}
