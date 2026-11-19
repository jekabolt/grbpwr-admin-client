import { expect, it } from 'vitest';
import { compileSourceCutCarrierMaterialV1 } from '../../compiler/source-cut-carrier-material-v1';
import { VISUAL_UNCALIBRATED_CLOTH_PRESETS } from '../../material/presets';
import { CLOTH_MESH_IR_VERSION } from '../../mesh/cloth-mesh-ir';
import { prepareSourceCutContactMeshV1 } from './source-cut-contact-mesh-v1';
import { prepareSourceCutSurfaceProjectionV1 } from './source-cut-surface-projection-v1';

function compileSurface() {
  const pieceId = 'left-half';
  const material = VISUAL_UNCALIBRATED_CLOTH_PRESETS.find(
    ({ id }) => id === 'visual-medium-woven',
  )!;
  return compileSourceCutCarrierMaterialV1(
    {
      schemaVersion: CLOTH_MESH_IR_VERSION,
      sourceAssemblyFingerprint: 'cut-plane-test',
      sourceUnits: 'mm',
      restPositions2Mm: Float32Array.of(0, 0, 30, 0, 30, 30, 0, 30),
      triangles: Uint32Array.of(0, 1, 2, 0, 2, 3),
      pieceRanges: [
        { pieceId, vertexOffset: 0, vertexCount: 4, triangleOffset: 0, triangleCount: 2 },
      ],
      boundarySamples: [],
      seams: [],
      quality: {
        degenerateTriangles: 0,
        minTriangleAngleDegrees: 45,
        maxEdgeRatio: Math.SQRT2,
        maxBoundaryErrorMm: 0,
      },
    },
    [{ pieceId, grainDegrees: 0 }],
    [{ id: material.id, pieceIds: [pieceId], materialRevision: material.revision }],
    [material],
    { dtS: 1 / 60, solverIterations: 8, allowUncalibratedVisual: true },
    new Map([
      [
        pieceId,
        {
          cut: {
            verticesMm: [
              [0, 0],
              [15, 0],
              [15, 30],
              [0, 30],
            ],
            triangles: Uint32Array.of(0, 1, 2, 0, 2, 3),
          },
          maxSurfaceTriangles: 4,
        },
      ],
    ]),
    { absoluteAreaToleranceMm2: 1e-6, relativeAreaTolerance: 1e-8, centroidToleranceMm: 1e-8 },
  );
}

it('projects both occurrences of a shared native corner from one verified stencil', () => {
  const material = compileSurface();
  const original = prepareSourceCutSurfaceProjectionV1(material, 4);
  const weights = material.pieces[0].surface!.cornerWeights;
  const indices = Array.from({ length: weights.length / 3 }, (_, i) => i);
  const repeated = indices.find(
    (i) =>
      original.cornerRepresentative(i) !== i &&
      weights.subarray(3 * i, 3 * i + 3).filter((w) => w > 0).length === 2,
  )!;
  expect(repeated).toBeDefined();
  const active = [0, 1, 2].filter((i) => weights[3 * repeated + i] > 0);
  const [a, b] = active.map((i) => 3 * repeated + i);
  const epsilon = 8 * Number.EPSILON;
  weights[a] += epsilon;
  weights[b] -= epsilon;

  const draw = prepareSourceCutSurfaceProjectionV1(material, 4);
  const indexed = prepareSourceCutContactMeshV1(material, 4);
  const placed = Float32Array.of(
    -0.02,
    0,
    -0.01,
    1,
    0.01,
    0,
    0.02,
    1,
    0.02,
    0.03,
    0.01,
    1,
    -0.02,
    0.03,
    0.01,
    1,
  );
  const projected = draw.project(placed);
  const first = draw.cornerRepresentative(repeated);
  expect(draw.cornerSupport(repeated)).toEqual(draw.cornerSupport(first));
  expect(projected.slice(3 * repeated, 3 * repeated + 3)).toEqual(
    projected.slice(3 * first, 3 * first + 3),
  );
  expect(indexed.project(placed).maximumJoinedCornerDifferenceM).toBe(0);

  weights[a] += 1e-5;
  weights[b] -= 1e-5;
  expect(() => prepareSourceCutSurfaceProjectionV1(material, 4)).toThrow(
    /different material supports/,
  );
});
