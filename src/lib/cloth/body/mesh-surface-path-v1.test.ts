import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisKindV1,
} from './measurement-open-reference-display-v1';
import {
  createMeshSurfacePathV1,
  evaluateMeshSurfacePathV1,
  meshSurfaceEdgePointV1,
  meshSurfaceVertexPointV1,
  mirrorMeshSurfacePathV1,
  validateMeshSurfacePathV1,
  type MeshSurfacePointV1,
} from './mesh-surface-path-v1';
import { createMeshSurfaceTopologyV1 } from './mesh-surface-topology-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

const KINDS = Object.freeze([
  'female',
  'neutral',
  'male',
  'base',
] as const satisfies readonly MakeHumanOpenReferenceBasisKindV1[]);

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
  const topologyResult = createMeshSurfaceTopologyV1({
    positionsM,
    triangleIndices: basis.indices,
  });
  if (!topologyResult.ok) {
    throw new Error(
      `${kind} topology failed: ${topologyResult.code}: ${topologyResult.errors.join('; ')}`,
    );
  }
  return { basis, positionsM, topology: topologyResult.topology };
}

function crossingPoint(crossing: { readonly a: number; readonly b: number; readonly t: number }) {
  return crossing.a === crossing.b
    ? meshSurfaceVertexPointV1(crossing.a)
    : meshSurfaceEdgePointV1(crossing.a, crossing.b, crossing.t);
}

function pointKey(point: MeshSurfacePointV1): string {
  return point.kind === 'vertex' ? `v:${point.vertex}` : `e:${point.a}:${point.b}:${point.t}`;
}

describe('mesh surface path v1', () => {
  it.each(KINDS)('%s preserves plane-section perimeter and edge identity', (kind) => {
    const { basis, positionsM, topology } = fixture(kind);
    const section = measureMeshPlaneSectionPerimetersV1({
      positionsM,
      triangleIndices: basis.indices,
      planeOriginM: [0, 0.3, 0],
      planeNormal: [0, 1, 0],
      selection: { kind: 'nearest-seed', seedM: [0, 0.3, 0.05] },
    });
    expect(section.ok, kind).toBe(true);
    if (!section.ok || !section.selectedLoop) return;
    expect(section.selectedLoop.crossings).toHaveLength(section.selectedLoop.pointsM.length);
    const path = createMeshSurfacePathV1({
      topology,
      closed: true,
      points: section.selectedLoop.crossings.map(crossingPoint),
    });
    const validation = validateMeshSurfacePathV1(path, topology);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.sharedTriangleIndices).toHaveLength(path.points.length);
    const evaluated = evaluateMeshSurfacePathV1({ path, topology, positionsM });
    expect(evaluated.lengthM).toBeCloseTo(section.selectedLoop.perimeterM, 12);
    section.selectedLoop.pointsM.forEach((point, index) => {
      expect(evaluated.positionsM[index * 3]).toBeCloseTo(point[0], 7);
      expect(evaluated.positionsM[index * 3 + 1]).toBeCloseTo(point[1], 7);
      expect(evaluated.positionsM[index * 3 + 2]).toBeCloseTo(point[2], 7);
    });
    expect(new Set(path.points.map(pointKey)).size).toBe(path.points.length);
  });

  it.each(KINDS)('%s mirrors exactly and remains on-surface under a small morph', (kind) => {
    const { positionsM, topology } = fixture(kind);
    const firstEdge = topology.vertexEdges[topology.vertexEdgeOffsets[8189]];
    const a = topology.edgeVertices[firstEdge * 2];
    const b = topology.edgeVertices[firstEdge * 2 + 1];
    const path = createMeshSurfacePathV1({
      topology,
      points: [meshSurfaceVertexPointV1(8189), meshSurfaceEdgePointV1(a, b, 0.4)],
    });
    const mirrored = mirrorMeshSurfacePathV1(path, topology);
    expect(validateMeshSurfacePathV1(mirrored, topology).ok).toBe(true);
    const left = evaluateMeshSurfacePathV1({ path, topology, positionsM });
    const right = evaluateMeshSurfacePathV1({ path: mirrored, topology, positionsM });
    expect(right.lengthM).toBeCloseTo(left.lengthM, 12);
    for (let index = 0; index < left.positionsM.length; index += 3) {
      expect(right.positionsM[index]).toBeCloseTo(-left.positionsM[index], 7);
      expect(right.positionsM[index + 1]).toBeCloseTo(left.positionsM[index + 1], 7);
      expect(right.positionsM[index + 2]).toBeCloseTo(left.positionsM[index + 2], 7);
    }
    const morphed = positionsM.slice();
    for (let offset = 0; offset < morphed.length; offset += 3) {
      morphed[offset] *= 1.005;
      morphed[offset + 2] *= 0.995;
    }
    const deformed = evaluateMeshSurfacePathV1({ path, topology, positionsM: morphed });
    expect(deformed.positionsM.every(Number.isFinite)).toBe(true);
    expect(validateMeshSurfacePathV1(path, topology).ok).toBe(true);
  });
});
