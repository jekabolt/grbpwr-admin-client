import type { BetaSkirtCanonicalMediumSavedRuntime16FrameReceiptV1 } from './beta-skirt-canonical-medium-saved-runtime-source-v1';
import type { BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1 } from './beta-skirt-canonical-medium-saved-runtime-source-v1';
import type { BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2 } from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';
import type { BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1 } from './beta-skirt-canonical-medium-webgpu-runtime-source-v1';
import {
  BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_EXPECTATION_V4,
  snapshotBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-checkpoint-contract-v4';
import {
  disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4,
  projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4,
  runBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOptionsV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4,
  type BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerReportV4,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-contact-runner-v4';

export const BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_COMMAND_CANDIDATE_V4 =
  'beta-skirt-canonical-medium-saved-webgpu-32-frame-command-candidate/4' as const;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameCommandOptionsV4 =
  BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOptionsV4;

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const HEX = '0123456789abcdef';
const objectFreeze = Object.freeze;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const reflectApply = Reflect.apply;
const jsonStringify = JSON.stringify;
const textEncoderEncode = objectGetOwnPropertyDescriptor(TextEncoder.prototype, 'encode')?.value;
const dataViewSetFloat32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setFloat32')?.value;
const dataViewSetUint32 = objectGetOwnPropertyDescriptor(DataView.prototype, 'setUint32')?.value;
const capturedSubtle = globalThis.crypto?.subtle;
const subtleDigest =
  typeof SubtleCrypto === 'undefined'
    ? null
    : objectGetOwnPropertyDescriptor(SubtleCrypto.prototype, 'digest')?.value;
const arrayBufferPrototype = ArrayBuffer.prototype;
const CapturedDataView = DataView;
const CapturedUint8Array = Uint8Array;
const encoder = new TextEncoder();

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameCommandCandidateV4 = Readonly<{
  schemaVersion: typeof BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_COMMAND_CANDIDATE_V4;
  status: 'saved-dxf-32-frame-contact-clear-downstream-blocked-diagnostic';
  decision: 'MEASURED_32_FRAME_EXACT_BODY_CONTACT_AND_STRUCTURAL_POSTGATE_CLEAR_WITH_DOWNSTREAM_BLOCKERS';
  bindings: Readonly<
    BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerReportV4['bindings'] & {
      v4RunnerReportCanonicalSha256: string;
    }
  >;
  stableEvidence: Readonly<{
    canonicalSha256: string;
    excludesRunnerTimingAndVolatileRunnerSeal: true;
  }>;
  claims: Readonly<{
    savedRuntimeSnapshotAnd16FrameReceiptContentBound: true;
    genuineSavedRuntimeWrapperAuthenticated: false;
    baseRuntimeAnd16FrameOwnersNotReturnedByAdapter: true;
    v4OwnerReturnedForOuterWrapperRetention: true;
    exactFrame16ProjectionIndependentlyHashed: true;
    exactFinalProjectionIndependentlyHashed: true;
    exactTopologyProjectionIndependentlyHashed: true;
    unchangedV3SolverBodyExecutedByAdditiveV4: true;
    exactActualBodyPostgateClear: true;
    postFrameSelfOrientationEvaluated: false;
    strainUtilizationEvaluated: false;
    collisionAuthority: false;
    runtimeAuthority: false;
    fitAuthority: false;
    productionAuthority: false;
  }>;
  blockers: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerReportV4['blockers'];
  seal: Readonly<{
    algorithm: 'SHA-256';
    canonicalSha256: string;
    authority: 'unsigned-structural-saved-32-frame-content-candidate-only';
  }>;
}>;

export type BetaSkirtCanonicalMediumSavedWebgpu32FrameCommandExecutionV4 = Readonly<{
  runnerOwner: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerOwnerV4;
  runnerReport: BetaSkirtCanonicalMediumSavedWebgpu32FrameContactRunnerReportV4;
  candidate: BetaSkirtCanonicalMediumSavedWebgpu32FrameCommandCandidateV4;
}>;

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
  let output = '';
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
    `${domain}\n${jsonStringify(payload)}`,
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

/**
 * Content-only mapping used by the fixed outer command. It does not authenticate that either
 * structural argument came from a live saved wrapper; only the wrapper's private WeakMap can do
 * that before and after invoking this adapter.
 */
export function deriveBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  saved16FrameReceipt: BetaSkirtCanonicalMediumSavedRuntime16FrameReceiptV1,
): BetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4 {
  if (
    saved16FrameReceipt.status !== 'saved-dxf-16-frame-contact-clear-diagnostic' ||
    saved16FrameReceipt.decision !== 'PASS_SAVED_DXF_16_FRAME_EXACT_BODY_CONTACT_AND_POSTGATE' ||
    saved16FrameReceipt.seal.algorithm !== 'SHA-256' ||
    saved16FrameReceipt.bindings.savedRuntimeSourceCanonicalSha256 !==
      snapshot.seal.canonicalSha256 ||
    saved16FrameReceipt.bindings.issuingSessionGeneration !== snapshot.issuingSessionGeneration ||
    saved16FrameReceipt.bindings.baseRuntimeSourceCanonicalSha256 !==
      snapshot.bindings.runtimeSourceCanonicalSha256 ||
    saved16FrameReceipt.bindings.sourcePositions3MSha256 !==
      snapshot.bindings.sourcePositions3MSha256 ||
    saved16FrameReceipt.bindings.normalizedV5AggregateSha256 !==
      snapshot.bindings.normalizedV5AggregateSha256 ||
    saved16FrameReceipt.bindings.normalizedTopologySha256 !==
      snapshot.bindings.normalizedTopologySha256 ||
    saved16FrameReceipt.bindings.seamPairsSha256 !== snapshot.bindings.seamPairsSha256 ||
    saved16FrameReceipt.bindings.pinnedVertexIndicesSha256 !==
      snapshot.bindings.pinnedVertexIndicesSha256 ||
    saved16FrameReceipt.bindings.bodyPositionsRawSha256 !==
      snapshot.bindings.bodyPositionsRawSha256 ||
    saved16FrameReceipt.bindings.bodyTrianglesRawSha256 !==
      snapshot.bindings.bodyTrianglesRawSha256 ||
    saved16FrameReceipt.bindings.diagnosticSnapshotSha256 !==
      saved16FrameReceipt.diagnosticSnapshot.canonicalSha256 ||
    saved16FrameReceipt.claims.genuineSavedRuntimeWrapperAuthenticated !== true ||
    saved16FrameReceipt.claims.exactAdapterCandidatePrivatelyAssociated !== true ||
    saved16FrameReceipt.claims.baseRuntimeOwnerStayedPrivate !== true ||
    saved16FrameReceipt.claims.runnerOwnerStayedPrivate !== true ||
    saved16FrameReceipt.claims.unchanged16FrameRunnerExecuted !== true ||
    saved16FrameReceipt.claims.exactFinalVec4IndependentlyHashed !== true ||
    saved16FrameReceipt.claims.exactFinalVec3MatchesRunnerReceipt !== true ||
    saved16FrameReceipt.claims.exactActualBodyPostgateClear !== true
  )
    throw new TypeError('Genuine saved 16F receipt differs from its saved runtime snapshot.');

  return snapshotBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointExpectationV4(
    objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_EXPECTATION_V4,
      savedRuntimeSourceCanonicalSha256: snapshot.seal.canonicalSha256,
      runtimeSourceCanonicalSha256: snapshot.bindings.runtimeSourceCanonicalSha256,
      saved16FrameCanonicalSha256: saved16FrameReceipt.seal.canonicalSha256,
      runner16FrameCanonicalSha256: saved16FrameReceipt.bindings.runnerReportCanonicalSha256,
      sourcePositions3MSha256: saved16FrameReceipt.bindings.sourcePositions3MSha256,
      normalizedV5AggregateSha256: saved16FrameReceipt.bindings.normalizedV5AggregateSha256,
      normalizedTopologySha256: saved16FrameReceipt.bindings.normalizedTopologySha256,
      seamPairsSha256: saved16FrameReceipt.bindings.seamPairsSha256,
      pinnedVertexIndicesSha256: saved16FrameReceipt.bindings.pinnedVertexIndicesSha256,
      bodyPositions3MSha256: saved16FrameReceipt.bindings.bodyPositionsRawSha256,
      bodyTrianglesSha256: saved16FrameReceipt.bindings.bodyTrianglesRawSha256,
      positionsInvMassKgSha256: saved16FrameReceipt.bindings.finalPositionsInvMassKgSha256,
      positions3MSha256: saved16FrameReceipt.bindings.finalPositions3MSha256,
      diagnosticsSha256: saved16FrameReceipt.bindings.diagnosticSnapshotSha256,
    }),
  );
}

/**
 * Fixed adapter invoked only by the saved wrapper's private command. The base and 16F owners are
 * consumed as capabilities but never returned. The new V4 owner is transferred to the caller for
 * private outer-wrapper retention; callers must dispose it if they reject the candidate.
 */
export async function executeBetaSkirtCanonicalMediumSavedWebgpu32FrameCommandV4(
  snapshot: BetaSkirtCanonicalMediumSavedRuntimeSourceSnapshotV1,
  saved16FrameReceipt: BetaSkirtCanonicalMediumSavedRuntime16FrameReceiptV1,
  runtimeSourceOwner: BetaSkirtCanonicalMediumWebgpuRuntimeSourceOwnerV1,
  runner16FrameOwner: BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerOwnerV2,
  canvas: HTMLCanvasElement,
  options: BetaSkirtCanonicalMediumSavedWebgpu32FrameCommandOptionsV4 = {},
): Promise<BetaSkirtCanonicalMediumSavedWebgpu32FrameCommandExecutionV4> {
  const checkpointExpectation = deriveBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4(
    snapshot,
    saved16FrameReceipt,
  );
  await validateDigestAuthority();
  const result = await runBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(
    canvas,
    runtimeSourceOwner,
    runner16FrameOwner,
    checkpointExpectation,
    options,
  );
  if (result.ok) {
    disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(result.owner);
    throw new TypeError(
      'Saved 32F V4 unexpectedly omitted its required downstream evidence blockers.',
    );
  }
  if (result.code !== 'post-frame-evidence-not-evaluated' || !result.owner) {
    if (result.owner) disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(result.owner);
    throw new TypeError(`Saved 32F V4 blocked: ${result.code}: ${result.detail}`);
  }

  const runnerOwner = result.owner;
  try {
    const report = result.report;
    if (
      !report ||
      report.status !== 'diagnostic-blocked' ||
      report.decision !==
        'MEASURED_32_FRAME_EXACT_BODY_CONTACT_AND_STRUCTURAL_POSTGATE_CLEAR_WITH_DOWNSTREAM_BLOCKERS' ||
      report.bindings.savedRuntimeSourceCanonicalSha256 !==
        checkpointExpectation.savedRuntimeSourceCanonicalSha256 ||
      report.bindings.saved16FrameCanonicalSha256 !==
        checkpointExpectation.saved16FrameCanonicalSha256 ||
      report.bindings.runner16FrameCanonicalSha256 !==
        checkpointExpectation.runner16FrameCanonicalSha256 ||
      report.bindings.runtimeSourceCanonicalSha256 !==
        checkpointExpectation.runtimeSourceCanonicalSha256 ||
      report.bindings.frame16CheckpointPositionsInvMassKgSha256 !==
        checkpointExpectation.positionsInvMassKgSha256 ||
      report.bindings.frame16CheckpointPositions3MSha256 !==
        checkpointExpectation.positions3MSha256 ||
      report.bindings.frame16CheckpointDiagnosticsSha256 !==
        checkpointExpectation.diagnosticsSha256 ||
      report.execution.frame16CheckpointExactSaved16Parity !== true ||
      report.execution.contactCorrectionCapHit ||
      report.execution.invalidVelocityStateCount !== 0 ||
      report.execution.numericInvalidVelocityStateCount !== 0 ||
      report.execution.outOfDomainVelocityStateCount !== 0 ||
      report.execution.bendInvalidConstraintCount !== 0 ||
      report.execution.continuumNonzeroStatusCount !== 0 ||
      report.execution.contactInvalidParticleCount !== 0 ||
      report.execution.contactDegenerateTriangleVisitCount !== 0 ||
      report.execution.contactOutOfRangeTriangleVisitCount !== 0 ||
      report.observations.frame16CheckpointPositionsMatchSaved16 !== true ||
      report.observations.frame16CheckpointDiagnosticsMatchSaved16 !== true ||
      report.quality.blockers.length !== 0 ||
      report.collision.exactActualBodyGateClear !== true ||
      report.claims.exactSaved16FramePrefixProven !== true ||
      report.claims.savedLineageAuthenticatedByOuterWrapper !== false
    )
      throw new TypeError('Saved 32F V4 report does not establish the fixed adapter gates.');

    const projection = projectBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(runnerOwner);
    if (!projection || projection.reportCanonicalSha256 !== report.seal.canonicalSha256)
      throw new TypeError('Saved 32F V4 owner is not projectable after execution.');
    const [checkpointVec4, checkpointVec3, finalVec4, finalVec3, topology] = await Promise.all([
      float32LeSha256(projection.frame16CheckpointPositionsInvMassKg),
      float32LeSha256(projection.frame16CheckpointPositions3M),
      float32LeSha256(projection.finalPositionsInvMassKg),
      float32LeSha256(projection.finalPositions3M),
      uint32LeSha256(projection.normalizedTriangles),
    ]);
    if (
      checkpointVec4 !== checkpointExpectation.positionsInvMassKgSha256 ||
      checkpointVec3 !== checkpointExpectation.positions3MSha256 ||
      finalVec4 !== report.bindings.finalPositionsInvMassKgSha256 ||
      finalVec3 !== report.bindings.finalPositions3MSha256 ||
      topology !== report.bindings.normalizedTopologySha256
    )
      throw new TypeError('Saved 32F V4 projected bytes differ from their report bindings.');

    const bindings = objectFreeze({
      ...report.bindings,
      v4RunnerReportCanonicalSha256: report.seal.canonicalSha256,
    });
    const claims = objectFreeze({
      savedRuntimeSnapshotAnd16FrameReceiptContentBound: true as const,
      genuineSavedRuntimeWrapperAuthenticated: false as const,
      baseRuntimeAnd16FrameOwnersNotReturnedByAdapter: true as const,
      v4OwnerReturnedForOuterWrapperRetention: true as const,
      exactFrame16ProjectionIndependentlyHashed: true as const,
      exactFinalProjectionIndependentlyHashed: true as const,
      exactTopologyProjectionIndependentlyHashed: true as const,
      unchangedV3SolverBodyExecutedByAdditiveV4: true as const,
      exactActualBodyPostgateClear: true as const,
      postFrameSelfOrientationEvaluated: false as const,
      strainUtilizationEvaluated: false as const,
      collisionAuthority: false as const,
      runtimeAuthority: false as const,
      fitAuthority: false as const,
      productionAuthority: false as const,
    });
    const stablePayload = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_COMMAND_CANDIDATE_V4,
      saved16FrameStableEvidenceSha256: saved16FrameReceipt.stableEvidence.canonicalSha256,
      bindings: objectFreeze({
        ...bindings,
        saved16FrameCanonicalSha256: undefined,
        runner16FrameCanonicalSha256: undefined,
        v4RunnerReportCanonicalSha256: undefined,
      }),
      runner: objectFreeze({
        ...report,
        bindings: objectFreeze({
          ...report.bindings,
          saved16FrameCanonicalSha256: undefined,
          runner16FrameCanonicalSha256: undefined,
        }),
        execution: objectFreeze({
          ...report.execution,
          totalFrameExecutionWallTimeMs: undefined,
          maximumFrameExecutionWallTimeMs: undefined,
        }),
        seal: undefined,
      }),
      claims,
      blockers: report.blockers,
    });
    const stableEvidence = objectFreeze({
      canonicalSha256: await payloadSha256(
        'beta-skirt-canonical-medium-saved-webgpu-32-frame-command-stable-evidence-v4',
        stablePayload,
      ),
      excludesRunnerTimingAndVolatileRunnerSeal: true as const,
    });
    const payload = objectFreeze({
      schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_COMMAND_CANDIDATE_V4,
      status: 'saved-dxf-32-frame-contact-clear-downstream-blocked-diagnostic' as const,
      decision:
        'MEASURED_32_FRAME_EXACT_BODY_CONTACT_AND_STRUCTURAL_POSTGATE_CLEAR_WITH_DOWNSTREAM_BLOCKERS' as const,
      bindings,
      stableEvidence,
      claims,
      blockers: report.blockers,
    });
    const candidate = objectFreeze({
      ...payload,
      seal: objectFreeze({
        algorithm: 'SHA-256' as const,
        canonicalSha256: await payloadSha256(
          'beta-skirt-canonical-medium-saved-webgpu-32-frame-command-candidate-v4',
          payload,
        ),
        authority: 'unsigned-structural-saved-32-frame-content-candidate-only' as const,
      }),
    }) satisfies BetaSkirtCanonicalMediumSavedWebgpu32FrameCommandCandidateV4;
    return objectFreeze({ runnerOwner, runnerReport: report, candidate });
  } catch (error) {
    disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(runnerOwner);
    throw error;
  }
}

export function disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameCommandV4(
  owner: unknown,
): boolean {
  return disposeBetaSkirtCanonicalMediumSavedWebgpu32FrameContactV4(owner);
}
