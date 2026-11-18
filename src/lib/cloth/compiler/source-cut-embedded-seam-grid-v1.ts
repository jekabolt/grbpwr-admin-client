import {
  buildDxfExactNativeCrossRowSeamGridV1,
  buildDxfExactNativeEasedSeamGridV1,
  buildDxfExactNativeSeamGridV1,
  DXF_EXACT_NATIVE_CROSS_ROW_SEAM_GRID_V1,
  DXF_EXACT_NATIVE_EASED_SEAM_GRID_V1,
  type DxfExactNativeCrossRowSeamGridRequestV1,
  type DxfExactNativeEasedSeamGridRequestV1,
  type DxfExactNativeSeamGridRequestV1,
} from '../domain/dxf-exact-native-seam-grid-v1';
import type { Vec2Mm } from '../domain/garment-assembly-ir';
import type { ClothMeshIR } from '../mesh/cloth-mesh-ir';
import {
  locateSeamPointEmbeddingV1,
  seamSegmentIsCoveredByMeshV1,
} from '../mesh/triangulation/seam-point-embedding-v1';
import type { SourceCutMassTransferMeshV1 } from '../mesh/triangulation/source-cut-mass-transfer-v1';

interface NativeCutSeamSideBindingV1 {
  readonly spanPieceId: string;
  readonly spanContourId: string;
  readonly sourceSha256: string;
  readonly patternLineKey?: string;
  readonly carrierPieceId: string;
  readonly cut: SourceCutMassTransferMeshV1;
}

type CarrierMesh = Pick<ClothMeshIR, 'restPositions2Mm' | 'triangles' | 'pieceRanges'>;

/** Snapshots one material piece for exact point and continuous segment coverage tests. */
export function prepareSourceCutSeamEmbeddingV1(
  carrierMesh: CarrierMesh,
  carrierPieceId: string,
  cut: SourceCutMassTransferMeshV1,
  maxTriangleTests: number,
) {
  const matching = carrierMesh.pieceRanges.filter(({ pieceId }) => pieceId === carrierPieceId);
  if (matching.length !== 1) throw new RangeError('A seam side requires one exact carrier piece.');
  const { vertexOffset, vertexCount, triangleOffset, triangleCount } = matching[0];
  if (
    !Number.isSafeInteger(maxTriangleTests) ||
    ![vertexOffset, vertexCount, triangleOffset, triangleCount].every(Number.isSafeInteger) ||
    vertexOffset < 0 ||
    vertexCount < 3 ||
    triangleOffset < 0 ||
    triangleCount < 1 ||
    vertexOffset + vertexCount > carrierMesh.restPositions2Mm.length / 2 ||
    triangleOffset + triangleCount > carrierMesh.triangles.length / 3 ||
    cut.triangles.length < 3 ||
    cut.triangles.length % 3 !== 0 ||
    triangleCount + cut.triangles.length / 3 > maxTriangleTests
  )
    throw new RangeError('Seam carrier or cut ranges are outside the input bounds.');
  const carrierVertices: Vec2Mm[] = Array.from({ length: vertexCount }, (_, i) => {
    const offset = (vertexOffset + i) * 2;
    return [carrierMesh.restPositions2Mm[offset], carrierMesh.restPositions2Mm[offset + 1]];
  });
  const carrierTriangles = carrierMesh.triangles
    .slice(triangleOffset * 3, (triangleOffset + triangleCount) * 3)
    .map((index) => {
      if (index < vertexOffset || index >= vertexOffset + vertexCount)
        throw new RangeError('A seam carrier face crosses a piece boundary.');
      return index - vertexOffset;
    });
  const cutVertices: Vec2Mm[] = cut.verticesMm.map(([x, y]) => [x, y]);
  const cutTriangles = cut.triangles.slice();
  const triangleTests = (sampleCount: number) =>
    (sampleCount * carrierTriangles.length + (sampleCount * 2 - 1) * cutTriangles.length) / 3;
  return {
    triangleTests,
    embed(samples: readonly Readonly<{ positionMm: Vec2Mm }>[], signal?: AbortSignal) {
      const tests = triangleTests(samples.length);
      if (!samples.length || !Number.isSafeInteger(tests) || tests > maxTriangleTests)
        throw new RangeError('Embedding the native seam samples exceeds its triangle test budget.');
      return samples.map(({ positionMm }, index) => {
        if (signal?.aborted) throw new Error('Native seam embedding cancelled.');
        if (!locateSeamPointEmbeddingV1(cutVertices, cutTriangles, positionMm))
          throw new RangeError(
            `Native seam sample is outside the cut material on ${carrierPieceId}.`,
          );
        if (
          index > 0 &&
          !seamSegmentIsCoveredByMeshV1(
            cutVertices,
            cutTriangles,
            samples[index - 1].positionMm,
            positionMm,
          )
        )
          throw new RangeError(`Native seam crosses uncovered cut material on ${carrierPieceId}.`);
        const point = locateSeamPointEmbeddingV1(carrierVertices, carrierTriangles, positionMm);
        if (!point)
          throw new RangeError(`Native seam sample has no carrier face on ${carrierPieceId}.`);
        const [a, b, c] = point.vertexIndices;
        return {
          triangleIndex: triangleOffset + point.triangleIndex,
          vertexIndices: [a + vertexOffset, b + vertexOffset, c + vertexOffset] as const,
          weights: point.weights,
        };
      });
    },
  };
}

/** Replays the source grid and embeds both material locations of every stitch row. */
export async function compileSourceCutEmbeddedSeamGridV1(
  input: Readonly<{
    grid:
      | DxfExactNativeSeamGridRequestV1
      | DxfExactNativeEasedSeamGridRequestV1
      | DxfExactNativeCrossRowSeamGridRequestV1;
    expectedGridSha256: string;
    operationOrder: number;
    carrierMesh: CarrierMesh;
    bindings: readonly [NativeCutSeamSideBindingV1, NativeCutSeamSideBindingV1];
    maxTriangleTests: number;
  }>,
  signal?: AbortSignal,
) {
  const { grid, expectedGridSha256, operationOrder, carrierMesh, bindings, maxTriangleTests } =
    input;
  if (
    !Number.isSafeInteger(operationOrder) ||
    operationOrder < 0 ||
    !Number.isSafeInteger(maxTriangleTests) ||
    maxTriangleTests < 1 ||
    !/^[a-f0-9]{64}$/.test(expectedGridSha256)
  )
    throw new RangeError(
      'The seam grid requires a fixed source digest, operation and triangle budget.',
    );

  const captured = bindings.map(({ cut, ...binding }) => ({
    ...binding,
    embedding: prepareSourceCutSeamEmbeddingV1(
      carrierMesh,
      binding.carrierPieceId,
      cut,
      maxTriangleTests,
    ),
  }));
  const result =
    grid.schemaVersion === DXF_EXACT_NATIVE_CROSS_ROW_SEAM_GRID_V1
      ? await buildDxfExactNativeCrossRowSeamGridV1(grid, signal)
      : grid.schemaVersion === DXF_EXACT_NATIVE_EASED_SEAM_GRID_V1
        ? await buildDxfExactNativeEasedSeamGridV1(grid, signal)
        : await buildDxfExactNativeSeamGridV1(grid, signal);
  if (!result.ok)
    throw new RangeError(
      result.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('\n'),
    );

  const witness = result.witness;
  if (witness.canonicalSha256 !== expectedGridSha256)
    throw new RangeError('The exact native seam sample grid differs from the bound grid.');
  const sampleCount = witness.sides[0].samples.length;
  const triangleTests = captured.reduce(
    (sum, side) => sum + side.embedding.triangleTests(sampleCount),
    0,
  );
  if (!Number.isSafeInteger(triangleTests) || triangleTests > maxTriangleTests)
    throw new RangeError('Embedding the native seam grid exceeds its triangle test budget.');
  const embed = (index: 0 | 1) => {
    const binding = captured[index];
    const { span, samples } = witness.sides[index];
    if (
      span.pieceId !== binding.spanPieceId ||
      span.contourId !== binding.spanContourId ||
      span.source.sourceSha256 !== binding.sourceSha256 ||
      (witness.schemaVersion === DXF_EXACT_NATIVE_CROSS_ROW_SEAM_GRID_V1 &&
        (witness.rows[index].patternLineKey !== binding.patternLineKey ||
          witness.rows[index].pieceLineKey !== binding.carrierPieceId)) ||
      samples.length !== sampleCount
    )
      throw new RangeError('Native seam source identity differs from its cut binding.');
    return binding.embedding.embed(samples, signal);
  };
  const a = embed(0);
  const b = embed(1);
  return {
    witness,
    triangleTests,
    pairs: a.map((sideA, sourcePairIndex) => ({
      operationOrder,
      seamId: witness.seamId,
      sourcePairIndex,
      sideA,
      sideB: b[sourcePairIndex],
    })),
  };
}
