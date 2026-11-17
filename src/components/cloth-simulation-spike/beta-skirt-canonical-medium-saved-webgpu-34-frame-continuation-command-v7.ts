import type {
  BetaSkirtCanonicalMediumSavedRuntime16FrameReceiptV1,
  BetaSkirtCanonicalMediumSavedRuntime32FrameReceiptV4,
  BetaSkirtCanonicalMediumSavedRuntime32FrameStateRetentionReceiptV5,
  BetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseReceiptV1,
  BetaSkirtCanonicalMediumSavedRuntime33FrameContinuationReceiptV6,
  BetaSkirtCanonicalMediumSavedRuntimeContinuationCarrierResponseReceiptV1,
  BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
} from './beta-skirt-canonical-medium-saved-runtime-source-v1';
import {
  disposeBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationV7,
  projectBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationV7,
  runBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationV7,
  type BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationOptionsV7,
  type BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationOwnerV7,
  type BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationReportV7,
} from './beta-skirt-canonical-medium-saved-webgpu-34-frame-continuation-v7';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4';
import { deriveBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4 } from './beta-skirt-canonical-medium-saved-webgpu-32-frame-command-v4';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-state-retention-v5';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-static-response-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu33FrameContinuationV6,
  type BetaSkirtCanonicalMediumSavedWebgpu33FrameContinuationOwnerV6,
} from './beta-skirt-canonical-medium-saved-webgpu-33-frame-continuation-v6';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseV1,
  type BetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseOwnerV1,
} from './beta-skirt-canonical-medium-saved-webgpu-continuation-carrier-response-v1';
import type { BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2 } from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';
import type { BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1 } from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

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

export type BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationExecutionV7 = Readonly<{
  continuationOwner: BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationOwnerV7;
  continuationReport: BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationReportV7;
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
  saved16Receipt: BetaSkirtCanonicalMediumSavedRuntime16FrameReceiptV1,
  saved32Receipt: BetaSkirtCanonicalMediumSavedRuntime32FrameReceiptV4,
  stateReceipt: BetaSkirtCanonicalMediumSavedRuntime32FrameStateRetentionReceiptV5,
  staticResponseReceipt: BetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseReceiptV1,
  frame33Receipt: BetaSkirtCanonicalMediumSavedRuntime33FrameContinuationReceiptV6,
  carrierResponseReceipt: BetaSkirtCanonicalMediumSavedRuntimeContinuationCarrierResponseReceiptV1,
  acceptedV4Owner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  stateOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5,
  staticResponseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  frame33Owner: BetaSkirtCanonicalMediumSavedWebgpu33FrameContinuationOwnerV6,
  carrierResponseOwner: BetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseOwnerV1,
): void {
  const v4Projection = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(acceptedV4Owner);
  const stateProjection =
    projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5(stateOwner);
  const staticResponseProjection =
    projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseV1(staticResponseOwner);
  const frame33Projection =
    projectBetaSkirtCanonicalMediumSavedWebgpu33FrameContinuationV6(frame33Owner);
  const carrierResponseProjection =
    projectBetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseV1(carrierResponseOwner);
  if (
    !v4Projection ||
    !stateProjection ||
    !staticResponseProjection ||
    !frame33Projection ||
    !carrierResponseProjection ||
    saved32Receipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    stateReceipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    staticResponseReceipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    frame33Receipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    carrierResponseReceipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    frame33Receipt.claims.continuationOwnerStayedPrivate !== true ||
    frame33Receipt.claims.continuationAuthority !== false ||
    carrierResponseReceipt.claims.continuationCarrierResponseOwnerStayedPrivate !== true ||
    carrierResponseReceipt.claims.candidateUploadedToGpu !== false ||
    carrierResponseReceipt.claims.nextFrameContinuationExecuted !== false ||
    saved32Receipt.bindings.savedRuntimeSourceCanonicalSha256 !== snapshot.seal.canonicalSha256 ||
    saved32Receipt.bindings.saved16FrameCanonicalSha256 !== saved16Receipt.seal.canonicalSha256 ||
    stateReceipt.bindings.acceptedV4RunnerCanonicalSha256 !==
      acceptedV4Owner.report.seal.canonicalSha256 ||
    stateReceipt.bindings.stateRetentionReportCanonicalSha256 !==
      stateOwner.report.seal.canonicalSha256 ||
    staticResponseReceipt.bindings.adapterReportCanonicalSha256 !==
      staticResponseOwner.report.seal.canonicalSha256 ||
    frame33Receipt.bindings.adapterReportCanonicalSha256 !==
      frame33Owner.report.seal.canonicalSha256 ||
    frame33Receipt.bindings.acceptedStateRetentionCanonicalSha256 !==
      stateOwner.report.seal.canonicalSha256 ||
    frame33Receipt.bindings.acceptedStaticResponseCanonicalSha256 !==
      staticResponseOwner.report.seal.canonicalSha256 ||
    carrierResponseReceipt.bindings.sourceContinuationReceiptCanonicalSha256 !==
      frame33Receipt.seal.canonicalSha256 ||
    carrierResponseReceipt.bindings.sourceContinuationReportCanonicalSha256 !==
      frame33Owner.report.seal.canonicalSha256 ||
    carrierResponseReceipt.bindings.adapterReportCanonicalSha256 !==
      carrierResponseOwner.report.seal.canonicalSha256 ||
    v4Projection.reportCanonicalSha256 !== acceptedV4Owner.report.seal.canonicalSha256 ||
    stateProjection.reportCanonicalSha256 !== stateOwner.report.seal.canonicalSha256 ||
    staticResponseProjection.reportCanonicalSha256 !==
      staticResponseOwner.report.seal.canonicalSha256 ||
    frame33Projection.reportCanonicalSha256 !== frame33Owner.report.seal.canonicalSha256 ||
    carrierResponseProjection.reportCanonicalSha256 !==
      carrierResponseOwner.report.seal.canonicalSha256
  )
    throw new TypeError(
      'Frame34 continuation requires exact genuine saved32, D-422, D-424, D-427, and D-429 private associations.',
    );
}

/** Structural V7 command. The saved wrapper owns every input and retains the returned owner. */
export async function executeBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationCommandV7(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  saved16Receipt: BetaSkirtCanonicalMediumSavedRuntime16FrameReceiptV1,
  saved32Receipt: BetaSkirtCanonicalMediumSavedRuntime32FrameReceiptV4,
  stateReceipt: BetaSkirtCanonicalMediumSavedRuntime32FrameStateRetentionReceiptV5,
  staticResponseReceipt: BetaSkirtCanonicalMediumSavedRuntime32FrameStaticResponseReceiptV1,
  frame33Receipt: BetaSkirtCanonicalMediumSavedRuntime33FrameContinuationReceiptV6,
  carrierResponseReceipt: BetaSkirtCanonicalMediumSavedRuntimeContinuationCarrierResponseReceiptV1,
  runtimeOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runner16Owner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  acceptedV4Owner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  stateOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5,
  staticResponseOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStaticResponseOwnerV1,
  frame33Owner: BetaSkirtCanonicalMediumSavedWebgpu33FrameContinuationOwnerV6,
  carrierResponseOwner: BetaSkirtCanonicalMediumSavedWebgpuContinuationCarrierResponseOwnerV1,
  canvas: HTMLCanvasElement,
  options: BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationOptionsV7 = {},
): Promise<BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationExecutionV7> {
  authenticateInputs(
    snapshot,
    saved16Receipt,
    saved32Receipt,
    stateReceipt,
    staticResponseReceipt,
    frame33Receipt,
    carrierResponseReceipt,
    acceptedV4Owner,
    stateOwner,
    staticResponseOwner,
    frame33Owner,
    carrierResponseOwner,
  );
  const checkpoint = deriveBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4(
    snapshot,
    saved16Receipt,
  );
  const result = await runBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationV7(
    canvas,
    runtimeOwner,
    runner16Owner,
    checkpoint,
    acceptedV4Owner,
    stateOwner,
    staticResponseOwner,
    frame33Owner,
    carrierResponseOwner,
    options,
  );
  let continuationOwner: BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationOwnerV7;
  let continuationReport: BetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationReportV7;
  let diagnosticBlocked: boolean;
  if (!result.ok) {
    if (result.code !== 'diagnostic-failed' || !result.owner || !result.report)
      throw new TypeError(`Frame34 continuation blocked: ${result.code}: ${result.detail}`);
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
      projectBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationV7(continuationOwner);
    if (
      !projection ||
      projection.reportCanonicalSha256 !== continuationReport.seal.canonicalSha256 ||
      projection.continuedFrame34DiagnosticOnly !== true ||
      projection.exactFrameContinuationAuthority !== false ||
      continuationReport.bindings.savedRuntimeSourceCanonicalSha256 !==
        snapshot.seal.canonicalSha256 ||
      continuationReport.bindings.saved16FrameCanonicalSha256 !==
        saved16Receipt.seal.canonicalSha256 ||
      continuationReport.bindings.acceptedV4RunnerCanonicalSha256 !==
        acceptedV4Owner.report.seal.canonicalSha256 ||
      continuationReport.bindings.acceptedStateRetentionCanonicalSha256 !==
        stateOwner.report.seal.canonicalSha256 ||
      continuationReport.bindings.acceptedStaticResponseCanonicalSha256 !==
        staticResponseOwner.report.seal.canonicalSha256 ||
      continuationReport.bindings.acceptedFrame33ContinuationCanonicalSha256 !==
        frame33Owner.report.seal.canonicalSha256 ||
      continuationReport.bindings.acceptedFrame33CarrierResponseCanonicalSha256 !==
        carrierResponseOwner.report.seal.canonicalSha256 ||
      continuationReport.retainedState.referenceFrame33ExactAcceptedD427 !== true ||
      continuationReport.retainedState.continuationCarrierResponseApplied !== true ||
      continuationReport.continuation.referenceFrame33MatchedAcceptedD427 !== true ||
      continuationReport.continuation.continuationResponseStateUploadByteExact !== true ||
      continuationReport.continuation.sameSessionReferenceFrame33Rerun !== false ||
      continuationReport.continuation.pairedRehydratedFrame34Parity !== true ||
      continuationReport.continuation.frame34ByteExactParity !== true ||
      continuationReport.claims.genuineSavedRuntimeWrapperAuthenticated !== false ||
      continuationReport.claims.inputOwnersNotReturned !== true ||
      continuationReport.claims.continuationAuthority !== false ||
      continuationReport.stableEvidence.excludesRunnerTimingAndVolatileOwnerSeals !== true ||
      continuationReport.seal.authority !==
        'unsigned-saved-34-frame-paired-rehydrated-continuation-diagnostic-only'
    )
      throw new TypeError('Frame34 continuation report differs from its genuine saved inputs.');
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
      throw new TypeError('Frame34 projected state differs from the report byte bindings.');
    return Object.freeze({ continuationOwner, continuationReport, diagnosticBlocked });
  } catch (error) {
    disposeBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationV7(continuationOwner);
    throw error;
  }
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationCommandV7(
  owner: unknown,
): boolean {
  return disposeBetaSkirtCanonicalMediumSavedWebgpu34FrameContinuationV7(owner);
}
