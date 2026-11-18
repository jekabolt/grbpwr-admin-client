import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { createMakeHumanAnteriorChestShoulderModesResearchV1 } from './makehuman-anterior-chest-shoulder-modes-research-v1';
import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import {
  MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1,
  parseMakeHumanFemaleBustDeltaBundleV1,
} from './makehuman-female-bust-delta-bundle-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { createMakeHumanUniformWaistHipModesV1 } from './makehuman-uniform-waist-hip-modes-v1';
import { parseMakeHumanWaistHipRigAnchorDeltaBundleV1 } from './makehuman-waist-hip-rig-anchor-research-v1';
import {
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  parseMakeHuman2PoseCompatibleLengthPackV1,
} from './makehuman2-pose-compatible-length-pack-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import { createMeasurementOpenReferenceBetaShapeRuntimeV1 } from './measurement-open-reference-beta-shape-runtime-v1';
import {
  loadFemaleBustBundleForTorsoV1,
  solveMeasurementOpenReferenceBetaTorsoV1,
} from './measurement-open-reference-beta-torso-worker-v1';
import { measureChestShoulderResearchProxyMmV1 } from './measurement-open-reference-chest-shoulder-research-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import { measureFemaleTorsoSectionGirthMmV1 } from './measurement-open-reference-female-torso-stage-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import { measureMeshHorizontalSectionTapeGirthMmV1 } from './mesh-plane-section-tape-girth-v1';

const cwd = process.cwd();
const basis = parseMakeHumanOpenReferenceBasisV1(
  readFileSync(resolve(cwd, MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1.female.assetPath)),
  'female',
);
const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(cwd, 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);
const bustBundle = parseMakeHumanFemaleBustDeltaBundleV1(
  readFileSync(resolve(cwd, MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.assetPath)),
);
const poseMetadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
const poseResources = Object.freeze({
  rig: parseMakeHumanCoreRigBundleV1(readFileSync(resolve(cwd, poseMetadata.rigAssetPath))),
  anchors: parseMakeHumanWaistHipRigAnchorDeltaBundleV1(
    readFileSync(resolve(cwd, poseMetadata.anchorAssetPath)),
    {
      byteLength: poseMetadata.anchorByteLength,
      sourceRigBundleSha256: poseMetadata.rigSha256,
      sourceTorsoBundleSha256: poseMetadata.torsoDirectionBundleSha256,
    },
  ),
});
const lengthPack = parseMakeHuman2PoseCompatibleLengthPackV1(
  readFileSync(resolve(cwd, MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.assetPath)),
);

const BASE = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements;
const sourcePositionsM = createMakeHumanUniformWaistHipModesV1({
  basis,
  heightMm: BASE.heightMm,
  bundle: torsoBundle,
}).uniformPositionsM;

function measurementsFor(chestMm: number, underBustMm?: number): CanonicalBodyMeasurementsMm {
  return Object.freeze({
    ...BASE,
    chestCircumferenceMm: chestMm,
    underBustCircumferenceMm: underBustMm,
  });
}

function shoulderMmOf(measurements: CanonicalBodyMeasurementsMm, positionsM: Float32Array) {
  const mode = createMakeHumanAnteriorChestShoulderModesResearchV1({
    basis,
    measurements,
    bundle: torsoBundle,
  }).modes.find(({ measurementKey }) => measurementKey === 'shoulderBreadthMm')!;
  return measureChestShoulderResearchProxyMmV1({
    positionsM,
    triangleIndices: basis.indices,
    mode,
  });
}

function solve(measurements: CanonicalBodyMeasurementsMm) {
  const startedAt = performance.now();
  const result = solveMeasurementOpenReferenceBetaTorsoV1({
    basis,
    sourcePositionsM,
    triangleIndices: basis.indices,
    measurements,
    torsoBundle,
    femaleBustBundle: bustBundle,
  });
  return { result, workerMs: performance.now() - startedAt };
}

function chestStatusOf(result: ReturnType<typeof solve>['result']) {
  if (result.chestShoulderRepresentedMeasurements.includes('chestCircumferenceMm')) {
    return 'represented';
  }
  if (result.chestShoulderLimitedMeasurements.includes('chestCircumferenceMm')) return 'limited';
  return 'notApplied';
}

function underBustStatusOf(result: ReturnType<typeof solve>['result']) {
  if (result.ribcageRepresentedMeasurements.includes('underBustCircumferenceMm')) {
    return 'represented';
  }
  if ((result.ribcageLimitedMeasurements ?? []).includes('underBustCircumferenceMm')) {
    return 'limited';
  }
  return 'notApplied';
}

function report(
  label: string,
  measurements: CanonicalBodyMeasurementsMm,
  value: ReturnType<typeof solve>,
) {
  const bust = value.result.femaleBust!;
  console.info(
    `[female bust worker] ${label}: chest=${chestStatusOf(value.result)} ub=${underBustStatusOf(value.result)}` +
      ` fullestOffsetMm=${bust.modeResult?.fullestSectionOffsetMm.toFixed(1)}` +
      ` chestAchievedMm=${bust.modeResult?.achievedMm.toFixed(1)}` +
      ` ubAchievedMm=${bust.underBustAchievedMm?.toFixed(1)}` +
      ` shoulderDeltaMm=${(shoulderMmOf(measurements, value.result.positionsM) - measurements.shoulderBreadthMm).toFixed(2)}` +
      ` bustSolveMs=${bust.solveMs.toFixed(0)} workerMs=${value.workerMs.toFixed(0)}` +
      ` diagnostics=${JSON.stringify([...value.result.ribcageDiagnostics, ...value.result.chestShoulderDiagnostics])}`,
  );
}

describe('beta torso worker: female bust proxy (lane-female-bust-rev2 §5)', () => {
  it.each([
    [835, 720],
    [820, 720],
    // 840/680 left this list on purpose (tape-girth lane): the bust tape tops out near 816 mm
    // on a 680 mm ribcage, so that pair is now honestly limited below instead of passing
    // only because the raw skin loop was longer than the tape.
    [870, 740],
  ] as const)(
    'female %i/%i: chest and under bust represented at the apex plane, shoulder as typed',
    (chestMm, underBustMm) => {
      const measurements = measurementsFor(chestMm, underBustMm);
      const value = solve(measurements);
      report(`${chestMm}/${underBustMm}`, measurements, value);
      const { result } = value;
      const bust = result.femaleBust!;
      expect(bust).toBeDefined();
      expect(chestStatusOf(result)).toBe('represented');
      expect(underBustStatusOf(result)).toBe('represented');
      expect(Math.abs(bust.modeResult!.fullestSectionOffsetMm)).toBeLessThanOrEqual(10);
      // The published chest station is the apex plane, above the under-bust station and at or
      // below the armpit line, so the chest guide ring follows the bust.
      expect(result.chestStationOriginM).toEqual(bust.apexStationOriginM);
      expect(result.chestStationOriginM![1]).toBeGreaterThan(result.underBustStationOriginM![1]);
      expect(result.chestStationOriginM![1]).toBeLessThanOrEqual(bust.armpitLineOriginM[1] + 1e-9);
      // Achieved girths on the output mesh, measured independently of the solver. The bust is a
      // tape girth (the hull bridges the cleavage); the under bust is still held on the loop.
      expect(
        Math.abs(
          (measureMeshHorizontalSectionTapeGirthMmV1({
            positionsM: result.positionsM,
            triangleIndices: basis.indices,
            originM: result.chestStationOriginM!,
          }) ?? Number.NaN) - chestMm,
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          measureFemaleTorsoSectionGirthMmV1({
            positionsM: result.positionsM,
            triangleIndices: basis.indices,
            originM: result.underBustStationOriginM!,
          }) - underBustMm,
        ),
      ).toBeLessThanOrEqual(1);
      expect(result.chestShoulderRepresentedMeasurements).toContain('shoulderBreadthMm');
      expect(
        Math.abs(shoulderMmOf(measurements, result.positionsM) - measurements.shoulderBreadthMm),
      ).toBeLessThanOrEqual(1);
      // No second band: the legacy under-bust band never ran on top of the bust proxy.
      expect(
        result.ribcageDiagnostics.some((code) => code.startsWith('female-bust-unavailable')),
      ).toBe(false);
    },
    60_000,
  );

  it('female 1000/720: chest honestly limited, under bust represented, body intact', () => {
    const measurements = measurementsFor(1000, 720);
    const value = solve(measurements);
    report('1000/720', measurements, value);
    const { result } = value;
    expect(chestStatusOf(result)).toBe('limited');
    expect(underBustStatusOf(result)).toBe('represented');
    expect(result.chestShoulderDiagnostics).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^chestCircumferenceMm:target-limited-to-(bounded|quality-safe)-endpoint$/,
        ),
      ]),
    );
    expect(result.chestShoulderRepresentedMeasurements).toContain('shoulderBreadthMm');
    expect(result.positionsM).not.toBe(sourcePositionsM);
    expect(result.positionsM.every(Number.isFinite)).toBe(true);
  }, 60_000);

  it('female 840/680: the bust tape cannot reach 840 on a 680 ribcage and says so', () => {
    const measurements = measurementsFor(840, 680);
    const value = solve(measurements);
    report('840/680', measurements, value);
    const { result } = value;
    expect(chestStatusOf(result)).toBe('limited');
    expect(underBustStatusOf(result)).toBe('represented');
    expect(result.chestShoulderDiagnostics).toEqual(
      expect.arrayContaining([
        'chestCircumferenceMm:female-bust-quality-fraction-limited',
        'chestCircumferenceMm:target-limited-to-quality-safe-endpoint',
      ]),
    );
    const tapeMm = measureMeshHorizontalSectionTapeGirthMmV1({
      positionsM: result.positionsM,
      triangleIndices: basis.indices,
      originM: result.chestStationOriginM!,
    });
    expect(tapeMm).toBeLessThan(840 - 1);
    expect(
      Math.abs(
        measureFemaleTorsoSectionGirthMmV1({
          positionsM: result.positionsM,
          triangleIndices: basis.indices,
          originM: result.underBustStationOriginM!,
        }) - 680,
      ),
    ).toBeLessThanOrEqual(1);
    expect(result.chestShoulderRepresentedMeasurements).toContain('shoulderBreadthMm');
    expect(result.positionsM.every(Number.isFinite)).toBe(true);
  }, 60_000);

  it('female chest without under bust uses the proportional ribcage and reports it', () => {
    const measurements = measurementsFor(880);
    const value = solve(measurements);
    report('880/-', measurements, value);
    expect(chestStatusOf(value.result)).toBe('represented');
    expect(underBustStatusOf(value.result)).toBe('notApplied');
    expect(value.result.ribcageDiagnostics).toContain('underbust-missing:proportional-ribcage');
  }, 60_000);

  it.each([200, 215, 185])(
    'female 835/720 with chest depth %i: depth at the apex plane, under bust held or named',
    (chestDepthMm) => {
      const measurements = Object.freeze({ ...measurementsFor(835, 720), chestDepthMm });
      const value = solve(measurements);
      report(`835/720+depth${chestDepthMm}`, measurements, value);
      const { result } = value;
      const chestDepth = result.depthModeResults.find(
        ({ measurementKey }) => measurementKey === 'chestDepthMm',
      );
      console.info(
        `[female bust depth] ${chestDepthMm}: rep=${JSON.stringify(result.depthRepresentedMeasurements)} ` +
          `lim=${JSON.stringify(result.depthLimitedMeasurements)} achieved=${chestDepth?.achievedDepthMm.toFixed(1)} ` +
          `diag=${JSON.stringify(result.depthDiagnostics.map(({ code }) => code))}`,
      );
      // The depth field gets a visible response at the apex plane (applied or honestly limited).
      expect(chestDepth).toBeDefined();
      expect([
        ...result.depthRepresentedMeasurements,
        ...result.depthLimitedMeasurements,
      ]).toContain('chestDepthMm');
      expect(result.chestStationOriginM).toEqual(result.femaleBust!.apexStationOriginM);
      const ubAfterMm = measureFemaleTorsoSectionGirthMmV1({
        positionsM: result.positionsM,
        triangleIndices: basis.indices,
        originM: result.underBustStationOriginM!,
      });
      // Either under bust held (solver tolerance 1 mm + depth drift budget 0.5 mm), or it is
      // demoted and named: never silently wrong.
      if (underBustStatusOf(result) === 'represented') {
        expect(Math.abs(ubAfterMm - 720)).toBeLessThanOrEqual(1.5);
      } else {
        expect(result.ribcageDiagnostics).toContain(
          'underBustCircumferenceMm:female-bust-depth-crosstalk-limited',
        );
      }
      const chestAfterMm =
        measureMeshHorizontalSectionTapeGirthMmV1({
          positionsM: result.positionsM,
          triangleIndices: basis.indices,
          originM: result.chestStationOriginM!,
        }) ?? Number.NaN;
      if (chestStatusOf(result) === 'represented') {
        expect(Math.abs(chestAfterMm - 835)).toBeLessThanOrEqual(2);
      }
    },
    120_000,
  );

  it('a female bust bundle that fails to load keeps the legacy path and says why', async () => {
    const loaded = await loadFemaleBustBundleForTorsoV1(async () => {
      throw new Error('offline');
    });
    expect(loaded).toEqual({ femaleBustUnavailableReason: 'offline' });
    const result = solveMeasurementOpenReferenceBetaTorsoV1({
      basis,
      sourcePositionsM,
      triangleIndices: basis.indices,
      measurements: measurementsFor(835, 720),
      torsoBundle,
      ...loaded,
    });
    expect(result.femaleBust).toBeUndefined();
    expect(result.ribcageDiagnostics).toContain('female-bust-unavailable:offline');
  }, 60_000);
});

describe('beta shape runtime: female bust end to end (posed final gate, L0 fallback)', () => {
  async function runtimeFor(measurements: CanonicalBodyMeasurementsMm) {
    const frame = createMeasurementBodyFrameV2({
      measurements,
      sourceRevision: 'female-bust-runtime-test',
      pose: 'A',
    });
    const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
    const waistHipRuntime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
      basis,
      measurements,
      openReference,
      loadBundle: async () => torsoBundle,
    });
    const startedAt = performance.now();
    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      basis,
      measurements,
      waistHipRuntime,
      loadTorsoBundle: async () => torsoBundle,
      loadFemaleBustBundle: async () => bustBundle,
      loadLengthPack: async () => lengthPack,
      loadPoseResources: async () => poseResources,
    });
    console.info(
      `[female bust runtime] ${measurements.chestCircumferenceMm}/${measurements.underBustCircumferenceMm}: ` +
        `${(performance.now() - startedAt).toFixed(0)} ms status=${result.status} ` +
        `limited=${JSON.stringify(result.limitedVisualControls ?? [])} ` +
        `diagnostics=${JSON.stringify(result.chestShoulderDiagnostics.filter((code) => code.includes('beta-final') || code.includes('female-bust')))}`,
    );
    return result;
  }

  it.each([
    [835, 720, 'represented'],
    [1000, 720, 'limited'],
  ] as const)(
    'female %i/%i survives the posed final gate without a whole-body rollback',
    async (chestMm, underBustMm, chestStatus) => {
      const result = await runtimeFor(measurementsFor(chestMm, underBustMm));
      expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
      expect(result.chestShoulderDiagnostics).not.toContain('beta-final-bust-subset-rollback');
      expect(result.representedVisualControls).toContain('underBustCircumferenceMm');
      if (chestStatus === 'represented') {
        expect(result.representedVisualControls).toContain('chestCircumferenceMm');
        expect(result.limitedVisualControls ?? []).not.toContain('chestCircumferenceMm');
      } else {
        expect(result.limitedVisualControls).toContain('chestCircumferenceMm');
        expect(result.representedVisualControls).not.toContain('chestCircumferenceMm');
      }
      expect(result.representedVisualControls).toContain('shoulderBreadthMm');
      expect(result.torsoSectionStations?.chest?.[1]).toBeGreaterThan(
        result.torsoSectionStations!.underBust![1],
      );
      // Claims stay visual-proxy only.
      expect(result.claims).toMatchObject({
        garmentFitClaimed: false,
        realBodyValidationClaimed: false,
        fitClaimEligible: false,
        productionAuthority: false,
      });
    },
    240_000,
  );
});
