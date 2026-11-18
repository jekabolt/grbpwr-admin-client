import { abortableAdminService } from 'api/api';
import type { AdminService, TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
  type PatternImportDxfProductCompositeSidecarBindingsV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { decodePatternImportDxfProductMultiseamPlacementSidecarV2 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';
import type {
  DxfProductSavedReprocessResultV1,
  DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import type { PatternImportDxfPhaseEZeroConnectPendingHandoffV1 } from './cad-table-zero-connect-post-save-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
  readPatternImportDxfProductExactNSeamRestorePatchV2,
  restorePatternImportDxfProductCompositeSidecarDurableV4,
  type PatternImportDxfProductCompositeSidecarDurableReadbackV4,
  type PatternImportDxfProductExactNSeamRestoreOwnerV2,
} from './composite-sidecar-restore-authority-v4';
import type { PatternImportDxfProductCompositeSidecarApplicationTransactionV4 } from './composite-sidecar-production-transaction-v4';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4 } from './composite-sidecar-persistence-v4';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_REQUEST_V4 } from './composite-sidecar-transaction-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
  buildPatternImportDxfProductCompositeSidecarV4,
  decodePatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductExactNSeamComponentV4,
} from './composite-sidecar-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
  decodePatternImportDxfProductCompositeSidecarV5,
} from './composite-sidecar-v5';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
  decodePatternImportDxfProductCompositeSidecarV6,
} from './composite-sidecar-v6';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
  decodePatternImportDxfProductCompositeSidecarV7,
} from './composite-sidecar-v7';
import {
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_REQUEST_V2,
  applyPatternImportDxfProductExactNSeamUiSelectionV2,
  createPatternImportDxfProductExactNSeamInitialUiStateV2,
} from './exact-n-seam-atomic-ui-selection-v2';
import { PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2 } from './exact-n-seam-authority-gap-v2';
import { buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2 } from './exact-n-seam-consistency-carrier-v2';
import type { PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 } from './exact-n-seam-production-mount-v2';
import { publishPatternImportDxfProductExactNSeamDurableReloadSessionV2 } from './exact-n-seam-production-session-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PREPARED_PROPOSAL_V3,
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_REQUEST_V2,
  projectPatternImportDxfProductExactNSeamSavedCardV2,
} from './exact-n-seam-saved-card-projection-v2';
import type {
  PatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1,
  PatternImportDxfPhaseESavedAssemblyCurrentTopologyV1,
} from './saved-assembly-authority-transport-v1';
import {
  readCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';
import {
  isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1,
  resolveSavedAssemblyNativeDirectedIntervalsV1,
} from './saved-assembly-native-directed-intervals-v1';
import { computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1 } from './saved-assembly-topology-hash-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_COMPOSITE_V4 =
  'pattern-import-dxf-phase-e-zero-connect-durable-composite/4' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1 =
  'pattern-import-dxf-phase-e-zero-connect-durable-persist-request/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1 =
  'pattern-import-dxf-phase-e-zero-connect-durable-restore-request/1' as const;

const OPERATION_BINDING_DOMAIN =
  'pattern-import-dxf-phase-e-zero-connect-composite-operation-binding/1';
const PLAN_BINDING_DOMAIN = 'pattern-import-dxf-phase-e-zero-connect-exact-plan/1';
const MAX_SIDECAR_BYTES = 4 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;

class DurableBridgeFailure extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
    this.name = 'PatternImportDxfPhaseEZeroConnectDurableBridgeFailureV1';
  }
}

type CompletedPending = Extract<
  PatternImportDxfPhaseEZeroConnectPendingHandoffV1,
  { status: 'in-memory-final-seam-attached-awaiting-second-save' }
>;

type SidecarService = Pick<
  AdminService,
  'GetTechCardPatternSemanticSidecar' | 'PutTechCardPatternSemanticSidecar'
>;

export type PatternImportDxfPhaseEZeroConnectDurableBridgeDepsV1 = Readonly<{
  authorityAdapter: Pick<
    PatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1,
    'readCurrentAssemblyTopology'
  >;
  application: Pick<PatternImportDxfProductCompositeSidecarApplicationTransactionV4, 'transaction'>;
  createClient: (signal: AbortSignal) => SidecarService;
  readCompleteSource?: (
    row: DxfProductSavedRowIdentityV1,
    expectedServerAssemblyRevision: string,
    signal: AbortSignal,
  ) => Promise<CompleteSavedAssemblySourceV1>;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

export type PatternImportDxfPhaseEZeroConnectDurablePersistRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1;
  pending: CompletedPending;
  row: DxfProductSavedRowIdentityV1;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_LINKED_N1_DURABLE_REQUEST_V1 =
  'pattern-import-dxf-phase-e-linked-n1-durable-request/1' as const;

export type PatternImportDxfPhaseELinkedN1DurableRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_LINKED_N1_DURABLE_REQUEST_V1;
  row: DxfProductSavedRowIdentityV1;
  selectedOperationNumber: number;
  seamKey: string;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  /** The exact two sides submitted to the existing V1 authoring owner. */
  sides: readonly [
    Omit<ExactSide, 'seamId' | 'sideIndex'>,
    Omit<ExactSide, 'seamId' | 'sideIndex'>,
  ];
  verifiedSemanticSha256: string;
}>;

export type PatternImportDxfPhaseEZeroConnectDurableRestoreRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1;
  row: DxfProductSavedRowIdentityV1;
  selectedOperationNumber: number;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
}>;

export type PatternImportDxfPhaseESavedNativeExactNReadV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  selectedOperationNumber: number;
  sizeToken: string;
  replay: DxfProductSavedReprocessResultV1;
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_NATIVE_EXACT_N_CONFIRM_V1 =
  'pattern-import-dxf-phase-e-saved-native-exact-n-confirm/1' as const;

export type PatternImportDxfPhaseESavedNativeExactNConfirmV1 =
  PatternImportDxfPhaseESavedNativeExactNReadV1 &
    Readonly<{
      schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_NATIVE_EXACT_N_CONFIRM_V1;
      mapping: 'equal';
      lengthRatio: 1;
      expectedCatalogCanonicalSha256: string;
      expectedIntervalReceiptSha256: string;
      verifiedSemanticSha256: string;
    }>;

export type PatternImportDxfPhaseEZeroConnectDurableResultV1 =
  | Readonly<{
      ok: true;
      session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2;
      compositeOperationBindingId: string;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      session: null;
      compositeOperationBindingId: null;
      blocker: Readonly<{ code: string; detail: string }>;
    }>;

type CurrentSidecar = Readonly<{
  mediaType: string;
  sha256: string;
  byteLength: number;
  bytes: Uint8Array<ArrayBuffer>;
}>;

type ExactSide = Readonly<{
  seamId: string;
  sideIndex: 0 | 1;
  pieceId: string;
  pieceLineKey: string;
  contourId: string;
  boundaryVertexIds: readonly [string, string];
  direction: 'forward' | 'reverse';
}>;

function blocked(code: string, detail: string): PatternImportDxfPhaseEZeroConnectDurableResultV1 {
  return Object.freeze({
    ok: false as const,
    session: null,
    compositeOperationBindingId: null,
    blocker: Object.freeze({ code, detail: detail.slice(0, 2_048) }),
  });
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameExactSides(left: readonly ExactSide[], right: readonly ExactSide[]): boolean {
  return (
    left.length === right.length &&
    left.every((side, index) => {
      const candidate = right[index];
      return (
        candidate?.seamId === side.seamId &&
        candidate.sideIndex === side.sideIndex &&
        candidate.pieceId === side.pieceId &&
        candidate.pieceLineKey === side.pieceLineKey &&
        candidate.contourId === side.contourId &&
        sameOrdered(candidate.boundaryVertexIds, side.boundaryVertexIds) &&
        candidate.direction === side.direction
      );
    })
  );
}

function sameSourceRow(
  left: DxfProductSavedRowIdentityV1,
  right: DxfProductSavedRowIdentityV1,
): boolean {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

function decodeBase64(value: unknown, expectedLength: number): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== 'string' ||
    !value ||
    !Number.isSafeInteger(expectedLength) ||
    expectedLength < 1 ||
    expectedLength > MAX_SIDECAR_BYTES
  )
    throw new TypeError('Current sidecar bytes are invalid.');
  const binary = atob(value);
  if (binary.length !== expectedLength) throw new TypeError('Current sidecar byte length changed.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readCurrentSidecar(
  deps: PatternImportDxfPhaseEZeroConnectDurableBridgeDepsV1,
  row: DxfProductSavedRowIdentityV1,
  signal: AbortSignal,
): Promise<CurrentSidecar> {
  const response = await deps.createClient(signal).GetTechCardPatternSemanticSidecar({
    techCardId: row.techCardId,
    patternLineKey: row.patternLineKey,
  });
  if (signal.aborted) throw new DOMException('Durable sidecar read was cancelled.', 'AbortError');
  const current = response.semanticSidecar;
  if (
    !current ||
    current.techCardId !== row.techCardId ||
    current.patternLineKey !== row.patternLineKey ||
    current.dxfSha256 !== row.sha256 ||
    current.savedRowRevision !== row.revision ||
    current.cardLockVersion !== row.cardLockVersion ||
    typeof current.mediaType !== 'string' ||
    !current.mediaType ||
    typeof current.sidecarSha256 !== 'string' ||
    !SHA256.test(current.sidecarSha256) ||
    !Number.isSafeInteger(current.byteLength)
  )
    throw new TypeError('Current semantic sidecar does not match the fresh saved-DXF row.');
  const bytes = decodeBase64(current.sidecarBytes, current.byteLength as number);
  return Object.freeze({
    mediaType: current.mediaType,
    sha256: current.sidecarSha256,
    byteLength: bytes.byteLength,
    bytes,
  });
}

async function durableBindings(
  input: Readonly<{
    row: DxfProductSavedRowIdentityV1;
    operationNumber: number;
    inputKeys: readonly string[];
    seamIds: readonly string[];
    catalogCanonicalSha256: string;
    mapping: 'equal';
    lengthRatio: 1;
    sides: readonly ExactSide[];
  }>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  const compositeOperationBindingSha256 =
    await computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1(
      OPERATION_BINDING_DOMAIN,
      {
        techCardId: input.row.techCardId,
        scopeKey: input.row.scopeKey,
        patternLineKey: input.row.patternLineKey,
        savedRowRevision: input.row.revision,
        dxfSha256: input.row.sha256,
        operationNumber: input.operationNumber,
        orderedInputKeys: input.inputKeys,
        orderedSeamKeys: input.seamIds,
      },
      crypto,
    );
  const phaseEAggregatePlanSha256 =
    await computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1(
      PLAN_BINDING_DOMAIN,
      {
        catalogCanonicalSha256: input.catalogCanonicalSha256,
        mapping: input.mapping,
        lengthRatio: input.lengthRatio,
        orderedSides: input.sides,
      },
      crypto,
    );
  return Object.freeze({
    compositeOperationBindingId: `zero-connect-binding-v1:${compositeOperationBindingSha256}`,
    phaseEAggregatePlanSha256,
  });
}

type ExactCurrent = Parameters<
  typeof restorePatternImportDxfProductCompositeSidecarDurableV4
>[0]['current'];

async function readCurrentSavedNativeExactN(
  deps: PatternImportDxfPhaseEZeroConnectDurableBridgeDepsV1,
  request: PatternImportDxfPhaseESavedNativeExactNReadV1,
  signal: AbortSignal,
  crypto: Pick<Crypto, 'subtle'> | undefined,
  expectedCatalogCanonicalSha256?: string,
) {
  const { selectedOperationNumber, replay, sizeToken } = request;
  const row = Object.freeze({ ...request.row });
  if (!deps.readCompleteSource)
    throw new DurableBridgeFailure(
      'durable-native-complete-source-unavailable',
      'Saved native exact N requires the verified complete Assembly source.',
    );
  const topology: PatternImportDxfPhaseESavedAssemblyCurrentTopologyV1 =
    await deps.authorityAdapter.readCurrentAssemblyTopology(
      { row, selectedOperationNumber },
      signal,
    );
  const operation = topology.topology.operations.find(
    ({ number }) => number === selectedOperationNumber,
  );
  if (
    !sameSourceRow(topology.row, row) ||
    topology.row.cardLockVersion !== row.cardLockVersion ||
    topology.selectedOperationNumber !== selectedOperationNumber ||
    !operation ||
    operation.seamKeys.length <= 2 ||
    operation.inputKeys.length !== 2
  )
    throw new DurableBridgeFailure(
      'durable-native-operation-binding-mismatch',
      'Select a saved two-piece Assembly operation with more than two exact seams.',
    );
  const source = await deps.readCompleteSource(row, topology.serverAssemblyRevision, signal);
  const fullOperation = source.operations.find(
    ({ operationNumber }) => operationNumber === selectedOperationNumber,
  );
  if (
    source.serverAssemblyRevision !== topology.serverAssemblyRevision ||
    !fullOperation ||
    !sameOrdered(fullOperation.seamKeys ?? [], operation.seamKeys) ||
    !sameOrdered(fullOperation.inputKeys ?? [], operation.inputKeys)
  )
    throw new DurableBridgeFailure(
      'durable-native-operation-binding-mismatch',
      'The complete saved source and selected Assembly topology have changed.',
    );
  const ratio = fullOperation.stitching?.fullnessRatio?.value;
  if (typeof ratio !== 'string' || !/^1(?:\.0+)?$/.test(ratio))
    throw new DurableBridgeFailure(
      'durable-native-equal-ratio-unavailable',
      'The current saved Assembly operation must explicitly record a fullness ratio of 1.',
    );

  const interpreted = await resolveSavedAssemblyNativeDirectedIntervalsV1(
    {
      source,
      expectedRow: row,
      replay,
      operationNumber: selectedOperationNumber,
      sizeToken,
      expectedCatalogCanonicalSha256,
    },
    signal,
  );
  if (!interpreted.ok)
    throw new DurableBridgeFailure(
      interpreted.blocker.code,
      'The saved native interval could not be uniquely verified.',
    );
  if (!isVerifiedSavedAssemblyNativeDirectedIntervalReceiptV1(interpreted.receipt))
    throw new DurableBridgeFailure(
      'durable-native-interval-proof-stale',
      'The current saved native interval read generation has ended.',
    );
  const { catalog, receipt } = interpreted;
  if (
    receipt.orderedSeams.some(
      ({ sides }) =>
        !sameOrdered(
          sides.map(({ pieceLineKey }) => pieceLineKey),
          operation.inputKeys,
        ),
    )
  )
    throw new DurableBridgeFailure(
      'durable-native-operation-binding-mismatch',
      'Every saved native interval pair must follow the operation’s ordered piece inputs.',
    );
  const sides: readonly ExactSide[] = Object.freeze(
    receipt.orderedSeams.flatMap(({ seamKey, seamDirection, sides }) =>
      sides.map(
        (side, index): ExactSide =>
          Object.freeze({
            seamId: seamKey,
            sideIndex: index === 0 ? 0 : 1,
            pieceId: side.pieceId,
            pieceLineKey: side.pieceLineKey,
            contourId: side.contourId,
            boundaryVertexIds: side.boundaryVertexIds,
            direction:
              index === 1 && seamDirection === 'reversed'
                ? side.direction === 'forward'
                  ? 'reverse'
                  : 'forward'
                : side.direction,
          }),
      ),
    ),
  );
  const derived = await durableBindings(
    {
      row,
      operationNumber: selectedOperationNumber,
      inputKeys: operation.inputKeys,
      seamIds: operation.seamKeys,
      catalogCanonicalSha256: catalog.canonicalSha256,
      mapping: 'equal',
      lengthRatio: 1,
      sides,
    },
    crypto,
  );
  signal.throwIfAborted();
  const current: ExactCurrent = Object.freeze({
    row,
    serverAssemblyRevision: topology.serverAssemblyRevision,
    assemblyTopologySha256: topology.assemblyTopologySha256,
    selectedOperation: Object.freeze({
      sourceOperationNumber: selectedOperationNumber,
      authoringOperationId: derived.compositeOperationBindingId,
      localOperationOrder: 0,
      seamIds: Object.freeze([...operation.seamKeys]),
    }),
    catalogCanonicalSha256: catalog.canonicalSha256,
    phaseEAggregatePlanSha256: derived.phaseEAggregatePlanSha256,
  });
  return {
    current,
    catalog,
    receipt,
    sides,
    priorCarrierSha256: source.priorCarrier?.sidecarSha256,
  };
}

async function preserveComponents(
  current: CurrentSidecar,
  currentAuthority: PatternImportDxfProductCompositeSidecarBindingsV3,
  crypto: Pick<Crypto, 'subtle'> | undefined,
) {
  if (current.mediaType === PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1) {
    const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(
      current.bytes,
      crypto,
    );
    if (!decoded.ok || decoded.compatibility !== 'legacy-v1-no-placement')
      throw new TypeError('Current semantic-product-v1 sidecar is invalid.');
    return Object.freeze({
      semanticV1: current.bytes.slice(),
      placementV2: null,
      placementV3: null,
    });
  }
  if (current.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3)
    throw new TypeError('A new exact connection requires current semantic V1 or Composite V3.');
  const decoded = await decodePatternImportDxfProductCompositeSidecarV3(current.bytes, crypto);
  if (!decoded.ok || !sameSourceRow(decoded.document.bindings.row, currentAuthority.row))
    throw new TypeError('Current Composite V3 source binding is stale.');
  if (decoded.exactTopology)
    throw new DurableBridgeFailure(
      'durable-existing-v3-exact-conflict',
      'This saved DXF row already carries the exact two-seam Composite V3 topology. The N=1 bridge will not erase it; a lossless multi-operation container is required.',
    );
  const semanticV1 = readPatternImportDxfProductCompositeComponentBytesV3(
    decoded.owner,
    'semantic-product-v1',
  );
  if (!semanticV1) throw new TypeError('Current Composite V3 has no semantic V1 component.');
  return Object.freeze({
    semanticV1,
    placementV2: readPatternImportDxfProductCompositeComponentBytesV3(
      decoded.owner,
      'multiseam-placement-v2',
    ),
    placementV3: readPatternImportDxfProductCompositeComponentBytesV3(
      decoded.owner,
      'multiseam-placement-v3',
    ),
  });
}

async function writeDurableExactPlan(
  deps: PatternImportDxfPhaseEZeroConnectDurableBridgeDepsV1,
  current: ExactCurrent,
  previousSidecarSha256: string,
  preserved: Awaited<ReturnType<typeof preserveComponents>>,
  exactBytes: Uint8Array<ArrayBuffer>,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  crypto: Pick<Crypto, 'subtle'> | undefined,
  signal: AbortSignal,
) {
  const currentAuthority = Object.freeze({
    row: current.row,
    serverAssemblyRevision: current.serverAssemblyRevision,
    assemblyTopologySha256: current.assemblyTopologySha256,
  });
  const nested = await buildPatternImportDxfProductCompositeSidecarV3(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: currentAuthority,
      expectedPreviousSidecarSha256: previousSidecarSha256,
      semanticProductV1Bytes: preserved.semanticV1,
      placementV2Bytes: preserved.placementV2,
      placementV3Bytes: preserved.placementV3,
      exactTopologyBytes: null,
    },
    crypto,
  );
  if (!nested.ok) return blocked('durable-nested-v3-blocked', nested.blockers[0].detail);
  const nestedBytes = encodePatternImportDxfProductCompositeSidecarV3(nested.owner);
  if (!nestedBytes.ok || !nestedBytes.bytes)
    return blocked('durable-nested-v3-blocked', 'Nested Composite V3 encoding failed.');
  const next = await buildPatternImportDxfProductCompositeSidecarV4(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
      bindings: currentAuthority,
      expectedPreviousSidecarSha256: previousSidecarSha256,
      compositeV3Bytes: nestedBytes.bytes,
      exactNSeamConsistencyBytes: exactBytes,
    },
    crypto,
  );
  if (!next.ok) return blocked('durable-composite-v4-blocked', next.blockers[0].detail);
  const transaction = await deps.application.transaction.execute(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_REQUEST_V4,
      current,
      storage: {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4,
        currentAuthority,
        nextOwner: next.owner,
      },
    },
    signal,
  );
  if (!transaction.ok)
    return blocked('durable-transaction-blocked', transaction.blockers[0].detail);
  return createSession(transaction.owner, catalog, true, signal);
}

async function createSession(
  restoreOwner: PatternImportDxfProductExactNSeamRestoreOwnerV2,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  publish: boolean,
  signal: AbortSignal,
): Promise<PatternImportDxfPhaseEZeroConnectDurableResultV1> {
  if (signal.aborted)
    return blocked('durable-session-cancelled', 'Exact-N session publication was cancelled.');
  const patch = readPatternImportDxfProductExactNSeamRestorePatchV2(restoreOwner);
  if (!patch)
    return blocked('durable-restore-owner-invalid', 'Exact-N restore authority is absent.');
  const preparedProposal = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PREPARED_PROPOSAL_V3,
    status: 'current-saved-card-proposal' as const,
    expectedCatalogCanonicalSha256: patch.bindings.catalogCanonicalSha256,
    phaseEAggregatePlanSha256: patch.bindings.phaseEAggregatePlanSha256,
    operation: patch.bindings.selectedOperation,
    seams: Object.freeze(
      patch.seams.map((seam) =>
        Object.freeze({
          seamId: seam.seamId,
          sides: Object.freeze(
            seam.sides.map((side) =>
              Object.freeze({
                pieceId: side.pieceId,
                pieceLineKey: side.pieceLineKey,
                requiredDirection: side.direction,
              }),
            ),
          ) as unknown as readonly [
            Readonly<{
              pieceId: string;
              pieceLineKey: string;
              requiredDirection: 'forward' | 'reverse';
            }>,
            Readonly<{
              pieceId: string;
              pieceLineKey: string;
              requiredDirection: 'forward' | 'reverse';
            }>,
          ],
        }),
      ),
    ),
  });
  const projection = await projectPatternImportDxfProductExactNSeamSavedCardV2({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_REQUEST_V2,
    restoreOwner,
    catalog,
    preparedProposal,
  });
  if (!projection.ok) return blocked('durable-projection-blocked', projection.blockers[0].detail);
  const initial = createPatternImportDxfProductExactNSeamInitialUiStateV2(projection.owner);
  if (!initial)
    return blocked('durable-ui-state-blocked', 'Exact-N initial UI state is unavailable.');
  const selected = applyPatternImportDxfProductExactNSeamUiSelectionV2({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_UI_SELECTION_REQUEST_V2,
    projectionOwner: projection.owner,
    current: patch.bindings,
    currentState: initial,
  });
  if (!selected.ok) return blocked('durable-ui-selection-blocked', selected.blockers[0].detail);
  if (signal.aborted)
    return blocked('durable-session-cancelled', 'Exact-N session publication was cancelled.');
  const session = Object.freeze({
    selectionOwner: selected.owner,
    current: patch.bindings,
  });
  if (
    publish &&
    !publishPatternImportDxfProductExactNSeamDurableReloadSessionV2(session, restoreOwner)
  )
    return blocked(
      'durable-session-publication-blocked',
      'Exact-N production session was refused.',
    );
  return Object.freeze({
    ok: true as const,
    session,
    compositeOperationBindingId: patch.bindings.selectedOperation.authoringOperationId,
    blocker: null,
  });
}

export function createPatternImportDxfPhaseEZeroConnectDurableBridgeV1(
  deps: PatternImportDxfPhaseEZeroConnectDurableBridgeDepsV1,
) {
  const crypto = deps.crypto ?? globalThis.crypto;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_COMPOSITE_V4,
    async persistSavedNativeExactN(
      request: PatternImportDxfPhaseESavedNativeExactNConfirmV1,
      signal: AbortSignal,
    ): Promise<PatternImportDxfPhaseEZeroConnectDurableResultV1> {
      try {
        signal.throwIfAborted();
        const {
          expectedCatalogCanonicalSha256,
          expectedIntervalReceiptSha256,
          verifiedSemanticSha256,
        } = request;
        if (
          request.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_SAVED_NATIVE_EXACT_N_CONFIRM_V1 ||
          request.mapping !== 'equal' ||
          request.lengthRatio !== 1 ||
          !SHA256.test(expectedCatalogCanonicalSha256) ||
          !SHA256.test(expectedIntervalReceiptSha256) ||
          !SHA256.test(verifiedSemanticSha256)
        )
          return blocked(
            'durable-native-confirm-invalid',
            'Confirm explicit Equal mapping, ratio 1 and the current semantic attachment.',
          );
        const { current, catalog, receipt, sides, priorCarrierSha256 } =
          await readCurrentSavedNativeExactN(
            deps,
            request,
            signal,
            crypto,
            expectedCatalogCanonicalSha256,
          );
        if (receipt.canonicalSha256 !== expectedIntervalReceiptSha256)
          return blocked(
            'durable-native-confirm-source-moved',
            'The saved Assembly source or exact spans changed since the confirmation was prepared.',
          );
        if (!priorCarrierSha256)
          return blocked(
            'durable-native-semantic-missing',
            'Attach verified semantic V1 to this current row before saving the exact connection.',
          );
        const previous = await readCurrentSidecar(deps, current.row, signal);
        if (previous.sha256 !== priorCarrierSha256)
          return blocked(
            'durable-native-carrier-moved',
            'The semantic attachment changed after the fresh Assembly read.',
          );
        if (
          previous.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 &&
          previous.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3
        )
          return blocked(
            'durable-native-carrier-conflict',
            'The existing exact or unsupported attachment cannot be replaced. Restore any saved exact connection.',
          );
        const preserved = await preserveComponents(previous, current, crypto);
        const digest = await crypto?.subtle.digest('SHA-256', preserved.semanticV1);
        const observed =
          digest &&
          Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        if (observed !== verifiedSemanticSha256)
          return blocked(
            'durable-verified-semantic-mismatch',
            'The exact saved row no longer has the confirmed semantic V1 attachment.',
          );

        const exact = await buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2,
            status: 'untrusted-authority-candidate',
            ...current,
            sides,
          },
          { crypto },
        );
        if (!exact.ok) return blocked('durable-exact-carrier-blocked', exact.blockers[0].detail);
        const encoded = await encodePatternImportDxfProductExactNSeamComponentV4(
          { carrier: exact.carrier, seal: exact.seal },
          crypto,
        );
        if (!encoded.ok) return blocked('durable-exact-component-blocked', encoded.blocker.detail);
        return await writeDurableExactPlan(
          deps,
          current,
          previous.sha256,
          preserved,
          encoded.bytes,
          catalog,
          crypto,
          signal,
        );
      } catch (error) {
        if (signal.aborted)
          return blocked('durable-persist-cancelled', 'Exact native persistence was cancelled.');
        if (error instanceof DurableBridgeFailure) return blocked(error.code, error.message);
        return blocked(
          'durable-persist-failed',
          error instanceof Error ? error.message : 'Exact native persistence failed.',
        );
      }
    },
    async restoreSavedNativeExactN(
      request: PatternImportDxfPhaseESavedNativeExactNReadV1,
      signal: AbortSignal,
    ): Promise<PatternImportDxfPhaseEZeroConnectDurableResultV1> {
      try {
        signal.throwIfAborted();
        const { current, catalog, sides, priorCarrierSha256 } = await readCurrentSavedNativeExactN(
          deps,
          request,
          signal,
          crypto,
        );
        if (!priorCarrierSha256)
          return blocked(
            'durable-restore-sidecar-missing',
            'The current row has no exact composite attachment.',
          );
        const readback = await readCurrentSidecar(deps, current.row, signal);
        if (priorCarrierSha256 !== readback.sha256)
          return blocked(
            'durable-native-carrier-moved',
            'The exact attachment changed after the fresh Assembly read.',
          );
        const { mediaType } = readback;
        if (
          mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 &&
          mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 &&
          mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 &&
          mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7
        )
          return blocked(
            'durable-restore-sidecar-missing',
            'The current row has no durable Composite V4–V7 exact operation.',
          );
        const restored = await restorePatternImportDxfProductCompositeSidecarDurableV4(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
            current,
            readback: {
              ...readback,
              mediaType,
              status: 'present',
              source: 'fresh-current-sidecar-get',
            },
          },
          crypto,
        );
        if (!restored.ok)
          return blocked('durable-restore-authority-blocked', restored.blockers[0].detail);
        const patch = readPatternImportDxfProductExactNSeamRestorePatchV2(restored.owner);
        if (
          !patch ||
          !sameExactSides(
            sides,
            patch.seams.flatMap((seam) => seam.sides),
          )
        )
          return blocked(
            'durable-native-restore-span-mismatch',
            'The stored carrier spans differ from the current exact Assembly anchors.',
          );
        return createSession(restored.owner, catalog, true, signal);
      } catch (error) {
        if (signal.aborted)
          return blocked('durable-restore-cancelled', 'Exact native restore was cancelled.');
        if (error instanceof DurableBridgeFailure) return blocked(error.code, error.message);
        return blocked(
          'durable-restore-failed',
          error instanceof Error ? error.message : 'Exact native restore failed.',
        );
      }
    },
    async persist(
      request:
        | PatternImportDxfPhaseEZeroConnectDurablePersistRequestV1
        | PatternImportDxfPhaseELinkedN1DurableRequestV1,
      signal: AbortSignal,
    ): Promise<PatternImportDxfPhaseEZeroConnectDurableResultV1> {
      try {
        const existing =
          request.schemaVersion === PATTERN_IMPORT_DXF_PHASE_E_LINKED_N1_DURABLE_REQUEST_V1;
        if (
          signal.aborted ||
          (existing
            ? !SHA256.test(request.verifiedSemanticSha256)
            : request.schemaVersion !==
                PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1 ||
              request.pending.status !== 'in-memory-final-seam-attached-awaiting-second-save' ||
              request.pending.candidate.connection.mapping !== 'equal' ||
              request.pending.candidate.connection.lengthRatio !== 1 ||
              !sameSourceRow(request.pending.refreshedAuthoringAuthority.row, request.row))
        )
          return blocked(
            'durable-request-invalid',
            'Durable N=1 persistence requires the completed equal-mapping exact gesture.',
          );
        const selectedOperationNumber = existing
          ? request.selectedOperationNumber
          : request.pending.savedOperationNumber;
        const seamKey = existing ? request.seamKey : request.pending.finalSeamKey;
        const catalog = existing ? request.catalog : request.pending.catalog;
        const selected = existing ? request.sides : request.pending.candidate.connection.sides;
        const verifiedSemanticSha256 = existing ? request.verifiedSemanticSha256 : null;
        const currentTopology = await deps.authorityAdapter.readCurrentAssemblyTopology(
          { row: request.row, selectedOperationNumber },
          signal,
        );
        const operation = currentTopology.topology.operations.find(
          ({ number }) => number === selectedOperationNumber,
        );
        const expectedInputs = selected.map(({ pieceLineKey }) => pieceLineKey);
        if (
          !operation ||
          !sameOrdered(operation.inputKeys, expectedInputs) ||
          !sameOrdered(operation.seamKeys, [seamKey])
        )
          return blocked(
            'durable-operation-binding-mismatch',
            'Fresh saved Assembly topology differs from the completed exact connection.',
          );
        const sides = selected.map((side, sideIndex) =>
          Object.freeze({
            seamId: seamKey,
            sideIndex: sideIndex as 0 | 1,
            pieceId: side.pieceId,
            pieceLineKey: side.pieceLineKey,
            contourId: side.contourId,
            boundaryVertexIds: Object.freeze([...side.boundaryVertexIds]) as readonly [
              string,
              string,
            ],
            direction: side.direction,
          }),
        ) as readonly ExactSide[];
        const derived = await durableBindings(
          {
            row: request.row,
            operationNumber: selectedOperationNumber,
            inputKeys: operation.inputKeys,
            seamIds: operation.seamKeys,
            catalogCanonicalSha256: catalog.canonicalSha256,
            mapping: 'equal',
            lengthRatio: 1,
            sides,
          },
          crypto,
        );
        const current = Object.freeze({
          row: request.row,
          serverAssemblyRevision: currentTopology.serverAssemblyRevision,
          assemblyTopologySha256: currentTopology.assemblyTopologySha256,
          selectedOperation: Object.freeze({
            sourceOperationNumber: selectedOperationNumber,
            authoringOperationId: derived.compositeOperationBindingId,
            localOperationOrder: 0 as const,
            seamIds: Object.freeze([seamKey]),
          }),
          catalogCanonicalSha256: catalog.canonicalSha256,
          phaseEAggregatePlanSha256: derived.phaseEAggregatePlanSha256,
        });
        const exact = await buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2,
            status: 'untrusted-authority-candidate',
            ...current,
            sides,
          },
          { crypto },
        );
        if (!exact.ok) return blocked('durable-exact-carrier-blocked', exact.blockers[0].detail);
        const exactBytes = await encodePatternImportDxfProductExactNSeamComponentV4(
          { carrier: exact.carrier, seal: exact.seal },
          crypto,
        );
        if (!exactBytes.ok)
          return blocked('durable-exact-component-blocked', exactBytes.blocker.detail);
        const currentSidecar = await readCurrentSidecar(deps, request.row, signal);
        if (
          currentSidecar.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 ||
          currentSidecar.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 ||
          currentSidecar.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 ||
          currentSidecar.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7
        ) {
          let decodedV4: Extract<
            Awaited<ReturnType<typeof decodePatternImportDxfProductCompositeSidecarV4>>,
            { ok: true }
          >;
          if (
            currentSidecar.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4
          ) {
            const decoded = await decodePatternImportDxfProductCompositeSidecarV4(
              currentSidecar.bytes,
              crypto,
            );
            if (!decoded.ok)
              return blocked('durable-existing-composite-invalid', decoded.blockers[0].detail);
            decodedV4 = decoded;
          } else if (
            currentSidecar.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5
          ) {
            const decoded = await decodePatternImportDxfProductCompositeSidecarV5(
              currentSidecar.bytes,
              crypto,
            );
            if (!decoded.ok)
              return blocked('durable-existing-composite-invalid', decoded.blockers[0].detail);
            decodedV4 = decoded.nestedCompositeV4;
          } else if (
            currentSidecar.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6
          ) {
            const decoded = await decodePatternImportDxfProductCompositeSidecarV6(
              currentSidecar.bytes,
              crypto,
            );
            if (!decoded.ok)
              return blocked('durable-existing-composite-invalid', decoded.blockers[0].detail);
            decodedV4 = decoded.nestedCompositeV5.nestedCompositeV4;
          } else {
            const decoded = await decodePatternImportDxfProductCompositeSidecarV7(
              currentSidecar.bytes,
              crypto,
            );
            if (!decoded.ok)
              return blocked('durable-existing-composite-invalid', decoded.blockers[0].detail);
            decodedV4 = decoded.nestedCompositeV6.nestedCompositeV5.nestedCompositeV4;
          }
          const existingSides = decodedV4.exactNSeam.carrier.seams.flatMap(
            ({ sides: seamSides }) => seamSides,
          );
          const existingOperation = decodedV4.exactNSeam.carrier.bindings.selectedOperation;
          if (
            existingOperation.authoringOperationId !== derived.compositeOperationBindingId ||
            existingOperation.sourceOperationNumber !== selectedOperationNumber ||
            !sameOrdered(existingOperation.seamIds, [seamKey]) ||
            !sameExactSides(existingSides, sides)
          )
            return blocked(
              'durable-existing-operation-conflict',
              'This saved DXF row already carries a different durable exact operation. Composite V4–V7 is never overwritten by the legacy single-operation writer; a fresh fullgraph reissue is required.',
            );
          if (
            verifiedSemanticSha256 &&
            !decodedV4.nestedCompositeV3.document.components.some(
              ({ kind, sha256 }) =>
                kind === 'semantic-product-v1' && sha256 === verifiedSemanticSha256,
            )
          )
            return blocked(
              'durable-verified-semantic-mismatch',
              'The saved exact carrier no longer contains the verified Semantic V1 bytes.',
            );
          const restored = await restorePatternImportDxfProductCompositeSidecarDurableV4(
            {
              schemaVersion:
                PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
              current,
              readback: Object.freeze({
                status: 'present' as const,
                source: 'fresh-current-sidecar-get' as const,
                mediaType: currentSidecar.mediaType,
                sha256: currentSidecar.sha256,
                byteLength: currentSidecar.byteLength,
                bytes: currentSidecar.bytes,
              }),
            },
            crypto,
          );
          if (!restored.ok)
            return blocked('durable-idempotent-restore-blocked', restored.blockers[0].detail);
          return createSession(restored.owner, catalog, true, signal);
        }
        if (verifiedSemanticSha256) {
          const digest =
            currentSidecar.mediaType ===
              PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 &&
            currentSidecar.sha256 === verifiedSemanticSha256
              ? await crypto?.subtle.digest('SHA-256', currentSidecar.bytes)
              : null;
          const actualSha256 = digest
            ? Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
                '',
              )
            : null;
          if (actualSha256 !== verifiedSemanticSha256)
            return blocked(
              'durable-verified-semantic-mismatch',
              'The current saved sidecar does not match the verified Semantic V1 attachment.',
            );
        }
        if (
          currentSidecar.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 &&
          currentSidecar.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3
        )
          return blocked(
            'durable-existing-carrier-unsupported',
            'This saved DXF row already carries an unsupported semantic container. It is never overwritten while preserving a new exact operation; a coordinated lossless container migration is required.',
          );
        const preserved = await preserveComponents(currentSidecar, current, crypto);
        return await writeDurableExactPlan(
          deps,
          current,
          currentSidecar.sha256,
          preserved,
          exactBytes.bytes,
          catalog,
          crypto,
          signal,
        );
      } catch (error) {
        if (error instanceof DurableBridgeFailure) return blocked(error.code, error.message);
        return blocked(
          signal.aborted ? 'durable-persist-cancelled' : 'durable-persist-failed',
          signal.aborted
            ? 'Durable exact connection persistence was cancelled.'
            : error instanceof Error
              ? error.message
              : 'Durable exact connection persistence failed closed.',
        );
      }
    },
    async restore(
      request: PatternImportDxfPhaseEZeroConnectDurableRestoreRequestV1,
      signal: AbortSignal,
    ): Promise<PatternImportDxfPhaseEZeroConnectDurableResultV1> {
      try {
        if (
          request.schemaVersion !==
          PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1
        )
          return blocked('durable-restore-request-invalid', 'Durable restore request is invalid.');
        const currentTopology = await deps.authorityAdapter.readCurrentAssemblyTopology(
          { row: request.row, selectedOperationNumber: request.selectedOperationNumber },
          signal,
        );
        const operation = currentTopology.topology.operations.find(
          ({ number }) => number === request.selectedOperationNumber,
        );
        if (!operation || operation.seamKeys.length !== 1)
          return blocked(
            'durable-restore-operation-mismatch',
            'Durable N=1 restore requires one current saved seam on the selected operation.',
          );
        const currentSidecar = await readCurrentSidecar(deps, request.row, signal);
        let decodedV4;
        if (
          currentSidecar.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4
        ) {
          const decoded = await decodePatternImportDxfProductCompositeSidecarV4(
            currentSidecar.bytes,
            crypto,
          );
          if (!decoded.ok)
            return blocked('durable-restore-codec-blocked', decoded.blockers[0].detail);
          decodedV4 = decoded;
        } else if (
          currentSidecar.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5
        ) {
          const decoded = await decodePatternImportDxfProductCompositeSidecarV5(
            currentSidecar.bytes,
            crypto,
          );
          if (!decoded.ok)
            return blocked('durable-restore-codec-blocked', decoded.blockers[0].detail);
          decodedV4 = decoded.nestedCompositeV4;
        } else if (
          currentSidecar.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6
        ) {
          const decoded = await decodePatternImportDxfProductCompositeSidecarV6(
            currentSidecar.bytes,
            crypto,
          );
          if (!decoded.ok)
            return blocked('durable-restore-codec-blocked', decoded.blockers[0].detail);
          decodedV4 = decoded.nestedCompositeV5.nestedCompositeV4;
        } else if (
          currentSidecar.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7
        ) {
          const decoded = await decodePatternImportDxfProductCompositeSidecarV7(
            currentSidecar.bytes,
            crypto,
          );
          if (!decoded.ok)
            return blocked('durable-restore-codec-blocked', decoded.blockers[0].detail);
          decodedV4 = decoded.nestedCompositeV6.nestedCompositeV5.nestedCompositeV4;
        } else {
          return blocked(
            'durable-restore-sidecar-missing',
            'The current saved row has no durable Composite V4–V7 exact connection.',
          );
        }
        const carrier = decodedV4.exactNSeam.carrier;
        const sides = carrier.seams.flatMap(({ sides: seamSides }) => seamSides);
        if (carrier.seams.length !== 1 || carrier.seams[0]?.seamId !== operation.seamKeys[0])
          return blocked(
            'durable-restore-binding-mismatch',
            'Composite V4–V7 no longer matches the saved operation.',
          );
        if (carrier.bindings.catalogCanonicalSha256 !== request.catalog.canonicalSha256)
          return blocked(
            'durable-restore-catalog-mismatch',
            'Composite V4–V7 no longer matches the current DXF catalog.',
          );
        const derived = await durableBindings(
          {
            row: request.row,
            operationNumber: request.selectedOperationNumber,
            inputKeys: operation.inputKeys,
            seamIds: operation.seamKeys,
            catalogCanonicalSha256: request.catalog.canonicalSha256,
            mapping: 'equal',
            lengthRatio: 1,
            sides,
          },
          crypto,
        );
        const current = Object.freeze({
          row: request.row,
          serverAssemblyRevision: currentTopology.serverAssemblyRevision,
          assemblyTopologySha256: currentTopology.assemblyTopologySha256,
          selectedOperation: Object.freeze({
            sourceOperationNumber: request.selectedOperationNumber,
            authoringOperationId: derived.compositeOperationBindingId,
            localOperationOrder: 0 as const,
            seamIds: Object.freeze([...operation.seamKeys]),
          }),
          catalogCanonicalSha256: request.catalog.canonicalSha256,
          phaseEAggregatePlanSha256: derived.phaseEAggregatePlanSha256,
        });
        const restored = await restorePatternImportDxfProductCompositeSidecarDurableV4(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
            current,
            readback: Object.freeze({
              status: 'present' as const,
              source: 'fresh-current-sidecar-get' as const,
              mediaType: currentSidecar.mediaType,
              sha256: currentSidecar.sha256,
              byteLength: currentSidecar.byteLength,
              bytes: currentSidecar.bytes,
            }) as PatternImportDxfProductCompositeSidecarDurableReadbackV4,
          },
          crypto,
        );
        if (!restored.ok)
          return blocked('durable-restore-authority-blocked', restored.blockers[0].detail);
        return createSession(restored.owner, request.catalog, true, signal);
      } catch (error) {
        if (error instanceof DurableBridgeFailure) return blocked(error.code, error.message);
        return blocked(
          signal.aborted ? 'durable-restore-cancelled' : 'durable-restore-failed',
          signal.aborted
            ? 'Durable exact connection restore was cancelled.'
            : error instanceof Error
              ? error.message
              : 'Durable exact connection restore failed closed.',
        );
      }
    },
  });
}

export function createPatternImportDxfPhaseEZeroConnectProductionDurableBridgeV1(
  selectedOperationNumber: number,
  application: PatternImportDxfProductCompositeSidecarApplicationTransactionV4,
  authorityAdapter: PatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
) {
  if (!Number.isSafeInteger(selectedOperationNumber) || selectedOperationNumber < 1)
    throw new TypeError('A positive selected operation number is required.');
  return createPatternImportDxfPhaseEZeroConnectDurableBridgeV1({
    authorityAdapter,
    application,
    createClient: (signal) => abortableAdminService(signal),
    readCompleteSource: (row, expectedServerAssemblyRevision, signal) =>
      readCompleteSavedAssemblySourceV1(
        abortableAdminService(signal),
        row,
        { expectedServerAssemblyRevision },
        signal,
      ),
    crypto,
  });
}

export type PatternImportDxfPhaseEZeroConnectDurableSidecarRowV1 = TechCardPatternSemanticSidecar;
