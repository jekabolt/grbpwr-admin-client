import {
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PROJECTION_OWNER_V2,
  readPatternImportDxfProductExactNSeamProposalChoicesV3,
  readPatternImportDxfProductExactNSeamSavedCardProjectionV2,
  type PatternImportDxfProductExactNSeamProjectionOwnerV2,
  type PatternImportDxfProductExactNSeamProposalChoicesV3,
  type PatternImportDxfProductExactNSeamSavedCardProjectionV2,
} from './exact-n-seam-saved-card-projection-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_STATE_V2 =
  'pattern-import-dxf-product-exact-n-seam-ui-state/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_REQUEST_V2 =
  'pattern-import-dxf-product-exact-n-seam-ui-selection-request/2' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_OWNER_V2 =
  'pattern-import-dxf-product-exact-n-seam-ui-selection-owner/2' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_CLAIMS_V2 = Object.freeze({
  genuineProjectionOwnerRequired: true,
  currentSavedCardBindingsRequired: true,
  currentWorkbenchStateRequired: true,
  oneOrGreaterThanTwoSeamsOnly: true,
  exactTwoSeamsRemainOnV3V1: true,
  allOrderedSidesSelectedAtomically: true,
  confirmedEqualMappingAppliedAtomically: true,
  proposalChoicesReusedFromProjectionOwner: true,
  partialSelectionPublished: false,
  callerStateMutated: false,
  nearestOrSnappingUsed: false,
  uiSelectionAvailableOnlyThroughOwner: true,
  renderStateChangedDirectly: false,
  persistencePerformed: false,
  networkPerformed: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  ...PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_CLAIMS_V2,
  currentSavedCardBindingsRequired: false as const,
  currentWorkbenchStateRequired: false as const,
  allOrderedSidesSelectedAtomically: false as const,
  confirmedEqualMappingAppliedAtomically: false as const,
  proposalChoicesReusedFromProjectionOwner: false as const,
  uiSelectionAvailableOnlyThroughOwner: false as const,
});

type Projection = PatternImportDxfProductExactNSeamSavedCardProjectionV2;
type Bindings = Projection['bindings'];
type ProjectedSeam = Projection['seams'][number];

export type PatternImportDxfProductExactNSeamUiSideV2 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  contourId: string | null;
  boundaryVertexIds: readonly string[];
  direction: 'forward' | 'reverse' | null;
  confirmed: boolean;
}>;

export type PatternImportDxfProductExactNSeamUiSeamV2 = Readonly<{
  seamId: string;
  mapping: 'equal' | null;
  lengthRatio: 1 | null;
  confirmed: boolean;
  sides: readonly [
    PatternImportDxfProductExactNSeamUiSideV2,
    PatternImportDxfProductExactNSeamUiSideV2,
  ];
}>;

/**
 * Generalized exact-selection portion of the existing Phase-E multiseam workbench state. It owns
 * no geometry or operation data; those remain bindings to the current saved-card projection.
 */
export type PatternImportDxfProductExactNSeamUiStateV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_STATE_V2;
  status: 'current-exact-n-seam-workbench-state';
  bindings: Bindings;
  seams: readonly PatternImportDxfProductExactNSeamUiSeamV2[];
}>;

export type PatternImportDxfProductExactNSeamUiSelectionRequestV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_REQUEST_V2;
  projectionOwner: PatternImportDxfProductExactNSeamProjectionOwnerV2;
  /** Fresh caller-owned current bindings. They can reject authority, never create it. */
  current: Bindings;
  currentState: PatternImportDxfProductExactNSeamUiStateV2;
}>;

declare const uiSelectionOwnerBrand: unique symbol;
export type PatternImportDxfProductExactNSeamUiSelectionOwnerV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_OWNER_V2;
  seamCount: number;
  sourceProjectionSidecarSha256: string;
  readonly [uiSelectionOwnerBrand]: never;
}>;

export type PatternImportDxfProductExactNSeamUiSelectionBlockerCodeV2 =
  | 'invalid-request'
  | 'projection-owner-required'
  | 'v1-two-seam-path-required'
  | 'invalid-current-bindings'
  | 'current-binding-mismatch'
  | 'invalid-current-state'
  | 'state-binding-mismatch'
  | 'seam-order-mismatch'
  | 'side-order-mismatch'
  | 'duplicate-topology-side'
  | 'projection-choices-mismatch';

export type PatternImportDxfProductExactNSeamUiSelectionBlockerV2 = Readonly<{
  code: PatternImportDxfProductExactNSeamUiSelectionBlockerCodeV2;
  detail: string;
}>;

export type PatternImportDxfProductExactNSeamUiSelectionResultV2 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductExactNSeamUiSelectionOwnerV2;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_CLAIMS_V2;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      blockers: readonly [PatternImportDxfProductExactNSeamUiSelectionBlockerV2];
      claims: typeof BLOCKED_CLAIMS;
    }>;

type OwnerState = Readonly<{
  state: PatternImportDxfProductExactNSeamUiStateV2;
  choices: PatternImportDxfProductExactNSeamProposalChoicesV3;
}>;

const ownerStates = new WeakMap<object, OwnerState>();

class UiSelectionFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductExactNSeamUiSelectionBlockerCodeV2,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
    this.name = 'PatternImportDxfProductExactNSeamUiSelectionFailureV2';
  }
}

function fail(
  code: PatternImportDxfProductExactNSeamUiSelectionBlockerCodeV2,
  detail: string,
): never {
  throw new UiSelectionFailure(code, detail);
}

function blocked(error: unknown): PatternImportDxfProductExactNSeamUiSelectionResultV2 {
  const failure =
    error instanceof UiSelectionFailure
      ? error
      : new UiSelectionFailure('invalid-request', 'Exact-N UI selection failed closed.');
  return Object.freeze({
    ok: false as const,
    owner: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [PatternImportDxfProductExactNSeamUiSelectionBlockerV2],
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

function sameRow(left: Bindings['row'], right: Bindings['row']): boolean {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

function sameOperation(
  left: Bindings['selectedOperation'],
  right: Bindings['selectedOperation'],
): boolean {
  return (
    left.sourceOperationNumber === right.sourceOperationNumber &&
    left.authoringOperationId === right.authoringOperationId &&
    left.localOperationOrder === right.localOperationOrder &&
    left.seamIds.length === right.seamIds.length &&
    left.seamIds.every((seamId, index) => seamId === right.seamIds[index])
  );
}

function sameBindings(left: Bindings, right: Bindings): boolean {
  return (
    sameRow(left.row, right.row) &&
    left.serverAssemblyRevision === right.serverAssemblyRevision &&
    left.assemblyTopologySha256 === right.assemblyTopologySha256 &&
    left.catalogCanonicalSha256 === right.catalogCanonicalSha256 &&
    left.phaseEAggregatePlanSha256 === right.phaseEAggregatePlanSha256 &&
    sameOperation(left.selectedOperation, right.selectedOperation)
  );
}

function exactBindingsShape(value: unknown): value is Bindings {
  return (
    exactKeys(value, [
      'assemblyTopologySha256',
      'catalogCanonicalSha256',
      'phaseEAggregatePlanSha256',
      'row',
      'selectedOperation',
      'serverAssemblyRevision',
    ]) &&
    exactKeys(value.row, [
      'cardLockVersion',
      'patternLineKey',
      'revision',
      'scopeKey',
      'sha256',
      'sizeBytes',
      'techCardId',
      'url',
    ]) &&
    exactKeys(value.selectedOperation, [
      'authoringOperationId',
      'localOperationOrder',
      'seamIds',
      'sourceOperationNumber',
    ]) &&
    Array.isArray(value.selectedOperation.seamIds)
  );
}

function validateCurrentBindings(value: unknown, projection: Projection): Bindings {
  if (!safeDataGraph(value) || !exactBindingsShape(value))
    fail('invalid-current-bindings', 'Fresh current bindings must be detached passive data.');
  const current = structuredClone(value) as Bindings;
  if (!sameBindings(current, projection.bindings))
    fail(
      'current-binding-mismatch',
      'Card lock, row revision, Assembly revision, topology, catalog, plan or operation is stale.',
    );
  return deepFreeze(current);
}

function validateSide(
  side: unknown,
  projected: ProjectedSeam['sides'][number],
  physicalEdges: Set<string>,
): PatternImportDxfProductExactNSeamUiSideV2 {
  if (
    !exactKeys(side, [
      'boundaryVertexIds',
      'confirmed',
      'contourId',
      'direction',
      'pieceId',
      'pieceLineKey',
    ]) ||
    side.pieceId !== projected.pieceId ||
    side.pieceLineKey !== projected.pieceLineKey ||
    (side.contourId !== null && side.contourId !== projected.contourId) ||
    !Array.isArray(side.boundaryVertexIds) ||
    (side.boundaryVertexIds.length !== 0 &&
      (side.boundaryVertexIds.length !== 2 ||
        side.boundaryVertexIds[0] !== projected.boundaryVertexIds[0] ||
        side.boundaryVertexIds[1] !== projected.boundaryVertexIds[1])) ||
    (side.direction !== null && side.direction !== projected.direction) ||
    typeof side.confirmed !== 'boolean' ||
    (side.confirmed &&
      (side.contourId !== projected.contourId ||
        side.boundaryVertexIds.length !== 2 ||
        side.direction !== projected.direction))
  )
    fail('side-order-mismatch', 'Current UI side is not an empty or exact projected side.');
  const edge = [
    projected.pieceId,
    projected.contourId,
    ...projected.boundaryVertexIds.slice().sort(),
  ].join('\u0000');
  if (physicalEdges.has(edge))
    fail('duplicate-topology-side', 'One physical edge cannot be selected by two UI sides.');
  physicalEdges.add(edge);
  return side as unknown as PatternImportDxfProductExactNSeamUiSideV2;
}

function validateCurrentState(
  value: unknown,
  projection: Projection,
  current: Bindings,
): PatternImportDxfProductExactNSeamUiStateV2 {
  if (!safeDataGraph(value))
    fail('invalid-current-state', 'Current workbench state must be detached passive data.');
  const state = structuredClone(value) as PatternImportDxfProductExactNSeamUiStateV2;
  if (
    !exactKeys(state, ['bindings', 'schemaVersion', 'seams', 'status']) ||
    state.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_STATE_V2 ||
    state.status !== 'current-exact-n-seam-workbench-state' ||
    !safeDataGraph(state.bindings) ||
    !exactBindingsShape(state.bindings) ||
    !sameBindings(state.bindings, current)
  )
    fail('state-binding-mismatch', 'Current workbench state bindings are stale or invalid.');
  if (!Array.isArray(state.seams) || state.seams.length !== projection.seams.length)
    fail('seam-order-mismatch', 'Current workbench seam count differs from the projection.');
  const physicalEdges = new Set<string>();
  for (const [seamIndex, projected] of projection.seams.entries()) {
    const seam = state.seams[seamIndex];
    if (
      !exactKeys(seam, ['confirmed', 'lengthRatio', 'mapping', 'seamId', 'sides']) ||
      seam.seamId !== projected.seamId ||
      (seam.mapping !== null && seam.mapping !== 'equal') ||
      (seam.lengthRatio !== null && seam.lengthRatio !== 1) ||
      typeof seam.confirmed !== 'boolean' ||
      (seam.confirmed && (seam.mapping !== 'equal' || seam.lengthRatio !== 1)) ||
      !Array.isArray(seam.sides) ||
      seam.sides.length !== 2
    )
      fail('seam-order-mismatch', 'Current UI seams must exact-match the ordered projection.');
    validateSide(seam.sides[0], projected.sides[0], physicalEdges);
    validateSide(seam.sides[1], projected.sides[1], physicalEdges);
  }
  return deepFreeze(state);
}

function verifyChoices(
  choices: PatternImportDxfProductExactNSeamProposalChoicesV3,
  projection: Projection,
): void {
  if (
    choices.expectedCatalogCanonicalSha256 !== projection.bindings.catalogCanonicalSha256 ||
    choices.phaseEAggregatePlanSha256 !== projection.bindings.phaseEAggregatePlanSha256 ||
    !sameOperation(choices.operation, projection.bindings.selectedOperation) ||
    choices.seams !== projection.seams
  )
    fail(
      'projection-choices-mismatch',
      'Projection and proposal choices must originate from the same genuine owner state.',
    );
}

function selectedState(
  state: PatternImportDxfProductExactNSeamUiStateV2,
  projection: Projection,
): PatternImportDxfProductExactNSeamUiStateV2 {
  return deepFreeze({
    ...state,
    bindings: structuredClone(projection.bindings),
    seams: projection.seams.map((seam) => ({
      seamId: seam.seamId,
      mapping: 'equal' as const,
      lengthRatio: 1 as const,
      confirmed: true,
      sides: seam.sides.map((side) => ({
        pieceId: side.pieceId,
        pieceLineKey: side.pieceLineKey,
        contourId: side.contourId,
        boundaryVertexIds: [...side.boundaryVertexIds],
        direction: side.direction,
        confirmed: true,
      })) as unknown as PatternImportDxfProductExactNSeamUiSeamV2['sides'],
    })),
  });
}

function makeOwner(
  projectionOwner: PatternImportDxfProductExactNSeamProjectionOwnerV2,
  state: OwnerState,
): PatternImportDxfProductExactNSeamUiSelectionOwnerV2 {
  const owner = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_OWNER_V2,
    seamCount: state.state.seams.length,
    sourceProjectionSidecarSha256: projectionOwner.sourceRestoreSidecarSha256,
  }) as PatternImportDxfProductExactNSeamUiSelectionOwnerV2;
  ownerStates.set(owner, state);
  return owner;
}

export function createPatternImportDxfProductExactNSeamInitialUiStateV2(
  projectionOwner: PatternImportDxfProductExactNSeamProjectionOwnerV2,
): PatternImportDxfProductExactNSeamUiStateV2 | null {
  const projection = readPatternImportDxfProductExactNSeamSavedCardProjectionV2(projectionOwner);
  if (!projection || projection.seams.length < 1 || projection.seams.length === 2) return null;
  return deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_STATE_V2,
    status: 'current-exact-n-seam-workbench-state' as const,
    bindings: structuredClone(projection.bindings),
    seams: projection.seams.map((seam) => ({
      seamId: seam.seamId,
      mapping: null,
      lengthRatio: null,
      confirmed: false,
      sides: seam.sides.map((side) => ({
        pieceId: side.pieceId,
        pieceLineKey: side.pieceLineKey,
        contourId: null,
        boundaryVertexIds: [],
        direction: side.direction,
        confirmed: false,
      })) as unknown as PatternImportDxfProductExactNSeamUiSeamV2['sides'],
    })),
  });
}

export function readPatternImportDxfProductExactNSeamSelectedUiStateV2(
  owner: PatternImportDxfProductExactNSeamUiSelectionOwnerV2,
): PatternImportDxfProductExactNSeamUiStateV2 | null {
  const state = owner && typeof owner === 'object' ? ownerStates.get(owner) : undefined;
  return state?.state ?? null;
}

export function readPatternImportDxfProductExactNSeamSelectedChoicesV3(
  owner: PatternImportDxfProductExactNSeamUiSelectionOwnerV2,
): PatternImportDxfProductExactNSeamProposalChoicesV3 | null {
  const state = owner && typeof owner === 'object' ? ownerStates.get(owner) : undefined;
  return state?.choices ?? null;
}

/**
 * Applies all 2×N exact selections to a new immutable state or publishes nothing. The render tree is
 * intentionally not mutated here; the existing workbench owner may consume this owner atomically.
 */
export function applyPatternImportDxfProductExactNSeamUiSelectionV2(
  request: PatternImportDxfProductExactNSeamUiSelectionRequestV2,
): PatternImportDxfProductExactNSeamUiSelectionResultV2 {
  try {
    if (
      !request ||
      typeof request !== 'object' ||
      request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_REQUEST_V2
    )
      fail('invalid-request', 'Exact-N UI selection request is invalid.');
    const projection = readPatternImportDxfProductExactNSeamSavedCardProjectionV2(
      request.projectionOwner,
    );
    const choices = readPatternImportDxfProductExactNSeamProposalChoicesV3(request.projectionOwner);
    if (
      !projection ||
      !choices ||
      request.projectionOwner.schemaVersion !==
        PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PROJECTION_OWNER_V2
    )
      fail('projection-owner-required', 'A genuine exact-N projection owner is required.');
    if (projection.seams.length < 1 || projection.seams.length === 2)
      fail(
        'v1-two-seam-path-required',
        'One or greater-than-two seams use V4; exact two remains on V3/V1.',
      );
    const current = validateCurrentBindings(request.current, projection);
    const state = validateCurrentState(request.currentState, projection, current);
    verifyChoices(choices, projection);
    const next = selectedState(state, projection);
    return Object.freeze({
      ok: true as const,
      owner: makeOwner(request.projectionOwner, Object.freeze({ state: next, choices })),
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_CLAIMS_V2,
    });
  } catch (error) {
    return blocked(error);
  }
}
