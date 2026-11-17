import type {
  BetaSkirtCanonicalMediumSavedRuntime34FrameCarrierResponseReceiptV1,
  BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
} from './beta-skirt-canonical-medium-saved-runtime-source-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseV1,
  type BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1,
} from './beta-skirt-canonical-medium-saved-webgpu-34-frame-carrier-response-v1';
import {
  disposeBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8,
  projectBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8,
  runBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8,
  type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOptionsV8,
  type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOwnerV8,
  type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationReportV8,
} from './beta-skirt-canonical-medium-saved-webgpu-35-frame-continuation-v8';
import {
  projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1,
  type BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
} from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectApply = Reflect.apply;
const arrayBufferPrototype = ArrayBuffer.prototype;
const dataViewSetFloat32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setFloat32')?.value;
const dataViewSetUint32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setUint32')?.value;
const subtleDigest =
  typeof SubtleCrypto === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(SubtleCrypto.prototype, 'digest')?.value;
const capturedSubtle = globalThis.crypto?.subtle;
const CapturedDataView = DataView;
const CapturedUint8Array = Uint8Array;
const HEX = '0123456789abcdef';

export type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationExecutionV8 = Readonly<{
  continuationOwner: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOwnerV8;
  continuationReport: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationReportV8;
  diagnosticBlocked: boolean;
}>;

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || !subtleDigest)
    throw new TypeError('Native Web Crypto SHA-256 is unavailable.');
  const owned = new CapturedUint8Array(bytes);
  const result = (await reflectApply(subtleDigest, capturedSubtle, [
    'SHA-256',
    owned,
  ])) as ArrayBuffer;
  if (objectGetPrototypeOf(result) !== arrayBufferPrototype || result.byteLength !== 32)
    throw new TypeError('Native Web Crypto SHA-256 returned invalid bytes.');
  let output = '';
  const digest = new CapturedUint8Array(result);
  for (let index = 0; index < digest.length; index += 1) {
    const byte = digest[index]!;
    output += HEX[byte >>> 4]! + HEX[byte & 0x0f]!;
  }
  return output;
}

async function float32LeSha256(values: Float32Array): Promise<string> {
  if (!dataViewSetFloat32) throw new TypeError('Native Float32LE writer is unavailable.');
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    reflectApply(dataViewSetFloat32, view, [index * 4, values[index], true]);
  return digestBytes(bytes);
}

async function uint32LeSha256(values: Uint32Array): Promise<string> {
  if (!dataViewSetUint32) throw new TypeError('Native Uint32LE writer is unavailable.');
  const bytes = new CapturedUint8Array(values.length * 4);
  const view = new CapturedDataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1)
    reflectApply(dataViewSetUint32, view, [index * 4, values[index], true]);
  return digestBytes(bytes);
}

function authenticateInputs(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  responseReceipt: BetaSkirtCanonicalMediumSavedRuntime34FrameCarrierResponseReceiptV1,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1,
): void {
  const runtimeProjection = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  const responseProjection =
    projectBetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseV1(responseOwner);
  if (
    !runtimeProjection ||
    !responseProjection ||
    responseReceipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    responseReceipt.claims.frame34CarrierResponseOwnerStayedPrivate !== true ||
    responseReceipt.claims.exactD432ResidualWitnessSetConsumed !== true ||
    responseReceipt.claims.velocityAndLambdasRetainedUnchanged !== true ||
    responseReceipt.claims.nextFrameContinuationExecuted !== false ||
    responseReceipt.claims.runtimeAuthority !== false ||
    responseReceipt.bindings.runtimeSourceCanonicalSha256 !==
      snapshot.bindings.runtimeSourceCanonicalSha256 ||
    responseReceipt.bindings.adapterReportCanonicalSha256 !==
      responseOwner.report.seal.canonicalSha256 ||
    runtimeProjection.reportCanonicalSha256 !== snapshot.bindings.runtimeSourceCanonicalSha256 ||
    responseProjection.reportCanonicalSha256 !== responseOwner.report.seal.canonicalSha256
  )
    throw new TypeError(
      'Frame35 continuation requires the exact genuine base runtime and D-435 response association.',
    );
}

/** Structural V8 command. The saved wrapper owns both inputs and retains the returned owner. */
export async function executeBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationCommandV8(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  responseReceipt: BetaSkirtCanonicalMediumSavedRuntime34FrameCarrierResponseReceiptV1,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseOwnerV1,
  canvas: HTMLCanvasElement,
  options: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOptionsV8 = {},
): Promise<BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationExecutionV8> {
  authenticateInputs(snapshot, responseReceipt, runtimeOwner, responseOwner);
  const result = await runBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8(
    canvas,
    runtimeOwner,
    responseOwner,
    options,
  );
  let continuationOwner: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOwnerV8;
  let continuationReport: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationReportV8;
  let diagnosticBlocked: boolean;
  if (result.ok === false) {
    if (result.code !== 'diagnostic-failed' || !result.owner || !result.report)
      throw new TypeError(`Frame35 continuation blocked: ${result.code}: ${result.detail}`);
    continuationOwner = result.owner;
    continuationReport = result.report;
    diagnosticBlocked = true;
  } else {
    continuationOwner = result.owner;
    continuationReport = result.report;
    diagnosticBlocked = false;
  }
  try {
    const projection =
      projectBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8(continuationOwner);
    if (
      !projection ||
      projection.reportCanonicalSha256 !== continuationReport.seal.canonicalSha256 ||
      projection.rehydratedFrame35DiagnosticOnly !== true ||
      projection.sameLiveGpuSessionFromFrame34 !== false ||
      projection.exactFrameContinuationAuthority !== false ||
      continuationReport.bindings.runtimeSourceCanonicalSha256 !==
        snapshot.bindings.runtimeSourceCanonicalSha256 ||
      continuationReport.bindings.sourceFrame34CarrierResponseCanonicalSha256 !==
        responseOwner.report.seal.canonicalSha256 ||
      continuationReport.continuation.d435ResponseIsSoleMutableStateInput !== true ||
      continuationReport.continuation.inputStateUploadByteExact !== true ||
      continuationReport.continuation.oneUnchangedFrameScheduleExecuted !== true ||
      continuationReport.continuation.rehydratedFrame35 !== true ||
      continuationReport.continuation.sameLiveGpuSessionFromFrame34 !== false ||
      continuationReport.claims.genuineSavedRuntimeWrapperAuthenticated !== false ||
      continuationReport.claims.inputOwnersNotReturned !== true ||
      continuationReport.claims.continuationAuthority !== false ||
      continuationReport.stableEvidence.excludesRunnerTimingAndVolatileOwnerSeals !== true ||
      continuationReport.seal.authority !==
        'unsigned-saved-35-frame-rehydrated-continuation-diagnostic-only'
    )
      throw new TypeError('Frame35 continuation report differs from its genuine D-435 input.');
    const [current, current3, previous, velocities, distance, seam, bend, continuum, topology] =
      await Promise.all([
        float32LeSha256(projection.finalCurrentPositionsInvMassKg),
        float32LeSha256(projection.finalCurrentPositions3M),
        float32LeSha256(projection.finalPreviousPositionsInvMassKg),
        float32LeSha256(projection.finalVelocitiesMps),
        float32LeSha256(projection.finalDistanceLambdasKgM),
        float32LeSha256(projection.finalSeamLambdasKgM),
        float32LeSha256(projection.finalBendLambdasKgM2),
        float32LeSha256(projection.finalContinuumLambdasKgM),
        uint32LeSha256(projection.normalizedTriangles),
      ]);
    if (
      current !== continuationReport.bindings.finalPositionsInvMassKgSha256 ||
      current3 !== continuationReport.bindings.finalPositions3MSha256 ||
      previous !== continuationReport.bindings.finalPreviousPositionsInvMassKgSha256 ||
      velocities !== continuationReport.bindings.finalVelocitiesMpsSha256 ||
      distance !== continuationReport.bindings.finalDistanceLambdasKgMSha256 ||
      seam !== continuationReport.bindings.finalSeamLambdasKgMSha256 ||
      bend !== continuationReport.bindings.finalBendLambdasKgM2Sha256 ||
      continuum !== continuationReport.bindings.finalContinuumLambdasKgMSha256 ||
      topology !== continuationReport.bindings.normalizedTopologySha256
    )
      throw new TypeError('Frame35 projected state differs from the report byte bindings.');
    if (
      !projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner) ||
      !projectBetaSkirtCanonicalMediumSavedWebgpu34FrameCarrierResponseV1(responseOwner)
    )
      throw new TypeError('A frame35 input owner became unavailable before command return.');
    return Object.freeze({ continuationOwner, continuationReport, diagnosticBlocked });
  } catch (error) {
    disposeBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8(continuationOwner);
    throw error;
  }
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationCommandV8(
  owner: unknown,
): boolean {
  return disposeBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8(owner);
}
