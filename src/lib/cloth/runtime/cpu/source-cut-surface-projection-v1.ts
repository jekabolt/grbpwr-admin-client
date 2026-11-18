import { TRIANGLE_INDICES_GPU_V1 } from '../../compiler/material-package';
import type { SourceCutCarrierMaterialPackV1 } from '../../compiler/source-cut-carrier-material-v1';
import { SOURCE_CUT_MASS_TRANSFER_LIMITS_V1 } from '../../mesh/triangulation/source-cut-mass-transfer-v1';

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
      piece.surface.sourceTriangleIndices.length !== count
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
  for (const [pieceIndex, piece] of pieces.entries()) {
    const surface = piece.surface!;
    const range = drawRanges[pieceIndex]!;
    for (const [triangle, localCarrierIndex] of surface.carrierTriangleIndices.entries()) {
      const carrierIndex = piece.carrierTriangleOffset + localCarrierIndex;
      if (localCarrierIndex >= piece.carrierTriangleCount || carrierIndex >= triangleCount)
        throw new RangeError(`Cut surface face leaves its carrier piece ${piece.pieceId}.`);
      const face = carrierIndex * strideBytes;
      const outputTriangle = range.triangleOffset + triangle;
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
        cornerWeights.set(weights, 9 * outputTriangle + 3 * corner);
      }
    }
  }

  return Object.freeze({
    drawRanges: Object.freeze(drawRanges),
    cornerSupport(expandedCorner: number) {
      if (
        !Number.isSafeInteger(expandedCorner) ||
        expandedCorner < 0 ||
        expandedCorner >= particleOffsets.length
      )
        throw new RangeError('Cut corner is outside the prepared surface.');
      const triangleOffset = expandedCorner - (expandedCorner % 3);
      return {
        particleOffsets: particleOffsets.slice(triangleOffset, triangleOffset + 3),
        weights: cornerWeights.slice(3 * expandedCorner, 3 * expandedCorner + 3),
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
      for (let triangle = 0; triangle < surfaceLength; triangle++) {
        const a = particleOffsets[3 * triangle];
        const b = particleOffsets[3 * triangle + 1];
        const c = particleOffsets[3 * triangle + 2];
        for (let corner = 0; corner < 3; corner++) {
          const offset = 9 * triangle + 3 * corner;
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
      }
      if (!projected.every(Number.isFinite))
        throw new RangeError('A deformed cut surface coordinate is outside f32 range.');
      return projected;
    },
  });
}
