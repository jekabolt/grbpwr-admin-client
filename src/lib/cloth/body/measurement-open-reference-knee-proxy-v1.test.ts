import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import { parseMakeHumanLimbCircumferenceDeltaBundleV1 } from './makehuman-limb-circumference-delta-bundle-v1';
import { createMakeHumanLimbCircumferenceUniformModesV1 } from './makehuman-limb-circumference-uniform-modes-v1';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisKindV1,
} from './measurement-open-reference-display-v1';
import {
  deriveMeasurementOpenReferenceKneeProxyStationsV1,
  solveMeasurementOpenReferenceKneeProxyV1,
  type MeasurementOpenReferenceKneeProxyStationV1,
} from './measurement-open-reference-knee-proxy-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

const HEIGHT_MM = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements.heightMm;
const KINDS = Object.freeze([
  'female',
  'male',
  'neutral',
] as const satisfies readonly MakeHumanOpenReferenceBasisKindV1[]);
const rig = parseMakeHumanCoreRigBundleV1(
  readFileSync(resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-core-rig-v1.bin')),
);
const limbBundle = parseMakeHumanLimbCircumferenceDeltaBundleV1(
  readFileSync(
    resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-limb-circumference-deltas-v1.bin'),
  ),
);

function realFixture(kind: MakeHumanOpenReferenceBasisKindV1) {
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readFileSync(
      resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    ),
    kind,
  );
  const limb = createMakeHumanLimbCircumferenceUniformModesV1({
    basis,
    heightMm: HEIGHT_MM,
    bundle: limbBundle,
  });
  const thighMode = limb.modes.find(
    ({ measurementKey }) => measurementKey === 'thighCircumferenceMm',
  );
  const calfMode = limb.modes.find(
    ({ measurementKey }) => measurementKey === 'calfCircumferenceMm',
  );
  if (!thighMode || !calfMode) throw new Error('Protected limb modes are missing.');
  const stations = deriveMeasurementOpenReferenceKneeProxyStationsV1({
    positionsM: limb.positionsM,
    basis,
    heightMm: HEIGHT_MM,
    rig,
    thighMode,
    calfMode,
  });
  return { basis, positionsM: limb.positionsM, stations };
}

function cylinderMesh() {
  const sideCenters = [-0.2, 0.2] as const;
  const ringYs = [-0.25, -0.18, -0.12, -0.07, -0.03, 0.03, 0.07, 0.12, 0.18, 0.25];
  const radialSegments = 32;
  const radius = 0.06;
  const positions: number[] = [];
  const indices: number[] = [];
  sideCenters.forEach((centerX) => {
    const vertexBase = positions.length / 3;
    ringYs.forEach((y) => {
      for (let segment = 0; segment < radialSegments; segment += 1) {
        const angle = (segment / radialSegments) * Math.PI * 2;
        positions.push(centerX + Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      }
    });
    for (let ring = 0; ring < ringYs.length - 1; ring += 1) {
      for (let segment = 0; segment < radialSegments; segment += 1) {
        const next = (segment + 1) % radialSegments;
        const lower = vertexBase + ring * radialSegments + segment;
        const lowerNext = vertexBase + ring * radialSegments + next;
        const upper = vertexBase + (ring + 1) * radialSegments + segment;
        const upperNext = vertexBase + (ring + 1) * radialSegments + next;
        indices.push(lower, upper, upperNext, lower, upperNext, lowerNext);
      }
    }
  });

  const station = (
    side: 'negative' | 'positive',
    centerX: number,
  ): MeasurementOpenReferenceKneeProxyStationV1 =>
    Object.freeze({
      side,
      originM: Object.freeze([centerX, 0, 0] as const),
      normal: Object.freeze([0, -1, 0] as const),
      thigh: Object.freeze({
        originM: Object.freeze([centerX, 0.15, 0] as const),
        normal: Object.freeze([0, -1, 0] as const),
      }),
      calf: Object.freeze({
        originM: Object.freeze([centerX, -0.15, 0] as const),
        normal: Object.freeze([0, -1, 0] as const),
      }),
      thighDistanceM: 0.15,
      calfDistanceM: 0.15,
      axialRadiusM: 0.06,
    });
  return {
    positionsM: Float32Array.from(positions),
    triangleIndices: Uint16Array.from(indices),
    stations: Object.freeze([
      station('negative', sideCenters[0]),
      station('positive', sideCenters[1]),
    ]) as readonly [
      MeasurementOpenReferenceKneeProxyStationV1,
      MeasurementOpenReferenceKneeProxyStationV1,
    ],
  };
}

function baselineMm(current: ReturnType<typeof cylinderMesh>): number {
  const values = current.stations.map((station) => {
    const measured = measureMeshPlaneSectionPerimetersV1({
      positionsM: current.positionsM,
      triangleIndices: current.triangleIndices,
      planeOriginM: station.originM,
      planeNormal: station.normal,
      selection: { kind: 'nearest-seed', seedM: station.originM },
    });
    if (!measured.ok || !measured.selectedLoop) throw new Error('Synthetic knee loop is missing.');
    return measured.selectedLoop.perimeterM * 1000;
  });
  return (values[0] + values[1]) / 2;
}

describe('measurement open-reference knee proxy v1', () => {
  it.each(KINDS)('%s finds both rig-knee loops and probes U2', (kind) => {
    const current = realFixture(kind);
    const perimeters = current.stations.map((station) => {
      const measured = measureMeshPlaneSectionPerimetersV1({
        positionsM: current.positionsM,
        triangleIndices: current.basis.indices,
        planeOriginM: station.originM,
        planeNormal: station.normal,
        selection: { kind: 'nearest-seed', seedM: station.originM },
      });
      expect(measured.ok).toBe(true);
      if (!measured.ok || !measured.selectedLoop) throw new Error('Rig-knee loop is missing.');
      return measured.selectedLoop.perimeterM * 1000;
    });
    const u2 = Object.fromEntries(
      current.stations.map((station) => [
        station.side,
        {
          kneeToCalfAxialMm: station.calfDistanceM * 1000,
          kneeToThighAxialMm: station.thighDistanceM * 1000,
          axialRadiusMm: station.axialRadiusM * 1000,
        },
      ]),
    );

    expect(perimeters.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    expect(current.stations.every(({ axialRadiusM }) => axialRadiusM >= 0.025)).toBe(true);
    console.info(`KNEE_PROXY_U2_V1=${JSON.stringify({ basis: kind, heightMm: HEIGHT_MM, u2 })}`);
  });

  it.each([0.95, 1.05])('reaches a %s target bilaterally within proxy closure', (factor) => {
    const current = cylinderMesh();
    const sourceSnapshot = current.positionsM.slice();
    const baseline = baselineMm(current);
    const result = solveMeasurementOpenReferenceKneeProxyV1({
      ...current,
      pose: 'A',
      targetMm: baseline * factor,
    });

    expect(result.status).toBe('represented');
    expect(current.positionsM).toEqual(sourceSnapshot);
    if (result.status === 'notApplied') throw new Error('Synthetic knee solve was not applied.');
    expect(result.absoluteResidualMm).toBeLessThanOrEqual(0.5);
    expect(result.protectedDriftMm.maximum).toBeLessThanOrEqual(0.5);
    const negativeResponse = result.achievedMm.negative - result.baselineMm.negative;
    const positiveResponse = result.achievedMm.positive - result.baselineMm.positive;
    if (factor < 1) {
      expect(negativeResponse).toBeLessThan(0);
      expect(positiveResponse).toBeLessThan(0);
    } else {
      expect(negativeResponse).toBeGreaterThan(0);
      expect(positiveResponse).toBeGreaterThan(0);
    }
    const responses = [
      Math.abs(result.achievedMm.negative - result.baselineMm.negative),
      Math.abs(result.achievedMm.positive - result.baselineMm.positive),
    ];
    expect(Math.max(...responses) / Math.min(...responses)).toBeLessThanOrEqual(1.5);
  });

  it.each([0.85, 1.15])('clamps a %s target at the visual safety bound', (factor) => {
    const current = cylinderMesh();
    const baseline = baselineMm(current);
    const result = solveMeasurementOpenReferenceKneeProxyV1({
      ...current,
      pose: 'A',
      targetMm: baseline * factor,
    });

    expect(result.status).toBe('limited');
    if (result.status === 'notApplied') throw new Error('Synthetic knee endpoint was not applied.');
    expect(result.radialScale).toBeCloseTo(factor < 1 ? 0.9 : 1.1, 8);
    expect(result.absoluteResidualMm).toBeLessThanOrEqual(0.5);
    expect(result.protectedDriftMm.maximum).toBeLessThanOrEqual(0.5);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'target-limited' }));
  });

  it('fails closed outside A pose and when a protected station is too close', () => {
    const current = cylinderMesh();
    const baseline = baselineMm(current);
    const nonA = solveMeasurementOpenReferenceKneeProxyV1({
      ...current,
      pose: 'T',
      targetMm: baseline * 1.05,
    });
    const closeStations = current.stations.map((station) =>
      Object.freeze({ ...station, axialRadiusM: 0.02 }),
    ) as unknown as readonly [
      MeasurementOpenReferenceKneeProxyStationV1,
      MeasurementOpenReferenceKneeProxyStationV1,
    ];
    const tooClose = solveMeasurementOpenReferenceKneeProxyV1({
      ...current,
      stations: closeStations,
      pose: 'A',
      targetMm: baseline * 1.05,
    });

    expect(nonA.status).toBe('notApplied');
    expect(nonA.positionsM).toEqual(current.positionsM);
    expect(nonA.diagnostics).toContainEqual(expect.objectContaining({ code: 'pose-not-admitted' }));
    expect(tooClose.status).toBe('notApplied');
    expect(tooClose.positionsM).toEqual(current.positionsM);
    expect(tooClose.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'station-too-close' }),
    );
  });
});
