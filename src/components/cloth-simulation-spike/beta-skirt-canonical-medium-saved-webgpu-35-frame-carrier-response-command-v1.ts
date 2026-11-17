import type {
  BetaSkirtCanonicalMediumSavedRuntime35FrameContinuationReceiptV8,
  BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
} from './beta-skirt-canonical-medium-saved-runtime-source-v1';
import {
  disposeBetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseV1,
  evaluateBetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseV1,
  projectBetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseV1,
  type BetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseOwnerV1,
  type BetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseReportV1,
} from './beta-skirt-canonical-medium-saved-webgpu-35-frame-carrier-response-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8,
  type BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOwnerV8,
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
const CapturedTextEncoder = TextEncoder;
const CapturedUint8Array = Uint8Array;
const jsonStringify = JSON.stringify;
const HEX = '0123456789abcdef';

export type BetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseExecutionV1 = Readonly<{
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseOwnerV1;
  responseReport: BetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseReportV1;
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

async function payloadSha256(domain: string, value: unknown): Promise<string> {
  const encoder = new CapturedTextEncoder();
  return digestBytes(encoder.encode(`${domain}\0${jsonStringify(value)}`));
}

const abortSignalAborted =
  typeof AbortSignal === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')?.get;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal === undefined) return;
  if (
    !abortSignalAborted ||
    typeof AbortSignal === 'undefined' ||
    objectGetPrototypeOf(signal) !== AbortSignal.prototype
  )
    throw new TypeError('Frame35 carrier response requires a genuine AbortSignal.');
  if (reflectApply(abortSignalAborted, signal, []))
    throw new DOMException('Frame35 carrier response was aborted.', 'AbortError');
}

function authenticateInputs(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  frame35Receipt: BetaSkirtCanonicalMediumSavedRuntime35FrameContinuationReceiptV8,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  frame35Owner: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOwnerV8,
): void {
  const runtimeProjection = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  const frame35Projection =
    projectBetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationV8(frame35Owner);
  if (!runtimeProjection || !frame35Projection)
    throw new TypeError(
      'Frame35 carrier response requires the exact genuine saved D-438 private association.',
    );
  const frame35Report = frame35Owner.report;
  if (
    frame35Receipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    frame35Receipt.claims.exactAdapterReportPrivatelyAssociated !== true ||
    frame35Receipt.claims.baseRuntimeOwnerStayedPrivate !== true ||
    frame35Receipt.claims.frame34CarrierResponseOwnerStayedPrivate !== true ||
    frame35Receipt.claims.frame35ContinuationOwnerStayedPrivate !== true ||
    frame35Receipt.claims.exactD435ResponseStateConsumed !== true ||
    frame35Receipt.claims.d435ResponseIsSoleMutableStateInput !== true ||
    frame35Receipt.claims.inputCurrentPreviousVelocityAndAllLambdasByteExactUploaded !== true ||
    frame35Receipt.claims.oneUnchangedFrame35ScheduleExecuted !== true ||
    frame35Receipt.claims.freshFrame35BodySelfSweptOrientationSeamWPostgatesExecuted !== true ||
    frame35Receipt.claims.rehydratedFrame35 !== true ||
    frame35Receipt.claims.sameLiveGpuSessionFromFrame34 !== false ||
    frame35Receipt.claims.runtimeAndResponseOwnersRevalidatedAcrossAsyncBoundaries !== true ||
    frame35Receipt.claims.epsilonChanged !== false ||
    frame35Receipt.claims.collisionPolicyChanged !== false ||
    frame35Receipt.claims.continuationAuthority !== false ||
    frame35Receipt.claims.collisionAuthority !== false ||
    frame35Receipt.claims.fitAuthority !== false ||
    frame35Receipt.claims.runtimeAuthority !== false ||
    frame35Receipt.claims.productionAuthority !== false ||
    frame35Receipt.bindings.runtimeSourceCanonicalSha256 !==
      snapshot.bindings.runtimeSourceCanonicalSha256 ||
    frame35Receipt.bindings.adapterReportCanonicalSha256 !== frame35Report.seal.canonicalSha256 ||
    runtimeProjection.reportCanonicalSha256 !== snapshot.bindings.runtimeSourceCanonicalSha256 ||
    frame35Projection.reportCanonicalSha256 !== frame35Report.seal.canonicalSha256 ||
    frame35Receipt.status !== 'saved-35-frame-rehydrated-postgate-blocked' ||
    frame35Receipt.decision !== 'BLOCK_FRAME35_POSTGATES_AFTER_EXACT_REHYDRATION' ||
    frame35Receipt.retainedState.inputStateUploadByteExact !== true ||
    frame35Receipt.retainedState.currentInverseMassBitsExactSource !== true ||
    frame35Receipt.retainedState.previousInverseMassBitsExactSource !== true ||
    frame35Receipt.retainedState.velocityWComponentsPositiveZero !== true ||
    frame35Receipt.retainedState.allCurrentPreviousVelocityFinite !== true ||
    frame35Receipt.retainedState.allLambdasFinite !== true ||
    frame35Receipt.retainedState.exactFrameContinuationStateBytesRetained !== true ||
    frame35Receipt.continuation.sourceFrameNumber !== 34 ||
    frame35Receipt.continuation.executedFrameNumber !== 35 ||
    frame35Receipt.continuation.d435ResponseIsSoleMutableStateInput !== true ||
    frame35Receipt.continuation.inputStateUploadByteExact !== true ||
    frame35Receipt.continuation.oneUnchangedFrameScheduleExecuted !== true ||
    frame35Receipt.continuation.rehydratedFrame35 !== true ||
    frame35Receipt.continuation.sameLiveGpuSessionFromFrame34 !== false ||
    frame35Receipt.postgatesClear !== false ||
    frame35Receipt.selfOrientation.residualBlockingCount === 0 ||
    frame35Receipt.selfOrientation.residualBlockingCount !==
      frame35Receipt.selfOrientation.carrierAdjacentTouchingResidualCount ||
    frame35Receipt.selfOrientation.unsupportedResidualCount !== 0 ||
    frame35Receipt.selfOrientation.retainedResidualWitnesses.length !==
      frame35Receipt.selfOrientation.residualBlockingCount ||
    frame35Report.selfOrientation.residualBlockingCount !==
      frame35Receipt.selfOrientation.residualBlockingCount ||
    frame35Report.selfOrientation.epsilonM !== frame35Receipt.selfOrientation.epsilonM ||
    frame35Report.seamPinW.seamGapDidNotRegress !== frame35Receipt.seamPinW.seamGapDidNotRegress ||
    Object.entries(frame35Report.bindings).some(
      ([key, value]) =>
        frame35Receipt.bindings[key as keyof typeof frame35Report.bindings] !== value,
    ) ||
    frame35Receipt.bindings.seamPairsSha256 !== snapshot.bindings.seamPairsSha256 ||
    frame35Receipt.bindings.pinnedVertexIndicesSha256 !==
      snapshot.bindings.pinnedVertexIndicesSha256
  )
    throw new TypeError(
      'Frame35 carrier response requires the exact genuine saved D-438 private association.',
    );
}

/** Structural frame35 response command. The saved wrapper owns both inputs and retains the returned owner. */
export async function executeBetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseCommandV1(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  frame35Receipt: BetaSkirtCanonicalMediumSavedRuntime35FrameContinuationReceiptV8,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  frame35Owner: BetaSkirtCanonicalMediumSavedWebgpu35FrameContinuationOwnerV8,
  signal?: AbortSignal,
): Promise<BetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseExecutionV1> {
  authenticateInputs(snapshot, frame35Receipt, runtimeOwner, frame35Owner);
  throwIfAborted(signal);
  const result = await evaluateBetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseV1(
    runtimeOwner,
    frame35Owner,
    signal,
  );
  let responseOwner: BetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseOwnerV1;
  let responseReport: BetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseReportV1;
  let diagnosticBlocked: boolean;
  if (result.ok === false) {
    if (result.code !== 'diagnostic-failed' || !result.owner || !result.report)
      throw new TypeError(`Frame35 carrier response blocked: ${result.code}: ${result.detail}`);
    responseOwner = result.owner;
    responseReport = result.report;
    diagnosticBlocked = true;
  } else {
    responseOwner = result.owner;
    responseReport = result.report;
    diagnosticBlocked = false;
  }
  try {
    throwIfAborted(signal);
    authenticateInputs(snapshot, frame35Receipt, runtimeOwner, frame35Owner);
    const projection =
      projectBetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseV1(responseOwner);
    if (
      !projection ||
      projection.reportCanonicalSha256 !== responseReport.seal.canonicalSha256 ||
      projection.callerOwnedMutableBinaryCopies !== true ||
      projection.continuationLoopResponseState !== true ||
      projection.candidateUploadedToGpu !== false ||
      projection.nextFrameContinuationAuthority !== false ||
      projection.collisionAuthority !== false ||
      projection.runtimeAuthority !== false ||
      projection.productionAuthority !== false ||
      responseReport.bindings.runtimeSourceCanonicalSha256 !==
        snapshot.bindings.runtimeSourceCanonicalSha256 ||
      responseReport.bindings.sourceFrame35ContinuationReportCanonicalSha256 !==
        frame35Owner.report.seal.canonicalSha256 ||
      responseReport.bindings.sourceRetainedDynamicStateAggregateSha256 !==
        frame35Receipt.bindings.retainedDynamicStateAggregateSha256 ||
      responseReport.bindings.sourceCurrentPositionsInvMassKgSha256 !==
        frame35Receipt.bindings.finalPositionsInvMassKgSha256 ||
      responseReport.bindings.sourcePreviousPositionsInvMassKgSha256 !==
        frame35Receipt.bindings.finalPreviousPositionsInvMassKgSha256 ||
      responseReport.bindings.sourceVelocitiesMpsSha256 !==
        frame35Receipt.bindings.finalVelocitiesMpsSha256 ||
      responseReport.bindings.sourceDistanceLambdasKgMSha256 !==
        frame35Receipt.bindings.finalDistanceLambdasKgMSha256 ||
      responseReport.bindings.sourceSeamLambdasKgMSha256 !==
        frame35Receipt.bindings.finalSeamLambdasKgMSha256 ||
      responseReport.bindings.sourceBendLambdasKgM2Sha256 !==
        frame35Receipt.bindings.finalBendLambdasKgM2Sha256 ||
      responseReport.bindings.sourceContinuumLambdasKgMSha256 !==
        frame35Receipt.bindings.finalContinuumLambdasKgMSha256 ||
      responseReport.bindings.normalizedTopologySha256 !==
        frame35Receipt.bindings.normalizedTopologySha256 ||
      responseReport.bindings.seamPairsSha256 !== snapshot.bindings.seamPairsSha256 ||
      responseReport.bindings.pinnedVertexIndicesSha256 !==
        snapshot.bindings.pinnedVertexIndicesSha256 ||
      responseReport.response.source.residualWitnessCount !==
        frame35Receipt.selfOrientation.residualBlockingCount ||
      responseReport.postgates.retainedState.velocityBufferByteExact !== true ||
      responseReport.postgates.retainedState.distanceLambdaBufferByteExact !== true ||
      responseReport.postgates.retainedState.seamLambdaBufferByteExact !== true ||
      responseReport.postgates.retainedState.bendLambdaBufferByteExact !== true ||
      responseReport.postgates.retainedState.continuumLambdaBufferByteExact !== true ||
      responseReport.postgates.retainedState.sourceFrame35ExactRehydrationProven !== true ||
      responseReport.postgates.retainedState.sourceFrame35SeamGapDidNotRegress !==
        frame35Receipt.seamPinW.seamGapDidNotRegress ||
      responseReport.postgates.retainedState.nextFrameContinuationExecuted !== false ||
      responseReport.claims.exactV8Frame35ResidualWitnessSetConsumed !== true ||
      responseReport.claims.exactV8Frame35CurrentPreviousVelocityAndLambdasConsumed !== true ||
      responseReport.claims.d419CarrierResponseExecuted !== true ||
      responseReport.claims.freshExactBodyGateExecuted !== true ||
      responseReport.claims.freshSelfOrientationSeamPinGateExecuted !== true ||
      responseReport.claims.freshSweptBodyGateExecuted !== true ||
      responseReport.claims.velocityAndLambdasRetainedUnchanged !== true ||
      responseReport.claims.inputOwnersRevalidatedAcrossAsyncBoundaries !== true ||
      responseReport.claims.genuineSavedRuntimeWrapperAuthenticated !== false ||
      responseReport.claims.inputOwnersNotReturned !== true ||
      responseReport.claims.continuationLoopCompatibleStateCarrierResponse !== true ||
      responseReport.claims.sourceFrame35ExactRehydrationProven !== true ||
      responseReport.claims.candidateUploadedToGpu !== false ||
      responseReport.claims.nextFrameContinuationExecuted !== false ||
      responseReport.claims.noFramePairOrHashAllowlistUsed !== true ||
      responseReport.claims.epsilonChanged !== false ||
      responseReport.claims.collisionPolicyChanged !== false ||
      responseReport.claims.selfIntersectionAuthority !== false ||
      responseReport.claims.collisionAuthority !== false ||
      responseReport.claims.fitAuthority !== false ||
      responseReport.claims.runtimeAuthority !== false ||
      responseReport.claims.productionAuthority !== false ||
      responseReport.stableEvidence.excludesVolatileInputOwnerSeals !== true ||
      responseReport.seal.authority !==
        'unsigned-structural-frame35-carrier-response-diagnostic-only' ||
      !responseReport.blockers.includes('next-frame-continuation-not-executed') ||
      !responseReport.blockers.includes(
        'settle-fit-runtime-production-authority-not-established',
      ) ||
      diagnosticBlocked !==
        (responseReport.status === 'frame35-carrier-response-postgate-blocked') ||
      (!diagnosticBlocked &&
        responseReport.decision !==
          'PASS_BOUNDED_D419_FRAME35_CARRIER_RESPONSE_WITHOUT_NEXT_FRAME_AUTHORITY') ||
      (diagnosticBlocked &&
        responseReport.decision !== 'BLOCK_BOUNDED_D419_FRAME35_CARRIER_RESPONSE')
    )
      throw new TypeError('Frame35 carrier response report differs from its genuine saved inputs.');

    const sourceResidualContactLocusAggregateSha256 = await payloadSha256(
      'beta-skirt-canonical-medium-frame35-carrier-response-source-residual-loci-v1',
      frame35Receipt.selfOrientation.retainedResidualWitnesses.map((value) => ({
        triangleA: value.triangleA,
        triangleB: value.triangleB,
        oracleKind: value.oracleKind,
        disposition: value.disposition,
        contactLocusSha256: value.contactLocusSha256,
      })),
    );
    const [current, current3, previous, velocities, distance, seam, bend, continuum, topology] =
      await Promise.all([
        float32LeSha256(projection.candidateCurrentPositionsInvMassKg),
        float32LeSha256(projection.candidateCurrentPositions3M),
        float32LeSha256(projection.candidatePreviousPositionsInvMassKg),
        float32LeSha256(projection.retainedVelocitiesMps),
        float32LeSha256(projection.retainedDistanceLambdasKgM),
        float32LeSha256(projection.retainedSeamLambdasKgM),
        float32LeSha256(projection.retainedBendLambdasKgM2),
        float32LeSha256(projection.retainedContinuumLambdasKgM),
        uint32LeSha256(projection.normalizedTriangles),
      ]);
    if (
      sourceResidualContactLocusAggregateSha256 !==
        responseReport.bindings.sourceResidualContactLocusAggregateSha256 ||
      current !== responseReport.bindings.candidateCurrentPositionsInvMassKgSha256 ||
      current3 !== responseReport.bindings.candidateCurrentPositions3MSha256 ||
      previous !== responseReport.bindings.candidatePreviousPositionsInvMassKgSha256 ||
      velocities !== responseReport.bindings.sourceVelocitiesMpsSha256 ||
      distance !== responseReport.bindings.sourceDistanceLambdasKgMSha256 ||
      seam !== responseReport.bindings.sourceSeamLambdasKgMSha256 ||
      bend !== responseReport.bindings.sourceBendLambdasKgM2Sha256 ||
      continuum !== responseReport.bindings.sourceContinuumLambdasKgMSha256 ||
      topology !== responseReport.bindings.normalizedTopologySha256
    )
      throw new TypeError(
        'Frame35 carrier response projected state differs from its byte bindings.',
      );
    throwIfAborted(signal);
    authenticateInputs(snapshot, frame35Receipt, runtimeOwner, frame35Owner);
    return Object.freeze({ responseOwner, responseReport, diagnosticBlocked });
  } catch (error) {
    disposeBetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseV1(responseOwner);
    throw error;
  }
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseCommandV1(
  owner: unknown,
): boolean {
  return disposeBetaSkirtCanonicalMediumSavedWebgpu35FrameCarrierResponseV1(owner);
}
