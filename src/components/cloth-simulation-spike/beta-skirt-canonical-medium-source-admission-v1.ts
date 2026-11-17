import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
} from '../../lib/cloth/body/measurement-surface-self-intersection-v1';
import {
  projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2,
  type DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2,
} from '../../lib/cloth/domain/dxf-product-two-panel-skirt-canonical-medium-self-orientation-v2';

import {
  projectBetaSkirtCanonicalMediumProductPlacementV1,
  type BetaSkirtCanonicalMediumProductPlacementOwnerV1,
} from './beta-skirt-canonical-medium-product-placement-v1';
import {
  projectBetaSkirtCanonicalMediumProductSeamPinV2,
  type BetaSkirtCanonicalMediumProductSeamPinOwnerV2,
} from './beta-skirt-canonical-medium-product-seam-pin-v2';
import {
  evaluateBetaSkirtCoherentEnvelopeQualityV1,
  type BetaSkirtCoherentEnvelopeQualityReportV1,
} from './beta-skirt-coherent-envelope-quality-evidence-v1';
import {
  BETA_SKIRT_EXACT_VALIDATED_SEAM_SNAPSHOT_V1,
  computeBetaSkirtExactValidatedSeamReceiptSha256V1,
  type BetaSkirtExactValidatedSeamSnapshotV1,
} from './beta-skirt-primitive-contact-relaxation-candidate-v4';
import {
  BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1,
  evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1,
  snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticReportV1,
} from './beta-skirt-rendered-body-collision-diagnostic-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_REQUEST_V1 =
  'beta-skirt-canonical-medium-source-admission-request/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_REPORT_V1 =
  'beta-skirt-canonical-medium-source-admission-report/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_OWNER_V1 =
  'beta-skirt-canonical-medium-source-admission-owner/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_PROJECTION_V1 =
  'beta-skirt-canonical-medium-source-admission-projection/1' as const;

const MAXIMUM_VERTEX_COUNT = 2_000;
const MAXIMUM_TRIANGLE_COUNT = 5_000;
const MAXIMUM_SEAM_PAIR_COUNT = 4_096;
const MAXIMUM_PIN_COUNT = 4_096;
const MAXIMUM_CANONICAL_BYTES = 4 * 1024 * 1024;
const MAXIMUM_RETAINED_BYTES = 2 * 1024 * 1024;
const MINIMUM_OUTWARD_RADIAL_DOT = 0.5;
const SHA256 = /^[0-9a-f]{64}$/u;

const freeze = Object.freeze;
const getPrototypeOf = Object.getPrototypeOf;
const getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const reflectOwnKeys = Reflect.ownKeys;
const arrayIsArray = Array.isArray;
const objectKeys = Object.keys;
const CapturedArrayBuffer = ArrayBuffer;
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const CapturedDataView = DataView;
const CapturedSet = Set;
const float32Fill = Float32Array.prototype.fill;
const uint32Fill = Uint32Array.prototype.fill;
const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayBuffer = getOwnPropertyDescriptor(typedArrayPrototype, 'buffer')?.get;
const typedArrayByteLength = getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')?.get;
const typedArrayByteOffset = getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset')?.get;
const typedArrayLength = getOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get;
const arrayBufferByteLength = getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')?.get;
const arrayBufferResizable = getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get;
const encoder = new TextEncoder();
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest.bind(capturedSubtle);

export const BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_LIMITS_V1 = freeze({
  maximumVertexCount: MAXIMUM_VERTEX_COUNT,
  maximumTriangleCount: MAXIMUM_TRIANGLE_COUNT,
  maximumSeamPairCount: MAXIMUM_SEAM_PAIR_COUNT,
  maximumPinCount: MAXIMUM_PIN_COUNT,
  maximumCanonicalBytes: MAXIMUM_CANONICAL_BYTES,
  maximumRetainedBytes: MAXIMUM_RETAINED_BYTES,
  minimumOutwardRadialDot: MINIMUM_OUTWARD_RADIAL_DOT,
} as const);

export type BetaSkirtCanonicalMediumSourceAdmissionDecisionV1 =
  | 'diagnostic-source-clear-no-contact-relaxation-required'
  | 'contact-relaxation-required';

export type BetaSkirtCanonicalMediumSourceAdmissionRequestV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_REQUEST_V1;
  expected: Readonly<{
    placementCanonicalSha256: string;
    selfOrientationCanonicalSha256: string;
    seamPinCanonicalSha256: string;
    sourcePositionsRawFloat32LeSha256: string;
    collisionInputSha256: string;
  }>;
  placementOwner: BetaSkirtCanonicalMediumProductPlacementOwnerV1;
  selfOrientationOwner: DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2;
  seamPinOwner: BetaSkirtCanonicalMediumProductSeamPinOwnerV2;
}>;

export type BetaSkirtCanonicalMediumSourceAdmissionClaimsV1 = Readonly<{
  exactSameSessionOwnersBound: true;
  sourceBytesRetainedForRollback: true;
  collisionV1IndependentlyReplayed: true;
  collisionPolicyExactlyPinned: true;
  collisionReportReplayMatched: true;
  rawSourceHashReplayed: true;
  seamReceiptIndependentlyReplayed: true;
  seamCoherenceVerified: true;
  exactPinMaskVerified: true;
  selfIntersectionResidualReplayedZero: true;
  outwardOrientationReplayed: true;
  sourceRestQualityMeasured: true;
  identicalV4CandidateManufactured: false;
  sourceAdmissionDiagnosticAuthority: true;
  collisionAuthority: false;
  initializationAuthority: false;
  gravitySettleEvaluated: false;
  runtimeAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumSourceAdmissionReportV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_REPORT_V1;
  status: 'diagnostic-complete';
  decision: BetaSkirtCanonicalMediumSourceAdmissionDecisionV1;
  bindings: Readonly<{
    placementCanonicalSha256: string;
    selfOrientationCanonicalSha256: string;
    seamPinCanonicalSha256: string;
    sourcePositionsRawFloat32LeSha256: string;
    sourceTopologyRawUint32LeSha256: string;
    sourceInverseMassRawFloat32LeSha256: string;
    seamPairsRawUint32LeSha256: string;
    pinnedVertexIndicesRawUint32LeSha256: string;
    exactV4SeamValidationReceiptSha256: string;
    collisionPolicySha256: string;
    collisionInputSha256: string;
    collisionReplayEvidenceSha256: string;
    retainedCandidateSha256: string;
  }>;
  counts: Readonly<{
    bodyVertexCount: number;
    bodyTriangleCount: number;
    garmentVertexCount: 580;
    garmentTriangleCount: 912;
    seamPairCount: 34;
    pinnedVertexCount: 82;
    selfRawIntersectionCount: 182;
    selfSeamEquivalentIntersectionCount: 182;
    selfResidualIntersectionCount: 0;
  }>;
  collision: Readonly<{
    status: 'signed-clearance-measured';
    bodyGarmentTriangleIntersectionCount: number;
    penetratingVertexCount: number;
    unsafeVertexCount: number;
    ambiguousSignVertexCount: 0;
    minimumSignedClearanceM: number;
    unsafeClearanceMarginM: number;
    exactClear: boolean;
    contactRelaxationRequired: boolean;
  }>;
  selfOrientation: Readonly<{
    rawOracleCount: 182;
    indexedAdjacentCount: 0;
    authenticatedSeamEquivalentCount: 182;
    residualNonadjacentCount: 0;
    minimumOutwardRadialDot: number;
    degenerateTriangleCount: 0;
    outwardFailureCount: 0;
    qualified: true;
  }>;
  seamPin: Readonly<{
    maximumSeamGapM: 0;
    exactV4ReceiptMatched: true;
    zeroInverseMassVertexCount: 82;
    pinMaskMatched: true;
  }>;
  restQuality: Readonly<{
    status: 'measured-structural-evidence';
    sourceIsRetainedRestCandidate: true;
    uniqueEdgeCount: number;
    degenerateTriangleCount: 0;
    zeroLengthEdgeCount: 0;
    minimumIdentityEdgeLengthRatio: 1;
    maximumIdentityEdgeLengthRatio: 1;
    minimumIdentityAreaRatio: 1;
    maximumIdentityAreaRatio: 1;
    maximumIdentityPrincipalStrain: 0;
    rootMeanSquareIdentityPrincipalStrain: 0;
    normalReversalCount: 0;
    qualityBlockerCount: 0;
  }>;
  retainedCandidate: Readonly<{
    sourceBytesRetained: true;
    rollbackBytesRetained: true;
    sourceAndRollbackAreOneExactByteIdentity: true;
    noSyntheticCandidateCreated: true;
    retainedBinaryByteLength: number;
  }>;
  fallback: Readonly<{
    solver: 'V4/V4.1 primitive-contact multiround';
    use: 'only-when-contact-relaxation-required';
    exactClearSourceBypassesFallback: true;
    acceptanceRequiresStrictParentImprovement: true;
    acceptanceRequiresStrictGlobalBaselineImprovement: true;
    identicalSourceCandidateCannotPassStrictImprovement: true;
  }>;
  claims: BetaSkirtCanonicalMediumSourceAdmissionClaimsV1;
  deferred: Readonly<{
    gravitySettle: 'not-evaluated';
    runtime: 'not-authorized';
    fit: 'not-authorized';
    production: 'not-authorized';
  }>;
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-source-admission-diagnostic-only';
  }>;
}>;

declare const canonicalMediumSourceAdmissionOwnerBrand: unique symbol;
export type BetaSkirtCanonicalMediumSourceAdmissionOwnerV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_OWNER_V1;
  report: BetaSkirtCanonicalMediumSourceAdmissionReportV1;
  readonly [canonicalMediumSourceAdmissionOwnerBrand]: never;
}>;

export type BetaSkirtCanonicalMediumSourceAdmissionProjectionV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_PROJECTION_V1;
  reportCanonicalSha256: string;
  decision: BetaSkirtCanonicalMediumSourceAdmissionDecisionV1;
  retainedSourceCandidate: Readonly<{
    positions3M: Float32Array;
    positionsInvMass: Float32Array;
    triangles: Uint32Array;
    seamSnapshot: BetaSkirtExactValidatedSeamSnapshotV1;
    pinnedVertexIndices: Uint32Array;
  }>;
  rollbackCandidate: Readonly<{
    positions3M: Float32Array;
    positionsInvMass: Float32Array;
    triangles: Uint32Array;
    seamSnapshot: BetaSkirtExactValidatedSeamSnapshotV1;
    pinnedVertexIndices: Uint32Array;
  }>;
  collisionInput: BetaSkirtRenderedBodyCollisionDiagnosticInputV1;
  callerOwnedMutableBinaryCopies: true;
  sourceAdmissionDiagnosticAuthority: true;
  collisionAuthority: false;
  initializationAuthority: false;
  gravitySettleAuthority: false;
  runtimeAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumSourceAdmissionErrorCodeV1 =
  | 'invalid-input'
  | 'upstream-owner-unavailable'
  | 'authority-binding-mismatch'
  | 'collision-policy-replay-mismatch'
  | 'collision-report-replay-mismatch'
  | 'self-orientation-replay-mismatch'
  | 'seam-pin-replay-mismatch'
  | 'source-quality-blocked'
  | 'resource-budget-exceeded'
  | 'sha256-unavailable';

const BLOCKED_CLAIMS = freeze({
  exactSameSessionOwnersBound: false as const,
  sourceBytesRetainedForRollback: false as const,
  collisionV1IndependentlyReplayed: false as const,
  collisionPolicyExactlyPinned: false as const,
  collisionReportReplayMatched: false as const,
  rawSourceHashReplayed: false as const,
  seamReceiptIndependentlyReplayed: false as const,
  seamCoherenceVerified: false as const,
  exactPinMaskVerified: false as const,
  selfIntersectionResidualReplayedZero: false as const,
  outwardOrientationReplayed: false as const,
  sourceRestQualityMeasured: false as const,
  identicalV4CandidateManufactured: false as const,
  sourceAdmissionDiagnosticAuthority: false as const,
  collisionAuthority: false as const,
  initializationAuthority: false as const,
  gravitySettleEvaluated: false as const,
  runtimeAuthority: false as const,
  fitAuthority: false as const,
  productionAuthority: false as const,
});

export type BetaSkirtCanonicalMediumSourceAdmissionResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumSourceAdmissionOwnerV1;
      report: BetaSkirtCanonicalMediumSourceAdmissionReportV1;
      decision: BetaSkirtCanonicalMediumSourceAdmissionDecisionV1;
      claims: BetaSkirtCanonicalMediumSourceAdmissionClaimsV1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      report: null;
      decision: null;
      claims: typeof BLOCKED_CLAIMS;
      blockers: readonly [
        Readonly<{ code: BetaSkirtCanonicalMediumSourceAdmissionErrorCodeV1; detail: string }>,
      ];
    }>;

type OwnerRecord = {
  disposed: boolean;
  decision: BetaSkirtCanonicalMediumSourceAdmissionDecisionV1;
  collisionInput: BetaSkirtRenderedBodyCollisionDiagnosticInputV1;
  positions3M: Float32Array;
  positionsInvMass: Float32Array;
  triangles: Uint32Array;
  seamPairs: Uint32Array;
  pins: Uint32Array;
  seamReceiptSha256: string;
};

const owners = new WeakMap<object, OwnerRecord>();

class SourceAdmissionFailure extends Error {
  constructor(
    readonly code: BetaSkirtCanonicalMediumSourceAdmissionErrorCodeV1,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(code: BetaSkirtCanonicalMediumSourceAdmissionErrorCodeV1, detail: string): never {
  throw new SourceAdmissionFailure(code, detail);
}

function blocked(
  error: unknown,
): Extract<BetaSkirtCanonicalMediumSourceAdmissionResultV1, { ok: false }> {
  const failure =
    error instanceof SourceAdmissionFailure
      ? error
      : new SourceAdmissionFailure(
          'authority-binding-mismatch',
          error instanceof Error
            ? error.message
            : 'Canonical-medium source admission failed closed.',
        );
  return freeze({
    ok: false as const,
    owner: null,
    report: null,
    decision: null,
    claims: BLOCKED_CLAIMS,
    blockers: freeze([freeze({ code: failure.code, detail: failure.message })]) as readonly [
      Readonly<{ code: typeof failure.code; detail: string }>,
    ],
  });
}

function exactRecord(value: unknown, expectedKeys: readonly string[], label: string) {
  if (!value || typeof value !== 'object' || arrayIsArray(value))
    fail('invalid-input', `${label} must be one exact plain record.`);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = getPrototypeOf(value);
    descriptors = getOwnPropertyDescriptors(value);
  } catch {
    fail('invalid-input', `${label} could not be inspected safely.`);
  }
  if (prototype !== Object.prototype)
    fail('invalid-input', `${label} must use the exact Object prototype.`);
  const keys = reflectOwnKeys(descriptors);
  const expected = [...expectedKeys].sort();
  if (
    keys.some((key) => typeof key !== 'string') ||
    keys.length !== expected.length ||
    (keys as string[]).sort().some((key, index) => key !== expected[index])
  ) {
    fail('invalid-input', `${label} has an unsupported exact shape.`);
  }
  const result: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      fail('invalid-input', `${label}.${key} must be an enumerable own data property.`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function snapshotRequest(input: unknown) {
  const request = exactRecord(
    input,
    ['schemaVersion', 'expected', 'placementOwner', 'selfOrientationOwner', 'seamPinOwner'],
    'request',
  );
  if (request.schemaVersion !== BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_REQUEST_V1)
    fail('invalid-input', 'Canonical-medium source-admission request version is unsupported.');
  const expected = exactRecord(
    request.expected,
    [
      'placementCanonicalSha256',
      'selfOrientationCanonicalSha256',
      'seamPinCanonicalSha256',
      'sourcePositionsRawFloat32LeSha256',
      'collisionInputSha256',
    ],
    'request.expected',
  );
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value !== 'string' || !SHA256.test(value))
      fail('invalid-input', `request.expected.${key} must be one lowercase SHA-256 digest.`);
  }
  return {
    expected: expected as BetaSkirtCanonicalMediumSourceAdmissionRequestV1['expected'],
    placementOwner: request.placementOwner,
    selfOrientationOwner: request.selfOrientationOwner,
    seamPinOwner: request.seamPinOwner,
  };
}

function exactTypedArray<T extends Float32Array | Uint32Array>(
  value: unknown,
  prototype: object,
  bytesPerElement: number,
  create: (length: number) => T,
  label: string,
): T {
  if (
    !value ||
    typeof value !== 'object' ||
    getPrototypeOf(value) !== prototype ||
    !typedArrayBuffer ||
    !typedArrayByteLength ||
    !typedArrayByteOffset ||
    !typedArrayLength ||
    !arrayBufferByteLength
  ) {
    fail('authority-binding-mismatch', `${label} must be an exact typed array.`);
  }
  let buffer: unknown;
  let byteLength: unknown;
  let byteOffset: unknown;
  let length: unknown;
  let bufferLength: unknown;
  let resizable = false;
  try {
    buffer = typedArrayBuffer.call(value);
    byteLength = typedArrayByteLength.call(value);
    byteOffset = typedArrayByteOffset.call(value);
    length = typedArrayLength.call(value);
    bufferLength = arrayBufferByteLength.call(buffer);
    resizable = arrayBufferResizable ? Boolean(arrayBufferResizable.call(buffer)) : false;
  } catch {
    fail('authority-binding-mismatch', `${label} could not be inspected safely.`);
  }
  if (
    !(buffer instanceof CapturedArrayBuffer) ||
    getPrototypeOf(buffer) !== ArrayBuffer.prototype ||
    resizable ||
    !Number.isSafeInteger(length) ||
    byteOffset !== 0 ||
    byteLength !== bufferLength ||
    byteLength !== (length as number) * bytesPerElement ||
    reflectOwnKeys(buffer).length !== 0 ||
    reflectOwnKeys(value).length !== length
  ) {
    fail(
      'authority-binding-mismatch',
      `${label} must own one complete undecorated ordinary non-resizable ArrayBuffer.`,
    );
  }
  const copy = create(length as number);
  for (let index = 0; index < (length as number); index += 1) copy[index] = (value as T)[index]!;
  return copy;
}

function copyF32(value: unknown, label: string): Float32Array {
  return exactTypedArray(
    value,
    Float32Array.prototype,
    Float32Array.BYTES_PER_ELEMENT,
    (length) => new CapturedFloat32Array(length),
    label,
  );
}

function copyU32(value: unknown, label: string): Uint32Array {
  return exactTypedArray(
    value,
    Uint32Array.prototype,
    Uint32Array.BYTES_PER_ELEMENT,
    (length) => new CapturedUint32Array(length),
    label,
  );
}

function exactBytes(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new CapturedUint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new CapturedUint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function float32LeBytes(values: Float32Array): Uint8Array {
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    view.setFloat32(index * 4, values[index]!, true);
  return bytes;
}

function uint32LeBytes(values: Uint32Array): Uint8Array {
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    view.setUint32(index * 4, values[index]!, true);
  return bytes;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new CapturedUint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  if (!capturedDigest) fail('sha256-unavailable', 'Captured Web Crypto SHA-256 is unavailable.');
  let digest: ArrayBuffer;
  try {
    digest = await capturedDigest('SHA-256', new CapturedUint8Array(bytes));
  } catch {
    fail('sha256-unavailable', 'Captured Web Crypto SHA-256 failed.');
  }
  if (digest.byteLength !== 32) fail('sha256-unavailable', 'SHA-256 returned the wrong size.');
  return Array.from(new CapturedUint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('sha256-unavailable', 'Canonical number is invalid.');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (arrayIsArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const prototype = getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      fail('sha256-unavailable', 'Canonical payload contains a non-plain object.');
    const record = value as Record<string, unknown>;
    return `{${objectKeys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  fail('sha256-unavailable', 'Canonical payload contains unsupported data.');
}

async function sha256Canonical(domain: string, value: unknown): Promise<string> {
  const bytes = encoder.encode(`${domain}\0${canonical(value)}`);
  if (bytes.byteLength > MAXIMUM_CANONICAL_BYTES)
    fail('resource-budget-exceeded', 'Canonical source-admission report exceeds its byte cap.');
  return sha256Bytes(bytes);
}

function seamComponents(vertexCount: number, pairs: Uint32Array): Uint32Array {
  const parent = CapturedUint32Array.from({ length: vertexCount }, (_, index) => index);
  const root = (input: number): number => {
    let value = input;
    while (parent[value] !== value) value = parent[value]!;
    let cursor = input;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor]!;
      parent[cursor] = value;
      cursor = next;
    }
    return value;
  };
  for (let offset = 0; offset < pairs.length; offset += 2) {
    const left = root(pairs[offset]!);
    const right = root(pairs[offset + 1]!);
    if (left !== right) parent[Math.max(left, right)] = Math.min(left, right);
  }
  for (let index = 0; index < vertexCount; index += 1) parent[index] = root(index);
  return parent;
}

function replaySelfIntersection(
  positions: Float32Array,
  triangles: Uint32Array,
  seamPairs: Uint32Array,
) {
  const policy = freeze({
    ...DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
    maxVertices: MAXIMUM_VERTEX_COUNT,
    maxTriangles: MAXIMUM_TRIANGLE_COUNT,
    maxInputBytes: MAXIMUM_RETAINED_BYTES,
    maxCandidatePairs: 2_000_000,
  });
  const oracle = validateMeasurementSurfaceSelfIntersectionV1(positions, triangles, policy);
  const components = seamComponents(positions.length / 3, seamPairs);
  let indexedAdjacentCount = 0;
  let seamEquivalentCount = 0;
  let residualCount = 0;
  for (const witness of oracle.intersections) {
    const left = [
      triangles[witness.triangleA * 3]!,
      triangles[witness.triangleA * 3 + 1]!,
      triangles[witness.triangleA * 3 + 2]!,
    ];
    const right = [
      triangles[witness.triangleB * 3]!,
      triangles[witness.triangleB * 3 + 1]!,
      triangles[witness.triangleB * 3 + 2]!,
    ];
    if (left.some((vertex) => right.includes(vertex))) indexedAdjacentCount += 1;
    else if (
      left.some((leftVertex) =>
        right.some((rightVertex) => components[leftVertex] === components[rightVertex]),
      )
    ) {
      seamEquivalentCount += 1;
    } else residualCount += 1;
  }
  return freeze({
    rawOracleCount: oracle.intersections.length,
    indexedAdjacentCount,
    seamEquivalentCount,
    residualCount,
  });
}

function replayOutwardOrientation(
  positions: Float32Array,
  triangles: Uint32Array,
  waistCenterM: readonly [number, number, number],
) {
  let minimumOutwardRadialDot = 1;
  let degenerateTriangleCount = 0;
  let outwardFailureCount = 0;
  for (let triangle = 0; triangle < triangles.length / 3; triangle += 1) {
    const a = triangles[triangle * 3]! * 3;
    const b = triangles[triangle * 3 + 1]! * 3;
    const c = triangles[triangle * 3 + 2]! * 3;
    const abx = positions[b]! - positions[a]!;
    const aby = positions[b + 1]! - positions[a + 1]!;
    const abz = positions[b + 2]! - positions[a + 2]!;
    const acx = positions[c]! - positions[a]!;
    const acy = positions[c + 1]! - positions[a + 1]!;
    const acz = positions[c + 2]! - positions[a + 2]!;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const normalLength = Math.hypot(nx, ny, nz);
    if (!(normalLength > 1e-14)) {
      degenerateTriangleCount += 1;
      continue;
    }
    const radialX = (positions[a]! + positions[b]! + positions[c]!) / 3 - waistCenterM[0];
    const radialZ =
      (positions[a + 2]! + positions[b + 2]! + positions[c + 2]!) / 3 - waistCenterM[2];
    const radialLength = Math.hypot(radialX, radialZ);
    const dot =
      radialLength > 1e-14 ? (nx * radialX + nz * radialZ) / (normalLength * radialLength) : -1;
    minimumOutwardRadialDot = Math.min(minimumOutwardRadialDot, dot);
    if (dot < MINIMUM_OUTWARD_RADIAL_DOT) outwardFailureCount += 1;
  }
  return freeze({ minimumOutwardRadialDot, degenerateTriangleCount, outwardFailureCount });
}

function replaySeamAndPins(
  positions: Float32Array,
  positionsInvMass: Float32Array,
  seamPairs: Uint32Array,
  pins: Uint32Array,
) {
  if (
    seamPairs.length !== 68 ||
    pins.length !== 82 ||
    positionsInvMass.length !== (positions.length / 3) * 4
  ) {
    fail('seam-pin-replay-mismatch', 'Canonical seam/pin carrier counts drifted.');
  }
  let maximumSeamGapM = 0;
  const seamVertices = new CapturedSet<number>();
  const unorderedPairs = new CapturedSet<string>();
  for (let offset = 0; offset < seamPairs.length; offset += 2) {
    const first = seamPairs[offset]!;
    const second = seamPairs[offset + 1]!;
    if (
      first >= positions.length / 3 ||
      second >= positions.length / 3 ||
      first === second ||
      seamVertices.has(first) ||
      seamVertices.has(second)
    ) {
      fail('seam-pin-replay-mismatch', 'Seam pairs are not distinct one-to-one in-range pairs.');
    }
    const key = `${Math.min(first, second)}:${Math.max(first, second)}`;
    if (unorderedPairs.has(key))
      fail('seam-pin-replay-mismatch', 'Seam pairs contain a duplicate unordered pair.');
    unorderedPairs.add(key);
    seamVertices.add(first);
    seamVertices.add(second);
    const gap = Math.hypot(
      positions[first * 3]! - positions[second * 3]!,
      positions[first * 3 + 1]! - positions[second * 3 + 1]!,
      positions[first * 3 + 2]! - positions[second * 3 + 2]!,
    );
    maximumSeamGapM = Math.max(maximumSeamGapM, gap);
  }
  const pinSet = new CapturedSet<number>();
  let previous = -1;
  for (const pin of pins) {
    if (pin >= positions.length / 3 || pin <= previous)
      fail(
        'seam-pin-replay-mismatch',
        'Pins are not strictly ascending distinct in-range indices.',
      );
    pinSet.add(pin);
    previous = pin;
  }
  const positiveZero = new CapturedUint8Array(new CapturedFloat32Array([0]).buffer);
  let zeroInverseMassVertexCount = 0;
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const source = new CapturedUint8Array(
        positions.buffer,
        positions.byteOffset + (vertex * 3 + axis) * 4,
        4,
      );
      const inverse = new CapturedUint8Array(
        positionsInvMass.buffer,
        positionsInvMass.byteOffset + (vertex * 4 + axis) * 4,
        4,
      );
      if (source.some((value, index) => value !== inverse[index]))
        fail('seam-pin-replay-mismatch', 'Inverse-mass XYZ words drifted from source positions.');
    }
    const inverseBytes = new CapturedUint8Array(
      positionsInvMass.buffer,
      positionsInvMass.byteOffset + (vertex * 4 + 3) * 4,
      4,
    );
    const zero = inverseBytes.every((value, index) => value === positiveZero[index]);
    if (zero) zeroInverseMassVertexCount += 1;
    const inverseMass = positionsInvMass[vertex * 4 + 3]!;
    if (
      (pinSet.has(vertex) && !zero) ||
      (!pinSet.has(vertex) && (!Number.isFinite(inverseMass) || inverseMass <= 0))
    ) {
      fail('seam-pin-replay-mismatch', 'Inverse-mass mask differs from the exact pin set.');
    }
  }
  if (maximumSeamGapM !== 0 || zeroInverseMassVertexCount !== 82)
    fail('seam-pin-replay-mismatch', 'Seam coherence or exact pin mask replay failed.');
  return freeze({ maximumSeamGapM: 0 as const, zeroInverseMassVertexCount: 82 as const });
}

function sourceRestQuality(
  positions: Float32Array,
  triangles: Uint32Array,
  waistCenterM: readonly [number, number, number],
): BetaSkirtCoherentEnvelopeQualityReportV1 {
  const report = evaluateBetaSkirtCoherentEnvelopeQualityV1({
    sourcePositionsM: new CapturedFloat32Array(positions),
    sourceTriangles: new CapturedUint32Array(triangles),
    candidatePositionsM: new CapturedFloat32Array(positions),
    candidateTriangles: new CapturedUint32Array(triangles),
    transform: { uniformScale: 1, translationM: [0, 0, 0] },
    radialAxisXZ: [waistCenterM[0], waistCenterM[2]],
  });
  const edge = report.edge;
  const triangle = report.triangle;
  const displacement = report.displacement;
  if (
    report.status !== 'measured-structural-evidence' ||
    report.blockers.length !== 0 ||
    !edge ||
    !triangle ||
    !displacement ||
    edge.minimumLengthRatio !== 1 ||
    edge.maximumLengthRatio !== 1 ||
    edge.rootMeanSquareRelativeLengthChange !== 0 ||
    edge.candidateZeroLengthEdgeCount !== 0 ||
    triangle.minimumAreaRatio !== 1 ||
    triangle.maximumAreaRatio !== 1 ||
    triangle.rootMeanSquareRelativeAreaChange !== 0 ||
    triangle.candidateDegenerateTriangleCount !== 0 ||
    triangle.normalReversalCount !== 0 ||
    displacement.maximumDisplacementM !== 0
  ) {
    fail('source-quality-blocked', 'Retained source failed its identity rest-quality replay.');
  }
  return report;
}

function stableCollisionEvidence(report: BetaSkirtRenderedBodyCollisionDiagnosticReportV1) {
  return {
    version: report.version,
    status: report.status,
    binding: report.binding,
    contentFingerprintSha256: report.contentFingerprintSha256,
    coordinateFrame: report.coordinateFrame,
    topology: report.topology,
    intersections: report.intersections,
    clearance: report.clearance,
    limits: report.limits,
    usage: {
      inputByteLength: report.usage.inputByteLength,
      bodyVertexCount: report.usage.bodyVertexCount,
      bodyTriangleCount: report.usage.bodyTriangleCount,
      garmentVertexCount: report.usage.garmentVertexCount,
      garmentTriangleCount: report.usage.garmentTriangleCount,
      bvhNodeCount: report.usage.bvhNodeCount,
      distanceBvhNodeVisitCount: report.usage.distanceBvhNodeVisitCount,
      distanceTriangleTestCount: report.usage.distanceTriangleTestCount,
      rayBvhNodeVisitCount: report.usage.rayBvhNodeVisitCount,
      rayTriangleTestCount: report.usage.rayTriangleTestCount,
      broadPhaseGridCellCount: report.usage.broadPhaseGridCellCount,
      broadPhaseCellReferenceCount: report.usage.broadPhaseCellReferenceCount,
      broadPhaseCellPairVisitCount: report.usage.broadPhaseCellPairVisitCount,
      broadPhaseCandidatePairCount: report.usage.broadPhaseCandidatePairCount,
      broadPhaseTestedPairCount: report.usage.broadPhaseTestedPairCount,
    },
    blockers: report.blockers,
    claims: report.claims,
  };
}

function classifyCollision(report: BetaSkirtRenderedBodyCollisionDiagnosticReportV1) {
  const intersections = report.intersections.bodyGarmentTriangleIntersectionCount;
  const penetrating = report.clearance.penetratingVertexCount;
  const unsafe = report.clearance.unsafeVertexCount;
  const ambiguous = report.clearance.ambiguousSignVertexCount;
  const minimumSigned = report.clearance.minimumSignedClearanceM;
  if (
    report.status !== 'signed-clearance-measured' ||
    report.claims.signedClassificationDefensible !== true ||
    intersections === null ||
    penetrating === null ||
    unsafe === null ||
    ambiguous !== 0 ||
    minimumSigned === null ||
    !Number.isFinite(minimumSigned)
  ) {
    fail(
      'collision-report-replay-mismatch',
      'Collision V1 did not produce defensible signed evidence.',
    );
  }
  const onlyContactBlockers = report.blockers.every(
    (blocker) => blocker === 'body-garment-triangle-intersection',
  );
  if (!onlyContactBlockers)
    fail('collision-report-replay-mismatch', 'Collision V1 reported a non-contact source blocker.');
  const exactClear =
    intersections === 0 &&
    penetrating === 0 &&
    unsafe === 0 &&
    minimumSigned >= report.clearance.unsafeClearanceMarginM &&
    report.blockers.length === 0;
  const contactRelaxationRequired = !exactClear;
  return freeze({
    intersections,
    penetrating,
    unsafe,
    minimumSigned,
    exactClear,
    contactRelaxationRequired,
  });
}

/**
 * Diagnostic-only branch policy shared with the owner builder. It never grants collision or
 * initialization authority; only an owner-bound build may publish a source-admission receipt.
 */
export function decideBetaSkirtCanonicalMediumSourceCollisionDispositionV1(
  report: BetaSkirtRenderedBodyCollisionDiagnosticReportV1,
): BetaSkirtCanonicalMediumSourceAdmissionDecisionV1 {
  return classifyCollision(report).exactClear
    ? 'diagnostic-source-clear-no-contact-relaxation-required'
    : 'contact-relaxation-required';
}

function trustedCollisionCrypto(): Crypto {
  if (!capturedDigest) fail('sha256-unavailable', 'Captured Web Crypto SHA-256 is unavailable.');
  return freeze({
    subtle: freeze({
      digest: (algorithm: AlgorithmIdentifier, data: BufferSource) =>
        capturedDigest(algorithm, data),
    }),
  }) as unknown as Crypto;
}

const CLAIMS: BetaSkirtCanonicalMediumSourceAdmissionClaimsV1 = freeze({
  exactSameSessionOwnersBound: true,
  sourceBytesRetainedForRollback: true,
  collisionV1IndependentlyReplayed: true,
  collisionPolicyExactlyPinned: true,
  collisionReportReplayMatched: true,
  rawSourceHashReplayed: true,
  seamReceiptIndependentlyReplayed: true,
  seamCoherenceVerified: true,
  exactPinMaskVerified: true,
  selfIntersectionResidualReplayedZero: true,
  outwardOrientationReplayed: true,
  sourceRestQualityMeasured: true,
  identicalV4CandidateManufactured: false,
  sourceAdmissionDiagnosticAuthority: true,
  collisionAuthority: false,
  initializationAuthority: false,
  gravitySettleEvaluated: false,
  runtimeAuthority: false,
  fitAuthority: false,
  productionAuthority: false,
});

export async function buildBetaSkirtCanonicalMediumSourceAdmissionV1(
  input: unknown,
): Promise<BetaSkirtCanonicalMediumSourceAdmissionResultV1> {
  try {
    const request = snapshotRequest(input);
    const placement = projectBetaSkirtCanonicalMediumProductPlacementV1(request.placementOwner);
    const selfProjection = projectDxfProductTwoPanelSkirtCanonicalMediumSelfOrientationV2(
      request.selfOrientationOwner,
    );
    const seamPin = projectBetaSkirtCanonicalMediumProductSeamPinV2(request.seamPinOwner);
    if (!placement || !selfProjection || !seamPin) {
      fail(
        'upstream-owner-unavailable',
        'Live placement V1, self/orientation V2 and seam/pin V2 owners are required.',
      );
    }
    const placementOwner =
      request.placementOwner as BetaSkirtCanonicalMediumProductPlacementOwnerV1;
    const selfOwner =
      request.selfOrientationOwner as DxfProductTwoPanelSkirtCanonicalMediumSelfOrientationOwnerV2;
    const seamOwner = request.seamPinOwner as BetaSkirtCanonicalMediumProductSeamPinOwnerV2;
    if (
      request.expected.placementCanonicalSha256 !== placement.snapshot.seal.canonicalSha256 ||
      request.expected.placementCanonicalSha256 !== placementOwner.snapshot.seal.canonicalSha256 ||
      request.expected.selfOrientationCanonicalSha256 !== selfProjection.reportCanonicalSha256 ||
      request.expected.selfOrientationCanonicalSha256 !== selfOwner.report.seal.canonicalSha256 ||
      request.expected.seamPinCanonicalSha256 !== seamPin.reportCanonicalSha256 ||
      request.expected.seamPinCanonicalSha256 !== seamOwner.report.seal.canonicalSha256 ||
      request.expected.sourcePositionsRawFloat32LeSha256 !==
        seamOwner.report.bindings.positionsRawFloat32LeSha256 ||
      request.expected.collisionInputSha256 !== placement.collision.contentFingerprintSha256 ||
      request.expected.collisionInputSha256 !== placement.snapshot.bindings.collisionInputSha256
    ) {
      fail('authority-binding-mismatch', 'Expected source-admission receipt binding drifted.');
    }
    if (
      seamOwner.report.bindings.placementCanonicalSha256 !==
        placement.snapshot.seal.canonicalSha256 ||
      seamOwner.report.bindings.selfOrientationCanonicalSha256 !==
        selfProjection.reportCanonicalSha256 ||
      seamPin.productSeamPinDiagnosticAuthority !== true ||
      selfProjection.productSelfOrientationDiagnosticAuthority !== true ||
      selfProjection.sourceSelfOrientationNoOpQualified !== true ||
      placement.placementAuthority !== false ||
      placement.collisionAuthority !== false
    ) {
      fail('authority-binding-mismatch', 'Upstream owners are not one exact diagnostic session.');
    }

    // Snapshot all source carriers synchronously, before Collision V1 reaches its first await.
    const collisionInput = snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1(
      placement.collisionInput,
    );
    const positions = copyF32(seamPin.positions3M, 'seamPin.positions3M');
    const inverseMass = copyF32(seamPin.positionsInvMass, 'seamPin.positionsInvMass');
    const triangles = copyU32(seamPin.normalizedTriangles, 'seamPin.normalizedTriangles');
    const seamPairs = copyU32(seamPin.seamSnapshot.pairs, 'seamPin.seamSnapshot.pairs');
    const pins = copyU32(seamPin.pinnedVertexIndices, 'seamPin.pinnedVertexIndices');
    const selfPositions = copyF32(selfProjection.positions3M, 'self.positions3M');
    const selfInverseMass = copyF32(selfProjection.positionsInvMass, 'self.positionsInvMass');
    const selfTriangles = copyU32(selfProjection.normalizedTriangles, 'self.normalizedTriangles');
    const selfSeams = copyU32(selfProjection.seamPairs, 'self.seamPairs');
    const selfPins = copyU32(
      selfProjection.pinnedWaistVertexIndices,
      'self.pinnedWaistVertexIndices',
    );
    if (
      positions.length !== 580 * 3 ||
      inverseMass.length !== 580 * 4 ||
      triangles.length !== 912 * 3 ||
      seamPairs.length !== 34 * 2 ||
      pins.length !== 82 ||
      collisionInput.garmentPositionsM.length !== positions.length ||
      collisionInput.garmentTriangles.length !== triangles.length
    ) {
      fail('resource-budget-exceeded', 'Canonical source counts drifted or exceed the source cap.');
    }
    if (
      !exactBytes(positions, selfPositions) ||
      !exactBytes(inverseMass, selfInverseMass) ||
      !exactBytes(triangles, selfTriangles) ||
      !exactBytes(seamPairs, selfSeams) ||
      !exactBytes(pins, selfPins) ||
      !exactBytes(positions, collisionInput.garmentPositionsM) ||
      !exactBytes(triangles, collisionInput.garmentTriangles)
    ) {
      fail(
        'authority-binding-mismatch',
        'Placement, self/orientation and seam/pin bytes disagree.',
      );
    }
    const retainedBinaryByteLength =
      collisionInput.bodyPositionsM.byteLength +
      collisionInput.bodyTriangles.byteLength +
      positions.byteLength +
      inverseMass.byteLength +
      triangles.byteLength +
      seamPairs.byteLength +
      pins.byteLength;
    if (retainedBinaryByteLength > MAXIMUM_RETAINED_BYTES)
      fail('resource-budget-exceeded', 'Retained source and body bytes exceed the source cap.');

    const replayedSeamReceipt = computeBetaSkirtExactValidatedSeamReceiptSha256V1(
      positions,
      triangles,
      seamPairs,
    );
    if (
      replayedSeamReceipt !== seamPin.seamSnapshot.validationReceiptSha256 ||
      replayedSeamReceipt !== seamOwner.report.bindings.exactV4SeamValidationReceiptSha256
    ) {
      fail('seam-pin-replay-mismatch', 'Exact V4 seam receipt replay drifted.');
    }
    const seamPinReplay = replaySeamAndPins(positions, inverseMass, seamPairs, pins);
    const selfReplay = replaySelfIntersection(positions, triangles, seamPairs);
    const waistCenterM = placement.snapshot.authoredFrame.waistCenterM;
    const orientationReplay = replayOutwardOrientation(positions, triangles, waistCenterM);
    if (
      selfReplay.rawOracleCount !== selfOwner.report.selfIntersection.rawOracleCount ||
      selfReplay.indexedAdjacentCount !== selfOwner.report.selfIntersection.indexedAdjacent.count ||
      selfReplay.seamEquivalentCount !==
        selfOwner.report.selfIntersection.authenticatedSeamEquivalent.count ||
      selfReplay.residualCount !== selfOwner.report.selfIntersection.residualNonadjacent.count ||
      selfReplay.rawOracleCount !== 182 ||
      selfReplay.indexedAdjacentCount !== 0 ||
      selfReplay.seamEquivalentCount !== 182 ||
      selfReplay.residualCount !== 0 ||
      orientationReplay.degenerateTriangleCount !== 0 ||
      orientationReplay.outwardFailureCount !== 0 ||
      orientationReplay.minimumOutwardRadialDot < MINIMUM_OUTWARD_RADIAL_DOT
    ) {
      fail(
        'self-orientation-replay-mismatch',
        'Self-intersection or outward orientation replay drifted.',
      );
    }
    const quality = sourceRestQuality(positions, triangles, waistCenterM);
    const edge = quality.edge!;
    const triangle = quality.triangle!;

    const collisionReplay = await evaluateBetaSkirtRenderedBodyCollisionDiagnosticV1(
      collisionInput,
      { crypto: trustedCollisionCrypto() },
    );
    const pinnedPolicy = canonical(BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1);
    if (
      canonical(collisionReplay.limits) !== pinnedPolicy ||
      canonical(placement.collision.limits) !== pinnedPolicy
    ) {
      fail(
        'collision-policy-replay-mismatch',
        'Collision V1 policy differs from the pinned policy.',
      );
    }
    if (
      canonical(stableCollisionEvidence(collisionReplay)) !==
      canonical(stableCollisionEvidence(placement.collision))
    ) {
      fail('collision-report-replay-mismatch', 'Independent Collision V1 replay differs upstream.');
    }
    const collisionClass = classifyCollision(collisionReplay);

    const [
      sourcePositionsRawFloat32LeSha256,
      sourceTopologyRawUint32LeSha256,
      sourceInverseMassRawFloat32LeSha256,
      seamPairsRawUint32LeSha256,
      pinnedVertexIndicesRawUint32LeSha256,
      collisionPolicySha256,
      collisionReplayEvidenceSha256,
    ] = await Promise.all([
      sha256Bytes(float32LeBytes(positions)),
      sha256Bytes(uint32LeBytes(triangles)),
      sha256Bytes(float32LeBytes(inverseMass)),
      sha256Bytes(uint32LeBytes(seamPairs)),
      sha256Bytes(uint32LeBytes(pins)),
      sha256Canonical(
        'beta-skirt-rendered-body-collision-diagnostic-policy-v1',
        BETA_SKIRT_RENDERED_BODY_COLLISION_DIAGNOSTIC_POLICY_V1,
      ),
      sha256Canonical(
        'beta-skirt-canonical-medium-source-collision-replay-v1',
        stableCollisionEvidence(collisionReplay),
      ),
    ]);
    if (
      sourcePositionsRawFloat32LeSha256 !== request.expected.sourcePositionsRawFloat32LeSha256 ||
      sourcePositionsRawFloat32LeSha256 !== collisionInput.binding.garmentPositionsSha256 ||
      sourcePositionsRawFloat32LeSha256 !== seamOwner.report.bindings.positionsRawFloat32LeSha256 ||
      sourceTopologyRawUint32LeSha256 !== seamOwner.report.bindings.normalizedTopologyRawSha256 ||
      sourceInverseMassRawFloat32LeSha256 !==
        seamOwner.report.bindings.positionsInvMassRawFloat32LeSha256 ||
      seamPairsRawUint32LeSha256 !== seamOwner.report.bindings.seamPairsRawUint32LeSha256 ||
      pinnedVertexIndicesRawUint32LeSha256 !==
        seamOwner.report.bindings.pinnedVertexIndicesRawUint32LeSha256 ||
      collisionReplay.contentFingerprintSha256 !== request.expected.collisionInputSha256
    ) {
      fail('authority-binding-mismatch', 'Source raw hash or replay hash binding drifted.');
    }
    const retainedCandidateSha256 = await sha256Bytes(
      concatBytes([
        encoder.encode('beta-skirt-canonical-medium-retained-source-candidate/1\0'),
        float32LeBytes(positions),
        uint32LeBytes(triangles),
        float32LeBytes(inverseMass),
        uint32LeBytes(seamPairs),
        uint32LeBytes(pins),
      ]),
    );
    const decision: BetaSkirtCanonicalMediumSourceAdmissionDecisionV1 = collisionClass.exactClear
      ? 'diagnostic-source-clear-no-contact-relaxation-required'
      : 'contact-relaxation-required';
    const bindings = freeze({
      placementCanonicalSha256: placement.snapshot.seal.canonicalSha256,
      selfOrientationCanonicalSha256: selfProjection.reportCanonicalSha256,
      seamPinCanonicalSha256: seamPin.reportCanonicalSha256,
      sourcePositionsRawFloat32LeSha256,
      sourceTopologyRawUint32LeSha256,
      sourceInverseMassRawFloat32LeSha256,
      seamPairsRawUint32LeSha256,
      pinnedVertexIndicesRawUint32LeSha256,
      exactV4SeamValidationReceiptSha256: replayedSeamReceipt,
      collisionPolicySha256,
      collisionInputSha256: collisionReplay.contentFingerprintSha256,
      collisionReplayEvidenceSha256,
      retainedCandidateSha256,
    });
    const reportWithoutSeal = freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_REPORT_V1,
      status: 'diagnostic-complete' as const,
      decision,
      bindings,
      counts: freeze({
        bodyVertexCount: collisionInput.bodyPositionsM.length / 3,
        bodyTriangleCount: collisionInput.bodyTriangles.length / 3,
        garmentVertexCount: 580 as const,
        garmentTriangleCount: 912 as const,
        seamPairCount: 34 as const,
        pinnedVertexCount: 82 as const,
        selfRawIntersectionCount: 182 as const,
        selfSeamEquivalentIntersectionCount: 182 as const,
        selfResidualIntersectionCount: 0 as const,
      }),
      collision: freeze({
        status: 'signed-clearance-measured' as const,
        bodyGarmentTriangleIntersectionCount: collisionClass.intersections,
        penetratingVertexCount: collisionClass.penetrating,
        unsafeVertexCount: collisionClass.unsafe,
        ambiguousSignVertexCount: 0 as const,
        minimumSignedClearanceM: collisionClass.minimumSigned,
        unsafeClearanceMarginM: collisionReplay.clearance.unsafeClearanceMarginM,
        exactClear: collisionClass.exactClear,
        contactRelaxationRequired: collisionClass.contactRelaxationRequired,
      }),
      selfOrientation: freeze({
        rawOracleCount: 182 as const,
        indexedAdjacentCount: 0 as const,
        authenticatedSeamEquivalentCount: 182 as const,
        residualNonadjacentCount: 0 as const,
        minimumOutwardRadialDot: orientationReplay.minimumOutwardRadialDot,
        degenerateTriangleCount: 0 as const,
        outwardFailureCount: 0 as const,
        qualified: true as const,
      }),
      seamPin: freeze({
        maximumSeamGapM: seamPinReplay.maximumSeamGapM,
        exactV4ReceiptMatched: true as const,
        zeroInverseMassVertexCount: seamPinReplay.zeroInverseMassVertexCount,
        pinMaskMatched: true as const,
      }),
      restQuality: freeze({
        status: 'measured-structural-evidence' as const,
        sourceIsRetainedRestCandidate: true as const,
        uniqueEdgeCount: quality.topology.source.uniqueEdgeCount,
        degenerateTriangleCount: 0 as const,
        zeroLengthEdgeCount: 0 as const,
        minimumIdentityEdgeLengthRatio: edge.minimumLengthRatio as 1,
        maximumIdentityEdgeLengthRatio: edge.maximumLengthRatio as 1,
        minimumIdentityAreaRatio: triangle.minimumAreaRatio as 1,
        maximumIdentityAreaRatio: triangle.maximumAreaRatio as 1,
        maximumIdentityPrincipalStrain: 0 as const,
        rootMeanSquareIdentityPrincipalStrain: 0 as const,
        normalReversalCount: 0 as const,
        qualityBlockerCount: 0 as const,
      }),
      retainedCandidate: freeze({
        sourceBytesRetained: true as const,
        rollbackBytesRetained: true as const,
        sourceAndRollbackAreOneExactByteIdentity: true as const,
        noSyntheticCandidateCreated: true as const,
        retainedBinaryByteLength,
      }),
      fallback: freeze({
        solver: 'V4/V4.1 primitive-contact multiround' as const,
        use: 'only-when-contact-relaxation-required' as const,
        exactClearSourceBypassesFallback: true as const,
        acceptanceRequiresStrictParentImprovement: true as const,
        acceptanceRequiresStrictGlobalBaselineImprovement: true as const,
        identicalSourceCandidateCannotPassStrictImprovement: true as const,
      }),
      claims: CLAIMS,
      deferred: freeze({
        gravitySettle: 'not-evaluated' as const,
        runtime: 'not-authorized' as const,
        fit: 'not-authorized' as const,
        production: 'not-authorized' as const,
      }),
    });
    const canonicalSha256 = await sha256Canonical(
      'beta-skirt-canonical-medium-source-admission-v1',
      reportWithoutSeal,
    );
    const report: BetaSkirtCanonicalMediumSourceAdmissionReportV1 = freeze({
      ...reportWithoutSeal,
      seal: freeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-source-admission-diagnostic-only' as const,
      }),
    });
    const owner = freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_OWNER_V1,
      report,
    }) as BetaSkirtCanonicalMediumSourceAdmissionOwnerV1;
    owners.set(owner, {
      disposed: false,
      decision,
      collisionInput: snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1(collisionInput),
      positions3M: new CapturedFloat32Array(positions),
      positionsInvMass: new CapturedFloat32Array(inverseMass),
      triangles: new CapturedUint32Array(triangles),
      seamPairs: new CapturedUint32Array(seamPairs),
      pins: new CapturedUint32Array(pins),
      seamReceiptSha256: replayedSeamReceipt,
    });
    return freeze({ ok: true as const, owner, report, decision, claims: CLAIMS });
  } catch (error) {
    return blocked(error);
  }
}

function projectedCandidate(record: OwnerRecord) {
  return freeze({
    positions3M: new CapturedFloat32Array(record.positions3M),
    positionsInvMass: new CapturedFloat32Array(record.positionsInvMass),
    triangles: new CapturedUint32Array(record.triangles),
    seamSnapshot: freeze({
      version: BETA_SKIRT_EXACT_VALIDATED_SEAM_SNAPSHOT_V1,
      validationStatus: 'exact-validated' as const,
      validationReceiptSha256: record.seamReceiptSha256,
      pairs: new CapturedUint32Array(record.seamPairs),
    }),
    pinnedVertexIndices: new CapturedUint32Array(record.pins),
  });
}

export function projectBetaSkirtCanonicalMediumSourceAdmissionV1(
  owner: unknown,
): BetaSkirtCanonicalMediumSourceAdmissionProjectionV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner);
  if (!record || record.disposed) return null;
  const publicOwner = owner as BetaSkirtCanonicalMediumSourceAdmissionOwnerV1;
  return freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SOURCE_ADMISSION_PROJECTION_V1,
    reportCanonicalSha256: publicOwner.report.seal.canonicalSha256,
    decision: record.decision,
    retainedSourceCandidate: projectedCandidate(record),
    rollbackCandidate: projectedCandidate(record),
    collisionInput: snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1(record.collisionInput),
    callerOwnedMutableBinaryCopies: true as const,
    sourceAdmissionDiagnosticAuthority: true as const,
    collisionAuthority: false as const,
    initializationAuthority: false as const,
    gravitySettleAuthority: false as const,
    runtimeAuthority: false as const,
    fitAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumSourceAdmissionV1(owner: unknown): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner);
  if (!record || record.disposed) return false;
  record.disposed = true;
  float32Fill.call(record.collisionInput.bodyPositionsM, 0);
  uint32Fill.call(record.collisionInput.bodyTriangles, 0);
  float32Fill.call(record.collisionInput.garmentPositionsM, 0);
  uint32Fill.call(record.collisionInput.garmentTriangles, 0);
  float32Fill.call(record.positions3M, 0);
  float32Fill.call(record.positionsInvMass, 0);
  uint32Fill.call(record.triangles, 0);
  uint32Fill.call(record.seamPairs, 0);
  uint32Fill.call(record.pins, 0);
  owners.delete(owner);
  return true;
}
