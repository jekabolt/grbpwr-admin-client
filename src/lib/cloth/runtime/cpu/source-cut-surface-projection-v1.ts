import { TRIANGLE_INDICES_GPU_V1 } from '../../compiler/material-package';
import type { SourceCutCarrierMaterialPackV1 } from '../../compiler/source-cut-carrier-material-v1';
import { SOURCE_CUT_MASS_TRANSFER_LIMITS_V1 } from '../../mesh/triangulation/source-cut-mass-transfer-v1';

const sortedPair = (a: number, b: number) => (a < b ? `${a}/${b}` : `${b}/${a}`);

function cutCornerKey(
  sourceVertices: Uint32Array,
  sourceMask: number,
  carrierVertices: Uint32Array,
  weights: Float64Array,
) {
  if (sourceMask < 1 || sourceMask > 7)
    throw new RangeError('Cut corner has invalid source support.');
  const activeCarrier = carrierVertices.filter((_, i) => weights[i] > 0);
  if (activeCarrier.length === 1) return `carrier/${activeCarrier[0]}`;
  const activeSource = sourceVertices.filter((_, i) => (sourceMask & (1 << i)) !== 0);
  if (activeSource.length === 1) return `source/${activeSource[0]}`;
  if (activeSource.length === 2 && activeCarrier.length === 2)
    return `crossing/${sortedPair(activeSource[0], activeSource[1])}/${sortedPair(activeCarrier[0], activeCarrier[1])}`;
  throw new RangeError('Cut corner has no supported vertex or edge provenance.');
}

type CutSurfaceDrawRange = Readonly<{
  pieceId: string;
  triangleOffset: number;
  triangleCount: number;
}>;

/** Capture the cut surface once in the same carrier-face order the material compiler used. */
export function prepareSourceCutSurfaceProjectionV1(
  material: SourceCutCarrierMaterialPackV1,
  maxSurfaceTriangles: number,
) {
  const { base, pieces } = material;
  const { particleCount, triangleCount } = base.manifest;
  const packedFaces = new DataView(base.triangleIndices);
  const { strideBytes, offsets } = TRIANGLE_INDICES_GPU_V1;
  if (packedFaces.byteLength !== triangleCount * strideBytes)
    throw new RangeError('Cut surface and carrier face records must have the same topology.');
  if (
    !Number.isSafeInteger(maxSurfaceTriangles) ||
    maxSurfaceTriangles < 1 ||
    maxSurfaceTriangles > SOURCE_CUT_MASS_TRANSFER_LIMITS_V1.maxSurfaceTriangles
  )
    throw new RangeError('Cut surface projection requires an explicit triangle budget.');

  let surfaceLength = 0;
  const drawRanges: CutSurfaceDrawRange[] = [];
  for (const piece of pieces) {
    const count = piece.surface?.carrierTriangleIndices.length;
    if (
      !piece.surface ||
      !count ||
      piece.surface.cornerWeights.length !== count * 9 ||
      piece.surface.sourceTriangleIndices.length !== count ||
      piece.surface.sourceCornerSupportMasks.length !== 3 * count ||
      piece.surface.sourceTriangleVertices.length % 3 !== 0
    )
      throw new RangeError(`Cut surface is incomplete for ${piece.pieceId}.`);
    drawRanges.push(
      Object.freeze({
        pieceId: piece.pieceId,
        triangleOffset: surfaceLength,
        triangleCount: count,
      }),
    );
    surfaceLength += count;
    if (surfaceLength > maxSurfaceTriangles)
      throw new RangeError('Cut surface projection exceeds its triangle budget.');
  }
  if (surfaceLength === 0) throw new RangeError('Cut surface projection is empty.');

  const particleOffsets = new Uint32Array(3 * surfaceLength);
  const cornerWeights = new Float64Array(9 * surfaceLength);
  const representatives = new Uint32Array(3 * surfaceLength);
  const stencilOffsets = (corner: number) => {
    const first = corner - (corner % 3);
    return particleOffsets.subarray(first, first + 3);
  };
  const stencilWeights = (corner: number) => cornerWeights.subarray(3 * corner, 3 * corner + 3);
  const assertSameSupport = (first: number, next: number) => {
    const a = stencilOffsets(first),
      b = stencilOffsets(next);
    const aw = stencilWeights(first),
      bw = stencilWeights(next);
    const equivalent = (
      ids: Uint32Array,
      weights: Float64Array,
      other: Uint32Array,
      expected: Float64Array,
    ) =>
      ids.every((id, i) => {
        if (weights[i] === 0) return true;
        const match = other.indexOf(id);
        return match >= 0 && expected[match] > 0 && Math.abs(weights[i] - expected[match]) <= 1e-12;
      });
    // Matching original indices must agree as a material stencil before sharing one evaluation.
    if (!equivalent(a, aw, b, bw) || !equivalent(b, bw, a, aw))
      throw new RangeError('Joined cut corners have different material supports.');
  };

  for (const [pieceIndex, piece] of pieces.entries()) {
    const surface = piece.surface!;
    const range = drawRanges[pieceIndex]!;
    const knownCorners = new Map<string, number>();
    for (const [triangle, localCarrierIndex] of surface.carrierTriangleIndices.entries()) {
      const carrierIndex = piece.carrierTriangleOffset + localCarrierIndex;
      if (localCarrierIndex >= piece.carrierTriangleCount || carrierIndex >= triangleCount)
        throw new RangeError(`Cut surface face leaves its carrier piece ${piece.pieceId}.`);
      const face = carrierIndex * strideBytes;
      const outputTriangle = range.triangleOffset + triangle;
      const sourceIndex = surface.sourceTriangleIndices[triangle] * 3;
      if (sourceIndex + 2 >= surface.sourceTriangleVertices.length)
        throw new RangeError('Cut fragment references an unavailable source triangle.');
      const sourceVertices = surface.sourceTriangleVertices.subarray(sourceIndex, sourceIndex + 3);
      for (const [vertex, offset] of [
        offsets.vertex0,
        offsets.vertex1,
        offsets.vertex2,
      ].entries()) {
        const particle = packedFaces.getUint32(face + offset, true);
        if (particle >= particleCount) throw new RangeError('Cut surface has an invalid particle.');
        particleOffsets[3 * outputTriangle + vertex] = particle * 4;
      }
      for (let corner = 0; corner < 3; corner++) {
        const from = 9 * triangle + 3 * corner;
        const weights = surface.cornerWeights.subarray(from, from + 3);
        if (
          weights.some((w) => !Number.isFinite(w) || w < 0 || w > 1) ||
          Math.abs(weights[0] + weights[1] + weights[2] - 1) > 4 * Number.EPSILON
        )
          throw new RangeError('Cut surface has an invalid affine stencil.');
        const outputCorner = 3 * outputTriangle + corner;
        cornerWeights.set(weights, 3 * outputCorner);
        const key = cutCornerKey(
          sourceVertices,
          surface.sourceCornerSupportMasks[3 * triangle + corner],
          stencilOffsets(outputCorner),
          weights,
        );
        const previous = knownCorners.get(key);
        if (previous !== undefined) assertSameSupport(previous, outputCorner);
        else knownCorners.set(key, outputCorner);
        representatives[outputCorner] = previous ?? outputCorner;
      }
    }
  }

  const cornerRepresentative = (expandedCorner: number) => {
    if (
      !Number.isSafeInteger(expandedCorner) ||
      expandedCorner < 0 ||
      expandedCorner >= representatives.length
    )
      throw new RangeError('Cut corner is outside the prepared surface.');
    return representatives[expandedCorner];
  };
  return Object.freeze({
    drawRanges: Object.freeze(drawRanges),
    cornerRepresentative,
    cornerSupport(expandedCorner: number) {
      const representative = cornerRepresentative(expandedCorner);
      return {
        particleOffsets: stencilOffsets(representative).slice(),
        weights: stencilWeights(representative).slice(),
      };
    },
    /** Return non-indexed vec3 positions suitable for the existing triangle draw path. */
    project(currentPositionsMInvMass: Float32Array): Float32Array {
      if (
        currentPositionsMInvMass.length !== particleCount * 4 ||
        !currentPositionsMInvMass.every(Number.isFinite)
      )
        throw new RangeError('Cut surface requires one finite current state per carrier particle.');
      const projected = new Float32Array(surfaceLength * 9);
      for (const [corner, representative] of representatives.entries()) {
        const offset = 3 * corner;
        if (representative !== corner) {
          projected.copyWithin(offset, 3 * representative, 3 * representative + 3);
          continue;
        }
        const carrier = corner - (corner % 3);
        const a = particleOffsets[carrier];
        const b = particleOffsets[carrier + 1];
        const c = particleOffsets[carrier + 2];
        const v = cornerWeights[offset + 1];
        const w = cornerWeights[offset + 2];
        for (let axis = 0; axis < 3; axis++) {
          const origin = currentPositionsMInvMass[a + axis];
          projected[offset + axis] =
            origin +
            v * (currentPositionsMInvMass[b + axis] - origin) +
            w * (currentPositionsMInvMass[c + axis] - origin);
        }
      }
      if (!projected.every(Number.isFinite))
        throw new RangeError('A deformed cut surface coordinate is outside f32 range.');
      return projected;
    },
  });
}
