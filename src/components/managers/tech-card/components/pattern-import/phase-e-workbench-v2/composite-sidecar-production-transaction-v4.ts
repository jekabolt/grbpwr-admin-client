import { abortableAdminService } from 'api/api';
import type { AdminService } from 'api/proto-http/admin';
import type { PatternImportDxfProductCompositeSidecarStorageDepsV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';
import { encodePatternImportDxfProductCompositeSidecarV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
  buildPatternImportDxfProductCompositeSidecarV4,
  decodePatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductExactNSeamComponentV4,
} from './composite-sidecar-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4,
  createPatternImportDxfProductCompositeSidecarStorageAdapterV4,
} from './composite-sidecar-persistence-v4';
import { createPatternImportDxfProductCompositeSidecarApplicationPersistenceV5 } from './composite-sidecar-persistence-v5';
import { createPatternImportDxfProductCompositeSidecarRestoreAuthorityV4 } from './composite-sidecar-restore-authority-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_REQUEST_V4,
  createPatternImportDxfProductCompositeSidecarTransactionV4,
} from './composite-sidecar-transaction-v4';
import {
  PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2,
  type PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2,
} from './exact-n-seam-authority-gap-v2';
import { buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2 } from './exact-n-seam-consistency-carrier-v2';
import {
  resolvePatternImportDxfProductExactNSeamProductionMountV2,
  type PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
} from './exact-n-seam-production-mount-v2';
import {
  publishPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
  type PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
} from './golden-card-production-v2-snapshot-feed-v1';
import { createPatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5 } from './topology-annotation-application-transaction-v5';
import { createPatternImportDxfPhaseEWrappedTopologyAnnotationSaveV1 } from './wrapped-topology-annotation-save-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_APPLICATION_TRANSACTION_V4 =
  'pattern-import-dxf-product-composite-sidecar-application-transaction/4' as const;

export const PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_APPLICATION_TRANSACTION_CLAIMS_V4 =
  Object.freeze({
    existingGeneratedGetAndPutReused: true,
    existingCompositeV4StorageAdapterReused: true,
    existingCompositeV4RestoreAuthorityReused: true,
    existingCompositeV4TransactionCoordinatorReused: true,
    freshFullReadbackAfterVerifiedPut: true,
    secondWriterCreated: false,
    uiStateUsedAsAuthority: false,
    restoredAtomicSelectionOwnerIsConfirmAuthority: true,
    explicitConfirmRequired: true,
    canonicalReadbackRequiredBeforeFeedPublication: true,
    restoredSessionConfirmIntegrated: true,
    compositeV5TopologyAnnotationTransactionIntegrated: true,
    topologyAnnotationSaveRequiresExplicitUserAction: true,
    fromScratchExactNCarrierBuilderIntegrated: false,
  } as const);

type SidecarService = Pick<
  AdminService,
  'GetTechCardPatternSemanticSidecar' | 'PutTechCardPatternSemanticSidecar'
>;

export type PatternImportDxfProductCompositeSidecarApplicationTransactionDepsV4 = Readonly<{
  createClient: (signal: AbortSignal) => SidecarService;
  crypto?: Pick<Crypto, 'subtle'>;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_BYTES = 4 * 1024 * 1024;

function decodeBase64(value: unknown, expectedLength: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !value || value.length > MAX_BYTES * 2)
    throw new TypeError('Composite V4 readback bytes are invalid.');
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new TypeError('Composite V4 readback bytes are not base64.');
  }
  if (binary.length !== expectedLength) throw new TypeError('Composite V4 byte length changed.');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export type PatternImportDxfProductExactNRestoredConfirmResultV4 =
  | Readonly<{
      ok: true;
      status: 'verified-and-published';
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      status: 'blocked';
      blocker: Readonly<{ code: string; detail: string }>;
    }>;

function confirmBlocked(
  code: string,
  detail: string,
): PatternImportDxfProductExactNRestoredConfirmResultV4 {
  return Object.freeze({
    ok: false as const,
    status: 'blocked' as const,
    blocker: Object.freeze({ code, detail: detail.slice(0, 2_048) }),
  });
}

/**
 * Application composition only. PUT remains owned by the existing storage adapter; the restore
 * read is the same generated narrow GET and the existing restore owner verifies codec and binding.
 */
export function createPatternImportDxfProductCompositeSidecarApplicationTransactionV4(
  deps: PatternImportDxfProductCompositeSidecarApplicationTransactionDepsV4,
) {
  const storageDeps: PatternImportDxfProductCompositeSidecarStorageDepsV3 = {
    createClient: deps.createClient,
    crypto: deps.crypto,
  };
  const persistence = createPatternImportDxfProductCompositeSidecarStorageAdapterV4(storageDeps);
  const annotationPersistence =
    createPatternImportDxfProductCompositeSidecarApplicationPersistenceV5(storageDeps);
  const topologyAnnotations =
    createPatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5({
      createClient: deps.createClient,
      persistence: annotationPersistence,
      crypto: deps.crypto,
    });
  const readCurrentCompositeV4 = async (
    expected: Readonly<{ techCardId: number; patternLineKey: string }>,
    signal: AbortSignal,
  ) => {
    if (signal.aborted) throw new DOMException('Composite V4 readback cancelled.', 'AbortError');
    const client = deps.createClient(signal);
    const response = await client.GetTechCardPatternSemanticSidecar({
      techCardId: expected.techCardId,
      patternLineKey: expected.patternLineKey,
    });
    if (signal.aborted) throw new DOMException('Composite V4 readback cancelled.', 'AbortError');
    const row = response.semanticSidecar;
    if (
      !row ||
      row.techCardId !== expected.techCardId ||
      row.patternLineKey !== expected.patternLineKey ||
      row.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 ||
      typeof row.sidecarSha256 !== 'string' ||
      !SHA256.test(row.sidecarSha256) ||
      !Number.isSafeInteger(row.byteLength) ||
      (row.byteLength as number) < 1 ||
      (row.byteLength as number) > MAX_BYTES
    )
      throw new TypeError('Fresh Composite V4 readback envelope is invalid.');
    const bytes = decodeBase64(row.sidecarBytes, row.byteLength as number);
    const decoded = await decodePatternImportDxfProductCompositeSidecarV4(bytes, deps.crypto);
    if (!decoded.ok) throw new TypeError('Fresh Composite V4 readback is not canonical.');
    return Object.freeze({
      status: 'present' as const,
      source: 'fresh-current-sidecar-get' as const,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
      sha256: row.sidecarSha256,
      byteLength: bytes.byteLength,
      bytes,
    });
  };
  const restoreAuthority = createPatternImportDxfProductCompositeSidecarRestoreAuthorityV4(
    {
      readCurrentCompositeV4,
    },
    deps.crypto,
  );
  const transaction = createPatternImportDxfProductCompositeSidecarTransactionV4({
    persistence,
    restoreAuthority,
  });
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_APPLICATION_TRANSACTION_V4,
    transaction,
    topologyAnnotations,
    saveWrappedTopologyAnnotations:
      createPatternImportDxfPhaseEWrappedTopologyAnnotationSaveV1(storageDeps),
    async confirmRestoredSelection(
      session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
      feed: PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
      signal: AbortSignal,
    ): Promise<PatternImportDxfProductExactNRestoredConfirmResultV4> {
      try {
        if (signal.aborted) return confirmBlocked('cancelled', 'Confirmation was cancelled.');
        const resolved = resolvePatternImportDxfProductExactNSeamProductionMountV2(session, 0);
        if (!resolved.ok)
          return confirmBlocked('exact-n-selection-owner-unavailable', resolved.blockers[0].detail);
        const { current } = session;
        const readback = await readCurrentCompositeV4(
          {
            techCardId: current.row.techCardId,
            patternLineKey: current.row.patternLineKey,
          },
          signal,
        );
        const decoded = await decodePatternImportDxfProductCompositeSidecarV4(
          readback.bytes,
          deps.crypto,
        );
        if (!decoded.ok)
          return confirmBlocked(
            'canonical-v4-readback-blocked',
            'Fresh Composite V4 readback is not canonical.',
          );
        const candidate: PatternImportDxfPhaseEExactNSeamAuthorityCandidateV2 = {
          schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_EXACT_N_SEAM_AUTHORITY_CANDIDATE_V2,
          status: 'untrusted-authority-candidate',
          row: current.row,
          serverAssemblyRevision: current.serverAssemblyRevision,
          assemblyTopologySha256: current.assemblyTopologySha256,
          selectedOperation: current.selectedOperation,
          catalogCanonicalSha256: current.catalogCanonicalSha256,
          phaseEAggregatePlanSha256: current.phaseEAggregatePlanSha256,
          sides: resolved.model.choices.seams.flatMap(({ sides }) => sides),
        };
        const exact = await buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2(candidate, {
          crypto: deps.crypto,
        });
        if (!exact.ok) return confirmBlocked('exact-n-carrier-blocked', exact.blockers[0].detail);
        const exactBytes = await encodePatternImportDxfProductExactNSeamComponentV4(
          { carrier: exact.carrier, seal: exact.seal },
          deps.crypto,
        );
        if (!exactBytes.ok)
          return confirmBlocked('exact-n-component-blocked', exactBytes.blocker.detail);
        const nested = encodePatternImportDxfProductCompositeSidecarV3(
          decoded.nestedCompositeV3.owner,
        );
        if (!nested.ok || !nested.bytes)
          return confirmBlocked('nested-v3-unavailable', 'The verified nested V3 is unavailable.');
        const next = await buildPatternImportDxfProductCompositeSidecarV4(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
            bindings: {
              row: current.row,
              serverAssemblyRevision: current.serverAssemblyRevision,
              assemblyTopologySha256: current.assemblyTopologySha256,
            },
            expectedPreviousSidecarSha256: readback.sha256,
            compositeV3Bytes: nested.bytes,
            exactNSeamConsistencyBytes: exactBytes.bytes,
          },
          deps.crypto,
        );
        if (!next.ok) return confirmBlocked('composite-v4-build-blocked', next.blockers[0].detail);
        const persisted = await transaction.execute(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_TRANSACTION_REQUEST_V4,
            current,
            storage: {
              schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V4,
              currentAuthority: {
                row: current.row,
                serverAssemblyRevision: current.serverAssemblyRevision,
                assemblyTopologySha256: current.assemblyTopologySha256,
              },
              nextOwner: next.owner,
            },
          },
          signal,
        );
        if (!persisted.ok)
          return confirmBlocked(
            persisted.blockers[0]?.code ?? 'composite-v4-transaction-blocked',
            persisted.blockers[0]?.detail ?? 'Composite V4 transaction failed closed.',
          );
        if (!publishPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(persisted, feed))
          return confirmBlocked(
            'golden-v2-feed-publication-blocked',
            'Verified readback did not match the caller-owned sanitized operation snapshot.',
          );
        return Object.freeze({
          ok: true as const,
          status: 'verified-and-published' as const,
          blocker: null,
        });
      } catch (error) {
        return confirmBlocked(
          signal.aborted ? 'cancelled' : 'restored-confirm-failed',
          signal.aborted
            ? 'Confirmation was cancelled.'
            : error instanceof Error
              ? error.message
              : 'Restored exact-N confirmation failed closed.',
        );
      }
    },
    claims: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_APPLICATION_TRANSACTION_CLAIMS_V4,
  });
}

export type PatternImportDxfProductCompositeSidecarApplicationTransactionV4 = ReturnType<
  typeof createPatternImportDxfProductCompositeSidecarApplicationTransactionV4
>;

export function createPatternImportDxfProductCompositeSidecarProductionTransactionV4(
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
) {
  return createPatternImportDxfProductCompositeSidecarApplicationTransactionV4({
    createClient: (signal) => abortableAdminService(signal),
    crypto,
  });
}
