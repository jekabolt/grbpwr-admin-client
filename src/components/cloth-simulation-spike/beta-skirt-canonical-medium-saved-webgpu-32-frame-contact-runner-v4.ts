import { createBetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseV1 } from './beta-skirt-personalized-female-nonconfined-self-carrier-response-v1';
import { evaluateBetaSkirtExactSweptBodyAuditV1 } from './beta-skirt-exact-swept-body-audit-v1';
import { auditBetaSkirtObserved32StaticCarrierStateV1 } from './beta-skirt-observed32-static-carrier-state-audit-v1';
import { serializeBetaSkirtObserved16SafeguardedDiagnosticAbiV1 } from './beta-skirt-observed16-safeguarded-diagnostic-abi-v1';
/* global GPUBindGroup, GPUBuffer, GPUCommandEncoder, GPUComputePipeline, GPUDevice, GPUShaderModuleDescriptor */

import {
  XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2,
  XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2,
  XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2,
  getXpbdEmbeddedScalarBendPipelineIdentityV2,
  xpbdEmbeddedScalarBendShaderDescriptorV2,
} from 'lib/cloth/runtime/webgpu/xpbd-embedded-scalar-bend-kernel-v2';

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
  projectBetaSkirtSavedAnnularObservedPlacementRuntimeSourceV1 as projectObservedSource,
  getBetaSkirtSavedAnnularObservedPlacementRuntimeSourceLifetimeV1 as observedSourceLifetime,
  type BetaSkirtSavedAnnularObservedPlacementRuntimeSourceProjectionV1,
} from './beta-skirt-saved-annular-observed-placement-runtime-source-v1';
import {
  projectBetaSkirtSavedAnnularObservedPlacement16FrameContactV1 as projectObserved16,
  getBetaSkirtSavedAnnularObservedPlacement16FrameContactLifetimeV1 as observed16Lifetime,
  type BetaSkirtSavedAnnularObservedPlacement16FrameContactProjectionV1,
} from './beta-skirt-saved-annular-observed-placement-16-frame-contact-v1';
import {
  evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2,
  BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2,
  type BetaSkirtRenderedBodyCollisionDiagnosticReportV2,
} from './beta-skirt-rendered-body-collision-diagnostic-v2';
import {
  computeBetaSkirtRenderedBodyTerminalCollisionReportSha256V42,
  refreshBetaSkirtRenderedBodySignedVertexContactsV42,
  type BetaSkirtRenderedBodySignedVertexContactRefreshResultV42,
} from './beta-skirt-rendered-body-signed-vertex-contact-refresh-v42';
import { validateMeasurementSurfaceSelfIntersectionV1 } from 'lib/cloth/body/measurement-surface-self-intersection-v1';
import {
  evaluateBetaSkirtCanonicalMediumConfinedContactPairV2,
  type BetaSkirtCanonicalMediumContactPairWitnessV2,
} from './beta-skirt-canonical-medium-confined-ao-seam-contact-witness-v2';
import { betaSkirtSaved32SelfOrientationValidationV1 as selfValidation } from './beta-skirt-canonical-medium-saved-webgpu-32-frame-self-orientation-v1';
import {
  TRIANGLE_STRAIN_UTILIZATION_PORT_V1,
  sealTriangleStrainUtilizationPortV1,
  auditTriangleStrainUtilizationPortV1,
  executeTriangleStrainUtilizationGpuPortV1,
  evaluateTriangleStrainUtilizationCpuV1,
  BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1,
  TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC_WGSL_V1,
  type TriangleStrainUtilizationPortBindingsV1,
} from './beta-skirt-canonical-medium-strain-utilization-diagnostic-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CONTACT_RUNNER_REPORT_V4 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-report/4' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CONTACT_RUNNER_OWNER_V4 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-owner/4' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CONTACT_RUNNER_PROJECTION_V4 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-projection/4' as const;

const FRAME_COUNT = 32;
const FRAME_16_CHECKPOINT_COUNT = 16 as const;
const PARTICLE_COUNT = 580;
const TRIANGLE_COUNT = 912;
const DISTANCE_COUNT = 1490;
const SEAM_COUNT = 34;
const BEND_COUNT = 1246;
const CONTINUUM_COUNT = 912;
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

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOptionsV4 = Readonly<{
  gpu?: GpuProvider;
  sessionIdFactory?: CreateXpbdDeviceSessionOptions['sessionIdFactory'];
  signal?: AbortSignal;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerBlockerV4 =
  | 'frame-16-saved-16f-checkpoint-mismatch'
  | 'contact-correction-cap-hit'
  | 'post-frame-actual-body-gate-failed'
  | 'post-frame-structural-quality-failed'
  | 'post-frame-self-orientation-not-evaluated'
  | 'post-frame-strain-utilization-not-evaluated'
  | 'post-frame-distortion-acceptance-not-established'
  | 'anisotropic-bend-collapsed-to-conservative-scalar'
  | 'visual-material-not-calibrated'
  | 'settle-fit-authority-not-established';

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerReportV4 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CONTACT_RUNNER_REPORT_V4;
  status: 'diagnostic-completed' | 'diagnostic-blocked';
  decision:
    | 'MEASURED_32_FRAME_EXACT_BODY_CONTACT_AND_STRUCTURAL_POSTGATE_CLEAR_WITH_DOWNSTREAM_BLOCKERS'
    | 'BLOCK_32_FRAME_EXACT_BODY_CONTACT_AT_CORRECTION_CAP'
    | 'BLOCK_32_FRAME_EXACT_BODY_CONTACT_AT_POSTGATE';
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
  blockers: readonly BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerBlockerV4[];
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
    collisionAuthority: false;
    runtimeAuthority: false;
    fitAuthority: false;
    productionAuthority: false;
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-saved-32-frame-webgpu-actual-body-contact-diagnostic-only';
  }>;
}>;

declare const runnerOwnerBrand: unique symbol;
export type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CONTACT_RUNNER_OWNER_V4;
  report: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerReportV4;
  readonly [runnerOwnerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerProjectionV4 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CONTACT_RUNNER_PROJECTION_V4;
  reportCanonicalSha256: string;
  frame16CheckpointPositionsInvMassKg: Float32Array;
  frame16CheckpointPositions3M: Float32Array;
  finalPositionsInvMassKg: Float32Array;
  finalPositions3M: Float32Array;
  normalizedTriangles: Uint32Array;
  callerOwnedMutableBinaryCopies: true;
  collisionAuthority: false;
  runtimeAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerErrorCodeV4 =
  | 'unsupported-webgpu'
  | 'aborted'
  | 'source-owner-unavailable'
  | 'saved-16-frame-owner-unavailable'
  | 'saved-checkpoint-binding-mismatch'
  | 'v5-contract-mismatch'
  | 'pipeline-identity-mismatch'
  | 'gpu-execution-failed'
  | 'invalid-gpu-state'
  | 'frame-16-saved-checkpoint-mismatch'
  | 'post-frame-evidence-not-evaluated'
  | 'collision-diagnostic-failed'
  | 'contact-correction-cap-hit'
  | 'post-frame-actual-body-gate-failed';

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerResultV4 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4;
      report: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerReportV4;
    }>
  | Readonly<{
      ok: false;
      code: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerErrorCodeV4;
      detail: string;
      owner?: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4;
      report?: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerReportV4;
    }>;

type OwnerRecord = {
  frame16CheckpointPositionsInvMassKg: Float32Array;
  frame16CheckpointPositions3M: Float32Array;
  finalPositionsInvMassKg: Float32Array;
  finalPositions3M: Float32Array;
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
  bendLimitedStepCount?: number,
): Uint8Array<ArrayBuffer> {
  const bend = new CapturedUint32Array(
    bendLimitedStepCount === undefined
      ? [bendInvalidCount]
      : [bendInvalidCount, bendLimitedStepCount],
  );
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

function checkpointOwnersRemainLive(
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runner16FrameOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  checkpointExpectation: BetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4,
): boolean {
  const runtimeProjection =
    projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSourceOwner);
  const runner16Projection =
    projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2(runner16FrameOwner);
  return (
    runtimeProjection?.reportCanonicalSha256 ===
      checkpointExpectation.runtimeSourceCanonicalSha256 &&
    runner16Projection?.reportCanonicalSha256 === checkpointExpectation.runner16FrameCanonicalSha256
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
  collisionAuthority: false as const,
  runtimeAuthority: false as const,
  fitAuthority: false as const,
  productionAuthority: false as const,
});

export async function runBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(
  canvas: HTMLCanvasElement,
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runner16FrameOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  checkpointExpectationInput: unknown,
  options: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOptionsV4 = {},
): Promise<BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerResultV4> {
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
    checkpointExpectation.positions3MSha256 !== runner16Report.bindings.finalPositions3MSha256
  )
    return Object.freeze({
      ok: false,
      code: 'saved-checkpoint-binding-mismatch' as const,
      detail: 'Saved 16-frame checkpoint lineage differs from its live runtime/runner owners.',
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
  let velocityDiagnostics: Uint32Array | null = null;
  let bendInvalidCount = 0;
  let continuumStatuses: Uint32Array | null = null;
  let contactDiagnostics: Uint32Array | null = null;
  let totalFrameExecutionWallTimeMs = 0;
  let maximumFrameExecutionWallTimeMs = 0;
  let snapshotReadbackByteLength = 0;
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
    if (!checkpointOwnersRemainLive(runtimeSourceOwner, runner16FrameOwner, checkpointExpectation))
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
    if (!checkpointOwnersRemainLive(runtimeSourceOwner, runner16FrameOwner, checkpointExpectation))
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
    if (!checkpointOwnersRemainLive(runtimeSourceOwner, runner16FrameOwner, checkpointExpectation))
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
    velocityDiagnostics = observation.final.velocityDiagnostics;
    bendInvalidCount = observation.final.bendInvalidCount;
    continuumStatuses = observation.final.continuumStatuses;
    contactDiagnostics = observation.final.contactDiagnostics;
    snapshotReadbackByteLength = observation.snapshotBytes;
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

  if (!checkpointOwnersRemainLive(runtimeSourceOwner, runner16FrameOwner, checkpointExpectation))
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
      bodyPositions3MSha256,
      bodyTrianglesSha256,
    ] = await Promise.all([
      digestBytes(float32LeBytes(prepared.sourcePositions3M)),
      digestBytes(float32LeBytes(checkpointPositions)),
      digestBytes(float32LeBytes(checkpointPositions3M)),
      digestBytes(checkpointDiagnosticsBytes),
      digestBytes(float32LeBytes(finalPositions)),
      digestBytes(float32LeBytes(finalPositions3M)),
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
  if (!checkpointOwnersRemainLive(runtimeSourceOwner, runner16FrameOwner, checkpointExpectation))
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
  if (!checkpointOwnersRemainLive(runtimeSourceOwner, runner16FrameOwner, checkpointExpectation))
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
  const blockers: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerBlockerV4[] = [
    ...(contactCorrectionCapHit ? (['contact-correction-cap-hit'] as const) : []),
    ...(!collisionClear ? (['post-frame-actual-body-gate-failed'] as const) : []),
    ...(!qualityClear ? (['post-frame-structural-quality-failed'] as const) : []),
    'post-frame-self-orientation-not-evaluated',
    'post-frame-strain-utilization-not-evaluated',
    'post-frame-distortion-acceptance-not-established',
    'anisotropic-bend-collapsed-to-conservative-scalar',
    'visual-material-not-calibrated',
    'settle-fit-authority-not-established',
  ];
  const reportWithoutSeal = {
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CONTACT_RUNNER_REPORT_V4,
    status: 'diagnostic-blocked' as const,
    decision: contactCorrectionCapHit
      ? ('BLOCK_32_FRAME_EXACT_BODY_CONTACT_AT_CORRECTION_CAP' as const)
      : collisionClear && qualityClear
        ? ('MEASURED_32_FRAME_EXACT_BODY_CONTACT_AND_STRUCTURAL_POSTGATE_CLEAR_WITH_DOWNSTREAM_BLOCKERS' as const)
        : ('BLOCK_32_FRAME_EXACT_BODY_CONTACT_AT_POSTGATE' as const),
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
  if (!checkpointOwnersRemainLive(runtimeSourceOwner, runner16FrameOwner, checkpointExpectation))
    return Object.freeze({
      ok: false,
      code: 'saved-checkpoint-binding-mismatch' as const,
      detail: 'A checkpoint source owner became unavailable while sealing the V4 report.',
    });
  const report: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerReportV4 = Object.freeze({
    ...reportWithoutSeal,
    seal: Object.freeze({
      algorithm: 'SHA-256' as const,
      canonicalSha256: reportSeal,
      authority: 'unsigned-saved-32-frame-webgpu-actual-body-contact-diagnostic-only' as const,
    }),
  });
  const owner = Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CONTACT_RUNNER_OWNER_V4,
    report,
  }) as BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4;
  owners.set(owner, {
    frame16CheckpointPositionsInvMassKg: new CapturedFloat32Array(checkpointPositions),
    frame16CheckpointPositions3M: new CapturedFloat32Array(checkpointPositions3M),
    finalPositionsInvMassKg: new CapturedFloat32Array(finalPositions),
    finalPositions3M: new CapturedFloat32Array(finalPositions3M),
    normalizedTriangles: new CapturedUint32Array(prepared.triangles),
  });
  if (contactCorrectionCapHit)
    return Object.freeze({
      ok: false,
      code: 'contact-correction-cap-hit' as const,
      detail:
        'The exact-mesh contact correction reached its policy cap; downstream clearance is not promotable.',
      owner,
      report,
    });
  if (!collisionClear || !qualityClear)
    return Object.freeze({
      ok: false,
      code: 'post-frame-actual-body-gate-failed' as const,
      detail:
        'The final GPU positions were retained, but the exact actual-body/quality gate blocked promotion.',
      owner,
      report,
    });
  return Object.freeze({
    ok: false as const,
    code: 'post-frame-evidence-not-evaluated' as const,
    detail:
      'Exact contact and structural postgates cleared, but confined self/orientation and strain evidence remain unevaluated.',
    owner,
    report,
  });
}

type Observed32CoreProjection = Pick<
  NonNullable<ReturnType<typeof projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1>>,
  | 'reportCanonicalSha256'
  | 'normalizedV5'
  | 'initialPhysicalPositionsInvMassKg'
  | 'normalizedTriangles'
  | 'seamPairs'
  | 'pinnedWaistVertexIndices'
  | 'collisionInput'
>;
function prepareRun(projection: Observed32CoreProjection) {
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

async function resolvePipelineIdentities(safeguardedBend = false) {
  const crypto = cryptoShim();
  const resetNames = ['distance', 'seam-all-active', 'bend', 'continuum'] as const;
  const [predict, distance, seam, bend, continuum, velocity, contact, ...resets] =
    await Promise.all([
      getXpbdPredictPipelineIdentityV1({ crypto }),
      getXpbdDistancePipelineIdentityV1({ crypto }),
      getXpbdSeamSolvePipelineIdentityV1({ crypto }),
      safeguardedBend
        ? getXpbdEmbeddedScalarBendPipelineIdentityV2({ crypto })
        : getXpbdEmbeddedScalarBendPipelineIdentityV1({ crypto }),
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
  currentSource?: () => void,
  safeguardedBend = false,
) {
  throwIfAborted(signal);
  currentSource?.();
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
    createPipeline(
      device,
      safeguardedBend
        ? xpbdEmbeddedScalarBendShaderDescriptorV2()
        : xpbdEmbeddedScalarBendShaderDescriptorV1(),
      identities.bend.entryPoint,
    ),
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
  currentSource?.();
  const resetPipelineList = await Promise.all(
    resetNames.map((name) =>
      createPipeline(
        device,
        xpbdInitializationCoreResetShaderDescriptorV1(name),
        identities.resets[name].entryPoint,
      ),
    ),
  );
  currentSource?.();
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
    STORAGE | (safeguardedBend ? COPY_SRC : 0),
  );
  const velocitiesBuffer = createEmptyGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium velocities',
    prepared.physical.byteLength,
    STORAGE,
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
    STORAGE,
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
    STORAGE,
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
    STORAGE,
  );
  const bendDiagnosticsBytes = safeguardedBend ? XPBD_EMBEDDED_SCALAR_BEND_DIAGNOSTICS_BYTES_V2 : 4;
  const bendInvalidBuffer = createEmptyGpuBuffer(
    device,
    trackedBuffers,
    'canonical-medium bend invalid counter',
    bendDiagnosticsBytes,
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
    STORAGE,
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
  const continuumStatusesOffset = bendInvalidOffset + bendDiagnosticsBytes;
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
      bendDiagnosticsBytes,
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
    currentSource?.();
    const frameWallTimeMs = performance.now() - frameStartedAt;
    totalFrameExecutionWallTimeMs += frameWallTimeMs;
    maximumFrameExecutionWallTimeMs = Math.max(maximumFrameExecutionWallTimeMs, frameWallTimeMs);
    throwIfAborted(signal);
  }

  const finalPreviousOffset = snapshotBytes * 2;
  const totalReadbackBytes = finalPreviousOffset + (safeguardedBend ? positionBytes : 0);
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
  if (safeguardedBend)
    readbackEncoder.copyBufferToBuffer(
      previousPositionsBuffer,
      0,
      readbackBuffer,
      finalPreviousOffset,
      positionBytes,
    );
  device.queue.submit([readbackEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  currentSource?.();
  throwIfAborted(signal);
  await readbackBuffer.mapAsync(MAP_READ);
  let readback: Uint8Array<ArrayBuffer>;
  try {
    currentSource?.();
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
      bendLimitedStepCount: safeguardedBend
        ? new DataView(readback.buffer).getUint32(baseOffset + bendInvalidOffset + 4, true)
        : 0,
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
    ...(safeguardedBend
      ? {
          finalPreviousPositionsInvMassKg: new CapturedFloat32Array(
            readback.buffer.slice(finalPreviousOffset, totalReadbackBytes),
          ),
        }
      : {}),
    snapshotBytes,
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

export function projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(
  owner: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerProjectionV4 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner as object);
  if (!record) return null;
  const publicOwner = owner as BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4;
  return Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CONTACT_RUNNER_PROJECTION_V4,
    reportCanonicalSha256: publicOwner.report.seal.canonicalSha256,
    frame16CheckpointPositionsInvMassKg: new CapturedFloat32Array(
      record.frame16CheckpointPositionsInvMassKg,
    ),
    frame16CheckpointPositions3M: new CapturedFloat32Array(record.frame16CheckpointPositions3M),
    finalPositionsInvMassKg: new CapturedFloat32Array(record.finalPositionsInvMassKg),
    finalPositions3M: new CapturedFloat32Array(record.finalPositions3M),
    normalizedTriangles: new CapturedUint32Array(record.normalizedTriangles),
    callerOwnedMutableBinaryCopies: true as const,
    collisionAuthority: false as const,
    runtimeAuthority: false as const,
    fitAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(
  owner: unknown,
): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner as object);
  if (!record) return false;
  capturedReflectApply(capturedFloat32Fill, record.frame16CheckpointPositionsInvMassKg, [0]);
  capturedReflectApply(capturedFloat32Fill, record.frame16CheckpointPositions3M, [0]);
  capturedReflectApply(capturedFloat32Fill, record.finalPositionsInvMassKg, [0]);
  capturedReflectApply(capturedFloat32Fill, record.finalPositions3M, [0]);
  capturedReflectApply(capturedUint32Fill, record.normalizedTriangles, [0]);
  owners.delete(owner as object);
  return true;
}

export const BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_32_FRAME_CONTACT_V1 =
  'beta-skirt-saved-annular-observed-placement-32-frame-contact/1' as const;
type ObservedSource32 = BetaSkirtSavedAnnularObservedPlacementRuntimeSourceProjectionV1;
type Observed16 = BetaSkirtSavedAnnularObservedPlacement16FrameContactProjectionV1;
type Observed32Self = Awaited<ReturnType<typeof evaluateObserved32Self>>;
type Observed32Strain = Awaited<ReturnType<typeof evaluateObserved32Strain>>['report'];
export type BetaSkirtSavedAnnularObservedPlacement32FrameContactReportV1 = Readonly<{
  version: typeof BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_32_FRAME_CONTACT_V1;
  sourceKind: 'saved-annular-observed-placement-v3';
  bendSolver: Observed16['report']['bendSolver'];
  status: 'diagnostic-completed' | 'diagnostic-blocked';
  bindings: Readonly<{
    runtimeSourceReportSha256: string;
    observed16ReportSha256: string;
    normalizedV5AggregateSha256: string;
    immutableLocalRestPositionsSha256: string;
    initialWorldPositionsSha256: string;
    finalPositionsInvMassKgSha256: string;
    finalPositions3MSha256: string;
    topologySha256: string;
    bodyPositionsSha256: string;
    bodyTrianglesSha256: string;
  }>;
  checkpoint: Readonly<{
    method: 'reexecute-initial-world-state-0-to32';
    continuation: false;
    actualFrame16PositionsInvMassKgSha256: string;
    actualFrame16Positions3MSha256: string;
    actualFrame16DiagnosticsSha256: string;
    expectedFrame16PositionsInvMassKgSha256: string;
    expectedFrame16Positions3MSha256: string;
    expectedFrame16DiagnosticsSha256: string;
    exactPositionsAnd3728ByteDiagnosticsMatch: true;
  }>;
  config: ReturnType<typeof prepareRun>['reportConfig'];
  workload: ReturnType<typeof prepareRun>['reportWorkload'];
  execution: Readonly<{
    frameSubmissionCount: 32;
    totalComputeDispatchCount: number;
    solverSnapshotReadbackBytes: number;
    solverTotalReadbackBytes: number;
    totalFrameExecutionWallTimeMs: number;
    maximumFrameExecutionWallTimeMs: number;
    invalidVelocityStateCount: number;
    numericInvalidVelocityStateCount: number;
    outOfDomainVelocityStateCount: number;
    bendInvalidConstraintCount: number;
    continuumNonzeroStatusCount: number;
    contactDiagnostics: readonly number[];
    contactCorrectionCapHit: boolean;
    everyInverseMassBitExact: true;
    pinnedParticleCountBitExact: 82;
  }>;
  cleanup: Awaited<ReturnType<typeof executeObserved32Gpu>>['cleanup'];
  sourceReport: ObservedSource32['report'];
  observed16Report: Observed16['report'];
  previewState: 'raw-gpu' | 'static-ao-carrier-corrected';
  rawGpuOutput: Readonly<{
    currentPositionsInvMassKgSha256: string;
    previousPositionsInvMassKgSha256: string;
    positions3MSha256: string;
    previousReadbackByteLength: number;
    stateAudit: ReturnType<typeof auditBetaSkirtObserved32StaticCarrierStateV1> | null;
  }>;
  staticCarrierCorrection:
    | Awaited<ReturnType<typeof correctObserved32StaticCarriers>>['receipt']
    | null;
  postgate: Readonly<{
    collision: BetaSkirtRenderedBodyCollisionDiagnosticReportV2 | null;
    signedRefresh: BetaSkirtRenderedBodySignedVertexContactRefreshResultV42 | null;
    quality: BetaSkirtCoherentEnvelopeQualityReportV1 | null;
    selfOrientation: Observed32Self | null;
    strain: Observed32Strain | null;
    failures: readonly Readonly<{ stage: string; detail: string }>[];
  }>;
  blockers: readonly string[];
  claims: Readonly<{
    sameExisting32FrameGpuExecutorUsed: true;
    exactGenuineObserved16CheckpointCompared: true;
    immutableLocalRestRetained: true;
    worldPinAndRollbackAnchorsUploaded: true;
    bodySourceRebuilt: false;
    staticCorrectionApplied: boolean;
    solverContinuationQualified: false;
    stressPaComputed: false;
    runtimeAuthority: false;
    fitAuthority: false;
    productionAuthority: false;
  }>;
  reportSha256: string;
}>;
declare const observed32Brand: unique symbol;
export type BetaSkirtSavedAnnularObservedPlacement32FrameContactOwnerV1 = Readonly<{
  version: typeof BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_32_FRAME_CONTACT_V1;
  report: BetaSkirtSavedAnnularObservedPlacement32FrameContactReportV1;
  readonly [observed32Brand]: true;
}>;
export type BetaSkirtSavedAnnularObservedPlacement32FrameContactProjectionV1 = Readonly<{
  report: BetaSkirtSavedAnnularObservedPlacement32FrameContactReportV1;
  frame16CheckpointPositionsInvMassKg: Float32Array;
  finalPositionsInvMassKg: Float32Array;
  finalPositions3M: Float32Array;
  normalizedTriangles: Uint32Array;
  strainValues: Float32Array | null;
  strainFlags: Uint32Array | null;
  strainValuesLayout: readonly ['warpStrain', 'weftStrain', 'shearStrain', 'normalizedUtilization'];
  strainUnits: 'dimensionless';
  callerOwnedMutableCopies: true;
}>;
export type BetaSkirtSavedAnnularObservedPlacement32FrameContactResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtSavedAnnularObservedPlacement32FrameContactOwnerV1;
      report: BetaSkirtSavedAnnularObservedPlacement32FrameContactReportV1;
    }>
  | Readonly<{
      ok: false;
      code: string;
      detail: string;
      owner?: BetaSkirtSavedAnnularObservedPlacement32FrameContactOwnerV1;
      report?: BetaSkirtSavedAnnularObservedPlacement32FrameContactReportV1;
    }>;
type Observed32Context = {
  controller: AbortController;
  current: () => void;
  fresh: () => Promise<void>;
  unlink: () => void;
  owner: object | null;
};
type Observed32Record = {
  context: Observed32Context;
  projection: BetaSkirtSavedAnnularObservedPlacement32FrameContactProjectionV1;
};
const observed32Owners = new WeakMap<object, Observed32Record>();
const native32Aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const aborted32 = (s: AbortSignal) => Reflect.apply(native32Aborted, s, []) as boolean;
const add32 = EventTarget.prototype.addEventListener,
  remove32 = EventTarget.prototype.removeEventListener;
function freezeObserved32<T>(value: T): T {
  if (value && typeof value === 'object') {
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
      throw new TypeError('Observed32 report cannot expose mutable binary carriers.');
    Object.values(value).forEach(freezeObserved32);
    Object.freeze(value);
  }
  return value;
}
function waitObserved32<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (aborted32(signal)) {
    void promise.catch(() => undefined);
    return Promise.reject(new RunnerAbortError('Observed32 read cancelled.'));
  }
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      remove32.call(signal, 'abort', cancel);
      fn();
    };
    const cancel = () => finish(() => reject(new RunnerAbortError('Observed32 read cancelled.')));
    add32.call(signal, 'abort', cancel, { once: true });
    if (aborted32(signal)) cancel();
    promise.then(
      (v) => finish(() => resolve(v)),
      (e) => finish(() => reject(e)),
    );
  });
}
function evaluateObserved32Quality(
  sourcePositions3M: Float32Array,
  triangles: Uint32Array,
  finalPositions3M: Float32Array,
): BetaSkirtCoherentEnvelopeQualityReportV1 {
  // The diagnostic deliberately forbids all storage aliasing, including immutable topology.
  return evaluateBetaSkirtCoherentEnvelopeQualityV1({
    sourcePositionsM: new CapturedFloat32Array(sourcePositions3M),
    sourceTriangles: new CapturedUint32Array(triangles),
    candidatePositionsM: new CapturedFloat32Array(finalPositions3M),
    candidateTriangles: new CapturedUint32Array(triangles),
  });
}

function observed32BendCountersValid(checkpointCount: number, finalCount: number): boolean {
  return (
    checkpointCount >>> 0 === checkpointCount &&
    finalCount >>> 0 === finalCount &&
    checkpointCount >= 0 &&
    checkpointCount <= BEND_COUNT * FIXED_ITERATIONS * FRAME_16_CHECKPOINT_COUNT &&
    finalCount >= checkpointCount &&
    finalCount <= BEND_COUNT * FIXED_ITERATIONS * FRAME_COUNT
  );
}

function observed32CheckpointMatches(
  actual: { positions4: Float32Array; positions3: Float32Array; diagnostics: Uint8Array },
  expected: { positions4: Float32Array; positions3: Float32Array; diagnostics: Uint8Array },
): boolean {
  return (
    actual.positions4.length === PARTICLE_COUNT * 4 &&
    actual.positions3.length === PARTICLE_COUNT * 3 &&
    actual.diagnostics.byteLength === 3728 &&
    expected.positions4.length === PARTICLE_COUNT * 4 &&
    expected.positions3.length === PARTICLE_COUNT * 3 &&
    expected.diagnostics.byteLength === 3728 &&
    bytesEqual(actual.positions4, expected.positions4) &&
    bytesEqual(actual.positions3, expected.positions3) &&
    bytesEqual(actual.diagnostics, expected.diagnostics)
  );
}
async function executeObserved32Gpu(
  canvas: HTMLCanvasElement,
  prepared: ReturnType<typeof prepareRun>,
  options: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOptionsV4,
  current: () => void,
) {
  current();
  const gpu = options.gpu ?? navigator.gpu;
  if (!gpu) throw new Error('WebGPU unavailable.');
  const identities = await resolvePipelineIdentities(true);
  current();
  let session: XpbdDeviceSession | null = null,
    lease: XpbdDeviceLease | null = null;
  const buffers: GPUBuffer[] = [];
  const validationMessages: string[] = [],
    deviceLossMessages: string[] = [];
  const cleanup = {
    destroyedBufferCount: 0,
    leaseReleased: false,
    sessionDisposed: false,
    contextUnconfigured: false,
    deviceDestroyed: false,
    validationMessages,
    deviceLossMessages,
  };
  try {
    session = await createXpbdDeviceSession(canvas, {
      gpu,
      sessionIdFactory: options.sessionIdFactory ?? defaultSessionIdFactory,
      onUncapturedError: (m) => validationMessages.push(m),
      onDeviceLost: (i) => deviceLossMessages.push(`${i.reason}: ${i.message}`),
    });
    current();
    lease = session.acquireExclusive();
    const observation = await executeGpuRun(
      lease.device,
      buffers,
      prepared,
      identities,
      options.signal,
      current,
      true,
    );
    current();
    return { observation, cleanup };
  } finally {
    for (const buffer of buffers) {
      try {
        buffer.destroy();
        cleanup.destroyedBufferCount++;
      } catch {
        /* Continue owned cleanup. */
      }
    }
    if (lease) {
      try {
        lease.release();
        cleanup.leaseReleased = true;
      } catch {
        /* Evidence remains false. */
      }
    }
    if (session) {
      try {
        const disposed = await session.dispose();
        cleanup.sessionDisposed = true;
        cleanup.contextUnconfigured = disposed.contextUnconfigured;
        cleanup.deviceDestroyed = disposed.deviceDestroyed;
      } catch {
        /* Evidence remains false. */
      }
    }
  }
}
async function evaluateObserved32Self(
  prepared: ReturnType<typeof prepareRun>,
  final3: Float32Array,
  final4: Float32Array,
  current: () => void,
) {
  current();
  const oracle = validateMeasurementSurfaceSelfIntersectionV1(
    final3,
    prepared.triangles,
    selfValidation.selfPolicy,
  );
  current();
  if (oracle.intersectionCount > selfValidation.maximumRawIntersectionCount)
    throw new Error('Observed32 self witness budget exceeded.');
  const witnesses: BetaSkirtCanonicalMediumContactPairWitnessV2[] = [];
  for (const pair of oracle.intersections) {
    witnesses.push(
      await evaluateBetaSkirtCanonicalMediumConfinedContactPairV2({
        positions: final3,
        triangles: prepared.triangles,
        seamPairs: prepared.seamPairs,
        pair,
        epsilonM: oracle.epsilonM,
        vertexCount: PARTICLE_COUNT,
        requireCanonicalSeamCount: true,
      }),
    );
    current();
  }
  const excluded = witnesses.filter(
    (w) => w.disposition === 'excluded-confined-authenticated-ao-seam-touching',
  ).length;
  const residual = oracle.intersectionCount - excluded;
  const orientation = selfValidation.orientation(
    prepared.sourcePositions3M,
    final3,
    prepared.triangles,
  );
  const pins = selfValidation.seamPinParity({
    sourcePositions4: prepared.physical,
    finalPositions4: final4,
    seamPairs: prepared.seamPairs,
    pins: prepared.pins,
    runnerFinalMaximumSeamGapM: maximumSeamGap(final4, prepared.seamPairs),
  });
  current();
  const exactAccounting =
    witnesses.length === oracle.intersectionCount &&
    excluded + residual === oracle.intersectionCount;
  return {
    oracle,
    witnesses,
    excludedConfinedAuthenticatedAoSeamCount: excluded,
    residualBlockingCount: residual,
    exactRawExcludedResidualAccounting: exactAccounting,
    orientation,
    seamPinParity: pins,
    passed:
      exactAccounting &&
      residual === 0 &&
      orientation.sourceDegenerateTriangleCount === 0 &&
      orientation.finalDegenerateTriangleCount === 0 &&
      orientation.normalReversalCount === 0 &&
      pins.finalMaximumSeamGapM <= MAX_SEAM_GAP_M,
  };
}
function observed32BodyClear(
  prepared: ReturnType<typeof prepareRun>,
  collisionInput: BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  collision: BetaSkirtRenderedBodyCollisionDiagnosticReportV2 | null,
  signed: BetaSkirtRenderedBodySignedVertexContactRefreshResultV42 | null,
  finalPositionsSha256: string,
): boolean {
  return (
    !!collision &&
    collision.status === 'signed-clearance-measured' &&
    collision.claims.signedClassificationDefensible &&
    collision.binding.garmentPositionsSha256 === finalPositionsSha256 &&
    collisionReplayRetainsSource(prepared.collisionInput, {
      ...collisionInput,
      binding: collision.binding,
    }) &&
    collision.intersections.bodySelfIntersectionCount === 0 &&
    collision.intersections.bodyGarmentTriangleIntersectionCount === 0 &&
    collision.clearance.penetratingVertexCount === 0 &&
    collision.clearance.unsafeVertexCount === 0 &&
    collision.clearance.ambiguousSignVertexCount === 0 &&
    collision.clearance.minimumSignedClearanceM !== null &&
    collision.clearance.minimumSignedClearanceM >= EXACT_POSTGATE_MINIMUM_SIGNED_CLEARANCE_M &&
    signed?.contacts.length === 0
  );
}

/** All post-deformation diagnostics consume the same exact candidate and unchanged body binding. */
async function rebuildObserved32PhysicalPostgate(
  prepared: ReturnType<typeof prepareRun>,
  candidate4: Float32Array,
  current: () => void,
) {
  current();
  const candidate3 = positions3(candidate4);
  const [positions4Sha256, positions3Sha256] = await Promise.all([
    digestBytes(float32LeBytes(candidate4)),
    digestBytes(float32LeBytes(candidate3)),
  ]);
  current();
  const collisionInput = finalCollisionInput(prepared.collisionInput, candidate3, positions3Sha256);
  if (!collisionReplayRetainsSource(prepared.collisionInput, collisionInput))
    throw new Error('Observed32 candidate changed the exact retained source/body binding.');
  let collision: BetaSkirtRenderedBodyCollisionDiagnosticReportV2 | null = null;
  let signed: BetaSkirtRenderedBodySignedVertexContactRefreshResultV42 | null = null;
  let quality: BetaSkirtCoherentEnvelopeQualityReportV1 | null = null;
  let self: Observed32Self | null = null;
  const failures: { stage: string; detail: string }[] = [];
  const failed = (stage: string, error: unknown) => {
    current();
    failures.push({ stage, detail: error instanceof Error ? error.message : 'Diagnostic failed.' });
  };
  try {
    quality = evaluateObserved32Quality(prepared.sourcePositions3M, prepared.triangles, candidate3);
    current();
  } catch (error) {
    failed('quality', error);
  }
  try {
    collision = await evaluateBetaSkirtRenderedBodyCollisionDiagnosticV2(collisionInput);
    current();
    const terminalSha =
      await computeBetaSkirtRenderedBodyTerminalCollisionReportSha256V42(collision);
    current();
    signed = await refreshBetaSkirtRenderedBodySignedVertexContactsV42({
      extractionRound: 0,
      collisionInput,
      terminalCollisionReport: collision,
      terminalReceiptBinding: {
        collisionInputSha256: collision.contentFingerprintSha256,
        terminalCollisionReportSha256: terminalSha,
        collisionPolicyContentSha256:
          BETA_SKIRT_RENDERED_BODY_COLLISION_POLICY_IDENTITY_V2.policyContentSha256,
      },
    });
    current();
  } catch (error) {
    failed('actual-body', error);
  }
  try {
    self = await evaluateObserved32Self(prepared, candidate3, candidate4, current);
    current();
  } catch (error) {
    failed('self-orientation', error);
  }
  return {
    candidate3,
    positions4Sha256,
    positions3Sha256,
    collisionInput,
    collision,
    signed,
    quality,
    self,
    failures,
    bodyClear: observed32BodyClear(prepared, collisionInput, collision, signed, positions3Sha256),
  };
}

/** A bounded static preview response; never a resumed solver state or a source/body authority. */
async function correctObserved32StaticCarriers(
  prepared: ReturnType<typeof prepareRun>,
  rawCurrent: Float32Array,
  rawPrevious: Float32Array,
  rawPostgate: Awaited<ReturnType<typeof rebuildObserved32PhysicalPostgate>>,
  current: () => void,
  fresh: () => Promise<void>,
) {
  current();
  const self = rawPostgate.self;
  if (
    !rawPostgate.bodyClear ||
    rawPostgate.failures.length ||
    rawPostgate.quality?.blockers.length !== 0 ||
    rawPostgate.quality.triangle?.normalReversalCount !== 0 ||
    !self ||
    !self.exactRawExcludedResidualAccounting ||
    self.residualBlockingCount < 1 ||
    self.orientation.sourceDegenerateTriangleCount !== 0 ||
    self.orientation.finalDegenerateTriangleCount !== 0 ||
    self.orientation.normalReversalCount !== 0 ||
    !self.seamPinParity.exactPinMaskParity
  )
    throw new Error(
      'Observed32 static response requires clear raw body/quality and exact residual self evidence.',
    );
  const residualWitnesses = self.witnesses.filter(
    (w) => w.disposition !== 'excluded-confined-authenticated-ao-seam-touching',
  );
  if (
    residualWitnesses.length !== self.residualBlockingCount ||
    residualWitnesses.some((w) => w.disposition !== 'residual-touching-non-confined-feature')
  )
    throw new Error(
      'Observed32 static response does not support this complete residual witness set.',
    );
  const rawPreviousSha256 = await digestBytes(float32LeBytes(rawPrevious));
  current();
  await fresh();
  current();
  const response = await createBetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseV1({
    currentPositionsInvMass: rawCurrent,
    previousPositionsInvMass: rawPrevious,
    activeSeamPairs: prepared.seamPairs,
    fixedHandleVertexIndices: prepared.pins,
    epsilonM: self.oracle.epsilonM,
    residualWitnesses,
  });
  current();
  const candidateCurrent = new CapturedFloat32Array(response.candidatePositionsInvMass);
  const candidatePrevious = new CapturedFloat32Array(response.candidatePreviousPositionsInvMass);
  const [candidateCurrentSha256, candidatePreviousSha256] = await Promise.all([
    digestBytes(float32LeBytes(candidateCurrent)),
    digestBytes(float32LeBytes(candidatePrevious)),
  ]);
  current();
  if (
    response.report.binding.sourcePositionsInvMassSha256 !== rawPostgate.positions4Sha256 ||
    response.report.binding.sourcePreviousPositionsInvMassSha256 !== rawPreviousSha256 ||
    response.report.binding.candidatePositionsInvMassSha256 !== candidateCurrentSha256 ||
    response.report.binding.candidatePreviousPositionsInvMassSha256 !== candidatePreviousSha256
  )
    throw new Error('Observed32 static response current/previous byte binding drifted.');
  const stateAudit = auditBetaSkirtObserved32StaticCarrierStateV1({
    initialPositionsXYZW: prepared.physical,
    rawCurrentPositionsXYZW: rawCurrent,
    rawPreviousPositionsXYZW: rawPrevious,
    candidateCurrentPositionsXYZW: candidateCurrent,
    candidatePreviousPositionsXYZW: candidatePrevious,
    pinnedVertexIds: prepared.pins,
    seamVertexPairs: prepared.seamPairs,
    epsilonM: self.oracle.epsilonM,
  });
  current();
  if (!stateAudit.passed)
    throw new Error(
      'Observed32 static correction state audit blocked: ' + stateAudit.blockers.join('; '),
    );
  await fresh();
  current();
  const candidatePostgate = await rebuildObserved32PhysicalPostgate(
    prepared,
    candidateCurrent,
    current,
  );
  current();
  if (candidatePostgate.positions4Sha256 !== candidateCurrentSha256)
    throw new Error('Observed32 corrected postgate changed the candidate byte binding.');
  const previousToCurrentBody = evaluateBetaSkirtExactSweptBodyAuditV1({
    previousPositionsInvMass: candidatePrevious,
    currentPositionsInvMass: candidateCurrent,
    bodyPositionsM: prepared.bodyPositions,
    bodyTriangles: prepared.bodyTriangles,
  });
  current();
  const correctionBodyPath = evaluateBetaSkirtExactSweptBodyAuditV1({
    previousPositionsInvMass: rawCurrent,
    currentPositionsInvMass: candidateCurrent,
    bodyPositionsM: prepared.bodyPositions,
    bodyTriangles: prepared.bodyTriangles,
  });
  current();
  const accepted =
    candidatePostgate.bodyClear &&
    candidatePostgate.failures.length === 0 &&
    candidatePostgate.quality?.blockers.length === 0 &&
    candidatePostgate.quality.triangle?.normalReversalCount === 0 &&
    candidatePostgate.self?.passed === true &&
    previousToCurrentBody.status === 'clear' &&
    correctionBodyPath.status === 'clear';
  await fresh();
  current();
  const publicPostgate = (value: typeof rawPostgate) => ({
    positionsInvMassKgSha256: value.positions4Sha256,
    positions3MSha256: value.positions3Sha256,
    collision: value.collision,
    signedRefresh: value.signed,
    quality: value.quality,
    selfOrientation: value.self,
    failures: value.failures,
  });
  return {
    accepted,
    candidateCurrent,
    candidatePrevious,
    candidatePostgate,
    receipt: {
      version: 'beta-skirt-observed32-static-carrier-correction/1' as const,
      status: accepted ? ('candidate-ready-for-strain' as const) : ('candidate-blocked' as const),
      rawCurrentSha256: rawPostgate.positions4Sha256,
      rawPreviousSha256,
      candidateCurrentSha256,
      candidatePreviousSha256,
      response: response.report,
      stateAudit,
      rawPostgate: publicPostgate(rawPostgate),
      candidatePostgate: publicPostgate(candidatePostgate),
      previousToCurrentBody,
      correctionBodyPath,
      claims: {
        staticPreviewOnly: true as const,
        genuineGpuPreviousReadbackUsed: true as const,
        rawSolverOutputMutated: false as const,
        restMaterialOrPinsReauthored: false as const,
        velocityStatePreservationEstablished: false as const,
        solverContinuationQualified: false as const,
        sweptSelfEvaluated: false as const,
        freshStrainRequiredAfterCorrection: true as const,
        runtimeAuthority: false as const,
        fitAuthority: false as const,
        productionAuthority: false as const,
      },
    },
  };
}

async function evaluateObserved32Strain(
  canvas: HTMLCanvasElement,
  source: ObservedSource32,
  final4: Float32Array,
  options: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOptionsV4,
  current: () => void,
) {
  current();
  const simulation = source.normalizedV5.simulation,
    continuum = simulation.constraints.continuumStrain;
  const port = await sealTriangleStrainUtilizationPortV1({
    schemaVersion: TRIANGLE_STRAIN_UTILIZATION_PORT_V1,
    vertexCount: simulation.manifest.particleCount,
    triangleCount: continuum.constraintCount,
    materialCount: continuum.materialCount,
    finalPositionsInvMassKg: final4,
    normalizedTopology: source.normalizedTriangles,
    triangleIndices: continuum.triangleIndices,
    triangleRestFrames: continuum.triangleRestFrames,
    materialIndices: continuum.materialIndices,
    materialRecords: continuum.materialRecords,
  });
  current();
  const audit = await auditTriangleStrainUtilizationPortV1(port);
  current();
  if (!audit.ok) throw new Error(`Observed strain port rejected: ${audit.blockers.join('; ')}`);
  const gpu = await executeTriangleStrainUtilizationGpuPortV1(canvas, port, options);
  current();
  const cpu = evaluateTriangleStrainUtilizationCpuV1(port);
  if (
    gpu.values.length !== CONTINUUM_COUNT * 4 ||
    gpu.flags.length !== CONTINUUM_COUNT ||
    cpu.length !== gpu.values.length
  )
    throw new Error('Observed32 strain readback dimensions differ.');
  let maximumCpuGpuAbsoluteDifference = 0,
    invalidTriangleCount = 0;
  for (let i = 0; i < gpu.values.length; i++) {
    if (!Number.isFinite(gpu.values[i]) || !Number.isFinite(cpu[i]))
      throw new Error('Nonfinite observed32 strain.');
    maximumCpuGpuAbsoluteDifference = Math.max(
      maximumCpuGpuAbsoluteDifference,
      Math.abs(gpu.values[i] - cpu[i]),
    );
  }
  for (const flag of gpu.flags) if (flag !== 0) invalidTriangleCount++;
  const [valuesSha256, flagsSha256, kernelSha256, limitsSha256, colorLutSha256] = await Promise.all(
    [
      digestBytes(float32LeBytes(gpu.values)),
      digestBytes(uint32LeBytes(gpu.flags)),
      digestBytes(capturedTextEncoder.encode(TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC_WGSL_V1)),
      digestBytes(
        capturedTextEncoder.encode(
          JSON.stringify(BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1),
        ),
      ),
      digestBytes(
        capturedTextEncoder.encode(JSON.stringify(BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1)),
      ),
    ],
  );
  current();
  if (
    kernelSha256 !== 'd0ec81303ef3935c13163a365434a41b8af5f1f8244add4a93de74a071711386' ||
    limitsSha256 !== 'dbbf4905a48a4bbadc28f930c0466392b8be0cf6a4be79567aef75bdedd922c0' ||
    colorLutSha256 !== '540328bbdb03b793e2f9c5aebb537e7df0faad713115d3303ba719f8235bc372'
  )
    throw new Error('Pinned strain kernel/limits/LUT changed.');
  return {
    values: gpu.values,
    flags: gpu.flags,
    report: {
      mode: 'provisional-strain-utilization' as const,
      units: 'dimensionless' as const,
      restReference: 'immutable-local-v5' as const,
      stressPaComputed: false as const,
      calibrated: false as const,
      bindings: port.bindings as TriangleStrainUtilizationPortBindingsV1,
      valuesSha256,
      flagsSha256,
      kernelSha256,
      limitsSha256,
      colorLutSha256,
      maximumCpuGpuAbsoluteDifference,
      cpuGpuTolerance: 0.00001 as const,
      invalidTriangleCount,
      passed: invalidTriangleCount === 0 && maximumCpuGpuAbsoluteDifference <= 0.00001,
      gpuWallTimeMs: gpu.gpuWallTimeMs,
      destroyedBufferCount: gpu.destroyedBufferCount,
      validationMessages: gpu.validationMessages,
    },
  };
}

/** Fixed genuine observed-source + genuine observed16 dispatcher. Reexecutes 0→32, never continuation. */
export async function runBetaSkirtSavedAnnularObservedPlacement32FrameContactV1(
  canvas: HTMLCanvasElement,
  sourceOwner: unknown,
  runner16Owner: unknown,
  options: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOptionsV4 = {},
): Promise<BetaSkirtSavedAnnularObservedPlacement32FrameContactResultV1> {
  let context: Observed32Context | null = null;
  try {
    const callerSignal = options.signal;
    if (callerSignal !== undefined && aborted32(callerSignal))
      throw new RunnerAbortError('Observed32 cancelled.');
    const sourceLife = observedSourceLifetime(sourceOwner),
      runner16Life = observed16Lifetime(runner16Owner);
    if (!sourceLife || !runner16Life)
      return Object.freeze({
        ok: false,
        code: 'observed-source-or16-owner-unavailable',
        detail: 'Genuine live observed source and observed16 owners required.',
      });
    const controller = new AbortController();
    const attached: AbortSignal[] = [];
    const current = () => {
      if (aborted32(controller.signal)) throw new RunnerAbortError('Observed32 revoked.');
      const s = observedSourceLifetime(sourceOwner),
        r = observed16Lifetime(runner16Owner);
      if (
        s !== sourceLife ||
        r !== runner16Life ||
        aborted32(sourceLife) ||
        aborted32(runner16Life) ||
        aborted32(controller.signal)
      )
        throw new RunnerAbortError('Observed32 parent replaced/revoked.');
    };
    const unlink = () => {
      for (const s of attached) remove32.call(s, 'abort', cancel);
      attached.length = 0;
    };
    const cancel = () => {
      controller.abort();
      if (context?.owner)
        disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1(context.owner);
    };
    context = { controller, current, fresh: async () => undefined, unlink, owner: null };
    const links = [sourceLife, runner16Life, ...(callerSignal ? [callerSignal] : [])];
    for (const s of links) {
      add32.call(s, 'abort', cancel, { once: true });
      attached.push(s);
    }
    if (links.some(aborted32)) cancel();
    current();
    const source = await projectObservedSource(sourceOwner, controller.signal);
    current();
    const frame16 = projectObserved16(runner16Owner);
    current();
    if (!source || !frame16) throw new Error('Observed32 fresh source or16 unavailable.');
    const sourceSha = source.report.reportSha256,
      frame16Sha = frame16.report.seal.canonicalSha256;
    if (
      frame16.report.sourceReport.reportSha256 !== sourceSha ||
      frame16.report.bindings.runtimeSourceCanonicalSha256 !== sourceSha ||
      frame16.report.bindings.normalizedV5AggregateSha256 !==
        source.normalizedV5.seal.aggregateSha256 ||
      frame16.report.bindings.sourcePositions3MSha256 !==
        source.report.bindings.sourcePositions3MSha256 ||
      frame16.report.bindings.bodyPositions3MSha256 !==
        source.report.bindings.bodyPositions3MSha256 ||
      frame16.report.bindings.bodyTrianglesSha256 !== source.report.bindings.bodyTrianglesSha256 ||
      !bytesEqual(frame16.normalizedTriangles, source.normalizedTriangles)
    )
      throw new Error('Observed16 checkpoint belongs to different exact source/body/rest.');
    context.fresh = async () => {
      current();
      const s = await projectObservedSource(sourceOwner, controller.signal);
      current();
      const r = projectObserved16(runner16Owner);
      current();
      if (
        !s ||
        !r ||
        s.report.reportSha256 !== sourceSha ||
        r.report.seal.canonicalSha256 !== frame16Sha
      )
        throw new RunnerAbortError('Observed32 receipt/source drift.');
    };
    await validateDigestAuthority();
    current();
    const expectedDiagnostics = serializeBetaSkirtObserved16SafeguardedDiagnosticAbiV1(
      frame16.report,
    );
    const [expected4, expected3, expectedDiag] = await Promise.all([
      digestBytes(float32LeBytes(frame16.finalPositionsInvMassKg)),
      digestBytes(float32LeBytes(frame16.finalPositions3M)),
      digestBytes(expectedDiagnostics),
    ]);
    current();
    if (
      expected3 !== frame16.report.bindings.finalPositions3MSha256 ||
      !bytesEqual(positions3(frame16.finalPositionsInvMassKg), frame16.finalPositions3M)
    )
      throw new Error('Observed16 exact vec4/vec3 bytes differ.');
    const projection: Observed32CoreProjection = {
      reportCanonicalSha256: sourceSha,
      normalizedV5: source.normalizedV5,
      initialPhysicalPositionsInvMassKg: source.initialWorldPositionsInvMassKg,
      normalizedTriangles: source.normalizedTriangles,
      seamPairs: source.assemblyOrderSeamPairs,
      pinnedWaistVertexIndices: source.waistPinVertexIndices,
      collisionInput: source.collisionInput,
    };
    const prepared = prepareRun(projection);
    await context.fresh();
    current();
    const run = await executeObserved32Gpu(
      canvas,
      prepared,
      { ...options, signal: controller.signal },
      current,
    );
    current();
    await context.fresh();
    current();
    const { observation, cleanup } = run,
      checkpoint = observation.checkpoint,
      final = observation.final;
    if (
      cleanup.validationMessages.length ||
      cleanup.deviceLossMessages.length ||
      !cleanup.leaseReleased ||
      !cleanup.sessionDisposed ||
      !cleanup.contextUnconfigured ||
      !cleanup.deviceDestroyed
    )
      throw new Error('Observed32 GPU lifecycle blocked.');
    const state = inspectFinalState(
      prepared,
      final.positions,
      final.velocityDiagnostics,
      final.bendInvalidCount,
      final.continuumStatuses,
      final.contactDiagnostics,
    );
    if (!state.valid) throw new Error(state.detail);
    if (!observed32BendCountersValid(checkpoint.bendLimitedStepCount, final.bendLimitedStepCount))
      throw new Error(
        'Observed32 bend limiter counters exceed the sealed workload or are not cumulative.',
      );
    const rawPrevious = observation.finalPreviousPositionsInvMassKg;
    if (!rawPrevious || rawPrevious.length !== prepared.physical.length)
      throw new Error('Observed32 genuine final previous-state readback is missing.');
    const rawFinal3 = positions3(final.positions),
      checkpoint3 = positions3(checkpoint.positions);
    const checkpointDiag = diagnosticSnapshotBytes(
      checkpoint.velocityDiagnostics,
      checkpoint.bendInvalidCount,
      checkpoint.continuumStatuses,
      checkpoint.contactDiagnostics,
      checkpoint.bendLimitedStepCount,
    );
    const [actual4, actual3, actualDiag, rawFinal4Sha, rawFinal3Sha, topologySha, rawPreviousSha] =
      await Promise.all([
        digestBytes(float32LeBytes(checkpoint.positions)),
        digestBytes(float32LeBytes(checkpoint3)),
        digestBytes(checkpointDiag),
        digestBytes(float32LeBytes(final.positions)),
        digestBytes(float32LeBytes(rawFinal3)),
        digestBytes(uint32LeBytes(prepared.triangles)),
        digestBytes(float32LeBytes(rawPrevious)),
      ]);
    current();
    if (
      actual4 !== expected4 ||
      actual3 !== expected3 ||
      actualDiag !== expectedDiag ||
      !observed32CheckpointMatches(
        { positions4: checkpoint.positions, positions3: checkpoint3, diagnostics: checkpointDiag },
        {
          positions4: frame16.finalPositionsInvMassKg,
          positions3: frame16.finalPositions3M,
          diagnostics: expectedDiagnostics,
        },
      )
    )
      throw new Error('Observed32 frame16 differs from genuine observed16 checkpoint.');
    if (rawFinal3Sha === source.report.bindings.sourcePositions3MSha256)
      throw new Error('Observed32 raw final motion proof failed.');
    const rawPostgate = await rebuildObserved32PhysicalPostgate(prepared, final.positions, current);
    current();
    if (
      rawPostgate.positions4Sha256 !== rawFinal4Sha ||
      rawPostgate.positions3Sha256 !== rawFinal3Sha
    )
      throw new Error('Observed32 raw postgate byte binding drifted.');
    let selectedPostgate = rawPostgate;
    let selectedFinal4 = final.positions;
    let correction: Awaited<ReturnType<typeof correctObserved32StaticCarriers>> | null = null;
    let rawStateAudit: ReturnType<typeof auditBetaSkirtObserved32StaticCarrierStateV1> | null =
      null;
    let strain: Awaited<ReturnType<typeof evaluateObserved32Strain>> | null = null;
    const failures = [...rawPostgate.failures];
    const failed = (stage: string, e: unknown) => {
      current();
      failures.push({ stage, detail: e instanceof Error ? e.message : 'Diagnostic failed.' });
    };
    try {
      if (!rawPostgate.self) throw new Error('Raw self oracle epsilon unavailable.');
      rawStateAudit = auditBetaSkirtObserved32StaticCarrierStateV1({
        initialPositionsXYZW: prepared.physical,
        rawCurrentPositionsXYZW: final.positions,
        rawPreviousPositionsXYZW: rawPrevious,
        candidateCurrentPositionsXYZW: final.positions,
        candidatePreviousPositionsXYZW: rawPrevious,
        pinnedVertexIds: prepared.pins,
        seamVertexPairs: prepared.seamPairs,
        epsilonM: rawPostgate.self.oracle.epsilonM,
      });
      current();
      if (!rawStateAudit.passed) throw new Error(rawStateAudit.blockers.join('; '));
    } catch (e) {
      failed('raw-current-previous-state', e);
    }
    const contactCap =
      positiveFloatFromBits(final.contactDiagnostics[4]!) >=
      Math.fround(CONTACT_MAXIMUM_CORRECTION_M);
    if (
      !contactCap &&
      rawStateAudit?.passed &&
      failures.length === 0 &&
      rawPostgate.bodyClear &&
      rawPostgate.quality?.blockers.length === 0 &&
      (rawPostgate.self?.residualBlockingCount ?? 0) > 0
    ) {
      try {
        correction = await correctObserved32StaticCarriers(
          prepared,
          final.positions,
          rawPrevious,
          rawPostgate,
          current,
          context.fresh,
        );
        current();
        if (correction.accepted) {
          selectedFinal4 = correction.candidateCurrent;
          selectedPostgate = correction.candidatePostgate;
        } else
          failed(
            'static-carrier-correction',
            new Error('Corrected candidate physical or swept-body gate blocked.'),
          );
      } catch (e) {
        failed('static-carrier-correction', e);
      }
    }
    const { collision, signed, quality, self, bodyClear } = selectedPostgate;
    const final3 = selectedPostgate.candidate3;
    const final4Sha = selectedPostgate.positions4Sha256,
      final3Sha = selectedPostgate.positions3Sha256;
    // The solver is disposed; strain consumes the selected static candidate and immutable V5 rest.
    await context.fresh();
    current();
    try {
      strain = await evaluateObserved32Strain(
        canvas,
        source,
        selectedFinal4,
        { ...options, signal: controller.signal },
        current,
      );
      current();
      if (
        strain.report.bindings.finalPositionsInvMassKgSha256 !== final4Sha ||
        strain.report.bindings.normalizedTopologySha256 !== topologySha
      )
        throw new Error('Observed32 strain does not bind the selected exact candidate/topology.');
    } catch (e) {
      failed('strain', e);
    }
    await context.fresh();
    current();
    const physicalClear =
      !contactCap &&
      rawStateAudit?.passed === true &&
      bodyClear &&
      quality?.blockers.length === 0 &&
      quality.triangle?.normalReversalCount === 0 &&
      self?.passed === true &&
      strain?.report.passed === true &&
      failures.length === 0;
    const blockers = [
      ...(contactCap ? ['contact-correction-cap-hit'] : []),
      ...(!rawStateAudit?.passed ? ['raw-current-previous-state-blocked'] : []),
      ...(!bodyClear ? ['post-frame-actual-body-gate-failed'] : []),
      ...(quality?.blockers.length !== 0 || quality.triangle?.normalReversalCount !== 0
        ? ['post-frame-structural-quality-failed']
        : []),
      ...(!self?.passed ? ['post-frame-self-orientation-blocked'] : []),
      ...(!strain?.report.passed ? ['post-frame-strain-diagnostic-blocked'] : []),
      ...failures.map((f) => 'post-frame-' + f.stage + '-diagnostic-failed'),
      ...(correction?.accepted
        ? ['static-carrier-correction-not-qualified-for-solver-continuation']
        : []),
      'temporal-swept-self-gate-not-evaluated',
      'post-frame-distortion-acceptance-not-established',
      'anisotropic-bend-collapsed-to-conservative-scalar',
      'material-visualization-thresholds-provisional-and-uncalibrated',
      'material-failure-not-evaluated',
      'settle-fit-authority-not-established',
    ];
    await context.fresh();
    current();
    const payload = {
      version: BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_32_FRAME_CONTACT_V1,
      sourceKind: 'saved-annular-observed-placement-v3' as const,
      bendSolver: {
        kernel: XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2,
        sourceSha256: XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2,
        stepBound: 'minimum-current-triangle-altitude-divided-by-eight' as const,
        limitedStepCount: final.bendLimitedStepCount,
        diagnosticsByteLength: 8 as const,
      },
      status: physicalClear ? ('diagnostic-completed' as const) : ('diagnostic-blocked' as const),
      bindings: {
        runtimeSourceReportSha256: sourceSha,
        observed16ReportSha256: frame16Sha,
        normalizedV5AggregateSha256: source.normalizedV5.seal.aggregateSha256,
        immutableLocalRestPositionsSha256: source.report.bindings.localRestPositionsInvMassKgSha256,
        initialWorldPositionsSha256: source.report.bindings.worldPositionsInvMassKgSha256,
        finalPositionsInvMassKgSha256: final4Sha,
        finalPositions3MSha256: final3Sha,
        topologySha256: topologySha,
        bodyPositionsSha256: source.report.bindings.bodyPositions3MSha256,
        bodyTrianglesSha256: source.report.bindings.bodyTrianglesSha256,
      },
      checkpoint: {
        method: 'reexecute-initial-world-state-0-to32' as const,
        continuation: false as const,
        actualFrame16PositionsInvMassKgSha256: actual4,
        actualFrame16Positions3MSha256: actual3,
        actualFrame16DiagnosticsSha256: actualDiag,
        expectedFrame16PositionsInvMassKgSha256: expected4,
        expectedFrame16Positions3MSha256: expected3,
        expectedFrame16DiagnosticsSha256: expectedDiag,
        exactPositionsAnd3728ByteDiagnosticsMatch: true as const,
      },
      config: prepared.reportConfig,
      workload: prepared.reportWorkload,
      execution: {
        frameSubmissionCount: 32 as const,
        totalComputeDispatchCount: prepared.dispatchesPerFrame * 32,
        solverSnapshotReadbackBytes: observation.snapshotBytes,
        solverTotalReadbackBytes: observation.totalReadbackBytes,
        totalFrameExecutionWallTimeMs: observation.totalFrameExecutionWallTimeMs,
        maximumFrameExecutionWallTimeMs: observation.maximumFrameExecutionWallTimeMs,
        invalidVelocityStateCount: final.velocityDiagnostics[0]!,
        numericInvalidVelocityStateCount: final.velocityDiagnostics[1]!,
        outOfDomainVelocityStateCount: final.velocityDiagnostics[2]!,
        bendInvalidConstraintCount: final.bendInvalidCount,
        continuumNonzeroStatusCount: state.continuumNonzeroStatusCount,
        contactDiagnostics: Array.from(final.contactDiagnostics),
        contactCorrectionCapHit: contactCap,
        everyInverseMassBitExact: true as const,
        pinnedParticleCountBitExact: 82 as const,
      },
      cleanup,
      sourceReport: source.report,
      observed16Report: frame16.report,
      previewState: correction?.accepted
        ? ('static-ao-carrier-corrected' as const)
        : ('raw-gpu' as const),
      rawGpuOutput: {
        currentPositionsInvMassKgSha256: rawFinal4Sha,
        previousPositionsInvMassKgSha256: rawPreviousSha,
        positions3MSha256: rawFinal3Sha,
        previousReadbackByteLength: rawPrevious.byteLength,
        stateAudit: rawStateAudit,
      },
      staticCarrierCorrection: correction?.receipt ?? null,
      postgate: {
        collision,
        signedRefresh: signed,
        quality,
        selfOrientation: self,
        strain: strain?.report ?? null,
        failures,
      },
      blockers,
      claims: {
        sameExisting32FrameGpuExecutorUsed: true as const,
        exactGenuineObserved16CheckpointCompared: true as const,
        immutableLocalRestRetained: true as const,
        worldPinAndRollbackAnchorsUploaded: true as const,
        bodySourceRebuilt: false as const,
        staticCorrectionApplied: correction?.accepted === true,
        solverContinuationQualified: false as const,
        stressPaComputed: false as const,
        runtimeAuthority: false as const,
        fitAuthority: false as const,
        productionAuthority: false as const,
      },
    };
    const reportSha256 = await digestBytes(
      capturedTextEncoder.encode(JSON.stringify([payload.version, payload])),
    );
    current();
    await context.fresh();
    current();
    const report: BetaSkirtSavedAnnularObservedPlacement32FrameContactReportV1 = freezeObserved32({
      ...payload,
      reportSha256,
    });
    const owner = Object.freeze({
      version: BETA_SKIRT_SAVED_ANNULAR_OBSERVED_PLACEMENT_32_FRAME_CONTACT_V1,
      report,
    }) as BetaSkirtSavedAnnularObservedPlacement32FrameContactOwnerV1;
    observed32Owners.set(owner, {
      context,
      projection: {
        report,
        frame16CheckpointPositionsInvMassKg: checkpoint.positions.slice(),
        finalPositionsInvMassKg: selectedFinal4.slice(),
        finalPositions3M: final3.slice(),
        normalizedTriangles: prepared.triangles.slice(),
        strainValues: strain?.values.slice() ?? null,
        strainFlags: strain?.flags.slice() ?? null,
        strainValuesLayout: ['warpStrain', 'weftStrain', 'shearStrain', 'normalizedUtilization'],
        strainUnits: 'dimensionless',
        callerOwnedMutableCopies: true,
      },
    });
    context.owner = owner;
    current();
    return physicalClear
      ? Object.freeze({ ok: true, owner, report })
      : Object.freeze({
          ok: false,
          code: 'observed32-physical-postgate-blocked',
          detail: blockers.join('; '),
          owner,
          report,
        });
  } catch (e) {
    if (context?.owner)
      disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1(context.owner);
    return Object.freeze({
      ok: false,
      code: e instanceof RunnerAbortError ? 'aborted' : 'observed32-input-or-execution-blocked',
      detail: e instanceof Error ? e.message : 'Observed32 rejected.',
    });
  } finally {
    if (context && !context.owner) context.unlink();
  }
}
export function getBetaSkirtSavedAnnularObservedPlacement32FrameContactLifetimeV1(
  owner: unknown,
): AbortSignal | null {
  const record = owner && typeof owner === 'object' ? observed32Owners.get(owner) : undefined;
  if (!record) return null;
  try {
    record.context.current();
    return record.context.controller.signal;
  } catch {
    disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1(owner);
    return null;
  }
}
export async function projectBetaSkirtSavedAnnularObservedPlacement32FrameContactV1(
  owner: unknown,
  signal?: AbortSignal,
): Promise<BetaSkirtSavedAnnularObservedPlacement32FrameContactProjectionV1 | null> {
  if (signal !== undefined) {
    try {
      if (aborted32(signal)) return null;
    } catch {
      return null;
    }
  }
  const record = owner && typeof owner === 'object' ? observed32Owners.get(owner) : undefined;
  if (!record) return null;
  try {
    const read = record.context.fresh().catch((e) => {
      disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1(owner);
      throw e;
    });
    await (signal ? waitObserved32(read, signal) : read);
    record.context.current();
    if (signal && aborted32(signal)) return null;
    return capturedStructuredClone(record.projection);
  } catch {
    if (!signal || !aborted32(signal))
      disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1(owner);
    return null;
  }
}
export function disposeBetaSkirtSavedAnnularObservedPlacement32FrameContactV1(
  owner: unknown,
): boolean {
  const record = owner && typeof owner === 'object' ? observed32Owners.get(owner) : undefined;
  if (!record) return false;
  observed32Owners.delete(owner as object);
  record.context.owner = null;
  record.context.unlink();
  record.context.controller.abort();
  const p = record.projection;
  p.frame16CheckpointPositionsInvMassKg.fill(0);
  p.finalPositionsInvMassKg.fill(0);
  p.finalPositions3M.fill(0);
  p.normalizedTriangles.fill(0);
  p.strainValues?.fill(0);
  p.strainFlags?.fill(0);
  return true;
}
