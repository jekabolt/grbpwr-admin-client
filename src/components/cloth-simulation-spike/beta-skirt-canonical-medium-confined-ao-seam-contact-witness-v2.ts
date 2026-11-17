import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
  type MeasurementSurfaceIntersectionKindV1,
  type MeasurementSurfaceIntersectionPairV1,
} from '../../lib/cloth/body/measurement-surface-self-intersection-v1';

import {
  evaluateBetaSkirtCanonicalMediumPostFrameSelfOrientationDiagnosticV1,
  type BetaSkirtCanonicalMediumPostFrameSelfOrientationReportV1,
} from './beta-skirt-canonical-medium-post-frame-self-orientation-diagnostic-v1';
import {
  projectBetaSkirtCanonicalMediumWebgpu16FrameV1,
  type BetaSkirtCanonicalMediumWebgpu16FrameRunnerOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-16-frame-runner-v1';
import {
  projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2,
  type BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
} from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_CONFINED_AO_SEAM_CONTACT_WITNESS_V2 =
  'beta-skirt-canonical-medium-confined-ao-seam-contact-witness/2' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_CONFINED_AO_SEAM_CONTACT_OWNER_V2 =
  'beta-skirt-canonical-medium-confined-ao-seam-contact-owner/2' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_CONFINED_AO_SEAM_CONTACT_PROJECTION_V2 =
  'beta-skirt-canonical-medium-confined-ao-seam-contact-projection/2' as const;

const VERTEX_COUNT = 580;
const TRIANGLE_COUNT = 912;
const SEAM_PAIR_COUNT = 34;
const PIN_COUNT = 82;
const MAX_RAW_INTERSECTION_COUNT = 2_048;
const MAX_FEATURES_PER_PAIR = 32;
const MAX_RETAINED_PAIR_WITNESSES = 64;
const SHA256 = /^[0-9a-f]{64}$/u;
const ANGULAR_EPSILON = DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1.angularEpsilon;

const SELF_POLICY = Object.freeze({
  ...DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  maxVertices: VERTEX_COUNT,
  maxTriangles: TRIANGLE_COUNT,
  maxInputBytes: 128 * 1024,
  maxGridCells: 100_000,
  maxCellReferences: 500_000,
  maxCellPairVisits: 2_000_000,
  maxCandidatePairs: 500_000,
});

type Point2 = readonly [x: number, y: number];
type Point3 = readonly [x: number, y: number, z: number];
type Triangle = Readonly<{
  vertices: readonly [number, number, number];
  a: Point3;
  b: Point3;
  c: Point3;
  normal: Point3;
  normalLength: number;
}>;

export type BetaSkirtCanonicalMediumContactFeatureRefV2 =
  | Readonly<{ kind: 'vertex'; vertex: number }>
  | Readonly<{ kind: 'edge'; vertices: readonly [number, number] }>
  | Readonly<{ kind: 'face'; triangle: number }>;

export type BetaSkirtCanonicalMediumContactFeatureV2 = Readonly<{
  kind:
    | 'endpoint'
    | 'vertex-vertex'
    | 'vertex-edge'
    | 'vertex-face'
    | 'edge-edge'
    | 'edge-face'
    | 'face-face';
  pointM: Point3;
  onTriangleA: BetaSkirtCanonicalMediumContactFeatureRefV2;
  onTriangleB: BetaSkirtCanonicalMediumContactFeatureRefV2;
  confinedCarrier:
    | Readonly<{
        kind: 'direct-seam-endpoint';
        endpointA: number;
        endpointB: number;
      }>
    | Readonly<{
        kind: 'paired-seam-segment';
        segmentA: readonly [number, number];
        segmentB: readonly [number, number];
      }>
    | null;
  nonConfinedRelation:
    'authenticated-carrier-adjacent-but-not-confined' | 'non-seam-contact-feature' | null;
  nearestIncidentAuthenticatedCarrierDistanceM: number | null;
}>;

export type BetaSkirtCanonicalMediumContactPairWitnessV2 = Readonly<{
  triangleA: number;
  triangleB: number;
  oracleKind: MeasurementSurfaceIntersectionKindV1;
  featureCount: number;
  features: readonly BetaSkirtCanonicalMediumContactFeatureV2[];
  contactLocusSha256: string;
  confinedToAuthenticatedAoSeam: boolean;
  disposition:
    | 'excluded-confined-authenticated-ao-seam-touching'
    | 'residual-proper-crossing'
    | 'residual-coplanar-overlap'
    | 'residual-touching-no-contact-features'
    | 'residual-touching-non-confined-feature';
}>;

type KindCounts = Readonly<Record<MeasurementSurfaceIntersectionKindV1, number>>;

export type BetaSkirtCanonicalMediumConfinedAoSeamContactReportV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_CONFINED_AO_SEAM_CONTACT_WITNESS_V2;
  status: 'diagnostic-completed';
  decision:
    | 'MEASURED_ZERO_RESIDUAL_AFTER_CONFINED_AO_SEAM_WITNESS'
    | 'BLOCK_NON_CONFINED_OR_UNSUPPORTED_SELF_CONTACT';
  bindings: Readonly<{
    retainedAdapterVersion: 'frozen-v1-runner' | 'actual-body-contact-runner-v2';
    runtimeSourceCanonicalSha256: string;
    retainedRunnerCanonicalSha256: string;
    postFrameDiagnosticV1CanonicalSha256: string | null;
    finalPositions3MSha256: string;
    normalizedTopologySha256: string;
    seamPairsSha256: string;
  }>;
  counts: Readonly<{
    vertexCount: 580;
    triangleCount: 912;
    seamPairCount: 34;
    pinnedVertexCount: 82;
  }>;
  oracle: Readonly<{
    version: typeof MEASUREMENT_SURFACE_SELF_INTERSECTION_V1;
    epsilonM: number;
    angularEpsilon: number;
    rawIntersectionCount: number;
    rawKindCounts: KindCounts;
    broadPhaseCandidatePairCount: number;
    testedPairCount: number;
    bindingMode: 'frozen-v1-diagnostic-exact-replay' | 'contact-runner-v2-direct-live-binding';
    replayMatchesFrozenV1: boolean;
  }>;
  accounting: Readonly<{
    rawIntersectionCount: number;
    confinedExcludedCount: number;
    confinedExcludedKindCounts: KindCounts;
    residualCount: number;
    residualKindCounts: KindCounts;
    exactRawEqualsExcludedPlusResidual: true;
  }>;
  carriers: Readonly<{
    directEndpointPairCount: 34;
    pairedSegmentCarrierCount: number;
    directOneToOneAuthenticated: true;
  }>;
  witnessEvidence: Readonly<{
    totalFeatureCount: number;
    endpointFeatureCount: number;
    vertexVertexFeatureCount: number;
    vertexEdgeFeatureCount: number;
    vertexFaceFeatureCount: number;
    edgeEdgeFeatureCount: number;
    edgeFaceFeatureCount: number;
    faceFaceFeatureCount: number;
    nonConfinedCarrierAdjacentFeatureCount: number;
    nonSeamContactFeatureCount: number;
    aggregateContactLocusSha256: string;
    pairWitnesses: readonly BetaSkirtCanonicalMediumContactPairWitnessV2[];
    pairWitnessesTruncated: boolean;
    maximumRawIntersectionCount: typeof MAX_RAW_INTERSECTION_COUNT;
    maximumFeaturesPerPair: typeof MAX_FEATURES_PER_PAIR;
    maximumRetainedPairWitnesses: typeof MAX_RETAINED_PAIR_WITNESSES;
  }>;
  blockers: readonly string[];
  claims: Readonly<{
    exactLiveRetainedCandidateMeasured: true;
    acceptedMeasurementSurfaceOracleV1Unchanged: true;
    allTouchingPairsHaveExplicitContactFeatureLocus: boolean;
    exclusionRequiresEveryFeatureOnPairedAuthenticatedCarrier: true;
    properCrossingEverExcluded: false;
    coplanarOverlapEverExcluded: false;
    contactClearDiagnosticAuthority: boolean;
    upstreamExactActualBodyGateClear: boolean;
    distortionAcceptanceThresholdFrozen: false;
    fitAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-confined-ao-seam-contact-diagnostic-only';
  }>;
}>;

declare const contactOwnerBrand: unique symbol;
export type BetaSkirtCanonicalMediumConfinedAoSeamContactOwnerV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_CONFINED_AO_SEAM_CONTACT_OWNER_V2;
  report: BetaSkirtCanonicalMediumConfinedAoSeamContactReportV2;
  readonly [contactOwnerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumConfinedAoSeamContactProjectionV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_CONFINED_AO_SEAM_CONTACT_PROJECTION_V2;
  reportCanonicalSha256: string;
  finalPositionsInvMassKg: Float32Array;
  finalPositions3M: Float32Array;
  normalizedTriangles: Uint32Array;
  contactClear: true;
  callerOwnedMutableBinaryCopies: true;
  fitAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumConfinedAoSeamContactResultV2 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumConfinedAoSeamContactOwnerV2;
      report: BetaSkirtCanonicalMediumConfinedAoSeamContactReportV2;
    }>
  | Readonly<{
      ok: false;
      code:
        | 'source-owner-unavailable'
        | 'retained-owner-unavailable'
        | 'upstream-v1-diagnostic-failed'
        | 'binding-mismatch'
        | 'carrier-rejected'
        | 'resource-budget-exceeded'
        | 'contact-witness-rejected'
        | 'non-confined-contact-blocked'
        | 'sha256-unavailable';
      detail: string;
      report?: BetaSkirtCanonicalMediumConfinedAoSeamContactReportV2;
    }>;

type OwnerRecord = Readonly<{
  finalPositionsInvMassKg: Float32Array<ArrayBuffer>;
  finalPositions3M: Float32Array<ArrayBuffer>;
  normalizedTriangles: Uint32Array<ArrayBuffer>;
}>;

const owners = new WeakMap<object, OwnerRecord>();

function failure(
  code: Exclude<BetaSkirtCanonicalMediumConfinedAoSeamContactResultV2, { ok: true }>['code'],
  detail: string,
  report?: BetaSkirtCanonicalMediumConfinedAoSeamContactReportV2,
): Exclude<BetaSkirtCanonicalMediumConfinedAoSeamContactResultV2, { ok: true }> {
  return Object.freeze({ ok: false, code, detail, ...(report ? { report } : {}) });
}

function point(positions: Float32Array, vertex: number): Point3 {
  return [positions[vertex * 3]!, positions[vertex * 3 + 1]!, positions[vertex * 3 + 2]!];
}

function subtract(a: Point3, b: Point3): Point3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Point3, b: Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Point3, b: Point3): Point3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function distance(a: Point3, b: Point3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function interpolate(a: Point3, b: Point3, t: number): Point3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function triangle(positions: Float32Array, indices: Uint32Array, index: number): Triangle {
  const vertices = [indices[index * 3]!, indices[index * 3 + 1]!, indices[index * 3 + 2]!] as const;
  const a = point(positions, vertices[0]);
  const b = point(positions, vertices[1]);
  const c = point(positions, vertices[2]);
  const normal = cross(subtract(b, a), subtract(c, a));
  const normalLength = Math.hypot(...normal);
  if (!(normalLength > 0)) throw new RangeError(`Triangle ${index} is degenerate.`);
  return { vertices, a, b, c, normal, normalLength };
}

function dominantProjection(normal: Point3): 0 | 1 | 2 {
  const values = [Math.abs(normal[0]), Math.abs(normal[1]), Math.abs(normal[2])];
  return values[0] >= values[1] && values[0] >= values[2] ? 0 : values[1] >= values[2] ? 1 : 2;
}

function project(value: Point3, droppedAxis: 0 | 1 | 2): Point2 {
  if (droppedAxis === 0) return [value[1], value[2]];
  if (droppedAxis === 1) return [value[0], value[2]];
  return [value[0], value[1]];
}

function orient2d(a: Point2, b: Point2, c: Point2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function squaredLength(value: Point3): number {
  return dot(value, value);
}

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
  return distance(value, [
    triangleValue.a[0] + ab[0] * v + ac[0] * w,
    triangleValue.a[1] + ab[1] * v + ac[1] * w,
    triangleValue.a[2] + ab[2] * v + ac[2] * w,
  ]);
}

function pointInProjectedTriangle(
  value: Point3,
  triangleValue: Triangle,
  epsilonM: number,
): boolean {
  // This deliberately mirrors oracle V1's closed-triangle `inside` branch. Its projected signed
  // edge distances are only used for the oracle's separate `strict` branch.
  return distanceToClosedTriangle(value, triangleValue) <= epsilonM;
}

function signedPlaneDistance(value: Point3, triangleValue: Triangle): number {
  return dot(triangleValue.normal, subtract(value, triangleValue.a)) / triangleValue.normalLength;
}

function onSegment2d(a: Point2, b: Point2, value: Point2, tolerance: number): boolean {
  return (
    value[0] >= Math.min(a[0], b[0]) - tolerance &&
    value[0] <= Math.max(a[0], b[0]) + tolerance &&
    value[1] >= Math.min(a[1], b[1]) - tolerance &&
    value[1] <= Math.max(a[1], b[1]) + tolerance
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
  )
    return true;
  return (
    (Math.abs(abC) <= abTolerance && onSegment2d(a, b, c, epsilonM)) ||
    (Math.abs(abD) <= abTolerance && onSegment2d(a, b, d, epsilonM)) ||
    (Math.abs(cdA) <= cdTolerance && onSegment2d(c, d, a, epsilonM)) ||
    (Math.abs(cdB) <= cdTolerance && onSegment2d(c, d, b, epsilonM))
  );
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
    if (!parameters.some((existing) => Math.abs(existing - clamped) <= 1e-12))
      parameters.push(clamped);
  };
  if (pointOnSegment2d(c2, d2, a2, epsilonM)) add(0);
  if (pointOnSegment2d(c2, d2, b2, epsilonM)) add(1);
  const rLengthSquared = r[0] * r[0] + r[1] * r[1];
  if (pointOnSegment2d(a2, b2, c2, epsilonM))
    add(((c2[0] - a2[0]) * r[0] + (c2[1] - a2[1]) * r[1]) / rLengthSquared);
  if (pointOnSegment2d(a2, b2, d2, epsilonM))
    add(((d2[0] - a2[0]) * r[0] + (d2[1] - a2[1]) * r[1]) / rLengthSquared);
  return parameters;
}

/** Reconstructs the same epsilon-bounded contact point locus used privately by oracle V1. */
function contactWitnesses(first: Triangle, second: Triangle, epsilonM: number): readonly Point3[] {
  const witnesses: Point3[] = [];
  const add = (value: Point3) => {
    if (!witnesses.some((existing) => distance(existing, value) <= epsilonM * 0.25))
      witnesses.push(value);
  };
  const inspect = (source: Triangle, target: Triangle) => {
    const sourcePoints = [source.a, source.b, source.c] as const;
    const targetPoints = [target.a, target.b, target.c] as const;
    const distances = sourcePoints.map((value) => signedPlaneDistance(value, target));
    for (let index = 0; index < 3; index += 1) {
      if (
        Math.abs(distances[index]!) <= epsilonM &&
        pointInProjectedTriangle(sourcePoints[index]!, target, epsilonM)
      )
        add(sourcePoints[index]!);
    }
    const axis = dominantProjection(target.normal);
    for (let index = 0; index < 3; index += 1) {
      const next = (index + 1) % 3;
      const a = sourcePoints[index]!;
      const b = sourcePoints[next]!;
      const distanceA = distances[index]!;
      const distanceB = distances[next]!;
      if (distanceA > 0 !== distanceB > 0) {
        const intersection = interpolate(a, b, distanceA / (distanceA - distanceB));
        if (pointInProjectedTriangle(intersection, target, epsilonM)) add(intersection);
      }
      if (Math.abs(distanceA) <= epsilonM && Math.abs(distanceB) <= epsilonM) {
        for (let targetIndex = 0; targetIndex < 3; targetIndex += 1) {
          for (const t of projectedSegmentIntersectionParameters(
            a,
            b,
            targetPoints[targetIndex]!,
            targetPoints[(targetIndex + 1) % 3]!,
            axis,
            epsilonM,
          ))
            add(interpolate(a, b, t));
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
  if (!(length > 0)) return distance(value, a) <= epsilonM;
  const t = dot(subtract(value, a), direction) / lengthSquared;
  if (t < -epsilonM / length || t > 1 + epsilonM / length) return false;
  return distance(value, interpolate(a, b, Math.max(0, Math.min(1, t)))) <= epsilonM;
}

type DirectSeam = Readonly<{ first: number; second: number }>;
type PairedSegment = Readonly<{
  first: readonly [number, number];
  second: readonly [number, number];
}>;
type CarrierIndex = Readonly<{
  directSeams: readonly DirectSeam[];
  pairedSegments: readonly PairedSegment[];
}>;

function edgeKey(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function orderedEdge(first: number, second: number): readonly [number, number] {
  return first < second ? [first, second] : [second, first];
}

function triangleHasVertex(value: Triangle, vertex: number): boolean {
  return (
    value.vertices[0] === vertex || value.vertices[1] === vertex || value.vertices[2] === vertex
  );
}

function triangleHasEdge(value: Triangle, edge: readonly [number, number]): boolean {
  return triangleHasVertex(value, edge[0]) && triangleHasVertex(value, edge[1]);
}

function buildCarrierIndex(options: {
  triangles: Uint32Array;
  seamPairs: Uint32Array;
  vertexCount: number;
  requireCanonicalSeamCount: boolean;
}): CarrierIndex {
  if (options.requireCanonicalSeamCount && options.seamPairs.length !== SEAM_PAIR_COUNT * 2)
    throw new RangeError('Exactly 34 authenticated AO seam pairs are required.');
  if (options.seamPairs.length === 0 || options.seamPairs.length % 2 !== 0)
    throw new RangeError('Authenticated AO seam pairs must be a nonempty pair list.');
  if (options.triangles.length === 0 || options.triangles.length % 3 !== 0)
    throw new RangeError('Normalized triangle topology must be a nonempty triangle list.');

  const seamVertices = new Set<number>();
  const mate = new Map<number, number>();
  const directSeams: DirectSeam[] = [];
  for (let offset = 0; offset < options.seamPairs.length; offset += 2) {
    const first = options.seamPairs[offset]!;
    const second = options.seamPairs[offset + 1]!;
    if (
      first >= options.vertexCount ||
      second >= options.vertexCount ||
      first === second ||
      seamVertices.has(first) ||
      seamVertices.has(second)
    )
      throw new RangeError('AO seam pairs must be in-range, direct, unique, and one-to-one.');
    seamVertices.add(first);
    seamVertices.add(second);
    mate.set(first, second);
    mate.set(second, first);
    directSeams.push(Object.freeze({ first, second }));
  }

  const topologyEdges = new Map<string, readonly [number, number]>();
  for (let offset = 0; offset < options.triangles.length; offset += 3) {
    const vertices = [
      options.triangles[offset]!,
      options.triangles[offset + 1]!,
      options.triangles[offset + 2]!,
    ] as const;
    if (vertices.some((vertex) => vertex >= options.vertexCount) || new Set(vertices).size !== 3)
      throw new RangeError('Normalized topology has an invalid or degenerate triangle.');
    for (let edge = 0; edge < 3; edge += 1) {
      const ordered = orderedEdge(vertices[edge]!, vertices[(edge + 1) % 3]!);
      topologyEdges.set(edgeKey(...ordered), ordered);
    }
  }

  const pairedSegments: PairedSegment[] = [];
  const seenCarrierPairs = new Set<string>();
  for (const firstEdge of topologyEdges.values()) {
    const mateA = mate.get(firstEdge[0]);
    const mateB = mate.get(firstEdge[1]);
    if (mateA === undefined || mateB === undefined || mateA === mateB) continue;
    const secondEdge = orderedEdge(mateA, mateB);
    if (!topologyEdges.has(edgeKey(...secondEdge))) continue;
    const firstKey = edgeKey(...firstEdge);
    const secondKey = edgeKey(...secondEdge);
    const carrierKey =
      firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
    if (seenCarrierPairs.has(carrierKey)) continue;
    seenCarrierPairs.add(carrierKey);
    pairedSegments.push(
      Object.freeze(
        firstKey < secondKey
          ? { first: firstEdge, second: secondEdge }
          : { first: secondEdge, second: firstEdge },
      ),
    );
  }
  return Object.freeze({
    directSeams: Object.freeze(directSeams),
    pairedSegments: Object.freeze(pairedSegments),
  });
}

function featureRef(
  value: Point3,
  triangleValue: Triangle,
  triangleIndex: number,
  epsilonM: number,
): BetaSkirtCanonicalMediumContactFeatureRefV2 {
  const coordinates = [triangleValue.a, triangleValue.b, triangleValue.c] as const;
  for (let index = 0; index < 3; index += 1)
    if (distance(value, coordinates[index]!) <= epsilonM)
      return Object.freeze({ kind: 'vertex' as const, vertex: triangleValue.vertices[index]! });
  for (let index = 0; index < 3; index += 1) {
    const next = (index + 1) % 3;
    if (pointOnSegment3d(value, coordinates[index]!, coordinates[next]!, epsilonM))
      return Object.freeze({
        kind: 'edge' as const,
        vertices: orderedEdge(triangleValue.vertices[index]!, triangleValue.vertices[next]!),
      });
  }
  return Object.freeze({ kind: 'face' as const, triangle: triangleIndex });
}

function featureKind(
  first: BetaSkirtCanonicalMediumContactFeatureRefV2,
  second: BetaSkirtCanonicalMediumContactFeatureRefV2,
  endpoint: boolean,
): BetaSkirtCanonicalMediumContactFeatureV2['kind'] {
  if (endpoint) return 'endpoint';
  const kinds = [first.kind, second.kind];
  if (kinds[0] === 'vertex' && kinds[1] === 'vertex') return 'vertex-vertex';
  if (kinds.includes('vertex') && kinds.includes('edge')) return 'vertex-edge';
  if (kinds.includes('vertex') && kinds.includes('face')) return 'vertex-face';
  if (kinds[0] === 'edge' && kinds[1] === 'edge') return 'edge-edge';
  if (kinds.includes('edge') && kinds.includes('face')) return 'edge-face';
  return 'face-face';
}

function confinedCarrier(
  value: Point3,
  first: Triangle,
  second: Triangle,
  positions: Float32Array,
  carriers: CarrierIndex,
  epsilonM: number,
): BetaSkirtCanonicalMediumContactFeatureV2['confinedCarrier'] {
  for (const seam of carriers.directSeams) {
    for (const [endpointA, endpointB] of [
      [seam.first, seam.second],
      [seam.second, seam.first],
    ] as const) {
      if (
        triangleHasVertex(first, endpointA) &&
        triangleHasVertex(second, endpointB) &&
        distance(value, point(positions, endpointA)) <= epsilonM &&
        distance(value, point(positions, endpointB)) <= epsilonM
      )
        return Object.freeze({ kind: 'direct-seam-endpoint' as const, endpointA, endpointB });
    }
  }
  for (const paired of carriers.pairedSegments) {
    for (const [segmentA, segmentB] of [
      [paired.first, paired.second],
      [paired.second, paired.first],
    ] as const) {
      if (
        triangleHasEdge(first, segmentA) &&
        triangleHasEdge(second, segmentB) &&
        pointOnSegment3d(
          value,
          point(positions, segmentA[0]),
          point(positions, segmentA[1]),
          epsilonM,
        ) &&
        pointOnSegment3d(
          value,
          point(positions, segmentB[0]),
          point(positions, segmentB[1]),
          epsilonM,
        )
      )
        return Object.freeze({ kind: 'paired-seam-segment' as const, segmentA, segmentB });
    }
  }
  return null;
}

function littleEndianBytes(values: Float32Array | Uint32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    if (values instanceof Float32Array) view.setFloat32(index * 4, values[index]!, true);
    else view.setUint32(index * 4, values[index]!, true);
  }
  return bytes;
}

async function sha256Bytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Native SHA-256 is unavailable.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  );
}

async function sha256Json(value: unknown): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(JSON.stringify(value)) as Uint8Array<ArrayBuffer>);
}

function featureContainsVertex(
  feature: BetaSkirtCanonicalMediumContactFeatureRefV2,
  vertex: number,
): boolean {
  return (
    (feature.kind === 'vertex' && feature.vertex === vertex) ||
    (feature.kind === 'edge' && feature.vertices.includes(vertex))
  );
}

function distanceToSegment(value: Point3, a: Point3, b: Point3): number {
  const direction = subtract(b, a);
  const lengthSquared = dot(direction, direction);
  if (!(lengthSquared > 0)) return distance(value, a);
  const t = Math.max(0, Math.min(1, dot(subtract(value, a), direction) / lengthSquared));
  return distance(value, interpolate(a, b, t));
}

function nearestIncidentCarrierDistance(options: {
  value: Point3;
  firstFeature: BetaSkirtCanonicalMediumContactFeatureRefV2;
  secondFeature: BetaSkirtCanonicalMediumContactFeatureRefV2;
  positions: Float32Array;
  carriers: CarrierIndex;
}): number | null {
  let nearest = Infinity;
  for (const seam of options.carriers.directSeams) {
    for (const [endpointA, endpointB] of [
      [seam.first, seam.second],
      [seam.second, seam.first],
    ] as const) {
      if (
        featureContainsVertex(options.firstFeature, endpointA) &&
        featureContainsVertex(options.secondFeature, endpointB)
      )
        nearest = Math.min(
          nearest,
          Math.max(
            distance(options.value, point(options.positions, endpointA)),
            distance(options.value, point(options.positions, endpointB)),
          ),
        );
    }
  }
  for (const paired of options.carriers.pairedSegments) {
    for (const [segmentA, segmentB] of [
      [paired.first, paired.second],
      [paired.second, paired.first],
    ] as const) {
      if (
        options.firstFeature.kind === 'edge' &&
        edgeKey(...options.firstFeature.vertices) === edgeKey(...segmentA) &&
        options.secondFeature.kind === 'edge' &&
        edgeKey(...options.secondFeature.vertices) === edgeKey(...segmentB)
      )
        nearest = Math.min(
          nearest,
          Math.max(
            distanceToSegment(
              options.value,
              point(options.positions, segmentA[0]),
              point(options.positions, segmentA[1]),
            ),
            distanceToSegment(
              options.value,
              point(options.positions, segmentB[0]),
              point(options.positions, segmentB[1]),
            ),
          ),
        );
    }
  }
  return Number.isFinite(nearest) ? nearest : null;
}

function snapshotFeature(
  value: Point3,
  first: Triangle,
  second: Triangle,
  triangleA: number,
  triangleB: number,
  positions: Float32Array,
  carriers: CarrierIndex,
  epsilonM: number,
): BetaSkirtCanonicalMediumContactFeatureV2 {
  const onTriangleA = featureRef(value, first, triangleA, epsilonM);
  const onTriangleB = featureRef(value, second, triangleB, epsilonM);
  const carrier = confinedCarrier(value, first, second, positions, carriers, epsilonM);
  const nearestCarrierDistance = nearestIncidentCarrierDistance({
    value,
    firstFeature: onTriangleA,
    secondFeature: onTriangleB,
    positions,
    carriers,
  });
  return Object.freeze({
    kind: featureKind(onTriangleA, onTriangleB, carrier?.kind === 'direct-seam-endpoint'),
    pointM: Object.freeze([...value]) as Point3,
    onTriangleA,
    onTriangleB,
    confinedCarrier: carrier,
    nonConfinedRelation:
      carrier !== null
        ? null
        : nearestCarrierDistance === null
          ? ('non-seam-contact-feature' as const)
          : ('authenticated-carrier-adjacent-but-not-confined' as const),
    nearestIncidentAuthenticatedCarrierDistanceM: nearestCarrierDistance,
  });
}

export async function evaluateBetaSkirtCanonicalMediumConfinedContactPairV2(options: {
  positions: Float32Array;
  triangles: Uint32Array;
  seamPairs: Uint32Array;
  pair: MeasurementSurfaceIntersectionPairV1;
  epsilonM: number;
  vertexCount?: number;
  requireCanonicalSeamCount?: boolean;
}): Promise<BetaSkirtCanonicalMediumContactPairWitnessV2> {
  const vertexCount = options.vertexCount ?? options.positions.length / 3;
  if (
    !Number.isInteger(vertexCount) ||
    vertexCount <= 0 ||
    options.positions.length !== vertexCount * 3 ||
    options.pair.triangleA < 0 ||
    options.pair.triangleB <= options.pair.triangleA ||
    options.pair.triangleB >= options.triangles.length / 3 ||
    !Number.isFinite(options.epsilonM) ||
    options.epsilonM <= 0
  )
    throw new RangeError('Contact-pair witness input is invalid or noncanonical.');
  for (const value of options.positions)
    if (!Number.isFinite(value)) throw new RangeError('Contact-pair positions must be finite.');
  const carriers = buildCarrierIndex({
    triangles: options.triangles,
    seamPairs: options.seamPairs,
    vertexCount,
    requireCanonicalSeamCount: options.requireCanonicalSeamCount ?? false,
  });
  const first = triangle(options.positions, options.triangles, options.pair.triangleA);
  const second = triangle(options.positions, options.triangles, options.pair.triangleB);
  const points = contactWitnesses(first, second, options.epsilonM);
  if (points.length > MAX_FEATURES_PER_PAIR)
    throw new RangeError(
      `Contact feature cap exceeded (${points.length} > ${MAX_FEATURES_PER_PAIR}).`,
    );
  const features = Object.freeze(
    points.map((value) =>
      snapshotFeature(
        value,
        first,
        second,
        options.pair.triangleA,
        options.pair.triangleB,
        options.positions,
        carriers,
        options.epsilonM,
      ),
    ),
  );
  const confined =
    options.pair.kind === 'touching' &&
    features.length > 0 &&
    features.every((feature) => feature.confinedCarrier !== null);
  const disposition: BetaSkirtCanonicalMediumContactPairWitnessV2['disposition'] =
    options.pair.kind === 'proper-crossing'
      ? 'residual-proper-crossing'
      : options.pair.kind === 'coplanar-overlap'
        ? 'residual-coplanar-overlap'
        : features.length === 0
          ? 'residual-touching-no-contact-features'
          : confined
            ? 'excluded-confined-authenticated-ao-seam-touching'
            : 'residual-touching-non-confined-feature';
  const contactLocusSha256 = await sha256Json({
    triangleA: options.pair.triangleA,
    triangleB: options.pair.triangleB,
    oracleKind: options.pair.kind,
    epsilonM: options.epsilonM,
    features,
  });
  return Object.freeze({
    triangleA: options.pair.triangleA,
    triangleB: options.pair.triangleB,
    oracleKind: options.pair.kind,
    featureCount: features.length,
    features,
    contactLocusSha256,
    confinedToAuthenticatedAoSeam: confined,
    disposition,
  });
}

function bytesEqual(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function positions3MatchPositions4(positions3: Float32Array, positions4: Float32Array): boolean {
  if (positions3.length / 3 !== positions4.length / 4) return false;
  for (let vertex = 0; vertex < positions3.length / 3; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const left = new Uint8Array(
        positions3.buffer,
        positions3.byteOffset + (vertex * 3 + axis) * 4,
        4,
      );
      const right = new Uint8Array(
        positions4.buffer,
        positions4.byteOffset + (vertex * 4 + axis) * 4,
        4,
      );
      if (!bytesEqual(left, right)) return false;
    }
  }
  return true;
}

function kindCounts(values: readonly MeasurementSurfaceIntersectionPairV1[]): KindCounts {
  const counts: Record<MeasurementSurfaceIntersectionKindV1, number> = {
    'proper-crossing': 0,
    'coplanar-overlap': 0,
    touching: 0,
  };
  for (const value of values) counts[value.kind] += 1;
  return Object.freeze(counts);
}

function witnessKindCounts(
  values: readonly BetaSkirtCanonicalMediumContactPairWitnessV2[],
): KindCounts {
  const counts: Record<MeasurementSurfaceIntersectionKindV1, number> = {
    'proper-crossing': 0,
    'coplanar-overlap': 0,
    touching: 0,
  };
  for (const value of values) counts[value.oracleKind] += 1;
  return Object.freeze(counts);
}

function sameKindCounts(first: KindCounts, second: KindCounts): boolean {
  return (
    first['proper-crossing'] === second['proper-crossing'] &&
    first['coplanar-overlap'] === second['coplanar-overlap'] &&
    first.touching === second.touching
  );
}

function validateCanonicalLiveBindings(options: {
  sourceProjection: NonNullable<
    ReturnType<typeof projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1>
  >;
  runnerProjection: NonNullable<ReturnType<typeof projectBetaSkirtCanonicalMediumWebgpu16FrameV1>>;
  sourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1;
  runnerOwner: BetaSkirtCanonicalMediumWebgpu16FrameRunnerOwnerV1;
  frozenV1: BetaSkirtCanonicalMediumPostFrameSelfOrientationReportV1;
}): void {
  const { sourceProjection, runnerProjection, sourceOwner, runnerOwner, frozenV1 } = options;
  if (
    sourceProjection.initialPhysicalPositionsInvMassKg.length !== VERTEX_COUNT * 4 ||
    sourceProjection.normalizedTriangles.length !== TRIANGLE_COUNT * 3 ||
    sourceProjection.seamPairs.length !== SEAM_PAIR_COUNT * 2 ||
    sourceProjection.pinnedWaistVertexIndices.length !== PIN_COUNT ||
    runnerProjection.finalPositionsInvMassKg.length !== VERTEX_COUNT * 4 ||
    runnerProjection.finalPositions3M.length !== VERTEX_COUNT * 3 ||
    runnerProjection.normalizedTriangles.length !== TRIANGLE_COUNT * 3
  )
    throw new RangeError('Canonical-medium retained counts drifted.');
  if (
    !SHA256.test(sourceProjection.reportCanonicalSha256) ||
    !SHA256.test(runnerProjection.reportCanonicalSha256) ||
    !SHA256.test(frozenV1.seal.canonicalSha256) ||
    sourceProjection.reportCanonicalSha256 !== sourceOwner.report.seal.canonicalSha256 ||
    runnerProjection.reportCanonicalSha256 !== runnerOwner.report.seal.canonicalSha256 ||
    runnerOwner.report.bindings.runtimeSourceCanonicalSha256 !==
      sourceProjection.reportCanonicalSha256 ||
    frozenV1.bindings.runtimeSourceCanonicalSha256 !== sourceProjection.reportCanonicalSha256 ||
    frozenV1.bindings.retainedRunnerCanonicalSha256 !== runnerProjection.reportCanonicalSha256 ||
    !bytesEqual(sourceProjection.normalizedTriangles, runnerProjection.normalizedTriangles) ||
    !positions3MatchPositions4(
      runnerProjection.finalPositions3M,
      runnerProjection.finalPositionsInvMassKg,
    ) ||
    runnerOwner.report.config.frameCount !== 16 ||
    runnerOwner.report.execution.frameSubmissionCount !== 16 ||
    !runnerOwner.report.claims.exactCanonicalMediumWorkloadExecuted ||
    runnerOwner.report.claims.fitAuthority ||
    runnerOwner.report.claims.runtimeAuthority ||
    runnerOwner.report.claims.productionAuthority
  )
    throw new Error('Live source/retained runner/frozen V1 binding drifted.');
  for (const value of runnerProjection.finalPositions3M)
    if (!Number.isFinite(value))
      throw new RangeError('Final retained positions contain non-finite data.');
}

export async function evaluateBetaSkirtCanonicalMediumConfinedAoSeamContactWitnessV2(
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  retainedRunnerOwner: BetaSkirtCanonicalMediumWebgpu16FrameRunnerOwnerV1,
): Promise<BetaSkirtCanonicalMediumConfinedAoSeamContactResultV2> {
  const sourceProjection = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSourceOwner);
  if (!sourceProjection)
    return failure(
      'source-owner-unavailable',
      'A live canonical-medium runtime-source owner is required.',
    );
  const runnerProjection = projectBetaSkirtCanonicalMediumWebgpu16FrameV1(retainedRunnerOwner);
  if (!runnerProjection)
    return failure(
      'retained-owner-unavailable',
      'A live retained 16-frame V1 runner owner is required.',
    );

  const frozenDiagnostic =
    await evaluateBetaSkirtCanonicalMediumPostFrameSelfOrientationDiagnosticV1(
      runtimeSourceOwner,
      retainedRunnerOwner,
    );
  if (!frozenDiagnostic.ok)
    return failure(
      'upstream-v1-diagnostic-failed',
      `${frozenDiagnostic.code}: ${frozenDiagnostic.detail}`,
    );

  try {
    validateCanonicalLiveBindings({
      sourceProjection,
      runnerProjection,
      sourceOwner: runtimeSourceOwner,
      runnerOwner: retainedRunnerOwner,
      frozenV1: frozenDiagnostic.report,
    });
    const [finalPositionsHash, topologyHash, seamHash] = await Promise.all([
      sha256Bytes(littleEndianBytes(runnerProjection.finalPositions3M)),
      sha256Bytes(littleEndianBytes(runnerProjection.normalizedTriangles)),
      sha256Bytes(littleEndianBytes(sourceProjection.seamPairs)),
    ]);
    if (
      finalPositionsHash !== retainedRunnerOwner.report.bindings.finalPositions3MSha256 ||
      finalPositionsHash !== frozenDiagnostic.report.bindings.finalPositions3MSha256 ||
      topologyHash !== runtimeSourceOwner.report.bindings.normalizedTopologySha256 ||
      topologyHash !== frozenDiagnostic.report.bindings.normalizedTopologySha256 ||
      seamHash !== runtimeSourceOwner.report.bindings.seamPairsSha256 ||
      seamHash !== frozenDiagnostic.report.bindings.seamPairsSha256
    )
      throw new Error('Exact final-position/topology/seam digest binding drifted.');

    let oracle: ReturnType<typeof validateMeasurementSurfaceSelfIntersectionV1>;
    try {
      oracle = validateMeasurementSurfaceSelfIntersectionV1(
        new Float32Array(runnerProjection.finalPositions3M),
        new Uint32Array(runnerProjection.normalizedTriangles),
        SELF_POLICY,
      );
    } catch (error) {
      return failure(
        'contact-witness-rejected',
        error instanceof Error ? error.message : String(error),
      );
    }
    const rawKindCounts = kindCounts(oracle.intersections);
    const frozenSelf = frozenDiagnostic.report.selfIntersection;
    if (
      oracle.intersectionCount !== frozenSelf.rawOracleIntersectionCount ||
      oracle.epsilonM !== frozenSelf.epsilonM ||
      oracle.broadPhase.candidatePairCount !== frozenSelf.broadPhaseCandidatePairCount ||
      oracle.broadPhase.testedPairCount !== frozenSelf.oracleTestedPairCount ||
      !sameKindCounts(rawKindCounts, frozenSelf.rawOracle.kindCounts)
    )
      throw new Error('Unchanged oracle V1 replay differs from frozen diagnostic V1.');
    if (oracle.intersectionCount > MAX_RAW_INTERSECTION_COUNT)
      return failure(
        'resource-budget-exceeded',
        `Raw intersection cap exceeded (${oracle.intersectionCount} > ${MAX_RAW_INTERSECTION_COUNT}).`,
      );

    let carriers: CarrierIndex;
    try {
      carriers = buildCarrierIndex({
        triangles: runnerProjection.normalizedTriangles,
        seamPairs: sourceProjection.seamPairs,
        vertexCount: VERTEX_COUNT,
        requireCanonicalSeamCount: true,
      });
    } catch (error) {
      return failure('carrier-rejected', error instanceof Error ? error.message : String(error));
    }

    const allWitnesses: BetaSkirtCanonicalMediumContactPairWitnessV2[] = [];
    for (const pair of oracle.intersections) {
      allWitnesses.push(
        await evaluateBetaSkirtCanonicalMediumConfinedContactPairV2({
          positions: runnerProjection.finalPositions3M,
          triangles: runnerProjection.normalizedTriangles,
          seamPairs: sourceProjection.seamPairs,
          pair,
          epsilonM: oracle.epsilonM,
          vertexCount: VERTEX_COUNT,
          requireCanonicalSeamCount: true,
        }),
      );
    }
    const excluded = allWitnesses.filter(
      (value) => value.disposition === 'excluded-confined-authenticated-ao-seam-touching',
    );
    const residual = allWitnesses.filter(
      (value) => value.disposition !== 'excluded-confined-authenticated-ao-seam-touching',
    );
    if (excluded.length + residual.length !== oracle.intersectionCount)
      throw new Error('Raw/excluded/residual contact witness accounting drifted.');

    const allFeatures = allWitnesses.flatMap((value) => value.features);
    const aggregateContactLocusSha256 = await sha256Json(
      allWitnesses.map((value) => ({
        triangleA: value.triangleA,
        triangleB: value.triangleB,
        oracleKind: value.oracleKind,
        contactLocusSha256: value.contactLocusSha256,
        disposition: value.disposition,
      })),
    );
    const blockers = Object.freeze([
      ...(residual.length > 0 ? ['non-confined-or-unsupported-self-contact-remains'] : []),
      'post-frame-distortion-acceptance-not-established',
      'actual-body-contact-is-outside-this-self-contact-witness',
      'settle-fit-runtime-and-production-authority-not-established',
    ]);
    const reportWithoutSeal = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_CONFINED_AO_SEAM_CONTACT_WITNESS_V2,
      status: 'diagnostic-completed' as const,
      decision:
        residual.length === 0
          ? ('MEASURED_ZERO_RESIDUAL_AFTER_CONFINED_AO_SEAM_WITNESS' as const)
          : ('BLOCK_NON_CONFINED_OR_UNSUPPORTED_SELF_CONTACT' as const),
      bindings: Object.freeze({
        retainedAdapterVersion: 'frozen-v1-runner' as const,
        runtimeSourceCanonicalSha256: sourceProjection.reportCanonicalSha256,
        retainedRunnerCanonicalSha256: runnerProjection.reportCanonicalSha256,
        postFrameDiagnosticV1CanonicalSha256: frozenDiagnostic.report.seal.canonicalSha256,
        finalPositions3MSha256: finalPositionsHash,
        normalizedTopologySha256: topologyHash,
        seamPairsSha256: seamHash,
      }),
      counts: Object.freeze({
        vertexCount: VERTEX_COUNT as 580,
        triangleCount: TRIANGLE_COUNT as 912,
        seamPairCount: SEAM_PAIR_COUNT as 34,
        pinnedVertexCount: PIN_COUNT as 82,
      }),
      oracle: Object.freeze({
        version: MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
        epsilonM: oracle.epsilonM,
        angularEpsilon: ANGULAR_EPSILON,
        rawIntersectionCount: oracle.intersectionCount,
        rawKindCounts,
        broadPhaseCandidatePairCount: oracle.broadPhase.candidatePairCount,
        testedPairCount: oracle.broadPhase.testedPairCount,
        bindingMode: 'frozen-v1-diagnostic-exact-replay' as const,
        replayMatchesFrozenV1: true as const,
      }),
      accounting: Object.freeze({
        rawIntersectionCount: oracle.intersectionCount,
        confinedExcludedCount: excluded.length,
        confinedExcludedKindCounts: witnessKindCounts(excluded),
        residualCount: residual.length,
        residualKindCounts: witnessKindCounts(residual),
        exactRawEqualsExcludedPlusResidual: true as const,
      }),
      carriers: Object.freeze({
        directEndpointPairCount: SEAM_PAIR_COUNT as 34,
        pairedSegmentCarrierCount: carriers.pairedSegments.length,
        directOneToOneAuthenticated: true as const,
      }),
      witnessEvidence: Object.freeze({
        totalFeatureCount: allFeatures.length,
        endpointFeatureCount: allFeatures.filter((value) => value.kind === 'endpoint').length,
        vertexVertexFeatureCount: allFeatures.filter((value) => value.kind === 'vertex-vertex')
          .length,
        vertexEdgeFeatureCount: allFeatures.filter((value) => value.kind === 'vertex-edge').length,
        vertexFaceFeatureCount: allFeatures.filter((value) => value.kind === 'vertex-face').length,
        edgeEdgeFeatureCount: allFeatures.filter((value) => value.kind === 'edge-edge').length,
        edgeFaceFeatureCount: allFeatures.filter((value) => value.kind === 'edge-face').length,
        faceFaceFeatureCount: allFeatures.filter((value) => value.kind === 'face-face').length,
        nonConfinedCarrierAdjacentFeatureCount: allFeatures.filter(
          (value) =>
            value.nonConfinedRelation === 'authenticated-carrier-adjacent-but-not-confined',
        ).length,
        nonSeamContactFeatureCount: allFeatures.filter(
          (value) => value.nonConfinedRelation === 'non-seam-contact-feature',
        ).length,
        aggregateContactLocusSha256,
        // Residuals are retained first so a blocked result always carries its exact hostile locus,
        // even when the raw oracle list exceeds the bounded evidence window.
        pairWitnesses: Object.freeze(
          [...residual, ...excluded].slice(0, MAX_RETAINED_PAIR_WITNESSES),
        ),
        pairWitnessesTruncated: allWitnesses.length > MAX_RETAINED_PAIR_WITNESSES,
        maximumRawIntersectionCount: MAX_RAW_INTERSECTION_COUNT,
        maximumFeaturesPerPair: MAX_FEATURES_PER_PAIR,
        maximumRetainedPairWitnesses: MAX_RETAINED_PAIR_WITNESSES,
      }),
      blockers,
      claims: Object.freeze({
        exactLiveRetainedCandidateMeasured: true as const,
        acceptedMeasurementSurfaceOracleV1Unchanged: true as const,
        allTouchingPairsHaveExplicitContactFeatureLocus: allWitnesses
          .filter((value) => value.oracleKind === 'touching')
          .every((value) => value.featureCount > 0),
        exclusionRequiresEveryFeatureOnPairedAuthenticatedCarrier: true as const,
        properCrossingEverExcluded: false as const,
        coplanarOverlapEverExcluded: false as const,
        contactClearDiagnosticAuthority: residual.length === 0,
        upstreamExactActualBodyGateClear: false as const,
        distortionAcceptanceThresholdFrozen: false as const,
        fitAuthority: false as const,
        runtimeAuthority: false as const,
        productionAuthority: false as const,
      }),
    });
    const sealHash = await sha256Json(reportWithoutSeal);
    const report: BetaSkirtCanonicalMediumConfinedAoSeamContactReportV2 = Object.freeze({
      ...reportWithoutSeal,
      seal: Object.freeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: sealHash,
        authority: 'unsigned-confined-ao-seam-contact-diagnostic-only' as const,
      }),
    });
    if (residual.length > 0)
      return failure(
        'non-confined-contact-blocked',
        `${residual.length}/${oracle.intersectionCount} raw contacts are not proven confined to authenticated AO seam carriers.`,
        report,
      );

    const owner = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_CONFINED_AO_SEAM_CONTACT_OWNER_V2,
      report,
    }) as BetaSkirtCanonicalMediumConfinedAoSeamContactOwnerV2;
    owners.set(
      owner,
      Object.freeze({
        finalPositionsInvMassKg: new Float32Array(runnerProjection.finalPositionsInvMassKg),
        finalPositions3M: new Float32Array(runnerProjection.finalPositions3M),
        normalizedTriangles: new Uint32Array(runnerProjection.normalizedTriangles),
      }),
    );
    return Object.freeze({ ok: true as const, owner, report });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/SHA-256/iu.test(detail)) return failure('sha256-unavailable', detail);
    if (/cap|count|out of range|non-finite|degenerate/iu.test(detail))
      return failure('resource-budget-exceeded', detail);
    return failure('binding-mismatch', detail);
  }
}

/**
 * Additive retained-runner V2 adapter. It binds a live contact-clear V2 owner to the same unchanged
 * MeasurementSurface V1 oracle and confined-feature classifier used above; it never trusts copied
 * projection bytes or the V2 body's contact pass as garment self-contact evidence.
 */
export async function evaluateBetaSkirtCanonicalMediumConfinedAoSeamContactWitnessForContactRunnerV2(
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  retainedRunnerOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
): Promise<BetaSkirtCanonicalMediumConfinedAoSeamContactResultV2> {
  const sourceProjection = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSourceOwner);
  if (!sourceProjection)
    return failure(
      'source-owner-unavailable',
      'A live canonical-medium runtime-source owner is required.',
    );
  const runnerProjection =
    projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2(retainedRunnerOwner);
  if (!runnerProjection)
    return failure(
      'retained-owner-unavailable',
      'A live retained 16-frame contact-runner V2 owner is required.',
    );

  try {
    const runnerReport = retainedRunnerOwner.report;
    if (
      sourceProjection.initialPhysicalPositionsInvMassKg.length !== VERTEX_COUNT * 4 ||
      sourceProjection.normalizedTriangles.length !== TRIANGLE_COUNT * 3 ||
      sourceProjection.seamPairs.length !== SEAM_PAIR_COUNT * 2 ||
      sourceProjection.pinnedWaistVertexIndices.length !== PIN_COUNT ||
      runnerProjection.finalPositionsInvMassKg.length !== VERTEX_COUNT * 4 ||
      runnerProjection.finalPositions3M.length !== VERTEX_COUNT * 3 ||
      runnerProjection.normalizedTriangles.length !== TRIANGLE_COUNT * 3
    )
      throw new RangeError('Canonical-medium retained contact-runner V2 counts drifted.');
    if (
      !SHA256.test(sourceProjection.reportCanonicalSha256) ||
      !SHA256.test(runnerProjection.reportCanonicalSha256) ||
      sourceProjection.reportCanonicalSha256 !== runtimeSourceOwner.report.seal.canonicalSha256 ||
      runnerProjection.reportCanonicalSha256 !== runnerReport.seal.canonicalSha256 ||
      runnerReport.bindings.runtimeSourceCanonicalSha256 !==
        sourceProjection.reportCanonicalSha256 ||
      !bytesEqual(sourceProjection.normalizedTriangles, runnerProjection.normalizedTriangles) ||
      !positions3MatchPositions4(
        runnerProjection.finalPositions3M,
        runnerProjection.finalPositionsInvMassKg,
      ) ||
      runnerReport.status !== 'diagnostic-completed' ||
      runnerReport.decision !== 'PASS_16_FRAME_EXACT_BODY_CONTACT_AND_POSTGATE' ||
      runnerReport.config.frameCount !== 16 ||
      runnerReport.execution.frameSubmissionCount !== 16 ||
      !runnerReport.claims.exactCanonicalMediumWorkloadExecuted ||
      !runnerReport.claims.exactActualBodyCollisionReplayExecuted ||
      !runnerReport.claims.exactActualBodyTriangleMeshContactTailExecuted ||
      runnerReport.claims.analyticalCapsulesOrProxiesUsed ||
      runnerReport.claims.fitAuthority ||
      runnerReport.claims.runtimeAuthority ||
      runnerReport.claims.productionAuthority ||
      !runnerReport.collision.exactActualBodyGateClear ||
      runnerReport.collision.bodyGarmentTriangleIntersectionCount !== 0 ||
      runnerReport.collision.penetratingVertexCount !== 0 ||
      runnerReport.collision.unsafeVertexCount !== 0 ||
      runnerReport.collision.ambiguousSignVertexCount !== 0
    )
      throw new Error('Live source/contact-runner V2 owner or exact actual-body gate drifted.');
    for (const value of runnerProjection.finalPositions3M)
      if (!Number.isFinite(value))
        throw new RangeError('Final retained V2 positions contain non-finite data.');

    const [finalPositionsHash, topologyHash, seamHash] = await Promise.all([
      sha256Bytes(littleEndianBytes(runnerProjection.finalPositions3M)),
      sha256Bytes(littleEndianBytes(runnerProjection.normalizedTriangles)),
      sha256Bytes(littleEndianBytes(sourceProjection.seamPairs)),
    ]);
    if (
      finalPositionsHash !== runnerReport.bindings.finalPositions3MSha256 ||
      finalPositionsHash !== runnerReport.bindings.finalCollisionBindingPositionsSha256 ||
      topologyHash !== runtimeSourceOwner.report.bindings.normalizedTopologySha256 ||
      seamHash !== runtimeSourceOwner.report.bindings.seamPairsSha256
    )
      throw new Error('Exact V2 final-position/topology/seam digest binding drifted.');

    let oracle: ReturnType<typeof validateMeasurementSurfaceSelfIntersectionV1>;
    try {
      oracle = validateMeasurementSurfaceSelfIntersectionV1(
        new Float32Array(runnerProjection.finalPositions3M),
        new Uint32Array(runnerProjection.normalizedTriangles),
        SELF_POLICY,
      );
    } catch (error) {
      return failure(
        'contact-witness-rejected',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (oracle.intersectionCount > MAX_RAW_INTERSECTION_COUNT)
      return failure(
        'resource-budget-exceeded',
        `Raw intersection cap exceeded (${oracle.intersectionCount} > ${MAX_RAW_INTERSECTION_COUNT}).`,
      );
    let carriers: CarrierIndex;
    try {
      carriers = buildCarrierIndex({
        triangles: runnerProjection.normalizedTriangles,
        seamPairs: sourceProjection.seamPairs,
        vertexCount: VERTEX_COUNT,
        requireCanonicalSeamCount: true,
      });
    } catch (error) {
      return failure('carrier-rejected', error instanceof Error ? error.message : String(error));
    }

    const allWitnesses: BetaSkirtCanonicalMediumContactPairWitnessV2[] = [];
    for (const pair of oracle.intersections)
      allWitnesses.push(
        await evaluateBetaSkirtCanonicalMediumConfinedContactPairV2({
          positions: runnerProjection.finalPositions3M,
          triangles: runnerProjection.normalizedTriangles,
          seamPairs: sourceProjection.seamPairs,
          pair,
          epsilonM: oracle.epsilonM,
          vertexCount: VERTEX_COUNT,
          requireCanonicalSeamCount: true,
        }),
      );
    const excluded = allWitnesses.filter(
      (value) => value.disposition === 'excluded-confined-authenticated-ao-seam-touching',
    );
    const residual = allWitnesses.filter(
      (value) => value.disposition !== 'excluded-confined-authenticated-ao-seam-touching',
    );
    if (excluded.length + residual.length !== oracle.intersectionCount)
      throw new Error('V2 raw/excluded/residual contact witness accounting drifted.');
    const rawKindCounts = kindCounts(oracle.intersections);
    const allFeatures = allWitnesses.flatMap((value) => value.features);
    const aggregateContactLocusSha256 = await sha256Json(
      allWitnesses.map((value) => ({
        triangleA: value.triangleA,
        triangleB: value.triangleB,
        oracleKind: value.oracleKind,
        contactLocusSha256: value.contactLocusSha256,
        disposition: value.disposition,
      })),
    );
    const blockers = Object.freeze([
      ...(residual.length > 0 ? ['non-confined-or-unsupported-self-contact-remains'] : []),
      'post-frame-distortion-acceptance-not-established',
      'settle-fit-runtime-and-production-authority-not-established',
    ]);
    const reportWithoutSeal = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_CONFINED_AO_SEAM_CONTACT_WITNESS_V2,
      status: 'diagnostic-completed' as const,
      decision:
        residual.length === 0
          ? ('MEASURED_ZERO_RESIDUAL_AFTER_CONFINED_AO_SEAM_WITNESS' as const)
          : ('BLOCK_NON_CONFINED_OR_UNSUPPORTED_SELF_CONTACT' as const),
      bindings: Object.freeze({
        retainedAdapterVersion: 'actual-body-contact-runner-v2' as const,
        runtimeSourceCanonicalSha256: sourceProjection.reportCanonicalSha256,
        retainedRunnerCanonicalSha256: runnerProjection.reportCanonicalSha256,
        postFrameDiagnosticV1CanonicalSha256: null,
        finalPositions3MSha256: finalPositionsHash,
        normalizedTopologySha256: topologyHash,
        seamPairsSha256: seamHash,
      }),
      counts: Object.freeze({
        vertexCount: VERTEX_COUNT as 580,
        triangleCount: TRIANGLE_COUNT as 912,
        seamPairCount: SEAM_PAIR_COUNT as 34,
        pinnedVertexCount: PIN_COUNT as 82,
      }),
      oracle: Object.freeze({
        version: MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
        epsilonM: oracle.epsilonM,
        angularEpsilon: ANGULAR_EPSILON,
        rawIntersectionCount: oracle.intersectionCount,
        rawKindCounts,
        broadPhaseCandidatePairCount: oracle.broadPhase.candidatePairCount,
        testedPairCount: oracle.broadPhase.testedPairCount,
        bindingMode: 'contact-runner-v2-direct-live-binding' as const,
        replayMatchesFrozenV1: false,
      }),
      accounting: Object.freeze({
        rawIntersectionCount: oracle.intersectionCount,
        confinedExcludedCount: excluded.length,
        confinedExcludedKindCounts: witnessKindCounts(excluded),
        residualCount: residual.length,
        residualKindCounts: witnessKindCounts(residual),
        exactRawEqualsExcludedPlusResidual: true as const,
      }),
      carriers: Object.freeze({
        directEndpointPairCount: SEAM_PAIR_COUNT as 34,
        pairedSegmentCarrierCount: carriers.pairedSegments.length,
        directOneToOneAuthenticated: true as const,
      }),
      witnessEvidence: Object.freeze({
        totalFeatureCount: allFeatures.length,
        endpointFeatureCount: allFeatures.filter((value) => value.kind === 'endpoint').length,
        vertexVertexFeatureCount: allFeatures.filter((value) => value.kind === 'vertex-vertex')
          .length,
        vertexEdgeFeatureCount: allFeatures.filter((value) => value.kind === 'vertex-edge').length,
        vertexFaceFeatureCount: allFeatures.filter((value) => value.kind === 'vertex-face').length,
        edgeEdgeFeatureCount: allFeatures.filter((value) => value.kind === 'edge-edge').length,
        edgeFaceFeatureCount: allFeatures.filter((value) => value.kind === 'edge-face').length,
        faceFaceFeatureCount: allFeatures.filter((value) => value.kind === 'face-face').length,
        nonConfinedCarrierAdjacentFeatureCount: allFeatures.filter(
          (value) =>
            value.nonConfinedRelation === 'authenticated-carrier-adjacent-but-not-confined',
        ).length,
        nonSeamContactFeatureCount: allFeatures.filter(
          (value) => value.nonConfinedRelation === 'non-seam-contact-feature',
        ).length,
        aggregateContactLocusSha256,
        pairWitnesses: Object.freeze(
          [...residual, ...excluded].slice(0, MAX_RETAINED_PAIR_WITNESSES),
        ),
        pairWitnessesTruncated: allWitnesses.length > MAX_RETAINED_PAIR_WITNESSES,
        maximumRawIntersectionCount: MAX_RAW_INTERSECTION_COUNT,
        maximumFeaturesPerPair: MAX_FEATURES_PER_PAIR,
        maximumRetainedPairWitnesses: MAX_RETAINED_PAIR_WITNESSES,
      }),
      blockers,
      claims: Object.freeze({
        exactLiveRetainedCandidateMeasured: true as const,
        acceptedMeasurementSurfaceOracleV1Unchanged: true as const,
        allTouchingPairsHaveExplicitContactFeatureLocus: allWitnesses
          .filter((value) => value.oracleKind === 'touching')
          .every((value) => value.featureCount > 0),
        exclusionRequiresEveryFeatureOnPairedAuthenticatedCarrier: true as const,
        properCrossingEverExcluded: false as const,
        coplanarOverlapEverExcluded: false as const,
        contactClearDiagnosticAuthority: residual.length === 0,
        upstreamExactActualBodyGateClear: true as const,
        distortionAcceptanceThresholdFrozen: false as const,
        fitAuthority: false as const,
        runtimeAuthority: false as const,
        productionAuthority: false as const,
      }),
    });
    const sealHash = await sha256Json(reportWithoutSeal);
    const report: BetaSkirtCanonicalMediumConfinedAoSeamContactReportV2 = Object.freeze({
      ...reportWithoutSeal,
      seal: Object.freeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: sealHash,
        authority: 'unsigned-confined-ao-seam-contact-diagnostic-only' as const,
      }),
    });
    if (residual.length > 0)
      return failure(
        'non-confined-contact-blocked',
        `${residual.length}/${oracle.intersectionCount} raw V2 contacts are not proven confined to authenticated AO seam carriers.`,
        report,
      );
    const owner = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_CONFINED_AO_SEAM_CONTACT_OWNER_V2,
      report,
    }) as BetaSkirtCanonicalMediumConfinedAoSeamContactOwnerV2;
    owners.set(
      owner,
      Object.freeze({
        finalPositionsInvMassKg: new Float32Array(runnerProjection.finalPositionsInvMassKg),
        finalPositions3M: new Float32Array(runnerProjection.finalPositions3M),
        normalizedTriangles: new Uint32Array(runnerProjection.normalizedTriangles),
      }),
    );
    return Object.freeze({ ok: true as const, owner, report });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/SHA-256/iu.test(detail)) return failure('sha256-unavailable', detail);
    if (/cap|count|out of range|non-finite|degenerate/iu.test(detail))
      return failure('resource-budget-exceeded', detail);
    return failure('binding-mismatch', detail);
  }
}

export function projectBetaSkirtCanonicalMediumConfinedAoSeamContactV2(
  owner: unknown,
): BetaSkirtCanonicalMediumConfinedAoSeamContactProjectionV2 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner as object);
  if (!record) return null;
  const publicOwner = owner as BetaSkirtCanonicalMediumConfinedAoSeamContactOwnerV2;
  return Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_CONFINED_AO_SEAM_CONTACT_PROJECTION_V2,
    reportCanonicalSha256: publicOwner.report.seal.canonicalSha256,
    finalPositionsInvMassKg: new Float32Array(record.finalPositionsInvMassKg),
    finalPositions3M: new Float32Array(record.finalPositions3M),
    normalizedTriangles: new Uint32Array(record.normalizedTriangles),
    contactClear: true as const,
    callerOwnedMutableBinaryCopies: true as const,
    fitAuthority: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumConfinedAoSeamContactV2(owner: unknown): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner as object);
  if (!record) return false;
  record.finalPositionsInvMassKg.fill(0);
  record.finalPositions3M.fill(0);
  record.normalizedTriangles.fill(0);
  owners.delete(owner as object);
  return true;
}
