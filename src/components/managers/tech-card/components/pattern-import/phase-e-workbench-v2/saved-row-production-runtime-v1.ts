import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import type { CardContext } from '../client';
import {
  createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1,
  type PatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1,
} from './saved-assembly-snapshot-production-rpc-v1';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';
import { createPatternImportDxfPhaseESavedRowPreparationOwnerV1 } from './saved-row-preparation-owner-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_V1 =
  'pattern-import-dxf-phase-e-saved-row-production-runtime/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_CLAIMS_V1 = Object.freeze({
  callerProvidedCurrentCardProjectionRequired: true,
  getTechCardFallbackUsed: false,
  localFormAssemblyAuthorityUsed: false,
  exactCardIdAndLockRevalidatedBeforeReprocess: true,
  transactionalSnapshotRowReadUsed: true,
  transactionalSnapshotAssemblyReadUsed: true,
  freshDisposableReprocessHostPerPreparation: true,
  generatedSnapshotRpcIntegratedByProductionFactory: true,
  uiIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseESavedRowCardProjectionV1 = Readonly<{
  card: CardContext;
  cardLockVersion: number;
}>;

type SnapshotAuthority = Readonly<{
  bridge: Pick<
    PatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1['bridge'],
    'readAuthoritativeRow'
  >;
  authorityAdapter: Pick<
    PatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1['authorityAdapter'],
    'readAuthoritativeAssembly'
  >;
}>;

export type PatternImportDxfPhaseESavedRowRuntimeDepsV1 = Readonly<{
  selectedOperationNumber: number;
  projection: PatternImportDxfPhaseESavedRowCardProjectionV1;
  snapshot: SnapshotAuthority;
  fetch?: typeof globalThis.fetch;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

export type PatternImportDxfPhaseESavedRowProductionRuntimeDepsV1 = Omit<
  PatternImportDxfPhaseESavedRowRuntimeDepsV1,
  'snapshot'
>;

type PreparationOwner = ReturnType<typeof createPatternImportDxfPhaseESavedRowPreparationOwnerV1>;

export type PatternImportDxfPhaseESavedRowProductionRuntimeV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_V1;
  preparationOwner: PreparationOwner;
  dispose: () => void;
  snapshot: () => Readonly<{
    disposed: boolean;
    preparation: ReturnType<PreparationOwner['snapshot']>;
  }>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_CLAIMS_V1;
}>;

function abortError(): DOMException {
  return new DOMException('Saved-row card projection resolution was cancelled.', 'AbortError');
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child, seen));
  return Object.freeze(value);
}

function captureProjection(
  projection: PatternImportDxfPhaseESavedRowCardProjectionV1,
): PatternImportDxfPhaseESavedRowCardProjectionV1 {
  if (
    !projection ||
    !projection.card ||
    !Number.isSafeInteger(projection.card.techCardId) ||
    projection.card.techCardId <= 0 ||
    !Number.isSafeInteger(projection.cardLockVersion) ||
    projection.cardLockVersion < 0
  )
    throw new TypeError('A positive card id and non-negative current card lock are required.');
  let card: CardContext;
  try {
    card = structuredClone(projection.card);
  } catch {
    throw new TypeError('The current card projection must be detachable plain data.');
  }
  return Object.freeze({
    card: deepFreeze(card),
    cardLockVersion: projection.cardLockVersion,
  });
}

/**
 * Captures one current GetTechCard projection and resolves it only for the exact saved-row card and
 * optimistic lock. Assembly topology is deliberately absent from this seam: it always comes from
 * the transactional snapshot adapter.
 */
export function createPatternImportDxfPhaseESavedRowCardProjectionResolverV1(
  projection: PatternImportDxfPhaseESavedRowCardProjectionV1,
) {
  const captured = captureProjection(projection);
  return async (expected: DxfProductSavedRowIdentityV1, signal: AbortSignal) => {
    if (signal.aborted) throw abortError();
    if (
      expected.techCardId !== captured.card.techCardId ||
      expected.cardLockVersion !== captured.cardLockVersion
    )
      throw new Error('The current card projection moved from the saved-row card or lock.');
    return Object.freeze({
      card: captured.card,
      cardLockVersion: captured.cardLockVersion,
    });
  };
}

/** Injectable composition used by the production factory and focused tests. */
export function createPatternImportDxfPhaseESavedRowRuntimeV1(
  deps: PatternImportDxfPhaseESavedRowRuntimeDepsV1,
): PatternImportDxfPhaseESavedRowProductionRuntimeV1 {
  if (!Number.isSafeInteger(deps.selectedOperationNumber) || deps.selectedOperationNumber < 1)
    throw new TypeError('A positive selected Assembly operation number is required.');
  if (
    !deps.snapshot ||
    typeof deps.snapshot.bridge?.readAuthoritativeRow !== 'function' ||
    typeof deps.snapshot.authorityAdapter?.readAuthoritativeAssembly !== 'function'
  )
    throw new TypeError('Transactional saved-row and Assembly snapshot capabilities are required.');
  const resolveCard = createPatternImportDxfPhaseESavedRowCardProjectionResolverV1(deps.projection);
  const crypto = deps.crypto ?? globalThis.crypto;
  let disposed = false;
  const liveHosts = new Set<
    ReturnType<typeof createPatternImportDxfPhaseESavedDxfReprocessHostV1>
  >();

  const createSavedReprocessHost = () => {
    if (disposed) throw new Error('Saved-row production runtime is disposed.');
    const concrete = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      resolveCard,
      readAuthoritativeRow: deps.snapshot.bridge.readAuthoritativeRow,
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
      ...(crypto ? { crypto } : {}),
    });
    liveHosts.add(concrete);
    // The preparation owner accepts only the narrow DxfProductSavedReprocessHostV1 capability.
    // Strip the concrete host's audit metadata instead of weakening that boundary.
    return Object.freeze({
      readAuthoritativeRow: concrete.readAuthoritativeRow,
      reprocess: concrete.reprocess,
      readCurrentRowIdentity: concrete.readCurrentRowIdentity,
      ...(crypto ? { crypto } : {}),
      dispose() {
        try {
          concrete.dispose();
        } finally {
          liveHosts.delete(concrete);
        }
      },
    });
  };

  const preparationOwner = createPatternImportDxfPhaseESavedRowPreparationOwnerV1({
    createSavedReprocessHost,
    readAuthoritativeAssembly: deps.snapshot.authorityAdapter.readAuthoritativeAssembly,
    ...(crypto ? { crypto } : {}),
  });

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_V1,
    preparationOwner,
    dispose() {
      if (disposed) return;
      disposed = true;
      preparationOwner.dispose();
      for (const host of liveHosts) host.dispose();
      liveHosts.clear();
    },
    snapshot: () =>
      Object.freeze({
        disposed,
        preparation: preparationOwner.snapshot(),
      }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_PRODUCTION_RUNTIME_CLAIMS_V1,
  });
}

/** Production binding: generated abortable RPC + client Composite V3 codec + saved-DXF replay. */
export function createPatternImportDxfPhaseESavedRowProductionRuntimeV1(
  deps: PatternImportDxfPhaseESavedRowProductionRuntimeDepsV1,
): PatternImportDxfPhaseESavedRowProductionRuntimeV1 {
  const snapshot = createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(
    deps.selectedOperationNumber,
    deps.crypto,
  );
  return createPatternImportDxfPhaseESavedRowRuntimeV1({
    ...deps,
    snapshot,
  });
}
