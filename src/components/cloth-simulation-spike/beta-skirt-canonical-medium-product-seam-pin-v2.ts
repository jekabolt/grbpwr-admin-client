import {
  projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2,
  type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2,
} from '../../lib/cloth/domain/dxf-product-two-panel-skirt-canonical-medium-self-orientation-v2';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
  type PatternImportDxfProductGarmentMeshComposerProjectionV2,
} from '../../lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  projectPatternImportDxfProductGarmentMeshComposerV3,
  type PatternImportDxfProductGarmentMeshComposerOwnerV3,
  type PatternImportDxfProductGarmentMeshComposerProjectionV3,
} from '../../lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v3';

import {
  projectBetaSkirtCanonicalMediumProductPlacementAuthoredWaistClassificationInternalV1,
  projectBetaSkirtCanonicalMediumProductPlacementV1,
  type BetaSkirtCanonicalMediumProductPlacementAuthoredWaistClassificationInternalV1,
  type BetaSkirtCanonicalMediumProductPlacementOwnerV1,
} from './beta-skirt-canonical-medium-product-placement-v1';
import {
  BETA_SKIRT_EXACT_VALIDATED_SEAM_SNAPSHOT_V1,
  computeBetaSkirtExactValidatedSeamReceiptSha256V1,
  type BetaSkirtExactValidatedSeamSnapshotV1,
} from './beta-skirt-primitive-contact-relaxation-candidate-v4';

export const BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_REQUEST_V2 =
  'beta-skirt-canonical-medium-product-seam-pin-request/2' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_REPORT_V2 =
  'beta-skirt-canonical-medium-product-seam-pin-report/2' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_OWNER_V2 =
  'beta-skirt-canonical-medium-product-seam-pin-owner/2' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_PROJECTION_V2 =
  'beta-skirt-canonical-medium-product-seam-pin-projection/2' as const;

const MAXIMUM_VERTEX_COUNT = 2_000;
const MAXIMUM_TRIANGLE_COUNT = 5_000;
const MAXIMUM_SEAM_PAIR_COUNT = 4_096;
const MAXIMUM_PIN_COUNT = 4_096;
const MAXIMUM_RETAINED_BYTES = 512 * 1024;
const MAXIMUM_CANONICAL_BYTES = 4 * 1024 * 1024;
const CANONICAL_VERTEX_COUNT = 580;
const CANONICAL_TRIANGLE_COUNT = 912;
const CANONICAL_V2_VERTEX_COUNT = 244;
const CANONICAL_V2_TRIANGLE_COUNT = 240;
const CANONICAL_SEAM_PAIR_COUNT = 34;
const CANONICAL_PIN_COUNT = 82;
const SHA256 = /^[0-9a-f]{64}$/u;

const freeze = Object.freeze;
const getPrototypeOf = Object.getPrototypeOf;
const getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const reflectOwnKeys = Reflect.ownKeys;
const arrayIsArray = Array.isArray;
const objectKeys = Object.keys;
const CapturedArrayBuffer = ArrayBuffer;
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const CapturedDataView = DataView;
const CapturedMap = Map;
const CapturedSet = Set;
const float32Fill = Float32Array.prototype.fill;
const uint32Fill = Uint32Array.prototype.fill;
const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayBuffer = getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;
const typedArrayByteLength = getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')?.get;
const typedArrayByteOffset = getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')?.get;
const typedArrayLength = getOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get;
const arrayBufferByteLength = getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get;
const arrayBufferResizable = getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
const encoder = new TextEncoder();
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest.bind(capturedSubtle);

export const BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_LIMITS_V2 = freeze({
  maximumVertexCount: MAXIMUM_VERTEX_COUNT,
  maximumTriangleCount: MAXIMUM_TRIANGLE_COUNT,
  maximumSeamPairCount: MAXIMUM_SEAM_PAIR_COUNT,
  maximumPinCount: MAXIMUM_PIN_COUNT,
  maximumRetainedBytes: MAXIMUM_RETAINED_BYTES,
  maximumCanonicalBytes: MAXIMUM_CANONICAL_BYTES,
} as const);

export type BetaSkirtCanonicalMediumProductSeamPinRequestV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_REQUEST_V2;
  expected: Readonly<{
    composerV2CanonicalSha256: string;
    composerV3CanonicalSha256: string;
    selfOrientationCanonicalSha256: string;
    placementCanonicalSha256: string;
  }>;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  composerV3Owner: PatternImportDxfProductGarmentMeshComposerOwnerV3;
  selfOrientationOwner: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2;
  placementOwner: BetaSkirtCanonicalMediumProductPlacementOwnerV1;
}>;

export type BetaSkirtCanonicalMediumProductSeamPinClaimsV2 = Readonly<{
  genuineComposerV2AndV3OwnersBound: true;
  genuineSelfOrientationOwnerBound: true;
  genuinePlacementOwnerBound: true;
  exactV2ToV3BoundaryRemapReplayed: true;
  normalizedAndOriginalTopologyBound: true;
  assemblyOrderPairOrderPreserved: true;
  seamPairsUniqueOneToOneInRange: true;
  seamPairsByteColocated: true;
  semanticWaistPinsReplayed: true;
  exactInverseMassPinMaskVerified: true;
  rawFloat32PositionsBound: true;
  exactV4SeamReceiptIssued: true;
  productSeamPinDiagnosticAuthority: true;
  placementAuthority: false;
  collisionAuthority: false;
  initializationAuthority: false;
  runtimeAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumProductSeamPinReportV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_REPORT_V2;
  status: 'diagnostic-complete';
  bindings: Readonly<{
    composerV2CanonicalSha256: string;
    composerV3CanonicalSha256: string;
    phase2ArtifactSha256: string;
    refinedArtifactSha256: string;
    selfOrientationCanonicalSha256: string;
    placementCanonicalSha256: string;
    originalTopologyRawSha256: string;
    normalizedTopologyRawSha256: string;
    positionsRawFloat32LeSha256: string;
    positionsInvMassRawFloat32LeSha256: string;
    seamPairsRawUint32LeSha256: string;
    pinnedVertexIndicesRawUint32LeSha256: string;
    exactV4SeamValidationReceiptSha256: string;
  }>;
  counts: Readonly<{
    v2VertexCount: 244;
    v2TriangleCount: 240;
    vertexCount: 580;
    boundaryVertexCount: 244;
    interiorVertexCount: 336;
    triangleCount: 912;
    normalizedTriangleCount: 456;
    seamCount: 2;
    seamPairCount: 34;
    seamVertexCount: 68;
    pinnedVertexCount: 82;
    zeroInverseMassVertexCount: 82;
  }>;
  topology: Readonly<{
    originalV3TopologyPreservedSeparately: true;
    normalizedTopologyMatchesSelfAndPlacement: true;
    normalizedOnlyByPerPieceBCSwap: true;
    pieces: readonly Readonly<{
      pieceId: string;
      triangleCount: number;
      indexOrderFlipped: boolean;
      normalizedTriangleCount: number;
    }>[];
  }>;
  seams: Readonly<{
    source: 'genuine-c6v3-assembly-order';
    mapping: 'equal';
    stableAuthoredOrder: true;
    oneToOne: true;
    distinctEndpoints: true;
    noDuplicateUnorderedPair: true;
    inRange: true;
    byteColocatedAtSource: true;
  }>;
  pins: Readonly<{
    source: 'canonical-waist-boundary-via-exact-c6v2-to-c6v3-remap';
    stableAscendingOrder: true;
    exactBoundaryRemapReplayed: true;
    exactSelfProjectionSet: true;
    exactPlacementProjectionSet: true;
    exactZeroInverseMassMask: true;
    mappedPositionWordsMatch: true;
  }>;
  adapter: Readonly<{
    version: typeof BETA_SKIRT_EXACT_VALIDATED_SEAM_SNAPSHOT_V1;
    validationStatus: 'exact-validated';
    validationReceiptSha256: string;
    existingV4ComputationUsed: true;
    independentReceiptReplayMatched: true;
  }>;
  resources: Readonly<{
    retainedOwnerBinaryByteLength: number;
    inspectedBinaryByteLength: number;
    bounded: true;
  }>;
  claims: BetaSkirtCanonicalMediumProductSeamPinClaimsV2;
  deferred: Readonly<{
    placement: 'not-authorized';
    collision: 'not-authorized';
    initialization: 'not-authorized';
    runtime: 'not-authorized';
    fit: 'not-authorized';
    production: 'not-authorized';
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-card-session-product-seam-pin-diagnostic-only';
  }>;
}>;

declare const canonicalMediumProductSeamPinOwnerBrand: unique symbol;
export type BetaSkirtCanonicalMediumProductSeamPinOwnerV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_OWNER_V2;
  report: BetaSkirtCanonicalMediumProductSeamPinReportV2;
  readonly [canonicalMediumProductSeamPinOwnerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumProductSeamPinProjectionV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_PROJECTION_V2;
  reportCanonicalSha256: string;
  positions3M: Float32Array;
  positionsInvMass: Float32Array;
  normalizedTriangles: Uint32Array;
  seamSnapshot: BetaSkirtExactValidatedSeamSnapshotV1;
  pinnedVertexIndices: Uint32Array;
  callerOwnedMutableBinaryCopies: true;
  productSeamPinDiagnosticAuthority: true;
  placementAuthority: false;
  collisionAuthority: false;
  initializationAuthority: false;
  runtimeAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumProductSeamPinErrorCodeV2 =
  | 'invalid-input'
  | 'upstream-owner-unavailable'
  | 'authority-binding-mismatch'
  | 'topology-binding-mismatch'
  | 'seam-carrier-rejected'
  | 'pin-carrier-rejected'
  | 'resource-budget-exceeded'
  | 'sha256-unavailable';

const BLOCKED_CLAIMS = freeze({
  genuineComposerV2AndV3OwnersBound: false as const,
  genuineSelfOrientationOwnerBound: false as const,
  genuinePlacementOwnerBound: false as const,
  exactV2ToV3BoundaryRemapReplayed: false as const,
  normalizedAndOriginalTopologyBound: false as const,
  assemblyOrderPairOrderPreserved: false as const,
  seamPairsUniqueOneToOneInRange: false as const,
  seamPairsByteColocated: false as const,
  semanticWaistPinsReplayed: false as const,
  exactInverseMassPinMaskVerified: false as const,
  rawFloat32PositionsBound: false as const,
  exactV4SeamReceiptIssued: false as const,
  productSeamPinDiagnosticAuthority: false as const,
  placementAuthority: false as const,
  collisionAuthority: false as const,
  initializationAuthority: false as const,
  runtimeAuthority: false as const,
  fitAuthority: false as const,
  productionAuthority: false as const,
});

export type BetaSkirtCanonicalMediumProductSeamPinResultV2 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumProductSeamPinOwnerV2;
      report: BetaSkirtCanonicalMediumProductSeamPinReportV2;
      claims: BetaSkirtCanonicalMediumProductSeamPinClaimsV2;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      report: null;
      claims: typeof BLOCKED_CLAIMS;
      blockers: readonly [
        Readonly<{ code: BetaSkirtCanonicalMediumProductSeamPinErrorCodeV2; detail: string }>,
      ];
    }>;

type OwnerRecord = {
  disposed: boolean;
  positions3M: Float32Array;
  positionsInvMass: Float32Array;
  normalizedTriangles: Uint32Array;
  seamPairs: Uint32Array;
  pinnedVertexIndices: Uint32Array;
  validationReceiptSha256: string;
};

const owners = new WeakMap<object, OwnerRecord>();

class SeamPinFailure extends Error {
  constructor(
    readonly code: BetaSkirtCanonicalMediumProductSeamPinErrorCodeV2,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(code: BetaSkirtCanonicalMediumProductSeamPinErrorCodeV2, detail: string): never {
  throw new SeamPinFailure(code, detail);
}

function blocked(
  error: unknown,
): Extract<BetaSkirtCanonicalMediumProductSeamPinResultV2, { ok: false }> {
  const failure =
    error instanceof SeamPinFailure
      ? error
      : new SeamPinFailure(
          'authority-binding-mismatch',
          error instanceof Error ? error.message : 'Canonical-medium seam/pin V2 failed closed.',
        );
  return freeze({
    ok: false as const,
    owner: null,
    report: null,
    claims: BLOCKED_CLAIMS,
    blockers: freeze([freeze({ code: failure.code, detail: failure.message })]) as readonly [
      Readonly<{ code: typeof failure.code; detail: string }>,
    ],
  });
}

function exactRecord(value: unknown, expectedKeys: readonly string[], label: string) {
  if (!value || typeof value !== 'object' || arrayIsArray(value))
    fail('invalid-input', `${label} must be one exact plain record.`);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = getPrototypeOf(value);
    descriptors = getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', `${label} could not be inspected safely.`);
  }
  if (prototype !== Object.prototype)
    fail('invalid-input', `${label} must use the exact Object prototype.`);
  const keys = reflectOwnKeys(descriptors);
  const expected = [...expectedKeys].sort();
  if (
    keys.some((key) => typeof key !== 'string') ||
    keys.length !== expected.length ||
    (keys as string[]).sort().some((key, index) => key !== expected[index])
  ) {
    fail('invalid-input', `${label} has an unsupported exact shape.`);
  }
  const result: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      fail('invalid-input', `${label}.${key} must be an enumerable own data property.`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotRequest(input: unknown) {
  const request = exactRecord(
    input,
    [
      'schemaVersion',
      'expected',
      'composerV2Owner',
      'composerV3Owner',
      'selfOrientationOwner',
      'placementOwner',
    ],
    'request',
  );
  if (request.schemaVersion !== BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_REQUEST_V2)
    fail('invalid-input', 'Canonical-medium seam/pin request version is unsupported.');
  const expected = exactRecord(
    request.expected,
    [
      'composerV2CanonicalSha256',
      'composerV3CanonicalSha256',
      'selfOrientationCanonicalSha256',
      'placementCanonicalSha256',
    ],
    'request.expected',
  );
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value !== 'string' || !SHA256.test(value))
      fail('invalid-input', `request.expected.${key} must be one lowercase SHA-256 digest.`);
  }
  return {
    expected: expected as BetaSkirtCanonicalMediumProductSeamPinRequestV2['expected'],
    composerV2Owner: request.composerV2Owner,
    composerV3Owner: request.composerV3Owner,
    selfOrientationOwner: request.selfOrientationOwner,
    placementOwner: request.placementOwner,
  };
}

function exactTypedArray<T extends Float32Array | Uint32Array>(
  value: unknown,
  prototype: object,
  bytesPerElement: number,
  create: (length: number) => T,
  label: string,
): T {
  if (
    !value ||
    typeof value !== 'object' ||
    getPrototypeOf(value) !== prototype ||
    !typedArrayBuffer ||
    !typedArrayByteLength ||
    !typedArrayByteOffset ||
    !typedArrayLength ||
    !arrayBufferByteLength
  ) {
    fail('authority-binding-mismatch', `${label} must be an exact typed array.`);
  }
  let buffer: unknown;
  let byteLength: unknown;
  let byteOffset: unknown;
  let length: unknown;
  let bufferLength: unknown;
  let resizable = false;
  try {
    buffer = typedArrayBuffer.call(value);
    byteLength = typedArrayByteLength.call(value);
    byteOffset = typedArrayByteOffset.call(value);
    length = typedArrayLength.call(value);
    bufferLength = arrayBufferByteLength.call(buffer);
    resizable = arrayBufferResizable ? Boolean(arrayBufferResizable.call(buffer)) : false;
  } catch {
    fail('authority-binding-mismatch', `${label} could not be inspected safely.`);
  }
  if (
    !(buffer instanceof CapturedArrayBuffer) ||
    getPrototypeOf(buffer) !== ArrayBuffer.prototype ||
    resizable ||
    !Number.isSafeInteger(length) ||
    byteOffset !== 0 ||
    byteLength !== bufferLength ||
    byteLength !== (length as number) * bytesPerElement ||
    reflectOwnKeys(buffer).length !== 0 ||
    reflectOwnKeys(value).length !== length
  ) {
    fail(
      'authority-binding-mismatch',
      `${label} must own one complete undecorated ordinary non-resizable ArrayBuffer.`,
    );
  }
  const copy = create(length as number);
  for (let index = 0; index < (length as number); index += 1) copy[index] = (value as T)[index]!;
  return copy;
}

function copyF32(value: unknown, label: string): Float32Array {
  return exactTypedArray(
    value,
    Float32Array.prototype,
    Float32Array.BYTES_PER_ELEMENT,
    (length) => new CapturedFloat32Array(length),
    label,
  );
}

function copyU32(value: unknown, label: string): Uint32Array {
  return exactTypedArray(
    value,
    Uint32Array.prototype,
    Uint32Array.BYTES_PER_ELEMENT,
    (length) => new CapturedUint32Array(length),
    label,
  );
}

function exactBytes(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new CapturedUint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new CapturedUint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function finiteArrays(...arrays: readonly Float32Array[]) {
  for (const values of arrays) {
    for (let index = 0; index < values.length; index += 1) {
      if (!Number.isFinite(values[index]))
        fail(
          'authority-binding-mismatch',
          'An upstream position carrier contains non-finite data.',
        );
    }
  }
}

function boundarySampleKey(
  mesh: PatternImportDxfProductGarmentMeshComposerProjectionV2['mesh'],
  sample: PatternImportDxfProductGarmentMeshComposerProjectionV2['mesh']['boundarySamples'][number],
): string {
  return [
    sample.pieceId,
    sample.contourId,
    sample.sourceCurveId,
    sample.sourceCurveT,
    sample.normalizedArc,
    mesh.restPositions2Mm[sample.vertexIndex * 2],
    mesh.restPositions2Mm[sample.vertexIndex * 2 + 1],
  ].join('\0');
}

function exactBoundaryRemap(
  v2: PatternImportDxfProductGarmentMeshComposerProjectionV2,
  v3: PatternImportDxfProductGarmentMeshComposerProjectionV3,
): ReadonlyMap<number, number> {
  const byKey = new CapturedMap<string, number>();
  const v3Boundary = new CapturedSet<number>();
  for (const sample of v3.mesh.boundarySamples) {
    const key = boundarySampleKey(v3.mesh, sample);
    if (byKey.has(key) && byKey.get(key) !== sample.vertexIndex)
      fail('pin-carrier-rejected', 'V3 boundary provenance/rest key is not vertex-unique.');
    byKey.set(key, sample.vertexIndex);
    v3Boundary.add(sample.vertexIndex);
    const provenance = v3.vertexProvenance[sample.vertexIndex];
    if (
      !provenance ||
      provenance.globalVertexIndex !== sample.vertexIndex ||
      provenance.pieceId !== sample.pieceId ||
      provenance.source.kind !== 'boundary-recovery'
    ) {
      fail('pin-carrier-rejected', 'V3 boundary sample lost exact boundary-recovery provenance.');
    }
  }
  const remap = new CapturedMap<number, number>();
  const used = new CapturedSet<number>();
  const v2Boundary = new CapturedSet<number>();
  for (const sample of v2.mesh.boundarySamples) {
    const target = byKey.get(boundarySampleKey(v2.mesh, sample));
    if (target === undefined)
      fail(
        'pin-carrier-rejected',
        `V2 boundary vertex ${sample.vertexIndex} has no exact V3 remap.`,
      );
    const prior = remap.get(sample.vertexIndex);
    if ((prior !== undefined && prior !== target) || (used.has(target) && prior !== target))
      fail('pin-carrier-rejected', 'V2 to V3 boundary remap is not one-to-one.');
    remap.set(sample.vertexIndex, target);
    used.add(target);
    v2Boundary.add(sample.vertexIndex);
  }
  if (
    remap.size !== CANONICAL_V2_VERTEX_COUNT ||
    v2Boundary.size !== CANONICAL_V2_VERTEX_COUNT ||
    v3Boundary.size !== CANONICAL_V2_VERTEX_COUNT ||
    used.size !== CANONICAL_V2_VERTEX_COUNT
  ) {
    fail('pin-carrier-rejected', 'V2 to V3 boundary remap accounting is incomplete.');
  }
  return remap;
}

function replayPins(
  v2: PatternImportDxfProductGarmentMeshComposerProjectionV2,
  remap: ReadonlyMap<number, number>,
  authoredWaist: BetaSkirtCanonicalMediumProductPlacementAuthoredWaistClassificationInternalV1,
): Uint32Array {
  const boundaryPieceByVertex = new CapturedMap<number, string>();
  for (const sample of v2.mesh.boundarySamples) {
    const prior = boundaryPieceByVertex.get(sample.vertexIndex);
    if (prior !== undefined && prior !== sample.pieceId)
      fail('pin-carrier-rejected', 'A V2 boundary vertex is assigned to multiple pieces.');
    boundaryPieceByVertex.set(sample.vertexIndex, sample.pieceId);
  }
  const expectedPieces = new CapturedSet(v2.mesh.pieceRanges.map(({ pieceId }) => pieceId));
  const seenPieces = new CapturedSet<string>();
  const seenV2Vertices = new CapturedSet<number>();
  const waist = new CapturedSet<number>();
  for (const piece of authoredWaist.pieces) {
    if (!expectedPieces.has(piece.pieceId) || seenPieces.has(piece.pieceId))
      fail(
        'pin-carrier-rejected',
        'Authored waist classification does not cover each V2 piece exactly once.',
      );
    seenPieces.add(piece.pieceId);
    const indices = copyU32(piece.waistV2VertexIndices, `placement.authoredWaist.${piece.pieceId}`);
    let previous = -1;
    for (let offset = 0; offset < indices.length; offset += 1) {
      const v2Vertex = indices[offset]!;
      if (
        v2Vertex <= previous ||
        seenV2Vertices.has(v2Vertex) ||
        boundaryPieceByVertex.get(v2Vertex) !== piece.pieceId
      )
        fail(
          'pin-carrier-rejected',
          'Authored waist classification contains a duplicate, unordered, or non-boundary V2 vertex.',
        );
      const target = remap.get(v2Vertex);
      if (target === undefined)
        fail('pin-carrier-rejected', 'An authored waist vertex has no exact V3 boundary remap.');
      seenV2Vertices.add(v2Vertex);
      waist.add(target);
      previous = v2Vertex;
    }
  }
  if (seenPieces.size !== expectedPieces.size)
    fail(
      'pin-carrier-rejected',
      'Authored waist classification is missing one or more exact V2 pieces.',
    );
  const pins = CapturedUint32Array.from([...waist].sort((left, right) => left - right));
  if (pins.length !== CANONICAL_PIN_COUNT)
    fail(
      'pin-carrier-rejected',
      `Canonical waist remap produced ${pins.length}, expected 82 pins.`,
    );
  return pins;
}

function flattenAndValidateSeams(
  v3: PatternImportDxfProductGarmentMeshComposerProjectionV3,
  positions: Float32Array,
): Uint32Array {
  const words = v3.mesh.seams.reduce((sum, seam) => sum + seam.vertexPairs.length, 0);
  if (v3.mesh.seams.length !== 2 || words !== CANONICAL_SEAM_PAIR_COUNT * 2)
    fail('seam-carrier-rejected', 'C6 V3 Assembly Order seam count drifted.');
  const output = new CapturedUint32Array(words);
  const seenVertices = new CapturedSet<number>();
  const seenPairs = new CapturedSet<string>();
  let write = 0;
  for (const seam of v3.mesh.seams) {
    if (seam.mapping !== 'equal' || seam.lengthRatio !== 1 || seam.vertexPairs.length % 2 !== 0)
      fail('seam-carrier-rejected', 'Assembly Order seam mapping is not exact equal pairing.');
    for (let offset = 0; offset < seam.vertexPairs.length; offset += 2) {
      const first = seam.vertexPairs[offset]!;
      const second = seam.vertexPairs[offset + 1]!;
      const low = Math.min(first, second);
      const high = Math.max(first, second);
      const key = `${low}:${high}`;
      if (
        first >= CANONICAL_VERTEX_COUNT ||
        second >= CANONICAL_VERTEX_COUNT ||
        first === second ||
        seenVertices.has(first) ||
        seenVertices.has(second) ||
        seenPairs.has(key)
      ) {
        fail('seam-carrier-rejected', 'Assembly Order seam pairs are not unique one-to-one pairs.');
      }
      for (let axis = 0; axis < 3; axis += 1) {
        const a = new CapturedUint8Array(
          positions.buffer,
          positions.byteOffset + (first * 3 + axis) * 4,
          4,
        );
        const b = new CapturedUint8Array(
          positions.buffer,
          positions.byteOffset + (second * 3 + axis) * 4,
          4,
        );
        if (a.some((value, index) => value !== b[index]))
          fail('seam-carrier-rejected', 'An Assembly Order seam pair is not byte-colocated.');
      }
      seenVertices.add(first);
      seenVertices.add(second);
      seenPairs.add(key);
    }
    output.set(seam.vertexPairs, write);
    write += seam.vertexPairs.length;
  }
  if (seenVertices.size !== CANONICAL_SEAM_PAIR_COUNT * 2)
    fail('seam-carrier-rejected', 'Seam vertex accounting is incomplete.');
  return output;
}

function topologyAudit(
  original: Uint32Array,
  normalized: Uint32Array,
  v3: PatternImportDxfProductGarmentMeshComposerProjectionV3,
) {
  if (original.length !== CANONICAL_TRIANGLE_COUNT * 3 || normalized.length !== original.length)
    fail('topology-binding-mismatch', 'Canonical topology length drifted.');
  let normalizedTriangleCount = 0;
  const pieces = v3.mesh.pieceRanges.map((range) => {
    let same = 0;
    let flipped = 0;
    for (let local = 0; local < range.triangleCount; local += 1) {
      const offset = (range.triangleOffset + local) * 3;
      const a = original[offset]!;
      const b = original[offset + 1]!;
      const c = original[offset + 2]!;
      if (
        normalized[offset] === a &&
        normalized[offset + 1] === b &&
        normalized[offset + 2] === c
      ) {
        same += 1;
      } else if (
        normalized[offset] === a &&
        normalized[offset + 1] === c &&
        normalized[offset + 2] === b
      ) {
        flipped += 1;
      } else {
        fail('topology-binding-mismatch', `${range.pieceId} changed beyond one B/C winding swap.`);
      }
    }
    if ((same > 0 && flipped > 0) || same + flipped !== range.triangleCount)
      fail('topology-binding-mismatch', `${range.pieceId} has mixed normalization.`);
    normalizedTriangleCount += flipped;
    return freeze({
      pieceId: range.pieceId,
      triangleCount: range.triangleCount,
      indexOrderFlipped: flipped === range.triangleCount,
      normalizedTriangleCount: flipped,
    });
  });
  if (normalizedTriangleCount !== 456)
    fail('topology-binding-mismatch', 'Canonical normalized triangle count is not exactly 456.');
  const front = pieces.find((piece) => piece.pieceId === 'FRONT');
  const back = pieces.find((piece) => piece.pieceId === 'BACK');
  if (!front?.indexOrderFlipped || back?.indexOrderFlipped !== false)
    fail('topology-binding-mismatch', 'Canonical FRONT/BACK winding normalization drifted.');
  return freeze({ pieces: freeze(pieces), normalizedTriangleCount });
}

function validatePinMask(
  positions: Float32Array,
  positionsInvMass: Float32Array,
  pins: Uint32Array,
): number {
  if (positionsInvMass.length !== CANONICAL_VERTEX_COUNT * 4)
    fail(
      'pin-carrier-rejected',
      'positionsInvMass length differs from the canonical vertex count.',
    );
  const pinSet = new CapturedSet<number>();
  let previous = -1;
  for (const pin of pins) {
    if (pin >= CANONICAL_VERTEX_COUNT || pin <= previous)
      fail('pin-carrier-rejected', 'Pins must be distinct, in-range, and strictly ascending.');
    pinSet.add(pin);
    previous = pin;
  }
  let zeroCount = 0;
  const positiveZero = new CapturedUint8Array(new CapturedFloat32Array([0]).buffer);
  for (let vertex = 0; vertex < CANONICAL_VERTEX_COUNT; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const positionBytes = new CapturedUint8Array(
        positions.buffer,
        positions.byteOffset + (vertex * 3 + axis) * 4,
        4,
      );
      const inverseBytes = new CapturedUint8Array(
        positionsInvMass.buffer,
        positionsInvMass.byteOffset + (vertex * 4 + axis) * 4,
        4,
      );
      if (positionBytes.some((value, index) => value !== inverseBytes[index]))
        fail('pin-carrier-rejected', 'positionsInvMass XYZ words drifted from source positions.');
    }
    const inverseOffset = positionsInvMass.byteOffset + (vertex * 4 + 3) * 4;
    const bytes = new CapturedUint8Array(positionsInvMass.buffer, inverseOffset, 4);
    const isPositiveZero = bytes.every((value, index) => value === positiveZero[index]);
    if (isPositiveZero) zeroCount += 1;
    const inverseMass = positionsInvMass[vertex * 4 + 3]!;
    if (
      (pinSet.has(vertex) && !isPositiveZero) ||
      (!pinSet.has(vertex) && (!Number.isFinite(inverseMass) || inverseMass <= 0))
    ) {
      fail('pin-carrier-rejected', 'Inverse-mass mask differs from the exact semantic pin set.');
    }
  }
  if (zeroCount !== CANONICAL_PIN_COUNT)
    fail('pin-carrier-rejected', 'Zero inverse-mass count differs from the canonical pin count.');
  return zeroCount;
}

function float32LeBytes(values: Float32Array): Uint8Array {
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    view.setFloat32(index * 4, values[index]!, true);
  return bytes;
}

function uint32LeBytes(values: Uint32Array): Uint8Array {
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    view.setUint32(index * 4, values[index]!, true);
  return bytes;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new CapturedUint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  if (!capturedDigest) fail('sha256-unavailable', 'Captured Web Crypto SHA-256 is unavailable.');
  let digest: ArrayBuffer;
  try {
    digest = await capturedDigest('SHA-256', new CapturedUint8Array(bytes));
  } catch {
    fail('sha256-unavailable', 'Captured Web Crypto SHA-256 failed.');
  }
  if (digest.byteLength !== 32) fail('sha256-unavailable', 'SHA-256 returned the wrong size.');
  return Array.from(new CapturedUint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('sha256-unavailable', 'Canonical number is invalid.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (arrayIsArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const prototype = getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      fail('sha256-unavailable', 'Canonical payload contains a non-plain object.');
    const record = value as Record<string, unknown>;
    return `{${objectKeys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  fail('sha256-unavailable', 'Canonical payload contains unsupported data.');
}

async function sha256Canonical(domain: string, value: unknown): Promise<string> {
  const bytes = encoder.encode(`${domain}\0${canonical(value)}`);
  if (bytes.byteLength > MAXIMUM_CANONICAL_BYTES)
    fail('resource-budget-exceeded', 'Canonical seam/pin report exceeds its byte cap.');
  return sha256Bytes(bytes);
}

async function independentV4Receipt(
  positions: Float32Array,
  triangles: Uint32Array,
  pairs: Uint32Array,
): Promise<string> {
  const canonicalPairs: Array<readonly [number, number]> = [];
  for (let offset = 0; offset < pairs.length; offset += 2) {
    const a = pairs[offset]!;
    const b = pairs[offset + 1]!;
    canonicalPairs.push(a < b ? [a, b] : [b, a]);
  }
  canonicalPairs.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const header = new CapturedUint32Array([
    positions.length,
    triangles.length,
    canonicalPairs.length,
  ]);
  const pairWords = CapturedUint32Array.from(canonicalPairs.flatMap(([a, b]) => [a, b]));
  return sha256Bytes(
    concatBytes([
      encoder.encode(`${BETA_SKIRT_EXACT_VALIDATED_SEAM_SNAPSHOT_V1}\0`),
      uint32LeBytes(header),
      float32LeBytes(positions),
      uint32LeBytes(triangles),
      uint32LeBytes(pairWords),
    ]),
  );
}

const CLAIMS: BetaSkirtCanonicalMediumProductSeamPinClaimsV2 = freeze({
  genuineComposerV2AndV3OwnersBound: true,
  genuineSelfOrientationOwnerBound: true,
  genuinePlacementOwnerBound: true,
  exactV2ToV3BoundaryRemapReplayed: true,
  normalizedAndOriginalTopologyBound: true,
  assemblyOrderPairOrderPreserved: true,
  seamPairsUniqueOneToOneInRange: true,
  seamPairsByteColocated: true,
  semanticWaistPinsReplayed: true,
  exactInverseMassPinMaskVerified: true,
  rawFloat32PositionsBound: true,
  exactV4SeamReceiptIssued: true,
  productSeamPinDiagnosticAuthority: true,
  placementAuthority: false,
  collisionAuthority: false,
  initializationAuthority: false,
  runtimeAuthority: false,
  fitAuthority: false,
  productionAuthority: false,
});

export async function buildBetaSkirtCanonicalMediumProductSeamPinV2(
  input: unknown,
): Promise<BetaSkirtCanonicalMediumProductSeamPinResultV2> {
  try {
    const request = snapshotRequest(input);
    const v2 = projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner);
    const v3 = projectPatternImportDxfProductGarmentMeshComposerV3(request.composerV3Owner);
    const selfProjection = projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(
      request.selfOrientationOwner,
    );
    const placementProjection = projectBetaSkirtCanonicalMediumProductPlacementV1(
      request.placementOwner,
    );
    const placementAuthoredWaist =
      projectBetaSkirtCanonicalMediumProductPlacementAuthoredWaistClassificationInternalV1(
        request.placementOwner,
      );
    if (!v2 || !v3 || !selfProjection || !placementProjection || !placementAuthoredWaist) {
      fail(
        'upstream-owner-unavailable',
        'Live genuine composer V2/V3, self/orientation V2 and placement V1 owners are required.',
      );
    }
    const selfOwner =
      request.selfOrientationOwner as DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2;
    const placementOwner =
      request.placementOwner as BetaSkirtCanonicalMediumProductPlacementOwnerV1;
    if (
      request.expected.composerV2CanonicalSha256 !== v2.composerCanonicalSha256 ||
      request.expected.composerV3CanonicalSha256 !== v3.composerCanonicalSha256 ||
      request.expected.selfOrientationCanonicalSha256 !== selfProjection.reportCanonicalSha256 ||
      request.expected.selfOrientationCanonicalSha256 !== selfOwner.report.seal.canonicalSha256 ||
      request.expected.placementCanonicalSha256 !== placementOwner.snapshot.seal.canonicalSha256 ||
      placementProjection.snapshot.seal.canonicalSha256 !==
        request.expected.placementCanonicalSha256 ||
      placementAuthoredWaist.placementCanonicalSha256 !==
        request.expected.placementCanonicalSha256 ||
      placementAuthoredWaist.authoredFrameSha256 !==
        placementProjection.snapshot.bindings.authoredFrameSha256
    ) {
      fail(
        'authority-binding-mismatch',
        'Presented owner receipts do not match expected bindings.',
      );
    }
    if (
      v3.composerV2CanonicalSha256 !== v2.composerCanonicalSha256 ||
      v3.phase2ArtifactSha256 !== v2.phase2ArtifactSha256 ||
      placementProjection.snapshot.bindings.composerV2CanonicalSha256 !==
        v2.composerCanonicalSha256 ||
      placementProjection.snapshot.bindings.composerV3CanonicalSha256 !==
        v3.composerCanonicalSha256 ||
      placementProjection.snapshot.bindings.phase2ArtifactSha256 !== v3.phase2ArtifactSha256 ||
      placementProjection.snapshot.bindings.refinedArtifactSha256 !== v3.refinedArtifactSha256 ||
      selfOwner.report.bindings.composerV2CanonicalSha256 !== v2.composerCanonicalSha256 ||
      selfOwner.report.bindings.composerV3CanonicalSha256 !== v3.composerCanonicalSha256 ||
      selfOwner.report.bindings.phase2ArtifactSha256 !== v3.phase2ArtifactSha256 ||
      selfOwner.report.bindings.refinedArtifactSha256 !== v3.refinedArtifactSha256
    ) {
      fail('authority-binding-mismatch', 'Upstream owners are not one content-bound card session.');
    }
    if (
      selfProjection.productSelfOrientationDiagnosticAuthority !== true ||
      selfProjection.sourceSelfOrientationNoOpQualified !== true ||
      selfOwner.report.selfIntersection.residualNonadjacent.count !== 0 ||
      selfOwner.report.orientation.qualified !== true ||
      placementProjection.placementAuthority !== false ||
      placementProjection.collisionAuthority !== false
    ) {
      fail('authority-binding-mismatch', 'Required diagnostic upstream gates are not qualified.');
    }

    // Own every upstream binary before the first await. Later caller mutation/disposal cannot alter
    // this build, while the WeakMap projectors still reject forged or already-disposed owners.
    const positions = copyF32(selfProjection.positions3M, 'self.positions3M');
    const inverseMass = copyF32(selfProjection.positionsInvMass, 'self.positionsInvMass');
    const normalizedTriangles = copyU32(
      selfProjection.normalizedTriangles,
      'self.normalizedTriangles',
    );
    const selfSeams = copyU32(selfProjection.seamPairs, 'self.seamPairs');
    const selfPins = copyU32(
      selfProjection.pinnedWaistVertexIndices,
      'self.pinnedWaistVertexIndices',
    );
    const placementPositions = copyF32(
      placementProjection.collisionInput.garmentPositionsM,
      'placement.garmentPositionsM',
    );
    const placementTriangles = copyU32(
      placementProjection.collisionInput.garmentTriangles,
      'placement.garmentTriangles',
    );
    const placementInverseMass = copyF32(
      placementProjection.positionsInvMass,
      'placement.positionsInvMass',
    );
    const placementSeams = copyU32(placementProjection.seamPairs, 'placement.seamPairs');
    const placementPins = copyU32(
      placementProjection.pinnedWaistVertexIndices,
      'placement.pinnedWaistVertexIndices',
    );
    const originalTriangles = copyU32(v3.mesh.triangles, 'composerV3.mesh.triangles');
    finiteArrays(positions, inverseMass, placementPositions, placementInverseMass);
    if (
      positions.length !== CANONICAL_VERTEX_COUNT * 3 ||
      normalizedTriangles.length !== CANONICAL_TRIANGLE_COUNT * 3 ||
      v2.mesh.restPositions2Mm.length !== CANONICAL_V2_VERTEX_COUNT * 2 ||
      v2.mesh.triangles.length !== CANONICAL_V2_TRIANGLE_COUNT * 3 ||
      v3.mesh.restPositions2Mm.length !== CANONICAL_VERTEX_COUNT * 2 ||
      v3.vertexProvenance.length !== CANONICAL_VERTEX_COUNT
    ) {
      fail('resource-budget-exceeded', 'Canonical-medium V2/V3 counts drifted or exceed caps.');
    }
    const inspectedBinaryByteLength =
      positions.byteLength +
      inverseMass.byteLength +
      normalizedTriangles.byteLength +
      originalTriangles.byteLength +
      selfSeams.byteLength +
      selfPins.byteLength +
      placementPositions.byteLength +
      placementTriangles.byteLength +
      placementInverseMass.byteLength +
      placementSeams.byteLength +
      placementPins.byteLength;
    if (inspectedBinaryByteLength > MAXIMUM_RETAINED_BYTES)
      fail('resource-budget-exceeded', 'Canonical-medium seam/pin inspected bytes exceed the cap.');
    if (
      !exactBytes(positions, placementPositions) ||
      !exactBytes(inverseMass, placementInverseMass) ||
      !exactBytes(normalizedTriangles, placementTriangles)
    ) {
      fail('authority-binding-mismatch', 'Self/orientation and placement source bytes disagree.');
    }

    const topology = topologyAudit(originalTriangles, normalizedTriangles, v3);
    const remap = exactBoundaryRemap(v2, v3);
    const seams = flattenAndValidateSeams(v3, positions);
    const pins = replayPins(v2, remap, placementAuthoredWaist);
    if (
      !exactBytes(seams, selfSeams) ||
      !exactBytes(seams, placementSeams) ||
      !exactBytes(pins, selfPins) ||
      !exactBytes(pins, placementPins)
    ) {
      fail('authority-binding-mismatch', 'Independently replayed seams or pins differ upstream.');
    }
    const zeroInverseMassVertexCount = validatePinMask(positions, inverseMass, pins);
    const validationReceiptSha256 = computeBetaSkirtExactValidatedSeamReceiptSha256V1(
      positions,
      normalizedTriangles,
      seams,
    );
    if (!SHA256.test(validationReceiptSha256))
      fail('sha256-unavailable', 'Existing V4 seam computation returned an invalid digest.');

    const [
      originalTopologyRawSha256,
      normalizedTopologyRawSha256,
      positionsRawFloat32LeSha256,
      positionsInvMassRawFloat32LeSha256,
      seamPairsRawUint32LeSha256,
      pinnedVertexIndicesRawUint32LeSha256,
      independentReceipt,
    ] = await Promise.all([
      sha256Bytes(uint32LeBytes(originalTriangles)),
      sha256Bytes(uint32LeBytes(normalizedTriangles)),
      sha256Bytes(float32LeBytes(positions)),
      sha256Bytes(float32LeBytes(inverseMass)),
      sha256Bytes(uint32LeBytes(seams)),
      sha256Bytes(uint32LeBytes(pins)),
      independentV4Receipt(positions, normalizedTriangles, seams),
    ]);
    if (independentReceipt !== validationReceiptSha256)
      fail('authority-binding-mismatch', 'Independent seam receipt replay differs from V4.');
    if (
      selfOwner.report.bindings.initialPositions3MSha256 !== positionsRawFloat32LeSha256 ||
      selfOwner.report.bindings.initialPositionsInvMassSha256 !==
        positionsInvMassRawFloat32LeSha256 ||
      selfOwner.report.bindings.originalV3TopologySha256 !== originalTopologyRawSha256 ||
      selfOwner.report.bindings.normalizedTopologySha256 !== normalizedTopologyRawSha256 ||
      selfOwner.report.bindings.seamPairsSha256 !== seamPairsRawUint32LeSha256 ||
      selfOwner.report.bindings.pinnedWaistVertexIndicesSha256 !==
        pinnedVertexIndicesRawUint32LeSha256 ||
      placementProjection.collisionInput.binding.garmentPositionsSha256 !==
        positionsRawFloat32LeSha256 ||
      placementProjection.snapshot.bindings.garmentMappedPositionsSha256 !==
        positionsRawFloat32LeSha256
    ) {
      fail(
        'authority-binding-mismatch',
        'Raw binary SHA-256 replay differs from upstream bindings.',
      );
    }

    const retainedOwnerBinaryByteLength =
      positions.byteLength +
      inverseMass.byteLength +
      normalizedTriangles.byteLength +
      seams.byteLength +
      pins.byteLength;
    const bindings = freeze({
      composerV2CanonicalSha256: v2.composerCanonicalSha256,
      composerV3CanonicalSha256: v3.composerCanonicalSha256,
      phase2ArtifactSha256: v3.phase2ArtifactSha256,
      refinedArtifactSha256: v3.refinedArtifactSha256,
      selfOrientationCanonicalSha256: selfProjection.reportCanonicalSha256,
      placementCanonicalSha256: placementProjection.snapshot.seal.canonicalSha256,
      originalTopologyRawSha256,
      normalizedTopologyRawSha256,
      positionsRawFloat32LeSha256,
      positionsInvMassRawFloat32LeSha256,
      seamPairsRawUint32LeSha256,
      pinnedVertexIndicesRawUint32LeSha256,
      exactV4SeamValidationReceiptSha256: validationReceiptSha256,
    });
    const reportWithoutSeal = freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_REPORT_V2,
      status: 'diagnostic-complete' as const,
      bindings,
      counts: freeze({
        v2VertexCount: 244 as const,
        v2TriangleCount: 240 as const,
        vertexCount: 580 as const,
        boundaryVertexCount: 244 as const,
        interiorVertexCount: 336 as const,
        triangleCount: 912 as const,
        normalizedTriangleCount: 456 as const,
        seamCount: 2 as const,
        seamPairCount: 34 as const,
        seamVertexCount: 68 as const,
        pinnedVertexCount: 82 as const,
        zeroInverseMassVertexCount: zeroInverseMassVertexCount as 82,
      }),
      topology: freeze({
        originalV3TopologyPreservedSeparately: true as const,
        normalizedTopologyMatchesSelfAndPlacement: true as const,
        normalizedOnlyByPerPieceBCSwap: true as const,
        pieces: topology.pieces,
      }),
      seams: freeze({
        source: 'genuine-c6v3-assembly-order' as const,
        mapping: 'equal' as const,
        stableAuthoredOrder: true as const,
        oneToOne: true as const,
        distinctEndpoints: true as const,
        noDuplicateUnorderedPair: true as const,
        inRange: true as const,
        byteColocatedAtSource: true as const,
      }),
      pins: freeze({
        source: 'canonical-waist-boundary-via-exact-c6v2-to-c6v3-remap' as const,
        stableAscendingOrder: true as const,
        exactBoundaryRemapReplayed: true as const,
        exactSelfProjectionSet: true as const,
        exactPlacementProjectionSet: true as const,
        exactZeroInverseMassMask: true as const,
        mappedPositionWordsMatch: true as const,
      }),
      adapter: freeze({
        version: BETA_SKIRT_EXACT_VALIDATED_SEAM_SNAPSHOT_V1,
        validationStatus: 'exact-validated' as const,
        validationReceiptSha256,
        existingV4ComputationUsed: true as const,
        independentReceiptReplayMatched: true as const,
      }),
      resources: freeze({
        retainedOwnerBinaryByteLength,
        inspectedBinaryByteLength,
        bounded: true as const,
      }),
      claims: CLAIMS,
      deferred: freeze({
        placement: 'not-authorized' as const,
        collision: 'not-authorized' as const,
        initialization: 'not-authorized' as const,
        runtime: 'not-authorized' as const,
        fit: 'not-authorized' as const,
        production: 'not-authorized' as const,
      }),
    });
    const canonicalSha256 = await sha256Canonical(
      'beta-skirt-canonical-medium-product-seam-pin-v2',
      reportWithoutSeal,
    );
    const report: BetaSkirtCanonicalMediumProductSeamPinReportV2 = freeze({
      ...reportWithoutSeal,
      seal: freeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-card-session-product-seam-pin-diagnostic-only' as const,
      }),
    });
    const owner = freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_OWNER_V2,
      report,
    }) as BetaSkirtCanonicalMediumProductSeamPinOwnerV2;
    owners.set(owner, {
      disposed: false,
      positions3M: new CapturedFloat32Array(positions),
      positionsInvMass: new CapturedFloat32Array(inverseMass),
      normalizedTriangles: new CapturedUint32Array(normalizedTriangles),
      seamPairs: new CapturedUint32Array(seams),
      pinnedVertexIndices: new CapturedUint32Array(pins),
      validationReceiptSha256,
    });
    return freeze({ ok: true as const, owner, report, claims: CLAIMS });
  } catch (error) {
    return blocked(error);
  }
}

export function projectBetaSkirtCanonicalMediumProductSeamPinV2(
  owner: unknown,
): BetaSkirtCanonicalMediumProductSeamPinProjectionV2 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner);
  if (!record || record.disposed) return null;
  const publicOwner = owner as BetaSkirtCanonicalMediumProductSeamPinOwnerV2;
  return freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_PRODUCT_SEAM_PIN_PROJECTION_V2,
    reportCanonicalSha256: publicOwner.report.seal.canonicalSha256,
    positions3M: new CapturedFloat32Array(record.positions3M),
    positionsInvMass: new CapturedFloat32Array(record.positionsInvMass),
    normalizedTriangles: new CapturedUint32Array(record.normalizedTriangles),
    seamSnapshot: freeze({
      version: BETA_SKIRT_EXACT_VALIDATED_SEAM_SNAPSHOT_V1,
      validationStatus: 'exact-validated' as const,
      validationReceiptSha256: record.validationReceiptSha256,
      pairs: new CapturedUint32Array(record.seamPairs),
    }),
    pinnedVertexIndices: new CapturedUint32Array(record.pinnedVertexIndices),
    callerOwnedMutableBinaryCopies: true as const,
    productSeamPinDiagnosticAuthority: true as const,
    placementAuthority: false as const,
    collisionAuthority: false as const,
    initializationAuthority: false as const,
    runtimeAuthority: false as const,
    fitAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumProductSeamPinV2(owner: unknown): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner);
  if (!record || record.disposed) return false;
  record.disposed = true;
  float32Fill.call(record.positions3M, 0);
  float32Fill.call(record.positionsInvMass, 0);
  uint32Fill.call(record.normalizedTriangles, 0);
  uint32Fill.call(record.seamPairs, 0);
  uint32Fill.call(record.pinnedVertexIndices, 0);
  owners.delete(owner);
  return true;
}
