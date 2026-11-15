import { abortableAdminService } from 'api/api';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  decodePatternImportDxfProductCompositeSidecarV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_CONTRACT_V1,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_RESULT_V1,
  createPatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1,
  type PatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1,
  type PatternImportDxfPhaseESavedAssemblyCompositeCodecContractV1,
} from './saved-assembly-authority-transport-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_RPC_BRIDGE_CLAIMS_V1,
  createPatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeV1,
  type PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeV1,
} from './saved-assembly-snapshot-rpc-bridge-v1';
import { createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1 } from './saved-assembly-topology-hash-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_PRODUCTION_RPC_V1 =
  'pattern-import-dxf-phase-e-saved-assembly-snapshot-production-rpc/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_PRODUCTION_RPC_CLAIMS_V1 =
  Object.freeze({
    ...PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_RPC_BRIDGE_CLAIMS_V1,
    generatedRpcIntegrated: true,
    compositeV3CodecIntegrated: true,
    clientDecodedExactCarrierAndSealReturned: true,
    serverDecodedExactCarrierTrusted: false,
    topologyHashContractIntegrated: true,
    authorityTransportAdapterIntegrated: true,
    // The bridge is production transport, but the workbench is not production-ready until the UI
    // composes it with the Composite V3 codec and saved-row preparation owner.
    productionReady: false,
  } as const);

export type PatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_PRODUCTION_RPC_V1;
  bridge: Omit<PatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeV1, 'claims'> &
    Readonly<{
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_PRODUCTION_RPC_CLAIMS_V1;
    }>;
  compositeCodecContract: PatternImportDxfPhaseESavedAssemblyCompositeCodecContractV1;
  authorityAdapter: PatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_PRODUCTION_RPC_CLAIMS_V1;
}>;

function cancelled(signal: AbortSignal): never {
  if (signal.aborted) throw new DOMException('Composite V3 decoding was cancelled.', 'AbortError');
  throw new TypeError('Composite V3 decoding failed.');
}

export function createPatternImportDxfPhaseESavedAssemblyProductionCompositeCodecV1(
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): PatternImportDxfPhaseESavedAssemblyCompositeCodecContractV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_CONTRACT_V1,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
    async decodeAndVerifyExactTopology(input, signal) {
      if (signal.aborted) cancelled(signal);
      if (input.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3)
        throw new TypeError('Composite V3 media type is required.');
      const decoded = await decodePatternImportDxfProductCompositeSidecarV3(input.bytes, crypto);
      if (signal.aborted) cancelled(signal);
      if (
        !decoded.ok ||
        !decoded.exactTopology ||
        decoded.seal.canonicalSha256 !== input.expectedSha256 ||
        decoded.seal.canonicalByteLength !== input.expectedByteLength
      )
        throw new TypeError('Composite V3 exact topology or outer seal is invalid.');
      const selectedOperation = decoded.exactTopology.carrier.bindings.selectedOperation;
      return Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_RESULT_V1,
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
        compositeCanonicalSha256: decoded.seal.canonicalSha256,
        compositeCanonicalByteLength: decoded.seal.canonicalByteLength,
        row: decoded.document.bindings.row,
        serverAssemblyRevision: decoded.document.bindings.serverAssemblyRevision,
        assemblyTopologySha256: decoded.document.bindings.assemblyTopologySha256,
        selectedOperation: Object.freeze({
          sourceOperationNumber: selectedOperation.sourceOperationNumber,
          seamIds: Object.freeze([...selectedOperation.seamIds]) as readonly [string, string],
        }),
        exactTopology: Object.freeze({
          carrier: decoded.exactTopology.carrier,
          seal: decoded.exactTopology.seal,
        }),
        exactTopologyCarrierVerified: true as const,
      });
    },
  });
}

/**
 * The only production binding for GetTechCardSavedAssemblySnapshot. A fresh generated client is
 * built over each caller's AbortSignal; no unabortable adminService or GetTechCard fallback exists.
 */
export function createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(
  selectedOperationNumber: number,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): PatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1 {
  const injected = createPatternImportDxfPhaseESavedAssemblySnapshotRpcBridgeV1({
    createClient: (signal) => abortableAdminService(signal),
    selectedOperationNumber,
  });
  const bridge = Object.freeze({
    schemaVersion: injected.schemaVersion,
    readSavedAssemblySnapshot: injected.readSavedAssemblySnapshot,
    readAuthoritativeRow: injected.readAuthoritativeRow,
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_PRODUCTION_RPC_CLAIMS_V1,
  });
  const compositeCodecContract =
    createPatternImportDxfPhaseESavedAssemblyProductionCompositeCodecV1(crypto);
  const authorityAdapter = createPatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1({
    readSavedAssemblySnapshot: bridge.readSavedAssemblySnapshot,
    topologyHashContract: createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1(crypto),
    compositeCodecContract,
  });
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_PRODUCTION_RPC_V1,
    bridge,
    compositeCodecContract,
    authorityAdapter,
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_SNAPSHOT_PRODUCTION_RPC_CLAIMS_V1,
  });
}
