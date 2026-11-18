import robustOrientation from 'robust-orientation';

import type { Vec2Mm } from '../../domain/garment-assembly-ir';

export const SOURCE_CUT_MASS_TRANSFER_V1 = 'source-cut-mass-transfer/1' as const;
export const SOURCE_CUT_MASS_TRANSFER_LIMITS_V1 = Object.freeze({
  maxAbsCoordinateMm: 10_000_000,
  maxVerticesPerMesh: 100_000,
  maxTrianglesPerMesh: 200_000,
  maxSurfaceTriangles: 100_000,
  defaultMaxPairChecks: 2_000_000,
  maxPairChecks: 8_000_000,
  maxAbsoluteAreaToleranceMm2: 1e-3,
  maxRelativeAreaTolerance: 1e-8,
  maxCentroidToleranceMm: 1e-3,
});

export type SourceCutMassTransferMeshV1 = Readonly<{
  verticesMm: readonly Vec2Mm[];
  /** Packed counterclockwise triples in the same rest plane as the other mesh. */
  triangles: Uint32Array;
}>;

/** Geometry comparison tolerances chosen by the trusted compiler. Source identity is upstream. */
export type SourceCutMassTransferTolerancesV1 = Readonly<{
  absoluteAreaToleranceMm2: number;
  relativeAreaTolerance: number;
  centroidToleranceMm: number;
}>;

export type SourceCutMassTransferRequestV1 = Readonly<{
  source: SourceCutMassTransferMeshV1;
  carrier: SourceCutMassTransferMeshV1;
  tolerances: SourceCutMassTransferTolerancesV1;
  maxPairChecks?: number;
  /** Request a clipped material surface with an explicit triangle budget. */
  maxSurfaceTriangles?: number;
}>;

export type SourceCutSurfaceV1 = Readonly<{
  sourceTriangleIndices: Uint32Array;
  /** Packed source triangle vertices indexed by sourceTriangleIndices. */
  sourceTriangleVertices: Uint32Array;
  carrierTriangleIndices: Uint32Array;
  /** Nine weights per output triangle, three for each corner in carrier index order. */
  cornerWeights: Float64Array;
  /** Local source-corner support bits for every output corner, in output triangle order. */
  sourceCornerSupportMasks: Uint8Array;
}>;

type MeshSide = 'source' | 'carrier';
export type SourceCutMassTransferDiagnosticV1 = Readonly<{
  code:
    | 'invalid-input'
    | 'invalid-tolerance'
    | 'out-of-range'
    | 'nonfinite'
    | 'invalid-winding'
    | 'operation-budget-exceeded'
    | 'overlap'
    | 'gap'
    | 'numerical-range'
    | 'conservation';
  detail: string;
  mesh?: MeshSide;
  triangleIndex?: number;
  otherTriangleIndex?: number;
}>;

export type SourceCutMassTransferSourceCoverageV1 = Readonly<{
  sourceAreaMm2: number;
  transferredAreaMm2: number;
  absoluteAreaErrorMm2: number;
  centroidErrorMm: number;
}>;

export type SourceCutMassTransferResultV1 =
  | Readonly<{
      ok: true;
      version: typeof SOURCE_CUT_MASS_TRANSFER_V1;
      /** All output arrays retain input ordering. Inactive triangles and vertices have zero area. */
      carrierActiveAreaMm2: Float64Array;
      /** Packed x, y integrals of rest-plane position over each active triangle region. */
      carrierFirstMomentsMm3: Float64Array;
      /** Packed integrals of the three affine carrier basis functions over each active region. */
      carrierNodalAreaMm2: Float64Array;
      /** Sum of incident nodal areas for each carrier vertex. */
      carrierVertexAreaMm2: Float64Array;
      surface: SourceCutSurfaceV1 | null;
      sourceCoverage: readonly SourceCutMassTransferSourceCoverageV1[];
      sourceAreaMm2: number;
      transferredAreaMm2: number;
      sourceCentroidMm: Vec2Mm;
      transferredCentroidMm: Vec2Mm;
      nodalAreaMm2: number;
      nodalCentroidMm: Vec2Mm;
      pairChecks: number;
      clippedPairs: number;
    }>
  | Readonly<{
      ok: false;
      version: typeof SOURCE_CUT_MASS_TRANSFER_V1;
      diagnostic: SourceCutMassTransferDiagnosticV1;
    }>;

type Triple = readonly [number, number, number];
type ClippedVertex = Readonly<{ weights: Triple; sourceMask: number }>;
type Triangle = Readonly<{
  side: MeshSide;
  index: number;
  vertexIndices: Triple;
  points: readonly [Vec2Mm, Vec2Mm, Vec2Mm];
  areaTwice: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}>;
type Integral = [area: number, mx: number, my: number];

class TransferFailure extends Error {
  constructor(readonly diagnostic: SourceCutMassTransferDiagnosticV1) {
    super(diagnostic.detail);
  }
}

function fail(
  code: SourceCutMassTransferDiagnosticV1['code'],
  detail: string,
  mesh?: MeshSide,
  triangleIndex?: number,
  otherTriangleIndex?: number,
): never {
  throw new TransferFailure({ code, detail, mesh, triangleIndex, otherTriangleIndex });
}

function captureMesh(input: SourceCutMassTransferMeshV1, side: MeshSide) {
  const points = input?.verticesMm;
  const indices = input?.triangles;
  if (
    !Array.isArray(points) ||
    !ArrayBuffer.isView(indices) ||
    Object.getPrototypeOf(indices) !== Uint32Array.prototype ||
    !(indices.buffer instanceof ArrayBuffer)
  )
    fail(
      'invalid-input',
      'Expected vertices and packed triangle indices in an ordinary buffer.',
      side,
    );
  const pointCount = points.length;
  const indexCount = indices.length;
  if (
    !Number.isSafeInteger(pointCount) ||
    pointCount < 3 ||
    !Number.isSafeInteger(indexCount) ||
    indexCount < 3 ||
    indexCount % 3 !== 0
  )
    fail('invalid-input', 'Mesh vertex or packed index count is invalid.', side);
  if (
    pointCount > SOURCE_CUT_MASS_TRANSFER_LIMITS_V1.maxVerticesPerMesh ||
    indexCount / 3 > SOURCE_CUT_MASS_TRANSFER_LIMITS_V1.maxTrianglesPerMesh
  )
    fail('out-of-range', 'Mesh exceeds the transfer vertex or triangle bound.', side);
  const vertices: Vec2Mm[] = [];
  for (let i = 0; i < pointCount; i++) {
    const point = points[i];
    if (!Array.isArray(point) || point.length !== 2)
      fail('invalid-input', 'Expected two coordinates per mesh vertex.', side);
    const x = point[0];
    const y = point[1];
    if (!Number.isFinite(x) || !Number.isFinite(y))
      fail('nonfinite', 'Mesh coordinates must be finite.', side);
    const limit = SOURCE_CUT_MASS_TRANSFER_LIMITS_V1.maxAbsCoordinateMm;
    if (Math.abs(x) > limit || Math.abs(y) > limit)
      fail('out-of-range', 'Mesh coordinates exceed the rest-plane bound.', side);
    vertices.push([x, y]);
  }
  const triangles: Triangle[] = [];
  for (let offset = 0; offset < indexCount; offset += 3) {
    const index = offset / 3;
    const vertexIndices = [indices[offset], indices[offset + 1], indices[offset + 2]] as const;
    const [a, b, c] = vertexIndices.map((i) => vertices[i]);
    if (!a || !b || !c) fail('out-of-range', 'Triangle vertex index is out of range.', side, index);
    const areaTwice = -robustOrientation(a, b, c);
    if (!Number.isFinite(areaTwice)) fail('nonfinite', 'Triangle area is nonfinite.', side, index);
    if (areaTwice / 2 <= 0)
      fail(
        'invalid-winding',
        'Expected a nondegenerate counterclockwise rest triangle.',
        side,
        index,
      );
    triangles.push({
      side,
      index,
      vertexIndices,
      points: [a, b, c],
      areaTwice,
      minX: Math.min(a[0], b[0], c[0]),
      minY: Math.min(a[1], b[1], c[1]),
      maxX: Math.max(a[0], b[0], c[0]),
      maxY: Math.max(a[1], b[1], c[1]),
    });
  }
  return { vertices, triangles };
}

/** A supporting edge with all opposite points on or outside it rules out interior overlap. */
function separates(a: Triangle, b: Triangle): boolean {
  return a.points.some((start, i) =>
    b.points.every((point) => robustOrientation(start, a.points[(i + 1) % 3], point) >= 0),
  );
}

function clipBarycentric(polygon: readonly ClippedVertex[], axis: number): ClippedVertex[] {
  const clipped: ClippedVertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const u = a.weights[axis];
    const v = b.weights[axis];
    if (u >= 0) clipped.push(a);
    // A point on the boundary is already retained when visited as a polygon vertex.
    if (!((u < 0 && v > 0) || (u > 0 && v < 0))) continue;
    const total = Math.abs(u) + Math.abs(v);
    const fromA = Math.abs(v) / total;
    const fromB = Math.abs(u) / total;
    const crossing: [number, number, number] = [
      a.weights[0] * fromA + b.weights[0] * fromB,
      a.weights[1] * fromA + b.weights[1] * fromB,
      a.weights[2] * fromA + b.weights[2] * fromB,
    ];
    crossing[axis] = 0;
    // Both segment endpoints have positive coefficients at a strict crossing.
    clipped.push({ weights: crossing, sourceMask: a.sourceMask | b.sourceMask });
  }
  return clipped;
}

/** The carrier basis is affine on each fragment, so its fan integral uses vertex averages. */
function clippedIntegral(
  source: Triangle,
  carrier: Triangle,
  appendSurfaceTriangle?: (a: ClippedVertex, b: ClippedVertex, c: ClippedVertex) => void,
) {
  const failFragment = (detail: string): never =>
    fail('numerical-range', detail, 'source', source.index, carrier.index);
  let polygon = source.points.map((p, i): ClippedVertex => {
    const [a, b, c] = carrier.points;
    const weights: Triple = [
      -robustOrientation(b, c, p) / carrier.areaTwice,
      -robustOrientation(c, a, p) / carrier.areaTwice,
      -robustOrientation(a, b, p) / carrier.areaTwice,
    ];
    if (weights.some((value) => !Number.isFinite(value) || Math.abs(value) > 1 / Number.EPSILON))
      failFragment('Source and carrier scales exceed the supported clipping range.');
    return { weights, sourceMask: 1 << i };
  });
  for (let axis = 0; axis < 3; axis++) polygon = clipBarycentric(polygon, axis);
  if (polygon.length < 3) failFragment('A positive intersection collapsed during clipping.');
  polygon = polygon.map(({ sourceMask, weights: [u, v, w] }) => {
    const sum = u + v + w;
    if (u < 0 || v < 0 || w < 0 || !Number.isFinite(sum) || Math.abs(sum - 1) > 1e-8)
      failFragment('Clipped barycentric coordinates are outside the supported numeric range.');
    return { weights: [u / sum, v / sum, w / sum], sourceMask };
  });
  const a = polygon[0];
  // Omit the dominant coordinate at the fan origin. This retains the small coordinates of a
  // sliver near a carrier corner even when the dominant coordinate rounds to one.
  const omit = a.weights.indexOf(Math.max(...a.weights));
  const x = (omit + 1) % 3;
  const y = (omit + 2) % 3;
  const project = (p: ClippedVertex): Vec2Mm => [p.weights[x], p.weights[y]];
  const origin = project(a);
  const nodal: [number, number, number] = [0, 0, 0];
  let area = 0;
  for (let i = 1; i < polygon.length - 1; i++) {
    const b = polygon[i];
    const c = polygon[i + 1];
    const fragmentArea =
      (-robustOrientation(origin, project(b), project(c)) * carrier.areaTwice) / 2;
    if (appendSurfaceTriangle) {
      if (fragmentArea < 0) failFragment('A clipped material triangle reversed winding.');
      if (fragmentArea > 0) appendSurfaceTriangle(a, b, c);
    }
    area += fragmentArea;
    for (let k = 0; k < 3; k++)
      nodal[k] += fragmentArea * ((a.weights[k] + b.weights[k] + c.weights[k]) / 3);
  }
  if (!(area > 0) || !Number.isFinite(area) || nodal.some((w) => !(w > 0) || !Number.isFinite(w)))
    failFragment('A positive intersection must yield finite positive integrated nodal areas.');
  return { area, nodal };
}

/** Compensated sums preserve small contributions alongside much larger triangles. */
class Sums {
  readonly values: Float64Array;
  private readonly corrections: Float64Array;

  constructor(length: number) {
    this.values = new Float64Array(length);
    this.corrections = new Float64Array(length);
  }

  add(index: number, value: number): void {
    const adjusted = value - this.corrections[index];
    const previous = this.values[index];
    const total = previous + adjusted;
    this.corrections[index] = total - previous - adjusted;
    this.values[index] = total;
  }

  addTriple(offset: number, values: Triple): void {
    for (let k = 0; k < 3; k++) this.add(offset + k, values[k]);
  }

  triple(offset: number): Integral {
    return [this.values[offset], this.values[offset + 1], this.values[offset + 2]];
  }
}

function moment(points: Triangle['points'], nodal: Triple, origin: Vec2Mm): Vec2Mm {
  return [
    nodal.reduce((sum, w, i) => sum + w * (points[i][0] - origin[0]), 0),
    nodal.reduce((sum, w, i) => sum + w * (points[i][1] - origin[1]), 0),
  ];
}

function areaTolerance(area: number, tolerances: SourceCutMassTransferTolerancesV1): number {
  return Math.max(tolerances.absoluteAreaToleranceMm2, tolerances.relativeAreaTolerance * area);
}

function centroidError(a: Integral, b: Integral): number {
  return Math.hypot(a[1] / a[0] - b[1] / b[0], a[2] / a[0] - b[2] / b[0]);
}

function validTolerance(value: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}

function transferPartitions(
  source: readonly Triangle[],
  carrier: readonly Triangle[],
  origin: Vec2Mm,
  maxPairChecks: number,
  maxSurfaceTriangles: number | undefined,
) {
  const sourceTransferred = new Sums(3 * source.length);
  const carrierArea = new Sums(carrier.length);
  const carrierNodal = new Sums(3 * carrier.length);
  const ordered = [...source, ...carrier].sort((a, b) => a.minX - b.minX);
  const active: Triangle[] = [];
  const surface =
    maxSurfaceTriangles === undefined
      ? null
      : {
          sourceIndices: new Uint32Array(maxSurfaceTriangles),
          carrierIndices: new Uint32Array(maxSurfaceTriangles),
          weights: new Float64Array(9 * maxSurfaceTriangles),
          sourceMasks: new Uint8Array(3 * maxSurfaceTriangles),
          triangleCount: 0,
        };
  let pairChecks = 0;
  let clippedPairs = 0;
  for (const triangle of ordered) {
    let retained = 0;
    for (const previous of active) {
      if (++pairChecks > maxPairChecks)
        fail(
          'operation-budget-exceeded',
          'Triangle candidate checks exceeded the operation budget.',
        );
      if (previous.maxX <= triangle.minX) continue;
      active[retained++] = previous;
      if (
        previous.maxY <= triangle.minY ||
        triangle.maxY <= previous.minY ||
        separates(triangle, previous) ||
        separates(previous, triangle)
      )
        continue;
      if (previous.side === triangle.side)
        fail(
          'overlap',
          'Triangles in the same mesh have overlapping interiors.',
          triangle.side,
          previous.index,
          triangle.index,
        );
      const cutTriangle = previous.side === 'source' ? previous : triangle;
      const cell = previous.side === 'carrier' ? previous : triangle;
      const transfer = clippedIntegral(
        cutTriangle,
        cell,
        surface
          ? (a, b, c) => {
              const index = surface.triangleCount;
              if (index >= surface.sourceIndices.length)
                fail(
                  'operation-budget-exceeded',
                  'Clipped material surface exceeds the triangle budget.',
                );
              surface.sourceIndices[index] = cutTriangle.index;
              surface.carrierIndices[index] = cell.index;
              surface.weights.set(a.weights, 9 * index);
              surface.weights.set(b.weights, 9 * index + 3);
              surface.weights.set(c.weights, 9 * index + 6);
              surface.sourceMasks[3 * index] = a.sourceMask;
              surface.sourceMasks[3 * index + 1] = b.sourceMask;
              surface.sourceMasks[3 * index + 2] = c.sourceMask;
              surface.triangleCount++;
            }
          : undefined,
      );
      const [mx, my] = moment(cell.points, transfer.nodal, origin);
      sourceTransferred.addTriple(3 * cutTriangle.index, [transfer.area, mx, my]);
      carrierArea.add(cell.index, transfer.area);
      carrierNodal.addTriple(3 * cell.index, transfer.nodal);
      clippedPairs++;
    }
    active.length = retained;
    active.push(triangle);
  }

  return { sourceTransferred, carrierArea, carrierNodal, pairChecks, clippedPairs, surface };
}

function verifySourceCoverage(
  triangles: readonly Triangle[],
  sourceTransferred: Sums,
  origin: Vec2Mm,
  tolerances: SourceCutMassTransferTolerancesV1,
) {
  const expected = new Sums(3);
  const transferred = new Sums(3);
  const sourceCoverage = triangles.map((triangle): SourceCutMassTransferSourceCoverageV1 => {
    const sourceArea = triangle.areaTwice / 2;
    const oneThird = sourceArea / 3;
    const sourceMoment = moment(triangle.points, [oneThird, oneThird, oneThird], origin);
    const sourceIntegral: Integral = [sourceArea, ...sourceMoment];
    const actual = sourceTransferred.triple(3 * triangle.index);
    const difference = actual[0] - sourceArea;
    const tolerance = areaTolerance(sourceArea, tolerances);
    if (!(actual[0] > 0) || difference < -tolerance)
      fail(
        'gap',
        `Source triangle transferred ${actual[0]} of ${sourceArea} mm².`,
        'source',
        triangle.index,
      );
    if (difference > tolerance)
      fail(
        'overlap',
        `Source triangle transferred ${actual[0]} of ${sourceArea} mm².`,
        'source',
        triangle.index,
      );
    const errorMm = centroidError(sourceIntegral, actual);
    if (!Number.isFinite(errorMm) || errorMm > tolerances.centroidToleranceMm)
      fail(
        'conservation',
        'Source triangle centroid changed during transfer.',
        'source',
        triangle.index,
      );
    expected.addTriple(0, sourceIntegral);
    transferred.addTriple(0, actual);
    return Object.freeze({
      sourceAreaMm2: sourceArea,
      transferredAreaMm2: actual[0],
      absoluteAreaErrorMm2: Math.abs(difference),
      centroidErrorMm: errorMm,
    });
  });

  return {
    sourceCoverage,
    sourceIntegral: expected.triple(0),
    transferredIntegral: transferred.triple(0),
  };
}

function collectCarrierIntegrals(
  carrier: ReturnType<typeof captureMesh>,
  carrierArea: Sums,
  carrierNodal: Sums,
  origin: Vec2Mm,
  tolerances: SourceCutMassTransferTolerancesV1,
) {
  const carrierFirstMomentsMm3 = new Float64Array(2 * carrier.triangles.length);
  const carrierVertexArea = new Sums(carrier.vertices.length);
  for (const cell of carrier.triangles) {
    const area = carrierArea.values[cell.index];
    if (area === 0) continue;
    const nodal = carrierNodal.triple(3 * cell.index);
    const areaSum = nodal[0] + nodal[1] + nodal[2];
    const tolerance = areaTolerance(area, tolerances);
    if (
      !Number.isFinite(area) ||
      area > cell.areaTwice / 2 + tolerance ||
      Math.abs(areaSum - area) > tolerance ||
      nodal.some((weight) => !(weight > 0) || !Number.isFinite(weight))
    )
      fail(
        'conservation',
        'Carrier triangle area and positive nodal integral differ.',
        'carrier',
        cell.index,
      );
    const [mx, my] = moment(cell.points, nodal, [0, 0]);
    carrierFirstMomentsMm3[2 * cell.index] = mx;
    carrierFirstMomentsMm3[2 * cell.index + 1] = my;
    cell.vertexIndices.forEach((vertex, i) => carrierVertexArea.add(vertex, nodal[i]));
  }

  const nodalTotal = new Sums(3);
  carrier.vertices.forEach(([x, y], i) => {
    const area = carrierVertexArea.values[i];
    nodalTotal.addTriple(0, [area, area * (x - origin[0]), area * (y - origin[1])]);
  });
  const nodalIntegral = nodalTotal.triple(0);
  return { carrierFirstMomentsMm3, carrierVertexArea, nodalIntegral };
}

/** Transfer audited cut-plane area to audited carrier basis functions by triangle intersection. */
export function transferSourceCutMassV1(
  input: SourceCutMassTransferRequestV1,
): SourceCutMassTransferResultV1 {
  try {
    if (!input || typeof input !== 'object') fail('invalid-input', 'Transfer request is missing.');
    const limits = SOURCE_CUT_MASS_TRANSFER_LIMITS_V1;
    const { tolerances, maxPairChecks = limits.defaultMaxPairChecks, maxSurfaceTriangles } = input;
    if (
      !tolerances ||
      !validTolerance(tolerances.absoluteAreaToleranceMm2, limits.maxAbsoluteAreaToleranceMm2) ||
      !validTolerance(tolerances.relativeAreaTolerance, limits.maxRelativeAreaTolerance) ||
      !validTolerance(tolerances.centroidToleranceMm, limits.maxCentroidToleranceMm)
    )
      fail('invalid-tolerance', 'Explicit bounded area and centroid tolerances are required.');
    if (
      !Number.isSafeInteger(maxPairChecks) ||
      maxPairChecks <= 0 ||
      maxPairChecks > limits.maxPairChecks
    )
      fail('invalid-input', 'The candidate pair budget is outside its supported range.');
    if (
      maxSurfaceTriangles !== undefined &&
      (!Number.isSafeInteger(maxSurfaceTriangles) ||
        maxSurfaceTriangles < 1 ||
        maxSurfaceTriangles > limits.maxSurfaceTriangles)
    )
      fail('invalid-input', 'The clipped material surface requires a bounded triangle budget.');
    const source = captureMesh(input.source, 'source');
    const carrier = captureMesh(input.carrier, 'carrier');
    const origin = source.triangles[0].points[0];
    const { sourceTransferred, carrierArea, carrierNodal, pairChecks, clippedPairs, surface } =
      transferPartitions(
        source.triangles,
        carrier.triangles,
        origin,
        maxPairChecks,
        maxSurfaceTriangles,
      );

    const { sourceCoverage, sourceIntegral, transferredIntegral } = verifySourceCoverage(
      source.triangles,
      sourceTransferred,
      origin,
      tolerances,
    );

    const { carrierFirstMomentsMm3, carrierVertexArea, nodalIntegral } = collectCarrierIntegrals(
      carrier,
      carrierArea,
      carrierNodal,
      origin,
      tolerances,
    );
    for (const integral of [transferredIntegral, nodalIntegral]) {
      const centroidDelta = centroidError(sourceIntegral, integral);
      if (
        !integral.every(Number.isFinite) ||
        Math.abs(integral[0] - sourceIntegral[0]) > areaTolerance(sourceIntegral[0], tolerances) ||
        !Number.isFinite(centroidDelta) ||
        centroidDelta > tolerances.centroidToleranceMm
      )
        fail('conservation', 'Total transfer failed source area or centroid conservation.');
    }
    const centroid = ([area, mx, my]: Integral): Vec2Mm =>
      Object.freeze([origin[0] + mx / area, origin[1] + my / area]);
    return Object.freeze({
      ok: true as const,
      version: SOURCE_CUT_MASS_TRANSFER_V1,
      carrierActiveAreaMm2: carrierArea.values,
      carrierFirstMomentsMm3,
      carrierNodalAreaMm2: carrierNodal.values,
      carrierVertexAreaMm2: carrierVertexArea.values,
      surface:
        surface &&
        Object.freeze({
          sourceTriangleIndices: surface.sourceIndices.slice(0, surface.triangleCount),
          sourceTriangleVertices: Uint32Array.from(
            source.triangles.flatMap(({ vertexIndices }) => vertexIndices),
          ),
          carrierTriangleIndices: surface.carrierIndices.slice(0, surface.triangleCount),
          cornerWeights: surface.weights.slice(0, surface.triangleCount * 9),
          sourceCornerSupportMasks: surface.sourceMasks.slice(0, surface.triangleCount * 3),
        }),
      sourceCoverage: Object.freeze(sourceCoverage),
      sourceAreaMm2: sourceIntegral[0],
      transferredAreaMm2: transferredIntegral[0],
      sourceCentroidMm: centroid(sourceIntegral),
      transferredCentroidMm: centroid(transferredIntegral),
      nodalAreaMm2: nodalIntegral[0],
      nodalCentroidMm: centroid(nodalIntegral),
      pairChecks,
      clippedPairs,
    });
  } catch (error) {
    if (!(error instanceof TransferFailure)) throw error;
    return Object.freeze({
      ok: false,
      version: SOURCE_CUT_MASS_TRANSFER_V1,
      diagnostic: Object.freeze(error.diagnostic),
    });
  }
}
