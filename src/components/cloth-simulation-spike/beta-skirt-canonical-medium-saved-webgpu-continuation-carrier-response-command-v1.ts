import type {
  BetaSkirtCanonicalMediumSavedRuntime33FrameContinuationReceiptV6,
  BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
} from './beta-skirt-canonical-medium-saved-runtime-source-v1';
import {
  disposeBetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseV1,
  evaluateBetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseV1,
  projectBetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseV1,
  type BetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseOwnerV1,
  type BetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseReportV1,
} from './beta-skirt-canonical-medium-saved-webgpu-continuation-carrier-response-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu33FrameContinuationV6,
  type BetaSkirtCanonicalMediumSavedWebgpu33FrameContinuationOwnerV6,
} from './beta-skirt-canonical-medium-saved-webgpu-33-frame-continuation-v6';
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

export type BetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseExecutionV1 = Readonly<{
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseOwnerV1;
  responseReport: BetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseReportV1;
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

function authenticateInputs(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  continuationReceipt: BetaSkirtCanonicalMediumSavedRuntime33FrameContinuationReceiptV6,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  continuationOwner: BetaSkirtCanonicalMediumSavedWebgpu33FrameContinuationOwnerV6,
): void {
  const runtimeProjection = projectBetaSkirtCanonicalMediumWebgpuRuntimeSourceV1(runtimeOwner);
  const continuationProjection =
    projectBetaSkirtCanonicalMediumSavedWebgpu33FrameContinuationV6(continuationOwner);
  if (!runtimeProjection || !continuationProjection)
    throw new TypeError(
      'Continuation carrier response requires the exact genuine saved D-427 private association.',
    );
  const continuationReport = continuationOwner.report;
  if (
    continuationReceipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    continuationReceipt.claims.exactAdapterReportPrivatelyAssociated !== true ||
    continuationReceipt.claims.baseRuntimeOwnerStayedPrivate !== true ||
    continuationReceipt.claims.continuationOwnerStayedPrivate !== true ||
    continuationReceipt.claims.referenceFrame32ExactAcceptedD422 !== true ||
    continuationReceipt.claims.identicalD424CorrectionAppliedToCurrentAndPreviousOnly !== true ||
    continuationReceipt.claims.independentMutableBranchBuffers !== true ||
    continuationReceipt.claims.currentPreviousVelocityLambdasAndDiagnosticsByteExactParity !==
      true ||
    continuationReceipt.claims.freshFrame33BodySelfSweptOrientationSeamWPostgatesExecuted !==
      true ||
    continuationReceipt.claims.epsilonChanged !== false ||
    continuationReceipt.claims.collisionPolicyChanged !== false ||
    continuationReceipt.claims.continuationAuthority !== false ||
    continuationReceipt.claims.collisionAuthority !== false ||
    continuationReceipt.claims.fitAuthority !== false ||
    continuationReceipt.claims.runtimeAuthority !== false ||
    continuationReceipt.claims.productionAuthority !== false ||
    continuationReceipt.bindings.savedRuntimeSourceCanonicalSha256 !==
      snapshot.seal.canonicalSha256 ||
    continuationReceipt.bindings.runtimeSourceCanonicalSha256 !==
      snapshot.bindings.runtimeSourceCanonicalSha256 ||
    continuationReceipt.bindings.adapterReportCanonicalSha256 !==
      continuationReport.seal.canonicalSha256 ||
    runtimeProjection.reportCanonicalSha256 !== snapshot.bindings.runtimeSourceCanonicalSha256 ||
    continuationProjection.reportCanonicalSha256 !== continuationReport.seal.canonicalSha256 ||
    continuationReceipt.status !== 'saved-33-frame-rehydrated-parity-postgate-blocked' ||
    continuationReceipt.decision !== 'BLOCK_FRAME33_POSTGATES_AFTER_EXACT_REHYDRATED_PARITY' ||
    continuationReceipt.retainedState.referenceFrame32ExactAcceptedD422 !== true ||
    continuationReceipt.retainedState.staticPostFrameResponseApplied !== true ||
    continuationReceipt.retainedState.exactFrameContinuationExecuted !== true ||
    continuationReceipt.retainedState.rehydratedNextFrameParityProven !== true ||
    continuationReceipt.continuation.frame33ByteExactParity !== true ||
    continuationReceipt.selfOrientation.residualBlockingCount === 0 ||
    continuationReceipt.selfOrientation.residualBlockingCount !==
      continuationReceipt.selfOrientation.carrierAdjacentTouchingResidualCount ||
    continuationReceipt.selfOrientation.unsupportedResidualCount !== 0 ||
    continuationReceipt.selfOrientation.retainedResidualWitnesses.length !==
      continuationReceipt.selfOrientation.residualBlockingCount ||
    continuationReport.bindings.finalPositionsInvMassKgSha256 !==
      continuationReceipt.bindings.finalPositionsInvMassKgSha256 ||
    continuationReport.bindings.finalPreviousPositionsInvMassKgSha256 !==
      continuationReceipt.bindings.finalPreviousPositionsInvMassKgSha256 ||
    continuationReport.bindings.finalVelocitiesMpsSha256 !==
      continuationReceipt.bindings.finalVelocitiesMpsSha256 ||
    continuationReport.bindings.finalDistanceLambdasKgMSha256 !==
      continuationReceipt.bindings.finalDistanceLambdasKgMSha256 ||
    continuationReport.bindings.finalSeamLambdasKgMSha256 !==
      continuationReceipt.bindings.finalSeamLambdasKgMSha256 ||
    continuationReport.bindings.finalBendLambdasKgM2Sha256 !==
      continuationReceipt.bindings.finalBendLambdasKgM2Sha256 ||
    continuationReport.bindings.finalContinuumLambdasKgMSha256 !==
      continuationReceipt.bindings.finalContinuumLambdasKgMSha256 ||
    continuationReport.bindings.normalizedTopologySha256 !==
      continuationReceipt.bindings.normalizedTopologySha256 ||
    continuationReport.selfOrientation.residualBlockingCount !==
      continuationReceipt.selfOrientation.residualBlockingCount
  )
    throw new TypeError(
      'Continuation carrier response requires the exact genuine saved D-427 private association.',
    );
}

/** Structural D-429 command. The saved wrapper owns both inputs and retains the returned owner. */
export async function executeBetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseCommandV1(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  continuationReceipt: BetaSkirtCanonicalMediumSavedRuntime33FrameContinuationReceiptV6,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  continuationOwner: BetaSkirtCanonicalMediumSavedWebgpu33FrameContinuationOwnerV6,
  signal?: AbortSignal,
): Promise<BetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseExecutionV1> {
  authenticateInputs(snapshot, continuationReceipt, runtimeOwner, continuationOwner);
  const result = await evaluateBetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseV1(
    runtimeOwner,
    continuationOwner,
    signal,
  );
  let responseOwner: BetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseOwnerV1;
  let responseReport: BetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseReportV1;
  let diagnosticBlocked: boolean;
  if (!result.ok) {
    if (result.code !== 'diagnostic-failed' || !result.owner || !result.report)
      throw new TypeError(
        `Continuation carrier response blocked: ${result.code}: ${result.detail}`,
      );
    responseOwner = result.owner;
    responseReport = result.report;
    diagnosticBlocked = true;
  } else {
    responseOwner = result.owner;
    responseReport = result.report;
    diagnosticBlocked = false;
  }
  try {
    const projection =
      projectBetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseV1(responseOwner);
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
      responseReport.bindings.sourceContinuationReportCanonicalSha256 !==
        continuationOwner.report.seal.canonicalSha256 ||
      responseReport.bindings.sourceCurrentPositionsInvMassKgSha256 !==
        continuationReceipt.bindings.finalPositionsInvMassKgSha256 ||
      responseReport.bindings.sourcePreviousPositionsInvMassKgSha256 !==
        continuationReceipt.bindings.finalPreviousPositionsInvMassKgSha256 ||
      responseReport.bindings.sourceVelocitiesMpsSha256 !==
        continuationReceipt.bindings.finalVelocitiesMpsSha256 ||
      responseReport.bindings.sourceDistanceLambdasKgMSha256 !==
        continuationReceipt.bindings.finalDistanceLambdasKgMSha256 ||
      responseReport.bindings.sourceSeamLambdasKgMSha256 !==
        continuationReceipt.bindings.finalSeamLambdasKgMSha256 ||
      responseReport.bindings.sourceBendLambdasKgM2Sha256 !==
        continuationReceipt.bindings.finalBendLambdasKgM2Sha256 ||
      responseReport.bindings.sourceContinuumLambdasKgMSha256 !==
        continuationReceipt.bindings.finalContinuumLambdasKgMSha256 ||
      responseReport.bindings.normalizedTopologySha256 !==
        continuationReceipt.bindings.normalizedTopologySha256 ||
      responseReport.bindings.seamPairsSha256 !== snapshot.bindings.seamPairsSha256 ||
      responseReport.bindings.pinnedVertexIndicesSha256 !==
        snapshot.bindings.pinnedVertexIndicesSha256 ||
      responseReport.response.source.residualWitnessCount !==
        continuationReceipt.selfOrientation.residualBlockingCount ||
      responseReport.postgates.retainedState.velocityBufferByteExact !== true ||
      responseReport.postgates.retainedState.distanceLambdaBufferByteExact !== true ||
      responseReport.postgates.retainedState.seamLambdaBufferByteExact !== true ||
      responseReport.postgates.retainedState.bendLambdaBufferByteExact !== true ||
      responseReport.postgates.retainedState.continuumLambdaBufferByteExact !== true ||
      responseReport.postgates.retainedState.sourceContinuationParityProven !== true ||
      responseReport.postgates.retainedState.nextFrameContinuationExecuted !== false ||
      responseReport.claims.exactV6ContinuationResidualWitnessSetConsumed !== true ||
      responseReport.claims.exactV6CurrentPreviousVelocityAndLambdasConsumed !== true ||
      responseReport.claims.d419CarrierResponseExecuted !== true ||
      responseReport.claims.freshExactBodyGateExecuted !== true ||
      responseReport.claims.freshSelfOrientationSeamPinGateExecuted !== true ||
      responseReport.claims.freshSweptBodyGateExecuted !== true ||
      responseReport.claims.velocityAndLambdasRetainedUnchanged !== true ||
      responseReport.claims.inputOwnersRevalidatedAcrossAsyncBoundaries !== true ||
      responseReport.claims.genuineSavedRuntimeWrapperAuthenticated !== false ||
      responseReport.claims.inputOwnersNotReturned !== true ||
      responseReport.claims.continuationLoopCompatibleStateCarrierResponse !== true ||
      responseReport.claims.sourceContinuationParityProven !== true ||
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
        'unsigned-structural-continuation-carrier-response-diagnostic-only' ||
      !responseReport.blockers.includes('next-frame-continuation-not-executed') ||
      !responseReport.blockers.includes(
        'settle-fit-runtime-production-authority-not-established',
      ) ||
      diagnosticBlocked !==
        (responseReport.status === 'continuation-carrier-response-postgate-blocked') ||
      (!diagnosticBlocked &&
        responseReport.decision !==
          'PASS_BOUNDED_D419_CONTINUATION_CARRIER_RESPONSE_WITHOUT_NEXT_FRAME_AUTHORITY') ||
      (diagnosticBlocked &&
        responseReport.decision !== 'BLOCK_BOUNDED_D419_CONTINUATION_CARRIER_RESPONSE')
    )
      throw new TypeError(
        'Continuation carrier response report differs from its genuine saved inputs.',
      );

    const sourceResidualContactLocusAggregateSha256 = await payloadSha256(
      'beta-skirt-canonical-medium-continuation-carrier-response-source-residual-loci-v1',
      continuationReceipt.selfOrientation.retainedResidualWitnesses.map((value) => ({
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
        'Continuation carrier response projected state differs from its byte bindings.',
      );
    return Object.freeze({ responseOwner, responseReport, diagnosticBlocked });
  } catch (error) {
    disposeBetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseV1(responseOwner);
    throw error;
  }
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseCommandV1(
  owner: unknown,
): boolean {
  return disposeBetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseV1(owner);
}
