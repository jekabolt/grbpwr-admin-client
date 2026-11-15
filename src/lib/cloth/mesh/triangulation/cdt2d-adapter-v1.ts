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
  ConstrainedTriangulator,
  MeshQualityReport,
  TriangulationAuditCandidate,
  TriangulationVertex,
} from './types';

export const CDT2D_PHASE1_ADAPTER_V1 = 'cdt2d-boundary-only-adapter/1' as const;
export const CDT2D_PINNED_VERSION_V1 = '1.0.0' as const;

export const CDT2D_PHASE1_CONTRACT_V1 = Object.freeze({
  boundaryOnly: true as const,
  exactInputBoundaryVertices: true as const,
  exactConstraintEdges: true as const,
  exterior: false as const,
  targetEdgeMmConsumed: false as const,
  refinementIntegrated: false as const,
  steinerPointsAllowed: false as const,
  silentCleaningAllowed: false as const,
  fallbackAllowed: false as const,
  bodyPlacementReady: false as const,
  runtimeIntegrated: false as const,
  settleAccepted: false as const,
  productionReady: false as const,
  blockers: Object.freeze([
    'target-edge-refinement-not-integrated',
    'body-placement-not-proven',
    'runtime-owner-not-integrated',
    'settle-not-evaluated',
    'production-qualification-not-run',
  ] as const),
});

export const CDT2D_PHASE1_LIMITS_V1 = Object.freeze({
  maximumDepth: 20,
  maximumNodes: 20_000,
  maximumProperties: 80_000,
  maximumArrayLength: 16_384,
  maximumStringLength: 512,
  maximumRings: 32,
  maximumBoundaryVertices: 4_096,
  maximumConstraintEdges: 4_096,
  maximumSeamEndpoints: 512,
  maximumOutputTriangles: 8_192,
  maximumErrorDetails: 32,
} as const);

const CDT2D_OPTIONS: Cdt2dOptions = Object.freeze({
  delaunay: true,
  interior: true,
  exterior: false,
  infinity: false,
});

const AREA_EPSILON = 1e-9;

export type Cdt2dPhase1ErrorCodeV1 =
  | 'reentrant-call'
  | 'input-snapshot-invalid'
  | 'resource-budget-exceeded'
  | 'preflight-failed'
  | 'triangulator-threw'
  | 'triangulator-mutated-input'
  | 'raw-output-malformed'
  | 'raw-output-index-out-of-range'
  | 'raw-output-degenerate'
  | 'raw-output-inverted'
  | 'raw-output-duplicate'
  | 'post-audit-failed';

export class Cdt2dPhase1ErrorV1 extends Error {
  readonly code: Cdt2dPhase1ErrorCodeV1;
  readonly details: readonly string[];

  constructor(code: Cdt2dPhase1ErrorCodeV1, message: string, details: readonly string[] = []) {
    super(message);
    this.name = 'Cdt2dPhase1ErrorV1';
    this.code = code;
    this.details = Object.freeze(
      details
        .slice(0, CDT2D_PHASE1_LIMITS_V1.maximumErrorDetails)
        .map((detail) => detail.slice(0, CDT2D_PHASE1_LIMITS_V1.maximumStringLength)),
    );
  }
}

export type Cdt2dPhase1AdapterOptionsV1 = Readonly<{
  /** Test seam for faults/spies. Production callers omit it and use pinned cdt2d@1.0.0. */
  implementation?: Cdt2dImplementation;
}>;

type SnapshotState = {
  nodes: number;
  properties: number;
  seen: Set<object>;
};

function snapshotPlainOwnData(
  value: unknown,
  path: string,
  depth: number,
  state: SnapshotState,
): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    if (value.length > CDT2D_PHASE1_LIMITS_V1.maximumStringLength)
      throw new Cdt2dPhase1ErrorV1('resource-budget-exceeded', `${path} exceeds the string bound.`);
    return value;
  }
  if (typeof value !== 'object')
    throw new Cdt2dPhase1ErrorV1(
      'input-snapshot-invalid',
      `${path} is not plain serializable data.`,
    );
  if (depth > CDT2D_PHASE1_LIMITS_V1.maximumDepth)
    throw new Cdt2dPhase1ErrorV1('resource-budget-exceeded', `${path} exceeds the depth bound.`);
  if (state.seen.has(value))
    throw new Cdt2dPhase1ErrorV1(
      'input-snapshot-invalid',
      `${path} contains shared or cyclic objects.`,
    );
  state.seen.add(value);
  state.nodes += 1;
  if (state.nodes > CDT2D_PHASE1_LIMITS_V1.maximumNodes)
    throw new Cdt2dPhase1ErrorV1('resource-budget-exceeded', `${path} exceeds the node bound.`);
  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype))
    throw new Cdt2dPhase1ErrorV1(
      'input-snapshot-invalid',
      `${path} must use a plain object or array prototype.`,
    );
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key === 'symbol'))
    throw new Cdt2dPhase1ErrorV1('input-snapshot-invalid', `${path} contains symbol properties.`);
  const dataKeys = (keys as string[]).filter((key) => !(isArray && key === 'length'));
  state.properties += dataKeys.length;
  if (state.properties > CDT2D_PHASE1_LIMITS_V1.maximumProperties)
    throw new Cdt2dPhase1ErrorV1('resource-budget-exceeded', `${path} exceeds the property bound.`);
  if (isArray) {
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !('value' in lengthDescriptor))
      throw new Cdt2dPhase1ErrorV1(
        'input-snapshot-invalid',
        `${path} has no plain length descriptor.`,
      );
    const length = lengthDescriptor.value as number;
    if (length > CDT2D_PHASE1_LIMITS_V1.maximumArrayLength)
      throw new Cdt2dPhase1ErrorV1('resource-budget-exceeded', `${path} exceeds the array bound.`);
    if (dataKeys.length !== length || dataKeys.some((key, index) => key !== String(index)))
      throw new Cdt2dPhase1ErrorV1(
        'input-snapshot-invalid',
        `${path} must be a dense array without extra properties.`,
      );
    return dataKeys.map((key) => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        throw new Cdt2dPhase1ErrorV1(
          'input-snapshot-invalid',
          `${path}[${key}] must be an enumerable data property.`,
        );
      return snapshotPlainOwnData(descriptor.value, `${path}[${key}]`, depth + 1, state);
    });
  }
  const output: Record<string, unknown> = {};
  for (const key of dataKeys.sort()) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new Cdt2dPhase1ErrorV1(
        'input-snapshot-invalid',
        `${path}.${key} must be an enumerable data property.`,
      );
    output[key] = snapshotPlainOwnData(descriptor.value, `${path}.${key}`, depth + 1, state);
  }
  return output;
}

function snapshotInput(input: ConstrainedTriangulationInput): ConstrainedTriangulationInput {
  try {
    return snapshotPlainOwnData(input, 'input', 0, {
      nodes: 0,
      properties: 0,
      seen: new Set<object>(),
    }) as ConstrainedTriangulationInput;
  } catch (error) {
    if (error instanceof Cdt2dPhase1ErrorV1) throw error;
    throw new Cdt2dPhase1ErrorV1('input-snapshot-invalid', 'Input snapshot failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

function enforceInputBudget(input: ConstrainedTriangulationInput): void {
  const rings = [input.shell, ...input.holes];
  const boundaryVertices = rings.reduce((sum, ring) => sum + ring.vertices.length, 0);
  if (rings.length > CDT2D_PHASE1_LIMITS_V1.maximumRings)
    throw new Cdt2dPhase1ErrorV1(
      'resource-budget-exceeded',
      'Ring count exceeds the Phase-1 adapter bound.',
    );
  if (boundaryVertices > CDT2D_PHASE1_LIMITS_V1.maximumBoundaryVertices)
    throw new Cdt2dPhase1ErrorV1(
      'resource-budget-exceeded',
      'Boundary vertex count exceeds the Phase-1 adapter bound.',
    );
  if (boundaryVertices > CDT2D_PHASE1_LIMITS_V1.maximumConstraintEdges)
    throw new Cdt2dPhase1ErrorV1(
      'resource-budget-exceeded',
      'Constraint edge count exceeds the Phase-1 adapter bound.',
    );
  if (input.seamEndpoints.length > CDT2D_PHASE1_LIMITS_V1.maximumSeamEndpoints)
    throw new Cdt2dPhase1ErrorV1(
      'resource-budget-exceeded',
      'Seam endpoint count exceeds the Phase-1 adapter bound.',
    );
}

type FlattenedBoundary = Readonly<{
  rings: readonly BoundaryRing[];
  points: Cdt2dPoint[];
  edges: Cdt2dEdge[];
  ringOffsets: readonly number[];
}>;

function flattenBoundary(input: ConstrainedTriangulationInput): FlattenedBoundary {
  const rings = [input.shell, ...input.holes];
  const points: Cdt2dPoint[] = [];
  const edges: Cdt2dEdge[] = [];
  const ringOffsets: number[] = [];
  for (const ring of rings) {
    const offset = points.length;
    ringOffsets.push(offset);
    for (const vertex of ring.vertices) points.push([vertex.positionMm[0], vertex.positionMm[1]]);
    for (let index = 0; index < ring.vertices.length; index += 1)
      edges.push([offset + index, offset + ((index + 1) % ring.vertices.length)]);
  }
  return { rings, points, edges, ringOffsets };
}

function canonicalInputPayload(points: Cdt2dPoint[], edges: Cdt2dEdge[]): string {
  return JSON.stringify({ points, edges });
}

function cross(points: Cdt2dPoint[], triangle: readonly [number, number, number]): number {
  const a = points[triangle[0]];
  const b = points[triangle[1]];
  const c = points[triangle[2]];
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function canonicalTriangle(
  triangle: readonly [number, number, number],
): readonly [number, number, number] {
  const minimum = Math.min(...triangle);
  const offset = triangle.indexOf(minimum);
  return [triangle[offset], triangle[(offset + 1) % 3], triangle[(offset + 2) % 3]];
}

function snapshotRawOutput(raw: unknown): unknown {
  try {
    return snapshotPlainOwnData(raw, 'cdt2dResult', 0, {
      nodes: 0,
      properties: 0,
      seen: new Set<object>(),
    });
  } catch (error) {
    if (error instanceof Cdt2dPhase1ErrorV1) {
      throw new Cdt2dPhase1ErrorV1(
        error.code === 'resource-budget-exceeded'
          ? 'resource-budget-exceeded'
          : 'raw-output-malformed',
        'cdt2d returned an unsafe or malformed result.',
        [error.message],
      );
    }
    throw new Cdt2dPhase1ErrorV1('raw-output-malformed', 'cdt2d result snapshot failed.');
  }
}

function validateAndCanonicalizeRawTriangles(
  raw: unknown,
  points: Cdt2dPoint[],
): readonly (readonly [number, number, number])[] {
  const snapshot = snapshotRawOutput(raw);
  if (!Array.isArray(snapshot))
    throw new Cdt2dPhase1ErrorV1(
      'raw-output-malformed',
      'cdt2d result must be an array of triples.',
    );
  if (snapshot.length > CDT2D_PHASE1_LIMITS_V1.maximumOutputTriangles)
    throw new Cdt2dPhase1ErrorV1(
      'resource-budget-exceeded',
      'cdt2d triangle count exceeds the Phase-1 output bound.',
    );
  const canonical: Array<readonly [number, number, number]> = [];
  const topology = new Set<string>();
  snapshot.forEach((candidate, triangleIndex) => {
    if (
      !Array.isArray(candidate) ||
      candidate.length !== 3 ||
      candidate.some((index) => !Number.isSafeInteger(index) || index < 0)
    )
      throw new Cdt2dPhase1ErrorV1(
        'raw-output-malformed',
        `cdt2d triangle ${triangleIndex} is not a dense non-negative integer triple.`,
      );
    const triangle = candidate as [number, number, number];
    if (triangle.some((index) => index >= points.length))
      throw new Cdt2dPhase1ErrorV1(
        'raw-output-index-out-of-range',
        `cdt2d triangle ${triangleIndex} references a missing boundary vertex.`,
      );
    if (new Set(triangle).size !== 3)
      throw new Cdt2dPhase1ErrorV1(
        'raw-output-degenerate',
        `cdt2d triangle ${triangleIndex} repeats a vertex.`,
      );
    const area = cross(points, triangle);
    if (!Number.isFinite(area) || Math.abs(area) <= AREA_EPSILON)
      throw new Cdt2dPhase1ErrorV1(
        'raw-output-degenerate',
        `cdt2d triangle ${triangleIndex} is degenerate.`,
      );
    if (area < 0)
      throw new Cdt2dPhase1ErrorV1(
        'raw-output-inverted',
        `cdt2d triangle ${triangleIndex} is not CCW.`,
      );
    const topologyKey = [...triangle].sort((left, right) => left - right).join(':');
    if (topology.has(topologyKey))
      throw new Cdt2dPhase1ErrorV1(
        'raw-output-duplicate',
        `cdt2d triangle ${triangleIndex} duplicates a previous face.`,
      );
    topology.add(topologyKey);
    canonical.push(canonicalTriangle(triangle));
  });
  canonical.sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]);
  return canonical;
}

function boundaryVertices(flattened: FlattenedBoundary): readonly TriangulationVertex[] {
  return flattened.rings.flatMap((ring) =>
    ring.vertices.map((vertex) => ({
      positionMm: [vertex.positionMm[0], vertex.positionMm[1]] as const,
      source: {
        kind: 'boundary' as const,
        boundaryVertexId: vertex.id,
        provenance: { ...vertex.source },
      },
    })),
  );
}

function materialFrames(grainDegrees: number, triangleCount: number): Float32Array {
  const radians = (grainDegrees * Math.PI) / 180;
  const warpX = Math.cos(radians);
  const warpY = Math.sin(radians);
  const weftX = -warpY;
  const weftY = warpX;
  const values = new Float32Array(triangleCount * 4);
  for (let index = 0; index < triangleCount; index += 1)
    values.set([warpX, warpY, weftX, weftY], index * 4);
  return values;
}

function buildCandidate(
  input: ConstrainedTriangulationInput,
  flattened: FlattenedBoundary,
  triangles: readonly (readonly [number, number, number])[],
): TriangulationAuditCandidate {
  const vertices = boundaryVertices(flattened);
  const byBoundaryId = new Map(
    vertices.map((vertex, index) => [
      vertex.source.kind === 'boundary' ? vertex.source.boundaryVertexId : '',
      index,
    ]),
  );
  return {
    vertices,
    triangles: Uint32Array.from(triangles.flatMap((triangle) => triangle)),
    boundaryLoops: flattened.rings.map((ring, index) => ({
      inputRingId: ring.id,
      role: ring.role,
      vertexIndices: Uint32Array.from(
        ring.vertices.map((_, vertexIndex) => flattened.ringOffsets[index] + vertexIndex),
      ),
    })),
    seamEndpoints: input.seamEndpoints.map((endpoint) => ({
      seamEndpointId: endpoint.id,
      vertexIndex: byBoundaryId.get(endpoint.boundaryVertexId)!,
    })),
    triangleMaterialFrames2: materialFrames(input.grainDegrees, triangles.length),
  };
}

function assertAuditPass(quality: MeshQualityReport): void {
  if (quality.verdict === 'pass') return;
  throw new Cdt2dPhase1ErrorV1(
    'post-audit-failed',
    'cdt2d Phase-1 result failed the existing triangulation audit.',
    quality.issues.map(
      (issue) => `${issue.code}${issue.sourceId ? ` (${issue.sourceId})` : ''}: ${issue.message}`,
    ),
  );
}

function triangulateOnce(
  inputValue: ConstrainedTriangulationInput,
  implementation: Cdt2dImplementation,
): ConstrainedTriangulationResult {
  const input = snapshotInput(inputValue);
  enforceInputBudget(input);
  const preflight = preflightTriangulationInput(input);
  if (preflight.length > 0)
    throw new Cdt2dPhase1ErrorV1(
      'preflight-failed',
      'Constrained triangulation input failed preflight.',
      preflight.map(
        (issue) => `${issue.code}${issue.sourceId ? ` (${issue.sourceId})` : ''}: ${issue.message}`,
      ),
    );
  const flattened = flattenBoundary(input);
  const before = canonicalInputPayload(flattened.points, flattened.edges);
  let raw: unknown;
  try {
    raw = implementation(flattened.points, flattened.edges, CDT2D_OPTIONS);
  } catch (error) {
    throw new Cdt2dPhase1ErrorV1('triangulator-threw', 'Pinned cdt2d invocation threw.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  if (canonicalInputPayload(flattened.points, flattened.edges) !== before)
    throw new Cdt2dPhase1ErrorV1(
      'triangulator-mutated-input',
      'cdt2d mutated the adapter-owned point or constraint arrays.',
    );
  const triangles = validateAndCanonicalizeRawTriangles(raw, flattened.points);
  const candidate = buildCandidate(input, flattened, triangles);
  const quality = auditTriangulationResult(input, candidate);
  assertAuditPass(quality);
  return {
    ...candidate,
    deterministicHash: triangulationResultFingerprint(candidate),
    quality,
  };
}

export function createCdt2dConstrainedTriangulatorV1(
  options: Cdt2dPhase1AdapterOptionsV1 = {},
): ConstrainedTriangulator {
  const implementation = options.implementation ?? cdt2d;
  if (typeof implementation !== 'function')
    throw new TypeError('cdt2d implementation must be callable.');
  let active = false;
  return Object.freeze({
    id: CDT2D_PHASE1_ADAPTER_V1,
    version: CDT2D_PINNED_VERSION_V1,
    triangulate(input: ConstrainedTriangulationInput) {
      // Claim synchronously before any caller-controlled reflection. A proxy trap or injected
      // implementation can attempt same-adapter recursion; it must never enter a second snapshot
      // or cdt2d invocation while this call owns the adapter.
      if (active)
        throw new Cdt2dPhase1ErrorV1(
          'reentrant-call',
          'This cdt2d Phase-1 adapter instance is already active.',
        );
      active = true;
      try {
        return triangulateOnce(input, implementation);
      } catch (error) {
        if (error instanceof Cdt2dPhase1ErrorV1) throw error;
        throw new Cdt2dPhase1ErrorV1(
          'input-snapshot-invalid',
          'cdt2d Phase-1 adapter failed closed before producing an accepted result.',
          [error instanceof Error ? error.message : String(error)],
        );
      } finally {
        active = false;
      }
    },
  });
}
