/* global GPUBindGroup, GPUBuffer, GPUCommandEncoder, GPUComputePipeline, GPUDevice, GPUShaderModuleDescriptor */

import { decodeClothMaterialGpuV1 } from '../../lib/cloth/compiler/material-package';
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
  projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2,
  type BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
} from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';
import {
  BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_OBSERVATION_V4,
  assertBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4,
  reconstructBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4,
  snapshotBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-checkpoint-contract-v4';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_REPORT_V5 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-state-retention-report/5' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_OWNER_V5 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-state-retention-owner/5' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_PROJECTION_V5 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-state-retention-projection/5' as const;

const FRAME_COUNT = 32;
const FRAME_16_CHECKPOINT_COUNT = 16 as const;
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
const capturedUint8Set = Uint8Array.prototype.set;
const capturedFloat32Fill = Float32Array.prototype.fill;
const capturedUint32Fill = Uint32Array.prototype.fill;
const capturedCryptoObject = globalThis.crypto;
const capturedSubtle = capturedCryptoObject?.subtle;
const capturedDigest = capturedSubtle?.digest;
const capturedRandomUuid = capturedCryptoObject?.randomUUID?.bind(capturedCryptoObject);

type GpuProvider = NonNullable<CreateXpbdDeviceSessionOptions['gpu']>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOptionsV5 = Readonly<{
  gpu?: GpuProvider;
  sessionIdFactory?: CreateXpbdDeviceSessionOptions['sessionIdFactory'];
  signal?: AbortSignal;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionBlockerV5 =
  | 'static-post-frame-response-not-executed'
  | 'rehydrated-next-frame-parity-not-proven'
  | 'exact-frame-continuation-not-executed'
  | 'settle-fit-runtime-production-authority-not-established';

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionReportV5 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_REPORT_V5;
  status: 'saved-32-frame-state-retained-static-response-ready-continuation-unproven';
  decision: 'PASS_EXACT_V4_FINAL_CURRENT_AND_RETAIN_DYNAMIC_STATE_WITH_CONTINUATION_BLOCKER';
  bindings: Readonly<{
    savedRuntimeSourceCanonicalSha256: string;
    saved16FrameCanonicalSha256: string;
    runner16FrameCanonicalSha256: string;
    runtimeSourceCanonicalSha256: string;
    normalizedV5AggregateSha256: string;
    sourcePositions3MSha256: string;
    normalizedTopologySha256: string;
    seamPairsSha256: string;
    pinnedVertexIndicesSha256: string;
    frame16CheckpointPositionsInvMassKgSha256: string;
    frame16CheckpointPositions3MSha256: string;
    frame16CheckpointDiagnosticsSha256: string;
    finalPositionsInvMassKgSha256: string;
    finalPositions3MSha256: string;
    finalCollisionBindingPositionsSha256: string;
    finalCollisionContentFingerprintSha256: string;
    bodyPositions3MSha256: string;
    bodyTrianglesSha256: string;
    contactKernelSourceSha256: typeof ACTUAL_BODY_TRIANGLE_MESH_CONTACT_SOURCE_SHA256_V2;
    acceptedV4RunnerCanonicalSha256: string;
    finalPreviousPositionsInvMassKgSha256: string;
    finalVelocitiesMpsSha256: string;
    finalDistanceLambdasKgMSha256: string;
    finalSeamLambdasKgMSha256: string;
    finalBendLambdasKgM2Sha256: string;
    finalContinuumLambdasKgMSha256: string;
    retainedDynamicStateAggregateSha256: string;
  }>;
  config: Readonly<{
    frameCount: typeof FRAME_COUNT;
    dtS: typeof FIXED_DT_S;
    solverIterations: typeof FIXED_ITERATIONS;
    gravityMps2Y: typeof GRAVITY_MPS2_Y;
    windAccelerationMps2Z: typeof WIND_MPS2_Z;
    distanceComplianceMPerN: typeof DISTANCE_COMPLIANCE_M_PER_N;
    seamComplianceMPerN: typeof SEAM_COMPLIANCE_M_PER_N;
    bendComplianceInvNm: number;
    bendWarpComplianceInvNm: number;
    bendWeftComplianceInvNm: number;
    bendComplianceProjection: 'max-warp-weft-conservative-visual-only';
    velocityRetentionPerStep: number;
    contactClearanceMarginM: typeof CONTACT_CLEARANCE_MARGIN_M;
    contactMaximumCorrectionM: typeof CONTACT_MAXIMUM_CORRECTION_M;
    contactMinimumNormalLengthSquaredM4: typeof CONTACT_MINIMUM_NORMAL_LENGTH_SQUARED_M4;
    exactPostgateMinimumSignedClearanceM: typeof EXACT_POSTGATE_MINIMUM_SIGNED_CLEARANCE_M;
    contactVelocityResponse: 'preserve-tangent-and-outward-remove-inward-normal-no-correction-kick';
    bodySignedVolumeM3: number;
    bodyOutwardNormalSign: 1 | -1;
  }>;
  workload: Readonly<{
    particleCount: typeof PARTICLE_COUNT;
    triangleCount: typeof TRIANGLE_COUNT;
    distanceConstraintCount: typeof DISTANCE_COUNT;
    seamConstraintCount: typeof SEAM_COUNT;
    bendConstraintCount: typeof BEND_COUNT;
    continuumConstraintCount: typeof CONTINUUM_COUNT;
    distanceColorCount: 9;
    seamColorCount: 1;
    bendColorCount: 18;
    continuumColorCount: 10;
    pinnedParticleCount: typeof PIN_COUNT;
    bodyVertexCount: typeof BODY_VERTEX_COUNT;
    bodyTriangleCount: typeof BODY_TRIANGLE_COUNT;
  }>;
  execution: Readonly<{
    frameSubmissionCount: typeof FRAME_COUNT;
    readbackSubmissionCount: 1;
    totalComputeDispatchCount: number;
    positionReadbackByteLength: number;
    diagnosticReadbackByteLength: number;
    retainedDynamicStateReadbackByteLength: number;
    frame16CheckpointReadbackByteLength: number;
    totalReadbackByteLength: number;
    frame16CheckpointExactSaved16Parity: true;
    invalidVelocityStateCount: number;
    numericInvalidVelocityStateCount: number;
    outOfDomainVelocityStateCount: number;
    bendInvalidConstraintCount: number;
    continuumNonzeroStatusCount: number;
    contactDispatchCount: typeof FRAME_COUNT;
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
    totalFrameExecutionWallTimeMs: number;
    maximumFrameExecutionWallTimeMs: number;
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
    currentPositionsExactAcceptedV4: true;
    currentInverseMassBitsExactSource: true;
    previousInverseMassBitsExactSource: true;
    velocityWComponentsPositiveZero: true;
    allCurrentPreviousVelocityFinite: true;
    allLambdasFinite: true;
    staticPostFrameResponseInputAvailable: true;
    exactFrameContinuationStateBytesRetained: true;
    exactFrameContinuationExecuted: false;
    rehydratedNextFrameParityProven: false;
  }>;
  observations: Readonly<{
    frame16CheckpointEveryPositionFinite: true;
    frame16CheckpointEveryInverseMassBitExact: true;
    frame16CheckpointPinnedParticleCountBitExact: typeof PIN_COUNT;
    frame16CheckpointFinalMaximumSeamGapM: number;
    frame16CheckpointPositionsMatchSaved16: true;
    frame16CheckpointDiagnosticsMatchSaved16: true;
    everyPositionFinite: boolean;
    everyInverseMassBitExact: boolean;
    pinnedParticleCountBitExact: number;
    sourceAndFinalPositionsDiffer: boolean;
    finalHashBoundToCollisionInput: boolean;
    staleSourceCollisionHashRejectedByConstruction: boolean;
    initialMaximumSeamGapM: number;
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
    status: 'not-evaluated';
    reason: 'no-generic-post-deformation-seam-aware-owner-api';
    inferredFromGarmentSelfIntersectionCount: false;
  }>;
  blockers: readonly BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionBlockerV5[];
  cleanup: Readonly<{
    destroyedBufferCount: number;
    leaseReleased: boolean;
    sessionDisposed: boolean;
    contextUnconfigured: boolean;
    deviceDestroyed: boolean;
  }>;
  claims: Readonly<{
    exactCanonicalMediumWorkloadExecuted: true;
    physicalInverseMassBufferUploadedUnchanged: true;
    legacyPinMaskUsedAsPhysicalInverseMass: false;
    allSeamsActiveInPrimaryAndClosurePasses: true;
    boundedFrame16CheckpointAndFinalPositionDiagnosticsReadback: true;
    exactSaved16FramePrefixProven: true;
    savedLineageAuthenticatedByOuterWrapper: false;
    exactActualBodyCollisionReplayExecuted: true;
    exactActualBodyTriangleMeshContactTailExecuted: true;
    analyticalCapsulesOrProxiesUsed: false;
    nearestWoundFacetSignIsLocalDiagnostic: true;
    contactCorrectionInjectsArtificialNormalVelocity: false;
    tangentialAndOutwardVelocityPreservedAtContact: true;
    exactCollisionReplayIsFinalArbiter: true;
    acceptedV4FinalCurrentExactMatched: true;
    finalCurrentPreviousVelocityAndLambdasRetained: true;
    staticPostFrameResponseInputAvailable: true;
    staticPostFrameResponseExecuted: false;
    exactFrameContinuationStateBytesRetained: true;
    exactFrameContinuationExecuted: false;
    rehydratedNextFrameParityProven: false;
    genuineSavedRuntimeWrapperAuthenticated: false;
    inputOwnersNotReturned: true;
    epsilonChanged: false;
    collisionPolicyChanged: false;
    continuationAuthority: false;
    collisionAuthority: false;
    runtimeAuthority: false;
    fitAuthority: false;
    productionAuthority: false;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-saved-32-frame-state-retention-static-response-input-only';
  }>;
}>;

declare const runnerOwnerBrand: unique symbol;
export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_OWNER_V5;
  report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionReportV5;
  readonly [runnerOwnerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionProjectionV5 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_PROJECTION_V5;
  reportCanonicalSha256: string;
  frame16CheckpointPositionsInvMassKg: Float32Array;
  frame16CheckpointPositions3M: Float32Array;
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
  staticPostFrameResponseInputOnly: true;
  exactFrameContinuationAuthority: false;
  collisionAuthority: false;
  runtimeAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionErrorCodeV5 =
  | 'unsupported-webgpu'
  | 'aborted'
  | 'source-owner-unavailable'
  | 'saved-16-frame-owner-unavailable'
  | 'saved-32-frame-owner-unavailable'
  | 'saved-checkpoint-binding-mismatch'
  | 'saved-32-frame-binding-mismatch'
  | 'v5-contract-mismatch'
  | 'pipeline-identity-mismatch'
  | 'gpu-execution-failed'
  | 'invalid-gpu-state'
  | 'frame-16-saved-checkpoint-mismatch'
  | 'final-v4-parity-mismatch'
  | 'state-retention-invalid'
  | 'collision-diagnostic-failed'
  | 'contact-correction-cap-hit'
  | 'post-frame-actual-body-gate-failed';

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionResultV5 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5;
      report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionReportV5;
    }>
  | Readonly<{
      ok: false;
      code: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionErrorCodeV5;
      detail: string;
      owner?: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5;
      report?: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionReportV5;
    }>;

type OwnerRecord = {
  frame16CheckpointPositionsInvMassKg: Float32Array;
  frame16CheckpointPositions3M: Float32Array;
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
  if (signal?.aborted) throw new RunnerAbortError('32-frame diagnostic was aborted.');
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

function diagnosticSnapshotBytes(
  velocity: Uint32Array,
  bendInvalidCount: number,
  continuum: Uint32Array,
  contact: Uint32Array,
): Uint8Array<ArrayBuffer> {
  const bend = new CapturedUint32Array([bendInvalidCount]);
  const parts = [
    uint32LeBytes(velocity),
    uint32LeBytes(bend),
    uint32LeBytes(continuum),
    uint32LeBytes(contact),
  ] as const;
  const bytes = new CapturedUint8Array(
    parts.reduce((byteLength, part) => byteLength + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    capturedReflectApply(capturedUint8Set, bytes, [part, offset]);
    offset += part.byteLength;
  }
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
  runner16FrameOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  checkpointExpectation: BetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4,
  acceptedV4Owner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  acceptedV4CanonicalSha256: string,
): boolean {
  const runtimeProjection =
    projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSourceOwner);
  const runner16Projection =
    projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2(runner16FrameOwner);
  const acceptedV4Projection =
    projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(acceptedV4Owner);
  return (
    runtimeProjection?.reportCanonicalSha256 ===
      checkpointExpectation.runtimeSourceCanonicalSha256 &&
    runner16Projection?.reportCanonicalSha256 ===
      checkpointExpectation.runner16FrameCanonicalSha256 &&
    acceptedV4Projection?.reportCanonicalSha256 === acceptedV4CanonicalSha256
  );
}

const CLAIMS = Object.freeze({
  exactCanonicalMediumWorkloadExecuted: true as const,
  physicalInverseMassBufferUploadedUnchanged: true as const,
  legacyPinMaskUsedAsPhysicalInverseMass: false as const,
  allSeamsActiveInPrimaryAndClosurePasses: true as const,
  boundedFrame16CheckpointAndFinalPositionDiagnosticsReadback: true as const,
  exactSaved16FramePrefixProven: true as const,
  savedLineageAuthenticatedByOuterWrapper: false as const,
  exactActualBodyCollisionReplayExecuted: true as const,
  exactActualBodyTriangleMeshContactTailExecuted: true as const,
  analyticalCapsulesOrProxiesUsed: false as const,
  nearestWoundFacetSignIsLocalDiagnostic: true as const,
  contactCorrectionInjectsArtificialNormalVelocity: false as const,
  tangentialAndOutwardVelocityPreservedAtContact: true as const,
  exactCollisionReplayIsFinalArbiter: true as const,
  acceptedV4FinalCurrentExactMatched: true as const,
  finalCurrentPreviousVelocityAndLambdasRetained: true as const,
  staticPostFrameResponseInputAvailable: true as const,
  staticPostFrameResponseExecuted: false as const,
  exactFrameContinuationStateBytesRetained: true as const,
  exactFrameContinuationExecuted: false as const,
  rehydratedNextFrameParityProven: false as const,
  genuineSavedRuntimeWrapperAuthenticated: false as const,
  inputOwnersNotReturned: true as const,
  epsilonChanged: false as const,
  collisionPolicyChanged: false as const,
  continuationAuthority: false as const,
  collisionAuthority: false as const,
  runtimeAuthority: false as const,
  fitAuthority: false as const,
  productionAuthority: false as const,
});

export async function runBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5(
  canvas: HTMLCanvasElement,
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runner16FrameOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  checkpointExpectationInput: unknown,
  acceptedV4Owner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  options: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOptionsV5 = {},
): Promise<BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionResultV5> {
  const projection = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSourceOwner);
  if (!projection)
    return Object.freeze({
      ok: false,
      code: 'source-owner-unavailable' as const,
      detail: 'A live canonical-medium runtime-source owner is required.',
    });
  const runner16FrameProjection =
    projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2(runner16FrameOwner);
  if (!runner16FrameProjection)
    return Object.freeze({
      ok: false,
      code: 'saved-16-frame-owner-unavailable' as const,
      detail: 'A live genuine saved-path 16-frame runner owner is required.',
    });
  const acceptedV4Projection =
    projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(acceptedV4Owner);
  if (!acceptedV4Projection)
    return Object.freeze({
      ok: false,
      code: 'saved-32-frame-owner-unavailable' as const,
      detail: 'A live accepted saved 32-frame V4 owner is required.',
    });
  const acceptedV4Report = acceptedV4Owner.report;
  const acceptedV4CanonicalSha256 = acceptedV4Report.seal.canonicalSha256;
  const acceptedV4FinalPositionsInvMassKg = new CapturedFloat32Array(
    acceptedV4Projection.finalPositionsInvMassKg,
  );
  const acceptedV4FinalPositions3M = new CapturedFloat32Array(
    acceptedV4Projection.finalPositions3M,
  );
  const acceptedV4Triangles = new CapturedUint32Array(acceptedV4Projection.normalizedTriangles);
  let checkpointExpectation: BetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4;
  let expectedCheckpointDiagnostics: Uint8Array;
  try {
    checkpointExpectation =
      snapshotBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4(
        checkpointExpectationInput,
      );
    expectedCheckpointDiagnostics =
      reconstructBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4(
        runner16FrameOwner.report,
      );
  } catch (error) {
    return Object.freeze({
      ok: false,
      code: 'saved-checkpoint-binding-mismatch' as const,
      detail:
        error instanceof Error ? error.message : 'Saved 16-frame checkpoint input is invalid.',
    });
  }
  const runner16Report = runner16FrameOwner.report;
  if (
    checkpointExpectation.runtimeSourceCanonicalSha256 !== projection.reportCanonicalSha256 ||
    checkpointExpectation.runtimeSourceCanonicalSha256 !==
      runner16Report.bindings.runtimeSourceCanonicalSha256 ||
    checkpointExpectation.runner16FrameCanonicalSha256 !== runner16Report.seal.canonicalSha256 ||
    runner16FrameProjection.reportCanonicalSha256 !== runner16Report.seal.canonicalSha256 ||
    checkpointExpectation.sourcePositions3MSha256 !==
      runner16Report.bindings.sourcePositions3MSha256 ||
    checkpointExpectation.sourcePositions3MSha256 !==
      runtimeSourceOwner.report.bindings.sourcePositions3MSha256 ||
    checkpointExpectation.normalizedV5AggregateSha256 !==
      runner16Report.bindings.normalizedV5AggregateSha256 ||
    checkpointExpectation.normalizedV5AggregateSha256 !==
      runtimeSourceOwner.report.bindings.normalizedV5AggregateSha256 ||
    checkpointExpectation.normalizedTopologySha256 !==
      runtimeSourceOwner.report.bindings.normalizedTopologySha256 ||
    checkpointExpectation.seamPairsSha256 !== runtimeSourceOwner.report.bindings.seamPairsSha256 ||
    checkpointExpectation.pinnedVertexIndicesSha256 !==
      runtimeSourceOwner.report.bindings.pinnedVertexIndicesSha256 ||
    checkpointExpectation.bodyPositions3MSha256 !== runner16Report.bindings.bodyPositions3MSha256 ||
    checkpointExpectation.bodyTrianglesSha256 !== runner16Report.bindings.bodyTrianglesSha256 ||
    checkpointExpectation.positions3MSha256 !== runner16Report.bindings.finalPositions3MSha256 ||
    acceptedV4Report.status !== 'diagnostic-blocked' ||
    acceptedV4Report.decision !==
      'MEASURED_32_FRAME_EXACT_BODY_CONTACT_AND_STRUCTURAL_POSTGATE_CLEAR_WITH_DOWNSTREAM_BLOCKERS' ||
    acceptedV4Projection.reportCanonicalSha256 !== acceptedV4CanonicalSha256 ||
    acceptedV4Report.bindings.savedRuntimeSourceCanonicalSha256 !==
      checkpointExpectation.savedRuntimeSourceCanonicalSha256 ||
    acceptedV4Report.bindings.saved16FrameCanonicalSha256 !==
      checkpointExpectation.saved16FrameCanonicalSha256 ||
    acceptedV4Report.bindings.runner16FrameCanonicalSha256 !==
      checkpointExpectation.runner16FrameCanonicalSha256 ||
    acceptedV4Report.bindings.runtimeSourceCanonicalSha256 !==
      checkpointExpectation.runtimeSourceCanonicalSha256 ||
    acceptedV4Report.bindings.frame16CheckpointPositionsInvMassKgSha256 !==
      checkpointExpectation.positionsInvMassKgSha256 ||
    acceptedV4Report.bindings.frame16CheckpointPositions3MSha256 !==
      checkpointExpectation.positions3MSha256 ||
    acceptedV4Report.bindings.frame16CheckpointDiagnosticsSha256 !==
      checkpointExpectation.diagnosticsSha256 ||
    acceptedV4Report.bindings.normalizedTopologySha256 !==
      checkpointExpectation.normalizedTopologySha256 ||
    acceptedV4Report.collision.exactActualBodyGateClear !== true ||
    acceptedV4Report.claims.exactSaved16FramePrefixProven !== true ||
    acceptedV4Report.claims.savedLineageAuthenticatedByOuterWrapper !== false
  )
    return Object.freeze({
      ok: false,
      code: 'saved-32-frame-binding-mismatch' as const,
      detail:
        'Accepted saved 32-frame V4 lineage differs from the live runtime/16F checkpoint owners.',
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
  let session: XpbdDeviceSession | null = null;
  let lease: XpbdDeviceLease | null = null;
  const trackedBuffers: GPUBuffer[] = [];
  let checkpointPositions: Float32Array | null = null;
  let checkpointVelocityDiagnostics: Uint32Array | null = null;
  let checkpointBendInvalidCount = 0;
  let checkpointContinuumStatuses: Uint32Array | null = null;
  let checkpointContactDiagnostics: Uint32Array | null = null;
  let finalPositions: Float32Array | null = null;
  let finalPreviousPositions: Float32Array | null = null;
  let finalVelocities: Float32Array | null = null;
  let finalDistanceLambdas: Float32Array | null = null;
  let finalSeamLambdas: Float32Array | null = null;
  let finalBendLambdas: Float32Array | null = null;
  let finalContinuumLambdas: Float32Array | null = null;
  let velocityDiagnostics: Uint32Array | null = null;
  let bendInvalidCount = 0;
  let continuumStatuses: Uint32Array | null = null;
  let contactDiagnostics: Uint32Array | null = null;
  let totalFrameExecutionWallTimeMs = 0;
  let maximumFrameExecutionWallTimeMs = 0;
  let snapshotReadbackByteLength = 0;
  let retainedStateReadbackByteLength = 0;
  let totalReadbackByteLength = 0;
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
    const [runner16PositionsInvMassKgSha256, runner16Positions3MSha256, diagnosticsSha256] =
      await Promise.all([
        digestBytes(float32LeBytes(runner16FrameProjection.finalPositionsInvMassKg)),
        digestBytes(float32LeBytes(runner16FrameProjection.finalPositions3M)),
        digestBytes(expectedCheckpointDiagnostics),
      ]);
    const refreshedRuntime =
      projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSourceOwner);
    const refreshedRunner16 =
      projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2(runner16FrameOwner);
    if (
      !refreshedRuntime ||
      !refreshedRunner16 ||
      refreshedRuntime.reportCanonicalSha256 !==
        checkpointExpectation.runtimeSourceCanonicalSha256 ||
      refreshedRunner16.reportCanonicalSha256 !==
        checkpointExpectation.runner16FrameCanonicalSha256 ||
      runner16PositionsInvMassKgSha256 !== checkpointExpectation.positionsInvMassKgSha256 ||
      runner16Positions3MSha256 !== checkpointExpectation.positions3MSha256 ||
      diagnosticsSha256 !== checkpointExpectation.diagnosticsSha256
    )
      return Object.freeze({
        ok: false,
        code: 'saved-checkpoint-binding-mismatch' as const,
        detail: 'Saved 16-frame owner bytes differ from the dynamic checkpoint expectation.',
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
        runner16FrameOwner,
        checkpointExpectation,
        acceptedV4Owner,
        acceptedV4CanonicalSha256,
      )
    )
      return Object.freeze({
        ok: false,
        code: 'saved-checkpoint-binding-mismatch' as const,
        detail: 'A checkpoint source owner became unavailable during pipeline validation.',
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
        runner16FrameOwner,
        checkpointExpectation,
        acceptedV4Owner,
        acceptedV4CanonicalSha256,
      )
    )
      return Object.freeze({
        ok: false,
        code: 'saved-checkpoint-binding-mismatch' as const,
        detail: 'A checkpoint source owner became unavailable during device acquisition.',
      });
    lease = session.acquireExclusive();
    const observation = await executeGpuRun(
      lease.device,
      trackedBuffers,
      prepared,
      pipelineIdentities,
      options.signal,
    );
    if (
      !inputOwnersRemainLive(
        runtimeSourceOwner,
        runner16FrameOwner,
        checkpointExpectation,
        acceptedV4Owner,
        acceptedV4CanonicalSha256,
      )
    )
      return Object.freeze({
        ok: false,
        code: 'saved-checkpoint-binding-mismatch' as const,
        detail: 'A checkpoint source owner became unavailable during GPU execution.',
      });
    checkpointPositions = observation.checkpoint.positions;
    checkpointVelocityDiagnostics = observation.checkpoint.velocityDiagnostics;
    checkpointBendInvalidCount = observation.checkpoint.bendInvalidCount;
    checkpointContinuumStatuses = observation.checkpoint.continuumStatuses;
    checkpointContactDiagnostics = observation.checkpoint.contactDiagnostics;
    finalPositions = observation.final.positions;
    finalPreviousPositions = observation.retainedState.previousPositions;
    finalVelocities = observation.retainedState.velocities;
    finalDistanceLambdas = observation.retainedState.distanceLambdas;
    finalSeamLambdas = observation.retainedState.seamLambdas;
    finalBendLambdas = observation.retainedState.bendLambdas;
    finalContinuumLambdas = observation.retainedState.continuumLambdas;
    velocityDiagnostics = observation.final.velocityDiagnostics;
    bendInvalidCount = observation.final.bendInvalidCount;
    continuumStatuses = observation.final.continuumStatuses;
    contactDiagnostics = observation.final.contactDiagnostics;
    snapshotReadbackByteLength = observation.snapshotBytes;
    retainedStateReadbackByteLength = observation.retainedStateReadbackBytes;
    totalReadbackByteLength = observation.totalReadbackBytes;
    totalFrameExecutionWallTimeMs = observation.totalFrameExecutionWallTimeMs;
    maximumFrameExecutionWallTimeMs = observation.maximumFrameExecutionWallTimeMs;
  } catch (error) {
    return Object.freeze({
      ok: false,
      code:
        error instanceof RunnerAbortError
          ? ('aborted' as const)
          : ('gpu-execution-failed' as const),
      detail: error instanceof Error ? error.message : 'WebGPU execution failed.',
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

  if (
    !inputOwnersRemainLive(
      runtimeSourceOwner,
      runner16FrameOwner,
      checkpointExpectation,
      acceptedV4Owner,
      acceptedV4CanonicalSha256,
    )
  )
    return Object.freeze({
      ok: false,
      code: 'saved-checkpoint-binding-mismatch' as const,
      detail: 'A checkpoint source owner became unavailable before post-GPU validation.',
    });

  if (
    !checkpointPositions ||
    !checkpointVelocityDiagnostics ||
    !checkpointContinuumStatuses ||
    !checkpointContactDiagnostics ||
    !finalPositions ||
    !finalPreviousPositions ||
    !finalVelocities ||
    !finalDistanceLambdas ||
    !finalSeamLambdas ||
    !finalBendLambdas ||
    !finalContinuumLambdas ||
    !velocityDiagnostics ||
    !continuumStatuses ||
    !contactDiagnostics
  )
    return Object.freeze({
      ok: false,
      code: 'gpu-execution-failed' as const,
      detail: 'GPU execution returned no bounded final observation.',
    });

  const checkpointState = inspectFinalState(
    prepared,
    checkpointPositions,
    checkpointVelocityDiagnostics,
    checkpointBendInvalidCount,
    checkpointContinuumStatuses,
    checkpointContactDiagnostics,
  );
  const state = inspectFinalState(
    prepared,
    finalPositions,
    velocityDiagnostics,
    bendInvalidCount,
    continuumStatuses,
    contactDiagnostics,
  );
  if (
    !checkpointState.valid ||
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
    !bytesEqual(finalPositions, acceptedV4FinalPositionsInvMassKg) ||
    !bytesEqual(positions3(finalPositions), acceptedV4FinalPositions3M) ||
    !bytesEqual(prepared.triangles, acceptedV4Triangles) ||
    !currentInverseMassBitsExactSource ||
    !previousInverseMassBitsExactSource ||
    !velocityWComponentsPositiveZero ||
    !allCurrentPreviousVelocityFinite ||
    !allLambdasFinite
  )
    return Object.freeze({
      ok: false,
      code: 'state-retention-invalid' as const,
      detail:
        'Retained current/previous/velocity/lambda state failed exact V4, shape, W, or finite-value validation.',
    });

  const checkpointPositions3M = positions3(checkpointPositions);
  const checkpointDiagnosticsBytes = diagnosticSnapshotBytes(
    checkpointVelocityDiagnostics,
    checkpointBendInvalidCount,
    checkpointContinuumStatuses,
    checkpointContactDiagnostics,
  );
  const finalPositions3M = positions3(finalPositions);
  let sourcePositionsSha256: string;
  let checkpointPositionsInvMassKgSha256: string;
  let checkpointPositionsSha256: string;
  let checkpointDiagnosticsSha256: string;
  let finalPositionsInvMassKgSha256: string;
  let finalPositionsSha256: string;
  let finalPreviousPositionsInvMassKgSha256: string;
  let finalVelocitiesMpsSha256: string;
  let finalDistanceLambdasKgMSha256: string;
  let finalSeamLambdasKgMSha256: string;
  let finalBendLambdasKgM2Sha256: string;
  let finalContinuumLambdasKgMSha256: string;
  let retainedDynamicStateAggregateSha256: string;
  let bodyPositions3MSha256: string;
  let bodyTrianglesSha256: string;
  try {
    [
      sourcePositionsSha256,
      checkpointPositionsInvMassKgSha256,
      checkpointPositionsSha256,
      checkpointDiagnosticsSha256,
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
    ] = await Promise.all([
      digestBytes(float32LeBytes(prepared.sourcePositions3M)),
      digestBytes(float32LeBytes(checkpointPositions)),
      digestBytes(float32LeBytes(checkpointPositions3M)),
      digestBytes(checkpointDiagnosticsBytes),
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
      detail: error instanceof Error ? error.message : 'Final positions hashing failed.',
    });
  }
  if (
    !inputOwnersRemainLive(
      runtimeSourceOwner,
      runner16FrameOwner,
      checkpointExpectation,
      acceptedV4Owner,
      acceptedV4CanonicalSha256,
    )
  )
    return Object.freeze({
      ok: false,
      code: 'saved-checkpoint-binding-mismatch' as const,
      detail: 'A checkpoint source owner became unavailable during post-GPU hashing.',
    });
  if (
    sourcePositionsSha256 !== runtimeSourceOwner.report.bindings.sourcePositions3MSha256 ||
    sourcePositionsSha256 !== prepared.collisionInput.binding.garmentPositionsSha256 ||
    sourcePositionsSha256 !== checkpointExpectation.sourcePositions3MSha256 ||
    bodyPositions3MSha256 !== checkpointExpectation.bodyPositions3MSha256 ||
    bodyTrianglesSha256 !== checkpointExpectation.bodyTrianglesSha256
  )
    return Object.freeze({
      ok: false,
      code: 'v5-contract-mismatch' as const,
      detail: 'Runtime-source positions digest differs from its receipt.',
    });
  if (
    finalPositionsInvMassKgSha256 !== acceptedV4Report.bindings.finalPositionsInvMassKgSha256 ||
    finalPositionsSha256 !== acceptedV4Report.bindings.finalPositions3MSha256 ||
    acceptedV4Report.bindings.normalizedTopologySha256 !==
      checkpointExpectation.normalizedTopologySha256
  )
    return Object.freeze({
      ok: false,
      code: 'final-v4-parity-mismatch' as const,
      detail: 'Retained V5 final current state differs from the accepted D-418 V4 receipt.',
    });

  const checkpointDiagnosticsMatch = bytesEqual(
    checkpointDiagnosticsBytes,
    expectedCheckpointDiagnostics,
  );
  try {
    if (!checkpointDiagnosticsMatch)
      throw new Error('Frame-16 raw diagnostic bytes differ from the genuine saved 16F owner.');
    assertBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4(checkpointExpectation, {
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_OBSERVATION_V4,
      savedRuntimeSourceCanonicalSha256: checkpointExpectation.savedRuntimeSourceCanonicalSha256,
      runtimeSourceCanonicalSha256: projection.reportCanonicalSha256,
      saved16FrameCanonicalSha256: checkpointExpectation.saved16FrameCanonicalSha256,
      runner16FrameCanonicalSha256: runner16Report.seal.canonicalSha256,
      sourcePositions3MSha256: sourcePositionsSha256,
      normalizedV5AggregateSha256: projection.normalizedV5.seal.aggregateSha256,
      normalizedTopologySha256: runtimeSourceOwner.report.bindings.normalizedTopologySha256,
      seamPairsSha256: runtimeSourceOwner.report.bindings.seamPairsSha256,
      pinnedVertexIndicesSha256: runtimeSourceOwner.report.bindings.pinnedVertexIndicesSha256,
      bodyPositions3MSha256,
      bodyTrianglesSha256,
      positionsInvMassKgSha256: checkpointPositionsInvMassKgSha256,
      positions3MSha256: checkpointPositionsSha256,
      diagnosticsSha256: checkpointDiagnosticsSha256,
      diagnosticsMatchFixedAbi: true,
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      code: 'frame-16-saved-checkpoint-mismatch' as const,
      detail:
        error instanceof Error
          ? error.message
          : `Frame-16 checkpoint differs from saved 16F (vec4=${checkpointPositionsInvMassKgSha256}, vec3=${checkpointPositionsSha256}, diagnostics=${checkpointDiagnosticsSha256}).`,
    });
  }

  const collisionInput = finalCollisionInput(
    prepared.collisionInput,
    finalPositions3M,
    finalPositionsSha256,
  );
  if (
    !collisionReplayRetainsSource(prepared.collisionInput, collisionInput) ||
    collisionInput.binding.garmentPositionsSha256 !== finalPositionsSha256 ||
    finalPositionsSha256 === sourcePositionsSha256
  )
    return Object.freeze({
      ok: false,
      code: 'invalid-gpu-state' as const,
      detail:
        'Final collision replay did not retain exact source context, bind final LE bytes, or prove motion.',
    });
  let collisionReport: BetaSkirtRenderedBodyCollisionDiagnosticReportV1;
  let qualityReport: BetaSkirtCoherentEnvelopeQualityReportV1;
  try {
    qualityReport = evaluateBetaSkirtCoherentEnvelopeQualityV1({
      sourcePositionsM: new CapturedFloat32Array(prepared.sourcePositions3M),
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
      detail: error instanceof Error ? error.message : 'Post-frame diagnostic replay failed.',
    });
  }
  if (
    !inputOwnersRemainLive(
      runtimeSourceOwner,
      runner16FrameOwner,
      checkpointExpectation,
      acceptedV4Owner,
      acceptedV4CanonicalSha256,
    )
  )
    return Object.freeze({
      ok: false,
      code: 'saved-checkpoint-binding-mismatch' as const,
      detail: 'A checkpoint source owner became unavailable during post-frame replay.',
    });

  if (
    collisionReport.binding.garmentPositionsSha256 !== finalPositionsSha256 ||
    !collisionReplayRetainsSource(prepared.collisionInput, {
      ...collisionInput,
      binding: collisionReport.binding,
    })
  )
    return Object.freeze({
      ok: false,
      code: 'collision-diagnostic-failed' as const,
      detail: 'Collision V1 receipt did not echo the exact retained binding and final LE digest.',
    });

  const collisionClear = exactCollisionClear(collisionReport);
  const qualityClear = qualityReport.blockers.length === 0;
  const contactMaximumCorrectionM = positiveFloatFromBits(contactDiagnostics[4]!);
  const contactCorrectionCapHit =
    contactMaximumCorrectionM >= Math.fround(CONTACT_MAXIMUM_CORRECTION_M);
  if (contactCorrectionCapHit)
    return Object.freeze({
      ok: false,
      code: 'contact-correction-cap-hit' as const,
      detail:
        'The exact-mesh contact correction reached its policy cap; state retention is not promotable.',
    });
  if (!collisionClear || !qualityClear)
    return Object.freeze({
      ok: false,
      code: 'post-frame-actual-body-gate-failed' as const,
      detail:
        'The exact V4-parity current state failed the fresh actual-body or structural-quality gate.',
    });
  const blockers: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionBlockerV5[] = [
    'static-post-frame-response-not-executed',
    'rehydrated-next-frame-parity-not-proven',
    'exact-frame-continuation-not-executed',
    'settle-fit-runtime-production-authority-not-established',
  ];
  const reportWithoutSeal = {
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_REPORT_V5,
    status: 'saved-32-frame-state-retained-static-response-ready-continuation-unproven' as const,
    decision:
      'PASS_EXACT_V4_FINAL_CURRENT_AND_RETAIN_DYNAMIC_STATE_WITH_CONTINUATION_BLOCKER' as const,
    bindings: Object.freeze({
      savedRuntimeSourceCanonicalSha256: checkpointExpectation.savedRuntimeSourceCanonicalSha256,
      saved16FrameCanonicalSha256: checkpointExpectation.saved16FrameCanonicalSha256,
      runner16FrameCanonicalSha256: runner16Report.seal.canonicalSha256,
      runtimeSourceCanonicalSha256: projection.reportCanonicalSha256,
      normalizedV5AggregateSha256: projection.normalizedV5.seal.aggregateSha256,
      sourcePositions3MSha256: sourcePositionsSha256,
      normalizedTopologySha256: checkpointExpectation.normalizedTopologySha256,
      seamPairsSha256: checkpointExpectation.seamPairsSha256,
      pinnedVertexIndicesSha256: checkpointExpectation.pinnedVertexIndicesSha256,
      frame16CheckpointPositionsInvMassKgSha256: checkpointPositionsInvMassKgSha256,
      frame16CheckpointPositions3MSha256: checkpointPositionsSha256,
      frame16CheckpointDiagnosticsSha256: checkpointDiagnosticsSha256,
      finalPositionsInvMassKgSha256,
      finalPositions3MSha256: finalPositionsSha256,
      finalCollisionBindingPositionsSha256: collisionInput.binding.garmentPositionsSha256,
      finalCollisionContentFingerprintSha256: collisionReport.contentFingerprintSha256,
      bodyPositions3MSha256,
      bodyTrianglesSha256,
      contactKernelSourceSha256: ACTUAL_BODY_TRIANGLE_MESH_CONTACT_SOURCE_SHA256_V2,
      acceptedV4RunnerCanonicalSha256: acceptedV4CanonicalSha256,
      finalPreviousPositionsInvMassKgSha256,
      finalVelocitiesMpsSha256,
      finalDistanceLambdasKgMSha256,
      finalSeamLambdasKgMSha256,
      finalBendLambdasKgM2Sha256,
      finalContinuumLambdasKgMSha256,
      retainedDynamicStateAggregateSha256,
    }),
    config: prepared.reportConfig,
    workload: prepared.reportWorkload,
    execution: Object.freeze({
      frameSubmissionCount: FRAME_COUNT,
      readbackSubmissionCount: 1 as const,
      totalComputeDispatchCount: prepared.dispatchesPerFrame * FRAME_COUNT,
      positionReadbackByteLength: finalPositions.byteLength,
      diagnosticReadbackByteLength:
        velocityDiagnostics.byteLength +
        4 +
        continuumStatuses.byteLength +
        contactDiagnostics.byteLength,
      retainedDynamicStateReadbackByteLength: retainedStateReadbackByteLength,
      frame16CheckpointReadbackByteLength: snapshotReadbackByteLength,
      totalReadbackByteLength,
      frame16CheckpointExactSaved16Parity: true as const,
      invalidVelocityStateCount: velocityDiagnostics[0]!,
      numericInvalidVelocityStateCount: velocityDiagnostics[1]!,
      outOfDomainVelocityStateCount: velocityDiagnostics[2]!,
      bendInvalidConstraintCount: bendInvalidCount,
      continuumNonzeroStatusCount: state.continuumNonzeroStatusCount,
      contactDispatchCount: FRAME_COUNT,
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
      totalFrameExecutionWallTimeMs,
      maximumFrameExecutionWallTimeMs,
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
      currentPositionsExactAcceptedV4: true as const,
      currentInverseMassBitsExactSource: true as const,
      previousInverseMassBitsExactSource: true as const,
      velocityWComponentsPositiveZero: true as const,
      allCurrentPreviousVelocityFinite: true as const,
      allLambdasFinite: true as const,
      staticPostFrameResponseInputAvailable: true as const,
      exactFrameContinuationStateBytesRetained: true as const,
      exactFrameContinuationExecuted: false as const,
      rehydratedNextFrameParityProven: false as const,
    }),
    observations: Object.freeze({
      frame16CheckpointEveryPositionFinite: true as const,
      frame16CheckpointEveryInverseMassBitExact: true as const,
      frame16CheckpointPinnedParticleCountBitExact: PIN_COUNT,
      frame16CheckpointFinalMaximumSeamGapM: checkpointState.finalMaximumSeamGapM,
      frame16CheckpointPositionsMatchSaved16: true as const,
      frame16CheckpointDiagnosticsMatchSaved16: true as const,
      everyPositionFinite: state.everyPositionFinite,
      everyInverseMassBitExact: state.everyInverseMassBitExact,
      pinnedParticleCountBitExact: state.pinnedParticleCountBitExact,
      sourceAndFinalPositionsDiffer: sourcePositionsSha256 !== finalPositionsSha256,
      finalHashBoundToCollisionInput:
        collisionInput.binding.garmentPositionsSha256 === finalPositionsSha256,
      staleSourceCollisionHashRejectedByConstruction:
        finalPositionsSha256 !== sourcePositionsSha256 &&
        collisionInput.binding.garmentPositionsSha256 !== sourcePositionsSha256,
      initialMaximumSeamGapM: prepared.initialMaximumSeamGapM,
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
    selfOrientation: Object.freeze({
      status: 'not-evaluated' as const,
      reason: 'no-generic-post-deformation-seam-aware-owner-api' as const,
      inferredFromGarmentSelfIntersectionCount: false as const,
    }),
    blockers: Object.freeze(blockers),
    cleanup: Object.freeze({ destroyedBufferCount, ...cleanupResult }),
    claims: CLAIMS,
  };
  const reportSeal = await digestBytes(
    capturedReflectApply(capturedTextEncode, capturedTextEncoder, [
      capturedJsonStringify(reportWithoutSeal),
    ]) as Uint8Array,
  );
  if (
    !inputOwnersRemainLive(
      runtimeSourceOwner,
      runner16FrameOwner,
      checkpointExpectation,
      acceptedV4Owner,
      acceptedV4CanonicalSha256,
    )
  )
    return Object.freeze({
      ok: false,
      code: 'saved-checkpoint-binding-mismatch' as const,
      detail: 'A checkpoint source owner became unavailable while sealing the V4 report.',
    });
  const report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionReportV5 = Object.freeze({
    ...reportWithoutSeal,
    seal: Object.freeze({
      algorithm: 'SHA-256' as const,
      canonicalSha256: reportSeal,
      authority: 'unsigned-saved-32-frame-state-retention-static-response-input-only' as const,
    }),
  });
  const owner = Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_OWNER_V5,
    report,
  }) as BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5;
  owners.set(owner, {
    frame16CheckpointPositionsInvMassKg: new CapturedFloat32Array(checkpointPositions),
    frame16CheckpointPositions3M: new CapturedFloat32Array(checkpointPositions3M),
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
  return Object.freeze({
    ok: true as const,
    owner,
    report,
  });
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

  const frameParams = Array.from({ length: FRAME_COUNT }, (_, frame) =>
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
    'canonical-medium positions physical vec4',
    prepared.physical,
    STORAGE | COPY_SRC,
  );
  const previousPositionsBuffer = createGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium previous positions',
    prepared.physical,
    STORAGE | COPY_SRC,
  );
  const velocitiesBuffer = createEmptyGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium velocities',
    prepared.physical.byteLength,
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
    prepared.frameParams[0]!,
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
    prepared.distanceLambdas,
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
    prepared.seamLambdas,
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
    prepared.bendLambdas,
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
    prepared.continuumLambdas,
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

  const positionBytes = prepared.physical.byteLength;
  const velocityDiagnosticsOffset = positionBytes;
  const bendInvalidOffset = velocityDiagnosticsOffset + 32;
  const continuumStatusesOffset = bendInvalidOffset + 4;
  const contactDiagnosticsOffset = continuumStatusesOffset + CONTINUUM_COUNT * 4;
  const snapshotBytes =
    contactDiagnosticsOffset + ACTUAL_BODY_TRIANGLE_MESH_CONTACT_DIAGNOSTICS_BYTES_V2;
  const frame16CheckpointBuffer = device.createBuffer({
    label: 'canonical-medium frozen D-377 frame-16 checkpoint',
    size: snapshotBytes,
    usage: COPY_DST | COPY_SRC,
  });
  trackedBuffers.push(frame16CheckpointBuffer);

  const copySnapshot = (
    encoder: GPUCommandEncoder,
    target: GPUBuffer,
    targetBaseOffset: number,
  ): void => {
    encoder.copyBufferToBuffer(positionsBuffer, 0, target, targetBaseOffset, positionBytes);
    encoder.copyBufferToBuffer(
      velocityDiagnosticsBuffer,
      0,
      target,
      targetBaseOffset + velocityDiagnosticsOffset,
      32,
    );
    encoder.copyBufferToBuffer(
      bendInvalidBuffer,
      0,
      target,
      targetBaseOffset + bendInvalidOffset,
      4,
    );
    encoder.copyBufferToBuffer(
      continuumStatusesBuffer,
      0,
      target,
      targetBaseOffset + continuumStatusesOffset,
      CONTINUUM_COUNT * 4,
    );
    encoder.copyBufferToBuffer(
      contactDiagnosticsBuffer,
      0,
      target,
      targetBaseOffset + contactDiagnosticsOffset,
      ACTUAL_BODY_TRIANGLE_MESH_CONTACT_DIAGNOSTICS_BYTES_V2,
    );
  };

  let totalFrameExecutionWallTimeMs = 0;
  let maximumFrameExecutionWallTimeMs = 0;
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    throwIfAborted(signal);
    const frameStartedAt = performance.now();
    device.queue.writeBuffer(frameParamsBuffer, 0, prepared.frameParams[frame]!);
    const encoder = device.createCommandEncoder({ label: `canonical-medium frame ${frame}` });
    const pass = encoder.beginComputePass({ label: `canonical-medium frame ${frame} compute` });
    pass.setPipeline(predictPipeline);
    pass.setBindGroup(0, predictBindGroup);
    pass.dispatchWorkgroups(xpbdPredictWorkgroupsV1(PARTICLE_COUNT));

    pass.setPipeline(resetPipelines.distance);
    pass.setBindGroup(0, resetBindGroups.distance);
    pass.dispatchWorkgroups(Math.ceil(DISTANCE_COUNT / 64));
    pass.setPipeline(resetPipelines['seam-all-active']);
    pass.setBindGroup(0, resetBindGroups['seam-all-active']);
    pass.dispatchWorkgroups(Math.ceil(SEAM_COUNT / 64));
    pass.setPipeline(resetPipelines.bend);
    pass.setBindGroup(0, resetBindGroups.bend);
    pass.dispatchWorkgroups(Math.ceil(BEND_COUNT / 64));
    pass.setPipeline(resetPipelines.continuum);
    pass.setBindGroup(0, resetBindGroups.continuum);
    pass.dispatchWorkgroups(Math.ceil(CONTINUUM_COUNT / 64));

    for (let iteration = 0; iteration < FIXED_ITERATIONS; iteration += 1) {
      pass.setPipeline(distancePipeline);
      prepared.distanceSchedule.forEach((color, colorIndex) => {
        pass.setBindGroup(0, distanceBindGroups[colorIndex]!);
        pass.dispatchWorkgroups(color.workgroups);
      });
      pass.setPipeline(continuumPipeline);
      prepared.continuumSchedule.forEach((color, colorIndex) => {
        pass.setBindGroup(0, continuumBindGroups[colorIndex]!);
        pass.dispatchWorkgroups(color.workgroups);
      });
      pass.setPipeline(seamPipeline);
      prepared.seamSchedule.forEach((color, colorIndex) => {
        pass.setBindGroup(0, seamBindGroups[colorIndex]!);
        pass.dispatchWorkgroups(color.workgroups);
      });
      pass.setPipeline(bendPipeline);
      prepared.bendSchedule.forEach((color, colorIndex) => {
        pass.setBindGroup(0, bendBindGroups[colorIndex]!);
        pass.dispatchWorkgroups(color.workgroups);
      });
      pass.setPipeline(seamPipeline);
      prepared.seamSchedule.forEach((color, colorIndex) => {
        pass.setBindGroup(0, seamBindGroups[colorIndex]!);
        pass.dispatchWorkgroups(color.workgroups);
      });
    }
    pass.setPipeline(contactPipeline);
    pass.setBindGroup(0, contactBindGroup);
    pass.dispatchWorkgroups(actualBodyTriangleMeshContactWorkgroupsV2(PARTICLE_COUNT));
    pass.setPipeline(velocityPipeline);
    pass.setBindGroup(0, velocityBindGroup);
    pass.dispatchWorkgroups(xpbdPredictWorkgroupsV1(PARTICLE_COUNT));
    pass.end();
    if (frame + 1 === FRAME_16_CHECKPOINT_COUNT) copySnapshot(encoder, frame16CheckpointBuffer, 0);
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const frameWallTimeMs = performance.now() - frameStartedAt;
    totalFrameExecutionWallTimeMs += frameWallTimeMs;
    maximumFrameExecutionWallTimeMs = Math.max(maximumFrameExecutionWallTimeMs, frameWallTimeMs);
    throwIfAborted(signal);
  }

  const retainedStateBaseOffset = snapshotBytes * 2;
  const previousPositionsOffset = retainedStateBaseOffset;
  const velocitiesOffset = previousPositionsOffset + positionBytes;
  const distanceLambdasOffset = velocitiesOffset + positionBytes;
  const seamLambdasOffset = distanceLambdasOffset + DISTANCE_COUNT * 4;
  const bendLambdasOffset = seamLambdasOffset + SEAM_COUNT * 4;
  const continuumLambdasOffset = bendLambdasOffset + BEND_COUNT * 4;
  const totalReadbackBytes = continuumLambdasOffset + CONTINUUM_LAMBDA_FLOAT_COUNT * 4;
  const retainedStateReadbackBytes = totalReadbackBytes - retainedStateBaseOffset;
  const readbackBuffer = device.createBuffer({
    label: 'canonical-medium bounded frame-16 checkpoint and final readback',
    size: totalReadbackBytes,
    usage: MAP_READ | COPY_DST,
  });
  trackedBuffers.push(readbackBuffer);
  const readbackEncoder = device.createCommandEncoder({
    label: 'canonical-medium bounded checkpoint and final readback copy',
  });
  readbackEncoder.copyBufferToBuffer(frame16CheckpointBuffer, 0, readbackBuffer, 0, snapshotBytes);
  copySnapshot(readbackEncoder, readbackBuffer, snapshotBytes);
  readbackEncoder.copyBufferToBuffer(
    previousPositionsBuffer,
    0,
    readbackBuffer,
    previousPositionsOffset,
    positionBytes,
  );
  readbackEncoder.copyBufferToBuffer(
    velocitiesBuffer,
    0,
    readbackBuffer,
    velocitiesOffset,
    positionBytes,
  );
  readbackEncoder.copyBufferToBuffer(
    distanceLambdasBuffer,
    0,
    readbackBuffer,
    distanceLambdasOffset,
    DISTANCE_COUNT * 4,
  );
  readbackEncoder.copyBufferToBuffer(
    seamLambdasBuffer,
    0,
    readbackBuffer,
    seamLambdasOffset,
    SEAM_COUNT * 4,
  );
  readbackEncoder.copyBufferToBuffer(
    bendLambdasBuffer,
    0,
    readbackBuffer,
    bendLambdasOffset,
    BEND_COUNT * 4,
  );
  readbackEncoder.copyBufferToBuffer(
    continuumLambdasBuffer,
    0,
    readbackBuffer,
    continuumLambdasOffset,
    CONTINUUM_LAMBDA_FLOAT_COUNT * 4,
  );
  device.queue.submit([readbackEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  throwIfAborted(signal);
  await readbackBuffer.mapAsync(MAP_READ);
  let readback: Uint8Array<ArrayBuffer>;
  try {
    throwIfAborted(signal);
    readback = copiedBytes(readbackBuffer.getMappedRange());
  } finally {
    readbackBuffer.unmap();
  }
  const decodeSnapshot = (baseOffset: number) =>
    Object.freeze({
      positions: new CapturedFloat32Array(
        readback.buffer.slice(baseOffset, baseOffset + positionBytes),
      ),
      velocityDiagnostics: new CapturedUint32Array(
        readback.buffer.slice(
          baseOffset + velocityDiagnosticsOffset,
          baseOffset + bendInvalidOffset,
        ),
      ),
      bendInvalidCount: new DataView(readback.buffer).getUint32(
        baseOffset + bendInvalidOffset,
        true,
      ),
      continuumStatuses: new CapturedUint32Array(
        readback.buffer.slice(
          baseOffset + continuumStatusesOffset,
          baseOffset + contactDiagnosticsOffset,
        ),
      ),
      contactDiagnostics: new CapturedUint32Array(
        readback.buffer.slice(baseOffset + contactDiagnosticsOffset, baseOffset + snapshotBytes),
      ),
    });
  return Object.freeze({
    checkpoint: decodeSnapshot(0),
    final: decodeSnapshot(snapshotBytes),
    retainedState: Object.freeze({
      previousPositions: new CapturedFloat32Array(
        readback.buffer.slice(previousPositionsOffset, velocitiesOffset),
      ),
      velocities: new CapturedFloat32Array(
        readback.buffer.slice(velocitiesOffset, distanceLambdasOffset),
      ),
      distanceLambdas: new CapturedFloat32Array(
        readback.buffer.slice(distanceLambdasOffset, seamLambdasOffset),
      ),
      seamLambdas: new CapturedFloat32Array(
        readback.buffer.slice(seamLambdasOffset, bendLambdasOffset),
      ),
      bendLambdas: new CapturedFloat32Array(
        readback.buffer.slice(bendLambdasOffset, continuumLambdasOffset),
      ),
      continuumLambdas: new CapturedFloat32Array(
        readback.buffer.slice(continuumLambdasOffset, totalReadbackBytes),
      ),
    }),
    snapshotBytes,
    retainedStateReadbackBytes,
    totalReadbackBytes,
    totalFrameExecutionWallTimeMs,
    maximumFrameExecutionWallTimeMs,
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
    contactCorrectedParticleEventCount <= (PARTICLE_COUNT - PIN_COUNT) * FRAME_COUNT &&
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

export function projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5(
  owner: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionProjectionV5 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner as object);
  if (!record) return null;
  const publicOwner = owner as BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5;
  return Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_PROJECTION_V5,
    reportCanonicalSha256: publicOwner.report.seal.canonicalSha256,
    frame16CheckpointPositionsInvMassKg: new CapturedFloat32Array(
      record.frame16CheckpointPositionsInvMassKg,
    ),
    frame16CheckpointPositions3M: new CapturedFloat32Array(record.frame16CheckpointPositions3M),
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
    staticPostFrameResponseInputOnly: true as const,
    exactFrameContinuationAuthority: false as const,
    collisionAuthority: false as const,
    runtimeAuthority: false as const,
    fitAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5(
  owner: unknown,
): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner as object);
  if (!record) return false;
  capturedReflectApply(capturedFloat32Fill, record.frame16CheckpointPositionsInvMassKg, [0]);
  capturedReflectApply(capturedFloat32Fill, record.frame16CheckpointPositions3M, [0]);
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
