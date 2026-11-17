export const BETA_SKIRT_EXACT_SWEPT_BODY_AUDIT_V1 = 'beta-skirt-exact-swept-body-audit/1' as const;

const GRID_CELL_SIZE_M = 0.04;
const MAXIMUM_SEGMENT_TRIANGLE_TESTS = 2_000_000;
const MAXIMUM_RETAINED_WITNESSES = 256;
const PARALLEL_EPSILON = 1e-10;
const COPLANAR_DISTANCE_EPSILON_M = 1e-8;
const START_TIME_EPSILON = 1e-8;

export type BetaSkirtExactSweptBodyWitnessV1 = Readonly<{
  vertexIndex: number;
  bodyTriangleIndex: number;
  kind: 'exact-crossing' | 'ambiguous-coplanar';
  segmentTime: number | null;
  barycentricU: number | null;
  barycentricV: number | null;
  startM: readonly [number, number, number];
  endM: readonly [number, number, number];
}>;

export type BetaSkirtExactSweptBodyAuditReportV1 = Readonly<{
  version: typeof BETA_SKIRT_EXACT_SWEPT_BODY_AUDIT_V1;
  status: 'clear' | 'blocked';
  counts: Readonly<{
    garmentVertexCount: number;
    bodyVertexCount: number;
    bodyTriangleCount: number;
    exactSegmentTriangleTests: number;
    exactCrossingCount: number;
    ambiguousCoplanarCount: number;
  }>;
  policy: Readonly<{
    gridCellSizeM: typeof GRID_CELL_SIZE_M;
    maximumSegmentTriangleTests: typeof MAXIMUM_SEGMENT_TRIANGLE_TESTS;
    maximumRetainedWitnesses: typeof MAXIMUM_RETAINED_WITNESSES;
    parallelEpsilon: typeof PARALLEL_EPSILON;
    coplanarDistanceEpsilonM: typeof COPLANAR_DISTANCE_EPSILON_M;
    startTimeEpsilon: typeof START_TIME_EPSILON;
  }>;
  capHit: boolean;
  witnesses: readonly BetaSkirtExactSweptBodyWitnessV1[];
  witnessesTruncated: boolean;
  claims: Readonly<{
    previousToCurrentVertexSegmentsEvaluated: true;
    exactBodyTrianglesUsed: true;
    startOnlyContactsExcluded: true;
    toleranceChanged: false;
    collisionPolicyChanged: false;
    collisionAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
}>;

type Input = Readonly<{
  previousPositionsInvMass: Float32Array;
  currentPositionsInvMass: Float32Array;
  bodyPositionsM: Float32Array;
  bodyTriangles: Uint32Array;
}>;

type Grid = Readonly<{
  minimum: readonly [number, number, number];
  dimensions: readonly [number, number, number];
  cells: ReadonlyMap<number, readonly number[]>;
}>;

function finiteFloat32(values: Float32Array): boolean {
  for (const value of values) if (!Number.isFinite(value)) return false;
  return true;
}

function snapshot(source: Input) {
  if (
    !(source.previousPositionsInvMass instanceof Float32Array) ||
    !(source.currentPositionsInvMass instanceof Float32Array) ||
    !(source.bodyPositionsM instanceof Float32Array) ||
    !(source.bodyTriangles instanceof Uint32Array) ||
    source.currentPositionsInvMass.length === 0 ||
    source.currentPositionsInvMass.length % 4 !== 0 ||
    source.previousPositionsInvMass.length !== source.currentPositionsInvMass.length ||
    source.bodyPositionsM.length === 0 ||
    source.bodyPositionsM.length % 3 !== 0 ||
    source.bodyTriangles.length === 0 ||
    source.bodyTriangles.length % 3 !== 0 ||
    !finiteFloat32(source.previousPositionsInvMass) ||
    !finiteFloat32(source.currentPositionsInvMass) ||
    !finiteFloat32(source.bodyPositionsM)
  )
    throw new TypeError('Exact swept-body audit input shape is invalid.');
  const bodyVertexCount = source.bodyPositionsM.length / 3;
  for (const index of source.bodyTriangles)
    if (index >= bodyVertexCount)
      throw new RangeError('Exact swept-body audit body index is out of range.');
  return Object.freeze({
    previousPositionsInvMass: new Float32Array(source.previousPositionsInvMass),
    currentPositionsInvMass: new Float32Array(source.currentPositionsInvMass),
    bodyPositionsM: new Float32Array(source.bodyPositionsM),
    bodyTriangles: new Uint32Array(source.bodyTriangles),
  });
}

function createGrid(positions: Float32Array, triangles: Uint32Array): Grid {
  const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
  const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1)
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, positions[vertex * 3 + axis]!);
      maximum[axis] = Math.max(maximum[axis]!, positions[vertex * 3 + axis]!);
    }
  const dimensions = maximum.map((value, axis) =>
    Math.max(1, Math.ceil((value - minimum[axis]!) / GRID_CELL_SIZE_M) + 1),
  ) as [number, number, number];
  const mutable = new Map<number, number[]>();
  const key = (x: number, y: number, z: number) => (z * dimensions[1]! + y) * dimensions[0]! + x;
  for (let triangle = 0; triangle < triangles.length / 3; triangle += 1) {
    const triangleMinimum: [number, number, number] = [Infinity, Infinity, Infinity];
    const triangleMaximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = triangles[triangle * 3 + corner]!;
      for (let axis = 0; axis < 3; axis += 1) {
        const value = positions[vertex * 3 + axis]!;
        triangleMinimum[axis] = Math.min(triangleMinimum[axis]!, value);
        triangleMaximum[axis] = Math.max(triangleMaximum[axis]!, value);
      }
    }
    const first = triangleMinimum.map((value, axis) =>
      Math.max(0, Math.floor((value - minimum[axis]!) / GRID_CELL_SIZE_M)),
    );
    const last = triangleMaximum.map((value, axis) =>
      Math.min(dimensions[axis]! - 1, Math.floor((value - minimum[axis]!) / GRID_CELL_SIZE_M)),
    );
    for (let z = first[2]!; z <= last[2]!; z += 1)
      for (let y = first[1]!; y <= last[1]!; y += 1)
        for (let x = first[0]!; x <= last[0]!; x += 1) {
          const cellKey = key(x, y, z);
          const values = mutable.get(cellKey);
          if (values) values.push(triangle);
          else mutable.set(cellKey, [triangle]);
        }
  }
  return Object.freeze({
    minimum: Object.freeze(minimum),
    dimensions: Object.freeze(dimensions),
    cells: mutable,
  });
}

export function evaluateBetaSkirtExactSweptBodyAuditV1(
  source: Input,
): BetaSkirtExactSweptBodyAuditReportV1 {
  const input = snapshot(source);
  const garmentVertexCount = input.currentPositionsInvMass.length / 4;
  const bodyVertexCount = input.bodyPositionsM.length / 3;
  const bodyTriangleCount = input.bodyTriangles.length / 3;
  const grid = createGrid(input.bodyPositionsM, input.bodyTriangles);
  const witnesses: BetaSkirtExactSweptBodyWitnessV1[] = [];
  let witnessesTruncated = false;
  let exactSegmentTriangleTests = 0;
  let exactCrossingCount = 0;
  let ambiguousCoplanarCount = 0;
  let capHit = false;
  const retain = (witness: BetaSkirtExactSweptBodyWitnessV1) => {
    if (witnesses.length < MAXIMUM_RETAINED_WITNESSES) witnesses.push(Object.freeze(witness));
    else witnessesTruncated = true;
  };
  const [dx, dy] = grid.dimensions;
  const key = (x: number, y: number, z: number) => (z * dy + y) * dx + x;

  outer: for (let vertex = 0; vertex < garmentVertexCount; vertex += 1) {
    const start = Object.freeze([
      input.previousPositionsInvMass[vertex * 4]!,
      input.previousPositionsInvMass[vertex * 4 + 1]!,
      input.previousPositionsInvMass[vertex * 4 + 2]!,
    ] as const);
    const end = Object.freeze([
      input.currentPositionsInvMass[vertex * 4]!,
      input.currentPositionsInvMass[vertex * 4 + 1]!,
      input.currentPositionsInvMass[vertex * 4 + 2]!,
    ] as const);
    const first = start.map((value, axis) =>
      Math.max(
        0,
        Math.floor((Math.min(value, end[axis]!) - grid.minimum[axis]!) / GRID_CELL_SIZE_M),
      ),
    );
    const last = end.map((value, axis) =>
      Math.min(
        grid.dimensions[axis]! - 1,
        Math.floor((Math.max(value, start[axis]!) - grid.minimum[axis]!) / GRID_CELL_SIZE_M),
      ),
    );
    const candidates = new Set<number>();
    for (let z = first[2]!; z <= last[2]!; z += 1)
      for (let y = first[1]!; y <= last[1]!; y += 1)
        for (let x = first[0]!; x <= last[0]!; x += 1)
          for (const triangle of grid.cells.get(key(x, y, z)) ?? []) candidates.add(triangle);
    const segment = [end[0] - start[0], end[1] - start[1], end[2] - start[2]] as const;
    for (const triangle of candidates) {
      exactSegmentTriangleTests += 1;
      if (exactSegmentTriangleTests > MAXIMUM_SEGMENT_TRIANGLE_TESTS) {
        capHit = true;
        break outer;
      }
      const ia = input.bodyTriangles[triangle * 3]! * 3;
      const ib = input.bodyTriangles[triangle * 3 + 1]! * 3;
      const ic = input.bodyTriangles[triangle * 3 + 2]! * 3;
      const a = [
        input.bodyPositionsM[ia]!,
        input.bodyPositionsM[ia + 1]!,
        input.bodyPositionsM[ia + 2]!,
      ] as const;
      const edge1 = [
        input.bodyPositionsM[ib]! - a[0],
        input.bodyPositionsM[ib + 1]! - a[1],
        input.bodyPositionsM[ib + 2]! - a[2],
      ] as const;
      const edge2 = [
        input.bodyPositionsM[ic]! - a[0],
        input.bodyPositionsM[ic + 1]! - a[1],
        input.bodyPositionsM[ic + 2]! - a[2],
      ] as const;
      const p = [
        segment[1] * edge2[2] - segment[2] * edge2[1],
        segment[2] * edge2[0] - segment[0] * edge2[2],
        segment[0] * edge2[1] - segment[1] * edge2[0],
      ] as const;
      const determinant = edge1[0] * p[0] + edge1[1] * p[1] + edge1[2] * p[2];
      if (Math.abs(determinant) <= PARALLEL_EPSILON) {
        const normal = [
          edge1[1] * edge2[2] - edge1[2] * edge2[1],
          edge1[2] * edge2[0] - edge1[0] * edge2[2],
          edge1[0] * edge2[1] - edge1[1] * edge2[0],
        ] as const;
        const normalLength = Math.hypot(...normal);
        const startDelta = [start[0] - a[0], start[1] - a[1], start[2] - a[2]] as const;
        const endDelta = [end[0] - a[0], end[1] - a[1], end[2] - a[2]] as const;
        if (
          normalLength > PARALLEL_EPSILON &&
          Math.abs(
            normal[0] * startDelta[0] + normal[1] * startDelta[1] + normal[2] * startDelta[2],
          ) /
            normalLength <=
            COPLANAR_DISTANCE_EPSILON_M &&
          Math.abs(normal[0] * endDelta[0] + normal[1] * endDelta[1] + normal[2] * endDelta[2]) /
            normalLength <=
            COPLANAR_DISTANCE_EPSILON_M
        ) {
          ambiguousCoplanarCount += 1;
          retain({
            vertexIndex: vertex,
            bodyTriangleIndex: triangle,
            kind: 'ambiguous-coplanar',
            segmentTime: null,
            barycentricU: null,
            barycentricV: null,
            startM: start,
            endM: end,
          });
        }
        continue;
      }
      const inverseDeterminant = 1 / determinant;
      const tvec = [start[0] - a[0], start[1] - a[1], start[2] - a[2]] as const;
      const u = (tvec[0] * p[0] + tvec[1] * p[1] + tvec[2] * p[2]) * inverseDeterminant;
      if (u < -PARALLEL_EPSILON || u > 1 + PARALLEL_EPSILON) continue;
      const q = [
        tvec[1] * edge1[2] - tvec[2] * edge1[1],
        tvec[2] * edge1[0] - tvec[0] * edge1[2],
        tvec[0] * edge1[1] - tvec[1] * edge1[0],
      ] as const;
      const v = (segment[0] * q[0] + segment[1] * q[1] + segment[2] * q[2]) * inverseDeterminant;
      if (v < -PARALLEL_EPSILON || u + v > 1 + PARALLEL_EPSILON) continue;
      const time = (edge2[0] * q[0] + edge2[1] * q[1] + edge2[2] * q[2]) * inverseDeterminant;
      if (time > START_TIME_EPSILON && time <= 1 + PARALLEL_EPSILON) {
        exactCrossingCount += 1;
        retain({
          vertexIndex: vertex,
          bodyTriangleIndex: triangle,
          kind: 'exact-crossing',
          segmentTime: time,
          barycentricU: u,
          barycentricV: v,
          startM: start,
          endM: end,
        });
      }
    }
  }
  const status =
    !capHit && exactCrossingCount === 0 && ambiguousCoplanarCount === 0
      ? ('clear' as const)
      : ('blocked' as const);
  return Object.freeze({
    version: BETA_SKIRT_EXACT_SWEPT_BODY_AUDIT_V1,
    status,
    counts: Object.freeze({
      garmentVertexCount,
      bodyVertexCount,
      bodyTriangleCount,
      exactSegmentTriangleTests,
      exactCrossingCount,
      ambiguousCoplanarCount,
    }),
    policy: Object.freeze({
      gridCellSizeM: GRID_CELL_SIZE_M,
      maximumSegmentTriangleTests: MAXIMUM_SEGMENT_TRIANGLE_TESTS,
      maximumRetainedWitnesses: MAXIMUM_RETAINED_WITNESSES,
      parallelEpsilon: PARALLEL_EPSILON,
      coplanarDistanceEpsilonM: COPLANAR_DISTANCE_EPSILON_M,
      startTimeEpsilon: START_TIME_EPSILON,
    }),
    capHit,
    witnesses: Object.freeze(witnesses),
    witnessesTruncated,
    claims: Object.freeze({
      previousToCurrentVertexSegmentsEvaluated: true as const,
      exactBodyTrianglesUsed: true as const,
      startOnlyContactsExcluded: true as const,
      toleranceChanged: false as const,
      collisionPolicyChanged: false as const,
      collisionAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    }),
  });
}
