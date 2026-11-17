import {
  validateSealedSimulationPackageV5V1,
  type SealedSimulationPackageV5V1,
} from '../../lib/cloth/compiler/simulation-package-v5-integrity';
import {
  projectDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1,
  type DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1,
} from '../../lib/cloth/domain/dxf-product-two-panel-skirt-canonical-medium-normalized-v5-solver-bridge-v1';

import {
  projectBetaSkirtCanonicalMediumSourceAdmissionV1,
  type BetaSkirtCanonicalMediumSourceAdmissionOwnerV1,
} from './beta-skirt-canonical-medium-source-admission-v1';
import {
  snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1,
  type BetaSkirtRenderedBodyCollisionDiagnosticInputV1,
} from './beta-skirt-rendered-body-collision-diagnostic-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_REQUEST_V1 =
  'beta-skirt-canonical-medium-webgpu-runtime-source-request/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_REPORT_V1 =
  'beta-skirt-canonical-medium-webgpu-runtime-source-report/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_OWNER_V1 =
  'beta-skirt-canonical-medium-webgpu-runtime-source-owner/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_PROJECTION_V1 =
  'beta-skirt-canonical-medium-webgpu-runtime-source-projection/1' as const;

const EXPECTED_VERTEX_COUNT = 580;
const EXPECTED_TRIANGLE_COUNT = 912;
const EXPECTED_SEAM_PAIR_COUNT = 34;
const EXPECTED_PIN_COUNT = 82;
const EXPECTED_FREE_COUNT = EXPECTED_VERTEX_COUNT - EXPECTED_PIN_COUNT;
const SHA256 = /^[0-9a-f]{64}$/u;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const HEX = Object.freeze(
  Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')),
);
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const arrayIsArray = Array.isArray;
const objectPrototype = Object.prototype;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const reflectOwnKeys = Reflect.ownKeys;
const float32Fill = Float32Array.prototype.fill;
const uint32Fill = Uint32Array.prototype.fill;
const uint8Set = Uint8Array.prototype.set;
const reflectApply = Reflect.apply;
const arrayBufferPrototype = ArrayBuffer.prototype;
const arrayBufferByteLength = objectGetOwnPropertyDescriptor(
  arrayBufferPrototype,
  'byteLength',
)?.get;
const structuredCloneCaptured = globalThis.structuredClone.bind(globalThis);
const jsonStringify = JSON.stringify.bind(JSON);
const textEncoder = new TextEncoder();
const textEncode = TextEncoder.prototype.encode;
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest;

export type BetaSkirtCanonicalMediumWebgpuRuntimeSourceRequestV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_REQUEST_V1;
  expected: Readonly<{
    sourceAdmissionCanonicalSha256: string;
    normalizedV5BridgeCanonicalSha256: string;
  }>;
  sourceAdmissionOwner: BetaSkirtCanonicalMediumSourceAdmissionOwnerV1;
  normalizedV5BridgeOwner: DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1;
}>;

export type BetaSkirtCanonicalMediumWebgpuRuntimeSourceClaimsV1 = Readonly<{
  exactSameSessionSourceAndV5OwnersBound: true;
  sourceAdmissionDiagnosticQualified: true;
  normalizedV5DiagnosticPackageQualified: true;
  physicalInverseMassTransportBound: true;
  legacyPinMaskNotUsedAsPhysicalInverseMass: true;
  exactActualBodyCollisionInputRetained: true;
  callerOwnedMutableBinaryCopies: true;
  gpuResourcesAllocated: false;
  framesExecuted: false;
  collisionAuthority: false;
  runtimeAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumWebgpuRuntimeSourceReportV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_REPORT_V1;
  status: 'diagnostic-source-ready';
  decision: 'PASS_CONTENT_BOUND_WEBGPU_RUNTIME_SOURCE';
  bindings: Readonly<{
    sourceAdmissionCanonicalSha256: string;
    normalizedV5BridgeCanonicalSha256: string;
    selfOrientationCanonicalSha256: string;
    sourcePositions3MSha256: string;
    normalizedTopologySha256: string;
    legacyPinMaskSha256: string;
    physicalPositionsInvMassKgSha256: string;
    seamPairsSha256: string;
    pinnedVertexIndicesSha256: string;
    normalizedV5AggregateSha256: string;
    actualBodyCollisionInputSha256: string;
  }>;
  counts: Readonly<{
    bodyVertexCount: number;
    bodyTriangleCount: number;
    garmentVertexCount: typeof EXPECTED_VERTEX_COUNT;
    garmentTriangleCount: typeof EXPECTED_TRIANGLE_COUNT;
    seamPairCount: typeof EXPECTED_SEAM_PAIR_COUNT;
    pinnedVertexCount: typeof EXPECTED_PIN_COUNT;
    freeVertexCount: typeof EXPECTED_FREE_COUNT;
    zeroPhysicalInverseMassCount: typeof EXPECTED_PIN_COUNT;
    positivePhysicalInverseMassCount: typeof EXPECTED_FREE_COUNT;
  }>;
  physicalState: Readonly<{
    units: 'm-kg-s';
    inverseMassSource: 'normalized-v5-particle-mass-records';
    legacyPinMaskRetainedForAuditOnly: true;
    minimumPositiveInverseMassKgInv: number;
    maximumPositiveInverseMassKgInv: number;
    packageRestPositionsByteEqualToInitialPhysicalState: true;
  }>;
  claims: BetaSkirtCanonicalMediumWebgpuRuntimeSourceClaimsV1;
  blockers: readonly [
    'webgpu-frame-execution-not-evaluated',
    'post-frame-actual-body-collision-not-evaluated',
    'settle-and-fit-authority-not-established',
  ];
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-same-session-webgpu-runtime-source-diagnostic-only';
  }>;
}>;

declare const runtimeSourceBrand: unique symbol;
export type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_OWNER_V1;
  report: BetaSkirtCanonicalMediumWebgpuRuntimeSourceReportV1;
  readonly [runtimeSourceBrand]: never;
}>;

export type BetaSkirtCanonicalMediumWebgpuRuntimeSourceProjectionV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_PROJECTION_V1;
  reportCanonicalSha256: string;
  normalizedV5: SealedSimulationPackageV5V1;
  initialPhysicalPositionsInvMassKg: Float32Array;
  normalizedTriangles: Uint32Array;
  seamPairs: Uint32Array;
  pinnedWaistVertexIndices: Uint32Array;
  collisionInput: BetaSkirtRenderedBodyCollisionDiagnosticInputV1;
  callerOwnedMutableBinaryCopies: true;
  sourceAdmissionDiagnosticAuthority: true;
  normalizedV5DiagnosticPackageAuthority: true;
  gpuResourceAuthority: false;
  frameExecutionAuthority: false;
  collisionAuthority: false;
  runtimeAuthority: false;
  fitAuthority: false;
  productionAuthority: false;
}>;

export type BetaSkirtCanonicalMediumWebgpuRuntimeSourceErrorCodeV1 =
  | 'invalid-input'
  | 'upstream-owner-unavailable'
  | 'upstream-binding-mismatch'
  | 'source-admission-not-clear'
  | 'physical-state-mismatch'
  | 'normalized-v5-invalid'
  | 'sha256-unavailable';

export type BetaSkirtCanonicalMediumWebgpuRuntimeSourceResultV1 =
  | Readonly<{
      ok: true;
      owner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1;
      report: BetaSkirtCanonicalMediumWebgpuRuntimeSourceReportV1;
      claims: BetaSkirtCanonicalMediumWebgpuRuntimeSourceClaimsV1;
    }>
  | Readonly<{
      ok: false;
      code: BetaSkirtCanonicalMediumWebgpuRuntimeSourceErrorCodeV1;
      detail: string;
    }>;

type OwnerRecord = {
  normalizedV5: SealedSimulationPackageV5V1;
  initialPhysicalPositionsInvMassKg: Float32Array;
  normalizedTriangles: Uint32Array;
  seamPairs: Uint32Array;
  pinnedWaistVertexIndices: Uint32Array;
  collisionInput: BetaSkirtRenderedBodyCollisionDiagnosticInputV1;
};

const owners = new WeakMap<object, OwnerRecord>();

class RuntimeSourceError extends Error {
  constructor(
    readonly code: BetaSkirtCanonicalMediumWebgpuRuntimeSourceErrorCodeV1,
    message: string,
  ) {
    super(message);
  }
}

function fail(
  code: BetaSkirtCanonicalMediumWebgpuRuntimeSourceErrorCodeV1,
  message: string,
): never {
  throw new RuntimeSourceError(code, message);
}

function blocked(error: unknown): BetaSkirtCanonicalMediumWebgpuRuntimeSourceResultV1 {
  if (error instanceof RuntimeSourceError)
    return Object.freeze({ ok: false, code: error.code, detail: error.message });
  return Object.freeze({
    ok: false,
    code: 'invalid-input' as const,
    detail: error instanceof Error ? error.message : 'Runtime-source build failed.',
  });
}

function exactDataRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== 'object' ||
    arrayIsArray(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
    fail('invalid-input', `${label} must be a plain object.`);
  }
  const actual = reflectOwnKeys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key))
  ) {
    fail('invalid-input', `${label} must contain exactly ${keys.join(', ')}.`);
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor))
      fail('invalid-input', `${label}.${key} must be an own data property.`);
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function canonicalSha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value))
    fail('invalid-input', `${label} must be a lowercase SHA-256 hex digest.`);
  return value;
}

function snapshotRequest(input: unknown): BetaSkirtCanonicalMediumWebgpuRuntimeSourceRequestV1 {
  const request = exactDataRecord(
    input,
    ['schemaVersion', 'expected', 'sourceAdmissionOwner', 'normalizedV5BridgeOwner'],
    'runtime source request',
  );
  if (request.schemaVersion !== BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_REQUEST_V1)
    fail('invalid-input', 'Runtime-source request version is unsupported.');
  const expected = exactDataRecord(
    request.expected,
    ['sourceAdmissionCanonicalSha256', 'normalizedV5BridgeCanonicalSha256'],
    'runtime source expected bindings',
  );
  return Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_REQUEST_V1,
    expected: Object.freeze({
      sourceAdmissionCanonicalSha256: canonicalSha256(
        expected.sourceAdmissionCanonicalSha256,
        'sourceAdmissionCanonicalSha256',
      ),
      normalizedV5BridgeCanonicalSha256: canonicalSha256(
        expected.normalizedV5BridgeCanonicalSha256,
        'normalizedV5BridgeCanonicalSha256',
      ),
    }),
    sourceAdmissionOwner:
      request.sourceAdmissionOwner as BetaSkirtCanonicalMediumSourceAdmissionOwnerV1,
    normalizedV5BridgeOwner:
      request.normalizedV5BridgeOwner as DxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeOwnerV1,
  });
}

function bytesEqual(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new CapturedUint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new CapturedUint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function positions3FromPhysical(physical: Float32Array): Float32Array {
  const positions = new CapturedFloat32Array(EXPECTED_VERTEX_COUNT * 3);
  for (let vertex = 0; vertex < EXPECTED_VERTEX_COUNT; vertex += 1) {
    positions[vertex * 3] = physical[vertex * 4]!;
    positions[vertex * 3 + 1] = physical[vertex * 4 + 1]!;
    positions[vertex * 3 + 2] = physical[vertex * 4 + 2]!;
  }
  return positions;
}

function copiedBytes(value: ArrayBufferView): Uint8Array<ArrayBuffer> {
  const result = new CapturedUint8Array(value.byteLength);
  reflectApply(uint8Set, result, [
    new CapturedUint8Array(value.buffer, value.byteOffset, value.byteLength),
  ]);
  return result;
}

function hex(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) result += HEX[bytes[index]!]!;
  return result;
}

async function digestBytes(value: Uint8Array): Promise<string> {
  if (!capturedSubtle || typeof capturedDigest !== 'function')
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 is unavailable.');
  let digest: ArrayBuffer;
  try {
    digest = (await reflectApply(capturedDigest, capturedSubtle, [
      'SHA-256',
      value,
    ])) as ArrayBuffer;
  } catch {
    fail('sha256-unavailable', 'Native Web Crypto SHA-256 failed.');
  }
  if (
    !arrayBufferByteLength ||
    objectGetPrototypeOf(digest) !== arrayBufferPrototype ||
    reflectApply(arrayBufferByteLength, digest, []) !== 32
  )
    fail('sha256-unavailable', 'Native Web Crypto returned an invalid SHA-256 digest.');
  return hex(new CapturedUint8Array(digest));
}

async function validateDigestAuthority(): Promise<void> {
  if ((await digestBytes(new CapturedUint8Array(0))) !== EMPTY_SHA256)
    fail('sha256-unavailable', 'SHA-256 empty-message known-answer test failed.');
  const abc = reflectApply(textEncode, textEncoder, ['abc']) as Uint8Array;
  if ((await digestBytes(copiedBytes(abc))) !== ABC_SHA256)
    fail('sha256-unavailable', 'SHA-256 abc known-answer test failed.');
}

function capturedCrypto(): Pick<Crypto, 'subtle'> {
  return Object.freeze({
    subtle: Object.freeze({
      digest(
        algorithm: string | object,
        data: ArrayBuffer | ArrayBufferView,
      ): Promise<ArrayBuffer> {
        if (!capturedSubtle || typeof capturedDigest !== 'function')
          return Promise.reject(new TypeError('Native Web Crypto SHA-256 is unavailable.'));
        return reflectApply(capturedDigest, capturedSubtle, [
          algorithm,
          data,
        ]) as Promise<ArrayBuffer>;
      },
    }) as unknown as SubtleCrypto,
  });
}

async function sha256View(value: ArrayBufferView): Promise<string> {
  return digestBytes(copiedBytes(value));
}

async function sha256Text(value: string): Promise<string> {
  const encoded = reflectApply(textEncode, textEncoder, [value]) as Uint8Array;
  return digestBytes(copiedBytes(encoded));
}

function physicalMassRange(
  physical: Float32Array,
  pins: Uint32Array,
): Readonly<{ minimum: number; maximum: number; zeroCount: number; positiveCount: number }> {
  const pinSet = new Set<number>(pins);
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  let zeroCount = 0;
  let positiveCount = 0;
  for (let vertex = 0; vertex < EXPECTED_VERTEX_COUNT; vertex += 1) {
    const w = physical[vertex * 4 + 3]!;
    if (!Number.isFinite(w) || w < 0)
      fail('physical-state-mismatch', `Physical inverse mass ${vertex} is invalid.`);
    if (w === 0) {
      zeroCount += 1;
      if (!pinSet.has(vertex))
        fail(
          'physical-state-mismatch',
          `Unpinned vertex ${vertex} has zero physical inverse mass.`,
        );
    } else {
      positiveCount += 1;
      minimum = Math.min(minimum, w);
      maximum = Math.max(maximum, w);
      if (pinSet.has(vertex))
        fail('physical-state-mismatch', `Pinned vertex ${vertex} has positive inverse mass.`);
    }
  }
  if (zeroCount !== EXPECTED_PIN_COUNT || positiveCount !== EXPECTED_FREE_COUNT)
    fail('physical-state-mismatch', 'Physical inverse-mass support counts drifted.');
  return Object.freeze({ minimum, maximum, zeroCount, positiveCount });
}

const CLAIMS: BetaSkirtCanonicalMediumWebgpuRuntimeSourceClaimsV1 = Object.freeze({
  exactSameSessionSourceAndV5OwnersBound: true,
  sourceAdmissionDiagnosticQualified: true,
  normalizedV5DiagnosticPackageQualified: true,
  physicalInverseMassTransportBound: true,
  legacyPinMaskNotUsedAsPhysicalInverseMass: true,
  exactActualBodyCollisionInputRetained: true,
  callerOwnedMutableBinaryCopies: true,
  gpuResourcesAllocated: false,
  framesExecuted: false,
  collisionAuthority: false,
  runtimeAuthority: false,
  fitAuthority: false,
  productionAuthority: false,
});

export async function buildBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(
  input: unknown,
): Promise<BetaSkirtCanonicalMediumWebgpuRuntimeSourceResultV1> {
  try {
    const request = snapshotRequest(input);
    const source = projectBetaSkirtCanonicalMediumSourceAdmissionV1(request.sourceAdmissionOwner);
    const v5 = projectDxfProductTwoPanelSkirtCanonicalMediumNormalizedV5SolverBridgeV1(
      request.normalizedV5BridgeOwner,
    );
    if (!source || !v5)
      fail(
        'upstream-owner-unavailable',
        'Live source-admission and normalized-V5 owners are required.',
      );

    const sourceReport = request.sourceAdmissionOwner.report;
    const v5Report = request.normalizedV5BridgeOwner.report;
    if (
      source.reportCanonicalSha256 !== request.expected.sourceAdmissionCanonicalSha256 ||
      sourceReport.seal.canonicalSha256 !== request.expected.sourceAdmissionCanonicalSha256 ||
      v5.reportCanonicalSha256 !== request.expected.normalizedV5BridgeCanonicalSha256 ||
      v5Report.seal.canonicalSha256 !== request.expected.normalizedV5BridgeCanonicalSha256
    ) {
      fail('upstream-binding-mismatch', 'Presented owner receipts differ from expected bindings.');
    }

    // Own all mutable upstream carriers before the first await.
    const sourcePositions3M = new CapturedFloat32Array(source.retainedSourceCandidate.positions3M);
    const sourcePinMask = new CapturedFloat32Array(source.retainedSourceCandidate.positionsInvMass);
    const sourceTriangles = new CapturedUint32Array(source.retainedSourceCandidate.triangles);
    const sourceSeams = new CapturedUint32Array(source.retainedSourceCandidate.seamSnapshot.pairs);
    const sourcePins = new CapturedUint32Array(source.retainedSourceCandidate.pinnedVertexIndices);
    const rollbackPositions3M = new CapturedFloat32Array(source.rollbackCandidate.positions3M);
    const rollbackPinMask = new CapturedFloat32Array(source.rollbackCandidate.positionsInvMass);
    const rollbackTriangles = new CapturedUint32Array(source.rollbackCandidate.triangles);
    const rollbackSeams = new CapturedUint32Array(source.rollbackCandidate.seamSnapshot.pairs);
    const rollbackPins = new CapturedUint32Array(source.rollbackCandidate.pinnedVertexIndices);
    const physical = new CapturedFloat32Array(v5.initialPhysicalPositionsInvMassKg);
    const legacyPinMask = new CapturedFloat32Array(v5.mappedPositionsPinMask);
    const normalizedTriangles = new CapturedUint32Array(v5.normalizedTriangles);
    const seamPairs = new CapturedUint32Array(v5.seamPairs);
    const pins = new CapturedUint32Array(v5.pinnedWaistVertexIndices);
    const collisionInput = snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1(
      source.collisionInput,
    );
    const normalizedV5 = structuredCloneCaptured(v5.normalizedV5);

    if (
      sourcePositions3M.length !== EXPECTED_VERTEX_COUNT * 3 ||
      sourcePinMask.length !== EXPECTED_VERTEX_COUNT * 4 ||
      physical.length !== EXPECTED_VERTEX_COUNT * 4 ||
      normalizedTriangles.length !== EXPECTED_TRIANGLE_COUNT * 3 ||
      seamPairs.length !== EXPECTED_SEAM_PAIR_COUNT * 2 ||
      pins.length !== EXPECTED_PIN_COUNT
    ) {
      fail('physical-state-mismatch', 'Canonical-medium runtime-source counts drifted.');
    }
    if (
      !bytesEqual(sourcePositions3M, rollbackPositions3M) ||
      !bytesEqual(sourcePinMask, rollbackPinMask) ||
      !bytesEqual(sourceTriangles, rollbackTriangles) ||
      !bytesEqual(sourceSeams, rollbackSeams) ||
      !bytesEqual(sourcePins, rollbackPins)
    ) {
      fail('upstream-binding-mismatch', 'Source and rollback candidates are not exact byte peers.');
    }
    if (
      !bytesEqual(sourcePinMask, legacyPinMask) ||
      !bytesEqual(sourceTriangles, normalizedTriangles) ||
      !bytesEqual(sourceSeams, seamPairs) ||
      !bytesEqual(sourcePins, pins) ||
      !bytesEqual(sourcePositions3M, positions3FromPhysical(physical)) ||
      !bytesEqual(collisionInput.garmentPositionsM, sourcePositions3M) ||
      !bytesEqual(collisionInput.garmentTriangles, normalizedTriangles) ||
      !bytesEqual(normalizedV5.simulation.mesh.restPositionsInvMass, physical) ||
      !bytesEqual(normalizedV5.simulation.mesh.triangles, normalizedTriangles)
    ) {
      fail(
        'upstream-binding-mismatch',
        'Source-admission and normalized-V5 binary carriers drifted.',
      );
    }
    if (
      sourceReport.bindings.selfOrientationCanonicalSha256 !==
        v5Report.bindings.selfOrientationReportSha256 ||
      sourceReport.bindings.sourcePositionsRawFloat32LeSha256 !==
        v5Report.bindings.mappedPositions3MSha256 ||
      sourceReport.bindings.sourceTopologyRawUint32LeSha256 !==
        v5Report.bindings.normalizedTopologySha256 ||
      sourceReport.bindings.sourceInverseMassRawFloat32LeSha256 !==
        v5Report.bindings.mappedPositionsPinMaskSha256 ||
      sourceReport.bindings.seamPairsRawUint32LeSha256 !== v5Report.bindings.seamPairsSha256 ||
      sourceReport.bindings.pinnedVertexIndicesRawUint32LeSha256 !==
        v5Report.bindings.pinnedWaistVertexIndicesSha256
    ) {
      fail('upstream-binding-mismatch', 'Source-admission and V5 report content bindings drifted.');
    }
    if (
      source.decision !== 'diagnostic-source-clear-no-contact-relaxation-required' ||
      sourceReport.decision !== 'diagnostic-source-clear-no-contact-relaxation-required' ||
      !sourceReport.collision.exactClear ||
      sourceReport.collision.contactRelaxationRequired ||
      sourceReport.collision.bodyGarmentTriangleIntersectionCount !== 0 ||
      sourceReport.collision.penetratingVertexCount !== 0 ||
      sourceReport.collision.unsafeVertexCount !== 0 ||
      sourceReport.collision.ambiguousSignVertexCount !== 0
    ) {
      fail(
        'source-admission-not-clear',
        'Runtime source requires the exact-clear source disposition.',
      );
    }
    if (
      v5Report.decision !== 'PASS_NORMALIZED_V5_SOLVER_MATERIAL_BRIDGE' ||
      !v5Report.strainParity.exactComponentParity ||
      v5Report.counts.zeroPhysicalInverseMassCount !== EXPECTED_PIN_COUNT ||
      v5Report.counts.positivePhysicalInverseMassCount !== EXPECTED_FREE_COUNT ||
      v5.normalizedTopologySolverMaterialCompatibilityEstablished !== true ||
      v5.normalizedV5DiagnosticPackageAuthority !== true
    ) {
      fail(
        'physical-state-mismatch',
        'Normalized V5 physical/material diagnostic is not qualified.',
      );
    }
    if (
      collisionInput.garmentUniformScale !== 1 ||
      collisionInput.garmentTranslationM.some((value) => value !== 0) ||
      source.collisionAuthority ||
      source.runtimeAuthority ||
      source.fitAuthority ||
      source.productionAuthority ||
      v5.runtimeAuthority ||
      v5.fitAuthority ||
      v5.productionAuthority
    ) {
      fail(
        'upstream-binding-mismatch',
        'Upstream transform or diagnostic authority boundary drifted.',
      );
    }

    const massRange = physicalMassRange(physical, pins);
    await validateDigestAuthority();
    const packageValidation = await validateSealedSimulationPackageV5V1(normalizedV5, {
      crypto: capturedCrypto(),
    });
    if (!packageValidation.ok)
      fail(
        'normalized-v5-invalid',
        'errors' in packageValidation
          ? packageValidation.errors.join(' ')
          : 'Normalized V5 seal validation failed.',
      );

    const [positions3Hash, topologyHash, pinMaskHash, physicalHash, seamsHash, pinsHash] =
      await Promise.all([
        sha256View(sourcePositions3M),
        sha256View(normalizedTriangles),
        sha256View(legacyPinMask),
        sha256View(physical),
        sha256View(seamPairs),
        sha256View(pins),
      ]);
    if (
      positions3Hash !== sourceReport.bindings.sourcePositionsRawFloat32LeSha256 ||
      positions3Hash !== v5Report.bindings.mappedPositions3MSha256 ||
      topologyHash !== sourceReport.bindings.sourceTopologyRawUint32LeSha256 ||
      topologyHash !== v5Report.bindings.normalizedTopologySha256 ||
      pinMaskHash !== sourceReport.bindings.sourceInverseMassRawFloat32LeSha256 ||
      pinMaskHash !== v5Report.bindings.mappedPositionsPinMaskSha256 ||
      physicalHash !== v5Report.bindings.initialPhysicalPositionsInvMassKgSha256 ||
      seamsHash !== sourceReport.bindings.seamPairsRawUint32LeSha256 ||
      seamsHash !== v5Report.bindings.seamPairsSha256 ||
      pinsHash !== sourceReport.bindings.pinnedVertexIndicesRawUint32LeSha256 ||
      pinsHash !== v5Report.bindings.pinnedWaistVertexIndicesSha256 ||
      normalizedV5.seal.aggregateSha256 !== v5Report.bindings.normalizedV5AggregateSha256
    ) {
      fail('upstream-binding-mismatch', 'Independent runtime-source hashes differ upstream.');
    }

    const reportWithoutSeal = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_REPORT_V1,
      status: 'diagnostic-source-ready' as const,
      decision: 'PASS_CONTENT_BOUND_WEBGPU_RUNTIME_SOURCE' as const,
      bindings: Object.freeze({
        sourceAdmissionCanonicalSha256: source.reportCanonicalSha256,
        normalizedV5BridgeCanonicalSha256: v5.reportCanonicalSha256,
        selfOrientationCanonicalSha256: sourceReport.bindings.selfOrientationCanonicalSha256,
        sourcePositions3MSha256: positions3Hash,
        normalizedTopologySha256: topologyHash,
        legacyPinMaskSha256: pinMaskHash,
        physicalPositionsInvMassKgSha256: physicalHash,
        seamPairsSha256: seamsHash,
        pinnedVertexIndicesSha256: pinsHash,
        normalizedV5AggregateSha256: normalizedV5.seal.aggregateSha256,
        actualBodyCollisionInputSha256: sourceReport.bindings.collisionInputSha256,
      }),
      counts: Object.freeze({
        bodyVertexCount: collisionInput.bodyPositionsM.length / 3,
        bodyTriangleCount: collisionInput.bodyTriangles.length / 3,
        garmentVertexCount: EXPECTED_VERTEX_COUNT,
        garmentTriangleCount: EXPECTED_TRIANGLE_COUNT,
        seamPairCount: EXPECTED_SEAM_PAIR_COUNT,
        pinnedVertexCount: EXPECTED_PIN_COUNT,
        freeVertexCount: EXPECTED_FREE_COUNT,
        zeroPhysicalInverseMassCount: EXPECTED_PIN_COUNT,
        positivePhysicalInverseMassCount: EXPECTED_FREE_COUNT,
      }),
      physicalState: Object.freeze({
        units: 'm-kg-s' as const,
        inverseMassSource: 'normalized-v5-particle-mass-records' as const,
        legacyPinMaskRetainedForAuditOnly: true as const,
        minimumPositiveInverseMassKgInv: massRange.minimum,
        maximumPositiveInverseMassKgInv: massRange.maximum,
        packageRestPositionsByteEqualToInitialPhysicalState: true as const,
      }),
      claims: CLAIMS,
      blockers: Object.freeze([
        'webgpu-frame-execution-not-evaluated',
        'post-frame-actual-body-collision-not-evaluated',
        'settle-and-fit-authority-not-established',
      ] as const),
    });
    const reportSeal = await sha256Text(jsonStringify(reportWithoutSeal));
    const report: BetaSkirtCanonicalMediumWebgpuRuntimeSourceReportV1 = Object.freeze({
      ...reportWithoutSeal,
      seal: Object.freeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: reportSeal,
        authority: 'unsigned-same-session-webgpu-runtime-source-diagnostic-only' as const,
      }),
    });
    const owner = Object.freeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_OWNER_V1,
      report,
    }) as BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1;
    owners.set(owner, {
      normalizedV5,
      initialPhysicalPositionsInvMassKg: physical,
      normalizedTriangles,
      seamPairs,
      pinnedWaistVertexIndices: pins,
      collisionInput,
    });
    return Object.freeze({ ok: true as const, owner, report, claims: CLAIMS });
  } catch (error) {
    return blocked(error);
  }
}

export function projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(
  owner: unknown,
): BetaSkirtCanonicalMediumWebgpuRuntimeSourceProjectionV1 | null {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
  const record = owners.get(owner as object);
  if (!record) return null;
  const publicOwner = owner as BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1;
  return Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_RUNTIME_SOURCE_PROJECTION_V1,
    reportCanonicalSha256: publicOwner.report.seal.canonicalSha256,
    normalizedV5: structuredCloneCaptured(record.normalizedV5),
    initialPhysicalPositionsInvMassKg: new CapturedFloat32Array(
      record.initialPhysicalPositionsInvMassKg,
    ),
    normalizedTriangles: new CapturedUint32Array(record.normalizedTriangles),
    seamPairs: new CapturedUint32Array(record.seamPairs),
    pinnedWaistVertexIndices: new CapturedUint32Array(record.pinnedWaistVertexIndices),
    collisionInput: snapshotBetaSkirtRenderedBodyCollisionDiagnosticInputV1(record.collisionInput),
    callerOwnedMutableBinaryCopies: true as const,
    sourceAdmissionDiagnosticAuthority: true as const,
    normalizedV5DiagnosticPackageAuthority: true as const,
    gpuResourceAuthority: false as const,
    frameExecutionAuthority: false as const,
    collisionAuthority: false as const,
    runtimeAuthority: false as const,
    fitAuthority: false as const,
    productionAuthority: false as const,
  });
}

export function disposeBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(owner: unknown): boolean {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
  const record = owners.get(owner as object);
  if (!record) return false;
  reflectApply(float32Fill, record.initialPhysicalPositionsInvMassKg, [0]);
  reflectApply(uint32Fill, record.normalizedTriangles, [0]);
  reflectApply(uint32Fill, record.seamPairs, [0]);
  reflectApply(uint32Fill, record.pinnedWaistVertexIndices, [0]);
  reflectApply(float32Fill, record.collisionInput.bodyPositionsM, [0]);
  reflectApply(uint32Fill, record.collisionInput.bodyTriangles, [0]);
  reflectApply(float32Fill, record.collisionInput.garmentPositionsM, [0]);
  reflectApply(uint32Fill, record.collisionInput.garmentTriangles, [0]);
  owners.delete(owner as object);
  return true;
}
