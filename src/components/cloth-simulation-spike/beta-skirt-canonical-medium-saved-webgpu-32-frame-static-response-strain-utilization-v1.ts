import { validateSealedSimulationPackageV5V1 } from '../../lib/cloth/compiler/simulation-package-v5-integrity';

import {
  BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_FLAG_BYTES_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_MAX_READBACK_BYTES_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_READBACK_BYTES_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_VALUE_BYTES_V1,
  BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1,
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
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseProjectionV1,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-v1';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceProjectionV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_UTILIZATION_REPORT_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-strain-utilization-report/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_UTILIZATION_OWNER_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-strain-utilization-owner/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_UTILIZATION_PROJECTION_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-strain-utilization-projection/1' as const;

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
const capturedReflectApply = Reflect.apply;
const capturedArrayFrom = Array.from;
const capturedArrayJoin = Array.prototype.join;
const capturedArrayIncludes = Array.prototype.includes;
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
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const CapturedDataView = DataView;
const CapturedWeakMap = WeakMap;
const capturedFloat32Fill = Float32Array.prototype.fill;
const capturedUint32Fill = Uint32Array.prototype.fill;
const capturedUint8Set = Uint8Array.prototype.set;
const capturedTextEncoder = new TextEncoder();
const capturedTextEncode = TextEncoder.prototype.encode;
const capturedJsonStringify = JSON.stringify.bind(JSON);
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest;
const HEX = objectFreeze(
  capturedArrayFrom({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')),
);

type RangeSummary = Readonly<{ minimum: number; maximum: number }>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOptionsV1 =
  BetaSkirtCanonicalMediumStrainUtilizationDiagnosticOptionsV1;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainReportV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_UTILIZATION_REPORT_V1;
  status: 'saved-32-frame-static-response-strain-diagnostic-blocked';
  decision: 'MEASURED_D424_CORRECTED_CANDIDATE_BOUNDED_PER_TRIANGLE_STRAIN_WITH_MATERIAL_BLOCKERS';
  bindings: Readonly<{
    runtimeSourceCanonicalSha256: string;
    runtimeReportCanonicalSha256: string;
    normalizedV5AggregateSha256: string;
    staticResponseStableEvidenceSha256: string;
    staticResponseReportCanonicalSha256: string;
    sourceCurrentPositionsInvMassKgSha256: string;
    candidateCurrentPositionsInvMassKgSha256: string;
    candidateCurrentPositions3MSha256: string;
    candidatePreviousPositionsInvMassKgSha256: string;
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
    excludesVolatileStaticResponseReportSealAndGpuTiming: true;
  }>;
  claims: Readonly<{
    genuineSavedRuntimeWrapperAuthenticated: false;
    privateBaseRuntimeAndStaticResponseOwnersRequired: true;
    inputOwnersReturnedByAdapter: false;
    bothInputOwnersRevalidatedAcrossAsyncBoundaries: true;
    exactD424StaticResponseCandidateBound: true;
    d424StaticPostgatesMeasuredClear: true;
    preResponseD420OutputReused: false;
    preResponseStrainOwnerAcceptedAsInput: false;
    exactRuntimeSourceV5ContinuumBuffersBound: true;
    frozenV1KernelPortLimitsAndColorLutReused: true;
    gpuPerTriangleDiagnosticExecutedFresh: true;
    boundedReadback: true;
    dimensionlessStrainDiagnosticOnly: true;
    provisionalMaterialVisualizationThresholds: true;
    physicalStressOrPaComputed: false;
    materialFailureEvaluated: false;
    candidateUploadedToGpuForFrameContinuation: false;
    exactFrameContinuationExecuted: false;
    rehydratedNextFrameParityProven: false;
    collisionAuthority: false;
    fitAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
  }>;
  blockers: readonly [
    'outer-saved-wrapper-authentication-not-established-by-structural-adapter',
    'exact-frame-continuation-not-executed',
    'rehydrated-next-frame-parity-not-proven',
    'material-visualization-thresholds-provisional-and-uncalibrated',
    'physical-stress-and-pa-not-computed',
    'material-failure-not-evaluated',
    'settle-fit-runtime-production-authority-not-established',
  ];
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-structural-saved-32-frame-static-response-strain-content-only';
  }>;
}>;

declare const ownerBrand: unique symbol;
export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOwnerV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_UTILIZATION_OWNER_V1;
  report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainReportV1;
  readonly [ownerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainProjectionV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_UTILIZATION_PROJECTION_V1;
  reportCanonicalSha256: string;
  triangleValues: Float32Array;
  validityFlags: Uint32Array;
  normalizedTopology: Uint32Array;
  valuesLayout: readonly ['warpStrain', 'weftStrain', 'shearStrain', 'normalizedUtilization'];
  callerOwnedMutableBinaryCopies: true;
  exactD424CandidateBound: true;
  preResponseD420OutputReused: false;
  strainDiagnosticAuthority: true;
  physicalStressAuthority: false;
  materialFailureAuthority: false;
  fitAuthority: false;
  runtimeAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOwnerV1;
      report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainReportV1;
    }>
  | Readonly<{
      ok: false;
      code:
        | 'invalid-options'
        | 'aborted'
        | 'source-owner-unavailable'
        | 'static-response-owner-unavailable'
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

type LiveInputs = Readonly<{
  runtime: BetaSkirtCanonicalMediumWebgpuRuntimeSourceProjectionV1;
  response: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseProjectionV1;
  runtimeProjectionCanonicalSha256: string;
  responseProjectionCanonicalSha256: string;
  runtimeNormalizedV5AggregateSha256: string;
}>;

const owners = new CapturedWeakMap<object, OwnerRecord>();

class CorrectedStrainError extends Error {
  constructor(
    readonly code: Exclude<
      BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainResultV1,
      { ok: true }
    >['code'],
    detail: string,
  ) {
    super(
      capturedStringSlice
        ? (capturedReflectApply(capturedStringSlice, detail, [0, 2_048]) as string)
        : 'Corrected saved32 strain adapter failed closed.',
    );
  }
}

function fail(code: CorrectedStrainError['code'], detail: string): never {
  throw new CorrectedStrainError(code, detail);
}

function regexTest(pattern: RegExp, value: string): boolean {
  return capturedReflectApply(capturedRegExpTest, pattern, [value]) as boolean;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && regexTest(SHA256, value);
}

function includes(values: readonly string[], value: string): boolean {
  return capturedReflectApply(capturedArrayIncludes, values, [value]) as boolean;
}

function joinStrings(values: readonly string[], separator: string): string {
  return capturedReflectApply(capturedArrayJoin, values, [separator]) as string;
}

function bytesEqual(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new CapturedUint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new CapturedUint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function positions3(positions4: Float32Array): Float32Array {
  if (positions4.length % 4 !== 0) fail('binding-mismatch', 'Candidate vec4 length is invalid.');
  const output = new CapturedFloat32Array((positions4.length / 4) * 3);
  for (let vertex = 0; vertex < positions4.length / 4; vertex += 1) {
    output[vertex * 3] = positions4[vertex * 4]!;
    output[vertex * 3 + 1] = positions4[vertex * 4 + 1]!;
    output[vertex * 3 + 2] = positions4[vertex * 4 + 2]!;
  }
  return output;
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

function signalIsAborted(signal: AbortSignal | undefined): boolean {
  if (!signal) return false;
  if (!capturedAbortSignalAborted)
    fail('invalid-options', 'Native AbortSignal aborted getter is unavailable.');
  return capturedReflectApply(capturedAbortSignalAborted, signal, []) as boolean;
}

function captureExactOptions(
  input: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOptionsV1 {
  if (
    !input ||
    typeof input !== 'object' ||
    capturedArrayIsArray(input) ||
    capturedArrayBufferIsView(input)
  )
    fail('invalid-options', 'Corrected saved32 strain options must be one plain record.');
  let descriptors: PropertyDescriptorMap;
  let prototype: object | null;
  try {
    descriptors = objectGetOwnPropertyDescriptors(input);
    prototype = objectGetPrototypeOf(input);
  } catch {
    fail('invalid-options', 'Corrected saved32 strain options could not be inspected safely.');
  }
  if (prototype !== objectPrototype && prototype !== null)
    fail('invalid-options', 'Corrected saved32 strain options must use a plain prototype.');
  const output: {
    gpu?: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOptionsV1['gpu'];
    sessionIdFactory?: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOptionsV1['sessionIdFactory'];
    signal?: AbortSignal;
    timeoutMs?: number;
    readbackCapBytes?: number;
  } = {};
  for (const key of capturedReflectOwnKeys(descriptors)) {
    if (typeof key !== 'string')
      fail('invalid-options', 'Corrected saved32 strain options cannot contain symbol keys.');
    if (
      key !== 'gpu' &&
      key !== 'sessionIdFactory' &&
      key !== 'signal' &&
      key !== 'timeoutMs' &&
      key !== 'readbackCapBytes'
    )
      fail('invalid-options', `Corrected saved32 strain option ${key} is unsupported.`);
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      fail('invalid-options', `Corrected saved32 strain option ${key} must be enumerable data.`);
    const value = descriptor.value;
    if (key === 'gpu') {
      if (value !== undefined && (!value || typeof value !== 'object'))
        fail('invalid-options', 'Corrected saved32 strain gpu must be an object.');
      output.gpu = value;
    }
    if (key === 'sessionIdFactory') {
      if (value !== undefined && typeof value !== 'function')
        fail('invalid-options', 'Corrected saved32 strain sessionIdFactory must be a function.');
      output.sessionIdFactory = value;
    }
    if (key === 'signal') {
      if (
        value !== undefined &&
        (!capturedAbortSignalPrototype ||
          objectGetPrototypeOf(value) !== capturedAbortSignalPrototype)
      )
        fail('invalid-options', 'Corrected saved32 strain signal must be a genuine AbortSignal.');
      output.signal = value;
    }
    if (key === 'timeoutMs') {
      if (value !== undefined && typeof value !== 'number')
        fail('invalid-options', 'Corrected saved32 strain timeoutMs must be numeric.');
      output.timeoutMs = value;
    }
    if (key === 'readbackCapBytes') {
      if (value !== undefined && typeof value !== 'number')
        fail('invalid-options', 'Corrected saved32 strain readbackCapBytes must be numeric.');
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

function projectLiveInputs(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
): LiveInputs {
  const runtime = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  if (!runtime) fail('source-owner-unavailable', 'A live private base runtime owner is required.');
  const response = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1(responseOwner);
  if (!response)
    fail(
      'static-response-owner-unavailable',
      'A live private D-424 static-response owner is required.',
    );
  return objectFreeze({
    runtime,
    response,
    runtimeProjectionCanonicalSha256: runtime.reportCanonicalSha256,
    responseProjectionCanonicalSha256: response.reportCanonicalSha256,
    runtimeNormalizedV5AggregateSha256: runtime.normalizedV5.seal.aggregateSha256,
  });
}

function inputsStillMatch(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  witness: LiveInputs,
): boolean {
  const runtime = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  const response = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1(responseOwner);
  return (
    runtime !== null &&
    response !== null &&
    runtime.reportCanonicalSha256 === witness.runtimeProjectionCanonicalSha256 &&
    response.reportCanonicalSha256 === witness.responseProjectionCanonicalSha256 &&
    runtime.normalizedV5.seal.aggregateSha256 === witness.runtimeNormalizedV5AggregateSha256
  );
}

function assertInputsStillMatch(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  witness: LiveInputs,
  boundary: string,
): void {
  if (!inputsStillMatch(runtimeOwner, responseOwner, witness))
    fail('binding-mismatch', `Corrected saved32 strain owners drifted ${boundary}.`);
}

function validateStructuralReports(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  witness: LiveInputs,
): void {
  const runtimeReport = runtimeOwner.report;
  const responseReport = responseOwner.report;
  const body = responseReport.postgates.body;
  const self = responseReport.postgates.self;
  const orientation = responseReport.postgates.orientation;
  const seamPinW = responseReport.postgates.seamPinW;
  const retained = responseReport.postgates.retainedState;
  if (
    runtimeReport.status !== 'diagnostic-source-ready' ||
    runtimeReport.decision !== 'PASS_CONTENT_BOUND_WEBGPU_RUNTIME_SOURCE' ||
    runtimeReport.seal.canonicalSha256 !== witness.runtimeProjectionCanonicalSha256 ||
    runtimeReport.bindings.normalizedV5AggregateSha256 !==
      witness.runtimeNormalizedV5AggregateSha256 ||
    runtimeReport.counts.garmentVertexCount !== BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1 ||
    runtimeReport.counts.garmentTriangleCount !== BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1 ||
    runtimeReport.claims.normalizedV5DiagnosticPackageQualified !== true ||
    runtimeReport.claims.collisionAuthority !== false ||
    runtimeReport.claims.runtimeAuthority !== false ||
    runtimeReport.claims.fitAuthority !== false ||
    runtimeReport.claims.productionAuthority !== false
  )
    fail('binding-mismatch', 'Base runtime report or authority boundary drifted.');
  if (
    responseReport.status !==
      'saved-32-frame-static-response-postgates-clear-continuation-unproven' ||
    responseReport.decision !==
      'PASS_BOUNDED_STATIC_D419_RESPONSE_WITHOUT_CONTINUATION_AUTHORITY' ||
    responseReport.seal.canonicalSha256 !== witness.responseProjectionCanonicalSha256 ||
    responseReport.bindings.runtimeSourceCanonicalSha256 !==
      witness.runtimeProjectionCanonicalSha256 ||
    responseReport.bindings.normalizedTopologySha256 !==
      runtimeReport.bindings.normalizedTopologySha256 ||
    responseReport.bindings.sourceCurrentPositionsInvMassKgSha256 ===
      responseReport.bindings.candidateCurrentPositionsInvMassKgSha256 ||
    responseReport.bindings.sourcePreviousPositionsInvMassKgSha256 ===
      responseReport.bindings.candidatePreviousPositionsInvMassKgSha256 ||
    !isSha256(responseReport.stableEvidence.canonicalSha256) ||
    responseReport.response.response.correctedVertexCount <= 0 ||
    responseReport.response.response.correctedVertexCount !==
      responseReport.response.response.correctedVertexIndices.length ||
    !(responseReport.response.response.maximumCorrectionM > 0) ||
    responseReport.response.response.maximumCorrectionM > responseReport.response.source.epsilonM ||
    responseReport.response.response.changedInverseMassCount !== 0 ||
    responseReport.response.response.fixedHandleOrZeroMassVertexMovedCount !== 0 ||
    body.exactCandidateReplayed !== true ||
    body.clear !== true ||
    body.bodyGarmentTriangleIntersectionCount !== 0 ||
    body.penetratingVertexCount !== 0 ||
    body.unsafeVertexCount !== 0 ||
    body.ambiguousSignVertexCount !== 0 ||
    self.residualBlockingCount !== 0 ||
    self.carrierAdjacentTouchingResidualCount !== 0 ||
    self.unsupportedResidualCount !== 0 ||
    self.exactRawEqualsExcludedPlusResidual !== true ||
    orientation.sourceDegenerateTriangleCount !== 0 ||
    orientation.candidateDegenerateTriangleCount !== 0 ||
    orientation.normalReversalCount !== 0 ||
    seamPinW.seamGapDidNotRegress !== true ||
    seamPinW.currentInverseMassBitMismatchCount !== 0 ||
    seamPinW.previousInverseMassBitMismatchCount !== 0 ||
    responseReport.postgates.sweptBody.status !== 'clear' ||
    retained.velocityBufferByteExact !== true ||
    retained.distanceLambdaBufferByteExact !== true ||
    retained.seamLambdaBufferByteExact !== true ||
    retained.bendLambdaBufferByteExact !== true ||
    retained.continuumLambdaBufferByteExact !== true ||
    retained.responseVelocityDeltaPreserved !== true ||
    retained.exactFrameContinuationExecuted !== false ||
    retained.rehydratedNextFrameParityProven !== false ||
    responseReport.claims.genuineSavedRuntimeWrapperAuthenticated !== false ||
    responseReport.claims.inputOwnersNotReturned !== true ||
    responseReport.claims.staticResponseOnly !== true ||
    responseReport.claims.candidateUploadedToGpu !== false ||
    responseReport.claims.exactFrameContinuationExecuted !== false ||
    responseReport.claims.rehydratedNextFrameParityProven !== false ||
    responseReport.claims.selfIntersectionAuthority !== false ||
    responseReport.claims.collisionAuthority !== false ||
    responseReport.claims.fitAuthority !== false ||
    responseReport.claims.runtimeAuthority !== false ||
    responseReport.claims.productionAuthority !== false ||
    !includes(responseReport.blockers, 'exact-frame-continuation-not-executed') ||
    !includes(responseReport.blockers, 'rehydrated-next-frame-parity-not-proven') ||
    !includes(responseReport.blockers, 'settle-fit-runtime-production-authority-not-established')
  )
    fail('binding-mismatch', 'D-424 static-response report or postgate boundary drifted.');
}

function validateDimensionsAndTopology(witness: LiveInputs): void {
  const response = witness.response;
  const candidateVec3 = positions3(response.candidateCurrentPositionsInvMassKg);
  if (
    response.candidateCurrentPositionsInvMassKg.length !==
      BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1 * 4 ||
    response.candidateCurrentPositions3M.length !==
      BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1 * 3 ||
    response.candidatePreviousPositionsInvMassKg.length !==
      BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1 * 4 ||
    response.normalizedTriangles.length !== BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1 * 3 ||
    !bytesEqual(candidateVec3, response.candidateCurrentPositions3M) ||
    !bytesEqual(witness.runtime.normalizedTriangles, response.normalizedTriangles) ||
    response.staticResponseOnly !== true ||
    response.candidateUploadedToGpu !== false ||
    response.exactFrameContinuationAuthority !== false ||
    response.collisionAuthority !== false ||
    response.runtimeAuthority !== false ||
    response.productionAuthority !== false
  )
    fail('binding-mismatch', 'D-424 candidate positions or normalized topology drifted.');
  for (let index = 0; index < response.candidateCurrentPositionsInvMassKg.length; index += 1) {
    const value = response.candidateCurrentPositionsInvMassKg[index]!;
    if (!capturedNumberIsFinite(value) || (index % 4 === 3 && value < 0))
      fail('binding-mismatch', 'D-424 candidate contains invalid physical state.');
  }
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

export async function runBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainUtilizationV1(
  canvas: HTMLCanvasElement,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  options: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOptionsV1 = {},
): Promise<BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainResultV1> {
  try {
    const capturedOptions = captureExactOptions(options);
    if (signalIsAborted(capturedOptions.signal))
      fail('aborted', 'Corrected saved32 strain diagnostic was aborted.');
    const witness = projectLiveInputs(runtimeOwner, responseOwner);
    validateStructuralReports(runtimeOwner, responseOwner, witness);
    validateDimensionsAndTopology(witness);
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'before digest validation');
    await validateDigestAuthority();
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'during digest validation');

    const responseReport = responseOwner.report;
    const [candidateVec4Sha, candidateVec3Sha, candidatePreviousSha, topologySha] =
      await Promise.all([
        digestBytes(float32LeBytes(witness.response.candidateCurrentPositionsInvMassKg)),
        digestBytes(float32LeBytes(witness.response.candidateCurrentPositions3M)),
        digestBytes(float32LeBytes(witness.response.candidatePreviousPositionsInvMassKg)),
        digestBytes(uint32LeBytes(witness.response.normalizedTriangles)),
      ]);
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'while hashing D-424 content');
    if (
      candidateVec4Sha !== responseReport.bindings.candidateCurrentPositionsInvMassKgSha256 ||
      candidateVec3Sha !== responseReport.bindings.candidateCurrentPositions3MSha256 ||
      candidatePreviousSha !== responseReport.bindings.candidatePreviousPositionsInvMassKgSha256 ||
      topologySha !== responseReport.bindings.normalizedTopologySha256 ||
      topologySha !== runtimeOwner.report.bindings.normalizedTopologySha256 ||
      candidateVec4Sha === responseReport.bindings.sourceCurrentPositionsInvMassKgSha256
    )
      fail('binding-mismatch', 'D-424 corrected-candidate content hashes drifted.');
    for (const digest of [
      witness.runtimeProjectionCanonicalSha256,
      witness.responseProjectionCanonicalSha256,
      witness.runtimeNormalizedV5AggregateSha256,
      responseReport.stableEvidence.canonicalSha256,
      responseReport.bindings.sourceCurrentPositionsInvMassKgSha256,
      candidateVec4Sha,
      candidateVec3Sha,
      candidatePreviousSha,
      topologySha,
    ])
      if (!isSha256(digest))
        fail('binding-mismatch', 'A corrected strain SHA-256 binding is invalid.');

    const sealed = await validateSealedSimulationPackageV5V1(witness.runtime.normalizedV5);
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'during V5 seal validation');
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
      finalPositionsInvMassKg: witness.response.candidateCurrentPositionsInvMassKg,
      normalizedTopology: witness.response.normalizedTriangles,
      triangleIndices: continuum.triangleIndices,
      triangleRestFrames: continuum.triangleRestFrames,
      materialIndices: continuum.materialIndices,
      materialRecords: continuum.materialRecords,
    });
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'while sealing corrected port');
    const portAudit = await auditTriangleStrainUtilizationPortV1(port);
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'while auditing corrected port');
    if (!portAudit.ok)
      fail(
        'invalid-continuum-input',
        `Corrected saved32 strain port blocked: ${joinStrings(portAudit.blockers, ', ')}.`,
      );
    if (
      port.vertexCount !== BETA_SKIRT_STRAIN_UTILIZATION_VERTEX_COUNT_V1 ||
      port.triangleCount !== BETA_SKIRT_STRAIN_UTILIZATION_TRIANGLE_COUNT_V1 ||
      port.bindings.finalPositionsInvMassKgSha256 !== candidateVec4Sha ||
      port.bindings.normalizedTopologySha256 !== topologySha
    )
      fail('binding-mismatch', 'Corrected saved32 strain port content binding drifted.');

    const [kernelSha, limitsSha, colorSha] = await Promise.all([
      digestText(TRIANGLE_STRAIN_UTILIZATION_DIAGNOSTIC_WGSL_V1),
      digestText(capturedJsonStringify(BETA_SKIRT_STRAIN_UTILIZATION_PROVISIONAL_LIMITS_V1)),
      digestText(capturedJsonStringify(BETA_SKIRT_STRAIN_UTILIZATION_COLOR_LUT_V1)),
    ]);
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'while hashing frozen V1 inputs');
    if (
      kernelSha !== FROZEN_V1_KERNEL_SHA256 ||
      limitsSha !== FROZEN_V1_LIMITS_SHA256 ||
      colorSha !== FROZEN_V1_COLOR_LUT_SHA256
    )
      fail('binding-mismatch', 'Frozen V1 strain kernel, limits, or LUT identity drifted.');

    const gpu = await executeTriangleStrainUtilizationGpuPortV1(canvas, port, capturedOptions);
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'during corrected GPU execution');
    if (gpu.values.length !== port.triangleCount * 4 || gpu.flags.length !== port.triangleCount)
      fail('gpu-execution-failed', 'Corrected saved32 strain output dimensions drifted.');
    if (gpu.validationMessages.length !== 0)
      fail('gpu-execution-failed', 'Corrected GPU validation emitted messages.');
    let invalidTriangleCount = 0;
    for (const flag of gpu.flags) if (flag !== 0) invalidTriangleCount += 1;
    for (const value of gpu.values)
      if (!capturedNumberIsFinite(value))
        fail('gpu-execution-failed', 'Corrected GPU readback contains non-finite strain.');
    if (invalidTriangleCount !== 0)
      fail('gpu-execution-failed', `GPU emitted ${invalidTriangleCount} invalid triangles.`);
    const cpu = evaluateTriangleStrainUtilizationCpuV1(port);
    if (cpu.length !== gpu.values.length)
      fail('gpu-execution-failed', 'Corrected CPU parity output dimensions drifted.');
    for (const value of cpu)
      if (!capturedNumberIsFinite(value))
        fail('gpu-execution-failed', 'Corrected CPU parity output contains non-finite strain.');
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
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'while sealing fresh outputs');
    const bindings = objectFreeze({
      runtimeSourceCanonicalSha256: witness.runtimeProjectionCanonicalSha256,
      runtimeReportCanonicalSha256: runtimeOwner.report.seal.canonicalSha256,
      normalizedV5AggregateSha256: witness.runtimeNormalizedV5AggregateSha256,
      staticResponseStableEvidenceSha256: responseReport.stableEvidence.canonicalSha256,
      staticResponseReportCanonicalSha256: witness.responseProjectionCanonicalSha256,
      sourceCurrentPositionsInvMassKgSha256:
        responseReport.bindings.sourceCurrentPositionsInvMassKgSha256,
      candidateCurrentPositionsInvMassKgSha256: candidateVec4Sha,
      candidateCurrentPositions3MSha256: candidateVec3Sha,
      candidatePreviousPositionsInvMassKgSha256: candidatePreviousSha,
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
      genuineSavedRuntimeWrapperAuthenticated: false as const,
      privateBaseRuntimeAndStaticResponseOwnersRequired: true as const,
      inputOwnersReturnedByAdapter: false as const,
      bothInputOwnersRevalidatedAcrossAsyncBoundaries: true as const,
      exactD424StaticResponseCandidateBound: true as const,
      d424StaticPostgatesMeasuredClear: true as const,
      preResponseD420OutputReused: false as const,
      preResponseStrainOwnerAcceptedAsInput: false as const,
      exactRuntimeSourceV5ContinuumBuffersBound: true as const,
      frozenV1KernelPortLimitsAndColorLutReused: true as const,
      gpuPerTriangleDiagnosticExecutedFresh: true as const,
      boundedReadback: true as const,
      dimensionlessStrainDiagnosticOnly: true as const,
      provisionalMaterialVisualizationThresholds: true as const,
      physicalStressOrPaComputed: false as const,
      materialFailureEvaluated: false as const,
      candidateUploadedToGpuForFrameContinuation: false as const,
      exactFrameContinuationExecuted: false as const,
      rehydratedNextFrameParityProven: false as const,
      collisionAuthority: false as const,
      fitAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    });
    const blockers = objectFreeze([
      'outer-saved-wrapper-authentication-not-established-by-structural-adapter',
      'exact-frame-continuation-not-executed',
      'rehydrated-next-frame-parity-not-proven',
      'material-visualization-thresholds-provisional-and-uncalibrated',
      'physical-stress-and-pa-not-computed',
      'material-failure-not-evaluated',
      'settle-fit-runtime-production-authority-not-established',
    ] as const);
    const stablePayload = objectFreeze({
      schemaVersion:
        BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_UTILIZATION_REPORT_V1,
      status: 'saved-32-frame-static-response-strain-diagnostic-blocked' as const,
      decision:
        'MEASURED_D424_CORRECTED_CANDIDATE_BOUNDED_PER_TRIANGLE_STRAIN_WITH_MATERIAL_BLOCKERS' as const,
      bindings: objectFreeze({
        ...bindings,
        runtimeReportCanonicalSha256: undefined,
        staticResponseReportCanonicalSha256: undefined,
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
        'beta-skirt-canonical-medium-saved-32-frame-static-response-strain-stable-v1',
        stablePayload,
      ),
      excludesVolatileStaticResponseReportSealAndGpuTiming: true as const,
    });
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'while sealing stable evidence');
    const reportWithoutSeal = objectFreeze({
      schemaVersion:
        BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_UTILIZATION_REPORT_V1,
      status: 'saved-32-frame-static-response-strain-diagnostic-blocked' as const,
      decision:
        'MEASURED_D424_CORRECTED_CANDIDATE_BOUNDED_PER_TRIANGLE_STRAIN_WITH_MATERIAL_BLOCKERS' as const,
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
          'beta-skirt-canonical-medium-saved-32-frame-static-response-strain-report-v1',
          reportWithoutSeal,
        ),
        authority:
          'unsigned-structural-saved-32-frame-static-response-strain-content-only' as const,
      }),
    }) satisfies BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainReportV1;
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'before output owner minting');
    const owner = objectFreeze({
      schemaVersion:
        BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_UTILIZATION_OWNER_V1,
      report,
    }) as BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOwnerV1;
    registerOwner(owner, {
      triangleValues: new CapturedFloat32Array(gpu.values),
      validityFlags: new CapturedUint32Array(gpu.flags),
      normalizedTopology: new CapturedUint32Array(port.normalizedTopology),
    });
    return objectFreeze({ ok: true as const, owner, report });
  } catch (error) {
    if (error instanceof CorrectedStrainError)
      return objectFreeze({ ok: false as const, code: error.code, detail: error.message });
    const detail =
      error instanceof Error ? error.message : 'Unknown corrected saved32 strain failure.';
    const boundedDetail = capturedStringSlice
      ? (capturedReflectApply(capturedStringSlice, detail, [0, 2_048]) as string)
      : 'Corrected saved32 strain adapter failed closed.';
    return objectFreeze({
      ok: false as const,
      code: regexTest(ABORT, detail) ? ('aborted' as const) : ('gpu-execution-failed' as const),
      detail: boundedDetail,
    });
  }
}

export function projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainV1(
  owner: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainProjectionV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = ownerRecord(owner as object);
  if (!record) return null;
  const typed = owner as BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOwnerV1;
  return objectFreeze({
    schemaVersion:
      BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_UTILIZATION_PROJECTION_V1,
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
    exactD424CandidateBound: true as const,
    preResponseD420OutputReused: false as const,
    strainDiagnosticAuthority: true as const,
    physicalStressAuthority: false as const,
    materialFailureAuthority: false as const,
    fitAuthority: false as const,
    runtimeAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainV1(
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
