import type { prepareDirectedSourceCutPreviewV1 } from 'components/cloth-simulation-spike/run-directed-source-cut-preview-v1';
import { sha256Hex } from 'lib/features/sha256';
import {
  canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical,
  computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1,
} from './saved-assembly-topology-hash-v1';
import type { readCurrentSavedNeutralPlacementModelV1 } from './saved-cross-material-placement-model-binding-v1';
import {
  SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8,
  SAVED_COMPLETE_ASSEMBLY_NATIVE_REVIEW_V8,
  type restoreSavedCompleteAssemblyNativeStitchReviewV8,
} from './saved-complete-assembly-native-stitch-review-v8';

export const SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9 =
  'application/vnd.grbpwr.pattern-dxf-product-composite.v9+json';
export const SAVED_COMPLETE_ASSEMBLY_PLACEMENT_V9 =
  'pattern-import-dxf-product-composite-sidecar-document/9';
export const SAVED_COMPLETE_ASSEMBLY_PLACEMENT_PROFILE_V1 =
  'saved-full-assembly/native-cross-row-stitch-world-placement/1';
export const SAVED_COMPLETE_ASSEMBLY_DIRECTED_PLACEMENT_COMPONENT_V1 =
  'tech-card-complete-source-native-world-placement/1';

const maximumCarrierBytes = 4 * 1024 * 1024;
const maximumNestedV8Bytes = 3 * 1024 * 1024 - 8192;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const shaPattern = /^[a-f0-9]{64}$/;

type Restored = Awaited<ReturnType<typeof restoreSavedCompleteAssemblyNativeStitchReviewV8>>;
type Body = Awaited<ReturnType<typeof readCurrentSavedNeutralPlacementModelV1>>;
type Placement = Awaited<ReturnType<typeof prepareDirectedSourceCutPreviewV1>>['placement'];
type CenterMm = readonly [number, number, number];

function base64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8_192)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  return btoa(binary);
}

async function component(kind: string, mediaType: string, bytes: Uint8Array, signal: AbortSignal) {
  const sha256 = await sha256Hex(bytes);
  signal.throwIfAborted();
  if (!shaPattern.test(sha256)) throw new Error('SHA-256 is required for each saved component.');
  return { kind, mediaType, sha256, byteLength: bytes.byteLength, base64: base64(bytes) };
}

/** Packages the exact saved stitch and the existing compiler's initial world placement. */
export async function buildSavedCrossMaterialPlacementDocumentV9(
  confirmed: Readonly<{
    review: Pick<Restored, 'document' | 'bytes' | 'sha256'>;
    body: Body;
    authoredCenterMm: CenterMm;
    placement: Placement;
    previousPlacementSha256?: string;
  }>,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const review = structuredClone(confirmed.review);
  const body = structuredClone(confirmed.body);
  const placement = structuredClone(confirmed.placement);
  const previousPlacementSha256 = confirmed.previousPlacementSha256;
  const centerMm = confirmed.authoredCenterMm.map((value) => (value === 0 ? 0 : value));
  const selection = review.document.selection;
  if (
    centerMm.length !== 3 ||
    (previousPlacementSha256 !== undefined && !shaPattern.test(previousPlacementSha256)) ||
    centerMm.some((value) => !Number.isFinite(value) || Math.abs(value) > 10_000) ||
    !Number.isSafeInteger(body.modelId) ||
    body.modelId < 1 ||
    !/Z$/.test(body.modelUpdatedAt) ||
    !Number.isFinite(Date.parse(body.modelUpdatedAt)) ||
    body.pose.kind !== 'neutral-default-direct-v9' ||
    ![
      body.modelPhysicalInputsSha256,
      body.pose.canonicalSha256,
      body.observed.bodyPositionsFloat32LeSha256,
      body.observed.bodyTrianglesUint32LeSha256,
      placement.gridSha256,
      placement.carrierMaterialPositionsFloat64LeSha256,
      placement.carrierTrianglesUint32LeSha256,
      placement.positionsInvMassFloat32LeSha256,
    ].every((value) => shaPattern.test(value))
  )
    throw new Error(
      'An exact initial placement and current displayed neutral mannequin are required.',
    );

  if (
    review.document.schemaVersion !== SAVED_COMPLETE_ASSEMBLY_NATIVE_REVIEW_V8 ||
    review.document.mediaType !== SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8 ||
    review.document.writeCas.expectedPreviousSidecarSha256 !== null ||
    review.bytes.byteLength > maximumNestedV8Bytes ||
    canonical(review.document, maximumNestedV8Bytes) !== decoder.decode(review.bytes) ||
    placement.gridSha256 !== review.document.review.gridSha256 ||
    placement.pieces.length !== 2
  )
    throw new Error(
      'The saved stitch and current initial placement must share the exact V8 source.',
    );

  const expectedCenterM = centerMm.map((value) => value / 1000);
  for (const [index, piece] of placement.pieces.entries()) {
    if (
      piece.pieceId !== selection.members[index]!.pieceLineKey ||
      piece.originMm.length !== 2 ||
      !piece.originMm.every(Number.isFinite) ||
      piece.centerM.length !== 3 ||
      piece.centerM[0] !== expectedCenterM[0] ||
      piece.centerM[1] !== expectedCenterM[1] ||
      piece.centerM[2] !== expectedCenterM[2]! + (index === 0 ? 0.004 : 0) ||
      !Number.isFinite(piece.cos) ||
      !Number.isFinite(piece.sin) ||
      Math.abs(piece.cos ** 2 + piece.sin ** 2 - 1) > 1e-12
    )
      throw new Error('The compiled pieces differ from the confirmed initial world placement.');
  }
  if (
    placement.pieces[0]!.cos !== placement.pieces[1]!.cos ||
    placement.pieces[0]!.sin !== placement.pieces[1]!.sin
  )
    throw new Error('Both directed sides must use the same compiled placement axis.');

  const prior = await component(
    'native-cross-row-review-v8',
    SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8,
    review.bytes,
    signal,
  );
  if (prior.sha256 !== review.sha256)
    throw new Error('The exact read-back V8 digest differs from the prior placement carrier.');

  const authored = {
    schemaVersion: SAVED_COMPLETE_ASSEMBLY_DIRECTED_PLACEMENT_COMPONENT_V1,
    reviewSha256: prior.sha256,
    body,
    placement: {
      centerMm,
      depthOffsetsMm: [4, 0],
      directedCut: placement,
    },
  };
  const physical = await component(
    'native-cross-row-world-placement-v1',
    'application/vnd.grbpwr.pattern-dxf-native-world-placement.v1+json',
    encoder.encode(canonical(authored)),
    signal,
  );
  const document = {
    schemaVersion: SAVED_COMPLETE_ASSEMBLY_PLACEMENT_V9,
    mediaType: SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9,
    encoding: 'canonical-json-utf8' as const,
    profile: SAVED_COMPLETE_ASSEMBLY_PLACEMENT_PROFILE_V1,
    bindings: review.document.bindings,
    writeCas: { expectedPreviousSidecarSha256: previousPlacementSha256 ?? prior.sha256 },
    components: [prior, physical] as const,
  };
  const bytes = encoder.encode(canonical(document, maximumCarrierBytes));
  const [sha256, postSaveReceiptSha256] = await Promise.all([
    sha256Hex(bytes),
    computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1(
      'tech-card-complete-source-native-placement/1',
      document,
      undefined,
      signal,
      maximumCarrierBytes + 128,
    ),
  ]);
  signal.throwIfAborted();
  if (!shaPattern.test(sha256)) throw new Error('The saved placement could not be hashed.');
  return {
    document,
    placement: authored,
    bytes,
    sha256,
    postSaveReceiptSha256,
    operationNumber: selection.operationNumber,
  };
}

/** Reads the existing carrier without applying world placement or starting a solver. */
export async function readSavedCrossMaterialPlacementDocumentV9(
  source: import('./saved-assembly-complete-source-rpc-v1').CompleteSavedAssemblySourceV1,
  signal: AbortSignal,
) {
  const { isVerifiedCompleteSavedAssemblySourceV1, completeSavedAssemblyRowIdentityV1 } =
    await import('./saved-assembly-complete-source-rpc-v1');
  signal.throwIfAborted();
  const carrier = source.priorCarrier;
  if (
    !isVerifiedCompleteSavedAssemblySourceV1(source) ||
    carrier?.mediaType !== SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9 ||
    !carrier.sidecarBytes
  )
    throw new Error('A current saved cross-material placement is required.');

  const decodeBase64 = (value: string, maximum: number) => {
    if (typeof value !== 'string' || !value || value.length > Math.ceil(maximum / 3) * 4)
      throw new Error('The saved placement component exceeds its byte limit.');
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    if (bytes.byteLength > maximum || base64(bytes) !== value)
      throw new Error('The saved placement component has noncanonical bytes.');
    return bytes;
  };
  const bytes = decodeBase64(carrier.sidecarBytes, maximumCarrierBytes);
  const text = decoder.decode(bytes);
  type Document = Awaited<
    ReturnType<typeof buildSavedCrossMaterialPlacementDocumentV9>
  >['document'];
  const document = JSON.parse(text) as Document;
  const { anchorRow, serverAssemblyRevision, completeSourceSha256 } = document.bindings;
  const selectedRow = source.rows.find(
    ({ patternLineKey }) => patternLineKey === anchorRow.patternLineKey,
  );
  if (
    canonical(document, maximumCarrierBytes) !== text ||
    document.schemaVersion !== SAVED_COMPLETE_ASSEMBLY_PLACEMENT_V9 ||
    document.mediaType !== SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9 ||
    document.profile !== SAVED_COMPLETE_ASSEMBLY_PLACEMENT_PROFILE_V1 ||
    document.encoding !== 'canonical-json-utf8' ||
    document.components.length !== 2 ||
    completeSourceSha256 !== source.sourceSha256 ||
    serverAssemblyRevision !== source.serverAssemblyRevision ||
    !selectedRow ||
    selectedRow.scopeKey !== 'main' ||
    canonical({
      ...completeSavedAssemblyRowIdentityV1(selectedRow),
      patternVersion: selectedRow.patternVersion,
    }) !== canonical(anchorRow) ||
    carrier.patternLineKey !== selectedRow.patternLineKey ||
    carrier.cardLockVersion !== anchorRow.cardLockVersion
  )
    throw new Error('The saved placement belongs to different source rows or Assembly Order.');

  const [review, physical] = document.components;
  const reviewBytes = decodeBase64(review.base64, maximumNestedV8Bytes);
  const physicalBytes = decodeBase64(physical.base64, 32_768);
  const [expectedReview, expectedPhysical, sha256, receipt] = await Promise.all([
    component(
      'native-cross-row-review-v8',
      SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8,
      reviewBytes,
      signal,
    ),
    component(
      'native-cross-row-world-placement-v1',
      'application/vnd.grbpwr.pattern-dxf-native-world-placement.v1+json',
      physicalBytes,
      signal,
    ),
    sha256Hex(bytes),
    computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1(
      'tech-card-complete-source-native-placement/1',
      document,
      undefined,
      signal,
      maximumCarrierBytes + 128,
    ),
  ]);
  if (
    !shaPattern.test(sha256) ||
    sha256 !== carrier.sidecarSha256 ||
    receipt !== carrier.postSaveReceiptSha256 ||
    carrier.byteLength !== bytes.byteLength ||
    canonical(expectedReview) !== canonical(review) ||
    canonical(expectedPhysical) !== canonical(physical) ||
    !shaPattern.test(document.writeCas.expectedPreviousSidecarSha256) ||
    document.writeCas.expectedPreviousSidecarSha256 === sha256
  )
    throw new Error('The placement and retained V8 bytes failed the known readback check.');

  const placementText = decoder.decode(physicalBytes);
  type World = Awaited<ReturnType<typeof buildSavedCrossMaterialPlacementDocumentV9>>['placement'];
  const world = JSON.parse(placementText) as World;
  const reviewText = decoder.decode(reviewBytes);
  const inner = JSON.parse(reviewText) as Restored['document'];
  if (
    canonical(world) !== placementText ||
    canonical(inner, maximumNestedV8Bytes) !== reviewText ||
    inner.schemaVersion !== SAVED_COMPLETE_ASSEMBLY_NATIVE_REVIEW_V8 ||
    inner.mediaType !== SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8 ||
    canonical(inner.bindings) !== canonical(document.bindings) ||
    world.schemaVersion !== SAVED_COMPLETE_ASSEMBLY_DIRECTED_PLACEMENT_COMPONENT_V1 ||
    world.reviewSha256 !== expectedReview.sha256 ||
    world.placement.directedCut.gridSha256 !== inner.review.gridSha256
  )
    throw new Error('The stored placement differs from the exact saved native review.');

  return {
    sha256,
    postSaveReceiptSha256: receipt,
    base64: carrier.sidecarBytes,
    world,
    review: { text: reviewText, sha256: expectedReview.sha256 },
  };
}
