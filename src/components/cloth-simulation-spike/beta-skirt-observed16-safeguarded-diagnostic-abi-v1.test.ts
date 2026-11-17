import { describe, expect, it } from 'vitest';
import {
  XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2,
  XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2,
} from 'lib/cloth/runtime/webgpu/xpbd-embedded-scalar-bend-kernel-v2';
import {
  assertBetaSkirtObserved16SafeguardedDiagnosticCheckpointV1 as checkpoint,
  serializeBetaSkirtObserved16SafeguardedDiagnosticAbiV1 as serialize,
  type BetaSkirtObserved16SafeguardedDiagnosticAbiFieldsV1 as Fields,
} from './beta-skirt-observed16-safeguarded-diagnostic-abi-v1';

// Synthetic scalar/byte fixtures exercise serialization only. No genuine owner, physical
// admission, browser, GPU execution, stable garment or solver convergence is claimed here.
function report(): Fields {
  return {
    schemaVersion: 'beta-skirt-saved-annular-observed-placement-16-frame-contact/1',
    sourceKind: 'saved-annular-observed-placement-v3',
    status: 'diagnostic-completed',
    decision: 'PASS_16_FRAME_EXACT_BODY_CONTACT_AND_POSTGATE',
    execution: {
      frameSubmissionCount: 16,
      readbackSubmissionCount: 1,
      totalComputeDispatchCount: 5104,
      positionReadbackByteLength: 9280,
      diagnosticReadbackByteLength: 3728,
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
      contactMaximumCorrectionM: 0.03125,
      contactMaximumPenetrationM: 0.015625,
      contactMinimumCorrectedParticleIndex: 16,
      contactInwardNormalClampEventCount: 290,
      contactMaximumRemovedInwardNormalDeltaM: 0.0625,
      contactCorrectionCapHit: false,
      totalFrameExecutionWallTimeMs: 1,
      maximumFrameExecutionWallTimeMs: 1,
      validationMessages: [],
      deviceLossMessages: [],
    },
    observations: {
      everyPositionFinite: true,
      everyInverseMassBitExact: true,
      pinnedParticleCountBitExact: 82,
      seamGapBounded: true,
      sourceAndFinalPositionsDiffer: true,
      finalHashBoundToCollisionInput: true,
      staleSourceCollisionHashRejectedByConstruction: true,
      initialMaximumSeamGapM: 0,
      finalMaximumSeamGapM: 0,
      seamGapLimitM: 0.001,
    },
    quality: {
      status: 'measured-structural-evidence',
      evidenceOnly: true,
      distortionAcceptanceThresholdFrozen: false,
      blockers: [],
      maximumDisplacementM: 0.03,
      maximumLengthRatio: 1.1,
      minimumAreaRatio: 0.9,
      normalReversalCount: 0,
    },
    bendSolver: {
      kernel: XPBD_EMBEDDED_SCALAR_BEND_KERNEL_V2,
      sourceSha256: XPBD_EMBEDDED_SCALAR_BEND_SOURCE_SHA256_V2,
      stepBound: 'minimum-current-triangle-altitude-divided-by-eight',
      limitedStepCount: 10216,
      diagnosticsByteLength: 8,
    },
  };
}

function change(input: Fields, path: string, value: unknown): Fields {
  const keys = path.split('.');
  let current = input as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) current = current[key] as Record<string, unknown>;
  current[keys[keys.length - 1]!] = value;
  return input;
}

function nonzeroBytes(): Uint8Array {
  // Independently specified little-endian ABI words; no report or serializer consulted.
  const bytes = new Uint8Array(3728);
  const view = new DataView(bytes.buffer);
  for (const [offset, word] of [
    [12, 0xffffffff],
    [16, 0xffffffff],
    [20, 0xffffffff],
    [36, 10216],
    [3688, 294],
    [3704, 0x3d000000],
    [3708, 0x3c800000],
    [3712, 16],
    [3716, 290],
    [3720, 0x3d800000],
  ])
    view.setUint32(offset!, word!, true);
  return bytes;
}

function zeroContactReport(): Fields {
  const result = report();
  for (const [key, value] of Object.entries({
    contactCorrectedParticleEventCount: 0,
    contactMaximumCorrectionM: 0,
    contactMaximumPenetrationM: 0,
    contactMinimumCorrectedParticleIndex: null,
    contactInwardNormalClampEventCount: 0,
    contactMaximumRemovedInwardNormalDeltaM: 0,
  }))
    change(result, `execution.${key}`, value);
  return result;
}

describe('observed16 safeguarded ABI: synthetic serialization, never owner authority', () => {
  it('matches every independently specified byte, including limited@36 and continuum@40', () => {
    const actual = nonzeroBytes();
    expect(serialize(report())).toEqual(actual);
    expect(actual.slice(32, 40)).toEqual(new Uint8Array([0, 0, 0, 0, 232, 39, 0, 0]));
    expect(actual.slice(40, 3688).every((byte) => byte === 0)).toBe(true);
    expect(() => checkpoint(report(), actual)).not.toThrow();
    expect(actual).toEqual(nonzeroBytes());
  });

  it('accepts legitimate zero contacts and writes the untouched minimum-index sentinel', () => {
    const input = zeroContactReport();
    const expected = nonzeroBytes();
    expected.fill(0, 3688);
    new DataView(expected.buffer).setUint32(3712, 0xffffffff, true);
    expect(serialize(input)).toEqual(expected);
    expect(() => checkpoint(input, expected)).not.toThrow();
  });

  it('admits both bounded telemetry endpoints and zero inward clamping with real contacts', () => {
    for (const limited of [0, 1246 * 8 * 16]) {
      const input = change(report(), 'bendSolver.limitedStepCount', limited);
      change(input, 'execution.contactCorrectedParticleEventCount', 498 * 16);
      change(input, 'execution.contactMinimumCorrectedParticleIndex', 579);
      change(input, 'execution.contactInwardNormalClampEventCount', 0);
      change(input, 'execution.contactMaximumRemovedInwardNormalDeltaM', 0);
      expect(new DataView(serialize(input).buffer).getUint32(36, true)).toBe(limited);
    }
  });

  it.each([
    ['schemaVersion', 'beta-skirt-canonical-medium-webgpu-16-frame-contact-runner/2'],
    ['sourceKind', 'canonical-medium'],
    ['status', 'blocked'],
    ['decision', 'BLOCKED'],
    ['bendSolver.kernel', 'xpbd-embedded-scalar-bend-kernel/v1'],
    ['bendSolver.sourceSha256', '0'.repeat(64)],
    ['bendSolver.stepBound', 'rest-altitude-divided-by-eight'],
    ['bendSolver.diagnosticsByteLength', 4],
    ['bendSolver.limitedStepCount', 1246 * 8 * 16 + 1],
    ['bendSolver.limitedStepCount', 0xffffffff],
    ['bendSolver.limitedStepCount', -1],
    ['bendSolver.limitedStepCount', 1.5],
    ['bendSolver.limitedStepCount', -0],
    ['bendSolver.limitedStepCount', NaN],
    ['bendSolver.limitedStepCount', Infinity],
    ['execution.frameSubmissionCount', 15],
    ['execution.readbackSubmissionCount', 2],
    ['execution.totalComputeDispatchCount', 5103],
    ['execution.positionReadbackByteLength', 9276],
    ['execution.diagnosticReadbackByteLength', 3724],
    ['execution.contactDispatchCount', 15],
    ['execution.invalidVelocityStateCount', 1],
    ['execution.numericInvalidVelocityStateCount', 1],
    ['execution.outOfDomainVelocityStateCount', 1],
    ['execution.bendInvalidConstraintCount', 1],
    ['execution.continuumNonzeroStatusCount', 1],
    ['execution.contactInvalidParticleCount', 1],
    ['execution.contactDegenerateTriangleVisitCount', 1],
    ['execution.contactOutOfRangeTriangleVisitCount', 1],
    ['execution.contactCorrectionCapHit', true],
    ['execution.contactCorrectionCapHit', undefined],
    ['execution.validationMessages', ['validation error']],
    ['execution.deviceLossMessages', ['device lost']],
    ['execution.validationMessages', { length: 0 }],
    ['observations.everyPositionFinite', false],
    ['observations.everyInverseMassBitExact', false],
    ['observations.pinnedParticleCountBitExact', 81],
    ['observations.seamGapBounded', false],
    ['quality.normalReversalCount', 1],
    ['quality.normalReversalCount', null],
    ['execution.contactCorrectedParticleEventCount', 498 * 16 + 1],
    ['execution.contactCorrectedParticleEventCount', 0.5],
    ['execution.contactMinimumCorrectedParticleIndex', 580],
    ['execution.contactMinimumCorrectedParticleIndex', null],
    ['execution.contactInwardNormalClampEventCount', 295],
    ['execution.contactMaximumCorrectionM', 0],
    ['execution.contactMaximumCorrectionM', 0.125],
    ['execution.contactMaximumCorrectionM', Math.fround(0.08)],
    ['execution.contactMaximumCorrectionM', Infinity],
    ['execution.contactMaximumCorrectionM', 0.03],
    ['execution.contactMaximumPenetrationM', 0.0625],
    ['execution.contactMaximumPenetrationM', -1],
    ['execution.contactMaximumRemovedInwardNormalDeltaM', 0],
    ['execution.contactMaximumRemovedInwardNormalDeltaM', NaN],
  ])('rejects inconsistent scalar %s=%s', (path, value) => {
    expect(() => serialize(change(report(), path as string, value))).toThrow(TypeError);
  });

  it.each([
    ['contactMaximumCorrectionM', 0.03125],
    ['contactMaximumPenetrationM', 0.015625],
    ['contactMinimumCorrectedParticleIndex', 0],
    ['contactInwardNormalClampEventCount', 1],
    ['contactMaximumRemovedInwardNormalDeltaM', 0.0625],
  ])('rejects zero-event tuple drift in %s', (key, value) => {
    expect(() => serialize(change(zeroContactReport(), `execution.${key}`, value))).toThrow(
      TypeError,
    );
  });

  it('rejects accessor or unexpected bend fields without invoking a getter', () => {
    let calls = 0;
    const input = report();
    Object.defineProperty(input.bendSolver, 'limitedStepCount', {
      enumerable: true,
      get() {
        calls += 1;
        return 0;
      },
    });
    expect(() => serialize(input)).toThrow(TypeError);
    expect(calls).toBe(0);
    expect(() => serialize(change(report(), 'bendSolver.extra', 0))).toThrow(TypeError);
    const executionAccessor = report();
    Object.defineProperty(executionAccessor, 'execution', {
      enumerable: true,
      get() {
        calls += 1;
        return report().execution;
      },
    });
    expect(() => serialize(executionAccessor)).toThrow(TypeError);
    expect(calls).toBe(0);
  });

  it.each([0, 12, 32, 36, 40, 3684, 3688, 3712, 3724])(
    'rejects checkpoint drift at byte %i',
    (offset) => {
      const actual = nonzeroBytes();
      actual[offset] = actual[offset]! ^ 1;
      expect(() => checkpoint(report(), actual)).toThrow(/differs at byte/);
    },
  );

  it('rejects limiter receipt drift, canonical length, excess bytes and structural bytes', () => {
    expect(() =>
      checkpoint(change(report(), 'bendSolver.limitedStepCount', 10217), nonzeroBytes()),
    ).toThrow(/byte 36/);
    expect(() => checkpoint(report(), new Uint8Array(3724))).toThrow(/3,728/);
    expect(() => checkpoint(report(), new Uint8Array(3729))).toThrow(/3,728/);
    expect(() => checkpoint(report(), { length: 3728 } as Uint8Array)).toThrow(TypeError);
    expect(() => checkpoint(report(), new Proxy(nonzeroBytes(), {}))).toThrow(TypeError);
  });

  it('returns detached bytes on every call without altering the scalar report', () => {
    const input = report();
    const before = JSON.stringify(input);
    const first = serialize(input);
    first.fill(255);
    expect(serialize(input)).toEqual(nonzeroBytes());
    expect(JSON.stringify(input)).toBe(before);
  });
});
