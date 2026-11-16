import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { createMakeHumanUniformWaistHipModesV1 } from './makehuman-uniform-waist-hip-modes-v1';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import {
  resolveMeasurementOpenReferenceHighHipStationV1,
  solveMeasurementOpenReferenceHighHipProxyV1,
} from './measurement-open-reference-high-hip-proxy-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

const RING_STEP_M = 0.02;
const RING_COUNT = 31; // y = 0 .. 0.6

function ringRadius(y: number): readonly [number, number] {
  // Smooth hip (y=0.2) -> waist (y=0.4) -> chest profile; not anatomical, just a closed tube.
  const x = 0.16 + 0.02 * Math.cos(((y - 0.2) / 0.4) * Math.PI * 2);
  const z = 0.11 + 0.015 * Math.cos(((y - 0.2) / 0.4) * Math.PI * 2);
  return [x, z];
}

function torsoMesh(segments = 48) {
  const positions: number[] = [];
  for (let ring = 0; ring < RING_COUNT; ring += 1) {
    const y = ring * RING_STEP_M;
    const [rx, rz] = ringRadius(y);
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * rx, y, Math.sin(angle) * rz);
    }
  }
  const indices: number[] = [];
  for (let ring = 0; ring < RING_COUNT - 1; ring += 1) {
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
  positions.push(0, 0, 0);
  const topCenter = positions.length / 3;
  positions.push(0, (RING_COUNT - 1) * RING_STEP_M, 0);
  const top = (RING_COUNT - 1) * segments;
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(bottomCenter, next, segment);
    indices.push(topCenter, top + segment, top + next);
  }
  return Object.freeze({
    positionsM: Float32Array.from(positions),
    triangleIndices: Uint32Array.from(indices),
    shoulderVertices: Object.freeze({ positive: top, negative: top + segments / 2 }),
  });
}

function perimeterMm(
  positionsM: Float32Array,
  triangleIndices: Uint32Array | Uint16Array,
  originM: readonly [number, number, number],
): number {
  const measured = measureMeshPlaneSectionPerimetersV1({
    positionsM,
    triangleIndices,
    planeOriginM: originM,
    planeNormal: [0, 1, 0],
    selection: { kind: 'nearest-seed', seedM: originM },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!measured.ok || !measured.selectedLoop) throw new Error('section failed');
  return measured.selectedLoop.perimeterM * 1000;
}

const WAIST = Object.freeze([0, 0.4, 0] as const);
const HIP = Object.freeze([0, 0.2, 0] as const);
const HIGH_HIP = Object.freeze([0, 0.3, 0] as const);
const UNDER_BUST = Object.freeze([0, 0.5, 0] as const);

describe('measurement open-reference high-hip proxy v1', () => {
  it('U1 probe: waist/hip station gap per admitted base leaves room for the protocol station', () => {
    const bundle = parseMakeHumanTorsoShapeDeltaBundleV1(
      readFileSync(
        resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin'),
      ),
    );
    const rows: string[] = [];
    for (const kind of ['female', 'male', 'neutral'] as const) {
      const basis = parseMakeHumanOpenReferenceBasisV1(
        readFileSync(
          resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
        ),
        kind,
      );
      for (const heightMm of [1500, 1720, 1900]) {
        const modes = createMakeHumanUniformWaistHipModesV1({ basis, heightMm, bundle });
        const waist = modes.modes.find(
          (mode) => mode.measurementKey === 'waistCircumferenceMm',
        )!.stationOriginM;
        const hip = modes.modes.find(
          (mode) => mode.measurementKey === 'hipCircumferenceMm',
        )!.stationOriginM;
        const gapMm = (waist[1] - hip[1]) * 1000;
        const resolved = resolveMeasurementOpenReferenceHighHipStationV1({
          waistStationOriginM: waist,
          hipStationOriginM: hip,
        });
        rows.push(
          `${kind} ${heightMm}: waistY=${waist[1].toFixed(4)} hipY=${hip[1].toFixed(4)} gap=${gapMm.toFixed(1)}mm ` +
            (resolved.ok
              ? `highHipY=${resolved.station.originM[1].toFixed(4)} r=${(resolved.station.verticalRadiusM * 1000).toFixed(1)}mm`
              : `notApplied:${resolved.diagnostic.code}`),
        );
        // Measured U1: every admitted base at these heights has the default station in order.
        expect(resolved.ok).toBe(true);
        if (resolved.ok) {
          expect(waist[1]).toBeGreaterThan(resolved.station.originM[1]);
          expect(resolved.station.originM[1]).toBeGreaterThan(hip[1]);
        }
        // An explicit waist-to-high-hip offset at/after the hip station is not applied, never moved.
        const tooLow = resolveMeasurementOpenReferenceHighHipStationV1({
          waistStationOriginM: waist,
          hipStationOriginM: hip,
          waistToHighHipMm: gapMm,
        });
        expect(tooLow).toMatchObject({ ok: false, diagnostic: { code: 'station-order' } });
      }
    }
    console.info(`[U1 high-hip station probe]\n${rows.join('\n')}`);
  }, 60_000);

  it.each([
    ['+5%', 1.05],
    ['-5%', 0.95],
  ] as const)(
    'reaches a %s target within 0.5 mm without moving waist, hip or Y',
    (_label, ratio) => {
      const mesh = torsoMesh();
      const before = mesh.positionsM.slice();
      const baselineMm = perimeterMm(mesh.positionsM, mesh.triangleIndices, HIGH_HIP);
      const waistMm = perimeterMm(mesh.positionsM, mesh.triangleIndices, WAIST);
      const hipMm = perimeterMm(mesh.positionsM, mesh.triangleIndices, HIP);
      const result = solveMeasurementOpenReferenceHighHipProxyV1({
        sourcePositionsM: mesh.positionsM,
        triangleIndices: mesh.triangleIndices,
        targetCircumferenceMm: baselineMm * ratio,
        waistStationOriginM: WAIST,
        hipStationOriginM: HIP,
        protectedStationOriginsM: [UNDER_BUST],
        shoulderVertices: mesh.shoulderVertices,
      });

      expect(result.status).toBe('represented');
      expect(result.diagnostics).toEqual([]);
      expect(result.station?.originM[1]).toBeCloseTo(0.3, 9);
      expect(result.station?.verticalRadiusM).toBeCloseTo(0.045, 9);
      expect(result.qualityGate?.safe).toBe(true);
      expect(mesh.positionsM).toEqual(before);
      const achievedMm = perimeterMm(result.positionsM, mesh.triangleIndices, HIGH_HIP);
      expect(Math.abs(achievedMm - baselineMm * ratio)).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(perimeterMm(result.positionsM, mesh.triangleIndices, WAIST) - waistMm),
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(perimeterMm(result.positionsM, mesh.triangleIndices, HIP) - hipMm),
      ).toBeLessThanOrEqual(0.5);
      expect(result.modeResult?.maximumProtectedPerimeterDriftMm).toBeLessThanOrEqual(0.5);
      expect(result.modeResult?.maximumProtectedDepthDriftMm).toBeLessThanOrEqual(0.5);
      expect(result.modeResult?.shoulderChordDriftMm).toBeLessThanOrEqual(0.5);
      for (let offset = 1; offset < before.length; offset += 3) {
        expect(result.positionsM[offset]).toBe(before[offset]);
      }
      expect(result.claims).toMatchObject({
        circumferenceRangeCalibrated: false,
        deformationSafetyBoundOnly: true,
        fitClaimEligible: false,
        populationRepresentativenessClaimed: false,
      });
    },
  );

  it.each([
    ['+15%', 1.15, 1.1],
    ['-15%', 0.85, 0.9],
  ] as const)('limits a %s request to the deformation-safety bound', (_label, ratio, bound) => {
    const mesh = torsoMesh();
    const baselineMm = perimeterMm(mesh.positionsM, mesh.triangleIndices, HIGH_HIP);
    const result = solveMeasurementOpenReferenceHighHipProxyV1({
      sourcePositionsM: mesh.positionsM,
      triangleIndices: mesh.triangleIndices,
      targetCircumferenceMm: baselineMm * ratio,
      waistStationOriginM: WAIST,
      hipStationOriginM: HIP,
    });

    expect(result.status).toBe('limited');
    expect(result.diagnostics.map(({ code }) => code)).toEqual(['target-limited']);
    expect(result.modeResult?.boundedTargetCircumferenceMm).toBeCloseTo(baselineMm * bound, 6);
    expect(
      Math.abs((result.modeResult?.achievedCircumferenceMm ?? 0) - baselineMm * bound),
    ).toBeLessThanOrEqual(0.5);
    expect(result.modeResult?.sectionScale).toBeGreaterThanOrEqual(0.9);
    expect(result.modeResult?.sectionScale).toBeLessThanOrEqual(1.1);
  });

  it('reports notApplied (station-order) when the waist-hip gap is too small, without moving anything', () => {
    const mesh = torsoMesh();
    for (const hipStationOriginM of [
      [0, 0.32, 0] as const, // the protocol station falls below the hip station
      [0, 0.295, 0] as const, // in order, but r = 0.45 x 5 mm is under the minimum support
    ]) {
      const result = solveMeasurementOpenReferenceHighHipProxyV1({
        sourcePositionsM: mesh.positionsM,
        triangleIndices: mesh.triangleIndices,
        targetCircumferenceMm: 900,
        waistStationOriginM: WAIST,
        hipStationOriginM,
      });
      expect(result.status).toBe('notApplied');
      expect(result.diagnostics.map(({ code }) => code)).toEqual(['station-order']);
      expect(result.positionsM).toEqual(mesh.positionsM);
    }
  });

  it('uses waistToHighHipMm instead of the 100 mm protocol default', () => {
    const resolved = resolveMeasurementOpenReferenceHighHipStationV1({
      waistStationOriginM: WAIST,
      hipStationOriginM: HIP,
      waistToHighHipMm: 80,
    });
    expect(resolved.ok && resolved.station.originM[1]).toBeCloseTo(0.32, 9);
    expect(resolved.ok && resolved.station.waistDropMm).toBe(80);
  });

  it('rolls back only high hip when closure fails and returns the input untouched', () => {
    const mesh = torsoMesh();
    const baselineMm = perimeterMm(mesh.positionsM, mesh.triangleIndices, HIGH_HIP);
    const result = solveMeasurementOpenReferenceHighHipProxyV1({
      sourcePositionsM: mesh.positionsM,
      triangleIndices: mesh.triangleIndices,
      targetCircumferenceMm: baselineMm * 1.05,
      waistStationOriginM: WAIST,
      hipStationOriginM: HIP,
      // A protected (e.g. depth) station inside the band: every candidate moves it.
      protectedStationOriginsM: [[0, 0.31, 0]],
    });
    expect(result.status).toBe('notApplied');
    expect(result.diagnostics.map(({ code }) => code)).toEqual(['closure-unsafe']);
    expect(result.positionsM).toEqual(mesh.positionsM);
    expect(result.positionsM).not.toBe(mesh.positionsM);
  });

  it('does nothing when high hip is not requested', () => {
    const mesh = torsoMesh();
    const result = solveMeasurementOpenReferenceHighHipProxyV1({
      sourcePositionsM: mesh.positionsM,
      triangleIndices: mesh.triangleIndices,
      waistStationOriginM: WAIST,
      hipStationOriginM: HIP,
    });
    expect(result.status).toBe('unrequested');
    expect(result.diagnostics).toEqual([]);
    expect(result.positionsM).toEqual(mesh.positionsM);
  });
});
