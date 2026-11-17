import { beforeAll, describe, expect, it, vi } from 'vitest';
import { compileDxfGarmentAssemblyMaterialStageV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1';
import { createThreePanelDxfMaterialCompileFixtureV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import {
  projectSavedGenericObservedSourceGeometryV1 as project,
  type SavedGenericObservedSourceGeometryRequestV1,
} from './saved-generic-observed-source-geometry-v1';

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends Float32Array
    ? Float32Array
    : T[K] extends object
      ? Mutable<T[K]>
      : T[K];
};
let seed: SavedGenericObservedSourceGeometryRequestV1;
const input = () => structuredClone(seed) as Mutable<SavedGenericObservedSourceGeometryRequestV1>;
beforeAll(async () => {
  // Real ASCII DXF/native-bound handoff and actual generic material compiler; no saved/body authority.
  const fixture = await createThreePanelDxfMaterialCompileFixtureV1('separated');
  const result = await compileDxfGarmentAssemblyMaterialStageV1(fixture.request);
  if (!result.compiled) throw new Error(JSON.stringify(result.blockers));
  seed = {
    handoffPieces: fixture.request.handoff.pieces,
    pieceBindings: fixture.request.handoff.pieces.map((p) => ({
      pieceId: p.id,
      pieceLineKey: `explicit-${p.id}`,
      cutCount: 1,
      grainDegrees: p.grainDegrees,
      materialId: 'test-explicit',
      materialRevision: '1',
    })),
    pieceRanges: result.artifact.refinement.mesh.pieceRanges,
    vertexProvenance: result.artifact.refinement.vertexProvenance,
    restPositions2Mm: result.artifact.refinement.mesh.restPositions2Mm,
    restPositionsInvMass: result.artifact.compiledSimulation.mesh.restPositionsInvMass,
  };
});

describe('exact native corner/content projection; no new owner or pivot authority', () => {
  it('keeps genuine handoff order and every native corner, excluding interpolated/interior mesh vertices', () => {
    const result = project(seed);
    expect(result.pieces.map((p) => p.pieceId)).toEqual(seed.handoffPieces.map((p) => p.id));
    expect(result.pieces.flatMap((p) => p.contours.flatMap((c) => c.vertices))).toHaveLength(12);
    expect(seed.vertexProvenance.length).toBeGreaterThan(12);
    for (const [pi, piece] of result.pieces.entries())
      for (const [ci, contour] of piece.contours.entries())
        for (const [vi, vertex] of contour.vertices.entries()) {
          expect(vertex.vertexId).toBe(seed.handoffPieces[pi].contours[ci].vertices[vi].id);
          expect(vertex.positionMm).toEqual(
            seed.handoffPieces[pi].contours[ci].vertices[vi].positionMm,
          );
          expect(vertex.positionM).toEqual(
            Array.from(
              seed.restPositionsInvMass.slice(
                vertex.globalVertexIndex * 4,
                vertex.globalVertexIndex * 4 + 3,
              ),
            ),
          );
        }
    expect(result.claims).toMatchObject({
      defaultPivotSelected: false,
      sourceAuthority: false,
      runtimeAuthority: false,
    });
  });
  it('joins exact IDs rather than provenance/range/binding array order and detaches all returned data', () => {
    const value = input();
    value.vertexProvenance.reverse();
    value.pieceRanges.reverse();
    value.pieceBindings.reverse();
    const actual = project(value);
    expect(actual).toEqual(project(seed));
    const original = structuredClone(actual);
    Object.defineProperty(actual.pieces[0].contours[0].vertices[0].positionMm, '0', {
      value: 12345,
    });
    Object.defineProperty(actual.pieces[0].contours[0].vertices[0].positionM, '0', {
      value: 54321,
    });
    expect(project(seed)).toEqual(original);
    value.restPositionsInvMass.fill(99);
    expect(actual.pieces[0].contours[0].vertices[0].positionM[0]).not.toBe(99);
  });
  it('reports native double mm and the actual two-rounding compiled pivot separately', () => {
    // Explicit synthetic rounding probe, not a recompiled or physically qualified geometry.
    const value = input(),
      first = project(value).pieces[0].contours[0].vertices[0];
    const native = 1000.00005;
    value.handoffPieces[0].contours[0].vertices[0].positionMm[0] = native;
    value.restPositions2Mm[first.globalVertexIndex * 2] = native;
    value.restPositionsInvMass[first.globalVertexIndex * 4] =
      value.restPositions2Mm[first.globalVertexIndex * 2] * 0.001;
    const corner = project(value).pieces[0].contours[0].vertices[0];
    expect(corner.positionMm[0]).toBe(native);
    expect(corner.positionM[0]).toBe(Math.fround(Math.fround(native) * 0.001));
    expect(corner.positionM[0]).not.toBe(native * 0.001);
    expect(corner.positionM[0]).not.toBe(Math.fround(native * 0.001));
  });
  it.each([
    [
      'duplicate native identity',
      (v: Mutable<SavedGenericObservedSourceGeometryRequestV1>) => {
        v.handoffPieces[0].contours[0].vertices[1].id =
          v.handoffPieces[0].contours[0].vertices[0].id;
      },
    ],
    [
      'missing corner',
      (v: Mutable<SavedGenericObservedSourceGeometryRequestV1>) => {
        v.handoffPieces[0].contours[0].vertices[0].id = 'missing-exact-corner';
      },
    ],
    [
      'cross-piece provenance',
      (v: Mutable<SavedGenericObservedSourceGeometryRequestV1>) => {
        v.vertexProvenance[0].pieceId = v.pieceRanges[1].pieceId;
      },
    ],
    [
      'duplicate mesh index',
      (v: Mutable<SavedGenericObservedSourceGeometryRequestV1>) => {
        v.vertexProvenance[1].globalVertexIndex = v.vertexProvenance[0].globalVertexIndex;
      },
    ],
    [
      'overlapping ranges',
      (v: Mutable<SavedGenericObservedSourceGeometryRequestV1>) => {
        v.pieceRanges[1].vertexOffset = v.pieceRanges[0].vertexOffset;
      },
    ],
    [
      'native coordinate drift',
      (v: Mutable<SavedGenericObservedSourceGeometryRequestV1>) => {
        v.handoffPieces[0].contours[0].vertices[0].positionMm[0] += 1;
      },
    ],
    [
      'curve lineage drift',
      (v: Mutable<SavedGenericObservedSourceGeometryRequestV1>) => {
        v.handoffPieces[0].contours[0].vertices[0].source.sourceCurveId += '-foreign';
      },
    ],
    [
      'compiled coordinate drift',
      (v: Mutable<SavedGenericObservedSourceGeometryRequestV1>) => {
        v.restPositionsInvMass[0] += 0.001;
      },
    ],
    [
      'nonfinite buffer',
      (v: Mutable<SavedGenericObservedSourceGeometryRequestV1>) => {
        v.restPositions2Mm[0] = NaN;
      },
    ],
    [
      'duplicate piece line',
      (v: Mutable<SavedGenericObservedSourceGeometryRequestV1>) => {
        v.pieceBindings[1].pieceLineKey = v.pieceBindings[0].pieceLineKey;
      },
    ],
  ] as const)('refuses %s without modifying the genuine seed', (_name, mutate) => {
    const value = input();
    mutate(value);
    expect(() => project(value)).toThrow();
    expect(project(seed).pieces).toHaveLength(3);
  });
  it('rejects request/nested getters before invoking them and enforces buffer bounds', () => {
    const getter = vi.fn(() => seed.handoffPieces);
    const value = input();
    Object.defineProperty(value.handoffPieces[0].contours[0].vertices[0], 'positionMm', {
      enumerable: true,
      get: getter,
    });
    expect(() => project(value)).toThrow(/getters/);
    expect(() =>
      project(Object.defineProperty(input(), 'handoffPieces', { enumerable: true, get: getter })),
    ).toThrow(/Accessors/);
    expect(getter).not.toHaveBeenCalled();
    expect(() => project({ ...input(), restPositionsInvMass: new Float32Array(80_004) })).toThrow(
      /Bounded/,
    );
  });
});
