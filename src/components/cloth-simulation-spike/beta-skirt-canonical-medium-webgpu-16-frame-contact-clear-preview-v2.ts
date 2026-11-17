import * as THREE from 'three';

import {
  projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2,
  type BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
} from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_CONTACT_CLEAR_PREVIEW_V2 =
  'beta-skirt-canonical-medium-webgpu-16-frame-contact-clear-preview/2' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_CONTACT_CLEAR_PREVIEW_LABEL_V2 =
  '16-FRAME WEBGPU · ACTUAL BODY CLEAR · SELF/SETTLE NOT CLEARED · NOT FIT' as const;

const BODY_VERTEX_COUNT = 13_380;
const BODY_TRIANGLE_COUNT = 26_756;
const GARMENT_VERTEX_COUNT = 580;
const GARMENT_TRIANGLE_COUNT = 912;
const PIN_COUNT = 82;
const MINIMUM_SIGNED_CLEARANCE_M = 0.001;
const MAXIMUM_SEAM_GAP_M = 0.001;
const CONTACT_CLEARANCE_MARGIN_F32 = Math.fround(0.002);
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const CapturedDataView = DataView;
const capturedUint8Set = Uint8Array.prototype.set;
const capturedDataViewSetFloat32 = DataView.prototype.setFloat32;
const capturedDataViewSetUint32 = DataView.prototype.setUint32;
const capturedReflectApply = Reflect.apply;
const capturedObjectGetPrototypeOf = Object.getPrototypeOf;
const capturedArrayBufferPrototype = ArrayBuffer.prototype;
const capturedArrayBufferByteLength = Object.getOwnPropertyDescriptor(
  capturedArrayBufferPrototype,
  'byteLength',
)?.get;
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest;
const HEX = Object.freeze(
  Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')),
);
const EXPECTED_REMAINING_BLOCKERS = Object.freeze([
  'post-frame-self-orientation-not-evaluated',
  'post-frame-distortion-acceptance-not-established',
  'anisotropic-bend-collapsed-to-conservative-scalar',
  'visual-material-not-calibrated',
  'settle-fit-authority-not-established',
] as const);

export type BetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewReceiptV2 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_CONTACT_CLEAR_PREVIEW_V2;
  status: 'ready-live-contact-clear-diagnostic';
  label: typeof BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_CONTACT_CLEAR_PREVIEW_LABEL_V2;
  renderer: 'three-webgl-final-contact-clear-diagnostic';
  bindings: Readonly<{
    runtimeSourceCanonicalSha256: string;
    normalizedTopologySha256: string;
    finalPositions3MSha256: string;
    finalCollisionContentFingerprintSha256: string;
    bodyPositions3MSha256: string;
    bodyTrianglesSha256: string;
    contactKernelSourceSha256: string;
  }>;
  counts: Readonly<{
    frameCount: 16;
    bodyVertexCount: 13_380;
    bodyTriangleCount: 26_756;
    garmentVertexCount: 580;
    garmentTriangleCount: 912;
    pinnedVertexCount: 82;
  }>;
  contact: Readonly<{
    clearanceMarginM: number;
    correctedParticleEventCount: number;
    inwardNormalClampEventCount: number;
    maximumCorrectionM: number;
    correctionCapHit: false;
  }>;
  seam: Readonly<{
    finalMaximumGapM: number;
    limitM: 0.001;
    bounded: true;
  }>;
  collision: Readonly<{
    status: 'signed-clearance-measured';
    exactActualBodyGateClear: true;
    bodyGarmentTriangleIntersectionCount: 0;
    minimumSignedClearanceM: number;
    penetratingVertexCount: 0;
    unsafeVertexCount: 0;
    ambiguousSignVertexCount: 0;
  }>;
  remainingBlockers: readonly string[];
  claims: Readonly<{
    exactFinalGpuPositionsRendered: true;
    exactActualBodyRendered: true;
    sourceOrStaticGarmentPositionsUsed: false;
    exactCollisionReplayClear: true;
    selfCollisionCleared: false;
    settleCleared: false;
    collisionAuthority: false;
    fitAuthority: false;
    runtimeAuthority: false;
    productionAuthority: false;
    parityDomainExcludesVolatileRunnerTimingAndSeal: true;
  }>;
}>;

export type BetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewSessionV2 = Readonly<{
  receipt: BetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewReceiptV2;
  dispose(): void;
}>;

type ValidatedPreviewBytes = Readonly<{
  bodyPositionsM: Float32Array;
  bodyTriangles: Uint32Array;
  finalGarmentPositionsM: Float32Array;
  normalizedTriangles: Uint32Array;
  receipt: BetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewReceiptV2;
}>;

type ContactClearBoundaryReport = Readonly<{
  status: string;
  decision: string;
  config: Readonly<{ frameCount: number; contactClearanceMarginM: number }>;
  workload: Readonly<{
    particleCount: number;
    triangleCount: number;
    pinnedParticleCount: number;
    bodyVertexCount: number;
    bodyTriangleCount: number;
  }>;
  execution: Readonly<{
    frameSubmissionCount: number;
    invalidVelocityStateCount: number;
    numericInvalidVelocityStateCount: number;
    outOfDomainVelocityStateCount: number;
    bendInvalidConstraintCount: number;
    continuumNonzeroStatusCount: number;
    contactInvalidParticleCount: number;
    contactDegenerateTriangleVisitCount: number;
    contactOutOfRangeTriangleVisitCount: number;
    contactCorrectionCapHit: boolean;
    validationMessages: readonly string[];
    deviceLossMessages: readonly string[];
  }>;
  observations: Readonly<{
    everyPositionFinite: boolean;
    everyInverseMassBitExact: boolean;
    pinnedParticleCountBitExact: number;
    sourceAndFinalPositionsDiffer: boolean;
    finalHashBoundToCollisionInput: boolean;
    staleSourceCollisionHashRejectedByConstruction: boolean;
    finalMaximumSeamGapM: number;
    seamGapBounded: boolean;
  }>;
  quality: Readonly<{ blockers: readonly string[]; normalReversalCount: number | null }>;
  collision: Readonly<{
    status: string;
    exactActualBodyGateClear: boolean;
    blockers: readonly string[];
    bodyGarmentTriangleIntersectionCount: number | null;
    minimumSignedClearanceM: number | null;
    penetratingVertexCount: number | null;
    unsafeVertexCount: number | null;
    ambiguousSignVertexCount: number | null;
  }>;
  blockers: readonly string[];
  claims: Readonly<{
    exactCanonicalMediumWorkloadExecuted: boolean;
    exactActualBodyCollisionReplayExecuted: boolean;
    exactActualBodyTriangleMeshContactTailExecuted: boolean;
    analyticalCapsulesOrProxiesUsed: boolean;
    collisionAuthority: boolean;
    fitAuthority: boolean;
    runtimeAuthority: boolean;
    productionAuthority: boolean;
  }>;
}>;

function fail(message: string): never {
  throw new Error(`16-frame contact-clear preview rejected: ${message}`);
}

function isSha256(value: string): boolean {
  if (value.length !== 64) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (!((code >= 48 && code <= 57) || (code >= 97 && code <= 102))) return false;
  }
  return true;
}

export function assertBetaSkirtCanonicalMediumWebgpu16FrameContactClearBoundaryV2(
  report: ContactClearBoundaryReport,
): void {
  const collision = report.collision;
  const cleanExecution =
    report.execution.invalidVelocityStateCount === 0 &&
    report.execution.numericInvalidVelocityStateCount === 0 &&
    report.execution.outOfDomainVelocityStateCount === 0 &&
    report.execution.bendInvalidConstraintCount === 0 &&
    report.execution.continuumNonzeroStatusCount === 0 &&
    report.execution.contactInvalidParticleCount === 0 &&
    report.execution.contactDegenerateTriangleVisitCount === 0 &&
    report.execution.contactOutOfRangeTriangleVisitCount === 0 &&
    !report.execution.contactCorrectionCapHit &&
    report.execution.validationMessages.length === 0 &&
    report.execution.deviceLossMessages.length === 0;
  const exactCollisionClear =
    collision.status === 'signed-clearance-measured' &&
    collision.exactActualBodyGateClear &&
    collision.blockers.length === 0 &&
    collision.bodyGarmentTriangleIntersectionCount === 0 &&
    collision.penetratingVertexCount === 0 &&
    collision.unsafeVertexCount === 0 &&
    collision.ambiguousSignVertexCount === 0 &&
    collision.minimumSignedClearanceM !== null &&
    Number.isFinite(collision.minimumSignedClearanceM) &&
    collision.minimumSignedClearanceM >= MINIMUM_SIGNED_CLEARANCE_M;
  let exactRemainingBlockers = report.blockers.length === EXPECTED_REMAINING_BLOCKERS.length;
  for (let index = 0; exactRemainingBlockers && index < report.blockers.length; index += 1)
    exactRemainingBlockers = report.blockers[index] === EXPECTED_REMAINING_BLOCKERS[index];
  if (
    report.status !== 'diagnostic-completed' ||
    report.decision !== 'PASS_16_FRAME_EXACT_BODY_CONTACT_AND_POSTGATE' ||
    report.config.frameCount !== 16 ||
    report.config.contactClearanceMarginM !== CONTACT_CLEARANCE_MARGIN_F32 ||
    report.workload.particleCount !== GARMENT_VERTEX_COUNT ||
    report.workload.triangleCount !== GARMENT_TRIANGLE_COUNT ||
    report.workload.pinnedParticleCount !== PIN_COUNT ||
    report.workload.bodyVertexCount !== BODY_VERTEX_COUNT ||
    report.workload.bodyTriangleCount !== BODY_TRIANGLE_COUNT ||
    report.execution.frameSubmissionCount !== 16 ||
    !cleanExecution ||
    !report.observations.everyPositionFinite ||
    !report.observations.everyInverseMassBitExact ||
    report.observations.pinnedParticleCountBitExact !== PIN_COUNT ||
    !report.observations.sourceAndFinalPositionsDiffer ||
    !report.observations.finalHashBoundToCollisionInput ||
    !report.observations.staleSourceCollisionHashRejectedByConstruction ||
    !report.observations.seamGapBounded ||
    !Number.isFinite(report.observations.finalMaximumSeamGapM) ||
    report.observations.finalMaximumSeamGapM > MAXIMUM_SEAM_GAP_M ||
    report.quality.blockers.length !== 0 ||
    report.quality.normalReversalCount !== 0 ||
    !exactCollisionClear ||
    !exactRemainingBlockers ||
    !report.claims.exactCanonicalMediumWorkloadExecuted ||
    !report.claims.exactActualBodyCollisionReplayExecuted ||
    !report.claims.exactActualBodyTriangleMeshContactTailExecuted ||
    report.claims.analyticalCapsulesOrProxiesUsed ||
    report.claims.collisionAuthority ||
    report.claims.fitAuthority ||
    report.claims.runtimeAuthority ||
    report.claims.productionAuthority
  )
    fail('the ACTUAL BODY CLEAR route received a contradictory blocked/pass receipt.');
}

function copiedBytes(value: ArrayBufferView): Uint8Array<ArrayBuffer> {
  const source = new CapturedUint8Array(value.buffer, value.byteOffset, value.byteLength);
  const copy = new CapturedUint8Array(source.byteLength);
  capturedReflectApply(capturedUint8Set, copy, [source]);
  return copy;
}

function hex(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) result += HEX[bytes[index]!]!;
  return result;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || typeof capturedDigest !== 'function') fail('SHA-256 is unavailable.');
  const digest = (await capturedReflectApply(capturedDigest, capturedSubtle, [
    'SHA-256',
    copiedBytes(bytes),
  ])) as ArrayBuffer;
  if (
    !capturedArrayBufferByteLength ||
    capturedObjectGetPrototypeOf(digest) !== capturedArrayBufferPrototype ||
    capturedReflectApply(capturedArrayBufferByteLength, digest, []) !== 32
  )
    fail('SHA-256 returned an invalid digest.');
  return hex(new CapturedUint8Array(digest));
}

async function validateDigestAuthority(): Promise<void> {
  if ((await sha256(new CapturedUint8Array(0))) !== EMPTY_SHA256)
    fail('SHA-256 known-answer test failed.');
}

function float32LeBytes(values: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    capturedReflectApply(capturedDataViewSetFloat32, view, [index * 4, values[index]!, true]);
  return bytes;
}

function uint32LeBytes(values: Uint32Array): Uint8Array<ArrayBuffer> {
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    capturedReflectApply(capturedDataViewSetUint32, view, [index * 4, values[index]!, true]);
  return bytes;
}

function finitePositions(positions: Float32Array): boolean {
  for (const value of positions) if (!Number.isFinite(value)) return false;
  return true;
}

function validTriangles(triangles: Uint32Array, vertexCount: number): boolean {
  for (const index of triangles) if (index >= vertexCount) return false;
  return true;
}

function uint32ArraysEqual(left: Uint32Array, right: Uint32Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1)
    if (left[index] !== right[index]) return false;
  return true;
}

function positions3MatchPositions4(positions3: Float32Array, positions4: Float32Array): boolean {
  if (positions3.length / 3 !== positions4.length / 4) return false;
  for (let vertex = 0; vertex < positions3.length / 3; vertex += 1)
    for (let component = 0; component < 3; component += 1)
      if (positions3[vertex * 3 + component] !== positions4[vertex * 4 + component]) return false;
  return true;
}

function physicalStateMatches(
  initial: Float32Array,
  final: Float32Array,
  pins: Uint32Array,
): boolean {
  if (initial.length !== final.length || pins.length !== PIN_COUNT) return false;
  const initialBits = new CapturedUint32Array(initial.buffer, initial.byteOffset, initial.length);
  const finalBits = new CapturedUint32Array(final.buffer, final.byteOffset, final.length);
  let zeroCount = 0;
  let positiveCount = 0;
  for (let vertex = 0; vertex < final.length / 4; vertex += 1) {
    if (initialBits[vertex * 4 + 3] !== finalBits[vertex * 4 + 3]) return false;
    const inverseMass = final[vertex * 4 + 3]!;
    if (inverseMass === 0) zeroCount += 1;
    else if (inverseMass > 0 && Number.isFinite(inverseMass)) positiveCount += 1;
    else return false;
  }
  for (const vertex of pins)
    for (let component = 0; component < 4; component += 1)
      if (initialBits[vertex * 4 + component] !== finalBits[vertex * 4 + component]) return false;
  return zeroCount === PIN_COUNT && positiveCount === GARMENT_VERTEX_COUNT - PIN_COUNT;
}

/** Validates live same-realm owners and copies only exact final GPU geometry for rendering. */
export async function validateBetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewOwnersV2(
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
): Promise<ValidatedPreviewBytes> {
  const source = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeSourceOwner);
  if (!source) fail('a live runtime-source owner is required.');
  const finalProjection = projectBetaSkirtCanonicalMediumWebgpu16FrameContactV2(runnerOwner);
  if (!finalProjection) fail('a live contact-clear runner owner is required.');

  const sourceReport = runtimeSourceOwner.report;
  const runnerReport = runnerOwner.report;
  assertBetaSkirtCanonicalMediumWebgpu16FrameContactClearBoundaryV2(runnerReport);
  if (
    source.reportCanonicalSha256 !== sourceReport.seal.canonicalSha256 ||
    runnerReport.bindings.runtimeSourceCanonicalSha256 !== source.reportCanonicalSha256 ||
    runnerReport.bindings.normalizedV5AggregateSha256 !==
      source.normalizedV5.seal.aggregateSha256 ||
    finalProjection.reportCanonicalSha256 !== runnerReport.seal.canonicalSha256
  )
    fail('runner/runtime-source owner binding or seal drifted.');
  for (const digest of [
    runnerReport.seal.canonicalSha256,
    runnerReport.bindings.finalPositions3MSha256,
    runnerReport.bindings.finalCollisionBindingPositionsSha256,
    runnerReport.bindings.finalCollisionContentFingerprintSha256,
    runnerReport.bindings.bodyPositions3MSha256,
    runnerReport.bindings.bodyTrianglesSha256,
    runnerReport.bindings.contactKernelSourceSha256,
  ])
    if (!isSha256(digest)) fail('runner receipt contains an invalid digest.');
  if (
    !runnerReport.cleanup.leaseReleased ||
    !runnerReport.cleanup.sessionDisposed ||
    !runnerReport.cleanup.contextUnconfigured ||
    !runnerReport.cleanup.deviceDestroyed
  )
    fail('the WebGPU runner lifecycle did not close cleanly.');
  if (
    source.collisionAuthority ||
    source.runtimeAuthority ||
    source.fitAuthority ||
    source.productionAuthority ||
    finalProjection.collisionAuthority ||
    finalProjection.runtimeAuthority ||
    finalProjection.fitAuthority ||
    finalProjection.productionAuthority
  )
    fail('an upstream diagnostic authority boundary drifted.');

  const bodyPositionsM = new CapturedFloat32Array(source.collisionInput.bodyPositionsM);
  const bodyTriangles = new CapturedUint32Array(source.collisionInput.bodyTriangles);
  const finalGarmentPositionsM = new CapturedFloat32Array(finalProjection.finalPositions3M);
  const finalPositionsInvMassKg = new CapturedFloat32Array(finalProjection.finalPositionsInvMassKg);
  const normalizedTriangles = new CapturedUint32Array(finalProjection.normalizedTriangles);
  const initialPhysical = new CapturedFloat32Array(source.initialPhysicalPositionsInvMassKg);
  const pins = new CapturedUint32Array(source.pinnedWaistVertexIndices);
  if (
    bodyPositionsM.length !== BODY_VERTEX_COUNT * 3 ||
    bodyTriangles.length !== BODY_TRIANGLE_COUNT * 3 ||
    finalGarmentPositionsM.length !== GARMENT_VERTEX_COUNT * 3 ||
    finalPositionsInvMassKg.length !== GARMENT_VERTEX_COUNT * 4 ||
    normalizedTriangles.length !== GARMENT_TRIANGLE_COUNT * 3 ||
    sourceReport.counts.bodyVertexCount !== BODY_VERTEX_COUNT ||
    sourceReport.counts.bodyTriangleCount !== BODY_TRIANGLE_COUNT
  )
    fail('canonical body or garment topology counts drifted.');
  if (
    source.collisionInput.garmentUniformScale !== 1 ||
    source.collisionInput.garmentTranslationM[0] !== 0 ||
    source.collisionInput.garmentTranslationM[1] !== 0 ||
    source.collisionInput.garmentTranslationM[2] !== 0 ||
    !finitePositions(bodyPositionsM) ||
    !finitePositions(finalGarmentPositionsM) ||
    !validTriangles(bodyTriangles, BODY_VERTEX_COUNT) ||
    !validTriangles(normalizedTriangles, GARMENT_VERTEX_COUNT) ||
    !uint32ArraysEqual(normalizedTriangles, source.normalizedTriangles) ||
    !uint32ArraysEqual(normalizedTriangles, source.collisionInput.garmentTriangles) ||
    !positions3MatchPositions4(finalGarmentPositionsM, finalPositionsInvMassKg) ||
    !physicalStateMatches(initialPhysical, finalPositionsInvMassKg, pins)
  )
    fail('render geometry, topology, coordinate frame, or physical state drifted.');

  await validateDigestAuthority();
  const [finalPositionsSha256, bodyPositionsSha256, bodyTrianglesSha256, topologySha256] =
    await Promise.all([
      sha256(float32LeBytes(finalGarmentPositionsM)),
      sha256(float32LeBytes(bodyPositionsM)),
      sha256(uint32LeBytes(bodyTriangles)),
      sha256(uint32LeBytes(normalizedTriangles)),
    ]);
  if (
    finalPositionsSha256 !== runnerReport.bindings.finalPositions3MSha256 ||
    finalPositionsSha256 !== runnerReport.bindings.finalCollisionBindingPositionsSha256 ||
    finalPositionsSha256 === runnerReport.bindings.sourcePositions3MSha256 ||
    bodyPositionsSha256 !== runnerReport.bindings.bodyPositions3MSha256 ||
    bodyTrianglesSha256 !== runnerReport.bindings.bodyTrianglesSha256 ||
    topologySha256 !== sourceReport.bindings.normalizedTopologySha256
  )
    fail('final garment, body, or topology bytes differ from their bound fingerprints.');

  const collision = runnerReport.collision;
  const receipt = Object.freeze({
    schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_CONTACT_CLEAR_PREVIEW_V2,
    status: 'ready-live-contact-clear-diagnostic' as const,
    label: BETA_SKIRT_CANONICAL_MEDIUM_WEBGPU_16_FRAME_CONTACT_CLEAR_PREVIEW_LABEL_V2,
    renderer: 'three-webgl-final-contact-clear-diagnostic' as const,
    bindings: Object.freeze({
      runtimeSourceCanonicalSha256: source.reportCanonicalSha256,
      normalizedTopologySha256: topologySha256,
      finalPositions3MSha256: finalPositionsSha256,
      finalCollisionContentFingerprintSha256:
        runnerReport.bindings.finalCollisionContentFingerprintSha256,
      bodyPositions3MSha256: bodyPositionsSha256,
      bodyTrianglesSha256,
      contactKernelSourceSha256: runnerReport.bindings.contactKernelSourceSha256,
    }),
    counts: Object.freeze({
      frameCount: 16 as const,
      bodyVertexCount: BODY_VERTEX_COUNT,
      bodyTriangleCount: BODY_TRIANGLE_COUNT,
      garmentVertexCount: GARMENT_VERTEX_COUNT,
      garmentTriangleCount: GARMENT_TRIANGLE_COUNT,
      pinnedVertexCount: PIN_COUNT,
    }),
    contact: Object.freeze({
      clearanceMarginM: runnerReport.config.contactClearanceMarginM,
      correctedParticleEventCount: runnerReport.execution.contactCorrectedParticleEventCount,
      inwardNormalClampEventCount: runnerReport.execution.contactInwardNormalClampEventCount,
      maximumCorrectionM: runnerReport.execution.contactMaximumCorrectionM,
      correctionCapHit: false as const,
    }),
    seam: Object.freeze({
      finalMaximumGapM: runnerReport.observations.finalMaximumSeamGapM,
      limitM: MAXIMUM_SEAM_GAP_M,
      bounded: true as const,
    }),
    collision: Object.freeze({
      status: 'signed-clearance-measured' as const,
      exactActualBodyGateClear: true as const,
      bodyGarmentTriangleIntersectionCount: 0 as const,
      minimumSignedClearanceM: collision.minimumSignedClearanceM!,
      penetratingVertexCount: 0 as const,
      unsafeVertexCount: 0 as const,
      ambiguousSignVertexCount: 0 as const,
    }),
    remainingBlockers: Object.freeze([
      'post-frame-self-orientation-not-evaluated',
      'post-frame-distortion-acceptance-not-established',
      'anisotropic-bend-collapsed-to-conservative-scalar',
      'visual-material-not-calibrated',
      'settle-fit-authority-not-established',
    ]),
    claims: Object.freeze({
      exactFinalGpuPositionsRendered: true as const,
      exactActualBodyRendered: true as const,
      sourceOrStaticGarmentPositionsUsed: false as const,
      exactCollisionReplayClear: true as const,
      selfCollisionCleared: false as const,
      settleCleared: false as const,
      collisionAuthority: false as const,
      fitAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
      parityDomainExcludesVolatileRunnerTimingAndSeal: true as const,
    }),
  }) satisfies BetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewReceiptV2;

  return Object.freeze({
    bodyPositionsM,
    bodyTriangles,
    finalGarmentPositionsM,
    normalizedTriangles,
    receipt,
  });
}

function geometry(positions: Float32Array, triangles: Uint32Array): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  result.setIndex(new THREE.BufferAttribute(triangles, 1));
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** Renders copied final GPU bytes; it never owns or substitutes either upstream owner. */
export async function createBetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewV2(
  canvas: HTMLCanvasElement,
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runnerOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
): Promise<BetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewSessionV2> {
  if (!(canvas instanceof HTMLCanvasElement))
    throw new TypeError('A real display canvas is required.');
  const validated = await validateBetaSkirtCanonicalMediumWebgpu16FrameContactClearPreviewOwnersV2(
    runtimeSourceOwner,
    runnerOwner,
  );

  let renderer: THREE.WebGLRenderer | null = null;
  let bodyGeometry: THREE.BufferGeometry | null = null;
  let garmentGeometry: THREE.BufferGeometry | null = null;
  let garmentEdges: THREE.EdgesGeometry | null = null;
  let bodyMaterial: THREE.MeshStandardMaterial | null = null;
  let garmentMaterial: THREE.MeshPhysicalMaterial | null = null;
  let edgeMaterial: THREE.LineBasicMaterial | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer?.dispose();
    bodyGeometry?.dispose();
    garmentGeometry?.dispose();
    garmentEdges?.dispose();
    bodyMaterial?.dispose();
    garmentMaterial?.dispose();
    edgeMaterial?.dispose();
  };

  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f2f2f2');
    bodyGeometry = geometry(validated.bodyPositionsM, validated.bodyTriangles);
    garmentGeometry = geometry(validated.finalGarmentPositionsM, validated.normalizedTriangles);
    bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#bcbcbc',
      roughness: 0.88,
      metalness: 0,
      side: THREE.FrontSide,
    });
    garmentMaterial = new THREE.MeshPhysicalMaterial({
      color: '#0f7a34',
      roughness: 0.7,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.85,
      side: THREE.DoubleSide,
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.name = 'exact-actual-canonical-measurement-body';
    const garmentMesh = new THREE.Mesh(garmentGeometry, garmentMaterial);
    garmentMesh.name = 'exact-final-contact-clear-16-frame-webgpu-garment';
    garmentMesh.userData.finalPositionsSha256 = validated.receipt.bindings.finalPositions3MSha256;
    scene.add(bodyMesh, garmentMesh);

    garmentEdges = new THREE.EdgesGeometry(garmentGeometry, 38);
    edgeMaterial = new THREE.LineBasicMaterial({
      color: '#052d13',
      transparent: true,
      opacity: 0.5,
    });
    scene.add(new THREE.LineSegments(garmentEdges, edgeMaterial));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x535353, 2.65));
    const key = new THREE.DirectionalLight(0xffffff, 4.1);
    key.position.set(3.2, 4.4, 4.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.35);
    fill.position.set(-3, 1.8, 2.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xb8c4ff, 1.3);
    rim.position.set(1.4, 2.4, -4.4);
    scene.add(rim);

    const bodyBounds = new THREE.Box3().setFromObject(bodyMesh);
    const garmentBounds = new THREE.Box3().setFromObject(garmentMesh);
    const bodyCenter = bodyBounds.getCenter(new THREE.Vector3());
    const bodySize = bodyBounds.getSize(new THREE.Vector3());
    const garmentCenter = garmentBounds.getCenter(new THREE.Vector3());
    const width = Math.max(canvas.clientWidth || canvas.width || 960, 640);
    const height = Math.max(canvas.clientHeight || canvas.height || 1_080, 720);
    const aspect = width / height;
    const fovDegrees = 27;
    const halfFov = THREE.MathUtils.degToRad(fovDegrees / 2);
    const distance = Math.max(
      (bodySize.y * 1.06) / (2 * Math.tan(halfFov)),
      (bodySize.x * 1.16) / (2 * Math.tan(halfFov) * aspect),
    );
    const camera = new THREE.PerspectiveCamera(fovDegrees, aspect, 0.01, 12);
    const target = bodyCenter.clone().lerp(garmentCenter, 0.2);
    camera.position.set(target.x + 0.1, target.y + 0.02, target.z + distance * 1.03);
    camera.lookAt(target);

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.render(scene, camera);
    return Object.freeze({ receipt: validated.receipt, dispose });
  } catch (error) {
    dispose();
    throw error;
  }
}
