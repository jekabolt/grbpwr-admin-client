import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEExactTopologySideBindingV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import type { DxfMaterialAssignmentV1, DxfSeamV1 } from 'lib/cloth/domain/dxf-assembly-handoff-v1';
import type { PatternImportDxfProductPhaseEExistingAssemblyOperationV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import {
  PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1,
  type PatternImportDxfPhaseEStitchVisualV1,
} from './stitch-visual-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_FROM_CONNECTION_V1 =
  'pattern-import-dxf-phase-e-draft-operation-from-connection/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1 =
  'pattern-import-dxf-phase-e-draft-operation-apply-adapter/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,255}$/;

export type PatternImportDxfPhaseEDraftOperationSourceCatalogV1 = Readonly<
  Pick<
    PatternImportDxfProductPhaseEAuthoringCatalogV1,
    'canonicalSha256' | 'sizeSelectionCanonicalSha256' | 'sourceFileId' | 'pieces'
  >
>;

/** Existing exact edge identity only. Coordinates remain owned by the Phase-D projection. */
export type PatternImportDxfPhaseEDraftOperationConnectionSideV1 = Readonly<
  Pick<
    PatternImportDxfProductPhaseEExactTopologySideBindingV1,
    'pieceId' | 'pieceLineKey' | 'contourId' | 'boundaryVertexIds' | 'direction'
  >
>;

export type PatternImportDxfPhaseEDraftOperationConnectionIntentV1 = Readonly<{
  intentId: string;
  mapping: DxfSeamV1['mapping'];
  lengthRatio: number;
  sides: readonly [
    PatternImportDxfPhaseEDraftOperationConnectionSideV1,
    PatternImportDxfPhaseEDraftOperationConnectionSideV1,
  ];
}>;

export type PatternImportDxfPhaseEDraftOperationReferencesV1 = Readonly<{
  /** Detached source snapshot; its seamKeys remain evidence and are never edited by this module. */
  operation: PatternImportDxfProductPhaseEExistingAssemblyOperationV1;
  /** Existing read-only presentation adapter output, not a new stitch or thread owner. */
  stitch: PatternImportDxfPhaseEStitchVisualV1;
  /** Existing Assembly material assignments only; these are not BOM rows or selections. */
  materials: readonly DxfMaterialAssignmentV1[];
}>;

export type PatternImportDxfPhaseEDraftOperationApplyBlockerV1 = Readonly<{
  code: 'explicit-apply-adapter-required';
  detail: string;
}>;

export type PatternImportDxfPhaseEDraftOperationV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_FROM_CONNECTION_V1;
  status: 'session-only-editable-draft';
  source: Readonly<{
    catalogCanonicalSha256: string;
    sizeSelectionCanonicalSha256: string;
    sourceFileId: string;
  }>;
  draftOperationId: string;
  revision: number;
  dirty: true;
  stage: number | null;
  connection: PatternImportDxfPhaseEDraftOperationConnectionIntentV1;
  references: PatternImportDxfPhaseEDraftOperationReferencesV1;
  apply: Readonly<{
    eligible: false;
    boundary: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1;
    blocker: PatternImportDxfPhaseEDraftOperationApplyBlockerV1;
  }>;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_FROM_CONNECTION_CLAIMS_V1 = Object.freeze({
  existingAuthoringCatalogRequired: true,
  exactExistingAdjacentEdgesRequired: true,
  existingOperationReferenceRequired: true,
  existingStitchVisualReferencedOnly: true,
  existingMaterialAssignmentsReferencedOnly: true,
  createsCoordinateAuthority: false,
  createsGeometry: false,
  createsSeamAuthority: false,
  createsBomState: false,
  createsPersistenceModel: false,
  mutatesSourceOperation: false,
  existingImportSemanticsPhaseDApplyBoundaryRequired: true,
  applyAdapterExecutionIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEDraftOperationBlockerV1 = Readonly<{
  code:
    | 'invalid-source-catalog'
    | 'invalid-operation-reference'
    | 'invalid-stitch-reference'
    | 'invalid-material-reference'
    | 'invalid-draft-operation'
    | 'invalid-connection-intent'
    | 'connection-piece-pair-invalid'
    | 'connection-anchor-not-exact'
    | 'source-catalog-changed';
  detail: string;
}>;

export type PatternImportDxfPhaseEDraftOperationResultV1 =
  | Readonly<{
      ok: true;
      draft: PatternImportDxfPhaseEDraftOperationV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      draft: PatternImportDxfPhaseEDraftOperationV1 | null;
      blocker: PatternImportDxfPhaseEDraftOperationBlockerV1;
    }>;

export type PatternImportDxfPhaseEDraftOperationApplyResultV1 = Readonly<{
  ok: false;
  draft: PatternImportDxfPhaseEDraftOperationV1;
  blocker: PatternImportDxfPhaseEDraftOperationApplyBlockerV1;
}>;

/**
 * Deliberate future integration seam. This pure module does not accept or invoke an adapter: the
 * existing import/semantics/Phase-D owner must wire one at a higher boundary and define its receipt.
 */
export type PatternImportDxfPhaseEDraftOperationApplyAdapterV1<Receipt> = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1;
  apply: (draft: PatternImportDxfPhaseEDraftOperationV1) => Promise<Receipt>;
}>;

type DraftPatch = Readonly<{
  stage?: number | null;
  connection?: PatternImportDxfPhaseEDraftOperationConnectionIntentV1;
}>;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function stableId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID.test(value);
}

function plainDataGraph(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return true;
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return true;
  seen.add(value);
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!isArray && prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (isArray && key === 'length') continue;
    if (
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      !plainDataGraph(descriptor.value, seen)
    )
      return false;
  }
  return Reflect.ownKeys(descriptors).every((key) => typeof key === 'string');
}

function blocked(
  code: PatternImportDxfPhaseEDraftOperationBlockerV1['code'],
  detail: string,
  draft: PatternImportDxfPhaseEDraftOperationV1 | null = null,
): PatternImportDxfPhaseEDraftOperationResultV1 {
  return Object.freeze({ ok: false as const, draft, blocker: Object.freeze({ code, detail }) });
}

function catalogValid(catalog: PatternImportDxfPhaseEDraftOperationSourceCatalogV1): boolean {
  if (
    !catalog ||
    !SHA256.test(catalog.canonicalSha256 ?? '') ||
    !SHA256.test(catalog.sizeSelectionCanonicalSha256 ?? '') ||
    !stableId(catalog.sourceFileId) ||
    !Array.isArray(catalog.pieces) ||
    !catalog.pieces.length
  )
    return false;
  const identities = catalog.pieces.map(({ pieceId, pieceLineKey }) =>
    stableId(pieceId) && stableId(pieceLineKey) ? `${pieceId}\u0000${pieceLineKey}` : '',
  );
  return identities.every(Boolean) && new Set(identities).size === identities.length;
}

function operationValid(
  operation: PatternImportDxfProductPhaseEExistingAssemblyOperationV1,
): boolean {
  return (
    !!operation &&
    (operation.authoringOperationId === null || stableId(operation.authoringOperationId)) &&
    Number.isSafeInteger(operation.number) &&
    operation.number > 0 &&
    typeof operation.work === 'string' &&
    !!operation.work.trim() &&
    Array.isArray(operation.inputKeys) &&
    operation.inputKeys.every(stableId) &&
    typeof operation.outputUnitKey === 'string' &&
    (!operation.outputUnitKey || stableId(operation.outputUnitKey)) &&
    typeof operation.outputUnitName === 'string' &&
    Array.isArray(operation.seamKeys) &&
    operation.seamKeys.every(stableId)
  );
}

function stitchValid(stitch: PatternImportDxfPhaseEStitchVisualV1): boolean {
  return (
    !!stitch &&
    stitch.schemaVersion === PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1 &&
    (stitch.thread.bomLineKey === null || stableId(stitch.thread.bomLineKey))
  );
}

function materialsValid(
  materials: readonly DxfMaterialAssignmentV1[],
  catalog: PatternImportDxfPhaseEDraftOperationSourceCatalogV1,
): boolean {
  if (!Array.isArray(materials)) return false;
  const catalogPieceIds = new Set(catalog.pieces.map(({ pieceId }) => pieceId));
  const ids = materials.map(({ id }) => id);
  return (
    new Set(ids).size === ids.length &&
    materials.every(
      ({ id, materialRevision, pieceIds }) =>
        stableId(id) &&
        stableId(materialRevision) &&
        Array.isArray(pieceIds) &&
        pieceIds.length > 0 &&
        new Set(pieceIds).size === pieceIds.length &&
        pieceIds.every((pieceId) => stableId(pieceId) && catalogPieceIds.has(pieceId)),
    )
  );
}

function exactSide(
  catalog: PatternImportDxfPhaseEDraftOperationSourceCatalogV1,
  side: PatternImportDxfPhaseEDraftOperationConnectionSideV1,
): boolean {
  if (
    !side ||
    !stableId(side.pieceId) ||
    !stableId(side.pieceLineKey) ||
    !stableId(side.contourId) ||
    (side.direction !== 'forward' && side.direction !== 'reverse') ||
    !Array.isArray(side.boundaryVertexIds) ||
    side.boundaryVertexIds.length !== 2 ||
    !side.boundaryVertexIds.every(stableId) ||
    side.boundaryVertexIds[0] === side.boundaryVertexIds[1]
  )
    return false;
  const pieces = catalog.pieces.filter(
    ({ pieceId, pieceLineKey }) => pieceId === side.pieceId && pieceLineKey === side.pieceLineKey,
  );
  const contours = pieces[0]?.contours.filter(({ contourId }) => contourId === side.contourId);
  if (pieces.length !== 1 || contours?.length !== 1) return false;
  const contour = contours[0];
  const indexes = side.boundaryVertexIds.map((vertexId) =>
    contour.boundaryVertices.findIndex((vertex) => vertex.vertexId === vertexId),
  );
  if (indexes.some((index) => index < 0)) return false;
  const delta = Math.abs(indexes[0] - indexes[1]);
  return (
    delta === 1 ||
    (contour.closed &&
      contour.boundaryVertices.length > 2 &&
      delta === contour.boundaryVertices.length - 1)
  );
}

function connectionIssue(
  catalog: PatternImportDxfPhaseEDraftOperationSourceCatalogV1,
  connection: PatternImportDxfPhaseEDraftOperationConnectionIntentV1,
): PatternImportDxfPhaseEDraftOperationBlockerV1 | null {
  if (
    !connection ||
    !stableId(connection.intentId) ||
    !['equal', 'eased', 'gathered'].includes(connection.mapping) ||
    !Number.isFinite(connection.lengthRatio) ||
    connection.lengthRatio <= 0 ||
    (connection.mapping === 'equal' && connection.lengthRatio !== 1) ||
    !Array.isArray(connection.sides) ||
    connection.sides.length !== 2
  )
    return Object.freeze({
      code: 'invalid-connection-intent',
      detail: 'A connection requires an ID, explicit mapping, valid ratio and exactly two sides.',
    });
  const [left, right] = connection.sides;
  if (left.pieceId === right.pieceId || left.pieceLineKey === right.pieceLineKey)
    return Object.freeze({
      code: 'connection-piece-pair-invalid',
      detail: 'A table connection must bind two distinct existing piece identities.',
    });
  if (!exactSide(catalog, left) || !exactSide(catalog, right))
    return Object.freeze({
      code: 'connection-anchor-not-exact',
      detail:
        'Each connection side must match one existing catalog piece, contour and adjacent boundary edge.',
    });
  return null;
}

function applyState() {
  return Object.freeze({
    eligible: false as const,
    boundary: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1,
    blocker: Object.freeze({
      code: 'explicit-apply-adapter-required' as const,
      detail:
        'Draft Operation apply requires an explicit adapter owned by the existing import/semantics/Phase-D apply boundary.',
    }),
  });
}

export function createPatternImportDxfPhaseEDraftOperationFromConnectionV1(
  input: Readonly<{
    catalog: PatternImportDxfPhaseEDraftOperationSourceCatalogV1;
    draftOperationId: string;
    stage: number | null;
    connection: PatternImportDxfPhaseEDraftOperationConnectionIntentV1;
    references: PatternImportDxfPhaseEDraftOperationReferencesV1;
  }>,
): PatternImportDxfPhaseEDraftOperationResultV1 {
  if (!plainDataGraph(input) || !catalogValid(input?.catalog))
    return blocked(
      'invalid-source-catalog',
      'Draft Operation requires a detached current authoring catalog with exact source hashes.',
    );
  if (
    !stableId(input.draftOperationId) ||
    (input.stage !== null && (!Number.isSafeInteger(input.stage) || input.stage < 0))
  )
    return blocked(
      'invalid-draft-operation',
      'Draft Operation requires a stable session ID and a non-negative stage or null.',
    );
  if (!operationValid(input.references?.operation))
    return blocked(
      'invalid-operation-reference',
      'Draft Operation requires one valid existing Assembly operation reference.',
    );
  if (!stitchValid(input.references?.stitch))
    return blocked(
      'invalid-stitch-reference',
      'Draft Operation requires the existing read-only stitch visual adapter result.',
    );
  if (!materialsValid(input.references?.materials, input.catalog))
    return blocked(
      'invalid-material-reference',
      'Material references must be existing unique Assembly assignments bound to catalog pieces.',
    );
  const issue = connectionIssue(input.catalog, input.connection);
  if (issue) return blocked(issue.code, issue.detail);

  const detached = structuredClone(input);
  return Object.freeze({
    ok: true as const,
    draft: deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_FROM_CONNECTION_V1,
      status: 'session-only-editable-draft' as const,
      source: {
        catalogCanonicalSha256: detached.catalog.canonicalSha256,
        sizeSelectionCanonicalSha256: detached.catalog.sizeSelectionCanonicalSha256,
        sourceFileId: detached.catalog.sourceFileId,
      },
      draftOperationId: detached.draftOperationId,
      revision: 0,
      dirty: true as const,
      stage: detached.stage,
      connection: detached.connection,
      references: detached.references,
      apply: applyState(),
    }),
    blocker: null,
  });
}

export function revisePatternImportDxfPhaseEDraftOperationFromConnectionV1(
  current: PatternImportDxfPhaseEDraftOperationV1,
  catalog: PatternImportDxfPhaseEDraftOperationSourceCatalogV1,
  patch: DraftPatch,
): PatternImportDxfPhaseEDraftOperationResultV1 {
  if (
    current.source.catalogCanonicalSha256 !== catalog.canonicalSha256 ||
    current.source.sizeSelectionCanonicalSha256 !== catalog.sizeSelectionCanonicalSha256 ||
    current.source.sourceFileId !== catalog.sourceFileId
  )
    return blocked(
      'source-catalog-changed',
      'The Draft Operation cannot be revised against a different authoring catalog.',
      current,
    );
  if (
    !plainDataGraph(patch) ||
    (!Object.hasOwn(patch, 'stage') && !Object.hasOwn(patch, 'connection'))
  )
    return blocked(
      'invalid-draft-operation',
      'A revision must explicitly change stage or connection.',
      current,
    );
  const stage = Object.hasOwn(patch, 'stage') ? patch.stage! : current.stage;
  if (stage !== null && (!Number.isSafeInteger(stage) || stage < 0))
    return blocked(
      'invalid-draft-operation',
      'Draft Operation stage must be non-negative or null.',
      current,
    );
  const connection = patch.connection ?? current.connection;
  const issue = connectionIssue(catalog, connection);
  if (issue) return blocked(issue.code, issue.detail, current);

  return Object.freeze({
    ok: true as const,
    draft: deepFreeze({
      ...current,
      revision: current.revision + 1,
      stage,
      connection: structuredClone(connection),
      apply: applyState(),
    }),
    blocker: null,
  });
}

/** Always fail closed here; a higher integration owner must explicitly consume the adapter type. */
export function executePatternImportDxfPhaseEDraftOperationV1(
  current: PatternImportDxfPhaseEDraftOperationV1,
): PatternImportDxfPhaseEDraftOperationApplyResultV1 {
  return Object.freeze({ ok: false as const, draft: current, blocker: current.apply.blocker });
}
