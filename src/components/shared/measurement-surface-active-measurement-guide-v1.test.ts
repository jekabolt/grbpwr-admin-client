import { describe, expect, it } from 'vitest';

import { CANONICAL_BODY_MEASUREMENTS_VERSION } from 'lib/cloth/body/measurement-adapter';
import { createMeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import type { MeasurementSurfaceMeshV1 } from 'lib/cloth/body/measurement-watertight-surface-v1';
import { buildMeasurementSurfaceActiveMeasurementGuideV1 } from './measurement-surface-active-measurement-guide-v1';

function cylinderMesh(heightM = 1.72): MeasurementSurfaceMeshV1 {
  const sides = 32;
  const rings = 48;
  const positions: number[] = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const y = (heightM * ring) / rings;
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      positions.push(Math.cos(angle) * 0.32, y, Math.sin(angle) * 0.24);
    }
  }
  const indices: number[] = [];
  for (let ring = 0; ring < rings; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const a = ring * sides + side;
      const b = ring * sides + next;
      const c = (ring + 1) * sides + side;
      const d = (ring + 1) * sides + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const positionArray = Float32Array.from(positions);
  const indexArray = Uint32Array.from(indices);
  return Object.freeze({
    positions: positionArray,
    indices: indexArray,
    vertexCount: positionArray.length / 3,
    triangleCount: indexArray.length / 3,
    byteLength: positionArray.byteLength + indexArray.byteLength,
  });
}

const frame = createMeasurementBodyFrameV2({
  sourceRevision: 'measurement-guide-test',
  measurements: {
    schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
    heightMm: 1720,
    shoulderBreadthMm: 420,
    chestCircumferenceMm: 920,
    underBustCircumferenceMm: 800,
    waistCircumferenceMm: 740,
    hipCircumferenceMm: 980,
    armLengthMm: 600,
    inseamMm: 800,
    bicepCircumferenceMm: 300,
    wristCircumferenceMm: 170,
    thighCircumferenceMm: 560,
    calfCircumferenceMm: 370,
    ankleCircumferenceMm: 230,
    hpsHeightMm: 1460,
    cfNeckToWaistMm: 430,
    waistHeightMm: 1040,
    waistToHighHipMm: 100,
    waistToHipMm: 220,
    chestDepthMm: 240,
    waistDepthMm: 210,
    hipDepthMm: 270,
    shoulderLengthMm: 130,
    shoulderDropMm: 35,
    armscyeDepthMm: 210,
    armscyeCircumferenceMm: 430,
    bustApexToApexMm: 190,
    hpsToBustApexMm: 290,
  },
});

describe('active mannequin measurement guide v1', () => {
  it('binds a neutral chest loop to displayed mesh vertices', () => {
    const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_CHEST',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
    });

    expect(guide.status).toBe('visible');
    expect(guide.label).toBe('chest');
    expect(guide.paths).toHaveLength(1);
    expect(guide.paths[0]).toMatchObject({ closed: true, source: 'mesh-vertices' });
    expect(
      guide.paths[0].source === 'mesh-vertices' ? new Set(guide.paths[0].vertexIndices).size : 0,
    ).toBeGreaterThan(20);
  });

  it('uses the bounded under-bust station and exposes no fit claim', () => {
    const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_UNDER_BUST',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
    });

    expect(guide.status).toBe('visible');
    expect(guide.claims).toEqual({
      visualGuideOnly: true,
      measurementProtocolEquivalent: false,
      fitClaimEligible: false,
    });
  });

  it('keeps a vertex-bound circumference guide available for live posed positions', () => {
    const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_WAIST',
      frame,
      mesh: cylinderMesh(),
      neutralPose: false,
    });

    expect(guide.status).toBe('visible');
    expect(guide.paths[0]).toMatchObject({ source: 'mesh-vertices' });
  });

  it('shows height directly and refuses an invented inseam landmark', () => {
    const mesh = cylinderMesh();
    const height = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_HEIGHT',
      frame,
      mesh,
      neutralPose: true,
    });
    const posedHeight = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_HEIGHT',
      frame,
      mesh,
      neutralPose: false,
    });
    const inseam = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_INSEAM',
      frame,
      mesh,
      neutralPose: true,
    });

    expect(height).toMatchObject({ status: 'visible', label: 'height' });
    expect(height.paths[0]).toMatchObject({ source: 'fixed-points', closed: false });
    expect(posedHeight).toMatchObject({ status: 'unavailable-pose', paths: [] });
    expect(inseam).toMatchObject({ status: 'unsupported', label: 'inseam', paths: [] });
  });

  it.each([
    'BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST',
    'BODY_MEASUREMENT_NAME_WAIST_HEIGHT',
    'BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP',
    'BODY_MEASUREMENT_NAME_WAIST_TO_HIP',
    'BODY_MEASUREMENT_NAME_CHEST_DEPTH',
    'BODY_MEASUREMENT_NAME_WAIST_DEPTH',
    'BODY_MEASUREMENT_NAME_HIP_DEPTH',
  ] as const)('draws a visual-only P0 guide for %s from admitted frame geometry', (name) => {
    const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: name,
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
    });

    expect(guide.status).toBe('visible');
    expect(guide.paths).toHaveLength(1);
    expect(guide.claims).toEqual({
      visualGuideOnly: true,
      measurementProtocolEquivalent: false,
      fitClaimEligible: false,
    });
  });

  it.each([
    'BODY_MEASUREMENT_NAME_HPS_HEIGHT',
    'BODY_MEASUREMENT_NAME_SHOULDER_LENGTH',
    'BODY_MEASUREMENT_NAME_SHOULDER_DROP',
    'BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH',
    'BODY_MEASUREMENT_NAME_ARMSCYE_CIRCUMFERENCE',
    'BODY_MEASUREMENT_NAME_BUST_APEX_TO_APEX',
    'BODY_MEASUREMENT_NAME_HPS_TO_BUST_APEX',
  ] as const)('does not invent a missing landmark for %s', (name) => {
    expect(
      buildMeasurementSurfaceActiveMeasurementGuideV1({
        measurementName: name,
        frame,
        mesh: cylinderMesh(),
        neutralPose: true,
      }),
    ).toMatchObject({ status: 'unsupported', paths: [] });
  });
});
