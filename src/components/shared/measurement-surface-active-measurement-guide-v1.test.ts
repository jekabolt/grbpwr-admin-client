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
  const bottomCenter = positions.length / 3;
  positions.push(0, 0, 0);
  const topCenter = positions.length / 3;
  positions.push(0, heightM, 0);
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
  for (let side = 0; side < sides; side += 1) {
    const next = (side + 1) % sides;
    const topRing = rings * sides;
    indices.push(bottomCenter, next, side);
    indices.push(topCenter, topRing + side, topRing + next);
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
  it('keeps the exact neutral chest section instead of snapping it to coarse mesh vertices', () => {
    const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_CHEST',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
    });

    expect(guide.status).toBe('visible');
    expect(guide.label).toBe('chest');
    expect(guide.paths).toHaveLength(1);
    expect(guide.paths[0]).toMatchObject({ closed: true, source: 'fixed-points' });
    expect(
      guide.paths[0].source === 'fixed-points' ? guide.paths[0].pointsM.length : 0,
    ).toBeGreaterThan(20);
  });

  it('marks the under-bust fallback limited and exposes no fit claim', () => {
    const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_UNDER_BUST',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
    });

    expect(guide.status).toBe('limited');
    expect(guide.claims).toEqual({
      visualGuideOnly: true,
      measurementProtocolEquivalent: false,
      fitClaimEligible: false,
    });

    const admittedStation = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_UNDER_BUST',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
      torsoSectionStations: { underBust: [0, 1.1, 0] },
    });
    expect(admittedStation.status).toBe('visible');
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

  it.each(['BODY_MEASUREMENT_NAME_WAIST_HEIGHT'] as const)(
    'draws an exact visual-only P0 guide for %s from admitted frame geometry',
    (name) => {
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
    },
  );

  it.each([
    'BODY_MEASUREMENT_NAME_ACROSS_FRONT',
    'BODY_MEASUREMENT_NAME_ACROSS_BACK',
    'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER',
    'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH',
    'BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST',
    'BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST',
    'BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP',
    'BODY_MEASUREMENT_NAME_WAIST_TO_HIP',
    'BODY_MEASUREMENT_NAME_CHEST_DEPTH',
    'BODY_MEASUREMENT_NAME_WAIST_DEPTH',
    'BODY_MEASUREMENT_NAME_HIP_DEPTH',
  ] as const)('marks the approximate guide for %s limited', (name) => {
    const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: name,
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
    });

    expect(guide.status).toBe('limited');
    expect(guide.paths).toHaveLength(1);
    expect(guide.claims).toEqual({
      visualGuideOnly: true,
      measurementProtocolEquivalent: false,
      fitClaimEligible: false,
    });
  });

  it.each([
    ['BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST', 1],
    ['BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST', -1],
  ] as const)('draws %s as an offset midsagittal section arc', (name, zSide) => {
    const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: name,
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
    });
    const path = guide.paths[0];
    expect(path).toMatchObject({ source: 'fixed-points', closed: false });
    if (path?.source !== 'fixed-points') throw new Error('Expected a fixed section arc.');
    expect(path.pointsM.length).toBeGreaterThan(2);
    for (const point of path.pointsM) {
      expect(point[0]).toBeCloseTo(0, 6);
      expect(zSide * point[2]).toBeGreaterThan(0);
    }
    const neckBase = frame.landmarks.find(({ id }) => id === 'neck-base');
    const waist = frame.torsoStations.find(({ id }) => id === 'waist');
    expect(path.pointsM[0][1]).toBeCloseTo(neckBase?.positionM[1] ?? 0, 5);
    expect(path.pointsM.at(-1)?.[1]).toBeCloseTo(waist?.yM ?? 0, 5);
  });

  it.each([
    ['BODY_MEASUREMENT_NAME_ACROSS_FRONT', 1],
    ['BODY_MEASUREMENT_NAME_ACROSS_BACK', -1],
  ] as const)('draws %s around the requested side of the chest section', (name, zSide) => {
    const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: name,
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
    });
    const path = guide.paths[0];
    expect(path).toMatchObject({ source: 'fixed-points', closed: false });
    if (path?.source !== 'fixed-points') throw new Error('Expected a fixed section arc.');
    expect(path.pointsM.length).toBeGreaterThan(2);
    for (const point of path.pointsM) expect(zSide * point[2]).toBeGreaterThan(0);
    expect(path.pointsM[0][0]).toBeLessThan(0);
    expect(path.pointsM.at(-1)?.[0]).toBeGreaterThan(0);
  });

  it('places high hip at the protocol station below the waist, or at the runtime station', () => {
    const waist = frame.torsoStations.find(({ id }) => id === 'waist');
    expect(waist).toBeDefined();
    const pathY = (guide: ReturnType<typeof buildMeasurementSurfaceActiveMeasurementGuideV1>) => {
      const path = guide.paths[0];
      if (!path || path.source !== 'fixed-points')
        throw new Error('Expected a fixed section path.');
      return path.pointsM.reduce((sum, point) => sum + point[1], 0) / path.pointsM.length;
    };
    const protocol = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_HIGH_HIP',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
    });
    expect(protocol).toMatchObject({ status: 'visible', label: 'high hip' });
    expect(pathY(protocol)).toBeCloseTo((waist?.yM ?? 0) - 0.1, 5);

    const runtime = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_HIGH_HIP',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
      torsoSectionStations: { highHip: [0, 0.93, 0] },
    });
    expect(pathY(runtime)).toBeCloseTo(0.93, 5);

    const waistToHighHip = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
    });
    const vertical = waistToHighHip.paths[0];
    expect(vertical).toMatchObject({ source: 'fixed-points', closed: false });
    if (vertical?.source !== 'fixed-points') throw new Error('Expected a fixed vertical guide.');
    expect(vertical.pointsM).toHaveLength(2);
    expect(vertical.pointsM[0][0]).toBe(vertical.pointsM[1][0]);
    const hip = frame.torsoStations.find(({ id }) => id === 'hip');
    expect(vertical.pointsM[0][0]).toBeGreaterThan(
      Math.max(waist?.halfWidthM ?? 0, hip?.halfWidthM ?? 0),
    );
    expect(vertical.pointsM[0][1]).toBeCloseTo(waist?.yM ?? 0, 5);
    expect(vertical.pointsM[1][1]).toBeCloseTo(pathY(protocol), 5);

    // A protocol drop (100 mm) that leaves the waist..hip interval has no admitted station.
    const outside = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_HIGH_HIP',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
      torsoSectionStations: { waist: [0, 1, 0], hip: [0, 0.95, 0] },
    });
    expect(outside).toMatchObject({ status: 'unavailable-section', paths: [] });
  });

  it('draws the knee guide on the runtime knee station when one is supplied', () => {
    const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_KNEE',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
      kneeSectionStations: [
        { side: 'negative', originM: [-0.1, 0.2, 0], normal: [0, 1, 0] },
        { side: 'positive', originM: [0, 0.47, 0], normal: [0, 1, 0] },
      ],
    });
    expect(guide).toMatchObject({ status: 'visible', label: 'knee' });
    const path = guide.paths[0];
    expect(path?.source).toBe('fixed-points');
    if (path?.source === 'fixed-points') {
      for (const point of path.pointsM) expect(point[1]).toBeCloseTo(0.47, 5);
    }
  });

  it('draws the neck guide only on the runtime neck station and keeps neck base separate', () => {
    const neckSectionStation = { originM: [0, 0.6, 0] as const, normal: [0, 1, 0] as const };
    const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_NECK',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
      neckSectionStation,
    });
    expect(guide).toMatchObject({ status: 'visible', label: 'neck' });
    const path = guide.paths[0];
    expect(path?.source).toBe('fixed-points');
    if (path?.source === 'fixed-points') {
      for (const point of path.pointsM) expect(point[1]).toBeCloseTo(0.6, 5);
    }
    expect(
      buildMeasurementSurfaceActiveMeasurementGuideV1({
        measurementName: 'BODY_MEASUREMENT_NAME_NECK',
        frame,
        mesh: cylinderMesh(),
        neutralPose: true,
      }),
    ).toMatchObject({ status: 'unavailable-section', paths: [] });
    const neckBase = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_NECK_BASE',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
      neckSectionStation,
    });
    const neckBaseWithout = buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName: 'BODY_MEASUREMENT_NAME_NECK_BASE',
      frame,
      mesh: cylinderMesh(),
      neutralPose: true,
    });
    expect(neckBase).toEqual(neckBaseWithout);
  });

  it.each([
    'BODY_MEASUREMENT_NAME_NECK_BASE',
    'BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT',
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
