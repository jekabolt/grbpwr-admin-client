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
 * A cached card session is only an authority after its detached Phase-E inputs validate. A stale,
 * partial or pre-reload session must not shadow the exact current saved DXF row.
 */
export function routePatternImportDxfPhaseECadTableZeroOperationSourceV1(
  fresh: PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1,
  saved: PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1,
): PatternImportDxfPhaseECadTableZeroOperationSourceRouteV1 {
  return fresh.ok
    ? Object.freeze({ mode: 'fresh' as const, choices: fresh })
    : Object.freeze({ mode: 'saved' as const, choices: saved });
}
