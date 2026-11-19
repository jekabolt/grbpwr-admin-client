import {
  computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';

import {
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_RESTORE_OWNER_V2,
  readPatternImportDxfProductExactNSeamRestorePatchV2,
  type PatternImportDxfProductExactNSeamRestoreOwnerV2,
  type PatternImportDxfProductExactNSeamRestorePatchV2,
} from './composite-sidecar-restore-authority-v4';

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PREPARED_PROPOSAL_V3 =
  'pattern-import-dxf-product-exact-n-seam-prepared-proposal/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_REQUEST_V2 =
  'pattern-import-dxf-product-exact-n-seam-saved-card-projection-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_V2 =
  'pattern-import-dxf-product-exact-n-seam-saved-card-projection/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PROPOSAL_CHOICES_V3 =
  'pattern-import-dxf-product-exact-n-seam-proposal-choices/3' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PROJECTION_OWNER_V2 =
  'pattern-import-dxf-product-exact-n-seam-projection-owner/2' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_CLAIMS_V2 =
  Object.freeze({
    genuineCompositeV4RestoreOwnerRequired: true,
    currentCatalogCanonicalSha256Recomputed: true,
    currentPreparedProposalExactMatched: true,
    orderedOneOrGreaterThanTwoSeamsProjected: true,
    exactlyTwoOrderedSidesPerSeamProjected: true,
    exactPieceLineContourVertexAndDirectionMatched: true,
    catalogBoundaryAdjacencyVerified: true,
    duplicatePhysicalBoundaryUseAccepted: false,
    oneAndGreaterThanTwoSeamsOnly: true,
    exactTwoSeamsRemainOnV3V1: true,
    nearestGeometryRecoveryUsed: false,
    anchorRangeOrSamplesUsedAsAuthority: false,
    aggregateMaterialToleranceChoicesReconstructed: false,
    projectionAvailableOnlyThroughOwner: true,
    directUiSelectionPerformed: false,
    persistencePerformed: false,
    networkPerformed: false,
    productionReady: false,
  } as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_CLAIMS_V2,
  currentCatalogCanonicalSha256Recomputed: false as const,
  currentPreparedProposalExactMatched: false as const,
  orderedOneOrGreaterThanTwoSeamsProjected: false as const,
  exactlyTwoOrderedSidesPerSeamProjected: false as const,
  exactPieceLineContourVertexAndDirectionMatched: false as const,
  catalogBoundaryAdjacencyVerified: false as const,
  projectionAvailableOnlyThroughOwner: false as const,
});

type RestorePatch = PatternImportDxfProductExactNSeamRestorePatchV2;
type ExactBindings = RestorePatch['bindings'];
type ExactSide = RestorePatch['seams'][number]['sides'][number];

export type PatternImportDxfProductExactNSeamPreparedProposalV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PREPARED_PROPOSAL_V3;
  status: 'current-saved-card-proposal';
  expectedCatalogCanonicalSha256: string;
  phaseEAggregatePlanSha256: string;
  operation: ExactBindings['selectedOperation'];
  seams: readonly Readonly<{
    seamId: string;
    sides: readonly [
      Readonly<{
        pieceId: string;
        pieceLineKey: string;
        requiredDirection: 'forward' | 'reverse';
      }>,
      Readonly<{
        pieceId: string;
        pieceLineKey: string;
        requiredDirection: 'forward' | 'reverse';
      }>,
    ];
  }>[];
}>;

export type PatternImportDxfProductExactNSeamSavedCardProjectionRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_REQUEST_V2;
  restoreOwner: PatternImportDxfProductExactNSeamRestoreOwnerV2;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  preparedProposal: PatternImportDxfProductExactNSeamPreparedProposalV3;
}>;

type ProjectedSide = Readonly<{
  seamId: string;
  sideIndex: 0 | 1;
  pieceId: string;
  pieceLineKey: string;
  contourId: string;
  boundaryVertexIds: readonly [string, string];
  direction: 'forward' | 'reverse';
  directedArc: Readonly<{ start: number; end: number }>;
  confirmed: true;
}>;

type ProjectedSeam = Readonly<{
  seamId: string;
  mapping: 'equal';
  lengthRatio: 1;
  confirmed: true;
  sides: readonly [ProjectedSide, ProjectedSide];
}>;

export type PatternImportDxfProductExactNSeamSavedCardProjectionV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_V2;
  status: 'restored-confirmed-exact-n-seam';
  authority: 'verified-composite-v4-full-readback';
  bindings: ExactBindings;
  seams: readonly ProjectedSeam[];
}>;

export type PatternImportDxfProductExactNSeamProposalChoicesV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PROPOSAL_CHOICES_V3;
  status: 'verified-exact-topology-choices';
  expectedCatalogCanonicalSha256: string;
  phaseEAggregatePlanSha256: string;
  operation: ExactBindings['selectedOperation'];
  seams: readonly ProjectedSeam[];
}>;

declare const projectionOwnerBrand: unique symbol;
export type PatternImportDxfProductExactNSeamProjectionOwnerV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PROJECTION_OWNER_V2;
  seamCount: number;
  sourceRestoreSidecarSha256: string;
  readonly [projectionOwnerBrand]: never;
}>;

export type PatternImportDxfProductExactNSeamProjectionBlockerCodeV2 =
  | 'invalid-request'
  | 'restore-owner-required'
  | 'v1-two-seam-path-required'
  | 'invalid-catalog'
  | 'catalog-binding-mismatch'
  | 'invalid-prepared-proposal'
  | 'operation-binding-mismatch'
  | 'proposal-binding-mismatch'
  | 'seam-order-mismatch'
  | 'side-order-mismatch'
  | 'catalog-topology-mismatch'
  | 'catalog-boundary-order-mismatch'
  | 'duplicate-topology-side'
  | 'sha256-unavailable';

export type PatternImportDxfProductExactNSeamProjectionBlockerV2 = Readonly<{
  code: PatternImportDxfProductExactNSeamProjectionBlockerCodeV2;
  detail: string;
}>;

export type PatternImportDxfProductExactNSeamProjectionResultV2 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductExactNSeamProjectionOwnerV2;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_CLAIMS_V2;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      blockers: readonly [PatternImportDxfProductExactNSeamProjectionBlockerV2];
      claims: typeof BLOCKED_CLAIMS;
    }>;

type OwnerState = Readonly<{
  projection: PatternImportDxfProductExactNSeamSavedCardProjectionV2;
  choices: PatternImportDxfProductExactNSeamProposalChoicesV3;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;
const ownerStates = new WeakMap<object, OwnerState>();

class ProjectionFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductExactNSeamProjectionBlockerCodeV2,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
    this.name = 'PatternImportDxfProductExactNSeamProjectionFailureV2';
  }
}

function fail(
  code: PatternImportDxfProductExactNSeamProjectionBlockerCodeV2,
  detail: string,
): never {
  throw new ProjectionFailure(code, detail);
}

function blocked(error: unknown): PatternImportDxfProductExactNSeamProjectionResultV2 {
  const known =
    error instanceof ProjectionFailure
      ? error
      : new ProjectionFailure('invalid-request', 'Exact-N projection failed closed.');
  return Object.freeze({
    ok: false as const,
    owner: null,
    blockers: Object.freeze([
      Object.freeze({ code: known.code, detail: known.message }),
    ]) as readonly [PatternImportDxfProductExactNSeamProjectionBlockerV2],
    claims: BLOCKED_CLAIMS,
  });
}

function safeDataGraph(value: unknown, seen = new Set<object>()): boolean {
  try {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0);
    if (typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null) return false;
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (array && key === 'length') continue;
      if (
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        !safeDataGraph(descriptor.value, seen)
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

function exactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\u0000') === [...expected].sort().join('\u0000')
  );
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function sameOperation(
  left: ExactBindings['selectedOperation'],
  right: ExactBindings['selectedOperation'],
): boolean {
  return (
    left.sourceOperationNumber === right.sourceOperationNumber &&
    left.authoringOperationId === right.authoringOperationId &&
    left.localOperationOrder === right.localOperationOrder &&
    left.seamIds.length === right.seamIds.length &&
    left.seamIds.every((seamId, index) => seamId === right.seamIds[index])
  );
}

function validatePreparedProposal(
  value: unknown,
): PatternImportDxfProductExactNSeamPreparedProposalV3 {
  if (!safeDataGraph(value))
    fail('invalid-prepared-proposal', 'Prepared proposal must be detached passive data.');
  const proposal = structuredClone(value) as PatternImportDxfProductExactNSeamPreparedProposalV3;
  if (
    !exactKeys(proposal, [
      'expectedCatalogCanonicalSha256',
      'operation',
      'phaseEAggregatePlanSha256',
      'schemaVersion',
      'seams',
      'status',
    ]) ||
    proposal.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PREPARED_PROPOSAL_V3 ||
    proposal.status !== 'current-saved-card-proposal' ||
    !SHA256.test(proposal.expectedCatalogCanonicalSha256) ||
    !SHA256.test(proposal.phaseEAggregatePlanSha256) ||
    !exactKeys(proposal.operation, [
      'authoringOperationId',
      'localOperationOrder',
      'seamIds',
      'sourceOperationNumber',
    ]) ||
    !Number.isSafeInteger(proposal.operation.sourceOperationNumber) ||
    proposal.operation.sourceOperationNumber < 1 ||
    !STABLE_ID.test(proposal.operation.authoringOperationId) ||
    proposal.operation.localOperationOrder !== 0 ||
    !Array.isArray(proposal.operation.seamIds) ||
    proposal.operation.seamIds.length < 1 ||
    proposal.operation.seamIds.length === 2 ||
    new Set(proposal.operation.seamIds).size !== proposal.operation.seamIds.length ||
    proposal.operation.seamIds.some((seamId) => !STABLE_ID.test(seamId)) ||
    !Array.isArray(proposal.seams) ||
    proposal.seams.length !== proposal.operation.seamIds.length
  )
    fail('invalid-prepared-proposal', 'Prepared proposal envelope or operation is invalid.');
  for (const [seamIndex, seam] of proposal.seams.entries()) {
    if (
      !exactKeys(seam, ['seamId', 'sides']) ||
      seam.seamId !== proposal.operation.seamIds[seamIndex] ||
      !Array.isArray(seam.sides) ||
      seam.sides.length !== 2
    )
      fail('seam-order-mismatch', 'Prepared proposal seam order differs from its operation.');
    for (const side of seam.sides) {
      if (
        !exactKeys(side, ['pieceId', 'pieceLineKey', 'requiredDirection']) ||
        typeof side.pieceId !== 'string' ||
        typeof side.pieceLineKey !== 'string' ||
        !STABLE_ID.test(side.pieceId) ||
        !STABLE_ID.test(side.pieceLineKey) ||
        (side.requiredDirection !== 'forward' && side.requiredDirection !== 'reverse')
      )
        fail('invalid-prepared-proposal', 'Prepared proposal side binding is invalid.');
    }
  }
  return deepFreeze(proposal);
}

function projectSide(
  side: ExactSide,
  proposalSide: PatternImportDxfProductExactNSeamPreparedProposalV3['seams'][number]['sides'][number],
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
): ProjectedSide {
  if (
    side.pieceId !== proposalSide.pieceId ||
    side.pieceLineKey !== proposalSide.pieceLineKey ||
    side.direction !== proposalSide.requiredDirection
  )
    fail('side-order-mismatch', 'Restore side differs from the current prepared proposal side.');
  const pieces = catalog.pieces.filter(
    ({ pieceId, pieceLineKey }) => pieceId === side.pieceId && pieceLineKey === side.pieceLineKey,
  );
  const contours =
    pieces[0]?.contours.filter(({ contourId }) => contourId === side.contourId) ?? [];
  if (pieces.length !== 1 || contours.length !== 1)
    fail('catalog-topology-mismatch', 'Exact piece, line and contour must occur once in catalog.');
  const contour = contours[0];
  const vertices = contour.boundaryVertices;
  if (
    vertices.length < 2 ||
    new Set(vertices.map(({ vertexId }) => vertexId)).size !== vertices.length ||
    vertices.some(
      ({ ordinal, vertexId, normalizedArc }, index) =>
        ordinal !== index ||
        !STABLE_ID.test(vertexId) ||
        !Number.isFinite(normalizedArc) ||
        normalizedArc < 0 ||
        normalizedArc > 1,
    )
  )
    fail('catalog-topology-mismatch', 'Catalog contour boundary identities are invalid.');
  const start = vertices.find(({ vertexId }) => vertexId === side.boundaryVertexIds[0]);
  const end = vertices.find(({ vertexId }) => vertexId === side.boundaryVertexIds[1]);
  if (!start || !end)
    fail('catalog-topology-mismatch', 'Exact boundary vertices are absent from catalog.');
  const followsContour = (first: number, second: number) =>
    second === first + 1 || (contour.closed && first === vertices.length - 1 && second === 0);
  const forwardPair = followsContour(start.ordinal, end.ordinal);
  const reversePair = followsContour(end.ordinal, start.ordinal);
  if (side.direction === 'forward' ? !forwardPair : !reversePair && !forwardPair)
    fail(
      'catalog-boundary-order-mismatch',
      'Exact boundary vertices are not one adjacent ordered catalog edge.',
    );
  // V4 can retain traversal-ordered IDs or the increasing native span plus a reverse flag.
  // The IDs stay exactly as sealed. Only the arc uses the physical traversal order.
  const nativePairReversed = side.direction === 'reverse' && !reversePair;
  const first = nativePairReversed ? end : start;
  const second = nativePairReversed ? start : end;
  const startArc = side.direction === 'forward' ? first.normalizedArc : 1 - first.normalizedArc;
  let endArc = side.direction === 'forward' ? second.normalizedArc : 1 - second.normalizedArc;
  while (endArc <= startArc) endArc += 1;
  return deepFreeze({
    seamId: side.seamId,
    sideIndex: side.sideIndex,
    pieceId: side.pieceId,
    pieceLineKey: side.pieceLineKey,
    contourId: side.contourId,
    boundaryVertexIds: [side.boundaryVertexIds[0], side.boundaryVertexIds[1]] as const,
    direction: side.direction,
    directedArc: { start: startArc, end: endArc },
    confirmed: true as const,
  });
}

function makeOwner(
  state: OwnerState,
  restoreOwner: PatternImportDxfProductExactNSeamRestoreOwnerV2,
): PatternImportDxfProductExactNSeamProjectionOwnerV2 {
  const owner = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PROJECTION_OWNER_V2,
    seamCount: state.projection.seams.length,
    sourceRestoreSidecarSha256: restoreOwner.sidecarSha256,
  }) as PatternImportDxfProductExactNSeamProjectionOwnerV2;
  ownerStates.set(owner, state);
  return owner;
}

export function readPatternImportDxfProductExactNSeamSavedCardProjectionV2(
  owner: PatternImportDxfProductExactNSeamProjectionOwnerV2,
): PatternImportDxfProductExactNSeamSavedCardProjectionV2 | null {
  const state = owner && typeof owner === 'object' ? ownerStates.get(owner) : undefined;
  return state?.projection ?? null;
}

export function readPatternImportDxfProductExactNSeamProposalChoicesV3(
  owner: PatternImportDxfProductExactNSeamProjectionOwnerV2,
): PatternImportDxfProductExactNSeamProposalChoicesV3 | null {
  const state = owner && typeof owner === 'object' ? ownerStates.get(owner) : undefined;
  return state?.choices ?? null;
}

/**
 * Projects only exact topology already authorized by a verified Composite V4 restore owner. The
 * caller's current catalog and proposal can reject the restore, but cannot add or infer authority.
 */
export async function projectPatternImportDxfProductExactNSeamSavedCardV2(
  request: PatternImportDxfProductExactNSeamSavedCardProjectionRequestV2,
  options: Readonly<{ crypto?: Pick<Crypto, 'subtle'> }> = {},
): Promise<PatternImportDxfProductExactNSeamProjectionResultV2> {
  try {
    if (
      !request ||
      typeof request !== 'object' ||
      request.schemaVersion !==
        PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_REQUEST_V2
    )
      fail('invalid-request', 'Exact-N saved-card projection request is invalid.');
    const patch = readPatternImportDxfProductExactNSeamRestorePatchV2(request.restoreOwner);
    if (
      !patch ||
      request.restoreOwner.schemaVersion !==
        PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_RESTORE_OWNER_V2
    )
      fail('restore-owner-required', 'A genuine Composite V4 restore owner is required.');
    if (patch.seams.length < 1 || patch.seams.length === 2)
      fail(
        'v1-two-seam-path-required',
        'One or greater-than-two seams use V4; exact two remains on V3/V1.',
      );
    if (!safeDataGraph(request.catalog))
      fail('invalid-catalog', 'Current catalog must be detached passive data.');
    const catalog = structuredClone(request.catalog);
    if (
      catalog.techCardId !== patch.bindings.row.techCardId ||
      catalog.scopeKey !== patch.bindings.row.scopeKey ||
      catalog.canonicalSha256 !== patch.bindings.catalogCanonicalSha256
    )
      fail('catalog-binding-mismatch', 'Current catalog differs from restore bindings.');
    const unsignedCatalog = Object.fromEntries(
      Object.entries(catalog).filter(([key]) => key !== 'canonicalSha256'),
    ) as Omit<PatternImportDxfProductPhaseEAuthoringCatalogV1, 'canonicalSha256'>;
    const recomputedCatalogSha256 =
      await computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
        unsignedCatalog,
        options.crypto ?? globalThis.crypto,
      );
    if (!recomputedCatalogSha256)
      fail('sha256-unavailable', 'SHA-256 is required to verify the current catalog.');
    if (recomputedCatalogSha256 !== patch.bindings.catalogCanonicalSha256)
      fail('catalog-binding-mismatch', 'Current catalog canonical SHA-256 is stale or forged.');

    const proposal = validatePreparedProposal(request.preparedProposal);
    if (!sameOperation(proposal.operation, patch.bindings.selectedOperation))
      fail(
        'operation-binding-mismatch',
        'Current proposal operation differs from restore bindings.',
      );
    if (
      proposal.expectedCatalogCanonicalSha256 !== patch.bindings.catalogCanonicalSha256 ||
      proposal.phaseEAggregatePlanSha256 !== patch.bindings.phaseEAggregatePlanSha256
    )
      fail('proposal-binding-mismatch', 'Current proposal catalog or aggregate plan is stale.');
    if (proposal.seams.length !== patch.seams.length)
      fail('seam-order-mismatch', 'Current proposal seam count differs from restore authority.');

    const usedPhysicalEdges = new Set<string>();
    const projectedSeams: ProjectedSeam[] = patch.seams.map((seam, seamIndex) => {
      const proposalSeam = proposal.seams[seamIndex];
      if (
        seam.seamId !== patch.bindings.selectedOperation.seamIds[seamIndex] ||
        seam.seamId !== proposalSeam.seamId ||
        seam.sides.length !== 2 ||
        seam.sides[0].seamId !== seam.seamId ||
        seam.sides[0].sideIndex !== 0 ||
        seam.sides[1].seamId !== seam.seamId ||
        seam.sides[1].sideIndex !== 1
      )
        fail('seam-order-mismatch', 'Restore seams must retain ordered 2×N side identities.');
      const sides = seam.sides.map((side, sideIndex) => {
        const projected = projectSide(side, proposalSeam.sides[sideIndex], catalog);
        const physicalEdge = [
          projected.pieceId,
          projected.contourId,
          ...projected.boundaryVertexIds.slice().sort(),
        ].join('\u0000');
        if (usedPhysicalEdges.has(physicalEdge))
          fail('duplicate-topology-side', 'One physical catalog edge cannot own two exact sides.');
        usedPhysicalEdges.add(physicalEdge);
        return projected;
      }) as [ProjectedSide, ProjectedSide];
      return deepFreeze({
        seamId: seam.seamId,
        mapping: 'equal' as const,
        lengthRatio: 1 as const,
        confirmed: true as const,
        sides,
      });
    });
    const projection = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_V2,
      status: 'restored-confirmed-exact-n-seam' as const,
      authority: 'verified-composite-v4-full-readback' as const,
      bindings: patch.bindings,
      seams: projectedSeams,
    } satisfies PatternImportDxfProductExactNSeamSavedCardProjectionV2);
    const choices = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PROPOSAL_CHOICES_V3,
      status: 'verified-exact-topology-choices' as const,
      expectedCatalogCanonicalSha256: patch.bindings.catalogCanonicalSha256,
      phaseEAggregatePlanSha256: patch.bindings.phaseEAggregatePlanSha256,
      operation: patch.bindings.selectedOperation,
      seams: projectedSeams,
    } satisfies PatternImportDxfProductExactNSeamProposalChoicesV3);
    const state = Object.freeze({ projection, choices });
    return Object.freeze({
      ok: true as const,
      owner: makeOwner(state, request.restoreOwner),
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_CLAIMS_V2,
    });
  } catch (error) {
    return blocked(error);
  }
}
