import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisKindV1,
} from './measurement-open-reference-display-v1';
import { computeMeshSurfaceGeodesicV1 } from './mesh-surface-geodesic-v1';
import type { MeshSurfaceGeodesicResultV1 } from './mesh-surface-geodesic-v1';
import {
  evaluateMeshSurfacePathIntoV1,
  evaluateMeshSurfacePathV1,
  meshSurfaceEdgePointV1,
  meshSurfaceVertexPointV1,
  mirrorMeshSurfacePathV1,
  validateMeshSurfacePathV1,
  type MeshSurfacePathV1,
} from './mesh-surface-path-v1';
import {
  createMeshSurfaceTopologyV1,
  type MeshSurfaceTopologyV1,
} from './mesh-surface-topology-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

const KINDS = Object.freeze([
  'female',
  'neutral',
  'male',
  'base',
] as const satisfies readonly MakeHumanOpenReferenceBasisKindV1[]);

const SSN_VERTEX: Readonly<Record<MakeHumanOpenReferenceBasisKindV1, number>> = Object.freeze({
  female: 815,
  neutral: 815,
  male: 815,
  base: 809,
});

const MID_NECK_FRACTION: Readonly<Record<MakeHumanOpenReferenceBasisKindV1, number>> =
  Object.freeze({
    female: 0.87,
    neutral: 0.862,
    male: 0.862,
    base: 0.855,
  });

function fixture(kind: MakeHumanOpenReferenceBasisKindV1) {
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readFileSync(
      resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    ),
    kind,
  );
  const positionsM = Float32Array.from(
    basis.positionsSourceUnits,
    (value) => value * basis.sourceUnitScaleToM,
  );
  const built = createMeshSurfaceTopologyV1({ positionsM, triangleIndices: basis.indices });
  if (!built.ok)
    throw new Error(`${kind} topology failed: ${built.code}: ${built.errors.join('; ')}`);
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let offset = 1; offset < positionsM.length; offset += 3) {
    minimumY = Math.min(minimumY, positionsM[offset]);
    maximumY = Math.max(maximumY, positionsM[offset]);
  }
  const heightM = maximumY - minimumY;
  return { basis, positionsM, topology: built.topology, minimumY, heightM };
}

function neckSegment(
  current: ReturnType<typeof fixture>,
  start: number,
  end: number,
  reference = false,
) {
  return computeMeshSurfaceGeodesicV1({
    topology: current.topology,
    positionsM: current.positionsM,
    triangleIndices: current.basis.indices,
    start: meshSurfaceVertexPointV1(start),
    end: meshSurfaceVertexPointV1(end),
    region: {
      minimumM: [-0.16, current.minimumY + current.heightM * 0.78, Number.NEGATIVE_INFINITY],
      maximumM: [0.16, current.minimumY + current.heightM * 0.92, Number.POSITIVE_INFINITY],
    },
    policy: reference
      ? {
          corridorRings: 6,
          steinerPointsPerEdge: 8,
          retryCorridorRings: 6,
          retrySteinerPointsPerEdge: 8,
        }
      : undefined,
  });
}

function pointToSegmentDistanceSquared(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const denominator = abx * abx + aby * aby + abz * abz;
  const t =
    denominator === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / denominator),
        );
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  const dz = pz - (az + abz * t);
  return dx * dx + dy * dy + dz * dz;
}

function directedHausdorff(left: Float32Array, right: Float32Array): number {
  let maximum = 0;
  for (let offset = 0; offset < left.length; offset += 3) {
    let minimum = Number.POSITIVE_INFINITY;
    for (let segment = 0; segment < right.length / 3 - 1; segment += 1) {
      const target = segment * 3;
      minimum = Math.min(
        minimum,
        pointToSegmentDistanceSquared(
          left[offset],
          left[offset + 1],
          left[offset + 2],
          right[target],
          right[target + 1],
          right[target + 2],
          right[target + 3],
          right[target + 4],
          right[target + 5],
        ),
      );
    }
    maximum = Math.max(maximum, Math.sqrt(minimum));
  }
  return maximum;
}

function hausdorff(left: Float32Array, right: Float32Array): number {
  return Math.max(directedHausdorff(left, right), directedHausdorff(right, left));
}

function evaluated(
  path: MeshSurfacePathV1,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
) {
  return evaluateMeshSurfacePathV1({ path, topology, positionsM });
}

function measuredLength(result: MeshSurfaceGeodesicResultV1): number {
  const lengthM = result.ok ? result.geodesicLengthM : result.stats.rejectedCandidateLengthM;
  if (lengthM === null)
    throw new Error(`No measured candidate for ${result.ok ? 'success' : result.code}.`);
  return lengthM;
}

function assertAcceptedInvariants(
  result: MeshSurfaceGeodesicResultV1,
  topology: MeshSurfaceTopologyV1,
): void {
  if (!result.ok) {
    expect(['geodesic-not-converged', 'self-intersection']).toContain(result.code);
    expect(result.stats.rejectedCandidateLengthM).not.toBeNull();
    return;
  }
  expect(validateMeshSurfacePathV1(result.path, topology).ok).toBe(true);
  expect(result.chordLengthM).toBeLessThanOrEqual(result.geodesicLengthM + 1e-12);
  expect(result.geodesicLengthM).toBeLessThanOrEqual(result.edgeDijkstraLengthM + 1e-12);
  expect(result.tautLengthM).toBe(result.geodesicLengthM);
}

describe('mesh surface geodesic v1', () => {
  it.each(KINDS)(
    '%s neck half is on-surface, bounded, symmetric, converged and within the loop budget',
    (kind) => {
      const current = fixture(kind);
      const hps = 8189;
      const c7ToHps = neckSegment(current, 857, hps);
      const hpsToSsn = neckSegment(current, hps, SSN_VERTEX[kind]);
      assertAcceptedInvariants(c7ToHps, current.topology);
      assertAcceptedInvariants(hpsToSsn, current.topology);
      const c7Reference = neckSegment(current, 857, hps, true);
      const ssnReference = neckSegment(current, hps, SSN_VERTEX[kind], true);
      assertAcceptedInvariants(c7Reference, current.topology);
      assertAcceptedInvariants(ssnReference, current.topology);
      expect(Math.abs(measuredLength(c7ToHps) - measuredLength(c7Reference))).toBeLessThanOrEqual(
        0.0005,
      );
      expect(Math.abs(measuredLength(hpsToSsn) - measuredLength(ssnReference))).toBeLessThanOrEqual(
        0.0005,
      );
      for (const result of [c7ToHps, hpsToSsn]) {
        if (!result.ok) continue;
        const mirrored = mirrorMeshSurfacePathV1(result.path, current.topology);
        const left = evaluated(result.path, current.topology, current.positionsM);
        const right = evaluated(mirrored, current.topology, current.positionsM);
        expect(Math.abs(left.lengthM - right.lengthM)).toBeLessThanOrEqual(0.0005);
        expect(
          hausdorff(
            left.positionsM,
            right.positionsM.map((value, index) => (index % 3 === 0 ? -value : value)),
          ),
        ).toBeLessThanOrEqual(0.001);
      }
      const leftLength = measuredLength(c7ToHps) + measuredLength(hpsToSsn);
      const loopLengthM = leftLength * 2;
      const midNeckY = current.minimumY + current.heightM * MID_NECK_FRACTION[kind];
      const section = measureMeshPlaneSectionPerimetersV1({
        positionsM: current.positionsM,
        triangleIndices: current.basis.indices,
        planeOriginM: [0, midNeckY, 0],
        planeNormal: [0, 1, 0],
        selection: { kind: 'nearest-seed', seedM: [0, midNeckY, 0] },
      });
      expect(section.ok).toBe(true);
      if (section.ok && section.selectedLoop) {
        expect(loopLengthM).toBeGreaterThan(section.selectedLoop.perimeterM);
      }
      const firstLoopMs = c7ToHps.stats.buildMs + hpsToSsn.stats.buildMs;
      // Design §5.3: active guide build ≤ 12 ms p95. The first call above also pays for JIT
      // warm-up, so it is reported, and the budget is asserted on the p95 of repeated builds.
      const loopSamples: number[] = [];
      for (let run = 0; run < 20; run += 1) {
        loopSamples.push(
          neckSegment(current, 857, hps).stats.buildMs +
            neckSegment(current, hps, SSN_VERTEX[kind]).stats.buildMs,
        );
      }
      loopSamples.sort((left, right) => left - right);
      const p95LoopMs = loopSamples[Math.ceil(loopSamples.length * 0.95) - 1];
      console.info(
        `geodesic-neck ${kind}: loop=${(loopLengthM * 1000).toFixed(3)}mm reference=${(
          (measuredLength(c7Reference) + measuredLength(ssnReference)) *
          2000
        ).toFixed(3)}mm first=${firstLoopMs.toFixed(3)}ms p50=${loopSamples[10].toFixed(
          3,
        )}ms p95=${p95LoopMs.toFixed(3)}ms`,
      );
      expect(p95LoopMs).toBeLessThanOrEqual(12);
    },
    30_000,
  );

  it.each(KINDS)('%s stays stable under a small symmetric morph', (kind) => {
    const current = fixture(kind);
    const candidates = [
      { start: 857, end: 8189, result: neckSegment(current, 857, 8189) },
      {
        start: 8189,
        end: SSN_VERTEX[kind],
        result: neckSegment(current, 8189, SSN_VERTEX[kind]),
      },
    ];
    const admitted = candidates.find(({ result }) => result.ok);
    expect(admitted, `${kind} has one converged neck segment`).toBeDefined();
    if (!admitted || !admitted.result.ok) return;
    const morphedPositions = current.positionsM.slice();
    for (let offset = 0; offset < morphedPositions.length; offset += 3) {
      morphedPositions[offset] *= 1.005;
      morphedPositions[offset + 2] *= 0.995;
    }
    const morphed = computeMeshSurfaceGeodesicV1({
      topology: current.topology,
      positionsM: morphedPositions,
      triangleIndices: current.basis.indices,
      start: meshSurfaceVertexPointV1(admitted.start),
      end: meshSurfaceVertexPointV1(admitted.end),
      region: {
        minimumM: [-0.16, current.minimumY + current.heightM * 0.78, Number.NEGATIVE_INFINITY],
        maximumM: [0.16, current.minimumY + current.heightM * 0.92, Number.POSITIVE_INFINITY],
      },
    });
    expect(morphed.ok).toBe(true);
    if (!morphed.ok) return;
    const carried = evaluated(admitted.result.path, current.topology, morphedPositions).positionsM;
    const rebuilt = evaluated(morphed.path, current.topology, morphedPositions).positionsM;
    expect(hausdorff(carried, rebuilt)).toBeLessThanOrEqual(0.003);
  });

  it.each(KINDS)('%s neck half evaluates per frame within the live-frame budget', (kind) => {
    const current = fixture(kind);
    const segments = [
      neckSegment(current, 857, 8189),
      neckSegment(current, 8189, SSN_VERTEX[kind]),
    ].flatMap((result) => (result.ok ? [result.path] : []));
    expect(segments).toHaveLength(2);
    const buffers = segments.map((path) => new Float32Array(path.points.length * 3));
    const samples: number[] = [];
    for (let frame = 0; frame < 400; frame += 1) {
      const startedAt = performance.now();
      segments.forEach((path, index) =>
        evaluateMeshSurfacePathIntoV1(path, current.positionsM, buffers[index]),
      );
      samples.push(performance.now() - startedAt);
    }
    segments.forEach((path, index) => {
      const reference = evaluated(path, current.topology, current.positionsM);
      expect(evaluateMeshSurfacePathIntoV1(path, current.positionsM, buffers[index])).toBeCloseTo(
        reference.lengthM,
        12,
      );
      expect([...buffers[index]]).toEqual([...reference.positionsM]);
    });
    samples.sort((left, right) => left - right);
    const p95FrameMs = samples[Math.ceil(samples.length * 0.95) - 1];
    console.info(`geodesic-frame ${kind}: p95=${p95FrameMs.toFixed(4)}ms`);
    // Design §5.3: live frame ≤ 0.2 ms.
    expect(p95FrameMs).toBeLessThanOrEqual(0.2);
  });

  it('returns topology-mismatch instead of a fallback chord', () => {
    const current = fixture('neutral');
    const changed = current.basis.indices.slice();
    [changed[0], changed[1]] = [changed[1], changed[0]];
    const result = computeMeshSurfaceGeodesicV1({
      topology: current.topology,
      positionsM: current.positionsM,
      triangleIndices: changed,
      start: meshSurfaceVertexPointV1(857),
      end: meshSurfaceVertexPointV1(8189),
    });
    expect(result).toMatchObject({ ok: false, code: 'topology-mismatch' });
  });

  it('matches the independent planar reference across 0.23 mm sliver strips', () => {
    const rows = 21;
    const positions: number[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (const x of [-0.02, 0, 0.02]) positions.push(x, row * 0.00023, 0);
    }
    const indices: number[] = [];
    for (let row = 0; row < rows - 1; row += 1) {
      const left = row * 3;
      const center = left + 1;
      const right = left + 2;
      const nextLeft = left + 3;
      const nextCenter = center + 3;
      const nextRight = right + 3;
      indices.push(
        left,
        center,
        nextLeft,
        center,
        nextCenter,
        nextLeft,
        right,
        nextRight,
        center,
        center,
        nextRight,
        nextCenter,
      );
    }
    const positionsM = Float32Array.from(positions);
    const triangleIndices = Uint16Array.from(indices);
    const built = createMeshSurfaceTopologyV1({ positionsM, triangleIndices });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    let convergedCount = 0;
    for (let sample = 1; sample <= 12; sample += 1) {
      const startT = sample / 13;
      const endT = ((sample * 7) % 13) / 13;
      const start = meshSurfaceEdgePointV1(0, 1, startT);
      const end = meshSurfaceEdgePointV1((rows - 1) * 3 + 1, (rows - 1) * 3 + 2, endT);
      const result = computeMeshSurfaceGeodesicV1({
        topology: built.topology,
        positionsM,
        triangleIndices,
        start,
        end,
        policy: {
          corridorRings: 3,
          steinerPointsPerEdge: 4,
          retryCorridorRings: 6,
          retrySteinerPointsPerEdge: 8,
        },
      });
      const deltaX = endT * 0.02 - (-0.02 + startT * 0.02);
      const independentReferenceM = Math.hypot(deltaX, (rows - 1) * 0.00023);
      expect(Math.abs(measuredLength(result) - independentReferenceM)).toBeLessThanOrEqual(0.0005);
      if (result.ok) convergedCount += 1;
      else expect(result.code).toBe('geodesic-not-converged');
    }
    expect(convergedCount).toBeGreaterThan(0);
  });

  it('runs the outside-body taut pass without violating length bounds', () => {
    const current = fixture('base');
    const result = computeMeshSurfaceGeodesicV1({
      topology: current.topology,
      positionsM: current.positionsM,
      triangleIndices: current.basis.indices,
      start: meshSurfaceVertexPointV1(857),
      end: meshSurfaceVertexPointV1(8189),
      region: {
        minimumM: [-0.16, current.minimumY + current.heightM * 0.78, Number.NEGATIVE_INFINITY],
        maximumM: [0.16, current.minimumY + current.heightM * 0.92, Number.POSITIVE_INFINITY],
      },
      taut: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chordLengthM).toBeLessThanOrEqual(result.tautLengthM + 1e-12);
    expect(result.tautLengthM).toBeLessThanOrEqual(result.geodesicLengthM + 1e-12);
    expect(
      result.segments.every((segment) => segment.kind === 'surface' || segment.kind === 'air'),
    ).toBe(true);
  });
});
