import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
  type MeasurementSurfaceSelfIntersectionPolicyV1,
} from 'lib/cloth/body/measurement-surface-self-intersection-v1';

export const BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V1 =
  'beta-skirt-rendered-body-collision-diagnostic/1' as const;

export const BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1 = Object.freeze({
  maxBodyVertices: 20_000,
  maxBodyTriangles: 30_000,
  maxGarmentVertices: 2_000,
  maxGarmentTriangles: 5_000,
  maxInputBytes: 2 * 1024 * 1024,
  maxDistanceTriangleTests: 32_000_000,
  maxRayTriangleTests: 96_000_000,
  maxBroadPhaseGridCells: 1_000_000,
  maxBroadPhaseCellReferences: 4_000_000,
  maxBroadPhaseCellPairVisits: 8_000_000,
  maxBroadPhaseCandidatePairs: 2_000_000,
  unsafeClearanceMarginM: 0.001,
  absoluteEpsilonM: 1e-8,
  relativeEpsilon: 2e-7,
} as const);

export type BetaSkirtRenderedBodyCollisionDiagnosticBlockerV1 =
  | 'input-invalid'
  | 'budget-exhausted'
  | 'sha256-unavailable'
  | 'body-topology-not-closed'
  | 'body-topology-winding-inconsistent'
  | 'body-topology-nonmanifold-vertex'
  | 'body-topology-not-single-component'
  | 'body-degenerate-triangle'
  | 'body-duplicate-triangle'
  | 'body-self-intersection'
  | 'body-garment-triangle-intersection'
  | 'ambiguous-sign';

export type BetaSkirtRenderedBodyCollisionDiagnosticErrorCodeV1 =
  | 'input-invalid'
  | 'budget-exhausted'
  | 'sha256-unavailable';

export class BetaSkirtRenderedBodyCollisionDiagnosticErrorV1 extends Error {
  constructor(
    readonly code: BetaSkirtRenderedBodyCollisionDiagnosticErrorCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'BetaSkirtRenderedBodyCollisionDiagnosticErrorV1';
  }
}

export interface BetaSkirtRenderedBodyCollisionDiagnosticBindingV1 {
  readonly compositionGeneration: number;
  readonly snapshotGeneration: number;
  readonly modelId: string;
  readonly modelContentRevision: string;
  readonly inputFingerprint: string;
  readonly canonicalContentFingerprint: string;
  readonly basisKind: string;
  readonly posePresetId: string;
  readonly bodySourceRevision: string;
  readonly garmentPositionsSha256: string;
}

export interface BetaSkirtRenderedBodyCollisionDiagnosticInputV1 {
  readonly binding: BetaSkirtRenderedBodyCollisionDiagnosticBindingV1;
  readonly bodyPositionsM: Float32Array;
  readonly bodyTriangles: Uint32Array;
  readonly garmentPositionsM: Float32Array;
  readonly garmentTriangles: Uint32Array;
  readonly garmentUniformScale: number;
  readonly garmentTranslationM: readonly [number, number, number];
}

export interface BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1 {
  readonly maxBodyVertices: number;
  readonly maxBodyTriangles: number;
  readonly maxGarmentVertices: number;
  readonly maxGarmentTriangles: number;
  readonly maxInputBytes: number;
  readonly maxDistanceTriangleTests: number;
  readonly maxRayTriangleTests: number;
  readonly maxBroadPhaseGridCells: number;
  readonly maxBroadPhaseCellReferences: number;
  readonly maxBroadPhaseCellPairVisits: number;
  readonly maxBroadPhaseCandidatePairs: number;
  readonly unsafeClearanceMarginM: number;
  readonly absoluteEpsilonM: number;
  readonly relativeEpsilon: number;
}

export interface BetaSkirtRenderedBodyCollisionDiagnosticReportV1 {
  readonly version: typeof BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V1;
  readonly status: 'signed-clearance-measured' | 'signed-clearance-blocked';
  readonly binding: BetaSkirtRenderedBodyCollisionDiagnosticBindingV1;
  readonly contentFingerprintSha256: string;
  readonly coordinateFrame: 'rendered-world-meters';
  readonly topology: Readonly<{
    bodyClosedTwoManifold: boolean;
    bodySingleComponent: boolean;
    bodyConsistentEdgeWinding: boolean;
    bodyDegenerateTriangleCount: number;
    bodyDuplicateTriangleCount: number;
    bodyBoundaryOrNonManifoldEdgeCount: number;
    bodyInconsistentWindingEdgeCount: number;
    bodyNonManifoldVertexCount: number;
    bodyConnectedComponentCount: number;
    bodySignedVolumeM3: number;
  }>;
  readonly intersections: Readonly<{
    bodySelfIntersectionCount: number | null;
    garmentSelfIntersectionCount: number | null;
    bodyGarmentTriangleIntersectionCount: number | null;
  }>;
  readonly clearance: Readonly<{
    minimumUnsignedClearanceM: number | null;
    belowUnsignedMarginVertexCount: number | null;
    minimumSignedClearanceM: number | null;
    penetratingVertexCount: number | null;
    unsafeVertexCount: number | null;
    ambiguousSignVertexCount: number | null;
    unsafeClearanceMarginM: number;
  }>;
  readonly limits: BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1;
  readonly usage: Readonly<{
    inputByteLength: number;
    bodyVertexCount: number;
    bodyTriangleCount: number;
    garmentVertexCount: number;
    garmentTriangleCount: number;
    bvhNodeCount: number;
    distanceBvhNodeVisitCount: number;
    distanceTriangleTestCount: number;
    rayBvhNodeVisitCount: number;
    rayTriangleTestCount: number;
    broadPhaseGridCellCount: number | null;
    broadPhaseCellReferenceCount: number | null;
    broadPhaseCellPairVisitCount: number | null;
    broadPhaseCandidatePairCount: number | null;
    broadPhaseTestedPairCount: number | null;
    wallTimeMs: number;
  }>;
  readonly blockers: readonly BetaSkirtRenderedBodyCollisionDiagnosticBlockerV1[];
  readonly claims: Readonly<{
    exactRenderedPairMeasured: true;
    analyticalCapsulesUsed: false;
    signedClassificationDefensible: boolean;
    initializationAdmitted: false;
    fitClaimed: false;
    runtimeAuthorityClaimed: false;
    productionAuthorityClaimed: false;
  }>;
}

interface MeshCounts {
  readonly bodyVertexCount: number;
  readonly bodyTriangleCount: number;
  readonly garmentVertexCount: number;
  readonly garmentTriangleCount: number;
  readonly inputByteLength: number;
}

interface TopologyAudit {
  readonly closedTwoManifold: boolean;
  readonly singleComponent: boolean;
  readonly consistentEdgeWinding: boolean;
  readonly degenerateTriangleCount: number;
  readonly duplicateTriangleCount: number;
  readonly boundaryOrNonManifoldEdgeCount: number;
  readonly inconsistentWindingEdgeCount: number;
  readonly nonManifoldVertexCount: number;
  readonly connectedComponentCount: number;
  readonly signedVolumeM3: number;
}

interface TriangleBvhNode {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
  readonly left: number;
  readonly right: number;
  readonly start: number;
  readonly count: number;
}

interface TriangleBvh {
  readonly positions: Float32Array;
  readonly triangles: Uint32Array;
  readonly triangleOrder: Uint32Array;
  readonly nodes: readonly TriangleBvhNode[];
}

const SHA256 = /^[0-9a-f]{64}$/u;
const textEncoder = new TextEncoder();
const TEXT_ENCODER_ENCODE = TextEncoder.prototype.encode;
const JSON_STRINGIFY = JSON.stringify;
const REFLECT_APPLY = Reflect.apply;
const ARRAY_BUFFER_PROTOTYPE = ArrayBuffer.prototype;
const ARRAY_BUFFER_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  ARRAY_BUFFER_PROTOTYPE,
  'byteLength',
)?.get;
const FLOAT32_ARRAY_PROTOTYPE = Float32Array.prototype;
const UINT32_ARRAY_PROTOTYPE = Uint32Array.prototype;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(FLOAT32_ARRAY_PROTOTYPE) as object;
const TYPED_ARRAY_BUFFER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'buffer')?.get;
const TYPED_ARRAY_LENGTH = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, 'length')?.get;
const TYPED_ARRAY_BYTE_OFFSET = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteOffset',
)?.get;
const TYPED_ARRAY_BYTE_LENGTH = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
)?.get;
const FLOAT32_ARRAY_SET = Float32Array.prototype.set;
const UINT32_ARRAY_SET = Uint32Array.prototype.set;
const INPUT_KEYS = Object.freeze([
  'binding',
  'bodyPositionsM',
  'bodyTriangles',
  'garmentPositionsM',
  'garmentTriangles',
  'garmentUniformScale',
  'garmentTranslationM',
] as const);
const BINDING_KEYS = Object.freeze([
  'compositionGeneration',
  'snapshotGeneration',
  'modelId',
  'modelContentRevision',
  'inputFingerprint',
  'canonicalContentFingerprint',
  'basisKind',
  'posePresetId',
  'bodySourceRevision',
  'garmentPositionsSha256',
] as const);
const POLICY_KEYS = Object.freeze([
  'maxBodyVertices',
  'maxBodyTriangles',
  'maxGarmentVertices',
  'maxGarmentTriangles',
  'maxInputBytes',
  'maxDistanceTriangleTests',
  'maxRayTriangleTests',
  'maxBroadPhaseGridCells',
  'maxBroadPhaseCellReferences',
  'maxBroadPhaseCellPairVisits',
  'maxBroadPhaseCandidatePairs',
  'unsafeClearanceMarginM',
  'absoluteEpsilonM',
  'relativeEpsilon',
] as const);
const RAY_DIRECTIONS: readonly (readonly [number, number, number])[] = Object.freeze([
  [1, 0.3713906763541037, 0.1937129433613962] as const,
  [0.219438401739403, 1, 0.413879781155325] as const,
  [0.317022238725803, 0.233891391482773, 1] as const,
]);

function dataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${label} must be a plain record.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError(`${label} must be a plain record.`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.some((key) => typeof key !== 'string' || !allowedKeys.some((expected) => expected === key))
  )
    throw new TypeError(`${label} has an unsupported shape.`);
  const snapshot: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    )
      throw new TypeError(`${label}.${key} must be an enumerable data property.`);
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function exactDataRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  const snapshot = dataRecord(value, expectedKeys, label);
  if (Object.keys(snapshot).length !== expectedKeys.length)
    throw new TypeError(`${label} has an unsupported shape.`);
  return snapshot;
}

function exactTriple(value: unknown, label: string): readonly [number, number, number] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    throw new TypeError(`${label} must be one exact XYZ tuple.`);
  const keys = Reflect.ownKeys(value);
  const expected = ['0', '1', '2', 'length'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]))
    throw new TypeError(`${label} must be one exact XYZ tuple.`);
  const values: number[] = [];
  for (const key of ['0', '1', '2']) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      typeof descriptor.value !== 'number' ||
      !Number.isFinite(descriptor.value)
    )
      throw new TypeError(`${label} must contain finite data properties.`);
    values.push(descriptor.value);
  }
  return Object.freeze(values) as unknown as readonly [number, number, number];
}

function snapshotTypedArray<T extends Float32Array | Uint32Array>(
  value: unknown,
  expectedPrototype: object,
  bytesPerElement: number,
  set: (this: T, source: ArrayLike<number>, offset?: number) => void,
  create: (length: number) => T,
  label: string,
): Readonly<{ value: T; sourceBuffer: ArrayBuffer }> {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== expectedPrototype ||
    !TYPED_ARRAY_BUFFER ||
    !TYPED_ARRAY_LENGTH ||
    !TYPED_ARRAY_BYTE_OFFSET ||
    !TYPED_ARRAY_BYTE_LENGTH ||
    !ARRAY_BUFFER_BYTE_LENGTH
  )
    throw new TypeError(`${label} must be an exact owned typed array.`);
  let buffer: unknown;
  let length: unknown;
  let byteOffset: unknown;
  let byteLength: unknown;
  let bufferByteLength: unknown;
  try {
    buffer = TYPED_ARRAY_BUFFER.call(value);
    length = TYPED_ARRAY_LENGTH.call(value);
    byteOffset = TYPED_ARRAY_BYTE_OFFSET.call(value);
    byteLength = TYPED_ARRAY_BYTE_LENGTH.call(value);
    bufferByteLength = ARRAY_BUFFER_BYTE_LENGTH.call(buffer);
  } catch {
    throw new TypeError(`${label} must be a genuine typed array.`);
  }
  if (
    !(buffer instanceof ArrayBuffer) ||
    Object.getPrototypeOf(buffer) !== ARRAY_BUFFER_PROTOTYPE ||
    !Number.isSafeInteger(length) ||
    !Number.isSafeInteger(byteLength) ||
    byteOffset !== 0 ||
    byteLength !== bufferByteLength ||
    byteLength !== (length as number) * bytesPerElement
  )
    throw new TypeError(`${label} must use one complete ordinary ArrayBuffer.`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== length ||
    keys.some((key, index) => typeof key !== 'string' || key !== String(index))
  )
    throw new TypeError(`${label} must be an undecorated typed array.`);
  if (Reflect.ownKeys(buffer).length !== 0)
    throw new TypeError(`${label}.buffer must be undecorated.`);
  const owned = create(length as number);
  set.call(owned, value as ArrayLike<number>);
  return Object.freeze({ value: owned, sourceBuffer: buffer });
}

function finitePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

function snapshotPolicy(
  input: BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1 | undefined,
): BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1 {
  const policy = exactDataRecord(
    input ?? BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1,
    POLICY_KEYS,
    'collision diagnostic policy',
  ) as unknown as BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1;
  const snapshot = {
    maxBodyVertices: finitePositiveInteger(policy.maxBodyVertices, 'maxBodyVertices'),
    maxBodyTriangles: finitePositiveInteger(policy.maxBodyTriangles, 'maxBodyTriangles'),
    maxGarmentVertices: finitePositiveInteger(policy.maxGarmentVertices, 'maxGarmentVertices'),
    maxGarmentTriangles: finitePositiveInteger(policy.maxGarmentTriangles, 'maxGarmentTriangles'),
    maxInputBytes: finitePositiveInteger(policy.maxInputBytes, 'maxInputBytes'),
    maxDistanceTriangleTests: finitePositiveInteger(
      policy.maxDistanceTriangleTests,
      'maxDistanceTriangleTests',
    ),
    maxRayTriangleTests: finitePositiveInteger(policy.maxRayTriangleTests, 'maxRayTriangleTests'),
    maxBroadPhaseGridCells: finitePositiveInteger(
      policy.maxBroadPhaseGridCells,
      'maxBroadPhaseGridCells',
    ),
    maxBroadPhaseCellReferences: finitePositiveInteger(
      policy.maxBroadPhaseCellReferences,
      'maxBroadPhaseCellReferences',
    ),
    maxBroadPhaseCellPairVisits: finitePositiveInteger(
      policy.maxBroadPhaseCellPairVisits,
      'maxBroadPhaseCellPairVisits',
    ),
    maxBroadPhaseCandidatePairs: finitePositiveInteger(
      policy.maxBroadPhaseCandidatePairs,
      'maxBroadPhaseCandidatePairs',
    ),
    unsafeClearanceMarginM: policy.unsafeClearanceMarginM,
    absoluteEpsilonM: policy.absoluteEpsilonM,
    relativeEpsilon: policy.relativeEpsilon,
  };
  for (const key of ['unsafeClearanceMarginM', 'absoluteEpsilonM', 'relativeEpsilon'] as const) {
    if (!Number.isFinite(snapshot[key]) || snapshot[key] <= 0)
      throw new RangeError(`${key} must be finite and positive.`);
  }
  return Object.freeze(snapshot);
}

function snapshotBinding(value: unknown): BetaSkirtRenderedBodyCollisionDiagnosticBindingV1 {
  const data = exactDataRecord(value, BINDING_KEYS, 'collision diagnostic binding');
  if (
    !Number.isSafeInteger(data.compositionGeneration) ||
    (data.compositionGeneration as number) <= 0
  )
    throw new TypeError('compositionGeneration is invalid.');
  if (!Number.isSafeInteger(data.snapshotGeneration) || (data.snapshotGeneration as number) <= 0)
    throw new TypeError('snapshotGeneration is invalid.');
  const strings = [
    data.modelId,
    data.modelContentRevision,
    data.inputFingerprint,
    data.canonicalContentFingerprint,
    data.basisKind,
    data.posePresetId,
    data.bodySourceRevision,
    data.garmentPositionsSha256,
  ];
  if (strings.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 1024))
    throw new TypeError('Diagnostic binding contains an invalid string.');
  if (!SHA256.test(data.garmentPositionsSha256 as string))
    throw new TypeError('Garment positions SHA-256 is invalid.');
  return Object.freeze({
    compositionGeneration: data.compositionGeneration as number,
    snapshotGeneration: data.snapshotGeneration as number,
    modelId: data.modelId as string,
    modelContentRevision: data.modelContentRevision as string,
    inputFingerprint: data.inputFingerprint as string,
    canonicalContentFingerprint: data.canonicalContentFingerprint as string,
    basisKind: data.basisKind as string,
    posePresetId: data.posePresetId as string,
    bodySourceRevision: data.bodySourceRevision as string,
    garmentPositionsSha256: data.garmentPositionsSha256 as string,
  });
}

export function snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1(
  value: BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
): BetaSkirtRenderedBodyCollisionDiagnosticInputV1 {
  const data = exactDataRecord(value, INPUT_KEYS, 'collision diagnostic input');
  const bodyPositions = snapshotTypedArray<Float32Array>(
    data.bodyPositionsM,
    FLOAT32_ARRAY_PROTOTYPE,
    Float32Array.BYTES_PER_ELEMENT,
    FLOAT32_ARRAY_SET,
    (length) => new Float32Array(length),
    'bodyPositionsM',
  );
  const bodyTriangles = snapshotTypedArray<Uint32Array>(
    data.bodyTriangles,
    UINT32_ARRAY_PROTOTYPE,
    Uint32Array.BYTES_PER_ELEMENT,
    UINT32_ARRAY_SET,
    (length) => new Uint32Array(length),
    'bodyTriangles',
  );
  const garmentPositions = snapshotTypedArray<Float32Array>(
    data.garmentPositionsM,
    FLOAT32_ARRAY_PROTOTYPE,
    Float32Array.BYTES_PER_ELEMENT,
    FLOAT32_ARRAY_SET,
    (length) => new Float32Array(length),
    'garmentPositionsM',
  );
  const garmentTriangles = snapshotTypedArray<Uint32Array>(
    data.garmentTriangles,
    UINT32_ARRAY_PROTOTYPE,
    Uint32Array.BYTES_PER_ELEMENT,
    UINT32_ARRAY_SET,
    (length) => new Uint32Array(length),
    'garmentTriangles',
  );
  const sourceBuffers = [
    bodyPositions.sourceBuffer,
    bodyTriangles.sourceBuffer,
    garmentPositions.sourceBuffer,
    garmentTriangles.sourceBuffer,
  ];
  if (new Set(sourceBuffers).size !== sourceBuffers.length)
    throw new TypeError('Collision diagnostic typed arrays must not alias one buffer.');
  if (typeof data.garmentUniformScale !== 'number')
    throw new TypeError('Garment uniform scale is invalid.');
  return Object.freeze({
    binding: snapshotBinding(data.binding),
    bodyPositionsM: bodyPositions.value,
    bodyTriangles: bodyTriangles.value,
    garmentPositionsM: garmentPositions.value,
    garmentTriangles: garmentTriangles.value,
    garmentUniformScale: data.garmentUniformScale,
    garmentTranslationM: exactTriple(data.garmentTranslationM, 'garmentTranslationM'),
  });
}

function validateMesh(
  positions: Float32Array,
  triangles: Uint32Array,
  label: string,
): Readonly<{ vertexCount: number; triangleCount: number }> {
  if (
    !(positions instanceof Float32Array) ||
    Object.getPrototypeOf(positions) !== Float32Array.prototype
  )
    throw new TypeError(`${label} positions must be an exact Float32Array.`);
  if (
    !(triangles instanceof Uint32Array) ||
    Object.getPrototypeOf(triangles) !== Uint32Array.prototype
  )
    throw new TypeError(`${label} triangles must be an exact Uint32Array.`);
  if (positions.length < 9 || positions.length % 3 !== 0)
    throw new RangeError(`${label} positions have an invalid XYZ layout.`);
  if (triangles.length < 3 || triangles.length % 3 !== 0)
    throw new RangeError(`${label} triangles have an invalid layout.`);
  const vertexCount = positions.length / 3;
  const triangleCount = triangles.length / 3;
  for (let index = 0; index < positions.length; index += 1) {
    if (!Number.isFinite(positions[index]))
      throw new TypeError(`${label} position ${index} is not finite.`);
  }
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset];
    const b = triangles[offset + 1];
    const c = triangles[offset + 2];
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount || a === b || b === c || c === a)
      throw new RangeError(`${label} triangle ${offset / 3} is invalid.`);
  }
  return Object.freeze({ vertexCount, triangleCount });
}

function preflight(
  input: BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  policy: BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1,
): MeshCounts {
  const body = validateMesh(input.bodyPositionsM, input.bodyTriangles, 'body');
  const garment = validateMesh(input.garmentPositionsM, input.garmentTriangles, 'garment');
  if (body.vertexCount > policy.maxBodyVertices || body.triangleCount > policy.maxBodyTriangles)
    throw new RangeError('Body geometry exceeds the diagnostic resource budget.');
  if (
    garment.vertexCount > policy.maxGarmentVertices ||
    garment.triangleCount > policy.maxGarmentTriangles
  )
    throw new RangeError('Garment geometry exceeds the diagnostic resource budget.');
  if (!Number.isFinite(input.garmentUniformScale) || input.garmentUniformScale <= 0)
    throw new TypeError('Garment uniform scale is invalid.');
  if (input.garmentTranslationM.length !== 3 || !input.garmentTranslationM.every(Number.isFinite))
    throw new TypeError('Garment translation is invalid.');
  const inputByteLength =
    input.bodyPositionsM.byteLength +
    input.bodyTriangles.byteLength +
    input.garmentPositionsM.byteLength +
    input.garmentTriangles.byteLength;
  if (!Number.isSafeInteger(inputByteLength) || inputByteLength > policy.maxInputBytes)
    throw new RangeError('Geometry bytes exceed the diagnostic resource budget.');
  return Object.freeze({
    bodyVertexCount: body.vertexCount,
    bodyTriangleCount: body.triangleCount,
    garmentVertexCount: garment.vertexCount,
    garmentTriangleCount: garment.triangleCount,
    inputByteLength,
  });
}

function transformGarment(
  positions: Float32Array,
  scale: number,
  translation: readonly [number, number, number],
): Float32Array {
  const world = new Float32Array(positions.length);
  for (let index = 0; index < positions.length; index += 3) {
    world[index] = positions[index] * scale + translation[0];
    world[index + 1] = positions[index + 1] * scale + translation[1];
    world[index + 2] = positions[index + 2] * scale + translation[2];
  }
  return world;
}

function topologyAudit(
  positions: Float32Array,
  triangles: Uint32Array,
  epsilonM: number,
): TopologyAudit {
  const vertexCount = positions.length / 3;
  const edgeCount = new Map<number, number>();
  const edgeWinding = new Map<number, number>();
  const faceKeys = new Set<string>();
  const parents = Uint32Array.from({ length: vertexCount }, (_, index) => index);
  const used = new Uint8Array(vertexCount);
  const links = Array.from({ length: vertexCount }, () => new Map<number, Set<number>>());
  const find = (vertex: number): number => {
    let root = vertex;
    while (parents[root] !== root) root = parents[root];
    while (parents[vertex] !== vertex) {
      const next = parents[vertex];
      parents[vertex] = root;
      vertex = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  let degenerateTriangleCount = 0;
  let duplicateTriangleCount = 0;
  let signedVolumeM3 = 0;
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset];
    const b = triangles[offset + 1];
    const c = triangles[offset + 2];
    used[a] = 1;
    used[b] = 1;
    used[c] = 1;
    union(a, b);
    union(a, c);
    const faceKey = [a, b, c].sort((left, right) => left - right).join(':');
    if (faceKeys.has(faceKey)) duplicateTriangleCount += 1;
    faceKeys.add(faceKey);
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const bz = positions[b * 3 + 2];
    const cx = positions[c * 3];
    const cy = positions[c * 3 + 1];
    const cz = positions[c * 3 + 2];
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const longestEdge = Math.max(
      Math.hypot(abx, aby, abz),
      Math.hypot(cx - bx, cy - by, cz - bz),
      Math.hypot(acx, acy, acz),
    );
    if (Math.hypot(crossX, crossY, crossZ) <= epsilonM * longestEdge) degenerateTriangleCount += 1;
    signedVolumeM3 +=
      (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const low = Math.min(from, to);
      const high = Math.max(from, to);
      const key = low * vertexCount + high;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      edgeWinding.set(key, (edgeWinding.get(key) ?? 0) + (from === low ? 1 : -1));
    }
    for (const [vertex, left, right] of [
      [a, b, c],
      [b, c, a],
      [c, a, b],
    ] as const) {
      const link = links[vertex];
      if (!link.has(left)) link.set(left, new Set());
      if (!link.has(right)) link.set(right, new Set());
      link.get(left)!.add(right);
      link.get(right)!.add(left);
    }
  }
  const boundaryOrNonManifoldEdgeCount = [...edgeCount.values()].filter(
    (count) => count !== 2,
  ).length;
  const inconsistentWindingEdgeCount = [...edgeWinding.values()].filter(
    (winding) => winding !== 0,
  ).length;
  const componentRoots = new Set<number>();
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (used[vertex]) componentRoots.add(find(vertex));
  }
  const connectedComponentCount = componentRoots.size + used.filter((value) => value === 0).length;
  let nonManifoldVertexCount = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const link = links[vertex];
    if (
      !used[vertex] ||
      link.size === 0 ||
      [...link.values()].some((neighbors) => neighbors.size !== 2)
    ) {
      nonManifoldVertexCount += 1;
      continue;
    }
    const [start] = link.keys();
    const visited = new Set<number>([start]);
    const pending = [start];
    while (pending.length > 0) {
      for (const next of link.get(pending.pop()!) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          pending.push(next);
        }
      }
    }
    if (visited.size !== link.size) nonManifoldVertexCount += 1;
  }
  return Object.freeze({
    closedTwoManifold: boundaryOrNonManifoldEdgeCount === 0,
    singleComponent: connectedComponentCount === 1,
    consistentEdgeWinding: inconsistentWindingEdgeCount === 0,
    degenerateTriangleCount,
    duplicateTriangleCount,
    boundaryOrNonManifoldEdgeCount,
    inconsistentWindingEdgeCount,
    nonManifoldVertexCount,
    connectedComponentCount,
    signedVolumeM3,
  });
}

function pointTriangleDistanceSquared(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const dx = px - (ax + v * abx);
    const dy = py - (ay + v * aby);
    const dz = pz - (az + v * abz);
    return dx * dx + dy * dy + dz * dz;
  }
  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const dx = px - (ax + w * acx);
    const dy = py - (ay + w * acy);
    const dz = pz - (az + w * acz);
    return dx * dx + dy * dy + dz * dz;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + d5 - d6);
    const dx = px - (bx + w * (cx - bx));
    const dy = py - (by + w * (cy - by));
    const dz = pz - (bz + w * (cz - bz));
    return dx * dx + dy * dy + dz * dz;
  }
  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  const dx = px - (ax + abx * v + acx * w);
  const dy = py - (ay + aby * v + acy * w);
  const dz = pz - (az + abz * v + acz * w);
  return dx * dx + dy * dy + dz * dz;
}

function createTriangleBvh(positions: Float32Array, triangles: Uint32Array): TriangleBvh {
  const triangleCount = triangles.length / 3;
  const triangleOrder = Uint32Array.from({ length: triangleCount }, (_, index) => index);
  const nodes: TriangleBvhNode[] = [];
  const centroid = (triangle: number, axis: number): number => {
    const offset = triangle * 3;
    return (
      (positions[triangles[offset] * 3 + axis] +
        positions[triangles[offset + 1] * 3 + axis] +
        positions[triangles[offset + 2] * 3 + axis]) /
      3
    );
  };
  const build = (start: number, count: number): number => {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    const centroidMinimum = [Infinity, Infinity, Infinity];
    const centroidMaximum = [-Infinity, -Infinity, -Infinity];
    for (let index = start; index < start + count; index += 1) {
      const triangle = triangleOrder[index];
      const offset = triangle * 3;
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = triangles[offset + corner] * 3;
        minX = Math.min(minX, positions[vertex]);
        minY = Math.min(minY, positions[vertex + 1]);
        minZ = Math.min(minZ, positions[vertex + 2]);
        maxX = Math.max(maxX, positions[vertex]);
        maxY = Math.max(maxY, positions[vertex + 1]);
        maxZ = Math.max(maxZ, positions[vertex + 2]);
      }
      for (let axis = 0; axis < 3; axis += 1) {
        const value = centroid(triangle, axis);
        centroidMinimum[axis] = Math.min(centroidMinimum[axis], value);
        centroidMaximum[axis] = Math.max(centroidMaximum[axis], value);
      }
    }
    const nodeIndex = nodes.length;
    nodes.push({ minX, minY, minZ, maxX, maxY, maxZ, left: -1, right: -1, start, count });
    if (count <= 8) return nodeIndex;
    const spans = centroidMaximum.map((value, axis) => value - centroidMinimum[axis]);
    const axis = spans[0] >= spans[1] && spans[0] >= spans[2] ? 0 : spans[1] >= spans[2] ? 1 : 2;
    const sorted = Array.from(triangleOrder.subarray(start, start + count)).sort(
      (left, right) => centroid(left, axis) - centroid(right, axis) || left - right,
    );
    triangleOrder.set(sorted, start);
    const leftCount = Math.floor(count / 2);
    const left = build(start, leftCount);
    const right = build(start + leftCount, count - leftCount);
    nodes[nodeIndex] = { minX, minY, minZ, maxX, maxY, maxZ, left, right, start: 0, count: 0 };
    return nodeIndex;
  };
  build(0, triangleCount);
  return Object.freeze({
    positions,
    triangles,
    triangleOrder,
    nodes: Object.freeze(nodes.map((node) => Object.freeze(node))),
  });
}

function pointAabbDistanceSquared(
  px: number,
  py: number,
  pz: number,
  node: TriangleBvhNode,
): number {
  const dx = px < node.minX ? node.minX - px : px > node.maxX ? px - node.maxX : 0;
  const dy = py < node.minY ? node.minY - py : py > node.maxY ? py - node.maxY : 0;
  const dz = pz < node.minZ ? node.minZ - pz : pz > node.maxZ ? pz - node.maxZ : 0;
  return dx * dx + dy * dy + dz * dz;
}

function nearestDistanceSquared(
  px: number,
  py: number,
  pz: number,
  bvh: TriangleBvh,
): Readonly<{ distanceSquared: number; triangleTestCount: number; nodeVisitCount: number }> {
  let distanceSquared = Infinity;
  let triangleTestCount = 0;
  let nodeVisitCount = 0;
  const pending = [0];
  while (pending.length > 0) {
    const node = bvh.nodes[pending.pop()!];
    nodeVisitCount += 1;
    if (pointAabbDistanceSquared(px, py, pz, node) >= distanceSquared) continue;
    if (node.count > 0) {
      for (let local = 0; local < node.count; local += 1) {
        const triangle = bvh.triangleOrder[node.start + local];
        const offset = triangle * 3;
        const a = bvh.triangles[offset] * 3;
        const b = bvh.triangles[offset + 1] * 3;
        const c = bvh.triangles[offset + 2] * 3;
        distanceSquared = Math.min(
          distanceSquared,
          pointTriangleDistanceSquared(
            px,
            py,
            pz,
            bvh.positions[a],
            bvh.positions[a + 1],
            bvh.positions[a + 2],
            bvh.positions[b],
            bvh.positions[b + 1],
            bvh.positions[b + 2],
            bvh.positions[c],
            bvh.positions[c + 1],
            bvh.positions[c + 2],
          ),
        );
        triangleTestCount += 1;
      }
      continue;
    }
    const leftDistance = pointAabbDistanceSquared(px, py, pz, bvh.nodes[node.left]);
    const rightDistance = pointAabbDistanceSquared(px, py, pz, bvh.nodes[node.right]);
    if (leftDistance < rightDistance) pending.push(node.right, node.left);
    else pending.push(node.left, node.right);
  }
  return Object.freeze({ distanceSquared, triangleTestCount, nodeVisitCount });
}

function unsignedClearances(
  garmentPositions: Float32Array,
  bvh: TriangleBvh,
  marginM: number,
): Readonly<{
  distancesM: Float64Array;
  minimumM: number;
  belowMarginVertexCount: number;
  testCount: number;
  nodeVisitCount: number;
}> {
  const distancesM = new Float64Array(garmentPositions.length / 3);
  let minimumM = Infinity;
  let belowMarginVertexCount = 0;
  let testCount = 0;
  let nodeVisitCount = 0;
  for (let vertex = 0; vertex < distancesM.length; vertex += 1) {
    const nearest = nearestDistanceSquared(
      garmentPositions[vertex * 3],
      garmentPositions[vertex * 3 + 1],
      garmentPositions[vertex * 3 + 2],
      bvh,
    );
    testCount += nearest.triangleTestCount;
    nodeVisitCount += nearest.nodeVisitCount;
    const distanceM = Math.sqrt(nearest.distanceSquared);
    distancesM[vertex] = distanceM;
    minimumM = Math.min(minimumM, distanceM);
    if (distanceM < marginM) belowMarginVertexCount += 1;
  }
  return Object.freeze({
    distancesM,
    minimumM,
    belowMarginVertexCount,
    testCount,
    nodeVisitCount,
  });
}

function rayIntersectsAabb(
  px: number,
  py: number,
  pz: number,
  direction: readonly [number, number, number],
  node: TriangleBvhNode,
  epsilonM: number,
): boolean {
  let minimumT = 0;
  let maximumT = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = axis === 0 ? px : axis === 1 ? py : pz;
    const minimum = axis === 0 ? node.minX : axis === 1 ? node.minY : node.minZ;
    const maximum = axis === 0 ? node.maxX : axis === 1 ? node.maxY : node.maxZ;
    const inverse = 1 / direction[axis];
    let first = (minimum - origin) * inverse;
    let second = (maximum - origin) * inverse;
    if (first > second) [first, second] = [second, first];
    minimumT = Math.max(minimumT, first);
    maximumT = Math.min(maximumT, second);
    if (maximumT < Math.max(minimumT, epsilonM)) return false;
  }
  return true;
}

function rayParity(
  px: number,
  py: number,
  pz: number,
  direction: readonly [number, number, number],
  bvh: TriangleBvh,
  epsilonM: number,
): Readonly<{ inside: boolean | null; testCount: number; nodeVisitCount: number }> {
  let intersections = 0;
  let ambiguous = false;
  let testCount = 0;
  let nodeVisitCount = 0;
  const [dx, dy, dz] = direction;
  const pending = [0];
  while (pending.length > 0) {
    const node = bvh.nodes[pending.pop()!];
    nodeVisitCount += 1;
    if (!rayIntersectsAabb(px, py, pz, direction, node, epsilonM)) continue;
    if (node.count === 0) {
      pending.push(node.left, node.right);
      continue;
    }
    for (let local = 0; local < node.count; local += 1) {
      const triangle = bvh.triangleOrder[node.start + local];
      const offset = triangle * 3;
      const ai = bvh.triangles[offset] * 3;
      const bi = bvh.triangles[offset + 1] * 3;
      const ci = bvh.triangles[offset + 2] * 3;
      const ax = bvh.positions[ai];
      const ay = bvh.positions[ai + 1];
      const az = bvh.positions[ai + 2];
      const e1x = bvh.positions[bi] - ax;
      const e1y = bvh.positions[bi + 1] - ay;
      const e1z = bvh.positions[bi + 2] - az;
      const e2x = bvh.positions[ci] - ax;
      const e2y = bvh.positions[ci + 1] - ay;
      const e2z = bvh.positions[ci + 2] - az;
      const hx = dy * e2z - dz * e2y;
      const hy = dz * e2x - dx * e2z;
      const hz = dx * e2y - dy * e2x;
      const determinant = e1x * hx + e1y * hy + e1z * hz;
      testCount += 1;
      if (Math.abs(determinant) <= epsilonM) continue;
      const inverse = 1 / determinant;
      const sx = px - ax;
      const sy = py - ay;
      const sz = pz - az;
      const u = inverse * (sx * hx + sy * hy + sz * hz);
      if (u < -epsilonM || u > 1 + epsilonM) continue;
      const qx = sy * e1z - sz * e1y;
      const qy = sz * e1x - sx * e1z;
      const qz = sx * e1y - sy * e1x;
      const v = inverse * (dx * qx + dy * qy + dz * qz);
      if (v < -epsilonM || u + v > 1 + epsilonM) continue;
      const t = inverse * (e2x * qx + e2y * qy + e2z * qz);
      if (t <= epsilonM) continue;
      if (u <= epsilonM || v <= epsilonM || 1 - u - v <= epsilonM) ambiguous = true;
      else intersections += 1;
    }
  }
  return Object.freeze({
    inside: ambiguous ? null : intersections % 2 === 1,
    testCount,
    nodeVisitCount,
  });
}

function signedClearances(
  garmentPositions: Float32Array,
  unsignedDistancesM: Float64Array,
  bvh: TriangleBvh,
  epsilonM: number,
  marginM: number,
): Readonly<{
  minimumSignedM: number | null;
  penetratingVertexCount: number | null;
  unsafeVertexCount: number | null;
  ambiguousSignVertexCount: number;
  testCount: number;
  nodeVisitCount: number;
}> {
  let minimumSignedM = Infinity;
  let penetratingVertexCount = 0;
  let unsafeVertexCount = 0;
  let ambiguousSignVertexCount = 0;
  let testCount = 0;
  let nodeVisitCount = 0;
  for (let vertex = 0; vertex < unsignedDistancesM.length; vertex += 1) {
    if (unsignedDistancesM[vertex] <= epsilonM) {
      ambiguousSignVertexCount += 1;
      continue;
    }
    const votes: boolean[] = [];
    for (const direction of RAY_DIRECTIONS) {
      const parity = rayParity(
        garmentPositions[vertex * 3],
        garmentPositions[vertex * 3 + 1],
        garmentPositions[vertex * 3 + 2],
        direction,
        bvh,
        epsilonM,
      );
      testCount += parity.testCount;
      nodeVisitCount += parity.nodeVisitCount;
      if (parity.inside !== null) votes.push(parity.inside);
    }
    if (votes.length < 2 || votes.some((value) => value !== votes[0])) {
      ambiguousSignVertexCount += 1;
      continue;
    }
    const signedM = votes[0] ? -unsignedDistancesM[vertex] : unsignedDistancesM[vertex];
    minimumSignedM = Math.min(minimumSignedM, signedM);
    if (signedM < 0) penetratingVertexCount += 1;
    if (signedM < marginM) unsafeVertexCount += 1;
  }
  if (ambiguousSignVertexCount > 0)
    return Object.freeze({
      minimumSignedM: null,
      penetratingVertexCount: null,
      unsafeVertexCount: null,
      ambiguousSignVertexCount,
      testCount,
      nodeVisitCount,
    });
  return Object.freeze({
    minimumSignedM,
    penetratingVertexCount,
    unsafeVertexCount,
    ambiguousSignVertexCount,
    testCount,
    nodeVisitCount,
  });
}

function compositeMesh(
  bodyPositions: Float32Array,
  bodyTriangles: Uint32Array,
  garmentPositions: Float32Array,
  garmentTriangles: Uint32Array,
): Readonly<{ positions: Float32Array; triangles: Uint32Array }> {
  const bodyVertexCount = bodyPositions.length / 3;
  const positions = new Float32Array(bodyPositions.length + garmentPositions.length);
  positions.set(bodyPositions);
  positions.set(garmentPositions, bodyPositions.length);
  const triangles = new Uint32Array(bodyTriangles.length + garmentTriangles.length);
  triangles.set(bodyTriangles);
  for (let index = 0; index < garmentTriangles.length; index += 1)
    triangles[bodyTriangles.length + index] = garmentTriangles[index] + bodyVertexCount;
  return Object.freeze({ positions, triangles });
}

function selfIntersectionPolicy(
  policy: BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1,
): MeasurementSurfaceSelfIntersectionPolicyV1 {
  return Object.freeze({
    ...DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
    maxVertices: policy.maxBodyVertices + policy.maxGarmentVertices,
    maxTriangles: policy.maxBodyTriangles + policy.maxGarmentTriangles,
    maxInputBytes: policy.maxInputBytes,
    maxGridCells: policy.maxBroadPhaseGridCells,
    maxCellReferences: policy.maxBroadPhaseCellReferences,
    maxCellPairVisits: policy.maxBroadPhaseCellPairVisits,
    maxCandidatePairs: policy.maxBroadPhaseCandidatePairs,
    absoluteEpsilonM: policy.absoluteEpsilonM,
    relativeEpsilon: policy.relativeEpsilon,
  });
}

function canonicalBytes(
  input: BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
): Uint8Array<ArrayBuffer> {
  const header = REFLECT_APPLY(TEXT_ENCODER_ENCODE, textEncoder, [
    JSON_STRINGIFY({
      version: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V1,
      binding: input.binding,
      garmentUniformScale: input.garmentUniformScale,
      garmentTranslationM: [...input.garmentTranslationM],
      lengths: [
        input.bodyPositionsM.length,
        input.bodyTriangles.length,
        input.garmentPositionsM.length,
        input.garmentTriangles.length,
      ],
    }),
  ]);
  const byteLength =
    4 +
    header.byteLength +
    input.bodyPositionsM.byteLength +
    input.bodyTriangles.byteLength +
    input.garmentPositionsM.byteLength +
    input.garmentTriangles.byteLength;
  const bytes = new Uint8Array(new ArrayBuffer(byteLength));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, header.byteLength, true);
  bytes.set(header, 4);
  let offset = 4 + header.byteLength;
  const writeF32 = (values: Float32Array): void => {
    for (const value of values) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
  };
  const writeU32 = (values: Uint32Array): void => {
    for (const value of values) {
      view.setUint32(offset, value, true);
      offset += 4;
    }
  };
  writeF32(input.bodyPositionsM);
  writeU32(input.bodyTriangles);
  writeF32(input.garmentPositionsM);
  writeU32(input.garmentTriangles);
  return bytes;
}

async function fingerprint(
  input: BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  cryptoProvider: Crypto | null | undefined,
): Promise<string> {
  if (!cryptoProvider?.subtle || typeof cryptoProvider.subtle.digest !== 'function')
    throw new BetaSkirtRenderedBodyCollisionDiagnosticErrorV1(
      'sha256-unavailable',
      'SHA-256 is unavailable.',
    );
  const digest = await cryptoProvider.subtle.digest('SHA-256', canonicalBytes(input));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function pushOnce(
  blockers: BetaSkirtRenderedBodyCollisionDiagnosticBlockerV1[],
  blocker: BetaSkirtRenderedBodyCollisionDiagnosticBlockerV1,
): void {
  if (!blockers.includes(blocker)) blockers.push(blocker);
}

export interface BetaSkirtRenderedBodyCollisionDiagnosticOptionsV1 {
  readonly policy?: BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1;
  readonly crypto?: Crypto | null;
}

/**
 * Worker-targeted exact-pair diagnostic. It never consumes the analytical capsule shadow and never
 * promotes its observations into initialization, fit, runtime, or production authority.
 */
export async function evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1(
  input: BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  options: BetaSkirtRenderedBodyCollisionDiagnosticOptionsV1 = {},
): Promise<BetaSkirtRenderedBodyCollisionDiagnosticReportV1> {
  const startedAt = typeof performance === 'undefined' ? Date.now() : performance.now();
  let policy: BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1;
  let snapshot: BetaSkirtRenderedBodyCollisionDiagnosticInputV1;
  let binding: BetaSkirtRenderedBodyCollisionDiagnosticBindingV1;
  let counts: MeshCounts;
  let cryptoProvider: Crypto | null | undefined;
  try {
    const optionData = dataRecord(options, ['policy', 'crypto'], 'collision diagnostic options');
    policy = snapshotPolicy(
      optionData.policy as BetaSkirtRenderedBodyCollisionDiagnosticPolicyV1 | undefined,
    );
    snapshot = snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1(input);
    binding = snapshot.binding;
    counts = preflight(snapshot, policy);
    cryptoProvider = Object.prototype.hasOwnProperty.call(optionData, 'crypto')
      ? (optionData.crypto as Crypto | null | undefined)
      : globalThis.crypto;
  } catch (reason) {
    throw new BetaSkirtRenderedBodyCollisionDiagnosticErrorV1(
      reason instanceof RangeError ? 'budget-exhausted' : 'input-invalid',
      reason instanceof Error ? reason.message : 'Collision diagnostic input is invalid.',
    );
  }
  const distanceBudget = counts.garmentVertexCount * counts.bodyTriangleCount;
  if (!Number.isSafeInteger(distanceBudget) || distanceBudget > policy.maxDistanceTriangleTests)
    throw new BetaSkirtRenderedBodyCollisionDiagnosticErrorV1(
      'budget-exhausted',
      'Distance-triangle test budget exhausted.',
    );
  const rayBudget = distanceBudget * RAY_DIRECTIONS.length;
  if (!Number.isSafeInteger(rayBudget) || rayBudget > policy.maxRayTriangleTests)
    throw new BetaSkirtRenderedBodyCollisionDiagnosticErrorV1(
      'budget-exhausted',
      'Ray-triangle test budget exhausted.',
    );
  const contentFingerprintSha256 = await fingerprint(snapshot, cryptoProvider);
  const worldGarment = transformGarment(
    snapshot.garmentPositionsM,
    snapshot.garmentUniformScale,
    snapshot.garmentTranslationM,
  );
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of snapshot.bodyPositionsM) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  const epsilonM = Math.max(policy.absoluteEpsilonM, (maximum - minimum) * policy.relativeEpsilon);
  const topology = topologyAudit(snapshot.bodyPositionsM, snapshot.bodyTriangles, epsilonM);
  const blockers: BetaSkirtRenderedBodyCollisionDiagnosticBlockerV1[] = [];
  if (!topology.closedTwoManifold) pushOnce(blockers, 'body-topology-not-closed');
  if (!topology.consistentEdgeWinding) pushOnce(blockers, 'body-topology-winding-inconsistent');
  if (topology.nonManifoldVertexCount > 0) pushOnce(blockers, 'body-topology-nonmanifold-vertex');
  if (!topology.singleComponent) pushOnce(blockers, 'body-topology-not-single-component');
  if (topology.degenerateTriangleCount > 0) pushOnce(blockers, 'body-degenerate-triangle');
  if (topology.duplicateTriangleCount > 0) pushOnce(blockers, 'body-duplicate-triangle');

  let bodySelfIntersectionCount: number | null = null;
  let garmentSelfIntersectionCount: number | null = null;
  let bodyGarmentTriangleIntersectionCount: number | null = null;
  let broadPhaseGridCellCount: number | null = null;
  let broadPhaseCellReferenceCount: number | null = null;
  let broadPhaseCellPairVisitCount: number | null = null;
  let broadPhaseCandidatePairCount: number | null = null;
  let broadPhaseTestedPairCount: number | null = null;
  try {
    const combined = compositeMesh(
      snapshot.bodyPositionsM,
      snapshot.bodyTriangles,
      worldGarment,
      snapshot.garmentTriangles,
    );
    const report = validateMeasurementSurfaceSelfIntersectionV1(
      combined.positions,
      combined.triangles,
      selfIntersectionPolicy(policy),
    );
    bodySelfIntersectionCount = 0;
    garmentSelfIntersectionCount = 0;
    bodyGarmentTriangleIntersectionCount = 0;
    for (const pair of report.intersections) {
      const aIsBody = pair.triangleA < counts.bodyTriangleCount;
      const bIsBody = pair.triangleB < counts.bodyTriangleCount;
      if (aIsBody && bIsBody) bodySelfIntersectionCount += 1;
      else if (!aIsBody && !bIsBody) garmentSelfIntersectionCount += 1;
      else bodyGarmentTriangleIntersectionCount += 1;
    }
    broadPhaseGridCellCount = report.broadPhase.gridCellCount;
    broadPhaseCellReferenceCount = report.broadPhase.cellReferenceCount;
    broadPhaseCellPairVisitCount = report.broadPhase.cellPairVisitCount;
    broadPhaseCandidatePairCount = report.broadPhase.candidatePairCount;
    broadPhaseTestedPairCount = report.broadPhase.testedPairCount;
    if (bodySelfIntersectionCount > 0) pushOnce(blockers, 'body-self-intersection');
    if (bodyGarmentTriangleIntersectionCount > 0)
      pushOnce(blockers, 'body-garment-triangle-intersection');
  } catch (reason) {
    if (reason instanceof RangeError) pushOnce(blockers, 'budget-exhausted');
    else pushOnce(blockers, 'input-invalid');
  }

  const bodyBvh = createTriangleBvh(snapshot.bodyPositionsM, snapshot.bodyTriangles);
  const unsigned = unsignedClearances(worldGarment, bodyBvh, policy.unsafeClearanceMarginM);
  const topologyDefensible =
    topology.closedTwoManifold &&
    topology.singleComponent &&
    topology.consistentEdgeWinding &&
    topology.nonManifoldVertexCount === 0 &&
    topology.degenerateTriangleCount === 0 &&
    topology.duplicateTriangleCount === 0 &&
    bodySelfIntersectionCount === 0;
  let signed: ReturnType<typeof signedClearances> | null = null;
  if (topologyDefensible) {
    signed = signedClearances(
      worldGarment,
      unsigned.distancesM,
      bodyBvh,
      epsilonM,
      policy.unsafeClearanceMarginM,
    );
    if (signed.ambiguousSignVertexCount > 0) pushOnce(blockers, 'ambiguous-sign');
  } else pushOnce(blockers, 'ambiguous-sign');
  const signedClassificationDefensible =
    topologyDefensible && signed !== null && signed.ambiguousSignVertexCount === 0;

  return Object.freeze({
    version: BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_V1,
    status: signedClassificationDefensible
      ? ('signed-clearance-measured' as const)
      : ('signed-clearance-blocked' as const),
    binding,
    contentFingerprintSha256,
    coordinateFrame: 'rendered-world-meters' as const,
    topology: Object.freeze({
      bodyClosedTwoManifold: topology.closedTwoManifold,
      bodySingleComponent: topology.singleComponent,
      bodyConsistentEdgeWinding: topology.consistentEdgeWinding,
      bodyDegenerateTriangleCount: topology.degenerateTriangleCount,
      bodyDuplicateTriangleCount: topology.duplicateTriangleCount,
      bodyBoundaryOrNonManifoldEdgeCount: topology.boundaryOrNonManifoldEdgeCount,
      bodyInconsistentWindingEdgeCount: topology.inconsistentWindingEdgeCount,
      bodyNonManifoldVertexCount: topology.nonManifoldVertexCount,
      bodyConnectedComponentCount: topology.connectedComponentCount,
      bodySignedVolumeM3: topology.signedVolumeM3,
    }),
    intersections: Object.freeze({
      bodySelfIntersectionCount,
      garmentSelfIntersectionCount,
      bodyGarmentTriangleIntersectionCount,
    }),
    clearance: Object.freeze({
      minimumUnsignedClearanceM: unsigned.minimumM,
      belowUnsignedMarginVertexCount: unsigned.belowMarginVertexCount,
      minimumSignedClearanceM:
        signedClassificationDefensible && signed ? signed.minimumSignedM : null,
      penetratingVertexCount:
        signedClassificationDefensible && signed ? signed.penetratingVertexCount : null,
      unsafeVertexCount: signedClassificationDefensible && signed ? signed.unsafeVertexCount : null,
      ambiguousSignVertexCount: signed?.ambiguousSignVertexCount ?? null,
      unsafeClearanceMarginM: policy.unsafeClearanceMarginM,
    }),
    limits: policy,
    usage: Object.freeze({
      inputByteLength: counts.inputByteLength,
      bodyVertexCount: counts.bodyVertexCount,
      bodyTriangleCount: counts.bodyTriangleCount,
      garmentVertexCount: counts.garmentVertexCount,
      garmentTriangleCount: counts.garmentTriangleCount,
      bvhNodeCount: bodyBvh.nodes.length,
      distanceBvhNodeVisitCount: unsigned.nodeVisitCount,
      distanceTriangleTestCount: unsigned.testCount,
      rayBvhNodeVisitCount: signed?.nodeVisitCount ?? 0,
      rayTriangleTestCount: signed?.testCount ?? 0,
      broadPhaseGridCellCount,
      broadPhaseCellReferenceCount,
      broadPhaseCellPairVisitCount,
      broadPhaseCandidatePairCount,
      broadPhaseTestedPairCount,
      wallTimeMs: Math.max(
        0,
        (typeof performance === 'undefined' ? Date.now() : performance.now()) - startedAt,
      ),
    }),
    blockers: Object.freeze(blockers),
    claims: Object.freeze({
      exactRenderedPairMeasured: true as const,
      analyticalCapsulesUsed: false as const,
      signedClassificationDefensible,
      initializationAdmitted: false as const,
      fitClaimed: false as const,
      runtimeAuthorityClaimed: false as const,
      productionAuthorityClaimed: false as const,
    }),
  });
}
