import type { CompiledBendConstraints } from './bend-constraints';
import { TRIANGLE_INDICES_GPU_V1 } from './material-package';
import type { SourceCutCarrierMaterialPackV1 } from './source-cut-carrier-material-v1';

type Interval = readonly [number, number];
type EdgeCoverage = Readonly<{ first: Interval[]; second: Interval[] }>;

function mergeIntervals(input: Interval[]): Interval[] {
  input.sort(([a, b], [c, d]) => a - c || b - d);
  const merged: Interval[] = [];
  for (const [start, end] of input) {
    const previous = merged.at(-1);
    if (!previous || start > previous[1]) merged.push([start, end]);
    else if (end > previous[1]) merged[merged.length - 1] = [previous[0], end];
  }
  return merged;
}

function overlap(a: Interval[], b: Interval[]): number {
  const first = mergeIntervals(a);
  const second = mergeIntervals(b);
  let length = 0;
  let i = 0;
  let j = 0;
  while (i < first.length && j < second.length) {
    const [a0, a1] = first[i];
    const [b0, b1] = second[j];
    length += Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    if (a1 <= b1) i++;
    else j++;
  }
  return Math.min(1, length);
}

const edgeKey = (first: number, second: number) => `${first}:${second}`;
const axes = [0, 1, 2] as const;

/** Material-covered fraction of each existing carrier hinge, in bend color order. */
export function projectSourceCutHingeCoverageV1(
  material: SourceCutCarrierMaterialPackV1,
  bends: CompiledBendConstraints,
): Float64Array {
  const { base, pieces } = material;
  const { offsets, strideBytes } = TRIANGLE_INDICES_GPU_V1;
  const faceView = new DataView(base.triangleIndices);
  if (
    faceView.byteLength !== base.manifest.triangleCount * strideBytes ||
    bends.vertexQuads.length !== bends.constraintCount * 4
  )
    throw new RangeError('Cut hinges require the carrier topology and complete bend quads.');

  const indexed = new Map<
    string,
    { opposites: readonly [number, number]; coverage: EdgeCoverage }
  >();
  const grouped: EdgeCoverage[] = [];
  for (let i = 0; i < bends.constraintCount; i++) {
    const [edgeA, edgeB, oppositeA, oppositeB] = bends.vertexQuads.subarray(4 * i, 4 * i + 4);
    const key = edgeKey(edgeA, edgeB);
    if (edgeA >= edgeB || oppositeA === oppositeB || indexed.has(key))
      throw new RangeError('Cut hinge topology is invalid.');
    const coverage = { first: [], second: [] };
    indexed.set(key, { opposites: [oppositeA, oppositeB], coverage });
    grouped.push(coverage);
  }

  for (const piece of pieces) {
    const surface = piece.surface;
    if (!surface || surface.cornerWeights.length !== 9 * surface.carrierTriangleIndices.length)
      throw new RangeError(
        `Cut hinge projection needs the clipped material surface for ${piece.pieceId}.`,
      );
    for (const [fragmentIndex, local] of surface.carrierTriangleIndices.entries()) {
      if (local >= piece.carrierTriangleCount)
        throw new RangeError('Cut fragment escaped its carrier piece.');
      const face = (piece.carrierTriangleOffset + local) * strideBytes;
      const particles = [
        faceView.getUint32(face + offsets.vertex0, true),
        faceView.getUint32(face + offsets.vertex1, true),
        faceView.getUint32(face + offsets.vertex2, true),
      ];
      const weights = surface.cornerWeights.subarray(9 * fragmentIndex, 9 * fragmentIndex + 9);
      for (const axis of axes) {
        const next = (axis + 1) % 3;
        const last = (axis + 2) % 3;
        const inputA = particles[next];
        const inputB = particles[last];
        const key = edgeKey(Math.min(inputA, inputB), Math.max(inputA, inputB));
        const hinge = indexed.get(key);
        if (!hinge) continue;
        const edgeCorners = axes.filter((corner) => weights[3 * corner + axis] === 0);
        if (edgeCorners.length < 2) continue;
        if (edgeCorners.length !== 2)
          throw new RangeError('Cut fragment lost its positive carrier-plane area.');
        const tAxis = inputA > inputB ? next : last;
        const a = weights[3 * edgeCorners[0] + tAxis];
        const b = weights[3 * edgeCorners[1] + tAxis];
        if (!(a >= 0 && a <= 1 && b >= 0 && b <= 1))
          throw new RangeError('Cut hinge has an invalid material interval.');
        const oppositeIndex = hinge.opposites.indexOf(particles[axis]);
        if (oppositeIndex < 0)
          throw new RangeError('Cut hinge came from a different carrier face.');
        if (a !== b)
          hinge.coverage[oppositeIndex === 0 ? 'first' : 'second'].push([
            Math.min(a, b),
            Math.max(a, b),
          ]);
      }
    }
  }

  // A bend transmits only where material has positive incident area from both sides of the edge.
  return Float64Array.from(grouped, ({ first, second }) => overlap(first, second));
}
