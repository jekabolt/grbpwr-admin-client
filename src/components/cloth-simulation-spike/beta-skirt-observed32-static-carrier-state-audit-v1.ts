/** Fixed 580/82/498/34 bounded-preview state audit. This pure arithmetic module neither
 * authenticates its caller's buffers nor issues runtime, collision or continuation authority.
 */
export const BETA_SKIRT_OBSERVED32_STATIC_CARRIER_STATE_AUDIT_V1 =
  'beta-skirt-observed32-static-carrier-state-audit/1' as const;

export type BetaSkirtObserved32StaticCarrierStateAuditInputV1 = Readonly<{
  initialPositionsXYZW: Float32Array;
  rawCurrentPositionsXYZW: Float32Array;
  rawPreviousPositionsXYZW: Float32Array;
  candidateCurrentPositionsXYZW: Float32Array;
  candidatePreviousPositionsXYZW: Float32Array;
  pinnedVertexIds: Uint32Array;
  seamVertexPairs: Uint32Array;
  epsilonM: number;
}>;

const VERTICES = 580;
const PINS = 82;
const FREE = 498;
const SEAMS = 34;
const keys = [
  'initialPositionsXYZW',
  'rawCurrentPositionsXYZW',
  'rawPreviousPositionsXYZW',
  'candidateCurrentPositionsXYZW',
  'candidatePreviousPositionsXYZW',
  'pinnedVertexIds',
  'seamVertexPairs',
  'epsilonM',
] as const;
const typedPrototype = Object.getPrototypeOf(Float32Array.prototype);
const nativeBuffer = Object.getOwnPropertyDescriptor(typedPrototype, 'buffer')!.get!;
const nativeOffset = Object.getOwnPropertyDescriptor(typedPrototype, 'byteOffset')!.get!;
const nativeLength = Object.getOwnPropertyDescriptor(typedPrototype, 'length')!.get!;
const nativeByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
const nativeSet = Uint8Array.prototype.set;

function snapshot<T extends Float32Array | Uint32Array>(
  value: unknown,
  constructor: Float32ArrayConstructor | Uint32ArrayConstructor,
  length: number,
  label: string,
): { values: T; sourceBuffer: ArrayBuffer; sourceOffset: number; byteLength: number } {
  if (!value || Object.getPrototypeOf(value) !== constructor.prototype)
    throw new TypeError(`${label} must be a native ${constructor.name}.`);
  const buffer = nativeBuffer.call(value) as ArrayBuffer;
  const offset = nativeOffset.call(value) as number;
  if (nativeLength.call(value) !== length)
    throw new TypeError(`${label} has the wrong fixed-profile length.`);
  // The native ArrayBuffer getter rejects shared buffers; no concurrent writer is admitted.
  nativeByteLength.call(buffer);
  const copy = new constructor(length);
  nativeSet.call(new Uint8Array(copy.buffer), new Uint8Array(buffer, offset, length * 4));
  return { values: copy as T, sourceBuffer: buffer, sourceOffset: offset, byteLength: length * 4 };
}

function capture(input: BetaSkirtObserved32StaticCarrierStateAuditInputV1) {
  if (
    !input ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  )
    throw new TypeError('Static carrier state audit requires a plain input record.');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(input).length !== keys.length ||
    keys.some((key) => !descriptors[key] || !('value' in descriptors[key]!))
  )
    throw new TypeError('Static carrier state audit requires exactly its own data fields.');
  const epsilonM = descriptors.epsilonM!.value as unknown;
  if (typeof epsilonM !== 'number' || !Number.isFinite(epsilonM) || epsilonM <= 0)
    throw new RangeError('Static carrier state audit epsilon must be finite and positive.');
  const states = keys
    .slice(0, 5)
    .map((key) => snapshot<Float32Array>(descriptors[key]!.value, Float32Array, VERTICES * 4, key));
  const [initial, rawCurrent, rawPrevious, candidateCurrent, candidatePrevious] = states.map(
    (state) => state.values,
  ) as [Float32Array, Float32Array, Float32Array, Float32Array, Float32Array];
  const currentRange = states[1]!,
    previousRange = states[2]!;
  if (
    currentRange.sourceBuffer === previousRange.sourceBuffer &&
    currentRange.sourceOffset < previousRange.sourceOffset + previousRange.byteLength &&
    previousRange.sourceOffset < currentRange.sourceOffset + currentRange.byteLength
  )
    throw new TypeError('Raw current and previous states must occupy distinct memory ranges.');
  for (const state of states)
    for (const value of state.values)
      if (!Number.isFinite(value))
        throw new RangeError('Every static carrier XYZW component must be finite.');
  const pins = snapshot<Uint32Array>(
    descriptors.pinnedVertexIds!.value,
    Uint32Array,
    PINS,
    'pinnedVertexIds',
  ).values;
  const seams = snapshot<Uint32Array>(
    descriptors.seamVertexPairs!.value,
    Uint32Array,
    SEAMS * 2,
    'seamVertexPairs',
  ).values;
  const pinSet = new Set(pins);
  if (pinSet.size !== PINS || [...pins].some((v) => v >= VERTICES))
    throw new TypeError('Pins must be 82 distinct in-range explicit vertex IDs.');
  const seamSet = new Set(seams);
  if (seamSet.size !== SEAMS * 2 || [...seams].some((v) => v >= VERTICES))
    throw new TypeError('AO seams must be 34 distinct one-to-one in-range explicit pairs.');
  return {
    initial,
    rawCurrent,
    rawPrevious,
    candidateCurrent,
    candidatePrevious,
    pinSet,
    seams,
    epsilonM,
  };
}

function bits(values: Float32Array): Uint32Array {
  return new Uint32Array(values.buffer);
}
function difference(a: Float32Array, b: Float32Array, vertex: number): number {
  const i = vertex * 4;
  return Math.hypot(a[i]! - b[i]!, a[i + 1]! - b[i + 1]!, a[i + 2]! - b[i + 2]!);
}
function mismatches(a: Uint32Array, b: Uint32Array, pinSet: ReadonlySet<number>) {
  let inverseMassVertexCount = 0,
    pinnedPositionVertexCount = 0;
  for (let vertex = 0; vertex < VERTICES; vertex++) {
    const i = vertex * 4;
    if (a[i + 3] !== b[i + 3]) inverseMassVertexCount++;
    if (pinSet.has(vertex) && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]))
      pinnedPositionVertexCount++;
  }
  return Object.freeze({ inverseMassVertexCount, pinnedPositionVertexCount });
}
function seamGap(values: Float32Array, seams: Uint32Array): number {
  let maximum = 0;
  for (let pair = 0; pair < SEAMS; pair++) {
    const a = seams[pair * 2]! * 4,
      b = seams[pair * 2 + 1]! * 4;
    maximum = Math.max(
      maximum,
      Math.hypot(
        values[a]! - values[b]!,
        values[a + 1]! - values[b + 1]!,
        values[a + 2]! - values[b + 2]!,
      ),
    );
  }
  return maximum;
}

export function auditBetaSkirtObserved32StaticCarrierStateV1(
  input: BetaSkirtObserved32StaticCarrierStateAuditInputV1,
) {
  const state = capture(input);
  const {
    initial,
    rawCurrent,
    rawPrevious,
    candidateCurrent,
    candidatePrevious,
    pinSet,
    seams,
    epsilonM,
  } = state;
  const initialBits = bits(initial),
    rawCurrentBits = bits(rawCurrent),
    rawPreviousBits = bits(rawPrevious);
  const candidateCurrentBits = bits(candidateCurrent),
    candidatePreviousBits = bits(candidatePrevious);
  const exactState = Object.freeze({
    rawCurrentVsInitial: mismatches(rawCurrentBits, initialBits, pinSet),
    rawPreviousVsInitial: mismatches(rawPreviousBits, initialBits, pinSet),
    candidateCurrentVsRaw: mismatches(candidateCurrentBits, rawCurrentBits, pinSet),
    candidatePreviousVsRaw: mismatches(candidatePreviousBits, rawPreviousBits, pinSet),
    candidateCurrentVsInitial: mismatches(candidateCurrentBits, initialBits, pinSet),
    candidatePreviousVsInitial: mismatches(candidatePreviousBits, initialBits, pinSet),
  });
  let zeroInverseMassVertexCount = 0,
    positiveInverseMassVertexCount = 0,
    invalidInverseMassVertexCount = 0,
    pinZeroMembershipMismatchCount = 0;
  let correctedCurrentVertexCount = 0,
    correctedPreviousVertexCount = 0,
    correctedVertexCountUnion = 0;
  let maxCurrentCorrectionM = 0,
    maxPreviousCorrectionM = 0,
    maxCurrentPreviousDeltaDriftM = 0;
  for (let vertex = 0; vertex < VERTICES; vertex++) {
    const i = vertex * 4,
      w = initial[i + 3]!;
    if (w === 0) zeroInverseMassVertexCount++;
    else if (w > 0) positiveInverseMassVertexCount++;
    else invalidInverseMassVertexCount++;
    if (pinSet.has(vertex) !== (w === 0)) pinZeroMembershipMismatchCount++;
    const currentCorrection = difference(candidateCurrent, rawCurrent, vertex);
    const previousCorrection = difference(candidatePrevious, rawPrevious, vertex);
    if (currentCorrection > 0) correctedCurrentVertexCount++;
    if (previousCorrection > 0) correctedPreviousVertexCount++;
    if (currentCorrection > 0 || previousCorrection > 0) correctedVertexCountUnion++;
    maxCurrentCorrectionM = Math.max(maxCurrentCorrectionM, currentCorrection);
    maxPreviousCorrectionM = Math.max(maxPreviousCorrectionM, previousCorrection);
    maxCurrentPreviousDeltaDriftM = Math.max(
      maxCurrentPreviousDeltaDriftM,
      Math.hypot(
        candidateCurrent[i]! - candidatePrevious[i]! - (rawCurrent[i]! - rawPrevious[i]!),
        candidateCurrent[i + 1]! -
          candidatePrevious[i + 1]! -
          (rawCurrent[i + 1]! - rawPrevious[i + 1]!),
        candidateCurrent[i + 2]! -
          candidatePrevious[i + 2]! -
          (rawCurrent[i + 2]! - rawPrevious[i + 2]!),
      ),
    );
  }
  const rawCurrentMaxSeamGapM = seamGap(rawCurrent, seams),
    candidateCurrentMaxSeamGapM = seamGap(candidateCurrent, seams);
  const maxCorrectionM = Math.max(maxCurrentCorrectionM, maxPreviousCorrectionM);
  const checks = Object.freeze({
    fixedMassAndPinProfile:
      zeroInverseMassVertexCount === PINS &&
      positiveInverseMassVertexCount === FREE &&
      invalidInverseMassVertexCount === 0 &&
      pinZeroMembershipMismatchCount === 0,
    allInverseMassBytesExact: Object.values(exactState).every(
      (comparison) => comparison.inverseMassVertexCount === 0,
    ),
    bothPinnedStatePositionBytesExact: Object.values(exactState).every(
      (comparison) => comparison.pinnedPositionVertexCount === 0,
    ),
    currentSeamGapDidNotRegress: candidateCurrentMaxSeamGapM <= rawCurrentMaxSeamGapM,
    bothStateCorrectionsWithinEpsilon: maxCorrectionM <= epsilonM,
  });
  const blockers = Object.freeze(
    Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name),
  );
  return Object.freeze({
    schemaVersion: BETA_SKIRT_OBSERVED32_STATIC_CARRIER_STATE_AUDIT_V1,
    passed: blockers.length === 0,
    blockers,
    profile: Object.freeze({
      vertexCount: VERTICES,
      pinnedVertexCount: PINS,
      freeVertexCount: FREE,
      seamPairCount: SEAMS,
    }),
    checks,
    exactState,
    metrics: Object.freeze({
      zeroInverseMassVertexCount,
      positiveInverseMassVertexCount,
      invalidInverseMassVertexCount,
      pinZeroMembershipMismatchCount,
      correctedCurrentVertexCount,
      correctedPreviousVertexCount,
      correctedVertexCountUnion,
      maxCurrentCorrectionM,
      maxPreviousCorrectionM,
      maxCorrectionM,
      rawCurrentMaxSeamGapM,
      candidateCurrentMaxSeamGapM,
      maxCurrentPreviousDeltaDriftM,
      epsilonM,
    }),
    claims: Object.freeze({
      fixedProfileBoundedPreviewAuditOnly: true,
      sourceBuffersSnapshotted: true,
      inputBuffersMutated: false,
      inputBufferAuthorityAuthenticated: false,
      runtimeAuthority: false,
      collisionAuthority: false,
      velocityStatePreservationEstablished: false,
      continuationQualified: false,
    } as const),
  });
}

export type BetaSkirtObserved32StaticCarrierStateAuditReportV1 = ReturnType<
  typeof auditBetaSkirtObserved32StaticCarrierStateV1
>;
