import robustOrientation from 'robust-orientation';

import type { Vec2Mm } from '../../domain/garment-assembly-ir';

export type SeamPointEmbeddingV1 = Readonly<{
  triangleIndex: number;
  vertexIndices: readonly [number, number, number];
  weights: readonly [number, number, number];
}>;

function finitePoint(point: Vec2Mm): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function sameSupport(a: SeamPointEmbeddingV1, b: SeamPointEmbeddingV1): boolean {
  return (
    a.weights.filter((weight) => weight > 0).length ===
      b.weights.filter((weight) => weight > 0).length &&
    a.vertexIndices.every(
      (vertex, index) =>
        a.weights[index]! === 0 ||
        b.vertexIndices.some((other, i) => vertex === other && b.weights[i]! > 0),
    )
  );
}

/** Locate a rest-plane point on one audited piece mesh without nearest-point projection. */
export function locateSeamPointEmbeddingV1(
  verticesMm: readonly Vec2Mm[],
  triangles: Uint32Array,
  pointMm: Vec2Mm,
): SeamPointEmbeddingV1 | null {
  if (!finitePoint(pointMm) || triangles.length % 3 !== 0) {
    throw new Error('Invalid seam point or triangle indices.');
  }

  let result: SeamPointEmbeddingV1 | null = null;
  for (let index = 0; index < triangles.length; index += 3) {
    const vertexIndices = [
      triangles[index]!,
      triangles[index + 1]!,
      triangles[index + 2]!,
    ] as const;
    const [a, b, c] = vertexIndices.map((id) => verticesMm[id]);
    if (!a || !b || !c || !finitePoint(a) || !finitePoint(b) || !finitePoint(c)) {
      throw new Error('Seam embedding triangle vertices must be finite.');
    }
    const area = robustOrientation(a, b, c);
    if (!Number.isFinite(area) || area >= 0) {
      throw new Error('Seam embedding requires nondegenerate CCW rest triangles.');
    }
    if (
      pointMm[0] < Math.min(a[0], b[0], c[0]) ||
      pointMm[0] > Math.max(a[0], b[0], c[0]) ||
      pointMm[1] < Math.min(a[1], b[1], c[1]) ||
      pointMm[1] > Math.max(a[1], b[1], c[1])
    ) {
      continue;
    }

    const u = -robustOrientation(b, c, pointMm);
    const v = -robustOrientation(c, a, pointMm);
    const w = -robustOrientation(a, b, pointMm);
    if (u < 0 || v < 0 || w < 0) continue;
    const total = u + v + w;
    if (!Number.isFinite(total) || total <= 0) {
      throw new Error('Seam embedding weights are outside the supported numeric range.');
    }
    const candidate = {
      triangleIndex: index / 3,
      vertexIndices,
      weights: [(u || 0) / total, (v || 0) / total, (w || 0) / total] as const,
    };
    // Valid boundary ties share the same active vertices. The first triangle is canonical.
    if (result && !sameSupport(result, candidate)) {
      throw new Error('Seam embedding is ambiguous across overlapping triangles.');
    }
    result ??= candidate;
  }
  return result;
}

/** True when every point of the segment is on the closed material triangulation. */
export function seamSegmentIsCoveredByMeshV1(
  verticesMm: readonly Vec2Mm[],
  triangles: Uint32Array,
  start: Vec2Mm,
  end: Vec2Mm,
): boolean {
  if (!finitePoint(start) || !finitePoint(end) || triangles.length % 3 !== 0)
    throw new RangeError('Invalid seam segment or triangle indices.');
  const axis = Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]) ? 0 : 1;
  const span = end[axis] - start[axis];
  if (span === 0) return locateSeamPointEmbeddingV1(verticesMm, triangles, start) !== null;
  const bands: [number, number][] = [];
  for (let i = 0; i < triangles.length; i += 3) {
    const ids = [triangles[i], triangles[i + 1], triangles[i + 2]];
    const [a, b, c] = ids.map((id) => verticesMm[id]);
    if (
      !a ||
      !b ||
      !c ||
      !finitePoint(a) ||
      !finitePoint(b) ||
      !finitePoint(c) ||
      !(robustOrientation(a, b, c) < 0)
    )
      throw new RangeError('Seam coverage requires finite nondegenerate CCW cut triangles.');
    let lower = 0,
      upper = 1;
    for (let j = 0; j < 3; j++) {
      const from = ids[j];
      const to = ids[(j + 1) % 3];
      // Use the same edge equation on each incident triangle, even when its winding reverses.
      const first = verticesMm[Math.min(from, to)];
      const second = verticesMm[Math.max(from, to)];
      const sign = from < to ? -1 : 1;
      const before = sign * robustOrientation(first, second, start);
      const after = sign * robustOrientation(first, second, end);
      if (before < 0 && after < 0) {
        upper = -1;
        break;
      }
      if (before < 0 === after < 0) continue;
      let crossing = before / (before - after);
      if (robustOrientation(start, end, first) === 0) crossing = (first[axis] - start[axis]) / span;
      else if (robustOrientation(start, end, second) === 0)
        crossing = (second[axis] - start[axis]) / span;
      if (before < 0) lower = Math.max(lower, crossing);
      else upper = Math.min(upper, crossing);
      if (upper <= lower) break;
    }
    if (upper > lower) bands.push([lower, upper]);
  }
  bands.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let covered = 0;
  for (const [lower, upper] of bands) {
    if (lower > covered) return false;
    covered = Math.max(covered, upper);
    if (covered === 1) return true;
  }
  return false;
}
