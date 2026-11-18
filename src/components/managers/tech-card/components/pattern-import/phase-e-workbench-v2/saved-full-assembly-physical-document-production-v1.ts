import {
  isCurrentSavedGenericObservedPhysicalHostPersistenceContextV1,
  projectSavedGenericObservedPhysicalHostPersistenceContextV1,
  type SavedGenericObservedPhysicalHostPersistenceContextV1,
} from 'components/cloth-simulation-spike/saved-generic-observed-physical-host-v1';
import { encodeDxfGarmentPhysicalInitializationV1 } from 'lib/cloth/domain/dxf-garment-physical-initialization-v1';
import type { PatternImportDxfProductCompositeSidecarBindingsV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  buildSavedFullAssemblyPhysicalComponentV1,
  encodeSavedFullAssemblyPhysicalComponentV1,
  projectSavedFullAssemblyAoOnlySnapshotV1,
  type SavedFullAssemblyPhysicalComponentOwnerV1,
} from './saved-full-assembly-physical-component-v1';
import {
  disposeSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  readSavedFullAssemblySnapshotV1,
  type SavedFullAssemblySnapshotProjectionV1,
} from './saved-full-assembly-snapshot-production-v1';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 } from './composite-sidecar-v6';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
  createPatternImportDxfProductCompositeSidecarProductionStorageAdapterV7,
} from './composite-sidecar-persistence-v7';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7,
  buildPatternImportDxfProductCompositeSidecarV7,
  decodePatternImportDxfProductCompositeSidecarV7,
  disposeSavedFullAssemblyPhysicalAuthorityReceiptV1,
  encodePatternImportDxfProductCompositeSidecarV7,
  isSavedFullAssemblyPhysicalAuthorityReceiptV1,
  readPatternImportDxfProductCompositeComponentBytesV7,
  verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority,
} from './composite-sidecar-v7';

export const SAVED_FULL_ASSEMBLY_PHYSICAL_DOCUMENT_PERSISTENCE_V1 =
  'saved-full-assembly-physical-document-persistence/1' as const;

export type SavedFullAssemblyPhysicalDocumentPersistenceBlockerV1 = Readonly<{
  code: string;
  detail: string;
}>;

export type SavedFullAssemblyPhysicalDocumentPersistenceResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof SAVED_FULL_ASSEMBLY_PHYSICAL_DOCUMENT_PERSISTENCE_V1;
      writeOutcome: 'verified' | 'verified-after-unknown';
      receipt: Readonly<{
        sidecarSha256: string;
        canonicalByteLength: number;
        mediaType: string;
      }>;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof SAVED_FULL_ASSEMBLY_PHYSICAL_DOCUMENT_PERSISTENCE_V1;
      writeOutcome: 'not-attempted' | 'unknown' | 'acknowledged-unverified';
      /** Exact candidate sent through the sole CAS when a write may have reached storage. */
      intendedOuterSha256: string | null;
      receipt: null;
      blockers: readonly [SavedFullAssemblyPhysicalDocumentPersistenceBlockerV1];
    }>;

type TransportAnchorV1 = Readonly<{
  sourceOperationNumber: number;
  serverTopologySha256: string;
}>;

type PreparedPhysicalDocumentV1 = Readonly<{
  context: SavedGenericObservedPhysicalHostPersistenceContextV1;
  snapshot: SavedFullAssemblySnapshotProjectionV1;
  component: SavedFullAssemblyPhysicalComponentOwnerV1;
  transportAnchor: TransportAnchorV1;
}>;

const SHA256 = /^[0-9a-f]{64}$/;

class PhysicalDocumentPersistenceFailureV1 extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
    this.name = 'PhysicalDocumentPersistenceFailureV1';
  }
}

function fail(code: string, detail: string): never {
  throw new PhysicalDocumentPersistenceFailureV1(code, detail);
}

function checkSignal(signal: AbortSignal): void {
  if (signal.aborted) fail('cancelled', 'Full Assembly physical document save was cancelled.');
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
  );
}

/**
 * The transport locator is derived from durable graph content. UI selection and the currently
 * displayed Assembly Order operation never participate, so a fuse/press operation cannot be
 * coerced into a stitch merely because it is selected on the card.
 */
function graphTransportOperation(
  context: SavedGenericObservedPhysicalHostPersistenceContextV1,
): SavedGenericObservedPhysicalHostPersistenceContextV1['graph']['operations'][number] {
  const operation = context.graph.operations.find(
    (candidate) =>
      candidate.kind === 'stitch' &&
      Number.isSafeInteger(candidate.sourceOperationNumber) &&
      candidate.sourceOperationNumber > 0 &&
      candidate.seamIds.length > 0,
  );
  if (!operation)
    fail(
      'transport-anchor-unavailable',
      'The complete graph has no genuine seam-bearing stitch operation for the storage CAS.',
    );
  return operation;
}

function transportAnchor(
  context: SavedGenericObservedPhysicalHostPersistenceContextV1,
  snapshot: SavedFullAssemblySnapshotProjectionV1,
): TransportAnchorV1 {
  const operation = graphTransportOperation(context);
  const graphSeams = operation.seamIds.map((seamId) => {
    const matches = context.graph.seams.filter(
      (seam) => seam.id === seamId && seam.clientOperationId === operation.clientOperationId,
    );
    if (matches.length !== 1)
      fail(
        'transport-anchor-invalid',
        'The first graph stitch does not own every referenced seam exactly once.',
      );
    return matches[0].sourceSeamKey;
  });
  const savedOperation = snapshot.operations.find(
    (candidate) => candidate.operationNumber === operation.sourceOperationNumber,
  );
  if (
    !savedOperation ||
    !savedOperation.seamKeys.length ||
    !sameStrings(savedOperation.seamKeys, graphSeams)
  )
    fail(
      'transport-anchor-drift',
      'The first graph stitch no longer exact-matches its fresh Assembly Order operation.',
    );
  const receipts = snapshot.selectedTopologyReceipts.filter(
    (receipt) => receipt.sourceOperationNumber === operation.sourceOperationNumber,
  );
  if (receipts.length !== 1 || !SHA256.test(receipts[0].sha256))
    fail(
      'transport-anchor-drift',
      'The fresh Assembly Order snapshot has no unique topology receipt for the graph stitch.',
    );
  return Object.freeze({
    sourceOperationNumber: operation.sourceOperationNumber,
    serverTopologySha256: receipts[0].sha256,
  });
}

async function preparePhysicalDocument(
  host: unknown,
  expectedGeneration: number,
  signal: AbortSignal,
): Promise<PreparedPhysicalDocumentV1> {
  checkSignal(signal);
  if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 1)
    fail('invalid-generation', 'A current positive generic-host generation is required.');
  const projected = await projectSavedGenericObservedPhysicalHostPersistenceContextV1(
    host,
    expectedGeneration,
    signal,
  );
  checkSignal(signal);
  if (!projected.ok) fail(projected.code, projected.detail);
  const context = projected.context;
  const first = graphTransportOperation(context);
  const receipt = await readSavedFullAssemblySnapshotV1(
    { row: context.assemblySnapshot.row, seedOperationNumber: first.sourceOperationNumber },
    signal,
  );
  let snapshot: SavedFullAssemblySnapshotProjectionV1;
  try {
    snapshot = projectSavedFullAssemblySnapshotV1(receipt);
  } finally {
    disposeSavedFullAssemblySnapshotV1(receipt);
  }
  checkSignal(signal);
  if (snapshot.snapshotSha256 !== context.readEvidence.fullAssemblySnapshotSha256)
    fail(
      'fresh-assembly-drift',
      'The Assembly Order or current outer sidecar changed after the generic physical projection.',
    );
  const anchor = transportAnchor(context, snapshot);
  const aoSnapshot = projectSavedFullAssemblyAoOnlySnapshotV1(snapshot);
  const encodedInitialization = await encodeDxfGarmentPhysicalInitializationV1(
    {
      document: context.physicalInitialization.document,
      graph: context.graph,
      assemblySnapshot: aoSnapshot,
    },
    signal,
  );
  checkSignal(signal);
  if (encodedInitialization.canonicalSha256 !== context.physicalInitialization.canonicalSha256)
    fail(
      'physical-initialization-drift',
      'The current physical initialization changed during its fresh graph verification.',
    );
  const component = await buildSavedFullAssemblyPhysicalComponentV1(
    {
      bindings: {
        row: snapshot.row,
        serverAssemblyRevision: snapshot.serverAssemblyRevision,
      },
      graph: context.graph,
      graphCanonicalSha256: context.graphCanonicalSha256,
      compileInputSha256: context.compileInputSha256,
      physicalInitializationBytes: encodedInitialization.bytes,
      assemblySnapshot: snapshot,
    },
    signal,
  );
  checkSignal(signal);
  if (!component.ok) fail(component.blockers[0].code, component.blockers[0].detail);
  return Object.freeze({ context, snapshot, component: component.owner, transportAnchor: anchor });
}

async function buildNextOuter(prepared: PreparedPhysicalDocumentV1, signal: AbortSignal) {
  checkSignal(signal);
  const outer = prepared.snapshot.outer;
  if (
    outer.status !== 'present' ||
    (outer.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6 &&
      outer.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7) ||
    !outer.currentRowBound
  )
    fail(
      'current-v6-required',
      'Save the current mannequin arrangement as Composite V6 before adding physical authority.',
    );
  let nestedV6Bytes = outer.bytes;
  if (outer.mediaType === PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7) {
    const currentV7 = await decodePatternImportDxfProductCompositeSidecarV7(outer.bytes);
    if (!currentV7.ok) fail('current-v7-invalid', currentV7.blockers[0].detail);
    const nested = readPatternImportDxfProductCompositeComponentBytesV7(
      currentV7.owner,
      'composite-v6',
    );
    if (!nested) fail('current-v7-invalid', 'Current V7 has no exact nested V6 bytes.');
    nestedV6Bytes = nested;
  }
  const physical = encodeSavedFullAssemblyPhysicalComponentV1(prepared.component);
  if (!physical.ok || !physical.bytes)
    fail('physical-component-invalid', 'The verified physical component owner cannot be encoded.');
  const authority: PatternImportDxfProductCompositeSidecarBindingsV3 = Object.freeze({
    row: prepared.snapshot.row,
    serverAssemblyRevision: prepared.snapshot.serverAssemblyRevision,
    assemblyTopologySha256: prepared.transportAnchor.serverTopologySha256,
  });
  const next = await buildPatternImportDxfProductCompositeSidecarV7({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7,
    expectedPreviousSidecarSha256: outer.sha256,
    bindings: authority,
    compositeV6Bytes: nestedV6Bytes,
    fullAssemblyPhysicalBytes: physical.bytes,
  });
  checkSignal(signal);
  if (!next.ok) fail(next.blockers[0].code, next.blockers[0].detail);
  if (
    next.document.bindings.assemblyTopologySha256 !== prepared.transportAnchor.serverTopologySha256
  )
    fail(
      'transport-anchor-drift',
      'Current Composite V6 is not anchored to the first genuine graph stitch.',
    );
  const encoded = encodePatternImportDxfProductCompositeSidecarV7(next.owner);
  if (!encoded.ok) fail('next-v7-invalid', 'The verified Composite V7 owner cannot be encoded.');
  return Object.freeze({ owner: next.owner, encoded, authority });
}

async function verifyDurableReadback(
  prepared: PreparedPhysicalDocumentV1,
  intended: Readonly<{
    bytes: Uint8Array<ArrayBuffer>;
    canonicalSha256: string;
    canonicalByteLength: number;
  }>,
  signal: AbortSignal,
) {
  const snapshotReceipt = await readSavedFullAssemblySnapshotV1(
    {
      row: prepared.snapshot.row,
      seedOperationNumber: prepared.transportAnchor.sourceOperationNumber,
    },
    signal,
  );
  let authorityReceipt: unknown = null;
  try {
    const snapshot = projectSavedFullAssemblySnapshotV1(snapshotReceipt);
    checkSignal(signal);
    const outer = snapshot.outer;
    if (
      outer.status !== 'present' ||
      outer.mediaType !== PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7 ||
      outer.sha256 !== intended.canonicalSha256 ||
      outer.byteLength !== intended.canonicalByteLength ||
      !outer.currentRowBound ||
      !sameBytes(outer.bytes, intended.bytes)
    )
      fail('v7-readback-drift', 'Fresh saved Composite V7 differs from the intended exact bytes.');
    const decoded = await decodePatternImportDxfProductCompositeSidecarV7(outer.bytes);
    if (!decoded.ok) fail('v7-readback-invalid', decoded.blockers[0].detail);
    const authority = await verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority(
      decoded.owner,
      snapshotReceipt,
    );
    if (!authority.ok || !isSavedFullAssemblyPhysicalAuthorityReceiptV1(authority.receipt))
      fail(
        authority.ok ? 'v7-authority-forged' : authority.blocker.code,
        authority.ok
          ? 'Fresh V7 did not mint a genuine physical authority receipt.'
          : authority.blocker.detail,
      );
    authorityReceipt = authority.receipt;
    return Object.freeze({
      sidecarSha256: outer.sha256,
      canonicalByteLength: outer.byteLength,
      mediaType: outer.mediaType,
    });
  } finally {
    disposeSavedFullAssemblyPhysicalAuthorityReceiptV1(authorityReceipt);
    disposeSavedFullAssemblySnapshotV1(snapshotReceipt);
  }
}

function blocked(
  error: unknown,
  writeOutcome: Extract<
    SavedFullAssemblyPhysicalDocumentPersistenceResultV1,
    { ok: false }
  >['writeOutcome'] = 'not-attempted',
  intendedOuterSha256: string | null = null,
): Extract<SavedFullAssemblyPhysicalDocumentPersistenceResultV1, { ok: false }> {
  const failure =
    error instanceof PhysicalDocumentPersistenceFailureV1
      ? error
      : new PhysicalDocumentPersistenceFailureV1(
          'physical-document-save-blocked',
          error instanceof Error ? error.message : 'Full Assembly physical save failed closed.',
        );
  return Object.freeze({
    ok: false as const,
    schemaVersion: SAVED_FULL_ASSEMBLY_PHYSICAL_DOCUMENT_PERSISTENCE_V1,
    writeOutcome,
    intendedOuterSha256,
    receipt: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [SavedFullAssemblyPhysicalDocumentPersistenceBlockerV1],
  });
}

/**
 * Sole non-injectable TABLE persistence entrypoint. The registered V7 codec and the existing
 * StorageWriterV3 perform the exact current V6/V7 CAS; every authority input is projected or
 * reread internally rather than accepted from a caller.
 */
export async function persistCurrentSavedGenericObservedPhysicalHostV1(
  host: unknown,
  expectedGeneration: number,
  signal?: AbortSignal,
): Promise<SavedFullAssemblyPhysicalDocumentPersistenceResultV1> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) controller.abort();
    const prepared = await preparePhysicalDocument(host, expectedGeneration, controller.signal);
    const next = await buildNextOuter(prepared, controller.signal);
    const storage = createPatternImportDxfProductCompositeSidecarProductionStorageAdapterV7(
      host,
      prepared.context,
    );
    const stored = await storage.persist(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
        transitionIntent: 'physical',
        currentAuthority: next.authority,
        transportAnchor: prepared.transportAnchor,
        nextOwner: next.owner,
      },
      controller.signal,
    );
    if (!stored.ok && stored.writeOutcome === 'not-attempted')
      return blocked(
        new PhysicalDocumentPersistenceFailureV1(
          stored.blockers[0].code,
          stored.blockers[0].detail,
        ),
        stored.writeOutcome,
      );
    try {
      // Once storage has dispatched the write, cancellation cannot mean it was never attempted.
      // Keep its outcome even when the source/body is replaced before durable readback.
      checkSignal(controller.signal);
      const receipt = await verifyDurableReadback(prepared, next.encoded, controller.signal);
      if (
        !isCurrentSavedGenericObservedPhysicalHostPersistenceContextV1(
          host,
          prepared.context,
          controller.signal,
        )
      )
        fail(
          'host-context-drift',
          'The genuine physical host changed while the storage transaction was in flight.',
        );
      return Object.freeze({
        ok: true as const,
        schemaVersion: SAVED_FULL_ASSEMBLY_PHYSICAL_DOCUMENT_PERSISTENCE_V1,
        writeOutcome: stored.ok ? ('verified' as const) : ('verified-after-unknown' as const),
        receipt,
        blockers: Object.freeze([]) as readonly [],
      });
    } catch (error) {
      const primary = !stored.ok && !controller.signal.aborted ? stored.blockers[0] : undefined;
      const failure =
        primary && error instanceof PhysicalDocumentPersistenceFailureV1
          ? new PhysicalDocumentPersistenceFailureV1(
              primary.code,
              `${primary.detail} Readback: ${error.message}`,
            )
          : error;
      return blocked(
        failure,
        stored.ok ? 'acknowledged-unverified' : stored.writeOutcome,
        next.encoded.canonicalSha256,
      );
    }
  } catch (error) {
    return blocked(error);
  } finally {
    signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}
