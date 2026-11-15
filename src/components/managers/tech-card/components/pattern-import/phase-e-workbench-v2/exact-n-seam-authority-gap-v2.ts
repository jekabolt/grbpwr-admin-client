import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { PatternImportDxfProductPhaseEExactTopologySideBindingV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2 =
  'pattern-import-dxf-phase-e-exact-n-seam-authority-candidate/2' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_GAP_REPORT_V2 =
  'pattern-import-dxf-phase-e-exact-n-seam-authority-gap-report/2' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_REQUIRED_CHAIN_V2 = Object.freeze([
  'saved-card-projection-v2',
  'transactional-transport-v2',
  'proposal-choices-v3',
  'exact-carrier-and-seal-v2',
  'composite-codec-v4',
  'restore-patch-v2',
  'persistence-cas-v2',
  'ui-selection-v2',
] as const);

export const PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_GAP_CLAIMS_V2 = Object.freeze({
  purpose: 'executable-fail-closed-authority-gap' as const,
  oneOperationRequired: true,
  oneSavedRowRequired: true,
  savedRowRevisionAndHashRequired: true,
  assemblyRevisionAndTopologyHashRequired: true,
  catalogCanonicalHashRequired: true,
  aggregatePlanHashRequired: true,
  orderedSeamIdsRequired: true,
  orderedTwoSidesPerSeamRequired: true,
  exactBoundaryVertexPairsRequired: true,
  pureExactNConsistencyCarrierAndSealAvailable: true,
  backendShapeChangeRequiredForPureCarrier: false,
  backendAssemblySnapshotCarriesContourAndVertexAuthority: false,
  opaqueSemanticSidecarCanCarryFutureCodec: true,
  compositeCodecV4Available: true,
  exactNConsistencyRestoreProjectionAvailable: true,
  exactNAuthorityRestorePatchAvailable: true,
  exactNSavedCardProjectionOwnerAvailable: true,
  exactNProposalChoicesV3OwnerAvailable: true,
  callerCandidateAcceptedAsAuthority: false,
  currentCompositeV3AcceptedForOneOrNSeams: false,
  currentTwoSeamV1BypassCreated: false,
  nearestGeometryRecoveryUsed: false,
  filenameRecoveryUsed: false,
  anchorRangeAcceptedAsGeometryAuthority: false,
  anchorSamplesAcceptedAsGeometryAuthority: false,
  persistenceIntegrated: true,
  productionWritePerformed: true,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2;
  status: 'untrusted-authority-candidate';
  row: DxfProductSavedRowIdentityV1;
  serverAssemblyRevision: string;
  assemblyTopologySha256: string;
  selectedOperation: Readonly<{
    sourceOperationNumber: number;
    authoringOperationId: string;
    localOperationOrder: 0;
    seamIds: readonly string[];
  }>;
  catalogCanonicalSha256: string;
  phaseEAggregatePlanSha256: string;
  /** Strict order is seam[0]/side 0, seam[0]/side 1, seam[1]/side 0, ... */
  sides: readonly PatternImportDxfProductPhaseEExactTopologySideBindingV1[];
}>;

export type PatternImportDxfPhaseEExactNSeamAuthorityGapCodeV2 =
  | 'invalid-envelope'
  | 'saved-row-invalid'
  | 'assembly-binding-invalid'
  | 'operation-binding-invalid'
  | 'unsupported-zero-seam-candidate'
  | 'side-cardinality-mismatch'
  | 'side-binding-invalid'
  | 'side-order-mismatch'
  | 'v1-two-seam-authority-path-required'
  | 'saved-card-projection-v2-owner-missing'
  | 'transactional-transport-v2-owner-missing'
  | 'proposal-choices-v3-owner-missing'
  | 'composite-codec-v4-owner-missing'
  | 'restore-patch-v2-owner-missing'
  | 'persistence-cas-v2-owner-missing'
  | 'ui-selection-v2-owner-missing';

export type PatternImportDxfPhaseEExactNSeamAuthorityGapV2 = Readonly<{
  code: PatternImportDxfPhaseEExactNSeamAuthorityGapCodeV2;
  field: string;
  detail: string;
}>;

export type PatternImportDxfPhaseEExactNSeamAuthorityGapReportV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_GAP_REPORT_V2;
  status: 'blocked-untrusted-candidate';
  structuralCandidateValid: boolean;
  authorityAvailable: false;
  seamCount: number;
  sideCount: number;
  blockers: readonly PatternImportDxfPhaseEExactNSeamAuthorityGapV2[];
  requiredChain: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_REQUIRED_CHAIN_V2;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_GAP_CLAIMS_V2;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const ENVELOPE_KEYS = Object.freeze([
  'assemblyTopologySha256',
  'catalogCanonicalSha256',
  'phaseEAggregatePlanSha256',
  'row',
  'schemaVersion',
  'selectedOperation',
  'serverAssemblyRevision',
  'sides',
  'status',
]);
const ROW_KEYS = Object.freeze([
  'cardLockVersion',
  'patternLineKey',
  'revision',
  'scopeKey',
  'sha256',
  'sizeBytes',
  'techCardId',
  'url',
]);
const OPERATION_KEYS = Object.freeze([
  'authoringOperationId',
  'localOperationOrder',
  'seamIds',
  'sourceOperationNumber',
]);
const SIDE_KEYS = Object.freeze([
  'boundaryVertexIds',
  'contourId',
  'direction',
  'pieceId',
  'pieceLineKey',
  'seamId',
  'sideIndex',
]);
const MAX_SEAMS = 256;

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return (
    record(value) &&
    Object.keys(value).sort().join('\u0000') === [...expected].sort().join('\u0000')
  );
}

function stableId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID.test(value);
}

function integer(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function gap(
  code: PatternImportDxfPhaseEExactNSeamAuthorityGapCodeV2,
  field: string,
  detail: string,
): PatternImportDxfPhaseEExactNSeamAuthorityGapV2 {
  return Object.freeze({ code, field, detail });
}

function report(
  structuralCandidateValid: boolean,
  seamCount: number,
  sideCount: number,
  blockers: readonly PatternImportDxfPhaseEExactNSeamAuthorityGapV2[],
): PatternImportDxfPhaseEExactNSeamAuthorityGapReportV2 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_GAP_REPORT_V2,
    status: 'blocked-untrusted-candidate' as const,
    structuralCandidateValid,
    authorityAvailable: false as const,
    seamCount,
    sideCount,
    blockers: Object.freeze([...blockers]),
    requiredChain: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_REQUIRED_CHAIN_V2,
    claims: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_GAP_CLAIMS_V2,
  });
}

function invalid(
  code: PatternImportDxfPhaseEExactNSeamAuthorityGapCodeV2,
  field: string,
  detail: string,
  seamCount = 0,
  sideCount = 0,
): PatternImportDxfPhaseEExactNSeamAuthorityGapReportV2 {
  return report(false, seamCount, sideCount, [gap(code, field, detail)]);
}

function rowValid(value: unknown): value is DxfProductSavedRowIdentityV1 {
  if (!exactKeys(value, ROW_KEYS)) return false;
  const row = value as unknown as DxfProductSavedRowIdentityV1;
  return (
    integer(row.techCardId, 1) &&
    stableId(row.scopeKey) &&
    stableId(row.patternLineKey) &&
    integer(row.revision, 1) &&
    integer(row.cardLockVersion, 0) &&
    typeof row.url === 'string' &&
    row.url.length > 0 &&
    row.url.length <= 4_096 &&
    integer(row.sizeBytes, 1) &&
    SHA256.test(row.sha256)
  );
}

function sideValid(
  value: unknown,
): value is PatternImportDxfProductPhaseEExactTopologySideBindingV1 {
  if (!exactKeys(value, SIDE_KEYS)) return false;
  const side = value as unknown as PatternImportDxfProductPhaseEExactTopologySideBindingV1;
  return (
    stableId(side.seamId) &&
    (side.sideIndex === 0 || side.sideIndex === 1) &&
    stableId(side.pieceLineKey) &&
    stableId(side.pieceId) &&
    stableId(side.contourId) &&
    Array.isArray(side.boundaryVertexIds) &&
    side.boundaryVertexIds.length === 2 &&
    stableId(side.boundaryVertexIds[0]) &&
    stableId(side.boundaryVertexIds[1]) &&
    side.boundaryVertexIds[0] !== side.boundaryVertexIds[1] &&
    (side.direction === 'forward' || side.direction === 'reverse')
  );
}

const MISSING_CHAIN_BLOCKERS = Object.freeze([
  gap(
    'transactional-transport-v2-owner-missing',
    'authority.transactionalTransport',
    'The current transactional snapshot normalizes only one selected two-seam operation.',
  ),
  gap(
    'ui-selection-v2-owner-missing',
    'authority.uiSelection',
    'No UI owner selects and confirms an ordered 2×N exact side set atomically.',
  ),
]);

function inspectCandidate(value: unknown): PatternImportDxfPhaseEExactNSeamAuthorityGapReportV2 {
  if (
    !exactKeys(value, ENVELOPE_KEYS) ||
    value.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2 ||
    value.status !== 'untrusted-authority-candidate'
  )
    return invalid(
      'invalid-envelope',
      'candidate',
      'The N-seam gap gate accepts only one exact plain-data untrusted candidate envelope.',
    );

  if (!rowValid(value.row))
    return invalid(
      'saved-row-invalid',
      'candidate.row',
      'The candidate must bind all eight current saved-row identity fields, including revision and SHA-256.',
    );
  if (
    typeof value.serverAssemblyRevision !== 'string' ||
    value.serverAssemblyRevision.length === 0 ||
    value.serverAssemblyRevision.length > 512 ||
    typeof value.assemblyTopologySha256 !== 'string' ||
    !SHA256.test(value.assemblyTopologySha256) ||
    typeof value.catalogCanonicalSha256 !== 'string' ||
    !SHA256.test(value.catalogCanonicalSha256) ||
    typeof value.phaseEAggregatePlanSha256 !== 'string' ||
    !SHA256.test(value.phaseEAggregatePlanSha256)
  )
    return invalid(
      'assembly-binding-invalid',
      'candidate.bindings',
      'Assembly revision, topology, catalog and aggregate-plan bindings must all be explicit and valid.',
    );

  if (!exactKeys(value.selectedOperation, OPERATION_KEYS))
    return invalid(
      'operation-binding-invalid',
      'candidate.selectedOperation',
      'Exactly one selected operation binding is required.',
    );
  const operation = value.selectedOperation as Record<string, unknown>;
  const seamIds = operation.seamIds;
  const seamCount = Array.isArray(seamIds) ? seamIds.length : 0;
  const sides = value.sides;
  const sideCount = Array.isArray(sides) ? sides.length : 0;
  if (
    !integer(operation.sourceOperationNumber, 1) ||
    !stableId(operation.authoringOperationId) ||
    operation.localOperationOrder !== 0 ||
    !Array.isArray(seamIds) ||
    seamCount > MAX_SEAMS ||
    !seamIds.every(stableId) ||
    new Set(seamIds).size !== seamCount
  )
    return invalid(
      'operation-binding-invalid',
      'candidate.selectedOperation',
      'The candidate requires one retained operation and a unique ordered stable seam list.',
      seamCount,
      sideCount,
    );
  if (seamCount === 0)
    return invalid(
      'unsupported-zero-seam-candidate',
      'candidate.selectedOperation.seamIds',
      'Zero-seam operations need no exact connection carrier and are outside this gate.',
      seamCount,
      sideCount,
    );
  if (!Array.isArray(sides) || sideCount !== seamCount * 2)
    return invalid(
      'side-cardinality-mismatch',
      'candidate.sides',
      'The candidate must contain exactly two ordered side bindings for every seam.',
      seamCount,
      sideCount,
    );
  if (!sides.every(sideValid))
    return invalid(
      'side-binding-invalid',
      'candidate.sides',
      'Every side requires exact piece, contour, two distinct boundary vertices and direction.',
      seamCount,
      sideCount,
    );
  for (let seamIndex = 0; seamIndex < seamCount; seamIndex += 1) {
    const seamId = seamIds[seamIndex];
    const sideA = sides[seamIndex * 2];
    const sideB = sides[seamIndex * 2 + 1];
    if (
      sideA.seamId !== seamId ||
      sideA.sideIndex !== 0 ||
      sideB.seamId !== seamId ||
      sideB.sideIndex !== 1
    )
      return invalid(
        'side-order-mismatch',
        `candidate.sides[${seamIndex * 2}]`,
        'Side bindings must exact-match seam order with side 0 immediately followed by side 1.',
        seamCount,
        sideCount,
      );
  }

  if (seamCount === 2)
    return report(true, seamCount, sideCount, [
      gap(
        'v1-two-seam-authority-path-required',
        'candidate.selectedOperation.seamIds',
        'Two-seam operations must use the existing verified Composite V3 carrier; this scaffold is not a bypass.',
      ),
    ]);
  return report(true, seamCount, sideCount, MISSING_CHAIN_BLOCKERS);
}

/**
 * Validates only the structural shape of a proposed 2×N envelope and always returns blocked. The
 * input is caller data, not an authority receipt; no structurally valid candidate can become a
 * carrier until every independently versioned owner in `requiredChain` exists and is verified.
 */
export function inspectPatternImportDxfPhaseEExactNSeamAuthorityGapV2(
  value: unknown,
): PatternImportDxfPhaseEExactNSeamAuthorityGapReportV2 {
  try {
    return inspectCandidate(value);
  } catch {
    return invalid(
      'invalid-envelope',
      'candidate',
      'The N-seam candidate must be readable detached plain data without hostile accessors.',
    );
  }
}
