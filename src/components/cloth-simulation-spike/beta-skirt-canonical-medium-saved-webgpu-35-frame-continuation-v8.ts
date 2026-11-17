/* global GPUBindGroup, GPUBuffer, GPUComputePipeline, GPUDevice, GPUShaderModuleDescriptor */

import { decodeClothMaterialGpuV1 } from '../../lib/cloth/compiler/material-package';
import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
  type MeasurementSurfaceIntersectionKindV1,
} from '../../lib/cloth/body/measurement-surface-self-intersection-v1';
import {
  ACTUAL_BODY_TRIANGLE_MESH_CONTACT_DIAGNOSTICS_BYTES_V2,
  ACTUAL_BODY_TRIANGLE_MESH_CONTACT_SOURCE_SHA256_V2,
  actualBodyTriangleMeshContactShaderDescriptorV2,
  actualBodyTriangleMeshContactWorkgroupsV2,
  getActualBodyTriangleMeshContactPipelineIdentityV2,
  packActualBodyTriangleMeshContactParamsV2,
} from '../../lib/cloth/runtime/webgpu/actual-body-triangle-mesh-contact-kernel-v2';
import {
  createXpbdBendResetPacketV1,
  createXpbdContinuumResetPacketV1,
  createXpbdDistanceResetPacketV1,
  createXpbdSeamAllActivePacketV1,
} from '../../lib/cloth/runtime/webgpu/xpbd-initialization-core-reset';
import {
  getXpbdInitializationCoreResetPipelineIdentityV1,
  xpbdInitializationCoreResetShaderDescriptorV1,
  type XpbdInitializationCoreResetKernelV1,
} from '../../lib/cloth/runtime/webgpu/xpbd-initialization-core-reset-kernels';
import {
  encodeXpbdPredictFrameParamsV1,
  getXpbdPredictPipelineIdentityV1,
  xpbdPredictShaderDescriptorV1,
  xpbdPredictWorkgroupsV1,
} from '../../lib/cloth/runtime/webgpu/xpbd-predict-kernel-v1';
import {
  encodeXpbdDistanceColorParamsV1,
  getXpbdDistancePipelineIdentityV1,
  xpbdDistanceColorWorkgroupsV1,
  xpbdDistanceShaderDescriptorV1,
} from '../../lib/cloth/runtime/webgpu/xpbd-distance-kernel-v1';
import {
  createXpbdSeamSolveColorScheduleV1,
  getXpbdSeamSolvePipelineIdentityV1,
  packXpbdSeamSolveActivationParamsV1,
  packXpbdSeamSolveColorParamsV1,
  xpbdSeamSolveShaderDescriptorV1,
} from '../../lib/cloth/runtime/webgpu/xpbd-seam-solve-kernel-v1';
import {
  createXpbdEmbeddedScalarBendColorScheduleV1,
  getXpbdEmbeddedScalarBendPipelineIdentityV1,
  packXpbdEmbeddedScalarBendColorParamsV1,
  xpbdEmbeddedScalarBendShaderDescriptorV1,
} from '../../lib/cloth/runtime/webgpu/xpbd-embedded-scalar-bend-kernel-v1';
import {
  CONTINUUM_STRAIN_VNEXT_WORKGROUP_SIZE,
  continuumStrainVNextShaderDescriptorV1,
  getContinuumStrainVNextPipelineIdentityV1,
} from '../../lib/cloth/runtime/webgpu/triangle-strain-continuum-vnext-kernel';
import {
  getXpbdVelocityDiagnosticPipelineIdentityV1,
  xpbdVelocityDiagnosticShaderDescriptorV1,
} from '../../lib/cloth/runtime/webgpu/xpbd-invalid-state-kernel';
import {
  createXpbdDeviceSession,
  type CreateXpbdDeviceSessionOptions,
  type XpbdDeviceLease,
  type XpbdDeviceSession,
  type XpbdRuntimeSessionId,
} from '../../lib/cloth/runtime/webgpu/xpbd-device-session';

import {
  evaluateBetaSkirtCoherentEnvelopeQualityV1,
  type BetaSkirtCoherentEnvelopeQualityReportV1,
} from './beta-skirt-coherent-envelope-quality-evidence-v1';
import {
  evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticReportV1,
} from './beta-skirt-rendered-body-collision-diagnostic-v1';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseV1,
  type BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1,
} from './beta-skirt-canonical-medium-saved-webgpu-34-frame-carrier-response-v1';
import {
  evaluateBetaSkirtCanonicalMediumConfinedContactPairV2,
  type BetaSkirtCanonicalMediumContactPairWitnessV2,
} from './beta-skirt-canonical-medium-confined-ao-seam-contact-witness-v2';
import {
  evaluateBetaSkirtExactSweptBodyAuditV1,
  type BetaSkirtExactSweptBodyAuditReportV1,
} from './beta-skirt-exact-swept-body-audit-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_35_FRAME_CONTINUATION_REPORT_V8 =
  'beta-skirt-canonical-medium-saved-webgpu-35-frame-continuation-report/8' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_35_FRAME_CONTINUATION_OWNER_V8 =
  'beta-skirt-canonical-medium-saved-webgpu-35-frame-continuation-owner/8' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_35_FRAME_CONTINUATION_PROJECTION_V8 =
  'beta-skirt-canonical-medium-saved-webgpu-35-frame-continuation-projection/8' as const;

const FRAME_COUNT = 32;
const PARTICLE_COUNT = 580;
const TRIANGLE_COUNT = 912;
const DISTANCE_COUNT = 1490;
const SEAM_COUNT = 34;
const BEND_COUNT = 1246;
const CONTINUUM_COUNT = 912;
const CONTINUUM_LAMBDA_FLOAT_COUNT = CONTINUUM_COUNT * 4;
const PIN_COUNT = 82;
const BODY_VERTEX_COUNT = 13_380;
const BODY_TRIANGLE_COUNT = 26_756;
const FIXED_DT_S = 1 / 120;
const FIXED_ITERATIONS = 8;
const GRAVITY_MPS2_Y = -9.81;
const WIND_MPS2_Z = 0;
const DISTANCE_COMPLIANCE_M_PER_N = 2e-7;
const SEAM_COMPLIANCE_M_PER_N = 1e-8;
const MAX_SEAM_GAP_M = 0.001;
const CONTACT_CLEARANCE_MARGIN_M = Math.fround(0.002);
const CONTACT_MAXIMUM_CORRECTION_M = Math.fround(0.08);
const CONTACT_MINIMUM_NORMAL_LENGTH_SQUARED_M4 = Math.fround(1e-20);
const EXACT_POSTGATE_MINIMUM_SIGNED_CLEARANCE_M = 0.001;
const MAX_RAW_INTERSECTION_COUNT = 2_048;
const MAX_RETAINED_WITNESSES = 64;
const DEGENERATE_NORMAL_EPSILON = 1e-20;
const SELF_POLICY = Object.freeze({
  ...DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  maxVertices: PARTICLE_COUNT,
  maxTriangles: TRIANGLE_COUNT,
  maxInputBytes: 128 * 1024,
  maxGridCells: 100_000,
  maxCellReferences: 500_000,
  maxCellPairVisits: 2_000_000,
  maxCandidatePairs: 500_000,
});
const MAP_READ = 0x0001;
const COPY_SRC = 0x0004;
const COPY_DST = 0x0008;
const UNIFORM = 0x0040;
const STORAGE = 0x0080;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const HEX = Object.freeze(
  Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')),
);
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const capturedStructuredClone = globalThis.structuredClone.bind(globalThis);
const capturedTextEncoder = new TextEncoder();
const capturedTextEncode = TextEncoder.prototype.encode;
const capturedReflectApply = Reflect.apply;
const capturedJsonStringify = JSON.stringify.bind(JSON);
const capturedObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const capturedObjectGetPrototypeOf = Object.getPrototypeOf;
const capturedUint8Set = Uint8Array.prototype.set;
const capturedFloat32Fill = Float32Array.prototype.fill;
const capturedUint32Fill = Uint32Array.prototype.fill;
const capturedCryptoObject = globalThis.crypto;
const capturedSubtle = capturedCryptoObject?.subtle;
const capturedDigest = capturedSubtle?.digest;
const capturedRandomUuid = capturedCryptoObject?.randomUUID?.bind(capturedCryptoObject);
const capturedAbortSignalAborted =
  typeof AbortSignal === 'undefined'
    ? null
    : capturedObjectGetOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get;

type GpuProvider = NonNullable<CreateXpbdDeviceSessionOptions['gpu']>;

type FrameStateV8 = Readonly<{
  current: Float32Array;
  previous: Float32Array;
  velocities: Float32Array;
  distanceLambdas: Float32Array;
  seamLambdas: Float32Array;
  bendLambdas: Float32Array;
  continuumLambdas: Float32Array;
  triangles: Uint32Array;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOptionsV8 = Readonly<{
  gpu?: GpuProvider;
  sessionIdFactory?: CreateXpbdDeviceSessionOptions['sessionIdFactory'];
  signal?: AbortSignal;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationBlockerV8 =
  | 'frame35-exact-body-gate-failed'
  | 'frame35-structural-quality-gate-failed'
  | 'frame35-residual-self-contact-remains'
  | 'frame35-orientation-gate-failed'
  | 'frame35-seam-pin-w-gate-failed'
  | 'frame35-swept-body-gate-failed'
  | 'multi-frame-settle-fit-runtime-production-authority-not-established';

export type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationReportV8 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_35_FRAME_CONTINUATION_REPORT_V8;
  status:
    'saved-35-frame-rehydrated-postgates-clear' | 'saved-35-frame-rehydrated-postgate-blocked';
  decision:
    | 'PASS_EXACT_REHYDRATED_FRAME35_WITHOUT_CONTINUATION_AUTHORITY'
    | 'BLOCK_FRAME35_POSTGATES_AFTER_EXACT_REHYDRATION';
  bindings: Readonly<{
    runtimeSourceCanonicalSha256: string;
    sourceFrame34CarrierResponseCanonicalSha256: string;
    normalizedV5AggregateSha256: string;
    sourcePositions3MSha256: string;
    normalizedTopologySha256: string;
    seamPairsSha256: string;
    pinnedVertexIndicesSha256: string;
    inputCurrentPositionsInvMassKgSha256: string;
    inputCurrentPositions3MSha256: string;
    inputPreviousPositionsInvMassKgSha256: string;
    inputVelocitiesMpsSha256: string;
    inputDistanceLambdasKgMSha256: string;
    inputSeamLambdasKgMSha256: string;
    inputBendLambdasKgM2Sha256: string;
    inputContinuumLambdasKgMSha256: string;
    inputDynamicStateAggregateSha256: string;
    finalPositionsInvMassKgSha256: string;
    finalPositions3MSha256: string;
    finalCollisionBindingPositionsSha256: string;
    finalCollisionContentFingerprintSha256: string;
    finalPreviousPositionsInvMassKgSha256: string;
    finalVelocitiesMpsSha256: string;
    finalDistanceLambdasKgMSha256: string;
    finalSeamLambdasKgMSha256: string;
    finalBendLambdasKgM2Sha256: string;
    finalContinuumLambdasKgMSha256: string;
    retainedDynamicStateAggregateSha256: string;
    bodyPositions3MSha256: string;
    bodyTrianglesSha256: string;
    contactKernelSourceSha256: typeof ACTUAL_BODY_TRIANGLE_MESH_CONTACT_SOURCE_SHA256_V2;
  }>;
  config: ReturnType<typeof prepareRun>['reportConfig'];
  workload: ReturnType<typeof prepareRun>['reportWorkload'];
  execution: Readonly<{
    frameNumber: 35;
    frameSubmissionCount: 1;
    readbackSubmissionCount: 2;
    totalComputeDispatchCount: number;
    positionReadbackByteLength: number;
    diagnosticReadbackByteLength: number;
    retainedDynamicStateReadbackByteLength: number;
    inputStateVerificationReadbackByteLength: number;
    totalReadbackByteLength: number;
    invalidVelocityStateCount: number;
    numericInvalidVelocityStateCount: number;
    outOfDomainVelocityStateCount: number;
    bendInvalidConstraintCount: number;
    continuumNonzeroStatusCount: number;
    contactDispatchCount: 1;
    contactCorrectedParticleEventCount: number;
    contactInvalidParticleCount: number;
    contactDegenerateTriangleVisitCount: number;
    contactOutOfRangeTriangleVisitCount: number;
    contactMaximumCorrectionM: number;
    contactMaximumPenetrationM: number;
    contactMinimumCorrectedParticleIndex: number | null;
    contactInwardNormalClampEventCount: number;
    contactMaximumRemovedInwardNormalDeltaM: number;
    contactCorrectionCapHit: boolean;
    frameExecutionWallTimeMs: number;
    validationMessages: readonly string[];
    deviceLossMessages: readonly string[];
  }>;
  retainedState: Readonly<{
    currentPositionsInvMassKgFloatCount: 2320;
    previousPositionsInvMassKgFloatCount: 2320;
    velocitiesMpsFloatCount: 2320;
    distanceLambdasKgMFloatCount: typeof DISTANCE_COUNT;
    seamLambdasKgMFloatCount: typeof SEAM_COUNT;
    bendLambdasKgM2FloatCount: typeof BEND_COUNT;
    continuumLambdasKgMFloatCount: typeof CONTINUUM_LAMBDA_FLOAT_COUNT;
    totalByteLength: 53512;
    inputStateUploadByteExact: true;
    currentInverseMassBitsExactSource: true;
    previousInverseMassBitsExactSource: true;
    velocityWComponentsPositiveZero: true;
    allCurrentPreviousVelocityFinite: true;
    allLambdasFinite: true;
    exactFrameContinuationStateBytesRetained: true;
  }>;
  continuation: Readonly<{
    sourceFrameNumber: 34;
    executedFrameNumber: 35;
    d435ResponseIsSoleMutableStateInput: true;
    inputStateUploadByteExact: true;
    inputStateByteLength: 53512;
    oneUnchangedFrameScheduleExecuted: true;
    rehydratedFrame35: true;
    sameLiveGpuSessionFromFrame34: false;
    frameExecutionWallTimeMs: number;
  }>;
  observations: Readonly<{
    everyPositionFinite: boolean;
    everyInverseMassBitExact: boolean;
    pinnedParticleCountBitExact: number;
    sourceAndFinalPositionsDiffer: boolean;
    finalHashBoundToCollisionInput: boolean;
    staleSourceCollisionHashRejectedByConstruction: boolean;
    inputMaximumSeamGapM: number;
    finalMaximumSeamGapM: number;
    seamGapLimitM: typeof MAX_SEAM_GAP_M;
    seamGapBounded: boolean;
  }>;
  quality: BetaSkirtCoherentEnvelopeQualityReportV1;
  collision: Readonly<{
    status: BetaSkirtRenderedBodyCollisionDiagnosticReportV1['status'];
    exactActualBodyGateClear: boolean;
    blockers: BetaSkirtRenderedBodyCollisionDiagnosticReportV1['blockers'];
    bodyGarmentTriangleIntersectionCount: number | null;
    minimumSignedClearanceM: number | null;
    penetratingVertexCount: number | null;
    unsafeVertexCount: number | null;
    ambiguousSignVertexCount: number | null;
  }>;
  selfOrientation: Readonly<{
    oracleVersion: typeof MEASUREMENT_SURFACE_SELF_INTERSECTION_V1;
    epsilonM: number;
    rawIntersectionCount: number;
    rawKindCounts: SelfKindCounts;
    excludedConfinedAuthenticatedAoSeamCount: number;
    residualBlockingCount: number;
    residualKindCounts: SelfKindCounts;
    carrierAdjacentTouchingResidualCount: number;
    unsupportedResidualCount: number;
    exactRawEqualsExcludedPlusResidual: true;
    retainedResidualWitnesses: readonly BetaSkirtCanonicalMediumContactPairWitnessV2[];
  }>;
  orientation: ReturnType<typeof continuationOrientation>;
  seamPinW: ReturnType<typeof continuationSeamPinWGate>;
  sweptBody: BetaSkirtExactSweptBodyAuditReportV1;
  postgatesClear: boolean;
  blockers: readonly BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationBlockerV8[];
  stableEvidence: Readonly<{
    canonicalSha256: string;
    excludesRunnerTimingAndVolatileOwnerSeals: true;
  }>;
  cleanup: Readonly<{
    destroyedBufferCount: number;
    leaseReleased: boolean;
    sessionDisposed: boolean;
    contextUnconfigured: boolean;
    deviceDestroyed: boolean;
  }>;
  claims: typeof CLAIMS;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-saved-35-frame-rehydrated-continuation-diagnostic-only';
  }>;
}>;

declare const runnerOwnerBrand: unique symbol;
export type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOwnerV8 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_35_FRAME_CONTINUATION_OWNER_V8;
  report: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationReportV8;
  readonly [runnerOwnerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationProjectionV8 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_35_FRAME_CONTINUATION_PROJECTION_V8;
  reportCanonicalSha256: string;
  finalCurrentPositionsInvMassKg: Float32Array;
  finalCurrentPositions3M: Float32Array;
  finalPreviousPositionsInvMassKg: Float32Array;
  finalVelocitiesMps: Float32Array;
  finalDistanceLambdasKgM: Float32Array;
  finalSeamLambdasKgM: Float32Array;
  finalBendLambdasKgM2: Float32Array;
  finalContinuumLambdasKgM: Float32Array;
  normalizedTriangles: Uint32Array;
  callerOwnedMutableBinaryCopies: true;
  rehydratedFrame35DiagnosticOnly: true;
  sameLiveGpuSessionFromFrame34: false;
  exactFrameContinuationAuthority: false;
  collisionAuthority: false;
  runtimeAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationErrorCodeV8 =
  | 'unsupported-webgpu'
  | 'aborted'
  | 'source-owner-unavailable'
  | 'saved-34-frame-carrier-response-owner-unavailable'
  | 'saved-frame34-response-binding-mismatch'
  | 'v5-contract-mismatch'
  | 'pipeline-identity-mismatch'
  | 'gpu-execution-failed'
  | 'input-state-upload-mismatch'
  | 'invalid-gpu-state'
  | 'state-retention-invalid'
  | 'collision-diagnostic-failed'
  | 'contact-correction-cap-hit'
  | 'post-frame-self-orientation-swept-gate-failed'
  | 'diagnostic-failed';

export type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationResultV8 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOwnerV8;
      report: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationReportV8;
    }>
  | Readonly<{
      ok: false;
      code: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationErrorCodeV8;
      detail: string;
      owner?: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOwnerV8;
      report?: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationReportV8;
    }>;

type OwnerRecord = {
  finalCurrentPositionsInvMassKg: Float32Array;
  finalCurrentPositions3M: Float32Array;
  finalPreviousPositionsInvMassKg: Float32Array;
  finalVelocitiesMps: Float32Array;
  finalDistanceLambdasKgM: Float32Array;
  finalSeamLambdasKgM: Float32Array;
  finalBendLambdasKgM2: Float32Array;
  finalContinuumLambdasKgM: Float32Array;
  normalizedTriangles: Uint32Array;
};

const owners = new WeakMap<object, OwnerRecord>();
class RunnerAbortError extends Error {}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal === undefined) return;
  if (
    !capturedAbortSignalAborted ||
    typeof AbortSignal === 'undefined' ||
    capturedObjectGetPrototypeOf(signal) !== AbortSignal.prototype
  )
    throw new TypeError('Frame35 paired continuation requires a genuine AbortSignal.');
  if (capturedReflectApply(capturedAbortSignalAborted, signal, []) as boolean)
    throw new RunnerAbortError('Frame35 paired continuation was aborted.');
}

function copiedBytes(value: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer> {
  const source =
    value instanceof ArrayBuffer
      ? new CapturedUint8Array(value)
      : new CapturedUint8Array(value.buffer, value.byteOffset, value.byteLength);
  const copy = new CapturedUint8Array(source.byteLength);
  capturedReflectApply(capturedUint8Set, copy, [source]);
  return copy;
}

function copiedBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  return copiedBytes(value).buffer;
}

function concatenateBytes(values: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  let byteLength = 0;
  for (const value of values) byteLength += value.byteLength;
  const output = new CapturedUint8Array(byteLength);
  let offset = 0;
  for (const value of values) {
    capturedReflectApply(capturedUint8Set, output, [value, offset]);
    offset += value.byteLength;
  }
  return output;
}

function float32LeBytes(value: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new CapturedUint8Array(value.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1)
    view.setFloat32(index * 4, value[index]!, true);
  return bytes;
}

function uint32LeBytes(value: Uint32Array): Uint8Array<ArrayBuffer> {
  const bytes = new CapturedUint8Array(value.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1)
    view.setUint32(index * 4, value[index]!, true);
  return bytes;
}

function positiveFloatFromBits(bits: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, bits, true);
  return view.getFloat32(0, true);
}

function bodySignedVolumeM3(positions: Float32Array, triangles: Uint32Array): number {
  let volume6 = 0;
  for (let triangle = 0; triangle < triangles.length / 3; triangle += 1) {
    const ia = triangles[triangle * 3]! * 3;
    const ib = triangles[triangle * 3 + 1]! * 3;
    const ic = triangles[triangle * 3 + 2]! * 3;
    const ax = positions[ia]!;
    const ay = positions[ia + 1]!;
    const az = positions[ia + 2]!;
    const bx = positions[ib]!;
    const by = positions[ib + 1]!;
    const bz = positions[ib + 2]!;
    const cx = positions[ic]!;
    const cy = positions[ic + 1]!;
    const cz = positions[ic + 2]!;
    volume6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return volume6 / 6;
}

function bytesEqual(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new CapturedUint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new CapturedUint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function hex(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) result += HEX[bytes[index]!]!;
  return result;
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || typeof capturedDigest !== 'function')
    throw new Error('Native Web Crypto SHA-256 is unavailable.');
  const digest = (await capturedReflectApply(capturedDigest, capturedSubtle, [
    'SHA-256',
    copiedBytes(bytes),
  ])) as ArrayBuffer;
  if (digest.byteLength !== 32) throw new Error('Native SHA-256 returned an invalid digest.');
  return hex(new CapturedUint8Array(digest));
}

async function validateDigestAuthority(): Promise<void> {
  if ((await digestBytes(new CapturedUint8Array(0))) !== EMPTY_SHA256)
    throw new Error('SHA-256 empty-message known-answer test failed.');
  const abc = capturedReflectApply(capturedTextEncode, capturedTextEncoder, ['abc']) as Uint8Array;
  if ((await digestBytes(abc)) !== ABC_SHA256)
    throw new Error('SHA-256 abc known-answer test failed.');
}

function cryptoShim(): Crypto {
  return Object.freeze({
    subtle: Object.freeze({
      digest(algorithm: string | object, data: ArrayBuffer | ArrayBufferView) {
        if (!capturedSubtle || typeof capturedDigest !== 'function')
          return Promise.reject(new TypeError('Native Web Crypto SHA-256 is unavailable.'));
        return capturedReflectApply(capturedDigest, capturedSubtle, [algorithm, data]);
      },
    }),
  }) as unknown as Crypto;
}

function defaultSessionIdFactory(): XpbdRuntimeSessionId {
  if (!capturedRandomUuid) throw new Error('Native randomUUID is unavailable.');
  return `gpu-session:${capturedRandomUuid()}` as XpbdRuntimeSessionId;
}

function positions3(positions4: Float32Array): Float32Array {
  const result = new CapturedFloat32Array((positions4.length / 4) * 3);
  for (let vertex = 0; vertex < positions4.length / 4; vertex += 1) {
    result[vertex * 3] = positions4[vertex * 4]!;
    result[vertex * 3 + 1] = positions4[vertex * 4 + 1]!;
    result[vertex * 3 + 2] = positions4[vertex * 4 + 2]!;
  }
  return result;
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

type SelfKindCounts = Readonly<Record<MeasurementSurfaceIntersectionKindV1, number>>;

function selfKindCounts(
  values: readonly Readonly<{ kind: MeasurementSurfaceIntersectionKindV1 }>[],
): SelfKindCounts {
  const result: Record<MeasurementSurfaceIntersectionKindV1, number> = {
    'proper-crossing': 0,
    'coplanar-overlap': 0,
    touching: 0,
  };
  for (const value of values) result[value.kind] += 1;
  return Object.freeze(result);
}

function witnessKindCounts(
  values: readonly BetaSkirtCanonicalMediumContactPairWitnessV2[],
): SelfKindCounts {
  const result: Record<MeasurementSurfaceIntersectionKindV1, number> = {
    'proper-crossing': 0,
    'coplanar-overlap': 0,
    touching: 0,
  };
  for (const value of values) result[value.oracleKind] += 1;
  return Object.freeze(result);
}

function triangleUnitNormal(
  positions: Float32Array,
  triangles: Uint32Array,
  triangle: number,
): readonly [number, number, number] | null {
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

function continuationOrientation(
  preFramePositions: Float32Array,
  finalPositions: Float32Array,
  triangles: Uint32Array,
) {
  let comparedTriangleCount = 0;
  let preFrameDegenerateTriangleCount = 0;
  let finalDegenerateTriangleCount = 0;
  let normalReversalCount = 0;
  let minimumPreFrameToFinalNormalDot = 1;
  let maximumNormalChangeRadians = 0;
  for (let triangle = 0; triangle < triangles.length / 3; triangle += 1) {
    const before = triangleUnitNormal(preFramePositions, triangles, triangle);
    const after = triangleUnitNormal(finalPositions, triangles, triangle);
    if (!before) preFrameDegenerateTriangleCount += 1;
    if (!after) finalDegenerateTriangleCount += 1;
    if (!before || !after) continue;
    const dot = Math.max(
      -1,
      Math.min(1, before[0] * after[0] + before[1] * after[1] + before[2] * after[2]),
    );
    comparedTriangleCount += 1;
    minimumPreFrameToFinalNormalDot = Math.min(minimumPreFrameToFinalNormalDot, dot);
    maximumNormalChangeRadians = Math.max(maximumNormalChangeRadians, Math.acos(dot));
    if (dot < 0) normalReversalCount += 1;
  }
  return Object.freeze({
    comparedTriangleCount,
    preFrameDegenerateTriangleCount,
    finalDegenerateTriangleCount,
    normalReversalCount,
    minimumPreFrameToFinalNormalDot:
      comparedTriangleCount === 0 ? null : minimumPreFrameToFinalNormalDot,
    maximumNormalChangeRadians: comparedTriangleCount === 0 ? null : maximumNormalChangeRadians,
  });
}

function continuationSeamPinWGate(options: {
  sourceInitial: Float32Array;
  preFrameCurrent: Float32Array;
  finalCurrent: Float32Array;
  finalPrevious: Float32Array;
  seamPairs: Uint32Array;
  pins: Uint32Array;
}) {
  const sourceBits = new CapturedUint32Array(
    options.sourceInitial.buffer,
    options.sourceInitial.byteOffset,
    options.sourceInitial.length,
  );
  const preFrameBits = new CapturedUint32Array(
    options.preFrameCurrent.buffer,
    options.preFrameCurrent.byteOffset,
    options.preFrameCurrent.length,
  );
  const finalCurrentBits = new CapturedUint32Array(
    options.finalCurrent.buffer,
    options.finalCurrent.byteOffset,
    options.finalCurrent.length,
  );
  const finalPreviousBits = new CapturedUint32Array(
    options.finalPrevious.buffer,
    options.finalPrevious.byteOffset,
    options.finalPrevious.length,
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
  for (let vertex = 0; vertex < PARTICLE_COUNT; vertex += 1) {
    const offset = vertex * 4;
    const inverseMass = options.sourceInitial[offset + 3]!;
    if (inverseMass === 0) zeroInverseMassVertexCount += 1;
    else if (Number.isFinite(inverseMass) && inverseMass > 0) positiveInverseMassVertexCount += 1;
    else throw new TypeError('Source inverse mass is invalid.');
    if (finalCurrentBits[offset + 3] !== sourceBits[offset + 3])
      currentInverseMassBitMismatchCount += 1;
    if (finalPreviousBits[offset + 3] !== sourceBits[offset + 3])
      previousInverseMassBitMismatchCount += 1;
    if (!pinSet.has(vertex)) continue;
    let currentExact = true;
    let previousExact = true;
    for (let component = 0; component < 4; component += 1) {
      currentExact &&= finalCurrentBits[offset + component] === preFrameBits[offset + component];
      previousExact &&= finalPreviousBits[offset + component] === preFrameBits[offset + component];
    }
    if (!currentExact) pinnedCurrentPositionBitMismatchCount += 1;
    if (!previousExact) pinnedPreviousPositionBitMismatchCount += 1;
    maximumPinnedCurrentDisplacementM = Math.max(
      maximumPinnedCurrentDisplacementM,
      Math.hypot(
        options.finalCurrent[offset]! - options.preFrameCurrent[offset]!,
        options.finalCurrent[offset + 1]! - options.preFrameCurrent[offset + 1]!,
        options.finalCurrent[offset + 2]! - options.preFrameCurrent[offset + 2]!,
      ),
    );
    maximumPinnedPreviousDisplacementM = Math.max(
      maximumPinnedPreviousDisplacementM,
      Math.hypot(
        options.finalPrevious[offset]! - options.preFrameCurrent[offset]!,
        options.finalPrevious[offset + 1]! - options.preFrameCurrent[offset + 1]!,
        options.finalPrevious[offset + 2]! - options.preFrameCurrent[offset + 2]!,
      ),
    );
  }
  const preFrameMaximumSeamGapM = maximumSeamGap(options.preFrameCurrent, options.seamPairs);
  const finalMaximumSeamGapM = maximumSeamGap(options.finalCurrent, options.seamPairs);
  return Object.freeze({
    preFrameMaximumSeamGapM,
    finalMaximumSeamGapM,
    seamGapDidNotRegress: finalMaximumSeamGapM <= preFrameMaximumSeamGapM,
    seamGapWithinPolicy: finalMaximumSeamGapM <= MAX_SEAM_GAP_M,
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

function continuumParams(offset: number, count: number, dtS: number): ArrayBuffer {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  view.setUint32(0, offset, true);
  view.setUint32(4, count, true);
  view.setFloat32(8, Math.fround(dtS), true);
  return buffer;
}

function createGpuBuffer(
  device: GPUDevice,
  tracked: GPUBuffer[],
  label: string,
  contents: ArrayBuffer | ArrayBufferView,
  usage: number,
): GPUBuffer {
  const bytes = copiedBytes(contents);
  const buffer = device.createBuffer({ label, size: bytes.byteLength, usage: usage | COPY_DST });
  device.queue.writeBuffer(buffer, 0, bytes);
  tracked.push(buffer);
  return buffer;
}

function createEmptyGpuBuffer(
  device: GPUDevice,
  tracked: GPUBuffer[],
  label: string,
  byteLength: number,
  usage: number,
): GPUBuffer {
  return createGpuBuffer(device, tracked, label, new CapturedUint8Array(byteLength), usage);
}

async function createPipeline(
  device: GPUDevice,
  descriptor: GPUShaderModuleDescriptor,
  entryPoint: string,
): Promise<GPUComputePipeline> {
  const module = device.createShaderModule(descriptor);
  const compilationInfo = await module.getCompilationInfo();
  const compilationErrors: string[] = [];
  for (const message of compilationInfo.messages)
    if (message.type === 'error')
      compilationErrors.push(`${message.lineNum}:${message.linePos} ${message.message}`);
  if (compilationErrors.length > 0)
    throw new Error(
      `${descriptor.label ?? 'WebGPU shader module'} compilation failed: ${compilationErrors.join(' | ')}`,
    );
  return device.createComputePipelineAsync({
    label: descriptor.label ? `${descriptor.label} pipeline` : undefined,
    layout: 'auto',
    compute: { module, entryPoint },
  });
}

function bindGroup(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  buffers: readonly GPUBuffer[],
): GPUBindGroup {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
  });
}

function exactCollisionClear(report: BetaSkirtRenderedBodyCollisionDiagnosticReportV1): boolean {
  return (
    report.status === 'signed-clearance-measured' &&
    report.blockers.length === 0 &&
    report.intersections.bodyGarmentTriangleIntersectionCount === 0 &&
    report.clearance.penetratingVertexCount === 0 &&
    report.clearance.unsafeVertexCount === 0 &&
    report.clearance.ambiguousSignVertexCount === 0 &&
    report.clearance.minimumSignedClearanceM !== null &&
    report.clearance.minimumSignedClearanceM >= EXACT_POSTGATE_MINIMUM_SIGNED_CLEARANCE_M
  );
}

function finalCollisionInput(
  source: BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  finalPositions3M: Float32Array,
  finalPositionsSha256: string,
): BetaSkirtRenderedBodyCollisionDiagnosticInputV1 {
  return {
    binding: {
      ...source.binding,
      garmentPositionsSha256: finalPositionsSha256,
    },
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

function collisionReplayRetainsSource(
  source: BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  replay: BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
): boolean {
  const bindingKeys = [
    'compositionGeneration',
    'snapshotGeneration',
    'modelId',
    'modelContentRevision',
    'inputFingerprint',
    'canonicalContentFingerprint',
    'basisKind',
    'posePresetId',
    'bodySourceRevision',
  ] as const;
  return (
    bindingKeys.every((key) => replay.binding[key] === source.binding[key]) &&
    bytesEqual(replay.bodyPositionsM, source.bodyPositionsM) &&
    bytesEqual(replay.bodyTriangles, source.bodyTriangles) &&
    bytesEqual(replay.garmentTriangles, source.garmentTriangles) &&
    replay.garmentUniformScale === source.garmentUniformScale &&
    replay.garmentTranslationM.every((value, index) => value === source.garmentTranslationM[index])
  );
}

function inputOwnersRemainLive(
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runtimeCanonicalSha256: string,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1,
  responseCanonicalSha256: string,
): boolean {
  return (
    projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSourceOwner)
      ?.reportCanonicalSha256 === runtimeCanonicalSha256 &&
    projectBetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseV1(responseOwner)
      ?.reportCanonicalSha256 === responseCanonicalSha256
  );
}

const CLAIMS = Object.freeze({
  exactCanonicalMediumWorkloadExecuted: true as const,
  d435ResponseIsSoleMutableStateInput: true as const,
  inputCurrentPreviousVelocityAndAllLambdasByteExactUploaded: true as const,
  oneUnchangedFrame35ScheduleExecuted: true as const,
  allSeamsActiveInPrimaryAndClosurePasses: true as const,
  exactActualBodyCollisionReplayExecuted: true as const,
  exactActualBodyTriangleMeshContactTailExecuted: true as const,
  analyticalCapsulesOrProxiesUsed: false as const,
  nearestWoundFacetSignIsLocalDiagnostic: true as const,
  contactCorrectionInjectsArtificialNormalVelocity: false as const,
  tangentialAndOutwardVelocityPreservedAtContact: true as const,
  exactCollisionReplayIsFinalArbiter: true as const,
  finalCurrentPreviousVelocityAndLambdasRetained: true as const,
  exactFrameContinuationStateBytesRetained: true as const,
  freshFrame35BodySelfSweptOrientationSeamWPostgatesExecuted: true as const,
  rehydratedFrame35: true as const,
  sameLiveGpuSessionFromFrame34: false as const,
  genuineSavedRuntimeWrapperAuthenticated: false as const,
  inputOwnersRevalidatedAcrossAsyncBoundaries: true as const,
  inputOwnersNotReturned: true as const,
  noFramePairOrHashAllowlistUsed: true as const,
  epsilonChanged: false as const,
  collisionPolicyChanged: false as const,
  continuationAuthority: false as const,
  collisionAuthority: false as const,
  runtimeAuthority: false as const,
  fitAuthority: false as const,
  productionAuthority: false as const,
});
export async function runBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8(
  canvas: HTMLCanvasElement,
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1,
  options: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOptionsV8 = {},
): Promise<BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationResultV8> {
  const projection = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSourceOwner);
  if (!projection)
    return Object.freeze({
      ok: false,
      code: 'source-owner-unavailable' as const,
      detail: 'A live canonical-medium runtime-source owner is required.',
    });
  const responseProjection =
    projectBetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseV1(responseOwner);
  if (!responseProjection)
    return Object.freeze({
      ok: false,
      code: 'saved-34-frame-carrier-response-owner-unavailable' as const,
      detail: 'A live accepted D-435 frame34 carrier-response owner is required.',
    });
  const runtimeCanonicalSha256 = projection.reportCanonicalSha256;
  const responseReport = responseOwner.report;
  const responseCanonicalSha256 = responseReport.seal.canonicalSha256;
  const inputState: FrameStateV8 = Object.freeze({
    current: new CapturedFloat32Array(responseProjection.candidateCurrentPositionsInvMassKg),
    previous: new CapturedFloat32Array(responseProjection.candidatePreviousPositionsInvMassKg),
    velocities: new CapturedFloat32Array(responseProjection.retainedVelocitiesMps),
    distanceLambdas: new CapturedFloat32Array(responseProjection.retainedDistanceLambdasKgM),
    seamLambdas: new CapturedFloat32Array(responseProjection.retainedSeamLambdasKgM),
    bendLambdas: new CapturedFloat32Array(responseProjection.retainedBendLambdasKgM2),
    continuumLambdas: new CapturedFloat32Array(responseProjection.retainedContinuumLambdasKgM),
    triangles: new CapturedUint32Array(responseProjection.normalizedTriangles),
  });
  if (
    responseProjection.reportCanonicalSha256 !== responseCanonicalSha256 ||
    responseReport.status !== 'frame34-carrier-response-postgates-clear-next-frame-unproven' ||
    responseReport.decision !==
      'PASS_BOUNDED_D419_FRAME34_CARRIER_RESPONSE_WITHOUT_NEXT_FRAME_AUTHORITY' ||
    responseReport.postgates.body.clear !== true ||
    responseReport.postgates.self.residualBlockingCount !== 0 ||
    responseReport.postgates.orientation.sourceDegenerateTriangleCount !== 0 ||
    responseReport.postgates.orientation.candidateDegenerateTriangleCount !== 0 ||
    responseReport.postgates.orientation.normalReversalCount !== 0 ||
    responseReport.postgates.seamPinW.seamGapDidNotRegress !== true ||
    responseReport.postgates.sweptBody.status !== 'clear' ||
    responseReport.claims.exactV7Frame34ResidualWitnessSetConsumed !== true ||
    responseReport.claims.exactV7Frame34CurrentPreviousVelocityAndLambdasConsumed !== true ||
    responseReport.claims.d419CarrierResponseExecuted !== true ||
    responseReport.claims.velocityAndLambdasRetainedUnchanged !== true ||
    responseReport.claims.sourceFrame34PairedRehydrationParityProven !== true ||
    responseReport.claims.nextFrameContinuationExecuted !== false ||
    responseReport.claims.runtimeAuthority !== false ||
    responseReport.bindings.runtimeSourceCanonicalSha256 !== runtimeCanonicalSha256 ||
    responseReport.bindings.normalizedTopologySha256 !==
      runtimeSourceOwner.report.bindings.normalizedTopologySha256 ||
    responseReport.bindings.seamPairsSha256 !==
      runtimeSourceOwner.report.bindings.seamPairsSha256 ||
    responseReport.bindings.pinnedVertexIndicesSha256 !==
      runtimeSourceOwner.report.bindings.pinnedVertexIndicesSha256
  )
    return Object.freeze({
      ok: false,
      code: 'saved-frame34-response-binding-mismatch' as const,
      detail: 'D-435 response is not exact-bound to the live canonical runtime.',
    });

  const sourceGpu = options.gpu ?? navigator.gpu;
  if (!sourceGpu)
    return Object.freeze({
      ok: false,
      code: 'unsupported-webgpu' as const,
      detail: 'WebGPU is unavailable in this browser.',
    });
  let prepared: ReturnType<typeof prepareRun>;
  try {
    throwIfAborted(options.signal);
    prepared = prepareRun(projection);
  } catch (error) {
    return Object.freeze({
      ok: false,
      code:
        error instanceof RunnerAbortError
          ? ('aborted' as const)
          : ('v5-contract-mismatch' as const),
      detail: error instanceof Error ? error.message : 'V5 runtime contract is invalid.',
    });
  }

  const validationMessages: string[] = [];
  const deviceLossMessages: string[] = [];
  const trackedBuffers: GPUBuffer[] = [];
  let session: XpbdDeviceSession | null = null;
  let lease: XpbdDeviceLease | null = null;
  let observation: Awaited<ReturnType<typeof executeGpuRun>> | null = null;
  let destroyedBufferCount = 0;
  let cleanupResult = {
    leaseReleased: false,
    sessionDisposed: false,
    contextUnconfigured: false,
    deviceDestroyed: false,
  };
  let pipelineIdentities: Awaited<ReturnType<typeof resolvePipelineIdentities>>;
  try {
    throwIfAborted(options.signal);
    await validateDigestAuthority();
    const inputCurrent3 = positions3(inputState.current);
    const inputDigests = await Promise.all([
      digestBytes(float32LeBytes(inputState.current)),
      digestBytes(float32LeBytes(inputCurrent3)),
      digestBytes(float32LeBytes(inputState.previous)),
      digestBytes(float32LeBytes(inputState.velocities)),
      digestBytes(float32LeBytes(inputState.distanceLambdas)),
      digestBytes(float32LeBytes(inputState.seamLambdas)),
      digestBytes(float32LeBytes(inputState.bendLambdas)),
      digestBytes(float32LeBytes(inputState.continuumLambdas)),
      digestBytes(uint32LeBytes(inputState.triangles)),
    ]);
    if (
      inputDigests[0] !== responseReport.bindings.candidateCurrentPositionsInvMassKgSha256 ||
      inputDigests[1] !== responseReport.bindings.candidateCurrentPositions3MSha256 ||
      inputDigests[2] !== responseReport.bindings.candidatePreviousPositionsInvMassKgSha256 ||
      inputDigests[3] !== responseReport.bindings.sourceVelocitiesMpsSha256 ||
      inputDigests[4] !== responseReport.bindings.sourceDistanceLambdasKgMSha256 ||
      inputDigests[5] !== responseReport.bindings.sourceSeamLambdasKgMSha256 ||
      inputDigests[6] !== responseReport.bindings.sourceBendLambdasKgM2Sha256 ||
      inputDigests[7] !== responseReport.bindings.sourceContinuumLambdasKgMSha256 ||
      inputDigests[8] !== responseReport.bindings.normalizedTopologySha256
    )
      return Object.freeze({
        ok: false,
        code: 'saved-frame34-response-binding-mismatch' as const,
        detail: 'D-435 projected mutable bytes differ from its sealed report.',
      });
    try {
      pipelineIdentities = await resolvePipelineIdentities();
    } catch (error) {
      return Object.freeze({
        ok: false,
        code: 'pipeline-identity-mismatch' as const,
        detail: error instanceof Error ? error.message : 'Pinned pipeline identity failed.',
      });
    }
    if (
      !inputOwnersRemainLive(
        runtimeSourceOwner,
        runtimeCanonicalSha256,
        responseOwner,
        responseCanonicalSha256,
      )
    )
      return Object.freeze({
        ok: false,
        code: 'saved-frame34-response-binding-mismatch' as const,
        detail: 'A D-438 input owner became unavailable during pipeline validation.',
      });
    session = await createXpbdDeviceSession(canvas, {
      gpu: sourceGpu,
      sessionIdFactory: options.sessionIdFactory ?? defaultSessionIdFactory,
      onUncapturedError: (message) => validationMessages.push(message),
      onDeviceLost: (info) => deviceLossMessages.push(`${info.reason}: ${info.message}`),
    });
    if (
      !inputOwnersRemainLive(
        runtimeSourceOwner,
        runtimeCanonicalSha256,
        responseOwner,
        responseCanonicalSha256,
      )
    )
      return Object.freeze({
        ok: false,
        code: 'saved-frame34-response-binding-mismatch' as const,
        detail: 'A D-438 input owner became unavailable during device acquisition.',
      });
    lease = session.acquireExclusive();
    observation = await executeGpuRun(
      lease.device,
      trackedBuffers,
      prepared,
      pipelineIdentities,
      inputState,
      options.signal,
    );
    if (
      !inputOwnersRemainLive(
        runtimeSourceOwner,
        runtimeCanonicalSha256,
        responseOwner,
        responseCanonicalSha256,
      )
    )
      return Object.freeze({
        ok: false,
        code: 'saved-frame34-response-binding-mismatch' as const,
        detail: 'A D-438 input owner became unavailable during GPU execution.',
      });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'WebGPU frame35 execution failed.';
    return Object.freeze({
      ok: false,
      code:
        error instanceof RunnerAbortError
          ? ('aborted' as const)
          : detail.startsWith('input-state-upload-mismatch:')
            ? ('input-state-upload-mismatch' as const)
            : ('gpu-execution-failed' as const),
      detail,
    });
  } finally {
    for (const buffer of trackedBuffers) {
      try {
        buffer.destroy();
        destroyedBufferCount += 1;
      } catch {
        // Best-effort cleanup continues through every owned buffer.
      }
    }
    if (lease) {
      lease.release();
      cleanupResult.leaseReleased = true;
    }
    if (session) {
      try {
        const disposed = await session.dispose();
        cleanupResult = {
          ...cleanupResult,
          sessionDisposed: true,
          contextUnconfigured: disposed.contextUnconfigured,
          deviceDestroyed: disposed.deviceDestroyed,
        };
      } catch {
        // Cleanup state remains explicit in the diagnostic result.
      }
    }
  }
  if (!observation)
    return Object.freeze({
      ok: false,
      code: 'gpu-execution-failed' as const,
      detail: 'GPU execution returned no bounded frame35 observation.',
    });
  if (
    !inputOwnersRemainLive(
      runtimeSourceOwner,
      runtimeCanonicalSha256,
      responseOwner,
      responseCanonicalSha256,
    )
  )
    return Object.freeze({
      ok: false,
      code: 'saved-frame34-response-binding-mismatch' as const,
      detail: 'A D-438 input owner became unavailable before post-GPU validation.',
    });

  const finalPositions = observation.final.positions;
  const finalPreviousPositions = observation.retainedState.previousPositions;
  const finalVelocities = observation.retainedState.velocities;
  const finalDistanceLambdas = observation.retainedState.distanceLambdas;
  const finalSeamLambdas = observation.retainedState.seamLambdas;
  const finalBendLambdas = observation.retainedState.bendLambdas;
  const finalContinuumLambdas = observation.retainedState.continuumLambdas;
  const velocityDiagnostics = observation.final.velocityDiagnostics;
  const bendInvalidCount = observation.final.bendInvalidCount;
  const continuumStatuses = observation.final.continuumStatuses;
  const contactDiagnostics = observation.final.contactDiagnostics;
  const state = inspectFinalState(
    prepared,
    finalPositions,
    velocityDiagnostics,
    bendInvalidCount,
    continuumStatuses,
    contactDiagnostics,
  );
  if (
    !state.valid ||
    validationMessages.length !== 0 ||
    deviceLossMessages.length !== 0 ||
    !cleanupResult.leaseReleased ||
    !cleanupResult.sessionDisposed ||
    !cleanupResult.contextUnconfigured ||
    !cleanupResult.deviceDestroyed
  )
    return Object.freeze({
      ok: false,
      code: 'invalid-gpu-state' as const,
      detail:
        state.detail ||
        `GPU lifecycle failed closed (validation=${validationMessages.length}, loss=${deviceLossMessages.length}).`,
    });
  const sourceBits = new CapturedUint32Array(
    prepared.physical.buffer,
    prepared.physical.byteOffset,
    prepared.physical.length,
  );
  const currentBits = new CapturedUint32Array(
    finalPositions.buffer,
    finalPositions.byteOffset,
    finalPositions.length,
  );
  const previousBits = new CapturedUint32Array(
    finalPreviousPositions.buffer,
    finalPreviousPositions.byteOffset,
    finalPreviousPositions.length,
  );
  const velocityBits = new CapturedUint32Array(
    finalVelocities.buffer,
    finalVelocities.byteOffset,
    finalVelocities.length,
  );
  let currentInverseMassBitsExactSource = true;
  let previousInverseMassBitsExactSource = true;
  let velocityWComponentsPositiveZero = true;
  let allCurrentPreviousVelocityFinite = true;
  for (let vertex = 0; vertex < PARTICLE_COUNT; vertex += 1) {
    currentInverseMassBitsExactSource &&=
      currentBits[vertex * 4 + 3] === sourceBits[vertex * 4 + 3];
    previousInverseMassBitsExactSource &&=
      previousBits[vertex * 4 + 3] === sourceBits[vertex * 4 + 3];
    velocityWComponentsPositiveZero &&= velocityBits[vertex * 4 + 3] === 0;
    for (let component = 0; component < 4; component += 1)
      allCurrentPreviousVelocityFinite &&=
        Number.isFinite(finalPositions[vertex * 4 + component]) &&
        Number.isFinite(finalPreviousPositions[vertex * 4 + component]) &&
        Number.isFinite(finalVelocities[vertex * 4 + component]);
  }
  let allLambdasFinite = true;
  for (const lambdas of [
    finalDistanceLambdas,
    finalSeamLambdas,
    finalBendLambdas,
    finalContinuumLambdas,
  ])
    for (let index = 0; index < lambdas.length; index += 1)
      allLambdasFinite &&= Number.isFinite(lambdas[index]);
  if (
    finalPositions.length !== PARTICLE_COUNT * 4 ||
    finalPreviousPositions.length !== PARTICLE_COUNT * 4 ||
    finalVelocities.length !== PARTICLE_COUNT * 4 ||
    finalDistanceLambdas.length !== DISTANCE_COUNT ||
    finalSeamLambdas.length !== SEAM_COUNT ||
    finalBendLambdas.length !== BEND_COUNT ||
    finalContinuumLambdas.length !== CONTINUUM_LAMBDA_FLOAT_COUNT ||
    !bytesEqual(prepared.triangles, inputState.triangles) ||
    !currentInverseMassBitsExactSource ||
    !previousInverseMassBitsExactSource ||
    !velocityWComponentsPositiveZero ||
    !allCurrentPreviousVelocityFinite ||
    !allLambdasFinite
  )
    return Object.freeze({
      ok: false,
      code: 'state-retention-invalid' as const,
      detail: 'Frame35 state failed shape, topology, W, or finite-value validation.',
    });

  const inputPositions3M = positions3(inputState.current);
  const finalPositions3M = positions3(finalPositions);
  let digests: readonly string[];
  try {
    digests = await Promise.all([
      digestBytes(float32LeBytes(prepared.sourcePositions3M)),
      digestBytes(float32LeBytes(inputState.current)),
      digestBytes(float32LeBytes(inputPositions3M)),
      digestBytes(float32LeBytes(inputState.previous)),
      digestBytes(float32LeBytes(inputState.velocities)),
      digestBytes(float32LeBytes(inputState.distanceLambdas)),
      digestBytes(float32LeBytes(inputState.seamLambdas)),
      digestBytes(float32LeBytes(inputState.bendLambdas)),
      digestBytes(float32LeBytes(inputState.continuumLambdas)),
      digestBytes(
        concatenateBytes([
          float32LeBytes(inputState.current),
          float32LeBytes(inputState.previous),
          float32LeBytes(inputState.velocities),
          float32LeBytes(inputState.distanceLambdas),
          float32LeBytes(inputState.seamLambdas),
          float32LeBytes(inputState.bendLambdas),
          float32LeBytes(inputState.continuumLambdas),
        ]),
      ),
      digestBytes(float32LeBytes(finalPositions)),
      digestBytes(float32LeBytes(finalPositions3M)),
      digestBytes(float32LeBytes(finalPreviousPositions)),
      digestBytes(float32LeBytes(finalVelocities)),
      digestBytes(float32LeBytes(finalDistanceLambdas)),
      digestBytes(float32LeBytes(finalSeamLambdas)),
      digestBytes(float32LeBytes(finalBendLambdas)),
      digestBytes(float32LeBytes(finalContinuumLambdas)),
      digestBytes(
        concatenateBytes([
          float32LeBytes(finalPositions),
          float32LeBytes(finalPreviousPositions),
          float32LeBytes(finalVelocities),
          float32LeBytes(finalDistanceLambdas),
          float32LeBytes(finalSeamLambdas),
          float32LeBytes(finalBendLambdas),
          float32LeBytes(finalContinuumLambdas),
        ]),
      ),
      digestBytes(float32LeBytes(prepared.bodyPositions)),
      digestBytes(uint32LeBytes(prepared.bodyTriangles)),
    ]);
  } catch (error) {
    return Object.freeze({
      ok: false,
      code: 'collision-diagnostic-failed' as const,
      detail: error instanceof Error ? error.message : 'Frame35 state hashing failed.',
    });
  }
  const [
    sourcePositionsSha256,
    inputCurrentSha256,
    inputCurrent3Sha256,
    inputPreviousSha256,
    inputVelocitySha256,
    inputDistanceSha256,
    inputSeamSha256,
    inputBendSha256,
    inputContinuumSha256,
    inputAggregateSha256,
    finalPositionsInvMassKgSha256,
    finalPositionsSha256,
    finalPreviousPositionsInvMassKgSha256,
    finalVelocitiesMpsSha256,
    finalDistanceLambdasKgMSha256,
    finalSeamLambdasKgMSha256,
    finalBendLambdasKgM2Sha256,
    finalContinuumLambdasKgMSha256,
    retainedDynamicStateAggregateSha256,
    bodyPositions3MSha256,
    bodyTrianglesSha256,
  ] = digests;
  if (
    sourcePositionsSha256 !== runtimeSourceOwner.report.bindings.sourcePositions3MSha256 ||
    sourcePositionsSha256 !== prepared.collisionInput.binding.garmentPositionsSha256 ||
    inputCurrentSha256 !== responseReport.bindings.candidateCurrentPositionsInvMassKgSha256 ||
    inputCurrent3Sha256 !== responseReport.bindings.candidateCurrentPositions3MSha256 ||
    inputPreviousSha256 !== responseReport.bindings.candidatePreviousPositionsInvMassKgSha256 ||
    inputVelocitySha256 !== responseReport.bindings.sourceVelocitiesMpsSha256 ||
    inputDistanceSha256 !== responseReport.bindings.sourceDistanceLambdasKgMSha256 ||
    inputSeamSha256 !== responseReport.bindings.sourceSeamLambdasKgMSha256 ||
    inputBendSha256 !== responseReport.bindings.sourceBendLambdasKgM2Sha256 ||
    inputContinuumSha256 !== responseReport.bindings.sourceContinuumLambdasKgMSha256
  )
    return Object.freeze({
      ok: false,
      code: 'saved-frame34-response-binding-mismatch' as const,
      detail: 'Frame35 input/runtime bytes differ from their sealed owners.',
    });

  const collisionInput = finalCollisionInput(
    prepared.collisionInput,
    finalPositions3M,
    finalPositionsSha256!,
  );
  if (
    !collisionReplayRetainsSource(prepared.collisionInput, collisionInput) ||
    collisionInput.binding.garmentPositionsSha256 !== finalPositionsSha256 ||
    finalPositionsSha256 === inputCurrent3Sha256
  )
    return Object.freeze({
      ok: false,
      code: 'invalid-gpu-state' as const,
      detail: 'Frame35 collision replay did not retain source context or prove motion.',
    });

  let collisionReport: BetaSkirtRenderedBodyCollisionDiagnosticReportV1;
  let qualityReport: BetaSkirtCoherentEnvelopeQualityReportV1;
  try {
    qualityReport = evaluateBetaSkirtCoherentEnvelopeQualityV1({
      sourcePositionsM: new CapturedFloat32Array(inputPositions3M),
      sourceTriangles: new CapturedUint32Array(prepared.triangles),
      candidatePositionsM: new CapturedFloat32Array(finalPositions3M),
      candidateTriangles: new CapturedUint32Array(prepared.triangles),
    });
    collisionReport = await evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1(collisionInput, {
      crypto: cryptoShim(),
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      code: 'collision-diagnostic-failed' as const,
      detail: error instanceof Error ? error.message : 'Frame35 post-frame replay failed.',
    });
  }
  if (
    !inputOwnersRemainLive(
      runtimeSourceOwner,
      runtimeCanonicalSha256,
      responseOwner,
      responseCanonicalSha256,
    )
  )
    return Object.freeze({
      ok: false,
      code: 'saved-frame34-response-binding-mismatch' as const,
      detail: 'A D-438 input owner became unavailable during post-frame replay.',
    });

  let selfGate: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationReportV8['selfOrientation'];
  let orientationGate: ReturnType<typeof continuationOrientation>;
  let seamPinWGate: ReturnType<typeof continuationSeamPinWGate>;
  let sweptBodyGate: BetaSkirtExactSweptBodyAuditReportV1;
  try {
    const oracle = validateMeasurementSurfaceSelfIntersectionV1(
      finalPositions3M,
      prepared.triangles,
      SELF_POLICY,
    );
    if (oracle.intersectionCount > MAX_RAW_INTERSECTION_COUNT)
      throw new Error(`Frame35 raw self-intersection cap exceeded (${oracle.intersectionCount}).`);
    const witnesses: BetaSkirtCanonicalMediumContactPairWitnessV2[] = [];
    for (const pair of oracle.intersections) {
      throwIfAborted(options.signal);
      witnesses.push(
        await evaluateBetaSkirtCanonicalMediumConfinedContactPairV2({
          positions: finalPositions3M,
          triangles: prepared.triangles,
          seamPairs: prepared.seamPairs,
          pair,
          epsilonM: oracle.epsilonM,
          vertexCount: PARTICLE_COUNT,
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
    selfGate = Object.freeze({
      oracleVersion: MEASUREMENT_SURFACE_SELF_INTERSECTION_V1,
      epsilonM: oracle.epsilonM,
      rawIntersectionCount: oracle.intersectionCount,
      rawKindCounts: selfKindCounts(oracle.intersections),
      excludedConfinedAuthenticatedAoSeamCount: excluded.length,
      residualBlockingCount: residual.length,
      residualKindCounts: witnessKindCounts(residual),
      carrierAdjacentTouchingResidualCount: carrierAdjacent.length,
      unsupportedResidualCount: residual.length - carrierAdjacent.length,
      exactRawEqualsExcludedPlusResidual: true as const,
      retainedResidualWitnesses: Object.freeze(residual.slice(0, MAX_RETAINED_WITNESSES)),
    });
    orientationGate = continuationOrientation(
      inputPositions3M,
      finalPositions3M,
      prepared.triangles,
    );
    seamPinWGate = continuationSeamPinWGate({
      sourceInitial: prepared.physical,
      preFrameCurrent: inputState.current,
      finalCurrent: finalPositions,
      finalPrevious: finalPreviousPositions,
      seamPairs: prepared.seamPairs,
      pins: prepared.pins,
    });
    sweptBodyGate = evaluateBetaSkirtExactSweptBodyAuditV1({
      previousPositionsInvMass: finalPreviousPositions,
      currentPositionsInvMass: finalPositions,
      bodyPositionsM: prepared.bodyPositions,
      bodyTriangles: prepared.bodyTriangles,
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      code: 'post-frame-self-orientation-swept-gate-failed' as const,
      detail:
        error instanceof Error ? error.message : 'Frame35 structural postgates failed closed.',
    });
  }

  const collisionClear = exactCollisionClear(collisionReport);
  const qualityClear = qualityReport.blockers.length === 0;
  const contactMaximumCorrectionM = positiveFloatFromBits(contactDiagnostics[4]!);
  const contactCorrectionCapHit =
    contactMaximumCorrectionM >= Math.fround(CONTACT_MAXIMUM_CORRECTION_M);
  if (contactCorrectionCapHit)
    return Object.freeze({
      ok: false,
      code: 'contact-correction-cap-hit' as const,
      detail: 'Frame35 exact-mesh contact correction reached its unchanged policy cap.',
    });
  const seamPinWClear =
    seamPinWGate.seamGapWithinPolicy &&
    seamPinWGate.currentInverseMassBitMismatchCount === 0 &&
    seamPinWGate.previousInverseMassBitMismatchCount === 0 &&
    seamPinWGate.pinnedCurrentPositionBitMismatchCount === 0 &&
    seamPinWGate.pinnedPreviousPositionBitMismatchCount === 0 &&
    seamPinWGate.zeroInverseMassVertexCount === PIN_COUNT &&
    seamPinWGate.positiveInverseMassVertexCount === PARTICLE_COUNT - PIN_COUNT;
  const orientationClear =
    orientationGate.preFrameDegenerateTriangleCount === 0 &&
    orientationGate.finalDegenerateTriangleCount === 0 &&
    orientationGate.normalReversalCount === 0;
  const blockers: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationBlockerV8[] = [
    ...(!collisionClear ? (['frame35-exact-body-gate-failed'] as const) : []),
    ...(!qualityClear ? (['frame35-structural-quality-gate-failed'] as const) : []),
    ...(selfGate.residualBlockingCount > 0
      ? (['frame35-residual-self-contact-remains'] as const)
      : []),
    ...(!orientationClear ? (['frame35-orientation-gate-failed'] as const) : []),
    ...(!seamPinWClear ? (['frame35-seam-pin-w-gate-failed'] as const) : []),
    ...(sweptBodyGate.status !== 'clear' ? (['frame35-swept-body-gate-failed'] as const) : []),
    'multi-frame-settle-fit-runtime-production-authority-not-established',
  ];
  const postgatesClear = blockers.length === 1;
  const reportWithoutStableEvidence = {
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_35_FRAME_CONTINUATION_REPORT_V8,
    status: postgatesClear
      ? ('saved-35-frame-rehydrated-postgates-clear' as const)
      : ('saved-35-frame-rehydrated-postgate-blocked' as const),
    decision: postgatesClear
      ? ('PASS_EXACT_REHYDRATED_FRAME35_WITHOUT_CONTINUATION_AUTHORITY' as const)
      : ('BLOCK_FRAME35_POSTGATES_AFTER_EXACT_REHYDRATION' as const),
    bindings: Object.freeze({
      runtimeSourceCanonicalSha256: runtimeCanonicalSha256,
      sourceFrame34CarrierResponseCanonicalSha256: responseCanonicalSha256,
      normalizedV5AggregateSha256: projection.normalizedV5.seal.aggregateSha256,
      sourcePositions3MSha256: sourcePositionsSha256,
      normalizedTopologySha256: responseReport.bindings.normalizedTopologySha256,
      seamPairsSha256: responseReport.bindings.seamPairsSha256,
      pinnedVertexIndicesSha256: responseReport.bindings.pinnedVertexIndicesSha256,
      inputCurrentPositionsInvMassKgSha256: inputCurrentSha256,
      inputCurrentPositions3MSha256: inputCurrent3Sha256,
      inputPreviousPositionsInvMassKgSha256: inputPreviousSha256,
      inputVelocitiesMpsSha256: inputVelocitySha256,
      inputDistanceLambdasKgMSha256: inputDistanceSha256,
      inputSeamLambdasKgMSha256: inputSeamSha256,
      inputBendLambdasKgM2Sha256: inputBendSha256,
      inputContinuumLambdasKgMSha256: inputContinuumSha256,
      inputDynamicStateAggregateSha256: inputAggregateSha256,
      finalPositionsInvMassKgSha256,
      finalPositions3MSha256: finalPositionsSha256,
      finalCollisionBindingPositionsSha256: collisionInput.binding.garmentPositionsSha256,
      finalCollisionContentFingerprintSha256: collisionReport.contentFingerprintSha256,
      finalPreviousPositionsInvMassKgSha256,
      finalVelocitiesMpsSha256,
      finalDistanceLambdasKgMSha256,
      finalSeamLambdasKgMSha256,
      finalBendLambdasKgM2Sha256,
      finalContinuumLambdasKgMSha256,
      retainedDynamicStateAggregateSha256,
      bodyPositions3MSha256,
      bodyTrianglesSha256,
      contactKernelSourceSha256: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_SOURCE_SHA256_V2,
    }),
    config: prepared.reportConfig,
    workload: prepared.reportWorkload,
    execution: Object.freeze({
      frameNumber: 35 as const,
      frameSubmissionCount: 1 as const,
      readbackSubmissionCount: 2 as const,
      totalComputeDispatchCount: prepared.dispatchesPerFrame,
      positionReadbackByteLength: finalPositions.byteLength,
      diagnosticReadbackByteLength:
        velocityDiagnostics.byteLength +
        4 +
        continuumStatuses.byteLength +
        contactDiagnostics.byteLength,
      retainedDynamicStateReadbackByteLength: observation.retainedStateReadbackBytes,
      inputStateVerificationReadbackByteLength: observation.inputStateByteLength,
      totalReadbackByteLength: observation.totalReadbackBytes,
      invalidVelocityStateCount: velocityDiagnostics[0]!,
      numericInvalidVelocityStateCount: velocityDiagnostics[1]!,
      outOfDomainVelocityStateCount: velocityDiagnostics[2]!,
      bendInvalidConstraintCount: bendInvalidCount,
      continuumNonzeroStatusCount: state.continuumNonzeroStatusCount,
      contactDispatchCount: 1 as const,
      contactCorrectedParticleEventCount: contactDiagnostics[0]!,
      contactInvalidParticleCount: contactDiagnostics[1]!,
      contactDegenerateTriangleVisitCount: contactDiagnostics[2]!,
      contactOutOfRangeTriangleVisitCount: contactDiagnostics[3]!,
      contactMaximumCorrectionM,
      contactMaximumPenetrationM: positiveFloatFromBits(contactDiagnostics[5]!),
      contactMinimumCorrectedParticleIndex:
        contactDiagnostics[6] === 0xffff_ffff ? null : contactDiagnostics[6]!,
      contactInwardNormalClampEventCount: contactDiagnostics[7]!,
      contactMaximumRemovedInwardNormalDeltaM: positiveFloatFromBits(contactDiagnostics[8]!),
      contactCorrectionCapHit,
      frameExecutionWallTimeMs: observation.frameExecutionWallTimeMs,
      validationMessages: Object.freeze([...validationMessages]),
      deviceLossMessages: Object.freeze([...deviceLossMessages]),
    }),
    retainedState: Object.freeze({
      currentPositionsInvMassKgFloatCount: 2320 as const,
      previousPositionsInvMassKgFloatCount: 2320 as const,
      velocitiesMpsFloatCount: 2320 as const,
      distanceLambdasKgMFloatCount: DISTANCE_COUNT,
      seamLambdasKgMFloatCount: SEAM_COUNT,
      bendLambdasKgM2FloatCount: BEND_COUNT,
      continuumLambdasKgMFloatCount: CONTINUUM_LAMBDA_FLOAT_COUNT,
      totalByteLength: 53512 as const,
      inputStateUploadByteExact: true as const,
      currentInverseMassBitsExactSource: true as const,
      previousInverseMassBitsExactSource: true as const,
      velocityWComponentsPositiveZero: true as const,
      allCurrentPreviousVelocityFinite: true as const,
      allLambdasFinite: true as const,
      exactFrameContinuationStateBytesRetained: true as const,
    }),
    continuation: Object.freeze({
      sourceFrameNumber: 34 as const,
      executedFrameNumber: 35 as const,
      d435ResponseIsSoleMutableStateInput: true as const,
      inputStateUploadByteExact: true as const,
      inputStateByteLength: 53512 as const,
      oneUnchangedFrameScheduleExecuted: true as const,
      rehydratedFrame35: true as const,
      sameLiveGpuSessionFromFrame34: false as const,
      frameExecutionWallTimeMs: observation.frameExecutionWallTimeMs,
    }),
    observations: Object.freeze({
      everyPositionFinite: state.everyPositionFinite,
      everyInverseMassBitExact: state.everyInverseMassBitExact,
      pinnedParticleCountBitExact: state.pinnedParticleCountBitExact,
      sourceAndFinalPositionsDiffer: inputCurrent3Sha256 !== finalPositionsSha256,
      finalHashBoundToCollisionInput:
        collisionInput.binding.garmentPositionsSha256 === finalPositionsSha256,
      staleSourceCollisionHashRejectedByConstruction:
        finalPositionsSha256 !== inputCurrent3Sha256 &&
        collisionInput.binding.garmentPositionsSha256 !== inputCurrent3Sha256,
      inputMaximumSeamGapM: maximumSeamGap(inputState.current, prepared.seamPairs),
      finalMaximumSeamGapM: state.finalMaximumSeamGapM,
      seamGapLimitM: MAX_SEAM_GAP_M,
      seamGapBounded: state.finalMaximumSeamGapM <= MAX_SEAM_GAP_M,
    }),
    quality: qualityReport,
    collision: Object.freeze({
      status: collisionReport.status,
      exactActualBodyGateClear: collisionClear,
      blockers: Object.freeze([...collisionReport.blockers]),
      bodyGarmentTriangleIntersectionCount:
        collisionReport.intersections.bodyGarmentTriangleIntersectionCount,
      minimumSignedClearanceM: collisionReport.clearance.minimumSignedClearanceM,
      penetratingVertexCount: collisionReport.clearance.penetratingVertexCount,
      unsafeVertexCount: collisionReport.clearance.unsafeVertexCount,
      ambiguousSignVertexCount: collisionReport.clearance.ambiguousSignVertexCount,
    }),
    selfOrientation: selfGate,
    orientation: orientationGate,
    seamPinW: seamPinWGate,
    sweptBody: sweptBodyGate,
    postgatesClear,
    blockers: Object.freeze(blockers),
    cleanup: Object.freeze({ destroyedBufferCount, ...cleanupResult }),
    claims: CLAIMS,
  };
  const stablePayload = Object.freeze({
    ...reportWithoutStableEvidence,
    bindings: Object.freeze({
      ...reportWithoutStableEvidence.bindings,
      runtimeSourceCanonicalSha256: undefined,
      sourceFrame34CarrierResponseCanonicalSha256: undefined,
    }),
    execution: Object.freeze({
      ...reportWithoutStableEvidence.execution,
      frameExecutionWallTimeMs: undefined,
    }),
    continuation: Object.freeze({
      ...reportWithoutStableEvidence.continuation,
      frameExecutionWallTimeMs: undefined,
    }),
    cleanup: undefined,
  });
  const stableEvidence = Object.freeze({
    canonicalSha256: await digestBytes(
      capturedReflectApply(capturedTextEncode, capturedTextEncoder, [
        `beta-skirt-canonical-medium-saved-webgpu-35-frame-continuation-stable-v8\0${capturedJsonStringify(stablePayload)}`,
      ]) as Uint8Array,
    ),
    excludesRunnerTimingAndVolatileOwnerSeals: true as const,
  });
  const reportWithoutSeal = Object.freeze({ ...reportWithoutStableEvidence, stableEvidence });
  const reportSeal = await digestBytes(
    capturedReflectApply(capturedTextEncode, capturedTextEncoder, [
      capturedJsonStringify(reportWithoutSeal),
    ]) as Uint8Array,
  );
  if (
    !inputOwnersRemainLive(
      runtimeSourceOwner,
      runtimeCanonicalSha256,
      responseOwner,
      responseCanonicalSha256,
    )
  )
    return Object.freeze({
      ok: false,
      code: 'saved-frame34-response-binding-mismatch' as const,
      detail: 'A D-438 input owner became unavailable while sealing the V8 report.',
    });
  const report: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationReportV8 = Object.freeze({
    ...reportWithoutSeal,
    stableEvidence,
    seal: Object.freeze({
      algorithm: 'SHA-256' as const,
      canonicalSha256: reportSeal,
      authority: 'unsigned-saved-35-frame-rehydrated-continuation-diagnostic-only' as const,
    }),
  });
  const owner = Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_35_FRAME_CONTINUATION_OWNER_V8,
    report,
  }) as BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOwnerV8;
  owners.set(owner, {
    finalCurrentPositionsInvMassKg: new CapturedFloat32Array(finalPositions),
    finalCurrentPositions3M: new CapturedFloat32Array(finalPositions3M),
    finalPreviousPositionsInvMassKg: new CapturedFloat32Array(finalPreviousPositions),
    finalVelocitiesMps: new CapturedFloat32Array(finalVelocities),
    finalDistanceLambdasKgM: new CapturedFloat32Array(finalDistanceLambdas),
    finalSeamLambdasKgM: new CapturedFloat32Array(finalSeamLambdas),
    finalBendLambdasKgM2: new CapturedFloat32Array(finalBendLambdas),
    finalContinuumLambdasKgM: new CapturedFloat32Array(finalContinuumLambdas),
    normalizedTriangles: new CapturedUint32Array(prepared.triangles),
  });
  if (!postgatesClear)
    return Object.freeze({
      ok: false as const,
      code: 'diagnostic-failed' as const,
      detail: `Frame35 postgates blocked: ${blockers.join(',')}.`,
      owner,
      report,
    });
  return Object.freeze({ ok: true as const, owner, report });
}
function prepareRun(
  projection: NonNullable<ReturnType<typeof projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1>>,
) {
  const normalizedV5 = capturedStructuredClone(projection.normalizedV5);
  const simulation = normalizedV5.simulation;
  const physical = new CapturedFloat32Array(projection.initialPhysicalPositionsInvMassKg);
  const triangles = new CapturedUint32Array(projection.normalizedTriangles);
  const seamPairs = new CapturedUint32Array(projection.seamPairs);
  const pins = new CapturedUint32Array(projection.pinnedWaistVertexIndices);
  const distance = simulation.constraints.distance;
  const seam = simulation.constraints.seam;
  const bend = simulation.constraints.bend;
  const continuum = simulation.constraints.continuumStrain;
  const material = decodeClothMaterialGpuV1(simulation.material.materialRecords, 0);
  const manifest = simulation.manifest;

  if (
    manifest.particleCount !== PARTICLE_COUNT ||
    manifest.triangleCount !== TRIANGLE_COUNT ||
    manifest.distanceConstraintCount !== DISTANCE_COUNT ||
    manifest.distanceColorCount !== 9 ||
    manifest.seamConstraintCount !== SEAM_COUNT ||
    manifest.seamColorCount !== 1 ||
    manifest.bendConstraintCount !== BEND_COUNT ||
    manifest.bendColorCount !== 18 ||
    manifest.continuumConstraintCount !== CONTINUUM_COUNT ||
    manifest.continuumColorCount !== 10 ||
    manifest.pinnedParticleCount !== PIN_COUNT ||
    simulation.material.manifest.materialCount !== 1 ||
    physical.length !== PARTICLE_COUNT * 4 ||
    triangles.length !== TRIANGLE_COUNT * 3 ||
    seamPairs.length !== SEAM_COUNT * 2 ||
    pins.length !== PIN_COUNT
  )
    throw new Error('Canonical-medium 580/912/1490/34/1246/912 workload counts drifted.');
  if (
    simulation.material.manifest.solver.dtS !== FIXED_DT_S ||
    simulation.material.manifest.solver.iterations !== FIXED_ITERATIONS
  )
    throw new Error('V5 solver dt/iteration contract differs from 1/120 s and eight iterations.');
  if (
    !Number.isFinite(material.bendComplianceInvNm.warp) ||
    material.bendComplianceInvNm.warp < 0 ||
    !Number.isFinite(material.bendComplianceInvNm.weft) ||
    material.bendComplianceInvNm.weft < 0 ||
    !Number.isFinite(material.velocityRetentionPerStep) ||
    material.velocityRetentionPerStep < 0 ||
    material.velocityRetentionPerStep > 1
  )
    throw new Error('V5 material records do not define finite bend/damping runtime values.');
  const bendComplianceInvNm = Math.max(
    material.bendComplianceInvNm.warp,
    material.bendComplianceInvNm.weft,
  );

  const distancePairs = new CapturedUint32Array(distance.vertexPairs);
  const distanceRestLengths = new CapturedFloat32Array(distance.restLengthsM);
  const distanceLambdas = new CapturedFloat32Array(DISTANCE_COUNT);
  if (
    distancePairs.length !== DISTANCE_COUNT * 2 ||
    distanceRestLengths.length !== DISTANCE_COUNT ||
    distance.colorRanges.length !== 9
  )
    throw new Error('Distance constraint buffers drifted.');
  let expectedDistanceOffset = 0;
  const distanceSchedule = distance.colorRanges.map((range, color) => {
    if (
      range.color !== color ||
      range.offset !== expectedDistanceOffset ||
      range.count < 1 ||
      range.offset + range.count > DISTANCE_COUNT
    )
      throw new Error('Distance color ranges are not exact, contiguous, and nonempty.');
    expectedDistanceOffset += range.count;
    return Object.freeze({
      offset: range.offset,
      count: range.count,
      workgroups: xpbdDistanceColorWorkgroupsV1(range.count),
      params: encodeXpbdDistanceColorParamsV1({
        constraintOffset: range.offset,
        constraintCount: range.count,
        complianceMPerN: DISTANCE_COMPLIANCE_M_PER_N,
        dtS: FIXED_DT_S,
      }),
    });
  });
  if (expectedDistanceOffset !== DISTANCE_COUNT)
    throw new Error('Distance colors do not cover all constraints.');

  const seamVertexPairs = new CapturedUint32Array(seam.vertexPairs);
  const seamTargetLengths = new CapturedFloat32Array(seam.targetLengthsM);
  const seamLambdas = new CapturedFloat32Array(SEAM_COUNT);
  const seamActivationRanks = new CapturedUint32Array(SEAM_COUNT);
  seam.activationOrder.forEach((constraintOffset, rank) => {
    seamActivationRanks[constraintOffset] = rank;
  });
  const seamColorRanges = new CapturedUint32Array(seam.colorRanges);
  const seamSchedule = createXpbdSeamSolveColorScheduleV1({
    particleCount: PARTICLE_COUNT,
    totalConstraintCount: SEAM_COUNT,
    activeConstraintCount: SEAM_COUNT,
    complianceMPerN: SEAM_COMPLIANCE_M_PER_N,
    dtS: FIXED_DT_S,
    vertexPairs: seamVertexPairs,
    targetLengthsM: seamTargetLengths,
    lambdasKgM: seamLambdas,
    activationRanks: seamActivationRanks,
    colorRanges: seamColorRanges,
  }).map((range) =>
    Object.freeze({
      ...range,
      params: packXpbdSeamSolveColorParamsV1(range.constraintOffset, range.constraintCount),
    }),
  );
  const seamActivationParams = packXpbdSeamSolveActivationParamsV1({
    totalConstraintCount: SEAM_COUNT,
    activeConstraintCount: SEAM_COUNT,
    complianceMPerN: SEAM_COMPLIANCE_M_PER_N,
    dtS: FIXED_DT_S,
  });

  const bendVertexQuads = new CapturedUint32Array(bend.vertexQuads);
  const bendRestAngles = new CapturedFloat32Array(bend.restAnglesRad);
  const bendLambdas = new CapturedFloat32Array(BEND_COUNT);
  const bendColorRanges = new CapturedUint32Array(bend.colorRanges);
  const bendSchedule = createXpbdEmbeddedScalarBendColorScheduleV1({
    particleCount: PARTICLE_COUNT,
    constraintCount: BEND_COUNT,
    complianceInvNm: bendComplianceInvNm,
    dtS: FIXED_DT_S,
    vertexQuads: bendVertexQuads,
    restAnglesRad: bendRestAngles,
    lambdasKgM2: bendLambdas,
    colorRanges: bendColorRanges,
  }).map((range) =>
    Object.freeze({
      ...range,
      params: packXpbdEmbeddedScalarBendColorParamsV1({
        constraintOffset: range.constraintOffset,
        constraintCount: range.constraintCount,
        complianceInvNm: bendComplianceInvNm,
        dtS: FIXED_DT_S,
      }),
    }),
  );

  const continuumTriangleIndices = copiedBuffer(continuum.triangleIndices);
  const continuumRestFrames = copiedBuffer(continuum.triangleRestFrames);
  const continuumMaterialIndices = new CapturedUint32Array(continuum.materialIndices);
  const continuumMaterialRecords = copiedBuffer(continuum.materialRecords);
  const continuumLambdas = new CapturedFloat32Array(continuum.lambdasKgM);
  const continuumColorRanges = new CapturedUint32Array(continuum.colorRanges);
  if (
    continuumTriangleIndices.byteLength !== CONTINUUM_COUNT * 16 ||
    continuumRestFrames.byteLength !== CONTINUUM_COUNT * 32 ||
    continuumMaterialIndices.length !== CONTINUUM_COUNT ||
    continuumLambdas.length !== CONTINUUM_COUNT * 4 ||
    continuumColorRanges.length !== 20
  )
    throw new Error('Continuum V5 buffers drifted.');
  let expectedContinuumOffset = 0;
  const continuumSchedule = Array.from({ length: 10 }, (_, color) => {
    const offset = continuumColorRanges[color * 2]!;
    const count = continuumColorRanges[color * 2 + 1]!;
    if (offset !== expectedContinuumOffset || count < 1 || offset + count > CONTINUUM_COUNT)
      throw new Error('Continuum color ranges are not exact, contiguous, and nonempty.');
    expectedContinuumOffset += count;
    return Object.freeze({
      offset,
      count,
      workgroups: Math.ceil(count / CONTINUUM_STRAIN_VNEXT_WORKGROUP_SIZE),
      params: continuumParams(offset, count, FIXED_DT_S),
    });
  });
  if (expectedContinuumOffset !== CONTINUUM_COUNT)
    throw new Error('Continuum colors do not cover all constraints.');

  const frameParams = Array.from({ length: FRAME_COUNT + 3 }, (_, frame) =>
    encodeXpbdPredictFrameParamsV1({
      dtS: FIXED_DT_S,
      gravityMps2Y: GRAVITY_MPS2_Y,
      damping: material.velocityRetentionPerStep,
      simulationSeconds: frame * FIXED_DT_S,
      particleCount: PARTICLE_COUNT,
      distanceConstraintCount: DISTANCE_COUNT,
      windAccelerationMps2Z: WIND_MPS2_Z,
    }),
  );
  const resetPackets = Object.freeze({
    distance: createXpbdDistanceResetPacketV1(DISTANCE_COUNT),
    seam: createXpbdSeamAllActivePacketV1({
      totalConstraintCount: SEAM_COUNT,
      activeConstraintCount: SEAM_COUNT,
      complianceMPerN: SEAM_COMPLIANCE_M_PER_N,
      dtS: FIXED_DT_S,
    }),
    bend: createXpbdBendResetPacketV1(BEND_COUNT),
    continuum: createXpbdContinuumResetPacketV1(CONTINUUM_COUNT),
  });
  const collisionInput: BetaSkirtRenderedBodyCollisionDiagnosticInputV1 = {
    binding: Object.freeze({ ...projection.collisionInput.binding }),
    bodyPositionsM: new CapturedFloat32Array(projection.collisionInput.bodyPositionsM),
    bodyTriangles: new CapturedUint32Array(projection.collisionInput.bodyTriangles),
    garmentPositionsM: new CapturedFloat32Array(projection.collisionInput.garmentPositionsM),
    garmentTriangles: new CapturedUint32Array(projection.collisionInput.garmentTriangles),
    garmentUniformScale: projection.collisionInput.garmentUniformScale,
    garmentTranslationM: Object.freeze([
      projection.collisionInput.garmentTranslationM[0],
      projection.collisionInput.garmentTranslationM[1],
      projection.collisionInput.garmentTranslationM[2],
    ]) as readonly [number, number, number],
  };
  if (
    collisionInput.garmentUniformScale !== 1 ||
    collisionInput.garmentTranslationM.some((value) => value !== 0)
  )
    throw new Error('Runtime source is not already expressed in rendered-world meters.');
  const bodyPositions = new CapturedFloat32Array(collisionInput.bodyPositionsM);
  const bodyTriangles = new CapturedUint32Array(collisionInput.bodyTriangles);
  if (
    bodyPositions.length !== BODY_VERTEX_COUNT * 3 ||
    bodyTriangles.length !== BODY_TRIANGLE_COUNT * 3 ||
    bodyPositions.some((value) => !Number.isFinite(value)) ||
    bodyTriangles.some((vertex) => vertex >= BODY_VERTEX_COUNT)
  )
    throw new Error('Exact retained actual-body 13,380V/26,756T buffers drifted.');
  const signedBodyVolumeM3 = bodySignedVolumeM3(bodyPositions, bodyTriangles);
  if (!Number.isFinite(signedBodyVolumeM3) || Math.abs(signedBodyVolumeM3) <= 1e-12)
    throw new Error('Actual-body winding does not define a nonzero signed volume.');
  const bodyOutwardNormalSign = (signedBodyVolumeM3 > 0 ? 1 : -1) as 1 | -1;
  const contactParams = packActualBodyTriangleMeshContactParamsV2({
    particleCount: PARTICLE_COUNT,
    bodyVertexCount: BODY_VERTEX_COUNT,
    bodyTriangleCount: BODY_TRIANGLE_COUNT,
    clearanceMarginM: CONTACT_CLEARANCE_MARGIN_M,
    maximumCorrectionM: CONTACT_MAXIMUM_CORRECTION_M,
    minimumNormalLengthSquaredM4: CONTACT_MINIMUM_NORMAL_LENGTH_SQUARED_M4,
    outwardNormalSign: bodyOutwardNormalSign,
  });
  const sourcePositions3M = positions3(physical);
  const dispatchesPerIteration =
    distanceSchedule.length +
    continuumSchedule.length +
    seamSchedule.length +
    bendSchedule.length +
    seamSchedule.length;
  return Object.freeze({
    physical,
    triangles,
    seamPairs,
    pins,
    sourcePositions3M,
    collisionInput,
    bodyPositions,
    bodyTriangles,
    signedBodyVolumeM3,
    bodyOutwardNormalSign,
    contactParams,
    distancePairs,
    distanceRestLengths,
    distanceLambdas,
    distanceSchedule,
    seamVertexPairs,
    seamTargetLengths,
    seamLambdas,
    seamActivationRanks,
    seamSchedule,
    seamActivationParams,
    bendVertexQuads,
    bendRestAngles,
    bendLambdas,
    bendSchedule,
    continuumTriangleIndices,
    continuumRestFrames,
    continuumMaterialIndices,
    continuumMaterialRecords,
    continuumLambdas,
    continuumSchedule,
    frameParams,
    resetPackets,
    initialMaximumSeamGapM: maximumSeamGap(physical, seamPairs),
    dispatchesPerFrame: 1 + 4 + FIXED_ITERATIONS * dispatchesPerIteration + 1 + 1,
    reportConfig: Object.freeze({
      frameCount: FRAME_COUNT,
      dtS: FIXED_DT_S,
      solverIterations: FIXED_ITERATIONS,
      gravityMps2Y: GRAVITY_MPS2_Y,
      windAccelerationMps2Z: WIND_MPS2_Z,
      distanceComplianceMPerN: DISTANCE_COMPLIANCE_M_PER_N,
      seamComplianceMPerN: SEAM_COMPLIANCE_M_PER_N,
      bendComplianceInvNm,
      bendWarpComplianceInvNm: material.bendComplianceInvNm.warp,
      bendWeftComplianceInvNm: material.bendComplianceInvNm.weft,
      bendComplianceProjection: 'max-warp-weft-conservative-visual-only' as const,
      velocityRetentionPerStep: material.velocityRetentionPerStep,
      contactClearanceMarginM: CONTACT_CLEARANCE_MARGIN_M,
      contactMaximumCorrectionM: CONTACT_MAXIMUM_CORRECTION_M,
      contactMinimumNormalLengthSquaredM4: CONTACT_MINIMUM_NORMAL_LENGTH_SQUARED_M4,
      exactPostgateMinimumSignedClearanceM: EXACT_POSTGATE_MINIMUM_SIGNED_CLEARANCE_M,
      contactVelocityResponse:
        'preserve-tangent-and-outward-remove-inward-normal-no-correction-kick' as const,
      bodySignedVolumeM3: signedBodyVolumeM3,
      bodyOutwardNormalSign,
    }),
    reportWorkload: Object.freeze({
      particleCount: PARTICLE_COUNT,
      triangleCount: TRIANGLE_COUNT,
      distanceConstraintCount: DISTANCE_COUNT,
      seamConstraintCount: SEAM_COUNT,
      bendConstraintCount: BEND_COUNT,
      continuumConstraintCount: CONTINUUM_COUNT,
      distanceColorCount: 9 as const,
      seamColorCount: 1 as const,
      bendColorCount: 18 as const,
      continuumColorCount: 10 as const,
      pinnedParticleCount: PIN_COUNT,
      bodyVertexCount: BODY_VERTEX_COUNT,
      bodyTriangleCount: BODY_TRIANGLE_COUNT,
    }),
  });
}

async function resolvePipelineIdentities() {
  const crypto = cryptoShim();
  const resetNames = ['distance', 'seam-all-active', 'bend', 'continuum'] as const;
  const [predict, distance, seam, bend, continuum, velocity, contact, ...resets] =
    await Promise.all([
      getXpbdPredictPipelineIdentityV1({ crypto }),
      getXpbdDistancePipelineIdentityV1({ crypto }),
      getXpbdSeamSolvePipelineIdentityV1({ crypto }),
      getXpbdEmbeddedScalarBendPipelineIdentityV1({ crypto }),
      getContinuumStrainVNextPipelineIdentityV1({ crypto }),
      getXpbdVelocityDiagnosticPipelineIdentityV1({ crypto }),
      getActualBodyTriangleMeshContactPipelineIdentityV2({ crypto }),
      ...resetNames.map((name) =>
        getXpbdInitializationCoreResetPipelineIdentityV1(name, { crypto }),
      ),
    ]);
  return Object.freeze({
    predict,
    distance,
    seam,
    bend,
    continuum,
    velocity,
    contact,
    resets: Object.freeze(
      Object.fromEntries(resetNames.map((name, index) => [name, resets[index]!])) as Record<
        XpbdInitializationCoreResetKernelV1,
        (typeof resets)[number]
      >,
    ),
  });
}

async function executeGpuRun(
  device: GPUDevice,
  trackedBuffers: GPUBuffer[],
  prepared: ReturnType<typeof prepareRun>,
  identities: Awaited<ReturnType<typeof resolvePipelineIdentities>>,
  inputState: FrameStateV8,
  signal: AbortSignal | undefined,
) {
  throwIfAborted(signal);
  const resetNames = ['distance', 'seam-all-active', 'bend', 'continuum'] as const;
  const [
    predictPipeline,
    distancePipeline,
    seamPipeline,
    bendPipeline,
    continuumPipeline,
    velocityPipeline,
    contactPipeline,
  ] = await Promise.all([
    createPipeline(device, xpbdPredictShaderDescriptorV1(), identities.predict.entryPoint),
    createPipeline(device, xpbdDistanceShaderDescriptorV1(), identities.distance.entryPoint),
    createPipeline(device, xpbdSeamSolveShaderDescriptorV1(), identities.seam.entryPoint),
    createPipeline(device, xpbdEmbeddedScalarBendShaderDescriptorV1(), identities.bend.entryPoint),
    createPipeline(
      device,
      continuumStrainVNextShaderDescriptorV1(),
      identities.continuum.entryPoint,
    ),
    createPipeline(
      device,
      xpbdVelocityDiagnosticShaderDescriptorV1(),
      identities.velocity.entryPoint,
    ),
    createPipeline(
      device,
      actualBodyTriangleMeshContactShaderDescriptorV2(),
      identities.contact.entryPoint,
    ),
  ]);
  const resetPipelineList = await Promise.all(
    resetNames.map((name) =>
      createPipeline(
        device,
        xpbdInitializationCoreResetShaderDescriptorV1(name),
        identities.resets[name].entryPoint,
      ),
    ),
  );
  const resetPipelines = Object.fromEntries(
    resetNames.map((name, index) => [name, resetPipelineList[index]!]),
  ) as Record<XpbdInitializationCoreResetKernelV1, GPUComputePipeline>;

  const positionsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium D-435 current positions physical vec4',
    inputState.current,
    STORAGE | COPY_SRC,
  );
  const previousPositionsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium D-435 previous positions',
    inputState.previous,
    STORAGE | COPY_SRC,
  );
  const velocitiesBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium D-435 velocities',
    inputState.velocities,
    STORAGE | COPY_SRC,
  );
  const restPositionsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium rest physical vec4',
    prepared.physical,
    STORAGE,
  );
  const frameParamsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium frame params',
    prepared.frameParams[FRAME_COUNT + 2]!,
    UNIFORM,
  );
  const predictBindGroup = bindGroup(device, predictPipeline, [
    positionsBuffer,
    previousPositionsBuffer,
    velocitiesBuffer,
    restPositionsBuffer,
    frameParamsBuffer,
  ]);

  const distancePairsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium distance pairs',
    prepared.distancePairs,
    STORAGE,
  );
  const distanceRestLengthsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium distance rest lengths',
    prepared.distanceRestLengths,
    STORAGE,
  );
  const distanceLambdasBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium distance lambdas',
    inputState.distanceLambdas,
    STORAGE | COPY_SRC,
  );
  const distanceColorParamBuffers = prepared.distanceSchedule.map((color, index) =>
    createGpuBuffer(
      device,
      trackedBuffers,
      `canonical-medium distance color ${index} params`,
      color.params,
      UNIFORM,
    ),
  );
  const distanceBindGroups = distanceColorParamBuffers.map((paramsBuffer) =>
    bindGroup(device, distancePipeline, [
      positionsBuffer,
      distancePairsBuffer,
      distanceRestLengthsBuffer,
      distanceLambdasBuffer,
      paramsBuffer,
    ]),
  );

  const seamPairsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium seam pairs',
    prepared.seamVertexPairs,
    STORAGE,
  );
  const seamTargetLengthsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium seam target lengths',
    prepared.seamTargetLengths,
    STORAGE,
  );
  const seamLambdasBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium seam lambdas',
    inputState.seamLambdas,
    STORAGE | COPY_SRC,
  );
  const seamActivationRanksBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium seam activation ranks',
    prepared.seamActivationRanks,
    STORAGE,
  );
  const seamActivationParamsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium seam activation params',
    prepared.seamActivationParams,
    UNIFORM,
  );
  const seamColorParamBuffers = prepared.seamSchedule.map((color, index) =>
    createGpuBuffer(
      device,
      trackedBuffers,
      `canonical-medium seam color ${index} params`,
      color.params,
      UNIFORM,
    ),
  );
  const seamBindGroups = seamColorParamBuffers.map((paramsBuffer) =>
    bindGroup(device, seamPipeline, [
      positionsBuffer,
      seamPairsBuffer,
      seamTargetLengthsBuffer,
      seamLambdasBuffer,
      seamActivationRanksBuffer,
      paramsBuffer,
      seamActivationParamsBuffer,
    ]),
  );

  const bendQuadsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium bend quads',
    prepared.bendVertexQuads,
    STORAGE,
  );
  const bendRestAnglesBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium bend rest angles',
    prepared.bendRestAngles,
    STORAGE,
  );
  const bendLambdasBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium bend lambdas',
    inputState.bendLambdas,
    STORAGE | COPY_SRC,
  );
  const bendInvalidBuffer = createEmptyGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium bend invalid counter',
    4,
    STORAGE | COPY_SRC,
  );
  const bendColorParamBuffers = prepared.bendSchedule.map((color, index) =>
    createGpuBuffer(
      device,
      trackedBuffers,
      `canonical-medium bend color ${index} params`,
      color.params,
      UNIFORM,
    ),
  );
  const bendBindGroups = bendColorParamBuffers.map((paramsBuffer) =>
    bindGroup(device, bendPipeline, [
      positionsBuffer,
      bendQuadsBuffer,
      bendRestAnglesBuffer,
      bendLambdasBuffer,
      paramsBuffer,
      bendInvalidBuffer,
    ]),
  );

  const continuumTriangleIndicesBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium continuum triangle indices',
    prepared.continuumTriangleIndices,
    STORAGE,
  );
  const continuumRestFramesBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium continuum rest frames',
    prepared.continuumRestFrames,
    STORAGE,
  );
  const continuumMaterialIndicesBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium continuum material indices',
    prepared.continuumMaterialIndices,
    STORAGE,
  );
  const continuumMaterialsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium continuum material records',
    prepared.continuumMaterialRecords,
    STORAGE,
  );
  const continuumLambdasBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium continuum lambdas',
    inputState.continuumLambdas,
    STORAGE | COPY_SRC,
  );
  const continuumStatusesBuffer = createEmptyGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium continuum statuses',
    CONTINUUM_COUNT * 4,
    STORAGE | COPY_SRC,
  );
  const continuumColorParamBuffers = prepared.continuumSchedule.map((color, index) =>
    createGpuBuffer(
      device,
      trackedBuffers,
      `canonical-medium continuum color ${index} params`,
      color.params,
      UNIFORM,
    ),
  );
  const continuumBindGroups = continuumColorParamBuffers.map((paramsBuffer) =>
    bindGroup(device, continuumPipeline, [
      positionsBuffer,
      continuumTriangleIndicesBuffer,
      continuumRestFramesBuffer,
      continuumMaterialIndicesBuffer,
      continuumMaterialsBuffer,
      continuumLambdasBuffer,
      paramsBuffer,
      continuumStatusesBuffer,
    ]),
  );

  const actualBodyPositionsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium exact actual-body positions3M',
    prepared.bodyPositions,
    STORAGE,
  );
  const actualBodyTrianglesBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium exact actual-body triangles',
    prepared.bodyTriangles,
    STORAGE,
  );
  const contactParamsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium exact actual-body contact params',
    prepared.contactParams,
    UNIFORM,
  );
  const contactDiagnosticsInitial = new CapturedUint32Array([
    0, 0, 0, 0, 0, 0, 0xffff_ffff, 0, 0, 0,
  ]);
  const contactDiagnosticsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium exact actual-body contact diagnostics',
    contactDiagnosticsInitial,
    STORAGE | COPY_SRC,
  );
  const contactBindGroup = bindGroup(device, contactPipeline, [
    positionsBuffer,
    previousPositionsBuffer,
    actualBodyPositionsBuffer,
    actualBodyTrianglesBuffer,
    contactParamsBuffer,
    contactDiagnosticsBuffer,
  ]);

  const velocityDiagnosticsInitial = new CapturedUint32Array([
    0, 0, 0, 0xffff_ffff, 0xffff_ffff, 0xffff_ffff, 0, 0,
  ]);
  const velocityDiagnosticsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium velocity diagnostics',
    velocityDiagnosticsInitial,
    STORAGE | COPY_SRC,
  );
  const velocityBindGroup = bindGroup(device, velocityPipeline, [
    positionsBuffer,
    previousPositionsBuffer,
    velocitiesBuffer,
    restPositionsBuffer,
    frameParamsBuffer,
    velocityDiagnosticsBuffer,
  ]);

  const distanceResetParamsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium distance reset params',
    prepared.resetPackets.distance,
    UNIFORM,
  );
  const seamResetParamsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium seam reset params',
    prepared.resetPackets.seam,
    UNIFORM,
  );
  const bendResetParamsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium bend reset params',
    prepared.resetPackets.bend,
    UNIFORM,
  );
  const continuumResetParamsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium continuum reset params',
    prepared.resetPackets.continuum,
    UNIFORM,
  );
  const resetBindGroups = {
    distance: bindGroup(device, resetPipelines.distance, [
      distanceLambdasBuffer,
      distanceResetParamsBuffer,
    ]),
    'seam-all-active': bindGroup(device, resetPipelines['seam-all-active'], [
      seamLambdasBuffer,
      seamResetParamsBuffer,
    ]),
    bend: bindGroup(device, resetPipelines.bend, [bendLambdasBuffer, bendResetParamsBuffer]),
    continuum: bindGroup(device, resetPipelines.continuum, [
      continuumLambdasBuffer,
      continuumResetParamsBuffer,
      continuumStatusesBuffer,
    ]),
  } as const;

  const positionBytes = inputState.current.byteLength;
  const inputStateByteLength =
    positionBytes * 3 +
    DISTANCE_COUNT * 4 +
    SEAM_COUNT * 4 +
    BEND_COUNT * 4 +
    CONTINUUM_LAMBDA_FLOAT_COUNT * 4;
  const inputVerificationBuffer = device.createBuffer({
    label: 'canonical-medium D-435 exact input verification',
    size: inputStateByteLength,
    usage: MAP_READ | COPY_DST,
  });
  trackedBuffers.push(inputVerificationBuffer);
  const inputVerificationEncoder = device.createCommandEncoder({
    label: 'canonical-medium D-435 exact input verification copy',
  });
  let inputOffset = 0;
  for (const [buffer, byteLength] of [
    [positionsBuffer, positionBytes],
    [previousPositionsBuffer, positionBytes],
    [velocitiesBuffer, positionBytes],
    [distanceLambdasBuffer, DISTANCE_COUNT * 4],
    [seamLambdasBuffer, SEAM_COUNT * 4],
    [bendLambdasBuffer, BEND_COUNT * 4],
    [continuumLambdasBuffer, CONTINUUM_LAMBDA_FLOAT_COUNT * 4],
  ] as const) {
    inputVerificationEncoder.copyBufferToBuffer(
      buffer,
      0,
      inputVerificationBuffer,
      inputOffset,
      byteLength,
    );
    inputOffset += byteLength;
  }
  device.queue.submit([inputVerificationEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  throwIfAborted(signal);
  await inputVerificationBuffer.mapAsync(MAP_READ);
  let inputVerification: Uint8Array<ArrayBuffer>;
  try {
    inputVerification = copiedBytes(inputVerificationBuffer.getMappedRange());
  } finally {
    inputVerificationBuffer.unmap();
  }
  const expectedInput = concatenateBytes([
    float32LeBytes(inputState.current),
    float32LeBytes(inputState.previous),
    float32LeBytes(inputState.velocities),
    float32LeBytes(inputState.distanceLambdas),
    float32LeBytes(inputState.seamLambdas),
    float32LeBytes(inputState.bendLambdas),
    float32LeBytes(inputState.continuumLambdas),
  ]);
  if (!bytesEqual(inputVerification, expectedInput))
    throw new Error(
      'input-state-upload-mismatch: D-435 current/previous/velocity/lambda upload differs byte-exactly.',
    );

  type BranchDispatch = Readonly<{
    predict: GPUBindGroup;
    distance: readonly GPUBindGroup[];
    seam: readonly GPUBindGroup[];
    bend: readonly GPUBindGroup[];
    continuum: readonly GPUBindGroup[];
    contact: GPUBindGroup;
    velocity: GPUBindGroup;
    reset: typeof resetBindGroups;
  }>;
  const executeContinuationFrame = async (
    label: string,
    branch: BranchDispatch,
    frameParamIndex: number,
    frameNumber: number,
  ): Promise<number> => {
    throwIfAborted(signal);
    const startedAt = performance.now();
    device.queue.writeBuffer(frameParamsBuffer, 0, prepared.frameParams[frameParamIndex]!);
    const encoder = device.createCommandEncoder({ label: `${label} frame ${frameNumber}` });
    const pass = encoder.beginComputePass({ label: `${label} frame ${frameNumber} compute` });
    pass.setPipeline(predictPipeline);
    pass.setBindGroup(0, branch.predict);
    pass.dispatchWorkgroups(xpbdPredictWorkgroupsV1(PARTICLE_COUNT));
    pass.setPipeline(resetPipelines.distance);
    pass.setBindGroup(0, branch.reset.distance);
    pass.dispatchWorkgroups(Math.ceil(DISTANCE_COUNT / 64));
    pass.setPipeline(resetPipelines['seam-all-active']);
    pass.setBindGroup(0, branch.reset['seam-all-active']);
    pass.dispatchWorkgroups(Math.ceil(SEAM_COUNT / 64));
    pass.setPipeline(resetPipelines.bend);
    pass.setBindGroup(0, branch.reset.bend);
    pass.dispatchWorkgroups(Math.ceil(BEND_COUNT / 64));
    pass.setPipeline(resetPipelines.continuum);
    pass.setBindGroup(0, branch.reset.continuum);
    pass.dispatchWorkgroups(Math.ceil(CONTINUUM_COUNT / 64));
    for (let iteration = 0; iteration < FIXED_ITERATIONS; iteration += 1) {
      pass.setPipeline(distancePipeline);
      prepared.distanceSchedule.forEach((color, colorIndex) => {
        pass.setBindGroup(0, branch.distance[colorIndex]!);
        pass.dispatchWorkgroups(color.workgroups);
      });
      pass.setPipeline(continuumPipeline);
      prepared.continuumSchedule.forEach((color, colorIndex) => {
        pass.setBindGroup(0, branch.continuum[colorIndex]!);
        pass.dispatchWorkgroups(color.workgroups);
      });
      pass.setPipeline(seamPipeline);
      prepared.seamSchedule.forEach((color, colorIndex) => {
        pass.setBindGroup(0, branch.seam[colorIndex]!);
        pass.dispatchWorkgroups(color.workgroups);
      });
      pass.setPipeline(bendPipeline);
      prepared.bendSchedule.forEach((color, colorIndex) => {
        pass.setBindGroup(0, branch.bend[colorIndex]!);
        pass.dispatchWorkgroups(color.workgroups);
      });
      pass.setPipeline(seamPipeline);
      prepared.seamSchedule.forEach((color, colorIndex) => {
        pass.setBindGroup(0, branch.seam[colorIndex]!);
        pass.dispatchWorkgroups(color.workgroups);
      });
    }
    pass.setPipeline(contactPipeline);
    pass.setBindGroup(0, branch.contact);
    pass.dispatchWorkgroups(actualBodyTriangleMeshContactWorkgroupsV2(PARTICLE_COUNT));
    pass.setPipeline(velocityPipeline);
    pass.setBindGroup(0, branch.velocity);
    pass.dispatchWorkgroups(xpbdPredictWorkgroupsV1(PARTICLE_COUNT));
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    throwIfAborted(signal);
    return performance.now() - startedAt;
  };
  const dispatch = Object.freeze({
    predict: predictBindGroup,
    distance: distanceBindGroups,
    seam: seamBindGroups,
    bend: bendBindGroups,
    continuum: continuumBindGroups,
    contact: contactBindGroup,
    velocity: velocityBindGroup,
    reset: resetBindGroups,
  });
  const frameExecutionWallTimeMs = await executeContinuationFrame(
    'canonical-medium D-435 rehydrated',
    dispatch,
    FRAME_COUNT + 2,
    35,
  );

  const velocityDiagnosticsOffset = positionBytes;
  const bendInvalidOffset = velocityDiagnosticsOffset + 32;
  const continuumStatusesOffset = bendInvalidOffset + 4;
  const contactDiagnosticsOffset = continuumStatusesOffset + CONTINUUM_COUNT * 4;
  const snapshotBytes =
    contactDiagnosticsOffset + ACTUAL_BODY_TRIANGLE_MESH_CONTACT_DIAGNOSTICS_BYTES_V2;
  const previousOffset = snapshotBytes;
  const velocitiesOffset = previousOffset + positionBytes;
  const distanceOffset = velocitiesOffset + positionBytes;
  const seamOffset = distanceOffset + DISTANCE_COUNT * 4;
  const bendOffset = seamOffset + SEAM_COUNT * 4;
  const continuumOffset = bendOffset + BEND_COUNT * 4;
  const totalFinalReadbackBytes = continuumOffset + CONTINUUM_LAMBDA_FLOAT_COUNT * 4;
  const finalReadbackBuffer = device.createBuffer({
    label: 'canonical-medium bounded frame35 readback',
    size: totalFinalReadbackBytes,
    usage: MAP_READ | COPY_DST,
  });
  trackedBuffers.push(finalReadbackBuffer);
  const finalReadbackEncoder = device.createCommandEncoder({
    label: 'canonical-medium bounded frame35 readback copy',
  });
  for (const [buffer, targetOffset, byteLength] of [
    [positionsBuffer, 0, positionBytes],
    [velocityDiagnosticsBuffer, velocityDiagnosticsOffset, 32],
    [bendInvalidBuffer, bendInvalidOffset, 4],
    [continuumStatusesBuffer, continuumStatusesOffset, CONTINUUM_COUNT * 4],
    [
      contactDiagnosticsBuffer,
      contactDiagnosticsOffset,
      ACTUAL_BODY_TRIANGLE_MESH_CONTACT_DIAGNOSTICS_BYTES_V2,
    ],
    [previousPositionsBuffer, previousOffset, positionBytes],
    [velocitiesBuffer, velocitiesOffset, positionBytes],
    [distanceLambdasBuffer, distanceOffset, DISTANCE_COUNT * 4],
    [seamLambdasBuffer, seamOffset, SEAM_COUNT * 4],
    [bendLambdasBuffer, bendOffset, BEND_COUNT * 4],
    [continuumLambdasBuffer, continuumOffset, CONTINUUM_LAMBDA_FLOAT_COUNT * 4],
  ] as const)
    finalReadbackEncoder.copyBufferToBuffer(
      buffer,
      0,
      finalReadbackBuffer,
      targetOffset,
      byteLength,
    );
  device.queue.submit([finalReadbackEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  throwIfAborted(signal);
  await finalReadbackBuffer.mapAsync(MAP_READ);
  let readback: Uint8Array<ArrayBuffer>;
  try {
    readback = copiedBytes(finalReadbackBuffer.getMappedRange());
  } finally {
    finalReadbackBuffer.unmap();
  }
  const snapshotBytesCopy = readback.buffer.slice(0, snapshotBytes);
  return Object.freeze({
    final: Object.freeze({
      positions: new CapturedFloat32Array(snapshotBytesCopy.slice(0, positionBytes)),
      velocityDiagnostics: new CapturedUint32Array(
        snapshotBytesCopy.slice(velocityDiagnosticsOffset, bendInvalidOffset),
      ),
      bendInvalidCount: new DataView(snapshotBytesCopy).getUint32(bendInvalidOffset, true),
      continuumStatuses: new CapturedUint32Array(
        snapshotBytesCopy.slice(continuumStatusesOffset, contactDiagnosticsOffset),
      ),
      contactDiagnostics: new CapturedUint32Array(
        snapshotBytesCopy.slice(contactDiagnosticsOffset, snapshotBytes),
      ),
    }),
    retainedState: Object.freeze({
      previousPositions: new CapturedFloat32Array(
        readback.buffer.slice(previousOffset, velocitiesOffset),
      ),
      velocities: new CapturedFloat32Array(readback.buffer.slice(velocitiesOffset, distanceOffset)),
      distanceLambdas: new CapturedFloat32Array(readback.buffer.slice(distanceOffset, seamOffset)),
      seamLambdas: new CapturedFloat32Array(readback.buffer.slice(seamOffset, bendOffset)),
      bendLambdas: new CapturedFloat32Array(readback.buffer.slice(bendOffset, continuumOffset)),
      continuumLambdas: new CapturedFloat32Array(
        readback.buffer.slice(continuumOffset, totalFinalReadbackBytes),
      ),
    }),
    inputStateByteLength,
    retainedStateReadbackBytes: totalFinalReadbackBytes - snapshotBytes,
    totalReadbackBytes: inputStateByteLength + totalFinalReadbackBytes,
    frameExecutionWallTimeMs,
  });
}

function inspectFinalState(
  prepared: ReturnType<typeof prepareRun>,
  finalPositions: Float32Array,
  velocityDiagnostics: Uint32Array,
  bendInvalidCount: number,
  continuumStatuses: Uint32Array,
  contactDiagnostics: Uint32Array,
) {
  if (
    finalPositions.length !== PARTICLE_COUNT * 4 ||
    velocityDiagnostics.length !== 8 ||
    continuumStatuses.length !== CONTINUUM_COUNT ||
    contactDiagnostics.length !== ACTUAL_BODY_TRIANGLE_MESH_CONTACT_DIAGNOSTICS_BYTES_V2 / 4
  )
    return Object.freeze({
      valid: false,
      detail: 'Bounded readback lengths differ from the canonical-medium workload.',
      everyPositionFinite: false,
      everyInverseMassBitExact: false,
      pinnedParticleCountBitExact: 0,
      continuumNonzeroStatusCount: CONTINUUM_COUNT,
      finalMaximumSeamGapM: Number.POSITIVE_INFINITY,
    });
  let everyPositionFinite = true;
  for (let vertex = 0; vertex < PARTICLE_COUNT; vertex += 1) {
    for (let component = 0; component < 4; component += 1) {
      const value = finalPositions[vertex * 4 + component]!;
      if (!Number.isFinite(value) || Math.abs(value) >= 1e30) everyPositionFinite = false;
    }
  }
  const initialBits = new CapturedUint32Array(prepared.physical.buffer);
  const finalBits = new CapturedUint32Array(finalPositions.buffer);
  let everyInverseMassBitExact = true;
  for (let vertex = 0; vertex < PARTICLE_COUNT; vertex += 1) {
    if (initialBits[vertex * 4 + 3] !== finalBits[vertex * 4 + 3]) {
      everyInverseMassBitExact = false;
      break;
    }
  }
  let pinnedParticleCountBitExact = 0;
  for (const vertex of prepared.pins) {
    let exact = true;
    for (let component = 0; component < 4; component += 1)
      if (initialBits[vertex * 4 + component] !== finalBits[vertex * 4 + component]) exact = false;
    if (exact) pinnedParticleCountBitExact += 1;
  }
  let continuumNonzeroStatusCount = 0;
  continuumStatuses.forEach((status) => {
    if (status !== 0) continuumNonzeroStatusCount += 1;
  });
  const contactCorrectedParticleEventCount = contactDiagnostics[0]!;
  const contactInvalidParticleCount = contactDiagnostics[1]!;
  const contactDegenerateTriangleVisitCount = contactDiagnostics[2]!;
  const contactOutOfRangeTriangleVisitCount = contactDiagnostics[3]!;
  const contactMaximumCorrectionM = positiveFloatFromBits(contactDiagnostics[4]!);
  const contactMaximumPenetrationM = positiveFloatFromBits(contactDiagnostics[5]!);
  const contactMinimumCorrectedParticleIndex = contactDiagnostics[6]!;
  const contactInwardNormalClampEventCount = contactDiagnostics[7]!;
  const contactMaximumRemovedInwardNormalDeltaM = positiveFloatFromBits(contactDiagnostics[8]!);
  const contactReservedDiagnostic = contactDiagnostics[9]!;
  const contactVelocityDiagnosticsConsistent =
    contactInwardNormalClampEventCount <= contactCorrectedParticleEventCount &&
    ((contactInwardNormalClampEventCount === 0 && contactMaximumRemovedInwardNormalDeltaM === 0) ||
      (contactInwardNormalClampEventCount > 0 &&
        Number.isFinite(contactMaximumRemovedInwardNormalDeltaM) &&
        contactMaximumRemovedInwardNormalDeltaM > 0));
  const contactCorrectionDiagnosticsConsistent =
    contactCorrectedParticleEventCount > 0 &&
    contactCorrectedParticleEventCount <= PARTICLE_COUNT - PIN_COUNT &&
    Number.isFinite(contactMaximumCorrectionM) &&
    contactMaximumCorrectionM > 0 &&
    contactMaximumCorrectionM <= Math.fround(CONTACT_MAXIMUM_CORRECTION_M) &&
    Number.isFinite(contactMaximumPenetrationM) &&
    contactMaximumPenetrationM >= 0 &&
    contactMinimumCorrectedParticleIndex < PARTICLE_COUNT;
  const finalMaximumSeamGapM = maximumSeamGap(finalPositions, prepared.seamPairs);
  const valid =
    everyPositionFinite &&
    everyInverseMassBitExact &&
    pinnedParticleCountBitExact === PIN_COUNT &&
    velocityDiagnostics[0] === 0 &&
    velocityDiagnostics[1] === 0 &&
    velocityDiagnostics[2] === 0 &&
    bendInvalidCount === 0 &&
    continuumNonzeroStatusCount === 0 &&
    contactInvalidParticleCount === 0 &&
    contactDegenerateTriangleVisitCount === 0 &&
    contactOutOfRangeTriangleVisitCount === 0 &&
    contactReservedDiagnostic === 0 &&
    contactCorrectionDiagnosticsConsistent &&
    contactVelocityDiagnosticsConsistent &&
    Number.isFinite(finalMaximumSeamGapM) &&
    finalMaximumSeamGapM <= MAX_SEAM_GAP_M;
  return Object.freeze({
    valid,
    detail: valid
      ? ''
      : `Final GPU invariant failed (finite=${everyPositionFinite}, invMass=${everyInverseMassBitExact}, pins=${pinnedParticleCountBitExact}, velocityInvalid=${velocityDiagnostics[0]}, bendInvalid=${bendInvalidCount}, continuumInvalid=${continuumNonzeroStatusCount}, contactCorrected=${contactCorrectedParticleEventCount}, contactInvalid=${contactInvalidParticleCount}, contactDegenerate=${contactDegenerateTriangleVisitCount}, contactOutOfRange=${contactOutOfRangeTriangleVisitCount}, contactMinIndex=${contactMinimumCorrectedParticleIndex}, contactMaxCorrectionM=${contactMaximumCorrectionM}, contactMaxPenetrationM=${contactMaximumPenetrationM}, contactInwardClampCount=${contactInwardNormalClampEventCount}, contactMaxRemovedInwardDeltaM=${contactMaximumRemovedInwardNormalDeltaM}, contactReserved=${contactReservedDiagnostic}, seamGapM=${finalMaximumSeamGapM}).`,
    everyPositionFinite,
    everyInverseMassBitExact,
    pinnedParticleCountBitExact,
    continuumNonzeroStatusCount,
    finalMaximumSeamGapM,
  });
}

export function projectBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8(
  owner: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationProjectionV8 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner as object);
  if (!record) return null;
  const publicOwner = owner as BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOwnerV8;
  return Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_35_FRAME_CONTINUATION_PROJECTION_V8,
    reportCanonicalSha256: publicOwner.report.seal.canonicalSha256,
    finalCurrentPositionsInvMassKg: new CapturedFloat32Array(record.finalCurrentPositionsInvMassKg),
    finalCurrentPositions3M: new CapturedFloat32Array(record.finalCurrentPositions3M),
    finalPreviousPositionsInvMassKg: new CapturedFloat32Array(
      record.finalPreviousPositionsInvMassKg,
    ),
    finalVelocitiesMps: new CapturedFloat32Array(record.finalVelocitiesMps),
    finalDistanceLambdasKgM: new CapturedFloat32Array(record.finalDistanceLambdasKgM),
    finalSeamLambdasKgM: new CapturedFloat32Array(record.finalSeamLambdasKgM),
    finalBendLambdasKgM2: new CapturedFloat32Array(record.finalBendLambdasKgM2),
    finalContinuumLambdasKgM: new CapturedFloat32Array(record.finalContinuumLambdasKgM),
    normalizedTriangles: new CapturedUint32Array(record.normalizedTriangles),
    callerOwnedMutableBinaryCopies: true as const,
    rehydratedFrame35DiagnosticOnly: true as const,
    sameLiveGpuSessionFromFrame34: false as const,
    exactFrameContinuationAuthority: false as const,
    collisionAuthority: false as const,
    runtimeAuthority: false as const,
    fitAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8(
  owner: unknown,
): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner as object);
  if (!record) return false;
  capturedReflectApply(capturedFloat32Fill, record.finalCurrentPositionsInvMassKg, [0]);
  capturedReflectApply(capturedFloat32Fill, record.finalCurrentPositions3M, [0]);
  capturedReflectApply(capturedFloat32Fill, record.finalPreviousPositionsInvMassKg, [0]);
  capturedReflectApply(capturedFloat32Fill, record.finalVelocitiesMps, [0]);
  capturedReflectApply(capturedFloat32Fill, record.finalDistanceLambdasKgM, [0]);
  capturedReflectApply(capturedFloat32Fill, record.finalSeamLambdasKgM, [0]);
  capturedReflectApply(capturedFloat32Fill, record.finalBendLambdasKgM2, [0]);
  capturedReflectApply(capturedFloat32Fill, record.finalContinuumLambdasKgM, [0]);
  capturedReflectApply(capturedUint32Fill, record.normalizedTriangles, [0]);
  owners.delete(owner as object);
  return true;
}
