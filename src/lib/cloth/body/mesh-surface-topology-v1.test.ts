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

  it('rejects an index buffer that is not the topology it cached', () => {
    const { basis, positionsM } = fixture('base');
    const result = createMeshSurfaceTopologyV1({ positionsM, triangleIndices: basis.indices });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changed = basis.indices.slice();
    [changed[0], changed[1]] = [changed[1], changed[0]];
    expect(meshSurfaceTopologyMatchesIndicesV1(result.topology, changed)).toBe(false);
  });
});
