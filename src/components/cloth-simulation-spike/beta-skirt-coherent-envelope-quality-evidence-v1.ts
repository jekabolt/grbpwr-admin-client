export const BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_EVIDENCE_V1 =
  'beta-skirt-coherent-envelope-quality-evidence/1' as const;

export const BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1 = Object.freeze({
  maximumVertexCount: 200_000,
  maximumTriangleCount: 400_000,
  maximumUniqueEdgeCount: 1_200_000,
  maximumEdgeIncidenceCount: 1_200_000,
  maximumCoordinateMagnitudeM: 1_000_000,
  maximumUniformScale: 1_000_000,
} as const);

export type BetaSkirtCoherentEnvelopeQualityBlockerV1 =
  | 'vertex-count-mismatch'
  | 'triangle-count-mismatch'
  | 'triangle-index-order-mismatch'
  | 'component-count-drift'
  | 'boundary-edge-count-drift'
  | 'nonmanifold-edge-count-drift'
  | 'inconsistent-winding-edge-count-drift'
  | 'candidate-zero-length-edge'
  | 'candidate-degenerate-triangle';

export type BetaSkirtCoherentEnvelopeQualityErrorCodeV1 =
  'input-invalid' | 'resource-cap-exceeded' | 'source-geometry-invalid';

export class BetaSkirtCoherentEnvelopeQualityErrorV1 extends Error {
  constructor(
    readonly code: BetaSkirtCoherentEnvelopeQualityErrorCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'BetaSkirtCoherentEnvelopeQualityErrorV1';
  }
}

export interface BetaSkirtCoherentEnvelopeQualityTransformV1 {
  readonly uniformScale: number;
  readonly translationM: readonly [number, number, number];
}

export interface BetaSkirtCoherentEnvelopeQualityInputV1 {
  readonly sourcePositionsM: Float32Array;
  readonly sourceTriangles: Uint32Array;
  readonly candidatePositionsM: Float32Array;
  readonly candidateTriangles: Uint32Array;
  readonly transform?: BetaSkirtCoherentEnvelopeQualityTransformV1;
  /** World-space X/Z axis used only for radial evidence. Defaults explicitly to [0, 0]. */
  readonly radialAxisXZ?: readonly [number, number];
}

export interface BetaSkirtCoherentEnvelopeTopologySummaryV1 {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly uniqueEdgeCount: number;
  readonly boundaryEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly inconsistentWindingEdgeCount: number;
  readonly duplicateTriangleCount: number;
  readonly referencedComponentCount: number;
  readonly componentCountIncludingIsolated: number;
  readonly isolatedVertexCount: number;
}

export interface BetaSkirtCoherentEnvelopeEdgeMetricsV1 {
  readonly comparedEdgeCount: number;
  readonly minimumLengthRatio: number;
  readonly maximumLengthRatio: number;
  readonly meanLengthRatio: number;
  readonly rootMeanSquareRelativeLengthChange: number;
  readonly maximumAbsoluteLengthChangeM: number;
  readonly rootMeanSquareAbsoluteLengthChangeM: number;
  readonly candidateZeroLengthEdgeCount: number;
}

export interface BetaSkirtCoherentEnvelopeTriangleMetricsV1 {
  readonly comparedTriangleCount: number;
  readonly minimumAreaRatio: number;
  readonly maximumAreaRatio: number;
  readonly meanAreaRatio: number;
  readonly rootMeanSquareRelativeAreaChange: number;
  readonly candidateDegenerateTriangleCount: number;
  readonly normalReversalCount: number;
  readonly maximumNormalChangeRadians: number;
  readonly rootMeanSquareNormalChangeRadians: number;
}

export interface BetaSkirtCoherentEnvelopeDisplacementMetricsV1 {
  readonly comparedVertexCount: number;
  readonly maximumDisplacementM: number;
  readonly rootMeanSquareDisplacementM: number;
  readonly maximumAbsoluteAxisDisplacementM: readonly [number, number, number];
  readonly rootMeanSquareAxisDisplacementM: readonly [number, number, number];
  readonly comparedNeighborEdgeCount: number;
  readonly maximumNeighborDisplacementGradientM: number;
  readonly rootMeanSquareNeighborDisplacementGradientM: number;
}

export interface BetaSkirtCoherentEnvelopeDihedralMetricsV1 {
  readonly sourceInteriorEdgeCount: number;
  readonly comparableInteriorEdgeCount: number;
  readonly skippedDegenerateInteriorEdgeCount: number;
  readonly sourceMaximumUnsignedDihedralRadians: number;
  readonly candidateMaximumUnsignedDihedralRadians: number;
  readonly maximumAbsoluteDihedralChangeRadians: number;
  readonly rootMeanSquareDihedralChangeRadians: number;
  readonly adjacentNormalDotSignChangeCount: number;
}

export interface BetaSkirtCoherentEnvelopeBoundingBoxV1 {
  readonly minimumM: readonly [number, number, number];
  readonly maximumM: readonly [number, number, number];
  readonly extentM: readonly [number, number, number];
}

export interface BetaSkirtCoherentEnvelopeRadialSummaryV1 {
  readonly minimumRadiusM: number;
  readonly maximumRadiusM: number;
  readonly meanRadiusM: number;
}

export interface BetaSkirtCoherentEnvelopePairedAxisDeltasV1 {
  readonly radialDeltaMinimumM: number;
  readonly radialDeltaMaximumM: number;
  readonly radialDeltaMeanM: number;
  readonly radialDeltaRootMeanSquareM: number;
  readonly yDeltaMinimumM: number;
  readonly yDeltaMaximumM: number;
  readonly yDeltaMeanM: number;
  readonly yDeltaRootMeanSquareM: number;
}

export interface BetaSkirtCoherentEnvelopeSpatialMetricsV1 {
  readonly sourceBoundingBox: BetaSkirtCoherentEnvelopeBoundingBoxV1;
  readonly candidateBoundingBox: BetaSkirtCoherentEnvelopeBoundingBoxV1;
  readonly radialAxisXZ: readonly [number, number];
  readonly radialAxisSource: 'provided' | 'default-world-origin';
  readonly sourceRadial: BetaSkirtCoherentEnvelopeRadialSummaryV1;
  readonly candidateRadial: BetaSkirtCoherentEnvelopeRadialSummaryV1;
  readonly pairedDeltas: BetaSkirtCoherentEnvelopePairedAxisDeltasV1 | null;
}

export interface BetaSkirtCoherentEnvelopeQualityReportV1 {
  readonly version: typeof BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_EVIDENCE_V1;
  readonly status: 'measured-structural-evidence' | 'blocked-structural-evidence';
  readonly coordinateFrame: 'rendered-world-meters';
  readonly transform: Readonly<{
    uniformScale: number;
    translationM: readonly [number, number, number];
    source: 'provided' | 'identity-default';
  }>;
  readonly policy: typeof BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1;
  readonly topology: Readonly<{
    source: BetaSkirtCoherentEnvelopeTopologySummaryV1;
    candidate: BetaSkirtCoherentEnvelopeTopologySummaryV1;
    vertexCountPreserved: boolean;
    triangleCountPreserved: boolean;
    triangleIndexOrderPreserved: boolean;
    vertexOrderPreservedByIndexContract: boolean;
  }>;
  readonly edge: BetaSkirtCoherentEnvelopeEdgeMetricsV1 | null;
  readonly triangle: BetaSkirtCoherentEnvelopeTriangleMetricsV1 | null;
  readonly displacement: BetaSkirtCoherentEnvelopeDisplacementMetricsV1 | null;
  readonly dihedral: BetaSkirtCoherentEnvelopeDihedralMetricsV1 | null;
  readonly spatial: BetaSkirtCoherentEnvelopeSpatialMetricsV1;
  readonly blockers: readonly BetaSkirtCoherentEnvelopeQualityBlockerV1[];
  readonly claims: Readonly<{
    exactOwnedSnapshotsUsed: true;
    topologyAndDistortionEvidenceOnly: true;
    distortionAcceptanceThresholdFrozen: false;
    collisionMeasured: false;
    initializationAdmitted: false;
    fitClaimed: false;
    runtimeAuthorityClaimed: false;
    productionAuthorityClaimed: false;
  }>;
}

interface OwnedInput {
  readonly sourcePositionsM: Float32Array;
  readonly sourceTriangles: Uint32Array;
  readonly candidatePositionsM: Float32Array;
  readonly candidateTriangles: Uint32Array;
  readonly transform: Readonly<{
    uniformScale: number;
    translationM: readonly [number, number, number];
    source: 'provided' | 'identity-default';
  }>;
  readonly radialAxisXZ: readonly [number, number];
  readonly radialAxisSource: 'provided' | 'default-world-origin';
}

interface EdgeRecord {
  readonly a: number;
  readonly b: number;
  readonly triangleIndices: number[];
  directionSum: number;
}

interface TopologyAnalysis {
  readonly summary: BetaSkirtCoherentEnvelopeTopologySummaryV1;
  readonly edges: ReadonlyMap<string, EdgeRecord>;
}

interface TriangleGeometry {
  readonly area: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly normalLength: number;
}

const INPUT_KEYS = Object.freeze([
  'sourcePositionsM',
  'sourceTriangles',
  'candidatePositionsM',
  'candidateTriangles',
  'transform',
  'radialAxisXZ',
] as const);

function fail(code: BetaSkirtCoherentEnvelopeQualityErrorCodeV1, message: string): never {
  throw new BetaSkirtCoherentEnvelopeQualityErrorV1(code, message);
}

function exactPlainRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object')
    fail('input-invalid', `${label} must be a plain object.`);
  let prototype: object | null;
  let descriptors: Record<string, PropertyDescriptor>;
  let symbolKeys: symbol[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    symbolKeys = Object.getOwnPropertySymbols(value);
  } catch {
    fail('input-invalid', `${label} could not be inspected exactly.`);
  }
  if (prototype !== Object.prototype && prototype !== null)
    fail('input-invalid', `${label} must have a plain prototype.`);
  if (symbolKeys.length !== 0) fail('input-invalid', `${label} must not have symbol keys.`);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  const actualKeys = Object.keys(descriptors);
  if (actualKeys.some((key) => !allowed.has(key)))
    fail('input-invalid', `${label} has an unsupported key.`);
  if (requiredKeys.some((key) => !Object.prototype.hasOwnProperty.call(descriptors, key)))
    fail('input-invalid', `${label} is missing a required key.`);
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of actualKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value'))
      fail('input-invalid', `${label}.${key} must be a data property.`);
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function exactNumberTuple(value: unknown, length: 2 | 3, label: string): readonly number[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    fail('input-invalid', `${label} must be an exact array.`);
  const names = Object.getOwnPropertyNames(value);
  if (
    value.length !== length ||
    names.length !== length + 1 ||
    !names.includes('length') ||
    Array.from({ length }, (_, index) => String(index)).some((key) => !names.includes(key)) ||
    Object.getOwnPropertySymbols(value).length !== 0
  )
    fail('input-invalid', `${label} must have exactly ${length} numeric entries.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value'))
      fail('input-invalid', `${label}[${index}] must be a data property.`);
    if (typeof descriptor.value !== 'number' || !Number.isFinite(descriptor.value))
      fail('input-invalid', `${label}[${index}] must be finite.`);
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}

function exactArrayBuffer(buffer: ArrayBuffer, label: string): void {
  if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype)
    fail('input-invalid', `${label} buffer must have the exact ArrayBuffer prototype.`);
  if (
    Object.getOwnPropertyNames(buffer).length !== 0 ||
    Object.getOwnPropertySymbols(buffer).length !== 0
  )
    fail('input-invalid', `${label} buffer must not be decorated.`);
  if ((buffer as ArrayBuffer & { readonly resizable?: boolean }).resizable === true)
    fail('input-invalid', `${label} buffer must not be resizable.`);
}

function assertExactTypedArrayStorage(
  value: unknown,
  constructor: Float32ArrayConstructor | Uint32ArrayConstructor,
  label: string,
  maximumElementCount: number,
): Float32Array | Uint32Array {
  if (
    !ArrayBuffer.isView(value) ||
    !(value instanceof constructor) ||
    Object.getPrototypeOf(value) !== constructor.prototype
  )
    fail('input-invalid', `${label} must be one exact typed array.`);
  if (typeof SharedArrayBuffer !== 'undefined' && value.buffer instanceof SharedArrayBuffer)
    fail('input-invalid', `${label} must not use SharedArrayBuffer.`);
  if (!(value.buffer instanceof ArrayBuffer))
    fail('input-invalid', `${label} must use ArrayBuffer storage.`);
  exactArrayBuffer(value.buffer, label);
  if (value.byteOffset !== 0 || value.byteLength !== value.buffer.byteLength)
    fail('input-invalid', `${label} must own its complete buffer.`);
  if (value.length > maximumElementCount)
    fail('resource-cap-exceeded', `${label} exceeds its predeclared element cap.`);
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length || Object.getOwnPropertySymbols(value).length !== 0)
    fail('input-invalid', `${label} must not be decorated.`);
  return value;
}

function ownFloat32Array(value: unknown, label: string): Float32Array {
  const exact = assertExactTypedArrayStorage(
    value,
    Float32Array,
    label,
    BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumVertexCount * 3,
  ) as Float32Array;
  const owned = new Float32Array(exact.length);
  for (let index = 0; index < exact.length; index += 1) owned[index] = exact[index];
  return owned;
}

function ownUint32Array(value: unknown, label: string): Uint32Array {
  const exact = assertExactTypedArrayStorage(
    value,
    Uint32Array,
    label,
    BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumTriangleCount * 3,
  ) as Uint32Array;
  const owned = new Uint32Array(exact.length);
  for (let index = 0; index < exact.length; index += 1) owned[index] = exact[index];
  return owned;
}

function snapshotInput(value: BetaSkirtCoherentEnvelopeQualityInputV1): OwnedInput {
  const record = exactPlainRecord(
    value,
    INPUT_KEYS.slice(0, 4),
    INPUT_KEYS.slice(4),
    'quality input',
  );
  const originalArrays = [
    assertExactTypedArrayStorage(
      record.sourcePositionsM,
      Float32Array,
      'sourcePositionsM',
      BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumVertexCount * 3,
    ),
    assertExactTypedArrayStorage(
      record.sourceTriangles,
      Uint32Array,
      'sourceTriangles',
      BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumTriangleCount * 3,
    ),
    assertExactTypedArrayStorage(
      record.candidatePositionsM,
      Float32Array,
      'candidatePositionsM',
      BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumVertexCount * 3,
    ),
    assertExactTypedArrayStorage(
      record.candidateTriangles,
      Uint32Array,
      'candidateTriangles',
      BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumTriangleCount * 3,
    ),
  ];
  if (new Set(originalArrays.map((array) => array.buffer)).size !== originalArrays.length)
    fail('input-invalid', 'Quality input typed arrays must not alias storage.');

  let transformSource: 'provided' | 'identity-default' = 'identity-default';
  let uniformScale = 1;
  let translationM = Object.freeze([0, 0, 0]) as readonly [number, number, number];
  if (Object.prototype.hasOwnProperty.call(record, 'transform')) {
    const transform = exactPlainRecord(
      record.transform,
      ['uniformScale', 'translationM'],
      [],
      'transform',
    );
    if (
      typeof transform.uniformScale !== 'number' ||
      !Number.isFinite(transform.uniformScale) ||
      transform.uniformScale <= 0 ||
      transform.uniformScale > BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumUniformScale
    )
      fail('input-invalid', 'transform.uniformScale is invalid.');
    const tuple = exactNumberTuple(transform.translationM, 3, 'transform.translationM');
    if (
      tuple.some(
        (coordinate) =>
          Math.abs(coordinate) >
          BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumCoordinateMagnitudeM,
      )
    )
      fail('input-invalid', 'transform.translationM exceeds the coordinate cap.');
    uniformScale = transform.uniformScale;
    translationM = Object.freeze([tuple[0], tuple[1], tuple[2]]);
    transformSource = 'provided';
  }

  let radialAxisSource: 'provided' | 'default-world-origin' = 'default-world-origin';
  let radialAxisXZ = Object.freeze([0, 0]) as readonly [number, number];
  if (Object.prototype.hasOwnProperty.call(record, 'radialAxisXZ')) {
    const tuple = exactNumberTuple(record.radialAxisXZ, 2, 'radialAxisXZ');
    if (
      tuple.some(
        (coordinate) =>
          Math.abs(coordinate) >
          BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumCoordinateMagnitudeM,
      )
    )
      fail('input-invalid', 'radialAxisXZ exceeds the coordinate cap.');
    radialAxisXZ = Object.freeze([tuple[0], tuple[1]]);
    radialAxisSource = 'provided';
  }

  return Object.freeze({
    sourcePositionsM: ownFloat32Array(record.sourcePositionsM, 'sourcePositionsM'),
    sourceTriangles: ownUint32Array(record.sourceTriangles, 'sourceTriangles'),
    candidatePositionsM: ownFloat32Array(record.candidatePositionsM, 'candidatePositionsM'),
    candidateTriangles: ownUint32Array(record.candidateTriangles, 'candidateTriangles'),
    transform: Object.freeze({ uniformScale, translationM, source: transformSource }),
    radialAxisXZ,
    radialAxisSource,
  });
}

function validateGeometryShape(
  positions: Float32Array,
  triangles: Uint32Array,
  label: 'source' | 'candidate',
): void {
  if (positions.length < 9 || positions.length % 3 !== 0)
    fail('input-invalid', `${label} positions must contain complete xyz vertices.`);
  if (triangles.length < 3 || triangles.length % 3 !== 0)
    fail('input-invalid', `${label} triangles must contain complete index triples.`);
  const vertexCount = positions.length / 3;
  const triangleCount = triangles.length / 3;
  if (vertexCount > BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumVertexCount)
    fail('resource-cap-exceeded', `${label} vertex count exceeds the predeclared cap.`);
  if (triangleCount > BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumTriangleCount)
    fail('resource-cap-exceeded', `${label} triangle count exceeds the predeclared cap.`);
  if (triangleCount * 3 > BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumEdgeIncidenceCount)
    fail('resource-cap-exceeded', `${label} edge incidence count exceeds the predeclared cap.`);
  for (let index = 0; index < positions.length; index += 1) {
    const coordinate = positions[index];
    if (
      !Number.isFinite(coordinate) ||
      Math.abs(coordinate) >
        BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumCoordinateMagnitudeM
    )
      fail('input-invalid', `${label} position ${index} is invalid.`);
  }
  for (let index = 0; index < triangles.length; index += 1) {
    if (triangles[index] >= vertexCount)
      fail('input-invalid', `${label} triangle index ${index} is out of range.`);
  }
}

function worldPositions(
  local: Float32Array,
  transform: OwnedInput['transform'],
  label: string,
): Float64Array {
  const world = new Float64Array(local.length);
  const [tx, ty, tz] = transform.translationM;
  for (let index = 0; index < local.length; index += 3) {
    world[index] = local[index] * transform.uniformScale + tx;
    world[index + 1] = local[index + 1] * transform.uniformScale + ty;
    world[index + 2] = local[index + 2] * transform.uniformScale + tz;
    for (let axis = 0; axis < 3; axis += 1) {
      const coordinate = world[index + axis];
      if (
        !Number.isFinite(coordinate) ||
        Math.abs(coordinate) >
          BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumCoordinateMagnitudeM
      )
        fail('input-invalid', `${label} transformed coordinate is invalid.`);
    }
  }
  return world;
}

class UnionFind {
  private readonly parent: Int32Array;
  private readonly rank: Uint8Array;

  constructor(size: number) {
    this.parent = new Int32Array(size);
    this.rank = new Uint8Array(size);
    for (let index = 0; index < size; index += 1) this.parent[index] = index;
  }

  find(value: number): number {
    let root = value;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[value] !== value) {
      const next = this.parent[value];
      this.parent[value] = root;
      value = next;
    }
    return root;
  }

  union(left: number, right: number): void {
    let leftRoot = this.find(left);
    let rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    if (this.rank[leftRoot] < this.rank[rightRoot]) [leftRoot, rightRoot] = [rightRoot, leftRoot];
    this.parent[rightRoot] = leftRoot;
    if (this.rank[leftRoot] === this.rank[rightRoot]) this.rank[leftRoot] += 1;
  }
}

function addEdge(
  edges: Map<string, EdgeRecord>,
  a: number,
  b: number,
  triangleIndex: number,
): void {
  const minimum = Math.min(a, b);
  const maximum = Math.max(a, b);
  const key = `${minimum}:${maximum}`;
  const direction = a === minimum ? 1 : -1;
  const existing = edges.get(key);
  if (existing) {
    existing.triangleIndices.push(triangleIndex);
    existing.directionSum += direction;
    return;
  }
  if (edges.size >= BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1.maximumUniqueEdgeCount)
    fail('resource-cap-exceeded', 'Unique edge count exceeds the predeclared cap.');
  edges.set(key, {
    a: minimum,
    b: maximum,
    triangleIndices: [triangleIndex],
    directionSum: direction,
  });
}

function analyzeTopology(vertexCount: number, triangles: Uint32Array): TopologyAnalysis {
  const edges = new Map<string, EdgeRecord>();
  const unionFind = new UnionFind(vertexCount);
  const referenced = new Uint8Array(vertexCount);
  const triangleKeys = new Set<string>();
  let duplicateTriangleCount = 0;
  for (
    let offset = 0, triangleIndex = 0;
    offset < triangles.length;
    offset += 3, triangleIndex += 1
  ) {
    const a = triangles[offset];
    const b = triangles[offset + 1];
    const c = triangles[offset + 2];
    referenced[a] = 1;
    referenced[b] = 1;
    referenced[c] = 1;
    unionFind.union(a, b);
    unionFind.union(b, c);
    unionFind.union(c, a);
    addEdge(edges, a, b, triangleIndex);
    addEdge(edges, b, c, triangleIndex);
    addEdge(edges, c, a, triangleIndex);
    const key = [a, b, c].sort((left, right) => left - right).join(':');
    if (triangleKeys.has(key)) duplicateTriangleCount += 1;
    else triangleKeys.add(key);
  }
  const roots = new Set<number>();
  let isolatedVertexCount = 0;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (referenced[vertex] === 1) roots.add(unionFind.find(vertex));
    else isolatedVertexCount += 1;
  }
  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  let inconsistentWindingEdgeCount = 0;
  for (const edge of edges.values()) {
    if (edge.triangleIndices.length === 1) boundaryEdgeCount += 1;
    else if (edge.triangleIndices.length > 2) nonManifoldEdgeCount += 1;
    if (edge.triangleIndices.length === 2 && edge.directionSum !== 0)
      inconsistentWindingEdgeCount += 1;
  }
  return Object.freeze({
    summary: Object.freeze({
      vertexCount,
      triangleCount: triangles.length / 3,
      uniqueEdgeCount: edges.size,
      boundaryEdgeCount,
      nonManifoldEdgeCount,
      inconsistentWindingEdgeCount,
      duplicateTriangleCount,
      referencedComponentCount: roots.size,
      componentCountIncludingIsolated: roots.size + isolatedVertexCount,
      isolatedVertexCount,
    }),
    edges,
  });
}

function triangleGeometry(
  positions: Float64Array,
  triangles: Uint32Array,
): readonly TriangleGeometry[] {
  const geometry: TriangleGeometry[] = [];
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const ai = triangles[offset] * 3;
    const bi = triangles[offset + 1] * 3;
    const ci = triangles[offset + 2] * 3;
    const abx = positions[bi] - positions[ai];
    const aby = positions[bi + 1] - positions[ai + 1];
    const abz = positions[bi + 2] - positions[ai + 2];
    const acx = positions[ci] - positions[ai];
    const acy = positions[ci + 1] - positions[ai + 1];
    const acz = positions[ci + 2] - positions[ai + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const normalLength = Math.hypot(nx, ny, nz);
    geometry.push(Object.freeze({ area: normalLength / 2, nx, ny, nz, normalLength }));
  }
  return Object.freeze(geometry);
}

function distance(positions: Float64Array, left: number, right: number): number {
  const leftOffset = left * 3;
  const rightOffset = right * 3;
  return Math.hypot(
    positions[rightOffset] - positions[leftOffset],
    positions[rightOffset + 1] - positions[leftOffset + 1],
    positions[rightOffset + 2] - positions[leftOffset + 2],
  );
}

function compareEdges(
  sourcePositions: Float64Array,
  candidatePositions: Float64Array,
  edges: ReadonlyMap<string, EdgeRecord>,
): BetaSkirtCoherentEnvelopeEdgeMetricsV1 {
  let minimumLengthRatio = Number.POSITIVE_INFINITY;
  let maximumLengthRatio = Number.NEGATIVE_INFINITY;
  let ratioSum = 0;
  let relativeSquaredSum = 0;
  let maximumAbsoluteLengthChangeM = 0;
  let absoluteSquaredSum = 0;
  let candidateZeroLengthEdgeCount = 0;
  for (const edge of edges.values()) {
    const sourceLength = distance(sourcePositions, edge.a, edge.b);
    if (!(sourceLength > 0))
      fail('source-geometry-invalid', 'Source contains a zero-length topology edge.');
    const candidateLength = distance(candidatePositions, edge.a, edge.b);
    if (!(candidateLength > 0)) candidateZeroLengthEdgeCount += 1;
    const ratio = candidateLength / sourceLength;
    const absolute = Math.abs(candidateLength - sourceLength);
    minimumLengthRatio = Math.min(minimumLengthRatio, ratio);
    maximumLengthRatio = Math.max(maximumLengthRatio, ratio);
    ratioSum += ratio;
    relativeSquaredSum += (ratio - 1) ** 2;
    maximumAbsoluteLengthChangeM = Math.max(maximumAbsoluteLengthChangeM, absolute);
    absoluteSquaredSum += absolute ** 2;
  }
  const count = edges.size;
  return Object.freeze({
    comparedEdgeCount: count,
    minimumLengthRatio,
    maximumLengthRatio,
    meanLengthRatio: ratioSum / count,
    rootMeanSquareRelativeLengthChange: Math.sqrt(relativeSquaredSum / count),
    maximumAbsoluteLengthChangeM,
    rootMeanSquareAbsoluteLengthChangeM: Math.sqrt(absoluteSquaredSum / count),
    candidateZeroLengthEdgeCount,
  });
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function normalAngle(left: TriangleGeometry, right: TriangleGeometry): number | null {
  if (!(left.normalLength > 0) || !(right.normalLength > 0)) return null;
  return Math.acos(
    clampUnit(
      (left.nx * right.nx + left.ny * right.ny + left.nz * right.nz) /
        (left.normalLength * right.normalLength),
    ),
  );
}

function compareTriangles(
  source: readonly TriangleGeometry[],
  candidate: readonly TriangleGeometry[],
): BetaSkirtCoherentEnvelopeTriangleMetricsV1 {
  let minimumAreaRatio = Number.POSITIVE_INFINITY;
  let maximumAreaRatio = Number.NEGATIVE_INFINITY;
  let areaRatioSum = 0;
  let relativeAreaSquaredSum = 0;
  let candidateDegenerateTriangleCount = 0;
  let normalReversalCount = 0;
  let maximumNormalChangeRadians = 0;
  let normalSquaredSum = 0;
  for (let index = 0; index < source.length; index += 1) {
    const sourceTriangle = source[index];
    const candidateTriangle = candidate[index];
    if (!(sourceTriangle.area > 0))
      fail('source-geometry-invalid', `Source triangle ${index} is degenerate.`);
    if (!(candidateTriangle.area > 0)) candidateDegenerateTriangleCount += 1;
    const ratio = candidateTriangle.area / sourceTriangle.area;
    minimumAreaRatio = Math.min(minimumAreaRatio, ratio);
    maximumAreaRatio = Math.max(maximumAreaRatio, ratio);
    areaRatioSum += ratio;
    relativeAreaSquaredSum += (ratio - 1) ** 2;
    if (candidateTriangle.normalLength > 0) {
      const dot =
        sourceTriangle.nx * candidateTriangle.nx +
        sourceTriangle.ny * candidateTriangle.ny +
        sourceTriangle.nz * candidateTriangle.nz;
      if (dot < 0) normalReversalCount += 1;
      const angle = normalAngle(sourceTriangle, candidateTriangle) ?? 0;
      maximumNormalChangeRadians = Math.max(maximumNormalChangeRadians, angle);
      normalSquaredSum += angle ** 2;
    }
  }
  return Object.freeze({
    comparedTriangleCount: source.length,
    minimumAreaRatio,
    maximumAreaRatio,
    meanAreaRatio: areaRatioSum / source.length,
    rootMeanSquareRelativeAreaChange: Math.sqrt(relativeAreaSquaredSum / source.length),
    candidateDegenerateTriangleCount,
    normalReversalCount,
    maximumNormalChangeRadians,
    rootMeanSquareNormalChangeRadians: Math.sqrt(normalSquaredSum / source.length),
  });
}

function displacementMetrics(
  source: Float64Array,
  candidate: Float64Array,
  edges: ReadonlyMap<string, EdgeRecord>,
): BetaSkirtCoherentEnvelopeDisplacementMetricsV1 {
  const displacement = new Float64Array(source.length);
  let maximumDisplacementM = 0;
  let squaredSum = 0;
  const maximumAxis = [0, 0, 0];
  const axisSquaredSum = [0, 0, 0];
  const vertexCount = source.length / 3;
  for (let index = 0; index < source.length; index += 3) {
    let squared = 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const delta = candidate[index + axis] - source[index + axis];
      displacement[index + axis] = delta;
      maximumAxis[axis] = Math.max(maximumAxis[axis], Math.abs(delta));
      axisSquaredSum[axis] += delta ** 2;
      squared += delta ** 2;
    }
    const magnitude = Math.sqrt(squared);
    maximumDisplacementM = Math.max(maximumDisplacementM, magnitude);
    squaredSum += squared;
  }
  let maximumNeighborDisplacementGradientM = 0;
  let neighborSquaredSum = 0;
  for (const edge of edges.values()) {
    const a = edge.a * 3;
    const b = edge.b * 3;
    const gradient = Math.hypot(
      displacement[a] - displacement[b],
      displacement[a + 1] - displacement[b + 1],
      displacement[a + 2] - displacement[b + 2],
    );
    maximumNeighborDisplacementGradientM = Math.max(maximumNeighborDisplacementGradientM, gradient);
    neighborSquaredSum += gradient ** 2;
  }
  return Object.freeze({
    comparedVertexCount: vertexCount,
    maximumDisplacementM,
    rootMeanSquareDisplacementM: Math.sqrt(squaredSum / vertexCount),
    maximumAbsoluteAxisDisplacementM: Object.freeze(maximumAxis) as readonly [
      number,
      number,
      number,
    ],
    rootMeanSquareAxisDisplacementM: Object.freeze(
      axisSquaredSum.map((value) => Math.sqrt(value / vertexCount)),
    ) as readonly [number, number, number],
    comparedNeighborEdgeCount: edges.size,
    maximumNeighborDisplacementGradientM,
    rootMeanSquareNeighborDisplacementGradientM: Math.sqrt(neighborSquaredSum / edges.size),
  });
}

function compareDihedrals(
  edges: ReadonlyMap<string, EdgeRecord>,
  sourceTriangles: readonly TriangleGeometry[],
  candidateTriangles: readonly TriangleGeometry[],
): BetaSkirtCoherentEnvelopeDihedralMetricsV1 {
  let sourceInteriorEdgeCount = 0;
  let comparableInteriorEdgeCount = 0;
  let skippedDegenerateInteriorEdgeCount = 0;
  let sourceMaximumUnsignedDihedralRadians = 0;
  let candidateMaximumUnsignedDihedralRadians = 0;
  let maximumAbsoluteDihedralChangeRadians = 0;
  let dihedralSquaredSum = 0;
  let adjacentNormalDotSignChangeCount = 0;
  for (const edge of edges.values()) {
    if (edge.triangleIndices.length !== 2) continue;
    sourceInteriorEdgeCount += 1;
    const leftIndex = edge.triangleIndices[0];
    const rightIndex = edge.triangleIndices[1];
    const sourceLeft = sourceTriangles[leftIndex];
    const sourceRight = sourceTriangles[rightIndex];
    const candidateLeft = candidateTriangles[leftIndex];
    const candidateRight = candidateTriangles[rightIndex];
    const sourceAngle = normalAngle(sourceLeft, sourceRight);
    const candidateAngle = normalAngle(candidateLeft, candidateRight);
    if (sourceAngle === null || candidateAngle === null) {
      skippedDegenerateInteriorEdgeCount += 1;
      continue;
    }
    comparableInteriorEdgeCount += 1;
    sourceMaximumUnsignedDihedralRadians = Math.max(
      sourceMaximumUnsignedDihedralRadians,
      sourceAngle,
    );
    candidateMaximumUnsignedDihedralRadians = Math.max(
      candidateMaximumUnsignedDihedralRadians,
      candidateAngle,
    );
    const change = Math.abs(candidateAngle - sourceAngle);
    maximumAbsoluteDihedralChangeRadians = Math.max(maximumAbsoluteDihedralChangeRadians, change);
    dihedralSquaredSum += change ** 2;
    const sourceDot =
      sourceLeft.nx * sourceRight.nx +
      sourceLeft.ny * sourceRight.ny +
      sourceLeft.nz * sourceRight.nz;
    const candidateDot =
      candidateLeft.nx * candidateRight.nx +
      candidateLeft.ny * candidateRight.ny +
      candidateLeft.nz * candidateRight.nz;
    if ((sourceDot < 0 && candidateDot >= 0) || (sourceDot >= 0 && candidateDot < 0))
      adjacentNormalDotSignChangeCount += 1;
  }
  return Object.freeze({
    sourceInteriorEdgeCount,
    comparableInteriorEdgeCount,
    skippedDegenerateInteriorEdgeCount,
    sourceMaximumUnsignedDihedralRadians,
    candidateMaximumUnsignedDihedralRadians,
    maximumAbsoluteDihedralChangeRadians,
    rootMeanSquareDihedralChangeRadians:
      comparableInteriorEdgeCount > 0
        ? Math.sqrt(dihedralSquaredSum / comparableInteriorEdgeCount)
        : 0,
    adjacentNormalDotSignChangeCount,
  });
}

function boundingBox(positions: Float64Array): BetaSkirtCoherentEnvelopeBoundingBoxV1 {
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], positions[index + axis]);
      maximum[axis] = Math.max(maximum[axis], positions[index + axis]);
    }
  }
  return Object.freeze({
    minimumM: Object.freeze(minimum) as readonly [number, number, number],
    maximumM: Object.freeze(maximum) as readonly [number, number, number],
    extentM: Object.freeze(maximum.map((value, axis) => value - minimum[axis])) as readonly [
      number,
      number,
      number,
    ],
  });
}

function radialSummary(
  positions: Float64Array,
  axis: readonly [number, number],
): BetaSkirtCoherentEnvelopeRadialSummaryV1 {
  let minimumRadiusM = Number.POSITIVE_INFINITY;
  let maximumRadiusM = 0;
  let sum = 0;
  const count = positions.length / 3;
  for (let index = 0; index < positions.length; index += 3) {
    const radius = Math.hypot(positions[index] - axis[0], positions[index + 2] - axis[1]);
    minimumRadiusM = Math.min(minimumRadiusM, radius);
    maximumRadiusM = Math.max(maximumRadiusM, radius);
    sum += radius;
  }
  return Object.freeze({ minimumRadiusM, maximumRadiusM, meanRadiusM: sum / count });
}

function pairedAxisDeltas(
  source: Float64Array,
  candidate: Float64Array,
  axis: readonly [number, number],
): BetaSkirtCoherentEnvelopePairedAxisDeltasV1 {
  let radialDeltaMinimumM = Number.POSITIVE_INFINITY;
  let radialDeltaMaximumM = Number.NEGATIVE_INFINITY;
  let radialSum = 0;
  let radialSquaredSum = 0;
  let yDeltaMinimumM = Number.POSITIVE_INFINITY;
  let yDeltaMaximumM = Number.NEGATIVE_INFINITY;
  let ySum = 0;
  let ySquaredSum = 0;
  const count = source.length / 3;
  for (let index = 0; index < source.length; index += 3) {
    const sourceRadius = Math.hypot(source[index] - axis[0], source[index + 2] - axis[1]);
    const candidateRadius = Math.hypot(candidate[index] - axis[0], candidate[index + 2] - axis[1]);
    const radialDelta = candidateRadius - sourceRadius;
    const yDelta = candidate[index + 1] - source[index + 1];
    radialDeltaMinimumM = Math.min(radialDeltaMinimumM, radialDelta);
    radialDeltaMaximumM = Math.max(radialDeltaMaximumM, radialDelta);
    radialSum += radialDelta;
    radialSquaredSum += radialDelta ** 2;
    yDeltaMinimumM = Math.min(yDeltaMinimumM, yDelta);
    yDeltaMaximumM = Math.max(yDeltaMaximumM, yDelta);
    ySum += yDelta;
    ySquaredSum += yDelta ** 2;
  }
  return Object.freeze({
    radialDeltaMinimumM,
    radialDeltaMaximumM,
    radialDeltaMeanM: radialSum / count,
    radialDeltaRootMeanSquareM: Math.sqrt(radialSquaredSum / count),
    yDeltaMinimumM,
    yDeltaMaximumM,
    yDeltaMeanM: ySum / count,
    yDeltaRootMeanSquareM: Math.sqrt(ySquaredSum / count),
  });
}

function sameIndices(left: Uint32Array, right: Uint32Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function pushBlocker(
  blockers: BetaSkirtCoherentEnvelopeQualityBlockerV1[],
  blocker: BetaSkirtCoherentEnvelopeQualityBlockerV1,
): void {
  if (!blockers.includes(blocker)) blockers.push(blocker);
}

/**
 * Produces structural and distortion evidence for a candidate without granting collision,
 * initialization, fit, runtime, or production authority. No distortion threshold is inferred from
 * the observed candidate.
 */
export function evaluateBetaSkirtCoherentEnvelopeQualityV1(
  input: BetaSkirtCoherentEnvelopeQualityInputV1,
): BetaSkirtCoherentEnvelopeQualityReportV1 {
  const snapshot = snapshotInput(input);
  validateGeometryShape(snapshot.sourcePositionsM, snapshot.sourceTriangles, 'source');
  validateGeometryShape(snapshot.candidatePositionsM, snapshot.candidateTriangles, 'candidate');
  const sourceWorld = worldPositions(snapshot.sourcePositionsM, snapshot.transform, 'source');
  const candidateWorld = worldPositions(
    snapshot.candidatePositionsM,
    snapshot.transform,
    'candidate',
  );
  const sourceTopology = analyzeTopology(sourceWorld.length / 3, snapshot.sourceTriangles);
  const candidateTopology = analyzeTopology(candidateWorld.length / 3, snapshot.candidateTriangles);
  const sourceTriangles = triangleGeometry(sourceWorld, snapshot.sourceTriangles);
  const candidateTriangles = triangleGeometry(candidateWorld, snapshot.candidateTriangles);
  for (let index = 0; index < sourceTriangles.length; index += 1) {
    if (!(sourceTriangles[index].area > 0))
      fail('source-geometry-invalid', `Source triangle ${index} is degenerate.`);
  }
  for (const edge of sourceTopology.edges.values()) {
    if (!(distance(sourceWorld, edge.a, edge.b) > 0))
      fail('source-geometry-invalid', 'Source contains a zero-length topology edge.');
  }

  const vertexCountPreserved =
    sourceTopology.summary.vertexCount === candidateTopology.summary.vertexCount;
  const triangleCountPreserved =
    sourceTopology.summary.triangleCount === candidateTopology.summary.triangleCount;
  const triangleIndexOrderPreserved = sameIndices(
    snapshot.sourceTriangles,
    snapshot.candidateTriangles,
  );
  const topologyComparable =
    vertexCountPreserved && triangleCountPreserved && triangleIndexOrderPreserved;
  const blockers: BetaSkirtCoherentEnvelopeQualityBlockerV1[] = [];
  if (!vertexCountPreserved) pushBlocker(blockers, 'vertex-count-mismatch');
  if (!triangleCountPreserved) pushBlocker(blockers, 'triangle-count-mismatch');
  if (!triangleIndexOrderPreserved) pushBlocker(blockers, 'triangle-index-order-mismatch');
  if (
    sourceTopology.summary.componentCountIncludingIsolated !==
    candidateTopology.summary.componentCountIncludingIsolated
  )
    pushBlocker(blockers, 'component-count-drift');
  if (sourceTopology.summary.boundaryEdgeCount !== candidateTopology.summary.boundaryEdgeCount)
    pushBlocker(blockers, 'boundary-edge-count-drift');
  if (
    sourceTopology.summary.nonManifoldEdgeCount !== candidateTopology.summary.nonManifoldEdgeCount
  )
    pushBlocker(blockers, 'nonmanifold-edge-count-drift');
  if (
    sourceTopology.summary.inconsistentWindingEdgeCount !==
    candidateTopology.summary.inconsistentWindingEdgeCount
  )
    pushBlocker(blockers, 'inconsistent-winding-edge-count-drift');

  let edge: BetaSkirtCoherentEnvelopeEdgeMetricsV1 | null = null;
  let triangle: BetaSkirtCoherentEnvelopeTriangleMetricsV1 | null = null;
  let displacement: BetaSkirtCoherentEnvelopeDisplacementMetricsV1 | null = null;
  let dihedral: BetaSkirtCoherentEnvelopeDihedralMetricsV1 | null = null;
  if (topologyComparable) {
    edge = compareEdges(sourceWorld, candidateWorld, sourceTopology.edges);
    triangle = compareTriangles(sourceTriangles, candidateTriangles);
    displacement = displacementMetrics(sourceWorld, candidateWorld, sourceTopology.edges);
    dihedral = compareDihedrals(sourceTopology.edges, sourceTriangles, candidateTriangles);
    if (edge.candidateZeroLengthEdgeCount > 0) pushBlocker(blockers, 'candidate-zero-length-edge');
    if (triangle.candidateDegenerateTriangleCount > 0)
      pushBlocker(blockers, 'candidate-degenerate-triangle');
  }

  const spatial = Object.freeze({
    sourceBoundingBox: boundingBox(sourceWorld),
    candidateBoundingBox: boundingBox(candidateWorld),
    radialAxisXZ: snapshot.radialAxisXZ,
    radialAxisSource: snapshot.radialAxisSource,
    sourceRadial: radialSummary(sourceWorld, snapshot.radialAxisXZ),
    candidateRadial: radialSummary(candidateWorld, snapshot.radialAxisXZ),
    pairedDeltas: vertexCountPreserved
      ? pairedAxisDeltas(sourceWorld, candidateWorld, snapshot.radialAxisXZ)
      : null,
  });

  return Object.freeze({
    version: BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_EVIDENCE_V1,
    status:
      blockers.length === 0
        ? ('measured-structural-evidence' as const)
        : ('blocked-structural-evidence' as const),
    coordinateFrame: 'rendered-world-meters' as const,
    transform: snapshot.transform,
    policy: BETA_SKIRT_COHERENT_ENVELOPE_QUALITY_POLICY_V1,
    topology: Object.freeze({
      source: sourceTopology.summary,
      candidate: candidateTopology.summary,
      vertexCountPreserved,
      triangleCountPreserved,
      triangleIndexOrderPreserved,
      vertexOrderPreservedByIndexContract: topologyComparable,
    }),
    edge,
    triangle,
    displacement,
    dihedral,
    spatial,
    blockers: Object.freeze(blockers),
    claims: Object.freeze({
      exactOwnedSnapshotsUsed: true as const,
      topologyAndDistortionEvidenceOnly: true as const,
      distortionAcceptanceThresholdFrozen: false as const,
      collisionMeasured: false as const,
      initializationAdmitted: false as const,
      fitClaimed: false as const,
      runtimeAuthorityClaimed: false as const,
      productionAuthorityClaimed: false as const,
    }),
  });
}
