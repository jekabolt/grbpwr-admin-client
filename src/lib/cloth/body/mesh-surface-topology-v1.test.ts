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
  createMeshSurfaceAdjacencyV1,
  createMeshSurfaceTopologyV1,
  meshSurfaceTopologyMatchesIndicesV1,
} from './mesh-surface-topology-v1';

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
  return { basis, positionsM };
}

describe('mesh surface topology v1', () => {
  it('builds and caches the measured hm08 topology within its one-time budget', () => {
    const hashes = new Set<string>();
    const coldBuildMs: number[] = [];
    for (const kind of KINDS) {
      const { basis, positionsM } = fixture(kind);
      const result = createMeshSurfaceTopologyV1({
        positionsM,
        triangleIndices: basis.indices,
      });
      expect(result.ok, result.ok ? kind : `${kind}: ${result.errors.join('; ')}`).toBe(true);
      if (!result.ok) continue;
      hashes.add(result.topology.topologyHash);
      if (!result.cached) coldBuildMs.push(result.buildMs);
      expect(result.topology.vertexCount).toBe(13_380);
      expect(result.topology.triangleCount).toBe(26_756);
      expect(result.topology.edgeCount).toBe(40_134);
      expect(result.topology.midlineVertexOrder.reduce((sum, order) => sum + order.length, 0)).toBe(
        188,
      );
      expect(meshSurfaceTopologyMatchesIndicesV1(result.topology, basis.indices)).toBe(true);
      const edgeKeys = new Set<string>();
      for (let edge = 0; edge < result.topology.edgeCount; edge += 1) {
        edgeKeys.add(
          `${result.topology.edgeVertices[edge * 2]}:${result.topology.edgeVertices[edge * 2 + 1]}`,
        );
      }
      let missingMirrorEdges = 0;
      for (let edge = 0; edge < result.topology.edgeCount; edge += 1) {
        const rawA = result.topology.mirrorVertexMap[result.topology.edgeVertices[edge * 2]];
        const rawB = result.topology.mirrorVertexMap[result.topology.edgeVertices[edge * 2 + 1]];
        const a = Math.min(rawA, rawB);
        const b = Math.max(rawA, rawB);
        if (!edgeKeys.has(`${a}:${b}`)) missingMirrorEdges += 1;
      }
      expect(missingMirrorEdges).toBe(106);
      for (let vertex = 0; vertex < result.topology.vertexCount; vertex += 1) {
        const mirror = result.topology.mirrorVertexMap[vertex];
        expect(result.topology.mirrorVertexMap[mirror]).toBe(vertex);
        expect(positionsM[mirror * 3]).toBeCloseTo(-positionsM[vertex * 3], 12);
        expect(positionsM[mirror * 3 + 1]).toBe(positionsM[vertex * 3 + 1]);
        expect(positionsM[mirror * 3 + 2]).toBe(positionsM[vertex * 3 + 2]);
      }
    }
    expect(hashes.size).toBe(1);
    expect(coldBuildMs).toHaveLength(1);
    console.info(`geodesic-topology cold=${coldBuildMs[0].toFixed(3)}ms`);
    expect(coldBuildMs[0]).toBeLessThanOrEqual(40);
  });

  it('derives the mirror map from the given positions, never from what was built before', () => {
    // A shaped body 0.1 mm off mirror used to get the cached map of whatever exactly symmetric HM08
    // mesh was built first, and no map at all when it came first: anchors depended on build order.
    const { basis, positionsM } = fixture('male');
    const drifted = Float32Array.from(positionsM);
    const midline = drifted.findIndex((value, index) => index % 3 === 0 && value === 0) / 3;
    drifted[midline * 3] = 0.0001;
    const runs = [positionsM, drifted, positionsM, drifted].map((positions) =>
      createMeshSurfaceTopologyV1({ positionsM: positions, triangleIndices: basis.indices }),
    );
    expect(runs.map(({ ok }) => ok)).toEqual([true, false, true, false]);
    expect(runs[1]).toMatchObject({ ok: false, code: 'symmetry-mismatch' });
    // Same positions, same topology object: the cache still serves the repeated call.
    expect(runs[0].ok && runs[2].ok && runs[2].topology).toBe(runs[0].ok && runs[0].topology);
    expect(runs[2].ok && runs[2].cached).toBe(true);
  });

  it('matches signed zero exactly across reflected and midline vertices', () => {
    const result = createMeshSurfaceTopologyV1({
      positionsM: Float32Array.of(-1, 0, -0, 1, -0, 0, -0, 1, 0),
      triangleIndices: Uint16Array.of(0, 1, 2),
    });
    expect(result).toMatchObject({
      ok: true,
      topology: {
        mirrorVertexMap: Uint32Array.of(1, 0, 2),
        midlineVertexOrder: [Uint32Array.of(2)],
      },
    });
  });

  it('rejects duplicate vertices on the midline and after a reflected pair is complete', () => {
    for (const positionsM of [
      Float32Array.of(0, 1, -0, -0, 1, 0, 2, 0, 0),
      Float32Array.of(1, 0, 0, -1, 0, 0, -1, -0, -0),
    ]) {
      const result = createMeshSurfaceTopologyV1({
        positionsM,
        triangleIndices: Uint16Array.of(0, 1, 2),
      });
      expect(result).toMatchObject({
        ok: false,
        code: 'symmetry-mismatch',
        errors: ['Mirror construction requires unique exact vertex coordinates.'],
      });
    }
  });

  it('rejects an index buffer that is not the topology it cached', () => {
    const { basis, positionsM } = fixture('base');
    const result = createMeshSurfaceTopologyV1({ positionsM, triangleIndices: basis.indices });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changed = basis.indices.slice();
    [changed[0], changed[1]] = [changed[1], changed[0]];
    expect(meshSurfaceTopologyMatchesIndicesV1(result.topology, changed)).toBe(false);
  });

  it('builds deformed Float64 adjacency without reading or warming the body topology cache', () => {
    const positionsM = Float32Array.of(-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0);
    const triangleIndices = Uint16Array.of(0, 1, 2, 2, 1, 3);
    const deformed = Float64Array.from(positionsM);
    deformed[0] += 0.0001;
    const clothInput = { positionsM: deformed, triangleIndices };
    const bodyInput = { positionsM, triangleIndices };

    expect(createMeshSurfaceAdjacencyV1(clothInput)).toMatchObject({ ok: true, cached: false });
    expect(createMeshSurfaceTopologyV1(bodyInput)).toMatchObject({ ok: true, cached: false });
    expect(createMeshSurfaceAdjacencyV1(clothInput)).toMatchObject({ ok: true, cached: false });
    expect(createMeshSurfaceTopologyV1(bodyInput)).toMatchObject({ ok: true, cached: true });
    expect(
      createMeshSurfaceTopologyV1({ positionsM: Float32Array.from(deformed), triangleIndices }),
    ).toMatchObject({ ok: false, code: 'symmetry-mismatch' });
  });
});
