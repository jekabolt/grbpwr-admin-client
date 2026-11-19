import { compileSourceCutCarrierMaterialV1 } from 'lib/cloth/compiler/source-cut-carrier-material-v1';
import type { Vec2Mm } from 'lib/cloth/domain/garment-assembly-ir';
import { VISUAL_UNCALIBRATED_CLOTH_PRESETS } from 'lib/cloth/material/presets';
import { CLOTH_MESH_IR_VERSION } from 'lib/cloth/mesh/cloth-mesh-ir';
import {
  seamSegmentIsCoveredByMeshV1,
  seamSegmentMeshPartitionV1,
} from 'lib/cloth/mesh/triangulation/seam-point-embedding-v1';
import { prepareSourceCutSurfaceProjectionV1 } from 'lib/cloth/runtime/cpu/source-cut-surface-projection-v1';
import { describe, expect, it } from 'vitest';

import { prepareSavedNativeCutInternalLineTraceV1 } from './trace-saved-native-cut-internal-line-v1';

type Input = Parameters<typeof prepareSavedNativeCutInternalLineTraceV1>[0];

function foldedPiece(startMm: Vec2Mm = [2, 12], endMm: Vec2Mm = [18, 8]) {
  const pieceLineKey = 'verified-piece-line';
  const row = {
    techCardId: 2,
    cardLockVersion: 6,
    scopeKey: 'main',
    patternLineKey: 'verified-pattern-line',
    revision: 2,
    sha256: 'a'.repeat(64),
    sizeBytes: 24,
    url: 'https://example.invalid/pattern.dxf',
  };
  const blockName = 'PANEL';
  const sourceInstancePath = ['original-native-instance'];
  const materialCut = {
    verticesMm: [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ] as readonly Vec2Mm[],
    triangles: Uint32Array.of(0, 1, 2, 0, 2, 3),
  };
  const lengthMm = Math.hypot(endMm[0] - startMm[0], endMm[1] - startMm[1]);
  const line: Input['line'] = {
    kind: 'native-internal-l8',
    operationNumber: 530,
    operationOrder: 0,
    seamKey: 'surface-seam-530',
    seamKind: 'TECH_CARD_SEAM_KIND_SURFACE',
    direction: 'TECH_CARD_SEAM_DIRECTION_REVERSED',
    anchoredSize: 'M',
    sideIndex: 0,
    partOrdinal: 0,
    pieceLineKey,
    row,
    blockName,
    edgeHint: 'i0',
    storedAnchor: {
      pieceLineKey,
      edgeHint: 'i0',
      samples: [],
      lenMm: lengthMm,
      perimShare: 1 / 4,
      notches: 0,
      turnDeg: 0,
      rangeFrom: 0,
      rangeTo: 0,
      contourSig: 'synthetic-contour',
      placement: undefined,
      layer: undefined,
    },
    span: {
      sourceFileId: 'native-source',
      layer: '8',
      nativePathId: 2941,
      nativeLayer14ParentId: 2776,
      sourceInstancePath,
      storedLengthMm: lengthMm,
      lengthMm,
      ordinaryDrawingPoints: 2,
      rawNativePoints: 2,
      reverse: false,
      orderedNativeVertexIds: ['a', 'b'],
      firstMm: startMm,
      lastMm: endMm,
      nativePointsMm: [startMm, endMm],
      authoritySha256: 'b'.repeat(64),
      intervals: [{ nativeCurveId: 'straight-native-curve', t0: 0, t1: 1, startMm, endMm }],
    },
  };
  const original: Input['source']['sourceCuts'][number] = {
    pieceLineKey,
    pieceId: blockName,
    row,
    blockName,
    sizeToken: 'M',
    sourceInstancePath,
    contourId: 'cut-contour',
    nativePathId: 2616,
    nativePointsMm: materialCut.verticesMm.map(([x, y]) => ({ x, y })),
    nativeNotchPoints: null,
    grain: null,
  };
  const carrierRestPositions2Mm = Float32Array.from(materialCut.verticesMm.flat());
  const material = VISUAL_UNCALIBRATED_CLOTH_PRESETS.find(
    ({ id }) => id === 'visual-medium-woven',
  )!;
  const compiled = compileSourceCutCarrierMaterialV1(
    {
      schemaVersion: CLOTH_MESH_IR_VERSION,
      sourceUnits: 'mm',
      sourceAssemblyFingerprint: 'native-internal-line-test',
      restPositions2Mm: carrierRestPositions2Mm,
      triangles: materialCut.triangles,
      pieceRanges: [
        {
          pieceId: pieceLineKey,
          vertexOffset: 0,
          vertexCount: 4,
          triangleOffset: 0,
          triangleCount: 2,
        },
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
    [{ pieceId: pieceLineKey, grainDegrees: 0 }],
    [{ id: material.id, materialRevision: material.revision, pieceIds: [pieceLineKey] }],
    [material],
    { dtS: 1 / 60, solverIterations: 8, allowUncalibratedVisual: true },
    new Map([[pieceLineKey, { cut: materialCut, maxSurfaceTriangles: 8 }]]),
    { absoluteAreaToleranceMm2: 1e-6, relativeAreaTolerance: 1e-8, centroidToleranceMm: 1e-6 },
  );
  const surface = prepareSourceCutSurfaceProjectionV1(compiled, 8);
  return {
    input: {
      source: { sizeToken: 'M', sourceCuts: [original], spans: [line] },
      line,
      carrierRestPositions2Mm,
      materialCut,
      surface,
      maxTriangleTests: 50,
    },
    acceptedCarrier: Float32Array.of(0, 0, 0, 1, 0.02, 0, 0, 1, 0.02, 0.02, 0, 1, 0, 0.02, 0.02, 1),
  };
}

describe('operation-owned internal line on the deformed visible cut', () => {
  it('keeps the exact bend where the path crosses an original material face', () => {
    const { input, acceptedCarrier } = foldedPiece();
    const trace = prepareSavedNativeCutInternalLineTraceV1(input);
    expect(trace).toMatchObject({ operationNumber: 530, nativePathId: 2941, segmentCount: 2 });
    const drawn = input.surface.project(acceptedCarrier);
    const result = trace!.project(drawn)!;
    expect(result).toHaveLength(12);
    expect(result[2]).toBeCloseTo(0.01, 8);
    expect(result.slice(3, 6)).toEqual(result.slice(6, 9));
    expect(result[5]).toBe(0);
    expect(result[11]).toBe(0);
    expect(trace!.project(drawn.subarray(0, drawn.length - 9))).toBeNull();
  });

  it('keeps Boolean seam coverage while refusing ambiguous draw-face assignment', () => {
    const start = [2, 2] as const;
    const end = [18, 18] as const;
    const { input } = foldedPiece(start, end);
    const { verticesMm, triangles } = input.materialCut;
    expect(seamSegmentIsCoveredByMeshV1(verticesMm, triangles, start, end)).toBe(true);
    expect(seamSegmentMeshPartitionV1(verticesMm, triangles, start, end)).toBeNull();
    expect(prepareSavedNativeCutInternalLineTraceV1(input)).toBeNull();
  });

  it('refuses foreign source identity, a clipped line leaving material, and an exhausted budget', () => {
    const { input } = foldedPiece();
    const moved = { ...input.source.sourceCuts[0], sourceInstancePath: ['different-occurrence'] };
    expect(
      prepareSavedNativeCutInternalLineTraceV1({
        ...input,
        source: { ...input.source, sourceCuts: [moved] },
      }),
    ).toBeNull();
    expect(
      prepareSavedNativeCutInternalLineTraceV1({
        ...input,
        line: { ...input.line },
      }),
    ).toBeNull();
    expect(prepareSavedNativeCutInternalLineTraceV1({ ...input, maxTriangleTests: 2 })).toBeNull();
    expect(
      prepareSavedNativeCutInternalLineTraceV1(foldedPiece([2, 12], [22, 8]).input),
    ).toBeNull();
  });
});
