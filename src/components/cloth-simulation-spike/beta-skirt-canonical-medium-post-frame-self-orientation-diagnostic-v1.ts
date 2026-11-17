import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
  type MeasurementSurfaceIntersectionKindV1,
  type MeasurementSurfaceIntersectionPairV1,
} from '../../lib/cloth/body/measurement-surface-self-intersection-v1';

import {
  projectBetaSkirtCanonicalMediumWebgpu16FrameV1,
  type BetaSkirtCanonicalMediumWebgpu16FrameRunnerOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-16-frame-runner-v1';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_POST_FRAME_SELF_ORIENTATION_DIAGNOSTIC_V1 =
  'beta-skirt-canonical-medium-post-frame-self-orientation-diagnostic/1' as const;

const VERTEX_COUNT = 580;
const TRIANGLE_COUNT = 912;
const SEAM_PAIR_COUNT = 34;
const PIN_COUNT = 82;
const WITNESS_LIMIT = 64;
const DEGENERATE_NORMAL_EPSILON = 1e-14;
const SHA256 = /^[0-9a-f]{64}$/u;

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

type KindCounts = Readonly<Record<MeasurementSurfaceIntersectionKindV1, number>>;

export type BetaSkirtCanonicalMediumPostFrameIntersectionClassV1 = Readonly<{
  count: number;
  kindCounts: KindCounts;
  witnesses: readonly MeasurementSurfaceIntersectionPairV1[];
  witnessesTruncated: boolean;
}>;

export type BetaSkirtCanonicalMediumPostFrameSelfOrientationReportV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_POST_FRAME_SELF_ORIENTATION_DIAGNOSTIC_V1;
  status: 'diagnostic-completed';
  decision:
    | 'MEASURED_SELF_AND_ORIENTATION_CLEAR_WITH_SEPARATE_DISTORTION_BLOCKER'
    | 'MEASURED_POST_FRAME_SELF_ORIENTATION_BLOCKED';
  bindings: Readonly<{
    runtimeSourceCanonicalSha256: string;
    retainedRunnerCanonicalSha256: string;
    sourcePositions3MSha256: string;
    finalPositions3MSha256: string;
    normalizedTopologySha256: string;
    seamPairsSha256: string;
    pinnedVertexIndicesSha256: string;
  }>;
  counts: Readonly<{
    vertexCount: 580;
    triangleCount: 912;
    seamPairCount: 34;
    pinnedVertexCount: 82;
  }>;
  selfIntersection: Readonly<{
    oracleVersion: typeof MEASUREMENT_SURFACE_SELF_INTERSECTION_V1;
    epsilonM: number;
    theoreticalTrianglePairCount: number;
    broadPhaseCandidatePairCount: number;
    oracleTestedPairCount: number;
    rawOracleIntersectionCount: number;
    rawOracle: BetaSkirtCanonicalMediumPostFrameIntersectionClassV1;
    indexedAdjacentObserved: BetaSkirtCanonicalMediumPostFrameIntersectionClassV1;
    authenticatedAoSeamIncidentObserved: BetaSkirtCanonicalMediumPostFrameIntersectionClassV1;
    nonadjacentObserved: BetaSkirtCanonicalMediumPostFrameIntersectionClassV1;
    excludedAdjacentIntersectionCount: 0;
    residualBlocking: BetaSkirtCanonicalMediumPostFrameIntersectionClassV1;
    exactAccounting: true;
    seamObservationRule: 'direct-authenticated-seam-endpoints-both-incident-to-the-reported-triangle-pair';
    seamExclusionPolicy: 'disabled-no-confined-contact-witness-api';
  }>;
  facetOrientation: Readonly<{
    comparison: 'source-f32-facet-vs-final-gpu-f32-facet';
    comparedTriangleCount: number;
    sourceDegenerateTriangleCount: number;
    finalDegenerateTriangleCount: number;
    normalReversalCount: number;
    minimumSourceToFinalNormalDot: number | null;
    maximumNormalChangeRadians: number | null;
  }>;
  seamPinParity: Readonly<{
    sourceMaximumSeamGapM: number;
    finalMaximumSeamGapM: number;
    runnerInitialMaximumSeamGapM: number;
    runnerFinalMaximumSeamGapM: number;
    seamGapReceiptExact: true;
    zeroInverseMassVertexCount: number;
    positiveInverseMassVertexCount: number;
    inverseMassBitMismatchCount: number;
    pinnedPositionBitMismatchCount: number;
    maximumPinnedPositionDisplacementM: number;
    exactPinMaskParity: true;
  }>;
  upstreamRunner: Readonly<{
    adapterVersion: 'canonical-medium-retained-runner-v1' | 'canonical-medium-retained-runner-v2';
    status: string;
    decision: string;
    blockers: readonly string[];
  }>;
  blockers: readonly string[];
  claims: Readonly<{
    exactRetainedFinalGpuCandidateMeasured: true;
    exactNormalizedTopologyRetained: true;
    aoSeamPairsAndPinsBoundToLiveRuntimeSourceOwner: true;
    directIncidentSeamEndpointEvidenceClassifiedForObservationOnly: true;
    seamIncidentPairsExcludedAsSafe: false;
    geometricSeamNearnessTreatedAsSafe: false;
    simulationExecuted: true;
    selfIntersectionAuthority: false;
    distortionAcceptanceThresholdFrozen: false;
    fitAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-post-frame-self-orientation-diagnostic-only';
  }>;
}>;

export type BetaSkirtCanonicalMediumPostFrameSelfOrientationResultV1 =
  | Readonly<{
      ok: true;
      report: BetaSkirtCanonicalMediumPostFrameSelfOrientationReportV1;
    }>
  | Readonly<{
      ok: false;
      code:
        | 'source-owner-unavailable'
        | 'retained-owner-unavailable'
        | 'binding-mismatch'
        | 'resource-budget-exceeded'
        | 'oracle-rejected'
        | 'sha256-unavailable';
      detail: string;
    }>;

declare const retainedProjectionPortBrand: unique symbol;
export type BetaSkirtCanonicalMediumRetainedPostFrameReceiptPortV1 = Readonly<{
  runnerSchemaVersion: string;
  status: string;
  decision: string;
  blockers: readonly string[];
  reportCanonicalSha256: string;
  runtimeSourceCanonicalSha256: string;
  finalPositions3MSha256: string;
  frameCount: number;
  frameSubmissionCount: number;
  initialMaximumSeamGapM: number;
  finalMaximumSeamGapM: number;
  simulationExecuted: true;
  fitAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

/**
 * Stable port for a retained runner projection. A V2 adapter can populate this without changing
 * the bounded oracle or report logic; the brand remains owned by this module.
 */
export type BetaSkirtCanonicalMediumRetainedPostFrameProjectionPortV1 = Readonly<{
  adapterVersion: 'canonical-medium-retained-runner-v1' | 'canonical-medium-retained-runner-v2';
  receipt: BetaSkirtCanonicalMediumRetainedPostFrameReceiptPortV1;
  finalPositionsInvMassKg: Float32Array;
  finalPositions3M: Float32Array;
  normalizedTriangles: Uint32Array;
  readonly [retainedProjectionPortBrand]: never;
}>;

type OwnedSource = Readonly<{
  reportCanonicalSha256: string;
  sourcePositions3M: Float32Array<ArrayBuffer>;
  sourcePositionsInvMassKg: Float32Array<ArrayBuffer>;
  normalizedTriangles: Uint32Array<ArrayBuffer>;
  seamPairs: Uint32Array<ArrayBuffer>;
  pinnedVertexIndices: Uint32Array<ArrayBuffer>;
  bindings: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1['report']['bindings'];
}>;

type OwnedCandidate = Readonly<{
  adapterVersion: BetaSkirtCanonicalMediumRetainedPostFrameProjectionPortV1['adapterVersion'];
  receipt: BetaSkirtCanonicalMediumRetainedPostFrameReceiptPortV1;
  finalPositionsInvMassKg: Float32Array<ArrayBuffer>;
  finalPositions3M: Float32Array<ArrayBuffer>;
  normalizedTriangles: Uint32Array<ArrayBuffer>;
}>;

function failure(
  code: Exclude<BetaSkirtCanonicalMediumPostFrameSelfOrientationResultV1, { ok: true }>['code'],
  error: unknown,
): Exclude<BetaSkirtCanonicalMediumPostFrameSelfOrientationResultV1, { ok: true }> {
  return Object.freeze({
    ok: false,
    code,
    detail: error instanceof Error ? error.message : String(error),
  });
}

function f32(value: Float32Array): Float32Array<ArrayBuffer> {
  return new Float32Array(value);
}

function u32(value: Uint32Array): Uint32Array<ArrayBuffer> {
  return new Uint32Array(value);
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
      const a = new Uint8Array(
        positions3.buffer,
        positions3.byteOffset + (vertex * 3 + axis) * 4,
        4,
      );
      const b = new Uint8Array(
        positions4.buffer,
        positions4.byteOffset + (vertex * 4 + axis) * 4,
        4,
      );
      if (!bytesEqual(a, b)) return false;
    }
  }
  return true;
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

function createRetainedV1Port(
  owner: BetaSkirtCanonicalMediumWebgpu16FrameRunnerOwnerV1,
): BetaSkirtCanonicalMediumRetainedPostFrameProjectionPortV1 | null {
  const projection = projectBetaSkirtCanonicalMediumWebgpu16FrameV1(owner);
  if (!projection) return null;
  const report = owner.report;
  return Object.freeze({
    adapterVersion: 'canonical-medium-retained-runner-v1' as const,
    receipt: Object.freeze({
      runnerSchemaVersion: report.schemaVersion,
      status: report.status,
      decision: report.decision,
      blockers: Object.freeze([...report.blockers]),
      reportCanonicalSha256: projection.reportCanonicalSha256,
      runtimeSourceCanonicalSha256: report.bindings.runtimeSourceCanonicalSha256,
      finalPositions3MSha256: report.bindings.finalPositions3MSha256,
      frameCount: report.config.frameCount,
      frameSubmissionCount: report.execution.frameSubmissionCount,
      initialMaximumSeamGapM: report.observations.initialMaximumSeamGapM,
      finalMaximumSeamGapM: report.observations.finalMaximumSeamGapM,
      simulationExecuted: report.claims.exactCanonicalMediumWorkloadExecuted,
      fitAuthority: report.claims.fitAuthority,
      runtimeAuthority: report.claims.runtimeAuthority,
      productionAuthority: report.claims.productionAuthority,
    }),
    finalPositionsInvMassKg: projection.finalPositionsInvMassKg,
    finalPositions3M: projection.finalPositions3M,
    normalizedTriangles: projection.normalizedTriangles,
  }) as BetaSkirtCanonicalMediumRetainedPostFrameProjectionPortV1;
}

function snapshotSource(
  owner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
): OwnedSource | null {
  const projection = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(owner);
  if (!projection) return null;
  return Object.freeze({
    reportCanonicalSha256: projection.reportCanonicalSha256,
    sourcePositions3M: f32(projection.collisionInput.garmentPositionsM),
    sourcePositionsInvMassKg: f32(projection.initialPhysicalPositionsInvMassKg),
    normalizedTriangles: u32(projection.normalizedTriangles),
    seamPairs: u32(projection.seamPairs),
    pinnedVertexIndices: u32(projection.pinnedWaistVertexIndices),
    bindings: owner.report.bindings,
  });
}

function snapshotCandidate(
  port: BetaSkirtCanonicalMediumRetainedPostFrameProjectionPortV1,
): OwnedCandidate {
  return Object.freeze({
    adapterVersion: port.adapterVersion,
    receipt: Object.freeze({
      ...port.receipt,
      blockers: Object.freeze([...port.receipt.blockers]),
    }),
    finalPositionsInvMassKg: f32(port.finalPositionsInvMassKg),
    finalPositions3M: f32(port.finalPositions3M),
    normalizedTriangles: u32(port.normalizedTriangles),
  });
}

function kindCounts(values: readonly MeasurementSurfaceIntersectionPairV1[]): KindCounts {
  const result: Record<MeasurementSurfaceIntersectionKindV1, number> = {
    'proper-crossing': 0,
    'coplanar-overlap': 0,
    touching: 0,
  };
  for (const value of values) result[value.kind] += 1;
  return Object.freeze(result);
}

function intersectionClass(
  values: readonly MeasurementSurfaceIntersectionPairV1[],
): BetaSkirtCanonicalMediumPostFrameIntersectionClassV1 {
  return Object.freeze({
    count: values.length,
    kindCounts: kindCounts(values),
    witnesses: Object.freeze(
      values.slice(0, WITNESS_LIMIT).map((value) => Object.freeze({ ...value })),
    ),
    witnessesTruncated: values.length > WITNESS_LIMIT,
  });
}

function seamKey(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

export function classifyBetaSkirtCanonicalMediumPostFrameIntersectionsV1(options: {
  intersections: readonly MeasurementSurfaceIntersectionPairV1[];
  triangles: Uint32Array;
  seamPairs: Uint32Array;
  vertexCount: number;
}): Readonly<{
  indexedAdjacent: BetaSkirtCanonicalMediumPostFrameIntersectionClassV1;
  authenticatedAoSeamIncident: BetaSkirtCanonicalMediumPostFrameIntersectionClassV1;
  nonadjacent: BetaSkirtCanonicalMediumPostFrameIntersectionClassV1;
  residualBlocking: BetaSkirtCanonicalMediumPostFrameIntersectionClassV1;
}> {
  const directSeams = new Set<string>();
  const seamVertices = new Set<number>();
  if (options.seamPairs.length !== SEAM_PAIR_COUNT * 2)
    throw new RangeError('Exactly 34 authenticated AO seam pairs are required.');
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
      throw new RangeError('AO seam pairs must be in-range, direct, and one-to-one.');
    seamVertices.add(first);
    seamVertices.add(second);
    directSeams.add(seamKey(first, second));
  }
  const indexed: MeasurementSurfaceIntersectionPairV1[] = [];
  const seam: MeasurementSurfaceIntersectionPairV1[] = [];
  const residual: MeasurementSurfaceIntersectionPairV1[] = [];
  for (const witness of options.intersections) {
    if (
      witness.triangleA < 0 ||
      witness.triangleB <= witness.triangleA ||
      witness.triangleB >= options.triangles.length / 3
    )
      throw new RangeError('Oracle witness triangle indices are invalid or noncanonical.');
    const left = [
      options.triangles[witness.triangleA * 3]!,
      options.triangles[witness.triangleA * 3 + 1]!,
      options.triangles[witness.triangleA * 3 + 2]!,
    ];
    const right = [
      options.triangles[witness.triangleB * 3]!,
      options.triangles[witness.triangleB * 3 + 1]!,
      options.triangles[witness.triangleB * 3 + 2]!,
    ];
    if (left.some((vertex) => right.includes(vertex))) {
      indexed.push(witness);
      continue;
    }
    const directIncidentEvidence = left.some((leftVertex) =>
      right.some((rightVertex) => directSeams.has(seamKey(leftVertex, rightVertex))),
    );
    if (directIncidentEvidence) seam.push(witness);
    else residual.push(witness);
  }
  return Object.freeze({
    indexedAdjacent: intersectionClass(indexed),
    authenticatedAoSeamIncident: intersectionClass(seam),
    nonadjacent: intersectionClass(residual),
    // Pair-level endpoint incidence is useful classification evidence, but the V1 oracle exposes
    // no contact locus proving the contact is confined to that seam. Nothing is excluded as safe.
    residualBlocking: intersectionClass(options.intersections),
  });
}

type UnitNormal = readonly [number, number, number] | null;

function normal(positions: Float32Array, triangles: Uint32Array, triangle: number): UnitNormal {
  const a = triangles[triangle * 3]! * 3;
  const b = triangles[triangle * 3 + 1]! * 3;
  const c = triangles[triangle * 3 + 2]! * 3;
  const abx = positions[b]! - positions[a]!;
  const aby = positions[b + 1]! - positions[a + 1]!;
  const abz = positions[b + 2]! - positions[a + 2]!;
  const acx = positions[c]! - positions[a]!;
  const acy = positions[c + 1]! - positions[a + 1]!;
  const acz = positions[c + 2]! - positions[a + 2]!;
  const x = aby * acz - abz * acy;
  const y = abz * acx - abx * acz;
  const z = abx * acy - aby * acx;
  const length = Math.hypot(x, y, z);
  return length > DEGENERATE_NORMAL_EPSILON ? [x / length, y / length, z / length] : null;
}

function facetOrientation(
  source: Float32Array,
  final: Float32Array,
  triangles: Uint32Array,
): BetaSkirtCanonicalMediumPostFrameSelfOrientationReportV1['facetOrientation'] {
  let comparedTriangleCount = 0;
  let sourceDegenerateTriangleCount = 0;
  let finalDegenerateTriangleCount = 0;
  let normalReversalCount = 0;
  let minimumSourceToFinalNormalDot = 1;
  let maximumNormalChangeRadians = 0;
  for (let triangle = 0; triangle < triangles.length / 3; triangle += 1) {
    const sourceNormal = normal(source, triangles, triangle);
    const finalNormal = normal(final, triangles, triangle);
    if (!sourceNormal) sourceDegenerateTriangleCount += 1;
    if (!finalNormal) finalDegenerateTriangleCount += 1;
    if (!sourceNormal || !finalNormal) continue;
    const dot = Math.max(
      -1,
      Math.min(
        1,
        sourceNormal[0] * finalNormal[0] +
          sourceNormal[1] * finalNormal[1] +
          sourceNormal[2] * finalNormal[2],
      ),
    );
    minimumSourceToFinalNormalDot = Math.min(minimumSourceToFinalNormalDot, dot);
    maximumNormalChangeRadians = Math.max(maximumNormalChangeRadians, Math.acos(dot));
    if (dot < 0) normalReversalCount += 1;
    comparedTriangleCount += 1;
  }
  return Object.freeze({
    comparison: 'source-f32-facet-vs-final-gpu-f32-facet' as const,
    comparedTriangleCount,
    sourceDegenerateTriangleCount,
    finalDegenerateTriangleCount,
    normalReversalCount,
    minimumSourceToFinalNormalDot:
      comparedTriangleCount === 0 ? null : minimumSourceToFinalNormalDot,
    maximumNormalChangeRadians: comparedTriangleCount === 0 ? null : maximumNormalChangeRadians,
  });
}

function maximumSeamGap(positions4: Float32Array, seamPairs: Uint32Array): number {
  let maximum = 0;
  for (let seam = 0; seam < seamPairs.length / 2; seam += 1) {
    const a = seamPairs[seam * 2]! * 4;
    const b = seamPairs[seam * 2 + 1]! * 4;
    maximum = Math.max(
      maximum,
      Math.hypot(
        positions4[a]! - positions4[b]!,
        positions4[a + 1]! - positions4[b + 1]!,
        positions4[a + 2]! - positions4[b + 2]!,
      ),
    );
  }
  return maximum;
}

function seamPinParity(
  source: OwnedSource,
  candidate: OwnedCandidate,
): BetaSkirtCanonicalMediumPostFrameSelfOrientationReportV1['seamPinParity'] {
  const pinSet = new Set<number>();
  let previous = -1;
  for (const pin of source.pinnedVertexIndices) {
    if (pin <= previous || pin >= VERTEX_COUNT) throw new Error('Pin indices are not canonical.');
    pinSet.add(pin);
    previous = pin;
  }
  let zeroInverseMassVertexCount = 0;
  let positiveInverseMassVertexCount = 0;
  let inverseMassBitMismatchCount = 0;
  let pinnedPositionBitMismatchCount = 0;
  let maximumPinnedPositionDisplacementM = 0;
  const zeroBytes = new Uint8Array(new Float32Array([0]).buffer);
  for (let vertex = 0; vertex < VERTEX_COUNT; vertex += 1) {
    const sourceW = new Uint8Array(
      source.sourcePositionsInvMassKg.buffer,
      source.sourcePositionsInvMassKg.byteOffset + (vertex * 4 + 3) * 4,
      4,
    );
    const finalW = new Uint8Array(
      candidate.finalPositionsInvMassKg.buffer,
      candidate.finalPositionsInvMassKg.byteOffset + (vertex * 4 + 3) * 4,
      4,
    );
    const zero = bytesEqual(finalW, zeroBytes);
    if (zero) zeroInverseMassVertexCount += 1;
    else if (candidate.finalPositionsInvMassKg[vertex * 4 + 3]! > 0)
      positiveInverseMassVertexCount += 1;
    if (!bytesEqual(sourceW, finalW)) inverseMassBitMismatchCount += 1;
    if (pinSet.has(vertex)) {
      let bitMismatch = false;
      for (let axis = 0; axis < 3; axis += 1) {
        const sourceWord = new Uint8Array(
          source.sourcePositionsInvMassKg.buffer,
          source.sourcePositionsInvMassKg.byteOffset + (vertex * 4 + axis) * 4,
          4,
        );
        const finalWord = new Uint8Array(
          candidate.finalPositionsInvMassKg.buffer,
          candidate.finalPositionsInvMassKg.byteOffset + (vertex * 4 + axis) * 4,
          4,
        );
        if (!bytesEqual(sourceWord, finalWord)) bitMismatch = true;
      }
      if (bitMismatch) pinnedPositionBitMismatchCount += 1;
      maximumPinnedPositionDisplacementM = Math.max(
        maximumPinnedPositionDisplacementM,
        Math.hypot(
          source.sourcePositionsInvMassKg[vertex * 4]! -
            candidate.finalPositionsInvMassKg[vertex * 4]!,
          source.sourcePositionsInvMassKg[vertex * 4 + 1]! -
            candidate.finalPositionsInvMassKg[vertex * 4 + 1]!,
          source.sourcePositionsInvMassKg[vertex * 4 + 2]! -
            candidate.finalPositionsInvMassKg[vertex * 4 + 2]!,
        ),
      );
    }
  }
  const sourceMaximumSeamGapM = maximumSeamGap(source.sourcePositionsInvMassKg, source.seamPairs);
  const finalMaximumSeamGapM = maximumSeamGap(candidate.finalPositionsInvMassKg, source.seamPairs);
  if (
    sourceMaximumSeamGapM !== candidate.receipt.initialMaximumSeamGapM ||
    finalMaximumSeamGapM !== candidate.receipt.finalMaximumSeamGapM ||
    zeroInverseMassVertexCount !== PIN_COUNT ||
    positiveInverseMassVertexCount !== VERTEX_COUNT - PIN_COUNT ||
    inverseMassBitMismatchCount !== 0 ||
    pinnedPositionBitMismatchCount !== 0
  )
    throw new Error('Exact seam gap or pin parity differs from the retained runner receipt.');
  return Object.freeze({
    sourceMaximumSeamGapM,
    finalMaximumSeamGapM,
    runnerInitialMaximumSeamGapM: candidate.receipt.initialMaximumSeamGapM,
    runnerFinalMaximumSeamGapM: candidate.receipt.finalMaximumSeamGapM,
    seamGapReceiptExact: true as const,
    zeroInverseMassVertexCount,
    positiveInverseMassVertexCount,
    inverseMassBitMismatchCount,
    pinnedPositionBitMismatchCount,
    maximumPinnedPositionDisplacementM,
    exactPinMaskParity: true as const,
  });
}

function canonicalCounts(source: OwnedSource, candidate: OwnedCandidate): void {
  if (
    source.sourcePositions3M.length !== VERTEX_COUNT * 3 ||
    source.sourcePositionsInvMassKg.length !== VERTEX_COUNT * 4 ||
    source.normalizedTriangles.length !== TRIANGLE_COUNT * 3 ||
    source.seamPairs.length !== SEAM_PAIR_COUNT * 2 ||
    source.pinnedVertexIndices.length !== PIN_COUNT ||
    candidate.finalPositions3M.length !== VERTEX_COUNT * 3 ||
    candidate.finalPositionsInvMassKg.length !== VERTEX_COUNT * 4 ||
    candidate.normalizedTriangles.length !== TRIANGLE_COUNT * 3
  )
    throw new RangeError('Canonical-medium retained counts drifted.');
  for (const index of source.normalizedTriangles)
    if (index >= VERTEX_COUNT) throw new RangeError('Normalized topology index is out of range.');
  for (const value of candidate.finalPositions3M)
    if (!Number.isFinite(value))
      throw new RangeError('Final GPU positions contain non-finite data.');
}

async function evaluateOwned(
  source: OwnedSource,
  candidate: OwnedCandidate,
): Promise<BetaSkirtCanonicalMediumPostFrameSelfOrientationResultV1> {
  try {
    canonicalCounts(source, candidate);
    if (
      !SHA256.test(candidate.receipt.reportCanonicalSha256) ||
      !SHA256.test(candidate.receipt.runtimeSourceCanonicalSha256) ||
      !SHA256.test(candidate.receipt.finalPositions3MSha256) ||
      candidate.receipt.runtimeSourceCanonicalSha256 !== source.reportCanonicalSha256 ||
      !bytesEqual(source.normalizedTriangles, candidate.normalizedTriangles) ||
      !positions3MatchPositions4(candidate.finalPositions3M, candidate.finalPositionsInvMassKg) ||
      candidate.receipt.frameCount !== 16 ||
      candidate.receipt.frameSubmissionCount !== 16 ||
      candidate.receipt.simulationExecuted !== true ||
      candidate.receipt.fitAuthority ||
      candidate.receipt.runtimeAuthority ||
      candidate.receipt.productionAuthority
    )
      throw new Error('Live source/retained runner binding or execution boundary drifted.');

    const [sourcePositionsHash, finalPositionsHash, topologyHash, seamHash, pinsHash] =
      await Promise.all([
        sha256Bytes(littleEndianBytes(source.sourcePositions3M)),
        sha256Bytes(littleEndianBytes(candidate.finalPositions3M)),
        sha256Bytes(littleEndianBytes(candidate.normalizedTriangles)),
        sha256Bytes(littleEndianBytes(source.seamPairs)),
        sha256Bytes(littleEndianBytes(source.pinnedVertexIndices)),
      ]);
    if (
      ![sourcePositionsHash, finalPositionsHash, topologyHash, seamHash, pinsHash].every((value) =>
        SHA256.test(value),
      ) ||
      sourcePositionsHash !== source.bindings.sourcePositions3MSha256 ||
      finalPositionsHash !== candidate.receipt.finalPositions3MSha256 ||
      finalPositionsHash === sourcePositionsHash ||
      topologyHash !== source.bindings.normalizedTopologySha256 ||
      seamHash !== source.bindings.seamPairsSha256 ||
      pinsHash !== source.bindings.pinnedVertexIndicesSha256
    )
      throw new Error('Retained source/final/topology/seam/pin digest binding drifted.');

    let oracle: ReturnType<typeof validateMeasurementSurfaceSelfIntersectionV1>;
    try {
      oracle = validateMeasurementSurfaceSelfIntersectionV1(
        new Float32Array(candidate.finalPositions3M),
        new Uint32Array(candidate.normalizedTriangles),
        SELF_POLICY,
      );
    } catch (error) {
      return failure('oracle-rejected', error);
    }
    const classified = classifyBetaSkirtCanonicalMediumPostFrameIntersectionsV1({
      intersections: oracle.intersections,
      triangles: candidate.normalizedTriangles,
      seamPairs: source.seamPairs,
      vertexCount: VERTEX_COUNT,
    });
    const excludedAdjacentIntersectionCount = 0 as const;
    if (
      classified.indexedAdjacent.count +
        classified.authenticatedAoSeamIncident.count +
        classified.nonadjacent.count !==
        oracle.intersectionCount ||
      excludedAdjacentIntersectionCount + classified.residualBlocking.count !==
        oracle.intersectionCount
    )
      throw new Error('Self-intersection class accounting is not exact.');
    const orientation = facetOrientation(
      source.sourcePositions3M,
      candidate.finalPositions3M,
      candidate.normalizedTriangles,
    );
    const parity = seamPinParity(source, candidate);
    const selfOrientationClear =
      classified.residualBlocking.count === 0 &&
      orientation.sourceDegenerateTriangleCount === 0 &&
      orientation.finalDegenerateTriangleCount === 0 &&
      orientation.normalReversalCount === 0;
    const blockers = Object.freeze([
      ...(classified.residualBlocking.count > 0
        ? ['residual-self-intersections-present-no-confined-seam-contact-witness']
        : []),
      ...(orientation.sourceDegenerateTriangleCount > 0
        ? ['source-degenerate-facets-present']
        : []),
      ...(orientation.finalDegenerateTriangleCount > 0 ? ['final-degenerate-facets-present'] : []),
      ...(orientation.normalReversalCount > 0 ? ['source-to-final-normal-reversals-present'] : []),
      'post-frame-distortion-acceptance-not-established',
      'settle-fit-runtime-and-production-authority-not-established',
    ]);
    const reportWithoutSeal = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_POST_FRAME_SELF_ORIENTATION_DIAGNOSTIC_V1,
      status: 'diagnostic-completed' as const,
      decision: selfOrientationClear
        ? ('MEASURED_SELF_AND_ORIENTATION_CLEAR_WITH_SEPARATE_DISTORTION_BLOCKER' as const)
        : ('MEASURED_POST_FRAME_SELF_ORIENTATION_BLOCKED' as const),
      bindings: Object.freeze({
        runtimeSourceCanonicalSha256: source.reportCanonicalSha256,
        retainedRunnerCanonicalSha256: candidate.receipt.reportCanonicalSha256,
        sourcePositions3MSha256: sourcePositionsHash,
        finalPositions3MSha256: finalPositionsHash,
        normalizedTopologySha256: topologyHash,
        seamPairsSha256: seamHash,
        pinnedVertexIndicesSha256: pinsHash,
      }),
      counts: Object.freeze({
        vertexCount: VERTEX_COUNT,
        triangleCount: TRIANGLE_COUNT,
        seamPairCount: SEAM_PAIR_COUNT,
        pinnedVertexCount: PIN_COUNT,
      }),
      selfIntersection: Object.freeze({
        oracleVersion: MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
        epsilonM: oracle.epsilonM,
        theoreticalTrianglePairCount: (TRIANGLE_COUNT * (TRIANGLE_COUNT - 1)) / 2,
        broadPhaseCandidatePairCount: oracle.broadPhase.candidatePairCount,
        oracleTestedPairCount: oracle.broadPhase.testedPairCount,
        rawOracleIntersectionCount: oracle.intersectionCount,
        rawOracle: intersectionClass(oracle.intersections),
        indexedAdjacentObserved: classified.indexedAdjacent,
        authenticatedAoSeamIncidentObserved: classified.authenticatedAoSeamIncident,
        nonadjacentObserved: classified.nonadjacent,
        excludedAdjacentIntersectionCount,
        residualBlocking: classified.residualBlocking,
        exactAccounting: true as const,
        seamObservationRule:
          'direct-authenticated-seam-endpoints-both-incident-to-the-reported-triangle-pair' as const,
        seamExclusionPolicy: 'disabled-no-confined-contact-witness-api' as const,
      }),
      facetOrientation: orientation,
      seamPinParity: parity,
      upstreamRunner: Object.freeze({
        adapterVersion: candidate.adapterVersion,
        status: candidate.receipt.status,
        decision: candidate.receipt.decision,
        blockers: Object.freeze([...candidate.receipt.blockers]),
      }),
      blockers,
      claims: Object.freeze({
        exactRetainedFinalGpuCandidateMeasured: true as const,
        exactNormalizedTopologyRetained: true as const,
        aoSeamPairsAndPinsBoundToLiveRuntimeSourceOwner: true as const,
        directIncidentSeamEndpointEvidenceClassifiedForObservationOnly: true as const,
        seamIncidentPairsExcludedAsSafe: false as const,
        geometricSeamNearnessTreatedAsSafe: false as const,
        simulationExecuted: true as const,
        selfIntersectionAuthority: false as const,
        distortionAcceptanceThresholdFrozen: false as const,
        fitAuthority: false as const,
        runtimeAuthority: false as const,
        productionAuthority: false as const,
      }),
    });
    const seal = await sha256Bytes(
      new TextEncoder().encode(JSON.stringify(reportWithoutSeal)) as Uint8Array<ArrayBuffer>,
    );
    const report: BetaSkirtCanonicalMediumPostFrameSelfOrientationReportV1 = Object.freeze({
      ...reportWithoutSeal,
      seal: Object.freeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: seal,
        authority: 'unsigned-post-frame-self-orientation-diagnostic-only' as const,
      }),
    });
    return Object.freeze({ ok: true as const, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/count|cap|budget|out of range|non-finite/iu.test(message))
      return failure('resource-budget-exceeded', error);
    if (/SHA-256/iu.test(message)) return failure('sha256-unavailable', error);
    return failure('binding-mismatch', error);
  }
}

export async function evaluateBetaSkirtCanonicalMediumPostFrameSelfOrientationDiagnosticV1(
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  retainedRunnerOwner: BetaSkirtCanonicalMediumWebgpu16FrameRunnerOwnerV1,
): Promise<BetaSkirtCanonicalMediumPostFrameSelfOrientationResultV1> {
  const source = snapshotSource(runtimeSourceOwner);
  if (!source)
    return failure(
      'source-owner-unavailable',
      new Error('A live canonical-medium runtime-source owner is required.'),
    );
  const port = createRetainedV1Port(retainedRunnerOwner);
  if (!port)
    return failure(
      'retained-owner-unavailable',
      new Error('A live retained 16-frame runner owner is required.'),
    );
  return evaluateOwned(source, snapshotCandidate(port));
}
