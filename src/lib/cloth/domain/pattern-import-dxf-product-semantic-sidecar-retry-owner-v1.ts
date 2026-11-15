import {
  PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_V1,
  type PatternImportDxfProductMappingCompositionInputV1,
} from './pattern-import-dxf-product-mapping-composition-v1';
import {
  composePatternImportDxfProductSemanticSidecarPersistenceV1,
  type PatternImportDxfProductSidecarLiveCompositionResultV1,
  type PatternImportDxfProductSidecarLiveServiceV1,
} from './pattern-import-dxf-product-semantic-sidecar-live-composition-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_REQUEST_V1 =
  'pattern-import-dxf-product-sidecar-retry-request/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_OWNER_V1 =
  'pattern-import-dxf-product-sidecar-retry-owner/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_SNAPSHOT_V1 =
  'pattern-import-dxf-product-sidecar-retry-snapshot/1' as const;

export type PatternImportDxfProductSidecarRetryRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_REQUEST_V1;
  compositionInput: PatternImportDxfProductMappingCompositionInputV1;
}>;

export type PatternImportDxfProductSidecarRetryOwnerV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_OWNER_V1;
}>;

export type PatternImportDxfProductSidecarRetrySnapshotV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_SNAPSHOT_V1;
  techCardId: number;
  scopeKey: string;
  patternLineKey: string;
  status: 'pending' | 'running' | 'retryable' | 'rebuild-required' | 'verified';
  attemptCount: number;
  savedDxfStatus: 'confirmed-and-not-rolled-back';
  attachmentStatus: 'pending' | 'unknown' | 'acknowledged-unverified' | 'verified';
  retryActionVisible: boolean;
  retryMode: 'fresh-chain-same-confirmed-save' | 'rebuild-intent' | null;
  lastBlocker: Readonly<{
    code: string;
    phase: string;
    detail: string;
    writeOutcome: string;
  }> | null;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_CONTRACT_V1 = Object.freeze({
  confirmedDxfSaveRequiredBeforeOwnerMint: true,
  attachmentFailureRollsBackSavedDxf: false,
  retryableStorageFailureRebuildsFreshChain: true,
  staleMappingOrCardPreflightRequiresNewIntent: true,
  detachedG4f4OwnerRetainedForRetry: false,
  concurrentAttemptsAccepted: false,
  survivesPageReload: false,
  wizardUiWired: false,
  authenticatedRealRowObserved: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  confirmedDxfSavePreserved: true as const,
  freshProductAttachmentChainVerified: false as const,
  attachmentRetryVisible: false as const,
  detachedG4f4OwnerAccepted: false as const,
  savedDxfRolledBack: false as const,
  wizardUiWired: false as const,
  survivesPageReload: false as const,
  productionReady: false as const,
});

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRYABLE_CLAIMS_V1 = Object.freeze({
  confirmedDxfSavePreserved: true as const,
  freshProductAttachmentChainVerified: false as const,
  attachmentRetryVisible: true as const,
  detachedG4f4OwnerAccepted: false as const,
  savedDxfRolledBack: false as const,
  wizardUiWired: false as const,
  survivesPageReload: false as const,
  productionReady: false as const,
});

export const PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_VERIFIED_CLAIMS_V1 = Object.freeze({
  confirmedDxfSavePreserved: true as const,
  freshProductAttachmentChainVerified: true as const,
  attachmentRetryVisible: false as const,
  detachedG4f4OwnerAccepted: false as const,
  savedDxfRolledBack: false as const,
  wizardUiWired: false as const,
  survivesPageReload: false as const,
  productionReady: false as const,
});

export type PatternImportDxfProductSidecarRetryBlockerV1 = Readonly<{
  code: 'invalid-owner' | 'reentrant-attempt' | 'rebuild-required' | 'attachment-attempt-blocked';
  detail: string;
}>;

export type PatternImportDxfProductSidecarRetryAttemptResultV1 =
  | Readonly<{
      ok: true;
      snapshot: PatternImportDxfProductSidecarRetrySnapshotV1;
      evidence: Extract<
        PatternImportDxfProductSidecarLiveCompositionResultV1,
        { ok: true }
      >['evidence'];
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_VERIFIED_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      snapshot: PatternImportDxfProductSidecarRetrySnapshotV1 | null;
      evidence: null;
      blockers: readonly [PatternImportDxfProductSidecarRetryBlockerV1];
      claims: typeof BLOCKED_CLAIMS | typeof PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRYABLE_CLAIMS_V1;
    }>;

type MutableState = {
  input: PatternImportDxfProductMappingCompositionInputV1;
  techCardId: number;
  scopeKey: string;
  patternLineKey: string;
  status: PatternImportDxfProductSidecarRetrySnapshotV1['status'];
  attemptCount: number;
  attachmentStatus: PatternImportDxfProductSidecarRetrySnapshotV1['attachmentStatus'];
  lastBlocker: PatternImportDxfProductSidecarRetrySnapshotV1['lastBlocker'];
  evidence:
    Extract<PatternImportDxfProductSidecarLiveCompositionResultV1, { ok: true }>['evidence'] | null;
};

const states = new WeakMap<object, MutableState>();
const MAX_DETAIL_BYTES = 1_024;
const textEncoder = new TextEncoder();

function bounded(value: string): string {
  if (textEncoder.encode(value).byteLength <= MAX_DETAIL_BYTES) return value;
  let output = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${output}${scalar}…`).byteLength > MAX_DETAIL_BYTES) break;
    output += scalar;
  }
  return `${output}…`;
}

function snapshot(state: MutableState): PatternImportDxfProductSidecarRetrySnapshotV1 {
  const retryable = state.status === 'retryable';
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_SNAPSHOT_V1,
    techCardId: state.techCardId,
    scopeKey: state.scopeKey,
    patternLineKey: state.patternLineKey,
    status: state.status,
    attemptCount: state.attemptCount,
    savedDxfStatus: 'confirmed-and-not-rolled-back' as const,
    attachmentStatus: state.attachmentStatus,
    retryActionVisible: retryable || state.status === 'rebuild-required',
    retryMode: retryable
      ? ('fresh-chain-same-confirmed-save' as const)
      : state.status === 'rebuild-required'
        ? ('rebuild-intent' as const)
        : null,
    lastBlocker: state.lastBlocker ? Object.freeze({ ...state.lastBlocker }) : null,
  });
}

function blocked(
  code: PatternImportDxfProductSidecarRetryBlockerV1['code'],
  detail: string,
  ownerSnapshot: PatternImportDxfProductSidecarRetrySnapshotV1 | null,
  retryable: boolean,
): PatternImportDxfProductSidecarRetryAttemptResultV1 {
  return Object.freeze({
    ok: false as const,
    snapshot: ownerSnapshot,
    evidence: null,
    blockers: Object.freeze([Object.freeze({ code, detail: bounded(detail) })]) as readonly [
      PatternImportDxfProductSidecarRetryBlockerV1,
    ],
    claims: retryable ? PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRYABLE_CLAIMS_V1 : BLOCKED_CLAIMS,
  });
}

function exactDataProperty(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (
    !descriptor ||
    !descriptor.enumerable ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined
  )
    return undefined;
  return descriptor.value;
}

/** Mints a private retry intent only after an exact confirmed product save receipt exists. */
export function createPatternImportDxfProductSidecarRetryOwnerV1(
  request: PatternImportDxfProductSidecarRetryRequestV1,
): PatternImportDxfProductSidecarRetryOwnerV1 | null {
  if (
    !request ||
    typeof request !== 'object' ||
    Object.getPrototypeOf(request) !== Object.prototype
  )
    return null;
  if (
    Reflect.ownKeys(request).length !== 2 ||
    exactDataProperty(request, 'schemaVersion') !==
      PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_REQUEST_V1
  )
    return null;
  const input = exactDataProperty(request, 'compositionInput') as
    PatternImportDxfProductMappingCompositionInputV1 | undefined;
  if (
    !input ||
    input.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_V1 ||
    !input.apply?.ok ||
    !input.apply.commitReceipt ||
    !input.scopeKey
  )
    return null;
  const scopes = input.apply.commitReceipt.scopes.filter(
    ({ scopeKey }) => scopeKey === input.scopeKey,
  );
  if (
    scopes.length !== 1 ||
    input.apply.commitReceipt.techCardId !== input.draft?.techCardId ||
    !scopes[0].patternLineKey
  )
    return null;
  const owner: PatternImportDxfProductSidecarRetryOwnerV1 = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_OWNER_V1,
  });
  states.set(owner, {
    input,
    techCardId: input.apply.commitReceipt.techCardId,
    scopeKey: input.scopeKey,
    patternLineKey: scopes[0].patternLineKey,
    status: 'pending',
    attemptCount: 0,
    attachmentStatus: 'pending',
    lastBlocker: null,
    evidence: null,
  });
  return owner;
}

export function readPatternImportDxfProductSidecarRetrySnapshotV1(
  owner: PatternImportDxfProductSidecarRetryOwnerV1,
): PatternImportDxfProductSidecarRetrySnapshotV1 | null {
  const state = owner && typeof owner === 'object' ? states.get(owner) : undefined;
  return state ? snapshot(state) : null;
}

/** Runs one fresh attachment chain. Only storage uncertainty remains exact-retryable. */
export async function attemptPatternImportDxfProductSidecarAttachmentV1(
  owner: PatternImportDxfProductSidecarRetryOwnerV1,
  service: PatternImportDxfProductSidecarLiveServiceV1,
  crypto: Pick<Crypto, 'subtle'> = globalThis.crypto,
): Promise<PatternImportDxfProductSidecarRetryAttemptResultV1> {
  const state = owner && typeof owner === 'object' ? states.get(owner) : undefined;
  if (!state)
    return blocked('invalid-owner', 'A genuine product retry owner is required.', null, false);
  if (state.status === 'running')
    return blocked(
      'reentrant-attempt',
      'A product attachment attempt is already running.',
      snapshot(state),
      false,
    );
  if (state.status === 'rebuild-required')
    return blocked(
      'rebuild-required',
      'The mapping or saved-card preflight moved; create a new intent from current card state.',
      snapshot(state),
      false,
    );
  if (state.status === 'verified' && state.evidence)
    return Object.freeze({
      ok: true as const,
      snapshot: snapshot(state),
      evidence: state.evidence,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_VERIFIED_CLAIMS_V1,
    });

  state.status = 'running';
  state.attemptCount += 1;
  let composed: PatternImportDxfProductSidecarLiveCompositionResultV1;
  try {
    composed = await composePatternImportDxfProductSemanticSidecarPersistenceV1(
      service,
      state.input,
      crypto,
    );
  } catch {
    state.status = 'rebuild-required';
    state.attachmentStatus = 'pending';
    state.lastBlocker = Object.freeze({
      code: 'unexpected-composition-failure',
      phase: 'owner-build',
      detail: 'The fresh attachment chain failed unexpectedly; rebuild from current card state.',
      writeOutcome: 'not-attempted',
    });
    state.evidence = null;
    return blocked('attachment-attempt-blocked', state.lastBlocker.detail, snapshot(state), false);
  }
  if (composed.ok) {
    state.status = 'verified';
    state.attachmentStatus = 'verified';
    state.lastBlocker = null;
    state.evidence = composed.evidence;
    return Object.freeze({
      ok: true as const,
      snapshot: snapshot(state),
      evidence: composed.evidence,
      blockers: Object.freeze([]) as readonly [],
      claims: PATTERN_IMPORT_DXF_PRODUCT_SIDECAR_RETRY_VERIFIED_CLAIMS_V1,
    });
  }

  const cause = composed.blockers[0];
  const retryable =
    cause.phase === 'storage' &&
    (cause.writeOutcome === 'unknown' || cause.writeOutcome === 'acknowledged-unverified');
  state.status = retryable ? 'retryable' : 'rebuild-required';
  state.attachmentStatus = retryable ? cause.writeOutcome : 'pending';
  state.lastBlocker = Object.freeze({ ...cause });
  state.evidence = null;
  return blocked('attachment-attempt-blocked', cause.detail, snapshot(state), retryable);
}
