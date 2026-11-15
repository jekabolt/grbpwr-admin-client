import { abortableAdminService } from 'api/api';
import {
  createPatternImportDxfProductCompositeSidecarStorageAdapterV3,
  type PatternImportDxfProductCompositeSidecarStorageAdapterV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';

export const PATTERN_IMPORT_DXF_PHASE_E_COMPOSITE_SIDECAR_PRODUCTION_PERSISTENCE_V3 =
  'pattern-import-dxf-phase-e-composite-sidecar-production-persistence/3' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_COMPOSITE_SIDECAR_PRODUCTION_PERSISTENCE_CLAIMS_V3 =
  Object.freeze({
    generatedRpcIntegrated: true,
    abortableAdminServiceIntegrated: true,
    compositeV3ConditionalPersistenceIntegrated: true,
    uiIntegrated: false,
    productionReady: false,
  } as const);

export type PatternImportDxfPhaseECompositeSidecarProductionPersistenceV3 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_COMPOSITE_SIDECAR_PRODUCTION_PERSISTENCE_V3;
  adapter: PatternImportDxfProductCompositeSidecarStorageAdapterV3;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_COMPOSITE_SIDECAR_PRODUCTION_PERSISTENCE_CLAIMS_V3;
}>;

export function createPatternImportDxfPhaseECompositeSidecarProductionPersistenceV3(
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): PatternImportDxfPhaseECompositeSidecarProductionPersistenceV3 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_COMPOSITE_SIDECAR_PRODUCTION_PERSISTENCE_V3,
    adapter: createPatternImportDxfProductCompositeSidecarStorageAdapterV3({
      createClient: (signal) => abortableAdminService(signal),
      crypto,
    }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_COMPOSITE_SIDECAR_PRODUCTION_PERSISTENCE_CLAIMS_V3,
  });
}
