export const GARMENT_INTERIOR_LATTICE_REQUEST_V1 = 'garment-interior-lattice-request/1' as const;
export const GARMENT_INTERIOR_LATTICE_PLAN_V1 = 'garment-interior-lattice-plan/1' as const;
export const GARMENT_INTERIOR_LATTICE_RESULT_V1 = 'garment-interior-lattice-result/1' as const;

export const GARMENT_INTERIOR_LATTICE_GEOMETRY_V1 = Object.freeze({
  generator: 'triangular-lattice-v1' as const,
  spacingMm: 25,
  rowHeightMm: (25 * Math.sqrt(3)) / 2,
  boundaryClearanceMm: 10.1,
  originMm: [0, 0] as const,
});

export const GARMENT_INTERIOR_LATTICE_LIMITS_V1 = Object.freeze({
  maximumDepth: 12,
  maximumNodes: 16_384,
  maximumProperties: 65_536,
  maximumArrayLength: 8_192,
  maximumStringLength: 1_024,
  maximumLoops: 256,
  maximumBoundaryVertices: 2_048,
  maximumCandidateCellsPerPiece: 100_000,
  maximumGeometryOperationsPerPiece: 8_000_000,
  maximumAcceptedPointsPerPiece: 8_192,
  maximumErrorDetails: 32,
} as const);

export type GarmentInteriorLatticeLoopV1 = Readonly<{
  loopId: string;
  role: 'shell' | 'hole';
  vertices: readonly Readonly<{
    boundaryVertexId: string;
    positionMm: readonly [number, number];
  }>[];
}>;

export type GarmentInteriorLatticeRequestV1 = Readonly<{
  version: typeof GARMENT_INTERIOR_LATTICE_REQUEST_V1;
  pieceId: string;
  loops: readonly GarmentInteriorLatticeLoopV1[];
}>;

declare const garmentInteriorLatticePlanBrandV1: unique symbol;

export type GarmentInteriorLatticePlanV1 = Readonly<{
  version: typeof GARMENT_INTERIOR_LATTICE_PLAN_V1;
  pieceId: string;
  rowCount: number;
  maximumColumnCount: number;
  candidateCellUpperBound: number;
  geometryOperationUpperBound: number;
  boundaryVertexCount: number;
  [garmentInteriorLatticePlanBrandV1]: true;
}>;

export type GarmentInteriorLatticePointV1 = Readonly<{
  id: string;
  positionMm: readonly [number, number];
}>;

export type GarmentInteriorLatticeResultV1 = Readonly<{
  version: typeof GARMENT_INTERIOR_LATTICE_RESULT_V1;
  pieceId: string;
  points: readonly GarmentInteriorLatticePointV1[];
  visitedCellCount: number;
  candidateCellUpperBound: number;
  geometryOperationUpperBound: number;
  deterministicFingerprint: string;
}>;

export type GarmentInteriorLatticeErrorCodeV1 =
  | 'reentrant-call'
  | 'input-shape-invalid'
  | 'resource-budget-exceeded'
  | 'geometry-invalid'
  | 'f32-collapse'
  | 'empty-result';

export class GarmentInteriorLatticeErrorV1 extends Error {
  readonly code: GarmentInteriorLatticeErrorCodeV1;
  readonly details: readonly string[];

  constructor(
    code: GarmentInteriorLatticeErrorCodeV1,
    message: string,
    details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'GarmentInteriorLatticeErrorV1';
    this.code = code;
    this.details = Object.freeze(
      details
        .slice(0, GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumErrorDetails)
        .map((detail) => detail.slice(0, GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumStringLength)),
    );
  }
}

function fail(
  code: GarmentInteriorLatticeErrorCodeV1,
  message: string,
  details: readonly string[] = [],
): never {
  throw new GarmentInteriorLatticeErrorV1(code, message, details);
}

type OwnedLoop = Readonly<{
  loopId: string;
  role: 'shell' | 'hole';
  vertices: readonly Readonly<{
    boundaryVertexId: string;
    positionMm: readonly [number, number];
  }>[];
}>;

type PrivatePlan = Readonly<{
  pieceId: string;
  loops: readonly OwnedLoop[];
  rowStart: number;
  rowEnd: number;
  candidateCellUpperBound: number;
  geometryOperationUpperBound: number;
}>;

const privatePlans = new WeakMap<object, PrivatePlan>();
const capturedStructuredClone =
  typeof globalThis.structuredClone === 'function'
    ? globalThis.structuredClone.bind(globalThis)
    : null;

type SnapshotState = Readonly<{
  active: Set<object>;
}> & {
  nodes: number;
  properties: number;
};

function snapshotData(value: unknown, path: string, depth: number, state: SnapshotState): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      fail('input-shape-invalid', `${path} must be finite and must not be negative zero.`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumStringLength)
      fail('resource-budget-exceeded', `${path} exceeds the string bound.`);
    return value;
  }
  if (typeof value !== 'object') fail('input-shape-invalid', `${path} is not plain data.`);
  if (depth > GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumDepth)
    fail('resource-budget-exceeded', `${path} exceeds the depth bound.`);
  if (state.active.has(value)) fail('input-shape-invalid', `${path} contains a cycle.`);
  if (ArrayBuffer.isView(value))
    fail('input-shape-invalid', `${path} must not contain typed-array storage.`);
  const isArray = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (isArray ? Array.prototype : Object.prototype))
    fail('input-shape-invalid', `${path} must contain only plain objects and arrays.`);
  state.active.add(value);
  state.nodes += 1;
  if (state.nodes > GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumNodes)
    fail('resource-budget-exceeded', `${path} exceeds the node bound.`);
  try {
    if (isArray) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      const length =
        lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumArrayLength
      )
        fail('resource-budget-exceeded', `${path} has an invalid or excessive array length.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === 'symbol'))
      fail('input-shape-invalid', `${path} contains a symbol property.`);
    if (isArray) {
      const length = (descriptors.length as PropertyDescriptor | undefined)?.value as
        | number
        | undefined;
      if (!Number.isSafeInteger(length) || length === undefined || keys.length !== length + 1)
        fail('input-shape-invalid', `${path} must be a dense array without extra properties.`);
      state.properties += length;
      if (state.properties > GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumProperties)
        fail('resource-budget-exceeded', `${path} exceeds the property bound.`);
      const output: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          fail('input-shape-invalid', `${path}[${index}] must be enumerable own data.`);
        output.push(snapshotData(descriptor.value, `${path}[${index}]`, depth + 1, state));
      }
      return output;
    }
    const stringKeys = keys.filter((key): key is string => typeof key === 'string');
    state.properties += stringKeys.length;
    if (state.properties > GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumProperties)
      fail('resource-budget-exceeded', `${path} exceeds the property bound.`);
    const output: Record<string, unknown> = {};
    for (const key of stringKeys) {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
        fail('input-shape-invalid', `${path}.${key} must be enumerable own data.`);
      output[key] = snapshotData(descriptor.value, `${path}.${key}`, depth + 1, state);
    }
    return output;
  } finally {
    state.active.delete(value);
  }
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index]))
    fail('input-shape-invalid', `${path} has an unsupported property shape.`);
}

function ownedRequest(input: GarmentInteriorLatticeRequestV1): Readonly<{
  pieceId: string;
  loops: readonly OwnedLoop[];
}> {
  const snapshot = snapshotData(input, 'request', 0, {
    nodes: 0,
    properties: 0,
    active: new Set(),
  }) as Record<string, unknown>;
  if (!capturedStructuredClone)
    fail('input-shape-invalid', 'Native structuredClone is required for Proxy rejection.');
  try {
    capturedStructuredClone(input);
  } catch (error) {
    fail('input-shape-invalid', 'Lattice request contains Proxy or unclonable data.', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
  exactKeys(snapshot, ['loops', 'pieceId', 'version'], 'request');
  if (snapshot.version !== GARMENT_INTERIOR_LATTICE_REQUEST_V1)
    fail('input-shape-invalid', 'Lattice request version is unsupported.');
  if (typeof snapshot.pieceId !== 'string' || snapshot.pieceId.length === 0)
    fail('input-shape-invalid', 'Lattice piece identity is missing.');
  if (!Array.isArray(snapshot.loops)) fail('input-shape-invalid', 'Lattice loops are missing.');
  if (
    snapshot.loops.length === 0 ||
    snapshot.loops.length > GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumLoops
  )
    fail('resource-budget-exceeded', 'Lattice loop count exceeds its bound.');
  let boundaryVertexCount = 0;
  const ids = new Set<string>();
  const loopIds = new Set<string>();
  const loops = snapshot.loops.map((candidate, loopIndex): OwnedLoop => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      fail('input-shape-invalid', `request.loops[${loopIndex}] must be an object.`);
    const loop = candidate as Record<string, unknown>;
    exactKeys(loop, ['loopId', 'role', 'vertices'], `request.loops[${loopIndex}]`);
    if (typeof loop.loopId !== 'string' || loop.loopId.length === 0 || loopIds.has(loop.loopId))
      fail('geometry-invalid', `request.loops[${loopIndex}] has an invalid identity.`);
    loopIds.add(loop.loopId);
    if (loop.role !== 'shell' && loop.role !== 'hole')
      fail('geometry-invalid', `${loop.loopId} has an invalid role.`);
    if (!Array.isArray(loop.vertices) || loop.vertices.length < 3)
      fail('geometry-invalid', `${loop.loopId} must contain at least three vertices.`);
    boundaryVertexCount += loop.vertices.length;
    if (boundaryVertexCount > GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumBoundaryVertices)
      fail('resource-budget-exceeded', 'Lattice boundary vertex count exceeds its bound.');
    const vertices = loop.vertices.map((candidateVertex, vertexIndex) => {
      if (!candidateVertex || typeof candidateVertex !== 'object' || Array.isArray(candidateVertex))
        fail(
          'input-shape-invalid',
          `request.loops[${loopIndex}].vertices[${vertexIndex}] must be an object.`,
        );
      const vertex = candidateVertex as Record<string, unknown>;
      exactKeys(
        vertex,
        ['boundaryVertexId', 'positionMm'],
        `request.loops[${loopIndex}].vertices[${vertexIndex}]`,
      );
      if (
        typeof vertex.boundaryVertexId !== 'string' ||
        vertex.boundaryVertexId.length === 0 ||
        ids.has(vertex.boundaryVertexId)
      )
        fail('geometry-invalid', `${loop.loopId} contains a duplicate or empty vertex identity.`);
      ids.add(vertex.boundaryVertexId);
      if (
        !Array.isArray(vertex.positionMm) ||
        vertex.positionMm.length !== 2 ||
        vertex.positionMm.some(
          (coordinate) =>
            typeof coordinate !== 'number' ||
            !Number.isFinite(coordinate) ||
            Object.is(coordinate, -0) ||
            Math.fround(coordinate) !== coordinate,
        )
      )
        fail('geometry-invalid', `${vertex.boundaryVertexId} is not canonical finite f32.`);
      return {
        boundaryVertexId: vertex.boundaryVertexId,
        positionMm: [vertex.positionMm[0], vertex.positionMm[1]] as const,
      };
    });
    return { loopId: loop.loopId, role: loop.role, vertices };
  });
  if (loops.filter((loop) => loop.role === 'shell').length !== 1)
    fail('geometry-invalid', 'Lattice geometry must contain exactly one shell.');
  return { pieceId: snapshot.pieceId, loops };
}

function safeCount(end: number, start: number, path: string): number {
  const count = end - start + 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(count) ||
    count <= 0
  )
    fail('resource-budget-exceeded', `${path} cannot be represented as a safe integer range.`);
  return count;
}

function columnRange(minX: number, maxX: number, row: number): readonly [number, number] {
  const offset = Math.abs(row) % 2 === 1 ? GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.spacingMm / 2 : 0;
  return [
    Math.floor((minX - offset) / GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.spacingMm) - 1,
    Math.ceil((maxX - offset) / GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.spacingMm) + 1,
  ];
}

function multiplyBound(left: number, right: number, path: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result))
    fail('resource-budget-exceeded', `${path} exceeds safe integer accounting.`);
  return result;
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

let active = false;
let reentryObserved = false;

function guarded<T>(operation: () => T): T {
  if (active) {
    reentryObserved = true;
    fail('reentrant-call', 'Garment interior lattice rejects reentrant calls.');
  }
  active = true;
  reentryObserved = false;
  try {
    const result = operation();
    if (reentryObserved)
      fail('input-shape-invalid', 'Lattice input triggered reentrant reflection.');
    return result;
  } catch (error) {
    if (error instanceof GarmentInteriorLatticeErrorV1) throw error;
    fail('input-shape-invalid', 'Garment interior lattice failed closed.', [
      error instanceof Error ? error.message : String(error),
    ]);
  } finally {
    active = false;
    reentryObserved = false;
  }
}

export function createGarmentInteriorLatticePlanV1(
  input: GarmentInteriorLatticeRequestV1,
): GarmentInteriorLatticePlanV1 {
  return guarded(() => {
    const request = ownedRequest(input);
    const vertices = request.loops.flatMap((loop) => loop.vertices);
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const vertex of vertices) {
      minX = Math.min(minX, vertex.positionMm[0]);
      minY = Math.min(minY, vertex.positionMm[1]);
      maxX = Math.max(maxX, vertex.positionMm[0]);
      maxY = Math.max(maxY, vertex.positionMm[1]);
    }
    const rowStart = Math.floor(minY / GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.rowHeightMm) - 1;
    const rowEnd = Math.ceil(maxY / GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.rowHeightMm) + 1;
    const rowCount = safeCount(rowEnd, rowStart, 'Lattice rows');
    let maximumColumnCount = 0;
    for (const parityRow of [rowStart, rowStart + 1]) {
      const [columnStart, columnEnd] = columnRange(minX, maxX, parityRow);
      maximumColumnCount = Math.max(
        maximumColumnCount,
        safeCount(columnEnd, columnStart, 'Lattice columns'),
      );
      const startX = Math.fround(
        columnStart * GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.spacingMm +
          (Math.abs(parityRow) % 2 === 1 ? GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.spacingMm / 2 : 0),
      );
      const nextX = Math.fround(startX + GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.spacingMm);
      const endX = Math.fround(
        columnEnd * GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.spacingMm +
          (Math.abs(parityRow) % 2 === 1 ? GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.spacingMm / 2 : 0),
      );
      const beforeEndX = Math.fround(endX - GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.spacingMm);
      if (
        !Number.isFinite(startX) ||
        !Number.isFinite(endX) ||
        startX === nextX ||
        beforeEndX === endX
      )
        fail('f32-collapse', 'Lattice columns collapse during f32 conversion.');
    }
    const startY = Math.fround(rowStart * GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.rowHeightMm);
    const nextY = Math.fround((rowStart + 1) * GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.rowHeightMm);
    const endY = Math.fround(rowEnd * GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.rowHeightMm);
    const beforeEndY = Math.fround((rowEnd - 1) * GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.rowHeightMm);
    if (
      !Number.isFinite(startY) ||
      !Number.isFinite(endY) ||
      startY === nextY ||
      beforeEndY === endY
    )
      fail('f32-collapse', 'Lattice rows collapse during f32 conversion.');
    const candidateCellUpperBound = multiplyBound(
      rowCount,
      maximumColumnCount,
      'Lattice cell count',
    );
    if (candidateCellUpperBound > GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumCandidateCellsPerPiece)
      fail('resource-budget-exceeded', 'Lattice candidate cell count exceeds its bound.');
    const geometryOperationUpperBound = multiplyBound(
      candidateCellUpperBound,
      vertices.length * 2 + 8,
      'Lattice geometry operations',
    );
    if (
      geometryOperationUpperBound >
      GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumGeometryOperationsPerPiece
    )
      fail('resource-budget-exceeded', 'Lattice geometry operations exceed their bound.');
    const publicPlan = freezePlainData({
      version: GARMENT_INTERIOR_LATTICE_PLAN_V1,
      pieceId: request.pieceId,
      rowCount,
      maximumColumnCount,
      candidateCellUpperBound,
      geometryOperationUpperBound,
      boundaryVertexCount: vertices.length,
    }) as GarmentInteriorLatticePlanV1;
    privatePlans.set(publicPlan, {
      pieceId: request.pieceId,
      loops: request.loops,
      rowStart,
      rowEnd,
      candidateCellUpperBound,
      geometryOperationUpperBound,
    });
    return publicPlan;
  });
}

function pointOnSegment(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): boolean {
  const cross =
    (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]);
  return (
    Math.abs(cross) <= 1e-9 &&
    point[0] >= Math.min(start[0], end[0]) - 1e-9 &&
    point[0] <= Math.max(start[0], end[0]) + 1e-9 &&
    point[1] >= Math.min(start[1], end[1]) - 1e-9 &&
    point[1] <= Math.max(start[1], end[1]) + 1e-9
  );
}

function pointInLoop(point: readonly [number, number], vertices: OwnedLoop['vertices']): boolean {
  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const a = vertices[index].positionMm;
    const b = vertices[previous].positionMm;
    if (pointOnSegment(point, a, b)) return false;
    if (a[1] > point[1] !== b[1] > point[1]) {
      const x = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (point[0] < x) inside = !inside;
    }
  }
  return inside;
}

function pointSegmentDistance(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const denominator = dx * dx + dy * dy;
  const t = Math.max(
    0,
    Math.min(
      1,
      denominator === 0
        ? 0
        : ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / denominator,
    ),
  );
  return Math.hypot(point[0] - (start[0] + dx * t), point[1] - (start[1] + dy * t));
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export function generateGarmentInteriorLatticeV1(
  plan: GarmentInteriorLatticePlanV1,
): GarmentInteriorLatticeResultV1 {
  return guarded(() => {
    const privatePlan = plan && typeof plan === 'object' ? privatePlans.get(plan) : undefined;
    if (!privatePlan)
      fail('input-shape-invalid', 'Lattice generation requires an owned plan capability.');
    const shell = privatePlan.loops.find((loop) => loop.role === 'shell')!;
    const holes = privatePlan.loops.filter((loop) => loop.role === 'hole');
    const segments = privatePlan.loops.flatMap((loop) =>
      loop.vertices.map(
        (vertex, index) =>
          [
            vertex.positionMm,
            loop.vertices[(index + 1) % loop.vertices.length].positionMm,
          ] as const,
      ),
    );
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (const vertex of privatePlan.loops.flatMap((loop) => loop.vertices)) {
      minX = Math.min(minX, vertex.positionMm[0]);
      maxX = Math.max(maxX, vertex.positionMm[0]);
    }
    const points: GarmentInteriorLatticePointV1[] = [];
    const coordinates = new Set<string>();
    let visitedCellCount = 0;
    for (let row = privatePlan.rowStart; row <= privatePlan.rowEnd; row += 1) {
      const y = Math.fround(row * GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.rowHeightMm);
      const rowOffset =
        Math.abs(row) % 2 === 1 ? GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.spacingMm / 2 : 0;
      const [columnStart, columnEnd] = columnRange(minX, maxX, row);
      for (let column = columnStart; column <= columnEnd; column += 1) {
        visitedCellCount += 1;
        if (visitedCellCount > privatePlan.candidateCellUpperBound)
          fail('resource-budget-exceeded', 'Lattice exceeded its preflight cell upper bound.');
        const point = [
          Math.fround(column * GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.spacingMm + rowOffset),
          y,
        ] as const;
        if (!pointInLoop(point, shell.vertices)) continue;
        if (holes.some((hole) => pointInLoop(point, hole.vertices))) continue;
        if (
          segments.some(
            ([start, end]) =>
              pointSegmentDistance(point, start, end) <
              GARMENT_INTERIOR_LATTICE_GEOMETRY_V1.boundaryClearanceMm,
          )
        )
          continue;
        const coordinate = `${point[0]},${point[1]}`;
        if (coordinates.has(coordinate))
          fail('f32-collapse', 'Two accepted lattice points collapse to one f32 coordinate.');
        coordinates.add(coordinate);
        points.push({
          id: `g0b-${fnv1a64(privatePlan.pieceId)}-r${row}-c${column}`,
          positionMm: point,
        });
        if (points.length > GARMENT_INTERIOR_LATTICE_LIMITS_V1.maximumAcceptedPointsPerPiece)
          fail('resource-budget-exceeded', 'Accepted lattice point count exceeds its bound.');
      }
    }
    if (points.length === 0)
      fail('empty-result', `${privatePlan.pieceId} produced no bounded interior lattice points.`);
    const payload = {
      version: GARMENT_INTERIOR_LATTICE_RESULT_V1,
      pieceId: privatePlan.pieceId,
      points,
      visitedCellCount,
      candidateCellUpperBound: privatePlan.candidateCellUpperBound,
      geometryOperationUpperBound: privatePlan.geometryOperationUpperBound,
    };
    const canonical = JSON.stringify(payload);
    return freezePlainData({
      ...payload,
      deterministicFingerprint: `gil1-fnv1a64:${fnv1a64(canonical)}`,
    });
  });
}
