import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import type {
  PatternImportDxfPhaseECadTableZeroConnectCandidateV1,
  PatternImportDxfPhaseECadTableZeroConnectSessionV1,
} from './cad-table-zero-connect-session-v1';
import type { PatternImportDxfPhaseEZeroConnectRowAdapterBlockerV1 } from './cad-table-zero-connect-row-adapter-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_AUTHORING_HANDOFF_V1 =
  'pattern-import-dxf-phase-e-zero-connect-authoring-handoff/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_AUTHORING_HANDOFF_CLAIMS_V1 = Object.freeze({
  existingOperationsFieldIsSoleWriter: true,
  candidateAndCurrentSessionRequired: true,
  appendReceiptRequired: true,
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
      inserted: 1;
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
