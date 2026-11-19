import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import type { PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1 } from './cad-table-zero-operation-fresh-preparation-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1 } from './cad-table-zero-operation-saved-preparation-v1';
import { isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1 } from './cad-table-zero-connect-phase-e-authority-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_AUTHORITY_REBIND_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-operation-authority-rebind/1' as const;

type FreshPrepared = Extract<
  PatternImportDxfPhaseECadTableZeroOperationFreshPreparationResultV1,
  { ok: true }
>;
type SavedPrepared = Extract<
  PatternImportDxfPhaseECadTableZeroOperationSavedPreparationResultV1,
  { ok: true }
>;

export type PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1 = Readonly<{
  source: 'fresh-card-session' | 'saved-row-preparation';
  savedRank?: SavedPrepared['authoringAuthority']['selectedRank'];
  techCardId: number;
  scopeKey: string;
  sizeToken: string;
  catalogCanonicalSha256: string;
  sizeSelectionCanonicalSha256: string;
  sourceFileId: string;
  sourceSha256: string;
  row: DxfProductSavedRowIdentityV1;
  importGeneration: number;
}>;

export type PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindResultV1 =
  | Readonly<{
      ok: true;
      expectation: PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      expectation: null;
      blocker: Readonly<{
        code: 'fresh-saved-identity-mismatch' | 'saved-refresh-identity-mismatch';
        detail: string;
      }>;
    }>;

function blocked(
  code: 'fresh-saved-identity-mismatch' | 'saved-refresh-identity-mismatch',
  detail: string,
): PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindResultV1 {
  return Object.freeze({
    ok: false as const,
    expectation: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function stableSavedBindingMatches(
  expected: PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1,
  saved: SavedPrepared,
): boolean {
  const row = saved.authoringAuthority.row;
  return (
    isPatternImportDxfPhaseEZeroConnectPreparedAuthorityV1(saved.authoringAuthority) &&
    saved.techCardId === expected.techCardId &&
    saved.scopeKey === expected.scopeKey &&
    saved.sizeToken === expected.sizeToken &&
    (!expected.savedRank ||
      (expected.savedRank.sizeId === saved.authoringAuthority.selectedRank.sizeId &&
        expected.savedRank.spellings.length ===
          saved.authoringAuthority.selectedRank.spellings.length &&
        expected.savedRank.spellings.every(
          (spelling, index) => spelling === saved.authoringAuthority.selectedRank.spellings[index],
        ))) &&
    saved.catalog.canonicalSha256 === expected.catalogCanonicalSha256 &&
    saved.catalog.sizeSelectionCanonicalSha256 === expected.sizeSelectionCanonicalSha256 &&
    saved.catalog.sourceFileId === expected.sourceFileId &&
    saved.authoringAuthority.catalogCanonicalSha256 === expected.catalogCanonicalSha256 &&
    saved.authoringAuthority.sizeSelectionCanonicalSha256 ===
      expected.sizeSelectionCanonicalSha256 &&
    saved.authoringAuthority.sourceFileId === expected.sourceFileId &&
    row.techCardId === expected.row.techCardId &&
    row.scopeKey === expected.row.scopeKey &&
    row.patternLineKey === expected.row.patternLineKey &&
    row.revision === expected.row.revision &&
    row.url === expected.row.url &&
    row.sizeBytes === expected.row.sizeBytes &&
    row.sha256 === expected.sourceSha256 &&
    row.sha256 === expected.row.sha256 &&
    row.cardLockVersion >= expected.row.cardLockVersion
  );
}

/** Binds a fresh CardSession to the exact saved row produced by the ordinary card save. */
export function bindPatternImportDxfPhaseECadTableZeroOperationFreshToSavedAuthorityV1(
  fresh: FreshPrepared,
  saved: SavedPrepared,
): PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindResultV1 {
  const sourceSha256 = fresh.selection.selection.pipeline.contentBinding?.sourceSha256 ?? '';
  const expected = Object.freeze({
    source: 'fresh-card-session' as const,
    techCardId: fresh.techCardId,
    scopeKey: fresh.scopeKey,
    sizeToken: fresh.sizeToken,
    catalogCanonicalSha256: fresh.catalog.canonicalSha256,
    sizeSelectionCanonicalSha256: fresh.catalog.sizeSelectionCanonicalSha256,
    sourceFileId: fresh.catalog.sourceFileId,
    sourceSha256,
    row: saved.authoringAuthority.row,
    importGeneration: fresh.importGeneration,
  });
  if (
    !sourceSha256 ||
    saved.importGeneration !== fresh.importGeneration ||
    saved.authoringAuthority.importGeneration !== fresh.importGeneration ||
    !stableSavedBindingMatches(expected, saved)
  )
    return blocked(
      'fresh-saved-identity-mismatch',
      'The saved DXF row does not exactly match the fresh CardSession source, scope, size and catalog.',
    );
  return Object.freeze({ ok: true as const, expectation: expected, blocker: null });
}

/** Captures the immutable row/catalog identity which an ordinary-save refresh may rebind. */
export function capturePatternImportDxfPhaseECadTableZeroOperationSavedRebindExpectationV1(
  saved: SavedPrepared,
): PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1 {
  return Object.freeze({
    source: 'saved-row-preparation' as const,
    savedRank: saved.authoringAuthority.selectedRank,
    techCardId: saved.techCardId,
    scopeKey: saved.scopeKey,
    sizeToken: saved.sizeToken,
    catalogCanonicalSha256: saved.catalog.canonicalSha256,
    sizeSelectionCanonicalSha256: saved.catalog.sizeSelectionCanonicalSha256,
    sourceFileId: saved.catalog.sourceFileId,
    sourceSha256: saved.authoringAuthority.row.sha256,
    row: saved.authoringAuthority.row,
    importGeneration: saved.importGeneration,
  });
}

/** Refuses nearest-row, source, hash or catalog drift after an ordinary save. */
export function verifyPatternImportDxfPhaseECadTableZeroOperationSavedAuthorityRefreshV1(
  expected: PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindExpectationV1,
  refreshed: SavedPrepared,
): PatternImportDxfPhaseECadTableZeroOperationAuthorityRebindResultV1 {
  if (
    !stableSavedBindingMatches(expected, refreshed) ||
    (expected.source === 'fresh-card-session' &&
      (refreshed.importGeneration !== expected.importGeneration ||
        refreshed.authoringAuthority.importGeneration !== expected.importGeneration))
  )
    return blocked(
      'saved-refresh-identity-mismatch',
      'The refreshed saved DXF authority drifted from the exact source row or authoring catalog.',
    );
  return Object.freeze({ ok: true as const, expectation: expected, blocker: null });
}
