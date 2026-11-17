import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

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
  measurementOpenReferenceFemaleBustFieldWeightV1,
  solveMeasurementOpenReferenceFemaleBustProxyV1,
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

const fixtureCache = new Map<number, ReturnType<typeof createFixture>>();

function fixture(heightMm = 1720) {
  const cached = fixtureCache.get(heightMm);
  if (cached) return cached;
  const created = createFixture(heightMm);
  fixtureCache.set(heightMm, created);
  return created;
}

function createFixture(heightMm: number) {
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
  targetUnderBustCircumferenceMm?: number,
  policy?: Parameters<typeof solveMeasurementOpenReferenceFemaleBustProxyV1>[0]['policy'],
) {
  return solveMeasurementOpenReferenceFemaleBustProxyV1({
    basis: basisFixture.basis,
    sourcePositionsM: basisFixture.display.mesh.positions,
    triangleIndices: basisFixture.display.mesh.indices,
    deltaBundle,
    heightMm: basisFixture.heightMm,
    targetCircumferenceMm,
    ...(targetUnderBustCircumferenceMm == null ? {} : { targetUnderBustCircumferenceMm }),
    underBustStationOriginM: basisFixture.underBustStationOriginM,
    armpitMergeStationOriginM: basisFixture.armpitMergeStationOriginM,
    apexStation: basisFixture.apexStation,
    ...(policy ? { policy } : {}),
  });
}

function timedSolve(
  basisFixture: ReturnType<typeof fixture>,
  targetCircumferenceMm: number,
  targetUnderBustCircumferenceMm?: number,
) {
  const startedAt = performance.now();
  const result = solve(basisFixture, targetCircumferenceMm, targetUnderBustCircumferenceMm);
  return { result, solveTimeMs: performance.now() - startedAt };
}

function describeRow(label: string, result: ReturnType<typeof solve>, solveTimeMs: number): string {
  const mode = result.modeResult;
  const armpitMinusApexMm =
    (mode?.armpitLineGirthMm ?? Number.NaN) - (mode?.achievedMm ?? Number.NaN);
  return (
    `${label}: ${result.status}/${result.underBust.status} ` +
    `s=${result.underBust.coefficient.toFixed(4)} c=${mode?.coefficient.toFixed(4)} ` +
    `fraction=${mode?.safeFraction.toFixed(3)} fullest=${mode?.fullestSectionOffsetMm.toFixed(1)}mm ` +
    `armpit-apex=${armpitMinusApexMm.toFixed(1)}mm ` +
    `(${mode?.armpitLineGirthMm.toFixed(1)}/${mode?.achievedMm.toFixed(1)}mm) ` +
    `iterations=${mode?.solveIterations} time=${solveTimeMs.toFixed(0)}ms`
  );
}

const PRODUCTION_PAIRS = [
  [820, 720],
  [835, 715],
  [835, 725],
  [840, 680],
  [860, 760],
  [870, 740],
] as const;

describe('measurement open-reference female bust proxy v1', () => {
  // Every solve is synchronous. Yielding a macrotask between tests lets the worker answer
  // vitest's RPC (60 s timeout) instead of queueing it behind the whole file.
  afterEach(async () => {
    await yieldToEventLoop();
  });

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

  it('1. represents the UB 720 sweep and keeps fullness on the apex plane without a shelf', () => {
    const testFixture = fixture();
    const rows: string[] = [];
    let previousForwardMm = Number.NEGATIVE_INFINITY;
    let previousArmpitLineMm = Number.NEGATIVE_INFINITY;
    for (let targetMm = 770; targetMm <= 890; targetMm += 20) {
      const { result, solveTimeMs } = timedSolve(testFixture, targetMm, 720);
      expect(result.status).toBe('represented');
      expect(result.underBust.status).toBe('represented');
      expect(result.qualityGate?.safe).toBe(true);
      expect(result.modeResult?.coefficient).toBeGreaterThanOrEqual(-1);
      expect(result.modeResult?.coefficient).toBeLessThanOrEqual(1.5);
      expect(result.modeResult?.absoluteResidualMm).toBeLessThanOrEqual(1);
      expect(result.underBust.absoluteResidualMm).toBeLessThanOrEqual(0.5);
      const armpitLineMm = result.modeResult?.armpitLineGirthMm ?? Number.NaN;
      if (targetMm >= 720 + 70) {
        // From UB+70 the fullest section sits on the bust plane, not under the arms.
        expect(
          Math.abs(result.modeResult?.fullestSectionOffsetMm ?? Number.POSITIVE_INFINITY),
        ).toBeLessThanOrEqual(10);
        expect(armpitLineMm).toBeLessThanOrEqual(
          result.modeResult?.achievedMm ?? Number.NEGATIVE_INFINITY,
        );
      }
      // Shelf guard: a fuller bust must not pull the armpit line in.
      expect(armpitLineMm).toBeGreaterThanOrEqual(previousArmpitLineMm);
      previousArmpitLineMm = armpitLineMm;
      const forwardMm = forwardApexMm(
        result.positionsM,
        testFixture.underBustStationOriginM[1],
        testFixture.armpitMergeStationOriginM[1],
      );
      expect(forwardMm + 0.01).toBeGreaterThanOrEqual(previousForwardMm);
      previousForwardMm = forwardMm;
      rows.push(describeRow(`${targetMm}/720`, result, solveTimeMs));
    }
    console.info(`[female bust real sweep]\n${rows.join('\n')}`);
  }, 120_000);

  it('keeps the legacy UB 720 sweep safe and forward-monotonic', () => {
    const testFixture = fixture();
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
      expect(result.underBust.status).toBe('represented');
      expect(result.underBust.absoluteResidualMm).toBeLessThanOrEqual(0.5);
    }
  }, 120_000);

  it('2. represents the production pairs within the measured Newton iteration budget', () => {
    const testFixture = fixture();
    const cases = [...PRODUCTION_PAIRS, [835, 720]] as const;
    const rows = cases.map(([chestMm, underBustMm]) => {
      const { result, solveTimeMs } = timedSolve(testFixture, chestMm, underBustMm);
      expect(result.status).toBe('represented');
      expect(result.underBust.status).toBe('represented');
      expect(result.modeResult?.absoluteResidualMm).toBeLessThanOrEqual(1);
      expect(result.underBust.absoluteResidualMm).toBeLessThanOrEqual(0.5);
      expect(result.modeResult?.coefficient).toBeGreaterThanOrEqual(-1);
      expect(result.modeResult?.coefficient).toBeLessThanOrEqual(1.5);
      expect(result.modeResult?.solveIterations).toBeLessThanOrEqual(3);
      return describeRow(`${chestMm}/${underBustMm}`, result, solveTimeMs);
    });
    console.info(`[female bust production pairs 1720]\n${rows.join('\n')}`);
  }, 120_000);

  it('3. reports coefficient and quality limits while restoring under-bust closure', () => {
    const testFixture = fixture();
    const rows: string[] = [];
    const { result: high, solveTimeMs: highTimeMs } = timedSolve(testFixture, 1000, 720);
    expect(high.status).toBe('limited');
    expect(high.modeResult?.endpoint).toBe(true);
    expect(high.modeResult?.safeFraction).toBeLessThan(1);
    expect(high.modeResult?.coefficient).toBeCloseTo(1.179, 1);
    expect(high.modeResult?.coefficient).toBeGreaterThanOrEqual(-1);
    expect(high.modeResult?.coefficient).toBeLessThanOrEqual(1.5);
    expect(high.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['coefficient-endpoint', 'quality-fraction-limited']),
    );
    expect(high.underBust.status).toBe('represented');
    expect(high.underBust.absoluteResidualMm).toBeLessThanOrEqual(0.5);
    expect(high.qualityGate?.safe).toBe(true);
    rows.push(describeRow('1000/720', high, highTimeMs));

    const { result: low, solveTimeMs: lowTimeMs } = timedSolve(testFixture, 740, 720);
    expect(low.status).toBe('limited');
    expect(low.modeResult?.coefficient).toBeCloseTo(-0.824, 1);
    expect(low.modeResult?.coefficient).toBeGreaterThanOrEqual(-1);
    expect(low.modeResult?.coefficient).toBeLessThanOrEqual(1.5);
    expect(low.diagnostics.map(({ code }) => code)).toContain('quality-fraction-limited');
    expect(low.underBust.status).toBe('represented');
    expect(low.underBust.absoluteResidualMm).toBeLessThanOrEqual(0.5);
    expect(low.qualityGate?.safe).toBe(true);
    rows.push(describeRow('740/720', low, lowTimeMs));
    console.info(`[female bust limit pairs]\n${rows.join('\n')}`);
  }, 120_000);

  it('4. uses proportional ribcage scaling when under bust is unrequested', () => {
    const testFixture = fixture();
    const rows = [800, 835, 900, 1000].map((chestMm) => {
      const { result, solveTimeMs } = timedSolve(testFixture, chestMm);
      expect(result.status).toBe('represented');
      expect(result.modeResult?.coefficient).toBe(0);
      expect(result.underBust.status).toBe('unrequested');
      expect(result.underBust.achievedMm).not.toBeNull();
      return describeRow(`${chestMm}/unrequested`, result, solveTimeMs);
    });
    console.info(`[female bust proportional ribcage]\n${rows.join('\n')}`);
  }, 120_000);

  it('5. moves the armpit line with the under-bust ribcage band', () => {
    const testFixture = fixture();
    const result = solve(testFixture, 820);
    expect(result.modeResult?.coefficient).toBe(0);
    expect(result.underBust.coefficient).toBeCloseTo(-0.12, 2);
    const baseUnderBustMm = perimeterMm(
      testFixture.display.mesh.positions,
      testFixture.display.mesh.indices,
      testFixture.underBustStationOriginM,
    );
    const baseArmpitLineMm = perimeterMm(
      testFixture.display.mesh.positions,
      testFixture.display.mesh.indices,
      testFixture.armpitMergeStationOriginM,
    );
    const underBustChangeMm = (result.underBust.achievedMm ?? Number.NaN) - baseUnderBustMm;
    const armpitLineChangeMm =
      (result.modeResult?.armpitLineGirthMm ?? Number.NaN) - baseArmpitLineMm;
    expect(armpitLineChangeMm / underBustChangeMm).toBeGreaterThanOrEqual(0.8);
  }, 120_000);

  it('6. keeps gated planes torso-only and records that the +15 mm plane is merged', () => {
    const testFixture = fixture();
    const positionsM = testFixture.display.mesh.positions;
    const indices = testFixture.display.mesh.indices;
    for (const originM of [
      testFixture.underBustStationOriginM,
      testFixture.apexStation.originM,
      testFixture.armpitMergeStationOriginM,
    ]) {
      const belowM = [originM[0], originM[1] - 0.006, originM[2]] as const;
      expect(perimeterMm(positionsM, indices, originM)).toBeLessThanOrEqual(
        perimeterMm(positionsM, indices, belowM) * 1.15,
      );
    }
    expect(
      perimeterMm(positionsM, indices, testFixture.mergedArmpitSectionOriginM),
    ).toBeGreaterThan(
      perimeterMm(positionsM, indices, testFixture.armpitMergeStationOriginM) * 1.15,
    );
  }, 120_000);

  it.each([1500, 1900] as const)(
    '7. represents every production pair at %i mm',
    (heightMm) => {
      const testFixture = fixture(heightMm);
      const rows = PRODUCTION_PAIRS.map(([chestMm, underBustMm]) => {
        const { result, solveTimeMs } = timedSolve(testFixture, chestMm, underBustMm);
        expect(result.status).toBe('represented');
        expect(result.underBust.status).toBe('represented');
        expect(result.modeResult?.absoluteResidualMm).toBeLessThanOrEqual(1);
        expect(result.underBust.absoluteResidualMm).toBeLessThanOrEqual(0.5);
        expect(result.qualityGate?.safe).toBe(true);
        return describeRow(`${chestMm}/${underBustMm}`, result, solveTimeMs);
      });
      console.info(`[female bust production pairs ${heightMm}]\n${rows.join('\n')}`);
    },
    120_000,
  );

  // The represented chest range on a 10 mm grid starts within 10 mm of `first` and ends within
  // 10 mm of `last`. With statuses monotonic along the grid, that is exactly: represented at
  // first+10 and last-10, and chest limited at first-20 and last+20.
  it.each([
    [680, 730, 860],
    [720, 770, 910],
    [760, 810, 960],
  ] as const)(
    '8. keeps the UB %i represented chest range within 10 mm of %i..%i',
    (underBustMm, expectedFirstMm, expectedLastMm) => {
      const testFixture = fixture();
      const rows: string[] = [];
      for (const chestMm of [expectedFirstMm + 10, expectedLastMm - 10]) {
        const { result, solveTimeMs } = timedSolve(testFixture, chestMm, underBustMm);
        rows.push(describeRow(`${chestMm}/${underBustMm}`, result, solveTimeMs));
        expect(result.status).toBe('represented');
        expect(result.underBust.status).toBe('represented');
      }
      for (const chestMm of [expectedFirstMm - 20, expectedLastMm + 20]) {
        const { result, solveTimeMs } = timedSolve(testFixture, chestMm, underBustMm);
        rows.push(describeRow(`${chestMm}/${underBustMm}`, result, solveTimeMs));
        expect(result.status).toBe('limited');
        expect(result.modeResult?.safeFraction).toBeLessThan(1);
        expect(result.underBust.status).toBe('represented');
        expect(result.underBust.absoluteResidualMm).toBeLessThanOrEqual(0.5);
        expect(result.qualityGate?.safe).toBe(true);
      }
      console.info(`[female bust range ends UB ${underBustMm}]\n${rows.join('\n')}`);
    },
    120_000,
  );

  it.each(['male', 'neutral'] as const)(
    '9. returns the same array and notApplicable for the %s basis',
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

  it('limits an unsafe low request at the signed-field endpoint without throwing', () => {
    const testFixture = fixture();
    const result = solve(testFixture, 740, 720);
    expect(result.status).toBe('limited');
    expect(result.modeResult?.coefficient).toBeLessThanOrEqual(1.5);
    expect(result.modeResult?.safeFraction).toBeLessThan(1);
    expect(result.diagnostics.map(({ code }) => code)).toContain('coefficient-endpoint');
    expect(result.diagnostics.map(({ code }) => code)).toContain('quality-fraction-limited');
    expect(result.qualityGate?.safe).toBe(true);
  }, 120_000);

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
  }, 120_000);

  it('keeps the authored side verbatim and switches the positive-side fold with one constant', () => {
    const testFixture = fixture();
    const underBustY = testFixture.underBustStationOriginM[1];
    const apexY = testFixture.apexStation.originM[1];
    const armpitY = testFixture.armpitMergeStationOriginM[1];
    const weight = (coefficient: number, sourceY: number, positiveSideFold: boolean) =>
      measurementOpenReferenceFemaleBustFieldWeightV1({
        coefficient,
        sourceY,
        underBustY,
        apexY,
        armpitY,
        positiveSideFold,
      });
    const heights = [
      underBustY - 0.05,
      underBustY,
      (underBustY + apexY) / 2,
      apexY,
      (apexY + armpitY) / 2,
      armpitY,
      armpitY + 0.05,
    ];
    for (const sourceY of heights) {
      expect(weight(-0.7, sourceY, true)).toBe(1);
      expect(weight(-0.7, sourceY, false)).toBe(1);
    }
    const expectWeights = (positiveSideFold: boolean, expected: readonly number[]) =>
      heights.forEach((sourceY, index) =>
        expect(weight(0.8, sourceY, positiveSideFold)).toBeCloseTo(expected[index], 9),
      );
    expectWeights(true, [0, 0, 0.5, 1, 0.5, 0, 0]);
    expectWeights(false, [1, 1, 1, 1, 0.5, 0, 0]);

    // The Newton Jacobian probes c = +0.01 from the zero start, so with the fold off an
    // authored-side solve takes another path to a different point inside the same closure
    // tolerance (770/720: c -0.713 vs -0.706). The field it applies at c < 0 is identical (above).
    const authored = solve(testFixture, 770, 720);
    const authoredUnfolded = solve(testFixture, 770, 720, { positiveSideFoldFalloff: false });
    for (const result of [authored, authoredUnfolded]) {
      expect(result.status).toBe('represented');
      expect(result.underBust.status).toBe('represented');
      expect(result.modeResult?.coefficient).toBeLessThan(0);
      expect(result.modeResult?.absoluteResidualMm).toBeLessThanOrEqual(1);
      expect(result.underBust.absoluteResidualMm).toBeLessThanOrEqual(0.5);
    }
    expect(authored.claims.positiveSideFoldFalloff).toBe('underbust-to-apex-smoothstep-ours');
    expect(authoredUnfolded.claims.positiveSideFoldFalloff).toBe('not-applied');

    const reversed = solve(testFixture, 870, 740);
    const reversedUnfolded = solve(testFixture, 870, 740, { positiveSideFoldFalloff: false });
    expect(reversed.modeResult?.coefficient).toBeGreaterThan(0);
    expect(reversedUnfolded.modeResult?.coefficient).toBeGreaterThan(0);
    expect(reversedUnfolded.positionsM).not.toEqual(reversed.positionsM);
  }, 120_000);

  it('rejects ribcage-band bounds outside the admitted envelope', () => {
    const testFixture = fixture();
    expect(() => solve(testFixture, 900, 720, { maximumBandCoefficient: 0.11 })).toThrow(
      RangeError,
    );
    expect(() => solve(testFixture, 900, 720, { minimumBandCoefficient: -0.31 })).toThrow(
      RangeError,
    );
    expect(() => solve(testFixture, 900, 720, { minimumBandCoefficient: 0 })).toThrow(RangeError);
    expect(() => solve(testFixture, 900, 720, { maximumBandCoefficient: 0 })).toThrow(RangeError);
  }, 120_000);

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
  }, 120_000);

  it('publishes only bounded visual-proxy claims', () => {
    const result = solve(fixture(), 870, 740);
    expect(result.claims).toMatchObject({
      positiveSideIsExtrapolation: true,
      positiveSideHeightFalloff: 'apex-to-armpit-line-smoothstep-ours',
      positiveSideFoldFalloff: 'underbust-to-apex-smoothstep-ours',
      underBustBand: 'ribcage-plateau-ours',
      underBustMissingMode: 'proportional-ribcage-ours',
      circumferenceRangeCalibrated: false,
      deformationSafetyBoundOnly: true,
      fitClaimEligible: false,
    });
  }, 120_000);
});
