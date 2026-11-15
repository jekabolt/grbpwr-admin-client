import type {
  AxisAlignedBoundingBoxM,
  BodyPoseKind,
  DisplayMeshData,
  PoseDescriptor,
  Vec3M,
} from './contracts';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import { deriveStaticBodyDimensionsM } from './measurement-body-provider';

export const MEASUREMENT_DISPLAY_MESH_V1 = 'measurement-display-mesh/v1' as const;
export const MEASUREMENT_DISPLAY_TESSELLATION_V1 = 'measurement-display-tessellation/v1' as const;

export type MeasurementDisplayConfidenceV1 = 'medium' | 'low';

export interface MeasurementDisplayAssumptionV1 {
  readonly id: string;
  readonly confidence: MeasurementDisplayConfidenceV1;
  readonly description: string;
}

export interface MeasurementDisplayTessellationV1 {
  readonly version: typeof MEASUREMENT_DISPLAY_TESSELLATION_V1;
  readonly radialSegments: number;
  readonly headLatitudeSegments: number;
  readonly maxVertices: number;
  readonly maxTriangles: number;
}

export const DEFAULT_MEASUREMENT_DISPLAY_TESSELLATION_V1: MeasurementDisplayTessellationV1 =
  Object.freeze({
    version: MEASUREMENT_DISPLAY_TESSELLATION_V1,
    radialSegments: 16,
    headLatitudeSegments: 10,
    maxVertices: 4_096,
    maxTriangles: 8_192,
  });

export type MeasurementDisplayPrimitiveKindV1 = 'torso-loft' | 'tapered-segment' | 'ellipsoid';

export interface MeasurementDisplayPrimitiveRangeV1 {
  readonly id: string;
  readonly kind: MeasurementDisplayPrimitiveKindV1;
  readonly vertexOffset: number;
  readonly vertexCount: number;
  readonly triangleOffset: number;
  readonly triangleCount: number;
}

export interface MeasurementDisplaySectionV1 {
  readonly id: 'chest' | 'waist' | 'hip';
  readonly yM: number;
  readonly circumferenceM: number;
  readonly halfWidthM: number;
  readonly halfDepthM: number;
  readonly depthToWidthRatio: number;
  readonly confidence: 'low';
}

export interface MeasurementDisplayMeshArtifactV1 {
  readonly version: typeof MEASUREMENT_DISPLAY_MESH_V1;
  readonly id: 'measurement-display-mannequin-v1';
  /** Same-JS-runtime diagnostic revision, not a persisted or sealed content identity. */
  readonly revision: string;
  /** FNV32 local cache/debug hint over native typed-array bytes; collision-prone by design. */
  readonly geometryFingerprint: string;
  readonly identityBoundary: {
    readonly localFingerprintAlgorithm: 'fnv1a32';
    readonly deterministicScope: 'same-js-runtime';
    readonly persistedOrSealedIdentityEligible: false;
    readonly persistedOrSealedIdentityRequirement: 'canonical-binary-sha256';
  };
  readonly units: 'm';
  readonly coordinateSystem: PoseDescriptor['coordinateSystem'];
  readonly pose: {
    readonly kind: BodyPoseKind;
    readonly armDownAngleDeg: number;
  };
  /** Independently closed pieces overlap. Their union is intentionally not manifold/watertight. */
  readonly topology: 'overlapping-segmented-proxy-non-watertight';
  readonly purpose: 'display-only';
  readonly collision: {
    readonly included: false;
    readonly authority: 'body-artifact-collision-lods';
  };
  readonly fitClaimEligible: false;
  readonly mesh: DisplayMeshData;
  readonly boundingBoxM: AxisAlignedBoundingBoxM;
  readonly source: {
    readonly schemaVersion: CanonicalBodyMeasurementsMm['schemaVersion'];
    readonly sourceRevision: string;
    readonly measurementFingerprint: string;
  };
  readonly sections: readonly MeasurementDisplaySectionV1[];
  readonly assumptions: readonly MeasurementDisplayAssumptionV1[];
  readonly tessellation: MeasurementDisplayTessellationV1;
  readonly primitiveRanges: readonly MeasurementDisplayPrimitiveRangeV1[];
}

type MutableMesh = { readonly positions: number[]; readonly triangles: number[] };

interface Ring {
  readonly center: Vec3M;
  readonly halfWidthM: number;
  readonly halfDepthM: number;
}

const TWO_PI = Math.PI * 2;
const SHOULDER_TO_WAIST_VERTICAL_TO_STATURE = 0.235;
const COORDINATE_SYSTEM: PoseDescriptor['coordinateSystem'] = Object.freeze({
  handedness: 'right',
  up: '+Y',
  front: '+Z',
  subjectLeft: '+X',
  origin: 'ground-projection-between-ankles',
});

const ASSUMPTIONS: readonly MeasurementDisplayAssumptionV1[] = Object.freeze([
  Object.freeze({
    id: 'torso-depth-ratios',
    confidence: 'low',
    description:
      'Chest, waist, and hip use fixed front/back-depth-to-width ratios because circumferences do not determine depth.',
  }),
  Object.freeze({
    id: 'bilateral-symmetry',
    confidence: 'low',
    description:
      'Left and right geometry is mirrored; the measurement contract contains no posture or asymmetry observations.',
  }),
  Object.freeze({
    id: 'vertical-landmarks',
    confidence: 'low',
    description:
      'Waist Y uses an authored 0.235 x stature shoulder-to-waist vertical prior; other vertical landmarks use bounded analytical proportions. Surface paths such as centre-back C7-to-waist are retained as source provenance and do not set vertical coordinates.',
  }),
  Object.freeze({
    id: 'limb-cross-sections',
    confidence: 'low',
    description:
      'Missing optional limb circumferences use bounded ratios of chest or hip circumference; all limb sections are elliptical proxies.',
  }),
  Object.freeze({
    id: 'head-proportions',
    confidence: 'low',
    description:
      'Head and face depth are height-derived ellipsoid proportions, not reconstructed anatomy.',
  }),
]);

function add(a: Vec3M, b: Vec3M): Vec3M {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vec3M, b: Vec3M): Vec3M {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value: Vec3M, factor: number): Vec3M {
  return [value[0] * factor, value[1] * factor, value[2] * factor];
}

function dot(a: Vec3M, b: Vec3M): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3M, b: Vec3M): Vec3M {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(value: Vec3M, label: string): Vec3M {
  const magnitude = Math.hypot(...value);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-9) {
    throw new RangeError(`${label} must have finite non-zero length.`);
  }
  return scale(value, 1 / magnitude);
}

function pointAt(positions: ArrayLike<number>, index: number): Vec3M {
  return [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
}

function pushPoint(mesh: MutableMesh, point: Vec3M): number {
  if (!point.every(Number.isFinite)) throw new Error('Display mesh generated a non-finite vertex.');
  const index = mesh.positions.length / 3;
  mesh.positions.push(point[0], point[1], point[2]);
  return index;
}

function pushOutwardTriangle(
  mesh: MutableMesh,
  a: number,
  b: number,
  c: number,
  outwardFrom: Vec3M,
): void {
  if (a === b || b === c || c === a) throw new Error('Triangle indices must be distinct.');
  const pa = pointAt(mesh.positions, a);
  const pb = pointAt(mesh.positions, b);
  const pc = pointAt(mesh.positions, c);
  const normal = cross(subtract(pb, pa), subtract(pc, pa));
  const centroid: Vec3M = [
    (pa[0] + pb[0] + pc[0]) / 3,
    (pa[1] + pb[1] + pc[1]) / 3,
    (pa[2] + pb[2] + pc[2]) / 3,
  ];
  const orientation = dot(normal, subtract(centroid, outwardFrom));
  if (!Number.isFinite(orientation) || Math.abs(orientation) <= 1e-16) {
    throw new Error('Display mesh generated a degenerate triangle.');
  }
  mesh.triangles.push(a, ...(orientation > 0 ? [b, c] : [c, b]));
}

function addRange(
  mesh: MutableMesh,
  ranges: MeasurementDisplayPrimitiveRangeV1[],
  id: string,
  kind: MeasurementDisplayPrimitiveKindV1,
  build: () => void,
): void {
  const vertexOffset = mesh.positions.length / 3;
  const triangleOffset = mesh.triangles.length / 3;
  build();
  ranges.push({
    id,
    kind,
    vertexOffset,
    vertexCount: mesh.positions.length / 3 - vertexOffset,
    triangleOffset,
    triangleCount: mesh.triangles.length / 3 - triangleOffset,
  });
}

function ellipseHalfAxes(circumferenceM: number, depthToWidthRatio: number): [number, number] {
  // Ramanujan's first approximation is homogeneous; solve it once for a=halfWidth and b=q*a.
  const q = depthToWidthRatio;
  const factor = Math.PI * (3 * (1 + q) - Math.sqrt((3 + q) * (1 + 3 * q)));
  return [circumferenceM / factor, (circumferenceM / factor) * q];
}

function addVerticalLoft(mesh: MutableMesh, rings: readonly Ring[], radialSegments: number): void {
  const indices = rings.map((ring) => {
    const row: number[] = [];
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (TWO_PI * segment) / radialSegments;
      row.push(
        pushPoint(mesh, [
          ring.center[0] + ring.halfWidthM * Math.cos(angle),
          ring.center[1],
          ring.center[2] + ring.halfDepthM * Math.sin(angle),
        ]),
      );
    }
    return row;
  });
  for (let row = 0; row < indices.length - 1; row += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const next = (segment + 1) % radialSegments;
      const origin: Vec3M = [0, (rings[row].center[1] + rings[row + 1].center[1]) / 2, 0];
      pushOutwardTriangle(
        mesh,
        indices[row][segment],
        indices[row + 1][segment],
        indices[row][next],
        origin,
      );
      pushOutwardTriangle(
        mesh,
        indices[row][next],
        indices[row + 1][segment],
        indices[row + 1][next],
        origin,
      );
    }
  }
  const bottom = pushPoint(mesh, rings[0].center);
  const top = pushPoint(mesh, rings[rings.length - 1].center);
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    pushOutwardTriangle(
      mesh,
      bottom,
      indices[0][next],
      indices[0][segment],
      add(rings[0].center, [0, 0.001, 0]),
    );
    pushOutwardTriangle(
      mesh,
      top,
      indices[indices.length - 1][segment],
      indices[indices.length - 1][next],
      add(rings[rings.length - 1].center, [0, -0.001, 0]),
    );
  }
}

function segmentBasis(a: Vec3M, b: Vec3M): { direction: Vec3M; side: Vec3M; depth: Vec3M } {
  const direction = normalize(subtract(b, a), 'Segment axis');
  const depth: Vec3M = [0, 0, 1];
  const side = normalize(cross(depth, direction), 'Segment side basis');
  return { direction, side, depth };
}

function addTaperedSegment(
  mesh: MutableMesh,
  a: Vec3M,
  b: Vec3M,
  radiusA: readonly [sideM: number, depthM: number],
  radiusB: readonly [sideM: number, depthM: number],
  radialSegments: number,
): void {
  const { side, depth } = segmentBasis(a, b);
  const rings = [
    { center: a, radius: radiusA },
    { center: b, radius: radiusB },
  ] as const;
  const indices = rings.map(({ center, radius }) => {
    const row: number[] = [];
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (TWO_PI * segment) / radialSegments;
      row.push(
        pushPoint(
          mesh,
          add(
            center,
            add(
              scale(side, radius[0] * Math.cos(angle)),
              scale(depth, radius[1] * Math.sin(angle)),
            ),
          ),
        ),
      );
    }
    return row;
  });
  const midpoint = scale(add(a, b), 0.5);
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    pushOutwardTriangle(mesh, indices[0][segment], indices[1][segment], indices[0][next], midpoint);
    pushOutwardTriangle(mesh, indices[0][next], indices[1][segment], indices[1][next], midpoint);
  }
  const capA = pushPoint(mesh, a);
  const capB = pushPoint(mesh, b);
  const axis = subtract(b, a);
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    pushOutwardTriangle(mesh, capA, indices[0][next], indices[0][segment], add(a, axis));
    pushOutwardTriangle(mesh, capB, indices[1][segment], indices[1][next], subtract(b, axis));
  }
}

function addEllipsoid(
  mesh: MutableMesh,
  center: Vec3M,
  radii: Vec3M,
  radialSegments: number,
  latitudeSegments: number,
): void {
  const south = pushPoint(mesh, [center[0], center[1] - radii[1], center[2]]);
  const rings: number[][] = [];
  for (let latitude = 1; latitude < latitudeSegments; latitude += 1) {
    const phi = -Math.PI / 2 + (Math.PI * latitude) / latitudeSegments;
    const row: number[] = [];
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (TWO_PI * segment) / radialSegments;
      row.push(
        pushPoint(mesh, [
          center[0] + radii[0] * Math.cos(phi) * Math.cos(angle),
          center[1] + radii[1] * Math.sin(phi),
          center[2] + radii[2] * Math.cos(phi) * Math.sin(angle),
        ]),
      );
    }
    rings.push(row);
  }
  const north = pushPoint(mesh, [center[0], center[1] + radii[1], center[2]]);
  for (let segment = 0; segment < radialSegments; segment += 1) {
    const next = (segment + 1) % radialSegments;
    pushOutwardTriangle(mesh, south, rings[0][next], rings[0][segment], center);
    for (let row = 0; row < rings.length - 1; row += 1) {
      pushOutwardTriangle(
        mesh,
        rings[row][segment],
        rings[row + 1][segment],
        rings[row][next],
        center,
      );
      pushOutwardTriangle(
        mesh,
        rings[row][next],
        rings[row + 1][segment],
        rings[row + 1][next],
        center,
      );
    }
    pushOutwardTriangle(
      mesh,
      north,
      rings[rings.length - 1][segment],
      rings[rings.length - 1][next],
      center,
    );
  }
}

function validateTessellation(policy: MeasurementDisplayTessellationV1): void {
  if (policy.version !== MEASUREMENT_DISPLAY_TESSELLATION_V1) {
    throw new RangeError('Unsupported measurement display tessellation version.');
  }
  if (
    !Number.isSafeInteger(policy.radialSegments) ||
    policy.radialSegments < 8 ||
    policy.radialSegments > 64
  ) {
    throw new RangeError('radialSegments must be an integer within 8..64.');
  }
  if (
    !Number.isSafeInteger(policy.headLatitudeSegments) ||
    policy.headLatitudeSegments < 6 ||
    policy.headLatitudeSegments > 32
  ) {
    throw new RangeError('headLatitudeSegments must be an integer within 6..32.');
  }
  if (
    !Number.isSafeInteger(policy.maxVertices) ||
    policy.maxVertices < 1 ||
    policy.maxVertices > 100_000
  ) {
    throw new RangeError('maxVertices must be a bounded positive integer.');
  }
  if (
    !Number.isSafeInteger(policy.maxTriangles) ||
    policy.maxTriangles < 1 ||
    policy.maxTriangles > 200_000
  ) {
    throw new RangeError('maxTriangles must be a bounded positive integer.');
  }
}

function canonicalSnapshot(input: CanonicalBodyMeasurementsMm): CanonicalBodyMeasurementsMm {
  const entries = Object.entries(input).sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries) as unknown as CanonicalBodyMeasurementsMm;
}

function fnv1a32Bytes(chunks: readonly Uint8Array[]): string {
  let hash = 0x811c9dc5;
  for (const chunk of chunks) {
    for (const byte of chunk) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function fnv1a32Text(value: string): string {
  return fnv1a32Bytes([new TextEncoder().encode(value)]);
}

function typedBytes(value: Float32Array | Uint32Array): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function boundingBox(positions: Float32Array): AxisAlignedBoundingBoxM {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[offset + axis]);
      max[axis] = Math.max(max[axis], positions[offset + axis]);
    }
  }
  return { min: min as unknown as Vec3M, max: max as unknown as Vec3M };
}

function assertMesh(
  positions: Float32Array,
  triangles: Uint32Array,
  policy: MeasurementDisplayTessellationV1,
): void {
  const vertexCount = positions.length / 3;
  const triangleCount = triangles.length / 3;
  if (!positions.length || positions.length % 3 || !positions.every(Number.isFinite)) {
    throw new Error('Measurement display positions are not finite packed XYZ values.');
  }
  if (
    !triangles.length ||
    triangles.length % 3 ||
    triangles.some((index) => index >= vertexCount)
  ) {
    throw new Error('Measurement display triangle indices are invalid.');
  }
  if (vertexCount > policy.maxVertices || triangleCount > policy.maxTriangles) {
    throw new RangeError('Measurement display mesh exceeds its vertex or triangle budget.');
  }
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = pointAt(positions, triangles[offset]);
    const b = pointAt(positions, triangles[offset + 1]);
    const c = pointAt(positions, triangles[offset + 2]);
    if (Math.hypot(...cross(subtract(b, a), subtract(c, a))) <= 1e-10) {
      throw new Error('Measurement display contains a degenerate float32 triangle.');
    }
  }
}

function section(
  id: MeasurementDisplaySectionV1['id'],
  yM: number,
  circumferenceMm: number,
  depthToWidthRatio: number,
): MeasurementDisplaySectionV1 {
  const circumferenceM = circumferenceMm / 1000;
  const [halfWidthM, halfDepthM] = ellipseHalfAxes(circumferenceM, depthToWidthRatio);
  return { id, yM, circumferenceM, halfWidthM, halfDepthM, depthToWidthRatio, confidence: 'low' };
}

function pairedPoint(side: 'left' | 'right', x: number, y: number, z = 0): Vec3M {
  return [side === 'left' ? x : -x, y, z];
}

export function createMeasurementDisplayMeshV1(options: {
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly sourceRevision: string;
  readonly pose?: BodyPoseKind;
  readonly tessellation?: MeasurementDisplayTessellationV1;
}): MeasurementDisplayMeshArtifactV1 {
  if (!options.sourceRevision.trim()) throw new RangeError('sourceRevision is required.');
  const pose = options.pose ?? 'A';
  if (pose !== 'A' && pose !== 'T') throw new RangeError('pose must be A or T.');
  const measurements = canonicalSnapshot(options.measurements);
  const dimensions = deriveStaticBodyDimensionsM(measurements);
  const requestedPolicy = options.tessellation ?? DEFAULT_MEASUREMENT_DISPLAY_TESSELLATION_V1;
  const policy: MeasurementDisplayTessellationV1 = Object.freeze({
    version: requestedPolicy.version,
    radialSegments: requestedPolicy.radialSegments,
    headLatitudeSegments: requestedPolicy.headLatitudeSegments,
    maxVertices: requestedPolicy.maxVertices,
    maxTriangles: requestedPolicy.maxTriangles,
  });
  validateTessellation(policy);

  const height = measurements.heightMm / 1000;
  const hipY = measurements.inseamMm / 1000;
  const shoulderY = height * 0.78;
  // A centre-back C7-to-waist tape path is longer than an axis projection whenever the back is
  // curved. Until posture/back-profile geometry exists, use the authored vertical proportion and
  // retain `cbNeckToWaistMm` only in the canonical source fingerprint.
  const inferredWaistY = shoulderY - height * SHOULDER_TO_WAIST_VERTICAL_TO_STATURE;
  const waistY = Math.min(
    shoulderY - height * 0.055,
    Math.max(hipY + height * 0.045, inferredWaistY),
  );
  const chestY = waistY + (shoulderY - waistY) * 0.56;
  const chest = section('chest', chestY, measurements.chestCircumferenceMm, 0.72);
  const waist = section('waist', waistY, measurements.waistCircumferenceMm, 0.68);
  const hip = section('hip', hipY, measurements.hipCircumferenceMm, 0.78);
  const sections = Object.freeze([chest, waist, hip]);

  const mesh: MutableMesh = { positions: [], triangles: [] };
  const ranges: MeasurementDisplayPrimitiveRangeV1[] = [];
  const radial = policy.radialSegments;
  const shoulderHalfWidth = measurements.shoulderBreadthMm / 2000;
  const pelvisBottomY = Math.max(hipY - height * 0.105, dimensions.calfRadius * 2.2);
  addRange(mesh, ranges, 'torso', 'torso-loft', () =>
    addVerticalLoft(
      mesh,
      [
        {
          center: [0, pelvisBottomY, 0],
          halfWidthM: hip.halfWidthM * 0.72,
          halfDepthM: hip.halfDepthM * 0.78,
        },
        { center: [0, hip.yM, 0], halfWidthM: hip.halfWidthM, halfDepthM: hip.halfDepthM },
        { center: [0, waist.yM, 0], halfWidthM: waist.halfWidthM, halfDepthM: waist.halfDepthM },
        { center: [0, chest.yM, 0], halfWidthM: chest.halfWidthM, halfDepthM: chest.halfDepthM },
        {
          center: [0, shoulderY, 0],
          halfWidthM: shoulderHalfWidth * 0.9,
          halfDepthM: chest.halfDepthM * 0.82,
        },
      ],
      radial,
    ),
  );

  const neckCircumferenceMm =
    measurements.neckBaseCircumferenceMm ?? measurements.shoulderBreadthMm * 0.86;
  const [neckWidth, neckDepth] = ellipseHalfAxes(neckCircumferenceMm / 1000, 0.86);
  const headRadius = dimensions.headRadius;
  const headCenterY = height - headRadius;
  const neckTopY = headCenterY - headRadius * 0.72;
  addRange(mesh, ranges, 'neck', 'tapered-segment', () =>
    addTaperedSegment(
      mesh,
      [0, shoulderY - height * 0.01, 0],
      [0, neckTopY, 0],
      [neckWidth * 1.08, neckDepth * 1.08],
      [neckWidth * 0.88, neckDepth * 0.88],
      radial,
    ),
  );
  addRange(mesh, ranges, 'head', 'ellipsoid', () =>
    addEllipsoid(
      mesh,
      [0, headCenterY, 0],
      [headRadius * 0.78, headRadius, headRadius * 0.82],
      radial,
      policy.headLatitudeSegments,
    ),
  );

  const armAngle = pose === 'A' ? (35 * Math.PI) / 180 : 0;
  const armDx = Math.cos(armAngle);
  const armDy = -Math.sin(armAngle);
  const upperArmLength = (measurements.armLengthMm / 1000) * 0.54;
  const forearmLength = (measurements.armLengthMm / 1000) * 0.46;
  const bicepCircumference =
    (measurements.bicepCircumferenceMm ?? measurements.chestCircumferenceMm * 0.32) / 1000;
  const wristCircumference =
    (measurements.wristCircumferenceMm ?? measurements.chestCircumferenceMm * 0.17) / 1000;
  const [bicepSide, bicepDepth] = ellipseHalfAxes(bicepCircumference, 0.9);
  const [wristSide, wristDepth] = ellipseHalfAxes(wristCircumference, 0.88);
  for (const side of ['left', 'right'] as const) {
    const sign = side === 'left' ? 1 : -1;
    const shoulder = pairedPoint(side, shoulderHalfWidth, shoulderY);
    const elbow: Vec3M = [
      shoulder[0] + sign * armDx * upperArmLength,
      shoulder[1] + armDy * upperArmLength,
      0,
    ];
    const wrist: Vec3M = [
      elbow[0] + sign * armDx * forearmLength,
      elbow[1] + armDy * forearmLength,
      0,
    ];
    addRange(mesh, ranges, `upper-arm-${side}`, 'tapered-segment', () =>
      addTaperedSegment(
        mesh,
        shoulder,
        elbow,
        [bicepSide, bicepDepth],
        [bicepSide * 0.78, bicepDepth * 0.78],
        radial,
      ),
    );
    addRange(mesh, ranges, `forearm-${side}`, 'tapered-segment', () =>
      addTaperedSegment(
        mesh,
        elbow,
        wrist,
        [bicepSide * 0.72, bicepDepth * 0.72],
        [wristSide, wristDepth],
        radial,
      ),
    );
    addRange(mesh, ranges, `hand-${side}`, 'ellipsoid', () =>
      addEllipsoid(
        mesh,
        [wrist[0] + sign * armDx * wristSide * 1.15, wrist[1] + armDy * wristSide * 1.15, 0],
        [wristSide * 1.45, wristSide * 0.72, wristDepth * 0.9],
        radial,
        6,
      ),
    );
  }

  const thighCircumference =
    (measurements.thighCircumferenceMm ?? measurements.hipCircumferenceMm * 0.57) / 1000;
  const calfCircumference =
    (measurements.calfCircumferenceMm ?? measurements.hipCircumferenceMm * 0.38) / 1000;
  const ankleCircumference =
    (measurements.ankleCircumferenceMm ?? calfCircumference * 1000 * 0.62) / 1000;
  const thighRadii = ellipseHalfAxes(thighCircumference, 0.92);
  const calfRadii = ellipseHalfAxes(calfCircumference, 0.9);
  const ankleRadii = ellipseHalfAxes(ankleCircumference, 0.86);
  const legX = Math.min(hip.halfWidthM * 0.48, shoulderHalfWidth * 0.58);
  const kneeY = hipY * 0.52;
  const ankleY = Math.max(ankleRadii[0], height * 0.035);
  for (const side of ['left', 'right'] as const) {
    const upper = pairedPoint(side, legX, hipY + height * 0.018);
    const knee = pairedPoint(side, legX, kneeY);
    const ankle = pairedPoint(side, legX, ankleY);
    addRange(mesh, ranges, `thigh-${side}`, 'tapered-segment', () =>
      addTaperedSegment(
        mesh,
        upper,
        knee,
        thighRadii,
        [thighRadii[0] * 0.68, thighRadii[1] * 0.68],
        radial,
      ),
    );
    addRange(mesh, ranges, `calf-${side}`, 'tapered-segment', () =>
      addTaperedSegment(mesh, knee, ankle, calfRadii, ankleRadii, radial),
    );
    addRange(mesh, ranges, `foot-${side}`, 'ellipsoid', () =>
      addEllipsoid(
        mesh,
        [ankle[0], ankleRadii[0] * 0.82, ankleRadii[1] * 1.35],
        [ankleRadii[0] * 1.08, ankleRadii[0] * 0.82, ankleRadii[1] * 2.45],
        radial,
        6,
      ),
    );
  }

  const positionsM = Float32Array.from(mesh.positions);
  const triangles = Uint32Array.from(mesh.triangles);
  assertMesh(positionsM, triangles, policy);
  const geometryFingerprint = `fnv1a32:${fnv1a32Bytes([typedBytes(positionsM), typedBytes(triangles)])}`;
  const measurementFingerprint = `fnv1a32:${fnv1a32Text(JSON.stringify(measurements))}`;
  const revision = `measurement-display-v1-${fnv1a32Text(
    JSON.stringify({
      measurementFingerprint,
      sourceRevision: options.sourceRevision.trim(),
      pose,
      policy,
      geometryFingerprint,
    }),
  )}`;
  const id = 'measurement-display-mannequin-v1' as const;
  const displayMesh: DisplayMeshData = { id, revision, positionsM, triangles };
  return {
    version: MEASUREMENT_DISPLAY_MESH_V1,
    id,
    revision,
    geometryFingerprint,
    identityBoundary: {
      localFingerprintAlgorithm: 'fnv1a32',
      deterministicScope: 'same-js-runtime',
      persistedOrSealedIdentityEligible: false,
      persistedOrSealedIdentityRequirement: 'canonical-binary-sha256',
    },
    units: 'm',
    coordinateSystem: { ...COORDINATE_SYSTEM },
    pose: { kind: pose, armDownAngleDeg: pose === 'A' ? 35 : 0 },
    topology: 'overlapping-segmented-proxy-non-watertight',
    purpose: 'display-only',
    collision: { included: false, authority: 'body-artifact-collision-lods' },
    fitClaimEligible: false,
    mesh: displayMesh,
    boundingBoxM: boundingBox(positionsM),
    source: {
      schemaVersion: measurements.schemaVersion,
      sourceRevision: options.sourceRevision.trim(),
      measurementFingerprint,
    },
    sections,
    assumptions: ASSUMPTIONS.map((assumption) => ({ ...assumption })),
    tessellation: policy,
    primitiveRanges: ranges,
  };
}
