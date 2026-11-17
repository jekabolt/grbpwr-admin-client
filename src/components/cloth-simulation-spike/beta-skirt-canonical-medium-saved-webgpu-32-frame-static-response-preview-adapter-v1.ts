import * as THREE from 'three';

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

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_PREVIEW_ADAPTER_REPORT_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-preview-adapter-report/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_PREVIEW_LABEL_V1 =
  'SAVED DXF · 32-FRAME STATIC-RESPONSE CANDIDATE · DISPLAY ONLY · NOT CONTINUED · NOT SETTLED · NOT FIT' as const;

const BODY_VERTEX_COUNT = 13_380 as const;
const BODY_TRIANGLE_COUNT = 26_756 as const;
const GARMENT_VERTEX_COUNT = 580 as const;
const GARMENT_TRIANGLE_COUNT = 912 as const;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const SHA256 = /^[0-9a-f]{64}$/u;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototypeIsPrototypeOf = Object.prototype.isPrototypeOf;
const capturedArrayFrom = Array.from;
const capturedArrayIncludes = Array.prototype.includes;
const capturedArrayJoin = Array.prototype.join;
const capturedJsonStringify = JSON.stringify.bind(JSON);
const capturedRegExpTest = RegExp.prototype.test;
const capturedReflectApply = Reflect.apply;
const capturedStringSlice = String.prototype.slice;
const capturedUint8Set = Uint8Array.prototype.set;
const capturedNumberIsFinite = Number.isFinite;
const capturedMathMax = Math.max;
const capturedMathTan = Math.tan;
const capturedDataViewSetFloat32 = objectGetOwnPropertyDescriptor(
  DataView.prototype,
  'setFloat32',
)?.value;
const capturedDataViewSetUint32 = objectGetOwnPropertyDescriptor(
  DataView.prototype,
  'setUint32',
)?.value;
const capturedCanvasPrototype =
  typeof HTMLCanvasElement === 'undefined' ? null : HTMLCanvasElement.prototype;
const capturedTextEncoder = new TextEncoder();
const capturedTextEncode = TextEncoder.prototype.encode;
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest;
const arrayBufferPrototype = ArrayBuffer.prototype;
const CapturedDataView = DataView;
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const HEX = objectFreeze(
  capturedArrayFrom({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')),
);

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewAdapterReportV1 =
  Readonly<{
    schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_PREVIEW_ADAPTER_REPORT_V1;
    status: 'structural-saved-32-frame-static-response-preview-ready';
    decision: 'RENDERED_EXACT_SAVED_32_FRAME_STATIC_RESPONSE_CANDIDATE_WITHOUT_CONTINUATION_AUTHORITY';
    label: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_PREVIEW_LABEL_V1;
    renderer: 'three-webgl-exact-saved32-static-response-candidate-preview';
    bindings: Readonly<{
      runtimeSourceCanonicalSha256: string;
      runtimeReportCanonicalSha256: string;
      staticResponseStableEvidenceSha256: string;
      staticResponseReportCanonicalSha256: string;
      actualBodyCollisionInputSha256: string;
      bodyPositions3MSha256: string;
      bodyTrianglesSha256: string;
      candidateCurrentPositionsInvMassKgSha256: string;
      candidateCurrentPositions3MSha256: string;
      candidatePreviousPositionsInvMassKgSha256: string;
      normalizedTopologySha256: string;
      candidateBodyCollisionContentFingerprintSha256: string;
      candidateContactLocusAggregateSha256: string;
      renderedGarmentPositions3MSha256: string;
    }>;
    counts: Readonly<{
      sourceFrameCount: 32;
      bodyVertexCount: typeof BODY_VERTEX_COUNT;
      bodyTriangleCount: typeof BODY_TRIANGLE_COUNT;
      garmentVertexCount: typeof GARMENT_VERTEX_COUNT;
      garmentTriangleCount: typeof GARMENT_TRIANGLE_COUNT;
      correctedVertexCount: number;
    }>;
    response: Readonly<{
      maximumCorrectionM: number;
      maximumCarrierGapBeforeM: number;
      maximumCarrierGapAfterM: number;
      postResponseBodyClear: true;
      postResponseResidualSelfContactCount: 0;
      postResponseNormalReversalCount: 0;
      postResponseSweptBodyClear: true;
    }>;
    stableEvidence: Readonly<{
      canonicalSha256: string;
      excludesVolatileStaticResponseReportSeal: true;
    }>;
    remainingBlockers: readonly [
      'outer-saved-wrapper-authentication-not-established-by-structural-adapter',
      'exact-frame-continuation-not-executed',
      'rehydrated-next-frame-parity-not-proven',
      'settle-fit-runtime-production-authority-not-established',
    ];
    claims: Readonly<{
      genuineSavedRuntimeWrapperAuthenticated: false;
      privateBaseRuntimeAndStaticResponseOwnersRequired: true;
      inputOwnersReturnedByAdapter: false;
      bothInputOwnersRevalidatedAcrossAsyncBoundaries: true;
      exactActualBodyRendered: true;
      exactStaticResponseCandidateRendered: true;
      sourceAndCandidatePositionHashesDiffer: true;
      copiedThreeResourcesSurviveUpstreamOwnerDisposal: true;
      visiblePlainPreviewRendered: true;
      strainValuesRendered: false;
      candidateUploadedToGpu: false;
      exactFrameContinuationExecuted: false;
      rehydratedNextFrameParityProven: false;
      selfIntersectionAuthority: false;
      collisionAuthority: false;
      settleCleared: false;
      fitAuthority: false;
      runtimeAuthority: false;
      productionAuthority: false;
    }>;
    seal: Readonly<{
      algorithm: 'SHA-256';
      canonicalSha256: string;
      authority: 'unsigned-structural-saved-32-frame-static-response-visible-preview-only';
    }>;
  }>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewSessionV1 = Readonly<{
  report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewAdapterReportV1;
  dispose(): boolean;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewAdapterResultV1 =
  | Readonly<{
      ok: true;
      session: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewSessionV1;
      report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewAdapterReportV1;
    }>
  | Readonly<{
      ok: false;
      code:
        | 'invalid-canvas'
        | 'source-owner-unavailable'
        | 'static-response-owner-unavailable'
        | 'binding-mismatch'
        | 'sha256-unavailable'
        | 'render-failed';
      detail: string;
    }>;

type AdapterErrorCode = Exclude<
  BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewAdapterResultV1,
  { ok: true }
>['code'];

type LiveInputs = Readonly<{
  runtime: BetaSkirtCanonicalMediumWebgpuRuntimeSourceProjectionV1;
  response: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseProjectionV1;
  runtimeProjectionCanonicalSha256: string;
  responseProjectionCanonicalSha256: string;
}>;

class StaticResponsePreviewAdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    detail: string,
  ) {
    super(capturedReflectApply(capturedStringSlice, detail, [0, 2_048]) as string);
  }
}

function fail(code: AdapterErrorCode, detail: string): never {
  throw new StaticResponsePreviewAdapterError(code, detail);
}

function regexTest(pattern: RegExp, value: string): boolean {
  return capturedReflectApply(capturedRegExpTest, pattern, [value]) as boolean;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && regexTest(SHA256, value);
}

function isRealCanvas(value: unknown): value is HTMLCanvasElement {
  return (
    capturedCanvasPrototype !== null &&
    value !== null &&
    typeof value === 'object' &&
    (capturedReflectApply(objectPrototypeIsPrototypeOf, capturedCanvasPrototype, [
      value,
    ]) as boolean)
  );
}

function bytesEqual(left: ArrayBufferView, right: ArrayBufferView): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new CapturedUint8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new CapturedUint8Array(right.buffer, right.byteOffset, right.byteLength);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

function positions3(positions4: Float32Array): Float32Array {
  const output = new CapturedFloat32Array((positions4.length / 4) * 3);
  for (let vertex = 0; vertex < positions4.length / 4; vertex += 1) {
    output[vertex * 3] = positions4[vertex * 4]!;
    output[vertex * 3 + 1] = positions4[vertex * 4 + 1]!;
    output[vertex * 3 + 2] = positions4[vertex * 4 + 2]!;
  }
  return output;
}

function float32LeBytes(values: Float32Array): Uint8Array<ArrayBuffer> {
  if (!capturedDataViewSetFloat32) fail('sha256-unavailable', 'Float32LE writer is unavailable.');
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    capturedReflectApply(capturedDataViewSetFloat32, view, [index * 4, values[index]!, true]);
  return bytes;
}

function uint32LeBytes(values: Uint32Array): Uint8Array<ArrayBuffer> {
  if (!capturedDataViewSetUint32) fail('sha256-unavailable', 'Uint32LE writer is unavailable.');
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    capturedReflectApply(capturedDataViewSetUint32, view, [index * 4, values[index]!, true]);
  return bytes;
}

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || typeof capturedDigest !== 'function')
    fail('sha256-unavailable', 'Native SHA-256 is unavailable.');
  const copy = new CapturedUint8Array(bytes.byteLength);
  capturedReflectApply(capturedUint8Set, copy, [bytes]);
  const digest = (await capturedReflectApply(capturedDigest, capturedSubtle, [
    'SHA-256',
    copy,
  ])) as ArrayBuffer;
  if (objectGetPrototypeOf(digest) !== arrayBufferPrototype || digest.byteLength !== 32)
    fail('sha256-unavailable', 'Native SHA-256 returned invalid bytes.');
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
    fail('sha256-unavailable', 'SHA-256 empty-message KAT failed.');
  if ((await digestText('abc')) !== ABC_SHA256)
    fail('sha256-unavailable', 'SHA-256 abc KAT failed.');
}

async function payloadSha256(domain: string, payload: unknown): Promise<string> {
  return digestText(`${domain}\0${capturedJsonStringify(payload)}`);
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
      'A live private saved32 static-response owner is required.',
    );
  return objectFreeze({
    runtime,
    response,
    runtimeProjectionCanonicalSha256: runtime.reportCanonicalSha256,
    responseProjectionCanonicalSha256: response.reportCanonicalSha256,
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
    response.reportCanonicalSha256 === witness.responseProjectionCanonicalSha256
  );
}

function assertInputsStillMatch(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  witness: LiveInputs,
  boundary: string,
): void {
  if (!inputsStillMatch(runtimeOwner, responseOwner, witness))
    fail('binding-mismatch', `Saved32 static-response preview owners drifted ${boundary}.`);
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
    runtimeReport.counts.bodyVertexCount !== BODY_VERTEX_COUNT ||
    runtimeReport.counts.bodyTriangleCount !== BODY_TRIANGLE_COUNT ||
    runtimeReport.counts.garmentVertexCount !== GARMENT_VERTEX_COUNT ||
    runtimeReport.counts.garmentTriangleCount !== GARMENT_TRIANGLE_COUNT ||
    runtimeReport.claims.exactActualBodyCollisionInputRetained !== true ||
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
    seamPinW.pinnedCurrentPositionBitMismatchCount !== 0 ||
    seamPinW.pinnedPreviousPositionBitMismatchCount !== 0 ||
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
    responseReport.blockers.length !== 3 ||
    !(capturedReflectApply(capturedArrayIncludes, responseReport.blockers, [
      'exact-frame-continuation-not-executed',
    ]) as boolean) ||
    !(capturedReflectApply(capturedArrayIncludes, responseReport.blockers, [
      'rehydrated-next-frame-parity-not-proven',
    ]) as boolean) ||
    !(capturedReflectApply(capturedArrayIncludes, responseReport.blockers, [
      'settle-fit-runtime-production-authority-not-established',
    ]) as boolean)
  )
    fail('binding-mismatch', 'Static-response report or postgate boundary drifted.');
}

function validateDimensionsAndTopology(witness: LiveInputs): void {
  const body = witness.runtime.collisionInput;
  const response = witness.response;
  const candidateVec3 = positions3(response.candidateCurrentPositionsInvMassKg);
  if (
    body.bodyPositionsM.length !== BODY_VERTEX_COUNT * 3 ||
    body.bodyTriangles.length !== BODY_TRIANGLE_COUNT * 3 ||
    response.candidateCurrentPositionsInvMassKg.length !== GARMENT_VERTEX_COUNT * 4 ||
    response.candidateCurrentPositions3M.length !== GARMENT_VERTEX_COUNT * 3 ||
    response.candidatePreviousPositionsInvMassKg.length !== GARMENT_VERTEX_COUNT * 4 ||
    response.normalizedTriangles.length !== GARMENT_TRIANGLE_COUNT * 3 ||
    !bytesEqual(candidateVec3, response.candidateCurrentPositions3M) ||
    !bytesEqual(witness.runtime.normalizedTriangles, response.normalizedTriangles) ||
    witness.runtime.collisionAuthority !== false ||
    witness.runtime.runtimeAuthority !== false ||
    witness.runtime.fitAuthority !== false ||
    witness.runtime.productionAuthority !== false ||
    response.staticResponseOnly !== true ||
    response.candidateUploadedToGpu !== false ||
    response.exactFrameContinuationAuthority !== false ||
    response.collisionAuthority !== false ||
    response.runtimeAuthority !== false ||
    response.productionAuthority !== false
  )
    fail(
      'binding-mismatch',
      'Saved actual body, candidate positions, or normalized topology drifted.',
    );
  for (let index = 0; index < response.candidateCurrentPositionsInvMassKg.length; index += 1) {
    const value = response.candidateCurrentPositionsInvMassKg[index]!;
    if (!capturedNumberIsFinite(value) || (index % 4 === 3 && value < 0))
      fail('binding-mismatch', 'Static-response candidate contains invalid physical state.');
  }
}

function indexedGeometry(positions: Float32Array, triangles: Uint32Array): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new CapturedFloat32Array(positions), 3),
  );
  geometry.setIndex(new THREE.BufferAttribute(new CapturedUint32Array(triangles), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createThreeSession(
  canvas: HTMLCanvasElement,
  bodyPositions: Float32Array,
  bodyTriangles: Uint32Array,
  candidatePositions: Float32Array,
  candidateTriangles: Uint32Array,
  report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewAdapterReportV1,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewSessionV1 {
  let renderer: THREE.WebGLRenderer | null = null;
  let bodyGeometry: THREE.BufferGeometry | null = null;
  let garmentGeometry: THREE.BufferGeometry | null = null;
  let garmentEdgeGeometry: THREE.BufferGeometry | null = null;
  let bodyMaterial: THREE.MeshStandardMaterial | null = null;
  let garmentMaterial: THREE.MeshPhysicalMaterial | null = null;
  let edgeMaterial: THREE.LineBasicMaterial | null = null;
  let disposed = false;
  const dispose = (): boolean => {
    if (disposed) return false;
    disposed = true;
    renderer?.dispose();
    bodyGeometry?.dispose();
    garmentGeometry?.dispose();
    garmentEdgeGeometry?.dispose();
    bodyMaterial?.dispose();
    garmentMaterial?.dispose();
    edgeMaterial?.dispose();
    return true;
  };
  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f2f2f2');
    bodyGeometry = indexedGeometry(bodyPositions, bodyTriangles);
    garmentGeometry = indexedGeometry(candidatePositions, candidateTriangles);
    garmentEdgeGeometry = new THREE.EdgesGeometry(garmentGeometry, 38);
    bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#bcbcbc',
      roughness: 0.88,
      metalness: 0,
      side: THREE.FrontSide,
    });
    garmentMaterial = new THREE.MeshPhysicalMaterial({
      color: '#d5ab72',
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.03,
      clearcoatRoughness: 0.92,
      side: THREE.DoubleSide,
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.name = 'exact-actual-canonical-measurement-body';
    const garmentMesh = new THREE.Mesh(garmentGeometry, garmentMaterial);
    garmentMesh.name = 'exact-saved-32-frame-static-response-candidate-garment';
    garmentMesh.userData.receiptSha256 = report.seal.canonicalSha256;
    scene.add(bodyMesh, garmentMesh);
    edgeMaterial = new THREE.LineBasicMaterial({
      color: '#202020',
      transparent: true,
      opacity: 0.3,
    });
    scene.add(new THREE.LineSegments(garmentEdgeGeometry, edgeMaterial));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x535353, 2.4));
    const key = new THREE.DirectionalLight(0xffffff, 3.8);
    key.position.set(3.2, 4.4, 4.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.2);
    fill.position.set(-3, 1.8, 2.2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xb8c4ff, 1.2);
    rim.position.set(1.4, 2.4, -4.4);
    scene.add(rim);

    const bodyBounds = new THREE.Box3().setFromObject(bodyMesh);
    const garmentBounds = new THREE.Box3().setFromObject(garmentMesh);
    const bodyCenter = bodyBounds.getCenter(new THREE.Vector3());
    const bodySize = bodyBounds.getSize(new THREE.Vector3());
    const garmentCenter = garmentBounds.getCenter(new THREE.Vector3());
    const width = capturedMathMax(canvas.clientWidth || canvas.width || 960, 640);
    const height = capturedMathMax(canvas.clientHeight || canvas.height || 1_080, 720);
    const aspect = width / height;
    const fovDegrees = 27;
    const halfFov = THREE.MathUtils.degToRad(fovDegrees / 2);
    const distance = capturedMathMax(
      (bodySize.y * 1.06) / (2 * capturedMathTan(halfFov)),
      (bodySize.x * 1.16) / (2 * capturedMathTan(halfFov) * aspect),
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
    renderer.toneMappingExposure = 1.02;
    renderer.render(scene, camera);
    canvas.dataset.staticResponsePreviewReceiptSha256 = report.seal.canonicalSha256;
    canvas.dataset.staticResponsePreviewStableEvidenceSha256 =
      report.stableEvidence.canonicalSha256;
    return objectFreeze({ report, dispose });
  } catch (error) {
    dispose();
    throw error;
  }
}

/**
 * Structural adapter only. A genuine saved wrapper must authenticate both private owners before and
 * after this call and mint the outer genuine receipt. This function never returns an input owner.
 */
export async function createBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewAdapterV1(
  canvas: HTMLCanvasElement,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
): Promise<BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewAdapterResultV1> {
  try {
    if (!isRealCanvas(canvas)) fail('invalid-canvas', 'A real HTML canvas is required.');
    const witness = projectLiveInputs(runtimeOwner, responseOwner);
    validateStructuralReports(runtimeOwner, responseOwner, witness);
    validateDimensionsAndTopology(witness);
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'before digest validation');
    await validateDigestAuthority();
    assertInputsStillMatch(runtimeOwner, responseOwner, witness, 'during digest validation');

    const body = witness.runtime.collisionInput;
    const responseReport = responseOwner.report;
    const [
      bodyPositionsSha,
      bodyTrianglesSha,
      candidateCurrentSha,
      candidateCurrent3Sha,
      candidatePreviousSha,
      topologySha,
    ] = await Promise.all([
      digestBytes(float32LeBytes(body.bodyPositionsM)),
      digestBytes(uint32LeBytes(body.bodyTriangles)),
      digestBytes(float32LeBytes(witness.response.candidateCurrentPositionsInvMassKg)),
      digestBytes(float32LeBytes(witness.response.candidateCurrentPositions3M)),
      digestBytes(float32LeBytes(witness.response.candidatePreviousPositionsInvMassKg)),
      digestBytes(uint32LeBytes(witness.response.normalizedTriangles)),
    ]);
    assertInputsStillMatch(
      runtimeOwner,
      responseOwner,
      witness,
      'while hashing copied render content',
    );
    if (
      candidateCurrentSha !== responseReport.bindings.candidateCurrentPositionsInvMassKgSha256 ||
      candidateCurrent3Sha !== responseReport.bindings.candidateCurrentPositions3MSha256 ||
      candidatePreviousSha !== responseReport.bindings.candidatePreviousPositionsInvMassKgSha256 ||
      topologySha !== responseReport.bindings.normalizedTopologySha256 ||
      topologySha !== runtimeOwner.report.bindings.normalizedTopologySha256
    )
      fail('binding-mismatch', 'Static-response preview content hashes drifted.');
    for (const digest of [
      runtimeOwner.report.seal.canonicalSha256,
      responseReport.seal.canonicalSha256,
      responseReport.stableEvidence.canonicalSha256,
      runtimeOwner.report.bindings.actualBodyCollisionInputSha256,
      responseReport.bindings.candidateBodyCollisionContentFingerprintSha256,
      responseReport.bindings.candidateContactLocusAggregateSha256,
      bodyPositionsSha,
      bodyTrianglesSha,
      candidateCurrentSha,
      candidateCurrent3Sha,
      candidatePreviousSha,
      topologySha,
    ])
      if (!isSha256(digest)) fail('binding-mismatch', 'A preview SHA-256 binding is invalid.');

    const bindings = objectFreeze({
      runtimeSourceCanonicalSha256: witness.runtimeProjectionCanonicalSha256,
      runtimeReportCanonicalSha256: runtimeOwner.report.seal.canonicalSha256,
      staticResponseStableEvidenceSha256: responseReport.stableEvidence.canonicalSha256,
      staticResponseReportCanonicalSha256: witness.responseProjectionCanonicalSha256,
      actualBodyCollisionInputSha256: runtimeOwner.report.bindings.actualBodyCollisionInputSha256,
      bodyPositions3MSha256: bodyPositionsSha,
      bodyTrianglesSha256: bodyTrianglesSha,
      candidateCurrentPositionsInvMassKgSha256: candidateCurrentSha,
      candidateCurrentPositions3MSha256: candidateCurrent3Sha,
      candidatePreviousPositionsInvMassKgSha256: candidatePreviousSha,
      normalizedTopologySha256: topologySha,
      candidateBodyCollisionContentFingerprintSha256:
        responseReport.bindings.candidateBodyCollisionContentFingerprintSha256,
      candidateContactLocusAggregateSha256:
        responseReport.bindings.candidateContactLocusAggregateSha256,
      renderedGarmentPositions3MSha256: candidateCurrent3Sha,
    });
    const counts = objectFreeze({
      sourceFrameCount: 32 as const,
      bodyVertexCount: BODY_VERTEX_COUNT,
      bodyTriangleCount: BODY_TRIANGLE_COUNT,
      garmentVertexCount: GARMENT_VERTEX_COUNT,
      garmentTriangleCount: GARMENT_TRIANGLE_COUNT,
      correctedVertexCount: responseReport.response.response.correctedVertexCount,
    });
    const response = objectFreeze({
      maximumCorrectionM: responseReport.response.response.maximumCorrectionM,
      maximumCarrierGapBeforeM: responseReport.response.response.maximumCarrierGapBeforeM,
      maximumCarrierGapAfterM: responseReport.response.response.maximumCarrierGapAfterM,
      postResponseBodyClear: true as const,
      postResponseResidualSelfContactCount: 0 as const,
      postResponseNormalReversalCount: 0 as const,
      postResponseSweptBodyClear: true as const,
    });
    const remainingBlockers = objectFreeze([
      'outer-saved-wrapper-authentication-not-established-by-structural-adapter',
      'exact-frame-continuation-not-executed',
      'rehydrated-next-frame-parity-not-proven',
      'settle-fit-runtime-production-authority-not-established',
    ] as const);
    const claims = objectFreeze({
      genuineSavedRuntimeWrapperAuthenticated: false as const,
      privateBaseRuntimeAndStaticResponseOwnersRequired: true as const,
      inputOwnersReturnedByAdapter: false as const,
      bothInputOwnersRevalidatedAcrossAsyncBoundaries: true as const,
      exactActualBodyRendered: true as const,
      exactStaticResponseCandidateRendered: true as const,
      sourceAndCandidatePositionHashesDiffer: true as const,
      copiedThreeResourcesSurviveUpstreamOwnerDisposal: true as const,
      visiblePlainPreviewRendered: true as const,
      strainValuesRendered: false as const,
      candidateUploadedToGpu: false as const,
      exactFrameContinuationExecuted: false as const,
      rehydratedNextFrameParityProven: false as const,
      selfIntersectionAuthority: false as const,
      collisionAuthority: false as const,
      settleCleared: false as const,
      fitAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    });
    const stablePayload = objectFreeze({
      schemaVersion:
        BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_PREVIEW_ADAPTER_REPORT_V1,
      status: 'structural-saved-32-frame-static-response-preview-ready' as const,
      decision:
        'RENDERED_EXACT_SAVED_32_FRAME_STATIC_RESPONSE_CANDIDATE_WITHOUT_CONTINUATION_AUTHORITY' as const,
      label: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_PREVIEW_LABEL_V1,
      renderer: 'three-webgl-exact-saved32-static-response-candidate-preview' as const,
      bindings: objectFreeze({
        ...bindings,
        staticResponseReportCanonicalSha256: undefined,
      }),
      counts,
      response,
      remainingBlockers,
      claims,
    });
    const stableEvidence = objectFreeze({
      canonicalSha256: await payloadSha256(
        'beta-skirt-canonical-medium-saved-32-frame-static-response-visible-preview-stable-v1',
        stablePayload,
      ),
      excludesVolatileStaticResponseReportSeal: true as const,
    });
    assertInputsStillMatch(
      runtimeOwner,
      responseOwner,
      witness,
      'while sealing stable preview evidence',
    );
    const reportWithoutSeal = objectFreeze({
      schemaVersion:
        BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_PREVIEW_ADAPTER_REPORT_V1,
      status: 'structural-saved-32-frame-static-response-preview-ready' as const,
      decision:
        'RENDERED_EXACT_SAVED_32_FRAME_STATIC_RESPONSE_CANDIDATE_WITHOUT_CONTINUATION_AUTHORITY' as const,
      label: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_PREVIEW_LABEL_V1,
      renderer: 'three-webgl-exact-saved32-static-response-candidate-preview' as const,
      bindings,
      counts,
      response,
      stableEvidence,
      remainingBlockers,
      claims,
    });
    const report = objectFreeze({
      ...reportWithoutSeal,
      seal: objectFreeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: await payloadSha256(
          'beta-skirt-canonical-medium-saved-32-frame-static-response-visible-preview-adapter-report-v1',
          reportWithoutSeal,
        ),
        authority:
          'unsigned-structural-saved-32-frame-static-response-visible-preview-only' as const,
      }),
    }) satisfies BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponsePreviewAdapterReportV1;
    assertInputsStillMatch(
      runtimeOwner,
      responseOwner,
      witness,
      'before creating copied Three resources',
    );
    const session = createThreeSession(
      canvas,
      new CapturedFloat32Array(body.bodyPositionsM),
      new CapturedUint32Array(body.bodyTriangles),
      new CapturedFloat32Array(witness.response.candidateCurrentPositions3M),
      new CapturedUint32Array(witness.response.normalizedTriangles),
      report,
    );
    return objectFreeze({ ok: true as const, session, report });
  } catch (error) {
    if (error instanceof StaticResponsePreviewAdapterError)
      return objectFreeze({ ok: false as const, code: error.code, detail: error.message });
    const detail =
      error instanceof Error ? error.message : 'Unknown saved32 static-response preview failure.';
    return objectFreeze({
      ok: false as const,
      code: 'render-failed' as const,
      detail: capturedReflectApply(capturedStringSlice, detail, [0, 2_048]) as string,
    });
  }
}
