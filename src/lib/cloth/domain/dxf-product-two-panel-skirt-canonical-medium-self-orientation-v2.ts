import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
  type MeasurementSurfaceIntersectionKindV1,
  type MeasurementSurfaceIntersectionPairV1,
} from '../body/measurement-surface-self-intersection-v1';
import type { ClothMeshPieceRange } from '../mesh/cloth-mesh-ir';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_AUTHORED_FRAME_MAPPING_V1,
  mapDxfProductTwoPanelSkirtAnnularToAuthoredFrameV1,
  type DxfProductTwoPanelSkirtAnnularAuthoredFramePieceV1,
} from './dxf-product-two-panel-skirt-annular-authored-frame-mapping-v1';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerOwnerV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  projectPatternImportDxfProductGarmentMeshComposerV3,
  type PatternImportDxfProductGarmentMeshComposerOwnerV3,
} from './pattern-import-dxf-product-garment-mesh-composer-v3';

export const DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_REQUEST_V2 =
  'dxf-product-two-panel-skirt-canonical-medium-self-orientation-request/2' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_REPORT_V2 =
  'dxf-product-two-panel-skirt-canonical-medium-self-orientation-report/2' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_OWNER_V2 =
  'dxf-product-two-panel-skirt-canonical-medium-self-orientation-owner/2' as const;
export const DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_PROJECTION_V2 =
  'dxf-product-two-panel-skirt-canonical-medium-self-orientation-projection/2' as const;

const MAXIMUM_VERTEX_COUNT = 2_000;
const MAXIMUM_TRIANGLE_COUNT = 5_000;
const MAXIMUM_SEAM_PAIR_COUNT = 4_096;
const MAXIMUM_PIN_COUNT = 4_096;
const MAXIMUM_INPUT_BYTES = 256 * 1024;
const MAXIMUM_CANONICAL_BYTES = 4 * 1024 * 1024;
const MAXIMUM_WITNESS_COUNT_PER_CLASS = 64;
const MINIMUM_ORIENTATION_DOT = 0.999;
const MINIMUM_OUTWARD_RADIAL_DOT = 0.5;
const TWO_PI = Math.PI * 2;
const SHA256 = /^[0-9a-f]{64}$/u;
const encoder = new TextEncoder();
const freeze = Object.freeze;
const stringify = JSON.stringify;
const promiseAll = Promise.all.bind(Promise);
const objectValues = Object.values;
const objectEntries = Object.entries;
const objectKeys = Object.keys;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const reflectOwnKeys = Reflect.ownKeys;
const arrayIsArray = Array.isArray;
const CapturedUint8Array = Uint8Array;
const CapturedFloat32Array = Float32Array;
const CapturedUint32Array = Uint32Array;
const CapturedMap = Map;
const CapturedSet = Set;
const uint8ArraySet = Uint8Array.prototype.set;
const float32ArraySet = Float32Array.prototype.set;
const uint32ArraySet = Uint32Array.prototype.set;
const float32ArrayFill = Float32Array.prototype.fill;
const uint32ArrayFill = Uint32Array.prototype.fill;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const HEX = '0123456789abcdef';
const encodeText = TextEncoder.prototype.encode.bind(encoder);
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest.bind(capturedSubtle);

export const DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_LIMITS_V2 = freeze({
  maximumVertexCount: MAXIMUM_VERTEX_COUNT,
  maximumTriangleCount: MAXIMUM_TRIANGLE_COUNT,
  maximumSeamPairCount: MAXIMUM_SEAM_PAIR_COUNT,
  maximumPinCount: MAXIMUM_PIN_COUNT,
  maximumInputBytes: MAXIMUM_INPUT_BYTES,
  maximumCanonicalBytes: MAXIMUM_CANONICAL_BYTES,
  maximumWitnessCountPerClass: MAXIMUM_WITNESS_COUNT_PER_CLASS,
  minimumOrientationDot: MINIMUM_ORIENTATION_DOT,
  minimumOutwardRadialDot: MINIMUM_OUTWARD_RADIAL_DOT,
} as const);

export type DxfProductTwoPanelSkirtCanonicalMediumMappingSpecV2 = Readonly<{
  pieces: readonly [
    DxfProductTwoPanelSkirtAnnularAuthoredFramePieceV1,
    DxfProductTwoPanelSkirtAnnularAuthoredFramePieceV1,
  ];
  waistSlantRadiusMm: number;
  hemSlantRadiusMm: number;
  sectorSpanRadPerPiece: number;
  waistCenterM: readonly [number, number, number];
  seamAnchorAngleRad: number;
  parameterResidualMm: number;
  parameterResidualRad: number;
}>;

export type DxfProductTwoPanelSkirtCanonicalMediumMappingSnapshotV2 = Readonly<{
  positions3M: Float32Array;
  positionsInvMass: Float32Array;
  triangles: Uint32Array;
  seamPairs: Uint32Array;
  pinnedWaistVertexIndices: Uint32Array;
}>;

export type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationRequestV2 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_REQUEST_V2;
  expected: Readonly<{
    composerV2CanonicalSha256: string;
    composerV3CanonicalSha256: string;
    phase2ArtifactSha256: string;
    refinedArtifactSha256: string;
  }>;
  composerV2Owner: PatternImportDxfProductGarmentMeshComposerOwnerV2;
  composerV3Owner: PatternImportDxfProductGarmentMeshComposerOwnerV3;
  mappingSpec: DxfProductTwoPanelSkirtCanonicalMediumMappingSpecV2;
  mappingSnapshot: DxfProductTwoPanelSkirtCanonicalMediumMappingSnapshotV2;
}>;

type KindCounts = Readonly<Record<MeasurementSurfaceIntersectionKindV1, number>>;
type Witness = Readonly<MeasurementSurfaceIntersectionPairV1>;

type IntersectionClassV2 = Readonly<{
  count: number;
  kindCounts: KindCounts;
  witnesses: readonly Witness[];
  witnessesTruncated: boolean;
}>;

export type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationClaimsV2 = Readonly<{
  status: 'diagnostic-complete';
  genuineComposerV2AndV3Bound: true;
  authoredFrameMappingReplayedTwice: true;
  callerMappingSnapshotMatched: true;
  originalAndNormalizedTopologyBound: true;
  assemblyOrderSeamEquivalenceBound: true;
  semanticWaistPinsBound: true;
  exactSelfIntersectionEvaluated: true;
  selfIntersectionQualified: boolean;
  independentF64ReferenceBuilt: true;
  perPieceOutwardWindingVerified: boolean;
  orientationQualified: boolean;
  diagnosticPhysicalQualified: boolean;
  sourceSelfOrientationNoOpQualified: boolean;
  productSelfOrientationDiagnosticAuthority: true;
  sourceAuthenticityAccepted: false;
  placementAuthority: false;
  collisionAuthority: false;
  runtimeAuthority: false;
  persistenceAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationReportV2 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_REPORT_V2;
  status: 'diagnostic-complete';
  bindings: Readonly<{
    composerV2CanonicalSha256: string;
    composerV3CanonicalSha256: string;
    phase2ArtifactSha256: string;
    refinedArtifactSha256: string;
    originalV3TopologySha256: string;
    normalizedTopologySha256: string;
    initialPositions3MSha256: string;
    initialPositionsInvMassSha256: string;
    seamPairsSha256: string;
    pinnedWaistVertexIndicesSha256: string;
    originalTriangleMaterialFramesSha256: string;
    mappingSpecSha256: string;
    referencePositionsF64Sha256: string;
    selfPolicySha256: string;
    orientationPolicySha256: string;
  }>;
  counts: Readonly<{
    pieceCount: number;
    seamCount: number;
    vertexCount: number;
    triangleCount: number;
    seamPairCount: number;
    pinnedWaistVertexCount: number;
    normalizedTriangleCount: number;
  }>;
  normalization: Readonly<{
    sourceTopologyPreservedSeparately: true;
    normalizedTopologyUsedForDiagnostics: true;
    normalizedTopologySolverMaterialCompatibilityEstablished: false;
    pieces: readonly Readonly<{
      pieceId: string;
      triangleCount: number;
      indexOrderFlipped: boolean;
      normalizedTriangleCount: number;
      minimumPublishedOutwardRadialDot: number;
      maximumPublishedOutwardRadialDot: number;
    }>[];
  }>;
  selfIntersection: Readonly<{
    oracleVersion: typeof MEASUREMENT_SURFACE_SELF_INTERSECTION_V1;
    rawPairCount: number;
    broadPhaseCandidatePairCount: number;
    oracleTestedPairCount: number;
    rawOracleCount: number;
    indexedAdjacent: IntersectionClassV2;
    authenticatedSeamEquivalent: IntersectionClassV2;
    residualNonadjacent: IntersectionClassV2;
    exactAccounting: true;
    qualified: boolean;
  }>;
  orientation: Readonly<{
    comparison: 'published-f32-facet-vs-independent-discrete-f64-facet';
    minimumRequiredDot: typeof MINIMUM_ORIENTATION_DOT;
    minimumRequiredOutwardRadialDot: typeof MINIMUM_OUTWARD_RADIAL_DOT;
    minimumPublishedVsReferenceDot: number;
    minimumPublishedOutwardRadialDot: number;
    minimumReferenceOutwardRadialDot: number;
    maximumPublishedPositionQuantizationErrorM: number;
    publishedDegenerateTriangleCount: number;
    referenceDegenerateTriangleCount: number;
    normalReversalCount: number;
    thresholdFailureCount: number;
    outwardFailureCount: number;
    qualified: boolean;
  }>;
  decision:
    'PASS_PRODUCT_SELF_AND_ORIENTATION_DIAGNOSTIC' | 'BLOCK_PRODUCT_SELF_OR_ORIENTATION_DIAGNOSTIC';
  blockers: readonly (
    | 'residual-nonadjacent-self-intersections-present'
    | 'published-orientation-threshold-failed'
    | 'published-outward-winding-failed'
    | 'normalized-topology-solver-material-compatibility-not-established'
    | 'source-authenticity-not-established'
    | 'placement-owner-not-issued'
  )[];
  claims: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationClaimsV2;
  deferred: Readonly<{
    placement: 'not-authorized';
    collision: 'not-authorized';
    runtime: 'not-authorized';
    fit: 'not-authorized';
    production: 'not-authorized';
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-card-session-product-self-orientation-diagnostic-only';
  }>;
}>;

declare const canonicalMediumSelfOrientationOwnerBrand: unique symbol;
export type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_OWNER_V2;
  report: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationReportV2;
  readonly [canonicalMediumSelfOrientationOwnerBrand]: never;
}>;

export type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationProjectionV2 = Readonly<{
  schemaVersion: typeof DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_PROJECTION_V2;
  reportCanonicalSha256: string;
  positions3M: Float32Array;
  positionsInvMass: Float32Array;
  normalizedTriangles: Uint32Array;
  seamPairs: Uint32Array;
  pinnedWaistVertexIndices: Uint32Array;
  callerOwnedMutableBinaryCopies: true;
  productSelfOrientationDiagnosticAuthority: true;
  sourceSelfOrientationNoOpQualified: boolean;
  placementAuthority: false;
  collisionAuthority: false;
  runtimeAuthority: false;
  persistenceAuthority: false;
  productionAuthority: false;
}>;

export type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationErrorCodeV2 =
  | 'invalid-input'
  | 'upstream-owner-unavailable'
  | 'authority-binding-mismatch'
  | 'mapping-binding-mismatch'
  | 'resource-budget-exceeded'
  | 'self-oracle-rejected'
  | 'orientation-evaluation-failed'
  | 'sha256-unavailable';

const BLOCKED_CLAIMS = freeze({
  status: 'diagnostic-complete' as const,
  genuineComposerV2AndV3Bound: false as const,
  authoredFrameMappingReplayedTwice: false as const,
  callerMappingSnapshotMatched: false as const,
  originalAndNormalizedTopologyBound: false as const,
  assemblyOrderSeamEquivalenceBound: false as const,
  semanticWaistPinsBound: false as const,
  exactSelfIntersectionEvaluated: false as const,
  selfIntersectionQualified: false as const,
  independentF64ReferenceBuilt: false as const,
  perPieceOutwardWindingVerified: false as const,
  orientationQualified: false as const,
  diagnosticPhysicalQualified: false as const,
  sourceSelfOrientationNoOpQualified: false as const,
  productSelfOrientationDiagnosticAuthority: false as const,
  sourceAuthenticityAccepted: false as const,
  placementAuthority: false as const,
  collisionAuthority: false as const,
  runtimeAuthority: false as const,
  persistenceAuthority: false as const,
  fitAuthority: false as const,
  productionAuthority: false as const,
});

export type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationResultV2 =
  | Readonly<{
      ok: true;
      owner: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2;
      report: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationReportV2;
      claims: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationClaimsV2;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      report: null;
      claims: typeof BLOCKED_CLAIMS;
      blockers: readonly [
        Readonly<{
          code: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationErrorCodeV2;
          detail: string;
        }>,
      ];
    }>;

type OwnedMappingSnapshot = {
  positions3M: Float32Array;
  positionsInvMass: Float32Array;
  triangles: Uint32Array;
  seamPairs: Uint32Array;
  pinnedWaistVertexIndices: Uint32Array;
};

type SnapshottedRequest = {
  expected: {
    composerV2CanonicalSha256: string;
    composerV3CanonicalSha256: string;
    phase2ArtifactSha256: string;
    refinedArtifactSha256: string;
  };
  composerV2Owner: unknown;
  composerV3Owner: unknown;
  mappingSpec: DxfProductTwoPanelSkirtCanonicalMediumMappingSpecV2;
  mappingSnapshot: OwnedMappingSnapshot;
};

type OwnerRecord = OwnedMappingSnapshot & { disposed: boolean };
const owners = new WeakMap<object, OwnerRecord>();

class ProductSelfOrientationFailure extends Error {
  constructor(
    readonly code: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationErrorCodeV2,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(
  code: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationErrorCodeV2,
  detail: string,
): never {
  throw new ProductSelfOrientationFailure(code, detail);
}

function blocked(
  error: unknown,
): Extract<DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationResultV2, { ok: false }> {
  const failure =
    error instanceof ProductSelfOrientationFailure
      ? error
      : new ProductSelfOrientationFailure(
          'orientation-evaluation-failed',
          error instanceof Error ? error.message : String(error),
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

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || arrayIsArray(value)) {
    fail('invalid-input', `${label} must be a plain record.`);
  }
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== Object.prototype) {
    fail('invalid-input', `${label} must have the exact Object prototype.`);
  }
  const actual = reflectOwnKeys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    fail('invalid-input', `${label} must contain exactly ${keys.join(', ')}.`);
  }
  return value as Record<string, unknown>;
}

function ownData(record: Record<string, unknown>, key: string, label: string): unknown {
  const descriptor = objectGetOwnPropertyDescriptor(record, key);
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
    fail('invalid-input', `${label}.${key} must be enumerable own data.`);
  }
  return descriptor.value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('invalid-input', `${label} must be finite.`);
  }
  return value;
}

function positive(value: unknown, label: string): number {
  const result = finite(value, label);
  if (!(result > 0)) fail('invalid-input', `${label} must be positive.`);
  return result;
}

function exactArray(value: unknown, length: number, label: string): readonly unknown[] {
  if (!arrayIsArray(value) || objectGetPrototypeOf(value) !== Array.prototype) {
    fail('invalid-input', `${label} must be an exact Array.`);
  }
  const keys = reflectOwnKeys(value);
  const expected = Array.from({ length }, (_, index) => String(index));
  expected.push('length');
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(String(key)))) {
    fail('invalid-input', `${label} must contain exactly ${length} indexed values.`);
  }
  if (value.length !== length) fail('invalid-input', `${label} has an invalid length.`);
  for (let index = 0; index < length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      fail('invalid-input', `${label}[${index}] must be enumerable own data.`);
    }
  }
  return value;
}

function vector2(value: unknown, label: string): readonly [number, number] {
  const array = exactArray(value, 2, label);
  return [finite(array[0], `${label}[0]`), finite(array[1], `${label}[1]`)];
}

function vector3(value: unknown, label: string): readonly [number, number, number] {
  const array = exactArray(value, 3, label);
  return [
    finite(array[0], `${label}[0]`),
    finite(array[1], `${label}[1]`),
    finite(array[2], `${label}[2]`),
  ];
}

const typedArrayPrototype = objectGetPrototypeOf(Uint8Array.prototype) as object;
const typedArrayBufferGetter = objectGetOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;
const typedArrayLengthGetter = objectGetOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get;
const typedArrayByteLengthGetter = objectGetOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
)?.get;
const typedArrayByteOffsetGetter = objectGetOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteOffset',
)?.get;
const arrayBufferByteLengthGetter = objectGetOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)?.get;
const arrayBufferResizableGetter = objectGetOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get;

function ownedTypedArray<T extends Float32Array | Uint32Array>(
  value: unknown,
  prototype: object,
  ctor: { new (length: number): T },
  label: string,
): T {
  if (
    !typedArrayBufferGetter ||
    !typedArrayLengthGetter ||
    !typedArrayByteLengthGetter ||
    !typedArrayByteOffsetGetter ||
    !arrayBufferByteLengthGetter ||
    typeof value !== 'object' ||
    value === null ||
    objectGetPrototypeOf(value) !== prototype
  ) {
    fail('invalid-input', `${label} must be an exact typed array.`);
  }
  let buffer: ArrayBufferLike;
  let length: number;
  let byteLength: number;
  let byteOffset: number;
  try {
    buffer = typedArrayBufferGetter.call(value) as ArrayBufferLike;
    length = typedArrayLengthGetter.call(value) as number;
    byteLength = typedArrayByteLengthGetter.call(value) as number;
    byteOffset = typedArrayByteOffsetGetter.call(value) as number;
  } catch {
    fail('invalid-input', `${label} must have live typed-array storage.`);
  }
  if (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer) {
    fail('invalid-input', `${label} must not use SharedArrayBuffer.`);
  }
  if (objectGetPrototypeOf(buffer) !== ArrayBuffer.prototype) {
    fail('invalid-input', `${label}.buffer must be an ordinary ArrayBuffer.`);
  }
  const bufferByteLength = arrayBufferByteLengthGetter.call(buffer) as number;
  if (
    !Number.isSafeInteger(length) ||
    !Number.isSafeInteger(byteLength) ||
    byteOffset !== 0 ||
    byteLength !== bufferByteLength
  ) {
    fail('invalid-input', `${label} must own one complete fixed backing buffer.`);
  }
  if (arrayBufferResizableGetter?.call(buffer) === true) {
    fail('invalid-input', `${label} must not use resizable ArrayBuffer storage.`);
  }
  if (reflectOwnKeys(buffer).length !== 0) {
    fail('invalid-input', `${label}.buffer must be undecorated.`);
  }
  const keys = reflectOwnKeys(value);
  if (
    keys.length !== length ||
    keys.some((key, index) => typeof key !== 'string' || key !== String(index))
  ) {
    fail('invalid-input', `${label} must be undecorated.`);
  }
  const result = new ctor(length);
  if (prototype === Float32Array.prototype) {
    float32ArraySet.call(result as Float32Array, value as Float32Array);
  } else {
    uint32ArraySet.call(result as Uint32Array, value as Uint32Array);
  }
  return result;
}

function snapshotPiece(
  value: unknown,
  index: number,
): DxfProductTwoPanelSkirtAnnularAuthoredFramePieceV1 {
  const label = `mappingSpec.pieces[${index}]`;
  const record = exactRecord(
    value,
    ['pieceId', 'planarApexMm', 'planarMirrorSign', 'bodyAngularSign'],
    label,
  );
  const pieceId = ownData(record, 'pieceId', label);
  const planarMirrorSign = ownData(record, 'planarMirrorSign', label);
  const bodyAngularSign = ownData(record, 'bodyAngularSign', label);
  if (typeof pieceId !== 'string' || pieceId.length === 0 || pieceId.length > 256) {
    fail('invalid-input', `${label}.pieceId is invalid.`);
  }
  if (planarMirrorSign !== 1 && planarMirrorSign !== -1) {
    fail('invalid-input', `${label}.planarMirrorSign is invalid.`);
  }
  if (bodyAngularSign !== 1 && bodyAngularSign !== -1) {
    fail('invalid-input', `${label}.bodyAngularSign is invalid.`);
  }
  return freeze({
    pieceId,
    planarApexMm: freeze(vector2(ownData(record, 'planarApexMm', label), `${label}.planarApexMm`)),
    planarMirrorSign,
    bodyAngularSign,
  });
}

function snapshotRequestUnsafe(input: unknown): SnapshottedRequest {
  const request = exactRecord(
    input,
    [
      'schemaVersion',
      'expected',
      'composerV2Owner',
      'composerV3Owner',
      'mappingSpec',
      'mappingSnapshot',
    ],
    'request',
  );
  if (
    ownData(request, 'schemaVersion', 'request') !==
    DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_REQUEST_V2
  ) {
    fail('invalid-input', 'request.schemaVersion is invalid.');
  }
  const expectedRecord = exactRecord(
    ownData(request, 'expected', 'request'),
    [
      'composerV2CanonicalSha256',
      'composerV3CanonicalSha256',
      'phase2ArtifactSha256',
      'refinedArtifactSha256',
    ],
    'expected',
  );
  const expected = {
    composerV2CanonicalSha256: ownData(expectedRecord, 'composerV2CanonicalSha256', 'expected'),
    composerV3CanonicalSha256: ownData(expectedRecord, 'composerV3CanonicalSha256', 'expected'),
    phase2ArtifactSha256: ownData(expectedRecord, 'phase2ArtifactSha256', 'expected'),
    refinedArtifactSha256: ownData(expectedRecord, 'refinedArtifactSha256', 'expected'),
  };
  for (const [key, value] of objectEntries(expected)) {
    if (typeof value !== 'string' || !SHA256.test(value)) {
      fail('invalid-input', `expected.${key} must be lowercase SHA-256.`);
    }
  }

  const specRecord = exactRecord(
    ownData(request, 'mappingSpec', 'request'),
    [
      'pieces',
      'waistSlantRadiusMm',
      'hemSlantRadiusMm',
      'sectorSpanRadPerPiece',
      'waistCenterM',
      'seamAnchorAngleRad',
      'parameterResidualMm',
      'parameterResidualRad',
    ],
    'mappingSpec',
  );
  const piecesArray = exactArray(
    ownData(specRecord, 'pieces', 'mappingSpec'),
    2,
    'mappingSpec.pieces',
  );
  const mappingSpec = freeze({
    pieces: freeze([
      snapshotPiece(piecesArray[0], 0),
      snapshotPiece(piecesArray[1], 1),
    ]) as unknown as DxfProductTwoPanelSkirtCanonicalMediumMappingSpecV2['pieces'],
    waistSlantRadiusMm: positive(
      ownData(specRecord, 'waistSlantRadiusMm', 'mappingSpec'),
      'mappingSpec.waistSlantRadiusMm',
    ),
    hemSlantRadiusMm: positive(
      ownData(specRecord, 'hemSlantRadiusMm', 'mappingSpec'),
      'mappingSpec.hemSlantRadiusMm',
    ),
    sectorSpanRadPerPiece: positive(
      ownData(specRecord, 'sectorSpanRadPerPiece', 'mappingSpec'),
      'mappingSpec.sectorSpanRadPerPiece',
    ),
    waistCenterM: freeze(
      vector3(ownData(specRecord, 'waistCenterM', 'mappingSpec'), 'mappingSpec.waistCenterM'),
    ),
    seamAnchorAngleRad: finite(
      ownData(specRecord, 'seamAnchorAngleRad', 'mappingSpec'),
      'mappingSpec.seamAnchorAngleRad',
    ),
    parameterResidualMm: positive(
      ownData(specRecord, 'parameterResidualMm', 'mappingSpec'),
      'mappingSpec.parameterResidualMm',
    ),
    parameterResidualRad: positive(
      ownData(specRecord, 'parameterResidualRad', 'mappingSpec'),
      'mappingSpec.parameterResidualRad',
    ),
  });

  const geometryRecord = exactRecord(
    ownData(request, 'mappingSnapshot', 'request'),
    ['positions3M', 'positionsInvMass', 'triangles', 'seamPairs', 'pinnedWaistVertexIndices'],
    'mappingSnapshot',
  );
  const mappingSnapshot = {
    positions3M: ownedTypedArray(
      ownData(geometryRecord, 'positions3M', 'mappingSnapshot'),
      Float32Array.prototype,
      Float32Array,
      'mappingSnapshot.positions3M',
    ),
    positionsInvMass: ownedTypedArray(
      ownData(geometryRecord, 'positionsInvMass', 'mappingSnapshot'),
      Float32Array.prototype,
      Float32Array,
      'mappingSnapshot.positionsInvMass',
    ),
    triangles: ownedTypedArray(
      ownData(geometryRecord, 'triangles', 'mappingSnapshot'),
      Uint32Array.prototype,
      Uint32Array,
      'mappingSnapshot.triangles',
    ),
    seamPairs: ownedTypedArray(
      ownData(geometryRecord, 'seamPairs', 'mappingSnapshot'),
      Uint32Array.prototype,
      Uint32Array,
      'mappingSnapshot.seamPairs',
    ),
    pinnedWaistVertexIndices: ownedTypedArray(
      ownData(geometryRecord, 'pinnedWaistVertexIndices', 'mappingSnapshot'),
      Uint32Array.prototype,
      Uint32Array,
      'mappingSnapshot.pinnedWaistVertexIndices',
    ),
  };
  const buffers = objectValues(mappingSnapshot).map((value) => value.buffer);
  if (new CapturedSet(buffers).size !== buffers.length) {
    fail('invalid-input', 'mappingSnapshot typed arrays must not alias one backing buffer.');
  }
  return {
    expected: expected as SnapshottedRequest['expected'],
    composerV2Owner: ownData(request, 'composerV2Owner', 'request'),
    composerV3Owner: ownData(request, 'composerV3Owner', 'request'),
    mappingSpec,
    mappingSnapshot,
  };
}

function snapshotRequest(input: unknown): SnapshottedRequest {
  try {
    return snapshotRequestUnsafe(input);
  } catch (error) {
    if (error instanceof ProductSelfOrientationFailure) throw error;
    fail(
      'invalid-input',
      `Request could not be inspected safely: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function exactBytes(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (!typedArrayByteLengthGetter || !typedArrayBufferGetter || !typedArrayByteOffsetGetter) {
    fail('invalid-input', 'Typed-array intrinsic getters are unavailable.');
  }
  const leftLength = typedArrayByteLengthGetter.call(left) as number;
  const rightLength = typedArrayByteLengthGetter.call(right) as number;
  if (leftLength !== rightLength) return false;
  const a = new CapturedUint8Array(
    typedArrayBufferGetter.call(left) as ArrayBuffer,
    typedArrayByteOffsetGetter.call(left) as number,
    leftLength,
  );
  const b = new CapturedUint8Array(
    typedArrayBufferGetter.call(right) as ArrayBuffer,
    typedArrayByteOffsetGetter.call(right) as number,
    rightLength,
  );
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function requireSameMapping(
  left: OwnedMappingSnapshot,
  right: OwnedMappingSnapshot,
  label: string,
) {
  for (const key of objectKeys(left) as (keyof OwnedMappingSnapshot)[]) {
    if (!exactBytes(left[key], right[key])) {
      fail('mapping-binding-mismatch', `${label}.${key} is not byte-exact.`);
    }
  }
}

function inputByteLength(value: OwnedMappingSnapshot): number {
  return objectValues(value).reduce((sum, array) => sum + array.byteLength, 0);
}

function validateCounts(value: OwnedMappingSnapshot) {
  if (value.positions3M.length === 0 || value.positions3M.length % 3 !== 0) {
    fail('invalid-input', 'positions3M must contain complete XYZ vertices.');
  }
  const vertexCount = value.positions3M.length / 3;
  if (vertexCount > MAXIMUM_VERTEX_COUNT) {
    fail('resource-budget-exceeded', 'Vertex count exceeds the product cap.');
  }
  if (value.positionsInvMass.length !== vertexCount * 4) {
    fail('invalid-input', 'positionsInvMass does not match the vertex count.');
  }
  if (value.triangles.length === 0 || value.triangles.length % 3 !== 0) {
    fail('invalid-input', 'triangles must contain complete triples.');
  }
  const triangleCount = value.triangles.length / 3;
  if (triangleCount > MAXIMUM_TRIANGLE_COUNT) {
    fail('resource-budget-exceeded', 'Triangle count exceeds the product cap.');
  }
  if (value.seamPairs.length % 2 || value.seamPairs.length / 2 > MAXIMUM_SEAM_PAIR_COUNT) {
    fail('resource-budget-exceeded', 'Seam-pair count is malformed or exceeds the product cap.');
  }
  if (value.pinnedWaistVertexIndices.length > MAXIMUM_PIN_COUNT) {
    fail('resource-budget-exceeded', 'Pin count exceeds the product cap.');
  }
  if (inputByteLength(value) > MAXIMUM_INPUT_BYTES) {
    fail('resource-budget-exceeded', 'Owned mapping bytes exceed the product cap.');
  }
  for (const vertex of value.triangles) {
    if (vertex >= vertexCount) fail('invalid-input', 'triangles contain an out-of-range vertex.');
  }
  for (const vertex of value.seamPairs) {
    if (vertex >= vertexCount) fail('invalid-input', 'seamPairs contain an out-of-range vertex.');
  }
  for (const vertex of value.pinnedWaistVertexIndices) {
    if (vertex >= vertexCount) fail('invalid-input', 'pins contain an out-of-range vertex.');
  }
  for (const valueM of value.positions3M) {
    if (!Number.isFinite(valueM)) fail('invalid-input', 'positions3M contain non-finite data.');
  }
  return { vertexCount, triangleCount };
}

function normalizedAngle(value: number): number {
  const wrapped = value % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

function seamComponents(vertexCount: number, seamPairs: Uint32Array): Uint32Array {
  const parent = Uint32Array.from({ length: vertexCount }, (_, index) => index);
  const root = (input: number): number => {
    let value = input;
    while (parent[value] !== value) value = parent[value]!;
    let cursor = input;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor]!;
      parent[cursor] = value;
      cursor = next;
    }
    return value;
  };
  for (let offset = 0; offset < seamPairs.length; offset += 2) {
    const left = root(seamPairs[offset]!);
    const right = root(seamPairs[offset + 1]!);
    if (left !== right) parent[Math.max(left, right)] = Math.min(left, right);
  }
  for (let index = 0; index < vertexCount; index += 1) parent[index] = root(index);
  return parent;
}

function buildReferencePositions(
  restPositions2Mm: Float32Array,
  pieceRanges: readonly ClothMeshPieceRange[],
  spec: DxfProductTwoPanelSkirtCanonicalMediumMappingSpecV2,
  seamPairs: Uint32Array,
): Float64Array {
  const vertexCount = restPositions2Mm.length / 2;
  const pieceByVertex = Array.from({ length: vertexCount }, () => '');
  for (const range of pieceRanges) {
    for (let local = 0; local < range.vertexCount; local += 1) {
      const index = range.vertexOffset + local;
      if (index >= vertexCount || pieceByVertex[index]) {
        fail('orientation-evaluation-failed', 'Piece ranges overlap or exceed the vertex count.');
      }
      pieceByVertex[index] = range.pieceId;
    }
  }
  if (pieceByVertex.some((pieceId) => !pieceId)) {
    fail('orientation-evaluation-failed', 'Piece ranges do not cover every vertex.');
  }
  const pieceById = new CapturedMap(spec.pieces.map((piece) => [piece.pieceId, piece]));
  const coneSlope = (spec.sectorSpanRadPerPiece * 2) / TWO_PI;
  const axialSlope = Math.sqrt(1 - coneSlope * coneSlope);
  const result = new Float64Array(vertexCount * 3);
  for (let index = 0; index < vertexCount; index += 1) {
    const piece = pieceById.get(pieceByVertex[index]!);
    if (!piece) fail('orientation-evaluation-failed', 'A piece has no mapping parameters.');
    const dx = piece.planarMirrorSign * (restPositions2Mm[index * 2]! - piece.planarApexMm[0]);
    const dy = piece.planarMirrorSign * (restPositions2Mm[index * 2 + 1]! - piece.planarApexMm[1]);
    const radiusMm = Math.hypot(dx, dy);
    const angleRad = normalizedAngle(Math.atan2(dy, dx));
    const localAngleRad = Math.max(
      0,
      Math.min(spec.sectorSpanRadPerPiece, spec.sectorSpanRadPerPiece - angleRad),
    );
    const bodyAngleRad =
      spec.seamAnchorAngleRad + (piece.bodyAngularSign * localAngleRad) / coneSlope;
    const horizontalRadiusM = (coneSlope * radiusMm) / 1_000;
    result[index * 3] = spec.waistCenterM[0] + horizontalRadiusM * Math.cos(bodyAngleRad);
    result[index * 3 + 1] =
      spec.waistCenterM[1] - (axialSlope * (radiusMm - spec.waistSlantRadiusMm)) / 1_000;
    result[index * 3 + 2] = spec.waistCenterM[2] + horizontalRadiusM * Math.sin(bodyAngleRad);
  }
  const components = seamComponents(vertexCount, seamPairs);
  const representatives = new CapturedMap<number, number>();
  for (let index = 0; index < vertexCount; index += 1) {
    const component = components[index]!;
    representatives.set(component, Math.min(representatives.get(component) ?? index, index));
  }
  for (let index = 0; index < vertexCount; index += 1) {
    const source = representatives.get(components[index]!)!;
    result[index * 3] = result[source * 3]!;
    result[index * 3 + 1] = result[source * 3 + 1]!;
    result[index * 3 + 2] = result[source * 3 + 2]!;
  }
  return result;
}

type Normal = readonly [number, number, number] | null;

function triangleNormal(
  positions: ArrayLike<number>,
  triangles: Uint32Array,
  triangle: number,
): Normal {
  const a = triangles[triangle * 3]! * 3;
  const b = triangles[triangle * 3 + 1]! * 3;
  const c = triangles[triangle * 3 + 2]! * 3;
  const abx = positions[b]! - positions[a]!;
  const aby = positions[b + 1]! - positions[a + 1]!;
  const abz = positions[b + 2]! - positions[a + 2]!;
  const acx = positions[c]! - positions[a]!;
  const acy = positions[c + 1]! - positions[a + 1]!;
  const acz = positions[c + 2]! - positions[a + 2]!;
  const x = aby * acz - abz * acy;
  const y = abz * acx - abx * acz;
  const z = abx * acy - aby * acx;
  const length = Math.hypot(x, y, z);
  return length > 1e-14 ? [x / length, y / length, z / length] : null;
}

function outwardDot(
  positions: ArrayLike<number>,
  triangles: Uint32Array,
  triangle: number,
  normal: readonly [number, number, number],
  waistCenterM: readonly [number, number, number],
): number {
  const a = triangles[triangle * 3]! * 3;
  const b = triangles[triangle * 3 + 1]! * 3;
  const c = triangles[triangle * 3 + 2]! * 3;
  const x = (positions[a]! + positions[b]! + positions[c]!) / 3 - waistCenterM[0];
  const z = (positions[a + 2]! + positions[b + 2]! + positions[c + 2]!) / 3 - waistCenterM[2];
  const length = Math.hypot(x, z);
  return length > 1e-14 ? (normal[0] * x + normal[2] * z) / length : -1;
}

function orientationEvaluation(
  published: Float32Array,
  reference: Float64Array,
  triangles: Uint32Array,
  pieceRanges: readonly ClothMeshPieceRange[],
  waistCenterM: readonly [number, number, number],
) {
  let minimumPublishedVsReferenceDot = 1;
  let minimumPublishedOutwardRadialDot = 1;
  let minimumReferenceOutwardRadialDot = 1;
  let publishedDegenerateTriangleCount = 0;
  let referenceDegenerateTriangleCount = 0;
  let normalReversalCount = 0;
  let thresholdFailureCount = 0;
  let outwardFailureCount = 0;
  const pieceReports = pieceRanges.map((range) => {
    let minimum = 1;
    let maximum = -1;
    let normalizedTriangleCount = 0;
    for (let local = 0; local < range.triangleCount; local += 1) {
      const triangle = range.triangleOffset + local;
      const publishedNormal = triangleNormal(published, triangles, triangle);
      const referenceNormal = triangleNormal(reference, triangles, triangle);
      if (!publishedNormal) publishedDegenerateTriangleCount += 1;
      if (!referenceNormal) referenceDegenerateTriangleCount += 1;
      if (!publishedNormal || !referenceNormal) continue;
      const dot =
        publishedNormal[0] * referenceNormal[0] +
        publishedNormal[1] * referenceNormal[1] +
        publishedNormal[2] * referenceNormal[2];
      const publishedOutward = outwardDot(
        published,
        triangles,
        triangle,
        publishedNormal,
        waistCenterM,
      );
      const referenceOutward = outwardDot(
        reference,
        triangles,
        triangle,
        referenceNormal,
        waistCenterM,
      );
      minimumPublishedVsReferenceDot = Math.min(minimumPublishedVsReferenceDot, dot);
      minimumPublishedOutwardRadialDot = Math.min(
        minimumPublishedOutwardRadialDot,
        publishedOutward,
      );
      minimumReferenceOutwardRadialDot = Math.min(
        minimumReferenceOutwardRadialDot,
        referenceOutward,
      );
      minimum = Math.min(minimum, publishedOutward);
      maximum = Math.max(maximum, publishedOutward);
      if (dot < 0) normalReversalCount += 1;
      if (dot < MINIMUM_ORIENTATION_DOT) thresholdFailureCount += 1;
      if (
        publishedOutward < MINIMUM_OUTWARD_RADIAL_DOT ||
        referenceOutward < MINIMUM_OUTWARD_RADIAL_DOT
      ) {
        outwardFailureCount += 1;
      }
      normalizedTriangleCount += 1;
    }
    return freeze({
      pieceId: range.pieceId,
      triangleCount: range.triangleCount,
      normalizedTriangleCount,
      minimumPublishedOutwardRadialDot: minimum,
      maximumPublishedOutwardRadialDot: maximum,
    });
  });
  let maximumPublishedPositionQuantizationErrorM = 0;
  for (let index = 0; index < published.length; index += 1) {
    maximumPublishedPositionQuantizationErrorM = Math.max(
      maximumPublishedPositionQuantizationErrorM,
      Math.abs(published[index]! - reference[index]!),
    );
  }
  const qualified =
    publishedDegenerateTriangleCount === 0 &&
    referenceDegenerateTriangleCount === 0 &&
    normalReversalCount === 0 &&
    thresholdFailureCount === 0 &&
    outwardFailureCount === 0;
  return {
    pieceReports,
    minimumPublishedVsReferenceDot,
    minimumPublishedOutwardRadialDot,
    minimumReferenceOutwardRadialDot,
    maximumPublishedPositionQuantizationErrorM,
    publishedDegenerateTriangleCount,
    referenceDegenerateTriangleCount,
    normalReversalCount,
    thresholdFailureCount,
    outwardFailureCount,
    qualified,
  };
}

function kindCounts(): Record<MeasurementSurfaceIntersectionKindV1, number> {
  return { 'proper-crossing': 0, 'coplanar-overlap': 0, touching: 0 };
}

function classifyIntersections(
  intersections: readonly Witness[],
  triangles: Uint32Array,
  seamPairs: Uint32Array,
  vertexCount: number,
) {
  const components = seamComponents(vertexCount, seamPairs);
  const indexed: Witness[] = [];
  const seam: Witness[] = [];
  const residual: Witness[] = [];
  for (const witness of intersections) {
    const left = [
      triangles[witness.triangleA * 3]!,
      triangles[witness.triangleA * 3 + 1]!,
      triangles[witness.triangleA * 3 + 2]!,
    ];
    const right = [
      triangles[witness.triangleB * 3]!,
      triangles[witness.triangleB * 3 + 1]!,
      triangles[witness.triangleB * 3 + 2]!,
    ];
    if (left.some((vertex) => right.includes(vertex))) indexed.push(witness);
    else if (
      left.some((leftVertex) =>
        right.some((rightVertex) => components[leftVertex] === components[rightVertex]),
      )
    ) {
      seam.push(witness);
    } else residual.push(witness);
  }
  const report = (values: readonly Witness[]): IntersectionClassV2 => {
    const counts = kindCounts();
    for (const value of values) counts[value.kind] += 1;
    return freeze({
      count: values.length,
      kindCounts: freeze(counts),
      witnesses: freeze(
        values.slice(0, MAXIMUM_WITNESS_COUNT_PER_CLASS).map((value) => freeze({ ...value })),
      ),
      witnessesTruncated: values.length > MAXIMUM_WITNESS_COUNT_PER_CLASS,
    });
  };
  return {
    indexed: report(indexed),
    seam: report(seam),
    residual: report(residual),
  };
}

function normalizationAudit(
  original: Uint32Array,
  normalized: Uint32Array,
  pieceRanges: readonly ClothMeshPieceRange[],
) {
  if (original.length !== normalized.length) {
    fail('mapping-binding-mismatch', 'Normalized topology length changed.');
  }
  let normalizedTriangleCount = 0;
  const pieces = pieceRanges.map((range) => {
    let same = 0;
    let flipped = 0;
    for (let local = 0; local < range.triangleCount; local += 1) {
      const offset = (range.triangleOffset + local) * 3;
      const originalA = original[offset]!;
      const originalB = original[offset + 1]!;
      const originalC = original[offset + 2]!;
      if (
        normalized[offset] === originalA &&
        normalized[offset + 1] === originalB &&
        normalized[offset + 2] === originalC
      ) {
        same += 1;
      } else if (
        normalized[offset] === originalA &&
        normalized[offset + 1] === originalC &&
        normalized[offset + 2] === originalB
      ) {
        flipped += 1;
      } else {
        fail('mapping-binding-mismatch', `${range.pieceId} topology changed beyond B/C winding.`);
      }
    }
    if (same > 0 && flipped > 0) {
      fail('mapping-binding-mismatch', `${range.pieceId} has mixed normalization.`);
    }
    normalizedTriangleCount += flipped;
    return {
      pieceId: range.pieceId,
      triangleCount: range.triangleCount,
      indexOrderFlipped: flipped === range.triangleCount,
      normalizedTriangleCount: flipped,
    };
  });
  return { pieces, normalizedTriangleCount };
}

async function sha256Bytes(value: ArrayBufferView): Promise<string> {
  if (!capturedDigest) fail('sha256-unavailable', 'SHA-256 is unavailable.');
  if (!typedArrayByteLengthGetter || !typedArrayBufferGetter || !typedArrayByteOffsetGetter) {
    fail('sha256-unavailable', 'Typed-array intrinsic getters are unavailable.');
  }
  const byteLength = typedArrayByteLengthGetter.call(value) as number;
  const owned = new CapturedUint8Array(byteLength);
  uint8ArraySet.call(
    owned,
    new CapturedUint8Array(
      typedArrayBufferGetter.call(value) as ArrayBuffer,
      typedArrayByteOffsetGetter.call(value) as number,
      byteLength,
    ),
  );
  const digest = await capturedDigest('SHA-256', owned);
  const bytes = new CapturedUint8Array(digest);
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index]!;
    result += HEX[byte >>> 4]! + HEX[byte & 15]!;
  }
  return result;
}

async function sha256Text(value: string): Promise<string> {
  const bytes = encodeText(value);
  const byteLength = typedArrayByteLengthGetter?.call(bytes) as number | undefined;
  if (byteLength === undefined || byteLength > MAXIMUM_CANONICAL_BYTES) {
    fail('resource-budget-exceeded', 'Canonical report bytes exceed the product cap.');
  }
  return sha256Bytes(bytes);
}

function selfPolicy() {
  return freeze({
    ...DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
    maxVertices: MAXIMUM_VERTEX_COUNT,
    maxTriangles: MAXIMUM_TRIANGLE_COUNT,
    maxInputBytes: MAXIMUM_INPUT_BYTES,
    maxCandidatePairs: 2_000_000,
  });
}

export async function buildDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(
  input: unknown,
): Promise<DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationResultV2> {
  try {
    const request = snapshotRequest(input);
    validateCounts(request.mappingSnapshot);
    const v2 = projectPatternImportDxfProductGarmentMeshComposerV2(request.composerV2Owner);
    const v3 = projectPatternImportDxfProductGarmentMeshComposerV3(request.composerV3Owner);
    if (!v2 || !v3) fail('upstream-owner-unavailable', 'Composer V2 or V3 owner is unavailable.');
    if (
      request.expected.composerV2CanonicalSha256 !== v2.composerCanonicalSha256 ||
      request.expected.composerV3CanonicalSha256 !== v3.composerCanonicalSha256 ||
      request.expected.phase2ArtifactSha256 !== v3.phase2ArtifactSha256 ||
      v2.phase2ArtifactSha256 !== v3.phase2ArtifactSha256 ||
      request.expected.refinedArtifactSha256 !== v3.refinedArtifactSha256 ||
      v3.composerV2CanonicalSha256 !== v2.composerCanonicalSha256
    ) {
      fail('authority-binding-mismatch', 'Expected composer or artifact binding does not match.');
    }
    const mappingInput = {
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_ANNULAR_AUTHORED_FRAME_MAPPING_V1,
      mesh: v3.mesh,
      ...request.mappingSpec,
    } as const;
    const trustedFirst = mapDxfProductTwoPanelSkirtAnnularToAuthoredFrameV1(mappingInput);
    const v3Repeat = projectPatternImportDxfProductGarmentMeshComposerV3(request.composerV3Owner);
    if (!v3Repeat) fail('upstream-owner-unavailable', 'Composer V3 owner disappeared on replay.');
    const trustedSecond = mapDxfProductTwoPanelSkirtAnnularToAuthoredFrameV1({
      ...mappingInput,
      mesh: v3Repeat.mesh,
    });
    const firstSnapshot: OwnedMappingSnapshot = {
      positions3M: trustedFirst.positions3M,
      positionsInvMass: trustedFirst.positionsInvMass,
      triangles: trustedFirst.triangles,
      seamPairs: trustedFirst.seamPairs,
      pinnedWaistVertexIndices: trustedFirst.pinnedWaistVertexIndices,
    };
    const secondSnapshot: OwnedMappingSnapshot = {
      positions3M: trustedSecond.positions3M,
      positionsInvMass: trustedSecond.positionsInvMass,
      triangles: trustedSecond.triangles,
      seamPairs: trustedSecond.seamPairs,
      pinnedWaistVertexIndices: trustedSecond.pinnedWaistVertexIndices,
    };
    requireSameMapping(firstSnapshot, secondSnapshot, 'mapping replay');
    requireSameMapping(request.mappingSnapshot, firstSnapshot, 'caller mapping snapshot');
    const { vertexCount, triangleCount } = validateCounts(firstSnapshot);

    const normalization = normalizationAudit(
      v3.mesh.triangles,
      firstSnapshot.triangles,
      v3.mesh.pieceRanges,
    );
    if (
      normalization.normalizedTriangleCount !==
        trustedFirst.report.outwardWindingNormalizedTriangleCount ||
      normalization.pieces.some((piece, index) => {
        const trusted = trustedFirst.report.pieceWinding[index];
        return (
          !trusted ||
          piece.pieceId !== trusted.pieceId ||
          piece.triangleCount !== trusted.triangleCount ||
          piece.indexOrderFlipped !== trusted.indexOrderFlipped
        );
      })
    ) {
      fail('mapping-binding-mismatch', 'Mapping normalization report does not match topology.');
    }

    const reference = buildReferencePositions(
      v3.mesh.restPositions2Mm,
      v3.mesh.pieceRanges,
      request.mappingSpec,
      firstSnapshot.seamPairs,
    );
    const orientation = orientationEvaluation(
      firstSnapshot.positions3M,
      reference,
      firstSnapshot.triangles,
      v3.mesh.pieceRanges,
      request.mappingSpec.waistCenterM,
    );
    const selfOracle = validateMeasurementSurfaceSelfIntersectionV1(
      firstSnapshot.positions3M,
      firstSnapshot.triangles,
      selfPolicy(),
    );
    const classified = classifyIntersections(
      selfOracle.intersections,
      firstSnapshot.triangles,
      firstSnapshot.seamPairs,
      vertexCount,
    );
    if (
      classified.indexed.count + classified.seam.count + classified.residual.count !==
      selfOracle.intersectionCount
    ) {
      fail('self-oracle-rejected', 'Self-intersection classification accounting is not exact.');
    }
    const selfQualified = classified.residual.count === 0;
    const diagnosticPhysicalQualified = selfQualified && orientation.qualified;
    const blockers: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationReportV2['blockers'][number][] =
      [];
    if (!selfQualified) blockers.push('residual-nonadjacent-self-intersections-present');
    if (orientation.thresholdFailureCount || orientation.normalReversalCount) {
      blockers.push('published-orientation-threshold-failed');
    }
    if (
      orientation.outwardFailureCount ||
      orientation.publishedDegenerateTriangleCount ||
      orientation.referenceDegenerateTriangleCount
    ) {
      blockers.push('published-outward-winding-failed');
    }
    blockers.push(
      'normalized-topology-solver-material-compatibility-not-established',
      'source-authenticity-not-established',
      'placement-owner-not-issued',
    );

    const selfPolicyValue = selfPolicy();
    const orientationPolicyValue = freeze({
      minimumOrientationDot: MINIMUM_ORIENTATION_DOT,
      minimumOutwardRadialDot: MINIMUM_OUTWARD_RADIAL_DOT,
      comparison: 'published-f32-facet-vs-independent-discrete-f64-facet' as const,
    });
    const normalizationPieces = freeze(
      normalization.pieces.map((piece, index) =>
        freeze({
          ...piece,
          minimumPublishedOutwardRadialDot:
            orientation.pieceReports[index]!.minimumPublishedOutwardRadialDot,
          maximumPublishedOutwardRadialDot:
            orientation.pieceReports[index]!.maximumPublishedOutwardRadialDot,
        }),
      ),
    );
    const [
      originalV3TopologySha256,
      normalizedTopologySha256,
      initialPositions3MSha256,
      initialPositionsInvMassSha256,
      seamPairsSha256,
      pinnedWaistVertexIndicesSha256,
      originalTriangleMaterialFramesSha256,
      mappingSpecSha256,
      referencePositionsF64Sha256,
      selfPolicySha256,
      orientationPolicySha256,
    ] = await promiseAll([
      sha256Bytes(v3.mesh.triangles),
      sha256Bytes(firstSnapshot.triangles),
      sha256Bytes(firstSnapshot.positions3M),
      sha256Bytes(firstSnapshot.positionsInvMass),
      sha256Bytes(firstSnapshot.seamPairs),
      sha256Bytes(firstSnapshot.pinnedWaistVertexIndices),
      sha256Bytes(v3.triangleMaterialFrames2),
      sha256Text(stringify(request.mappingSpec)),
      sha256Bytes(reference),
      sha256Text(stringify(selfPolicyValue)),
      sha256Text(stringify(orientationPolicyValue)),
    ]);

    const claims: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationClaimsV2 = freeze({
      status: 'diagnostic-complete' as const,
      genuineComposerV2AndV3Bound: true as const,
      authoredFrameMappingReplayedTwice: true as const,
      callerMappingSnapshotMatched: true as const,
      originalAndNormalizedTopologyBound: true as const,
      assemblyOrderSeamEquivalenceBound: true as const,
      semanticWaistPinsBound: true as const,
      exactSelfIntersectionEvaluated: true as const,
      selfIntersectionQualified: selfQualified,
      independentF64ReferenceBuilt: true as const,
      perPieceOutwardWindingVerified:
        orientation.outwardFailureCount === 0 &&
        orientation.publishedDegenerateTriangleCount === 0 &&
        orientation.referenceDegenerateTriangleCount === 0,
      orientationQualified: orientation.qualified,
      diagnosticPhysicalQualified,
      sourceSelfOrientationNoOpQualified: diagnosticPhysicalQualified,
      productSelfOrientationDiagnosticAuthority: true as const,
      sourceAuthenticityAccepted: false as const,
      placementAuthority: false as const,
      collisionAuthority: false as const,
      runtimeAuthority: false as const,
      persistenceAuthority: false as const,
      fitAuthority: false as const,
      productionAuthority: false as const,
    });
    const reportWithoutSeal = freeze({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_REPORT_V2,
      status: 'diagnostic-complete' as const,
      bindings: freeze({
        composerV2CanonicalSha256: v2.composerCanonicalSha256,
        composerV3CanonicalSha256: v3.composerCanonicalSha256,
        phase2ArtifactSha256: v3.phase2ArtifactSha256,
        refinedArtifactSha256: v3.refinedArtifactSha256,
        originalV3TopologySha256,
        normalizedTopologySha256,
        initialPositions3MSha256,
        initialPositionsInvMassSha256,
        seamPairsSha256,
        pinnedWaistVertexIndicesSha256,
        originalTriangleMaterialFramesSha256,
        mappingSpecSha256,
        referencePositionsF64Sha256,
        selfPolicySha256,
        orientationPolicySha256,
      }),
      counts: freeze({
        pieceCount: v3.mesh.pieceRanges.length,
        seamCount: v3.mesh.seams.length,
        vertexCount,
        triangleCount,
        seamPairCount: firstSnapshot.seamPairs.length / 2,
        pinnedWaistVertexCount: firstSnapshot.pinnedWaistVertexIndices.length,
        normalizedTriangleCount: normalization.normalizedTriangleCount,
      }),
      normalization: freeze({
        sourceTopologyPreservedSeparately: true as const,
        normalizedTopologyUsedForDiagnostics: true as const,
        normalizedTopologySolverMaterialCompatibilityEstablished: false as const,
        pieces: normalizationPieces,
      }),
      selfIntersection: freeze({
        oracleVersion: MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
        rawPairCount: (triangleCount * (triangleCount - 1)) / 2,
        broadPhaseCandidatePairCount: selfOracle.broadPhase.candidatePairCount,
        oracleTestedPairCount: selfOracle.broadPhase.testedPairCount,
        rawOracleCount: selfOracle.intersectionCount,
        indexedAdjacent: classified.indexed,
        authenticatedSeamEquivalent: classified.seam,
        residualNonadjacent: classified.residual,
        exactAccounting: true as const,
        qualified: selfQualified,
      }),
      orientation: freeze({
        comparison: 'published-f32-facet-vs-independent-discrete-f64-facet' as const,
        minimumRequiredDot: MINIMUM_ORIENTATION_DOT,
        minimumRequiredOutwardRadialDot: MINIMUM_OUTWARD_RADIAL_DOT,
        minimumPublishedVsReferenceDot: orientation.minimumPublishedVsReferenceDot,
        minimumPublishedOutwardRadialDot: orientation.minimumPublishedOutwardRadialDot,
        minimumReferenceOutwardRadialDot: orientation.minimumReferenceOutwardRadialDot,
        maximumPublishedPositionQuantizationErrorM:
          orientation.maximumPublishedPositionQuantizationErrorM,
        publishedDegenerateTriangleCount: orientation.publishedDegenerateTriangleCount,
        referenceDegenerateTriangleCount: orientation.referenceDegenerateTriangleCount,
        normalReversalCount: orientation.normalReversalCount,
        thresholdFailureCount: orientation.thresholdFailureCount,
        outwardFailureCount: orientation.outwardFailureCount,
        qualified: orientation.qualified,
      }),
      decision: diagnosticPhysicalQualified
        ? ('PASS_PRODUCT_SELF_AND_ORIENTATION_DIAGNOSTIC' as const)
        : ('BLOCK_PRODUCT_SELF_OR_ORIENTATION_DIAGNOSTIC' as const),
      blockers: freeze(blockers),
      claims,
      deferred: freeze({
        placement: 'not-authorized' as const,
        collision: 'not-authorized' as const,
        runtime: 'not-authorized' as const,
        fit: 'not-authorized' as const,
        production: 'not-authorized' as const,
      }),
    });
    const canonicalSha256 = await sha256Text(stringify(reportWithoutSeal));
    const report: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationReportV2 = freeze({
      ...reportWithoutSeal,
      seal: freeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-card-session-product-self-orientation-diagnostic-only' as const,
      }),
    });
    const owner = freeze({
      schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_OWNER_V2,
      report,
    }) as DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2;
    weakMapSet.call(owners, owner, {
      disposed: false,
      positions3M: new CapturedFloat32Array(firstSnapshot.positions3M),
      positionsInvMass: new CapturedFloat32Array(firstSnapshot.positionsInvMass),
      triangles: new CapturedUint32Array(firstSnapshot.triangles),
      seamPairs: new CapturedUint32Array(firstSnapshot.seamPairs),
      pinnedWaistVertexIndices: new CapturedUint32Array(firstSnapshot.pinnedWaistVertexIndices),
    });
    return freeze({ ok: true as const, owner, report, claims });
  } catch (error) {
    return blocked(error);
  }
}

export function projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(
  owner: unknown,
): DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationProjectionV2 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = weakMapGet.call(owners, owner) as OwnerRecord | undefined;
  if (!record || record.disposed) return null;
  const publicOwner = owner as DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2;
  return freeze({
    schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_CANONICAL_MEDIUM_SELF_ORIENTATION_PROJECTION_V2,
    reportCanonicalSha256: publicOwner.report.seal.canonicalSha256,
    positions3M: new CapturedFloat32Array(record.positions3M),
    positionsInvMass: new CapturedFloat32Array(record.positionsInvMass),
    normalizedTriangles: new CapturedUint32Array(record.triangles),
    seamPairs: new CapturedUint32Array(record.seamPairs),
    pinnedWaistVertexIndices: new CapturedUint32Array(record.pinnedWaistVertexIndices),
    callerOwnedMutableBinaryCopies: true as const,
    productSelfOrientationDiagnosticAuthority: true as const,
    sourceSelfOrientationNoOpQualified:
      publicOwner.report.claims.sourceSelfOrientationNoOpQualified,
    placementAuthority: false as const,
    collisionAuthority: false as const,
    runtimeAuthority: false as const,
    persistenceAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(
  owner: unknown,
): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = weakMapGet.call(owners, owner) as OwnerRecord | undefined;
  if (!record || record.disposed) return false;
  record.disposed = true;
  float32ArrayFill.call(record.positions3M, 0);
  float32ArrayFill.call(record.positionsInvMass, 0);
  uint32ArrayFill.call(record.triangles, 0);
  uint32ArrayFill.call(record.seamPairs, 0);
  uint32ArrayFill.call(record.pinnedWaistVertexIndices, 0);
  return true;
}
