import type { PatternImportDxfProductCompositeSidecarBindingsV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4,
  type PatternImportDxfProductCompositeSidecarStorageAdapterV4,
  type PatternImportDxfProductCompositeSidecarStorageRequestV4,
  type PatternImportDxfProductCompositeSidecarStorageResultV4,
} from './composite-sidecar-persistence-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_REQUEST_V4,
  type PatternImportDxfProductCompositeSidecarRestoreRequestV4,
  type PatternImportDxfProductCompositeSidecarRestoreResultV4,
  type PatternImportDxfProductExactNSeamRestoreOwnerV2,
} from './composite-sidecar-restore-authority-v4';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_REQUEST_V4 =
  'pattern-import-dxf-product-composite-sidecar-transaction-request/4' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_CLAIMS_V4 = Object.freeze({
  existingSingleWriterReused: true,
  maximumPutCountPerTransaction: 1,
  verifiedPersistenceRequiredBeforeRestore: true,
  freshFullReadbackDelegatedToRestoreAuthority: true,
  exactAuthorityBindingsCheckedBeforeWrite: true,
  oneAndGreaterThanTwoSeamsOnly: true,
  exactTwoSeamsRemainOnV3V1: true,
  sameScopeConcurrentTransactionRejected: true,
  cancellationBeforeWriteIsNotAttempted: true,
  cancellationAfterWriteCreatesNoAuthority: true,
  unknownOrUnverifiedWriteCreatesNoAuthority: true,
  restoreFailureCreatesNoAuthority: true,
  secondWriterCreated: false,
  directUiApplyPerformed: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

type ExactNBindings = PatternImportDxfProductCompositeSidecarRestoreRequestV4['current'];
type PersistenceResult = PatternImportDxfProductCompositeSidecarStorageResultV4;
type RestoreResult = PatternImportDxfProductCompositeSidecarRestoreResultV4;

export type PatternImportDxfProductCompositeSidecarTransactionRequestV4 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_REQUEST_V4;
  current: ExactNBindings;
  storage: PatternImportDxfProductCompositeSidecarStorageRequestV4;
}>;

export type PatternImportDxfProductCompositeSidecarTransactionBlockerCodeV4 =
  | 'invalid-request'
  | 'authority-binding-mismatch'
  | 'v1-two-seam-path-required'
  | 'cancelled-before-write'
  | 'concurrent-transaction'
  | 'persistence-failed'
  | 'cancelled-after-write'
  | 'restore-failed'
  | 'transaction-failed';

export type PatternImportDxfProductCompositeSidecarTransactionBlockerV4 = Readonly<{
  code: PatternImportDxfProductCompositeSidecarTransactionBlockerCodeV4;
  phase: 'input' | 'persistence' | 'restore';
  detail: string;
}>;

export type PatternImportDxfProductCompositeSidecarTransactionResultV4 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductExactNSeamRestoreOwnerV2;
      persistence: Extract<PersistenceResult, { ok: true }>;
      restore: Extract<RestoreResult, { ok: true }>;
      writeOutcome: 'verified';
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_CLAIMS_V4;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      persistence: PersistenceResult | null;
      restore: RestoreResult | null;
      writeOutcome: PersistenceResult['writeOutcome'];
      blockers: readonly [PatternImportDxfProductCompositeSidecarTransactionBlockerV4];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_CLAIMS_V4;
    }>;

export type PatternImportDxfProductCompositeSidecarTransactionDependenciesV4 = Readonly<{
  persistence: Pick<PatternImportDxfProductCompositeSidecarStorageAdapterV4, 'persist'>;
  restoreAuthority: Readonly<{
    restore: (
      request: PatternImportDxfProductCompositeSidecarRestoreRequestV4,
      signal: AbortSignal,
    ) => Promise<PatternImportDxfProductCompositeSidecarRestoreResultV4>;
  }>;
}>;

type Phase = PatternImportDxfProductCompositeSidecarTransactionBlockerV4['phase'];
type Code = PatternImportDxfProductCompositeSidecarTransactionBlockerCodeV4;

const SHA256 = /^[0-9a-f]{64}$/;

class TransactionFailure extends Error {
  constructor(
    readonly code: Code,
    readonly phase: Phase,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
    this.name = 'PatternImportDxfProductCompositeSidecarTransactionFailureV4';
  }
}

function fail(code: Code, phase: Phase, detail: string): never {
  throw new TransactionFailure(code, phase, detail);
}

function sameRow(
  left: PatternImportDxfProductCompositeSidecarBindingsV3['row'],
  right: PatternImportDxfProductCompositeSidecarBindingsV3['row'],
): boolean {
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

function sameAuthority(
  storage: PatternImportDxfProductCompositeSidecarBindingsV3,
  current: ExactNBindings,
): boolean {
  return (
    sameRow(storage.row, current.row) &&
    storage.serverAssemblyRevision === current.serverAssemblyRevision &&
    storage.assemblyTopologySha256 === current.assemblyTopologySha256
  );
}

function scopeKey(current: ExactNBindings): string {
  return [
    current.row.techCardId,
    current.row.patternLineKey,
    current.row.revision,
    current.row.cardLockVersion,
    current.serverAssemblyRevision,
    current.assemblyTopologySha256,
  ].join('\u0000');
}

function ownMethod<T extends object, K extends keyof T>(value: T, key: K): T[K] | null {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor && typeof descriptor.value === 'function'
      ? (descriptor.value as T[K])
      : null;
  } catch {
    return null;
  }
}

function blocked(
  code: Code,
  phase: Phase,
  detail: string,
  persistence: PersistenceResult | null,
  restore: RestoreResult | null,
): PatternImportDxfProductCompositeSidecarTransactionResultV4 {
  return Object.freeze({
    ok: false as const,
    owner: null,
    persistence,
    restore,
    writeOutcome: persistence?.writeOutcome ?? 'not-attempted',
    blockers: Object.freeze([
      Object.freeze({ code, phase, detail: detail.slice(0, 2_048) }),
    ]) as readonly [PatternImportDxfProductCompositeSidecarTransactionBlockerV4],
    claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_CLAIMS_V4,
  });
}

function validateRequest(
  request: PatternImportDxfProductCompositeSidecarTransactionRequestV4,
): string {
  if (
    !request ||
    typeof request !== 'object' ||
    request.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_REQUEST_V4 ||
    !request.current ||
    !request.storage ||
    request.storage.schemaVersion !==
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4
  )
    fail('invalid-request', 'input', 'Composite V4 transaction request is invalid.');
  const { current, storage } = request;
  if (
    !current.row ||
    !current.selectedOperation ||
    !Number.isSafeInteger(current.selectedOperation.sourceOperationNumber) ||
    current.selectedOperation.sourceOperationNumber < 1 ||
    !Array.isArray(current.selectedOperation.seamIds) ||
    current.selectedOperation.seamIds.length < 1 ||
    current.selectedOperation.seamIds.length === 2 ||
    typeof current.catalogCanonicalSha256 !== 'string' ||
    !SHA256.test(current.catalogCanonicalSha256) ||
    typeof current.phaseEAggregatePlanSha256 !== 'string' ||
    !SHA256.test(current.phaseEAggregatePlanSha256)
  )
    fail(
      current.selectedOperation?.seamIds?.length === 2
        ? 'v1-two-seam-path-required'
        : 'invalid-request',
      'input',
      current.selectedOperation?.seamIds?.length === 2
        ? 'Exact two-seam cards remain on the Composite V3/V1 path.'
        : 'Composite V4 exact-N bindings are invalid.',
    );
  if (!sameAuthority(storage.currentAuthority, current))
    fail(
      'authority-binding-mismatch',
      'input',
      'Storage authority differs from the exact-N restore authority.',
    );
  return scopeKey(current);
}

export function createPatternImportDxfProductCompositeSidecarTransactionV4(
  dependencies: PatternImportDxfProductCompositeSidecarTransactionDependenciesV4,
): Readonly<{
  execute: (
    request: PatternImportDxfProductCompositeSidecarTransactionRequestV4,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfProductCompositeSidecarTransactionResultV4>;
  claims: typeof PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_CLAIMS_V4;
}> {
  const persist = dependencies?.persistence && ownMethod(dependencies.persistence, 'persist');
  const restore =
    dependencies?.restoreAuthority && ownMethod(dependencies.restoreAuthority, 'restore');
  const activeScopes = new Set<string>();

  return Object.freeze({
    async execute(request, signal) {
      let persistence: PersistenceResult | null = null;
      let restoration: RestoreResult | null = null;
      let transactionScope: string | null = null;
      try {
        if (!persist || !restore)
          fail('invalid-request', 'input', 'Persistence and restore owners are required.');
        if (!(signal instanceof AbortSignal))
          fail('invalid-request', 'input', 'A genuine AbortSignal is required.');
        transactionScope = validateRequest(request);
        if (signal.aborted)
          fail('cancelled-before-write', 'input', 'Transaction was cancelled before persistence.');
        if (activeScopes.has(transactionScope))
          fail(
            'concurrent-transaction',
            'input',
            'Another Composite V4 transaction owns this exact saved-card scope.',
          );
        activeScopes.add(transactionScope);

        persistence = await Reflect.apply(persist, dependencies.persistence, [
          request.storage,
          signal,
        ]);
        if (!persistence.ok)
          return blocked(
            'persistence-failed',
            'persistence',
            persistence.blockers[0]?.detail ?? 'Composite V4 persistence failed closed.',
            persistence,
            null,
          );
        if (signal.aborted)
          return blocked(
            'cancelled-after-write',
            'persistence',
            'Transaction was cancelled after verified persistence; no restore authority was minted.',
            persistence,
            null,
          );

        restoration = await Reflect.apply(restore, dependencies.restoreAuthority, [
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_RESTORE_REQUEST_V4,
            current: request.current,
            verifiedPersistence: persistence,
          },
          signal,
        ]);
        if (!restoration.ok || signal.aborted)
          return blocked(
            signal.aborted ? 'cancelled-after-write' : 'restore-failed',
            'restore',
            signal.aborted
              ? 'Transaction was cancelled during fresh readback; no restore authority was minted.'
              : (restoration.blockers[0]?.detail ?? 'Composite V4 restore failed closed.'),
            persistence,
            restoration,
          );
        return Object.freeze({
          ok: true as const,
          owner: restoration.owner,
          persistence,
          restore: restoration,
          writeOutcome: 'verified' as const,
          blockers: Object.freeze([]) as readonly [],
          claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_CLAIMS_V4,
        });
      } catch (error) {
        const known =
          error instanceof TransactionFailure
            ? error
            : new TransactionFailure(
                persistence?.ok ? 'restore-failed' : 'transaction-failed',
                persistence?.ok ? 'restore' : 'persistence',
                persistence?.ok
                  ? 'Restore owner threw after persistence; no authority was minted.'
                  : 'Composite V4 transaction failed closed.',
              );
        return blocked(known.code, known.phase, known.message, persistence, restoration);
      } finally {
        if (transactionScope) activeScopes.delete(transactionScope);
      }
    },
    claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_CLAIMS_V4,
  });
}
