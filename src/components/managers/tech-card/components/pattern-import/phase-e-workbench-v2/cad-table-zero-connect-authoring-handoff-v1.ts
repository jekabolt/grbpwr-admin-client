import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import type {
  PatternImportDxfPhaseECadTableZeroConnectCandidateV1,
  PatternImportDxfPhaseECadTableZeroConnectSessionV1,
} from './cad-table-zero-connect-session-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1 } from './cad-table-zero-operation-authority-rebind-v1';
import {
  isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
  type PatternImportDxfPhaseEZeroConnectPreparedAuthorityRefreshOwnerV1,
  type PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
} from './cad-table-zero-connect-phase-e-authority-v1';
import type { PatternImportDxfPhaseEZeroConnectRowAdapterBlockerV1 } from './cad-table-zero-connect-row-adapter-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_AUTHORING_HANDOFF_V1 =
  'pattern-import-dxf-phase-e-zero-connect-authoring-handoff/1' as const;

declare const authoringRefreshOwnerBrand: unique symbol;
export type PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1 = Readonly<{
  refresh: PatternImportDxfPhaseEZeroConnectPreparedAuthorityRefreshOwnerV1['refresh'];
  readonly [authoringRefreshOwnerBrand]: never;
}>;

type RefreshOwnerState = Readonly<{
  authority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
  expectation: PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
}>;

const refreshOwnerStates = new WeakMap<object, RefreshOwnerState>();

function sameRow(
  left: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1['row'],
  right: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1['row'],
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

function exactPreparedBinding(input: {
  authority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
  expectation: PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
}): boolean {
  const { authority, expectation, catalog, projection } = input;
  return (
    isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1(authority) &&
    sameRow(authority.row, expectation.row) &&
    authority.row.techCardId === expectation.techCardId &&
    authority.row.techCardId === catalog.techCardId &&
    authority.row.scopeKey === expectation.scopeKey &&
    authority.row.scopeKey === catalog.scopeKey &&
    authority.row.sha256 === expectation.sourceSha256 &&
    authority.catalogCanonicalSha256 === expectation.catalogCanonicalSha256 &&
    authority.catalogCanonicalSha256 === catalog.canonicalSha256 &&
    authority.sizeSelectionCanonicalSha256 === expectation.sizeSelectionCanonicalSha256 &&
    authority.sizeSelectionCanonicalSha256 === catalog.sizeSelectionCanonicalSha256 &&
    authority.sourceFileId === expectation.sourceFileId &&
    authority.sourceFileId === catalog.sourceFileId &&
    authority.importGeneration === expectation.importGeneration &&
    (expectation.source === 'fresh-card-session' ||
      expectation.source === 'saved-row-preparation') &&
    expectation.sizeToken === catalog.sizeToken &&
    projection.expectedCatalogCanonicalSha256 === catalog.canonicalSha256 &&
    projection.sizeSelectionCanonicalSha256 === catalog.sizeSelectionCanonicalSha256 &&
    projection.sourceFileId === catalog.sourceFileId &&
    projection.sizeToken === catalog.sizeToken
  );
}

/** Mints the only refresh capability accepted by the OperationsField handoff. */
export function createPatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1(input: {
  authority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
  expectation: PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  refreshOwner: PatternImportDxfPhaseEZeroConnectPreparedAuthorityRefreshOwnerV1;
}): PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1 | null {
  if (!exactPreparedBinding(input)) return null;
  const owner = Object.freeze({
    refresh: (signal: AbortSignal) => input.refreshOwner.refresh(signal),
  }) as PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1;
  refreshOwnerStates.set(
    owner,
    Object.freeze({
      authority: input.authority,
      expectation: input.expectation,
      catalog: input.catalog,
      projection: input.projection,
    }),
  );
  return owner;
}

export function isPatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1(
  owner: PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1 | null | undefined,
  binding: Readonly<{
    authority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
    catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
    projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  }>,
): owner is PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1 {
  if (!owner) return false;
  const state = refreshOwnerStates.get(owner);
  return Boolean(
    state &&
      state.authority === binding.authority &&
      state.catalog === binding.catalog &&
      state.projection === binding.projection &&
      exactPreparedBinding({
        authority: state.authority,
        expectation: state.expectation,
        catalog: state.catalog,
        projection: state.projection,
      }),
  );
}

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_AUTHORING_HANDOFF_CLAIMS_V1 = Object.freeze({
  existingOperationsFieldIsSoleWriter: true,
  candidateAndCurrentSessionRequired: true,
  appendReceiptRequired: true,
  existingSavedEmptyOperationMayBeTargetedWithoutAppend: true,
  createsNetworkWriter: false,
  requestsAutosave: false,
  createsSeamAuthority: false,
  createsPersistedOperationIdentity: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_AUTHORING_HANDOFF_V1;
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  /** The live ready session lets the form owner reject a stale detached candidate. */
  session: PatternImportDxfPhaseECadTableZeroConnectSessionV1;
  /** Exact gesture authority retained in memory when the zero-operation canvas unmounts. */
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  authoringAuthority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
  authoringAuthorityRefresh: PatternImportDxfPhaseEZeroConnectAuthoringRefreshOwnerV1;
}>;

export type PatternImportDxfPhaseEZeroConnectAuthoringHandoffBlockerV1 = Readonly<{
  code:
    | PatternImportDxfPhaseEZeroConnectRowAdapterBlockerV1['code']
    | 'zero-connect-authoring-owner-unavailable'
    | 'zero-connect-authoring-owner-frozen'
    | 'zero-connect-authoring-write-refused';
  detail: string;
}>;

export type PatternImportDxfPhaseEZeroConnectAuthoringHandoffResultV1 =
  | Readonly<{
      ok: true;
      inserted: 0 | 1;
      historyKey: string;
      sessionRevision: number;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      inserted: 0;
      historyKey: null;
      sessionRevision: number | null;
      blocker: PatternImportDxfPhaseEZeroConnectAuthoringHandoffBlockerV1;
    }>;

export type PatternImportDxfPhaseEZeroConnectAuthoringHandoffOwnerV1 =
  | Readonly<{
      status: 'available';
      ingest: (
        request: PatternImportDxfPhaseEZeroConnectAuthoringHandoffRequestV1,
      ) => PatternImportDxfPhaseEZeroConnectAuthoringHandoffResultV1;
    }>
  | Readonly<{
      status: 'unavailable';
      blocker: PatternImportDxfPhaseEZeroConnectAuthoringHandoffBlockerV1;
    }>;
