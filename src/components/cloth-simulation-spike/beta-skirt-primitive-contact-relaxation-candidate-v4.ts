import {
  BetaSkirtCoherentEnvelopeQualityErrorV1,
  evaluateBetaSkirtCoherentEnvelopeQualityV1,
  type BetaSkirtCoherentEnvelopeQualityReportV1,
  type BetaSkirtCoherentEnvelopeQualityTransformV1,
} from './beta-skirt-coherent-envelope-quality-evidence-v1';
import {
  BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS,
  type BetaSkirtV4SolverSourceHashes,
} from './beta-skirt-v4-solver-source-geometry-hash';

/* Authority intrinsics are captured at module initialization.  Preload integrity is a disclosed
 * trusted assumption; callers cannot change validation or solver semantics after import. */
const CAPTURED_REFLECT_APPLY = Reflect.apply;
const CAPTURED_OBJECT_FREEZE = Object.freeze;
const CAPTURED_OBJECT_CREATE = Object.create;
const CAPTURED_OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const CAPTURED_OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const CAPTURED_OBJECT_GET_OWN_PROPERTY_NAMES = Object.getOwnPropertyNames;
const CAPTURED_OBJECT_GET_OWN_PROPERTY_SYMBOLS = Object.getOwnPropertySymbols;
const CAPTURED_OBJECT_KEYS = Object.keys;
const CAPTURED_OBJECT_IS = Object.is;
const CAPTURED_HAS_OWN_PROPERTY = Object.prototype.hasOwnProperty;
const CAPTURED_ARRAY_IS_ARRAY = Array.isArray;
const CAPTURED_ARRAY_SORT = Array.prototype.sort;
const CAPTURED_ARRAY_SOME = Array.prototype.some;
const CAPTURED_ARRAY_INCLUDES = Array.prototype.includes;
const CAPTURED_ARRAY_JOIN = Array.prototype.join;
const CAPTURED_SET = Set;
const CAPTURED_SET_HAS = Set.prototype.has;
const CAPTURED_SET_ADD = Set.prototype.add;
const CAPTURED_MAP = Map;
const CAPTURED_MAP_GET = Map.prototype.get;
const CAPTURED_MAP_SET = Map.prototype.set;
const CAPTURED_MAP_VALUES = Map.prototype.values;
const CAPTURED_MAP_SIZE = CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(Map.prototype, 'size')?.get;
const CAPTURED_ITERATOR_NEXT = Object.getPrototypeOf(new Map().values()).next as (
  this: Iterator<unknown>,
) => IteratorResult<unknown>;
const CAPTURED_NUMBER_IS_FINITE = Number.isFinite;
const CAPTURED_NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const CAPTURED_MATH_ABS = Math.abs;
const CAPTURED_MATH_MIN = Math.min;
const CAPTURED_MATH_MAX = Math.max;
const CAPTURED_MATH_HYPOT = Math.hypot;
const CAPTURED_MATH_SQRT = Math.sqrt;
const CAPTURED_MATH_CEIL = Math.ceil;
const CAPTURED_MATH_FLOOR = Math.floor;
const CAPTURED_MATH_LOG2 = Math.log2;
const CAPTURED_STRING_CHAR_CODE_AT = String.prototype.charCodeAt;
const CAPTURED_NUMBER = Number;
const CAPTURED_STRING = String;
const CAPTURED_BIGINT = BigInt;
const CAPTURED_BIGINT_AS_UINT_N = BigInt.asUintN;
const CAPTURED_BIGINT_TO_STRING = BigInt.prototype.toString;
const CAPTURED_ARRAY_BUFFER = ArrayBuffer;
const CAPTURED_DATA_VIEW = DataView;
const CAPTURED_FLOAT32_ARRAY = Float32Array;
const CAPTURED_FLOAT64_ARRAY = Float64Array;
const CAPTURED_UINT8_ARRAY = Uint8Array;
const CAPTURED_UINT32_ARRAY = Uint32Array;
const CAPTURED_DATA_VIEW_SET_FLOAT32 = DataView.prototype.setFloat32;
const CAPTURED_DATA_VIEW_SET_FLOAT64 = DataView.prototype.setFloat64;
const CAPTURED_DATA_VIEW_SET_UINT8 = DataView.prototype.setUint8;
const CAPTURED_DATA_VIEW_SET_UINT32 = DataView.prototype.setUint32;
const CAPTURED_DATA_VIEW_GET_UINT32 = DataView.prototype.getUint32;
const CAPTURED_DATA_VIEW_GET_UINT8 = DataView.prototype.getUint8;
const OBJECT_PROTOTYPE = Object.prototype;
const ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_BUFFER_PROTOTYPE = ArrayBuffer.prototype;
const FLOAT32_ARRAY_PROTOTYPE = Float32Array.prototype;
const UINT32_ARRAY_PROTOTYPE = Uint32Array.prototype;
const TYPED_ARRAY_PROTOTYPE = CAPTURED_OBJECT_GET_PROTOTYPE_OF(Uint8Array.prototype);
const CAPTURED_TYPED_ARRAY_BUFFER = CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
)?.get;
const CAPTURED_TYPED_ARRAY_BYTE_LENGTH = CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
)?.get;
const CAPTURED_TYPED_ARRAY_BYTE_OFFSET = CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  TYPED_ARRAY_PROTOTYPE,
  'byteOffset',
)?.get;
const CAPTURED_TYPED_ARRAY_LENGTH = CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  TYPED_ARRAY_PROTOTYPE,
  'length',
)?.get;
const CAPTURED_ARRAY_BUFFER_BYTE_LENGTH = CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  ARRAY_BUFFER_PROTOTYPE,
  'byteLength',
)?.get;
const CAPTURED_ARRAY_BUFFER_RESIZABLE = CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  ARRAY_BUFFER_PROTOTYPE,
  'resizable',
)?.get;

function apply<T>(fn: (...args: never[]) => unknown, receiver: unknown, args: unknown[]): T {
  return CAPTURED_REFLECT_APPLY(fn, receiver, args) as T;
}

function capturedNumber(value: unknown): number {
  return apply<number>(CAPTURED_NUMBER, undefined, [value]);
}

function capturedString(value: unknown): string {
  return apply<string>(CAPTURED_STRING, undefined, [value]);
}

function typedArrayBuffer(value: ArrayBufferView): ArrayBuffer {
  if (!CAPTURED_TYPED_ARRAY_BUFFER)
    fail('input-invalid', 'Captured typed-array buffer authority is unavailable.');
  const buffer = apply<ArrayBuffer>(CAPTURED_TYPED_ARRAY_BUFFER, value, []);
  if (CAPTURED_OBJECT_GET_PROTOTYPE_OF(buffer) !== ARRAY_BUFFER_PROTOTYPE)
    fail('input-invalid', 'Typed arrays must use one exact non-shared ArrayBuffer.');
  if (
    CAPTURED_ARRAY_BUFFER_RESIZABLE &&
    apply<boolean>(CAPTURED_ARRAY_BUFFER_RESIZABLE, buffer, [])
  )
    fail('input-invalid', 'Resizable ArrayBuffer storage is not accepted.');
  return buffer;
}

function typedArrayLength(value: ArrayBufferView): number {
  if (!CAPTURED_TYPED_ARRAY_LENGTH)
    fail('input-invalid', 'Captured typed-array length authority is unavailable.');
  return apply<number>(CAPTURED_TYPED_ARRAY_LENGTH, value, []);
}

function typedArrayByteLength(value: ArrayBufferView): number {
  if (!CAPTURED_TYPED_ARRAY_BYTE_LENGTH)
    fail('input-invalid', 'Captured typed-array byte-length authority is unavailable.');
  return apply<number>(CAPTURED_TYPED_ARRAY_BYTE_LENGTH, value, []);
}

function typedArrayByteOffset(value: ArrayBufferView): number {
  if (!CAPTURED_TYPED_ARRAY_BYTE_OFFSET)
    fail('input-invalid', 'Captured typed-array byte-offset authority is unavailable.');
  return apply<number>(CAPTURED_TYPED_ARRAY_BYTE_OFFSET, value, []);
}

function arrayBufferByteLength(value: ArrayBuffer): number {
  if (!CAPTURED_ARRAY_BUFFER_BYTE_LENGTH)
    fail('input-invalid', 'Captured ArrayBuffer byte-length authority is unavailable.');
  return apply<number>(CAPTURED_ARRAY_BUFFER_BYTE_LENGTH, value, []);
}

function arrayPush<T>(values: T[], value: T): void {
  CAPTURED_OBJECT_DEFINE_PROPERTY(values, capturedString(values.length), {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

function arraySort<T>(values: T[], compare: (left: T, right: T) => number): T[] {
  return apply(CAPTURED_ARRAY_SORT, values, [compare]);
}

function arrayMap<T, U>(values: readonly T[], callback: (value: T, index: number) => U): U[] {
  const result: U[] = [];
  for (let index = 0; index < values.length; index += 1)
    arrayPush(result, callback(values[index], index));
  return result;
}

function arraySome<T>(
  values: readonly T[],
  callback: (value: T, index: number) => boolean,
): boolean {
  return apply(CAPTURED_ARRAY_SOME, values, [callback]);
}

function arrayIncludes<T>(values: readonly T[], value: T): boolean {
  return apply(CAPTURED_ARRAY_INCLUDES, values, [value]);
}

function arrayJoin(values: readonly unknown[], separator: string): string {
  return apply(CAPTURED_ARRAY_JOIN, values, [separator]);
}

function setHas<T>(set: Set<T>, value: T): boolean {
  return apply(CAPTURED_SET_HAS, set, [value]);
}

function setAdd<T>(set: Set<T>, value: T): void {
  apply(CAPTURED_SET_ADD, set, [value]);
}

function mapGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  return apply(CAPTURED_MAP_GET, map, [key]);
}

function mapSet<K, V>(map: Map<K, V>, key: K, value: V): void {
  apply(CAPTURED_MAP_SET, map, [key, value]);
}

function mapSize<K, V>(map: Map<K, V>): number {
  if (!CAPTURED_MAP_SIZE) fail('input-invalid', 'Captured Map size authority is unavailable.');
  return apply<number>(CAPTURED_MAP_SIZE, map, []);
}

function mapValues<K, V>(map: Map<K, V>): V[] {
  const iterator = apply<Iterator<V>>(CAPTURED_MAP_VALUES, map, []);
  const result: V[] = [];
  while (true) {
    const next = apply<IteratorResult<V>>(CAPTURED_ITERATOR_NEXT, iterator, []);
    if (next.done) return result;
    arrayPush(result, next.value);
  }
}

function copyFloat32(source: Float32Array): Float32Array {
  const length = typedArrayLength(source);
  const result = new CAPTURED_FLOAT32_ARRAY(length);
  for (let index = 0; index < length; index += 1) result[index] = source[index];
  return result;
}

function copyUint32(source: Uint32Array): Uint32Array {
  const length = typedArrayLength(source);
  const result = new CAPTURED_UINT32_ARRAY(length);
  for (let index = 0; index < length; index += 1) result[index] = source[index];
  return result;
}

function copyFloat64(source: Float32Array | Float64Array): Float64Array {
  const length = typedArrayLength(source);
  const result = new CAPTURED_FLOAT64_ARRAY(length);
  for (let index = 0; index < length; index += 1) result[index] = source[index];
  return result;
}

function copyFloat64Into(target: Float64Array, source: Float64Array): void {
  const length = typedArrayLength(source);
  if (typedArrayLength(target) !== length) fail('input-invalid', 'Float64 copy length drifted.');
  for (let index = 0; index < length; index += 1) target[index] = source[index];
}

function toFloat32(source: Float32Array | Float64Array): Float32Array {
  const length = typedArrayLength(source);
  const result = new CAPTURED_FLOAT32_ARRAY(length);
  for (let index = 0; index < length; index += 1) result[index] = source[index];
  return result;
}

export const BETA_SKIRT_PRIMITIVE_CONTACT_RELAXATION_CANDIDATE_V4 =
  'beta-skirt-primitive-contact-relaxation-candidate/4' as const;

export const BETA_SKIRT_EXACT_VALIDATED_SEAM_SNAPSHOT_V1 =
  'beta-skirt-exact-validated-seam-snapshot/1' as const;

export const BETA_SKIRT_PRIMITIVE_CONTACT_RELAXATION_POLICY_V4 = Object.freeze({
  innerIterationCount: 8,
  maximumOuterRoundCount: 4,
  maximumTotalIterationCount: 32,
  edgePassCount: 1,
  triangleRestPassCount: 2,
  displacementSmoothing: 0.28,
  edgeStiffness: 0.42,
  triangleRestStiffness: 0.42,
  seamDisplacementStiffness: 0.65,
  contactStiffness: 1,
  contactOvershootM: 0.00002,
  maximumDisplacementM: 0.12,
  maximumEdgeRelativeError: 0.35,
  minimumTriangleAreaRatio: 0.5,
  maximumTriangleAreaRatio: 1.85,
  maximumOperations: 12_000_000,
  maximumVertexCount: 200_000,
  maximumTriangleCount: 400_000,
  maximumContactCount: 400_000,
  maximumSeamPairCount: 400_000,
  maximumUniqueEdgeCount: 1_200_000,
  maximumExactDistanceTestCount: 32_000_000,
  maximumExactRayTestCount: 96_000_000,
  maximumCoordinateMagnitudeM: 1_000_000,
  barycentricTolerance: 1e-6,
  absoluteEpsilonM: 1e-8,
} as const);

export interface BetaSkirtPrimitiveContactRelaxationPolicyV4 {
  readonly innerIterationCount: number;
  readonly maximumOuterRoundCount: number;
  readonly maximumTotalIterationCount: number;
  readonly edgePassCount: number;
  readonly triangleRestPassCount: number;
  readonly displacementSmoothing: number;
  readonly edgeStiffness: number;
  readonly triangleRestStiffness: number;
  readonly seamDisplacementStiffness: number;
  readonly contactStiffness: number;
  readonly contactOvershootM: number;
  readonly maximumDisplacementM: number;
  readonly maximumEdgeRelativeError: number;
  readonly minimumTriangleAreaRatio: number;
  readonly maximumTriangleAreaRatio: number;
  readonly maximumOperations: number;
  readonly maximumVertexCount: number;
  readonly maximumTriangleCount: number;
  readonly maximumContactCount: number;
  readonly maximumSeamPairCount: number;
  readonly maximumUniqueEdgeCount: number;
  readonly maximumExactDistanceTestCount: number;
  readonly maximumExactRayTestCount: number;
  readonly maximumCoordinateMagnitudeM: number;
  readonly barycentricTolerance: number;
  readonly absoluteEpsilonM: number;
}

/**
 * Structurally matches the accepted extractor witness without importing rendered-body code into
 * this pure solver. A proper triangle pair may contribute more than one witness.
 */
export interface BetaSkirtPrimitiveContactWitnessV4 {
  readonly ordinal: number;
  readonly extractionRound: number;
  readonly kind:
    | 'signed-vertex-nearest'
    | 'garment-edge-body-triangle'
    | 'triangle-intersection-barycentric';
  readonly activeGarmentVertexCount: 1 | 2 | 3;
  readonly bodyTriangleIndex: number;
  readonly bodyVertexIndices: readonly [number, number, number];
  readonly garmentTriangleIndex: number;
  readonly garmentVertexIndices: readonly [number, number, number];
  readonly garmentWeights: readonly [number, number, number];
  readonly bodySurfacePointM: readonly [number, number, number];
  readonly outwardBodyNormal: readonly [number, number, number];
  readonly minimumClearanceM: number;
}

/** Structurally matches the V3 one-vertex contact contract. */
export interface BetaSkirtPrimitiveContactLegacyVertexConstraintV4 {
  readonly vertexIndex: number;
  readonly surfacePointM: readonly [number, number, number];
  readonly outwardNormal: readonly [number, number, number];
  readonly minimumClearanceM: number;
}

export interface BetaSkirtExactValidatedSeamSnapshotV1 {
  readonly version: typeof BETA_SKIRT_EXACT_VALIDATED_SEAM_SNAPSHOT_V1;
  readonly validationStatus: 'exact-validated';
  readonly validationReceiptSha256: string;
  readonly pairs: Uint32Array;
}

export interface BetaSkirtPrimitiveContactAggregateBudgetV4 {
  readonly outerRoundCount: number;
  readonly iterationCount: number;
  readonly operationCount: number;
  /** Raw supplied contact count before exact cross-family deduplication. */
  readonly contactCount: number;
  readonly exactDistanceTestCount: number;
  readonly exactRayTestCount: number;
}

export interface BetaSkirtPrimitiveContactRelaxationInputV4 {
  /** Owned source/rest positions in meters. */
  readonly sourcePositionsM: Float32Array;
  /** Owned immutable triangle index order. */
  readonly sourceTriangles: Uint32Array;
  readonly primitiveWitnesses: readonly BetaSkirtPrimitiveContactWitnessV4[];
  /** Accepted extractor/coordinator receipts used to bind the structural witness digest. */
  readonly sourceGeometrySha256: string;
  readonly intersectionPairSha256: string;
  /** Adapter-owned component hashes, independently recomputed from the exact local source bytes. */
  readonly garmentWorldPositionsSha256: string;
  readonly garmentTrianglesSha256: string;
  readonly solverSourceGeometrySha256: string;
  /** Accepted extractor digest. */
  readonly structuralWitnessSetSha256: string;
  /** Solver-specific digest binding witnesses, extractor receipts and local source components. */
  readonly solverStructuralWitnessSetSha256: string;
  readonly previousStructuralWitnessSetSha256?: string | null;
  readonly legacyVertexContacts?: readonly BetaSkirtPrimitiveContactLegacyVertexConstraintV4[];
  readonly seamSnapshot?: BetaSkirtExactValidatedSeamSnapshotV1;
  readonly pinnedVertexIndices?: Uint32Array;
  readonly aggregateBefore?: BetaSkirtPrimitiveContactAggregateBudgetV4;
  readonly transform?: BetaSkirtCoherentEnvelopeQualityTransformV1;
  readonly radialAxisXZ?: readonly [number, number];
}

export interface BetaSkirtPrimitiveContactRelaxationOptionsV4 {
  readonly policy?: BetaSkirtPrimitiveContactRelaxationPolicyV4;
}

export type BetaSkirtPrimitiveContactRelaxationBlockerV4 =
  | 'primitive-witness-set-empty'
  | 'repeated-structural-witness-set'
  | 'seam-constraints-unbound'
  | 'opposing-contact-constraints'
  | 'outer-round-budget-exhausted'
  | 'iteration-budget-exhausted'
  | 'operation-budget-exhausted'
  | 'exact-distance-test-budget-exhausted'
  | 'exact-ray-test-budget-exhausted'
  | 'residual-contact-constraint'
  | 'maximum-displacement-exceeded'
  | 'edge-relative-error-exceeded'
  | 'triangle-area-ratio-exceeded'
  | 'triangle-normal-reversal'
  | 'triangle-degenerate'
  | 'structural-quality-blocked';

export type BetaSkirtPrimitiveContactRelaxationErrorCodeV4 =
  | 'input-invalid'
  | 'resource-cap-exceeded'
  | 'source-geometry-invalid';

export class BetaSkirtPrimitiveContactRelaxationErrorV4 extends Error {
  constructor(
    readonly code: BetaSkirtPrimitiveContactRelaxationErrorCodeV4,
    message: string,
  ) {
    super(message);
    this.name = 'BetaSkirtPrimitiveContactRelaxationErrorV4';
  }
}

export interface BetaSkirtPrimitiveContactMetricsV4 {
  readonly rawPrimitiveWitnessCount: number;
  readonly rawLegacyVertexContactCount: number;
  readonly rawContactCount: number;
  readonly uniqueConstraintCount: number;
  readonly exactDuplicateConstraintCount: number;
  readonly oneVertexConstraintCount: number;
  readonly twoVertexConstraintCount: number;
  readonly threeVertexConstraintCount: number;
  readonly opposingConstraintGroupCount: number;
  readonly violatingBeforeCount: number;
  readonly violatingAfterCount: number;
  readonly minimumClearanceResidualBeforeM: number;
  readonly minimumClearanceResidualAfterM: number;
  readonly maximumDeficitBeforeM: number;
  readonly maximumDeficitAfterM: number;
  readonly deterministicOrderFingerprintFnv64: string;
}

export interface BetaSkirtPrimitiveRestEdgeMetricsV4 {
  readonly edgeCount: number;
  readonly maximumRelativeLengthError: number;
  readonly rootMeanSquareRelativeLengthError: number;
  readonly maximumAbsoluteLengthErrorM: number;
  readonly rootMeanSquareAbsoluteLengthErrorM: number;
}

export interface BetaSkirtPrimitiveTriangleRestMetricsV4 {
  readonly triangleCount: number;
  readonly minimumAreaRatio: number;
  readonly maximumAreaRatio: number;
  readonly normalReversalCount: number;
  readonly degenerateTriangleCount: number;
  readonly orientationGuardRollbackCount: number;
}

export interface BetaSkirtPrimitiveSeamMetricsV4 {
  readonly pairCount: number;
  readonly maximumDisplacementMismatchM: number;
  readonly rootMeanSquareDisplacementMismatchM: number;
  readonly exactValidatedSnapshotBound: boolean;
}

export interface BetaSkirtPrimitiveContactRelaxationCandidateV4 {
  readonly version: typeof BETA_SKIRT_PRIMITIVE_CONTACT_RELAXATION_CANDIDATE_V4;
  readonly status: 'candidate-ready-for-exact-reevaluation' | 'candidate-blocked';
  readonly positionsM: Float32Array;
  readonly triangles: Uint32Array;
  readonly policy: BetaSkirtPrimitiveContactRelaxationPolicyV4;
  readonly quality: BetaSkirtCoherentEnvelopeQualityReportV1;
  readonly contact: BetaSkirtPrimitiveContactMetricsV4;
  readonly restEdge: BetaSkirtPrimitiveRestEdgeMetricsV4;
  readonly triangleRest: BetaSkirtPrimitiveTriangleRestMetricsV4;
  readonly seam: BetaSkirtPrimitiveSeamMetricsV4;
  readonly aggregateBefore: BetaSkirtPrimitiveContactAggregateBudgetV4;
  readonly aggregateAfter: BetaSkirtPrimitiveContactAggregateBudgetV4;
  readonly metrics: Readonly<{
    roundIterationCount: number;
    roundOperationCount: number;
    mandatoryPreflightReservedOperationCount: number;
    authorityOperationCount: number;
    graphOperationCount: number;
    canonicalizationOperationCount: number;
    solverOperationCount: number;
    finalizationOperationCount: number;
    uniqueEdgeCount: number;
    displacementClampCount: number;
    maximumWorldDisplacementM: number;
    topologyIndicesPreserved: true;
    vertexOrderPreserved: true;
    deterministicConstraintOrderUsed: true;
    triangleRestPassCountPerIteration: 2;
  }>;
  readonly audit: Readonly<{
    garmentWorldPositionsSha256: string;
    garmentTrianglesSha256: string;
    solverSourceGeometrySha256: string;
    structuralWitnessSetSha256: string;
    solverStructuralWitnessSetSha256: string;
    previousStructuralWitnessSetSha256: string | null;
    sourceGeometryFingerprintFnv64: string;
    candidateFingerprintFnv64: string;
    hashAuthority: 'diagnostic-fnv1a64-not-cryptographic-authority';
  }>;
  readonly rollback: Readonly<{
    required: true;
    reason: 'external-exact-reevaluation-required';
    sourcePositionsM: Float32Array;
    displayMutationCommitted: false;
  }>;
  readonly blockers: readonly BetaSkirtPrimitiveContactRelaxationBlockerV4[];
  readonly requiredNextGate: 'external-exact-body-garment-and-self-collision-reevaluation';
  readonly claims: Readonly<{
    exactOwnedSnapshotsUsed: true;
    moduleInitAuthorityIntrinsicsTrusted: true;
    preloadAuthorityIntrinsicIntegrityVerified: false;
    generalizedOneTwoThreeVertexProjectionUsed: true;
    legacyV3SeedUsed: false;
    barycentricSquaredWeightDistributionUsed: true;
    perTriangleRestShapeProjectionUsed: true;
    deterministicConstraintOrderingUsed: true;
    exactValidatedSeamSnapshotSupplied: boolean;
    assemblySeamConstraintsBound: boolean;
    seamPreservationClaimed: false;
    exactRenderedBodyCollisionMeasured: false;
    collisionClearClaimed: false;
    externalExactReevaluationRequired: true;
    topologyAndIndexOrderPreserved: true;
    distortionThresholdsEnforced: true;
    publicationRollbackRequired: true;
    displayMutationCommitted: false;
    initializationAdmitted: false;
    fitClaimed: false;
    runtimeAuthorityClaimed: false;
    productionAuthorityClaimed: false;
  }>;
}

type Vec3 = readonly [number, number, number];

interface ContactConstraint {
  readonly family: 'primitive-v4' | 'legacy-v3';
  readonly support: readonly SupportEntry[];
  readonly supportKey: string;
  readonly surfacePointM: Vec3;
  readonly outwardNormal: Vec3;
  readonly minimumClearanceM: number;
  readonly key: string;
}

interface SupportEntry {
  readonly vertexIndex: number;
  readonly weight: number;
}

interface Edge {
  readonly a: number;
  readonly b: number;
  readonly restLength: number;
}

interface RestTriangle {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly ab: number;
  readonly bc: number;
  readonly ca: number;
  readonly restCross: Vec3;
  readonly restDoubleArea: number;
}

interface OwnedInput {
  readonly positions: Float32Array;
  readonly triangles: Uint32Array;
  readonly primitiveWitnesses: readonly BetaSkirtPrimitiveContactWitnessV4[];
  readonly legacyVertexContacts: readonly BetaSkirtPrimitiveContactLegacyVertexConstraintV4[];
  readonly sourceGeometrySha256: string;
  readonly intersectionPairSha256: string;
  readonly garmentWorldPositionsSha256: string;
  readonly garmentTrianglesSha256: string;
  readonly solverSourceGeometrySha256: string;
  readonly structuralWitnessSetSha256: string;
  readonly solverStructuralWitnessSetSha256: string;
  readonly previousStructuralWitnessSetSha256: string | null;
  readonly seamPairs: Uint32Array;
  readonly exactSeamSnapshotBound: boolean;
  readonly pinned: Uint8Array;
  readonly aggregateBefore: BetaSkirtPrimitiveContactAggregateBudgetV4;
  readonly mandatoryPreflightReservedOperationCount: number;
  readonly transform?: BetaSkirtCoherentEnvelopeQualityTransformV1;
  readonly radialAxisXZ?: readonly [number, number];
}

const POLICY_KEYS = Object.freeze([
  'innerIterationCount',
  'maximumOuterRoundCount',
  'maximumTotalIterationCount',
  'edgePassCount',
  'triangleRestPassCount',
  'displacementSmoothing',
  'edgeStiffness',
  'triangleRestStiffness',
  'seamDisplacementStiffness',
  'contactStiffness',
  'contactOvershootM',
  'maximumDisplacementM',
  'maximumEdgeRelativeError',
  'minimumTriangleAreaRatio',
  'maximumTriangleAreaRatio',
  'maximumOperations',
  'maximumVertexCount',
  'maximumTriangleCount',
  'maximumContactCount',
  'maximumSeamPairCount',
  'maximumUniqueEdgeCount',
  'maximumExactDistanceTestCount',
  'maximumExactRayTestCount',
  'maximumCoordinateMagnitudeM',
  'barycentricTolerance',
  'absoluteEpsilonM',
] as const);

const ZERO_AGGREGATE: BetaSkirtPrimitiveContactAggregateBudgetV4 = Object.freeze({
  outerRoundCount: 0,
  iterationCount: 0,
  operationCount: 0,
  contactCount: 0,
  exactDistanceTestCount: 0,
  exactRayTestCount: 0,
});

function fail(code: BetaSkirtPrimitiveContactRelaxationErrorCodeV4, message: string): never {
  throw new BetaSkirtPrimitiveContactRelaxationErrorV4(code, message);
}

function exactPlainRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object')
    fail('input-invalid', `${label} must be a plain object.`);
  let prototype: object | null;
  let descriptors: Record<string, PropertyDescriptor>;
  let symbols: symbol[];
  try {
    prototype = CAPTURED_OBJECT_GET_PROTOTYPE_OF(value);
    descriptors = CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTORS(value);
    symbols = CAPTURED_OBJECT_GET_OWN_PROPERTY_SYMBOLS(value);
  } catch {
    fail('input-invalid', `${label} could not be inspected exactly.`);
  }
  if (prototype !== OBJECT_PROTOTYPE && prototype !== null)
    fail('input-invalid', `${label} must have a plain prototype.`);
  if (symbols.length !== 0) fail('input-invalid', `${label} must not have symbol keys.`);
  const allowed = new CAPTURED_SET<string>();
  for (let index = 0; index < requiredKeys.length; index += 1) setAdd(allowed, requiredKeys[index]);
  for (let index = 0; index < optionalKeys.length; index += 1) setAdd(allowed, optionalKeys[index]);
  const keys = CAPTURED_OBJECT_KEYS(descriptors);
  if (arraySome(keys, (key) => !setHas(allowed, key)))
    fail('input-invalid', `${label} has an extra key.`);
  if (
    arraySome(requiredKeys, (key) => !apply<boolean>(CAPTURED_HAS_OWN_PROPERTY, descriptors, [key]))
  )
    fail('input-invalid', `${label} is missing a required key.`);
  const result: Record<string, unknown> = CAPTURED_OBJECT_CREATE(null) as Record<string, unknown>;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (!descriptor || !apply<boolean>(CAPTURED_HAS_OWN_PROPERTY, descriptor, ['value']))
      fail('input-invalid', `${label}.${key} must be a data property.`);
    result[key] = descriptor.value;
  }
  return CAPTURED_OBJECT_FREEZE(result);
}

function exactArrayLengthWithin(value: unknown, label: string, maximum: number): number {
  if (
    !CAPTURED_ARRAY_IS_ARRAY(value) ||
    CAPTURED_OBJECT_GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE
  )
    fail('input-invalid', `${label} must be one exact array.`);
  const descriptor = CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'length');
  if (
    !descriptor ||
    !apply<boolean>(CAPTURED_HAS_OWN_PROPERTY, descriptor, ['value']) ||
    typeof descriptor.value !== 'number' ||
    !CAPTURED_NUMBER_IS_SAFE_INTEGER(descriptor.value) ||
    descriptor.value < 0
  )
    fail('input-invalid', `${label}.length is invalid.`);
  if (descriptor.value > maximum)
    fail('resource-cap-exceeded', `${label} exceeds its bounded count before inspection.`);
  return descriptor.value;
}

function exactDenseArray(
  value: unknown,
  label: string,
  maximumLength: number,
  expectedLength?: number,
): readonly unknown[] {
  if (
    !CAPTURED_ARRAY_IS_ARRAY(value) ||
    CAPTURED_OBJECT_GET_PROTOTYPE_OF(value) !== ARRAY_PROTOTYPE
  )
    fail('input-invalid', `${label} must be one exact array.`);
  const descriptors = CAPTURED_OBJECT_GET_OWN_PROPERTY_DESCRIPTORS(value);
  if (CAPTURED_OBJECT_GET_OWN_PROPERTY_SYMBOLS(descriptors).length !== 0)
    fail('input-invalid', `${label} must not have symbol keys.`);
  const lengthDescriptor = (descriptors as Record<string, PropertyDescriptor>).length;
  if (
    !lengthDescriptor ||
    !apply<boolean>(CAPTURED_HAS_OWN_PROPERTY, lengthDescriptor, ['value']) ||
    typeof lengthDescriptor.value !== 'number' ||
    !CAPTURED_NUMBER_IS_SAFE_INTEGER(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  )
    fail('input-invalid', `${label}.length is invalid.`);
  const length = lengthDescriptor.value;
  if (length > maximumLength)
    fail('resource-cap-exceeded', `${label} exceeds its bounded count before inspection.`);
  if (expectedLength !== undefined && length !== expectedLength)
    fail('input-invalid', `${label}.length drifted after its bounded preflight.`);
  const expected = new CAPTURED_SET<string>();
  setAdd(expected, 'length');
  for (let index = 0; index < length; index += 1) setAdd(expected, capturedString(index));
  const keys = CAPTURED_OBJECT_KEYS(descriptors);
  if (keys.length !== length + 1 || arraySome(keys, (key) => !setHas(expected, key)))
    fail('input-invalid', `${label} must be dense and undecorated.`);
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[capturedString(index)];
    if (!descriptor || !apply<boolean>(CAPTURED_HAS_OWN_PROPERTY, descriptor, ['value']))
      fail('input-invalid', `${label}[${index}] must be a data property.`);
    arrayPush(result, descriptor.value);
  }
  return result;
}

function exactDenseNumberTuple(value: unknown, length: number, label: string): readonly number[] {
  const values = exactDenseArray(value, label, length, length);
  return CAPTURED_OBJECT_FREEZE(
    arrayMap(values, (item, index) => {
      if (typeof item !== 'number' || !CAPTURED_NUMBER_IS_FINITE(item))
        fail('input-invalid', `${label}[${index}] must be finite.`);
      return item;
    }),
  );
}

function exactTypedArray<T extends Float32Array | Uint32Array>(
  value: unknown,
  constructor: Float32ArrayConstructor | Uint32ArrayConstructor,
  prototype: object,
  label: string,
  maximumLength: number,
): T {
  if (!(value instanceof constructor) || CAPTURED_OBJECT_GET_PROTOTYPE_OF(value) !== prototype)
    fail('input-invalid', `${label} must be one exact typed array.`);
  const length = typedArrayLength(value);
  if (length > maximumLength)
    fail('resource-cap-exceeded', `${label} exceeds its bounded length before inspection.`);
  const buffer = typedArrayBuffer(value);
  if (
    typedArrayByteOffset(value) !== 0 ||
    typedArrayByteLength(value) !== arrayBufferByteLength(buffer)
  )
    fail('input-invalid', `${label} must own its complete buffer.`);
  const names = CAPTURED_OBJECT_GET_OWN_PROPERTY_NAMES(value);
  for (let nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
    const key = names[nameIndex];
    const index = capturedNumber(key);
    if (
      !CAPTURED_NUMBER_IS_SAFE_INTEGER(index) ||
      index < 0 ||
      index >= length ||
      capturedString(index) !== key
    )
      fail('input-invalid', `${label} must not have decorated properties.`);
  }
  if (CAPTURED_OBJECT_GET_OWN_PROPERTY_SYMBOLS(value).length !== 0)
    fail('input-invalid', `${label} must not have symbol properties.`);
  return value as T;
}

function shallowTypedArrayMetadata(
  value: unknown,
  prototype: object,
  bytesPerElement: number,
  label: string,
  maximumLength: number,
): Readonly<{ length: number; buffer: ArrayBuffer }> {
  if (!value || typeof value !== 'object' || CAPTURED_OBJECT_GET_PROTOTYPE_OF(value) !== prototype)
    fail('input-invalid', `${label} must be one exact typed array.`);
  const typed = value as ArrayBufferView;
  const length = typedArrayLength(typed);
  if (!CAPTURED_NUMBER_IS_SAFE_INTEGER(length) || length < 0 || length > maximumLength)
    fail('resource-cap-exceeded', `${label} exceeds its bounded length before inspection.`);
  const buffer = typedArrayBuffer(typed);
  const byteLength = typedArrayByteLength(typed);
  if (
    typedArrayByteOffset(typed) !== 0 ||
    byteLength !== length * bytesPerElement ||
    byteLength !== arrayBufferByteLength(buffer)
  )
    fail('input-invalid', `${label} must own its complete buffer.`);
  return CAPTURED_OBJECT_FREEZE({ length, buffer });
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !CAPTURED_NUMBER_IS_SAFE_INTEGER(value) ||
    value < minimum ||
    value > maximum
  )
    fail('input-invalid', `${label} must be an integer in [${minimum}, ${maximum}].`);
  return value;
}

function finiteRange(value: unknown, label: string, minimum: number, maximum: number): number {
  if (
    typeof value !== 'number' ||
    !CAPTURED_NUMBER_IS_FINITE(value) ||
    value < minimum ||
    value > maximum
  )
    fail('input-invalid', `${label} must be finite in [${minimum}, ${maximum}].`);
  return CAPTURED_OBJECT_IS(value, -0) ? 0 : value;
}

function finiteRangeWithoutNegativeZero(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (CAPTURED_OBJECT_IS(value, -0)) fail('input-invalid', `${label} must not be negative zero.`);
  return finiteRange(value, label, minimum, maximum);
}

function validatedSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length !== 64)
    fail('input-invalid', `${label} must be one lowercase SHA-256 digest.`);
  for (let index = 0; index < 64; index += 1) {
    const code = apply<number>(CAPTURED_STRING_CHAR_CODE_AT, value, [index]);
    if (!((code >= 0x30 && code <= 0x39) || (code >= 0x61 && code <= 0x66)))
      fail('input-invalid', `${label} must be one lowercase SHA-256 digest.`);
  }
  return value;
}

const SHA256_INITIAL = CAPTURED_OBJECT_FREEZE([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
const SHA256_ROUND = CAPTURED_OBJECT_FREEZE([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const HEX = '0123456789abcdef';

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

function sha256Hex(bytes: Uint8Array): string {
  const byteLength = typedArrayLength(bytes);
  const paddedLength = CAPTURED_MATH_CEIL((byteLength + 9) / 64) * 64;
  const padded = new CAPTURED_UINT8_ARRAY(paddedLength);
  for (let index = 0; index < byteLength; index += 1) padded[index] = bytes[index];
  padded[byteLength] = 0x80;
  const bitLength = byteLength * 8;
  const high = CAPTURED_MATH_FLOOR(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  for (let byte = 0; byte < 4; byte += 1) {
    padded[paddedLength - 8 + byte] = (high >>> (24 - byte * 8)) & 0xff;
    padded[paddedLength - 4 + byte] = (low >>> (24 - byte * 8)) & 0xff;
  }
  const state = new CAPTURED_UINT32_ARRAY(8);
  for (let index = 0; index < 8; index += 1) state[index] = SHA256_INITIAL[index];
  const words = new CAPTURED_UINT32_ARRAY(64);
  for (let block = 0; block < paddedLength; block += 64) {
    for (let index = 0; index < 16; index += 1) {
      const offset = block + index * 4;
      words[index] =
        ((padded[offset] << 24) |
          (padded[offset + 1] << 16) |
          (padded[offset + 2] << 8) |
          padded[offset + 3]) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15];
      const right = words[index - 2];
      const s0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const s1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let a = state[0];
    let b = state[1];
    let c = state[2];
    let d = state[3];
    let e = state[4];
    let f = state[5];
    let g = state[6];
    let h = state[7];
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + s1 + choice + SHA256_ROUND[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  let result = '';
  for (let index = 0; index < 8; index += 1) {
    const word = state[index];
    for (let shift = 28; shift >= 0; shift -= 4) result += HEX[(word >>> shift) & 15];
  }
  return result;
}

function asciiBytes(value: string): Uint8Array {
  const result = new CAPTURED_UINT8_ARRAY(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = apply<number>(CAPTURED_STRING_CHAR_CODE_AT, value, [index]);
    if (code > 0x7f) fail('input-invalid', 'Authority digest domain must be ASCII.');
    result[index] = code;
  }
  return result;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (let index = 0; index < parts.length; index += 1) length += typedArrayLength(parts[index]);
  const result = new CAPTURED_UINT8_ARRAY(length);
  let offset = 0;
  for (let part = 0; part < parts.length; part += 1) {
    const partLength = typedArrayLength(parts[part]);
    for (let index = 0; index < partLength; index += 1) result[offset + index] = parts[part][index];
    offset += partLength;
  }
  return result;
}

function dataBytes(length: number, writer: (view: DataView) => void): Uint8Array {
  const result = new CAPTURED_UINT8_ARRAY(length);
  writer(new CAPTURED_DATA_VIEW(typedArrayBuffer(result)));
  return result;
}

function setUint32Le(view: DataView, offset: number, value: number): void {
  apply(CAPTURED_DATA_VIEW_SET_UINT32, view, [offset, value, true]);
}

function setUint8(view: DataView, offset: number, value: number): void {
  apply(CAPTURED_DATA_VIEW_SET_UINT8, view, [offset, value]);
}

function setFloat32Le(view: DataView, offset: number, value: number): void {
  apply(CAPTURED_DATA_VIEW_SET_FLOAT32, view, [offset, value, true]);
}

function setFloat64Le(view: DataView, offset: number, value: number): void {
  apply(CAPTURED_DATA_VIEW_SET_FLOAT64, view, [offset, value, true]);
}

export function computeBetaSkirtExactValidatedSeamReceiptSha256V1(
  sourcePositionsM: Float32Array,
  sourceTriangles: Uint32Array,
  pairs: Uint32Array,
): string {
  const canonical: Array<readonly [number, number]> = [];
  const pairLength = typedArrayLength(pairs);
  const positionLength = typedArrayLength(sourcePositionsM);
  const triangleLength = typedArrayLength(sourceTriangles);
  for (let offset = 0; offset < pairLength; offset += 2) {
    const a = pairs[offset];
    const b = pairs[offset + 1];
    arrayPush(canonical, a < b ? [a, b] : [b, a]);
  }
  arraySort(canonical, (left, right) => left[0] - right[0] || left[1] - right[1]);
  const header = dataBytes(12, (view) => {
    setUint32Le(view, 0, positionLength);
    setUint32Le(view, 4, triangleLength);
    setUint32Le(view, 8, canonical.length);
  });
  const positions = dataBytes(positionLength * 4, (view) => {
    for (let index = 0; index < positionLength; index += 1)
      setFloat32Le(view, index * 4, sourcePositionsM[index]);
  });
  const triangles = dataBytes(triangleLength * 4, (view) => {
    for (let index = 0; index < triangleLength; index += 1)
      setUint32Le(view, index * 4, sourceTriangles[index]);
  });
  const seamBytes = dataBytes(canonical.length * 8, (view) => {
    for (let index = 0; index < canonical.length; index += 1) {
      setUint32Le(view, index * 8, canonical[index][0]);
      setUint32Le(view, index * 8 + 4, canonical[index][1]);
    }
  });
  return sha256Hex(
    concatBytes([
      asciiBytes('beta-skirt-exact-validated-seam-snapshot/1\0'),
      header,
      positions,
      triangles,
      seamBytes,
    ]),
  );
}

function float32ComponentBytes(values: Float32Array): Uint8Array {
  const length = typedArrayLength(values);
  return dataBytes(4 + length * 4, (view) => {
    setUint32Le(view, 0, length);
    for (let index = 0; index < length; index += 1)
      setFloat32Le(view, 4 + index * 4, values[index]);
  });
}

function uint32ComponentBytes(values: Uint32Array): Uint8Array {
  const length = typedArrayLength(values);
  return dataBytes(4 + length * 4, (view) => {
    setUint32Le(view, 0, length);
    for (let index = 0; index < length; index += 1) setUint32Le(view, 4 + index * 4, values[index]);
  });
}

/** Synchronous verifier for the shared adapter/solver source-geometry hash contract. */
export function computeBetaSkirtV4SolverSourceGeometryHashesV4(
  garmentWorldPositionsM: Float32Array,
  garmentTriangles: Uint32Array,
): BetaSkirtV4SolverSourceHashes {
  const positionBytes = float32ComponentBytes(garmentWorldPositionsM);
  const triangleBytes = uint32ComponentBytes(garmentTriangles);
  return CAPTURED_OBJECT_FREEZE({
    garmentWorldPositionsSha256: sha256Hex(
      concatBytes([
        asciiBytes(BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.worldPositions),
        positionBytes,
      ]),
    ),
    garmentTrianglesSha256: sha256Hex(
      concatBytes([asciiBytes(BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.triangles), triangleBytes]),
    ),
    solverSourceGeometrySha256: sha256Hex(
      concatBytes([
        asciiBytes(BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.geometry),
        positionBytes,
        triangleBytes,
      ]),
    ),
  });
}

export function computeBetaSkirtPrimitiveStructuralWitnessSetSha256V4(
  sourceGeometrySha256: string,
  intersectionPairSha256: string,
  witnesses: readonly BetaSkirtPrimitiveContactWitnessV4[],
): string {
  const ordered: BetaSkirtPrimitiveContactWitnessV4[] = [];
  for (let index = 0; index < witnesses.length; index += 1) arrayPush(ordered, witnesses[index]);
  arraySort(ordered, (left, right) => left.ordinal - right.ordinal);
  const bytes = dataBytes(4 + ordered.length * 118, (view) => {
    setUint32Le(view, 0, ordered.length);
    let offset = 4;
    for (let index = 0; index < ordered.length; index += 1) {
      const witness = ordered[index];
      const uints = [
        witness.ordinal,
        witness.bodyTriangleIndex,
        witness.bodyVertexIndices[0],
        witness.bodyVertexIndices[1],
        witness.bodyVertexIndices[2],
        witness.garmentTriangleIndex,
        witness.garmentVertexIndices[0],
        witness.garmentVertexIndices[1],
        witness.garmentVertexIndices[2],
      ];
      for (let item = 0; item < uints.length; item += 1) {
        setUint32Le(view, offset, uints[item]);
        offset += 4;
      }
      const floats = [
        witness.garmentWeights[0],
        witness.garmentWeights[1],
        witness.garmentWeights[2],
        witness.bodySurfacePointM[0],
        witness.bodySurfacePointM[1],
        witness.bodySurfacePointM[2],
        witness.outwardBodyNormal[0],
        witness.outwardBodyNormal[1],
        witness.outwardBodyNormal[2],
        witness.minimumClearanceM,
      ];
      for (let item = 0; item < floats.length; item += 1) {
        setFloat64Le(view, offset, floats[item]);
        offset += 8;
      }
      const kind =
        witness.kind === 'signed-vertex-nearest'
          ? 1
          : witness.kind === 'garment-edge-body-triangle'
            ? 2
            : 3;
      setUint8(view, offset, kind);
      setUint8(view, offset + 1, witness.activeGarmentVertexCount);
      offset += 2;
    }
  });
  return sha256Hex(
    concatBytes([
      asciiBytes('beta-skirt-primitive-witness-structural-set/4\0'),
      asciiBytes(`${sourceGeometrySha256}\0${intersectionPairSha256}\0`),
      bytes,
    ]),
  );
}

export function computeBetaSkirtPrimitiveSolverStructuralWitnessSetSha256V4(
  sourceGeometrySha256: string,
  intersectionPairSha256: string,
  garmentWorldPositionsSha256: string,
  garmentTrianglesSha256: string,
  solverSourceGeometrySha256: string,
  extractorStructuralWitnessSetSha256: string,
): string {
  return sha256Hex(
    concatBytes([
      asciiBytes('beta-skirt-primitive-solver-structural-set/4\0'),
      asciiBytes(
        `${sourceGeometrySha256}\0${intersectionPairSha256}\0${garmentWorldPositionsSha256}\0${garmentTrianglesSha256}\0${solverSourceGeometrySha256}\0${extractorStructuralWitnessSetSha256}\0`,
      ),
    ]),
  );
}

function snapshotPolicy(
  value: BetaSkirtPrimitiveContactRelaxationPolicyV4 | undefined,
): BetaSkirtPrimitiveContactRelaxationPolicyV4 {
  const hard = BETA_SKIRT_PRIMITIVE_CONTACT_RELAXATION_POLICY_V4;
  const record = exactPlainRecord(value ?? hard, POLICY_KEYS, [], 'policy');
  const result: BetaSkirtPrimitiveContactRelaxationPolicyV4 = {
    innerIterationCount: integer(record.innerIterationCount, 'innerIterationCount', 1, 8),
    maximumOuterRoundCount: integer(
      record.maximumOuterRoundCount,
      'maximumOuterRoundCount',
      1,
      hard.maximumOuterRoundCount,
    ),
    maximumTotalIterationCount: integer(
      record.maximumTotalIterationCount,
      'maximumTotalIterationCount',
      1,
      hard.maximumTotalIterationCount,
    ),
    edgePassCount: integer(record.edgePassCount, 'edgePassCount', 1, 2),
    triangleRestPassCount: integer(record.triangleRestPassCount, 'triangleRestPassCount', 2, 2),
    displacementSmoothing: finiteRange(record.displacementSmoothing, 'displacementSmoothing', 0, 1),
    edgeStiffness: finiteRange(record.edgeStiffness, 'edgeStiffness', 0, 1),
    triangleRestStiffness: finiteRange(record.triangleRestStiffness, 'triangleRestStiffness', 0, 1),
    seamDisplacementStiffness: finiteRange(
      record.seamDisplacementStiffness,
      'seamDisplacementStiffness',
      0,
      1,
    ),
    contactStiffness: finiteRange(record.contactStiffness, 'contactStiffness', 0, 1),
    contactOvershootM: finiteRange(
      record.contactOvershootM,
      'contactOvershootM',
      0,
      hard.maximumDisplacementM,
    ),
    maximumDisplacementM: finiteRange(
      record.maximumDisplacementM,
      'maximumDisplacementM',
      hard.absoluteEpsilonM,
      hard.maximumDisplacementM,
    ),
    maximumEdgeRelativeError: finiteRange(
      record.maximumEdgeRelativeError,
      'maximumEdgeRelativeError',
      0,
      hard.maximumEdgeRelativeError,
    ),
    minimumTriangleAreaRatio: finiteRange(
      record.minimumTriangleAreaRatio,
      'minimumTriangleAreaRatio',
      hard.minimumTriangleAreaRatio,
      1,
    ),
    maximumTriangleAreaRatio: finiteRange(
      record.maximumTriangleAreaRatio,
      'maximumTriangleAreaRatio',
      1,
      hard.maximumTriangleAreaRatio,
    ),
    maximumOperations: integer(
      record.maximumOperations,
      'maximumOperations',
      1,
      hard.maximumOperations,
    ),
    maximumVertexCount: integer(
      record.maximumVertexCount,
      'maximumVertexCount',
      3,
      hard.maximumVertexCount,
    ),
    maximumTriangleCount: integer(
      record.maximumTriangleCount,
      'maximumTriangleCount',
      1,
      hard.maximumTriangleCount,
    ),
    maximumContactCount: integer(
      record.maximumContactCount,
      'maximumContactCount',
      1,
      hard.maximumContactCount,
    ),
    maximumSeamPairCount: integer(
      record.maximumSeamPairCount,
      'maximumSeamPairCount',
      1,
      hard.maximumSeamPairCount,
    ),
    maximumUniqueEdgeCount: integer(
      record.maximumUniqueEdgeCount,
      'maximumUniqueEdgeCount',
      3,
      hard.maximumUniqueEdgeCount,
    ),
    maximumExactDistanceTestCount: integer(
      record.maximumExactDistanceTestCount,
      'maximumExactDistanceTestCount',
      1,
      hard.maximumExactDistanceTestCount,
    ),
    maximumExactRayTestCount: integer(
      record.maximumExactRayTestCount,
      'maximumExactRayTestCount',
      1,
      hard.maximumExactRayTestCount,
    ),
    maximumCoordinateMagnitudeM: finiteRange(
      record.maximumCoordinateMagnitudeM,
      'maximumCoordinateMagnitudeM',
      1,
      hard.maximumCoordinateMagnitudeM,
    ),
    barycentricTolerance: finiteRange(
      record.barycentricTolerance,
      'barycentricTolerance',
      hard.absoluteEpsilonM,
      hard.barycentricTolerance,
    ),
    absoluteEpsilonM: finiteRange(
      record.absoluteEpsilonM,
      'absoluteEpsilonM',
      hard.absoluteEpsilonM,
      hard.absoluteEpsilonM,
    ),
  };
  if (result.innerIterationCount > result.maximumTotalIterationCount)
    fail('input-invalid', 'innerIterationCount exceeds maximumTotalIterationCount.');
  return CAPTURED_OBJECT_FREEZE(result);
}

function snapshotAggregate(
  value: unknown,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
): BetaSkirtPrimitiveContactAggregateBudgetV4 {
  const record = exactPlainRecord(
    value ?? ZERO_AGGREGATE,
    [
      'outerRoundCount',
      'iterationCount',
      'operationCount',
      'contactCount',
      'exactDistanceTestCount',
      'exactRayTestCount',
    ],
    [],
    'aggregateBefore',
  );
  const result = CAPTURED_OBJECT_FREEZE({
    outerRoundCount: integer(
      record.outerRoundCount,
      'aggregateBefore.outerRoundCount',
      0,
      policy.maximumOuterRoundCount,
    ),
    iterationCount: integer(
      record.iterationCount,
      'aggregateBefore.iterationCount',
      0,
      policy.maximumTotalIterationCount,
    ),
    operationCount: integer(
      record.operationCount,
      'aggregateBefore.operationCount',
      0,
      policy.maximumOperations,
    ),
    contactCount: integer(
      record.contactCount,
      'aggregateBefore.contactCount',
      0,
      policy.maximumContactCount,
    ),
    exactDistanceTestCount: integer(
      record.exactDistanceTestCount,
      'aggregateBefore.exactDistanceTestCount',
      0,
      policy.maximumExactDistanceTestCount,
    ),
    exactRayTestCount: integer(
      record.exactRayTestCount,
      'aggregateBefore.exactRayTestCount',
      0,
      policy.maximumExactRayTestCount,
    ),
  });
  if (result.iterationCount > result.outerRoundCount * policy.innerIterationCount)
    fail('input-invalid', 'aggregateBefore iteration count exceeds completed round capacity.');
  return result;
}

function snapshotOptionalTransform(
  value: unknown,
): BetaSkirtCoherentEnvelopeQualityTransformV1 | undefined {
  if (value === undefined) return undefined;
  const record = exactPlainRecord(value, ['uniformScale', 'translationM'], [], 'transform');
  const uniformScale = finiteRange(record.uniformScale, 'transform.uniformScale', 1e-12, 1e6);
  const translation = exactDenseNumberTuple(record.translationM, 3, 'transform.translationM');
  return CAPTURED_OBJECT_FREEZE({
    uniformScale,
    translationM: translation as Vec3,
  });
}

function snapshotOptionalRadialAxis(value: unknown): readonly [number, number] | undefined {
  if (value === undefined) return undefined;
  return exactDenseNumberTuple(value, 2, 'radialAxisXZ') as readonly [number, number];
}

interface SeamSnapshotPreflight {
  readonly record: Readonly<Record<string, unknown>> | null;
  readonly pairElementCount: number;
  readonly callerBuffer: ArrayBuffer | null;
}

function snapshotSeams(
  preflight: SeamSnapshotPreflight,
  sourcePositions: Float32Array,
  sourceTriangles: Uint32Array,
  vertexCount: number,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
): Readonly<{ pairs: Uint32Array; exactBound: boolean; callerBuffer: ArrayBuffer | null }> {
  if (preflight.record === null)
    return CAPTURED_OBJECT_FREEZE({
      pairs: new CAPTURED_UINT32_ARRAY(),
      exactBound: false,
      callerBuffer: null,
    });
  const record = preflight.record;
  if (record.version !== BETA_SKIRT_EXACT_VALIDATED_SEAM_SNAPSHOT_V1)
    fail('input-invalid', 'seamSnapshot.version is unsupported.');
  if (record.validationStatus !== 'exact-validated')
    fail('input-invalid', 'seamSnapshot.validationStatus is not exact-validated.');
  const suppliedReceipt = validatedSha256(
    record.validationReceiptSha256,
    'seamSnapshot.validationReceiptSha256',
  );
  const sourcePairs = exactTypedArray<Uint32Array>(
    record.pairs,
    CAPTURED_UINT32_ARRAY,
    UINT32_ARRAY_PROTOTYPE,
    'seamSnapshot.pairs',
    policy.maximumSeamPairCount * 2,
  );
  const sourcePairLength = typedArrayLength(sourcePairs);
  if (sourcePairLength !== preflight.pairElementCount)
    fail('input-invalid', 'seamSnapshot.pairs length drifted after its bounded preflight.');
  if (sourcePairLength % 2 !== 0)
    fail('resource-cap-exceeded', 'seamSnapshot.pairs exceeds its bounded pair count.');
  const canonical: Array<readonly [number, number]> = [];
  const seen = new CAPTURED_SET<string>();
  for (let offset = 0; offset < sourcePairLength; offset += 2) {
    const a = sourcePairs[offset];
    const b = sourcePairs[offset + 1];
    if (a >= vertexCount || b >= vertexCount || a === b)
      fail('input-invalid', `seamSnapshot pair ${offset / 2} is invalid.`);
    const low = a < b ? a : b;
    const high = a < b ? b : a;
    const key = `${low}:${high}`;
    if (setHas(seen, key)) fail('input-invalid', `seamSnapshot pair ${offset / 2} is duplicated.`);
    setAdd(seen, key);
    arrayPush(canonical, CAPTURED_OBJECT_FREEZE([low, high]) as readonly [number, number]);
  }
  arraySort(canonical, (left, right) => left[0] - right[0] || left[1] - right[1]);
  const pairs = new CAPTURED_UINT32_ARRAY(sourcePairLength);
  for (let index = 0; index < canonical.length; index += 1) {
    pairs[index * 2] = canonical[index][0];
    pairs[index * 2 + 1] = canonical[index][1];
  }
  const actualReceipt = computeBetaSkirtExactValidatedSeamReceiptSha256V1(
    sourcePositions,
    sourceTriangles,
    pairs,
  );
  if (actualReceipt !== suppliedReceipt)
    fail('input-invalid', 'seamSnapshot validation receipt does not bind its pairs and geometry.');
  return CAPTURED_OBJECT_FREEZE({
    pairs,
    exactBound: sourcePairLength > 0,
    callerBuffer: preflight.callerBuffer,
  });
}

function snapshotPinsForPreflight(
  value: unknown,
  vertexCount: number,
  maximumOperationCount: number,
): Readonly<{
  values: Uint32Array;
  mask: Uint8Array;
  callerBuffer: ArrayBuffer | null;
}> {
  if (value === undefined)
    return CAPTURED_OBJECT_FREEZE({
      values: new CAPTURED_UINT32_ARRAY(),
      mask: new CAPTURED_UINT8_ARRAY(vertexCount),
      callerBuffer: null,
    });
  const metadata = shallowTypedArrayMetadata(
    value,
    UINT32_ARRAY_PROTOTYPE,
    4,
    'pinnedVertexIndices',
    vertexCount,
  );
  if (metadata.length * 6 > maximumOperationCount)
    fail('resource-cap-exceeded', 'pinnedVertexIndices exceeds its preflight operation budget.');
  const source = exactTypedArray<Uint32Array>(
    value,
    CAPTURED_UINT32_ARRAY,
    UINT32_ARRAY_PROTOTYPE,
    'pinnedVertexIndices',
    vertexCount,
  );
  const sourceCount = metadata.length;
  const callerBuffer = metadata.buffer;
  if (typedArrayLength(source) !== sourceCount || typedArrayBuffer(source) !== callerBuffer)
    fail('input-invalid', 'pinnedVertexIndices drifted after its bounded metadata preflight.');
  const values = copyUint32(source);
  if (
    typedArrayLength(source) !== sourceCount ||
    typedArrayBuffer(source) !== callerBuffer ||
    typedArrayLength(values) !== sourceCount
  )
    fail('input-invalid', 'pinnedVertexIndices drifted while creating its owned preflight copy.');
  const mask = new CAPTURED_UINT8_ARRAY(vertexCount);
  const valueCount = typedArrayLength(values);
  for (let index = 0; index < valueCount; index += 1) {
    const vertex = values[index];
    if (vertex >= vertexCount || mask[vertex] === 1)
      fail('input-invalid', 'pinnedVertexIndices contains an invalid or duplicate vertex.');
    mask[vertex] = 1;
  }
  return CAPTURED_OBJECT_FREEZE({ values, mask, callerBuffer });
}

function isPinned(mask: Uint8Array, vertex: number): boolean {
  return mask[vertex] === 1;
}

function uint32(value: unknown, label: string): number {
  return integer(value, label, 0, 0xffff_ffff);
}

function normalizedNormal(
  value: unknown,
  label: string,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
  requireUnit: boolean,
): Vec3 {
  const raw = exactDenseNumberTuple(value, 3, label);
  if (arraySome(raw, (component) => CAPTURED_OBJECT_IS(component, -0)))
    fail('input-invalid', `${label} must not contain negative zero.`);
  const maximum = CAPTURED_MATH_MAX(
    CAPTURED_MATH_ABS(raw[0]),
    CAPTURED_MATH_ABS(raw[1]),
    CAPTURED_MATH_ABS(raw[2]),
  );
  if (!(maximum > policy.absoluteEpsilonM) || !CAPTURED_NUMBER_IS_FINITE(maximum))
    fail('input-invalid', `${label} is degenerate.`);
  const scaledX = raw[0] / maximum;
  const scaledY = raw[1] / maximum;
  const scaledZ = raw[2] / maximum;
  const scaledLength = CAPTURED_MATH_HYPOT(scaledX, scaledY, scaledZ);
  if (!(scaledLength > 0) || !CAPTURED_NUMBER_IS_FINITE(scaledLength))
    fail('input-invalid', `${label} could not be normalized finitely.`);
  const length = maximum > 2 ? Infinity : maximum * scaledLength;
  if (requireUnit && CAPTURED_MATH_ABS(length - 1) > policy.barycentricTolerance)
    fail('input-invalid', `${label} is not the extractor's outward unit normal.`);
  if (requireUnit) return CAPTURED_OBJECT_FREEZE([raw[0], raw[1], raw[2]]) as Vec3;
  const normalized: Vec3 = CAPTURED_OBJECT_FREEZE([
    scaledX / scaledLength,
    scaledY / scaledLength,
    scaledZ / scaledLength,
  ]) as Vec3;
  if (
    !CAPTURED_NUMBER_IS_FINITE(normalized[0]) ||
    !CAPTURED_NUMBER_IS_FINITE(normalized[1]) ||
    !CAPTURED_NUMBER_IS_FINITE(normalized[2]) ||
    CAPTURED_MATH_ABS(CAPTURED_MATH_HYPOT(normalized[0], normalized[1], normalized[2]) - 1) >
      2.220446049250313e-16 * 4
  )
    fail('input-invalid', `${label} did not produce a finite unit normal.`);
  return normalized;
}

function point(
  value: unknown,
  label: string,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
): Vec3 {
  const raw = exactDenseNumberTuple(value, 3, label);
  if (arraySome(raw, (component) => CAPTURED_OBJECT_IS(component, -0)))
    fail('input-invalid', `${label} must not contain negative zero.`);
  if (
    arraySome(raw, (component) => CAPTURED_MATH_ABS(component) > policy.maximumCoordinateMagnitudeM)
  )
    fail('input-invalid', `${label} exceeds the coordinate magnitude cap.`);
  return CAPTURED_OBJECT_FREEZE([raw[0], raw[1], raw[2]]) as Vec3;
}

function snapshotPrimitiveWitnesses(
  value: unknown,
  triangles: Uint32Array,
  expectedRound: number,
  expectedCount: number,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
): readonly BetaSkirtPrimitiveContactWitnessV4[] {
  const values = exactDenseArray(
    value,
    'primitiveWitnesses',
    policy.maximumContactCount,
    expectedCount,
  );
  const snapshots: BetaSkirtPrimitiveContactWitnessV4[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const label = `primitiveWitnesses[${index}]`;
    const record = exactPlainRecord(
      values[index],
      [
        'ordinal',
        'extractionRound',
        'kind',
        'activeGarmentVertexCount',
        'bodyTriangleIndex',
        'bodyVertexIndices',
        'garmentTriangleIndex',
        'garmentVertexIndices',
        'garmentWeights',
        'bodySurfacePointM',
        'outwardBodyNormal',
        'minimumClearanceM',
      ],
      [],
      label,
    );
    const ordinal = integer(record.ordinal, `${label}.ordinal`, 0, policy.maximumContactCount - 1);
    if (ordinal !== index)
      fail('input-invalid', `${label}.ordinal must be contiguous and match extractor order.`);
    const extractionRound = integer(
      record.extractionRound,
      `${label}.extractionRound`,
      0,
      policy.maximumOuterRoundCount - 1,
    );
    if (extractionRound !== expectedRound)
      fail('input-invalid', `${label}.extractionRound does not match aggregateBefore.`);
    const activeGarmentVertexCount = integer(
      record.activeGarmentVertexCount,
      `${label}.activeGarmentVertexCount`,
      1,
      3,
    ) as 1 | 2 | 3;
    const expectedKind =
      activeGarmentVertexCount === 1
        ? 'signed-vertex-nearest'
        : activeGarmentVertexCount === 2
          ? 'garment-edge-body-triangle'
          : 'triangle-intersection-barycentric';
    if (record.kind !== expectedKind)
      fail('input-invalid', `${label}.kind contradicts its support.`);
    const bodyTriangleIndex = uint32(record.bodyTriangleIndex, `${label}.bodyTriangleIndex`);
    const bodyIndexValues = exactDenseNumberTuple(
      record.bodyVertexIndices,
      3,
      `${label}.bodyVertexIndices`,
    );
    const bodyIndices = arrayMap(bodyIndexValues, (item, itemIndex) =>
      uint32(item, `${label}.bodyVertexIndices[${itemIndex}]`),
    ) as [number, number, number];
    if (
      bodyIndices[0] === bodyIndices[1] ||
      bodyIndices[1] === bodyIndices[2] ||
      bodyIndices[2] === bodyIndices[0]
    )
      fail('input-invalid', `${label}.bodyVertexIndices contains duplicates.`);
    const garmentTriangleIndex = integer(
      record.garmentTriangleIndex,
      `${label}.garmentTriangleIndex`,
      0,
      typedArrayLength(triangles) / 3 - 1,
    );
    const garmentIndexValues = exactDenseNumberTuple(
      record.garmentVertexIndices,
      3,
      `${label}.garmentVertexIndices`,
    );
    const garmentIndices = arrayMap(garmentIndexValues, (item, itemIndex) =>
      uint32(item, `${label}.garmentVertexIndices[${itemIndex}]`),
    ) as [number, number, number];
    const triangleOffset = garmentTriangleIndex * 3;
    for (let item = 0; item < 3; item += 1) {
      if (garmentIndices[item] !== triangles[triangleOffset + item])
        fail('input-invalid', `${label} is not bound to the supplied garment triangle order.`);
    }
    const rawWeights = exactDenseNumberTuple(record.garmentWeights, 3, `${label}.garmentWeights`);
    const rawSum = rawWeights[0] + rawWeights[1] + rawWeights[2];
    if (CAPTURED_MATH_ABS(rawSum - 1) > 1e-12)
      fail('input-invalid', `${label}.garmentWeights does not match extractor normalization.`);
    for (let weightIndex = 0; weightIndex < rawWeights.length; weightIndex += 1) {
      const weight = rawWeights[weightIndex];
      if (CAPTURED_OBJECT_IS(weight, -0))
        fail('input-invalid', `${label}.garmentWeights must encode inactive weights as +0.`);
      if (weight < 0 || weight > 1)
        fail('input-invalid', `${label}.garmentWeights is outside [0, 1].`);
      if (weight !== 0 && weight <= policy.barycentricTolerance)
        fail('input-invalid', `${label}.garmentWeights contains a non-canonical inactive weight.`);
    }
    const normalized = CAPTURED_OBJECT_FREEZE([
      rawWeights[0],
      rawWeights[1],
      rawWeights[2],
    ]) as readonly [number, number, number];
    let active = 0;
    for (let weightIndex = 0; weightIndex < normalized.length; weightIndex += 1)
      if (normalized[weightIndex] > policy.barycentricTolerance) active += 1;
    if (active !== activeGarmentVertexCount)
      fail('input-invalid', `${label}.garmentWeights contradicts activeGarmentVertexCount.`);
    if (
      typeof record.minimumClearanceM !== 'number' ||
      !CAPTURED_NUMBER_IS_FINITE(record.minimumClearanceM) ||
      CAPTURED_OBJECT_IS(record.minimumClearanceM, -0) ||
      record.minimumClearanceM < 0 ||
      record.minimumClearanceM > policy.maximumDisplacementM
    )
      fail(
        'input-invalid',
        `${label}.minimumClearanceM must be finite in [0, ${policy.maximumDisplacementM}].`,
      );
    const minimumClearanceM = record.minimumClearanceM;
    arrayPush(
      snapshots,
      CAPTURED_OBJECT_FREEZE({
        ordinal,
        extractionRound,
        kind: expectedKind,
        activeGarmentVertexCount,
        bodyTriangleIndex,
        bodyVertexIndices: CAPTURED_OBJECT_FREEZE(bodyIndices),
        garmentTriangleIndex,
        garmentVertexIndices: CAPTURED_OBJECT_FREEZE(garmentIndices),
        garmentWeights: normalized,
        bodySurfacePointM: point(record.bodySurfacePointM, `${label}.bodySurfacePointM`, policy),
        outwardBodyNormal: normalizedNormal(
          record.outwardBodyNormal,
          `${label}.outwardBodyNormal`,
          policy,
          true,
        ),
        minimumClearanceM,
      }),
    );
  }
  return CAPTURED_OBJECT_FREEZE(snapshots);
}

function snapshotLegacyContacts(
  value: unknown,
  vertexCount: number,
  expectedCount: number,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
): readonly BetaSkirtPrimitiveContactLegacyVertexConstraintV4[] {
  if (value === undefined) return CAPTURED_OBJECT_FREEZE([]);
  const values = exactDenseArray(
    value,
    'legacyVertexContacts',
    policy.maximumContactCount,
    expectedCount,
  );
  return CAPTURED_OBJECT_FREEZE(
    arrayMap(values, (item, index) => {
      const label = `legacyVertexContacts[${index}]`;
      const record = exactPlainRecord(
        item,
        ['vertexIndex', 'surfacePointM', 'outwardNormal', 'minimumClearanceM'],
        [],
        label,
      );
      return CAPTURED_OBJECT_FREEZE({
        vertexIndex: integer(record.vertexIndex, `${label}.vertexIndex`, 0, vertexCount - 1),
        surfacePointM: point(record.surfacePointM, `${label}.surfacePointM`, policy),
        outwardNormal: normalizedNormal(
          record.outwardNormal,
          `${label}.outwardNormal`,
          policy,
          false,
        ),
        minimumClearanceM: finiteRangeWithoutNegativeZero(
          record.minimumClearanceM,
          `${label}.minimumClearanceM`,
          0,
          policy.maximumDisplacementM,
        ),
      });
    }),
  );
}

function preflightSeamSnapshot(
  value: unknown,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
): SeamSnapshotPreflight {
  if (value === undefined)
    return CAPTURED_OBJECT_FREEZE({ record: null, pairElementCount: 0, callerBuffer: null });
  const record = exactPlainRecord(
    value,
    ['version', 'validationStatus', 'validationReceiptSha256', 'pairs'],
    [],
    'seamSnapshot',
  );
  const metadata = shallowTypedArrayMetadata(
    record.pairs,
    UINT32_ARRAY_PROTOTYPE,
    4,
    'seamSnapshot.pairs',
    policy.maximumSeamPairCount * 2,
  );
  if (metadata.length % 2 !== 0)
    fail('input-invalid', 'seamSnapshot.pairs must contain complete pairs.');
  return CAPTURED_OBJECT_FREEZE({
    record,
    pairElementCount: metadata.length,
    callerBuffer: metadata.buffer,
  });
}

function conservativeMandatoryOperationCount(
  positionLength: number,
  triangleIndexLength: number,
  primitiveCount: number,
  legacyCount: number,
  seamPairCount: number,
  pinCount: number,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
): number {
  const triangleCount = triangleIndexLength / 3;
  const edgeUpperBound = CAPTURED_MATH_MIN(policy.maximumUniqueEdgeCount, triangleCount * 3);
  const adjacencyIncidenceUpperBound = edgeUpperBound * 2;
  const contactCount = primitiveCount + legacyCount;
  const supportIncidenceUpperBound = primitiveCount * 3 + legacyCount;
  const positionComponentBytes = 4 + positionLength * 4;
  const triangleComponentBytes = 4 + triangleIndexLength * 4;
  const positionDigestBytes =
    BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.worldPositions.length + positionComponentBytes;
  const triangleDigestBytes =
    BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.triangles.length + triangleComponentBytes;
  const geometryDigestBytes =
    BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.geometry.length +
    positionComponentBytes +
    triangleComponentBytes;
  const structuralBytes = 48 + 130 + 4 + primitiveCount * 118;
  const solverStructuralBytes = 48 + 64 * 6 + 6;
  const seamBytes = 48 + 12 + positionLength * 4 + triangleIndexLength * 4 + seamPairCount * 8;
  const authority =
    positionLength * 8 +
    triangleIndexLength * 8 +
    primitiveCount * 80 +
    legacyCount * 32 +
    seamPairCount * 12 +
    pinCount * 6 +
    sortComparisonUpperBound(seamPairCount) +
    sortComparisonUpperBound(primitiveCount) +
    structuralBytes +
    solverStructuralBytes +
    seamBytes +
    positionDigestBytes +
    triangleDigestBytes +
    geometryDigestBytes +
    sha256RoundOperationCount(structuralBytes) +
    sha256RoundOperationCount(solverStructuralBytes) +
    sha256RoundOperationCount(seamBytes) +
    sha256RoundOperationCount(positionDigestBytes) +
    sha256RoundOperationCount(triangleDigestBytes) +
    sha256RoundOperationCount(geometryDigestBytes);
  const graph =
    triangleIndexLength * 16 +
    edgeUpperBound * 16 +
    adjacencyIncidenceUpperBound * 4 +
    sortComparisonUpperBound(edgeUpperBound) +
    adjacencyIncidenceUpperBound *
      CAPTURED_MATH_CEIL(CAPTURED_MATH_LOG2(CAPTURED_MATH_MAX(2, edgeUpperBound)));
  const canonicalization =
    contactCount * 32 + supportIncidenceUpperBound * 16 + sortComparisonUpperBound(contactCount);
  const finalization =
    positionLength * 16 +
    triangleIndexLength * 16 +
    edgeUpperBound * 16 +
    triangleCount * 24 +
    contactCount * 16 +
    supportIncidenceUpperBound * 12 +
    seamPairCount * 16 +
    sha256RoundOperationCount(positionLength * 4 + triangleIndexLength * 4 + 256);
  return authority + graph + canonicalization + finalization;
}

function snapshotInput(
  value: BetaSkirtPrimitiveContactRelaxationInputV4,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
): OwnedInput {
  const record = exactPlainRecord(
    value,
    [
      'sourcePositionsM',
      'sourceTriangles',
      'primitiveWitnesses',
      'sourceGeometrySha256',
      'intersectionPairSha256',
      'garmentWorldPositionsSha256',
      'garmentTrianglesSha256',
      'solverSourceGeometrySha256',
      'structuralWitnessSetSha256',
      'solverStructuralWitnessSetSha256',
    ],
    [
      'previousStructuralWitnessSetSha256',
      'legacyVertexContacts',
      'seamSnapshot',
      'pinnedVertexIndices',
      'aggregateBefore',
      'transform',
      'radialAxisXZ',
    ],
    'input',
  );
  const transform = snapshotOptionalTransform(record.transform);
  const radialAxisXZ = snapshotOptionalRadialAxis(record.radialAxisXZ);
  const sourcePositionMetadata = shallowTypedArrayMetadata(
    record.sourcePositionsM,
    FLOAT32_ARRAY_PROTOTYPE,
    4,
    'sourcePositionsM',
    policy.maximumVertexCount * 3,
  );
  const sourceTriangleMetadata = shallowTypedArrayMetadata(
    record.sourceTriangles,
    UINT32_ARRAY_PROTOTYPE,
    4,
    'sourceTriangles',
    policy.maximumTriangleCount * 3,
  );
  if (sourcePositionMetadata.buffer === sourceTriangleMetadata.buffer)
    fail('input-invalid', 'Source position and triangle buffers must not alias.');
  if (sourcePositionMetadata.length < 9 || sourcePositionMetadata.length % 3 !== 0)
    fail('input-invalid', 'sourcePositionsM must contain at least three xyz vertices.');
  if (sourceTriangleMetadata.length < 3 || sourceTriangleMetadata.length % 3 !== 0)
    fail('input-invalid', 'sourceTriangles must contain complete triangles.');
  const vertexCount = sourcePositionMetadata.length / 3;
  const triangleCount = sourceTriangleMetadata.length / 3;
  const aggregateBefore = snapshotAggregate(record.aggregateBefore, policy);
  const pins = snapshotPinsForPreflight(
    record.pinnedVertexIndices,
    vertexCount,
    policy.maximumOperations - aggregateBefore.operationCount,
  );
  const pinCount = typedArrayLength(pins.values);
  const primitiveCount = exactArrayLengthWithin(
    record.primitiveWitnesses,
    'primitiveWitnesses',
    policy.maximumContactCount,
  );
  const legacyCount =
    record.legacyVertexContacts === undefined
      ? 0
      : exactArrayLengthWithin(
          record.legacyVertexContacts,
          'legacyVertexContacts',
          policy.maximumContactCount,
        );
  if (primitiveCount + legacyCount > policy.maximumContactCount - aggregateBefore.contactCount)
    fail('resource-cap-exceeded', 'Aggregate raw contact count exceeds its frozen cap.');
  if (legacyCount !== 0)
    fail('input-invalid', 'V4 does not accept unbound legacy V3 vertex-contact seeds.');
  const seamPreflight = preflightSeamSnapshot(record.seamSnapshot, policy);
  const seamPairCount = seamPreflight.pairElementCount / 2;
  const conservativeMandatoryOperations = conservativeMandatoryOperationCount(
    sourcePositionMetadata.length,
    sourceTriangleMetadata.length,
    primitiveCount,
    legacyCount,
    seamPairCount,
    pinCount,
    policy,
  );
  if (aggregateBefore.operationCount + conservativeMandatoryOperations > policy.maximumOperations)
    fail(
      'resource-cap-exceeded',
      'Conservative authority, graph, canonicalization, and finalization preflight exceeds the operation cap.',
    );
  const sourcePositions = exactTypedArray<Float32Array>(
    record.sourcePositionsM,
    CAPTURED_FLOAT32_ARRAY,
    FLOAT32_ARRAY_PROTOTYPE,
    'sourcePositionsM',
    policy.maximumVertexCount * 3,
  );
  const sourceTriangles = exactTypedArray<Uint32Array>(
    record.sourceTriangles,
    CAPTURED_UINT32_ARRAY,
    UINT32_ARRAY_PROTOTYPE,
    'sourceTriangles',
    policy.maximumTriangleCount * 3,
  );
  if (vertexCount > policy.maximumVertexCount || triangleCount > policy.maximumTriangleCount)
    fail('resource-cap-exceeded', 'Source geometry exceeds its bounded count.');
  for (let index = 0; index < sourcePositionMetadata.length; index += 1) {
    const coordinate = sourcePositions[index];
    if (
      !CAPTURED_NUMBER_IS_FINITE(coordinate) ||
      CAPTURED_MATH_ABS(coordinate) > policy.maximumCoordinateMagnitudeM
    )
      fail('input-invalid', 'sourcePositionsM contains an invalid coordinate.');
  }
  for (let offset = 0; offset < sourceTriangleMetadata.length; offset += 3) {
    const a = sourceTriangles[offset];
    const b = sourceTriangles[offset + 1];
    const c = sourceTriangles[offset + 2];
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount || a === b || b === c || c === a)
      fail('input-invalid', `sourceTriangles triangle ${offset / 3} is invalid.`);
  }
  const ownedSourcePositions = copyFloat32(sourcePositions);
  const ownedSourceTriangles = copyUint32(sourceTriangles);
  const expectedExtractionRound = CAPTURED_MATH_MIN(
    aggregateBefore.outerRoundCount,
    policy.maximumOuterRoundCount - 1,
  );
  const primitiveWitnesses = snapshotPrimitiveWitnesses(
    record.primitiveWitnesses,
    ownedSourceTriangles,
    expectedExtractionRound,
    primitiveCount,
    policy,
  );
  const legacyVertexContacts = snapshotLegacyContacts(
    record.legacyVertexContacts,
    vertexCount,
    legacyCount,
    policy,
  );
  const rawContactCount = primitiveWitnesses.length + legacyVertexContacts.length;
  if (rawContactCount !== primitiveCount + legacyCount)
    fail('input-invalid', 'Contact preflight and owned snapshot counts drifted.');
  const seams = snapshotSeams(
    seamPreflight,
    ownedSourcePositions,
    ownedSourceTriangles,
    vertexCount,
    policy,
  );
  const buffers = [sourcePositionMetadata.buffer, sourceTriangleMetadata.buffer];
  if (seams.callerBuffer) arrayPush(buffers, seams.callerBuffer);
  if (pins.callerBuffer) arrayPush(buffers, pins.callerBuffer);
  for (let left = 0; left < buffers.length; left += 1) {
    for (let right = left + 1; right < buffers.length; right += 1) {
      if (buffers[left] === buffers[right])
        fail('input-invalid', 'Input typed-array buffers must not alias.');
    }
  }
  const sourceGeometrySha256 = validatedSha256(record.sourceGeometrySha256, 'sourceGeometrySha256');
  const intersectionPairSha256 = validatedSha256(
    record.intersectionPairSha256,
    'intersectionPairSha256',
  );
  const garmentWorldPositionsSha256 = validatedSha256(
    record.garmentWorldPositionsSha256,
    'garmentWorldPositionsSha256',
  );
  const garmentTrianglesSha256 = validatedSha256(
    record.garmentTrianglesSha256,
    'garmentTrianglesSha256',
  );
  const solverSourceGeometrySha256 = validatedSha256(
    record.solverSourceGeometrySha256,
    'solverSourceGeometrySha256',
  );
  const recomputedSourceHashes = computeBetaSkirtV4SolverSourceGeometryHashesV4(
    ownedSourcePositions,
    ownedSourceTriangles,
  );
  if (
    garmentWorldPositionsSha256 !== recomputedSourceHashes.garmentWorldPositionsSha256 ||
    garmentTrianglesSha256 !== recomputedSourceHashes.garmentTrianglesSha256 ||
    solverSourceGeometrySha256 !== recomputedSourceHashes.solverSourceGeometrySha256
  )
    fail(
      'input-invalid',
      'Solver source component hashes do not bind the supplied geometry bytes.',
    );
  const structuralWitnessSetSha256 = validatedSha256(
    record.structuralWitnessSetSha256,
    'structuralWitnessSetSha256',
  );
  const recomputedStructuralWitnessSetSha256 =
    computeBetaSkirtPrimitiveStructuralWitnessSetSha256V4(
      sourceGeometrySha256,
      intersectionPairSha256,
      primitiveWitnesses,
    );
  if (structuralWitnessSetSha256 !== recomputedStructuralWitnessSetSha256)
    fail(
      'input-invalid',
      'structuralWitnessSetSha256 does not bind the supplied witnesses and coordinator receipts.',
    );
  const solverStructuralWitnessSetSha256 = validatedSha256(
    record.solverStructuralWitnessSetSha256,
    'solverStructuralWitnessSetSha256',
  );
  const recomputedSolverStructuralWitnessSetSha256 =
    computeBetaSkirtPrimitiveSolverStructuralWitnessSetSha256V4(
      sourceGeometrySha256,
      intersectionPairSha256,
      garmentWorldPositionsSha256,
      garmentTrianglesSha256,
      solverSourceGeometrySha256,
      structuralWitnessSetSha256,
    );
  if (solverStructuralWitnessSetSha256 !== recomputedSolverStructuralWitnessSetSha256)
    fail(
      'input-invalid',
      'solverStructuralWitnessSetSha256 does not bind extractor receipts and local source hashes.',
    );
  const previous = record.previousStructuralWitnessSetSha256;
  if (previous !== undefined && previous !== null)
    validatedSha256(previous, 'previousStructuralWitnessSetSha256');
  return CAPTURED_OBJECT_FREEZE({
    positions: ownedSourcePositions,
    triangles: ownedSourceTriangles,
    primitiveWitnesses,
    legacyVertexContacts,
    sourceGeometrySha256,
    intersectionPairSha256,
    garmentWorldPositionsSha256,
    garmentTrianglesSha256,
    solverSourceGeometrySha256,
    structuralWitnessSetSha256,
    solverStructuralWitnessSetSha256,
    previousStructuralWitnessSetSha256: (previous ?? null) as string | null,
    seamPairs: seams.pairs,
    exactSeamSnapshotBound: seams.exactBound,
    pinned: pins.mask,
    aggregateBefore,
    mandatoryPreflightReservedOperationCount: conservativeMandatoryOperations,
    transform,
    radialAxisXZ,
  });
}

const NUMBER_KEY_BUFFER = new CAPTURED_ARRAY_BUFFER(8);
const NUMBER_KEY_VIEW = new CAPTURED_DATA_VIEW(NUMBER_KEY_BUFFER);

function numberKey(value: number): string {
  apply(CAPTURED_DATA_VIEW_SET_FLOAT64, NUMBER_KEY_VIEW, [
    0,
    CAPTURED_OBJECT_IS(value, -0) ? 0 : value,
    false,
  ]);
  const high = apply<number>(CAPTURED_DATA_VIEW_GET_UINT32, NUMBER_KEY_VIEW, [0, false]);
  const low = apply<number>(CAPTURED_DATA_VIEW_GET_UINT32, NUMBER_KEY_VIEW, [4, false]);
  return `${uint32Hex(high)}${uint32Hex(low)}`;
}

function uint32Hex(value: number): string {
  let result = '';
  for (let shift = 28; shift >= 0; shift -= 4) result += HEX[(value >>> shift) & 15];
  return result;
}

function supportKey(support: readonly SupportEntry[]): string {
  return arrayJoin(
    arrayMap(support, ({ vertexIndex, weight }) => `${vertexIndex}@${numberKey(weight)}`),
    ',',
  );
}

function makeConstraint(
  family: ContactConstraint['family'],
  support: readonly SupportEntry[],
  surfacePointM: Vec3,
  outwardNormal: Vec3,
  minimumClearanceM: number,
): ContactConstraint {
  const sortedEntries = arrayMap(support, (entry) =>
    CAPTURED_OBJECT_FREEZE({ vertexIndex: entry.vertexIndex, weight: entry.weight }),
  );
  arraySort(sortedEntries, (left, right) => left.vertexIndex - right.vertexIndex);
  const sorted = CAPTURED_OBJECT_FREEZE(sortedEntries);
  const canonicalSupportKey = supportKey(sorted);
  const keyParts = [
    canonicalSupportKey,
    numberKey(surfacePointM[0]),
    numberKey(surfacePointM[1]),
    numberKey(surfacePointM[2]),
    numberKey(outwardNormal[0]),
    numberKey(outwardNormal[1]),
    numberKey(outwardNormal[2]),
    numberKey(minimumClearanceM),
  ];
  const key = arrayJoin(keyParts, '|');
  return CAPTURED_OBJECT_FREEZE({
    family,
    support: sorted,
    supportKey: canonicalSupportKey,
    surfacePointM,
    outwardNormal,
    minimumClearanceM,
    key,
  });
}

function canonicalConstraints(snapshot: OwnedInput): Readonly<{
  constraints: readonly ContactConstraint[];
  duplicateCount: number;
}> {
  const all: ContactConstraint[] = [];
  for (let witnessIndex = 0; witnessIndex < snapshot.primitiveWitnesses.length; witnessIndex += 1) {
    const witness = snapshot.primitiveWitnesses[witnessIndex];
    const support: SupportEntry[] = [];
    for (let index = 0; index < 3; index += 1) {
      const weight = witness.garmentWeights[index];
      if (weight > 0)
        arrayPush(
          support,
          CAPTURED_OBJECT_FREEZE({
            vertexIndex: witness.garmentVertexIndices[index],
            weight,
          }),
        );
    }
    arrayPush(
      all,
      makeConstraint(
        'primitive-v4',
        support,
        witness.bodySurfacePointM,
        witness.outwardBodyNormal,
        witness.minimumClearanceM,
      ),
    );
  }
  for (
    let contactIndex = 0;
    contactIndex < snapshot.legacyVertexContacts.length;
    contactIndex += 1
  ) {
    const contact = snapshot.legacyVertexContacts[contactIndex];
    arrayPush(
      all,
      makeConstraint(
        'legacy-v3',
        [CAPTURED_OBJECT_FREEZE({ vertexIndex: contact.vertexIndex, weight: 1 })],
        contact.surfacePointM,
        contact.outwardNormal,
        contact.minimumClearanceM,
      ),
    );
  }
  arraySort(
    all,
    (left, right) =>
      (left.key < right.key ? -1 : left.key > right.key ? 1 : 0) ||
      (left.family === right.family ? 0 : left.family === 'primitive-v4' ? -1 : 1),
  );
  const result: ContactConstraint[] = [];
  let duplicateCount = 0;
  for (let index = 0; index < all.length; index += 1) {
    const constraint = all[index];
    if (result.length > 0 && result[result.length - 1].key === constraint.key) {
      duplicateCount += 1;
      continue;
    }
    arrayPush(result, constraint);
  }
  return CAPTURED_OBJECT_FREEZE({
    constraints: CAPTURED_OBJECT_FREEZE(result),
    duplicateCount,
  });
}

function canonicalDirection(
  normal: Vec3,
  epsilonM: number,
): Readonly<{
  direction: Vec3;
  sign: -1 | 1;
}> {
  let sign: -1 | 1 = 1;
  for (let index = 0; index < normal.length; index += 1) {
    const component = normal[index];
    if (CAPTURED_MATH_ABS(component) <= epsilonM) continue;
    if (component < 0) sign = -1;
    break;
  }
  return CAPTURED_OBJECT_FREEZE({
    direction: CAPTURED_OBJECT_FREEZE([
      normal[0] * sign || 0,
      normal[1] * sign || 0,
      normal[2] * sign || 0,
    ]) as Vec3,
    sign,
  });
}

function opposingConstraintGroupCount(
  constraints: readonly ContactConstraint[],
  epsilonM: number,
): number {
  const intervals = new CAPTURED_MAP<string, { lower: number; upper: number }>();
  for (let index = 0; index < constraints.length; index += 1) {
    const constraint = constraints[index];
    const canonical = canonicalDirection(constraint.outwardNormal, epsilonM);
    const key = `${constraint.supportKey}|${arrayJoin(arrayMap(canonical.direction, numberKey), '|')}`;
    const plane =
      canonical.direction[0] * constraint.surfacePointM[0] +
      canonical.direction[1] * constraint.surfacePointM[1] +
      canonical.direction[2] * constraint.surfacePointM[2];
    const interval = mapGet(intervals, key) ?? { lower: -Infinity, upper: Infinity };
    if (canonical.sign === 1)
      interval.lower = CAPTURED_MATH_MAX(interval.lower, plane + constraint.minimumClearanceM);
    else interval.upper = CAPTURED_MATH_MIN(interval.upper, plane - constraint.minimumClearanceM);
    mapSet(intervals, key, interval);
  }
  let count = 0;
  const values = mapValues(intervals);
  for (let index = 0; index < values.length; index += 1) {
    const interval = values[index];
    if (interval.lower > interval.upper + epsilonM) count += 1;
  }
  return count;
}

function coordinate(positions: Float32Array | Float64Array, vertex: number, axis: number): number {
  return positions[vertex * 3 + axis];
}

function edgeLength(positions: Float32Array | Float64Array, a: number, b: number): number {
  return CAPTURED_MATH_HYPOT(
    coordinate(positions, b, 0) - coordinate(positions, a, 0),
    coordinate(positions, b, 1) - coordinate(positions, a, 1),
    coordinate(positions, b, 2) - coordinate(positions, a, 2),
  );
}

function triangleCross(
  positions: Float32Array | Float64Array,
  a: number,
  b: number,
  c: number,
): Vec3 {
  const abx = coordinate(positions, b, 0) - coordinate(positions, a, 0);
  const aby = coordinate(positions, b, 1) - coordinate(positions, a, 1);
  const abz = coordinate(positions, b, 2) - coordinate(positions, a, 2);
  const acx = coordinate(positions, c, 0) - coordinate(positions, a, 0);
  const acy = coordinate(positions, c, 1) - coordinate(positions, a, 1);
  const acz = coordinate(positions, c, 2) - coordinate(positions, a, 2);
  return [aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx];
}

function buildRestGeometry(
  snapshot: OwnedInput,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
): Readonly<{
  edges: readonly Edge[];
  triangles: readonly RestTriangle[];
  adjacency: readonly (readonly number[])[];
  adjacencyIncidenceCount: number;
}> {
  const edgeMap = new CAPTURED_MAP<string, readonly [number, number]>();
  const restTriangles: RestTriangle[] = [];
  const triangleIndexLength = typedArrayLength(snapshot.triangles);
  for (let offset = 0; offset < triangleIndexLength; offset += 3) {
    const a = snapshot.triangles[offset];
    const b = snapshot.triangles[offset + 1];
    const c = snapshot.triangles[offset + 2];
    const cross = triangleCross(snapshot.positions, a, b, c);
    const restDoubleArea = CAPTURED_MATH_HYPOT(cross[0], cross[1], cross[2]);
    if (!(restDoubleArea > policy.absoluteEpsilonM * policy.absoluteEpsilonM))
      fail('source-geometry-invalid', `Source triangle ${offset / 3} is degenerate.`);
    const ab = edgeLength(snapshot.positions, a, b);
    const bc = edgeLength(snapshot.positions, b, c);
    const ca = edgeLength(snapshot.positions, c, a);
    if (
      ab <= policy.absoluteEpsilonM ||
      bc <= policy.absoluteEpsilonM ||
      ca <= policy.absoluteEpsilonM
    )
      fail('source-geometry-invalid', `Source triangle ${offset / 3} has a zero-length edge.`);
    arrayPush(
      restTriangles,
      CAPTURED_OBJECT_FREEZE({
        a,
        b,
        c,
        ab,
        bc,
        ca,
        restCross: CAPTURED_OBJECT_FREEZE(cross) as Vec3,
        restDoubleArea,
      }),
    );
    const lefts = [a, b, c] as const;
    const rights = [b, c, a] as const;
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const left = lefts[edgeIndex];
      const right = rights[edgeIndex];
      const low = CAPTURED_MATH_MIN(left, right);
      const high = CAPTURED_MATH_MAX(left, right);
      mapSet(edgeMap, `${low}:${high}`, [low, high]);
      if (mapSize(edgeMap) > policy.maximumUniqueEdgeCount)
        fail('resource-cap-exceeded', 'Unique rest-edge count exceeds its cap.');
    }
  }
  const pairs = mapValues(edgeMap);
  arraySort(pairs, (left, right) => left[0] - right[0] || left[1] - right[1]);
  const adjacency: number[][] = [];
  for (let vertex = 0; vertex < typedArrayLength(snapshot.positions) / 3; vertex += 1)
    arrayPush(adjacency, []);
  const edges = arrayMap(pairs, (pair) => {
    const a = pair[0];
    const b = pair[1];
    const restLength = edgeLength(snapshot.positions, a, b);
    arrayPush(adjacency[a], b);
    arrayPush(adjacency[b], a);
    return CAPTURED_OBJECT_FREEZE({ a, b, restLength });
  });
  let adjacencyIncidenceCount = 0;
  for (let index = 0; index < adjacency.length; index += 1) {
    const neighbors = adjacency[index];
    arraySort(neighbors, (left, right) => left - right);
    adjacencyIncidenceCount += neighbors.length;
  }
  return CAPTURED_OBJECT_FREEZE({
    edges: CAPTURED_OBJECT_FREEZE(edges),
    triangles: CAPTURED_OBJECT_FREEZE(restTriangles),
    adjacency: CAPTURED_OBJECT_FREEZE(
      arrayMap(adjacency, (neighbors) => CAPTURED_OBJECT_FREEZE(neighbors)),
    ),
    adjacencyIncidenceCount,
  });
}

function projectEdge(
  positions: Float64Array,
  a: number,
  b: number,
  restLength: number,
  stiffness: number,
  pinned: Uint8Array,
  epsilonM: number,
): void {
  const aOffset = a * 3;
  const bOffset = b * 3;
  const dx = positions[bOffset] - positions[aOffset];
  const dy = positions[bOffset + 1] - positions[aOffset + 1];
  const dz = positions[bOffset + 2] - positions[aOffset + 2];
  const length = CAPTURED_MATH_HYPOT(dx, dy, dz);
  if (!(length > epsilonM)) return;
  const aPinned = isPinned(pinned, a);
  const bPinned = isPinned(pinned, b);
  if (aPinned && bPinned) return;
  const magnitude = ((length - restLength) / length) * stiffness;
  const aWeight = aPinned ? 0 : bPinned ? 1 : 0.5;
  const bWeight = bPinned ? 0 : aPinned ? 1 : 0.5;
  positions[aOffset] += dx * magnitude * aWeight;
  positions[aOffset + 1] += dy * magnitude * aWeight;
  positions[aOffset + 2] += dz * magnitude * aWeight;
  positions[bOffset] -= dx * magnitude * bWeight;
  positions[bOffset + 1] -= dy * magnitude * bWeight;
  positions[bOffset + 2] -= dz * magnitude * bWeight;
}

function projectTriangleRestShape(
  positions: Float64Array,
  triangle: RestTriangle,
  stiffness: number,
  pinned: Uint8Array,
  epsilonM: number,
  orientationTolerance: number,
): boolean {
  const vertices = [triangle.a, triangle.b, triangle.c] as const;
  const before = new CAPTURED_FLOAT64_ARRAY(9);
  for (let vertex = 0; vertex < 3; vertex += 1) {
    const sourceOffset = vertices[vertex] * 3;
    before[vertex * 3] = positions[sourceOffset];
    before[vertex * 3 + 1] = positions[sourceOffset + 1];
    before[vertex * 3 + 2] = positions[sourceOffset + 2];
  }
  projectEdge(positions, triangle.a, triangle.b, triangle.ab, stiffness, pinned, epsilonM);
  projectEdge(positions, triangle.b, triangle.c, triangle.bc, stiffness, pinned, epsilonM);
  projectEdge(positions, triangle.c, triangle.a, triangle.ca, stiffness, pinned, epsilonM);
  const cross = triangleCross(positions, triangle.a, triangle.b, triangle.c);
  const area = CAPTURED_MATH_HYPOT(cross[0], cross[1], cross[2]);
  const orientationDot =
    cross[0] * triangle.restCross[0] +
    cross[1] * triangle.restCross[1] +
    cross[2] * triangle.restCross[2];
  if (
    area > epsilonM * epsilonM &&
    orientationDot > orientationTolerance * triangle.restDoubleArea * area
  )
    return false;
  for (let vertex = 0; vertex < 3; vertex += 1) {
    const targetOffset = vertices[vertex] * 3;
    positions[targetOffset] = before[vertex * 3];
    positions[targetOffset + 1] = before[vertex * 3 + 1];
    positions[targetOffset + 2] = before[vertex * 3 + 2];
  }
  return true;
}

function contactResidual(
  positions: Float32Array | Float64Array,
  constraint: ContactConstraint,
): number {
  let qx = 0;
  let qy = 0;
  let qz = 0;
  for (let index = 0; index < constraint.support.length; index += 1) {
    const { vertexIndex, weight } = constraint.support[index];
    qx += coordinate(positions, vertexIndex, 0) * weight;
    qy += coordinate(positions, vertexIndex, 1) * weight;
    qz += coordinate(positions, vertexIndex, 2) * weight;
  }
  return (
    (qx - constraint.surfacePointM[0]) * constraint.outwardNormal[0] +
    (qy - constraint.surfacePointM[1]) * constraint.outwardNormal[1] +
    (qz - constraint.surfacePointM[2]) * constraint.outwardNormal[2] -
    constraint.minimumClearanceM
  );
}

function projectContact(
  positions: Float64Array,
  constraint: ContactConstraint,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
  pinned: Uint8Array,
): void {
  const residual = contactResidual(positions, constraint);
  if (residual >= policy.contactOvershootM) return;
  let denominator = 0;
  for (let index = 0; index < constraint.support.length; index += 1) {
    const { vertexIndex, weight } = constraint.support[index];
    if (!isPinned(pinned, vertexIndex)) denominator += weight * weight;
  }
  if (!(denominator > policy.absoluteEpsilonM * policy.absoluteEpsilonM)) return;
  const correction = (policy.contactOvershootM - residual) * policy.contactStiffness;
  for (let index = 0; index < constraint.support.length; index += 1) {
    const { vertexIndex, weight } = constraint.support[index];
    if (isPinned(pinned, vertexIndex)) continue;
    const scale = (correction * weight) / denominator;
    const offset = vertexIndex * 3;
    positions[offset] += constraint.outwardNormal[0] * scale;
    positions[offset + 1] += constraint.outwardNormal[1] * scale;
    positions[offset + 2] += constraint.outwardNormal[2] * scale;
  }
}

function measureContactResiduals(
  before: Float32Array,
  after: Float32Array,
  constraints: readonly ContactConstraint[],
  epsilonM: number,
): Readonly<{
  violatingBeforeCount: number;
  violatingAfterCount: number;
  minimumBefore: number;
  minimumAfter: number;
  maximumDeficitBefore: number;
  maximumDeficitAfter: number;
}> {
  let violatingBeforeCount = 0;
  let violatingAfterCount = 0;
  let minimumBefore = Infinity;
  let minimumAfter = Infinity;
  let maximumDeficitBefore = 0;
  let maximumDeficitAfter = 0;
  for (let index = 0; index < constraints.length; index += 1) {
    const constraint = constraints[index];
    const beforeResidual = contactResidual(before, constraint);
    const afterResidual = contactResidual(after, constraint);
    minimumBefore = CAPTURED_MATH_MIN(minimumBefore, beforeResidual);
    minimumAfter = CAPTURED_MATH_MIN(minimumAfter, afterResidual);
    maximumDeficitBefore = CAPTURED_MATH_MAX(maximumDeficitBefore, -beforeResidual);
    maximumDeficitAfter = CAPTURED_MATH_MAX(maximumDeficitAfter, -afterResidual);
    if (beforeResidual < -epsilonM) violatingBeforeCount += 1;
    if (afterResidual < -epsilonM) violatingAfterCount += 1;
  }
  return CAPTURED_OBJECT_FREEZE({
    violatingBeforeCount,
    violatingAfterCount,
    minimumBefore: constraints.length === 0 ? 0 : minimumBefore,
    minimumAfter: constraints.length === 0 ? 0 : minimumAfter,
    maximumDeficitBefore,
    maximumDeficitAfter,
  });
}

function measureRestEdges(
  candidate: Float32Array,
  edges: readonly Edge[],
): BetaSkirtPrimitiveRestEdgeMetricsV4 {
  let maximumRelativeLengthError = 0;
  let relativeSquared = 0;
  let maximumAbsoluteLengthErrorM = 0;
  let absoluteSquared = 0;
  for (let index = 0; index < edges.length; index += 1) {
    const edge = edges[index];
    const absolute = CAPTURED_MATH_ABS(edgeLength(candidate, edge.a, edge.b) - edge.restLength);
    const relative = absolute / edge.restLength;
    maximumRelativeLengthError = CAPTURED_MATH_MAX(maximumRelativeLengthError, relative);
    maximumAbsoluteLengthErrorM = CAPTURED_MATH_MAX(maximumAbsoluteLengthErrorM, absolute);
    relativeSquared += relative * relative;
    absoluteSquared += absolute * absolute;
  }
  return CAPTURED_OBJECT_FREEZE({
    edgeCount: edges.length,
    maximumRelativeLengthError,
    rootMeanSquareRelativeLengthError: CAPTURED_MATH_SQRT(relativeSquared / edges.length),
    maximumAbsoluteLengthErrorM,
    rootMeanSquareAbsoluteLengthErrorM: CAPTURED_MATH_SQRT(absoluteSquared / edges.length),
  });
}

function measureTriangles(
  candidate: Float32Array,
  triangles: readonly RestTriangle[],
  orientationGuardRollbackCount: number,
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
): BetaSkirtPrimitiveTriangleRestMetricsV4 {
  let minimumAreaRatio = Infinity;
  let maximumAreaRatio = 0;
  let normalReversalCount = 0;
  let degenerateTriangleCount = 0;
  for (let index = 0; index < triangles.length; index += 1) {
    const triangle = triangles[index];
    const cross = triangleCross(candidate, triangle.a, triangle.b, triangle.c);
    const area = CAPTURED_MATH_HYPOT(cross[0], cross[1], cross[2]);
    const ratio = area / triangle.restDoubleArea;
    minimumAreaRatio = CAPTURED_MATH_MIN(minimumAreaRatio, ratio);
    maximumAreaRatio = CAPTURED_MATH_MAX(maximumAreaRatio, ratio);
    if (!(area > policy.absoluteEpsilonM * policy.absoluteEpsilonM)) degenerateTriangleCount += 1;
    const orientationDot =
      cross[0] * triangle.restCross[0] +
      cross[1] * triangle.restCross[1] +
      cross[2] * triangle.restCross[2];
    if (!(orientationDot > policy.barycentricTolerance * triangle.restDoubleArea * area))
      normalReversalCount += 1;
  }
  return CAPTURED_OBJECT_FREEZE({
    triangleCount: triangles.length,
    minimumAreaRatio,
    maximumAreaRatio,
    normalReversalCount,
    degenerateTriangleCount,
    orientationGuardRollbackCount,
  });
}

function allTriangleOrientationsValid(
  positions: Float64Array,
  triangles: readonly RestTriangle[],
  policy: BetaSkirtPrimitiveContactRelaxationPolicyV4,
): boolean {
  for (let index = 0; index < triangles.length; index += 1) {
    const triangle = triangles[index];
    const cross = triangleCross(positions, triangle.a, triangle.b, triangle.c);
    const area = CAPTURED_MATH_HYPOT(cross[0], cross[1], cross[2]);
    if (!(area > policy.absoluteEpsilonM * policy.absoluteEpsilonM)) return false;
    const dot =
      cross[0] * triangle.restCross[0] +
      cross[1] * triangle.restCross[1] +
      cross[2] * triangle.restCross[2];
    if (!(dot > policy.barycentricTolerance * triangle.restDoubleArea * area)) return false;
  }
  return true;
}

function measureSeams(
  source: Float32Array,
  candidate: Float32Array,
  pairs: Uint32Array,
  exactValidatedSnapshotBound: boolean,
): BetaSkirtPrimitiveSeamMetricsV4 {
  let maximum = 0;
  let squared = 0;
  const pairIndexLength = typedArrayLength(pairs);
  for (let offset = 0; offset < pairIndexLength; offset += 2) {
    const a = pairs[offset];
    const b = pairs[offset + 1];
    const mismatch = CAPTURED_MATH_HYPOT(
      candidate[a * 3] - source[a * 3] - (candidate[b * 3] - source[b * 3]),
      candidate[a * 3 + 1] - source[a * 3 + 1] - (candidate[b * 3 + 1] - source[b * 3 + 1]),
      candidate[a * 3 + 2] - source[a * 3 + 2] - (candidate[b * 3 + 2] - source[b * 3 + 2]),
    );
    maximum = CAPTURED_MATH_MAX(maximum, mismatch);
    squared += mismatch * mismatch;
  }
  const pairCount = pairIndexLength / 2;
  return CAPTURED_OBJECT_FREEZE({
    pairCount,
    maximumDisplacementMismatchM: maximum,
    rootMeanSquareDisplacementMismatchM:
      pairCount === 0 ? 0 : CAPTURED_MATH_SQRT(squared / pairCount),
    exactValidatedSnapshotBound,
  });
}

function pushOnce(
  blockers: BetaSkirtPrimitiveContactRelaxationBlockerV4[],
  value: BetaSkirtPrimitiveContactRelaxationBlockerV4,
): void {
  if (!arrayIncludes(blockers, value)) arrayPush(blockers, value);
}

function fnv1a64Parts(prefix: string, parts: readonly string[]): string {
  let hash = 0xcbf29ce484222325n;
  const update = (byte: number) => {
    hash ^= apply<bigint>(CAPTURED_BIGINT, undefined, [byte]);
    hash = apply<bigint>(CAPTURED_BIGINT_AS_UINT_N, CAPTURED_BIGINT, [64, hash * 0x100000001b3n]);
  };
  for (let partIndex = -1; partIndex < parts.length; partIndex += 1) {
    const value = partIndex < 0 ? prefix : parts[partIndex];
    for (let index = 0; index < value.length; index += 1) {
      const code = apply<number>(CAPTURED_STRING_CHAR_CODE_AT, value, [index]);
      update(code & 0xff);
      update((code >>> 8) & 0xff);
    }
    update(0);
  }
  return `${prefix}-fnv1a64:${bigintHex64(hash)}`;
}

function bigintHex64(value: bigint): string {
  const raw = apply<string>(CAPTURED_BIGINT_TO_STRING, value, [16]);
  let result = '';
  for (let index = raw.length; index < 16; index += 1) result += '0';
  return result + raw;
}

function fnvGeometry(
  prefix: string,
  positions: Float32Array,
  triangles: Uint32Array,
  parts: readonly string[],
): string {
  let hash = 0xcbf29ce484222325n;
  const scratch = new CAPTURED_DATA_VIEW(new CAPTURED_ARRAY_BUFFER(4));
  const update = (byte: number) => {
    hash ^= apply<bigint>(CAPTURED_BIGINT, undefined, [byte]);
    hash = apply<bigint>(CAPTURED_BIGINT_AS_UINT_N, CAPTURED_BIGINT, [64, hash * 0x100000001b3n]);
  };
  const updateString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      const code = apply<number>(CAPTURED_STRING_CHAR_CODE_AT, value, [index]);
      update(code & 0xff);
      update((code >>> 8) & 0xff);
    }
    update(0);
  };
  updateString(prefix);
  const positionLength = typedArrayLength(positions);
  for (let index = 0; index < positionLength; index += 1) {
    const value = positions[index];
    apply(CAPTURED_DATA_VIEW_SET_FLOAT32, scratch, [0, value, true]);
    for (let byte = 0; byte < 4; byte += 1)
      update(apply<number>(CAPTURED_DATA_VIEW_GET_UINT8, scratch, [byte]));
  }
  const triangleLength = typedArrayLength(triangles);
  for (let index = 0; index < triangleLength; index += 1) {
    const value = triangles[index];
    apply(CAPTURED_DATA_VIEW_SET_UINT32, scratch, [0, value, true]);
    for (let byte = 0; byte < 4; byte += 1)
      update(apply<number>(CAPTURED_DATA_VIEW_GET_UINT8, scratch, [byte]));
  }
  for (let index = 0; index < parts.length; index += 1) updateString(parts[index]);
  return `${prefix}-fnv1a64:${bigintHex64(hash)}`;
}

function evaluateQuality(
  snapshot: OwnedInput,
  candidate: Float32Array,
): BetaSkirtCoherentEnvelopeQualityReportV1 {
  try {
    return evaluateBetaSkirtCoherentEnvelopeQualityV1({
      sourcePositionsM: copyFloat32(snapshot.positions),
      sourceTriangles: copyUint32(snapshot.triangles),
      candidatePositionsM: copyFloat32(candidate),
      candidateTriangles: copyUint32(snapshot.triangles),
      ...(snapshot.transform ? { transform: snapshot.transform } : {}),
      ...(snapshot.radialAxisXZ ? { radialAxisXZ: snapshot.radialAxisXZ } : {}),
    });
  } catch (reason) {
    if (reason instanceof BetaSkirtCoherentEnvelopeQualityErrorV1)
      fail(
        reason.code === 'resource-cap-exceeded'
          ? 'resource-cap-exceeded'
          : 'source-geometry-invalid',
        reason.message,
      );
    throw reason;
  }
}

function maximumWorldDisplacement(
  source: Float32Array,
  candidate: Float32Array,
  transform: BetaSkirtCoherentEnvelopeQualityTransformV1 | undefined,
): number {
  const scale = transform?.uniformScale ?? 1;
  const length = typedArrayLength(source);
  let maximum = 0;
  for (let offset = 0; offset < length; offset += 3) {
    const dx = (candidate[offset] - source[offset]) * scale;
    const dy = (candidate[offset + 1] - source[offset + 1]) * scale;
    const dz = (candidate[offset + 2] - source[offset + 2]) * scale;
    maximum = CAPTURED_MATH_MAX(maximum, CAPTURED_MATH_HYPOT(dx, dy, dz));
  }
  return maximum;
}

function qualityCriticalEvidenceMatches(
  quality: BetaSkirtCoherentEnvelopeQualityReportV1,
  maximumWorldDisplacementM: number,
  triangleRest: BetaSkirtPrimitiveTriangleRestMetricsV4,
  transform: BetaSkirtCoherentEnvelopeQualityTransformV1 | undefined,
  toleranceM: number,
): boolean {
  const displacement = quality.displacement;
  const edge = quality.edge;
  const triangle = quality.triangle;
  const expectedScale = transform?.uniformScale ?? 1;
  const expectedTranslation = transform?.translationM ?? ([0, 0, 0] as const);
  return (
    quality.status === 'measured-structural-evidence' &&
    quality.coordinateFrame === 'rendered-world-meters' &&
    quality.transform.uniformScale === expectedScale &&
    quality.transform.translationM[0] === expectedTranslation[0] &&
    quality.transform.translationM[1] === expectedTranslation[1] &&
    quality.transform.translationM[2] === expectedTranslation[2] &&
    quality.topology.vertexCountPreserved &&
    quality.topology.triangleCountPreserved &&
    quality.topology.triangleIndexOrderPreserved &&
    quality.topology.vertexOrderPreservedByIndexContract &&
    edge !== null &&
    edge.candidateZeroLengthEdgeCount === 0 &&
    triangle !== null &&
    triangle.candidateDegenerateTriangleCount === triangleRest.degenerateTriangleCount &&
    triangle.normalReversalCount === triangleRest.normalReversalCount &&
    displacement !== null &&
    CAPTURED_NUMBER_IS_FINITE(displacement.maximumDisplacementM) &&
    CAPTURED_MATH_ABS(displacement.maximumDisplacementM - maximumWorldDisplacementM) <=
      toleranceM &&
    quality.blockers.length === 0
  );
}

function sortComparisonUpperBound(count: number): number {
  return count <= 1 ? 0 : count * CAPTURED_MATH_CEIL(CAPTURED_MATH_LOG2(count));
}

function sha256RoundOperationCount(byteLength: number): number {
  return CAPTURED_MATH_CEIL((byteLength + 9) / 64) * 64;
}

function countPinned(mask: Uint8Array): number {
  let count = 0;
  const length = typedArrayLength(mask);
  for (let index = 0; index < length; index += 1) count += mask[index];
  return count;
}

function authorityOperationCount(snapshot: OwnedInput): number {
  const positionLength = typedArrayLength(snapshot.positions);
  const triangleLength = typedArrayLength(snapshot.triangles);
  const seamIndexLength = typedArrayLength(snapshot.seamPairs);
  const seamPairCount = seamIndexLength / 2;
  const seamAuthorityBytes = 48 + 12 + positionLength * 4 + triangleLength * 4 + seamPairCount * 8;
  const structuralAuthorityBytes = 48 + 130 + 4 + snapshot.primitiveWitnesses.length * 118;
  const positionComponentBytes = 4 + positionLength * 4;
  const triangleComponentBytes = 4 + triangleLength * 4;
  const positionDigestBytes =
    BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.worldPositions.length + positionComponentBytes;
  const triangleDigestBytes =
    BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.triangles.length + triangleComponentBytes;
  const geometryDigestBytes =
    BETA_SKIRT_V4_SOLVER_SOURCE_HASH_DOMAINS.geometry.length +
    positionComponentBytes +
    triangleComponentBytes;
  const solverStructuralBytes = 48 + 64 * 6 + 6;
  return (
    positionLength +
    triangleLength +
    snapshot.primitiveWitnesses.length * 48 +
    snapshot.legacyVertexContacts.length * 16 +
    seamIndexLength +
    countPinned(snapshot.pinned) +
    sortComparisonUpperBound(seamPairCount) +
    sortComparisonUpperBound(snapshot.primitiveWitnesses.length) +
    seamAuthorityBytes +
    structuralAuthorityBytes +
    positionDigestBytes +
    triangleDigestBytes +
    geometryDigestBytes +
    solverStructuralBytes +
    sha256RoundOperationCount(seamAuthorityBytes) +
    sha256RoundOperationCount(structuralAuthorityBytes) +
    sha256RoundOperationCount(positionDigestBytes) +
    sha256RoundOperationCount(triangleDigestBytes) +
    sha256RoundOperationCount(geometryDigestBytes) +
    sha256RoundOperationCount(solverStructuralBytes)
  );
}

function graphOperationCount(
  snapshot: OwnedInput,
  graph: Readonly<{
    edges: readonly Edge[];
    triangles: readonly RestTriangle[];
    adjacencyIncidenceCount: number;
  }>,
): number {
  return (
    typedArrayLength(snapshot.triangles) * 12 +
    graph.edges.length * 10 +
    graph.adjacencyIncidenceCount * 2 +
    sortComparisonUpperBound(graph.edges.length) +
    graph.adjacencyIncidenceCount *
      CAPTURED_MATH_CEIL(CAPTURED_MATH_LOG2(CAPTURED_MATH_MAX(2, graph.edges.length)))
  );
}

function canonicalizationOperationCount(constraints: readonly ContactConstraint[]): number {
  let supportIncidenceCount = 0;
  for (let index = 0; index < constraints.length; index += 1)
    supportIncidenceCount += constraints[index].support.length;
  return (
    constraints.length * 16 +
    supportIncidenceCount * 10 +
    sortComparisonUpperBound(constraints.length) +
    constraints.length * 8
  );
}

function finalizationOperationCount(
  snapshot: OwnedInput,
  graph: Readonly<{ edges: readonly Edge[]; triangles: readonly RestTriangle[] }>,
  constraints: readonly ContactConstraint[],
): number {
  let supportIncidenceCount = 0;
  for (let index = 0; index < constraints.length; index += 1)
    supportIncidenceCount += constraints[index].support.length;
  return (
    typedArrayLength(snapshot.positions) * 12 +
    typedArrayLength(snapshot.triangles) * 12 +
    graph.edges.length * 12 +
    graph.triangles.length * 18 +
    constraints.length * 8 +
    supportIncidenceCount * 8 +
    (typedArrayLength(snapshot.seamPairs) / 2) * 12 +
    sha256RoundOperationCount(
      typedArrayByteLength(snapshot.positions) + typedArrayByteLength(snapshot.triangles) + 256,
    )
  );
}

/**
 * Produces a bounded, rollback-only generalized-contact candidate. It never evaluates or claims
 * exact body/garment clearance; the returned candidate must pass the external exact gate.
 */
export function createBetaSkirtPrimitiveContactRelaxationCandidateV4(
  input: BetaSkirtPrimitiveContactRelaxationInputV4,
  options: BetaSkirtPrimitiveContactRelaxationOptionsV4 = {},
): BetaSkirtPrimitiveContactRelaxationCandidateV4 {
  const optionsRecord = exactPlainRecord(options, [], ['policy'], 'options');
  const policy = snapshotPolicy(
    optionsRecord.policy as BetaSkirtPrimitiveContactRelaxationPolicyV4 | undefined,
  );
  const snapshot = snapshotInput(input, policy);
  const graph = buildRestGeometry(snapshot, policy);
  const canonical = canonicalConstraints(snapshot);
  const constraints = canonical.constraints;
  const authorityOperations = authorityOperationCount(snapshot);
  const graphOperations = graphOperationCount(snapshot, graph);
  const canonicalizationOperations = canonicalizationOperationCount(constraints);
  const finalizationOperations = finalizationOperationCount(snapshot, graph, constraints);
  const mandatoryRoundOperations =
    authorityOperations + graphOperations + canonicalizationOperations + finalizationOperations;
  if (snapshot.aggregateBefore.operationCount + mandatoryRoundOperations > policy.maximumOperations)
    fail(
      'resource-cap-exceeded',
      'Authority, graph, canonicalization, quality, metrics, and hash phases exceed the operation cap.',
    );
  const opposingGroupCount = opposingConstraintGroupCount(constraints, policy.absoluteEpsilonM);
  const blockers: BetaSkirtPrimitiveContactRelaxationBlockerV4[] = [];
  if (snapshot.primitiveWitnesses.length === 0) pushOnce(blockers, 'primitive-witness-set-empty');
  if (
    snapshot.previousStructuralWitnessSetSha256 === snapshot.solverStructuralWitnessSetSha256 &&
    snapshot.previousStructuralWitnessSetSha256 !== null
  )
    pushOnce(blockers, 'repeated-structural-witness-set');
  if (!snapshot.exactSeamSnapshotBound) pushOnce(blockers, 'seam-constraints-unbound');
  if (opposingGroupCount > 0) pushOnce(blockers, 'opposing-contact-constraints');
  if (snapshot.aggregateBefore.outerRoundCount >= policy.maximumOuterRoundCount)
    pushOnce(blockers, 'outer-round-budget-exhausted');
  if (snapshot.aggregateBefore.iterationCount >= policy.maximumTotalIterationCount)
    pushOnce(blockers, 'iteration-budget-exhausted');
  if (snapshot.aggregateBefore.exactDistanceTestCount >= policy.maximumExactDistanceTestCount)
    pushOnce(blockers, 'exact-distance-test-budget-exhausted');
  if (snapshot.aggregateBefore.exactRayTestCount >= policy.maximumExactRayTestCount)
    pushOnce(blockers, 'exact-ray-test-budget-exhausted');

  const source = snapshot.positions;
  let current: Float64Array = copyFloat64(source);
  const sourceLength = typedArrayLength(source);
  let scratch: Float64Array = new CAPTURED_FLOAT64_ARRAY(sourceLength);
  const lastValid = new CAPTURED_FLOAT64_ARRAY(sourceLength);
  let roundIterationCount = 0;
  let roundOperationCount = mandatoryRoundOperations;
  let solverOperationCount = 0;
  let displacementClampCount = 0;
  let orientationGuardRollbackCount = 0;
  const vertexCount = sourceLength / 3;
  let supportIncidenceCount = 0;
  for (let index = 0; index < constraints.length; index += 1)
    supportIncidenceCount += constraints[index].support.length;
  const triangleConstraintOperations = graph.triangles.length * 60 * policy.triangleRestPassCount;
  const contactProjectionOperations = constraints.length * 12 + supportIncidenceCount * 18;
  const operationsPerIteration =
    typedArrayLength(current) * 3 +
    vertexCount * 6 +
    graph.adjacencyIncidenceCount * 3 +
    graph.edges.length * 16 * policy.edgePassCount +
    triangleConstraintOperations +
    (typedArrayLength(snapshot.seamPairs) / 2) * 16 +
    contactProjectionOperations * 2 +
    vertexCount * 16 +
    graph.triangles.length * 14;
  const hardStopBlockers: readonly BetaSkirtPrimitiveContactRelaxationBlockerV4[] = [
    'repeated-structural-witness-set',
    'opposing-contact-constraints',
    'outer-round-budget-exhausted',
    'iteration-budget-exhausted',
    'operation-budget-exhausted',
    'exact-distance-test-budget-exhausted',
    'exact-ray-test-budget-exhausted',
  ];
  const hardStopBeforeSolve = arraySome(blockers, (blocker) =>
    arrayIncludes(hardStopBlockers, blocker),
  );
  if (!hardStopBeforeSolve) {
    const availableIterations = CAPTURED_MATH_MIN(
      policy.innerIterationCount,
      policy.maximumTotalIterationCount - snapshot.aggregateBefore.iterationCount,
    );
    for (let iteration = 0; iteration < availableIterations; iteration += 1) {
      if (
        snapshot.aggregateBefore.operationCount + roundOperationCount + operationsPerIteration >
        policy.maximumOperations
      ) {
        pushOnce(blockers, 'operation-budget-exhausted');
        break;
      }
      roundIterationCount += 1;
      roundOperationCount += operationsPerIteration;
      solverOperationCount += operationsPerIteration;

      copyFloat64Into(lastValid, current);
      copyFloat64Into(scratch, current);
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        if (isPinned(snapshot.pinned, vertex)) continue;
        const neighbors = graph.adjacency[vertex];
        if (neighbors.length === 0) continue;
        for (let axis = 0; axis < 3; axis += 1) {
          let neighborDisplacement = 0;
          for (let neighborIndex = 0; neighborIndex < neighbors.length; neighborIndex += 1) {
            const neighbor = neighbors[neighborIndex];
            neighborDisplacement += current[neighbor * 3 + axis] - source[neighbor * 3 + axis];
          }
          neighborDisplacement /= neighbors.length;
          const ownDisplacement = current[vertex * 3 + axis] - source[vertex * 3 + axis];
          scratch[vertex * 3 + axis] =
            source[vertex * 3 + axis] +
            ownDisplacement +
            (neighborDisplacement - ownDisplacement) * policy.displacementSmoothing;
        }
      }
      const priorCurrent = current;
      current = scratch;
      scratch = priorCurrent;

      for (let pass = 0; pass < policy.edgePassCount; pass += 1) {
        for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex += 1) {
          const edge = graph.edges[edgeIndex];
          projectEdge(
            current,
            edge.a,
            edge.b,
            edge.restLength,
            policy.edgeStiffness,
            snapshot.pinned,
            policy.absoluteEpsilonM,
          );
        }
      }

      for (let triangleIndex = 0; triangleIndex < graph.triangles.length; triangleIndex += 1) {
        const triangle = graph.triangles[triangleIndex];
        if (
          projectTriangleRestShape(
            current,
            triangle,
            policy.triangleRestStiffness,
            snapshot.pinned,
            policy.absoluteEpsilonM,
            policy.barycentricTolerance,
          )
        )
          orientationGuardRollbackCount += 1;
      }

      const seamIndexLength = typedArrayLength(snapshot.seamPairs);
      for (let offset = 0; offset < seamIndexLength; offset += 2) {
        const a = snapshot.seamPairs[offset];
        const b = snapshot.seamPairs[offset + 1];
        const aPinned = isPinned(snapshot.pinned, a);
        const bPinned = isPinned(snapshot.pinned, b);
        for (let axis = 0; axis < 3; axis += 1) {
          const da = current[a * 3 + axis] - source[a * 3 + axis];
          const db = current[b * 3 + axis] - source[b * 3 + axis];
          const difference = (db - da) * policy.seamDisplacementStiffness;
          if (!aPinned) current[a * 3 + axis] += difference * (bPinned ? 1 : 0.5);
          if (!bPinned) current[b * 3 + axis] -= difference * (aPinned ? 1 : 0.5);
        }
      }

      for (let constraintIndex = 0; constraintIndex < constraints.length; constraintIndex += 1)
        projectContact(current, constraints[constraintIndex], policy, snapshot.pinned);

      for (let triangleIndex = 0; triangleIndex < graph.triangles.length; triangleIndex += 1) {
        const triangle = graph.triangles[triangleIndex];
        if (
          projectTriangleRestShape(
            current,
            triangle,
            policy.triangleRestStiffness,
            snapshot.pinned,
            policy.absoluteEpsilonM,
            policy.barycentricTolerance,
          )
        )
          orientationGuardRollbackCount += 1;
      }

      for (let constraintIndex = 0; constraintIndex < constraints.length; constraintIndex += 1)
        projectContact(current, constraints[constraintIndex], policy, snapshot.pinned);

      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const offset = vertex * 3;
        if (isPinned(snapshot.pinned, vertex)) {
          current[offset] = source[offset];
          current[offset + 1] = source[offset + 1];
          current[offset + 2] = source[offset + 2];
          continue;
        }
        const dx = current[offset] - source[offset];
        const dy = current[offset + 1] - source[offset + 1];
        const dz = current[offset + 2] - source[offset + 2];
        const displacement = CAPTURED_MATH_HYPOT(dx, dy, dz);
        if (displacement > policy.maximumDisplacementM) {
          const scale = policy.maximumDisplacementM / displacement;
          current[offset] = source[offset] + dx * scale;
          current[offset + 1] = source[offset + 1] + dy * scale;
          current[offset + 2] = source[offset + 2] + dz * scale;
          displacementClampCount += 1;
        }
      }
      if (!allTriangleOrientationsValid(current, graph.triangles, policy)) {
        copyFloat64Into(current, lastValid);
        orientationGuardRollbackCount += 1;
      }
    }
  }

  const candidate = toFloat32(current);
  const quality = evaluateQuality(snapshot, candidate);
  const residuals = measureContactResiduals(
    source,
    candidate,
    constraints,
    policy.absoluteEpsilonM,
  );
  const restEdge = measureRestEdges(candidate, graph.edges);
  const triangleRest = measureTriangles(
    candidate,
    graph.triangles,
    orientationGuardRollbackCount,
    policy,
  );
  const seam = measureSeams(source, candidate, snapshot.seamPairs, snapshot.exactSeamSnapshotBound);
  const maximumWorldDisplacementM = maximumWorldDisplacement(source, candidate, snapshot.transform);
  if (residuals.violatingAfterCount > 0) pushOnce(blockers, 'residual-contact-constraint');
  if (maximumWorldDisplacementM > policy.maximumDisplacementM + policy.absoluteEpsilonM)
    pushOnce(blockers, 'maximum-displacement-exceeded');
  if (
    restEdge.maximumRelativeLengthError >
    policy.maximumEdgeRelativeError + policy.absoluteEpsilonM
  )
    pushOnce(blockers, 'edge-relative-error-exceeded');
  if (
    triangleRest.minimumAreaRatio < policy.minimumTriangleAreaRatio - policy.absoluteEpsilonM ||
    triangleRest.maximumAreaRatio > policy.maximumTriangleAreaRatio + policy.absoluteEpsilonM
  )
    pushOnce(blockers, 'triangle-area-ratio-exceeded');
  if (triangleRest.normalReversalCount > 0 || triangleRest.orientationGuardRollbackCount > 0)
    pushOnce(blockers, 'triangle-normal-reversal');
  if (triangleRest.degenerateTriangleCount > 0) pushOnce(blockers, 'triangle-degenerate');
  if (
    !qualityCriticalEvidenceMatches(
      quality,
      maximumWorldDisplacementM,
      triangleRest,
      snapshot.transform,
      policy.absoluteEpsilonM,
    )
  )
    pushOnce(blockers, 'structural-quality-blocked');

  const rawContactCount = snapshot.primitiveWitnesses.length + snapshot.legacyVertexContacts.length;
  const aggregateAfter = CAPTURED_OBJECT_FREEZE({
    outerRoundCount: CAPTURED_MATH_MIN(
      policy.maximumOuterRoundCount,
      snapshot.aggregateBefore.outerRoundCount + (hardStopBeforeSolve ? 0 : 1),
    ),
    iterationCount: snapshot.aggregateBefore.iterationCount + roundIterationCount,
    operationCount: snapshot.aggregateBefore.operationCount + roundOperationCount,
    contactCount: snapshot.aggregateBefore.contactCount + rawContactCount,
    exactDistanceTestCount: snapshot.aggregateBefore.exactDistanceTestCount,
    exactRayTestCount: snapshot.aggregateBefore.exactRayTestCount,
  });
  const orderFingerprint = fnv1a64Parts(
    'bspcrcv4-order',
    arrayMap(constraints, (constraint) => constraint.key),
  );
  const sourceFingerprint = fnvGeometry('bspcrcv4-source', source, snapshot.triangles, [
    snapshot.solverStructuralWitnessSetSha256,
  ]);
  const candidateFingerprint = fnvGeometry('bspcrcv4-candidate', candidate, snapshot.triangles, [
    snapshot.solverStructuralWitnessSetSha256,
    orderFingerprint,
    capturedString(aggregateAfter.outerRoundCount),
    capturedString(aggregateAfter.iterationCount),
    capturedString(aggregateAfter.operationCount),
    arrayJoin(blockers, ','),
  ]);
  let oneVertexConstraintCount = 0;
  let twoVertexConstraintCount = 0;
  let threeVertexConstraintCount = 0;
  for (let index = 0; index < constraints.length; index += 1) {
    const constraint = constraints[index];
    if (constraint.support.length === 1) oneVertexConstraintCount += 1;
    else if (constraint.support.length === 2) twoVertexConstraintCount += 1;
    else if (constraint.support.length === 3) threeVertexConstraintCount += 1;
  }
  const contact = CAPTURED_OBJECT_FREEZE({
    rawPrimitiveWitnessCount: snapshot.primitiveWitnesses.length,
    rawLegacyVertexContactCount: snapshot.legacyVertexContacts.length,
    rawContactCount,
    uniqueConstraintCount: constraints.length,
    exactDuplicateConstraintCount: canonical.duplicateCount,
    oneVertexConstraintCount,
    twoVertexConstraintCount,
    threeVertexConstraintCount,
    opposingConstraintGroupCount: opposingGroupCount,
    violatingBeforeCount: residuals.violatingBeforeCount,
    violatingAfterCount: residuals.violatingAfterCount,
    minimumClearanceResidualBeforeM: residuals.minimumBefore,
    minimumClearanceResidualAfterM: residuals.minimumAfter,
    maximumDeficitBeforeM: residuals.maximumDeficitBefore,
    maximumDeficitAfterM: residuals.maximumDeficitAfter,
    deterministicOrderFingerprintFnv64: orderFingerprint,
  });

  return CAPTURED_OBJECT_FREEZE({
    version: BETA_SKIRT_PRIMITIVE_CONTACT_RELAXATION_CANDIDATE_V4,
    status:
      blockers.length === 0
        ? ('candidate-ready-for-exact-reevaluation' as const)
        : ('candidate-blocked' as const),
    positionsM: copyFloat32(candidate),
    triangles: copyUint32(snapshot.triangles),
    policy,
    quality,
    contact,
    restEdge,
    triangleRest,
    seam,
    aggregateBefore: snapshot.aggregateBefore,
    aggregateAfter,
    metrics: CAPTURED_OBJECT_FREEZE({
      roundIterationCount,
      roundOperationCount,
      mandatoryPreflightReservedOperationCount: snapshot.mandatoryPreflightReservedOperationCount,
      authorityOperationCount: authorityOperations,
      graphOperationCount: graphOperations,
      canonicalizationOperationCount: canonicalizationOperations,
      solverOperationCount,
      finalizationOperationCount: finalizationOperations,
      uniqueEdgeCount: graph.edges.length,
      displacementClampCount,
      maximumWorldDisplacementM,
      topologyIndicesPreserved: true as const,
      vertexOrderPreserved: true as const,
      deterministicConstraintOrderUsed: true as const,
      triangleRestPassCountPerIteration: 2 as const,
    }),
    audit: CAPTURED_OBJECT_FREEZE({
      garmentWorldPositionsSha256: snapshot.garmentWorldPositionsSha256,
      garmentTrianglesSha256: snapshot.garmentTrianglesSha256,
      solverSourceGeometrySha256: snapshot.solverSourceGeometrySha256,
      structuralWitnessSetSha256: snapshot.structuralWitnessSetSha256,
      solverStructuralWitnessSetSha256: snapshot.solverStructuralWitnessSetSha256,
      previousStructuralWitnessSetSha256: snapshot.previousStructuralWitnessSetSha256,
      sourceGeometryFingerprintFnv64: sourceFingerprint,
      candidateFingerprintFnv64: candidateFingerprint,
      hashAuthority: 'diagnostic-fnv1a64-not-cryptographic-authority' as const,
    }),
    rollback: CAPTURED_OBJECT_FREEZE({
      required: true as const,
      reason: 'external-exact-reevaluation-required' as const,
      sourcePositionsM: copyFloat32(source),
      displayMutationCommitted: false as const,
    }),
    blockers: CAPTURED_OBJECT_FREEZE(blockers),
    requiredNextGate: 'external-exact-body-garment-and-self-collision-reevaluation' as const,
    claims: CAPTURED_OBJECT_FREEZE({
      exactOwnedSnapshotsUsed: true as const,
      moduleInitAuthorityIntrinsicsTrusted: true as const,
      preloadAuthorityIntrinsicIntegrityVerified: false as const,
      generalizedOneTwoThreeVertexProjectionUsed: true as const,
      legacyV3SeedUsed: false as const,
      barycentricSquaredWeightDistributionUsed: true as const,
      perTriangleRestShapeProjectionUsed: true as const,
      deterministicConstraintOrderingUsed: true as const,
      exactValidatedSeamSnapshotSupplied: snapshot.exactSeamSnapshotBound,
      assemblySeamConstraintsBound: snapshot.exactSeamSnapshotBound,
      seamPreservationClaimed: false as const,
      exactRenderedBodyCollisionMeasured: false as const,
      collisionClearClaimed: false as const,
      externalExactReevaluationRequired: true as const,
      topologyAndIndexOrderPreserved: true as const,
      distortionThresholdsEnforced: true as const,
      publicationRollbackRequired: true as const,
      displayMutationCommitted: false as const,
      initializationAdmitted: false as const,
      fitClaimed: false as const,
      runtimeAuthorityClaimed: false as const,
      productionAuthorityClaimed: false as const,
    }),
  });
}
