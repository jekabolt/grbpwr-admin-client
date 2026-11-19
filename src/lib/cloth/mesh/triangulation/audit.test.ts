import { describe, expect, it } from 'vitest';
import type { Vec2Mm } from '../../domain/garment-assembly-ir';
import { preflightTriangulationInput } from './audit';
import { createCdt2dConstrainedTriangulatorV1 } from './cdt2d-adapter-v1';
import type { ConstrainedTriangulationInput } from './types';

function boundaryInput(positions: readonly Vec2Mm[]): ConstrainedTriangulationInput {
  return {
    pieceId: 'flap',
    shell: {
      id: 'native-shell',
      role: 'shell',
      vertices: positions.map((positionMm, i) => ({
        id: `native-vertex-${i}`,
        positionMm,
        source: {
          contourId: 'native-shell',
          sourceCurveId: `native-line-${i}`,
          sourceCurveParameterSpace: 'unit',
          sourceCurveT: 0,
          normalizedArc: i / positions.length,
        },
      })),
    },
    holes: [],
    seamEndpoints: [{ id: 'required-corner', boundaryVertexId: 'native-vertex-0' }],
    grainDegrees: 90,
    options: {
      targetEdgeMm: 40,
      minInputEdgeMm: 1e-6,
      minTriangleAngleDegrees: 0.01,
      maxEdgeRatio: 1e9,
      maxRadiusEdgeRatio: 1e9,
      maxBoundaryErrorMm: 1e-9,
      collinearSinTolerance: 1e-12,
    },
  };
}

const flapWithTopCorner = (corner: Vec2Mm) =>
  boundaryInput([corner, [10, 210], [10, 10], [90.000015, 10], [89.999985, 210]]);

describe('straight native boundary subdivisions', () => {
  it('retains the exact corner and two constraints across a straight run from distinct native DXF lines', () => {
    const input = flapWithTopCorner([50, 210]);
    expect(preflightTriangulationInput(input)).toEqual([]);
    const result = createCdt2dConstrainedTriangulatorV1().triangulate(input);
    expect(Array.from(result.boundaryLoops[0].vertexIndices, (i) => result.vertices[i])).toEqual(
      input.shell.vertices.map((v) => ({
        positionMm: v.positionMm,
        source: { kind: 'boundary', boundaryVertexId: v.id, provenance: v.source },
      })),
    );
    const seamEndpoint = result.seamEndpoints.find((e) => e.seamEndpointId === 'required-corner')!;
    expect(result.vertices[seamEndpoint.vertexIndex].source).toMatchObject({
      kind: 'boundary',
      boundaryVertexId: 'native-vertex-0',
    });
  });

  it.each([
    ['a nonzero turn below the sine threshold', [50, 210 + 1e-11]],
    ['a collinear backtrack', [5, 210]],
  ] as const)('refuses %s on distinct lines', (_, position) => {
    const issues = preflightTriangulationInput(flapWithTopCorner(position));
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'near-collinear-boundary', sourceId: 'native-vertex-0' }),
    );
  });

  it('distinguishes exact diagonal subdivisions from a nonzero turn rounded to zero', () => {
    expect(
      preflightTriangulationInput(
        boundaryInput([
          [0, 0],
          [3, 2],
          [6, 4],
          [0, 10],
        ]),
      ),
    ).toEqual([]);
    expect(
      preflightTriangulationInput(
        boundaryInput([
          [0, 0],
          [3.1, 1.7],
          [5.27, 2.8899999999999997],
          [0, 10],
        ]),
      ),
    ).toContainEqual(
      expect.objectContaining({ code: 'near-collinear-boundary', sourceId: 'native-vertex-1' }),
    );
  });
});
