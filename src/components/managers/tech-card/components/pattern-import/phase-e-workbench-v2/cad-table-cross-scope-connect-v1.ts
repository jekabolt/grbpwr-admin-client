import type { PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1 } from './cad-table-zero-connect-authoring-handoff-v1';
import type { PatternImportDxfPhaseEZeroConnectPendingHandoffV1 } from './cad-table-zero-connect-post-save-owner-v1';
import type {
  PatternImportDxfPhaseECadMaterialScopePreparationResultV1,
  PatternImportDxfPhaseECadPreparedMaterialScopeV1,
} from './cad-material-scope-preparation-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_CONNECT_V1 =
  'pattern-import-dxf-phase-e-cad-table-cross-scope-connect/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_CONNECT_CLAIMS_V1 = Object.freeze({
  fullyPreparedMaterialScopesRequired: true,
  explicitScopeKeyPerSideRequired: true,
  sameTechCardRequired: true,
  sameImportGenerationRequired: true,
  sameSizeTokenRequired: true,
  currentCatalogAndProjectionHashesRequired: true,
  uniqueScopePieceKeysRequired: true,
  scopeInferredFromPieceName: false,
  existingSingleCatalogZeroConnectHandoffAccepted: false,
  existingStoredSeamPreservesSideScopeKeys: false,
  existingPendingHandoffPreservesTwoAuthorities: false,
  twoAuthorityStoredSeamCrosswalkAvailableWhenGlobalPieceKeysUnique: true,
  currentOperationBindingHandoffMounted: false,
  fakePersistenceCreated: false,
  productionReady: false,
} as const);

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_PERSISTENCE_BLOCKER_V1 =
  Object.freeze({
    code: 'cross-scope-operation-binding-handoff-unavailable' as const,
    detail:
      'The two-authority StoredSeam crosswalk is available for distinct global piece keys, but the current workbench/pending request does not yet bind this candidate to one saved operation with both inputs.',
  });

export type PatternImportDxfPhaseECadTableCrossScopeConnectSideV1 = Readonly<{
  scopeKey: string;
  pieceId: string;
  pieceLineKey: string;
  contourId: string;
  boundaryVertexIds: readonly [string, string];
  direction: 'forward' | 'reverse';
}>;

export type PatternImportDxfPhaseECadTableCrossScopeConnectSourceV1 = Readonly<{
  techCardId: number;
  importGeneration: number;
  sizeToken: string;
  scopeKey: string;
  sourceFileId: string;
  selectedGeometrySha256: string;
  sizeSelectionCanonicalSha256: string;
  catalogCanonicalSha256: string;
  projectionExpectedCatalogCanonicalSha256: string;
  projectionSizeSelectionCanonicalSha256: string;
  documentId: string;
  documentRevision: string;
}>;

export type PatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_CONNECT_V1;
  status: 'exact-cross-scope-draft-candidate';
  techCardId: number;
  importGeneration: number;
  sizeToken: string;
  mapping: 'equal' | 'eased' | 'gathered';
  lengthRatio: number;
  sources: readonly [
    PatternImportDxfPhaseECadTableCrossScopeConnectSourceV1,
    PatternImportDxfPhaseECadTableCrossScopeConnectSourceV1,
  ];
  sides: readonly [
    PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
    PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
  ];
  uniquePieceKeys: readonly [string, string];
  apply: Readonly<{
    eligible: false;
    blocker: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_PERSISTENCE_BLOCKER_V1;
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_CONNECT_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseECadTableCrossScopeConnectBlockerV1 = Readonly<{
  code:
    | 'cross-scope-preparation-unavailable'
    | 'cross-scope-card-generation-stale'
    | 'cross-scope-size-mismatch'
    | 'cross-scope-side-invalid'
    | 'cross-scope-authority-unavailable'
    | 'cross-scope-authority-stale'
    | 'cross-scope-piece-not-exact'
    | 'cross-scope-contour-not-exact'
    | 'cross-scope-edge-not-exact'
    | 'cross-scope-piece-key-duplicate'
    | 'cross-scope-mapping-invalid';
  detail: string;
}>;

export type PatternImportDxfPhaseECadTableCrossScopeConnectResultV1 =
  | Readonly<{
      ok: true;
      candidate: PatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      candidate: null;
      blocker: PatternImportDxfPhaseECadTableCrossScopeConnectBlockerV1;
    }>;

export type PatternImportDxfPhaseECadTableCrossScopeExistingHandoffResultV1 = Readonly<{
  ok: false;
  request: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1 | null;
  pending: PatternImportDxfPhaseEZeroConnectPendingHandoffV1 | null;
  blocker: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_PERSISTENCE_BLOCKER_V1;
}>;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function blocked(
  code: PatternImportDxfPhaseECadTableCrossScopeConnectBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseECadTableCrossScopeConnectResultV1 {
  return Object.freeze({
    ok: false as const,
    candidate: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function sourceOf(
  scope: PatternImportDxfPhaseECadPreparedMaterialScopeV1,
): PatternImportDxfPhaseECadTableCrossScopeConnectSourceV1 {
  return Object.freeze({
    techCardId: scope.documentEvidence.techCardId,
    importGeneration: scope.sourceRevision,
    sizeToken: scope.sizeToken,
    scopeKey: scope.scopeKey,
    sourceFileId: scope.catalog.sourceFileId,
    selectedGeometrySha256: scope.selection.selection.selectedGeometrySha256,
    sizeSelectionCanonicalSha256: scope.selection.selection.canonicalSha256,
    catalogCanonicalSha256: scope.catalog.canonicalSha256,
    projectionExpectedCatalogCanonicalSha256: scope.projection.expectedCatalogCanonicalSha256,
    projectionSizeSelectionCanonicalSha256: scope.projection.sizeSelectionCanonicalSha256,
    documentId: scope.documentAuthority.documentId,
    documentRevision: scope.documentAuthority.revision,
  });
}

function authorityCurrent(
  scope: PatternImportDxfPhaseECadPreparedMaterialScopeV1,
  techCardId: number,
  importGeneration: number,
  sizeToken: string,
): boolean {
  const selection = scope.selection;
  return (
    scope.sourceRevision === importGeneration &&
    scope.sizeToken === sizeToken &&
    selection.ok === true &&
    selection.selection.scopeKey === scope.scopeKey &&
    selection.selection.sizeToken === sizeToken &&
    SHA256.test(selection.selection.selectedGeometrySha256) &&
    SHA256.test(selection.selection.canonicalSha256) &&
    scope.catalog.techCardId === techCardId &&
    scope.catalog.scopeKey === scope.scopeKey &&
    scope.catalog.sizeToken === sizeToken &&
    scope.catalog.sourceFileId === selection.phaseD.source.sourceFileId &&
    scope.catalog.sizeSelectionCanonicalSha256 === selection.selection.canonicalSha256 &&
    SHA256.test(scope.catalog.canonicalSha256) &&
    scope.projection.sourceFileId === scope.catalog.sourceFileId &&
    scope.projection.sizeToken === sizeToken &&
    scope.projection.expectedCatalogCanonicalSha256 === scope.catalog.canonicalSha256 &&
    scope.projection.sizeSelectionCanonicalSha256 === selection.selection.canonicalSha256 &&
    scope.documentEvidence.techCardId === techCardId &&
    scope.documentEvidence.scopeKey === scope.scopeKey &&
    scope.documentAuthority.evidence.techCardId === techCardId &&
    scope.documentAuthority.evidence.scopeKey === scope.scopeKey &&
    scope.documentAuthority.sizeSelectionCanonicalSha256 === selection.selection.canonicalSha256 &&
    scope.documentAuthority.catalogCanonicalSha256 === scope.catalog.canonicalSha256 &&
    STABLE_ID.test(scope.documentAuthority.documentId) &&
    STABLE_ID.test(scope.documentAuthority.revision)
  );
}

function exactSide(
  scope: PatternImportDxfPhaseECadPreparedMaterialScopeV1,
  side: PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
): PatternImportDxfPhaseECadTableCrossScopeConnectBlockerV1 | null {
  if (
    side.scopeKey !== scope.scopeKey ||
    !STABLE_ID.test(side.scopeKey) ||
    !STABLE_ID.test(side.pieceId) ||
    !STABLE_ID.test(side.pieceLineKey) ||
    !STABLE_ID.test(side.contourId) ||
    !Array.isArray(side.boundaryVertexIds) ||
    side.boundaryVertexIds.length !== 2 ||
    side.boundaryVertexIds[0] === side.boundaryVertexIds[1] ||
    !side.boundaryVertexIds.every((vertexId) => STABLE_ID.test(vertexId)) ||
    !['forward', 'reverse'].includes(side.direction)
  )
    return Object.freeze({
      code: 'cross-scope-side-invalid' as const,
      detail: 'Each side must explicitly name one scope, piece, contour and ordered exact edge.',
    });
  const pieces = scope.catalog.pieces.filter(
    ({ pieceId, pieceLineKey }) => pieceId === side.pieceId && pieceLineKey === side.pieceLineKey,
  );
  if (pieces.length !== 1)
    return Object.freeze({
      code: 'cross-scope-piece-not-exact' as const,
      detail: `Scope ${side.scopeKey} does not contain one exact requested piece identity.`,
    });
  const contours = pieces[0]!.contours.filter(
    ({ contourId, role }) => contourId === side.contourId && role === 'sewing-boundary',
  );
  if (contours.length !== 1)
    return Object.freeze({
      code: 'cross-scope-contour-not-exact' as const,
      detail: `Scope ${side.scopeKey} does not contain one exact sewing contour.`,
    });
  const contour = contours[0]!;
  const indexes = side.boundaryVertexIds.map((vertexId) =>
    contour.boundaryVertices.findIndex((vertex) => vertex.vertexId === vertexId),
  );
  const delta = Math.abs(indexes[0]! - indexes[1]!);
  const adjacent =
    indexes.every((index) => index >= 0) &&
    (delta === 1 || (contour.closed && delta === contour.boundaryVertices.length - 1));
  const projected = scope.projection.pieces
    .filter(
      ({ pieceId, pieceLineKey }) => pieceId === side.pieceId && pieceLineKey === side.pieceLineKey,
    )
    .flatMap(({ contours }) => contours.filter(({ contourId }) => contourId === side.contourId));
  if (
    !adjacent ||
    projected.length !== 1 ||
    side.boundaryVertexIds.some(
      (vertexId) =>
        projected[0]!.vertices.filter((vertex) => vertex.vertexId === vertexId).length !== 1,
    )
  )
    return Object.freeze({
      code: 'cross-scope-edge-not-exact' as const,
      detail: `Scope ${side.scopeKey} edge is not one adjacent current catalog/projection edge.`,
    });
  return null;
}

/** Builds exact cross-scope evidence only; its Apply boundary remains deliberately blocked. */
export function buildPatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1(
  input: Readonly<{
    preparation: PatternImportDxfPhaseECadMaterialScopePreparationResultV1 | null;
    techCardId: number;
    importGeneration: number;
    sizeToken: string;
    mapping: 'equal' | 'eased' | 'gathered';
    lengthRatio: number;
    sides: readonly [
      PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
      PatternImportDxfPhaseECadTableCrossScopeConnectSideV1,
    ];
  }>,
): PatternImportDxfPhaseECadTableCrossScopeConnectResultV1 {
  const { preparation } = input;
  if (!preparation?.ok)
    return blocked(
      'cross-scope-preparation-unavailable',
      preparation?.blocker.detail ?? 'A fully prepared exact material-scope set is required.',
    );
  if (
    !Number.isSafeInteger(input.techCardId) ||
    input.techCardId <= 0 ||
    !Number.isSafeInteger(input.importGeneration) ||
    input.importGeneration <= 0 ||
    preparation.catalog.techCardId !== input.techCardId
  )
    return blocked(
      'cross-scope-card-generation-stale',
      'The cross-scope request does not match the current card and import generation.',
    );
  if (!STABLE_ID.test(input.sizeToken))
    return blocked('cross-scope-size-mismatch', 'One explicit stable size token is required.');
  if (
    !['equal', 'eased', 'gathered'].includes(input.mapping) ||
    !Number.isFinite(input.lengthRatio) ||
    input.lengthRatio <= 0 ||
    (input.mapping === 'equal' && input.lengthRatio !== 1)
  )
    return blocked(
      'cross-scope-mapping-invalid',
      'Choose equal ratio 1 or an explicit positive eased/gathered ratio.',
    );
  const [sideA, sideB] = input.sides;
  if (sideA.scopeKey === sideB.scopeKey)
    return blocked(
      'cross-scope-side-invalid',
      'Cross-scope connection requires two different explicit material scope keys.',
    );
  const scopes = input.sides.map((side) =>
    preparation.scopes.filter(({ scopeKey }) => scopeKey === side.scopeKey),
  );
  if (scopes.some((matches) => matches.length !== 1))
    return blocked(
      'cross-scope-authority-unavailable',
      'Each explicit side scope must resolve to one fully prepared exact authority.',
    );
  const preparedA = scopes[0]![0]!;
  const preparedB = scopes[1]![0]!;
  if (
    !authorityCurrent(preparedA, input.techCardId, input.importGeneration, input.sizeToken) ||
    !authorityCurrent(preparedB, input.techCardId, input.importGeneration, input.sizeToken)
  )
    return blocked(
      'cross-scope-authority-stale',
      'Both material authorities must share the current card, import generation, size and hashes.',
    );
  const sideAIssue = exactSide(preparedA, sideA);
  if (sideAIssue) return blocked(sideAIssue.code, sideAIssue.detail);
  const sideBIssue = exactSide(preparedB, sideB);
  if (sideBIssue) return blocked(sideBIssue.code, sideBIssue.detail);
  const pieceKeys = [
    `${sideA.scopeKey}:${sideA.pieceLineKey}`,
    `${sideB.scopeKey}:${sideB.pieceLineKey}`,
  ] as const;
  if (pieceKeys[0] === pieceKeys[1])
    return blocked(
      'cross-scope-piece-key-duplicate',
      'The two exact sides must retain distinct scope-qualified piece keys.',
    );
  return Object.freeze({
    ok: true as const,
    candidate: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_CONNECT_V1,
      status: 'exact-cross-scope-draft-candidate' as const,
      techCardId: input.techCardId,
      importGeneration: input.importGeneration,
      sizeToken: input.sizeToken,
      mapping: input.mapping,
      lengthRatio: input.lengthRatio,
      sources: Object.freeze([sourceOf(preparedA), sourceOf(preparedB)] as const),
      sides: Object.freeze([sideA, sideB] as const),
      uniquePieceKeys: Object.freeze(pieceKeys),
      apply: Object.freeze({
        eligible: false as const,
        blocker: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_PERSISTENCE_BLOCKER_V1,
      }),
      claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_CONNECT_CLAIMS_V1,
    }),
    blocker: null,
  });
}

/** Current V1 bridge audit: one catalog/projection cannot preserve this two-authority candidate. */
export function bridgePatternImportDxfPhaseECadTableCrossScopeToExistingZeroConnectV1(
  candidate: PatternImportDxfPhaseECadTableCrossScopeConnectCandidateV1,
): PatternImportDxfPhaseECadTableCrossScopeExistingHandoffResultV1 {
  void candidate;
  return Object.freeze({
    ok: false as const,
    request: null,
    pending: null,
    blocker: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_PERSISTENCE_BLOCKER_V1,
  });
}
