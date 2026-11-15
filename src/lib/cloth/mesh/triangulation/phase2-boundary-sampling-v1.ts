import { auditTriangulationResult, preflightTriangulationInput } from './audit';
import { triangulationResultFingerprint } from './canonical';
import { createCdt2dConstrainedTriangulatorV1 } from './cdt2d-adapter-v1';
import type {
  BoundaryRing,
  BoundaryVertex,
  ConstrainedTriangulationInput,
  ConstrainedTriangulationResult,
  ConstrainedTriangulator,
  OutputVertexSource,
  TriangulationAuditCandidate,
} from './types';

export const PHASE2_BOUNDARY_SAMPLING_V1 = 'phase2-boundary-sampling/1' as const;
export const PHASE2_BOUNDARY_SAMPLING_EVALUATION_V1 =
  'phase2-boundary-sampling-evaluation/1' as const;

export const PHASE2_BOUNDARY_SAMPLING_LIMITS_V1 = Object.freeze({
  maximumDepth: 24,
  maximumNodes: 200_000,
  maximumProperties: 800_000,
  maximumArrayLength: 100_000,
  maximumTypedArrayLength: 1_000_000,
  maximumStringLength: 512,
  maximumPieces: 16,
  maximumRings: 64,
  maximumOriginalBoundaryVertices: 8_192,
  maximumSampledBoundaryVertices: 100_000,
  maximumEdges: 8_192,
  maximumEqualSeams: 512,
  maximumSamplesPerEdge: 4_096,
  maximumTargetEdgeMm: 1_000_000,
  maximumExactSeamToleranceMm: 1e-6,
  maximumErrorDetails: 32,
} as const);

export type Phase2BoundarySamplingErrorCodeV1 =
  | 'reentrant-call'
  | 'input-snapshot-invalid'
  | 'resource-budget-exceeded'
  | 'duplicate-piece'
  | 'preflight-failed'
  | 'edge-coverage-invalid'
  | 'source-identity-mismatch'
  | 'unsupported-curve-kind'
  | 'unsupported-parameter-space'
  | 'unsupported-chord-error'
  | 'unsupported-periodic-curve'
  | 'unsupported-transform'
  | 'unsupported-seam-semantics'
  | 'unequal-seam-length'
  | 'non-bijective-seam'
  | 'adapter-failed'
  | 'post-audit-failed'
  | 'result-hash-mismatch'
  | 'artifact-snapshot-invalid'
  | 'artifact-request-mismatch';

export class Phase2BoundarySamplingErrorV1 extends Error {
  readonly code: Phase2BoundarySamplingErrorCodeV1;
  readonly details: readonly string[];

  constructor(
    code: Phase2BoundarySamplingErrorCodeV1,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'Phase2BoundarySamplingErrorV1';
    this.code = code;
    this.details = Object.freeze(
      details
        .slice(0, PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumErrorDetails)
        .map((detail) => detail.slice(0, PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumStringLength)),
    );
  }
}

/** A native witness for one exact directed loop-edge occurrence, never a coordinate lookup. */
export type Phase2NativeBoundaryEdgeV1 = Readonly<{
  edgeId: string;
  pieceId: string;
  ringId: string;
  edgeIndex: number;
  startBoundaryVertexId: string;
  endBoundaryVertexId: string;
  native: Readonly<{
    sourceFileId: string;
    sourceCurveId: string;
    curveKind: 'line';
    parameterSpace: 'unit' | 'angle-radians' | 'knot-domain';
    sourceCurveTRange: readonly [startT: number, endT: number];
    chordErrorBoundMm: number;
    periodic: boolean;
    transform: Readonly<{ kind: 'identity' | 'positive-uniform-scale'; scale?: number }>;
  }>;
}>;

export type Phase2BoundarySamplingPieceV1 = Readonly<{
  input: ConstrainedTriangulationInput;
  edges: readonly Phase2NativeBoundaryEdgeV1[];
}>;

export type Phase2EqualSeamSideV1 = Readonly<{
  pieceId: string;
  edgeId: string;
  direction: 'forward' | 'reverse';
}>;

export type Phase2EqualSeamV1 = Readonly<{
  seamId: string;
  mapping: 'equal';
  lengthRatio: 1;
  exactToleranceMm: number;
  sides: readonly [Phase2EqualSeamSideV1, Phase2EqualSeamSideV1];
}>;

export type Phase2BoundarySamplingRequestV1 = Readonly<{
  version: typeof PHASE2_BOUNDARY_SAMPLING_V1;
  sourceFileId: string;
  targetEdgeMm: number;
  pieces: readonly Phase2BoundarySamplingPieceV1[];
  equalSeams: readonly Phase2EqualSeamV1[];
}>;

export type Phase2BoundaryEdgeEvidenceV1 = Readonly<{
  edgeId: string;
  pieceId: string;
  ringId: string;
  edgeIndex: number;
  sourceCurveId: string;
  sourceCurveTRange: readonly [number, number];
  lengthMm: number;
  segmentCount: number;
  maximumSampledSegmentLengthMm: number;
  insertedBoundarySampleIds: readonly string[];
  sharedEqualSeamId: string | null;
}>;

export type Phase2EqualSeamEvidenceV1 = Readonly<{
  seamId: string;
  sharedSegmentCount: number;
  progress: readonly Readonly<{ numerator: number; denominator: number }>[];
  sides: readonly [
    Readonly<{
      pieceId: string;
      edgeId: string;
      direction: 'forward' | 'reverse';
      sharedProgressMapping: 'u' | 'one-minus-u';
      directedBoundaryVertexIds: readonly string[];
    }>,
    Readonly<{
      pieceId: string;
      edgeId: string;
      direction: 'forward' | 'reverse';
      sharedProgressMapping: 'u' | 'one-minus-u';
      directedBoundaryVertexIds: readonly string[];
    }>,
  ];
}>;

export type Phase2BoundarySamplingPieceResultV1 = Readonly<{
  pieceId: string;
  originalBoundaryVertexCount: number;
  sampledBoundaryVertexCount: number;
  insertedBoundarySampleCount: number;
  sampledInput: ConstrainedTriangulationInput;
  result: ConstrainedTriangulationResult;
}>;

export type Phase2BoundarySamplingArtifactV1 = Readonly<{
  version: typeof PHASE2_BOUNDARY_SAMPLING_V1;
  sourceFileId: string;
  targetEdgeMm: number;
  phase1AdapterCallCount: number;
  pieces: readonly Phase2BoundarySamplingPieceResultV1[];
  edges: readonly Phase2BoundaryEdgeEvidenceV1[];
  equalSeams: readonly Phase2EqualSeamEvidenceV1[];
  deterministicFingerprint: string;
  claims: Readonly<{
    acceptanceRequired: true;
    sourceNativeBoundarySamplingExecuted: true;
    exactBoundarySampleProvenanceAudited: true;
    phase1AdapterReused: true;
    ownedOutputNoCallerAlias: true;
    phase1CompilerIntegrated: false;
    interiorRefinementIntegrated: false;
    bodyPlacementReady: false;
    runtimeIntegrated: false;
    settleAccepted: false;
    productionReady: false;
  }>;
  blockers: readonly [
    'acceptance-artifact-required',
    'phase-d-content-binding-not-integrated',
    'phase1-compiler-sampled-boundary-integration-not-implemented',
    'interior-refinement-not-integrated',
    'curved-source-evaluator-not-integrated',
    'body-placement-not-proven',
    'runtime-owner-not-integrated',
    'settle-not-evaluated',
    'production-qualification-not-run',
  ];
}>;

export type Phase2BoundarySamplingEvaluationV1 = Readonly<{
  version: typeof PHASE2_BOUNDARY_SAMPLING_EVALUATION_V1;
  status: 'accepted';
  canonicalRequest: Phase2BoundarySamplingRequestV1;
  canonicalArtifact: Phase2BoundarySamplingArtifactV1;
  replayTriangulatorCallCount: number;
  deterministicFingerprint: string;
  claims: Readonly<{
    requestLocalConsistencyAccepted: true;
    sourceAuthenticityAccepted: false;
    cdt2dReexecuted: false;
  }>;
  blockers: readonly ['phase-d-content-binding-not-integrated'];
}>;

export interface Phase2BoundarySamplerV1 {
  readonly version: typeof PHASE2_BOUNDARY_SAMPLING_V1;
  sample(request: Phase2BoundarySamplingRequestV1): Phase2BoundarySamplingArtifactV1;
}

type SnapshotState = {
  nodes: number;
  properties: number;
  active: Set<object>;
};

function failure(
  code: Phase2BoundarySamplingErrorCodeV1,
  message: string,
  details: readonly string[] = [],
): never {
  throw new Phase2BoundarySamplingErrorV1(code, message, details);
}

function snapshotPlainData(
  value: unknown,
  path: string,
  depth: number,
  state: SnapshotState,
): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      failure('input-snapshot-invalid', `${path} must be finite and must not be negative zero.`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumStringLength)
      failure('resource-budget-exceeded', `${path} exceeds the string bound.`);
    return value;
  }
  if (typeof value !== 'object')
    failure('input-snapshot-invalid', `${path} is not plain serializable data.`);
  if (depth > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumDepth)
    failure('resource-budget-exceeded', `${path} exceeds the depth bound.`);
  if (state.active.has(value))
    failure('input-snapshot-invalid', `${path} contains a cyclic object graph.`);
  state.active.add(value);
  state.nodes += 1;
  if (state.nodes > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumNodes)
    failure('resource-budget-exceeded', `${path} exceeds the node bound.`);
  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype))
    failure('input-snapshot-invalid', `${path} must use a plain object or array prototype.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === 'symbol'))
    failure('input-snapshot-invalid', `${path} contains symbol properties.`);
  const dataKeys = (keys as string[]).filter((key) => !(isArray && key === 'length'));
  state.properties += dataKeys.length;
  if (state.properties > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumProperties)
    failure('resource-budget-exceeded', `${path} exceeds the property bound.`);
  if (isArray) {
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !('value' in lengthDescriptor))
      failure('input-snapshot-invalid', `${path} has no plain length descriptor.`);
    const length = lengthDescriptor.value as number;
    if (length > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumArrayLength)
      failure('resource-budget-exceeded', `${path} exceeds the array bound.`);
    if (dataKeys.length !== length || dataKeys.some((key, index) => key !== String(index)))
      failure('input-snapshot-invalid', `${path} must be a dense array without extra properties.`);
    const output = dataKeys.map((key) => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        failure('input-snapshot-invalid', `${path}[${key}] must be enumerable own data.`);
      return snapshotPlainData(descriptor.value, `${path}[${key}]`, depth + 1, state);
    });
    state.active.delete(value);
    return output;
  }
  const output: Record<string, unknown> = {};
  for (const key of dataKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      failure('input-snapshot-invalid', `${path}.${key} must be enumerable own data.`);
    output[key] = snapshotPlainData(descriptor.value, `${path}.${key}`, depth + 1, state);
  }
  state.active.delete(value);
  return output;
}

function snapshotRequest(request: unknown): unknown {
  try {
    return snapshotPlainData(request, 'request', 0, {
      nodes: 0,
      properties: 0,
      active: new Set<object>(),
    });
  } catch (error) {
    if (error instanceof Phase2BoundarySamplingErrorV1) throw error;
    failure('input-snapshot-invalid', 'Phase-2 request snapshot failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;

function snapshotArtifactTypedArray(
  value: object,
  path: string,
  state: SnapshotState,
): Uint32Array | Float32Array {
  if (!typedArrayLengthGetter || !typedArrayBufferGetter)
    failure('artifact-snapshot-invalid', `${path} cannot be inspected safely.`);
  if (state.active.has(value))
    failure('artifact-snapshot-invalid', `${path} contains a cyclic typed-array reference.`);
  state.active.add(value);
  state.nodes += 1;
  if (state.nodes > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumNodes)
    failure('resource-budget-exceeded', `${path} exceeds the node bound.`);
  let length: number;
  let buffer: ArrayBufferLike;
  try {
    length = typedArrayLengthGetter.call(value) as number;
    buffer = typedArrayBufferGetter.call(value) as ArrayBufferLike;
  } catch (error) {
    failure('artifact-snapshot-invalid', `${path} is not an inspectable typed array.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  if (length > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumTypedArrayLength)
    failure('resource-budget-exceeded', `${path} exceeds the typed-array bound.`);
  if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype)
    failure('artifact-snapshot-invalid', `${path} must use a private ArrayBuffer.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const dataKeys = keys.filter((key): key is string => typeof key === 'string');
  if (
    dataKeys.length !== keys.length ||
    dataKeys.length !== length ||
    dataKeys.some((key, index) => key !== String(index))
  )
    failure(
      'artifact-snapshot-invalid',
      `${path} must contain only dense enumerable typed-array elements.`,
    );
  state.properties += dataKeys.length;
  if (state.properties > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumProperties)
    failure('resource-budget-exceeded', `${path} exceeds the property bound.`);
  for (const key of dataKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      failure('artifact-snapshot-invalid', `${path}[${key}] is not plain element data.`);
    const element = descriptor.value as number;
    if (!Number.isFinite(element) || Object.is(element, -0))
      failure(
        'artifact-snapshot-invalid',
        `${path}[${key}] must be finite and must not be negative zero.`,
      );
  }
  let copy: Uint32Array | Float32Array;
  try {
    copy =
      Object.getPrototypeOf(value) === Uint32Array.prototype
        ? (Uint32Array.prototype.slice.call(value) as Uint32Array)
        : (Float32Array.prototype.slice.call(value) as Float32Array);
  } catch (error) {
    failure('artifact-snapshot-invalid', `${path} could not be copied safely.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  state.active.delete(value);
  return copy;
}

function snapshotArtifactData(
  value: unknown,
  path: string,
  depth: number,
  state: SnapshotState,
): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      failure('artifact-snapshot-invalid', `${path} must be finite and must not be negative zero.`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumStringLength)
      failure('resource-budget-exceeded', `${path} exceeds the string bound.`);
    return value;
  }
  if (typeof value !== 'object')
    failure('artifact-snapshot-invalid', `${path} is not plain serializable data.`);
  if (depth > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumDepth)
    failure('resource-budget-exceeded', `${path} exceeds the depth bound.`);
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch (error) {
    failure('artifact-snapshot-invalid', `${path} prototype inspection failed closed.`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  if (prototype === Uint32Array.prototype || prototype === Float32Array.prototype)
    return snapshotArtifactTypedArray(value, path, state);
  if (state.active.has(value))
    failure('artifact-snapshot-invalid', `${path} contains a cyclic object graph.`);
  state.active.add(value);
  state.nodes += 1;
  if (state.nodes > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumNodes)
    failure('resource-budget-exceeded', `${path} exceeds the node bound.`);
  const isArray = Array.isArray(value);
  if (prototype !== (isArray ? Array.prototype : Object.prototype))
    failure('artifact-snapshot-invalid', `${path} must use a supported plain prototype.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === 'symbol'))
    failure('artifact-snapshot-invalid', `${path} contains symbol properties.`);
  const dataKeys = (keys as string[]).filter((key) => !(isArray && key === 'length'));
  state.properties += dataKeys.length;
  if (state.properties > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumProperties)
    failure('resource-budget-exceeded', `${path} exceeds the property bound.`);
  if (isArray) {
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !('value' in lengthDescriptor))
      failure('artifact-snapshot-invalid', `${path} has no plain length descriptor.`);
    const length = lengthDescriptor.value as number;
    if (length > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumArrayLength)
      failure('resource-budget-exceeded', `${path} exceeds the array bound.`);
    if (dataKeys.length !== length || dataKeys.some((key, index) => key !== String(index)))
      failure('artifact-snapshot-invalid', `${path} must be a dense array without extras.`);
    const output = dataKeys.map((key) => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        failure('artifact-snapshot-invalid', `${path}[${key}] must be enumerable own data.`);
      return snapshotArtifactData(descriptor.value, `${path}[${key}]`, depth + 1, state);
    });
    state.active.delete(value);
    return output;
  }
  const output: Record<string, unknown> = {};
  for (const key of dataKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      failure('artifact-snapshot-invalid', `${path}.${key} must be enumerable own data.`);
    output[key] = snapshotArtifactData(descriptor.value, `${path}.${key}`, depth + 1, state);
  }
  state.active.delete(value);
  return output;
}

function snapshotArtifact(artifact: unknown): Phase2BoundarySamplingArtifactV1 {
  try {
    return snapshotArtifactData(artifact, 'artifact', 0, {
      nodes: 0,
      properties: 0,
      active: new Set<object>(),
    }) as Phase2BoundarySamplingArtifactV1;
  } catch (error) {
    if (error instanceof Phase2BoundarySamplingErrorV1) throw error;
    failure('artifact-snapshot-invalid', 'Phase-2 artifact snapshot failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

function assertKeys(value: unknown, keys: readonly string[], path: string): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    failure('input-snapshot-invalid', `${path} must be an exact object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    failure('input-snapshot-invalid', `${path} has an unsupported property shape.`);
}

function assertArray(
  value: unknown,
  path: string,
  exactLength?: number,
): asserts value is unknown[] {
  if (!Array.isArray(value) || (exactLength !== undefined && value.length !== exactLength))
    failure(
      'input-snapshot-invalid',
      exactLength === undefined
        ? `${path} must be an array.`
        : `${path} must be an exact ${exactLength}-element tuple.`,
    );
}

function assertString(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') failure('input-snapshot-invalid', `${path} must be a string.`);
}

function assertNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0))
    failure('input-snapshot-invalid', `${path} must be finite and must not be negative zero.`);
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== 'boolean') failure('input-snapshot-invalid', `${path} must be a boolean.`);
}

function assertRequestShape(request: unknown): asserts request is Phase2BoundarySamplingRequestV1 {
  assertKeys(
    request,
    ['version', 'sourceFileId', 'targetEdgeMm', 'pieces', 'equalSeams'],
    'request',
  );
  const root = request as Record<string, unknown>;
  assertString(root.version, 'request.version');
  assertString(root.sourceFileId, 'request.sourceFileId');
  assertNumber(root.targetEdgeMm, 'request.targetEdgeMm');
  assertArray(root.pieces, 'request.pieces');
  assertArray(root.equalSeams, 'request.equalSeams');
  const typedRequest = root as unknown as Phase2BoundarySamplingRequestV1;
  typedRequest.pieces.forEach((piece, pieceIndex) => {
    assertKeys(piece, ['input', 'edges'], `request.pieces[${pieceIndex}]`);
    const input = piece.input;
    assertKeys(
      input,
      ['pieceId', 'shell', 'holes', 'seamEndpoints', 'grainDegrees', 'options'],
      `request.pieces[${pieceIndex}].input`,
    );
    assertString(input.pieceId, `request.pieces[${pieceIndex}].input.pieceId`);
    assertNumber(input.grainDegrees, `request.pieces[${pieceIndex}].input.grainDegrees`);
    assertArray(input.holes, `request.pieces[${pieceIndex}].input.holes`);
    assertArray(input.seamEndpoints, `request.pieces[${pieceIndex}].input.seamEndpoints`);
    assertArray(piece.edges, `request.pieces[${pieceIndex}].edges`);
    assertKeys(
      input.options,
      [
        'targetEdgeMm',
        'minInputEdgeMm',
        'minTriangleAngleDegrees',
        'maxEdgeRatio',
        'maxRadiusEdgeRatio',
        'maxBoundaryErrorMm',
        'collinearSinTolerance',
      ],
      `request.pieces[${pieceIndex}].input.options`,
    );
    Object.entries(input.options).forEach(([key, value]) =>
      assertNumber(value, `request.pieces[${pieceIndex}].input.options.${key}`),
    );
    input.seamEndpoints.forEach((endpoint, endpointIndex) => {
      const path = `request.pieces[${pieceIndex}].input.seamEndpoints[${endpointIndex}]`;
      assertKeys(endpoint, ['id', 'boundaryVertexId'], path);
      assertString(endpoint.id, `${path}.id`);
      assertString(endpoint.boundaryVertexId, `${path}.boundaryVertexId`);
    });
    [input.shell, ...input.holes].forEach((ring, ringIndex) => {
      const ringPath = `piece[${pieceIndex}].ring[${ringIndex}]`;
      assertKeys(ring, ['id', 'role', 'vertices'], ringPath);
      assertString(ring.id, `${ringPath}.id`);
      assertString(ring.role, `${ringPath}.role`);
      assertArray(ring.vertices, `${ringPath}.vertices`);
      ring.vertices.forEach((vertex, vertexIndex) => {
        const vertexPath = `${ringPath}.vertices[${vertexIndex}]`;
        assertKeys(vertex, ['id', 'positionMm', 'source'], vertexPath);
        assertString(vertex.id, `${vertexPath}.id`);
        assertArray(vertex.positionMm, `${vertexPath}.positionMm`, 2);
        vertex.positionMm.forEach((coordinate, coordinateIndex) =>
          assertNumber(coordinate, `${vertexPath}.positionMm[${coordinateIndex}]`),
        );
        assertKeys(
          vertex.source,
          [
            'contourId',
            'sourceCurveId',
            'sourceCurveParameterSpace',
            'sourceCurveT',
            'normalizedArc',
          ],
          `${vertexPath}.source`,
        );
        assertString(vertex.source.contourId, `${vertexPath}.source.contourId`);
        assertString(vertex.source.sourceCurveId, `${vertexPath}.source.sourceCurveId`);
        assertString(
          vertex.source.sourceCurveParameterSpace,
          `${vertexPath}.source.sourceCurveParameterSpace`,
        );
        assertNumber(vertex.source.sourceCurveT, `${vertexPath}.source.sourceCurveT`);
        assertNumber(vertex.source.normalizedArc, `${vertexPath}.source.normalizedArc`);
      });
    });
    piece.edges.forEach((edge, edgeIndex) => {
      const path = `request.pieces[${pieceIndex}].edges[${edgeIndex}]`;
      assertKeys(
        edge,
        [
          'edgeId',
          'pieceId',
          'ringId',
          'edgeIndex',
          'startBoundaryVertexId',
          'endBoundaryVertexId',
          'native',
        ],
        path,
      );
      assertKeys(
        edge.native,
        [
          'sourceFileId',
          'sourceCurveId',
          'curveKind',
          'parameterSpace',
          'sourceCurveTRange',
          'chordErrorBoundMm',
          'periodic',
          'transform',
        ],
        `${path}.native`,
      );
      assertString(edge.edgeId, `${path}.edgeId`);
      assertString(edge.pieceId, `${path}.pieceId`);
      assertString(edge.ringId, `${path}.ringId`);
      assertNumber(edge.edgeIndex, `${path}.edgeIndex`);
      assertString(edge.startBoundaryVertexId, `${path}.startBoundaryVertexId`);
      assertString(edge.endBoundaryVertexId, `${path}.endBoundaryVertexId`);
      assertString(edge.native.sourceFileId, `${path}.native.sourceFileId`);
      assertString(edge.native.sourceCurveId, `${path}.native.sourceCurveId`);
      assertString(edge.native.curveKind, `${path}.native.curveKind`);
      assertString(edge.native.parameterSpace, `${path}.native.parameterSpace`);
      assertArray(edge.native.sourceCurveTRange, `${path}.native.sourceCurveTRange`, 2);
      edge.native.sourceCurveTRange.forEach((nativeT, nativeTIndex) =>
        assertNumber(nativeT, `${path}.native.sourceCurveTRange[${nativeTIndex}]`),
      );
      assertNumber(edge.native.chordErrorBoundMm, `${path}.native.chordErrorBoundMm`);
      assertBoolean(edge.native.periodic, `${path}.native.periodic`);
      const transform = edge.native.transform as unknown;
      if (transform === null || typeof transform !== 'object' || Array.isArray(transform))
        failure('input-snapshot-invalid', `${path}.native.transform must be an exact object.`);
      const transformRecord = transform as Record<string, unknown>;
      assertString(transformRecord.kind, `${path}.native.transform.kind`);
      assertKeys(
        transform,
        transformRecord.kind === 'identity' ? ['kind'] : ['kind', 'scale'],
        `${path}.native.transform`,
      );
      if ('scale' in transformRecord)
        assertNumber(transformRecord.scale, `${path}.native.transform.scale`);
    });
  });
  typedRequest.equalSeams.forEach((seam, seamIndex) => {
    const seamPath = `request.equalSeams[${seamIndex}]`;
    assertKeys(seam, ['seamId', 'mapping', 'lengthRatio', 'exactToleranceMm', 'sides'], seamPath);
    assertString(seam.seamId, `${seamPath}.seamId`);
    assertString(seam.mapping, `${seamPath}.mapping`);
    assertNumber(seam.lengthRatio, `${seamPath}.lengthRatio`);
    assertNumber(seam.exactToleranceMm, `${seamPath}.exactToleranceMm`);
    assertArray(seam.sides, `${seamPath}.sides`, 2);
    seam.sides.forEach((side, sideIndex) =>
      (() => {
        const sidePath = `${seamPath}.sides[${sideIndex}]`;
        assertKeys(side, ['pieceId', 'edgeId', 'direction'], sidePath);
        assertString(side.pieceId, `${sidePath}.pieceId`);
        assertString(side.edgeId, `${sidePath}.edgeId`);
        assertString(side.direction, `${sidePath}.direction`);
      })(),
    );
  });
}

function duplicateStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function occurrenceKey(pieceId: string, ringId: string, edgeIndex: number): string {
  return `${pieceId}\u0000${ringId}\u0000${edgeIndex}`;
}

function pointDistance(a: readonly [number, number], b: readonly [number, number]): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function samePoint(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

type ResolvedEdge = {
  readonly witness: Phase2NativeBoundaryEdgeV1;
  readonly piece: Phase2BoundarySamplingPieceV1;
  readonly ring: BoundaryRing;
  readonly start: BoundaryVertex;
  readonly end: BoundaryVertex;
  readonly lengthMm: number;
  segmentCount: number;
  sharedEqualSeamId: string | null;
  insertedBoundarySampleIds: string[];
  orderedBoundaryVertexIds: string[];
};

type ValidatedRequest = Readonly<{
  request: Phase2BoundarySamplingRequestV1;
  orderedEdges: readonly ResolvedEdge[];
  edgeById: ReadonlyMap<string, ResolvedEdge>;
}>;

function validateNativeWitness(
  request: Phase2BoundarySamplingRequestV1,
  edge: Phase2NativeBoundaryEdgeV1,
  start: BoundaryVertex,
): void {
  if (edge.native.curveKind !== 'line')
    failure(
      'unsupported-curve-kind',
      `${edge.edgeId} requires a source evaluator; only exact line edges are supported.`,
    );
  if (edge.native.parameterSpace !== 'unit' || start.source.sourceCurveParameterSpace !== 'unit')
    failure(
      'unsupported-parameter-space',
      `${edge.edgeId} uses an unsupported native parameter space.`,
    );
  if (edge.native.chordErrorBoundMm !== 0)
    failure(
      'unsupported-chord-error',
      `${edge.edgeId} has nonzero or invalid chord-error evidence.`,
    );
  if (edge.native.periodic !== false)
    failure(
      'unsupported-periodic-curve',
      `${edge.edgeId} is periodic and has no canonical cut-point contract.`,
    );
  if (edge.native.transform.kind !== 'identity')
    failure(
      'unsupported-transform',
      `${edge.edgeId} requires an unsupported source transform evaluation.`,
    );
  const [startT, endT] = edge.native.sourceCurveTRange;
  if (
    edge.native.sourceFileId !== request.sourceFileId ||
    edge.native.sourceCurveId !== start.source.sourceCurveId ||
    edge.native.parameterSpace !== start.source.sourceCurveParameterSpace ||
    !Number.isFinite(startT) ||
    !Number.isFinite(endT) ||
    startT < 0 ||
    startT > 1 ||
    endT < 0 ||
    endT > 1 ||
    startT === endT ||
    startT !== start.source.sourceCurveT
  )
    failure(
      'source-identity-mismatch',
      `${edge.edgeId} does not match its exact Phase-C source identity and native t anchor.`,
    );
}

function validateRequest(request: unknown): ValidatedRequest {
  assertRequestShape(request);
  if (
    request.version !== PHASE2_BOUNDARY_SAMPLING_V1 ||
    request.sourceFileId.length === 0 ||
    !Number.isFinite(request.targetEdgeMm) ||
    request.targetEdgeMm <= 0 ||
    request.targetEdgeMm > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumTargetEdgeMm
  )
    failure('input-snapshot-invalid', 'Phase-2 version, sourceFileId, or targetEdgeMm is invalid.');
  if (
    request.pieces.length === 0 ||
    request.pieces.length > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumPieces
  )
    failure('resource-budget-exceeded', 'Piece count exceeds the Phase-2 bound.');
  const pieceIds = request.pieces.map(({ input }) => input.pieceId);
  const duplicatePieces = duplicateStrings(pieceIds);
  if (duplicatePieces.length > 0)
    failure('duplicate-piece', 'Phase-2 piece ids must be unique.', duplicatePieces);
  const edgeIds = request.pieces.flatMap(({ edges }) => edges.map(({ edgeId }) => edgeId));
  if (
    edgeIds.some((id) => id.length === 0) ||
    request.pieces.some(
      ({ input, edges }) =>
        input.pieceId.length === 0 ||
        edges.some(
          (edge) =>
            edge.pieceId.length === 0 ||
            edge.ringId.length === 0 ||
            edge.startBoundaryVertexId.length === 0 ||
            edge.endBoundaryVertexId.length === 0 ||
            edge.native.sourceFileId.length === 0 ||
            edge.native.sourceCurveId.length === 0,
        ),
    )
  )
    failure(
      'source-identity-mismatch',
      'Piece, edge, ring, vertex, curve ids and native t-range tuples must be exact and nonempty.',
    );
  const duplicateEdgeIds = duplicateStrings(edgeIds);
  if (duplicateEdgeIds.length > 0)
    failure('edge-coverage-invalid', 'Native edge ids must be globally unique.', duplicateEdgeIds);
  if (edgeIds.length > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumEdges)
    failure('resource-budget-exceeded', 'Native edge count exceeds the Phase-2 bound.');

  const orderedEdges: ResolvedEdge[] = [];
  const edgeById = new Map<string, ResolvedEdge>();
  const globalBoundaryIds = new Set<string>();
  let totalRings = 0;
  let totalOriginalVertices = 0;
  let totalSampledVertices = 0;
  for (const piece of request.pieces) {
    const issues = preflightTriangulationInput(piece.input);
    if (issues.length > 0)
      failure(
        'preflight-failed',
        `${piece.input.pieceId} original triangulation input failed preflight.`,
        issues.map((issue) => `${issue.code}: ${issue.message}`),
      );
    const rings = [piece.input.shell, ...piece.input.holes];
    totalRings += rings.length;
    totalOriginalVertices += rings.reduce((sum, ring) => sum + ring.vertices.length, 0);
    const byOccurrence = new Map(
      piece.edges.map((edge) => [occurrenceKey(edge.pieceId, edge.ringId, edge.edgeIndex), edge]),
    );
    if (byOccurrence.size !== piece.edges.length)
      failure(
        'edge-coverage-invalid',
        `${piece.input.pieceId} repeats a directed loop-edge occurrence witness.`,
      );
    for (const ring of rings) {
      ring.vertices.forEach((vertex) => {
        if (globalBoundaryIds.has(vertex.id))
          failure(
            'source-identity-mismatch',
            `Boundary vertex id ${vertex.id} is not globally unique.`,
          );
        globalBoundaryIds.add(vertex.id);
      });
      for (let edgeIndex = 0; edgeIndex < ring.vertices.length; edgeIndex += 1) {
        const key = occurrenceKey(piece.input.pieceId, ring.id, edgeIndex);
        const witness = byOccurrence.get(key);
        if (!witness)
          failure(
            'edge-coverage-invalid',
            `${piece.input.pieceId}/${ring.id}/${edgeIndex} has no exact native edge witness.`,
          );
        const start = ring.vertices[edgeIndex];
        const end = ring.vertices[(edgeIndex + 1) % ring.vertices.length];
        if (
          witness.pieceId !== piece.input.pieceId ||
          witness.ringId !== ring.id ||
          witness.edgeIndex !== edgeIndex ||
          witness.startBoundaryVertexId !== start.id ||
          witness.endBoundaryVertexId !== end.id ||
          start.id === end.id ||
          samePoint(start.positionMm, end.positionMm)
        )
          failure(
            'edge-coverage-invalid',
            `${witness.edgeId} does not bind one non-degenerate directed loop-edge occurrence.`,
          );
        validateNativeWitness(request, witness, start);
        const lengthMm = pointDistance(start.positionMm, end.positionMm);
        if (!Number.isFinite(lengthMm) || lengthMm <= 0)
          failure('edge-coverage-invalid', `${witness.edgeId} has invalid physical length.`);
        const segmentCount = Math.ceil(lengthMm / request.targetEdgeMm);
        if (
          !Number.isSafeInteger(segmentCount) ||
          segmentCount < 1 ||
          segmentCount > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumSamplesPerEdge
        )
          failure(
            'resource-budget-exceeded',
            `${witness.edgeId} requires ${segmentCount} segments, outside the per-edge bound.`,
          );
        const resolved: ResolvedEdge = {
          witness,
          piece,
          ring,
          start,
          end,
          lengthMm,
          segmentCount,
          sharedEqualSeamId: null,
          insertedBoundarySampleIds: [],
          orderedBoundaryVertexIds: [],
        };
        orderedEdges.push(resolved);
        edgeById.set(witness.edgeId, resolved);
        totalSampledVertices += segmentCount;
      }
    }
    if (piece.edges.length !== rings.reduce((sum, ring) => sum + ring.vertices.length, 0))
      failure(
        'edge-coverage-invalid',
        `${piece.input.pieceId} contains extra or missing edge witnesses.`,
      );
  }
  if (
    totalRings > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumRings ||
    totalOriginalVertices > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumOriginalBoundaryVertices
  )
    failure('resource-budget-exceeded', 'Original boundary topology exceeds the Phase-2 bound.');

  if (request.equalSeams.length > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumEqualSeams)
    failure('resource-budget-exceeded', 'Equal seam count exceeds the Phase-2 bound.');
  const duplicateSeams = duplicateStrings(request.equalSeams.map(({ seamId }) => seamId));
  if (duplicateSeams.length > 0)
    failure('unsupported-seam-semantics', 'Equal seam ids must be unique.', duplicateSeams);
  const ownedEdges = new Set<string>();
  for (const seam of request.equalSeams) {
    if (
      seam.seamId.length === 0 ||
      seam.sides.some(
        (side) =>
          side.pieceId.length === 0 ||
          side.edgeId.length === 0 ||
          (side.direction !== 'forward' && side.direction !== 'reverse'),
      ) ||
      seam.mapping !== 'equal' ||
      seam.lengthRatio !== 1 ||
      !Number.isFinite(seam.exactToleranceMm) ||
      seam.exactToleranceMm < 0 ||
      seam.exactToleranceMm > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumExactSeamToleranceMm
    )
      failure('unsupported-seam-semantics', `${seam.seamId} is not a supported exact equal seam.`);
    const first = edgeById.get(seam.sides[0].edgeId);
    const second = edgeById.get(seam.sides[1].edgeId);
    if (
      !first ||
      !second ||
      first.witness.pieceId !== seam.sides[0].pieceId ||
      second.witness.pieceId !== seam.sides[1].pieceId ||
      first === second ||
      ownedEdges.has(first.witness.edgeId) ||
      ownedEdges.has(second.witness.edgeId)
    )
      failure(
        'non-bijective-seam',
        `${seam.seamId} does not own two distinct, previously unclaimed directed edges.`,
      );
    if (Math.abs(first.lengthMm - second.lengthMm) > seam.exactToleranceMm)
      failure(
        'unequal-seam-length',
        `${seam.seamId} side lengths exceed the exact equal-seam tolerance.`,
      );
    const sharedCount = Math.max(first.segmentCount, second.segmentCount);
    first.segmentCount = sharedCount;
    second.segmentCount = sharedCount;
    first.sharedEqualSeamId = seam.seamId;
    second.sharedEqualSeamId = seam.seamId;
    ownedEdges.add(first.witness.edgeId);
    ownedEdges.add(second.witness.edgeId);
  }
  totalSampledVertices = orderedEdges.reduce((sum, edge) => sum + edge.segmentCount, 0);
  if (totalSampledVertices > PHASE2_BOUNDARY_SAMPLING_LIMITS_V1.maximumSampledBoundaryVertices)
    failure('resource-budget-exceeded', 'Sampled boundary exceeds the global vertex bound.');
  return { request, orderedEdges, edgeById };
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function sampleId(edge: ResolvedEdge, numerator: number): string {
  const identity = [
    edge.witness.native.sourceFileId,
    edge.witness.edgeId,
    edge.witness.pieceId,
    edge.witness.ringId,
    edge.witness.edgeIndex,
    edge.witness.native.sourceCurveId,
    edge.witness.native.sourceCurveTRange[0],
    edge.witness.native.sourceCurveTRange[1],
  ].join('\u0000');
  return `p2s-${fnv1a64(identity)}-${numerator}-of-${edge.segmentCount}`;
}

type DerivedSample = Readonly<{
  id: string;
  positionMm: readonly [number, number];
  source: BoundaryVertex['source'];
  outputSource: Extract<OutputVertexSource, { kind: 'boundary-sample' }>;
}>;

function buildSampledRing(
  pieceId: string,
  ring: BoundaryRing,
  edgeByOccurrence: ReadonlyMap<string, ResolvedEdge>,
  derivedById: Map<string, DerivedSample>,
  allBoundaryIds: Set<string>,
): BoundaryRing {
  const vertices: BoundaryVertex[] = [];
  for (let edgeIndex = 0; edgeIndex < ring.vertices.length; edgeIndex += 1) {
    const start = ring.vertices[edgeIndex];
    const end = ring.vertices[(edgeIndex + 1) % ring.vertices.length];
    const edge = edgeByOccurrence.get(occurrenceKey(pieceId, ring.id, edgeIndex));
    if (!edge)
      failure(
        'edge-coverage-invalid',
        `${pieceId}/${ring.id}/${edgeIndex} lost its validated edge witness.`,
      );
    vertices.push({
      id: start.id,
      positionMm: [start.positionMm[0], start.positionMm[1]],
      source: { ...start.source },
    });
    edge.orderedBoundaryVertexIds.push(start.id);
    const endArc = edgeIndex + 1 < ring.vertices.length ? end.source.normalizedArc : 1;
    if (!(endArc > start.source.normalizedArc))
      failure(
        'source-identity-mismatch',
        `${edge.witness.edgeId} cannot interpolate a strictly increasing normalized arc.`,
      );
    const [startT, endT] = edge.witness.native.sourceCurveTRange;
    for (let numerator = 1; numerator < edge.segmentCount; numerator += 1) {
      const u = numerator / edge.segmentCount;
      const id = sampleId(edge, numerator);
      if (allBoundaryIds.has(id))
        failure(
          'source-identity-mismatch',
          `${edge.witness.edgeId} generated a colliding boundary sample id.`,
        );
      allBoundaryIds.add(id);
      const positionMm = [
        start.positionMm[0] + (end.positionMm[0] - start.positionMm[0]) * u,
        start.positionMm[1] + (end.positionMm[1] - start.positionMm[1]) * u,
      ] as const;
      const provenance = {
        contourId: ring.id,
        sourceCurveId: edge.witness.native.sourceCurveId,
        sourceCurveParameterSpace: 'unit' as const,
        sourceCurveT: startT + (endT - startT) * u,
        normalizedArc: start.source.normalizedArc + (endArc - start.source.normalizedArc) * u,
      };
      const derived: DerivedSample = {
        id,
        positionMm,
        source: provenance,
        outputSource: {
          kind: 'boundary-sample',
          parentSegment: {
            ringId: ring.id,
            startBoundaryVertexId: start.id,
            endBoundaryVertexId: end.id,
          },
          provenance,
        },
      };
      derivedById.set(id, derived);
      edge.insertedBoundarySampleIds.push(id);
      edge.orderedBoundaryVertexIds.push(id);
      vertices.push({ id, positionMm, source: provenance });
    }
    edge.orderedBoundaryVertexIds.push(end.id);
  }
  return { id: ring.id, role: ring.role, vertices };
}

type SampledPiecePlan = Readonly<{
  originalInput: ConstrainedTriangulationInput;
  sampledInput: ConstrainedTriangulationInput;
  derivedById: ReadonlyMap<string, DerivedSample>;
}>;

function buildSampledPiece(
  piece: Phase2BoundarySamplingPieceV1,
  edgeByOccurrence: ReadonlyMap<string, ResolvedEdge>,
  allBoundaryIds: Set<string>,
): SampledPiecePlan {
  const derivedById = new Map<string, DerivedSample>();
  const sampledShell = buildSampledRing(
    piece.input.pieceId,
    piece.input.shell,
    edgeByOccurrence,
    derivedById,
    allBoundaryIds,
  );
  const sampledHoles = piece.input.holes.map((ring) =>
    buildSampledRing(piece.input.pieceId, ring, edgeByOccurrence, derivedById, allBoundaryIds),
  );
  const sampledInput: ConstrainedTriangulationInput = {
    pieceId: piece.input.pieceId,
    shell: sampledShell,
    holes: sampledHoles,
    seamEndpoints: piece.input.seamEndpoints.map((endpoint) => ({ ...endpoint })),
    grainDegrees: piece.input.grainDegrees,
    options: { ...piece.input.options },
  };
  const issues = preflightTriangulationInput(sampledInput);
  if (issues.length > 0)
    failure(
      'preflight-failed',
      `${piece.input.pieceId} sampled triangulation input failed preflight.`,
      issues.map((issue) => `${issue.code}: ${issue.message}`),
    );
  return { originalInput: piece.input, sampledInput, derivedById };
}

function resultCandidate(result: ConstrainedTriangulationResult): TriangulationAuditCandidate {
  return {
    vertices: result.vertices,
    triangles: result.triangles,
    boundaryLoops: result.boundaryLoops,
    seamEndpoints: result.seamEndpoints,
    triangleMaterialFrames2: result.triangleMaterialFrames2,
  };
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

function liftAndAuditResult(
  plan: SampledPiecePlan,
  rawResult: ConstrainedTriangulationResult,
): ConstrainedTriangulationResult {
  const rawCandidate = resultCandidate(rawResult);
  if (
    rawResult.deterministicHash !== triangulationResultFingerprint(rawCandidate) ||
    rawResult.quality.verdict !== 'pass'
  )
    failure(
      'result-hash-mismatch',
      `${plan.originalInput.pieceId} Phase-1 adapter result hash or quality is invalid.`,
    );
  const sampledAudit = auditTriangulationResult(plan.sampledInput, rawCandidate);
  if (sampledAudit.verdict !== 'pass')
    failure(
      'adapter-failed',
      `${plan.originalInput.pieceId} failed the normal sampled-input triangulation audit.`,
      sampledAudit.issues.map((issue) => `${issue.code}: ${issue.message}`),
    );
  const seenDerived = new Set<string>();
  const vertices = rawResult.vertices.map((vertex) => {
    if (vertex.source.kind !== 'boundary')
      return {
        positionMm: [vertex.positionMm[0], vertex.positionMm[1]] as const,
        source: copyOutputSource(vertex.source),
      };
    const derived = plan.derivedById.get(vertex.source.boundaryVertexId);
    if (!derived)
      return {
        positionMm: [vertex.positionMm[0], vertex.positionMm[1]] as const,
        source: copyOutputSource(vertex.source),
      };
    if (
      seenDerived.has(derived.id) ||
      !samePoint(vertex.positionMm, derived.positionMm) ||
      vertex.source.provenance.contourId !== derived.source.contourId ||
      vertex.source.provenance.sourceCurveId !== derived.source.sourceCurveId ||
      vertex.source.provenance.sourceCurveParameterSpace !==
        derived.source.sourceCurveParameterSpace ||
      vertex.source.provenance.sourceCurveT !== derived.source.sourceCurveT ||
      vertex.source.provenance.normalizedArc !== derived.source.normalizedArc
    )
      failure(
        'source-identity-mismatch',
        `${plan.originalInput.pieceId}/${derived.id} failed exact native-t projection.`,
      );
    seenDerived.add(derived.id);
    return {
      positionMm: [vertex.positionMm[0], vertex.positionMm[1]] as const,
      source: copyOutputSource(derived.outputSource),
    };
  });
  if (seenDerived.size !== plan.derivedById.size)
    failure(
      'source-identity-mismatch',
      `${plan.originalInput.pieceId} omitted one or more inserted boundary samples.`,
    );
  const candidate: TriangulationAuditCandidate = {
    vertices,
    triangles: rawResult.triangles.slice(),
    boundaryLoops: rawResult.boundaryLoops.map((loop) => ({
      inputRingId: loop.inputRingId,
      role: loop.role,
      vertexIndices: loop.vertexIndices.slice(),
    })),
    seamEndpoints: rawResult.seamEndpoints.map((endpoint) => ({ ...endpoint })),
    triangleMaterialFrames2: Float32Array.from(rawResult.triangleMaterialFrames2, (value) =>
      Object.is(value, -0) ? 0 : value,
    ),
  };
  const projectedAudit = auditTriangulationResult(plan.originalInput, candidate);
  if (projectedAudit.verdict !== 'pass')
    failure(
      'post-audit-failed',
      `${plan.originalInput.pieceId} failed projection audit against its original boundary.`,
      projectedAudit.issues.map((issue) => `${issue.code}: ${issue.message}`),
    );
  const boundarySamples = vertices.filter((vertex) => vertex.source.kind === 'boundary-sample');
  if (boundarySamples.length !== plan.derivedById.size)
    failure(
      'source-identity-mismatch',
      `${plan.originalInput.pieceId} has unexpected boundary-sample provenance cardinality.`,
    );
  return {
    ...candidate,
    deterministicHash: triangulationResultFingerprint(candidate),
    quality: projectedAudit,
  };
}

function edgeEvidence(edges: readonly ResolvedEdge[]): readonly Phase2BoundaryEdgeEvidenceV1[] {
  return edges.map((edge) => ({
    edgeId: edge.witness.edgeId,
    pieceId: edge.witness.pieceId,
    ringId: edge.witness.ringId,
    edgeIndex: edge.witness.edgeIndex,
    sourceCurveId: edge.witness.native.sourceCurveId,
    sourceCurveTRange: [...edge.witness.native.sourceCurveTRange] as [number, number],
    lengthMm: edge.lengthMm,
    segmentCount: edge.segmentCount,
    maximumSampledSegmentLengthMm: edge.lengthMm / edge.segmentCount,
    insertedBoundarySampleIds: [...edge.insertedBoundarySampleIds],
    sharedEqualSeamId: edge.sharedEqualSeamId,
  }));
}

function seamSideEvidence(
  side: Phase2EqualSeamSideV1,
  edge: ResolvedEdge,
): Phase2EqualSeamEvidenceV1['sides'][0] {
  const directedBoundaryVertexIds =
    side.direction === 'forward'
      ? [...edge.orderedBoundaryVertexIds]
      : [...edge.orderedBoundaryVertexIds].reverse();
  return {
    pieceId: side.pieceId,
    edgeId: side.edgeId,
    direction: side.direction,
    sharedProgressMapping: side.direction === 'forward' ? 'u' : 'one-minus-u',
    directedBoundaryVertexIds,
  };
}

function seamEvidence(
  request: Phase2BoundarySamplingRequestV1,
  edgeById: ReadonlyMap<string, ResolvedEdge>,
): readonly Phase2EqualSeamEvidenceV1[] {
  const compareCodeUnits = (left: string, right: string) =>
    left < right ? -1 : left > right ? 1 : 0;
  return [...request.equalSeams]
    .sort((left, right) => compareCodeUnits(left.seamId, right.seamId))
    .map((seam) => {
      const first = edgeById.get(seam.sides[0].edgeId)!;
      const second = edgeById.get(seam.sides[1].edgeId)!;
      if (
        first.segmentCount !== second.segmentCount ||
        first.orderedBoundaryVertexIds.length !== first.segmentCount + 1 ||
        second.orderedBoundaryVertexIds.length !== second.segmentCount + 1
      )
        failure('non-bijective-seam', `${seam.seamId} lost shared equal-seam progress coverage.`);
      return {
        seamId: seam.seamId,
        sharedSegmentCount: first.segmentCount,
        progress: Array.from({ length: first.segmentCount + 1 }, (_, numerator) => ({
          numerator,
          denominator: first.segmentCount,
        })),
        sides: [seamSideEvidence(seam.sides[0], first), seamSideEvidence(seam.sides[1], second)],
      };
    });
}

function artifactPayload(
  sourceFileId: string,
  targetEdgeMm: number,
  pieces: readonly Phase2BoundarySamplingPieceResultV1[],
  edges: readonly Phase2BoundaryEdgeEvidenceV1[],
  seams: readonly Phase2EqualSeamEvidenceV1[],
): Readonly<Record<string, unknown>> {
  return {
    version: PHASE2_BOUNDARY_SAMPLING_V1,
    sourceFileId,
    targetEdgeMm,
    pieces: pieces.map((piece) => ({
      pieceId: piece.pieceId,
      originalBoundaryVertexCount: piece.originalBoundaryVertexCount,
      sampledBoundaryVertexCount: piece.sampledBoundaryVertexCount,
      insertedBoundarySampleCount: piece.insertedBoundarySampleCount,
      sampledInput: piece.sampledInput,
      result: {
        vertices: piece.result.vertices,
        triangles: [...piece.result.triangles],
        boundaryLoops: piece.result.boundaryLoops.map((loop) => ({
          inputRingId: loop.inputRingId,
          role: loop.role,
          vertexIndices: [...loop.vertexIndices],
        })),
        seamEndpoints: piece.result.seamEndpoints,
        triangleMaterialFrames2: [...piece.result.triangleMaterialFrames2],
        deterministicHash: piece.result.deterministicHash,
        quality: piece.result.quality,
      },
    })),
    edges,
    seams,
  };
}

function artifactFingerprint(
  sourceFileId: string,
  targetEdgeMm: number,
  pieces: readonly Phase2BoundarySamplingPieceResultV1[],
  edges: readonly Phase2BoundaryEdgeEvidenceV1[],
  seams: readonly Phase2EqualSeamEvidenceV1[],
): string {
  return `p2bs1-fnv1a64:${fnv1a64(
    JSON.stringify(artifactPayload(sourceFileId, targetEdgeMm, pieces, edges, seams)),
  )}`;
}

function firstJsonDifference(left: unknown, right: unknown, path = 'payload'): string | null {
  if (Object.is(left, right)) return null;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return `${path}: ${JSON.stringify(left)} !== ${JSON.stringify(right)}`;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (JSON.stringify(leftKeys) !== JSON.stringify(rightKeys))
    return `${path}: key order ${JSON.stringify(leftKeys)} !== ${JSON.stringify(rightKeys)}`;
  const keys = [...new Set([...leftKeys, ...rightKeys])].sort();
  for (const key of keys) {
    const difference = firstJsonDifference(leftRecord[key], rightRecord[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

function triangulationCanonicalPayloadForEvaluation(
  result: ConstrainedTriangulationResult,
): string {
  return JSON.stringify({
    vertices: result.vertices.map((vertex) => ({
      positionMm: vertex.positionMm,
      source: vertex.source,
    })),
    triangles: [...result.triangles],
    boundaryLoops: result.boundaryLoops.map((loop) => [
      loop.inputRingId,
      loop.role,
      [...loop.vertexIndices],
    ]),
    seamEndpoints: result.seamEndpoints.map((endpoint) => [
      endpoint.seamEndpointId,
      endpoint.vertexIndex,
    ]),
    triangleMaterialFrames2: [...result.triangleMaterialFrames2],
  });
}

function boundaryVertexCount(input: ConstrainedTriangulationInput): number {
  return [input.shell, ...input.holes].reduce((sum, ring) => sum + ring.vertices.length, 0);
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

function executeSample(
  snapshot: unknown,
  triangulator: ConstrainedTriangulator,
): Phase2BoundarySamplingArtifactV1 {
  const validated = validateRequest(snapshot);
  const request = validated.request;
  const edgeByOccurrence = new Map(
    validated.orderedEdges.map((edge) => [
      occurrenceKey(edge.witness.pieceId, edge.witness.ringId, edge.witness.edgeIndex),
      edge,
    ]),
  );
  const allBoundaryIds = new Set(
    request.pieces.flatMap(({ input }) =>
      [input.shell, ...input.holes].flatMap((ring) => ring.vertices.map(({ id }) => id)),
    ),
  );
  const plans = request.pieces.map((piece) =>
    buildSampledPiece(piece, edgeByOccurrence, allBoundaryIds),
  );
  const pieces: Phase2BoundarySamplingPieceResultV1[] = [];
  for (const plan of plans) {
    let rawResult: ConstrainedTriangulationResult;
    try {
      rawResult = triangulator.triangulate(plan.sampledInput);
    } catch (error) {
      failure(
        'adapter-failed',
        `${plan.originalInput.pieceId} Phase-1 adapter invocation failed.`,
        [error instanceof Error ? error.message : String(error)],
      );
    }
    let result: ConstrainedTriangulationResult;
    try {
      result = liftAndAuditResult(plan, rawResult);
    } catch (error) {
      if (error instanceof Phase2BoundarySamplingErrorV1) throw error;
      failure(
        'adapter-failed',
        `${plan.originalInput.pieceId} Phase-1 adapter result failed closed.`,
        [error instanceof Error ? error.message : String(error)],
      );
    }
    pieces.push({
      pieceId: plan.originalInput.pieceId,
      originalBoundaryVertexCount: boundaryVertexCount(plan.originalInput),
      sampledBoundaryVertexCount: boundaryVertexCount(plan.sampledInput),
      insertedBoundarySampleCount: plan.derivedById.size,
      sampledInput: plan.sampledInput,
      result,
    });
  }
  const edges = edgeEvidence(validated.orderedEdges);
  if (
    edges.some(
      (edge) => edge.maximumSampledSegmentLengthMm > request.targetEdgeMm + Number.EPSILON * 16,
    )
  )
    failure('post-audit-failed', 'A sampled edge exceeds targetEdgeMm after compilation.');
  const equalSeams = seamEvidence(request, validated.edgeById);
  return freezeOwnedPlainData({
    version: PHASE2_BOUNDARY_SAMPLING_V1,
    sourceFileId: request.sourceFileId,
    targetEdgeMm: request.targetEdgeMm,
    phase1AdapterCallCount: pieces.length,
    pieces,
    edges,
    equalSeams,
    deterministicFingerprint: artifactFingerprint(
      request.sourceFileId,
      request.targetEdgeMm,
      pieces,
      edges,
      equalSeams,
    ),
    claims: {
      acceptanceRequired: true,
      sourceNativeBoundarySamplingExecuted: true,
      exactBoundarySampleProvenanceAudited: true,
      phase1AdapterReused: true,
      ownedOutputNoCallerAlias: true,
      phase1CompilerIntegrated: false,
      interiorRefinementIntegrated: false,
      bodyPlacementReady: false,
      runtimeIntegrated: false,
      settleAccepted: false,
      productionReady: false,
    },
    blockers: [
      'acceptance-artifact-required',
      'phase-d-content-binding-not-integrated',
      'phase1-compiler-sampled-boundary-integration-not-implemented',
      'interior-refinement-not-integrated',
      'curved-source-evaluator-not-integrated',
      'body-placement-not-proven',
      'runtime-owner-not-integrated',
      'settle-not-evaluated',
      'production-qualification-not-run',
    ],
  });
}

function assertArtifactEnvelope(artifact: Phase2BoundarySamplingArtifactV1): void {
  assertKeys(
    artifact,
    [
      'version',
      'sourceFileId',
      'targetEdgeMm',
      'phase1AdapterCallCount',
      'pieces',
      'edges',
      'equalSeams',
      'deterministicFingerprint',
      'claims',
      'blockers',
    ],
    'artifact',
  );
  assertString(artifact.version, 'artifact.version');
  assertString(artifact.sourceFileId, 'artifact.sourceFileId');
  assertNumber(artifact.targetEdgeMm, 'artifact.targetEdgeMm');
  assertNumber(artifact.phase1AdapterCallCount, 'artifact.phase1AdapterCallCount');
  assertString(artifact.deterministicFingerprint, 'artifact.deterministicFingerprint');
  assertArray(artifact.pieces, 'artifact.pieces');
  assertArray(artifact.edges, 'artifact.edges');
  assertArray(artifact.equalSeams, 'artifact.equalSeams');
  assertArray(artifact.blockers, 'artifact.blockers');
  assertKeys(
    artifact.claims,
    [
      'acceptanceRequired',
      'sourceNativeBoundarySamplingExecuted',
      'exactBoundarySampleProvenanceAudited',
      'phase1AdapterReused',
      'ownedOutputNoCallerAlias',
      'phase1CompilerIntegrated',
      'interiorRefinementIntegrated',
      'bodyPlacementReady',
      'runtimeIntegrated',
      'settleAccepted',
      'productionReady',
    ],
    'artifact.claims',
  );
  artifact.pieces.forEach((piece, pieceIndex) => {
    const path = `artifact.pieces[${pieceIndex}]`;
    assertKeys(
      piece,
      [
        'pieceId',
        'originalBoundaryVertexCount',
        'sampledBoundaryVertexCount',
        'insertedBoundarySampleCount',
        'sampledInput',
        'result',
      ],
      path,
    );
    assertString(piece.pieceId, `${path}.pieceId`);
    assertNumber(piece.originalBoundaryVertexCount, `${path}.originalBoundaryVertexCount`);
    assertNumber(piece.sampledBoundaryVertexCount, `${path}.sampledBoundaryVertexCount`);
    assertNumber(piece.insertedBoundarySampleCount, `${path}.insertedBoundarySampleCount`);
    assertKeys(
      piece.result,
      [
        'vertices',
        'triangles',
        'boundaryLoops',
        'seamEndpoints',
        'triangleMaterialFrames2',
        'deterministicHash',
        'quality',
      ],
      `${path}.result`,
    );
    assertArray(piece.result.vertices, `${path}.result.vertices`);
    assertArray(piece.result.boundaryLoops, `${path}.result.boundaryLoops`);
    assertArray(piece.result.seamEndpoints, `${path}.result.seamEndpoints`);
    if (Object.getPrototypeOf(piece.result.triangles) !== Uint32Array.prototype)
      failure('artifact-snapshot-invalid', `${path}.result.triangles must be Uint32Array.`);
    if (Object.getPrototypeOf(piece.result.triangleMaterialFrames2) !== Float32Array.prototype)
      failure(
        'artifact-snapshot-invalid',
        `${path}.result.triangleMaterialFrames2 must be Float32Array.`,
      );
    piece.result.boundaryLoops.forEach((loop, loopIndex) => {
      if (Object.getPrototypeOf(loop.vertexIndices) !== Uint32Array.prototype)
        failure(
          'artifact-snapshot-invalid',
          `${path}.result.boundaryLoops[${loopIndex}].vertexIndices must be Uint32Array.`,
        );
    });
  });
}

function sameVertexProvenance(
  actual: BoundaryVertex['source'],
  expected: BoundaryVertex['source'],
): boolean {
  return (
    actual.contourId === expected.contourId &&
    actual.sourceCurveId === expected.sourceCurveId &&
    actual.sourceCurveParameterSpace === expected.sourceCurveParameterSpace &&
    actual.sourceCurveT === expected.sourceCurveT &&
    actual.normalizedArc === expected.normalizedArc
  );
}

function lowerArtifactPieceResult(
  piece: Phase2BoundarySamplingPieceResultV1,
  sampledInput: ConstrainedTriangulationInput,
): ConstrainedTriangulationResult {
  if (JSON.stringify(piece.sampledInput) !== JSON.stringify(sampledInput))
    failure(
      'artifact-request-mismatch',
      `${sampledInput.pieceId} sampled input differs from the canonical request expansion.`,
    );
  const rings = [sampledInput.shell, ...sampledInput.holes];
  if (piece.result.boundaryLoops.length !== rings.length)
    failure(
      'artifact-request-mismatch',
      `${sampledInput.pieceId} boundary-loop cardinality differs from its sampled input.`,
    );
  const loweredVertices: Array<ConstrainedTriangulationResult['vertices'][number] | undefined> =
    Array.from({ length: piece.result.vertices.length });
  const covered = new Set<number>();
  for (const ring of rings) {
    const loops = piece.result.boundaryLoops.filter((loop) => loop.inputRingId === ring.id);
    if (
      loops.length !== 1 ||
      loops[0].role !== ring.role ||
      loops[0].vertexIndices.length !== ring.vertices.length
    )
      failure(
        'artifact-request-mismatch',
        `${sampledInput.pieceId}/${ring.id} cannot be zipped by exact audited loop order.`,
      );
    loops[0].vertexIndices.forEach((localIndex, ringVertexIndex) => {
      const actual = piece.result.vertices[localIndex];
      const expected = ring.vertices[ringVertexIndex];
      if (
        !actual ||
        localIndex >= piece.result.vertices.length ||
        covered.has(localIndex) ||
        (actual.source.kind !== 'boundary' && actual.source.kind !== 'boundary-sample')
      )
        failure(
          'artifact-request-mismatch',
          `${sampledInput.pieceId}/${ring.id}/${ringVertexIndex} lost exact loop-order identity.`,
        );
      if (
        !samePoint(actual.positionMm, expected.positionMm) ||
        !sameVertexProvenance(actual.source.provenance, expected.source) ||
        (actual.source.kind === 'boundary' && actual.source.boundaryVertexId !== expected.id)
      )
        failure(
          'artifact-request-mismatch',
          `${sampledInput.pieceId}/${ring.id}/${ringVertexIndex} lost exact loop-order identity.`,
        );
      covered.add(localIndex);
      loweredVertices[localIndex] = {
        positionMm: [actual.positionMm[0], actual.positionMm[1]],
        source: {
          kind: 'boundary',
          boundaryVertexId: expected.id,
          // The pinned Phase-1 adapter descriptor-snapshots object keys in code-unit order.
          // Reproduce that canonical representation before replaying the lift/hash path.
          provenance: {
            contourId: expected.source.contourId,
            normalizedArc: expected.source.normalizedArc,
            sourceCurveId: expected.source.sourceCurveId,
            sourceCurveParameterSpace: expected.source.sourceCurveParameterSpace,
            sourceCurveT: expected.source.sourceCurveT,
          },
        },
      };
    });
  }
  if (
    covered.size !== piece.result.vertices.length ||
    loweredVertices.some((vertex) => vertex === undefined)
  )
    failure(
      'artifact-request-mismatch',
      `${sampledInput.pieceId} contains a non-boundary or unbound output vertex.`,
    );
  const candidate: TriangulationAuditCandidate = {
    vertices: loweredVertices as ConstrainedTriangulationResult['vertices'],
    triangles: piece.result.triangles.slice(),
    boundaryLoops: piece.result.boundaryLoops.map((loop) => ({
      inputRingId: loop.inputRingId,
      role: loop.role,
      vertexIndices: loop.vertexIndices.slice(),
    })),
    seamEndpoints: piece.result.seamEndpoints.map((endpoint) => ({ ...endpoint })),
    triangleMaterialFrames2: piece.result.triangleMaterialFrames2.slice(),
  };
  const quality = auditTriangulationResult(sampledInput, candidate);
  if (quality.verdict !== 'pass')
    failure(
      'artifact-request-mismatch',
      `${sampledInput.pieceId} failed replay audit against its sampled input.`,
      quality.issues.map((issue) => `${issue.code}: ${issue.message}`),
    );
  return {
    ...candidate,
    deterministicHash: triangulationResultFingerprint(candidate),
    quality,
  };
}

let evaluationActive = false;

export function evaluatePhase2BoundarySamplingArtifactV1(
  request: Phase2BoundarySamplingRequestV1,
  artifact: Phase2BoundarySamplingArtifactV1,
): Phase2BoundarySamplingEvaluationV1 {
  if (evaluationActive)
    failure('reentrant-call', 'Phase-2 artifact evaluation rejects reentrant calls.');
  evaluationActive = true;
  try {
    const canonicalRequestUnknown = snapshotRequest(request);
    assertRequestShape(canonicalRequestUnknown);
    const canonicalRequest = freezeOwnedPlainData(canonicalRequestUnknown);
    const supplied = snapshotArtifact(artifact);
    assertArtifactEnvelope(supplied);
    const duplicatePieceIds = duplicateStrings(supplied.pieces.map(({ pieceId }) => pieceId));
    if (duplicatePieceIds.length > 0)
      failure(
        'artifact-request-mismatch',
        'Phase-2 artifact contains duplicate piece ids.',
        duplicatePieceIds,
      );
    const suppliedByPieceId = new Map(
      supplied.pieces.map((piece) => [piece.pieceId, piece] as const),
    );
    let replayTriangulatorCallCount = 0;
    const replayTriangulator: ConstrainedTriangulator = {
      id: 'phase2-boundary-sampling-artifact-replay/1',
      version: '1',
      triangulate(sampledInput) {
        replayTriangulatorCallCount += 1;
        const piece = suppliedByPieceId.get(sampledInput.pieceId);
        if (!piece)
          failure(
            'artifact-request-mismatch',
            `${sampledInput.pieceId} is missing from the supplied Phase-2 artifact.`,
          );
        return lowerArtifactPieceResult(piece, sampledInput);
      },
    };
    const expected = createPhase2BoundarySamplerV1(replayTriangulator).sample(canonicalRequest);
    const recomputedSuppliedFingerprint = artifactFingerprint(
      supplied.sourceFileId,
      supplied.targetEdgeMm,
      supplied.pieces,
      supplied.edges,
      supplied.equalSeams,
    );
    const suppliedPayload = JSON.stringify(
      artifactPayload(
        supplied.sourceFileId,
        supplied.targetEdgeMm,
        supplied.pieces,
        supplied.edges,
        supplied.equalSeams,
      ),
    );
    const expectedPayload = JSON.stringify(
      artifactPayload(
        expected.sourceFileId,
        expected.targetEdgeMm,
        expected.pieces,
        expected.edges,
        expected.equalSeams,
      ),
    );
    const mismatches = [
      replayTriangulatorCallCount === canonicalRequest.pieces.length ? null : 'replay-call-count',
      supplied.version === expected.version ? null : 'version',
      supplied.sourceFileId === expected.sourceFileId ? null : 'source-file',
      supplied.targetEdgeMm === expected.targetEdgeMm ? null : 'target-edge',
      supplied.phase1AdapterCallCount === expected.phase1AdapterCallCount
        ? null
        : 'adapter-call-count',
      supplied.deterministicFingerprint === recomputedSuppliedFingerprint
        ? null
        : 'supplied-fingerprint',
      supplied.deterministicFingerprint === expected.deterministicFingerprint
        ? null
        : 'replay-fingerprint',
      suppliedPayload === expectedPayload ? null : 'canonical-payload',
      JSON.stringify(supplied.claims) === JSON.stringify(expected.claims) ? null : 'claims',
      JSON.stringify(supplied.blockers) === JSON.stringify(expected.blockers) ? null : 'blockers',
    ].filter((mismatch): mismatch is string => mismatch !== null);
    if (suppliedPayload !== expectedPayload) {
      const difference = firstJsonDifference(
        JSON.parse(suppliedPayload) as unknown,
        JSON.parse(expectedPayload) as unknown,
      );
      if (difference) mismatches.push(difference);
    }
    supplied.pieces.forEach((piece, index) => {
      const recomputed = triangulationResultFingerprint(resultCandidate(piece.result));
      if (piece.result.deterministicHash !== recomputed)
        mismatches.push(`supplied-piece-${index}-result-hash:${recomputed}`);
    });
    expected.pieces.forEach((piece, index) => {
      const recomputed = triangulationResultFingerprint(resultCandidate(piece.result));
      if (piece.result.deterministicHash !== recomputed)
        mismatches.push(`replay-piece-${index}-result-hash:${recomputed}`);
    });
    supplied.pieces.forEach((piece, index) => {
      const expectedPiece = expected.pieces[index];
      if (!expectedPiece) return;
      const suppliedCanonical = triangulationCanonicalPayloadForEvaluation(piece.result);
      const expectedCanonical = triangulationCanonicalPayloadForEvaluation(expectedPiece.result);
      if (suppliedCanonical === expectedCanonical) return;
      const difference = firstJsonDifference(
        JSON.parse(suppliedCanonical) as unknown,
        JSON.parse(expectedCanonical) as unknown,
        `piece-${index}-triangulation`,
      );
      mismatches.push(difference ?? `piece-${index}-triangulation-payload`);
    });
    if (mismatches.length > 0)
      failure(
        'artifact-request-mismatch',
        'Phase-2 artifact differs from its canonical request-local replay.',
        mismatches,
      );
    return freezeOwnedPlainData({
      version: PHASE2_BOUNDARY_SAMPLING_EVALUATION_V1,
      status: 'accepted',
      canonicalRequest,
      canonicalArtifact: expected,
      replayTriangulatorCallCount,
      deterministicFingerprint: expected.deterministicFingerprint,
      claims: {
        requestLocalConsistencyAccepted: true,
        sourceAuthenticityAccepted: false,
        cdt2dReexecuted: false,
      },
      blockers: ['phase-d-content-binding-not-integrated'],
    });
  } catch (error) {
    if (error instanceof Phase2BoundarySamplingErrorV1) throw error;
    failure('artifact-snapshot-invalid', 'Phase-2 artifact evaluation failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  } finally {
    evaluationActive = false;
  }
}

let realmActive = false;

export function createPhase2BoundarySamplerV1(
  triangulator: ConstrainedTriangulator = createCdt2dConstrainedTriangulatorV1(),
): Phase2BoundarySamplerV1 {
  if (
    !triangulator ||
    typeof triangulator.id !== 'string' ||
    typeof triangulator.version !== 'string' ||
    typeof triangulator.triangulate !== 'function'
  )
    throw new TypeError('Phase-2 boundary sampler requires a ConstrainedTriangulator.');
  return Object.freeze({
    version: PHASE2_BOUNDARY_SAMPLING_V1,
    sample(request: Phase2BoundarySamplingRequestV1): Phase2BoundarySamplingArtifactV1 {
      if (realmActive)
        failure(
          'reentrant-call',
          'Phase-2 boundary sampling rejects overlapping or reentrant calls.',
        );
      realmActive = true;
      try {
        return executeSample(snapshotRequest(request), triangulator);
      } catch (error) {
        if (error instanceof Phase2BoundarySamplingErrorV1) throw error;
        failure('input-snapshot-invalid', 'Phase-2 boundary sampling failed closed.', [
          error instanceof Error ? error.message : String(error),
        ]);
      } finally {
        realmActive = false;
      }
    },
  });
}

export function samplePhase2BoundariesV1(
  request: Phase2BoundarySamplingRequestV1,
): Phase2BoundarySamplingArtifactV1 {
  return createPhase2BoundarySamplerV1().sample(request);
}
