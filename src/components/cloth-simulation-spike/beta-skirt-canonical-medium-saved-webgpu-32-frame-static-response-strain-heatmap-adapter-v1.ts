import * as THREE from 'three';

import {
  buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1,
  type BetaSkirtCanonicalMediumStrainHeatmapGeometryV1,
} from './beta-skirt-canonical-medium-webgpu-16-frame-strain-heatmap-preview-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainV1,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOwnerV1,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainProjectionV1,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-strain-utilization-v1';
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

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_HEATMAP_ADAPTER_REPORT_V1 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-strain-heatmap-adapter-report/1' as const;
export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_HEATMAP_LABEL_V1 =
  'SAVED DXF · 32-FRAME D424 STATIC-RESPONSE CANDIDATE · FRESH D428 DIMENSIONLESS STRAIN UTILIZATION · PROVISIONAL / NOT Pa · NOT FAILURE · NOT CONTINUED · NOT SETTLED · NOT FIT' as const;

const BODY_VERTEX_COUNT = 13_380 as const;
const BODY_TRIANGLE_COUNT = 26_756 as const;
const GARMENT_VERTEX_COUNT = 580 as const;
const GARMENT_TRIANGLE_COUNT = 912 as const;
const RENDERED_FACE_VERTEX_COUNT = 2_736 as const;
const VALUE_STRIDE = 4 as const;
const DISPLAY_CLAMP_MAXIMUM = 2 as const;
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const SHA256 = /^[0-9a-f]{64}$/u;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototypeIsPrototypeOf = Object.prototype.isPrototypeOf;
const capturedArrayFrom = Array.from;
const capturedArrayJoin = Array.prototype.join;
const capturedRegExpTest = RegExp.prototype.test;
const capturedStringSlice = String.prototype.slice;
const capturedReflectApply = Reflect.apply;
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
const arrayBufferPrototype = ArrayBuffer.prototype;
const capturedCanvasPrototype =
  typeof HTMLCanvasElement === 'undefined' ? null : HTMLCanvasElement.prototype;
const CapturedFloat32Array = Float32Array;
const CapturedUint8Array = Uint8Array;
const CapturedUint32Array = Uint32Array;
const CapturedDataView = DataView;
const capturedJsonStringify = JSON.stringify.bind(JSON);
const capturedTextEncoder = new TextEncoder();
const capturedTextEncode = TextEncoder.prototype.encode;
const capturedSubtle = globalThis.crypto?.subtle;
const capturedDigest = capturedSubtle?.digest;
const HEX = objectFreeze(
  capturedArrayFrom({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0')),
);

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterReportV1 =
  Readonly<{
    schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_HEATMAP_ADAPTER_REPORT_V1;
    status: 'structural-saved-32-frame-static-response-visible-strain-heatmap-ready';
    decision: 'RENDERED_EXACT_D424_STATIC_RESPONSE_CANDIDATE_WITH_FRESH_D428_DIMENSIONLESS_STRAIN_AND_DOWNSTREAM_BLOCKERS';
    label: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_HEATMAP_LABEL_V1;
    renderer: 'three-webgl-exact-saved32-static-response-face-owned-strain-heatmap';
    bindings: Readonly<{
      runtimeSourceCanonicalSha256: string;
      runtimeReportCanonicalSha256: string;
      normalizedV5AggregateSha256: string;
      staticResponseStableEvidenceSha256: string;
      staticResponseReportCanonicalSha256: string;
      correctedStrainStableEvidenceSha256: string;
      correctedStrainReportCanonicalSha256: string;
      actualBodyCollisionInputSha256: string;
      bodyPositions3MSha256: string;
      bodyTrianglesSha256: string;
      candidateCurrentPositionsInvMassKgSha256: string;
      candidateCurrentPositions3MSha256: string;
      candidatePreviousPositionsInvMassKgSha256: string;
      normalizedTopologySha256: string;
      strainValuesFloat32LeSha256: string;
      strainValidityFlagsUint32LeSha256: string;
      strainOutputEnvelopeSha256: string;
      strainKernelSourceSha256: string;
      strainProvisionalLimitsSha256: string;
      strainColorLutSha256: string;
      renderedNonIndexedPositionsFloat32LeSha256: string;
      renderedVertexColorsFloat32LeSha256: string;
    }>;
    counts: Readonly<{
      sourceFrameCount: 32;
      bodyVertexCount: typeof BODY_VERTEX_COUNT;
      bodyTriangleCount: typeof BODY_TRIANGLE_COUNT;
      garmentVertexCount: typeof GARMENT_VERTEX_COUNT;
      garmentTriangleCount: typeof GARMENT_TRIANGLE_COUNT;
      renderedFaceVertexCount: typeof RENDERED_FACE_VERTEX_COUNT;
      correctedVertexCount: number;
      validStrainTriangleCount: typeof GARMENT_TRIANGLE_COUNT;
      invalidStrainTriangleCount: 0;
    }>;
    response: Readonly<{
      maximumCorrectionM: number;
      postResponseBodyClear: true;
      postResponseResidualSelfContactCount: 0;
      postResponseNormalReversalCount: 0;
      postResponseSweptBodyClear: true;
      exactFrameContinuationExecuted: false;
      rehydratedNextFrameParityProven: false;
    }>;
    visualization: Readonly<{
      quantity: 'normalized-green-strain-utilization';
      units: 'dimensionless';
      interpolation: 'linear-srgb-face-owned';
      displayClampMinimum: 0;
      displayClampMaximum: typeof DISPLAY_CLAMP_MAXIMUM;
      topLegendLabel: '≥2 provisional utilization';
      minimumUtilization: number;
      maximumUtilization: number;
      triangleCountAtOrAboveDisplayClamp: number;
      triangleCountAtOrAboveFourTimesProvisionalLimit: number;
      disclaimer: 'Dimensionless provisional strain visualization only; not physical stress, Pa, material failure, or fit.';
    }>;
    stableEvidence: Readonly<{
      canonicalSha256: string;
      excludesVolatileStaticResponseAndCorrectedStrainReportSeals: true;
    }>;
    remainingBlockers: readonly [
      'outer-saved-wrapper-authentication-not-established-by-structural-adapter',
      'exact-frame-continuation-not-executed',
      'rehydrated-next-frame-parity-not-proven',
      'material-visualization-thresholds-provisional-and-uncalibrated',
      'physical-stress-and-pa-not-computed',
      'material-failure-not-evaluated',
      'settle-fit-runtime-production-authority-not-established',
    ];
    claims: Readonly<{
      genuineSavedRuntimeWrapperAuthenticated: false;
      privateBaseRuntimeStaticResponseAndCorrectedStrainOwnersRequired: true;
      inputOwnersReturnedByAdapter: false;
      allThreeInputOwnersRevalidatedAcrossAsyncBoundaries: true;
      exactActualBodyRendered: true;
      exactD424StaticResponseCandidateRendered: true;
      exactD428FreshCorrectedTriangleStrainValuesRendered: true;
      preResponseD420OutputReused: false;
      faceOwnedColorsPreventCrossTriangleInterpolation: true;
      copiedThreeResourcesSurviveUpstreamOwnerDisposal: true;
      visibleHeatmapRendered: true;
      dimensionlessStrainUtilizationOnly: true;
      d424StaticPostgatesMeasuredClear: true;
      candidateUploadedToGpuForFrameContinuation: false;
      exactFrameContinuationExecuted: false;
      rehydratedNextFrameParityProven: false;
      physicalStressOrPaRendered: false;
      materialFailureRendered: false;
      settleCleared: false;
      fitAuthority: false;
      runtimeAuthority: false;
      productionAuthority: false;
    }>;
    seal: Readonly<{
      algorithm: 'SHA-256';
      canonicalSha256: string;
      authority: 'unsigned-structural-saved-32-frame-static-response-visible-strain-heatmap-only';
    }>;
  }>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapSessionV1 =
  Readonly<{
    report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterReportV1;
    dispose(): boolean;
  }>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterResultV1 =
  | Readonly<{
      ok: true;
      session: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapSessionV1;
      report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterReportV1;
    }>
  | Readonly<{
      ok: false;
      code:
        | 'invalid-canvas'
        | 'source-owner-unavailable'
        | 'static-response-owner-unavailable'
        | 'corrected-strain-owner-unavailable'
        | 'binding-mismatch'
        | 'sha256-unavailable'
        | 'render-failed';
      detail: string;
    }>;

type AdapterErrorCode = Exclude<
  BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterResultV1,
  { ok: true }
>['code'];

type LiveInputs = Readonly<{
  runtime: BetaSkirtCanonicalMediumWebgpuRuntimeSourceProjectionV1;
  response: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseProjectionV1;
  strain: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainProjectionV1;
  runtimeProjectionCanonicalSha256: string;
  responseProjectionCanonicalSha256: string;
  strainProjectionCanonicalSha256: string;
  runtimeNormalizedV5AggregateSha256: string;
}>;

class CorrectedHeatmapAdapterError extends Error {
  constructor(
    readonly code: AdapterErrorCode,
    detail: string,
  ) {
    super(capturedReflectApply(capturedStringSlice, detail, [0, 2_048]) as string);
  }
}

function fail(code: AdapterErrorCode, detail: string): never {
  throw new CorrectedHeatmapAdapterError(code, detail);
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
  if (positions4.length % 4 !== 0)
    fail('binding-mismatch', 'Static-response candidate vec4 length is invalid.');
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

function outputEnvelope(values: Float32Array, flags: Uint32Array): Uint8Array<ArrayBuffer> {
  const valueBytes = float32LeBytes(values);
  const flagBytes = uint32LeBytes(flags);
  const output = new CapturedUint8Array(valueBytes.byteLength + flagBytes.byteLength);
  capturedReflectApply(capturedUint8Set, output, [valueBytes, 0]);
  capturedReflectApply(capturedUint8Set, output, [flagBytes, valueBytes.byteLength]);
  return output;
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
  strainOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOwnerV1,
): LiveInputs {
  const runtime = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  if (!runtime) fail('source-owner-unavailable', 'A live private base runtime owner is required.');
  const response = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1(responseOwner);
  if (!response)
    fail(
      'static-response-owner-unavailable',
      'A live private D-424 static-response owner is required.',
    );
  const strain =
    projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainV1(strainOwner);
  if (!strain)
    fail(
      'corrected-strain-owner-unavailable',
      'A live private D-428 corrected strain owner is required.',
    );
  return objectFreeze({
    runtime,
    response,
    strain,
    runtimeProjectionCanonicalSha256: runtime.reportCanonicalSha256,
    responseProjectionCanonicalSha256: response.reportCanonicalSha256,
    strainProjectionCanonicalSha256: strain.reportCanonicalSha256,
    runtimeNormalizedV5AggregateSha256: runtime.normalizedV5.seal.aggregateSha256,
  });
}

function inputsStillMatch(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  strainOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOwnerV1,
  witness: LiveInputs,
): boolean {
  const runtime = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  const response = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1(responseOwner);
  const strain =
    projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainV1(strainOwner);
  return (
    runtime !== null &&
    response !== null &&
    strain !== null &&
    runtime.reportCanonicalSha256 === witness.runtimeProjectionCanonicalSha256 &&
    response.reportCanonicalSha256 === witness.responseProjectionCanonicalSha256 &&
    strain.reportCanonicalSha256 === witness.strainProjectionCanonicalSha256 &&
    runtime.normalizedV5.seal.aggregateSha256 === witness.runtimeNormalizedV5AggregateSha256
  );
}

function assertInputsStillMatch(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  strainOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOwnerV1,
  witness: LiveInputs,
  boundary: string,
): void {
  if (!inputsStillMatch(runtimeOwner, responseOwner, strainOwner, witness))
    fail('binding-mismatch', `Corrected saved32 heatmap owners drifted ${boundary}.`);
}

function validateStructuralReports(
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  strainOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOwnerV1,
  witness: LiveInputs,
): void {
  const runtimeReport = runtimeOwner.report;
  const responseReport = responseOwner.report;
  const strainReport = strainOwner.report;
  if (
    runtimeReport.status !== 'diagnostic-source-ready' ||
    runtimeReport.decision !== 'PASS_CONTENT_BOUND_WEBGPU_RUNTIME_SOURCE' ||
    runtimeReport.seal.canonicalSha256 !== witness.runtimeProjectionCanonicalSha256 ||
    runtimeReport.bindings.normalizedV5AggregateSha256 !==
      witness.runtimeNormalizedV5AggregateSha256 ||
    runtimeReport.counts.bodyVertexCount !== BODY_VERTEX_COUNT ||
    runtimeReport.counts.bodyTriangleCount !== BODY_TRIANGLE_COUNT ||
    runtimeReport.counts.garmentVertexCount !== GARMENT_VERTEX_COUNT ||
    runtimeReport.counts.garmentTriangleCount !== GARMENT_TRIANGLE_COUNT ||
    runtimeReport.claims.exactActualBodyCollisionInputRetained !== true ||
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
    responseReport.response.response.correctedVertexCount <= 0 ||
    responseReport.postgates.body.exactCandidateReplayed !== true ||
    responseReport.postgates.body.clear !== true ||
    responseReport.postgates.body.bodyGarmentTriangleIntersectionCount !== 0 ||
    responseReport.postgates.body.penetratingVertexCount !== 0 ||
    responseReport.postgates.body.unsafeVertexCount !== 0 ||
    responseReport.postgates.body.ambiguousSignVertexCount !== 0 ||
    responseReport.postgates.self.residualBlockingCount !== 0 ||
    responseReport.postgates.orientation.sourceDegenerateTriangleCount !== 0 ||
    responseReport.postgates.orientation.candidateDegenerateTriangleCount !== 0 ||
    responseReport.postgates.orientation.normalReversalCount !== 0 ||
    responseReport.postgates.sweptBody.status !== 'clear' ||
    responseReport.postgates.retainedState.exactFrameContinuationExecuted !== false ||
    responseReport.postgates.retainedState.rehydratedNextFrameParityProven !== false ||
    responseReport.claims.genuineSavedRuntimeWrapperAuthenticated !== false ||
    responseReport.claims.staticResponseOnly !== true ||
    responseReport.claims.candidateUploadedToGpu !== false ||
    responseReport.claims.exactFrameContinuationExecuted !== false ||
    responseReport.claims.rehydratedNextFrameParityProven !== false ||
    responseReport.claims.fitAuthority !== false ||
    responseReport.claims.runtimeAuthority !== false ||
    responseReport.claims.productionAuthority !== false
  )
    fail('binding-mismatch', 'D-424 static-response report or postgate boundary drifted.');
  if (
    strainReport.status !== 'saved-32-frame-static-response-strain-diagnostic-blocked' ||
    strainReport.decision !==
      'MEASURED_D424_CORRECTED_CANDIDATE_BOUNDED_PER_TRIANGLE_STRAIN_WITH_MATERIAL_BLOCKERS' ||
    strainReport.seal.canonicalSha256 !== witness.strainProjectionCanonicalSha256 ||
    strainReport.bindings.runtimeSourceCanonicalSha256 !==
      witness.runtimeProjectionCanonicalSha256 ||
    strainReport.bindings.normalizedV5AggregateSha256 !==
      witness.runtimeNormalizedV5AggregateSha256 ||
    strainReport.bindings.staticResponseStableEvidenceSha256 !==
      responseReport.stableEvidence.canonicalSha256 ||
    strainReport.bindings.staticResponseReportCanonicalSha256 !==
      witness.responseProjectionCanonicalSha256 ||
    strainReport.bindings.candidateCurrentPositionsInvMassKgSha256 !==
      responseReport.bindings.candidateCurrentPositionsInvMassKgSha256 ||
    strainReport.bindings.candidateCurrentPositions3MSha256 !==
      responseReport.bindings.candidateCurrentPositions3MSha256 ||
    strainReport.bindings.candidatePreviousPositionsInvMassKgSha256 !==
      responseReport.bindings.candidatePreviousPositionsInvMassKgSha256 ||
    strainReport.bindings.normalizedTopologySha256 !==
      responseReport.bindings.normalizedTopologySha256 ||
    strainReport.bindings.port.finalPositionsInvMassKgSha256 !==
      responseReport.bindings.candidateCurrentPositionsInvMassKgSha256 ||
    strainReport.bindings.port.normalizedTopologySha256 !==
      responseReport.bindings.normalizedTopologySha256 ||
    strainReport.workload.vertexCount !== GARMENT_VERTEX_COUNT ||
    strainReport.workload.triangleCount !== GARMENT_TRIANGLE_COUNT ||
    strainReport.validity.validTriangleCount !== GARMENT_TRIANGLE_COUNT ||
    strainReport.validity.invalidTriangleCount !== 0 ||
    strainReport.claims.genuineSavedRuntimeWrapperAuthenticated !== false ||
    strainReport.claims.exactD424StaticResponseCandidateBound !== true ||
    strainReport.claims.preResponseD420OutputReused !== false ||
    strainReport.claims.preResponseStrainOwnerAcceptedAsInput !== false ||
    strainReport.claims.gpuPerTriangleDiagnosticExecutedFresh !== true ||
    strainReport.claims.physicalStressOrPaComputed !== false ||
    strainReport.claims.materialFailureEvaluated !== false ||
    strainReport.claims.candidateUploadedToGpuForFrameContinuation !== false ||
    strainReport.claims.exactFrameContinuationExecuted !== false ||
    strainReport.claims.rehydratedNextFrameParityProven !== false ||
    strainReport.claims.fitAuthority !== false ||
    strainReport.claims.runtimeAuthority !== false ||
    strainReport.claims.productionAuthority !== false ||
    witness.strain.exactD424CandidateBound !== true ||
    witness.strain.preResponseD420OutputReused !== false ||
    witness.strain.strainDiagnosticAuthority !== true ||
    witness.strain.physicalStressAuthority !== false ||
    witness.strain.materialFailureAuthority !== false ||
    witness.strain.fitAuthority !== false ||
    witness.strain.runtimeAuthority !== false ||
    witness.strain.productionAuthority !== false
  )
    fail('binding-mismatch', 'D-428 corrected strain report or authority boundary drifted.');
}

function validateDimensionsAndTopology(witness: LiveInputs): void {
  const body = witness.runtime.collisionInput;
  const response = witness.response;
  const strain = witness.strain;
  const candidateVec3 = positions3(response.candidateCurrentPositionsInvMassKg);
  if (
    body.bodyPositionsM.length !== BODY_VERTEX_COUNT * 3 ||
    body.bodyTriangles.length !== BODY_TRIANGLE_COUNT * 3 ||
    response.candidateCurrentPositionsInvMassKg.length !== GARMENT_VERTEX_COUNT * 4 ||
    response.candidateCurrentPositions3M.length !== GARMENT_VERTEX_COUNT * 3 ||
    response.candidatePreviousPositionsInvMassKg.length !== GARMENT_VERTEX_COUNT * 4 ||
    response.normalizedTriangles.length !== GARMENT_TRIANGLE_COUNT * 3 ||
    strain.triangleValues.length !== GARMENT_TRIANGLE_COUNT * VALUE_STRIDE ||
    strain.validityFlags.length !== GARMENT_TRIANGLE_COUNT ||
    strain.normalizedTopology.length !== GARMENT_TRIANGLE_COUNT * 3 ||
    !bytesEqual(candidateVec3, response.candidateCurrentPositions3M) ||
    !bytesEqual(witness.runtime.normalizedTriangles, response.normalizedTriangles) ||
    !bytesEqual(response.normalizedTriangles, strain.normalizedTopology) ||
    response.staticResponseOnly !== true ||
    response.candidateUploadedToGpu !== false ||
    response.exactFrameContinuationAuthority !== false ||
    response.runtimeAuthority !== false ||
    response.productionAuthority !== false
  )
    fail(
      'binding-mismatch',
      'Saved body, D-424 candidate, corrected topology, or D-428 strain dimensions drifted.',
    );
  for (const value of response.candidateCurrentPositionsInvMassKg)
    if (!capturedNumberIsFinite(value))
      fail('binding-mismatch', 'D-424 candidate contains a non-finite value.');
  for (const value of strain.triangleValues)
    if (!capturedNumberIsFinite(value))
      fail('binding-mismatch', 'D-428 strain projection contains a non-finite value.');
  for (const flag of strain.validityFlags)
    if (flag !== 0) fail('binding-mismatch', 'D-428 strain projection contains invalid triangles.');
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
  heatmap: BetaSkirtCanonicalMediumStrainHeatmapGeometryV1,
  report: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterReportV1,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapSessionV1 {
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
    garmentGeometry = new THREE.BufferGeometry();
    garmentGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new CapturedFloat32Array(heatmap.positions), 3),
    );
    garmentGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new CapturedFloat32Array(heatmap.colors), 3),
    );
    garmentGeometry.computeVertexNormals();
    garmentGeometry.computeBoundingBox();
    garmentGeometry.computeBoundingSphere();
    const indexedGarment = indexedGeometry(candidatePositions, candidateTriangles);
    garmentEdgeGeometry = new THREE.EdgesGeometry(indexedGarment, 38);
    indexedGarment.dispose();
    bodyMaterial = new THREE.MeshStandardMaterial({
      color: '#bcbcbc',
      roughness: 0.88,
      metalness: 0,
      side: THREE.FrontSide,
    });
    garmentMaterial = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.68,
      metalness: 0,
      clearcoat: 0.05,
      clearcoatRoughness: 0.9,
      side: THREE.DoubleSide,
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.name = 'exact-actual-canonical-measurement-body';
    const garmentMesh = new THREE.Mesh(garmentGeometry, garmentMaterial);
    garmentMesh.name =
      'exact-saved-32-frame-static-response-dimensionless-strain-utilization-garment';
    garmentMesh.userData.receiptSha256 = report.seal.canonicalSha256;
    scene.add(bodyMesh, garmentMesh);
    edgeMaterial = new THREE.LineBasicMaterial({
      color: '#202020',
      transparent: true,
      opacity: 0.28,
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
    canvas.dataset.staticResponseStrainHeatmapReceiptSha256 = report.seal.canonicalSha256;
    canvas.dataset.staticResponseStrainHeatmapStableEvidenceSha256 =
      report.stableEvidence.canonicalSha256;
    canvas.dataset.staticResponseStrainHeatmapMaximumUtilization = String(
      report.visualization.maximumUtilization,
    );
    return objectFreeze({ report, dispose });
  } catch (error) {
    dispose();
    throw error;
  }
}

/**
 * Structural adapter only. A genuine saved wrapper must authenticate the private runtime, D-424
 * response, and D-428 corrected-strain owners before and after this call. No input owner escapes.
 */
export async function createBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterV1(
  canvas: HTMLCanvasElement,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  strainOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainOwnerV1,
): Promise<BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterResultV1> {
  try {
    if (!isRealCanvas(canvas)) fail('invalid-canvas', 'A real HTML canvas is required.');
    const witness = projectLiveInputs(runtimeOwner, responseOwner, strainOwner);
    validateStructuralReports(runtimeOwner, responseOwner, strainOwner, witness);
    validateDimensionsAndTopology(witness);
    const heatmap = buildBetaSkirtCanonicalMediumStrainHeatmapGeometryV1({
      positions: witness.response.candidateCurrentPositions3M,
      topology: witness.response.normalizedTriangles,
      triangleValues: witness.strain.triangleValues,
      validityFlags: witness.strain.validityFlags,
    });
    assertInputsStillMatch(
      runtimeOwner,
      responseOwner,
      strainOwner,
      witness,
      'before digest validation',
    );
    await validateDigestAuthority();
    assertInputsStillMatch(
      runtimeOwner,
      responseOwner,
      strainOwner,
      witness,
      'during digest validation',
    );

    const body = witness.runtime.collisionInput;
    const responseReport = responseOwner.report;
    const strainReport = strainOwner.report;
    const [
      bodyPositionsSha,
      bodyTrianglesSha,
      candidateCurrentSha,
      candidateCurrent3Sha,
      candidatePreviousSha,
      topologySha,
      strainValuesSha,
      strainFlagsSha,
      strainEnvelopeSha,
      renderedPositionsSha,
      renderedColorsSha,
    ] = await Promise.all([
      digestBytes(float32LeBytes(body.bodyPositionsM)),
      digestBytes(uint32LeBytes(body.bodyTriangles)),
      digestBytes(float32LeBytes(witness.response.candidateCurrentPositionsInvMassKg)),
      digestBytes(float32LeBytes(witness.response.candidateCurrentPositions3M)),
      digestBytes(float32LeBytes(witness.response.candidatePreviousPositionsInvMassKg)),
      digestBytes(uint32LeBytes(witness.response.normalizedTriangles)),
      digestBytes(float32LeBytes(witness.strain.triangleValues)),
      digestBytes(uint32LeBytes(witness.strain.validityFlags)),
      digestBytes(outputEnvelope(witness.strain.triangleValues, witness.strain.validityFlags)),
      digestBytes(float32LeBytes(heatmap.positions)),
      digestBytes(float32LeBytes(heatmap.colors)),
    ]);
    assertInputsStillMatch(
      runtimeOwner,
      responseOwner,
      strainOwner,
      witness,
      'while hashing copied render content',
    );
    if (
      candidateCurrentSha !== responseReport.bindings.candidateCurrentPositionsInvMassKgSha256 ||
      candidateCurrent3Sha !== responseReport.bindings.candidateCurrentPositions3MSha256 ||
      candidatePreviousSha !== responseReport.bindings.candidatePreviousPositionsInvMassKgSha256 ||
      topologySha !== responseReport.bindings.normalizedTopologySha256 ||
      topologySha !== strainReport.bindings.normalizedTopologySha256 ||
      topologySha !== strainReport.bindings.port.normalizedTopologySha256 ||
      strainValuesSha !== strainReport.bindings.outputValuesFloat32LeSha256 ||
      strainFlagsSha !== strainReport.bindings.outputValidityFlagsUint32LeSha256 ||
      strainEnvelopeSha !== strainReport.bindings.outputEnvelopeSha256 ||
      heatmap.minimumUtilization !== strainReport.ranges.normalizedUtilization.minimum ||
      heatmap.maximumUtilization !== strainReport.ranges.normalizedUtilization.maximum ||
      heatmap.triangleCountAtOrAboveFourTimesProvisionalLimit !==
        strainReport.interpretation.triangleCountAtOrAboveFourTimesProvisionalLimit
    )
      fail('binding-mismatch', 'Corrected heatmap content hashes or statistics drifted.');
    for (const digest of [
      witness.runtimeProjectionCanonicalSha256,
      witness.responseProjectionCanonicalSha256,
      witness.strainProjectionCanonicalSha256,
      witness.runtimeNormalizedV5AggregateSha256,
      responseReport.stableEvidence.canonicalSha256,
      strainReport.stableEvidence.canonicalSha256,
      runtimeOwner.report.bindings.actualBodyCollisionInputSha256,
      strainReport.bindings.frozenV1KernelSourceSha256,
      strainReport.bindings.frozenV1ProvisionalLimitsSha256,
      strainReport.bindings.frozenV1ColorLutSha256,
      bodyPositionsSha,
      bodyTrianglesSha,
      candidateCurrentSha,
      candidateCurrent3Sha,
      candidatePreviousSha,
      topologySha,
      strainValuesSha,
      strainFlagsSha,
      strainEnvelopeSha,
      renderedPositionsSha,
      renderedColorsSha,
    ])
      if (!isSha256(digest)) fail('binding-mismatch', 'A corrected heatmap SHA-256 is invalid.');

    const bindings = objectFreeze({
      runtimeSourceCanonicalSha256: witness.runtimeProjectionCanonicalSha256,
      runtimeReportCanonicalSha256: runtimeOwner.report.seal.canonicalSha256,
      normalizedV5AggregateSha256: witness.runtimeNormalizedV5AggregateSha256,
      staticResponseStableEvidenceSha256: responseReport.stableEvidence.canonicalSha256,
      staticResponseReportCanonicalSha256: witness.responseProjectionCanonicalSha256,
      correctedStrainStableEvidenceSha256: strainReport.stableEvidence.canonicalSha256,
      correctedStrainReportCanonicalSha256: witness.strainProjectionCanonicalSha256,
      actualBodyCollisionInputSha256: runtimeOwner.report.bindings.actualBodyCollisionInputSha256,
      bodyPositions3MSha256: bodyPositionsSha,
      bodyTrianglesSha256: bodyTrianglesSha,
      candidateCurrentPositionsInvMassKgSha256: candidateCurrentSha,
      candidateCurrentPositions3MSha256: candidateCurrent3Sha,
      candidatePreviousPositionsInvMassKgSha256: candidatePreviousSha,
      normalizedTopologySha256: topologySha,
      strainValuesFloat32LeSha256: strainValuesSha,
      strainValidityFlagsUint32LeSha256: strainFlagsSha,
      strainOutputEnvelopeSha256: strainEnvelopeSha,
      strainKernelSourceSha256: strainReport.bindings.frozenV1KernelSourceSha256,
      strainProvisionalLimitsSha256: strainReport.bindings.frozenV1ProvisionalLimitsSha256,
      strainColorLutSha256: strainReport.bindings.frozenV1ColorLutSha256,
      renderedNonIndexedPositionsFloat32LeSha256: renderedPositionsSha,
      renderedVertexColorsFloat32LeSha256: renderedColorsSha,
    });
    const counts = objectFreeze({
      sourceFrameCount: 32 as const,
      bodyVertexCount: BODY_VERTEX_COUNT,
      bodyTriangleCount: BODY_TRIANGLE_COUNT,
      garmentVertexCount: GARMENT_VERTEX_COUNT,
      garmentTriangleCount: GARMENT_TRIANGLE_COUNT,
      renderedFaceVertexCount: RENDERED_FACE_VERTEX_COUNT,
      correctedVertexCount: responseReport.response.response.correctedVertexCount,
      validStrainTriangleCount: GARMENT_TRIANGLE_COUNT,
      invalidStrainTriangleCount: 0 as const,
    });
    const response = objectFreeze({
      maximumCorrectionM: responseReport.response.response.maximumCorrectionM,
      postResponseBodyClear: true as const,
      postResponseResidualSelfContactCount: 0 as const,
      postResponseNormalReversalCount: 0 as const,
      postResponseSweptBodyClear: true as const,
      exactFrameContinuationExecuted: false as const,
      rehydratedNextFrameParityProven: false as const,
    });
    const visualization = objectFreeze({
      quantity: 'normalized-green-strain-utilization' as const,
      units: 'dimensionless' as const,
      interpolation: 'linear-srgb-face-owned' as const,
      displayClampMinimum: 0 as const,
      displayClampMaximum: DISPLAY_CLAMP_MAXIMUM,
      topLegendLabel: '≥2 provisional utilization' as const,
      minimumUtilization: heatmap.minimumUtilization,
      maximumUtilization: heatmap.maximumUtilization,
      triangleCountAtOrAboveDisplayClamp: heatmap.triangleCountAtOrAboveDisplayClamp,
      triangleCountAtOrAboveFourTimesProvisionalLimit:
        heatmap.triangleCountAtOrAboveFourTimesProvisionalLimit,
      disclaimer:
        'Dimensionless provisional strain visualization only; not physical stress, Pa, material failure, or fit.' as const,
    });
    const remainingBlockers = objectFreeze([
      'outer-saved-wrapper-authentication-not-established-by-structural-adapter',
      'exact-frame-continuation-not-executed',
      'rehydrated-next-frame-parity-not-proven',
      'material-visualization-thresholds-provisional-and-uncalibrated',
      'physical-stress-and-pa-not-computed',
      'material-failure-not-evaluated',
      'settle-fit-runtime-production-authority-not-established',
    ] as const);
    const claims = objectFreeze({
      genuineSavedRuntimeWrapperAuthenticated: false as const,
      privateBaseRuntimeStaticResponseAndCorrectedStrainOwnersRequired: true as const,
      inputOwnersReturnedByAdapter: false as const,
      allThreeInputOwnersRevalidatedAcrossAsyncBoundaries: true as const,
      exactActualBodyRendered: true as const,
      exactD424StaticResponseCandidateRendered: true as const,
      exactD428FreshCorrectedTriangleStrainValuesRendered: true as const,
      preResponseD420OutputReused: false as const,
      faceOwnedColorsPreventCrossTriangleInterpolation: true as const,
      copiedThreeResourcesSurviveUpstreamOwnerDisposal: true as const,
      visibleHeatmapRendered: true as const,
      dimensionlessStrainUtilizationOnly: true as const,
      d424StaticPostgatesMeasuredClear: true as const,
      candidateUploadedToGpuForFrameContinuation: false as const,
      exactFrameContinuationExecuted: false as const,
      rehydratedNextFrameParityProven: false as const,
      physicalStressOrPaRendered: false as const,
      materialFailureRendered: false as const,
      settleCleared: false as const,
      fitAuthority: false as const,
      runtimeAuthority: false as const,
      productionAuthority: false as const,
    });
    const stablePayload = objectFreeze({
      schemaVersion:
        BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_HEATMAP_ADAPTER_REPORT_V1,
      status: 'structural-saved-32-frame-static-response-visible-strain-heatmap-ready' as const,
      decision:
        'RENDERED_EXACT_D424_STATIC_RESPONSE_CANDIDATE_WITH_FRESH_D428_DIMENSIONLESS_STRAIN_AND_DOWNSTREAM_BLOCKERS' as const,
      label:
        BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_HEATMAP_LABEL_V1,
      renderer: 'three-webgl-exact-saved32-static-response-face-owned-strain-heatmap' as const,
      bindings: objectFreeze({
        ...bindings,
        staticResponseReportCanonicalSha256: undefined,
        correctedStrainReportCanonicalSha256: undefined,
      }),
      counts,
      response,
      visualization,
      remainingBlockers,
      claims,
    });
    const stableEvidence = objectFreeze({
      canonicalSha256: await payloadSha256(
        'beta-skirt-canonical-medium-saved-32-frame-static-response-visible-strain-heatmap-stable-v1',
        stablePayload,
      ),
      excludesVolatileStaticResponseAndCorrectedStrainReportSeals: true as const,
    });
    assertInputsStillMatch(
      runtimeOwner,
      responseOwner,
      strainOwner,
      witness,
      'while sealing stable corrected heatmap evidence',
    );
    const reportWithoutSeal = objectFreeze({
      schemaVersion:
        BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_HEATMAP_ADAPTER_REPORT_V1,
      status: 'structural-saved-32-frame-static-response-visible-strain-heatmap-ready' as const,
      decision:
        'RENDERED_EXACT_D424_STATIC_RESPONSE_CANDIDATE_WITH_FRESH_D428_DIMENSIONLESS_STRAIN_AND_DOWNSTREAM_BLOCKERS' as const,
      label:
        BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATIC_RESPONSE_STRAIN_HEATMAP_LABEL_V1,
      renderer: 'three-webgl-exact-saved32-static-response-face-owned-strain-heatmap' as const,
      bindings,
      counts,
      response,
      visualization,
      stableEvidence,
      remainingBlockers,
      claims,
    });
    const report = objectFreeze({
      ...reportWithoutSeal,
      seal: objectFreeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: await payloadSha256(
          'beta-skirt-canonical-medium-saved-32-frame-static-response-visible-strain-heatmap-adapter-report-v1',
          reportWithoutSeal,
        ),
        authority:
          'unsigned-structural-saved-32-frame-static-response-visible-strain-heatmap-only' as const,
      }),
    }) satisfies BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseStrainHeatmapAdapterReportV1;
    assertInputsStillMatch(
      runtimeOwner,
      responseOwner,
      strainOwner,
      witness,
      'before creating copied Three resources',
    );
    const session = createThreeSession(
      canvas,
      new CapturedFloat32Array(body.bodyPositionsM),
      new CapturedUint32Array(body.bodyTriangles),
      new CapturedFloat32Array(witness.response.candidateCurrentPositions3M),
      new CapturedUint32Array(witness.response.normalizedTriangles),
      objectFreeze({
        ...heatmap,
        positions: new CapturedFloat32Array(heatmap.positions),
        colors: new CapturedFloat32Array(heatmap.colors),
      }),
      report,
    );
    return objectFreeze({ ok: true as const, session, report });
  } catch (error) {
    if (error instanceof CorrectedHeatmapAdapterError)
      return objectFreeze({ ok: false as const, code: error.code, detail: error.message });
    const detail =
      error instanceof Error ? error.message : 'Unknown corrected saved32 heatmap failure.';
    return objectFreeze({
      ok: false as const,
      code: 'render-failed' as const,
      detail: capturedReflectApply(capturedStringSlice, detail, [0, 2_048]) as string,
    });
  }
}
