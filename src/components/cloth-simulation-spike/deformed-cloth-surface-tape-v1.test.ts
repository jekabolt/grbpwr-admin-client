import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Triangle,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';

import {
  measureDeformedClothSurfaceTapeV1,
  type DeformedClothSurfaceTapeHitV1,
} from './deformed-cloth-surface-tape-v1';

const hit = (triangleIndex: number, barycentric: DeformedClothSurfaceTapeHitV1['barycentric']) => ({
  triangleIndex,
  barycentric,
});

function foldedStrip() {
  return {
    positionsM: Float32Array.from([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1]),
    triangles: Uint32Array.from([0, 2, 3, 0, 3, 1, 2, 4, 5, 2, 5, 3]),
    pieceRange: {
      pieceId: 'folded-cloth',
      vertexOffset: 0,
      vertexCount: 6,
      triangleOffset: 0,
      triangleCount: 4,
    },
    start: hit(0, [0.5, 0.2, 0.3]),
    end: hit(3, [0.5, 0.3, 0.2]),
  };
}

describe('deformed cloth surface tape', () => {
  it('unfolds a folded strip between exact interior anchors, in either direction', () => {
    const input = foldedStrip();
    const positions = input.positionsM.slice();
    const triangles = input.triangles.slice();
    const length = measureDeformedClothSurfaceTapeV1(input);
    expect(length).toBeCloseTo(Math.hypot(0.8, 0.2), 10);
    expect(length).toBeGreaterThan(Math.hypot(0.5, 0.2, 0.3));
    expect(
      measureDeformedClothSurfaceTapeV1({ ...input, start: input.end, end: input.start }),
    ).toBeCloseTo(length!, 10);
    expect(input.positionsM).toEqual(positions);
    expect(input.triangles).toEqual(triangles);
  });

  it('uses the original winding of CPU ray hits on the deformed mesh', () => {
    const input = foldedStrip();
    const geometry = new BufferGeometry();
    const position = new BufferAttribute(input.positionsM, 3);
    geometry.setAttribute('position', position);
    geometry.setIndex(new BufferAttribute(input.triangles, 1));
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(geometry, material);

    function rayHit(origin: Vector3, direction: Vector3) {
      const exact = new Raycaster(origin, direction).intersectObject(mesh, false)[0];
      if (!exact?.face || exact.faceIndex === undefined) throw new Error('Expected a ray hit.');
      const vertex = (index: number) => new Vector3().fromBufferAttribute(position, index);
      const { a, b, c } = exact.face;
      const weights = Triangle.getBarycoord(
        exact.point,
        vertex(a),
        vertex(b),
        vertex(c),
        new Vector3(),
      );
      if (!weights) throw new Error('Expected a nondegenerate cloth face.');
      return hit(exact.faceIndex, [weights.x, weights.y, weights.z]);
    }

    try {
      const start = rayHit(new Vector3(0.5, 0.3, 2), new Vector3(0, 0, -1));
      const end = rayHit(new Vector3(2, 0.5, 0.3), new Vector3(-1, 0, 0));
      expect([start.triangleIndex, end.triangleIndex]).toEqual([0, 3]);
      expect(measureDeformedClothSurfaceTapeV1({ ...input, start, end })).toBeCloseTo(
        Math.hypot(0.8, 0.2),
        10,
      );
    } finally {
      geometry.dispose();
      material.dispose();
    }
  });

  it('uses an in-face segment and keeps authored edge and vertex hits on the original mesh', () => {
    const input = foldedStrip();
    expect(
      measureDeformedClothSurfaceTapeV1({
        ...input,
        start: hit(0, [0.2, 0.3, 0.5]),
        end: hit(0, [0.6, 0.1, 0.3]),
      }),
    ).toBeCloseTo(Math.hypot(0.4, 0.2), 12);
    expect(
      measureDeformedClothSurfaceTapeV1({
        ...input,
        start: hit(1, [0.5, 0, 0.5]),
        end: hit(2, [0, 0.5, 0.5]),
      }),
    ).toBeCloseTo(2, 10);
    expect(
      measureDeformedClothSurfaceTapeV1({
        ...input,
        start: hit(0, [0, 1, 0]),
        end: hit(2, [1, 0, 0]),
      }),
    ).toBe(0);
  });

  it('uses the original face order and range offsets and refuses cross-piece hits or indices', () => {
    const input = foldedStrip();
    const twoPieces = {
      ...input,
      positionsM: Float32Array.from([5, 0, 1, 5, 1, 1, 6, 0, 1, ...input.positionsM]),
      triangles: Uint32Array.from([0, 1, 2, ...input.triangles.map((vertex) => vertex + 3)]),
      pieceRange: { ...input.pieceRange, vertexOffset: 3, triangleOffset: 1 },
      start: hit(1, input.start.barycentric),
      end: hit(4, input.end.barycentric),
    };
    expect(measureDeformedClothSurfaceTapeV1(twoPieces)).toBeCloseTo(Math.hypot(0.8, 0.2), 10);
    expect(measureDeformedClothSurfaceTapeV1({ ...twoPieces, end: hit(0, [1, 0, 0]) })).toBeNull();
    twoPieces.triangles[3] = 2;
    expect(measureDeformedClothSurfaceTapeV1(twoPieces)).toBeNull();
  });

  it.each([
    hit(-1, [1, 0, 0]),
    hit(1.25, [1, 0, 0]),
    hit(0, [Number.NaN, 0, 1]),
    hit(0, [-0.01, 0.51, 0.5]),
    hit(0, [0.2, 0.2, 0.2]),
  ])('refuses an invalid exact anchor %j', (start) => {
    expect(measureDeformedClothSurfaceTapeV1({ ...foldedStrip(), start })).toBeNull();
  });

  it('refuses a non-finite frame, invalid exact range, or collapsed triangle', () => {
    const input = foldedStrip();
    const badPositions = input.positionsM.slice();
    badPositions[17] = Infinity;
    expect(measureDeformedClothSurfaceTapeV1({ ...input, positionsM: badPositions })).toBeNull();
    expect(
      measureDeformedClothSurfaceTapeV1({
        ...input,
        pieceRange: { ...input.pieceRange, triangleCount: 5 },
      }),
    ).toBeNull();
    input.positionsM.set(input.positionsM.subarray(0, 3), 6);
    expect(measureDeformedClothSurfaceTapeV1(input)).toBeNull();
  });

  it('refuses a closed volume even for a same-face tape', () => {
    const input = {
      positionsM: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      triangles: Uint32Array.from([0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2]),
      pieceRange: {
        pieceId: 'volume',
        vertexOffset: 0,
        vertexCount: 4,
        triangleOffset: 0,
        triangleCount: 4,
      },
      start: hit(0, [1, 0, 0]),
      end: hit(0, [0, 1, 0]),
    };
    expect(measureDeformedClothSurfaceTapeV1(input)).toBeNull();
  });

  it('refuses duplicate faces, a non-manifold edge, or disjoint fans at a shared vertex', () => {
    const input = foldedStrip();
    const withFaces = (indices: number[]) => ({
      ...input,
      triangles: Uint32Array.from(indices),
      pieceRange: { ...input.pieceRange, triangleCount: indices.length / 3 },
      end: hit(0, [0, 1, 0]),
    });
    expect(measureDeformedClothSurfaceTapeV1(withFaces([0, 2, 3, 0, 3, 2]))).toBeNull();
    expect(measureDeformedClothSurfaceTapeV1(withFaces([...input.triangles, 2, 3, 4]))).toBeNull();
    expect(
      measureDeformedClothSurfaceTapeV1(withFaces([0, 2, 3, 3, 2, 4, 4, 2, 5, 4, 5, 0])),
    ).toBeNull();
  });
});
