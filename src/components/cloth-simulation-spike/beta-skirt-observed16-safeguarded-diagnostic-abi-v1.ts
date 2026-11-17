import {
  XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2,
  XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2,
} from 'lib/cloth/runtime/webgpu/xpbd-embedded-scalar-bend-kernel-v2';
import type { BetaSkirtSavedAnnularObservedPlacement16FrameContactReportV1 } from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';

export type BetaSkirtObserved16SafeguardedDiagnosticAbiFieldsV1 = Pick<
  BetaSkirtSavedAnnularObservedPlacement16FrameContactReportV1,
  | 'schemaVersion'
  | 'sourceKind'
  | 'status'
  | 'decision'
  | 'execution'
  | 'observations'
  | 'quality'
  | 'bendSolver'
>;

const DIAGNOSTIC_BYTES = 3_728;
const CONTACT_OFFSET = 40 + 912 * 4;
const MAX_LIMITED_STEPS = 1_246 * 8 * 16;
const MAX_CONTACT_EVENTS = (580 - 82) * 16;
const getDescriptors = Object.getOwnPropertyDescriptors;
const getDescriptor = Object.getOwnPropertyDescriptor;
const getPrototype = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const plainPrototype = Object.prototype;
const arrayIsArray = Array.isArray;
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const sameValue = Object.is;
const fround = Math.fround;
const apply = Reflect.apply;
const CapturedUint8Array = Uint8Array;
const CapturedDataView = DataView;
const sliceBytes = Uint8Array.prototype.slice;
const setUint32 = DataView.prototype.setUint32;
const setFloat32 = DataView.prototype.setFloat32;

function data(input: unknown, keys: readonly string[], label: string, exact = false) {
  if (!input || typeof input !== 'object' || getPrototype(input) !== plainPrototype)
    throw new TypeError(`${label} must be a plain record.`);
  const descriptors = getDescriptors(input);
  if (exact && ownKeys(descriptors).length !== keys.length)
    throw new TypeError(`${label} has unexpected fields.`);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      throw new TypeError(`${label}.${key} must be own enumerable data.`);
    result[key] = descriptor.value;
  }
  return result;
}

function uint32(value: unknown, maximum: number, label: string): number {
  if (
    typeof value !== 'number' ||
    !numberIsInteger(value) ||
    value < 0 ||
    value > maximum ||
    sameValue(value, -0)
  )
    throw new TypeError(`${label} is outside the fixed Uint32 domain.`);
  return value;
}

function nonnegativeFloat32(value: unknown, label: string): number {
  if (
    typeof value !== 'number' ||
    !numberIsFinite(value) ||
    value < 0 ||
    sameValue(value, -0) ||
    fround(value) !== value
  )
    throw new TypeError(`${label} must be an exact finite nonnegative Float32.`);
  return value;
}

function emptyMessages(value: unknown): boolean {
  if (!arrayIsArray(value)) return false;
  const descriptors = getDescriptors(value);
  return ownKeys(descriptors).length === 1 && getDescriptor(value, 'length')?.value === 0;
}

/**
 * Pure diagnostic serialization, not owner authentication or a physical admission proof.
 * The caller must independently authenticate the live source/frame owners and exact state hashes.
 * Only the observed V2 bend ABI is accepted; the canonical 3,724-byte V1 ABI is unchanged.
 */
export function serializeBetaSkirtObserved16SafeguardedDiagnosticAbiV1(
  report: BetaSkirtObserved16SafeguardedDiagnosticAbiFieldsV1,
): Uint8Array {
  const root = data(
    report,
    [
      'schemaVersion',
      'sourceKind',
      'status',
      'decision',
      'execution',
      'observations',
      'quality',
      'bendSolver',
    ],
    'Observed16 report',
  );
  const execution = data(
    root.execution,
    [
      'frameSubmissionCount',
      'readbackSubmissionCount',
      'totalComputeDispatchCount',
      'positionReadbackByteLength',
      'diagnosticReadbackByteLength',
      'invalidVelocityStateCount',
      'numericInvalidVelocityStateCount',
      'outOfDomainVelocityStateCount',
      'bendInvalidConstraintCount',
      'continuumNonzeroStatusCount',
      'contactDispatchCount',
      'contactCorrectedParticleEventCount',
      'contactInvalidParticleCount',
      'contactDegenerateTriangleVisitCount',
      'contactOutOfRangeTriangleVisitCount',
      'contactMaximumCorrectionM',
      'contactMaximumPenetrationM',
      'contactMinimumCorrectedParticleIndex',
      'contactInwardNormalClampEventCount',
      'contactMaximumRemovedInwardNormalDeltaM',
      'contactCorrectionCapHit',
      'validationMessages',
      'deviceLossMessages',
    ],
    'Observed16 execution',
  );
  const observations = data(
    root.observations,
    [
      'everyPositionFinite',
      'everyInverseMassBitExact',
      'pinnedParticleCountBitExact',
      'seamGapBounded',
    ],
    'Observed16 observations',
  );
  const quality = data(root.quality, ['normalReversalCount'], 'Observed16 quality');
  const bend = data(
    root.bendSolver,
    ['kernel', 'sourceSha256', 'stepBound', 'limitedStepCount', 'diagnosticsByteLength'],
    'Observed16 bend solver',
    true,
  );
  if (
    root.schemaVersion !== 'beta-skirt-saved-annular-observed-placement-16-frame-contact/1' ||
    root.sourceKind !== 'saved-annular-observed-placement-v3' ||
    root.status !== 'diagnostic-completed' ||
    root.decision !== 'PASS_16_FRAME_EXACT_BODY_CONTACT_AND_POSTGATE' ||
    execution.frameSubmissionCount !== 16 ||
    execution.readbackSubmissionCount !== 1 ||
    execution.totalComputeDispatchCount !== 5_104 ||
    execution.positionReadbackByteLength !== 580 * 4 * 4 ||
    execution.diagnosticReadbackByteLength !== DIAGNOSTIC_BYTES ||
    execution.contactDispatchCount !== 16 ||
    execution.contactCorrectionCapHit !== false ||
    !emptyMessages(execution.validationMessages) ||
    !emptyMessages(execution.deviceLossMessages) ||
    observations.everyPositionFinite !== true ||
    observations.everyInverseMassBitExact !== true ||
    observations.pinnedParticleCountBitExact !== 82 ||
    observations.seamGapBounded !== true ||
    quality.normalReversalCount !== 0 ||
    bend.kernel !== XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2 ||
    bend.sourceSha256 !== XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2 ||
    bend.stepBound !== 'minimum-current-triangle-altitude-divided-by-eight' ||
    bend.diagnosticsByteLength !== 8
  )
    throw new TypeError('Observed16 report does not establish the safeguarded diagnostic ABI.');
  for (const name of [
    'invalidVelocityStateCount',
    'numericInvalidVelocityStateCount',
    'outOfDomainVelocityStateCount',
    'bendInvalidConstraintCount',
    'continuumNonzeroStatusCount',
    'contactInvalidParticleCount',
    'contactDegenerateTriangleVisitCount',
    'contactOutOfRangeTriangleVisitCount',
  ])
    uint32(execution[name], 0, name);
  const limited = uint32(bend.limitedStepCount, MAX_LIMITED_STEPS, 'limitedStepCount');
  const corrected = uint32(
    execution.contactCorrectedParticleEventCount,
    MAX_CONTACT_EVENTS,
    'contactCorrectedParticleEventCount',
  );
  const inward = uint32(
    execution.contactInwardNormalClampEventCount,
    corrected,
    'contactInwardNormalClampEventCount',
  );
  const correction = nonnegativeFloat32(
    execution.contactMaximumCorrectionM,
    'contactMaximumCorrectionM',
  );
  const penetration = nonnegativeFloat32(
    execution.contactMaximumPenetrationM,
    'contactMaximumPenetrationM',
  );
  const removed = nonnegativeFloat32(
    execution.contactMaximumRemovedInwardNormalDeltaM,
    'contactMaximumRemovedInwardNormalDeltaM',
  );
  const minimumIndex =
    execution.contactMinimumCorrectedParticleIndex === null
      ? 0xffff_ffff
      : uint32(
          execution.contactMinimumCorrectedParticleIndex,
          579,
          'contactMinimumCorrectedParticleIndex',
        );
  if (
    (corrected === 0 &&
      (correction !== 0 ||
        penetration !== 0 ||
        minimumIndex !== 0xffff_ffff ||
        inward !== 0 ||
        removed !== 0)) ||
    (corrected > 0 &&
      (correction <= 0 ||
        correction >= fround(0.08) ||
        minimumIndex === 0xffff_ffff ||
        penetration > correction)) ||
    (inward === 0 && removed !== 0) ||
    (inward > 0 && removed <= 0)
  )
    throw new TypeError('Observed16 contact diagnostic tuple is inconsistent.');

  const bytes = new CapturedUint8Array(DIAGNOSTIC_BYTES);
  const view = new CapturedDataView(bytes.buffer);
  const writeWord = (offset: number, value: number) =>
    apply(setUint32, view, [offset, value, true]);
  // Zero velocity errors, three untouched first-error sentinels, two reserved zero words.
  for (const offset of [12, 16, 20]) writeWord(offset, 0xffff_ffff);
  // Bend invalid@32 is zero; limited@36 is real telemetry, continuum@40 contains 912 zeros.
  writeWord(36, limited);
  writeWord(CONTACT_OFFSET, corrected);
  apply(setFloat32, view, [CONTACT_OFFSET + 16, correction, true]);
  apply(setFloat32, view, [CONTACT_OFFSET + 20, penetration, true]);
  writeWord(CONTACT_OFFSET + 24, minimumIndex);
  writeWord(CONTACT_OFFSET + 28, inward);
  apply(setFloat32, view, [CONTACT_OFFSET + 32, removed, true]);
  return bytes;
}

/** Compares a detached byte snapshot only. It does not mint a receipt or any authority. */
export function assertBetaSkirtObserved16SafeguardedDiagnosticCheckpointV1(
  report: BetaSkirtObserved16SafeguardedDiagnosticAbiFieldsV1,
  actualBytes: Uint8Array,
): void {
  const expected = serializeBetaSkirtObserved16SafeguardedDiagnosticAbiV1(report);
  if (getPrototype(actualBytes) !== CapturedUint8Array.prototype)
    throw new TypeError('Observed16 diagnostics must be native Uint8Array bytes.');
  const actual = apply(sliceBytes, actualBytes, []) as Uint8Array;
  if (actual.length !== DIAGNOSTIC_BYTES)
    throw new TypeError('Observed16 diagnostics must contain exactly 3,728 bytes.');
  for (let offset = 0; offset < DIAGNOSTIC_BYTES; offset += 1)
    if (actual[offset] !== expected[offset])
      throw new TypeError(`Observed16 diagnostic checkpoint differs at byte ${offset}.`);
}
