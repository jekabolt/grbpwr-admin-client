import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it, vi } from 'vitest';

import { createMakeHumanAnteriorChestShoulderModesResearchV1 } from './makehuman-anterior-chest-shoulder-modes-research-v1';
import { createMakeHumanFullBodyLiveFkSessionV5 } from './makehuman-full-body-live-fk-session-v5';
import { parseMakeHumanLimbCircumferenceDeltaBundleV1 } from './makehuman-limb-circumference-delta-bundle-v1';
import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import {
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  parseMakeHuman2PoseCompatibleLengthPackV1,
} from './makehuman2-pose-compatible-length-pack-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import { evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1 } from './measurement-open-reference-display-quality-gate-v1';
import { solveOpenReferenceChestShoulderResearchV1 } from './measurement-open-reference-chest-shoulder-research-v1';
import {
  createMeasurementOpenReferenceBetaShapeRuntimeV1 as createProductionBetaShapeRuntimeV1,
  MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1,
  MeasurementOpenReferenceBetaShapeSafetyErrorV1,
} from './measurement-open-reference-beta-shape-runtime-v1';
import { createMeasurementOpenReferenceBetaTorsoInWorkerV1 } from './measurement-open-reference-beta-torso-worker-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import { solveMeasurementOpenReferenceKneeProxyV1 } from './measurement-open-reference-knee-proxy-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisKindV1,
} from './measurement-open-reference-display-v1';
import { createMeasurementOpenReferenceLimbSubsetRuntimeV1 } from './measurement-open-reference-limb-subset-runtime-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import { parseMakeHumanWaistHipRigAnchorDeltaBundleV1 } from './makehuman-waist-hip-rig-anchor-research-v1';
import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
} from './measurement-surface-self-intersection-v1';

const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);
const limbBundle = parseMakeHumanLimbCircumferenceDeltaBundleV1(
  readFileSync(
    resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-limb-circumference-deltas-v1.bin'),
  ),
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
const lengthPack = parseMakeHuman2PoseCompatibleLengthPackV1(
  readFileSync(
    resolve(process.cwd(), MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.assetPath),
  ),
);

function createMeasurementOpenReferenceBetaShapeRuntimeV1(
  options: Parameters<typeof createProductionBetaShapeRuntimeV1>[0],
) {
  return createProductionBetaShapeRuntimeV1({
    ...options,
    loadLengthPack: options.loadLengthPack ?? (async () => lengthPack),
    loadPoseResources: options.loadPoseResources ?? (async () => poseResources),
  });
}

function maximumCoordinateDeltaMm(left: Float32Array, right: Float32Array): number {
  let maximumM = 0;
  for (let index = 0; index < left.length; index += 1) {
    maximumM = Math.max(maximumM, Math.abs(left[index] - right[index]));
  }
  return maximumM * 1000;
}

function bytesSha256(value: ArrayBufferView): string {
  return createHash('sha256')
    .update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    .digest('hex');
}

function visualStatus(
  result: Awaited<ReturnType<typeof createProductionBetaShapeRuntimeV1>>,
  key: 'chestCircumferenceMm' | 'underBustCircumferenceMm' | 'shoulderBreadthMm' | 'armLengthMm',
): 'represented' | 'limited' | 'notApplied' {
  if (result.representedVisualControls.includes(key)) return 'represented';
  if ((result.limitedVisualControls ?? []).includes(key)) return 'limited';
  return 'notApplied';
}

async function fixture(
  kind: MakeHumanOpenReferenceBasisKindV1,
  measurements = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
) {
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readFileSync(
      resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    ),
    kind,
  );
  const frame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: `beta-shape-runtime-test:${kind}`,
    pose: 'A',
  });
  const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
  const waistHipRuntime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
    basis,
    measurements,
    openReference,
    loadBundle: async () => torsoBundle,
  });
  return { basis, measurements, waistHipRuntime };
}

describe('measurement open-reference beta shape runtime v1', () => {
  it.each(['male', 'female'] as const)(
    '%s makes required chest and shoulder controls visible on the V9 FK mesh',
    async (kind) => {
      const current = await fixture(kind);
      const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
        ...current,
        loadTorsoBundle: async () => torsoBundle,
      });

      expect(result.version).toBe(MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1);
      expect(result.representedVisualControls).toEqual(
        expect.arrayContaining([
          'heightMm',
          'shoulderBreadthMm',
          'chestCircumferenceMm',
          'waistCircumferenceMm',
          'hipCircumferenceMm',
        ]),
      );
      expect(result.fkProxyRuntime.displayMesh.positions).not.toEqual(
        current.waistHipRuntime.displayMesh.positions,
      );
      expect(result.sourceRevisionSuffix).toContain('chestCircumferenceMm');
      expect(result.unrepresentedRequiredControls).toEqual(['inseamMm']);
      expect(result.claims).toMatchObject({
        canonicalMeasurementSemanticMatchClaimed: false,
        armLengthCenterlineProxyOnly: true,
        sleeveLengthRepresented: false,
        inseamRepresented: false,
        fitClaimEligible: false,
        runtimeCollisionEligible: false,
        productionAuthority: false,
      });
    },
    30_000,
  );

  it('fails soft to the admitted waist/hip plus arm-proxy mesh when the torso bundle is unavailable', async () => {
    const current = await fixture('female');
    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      ...current,
      loadTorsoBundle: async () => {
        throw new Error('offline');
      },
    });

    expect(result.representedVisualControls).toEqual([
      'heightMm',
      'waistCircumferenceMm',
      'hipCircumferenceMm',
    ]);
    expect(result.limitedVisualControls).toContain('armLengthMm');
    expect(result.fkProxyRuntime.poseCompatibleArmLengthProxy?.ok).toBe(true);
    expect(result.fkProxyRuntime.displayMesh.positions).not.toEqual(
      current.waistHipRuntime.displayMesh.positions,
    );
    expect(result.chestShoulderDiagnostics).toContain('chest-shoulder-runtime-unavailable:offline');
  });

  it('stops before arm-length compilation and quality evaluation when limb closure aborts', async () => {
    const current = await fixture('female');
    const aborted = new DOMException('Aborted', 'AbortError');
    const createArmLengthRuntime = vi.fn(() => {
      throw new Error('arm-length compilation must not run after abort');
    });
    const evaluateQualityGate = vi.fn(() => {
      throw new Error('quality evaluation must not run after abort');
    });

    await expect(
      createMeasurementOpenReferenceBetaShapeRuntimeV1({
        ...current,
        loadTorsoBundle: async () => torsoBundle,
        createLimbRuntime: async () => {
          throw aborted;
        },
        createArmLengthRuntime: createArmLengthRuntime as never,
        evaluateQualityGate: evaluateQualityGate as never,
      }),
    ).rejects.toBe(aborted);
    expect(createArmLengthRuntime).not.toHaveBeenCalled();
    expect(evaluateQualityGate).not.toHaveBeenCalled();
  });

  it('composes the existing bounded limb subset after chest and shoulder', async () => {
    const measurements = Object.freeze({
      ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      bicepCircumferenceMm: 300,
      wristCircumferenceMm: 170,
      thighCircumferenceMm: 560,
      calfCircumferenceMm: 370,
      ankleCircumferenceMm: 230,
    });
    const current = await fixture('female', measurements);
    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      ...current,
      loadTorsoBundle: async () => torsoBundle,
      createLimbRuntime: (options) =>
        createMeasurementOpenReferenceLimbSubsetRuntimeV1({
          ...options,
          loadLimbBundle: async () => limbBundle,
          loadTorsoBundle: async () => torsoBundle,
        }),
    });

    expect(result.limbStatus).toBe('represented');
    expect(result.representedVisualControls).toEqual(
      expect.arrayContaining([
        'bicepCircumferenceMm',
        'wristCircumferenceMm',
        'thighCircumferenceMm',
        'calfCircumferenceMm',
        'ankleCircumferenceMm',
      ]),
    );
    expect(result.limitedVisualControls).toEqual(['armLengthMm']);
    expect(result.sourceRevisionSuffix).toMatch(/represented=[^;]*thighCircumferenceMm/u);
  }, 30_000);

  it('preserves a bounded visible thigh endpoint as typed limited beta state', async () => {
    const measurements = Object.freeze({
      ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      thighCircumferenceMm: 1_000,
    });
    const current = await fixture('female', measurements);
    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      ...current,
      loadTorsoBundle: async () => torsoBundle,
      createLimbRuntime: (options) =>
        createMeasurementOpenReferenceLimbSubsetRuntimeV1({
          ...options,
          loadLimbBundle: async () => limbBundle,
          loadTorsoBundle: async () => torsoBundle,
        }),
    });

    expect(result.limbStatus).toBe('partial');
    expect(result.representedVisualControls).not.toContain('thighCircumferenceMm');
    expect(result.limitedVisualControls).toEqual(['armLengthMm', 'thighCircumferenceMm']);
    expect(result.sourceRevisionSuffix).toContain('limited=armLengthMm,thighCircumferenceMm');
    expect(result.chestShoulderDiagnostics).toContain('thighCircumferenceMm:target-limited');
    expect(result.fkProxyRuntime.displayMesh.positions).not.toEqual(
      current.waistHipRuntime.displayMesh.positions,
    );
    expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
    expect(result.status).toBe('partial');
  }, 30_000);

  it('rolls the whole beta shape back and rebinds the exact global gate when final composition is unsafe', async () => {
    const measurements = Object.freeze({
      ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      underBustCircumferenceMm: 800,
      chestDepthMm: 240,
      bicepCircumferenceMm: 300,
    });
    const current = await fixture('female', measurements);
    const hostilePositions = current.waistHipRuntime.displayMesh.positions.slice();
    hostilePositions[0] += 10;
    const createLimbRuntime = vi.fn(
      async () =>
        ({
          status: 'represented',
          representedGeometricProxies: ['bicepCircumferenceMm'],
          displayMesh: {
            ...current.waistHipRuntime.displayMesh,
            positions: hostilePositions,
            byteLength:
              hostilePositions.byteLength + current.waistHipRuntime.displayMesh.indices.byteLength,
          },
        }) as never,
    );
    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      ...current,
      loadTorsoBundle: async () => torsoBundle,
      createLimbRuntime,
    });
    const expectedGate = evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1({
      uniformPositionsM: current.waistHipRuntime.openReference.mesh.positions,
      personalizedPositionsM: current.waistHipRuntime.displayMesh.positions,
      triangleIndices: current.waistHipRuntime.displayMesh.indices,
    });

    expect(result.fkProxyRuntime.displayMesh.positions).toEqual(
      current.waistHipRuntime.displayMesh.positions,
    );
    expect(result.fkProxyRuntime.qualityGate).toEqual(expectedGate);
    expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
    expect(result.representedVisualControls).not.toContain('underBustCircumferenceMm');
    expect(result.representedVisualControls).not.toContain('chestCircumferenceMm');
    expect(result.representedVisualControls).not.toContain('bicepCircumferenceMm');
    expect(result.limbStatus).toBe('unrepresented');
    expect(result.chestShoulderDiagnostics).toContain('beta-final-global-quality-rollback');
    expect(result.chestShoulderDiagnostics).not.toContain('beta-final-chest-subset-rollback');
    expect(result.status).toBe('partial');
    expect(createLimbRuntime).toHaveBeenCalledTimes(4);
  }, 30_000);

  it('hard-fails instead of publishing a basis whose self-intersection evaluation cannot complete', async () => {
    const current = await fixture('base');

    await expect(
      createMeasurementOpenReferenceBetaShapeRuntimeV1({
        ...current,
        loadTorsoBundle: async () => torsoBundle,
        selfIntersectionPolicy: {
          ...DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
          maxTriangles: 1,
        },
      }),
    ).rejects.toEqual(expect.any(MeasurementOpenReferenceBetaShapeSafetyErrorV1));
  }, 30_000);

  it.each([
    ['female', 1_020, 760],
    ['male', 800, 760],
    ['male', 860, 760],
    ['neutral', 1_100, 760],
    ['female', 800, undefined],
  ] as const)(
    'limits only chest for %s chest %i under bust %s when the initial final gate fails',
    async (kind, chestCircumferenceMm, underBustCircumferenceMm) => {
      const measurements = Object.freeze({
        ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
        shoulderBreadthMm: 400,
        chestCircumferenceMm,
        ...(underBustCircumferenceMm == null ? {} : { underBustCircumferenceMm }),
        waistCircumferenceMm: 720,
      });
      const current = await fixture(kind, measurements);
      const createTorsoShape = vi.fn(createMeasurementOpenReferenceBetaTorsoInWorkerV1);
      const startedAt = performance.now();
      const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
        ...current,
        loadTorsoBundle: async () => torsoBundle,
        createTorsoShape,
      });
      expect(visualStatus(result, 'chestCircumferenceMm')).toBe('limited');
      expect(visualStatus(result, 'underBustCircumferenceMm')).toBe(
        underBustCircumferenceMm == null ? 'notApplied' : 'represented',
      );
      expect(visualStatus(result, 'shoulderBreadthMm')).toBe('represented');
      expect(visualStatus(result, 'armLengthMm')).toBe('limited');
      expect(result.chestShoulderDiagnostics).toContain('beta-final-chest-subset-rollback');
      expect(result.chestShoulderDiagnostics).toContain(
        'chestCircumferenceMm:beta-final-target-halved',
      );
      expect(result.chestShoulderDiagnostics).not.toContain(
        'chestCircumferenceMm:beta-final-target-removed',
      );
      expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
      expect(result.status).toBe('partial');
      expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
      expect(createTorsoShape).toHaveBeenCalledTimes(2);
      expect(result.claims.torsoDepthFrontBackDistributionCalibrated).toBe(false);
      console.info(
        `CHEST_L0_AFTER=${JSON.stringify({
          kind,
          chestCircumferenceMm,
          underBustCircumferenceMm,
          status: result.status,
          fields: {
            chest: visualStatus(result, 'chestCircumferenceMm'),
            underBust:
              underBustCircumferenceMm == null
                ? 'unrequested'
                : visualStatus(result, 'underBustCircumferenceMm'),
            shoulder: visualStatus(result, 'shoulderBreadthMm'),
            armLength: visualStatus(result, 'armLengthMm'),
          },
          diagnostics: result.chestShoulderDiagnostics,
          solves: createTorsoShape.mock.calls.length,
          totalMs: Number((performance.now() - startedAt).toFixed(1)),
        })}`,
      );
    },
    60_000,
  );

  it('uses the measured-base chest retry as not applied when the halfway retry stays unsafe', async () => {
    const measurements = Object.freeze({
      ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      shoulderBreadthMm: 400,
      chestCircumferenceMm: 1_020,
      underBustCircumferenceMm: 760,
      waistCircumferenceMm: 720,
    });
    const current = await fixture('female', measurements);
    const createTorsoShape = vi.fn(async (options) => {
      const torso = await createMeasurementOpenReferenceBetaTorsoInWorkerV1(options);
      if (createTorsoShape.mock.calls.length > 2) return torso;
      const positionsM = torso.positionsM.slice();
      positionsM[0] += 10;
      return Object.freeze({ ...torso, positionsM });
    });
    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      ...current,
      loadTorsoBundle: async () => torsoBundle,
      createTorsoShape,
    });

    expect(createTorsoShape).toHaveBeenCalledTimes(3);
    expect(visualStatus(result, 'chestCircumferenceMm')).toBe('notApplied');
    expect(visualStatus(result, 'underBustCircumferenceMm')).toBe('represented');
    expect(visualStatus(result, 'shoulderBreadthMm')).toBe('represented');
    expect(visualStatus(result, 'armLengthMm')).toBe('limited');
    expect(result.chestShoulderDiagnostics).toContain('beta-final-chest-subset-rollback');
    expect(result.chestShoulderDiagnostics).toContain(
      'chestCircumferenceMm:beta-final-target-removed',
    );
    expect(result.chestShoulderDiagnostics).not.toContain(
      'chestCircumferenceMm:target-limited-to-bounded-endpoint',
    );
    expect(result.chestShoulderDiagnostics).not.toContain(
      'chestCircumferenceMm:target-limited-to-quality-safe-endpoint',
    );
    expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
    expect(result.status).toBe('partial');
  }, 60_000);

  it('keeps the passing female chest result byte-identical with exactly one solve', async () => {
    const measurements = Object.freeze({
      ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      shoulderBreadthMm: 400,
      chestCircumferenceMm: 880,
      underBustCircumferenceMm: 760,
      waistCircumferenceMm: 720,
    });
    const current = await fixture('female', measurements);
    const createTorsoShape = vi.fn(createMeasurementOpenReferenceBetaTorsoInWorkerV1);
    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      ...current,
      loadTorsoBundle: async () => torsoBundle,
      createTorsoShape,
    });
    const positionsSha256 = bytesSha256(result.fkProxyRuntime.displayMesh.positions);

    expect(createTorsoShape).toHaveBeenCalledTimes(1);
    expect(createTorsoShape.mock.calls[0][0].measurements).toBe(measurements);
    expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
    expect(result.chestShoulderDiagnostics).not.toContain('beta-final-chest-subset-rollback');
    expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
    expect(positionsSha256).toBe(
      '49b7abe791a188ac7894c845259433d301cb5c5a399073baaa1a2847b56195da',
    );
  }, 60_000);

  it('produces different female geometry when only chest changes', async () => {
    const baseline = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements;
    const lower = await fixture(
      'female',
      Object.freeze({ ...baseline, chestCircumferenceMm: 880 }),
    );
    const upper = await fixture(
      'female',
      Object.freeze({ ...baseline, chestCircumferenceMm: 960 }),
    );
    const [lowerResult, upperResult] = await Promise.all(
      [lower, upper].map((current) =>
        createMeasurementOpenReferenceBetaShapeRuntimeV1({
          ...current,
          loadTorsoBundle: async () => torsoBundle,
        }),
      ),
    );
    expect(lowerResult.representedVisualControls).toContain('chestCircumferenceMm');
    expect(upperResult.representedVisualControls).toContain('chestCircumferenceMm');
    expect(lowerResult.fkProxyRuntime.displayMesh.positions).not.toEqual(
      upperResult.fkProxyRuntime.displayMesh.positions,
    );
  }, 30_000);

  it('retains a typed limited response for the production female chest1040 shoulder420 fixture', async () => {
    const measurements = Object.freeze({
      ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      chestCircumferenceMm: 1_040,
      shoulderBreadthMm: 420,
    });
    const current = await fixture('female', measurements);
    const modes = createMakeHumanAnteriorChestShoulderModesResearchV1({
      basis: current.basis,
      measurements,
      bundle: torsoBundle,
    });
    const solved = solveOpenReferenceChestShoulderResearchV1({
      sourcePositionsM: current.waistHipRuntime.displayMesh.positions,
      triangleIndices: current.waistHipRuntime.displayMesh.indices,
      measurements,
      modes: modes.modes,
    });
    console.info(
      `FEMALE_CHEST1040_SHOULDER420_V1=${JSON.stringify({
        limited: solved.limitedMeasurements,
        represented: solved.representedMeasurements,
        diagnostics: solved.diagnostics,
        maximumCoordinateDeltaMm: maximumCoordinateDeltaMm(
          solved.positionsM,
          current.waistHipRuntime.displayMesh.positions,
        ),
        qualitySafe: solved.qualityGate.safe,
      })}`,
    );

    expect(solved.limitedMeasurements).toContain('chestCircumferenceMm');
    expect(solved.representedMeasurements).not.toContain('chestCircumferenceMm');
    expect(
      solved.diagnostics.some((diagnostic) =>
        diagnostic.startsWith('chestCircumferenceMm:target-limited-to-'),
      ),
    ).toBe(true);
    expect(solved.positionsM).not.toEqual(current.waistHipRuntime.displayMesh.positions);
    expect(
      maximumCoordinateDeltaMm(solved.positionsM, current.waistHipRuntime.displayMesh.positions),
    ).toBeGreaterThan(0);
    expect(solved.qualityGate.safe).toBe(true);
    expect(
      validateMeasurementSurfaceSelfIntersectionV1(
        solved.positionsM,
        Uint32Array.from(current.waistHipRuntime.displayMesh.indices),
      ).intersectionCount,
    ).toBe(0);
  }, 30_000);

  it('keeps the hostile adapter-valid chest plus waist fixture visibly bounded without global rollback', async () => {
    const measurements = Object.freeze({
      ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      chestCircumferenceMm: 1_400,
      waistCircumferenceMm: 1_040,
    });
    const current = await fixture('female', measurements);
    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      ...current,
      loadTorsoBundle: async () => torsoBundle,
    });
    expect(current.waistHipRuntime.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'target-limited',
          measurementKey: 'waistCircumferenceMm',
        }),
      ]),
    );
    expect(result.chestShoulderDiagnostics).toContain(
      'chestCircumferenceMm:target-limited-to-bounded-endpoint',
    );
    expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
    expect(result.representedVisualControls).not.toContain('chestCircumferenceMm');
    expect(result.representedVisualControls).not.toContain('waistCircumferenceMm');
    expect(result.fkProxyRuntime.displayMesh.positions).not.toEqual(
      current.waistHipRuntime.openReference.mesh.positions,
    );
    expect(result.fkProxyRuntime.displayMesh.positions).not.toEqual(
      current.waistHipRuntime.displayMesh.positions,
    );
    expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
    expect(
      validateMeasurementSurfaceSelfIntersectionV1(
        result.fkProxyRuntime.displayMesh.positions,
        Uint32Array.from(result.fkProxyRuntime.displayMesh.indices),
      ).intersectionCount,
    ).toBe(0);
    console.info(
      `HOSTILE_BOUNDED_CHEST_WAIST_V1=${JSON.stringify({
        waistEndpointMaximumCoordinateDeltaMm: Number(
          maximumCoordinateDeltaMm(
            current.waistHipRuntime.displayMesh.positions,
            current.waistHipRuntime.openReference.mesh.positions,
          ).toFixed(3),
        ),
        chestEndpointMaximumCoordinateDeltaMm: Number(
          maximumCoordinateDeltaMm(
            result.fkProxyRuntime.displayMesh.positions,
            current.waistHipRuntime.displayMesh.positions,
          ).toFixed(3),
        ),
        finalMaximumCoordinateDeltaMm: Number(
          maximumCoordinateDeltaMm(
            result.fkProxyRuntime.displayMesh.positions,
            current.waistHipRuntime.openReference.mesh.positions,
          ).toFixed(3),
        ),
        minimumTriangleAreaRatio:
          result.fkProxyRuntime.qualityGate?.metrics.minimumTriangleAreaRatio,
        flippedTriangleCount: result.fkProxyRuntime.qualityGate?.metrics.flippedTriangleCount,
      })}`,
    );
  }, 60_000);

  it.each(['base', 'neutral', 'male', 'female'] as const)(
    '%s composes two arm-length endpoints into distinct safe geometry',
    async (kind) => {
      const baseline = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements;
      const [shortFixture, longFixture] = await Promise.all([
        fixture(kind, Object.freeze({ ...baseline, armLengthMm: 560 })),
        fixture(kind, Object.freeze({ ...baseline, armLengthMm: 640 })),
      ]);
      const [shortResult, longResult] = await Promise.all(
        [shortFixture, longFixture].map((current) =>
          createMeasurementOpenReferenceBetaShapeRuntimeV1({
            ...current,
            loadTorsoBundle: async () => torsoBundle,
          }),
        ),
      );

      for (const result of [shortResult, longResult]) {
        expect(result.representedVisualControls).not.toContain('armLengthMm');
        expect(result.limitedVisualControls).toContain('armLengthMm');
        expect(['matched-proxy', 'bounded-endpoint']).toContain(
          result.fkProxyRuntime.poseCompatibleArmLengthProxy?.targetStatus,
        );
        expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
        expect(result.fkProxyRuntime.qualityGate?.claims).toMatchObject({
          localGeometryQualityOnly: false,
          selfIntersectionEvaluated: true,
          anatomicalAccuracyClaimed: false,
          fitClaimEligible: false,
          runtimeCollisionEligible: false,
        });
        expect(result.fkProxyRuntime.qualityGate?.metrics.flippedTriangleCount).toBe(0);
        expect(
          validateMeasurementSurfaceSelfIntersectionV1(
            result.fkProxyRuntime.displayMesh.positions,
            Uint32Array.from(result.fkProxyRuntime.displayMesh.indices),
          ).intersectionCount,
        ).toBe(0);
      }
      expect(shortResult.fkProxyRuntime.displayMesh.positions).not.toEqual(
        longResult.fkProxyRuntime.displayMesh.positions,
      );
    },
    60_000,
  );

  it('poses scaled female arms after torso-depth proxies around recomputed helper-backed joints', async () => {
    const baseline = Object.freeze({
      ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      chestDepthMm: 205,
      waistDepthMm: 195,
      hipDepthMm: 225,
    });
    const [shortFixture, longFixture] = await Promise.all([
      fixture('female', Object.freeze({ ...baseline, armLengthMm: 560 })),
      fixture('female', Object.freeze({ ...baseline, armLengthMm: 640 })),
    ]);
    const [shortResult, longResult] = await Promise.all(
      [shortFixture, longFixture].map((current) =>
        createMeasurementOpenReferenceBetaShapeRuntimeV1({
          ...current,
          loadTorsoBundle: async () => torsoBundle,
        }),
      ),
    );
    const pose = Object.freeze({
      torsoFlexionDeg: 4,
      torsoSideBendDeg: 0,
      torsoTwistDeg: 0,
      symmetry: 'independent' as const,
      leftArm: Object.freeze({
        shoulderRaiseDeg: 18,
        shoulderForwardDeg: 6,
        elbowBendDeg: 32,
        wristBendDeg: 0,
      }),
      rightArm: Object.freeze({
        shoulderRaiseDeg: 12,
        shoulderForwardDeg: -4,
        elbowBendDeg: 20,
        wristBendDeg: 0,
      }),
      headPitchDeg: 0,
      headYawDeg: 0,
      headSideDeg: 0,
      legSymmetry: 'bilateral' as const,
      leg: Object.freeze({
        hipForwardDeg: 0,
        hipSideDeg: 0,
        kneeBendDeg: 0,
        ankleBendDeg: 0,
      }),
    });
    const [shortSession, longSession] = await Promise.all([
      createMakeHumanFullBodyLiveFkSessionV5({
        basis: shortFixture.basis,
        measurements: shortFixture.measurements,
        proxyRuntime: shortResult.fkProxyRuntime,
        sourceRevision: shortResult.sourceRevisionSuffix,
        loadResources: async () => poseResources,
      }),
      createMakeHumanFullBodyLiveFkSessionV5({
        basis: longFixture.basis,
        measurements: longFixture.measurements,
        proxyRuntime: longResult.fkProxyRuntime,
        sourceRevision: longResult.sourceRevisionSuffix,
        loadResources: async () => poseResources,
      }),
    ]);
    const shortWrist = shortSession.neutralJointOverlay.find(({ bone }) => bone === 'wrist.L');
    const longWrist = longSession.neutralJointOverlay.find(({ bone }) => bone === 'wrist.L');
    expect(shortWrist).toBeDefined();
    expect(longWrist).toBeDefined();
    expect(shortWrist?.headM).not.toEqual(longWrist?.headM);

    const shortFrame = shortSession.solve(pose);
    const longFrame = longSession.solve(pose);
    expect(shortFrame.positions).not.toEqual(longFrame.positions);
    expect(shortFrame.maximumJointPivotResidualM).toBeLessThan(1e-7);
    expect(longFrame.maximumJointPivotResidualM).toBeLessThan(1e-7);
  }, 60_000);

  it.each(['neutral', 'male', 'female'] as const)(
    '%s exposes optional chest, waist and hip depth as bounded circumference-preserving proxies',
    async (kind) => {
      const measurements = Object.freeze({
        ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
        chestDepthMm: 205,
        waistDepthMm: 195,
        hipDepthMm: 225,
      });
      const current = await fixture(kind, measurements);
      const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
        ...current,
        loadTorsoBundle: async () => torsoBundle,
      });
      const applied = new Set([
        ...result.representedVisualControls,
        ...(result.limitedVisualControls ?? []),
      ]);
      expect(applied.has('chestDepthMm')).toBe(true);
      expect(applied.has('waistDepthMm')).toBe(true);
      expect(applied.has('hipDepthMm')).toBe(true);
      expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
      expect(result.claims).toMatchObject({
        torsoDepthSymmetricSectionProxyOnly: true,
        torsoDepthFrontBackDistributionCalibrated: false,
        fitClaimEligible: false,
      });
    },
    30_000,
  );

  it('rolls back only the depth subset when male chest depth fails the final global gate', async () => {
    const measurements = Object.freeze({
      ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      heightMm: 1800,
      shoulderBreadthMm: 460,
      chestCircumferenceMm: 1000,
      waistCircumferenceMm: 860,
      hipCircumferenceMm: 990,
      armLengthMm: 640,
      inseamMm: 820,
      chestDepthMm: 300,
    });
    const current = await fixture('male', measurements);
    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      ...current,
      loadTorsoBundle: async () => torsoBundle,
    });
    const applied = new Set([
      ...result.representedVisualControls,
      ...(result.limitedVisualControls ?? []),
    ]);
    console.log('DEPTH_SUBSET_ROLLBACK_V1=' + JSON.stringify({
      status: result.status,
      represented: result.representedVisualControls,
      limited: result.limitedVisualControls,
      diagnostics: result.chestShoulderDiagnostics,
    }));
    expect(result.chestShoulderDiagnostics).toContain('beta-final-depth-subset-rollback');
    expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
    expect(applied.has('shoulderBreadthMm')).toBe(true);
    expect(applied.has('chestCircumferenceMm')).toBe(true);
    expect(applied.has('chestDepthMm')).toBe(false);
    expect(result.status).toBe('partial');
    expect(applied.has('armLengthMm')).toBe(true);
    expect(result.claims).toMatchObject({
      torsoDepthFrontBackDistributionCalibrated: false,
      fitClaimEligible: false,
    });
  }, 60_000);

  it.each(['neutral', 'male', 'female'] as const)(
    '%s admits optional under-bust as an independent research-only visual control',
    async (kind) => {
      const measurements = Object.freeze({
        ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
        underBustCircumferenceMm: 800,
        hpsToWaistFrontMm: 430,
        acrossFrontMm: 360,
        acrossBackMm: 390,
      });
      const current = await fixture(kind, measurements);
      const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
        ...current,
        loadTorsoBundle: async () => torsoBundle,
      });

      expect(result.representedVisualControls).toContain('underBustCircumferenceMm');
      expect(result.chestShoulderDiagnostics).toEqual(
        expect.arrayContaining([
          'underbust-station:bounded-hps-to-waist-front-proxy',
          'anterior-share:bounded-across-front-back-proxy',
          'underbust-360-ribcage-proxy-applied',
        ]),
      );
      expect(result.claims).toMatchObject({
        chestCircumferencePosteriorHeldFixed: true,
        underBustIndependentRibcageBand: true,
        torsoDepthSymmetricSectionProxyOnly: true,
        torsoDepthFrontBackDistributionCalibrated: false,
        canonicalMeasurementSemanticMatchClaimed: false,
        productionAuthority: false,
      });
    },
    30_000,
  );
});

describe('measurement open-reference beta shape runtime v1 high hip and knee', () => {
  const highHipAndKnee = Object.freeze({
    ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
    highHipCircumferenceMm: 880,
    kneeCircumferenceMm: 370,
  });

  it.each(['neutral', 'male', 'female'] as const)(
    '%s wires high hip and knee as bounded proxies with typed bookkeeping',
    async (kind) => {
      const current = await fixture(kind, highHipAndKnee);
      const solveKneeProxy = vi.fn(
        async (options: Parameters<typeof solveMeasurementOpenReferenceKneeProxyV1>[0]) =>
          solveMeasurementOpenReferenceKneeProxyV1(options),
      );
      const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
        ...current,
        loadTorsoBundle: async () => torsoBundle,
        loadLimbBundle: async () => limbBundle,
        solveKneeProxy,
      });
      const applied = new Set([
        ...result.representedVisualControls,
        ...(result.limitedVisualControls ?? []),
      ]);

      expect(applied.has('highHipCircumferenceMm')).toBe(true);
      expect(applied.has('kneeCircumferenceMm')).toBe(true);
      expect(result.representedVisualControls).toEqual(
        expect.arrayContaining(['waistCircumferenceMm', 'hipCircumferenceMm']),
      );
      expect(result.sourceRevisionSuffix).toMatch(/highHipCircumferenceMm/u);
      expect(result.sourceRevisionSuffix).toMatch(/kneeCircumferenceMm/u);
      // A represented proxy emits no diagnostic; only a failure or clamp is named.
      expect(
        result.chestShoulderDiagnostics.filter(
          (code) => code.includes('runtime-unavailable') || code.includes('quality-rollback'),
        ),
      ).toEqual([]);
      expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
      expect(result.torsoSectionStations?.highHip).toBeDefined();
      expect(result.kneeSectionStations?.map(({ side }) => side)).toEqual(['negative', 'positive']);
      expect(solveKneeProxy).toHaveBeenCalledTimes(1);
      expect(solveKneeProxy.mock.calls[0][0].pose).toBe('A');
      expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
      expect(result.claims).toMatchObject({
        highHipSectionProxyOnly: true,
        kneeRadialSectionProxyOnly: true,
        circumferenceRangeCalibrated: false,
        fitClaimEligible: false,
        torsoDepthFrontBackDistributionCalibrated: false,
      });
    },
    90_000,
  );

  it('drops a knee that fails the final global gate alone and keeps high hip, waist and hip', async () => {
    const current = await fixture('female', highHipAndKnee);
    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      ...current,
      loadTorsoBundle: async () => torsoBundle,
      loadLimbBundle: async () => limbBundle,
      solveKneeProxy: async (options) => {
        const positionsM = options.positionsM.slice();
        positionsM[0] += 10;
        return {
          ...solveMeasurementOpenReferenceKneeProxyV1(options),
          status: 'represented',
          positionsM,
          diagnostics: [],
        } as never;
      },
    });

    expect(result.representedVisualControls).not.toContain('kneeCircumferenceMm');
    expect(result.limitedVisualControls).not.toContain('kneeCircumferenceMm');
    expect(result.chestShoulderDiagnostics).toContain(
      'kneeCircumferenceMm:beta-final-quality-rollback',
    );
    expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
    expect(
      new Set([...result.representedVisualControls, ...(result.limitedVisualControls ?? [])]).has(
        'highHipCircumferenceMm',
      ),
    ).toBe(true);
    expect(result.representedVisualControls).toEqual(
      expect.arrayContaining(['waistCircumferenceMm', 'hipCircumferenceMm']),
    );
    expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
    expect(Math.abs(result.fkProxyRuntime.displayMesh.positions[0])).toBeLessThan(5);
    expect(result.fkProxyRuntime.displayMesh.positions).not.toEqual(
      current.waistHipRuntime.displayMesh.positions,
    );
  }, 90_000);

  it('drops a high hip that fails the final global gate alone and keeps torso depth', async () => {
    const measurements = Object.freeze({
      ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
      chestDepthMm: 240,
      waistDepthMm: 210,
      hipDepthMm: 270,
      highHipCircumferenceMm: 880,
    });
    const current = await fixture('female', measurements);
    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      ...current,
      loadTorsoBundle: async () => torsoBundle,
      createTorsoShape: async (options) => {
        const clean = await createMeasurementOpenReferenceBetaTorsoInWorkerV1({
          ...options,
          highHipCircumferenceMm: undefined,
        });
        const positionsM = clean.positionsM.slice();
        positionsM[0] += 10;
        return {
          ...clean,
          positionsM,
          positionsBeforeHighHipM: clean.positionsM,
          highHipStatus: 'represented',
          highHipRepresented: true,
          highHipLimited: false,
          highHipDiagnostics: [],
        } as never;
      },
    });
    const applied = new Set([
      ...result.representedVisualControls,
      ...(result.limitedVisualControls ?? []),
    ]);

    expect(applied.has('highHipCircumferenceMm')).toBe(false);
    expect(result.chestShoulderDiagnostics).toContain(
      'highHipCircumferenceMm:beta-final-quality-rollback',
    );
    expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
    expect(applied.has('chestDepthMm')).toBe(true);
    expect(applied.has('waistDepthMm')).toBe(true);
    expect(applied.has('hipDepthMm')).toBe(true);
    expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
    expect(Math.abs(result.fkProxyRuntime.displayMesh.positions[0])).toBeLessThan(5);
  }, 90_000);
});
