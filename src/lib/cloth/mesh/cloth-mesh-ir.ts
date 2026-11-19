import {
  garmentAssemblyFingerprint,
  type GarmentAssemblyIR,
  type PatternContour,
  type SeamSide,
  type Vec2Mm,
  validateGarmentAssemblyIR,
} from '../domain/garment-assembly-ir';

export const CLOTH_MESH_IR_VERSION = '0.1.0' as const;

export type ClothMeshPieceRange = {
  readonly pieceId: string;
  readonly vertexOffset: number;
  readonly vertexCount: number;
  readonly triangleOffset: number;
  readonly triangleCount: number;
};

export type ClothBoundarySample = {
  readonly vertexIndex: number;
  readonly pieceId: string;
  readonly contourId: string;
  readonly normalizedArc: number;
  readonly sourceCurveId: string;
  readonly sourceCurveT: number;
};

export type ClothSeamMap = {
  readonly seamId: string;
  readonly mapping: 'equal' | 'eased' | 'gathered';
  readonly lengthRatio: number;
  /** Consecutive [sideA vertex, sideB vertex] pairs. */
  readonly vertexPairs: Uint32Array;
};

export type ClothMeshQuality = {
  readonly degenerateTriangles: number;
  readonly minTriangleAngleDegrees: number;
  readonly maxEdgeRatio: number;
  readonly maxBoundaryErrorMm: number;
};

export type ClothMeshIR = {
  readonly schemaVersion: typeof CLOTH_MESH_IR_VERSION;
  readonly sourceAssemblyFingerprint: string;
  readonly sourceUnits: 'mm';
  readonly restPositions2Mm: Float32Array;
  readonly triangles: Uint32Array;
  readonly pieceRanges: readonly ClothMeshPieceRange[];
  readonly boundarySamples: readonly ClothBoundarySample[];
  readonly seams: readonly ClothSeamMap[];
  readonly quality: ClothMeshQuality;
};

export type RectangleFixtureMeshOptions = {
  readonly targetEdgeMm: number;
};

type Rectangle = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
};

type BoundaryVertex = {
  readonly vertexIndex: number;
  readonly normalizedArc: number;
};

function distance(a: Vec2Mm, b: Vec2Mm): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function rectangleFromContour(contour: PatternContour, pieceId: string): Rectangle {
  if (contour.role !== 'shell' || contour.pointsMm.length !== 4) {
    throw new Error(pieceId + ' is not a single four-edge shell rectangle.');
  }
  const xs = contour.pointsMm.map((point) => point[0]);
  const ys = contour.pointsMm.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const corners = new Set([
    minX + ',' + minY,
    maxX + ',' + minY,
    maxX + ',' + maxY,
    minX + ',' + maxY,
  ]);
  if (
    maxX <= minX ||
    maxY <= minY ||
    contour.pointsMm.some((point) => !corners.has(point[0] + ',' + point[1]))
  ) {
    throw new Error(pieceId + ' contour is not an axis-aligned rectangle.');
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function boundaryVertexIndex(
  edge: number,
  step: number,
  xSegments: number,
  ySegments: number,
  vertexOffset: number,
): number {
  if (edge === 0) return vertexOffset + step;
  if (edge === 1) return vertexOffset + step * (xSegments + 1) + xSegments;
  if (edge === 2) return vertexOffset + ySegments * (xSegments + 1) + (xSegments - step);
  return vertexOffset + (ySegments - step) * (xSegments + 1);
}

function seamSideVertices(
  side: SeamSide,
  samples: readonly ClothBoundarySample[],
): readonly BoundaryVertex[] {
  const [from, to] = side.normalizedRange;
  const wraps = from > to;
  const selected = samples
    .filter((sample) => {
      if (sample.pieceId !== side.pieceId || sample.contourId !== side.contourId) return false;
      return wraps
        ? sample.normalizedArc >= from || sample.normalizedArc <= to
        : sample.normalizedArc >= from && sample.normalizedArc <= to;
    })
    .map((sample) => ({
      vertexIndex: sample.vertexIndex,
      normalizedArc:
        wraps && sample.normalizedArc <= to ? sample.normalizedArc + 1 : sample.normalizedArc,
    }))
    .sort((a, b) => a.normalizedArc - b.normalizedArc);

  const unique: BoundaryVertex[] = [];
  const seen = new Set<number>();
  for (const sample of selected) {
    if (seen.has(sample.vertexIndex)) continue;
    seen.add(sample.vertexIndex);
    unique.push(sample);
  }
  if (side.direction === 'reverse') unique.reverse();
  return unique;
}

function angleDegrees(a: number, b: number, opposite: number): number {
  const cosine = Math.max(-1, Math.min(1, (a * a + b * b - opposite * opposite) / (2 * a * b)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function measureClothMeshQuality(
  positions: Float32Array,
  triangles: Uint32Array,
): ClothMeshQuality {
  let degenerateTriangles = 0;
  let minTriangleAngleDegrees = 180;
  let maxEdgeRatio = 1;

  const point = (index: number): Vec2Mm => [positions[index * 2], positions[index * 2 + 1]];
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = point(triangles[offset]);
    const b = point(triangles[offset + 1]);
    const c = point(triangles[offset + 2]);
    const ab = distance(a, b);
    const bc = distance(b, c);
    const ca = distance(c, a);
    const twiceArea = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (twiceArea <= 1e-8 || ab <= 1e-8 || bc <= 1e-8 || ca <= 1e-8) {
      degenerateTriangles += 1;
      continue;
    }
    const edges = [ab, bc, ca].sort((left, right) => left - right);
    maxEdgeRatio = Math.max(maxEdgeRatio, edges[2] / edges[0]);
    minTriangleAngleDegrees = Math.min(
      minTriangleAngleDegrees,
      angleDegrees(ab, ca, bc),
      angleDegrees(ab, bc, ca),
      angleDegrees(bc, ca, ab),
    );
  }

  return {
    degenerateTriangles,
    minTriangleAngleDegrees: minTriangleAngleDegrees === 180 ? 0 : minTriangleAngleDegrees,
    maxEdgeRatio,
    maxBoundaryErrorMm: 0,
  };
}

/**
 * Phase-zero compiler for the rectangle seam fixture only. It proves typed-array ownership,
 * piece ranges, boundary source maps and seam pairing before a general constrained triangulator is
 * selected. Unsupported geometry fails loudly instead of silently falling back.
 */
export function compileRectangleFixtureMesh(
  assembly: GarmentAssemblyIR,
  options: RectangleFixtureMeshOptions,
): ClothMeshIR {
  const assemblyErrors = validateGarmentAssemblyIR(assembly).filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (assemblyErrors.length > 0) {
    throw new Error('GarmentAssemblyIR preflight failed: ' + assemblyErrors[0].message);
  }
  if (!Number.isFinite(options.targetEdgeMm) || options.targetEdgeMm <= 0) {
    throw new RangeError('targetEdgeMm must be finite and greater than zero.');
  }

  const positions: number[] = [];
  const triangles: number[] = [];
  const pieceRanges: ClothMeshPieceRange[] = [];
  const boundarySamples: ClothBoundarySample[] = [];

  for (const piece of assembly.pieces) {
    if (piece.contours.length !== 1) {
      throw new Error(piece.id + ' has holes or multiple contours; rectangle compiler refused it.');
    }
    const contour = piece.contours[0];
    const rectangle = rectangleFromContour(contour, piece.id);
    const xSegments = Math.max(1, Math.ceil(rectangle.width / options.targetEdgeMm));
    const ySegments = Math.max(1, Math.ceil(rectangle.height / options.targetEdgeMm));
    const vertexOffset = positions.length / 2;
    const triangleOffset = triangles.length / 3;

    for (let row = 0; row <= ySegments; row += 1) {
      const y = rectangle.minY + (rectangle.height * row) / ySegments;
      for (let column = 0; column <= xSegments; column += 1) {
        const x = rectangle.minX + (rectangle.width * column) / xSegments;
        positions.push(x, y);
      }
    }

    for (let row = 0; row < ySegments; row += 1) {
      for (let column = 0; column < xSegments; column += 1) {
        const bottomLeft = vertexOffset + row * (xSegments + 1) + column;
        const bottomRight = bottomLeft + 1;
        const topLeft = bottomLeft + xSegments + 1;
        const topRight = topLeft + 1;
        triangles.push(bottomLeft, bottomRight, topLeft, bottomRight, topRight, topLeft);
      }
    }

    const edgeSegments = [xSegments, ySegments, xSegments, ySegments];
    const edgeLengths = contour.pointsMm.map((point, edge) =>
      distance(point, contour.pointsMm[(edge + 1) % contour.pointsMm.length]),
    );
    const perimeter = edgeLengths.reduce((sum, length) => sum + length, 0);
    let prefixLength = 0;
    edgeSegments.forEach((segments, edge) => {
      for (let step = 0; step <= segments; step += 1) {
        const sourceCurveT = step / segments;
        boundarySamples.push({
          vertexIndex: boundaryVertexIndex(edge, step, xSegments, ySegments, vertexOffset),
          pieceId: piece.id,
          contourId: contour.id,
          normalizedArc: (prefixLength + sourceCurveT * edgeLengths[edge]) / perimeter,
          sourceCurveId: contour.sourceCurveIds[edge] ?? 'edge-' + String(edge),
          sourceCurveT,
        });
      }
      prefixLength += edgeLengths[edge];
    });

    pieceRanges.push({
      pieceId: piece.id,
      vertexOffset,
      vertexCount: (xSegments + 1) * (ySegments + 1),
      triangleOffset,
      triangleCount: xSegments * ySegments * 2,
    });
  }

  const seamMaps: ClothSeamMap[] = assembly.seams.map((seam) => {
    const sideA = seamSideVertices(seam.sides[0], boundarySamples);
    const sideB = seamSideVertices(seam.sides[1], boundarySamples);
    if (sideA.length < 2 || sideB.length < 2) {
      throw new Error(seam.id + ' resolved to fewer than two boundary vertices.');
    }
    if (sideA.length !== sideB.length) {
      throw new Error(
        seam.id +
          ' requires resampling: side counts are ' +
          sideA.length +
          ' and ' +
          sideB.length +
          '.',
      );
    }
    const vertexPairs = new Uint32Array(sideA.length * 2);
    for (let index = 0; index < sideA.length; index += 1) {
      vertexPairs[index * 2] = sideA[index].vertexIndex;
      vertexPairs[index * 2 + 1] = sideB[index].vertexIndex;
    }
    return {
      seamId: seam.id,
      mapping: seam.mapping,
      lengthRatio: seam.lengthRatio,
      vertexPairs,
    };
  });

  const restPositions2Mm = new Float32Array(positions);
  const triangleBuffer = new Uint32Array(triangles);
  return {
    schemaVersion: CLOTH_MESH_IR_VERSION,
    sourceAssemblyFingerprint: garmentAssemblyFingerprint(assembly),
    sourceUnits: 'mm',
    restPositions2Mm,
    triangles: triangleBuffer,
    pieceRanges,
    boundarySamples,
    seams: seamMaps,
    quality: measureClothMeshQuality(restPositions2Mm, triangleBuffer),
  };
}

export function validateClothMeshIR(mesh: ClothMeshIR): readonly string[] {
  const errors: string[] = [];
  const vertexCount = mesh.restPositions2Mm.length / 2;
  if (!Number.isInteger(vertexCount)) errors.push('restPositions2Mm must contain vec2 values.');
  if (mesh.triangles.length % 3 !== 0) errors.push('triangles must contain index triples.');
  if ([...mesh.triangles].some((index) => index >= vertexCount)) {
    errors.push('triangle index is outside the vertex buffer.');
  }
  if (mesh.quality.degenerateTriangles > 0) errors.push('mesh contains degenerate triangles.');
  for (const seam of mesh.seams) {
    if (seam.vertexPairs.length % 2 !== 0) errors.push(seam.seamId + ' has an incomplete pair.');
    if ([...seam.vertexPairs].some((index) => index >= vertexCount)) {
      errors.push(seam.seamId + ' references a vertex outside the mesh.');
    }
  }
  return errors;
}
