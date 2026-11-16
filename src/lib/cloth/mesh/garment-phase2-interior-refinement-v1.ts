import {
  CLOTH_MESH_IR_VERSION,
  validateClothMeshIR,
  type ClothBoundarySample,
  type ClothMeshIR,
  type ClothMeshPieceRange,
  type ClothSeamMap,
} from './cloth-mesh-ir';
import {
  upgradeGarmentPhase2SampledClothMeshV1,
  type GarmentPhase2SampledClothMeshArtifactV1,
} from './garment-phase2-sampled-cloth-mesh-upgrader-v1';
import {
  evaluateGarmentPhase2BoundaryRecoveryArtifactV1,
  GARMENT_PHASE2_BOUNDARY_RECOVERY_V1,
  type GarmentBoundaryMeshPolicyV1,
  type GarmentPhase2BoundaryRecoveryArtifactV1,
  type GarmentPhase2BoundaryRecoveryRequestV1,
  type GarmentPhase2BoundaryRecoverySeamV1,
  type GarmentPhase2BoundaryRecoveryPieceV1,
  type GarmentPhase2RecoveredBoundarySourceV1,
  type GarmentPhase2PreservedBoundarySourceV1,
} from './garment-phase2-boundary-recovery-v1';
import {
  CDT2D_INTERIOR_REFINER_PINNED_VERSION_V1,
  CDT2D_INTERIOR_REFINER_LIMITS_V1,
  CDT2D_INTERIOR_REFINER_V1,
  createCdt2dInteriorRefinerV1,
} from './triangulation/cdt2d-interior-refiner-v1';
import {
  createGarmentInteriorLatticePlanV1,
  GARMENT_INTERIOR_LATTICE_GEOMETRY_V1,
  GARMENT_INTERIOR_LATTICE_REQUEST_V1,
  generateGarmentInteriorLatticeV1,
  type GarmentInteriorLatticePlanV1,
} from './triangulation/garment-interior-lattice-v1';
import type {
  BoundaryRing,
  BoundaryVertexSource,
  ConstrainedTriangulationInput,
  ConstrainedTriangulationResult,
} from './triangulation/types';

export const GARMENT_PHASE2_INTERIOR_REFINEMENT_REQUEST_V1 =
  'garment-phase2-interior-refinement-request/1' as const;
export const GARMENT_PHASE2_INTERIOR_REFINEMENT_V1 =
  'garment-phase2-interior-refinement/1' as const;
export const GARMENT_PHASE2_INTERIOR_REFINEMENT_EVALUATION_V1 =
  'garment-phase2-interior-refinement-evaluation/1' as const;

export const GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1 = Object.freeze({
  maximumDepth: 32,
  maximumNodes: 500_000,
  maximumProperties: 2_000_000,
  maximumArrayLength: 500_000,
  maximumTypedArrayLength: 2_000_000,
  maximumStringLength: 1_024,
  maximumPieces: 64,
  maximumVertices: 20_000,
  maximumTriangles: 40_000,
  maximumInteriorCandidatesPerPiece: 8_192,
  maximumLatticeCandidateCells: 200_000,
  maximumLatticeGeometryOperations: 16_000_000,
  maximumSeamPairs: 20_000,
  maximumErrorDetails: 32,
} as const);

export const GARMENT_PHASE2_INTERIOR_LATTICE_V1 = GARMENT_INTERIOR_LATTICE_GEOMETRY_V1;

export type GarmentPhase2InteriorRefinementRequestInputV1 = Readonly<{
  version: typeof GARMENT_PHASE2_INTERIOR_REFINEMENT_REQUEST_V1;
  boundaryRecoveryRequest: GarmentPhase2BoundaryRecoveryRequestV1;
  boundaryRecoveryArtifact: GarmentPhase2BoundaryRecoveryArtifactV1;
}>;

declare const garmentPhase2InteriorRefinementRequestBrandV1: unique symbol;

export type GarmentPhase2InteriorRefinementRequestV1 =
  GarmentPhase2InteriorRefinementRequestInputV1 &
    Readonly<{ [garmentPhase2InteriorRefinementRequestBrandV1]: true }>;

export type GarmentPhase2RefinedVertexProvenanceV1 = Readonly<{
  pieceId: string;
  localVertexIndex: number;
  globalVertexIndex: number;
  source:
    | Readonly<{
        kind: 'boundary-recovery';
        boundaryVertexId: string;
        boundaryRecoverySource:
          | GarmentPhase2PreservedBoundarySourceV1
          | GarmentPhase2RecoveredBoundarySourceV1;
      }>
    | Readonly<{
        kind: 'interior';
        generator: typeof GARMENT_PHASE2_INTERIOR_LATTICE_V1.generator;
        sourceId: string;
      }>;
}>;

export type GarmentPhase2InteriorRefinementPieceEvidenceV1 = Readonly<{
  pieceId: string;
  boundaryVertexCount: number;
  interiorVertexCount: number;
  triangleCount: number;
  cdt2dResultHash: string;
  minimumTriangleEdgeMm: number;
  maximumTriangleEdgeMm: number;
  triangulationAuditVerdict: 'pass';
  minTriangleAngleDegrees: number;
  maxEdgeRatio: number;
  maxRadiusEdgeRatio: number;
}>;

export type GarmentPhase2InteriorRefinementArtifactV1 = Readonly<{
  version: typeof GARMENT_PHASE2_INTERIOR_REFINEMENT_V1;
  status: 'accepted';
  boundaryRecoveryVersion: typeof GARMENT_PHASE2_BOUNDARY_RECOVERY_V1;
  boundaryRecoveryFingerprint: string;
  boundaryRecoveryEvaluationFingerprint: string;
  phase2UpgradeFingerprint: string;
  sourceBinding: GarmentPhase2BoundaryRecoveryArtifactV1['sourceBinding'];
  sourceAssemblyFingerprint: string;
  materialPolicy: GarmentBoundaryMeshPolicyV1;
  lattice: typeof GARMENT_PHASE2_INTERIOR_LATTICE_V1;
  mesh: ClothMeshIR;
  vertexProvenance: readonly GarmentPhase2RefinedVertexProvenanceV1[];
  triangleMaterialFrames2: Float32Array;
  boundaryRecoveryEvidence: Readonly<{
    pieces: readonly GarmentPhase2BoundaryRecoveryPieceV1[];
    seams: readonly GarmentPhase2BoundaryRecoverySeamV1[];
  }>;
  pieceEvidence: readonly GarmentPhase2InteriorRefinementPieceEvidenceV1[];
  minimumTriangleEdgeMm: number;
  maximumTriangleEdgeMm: number;
  deterministicFingerprint: string;
  claims: Readonly<{
    acceptanceRequired: true;
    freshBoundaryRecoveryEvaluationAccepted: true;
    recoveredBoundaryPreserved: true;
    distributedEqualSeamPairsPreserved: true;
    interiorSteinerVerticesIntegrated: true;
    triangulatedMeshPublished: true;
    interiorRefinementIntegrated: true;
    allTriangleEdgesInMaterialRange: true;
    f32TopologyAndQualityAccepted: true;
    sourceRevisionBound: false;
    sourceAuthenticityAccepted: false;
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
    'body-placement-not-proven',
    'runtime-owner-not-integrated',
    'settle-not-evaluated',
    'production-qualification-not-run',
  ];
}>;

export type GarmentPhase2InteriorRefinementEvaluationV1 = Readonly<{
  version: typeof GARMENT_PHASE2_INTERIOR_REFINEMENT_EVALUATION_V1;
  status: 'accepted';
  canonicalArtifact: GarmentPhase2InteriorRefinementArtifactV1;
  independentRefinementCallCount: 1;
  deterministicFingerprint: string;
  claims: Readonly<{
    requestLocalConsistencyAccepted: true;
    refinementIndependentlyRebuilt: true;
    sourceAuthenticityAccepted: false;
    bodyPlacementReady: false;
    runtimeIntegrated: false;
  }>;
}>;

export type GarmentPhase2InteriorRefinementErrorCodeV1 =
  | 'reentrant-call'
  | 'input-shape-invalid'
  | 'resource-budget-exceeded'
  | 'boundary-recovery-evaluation-failed'
  | 'upstream-binding-mismatch'
  | 'unsupported-material-policy'
  | 'lattice-generation-failed'
  | 'triangulation-failed'
  | 'material-range-violation'
  | 'boundary-preservation-failed'
  | 'seam-preservation-failed'
  | 'output-invalid'
  | 'artifact-mismatch';

export class GarmentPhase2InteriorRefinementErrorV1 extends Error {
  readonly code: GarmentPhase2InteriorRefinementErrorCodeV1;
  readonly details: readonly string[];

  constructor(
    code: GarmentPhase2InteriorRefinementErrorCodeV1,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'GarmentPhase2InteriorRefinementErrorV1';
    this.code = code;
    this.details = Object.freeze(
      details
        .slice(0, GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumErrorDetails)
        .map((detail) =>
          detail.slice(0, GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumStringLength),
        ),
    );
  }
}

function fail(
  code: GarmentPhase2InteriorRefinementErrorCodeV1,
  message: string,
  details: readonly string[] = [],
): never {
  throw new GarmentPhase2InteriorRefinementErrorV1(code, message, details);
}

type PrivateRefinementRequest = Readonly<{
  boundaryRecoveryRequest: GarmentPhase2BoundaryRecoveryRequestV1;
  boundaryRecoveryArtifact: GarmentPhase2BoundaryRecoveryArtifactV1;
  grainByPieceId: ReadonlyMap<string, number>;
  sourceAssemblyFingerprint: string;
}>;

const privateRequests = new WeakMap<object, PrivateRefinementRequest>();
const capturedStructuredClone =
  typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone.bind(globalThis)
    : null;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;

function exactObjectValues(
  value: unknown,
  expected: readonly string[],
  path: string,
): Record<string, unknown> {
  try {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    )
      fail('input-shape-invalid', `${path} must be an exact plain object.`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const actual = keys.filter((key): key is string => typeof key === 'string').sort();
    const wanted = [...expected].sort();
    if (
      actual.length !== keys.length ||
      actual.length !== wanted.length ||
      actual.some((key, index) => key !== wanted[index])
    )
      fail('input-shape-invalid', `${path} has an unsupported property shape.`);
    const output: Record<string, unknown> = {};
    for (const key of wanted) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('input-shape-invalid', `${path}.${key} must be enumerable own data.`);
      output[key] = descriptor.value;
    }
    return output;
  } catch (error) {
    if (error instanceof GarmentPhase2InteriorRefinementErrorV1) throw error;
    fail('input-shape-invalid', `${path} reflection failed closed.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

type SnapshotState = { nodes: number; properties: number; active: Set<object> };

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
  if (length > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumTypedArrayLength)
    fail('resource-budget-exceeded', `${path} exceeds the typed-array bound.`);
  if (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer)
    fail('input-shape-invalid', `${path} uses shared storage.`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== length ||
    keys.some((key, index) => typeof key !== 'string' || key !== String(index))
  )
    fail('input-shape-invalid', `${path} has extra or non-canonical typed-array properties.`);
  state.nodes += 1;
  state.properties += length;
  if (
    state.nodes > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumNodes ||
    state.properties > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumProperties
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

function snapshotData(value: unknown, path: string, depth: number, state: SnapshotState): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('input-shape-invalid', `${path} must be finite.`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumStringLength)
      fail('resource-budget-exceeded', `${path} exceeds the string bound.`);
    return value;
  }
  if (typeof value !== 'object') fail('input-shape-invalid', `${path} is not plain data.`);
  if (depth > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumDepth)
    fail('resource-budget-exceeded', `${path} exceeds the depth bound.`);
  if (state.active.has(value)) fail('input-shape-invalid', `${path} contains a cycle.`);
  if (ArrayBuffer.isView(value)) return snapshotTypedArray(value, path, state);
  state.active.add(value);
  state.nodes += 1;
  if (state.nodes > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumNodes)
    fail('resource-budget-exceeded', `${path} exceeds the node bound.`);
  try {
    const isArray = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype))
      fail('input-shape-invalid', `${path} must contain only plain arrays and objects.`);
    if (isArray) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      const length =
        lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumArrayLength
      )
        fail('resource-budget-exceeded', `${path} has an invalid array length.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === 'symbol'))
      fail('input-shape-invalid', `${path} contains a symbol.`);
    if (isArray) {
      const length = (descriptors.length as PropertyDescriptor | undefined)?.value as
        | number
        | undefined;
      if (
        !Number.isSafeInteger(length) ||
        length === undefined ||
        length < 0 ||
        length > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumArrayLength ||
        keys.length !== length + 1
      )
        fail('resource-budget-exceeded', `${path} has an invalid array length.`);
      state.properties += length;
      if (state.properties > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumProperties)
        fail('resource-budget-exceeded', `${path} exceeds the property bound.`);
      return Array.from({ length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          fail('input-shape-invalid', `${path}[${index}] is not enumerable own data.`);
        return snapshotData(descriptor.value, `${path}[${index}]`, depth + 1, state);
      });
    }
    const stringKeys = keys.filter((key): key is string => typeof key === 'string');
    state.properties += stringKeys.length;
    if (state.properties > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumProperties)
      fail('resource-budget-exceeded', `${path} exceeds the property bound.`);
    const output: Record<string, unknown> = {};
    for (const key of stringKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('input-shape-invalid', `${path}.${key} is not enumerable own data.`);
      output[key] = snapshotData(descriptor.value, `${path}.${key}`, depth + 1, state);
    }
    return output;
  } finally {
    state.active.delete(value);
  }
}

function snapshotArtifact(value: unknown): GarmentPhase2InteriorRefinementArtifactV1 {
  const snapshot = snapshotData(value, 'artifact', 0, {
    nodes: 0,
    properties: 0,
    active: new Set(),
  });
  if (!capturedStructuredClone)
    fail('input-shape-invalid', 'Native structuredClone is required for Proxy rejection.');
  try {
    capturedStructuredClone(value);
  } catch (error) {
    fail('input-shape-invalid', 'Refinement artifact contains Proxy or unclonable data.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  return snapshot as GarmentPhase2InteriorRefinementArtifactV1;
}

function canonicalSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Object.is(value, -0) ? '"-0"' : JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Uint32Array || value instanceof Float32Array) {
    const buffer = new ArrayBuffer(value.length * 4);
    const view = new DataView(buffer);
    for (let index = 0; index < value.length; index += 1) {
      if (value instanceof Uint32Array) view.setUint32(index * 4, value[index], true);
      else view.setFloat32(index * 4, value[index], true);
    }
    const bytes = [...new Uint8Array(buffer)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return value instanceof Uint32Array ? `{"$u32le":"${bytes}"}` : `{"$f32le":"${bytes}"}`;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalSerialize((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  fail('output-invalid', 'Fingerprint payload contains unsupported data.');
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function fingerprint(payload: unknown): string {
  return `gir1-fnv1a64:${fnv1a64(canonicalSerialize(payload))}`;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalSerialize(left) === canonicalSerialize(right);
}

function freezePlainData<T>(value: T): T {
  if (
    value === null ||
    typeof value !== 'object' ||
    ArrayBuffer.isView(value) ||
    Object.isFrozen(value)
  )
    return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezePlainData(child);
  Object.freeze(value);
  return value;
}

function provenance(
  source: GarmentPhase2PreservedBoundarySourceV1 | GarmentPhase2RecoveredBoundarySourceV1,
): BoundaryVertexSource {
  if (source.kind === 'recovered-boundary-sample') return { ...source.provenance };
  if (source.phase2Source.kind === 'interior')
    fail('boundary-preservation-failed', 'G0A boundary evidence contains an interior source.');
  return { ...source.phase2Source.provenance };
}

function boundaryInput(
  piece: GarmentPhase2BoundaryRecoveryPieceV1,
  grainDegrees: number,
  materialPolicy: GarmentBoundaryMeshPolicyV1,
): ConstrainedTriangulationInput {
  const rings: BoundaryRing[] = piece.loops.map((loop) => ({
    id: loop.contourId,
    role: loop.role,
    vertices: loop.vertices.map((vertex) => ({
      id: vertex.boundaryVertexId,
      positionMm: [vertex.positionMm[0], vertex.positionMm[1]],
      source: provenance(vertex.source),
    })),
  }));
  const shell = rings.find((ring) => ring.role === 'shell');
  if (!shell || rings.filter((ring) => ring.role === 'shell').length !== 1)
    fail('boundary-preservation-failed', `${piece.pieceId} must have exactly one shell.`);
  return {
    pieceId: piece.pieceId,
    shell,
    holes: rings.filter((ring) => ring.role === 'hole'),
    seamEndpoints: [],
    grainDegrees,
    options: {
      targetEdgeMm: GARMENT_PHASE2_INTERIOR_LATTICE_V1.spacingMm,
      minInputEdgeMm: materialPolicy.minEdgeMm,
      minTriangleAngleDegrees: 10,
      maxEdgeRatio: 8,
      maxRadiusEdgeRatio: 4,
      maxBoundaryErrorMm: 0.001,
      collinearSinTolerance: 1e-12,
    },
  };
}

function triangleEdgeRange(result: ConstrainedTriangulationResult): Readonly<{
  minimum: number;
  maximum: number;
}> {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (let offset = 0; offset < result.triangles.length; offset += 3) {
    const indices = [
      result.triangles[offset],
      result.triangles[offset + 1],
      result.triangles[offset + 2],
    ];
    for (const [a, b] of [
      [indices[0], indices[1]],
      [indices[1], indices[2]],
      [indices[2], indices[0]],
    ] as const) {
      const left = result.vertices[a]?.positionMm;
      const right = result.vertices[b]?.positionMm;
      if (!left || !right) fail('output-invalid', 'Triangle references a missing vertex.');
      const length = Math.hypot(right[0] - left[0], right[1] - left[1]);
      if (!(length > 0) || !Number.isFinite(length))
        fail('output-invalid', 'Triangle edge collapses or is not finite.');
      minimum = Math.min(minimum, length);
      maximum = Math.max(maximum, length);
    }
  }
  return { minimum, maximum };
}

function assertRecoveredBoundaryProjection(
  piece: GarmentPhase2BoundaryRecoveryPieceV1,
  result: ConstrainedTriangulationResult,
): void {
  if (result.boundaryLoops.length !== piece.loops.length)
    fail('boundary-preservation-failed', `${piece.pieceId} boundary loop count drifted.`);
  let boundaryOffset = 0;
  for (let loopIndex = 0; loopIndex < piece.loops.length; loopIndex += 1) {
    const expectedLoop = piece.loops[loopIndex];
    const actualLoop = result.boundaryLoops[loopIndex];
    if (
      !actualLoop ||
      actualLoop.inputRingId !== expectedLoop.contourId ||
      actualLoop.role !== expectedLoop.role ||
      actualLoop.vertexIndices.length !== expectedLoop.vertices.length
    )
      fail(
        'boundary-preservation-failed',
        `${piece.pieceId}/${expectedLoop.contourId} boundary loop identity or length drifted.`,
      );
    for (let index = 0; index < expectedLoop.vertices.length; index += 1) {
      const expectedVertex = expectedLoop.vertices[index];
      const resultIndex = boundaryOffset + index;
      const actualVertex = result.vertices[resultIndex];
      if (
        actualLoop.vertexIndices[index] !== resultIndex ||
        !actualVertex ||
        actualVertex.source.kind !== 'boundary' ||
        actualVertex.source.boundaryVertexId !== expectedVertex.boundaryVertexId ||
        actualVertex.positionMm[0] !== expectedVertex.positionMm[0] ||
        actualVertex.positionMm[1] !== expectedVertex.positionMm[1] ||
        !sameCanonical(actualVertex.source.provenance, provenance(expectedVertex.source))
      )
        fail(
          'boundary-preservation-failed',
          `${piece.pieceId}/${expectedLoop.contourId}/${expectedVertex.boundaryVertexId} drifted.`,
        );
    }
    boundaryOffset += expectedLoop.vertices.length;
  }
  if (
    boundaryOffset !== piece.recoveredBoundaryVertexCount ||
    result.vertices
      .slice(boundaryOffset)
      .some((vertex) => vertex.source.kind !== 'interior' || vertex.source.generator !== 'steiner')
  )
    fail('boundary-preservation-failed', `${piece.pieceId} boundary/interior partition drifted.`);
}

type PiecePlan = Readonly<{
  piece: GarmentPhase2BoundaryRecoveryPieceV1;
  input: ConstrainedTriangulationInput;
  result: ConstrainedTriangulationResult;
  edgeRange: Readonly<{ minimum: number; maximum: number }>;
  vertexOffset: number;
  triangleOffset: number;
}>;

type PreparedPiece = Readonly<{
  piece: GarmentPhase2BoundaryRecoveryPieceV1;
  input: ConstrainedTriangulationInput;
  latticePlan: GarmentInteriorLatticePlanV1;
}>;

function buildArtifact(
  privateRequest: PrivateRefinementRequest,
): GarmentPhase2InteriorRefinementArtifactV1 {
  let boundaryEvaluation;
  try {
    boundaryEvaluation = evaluateGarmentPhase2BoundaryRecoveryArtifactV1(
      privateRequest.boundaryRecoveryRequest,
      privateRequest.boundaryRecoveryArtifact,
    );
  } catch (error) {
    fail('boundary-recovery-evaluation-failed', 'Fresh G0A evaluation failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  const boundary = boundaryEvaluation.canonicalArtifact;
  if (boundary.materialPolicy.minEdgeMm !== 10 || boundary.materialPolicy.maxEdgeMm !== 50)
    fail(
      'unsupported-material-policy',
      'G0B V1 supports only the exact visual 10–50 mm material range.',
    );
  const prepared: PreparedPiece[] = boundary.pieces.map((piece) => {
    const grainDegrees = privateRequest.grainByPieceId.get(piece.pieceId);
    if (grainDegrees === undefined)
      fail('upstream-binding-mismatch', `${piece.pieceId} has no fresh Phase-2 grain binding.`);
    const input = boundaryInput(piece, grainDegrees, boundary.materialPolicy);
    let latticePlan: GarmentInteriorLatticePlanV1;
    try {
      latticePlan = createGarmentInteriorLatticePlanV1({
        version: GARMENT_INTERIOR_LATTICE_REQUEST_V1,
        pieceId: piece.pieceId,
        loops: piece.loops.map((loop) => ({
          loopId: loop.contourId,
          role: loop.role,
          vertices: loop.vertices.map((vertex) => ({
            boundaryVertexId: vertex.boundaryVertexId,
            positionMm: [vertex.positionMm[0], vertex.positionMm[1]],
          })),
        })),
      });
    } catch (error) {
      fail('lattice-generation-failed', `${piece.pieceId} lattice preflight failed closed.`, [
        error instanceof Error ? error.message : String(error),
        ...(error && typeof error === 'object' && 'details' in error && Array.isArray(error.details)
          ? error.details.map(String)
          : []),
      ]);
    }
    return { piece, input, latticePlan };
  });
  let totalLatticeCells = 0;
  let totalLatticeGeometryOperations = 0;
  for (const item of prepared) {
    totalLatticeCells += item.latticePlan.candidateCellUpperBound;
    totalLatticeGeometryOperations += item.latticePlan.geometryOperationUpperBound;
    if (
      !Number.isSafeInteger(totalLatticeCells) ||
      !Number.isSafeInteger(totalLatticeGeometryOperations) ||
      totalLatticeCells >
        GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumLatticeCandidateCells ||
      totalLatticeGeometryOperations >
        GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumLatticeGeometryOperations
    )
      fail(
        'resource-budget-exceeded',
        'Garment lattice candidate or geometry-operation total exceeds its bound.',
      );
  }
  const generated = prepared.map((item) => {
    try {
      return { ...item, lattice: generateGarmentInteriorLatticeV1(item.latticePlan) };
    } catch (error) {
      fail('lattice-generation-failed', `${item.piece.pieceId} lattice failed closed.`, [
        error instanceof Error ? error.message : String(error),
        ...(error && typeof error === 'object' && 'details' in error && Array.isArray(error.details)
          ? error.details.map(String)
          : []),
      ]);
    }
  });
  const projectedVertexCount = generated.reduce(
    (sum, item) => sum + item.piece.recoveredBoundaryVertexCount + item.lattice.points.length,
    0,
  );
  if (
    projectedVertexCount > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumVertices ||
    generated.some(
      (item) =>
        item.lattice.points.length >
          GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumInteriorCandidatesPerPiece ||
        item.piece.recoveredBoundaryVertexCount >
          CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumBoundaryVertices ||
        item.lattice.points.length > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumInteriorVertices ||
        item.piece.recoveredBoundaryVertexCount + item.lattice.points.length >
          CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumVertices,
    )
  )
    fail('resource-budget-exceeded', 'Projected refined garment vertex count exceeds its bound.');
  const projectedTriangleUpperBound = generated.reduce(
    (sum, item) =>
      sum +
      2 * (item.piece.recoveredBoundaryVertexCount + item.lattice.points.length) +
      2 * item.piece.loops.filter((loop) => loop.role === 'hole').length,
    0,
  );
  if (
    !Number.isSafeInteger(projectedTriangleUpperBound) ||
    projectedTriangleUpperBound > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumTriangles
  )
    fail('resource-budget-exceeded', 'Projected refined triangle count exceeds its bound.');
  const refiner = createCdt2dInteriorRefinerV1();
  const plans: PiecePlan[] = [];
  let vertexOffset = 0;
  let triangleOffset = 0;
  for (const item of generated) {
    const { piece, input } = item;
    let result: ConstrainedTriangulationResult;
    try {
      result = refiner.refine({
        version: CDT2D_INTERIOR_REFINER_V1,
        boundaryInput: input,
        interiorPoints: item.lattice.points,
      });
    } catch (error) {
      fail('triangulation-failed', `${piece.pieceId} interior triangulation failed closed.`, [
        error instanceof Error ? error.message : String(error),
        ...(error && typeof error === 'object' && 'details' in error && Array.isArray(error.details)
          ? error.details.map(String)
          : []),
      ]);
    }
    assertRecoveredBoundaryProjection(piece, result);
    const edgeRange = triangleEdgeRange(result);
    if (
      edgeRange.minimum < boundary.materialPolicy.minEdgeMm ||
      edgeRange.maximum > boundary.materialPolicy.maxEdgeMm
    )
      fail(
        'material-range-violation',
        `${piece.pieceId} triangle edges are outside the exact material range.`,
        [`min=${edgeRange.minimum}`, `max=${edgeRange.maximum}`],
      );
    plans.push({ piece, input, result, edgeRange, vertexOffset, triangleOffset });
    vertexOffset += result.vertices.length;
    triangleOffset += result.triangles.length / 3;
  }
  if (
    plans.length === 0 ||
    plans.length > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumPieces ||
    vertexOffset > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumVertices ||
    triangleOffset > GARMENT_PHASE2_INTERIOR_REFINEMENT_LIMITS_V1.maximumTriangles
  )
    fail('resource-budget-exceeded', 'Refined garment exceeds piece/vertex/triangle bounds.');
  const positions = new Float32Array(vertexOffset * 2);
  const triangles = new Uint32Array(triangleOffset * 3);
  const frames = new Float32Array(triangleOffset * 4);
  const pieceRanges: ClothMeshPieceRange[] = [];
  const boundarySamples: ClothBoundarySample[] = [];
  const vertexProvenance: GarmentPhase2RefinedVertexProvenanceV1[] = [];
  const boundaryIndexByRef = new Map<string, number>();
  const pieceEvidence: GarmentPhase2InteriorRefinementPieceEvidenceV1[] = [];
  for (const plan of plans) {
    const boundarySourceById = new Map(
      plan.piece.loops.flatMap((loop) =>
        loop.vertices.map((vertex) => [vertex.boundaryVertexId, vertex.source] as const),
      ),
    );
    plan.result.vertices.forEach((vertex, localVertexIndex) => {
      const globalVertexIndex = plan.vertexOffset + localVertexIndex;
      positions[globalVertexIndex * 2] = vertex.positionMm[0];
      positions[globalVertexIndex * 2 + 1] = vertex.positionMm[1];
      if (vertex.source.kind === 'boundary') {
        const boundaryRecoverySource = boundarySourceById.get(vertex.source.boundaryVertexId);
        if (!boundaryRecoverySource)
          fail(
            'boundary-preservation-failed',
            `${plan.piece.pieceId}/${vertex.source.boundaryVertexId} lost recovered provenance.`,
          );
        boundaryIndexByRef.set(
          `${plan.piece.pieceId}\u0000${vertex.source.boundaryVertexId}`,
          globalVertexIndex,
        );
        boundarySamples.push({
          vertexIndex: globalVertexIndex,
          pieceId: plan.piece.pieceId,
          contourId: vertex.source.provenance.contourId,
          normalizedArc: vertex.source.provenance.normalizedArc,
          sourceCurveId: vertex.source.provenance.sourceCurveId,
          sourceCurveT: vertex.source.provenance.sourceCurveT,
        });
        vertexProvenance.push({
          pieceId: plan.piece.pieceId,
          localVertexIndex,
          globalVertexIndex,
          source: {
            kind: 'boundary-recovery',
            boundaryVertexId: vertex.source.boundaryVertexId,
            boundaryRecoverySource,
          },
        });
      } else if (vertex.source.kind === 'interior') {
        if (vertex.source.generator !== 'steiner' || !vertex.source.sourceId)
          fail('output-invalid', `${plan.piece.pieceId} has untyped interior provenance.`);
        vertexProvenance.push({
          pieceId: plan.piece.pieceId,
          localVertexIndex,
          globalVertexIndex,
          source: {
            kind: 'interior',
            generator: GARMENT_PHASE2_INTERIOR_LATTICE_V1.generator,
            sourceId: vertex.source.sourceId,
          },
        });
      } else fail('output-invalid', `${plan.piece.pieceId} has an unexpected boundary sample.`);
    });
    plan.result.triangles.forEach((index, offset) => {
      triangles[plan.triangleOffset * 3 + offset] = plan.vertexOffset + index;
    });
    frames.set(plan.result.triangleMaterialFrames2, plan.triangleOffset * 4);
    pieceRanges.push({
      pieceId: plan.piece.pieceId,
      vertexOffset: plan.vertexOffset,
      vertexCount: plan.result.vertices.length,
      triangleOffset: plan.triangleOffset,
      triangleCount: plan.result.triangles.length / 3,
    });
    pieceEvidence.push({
      pieceId: plan.piece.pieceId,
      boundaryVertexCount: plan.piece.recoveredBoundaryVertexCount,
      interiorVertexCount: plan.result.vertices.length - plan.piece.recoveredBoundaryVertexCount,
      triangleCount: plan.result.triangles.length / 3,
      cdt2dResultHash: plan.result.deterministicHash,
      minimumTriangleEdgeMm: plan.edgeRange.minimum,
      maximumTriangleEdgeMm: plan.edgeRange.maximum,
      triangulationAuditVerdict: 'pass',
      minTriangleAngleDegrees: plan.result.quality.minTriangleAngleDegrees,
      maxEdgeRatio: plan.result.quality.maxEdgeRatio,
      maxRadiusEdgeRatio: plan.result.quality.maxRadiusEdgeRatio,
    });
  }
  const seams: ClothSeamMap[] = boundary.seams.map((seam) => {
    const vertexPairs = new Uint32Array(seam.recoveredBoundaryVertexPairs.length * 2);
    seam.recoveredBoundaryVertexPairs.forEach((pair, index) => {
      const first = boundaryIndexByRef.get(`${pair[0].pieceId}\u0000${pair[0].boundaryVertexId}`);
      const second = boundaryIndexByRef.get(`${pair[1].pieceId}\u0000${pair[1].boundaryVertexId}`);
      if (first === undefined || second === undefined)
        fail('seam-preservation-failed', `${seam.seamId}/${index} lost a recovered pair.`);
      vertexPairs[index * 2] = first;
      vertexPairs[index * 2 + 1] = second;
    });
    return { seamId: seam.seamId, mapping: 'equal', lengthRatio: 1, vertexPairs };
  });
  let minimumTriangleEdgeMm = Number.POSITIVE_INFINITY;
  let maximumTriangleEdgeMm = 0;
  for (const evidence of pieceEvidence) {
    minimumTriangleEdgeMm = Math.min(minimumTriangleEdgeMm, evidence.minimumTriangleEdgeMm);
    maximumTriangleEdgeMm = Math.max(maximumTriangleEdgeMm, evidence.maximumTriangleEdgeMm);
  }
  const mesh: ClothMeshIR = {
    schemaVersion: CLOTH_MESH_IR_VERSION,
    sourceAssemblyFingerprint: privateRequest.sourceAssemblyFingerprint,
    sourceUnits: 'mm',
    restPositions2Mm: positions,
    triangles,
    pieceRanges,
    boundarySamples,
    seams,
    quality: {
      degenerateTriangles: 0,
      minTriangleAngleDegrees: Math.min(
        ...pieceEvidence.map(({ minTriangleAngleDegrees }) => minTriangleAngleDegrees),
      ),
      maxEdgeRatio: Math.max(...pieceEvidence.map(({ maxEdgeRatio }) => maxEdgeRatio)),
      maxBoundaryErrorMm: Math.max(...plans.map(({ result }) => result.quality.maxBoundaryErrorMm)),
    },
  };
  const meshErrors = validateClothMeshIR(mesh);
  if (meshErrors.length > 0)
    fail('output-invalid', 'Interior-refined ClothMeshIR failed validation.', meshErrors);
  const payload = {
    version: GARMENT_PHASE2_INTERIOR_REFINEMENT_V1,
    status: 'accepted' as const,
    boundaryRecoveryVersion: GARMENT_PHASE2_BOUNDARY_RECOVERY_V1,
    boundaryRecoveryFingerprint: boundary.deterministicFingerprint,
    boundaryRecoveryEvaluationFingerprint: boundaryEvaluation.deterministicFingerprint,
    phase2UpgradeFingerprint: boundary.phase2UpgradeFingerprint,
    sourceBinding: { ...boundary.sourceBinding },
    sourceAssemblyFingerprint: privateRequest.sourceAssemblyFingerprint,
    materialPolicy: { ...boundary.materialPolicy },
    lattice: GARMENT_PHASE2_INTERIOR_LATTICE_V1,
    mesh,
    vertexProvenance,
    triangleMaterialFrames2: frames,
    boundaryRecoveryEvidence: {
      pieces: boundary.pieces,
      seams: boundary.seams,
    },
    pieceEvidence,
    minimumTriangleEdgeMm,
    maximumTriangleEdgeMm,
    claims: {
      acceptanceRequired: true as const,
      freshBoundaryRecoveryEvaluationAccepted: true as const,
      recoveredBoundaryPreserved: true as const,
      distributedEqualSeamPairsPreserved: true as const,
      interiorSteinerVerticesIntegrated: true as const,
      triangulatedMeshPublished: true as const,
      interiorRefinementIntegrated: true as const,
      allTriangleEdgesInMaterialRange: true as const,
      f32TopologyAndQualityAccepted: true as const,
      sourceRevisionBound: false as const,
      sourceAuthenticityAccepted: false as const,
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
      'body-placement-not-proven',
      'runtime-owner-not-integrated',
      'settle-not-evaluated',
      'production-qualification-not-run',
    ] as const,
  };
  return freezePlainData({ ...payload, deterministicFingerprint: fingerprint(payload) });
}

let active = false;
let reentryObserved = false;

function guarded<T>(operation: () => T): T {
  if (active) {
    reentryObserved = true;
    fail('reentrant-call', 'Garment interior refinement rejects reentrant calls.');
  }
  active = true;
  reentryObserved = false;
  try {
    const result = operation();
    if (reentryObserved)
      fail('input-shape-invalid', 'Refinement input triggered reentrant reflection.');
    return result;
  } catch (error) {
    if (error instanceof GarmentPhase2InteriorRefinementErrorV1) throw error;
    fail('output-invalid', 'Garment interior refinement failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  } finally {
    active = false;
    reentryObserved = false;
  }
}

export function createGarmentPhase2InteriorRefinementRequestV1(
  input: GarmentPhase2InteriorRefinementRequestInputV1,
): GarmentPhase2InteriorRefinementRequestV1 {
  return guarded(() => {
    const values = exactObjectValues(
      input,
      ['boundaryRecoveryArtifact', 'boundaryRecoveryRequest', 'version'],
      'request-constructor.input',
    );
    if (values.version !== GARMENT_PHASE2_INTERIOR_REFINEMENT_REQUEST_V1)
      fail('input-shape-invalid', 'Interior refinement request version is unsupported.');
    const boundaryRecoveryRequest =
      values.boundaryRecoveryRequest as GarmentPhase2BoundaryRecoveryRequestV1;
    const boundaryRecoveryArtifact =
      values.boundaryRecoveryArtifact as GarmentPhase2BoundaryRecoveryArtifactV1;
    let boundaryEvaluation;
    try {
      boundaryEvaluation = evaluateGarmentPhase2BoundaryRecoveryArtifactV1(
        boundaryRecoveryRequest,
        boundaryRecoveryArtifact,
      );
    } catch (error) {
      fail('boundary-recovery-evaluation-failed', 'G0A request/artifact was not accepted.', [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    if (!capturedStructuredClone)
      fail('input-shape-invalid', 'Native structuredClone is required for Proxy rejection.');
    try {
      capturedStructuredClone(input);
    } catch (error) {
      fail('input-shape-invalid', 'Request constructor rejects Proxy or unclonable input.', [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    let freshPhase2: GarmentPhase2SampledClothMeshArtifactV1;
    try {
      freshPhase2 = upgradeGarmentPhase2SampledClothMeshV1(
        boundaryRecoveryRequest.phase2UpgradeRequest,
      );
    } catch (error) {
      fail('upstream-binding-mismatch', 'Fresh Phase-2 grain/source rebuild failed.', [
        error instanceof Error ? error.message : String(error),
      ]);
    }
    if (
      freshPhase2.deterministicFingerprint !==
      boundaryEvaluation.canonicalArtifact.phase2UpgradeFingerprint
    )
      fail('upstream-binding-mismatch', 'Fresh Phase-2 artifact differs from accepted G0A input.');
    const publicBoundaryRecoveryArtifact = snapshotData(
      boundaryEvaluation.canonicalArtifact,
      'request-constructor.canonical-boundary-artifact',
      0,
      { nodes: 0, properties: 0, active: new Set() },
    ) as GarmentPhase2BoundaryRecoveryArtifactV1;
    const publicRequest = freezePlainData({
      version: GARMENT_PHASE2_INTERIOR_REFINEMENT_REQUEST_V1,
      boundaryRecoveryRequest,
      boundaryRecoveryArtifact: publicBoundaryRecoveryArtifact,
    }) as GarmentPhase2InteriorRefinementRequestV1;
    privateRequests.set(publicRequest, {
      boundaryRecoveryRequest,
      boundaryRecoveryArtifact: boundaryEvaluation.canonicalArtifact,
      grainByPieceId: new Map(
        freshPhase2.pieceEvidence.map(
          (piece) => [piece.pieceId, piece.assemblyGrainDegrees] as const,
        ),
      ),
      sourceAssemblyFingerprint: freshPhase2.mesh.sourceAssemblyFingerprint,
    });
    return publicRequest;
  });
}

export function refineGarmentPhase2InteriorV1(
  request: GarmentPhase2InteriorRefinementRequestV1,
): GarmentPhase2InteriorRefinementArtifactV1 {
  return guarded(() => {
    const privateRequest =
      request && typeof request === 'object' ? privateRequests.get(request) : undefined;
    if (!privateRequest)
      fail('input-shape-invalid', 'Interior refinement requires its owned request capability.');
    return buildArtifact(privateRequest);
  });
}

export function evaluateGarmentPhase2InteriorRefinementArtifactV1(
  request: GarmentPhase2InteriorRefinementRequestV1,
  artifact: GarmentPhase2InteriorRefinementArtifactV1,
): GarmentPhase2InteriorRefinementEvaluationV1 {
  return guarded(() => {
    const privateRequest =
      request && typeof request === 'object' ? privateRequests.get(request) : undefined;
    if (!privateRequest)
      fail(
        'input-shape-invalid',
        'Interior refinement evaluation requires its request capability.',
      );
    const supplied = snapshotArtifact(artifact);
    const canonicalArtifact = buildArtifact(privateRequest);
    if (
      supplied.deterministicFingerprint !== canonicalArtifact.deterministicFingerprint ||
      !sameCanonical(supplied, canonicalArtifact)
    )
      fail('artifact-mismatch', 'Refinement artifact differs from an independent rebuild.');
    const payload = {
      version: GARMENT_PHASE2_INTERIOR_REFINEMENT_EVALUATION_V1,
      status: 'accepted' as const,
      canonicalArtifact,
      independentRefinementCallCount: 1 as const,
      claims: {
        requestLocalConsistencyAccepted: true as const,
        refinementIndependentlyRebuilt: true as const,
        sourceAuthenticityAccepted: false as const,
        bodyPlacementReady: false as const,
        runtimeIntegrated: false as const,
      },
    };
    return freezePlainData({ ...payload, deterministicFingerprint: fingerprint(payload) });
  });
}

export const GARMENT_PHASE2_INTERIOR_REFINER_DEPENDENCY_V1 = Object.freeze({
  adapter: CDT2D_INTERIOR_REFINER_V1,
  cdt2dVersion: CDT2D_INTERIOR_REFINER_PINNED_VERSION_V1,
});
