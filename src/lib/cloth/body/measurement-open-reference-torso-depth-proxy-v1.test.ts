import { describe, expect, it } from 'vitest';

import {
  solveMeasurementOpenReferenceTorsoDepthProxyV1,
  type MeasurementOpenReferenceTorsoDepthStationV1,
} from './measurement-open-reference-torso-depth-proxy-v1';

function torsoMesh(options: {
  readonly xScale: number;
  readonly zScale: number;
  readonly segments?: number;
}) {
  const segments = options.segments ?? 32;
  const ys = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6] as const;
  const xByRing = [0.16, 0.19, 0.18, 0.15, 0.17, 0.19, 0.16] as const;
  const zByRing = [0.11, 0.14, 0.13, 0.11, 0.12, 0.14, 0.11] as const;
  const positions: number[] = [];
  ys.forEach((y, ring) => {
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      positions.push(
        Math.cos(angle) * xByRing[ring] * options.xScale,
        y,
        Math.sin(angle) * zByRing[ring] * options.zScale,
      );
    }
  });
  const indices: number[] = [];
  for (let ring = 0; ring < ys.length - 1; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const a = ring * segments + segment;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + segment;
      const d = (ring + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, ys[0], 0);
  const topCenter = positions.length / 3;
  positions.push(0, ys.at(-1)!, 0);
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(bottomCenter, next, segment);
    const top = (ys.length - 1) * segments;
    indices.push(topCenter, top + segment, top + next);
  }
  return Object.freeze({
    positionsM: Float32Array.from(positions),
    triangleIndices: Uint32Array.from(indices),
    shoulderVertices: Object.freeze({
      positive: (ys.length - 1) * segments,
      negative: (ys.length - 1) * segments + segments / 2,
    }),
  });
}

const stations = Object.freeze([
  Object.freeze({ measurementKey: 'chestDepthMm' as const, originM: [0, 0.5, 0] as const }),
  Object.freeze({ measurementKey: 'waistDepthMm' as const, originM: [0, 0.3, 0] as const }),
  Object.freeze({ measurementKey: 'hipDepthMm' as const, originM: [0, 0.1, 0] as const }),
] satisfies readonly MeasurementOpenReferenceTorsoDepthStationV1[]);

describe('measurement open-reference torso-depth proxy v1', () => {
  it.each([
    ['female', 1, 1],
    ['male', 1.08, 0.94],
    ['neutral', 0.95, 1.04],
  ] as const)(
    '%s preserves circumference while three independent depth controls move by five percent',
    (_kind, xScale, zScale) => {
      const mesh = torsoMesh({ xScale, zScale });
      const before = mesh.positionsM.slice();
      const chestBaselineMm = 280 * zScale;
      const waistBaselineMm = 220 * zScale;
      const hipBaselineMm = 280 * zScale;
      const result = solveMeasurementOpenReferenceTorsoDepthProxyV1({
        sourcePositionsM: mesh.positionsM,
        triangleIndices: mesh.triangleIndices,
        measurements: {
          chestDepthMm: chestBaselineMm * 1.05,
          waistDepthMm: waistBaselineMm * 0.95,
          hipDepthMm: hipBaselineMm * 1.05,
        },
        stations,
        protectedStationOriginsM: [[0, 0.4, 0]],
        shoulderVertices: mesh.shoulderVertices,
      });

      expect(result.representedMeasurements).toEqual([
        'chestDepthMm',
        'waistDepthMm',
        'hipDepthMm',
      ]);
      expect(result.limitedMeasurements).toEqual([]);
      expect(result.qualityGate.safe).toBe(true);
      expect(result.positionsM).not.toEqual(before);
      expect(mesh.positionsM).toEqual(before);
      result.modeResults.forEach((mode) => {
        expect(Math.abs(mode.achievedDepthMm - mode.boundedTargetDepthMm)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(mode.achievedPerimeterMm - mode.baselinePerimeterMm)).toBeLessThanOrEqual(
          0.5,
        );
        expect(mode.maximumSiblingDepthDriftMm).toBeLessThanOrEqual(0.5);
        expect(mode.maximumSiblingPerimeterDriftMm).toBeLessThanOrEqual(0.5);
        expect(mode.maximumProtectedPerimeterDriftMm).toBeLessThanOrEqual(0.5);
        expect(mode.shoulderChordDriftMm).toBeLessThanOrEqual(0.5);
        expect(mode.depthCoefficient).toBeGreaterThanOrEqual(0.9);
        expect(mode.depthCoefficient).toBeLessThanOrEqual(1.1);
        expect(mode.widthCoefficient).toBeGreaterThanOrEqual(0.9);
        expect(mode.widthCoefficient).toBeLessThanOrEqual(1.1);
      });
      for (let offset = 1; offset < before.length; offset += 3) {
        expect(result.positionsM[offset]).toBe(before[offset]);
      }
      expect(result.claims).toMatchObject({
        symmetricSectionProxyOnly: true,
        frontBackDistributionCalibrated: false,
        populationRepresentativenessClaimed: false,
        fitClaimEligible: false,
      });
    },
  );

  it('limits a hostile request to the conservative ten-percent visual envelope', () => {
    const mesh = torsoMesh({ xScale: 1, zScale: 1 });
    const result = solveMeasurementOpenReferenceTorsoDepthProxyV1({
      sourcePositionsM: mesh.positionsM,
      triangleIndices: mesh.triangleIndices,
      measurements: { chestDepthMm: 500 },
      stations,
      protectedStationOriginsM: [[0, 0.4, 0]],
      shoulderVertices: mesh.shoulderVertices,
    });

    expect(result.representedMeasurements).toEqual([]);
    expect(result.limitedMeasurements).toEqual(['chestDepthMm']);
    expect(result.modeResults[0].boundedTargetDepthMm).toBeCloseTo(308, 3);
    expect(result.modeResults[0].achievedDepthMm).toBeCloseTo(308, 0);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ measurementKey: 'chestDepthMm', code: 'target-limited' }),
      ]),
    );
  });

  it('fails closed without mutating the source when a requested station is unavailable', () => {
    const mesh = torsoMesh({ xScale: 1, zScale: 1 });
    const before = mesh.positionsM.slice();
    const result = solveMeasurementOpenReferenceTorsoDepthProxyV1({
      sourcePositionsM: mesh.positionsM,
      triangleIndices: mesh.triangleIndices,
      measurements: { chestDepthMm: 294 },
      stations: stations.filter(({ measurementKey }) => measurementKey !== 'chestDepthMm'),
    });

    expect(result.representedMeasurements).toEqual([]);
    expect(result.limitedMeasurements).toEqual([]);
    expect(result.positionsM).toEqual(before);
    expect(mesh.positionsM).toEqual(before);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ measurementKey: 'chestDepthMm', code: 'input-invalid' }),
    ]);
  });
});
