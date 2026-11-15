import {
  GARMENT_PHASE2_SAMPLED_CLOTH_MESH_UPGRADER_V1,
  upgradeGarmentPhase2SampledClothMeshV1,
  type GarmentPhase2BoundaryLoopV1,
  type GarmentPhase2BoundaryVertexBindingV1,
  type GarmentPhase2SampledClothMeshArtifactV1,
  type GarmentPhase2SampledClothMeshUpgradeRequestV1,
} from './garment-phase2-sampled-cloth-mesh-upgrader-v1';
import {
  evaluatePhase2BoundarySamplingArtifactV1,
  Phase2BoundarySamplingErrorV1,
  type Phase2BoundarySamplingArtifactV1,
  type Phase2BoundarySamplingEvaluationV1,
  type Phase2BoundarySamplingRequestV1,
} from './triangulation/phase2-boundary-sampling-v1';
import type { BoundaryVertexSource, OutputVertexSource } from './triangulation/types';

export const GARMENT_PHASE2_BOUNDARY_RECOVERY_V1 = 'garment-phase2-boundary-recovery/1' as const;
export const GARMENT_PHASE2_BOUNDARY_RECOVERY_REQUEST_V1 =
  'garment-phase2-boundary-recovery-request/1' as const;
export const GARMENT_PHASE2_BOUNDARY_RECOVERY_EVALUATION_V1 =
  'garment-phase2-boundary-recovery-evaluation/1' as const;
export const GARMENT_BOUNDARY_MESH_POLICY_V1 = 'garment-boundary-mesh-policy/1' as const;

export const GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1 = Object.freeze({
  maximumDepth: 32,
  maximumNodes: 300_000,
  maximumProperties: 1_200_000,
  maximumArrayLength: 300_000,
  maximumTypedArrayLength: 1_000_000,
  maximumStringLength: 1_024,
  maximumPieces: 64,
  maximumLoops: 256,
  maximumPhase2Vertices: 8_192,
  maximumRecoveredVertices: 20_000,
  maximumSamplesPerPhase2Interval: 4_096,
  maximumSubdivisionCandidates: 1_000_000,
  maximumSubdivisionSegmentChecks: 1_000_000,
  maximumSeams: 512,
  maximumSeamPairs: 20_000,
  phase2VertexSnapshotNodeAllowance: 16,
  phase2VertexSnapshotPropertyAllowance: 40,
  recoveredVertexSnapshotNodeAllowance: 8,
  recoveredVertexSnapshotPropertyAllowance: 24,
  seamPairSnapshotNodeAllowance: 3,
  seamPairSnapshotPropertyAllowance: 8,
  snapshotNodeHeadroom: 40_000,
  snapshotPropertyHeadroom: 200_000,
  maximumErrorDetails: 32,
} as const);

export type GarmentBoundaryMeshPolicyV1 = Readonly<{
  version: typeof GARMENT_BOUNDARY_MESH_POLICY_V1;
  policyId: string;
  revision: string;
  minEdgeMm: number;
  maxEdgeMm: number;
}>;

export type GarmentPhase2BoundaryRecoveryRequestInputV1 = Readonly<{
  version: typeof GARMENT_PHASE2_BOUNDARY_RECOVERY_REQUEST_V1;
  phase2UpgradeRequest: GarmentPhase2SampledClothMeshUpgradeRequestV1;
  phase2Artifact: GarmentPhase2SampledClothMeshArtifactV1;
  materialPolicy: GarmentBoundaryMeshPolicyV1;
}>;

declare const garmentPhase2BoundaryRecoveryRequestBrandV1: unique symbol;

export type GarmentPhase2BoundaryRecoveryRequestV1 = GarmentPhase2BoundaryRecoveryRequestInputV1 &
  Readonly<{ [garmentPhase2BoundaryRecoveryRequestBrandV1]: true }>;

export type GarmentPhase2PreservedBoundarySourceV1 = Readonly<{
  kind: 'phase2-boundary';
  phase2Source: OutputVertexSource;
}>;

export type GarmentPhase2RecoveredBoundarySourceV1 = Readonly<{
  kind: 'recovered-boundary-sample';
  edgeId: string;
  parentInterval: Readonly<{
    startSampledBoundaryVertexId: string;
    endSampledBoundaryVertexId: string;
  }>;
  localFraction: Readonly<{ numerator: number; denominator: number }>;
  provenance: BoundaryVertexSource;
}>;

export type GarmentPhase2RecoveredBoundaryVertexV1 = Readonly<{
  boundaryVertexId: string;
  positionMm: readonly [number, number];
  source: GarmentPhase2PreservedBoundarySourceV1 | GarmentPhase2RecoveredBoundarySourceV1;
}>;

export type GarmentPhase2RecoveredBoundaryLoopV1 = Readonly<{
  pieceId: string;
  contourId: string;
  role: 'shell' | 'hole';
  phase2BoundaryVertexIds: readonly string[];
  recoveredBoundaryVertexIds: readonly string[];
  vertices: readonly GarmentPhase2RecoveredBoundaryVertexV1[];
  phase2VertexRecoveredIndices: Uint32Array;
  maximumRecoveredSegmentLengthMm: number;
  phase2OrderPreserved: true;
}>;

export type GarmentPhase2BoundaryRecoveryPieceV1 = Readonly<{
  pieceId: string;
  loops: readonly GarmentPhase2RecoveredBoundaryLoopV1[];
  phase2BoundaryVertexCount: number;
  insertedBoundaryRecoveryVertexCount: number;
  recoveredBoundaryVertexCount: number;
}>;

export type GarmentPhase2BoundaryVertexReferenceV1 = Readonly<{
  pieceId: string;
  boundaryVertexId: string;
}>;

export type GarmentPhase2BoundaryRecoverySeamV1 = Readonly<{
  seamId: string;
  mapping: 'equal';
  lengthRatio: 1;
  phase2GlobalVertexPairs: Uint32Array;
  phase2BoundaryVertexPairs: readonly (readonly [
    GarmentPhase2BoundaryVertexReferenceV1,
    GarmentPhase2BoundaryVertexReferenceV1,
  ])[];
  recoveredBoundaryVertexPairs: readonly (readonly [
    GarmentPhase2BoundaryVertexReferenceV1,
    GarmentPhase2BoundaryVertexReferenceV1,
  ])[];
  phase2PairRecoveredIndices: Uint32Array;
  phase2PairsPreservedAsOrderedSubsequence: true;
}>;

export type GarmentPhase2BoundaryRecoveryArtifactV1 = Readonly<{
  version: typeof GARMENT_PHASE2_BOUNDARY_RECOVERY_V1;
  status: 'accepted';
  phase2Upgrader: typeof GARMENT_PHASE2_SAMPLED_CLOTH_MESH_UPGRADER_V1;
  phase2UpgradeFingerprint: string;
  phase2BaselineCompilerFingerprint: string;
  phase2SamplingFingerprint: string;
  sourceBinding: GarmentPhase2SampledClothMeshArtifactV1['sourceBinding'];
  materialPolicy: GarmentBoundaryMeshPolicyV1;
  pieces: readonly GarmentPhase2BoundaryRecoveryPieceV1[];
  seams: readonly GarmentPhase2BoundaryRecoverySeamV1[];
  maximumRecoveredBoundarySegmentLengthMm: number;
  minimumRecoveredBoundarySegmentLengthMm: number;
  maximumF32NativeLineProjectionErrorMm: number;
  deterministicFingerprint: string;
  claims: Readonly<{
    acceptanceRequired: true;
    freshPhase2UpgradeAccepted: true;
    existingPhase2BoundaryVerticesPreserved: true;
    nestedBoundaryRecoveryIntegrated: true;
    distributedEqualSeamPairsPreserved: true;
    materialMaximumBoundaryEdgeAccepted: true;
    materialMinimumBoundaryEdgeAccepted: true;
    f32NativeLineProjectionAccepted: true;
    sourceRevisionBound: false;
    sourceAuthenticityAccepted: false;
    curvedSourceEvaluationIntegrated: false;
    triangulatedMeshPublished: false;
    interiorRefinementIntegrated: false;
    bodyPlacementReady: false;
    runtimeIntegrated: false;
    settleAccepted: false;
    productionReady: false;
  }>;
  blockers: readonly [
    'acceptance-artifact-required',
    'phase-d-content-binding-not-integrated',
    'source-revision-not-represented-in-sampling-contract',
    'curved-source-evaluator-not-integrated',
    'interior-refinement-not-integrated',
    'triangulated-recovered-mesh-not-published',
    'body-placement-not-proven',
    'runtime-owner-not-integrated',
    'settle-not-evaluated',
    'production-qualification-not-run',
  ];
}>;

export type GarmentPhase2BoundaryRecoveryEvaluationV1 = Readonly<{
  version: typeof GARMENT_PHASE2_BOUNDARY_RECOVERY_EVALUATION_V1;
  status: 'accepted';
  canonicalArtifact: GarmentPhase2BoundaryRecoveryArtifactV1;
  independentRecoveryCallCount: 1;
  deterministicFingerprint: string;
  claims: Readonly<{
    requestLocalConsistencyAccepted: true;
    freshPhase2UpgradeExecuted: true;
    recoveryIndependentlyRebuilt: true;
    sourceAuthenticityAccepted: false;
    interiorRefinementIntegrated: false;
    runtimeIntegrated: false;
  }>;
  blockers: readonly [
    'phase-d-content-binding-not-integrated',
    'interior-refinement-not-integrated',
  ];
}>;

export type GarmentPhase2BoundaryRecoveryErrorCodeV1 =
  | 'reentrant-call'
  | 'input-shape-invalid'
  | 'resource-budget-exceeded'
  | 'phase2-upgrade-failed'
  | 'phase2-artifact-mismatch'
  | 'material-policy-invalid'
  | 'unsupported-source-geometry'
  | 'boundary-binding-mismatch'
  | 'seam-binding-mismatch'
  | 'f32-collapse'
  | 'native-line-projection-drift'
  | 'material-range-unsatisfiable'
  | 'artifact-mismatch'
  | 'output-invalid';

export class GarmentPhase2BoundaryRecoveryErrorV1 extends Error {
  readonly code: GarmentPhase2BoundaryRecoveryErrorCodeV1;
  readonly details: readonly string[];

  constructor(
    code: GarmentPhase2BoundaryRecoveryErrorCodeV1,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'GarmentPhase2BoundaryRecoveryErrorV1';
    this.code = code;
    this.details = Object.freeze(
      details
        .slice(0, GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumErrorDetails)
        .map((detail) =>
          detail.slice(0, GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumStringLength),
        ),
    );
  }
}

function fail(
  code: GarmentPhase2BoundaryRecoveryErrorCodeV1,
  message: string,
  details: readonly string[] = [],
): never {
  throw new GarmentPhase2BoundaryRecoveryErrorV1(code, message, details);
}

type RecoveryEnvelope = Readonly<{
  version: unknown;
  phase2UpgradeRequest: GarmentPhase2SampledClothMeshUpgradeRequestV1;
  phase2Artifact: unknown;
  materialPolicy: unknown;
}>;

const capturedStructuredClone =
  typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone.bind(globalThis)
    : null;

const ownedRecoveryRequests = new WeakMap<object, GarmentPhase2BoundaryRecoveryRequestV1>();

function exactDataObjectValues(
  value: unknown,
  expectedKeys: readonly string[],
  path: string,
): Record<string, unknown> {
  try {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    )
      fail('input-shape-invalid', `${path} must be one exact plain object.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const actual = keys.filter((key): key is string => typeof key === 'string').sort();
    const expected = [...expectedKeys].sort();
    if (
      actual.length !== keys.length ||
      actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])
    )
      fail('input-shape-invalid', `${path} has an unsupported property shape.`);
    const output: Record<string, unknown> = {};
    for (const key of expected) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('input-shape-invalid', `${path}.${key} must be enumerable own data.`);
      output[key] = descriptor.value;
    }
    return output;
  } catch (error) {
    if (error instanceof GarmentPhase2BoundaryRecoveryErrorV1) throw error;
    fail('input-shape-invalid', `${path} reflection failed closed.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

function extractEnvelope(value: unknown): RecoveryEnvelope {
  const envelope = exactDataObjectValues(
    value,
    ['materialPolicy', 'phase2Artifact', 'phase2UpgradeRequest', 'version'],
    'request',
  ) as RecoveryEnvelope;
  if (envelope.version !== GARMENT_PHASE2_BOUNDARY_RECOVERY_REQUEST_V1)
    fail('input-shape-invalid', 'Boundary recovery request version is unsupported.');
  return envelope;
}

function extractUpgradeRequestParts(value: unknown): Readonly<{
  baselineRequest: unknown;
  samplingRequest: Phase2BoundarySamplingRequestV1;
  samplingArtifact: unknown;
}> {
  return exactDataObjectValues(
    value,
    ['baselineRequest', 'samplingArtifact', 'samplingRequest'],
    'request.phase2UpgradeRequest',
  ) as Readonly<{
    baselineRequest: unknown;
    samplingRequest: Phase2BoundarySamplingRequestV1;
    samplingArtifact: unknown;
  }>;
}

type SnapshotState = {
  nodes: number;
  properties: number;
  active: Set<object>;
};

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;

function snapshotTypedArray(value: object, path: string, state: SnapshotState): unknown {
  if (!typedArrayLengthGetter || !typedArrayBufferGetter)
    fail('input-shape-invalid', `${path} cannot be inspected safely.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Uint32Array.prototype && prototype !== Float32Array.prototype)
    fail('input-shape-invalid', `${path} has an unsupported typed-array kind.`);
  let length: number;
  let buffer: ArrayBufferLike;
  try {
    length = typedArrayLengthGetter.call(value) as number;
    buffer = typedArrayBufferGetter.call(value) as ArrayBufferLike;
  } catch (error) {
    fail('input-shape-invalid', `${path} typed-array inspection failed closed.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  if (length > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumTypedArrayLength)
    fail('resource-budget-exceeded', `${path} exceeds the typed-array bound.`);
  if (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer)
    fail('input-shape-invalid', `${path} must not use shared storage.`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== length ||
    keys.some((key, index) => typeof key !== 'string' || key !== String(index))
  )
    fail('input-shape-invalid', `${path} has extra or non-canonical typed-array properties.`);
  state.nodes += 1;
  state.properties += length;
  if (
    state.nodes > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumNodes ||
    state.properties > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumProperties
  )
    fail('resource-budget-exceeded', `${path} exceeds the snapshot budget.`);
  const copy =
    prototype === Uint32Array.prototype
      ? Uint32Array.prototype.slice.call(value)
      : Float32Array.prototype.slice.call(value);
  for (const number of copy) {
    if (!Number.isFinite(number))
      fail('input-shape-invalid', `${path} contains a non-finite number.`);
  }
  return copy;
}

function snapshotPlainData(
  value: unknown,
  path: string,
  depth: number,
  state: SnapshotState,
): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('input-shape-invalid', `${path} must be finite.`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumStringLength)
      fail('resource-budget-exceeded', `${path} exceeds the string bound.`);
    return value;
  }
  if (typeof value !== 'object')
    fail('input-shape-invalid', `${path} is not plain serializable data.`);
  if (depth > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumDepth)
    fail('resource-budget-exceeded', `${path} exceeds the depth bound.`);
  if (state.active.has(value)) fail('input-shape-invalid', `${path} contains a cycle.`);
  if (ArrayBuffer.isView(value)) return snapshotTypedArray(value, path, state);
  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype))
    fail('input-shape-invalid', `${path} must contain only plain arrays and objects.`);
  state.active.add(value);
  state.nodes += 1;
  if (state.nodes > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumNodes)
    fail('resource-budget-exceeded', `${path} exceeds the node bound.`);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (isArray) {
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : -1;
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumArrayLength ||
        keys.length !== length + 1
      )
        fail('resource-budget-exceeded', `${path} has an invalid or excessive array length.`);
      const output: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          fail('input-shape-invalid', `${path} must be dense enumerable data.`);
        output.push(snapshotPlainData(descriptor.value, `${path}[${index}]`, depth + 1, state));
      }
      state.properties += length;
      if (state.properties > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumProperties)
        fail('resource-budget-exceeded', `${path} exceeds the property bound.`);
      return output;
    }
    // Preserve caller data-property insertion order because the accepted upstream triangulation
    // hash serializes already-canonical provenance records in that order.
    const stringKeys = keys.filter((key): key is string => typeof key === 'string');
    if (stringKeys.length !== keys.length)
      fail('input-shape-invalid', `${path} must not contain symbol properties.`);
    state.properties += stringKeys.length;
    if (state.properties > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumProperties)
      fail('resource-budget-exceeded', `${path} exceeds the property bound.`);
    const output: Record<string, unknown> = {};
    for (const key of stringKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('input-shape-invalid', `${path}.${key} must be enumerable own data.`);
      output[key] = snapshotPlainData(descriptor.value, `${path}.${key}`, depth + 1, state);
    }
    return output;
  } catch (error) {
    if (error instanceof GarmentPhase2BoundaryRecoveryErrorV1) throw error;
    fail('input-shape-invalid', `${path} snapshot failed closed.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  } finally {
    state.active.delete(value);
  }
}

function snapshotArtifact(value: unknown, path: string): GarmentPhase2SampledClothMeshArtifactV1 {
  return snapshotPlainData(value, path, 0, {
    nodes: 0,
    properties: 0,
    active: new Set(),
  }) as GarmentPhase2SampledClothMeshArtifactV1;
}

function snapshotRecoveryArtifact(
  value: unknown,
  path: string,
): GarmentPhase2BoundaryRecoveryArtifactV1 {
  return snapshotPlainData(value, path, 0, {
    nodes: 0,
    properties: 0,
    active: new Set(),
  }) as GarmentPhase2BoundaryRecoveryArtifactV1;
}

function snapshotMaterialPolicy(value: unknown): GarmentBoundaryMeshPolicyV1 {
  const exactPolicy = exactDataObjectValues(
    value,
    ['maxEdgeMm', 'minEdgeMm', 'policyId', 'revision', 'version'],
    'request.materialPolicy',
  );
  const policy = snapshotPlainData(exactPolicy, 'request.materialPolicy', 0, {
    nodes: 0,
    properties: 0,
    active: new Set(),
  }) as Partial<GarmentBoundaryMeshPolicyV1>;
  if (
    policy.version !== GARMENT_BOUNDARY_MESH_POLICY_V1 ||
    typeof policy.policyId !== 'string' ||
    policy.policyId.length === 0 ||
    typeof policy.revision !== 'string' ||
    policy.revision.length === 0 ||
    typeof policy.minEdgeMm !== 'number' ||
    typeof policy.maxEdgeMm !== 'number' ||
    !Number.isFinite(policy.minEdgeMm) ||
    !Number.isFinite(policy.maxEdgeMm) ||
    Object.is(policy.minEdgeMm, -0) ||
    Object.is(policy.maxEdgeMm, -0) ||
    policy.minEdgeMm <= 0 ||
    policy.maxEdgeMm < policy.minEdgeMm
  )
    fail('material-policy-invalid', 'Material boundary mesh policy is invalid.');
  return policy as GarmentBoundaryMeshPolicyV1;
}

function snapshotRecoveryRequestInput(
  value: unknown,
  path: string,
): GarmentPhase2BoundaryRecoveryRequestV1 {
  const snapshot = snapshotPlainData(value, path, 0, {
    nodes: 0,
    properties: 0,
    active: new Set(),
  });
  const envelope = extractEnvelope(snapshot);
  extractUpgradeRequestParts(envelope.phase2UpgradeRequest);
  snapshotMaterialPolicy(envelope.materialPolicy);
  return snapshot as GarmentPhase2BoundaryRecoveryRequestV1;
}

function numberToken(value: number): string {
  if (!Number.isFinite(value))
    fail('output-invalid', 'Canonical payload contains non-finite data.');
  if (Object.is(value, -0)) return '"-0"';
  return JSON.stringify(value);
}

function canonicalSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return numberToken(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Uint32Array) return `{"$uint32":[${[...value].map(numberToken).join(',')}]}`;
  if (value instanceof Float32Array)
    return `{"$float32":[${[...value].map(numberToken).join(',')}]}`;
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalSerialize((value as Record<string, unknown>)[key])}`,
      );
    return `{${entries.join(',')}}`;
  }
  fail('output-invalid', 'Canonical payload contains unsupported data.');
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function recoveryFingerprint(payload: unknown): string {
  return `gbr1-fnv1a64:${fnv1a64(canonicalSerialize(payload))}`;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalSerialize(left) === canonicalSerialize(right);
}

function copyOutputSource(source: OutputVertexSource): OutputVertexSource {
  if (source.kind === 'boundary')
    return {
      kind: 'boundary',
      boundaryVertexId: source.boundaryVertexId,
      provenance: { ...source.provenance },
    };
  if (source.kind === 'boundary-sample')
    return {
      kind: 'boundary-sample',
      parentSegment: { ...source.parentSegment },
      provenance: { ...source.provenance },
    };
  return {
    kind: 'interior',
    generator: source.generator,
    ...(source.sourceId === undefined ? {} : { sourceId: source.sourceId }),
  };
}

function distance(left: readonly [number, number], right: readonly [number, number]): number {
  return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

/**
 * Published ClothMeshIR positions are f32 even when their source-line witness is f64. Keep the
 * source geometry tolerance and that unavoidable storage error separate: callers cannot enlarge
 * this envelope, and an adjacent f32 value outside the exact rounded point remains a failure.
 */
export function f32StorageProjectionEnvelopeMmV1(
  exactSourcePositionMm: readonly [number, number],
): number {
  const rounded: readonly [number, number] = [
    Math.fround(exactSourcePositionMm[0]),
    Math.fround(exactSourcePositionMm[1]),
  ];
  return distance(exactSourcePositionMm, rounded);
}

export function isF32StoredProjectionWithinSourceToleranceV1(
  storedPositionMm: readonly [number, number],
  exactSourcePositionMm: readonly [number, number],
  sourceToleranceMm: number,
): boolean {
  if (
    !Number.isFinite(sourceToleranceMm) ||
    sourceToleranceMm < 0 ||
    storedPositionMm.some((value) => !Number.isFinite(value) || Object.is(value, -0)) ||
    exactSourcePositionMm.some((value) => !Number.isFinite(value) || Object.is(value, -0))
  )
    return false;
  return (
    distance(storedPositionMm, exactSourcePositionMm) <=
    sourceToleranceMm + f32StorageProjectionEnvelopeMmV1(exactSourcePositionMm)
  );
}

function pairKey(pieceId: string, contourId: string, startId: string, endId: string): string {
  return [pieceId, contourId, startId, endId].join('\u0000');
}

function bindingKey(pieceId: string, boundaryVertexId: string): string {
  return `${pieceId}\u0000${boundaryVertexId}`;
}

type BoundaryPhase2Binding = Omit<GarmentPhase2BoundaryVertexBindingV1, 'source'> &
  Readonly<{ source: Exclude<OutputVertexSource, { kind: 'interior' }> }>;

type BoundPhase2Vertex = Readonly<{
  binding: BoundaryPhase2Binding;
  positionMm: readonly [number, number];
}>;

type IntervalPlan = {
  pieceId: string;
  contourId: string;
  edgeId: string;
  sourceCurveId: string;
  startId: string;
  endId: string;
  startT: number;
  endT: number;
  startArc: number;
  endArc: number;
  startPositionMm: readonly [number, number];
  endPositionMm: readonly [number, number];
  nativeLineStartMm: readonly [number, number];
  nativeLineEndMm: readonly [number, number];
  nativeLineStartT: number;
  nativeLineEndT: number;
  maximumProjectionErrorMm: number;
  maximumProjectionToleranceMm: number;
  minimumSegmentCount: number;
  maximumSegmentCount: number;
  segmentCount: number;
  recoveredInteriorVertices: readonly GarmentPhase2RecoveredBoundaryVertexV1[] | null;
};

function createBindingMap(
  artifact: GarmentPhase2SampledClothMeshArtifactV1,
): ReadonlyMap<string, BoundPhase2Vertex> {
  if (
    artifact.boundaryVertexBindings.length >
    GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumPhase2Vertices
  )
    fail('resource-budget-exceeded', 'Phase-2 boundary vertex count exceeds the recovery bound.');
  const output = new Map<string, BoundPhase2Vertex>();
  for (const binding of artifact.boundaryVertexBindings) {
    const key = bindingKey(binding.pieceId, binding.sampledBoundaryVertexId);
    const x = artifact.mesh.restPositions2Mm[binding.globalVertexIndex * 2];
    const y = artifact.mesh.restPositions2Mm[binding.globalVertexIndex * 2 + 1];
    if (
      output.has(key) ||
      binding.globalVertexIndex >= artifact.mesh.restPositions2Mm.length / 2 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Object.is(x, -0) ||
      Object.is(y, -0) ||
      binding.source.kind === 'interior'
    )
      fail('boundary-binding-mismatch', `${key} has invalid Phase-2 boundary binding.`);
    output.set(key, { binding: binding as BoundaryPhase2Binding, positionMm: [x, y] });
  }
  return output;
}

type SubdivisionBudget = {
  candidates: number;
  segmentChecks: number;
};

type SegmentCountRange = Readonly<{
  minimum: number;
  maximum: number;
}>;

function segmentCountRange(
  start: readonly [number, number],
  end: readonly [number, number],
  policy: GarmentBoundaryMeshPolicyV1,
): SegmentCountRange {
  const length = distance(start, end);
  if (!(length > 0) || !Number.isFinite(length))
    fail('f32-collapse', 'A Phase-2 boundary interval collapses in f32.');
  const minimumCount = Math.max(1, Math.ceil(length / policy.maxEdgeMm));
  const maximumCount = Math.floor(length / policy.minEdgeMm);
  if (minimumCount > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumSamplesPerPhase2Interval)
    fail(
      'resource-budget-exceeded',
      'A Phase-2 boundary interval exceeds the per-interval recovery sample bound.',
    );
  if (maximumCount < minimumCount)
    fail(
      'material-range-unsatisfiable',
      'A preserved Phase-2 interval cannot be split inside the exact material edge range.',
    );
  return {
    minimum: minimumCount,
    maximum: Math.min(
      maximumCount,
      GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumSamplesPerPhase2Interval,
    ),
  };
}

type SegmentCandidateVerdict = 'accepted' | 'range-invalid' | 'f32-collapse';

function evaluateSegmentCandidate(
  start: readonly [number, number],
  end: readonly [number, number],
  count: number,
  policy: GarmentBoundaryMeshPolicyV1,
  budget: SubdivisionBudget,
): SegmentCandidateVerdict {
  budget.candidates += 1;
  if (budget.candidates > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumSubdivisionCandidates)
    fail('resource-budget-exceeded', 'Boundary subdivision candidate budget is exhausted.');
  let previous: readonly [number, number] = start;
  let accepted = true;
  for (let numerator = 1; numerator <= count; numerator += 1) {
    budget.segmentChecks += 1;
    if (
      budget.segmentChecks >
      GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumSubdivisionSegmentChecks
    )
      fail('resource-budget-exceeded', 'Boundary subdivision segment-check budget is exhausted.');
    const next =
      numerator === count
        ? end
        : ([
            Math.fround(start[0] + ((end[0] - start[0]) * numerator) / count),
            Math.fround(start[1] + ((end[1] - start[1]) * numerator) / count),
          ] as const);
    if (
      !Number.isFinite(next[0]) ||
      !Number.isFinite(next[1]) ||
      Object.is(next[0], -0) ||
      Object.is(next[1], -0)
    )
      return 'f32-collapse';
    const edgeLength = distance(previous, next);
    if (edgeLength === 0) return 'f32-collapse';
    if (edgeLength < policy.minEdgeMm || edgeLength > policy.maxEdgeMm) accepted = false;
    previous = next;
  }
  return accepted ? 'accepted' : 'range-invalid';
}

function firstValidSegmentCount(
  start: readonly [number, number],
  end: readonly [number, number],
  range: SegmentCountRange,
  policy: GarmentBoundaryMeshPolicyV1,
  budget: SubdivisionBudget,
): number {
  let collapsed = false;
  for (let count = range.minimum; count <= range.maximum; count += 1) {
    const verdict = evaluateSegmentCandidate(start, end, count, policy, budget);
    if (verdict === 'accepted') return count;
    if (verdict === 'f32-collapse') collapsed = true;
  }
  if (collapsed) fail('f32-collapse', 'Every material-range subdivision collapses in f32.');
  fail(
    'material-range-unsatisfiable',
    'No f32 subdivision satisfies the exact material edge range.',
  );
}

function nativeLinePosition(
  start: readonly [number, number],
  end: readonly [number, number],
  startT: number,
  endT: number,
  sourceT: number,
): readonly [number, number] {
  const u = (sourceT - startT) / (endT - startT);
  return [start[0] + (end[0] - start[0]) * u, start[1] + (end[1] - start[1]) * u];
}

function phase2Vertex(
  bindings: ReadonlyMap<string, BoundPhase2Vertex>,
  pieceId: string,
  id: string,
): BoundPhase2Vertex {
  const vertex = bindings.get(bindingKey(pieceId, id));
  if (!vertex)
    fail('boundary-binding-mismatch', `${pieceId}/${id} has no accepted Phase-2 binding.`);
  return vertex;
}

function buildIntervalPlans(
  evaluation: Phase2BoundarySamplingEvaluationV1,
  bindings: ReadonlyMap<string, BoundPhase2Vertex>,
  policy: GarmentBoundaryMeshPolicyV1,
  subdivisionBudget: SubdivisionBudget,
): Map<string, IntervalPlan> {
  const requestEdgeById = new Map(
    evaluation.canonicalRequest.pieces.flatMap((piece) =>
      piece.edges.map((edge) => [`${edge.pieceId}\u0000${edge.edgeId}`, edge] as const),
    ),
  );
  const output = new Map<string, IntervalPlan>();
  for (const evidence of evaluation.canonicalArtifact.edges) {
    const edge = requestEdgeById.get(`${evidence.pieceId}\u0000${evidence.edgeId}`);
    if (!edge)
      fail('boundary-binding-mismatch', `${evidence.edgeId} has no canonical native witness.`);
    if (
      edge.native.curveKind !== 'line' ||
      edge.native.parameterSpace !== 'unit' ||
      edge.native.periodic ||
      edge.native.transform.kind !== 'identity' ||
      edge.native.chordErrorBoundMm !== 0
    )
      fail(
        'unsupported-source-geometry',
        `${evidence.edgeId} is outside the unit-line identity recovery scope.`,
      );
    const [nativeStartT, nativeEndT] = edge.native.sourceCurveTRange;
    if (!(nativeEndT > nativeStartT))
      fail('unsupported-source-geometry', `${evidence.edgeId} has unsupported native direction.`);
    const ids = [
      edge.startBoundaryVertexId,
      ...evidence.insertedBoundarySampleIds,
      edge.endBoundaryVertexId,
    ];
    if (ids.length !== evidence.segmentCount + 1)
      fail('boundary-binding-mismatch', `${evidence.edgeId} sample count drifted.`);
    const startVertex = phase2Vertex(bindings, evidence.pieceId, ids[0]);
    const startArc = startVertex.binding.source.provenance.normalizedArc;
    const requestPiece = evaluation.canonicalRequest.pieces.find(
      (piece) => piece.input.pieceId === evidence.pieceId,
    );
    const requestRing = requestPiece
      ? [requestPiece.input.shell, ...requestPiece.input.holes].find(
          (ring) => ring.id === evidence.ringId,
        )
      : undefined;
    if (
      !requestPiece ||
      !requestRing ||
      edge.edgeIndex >= requestRing.vertices.length ||
      requestRing.vertices[edge.edgeIndex].id !== edge.startBoundaryVertexId ||
      requestRing.vertices[(edge.edgeIndex + 1) % requestRing.vertices.length].id !==
        edge.endBoundaryVertexId
    )
      fail('boundary-binding-mismatch', `${evidence.edgeId} native ring occurrence drifted.`);
    const nativeLineStartMm = requestRing.vertices[edge.edgeIndex].positionMm;
    const nativeLineEndMm =
      requestRing.vertices[(edge.edgeIndex + 1) % requestRing.vertices.length].positionMm;
    const projectionToleranceMm = requestPiece.input.options.maxBoundaryErrorMm;
    for (let index = 0; index + 1 < ids.length; index += 1) {
      const startId = ids[index];
      const endId = ids[index + 1];
      const start = phase2Vertex(bindings, evidence.pieceId, startId);
      const end = phase2Vertex(bindings, evidence.pieceId, endId);
      const startT = index === 0 ? nativeStartT : start.binding.source.provenance.sourceCurveT;
      const endT =
        index + 1 === ids.length - 1 ? nativeEndT : end.binding.source.provenance.sourceCurveT;
      const intervalStartArc =
        index === 0 ? startArc : start.binding.source.provenance.normalizedArc;
      let intervalEndArc = end.binding.source.provenance.normalizedArc;
      if (index + 1 === ids.length - 1 && intervalEndArc <= intervalStartArc) intervalEndArc = 1;
      if (
        !(endT > startT) ||
        !(intervalEndArc > intervalStartArc) ||
        (index > 0 &&
          (start.binding.source.provenance.sourceCurveId !== edge.native.sourceCurveId ||
            start.binding.source.provenance.sourceCurveParameterSpace !== 'unit')) ||
        (index + 1 < ids.length - 1 &&
          (end.binding.source.provenance.sourceCurveId !== edge.native.sourceCurveId ||
            end.binding.source.provenance.sourceCurveParameterSpace !== 'unit'))
      )
        fail('boundary-binding-mismatch', `${evidence.edgeId}/${index} provenance drifted.`);
      const exactStartPosition = nativeLinePosition(
        nativeLineStartMm,
        nativeLineEndMm,
        nativeStartT,
        nativeEndT,
        startT,
      );
      const exactEndPosition = nativeLinePosition(
        nativeLineStartMm,
        nativeLineEndMm,
        nativeStartT,
        nativeEndT,
        endT,
      );
      const startProjectionError = distance(start.positionMm, exactStartPosition);
      const endProjectionError = distance(end.positionMm, exactEndPosition);
      const maximumProjectionErrorMm = Math.max(startProjectionError, endProjectionError);
      if (
        !Number.isFinite(maximumProjectionErrorMm) ||
        !isF32StoredProjectionWithinSourceToleranceV1(
          start.positionMm,
          exactStartPosition,
          projectionToleranceMm,
        ) ||
        !isF32StoredProjectionWithinSourceToleranceV1(
          end.positionMm,
          exactEndPosition,
          projectionToleranceMm,
        )
      )
        fail(
          'native-line-projection-drift',
          `${evidence.edgeId}/${index} f32 position exceeds native-line tolerance.`,
        );
      const key = pairKey(evidence.pieceId, evidence.ringId, startId, endId);
      if (output.has(key))
        fail('boundary-binding-mismatch', `${evidence.edgeId}/${index} interval is duplicated.`);
      const acceptedSegmentCountRange = segmentCountRange(start.positionMm, end.positionMm, policy);
      const segmentCount = firstValidSegmentCount(
        start.positionMm,
        end.positionMm,
        acceptedSegmentCountRange,
        policy,
        subdivisionBudget,
      );
      output.set(key, {
        pieceId: evidence.pieceId,
        contourId: evidence.ringId,
        edgeId: evidence.edgeId,
        sourceCurveId: edge.native.sourceCurveId,
        startId,
        endId,
        startT,
        endT,
        startArc: intervalStartArc,
        endArc: intervalEndArc,
        startPositionMm: start.positionMm,
        endPositionMm: end.positionMm,
        nativeLineStartMm,
        nativeLineEndMm,
        nativeLineStartT: nativeStartT,
        nativeLineEndT: nativeEndT,
        maximumProjectionErrorMm,
        maximumProjectionToleranceMm: projectionToleranceMm,
        minimumSegmentCount: acceptedSegmentCountRange.minimum,
        maximumSegmentCount: acceptedSegmentCountRange.maximum,
        segmentCount,
        recoveredInteriorVertices: null,
      });
    }
  }
  return output;
}

function findInterval(
  intervals: ReadonlyMap<string, IntervalPlan>,
  pieceId: string,
  contourId: string,
  startId: string,
  endId: string,
): Readonly<{ plan: IntervalPlan; reversed: boolean }> {
  const direct = intervals.get(pairKey(pieceId, contourId, startId, endId));
  if (direct) return { plan: direct, reversed: false };
  const reverse = intervals.get(pairKey(pieceId, contourId, endId, startId));
  if (reverse) return { plan: reverse, reversed: true };
  fail(
    'boundary-binding-mismatch',
    `${pieceId}/${contourId}/${startId}->${endId} has no native interval.`,
  );
}

function bindSymmetricSeamCounts(
  evaluation: Phase2BoundarySamplingEvaluationV1,
  intervals: ReadonlyMap<string, IntervalPlan>,
  policy: GarmentBoundaryMeshPolicyV1,
  subdivisionBudget: SubdivisionBudget,
): void {
  for (const seam of evaluation.canonicalArtifact.equalSeams) {
    if (
      seam.sides[0].directedBoundaryVertexIds.length !==
      seam.sides[1].directedBoundaryVertexIds.length
    )
      fail('seam-binding-mismatch', `${seam.seamId} Phase-2 side cardinality differs.`);
    const sides = seam.sides.map((side) => {
      const edge = evaluation.canonicalArtifact.edges.find(
        (candidate) => candidate.pieceId === side.pieceId && candidate.edgeId === side.edgeId,
      );
      if (!edge) fail('seam-binding-mismatch', `${seam.seamId}/${side.edgeId} edge is absent.`);
      return { side, edge };
    });
    for (let index = 0; index + 1 < seam.sides[0].directedBoundaryVertexIds.length; index += 1) {
      const plans = sides.map(
        ({ side, edge }) =>
          findInterval(
            intervals,
            side.pieceId,
            edge.ringId,
            side.directedBoundaryVertexIds[index],
            side.directedBoundaryVertexIds[index + 1],
          ).plan,
      );
      let sharedCount: number | undefined;
      const minimumSharedCount = Math.max(
        plans[0].minimumSegmentCount,
        plans[1].minimumSegmentCount,
      );
      const maximumSharedCount = Math.min(
        plans[0].maximumSegmentCount,
        plans[1].maximumSegmentCount,
      );
      for (let count = minimumSharedCount; count <= maximumSharedCount; count += 1) {
        if (
          evaluateSegmentCandidate(
            plans[0].startPositionMm,
            plans[0].endPositionMm,
            count,
            policy,
            subdivisionBudget,
          ) === 'accepted' &&
          evaluateSegmentCandidate(
            plans[1].startPositionMm,
            plans[1].endPositionMm,
            count,
            policy,
            subdivisionBudget,
          ) === 'accepted'
        ) {
          sharedCount = count;
          break;
        }
      }
      if (sharedCount === undefined)
        fail(
          'material-range-unsatisfiable',
          `${seam.seamId}/${index} has no shared f32 subdivision inside the material range.`,
        );
      plans[0].segmentCount = sharedCount;
      plans[1].segmentCount = sharedCount;
    }
  }
}

function preflightRecoveryBudgets(
  fresh: GarmentPhase2SampledClothMeshArtifactV1,
  evaluation: Phase2BoundarySamplingEvaluationV1,
  intervals: ReadonlyMap<string, IntervalPlan>,
): void {
  let projectedRecoveredVertices = fresh.boundaryVertexBindings.length;
  for (const interval of intervals.values()) {
    projectedRecoveredVertices += interval.segmentCount - 1;
    if (
      !Number.isSafeInteger(projectedRecoveredVertices) ||
      projectedRecoveredVertices >
        GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumRecoveredVertices
    )
      fail(
        'resource-budget-exceeded',
        'Projected recovered boundary vertex count exceeds the bound.',
      );
  }
  let projectedSeamPairs = 0;
  for (const seam of evaluation.canonicalArtifact.equalSeams) {
    const side = seam.sides[0];
    const edge = evaluation.canonicalArtifact.edges.find(
      (candidate) => candidate.pieceId === side.pieceId && candidate.edgeId === side.edgeId,
    );
    if (!edge) fail('seam-binding-mismatch', `${seam.seamId}/${side.edgeId} edge is absent.`);
    let seamPairCount = 1;
    for (let index = 0; index + 1 < side.directedBoundaryVertexIds.length; index += 1) {
      seamPairCount += findInterval(
        intervals,
        side.pieceId,
        edge.ringId,
        side.directedBoundaryVertexIds[index],
        side.directedBoundaryVertexIds[index + 1],
      ).plan.segmentCount;
    }
    projectedSeamPairs += seamPairCount;
    if (
      !Number.isSafeInteger(projectedSeamPairs) ||
      projectedSeamPairs > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumSeamPairs
    )
      fail('resource-budget-exceeded', 'Projected recovered seam pair count exceeds the bound.');
  }
}

function recoveredId(plan: IntervalPlan, numerator: number): string {
  const identity = [
    GARMENT_PHASE2_BOUNDARY_RECOVERY_V1,
    plan.pieceId,
    plan.contourId,
    plan.edgeId,
    plan.sourceCurveId,
    plan.startId,
    plan.endId,
    plan.startT,
    plan.endT,
    numerator,
    plan.segmentCount,
  ].join('\u0000');
  return `g0a-${fnv1a64(identity)}-${numerator}-of-${plan.segmentCount}`;
}

function materializeInterval(
  plan: IntervalPlan,
): readonly GarmentPhase2RecoveredBoundaryVertexV1[] {
  if (plan.recoveredInteriorVertices) return plan.recoveredInteriorVertices;
  const output: GarmentPhase2RecoveredBoundaryVertexV1[] = [];
  let previous = plan.startPositionMm;
  for (let numerator = 1; numerator < plan.segmentCount; numerator += 1) {
    const u = numerator / plan.segmentCount;
    const positionMm = [
      Math.fround(plan.startPositionMm[0] + (plan.endPositionMm[0] - plan.startPositionMm[0]) * u),
      Math.fround(plan.startPositionMm[1] + (plan.endPositionMm[1] - plan.startPositionMm[1]) * u),
    ] as const;
    const edgeLength = distance(previous, positionMm);
    const expectedNativePosition = nativeLinePosition(
      plan.nativeLineStartMm,
      plan.nativeLineEndMm,
      plan.nativeLineStartT,
      plan.nativeLineEndT,
      plan.startT + (plan.endT - plan.startT) * u,
    );
    const projectionErrorMm = distance(positionMm, expectedNativePosition);
    if (
      !Number.isFinite(positionMm[0]) ||
      !Number.isFinite(positionMm[1]) ||
      Object.is(positionMm[0], -0) ||
      Object.is(positionMm[1], -0) ||
      edgeLength === 0 ||
      !Number.isFinite(edgeLength)
    )
      fail('f32-collapse', `${plan.edgeId}/${numerator} collapses in f32.`);
    if (
      !Number.isFinite(projectionErrorMm) ||
      projectionErrorMm > plan.maximumProjectionToleranceMm
    )
      fail(
        'native-line-projection-drift',
        `${plan.edgeId}/${numerator} exceeds native-line tolerance after f32 conversion.`,
      );
    plan.maximumProjectionErrorMm = Math.max(plan.maximumProjectionErrorMm, projectionErrorMm);
    output.push({
      boundaryVertexId: recoveredId(plan, numerator),
      positionMm,
      source: {
        kind: 'recovered-boundary-sample',
        edgeId: plan.edgeId,
        parentInterval: {
          startSampledBoundaryVertexId: plan.startId,
          endSampledBoundaryVertexId: plan.endId,
        },
        localFraction: { numerator, denominator: plan.segmentCount },
        provenance: {
          contourId: plan.contourId,
          sourceCurveId: plan.sourceCurveId,
          sourceCurveParameterSpace: 'unit',
          sourceCurveT: plan.startT + (plan.endT - plan.startT) * u,
          normalizedArc: plan.startArc + (plan.endArc - plan.startArc) * u,
        },
      },
    });
    previous = positionMm;
  }
  if (distance(previous, plan.endPositionMm) === 0)
    fail('f32-collapse', `${plan.edgeId} final recovered segment collapses in f32.`);
  plan.recoveredInteriorVertices = output;
  return output;
}

function preservedVertex(vertex: BoundPhase2Vertex): GarmentPhase2RecoveredBoundaryVertexV1 {
  return {
    boundaryVertexId: vertex.binding.sampledBoundaryVertexId,
    positionMm: [vertex.positionMm[0], vertex.positionMm[1]],
    source: { kind: 'phase2-boundary', phase2Source: copyOutputSource(vertex.binding.source) },
  };
}

function isOrderedSubsequence(needles: readonly string[], haystack: readonly string[]): boolean {
  let needleIndex = 0;
  for (const value of haystack) {
    if (value === needles[needleIndex]) needleIndex += 1;
  }
  return needleIndex === needles.length;
}

function buildLoop(
  loop: GarmentPhase2BoundaryLoopV1,
  bindings: ReadonlyMap<string, BoundPhase2Vertex>,
  intervals: ReadonlyMap<string, IntervalPlan>,
  allIds: Set<string>,
  policy: GarmentBoundaryMeshPolicyV1,
): GarmentPhase2RecoveredBoundaryLoopV1 {
  const oldIds = [...loop.sampledBoundaryVertexIds];
  if (oldIds.length < 3)
    fail('boundary-binding-mismatch', `${loop.pieceId}/${loop.contourId} has too few vertices.`);
  const vertices: GarmentPhase2RecoveredBoundaryVertexV1[] = [];
  const recoveredIndices = new Uint32Array(oldIds.length);
  let maximumSegment = 0;
  for (let index = 0; index < oldIds.length; index += 1) {
    const startId = oldIds[index];
    const endId = oldIds[(index + 1) % oldIds.length];
    const start = phase2Vertex(bindings, loop.pieceId, startId);
    const interval = findInterval(intervals, loop.pieceId, loop.contourId, startId, endId);
    if (interval.reversed)
      fail(
        'boundary-binding-mismatch',
        `${loop.pieceId}/${loop.contourId} loop direction drifted.`,
      );
    recoveredIndices[index] = vertices.length;
    const ownedStartId = bindingKey(loop.pieceId, startId);
    if (allIds.has(ownedStartId))
      fail('boundary-binding-mismatch', `${loop.pieceId}/${startId} is duplicated across loops.`);
    allIds.add(ownedStartId);
    vertices.push(preservedVertex(start));
    for (const inserted of materializeInterval(interval.plan)) {
      const ownedInsertedId = bindingKey(loop.pieceId, inserted.boundaryVertexId);
      if (allIds.has(ownedInsertedId))
        fail('boundary-binding-mismatch', `${inserted.boundaryVertexId} collides.`);
      allIds.add(ownedInsertedId);
      vertices.push(inserted);
    }
  }
  for (let index = 0; index < vertices.length; index += 1) {
    const edgeLength = distance(
      vertices[index].positionMm,
      vertices[(index + 1) % vertices.length].positionMm,
    );
    if (!(edgeLength > 0))
      fail('f32-collapse', `${loop.pieceId}/${loop.contourId}/${index} collapses in f32.`);
    if (edgeLength < policy.minEdgeMm || edgeLength > policy.maxEdgeMm)
      fail(
        'material-range-unsatisfiable',
        `${loop.pieceId}/${loop.contourId}/${index} is outside the exact material edge range.`,
      );
    maximumSegment = Math.max(maximumSegment, edgeLength);
  }
  const recoveredIds = vertices.map(({ boundaryVertexId }) => boundaryVertexId);
  if (!isOrderedSubsequence(oldIds, recoveredIds))
    fail('boundary-binding-mismatch', `${loop.pieceId}/${loop.contourId} lost Phase-2 order.`);
  return {
    pieceId: loop.pieceId,
    contourId: loop.contourId,
    role: loop.role,
    phase2BoundaryVertexIds: oldIds,
    recoveredBoundaryVertexIds: recoveredIds,
    vertices,
    phase2VertexRecoveredIndices: recoveredIndices,
    maximumRecoveredSegmentLengthMm: maximumSegment,
    phase2OrderPreserved: true,
  };
}

function directedRecoveredIds(
  oldIds: readonly string[],
  pieceId: string,
  contourId: string,
  intervals: ReadonlyMap<string, IntervalPlan>,
): Readonly<{ ids: readonly string[]; oldIndices: Uint32Array }> {
  if (oldIds.length < 2)
    fail('seam-binding-mismatch', `${pieceId}/${contourId} seam side is too short.`);
  const ids = [oldIds[0]];
  const oldIndices = new Uint32Array(oldIds.length);
  for (let index = 0; index + 1 < oldIds.length; index += 1) {
    const interval = findInterval(intervals, pieceId, contourId, oldIds[index], oldIds[index + 1]);
    const inserted = materializeInterval(interval.plan).map(
      ({ boundaryVertexId }) => boundaryVertexId,
    );
    ids.push(...(interval.reversed ? [...inserted].reverse() : inserted), oldIds[index + 1]);
    oldIndices[index + 1] = ids.length - 1;
  }
  return { ids, oldIndices };
}

function buildSeams(
  fresh: GarmentPhase2SampledClothMeshArtifactV1,
  evaluation: Phase2BoundarySamplingEvaluationV1,
  intervals: ReadonlyMap<string, IntervalPlan>,
): readonly GarmentPhase2BoundaryRecoverySeamV1[] {
  if (fresh.mesh.seams.length > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumSeams)
    fail('resource-budget-exceeded', 'Seam count exceeds the recovery bound.');
  const bindingByGlobal = new Map(
    fresh.boundaryVertexBindings.map((binding) => [binding.globalVertexIndex, binding] as const),
  );
  let recoveredPairCount = 0;
  return fresh.mesh.seams.map((phase2Seam) => {
    const evidence = evaluation.canonicalArtifact.equalSeams.find(
      (candidate) => candidate.seamId === phase2Seam.seamId,
    );
    if (
      !evidence ||
      phase2Seam.mapping !== 'equal' ||
      phase2Seam.lengthRatio !== 1 ||
      phase2Seam.vertexPairs.length / 2 !== evidence.sides[0].directedBoundaryVertexIds.length ||
      evidence.sides[0].directedBoundaryVertexIds.length !==
        evidence.sides[1].directedBoundaryVertexIds.length
    )
      fail('seam-binding-mismatch', `${phase2Seam.seamId} Phase-2 seam evidence drifted.`);
    const sideData = evidence.sides.map((side) => {
      const edge = evaluation.canonicalArtifact.edges.find(
        (candidate) => candidate.pieceId === side.pieceId && candidate.edgeId === side.edgeId,
      );
      if (!edge)
        fail('seam-binding-mismatch', `${phase2Seam.seamId}/${side.edgeId} edge is absent.`);
      return directedRecoveredIds(
        side.directedBoundaryVertexIds,
        side.pieceId,
        edge.ringId,
        intervals,
      );
    });
    if (
      sideData[0].ids.length !== sideData[1].ids.length ||
      sideData[0].oldIndices.some((value, index) => value !== sideData[1].oldIndices[index])
    )
      fail('seam-binding-mismatch', `${phase2Seam.seamId} recovery is not symmetric.`);
    const phase2Pairs = evidence.sides[0].directedBoundaryVertexIds.map(
      (firstId, index) =>
        [
          { pieceId: evidence.sides[0].pieceId, boundaryVertexId: firstId },
          {
            pieceId: evidence.sides[1].pieceId,
            boundaryVertexId: evidence.sides[1].directedBoundaryVertexIds[index],
          },
        ] as const,
    );
    for (let index = 0; index < phase2Pairs.length; index += 1) {
      const first = bindingByGlobal.get(phase2Seam.vertexPairs[index * 2]);
      const second = bindingByGlobal.get(phase2Seam.vertexPairs[index * 2 + 1]);
      if (
        !first ||
        !second ||
        first.pieceId !== phase2Pairs[index][0].pieceId ||
        second.pieceId !== phase2Pairs[index][1].pieceId ||
        first.sampledBoundaryVertexId !== phase2Pairs[index][0].boundaryVertexId ||
        second.sampledBoundaryVertexId !== phase2Pairs[index][1].boundaryVertexId
      )
        fail('seam-binding-mismatch', `${phase2Seam.seamId}/${index} pair identity drifted.`);
    }
    const recoveredPairs = sideData[0].ids.map(
      (firstId, index) =>
        [
          { pieceId: evidence.sides[0].pieceId, boundaryVertexId: firstId },
          { pieceId: evidence.sides[1].pieceId, boundaryVertexId: sideData[1].ids[index] },
        ] as const,
    );
    for (let index = 0; index < phase2Pairs.length; index += 1) {
      const recoveredIndex = sideData[0].oldIndices[index];
      if (!sameCanonical(recoveredPairs[recoveredIndex], phase2Pairs[index]))
        fail('seam-binding-mismatch', `${phase2Seam.seamId}/${index} old pair was not preserved.`);
    }
    recoveredPairCount += recoveredPairs.length;
    if (recoveredPairCount > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumSeamPairs)
      fail('resource-budget-exceeded', 'Recovered seam pair count exceeds the bound.');
    return {
      seamId: phase2Seam.seamId,
      mapping: 'equal',
      lengthRatio: 1,
      phase2GlobalVertexPairs: phase2Seam.vertexPairs.slice(),
      phase2BoundaryVertexPairs: phase2Pairs,
      recoveredBoundaryVertexPairs: recoveredPairs,
      phase2PairRecoveredIndices: sideData[0].oldIndices.slice(),
      phase2PairsPreservedAsOrderedSubsequence: true,
    };
  });
}

function freezeOwnedPlainData<T>(value: T): T {
  if (
    value === null ||
    typeof value !== 'object' ||
    ArrayBuffer.isView(value) ||
    Object.isFrozen(value)
  )
    return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeOwnedPlainData(child);
  Object.freeze(value);
  return value;
}

function evaluateSampling(
  request: Phase2BoundarySamplingRequestV1,
  artifact: unknown,
): Phase2BoundarySamplingEvaluationV1 {
  try {
    return evaluatePhase2BoundarySamplingArtifactV1(
      request,
      artifact as Phase2BoundarySamplingArtifactV1,
    );
  } catch (error) {
    if (
      error instanceof Phase2BoundarySamplingErrorV1 &&
      [
        'unsupported-curve-kind',
        'unsupported-parameter-space',
        'unsupported-chord-error',
        'unsupported-periodic-curve',
        'unsupported-transform',
      ].includes(error.code)
    )
      fail('unsupported-source-geometry', 'Phase-2 source geometry is outside G0A scope.', [
        error.message,
      ]);
    fail('phase2-upgrade-failed', 'Canonical Phase-2 sampling evaluation failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

function freshPhase2Upgrade(
  request: GarmentPhase2SampledClothMeshUpgradeRequestV1,
): GarmentPhase2SampledClothMeshArtifactV1 {
  try {
    return upgradeGarmentPhase2SampledClothMeshV1(request);
  } catch (error) {
    fail('phase2-upgrade-failed', 'Fresh Phase-2 sampled garment upgrade failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

function buildRecovery(input: unknown): GarmentPhase2BoundaryRecoveryArtifactV1 {
  const envelope = extractEnvelope(input);
  const upgradeParts = extractUpgradeRequestParts(envelope.phase2UpgradeRequest);
  const policy = snapshotMaterialPolicy(envelope.materialPolicy);
  const suppliedPhase2 = snapshotArtifact(envelope.phase2Artifact, 'request.phase2Artifact');
  const samplingEvaluation = evaluateSampling(
    upgradeParts.samplingRequest,
    upgradeParts.samplingArtifact,
  );
  const ownedUpgradeRequest: GarmentPhase2SampledClothMeshUpgradeRequestV1 = {
    baselineRequest:
      upgradeParts.baselineRequest as GarmentPhase2SampledClothMeshUpgradeRequestV1['baselineRequest'],
    samplingRequest: samplingEvaluation.canonicalRequest,
    samplingArtifact: samplingEvaluation.canonicalArtifact,
  };
  const fresh = freshPhase2Upgrade(ownedUpgradeRequest);
  if (
    fresh.samplingFingerprint !== samplingEvaluation.deterministicFingerprint ||
    suppliedPhase2.deterministicFingerprint !== fresh.deterministicFingerprint ||
    !sameCanonical(suppliedPhase2, fresh)
  )
    fail(
      'phase2-artifact-mismatch',
      'Supplied Phase-2 artifact does not exactly match a fresh canonical upgrade.',
    );
  const bindings = createBindingMap(fresh);
  const subdivisionBudget: SubdivisionBudget = { candidates: 0, segmentChecks: 0 };
  const intervals = buildIntervalPlans(samplingEvaluation, bindings, policy, subdivisionBudget);
  bindSymmetricSeamCounts(samplingEvaluation, intervals, policy, subdivisionBudget);
  if (
    fresh.boundaryLoops.length === 0 ||
    fresh.boundaryLoops.length > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumLoops
  )
    fail('resource-budget-exceeded', 'Phase-2 loop count is empty or exceeds the recovery bound.');
  if (
    fresh.mesh.pieceRanges.length === 0 ||
    fresh.mesh.pieceRanges.length > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumPieces
  )
    fail('resource-budget-exceeded', 'Phase-2 piece count is empty or exceeds the recovery bound.');
  preflightRecoveryBudgets(fresh, samplingEvaluation, intervals);
  const allIds = new Set<string>();
  const pieces = fresh.mesh.pieceRanges.map((range): GarmentPhase2BoundaryRecoveryPieceV1 => {
    const loops = fresh.boundaryLoops
      .filter((loop) => loop.pieceId === range.pieceId)
      .map((loop) => buildLoop(loop, bindings, intervals, allIds, policy));
    const phase2BoundaryVertexCount = loops.reduce(
      (sum, loop) => sum + loop.phase2BoundaryVertexIds.length,
      0,
    );
    const recoveredBoundaryVertexCount = loops.reduce(
      (sum, loop) => sum + loop.recoveredBoundaryVertexIds.length,
      0,
    );
    return {
      pieceId: range.pieceId,
      loops,
      phase2BoundaryVertexCount,
      insertedBoundaryRecoveryVertexCount: recoveredBoundaryVertexCount - phase2BoundaryVertexCount,
      recoveredBoundaryVertexCount,
    };
  });
  const totalRecovered = pieces.reduce((sum, piece) => sum + piece.recoveredBoundaryVertexCount, 0);
  if (
    pieces.length === 0 ||
    pieces.length > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumPieces ||
    totalRecovered > GARMENT_PHASE2_BOUNDARY_RECOVERY_LIMITS_V1.maximumRecoveredVertices
  )
    fail('resource-budget-exceeded', 'Recovered piece or vertex count exceeds the bound.');
  const seams = buildSeams(fresh, samplingEvaluation, intervals);
  let maximumRecoveredBoundarySegmentLengthMm = 0;
  let minimumRecoveredBoundarySegmentLengthMm = Number.POSITIVE_INFINITY;
  for (const piece of pieces) {
    for (const loop of piece.loops) {
      maximumRecoveredBoundarySegmentLengthMm = Math.max(
        maximumRecoveredBoundarySegmentLengthMm,
        loop.maximumRecoveredSegmentLengthMm,
      );
      for (let index = 0; index < loop.vertices.length; index += 1) {
        minimumRecoveredBoundarySegmentLengthMm = Math.min(
          minimumRecoveredBoundarySegmentLengthMm,
          distance(
            loop.vertices[index].positionMm,
            loop.vertices[(index + 1) % loop.vertices.length].positionMm,
          ),
        );
      }
    }
  }
  let maximumF32NativeLineProjectionErrorMm = 0;
  for (const interval of intervals.values())
    maximumF32NativeLineProjectionErrorMm = Math.max(
      maximumF32NativeLineProjectionErrorMm,
      interval.maximumProjectionErrorMm,
    );
  if (
    !Number.isFinite(minimumRecoveredBoundarySegmentLengthMm) ||
    !Number.isFinite(maximumRecoveredBoundarySegmentLengthMm) ||
    !Number.isFinite(maximumF32NativeLineProjectionErrorMm) ||
    minimumRecoveredBoundarySegmentLengthMm < policy.minEdgeMm ||
    maximumRecoveredBoundarySegmentLengthMm > policy.maxEdgeMm
  )
    fail(
      'material-range-unsatisfiable',
      'Recovered boundary violates its exact f32 material range.',
    );
  const payload = {
    version: GARMENT_PHASE2_BOUNDARY_RECOVERY_V1,
    status: 'accepted' as const,
    phase2Upgrader: GARMENT_PHASE2_SAMPLED_CLOTH_MESH_UPGRADER_V1,
    phase2UpgradeFingerprint: fresh.deterministicFingerprint,
    phase2BaselineCompilerFingerprint: fresh.baselineCompilerFingerprint,
    phase2SamplingFingerprint: fresh.samplingFingerprint,
    sourceBinding: { ...fresh.sourceBinding },
    materialPolicy: { ...policy },
    pieces,
    seams,
    maximumRecoveredBoundarySegmentLengthMm,
    minimumRecoveredBoundarySegmentLengthMm,
    maximumF32NativeLineProjectionErrorMm,
    claims: {
      acceptanceRequired: true as const,
      freshPhase2UpgradeAccepted: true as const,
      existingPhase2BoundaryVerticesPreserved: true as const,
      nestedBoundaryRecoveryIntegrated: true as const,
      distributedEqualSeamPairsPreserved: true as const,
      materialMaximumBoundaryEdgeAccepted: true as const,
      materialMinimumBoundaryEdgeAccepted: true as const,
      f32NativeLineProjectionAccepted: true as const,
      sourceRevisionBound: false as const,
      sourceAuthenticityAccepted: false as const,
      curvedSourceEvaluationIntegrated: false as const,
      triangulatedMeshPublished: false as const,
      interiorRefinementIntegrated: false as const,
      bodyPlacementReady: false as const,
      runtimeIntegrated: false as const,
      settleAccepted: false as const,
      productionReady: false as const,
    },
    blockers: [
      'acceptance-artifact-required',
      'phase-d-content-binding-not-integrated',
      'source-revision-not-represented-in-sampling-contract',
      'curved-source-evaluator-not-integrated',
      'interior-refinement-not-integrated',
      'triangulated-recovered-mesh-not-published',
      'body-placement-not-proven',
      'runtime-owner-not-integrated',
      'settle-not-evaluated',
      'production-qualification-not-run',
    ] as const,
  };
  return freezeOwnedPlainData({
    ...payload,
    deterministicFingerprint: recoveryFingerprint(payload),
  });
}

let recoveryActive = false;
let recoveryReentryObserved = false;

function runGuarded<T>(operation: () => T): T {
  if (recoveryActive) {
    recoveryReentryObserved = true;
    fail('reentrant-call', 'Garment Phase-2 boundary recovery rejects reentrant calls.');
  }
  recoveryActive = true;
  recoveryReentryObserved = false;
  try {
    const result = operation();
    if (recoveryReentryObserved)
      fail(
        'input-shape-invalid',
        'Boundary recovery input triggered a reentrant reflection side effect.',
      );
    return result;
  } catch (error) {
    if (error instanceof GarmentPhase2BoundaryRecoveryErrorV1) throw error;
    fail('output-invalid', 'Garment Phase-2 boundary recovery failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  } finally {
    recoveryActive = false;
    recoveryReentryObserved = false;
  }
}

export function recoverGarmentPhase2BoundariesV1(
  request: GarmentPhase2BoundaryRecoveryRequestV1,
): GarmentPhase2BoundaryRecoveryArtifactV1 {
  return runGuarded(() => {
    const owned =
      request !== null && typeof request === 'object'
        ? ownedRecoveryRequests.get(request)
        : undefined;
    if (!owned)
      fail(
        'input-shape-invalid',
        'Boundary recovery requires a request created by its public request constructor.',
      );
    return buildRecovery(owned);
  });
}

export function createGarmentPhase2BoundaryRecoveryRequestV1(
  input: GarmentPhase2BoundaryRecoveryRequestInputV1,
): GarmentPhase2BoundaryRecoveryRequestV1 {
  return runGuarded(() => {
    const publicRequest = snapshotRecoveryRequestInput(input, 'request-constructor.input');
    if (!capturedStructuredClone)
      fail('input-shape-invalid', 'Native structuredClone is required for Proxy rejection.');
    try {
      capturedStructuredClone(input);
    } catch (error) {
      fail('input-shape-invalid', 'Request constructor rejects Proxy or unclonable input.', [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    const privateRequest = snapshotRecoveryRequestInput(
      publicRequest,
      'request-constructor.private-copy',
    );
    freezeOwnedPlainData(publicRequest);
    freezeOwnedPlainData(privateRequest);
    ownedRecoveryRequests.set(publicRequest, privateRequest);
    return publicRequest;
  });
}

export function evaluateGarmentPhase2BoundaryRecoveryArtifactV1(
  request: GarmentPhase2BoundaryRecoveryRequestV1,
  artifact: GarmentPhase2BoundaryRecoveryArtifactV1,
): GarmentPhase2BoundaryRecoveryEvaluationV1 {
  return runGuarded(() => {
    const owned =
      request !== null && typeof request === 'object'
        ? ownedRecoveryRequests.get(request)
        : undefined;
    if (!owned)
      fail(
        'input-shape-invalid',
        'Boundary recovery evaluation requires a request from its public constructor.',
      );
    const supplied = snapshotRecoveryArtifact(artifact, 'artifact');
    const canonicalArtifact = buildRecovery(owned);
    if (
      supplied.deterministicFingerprint !== canonicalArtifact.deterministicFingerprint ||
      !sameCanonical(supplied, canonicalArtifact)
    )
      fail('artifact-mismatch', 'Boundary recovery artifact differs from an independent rebuild.');
    const evaluationPayload = {
      version: GARMENT_PHASE2_BOUNDARY_RECOVERY_EVALUATION_V1,
      status: 'accepted' as const,
      canonicalArtifact,
      independentRecoveryCallCount: 1 as const,
      claims: {
        requestLocalConsistencyAccepted: true as const,
        freshPhase2UpgradeExecuted: true as const,
        recoveryIndependentlyRebuilt: true as const,
        sourceAuthenticityAccepted: false as const,
        interiorRefinementIntegrated: false as const,
        runtimeIntegrated: false as const,
      },
      blockers: [
        'phase-d-content-binding-not-integrated',
        'interior-refinement-not-integrated',
      ] as const,
    };
    return freezeOwnedPlainData({
      ...evaluationPayload,
      deterministicFingerprint: recoveryFingerprint(evaluationPayload),
    });
  });
}
