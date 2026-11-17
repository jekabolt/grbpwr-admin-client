import type { PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1 } from './cad-table-zero-operation-fresh-preparation-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1 } from './cad-table-zero-operation-saved-preparation-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_SOURCE_ROUTING_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-operation-source-routing/1' as const;

export type PatternImportDxfPhaseECadTableZeroOperationSourceRouteV1 = Readonly<
  | {
      mode: 'fresh';
      choices: Extract<
        PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1,
        { ok: true }
      >;
    }
  | {
      mode: 'saved';
      choices: PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1;
    }
>;

/**
 * Populate the picker from the whole saved card. A session for one scope must not hide the other
 * saved scopes. The host decides which geometry to display after verifying the selected row.
 */
export function routePatternImportDxfPhaseECadTableZeroOperationSourceV1(
  fresh: PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1,
  saved: PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1,
): PatternImportDxfPhaseECadTableZeroOperationSourceRouteV1 {
  if (saved.ok) return Object.freeze({ mode: 'saved' as const, choices: saved });
  if (fresh.ok) return Object.freeze({ mode: 'fresh' as const, choices: fresh });
  return Object.freeze({ mode: 'saved' as const, choices: saved });
}

type PatternChoices = Pick<
  PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1,
  'ok' | 'techCardId' | 'choices'
>;

function selectedSizeId(choices: PatternChoices, scopeKey: string, sizeToken: string) {
  const scopes = choices.choices.filter((choice) => choice.scopeKey === scopeKey);
  if (scopes.length !== 1) return null;
  const sizes = scopes[0].sizes.filter((size) => size.sizeToken === sizeToken);
  return sizes.length === 1 && Number.isSafeInteger(sizes[0].sizeId) && sizes[0].sizeId > 0
    ? sizes[0].sizeId
    : null;
}

/** Checks the selected scope and dictionary size on both sides before preparing fresh geometry. */
export function hasMatchingFreshPatternChoiceV1(
  fresh: PatternChoices,
  available: PatternChoices,
  techCardId: number | null,
  scopeKey: string,
  sizeToken: string,
  sourceSurface?: 'explicit-native-drawn-sewing',
): boolean {
  if (
    sourceSurface ||
    !fresh.ok ||
    !available.ok ||
    fresh.techCardId !== techCardId ||
    available.techCardId !== techCardId
  )
    return false;
  const sizeId = selectedSizeId(available, scopeKey, sizeToken);
  return sizeId !== null && selectedSizeId(fresh, scopeKey, sizeToken) === sizeId;
}
