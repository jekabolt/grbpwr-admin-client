import { describe, expect, it } from 'vitest';

import type { BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerReportV2 } from './beta-skirt-canonical-medium-webgpu-16-frame-contact-runner-v2';
import {
  BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_EXPECTATION_V4,
  BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_OBSERVATION_V4,
  assertBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4,
  hashBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4,
  reconstructBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4,
} from './beta-skirt-canonical-medium-saved-webgpu-32-frame-checkpoint-contract-v4';

const sha = (character: string) => character.repeat(64);

const expectation = Object.freeze({
  schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_EXPECTATION_V4,
  savedRuntimeSourceCanonicalSha256: sha('1'),
  runtimeSourceCanonicalSha256: sha('2'),
  saved16FrameCanonicalSha256: sha('3'),
  runner16FrameCanonicalSha256: sha('4'),
  sourcePositions3MSha256: sha('5'),
  normalizedV5AggregateSha256: sha('6'),
  normalizedTopologySha256: sha('7'),
  seamPairsSha256: sha('8'),
  pinnedVertexIndicesSha256: sha('9'),
  bodyPositions3MSha256: sha('a'),
  bodyTrianglesSha256: sha('b'),
  positionsInvMassKgSha256: sha('c'),
  positions3MSha256: sha('d'),
  diagnosticsSha256: sha('e'),
});

const observation = Object.freeze({
  ...expectation,
  schemaVersion: BETA_SKIRT_CANONICAL_MEDIUM_SAVED_WEBGPU_32_FRAME_CHECKPOINT_OBSERVATION_V4,
  diagnosticsMatchFixedAbi: true as const,
});

function d377Report(): BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerReportV2 {
  return {
    status: 'diagnostic-completed',
    decision: 'PASS_16_FRAME_EXACT_BODY_CONTACT_AND_POSTGATE',
    execution: {
      frameSubmissionCount: 16,
      readbackSubmissionCount: 1,
      totalComputeDispatchCount: 5_104,
      positionReadbackByteLength: 9_280,
      diagnosticReadbackByteLength: 3_724,
      invalidVelocityStateCount: 0,
      numericInvalidVelocityStateCount: 0,
      outOfDomainVelocityStateCount: 0,
      bendInvalidConstraintCount: 0,
      continuumNonzeroStatusCount: 0,
      contactDispatchCount: 16,
      contactCorrectedParticleEventCount: 294,
      contactInvalidParticleCount: 0,
      contactDegenerateTriangleVisitCount: 0,
      contactOutOfRangeTriangleVisitCount: 0,
      contactMaximumCorrectionM: 0.05699925497174263,
      contactMaximumPenetrationM: 0.054999254643917084,
      contactMinimumCorrectedParticleIndex: 16,
      contactInwardNormalClampEventCount: 290,
      contactMaximumRemovedInwardNormalDeltaM: 0.07279606908559799,
      contactCorrectionCapHit: false,
      validationMessages: [],
      deviceLossMessages: [],
    },
    observations: {
      everyPositionFinite: true,
      everyInverseMassBitExact: true,
      pinnedParticleCountBitExact: 82,
      seamGapBounded: true,
    },
  } as unknown as BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerReportV2;
}

function savedReport(): BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerReportV2 {
  const report = d377Report();
  return {
    ...report,
    execution: {
      ...report.execution,
      contactCorrectedParticleEventCount: 306,
      contactMaximumCorrectionM: 0.007943540811538696,
      contactMaximumPenetrationM: 0.00594354048371315,
      contactInwardNormalClampEventCount: 306,
      contactMaximumRemovedInwardNormalDeltaM: 0.009341328404843807,
    },
  } as BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerReportV2;
}

describe('saved 32F V4 dynamic frame-16 checkpoint contract', () => {
  it('accepts arbitrary content-bound saved hashes without importing literal D-377 anchors', () => {
    expect(() =>
      assertBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4(expectation, observation),
    ).not.toThrow();
  });

  it.each([
    'savedRuntimeSourceCanonicalSha256',
    'runtimeSourceCanonicalSha256',
    'saved16FrameCanonicalSha256',
    'runner16FrameCanonicalSha256',
    'sourcePositions3MSha256',
    'normalizedV5AggregateSha256',
    'normalizedTopologySha256',
    'seamPairsSha256',
    'pinnedVertexIndicesSha256',
    'bodyPositions3MSha256',
    'bodyTrianglesSha256',
    'positionsInvMassKgSha256',
    'positions3MSha256',
    'diagnosticsSha256',
  ] as const)('rejects exact %s drift', (key) => {
    expect(() =>
      assertBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4(expectation, {
        ...observation,
        [key]: sha('f'),
      }),
    ).toThrow(new RegExp(key, 'u'));
  });

  it('rejects accessors without invoking them', () => {
    let getterCalls = 0;
    const hostile = { ...expectation } as Record<string, unknown>;
    Object.defineProperty(hostile, 'positions3MSha256', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return expectation.positions3MSha256;
      },
    });
    expect(() =>
      assertBetaSkirtCanonicalMediumSavedWebgpu32FrameCheckpointV4(hostile, observation),
    ).toThrow(/own enumerable data/iu);
    expect(getterCalls).toBe(0);
  });

  it('reconstructs the complete frozen fixed ABI and reproduces the independent D-377 hash', async () => {
    const bytes =
      reconstructBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4(d377Report());
    expect(bytes.byteLength).toBe(3_724);
    await expect(
      hashBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4(d377Report()),
    ).resolves.toBe('91beac143ffc192fc0c60fa0adc5e316f8b32596718b248163433e4a745bbb98');
  });

  it('reproduces the genuine saved 16F diagnostic hash from its successful receipt tuple', async () => {
    await expect(
      hashBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4(savedReport()),
    ).resolves.toBe('8d08e4859cd7f2245ea0fb95884ddcd9d5e8ce364ec1949daacbfb30983c8b98');
  });

  it('fails closed when the successful 16F report does not prove fixed ABI invariants', () => {
    const report = d377Report() as unknown as {
      execution: { continuumNonzeroStatusCount: number };
    };
    report.execution.continuumNonzeroStatusCount = 1;
    expect(() =>
      reconstructBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4(
        report as unknown as BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerReportV2,
      ),
    ).toThrow(/fixed diagnostic ABI/iu);
  });

  it('rejects drift in fixed readback, contact-dispatch, and cap invariants', () => {
    const invalidExecutions = [
      { ...d377Report().execution, positionReadbackByteLength: 9_276 },
      { ...d377Report().execution, contactDispatchCount: 15 },
      { ...d377Report().execution, contactCorrectionCapHit: true },
    ];
    for (const execution of invalidExecutions)
      expect(() =>
        reconstructBetaSkirtCanonicalMedium16FrameDiagnosticBytesForSaved32V4({
          ...d377Report(),
          execution,
        } as BetaSkirtCanonicalMediumWebgpu16FrameContactRunnerReportV2),
      ).toThrow(/fixed diagnostic ABI/iu);
  });
});
