import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductVerifiedSavedReplayV1 } from 'lib/cloth/domain/pattern-import-dxf-product-commit-replay-v1';
import type { DxfProductPhaseDSizeSelectionResultV1 } from 'lib/pattern-import/dxf-product-phase-d-size-selection-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { CardDraft } from 'lib/pattern-import/types';

import {
  isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1,
  type PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1,
} from './cad-table-zero-operation-generation-owner-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_PREPARED_AUTHORITY_V1 =
  'pattern-import-dxf-phase-e-zero-connect-prepared-authority/1' as const;

type SuccessfulSelection = Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>;

declare const preparedAuthorityBrand: unique symbol;
export type PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_PREPARED_AUTHORITY_V1;
  row: DxfProductSavedRowIdentityV1;
  catalogCanonicalSha256: string;
  sizeSelectionCanonicalSha256: string;
  sourceFileId: string;
  preparationGeneration: number;
  importGeneration: number;
  readonly [preparedAuthorityBrand]: never;
}>;

export type PatternImportDxfPhaseEZeroConnectPreparedAuthorityRefreshResultV1 =
  | Readonly<{
      ok: true;
      authority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
      preparationGeneration: number;
      importGeneration: number;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      authority: null;
      preparationGeneration: null;
      importGeneration: null;
      blocker: Readonly<{ code: 'fresh-saved-authority-unavailable'; detail: string }>;
    }>;

export type PatternImportDxfPhaseEZeroConnectRefreshLockV1 = 'current' | 'advanced';

export type PatternImportDxfPhaseEZeroConnectPreparedAuthorityRefreshOwnerV1 = Readonly<{
  refresh: (
    signal: AbortSignal,
    lock?: PatternImportDxfPhaseEZeroConnectRefreshLockV1,
  ) => Promise<PatternImportDxfPhaseEZeroConnectPreparedAuthorityRefreshResultV1>;
}>;

type PreparedAuthorityState = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  draft: CardDraft;
  selection: SuccessfulSelection;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  preparationGeneration: number;
  importGeneration: number;
  savedReplay?: PatternImportDxfProductVerifiedSavedReplayV1;
}>;

const authorityStates = new WeakMap<object, PreparedAuthorityState>();
const SHA256 = /^[0-9a-f]{64}$/;

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1): boolean {
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

/** Verifies WeakMap provenance without exposing the retained draft or Phase-D carrier. */
export function isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1(
  value: unknown,
): value is PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 {
  if (!value || typeof value !== 'object') return false;
  const authority = value as PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
  const state = authorityStates.get(value);
  return Boolean(
    state &&
      authority.schemaVersion === PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_PREPARED_AUTHORITY_V1 &&
      sameRow(authority.row, state.row) &&
      authority.catalogCanonicalSha256 === state.catalog.canonicalSha256 &&
      authority.sizeSelectionCanonicalSha256 === state.selection.selection.canonicalSha256 &&
      authority.sourceFileId === state.catalog.sourceFileId &&
      authority.preparationGeneration === state.preparationGeneration &&
      authority.importGeneration === state.importGeneration,
  );
}

export function readPatternImportDxfPhaseEZeroConnectCurrentSavedReplayV1(
  authority: PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
): Readonly<{
  draft: CardDraft;
  savedReplay: PatternImportDxfProductVerifiedSavedReplayV1;
}> | null {
  if (!isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1(authority)) return null;
  const state = authorityStates.get(authority);
  return state?.savedReplay ? { draft: state.draft, savedReplay: state.savedReplay } : null;
}

/**
 * Keeps the replay draft and selected Phase-D carrier private while an ordinary card save may
 * replace the preparation. The public token exposes only immutable exact bindings.
 */
export function capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1(
  input: Readonly<{
    row: DxfProductSavedRowIdentityV1;
    draft: CardDraft;
    selection: SuccessfulSelection;
    catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
    generation: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1;
    savedReplay?: PatternImportDxfProductVerifiedSavedReplayV1;
  }>,
): PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 | null {
  const { row, draft, selection, catalog, generation } = input;
  if (
    !row ||
    !draft ||
    !selection ||
    selection.ok !== true ||
    !catalog ||
    draft.techCardId !== row.techCardId ||
    catalog.techCardId !== row.techCardId ||
    catalog.scopeKey !== row.scopeKey ||
    catalog.sizeSelectionCanonicalSha256 !== selection.selection.canonicalSha256 ||
    catalog.sourceFileId !== selection.phaseD.source.sourceFileId ||
    selection.pipeline.contentBinding?.sourceSha256 !== row.sha256 ||
    !isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(generation) ||
    !SHA256.test(catalog.canonicalSha256) ||
    !SHA256.test(selection.selection.canonicalSha256)
  )
    return null;
  const token = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_PREPARED_AUTHORITY_V1,
    row: Object.freeze({ ...row }),
    catalogCanonicalSha256: catalog.canonicalSha256,
    sizeSelectionCanonicalSha256: selection.selection.canonicalSha256,
    sourceFileId: catalog.sourceFileId,
    preparationGeneration: generation.preparationGeneration,
    importGeneration: generation.importGeneration,
  }) as PatternImportDxfPhaseEZeroConnectPreparedAuthorityV1;
  authorityStates.set(
    token,
    Object.freeze({
      row: token.row,
      draft,
      selection,
      catalog,
      preparationGeneration: token.preparationGeneration,
      importGeneration: token.importGeneration,
      ...(input.savedReplay ? { savedReplay: input.savedReplay } : {}),
    }),
  );
  return token;
}
