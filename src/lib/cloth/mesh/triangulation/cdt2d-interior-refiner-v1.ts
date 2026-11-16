import cdt2d, {
  type Cdt2dEdge,
  type Cdt2dImplementation,
  type Cdt2dOptions,
  type Cdt2dPoint,
} from 'cdt2d';
import { auditTriangulationResult, preflightTriangulationInput } from './audit';
import { triangulationResultFingerprint } from './canonical';
import type {
  BoundaryRing,
  ConstrainedTriangulationInput,
  ConstrainedTriangulationResult,
  MeshQualityReport,
  TriangulationAuditCandidate,
  TriangulationVertex,
} from './types';

export const CDT2D_INTERIOR_REFINER_V1 = 'cdt2d-interior-refiner/1' as const;
export const CDT2D_INTERIOR_REFINER_PINNED_VERSION_V1 = '1.0.0' as const;

export const CDT2D_INTERIOR_REFINER_LIMITS_V1 = Object.freeze({
  maximumDepth: 20,
  maximumNodes: 100_000,
  maximumProperties: 400_000,
  maximumArrayLength: 50_000,
  maximumBoundaryVertices: 2_048,
  maximumInteriorVertices: 8_192,
  maximumVertices: 10_000,
  maximumConstraintEdges: 2_048,
  maximumOutputTriangles: 20_000,
  maximumPreflightGeometryOperations: 8_000_000,
  maximumAuditGeometryOperations: 20_000_000,
  maximumErrorDetails: 32,
  maximumStringLength: 1_024,
} as const);

export type Cdt2dInteriorPointV1 = Readonly<{
  id: string;
  positionMm: readonly [number, number];
}>;

export type Cdt2dInteriorRefinementRequestV1 = Readonly<{
  version: typeof CDT2D_INTERIOR_REFINER_V1;
  boundaryInput: ConstrainedTriangulationInput;
  interiorPoints: readonly Cdt2dInteriorPointV1[];
}>;

export type Cdt2dInteriorRefinerErrorCodeV1 =
  | 'reentrant-call'
  | 'input-invalid'
  | 'resource-budget-exceeded'
  | 'triangulator-threw'
  | 'triangulator-mutated-input'
  | 'raw-output-malformed'
  | 'raw-output-index-out-of-range'
  | 'raw-output-degenerate'
  | 'raw-output-inverted'
  | 'raw-output-duplicate'
  | 'orphan-vertex'
  | 'post-audit-failed';

export class Cdt2dInteriorRefinerErrorV1 extends Error {
  readonly code: Cdt2dInteriorRefinerErrorCodeV1;
  readonly details: readonly string[];

  constructor(
    code: Cdt2dInteriorRefinerErrorCodeV1,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'Cdt2dInteriorRefinerErrorV1';
    this.code = code;
    this.details = Object.freeze(
      details
        .slice(0, CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumErrorDetails)
        .map((detail) => detail.slice(0, CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumStringLength)),
    );
  }
}

function fail(
  code: Cdt2dInteriorRefinerErrorCodeV1,
  message: string,
  details: readonly string[] = [],
): never {
  throw new Cdt2dInteriorRefinerErrorV1(code, message, details);
}

const CDT_OPTIONS: Cdt2dOptions = Object.freeze({
  delaunay: true,
  interior: true,
  exterior: false,
  infinity: false,
});

type FlattenedInput = Readonly<{
  rings: readonly BoundaryRing[];
  ringOffsets: readonly number[];
  points: Cdt2dPoint[];
  edges: Cdt2dEdge[];
  vertices: readonly TriangulationVertex[];
}>;

const capturedStructuredClone =
  typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone.bind(globalThis)
    : null;

type SnapshotState = { nodes: number; properties: number; active: Set<object> };

function snapshotData(value: unknown, path: string, depth: number, state: SnapshotState): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail('input-invalid', `${path} must be finite and must not be negative zero.`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumStringLength)
      fail('resource-budget-exceeded', `${path} exceeds the string bound.`);
    return value;
  }
  if (typeof value !== 'object') fail('input-invalid', `${path} is not plain data.`);
  if (depth > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumDepth)
    fail('resource-budget-exceeded', `${path} exceeds the depth bound.`);
  if (state.active.has(value)) fail('input-invalid', `${path} contains a cycle.`);
  if (ArrayBuffer.isView(value)) fail('input-invalid', `${path} must not contain typed arrays.`);
  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype))
    fail('input-invalid', `${path} must contain only plain objects and arrays.`);
  state.active.add(value);
  state.nodes += 1;
  if (state.nodes > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumNodes)
    fail('resource-budget-exceeded', `${path} exceeds the node bound.`);
  try {
    if (isArray) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      const length =
        lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumArrayLength
      )
        fail('resource-budget-exceeded', `${path} has an invalid or excessive array length.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === 'symbol'))
      fail('input-invalid', `${path} contains a symbol property.`);
    if (isArray) {
      const length = (descriptors.length as PropertyDescriptor | undefined)?.value as
        | number
        | undefined;
      if (!Number.isSafeInteger(length) || length === undefined || keys.length !== length + 1)
        fail('input-invalid', `${path} must be a dense array without extra properties.`);
      state.properties += length;
      if (state.properties > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumProperties)
        fail('resource-budget-exceeded', `${path} exceeds the property bound.`);
      const output: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          fail('input-invalid', `${path}[${index}] must be enumerable own data.`);
        output.push(snapshotData(descriptor.value, `${path}[${index}]`, depth + 1, state));
      }
      return output;
    }
    const stringKeys = keys.filter((key): key is string => typeof key === 'string');
    state.properties += stringKeys.length;
    if (state.properties > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumProperties)
      fail('resource-budget-exceeded', `${path} exceeds the property bound.`);
    const output: Record<string, unknown> = {};
    for (const key of stringKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('input-invalid', `${path}.${key} must be enumerable own data.`);
      output[key] = snapshotData(descriptor.value, `${path}.${key}`, depth + 1, state);
    }
    return output;
  } finally {
    state.active.delete(value);
  }
}

function ownedRequest(request: Cdt2dInteriorRefinementRequestV1): Cdt2dInteriorRefinementRequestV1 {
  const snapshot = snapshotData(request, 'request', 0, {
    nodes: 0,
    properties: 0,
    active: new Set(),
  }) as Cdt2dInteriorRefinementRequestV1;
  if (!capturedStructuredClone)
    fail('input-invalid', 'Native structuredClone is required for Proxy rejection.');
  try {
    capturedStructuredClone(request);
  } catch (error) {
    fail('input-invalid', 'Interior refiner request contains Proxy or unclonable data.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  const keys = Object.keys(snapshot).sort();
  if (keys.join('|') !== 'boundaryInput|interiorPoints|version')
    fail('input-invalid', 'Interior refiner request has an unsupported property shape.');
  const exactKeys = (value: unknown, expected: readonly string[], path: string): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      fail('input-invalid', `${path} must be an object.`);
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index]))
      fail('input-invalid', `${path} has an unsupported property shape.`);
  };
  exactKeys(
    snapshot.boundaryInput,
    ['grainDegrees', 'holes', 'options', 'pieceId', 'seamEndpoints', 'shell'],
    'request.boundaryInput',
  );
  exactKeys(
    snapshot.boundaryInput.options,
    [
      'collinearSinTolerance',
      'maxBoundaryErrorMm',
      'maxEdgeRatio',
      'maxRadiusEdgeRatio',
      'minInputEdgeMm',
      'minTriangleAngleDegrees',
      'targetEdgeMm',
    ],
    'request.boundaryInput.options',
  );
  for (const [ringIndex, ring] of [
    snapshot.boundaryInput.shell,
    ...snapshot.boundaryInput.holes,
  ].entries()) {
    exactKeys(ring, ['id', 'role', 'vertices'], `request.boundaryInput.rings[${ringIndex}]`);
    ring.vertices.forEach((vertex, vertexIndex) => {
      exactKeys(
        vertex,
        ['id', 'positionMm', 'source'],
        `request.boundaryInput.rings[${ringIndex}].vertices[${vertexIndex}]`,
      );
      exactKeys(
        vertex.source,
        [
          'contourId',
          'normalizedArc',
          'sourceCurveId',
          'sourceCurveParameterSpace',
          'sourceCurveT',
        ],
        `request.boundaryInput.rings[${ringIndex}].vertices[${vertexIndex}].source`,
      );
    });
  }
  snapshot.boundaryInput.seamEndpoints.forEach((endpoint, index) =>
    exactKeys(
      endpoint,
      ['boundaryVertexId', 'id'],
      `request.boundaryInput.seamEndpoints[${index}]`,
    ),
  );
  snapshot.interiorPoints.forEach((point, index) =>
    exactKeys(point, ['id', 'positionMm'], `request.interiorPoints[${index}]`),
  );
  return snapshot;
}

function flatten(request: Cdt2dInteriorRefinementRequestV1): FlattenedInput {
  if (request.version !== CDT2D_INTERIOR_REFINER_V1)
    fail('input-invalid', 'Interior refinement request version is unsupported.');
  const input = request.boundaryInput;
  if (!input || typeof input !== 'object' || !Array.isArray(input.holes))
    fail('input-invalid', 'Interior refinement boundary input is malformed.');
  if (!Array.isArray(request.interiorPoints))
    fail('input-invalid', 'Interior refinement points must be an array.');
  const rings = [input.shell, ...input.holes];
  if (rings.some((ring) => !ring || typeof ring !== 'object' || !Array.isArray(ring.vertices)))
    fail('input-invalid', 'Interior refinement contains a malformed boundary ring.');
  const boundaryVertexCount = rings.reduce((sum, ring) => sum + ring.vertices.length, 0);
  const totalVertexCount = boundaryVertexCount + request.interiorPoints.length;
  if (
    boundaryVertexCount > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumBoundaryVertices ||
    request.interiorPoints.length > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumInteriorVertices ||
    totalVertexCount > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumVertices
  )
    fail('resource-budget-exceeded', 'Interior refinement vertex count exceeds the bound.');
  const preflightGeometryOperations = boundaryVertexCount * boundaryVertexCount * 4;
  if (
    !Number.isSafeInteger(preflightGeometryOperations) ||
    preflightGeometryOperations >
      CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumPreflightGeometryOperations
  )
    fail('resource-budget-exceeded', 'Boundary preflight geometry work exceeds its bound.');
  const preflight = preflightTriangulationInput(input);
  if (preflight.length > 0)
    fail(
      'input-invalid',
      'Interior refinement boundary input failed preflight.',
      preflight.map(
        (issue) => `${issue.code}${issue.sourceId ? ` (${issue.sourceId})` : ''}: ${issue.message}`,
      ),
    );
  const points: Cdt2dPoint[] = [];
  const edges: Cdt2dEdge[] = [];
  const vertices: TriangulationVertex[] = [];
  const ringOffsets: number[] = [];
  const ids = new Set<string>();
  const coordinates = new Set<string>();
  for (const ring of rings) {
    const offset = points.length;
    ringOffsets.push(offset);
    for (const vertex of ring.vertices) {
      if (ids.has(vertex.id)) fail('input-invalid', `${vertex.id} is duplicated.`);
      ids.add(vertex.id);
      const point = [vertex.positionMm[0], vertex.positionMm[1]] as Cdt2dPoint;
      if (
        !Number.isFinite(point[0]) ||
        !Number.isFinite(point[1]) ||
        Object.is(point[0], -0) ||
        Object.is(point[1], -0) ||
        Math.fround(point[0]) !== point[0] ||
        Math.fround(point[1]) !== point[1]
      )
        fail('input-invalid', `${vertex.id} is not finite canonical f32 geometry.`);
      const coordinate = `${point[0]},${point[1]}`;
      if (coordinates.has(coordinate))
        fail('input-invalid', `${vertex.id} duplicates a coordinate.`);
      coordinates.add(coordinate);
      points.push(point);
      vertices.push({
        positionMm: [point[0], point[1]],
        source: {
          kind: 'boundary',
          boundaryVertexId: vertex.id,
          provenance: { ...vertex.source },
        },
      });
    }
    for (let index = 0; index < ring.vertices.length; index += 1)
      edges.push([offset + index, offset + ((index + 1) % ring.vertices.length)]);
  }
  if (edges.length > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumConstraintEdges)
    fail('resource-budget-exceeded', 'Interior refinement constraint count exceeds the bound.');
  for (const interior of request.interiorPoints) {
    if (ids.has(interior.id) || interior.id.length === 0)
      fail('input-invalid', `${interior.id} is a duplicate or empty interior identity.`);
    ids.add(interior.id);
    const point = [interior.positionMm[0], interior.positionMm[1]] as Cdt2dPoint;
    if (
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1]) ||
      Object.is(point[0], -0) ||
      Object.is(point[1], -0) ||
      Math.fround(point[0]) !== point[0] ||
      Math.fround(point[1]) !== point[1]
    )
      fail('input-invalid', `${interior.id} is not finite canonical f32 geometry.`);
    const coordinate = `${point[0]},${point[1]}`;
    if (coordinates.has(coordinate))
      fail('input-invalid', `${interior.id} duplicates a coordinate.`);
    coordinates.add(coordinate);
    points.push(point);
    vertices.push({
      positionMm: [point[0], point[1]],
      source: { kind: 'interior', generator: 'steiner', sourceId: interior.id },
    });
  }
  return { rings, ringOffsets, points, edges, vertices };
}

function canonicalInput(points: Cdt2dPoint[], edges: Cdt2dEdge[]): string {
  return JSON.stringify({ points, edges });
}

function snapshotRawOutput(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(raw, 'length');
    const length = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : -1;
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumOutputTriangles
    )
      fail('resource-budget-exceeded', 'cdt2d triangle count exceeds the bound.');
  }
  let snapshot: unknown;
  try {
    snapshot = snapshotData(raw, 'cdt2d-output', 0, {
      nodes: 0,
      properties: 0,
      active: new Set(),
    });
  } catch (error) {
    if (error instanceof Cdt2dInteriorRefinerErrorV1 && error.code === 'resource-budget-exceeded')
      throw error;
    fail('raw-output-malformed', 'cdt2d output is not bounded plain data.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  if (!capturedStructuredClone)
    fail('raw-output-malformed', 'Native structuredClone is required for output Proxy rejection.');
  try {
    capturedStructuredClone(raw);
  } catch (error) {
    fail('raw-output-malformed', 'cdt2d output contains Proxy or unclonable data.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  return snapshot;
}

function cross(points: readonly Cdt2dPoint[], triangle: readonly [number, number, number]): number {
  const a = points[triangle[0]];
  const b = points[triangle[1]];
  const c = points[triangle[2]];
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function canonicalTriangle(
  triangle: readonly [number, number, number],
): readonly [number, number, number] {
  const minimum = Math.min(triangle[0], triangle[1], triangle[2]);
  const offset = triangle.indexOf(minimum);
  return [triangle[offset], triangle[(offset + 1) % 3], triangle[(offset + 2) % 3]];
}

function validateRawTriangles(
  raw: unknown,
  points: readonly Cdt2dPoint[],
): readonly (readonly [number, number, number])[] {
  if (!Array.isArray(raw) || Object.getPrototypeOf(raw) !== Array.prototype)
    fail('raw-output-malformed', 'cdt2d output must be a plain array.');
  if (raw.length > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumOutputTriangles)
    fail('resource-budget-exceeded', 'cdt2d triangle count exceeds the bound.');
  const canonical: Array<readonly [number, number, number]> = [];
  const topology = new Set<string>();
  raw.forEach((candidate, triangleIndex) => {
    if (
      !Array.isArray(candidate) ||
      Object.getPrototypeOf(candidate) !== Array.prototype ||
      candidate.length !== 3 ||
      candidate.some((index) => !Number.isSafeInteger(index) || index < 0)
    )
      fail('raw-output-malformed', `cdt2d triangle ${triangleIndex} is not an integer triple.`);
    const triangle = candidate as [number, number, number];
    if (triangle.some((index) => index >= points.length))
      fail('raw-output-index-out-of-range', `cdt2d triangle ${triangleIndex} is out of range.`);
    if (new Set(triangle).size !== 3)
      fail('raw-output-degenerate', `cdt2d triangle ${triangleIndex} repeats a vertex.`);
    const signedTwiceArea = cross(points, triangle);
    if (!Number.isFinite(signedTwiceArea) || Math.abs(signedTwiceArea) <= 1e-9)
      fail('raw-output-degenerate', `cdt2d triangle ${triangleIndex} collapses.`);
    if (signedTwiceArea < 0)
      fail('raw-output-inverted', `cdt2d triangle ${triangleIndex} is not CCW.`);
    const key = [...triangle].sort((left, right) => left - right).join(':');
    if (topology.has(key)) fail('raw-output-duplicate', `cdt2d triangle ${triangleIndex} repeats.`);
    topology.add(key);
    canonical.push(canonicalTriangle(triangle));
  });
  canonical.sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]);
  const referenced = new Set(canonical.flatMap((triangle) => triangle));
  if (referenced.size !== points.length)
    fail('orphan-vertex', 'cdt2d omitted one or more boundary/interior vertices.');
  return canonical;
}

function materialFrames(grainDegrees: number, triangleCount: number): Float32Array {
  const radians = (grainDegrees * Math.PI) / 180;
  const warpX = Math.cos(radians);
  const warpY = Math.sin(radians);
  const values = new Float32Array(triangleCount * 4);
  for (let index = 0; index < triangleCount; index += 1)
    values.set([warpX, warpY, -warpY, warpX], index * 4);
  return values;
}

function buildCandidate(
  input: ConstrainedTriangulationInput,
  flattened: FlattenedInput,
  triangles: readonly (readonly [number, number, number])[],
): TriangulationAuditCandidate {
  const boundaryIndexById = new Map<string, number>();
  flattened.vertices.forEach((vertex, index) => {
    if (vertex.source.kind === 'boundary')
      boundaryIndexById.set(vertex.source.boundaryVertexId, index);
  });
  return {
    vertices: flattened.vertices,
    triangles: Uint32Array.from(triangles.flatMap((triangle) => triangle)),
    boundaryLoops: flattened.rings.map((ring, ringIndex) => ({
      inputRingId: ring.id,
      role: ring.role,
      vertexIndices: Uint32Array.from(
        ring.vertices.map((_, index) => flattened.ringOffsets[ringIndex] + index),
      ),
    })),
    seamEndpoints: input.seamEndpoints.map((endpoint) => ({
      seamEndpointId: endpoint.id,
      vertexIndex: boundaryIndexById.get(endpoint.boundaryVertexId)!,
    })),
    triangleMaterialFrames2: materialFrames(input.grainDegrees, triangles.length),
  };
}

function assertAuditPass(quality: MeshQualityReport): void {
  if (quality.verdict === 'pass') return;
  fail(
    'post-audit-failed',
    'Interior-refined cdt2d result failed the full triangulation audit.',
    quality.issues.map(
      (issue) => `${issue.code}${issue.sourceId ? ` (${issue.sourceId})` : ''}: ${issue.message}`,
    ),
  );
}

export type Cdt2dInteriorRefinerOptionsV1 = Readonly<{
  implementation?: Cdt2dImplementation;
}>;

export function createCdt2dInteriorRefinerV1(
  options: Cdt2dInteriorRefinerOptionsV1 = {},
): Readonly<{
  version: typeof CDT2D_INTERIOR_REFINER_V1;
  refine(request: Cdt2dInteriorRefinementRequestV1): ConstrainedTriangulationResult;
}> {
  const implementation = options.implementation ?? cdt2d;
  if (typeof implementation !== 'function') throw new TypeError('cdt2d must be callable.');
  let active = false;
  let reentryObserved = false;
  return Object.freeze({
    version: CDT2D_INTERIOR_REFINER_V1,
    refine(request: Cdt2dInteriorRefinementRequestV1): ConstrainedTriangulationResult {
      if (active) {
        reentryObserved = true;
        fail('reentrant-call', 'This cdt2d interior refiner is already active.');
      }
      active = true;
      reentryObserved = false;
      try {
        const owned = ownedRequest(request);
        if (reentryObserved)
          fail('reentrant-call', 'Interior refiner input triggered reentrant reflection.');
        const flattened = flatten(owned);
        const before = canonicalInput(flattened.points, flattened.edges);
        let raw: unknown;
        try {
          raw = implementation(flattened.points, flattened.edges, CDT_OPTIONS);
        } catch (error) {
          if (reentryObserved)
            fail('reentrant-call', 'Pinned cdt2d implementation attempted a reentrant call.');
          fail('triangulator-threw', 'Pinned cdt2d interior invocation threw.', [
            error instanceof Error ? error.message : String(error),
          ]);
        }
        if (reentryObserved)
          fail('reentrant-call', 'Pinned cdt2d implementation attempted a reentrant call.');
        if (canonicalInput(flattened.points, flattened.edges) !== before)
          fail('triangulator-mutated-input', 'cdt2d mutated owned geometry or constraints.');
        const triangles = validateRawTriangles(snapshotRawOutput(raw), flattened.points);
        if (reentryObserved)
          fail('reentrant-call', 'cdt2d output reflection attempted a reentrant call.');
        const boundaryVertexCount = flattened.rings.reduce(
          (sum, ring) => sum + ring.vertices.length,
          0,
        );
        const auditGeometryOperations =
          boundaryVertexCount * boundaryVertexCount * 4 +
          triangles.length * boundaryVertexCount * 12;
        if (
          !Number.isSafeInteger(auditGeometryOperations) ||
          auditGeometryOperations > CDT2D_INTERIOR_REFINER_LIMITS_V1.maximumAuditGeometryOperations
        )
          fail('resource-budget-exceeded', 'Triangulation audit geometry work exceeds its bound.');
        const candidate = buildCandidate(owned.boundaryInput, flattened, triangles);
        const quality = auditTriangulationResult(owned.boundaryInput, candidate);
        assertAuditPass(quality);
        return {
          ...candidate,
          deterministicHash: triangulationResultFingerprint(candidate),
          quality,
        };
      } catch (error) {
        if (error instanceof Cdt2dInteriorRefinerErrorV1) throw error;
        fail('input-invalid', 'Interior refiner failed closed.', [
          error instanceof Error ? error.message : String(error),
        ]);
      } finally {
        active = false;
        reentryObserved = false;
      }
    },
  });
}
