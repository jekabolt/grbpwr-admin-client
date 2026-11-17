import type { BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerReportV2 } from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';

/** Structural fixed-ABI fields only. Genuine owner/lineage authentication belongs to the caller. */
export type BetaSkirt16FrameDiagnosticAbiFieldsV4 = Pick<
  BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerReportV2,
  'status' | 'decision' | 'execution' | 'observations'
>;

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_EXPECTATION_V4 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-checkpoint-expectation/4' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_OBSERVATION_V4 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-checkpoint-observation/4' as const;

const CONTINUUM_COUNT = 912;
const DIAGNOSTIC_BYTE_LENGTH = 3_724;
const POSITION_READBACK_BYTE_LENGTH = 9_280;
const MAXIMUM_CONTACT_CORRECTION_M = 0.08;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const HEX = '0123456789abcdef';
const objectPrototype = Object.prototype;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const stringCharCodeAt = objectGetOwnPropertyDescriptor(String.prototype, 'charCodeAt')?.value;
const dataViewSetUint32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setUint32')?.value;
const dataViewSetFloat32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setFloat32')?.value;
const dataViewGetUint32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'getUint32')?.value;
const capturedSubtle = globalThis.crypto?.subtle;
const subtleDigest =
  typeof SubtleCrypto === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(SubtleCrypto.prototype, 'digest')?.value;
const CapturedArrayBuffer = ArrayBuffer;
const CapturedDataView = DataView;
const CapturedUint8Array = Uint8Array;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_EXPECTATION_V4;
  savedRuntimeSourceCanonicalSha256: string;
  runtimeSourceCanonicalSha256: string;
  saved16FrameCanonicalSha256: string;
  runner16FrameCanonicalSha256: string;
  sourcePositions3MSha256: string;
  normalizedV5AggregateSha256: string;
  normalizedTopologySha256: string;
  seamPairsSha256: string;
  pinnedVertexIndicesSha256: string;
  bodyPositions3MSha256: string;
  bodyTrianglesSha256: string;
  positionsInvMassKgSha256: string;
  positions3MSha256: string;
  diagnosticsSha256: string;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointObservationV4 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_OBSERVATION_V4;
  savedRuntimeSourceCanonicalSha256: string;
  runtimeSourceCanonicalSha256: string;
  saved16FrameCanonicalSha256: string;
  runner16FrameCanonicalSha256: string;
  sourcePositions3MSha256: string;
  normalizedV5AggregateSha256: string;
  normalizedTopologySha256: string;
  seamPairsSha256: string;
  pinnedVertexIndicesSha256: string;
  bodyPositions3MSha256: string;
  bodyTrianglesSha256: string;
  positionsInvMassKgSha256: string;
  positions3MSha256: string;
  diagnosticsSha256: string;
  diagnosticsMatchFixedAbi: true;
}>;

const EXPECTATION_KEYS = Object.freeze([
  'bodyPositions3MSha256',
  'bodyTrianglesSha256',
  'diagnosticsSha256',
  'normalizedTopologySha256',
  'normalizedV5AggregateSha256',
  'pinnedVertexIndicesSha256',
  'positions3MSha256',
  'positionsInvMassKgSha256',
  'runner16FrameCanonicalSha256',
  'runtimeSourceCanonicalSha256',
  'saved16FrameCanonicalSha256',
  'savedRuntimeSourceCanonicalSha256',
  'schemaVersion',
  'seamPairsSha256',
  'sourcePositions3MSha256',
] as const);

const OBSERVATION_KEYS = Object.freeze([
  'bodyPositions3MSha256',
  'bodyTrianglesSha256',
  'diagnosticsMatchFixedAbi',
  'diagnosticsSha256',
  'normalizedTopologySha256',
  'normalizedV5AggregateSha256',
  'pinnedVertexIndicesSha256',
  'positions3MSha256',
  'positionsInvMassKgSha256',
  'runner16FrameCanonicalSha256',
  'runtimeSourceCanonicalSha256',
  'saved16FrameCanonicalSha256',
  'savedRuntimeSourceCanonicalSha256',
  'schemaVersion',
  'seamPairsSha256',
  'sourcePositions3MSha256',
] as const);

type FlatRecord = Readonly<Record<string, unknown>>;

function exactDataRecord(input: unknown, keys: readonly string[], label: string): FlatRecord {
  if (!input || typeof input !== 'object' || objectGetPrototypeOf(input) !== objectPrototype)
    throw new TypeError(`${label} must be one exact plain record.`);
  let descriptors: PropertyDescriptorMap;
  try {
    descriptors = objectGetOwnPropertyDescriptors(input);
  } catch {
    throw new TypeError(`${label} could not be inspected safely.`);
  }
  const ownKeys = reflectOwnKeys(descriptors);
  if (ownKeys.length !== keys.length) throw new TypeError(`${label} has unexpected fields.`);
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new TypeError(`${label}.${key} must be own enumerable data.`);
    output[key] = descriptor.value;
  }
  for (const key of ownKeys)
    if (typeof key !== 'string' || !keys.includes(key))
      throw new TypeError(`${label} has unexpected fields.`);
  return Object.freeze(output);
}

function isSha256(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 64 || !stringCharCodeAt) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = reflectApply(stringCharCodeAt, value, [index]) as number;
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) return false;
  }
  return true;
}

function parseExpectation(
  input: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4 {
  const record = exactDataRecord(input, EXPECTATION_KEYS, 'Saved 32F checkpoint expectation');
  if (
    record.schemaVersion !==
    BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_EXPECTATION_V4
  )
    throw new TypeError('Saved 32F checkpoint expectation version is unsupported.');
  for (const key of EXPECTATION_KEYS)
    if (key !== 'schemaVersion' && !isSha256(record[key]))
      throw new TypeError(`Saved 32F checkpoint expectation ${key} is not SHA-256.`);
  return Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_EXPECTATION_V4,
    savedRuntimeSourceCanonicalSha256: record.savedRuntimeSourceCanonicalSha256 as string,
    runtimeSourceCanonicalSha256: record.runtimeSourceCanonicalSha256 as string,
    saved16FrameCanonicalSha256: record.saved16FrameCanonicalSha256 as string,
    runner16FrameCanonicalSha256: record.runner16FrameCanonicalSha256 as string,
    sourcePositions3MSha256: record.sourcePositions3MSha256 as string,
    normalizedV5AggregateSha256: record.normalizedV5AggregateSha256 as string,
    normalizedTopologySha256: record.normalizedTopologySha256 as string,
    seamPairsSha256: record.seamPairsSha256 as string,
    pinnedVertexIndicesSha256: record.pinnedVertexIndicesSha256 as string,
    bodyPositions3MSha256: record.bodyPositions3MSha256 as string,
    bodyTrianglesSha256: record.bodyTrianglesSha256 as string,
    positionsInvMassKgSha256: record.positionsInvMassKgSha256 as string,
    positions3MSha256: record.positions3MSha256 as string,
    diagnosticsSha256: record.diagnosticsSha256 as string,
  });
}

/** Takes the immutable call-time snapshot that a V4 runner must retain before its first await. */
export function snapshotBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4(
  input: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4 {
  return parseExpectation(input);
}

function parseObservation(
  input: unknown,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointObservationV4 {
  const record = exactDataRecord(input, OBSERVATION_KEYS, 'Saved 32F checkpoint observation');
  if (
    record.schemaVersion !==
      BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_OBSERVATION_V4 ||
    record.diagnosticsMatchFixedAbi !== true
  )
    throw new TypeError('Saved 32F checkpoint observation version or ABI claim is invalid.');
  for (const key of OBSERVATION_KEYS)
    if (key !== 'schemaVersion' && key !== 'diagnosticsMatchFixedAbi' && !isSha256(record[key]))
      throw new TypeError(`Saved 32F checkpoint observation ${key} is not SHA-256.`);
  return Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_OBSERVATION_V4,
    savedRuntimeSourceCanonicalSha256: record.savedRuntimeSourceCanonicalSha256 as string,
    runtimeSourceCanonicalSha256: record.runtimeSourceCanonicalSha256 as string,
    saved16FrameCanonicalSha256: record.saved16FrameCanonicalSha256 as string,
    runner16FrameCanonicalSha256: record.runner16FrameCanonicalSha256 as string,
    sourcePositions3MSha256: record.sourcePositions3MSha256 as string,
    normalizedV5AggregateSha256: record.normalizedV5AggregateSha256 as string,
    normalizedTopologySha256: record.normalizedTopologySha256 as string,
    seamPairsSha256: record.seamPairsSha256 as string,
    pinnedVertexIndicesSha256: record.pinnedVertexIndicesSha256 as string,
    bodyPositions3MSha256: record.bodyPositions3MSha256 as string,
    bodyTrianglesSha256: record.bodyTrianglesSha256 as string,
    positionsInvMassKgSha256: record.positionsInvMassKgSha256 as string,
    positions3MSha256: record.positions3MSha256 as string,
    diagnosticsSha256: record.diagnosticsSha256 as string,
    diagnosticsMatchFixedAbi: true,
  });
}

/**
 * Dynamic replacement for V3's literal D-377 checkpoint assertion. This function grants no owner
 * authenticity: its caller must first authenticate the live saved wrapper and genuine 16F owner.
 */
export function assertBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4(
  expectedInput: unknown,
  observedInput: unknown,
): void {
  const expected = parseExpectation(expectedInput);
  const observed = parseObservation(observedInput);
  for (const key of EXPECTATION_KEYS) {
    if (key === 'schemaVersion') continue;
    const observedValue = observed[key as keyof typeof observed];
    if (expected[key as keyof typeof expected] !== observedValue)
      throw new Error(`Saved 32F frame-16 checkpoint differs at ${key}.`);
  }
}

function exactUint32(value: number, label: string): number {
  if (!numberIsSafeInteger(value) || value < 0 || value > 0xffff_ffff)
    throw new TypeError(`${label} must be one exact uint32.`);
  return value;
}

function float32Bits(value: number, label: string): number {
  if (!numberIsFinite(value) || value < 0 || !dataViewSetFloat32 || !dataViewGetUint32)
    throw new TypeError(`${label} must be one finite non-negative float32 value.`);
  const bytes = new CapturedArrayBuffer(4);
  const view = new CapturedDataView(bytes);
  reflectApply(dataViewSetFloat32, view, [0, value, true]);
  return reflectApply(dataViewGetUint32, view, [0, true]) as number;
}

function writeUint32(view: DataView, byteOffset: number, value: number): void {
  if (!dataViewSetUint32) throw new TypeError('Native little-endian Uint32 writer is unavailable.');
  reflectApply(dataViewSetUint32, view, [byteOffset, value, true]);
}

/**
 * Reconstructs the complete fixed 3,724-byte diagnostic ABI from a genuine successful 16F report.
 * Zero counts plus the pinned initialization/reset policy uniquely determine the otherwise omitted
 * velocity sentinel words, continuum array, and reserved contact word.
 */
export function reconstructBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4(
  report: BetaSkirt16FrameDiagnosticAbiFieldsV4,
): Uint8Array {
  const execution = report.execution;
  if (
    report.status !== 'diagnostic-completed' ||
    report.decision !== 'PASS_16_FRAME_EXACT_BODY_CONTACT_AND_POSTGATE' ||
    execution.frameSubmissionCount !== 16 ||
    execution.readbackSubmissionCount !== 1 ||
    execution.totalComputeDispatchCount !== 5_104 ||
    execution.positionReadbackByteLength !== POSITION_READBACK_BYTE_LENGTH ||
    execution.diagnosticReadbackByteLength !== DIAGNOSTIC_BYTE_LENGTH ||
    execution.invalidVelocityStateCount !== 0 ||
    execution.numericInvalidVelocityStateCount !== 0 ||
    execution.outOfDomainVelocityStateCount !== 0 ||
    execution.bendInvalidConstraintCount !== 0 ||
    execution.continuumNonzeroStatusCount !== 0 ||
    execution.contactDispatchCount !== 16 ||
    execution.contactInvalidParticleCount !== 0 ||
    execution.contactDegenerateTriangleVisitCount !== 0 ||
    execution.contactOutOfRangeTriangleVisitCount !== 0 ||
    execution.contactCorrectionCapHit ||
    execution.validationMessages.length !== 0 ||
    execution.deviceLossMessages.length !== 0 ||
    !report.observations.everyPositionFinite ||
    !report.observations.everyInverseMassBitExact ||
    report.observations.pinnedParticleCountBitExact !== 82 ||
    !report.observations.seamGapBounded
  )
    throw new TypeError('The 16F report does not establish the fixed diagnostic ABI invariants.');

  const corrected = exactUint32(
    execution.contactCorrectedParticleEventCount,
    'contactCorrectedParticleEventCount',
  );
  const minimumIndex =
    execution.contactMinimumCorrectedParticleIndex === null
      ? 0xffff_ffff
      : exactUint32(
          execution.contactMinimumCorrectedParticleIndex,
          'contactMinimumCorrectedParticleIndex',
        );
  const inward = exactUint32(
    execution.contactInwardNormalClampEventCount,
    'contactInwardNormalClampEventCount',
  );
  if (
    corrected === 0 ||
    corrected > (580 - 82) * 16 ||
    minimumIndex >= 580 ||
    inward > corrected ||
    !numberIsFinite(execution.contactMaximumCorrectionM) ||
    execution.contactMaximumCorrectionM <= 0 ||
    execution.contactMaximumCorrectionM > MAXIMUM_CONTACT_CORRECTION_M ||
    !numberIsFinite(execution.contactMaximumPenetrationM) ||
    execution.contactMaximumPenetrationM < 0 ||
    execution.contactMaximumPenetrationM > execution.contactMaximumCorrectionM ||
    !numberIsFinite(execution.contactMaximumRemovedInwardNormalDeltaM) ||
    execution.contactMaximumRemovedInwardNormalDeltaM < 0 ||
    (inward === 0 && execution.contactMaximumRemovedInwardNormalDeltaM !== 0) ||
    (inward > 0 && execution.contactMaximumRemovedInwardNormalDeltaM <= 0)
  )
    throw new TypeError('The 16F contact diagnostic tuple is inconsistent.');

  const output = new CapturedUint8Array(DIAGNOSTIC_BYTE_LENGTH);
  const view = new CapturedDataView(output.buffer);
  const velocity = [0, 0, 0, 0xffff_ffff, 0xffff_ffff, 0xffff_ffff, 0, 0] as const;
  let word = 0;
  for (const value of velocity) {
    writeUint32(view, word * 4, value);
    word += 1;
  }
  // Bend invalid count followed by the 912 zero continuum statuses are already zero-filled.
  word += 1 + CONTINUUM_COUNT;
  const contact = [
    corrected,
    0,
    0,
    0,
    float32Bits(execution.contactMaximumCorrectionM, 'contactMaximumCorrectionM'),
    float32Bits(execution.contactMaximumPenetrationM, 'contactMaximumPenetrationM'),
    minimumIndex,
    inward,
    float32Bits(
      execution.contactMaximumRemovedInwardNormalDeltaM,
      'contactMaximumRemovedInwardNormalDeltaM',
    ),
    0,
  ] as const;
  for (const value of contact) {
    writeUint32(view, word * 4, value);
    word += 1;
  }
  if (word * 4 !== DIAGNOSTIC_BYTE_LENGTH)
    throw new TypeError('The reconstructed 16F diagnostic ABI has an invalid byte length.');
  return output;
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || !subtleDigest)
    throw new TypeError('Native Web Crypto SHA-256 is unavailable.');
  const result = (await reflectApply(subtleDigest, capturedSubtle, [
    'SHA-256',
    bytes,
  ])) as ArrayBuffer;
  if (objectGetPrototypeOf(result) !== CapturedArrayBuffer.prototype || result.byteLength !== 32)
    throw new TypeError('Native Web Crypto SHA-256 returned invalid bytes.');
  const digest = new CapturedUint8Array(result);
  let hex = '';
  for (let index = 0; index < digest.length; index += 1) {
    const byte = digest[index]!;
    hex += HEX[byte >>> 4]! + HEX[byte & 0x0f]!;
  }
  return hex;
}

export async function hashBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4(
  report: BetaSkirt16FrameDiagnosticAbiFieldsV4,
): Promise<string> {
  if ((await digestBytes(new CapturedUint8Array(0))) !== EMPTY_SHA256)
    throw new TypeError('SHA-256 empty-message known-answer test failed.');
  const abc = new TextEncoder().encode('abc');
  if ((await digestBytes(abc)) !== ABC_SHA256)
    throw new TypeError('SHA-256 abc known-answer test failed.');
  return digestBytes(reconstructBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4(report));
}
