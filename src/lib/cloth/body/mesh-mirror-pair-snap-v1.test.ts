import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import { snapMeshMirrorPairsV1 } from './mesh-mirror-pair-snap-v1';
import { createMeshSurfaceTopologyV1 } from './mesh-surface-topology-v1';

function maleBasis() {
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readFileSync(resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1.male.assetPath)),
    'male',
  );
  const positionsM = Float32Array.from(
    basis.positionsSourceUnits,
    (value) => value * basis.sourceUnitScaleToM,
  );
  return { basis, positionsM };
}

/** The drift a shaped HM08 body carries: a midline vertex off x = 0 and a pair 10 µm apart. */
function drifted(positionsM: Float32Array) {
  const out = Float32Array.from(positionsM);
  let midline = -1;
  let pair = -1;
  for (let vertex = 0; vertex < out.length / 3; vertex += 1) {
    if (midline < 0 && out[vertex * 3] === 0) midline = vertex;
    if (pair < 0 && out[vertex * 3] > 0.05) pair = vertex;
  }
  out[midline * 3] = 0.00009;
  out[pair * 3 + 1] += 0.00001;
  return { positionsM: out, midline, pair };
}

describe('mesh mirror pair snap v1', () => {
  it('returns an exactly symmetric mesh unchanged', () => {
    const { positionsM } = maleBasis();
    const snapped = snapMeshMirrorPairsV1(positionsM);
    expect(snapped.ok).toBe(true);
    if (!snapped.ok) return;
    expect(snapped.positionsM).toBe(positionsM);
    expect(snapped.snappedVertexCount).toBe(0);
  });

  it('puts drifted pairs back on their exact mirror without touching the input', () => {
    const { basis, positionsM: source } = maleBasis();
    const { positionsM, midline, pair } = drifted(source);
    const before = Float32Array.from(positionsM);
    expect(createMeshSurfaceTopologyV1({ positionsM, triangleIndices: basis.indices }).ok).toBe(
      false,
    );
    const snapped = snapMeshMirrorPairsV1(positionsM);
    expect(snapped.ok, snapped.ok ? '' : snapped.reason).toBe(true);
    if (!snapped.ok) return;
    expect(positionsM).toEqual(before);
    expect(snapped.positionsM[midline * 3]).toBe(0);
    expect(snapped.maxOffsetM).toBeCloseTo(0.00009, 6);
    expect(snapped.snappedVertexCount).toBe(3);
    const topology = createMeshSurfaceTopologyV1({
      positionsM: snapped.positionsM,
      triangleIndices: basis.indices,
    });
    expect(topology.ok).toBe(true);
    if (!topology.ok) return;
    const mirror = topology.topology.mirrorVertexMap[pair];
    expect(snapped.positionsM[mirror * 3]).toBe(-snapped.positionsM[pair * 3]);
    expect(snapped.positionsM[mirror * 3 + 1]).toBe(snapped.positionsM[pair * 3 + 1]);
    // Pure function of the positions: the same bytes again, whatever was built in between.
    const again = snapMeshMirrorPairsV1(Float32Array.from(positionsM));
    expect(again.ok && Array.from(again.positionsM)).toEqual(Array.from(snapped.positionsM));
  });

  it('refuses a body that is not symmetric within a millimetre', () => {
    const { positionsM: source } = maleBasis();
    const positionsM = Float32Array.from(source);
    const vertex = positionsM.findIndex((value, index) => index % 3 === 0 && value > 0.05) / 3;
    positionsM[vertex * 3 + 2] += 0.002;
    const snapped = snapMeshMirrorPairsV1(positionsM);
    expect(snapped).toEqual({
      ok: false,
      reason: expect.stringMatching(/has-no-mirror-within-tolerance$/),
    });
  });

  it('refuses an ambiguous mirror instead of guessing', () => {
    // Two right-side candidates equally close to the left vertex's reflection.
    const positionsM = new Float32Array([0.1, 1, 0, -0.1, 1, 0.0001, -0.1, 1, -0.0001]);
    const snapped = snapMeshMirrorPairsV1(positionsM);
    expect(snapped).toEqual({ ok: false, reason: expect.stringMatching(/ambiguous$/) });
  });
});
