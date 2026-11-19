import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { CadWorkbenchMannequinArrangementSaveV1 } from './cad-workbench-physical-host-v1';
import { isExactNSeamDocumentLockCurrent } from './exact-n-seam-production-session-store-v2';
import {
  buildPatternImportDxfProductCompositeSidecarV7,
  decodePatternImportDxfProductCompositeSidecarV7,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7,
  readPatternImportDxfProductCompositeComponentBytesV7,
} from './composite-sidecar-v7';

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
  encodePatternImportDxfProductCompositeSidecarV6,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
  readPatternImportDxfProductCompositeComponentBytesV6,
} from './composite-sidecar-v6';
import {
  createPatternImportDxfProductCompositeSidecarProductionPersistenceV6,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V6,
} from './composite-sidecar-persistence-v6';
import {
  createPatternImportDxfProductCompositeSidecarProductionArrangementStorageAdapterV7,
  requireSavedCompositeSidecarTransportAnchorV7,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
} from './composite-sidecar-persistence-v7';
import { SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1 } from './saved-full-assembly-physical-component-v1';
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

type SavedCadMannequinArrangementReadRequestV1 = Pick<
  SavedCadMannequinArrangementSaveRequestV1,
  'row' | 'seedOperationNumber'
>;

async function readCurrent(
  request: SavedCadMannequinArrangementReadRequestV1,
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

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
  );
}

function isSavedArrangementCurrent(row: DxfProductSavedRowIdentityV1, signal: AbortSignal) {
  return !signal.aborted && isExactNSeamDocumentLockCurrent(row.techCardId, row.cardLockVersion);
}

async function readCurrentArrangement(
  request: SavedCadMannequinArrangementReadRequestV1,
  signal: AbortSignal,
) {
  const row = { ...request.row };
  if (!isSavedArrangementCurrent(row, signal)) return null;
  const snapshot = await readCurrent(
    { row, seedOperationNumber: request.seedOperationNumber },
    signal,
  );
  const outer = snapshot.outer;
  if (
    !isSavedArrangementCurrent(row, signal) ||
    outer.status !== 'present' ||
    !outer.currentRowBound
  )
    return null;
  let decoded;
  if (outer.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7) {
    const v7 = await decodePatternImportDxfProductCompositeSidecarV7(outer.bytes);
    if (!v7.ok) return null;
    decoded = v7.nestedCompositeV6;
  } else if (outer.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6) {
    decoded = await decodePatternImportDxfProductCompositeSidecarV6(outer.bytes);
    if (!decoded.ok) return null;
  } else {
    return null;
  }
  const { document, mannequinArrangement: arrangement } = decoded;
  const savedRow = document.bindings.row;
  // V6 decoding has already bound the arrangement to this envelope's exact row.
  if (
    !isSavedArrangementCurrent(row, signal) ||
    document.bindings.serverAssemblyRevision !== snapshot.serverAssemblyRevision ||
    savedRow.techCardId !== row.techCardId ||
    savedRow.cardLockVersion !== row.cardLockVersion ||
    savedRow.scopeKey !== row.scopeKey ||
    savedRow.patternLineKey !== row.patternLineKey ||
    savedRow.revision !== row.revision ||
    savedRow.sha256 !== row.sha256 ||
    savedRow.url !== row.url ||
    savedRow.sizeBytes !== row.sizeBytes
  )
    return null;
  return arrangement;
}

/** Returns the saved presentation model selection. The displayed body still binds independently. */
export async function readSavedCadMannequinModelIdV1(
  request: SavedCadMannequinArrangementReadRequestV1,
  signal: AbortSignal,
): Promise<number | null> {
  const arrangement = await readCurrentArrangement(request, signal);
  return isSavedArrangementCurrent(request.row, signal)
    ? arrangement?.bindings.mannequin.baseModelId ?? null
    : null;
}

/** Read-only hydration. A different source, model or pose never receives stale transforms. */
export async function readSavedCadMannequinArrangementV1(
  request: SavedCadMannequinArrangementReadRequestV1 &
    Readonly<{ expected: Omit<CadWorkbenchMannequinArrangementSaveV1, 'pieces'> }>,
  signal: AbortSignal,
) {
  const arrangement = await readCurrentArrangement(request, signal);
  if (!arrangement || !isSavedArrangementCurrent(request.row, signal)) return null;
  const { bindings } = arrangement;
  const { expected } = request;
  if (
    expected.scopeKey !== bindings.scope.scopeKey ||
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
    source: input.source
      ? {
          identity: input.source.identity,
          revision: input.source.revision,
          sha256: input.source.sha256,
        }
      : undefined,
  };
  const assertCurrent = () => {
    signal.throwIfAborted();
    if (!isExactNSeamDocumentLockCurrent(request.row.techCardId, request.row.cardLockVersion))
      throw new DOMException('The previous saved arrangement source was retired.', 'AbortError');
  };
  assertCurrent();
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
    assertCurrent();
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

  const currentV7 = outer.mediaType.endsWith('.v7+json')
    ? await decodePatternImportDxfProductCompositeSidecarV7(outer.bytes)
    : null;
  if (currentV7 && !currentV7.ok) throw new Error(currentV7.blockers[0].detail);
  const currentV6Bytes = currentV7?.ok
    ? readPatternImportDxfProductCompositeComponentBytesV7(currentV7.owner, 'composite-v6')
    : outer.mediaType.endsWith('.v6+json')
      ? outer.bytes
      : null;
  const currentV6 = currentV6Bytes
    ? await decodePatternImportDxfProductCompositeSidecarV6(currentV6Bytes)
    : null;
  if (currentV6 && !currentV6.ok) throw new Error(currentV6.blockers[0].detail);
  const nestedBytes = currentV6?.ok
    ? readPatternImportDxfProductCompositeComponentBytesV6(currentV6.owner, 'composite-v5')
    : outer.mediaType.endsWith('.v5+json')
      ? outer.bytes
      : null;
  if (!nestedBytes)
    throw new Error('Save an exact edge connection before saving mannequin arrangement.');
  const nested = await decodePatternImportDxfProductCompositeSidecarV5(nestedBytes);
  if (!nested.ok) throw new Error(nested.blockers[0].detail);
  if (nested.document.bindings.serverAssemblyRevision !== snapshot.serverAssemblyRevision)
    throw new Error('Assembly Order changed. Reload before saving mannequin arrangement.');
  const arrangementBytes = new TextEncoder().encode(
    encodeCadMannequinArrangementDocumentV1(arrangement),
  );
  const next = await buildPatternImportDxfProductCompositeSidecarV6({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V6,
    expectedPreviousSidecarSha256: outer.sha256,
    compositeV5Bytes: nestedBytes,
    mannequinArrangementBytes: arrangementBytes,
  });
  if (!next.ok) throw new Error(next.blockers[0].detail);
  if (currentV7?.ok) {
    const encodedV6 = encodePatternImportDxfProductCompositeSidecarV6(next.owner);
    if (!encodedV6.ok) throw new Error('The arrangement Composite V6 could not be encoded.');
    const physicalBytes = readPatternImportDxfProductCompositeComponentBytesV7(
      currentV7.owner,
      SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1,
    );
    if (!physicalBytes)
      throw new Error('The current Composite V7 has no exact physical component.');
    const nextV7 = await buildPatternImportDxfProductCompositeSidecarV7({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7,
      expectedPreviousSidecarSha256: outer.sha256,
      bindings: currentV7.document.bindings,
      compositeV6Bytes: encodedV6.bytes,
      fullAssemblyPhysicalBytes: physicalBytes,
    });
    if (!nextV7.ok) throw new Error(nextV7.blockers[0].detail);
    const anchor = requireSavedCompositeSidecarTransportAnchorV7(currentV7, snapshot);
    assertCurrent();
    const saved =
      await createPatternImportDxfProductCompositeSidecarProductionArrangementStorageAdapterV7().persist(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
          transitionIntent: 'arrangement',
          currentAuthority: currentV7.document.bindings,
          transportAnchor: anchor,
          nextOwner: nextV7.owner,
        },
        signal,
      );
    if (!saved.ok) throw new Error(saved.blockers[0].detail);
    const reloaded = await readCurrent(request, signal);
    if (
      reloaded.outer.status !== 'present' ||
      !reloaded.outer.currentRowBound ||
      !reloaded.outer.mediaType.endsWith('.v7+json') ||
      reloaded.outer.sha256 !== saved.receipt.sidecarSha256
    )
      throw new Error('The saved Composite V7 arrangement changed before fresh readback.');
    const verified = await decodePatternImportDxfProductCompositeSidecarV7(reloaded.outer.bytes);
    if (!verified.ok) throw new Error(verified.blockers[0].detail);
    const verifiedPhysical = readPatternImportDxfProductCompositeComponentBytesV7(
      verified.owner,
      SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1,
    );
    const verifiedV6Bytes = readPatternImportDxfProductCompositeComponentBytesV7(
      verified.owner,
      'composite-v6',
    );
    if (!verifiedPhysical || !sameBytes(physicalBytes, verifiedPhysical) || !verifiedV6Bytes)
      throw new Error('Fresh Composite V7 readback did not preserve physical initialization.');
    const verifiedV6 = await decodePatternImportDxfProductCompositeSidecarV6(verifiedV6Bytes);
    if (!verifiedV6.ok) throw new Error(verifiedV6.blockers[0].detail);
    const verifiedV5 = readPatternImportDxfProductCompositeComponentBytesV6(
      verifiedV6.owner,
      'composite-v5',
    );
    const verifiedArrangement = readPatternImportDxfProductCompositeComponentBytesV6(
      verifiedV6.owner,
      'cad-mannequin-arrangement-v1',
    );
    if (
      !verifiedV5 ||
      !sameBytes(nestedBytes, verifiedV5) ||
      !verifiedArrangement ||
      !sameBytes(arrangementBytes, verifiedArrangement)
    )
      throw new Error(
        'Fresh Composite V7 readback differs from the saved presentation arrangement.',
      );
    assertCurrent();
    return saved;
  }
  const { source, scope, mannequin } = arrangement.bindings;
  assertCurrent();
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
  assertCurrent();
  return saved;
}
