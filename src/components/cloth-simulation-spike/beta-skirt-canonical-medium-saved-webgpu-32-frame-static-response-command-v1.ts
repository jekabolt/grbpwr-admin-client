import type {
  BetaSkirtCanonicalMediumSavedRuntime32FrameSelfOrientationReceiptV1,
  BetaSkirtCanonicalMediumSavedRuntime32FrameStateRetentionReceiptV5,
  BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
} from './beta-skirt-canonical-medium-saved-runtime-source-v1';
import {
  disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1,
  evaluateBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1,
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseReportV1,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationV1,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationOwnerV1,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-self-orientation-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-state-retention-v5';
import type { BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1 } from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseExecutionV1 = Readonly<{
  responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1;
  responseReport: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseReportV1;
  diagnosticBlocked: boolean;
}>;

function authenticateInputs(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  selfReceipt: BetaSkirtCanonicalMediumSavedRuntime32FrameSelfOrientationReceiptV1,
  stateReceipt: BetaSkirtCanonicalMediumSavedRuntime32FrameStateRetentionReceiptV5,
  selfOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationOwnerV1,
  stateOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5,
): void {
  const selfProjection =
    projectBetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationV1(selfOwner);
  const stateProjection =
    projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5(stateOwner);
  if (
    !selfProjection ||
    !stateProjection ||
    selfReceipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    selfReceipt.claims.exactAdapterReportPrivatelyAssociated !== true ||
    selfReceipt.claims.selfOrientationOwnerStayedPrivate !== true ||
    stateReceipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    stateReceipt.claims.exactAdapterCandidatePrivatelyAssociated !== true ||
    stateReceipt.claims.stateRetentionOwnerStayedPrivate !== true ||
    selfReceipt.bindings.savedRuntimeSourceCanonicalSha256 !== snapshot.seal.canonicalSha256 ||
    stateReceipt.bindings.savedRuntimeSourceCanonicalSha256 !== snapshot.seal.canonicalSha256 ||
    selfReceipt.bindings.finalPositionsInvMassKgSha256 !==
      stateReceipt.bindings.finalPositionsInvMassKgSha256 ||
    selfReceipt.bindings.finalPositions3MSha256 !== stateReceipt.bindings.finalPositions3MSha256 ||
    selfReceipt.bindings.normalizedTopologySha256 !==
      stateReceipt.bindings.normalizedTopologySha256 ||
    selfReceipt.bindings.adapterReportCanonicalSha256 !== selfOwner.report.seal.canonicalSha256 ||
    stateReceipt.bindings.stateRetentionReportCanonicalSha256 !==
      stateOwner.report.seal.canonicalSha256 ||
    selfProjection.reportCanonicalSha256 !== selfOwner.report.seal.canonicalSha256 ||
    stateProjection.reportCanonicalSha256 !== stateOwner.report.seal.canonicalSha256 ||
    selfReceipt.confinedWitness.residualBlockingCount === 0 ||
    selfReceipt.confinedWitness.residualBlockingCount !==
      selfReceipt.confinedWitness.carrierAdjacentTouchingResidualCount ||
    selfReceipt.confinedWitness.unsupportedResidualCount !== 0 ||
    stateReceipt.retainedState.staticPostFrameResponseInputAvailable !== true ||
    stateReceipt.retainedState.exactFrameContinuationExecuted !== false ||
    stateReceipt.retainedState.rehydratedNextFrameParityProven !== false
  )
    throw new TypeError(
      'Static response requires exact genuine saved D-421 and D-422 private associations.',
    );
}

export async function executeBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseCommandV1(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  selfReceipt: BetaSkirtCanonicalMediumSavedRuntime32FrameSelfOrientationReceiptV1,
  stateReceipt: BetaSkirtCanonicalMediumSavedRuntime32FrameStateRetentionReceiptV5,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  selfOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameSelfOrientationOwnerV1,
  stateOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5,
  signal?: AbortSignal,
): Promise<BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseExecutionV1> {
  authenticateInputs(snapshot, selfReceipt, stateReceipt, selfOwner, stateOwner);
  const result = await evaluateBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1(
    runtimeOwner,
    selfOwner,
    stateOwner,
    signal,
  );
  let responseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1;
  let responseReport: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseReportV1;
  let diagnosticBlocked: boolean;
  if (!result.ok) {
    if (result.code !== 'diagnostic-failed' || !result.owner || !result.report)
      throw new TypeError(`Static response blocked: ${result.code}: ${result.detail}`);
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
      projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1(responseOwner);
    if (
      !projection ||
      projection.reportCanonicalSha256 !== responseReport.seal.canonicalSha256 ||
      responseReport.bindings.runtimeSourceCanonicalSha256 !==
        snapshot.bindings.runtimeSourceCanonicalSha256 ||
      responseReport.bindings.selfOrientationReportCanonicalSha256 !==
        selfOwner.report.seal.canonicalSha256 ||
      responseReport.bindings.stateRetentionReportCanonicalSha256 !==
        stateOwner.report.seal.canonicalSha256 ||
      responseReport.bindings.sourceCurrentPositionsInvMassKgSha256 !==
        stateReceipt.bindings.finalPositionsInvMassKgSha256 ||
      responseReport.bindings.sourcePreviousPositionsInvMassKgSha256 !==
        stateReceipt.bindings.finalPreviousPositionsInvMassKgSha256 ||
      responseReport.bindings.sourceVelocitiesMpsSha256 !==
        stateReceipt.bindings.finalVelocitiesMpsSha256 ||
      responseReport.bindings.normalizedTopologySha256 !==
        stateReceipt.bindings.normalizedTopologySha256 ||
      responseReport.bindings.sourceContactLocusAggregateSha256 !==
        selfReceipt.bindings.aggregateContactLocusSha256 ||
      responseReport.response.source.residualWitnessCount !==
        selfReceipt.confinedWitness.residualBlockingCount ||
      responseReport.claims.genuineSavedRuntimeWrapperAuthenticated !== false ||
      responseReport.claims.inputOwnersNotReturned !== true ||
      responseReport.claims.staticResponseOnly !== true ||
      responseReport.claims.candidateUploadedToGpu !== false ||
      responseReport.claims.exactFrameContinuationExecuted !== false ||
      responseReport.claims.rehydratedNextFrameParityProven !== false ||
      responseReport.claims.runtimeAuthority !== false ||
      responseReport.claims.productionAuthority !== false
    )
      throw new TypeError('Static response report differs from its genuine saved inputs.');
    return Object.freeze({ responseOwner, responseReport, diagnosticBlocked });
  } catch (error) {
    disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1(responseOwner);
    throw error;
  }
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseCommandV1(
  owner: unknown,
): boolean {
  return disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1(owner);
}
