import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it, vi } from 'vitest';

import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { createMakeHumanUniformWaistHipModesV1 } from './makehuman-uniform-waist-hip-modes-v1';
import {
  deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1,
  parseMakeHumanWaistHipRigAnchorDeltaBundleV1,
} from './makehuman-waist-hip-rig-anchor-research-v1';
import {
  CANONICAL_BODY_MEASUREMENTS_VERSION,
  type CanonicalBodyMeasurementsMm,
} from './measurement-adapter';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import { evaluateMeasurementOpenReferenceDisplayQualityV1 } from './measurement-open-reference-display-quality-gate-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import { createMeasurementOpenReferenceDisplayPoseRuntimeV1 } from './measurement-open-reference-display-pose-runtime-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import {
  createMeasurementOpenReferenceUniformWaistHipRuntimeV1,
  UNIFORM_WAIST_HIP_WIDENED_COEFFICIENTS_V1,
} from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import {
  solveOpenReferenceUniformWaistHipV1,
  UNIFORM_WAIST_HIP_MAXIMUM_EXTRAPOLATION_COEFFICIENT_V1,
  type UniformWaistHipSolverModeResultV1,
} from './measurement-open-reference-uniform-waist-hip-solver-v1';

const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);
const poseMetadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
const poseResources = Object.freeze({
  rig: parseMakeHumanCoreRigBundleV1(
    readFileSync(resolve(process.cwd(), poseMetadata.rigAssetPath)),
  ),
  anchors: parseMakeHumanWaistHipRigAnchorDeltaBundleV1(
    readFileSync(resolve(process.cwd(), poseMetadata.anchorAssetPath)),
    {
      byteLength: poseMetadata.anchorByteLength,
      sourceRigBundleSha256: poseMetadata.rigSha256,
      sourceTorsoBundleSha256: poseMetadata.torsoDirectionBundleSha256,
    },
  ),
});
const maleBasis = parseMakeHumanOpenReferenceBasisV1(
  readFileSync(resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1.male.assetPath)),
  'male',
);

/**
 * ANSUR II subject 12377 (male, the p1 waist of the male pool): stature 1801, biacromial 393,
 * chest 875, waist 725, buttock 867, sleeve outseam 579, crotch height 845 mm. His hip is below
 * the male asset's narrowest endpoint, so the bounded solve stops it short (limited).
 */
const SUBJECT_12377: CanonicalBodyMeasurementsMm = Object.freeze({
  schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
  heightMm: 1801,
  shoulderBreadthMm: 393,
  chestCircumferenceMm: 875,
  waistCircumferenceMm: 725,
  hipCircumferenceMm: 867,
  armLengthMm: 579,
  inseamMm: 845,
});

function openReferenceOf(measurements: CanonicalBodyMeasurementsMm) {
  const frame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: 'range-widening-test',
    pose: 'A',
  });
  return createMeasurementOpenReferenceUniformHeightDisplayV1({ basis: maleBasis, frame });
}

function runtimeOf(
  extra: Partial<Parameters<typeof createMeasurementOpenReferenceUniformWaistHipRuntimeV1>[0]>,
) {
  return createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
    basis: maleBasis,
    measurements: SUBJECT_12377,
    openReference: openReferenceOf(SUBJECT_12377),
    loadBundle: async () => torsoBundle,
    ...extra,
  });
}

const coefficientOf = (
  modeResults: readonly UniformWaistHipSolverModeResultV1[],
  key: UniformWaistHipSolverModeResultV1['measurementKey'],
) => modeResults.find((mode) => mode.measurementKey === key)?.coefficient ?? null;

describe('waist/hip solver extrapolation ceiling', () => {
  const modes = createMakeHumanUniformWaistHipModesV1({
    basis: maleBasis,
    heightMm: SUBJECT_12377.heightMm,
    bundle: torsoBundle,
  });
  const solve = (policy?: Parameters<typeof solveOpenReferenceUniformWaistHipV1>[0]['policy']) =>
    solveOpenReferenceUniformWaistHipV1({
      uniformPositionsM: modes.uniformPositionsM,
      triangleIndices: maleBasis.indices,
      measurements: { waistCircumferenceMm: 725, hipCircumferenceMm: 867 },
      modes: modes.modes,
      policy,
    });

  it('keeps the finite asset (1) as the default and widens only the named key', () => {
    const bounded = solve();
    expect(Buffer.from(solve({ maximumCoefficient: 1 }).positionsM.buffer)).toEqual(
      Buffer.from(bounded.positionsM.buffer),
    );
    expect(
      bounded.diagnostics.map(({ measurementKey, code }) => `${measurementKey}:${code}`),
    ).toEqual(['hipCircumferenceMm:target-limited']);
    expect(coefficientOf(bounded.modeResults, 'hipCircumferenceMm')).toBeNull();
    const widened = solve({ maximumCoefficientByKey: { hipCircumferenceMm: 2 } });
    expect(widened.representedMeasurements).toEqual(['waistCircumferenceMm', 'hipCircumferenceMm']);
    expect(coefficientOf(widened.modeResults, 'hipCircumferenceMm')).toBeGreaterThan(1);
    // Waist was never limited: its solve is untouched by the hip's ceiling.
    expect(
      widened.modeResults.find((mode) => mode.measurementKey === 'waistCircumferenceMm'),
    ).toEqual(bounded.modeResults.find((mode) => mode.measurementKey === 'waistCircumferenceMm'));
  });

  it('rejects ceilings outside 1..3', () => {
    expect(UNIFORM_WAIST_HIP_MAXIMUM_EXTRAPOLATION_COEFFICIENT_V1).toBe(3);
    expect(() => solve({ maximumCoefficient: 0.5 })).toThrow(RangeError);
    expect(() => solve({ maximumCoefficient: 3.5 })).toThrow(RangeError);
    expect(() => solve({ maximumCoefficientByKey: { waistCircumferenceMm: 4 } })).toThrow(
      RangeError,
    );
  });
});

describe('waist/hip runtime safe-range widening', () => {
  it('widens a limited hip behind the real self-intersection gate and still poses', async () => {
    const bounded = await runtimeOf({});
    expect(bounded.status).toBe('partial');
    expect(bounded.diagnostics.map(({ code }) => code)).toEqual(['target-limited']);

    const widened = await runtimeOf({ widenSafeRange: true });
    expect(widened.status).toBe('represented');
    const widenedCodes = widened.diagnostics.map(
      ({ measurementKey, code }) => `${measurementKey}:${code}`,
    );
    expect(widenedCodes).toEqual(['hipCircumferenceMm:range-widened']);
    const hip = widened.modeResults.find((mode) => mode.measurementKey === 'hipCircumferenceMm')!;
    expect(hip.coefficient).toBeGreaterThan(1);
    expect(hip.coefficient).toBeLessThanOrEqual(UNIFORM_WAIST_HIP_WIDENED_COEFFICIENTS_V1[0]);
    expect(Math.abs(hip.residualMm)).toBeLessThan(5);
    // The bound receipt stays the local gate, recomputable by the linked pose runtime.
    expect(JSON.stringify(widened.qualityGate)).toBe(
      JSON.stringify(
        evaluateMeasurementOpenReferenceDisplayQualityV1({
          uniformPositionsM: widened.openReference.mesh.positions,
          personalizedPositionsM: widened.displayMesh.positions,
          triangleIndices: widened.openReference.mesh.indices,
        }),
      ),
    );
    // Rig anchors follow the extrapolated field: posing keeps joint pivots continuous.
    const posed = await createMeasurementOpenReferenceDisplayPoseRuntimeV1({
      basis: maleBasis,
      measurements: SUBJECT_12377,
      proxyRuntime: widened,
      presetId: 'near-t',
      loadResources: async () => poseResources,
    });
    expect(posed.maximumJointPivotResidualM).toBeLessThanOrEqual(1e-7);
  }, 120_000);

  it('moves a waist the wider field still cannot reach to the farther endpoint, still limited', async () => {
    // ANSUR II subject 12744 (male, the p99 waist of the male pool): stature 1747, biacromial 450,
    // chest 1232, waist 1214, buttock 1128, sleeve outseam 611, crotch height 813 mm.
    const subject: CanonicalBodyMeasurementsMm = Object.freeze({
      schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
      heightMm: 1747,
      shoulderBreadthMm: 450,
      chestCircumferenceMm: 1232,
      waistCircumferenceMm: 1214,
      hipCircumferenceMm: 1128,
      armLengthMm: 611,
      inseamMm: 813,
    });
    const build = (widenSafeRange: boolean) =>
      createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
        basis: maleBasis,
        measurements: subject,
        openReference: openReferenceOf(subject),
        loadBundle: async () => torsoBundle,
        widenSafeRange,
      });
    const endpointMm = (result: Awaited<ReturnType<typeof build>>) =>
      Number(
        /limited to ([\d.]+) mm/.exec(
          result.diagnostics.find(({ code }) => code === 'target-limited')?.message ?? '',
        )?.[1],
      );
    const bounded = await build(false);
    const widened = await build(true);
    expect(bounded.representedGeometricProxies).toEqual(['hipCircumferenceMm']);
    expect(widened.representedGeometricProxies).toEqual(['hipCircumferenceMm']);
    expect(widened.status).toBe('partial');
    expect(
      widened.diagnostics.map(({ measurementKey, code }) => `${measurementKey}:${code}`),
    ).toEqual(['waistCircumferenceMm:target-limited', 'waistCircumferenceMm:range-widened']);
    // Closer to the 1214 mm target, never past it, and the hip stays on its target.
    expect(endpointMm(widened)).toBeGreaterThan(endpointMm(bounded) + 50);
    expect(endpointMm(widened)).toBeLessThan(subject.waistCircumferenceMm);
    const hip = widened.modeResults.find((mode) => mode.measurementKey === 'hipCircumferenceMm')!;
    expect(Math.abs(hip.residualMm)).toBeLessThan(5);
  }, 120_000);

  it('keeps the bounded endpoint when the gate refuses every widened candidate', async () => {
    const bounded = await runtimeOf({});
    const evaluate = vi.fn(
      async () =>
        Object.freeze({
          ...bounded.qualityGate!,
          safe: false,
          reasons: Object.freeze(['new-self-intersection']),
          claims: Object.freeze({
            ...bounded.qualityGate!.claims,
            selfIntersectionEvaluated: true,
          }),
        }) as unknown as NonNullable<typeof bounded.qualityGate>,
    );
    const refused = await runtimeOf({ widenSafeRange: true, evaluateWidenedQualityGate: evaluate });
    expect(evaluate).toHaveBeenCalledTimes(UNIFORM_WAIST_HIP_WIDENED_COEFFICIENTS_V1.length);
    expect(Buffer.from(refused.displayMesh.positions.buffer)).toEqual(
      Buffer.from(bounded.displayMesh.positions.buffer),
    );
    expect(refused.modeResults).toEqual(bounded.modeResults);
    expect(refused.status).toBe(bounded.status);
    expect(refused.diagnostics.map(({ code }) => code)).toEqual([
      'target-limited',
      'range-widening-rejected',
    ]);
  }, 120_000);

  it('never consults the gate unless asked, and skips it when nothing is limited', async () => {
    const evaluate = vi.fn();
    await runtimeOf({ evaluateWidenedQualityGate: evaluate });
    const reachable = { ...SUBJECT_12377, hipCircumferenceMm: 960 };
    const result = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
      basis: maleBasis,
      measurements: reachable,
      openReference: openReferenceOf(reachable),
      loadBundle: async () => torsoBundle,
      widenSafeRange: true,
      evaluateWidenedQualityGate: evaluate,
    });
    expect(result.status).toBe('represented');
    expect(evaluate).not.toHaveBeenCalled();
  }, 120_000);
});

describe('waist/hip rig anchors past the finite asset', () => {
  const derive = (coefficient: number) =>
    deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1({
      rigBundle: poseResources.rig,
      anchorDeltaBundle: poseResources.anchors,
      basisKind: 'male',
      sourceMinimumY: maleBasis.sourceMinimumY,
      sourceMaximumY: maleBasis.sourceMaximumY,
      heightMm: SUBJECT_12377.heightMm,
      modeResults: [
        {
          measurementKey: 'hipCircumferenceMm',
          direction: 'decrease',
          coefficient,
          targetMm: 867,
          baselineMm: 950,
          achievedMm: 867,
          residualMm: 0,
          crossTalkMm: 0,
        },
      ],
    });

  it('extrapolates linearly up to the solver ceiling and refuses beyond it', () => {
    const zero = derive(0).headsM;
    const one = derive(1).headsM;
    const two = derive(2).headsM;
    let moved = 0;
    for (let index = 0; index < zero.length; index += 1) {
      expect(two[index] - zero[index]).toBeCloseTo(2 * (one[index] - zero[index]), 5);
      moved = Math.max(moved, Math.abs(one[index] - zero[index]));
    }
    expect(moved).toBeGreaterThan(0);
    expect(() => derive(3.5)).toThrow(RangeError);
    expect(() => derive(-0.1)).toThrow(RangeError);
  });
});
