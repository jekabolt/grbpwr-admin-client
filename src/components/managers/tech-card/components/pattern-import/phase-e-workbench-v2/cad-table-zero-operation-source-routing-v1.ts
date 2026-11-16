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
 * The current saved DXF row is the durable authority for an existing card. A cached import session
 * is used only while no complete saved row exists yet (the just-imported, not-yet-saved case), so a
 * stale or partially reconstructed session can never shadow a card that already has its DXF.
 */
export function routePatternImportDxfPhaseECadTableZeroOperationSourceV1(
  fresh: PatternImportDxfPhaseECadTableZeroOperationFreshChoicesResultV1,
  saved: PatternImportDxfPhaseECadTableZeroOperationSavedChoicesResultV1,
): PatternImportDxfPhaseECadTableZeroOperationSourceRouteV1 {
  if (saved.ok) return Object.freeze({ mode: 'saved' as const, choices: saved });
  if (fresh.ok) return Object.freeze({ mode: 'fresh' as const, choices: fresh });
  return Object.freeze({ mode: 'saved' as const, choices: saved });
}
