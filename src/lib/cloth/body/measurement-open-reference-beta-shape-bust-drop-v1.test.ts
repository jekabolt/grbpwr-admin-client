import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it, vi } from 'vitest';

import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import {
  MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1,
  parseMakeHumanFemaleBustDeltaBundleV1,
} from './makehuman-female-bust-delta-bundle-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { parseMakeHumanWaistHipRigAnchorDeltaBundleV1 } from './makehuman-waist-hip-rig-anchor-research-v1';
import {
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  parseMakeHuman2PoseCompatibleLengthPackV1,
} from './makehuman2-pose-compatible-length-pack-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import { createMeasurementOpenReferenceBetaShapeRuntimeV1 } from './measurement-open-reference-beta-shape-runtime-v1';
import { createMeasurementOpenReferenceBetaTorsoInWorkerV1 } from './measurement-open-reference-beta-torso-worker-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisKindV1,
} from './measurement-open-reference-display-v1';
import { measureFemaleTorsoSectionGirthMmV1 } from './measurement-open-reference-female-torso-stage-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';

/**
 * Bust-drop L0 step of the beta shape runtime: when the chest halfway and chest removed retries
 * still fail the final global gate, a female body with an under-bust target is solved once more
 * without under bust and with chest at the unshaped base girth before the whole body rolls back.
 * Female only by design; male and neutral go straight to the whole-body rollback.
 */
const cwd = process.cwd();
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

const MEASUREMENTS: CanonicalBodyMeasurementsMm = Object.freeze({
  ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
  shoulderBreadthMm: 400,
  chestCircumferenceMm: 1_020,
  underBustCircumferenceMm: 760,
  waistCircumferenceMm: 720,
});

/** Girth tolerance for under bust, waist and hip after the drop (mm). */
const GIRTH_TOLERANCE_MM = 0.5;
/** Apex tolerance: the dropped bust sits on the unshaped base apex (mm). */
const APEX_TOLERANCE_MM = 1;

type Vec3 = readonly [number, number, number];

async function fixture(
  kind: MakeHumanOpenReferenceBasisKindV1,
  measurements: CanonicalBodyMeasurementsMm = MEASUREMENTS,
) {
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readFileSync(resolve(cwd, MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath)),
    kind,
  );
  const frame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: `beta-shape-bust-drop-test:${kind}`,
    pose: 'A',
  });
  const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
  const waistHipRuntime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
    basis,
    measurements,
    openReference,
    loadBundle: async () => torsoBundle,
  });
  return { basis, waistHipRuntime };
}

function stationOf(
  waistHipRuntime: Awaited<ReturnType<typeof fixture>>['waistHipRuntime'],
  key: 'waistCircumferenceMm' | 'hipCircumferenceMm',
): Vec3 {
  const origin = waistHipRuntime.sectionModes?.find(
    ({ measurementKey }) => measurementKey === key,
  )?.stationOriginM;
  if (!origin) throw new Error(`${key} station is missing.`);
  return origin;
}

function girthMm(
  positionsM: Float32Array,
  triangleIndices: Uint16Array | Uint32Array,
  originM: Vec3,
) {
  return measureFemaleTorsoSectionGirthMmV1({ positionsM, triangleIndices, originM });
}

/** Most forward torso vertex between the under-bust and chest stations, right half (mm). */
function forwardApexMm(positionsM: Float32Array, underBustY: number, chestY: number): number {
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (let vertex = 0; vertex < positionsM.length / 3; vertex += 1) {
    const offset = vertex * 3;
    const x = positionsM[offset];
    const y = positionsM[offset + 1];
    if (x < 0.02 || x > 0.15 || y < underBustY || y > chestY) continue;
    maximumZ = Math.max(maximumZ, positionsM[offset + 2]);
  }
  if (!Number.isFinite(maximumZ)) throw new Error('Test apex vertex is missing.');
  return maximumZ * 1000;
}

/**
 * Real torso worker; every solve that still carries an under-bust target is made unsafe, so the
 * chest-halved and chest-removed retries fail the final gate and only a solve without under bust
 * can pass. Returns the real (uncorrupted) worker outputs per call.
 */
function torsoFailingWithUnderBust() {
  const realOutputs: Awaited<
    ReturnType<typeof createMeasurementOpenReferenceBetaTorsoInWorkerV1>
  >[] = [];
  const createTorsoShape = vi.fn(
    async (options: Parameters<typeof createMeasurementOpenReferenceBetaTorsoInWorkerV1>[0]) => {
      const torso = await createMeasurementOpenReferenceBetaTorsoInWorkerV1(options);
      realOutputs.push(torso);
      if (options.measurements.underBustCircumferenceMm == null) return torso;
      const positionsM = torso.positionsM.slice();
      positionsM[0] += 10;
      return Object.freeze({ ...torso, positionsM });
    },
  );
  return { createTorsoShape, realOutputs };
}

describe('measurement open-reference beta shape runtime v1 bust-drop L0 step', () => {
  it('female: drops the bust to the base apex and keeps under bust, waist and hip in tolerance', async () => {
    const { basis, waistHipRuntime } = await fixture('female');
    const indices = waistHipRuntime.displayMesh.indices;
    const sourcePositionsM = waistHipRuntime.displayMesh.positions;
    const { createTorsoShape, realOutputs } = torsoFailingWithUnderBust();

    const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      basis,
      measurements: MEASUREMENTS,
      waistHipRuntime,
      loadTorsoBundle: async () => torsoBundle,
      loadFemaleBustBundle: async () => bustBundle,
      loadLengthPack: async () => lengthPack,
      loadPoseResources: async () => poseResources,
      createTorsoShape,
    });

    // original -> chest halved -> chest removed -> bust dropped.
    expect(createTorsoShape).toHaveBeenCalledTimes(4);
    const calls = createTorsoShape.mock.calls.map(([options]) => options.measurements);
    expect(calls.slice(0, 3).every((m) => m.underBustCircumferenceMm === 760)).toBe(true);
    const dropped = calls[3];
    expect(dropped.underBustCircumferenceMm).toBeUndefined();
    expect(dropped.chestCircumferenceMm).toBe(calls[2].chestCircumferenceMm);
    expect(dropped.chestCircumferenceMm).toBeLessThan(MEASUREMENTS.chestCircumferenceMm);

    expect(result.chestShoulderDiagnostics.slice(0, 2)).toEqual([
      'beta-final-bust-subset-rollback',
      'underBustCircumferenceMm:beta-final-target-removed',
    ]);
    expect(result.chestShoulderDiagnostics).toContain(
      'chestCircumferenceMm:beta-final-target-removed',
    );
    expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
    expect(result.chestShoulderDiagnostics).not.toContain('underbust-missing:proportional-ribcage');
    expect(result.representedVisualControls).not.toContain('underBustCircumferenceMm');
    expect(result.limitedVisualControls ?? []).not.toContain('underBustCircumferenceMm');
    expect(result.representedVisualControls).not.toContain('chestCircumferenceMm');
    expect(result.representedVisualControls).toEqual(
      expect.arrayContaining(['waistCircumferenceMm', 'hipCircumferenceMm', 'shoulderBreadthMm']),
    );
    expect(result.status).toBe('partial');
    expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
    expect(result.claims.torsoDepthFrontBackDistributionCalibrated).toBe(false);

    const requested = realOutputs[0];
    const droppedTorso = realOutputs[3];
    // Re-baselined on purpose (female under-bust fold station): the dropped solve carries no
    // under-bust target, so like any female bust-path body without one it puts its under-bust
    // plane on the base's fold, below the bounded plane the 760 target was solved on. Every check
    // below still reads that bounded plane; the dropped band is also checked on its own fold plane.
    const underBustStation = requested.underBustStationOriginM!;
    const droppedUnderBustStation = droppedTorso.underBustStationOriginM!;
    const chestStation = droppedTorso.chestStationOriginM!;
    expect(requested.ribcageDiagnostics).not.toContain('underbust-station:female-fold-template');
    expect(droppedTorso.ribcageDiagnostics).toContain('underbust-station:female-fold-template');
    expect(droppedUnderBustStation[1]).toBeLessThan(underBustStation[1]);
    expect(chestStation[1]).toBeGreaterThan(underBustStation[1]);

    // Apex: the requested bust pushes it forward; the drop brings it back to the base apex.
    const baseApexMm = forwardApexMm(sourcePositionsM, underBustStation[1], chestStation[1]);
    const requestedApexMm = forwardApexMm(
      requested.positionsM,
      underBustStation[1],
      chestStation[1],
    );
    const droppedApexMm = forwardApexMm(
      droppedTorso.positionsM,
      underBustStation[1],
      chestStation[1],
    );

    // Under bust: the 760 target is gone, the band returns to the base girth.
    const baseUnderBustMm = girthMm(sourcePositionsM, indices, underBustStation);
    const requestedUnderBustMm = girthMm(requested.positionsM, indices, underBustStation);
    const droppedUnderBustMm = girthMm(droppedTorso.positionsM, indices, underBustStation);
    const baseFoldUnderBustMm = girthMm(sourcePositionsM, indices, droppedUnderBustStation);
    const droppedFoldUnderBustMm = girthMm(
      droppedTorso.positionsM,
      indices,
      droppedUnderBustStation,
    );

    const waistStation = stationOf(waistHipRuntime, 'waistCircumferenceMm');
    const hipStation = stationOf(waistHipRuntime, 'hipCircumferenceMm');
    const baseWaistMm = girthMm(sourcePositionsM, indices, waistStation);
    const droppedWaistMm = girthMm(droppedTorso.positionsM, indices, waistStation);
    const baseHipMm = girthMm(sourcePositionsM, indices, hipStation);
    const droppedHipMm = girthMm(droppedTorso.positionsM, indices, hipStation);

    console.info(
      `BUST_DROP_FEMALE=${JSON.stringify({
        apexMm: { base: baseApexMm, requested: requestedApexMm, dropped: droppedApexMm },
        underBustMm: {
          base: baseUnderBustMm,
          requested: requestedUnderBustMm,
          dropped: droppedUnderBustMm,
        },
        waistMm: { base: baseWaistMm, dropped: droppedWaistMm },
        hipMm: { base: baseHipMm, dropped: droppedHipMm },
        droppedChestMm: dropped.chestCircumferenceMm,
      })}`,
    );

    expect(requestedApexMm).toBeGreaterThan(droppedApexMm + APEX_TOLERANCE_MM);
    expect(Math.abs(droppedApexMm - baseApexMm)).toBeLessThanOrEqual(APEX_TOLERANCE_MM);
    expect(Math.abs(requestedUnderBustMm - 760)).toBeLessThanOrEqual(GIRTH_TOLERANCE_MM);
    expect(Math.abs(droppedUnderBustMm - baseUnderBustMm)).toBeLessThanOrEqual(GIRTH_TOLERANCE_MM);
    expect(Math.abs(droppedFoldUnderBustMm - baseFoldUnderBustMm)).toBeLessThanOrEqual(
      GIRTH_TOLERANCE_MM,
    );
    expect(Math.abs(droppedWaistMm - baseWaistMm)).toBeLessThanOrEqual(GIRTH_TOLERANCE_MM);
    expect(Math.abs(droppedHipMm - baseHipMm)).toBeLessThanOrEqual(GIRTH_TOLERANCE_MM);
  }, 240_000);

  it.each(['male', 'neutral'] as const)(
    '%s: the bust-drop step never runs; the failing body rolls back whole and keeps waist and hip',
    async (kind) => {
      const { basis, waistHipRuntime } = await fixture(kind);
      const { createTorsoShape } = torsoFailingWithUnderBust();

      const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
        basis,
        measurements: MEASUREMENTS,
        waistHipRuntime,
        loadTorsoBundle: async () => torsoBundle,
        loadLengthPack: async () => lengthPack,
        loadPoseResources: async () => poseResources,
        createTorsoShape,
      });

      // original -> chest halved -> chest removed; no bust-dropped solve.
      expect(createTorsoShape).toHaveBeenCalledTimes(3);
      expect(
        createTorsoShape.mock.calls.every(
          ([options]) => options.measurements.underBustCircumferenceMm === 760,
        ),
      ).toBe(true);
      expect(result.chestShoulderDiagnostics).toContain('beta-final-global-quality-rollback');
      expect(result.chestShoulderDiagnostics).not.toContain('beta-final-bust-subset-rollback');
      expect(result.chestShoulderDiagnostics).not.toContain(
        'underBustCircumferenceMm:beta-final-target-removed',
      );

      const indices = waistHipRuntime.displayMesh.indices;
      const sourcePositionsM = waistHipRuntime.displayMesh.positions;
      const positionsM = result.fkProxyRuntime.displayMesh.positions;
      for (const key of ['waistCircumferenceMm', 'hipCircumferenceMm'] as const) {
        const station = stationOf(waistHipRuntime, key);
        expect(
          Math.abs(
            girthMm(positionsM, indices, station) - girthMm(sourcePositionsM, indices, station),
          ),
        ).toBeLessThanOrEqual(GIRTH_TOLERANCE_MM);
      }
    },
    240_000,
  );
});

/**
 * The female under-bust fold plane is only a default for an untyped under bust: when the fold
 * result leaves a typed field unapplied, the runtime solves the typed-only chain once more on the
 * bounded plane and keeps the fold only if it applies every typed field at least as well.
 */
describe('measurement open-reference beta shape runtime v1 fold yields to a typed field', () => {
  const { underBustCircumferenceMm: _underBust, ...untypedUnderBust } =
    CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements;
  // Re-baselined on purpose after #453 (tape girths): with 205/195/225 the bounded plane itself
  // already drops depth on beta bb599aa3e (final global gate -> depth-subset rollback, measured
  // with the fold off), so that body no longer exercised the yield. 215/205/235 is kept whole by
  // the bounded plane on beta and by the fold plane unperturbed; the assertions are unchanged.
  const CHEST_DEPTH_MM = 215;
  const DEPTH_TYPED: CanonicalBodyMeasurementsMm = Object.freeze({
    ...untypedUnderBust,
    chestDepthMm: CHEST_DEPTH_MM,
    waistDepthMm: 205,
    hipDepthMm: 235,
  });
  const YIELD = 'underbust-station:fold-yielded-to-typed-field';
  const FOLD = 'underbust-station:female-fold-template';
  type TorsoOptions = Parameters<typeof createMeasurementOpenReferenceBetaTorsoInWorkerV1>[0];

  function torsoFailingWhen(fails: (options: TorsoOptions) => boolean) {
    const realOutputs: Awaited<
      ReturnType<typeof createMeasurementOpenReferenceBetaTorsoInWorkerV1>
    >[] = [];
    const createTorsoShape = vi.fn(async (options: TorsoOptions) => {
      const torso = await createMeasurementOpenReferenceBetaTorsoInWorkerV1(options);
      realOutputs.push(torso);
      if (!fails(options)) return torso;
      const positionsM = torso.positionsM.slice();
      positionsM[0] += 10;
      return Object.freeze({ ...torso, positionsM });
    });
    return { createTorsoShape, realOutputs };
  }

  async function run(
    measurements: CanonicalBodyMeasurementsMm,
    createTorsoShape: ReturnType<typeof torsoFailingWhen>['createTorsoShape'],
  ) {
    const { basis, waistHipRuntime } = await fixture('female', measurements);
    return createMeasurementOpenReferenceBetaShapeRuntimeV1({
      basis,
      measurements,
      waistHipRuntime,
      loadTorsoBundle: async () => torsoBundle,
      loadFemaleBustBundle: async () => bustBundle,
      loadLengthPack: async () => lengthPack,
      loadPoseResources: async () => poseResources,
      createTorsoShape,
    });
  }

  function applied(result: Awaited<ReturnType<typeof run>>) {
    return new Set([...result.representedVisualControls, ...(result.limitedVisualControls ?? [])]);
  }

  it('takes the bounded plane when only it keeps the typed depth', async () => {
    const { createTorsoShape, realOutputs } = torsoFailingWhen(
      (options) =>
        options.underBustBoundedPlane !== true && options.measurements.chestDepthMm != null,
    );
    const result = await run(DEPTH_TYPED, createTorsoShape);

    // fold with depth (fails) -> fold without depth -> bounded with depth.
    expect(createTorsoShape).toHaveBeenCalledTimes(3);
    const calls = createTorsoShape.mock.calls.map(([options]) => options);
    expect(calls.map(({ underBustBoundedPlane }) => underBustBoundedPlane)).toEqual([
      undefined,
      undefined,
      true,
    ]);
    expect(calls.map(({ measurements }) => measurements.chestDepthMm)).toEqual([
      CHEST_DEPTH_MM,
      undefined,
      CHEST_DEPTH_MM,
    ]);
    expect(realOutputs[0].ribcageDiagnostics).toContain(FOLD);
    expect(realOutputs[2].ribcageDiagnostics).not.toContain(FOLD);
    expect(realOutputs[2].underBustStationOriginM![1]).toBeGreaterThan(
      realOutputs[0].underBustStationOriginM![1],
    );

    expect(result.chestShoulderDiagnostics[0]).toBe(YIELD);
    expect(result.chestShoulderDiagnostics).not.toContain('beta-final-depth-subset-rollback');
    expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
    for (const key of ['chestDepthMm', 'waistDepthMm', 'hipDepthMm'] as const) {
      expect(applied(result).has(key)).toBe(true);
    }
    expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
    expect(result.claims.torsoDepthFrontBackDistributionCalibrated).toBe(false);
  }, 240_000);

  it('keeps the fold when the bounded plane applies no typed field better', async () => {
    const { createTorsoShape } = torsoFailingWhen(
      (options) => options.measurements.chestDepthMm != null,
    );
    const result = await run(DEPTH_TYPED, createTorsoShape);

    // fold: depth (fails) -> no depth; bounded: depth (fails) -> no depth.
    expect(createTorsoShape).toHaveBeenCalledTimes(4);
    const calls = createTorsoShape.mock.calls.map(([options]) => options);
    expect(calls.map(({ underBustBoundedPlane }) => underBustBoundedPlane)).toEqual([
      undefined,
      undefined,
      true,
      true,
    ]);
    expect(result.chestShoulderDiagnostics).toContain('beta-final-depth-subset-rollback');
    expect(result.chestShoulderDiagnostics).toContain(FOLD);
    expect(result.chestShoulderDiagnostics).not.toContain(YIELD);
    expect(applied(result).has('chestDepthMm')).toBe(false);
  }, 240_000);

  it('never runs while every typed field is applied', async () => {
    const { chestDepthMm: _c, waistDepthMm: _w, hipDepthMm: _h, ...depthUntyped } = DEPTH_TYPED;
    let solves = 0;
    const { createTorsoShape } = torsoFailingWhen(() => solves++ === 0);
    const result = await run(Object.freeze(depthUntyped), createTorsoShape);

    // fold (fails) -> chest halfway on the fold plane, chest still applied (limited).
    expect(createTorsoShape).toHaveBeenCalledTimes(2);
    const calls = createTorsoShape.mock.calls.map(([options]) => options);
    expect(calls.every(({ underBustBoundedPlane }) => underBustBoundedPlane == null)).toBe(true);
    expect(calls[1].measurements.chestCircumferenceMm).not.toBe(
      calls[0].measurements.chestCircumferenceMm,
    );
    expect(applied(result).has('chestCircumferenceMm')).toBe(true);
    expect(result.chestShoulderDiagnostics).not.toContain(YIELD);
    expect(result.chestShoulderDiagnostics).toContain(FOLD);
  }, 240_000);
});
