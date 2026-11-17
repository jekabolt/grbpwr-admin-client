import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { CadWorkbenchMannequinArrangementSaveV1 } from './cad-workbench-physical-host-v1';
import { decodePatternImportDxfProductCompositeSidecarV7 } from './composite-sidecar-v7';

import {
  createCadMannequinArrangementDocumentV1,
  encodeCadMannequinArrangementDocumentV1,
  type CadMannequinArrangementRequestV1,
} from './cad-mannequin-arrangement-document-v1';
import { decodePatternImportDxfProductCompositeSidecarV4 } from './composite-sidecar-v4';
import {
  buildPatternImportDxfProductCompositeSidecarV5,
  decodePatternImportDxfProductCompositeSidecarV5,
  derivePatternImportDxfPhaseETopologyAnnotationsBindingsV1,
  encodePatternImportDxfPhaseETopologyAnnotationsV1,
  PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5,
} from './composite-sidecar-v5';
import {
  createPatternImportDxfProductCompositeSidecarProductionPersistenceV5,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V5,
} from './composite-sidecar-persistence-v5';
import {
  buildPatternImportDxfProductCompositeSidecarV6,
  decodePatternImportDxfProductCompositeSidecarV6,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
  readPatternImportDxfProductCompositeComponentBytesV6,
} from './composite-sidecar-v6';
import {
  createPatternImportDxfProductCompositeSidecarProductionPersistenceV6,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
} from './composite-sidecar-persistence-v6';
import {
  disposeSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  readSavedFullAssemblySnapshotV1,
} from './saved-full-assembly-snapshot-production-v1';

export type SavedCadMannequinArrangementSaveRequestV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  seedOperationNumber: number;
  /** Actual displayed source identity. Used only when V4 has no annotation component yet. */
  source?: Readonly<{ identity: string; revision: string; sha256: string }>;
  /** Explicitly accepted presentation transforms; these are never physical initialization. */
  arrangement: CadMannequinArrangementRequestV1;
}>;

async function readCurrent(
  request: Pick<SavedCadMannequinArrangementSaveRequestV1, 'row' | 'seedOperationNumber'>,
  signal: AbortSignal,
) {
  const receipt = await readSavedFullAssemblySnapshotV1(
    { row: request.row, seedOperationNumber: request.seedOperationNumber },
    signal,
  );
  try {
    const snapshot = projectSavedFullAssemblySnapshotV1(receipt);
    return snapshot;
  } finally {
    disposeSavedFullAssemblySnapshotV1(receipt);
  }
}

/** Read-only hydration. A different source, model or pose never receives stale transforms. */
export async function readSavedCadMannequinArrangementV1(
  request: Readonly<{
    row: DxfProductSavedRowIdentityV1;
    seedOperationNumber: number;
    expected: Omit<CadWorkbenchMannequinArrangementSaveV1, 'pieces'>;
  }>,
  signal: AbortSignal,
) {
  const snapshot = await readCurrent(request, signal);
  const outer = snapshot.outer;
  if (outer.status !== 'present' || !outer.currentRowBound) return null;
  const decoded = outer.mediaType.endsWith('.v7+json')
    ? await (async () => {
        const v7 = await decodePatternImportDxfProductCompositeSidecarV7(outer.bytes);
        return v7.ok ? v7.nestedCompositeV6 : null;
      })()
    : outer.mediaType.endsWith('.v6+json')
      ? await decodePatternImportDxfProductCompositeSidecarV6(outer.bytes)
      : null;
  if (!decoded?.ok) return null;
  const arrangement = decoded.mannequinArrangement;
  const { bindings } = arrangement;
  const { expected, row } = request;
  if (
    signal.aborted ||
    decoded.document.bindings.serverAssemblyRevision !== snapshot.serverAssemblyRevision ||
    bindings.card.techCardId !== row.techCardId ||
    bindings.card.cardLockVersion !== row.cardLockVersion ||
    bindings.scope.scopeKey !== row.scopeKey ||
    expected.scopeKey !== row.scopeKey ||
    bindings.scope.patternLineKey !== row.patternLineKey ||
    bindings.savedRow.revision !== row.revision ||
    bindings.savedRow.dxfSha256 !== row.sha256 ||
    bindings.scope.sizeToken !== expected.projection.sizeToken ||
    bindings.source.catalogCanonicalSha256 !== expected.projection.expectedCatalogCanonicalSha256 ||
    bindings.source.sizeSelectionCanonicalSha256 !==
      expected.projection.sizeSelectionCanonicalSha256 ||
    bindings.mannequin.baseModelId !== expected.mannequin.baseModelId ||
    bindings.mannequin.modelFormRevisionKeyV1 !== expected.mannequin.modelFormRevisionKeyV1 ||
    bindings.mannequin.poseBinding.canonicalKey !== expected.mannequin.poseBinding.canonicalKey
  )
    return null;
  const keys = new Set(
    expected.projection.pieces.map(
      ({ pieceId, pieceLineKey }) => `${expected.scopeKey}:${pieceId}:${pieceLineKey}`,
    ),
  );
  if (
    keys.size !== arrangement.pieces.length ||
    arrangement.pieces.some(
      (piece) =>
        piece.scopeKey !== expected.scopeKey ||
        !keys.has(piece.pieceKey) ||
        piece.pieceKey !== `${piece.scopeKey}:${piece.pieceId}:${piece.pieceLineKey}`,
    )
  )
    return null;
  return arrangement.pieces;
}

/**
 * Explicit Save arrangement transaction. Existing V5 annotations are preserved byte-for-byte.
 * V4 gains an empty annotation component because V4 cannot contain annotations. Each transition
 * uses the existing fresh-GET/CAS adapter; no transport, topology or physical owner is invented.
 */
export async function saveSavedCadMannequinArrangementV1(
  input: SavedCadMannequinArrangementSaveRequestV1,
  signal: AbortSignal,
) {
  // Capture mutable UI state before the first asynchronous read.
  const arrangement = createCadMannequinArrangementDocumentV1(input.arrangement);
  const request = {
    ...input,
    row: { ...input.row },
    source: input.source ? { ...input.source } : undefined,
  };
  const { bindings } = arrangement;
  if (
    bindings.card.techCardId !== request.row.techCardId ||
    bindings.card.cardLockVersion !== request.row.cardLockVersion ||
    bindings.scope.scopeKey !== request.row.scopeKey ||
    bindings.scope.patternLineKey !== request.row.patternLineKey ||
    bindings.savedRow.revision !== request.row.revision ||
    bindings.savedRow.dxfSha256 !== request.row.sha256 ||
    (request.source && request.source.sha256 !== request.row.sha256)
  )
    throw new Error('The displayed arrangement belongs to another saved DXF revision.');
  let snapshot = await readCurrent(request, signal);
  let outer = snapshot.outer;
  if (outer.status !== 'present' || !outer.currentRowBound)
    throw new Error('Save the exact edge connection before saving mannequin arrangement.');

  if (outer.mediaType.endsWith('.v4+json')) {
    if (!request.source)
      throw new Error('Prepare the current exact source before saving arrangement.');
    const current = await decodePatternImportDxfProductCompositeSidecarV4(outer.bytes);
    if (!current.ok) throw new Error(current.blockers[0].detail);
    if (current.document.bindings.serverAssemblyRevision !== snapshot.serverAssemblyRevision)
      throw new Error('Assembly Order changed. Reload before saving mannequin arrangement.');
    const annotations = await encodePatternImportDxfPhaseETopologyAnnotationsV1({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1,
      bindings: derivePatternImportDxfPhaseETopologyAnnotationsBindingsV1(
        current.document.bindings,
        request.source,
      ),
      measurements: [],
      callouts: [],
    });
    if (!annotations.ok) throw new Error(annotations.blocker.detail);
    const next = await buildPatternImportDxfProductCompositeSidecarV5({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5,
      bindings: current.document.bindings,
      expectedPreviousSidecarSha256: outer.sha256,
      compositeV4Bytes: outer.bytes,
      topologyAnnotationsBytes: annotations.bytes,
    });
    if (!next.ok) throw new Error(next.blockers[0].detail);
    const saved =
      await createPatternImportDxfProductCompositeSidecarProductionPersistenceV5().adapter.persist(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V5,
          currentAuthority: current.document.bindings,
          nextOwner: next.owner,
        },
        signal,
      );
    if (!saved.ok) throw new Error(saved.blockers[0].detail);
    snapshot = await readCurrent(request, signal);
    outer = snapshot.outer;
    if (
      outer.status !== 'present' ||
      !outer.currentRowBound ||
      !outer.mediaType.endsWith('.v5+json') ||
      outer.sha256 !== saved.receipt.sidecarSha256
    )
      throw new Error('The saved annotation envelope changed before arrangement save.');
  }

  const nestedBytes = outer.mediaType.endsWith('.v6+json')
    ? await (async () => {
        const decoded = await decodePatternImportDxfProductCompositeSidecarV6(outer.bytes);
        if (!decoded.ok) throw new Error(decoded.blockers[0].detail);
        return readPatternImportDxfProductCompositeComponentBytesV6(decoded.owner, 'composite-v5');
      })()
    : outer.mediaType.endsWith('.v5+json')
      ? outer.bytes
      : null;
  if (!nestedBytes)
    throw new Error('Save an exact edge connection before saving mannequin arrangement.');
  const nested = await decodePatternImportDxfProductCompositeSidecarV5(nestedBytes);
  if (!nested.ok) throw new Error(nested.blockers[0].detail);
  if (nested.document.bindings.serverAssemblyRevision !== snapshot.serverAssemblyRevision)
    throw new Error('Assembly Order changed. Reload before saving mannequin arrangement.');
  const next = await buildPatternImportDxfProductCompositeSidecarV6({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
    expectedPreviousSidecarSha256: outer.sha256,
    compositeV5Bytes: nestedBytes,
    mannequinArrangementBytes: new TextEncoder().encode(
      encodeCadMannequinArrangementDocumentV1(arrangement),
    ),
  });
  if (!next.ok) throw new Error(next.blockers[0].detail);
  const { source, scope, mannequin } = arrangement.bindings;
  const saved = await createPatternImportDxfProductCompositeSidecarProductionPersistenceV6().save(
    {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
      transitionIntent: 'arrangement',
      currentAuthority: nested.document.bindings,
      arrangementTarget: {
        sizeToken: scope.sizeToken,
        catalogCanonicalSha256: source.catalogCanonicalSha256,
        sizeSelectionCanonicalSha256: source.sizeSelectionCanonicalSha256,
        baseModelId: mannequin.baseModelId,
        modelFormRevisionKeyV1: mannequin.modelFormRevisionKeyV1,
        poseCanonicalKey: mannequin.poseBinding.canonicalKey,
      },
      nextOwner: next.owner,
    },
    signal,
  );
  if (!saved.ok) throw new Error(saved.blockers[0].detail);
  return saved;
}
