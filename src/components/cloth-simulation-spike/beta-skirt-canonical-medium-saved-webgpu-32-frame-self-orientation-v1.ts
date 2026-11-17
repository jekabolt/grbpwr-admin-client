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
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';
import {
  evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticReportV1,
} from './beta-skirt-rendered-body-collision-diagnostic-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_SELF_ORIENTATION_REPORT_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-self-orientation-report/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_SELF_ORIENTATION_OWNER_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-self-orientation-owner/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_SELF_ORIENTATION_PROJECTION_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-self-orientation-projection/1' as const;

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

const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectApply = Reflect.apply;
const jsonStringify = JSON.stringify;
const arrayBufferPrototype = ArrayBuffer.prototype;
const dataViewSetFloat32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setFloat32')?.value;
const dataViewSetUint32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setUint32')?.value;
const uint8ArraySet = Uint8Array.prototype.set;
const float32ArrayFill = Float32Array.prototype.fill;
const uint32ArrayFill = Uint32Array.prototype.fill;
const weakMapGet = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'get')?.value;
const weakMapSet = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'set')?.value;
const weakMapDelete = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'delete')?.value;
const textEncoderEncode = objectGetOwnPropertyDescriptor(TextEncoder.prototype, 'encode')?.value;
const stringSlice = objectGetOwnPropertyDescriptor(String.prototype, 'slice')?.value;
const regexpTest = objectGetOwnPropertyDescriptor(RegExp.prototype, 'test')?.value;
const setHas = objectGetOwnPropertyDescriptor(Set.prototype, 'has')?.value;
const abortSignalAborted =
  typeof AbortSignal === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get;
const capturedSubtle = globalThis.crypto?.subtle;
const subtleDigest =
  typeof SubtleCrypto === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(SubtleCrypto.prototype, 'digest')?.value;
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const CapturedDataView = DataView;
const CapturedWeakMap = WeakMap;
const CapturedSet = Set;
const encoder = new TextEncoder();
const HEX = objectFreeze(
  Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')),
);

type KindCounts = Readonly<Record<MeasurementSurfaceIntersectionKindV1, number>>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationReportV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_SELF_ORIENTATION_REPORT_V1;
  status: 'saved-32-frame-self-orientation-diagnostic-blocked';
  decision:
    | 'MEASURED_SAVED_32_FRAME_ZERO_RESIDUAL_SELF_AND_ORIENTATION_CLEAR_WITH_DOWNSTREAM_BLOCKERS'
    | 'BLOCK_SAVED_32_FRAME_SELF_ORIENTATION_OR_RESPONSE';
  bindings: Readonly<{
    savedRuntimeSourceCanonicalSha256: string;
    saved16FrameCanonicalSha256: string;
    runtimeSourceCanonicalSha256: string;
    runner32FrameCanonicalSha256: string;
    finalPositionsInvMassKgSha256: string;
    finalPositions3MSha256: string;
    normalizedTopologySha256: string;
    seamPairsSha256: string;
    pinnedVertexIndicesSha256: string;
    bodyCollisionContentFingerprintSha256: string;
    aggregateContactLocusSha256: string;
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
    theoreticalTrianglePairCount: number;
    broadPhaseCandidatePairCount: number;
    testedPairCount: number;
    rawIntersectionCount: number;
    rawKindCounts: KindCounts;
  }>;
  confinedWitness: Readonly<{
    excludedConfinedAuthenticatedAoSeamCount: number;
    excludedKindCounts: KindCounts;
    residualBlockingCount: number;
    residualKindCounts: KindCounts;
    carrierAdjacentTouchingResidualCount: number;
    unsupportedResidualCount: number;
    exactRawEqualsExcludedPlusResidual: true;
    retainedWitnesses: readonly BetaSkirtCanonicalMediumContactPairWitnessV2[];
    witnessesTruncated: boolean;
  }>;
  orientation: Readonly<{
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
    runnerFinalMaximumSeamGapM: number;
    seamGapReceiptExact: true;
    zeroInverseMassVertexCount: number;
    positiveInverseMassVertexCount: number;
    inverseMassBitMismatchCount: number;
    pinnedPositionBitMismatchCount: number;
    maximumPinnedPositionDisplacementM: number;
    exactPinMaskParity: true;
  }>;
  freshBodyReplay: Readonly<{
    exactFinalCandidateReplayed: true;
    bodyGarmentTriangleIntersectionCount: 0;
    penetratingVertexCount: 0;
    unsafeVertexCount: 0;
    ambiguousSignVertexCount: 0;
    minimumSignedClearanceM: number;
    contentFingerprintMatchesRunner: true;
  }>;
  response: Readonly<{
    status:
      | 'not-required-zero-residual'
      | 'blocked-final-previous-state-unavailable'
      | 'blocked-unsupported-residual-contact';
    finalPreviousPositionsAvailable: false;
    d419CarrierResponseStructurallyReusable: boolean;
    responseApplied: false;
    sweptGateEvaluated: false;
    reason: string;
  }>;
  stableEvidence: Readonly<{
    canonicalSha256: string;
    excludesVolatile16And32RunnerSeals: true;
  }>;
  claims: Readonly<{
    savedRuntimeAnd32FrameContentBound: true;
    genuineSavedRuntimeWrapperAuthenticated: false;
    baseRuntimeAnd32FrameOwnersNotReturnedByAdapter: true;
    exactRetainedSaved32FrameFinalCandidateMeasured: true;
    measurementSurfaceV1OracleUsed: true;
    confinedAuthenticatedAoSeamWitnessV2Used: true;
    freshExactBodyReplayExecuted: true;
    d419ResponseExecuted: false;
    finalPreviousStateAvailable: false;
    sweptGateEvaluated: false;
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
    authority: 'unsigned-structural-saved-32-frame-self-orientation-content-only';
  }>;
}>;

declare const ownerBrand: unique symbol;
export type BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationOwnerV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_SELF_ORIENTATION_OWNER_V1;
  report: BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationReportV1;
  readonly [ownerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationProjectionV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_SELF_ORIENTATION_PROJECTION_V1;
  reportCanonicalSha256: string;
  finalPositionsInvMassKg: Float32Array;
  finalPositions3M: Float32Array;
  normalizedTopology: Uint32Array;
  callerOwnedMutableBinaryCopies: true;
  selfIntersectionAuthority: false;
  collisionAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationOwnerV1;
      report: BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationReportV1;
    }>
  | Readonly<{
      ok: false;
      code:
        | 'aborted'
        | 'source-owner-unavailable'
        | 'runner-owner-unavailable'
        | 'binding-mismatch'
        | 'resource-budget-exceeded'
        | 'diagnostic-failed';
      detail: string;
      owner?: BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationOwnerV1;
      report?: BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationReportV1;
    }>;

type OwnerRecord = {
  finalPositionsInvMassKg: Float32Array;
  finalPositions3M: Float32Array;
  normalizedTopology: Uint32Array;
};

const owners = new CapturedWeakMap<object, OwnerRecord>();

function failure(
  code: Extract<
    BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationResultV1,
    { ok: false }
  >['code'],
  detail: string,
  owner?: BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationOwnerV1,
  report?: BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationReportV1,
): Extract<BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationResultV1, { ok: false }> {
  return objectFreeze({
    ok: false as const,
    code,
    detail: stringSlice
      ? (reflectApply(stringSlice, detail, [0, 2_048]) as string)
      : 'Saved 32F self diagnostic failed closed.',
    ...(owner ? { owner } : {}),
    ...(report ? { report } : {}),
  });
}

function bytesEqual(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new CapturedUint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new CapturedUint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function littleEndianBytes(values: Float32Array | Uint32Array): Uint8Array<ArrayBuffer> {
  if (!dataViewSetFloat32 || !dataViewSetUint32)
    throw new TypeError('Native little-endian writers are unavailable.');
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    if (values instanceof CapturedFloat32Array)
      reflectApply(dataViewSetFloat32, view, [index * 4, values[index], true]);
    else reflectApply(dataViewSetUint32, view, [index * 4, values[index], true]);
  }
  return bytes;
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || !subtleDigest)
    throw new TypeError('Native Web Crypto SHA-256 is unavailable.');
  const owned = new CapturedUint8Array(bytes.byteLength);
  reflectApply(uint8ArraySet, owned, [bytes]);
  const result = (await reflectApply(subtleDigest, capturedSubtle, [
    'SHA-256',
    owned,
  ])) as ArrayBuffer;
  if (objectGetPrototypeOf(result) !== arrayBufferPrototype || result.byteLength !== 32)
    throw new TypeError('Native Web Crypto SHA-256 returned invalid bytes.');
  let output = '';
  const digest = new CapturedUint8Array(result);
  for (let index = 0; index < digest.length; index += 1) output += HEX[digest[index]!]!;
  return output;
}

async function digestText(domain: string, value: unknown): Promise<string> {
  if (!textEncoderEncode) throw new TypeError('Native UTF-8 encoder is unavailable.');
  const bytes = reflectApply(textEncoderEncode, encoder, [
    `${domain}\0${jsonStringify(value)}`,
  ]) as Uint8Array;
  return digestBytes(bytes);
}

async function validateDigestAuthority(): Promise<void> {
  if ((await digestBytes(new CapturedUint8Array(0))) !== EMPTY_SHA256)
    throw new TypeError('SHA-256 empty-message KAT failed.');
  const abc = reflectApply(textEncoderEncode!, encoder, ['abc']) as Uint8Array;
  if ((await digestBytes(abc)) !== ABC_SHA256) throw new TypeError('SHA-256 abc KAT failed.');
}

function positions3(positions4: Float32Array): Float32Array {
  const output = new CapturedFloat32Array((positions4.length / 4) * 3);
  for (let vertex = 0; vertex < positions4.length / 4; vertex += 1) {
    output[vertex * 3] = positions4[vertex * 4]!;
    output[vertex * 3 + 1] = positions4[vertex * 4 + 1]!;
    output[vertex * 3 + 2] = positions4[vertex * 4 + 2]!;
  }
  return output;
}

function kindCounts(values: readonly MeasurementSurfaceIntersectionPairV1[]): KindCounts {
  const counts: Record<MeasurementSurfaceIntersectionKindV1, number> = {
    'proper-crossing': 0,
    'coplanar-overlap': 0,
    touching: 0,
  };
  for (const value of values) counts[value.kind] += 1;
  return objectFreeze(counts);
}

function witnessKindCounts(values: readonly BetaSkirtCanonicalMediumContactPairWitnessV2[]) {
  const counts: Record<MeasurementSurfaceIntersectionKindV1, number> = {
    'proper-crossing': 0,
    'coplanar-overlap': 0,
    touching: 0,
  };
  for (const value of values) counts[value.oracleKind] += 1;
  return objectFreeze(counts);
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

function orientation(source: Float32Array, final: Float32Array, triangles: Uint32Array) {
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
  return objectFreeze({
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

function seamPinParity(options: {
  sourcePositions4: Float32Array;
  finalPositions4: Float32Array;
  seamPairs: Uint32Array;
  pins: Uint32Array;
  runnerFinalMaximumSeamGapM: number;
}) {
  const sourceBits = new CapturedUint32Array(
    options.sourcePositions4.buffer,
    options.sourcePositions4.byteOffset,
    options.sourcePositions4.length,
  );
  const finalBits = new CapturedUint32Array(
    options.finalPositions4.buffer,
    options.finalPositions4.byteOffset,
    options.finalPositions4.length,
  );
  if (!setHas) throw new TypeError('Native Set membership is unavailable.');
  const pins = new CapturedSet(options.pins);
  let zeroInverseMassVertexCount = 0;
  let positiveInverseMassVertexCount = 0;
  let inverseMassBitMismatchCount = 0;
  let pinnedPositionBitMismatchCount = 0;
  let maximumPinnedPositionDisplacementM = 0;
  for (let vertex = 0; vertex < VERTEX_COUNT; vertex += 1) {
    const w = options.sourcePositions4[vertex * 4 + 3]!;
    if (w === 0) zeroInverseMassVertexCount += 1;
    else if (Number.isFinite(w) && w > 0) positiveInverseMassVertexCount += 1;
    else throw new TypeError('Source inverse mass is invalid.');
    if (sourceBits[vertex * 4 + 3] !== finalBits[vertex * 4 + 3]) inverseMassBitMismatchCount += 1;
    if (!(reflectApply(setHas, pins, [vertex]) as boolean)) continue;
    let tupleExact = true;
    for (let component = 0; component < 4; component += 1)
      if (sourceBits[vertex * 4 + component] !== finalBits[vertex * 4 + component])
        tupleExact = false;
    if (!tupleExact) pinnedPositionBitMismatchCount += 1;
    maximumPinnedPositionDisplacementM = Math.max(
      maximumPinnedPositionDisplacementM,
      Math.hypot(
        options.finalPositions4[vertex * 4]! - options.sourcePositions4[vertex * 4]!,
        options.finalPositions4[vertex * 4 + 1]! - options.sourcePositions4[vertex * 4 + 1]!,
        options.finalPositions4[vertex * 4 + 2]! - options.sourcePositions4[vertex * 4 + 2]!,
      ),
    );
  }
  const sourceMaximumSeamGapM = maximumSeamGap(options.sourcePositions4, options.seamPairs);
  const finalMaximumSeamGapM = maximumSeamGap(options.finalPositions4, options.seamPairs);
  if (
    finalMaximumSeamGapM !== options.runnerFinalMaximumSeamGapM ||
    zeroInverseMassVertexCount !== PIN_COUNT ||
    positiveInverseMassVertexCount !== VERTEX_COUNT - PIN_COUNT ||
    inverseMassBitMismatchCount !== 0 ||
    pinnedPositionBitMismatchCount !== 0 ||
    maximumPinnedPositionDisplacementM !== 0
  )
    throw new TypeError('Seam, pin, or inverse-mass parity failed.');
  return objectFreeze({
    sourceMaximumSeamGapM,
    finalMaximumSeamGapM,
    runnerFinalMaximumSeamGapM: options.runnerFinalMaximumSeamGapM,
    seamGapReceiptExact: true as const,
    zeroInverseMassVertexCount,
    positiveInverseMassVertexCount,
    inverseMassBitMismatchCount,
    pinnedPositionBitMismatchCount,
    maximumPinnedPositionDisplacementM,
    exactPinMaskParity: true as const,
  });
}

function finalCollisionInput(
  source: BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  finalPositions3M: Float32Array,
  finalPositionsSha256: string,
): BetaSkirtRenderedBodyCollisionDiagnosticInputV1 {
  return {
    binding: { ...source.binding, garmentPositionsSha256: finalPositionsSha256 },
    bodyPositionsM: new CapturedFloat32Array(source.bodyPositionsM),
    bodyTriangles: new CapturedUint32Array(source.bodyTriangles),
    garmentPositionsM: new CapturedFloat32Array(finalPositions3M),
    garmentTriangles: new CapturedUint32Array(source.garmentTriangles),
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

function ownersStillLive(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  runtimeSha256: string,
  runnerSha256: string,
): boolean {
  return (
    projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner)?.reportCanonicalSha256 ===
      runtimeSha256 &&
    projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(runnerOwner)
      ?.reportCanonicalSha256 === runnerSha256
  );
}

function abortRequested(signal?: AbortSignal): boolean {
  if (signal === undefined) return false;
  if (
    !abortSignalAborted ||
    typeof AbortSignal === 'undefined' ||
    objectGetPrototypeOf(signal) !== AbortSignal.prototype
  )
    throw new TypeError('Saved 32F self diagnostic requires a genuine AbortSignal.');
  return reflectApply(abortSignalAborted, signal, []) as boolean;
}

export async function evaluateBetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationV1(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  signal?: AbortSignal,
): Promise<BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationResultV1> {
  try {
    if (abortRequested(signal)) return failure('aborted', 'Saved 32F self diagnostic was aborted.');
  } catch (error) {
    return failure(
      'binding-mismatch',
      error instanceof Error ? error.message : 'Saved 32F signal is invalid.',
    );
  }
  const runtimeProjection = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  if (!runtimeProjection)
    return failure('source-owner-unavailable', 'A live base runtime owner is required.');
  const runnerProjection = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(runnerOwner);
  if (!runnerProjection)
    return failure('runner-owner-unavailable', 'A live saved 32F V4 owner is required.');
  const runtimeSha256 = runtimeProjection.reportCanonicalSha256;
  const runnerSha256 = runnerProjection.reportCanonicalSha256;
  const sourcePositions4 = new CapturedFloat32Array(
    runtimeProjection.initialPhysicalPositionsInvMassKg,
  );
  const sourcePositions3 = positions3(sourcePositions4);
  const finalPositions4 = new CapturedFloat32Array(runnerProjection.finalPositionsInvMassKg);
  const finalPositions3 = new CapturedFloat32Array(runnerProjection.finalPositions3M);
  const triangles = new CapturedUint32Array(runnerProjection.normalizedTriangles);
  const seamPairs = new CapturedUint32Array(runtimeProjection.seamPairs);
  const pins = new CapturedUint32Array(runtimeProjection.pinnedWaistVertexIndices);
  const collisionInput = finalCollisionInput(
    runtimeProjection.collisionInput,
    finalPositions3,
    runnerOwner.report.bindings.finalPositions3MSha256,
  );
  const runnerReport = runnerOwner.report;

  try {
    if (
      runnerReport.status !== 'diagnostic-blocked' ||
      runnerReport.decision !==
        'MEASURED_32_FRAME_EXACT_BODY_CONTACT_AND_STRUCTURAL_POSTGATE_CLEAR_WITH_DOWNSTREAM_BLOCKERS' ||
      runnerReport.bindings.runtimeSourceCanonicalSha256 !== runtimeSha256 ||
      runnerReport.bindings.finalPositions3MSha256 !==
        runnerReport.bindings.finalCollisionBindingPositionsSha256 ||
      !runnerReport.collision.exactActualBodyGateClear ||
      runnerReport.collision.bodyGarmentTriangleIntersectionCount !== 0 ||
      runnerReport.collision.penetratingVertexCount !== 0 ||
      runnerReport.collision.unsafeVertexCount !== 0 ||
      runnerReport.collision.ambiguousSignVertexCount !== 0 ||
      sourcePositions4.length !== VERTEX_COUNT * 4 ||
      finalPositions4.length !== VERTEX_COUNT * 4 ||
      finalPositions3.length !== VERTEX_COUNT * 3 ||
      triangles.length !== TRIANGLE_COUNT * 3 ||
      seamPairs.length !== SEAM_PAIR_COUNT * 2 ||
      pins.length !== PIN_COUNT ||
      !bytesEqual(triangles, runtimeProjection.normalizedTriangles) ||
      !bytesEqual(finalPositions3, positions3(finalPositions4))
    )
      throw new TypeError('Saved 32F source, runner, or final body gate drifted.');

    await validateDigestAuthority();
    if (abortRequested(signal))
      throw new DOMException('Saved 32F self diagnostic aborted.', 'AbortError');
    const [finalVec4Sha, finalVec3Sha, topologySha, seamSha, pinsSha] = await Promise.all([
      digestBytes(littleEndianBytes(finalPositions4)),
      digestBytes(littleEndianBytes(finalPositions3)),
      digestBytes(littleEndianBytes(triangles)),
      digestBytes(littleEndianBytes(seamPairs)),
      digestBytes(littleEndianBytes(pins)),
    ]);
    if (
      finalVec4Sha !== runnerReport.bindings.finalPositionsInvMassKgSha256 ||
      finalVec3Sha !== runnerReport.bindings.finalPositions3MSha256 ||
      topologySha !== runnerReport.bindings.normalizedTopologySha256 ||
      seamSha !== runtimeOwner.report.bindings.seamPairsSha256 ||
      pinsSha !== runtimeOwner.report.bindings.pinnedVertexIndicesSha256
    )
      throw new TypeError('Saved 32F final/topology/seam/pin digest binding drifted.');
    if (!ownersStillLive(runtimeOwner, runnerOwner, runtimeSha256, runnerSha256))
      throw new TypeError('Saved 32F owners became stale before self evaluation.');

    const oracle = validateMeasurementSurfaceSelfIntersectionV1(
      finalPositions3,
      triangles,
      SELF_POLICY,
    );
    if (oracle.intersectionCount > MAX_RAW_INTERSECTION_COUNT)
      return failure(
        'resource-budget-exceeded',
        `Raw self-intersection cap exceeded (${oracle.intersectionCount}).`,
      );
    const witnesses: BetaSkirtCanonicalMediumContactPairWitnessV2[] = [];
    for (const pair of oracle.intersections) {
      if (abortRequested(signal))
        throw new DOMException('Saved 32F self diagnostic aborted.', 'AbortError');
      witnesses.push(
        await evaluateBetaSkirtCanonicalMediumConfinedContactPairV2({
          positions: finalPositions3,
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
    const aggregateContactLocusSha256 = await digestText(
      'beta-skirt-canonical-medium-saved-32f-self-contact-loci-v1',
      witnesses.map((value) => ({
        triangleA: value.triangleA,
        triangleB: value.triangleB,
        oracleKind: value.oracleKind,
        disposition: value.disposition,
        contactLocusSha256: value.contactLocusSha256,
      })),
    );
    const measuredOrientation = orientation(sourcePositions3, finalPositions3, triangles);
    const parity = seamPinParity({
      sourcePositions4,
      finalPositions4,
      seamPairs,
      pins,
      runnerFinalMaximumSeamGapM: runnerReport.observations.finalMaximumSeamGapM,
    });
    const bodyReplay = await evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1(collisionInput);
    if (
      !exactBodyClear(bodyReplay) ||
      bodyReplay.contentFingerprintSha256 !==
        runnerReport.bindings.finalCollisionContentFingerprintSha256
    )
      throw new TypeError('Fresh saved 32F exact body replay differs from the runner receipt.');
    if (!ownersStillLive(runtimeOwner, runnerOwner, runtimeSha256, runnerSha256))
      throw new TypeError('Saved 32F owners became stale during self/body evaluation.');

    const selfOrientationClear =
      residual.length === 0 &&
      measuredOrientation.sourceDegenerateTriangleCount === 0 &&
      measuredOrientation.finalDegenerateTriangleCount === 0 &&
      measuredOrientation.normalReversalCount === 0;
    const response = objectFreeze({
      status: (residual.length === 0
        ? 'not-required-zero-residual'
        : unsupportedResidualCount === 0
          ? 'blocked-final-previous-state-unavailable'
          : 'blocked-unsupported-residual-contact') as
        | 'not-required-zero-residual'
        | 'blocked-final-previous-state-unavailable'
        | 'blocked-unsupported-residual-contact',
      finalPreviousPositionsAvailable: false as const,
      d419CarrierResponseStructurallyReusable:
        residual.length > 0 && unsupportedResidualCount === 0,
      responseApplied: false as const,
      sweptGateEvaluated: false as const,
      reason:
        residual.length === 0
          ? 'No residual self contact requires response.'
          : unsupportedResidualCount === 0
            ? 'The V4 projection lacks final previous/velocity/lambda state required for velocity-coherent D-419 response.'
            : 'At least one residual contact lies outside the bounded D-419 carrier-adjacent touching scope.',
    });
    const blockers = objectFreeze([
      ...(residual.length > 0 ? ['saved-32-frame-residual-self-contact-remains'] : []),
      ...(carrierAdjacent.length > 0
        ? ['saved-32-frame-final-previous-state-unavailable-for-d419-response']
        : []),
      ...(unsupportedResidualCount > 0
        ? ['saved-32-frame-self-contact-outside-d419-response-scope']
        : []),
      ...(measuredOrientation.sourceDegenerateTriangleCount > 0
        ? ['source-degenerate-facets-present']
        : []),
      ...(measuredOrientation.finalDegenerateTriangleCount > 0
        ? ['final-degenerate-facets-present']
        : []),
      ...(measuredOrientation.normalReversalCount > 0
        ? ['source-to-final-normal-reversals-present']
        : []),
      'saved-32-frame-temporal-swept-self-gate-not-evaluated',
      'settle-fit-runtime-production-authority-not-established',
    ]);
    const bindings = objectFreeze({
      savedRuntimeSourceCanonicalSha256: runnerReport.bindings.savedRuntimeSourceCanonicalSha256,
      saved16FrameCanonicalSha256: runnerReport.bindings.saved16FrameCanonicalSha256,
      runtimeSourceCanonicalSha256: runtimeSha256,
      runner32FrameCanonicalSha256: runnerSha256,
      finalPositionsInvMassKgSha256: finalVec4Sha,
      finalPositions3MSha256: finalVec3Sha,
      normalizedTopologySha256: topologySha,
      seamPairsSha256: seamSha,
      pinnedVertexIndicesSha256: pinsSha,
      bodyCollisionContentFingerprintSha256: bodyReplay.contentFingerprintSha256,
      aggregateContactLocusSha256,
    });
    const counts = objectFreeze({
      vertexCount: VERTEX_COUNT,
      triangleCount: TRIANGLE_COUNT,
      seamPairCount: SEAM_PAIR_COUNT,
      pinnedVertexCount: PIN_COUNT,
    });
    const oracleReport = objectFreeze({
      version: MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
      epsilonM: oracle.epsilonM,
      theoreticalTrianglePairCount: (TRIANGLE_COUNT * (TRIANGLE_COUNT - 1)) / 2,
      broadPhaseCandidatePairCount: oracle.broadPhase.candidatePairCount,
      testedPairCount: oracle.broadPhase.testedPairCount,
      rawIntersectionCount: oracle.intersectionCount,
      rawKindCounts: kindCounts(oracle.intersections),
    });
    const confinedWitness = objectFreeze({
      excludedConfinedAuthenticatedAoSeamCount: excluded.length,
      excludedKindCounts: witnessKindCounts(excluded),
      residualBlockingCount: residual.length,
      residualKindCounts: witnessKindCounts(residual),
      carrierAdjacentTouchingResidualCount: carrierAdjacent.length,
      unsupportedResidualCount,
      exactRawEqualsExcludedPlusResidual: true as const,
      retainedWitnesses: objectFreeze([...residual, ...excluded].slice(0, MAX_RETAINED_WITNESSES)),
      witnessesTruncated: witnesses.length > MAX_RETAINED_WITNESSES,
    });
    const freshBodyReplay = objectFreeze({
      exactFinalCandidateReplayed: true as const,
      bodyGarmentTriangleIntersectionCount: 0 as const,
      penetratingVertexCount: 0 as const,
      unsafeVertexCount: 0 as const,
      ambiguousSignVertexCount: 0 as const,
      minimumSignedClearanceM: bodyReplay.clearance.minimumSignedClearanceM!,
      contentFingerprintMatchesRunner: true as const,
    });
    const claims = objectFreeze({
      savedRuntimeAnd32FrameContentBound: true as const,
      genuineSavedRuntimeWrapperAuthenticated: false as const,
      baseRuntimeAnd32FrameOwnersNotReturnedByAdapter: true as const,
      exactRetainedSaved32FrameFinalCandidateMeasured: true as const,
      measurementSurfaceV1OracleUsed: true as const,
      confinedAuthenticatedAoSeamWitnessV2Used: true as const,
      freshExactBodyReplayExecuted: true as const,
      d419ResponseExecuted: false as const,
      finalPreviousStateAvailable: false as const,
      sweptGateEvaluated: false as const,
      epsilonChanged: false as const,
      collisionPolicyChanged: false as const,
      selfIntersectionAuthority: false as const,
      collisionAuthority: false as const,
      fitAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    });
    const stablePayload = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_SELF_ORIENTATION_REPORT_V1,
      bindings: objectFreeze({
        ...bindings,
        saved16FrameCanonicalSha256: undefined,
        runner32FrameCanonicalSha256: undefined,
      }),
      counts,
      oracle: oracleReport,
      confinedWitness,
      orientation: measuredOrientation,
      seamPinParity: parity,
      freshBodyReplay,
      response,
      claims,
      blockers,
    });
    const stableEvidence = objectFreeze({
      canonicalSha256: await digestText(
        'beta-skirt-canonical-medium-saved-32f-self-orientation-stable-evidence-v1',
        stablePayload,
      ),
      excludesVolatile16And32RunnerSeals: true as const,
    });
    const reportWithoutSeal = objectFreeze({
      ...stablePayload,
      bindings,
      status: 'saved-32-frame-self-orientation-diagnostic-blocked' as const,
      decision: selfOrientationClear
        ? ('MEASURED_SAVED_32_FRAME_ZERO_RESIDUAL_SELF_AND_ORIENTATION_CLEAR_WITH_DOWNSTREAM_BLOCKERS' as const)
        : ('BLOCK_SAVED_32_FRAME_SELF_ORIENTATION_OR_RESPONSE' as const),
      stableEvidence,
    });
    const report = objectFreeze({
      ...reportWithoutSeal,
      seal: objectFreeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: await digestText(
          'beta-skirt-canonical-medium-saved-32f-self-orientation-report-v1',
          reportWithoutSeal,
        ),
        authority: 'unsigned-structural-saved-32-frame-self-orientation-content-only' as const,
      }),
    }) satisfies BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationReportV1;
    if (!ownersStillLive(runtimeOwner, runnerOwner, runtimeSha256, runnerSha256))
      throw new TypeError('Saved 32F owners became stale before self owner minting.');
    const owner = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_SELF_ORIENTATION_OWNER_V1,
      report,
    }) as BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationOwnerV1;
    if (!weakMapSet) throw new TypeError('Native WeakMap storage is unavailable.');
    reflectApply(weakMapSet, owners, [
      owner,
      {
        finalPositionsInvMassKg: new CapturedFloat32Array(finalPositions4),
        finalPositions3M: new CapturedFloat32Array(finalPositions3),
        normalizedTopology: new CapturedUint32Array(triangles),
      },
    ]);
    if (!selfOrientationClear)
      return failure(
        'diagnostic-failed',
        `${residual.length} residual self contacts or orientation blockers remain.`,
        owner,
        report,
      );
    return objectFreeze({ ok: true as const, owner, report });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      return failure('aborted', error.message);
    const detail = error instanceof Error ? error.message : 'Saved 32F self diagnostic failed.';
    return failure(
      regexpTest &&
        (reflectApply(regexpTest, /budget|cap|count|out of range/iu, [detail]) as boolean)
        ? 'resource-budget-exceeded'
        : 'binding-mismatch',
      detail,
    );
  }
}

export function projectBetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationV1(
  owner: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationProjectionV1 | null {
  if (!owner || typeof owner !== 'object' || !weakMapGet) return null;
  const record = reflectApply(weakMapGet, owners, [owner]) as OwnerRecord | undefined;
  if (!record) return null;
  const typed = owner as BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationOwnerV1;
  return objectFreeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_SELF_ORIENTATION_PROJECTION_V1,
    reportCanonicalSha256: typed.report.seal.canonicalSha256,
    finalPositionsInvMassKg: new CapturedFloat32Array(record.finalPositionsInvMassKg),
    finalPositions3M: new CapturedFloat32Array(record.finalPositions3M),
    normalizedTopology: new CapturedUint32Array(record.normalizedTopology),
    callerOwnedMutableBinaryCopies: true as const,
    selfIntersectionAuthority: false as const,
    collisionAuthority: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationV1(
  owner: unknown,
): boolean {
  if (!owner || typeof owner !== 'object' || !weakMapGet || !weakMapDelete) return false;
  const record = reflectApply(weakMapGet, owners, [owner]) as OwnerRecord | undefined;
  if (!record) return false;
  reflectApply(float32ArrayFill, record.finalPositionsInvMassKg, [0]);
  reflectApply(float32ArrayFill, record.finalPositions3M, [0]);
  reflectApply(uint32ArrayFill, record.normalizedTopology, [0]);
  reflectApply(weakMapDelete, owners, [owner]);
  return true;
}

/** Shared validation-only diagnostics; these functions never issue a source/runner owner. */
export const betaSkirtSaved32SelfOrientationValidationV1 = Object.freeze({
  orientation,
  seamPinParity,
  selfPolicy: SELF_POLICY,
  maximumRawIntersectionCount: MAX_RAW_INTERSECTION_COUNT,
});
