import {
  decodeTriangleRestFrameGpuV1,
  TRIANGLE_INDICES_GPU_V1,
  TRIANGLE_REST_FRAME_GPU_V1,
} from '../../compiler/material-package';
import {
  SOURCE_CUT_CARRIER_MATERIAL_V1,
  type SourceCutCarrierMaterialPackV1,
} from '../../compiler/source-cut-carrier-material-v1';
import { SOURCE_CUT_MASS_TRANSFER_LIMITS_V1 } from '../../mesh/triangulation/source-cut-mass-transfer-v1';
import { continuumStrainRestAreaToleranceM2 } from './triangle-strain-continuum-vnext';
import {
  evaluateTriangleStrain,
  type TriangleRestFrame,
  type Vec3,
} from './triangle-strain-oracle';

type CarrierFace = Readonly<{
  particleOffsets: readonly [number, number, number];
  rest: TriangleRestFrame;
}>;

export type SourceCutPrincipalStrainV1 = Readonly<{
  /** Signed, dimensionless maximum principal engineering strain for each drawn cut triangle. */
  valuesInDrawOrder: Float32Array;
  summary: Readonly<{
    minimum: number;
    maximum: number;
    triangleCount: number;
    carrierFaceCount: number;
  }>;
}>;

/** Capture the same carrier faces and cut triangle order as the source-cut draw projection. */
export function prepareSourceCutPrincipalStrainV1(
  material: SourceCutCarrierMaterialPackV1,
  maxSurfaceTriangles: number,
) {
  const { base, pieces, cutTriangleRestFrames } = material;
  const { triangleCount, particleCount } = base.manifest;
  const { strideBytes, offsets } = TRIANGLE_INDICES_GPU_V1;
  if (
    material.version !== SOURCE_CUT_CARRIER_MATERIAL_V1 ||
    !Number.isSafeInteger(triangleCount) ||
    triangleCount < 1 ||
    !Number.isSafeInteger(particleCount) ||
    !Number.isSafeInteger(particleCount * 4) ||
    particleCount < 3 ||
    base.triangleIndices.byteLength !== triangleCount * strideBytes ||
    cutTriangleRestFrames.byteLength !== triangleCount * TRIANGLE_REST_FRAME_GPU_V1.strideBytes
  )
    throw new RangeError('Principal strain requires matching carrier topology and rest frames.');
  if (
    !Number.isSafeInteger(maxSurfaceTriangles) ||
    maxSurfaceTriangles < 1 ||
    maxSurfaceTriangles > SOURCE_CUT_MASS_TRANSFER_LIMITS_V1.maxSurfaceTriangles
  )
    throw new RangeError('Principal strain requires a valid cut triangle budget.');

  let carrierEnd = 0;
  for (const piece of [...pieces].sort(
    (a, b) => a.carrierTriangleOffset - b.carrierTriangleOffset,
  )) {
    if (
      piece.carrierTriangleOffset !== carrierEnd ||
      !Number.isSafeInteger(piece.carrierTriangleCount) ||
      piece.carrierTriangleCount < 1 ||
      piece.carrierTriangleCount > triangleCount - carrierEnd
    )
      throw new RangeError('Principal strain carrier piece ranges overlap or leave gaps.');
    carrierEnd += piece.carrierTriangleCount;
  }
  if (
    carrierEnd !== triangleCount ||
    new Set(pieces.map(({ pieceId }) => pieceId)).size !== pieces.length
  )
    throw new RangeError('Principal strain requires complete, unique carrier piece ranges.');

  const indices = new DataView(base.triangleIndices);
  const carrierSlots = new Map<number, number>();
  const carrierFaces: CarrierFace[] = [];
  const drawSlots: number[] = [];
  for (const { pieceId, surface, carrierTriangleOffset, carrierTriangleCount } of pieces) {
    const sourceFaces = surface?.carrierTriangleIndices;
    if (!(sourceFaces instanceof Uint32Array) || sourceFaces.length === 0)
      throw new RangeError(`Principal strain has no cut faces for ${pieceId}.`);
    if (drawSlots.length + sourceFaces.length > maxSurfaceTriangles)
      throw new RangeError('Principal strain exceeds its cut triangle budget.');
    for (const localFace of sourceFaces) {
      if (localFace >= carrierTriangleCount)
        throw new RangeError(`Cut face leaves its carrier piece ${pieceId}.`);
      const carrierFace = carrierTriangleOffset + localFace;
      let slot = carrierSlots.get(carrierFace);
      if (slot === undefined) {
        const offset = carrierFace * strideBytes;
        const particles = [
          indices.getUint32(offset + offsets.vertex0, true),
          indices.getUint32(offset + offsets.vertex1, true),
          indices.getUint32(offset + offsets.vertex2, true),
        ] as const;
        const [a, b, c] = particles;
        if (
          a >= particleCount ||
          b >= particleCount ||
          c >= particleCount ||
          a === b ||
          b === c ||
          a === c
        )
          throw new RangeError('Principal strain carrier face has invalid particles.');
        const rest = decodeTriangleRestFrameGpuV1(cutTriangleRestFrames, carrierFace);
        const [m00, m01, m10, m11] = rest.inverseRestMatrixInvM;
        const areaFromInverseM2 = 0.5 / Math.abs(m00 * m11 - m01 * m10);
        if (
          !Number.isFinite(areaFromInverseM2) ||
          !Number.isFinite(rest.restAreaM2) ||
          rest.restAreaM2 <= 0 ||
          Math.abs(rest.restAreaM2 - areaFromInverseM2) >
            continuumStrainRestAreaToleranceM2(rest.restAreaM2, areaFromInverseM2)
        )
          throw new RangeError('Principal strain carrier rest frame is invalid.');
        slot = carrierFaces.length;
        carrierSlots.set(carrierFace, slot);
        carrierFaces.push({
          particleOffsets: [a * 4, b * 4, c * 4],
          // The packed inverse is already expressed in the material frame.
          rest: { ...rest, warpDirectionRest: [1, 0], weftDirectionRest: [0, 1] },
        });
      }
      drawSlots.push(slot);
    }
  }
  const drawCarrierSlots = Uint32Array.from(drawSlots);

  return Object.freeze({
    evaluate(positionsMInvMass: Float32Array): SourceCutPrincipalStrainV1 {
      if (
        !(positionsMInvMass instanceof Float32Array) ||
        positionsMInvMass.length !== particleCount * 4 ||
        !positionsMInvMass.every(Number.isFinite)
      )
        throw new RangeError(
          'Principal strain requires one finite current state per carrier particle.',
        );
      const point = (offset: number): Vec3 => [
        positionsMInvMass[offset],
        positionsMInvMass[offset + 1],
        positionsMInvMass[offset + 2],
      ];
      const valuesByCarrier = new Float32Array(carrierFaces.length);
      let minimum = Infinity;
      let maximum = -Infinity;
      for (const [
        index,
        {
          particleOffsets: [a, b, c],
          rest,
        },
      ] of carrierFaces.entries()) {
        const { warp, weft, shear } = evaluateTriangleStrain([point(a), point(b), point(c)], rest);
        // FᵀF = [[1 + 2Ewarp, shear], [shear, 1 + 2Eweft]].
        const lambdaMax = 1 + warp + weft + Math.hypot(warp - weft, shear);
        const strain = Math.fround(Math.sqrt(lambdaMax) - 1);
        if (!Number.isFinite(strain))
          throw new RangeError('Principal strain is outside the finite f32 range.');
        valuesByCarrier[index] = strain;
        minimum = Math.min(minimum, strain);
        maximum = Math.max(maximum, strain);
      }
      const valuesInDrawOrder = Float32Array.from(
        drawCarrierSlots,
        (slot) => valuesByCarrier[slot],
      );
      return Object.freeze({
        valuesInDrawOrder,
        summary: Object.freeze({
          minimum,
          maximum,
          triangleCount: valuesInDrawOrder.length,
          carrierFaceCount: carrierFaces.length,
        }),
      });
    },
  });
}
