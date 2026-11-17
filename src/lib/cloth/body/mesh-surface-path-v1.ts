import {
  meshSurfaceVertexTrianglesV1,
  type MeshSurfaceTopologyV1,
} from './mesh-surface-topology-v1';

export const MESH_SURFACE_PATH_V1 = 'mesh-surface-path/v1' as const;

export type MeshSurfaceVec3V1 = readonly [x: number, y: number, z: number];

export interface MeshSurfaceVertexPointV1 {
  readonly kind: 'vertex';
  readonly vertex: number;
}

/** `a < b` and `0 < t < 1`; vertices have their own representation. */
export interface MeshSurfaceEdgePointV1 {
  readonly kind: 'edge';
  readonly a: number;
  readonly b: number;
  readonly t: number;
}

export type MeshSurfacePointV1 = MeshSurfaceVertexPointV1 | MeshSurfaceEdgePointV1;

export interface MeshSurfacePathV1 {
  readonly version: typeof MESH_SURFACE_PATH_V1;
  readonly source: 'surface-points';
  readonly topologyHash: string;
  readonly closed: boolean;
  readonly points: readonly MeshSurfacePointV1[];
}

export type MeshSurfacePathValidationFailureCodeV1 =
  | 'path-invalid'
  | 'points-do-not-share-face'
  | 'topology-mismatch';

export type MeshSurfacePathValidationResultV1 =
  | Readonly<{
      ok: true;
      sharedTriangleIndices: readonly number[];
    }>
  | Readonly<{
      ok: false;
      code: MeshSurfacePathValidationFailureCodeV1;
      pointIndex: number | null;
    }>;

export interface MeshSurfacePathEvaluationV1 {
  readonly positionsM: Float32Array;
  readonly lengthM: number;
}

function validVertex(vertex: number, topology: MeshSurfaceTopologyV1): boolean {
  return Number.isSafeInteger(vertex) && vertex >= 0 && vertex < topology.vertexCount;
}

function pointTriangles(
  point: MeshSurfacePointV1,
  topology: MeshSurfaceTopologyV1,
): Uint32Array | null {
  if (point.kind === 'vertex') {
    return validVertex(point.vertex, topology)
      ? meshSurfaceVertexTrianglesV1(topology, point.vertex)
      : null;
  }
  if (
    !validVertex(point.a, topology) ||
    !validVertex(point.b, topology) ||
    point.a >= point.b ||
    !Number.isFinite(point.t) ||
    point.t <= 0 ||
    point.t >= 1
  ) {
    return null;
  }
  const left = meshSurfaceVertexTrianglesV1(topology, point.a);
  const right = meshSurfaceVertexTrianglesV1(topology, point.b);
  const shared = [...left].filter((triangle) => right.includes(triangle));
  return shared.length > 0 ? Uint32Array.from(shared) : null;
}

function sharedTriangle(
  left: MeshSurfacePointV1,
  right: MeshSurfacePointV1,
  topology: MeshSurfaceTopologyV1,
): number | null {
  const leftTriangles = pointTriangles(left, topology);
  const rightTriangles = pointTriangles(right, topology);
  if (!leftTriangles || !rightTriangles) return null;
  const rightSet = new Set(rightTriangles);
  for (const triangle of leftTriangles) {
    if (rightSet.has(triangle)) return triangle;
  }
  return null;
}

function evaluatePoint(point: MeshSurfacePointV1, positionsM: Float32Array): MeshSurfaceVec3V1 {
  if (point.kind === 'vertex') {
    const offset = point.vertex * 3;
    return [positionsM[offset], positionsM[offset + 1], positionsM[offset + 2]];
  }
  const offsetA = point.a * 3;
  const offsetB = point.b * 3;
  return [
    positionsM[offsetA] + (positionsM[offsetB] - positionsM[offsetA]) * point.t,
    positionsM[offsetA + 1] + (positionsM[offsetB + 1] - positionsM[offsetA + 1]) * point.t,
    positionsM[offsetA + 2] + (positionsM[offsetB + 2] - positionsM[offsetA + 2]) * point.t,
  ];
}

export function meshSurfaceVertexPointV1(vertex: number): MeshSurfaceVertexPointV1 {
  if (!Number.isSafeInteger(vertex) || vertex < 0) {
    throw new RangeError('A surface vertex point requires a non-negative safe integer.');
  }
  return Object.freeze({ kind: 'vertex' as const, vertex });
}

export function meshSurfaceEdgePointV1(
  rawA: number,
  rawB: number,
  rawT: number,
): MeshSurfacePointV1 {
  if (
    !Number.isSafeInteger(rawA) ||
    !Number.isSafeInteger(rawB) ||
    rawA < 0 ||
    rawB < 0 ||
    !Number.isFinite(rawT) ||
    rawT < 0 ||
    rawT > 1
  ) {
    throw new RangeError('A surface edge point requires valid vertices and t in [0, 1].');
  }
  if (rawA === rawB || rawT === 0) return meshSurfaceVertexPointV1(rawA);
  if (rawT === 1) return meshSurfaceVertexPointV1(rawB);
  const ascending = rawA < rawB;
  return Object.freeze({
    kind: 'edge' as const,
    a: ascending ? rawA : rawB,
    b: ascending ? rawB : rawA,
    t: ascending ? rawT : 1 - rawT,
  });
}

export function createMeshSurfacePathV1(options: {
  readonly topology: MeshSurfaceTopologyV1;
  readonly closed?: boolean;
  readonly points: readonly MeshSurfacePointV1[];
}): MeshSurfacePathV1 {
  const path = Object.freeze({
    version: MESH_SURFACE_PATH_V1,
    source: 'surface-points' as const,
    topologyHash: options.topology.topologyHash,
    closed: options.closed ?? false,
    points: Object.freeze([...options.points]),
  });
  const validation = validateMeshSurfacePathV1(path, options.topology);
  if (!validation.ok) {
    throw new RangeError(`Invalid surface path: ${validation.code}.`);
  }
  return path;
}

export function validateMeshSurfacePathV1(
  path: MeshSurfacePathV1,
  topology: MeshSurfaceTopologyV1,
): MeshSurfacePathValidationResultV1 {
  if (path.version !== MESH_SURFACE_PATH_V1 || path.topologyHash !== topology.topologyHash) {
    return Object.freeze({
      ok: false as const,
      code: 'topology-mismatch' as const,
      pointIndex: null,
    });
  }
  if (path.points.length === 0 || (path.closed && path.points.length < 3)) {
    return Object.freeze({ ok: false as const, code: 'path-invalid' as const, pointIndex: null });
  }
  for (let index = 0; index < path.points.length; index += 1) {
    if (!pointTriangles(path.points[index], topology)) {
      return Object.freeze({
        ok: false as const,
        code: 'path-invalid' as const,
        pointIndex: index,
      });
    }
  }
  const segmentCount = path.points.length - 1 + (path.closed ? 1 : 0);
  const sharedTriangleIndices: number[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const triangle = sharedTriangle(
      path.points[index],
      path.points[(index + 1) % path.points.length],
      topology,
    );
    if (triangle === null) {
      return Object.freeze({
        ok: false as const,
        code: 'points-do-not-share-face' as const,
        pointIndex: index,
      });
    }
    sharedTriangleIndices.push(triangle);
  }
  return Object.freeze({
    ok: true as const,
    sharedTriangleIndices: Object.freeze(sharedTriangleIndices),
  });
}

export function evaluateMeshSurfacePathV1(options: {
  readonly path: MeshSurfacePathV1;
  readonly topology: MeshSurfaceTopologyV1;
  readonly positionsM: Float32Array;
}): MeshSurfacePathEvaluationV1 {
  const validation = validateMeshSurfacePathV1(options.path, options.topology);
  if (!validation.ok) throw new RangeError(`Cannot evaluate surface path: ${validation.code}.`);
  if (options.positionsM.length !== options.topology.vertexCount * 3) {
    throw new RangeError('Cannot evaluate a surface path on a mesh with a different vertex count.');
  }
  const positionsM = new Float32Array(options.path.points.length * 3);
  let lengthM = 0;
  let previous: MeshSurfaceVec3V1 | null = null;
  let first: MeshSurfaceVec3V1 | null = null;
  options.path.points.forEach((point, index) => {
    const position = evaluatePoint(point, options.positionsM);
    positionsM.set(position, index * 3);
    if (!first) first = position;
    if (previous) {
      lengthM += Math.hypot(
        position[0] - previous[0],
        position[1] - previous[1],
        position[2] - previous[2],
      );
    }
    previous = position;
  });
  if (options.path.closed && previous && first) {
    lengthM += Math.hypot(first[0] - previous[0], first[1] - previous[1], first[2] - previous[2]);
  }
  return Object.freeze({ positionsM, lengthM });
}

/**
 * Live-frame evaluation (design §5.3: ≤ 0.2 ms, zero allocations). Writes XYZ for every point into
 * `out` and returns the length. No validation: validate the path once with
 * `validateMeshSurfacePathV1` against the topology, then call this per frame with the current
 * positions (any mesh sharing that index buffer). `out` must hold `points.length * 3` values.
 */
export function evaluateMeshSurfacePathIntoV1(
  path: MeshSurfacePathV1,
  positionsM: Float32Array,
  out: Float32Array,
): number {
  const points = path.points;
  let lengthM = 0;
  let previousX = 0;
  let previousY = 0;
  let previousZ = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    let x: number;
    let y: number;
    let z: number;
    if (point.kind === 'vertex') {
      const offset = point.vertex * 3;
      x = positionsM[offset];
      y = positionsM[offset + 1];
      z = positionsM[offset + 2];
    } else {
      const offsetA = point.a * 3;
      const offsetB = point.b * 3;
      x = positionsM[offsetA] + (positionsM[offsetB] - positionsM[offsetA]) * point.t;
      y = positionsM[offsetA + 1] + (positionsM[offsetB + 1] - positionsM[offsetA + 1]) * point.t;
      z = positionsM[offsetA + 2] + (positionsM[offsetB + 2] - positionsM[offsetA + 2]) * point.t;
    }
    out[index * 3] = x;
    out[index * 3 + 1] = y;
    out[index * 3 + 2] = z;
    if (index > 0) {
      const dx = x - previousX;
      const dy = y - previousY;
      const dz = z - previousZ;
      lengthM += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    previousX = x;
    previousY = y;
    previousZ = z;
  }
  if (path.closed && points.length > 1) {
    const dx = out[0] - previousX;
    const dy = out[1] - previousY;
    const dz = out[2] - previousZ;
    lengthM += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return lengthM;
}

export function mirrorMeshSurfacePointV1(
  point: MeshSurfacePointV1,
  topology: MeshSurfaceTopologyV1,
): MeshSurfacePointV1 {
  if (point.kind === 'vertex') {
    return meshSurfaceVertexPointV1(topology.mirrorVertexMap[point.vertex]);
  }
  return meshSurfaceEdgePointV1(
    topology.mirrorVertexMap[point.a],
    topology.mirrorVertexMap[point.b],
    point.t,
  );
}

export function mirrorMeshSurfacePathV1(
  path: MeshSurfacePathV1,
  topology: MeshSurfaceTopologyV1,
): MeshSurfacePathV1 {
  const validation = validateMeshSurfacePathV1(path, topology);
  if (!validation.ok) throw new RangeError(`Cannot mirror surface path: ${validation.code}.`);
  return createMeshSurfacePathV1({
    topology,
    closed: path.closed,
    points: path.points.map((point) => mirrorMeshSurfacePointV1(point, topology)),
  });
}
