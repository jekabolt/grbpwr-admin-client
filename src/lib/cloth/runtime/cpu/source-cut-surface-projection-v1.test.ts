import { expect, it } from 'vitest';
import { compileSourceCutCarrierMaterialV1 } from '../../compiler/source-cut-carrier-material-v1';
import { VISUAL_UNCALIBRATED_CLOTH_PRESETS } from '../../material/presets';
import { CLOTH_MESH_IR_VERSION } from '../../mesh/cloth-mesh-ir';
import { prepareSourceCutContactMeshV1 } from './source-cut-contact-mesh-v1';
import { prepareSourceCutPrincipalStrainV1 } from './source-cut-principal-strain-v1';
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

const square: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.03, 0],
  [0.03, 0.03],
  [0, 0.03],
];

function currentSquare(place: (x: number, y: number) => readonly [number, number, number]) {
  return Float32Array.from(square.flatMap(([x, y]) => [...place(x, y), 1]));
}

it('measures dimensionless principal strain from the same packed rest frame after rigid motion and affine deformation', () => {
  const strain = prepareSourceCutPrincipalStrainV1(compileSurface(), 4);
  const cases = [
    { positions: currentSquare((x, y) => [x, 0.12, y]), expected: 0 },
    { positions: currentSquare((x, y) => [1.25 * x, 0.75 * y, 0]), expected: 0.25 },
    { positions: currentSquare((x, y) => [x + y, y, 0]), expected: (Math.sqrt(5) - 1) / 2 },
    { positions: currentSquare((x, y) => [0.75 * x, 0.75 * y, 0]), expected: -0.25 },
  ];
  for (const { positions, expected } of cases) {
    const { valuesInDrawOrder, summary } = strain.evaluate(positions);
    expect(summary).toMatchObject({ triangleCount: 3, carrierFaceCount: 2 });
    expect(summary.minimum).toBe(Math.min(...valuesInDrawOrder));
    expect(summary.maximum).toBe(Math.max(...valuesInDrawOrder));
    for (const value of valuesInDrawOrder) expect(value).toBeCloseTo(expected, 6);
  }
});

it('maps each shared carrier face into every cut fragment in the draw order', () => {
  const material = compileSurface();
  const draw = prepareSourceCutSurfaceProjectionV1(material, 4);
  const strain = prepareSourceCutPrincipalStrainV1(material, 4);
  const deformed = currentSquare((x, y) =>
    x !== 0 || y === 0 ? [x, y, 0] : [-y / 4, y * 1.25, 0],
  );
  const provenance = Array.from(material.pieces[0].surface!.carrierTriangleIndices);
  expect(provenance).toHaveLength(draw.project(deformed).length / 9);
  expect(provenance.length).toBeGreaterThan(new Set(provenance).size);

  const { valuesInDrawOrder, summary } = strain.evaluate(deformed);
  expect(summary.maximum).toBeCloseTo(0.5, 6);
  expect(summary.minimum).toBeCloseTo(0, 6);
  const byCarrier = [0, 0.5];
  for (const [drawFace, carrierFace] of provenance.entries())
    expect(valuesInDrawOrder[drawFace]).toBeCloseTo(byCarrier[carrierFace], 6);

  // Prepared topology and returned frame arrays must not alias caller-owned mutable storage.
  material.pieces[0].surface!.carrierTriangleIndices.fill(99);
  new Uint8Array(material.cutTriangleRestFrames).fill(0);
  new Uint8Array(material.base.triangleIndices).fill(0);
  valuesInDrawOrder.fill(99);
  const next = strain.evaluate(deformed).valuesInDrawOrder;
  for (const [drawFace, carrierFace] of provenance.entries())
    expect(next[drawFace]).toBeCloseTo(byCarrier[carrierFace], 6);
});

it('rejects mismatched inputs before exposing a heatmap', () => {
  const material = compileSurface();
  const strain = prepareSourceCutPrincipalStrainV1(material, 4);
  expect(() => prepareSourceCutPrincipalStrainV1(material, 2)).toThrow(/budget/);
  expect(() =>
    prepareSourceCutPrincipalStrainV1(
      {
        ...material,
        cutTriangleRestFrames: material.cutTriangleRestFrames.slice(0, -1),
      },
      4,
    ),
  ).toThrow(/matching carrier topology/);
  expect(() =>
    prepareSourceCutPrincipalStrainV1(
      {
        ...material,
        pieces: [{ ...material.pieces[0], carrierTriangleOffset: 1 }],
      },
      4,
    ),
  ).toThrow(/piece ranges/);
  expect(() => strain.evaluate(new Float32Array(12))).toThrow(/finite current state/);
  expect(() => strain.evaluate(currentSquare((x, y) => [x, y, NaN]))).toThrow(
    /finite current state/,
  );

  const mismatchedFace = compileSurface();
  mismatchedFace.pieces[0].surface!.carrierTriangleIndices[0] = 2;
  expect(() => prepareSourceCutPrincipalStrainV1(mismatchedFace, 4)).toThrow(
    /leaves its carrier piece/,
  );
  const invalidRest = compileSurface();
  new Uint8Array(invalidRest.cutTriangleRestFrames).fill(0);
  expect(() => prepareSourceCutPrincipalStrainV1(invalidRest, 4)).toThrow(/rest frame is invalid/);
});
