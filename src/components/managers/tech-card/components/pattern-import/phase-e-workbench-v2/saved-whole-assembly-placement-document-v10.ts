import { MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9 } from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import {
  createModelMannequinPoseDocumentV2,
  fingerprintModelMannequinPoseDocumentV2,
} from 'lib/cloth/body/model-mannequin-pose-document-v2';
import { sha256Hex } from 'lib/features/sha256';
import {
  completeSavedAssemblyRowIdentityV1,
  isVerifiedCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';
import {
  canonicalizePatternImportDxfPhaseESavedAssemblyValueV1 as canonical,
  computePatternImportDxfPhaseEDomainSeparatedCanonicalSha256V1 as canonicalSeal,
} from './saved-assembly-topology-hash-v1';
import {
  SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8,
  SAVED_COMPLETE_ASSEMBLY_NATIVE_PROFILE_V1,
  SAVED_COMPLETE_ASSEMBLY_NATIVE_REVIEW_V8,
  type restoreSavedCompleteAssemblyNativeStitchReviewV8,
} from './saved-complete-assembly-native-stitch-review-v8';
import {
  decodeSavedCrossMaterialPlacementDocumentV9,
  decodeSavedNativePlacementBase64,
  encodeSavedNativePlacementBase64,
  hasExactSavedPlacementWireKeys as exactKeys,
  SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9,
} from './saved-cross-material-placement-document-v9';
import type { readCurrentSavedNeutralPlacementModelV1 } from './saved-cross-material-placement-model-binding-v1';

export const SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10 =
  'application/vnd.grbpwr.pattern-dxf-product-composite.v10+json';
export const SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_V10 =
  'pattern-import-dxf-product-composite-sidecar-document/10';
export const SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_PROFILE_V1 =
  'saved-full-assembly/native-whole-world-placement/1';
export const SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_COMPONENT_V1 =
  'tech-card-complete-source-native-whole-world-placement/1';

const retainedKind = 'retained-native-cross-row-carrier';
const worldKind = 'native-whole-world-placement-v1';
const worldMediaType = 'application/vnd.grbpwr.pattern-dxf-native-whole-world-placement.v1+json';
const receiptDomain = 'tech-card-complete-source-native-whole-placement/1';
const reviewDomain = 'tech-card-complete-source-native-review/1';
const anchorDomain = 'tech-card-saved-assembly-native-anchor/1';
const maximumCarrierBytes = 4 * 1024 * 1024;
const maximumWorldBytes = 131_072;
const maximumVertices = 2_000;
const maximumTriangles = 5_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const lowercaseSha = /^[a-f0-9]{64}$/;
const canonicalPieceId = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

type NativeReviewV8 = Awaited<
  ReturnType<typeof restoreSavedCompleteAssemblyNativeStitchReviewV8>
>['document'];
type NarrowPlacementV9 = Awaited<ReturnType<typeof decodeSavedCrossMaterialPlacementDocumentV9>>;
type StoredReview = Readonly<{ text: string; sha256: string; document: NativeReviewV8 }>;

export type SavedWholeAssemblyPlacementBodyV10 = Awaited<
  ReturnType<typeof readCurrentSavedNeutralPlacementModelV1>
>;

export type SavedWholeAssemblyPlacementPieceRangeV10 = Readonly<{
  pieceId: string;
  vertexOffset: number;
  vertexCount: number;
  triangleOffset: number;
  triangleCount: number;
}>;

export type SavedWholeAssemblyPlacementLayoutV10 = Readonly<{
  sizeId: number;
  sizeToken: string;
  runtimeCandidateSha256: string;
  cutGraphSha256: string;
  pieceRanges: readonly SavedWholeAssemblyPlacementPieceRangeV10[];
  positionsM: Float32Array;
}>;

type BlobWire = Readonly<{ byteLength: number; sha256: string; base64: string }>;
type ComponentWire<Kind extends string, MediaType extends string> = BlobWire &
  Readonly<{ kind: Kind; mediaType: MediaType }>;
type LegacyMediaType =
  | typeof SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8
  | typeof SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9;
type RetainedCarrier = ComponentWire<typeof retainedKind, LegacyMediaType>;

type WorldWire = Readonly<{
  schemaVersion: typeof SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_COMPONENT_V1;
  retainedCarrierSha256: string;
  body: SavedWholeAssemblyPlacementBodyV10;
  layout: Omit<SavedWholeAssemblyPlacementLayoutV10, 'positionsM'> &
    Readonly<{ positions: BlobWire & Readonly<{ encoding: 'float32-le-xyz' }> }>;
}>;

type DocumentWire = Readonly<{
  schemaVersion: typeof SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_V10;
  mediaType: typeof SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10;
  encoding: 'canonical-json-utf8';
  profile: typeof SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_PROFILE_V1;
  bindings: NativeReviewV8['bindings'];
  writeCas: Readonly<{ expectedPreviousSidecarSha256: string }>;
  components: readonly [RetainedCarrier, ComponentWire<typeof worldKind, typeof worldMediaType>];
}>;

type RetainedReview = Readonly<{
  retainedCarrier: RetainedCarrier;
  review: StoredReview;
  narrowPlacement?: NarrowPlacementV9;
}>;

export type SavedWholeAssemblyPlacementResultV10 = RetainedReview &
  Readonly<{
    document: DocumentWire;
    world: WorldWire;
    body: SavedWholeAssemblyPlacementBodyV10;
    layout: SavedWholeAssemblyPlacementLayoutV10;
    positionsM: Float32Array;
    bytes: Uint8Array<ArrayBuffer>;
    base64: string;
    sha256: string;
    postSaveReceiptSha256: string;
  }>;

function isSha(value: unknown): value is string {
  return typeof value === 'string' && lowercaseSha.test(value);
}

function positiveInt32(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
}

function parseCanonical<T>(bytes: Uint8Array, limit: number): { text: string; document: T } {
  if (!bytes.byteLength || bytes.byteLength > limit)
    throw new Error('The saved placement document exceeds its byte limit.');
  const text = decoder.decode(bytes);
  const document = JSON.parse(text) as T;
  if (canonical(document, limit) !== text)
    throw new Error('The saved placement document must be exactly canonical JSON.');
  return { text, document };
}

async function digest(bytes: Uint8Array, signal: AbortSignal) {
  signal.throwIfAborted();
  const sha256 = await sha256Hex(bytes);
  signal.throwIfAborted();
  if (!isSha(sha256)) throw new Error('SHA-256 is required for the saved layout.');
  return sha256;
}

async function describeBytes(bytes: Uint8Array, signal: AbortSignal): Promise<BlobWire> {
  return {
    byteLength: bytes.byteLength,
    sha256: await digest(bytes, signal),
    base64: encodeSavedNativePlacementBase64(bytes),
  };
}

async function readBytes(blob: BlobWire, limit: number, signal: AbortSignal) {
  signal.throwIfAborted();
  if (
    !Number.isSafeInteger(blob.byteLength) ||
    blob.byteLength < 1 ||
    blob.byteLength > limit ||
    !isSha(blob.sha256)
  )
    throw new Error('The saved placement component has invalid length or SHA-256.');
  const bytes = decodeSavedNativePlacementBase64(blob.base64, limit);
  if (bytes.byteLength !== blob.byteLength || (await digest(bytes, signal)) !== blob.sha256)
    throw new Error('The saved placement component differs from its stored bytes or SHA-256.');
  return bytes;
}

function readCurrentCarrier(source: CompleteSavedAssemblySourceV1) {
  if (!isVerifiedCompleteSavedAssemblySourceV1(source))
    throw new Error('A verified current Complete Assembly source is required.');
  const carrier = source.priorCarrier;
  if (
    !carrier?.sidecarBytes ||
    !isSha(carrier.sidecarSha256) ||
    !isSha(carrier.postSaveReceiptSha256) ||
    !carrier.byteLength
  )
    throw new Error('An exact saved Complete Assembly carrier is required.');
  return {
    metadata: carrier,
    blob: {
      base64: carrier.sidecarBytes,
      sha256: carrier.sidecarSha256,
      byteLength: carrier.byteLength,
    },
    receipt: carrier.postSaveReceiptSha256,
  };
}

async function verifyReviewBinding(
  source: CompleteSavedAssemblySourceV1,
  review: NativeReviewV8,
  signal: AbortSignal,
) {
  if (
    !exactKeys(review, [
      'schemaVersion',
      'mediaType',
      'encoding',
      'profile',
      'bindings',
      'writeCas',
      'selection',
      'review',
    ]) ||
    review.schemaVersion !== SAVED_COMPLETE_ASSEMBLY_NATIVE_REVIEW_V8 ||
    review.mediaType !== SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8 ||
    review.encoding !== 'canonical-json-utf8' ||
    review.profile !== SAVED_COMPLETE_ASSEMBLY_NATIVE_PROFILE_V1 ||
    !exactKeys(review.writeCas, ['expectedPreviousSidecarSha256']) ||
    review.writeCas.expectedPreviousSidecarSha256 !== null ||
    !exactKeys(review.bindings, ['anchorRow', 'serverAssemblyRevision', 'completeSourceSha256'])
  )
    throw new Error('The retained review must have the exact saved V8 profile.');
  const { anchorRow, serverAssemblyRevision, completeSourceSha256 } = review.bindings;
  const carrier = source.priorCarrier;
  const row = source.rows.find(({ patternLineKey }) => patternLineKey === carrier?.patternLineKey);
  if (
    !row ||
    row.scopeKey !== 'main' ||
    carrier?.cardLockVersion !== row.cardLockVersion ||
    canonical(anchorRow) !==
      canonical({
        ...completeSavedAssemblyRowIdentityV1(row),
        patternVersion: row.patternVersion,
      }) ||
    serverAssemblyRevision !== source.serverAssemblyRevision ||
    completeSourceSha256 !== source.sourceSha256
  )
    throw new Error('The retained review belongs to different source rows or Assembly Order.');

  const selection = review.selection;
  if (
    !exactKeys(selection, [
      'operationNumber',
      'operationOrdinal',
      'ownedSeamKeys',
      'savedDirection',
      'savedAnchoredSize',
      'sizeId',
      'sizeToken',
      'sizeBasis',
      'members',
    ]) ||
    !positiveInt32(selection.sizeId) ||
    typeof selection.sizeToken !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/.test(selection.sizeToken) ||
    selection.sizeToken.length > 32 ||
    selection.sizeBasis !== 'operator-confirmed-native' ||
    !positiveInt32(selection.operationNumber) ||
    !Number.isInteger(selection.operationOrdinal) ||
    selection.operationOrdinal < 0 ||
    !Array.isArray(selection.ownedSeamKeys) ||
    selection.ownedSeamKeys.length !== 2 ||
    selection.ownedSeamKeys[0] === selection.ownedSeamKeys[1] ||
    selection.ownedSeamKeys.some((key) => typeof key !== 'string' || !canonicalPieceId.test(key)) ||
    (selection.savedDirection !== 'same' && selection.savedDirection !== 'reversed') ||
    (selection.savedAnchoredSize !== '' && selection.savedAnchoredSize !== selection.sizeToken) ||
    !Array.isArray(selection.members) ||
    selection.members.length !== 2 ||
    !exactKeys(review.review, [
      'sourceDecisionSha256',
      'boundSourceRequestSha256',
      'gridSha256',
      'stationCount',
    ]) ||
    !isSha(review.review.sourceDecisionSha256) ||
    !isSha(review.review.boundSourceRequestSha256) ||
    !isSha(review.review.gridSha256) ||
    !positiveInt32(review.review.stationCount) ||
    review.review.stationCount > 4_096
  )
    throw new Error('The retained review must identify the exact saved operation and size.');

  const operation = source.operations[selection.operationOrdinal];
  if (
    operation?.operationNumber !== selection.operationNumber ||
    operation.work !== 'join_lockstitch' ||
    canonical(operation.seamKeys ?? []) !== canonical(selection.ownedSeamKeys) ||
    canonical(operation.inputKeys ?? []) !==
      canonical(selection.members.map((member) => member.pieceLineKey))
  )
    throw new Error(
      'The retained review operation or seam no longer matches current Assembly Order.',
    );

  const ownedIndex = source.operations
    .slice(0, selection.operationOrdinal)
    .reduce((count, previous) => count + (previous.seamKeys?.length ?? 0), 0);
  const [stitch, pose] = source.ownedSeams.slice(ownedIndex, ownedIndex + 2);
  const direction =
    selection.savedDirection === 'same'
      ? 'TECH_CARD_SEAM_DIRECTION_SAME'
      : 'TECH_CARD_SEAM_DIRECTION_REVERSED';
  if (
    stitch?.seamKey !== selection.ownedSeamKeys[0] ||
    stitch.kind !== 'TECH_CARD_SEAM_KIND_EDGE' ||
    stitch.stale !== false ||
    stitch.status !== 'TECH_CARD_SEAM_STATUS_CONFIRMED' ||
    stitch.source !== 'TECH_CARD_SEAM_SOURCE_MANUAL' ||
    stitch.direction !== direction ||
    (stitch.anchoredSize ?? '') !== selection.savedAnchoredSize ||
    pose?.seamKey !== selection.ownedSeamKeys[1] ||
    pose.kind !== 'TECH_CARD_SEAM_KIND_POSE' ||
    pose.stale !== false ||
    pose.status !== 'TECH_CARD_SEAM_STATUS_CONFIRMED'
  )
    throw new Error('The original physical seam or linked pose moved in the Complete source.');

  for (const [index, member] of selection.members.entries()) {
    const memberRow = source.rows.find(
      ({ patternLineKey }) => patternLineKey === member?.row?.patternLineKey,
    );
    if (
      !memberRow ||
      !exactKeys(member, [
        'row',
        'sideIndex',
        'partOrdinal',
        'pieceLineKey',
        'blockName',
        'pieceId',
        'contourId',
        'nativePathId',
        'sourceFileId',
        'direction',
        'orderedVertexIds',
        'capturedSavedAnchorSha256',
      ]) ||
      memberRow.scopeKey !== (index === 0 ? 'main' : 'pocketing') ||
      member.sideIndex !== index ||
      member.partOrdinal !== 0 ||
      !canonicalPieceId.test(member.pieceLineKey) ||
      !isSha(member.capturedSavedAnchorSha256) ||
      !Array.isArray(member.orderedVertexIds) ||
      member.orderedVertexIds.length < 2 ||
      member.orderedVertexIds.length > Math.min(512, review.review.stationCount) ||
      member.orderedVertexIds.length !== selection.members[0].orderedVertexIds.length ||
      member.orderedVertexIds.some((id) => typeof id !== 'string' || !id) ||
      new Set(member.orderedVertexIds).size !== member.orderedVertexIds.length ||
      canonical(member.row) !==
        canonical({
          ...completeSavedAssemblyRowIdentityV1(memberRow),
          patternVersion: memberRow.patternVersion,
        }) ||
      (index === 0 && canonical(member.row) !== canonical(anchorRow))
    )
      throw new Error('The retained review does not match its two exact saved native members.');

    const stitchParts = (index === 0 ? stitch.sideA : stitch.sideB)?.parts;
    const poseParts = (index === 0 ? pose.sideA : pose.sideB)?.parts;
    const anchor = stitchParts?.[0];
    const alias = source.aliases.some(
      (entry) =>
        entry.scopeKey === memberRow.scopeKey &&
        entry.blockName === member.blockName &&
        entry.pieceLineKey === member.pieceLineKey,
    );
    if (
      !alias ||
      !anchor ||
      stitchParts.length !== 1 ||
      anchor.pieceLineKey !== member.pieceLineKey ||
      poseParts?.length !== 1 ||
      poseParts[0].pieceLineKey !== member.pieceLineKey ||
      anchor.samples?.length !== 5 ||
      !(Number(anchor.lenMm) > 0) ||
      anchor.rangeFrom !== 0 ||
      anchor.rangeTo !== 0 ||
      anchor.placement != null ||
      (await canonicalSeal(anchorDomain, anchor, undefined, signal)) !==
        member.capturedSavedAnchorSha256
    )
      throw new Error(
        'The retained review anchor or scoped member alias no longer matches the Complete source.',
      );
  }
}

async function verifyBody(body: SavedWholeAssemblyPlacementBodyV10, signal: AbortSignal) {
  if (
    !exactKeys(body, [
      'modelId',
      'modelUpdatedAt',
      'modelPhysicalInputsSha256',
      'pose',
      'observed',
    ]) ||
    !positiveInt32(body.modelId) ||
    !isSha(body.modelPhysicalInputsSha256) ||
    !exactKeys(body.pose, ['kind', 'canonicalSha256']) ||
    body.pose.kind !== 'neutral-default-direct-v9' ||
    !isSha(body.pose.canonicalSha256) ||
    !exactKeys(body.observed, ['bodyPositionsFloat32LeSha256', 'bodyTrianglesUint32LeSha256']) ||
    !isSha(body.observed.bodyPositionsFloat32LeSha256) ||
    !isSha(body.observed.bodyTrianglesUint32LeSha256)
  )
    throw new Error('An exact observed neutral saved mannequin is required.');
  const timestamp =
    typeof body.modelUpdatedAt === 'string' &&
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{3}|\d{6}|\d{9}))?Z$/.exec(body.modelUpdatedAt);
  const wholeSecond = timestamp && new Date(timestamp[1] + 'Z');
  if (
    !timestamp ||
    !wholeSecond ||
    !Number.isFinite(wholeSecond.getTime()) ||
    timestamp[1].startsWith('0000') ||
    wholeSecond.toISOString().slice(0, 19) !== timestamp[1] ||
    timestamp[2]?.endsWith('000')
  )
    throw new Error('The saved mannequin must have an exact canonical model timestamp.');

  const neutralPose = createModelMannequinPoseDocumentV2(
    MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  );
  const neutralSha = await fingerprintModelMannequinPoseDocumentV2(neutralPose);
  signal.throwIfAborted();
  if (neutralSha !== `sha256:${body.pose.canonicalSha256}`)
    throw new Error('The saved mannequin pose differs from the exact neutral pose.');
}

function countLayoutVertices(
  layout: Omit<SavedWholeAssemblyPlacementLayoutV10, 'positionsM'>,
  selection: NativeReviewV8['selection'],
): number {
  if (
    layout.sizeId !== selection.sizeId ||
    layout.sizeToken !== selection.sizeToken ||
    !isSha(layout.runtimeCandidateSha256) ||
    !isSha(layout.cutGraphSha256) ||
    !Array.isArray(layout.pieceRanges) ||
    layout.pieceRanges.length < 2 ||
    layout.pieceRanges.length > maximumVertices
  )
    throw new Error('The saved layout must match the reviewed size and have bounded mesh ranges.');
  const pieces = new Set<string>();
  let vertices = 0;
  let triangles = 0;
  for (const range of layout.pieceRanges) {
    if (
      !exactKeys(range, [
        'pieceId',
        'vertexOffset',
        'vertexCount',
        'triangleOffset',
        'triangleCount',
      ]) ||
      typeof range.pieceId !== 'string' ||
      !canonicalPieceId.test(range.pieceId) ||
      pieces.has(range.pieceId) ||
      range.vertexOffset !== vertices ||
      range.triangleOffset !== triangles ||
      !positiveInt32(range.vertexCount) ||
      range.vertexCount > maximumVertices - vertices ||
      !positiveInt32(range.triangleCount) ||
      range.triangleCount > maximumTriangles - triangles
    )
      throw new Error(
        'Whole layout ranges must use unique pieces with positive contiguous mesh ranges.',
      );
    pieces.add(range.pieceId);
    vertices += range.vertexCount;
    triangles += range.triangleCount;
  }
  return vertices;
}

function assertCoordinate(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > 10 || Object.is(value, -0))
    throw new Error(
      'Whole layout coordinates must be finite canonical Float32 values within 10 metres.',
    );
}

function encodeCoordinates(positions: Float32Array) {
  const bytes = new Uint8Array(positions.length * 4);
  const view = new DataView(bytes.buffer);
  for (const [index, position] of positions.entries()) {
    const canonicalPosition = position === 0 ? 0 : position;
    assertCoordinate(canonicalPosition);
    view.setFloat32(index * 4, canonicalPosition, true);
  }
  return bytes;
}

function decodeCoordinates(bytes: Uint8Array) {
  const positions = new Float32Array(bytes.byteLength / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < positions.length; index += 1) {
    const value = view.getFloat32(index * 4, true);
    assertCoordinate(value);
    positions[index] = value;
  }
  return positions;
}

async function readRetainedReview(
  source: CompleteSavedAssemblySourceV1,
  retainedCarrier: RetainedCarrier,
  signal: AbortSignal,
  expectedReceipt?: string,
): Promise<RetainedReview> {
  const { mediaType } = retainedCarrier;
  if (
    !exactKeys(retainedCarrier, ['kind', 'mediaType', 'byteLength', 'sha256', 'base64']) ||
    retainedCarrier.kind !== retainedKind ||
    (mediaType !== SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8 &&
      mediaType !== SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9)
  )
    throw new Error('Whole layout placement must retain the original V8 or V9 carrier.');
  if (mediaType === SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9) {
    const narrowPlacement = await decodeSavedCrossMaterialPlacementDocumentV9(
      {
        sidecarBytes: retainedCarrier.base64,
        sidecarSha256: retainedCarrier.sha256,
        byteLength: retainedCarrier.byteLength,
        postSaveReceiptSha256: expectedReceipt,
      },
      signal,
    );
    await verifyReviewBinding(source, narrowPlacement.review.document, signal);
    await verifyBody(narrowPlacement.world.body, signal);
    return { retainedCarrier, review: narrowPlacement.review, narrowPlacement };
  }
  const bytes = await readBytes(retainedCarrier, maximumCarrierBytes, signal);
  const parsed = parseCanonical<NativeReviewV8>(bytes, maximumCarrierBytes);
  await verifyReviewBinding(source, parsed.document, signal);
  if (
    expectedReceipt !== undefined &&
    (await canonicalSeal(
      reviewDomain,
      parsed.document,
      undefined,
      signal,
      maximumCarrierBytes + 128,
    )) !== expectedReceipt
  )
    throw new Error('The current native review receipt differs from its saved bytes.');
  return { retainedCarrier, review: { ...parsed, sha256: retainedCarrier.sha256 } };
}

function result(
  retained: RetainedReview,
  document: DocumentWire,
  world: WorldWire,
  positionsM: Float32Array,
  bytes: Uint8Array<ArrayBuffer>,
  blob: BlobWire,
  postSaveReceiptSha256: string,
): SavedWholeAssemblyPlacementResultV10 {
  const { positions: _encoding, ...layout } = world.layout;
  return {
    ...retained,
    document,
    world,
    body: world.body,
    layout: { ...layout, positionsM },
    positionsM,
    bytes,
    base64: blob.base64,
    sha256: blob.sha256,
    postSaveReceiptSha256,
  };
}

/** Reads an exact whole initial layout from the actual current Complete Source slot. */
export async function readSavedWholeAssemblyPlacementDocumentV10(
  source: CompleteSavedAssemblySourceV1,
  signal: AbortSignal,
): Promise<SavedWholeAssemblyPlacementResultV10> {
  signal.throwIfAborted();
  const { metadata, blob, receipt } = readCurrentCarrier(source);
  if (metadata.mediaType !== SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10)
    throw new Error('A current saved whole layout placement is required.');
  const bytes = await readBytes(blob, maximumCarrierBytes, signal);
  const { document } = parseCanonical<DocumentWire>(bytes, maximumCarrierBytes);
  if (
    !exactKeys(document, [
      'schemaVersion',
      'mediaType',
      'encoding',
      'profile',
      'bindings',
      'writeCas',
      'components',
    ]) ||
    document.schemaVersion !== SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_V10 ||
    document.mediaType !== SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10 ||
    document.encoding !== 'canonical-json-utf8' ||
    document.profile !== SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_PROFILE_V1 ||
    !exactKeys(document.writeCas, ['expectedPreviousSidecarSha256']) ||
    !isSha(document.writeCas.expectedPreviousSidecarSha256) ||
    document.writeCas.expectedPreviousSidecarSha256 === blob.sha256 ||
    !Array.isArray(document.components) ||
    document.components.length !== 2
  )
    throw new Error('The saved whole layout carrier must have the exact V10 shape.');

  const [retainedComponent, worldComponent] = document.components;
  if (
    !exactKeys(worldComponent, ['kind', 'mediaType', 'byteLength', 'sha256', 'base64']) ||
    worldComponent.kind !== worldKind ||
    worldComponent.mediaType !== worldMediaType
  )
    throw new Error('A bounded exact whole layout component is required.');
  const [retained, worldBytes, postSaveReceiptSha256] = await Promise.all([
    readRetainedReview(source, retainedComponent, signal),
    readBytes(worldComponent, maximumWorldBytes, signal),
    canonicalSeal(receiptDomain, document, undefined, signal, maximumCarrierBytes + 128),
  ]);
  if (
    canonical(document.bindings) !== canonical(retained.review.document.bindings) ||
    postSaveReceiptSha256 !== receipt
  )
    throw new Error('The whole layout binding or receipt differs from the exact saved source.');

  const { document: world } = parseCanonical<WorldWire>(worldBytes, maximumWorldBytes);
  if (
    !exactKeys(world, ['schemaVersion', 'retainedCarrierSha256', 'body', 'layout']) ||
    world.schemaVersion !== SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_COMPONENT_V1 ||
    world.retainedCarrierSha256 !== retainedComponent.sha256 ||
    !exactKeys(world.layout, [
      'sizeId',
      'sizeToken',
      'runtimeCandidateSha256',
      'cutGraphSha256',
      'pieceRanges',
      'positions',
    ])
  )
    throw new Error('The saved whole layout must bind to the exact retained carrier.');
  const vertices = countLayoutVertices(world.layout, retained.review.document.selection);
  const positions = world.layout.positions;
  if (
    !exactKeys(positions, ['encoding', 'byteLength', 'sha256', 'base64']) ||
    positions.encoding !== 'float32-le-xyz' ||
    positions.byteLength !== vertices * 12
  )
    throw new Error('The layout must contain exactly three Float32 coordinates per vertex.');
  const [positionBytes] = await Promise.all([
    readBytes(positions, vertices * 12, signal),
    verifyBody(world.body, signal),
  ]);
  return result(retained, document, world, decodeCoordinates(positionBytes), bytes, blob, receipt);
}

/** Packages a current, source-scoped initial layout for the sole existing saved-sidecar writer. */
export async function buildSavedWholeAssemblyPlacementDocumentV10(
  source: CompleteSavedAssemblySourceV1,
  layout: SavedWholeAssemblyPlacementLayoutV10,
  body: SavedWholeAssemblyPlacementBodyV10,
  signal: AbortSignal,
): Promise<SavedWholeAssemblyPlacementResultV10> {
  signal.throwIfAborted();
  const { metadata, blob: previous, receipt } = readCurrentCarrier(source);
  const { mediaType } = metadata;
  if (
    !exactKeys(layout, [
      'sizeId',
      'sizeToken',
      'runtimeCandidateSha256',
      'cutGraphSha256',
      'pieceRanges',
      'positionsM',
    ]) ||
    !(layout.positionsM instanceof Float32Array) ||
    layout.positionsM.length > maximumVertices * 3 ||
    !Array.isArray(layout.pieceRanges) ||
    layout.pieceRanges.length > maximumVertices
  )
    throw new Error('A bounded exact whole layout with Float32 coordinates is required.');
  const { positionsM, ...layoutIdentity } = layout;
  // Snapshot the caller's mutable input before hashing or awaiting carrier verification.
  const capturedLayout = structuredClone(layoutIdentity);
  const capturedBody = structuredClone(body);
  const positionBytes = encodeCoordinates(positionsM);
  const retained = await (async (): Promise<RetainedReview> => {
    if (mediaType === SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10) {
      const before = await readSavedWholeAssemblyPlacementDocumentV10(source, signal);
      const { retainedCarrier, review, narrowPlacement } = before;
      return { retainedCarrier, review, ...(narrowPlacement && { narrowPlacement }) };
    }
    if (
      mediaType !== SAVED_COMPLETE_ASSEMBLY_NATIVE_MEDIA_V8 &&
      mediaType !== SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9
    )
      throw new Error('Only an exact saved V8, V9, or V10 carrier can be used.');
    return readRetainedReview(
      source,
      { kind: retainedKind, mediaType, ...previous },
      signal,
      receipt,
    );
  })();

  const vertices = countLayoutVertices(capturedLayout, retained.review.document.selection);
  if (positionBytes.byteLength !== vertices * 12)
    throw new Error('The layout must contain exactly three Float32 coordinates per vertex.');
  const [positionBlob] = await Promise.all([
    describeBytes(positionBytes, signal),
    verifyBody(capturedBody, signal),
  ]);
  const world: WorldWire = {
    schemaVersion: SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_COMPONENT_V1,
    retainedCarrierSha256: retained.retainedCarrier.sha256,
    body: capturedBody,
    layout: { ...capturedLayout, positions: { encoding: 'float32-le-xyz', ...positionBlob } },
  };
  const worldBytes = encoder.encode(canonical(world, maximumWorldBytes));
  const document: DocumentWire = {
    schemaVersion: SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_V10,
    mediaType: SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10,
    encoding: 'canonical-json-utf8',
    profile: SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_PROFILE_V1,
    bindings: retained.review.document.bindings,
    writeCas: { expectedPreviousSidecarSha256: previous.sha256 },
    components: [
      retained.retainedCarrier,
      { kind: worldKind, mediaType: worldMediaType, ...(await describeBytes(worldBytes, signal)) },
    ],
  };
  const bytes = encoder.encode(canonical(document, maximumCarrierBytes));
  const [blob, postSaveReceiptSha256] = await Promise.all([
    describeBytes(bytes, signal),
    canonicalSeal(receiptDomain, document, undefined, signal, maximumCarrierBytes + 128),
  ]);
  return result(
    retained,
    document,
    world,
    decodeCoordinates(positionBytes),
    bytes,
    blob,
    postSaveReceiptSha256,
  );
}
