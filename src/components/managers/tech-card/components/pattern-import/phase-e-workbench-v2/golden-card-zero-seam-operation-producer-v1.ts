import type { PatternImportDxfProductPhaseEExistingAssemblyOperationV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1 } from './draft-operation-from-connection-v1';
import {
  appendPatternImportDxfPhaseEGoldenCardReconstructionOperationV1,
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_HARNESS_V1,
  type PatternImportDxfPhaseEGoldenCardOperationV1,
  type PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1,
} from './golden-card-reconstruction-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_ZERO_SEAM_ACTION_V1 =
  'pattern-import-dxf-phase-e-golden-card-zero-seam-action/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_ZERO_SEAM_RECEIPT_V1 =
  'pattern-import-dxf-phase-e-golden-card-zero-seam-receipt/1' as const;

/**
 * The current DXF assembly graph has no first-class fuse/press/label/button/buttonhole/hem kinds.
 * Their authoritative Assembly Order work token is retained verbatim on `operation.work`; callers
 * must separately choose one of the two seam-free graph primitives instead of this module guessing
 * a graph kind from that token.
 */
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_ZERO_SEAM_CLAIMS_V1 = Object.freeze({
  sessionOnly: true,
  existingAssemblyOrderOperationOwnerReused: true,
  existingGoldenHarnessAppendReused: true,
  exactCurrentCatalogRequired: true,
  persistedOperationIdentityRequired: true,
  zeroConnectionsRequired: true,
  workTokenRetainedOpaque: true,
  workTokenToGraphKindInferred: false,
  supportedGraphKinds: Object.freeze(['place', 'release-support'] as const),
  firstClassFusePressLabelButtonButtonholeHemKindsAvailable: false,
  operationOrderDerivedFromActionSequence: true,
  createsTopologyAuthority: false,
  createsOperationAuthority: false,
  createsPersistenceModel: false,
  applyEligible: false,
  productionReady: false,
} as const);

type ZeroSeamGraphKindV1 =
  (typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_ZERO_SEAM_CLAIMS_V1.supportedGraphKinds)[number];

export type PatternImportDxfPhaseEGoldenCardZeroSeamActionV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_ZERO_SEAM_ACTION_V1;
  status: 'session-only-table-action';
  source: Readonly<{
    catalogCanonicalSha256: string;
    sizeSelectionCanonicalSha256: string;
    sourceFileId: string;
  }>;
  stage: number;
  graphKind: ZeroSeamGraphKindV1;
  /** Detached exact projection of the existing Assembly Order row; never a newly minted row. */
  operation: PatternImportDxfProductPhaseEExistingAssemblyOperationV1;
  apply: Readonly<{
    eligible: false;
    boundary: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1;
  }>;
}>;

export type PatternImportDxfPhaseEGoldenCardZeroSeamReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_ZERO_SEAM_RECEIPT_V1;
  status: 'session-only-produced';
  actionRevision: number;
  operation: PatternImportDxfPhaseEGoldenCardOperationV1;
  apply: Readonly<{
    eligible: false;
    boundary: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1;
  }>;
}>;

export type PatternImportDxfPhaseEGoldenCardZeroSeamBlockerV1 = Readonly<{
  code:
    | 'invalid-session'
    | 'invalid-action'
    | 'action-source-mismatch'
    | 'apply-boundary-invalid'
    | 'operation-identity-missing'
    | 'operation-kind-unsupported'
    | 'operation-connections-present'
    | 'operation-stage-order-invalid'
    | 'harness-append-rejected';
  detail: string;
}>;

export type PatternImportDxfPhaseEGoldenCardZeroSeamResultV1 =
  | Readonly<{
      ok: true;
      session: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1;
      receipt: PatternImportDxfPhaseEGoldenCardZeroSeamReceiptV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      session: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1;
      receipt: null;
      blocker: PatternImportDxfPhaseEGoldenCardZeroSeamBlockerV1;
    }>;

const ACTION_KEYS = Object.freeze([
  'apply',
  'graphKind',
  'operation',
  'schemaVersion',
  'source',
  'stage',
  'status',
]);
const SOURCE_KEYS = Object.freeze([
  'catalogCanonicalSha256',
  'sizeSelectionCanonicalSha256',
  'sourceFileId',
]);
const APPLY_KEYS = Object.freeze(['boundary', 'eligible']);
const OPERATION_KEYS = Object.freeze([
  'authoringOperationId',
  'inputKeys',
  'number',
  'outputUnitKey',
  'outputUnitName',
  'phaseEKind',
  'seamKeys',
  'work',
]);

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, expected: readonly string[]): boolean {
  return (
    record(value) &&
    Object.keys(value).sort().join('\u0000') === [...expected].sort().join('\u0000')
  );
}

function blocked(
  session: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1,
  code: PatternImportDxfPhaseEGoldenCardZeroSeamBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseEGoldenCardZeroSeamResultV1 {
  return Object.freeze({
    ok: false as const,
    session,
    receipt: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function retainedGraphOrderAccepts(
  session: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1,
  nextStage: number,
): boolean {
  return session.operations.every(
    (operation, index) =>
      operation.assembly.order === index &&
      (index === 0 || operation.assembly.stage >= session.operations[index - 1]!.assembly.stage) &&
      (index !== session.operations.length - 1 || nextStage >= operation.assembly.stage),
  );
}

function appendDetached(
  session: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1,
  action: PatternImportDxfPhaseEGoldenCardZeroSeamActionV1,
): PatternImportDxfPhaseEGoldenCardZeroSeamResultV1 {
  if (
    session?.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_RECONSTRUCTION_HARNESS_V1 ||
    session.status !== 'session-only-replay'
  )
    return blocked(
      session,
      'invalid-session',
      'A zero-seam action requires one current detached golden reconstruction session.',
    );
  if (
    !exactKeys(action, ACTION_KEYS) ||
    action.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_ZERO_SEAM_ACTION_V1 ||
    action.status !== 'session-only-table-action' ||
    !exactKeys(action.source, SOURCE_KEYS) ||
    !exactKeys(action.apply, APPLY_KEYS) ||
    !exactKeys(action.operation, OPERATION_KEYS)
  )
    return blocked(
      session,
      'invalid-action',
      'A zero-seam producer accepts only one exact detached session action envelope.',
    );
  if (
    action.source.catalogCanonicalSha256 !== session.catalog.canonicalSha256 ||
    action.source.sizeSelectionCanonicalSha256 !== session.catalog.sizeSelectionCanonicalSha256 ||
    action.source.sourceFileId !== session.catalog.sourceFileId
  )
    return blocked(
      session,
      'action-source-mismatch',
      'The zero-seam action and golden session must reference the same exact current catalog.',
    );
  if (
    action.apply.eligible !== false ||
    action.apply.boundary !== PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1
  )
    return blocked(
      session,
      'apply-boundary-invalid',
      'The zero-seam producer accepts only actions whose explicit Apply boundary is fail-closed.',
    );

  const card = action.operation;
  const operationRef = card.authoringOperationId;
  if (!operationRef)
    return blocked(
      session,
      'operation-identity-missing',
      'A golden zero-seam action cannot invent an Assembly Order operation identity.',
    );
  if (card.phaseEKind !== null || !['place', 'release-support'].includes(action.graphKind))
    return blocked(
      session,
      'operation-kind-unsupported',
      'A zero-seam action requires phaseEKind null and an explicit place or release-support graph primitive.',
    );
  if (!Array.isArray(card.seamKeys) || card.seamKeys.length !== 0)
    return blocked(
      session,
      'operation-connections-present',
      'A zero-seam action cannot own or synthesize any connection.',
    );
  if (
    !Number.isSafeInteger(action.stage) ||
    action.stage < 0 ||
    !retainedGraphOrderAccepts(session, action.stage)
  )
    return blocked(
      session,
      'operation-stage-order-invalid',
      'A produced graph requires an explicit nonnegative stage, contiguous order and nondecreasing stages.',
    );

  const operation: PatternImportDxfPhaseEGoldenCardOperationV1 = {
    operationRef,
    assembly: {
      id: operationRef,
      stage: action.stage,
      order: session.operations.length,
      kind: action.graphKind,
      seamIds: [],
    },
    card: structuredClone(card),
    stitch: null,
  };
  const appended = appendPatternImportDxfPhaseEGoldenCardReconstructionOperationV1(
    session,
    operation,
    [],
  );
  if (!appended.ok)
    return blocked(
      session,
      'harness-append-rejected',
      `The existing golden graph harness rejected the zero-seam action: ${appended.blocker.detail}`,
    );

  const receipt = deepFreeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_ZERO_SEAM_RECEIPT_V1,
    status: 'session-only-produced' as const,
    actionRevision: appended.session.revision,
    operation: structuredClone(operation),
    apply: {
      eligible: false as const,
      boundary: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_OPERATION_APPLY_ADAPTER_V1,
    },
  });
  return Object.freeze({
    ok: true as const,
    session: appended.session,
    receipt,
    blocker: null,
  });
}

/**
 * Appends one retained Assembly Order row that owns no connections. The operation's work token is
 * preserved as opaque authority; no work-token classification, topology write or product write is
 * reachable from this pure function.
 */
export function appendPatternImportDxfPhaseEGoldenCardZeroSeamActionV1(
  session: PatternImportDxfPhaseEGoldenCardReconstructionHarnessV1,
  action: PatternImportDxfPhaseEGoldenCardZeroSeamActionV1,
): PatternImportDxfPhaseEGoldenCardZeroSeamResultV1 {
  try {
    return appendDetached(session, structuredClone(action));
  } catch {
    return blocked(
      session,
      'invalid-action',
      'The zero-seam action must be a cloneable detached plain-data envelope.',
    );
  }
}
