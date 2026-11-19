import type { AdminService } from 'api/proto-http/admin';
import { createPatternImportDxfProductCompositeSidecarStorageWriterV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';
import {
  completeSavedAssemblyRowIdentityV1,
  readCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';
import { canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical } from './saved-assembly-topology-hash-v1';
import type { readCurrentSavedNeutralPlacementModelV1 } from './saved-cross-material-placement-model-binding-v1';
import {
  buildSavedWholeAssemblyPlacementDocumentV10,
  readSavedWholeAssemblyPlacementDocumentV10,
  SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10,
  type SavedWholeAssemblyPlacementLayoutV10,
} from './saved-whole-assembly-placement-document-v10';

const requestSchema = 'pattern-import-dxf-product-composite-sidecar-storage-request/10';
const receiptSchema = 'pattern-import-dxf-product-composite-sidecar-storage-receipt/10';
const utf8 = new TextDecoder('utf-8', { fatal: true });

type PlacementClient = Pick<
  AdminService,
  | 'GetTechCardSavedAssemblySnapshot'
  | 'GetTechCardPatternSemanticSidecar'
  | 'PutTechCardPatternSemanticSidecar'
>;
type ReadCurrentBody = (
  signal: AbortSignal,
) => ReturnType<typeof readCurrentSavedNeutralPlacementModelV1>;

/** Saves exact initial coordinates using the existing MAIN semantic-sidecar CAS. */
export async function persistSavedWholeAssemblyPlacementV10(
  createClient: (signal: AbortSignal) => PlacementClient,
  source: CompleteSavedAssemblySourceV1,
  layout: SavedWholeAssemblyPlacementLayoutV10,
  readCurrentBody: ReadCurrentBody,
  signal: AbortSignal,
  rebuild?: Parameters<typeof buildSavedWholeAssemblyPlacementDocumentV10>[4],
) {
  const previous = rebuild?.previous ?? source.priorCarrier;
  if (
    !previous ||
    !previous.sidecarBytes ||
    !previous.sidecarSha256 ||
    !previous.postSaveReceiptSha256 ||
    !previous.mediaType
  )
    throw new Error('Open the current saved native review before saving the full placement.');
  const snapshot = structuredClone(layout);
  const body = await readCurrentBody(signal);
  const submitted = await buildSavedWholeAssemblyPlacementDocumentV10(
    source,
    snapshot,
    body,
    signal,
    rebuild,
  );
  const { anchorRow, serverAssemblyRevision, completeSourceSha256 } = submitted.document.bindings;
  const row = completeSavedAssemblyRowIdentityV1(anchorRow);
  const target = { row, serverAssemblyRevision, assemblyTopologySha256: completeSourceSha256 };
  const pinned = {
    expectedServerAssemblyRevision: serverAssemblyRevision,
    expectedCompleteSourceSha256: completeSourceSha256,
  };
  const expectedText = utf8.decode(submitted.bytes);
  const previousText = utf8.decode(
    Uint8Array.from(atob(previous.sidecarBytes), (character) => character.charCodeAt(0)),
  );

  const writer = createPatternImportDxfProductCompositeSidecarStorageWriterV3(
    { createClient },
    {
      requestSchemaVersion: requestSchema,
      receiptSchemaVersion: receiptSchema,
      mediaType: SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10,
      acceptedCurrentMediaTypes: [previous.mediaType],
      ...(rebuild && { historicalPredecessorLockVersion: previous.cardLockVersion }),
      label: 'Full assembly initial placement',
      async prepare(request, current) {
        if (
          current.status !== 'present' ||
          current.mediaType !== previous.mediaType ||
          current.sha256 !== previous.sidecarSha256 ||
          utf8.decode(current.bytes) !== previousText
        )
          throw new Error('The saved native review or full placement changed.');
        return {
          authority: request.currentAuthority,
          transport: {
            patternVersion: anchorRow.patternVersion,
            postSaveReceiptSha256: submitted.postSaveReceiptSha256,
            selectedOperationNumber: submitted.review.document.selection.operationNumber,
          },
          previousSidecarSha256: submitted.document.writeCas.expectedPreviousSidecarSha256,
          previousPostSaveReceiptSha256: previous.postSaveReceiptSha256,
          sidecarSha256: submitted.sha256,
          byteLength: submitted.bytes.byteLength,
          bytes: submitted.bytes,
          mediaType: SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10,
        };
      },
      async beforeRequest(_request, _planned, active) {
        const checked = createClient(active);
        const [latest, liveBody, stale] = await Promise.all([
          readCompleteSavedAssemblySourceV1(
            checked,
            row,
            { ...pinned, ...(rebuild && { sourceOnly: true }) },
            active,
          ),
          readCurrentBody(active),
          rebuild
            ? checked.GetTechCardPatternSemanticSidecar({
                techCardId: row.techCardId,
                patternLineKey: row.patternLineKey,
              })
            : null,
        ]);
        const saved = rebuild ? stale?.semanticSidecar : latest.priorCarrier;
        if (
          !saved ||
          saved.mediaType !== previous.mediaType ||
          saved.cardLockVersion !== previous.cardLockVersion ||
          saved.sidecarSha256 !== previous.sidecarSha256 ||
          saved.postSaveReceiptSha256 !== previous.postSaveReceiptSha256 ||
          saved.sidecarBytes !== previous.sidecarBytes ||
          canonical(liveBody) !== canonical(submitted.world.body)
        )
          throw new Error(
            'The saved source or displayed mannequin changed before the placement save.',
          );
      },
      async verifyCanonical(bytes) {
        return utf8.decode(bytes) === expectedText;
      },
    },
  );

  const result = await writer.persist(
    { schemaVersion: requestSchema, currentAuthority: target },
    signal,
  );
  const reopen = async () => {
    const source = await readCompleteSavedAssemblySourceV1(
      createClient(signal),
      row,
      pinned,
      signal,
    );
    const reopened = await readSavedWholeAssemblyPlacementDocumentV10(source, signal);
    if (reopened.sha256 !== submitted.sha256 || reopened.base64 !== submitted.base64)
      throw new Error('The fresh Complete Source returned a different full placement.');
    return { source, reopened };
  };
  if (result.ok) return { ...(await reopen()), receipt: result.receipt };

  signal.throwIfAborted();
  const failure = new Error(
    result.blockers[0]?.detail ?? 'The whole placement could not be saved.',
  );
  if (result.writeOutcome === 'not-attempted') throw failure;
  try {
    const [current, narrow, liveBody] = await Promise.all([
      reopen(),
      createClient(signal).GetTechCardPatternSemanticSidecar({
        techCardId: row.techCardId,
        patternLineKey: row.patternLineKey,
      }),
      readCurrentBody(signal),
    ]);
    signal.throwIfAborted();
    const carrier = narrow.semanticSidecar;
    if (
      carrier?.techCardId !== row.techCardId ||
      carrier.patternLineKey !== row.patternLineKey ||
      carrier.savedRowRevision !== row.revision ||
      carrier.cardLockVersion !== row.cardLockVersion ||
      carrier.patternVersion !== anchorRow.patternVersion ||
      carrier.dxfSha256 !== row.sha256 ||
      carrier.mediaType !== SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10 ||
      carrier.sidecarSha256 !== submitted.sha256 ||
      carrier.postSaveReceiptSha256 !== submitted.postSaveReceiptSha256 ||
      carrier.byteLength !== submitted.bytes.byteLength ||
      carrier.sidecarBytes !== submitted.base64 ||
      canonical(liveBody) !== canonical(submitted.world.body)
    )
      throw failure;
    return { ...current, receipt: undefined };
  } catch {
    signal.throwIfAborted();
    throw failure;
  }
}
