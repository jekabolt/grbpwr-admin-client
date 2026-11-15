import type { BodyPoseKind } from './contracts';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import {
  createMeasurementBodyFrameV2,
  type MeasurementBodyFrameV2,
  type MeasurementBodyFrameSegmentV2,
} from './measurement-body-frame-v2';

export const MEASUREMENT_WATERTIGHT_SURFACE_V1 = 'measurement-watertight-surface/v1' as const;

export interface MeasurementSurfaceLodPolicyV1 {
  readonly cellSizeM: number;
  readonly maxCells: number;
  readonly maxVertices: number;
  readonly maxTriangles: number;
  readonly maxBytes: number;
}

export interface MeasurementWatertightSurfacePolicyV1 {
  readonly quantizationM: number;
  readonly paddingCells: number;
  readonly display: MeasurementSurfaceLodPolicyV1;
  readonly collisionCandidate: MeasurementSurfaceLodPolicyV1;
}

export interface MeasurementSurfaceMeshV1 {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly byteLength: number;
}

export interface MeasurementSurfaceTopologyReportV1 {
  readonly passed: boolean;
  readonly finitePositions: boolean;
  readonly validIndices: boolean;
  readonly degenerateTriangleCount: number;
  readonly duplicateTriangleCount: number;
  readonly nonTwoManifoldEdgeCount: number;
  readonly inconsistentWindingEdgeCount: number;
  readonly connectedComponentCount: number;
  readonly connectedComponentVertexCounts: readonly number[];
  readonly connectedComponentBoundsM: readonly {
    readonly min: Point;
    readonly max: Point;
  }[];
  readonly eulerCharacteristic: number;
  readonly signedVolumeM3: number;
  readonly outwardWinding: boolean;
  readonly nonManifoldVertexCount: number;
  readonly selfIntersection: 'not-evaluated';
  readonly blockers: readonly string[];
}

export interface MeasurementSurfaceGridReportV1 {
  readonly cellSizeM: number;
  readonly cells: readonly [x: number, y: number, z: number];
  readonly cellCount: number;
  readonly boundaryContactCount: number;
}

export interface MeasurementSurfaceLodV1 {
  readonly id: 'display' | 'collision-candidate';
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly grid: MeasurementSurfaceGridReportV1;
  readonly topology: MeasurementSurfaceTopologyReportV1;
}

export interface MeasurementSurfaceSectionGraphV1 {
  readonly passed: boolean;
  readonly vertexCount: number;
  readonly edgeCount: number;
  readonly loopCount: number;
  readonly containsAxisLoopCount: number;
  readonly selectedLoopVertexCount: number;
  readonly openVertexCount: number;
  readonly branchVertexCount: number;
  readonly maximumDegree: number;
  readonly selfIntersectingLoopCount: number;
}

export interface MeasurementSurfaceClosureCheckV1 {
  readonly id: 'height' | 'chest' | 'waist' | 'hip';
  readonly targetMm: number;
  readonly reconstructedMm: number;
  readonly absoluteResidualMm: number;
  readonly gridAllowanceMm: number;
  readonly sectionGraph: MeasurementSurfaceSectionGraphV1 | null;
  readonly passed: boolean;
}

export interface MeasurementSurfaceClosureReportV1 {
  readonly passed: boolean;
  readonly correctionApplied: false;
  readonly checks: readonly MeasurementSurfaceClosureCheckV1[];
}

export interface MeasurementWatertightSurfaceArtifactV1 {
  readonly version: typeof MEASUREMENT_WATERTIGHT_SURFACE_V1;
  readonly id: 'measurement-watertight-surface-v1';
  readonly revision: 'measurement-watertight-surface-v1.0.1';
  readonly units: 'm';
  readonly pose: BodyPoseKind;
  readonly sourceRevision: string;
  readonly frameRevision: MeasurementBodyFrameV2['revision'];
  readonly policy: MeasurementWatertightSurfacePolicyV1;
  readonly lods: {
    readonly display: MeasurementSurfaceLodV1;
    readonly collisionCandidate: MeasurementSurfaceLodV1;
  };
  readonly closure: MeasurementSurfaceClosureReportV1;
  readonly provenance: {
    readonly status: 'estimated';
    readonly sources: readonly [
      { readonly kind: 'generated'; readonly licenseId: 'LicenseRef-GRBPWR-Project-Owned' },
      { readonly kind: 'measurement-record'; readonly sourceRevision: string },
    ];
  };
  readonly claims: {
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
    readonly blockers: readonly [
      'self-intersection-not-evaluated',
      'runtime-collision-not-integrated',
    ];
  };
  readonly identity: {
    readonly exactBytesExposed: true;
    readonly cryptographicSeal: null;
    readonly persistedOrSealedEligible: false;
  };
}

export const DEFAULT_MEASUREMENT_WATERTIGHT_SURFACE_POLICY_V1: MeasurementWatertightSurfacePolicyV1 =
  Object.freeze({
    quantizationM: 0.0000001,
    paddingCells: 2,
    display: Object.freeze({
      cellSizeM: 0.04,
      maxCells: 750_000,
      maxVertices: 350_000,
      maxTriangles: 700_000,
      maxBytes: 14_000_000,
    }),
    collisionCandidate: Object.freeze({
      cellSizeM: 0.045,
      maxCells: 400_000,
      maxVertices: 200_000,
      maxTriangles: 400_000,
      maxBytes: 8_000_000,
    }),
  });

type Point = readonly [number, number, number];
type MutablePoint = [number, number, number];

const CUBE_OFFSETS: readonly Point[] = Object.freeze([
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
]);

// Freudenthal triangulation on the negative-X half. The positive-X table is its exact local-X
// reflection (0<->1, 3<->2, 4<->5, 7<->6). Both tables induce the same 0->7 / 1->6 diagonal on
// their X faces, so the switch at X=0 and every neighboring cube face remain conforming.
const NEGATIVE_X_TETRAHEDRA = Object.freeze([
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
] as const);

const POSITIVE_X_TETRAHEDRA = Object.freeze([
  [1, 4, 0, 7],
  [1, 0, 3, 7],
  [1, 3, 2, 7],
  [1, 2, 6, 7],
  [1, 6, 5, 7],
  [1, 5, 4, 7],
] as const);

function finitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} must be finite and > 0.`);
}

function validateLodPolicy(value: MeasurementSurfaceLodPolicyV1, name: string): void {
  finitePositive(value.cellSizeM, `${name}.cellSizeM`);
  for (const key of ['maxCells', 'maxVertices', 'maxTriangles', 'maxBytes'] as const) {
    finitePositive(value[key], `${name}.${key}`);
    if (!Number.isSafeInteger(value[key]))
      throw new RangeError(`${name}.${key} must be an integer.`);
  }
}

function snapshotPolicy(
  value: MeasurementWatertightSurfacePolicyV1 | undefined,
): MeasurementWatertightSurfacePolicyV1 {
  const policy = value ?? DEFAULT_MEASUREMENT_WATERTIGHT_SURFACE_POLICY_V1;
  finitePositive(policy.quantizationM, 'quantizationM');
  if (!Number.isSafeInteger(policy.paddingCells) || policy.paddingCells < 2) {
    throw new RangeError('paddingCells must be an integer >= 2.');
  }
  validateLodPolicy(policy.display, 'display');
  validateLodPolicy(policy.collisionCandidate, 'collisionCandidate');
  return Object.freeze({
    quantizationM: policy.quantizationM,
    paddingCells: policy.paddingCells,
    display: Object.freeze({ ...policy.display }),
    collisionCandidate: Object.freeze({ ...policy.collisionCandidate }),
  });
}

function length3(a: Point, b: Point = [0, 0, 0]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function smoothMinimum(a: number, b: number, radius: number): number {
  const h = Math.max(radius - Math.abs(a - b), 0) / radius;
  return Math.min(a, b) - (h * h * h * radius) / 6;
}

function ellipsoidField(point: Point, center: Point, radii: Point): number {
  const x = (point[0] - center[0]) / radii[0];
  const y = (point[1] - center[1]) / radii[1];
  const z = (point[2] - center[2]) / radii[2];
  return (Math.hypot(x, y, z) - 1) * Math.min(...radii);
}

function segmentField(point: Point, segment: MeasurementBodyFrameSegmentV2): number {
  const direction: MutablePoint = [
    segment.bM[0] - segment.aM[0],
    segment.bM[1] - segment.aM[1],
    segment.bM[2] - segment.aM[2],
  ];
  const segmentLength = length3(direction);
  direction[0] /= segmentLength;
  direction[1] /= segmentLength;
  direction[2] /= segmentLength;
  const relative: MutablePoint = [
    point[0] - segment.aM[0],
    point[1] - segment.aM[1],
    point[2] - segment.aM[2],
  ];
  const rawT =
    (relative[0] * direction[0] + relative[1] * direction[1] + relative[2] * direction[2]) /
    segmentLength;
  const t = Math.max(0, Math.min(1, rawT));
  const closest: MutablePoint = [
    segment.aM[0] + direction[0] * segmentLength * t,
    segment.aM[1] + direction[1] * segmentLength * t,
    segment.aM[2] + direction[2] * segmentLength * t,
  ];
  const side: MutablePoint = [direction[1], -direction[0], 0];
  const sideLength = Math.hypot(side[0], side[1]);
  side[0] /= sideLength;
  side[1] /= sideLength;
  const delta: MutablePoint = [point[0] - closest[0], point[1] - closest[1], point[2] - closest[2]];
  const sideRadius = segment.radiusAM[0] + (segment.radiusBM[0] - segment.radiusAM[0]) * t;
  const depthRadius = segment.radiusAM[1] + (segment.radiusBM[1] - segment.radiusAM[1]) * t;
  const sideDistance = (delta[0] * side[0] + delta[1] * side[1]) / sideRadius;
  const depthDistance = delta[2] / depthRadius;
  const axialDistance =
    rawT < 0
      ? (-rawT * segmentLength) / Math.min(sideRadius, depthRadius)
      : rawT > 1
        ? ((rawT - 1) * segmentLength) / Math.min(sideRadius, depthRadius)
        : 0;
  return (
    (Math.hypot(sideDistance, depthDistance, axialDistance) - 1) * Math.min(sideRadius, depthRadius)
  );
}

function torsoField(point: Point, frame: MeasurementBodyFrameV2): number {
  const stations = frame.torsoStations;
  let lower = stations[0];
  let upper = stations[stations.length - 1];
  for (let index = 0; index < stations.length - 1; index += 1) {
    if (point[1] >= stations[index].yM && point[1] <= stations[index + 1].yM) {
      lower = stations[index];
      upper = stations[index + 1];
      break;
    }
  }
  const span = upper.yM - lower.yM;
  const rawT = span === 0 ? 0 : (point[1] - lower.yM) / span;
  const t = Math.max(0, Math.min(1, rawT));
  const halfWidth = lower.halfWidthM + (upper.halfWidthM - lower.halfWidthM) * t;
  const halfDepth = lower.halfDepthM + (upper.halfDepthM - lower.halfDepthM) * t;
  const axial =
    point[1] < stations[0].yM
      ? (stations[0].yM - point[1]) / Math.min(halfWidth, halfDepth)
      : point[1] > stations[stations.length - 1].yM
        ? (point[1] - stations[stations.length - 1].yM) / Math.min(halfWidth, halfDepth)
        : 0;
  return (
    (Math.hypot(point[0] / halfWidth, point[2] / halfDepth, axial) - 1) *
    Math.min(halfWidth, halfDepth)
  );
}

function createField(frame: MeasurementBodyFrameV2): (point: Point) => number {
  return (point) => {
    let value = torsoField(point, frame);
    for (const segment of frame.segments) {
      value = smoothMinimum(value, segmentField(point, segment), frame.smoothUnionRadiusM);
    }
    for (const ellipsoid of frame.ellipsoids) {
      value = smoothMinimum(
        value,
        ellipsoidField(point, ellipsoid.centerM, ellipsoid.radiiM),
        frame.smoothUnionRadiusM,
      );
    }
    return value;
  };
}

function frameBounds(frame: MeasurementBodyFrameV2): readonly [Point, Point] {
  const minimum: MutablePoint = [Infinity, Infinity, Infinity];
  const maximum: MutablePoint = [-Infinity, -Infinity, -Infinity];
  const include = (center: Point, radii: Point) => {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], center[axis] - radii[axis]);
      maximum[axis] = Math.max(maximum[axis], center[axis] + radii[axis]);
    }
  };
  for (const station of frame.torsoStations) {
    include([0, station.yM, 0], [station.halfWidthM, frame.smoothUnionRadiusM, station.halfDepthM]);
  }
  for (const segment of frame.segments) {
    const radius = Math.max(...segment.radiusAM, ...segment.radiusBM) + frame.smoothUnionRadiusM;
    include(segment.aM, [radius, radius, radius]);
    include(segment.bM, [radius, radius, radius]);
  }
  for (const ellipsoid of frame.ellipsoids) {
    include(ellipsoid.centerM, [
      ellipsoid.radiiM[0] + frame.smoothUnionRadiusM,
      ellipsoid.radiiM[1] + frame.smoothUnionRadiusM,
      ellipsoid.radiiM[2] + frame.smoothUnionRadiusM,
    ]);
  }
  return [minimum, maximum];
}

interface Grid {
  readonly origin: Point;
  readonly cells: readonly [number, number, number];
  readonly cellSizeM: number;
  readonly values: Float64Array;
}

function createGrid(
  frame: MeasurementBodyFrameV2,
  field: (point: Point) => number,
  policy: MeasurementSurfaceLodPolicyV1,
  paddingCells: number,
): { grid: Grid; boundaryContactCount: number } {
  const [minimum, maximum] = frameBounds(frame);
  const cell = policy.cellSizeM;
  const extentX = Math.ceil(
    (Math.max(Math.abs(minimum[0]), Math.abs(maximum[0])) + paddingCells * cell) / cell,
  );
  const extentZ = Math.ceil(
    (Math.max(Math.abs(minimum[2]), Math.abs(maximum[2])) + paddingCells * cell) / cell,
  );
  const minY = Math.floor((minimum[1] - paddingCells * cell) / cell);
  const maxY = Math.ceil((maximum[1] + paddingCells * cell) / cell);
  const cells: readonly [number, number, number] = [extentX * 2, maxY - minY, extentZ * 2];
  const cellCount = cells[0] * cells[1] * cells[2];
  if (!Number.isSafeInteger(cellCount) || cellCount > policy.maxCells) {
    throw new RangeError(`Grid cell cap exceeded: ${cellCount} > ${policy.maxCells}.`);
  }
  const origin: Point = [-extentX * cell, minY * cell, -extentZ * cell];
  const nx = cells[0] + 1;
  const ny = cells[1] + 1;
  const nz = cells[2] + 1;
  const values = new Float64Array(nx * ny * nz);
  let boundaryContactCount = 0;
  for (let z = 0; z < nz; z += 1) {
    for (let y = 0; y < ny; y += 1) {
      for (let x = 0; x < nx; x += 1) {
        const value = field([origin[0] + x * cell, origin[1] + y * cell, origin[2] + z * cell]);
        if (!Number.isFinite(value)) throw new Error('Implicit field produced a non-finite value.');
        values[x + nx * (y + ny * z)] = value;
        if (
          value <= 0 &&
          (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1)
        ) {
          boundaryContactCount += 1;
        }
      }
    }
  }
  if (boundaryContactCount > 0) {
    throw new Error(
      `Implicit surface touches the extraction boundary at ${boundaryContactCount} nodes.`,
    );
  }
  return { grid: { origin, cells, cellSizeM: cell, values }, boundaryContactCount };
}

function quantize(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function orientTriangleSoupConsistently(positions: readonly number[], indices: number[]): void {
  const triangleCount = indices.length / 3;
  const edges = new Map<string, { triangle: number; direction: 1 | -1 }[]>();
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 3;
    for (const [u, v] of [
      [indices[offset], indices[offset + 1]],
      [indices[offset + 1], indices[offset + 2]],
      [indices[offset + 2], indices[offset]],
    ] as const) {
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      const occurrences = edges.get(key) ?? [];
      occurrences.push({ triangle, direction: u < v ? 1 : -1 });
      edges.set(key, occurrences);
    }
  }
  const adjacency = Array.from({ length: triangleCount }, () => [] as [number, boolean][]);
  for (const occurrences of edges.values()) {
    if (occurrences.length !== 2) continue;
    const [a, b] = occurrences;
    const needsOppositeFlip = a.direction === b.direction;
    adjacency[a.triangle].push([b.triangle, needsOppositeFlip]);
    adjacency[b.triangle].push([a.triangle, needsOppositeFlip]);
  }
  const flips: (boolean | undefined)[] = new Array(triangleCount);
  for (let start = 0; start < triangleCount; start += 1) {
    if (flips[start] !== undefined) continue;
    flips[start] = false;
    const pending = [start];
    while (pending.length > 0) {
      const current = pending.pop()!;
      for (const [next, xor] of adjacency[current]) {
        const expected = flips[current]! !== xor;
        if (flips[next] === undefined) {
          flips[next] = expected;
          pending.push(next);
        } else if (flips[next] !== expected) {
          throw new Error('Triangle orientation constraints are contradictory.');
        }
      }
    }
  }
  const applyFlips = () => {
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      if (!flips[triangle]) continue;
      const offset = triangle * 3;
      [indices[offset + 1], indices[offset + 2]] = [indices[offset + 2], indices[offset + 1]];
    }
  };
  applyFlips();
  let volume = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset] * 3;
    const b = indices[offset + 1] * 3;
    const c = indices[offset + 2] * 3;
    volume +=
      (positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) +
        positions[a + 1] * (positions[b + 2] * positions[c] - positions[b] * positions[c + 2]) +
        positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c])) /
      6;
  }
  if (volume < 0) {
    for (let offset = 0; offset < indices.length; offset += 3) {
      [indices[offset + 1], indices[offset + 2]] = [indices[offset + 2], indices[offset + 1]];
    }
  }
}

function extractMesh(
  grid: Grid,
  field: (point: Point) => number,
  policy: MeasurementSurfaceLodPolicyV1,
  quantizationM: number,
): MeasurementSurfaceMeshV1 {
  const [cx, cy, cz] = grid.cells;
  const nx = cx + 1;
  const ny = cy + 1;
  const nodeId = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  const positions: number[] = [];
  const indices: number[] = [];
  const edgeCache = new Map<string, number>();
  const pointAt = (x: number, y: number, z: number): Point => [
    grid.origin[0] + x * grid.cellSizeM,
    grid.origin[1] + y * grid.cellSizeM,
    grid.origin[2] + z * grid.cellSizeM,
  ];
  const edgeVertex = (aId: number, bId: number, a: Point, b: Point, fa: number, fb: number) => {
    const key = aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
    const cached = edgeCache.get(key);
    if (cached !== undefined) return cached;
    const denominator = fa - fb;
    const t = denominator === 0 ? 0.5 : Math.max(0, Math.min(1, fa / denominator));
    const index = positions.length / 3;
    positions.push(
      quantize(a[0] + (b[0] - a[0]) * t, quantizationM),
      quantize(a[1] + (b[1] - a[1]) * t, quantizationM),
      quantize(a[2] + (b[2] - a[2]) * t, quantizationM),
    );
    if (index + 1 > policy.maxVertices) {
      throw new RangeError(`Vertex cap exceeded: ${index + 1} > ${policy.maxVertices}.`);
    }
    edgeCache.set(key, index);
    return index;
  };
  const orientAndAdd = (a: number, b: number, c: number) => {
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3];
    const by = positions[b * 3 + 1];
    const bz = positions[b * 3 + 2];
    const cxp = positions[c * 3];
    const cyp = positions[c * 3 + 1];
    const czp = positions[c * 3 + 2];
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cxp - ax;
    const vy = cyp - ay;
    const vz = czp - az;
    const normal: Point = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const centroid: Point = [(ax + bx + cxp) / 3, (ay + by + cyp) / 3, (az + bz + czp) / 3];
    const epsilon = grid.cellSizeM * 0.2;
    const gradient: Point = [
      field([centroid[0] + epsilon, centroid[1], centroid[2]]) -
        field([centroid[0] - epsilon, centroid[1], centroid[2]]),
      field([centroid[0], centroid[1] + epsilon, centroid[2]]) -
        field([centroid[0], centroid[1] - epsilon, centroid[2]]),
      field([centroid[0], centroid[1], centroid[2] + epsilon]) -
        field([centroid[0], centroid[1], centroid[2] - epsilon]),
    ];
    if (normal[0] * gradient[0] + normal[1] * gradient[1] + normal[2] * gradient[2] < 0) {
      indices.push(a, c, b);
    } else {
      indices.push(a, b, c);
    }
    if (indices.length / 3 > policy.maxTriangles) {
      throw new RangeError(
        `Triangle cap exceeded: ${indices.length / 3} > ${policy.maxTriangles}.`,
      );
    }
  };

  for (let z = 0; z < cz; z += 1) {
    for (let y = 0; y < cy; y += 1) {
      for (let x = 0; x < cx; x += 1) {
        const ids = CUBE_OFFSETS.map(([dx, dy, dz]) => nodeId(x + dx, y + dy, z + dz));
        const points = CUBE_OFFSETS.map(([dx, dy, dz]) => pointAt(x + dx, y + dy, z + dz));
        // A fixed non-grid-aligned iso offset avoids tetrahedra meeting exactly at a zero-valued
        // lattice node. That otherwise creates distinct cached edges at the same point.
        const values = ids.map((id) => grid.values[id] - grid.cellSizeM * 0.0001);
        const tetrahedra = x < cx / 2 ? NEGATIVE_X_TETRAHEDRA : POSITIVE_X_TETRAHEDRA;
        for (const tetrahedron of tetrahedra) {
          const inside = tetrahedron.filter((index) => values[index] < 0);
          if (inside.length === 0 || inside.length === 4) continue;
          const outside = tetrahedron.filter((index) => values[index] >= 0);
          const crossing = (a: number, b: number) =>
            edgeVertex(ids[a], ids[b], points[a], points[b], values[a], values[b]);
          if (inside.length === 1) {
            orientAndAdd(
              crossing(inside[0], outside[0]),
              crossing(inside[0], outside[1]),
              crossing(inside[0], outside[2]),
            );
          } else if (inside.length === 3) {
            orientAndAdd(
              crossing(outside[0], inside[0]),
              crossing(outside[0], inside[1]),
              crossing(outside[0], inside[2]),
            );
          } else {
            const a = crossing(inside[0], outside[0]);
            const b = crossing(inside[0], outside[1]);
            const c = crossing(inside[1], outside[0]);
            const d = crossing(inside[1], outside[1]);
            orientAndAdd(a, b, c);
            orientAndAdd(b, d, c);
          }
        }
      }
    }
  }
  orientTriangleSoupConsistently(positions, indices);
  const positionBytes = new Float32Array(positions);
  const indexBytes = new Uint32Array(indices);
  const byteLength = positionBytes.byteLength + indexBytes.byteLength;
  if (byteLength > policy.maxBytes) {
    throw new RangeError(`Mesh byte cap exceeded: ${byteLength} > ${policy.maxBytes}.`);
  }
  return {
    positions: positionBytes,
    indices: indexBytes,
    vertexCount: positionBytes.length / 3,
    triangleCount: indexBytes.length / 3,
    byteLength,
  };
}

function validateTopology(mesh: MeasurementSurfaceMeshV1): MeasurementSurfaceTopologyReportV1 {
  const blockers: string[] = [];
  let finitePositions = true;
  for (const value of mesh.positions) finitePositions &&= Number.isFinite(value);
  let validIndices = mesh.indices.length % 3 === 0;
  let degenerateTriangleCount = 0;
  let duplicateTriangleCount = 0;
  const faceKeys = new Set<string>();
  const edgeCounts = new Map<string, number>();
  const edgeOrientationSums = new Map<string, number>();
  const adjacency = Array.from({ length: mesh.vertexCount }, () => new Set<number>());
  const links = Array.from({ length: mesh.vertexCount }, () => new Map<number, Set<number>>());
  let signedVolumeM3 = 0;
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const a = mesh.indices[offset];
    const b = mesh.indices[offset + 1];
    const c = mesh.indices[offset + 2];
    if (a >= mesh.vertexCount || b >= mesh.vertexCount || c >= mesh.vertexCount) {
      validIndices = false;
      continue;
    }
    const faceKey = [a, b, c].sort((left, right) => left - right).join(':');
    if (faceKeys.has(faceKey)) duplicateTriangleCount += 1;
    faceKeys.add(faceKey);
    const ax = mesh.positions[a * 3];
    const ay = mesh.positions[a * 3 + 1];
    const az = mesh.positions[a * 3 + 2];
    const bx = mesh.positions[b * 3];
    const by = mesh.positions[b * 3 + 1];
    const bz = mesh.positions[b * 3 + 2];
    const cx = mesh.positions[c * 3];
    const cy = mesh.positions[c * 3 + 1];
    const cz = mesh.positions[c * 3 + 2];
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (!(area2 > 0)) degenerateTriangleCount += 1;
    signedVolumeM3 +=
      (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const edgeKey = u < v ? `${u}:${v}` : `${v}:${u}`;
      edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) ?? 0) + 1);
      edgeOrientationSums.set(edgeKey, (edgeOrientationSums.get(edgeKey) ?? 0) + (u < v ? 1 : -1));
      adjacency[u].add(v);
      adjacency[v].add(u);
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
  const nonTwoManifoldEdgeCount = [...edgeCounts.values()].filter((count) => count !== 2).length;
  const inconsistentWindingEdgeCount = [...edgeOrientationSums.values()].filter(
    (sum) => sum !== 0,
  ).length;
  const visited = new Set<number>();
  let connectedComponentCount = 0;
  const connectedComponentVertexCounts: number[] = [];
  const connectedComponentBoundsM: { min: MutablePoint; max: MutablePoint }[] = [];
  for (let start = 0; start < adjacency.length; start += 1) {
    if (visited.has(start)) continue;
    connectedComponentCount += 1;
    const pending = [start];
    visited.add(start);
    let componentVertexCount = 0;
    const componentMinimum: MutablePoint = [Infinity, Infinity, Infinity];
    const componentMaximum: MutablePoint = [-Infinity, -Infinity, -Infinity];
    while (pending.length > 0) {
      const current = pending.pop()!;
      componentVertexCount += 1;
      for (let axis = 0; axis < 3; axis += 1) {
        componentMinimum[axis] = Math.min(
          componentMinimum[axis],
          mesh.positions[current * 3 + axis],
        );
        componentMaximum[axis] = Math.max(
          componentMaximum[axis],
          mesh.positions[current * 3 + axis],
        );
      }
      for (const next of adjacency[current]) {
        if (!visited.has(next)) {
          visited.add(next);
          pending.push(next);
        }
      }
    }
    connectedComponentVertexCounts.push(componentVertexCount);
    connectedComponentBoundsM.push({ min: componentMinimum, max: componentMaximum });
  }
  let nonManifoldVertexCount = 0;
  for (const link of links) {
    if (link.size === 0 || [...link.values()].some((neighbors) => neighbors.size !== 2)) {
      nonManifoldVertexCount += 1;
      continue;
    }
    const [start] = link.keys();
    const linkVisited = new Set<number>([start]);
    const pending = [start];
    while (pending.length > 0) {
      for (const next of link.get(pending.pop()!) ?? []) {
        if (!linkVisited.has(next)) {
          linkVisited.add(next);
          pending.push(next);
        }
      }
    }
    if (linkVisited.size !== link.size) nonManifoldVertexCount += 1;
  }
  const eulerCharacteristic = mesh.vertexCount - edgeCounts.size + mesh.triangleCount;
  const outwardWinding = signedVolumeM3 > 0 && inconsistentWindingEdgeCount === 0;
  if (!finitePositions) blockers.push('non-finite-position');
  if (!validIndices) blockers.push('invalid-index');
  if (degenerateTriangleCount > 0) blockers.push('degenerate-triangle');
  if (duplicateTriangleCount > 0) blockers.push('duplicate-triangle');
  if (nonTwoManifoldEdgeCount > 0) blockers.push('edge-incidence-not-two');
  if (inconsistentWindingEdgeCount > 0) blockers.push('inconsistent-edge-winding');
  if (connectedComponentCount !== 1) blockers.push('not-one-connected-component');
  if (eulerCharacteristic !== 2) blockers.push('euler-characteristic-not-two');
  if (!outwardWinding) blockers.push('non-positive-signed-volume');
  if (nonManifoldVertexCount > 0) blockers.push('non-manifold-vertex-link');
  return Object.freeze({
    passed: blockers.length === 0,
    finitePositions,
    validIndices,
    degenerateTriangleCount,
    duplicateTriangleCount,
    nonTwoManifoldEdgeCount,
    inconsistentWindingEdgeCount,
    connectedComponentCount,
    connectedComponentVertexCounts: Object.freeze(connectedComponentVertexCounts),
    connectedComponentBoundsM: Object.freeze(
      connectedComponentBoundsM.map(({ min, max }) =>
        Object.freeze({
          min: Object.freeze([...min]) as Point,
          max: Object.freeze([...max]) as Point,
        }),
      ),
    ),
    eulerCharacteristic,
    signedVolumeM3,
    outwardWinding,
    nonManifoldVertexCount,
    selfIntersection: 'not-evaluated',
    blockers: Object.freeze(blockers),
  });
}

function planeSectionGraph(
  mesh: MeasurementSurfaceMeshV1,
  planeY: number,
): { perimeterM: number; report: MeasurementSurfaceSectionGraphV1 } {
  const segments: [Point, Point][] = [];
  const intersection = (a: Point, b: Point): Point | null => {
    const da = a[1] - planeY;
    const db = b[1] - planeY;
    if ((da < 0 && db < 0) || (da > 0 && db > 0) || (da === 0 && db === 0)) return null;
    if (da === db) return null;
    const t = -da / (db - da);
    if (t < 0 || t > 1) return null;
    return [a[0] + (b[0] - a[0]) * t, planeY, a[2] + (b[2] - a[2]) * t];
  };
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const vertices = [0, 1, 2].map((index): Point => {
      const vertex = mesh.indices[offset + index] * 3;
      return [mesh.positions[vertex], mesh.positions[vertex + 1], mesh.positions[vertex + 2]];
    });
    const points = [
      intersection(vertices[0], vertices[1]),
      intersection(vertices[1], vertices[2]),
      intersection(vertices[2], vertices[0]),
    ].filter((point): point is Point => point !== null);
    const unique = points.filter(
      (point, index) => points.findIndex((candidate) => length3(point, candidate) < 1e-8) === index,
    );
    if (unique.length === 2 && length3(unique[0], unique[1]) > 1e-8) {
      segments.push([unique[0], unique[1]]);
    }
  }
  const key = (point: Point) => `${Math.round(point[0] * 1e7)}:${Math.round(point[2] * 1e7)}`;
  const points = new Map<string, Point>();
  const adjacency = new Map<string, Set<string>>();
  const edges = new Set<string>();
  for (const [a, b] of segments) {
    const aKey = key(a);
    const bKey = key(b);
    if (aKey === bKey) continue;
    const edgeKey = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
    if (edges.has(edgeKey)) continue;
    edges.add(edgeKey);
    points.set(aKey, a);
    points.set(bKey, b);
    if (!adjacency.has(aKey)) adjacency.set(aKey, new Set());
    if (!adjacency.has(bKey)) adjacency.set(bKey, new Set());
    adjacency.get(aKey)!.add(bKey);
    adjacency.get(bKey)!.add(aKey);
  }
  const degrees = [...adjacency.values()].map((neighbors) => neighbors.size);
  const openVertexCount = degrees.filter((degree) => degree < 2).length;
  const branchVertexCount = degrees.filter((degree) => degree > 2).length;
  const maximumDegree = Math.max(0, ...degrees);
  const loops: Point[][] = [];
  const visited = new Set<string>();
  if (openVertexCount === 0 && branchVertexCount === 0) {
    for (const start of [...adjacency.keys()].sort()) {
      if (visited.has(start)) continue;
      const loop: Point[] = [];
      let previous: string | null = null;
      let current = start;
      for (let step = 0; step <= adjacency.size; step += 1) {
        if (current === start && step > 0) break;
        if (visited.has(current)) {
          loop.length = 0;
          break;
        }
        visited.add(current);
        loop.push(points.get(current)!);
        const neighbors = [...(adjacency.get(current) ?? [])].sort();
        const next = neighbors.find((candidate) => candidate !== previous);
        if (!next) {
          loop.length = 0;
          break;
        }
        previous = current;
        current = next;
      }
      if (current === start && loop.length >= 3) loops.push(loop);
    }
  }
  const orientation = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
  const properIntersection = (a: Point, b: Point, c: Point, d: Point) => {
    const abC = orientation(a, b, c);
    const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a);
    const cdB = orientation(c, d, b);
    return abC * abD < 0 && cdA * cdB < 0;
  };
  const isSimple = (loop: readonly Point[]) => {
    for (let left = 0; left < loop.length; left += 1) {
      const leftNext = (left + 1) % loop.length;
      for (let right = left + 1; right < loop.length; right += 1) {
        const rightNext = (right + 1) % loop.length;
        if (left === right || leftNext === right || rightNext === left) continue;
        if (properIntersection(loop[left], loop[leftNext], loop[right], loop[rightNext])) {
          return false;
        }
      }
    }
    return true;
  };
  const simpleLoops = loops.filter(isSimple);
  const selfIntersectingLoopCount = loops.length - simpleLoops.length;
  const containsAxis = (loop: readonly Point[]) => {
    let inside = false;
    for (let index = 0, previous = loop.length - 1; index < loop.length; previous = index++) {
      const a = loop[index];
      const b = loop[previous];
      if (a[2] > 0 !== b[2] > 0 && 0 < ((b[0] - a[0]) * -a[2]) / (b[2] - a[2]) + a[0]) {
        inside = !inside;
      }
    }
    return inside;
  };
  const axisLoops = simpleLoops.filter(containsAxis);
  const selected = axisLoops.length === 1 ? axisLoops[0] : null;
  let perimeterM = 0;
  if (selected) {
    for (let index = 0; index < selected.length; index += 1) {
      perimeterM += length3(selected[index], selected[(index + 1) % selected.length]);
    }
  }
  const passed =
    adjacency.size > 0 &&
    openVertexCount === 0 &&
    branchVertexCount === 0 &&
    selfIntersectingLoopCount === 0 &&
    loops.length === simpleLoops.length &&
    axisLoops.length === 1 &&
    selected !== null;
  return {
    perimeterM,
    report: Object.freeze({
      passed,
      vertexCount: adjacency.size,
      edgeCount: edges.size,
      loopCount: loops.length,
      containsAxisLoopCount: axisLoops.length,
      selectedLoopVertexCount: selected?.length ?? 0,
      openVertexCount,
      branchVertexCount,
      maximumDegree,
      selfIntersectingLoopCount,
    }),
  };
}

function closureReport(
  mesh: MeasurementSurfaceMeshV1,
  frame: MeasurementBodyFrameV2,
  cellSizeM: number,
): MeasurementSurfaceClosureReportV1 {
  let maximumY = -Infinity;
  for (let index = 1; index < mesh.positions.length; index += 3) {
    maximumY = Math.max(maximumY, mesh.positions[index]);
  }
  const station = (id: 'chest' | 'waist' | 'hip') =>
    frame.torsoStations.find((candidate) => candidate.id === id)!;
  const checks: MeasurementSurfaceClosureCheckV1[] = [
    {
      id: 'height',
      targetMm: frame.measurements.heightMm,
      reconstructedMm: maximumY * 1000,
      absoluteResidualMm: Math.abs(maximumY * 1000 - frame.measurements.heightMm),
      gridAllowanceMm: cellSizeM * 2000,
      sectionGraph: null,
      passed: Math.abs(maximumY * 1000 - frame.measurements.heightMm) <= cellSizeM * 2000,
    },
  ];
  for (const [id, key] of [
    ['chest', 'chestCircumferenceMm'],
    ['waist', 'waistCircumferenceMm'],
    ['hip', 'hipCircumferenceMm'],
  ] as const) {
    const section = planeSectionGraph(mesh, station(id).yM);
    const reconstructedMm = section.perimeterM * 1000;
    const targetMm = frame.measurements[key];
    const absoluteResidualMm = Math.abs(reconstructedMm - targetMm);
    const gridAllowanceMm = cellSizeM * 4000;
    checks.push({
      id,
      targetMm,
      reconstructedMm,
      absoluteResidualMm,
      gridAllowanceMm,
      sectionGraph: section.report,
      passed: section.report.passed && reconstructedMm > 0 && absoluteResidualMm <= gridAllowanceMm,
    });
  }
  return Object.freeze({
    passed: checks.every((check) => check.passed),
    correctionApplied: false,
    checks: Object.freeze(checks.map((check) => Object.freeze(check))),
  });
}

function createLod(
  id: MeasurementSurfaceLodV1['id'],
  frame: MeasurementBodyFrameV2,
  field: (point: Point) => number,
  policy: MeasurementSurfaceLodPolicyV1,
  fullPolicy: MeasurementWatertightSurfacePolicyV1,
): MeasurementSurfaceLodV1 {
  const { grid, boundaryContactCount } = createGrid(frame, field, policy, fullPolicy.paddingCells);
  const mesh = extractMesh(grid, field, policy, fullPolicy.quantizationM);
  const topology = validateTopology(mesh);
  if (!topology.passed) {
    throw new Error(
      `Topology gate failed for ${id}: ${topology.blockers.join(', ')} (${JSON.stringify(topology)}).`,
    );
  }
  return Object.freeze({
    id,
    mesh,
    grid: Object.freeze({
      cellSizeM: grid.cellSizeM,
      cells: grid.cells,
      cellCount: grid.cells[0] * grid.cells[1] * grid.cells[2],
      boundaryContactCount,
    }),
    topology,
  });
}

export function createMeasurementWatertightSurfaceV1(options: {
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly sourceRevision: string;
  readonly pose?: BodyPoseKind;
  readonly policy?: MeasurementWatertightSurfacePolicyV1;
}): MeasurementWatertightSurfaceArtifactV1 {
  const policy = snapshotPolicy(options.policy);
  const frame = createMeasurementBodyFrameV2(options);
  const field = createField(frame);
  const display = createLod('display', frame, field, policy.display, policy);
  const collisionCandidate = createLod(
    'collision-candidate',
    frame,
    field,
    policy.collisionCandidate,
    policy,
  );
  const closure = closureReport(display.mesh, frame, policy.display.cellSizeM);
  if (!closure.passed) throw new Error('Measurement closure gate failed.');
  return Object.freeze({
    version: MEASUREMENT_WATERTIGHT_SURFACE_V1,
    id: 'measurement-watertight-surface-v1',
    revision: 'measurement-watertight-surface-v1.0.1',
    units: 'm',
    pose: frame.pose.kind,
    sourceRevision: frame.sourceRevision,
    frameRevision: frame.revision,
    policy,
    lods: Object.freeze({ display, collisionCandidate }),
    closure,
    provenance: Object.freeze({
      status: 'estimated',
      sources: Object.freeze([
        Object.freeze({
          kind: 'generated',
          licenseId: 'LicenseRef-GRBPWR-Project-Owned',
        }),
        Object.freeze({ kind: 'measurement-record', sourceRevision: frame.sourceRevision }),
      ] as const),
    }),
    claims: Object.freeze({
      fitClaimEligible: false,
      runtimeCollisionEligible: false,
      collisionCandidateEligible: false,
      blockers: Object.freeze([
        'self-intersection-not-evaluated',
        'runtime-collision-not-integrated',
      ] as const),
    }),
    identity: Object.freeze({
      exactBytesExposed: true,
      cryptographicSeal: null,
      persistedOrSealedEligible: false,
    }),
  });
}
