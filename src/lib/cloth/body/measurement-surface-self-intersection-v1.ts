export const MEASUREMENT_SURFACE_SELF_INTERSECTION_V1 =
  'measurement-surface-self-intersection/v1' as const;

export interface MeasurementSurfaceSelfIntersectionPolicyV1 {
  readonly maxVertices: number;
  readonly maxTriangles: number;
  readonly maxInputBytes: number;
  readonly maxGridCells: number;
  readonly maxCellReferences: number;
  readonly maxCellPairVisits: number;
  readonly maxCandidatePairs: number;
  readonly absoluteEpsilonM: number;
  readonly relativeEpsilon: number;
  readonly float32UlpMultiplier: number;
  readonly angularEpsilon: number;
}

export type MeasurementSurfaceIntersectionKindV1 =
  | 'proper-crossing'
  | 'coplanar-overlap'
  | 'touching';

export interface MeasurementSurfaceIntersectionPairV1 {
  readonly triangleA: number;
  readonly triangleB: number;
  readonly kind: MeasurementSurfaceIntersectionKindV1;
}

export interface MeasurementSurfaceSelfIntersectionBroadPhaseReportV1 {
  readonly gridCellSizeM: number;
  readonly gridDimensions: readonly [x: number, y: number, z: number];
  readonly gridCellCount: number;
  readonly occupiedCellCount: number;
  readonly cellReferenceCount: number;
  readonly cellPairVisitCount: number;
  /** Includes topology-adjacent pairs; they are verified rather than blindly skipped. */
  readonly candidatePairCount: number;
  readonly topologyAdjacentPairCount: number;
  readonly testedPairCount: number;
}

export interface MeasurementSurfaceSelfIntersectionReportV1 {
  readonly version: typeof MEASUREMENT_SURFACE_SELF_INTERSECTION_V1;
  readonly passed: boolean;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly inputByteLength: number;
  readonly epsilonM: number;
  readonly broadPhase: MeasurementSurfaceSelfIntersectionBroadPhaseReportV1;
  readonly intersectionCount: number;
  readonly intersections: readonly MeasurementSurfaceIntersectionPairV1[];
  readonly blockers: readonly 'self-intersection'[];
}

export const DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1: MeasurementSurfaceSelfIntersectionPolicyV1 =
  Object.freeze({
    maxVertices: 500_000,
    maxTriangles: 1_000_000,
    maxInputBytes: 32 * 1024 * 1024,
    maxGridCells: 1_000_000,
    maxCellReferences: 4_000_000,
    maxCellPairVisits: 8_000_000,
    maxCandidatePairs: 2_000_000,
    absoluteEpsilonM: 1e-9,
    relativeEpsilon: 2e-7,
    float32UlpMultiplier: 2,
    angularEpsilon: 1e-7,
  });

type Point2 = readonly [x: number, y: number];
type Point3 = readonly [x: number, y: number, z: number];

interface Triangle {
  readonly a: Point3;
  readonly b: Point3;
  readonly c: Point3;
  readonly normal: Point3;
  readonly normalLength: number;
}

interface Bounds {
  readonly min: Point3;
  readonly max: Point3;
  readonly diagonalM: number;
  readonly maxAbsCoordinateM: number;
}

interface TypedArrayMetadata {
  readonly length: number;
  readonly byteLength: number;
  readonly byteOffset: number;
  readonly buffer: ArrayBuffer;
}

const POLICY_KEYS = Object.freeze([
  'maxVertices',
  'maxTriangles',
  'maxInputBytes',
  'maxGridCells',
  'maxCellReferences',
  'maxCellPairVisits',
  'maxCandidatePairs',
  'absoluteEpsilonM',
  'relativeEpsilon',
  'float32UlpMultiplier',
  'angularEpsilon',
] as const);
const CAP_KEYS = Object.freeze([
  'maxVertices',
  'maxTriangles',
  'maxInputBytes',
  'maxGridCells',
  'maxCellReferences',
  'maxCellPairVisits',
  'maxCandidatePairs',
] as const);
const EPSILON_KEYS = Object.freeze([
  'absoluteEpsilonM',
  'relativeEpsilon',
  'float32UlpMultiplier',
  'angularEpsilon',
] as const);
const MAX_SAFE_PAIR_TRIANGLES = Math.floor(Math.sqrt(Number.MAX_SAFE_INTEGER));
const FLOAT32_RELATIVE_ULP = 2 ** -23;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
)?.get;
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteOffset',
)?.get;
const typedArrayLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get;
const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'byteLength',
)?.get;

function snapshotPolicy(
  value: MeasurementSurfaceSelfIntersectionPolicyV1 | undefined,
): MeasurementSurfaceSelfIntersectionPolicyV1 {
  if (value === undefined) return DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Self-intersection policy must be a plain record.');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Self-intersection policy must have a plain object prototype.');
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== POLICY_KEYS.length ||
    keys.some(
      (key) => typeof key !== 'string' || !POLICY_KEYS.some((expectedKey) => expectedKey === key),
    )
  ) {
    throw new TypeError('Self-intersection policy must contain exactly the V1 policy keys.');
  }
  const snapshot = {} as Record<(typeof POLICY_KEYS)[number], number>;
  for (const key of POLICY_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError(`Self-intersection policy ${key} must be enumerable plain data.`);
    }
    if (typeof descriptor.value !== 'number') {
      throw new TypeError(`Self-intersection policy ${key} must be a number.`);
    }
    snapshot[key] = descriptor.value;
  }
  for (const key of CAP_KEYS) {
    if (!Number.isSafeInteger(snapshot[key]) || snapshot[key] <= 0) {
      throw new RangeError(`Self-intersection policy ${key} must be a positive safe integer.`);
    }
  }
  for (const key of EPSILON_KEYS) {
    if (!Number.isFinite(snapshot[key]) || snapshot[key] <= 0) {
      throw new RangeError(`Self-intersection policy ${key} must be finite and positive.`);
    }
  }
  if (snapshot.maxTriangles > MAX_SAFE_PAIR_TRIANGLES) {
    throw new RangeError(
      `Self-intersection policy maxTriangles must be <= ${MAX_SAFE_PAIR_TRIANGLES}.`,
    );
  }
  return Object.freeze({ ...snapshot }) as MeasurementSurfaceSelfIntersectionPolicyV1;
}

function typedArrayMetadata(
  value: unknown,
  expectedPrototype: object,
  path: string,
): TypedArrayMetadata {
  if (
    !typedArrayBufferGetter ||
    !typedArrayByteLengthGetter ||
    !typedArrayByteOffsetGetter ||
    !typedArrayLengthGetter ||
    !arrayBufferByteLengthGetter
  ) {
    throw new TypeError('Typed-array intrinsic getters are unavailable.');
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.getPrototypeOf(value) !== expectedPrototype
  ) {
    throw new TypeError(`${path} must be an exact, undecorated typed array.`);
  }
  let length: number;
  let byteLength: number;
  let byteOffset: number;
  let buffer: ArrayBufferLike;
  try {
    length = typedArrayLengthGetter.call(value) as number;
    byteLength = typedArrayByteLengthGetter.call(value) as number;
    byteOffset = typedArrayByteOffsetGetter.call(value) as number;
    buffer = typedArrayBufferGetter.call(value) as ArrayBufferLike;
  } catch {
    throw new TypeError(`${path} must be a genuine typed array.`);
  }
  if (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer) {
    throw new TypeError(`${path} must not use SharedArrayBuffer memory.`);
  }
  if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype) {
    throw new TypeError(`${path}.buffer must be an ordinary ArrayBuffer.`);
  }
  const bufferByteLength = arrayBufferByteLengthGetter.call(buffer) as number;
  if (
    !Number.isSafeInteger(length) ||
    !Number.isSafeInteger(byteLength) ||
    !Number.isSafeInteger(byteOffset) ||
    byteLength < 0 ||
    byteOffset < 0 ||
    byteOffset + byteLength > bufferByteLength
  ) {
    throw new TypeError(`${path} has invalid or detached storage.`);
  }
  return { length, byteLength, byteOffset, buffer: buffer as ArrayBuffer };
}

function requireUndecoratedTypedArray(
  value: Float32Array | Uint32Array,
  metadata: TypedArrayMetadata,
  path: string,
): void {
  if (Reflect.ownKeys(metadata.buffer).length !== 0) {
    throw new TypeError(`${path}.buffer must be undecorated.`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== metadata.length) {
    throw new TypeError(`${path} must be undecorated.`);
  }
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] !== String(index)) {
      throw new TypeError(`${path} must contain only canonical indexed data.`);
    }
  }
}

function preflight(
  positions: Float32Array,
  indices: Uint32Array,
  policy: MeasurementSurfaceSelfIntersectionPolicyV1,
): {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly inputByteLength: number;
} {
  const positionMetadata = typedArrayMetadata(positions, Float32Array.prototype, 'positions');
  const indexMetadata = typedArrayMetadata(indices, Uint32Array.prototype, 'indices');
  if (positionMetadata.length % 3 !== 0 || positionMetadata.length < 9) {
    throw new RangeError('positions must contain at least three complete XYZ vertices.');
  }
  if (indexMetadata.length % 3 !== 0 || indexMetadata.length < 3) {
    throw new RangeError('indices must contain at least one complete triangle.');
  }
  const vertexCount = positionMetadata.length / 3;
  const triangleCount = indexMetadata.length / 3;
  const inputByteLength = positionMetadata.byteLength + indexMetadata.byteLength;
  if (vertexCount > policy.maxVertices) {
    throw new RangeError(`Vertex cap exceeded: ${vertexCount} > ${policy.maxVertices}.`);
  }
  if (triangleCount > policy.maxTriangles) {
    throw new RangeError(`Triangle cap exceeded: ${triangleCount} > ${policy.maxTriangles}.`);
  }
  if (triangleCount > MAX_SAFE_PAIR_TRIANGLES) {
    throw new RangeError(`Triangle count exceeds safe deterministic pair encoding.`);
  }
  if (!Number.isSafeInteger(inputByteLength) || inputByteLength > policy.maxInputBytes) {
    throw new RangeError(`Input byte cap exceeded: ${inputByteLength} > ${policy.maxInputBytes}.`);
  }
  requireUndecoratedTypedArray(positions, positionMetadata, 'positions');
  requireUndecoratedTypedArray(indices, indexMetadata, 'indices');
  return { vertexCount, triangleCount, inputByteLength };
}

function geometryBounds(positions: Float32Array): Bounds {
  const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
  const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let maxAbsCoordinateM = 0;
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[offset + axis];
      if (!Number.isFinite(value))
        throw new TypeError(`positions[${offset + axis}] is not finite.`);
      minimum[axis] = Math.min(minimum[axis], value);
      maximum[axis] = Math.max(maximum[axis], value);
      maxAbsCoordinateM = Math.max(maxAbsCoordinateM, Math.abs(value));
    }
  }
  const diagonalM = Math.hypot(
    maximum[0] - minimum[0],
    maximum[1] - minimum[1],
    maximum[2] - minimum[2],
  );
  if (!Number.isFinite(diagonalM) || diagonalM <= 0) {
    throw new RangeError('positions must have a finite positive spatial extent.');
  }
  return {
    min: minimum,
    max: maximum,
    diagonalM,
    maxAbsCoordinateM,
  };
}

function point(positions: Float32Array, vertex: number): Point3 {
  const offset = vertex * 3;
  return [positions[offset], positions[offset + 1], positions[offset + 2]];
}

function subtract(a: Point3, b: Point3): Point3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Point3, b: Point3): Point3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Point3, b: Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function distance(a: Point3, b: Point3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function triangle(positions: Float32Array, indices: Uint32Array, triangleIndex: number): Triangle {
  const offset = triangleIndex * 3;
  const a = point(positions, indices[offset]);
  const b = point(positions, indices[offset + 1]);
  const c = point(positions, indices[offset + 2]);
  const normal = cross(subtract(b, a), subtract(c, a));
  return { a, b, c, normal, normalLength: Math.hypot(...normal) };
}

function triangleAabbs(
  positions: Float32Array,
  indices: Uint32Array,
  vertexCount: number,
  triangleCount: number,
  epsilonM: number,
): Float64Array {
  const aabbs = new Float64Array(triangleCount * 6);
  const canonicalFaces = new Set<string>();
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const indexOffset = triangleIndex * 3;
    const aIndex = indices[indexOffset];
    const bIndex = indices[indexOffset + 1];
    const cIndex = indices[indexOffset + 2];
    if (aIndex >= vertexCount || bIndex >= vertexCount || cIndex >= vertexCount) {
      throw new RangeError(`Triangle ${triangleIndex} contains an out-of-range vertex index.`);
    }
    if (aIndex === bIndex || bIndex === cIndex || cIndex === aIndex) {
      throw new RangeError(`Triangle ${triangleIndex} repeats a topology vertex.`);
    }
    const canonicalFace = [aIndex, bIndex, cIndex].sort((a, b) => a - b).join(':');
    if (canonicalFaces.has(canonicalFace)) {
      throw new RangeError(`Triangle ${triangleIndex} duplicates canonical face ${canonicalFace}.`);
    }
    canonicalFaces.add(canonicalFace);
    const value = triangle(positions, indices, triangleIndex);
    const longestEdgeM = Math.max(
      distance(value.a, value.b),
      distance(value.b, value.c),
      distance(value.c, value.a),
    );
    if (!(longestEdgeM > 0) || value.normalLength <= epsilonM * longestEdgeM) {
      throw new RangeError(`Triangle ${triangleIndex} is degenerate at the validator epsilon.`);
    }
    const aabbOffset = triangleIndex * 6;
    for (let axis = 0; axis < 3; axis += 1) {
      aabbs[aabbOffset + axis] = Math.min(value.a[axis], value.b[axis], value.c[axis]);
      aabbs[aabbOffset + 3 + axis] = Math.max(value.a[axis], value.b[axis], value.c[axis]);
    }
  }
  return aabbs;
}

function aabbsOverlap(aabbs: Float64Array, a: number, b: number, epsilonM: number): boolean {
  const aOffset = a * 6;
  const bOffset = b * 6;
  for (let axis = 0; axis < 3; axis += 1) {
    if (
      aabbs[aOffset + axis] > aabbs[bOffset + 3 + axis] + epsilonM ||
      aabbs[bOffset + axis] > aabbs[aOffset + 3 + axis] + epsilonM
    ) {
      return false;
    }
  }
  return true;
}

function sharedTopologyVertices(indices: Uint32Array, a: number, b: number): readonly number[] {
  const aOffset = a * 3;
  const bOffset = b * 3;
  const result: number[] = [];
  for (let aIndex = 0; aIndex < 3; aIndex += 1) {
    const vertex = indices[aOffset + aIndex];
    for (let bIndex = 0; bIndex < 3; bIndex += 1) {
      if (vertex === indices[bOffset + bIndex]) result.push(vertex);
    }
  }
  return result;
}

function gridBroadPhase(
  aabbs: Float64Array,
  indices: Uint32Array,
  bounds: Bounds,
  epsilonM: number,
  triangleCount: number,
  policy: MeasurementSurfaceSelfIntersectionPolicyV1,
  targetAxisMultiplier = 1,
): {
  readonly candidatePairKeys: readonly number[];
  readonly report: MeasurementSurfaceSelfIntersectionBroadPhaseReportV1;
} {
  const targetAxisCells = Math.max(1, Math.ceil(Math.cbrt(triangleCount)) * targetAxisMultiplier);
  const spans: Point3 = [
    bounds.max[0] - bounds.min[0] + epsilonM * 2,
    bounds.max[1] - bounds.min[1] + epsilonM * 2,
    bounds.max[2] - bounds.min[2] + epsilonM * 2,
  ];
  const maximumSpan = Math.max(...spans);
  const gridCellSizeM = maximumSpan / targetAxisCells;
  if (!Number.isFinite(gridCellSizeM) || gridCellSizeM <= 0) {
    throw new RangeError('Broad-phase grid cell size is not finite and positive.');
  }
  const gridDimensions: [number, number, number] = [
    Math.max(1, Math.ceil(spans[0] / gridCellSizeM)),
    Math.max(1, Math.ceil(spans[1] / gridCellSizeM)),
    Math.max(1, Math.ceil(spans[2] / gridCellSizeM)),
  ];
  const gridCellCount = gridDimensions[0] * gridDimensions[1] * gridDimensions[2];
  if (!Number.isSafeInteger(gridCellCount) || gridCellCount > policy.maxGridCells) {
    throw new RangeError(`Grid cell cap exceeded: ${gridCellCount} > ${policy.maxGridCells}.`);
  }
  const origin: Point3 = [
    bounds.min[0] - epsilonM,
    bounds.min[1] - epsilonM,
    bounds.min[2] - epsilonM,
  ];
  const cellIndex = (value: number, axis: number): number =>
    Math.max(
      0,
      Math.min(gridDimensions[axis] - 1, Math.floor((value - origin[axis]) / gridCellSizeM)),
    );
  const cells = new Map<number, number[]>();
  let cellReferenceCount = 0;
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const offset = triangleIndex * 6;
    const minimum: Point3 = [
      cellIndex(aabbs[offset] - epsilonM, 0),
      cellIndex(aabbs[offset + 1] - epsilonM, 1),
      cellIndex(aabbs[offset + 2] - epsilonM, 2),
    ];
    const maximum: Point3 = [
      cellIndex(aabbs[offset + 3] + epsilonM, 0),
      cellIndex(aabbs[offset + 4] + epsilonM, 1),
      cellIndex(aabbs[offset + 5] + epsilonM, 2),
    ];
    const additionalReferences =
      (maximum[0] - minimum[0] + 1) * (maximum[1] - minimum[1] + 1) * (maximum[2] - minimum[2] + 1);
    if (
      !Number.isSafeInteger(additionalReferences) ||
      cellReferenceCount + additionalReferences > policy.maxCellReferences
    ) {
      throw new RangeError(
        `Cell reference cap exceeded: ${cellReferenceCount + additionalReferences} > ${policy.maxCellReferences}.`,
      );
    }
    cellReferenceCount += additionalReferences;
    for (let z = minimum[2]; z <= maximum[2]; z += 1) {
      for (let y = minimum[1]; y <= maximum[1]; y += 1) {
        for (let x = minimum[0]; x <= maximum[0]; x += 1) {
          const id = x + gridDimensions[0] * (y + gridDimensions[1] * z);
          const list = cells.get(id);
          if (list) list.push(triangleIndex);
          else cells.set(id, [triangleIndex]);
        }
      }
    }
  }
  const candidates = new Set<number>();
  let cellPairVisitCount = 0;
  for (const cellId of [...cells.keys()].sort((a, b) => a - b)) {
    const list = cells.get(cellId)!;
    const additionalVisits = (list.length * (list.length - 1)) / 2;
    if (
      !Number.isSafeInteger(additionalVisits) ||
      cellPairVisitCount + additionalVisits > policy.maxCellPairVisits
    ) {
      throw new RangeError(
        `Cell pair visit cap exceeded: ${cellPairVisitCount + additionalVisits} > ${policy.maxCellPairVisits}.`,
      );
    }
    cellPairVisitCount += additionalVisits;
    for (let left = 0; left < list.length; left += 1) {
      for (let right = left + 1; right < list.length; right += 1) {
        const a = list[left];
        const b = list[right];
        if (!aabbsOverlap(aabbs, a, b, epsilonM)) continue;
        const key = a * triangleCount + b;
        if (!candidates.has(key)) {
          if (candidates.size >= policy.maxCandidatePairs) {
            throw new RangeError(
              `Candidate pair cap exceeded: ${candidates.size + 1} > ${policy.maxCandidatePairs}.`,
            );
          }
          candidates.add(key);
        }
      }
    }
  }
  const candidatePairKeys = [...candidates].sort((a, b) => a - b);
  let topologyAdjacentPairCount = 0;
  for (const key of candidatePairKeys) {
    const a = Math.floor(key / triangleCount);
    const b = key - a * triangleCount;
    if (sharedTopologyVertices(indices, a, b).length > 0) topologyAdjacentPairCount += 1;
  }
  return {
    candidatePairKeys,
    report: {
      gridCellSizeM,
      gridDimensions: Object.freeze(gridDimensions),
      gridCellCount,
      occupiedCellCount: cells.size,
      cellReferenceCount,
      cellPairVisitCount,
      candidatePairCount: candidatePairKeys.length,
      topologyAdjacentPairCount,
      testedPairCount: candidatePairKeys.length,
    },
  };
}

function dominantProjection(normal: Point3): 0 | 1 | 2 {
  const absolute = [Math.abs(normal[0]), Math.abs(normal[1]), Math.abs(normal[2])];
  return absolute[0] >= absolute[1] && absolute[0] >= absolute[2]
    ? 0
    : absolute[1] >= absolute[2]
      ? 1
      : 2;
}

function project(pointValue: Point3, droppedAxis: 0 | 1 | 2): Point2 {
  if (droppedAxis === 0) return [pointValue[1], pointValue[2]];
  if (droppedAxis === 1) return [pointValue[0], pointValue[2]];
  return [pointValue[0], pointValue[1]];
}

function orient2d(a: Point2, b: Point2, c: Point2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function squaredLength(value: Point3): number {
  return dot(value, value);
}

/** Exact region test for the closest point on a non-degenerate closed triangle. */
function distanceToClosedTriangle(value: Point3, triangleValue: Triangle): number {
  const ab = subtract(triangleValue.b, triangleValue.a);
  const ac = subtract(triangleValue.c, triangleValue.a);
  const ap = subtract(value, triangleValue.a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return Math.sqrt(squaredLength(ap));

  const bp = subtract(value, triangleValue.b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return Math.sqrt(squaredLength(bp));

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    return distance(value, interpolate(triangleValue.a, triangleValue.b, d1 / (d1 - d3)));
  }

  const cp = subtract(value, triangleValue.c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return Math.sqrt(squaredLength(cp));

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    return distance(value, interpolate(triangleValue.a, triangleValue.c, d2 / (d2 - d6)));
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const edgeT = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return distance(value, interpolate(triangleValue.b, triangleValue.c, edgeT));
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  const closest: Point3 = [
    triangleValue.a[0] + ab[0] * v + ac[0] * w,
    triangleValue.a[1] + ab[1] * v + ac[1] * w,
    triangleValue.a[2] + ab[2] * v + ac[2] * w,
  ];
  return distance(value, closest);
}

function pointInProjectedTriangle(
  value: Point3,
  triangleValue: Triangle,
  epsilonM: number,
): { readonly inside: boolean; readonly strict: boolean } {
  const axis = dominantProjection(triangleValue.normal);
  const a = project(triangleValue.a, axis);
  const b = project(triangleValue.b, axis);
  const c = project(triangleValue.c, axis);
  const p = project(value, axis);
  const area = orient2d(a, b, c);
  const edges = [
    [a, b],
    [b, c],
    [c, a],
  ] as const;
  const direction = area >= 0 ? 1 : -1;
  const directedDistances = edges.map(([start, end]) => {
    const edgeLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
    return (direction * orient2d(start, end, p)) / edgeLength;
  });
  const withinClosedTriangle = distanceToClosedTriangle(value, triangleValue) <= epsilonM;
  return {
    inside: withinClosedTriangle,
    strict:
      withinClosedTriangle && directedDistances.every((edgeDistance) => edgeDistance > epsilonM),
  };
}

function signedPlaneDistance(pointValue: Point3, triangleValue: Triangle): number {
  return (
    dot(triangleValue.normal, subtract(pointValue, triangleValue.a)) / triangleValue.normalLength
  );
}

function allBeyond(values: readonly number[], epsilonM: number): boolean {
  return values.every((value) => value > epsilonM) || values.every((value) => value < -epsilonM);
}

function convexCoplanarIntersectionKind(
  first: Triangle,
  second: Triangle,
  epsilonM: number,
): MeasurementSurfaceIntersectionKindV1 | null {
  const axis = dominantProjection(first.normal);
  const firstPoints = [first.a, first.b, first.c].map((value) => project(value, axis));
  const secondPoints = [second.a, second.b, second.c].map((value) => project(value, axis));
  let minimumOverlap = Infinity;
  for (const points of [firstPoints, secondPoints]) {
    for (let index = 0; index < 3; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % 3];
      const edgeX = b[0] - a[0];
      const edgeY = b[1] - a[1];
      const length = Math.hypot(edgeX, edgeY);
      if (!(length > 0)) continue;
      const projectionAxis: Point2 = [-edgeY / length, edgeX / length];
      const projectAll = (values: readonly Point2[]) =>
        values.map((value) => value[0] * projectionAxis[0] + value[1] * projectionAxis[1]);
      const firstProjections = projectAll(firstPoints);
      const secondProjections = projectAll(secondPoints);
      const overlap =
        Math.min(Math.max(...firstProjections), Math.max(...secondProjections)) -
        Math.max(Math.min(...firstProjections), Math.min(...secondProjections));
      if (overlap < -epsilonM) return null;
      minimumOverlap = Math.min(minimumOverlap, overlap);
    }
  }
  return minimumOverlap > epsilonM ? 'coplanar-overlap' : 'touching';
}

function onSegment2d(a: Point2, b: Point2, p: Point2, tolerance: number): boolean {
  return (
    p[0] >= Math.min(a[0], b[0]) - tolerance &&
    p[0] <= Math.max(a[0], b[0]) + tolerance &&
    p[1] >= Math.min(a[1], b[1]) - tolerance &&
    p[1] <= Math.max(a[1], b[1]) + tolerance
  );
}

function segmentsIntersect2d(
  a: Point2,
  b: Point2,
  c: Point2,
  d: Point2,
  epsilonM: number,
): boolean {
  const abTolerance = epsilonM * Math.hypot(b[0] - a[0], b[1] - a[1]);
  const cdTolerance = epsilonM * Math.hypot(d[0] - c[0], d[1] - c[1]);
  const abC = orient2d(a, b, c);
  const abD = orient2d(a, b, d);
  const cdA = orient2d(c, d, a);
  const cdB = orient2d(c, d, b);
  if (
    ((abC > abTolerance && abD < -abTolerance) || (abC < -abTolerance && abD > abTolerance)) &&
    ((cdA > cdTolerance && cdB < -cdTolerance) || (cdA < -cdTolerance && cdB > cdTolerance))
  ) {
    return true;
  }
  return (
    (Math.abs(abC) <= abTolerance && onSegment2d(a, b, c, epsilonM)) ||
    (Math.abs(abD) <= abTolerance && onSegment2d(a, b, d, epsilonM)) ||
    (Math.abs(cdA) <= cdTolerance && onSegment2d(c, d, a, epsilonM)) ||
    (Math.abs(cdB) <= cdTolerance && onSegment2d(c, d, b, epsilonM))
  );
}

function interpolate(a: Point3, b: Point3, t: number): Point3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function pointOnSegment2d(a: Point2, b: Point2, value: Point2, epsilonM: number): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return (
    length > 0 &&
    Math.abs(orient2d(a, b, value)) <= epsilonM * length &&
    onSegment2d(a, b, value, epsilonM)
  );
}

function projectedSegmentIntersectionParameters(
  a: Point3,
  b: Point3,
  c: Point3,
  d: Point3,
  droppedAxis: 0 | 1 | 2,
  epsilonM: number,
): readonly number[] {
  const a2 = project(a, droppedAxis);
  const b2 = project(b, droppedAxis);
  const c2 = project(c, droppedAxis);
  const d2 = project(d, droppedAxis);
  if (!segmentsIntersect2d(a2, b2, c2, d2, epsilonM)) return [];
  const r: Point2 = [b2[0] - a2[0], b2[1] - a2[1]];
  const s: Point2 = [d2[0] - c2[0], d2[1] - c2[1]];
  const rLength = Math.hypot(...r);
  const sLength = Math.hypot(...s);
  const denominator = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denominator) > rLength * sLength * 1e-12) {
    const relative: Point2 = [c2[0] - a2[0], c2[1] - a2[1]];
    const t = (relative[0] * s[1] - relative[1] * s[0]) / denominator;
    return t >= -epsilonM / rLength && t <= 1 + epsilonM / rLength
      ? [Math.max(0, Math.min(1, t))]
      : [];
  }
  const parameters: number[] = [];
  const add = (value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    if (!parameters.some((existing) => Math.abs(existing - clamped) <= 1e-12)) {
      parameters.push(clamped);
    }
  };
  if (pointOnSegment2d(c2, d2, a2, epsilonM)) add(0);
  if (pointOnSegment2d(c2, d2, b2, epsilonM)) add(1);
  const rLengthSquared = r[0] * r[0] + r[1] * r[1];
  if (pointOnSegment2d(a2, b2, c2, epsilonM)) {
    add(((c2[0] - a2[0]) * r[0] + (c2[1] - a2[1]) * r[1]) / rLengthSquared);
  }
  if (pointOnSegment2d(a2, b2, d2, epsilonM)) {
    add(((d2[0] - a2[0]) * r[0] + (d2[1] - a2[1]) * r[1]) / rLengthSquared);
  }
  return parameters;
}

function contactWitnesses(first: Triangle, second: Triangle, epsilonM: number): readonly Point3[] {
  const witnesses: Point3[] = [];
  const add = (value: Point3) => {
    if (!witnesses.some((existing) => distance(existing, value) <= epsilonM * 0.25)) {
      witnesses.push(value);
    }
  };
  const inspect = (source: Triangle, target: Triangle) => {
    const sourcePoints = [source.a, source.b, source.c] as const;
    const targetPoints = [target.a, target.b, target.c] as const;
    const distances = sourcePoints.map((value) => signedPlaneDistance(value, target));
    for (let index = 0; index < 3; index += 1) {
      if (
        Math.abs(distances[index]) <= epsilonM &&
        pointInProjectedTriangle(sourcePoints[index], target, epsilonM).inside
      ) {
        add(sourcePoints[index]);
      }
    }
    const axis = dominantProjection(target.normal);
    for (let index = 0; index < 3; index += 1) {
      const next = (index + 1) % 3;
      const a = sourcePoints[index];
      const b = sourcePoints[next];
      const distanceA = distances[index];
      const distanceB = distances[next];
      if (distanceA > 0 !== distanceB > 0) {
        const intersection = interpolate(a, b, distanceA / (distanceA - distanceB));
        if (pointInProjectedTriangle(intersection, target, epsilonM).inside) add(intersection);
      }
      if (Math.abs(distanceA) <= epsilonM && Math.abs(distanceB) <= epsilonM) {
        for (let targetIndex = 0; targetIndex < 3; targetIndex += 1) {
          for (const t of projectedSegmentIntersectionParameters(
            a,
            b,
            targetPoints[targetIndex],
            targetPoints[(targetIndex + 1) % 3],
            axis,
            epsilonM,
          )) {
            add(interpolate(a, b, t));
          }
        }
      }
    }
  };
  inspect(first, second);
  inspect(second, first);
  return witnesses;
}

function pointOnSegment3d(value: Point3, a: Point3, b: Point3, epsilonM: number): boolean {
  const direction = subtract(b, a);
  const lengthSquared = dot(direction, direction);
  const length = Math.sqrt(lengthSquared);
  const t = dot(subtract(value, a), direction) / lengthSquared;
  if (t < -epsilonM / length || t > 1 + epsilonM / length) return false;
  return distance(value, interpolate(a, b, Math.max(0, Math.min(1, t)))) <= epsilonM;
}

function adjacentContactIsConfined(
  kind: MeasurementSurfaceIntersectionKindV1,
  sharedVertices: readonly number[],
  positions: Float32Array,
  first: Triangle,
  second: Triangle,
  epsilonM: number,
): boolean {
  if (kind !== 'touching' || (sharedVertices.length !== 1 && sharedVertices.length !== 2)) {
    return false;
  }
  const witnesses = contactWitnesses(first, second, epsilonM);
  if (witnesses.length === 0) return false;
  const a = point(positions, sharedVertices[0]);
  if (sharedVertices.length === 1) {
    return witnesses.every((witness) => distance(witness, a) <= epsilonM);
  }
  const b = point(positions, sharedVertices[1]);
  return witnesses.every((witness) => pointOnSegment3d(witness, a, b, epsilonM));
}

function coplanarSegmentTouchesTriangle(
  a: Point3,
  b: Point3,
  triangleValue: Triangle,
  epsilonM: number,
): boolean {
  if (
    pointInProjectedTriangle(a, triangleValue, epsilonM).inside ||
    pointInProjectedTriangle(b, triangleValue, epsilonM).inside
  ) {
    return true;
  }
  const axis = dominantProjection(triangleValue.normal);
  const start = project(a, axis);
  const end = project(b, axis);
  const points = [triangleValue.a, triangleValue.b, triangleValue.c].map((value) =>
    project(value, axis),
  );
  return points.some((value, index) =>
    segmentsIntersect2d(start, end, value, points[(index + 1) % 3], epsilonM),
  );
}

function edgeAgainstTriangle(
  a: Point3,
  b: Point3,
  distanceA: number,
  distanceB: number,
  triangleValue: Triangle,
  epsilonM: number,
): 0 | 1 | 2 {
  if (
    (distanceA > epsilonM && distanceB > epsilonM) ||
    (distanceA < -epsilonM && distanceB < -epsilonM)
  ) {
    return 0;
  }
  if (Math.abs(distanceA) <= epsilonM && Math.abs(distanceB) <= epsilonM) {
    return coplanarSegmentTouchesTriangle(a, b, triangleValue, epsilonM) ? 1 : 0;
  }
  let touches =
    (Math.abs(distanceA) <= epsilonM &&
      pointInProjectedTriangle(a, triangleValue, epsilonM).inside) ||
    (Math.abs(distanceB) <= epsilonM &&
      pointInProjectedTriangle(b, triangleValue, epsilonM).inside);
  if (distanceA > 0 !== distanceB > 0) {
    const t = distanceA / (distanceA - distanceB);
    const intersection: Point3 = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
    const containment = pointInProjectedTriangle(intersection, triangleValue, epsilonM);
    if (containment.strict && Math.abs(distanceA) > epsilonM && Math.abs(distanceB) > epsilonM) {
      return 2;
    }
    touches ||= containment.inside;
  }
  return touches ? 1 : 0;
}

function triangleIntersectionKind(
  first: Triangle,
  second: Triangle,
  epsilonM: number,
  angularEpsilon: number,
): MeasurementSurfaceIntersectionKindV1 | null {
  const firstToSecond = [first.a, first.b, first.c].map((value) =>
    signedPlaneDistance(value, second),
  );
  if (allBeyond(firstToSecond, epsilonM)) return null;
  const secondToFirst = [second.a, second.b, second.c].map((value) =>
    signedPlaneDistance(value, first),
  );
  if (allBeyond(secondToFirst, epsilonM)) return null;
  const normalCross = cross(first.normal, second.normal);
  const sineAngle = Math.hypot(...normalCross) / (first.normalLength * second.normalLength);
  if (sineAngle <= angularEpsilon) {
    const projected = convexCoplanarIntersectionKind(first, second, epsilonM);
    if (projected === null) return null;
    const maximumPlaneDistance = Math.max(
      ...firstToSecond.map(Math.abs),
      ...secondToFirst.map(Math.abs),
    );
    return maximumPlaneDistance > epsilonM * 0.25 ? 'touching' : projected;
  }
  let strongest = 0;
  const inspect = (source: Triangle, distances: readonly number[], target: Triangle): void => {
    const points = [source.a, source.b, source.c] as const;
    for (let index = 0; index < 3; index += 1) {
      strongest = Math.max(
        strongest,
        edgeAgainstTriangle(
          points[index],
          points[(index + 1) % 3],
          distances[index],
          distances[(index + 1) % 3],
          target,
          epsilonM,
        ),
      );
    }
  };
  inspect(first, firstToSecond, second);
  inspect(second, secondToFirst, first);
  return strongest === 2 ? 'proper-crossing' : strongest === 1 ? 'touching' : null;
}

/**
 * Pure, synchronous CPU diagnostic over caller-owned Float32/Uint32 mesh bytes.
 * Invalid or over-budget input throws before the relevant expensive phase; valid input produces a
 * deeply frozen report and is never mutated.
 */
export function validateMeasurementSurfaceSelfIntersectionV1(
  positions: Float32Array,
  indices: Uint32Array,
  policyInput?: MeasurementSurfaceSelfIntersectionPolicyV1,
): MeasurementSurfaceSelfIntersectionReportV1 {
  const policy = snapshotPolicy(policyInput);
  const { vertexCount, triangleCount, inputByteLength } = preflight(positions, indices, policy);
  const bounds = geometryBounds(positions);
  const epsilonM = Math.max(
    policy.absoluteEpsilonM,
    bounds.diagonalM * policy.relativeEpsilon,
    bounds.maxAbsCoordinateM * FLOAT32_RELATIVE_ULP * policy.float32UlpMultiplier,
  );
  if (!Number.isFinite(epsilonM) || epsilonM <= 0) {
    throw new RangeError('Scale-aware intersection epsilon is not finite and positive.');
  }
  const aabbs = triangleAabbs(positions, indices, vertexCount, triangleCount, epsilonM);
  const broadPhase = gridBroadPhase(aabbs, indices, bounds, epsilonM, triangleCount, policy);
  const intersections: MeasurementSurfaceIntersectionPairV1[] = [];
  for (const key of broadPhase.candidatePairKeys) {
    const triangleA = Math.floor(key / triangleCount);
    const triangleB = key - triangleA * triangleCount;
    const first = triangle(positions, indices, triangleA);
    const second = triangle(positions, indices, triangleB);
    const kind = triangleIntersectionKind(first, second, epsilonM, policy.angularEpsilon);
    if (kind === null) continue;
    const sharedVertices = sharedTopologyVertices(indices, triangleA, triangleB);
    if (
      sharedVertices.length > 0 &&
      adjacentContactIsConfined(kind, sharedVertices, positions, first, second, epsilonM)
    ) {
      continue;
    }
    intersections.push(Object.freeze({ triangleA, triangleB, kind }));
  }
  const blockers = intersections.length === 0 ? [] : (['self-intersection'] as const);
  return Object.freeze({
    version: MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
    passed: blockers.length === 0,
    vertexCount,
    triangleCount,
    inputByteLength,
    epsilonM,
    broadPhase: Object.freeze(broadPhase.report),
    intersectionCount: intersections.length,
    intersections: Object.freeze(intersections),
    blockers: Object.freeze(blockers),
  });
}

export interface MeasurementSurfaceAffineSelfIntersectionPlanResearchV1 {
  readonly binding: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly candidatePairKeys: readonly number[];
  readonly broadPhase: MeasurementSurfaceSelfIntersectionBroadPhaseReportV1;
}

/** Builds a bounded pair superset from caller-proven continuous affine vertex intervals. */
export function createMeasurementSurfaceAffineSelfIntersectionPlanResearchV1(options: {
  readonly binding: string;
  readonly sourcePositions: Float32Array;
  readonly indices: Uint32Array;
  readonly lowerPositions: Float64Array;
  readonly upperPositions: Float64Array;
}): MeasurementSurfaceAffineSelfIntersectionPlanResearchV1 {
  if (options.binding.length < 64) {
    throw new TypeError('Affine self-intersection plan binding is incomplete.');
  }
  const policy = snapshotPolicy(undefined);
  const { vertexCount, triangleCount } = preflight(
    options.sourcePositions,
    options.indices,
    policy,
  );
  if (
    options.lowerPositions.length !== options.sourcePositions.length ||
    options.upperPositions.length !== options.sourcePositions.length
  ) {
    throw new RangeError('Affine self-intersection interval length is invalid.');
  }
  const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
  const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let maxAbsCoordinateM = 0;
  for (let offset = 0; offset < options.sourcePositions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const lower = options.lowerPositions[offset + axis];
      const upper = options.upperPositions[offset + axis];
      if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) {
        throw new RangeError('Affine self-intersection interval is invalid.');
      }
      minimum[axis] = Math.min(minimum[axis], lower);
      maximum[axis] = Math.max(maximum[axis], upper);
      maxAbsCoordinateM = Math.max(maxAbsCoordinateM, Math.abs(lower), Math.abs(upper));
    }
  }
  const diagonalM = Math.hypot(
    maximum[0] - minimum[0],
    maximum[1] - minimum[1],
    maximum[2] - minimum[2],
  );
  const bounds: Bounds = { min: minimum, max: maximum, diagonalM, maxAbsCoordinateM };
  const epsilonM = Math.max(
    policy.absoluteEpsilonM,
    diagonalM * policy.relativeEpsilon,
    maxAbsCoordinateM * FLOAT32_RELATIVE_ULP * policy.float32UlpMultiplier,
  );
  triangleAabbs(options.sourcePositions, options.indices, vertexCount, triangleCount, epsilonM);
  const intervalAabbs = new Float64Array(triangleCount * 6);
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const indexOffset = triangleIndex * 3;
    const a = options.indices[indexOffset];
    const b = options.indices[indexOffset + 1];
    const c = options.indices[indexOffset + 2];
    const aabbOffset = triangleIndex * 6;
    for (let axis = 0; axis < 3; axis += 1) {
      intervalAabbs[aabbOffset + axis] = Math.min(
        options.lowerPositions[a * 3 + axis],
        options.lowerPositions[b * 3 + axis],
        options.lowerPositions[c * 3 + axis],
      );
      intervalAabbs[aabbOffset + 3 + axis] = Math.max(
        options.upperPositions[a * 3 + axis],
        options.upperPositions[b * 3 + axis],
        options.upperPositions[c * 3 + axis],
      );
    }
  }
  const broadPhase = gridBroadPhase(
    intervalAabbs,
    options.indices,
    bounds,
    epsilonM,
    triangleCount,
    policy,
    2,
  );
  return Object.freeze({
    binding: options.binding,
    vertexCount,
    triangleCount,
    candidatePairKeys: Object.freeze([...broadPhase.candidatePairKeys]),
    broadPhase: Object.freeze(broadPhase.report),
  });
}

/**
 * Research-only exact localized-deformation accelerator. When the candidate keeps the exact same
 * scale-aware epsilon as its bound baseline, unchanged-triangle pairs are byte-identical and their
 * pair result can be replayed. Every pair touching a conservatively affected triangle still runs
 * the unchanged AABB and narrow phases. Any epsilon drift falls back to the full V1 validator.
 */
export function validateLocalizedMeasurementSurfaceSelfIntersectionResearchV1(options: {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly baseline: MeasurementSurfaceSelfIntersectionReportV1;
  readonly affectedVertices: Uint8Array;
  readonly affinePlan?: MeasurementSurfaceAffineSelfIntersectionPlanResearchV1;
  readonly expectedPlanBinding?: string;
}): MeasurementSurfaceSelfIntersectionReportV1 {
  const policy = snapshotPolicy(undefined);
  const { vertexCount, triangleCount, inputByteLength } = preflight(
    options.positions,
    options.indices,
    policy,
  );
  if (options.affectedVertices.length !== vertexCount) {
    throw new RangeError('Localized self-intersection affected-vertex mask length is invalid.');
  }
  const bounds = geometryBounds(options.positions);
  const epsilonM = Math.max(
    policy.absoluteEpsilonM,
    bounds.diagonalM * policy.relativeEpsilon,
    bounds.maxAbsCoordinateM * FLOAT32_RELATIVE_ULP * policy.float32UlpMultiplier,
  );
  if (!Number.isFinite(epsilonM) || epsilonM <= 0) {
    throw new RangeError('Scale-aware intersection epsilon is not finite and positive.');
  }
  if (
    options.baseline.vertexCount !== vertexCount ||
    options.baseline.triangleCount !== triangleCount ||
    options.baseline.epsilonM !== epsilonM
  ) {
    return validateMeasurementSurfaceSelfIntersectionV1(options.positions, options.indices);
  }

  const affectedTriangles = new Uint8Array(triangleCount);
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const offset = triangleIndex * 3;
    if (
      options.affectedVertices[options.indices[offset]] !== 0 ||
      options.affectedVertices[options.indices[offset + 1]] !== 0 ||
      options.affectedVertices[options.indices[offset + 2]] !== 0
    ) {
      affectedTriangles[triangleIndex] = 1;
    }
  }

  const aabbs = triangleAabbs(
    options.positions,
    options.indices,
    vertexCount,
    triangleCount,
    epsilonM,
  );
  if (
    options.affinePlan &&
    (options.affinePlan.binding !== options.expectedPlanBinding ||
      options.affinePlan.vertexCount !== vertexCount ||
      options.affinePlan.triangleCount !== triangleCount)
  ) {
    throw new Error('Affine self-intersection plan binding mismatch.');
  }
  const dynamicBroadPhase = options.affinePlan
    ? null
    : gridBroadPhase(aabbs, options.indices, bounds, epsilonM, triangleCount, policy);
  const candidatePairKeys =
    options.affinePlan?.candidatePairKeys ?? dynamicBroadPhase!.candidatePairKeys;
  const intersections: MeasurementSurfaceIntersectionPairV1[] = options.baseline.intersections
    .filter(
      ({ triangleA, triangleB }) =>
        affectedTriangles[triangleA] === 0 && affectedTriangles[triangleB] === 0,
    )
    .map((pair) => Object.freeze({ ...pair }));
  const triangleCache: Array<Triangle | undefined> = new Array(triangleCount);
  const cachedTriangle = (triangleIndex: number): Triangle =>
    (triangleCache[triangleIndex] ??= triangle(options.positions, options.indices, triangleIndex));
  let testedPairCount = 0;
  for (const key of candidatePairKeys) {
    const triangleA = Math.floor(key / triangleCount);
    const triangleB = key - triangleA * triangleCount;
    if (affectedTriangles[triangleA] === 0 && affectedTriangles[triangleB] === 0) continue;
    if (!aabbsOverlap(aabbs, triangleA, triangleB, epsilonM)) continue;
    testedPairCount += 1;
    const first = cachedTriangle(triangleA);
    const second = cachedTriangle(triangleB);
    const kind = triangleIntersectionKind(first, second, epsilonM, policy.angularEpsilon);
    if (kind === null) continue;
    const sharedVertices = sharedTopologyVertices(options.indices, triangleA, triangleB);
    if (
      sharedVertices.length > 0 &&
      adjacentContactIsConfined(kind, sharedVertices, options.positions, first, second, epsilonM)
    ) {
      continue;
    }
    intersections.push(Object.freeze({ triangleA, triangleB, kind }));
  }
  intersections.sort(
    (left, right) =>
      left.triangleA - right.triangleA ||
      left.triangleB - right.triangleB ||
      left.kind.localeCompare(right.kind),
  );
  const blockers = intersections.length === 0 ? [] : (['self-intersection'] as const);
  return Object.freeze({
    version: MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
    passed: blockers.length === 0,
    vertexCount,
    triangleCount,
    inputByteLength,
    epsilonM,
    broadPhase: dynamicBroadPhase
      ? Object.freeze(dynamicBroadPhase.report)
      : Object.freeze({ ...options.affinePlan!.broadPhase, testedPairCount }),
    intersectionCount: intersections.length,
    intersections: Object.freeze(intersections),
    blockers: Object.freeze(blockers),
  });
}
