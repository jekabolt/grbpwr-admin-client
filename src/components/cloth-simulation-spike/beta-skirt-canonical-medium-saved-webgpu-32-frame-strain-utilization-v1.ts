import { validateSealedSimulationPackageV5V1 } from '../../lib/cloth/compiler/simulation-package-v5-integrity';

import {
  BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_MAX_READBACK_BYTES_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_READBACK_BYTES_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_VALUE_BYTES_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_FLAG_BYTES_V1,
  TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC_WGSL_V1,
  TRIANGLE_STRAIN_UTILIZATION_PORT_V1,
  auditTriangleStrainUtilizationPortV1,
  evaluateTriangleStrainUtilizationCpuV1,
  executeTriangleStrainUtilizationGpuPortV1,
  sealTriangleStrainUtilizationPortV1,
  type BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOptionsV1,
  type TriangleStrainUtilizationPortBindingsV1,
} from './beta-skirt-canonical-medium-strain-utilization-diagnostic-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerReportV4,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_UTILIZATION_REPORT_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-strain-utilization-report/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_UTILIZATION_OWNER_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-strain-utilization-owner/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_UTILIZATION_PROJECTION_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-strain-utilization-projection/1' as const;

const CPU_PARITY_TOLERANCE = 0.00001 as const;
const FROZEN_V1_KERNEL_SHA256 =
  'd0ec81303ef3935c13163a365434a41b8af5f1f8244add4a93de74a071711386' as const;
const FROZEN_V1_LIMITS_SHA256 =
  'dbbf4905a48a4bbadc28f930c0466392b8be0cf6a4be79567aef75bdedd922c0' as const;
const FROZEN_V1_COLOR_LUT_SHA256 =
  '540328bbdb03b793e2f9c5aebb537e7df0faad713115d3303ba719f8235bc372' as const;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const SHA256 = /^[0-9a-f]{64}$/u;
const ABORT = /abort/iu;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const capturedReflectOwnKeys = Reflect.ownKeys;
const capturedArrayFrom = Array.from;
const capturedArrayJoin = Array.prototype.join;
const capturedArrayIsArray = Array.isArray;
const capturedArrayBufferIsView = ArrayBuffer.isView;
const capturedStringSlice = String.prototype.slice;
const CapturedString = String;
const capturedRegExpTest = RegExp.prototype.test;
const capturedNumberIsFinite = Number.isFinite;
const capturedMathMin = Math.min;
const capturedMathMax = Math.max;
const capturedMathAbs = Math.abs;
const POSITIVE_INFINITY = Number.POSITIVE_INFINITY;
const NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY;
const capturedDataViewSetFloat32 = objectGetOwnPropertyDescriptor(
  DataView.prototype,
  'setFloat32',
)?.value;
const capturedDataViewSetUint32 = objectGetOwnPropertyDescriptor(
  DataView.prototype,
  'setUint32',
)?.value;
const capturedWeakMapGet = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'get')?.value;
const capturedWeakMapSet = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'set')?.value;
const capturedWeakMapDelete = objectGetOwnPropertyDescriptor(WeakMap.prototype, 'delete')?.value;
const capturedAbortSignalPrototype =
  typeof AbortSignal === 'undefined' ? null : AbortSignal.prototype;
const capturedAbortSignalAborted = capturedAbortSignalPrototype
  ? objectGetOwnPropertyDescriptor(capturedAbortSignalPrototype, 'aborted')?.get
  : null;
const arrayBufferPrototype = ArrayBuffer.prototype;
const HEX = objectFreeze(
  capturedArrayFrom({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')),
);
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const CapturedDataView = DataView;
const CapturedWeakMap = WeakMap;
const capturedReflectApply = Reflect.apply;
const capturedFloat32Fill = Float32Array.prototype.fill;
const capturedUint32Fill = Uint32Array.prototype.fill;
const capturedUint8Set = Uint8Array.prototype.set;
const capturedTextEncoder = new TextEncoder();
const capturedTextEncode = TextEncoder.prototype.encode;
const capturedJsonStringify = JSON.stringify.bind(JSON);
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest;

type RangeSummary = Readonly<{ minimum: number; maximum: number }>;

/**
 * Structural provenance only. This witness deliberately cannot prove that the two owners were
 * privately retained by the genuine saved wrapper; the outer WeakMap command must authenticate
 * that fact before and after invoking this adapter.
 */
export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainProvenanceWitnessV1 = Readonly<{
  runtimeProjectionCanonicalSha256: string;
  runtimeReportCanonicalSha256: string;
  runtimeNormalizedV5AggregateSha256: string;
  runtimeNormalizedTopologySha256: string;
  runnerProjectionCanonicalSha256: string;
  runnerReport: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerReportV4;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainProvenanceAuditV1 = Readonly<{
  ok: boolean;
  blockers: readonly string[];
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOptionsV1 =
  BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOptionsV1;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationReportV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_UTILIZATION_REPORT_V1;
  status: 'saved-dxf-32-frame-strain-diagnostic-blocked';
  decision: 'MEASURED_SAVED_32_FRAME_BOUNDED_PER_TRIANGLE_STRAIN_WITH_MATERIAL_BLOCKERS';
  bindings: Readonly<{
    savedRuntimeSourceCanonicalSha256: string;
    saved16FrameCanonicalSha256: string;
    runtimeSourceCanonicalSha256: string;
    runner32FrameCanonicalSha256: string;
    normalizedV5AggregateSha256: string;
    finalPositionsInvMassKgSha256: string;
    finalPositions3MSha256: string;
    normalizedTopologySha256: string;
    port: TriangleStrainUtilizationPortBindingsV1;
    frozenV1KernelSourceSha256: typeof FROZEN_V1_KERNEL_SHA256;
    frozenV1ProvisionalLimitsSha256: typeof FROZEN_V1_LIMITS_SHA256;
    frozenV1ColorLutSha256: typeof FROZEN_V1_COLOR_LUT_SHA256;
    outputValuesFloat32LeSha256: string;
    outputValidityFlagsUint32LeSha256: string;
    outputEnvelopeSha256: string;
  }>;
  workload: Readonly<{
    vertexCount: typeof BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1;
    triangleCount: typeof BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1;
    materialCount: number;
    dispatchCount: 1;
    workgroupSize: 64;
    workgroupCount: 15;
  }>;
  readback: Readonly<{
    valueByteLength: typeof BETA_SKIRT_STRAIN_UTILIZATION_VALUE_BYTES_V1;
    validityFlagByteLength: typeof BETA_SKIRT_STRAIN_UTILIZATION_FLAG_BYTES_V1;
    totalByteLength: typeof BETA_SKIRT_STRAIN_UTILIZATION_READBACK_BYTES_V1;
    maximumByteLength: typeof BETA_SKIRT_STRAIN_UTILIZATION_MAX_READBACK_BYTES_V1;
  }>;
  validity: Readonly<{
    validTriangleCount: number;
    invalidTriangleCount: number;
    flagHistogram: Readonly<Record<string, number>>;
    cpuParityMaximumAbsoluteError: number;
    cpuParityTolerance: typeof CPU_PARITY_TOLERANCE;
  }>;
  ranges: Readonly<{
    warpStrain: RangeSummary;
    weftStrain: RangeSummary;
    shearStrain: RangeSummary;
    normalizedUtilization: RangeSummary;
  }>;
  interpretation: Readonly<{
    triangleCountAtOrAboveProvisionalLimit: number;
    triangleCountAtOrAboveFourTimesProvisionalLimit: number;
    utilizationIsMaterialFailureCriterion: false;
    utilizationIsPhysicalStressOrPa: false;
  }>;
  execution: Readonly<{
    gpuWallTimeMs: number;
    validationMessages: readonly string[];
    destroyedBufferCount: number;
  }>;
  stableEvidence: Readonly<{
    canonicalSha256: string;
    excludesGpuTimingAndVolatileReportSeal: true;
  }>;
  claims: Readonly<{
    savedRuntimeAnd32FrameContentBound: true;
    genuineSavedRuntimeWrapperAuthenticated: false;
    baseRuntimeAnd32FrameOwnersNotReturnedByAdapter: true;
    exactRetainedSaved32FrameProjectionBound: true;
    exactRuntimeSourceV5ContinuumBuffersBound: true;
    frozenV1KernelPortLimitsAndColorLutReused: true;
    gpuPerTriangleDiagnosticExecuted: true;
    boundedReadback: true;
    dimensionlessStrainDiagnosticOnly: true;
    provisionalMaterialVisualizationThresholds: true;
    physicalStressOrPaComputed: false;
    materialFailureEvaluated: false;
    collisionAuthority: false;
    fitAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
  blockers: readonly [
    'post-frame-self-orientation-not-evaluated',
    'material-visualization-thresholds-provisional-and-uncalibrated',
    'physical-stress-and-pa-not-computed',
    'material-failure-not-evaluated',
    'settle-fit-runtime-production-authority-not-established',
  ];
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-structural-saved-32-frame-strain-content-only';
  }>;
}>;

declare const ownerBrand: unique symbol;
export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOwnerV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_UTILIZATION_OWNER_V1;
  report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationReportV1;
  readonly [ownerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationProjectionV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_UTILIZATION_PROJECTION_V1;
  reportCanonicalSha256: string;
  triangleValues: Float32Array;
  validityFlags: Uint32Array;
  normalizedTopology: Uint32Array;
  valuesLayout: readonly ['warpStrain', 'weftStrain', 'shearStrain', 'normalizedUtilization'];
  callerOwnedMutableBinaryCopies: true;
  strainDiagnosticAuthority: true;
  physicalStressAuthority: false;
  materialFailureAuthority: false;
  fitAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOwnerV1;
      report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationReportV1;
    }>
  | Readonly<{
      ok: false;
      code:
        | 'invalid-options'
        | 'aborted'
        | 'source-owner-unavailable'
        | 'runner-owner-unavailable'
        | 'binding-mismatch'
        | 'invalid-continuum-input'
        | 'gpu-execution-failed';
      detail: string;
    }>;

type OwnerRecord = Readonly<{
  triangleValues: Float32Array;
  validityFlags: Uint32Array;
  normalizedTopology: Uint32Array;
}>;

const owners = new CapturedWeakMap<object, OwnerRecord>();

class StrainBridgeError extends Error {
  constructor(
    readonly code: Exclude<
      BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationResultV1,
      { ok: true }
    >['code'],
    detail: string,
  ) {
    super(
      capturedStringSlice
        ? (capturedReflectApply(capturedStringSlice, detail, [0, 2_048]) as string)
        : 'Saved 32F strain bridge failed closed.',
    );
  }
}

function fail(code: StrainBridgeError['code'], detail: string): never {
  throw new StrainBridgeError(code, detail);
}

function bytesEqual(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new CapturedUint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new CapturedUint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function float32LeBytes(values: Float32Array): Uint8Array<ArrayBuffer> {
  if (!capturedDataViewSetFloat32)
    fail('invalid-continuum-input', 'Native Float32LE writer is unavailable.');
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    capturedReflectApply(capturedDataViewSetFloat32, view, [index * 4, values[index]!, true]);
  return bytes;
}

function uint32LeBytes(values: Uint32Array): Uint8Array<ArrayBuffer> {
  if (!capturedDataViewSetUint32)
    fail('invalid-continuum-input', 'Native Uint32LE writer is unavailable.');
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    capturedReflectApply(capturedDataViewSetUint32, view, [index * 4, values[index]!, true]);
  return bytes;
}

function positions3(positions4: Float32Array): Float32Array {
  if (positions4.length % 4 !== 0) fail('binding-mismatch', 'Final vec4 length is invalid.');
  const output = new CapturedFloat32Array((positions4.length / 4) * 3);
  for (let vertex = 0; vertex < positions4.length / 4; vertex += 1) {
    output[vertex * 3] = positions4[vertex * 4]!;
    output[vertex * 3 + 1] = positions4[vertex * 4 + 1]!;
    output[vertex * 3 + 2] = positions4[vertex * 4 + 2]!;
  }
  return output;
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || typeof capturedDigest !== 'function')
    fail('invalid-continuum-input', 'Native SHA-256 is unavailable.');
  const copy = new CapturedUint8Array(bytes.byteLength);
  capturedReflectApply(capturedUint8Set, copy, [bytes]);
  const digest = (await capturedReflectApply(capturedDigest, capturedSubtle, [
    'SHA-256',
    copy,
  ])) as ArrayBuffer;
  if (objectGetPrototypeOf(digest) !== arrayBufferPrototype || digest.byteLength !== 32)
    fail('invalid-continuum-input', 'Native SHA-256 returned invalid bytes.');
  const characters = capturedReflectApply(capturedArrayFrom, Array, [
    new CapturedUint8Array(digest),
    (value: number) => HEX[value]!,
  ]) as string[];
  return capturedReflectApply(capturedArrayJoin, characters, ['']) as string;
}

async function digestText(value: string): Promise<string> {
  return digestBytes(
    capturedReflectApply(capturedTextEncode, capturedTextEncoder, [value]) as Uint8Array,
  );
}

async function validateDigestAuthority(): Promise<void> {
  if ((await digestBytes(new CapturedUint8Array(0))) !== EMPTY_SHA256)
    fail('invalid-continuum-input', 'SHA-256 empty-message KAT failed.');
  if ((await digestText('abc')) !== ABC_SHA256)
    fail('invalid-continuum-input', 'SHA-256 abc KAT failed.');
}

async function payloadSha256(domain: string, payload: unknown): Promise<string> {
  return digestText(`${domain}\0${capturedJsonStringify(payload)}`);
}

function regexTest(pattern: RegExp, value: string): boolean {
  return capturedReflectApply(capturedRegExpTest, pattern, [value]) as boolean;
}

function joinStrings(values: readonly string[], separator: string): string {
  return capturedReflectApply(capturedArrayJoin, values, [separator]) as string;
}

function signalIsAborted(signal: AbortSignal | undefined): boolean {
  if (!signal) return false;
  if (!capturedAbortSignalAborted)
    fail('invalid-options', 'Native AbortSignal aborted getter is unavailable.');
  return capturedReflectApply(capturedAbortSignalAborted, signal, []) as boolean;
}

function captureExactOptions(
  input: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOptionsV1 {
  if (
    !input ||
    typeof input !== 'object' ||
    capturedArrayIsArray(input) ||
    capturedArrayBufferIsView(input)
  )
    fail('invalid-options', 'Saved 32F strain options must be one plain record.');
  let descriptors: PropertyDescriptorMap;
  let prototype: object | null;
  try {
    descriptors = objectGetOwnPropertyDescriptors(input);
    prototype = objectGetPrototypeOf(input);
  } catch {
    fail('invalid-options', 'Saved 32F strain options could not be inspected safely.');
  }
  if (prototype !== objectPrototype && prototype !== null)
    fail('invalid-options', 'Saved 32F strain options must use a plain object prototype.');
  const output: {
    gpu?: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOptionsV1['gpu'];
    sessionIdFactory?: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOptionsV1['sessionIdFactory'];
    signal?: AbortSignal;
    timeoutMs?: number;
    readbackCapBytes?: number;
  } = {};
  for (const key of capturedReflectOwnKeys(descriptors)) {
    if (typeof key !== 'string')
      fail('invalid-options', 'Saved 32F strain options cannot contain symbol keys.');
    if (
      key !== 'gpu' &&
      key !== 'sessionIdFactory' &&
      key !== 'signal' &&
      key !== 'timeoutMs' &&
      key !== 'readbackCapBytes'
    )
      fail('invalid-options', `Saved 32F strain option ${key} is not supported.`);
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      fail('invalid-options', `Saved 32F strain option ${key} must be enumerable data.`);
    const value = descriptor.value;
    if (key === 'gpu') {
      if (value !== undefined && (!value || typeof value !== 'object'))
        fail('invalid-options', 'Saved 32F strain gpu must be an object.');
      output.gpu = value;
    }
    if (key === 'sessionIdFactory') {
      if (value !== undefined && typeof value !== 'function')
        fail('invalid-options', 'Saved 32F strain sessionIdFactory must be a function.');
      output.sessionIdFactory = value;
    }
    if (key === 'signal') {
      if (
        value !== undefined &&
        (!capturedAbortSignalPrototype ||
          objectGetPrototypeOf(value) !== capturedAbortSignalPrototype)
      )
        fail('invalid-options', 'Saved 32F strain signal must be a genuine AbortSignal.');
      output.signal = value;
    }
    if (key === 'timeoutMs') {
      if (value !== undefined && typeof value !== 'number')
        fail('invalid-options', 'Saved 32F strain timeoutMs must be numeric.');
      output.timeoutMs = value;
    }
    if (key === 'readbackCapBytes') {
      if (value !== undefined && typeof value !== 'number')
        fail('invalid-options', 'Saved 32F strain readbackCapBytes must be numeric.');
      output.readbackCapBytes = value;
    }
  }
  return objectFreeze(output);
}

function ownerRecord(owner: object): OwnerRecord | undefined {
  if (!capturedWeakMapGet) return undefined;
  return capturedReflectApply(capturedWeakMapGet, owners, [owner]) as OwnerRecord | undefined;
}

function registerOwner(owner: object, record: OwnerRecord): void {
  if (!capturedWeakMapSet)
    fail('invalid-continuum-input', 'Native WeakMap set intrinsic is unavailable.');
  capturedReflectApply(capturedWeakMapSet, owners, [owner, record]);
}

function deleteOwner(owner: object): boolean {
  if (!capturedWeakMapDelete) return false;
  return capturedReflectApply(capturedWeakMapDelete, owners, [owner]) as boolean;
}

/** Public structural audit; `ok` never authenticates saved-wrapper ownership. */
export function auditBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainProvenanceV1(
  witness: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainProvenanceWitnessV1,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainProvenanceAuditV1 {
  const blockers: string[] = [];
  const report = witness.runnerReport;
  const bindings = report.bindings;
  const execution = report.execution;
  const collision = report.collision;
  if (
    !regexTest(SHA256, witness.runtimeProjectionCanonicalSha256) ||
    witness.runtimeProjectionCanonicalSha256 !== witness.runtimeReportCanonicalSha256 ||
    witness.runtimeProjectionCanonicalSha256 !== bindings.runtimeSourceCanonicalSha256
  )
    blockers.push('runtime-source-binding-mismatch');
  if (
    !regexTest(SHA256, witness.runnerProjectionCanonicalSha256) ||
    witness.runnerProjectionCanonicalSha256 !== report.seal.canonicalSha256
  )
    blockers.push('runner-projection-binding-mismatch');
  if (
    !regexTest(SHA256, witness.runtimeNormalizedV5AggregateSha256) ||
    witness.runtimeNormalizedV5AggregateSha256 !== bindings.normalizedV5AggregateSha256
  )
    blockers.push('normalized-v5-binding-mismatch');
  if (
    !regexTest(SHA256, witness.runtimeNormalizedTopologySha256) ||
    witness.runtimeNormalizedTopologySha256 !== bindings.normalizedTopologySha256
  )
    blockers.push('normalized-topology-binding-mismatch');
  if (
    report.status !== 'diagnostic-blocked' ||
    report.decision !==
      'MEASURED_32_FRAME_EXACT_BODY_CONTACT_AND_STRUCTURAL_POSTGATE_CLEAR_WITH_DOWNSTREAM_BLOCKERS'
  )
    blockers.push('saved32-decision-not-eligible');
  if (
    report.workload.particleCount !== BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1 ||
    report.workload.triangleCount !== BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1 ||
    report.workload.continuumConstraintCount !== BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1
  )
    blockers.push('saved32-workload-mismatch');
  if (
    execution.frame16CheckpointExactSaved16Parity !== true ||
    execution.contactCorrectionCapHit ||
    execution.invalidVelocityStateCount !== 0 ||
    execution.numericInvalidVelocityStateCount !== 0 ||
    execution.outOfDomainVelocityStateCount !== 0 ||
    execution.bendInvalidConstraintCount !== 0 ||
    execution.continuumNonzeroStatusCount !== 0 ||
    execution.contactInvalidParticleCount !== 0 ||
    execution.contactDegenerateTriangleVisitCount !== 0 ||
    execution.contactOutOfRangeTriangleVisitCount !== 0 ||
    execution.validationMessages.length !== 0 ||
    execution.deviceLossMessages.length !== 0
  )
    blockers.push('saved32-execution-gate-not-clear');
  if (
    collision.exactActualBodyGateClear !== true ||
    collision.bodyGarmentTriangleIntersectionCount !== 0 ||
    collision.penetratingVertexCount !== 0 ||
    collision.unsafeVertexCount !== 0 ||
    collision.ambiguousSignVertexCount !== 0 ||
    collision.blockers.length !== 0
  )
    blockers.push('saved32-actual-body-gate-not-clear');
  if (
    !report.observations.finalHashBoundToCollisionInput ||
    report.observations.everyPositionFinite !== true ||
    report.observations.everyInverseMassBitExact !== true ||
    report.observations.pinnedParticleCountBitExact !== 82 ||
    report.observations.seamGapBounded !== true ||
    report.quality.blockers.length !== 0
  )
    blockers.push('saved32-structural-gate-not-clear');
  if (
    !regexTest(SHA256, bindings.savedRuntimeSourceCanonicalSha256) ||
    !regexTest(SHA256, bindings.saved16FrameCanonicalSha256) ||
    !regexTest(SHA256, bindings.finalPositionsInvMassKgSha256) ||
    !regexTest(SHA256, bindings.finalPositions3MSha256) ||
    bindings.finalPositions3MSha256 !== bindings.finalCollisionBindingPositionsSha256
  )
    blockers.push('saved32-final-content-binding-mismatch');
  if (
    report.claims.exactSaved16FramePrefixProven !== true ||
    report.claims.savedLineageAuthenticatedByOuterWrapper !== false ||
    report.claims.exactActualBodyCollisionReplayExecuted !== true
  )
    blockers.push('saved32-structural-claim-mismatch');
  return objectFreeze({
    ok: blockers.length === 0,
    blockers: objectFreeze([...new Set(blockers)]),
  });
}

function range(values: Float32Array, lane: number): RangeSummary {
  let minimum = POSITIVE_INFINITY;
  let maximum = NEGATIVE_INFINITY;
  for (let index = lane; index < values.length; index += 4) {
    minimum = capturedMathMin(minimum, values[index]!);
    maximum = capturedMathMax(maximum, values[index]!);
  }
  return objectFreeze({ minimum, maximum });
}

function countAtOrAbove(values: Float32Array, threshold: number): number {
  let count = 0;
  for (let index = 3; index < values.length; index += 4)
    if (values[index]! >= threshold) count += 1;
  return count;
}

function maximumAbsoluteError(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length) return POSITIVE_INFINITY;
  let maximum = 0;
  for (let index = 0; index < left.length; index += 1)
    maximum = capturedMathMax(maximum, capturedMathAbs(left[index]! - right[index]!));
  return maximum;
}

function validityHistogram(flags: Uint32Array): Readonly<Record<string, number>> {
  const output: Record<string, number> = {};
  for (const flag of flags) {
    const key = CapturedString(flag);
    output[key] = (output[key] ?? 0) + 1;
  }
  return objectFreeze(output);
}

function outputEnvelope(values: Float32Array, flags: Uint32Array): Uint8Array<ArrayBuffer> {
  const valueBytes = float32LeBytes(values);
  const flagBytes = uint32LeBytes(flags);
  const output = new CapturedUint8Array(valueBytes.byteLength + flagBytes.byteLength);
  capturedReflectApply(capturedUint8Set, output, [valueBytes, 0]);
  capturedReflectApply(capturedUint8Set, output, [flagBytes, valueBytes.byteLength]);
  return output;
}

function liveWitness(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainProvenanceWitnessV1 | null {
  const runtime = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  const runner = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(runnerOwner);
  if (!runtime || !runner) return null;
  return objectFreeze({
    runtimeProjectionCanonicalSha256: runtime.reportCanonicalSha256,
    runtimeReportCanonicalSha256: runtimeOwner.report.seal.canonicalSha256,
    runtimeNormalizedV5AggregateSha256: runtime.normalizedV5.seal.aggregateSha256,
    runtimeNormalizedTopologySha256: runtimeOwner.report.bindings.normalizedTopologySha256,
    runnerProjectionCanonicalSha256: runner.reportCanonicalSha256,
    runnerReport: runnerOwner.report,
  });
}

function ownersStillMatch(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  witness: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainProvenanceWitnessV1,
): boolean {
  const current = liveWitness(runtimeOwner, runnerOwner);
  return (
    current !== null &&
    current.runtimeProjectionCanonicalSha256 === witness.runtimeProjectionCanonicalSha256 &&
    current.runnerProjectionCanonicalSha256 === witness.runnerProjectionCanonicalSha256 &&
    current.runtimeNormalizedV5AggregateSha256 === witness.runtimeNormalizedV5AggregateSha256
  );
}

export async function runBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationV1(
  canvas: HTMLCanvasElement,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  options: BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOptionsV1 = {},
): Promise<BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationResultV1> {
  try {
    const capturedOptions = captureExactOptions(options);
    if (signalIsAborted(capturedOptions.signal))
      fail('aborted', 'Saved 32F strain diagnostic was aborted.');
    const runtime = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
    if (!runtime) fail('source-owner-unavailable', 'A live base runtime owner is required.');
    const runner = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(runnerOwner);
    if (!runner) fail('runner-owner-unavailable', 'A live saved 32F V4 owner is required.');
    const witness = liveWitness(runtimeOwner, runnerOwner);
    if (!witness) fail('binding-mismatch', 'Saved 32F provenance became unavailable.');
    const provenance = auditBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainProvenanceV1(witness);
    if (!provenance.ok)
      fail(
        'binding-mismatch',
        `Saved 32F provenance blocked: ${joinStrings(provenance.blockers, ', ')}.`,
      );
    if (!bytesEqual(runtime.normalizedTriangles, runner.normalizedTriangles))
      fail('binding-mismatch', 'Runtime and saved 32F topology bytes differ.');
    const finalPositions3M = positions3(runner.finalPositionsInvMassKg);
    if (!bytesEqual(finalPositions3M, runner.finalPositions3M))
      fail('binding-mismatch', 'Saved 32F vec4 and vec3 projections disagree.');

    await validateDigestAuthority();
    const [finalVec4Sha, finalVec3Sha, topologySha] = await Promise.all([
      digestBytes(float32LeBytes(runner.finalPositionsInvMassKg)),
      digestBytes(float32LeBytes(finalPositions3M)),
      digestBytes(uint32LeBytes(runner.normalizedTriangles)),
    ]);
    if (
      finalVec4Sha !== witness.runnerReport.bindings.finalPositionsInvMassKgSha256 ||
      finalVec3Sha !== witness.runnerReport.bindings.finalPositions3MSha256 ||
      topologySha !== witness.runnerReport.bindings.normalizedTopologySha256 ||
      topologySha !== runtimeOwner.report.bindings.normalizedTopologySha256
    )
      fail('binding-mismatch', 'Saved 32F projected bytes differ from their report bindings.');

    const sealed = await validateSealedSimulationPackageV5V1(runtime.normalizedV5);
    if (!sealed.ok)
      fail(
        'invalid-continuum-input',
        `Saved V5 seal failed: ${
          'errors' in sealed ? joinStrings(sealed.errors, '; ') : 'unknown error'
        }.`,
      );
    const continuum = sealed.simulation.constraints.continuumStrain;
    const port = await sealTriangleStrainUtilizationPortV1({
      schemaVersion: TRIANGLE_STRAIN_UTILIZATION_PORT_V1,
      vertexCount: sealed.simulation.manifest.particleCount,
      triangleCount: continuum.constraintCount,
      materialCount: continuum.materialCount,
      finalPositionsInvMassKg: runner.finalPositionsInvMassKg,
      normalizedTopology: runner.normalizedTriangles,
      triangleIndices: continuum.triangleIndices,
      triangleRestFrames: continuum.triangleRestFrames,
      materialIndices: continuum.materialIndices,
      materialRecords: continuum.materialRecords,
    });
    const portAudit = await auditTriangleStrainUtilizationPortV1(port);
    if (!portAudit.ok)
      fail(
        'invalid-continuum-input',
        `Saved 32F strain port blocked: ${joinStrings(portAudit.blockers, ', ')}.`,
      );
    if (
      port.vertexCount !== BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1 ||
      port.triangleCount !== BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1 ||
      port.bindings.finalPositionsInvMassKgSha256 !== finalVec4Sha ||
      port.bindings.normalizedTopologySha256 !== topologySha
    )
      fail('binding-mismatch', 'Saved 32F strain port content binding drifted.');
    if (!ownersStillMatch(runtimeOwner, runnerOwner, witness))
      fail('binding-mismatch', 'Saved 32F owners became stale before strain execution.');

    const [kernelSha, limitsSha, colorSha] = await Promise.all([
      digestText(TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC_WGSL_V1),
      digestText(capturedJsonStringify(BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1)),
      digestText(capturedJsonStringify(BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1)),
    ]);
    if (
      kernelSha !== FROZEN_V1_KERNEL_SHA256 ||
      limitsSha !== FROZEN_V1_LIMITS_SHA256 ||
      colorSha !== FROZEN_V1_COLOR_LUT_SHA256
    )
      fail('binding-mismatch', 'Frozen V1 strain kernel, limits, or LUT identity drifted.');
    const gpu = await executeTriangleStrainUtilizationGpuPortV1(canvas, port, capturedOptions);
    if (!ownersStillMatch(runtimeOwner, runnerOwner, witness))
      fail('binding-mismatch', 'Saved 32F owners became stale during strain execution.');
    if (gpu.values.length !== port.triangleCount * 4 || gpu.flags.length !== port.triangleCount)
      fail('gpu-execution-failed', 'Saved 32F strain output dimensions drifted.');
    let invalidTriangleCount = 0;
    for (const flag of gpu.flags) if (flag !== 0) invalidTriangleCount += 1;
    for (const value of gpu.values)
      if (!capturedNumberIsFinite(value))
        fail('gpu-execution-failed', 'GPU emitted non-finite strain.');
    if (invalidTriangleCount !== 0)
      fail('gpu-execution-failed', `GPU emitted ${invalidTriangleCount} invalid triangles.`);
    const cpu = evaluateTriangleStrainUtilizationCpuV1(port);
    const cpuParityMaximumAbsoluteError = maximumAbsoluteError(gpu.values, cpu);
    if (cpuParityMaximumAbsoluteError > CPU_PARITY_TOLERANCE)
      fail(
        'gpu-execution-failed',
        `GPU/CPU parity ${cpuParityMaximumAbsoluteError} exceeds ${CPU_PARITY_TOLERANCE}.`,
      );

    const [valuesSha, flagsSha, envelopeSha] = await Promise.all([
      digestBytes(float32LeBytes(gpu.values)),
      digestBytes(uint32LeBytes(gpu.flags)),
      digestBytes(outputEnvelope(gpu.values, gpu.flags)),
    ]);
    if (!ownersStillMatch(runtimeOwner, runnerOwner, witness))
      fail('binding-mismatch', 'Saved 32F owners became stale while sealing strain evidence.');
    const bindings = objectFreeze({
      savedRuntimeSourceCanonicalSha256:
        witness.runnerReport.bindings.savedRuntimeSourceCanonicalSha256,
      saved16FrameCanonicalSha256: witness.runnerReport.bindings.saved16FrameCanonicalSha256,
      runtimeSourceCanonicalSha256: witness.runtimeProjectionCanonicalSha256,
      runner32FrameCanonicalSha256: witness.runnerProjectionCanonicalSha256,
      normalizedV5AggregateSha256: witness.runtimeNormalizedV5AggregateSha256,
      finalPositionsInvMassKgSha256: finalVec4Sha,
      finalPositions3MSha256: finalVec3Sha,
      normalizedTopologySha256: topologySha,
      port: port.bindings,
      frozenV1KernelSourceSha256: FROZEN_V1_KERNEL_SHA256,
      frozenV1ProvisionalLimitsSha256: FROZEN_V1_LIMITS_SHA256,
      frozenV1ColorLutSha256: FROZEN_V1_COLOR_LUT_SHA256,
      outputValuesFloat32LeSha256: valuesSha,
      outputValidityFlagsUint32LeSha256: flagsSha,
      outputEnvelopeSha256: envelopeSha,
    });
    const workload = objectFreeze({
      vertexCount: BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1,
      triangleCount: BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1,
      materialCount: port.materialCount,
      dispatchCount: 1 as const,
      workgroupSize: 64 as const,
      workgroupCount: 15 as const,
    });
    const readback = objectFreeze({
      valueByteLength: BETA_SKIRT_STRAIN_UTILIZATION_VALUE_BYTES_V1,
      validityFlagByteLength: BETA_SKIRT_STRAIN_UTILIZATION_FLAG_BYTES_V1,
      totalByteLength: BETA_SKIRT_STRAIN_UTILIZATION_READBACK_BYTES_V1,
      maximumByteLength: BETA_SKIRT_STRAIN_UTILIZATION_MAX_READBACK_BYTES_V1,
    });
    const validity = objectFreeze({
      validTriangleCount: port.triangleCount,
      invalidTriangleCount,
      flagHistogram: validityHistogram(gpu.flags),
      cpuParityMaximumAbsoluteError,
      cpuParityTolerance: CPU_PARITY_TOLERANCE,
    });
    const ranges = objectFreeze({
      warpStrain: range(gpu.values, 0),
      weftStrain: range(gpu.values, 1),
      shearStrain: range(gpu.values, 2),
      normalizedUtilization: range(gpu.values, 3),
    });
    const interpretation = objectFreeze({
      triangleCountAtOrAboveProvisionalLimit: countAtOrAbove(gpu.values, 1),
      triangleCountAtOrAboveFourTimesProvisionalLimit: countAtOrAbove(gpu.values, 4),
      utilizationIsMaterialFailureCriterion: false as const,
      utilizationIsPhysicalStressOrPa: false as const,
    });
    const claims = objectFreeze({
      savedRuntimeAnd32FrameContentBound: true as const,
      genuineSavedRuntimeWrapperAuthenticated: false as const,
      baseRuntimeAnd32FrameOwnersNotReturnedByAdapter: true as const,
      exactRetainedSaved32FrameProjectionBound: true as const,
      exactRuntimeSourceV5ContinuumBuffersBound: true as const,
      frozenV1KernelPortLimitsAndColorLutReused: true as const,
      gpuPerTriangleDiagnosticExecuted: true as const,
      boundedReadback: true as const,
      dimensionlessStrainDiagnosticOnly: true as const,
      provisionalMaterialVisualizationThresholds: true as const,
      physicalStressOrPaComputed: false as const,
      materialFailureEvaluated: false as const,
      collisionAuthority: false as const,
      fitAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    });
    const blockers = objectFreeze([
      'post-frame-self-orientation-not-evaluated',
      'material-visualization-thresholds-provisional-and-uncalibrated',
      'physical-stress-and-pa-not-computed',
      'material-failure-not-evaluated',
      'settle-fit-runtime-production-authority-not-established',
    ] as const);
    const stablePayload = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_UTILIZATION_REPORT_V1,
      bindings: objectFreeze({
        ...bindings,
        saved16FrameCanonicalSha256: undefined,
        runner32FrameCanonicalSha256: undefined,
      }),
      workload,
      readback,
      validity,
      ranges,
      interpretation,
      claims,
      blockers,
    });
    const stableEvidence = objectFreeze({
      canonicalSha256: await payloadSha256(
        'beta-skirt-canonical-medium-saved-32-frame-strain-stable-evidence-v1',
        stablePayload,
      ),
      excludesGpuTimingAndVolatileReportSeal: true as const,
    });
    const reportWithoutSeal = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_UTILIZATION_REPORT_V1,
      status: 'saved-dxf-32-frame-strain-diagnostic-blocked' as const,
      decision:
        'MEASURED_SAVED_32_FRAME_BOUNDED_PER_TRIANGLE_STRAIN_WITH_MATERIAL_BLOCKERS' as const,
      bindings,
      workload,
      readback,
      validity,
      ranges,
      interpretation,
      execution: objectFreeze({
        gpuWallTimeMs: gpu.gpuWallTimeMs,
        validationMessages: gpu.validationMessages,
        destroyedBufferCount: gpu.destroyedBufferCount,
      }),
      stableEvidence,
      claims,
      blockers,
    });
    const report = objectFreeze({
      ...reportWithoutSeal,
      seal: objectFreeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: await payloadSha256(
          'beta-skirt-canonical-medium-saved-32-frame-strain-report-v1',
          reportWithoutSeal,
        ),
        authority: 'unsigned-structural-saved-32-frame-strain-content-only' as const,
      }),
    }) satisfies BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationReportV1;
    if (!ownersStillMatch(runtimeOwner, runnerOwner, witness))
      fail('binding-mismatch', 'Saved 32F owners became stale before strain owner minting.');
    const owner = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_UTILIZATION_OWNER_V1,
      report,
    }) as BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOwnerV1;
    registerOwner(owner, {
      triangleValues: new CapturedFloat32Array(gpu.values),
      validityFlags: new CapturedUint32Array(gpu.flags),
      normalizedTopology: new CapturedUint32Array(port.normalizedTopology),
    });
    return objectFreeze({ ok: true as const, owner, report });
  } catch (error) {
    if (error instanceof StrainBridgeError)
      return objectFreeze({ ok: false as const, code: error.code, detail: error.message });
    const detail = error instanceof Error ? error.message : 'Unknown saved 32F strain failure.';
    const boundedDetail = capturedStringSlice
      ? (capturedReflectApply(capturedStringSlice, detail, [0, 2_048]) as string)
      : 'Saved 32F strain bridge failed closed.';
    return objectFreeze({
      ok: false as const,
      code: regexTest(ABORT, detail) ? ('aborted' as const) : ('gpu-execution-failed' as const),
      detail: boundedDetail,
    });
  }
}

export function projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationV1(
  owner: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationProjectionV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = ownerRecord(owner as object);
  if (!record) return null;
  const typed = owner as BetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationOwnerV1;
  return objectFreeze({
    schemaVersion:
      BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STRAIN_UTILIZATION_PROJECTION_V1,
    reportCanonicalSha256: typed.report.seal.canonicalSha256,
    triangleValues: new CapturedFloat32Array(record.triangleValues),
    validityFlags: new CapturedUint32Array(record.validityFlags),
    normalizedTopology: new CapturedUint32Array(record.normalizedTopology),
    valuesLayout: objectFreeze([
      'warpStrain',
      'weftStrain',
      'shearStrain',
      'normalizedUtilization',
    ] as const),
    callerOwnedMutableBinaryCopies: true as const,
    strainDiagnosticAuthority: true as const,
    physicalStressAuthority: false as const,
    materialFailureAuthority: false as const,
    fitAuthority: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameStrainUtilizationV1(
  owner: unknown,
): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = ownerRecord(owner as object);
  if (!record) return false;
  capturedReflectApply(capturedFloat32Fill, record.triangleValues, [0]);
  capturedReflectApply(capturedUint32Fill, record.validityFlags, [0]);
  capturedReflectApply(capturedUint32Fill, record.normalizedTopology, [0]);
  return deleteOwner(owner as object);
}
