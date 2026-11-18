import type { AdminService } from 'api/proto-http/admin';
import { createPatternImportDxfProductCompositeSidecarStorageWriterV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';
import {
  completeSavedAssemblyRowIdentityV1,
  readCompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';
import {
  canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical,
  computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1,
} from './saved-assembly-topology-hash-v1';
import { SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8 } from './saved-complete-assembly-native-stitch-review-v8';
import type { readCurrentSavedNeutralPlacementModelV1 } from './saved-cross-material-placement-model-binding-v1';
import {
  readSavedCrossMaterialPlacementDocumentV9,
  SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9,
  type buildSavedCrossMaterialPlacementDocumentV9,
} from './saved-cross-material-placement-document-v9';

const requestSchema = 'pattern-import-dxf-product-composite-sidecar-storage-request/9';
const receiptSchema = 'pattern-import-dxf-product-composite-sidecar-storage-receipt/9';
const utf8 = new TextDecoder('utf-8', { fatal: true });

type PlacementClient = Pick<
  AdminService,
  | 'GetTechCardSavedAssemblySnapshot'
  | 'GetTechCardPatternSemanticSidecar'
  | 'PutTechCardPatternSemanticSidecar'
>;
type CurrentBody = ReturnType<typeof readCurrentSavedNeutralPlacementModelV1>;
type Prepared = Awaited<ReturnType<typeof buildSavedCrossMaterialPlacementDocumentV9>>;

/** Transitions exact V8 into initial placement through the established single-row CAS. */
export async function persistSavedCrossMaterialPlacementV9(
  createClient: (signal: AbortSignal) => PlacementClient,
  prepared: Prepared,
  readCurrentBody: (signal: AbortSignal) => CurrentBody,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const submitted = structuredClone(prepared);
  const { anchorRow, serverAssemblyRevision, completeSourceSha256 } = submitted.document.bindings;
  const [prior] = submitted.document.components;
  const row = completeSavedAssemblyRowIdentityV1(anchorRow);
  const target = {
    row,
    serverAssemblyRevision,
    assemblyTopologySha256: completeSourceSha256,
  };
  const pinned = {
    expectedServerAssemblyRevision: serverAssemblyRevision,
    expectedCompleteSourceSha256: completeSourceSha256,
  };
  const previous = submitted.document.writeCas.expectedPreviousSidecarSha256;
  const previousText = utf8.decode(
    Uint8Array.from(atob(prior.base64), (char) => char.charCodeAt(0)),
  );
  const expectedText = utf8.decode(submitted.bytes);
  if (prior.sha256 !== previous)
    throw new Error('The initial placement requires its unchanged exact saved V8.');

  const previousPostSaveReceiptSha256 =
    await computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1(
      'tech-card-complete-source-native-review/1',
      JSON.parse(previousText),
      undefined,
      signal,
    );
  const writer = createPatternImportDxfProductCompositeSidecarStorageWriterV3(
    { createClient },
    {
      requestSchemaVersion: requestSchema,
      receiptSchemaVersion: receiptSchema,
      mediaType: SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9,
      acceptedCurrentMediaTypes: [SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8],
      label: 'Cross-material initial placement',
      async prepare(request, current) {
        if (
          current.status !== 'present' ||
          current.mediaType !== SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8 ||
          current.sha256 !== previous ||
          utf8.decode(current.bytes) !== previousText
        )
          throw new Error('The current saved review differs from the confirmed initial placement.');
        return {
          authority: request.currentAuthority,
          transport: {
            patternVersion: anchorRow.patternVersion,
            postSaveReceiptSha256: submitted.postSaveReceiptSha256,
            selectedOperationNumber: submitted.operationNumber,
          },
          previousSidecarSha256: previous,
          previousPostSaveReceiptSha256,
          sidecarSha256: submitted.sha256,
          byteLength: submitted.bytes.byteLength,
          bytes: submitted.bytes,
          mediaType: SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9,
        };
      },
      async beforeRequest(_request, _planned, active) {
        const [current, body] = await Promise.all([
          readCompleteSavedAssemblySourceV1(createClient(active), row, pinned, active),
          readCurrentBody(active),
        ]);
        const saved = current.priorCarrier;
        if (
          saved?.mediaType !== SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8 ||
          saved.sidecarSha256 !== previous ||
          saved.postSaveReceiptSha256 !== previousPostSaveReceiptSha256 ||
          saved.sidecarBytes !== prior.base64 ||
          canonical(body) !== canonical(submitted.placement.body)
        )
          throw new Error('The saved review or displayed mannequin changed before placement save.');
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
  if (!result.ok)
    throw new Error(result.blockers[0]?.detail ?? 'The initial placement could not be saved.');
  const source = await readCompleteSavedAssemblySourceV1(createClient(signal), row, pinned, signal);
  const reopened = await readSavedCrossMaterialPlacementDocumentV9(source, signal);
  if (reopened.sha256 !== submitted.sha256)
    throw new Error('The fresh Complete Source returned a different saved placement.');
  return { receipt: result.receipt, source, reopened };
}
