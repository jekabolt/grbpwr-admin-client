import type { MaterialAssignment, Vec2Mm } from '../domain/garment-assembly-ir';
import type { ClothMaterialV1 } from '../material/cloth-material-v1';
import type { ClothMeshIR } from '../mesh/cloth-mesh-ir';
import {
  type SourceCutMassTransferMeshV1,
  type SourceCutMassTransferTolerancesV1,
  type SourceCutSurfaceV1,
  transferSourceCutMassV1,
} from '../mesh/triangulation/source-cut-mass-transfer-v1';
import {
  compileMaterialPackageV1,
  type CompileMaterialPackageOptions,
  type CompiledMaterialPackageV1,
  decodeClothMaterialGpuV1,
  type MaterialPieceGrain,
  PARTICLE_MASS_GPU_V1,
  TRIANGLE_REST_FRAME_GPU_V1,
} from './material-package';

export const SOURCE_CUT_CARRIER_MATERIAL_V1 = 'source-cut-carrier-material/1' as const;
export const SOURCE_CUT_ACTIVE_REST_AREA_OFFSET_BYTES_V1 =
  TRIANGLE_REST_FRAME_GPU_V1.offsets.reserved0;

type SourceCutPieceV1 = Readonly<{
  cut: SourceCutMassTransferMeshV1;
  maxSurfaceTriangles?: number;
  /** Registered by the caller in the host's cut plane. Mass only, with no separate particles. */
  bondedInterfacing?: Readonly<{
    cut: SourceCutMassTransferMeshV1;
    arealDensityKgM2: number;
  }>;
}>;

type SourceCutMaterialPieceV1 = Readonly<{
  pieceId: string;
  areaM2: number;
  massKg: number;
  carrierTriangleOffset: number;
  carrierTriangleCount: number;
  surface: SourceCutSurfaceV1 | null;
  bondedInterfacing: Readonly<{ areaM2: number; addedMassKg: number }> | null;
}>;

export type SourceCutCarrierMaterialPackV1 = Readonly<{
  version: typeof SOURCE_CUT_CARRIER_MATERIAL_V1;
  base: CompiledMaterialPackageV1;
  /** Uses cut continuum field at byte 24, in original carrier-face order. */
  cutTriangleRestFrames: ArrayBuffer;
  cutParticleMassRecords: ArrayBuffer;
  pieces: readonly SourceCutMaterialPieceV1[];
}>;

/** Compile occupied areas and masses against the same carrier bytes used by the material compiler. */
export function compileSourceCutCarrierMaterialV1(
  mesh: ClothMeshIR,
  pieceGrains: readonly MaterialPieceGrain[],
  assignments: readonly MaterialAssignment[],
  materials: readonly ClothMaterialV1[],
  options: CompileMaterialPackageOptions,
  cutSourceByPiece: ReadonlyMap<string, SourceCutPieceV1>,
  tolerances: SourceCutMassTransferTolerancesV1,
): SourceCutCarrierMaterialPackV1 {
  const compiled = compileMaterialPackageV1(mesh, pieceGrains, assignments, materials, options);
  if (!compiled.ok)
    throw new RangeError(compiled.diagnostics.map(({ message }) => message).join(' '));
  if (cutSourceByPiece.size !== mesh.pieceRanges.length)
    throw new RangeError('Cut partitions must cover every carrier piece exactly.');

  const base = compiled.materialPackage;
  const cutTriangleRestFrames = base.triangleRestFrames.slice(0);
  const frameView = new DataView(cutTriangleRestFrames);
  const materialIndices = new DataView(base.triangleMaterialIndices);
  const cutParticleMassRecords = new ArrayBuffer(
    base.manifest.particleCount * PARTICLE_MASS_GPU_V1.strideBytes,
  );
  const massView = new DataView(cutParticleMassRecords);
  const pieces: SourceCutMaterialPieceV1[] = [];
  for (const piece of mesh.pieceRanges) {
    const { pieceId, vertexOffset, vertexCount, triangleOffset, triangleCount } = piece;
    const source = cutSourceByPiece.get(pieceId);
    if (!source) throw new RangeError(`Cut partition missing for ${pieceId}.`);
    const carrier = {
      verticesMm: Array.from({ length: vertexCount }, (_, vertex): Vec2Mm => {
        const offset = (vertexOffset + vertex) * 2;
        return [mesh.restPositions2Mm[offset], mesh.restPositions2Mm[offset + 1]];
      }),
      triangles: mesh.triangles
        .slice(triangleOffset * 3, (triangleOffset + triangleCount) * 3)
        .map((vertex) => vertex - vertexOffset),
    };
    const transfer = transferSourceCutMassV1({
      source: source.cut,
      carrier,
      tolerances,
      maxSurfaceTriangles: source.maxSurfaceTriangles,
    });
    if (!transfer.ok)
      throw new RangeError(
        `${pieceId}: ${transfer.diagnostic.code}. ${transfer.diagnostic.detail}`,
      );
    const densityKgM2 = decodeClothMaterialGpuV1(
      base.materialRecords,
      materialIndices.getUint32(triangleOffset * 4, true),
    ).arealDensityKgM2;
    const layer = source.bondedInterfacing;
    const interfaceDensityKgM2 = layer?.arealDensityKgM2 ?? 0;
    if (layer && (!Number.isFinite(interfaceDensityKgM2) || interfaceDensityKgM2 <= 0))
      throw new RangeError(`Invalid bonded interfacing density for ${pieceId}.`);
    const interfaceTransfer = layer
      ? transferSourceCutMassV1({ source: layer.cut, carrier, tolerances })
      : null;
    if (interfaceTransfer && !interfaceTransfer.ok)
      throw new RangeError(
        `${pieceId} interfacing: ${interfaceTransfer.diagnostic.code}. ${interfaceTransfer.diagnostic.detail}`,
      );

    for (const [index, areaMm2] of transfer.carrierActiveAreaMm2.entries()) {
      const frame = (triangleOffset + index) * TRIANGLE_REST_FRAME_GPU_V1.strideBytes;
      const restAreaM2 = frameView.getFloat32(
        frame + TRIANGLE_REST_FRAME_GPU_V1.offsets.restAreaM2,
        true,
      );
      const activeAreaM2 = Math.fround(areaMm2 * 1e-6);
      if (!(activeAreaM2 > 0) || !Number.isFinite(activeAreaM2) || activeAreaM2 > restAreaM2)
        throw new RangeError(`Unrepresentable active area in ${pieceId}, triangle ${index}.`);
      frameView.setFloat32(frame + SOURCE_CUT_ACTIVE_REST_AREA_OFFSET_BYTES_V1, activeAreaM2, true);
    }
    for (const [index, nodalAreaMm2] of transfer.carrierVertexAreaMm2.entries()) {
      const baseMassKg = nodalAreaMm2 * 1e-6 * densityKgM2;
      const layerAreaMm2 = interfaceTransfer?.carrierVertexAreaMm2[index] ?? 0;
      const massKg = Math.fround(baseMassKg + layerAreaMm2 * 1e-6 * interfaceDensityKgM2);
      const inverseMassKgInv = Math.fround(1 / massKg);
      if (!(massKg > 0) || !Number.isFinite(massKg) || !Number.isFinite(inverseMassKgInv))
        throw new RangeError(`Unrepresentable active mass in ${pieceId}, particle ${index}.`);
      const baseOffset = (vertexOffset + index) * PARTICLE_MASS_GPU_V1.strideBytes;
      massView.setFloat32(baseOffset + PARTICLE_MASS_GPU_V1.offsets.massKg, massKg, true);
      massView.setFloat32(
        baseOffset + PARTICLE_MASS_GPU_V1.offsets.inverseMassKgInv,
        inverseMassKgInv,
        true,
      );
    }
    const areaM2 = transfer.sourceAreaMm2 * 1e-6;
    const interfaceAreaM2 = (interfaceTransfer?.sourceAreaMm2 ?? 0) * 1e-6;
    const addedMassKg = interfaceAreaM2 * interfaceDensityKgM2;
    pieces.push({
      pieceId,
      areaM2,
      massKg: areaM2 * densityKgM2 + addedMassKg,
      carrierTriangleOffset: triangleOffset,
      carrierTriangleCount: triangleCount,
      surface: transfer.surface,
      bondedInterfacing: interfaceTransfer ? { areaM2: interfaceAreaM2, addedMassKg } : null,
    });
  }
  return {
    version: SOURCE_CUT_CARRIER_MATERIAL_V1,
    base,
    cutTriangleRestFrames,
    cutParticleMassRecords,
    pieces,
  };
}
