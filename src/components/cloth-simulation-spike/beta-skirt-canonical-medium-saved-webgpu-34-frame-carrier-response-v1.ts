import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
  type MeasurementSurfaceIntersectionKindV1,
  type MeasurementSurfaceIntersectionPairV1,
} from '../../lib/cloth/body/measurement-surface-self-intersection-v1';

import {
  evaluateBetaSkirtCanonicalMediumConfinedContactPairV2,
  type BetaSkirtCanonicalMediumContactPairWitnessV2,
} from './beta-skirt-canonical-medium-confined-ao-seam-contact-witness-v2';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationV7,
  type BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationOwnerV7,
} from './beta-skirt-canonical-medium-saved-webgpu-34-frame-continuation-v7';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';
import {
  evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticReportV1,
} from './beta-skirt-rendered-body-collision-diagnostic-v1';
import {
  createBetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseV1,
  type BetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseReportV1,
} from './beta-skirt-personalized-female-nonconfined-self-carrier-response-v1';
import {
  evaluateBetaSkirtExactSweptBodyAuditV1,
  type BetaSkirtExactSweptBodyAuditReportV1,
} from './beta-skirt-exact-swept-body-audit-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_34_FRAME_CARRIER_RESPONSE_REPORT_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-34-frame-carrier-response-report/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_34_FRAME_CARRIER_RESPONSE_OWNER_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-34-frame-carrier-response-owner/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_34_FRAME_CARRIER_RESPONSE_PROJECTION_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-34-frame-carrier-response-projection/1' as const;

const VERTEX_COUNT = 580;
const TRIANGLE_COUNT = 912;
const SEAM_PAIR_COUNT = 34;
const PIN_COUNT = 82;
const MAX_RAW_INTERSECTION_COUNT = 2_048;
const MAX_RETAINED_WITNESSES = 64;
const EXACT_BODY_CLEARANCE_M = 0.001;
const DEGENERATE_NORMAL_EPSILON = 1e-20;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
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
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectApply = Reflect.apply;
const abortSignalAborted =
  typeof AbortSignal === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get;

type KindCounts = Readonly<Record<MeasurementSurfaceIntersectionKindV1, number>>;

export type BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseReportV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_34_FRAME_CARRIER_RESPONSE_REPORT_V1;
  status:
    | 'frame34-carrier-response-postgates-clear-next-frame-unproven'
    | 'frame34-carrier-response-postgate-blocked';
  decision:
    | 'PASS_BOUNDED_D419_FRAME34_CARRIER_RESPONSE_WITHOUT_NEXT_FRAME_AUTHORITY'
    | 'BLOCK_BOUNDED_D419_FRAME34_CARRIER_RESPONSE';
  bindings: Readonly<{
    runtimeSourceCanonicalSha256: string;
    sourceFrame34ContinuationReportCanonicalSha256: string;
    sourceCurrentPositionsInvMassKgSha256: string;
    sourcePreviousPositionsInvMassKgSha256: string;
    sourceVelocitiesMpsSha256: string;
    sourceDistanceLambdasKgMSha256: string;
    sourceSeamLambdasKgMSha256: string;
    sourceBendLambdasKgM2Sha256: string;
    sourceContinuumLambdasKgMSha256: string;
    normalizedTopologySha256: string;
    seamPairsSha256: string;
    pinnedVertexIndicesSha256: string;
    sourceResidualContactLocusAggregateSha256: string;
    candidateCurrentPositionsInvMassKgSha256: string;
    candidateCurrentPositions3MSha256: string;
    candidatePreviousPositionsInvMassKgSha256: string;
    candidateBodyCollisionContentFingerprintSha256: string;
    candidateContactLocusAggregateSha256: string;
  }>;
  response: BetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseReportV1;
  postgates: Readonly<{
    body: Readonly<{
      exactCandidateReplayed: true;
      clear: boolean;
      bodyGarmentTriangleIntersectionCount: number | null;
      minimumSignedClearanceM: number | null;
      penetratingVertexCount: number | null;
      unsafeVertexCount: number | null;
      ambiguousSignVertexCount: number | null;
    }>;
    self: Readonly<{
      oracleVersion: typeof MEASUREMENT_SURFACE_SELF_INTERSECTION_V1;
      epsilonM: number;
      rawIntersectionCount: number;
      rawKindCounts: KindCounts;
      excludedConfinedAuthenticatedAoSeamCount: number;
      residualBlockingCount: number;
      residualKindCounts: KindCounts;
      carrierAdjacentTouchingResidualCount: number;
      unsupportedResidualCount: number;
      exactRawEqualsExcludedPlusResidual: true;
      retainedResidualWitnesses: readonly BetaSkirtCanonicalMediumContactPairWitnessV2[];
    }>;
    orientation: Readonly<{
      comparedTriangleCount: number;
      sourceDegenerateTriangleCount: number;
      candidateDegenerateTriangleCount: number;
      normalReversalCount: number;
      minimumSourceToCandidateNormalDot: number | null;
      maximumNormalChangeRadians: number | null;
    }>;
    seamPinW: Readonly<{
      sourceStateMaximumSeamGapM: number;
      candidateMaximumSeamGapM: number;
      seamGapDidNotRegress: boolean;
      currentInverseMassBitMismatchCount: number;
      previousInverseMassBitMismatchCount: number;
      pinnedCurrentPositionBitMismatchCount: number;
      pinnedPreviousPositionBitMismatchCount: number;
      maximumPinnedCurrentDisplacementM: number;
      maximumPinnedPreviousDisplacementM: number;
      zeroInverseMassVertexCount: number;
      positiveInverseMassVertexCount: number;
    }>;
    sweptBody: BetaSkirtExactSweptBodyAuditReportV1;
    retainedState: Readonly<{
      velocityBufferByteExact: true;
      distanceLambdaBufferByteExact: true;
      seamLambdaBufferByteExact: true;
      bendLambdaBufferByteExact: true;
      continuumLambdaBufferByteExact: true;
      responseVelocityDeltaPreserved: boolean;
      responseMaximumVelocityDeltaDriftM: number;
      sourceFrame34PairedRehydrationParityProven: true;
      nextFrameContinuationExecuted: false;
    }>;
  }>;
  stableEvidence: Readonly<{
    canonicalSha256: string;
    excludesVolatileInputOwnerSeals: true;
  }>;
  claims: Readonly<{
    exactV7Frame34ResidualWitnessSetConsumed: true;
    exactV7Frame34CurrentPreviousVelocityAndLambdasConsumed: true;
    d419CarrierResponseExecuted: true;
    freshExactBodyGateExecuted: true;
    freshSelfOrientationSeamPinGateExecuted: true;
    freshSweptBodyGateExecuted: true;
    velocityAndLambdasRetainedUnchanged: true;
    inputOwnersRevalidatedAcrossAsyncBoundaries: true;
    genuineSavedRuntimeWrapperAuthenticated: false;
    inputOwnersNotReturned: true;
    continuationLoopCompatibleStateCarrierResponse: true;
    sourceFrame34PairedRehydrationParityProven: true;
    candidateUploadedToGpu: false;
    nextFrameContinuationExecuted: false;
    noFramePairOrHashAllowlistUsed: true;
    epsilonChanged: false;
    collisionPolicyChanged: false;
    selfIntersectionAuthority: false;
    collisionAuthority: false;
    fitAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
  blockers: readonly string[];
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-structural-frame34-carrier-response-diagnostic-only';
  }>;
}>;

declare const ownerBrand: unique symbol;
export type BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_34_FRAME_CARRIER_RESPONSE_OWNER_V1;
  report: BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseReportV1;
  readonly [ownerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseProjectionV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_34_FRAME_CARRIER_RESPONSE_PROJECTION_V1;
  reportCanonicalSha256: string;
  candidateCurrentPositionsInvMassKg: Float32Array;
  candidateCurrentPositions3M: Float32Array;
  candidatePreviousPositionsInvMassKg: Float32Array;
  retainedVelocitiesMps: Float32Array;
  retainedDistanceLambdasKgM: Float32Array;
  retainedSeamLambdasKgM: Float32Array;
  retainedBendLambdasKgM2: Float32Array;
  retainedContinuumLambdasKgM: Float32Array;
  normalizedTriangles: Uint32Array;
  callerOwnedMutableBinaryCopies: true;
  continuationLoopResponseState: true;
  candidateUploadedToGpu: false;
  nextFrameContinuationAuthority: false;
  collisionAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1;
      report: BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseReportV1;
    }>
  | Readonly<{
      ok: false;
      code:
        | 'aborted'
        | 'runtime-owner-unavailable'
        | 'frame34-owner-unavailable'
        | 'binding-mismatch'
        | 'resource-budget-exceeded'
        | 'response-failed'
        | 'diagnostic-failed';
      detail: string;
      owner?: BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1;
      report?: BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseReportV1;
    }>;

type OwnerRecord = {
  candidateCurrentPositionsInvMassKg: Float32Array;
  candidateCurrentPositions3M: Float32Array;
  candidatePreviousPositionsInvMassKg: Float32Array;
  retainedVelocitiesMps: Float32Array;
  retainedDistanceLambdasKgM: Float32Array;
  retainedSeamLambdasKgM: Float32Array;
  retainedBendLambdasKgM2: Float32Array;
  retainedContinuumLambdasKgM: Float32Array;
  normalizedTriangles: Uint32Array;
};

const owners = new WeakMap<object, OwnerRecord>();

function failure(
  code: Extract<
    BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseResultV1,
    { ok: false }
  >['code'],
  detail: string,
  owner?: BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1,
  report?: BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseReportV1,
): Extract<BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseResultV1, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    code,
    detail: detail.slice(0, 2_048),
    ...(owner ? { owner } : {}),
    ...(report ? { report } : {}),
  });
}

function positions3(positions4: Float32Array): Float32Array {
  const output = new Float32Array((positions4.length / 4) * 3);
  for (let vertex = 0; vertex < positions4.length / 4; vertex += 1) {
    output[vertex * 3] = positions4[vertex * 4]!;
    output[vertex * 3 + 1] = positions4[vertex * 4 + 1]!;
    output[vertex * 3 + 2] = positions4[vertex * 4 + 2]!;
  }
  return output;
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

function bytesEqual(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

async function digestBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Native SHA-256 is unavailable.');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function digestTyped(values: Float32Array | Uint32Array): Promise<string> {
  return digestBytes(littleEndianBytes(values));
}

async function digestPayload(domain: string, value: unknown): Promise<string> {
  return digestBytes(new TextEncoder().encode(`${domain}\0${JSON.stringify(value)}`));
}

async function validateDigestAuthority(): Promise<void> {
  if ((await digestBytes(new Uint8Array())) !== EMPTY_SHA256)
    throw new Error('SHA-256 empty KAT failed.');
  if ((await digestBytes(new TextEncoder().encode('abc'))) !== ABC_SHA256)
    throw new Error('SHA-256 abc KAT failed.');
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

function witnessKindCounts(values: readonly BetaSkirtCanonicalMediumContactPairWitnessV2[]) {
  const result: Record<MeasurementSurfaceIntersectionKindV1, number> = {
    'proper-crossing': 0,
    'coplanar-overlap': 0,
    touching: 0,
  };
  for (const value of values) result[value.oracleKind] += 1;
  return Object.freeze(result);
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

function orientation(source: Float32Array, candidate: Float32Array, triangles: Uint32Array) {
  let comparedTriangleCount = 0;
  let sourceDegenerateTriangleCount = 0;
  let candidateDegenerateTriangleCount = 0;
  let normalReversalCount = 0;
  let minimumSourceToCandidateNormalDot = 1;
  let maximumNormalChangeRadians = 0;
  for (let triangle = 0; triangle < triangles.length / 3; triangle += 1) {
    const sourceNormal = normal(source, triangles, triangle);
    const candidateNormal = normal(candidate, triangles, triangle);
    if (!sourceNormal) sourceDegenerateTriangleCount += 1;
    if (!candidateNormal) candidateDegenerateTriangleCount += 1;
    if (!sourceNormal || !candidateNormal) continue;
    const dot = Math.max(
      -1,
      Math.min(
        1,
        sourceNormal[0] * candidateNormal[0] +
          sourceNormal[1] * candidateNormal[1] +
          sourceNormal[2] * candidateNormal[2],
      ),
    );
    comparedTriangleCount += 1;
    minimumSourceToCandidateNormalDot = Math.min(minimumSourceToCandidateNormalDot, dot);
    maximumNormalChangeRadians = Math.max(maximumNormalChangeRadians, Math.acos(dot));
    if (dot < 0) normalReversalCount += 1;
  }
  return Object.freeze({
    comparedTriangleCount,
    sourceDegenerateTriangleCount,
    candidateDegenerateTriangleCount,
    normalReversalCount,
    minimumSourceToCandidateNormalDot:
      comparedTriangleCount === 0 ? null : minimumSourceToCandidateNormalDot,
    maximumNormalChangeRadians: comparedTriangleCount === 0 ? null : maximumNormalChangeRadians,
  });
}

function maximumSeamGap(positions: Float32Array, seamPairs: Uint32Array): number {
  let maximum = 0;
  for (let seam = 0; seam < seamPairs.length / 2; seam += 1) {
    const a = seamPairs[seam * 2]! * 4;
    const b = seamPairs[seam * 2 + 1]! * 4;
    maximum = Math.max(
      maximum,
      Math.hypot(
        positions[a]! - positions[b]!,
        positions[a + 1]! - positions[b + 1]!,
        positions[a + 2]! - positions[b + 2]!,
      ),
    );
  }
  return maximum;
}

function seamPinWGate(options: {
  sourceInitial: Float32Array;
  sourceStateCurrent: Float32Array;
  candidateCurrent: Float32Array;
  sourceStatePrevious: Float32Array;
  candidatePrevious: Float32Array;
  seamPairs: Uint32Array;
  pins: Uint32Array;
}) {
  const sourceBits = new Uint32Array(
    options.sourceInitial.buffer,
    options.sourceInitial.byteOffset,
    options.sourceInitial.length,
  );
  const sourceCurrentBits = new Uint32Array(
    options.sourceStateCurrent.buffer,
    options.sourceStateCurrent.byteOffset,
    options.sourceStateCurrent.length,
  );
  const candidateCurrentBits = new Uint32Array(
    options.candidateCurrent.buffer,
    options.candidateCurrent.byteOffset,
    options.candidateCurrent.length,
  );
  const sourcePreviousBits = new Uint32Array(
    options.sourceStatePrevious.buffer,
    options.sourceStatePrevious.byteOffset,
    options.sourceStatePrevious.length,
  );
  const candidatePreviousBits = new Uint32Array(
    options.candidatePrevious.buffer,
    options.candidatePrevious.byteOffset,
    options.candidatePrevious.length,
  );
  const pinSet = new Set(options.pins);
  let currentInverseMassBitMismatchCount = 0;
  let previousInverseMassBitMismatchCount = 0;
  let pinnedCurrentPositionBitMismatchCount = 0;
  let pinnedPreviousPositionBitMismatchCount = 0;
  let maximumPinnedCurrentDisplacementM = 0;
  let maximumPinnedPreviousDisplacementM = 0;
  let zeroInverseMassVertexCount = 0;
  let positiveInverseMassVertexCount = 0;
  for (let vertex = 0; vertex < VERTEX_COUNT; vertex += 1) {
    const offset = vertex * 4;
    const w = options.sourceInitial[offset + 3]!;
    if (w === 0) zeroInverseMassVertexCount += 1;
    else if (Number.isFinite(w) && w > 0) positiveInverseMassVertexCount += 1;
    else throw new TypeError('Source inverse mass is invalid.');
    if (candidateCurrentBits[offset + 3] !== sourceBits[offset + 3])
      currentInverseMassBitMismatchCount += 1;
    if (candidatePreviousBits[offset + 3] !== sourceBits[offset + 3])
      previousInverseMassBitMismatchCount += 1;
    if (!pinSet.has(vertex)) continue;
    let currentExact = true;
    let previousExact = true;
    for (let component = 0; component < 4; component += 1) {
      if (candidateCurrentBits[offset + component] !== sourceCurrentBits[offset + component])
        currentExact = false;
      if (candidatePreviousBits[offset + component] !== sourcePreviousBits[offset + component])
        previousExact = false;
    }
    if (!currentExact) pinnedCurrentPositionBitMismatchCount += 1;
    if (!previousExact) pinnedPreviousPositionBitMismatchCount += 1;
    maximumPinnedCurrentDisplacementM = Math.max(
      maximumPinnedCurrentDisplacementM,
      Math.hypot(
        options.candidateCurrent[offset]! - options.sourceStateCurrent[offset]!,
        options.candidateCurrent[offset + 1]! - options.sourceStateCurrent[offset + 1]!,
        options.candidateCurrent[offset + 2]! - options.sourceStateCurrent[offset + 2]!,
      ),
    );
    maximumPinnedPreviousDisplacementM = Math.max(
      maximumPinnedPreviousDisplacementM,
      Math.hypot(
        options.candidatePrevious[offset]! - options.sourceStatePrevious[offset]!,
        options.candidatePrevious[offset + 1]! - options.sourceStatePrevious[offset + 1]!,
        options.candidatePrevious[offset + 2]! - options.sourceStatePrevious[offset + 2]!,
      ),
    );
  }
  const sourceStateMaximumSeamGapM = maximumSeamGap(options.sourceStateCurrent, options.seamPairs);
  const candidateMaximumSeamGapM = maximumSeamGap(options.candidateCurrent, options.seamPairs);
  return Object.freeze({
    sourceStateMaximumSeamGapM,
    candidateMaximumSeamGapM,
    seamGapDidNotRegress: candidateMaximumSeamGapM <= sourceStateMaximumSeamGapM,
    currentInverseMassBitMismatchCount,
    previousInverseMassBitMismatchCount,
    pinnedCurrentPositionBitMismatchCount,
    pinnedPreviousPositionBitMismatchCount,
    maximumPinnedCurrentDisplacementM,
    maximumPinnedPreviousDisplacementM,
    zeroInverseMassVertexCount,
    positiveInverseMassVertexCount,
  });
}

function candidateCollisionInput(
  source: BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  candidatePositions3M: Float32Array,
  candidatePositions3MSha256: string,
): BetaSkirtRenderedBodyCollisionDiagnosticInputV1 {
  return {
    binding: { ...source.binding, garmentPositionsSha256: candidatePositions3MSha256 },
    bodyPositionsM: new Float32Array(source.bodyPositionsM),
    bodyTriangles: new Uint32Array(source.bodyTriangles),
    garmentPositionsM: new Float32Array(candidatePositions3M),
    garmentTriangles: new Uint32Array(source.garmentTriangles),
    garmentUniformScale: source.garmentUniformScale,
    garmentTranslationM: [
      source.garmentTranslationM[0],
      source.garmentTranslationM[1],
      source.garmentTranslationM[2],
    ],
  };
}

function exactBodyClear(report: BetaSkirtRenderedBodyCollisionDiagnosticReportV1): boolean {
  return (
    report.status === 'signed-clearance-measured' &&
    report.blockers.length === 0 &&
    report.intersections.bodyGarmentTriangleIntersectionCount === 0 &&
    report.clearance.penetratingVertexCount === 0 &&
    report.clearance.unsafeVertexCount === 0 &&
    report.clearance.ambiguousSignVertexCount === 0 &&
    report.clearance.minimumSignedClearanceM !== null &&
    report.clearance.minimumSignedClearanceM >= EXACT_BODY_CLEARANCE_M
  );
}

function abortRequested(signal?: AbortSignal): boolean {
  if (signal === undefined) return false;
  if (
    !abortSignalAborted ||
    typeof AbortSignal === 'undefined' ||
    objectGetPrototypeOf(signal) !== AbortSignal.prototype
  )
    throw new TypeError('Frame34 carrier response requires a genuine AbortSignal.');
  return reflectApply(abortSignalAborted, signal, []) as boolean;
}

function ownersStillLive(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  continuationOwner: BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationOwnerV7,
  runtimeSha256: string,
  continuationSha256: string,
): boolean {
  return (
    projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner)?.reportCanonicalSha256 ===
      runtimeSha256 &&
    projectBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationV7(continuationOwner)
      ?.reportCanonicalSha256 === continuationSha256
  );
}

export async function evaluateBetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseV1(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  continuationOwner: BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationOwnerV7,
  signal?: AbortSignal,
): Promise<BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseResultV1> {
  try {
    if (abortRequested(signal)) return failure('aborted', 'Frame34 carrier response was aborted.');
  } catch (error) {
    return failure(
      'binding-mismatch',
      error instanceof Error ? error.message : 'Frame34 carrier response signal is invalid.',
    );
  }
  const runtime = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  if (!runtime)
    return failure('runtime-owner-unavailable', 'A live base runtime owner is required.');
  const continuation =
    projectBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationV7(continuationOwner);
  if (!continuation)
    return failure(
      'frame34-owner-unavailable',
      'A live exact paired-rehydrated frame34 owner is required.',
    );

  const runtimeSha256 = runtime.reportCanonicalSha256;
  const continuationSha256 = continuation.reportCanonicalSha256;
  const sourceInitial = new Float32Array(runtime.initialPhysicalPositionsInvMassKg);
  const sourceCurrent = new Float32Array(continuation.finalCurrentPositionsInvMassKg);
  const sourcePositions3 = positions3(sourceCurrent);
  const sourcePrevious = new Float32Array(continuation.finalPreviousPositionsInvMassKg);
  const sourceVelocities = new Float32Array(continuation.finalVelocitiesMps);
  const distanceLambdas = new Float32Array(continuation.finalDistanceLambdasKgM);
  const seamLambdas = new Float32Array(continuation.finalSeamLambdasKgM);
  const bendLambdas = new Float32Array(continuation.finalBendLambdasKgM2);
  const continuumLambdas = new Float32Array(continuation.finalContinuumLambdasKgM);
  const triangles = new Uint32Array(continuation.normalizedTriangles);
  const seamPairs = new Uint32Array(runtime.seamPairs);
  const pins = new Uint32Array(runtime.pinnedWaistVertexIndices);
  const continuationReport = continuationOwner.report;

  try {
    if (
      sourceInitial.length !== VERTEX_COUNT * 4 ||
      sourceCurrent.length !== VERTEX_COUNT * 4 ||
      sourcePrevious.length !== VERTEX_COUNT * 4 ||
      sourceVelocities.length !== VERTEX_COUNT * 4 ||
      triangles.length !== TRIANGLE_COUNT * 3 ||
      seamPairs.length !== SEAM_PAIR_COUNT * 2 ||
      pins.length !== PIN_COUNT ||
      continuationReport.status !== 'saved-34-frame-paired-rehydrated-parity-postgate-blocked' ||
      continuationReport.decision !==
        'BLOCK_FRAME34_POSTGATES_AFTER_EXACT_PAIRED_REHYDRATED_PARITY' ||
      continuationReport.bindings.runtimeSourceCanonicalSha256 !== runtimeSha256 ||
      continuationReport.bindings.finalPositionsInvMassKgSha256.length !== 64 ||
      continuationReport.selfOrientation.residualBlockingCount === 0 ||
      continuationReport.selfOrientation.residualBlockingCount !==
        continuationReport.selfOrientation.carrierAdjacentTouchingResidualCount ||
      continuationReport.selfOrientation.unsupportedResidualCount !== 0 ||
      continuationReport.selfOrientation.retainedResidualWitnesses.length !==
        continuationReport.selfOrientation.residualBlockingCount ||
      continuationReport.retainedState.referenceFrame32ExactAcceptedD422 !== true ||
      continuationReport.retainedState.referenceFrame33ExactAcceptedD427 !== true ||
      continuationReport.retainedState.staticPostFrameResponseApplied !== true ||
      continuationReport.retainedState.continuationCarrierResponseApplied !== true ||
      continuationReport.retainedState.exactFrameContinuationExecuted !== true ||
      continuationReport.retainedState.rehydratedNextFrameParityProven !== true ||
      continuationReport.continuation.referenceFrame33MatchedAcceptedD427 !== true ||
      continuationReport.continuation.continuationResponseStateUploadByteExact !== true ||
      continuationReport.continuation.sameSessionReferenceFrame33Rerun !== false ||
      continuationReport.continuation.pairedRehydratedFrame34Parity !== true ||
      continuationReport.continuation.frame34ByteExactParity !== true ||
      continuationReport.claims.exactAcceptedD427Frame33StateMatched !== true ||
      continuationReport.claims.exactD429CarrierResponseStateConsumed !== true ||
      continuationReport.claims.pairedRehydratedFrame34Parity !== true ||
      continuationReport.claims.currentPreviousVelocityLambdasAndDiagnosticsByteExactParity !==
        true ||
      continuationReport.claims.genuineSavedRuntimeWrapperAuthenticated !== false ||
      continuationReport.claims.continuationAuthority !== false ||
      !bytesEqual(runtime.normalizedTriangles, triangles)
    )
      throw new TypeError('V7 frame34 state and residual evidence are not exact-bound.');

    await validateDigestAuthority();
    if (abortRequested(signal))
      throw new DOMException('Frame34 carrier response was aborted.', 'AbortError');
    const [
      sourceCurrentSha256,
      sourcePreviousSha256,
      sourceVelocitiesSha256,
      distanceLambdasSha256,
      seamLambdasSha256,
      bendLambdasSha256,
      continuumLambdasSha256,
      topologySha256,
      seamPairsSha256,
      pinsSha256,
    ] = await Promise.all([
      digestTyped(sourceCurrent),
      digestTyped(sourcePrevious),
      digestTyped(sourceVelocities),
      digestTyped(distanceLambdas),
      digestTyped(seamLambdas),
      digestTyped(bendLambdas),
      digestTyped(continuumLambdas),
      digestTyped(triangles),
      digestTyped(seamPairs),
      digestTyped(pins),
    ]);
    if (
      sourceCurrentSha256 !== continuationReport.bindings.finalPositionsInvMassKgSha256 ||
      sourcePreviousSha256 !== continuationReport.bindings.finalPreviousPositionsInvMassKgSha256 ||
      sourceVelocitiesSha256 !== continuationReport.bindings.finalVelocitiesMpsSha256 ||
      distanceLambdasSha256 !== continuationReport.bindings.finalDistanceLambdasKgMSha256 ||
      seamLambdasSha256 !== continuationReport.bindings.finalSeamLambdasKgMSha256 ||
      bendLambdasSha256 !== continuationReport.bindings.finalBendLambdasKgM2Sha256 ||
      continuumLambdasSha256 !== continuationReport.bindings.finalContinuumLambdasKgMSha256 ||
      topologySha256 !== continuationReport.bindings.normalizedTopologySha256 ||
      seamPairsSha256 !== runtimeOwner.report.bindings.seamPairsSha256 ||
      pinsSha256 !== runtimeOwner.report.bindings.pinnedVertexIndicesSha256
    )
      throw new TypeError('Retained current/previous/velocity/lambda/topology bytes drifted.');
    if (!ownersStillLive(runtimeOwner, continuationOwner, runtimeSha256, continuationSha256))
      throw new TypeError('A frame34-carrier-response input owner became stale before response.');

    const residualWitnesses = continuationReport.selfOrientation.retainedResidualWitnesses;
    const sourceResidualContactLocusAggregateSha256 = await digestPayload(
      'beta-skirt-canonical-medium-frame34-carrier-response-source-residual-loci-v1',
      residualWitnesses.map((value) => ({
        triangleA: value.triangleA,
        triangleB: value.triangleB,
        oracleKind: value.oracleKind,
        disposition: value.disposition,
        contactLocusSha256: value.contactLocusSha256,
      })),
    );
    const response = await createBetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseV1({
      currentPositionsInvMass: sourceCurrent,
      previousPositionsInvMass: sourcePrevious,
      activeSeamPairs: seamPairs,
      fixedHandleVertexIndices: pins,
      epsilonM: continuationReport.selfOrientation.epsilonM,
      residualWitnesses,
    });
    if (abortRequested(signal))
      throw new DOMException('Frame34 carrier response was aborted.', 'AbortError');
    const candidateCurrent = new Float32Array(response.candidatePositionsInvMass);
    const candidatePrevious = new Float32Array(response.candidatePreviousPositionsInvMass);
    const candidateCurrent3 = positions3(candidateCurrent);
    const [candidateCurrentSha256, candidateCurrent3Sha256, candidatePreviousSha256] =
      await Promise.all([
        digestTyped(candidateCurrent),
        digestTyped(candidateCurrent3),
        digestTyped(candidatePrevious),
      ]);
    if (
      response.report.binding.sourcePositionsInvMassSha256 !== sourceCurrentSha256 ||
      response.report.binding.sourcePreviousPositionsInvMassSha256 !== sourcePreviousSha256 ||
      response.report.binding.candidatePositionsInvMassSha256 !== candidateCurrentSha256 ||
      response.report.binding.candidatePreviousPositionsInvMassSha256 !== candidatePreviousSha256
    )
      throw new TypeError('D-419 response hashes differ from retained state or candidate bytes.');

    const collisionInput = candidateCollisionInput(
      runtime.collisionInput,
      candidateCurrent3,
      candidateCurrent3Sha256,
    );
    const body = await evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1(collisionInput);
    const bodyClear = exactBodyClear(body);
    const oracle = validateMeasurementSurfaceSelfIntersectionV1(
      candidateCurrent3,
      triangles,
      SELF_POLICY,
    );
    if (oracle.intersectionCount > MAX_RAW_INTERSECTION_COUNT)
      return failure(
        'resource-budget-exceeded',
        `Post-response raw self-intersection cap exceeded (${oracle.intersectionCount}).`,
      );
    const witnesses: BetaSkirtCanonicalMediumContactPairWitnessV2[] = [];
    for (const pair of oracle.intersections) {
      if (abortRequested(signal))
        throw new DOMException('Frame34 carrier response was aborted.', 'AbortError');
      witnesses.push(
        await evaluateBetaSkirtCanonicalMediumConfinedContactPairV2({
          positions: candidateCurrent3,
          triangles,
          seamPairs,
          pair,
          epsilonM: oracle.epsilonM,
          vertexCount: VERTEX_COUNT,
          requireCanonicalSeamCount: true,
        }),
      );
    }
    const excluded = witnesses.filter(
      (value) => value.disposition === 'excluded-confined-authenticated-ao-seam-touching',
    );
    const residual = witnesses.filter(
      (value) => value.disposition !== 'excluded-confined-authenticated-ao-seam-touching',
    );
    const carrierAdjacent = residual.filter(
      (value) => value.disposition === 'residual-touching-non-confined-feature',
    );
    const unsupportedResidualCount = residual.length - carrierAdjacent.length;
    const candidateContactLocusAggregateSha256 = await digestPayload(
      'beta-skirt-canonical-medium-frame34-carrier-response-candidate-loci-v1',
      witnesses.map((value) => ({
        triangleA: value.triangleA,
        triangleB: value.triangleB,
        oracleKind: value.oracleKind,
        disposition: value.disposition,
        contactLocusSha256: value.contactLocusSha256,
      })),
    );
    const measuredOrientation = orientation(sourcePositions3, candidateCurrent3, triangles);
    const seamPinW = seamPinWGate({
      sourceInitial,
      sourceStateCurrent: sourceCurrent,
      candidateCurrent,
      sourceStatePrevious: sourcePrevious,
      candidatePrevious,
      seamPairs,
      pins,
    });
    const sweptBody = evaluateBetaSkirtExactSweptBodyAuditV1({
      previousPositionsInvMass: candidatePrevious,
      currentPositionsInvMass: candidateCurrent,
      bodyPositionsM: collisionInput.bodyPositionsM,
      bodyTriangles: collisionInput.bodyTriangles,
    });
    if (!ownersStillLive(runtimeOwner, continuationOwner, runtimeSha256, continuationSha256))
      throw new TypeError('A frame34-carrier-response input owner became stale during postgates.');

    const bodyGate = Object.freeze({
      exactCandidateReplayed: true as const,
      clear: bodyClear,
      bodyGarmentTriangleIntersectionCount: body.intersections.bodyGarmentTriangleIntersectionCount,
      minimumSignedClearanceM: body.clearance.minimumSignedClearanceM,
      penetratingVertexCount: body.clearance.penetratingVertexCount,
      unsafeVertexCount: body.clearance.unsafeVertexCount,
      ambiguousSignVertexCount: body.clearance.ambiguousSignVertexCount,
    });
    const selfGate = Object.freeze({
      oracleVersion: MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
      epsilonM: oracle.epsilonM,
      rawIntersectionCount: oracle.intersectionCount,
      rawKindCounts: kindCounts(oracle.intersections),
      excludedConfinedAuthenticatedAoSeamCount: excluded.length,
      residualBlockingCount: residual.length,
      residualKindCounts: witnessKindCounts(residual),
      carrierAdjacentTouchingResidualCount: carrierAdjacent.length,
      unsupportedResidualCount,
      exactRawEqualsExcludedPlusResidual: true as const,
      retainedResidualWitnesses: Object.freeze(residual.slice(0, MAX_RETAINED_WITNESSES)),
    });
    const retainedStateGate = Object.freeze({
      velocityBufferByteExact: true as const,
      distanceLambdaBufferByteExact: true as const,
      seamLambdaBufferByteExact: true as const,
      bendLambdaBufferByteExact: true as const,
      continuumLambdaBufferByteExact: true as const,
      responseVelocityDeltaPreserved: response.report.claims.velocityDeltaPreserved,
      responseMaximumVelocityDeltaDriftM: response.report.response.maximumVelocityDeltaDriftM,
      sourceFrame34PairedRehydrationParityProven: true as const,
      nextFrameContinuationExecuted: false as const,
    });
    const blockers = Object.freeze([
      ...(!bodyClear ? ['post-response-exact-body-gate-failed'] : []),
      ...(residual.length > 0 ? ['post-response-residual-self-contact-remains'] : []),
      ...(measuredOrientation.sourceDegenerateTriangleCount > 0
        ? ['source-degenerate-facets-present']
        : []),
      ...(measuredOrientation.candidateDegenerateTriangleCount > 0
        ? ['post-response-degenerate-facets-present']
        : []),
      ...(measuredOrientation.normalReversalCount > 0
        ? ['post-response-normal-reversals-present']
        : []),
      ...(!seamPinW.seamGapDidNotRegress ||
      seamPinW.currentInverseMassBitMismatchCount > 0 ||
      seamPinW.previousInverseMassBitMismatchCount > 0 ||
      seamPinW.pinnedCurrentPositionBitMismatchCount > 0 ||
      seamPinW.pinnedPreviousPositionBitMismatchCount > 0 ||
      seamPinW.zeroInverseMassVertexCount !== PIN_COUNT ||
      seamPinW.positiveInverseMassVertexCount !== VERTEX_COUNT - PIN_COUNT
        ? ['post-response-seam-pin-w-gate-failed']
        : []),
      ...(sweptBody.status !== 'clear' ? ['post-response-swept-body-gate-failed'] : []),
      ...(!response.report.claims.velocityDeltaPreserved
        ? ['post-response-velocity-coherence-gate-failed']
        : []),
      'next-frame-continuation-not-executed',
      'settle-fit-runtime-production-authority-not-established',
    ]);
    const staticPostgatesClear = blockers.length === 2;
    const bindings = Object.freeze({
      runtimeSourceCanonicalSha256: runtimeSha256,
      sourceFrame34ContinuationReportCanonicalSha256: continuationSha256,
      sourceCurrentPositionsInvMassKgSha256: sourceCurrentSha256,
      sourcePreviousPositionsInvMassKgSha256: sourcePreviousSha256,
      sourceVelocitiesMpsSha256: sourceVelocitiesSha256,
      sourceDistanceLambdasKgMSha256: distanceLambdasSha256,
      sourceSeamLambdasKgMSha256: seamLambdasSha256,
      sourceBendLambdasKgM2Sha256: bendLambdasSha256,
      sourceContinuumLambdasKgMSha256: continuumLambdasSha256,
      normalizedTopologySha256: topologySha256,
      seamPairsSha256,
      pinnedVertexIndicesSha256: pinsSha256,
      sourceResidualContactLocusAggregateSha256,
      candidateCurrentPositionsInvMassKgSha256: candidateCurrentSha256,
      candidateCurrentPositions3MSha256: candidateCurrent3Sha256,
      candidatePreviousPositionsInvMassKgSha256: candidatePreviousSha256,
      candidateBodyCollisionContentFingerprintSha256: body.contentFingerprintSha256,
      candidateContactLocusAggregateSha256,
    });
    const claims = Object.freeze({
      exactV7Frame34ResidualWitnessSetConsumed: true as const,
      exactV7Frame34CurrentPreviousVelocityAndLambdasConsumed: true as const,
      d419CarrierResponseExecuted: true as const,
      freshExactBodyGateExecuted: true as const,
      freshSelfOrientationSeamPinGateExecuted: true as const,
      freshSweptBodyGateExecuted: true as const,
      velocityAndLambdasRetainedUnchanged: true as const,
      inputOwnersRevalidatedAcrossAsyncBoundaries: true as const,
      genuineSavedRuntimeWrapperAuthenticated: false as const,
      inputOwnersNotReturned: true as const,
      continuationLoopCompatibleStateCarrierResponse: true as const,
      sourceFrame34PairedRehydrationParityProven: true as const,
      candidateUploadedToGpu: false as const,
      nextFrameContinuationExecuted: false as const,
      noFramePairOrHashAllowlistUsed: true as const,
      epsilonChanged: false as const,
      collisionPolicyChanged: false as const,
      selfIntersectionAuthority: false as const,
      collisionAuthority: false as const,
      fitAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    });
    const stablePayload = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_34_FRAME_CARRIER_RESPONSE_REPORT_V1,
      bindings: Object.freeze({
        ...bindings,
        sourceFrame34ContinuationReportCanonicalSha256: undefined,
      }),
      response: response.report,
      postgates: Object.freeze({
        body: bodyGate,
        self: selfGate,
        orientation: measuredOrientation,
        seamPinW,
        sweptBody,
        retainedState: retainedStateGate,
      }),
      claims,
      blockers,
    });
    const stableEvidence = Object.freeze({
      canonicalSha256: await digestPayload(
        'beta-skirt-canonical-medium-frame34-carrier-response-stable-v1',
        stablePayload,
      ),
      excludesVolatileInputOwnerSeals: true as const,
    });
    const reportWithoutSeal = Object.freeze({
      ...stablePayload,
      bindings,
      status: staticPostgatesClear
        ? ('frame34-carrier-response-postgates-clear-next-frame-unproven' as const)
        : ('frame34-carrier-response-postgate-blocked' as const),
      decision: staticPostgatesClear
        ? ('PASS_BOUNDED_D419_FRAME34_CARRIER_RESPONSE_WITHOUT_NEXT_FRAME_AUTHORITY' as const)
        : ('BLOCK_BOUNDED_D419_FRAME34_CARRIER_RESPONSE' as const),
      stableEvidence,
    });
    const report = Object.freeze({
      ...reportWithoutSeal,
      seal: Object.freeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: await digestPayload(
          'beta-skirt-canonical-medium-frame34-carrier-response-report-v1',
          reportWithoutSeal,
        ),
        authority: 'unsigned-structural-frame34-carrier-response-diagnostic-only' as const,
      }),
    }) satisfies BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseReportV1;
    if (!ownersStillLive(runtimeOwner, continuationOwner, runtimeSha256, continuationSha256))
      throw new TypeError(
        'A frame34-carrier-response input owner became stale before owner minting.',
      );
    const owner = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_34_FRAME_CARRIER_RESPONSE_OWNER_V1,
      report,
    }) as BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1;
    owners.set(owner, {
      candidateCurrentPositionsInvMassKg: new Float32Array(candidateCurrent),
      candidateCurrentPositions3M: new Float32Array(candidateCurrent3),
      candidatePreviousPositionsInvMassKg: new Float32Array(candidatePrevious),
      retainedVelocitiesMps: new Float32Array(sourceVelocities),
      retainedDistanceLambdasKgM: new Float32Array(distanceLambdas),
      retainedSeamLambdasKgM: new Float32Array(seamLambdas),
      retainedBendLambdasKgM2: new Float32Array(bendLambdas),
      retainedContinuumLambdasKgM: new Float32Array(continuumLambdas),
      normalizedTriangles: new Uint32Array(triangles),
    });
    if (!staticPostgatesClear)
      return failure(
        'diagnostic-failed',
        `Frame34 carrier response postgates blocked: ${blockers.join(',')}.`,
        owner,
        report,
      );
    return Object.freeze({ ok: true as const, owner, report });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      return failure('aborted', error.message);
    const detail = error instanceof Error ? error.message : 'Frame34 carrier response failed.';
    if (/response|carrier/iu.test(detail)) return failure('response-failed', detail);
    if (/budget|cap|count|out of range/iu.test(detail))
      return failure('resource-budget-exceeded', detail);
    return failure('binding-mismatch', detail);
  }
}

export function projectBetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseV1(
  owner: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseProjectionV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner as object);
  if (!record) return null;
  const publicOwner = owner as BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1;
  return Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_34_FRAME_CARRIER_RESPONSE_PROJECTION_V1,
    reportCanonicalSha256: publicOwner.report.seal.canonicalSha256,
    candidateCurrentPositionsInvMassKg: new Float32Array(record.candidateCurrentPositionsInvMassKg),
    candidateCurrentPositions3M: new Float32Array(record.candidateCurrentPositions3M),
    candidatePreviousPositionsInvMassKg: new Float32Array(
      record.candidatePreviousPositionsInvMassKg,
    ),
    retainedVelocitiesMps: new Float32Array(record.retainedVelocitiesMps),
    retainedDistanceLambdasKgM: new Float32Array(record.retainedDistanceLambdasKgM),
    retainedSeamLambdasKgM: new Float32Array(record.retainedSeamLambdasKgM),
    retainedBendLambdasKgM2: new Float32Array(record.retainedBendLambdasKgM2),
    retainedContinuumLambdasKgM: new Float32Array(record.retainedContinuumLambdasKgM),
    normalizedTriangles: new Uint32Array(record.normalizedTriangles),
    callerOwnedMutableBinaryCopies: true as const,
    continuationLoopResponseState: true as const,
    candidateUploadedToGpu: false as const,
    nextFrameContinuationAuthority: false as const,
    collisionAuthority: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseV1(
  owner: unknown,
): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner as object);
  if (!record) return false;
  record.candidateCurrentPositionsInvMassKg.fill(0);
  record.candidateCurrentPositions3M.fill(0);
  record.candidatePreviousPositionsInvMassKg.fill(0);
  record.retainedVelocitiesMps.fill(0);
  record.retainedDistanceLambdasKgM.fill(0);
  record.retainedSeamLambdasKgM.fill(0);
  record.retainedBendLambdasKgM2.fill(0);
  record.retainedContinuumLambdasKgM.fill(0);
  record.normalizedTriangles.fill(0);
  owners.delete(owner as object);
  return true;
}
