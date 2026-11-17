import {
  disposeBetaSkirtCanonicalMediumWebgpu16FrameContactV2,
  projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2,
  runBetaSkirtCanonicalMediumWebgpu16FrameContactV2,
  type BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOptionsV2,
  type BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  type BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerReportV2,
} from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';
import {
  assertBetaSkirtCanonicalMediumWebgpu16FrameContactClearBoundaryV2,
  createBetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewV2,
  type BetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewSessionV2,
} from './beta-skirt-canonical-medium-webgpu-16-frame-contact-clear-preview-v2';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';
import type { BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1 } from './beta-skirt-canonical-medium-saved-runtime-source-v1';
import { hashBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4 } from './beta-skirt-canonical-medium-saved-webgpu-32-frame-checkpoint-contract-v4';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_16_FRAME_CONTACT_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-16-frame-contact/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_16_FRAME_CONTACT_CANDIDATE_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-16-frame-contact-candidate/1' as const;

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const HEX = '0123456789abcdef';
const objectFreeze = Object.freeze;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const jsonStringify = JSON.stringify;
const arrayBufferPrototype = ArrayBuffer.prototype;
const reflectApply = Reflect.apply;
const uint8ArraySet = Uint8Array.prototype.set;
const dataViewSetFloat32 = DataView.prototype.setFloat32;
const textEncoderEncode = TextEncoder.prototype.encode;
const capturedSubtle = globalThis.crypto?.subtle;
const subtleDigest =
  typeof SubtleCrypto === 'undefined'
    ? null
    : Object.getOwnPropertyDescriptor(SubtleCrypto.prototype, 'digest')?.value;
const CapturedUint8Array = Uint8Array;
const CapturedDataView = DataView;
const encoder = new TextEncoder();

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_16_FRAME_CANDIDATE_AUTHENTICITY_V1 =
  objectFreeze({
    savedRuntimeSnapshotAndBaseContentBound: true,
    genuineSavedRuntimeWrapperAuthenticated: false,
    baseRuntimeOwnerNotReturnedByAdapter: true,
  } as const);

const FROZEN_CANONICAL_REFERENCE = objectFreeze({
  sourcePositions3MSha256: '33772a6d189b1ffd598ac45ed2f76d89ccd08a40145d8516371656e9d1950e3a',
  normalizedTopologySha256: '34367d9cd8ab0fc46ddbcfa00db51956c73e1c89bedb87c606545152cd1affd2',
  legacyPinMaskSha256: '31c532c0faf053e24b5ae41c37a2ea5eb381dc97781f80c6b143743025e15592',
  physicalPositionsInvMassKgSha256:
    'c965dc432fc76dad44b0ee948dc668533cfdc4ce947cdfab2482127c4392e6e5',
  seamPairsSha256: 'f1e53f8d2d47187d481d2a3dab1404463b9b000d1d1f21fc8a953dad721795ba',
  pinnedVertexIndicesSha256: '46c4dc4d55e8eb329afd094ee6e5dea7059339dff5ceb3d1cda37b02f886e8e1',
  bodyPositionsRawSha256: '77ef8d3e63a3ff01a25defdae5c25193d536c797351e81772cb5b33971a13520',
  bodyTrianglesRawSha256: '813c59ba79d891dabd4f657fe042dbc20bf21518b13a59087bd4b5bf0941f7b3',
  normalizedV5AggregateSha256: 'f7aea8696adcd6c38256a32b3277b69bd4822055e09049f4cf35f12ac4a59f70',
  normalizedV5ManifestSha256: 'c57e0aadc74587bb8bbe8285d40b172451d02d1418f1be5f8719b3ee86c780f0',
  normalizedV5MeshSha256: '19d2402549a6d19357a2f5fea25ca7cff52b42a19f111be2dcaf33a0ef5151e2',
  normalizedV5DistanceSha256: 'c614d536325dfc0c787bcf634cb61d3574d8465b2e405aff015ca4572588a6ed',
  normalizedV5SeamSha256: '1018ced097d0d8efc9c891bf4698abc0072c23da7d12ebd006e8873626d18967',
  normalizedV5BendSha256: 'd5ad85e530cb72bf1a5d4af21549344324faf601c58761bf77a19a3483c43d92',
  normalizedV5MaterialSha256: '35756dad768ca99dddf051b2306abbe606a5878000494275492cee25dde1bf39',
  normalizedV5ContinuumSha256: 'fa925f675a3ee4aa339ab67ade968d018d29adf3e3354d6610612368d3ceaadf',
} as const);

type RuntimeHashes = Readonly<{
  [Key in keyof typeof FROZEN_CANONICAL_REFERENCE]: string;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu16FramePreGpuParityV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_16_FRAME_CONTACT_V1;
  availableRuntimeBuffersIndependentlyRehashed: true;
  legacyPinMaskIndependentlyRehashed: false;
  normalizedV5ComponentDigestsReboundFromLiveProjection: true;
  exactSavedWrapperBindingsMatchLiveBaseRuntime: true;
  unchanged16FrameRunnerContractEligible: true;
  exactFrozenCanonicalRunnerInputsMatch: false;
  frozen32FrameV3ReuseEligible: false;
  comparison: Readonly<{
    sourcePositions: false;
    physicalPositionsInvMass: false;
    normalizedTopology: true;
    seamPairs: true;
    pinnedVertexIndices: true;
    bodyPositions: true;
    bodyTriangles: true;
    normalizedV5Aggregate: false;
    normalizedV5Manifest: false;
    normalizedV5Mesh: false;
    normalizedV5Distance: false;
    normalizedV5Seam: true;
    normalizedV5Bend: true;
    normalizedV5Material: false;
    normalizedV5Continuum: false;
  }>;
  actual: RuntimeHashes;
  frozenCanonical: typeof FROZEN_CANONICAL_REFERENCE;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu16FrameDiagnosticSnapshotV1 = Readonly<{
  frameSubmissionCount: 16;
  readbackSubmissionCount: 1;
  totalComputeDispatchCount: number;
  positionReadbackByteLength: number;
  diagnosticReadbackByteLength: number;
  invalidVelocityStateCount: number;
  numericInvalidVelocityStateCount: number;
  outOfDomainVelocityStateCount: number;
  bendInvalidConstraintCount: number;
  continuumNonzeroStatusCount: number;
  contactDispatchCount: 16;
  contactCorrectedParticleEventCount: number;
  contactInvalidParticleCount: number;
  contactDegenerateTriangleVisitCount: number;
  contactOutOfRangeTriangleVisitCount: number;
  contactMaximumCorrectionM: number;
  contactMaximumPenetrationM: number;
  contactMinimumCorrectedParticleIndex: number | null;
  contactInwardNormalClampEventCount: number;
  contactMaximumRemovedInwardNormalDeltaM: number;
  contactCorrectionCapHit: false;
  contactReservedDiagnostic: 0;
  validationMessages: readonly [];
  deviceLossMessages: readonly [];
  canonicalSha256: string;
}>;

/**
 * Content-only adapter evidence. This object deliberately cannot authenticate that a caller held
 * a genuine SavedRuntimeSourceOwnerV1: the exported adapter accepts a structural snapshot plus a
 * base owner. Only the saved-wrapper module may turn this candidate into a genuine saved receipt.
 */
export type BetaSkirtCanonicalMediumSavedWebgpu16FrameContactCandidateV1 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_16_FRAME_CONTACT_CANDIDATE_V1;
  status: 'saved-dxf-16-frame-contact-clear-diagnostic';
  decision: 'PASS_SAVED_DXF_16_FRAME_EXACT_BODY_CONTACT_AND_POSTGATE';
  bindings: Readonly<{
    savedRuntimeSourceCanonicalSha256: string;
    issuingSessionGeneration: number;
    rowDxfSha256: string;
    savedLocalFrameComposerCanonicalSha256: string;
    savedPlacementCanonicalSha256: string;
    actualBodyBridgeCanonicalSha256: string;
    sourceAdmissionCanonicalSha256: string;
    baseRuntimeSourceCanonicalSha256: string;
    normalizedV5AggregateSha256: string;
    sourcePositions3MSha256: string;
    normalizedTopologySha256: string;
    seamPairsSha256: string;
    pinnedVertexIndicesSha256: string;
    bodyPositionsRawSha256: string;
    bodyTrianglesRawSha256: string;
    runnerReportCanonicalSha256: string;
    finalPositionsInvMassKgSha256: string;
    finalPositions3MSha256: string;
    finalCollisionContentFingerprintSha256: string;
    diagnosticSnapshotSha256: string;
  }>;
  preGpuParity: BetaSkirtCanonicalMediumSavedWebgpu16FramePreGpuParityV1;
  diagnosticSnapshot: BetaSkirtCanonicalMediumSavedWebgpu16FrameDiagnosticSnapshotV1;
  stableEvidence: Readonly<{
    canonicalSha256: string;
    excludesRunnerTimingAndVolatileRunnerSeal: true;
  }>;
  claims: Readonly<{
    savedRuntimeSnapshotAndBaseContentBound: true;
    genuineSavedRuntimeWrapperAuthenticated: false;
    baseRuntimeOwnerNotReturnedByAdapter: true;
    unchanged16FrameRunnerExecuted: true;
    exactFinalVec4IndependentlyHashed: true;
    exactFinalVec3MatchesRunnerReceipt: true;
    exactActualBodyPostgateClear: true;
    savedInitialStateMatchesFrozenCanonical: false;
    frozen32FrameV3ReuseEligible: false;
    postFrameSelfOrientationEvaluated: false;
    collisionAuthority: false;
    runtimeAuthority: false;
    fitAuthority: false;
    productionAuthority: false;
  }>;
  blockers: readonly [
    'post-frame-self-orientation-not-evaluated',
    'saved-input-requires-additive-32-frame-v4',
    'settle-and-fit-authority-not-established',
    'production-qualification-not-run',
  ];
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-structural-saved-content-candidate-only';
  }>;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu16FrameExecutionV1 = Readonly<{
  preGpuParity: BetaSkirtCanonicalMediumSavedWebgpu16FramePreGpuParityV1;
  runnerOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2;
  runnerReport: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerReportV2;
  candidate: BetaSkirtCanonicalMediumSavedWebgpu16FrameContactCandidateV1;
}>;

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException('Saved 16-frame execution was cancelled.', 'AbortError');
}

function ownedBytes(value: ArrayBufferView): Uint8Array {
  if (objectGetPrototypeOf(value.buffer) !== arrayBufferPrototype)
    throw new TypeError('Saved 16-frame input cannot use SharedArrayBuffer storage.');
  const output = new CapturedUint8Array(value.byteLength);
  const source = new CapturedUint8Array(value.buffer, value.byteOffset, value.byteLength);
  reflectApply(uint8ArraySet, output, [source]);
  return output;
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || !subtleDigest)
    throw new TypeError('Native Web Crypto SHA-256 is unavailable.');
  const result = (await reflectApply(subtleDigest, capturedSubtle, [
    'SHA-256',
    bytes,
  ])) as ArrayBuffer;
  if (objectGetPrototypeOf(result) !== arrayBufferPrototype || result.byteLength !== 32)
    throw new TypeError('Native Web Crypto SHA-256 returned invalid bytes.');
  const digest = new CapturedUint8Array(result);
  let hex = '';
  for (let index = 0; index < digest.length; index += 1) {
    const byte = digest[index]!;
    hex += HEX[byte >>> 4]! + HEX[byte & 0x0f]!;
  }
  return hex;
}

async function validateDigest(): Promise<void> {
  if ((await digestBytes(new CapturedUint8Array(0))) !== EMPTY_SHA256)
    throw new TypeError('SHA-256 empty-message KAT failed.');
  const abc = new CapturedUint8Array([97, 98, 99]);
  if ((await digestBytes(abc)) !== ABC_SHA256) throw new TypeError('SHA-256 abc KAT failed.');
}

async function rawSha256(value: ArrayBufferView): Promise<string> {
  return digestBytes(ownedBytes(value));
}

async function physicalVec4Sha256(value: Float32Array): Promise<string> {
  if (!dataViewSetFloat32) throw new TypeError('Native Float32LE writer is unavailable.');
  const bytes = new CapturedUint8Array(value.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < value.length; index += 1)
    reflectApply(dataViewSetFloat32, view, [index * 4, value[index], true]);
  return digestBytes(bytes);
}

function encodeText(value: string): Uint8Array {
  return reflectApply(textEncoderEncode, encoder, [value]) as Uint8Array;
}

async function payloadSha256(domain: string, value: unknown): Promise<string> {
  let serialized: string | undefined;
  try {
    serialized = jsonStringify(value);
  } catch {
    throw new TypeError(`${domain} payload is not serializable.`);
  }
  if (typeof serialized !== 'string') throw new TypeError(`${domain} payload is not serializable.`);
  return digestBytes(encodeText(`${domain}\0${serialized}`));
}

function sameRecord(left: RuntimeHashes, right: RuntimeHashes): boolean {
  const keys = objectKeys(left) as (keyof RuntimeHashes)[];
  return keys.length === objectKeys(right).length && keys.every((key) => left[key] === right[key]);
}

export async function inspectBetaSkirtCanonicalMediumSavedWebgpu16FramePreGpuParityV1(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  signal?: AbortSignal,
): Promise<BetaSkirtCanonicalMediumSavedWebgpu16FramePreGpuParityV1> {
  assertNotAborted(signal);
  const runtime = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSourceOwner);
  if (!runtime || runtime.reportCanonicalSha256 !== snapshot.bindings.runtimeSourceCanonicalSha256)
    throw new TypeError('Saved wrapper lost its genuine base runtime binding.');
  await validateDigest();
  assertNotAborted(signal);
  const actual = objectFreeze({
    sourcePositions3MSha256: await rawSha256(runtime.collisionInput.garmentPositionsM),
    normalizedTopologySha256: await rawSha256(runtime.normalizedTriangles),
    legacyPinMaskSha256: snapshot.bindings.legacyPinMaskSha256,
    physicalPositionsInvMassKgSha256: await physicalVec4Sha256(
      runtime.initialPhysicalPositionsInvMassKg,
    ),
    seamPairsSha256: await rawSha256(runtime.seamPairs),
    pinnedVertexIndicesSha256: await rawSha256(runtime.pinnedWaistVertexIndices),
    bodyPositionsRawSha256: await rawSha256(runtime.collisionInput.bodyPositionsM),
    bodyTrianglesRawSha256: await rawSha256(runtime.collisionInput.bodyTriangles),
    normalizedV5AggregateSha256: runtime.normalizedV5.seal.aggregateSha256,
    normalizedV5ManifestSha256: runtime.normalizedV5.seal.digests.manifestSha256,
    normalizedV5MeshSha256: runtime.normalizedV5.seal.digests.meshSha256,
    normalizedV5DistanceSha256: runtime.normalizedV5.seal.digests.distanceSha256,
    normalizedV5SeamSha256: runtime.normalizedV5.seal.digests.seamSha256,
    normalizedV5BendSha256: runtime.normalizedV5.seal.digests.bendSha256,
    normalizedV5MaterialSha256: runtime.normalizedV5.seal.digests.materialSha256,
    normalizedV5ContinuumSha256: runtime.normalizedV5.seal.digests.continuumSha256,
  }) satisfies RuntimeHashes;
  assertNotAborted(signal);
  const saved = objectFreeze({
    sourcePositions3MSha256: snapshot.bindings.sourcePositions3MSha256,
    normalizedTopologySha256: snapshot.bindings.normalizedTopologySha256,
    legacyPinMaskSha256: snapshot.bindings.legacyPinMaskSha256,
    physicalPositionsInvMassKgSha256: snapshot.bindings.physicalPositionsInvMassKgSha256,
    seamPairsSha256: snapshot.bindings.seamPairsSha256,
    pinnedVertexIndicesSha256: snapshot.bindings.pinnedVertexIndicesSha256,
    bodyPositionsRawSha256: snapshot.bindings.bodyPositionsRawSha256,
    bodyTrianglesRawSha256: snapshot.bindings.bodyTrianglesRawSha256,
    normalizedV5AggregateSha256: snapshot.bindings.normalizedV5AggregateSha256,
    normalizedV5ManifestSha256: snapshot.bindings.normalizedV5ManifestSha256,
    normalizedV5MeshSha256: snapshot.bindings.normalizedV5MeshSha256,
    normalizedV5DistanceSha256: snapshot.bindings.normalizedV5DistanceSha256,
    normalizedV5SeamSha256: snapshot.bindings.normalizedV5SeamSha256,
    normalizedV5BendSha256: snapshot.bindings.normalizedV5BendSha256,
    normalizedV5MaterialSha256: snapshot.bindings.normalizedV5MaterialSha256,
    normalizedV5ContinuumSha256: snapshot.bindings.normalizedV5ContinuumSha256,
  }) satisfies RuntimeHashes;
  if (!sameRecord(actual, saved))
    throw new TypeError('Live base runtime buffers differ from the authenticated saved wrapper.');
  const comparison = objectFreeze({
    sourcePositions:
      actual.sourcePositions3MSha256 === FROZEN_CANONICAL_REFERENCE.sourcePositions3MSha256,
    physicalPositionsInvMass:
      actual.physicalPositionsInvMassKgSha256 ===
      FROZEN_CANONICAL_REFERENCE.physicalPositionsInvMassKgSha256,
    normalizedTopology:
      actual.normalizedTopologySha256 === FROZEN_CANONICAL_REFERENCE.normalizedTopologySha256,
    seamPairs: actual.seamPairsSha256 === FROZEN_CANONICAL_REFERENCE.seamPairsSha256,
    pinnedVertexIndices:
      actual.pinnedVertexIndicesSha256 === FROZEN_CANONICAL_REFERENCE.pinnedVertexIndicesSha256,
    bodyPositions:
      actual.bodyPositionsRawSha256 === FROZEN_CANONICAL_REFERENCE.bodyPositionsRawSha256,
    bodyTriangles:
      actual.bodyTrianglesRawSha256 === FROZEN_CANONICAL_REFERENCE.bodyTrianglesRawSha256,
    normalizedV5Aggregate:
      actual.normalizedV5AggregateSha256 === FROZEN_CANONICAL_REFERENCE.normalizedV5AggregateSha256,
    normalizedV5Manifest:
      actual.normalizedV5ManifestSha256 === FROZEN_CANONICAL_REFERENCE.normalizedV5ManifestSha256,
    normalizedV5Mesh:
      actual.normalizedV5MeshSha256 === FROZEN_CANONICAL_REFERENCE.normalizedV5MeshSha256,
    normalizedV5Distance:
      actual.normalizedV5DistanceSha256 === FROZEN_CANONICAL_REFERENCE.normalizedV5DistanceSha256,
    normalizedV5Seam:
      actual.normalizedV5SeamSha256 === FROZEN_CANONICAL_REFERENCE.normalizedV5SeamSha256,
    normalizedV5Bend:
      actual.normalizedV5BendSha256 === FROZEN_CANONICAL_REFERENCE.normalizedV5BendSha256,
    normalizedV5Material:
      actual.normalizedV5MaterialSha256 === FROZEN_CANONICAL_REFERENCE.normalizedV5MaterialSha256,
    normalizedV5Continuum:
      actual.normalizedV5ContinuumSha256 === FROZEN_CANONICAL_REFERENCE.normalizedV5ContinuumSha256,
  });
  const expectedComparison = objectFreeze({
    sourcePositions: false as const,
    physicalPositionsInvMass: false as const,
    normalizedTopology: true as const,
    seamPairs: true as const,
    pinnedVertexIndices: true as const,
    bodyPositions: true as const,
    bodyTriangles: true as const,
    normalizedV5Aggregate: false as const,
    normalizedV5Manifest: false as const,
    normalizedV5Mesh: false as const,
    normalizedV5Distance: false as const,
    normalizedV5Seam: true as const,
    normalizedV5Bend: true as const,
    normalizedV5Material: false as const,
    normalizedV5Continuum: false as const,
  });
  if (jsonStringify(comparison) !== jsonStringify(expectedComparison))
    throw new TypeError('Saved-to-frozen-canonical pre-GPU parity changed unexpectedly.');
  return objectFreeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_16_FRAME_CONTACT_V1,
    availableRuntimeBuffersIndependentlyRehashed: true as const,
    legacyPinMaskIndependentlyRehashed: false as const,
    normalizedV5ComponentDigestsReboundFromLiveProjection: true as const,
    exactSavedWrapperBindingsMatchLiveBaseRuntime: true as const,
    unchanged16FrameRunnerContractEligible: true as const,
    exactFrozenCanonicalRunnerInputsMatch: false as const,
    frozen32FrameV3ReuseEligible: false as const,
    comparison: expectedComparison,
    actual,
    frozenCanonical: FROZEN_CANONICAL_REFERENCE,
  });
}

export async function executeBetaSkirtCanonicalMediumSavedWebgpu16FrameContactV1(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  canvas: HTMLCanvasElement,
  options: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOptionsV2 = {},
): Promise<BetaSkirtCanonicalMediumSavedWebgpu16FrameExecutionV1> {
  const preGpuParity = await inspectBetaSkirtCanonicalMediumSavedWebgpu16FramePreGpuParityV1(
    snapshot,
    runtimeSourceOwner,
    options.signal,
  );
  assertNotAborted(options.signal);
  const result = await runBetaSkirtCanonicalMediumWebgpu16FrameContactV2(
    canvas,
    runtimeSourceOwner,
    options,
  );
  if (!result.ok) {
    if (result.owner) disposeBetaSkirtCanonicalMediumWebgpu16FrameContactV2(result.owner);
    throw new TypeError(`Unchanged 16-frame runner blocked: ${result.code}: ${result.detail}`);
  }
  try {
    assertBetaSkirtCanonicalMediumWebgpu16FrameContactClearBoundaryV2(result.report);
    if (
      result.report.bindings.runtimeSourceCanonicalSha256 !==
        snapshot.bindings.runtimeSourceCanonicalSha256 ||
      result.report.bindings.sourcePositions3MSha256 !==
        snapshot.bindings.sourcePositions3MSha256 ||
      result.report.bindings.normalizedV5AggregateSha256 !==
        snapshot.bindings.normalizedV5AggregateSha256
    )
      throw new TypeError('16-frame runner receipt differs from the saved runtime wrapper.');
    assertNotAborted(options.signal);
    const projection = projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2(result.owner);
    if (!projection || projection.reportCanonicalSha256 !== result.report.seal.canonicalSha256)
      throw new TypeError('16-frame runner owner is not projectable after execution.');
    const finalPositionsInvMassKgSha256 = await physicalVec4Sha256(
      projection.finalPositionsInvMassKg,
    );
    const finalPositions3MSha256 = await physicalVec4Sha256(projection.finalPositions3M);
    const finalTopologySha256 = await rawSha256(projection.normalizedTriangles);
    if (
      finalPositions3MSha256 !== result.report.bindings.finalPositions3MSha256 ||
      finalTopologySha256 !== snapshot.bindings.normalizedTopologySha256
    )
      throw new TypeError('Independent final runner hashes differ from the runner receipt.');
    const execution = result.report.execution;
    if (
      execution.validationMessages.length !== 0 ||
      execution.deviceLossMessages.length !== 0 ||
      execution.contactCorrectionCapHit ||
      execution.invalidVelocityStateCount !== 0 ||
      execution.numericInvalidVelocityStateCount !== 0 ||
      execution.outOfDomainVelocityStateCount !== 0 ||
      execution.bendInvalidConstraintCount !== 0 ||
      execution.continuumNonzeroStatusCount !== 0 ||
      execution.contactInvalidParticleCount !== 0 ||
      execution.contactDegenerateTriangleVisitCount !== 0 ||
      execution.contactOutOfRangeTriangleVisitCount !== 0
    )
      throw new TypeError('16-frame diagnostic ABI contains a nonzero invalid-state field.');
    const diagnosticPayload = objectFreeze({
      frameSubmissionCount: execution.frameSubmissionCount,
      readbackSubmissionCount: execution.readbackSubmissionCount,
      totalComputeDispatchCount: execution.totalComputeDispatchCount,
      positionReadbackByteLength: execution.positionReadbackByteLength,
      diagnosticReadbackByteLength: execution.diagnosticReadbackByteLength,
      invalidVelocityStateCount: execution.invalidVelocityStateCount,
      numericInvalidVelocityStateCount: execution.numericInvalidVelocityStateCount,
      outOfDomainVelocityStateCount: execution.outOfDomainVelocityStateCount,
      bendInvalidConstraintCount: execution.bendInvalidConstraintCount,
      continuumNonzeroStatusCount: execution.continuumNonzeroStatusCount,
      contactDispatchCount: execution.contactDispatchCount,
      contactCorrectedParticleEventCount: execution.contactCorrectedParticleEventCount,
      contactInvalidParticleCount: execution.contactInvalidParticleCount,
      contactDegenerateTriangleVisitCount: execution.contactDegenerateTriangleVisitCount,
      contactOutOfRangeTriangleVisitCount: execution.contactOutOfRangeTriangleVisitCount,
      contactMaximumCorrectionM: execution.contactMaximumCorrectionM,
      contactMaximumPenetrationM: execution.contactMaximumPenetrationM,
      contactMinimumCorrectedParticleIndex: execution.contactMinimumCorrectedParticleIndex,
      contactInwardNormalClampEventCount: execution.contactInwardNormalClampEventCount,
      contactMaximumRemovedInwardNormalDeltaM: execution.contactMaximumRemovedInwardNormalDeltaM,
      contactCorrectionCapHit: false as const,
      contactReservedDiagnostic: 0 as const,
      validationMessages: objectFreeze([] as const),
      deviceLossMessages: objectFreeze([] as const),
    });
    const diagnosticSnapshot = objectFreeze({
      ...diagnosticPayload,
      canonicalSha256: await hashBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4(
        result.report,
      ),
    }) satisfies BetaSkirtCanonicalMediumSavedWebgpu16FrameDiagnosticSnapshotV1;
    const bindings = objectFreeze({
      savedRuntimeSourceCanonicalSha256: snapshot.seal.canonicalSha256,
      issuingSessionGeneration: snapshot.issuingSessionGeneration,
      rowDxfSha256: snapshot.bindings.rowDxfSha256,
      savedLocalFrameComposerCanonicalSha256:
        snapshot.bindings.savedLocalFrameComposerCanonicalSha256,
      savedPlacementCanonicalSha256: snapshot.bindings.savedPlacementCanonicalSha256,
      actualBodyBridgeCanonicalSha256: snapshot.bindings.actualBodyBridgeCanonicalSha256,
      sourceAdmissionCanonicalSha256: snapshot.bindings.sourceAdmissionCanonicalSha256,
      baseRuntimeSourceCanonicalSha256: snapshot.bindings.runtimeSourceCanonicalSha256,
      normalizedV5AggregateSha256: snapshot.bindings.normalizedV5AggregateSha256,
      sourcePositions3MSha256: snapshot.bindings.sourcePositions3MSha256,
      normalizedTopologySha256: snapshot.bindings.normalizedTopologySha256,
      seamPairsSha256: snapshot.bindings.seamPairsSha256,
      pinnedVertexIndicesSha256: snapshot.bindings.pinnedVertexIndicesSha256,
      bodyPositionsRawSha256: snapshot.bindings.bodyPositionsRawSha256,
      bodyTrianglesRawSha256: snapshot.bindings.bodyTrianglesRawSha256,
      runnerReportCanonicalSha256: result.report.seal.canonicalSha256,
      finalPositionsInvMassKgSha256,
      finalPositions3MSha256,
      finalCollisionContentFingerprintSha256:
        result.report.bindings.finalCollisionContentFingerprintSha256,
      diagnosticSnapshotSha256: diagnosticSnapshot.canonicalSha256,
    });
    const stablePayload = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_16_FRAME_CONTACT_CANDIDATE_V1,
      bindings: objectFreeze({
        ...bindings,
        runnerReportCanonicalSha256: undefined,
      }),
      preGpuParity,
      diagnosticSnapshot,
      runner: objectFreeze({
        status: result.report.status,
        decision: result.report.decision,
        bindings: objectFreeze({
          ...result.report.bindings,
        }),
        config: result.report.config,
        workload: result.report.workload,
        observations: result.report.observations,
        quality: result.report.quality,
        collision: result.report.collision,
        selfOrientation: result.report.selfOrientation,
        blockers: result.report.blockers,
        cleanup: result.report.cleanup,
        claims: result.report.claims,
      }),
    });
    const stableEvidence = objectFreeze({
      canonicalSha256: await payloadSha256(
        'beta-skirt-canonical-medium-saved-webgpu-16-frame-candidate-stable-evidence-v1',
        stablePayload,
      ),
      excludesRunnerTimingAndVolatileRunnerSeal: true as const,
    });
    const claims = objectFreeze({
      ...BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_16_FRAME_CANDIDATE_AUTHENTICITY_V1,
      unchanged16FrameRunnerExecuted: true as const,
      exactFinalVec4IndependentlyHashed: true as const,
      exactFinalVec3MatchesRunnerReceipt: true as const,
      exactActualBodyPostgateClear: true as const,
      savedInitialStateMatchesFrozenCanonical: false as const,
      frozen32FrameV3ReuseEligible: false as const,
      postFrameSelfOrientationEvaluated: false as const,
      collisionAuthority: false as const,
      runtimeAuthority: false as const,
      fitAuthority: false as const,
      productionAuthority: false as const,
    });
    const blockers = objectFreeze([
      'post-frame-self-orientation-not-evaluated',
      'saved-input-requires-additive-32-frame-v4',
      'settle-and-fit-authority-not-established',
      'production-qualification-not-run',
    ] as const);
    const reportPayload = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_16_FRAME_CONTACT_CANDIDATE_V1,
      status: 'saved-dxf-16-frame-contact-clear-diagnostic' as const,
      decision: 'PASS_SAVED_DXF_16_FRAME_EXACT_BODY_CONTACT_AND_POSTGATE' as const,
      bindings,
      preGpuParity,
      diagnosticSnapshot,
      stableEvidence,
      claims,
      blockers,
    });
    const candidate = objectFreeze({
      ...reportPayload,
      seal: objectFreeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: await payloadSha256(
          'beta-skirt-canonical-medium-saved-webgpu-16-frame-contact-candidate-v1',
          reportPayload,
        ),
        authority: 'unsigned-structural-saved-content-candidate-only' as const,
      }),
    }) satisfies BetaSkirtCanonicalMediumSavedWebgpu16FrameContactCandidateV1;
    assertNotAborted(options.signal);
    return objectFreeze({
      preGpuParity,
      runnerOwner: result.owner,
      runnerReport: result.report,
      candidate,
    });
  } catch (error) {
    disposeBetaSkirtCanonicalMediumWebgpu16FrameContactV2(result.owner);
    throw error;
  }
}

export async function createBetaSkirtCanonicalMediumSavedWebgpu16FramePreviewV1(
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  canvas: HTMLCanvasElement,
): Promise<BetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewSessionV2> {
  return createBetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewV2(
    canvas,
    runtimeSourceOwner,
    runnerOwner,
  );
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu16FrameRunnerV1(owner: unknown): boolean {
  return disposeBetaSkirtCanonicalMediumWebgpu16FrameContactV2(owner);
}
