import { describe, expect, it } from 'vitest';

import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';
import {
  MESH_TAPE_GIRTH_CLOSURE_TOLERANCE_MM,
  measureMeshHorizontalSectionTapeGirthMmV1,
  measureMeshTapeGirthClosureV1,
  meshPlaneSectionLoopTapePerimeterMV1,
} from './mesh-plane-section-tape-girth-v1';

type XZ = readonly [number, number];

/** Square with a notch cut into its back edge: a concave outline like a gluteal cleft. */
const NOTCHED_SQUARE_XZ: readonly XZ[] = [
  [-0.1, -0.1],
  [0.1, -0.1],
  [0.1, 0.1],
  [0.02, 0.1],
  [0, 0.04],
  [-0.02, 0.1],
  [-0.1, 0.1],
];

function polylineLength(points: readonly XZ[]): number {
  let length = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return length;
}

/** Open vertical tube over a horizontal outline, y in [0, 1]. */
function prism(outline: readonly XZ[]): { positionsM: Float32Array; triangleIndices: Uint32Array } {
  const positions: number[] = [];
  for (const [x, z] of outline) positions.push(x, 0, z, x, 1, z);
  const indices: number[] = [];
  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    const a = index * 2;
    const b = index * 2 + 1;
    const c = next * 2;
    const d = next * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }
  return { positionsM: new Float32Array(positions), triangleIndices: new Uint32Array(indices) };
}

describe('mesh plane-section tape girth', () => {
  it('equals the loop perimeter on a convex section', () => {
    const square: [number, number, number][] = [
      [-0.1, 0.5, -0.1],
      [0.1, 0.5, -0.1],
      [0.1, 0.5, 0.1],
      [-0.1, 0.5, 0.1],
    ];
    expect(meshPlaneSectionLoopTapePerimeterMV1({ pointsM: square })).toBeCloseTo(0.8, 12);
  });

  it('bridges a concavity the way a taut tape does', () => {
    const loop = NOTCHED_SQUARE_XZ.map(([x, z]) => [x, 0.5, z] as [number, number, number]);
    const tape = meshPlaneSectionLoopTapePerimeterMV1({ pointsM: loop });
    expect(tape).toBeCloseTo(0.8, 12);
    expect(polylineLength(NOTCHED_SQUARE_XZ)).toBeGreaterThan(tape + 0.01);
  });

  it('ignores duplicate and collinear points', () => {
    const loop: [number, number, number][] = [
      [-0.1, 0, -0.1],
      [0, 0, -0.1],
      [0.1, 0, -0.1],
      [0.1, 0, -0.1],
      [0.1, 0, 0.1],
      [-0.1, 0, 0.1],
    ];
    expect(meshPlaneSectionLoopTapePerimeterMV1({ pointsM: loop })).toBeCloseTo(0.8, 12);
  });

  it('measures in the plane of a tilted section', () => {
    // A 0.2 m square in the x-y plane (normal +z).
    const loop: [number, number, number][] = [
      [0, 0, 0.3],
      [0.2, 0, 0.3],
      [0.2, 0.2, 0.3],
      [0, 0.2, 0.3],
    ];
    expect(meshPlaneSectionLoopTapePerimeterMV1({ pointsM: loop }, [0, 0, 1])).toBeCloseTo(0.8, 12);
  });

  it('rejects degenerate loops', () => {
    expect(() =>
      meshPlaneSectionLoopTapePerimeterMV1({
        pointsM: [
          [0, 0, 0],
          [1, 0, 0],
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      meshPlaneSectionLoopTapePerimeterMV1({
        pointsM: [
          [0, 0, 0],
          [1, 0, 0],
          [2, 0, 0],
        ],
      }),
    ).toThrow(RangeError);
    expect(() =>
      meshPlaneSectionLoopTapePerimeterMV1({
        pointsM: [
          [0, 0, 0],
          [1, 0, Number.NaN],
          [0, 0, 1],
        ],
      }),
    ).toThrow(TypeError);
  });

  it('reads the hull of the solver section on a mesh, shorter than its loop', () => {
    const mesh = prism(NOTCHED_SQUARE_XZ);
    const originM = [0, 0.5, 0] as const;
    const section = measureMeshPlaneSectionPerimetersV1({
      positionsM: mesh.positionsM,
      triangleIndices: mesh.triangleIndices,
      planeOriginM: originM,
      planeNormal: [0, 1, 0],
      selection: { kind: 'nearest-seed', seedM: originM },
      policy: { weldToleranceM: 0.00002 },
    });
    expect(section.ok && section.selectedLoop).toBeTruthy();
    const loopMm = (section.ok && section.selectedLoop ? section.selectedLoop.perimeterM : 0) * 1000;
    const tapeMm = measureMeshHorizontalSectionTapeGirthMmV1({ ...mesh, originM });
    expect(tapeMm).toBeCloseTo(800, 3);
    expect(loopMm).toBeCloseTo(polylineLength(NOTCHED_SQUARE_XZ) * 1000, 3);
    expect(loopMm - (tapeMm ?? 0)).toBeGreaterThan(10);
  });

  it('closes a typed girth only on the tape, never on the loop', () => {
    const mesh = prism(NOTCHED_SQUARE_XZ);
    const loopMm = polylineLength(NOTCHED_SQUARE_XZ) * 1000;
    const closure = measureMeshTapeGirthClosureV1({
      ...mesh,
      stations: {
        hipCircumferenceMm: [0, 0.5, 0],
        waistCircumferenceMm: [0, 0.5, 0],
        chestCircumferenceMm: [0, 5, 0],
      },
      targetsMm: {
        hipCircumferenceMm: 800 + MESH_TAPE_GIRTH_CLOSURE_TOLERANCE_MM / 2,
        waistCircumferenceMm: loopMm,
        chestCircumferenceMm: 800,
      },
    });
    expect(closure.map(({ key, withinTolerance }) => [key, withinTolerance])).toEqual([
      ['chestCircumferenceMm', false],
      ['waistCircumferenceMm', false],
      ['hipCircumferenceMm', true],
    ]);
    expect(closure[0].tapeMm).toBeUndefined();
  });

  it('skips stations or targets that are missing', () => {
    const mesh = prism(NOTCHED_SQUARE_XZ);
    expect(
      measureMeshTapeGirthClosureV1({
        ...mesh,
        stations: { hipCircumferenceMm: [0, 0.5, 0] },
        targetsMm: { waistCircumferenceMm: 700 },
      }),
    ).toEqual([]);
  });
});
