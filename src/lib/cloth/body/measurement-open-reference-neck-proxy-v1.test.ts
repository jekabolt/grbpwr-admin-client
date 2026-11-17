import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { createMakeHumanAnteriorChestShoulderModesResearchV1 } from './makehuman-anterior-chest-shoulder-modes-research-v1';
import {
  parseMakeHumanCoreRigBundleV1,
  type MakeHumanCoreRigBundleV1,
} from './makehuman-core-rig-pose-research-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisKindV1,
  type MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import {
  inspectMeasurementOpenReferenceNeckAdmissionV1,
  solveMeasurementOpenReferenceNeckProxyV1,
  type MeasurementOpenReferenceNeckRigHeadsV1,
} from './measurement-open-reference-neck-proxy-v1';

const MEASUREMENTS = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements;
const HEIGHT_MM = MEASUREMENTS.heightMm;
const KINDS = Object.freeze([
  'female',
  'male',
  'neutral',
] as const satisfies readonly MakeHumanOpenReferenceBasisKindV1[]);
const ADMITTED_KINDS = Object.freeze([
  'female',
  'neutral',
] as const satisfies readonly MakeHumanOpenReferenceBasisKindV1[]);
const EXPECTED_PROBE = Object.freeze({
  female: Object.freeze({
    admitted: true,
    neckLengthMm: 122.56698885443835,
    axialRadiusMm: 21.723663704946187,
    basePerimeterMm: 300.47189780690826,
    jawClearanceMm: 74.51684764522565,
  }),
  male: Object.freeze({
    admitted: false,
    neckLengthMm: 102.52894109976437,
    axialRadiusMm: 10.259042820761197,
    basePerimeterMm: 358.5797630078998,
    jawClearanceMm: 80.50353797185183,
  }),
  neutral: Object.freeze({
    admitted: true,
    neckLengthMm: 112.16315937520311,
    axialRadiusMm: 15.497573049865535,
    basePerimeterMm: 330.6197024915177,
    jawClearanceMm: 77.73152068338386,
  }),
});

const rig = parseMakeHumanCoreRigBundleV1(
  readFileSync(resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-core-rig-v1.bin')),
);
const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);

function boneHeadDisplayM(options: {
  readonly rig: MakeHumanCoreRigBundleV1;
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly boneName: string;
}): readonly [number, number, number] {
  const bone = options.rig.bones.findIndex(({ name }) => name === options.boneName);
  if (bone < 0) throw new Error(`Core rig is missing ${options.boneName}.`);
  const anchors = options.rig.bases.find(({ kind }) => kind === options.basis.kind);
  if (!anchors) throw new Error(`Core rig is missing ${options.basis.kind}.`);
  const sourceHeight = options.basis.sourceMaximumY - options.basis.sourceMinimumY;
  const scaleMPerSourceUnit = HEIGHT_MM / 1000 / sourceHeight;
  const offset = bone * 3;
  return Object.freeze([
    anchors.headsSourceUnits[offset] * scaleMPerSourceUnit,
    (anchors.headsSourceUnits[offset + 1] - options.basis.sourceMinimumY) * scaleMPerSourceUnit,
    anchors.headsSourceUnits[offset + 2] * scaleMPerSourceUnit,
  ]);
}

function realFixture(kind: MakeHumanOpenReferenceBasisKindV1) {
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readFileSync(
      resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    ),
    kind,
  );
  const torso = createMakeHumanAnteriorChestShoulderModesResearchV1({
    basis,
    measurements: MEASUREMENTS,
    bundle: torsoBundle,
  });
  const chest = torso.modes.find(({ measurementKey }) => measurementKey === 'chestCircumferenceMm');
  const shoulder = torso.modes.find(({ measurementKey }) => measurementKey === 'shoulderBreadthMm');
  if (!chest?.chestStationOriginM || !shoulder?.shoulderVertices) {
    throw new Error('Chest and shoulder protected inputs are missing.');
  }
  const rigHeads: MeasurementOpenReferenceNeckRigHeadsV1 = Object.freeze({
    neck01: boneHeadDisplayM({ rig, basis, boneName: 'neck01' }),
    neck02: boneHeadDisplayM({ rig, basis, boneName: 'neck02' }),
    head: boneHeadDisplayM({ rig, basis, boneName: 'head' }),
  });
  return Object.freeze({
    basis,
    positionsM: torso.uniformPositionsM,
    rigHeads,
    chestStation: Object.freeze({
      originM: chest.chestStationOriginM,
      normal: Object.freeze([0, 1, 0] as const),
    }),
    shoulderVertices: shoulder.shoulderVertices,
  });
}

const fixtures = Object.fromEntries(KINDS.map((kind) => [kind, realFixture(kind)])) as Record<
  MakeHumanOpenReferenceBasisKindV1,
  ReturnType<typeof realFixture>
>;

function admission(kind: MakeHumanOpenReferenceBasisKindV1) {
  const current = fixtures[kind];
  return inspectMeasurementOpenReferenceNeckAdmissionV1({
    sourcePositionsM: current.positionsM,
    triangleIndices: current.basis.indices,
    rigHeads: current.rigHeads,
  });
}

function solve(kind: MakeHumanOpenReferenceBasisKindV1, factor: number) {
  const current = fixtures[kind];
  const inspected = admission(kind);
  const baselineMm = inspected.admission.baseCircumferenceMm;
  if (baselineMm == null) throw new Error(`${kind} mid-neck perimeter was not measured.`);
  return solveMeasurementOpenReferenceNeckProxyV1({
    sourcePositionsM: current.positionsM,
    triangleIndices: current.basis.indices,
    pose: 'A',
    targetCircumferenceMm: baselineMm * factor,
    rigHeads: current.rigHeads,
    chestStation: current.chestStation,
    shoulderVertices: current.shoulderVertices,
  });
}

describe('measurement open-reference neck proxy v1', () => {
  it('probes admission, U3, U4, and base perimeter on every real basis', () => {
    const probes = KINDS.map((kind) => Object.freeze({ kind, inspected: admission(kind) }));
    const rows = probes.map(({ kind, inspected }) => ({
      basis: kind,
      admission: inspected.ok ? 'admitted' : `notApplied:${inspected.diagnostic.code}`,
      diagnostic: inspected.ok ? null : inspected.diagnostic.message,
      neckLengthMm: inspected.station?.neckLengthM ? inspected.station.neckLengthM * 1000 : null,
      axialRadiusMm: inspected.station?.axialRadiusM ? inspected.station.axialRadiusM * 1000 : null,
      basePerimeterMm: inspected.admission.baseCircumferenceMm,
      jawClearanceMm: inspected.admission.jawClearanceMm,
      loopCount: inspected.admission.closedLoopCount,
    }));
    console.info(`NECK_PROXY_U3_U4_V1=${JSON.stringify(rows)}`);
    probes.forEach(({ kind, inspected }) => {
      const expected = EXPECTED_PROBE[kind];
      expect(inspected.station?.name).toBe('rigMidNeckStation');
      expect(inspected.admission.closedLoopCount).toBe(1);
      expect(inspected.admission.aboveHeadPlaneLoopVertexCount).toBe(0);
      expect(inspected.admission.jawClearanceMm).toBeCloseTo(expected.jawClearanceMm, 5);
      expect(inspected.admission.baseCircumferenceMm).toBeCloseTo(expected.basePerimeterMm, 5);
      expect((inspected.station?.neckLengthM ?? 0) * 1000).toBeCloseTo(expected.neckLengthMm, 5);
      expect((inspected.station?.axialRadiusM ?? 0) * 1000).toBeCloseTo(expected.axialRadiusMm, 5);
      expect(inspected.ok).toBe(expected.admitted);
      if (inspected.ok) {
        expect(inspected.admission.status).toBe('admitted');
        expect(inspected.station.axialRadiusM).toBeGreaterThanOrEqual(0.012);
      } else if (kind === 'male') {
        expect(inspected.admission.status).toBe('rejected');
        expect(inspected.station!.axialRadiusM).toBeLessThan(0.012);
        expect(inspected.diagnostic.code).toBe('station-too-close');
      }
      const station = inspected.station!;
      const heads = fixtures[kind].rigHeads;
      const axis = [
        heads.head[0] - heads.neck01[0],
        heads.head[1] - heads.neck01[1],
        heads.head[2] - heads.neck01[2],
      ] as const;
      const axisLength = Math.hypot(...axis);
      expect(station.originM).toEqual(heads.neck02);
      station.normal.forEach((value, index) =>
        expect(value).toBeCloseTo(axis[index] / axisLength, 12),
      );
      expect(station.axialRadiusM).toBeCloseTo(
        Math.min(0.03, 0.45 * Math.min(station.neck01DistanceM, station.headDistanceM)),
        10,
      );
    });
  });

  it.each(ADMITTED_KINDS)(
    '%s represents +5% and -5% with protected-neighbour closure',
    (kind) => {
      for (const factor of [0.95, 1.05]) {
        const current = fixtures[kind];
        const sourceSnapshot = current.positionsM.slice();
        const result = solve(kind, factor);

        expect(result.status).toBe('represented');
        expect(current.positionsM).toEqual(sourceSnapshot);
        expect(result.absoluteResidualMm).toBeLessThanOrEqual(0.5);
        expect(result.radialScale).toBeCloseTo(factor, 6);
        expect(result.qualityGate).toMatchObject({
          safe: true,
          claims: { selfIntersectionEvaluated: true },
        });
        expect(result.protectedNeighbours.neck01Section).toMatchObject({ status: 'measured' });
        expect(result.protectedNeighbours.neck01Section.driftMm).toBeLessThanOrEqual(0.5);
        expect(result.protectedNeighbours.headPlaneVertices).toMatchObject({
          status: 'measured',
          maximumDisplacementM: 0,
          exactZeroDisplacement: true,
        });
        expect(result.protectedNeighbours.shoulderChord).toMatchObject({ status: 'measured' });
        expect(result.protectedNeighbours.shoulderChord.driftMm).toBeLessThanOrEqual(0.5);
        expect(result.protectedNeighbours.chestStationPerimeter).toMatchObject({
          status: 'measured',
        });
        expect(result.protectedNeighbours.chestStationPerimeter.driftMm).toBeLessThanOrEqual(0.5);
        expect(result.claims).toMatchObject({
          circumferenceRangeCalibrated: false,
          deformationSafetyBoundOnly: true,
          fitClaimEligible: false,
          anatomicalLandmarkEquivalent: false,
        });
      }
    },
    60_000,
  );

  it.each(ADMITTED_KINDS)(
    '%s limits +25% at the 1.10 deformation-safety bound',
    (kind) => {
      const result = solve(kind, 1.25);

      expect(result.status).toBe('limited');
      expect(result.radialScale).toBeCloseTo(1.1, 8);
      expect(result.absoluteResidualMm).toBeLessThanOrEqual(0.5);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'target-limited' }),
      );
      expect(result.protectedNeighbours.neck01Section.driftMm).toBeLessThanOrEqual(0.5);
      expect(result.protectedNeighbours.headPlaneVertices.exactZeroDisplacement).toBe(true);
      expect(result.protectedNeighbours.shoulderChord.driftMm).toBeLessThanOrEqual(0.5);
      expect(result.protectedNeighbours.chestStationPerimeter.driftMm).toBeLessThanOrEqual(0.5);
    },
    60_000,
  );

  it.each([0.95, 1.05, 1.25])(
    'male returns notApplied for a %s request because r is below 12 mm',
    (factor) => {
      const current = fixtures.male;
      const result = solve('male', factor);

      expect(result.status).toBe('notApplied');
      expect(result.positionsM).toBe(current.positionsM);
      expect(result.station?.axialRadiusM).toBeCloseTo(EXPECTED_PROBE.male.axialRadiusMm / 1000, 8);
      expect(result.admission).toMatchObject({
        status: 'rejected',
        closedLoopCount: 1,
        aboveHeadPlaneLoopVertexCount: 0,
      });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'station-too-close' }),
      );
    },
  );

  it('returns the same array instance when neck is unrequested', () => {
    const current = fixtures.female;
    const result = solveMeasurementOpenReferenceNeckProxyV1({
      sourcePositionsM: current.positionsM,
      triangleIndices: current.basis.indices,
      pose: 'A',
      rigHeads: current.rigHeads,
    });

    expect(result.status).toBe('unrequested');
    expect(result.positionsM).toBe(current.positionsM);
    expect(result.diagnostics).toEqual([]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1])(
    'rejects invalid neck input %s without deformation',
    (targetCircumferenceMm) => {
      const current = fixtures.female;
      const result = solveMeasurementOpenReferenceNeckProxyV1({
        sourcePositionsM: current.positionsM,
        triangleIndices: current.basis.indices,
        pose: 'A',
        targetCircumferenceMm,
        rigHeads: current.rigHeads,
      });

      expect(result.status).toBe('notApplied');
      expect(result.positionsM).toBe(current.positionsM);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code: 'target-invalid' }),
      );
    },
  );

  it('fails closed outside A pose and rolls back a failed protected-neighbour check', () => {
    const current = fixtures.female;
    const inspected = admission('female');
    if (!inspected.ok) throw new Error('Female neck admission is required for rollback coverage.');
    const targetCircumferenceMm = inspected.admission.baseCircumferenceMm! * 1.05;
    const nonA = solveMeasurementOpenReferenceNeckProxyV1({
      sourcePositionsM: current.positionsM,
      triangleIndices: current.basis.indices,
      pose: 'T',
      targetCircumferenceMm,
      rigHeads: current.rigHeads,
    });
    const failedNeighbour = solveMeasurementOpenReferenceNeckProxyV1({
      sourcePositionsM: current.positionsM,
      triangleIndices: current.basis.indices,
      pose: 'A',
      targetCircumferenceMm,
      rigHeads: current.rigHeads,
      shoulderVertices: { negative: -1, positive: current.positionsM.length },
    });

    expect(nonA.status).toBe('notApplied');
    expect(nonA.positionsM).toBe(current.positionsM);
    expect(failedNeighbour.status).toBe('notApplied');
    expect(failedNeighbour.positionsM).toBe(current.positionsM);
    expect(failedNeighbour.protectedNeighbours.shoulderChord.status).toBe('failed');
    expect(failedNeighbour.protectedNeighbours.chestStationPerimeter.status).toBe('notMeasured');
    expect(failedNeighbour.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'protected-neighbour-failed' }),
    );
  }, 60_000);
});
