import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { createMakeHumanUniformWaistHipModesV1 } from './makehuman-uniform-waist-hip-modes-v1';
import { parseMakeHumanWaistHipRigAnchorDeltaBundleV1 } from './makehuman-waist-hip-rig-anchor-research-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import { evaluateMeasurementOpenReferenceDisplayQualityV1 } from './measurement-open-reference-display-quality-gate-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import { createMeasurementOpenReferenceDisplayPoseRuntimeV1 } from './measurement-open-reference-display-pose-runtime-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import {
  applyFemaleHipBackShareV1,
  FEMALE_HIP_BACK_OVER_HIP_GIRTH_V1,
} from './measurement-open-reference-female-hip-back-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import { solveOpenReferenceUniformWaistHipV1 } from './measurement-open-reference-uniform-waist-hip-solver-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

type Kind = 'female' | 'male' | 'neutral';
type Vec3 = readonly [number, number, number];

const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);
const basisOf = (kind: Kind) =>
  parseMakeHumanOpenReferenceBasisV1(
    readFileSync(
      resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    ),
    kind,
  );
const poseMetadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
const loadPoseResources = async () =>
  Object.freeze({
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

/** The runtime result and, independently, the plain bounded waist/hip solve it starts from. */
async function bodyOf(kind: Kind, measurements: CanonicalBodyMeasurementsMm) {
  const basis = basisOf(kind);
  const frame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: 'female-hip-back-test',
    pose: 'A',
  });
  const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
  const runtime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
    basis,
    measurements,
    openReference,
    loadBundle: async () => torsoBundle,
  });
  const modes = createMakeHumanUniformWaistHipModesV1({
    basis,
    heightMm: measurements.heightMm,
    bundle: torsoBundle,
  });
  const solved = solveOpenReferenceUniformWaistHipV1({
    uniformPositionsM: modes.uniformPositionsM,
    triangleIndices: basis.indices,
    measurements: {
      waistCircumferenceMm: measurements.waistCircumferenceMm,
      hipCircumferenceMm: measurements.hipCircumferenceMm,
    },
    modes: modes.modes,
  });
  const station = (key: 'waistCircumferenceMm' | 'hipCircumferenceMm') =>
    modes.modes.find(({ measurementKey }) => measurementKey === key)!.stationOriginM;
  return {
    basis,
    runtime,
    solved,
    hipStationM: station('hipCircumferenceMm'),
    waistStationM: station('waistCircumferenceMm'),
  };
}

// Harness-style measurement, written here independently of the module: horizontal section around
// the hip station, tape girth = convex hull perimeter, side-seam z = mean z within 5 mm of each
// lateral extreme, posterior depth = side-seam z minus the backmost z (front is +z, y is up).
function sectionAt(
  positionsM: Float32Array,
  indices: Uint16Array | Uint32Array,
  y: number,
  seed: Vec3,
) {
  const origin: Vec3 = [seed[0], y, seed[2]];
  const section = measureMeshPlaneSectionPerimetersV1({
    positionsM,
    triangleIndices: indices,
    planeOriginM: origin,
    planeNormal: [0, 1, 0],
    selection: { kind: 'nearest-seed', seedM: origin },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!section.ok || !section.selectedLoop) return null;
  const points = section.selectedLoop.pointsM.map(([x, , z]) => [x, z] as const);
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const meanZ = (keep: (x: number) => boolean) => {
    const near = points.filter(([x]) => keep(x)).map(([, z]) => z);
    return near.reduce((sum, z) => sum + z, 0) / near.length;
  };
  const sideZ = (meanZ((x) => x <= minX + 0.005) + meanZ((x) => x >= maxX - 0.005)) / 2;
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: (readonly [number, number])[]) => {
    const out: (readonly [number, number])[] = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], point) <= 0) {
        out.pop();
      }
      out.push(point);
    }
    return out.slice(0, -1);
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  let girthM = 0;
  for (let i = 0; i < hull.length; i += 1) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    girthM += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return {
    minX,
    maxX,
    back: sideZ - Math.min(...zs),
    girthM,
    outlineM: section.selectedLoop.perimeterM,
  };
}

/** Crotch: lowest 2 mm level whose section still spans the midline by 30 mm each way. */
function hipBackShare(
  positionsM: Float32Array,
  indices: Uint16Array | Uint32Array,
  heightM: number,
  hip: Vec3,
) {
  // A plane that grazes a vertex can leave an open section; such a level is skipped, as the
  // scan harness does, and the walk steps over it.
  const spans = (y: number) => {
    const s =
      sectionAt(positionsM, indices, y, hip) ?? sectionAt(positionsM, indices, y - 0.0005, hip);
    return s != null && s.minX < hip[0] - 0.03 && s.maxX > hip[0] + 0.03;
  };
  let crotchY = hip[1];
  while (spans(crotchY - 0.002)) crotchY -= 0.002;
  const levels: { y: number; back: number; girthM: number }[] = [];
  let tried = 0;
  for (let y = crotchY + 0.01 * heightM; y <= crotchY + 0.12 * heightM; y += 0.002) {
    tried += 1;
    const s = sectionAt(positionsM, indices, y, hip);
    if (s) levels.push({ y, back: s.back, girthM: s.girthM });
  }
  expect(levels.length).toBeGreaterThanOrEqual(0.9 * tried);
  const smoothed = levels.map((_, i) => {
    const window = levels.slice(Math.max(0, i - 2), i + 3);
    return window.reduce((sum, level) => sum + level.back, 0) / window.length;
  });
  const best = smoothed.indexOf(Math.max(...smoothed));
  return { crotchY, levelY: levels[best].y, ratio: levels[best].back / levels[best].girthM };
}

const tapeAt = (positionsM: Float32Array, indices: Uint16Array | Uint32Array, station: Vec3) =>
  sectionAt(positionsM, indices, station[1], station)!.girthM;

describe('female hip back share (HSRD-100 female mean)', () => {
  it('is the HSRD-100 statistic', () => {
    expect(FEMALE_HIP_BACK_OVER_HIP_GIRTH_V1).toBe(0.145);
  });

  it.each([0, 1, 2])(
    'female record %i: back depth / hip girth reaches 0.145 ± 0.01; hip and waist girth, heights and the gate receipt hold',
    async (record) => {
      const measurements = CANONICAL_MEASUREMENT_SIZE_RECORDS[record].measurements;
      const { basis, runtime, solved, hipStationM, waistStationM } = await bodyOf(
        'female',
        measurements,
      );
      const heightM = measurements.heightMm / 1000;
      const after = runtime.displayMesh.positions;
      expect(runtime.diagnostics.map(({ code }) => code)).toContain('hip-back-share-applied');

      const before = hipBackShare(solved.positionsM, basis.indices, heightM, hipStationM);
      const reached = hipBackShare(after, basis.indices, heightM, hipStationM);
      // The base alone misses the band (about 0.13); the result sits in it.
      expect(Math.abs(before.ratio - FEMALE_HIP_BACK_OVER_HIP_GIRTH_V1)).toBeGreaterThan(0.01);
      expect(Math.abs(reached.ratio - FEMALE_HIP_BACK_OVER_HIP_GIRTH_V1)).toBeLessThanOrEqual(0.01);

      // Hip station and waist station tape girths stay where the waist/hip solve put them.
      for (const station of [hipStationM, waistStationM]) {
        const moved =
          tapeAt(after, basis.indices, station) - tapeAt(solved.positionsM, basis.indices, station);
        expect(Math.abs(moved) * 1000).toBeLessThanOrEqual(0.5);
      }

      // The gluteal cleft keeps its depth: the section outline, which dips into the cleft where the
      // tape bridges it (the ANSUR harness reports this outline as hip girth), does not grow either.
      // A back stretched about the seam deepened the cleft and added 3.7-7.7 mm here.
      const outlineAt = (positionsM: Float32Array) =>
        sectionAt(positionsM, basis.indices, hipStationM[1], hipStationM)!.outlineM;
      expect((outlineAt(after) - outlineAt(solved.positionsM)) * 1000).toBeLessThanOrEqual(0.5);

      // Every level from the crotch to the waist station keeps its tape girth: no bias, and no level
      // off by more than the facet ripple of a section cut between vertex rows.
      const levelChangesMm: number[] = [];
      for (let y = before.crotchY + 0.004; y < waistStationM[1]; y += 0.004) {
        const was = sectionAt(solved.positionsM, basis.indices, y, hipStationM);
        const is = sectionAt(after, basis.indices, y, hipStationM);
        if (was && is) levelChangesMm.push((is.girthM - was.girthM) * 1000);
      }
      expect(levelChangesMm.length).toBeGreaterThan(30);
      const meanChangeMm = levelChangesMm.reduce((sum, d) => sum + d, 0) / levelChangesMm.length;
      expect(Math.abs(meanChangeMm)).toBeLessThanOrEqual(0.1);
      expect(Math.max(...levelChangesMm.map(Math.abs))).toBeLessThanOrEqual(1.25);

      // Heights never change; only vertices between the crotch and the waist station move.
      let movedCount = 0;
      let heightChanged = 0;
      let movedOutsideBand = 0;
      for (let v = 0; v < after.length / 3; v += 1) {
        const y = after[v * 3 + 1];
        if (y !== solved.positionsM[v * 3 + 1]) heightChanged += 1;
        const moved =
          after[v * 3] !== solved.positionsM[v * 3] ||
          after[v * 3 + 2] !== solved.positionsM[v * 3 + 2];
        if (!moved) continue;
        movedCount += 1;
        if (y <= before.crotchY || y >= waistStationM[1]) movedOutsideBand += 1;
      }
      expect({ heightChanged, movedOutsideBand }).toEqual({
        heightChanged: 0,
        movedOutsideBand: 0,
      });
      expect(movedCount).toBeGreaterThan(0);

      // The stored gate is the receipt pose runtime v2 recomputes on these positions.
      expect(JSON.stringify(runtime.qualityGate)).toBe(
        JSON.stringify(
          evaluateMeasurementOpenReferenceDisplayQualityV1({
            uniformPositionsM: runtime.openReference.mesh.positions,
            personalizedPositionsM: after,
            triangleIndices: runtime.openReference.mesh.indices,
          }),
        ),
      );
    },
    120_000,
  );

  it('still poses: the changed body keeps the bound receipt and continuous joint pivots', async () => {
    const measurements = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements;
    const { basis, runtime } = await bodyOf('female', measurements);
    expect(runtime.diagnostics.map(({ code }) => code)).toContain('hip-back-share-applied');
    const posed = await createMeasurementOpenReferenceDisplayPoseRuntimeV1({
      basis,
      measurements,
      proxyRuntime: runtime,
      presetId: 'near-t',
      loadResources: loadPoseResources,
    });
    expect(posed.maximumJointPivotResidualM).toBeLessThanOrEqual(1e-7);
  }, 120_000);

  it.each(['male', 'neutral'] as const)(
    '%s bodies are untouched',
    async (kind) => {
      const measurements = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements;
      const { runtime, solved } = await bodyOf(kind, measurements);
      expect(runtime.diagnostics.map(({ code }) => code)).not.toContain('hip-back-share-applied');
      expect(runtime.diagnostics.map(({ code }) => code)).not.toContain('hip-back-share-rejected');
      expect(Buffer.from(runtime.displayMesh.positions.buffer)).toEqual(
        Buffer.from(solved.positionsM.buffer),
      );
    },
    120_000,
  );

  it('leaves a body already at or above the share unchanged', async () => {
    const measurements = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements;
    const { basis, runtime, solved, hipStationM, waistStationM } = await bodyOf(
      'female',
      measurements,
    );
    const result = applyFemaleHipBackShareV1({
      positionsM: solved.positionsM,
      uniformPositionsM: runtime.openReference.mesh.positions,
      triangleIndices: basis.indices,
      heightM: measurements.heightMm / 1000,
      hipStationM,
      waistStationM,
      targetRatio: 0.1,
    });
    expect(result.status).toBe('unchanged');
    expect(result.positionsM).toBe(solved.positionsM);
  }, 120_000);
});
