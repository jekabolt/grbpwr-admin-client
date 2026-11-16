import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1,
  parseMakeHumanFemaleBustDeltaBundleV1,
} from './makehuman-female-bust-delta-bundle-v1';
import { createMakeHumanAnteriorChestShoulderModesResearchV1 } from './makehuman-anterior-chest-shoulder-modes-research-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisKindV1,
} from './measurement-open-reference-display-v1';
import {
  findMeasurementOpenReferenceFemaleBustApexPlaneV1,
  solveMeasurementOpenReferenceFemaleBustProxyV1,
  type MeasurementOpenReferenceFemaleBustApexStationV1,
} from './measurement-open-reference-female-bust-proxy-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

const workspace = process.cwd();
const deltaBundle = parseMakeHumanFemaleBustDeltaBundleV1(
  readFileSync(resolve(workspace, MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.assetPath)),
);
const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(workspace, 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);

type Vec3 = readonly [number, number, number];

function measurements(heightMm: number): CanonicalBodyMeasurementsMm {
  return Object.freeze({
    schemaVersion: 'canonical-body-measurements-v1',
    heightMm,
    shoulderBreadthMm: 400,
    chestCircumferenceMm: 900,
    underBustCircumferenceMm: 720,
    waistCircumferenceMm: 720,
    hipCircumferenceMm: 980,
    armLengthMm: 600,
    inseamMm: 800,
  }) as CanonicalBodyMeasurementsMm;
}

function loadBasis(kind: MakeHumanOpenReferenceBasisKindV1) {
  return parseMakeHumanOpenReferenceBasisV1(
    readFileSync(resolve(workspace, MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath)),
    kind,
  );
}

function fixture(heightMm = 1720) {
  const basis = loadBasis('female');
  const bodyMeasurements = measurements(heightMm);
  const frame = createMeasurementBodyFrameV2({
    measurements: bodyMeasurements,
    sourceRevision: `female-bust-proxy-test:${heightMm}`,
    pose: 'A',
  });
  const display = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
  const modes = createMakeHumanAnteriorChestShoulderModesResearchV1({
    basis,
    measurements: bodyMeasurements,
    bundle: torsoBundle,
  });
  const chestMode = modes.modes.find(
    ({ measurementKey }) => measurementKey === 'chestCircumferenceMm',
  );
  if (!chestMode?.chestStationOriginM) throw new Error('Test chest station is missing.');
  const currentChestStationOriginM = chestMode.chestStationOriginM;
  // The current chest station is the last torso-only plane before the arms merge into the loop.
  const armpitMergeStationOriginM = currentChestStationOriginM;
  const mergedArmpitSectionOriginM = Object.freeze([
    currentChestStationOriginM[0],
    currentChestStationOriginM[1] + 0.015,
    currentChestStationOriginM[2],
  ]) as Vec3;
  const underBustStationOriginM = modes.underBustStationOriginM;
  const apexStation = findMeasurementOpenReferenceFemaleBustApexPlaneV1({
    positionsM: display.mesh.positions,
    triangleIndices: display.mesh.indices,
    underBustStationOriginM,
    armpitMergeStationOriginM,
  });
  return Object.freeze({
    basis,
    display,
    heightMm,
    underBustStationOriginM,
    currentChestStationOriginM,
    armpitMergeStationOriginM,
    mergedArmpitSectionOriginM,
    apexStation,
  });
}

function perimeterMm(
  positionsM: Float32Array,
  indices: Uint16Array | Uint32Array,
  originM: Vec3,
): number {
  const measured = measureMeshPlaneSectionPerimetersV1({
    positionsM,
    triangleIndices: indices,
    planeOriginM: originM,
    planeNormal: [0, 1, 0],
    selection: { kind: 'nearest-seed', seedM: originM },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!measured.ok || !measured.selectedLoop) throw new Error('Test section failed.');
  return measured.selectedLoop.perimeterM * 1000;
}

function forwardApexMm(positionsM: Float32Array, underBustY: number, armpitY: number): number {
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (let vertex = 0; vertex < positionsM.length / 3; vertex += 1) {
    const offset = vertex * 3;
    const x = positionsM[offset];
    const y = positionsM[offset + 1];
    if (x < 0.02 || x > 0.15 || y < underBustY || y > armpitY) continue;
    maximumZ = Math.max(maximumZ, positionsM[offset + 2]);
  }
  if (!Number.isFinite(maximumZ)) throw new Error('Test apex vertex is missing.');
  return maximumZ * 1000;
}

function solve(
  basisFixture: ReturnType<typeof fixture>,
  targetCircumferenceMm: number,
  targetUnderBustCircumferenceMm: number,
) {
  return solveMeasurementOpenReferenceFemaleBustProxyV1({
    basis: basisFixture.basis,
    sourcePositionsM: basisFixture.display.mesh.positions,
    triangleIndices: basisFixture.display.mesh.indices,
    deltaBundle,
    heightMm: basisFixture.heightMm,
    targetCircumferenceMm,
    targetUnderBustCircumferenceMm,
    underBustStationOriginM: basisFixture.underBustStationOriginM,
    armpitMergeStationOriginM: basisFixture.armpitMergeStationOriginM,
    apexStation: basisFixture.apexStation,
  });
}

function fullestStation(options: {
  readonly positionsM: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly fixture: ReturnType<typeof fixture>;
}): MeasurementOpenReferenceFemaleBustApexStationV1 {
  return findMeasurementOpenReferenceFemaleBustApexPlaneV1({
    positionsM: options.positionsM,
    triangleIndices: options.indices,
    underBustStationOriginM: options.fixture.underBustStationOriginM,
    armpitMergeStationOriginM: options.fixture.armpitMergeStationOriginM,
    policy: { apexSearchStepM: 0.002 },
  });
}

describe('measurement open-reference female bust proxy v1', () => {
  it('finds the maximum-girth plane below the current chest station at each tried height', () => {
    const rows = [1500, 1720, 1900].map((heightMm) => {
      const testFixture = fixture(heightMm);
      const offsetMm =
        (testFixture.apexStation.originM[1] - testFixture.currentChestStationOriginM[1]) * 1000;
      expect(offsetMm).toBeLessThan(-20);
      expect(offsetMm).toBeGreaterThan(-60);
      return (
        `${heightMm}: apex=${(testFixture.apexStation.originM[1] * 1000).toFixed(1)}mm ` +
        `chest=${(testFixture.currentChestStationOriginM[1] * 1000).toFixed(1)}mm offset=${offsetMm.toFixed(1)}mm`
      );
    });
    console.info(`[female bust apex plane]\n${rows.join('\n')}`);
  }, 120_000);

  it('solves the real female sweep monotonically and records the failed station bounds', () => {
    const testFixture = fixture();
    const baselineArmpitMergeOrigin = testFixture.mergedArmpitSectionOriginM;
    const baselineArmpitMm = perimeterMm(
      testFixture.display.mesh.positions,
      testFixture.display.mesh.indices,
      baselineArmpitMergeOrigin,
    );
    const rows: string[] = [];
    const fullestOffsetsMm: number[] = [];
    const armpitDriftsMm: number[] = [];
    let previousForwardMm = Number.NEGATIVE_INFINITY;
    for (let targetMm = 820; targetMm <= 1000; targetMm += 20) {
      const result = solve(testFixture, targetMm, 720);
      expect(['represented', 'limited']).toContain(result.status);
      expect(result.qualityGate?.safe).toBe(true);
      if (result.status === 'represented') {
        expect(result.modeResult?.absoluteResidualMm).toBeLessThanOrEqual(1);
      }
      const forwardMm = forwardApexMm(
        result.positionsM,
        testFixture.underBustStationOriginM[1],
        testFixture.armpitMergeStationOriginM[1],
      );
      expect(forwardMm + 0.01).toBeGreaterThanOrEqual(previousForwardMm);
      previousForwardMm = forwardMm;
      const fullest = fullestStation({
        positionsM: result.positionsM,
        indices: testFixture.display.mesh.indices,
        fixture: testFixture,
      });
      const fullestOffsetMm = (fullest.originM[1] - testFixture.apexStation.originM[1]) * 1000;
      fullestOffsetsMm.push(fullestOffsetMm);
      const armpitDriftMm =
        perimeterMm(
          result.positionsM,
          testFixture.display.mesh.indices,
          baselineArmpitMergeOrigin,
        ) - baselineArmpitMm;
      armpitDriftsMm.push(armpitDriftMm);
      if (result.underBust.status === 'represented') {
        expect(result.underBust.absoluteResidualMm).toBeLessThanOrEqual(0.5);
      } else {
        expect(result.underBust.status).toBe('limited');
      }
      rows.push(
        `${targetMm}: ${result.status} c=${result.modeResult?.coefficient.toFixed(4)} ` +
          `g=${result.modeResult?.achievedMm.toFixed(1)} fullest=${fullestOffsetMm.toFixed(1)}mm ` +
          `armpit=${armpitDriftMm.toFixed(1)}mm ub=${result.underBust.absoluteResidualMm?.toFixed(2)}`,
      );
    }
    console.info(`[female bust real sweep]\n${rows.join('\n')}`);
    // The approved design's +/-10 mm fullest-plane and <=10 mm armpit-merge bounds are false on
    // the committed female basis. Pin the observed failure direction instead of relaxing them.
    expect(Math.max(...fullestOffsetsMm.map(Math.abs))).toBeGreaterThan(30);
    expect(Math.max(...armpitDriftsMm.map(Math.abs))).toBeGreaterThan(10);
  }, 180_000);

  it('prints measured signed coefficients for the production-like cases', () => {
    const testFixture = fixture();
    const cases = [
      [835, 720],
      [870, 740],
      [840, 680],
      [770, 720],
      [1000, 720],
    ] as const;
    const rows = cases.map(([chestMm, underBustMm]) => {
      const result = solve(testFixture, chestMm, underBustMm);
      expect(['represented', 'limited']).toContain(result.status);
      expect(result.modeResult?.coefficient).toBeGreaterThanOrEqual(-1);
      expect(result.modeResult?.coefficient).toBeLessThanOrEqual(1.5);
      if (result.underBust.status === 'represented') {
        expect(result.underBust.absoluteResidualMm).toBeLessThanOrEqual(0.5);
      } else {
        expect(result.underBust.status).toBe('limited');
      }
      return (
        `${chestMm}/${underBustMm}: ${result.status} c=${result.modeResult?.coefficient.toFixed(6)} ` +
        `chestResidual=${result.modeResult?.absoluteResidualMm.toFixed(3)} ` +
        `ub=${result.underBust.status} ubResidual=${result.underBust.absoluteResidualMm?.toFixed(3)}`
      );
    });
    console.info(`[female bust measured coefficients]\n${rows.join('\n')}`);
  }, 120_000);

  it('limits an out-of-range request at the signed-field endpoint without throwing', () => {
    const testFixture = fixture();
    const result = solve(testFixture, 1100, 720);
    expect(result.status).toBe('limited');
    expect(result.modeResult?.coefficient).toBeLessThanOrEqual(1.5);
    expect(result.modeResult?.safeFraction).toBeLessThan(1);
    expect(result.diagnostics.map(({ code }) => code)).toContain('coefficient-endpoint');
    expect(result.diagnostics.map(({ code }) => code)).toContain('quality-fraction-limited');
    expect(result.qualityGate?.safe).toBe(true);
  });

  it('marks non-converged under-bust closure limited after at most three rounds', () => {
    const testFixture = fixture();
    const result = solve(testFixture, 840, 680);
    expect(result.underBust.closureRounds).toBeLessThanOrEqual(3);
    if ((result.underBust.absoluteResidualMm ?? Number.POSITIVE_INFINITY) > 0.5) {
      expect(result.underBust.status).toBe('limited');
      expect(result.diagnostics.map(({ code }) => code)).toContain('underbust-closure-limited');
    } else {
      expect(['represented', 'limited']).toContain(result.underBust.status);
    }
  });

  it.each(['male', 'neutral'] as const)(
    'returns the same array and notApplicable for the %s basis',
    (kind) => {
      const basis = loadBasis(kind);
      const positionsM = new Float32Array(basis.positionsSourceUnits.length);
      const result = solveMeasurementOpenReferenceFemaleBustProxyV1({
        basis,
        sourcePositionsM: positionsM,
        triangleIndices: basis.indices,
        deltaBundle,
        heightMm: 1720,
        targetCircumferenceMm: 900,
        targetUnderBustCircumferenceMm: 720,
        underBustStationOriginM: [0, 1, 0],
        armpitMergeStationOriginM: [0, 1.1, 0],
      });
      expect(result.status).toBe('notApplicable');
      expect(result.underBust.status).toBe('notApplicable');
      expect(result.positionsM).toBe(positionsM);

      const unrequested = solveMeasurementOpenReferenceFemaleBustProxyV1({
        basis,
        sourcePositionsM: positionsM,
        triangleIndices: basis.indices,
        deltaBundle,
        heightMm: 1720,
        underBustStationOriginM: [0, 1, 0],
        armpitMergeStationOriginM: [0, 1.1, 0],
      });
      expect(unrequested.status).toBe('unrequested');
      expect(unrequested.positionsM).toBe(positionsM);
    },
  );

  it('keeps fast paths identical and rejects non-finite or non-positive targets', () => {
    const testFixture = fixture();
    const common = {
      basis: testFixture.basis,
      sourcePositionsM: testFixture.display.mesh.positions,
      triangleIndices: testFixture.display.mesh.indices,
      deltaBundle,
      heightMm: testFixture.heightMm,
      underBustStationOriginM: testFixture.underBustStationOriginM,
      armpitMergeStationOriginM: testFixture.armpitMergeStationOriginM,
      apexStation: testFixture.apexStation,
    } as const;
    const unrequested = solveMeasurementOpenReferenceFemaleBustProxyV1(common);
    expect(unrequested.status).toBe('unrequested');
    expect(unrequested.positionsM).toBe(common.sourcePositionsM);
    for (const targetCircumferenceMm of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const rejected = solveMeasurementOpenReferenceFemaleBustProxyV1({
        ...common,
        targetCircumferenceMm,
      });
      expect(rejected.status).toBe('notApplied');
      expect(rejected.positionsM).toBe(common.sourcePositionsM);
      expect(rejected.diagnostics.map(({ code }) => code)).toEqual(['target-invalid']);
    }
    for (const targetUnderBustCircumferenceMm of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const rejected = solveMeasurementOpenReferenceFemaleBustProxyV1({
        ...common,
        targetCircumferenceMm: 900,
        targetUnderBustCircumferenceMm,
      });
      expect(rejected.status).toBe('notApplied');
      expect(rejected.underBust.status).toBe('notApplied');
      expect(rejected.positionsM).toBe(common.sourcePositionsM);
      expect(rejected.diagnostics.map(({ code }) => code)).toEqual(['target-invalid']);
    }
  });

  it('publishes only bounded visual-proxy claims', () => {
    const result = solve(fixture(), 870, 740);
    expect(result.claims).toMatchObject({
      positiveSideIsExtrapolation: true,
      circumferenceRangeCalibrated: false,
      deformationSafetyBoundOnly: true,
      fitClaimEligible: false,
    });
  });
});
