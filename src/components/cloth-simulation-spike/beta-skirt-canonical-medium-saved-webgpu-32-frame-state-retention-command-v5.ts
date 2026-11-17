import type {
  BetaSkirtCanonicalMediumSavedRuntime16FrameReceiptV1,
  BetaSkirtCanonicalMediumSavedRuntime32FrameReceiptV4,
  BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
} from './beta-skirt-canonical-medium-saved-runtime-source-v1';
import {
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4';
import { deriveBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4 } from './beta-skirt-canonical-medium-saved-webgpu-32-frame-command-v4';
import {
  disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5,
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5,
  runBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOptionsV5,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionReportV5,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-state-retention-v5';
import type { BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2 } from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';
import type { BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1 } from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_CANDIDATE_V5 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-state-retention-candidate/5' as const;

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const HEX = '0123456789abcdef';
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectApply = Reflect.apply;
const jsonStringify = JSON.stringify;
const arrayBufferPrototype = ArrayBuffer.prototype;
const dataViewSetFloat32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setFloat32')?.value;
const dataViewSetUint32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setUint32')?.value;
const textEncoderEncode = objectGetOwnPropertyDescriptor(TextEncoder.prototype, 'encode')?.value;
const capturedSubtle = globalThis.crypto?.subtle;
const subtleDigest =
  typeof SubtleCrypto === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(SubtleCrypto.prototype, 'digest')?.value;
const CapturedDataView = DataView;
const CapturedUint8Array = Uint8Array;
const encoder = new TextEncoder();

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionCandidateV5 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_CANDIDATE_V5;
  status: 'saved-32-frame-state-retained-static-response-ready-continuation-unproven';
  decision: 'PASS_EXACT_V4_FINAL_CURRENT_AND_RETAIN_DYNAMIC_STATE_WITH_CONTINUATION_BLOCKER';
  bindings: Readonly<
    BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionReportV5['bindings'] & {
      stateRetentionReportCanonicalSha256: string;
    }
  >;
  retainedState: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionReportV5['retainedState'];
  stableEvidence: Readonly<{
    canonicalSha256: string;
    excludesRunnerTimingAndVolatileOwnerSeals: true;
  }>;
  claims: Readonly<{
    savedRuntime16And32ReceiptsContentBound: true;
    genuineSavedRuntimeWrapperAuthenticated: false;
    inputOwnersNotReturnedByAdapter: true;
    stateOwnerReturnedForOuterWrapperRetention: true;
    exactAcceptedV4FinalCurrentMatched: true;
    finalCurrentPreviousVelocityAndLambdasRetained: true;
    staticPostFrameResponseInputAvailable: true;
    staticPostFrameResponseExecuted: false;
    exactFrameContinuationStateBytesRetained: true;
    exactFrameContinuationExecuted: false;
    rehydratedNextFrameParityProven: false;
    epsilonChanged: false;
    collisionPolicyChanged: false;
    continuationAuthority: false;
    collisionAuthority: false;
    runtimeAuthority: false;
    fitAuthority: false;
    productionAuthority: false;
  }>;
  blockers: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionReportV5['blockers'];
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-structural-saved-32-frame-state-retention-candidate-only';
  }>;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionExecutionV5 = Readonly<{
  stateOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOwnerV5;
  stateReport: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionReportV5;
  candidate: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionCandidateV5;
}>;

async function digestBytes(bytes: Uint8Array): Promise<string> {
  if (!capturedSubtle || !subtleDigest)
    throw new TypeError('Native Web Crypto SHA-256 is unavailable.');
  const owned = new CapturedUint8Array(bytes.byteLength);
  owned.set(bytes);
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

async function validateDigestAuthority(): Promise<void> {
  if ((await digestBytes(new CapturedUint8Array(0))) !== EMPTY_SHA256)
    throw new TypeError('SHA-256 empty-message KAT failed.');
  if (!textEncoderEncode) throw new TypeError('Native UTF-8 encoder is unavailable.');
  const abc = reflectApply(textEncoderEncode, encoder, ['abc']) as Uint8Array;
  if ((await digestBytes(abc)) !== ABC_SHA256) throw new TypeError('SHA-256 abc KAT failed.');
}

async function payloadSha256(domain: string, payload: unknown): Promise<string> {
  if (!textEncoderEncode) throw new TypeError('Native UTF-8 encoder is unavailable.');
  const bytes = reflectApply(textEncoderEncode, encoder, [
    `${domain}\0${jsonStringify(payload)}`,
  ]) as Uint8Array;
  return digestBytes(bytes);
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

function authenticateOuterInputs(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  saved16Receipt: BetaSkirtCanonicalMediumSavedRuntime16FrameReceiptV1,
  saved32Receipt: BetaSkirtCanonicalMediumSavedRuntime32FrameReceiptV4,
  acceptedV4Owner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
): void {
  const v4Projection = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(acceptedV4Owner);
  if (
    !v4Projection ||
    saved32Receipt.status !== 'saved-dxf-32-frame-contact-clear-downstream-blocked-diagnostic' ||
    saved32Receipt.decision !==
      'MEASURED_32_FRAME_EXACT_BODY_CONTACT_AND_STRUCTURAL_POSTGATE_CLEAR_WITH_DOWNSTREAM_BLOCKERS' ||
    saved32Receipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    saved32Receipt.claims.exactAdapterCandidatePrivatelyAssociated !== true ||
    saved32Receipt.claims.baseRuntimeOwnerStayedPrivate !== true ||
    saved32Receipt.claims.runner16FrameOwnerStayedPrivate !== true ||
    saved32Receipt.claims.runner32FrameOwnerStayedPrivate !== true ||
    saved32Receipt.claims.exactSaved16CheckpointBound !== true ||
    saved32Receipt.claims.exactFinalProjectionIndependentlyHashed !== true ||
    saved32Receipt.claims.exactActualBodyPostgateClear !== true ||
    saved32Receipt.bindings.savedRuntimeSourceCanonicalSha256 !== snapshot.seal.canonicalSha256 ||
    saved32Receipt.bindings.saved16FrameCanonicalSha256 !== saved16Receipt.seal.canonicalSha256 ||
    saved32Receipt.bindings.runtimeSourceCanonicalSha256 !==
      snapshot.bindings.runtimeSourceCanonicalSha256 ||
    saved32Receipt.bindings.v4RunnerReportCanonicalSha256 !==
      acceptedV4Owner.report.seal.canonicalSha256 ||
    v4Projection.reportCanonicalSha256 !== acceptedV4Owner.report.seal.canonicalSha256
  )
    throw new TypeError(
      'Genuine saved 32F receipt differs from its live snapshot, saved16 receipt, or V4 owner.',
    );
}

/**
 * Structural V5 adapter invoked only from the saved wrapper. It returns the new state owner for
 * private outer retention; it never authenticates the wrapper and never returns any input owner.
 */
export async function executeBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionCommandV5(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  saved16Receipt: BetaSkirtCanonicalMediumSavedRuntime16FrameReceiptV1,
  saved32Receipt: BetaSkirtCanonicalMediumSavedRuntime32FrameReceiptV4,
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runner16Owner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  acceptedV4Owner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  canvas: HTMLCanvasElement,
  options: BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionOptionsV5 = {},
): Promise<BetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionExecutionV5> {
  authenticateOuterInputs(snapshot, saved16Receipt, saved32Receipt, acceptedV4Owner);
  const checkpoint = deriveBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4(
    snapshot,
    saved16Receipt,
  );
  await validateDigestAuthority();
  const result = await runBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5(
    canvas,
    runtimeSourceOwner,
    runner16Owner,
    checkpoint,
    acceptedV4Owner,
    options,
  );
  if (!result.ok)
    throw new TypeError(`Saved 32F V5 state retention blocked: ${result.code}: ${result.detail}`);

  const stateOwner = result.owner;
  try {
    const report = result.report;
    if (
      report.status !==
        'saved-32-frame-state-retained-static-response-ready-continuation-unproven' ||
      report.decision !==
        'PASS_EXACT_V4_FINAL_CURRENT_AND_RETAIN_DYNAMIC_STATE_WITH_CONTINUATION_BLOCKER' ||
      report.bindings.savedRuntimeSourceCanonicalSha256 !== snapshot.seal.canonicalSha256 ||
      report.bindings.saved16FrameCanonicalSha256 !== saved16Receipt.seal.canonicalSha256 ||
      report.bindings.acceptedV4RunnerCanonicalSha256 !==
        acceptedV4Owner.report.seal.canonicalSha256 ||
      report.bindings.finalPositionsInvMassKgSha256 !==
        saved32Receipt.bindings.finalPositionsInvMassKgSha256 ||
      report.bindings.finalPositions3MSha256 !== saved32Receipt.bindings.finalPositions3MSha256 ||
      report.retainedState.currentPositionsExactAcceptedV4 !== true ||
      report.retainedState.staticPostFrameResponseInputAvailable !== true ||
      report.retainedState.exactFrameContinuationStateBytesRetained !== true ||
      report.retainedState.exactFrameContinuationExecuted !== false ||
      report.retainedState.rehydratedNextFrameParityProven !== false ||
      report.claims.genuineSavedRuntimeWrapperAuthenticated !== false ||
      report.claims.inputOwnersNotReturned !== true ||
      report.claims.continuationAuthority !== false
    )
      throw new TypeError('Saved 32F V5 state report differs from its genuine outer inputs.');

    const projection =
      projectBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5(stateOwner);
    if (!projection || projection.reportCanonicalSha256 !== report.seal.canonicalSha256)
      throw new TypeError('Saved 32F V5 state owner is not projectable after execution.');
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
      current !== report.bindings.finalPositionsInvMassKgSha256 ||
      current3 !== report.bindings.finalPositions3MSha256 ||
      previous !== report.bindings.finalPreviousPositionsInvMassKgSha256 ||
      velocities !== report.bindings.finalVelocitiesMpsSha256 ||
      distance !== report.bindings.finalDistanceLambdasKgMSha256 ||
      seam !== report.bindings.finalSeamLambdasKgMSha256 ||
      bend !== report.bindings.finalBendLambdasKgM2Sha256 ||
      continuum !== report.bindings.finalContinuumLambdasKgMSha256 ||
      topology !== report.bindings.normalizedTopologySha256
    )
      throw new TypeError('Saved 32F V5 projected state differs from report bindings.');

    const bindings = objectFreeze({
      ...report.bindings,
      stateRetentionReportCanonicalSha256: report.seal.canonicalSha256,
    });
    const claims = objectFreeze({
      savedRuntime16And32ReceiptsContentBound: true as const,
      genuineSavedRuntimeWrapperAuthenticated: false as const,
      inputOwnersNotReturnedByAdapter: true as const,
      stateOwnerReturnedForOuterWrapperRetention: true as const,
      exactAcceptedV4FinalCurrentMatched: true as const,
      finalCurrentPreviousVelocityAndLambdasRetained: true as const,
      staticPostFrameResponseInputAvailable: true as const,
      staticPostFrameResponseExecuted: false as const,
      exactFrameContinuationStateBytesRetained: true as const,
      exactFrameContinuationExecuted: false as const,
      rehydratedNextFrameParityProven: false as const,
      epsilonChanged: false as const,
      collisionPolicyChanged: false as const,
      continuationAuthority: false as const,
      collisionAuthority: false as const,
      runtimeAuthority: false as const,
      fitAuthority: false as const,
      productionAuthority: false as const,
    });
    const stableEvidence = objectFreeze({
      canonicalSha256: await payloadSha256(
        'beta-skirt-canonical-medium-saved-webgpu-32-frame-state-retention-stable-v5',
        objectFreeze({
          schemaVersion:
            BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_CANDIDATE_V5,
          saved32StableEvidenceSha256: saved32Receipt.stableEvidence.canonicalSha256,
          bindings: objectFreeze({
            ...bindings,
            saved16FrameCanonicalSha256: undefined,
            runner16FrameCanonicalSha256: undefined,
            acceptedV4RunnerCanonicalSha256: undefined,
            stateRetentionReportCanonicalSha256: undefined,
          }),
          retainedState: report.retainedState,
          config: report.config,
          workload: report.workload,
          claims,
          blockers: report.blockers,
        }),
      ),
      excludesRunnerTimingAndVolatileOwnerSeals: true as const,
    });
    const payload = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_STATE_RETENTION_CANDIDATE_V5,
      status: 'saved-32-frame-state-retained-static-response-ready-continuation-unproven' as const,
      decision:
        'PASS_EXACT_V4_FINAL_CURRENT_AND_RETAIN_DYNAMIC_STATE_WITH_CONTINUATION_BLOCKER' as const,
      bindings,
      retainedState: report.retainedState,
      stableEvidence,
      claims,
      blockers: report.blockers,
    });
    const candidate = objectFreeze({
      ...payload,
      seal: objectFreeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: await payloadSha256(
          'beta-skirt-canonical-medium-saved-webgpu-32-frame-state-retention-candidate-v5',
          payload,
        ),
        authority: 'unsigned-structural-saved-32-frame-state-retention-candidate-only' as const,
      }),
    });
    return objectFreeze({ stateOwner, stateReport: report, candidate });
  } catch (error) {
    disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5(stateOwner);
    throw error;
  }
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionCommandV5(
  owner: unknown,
): boolean {
  return disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameStateRetentionV5(owner);
}
