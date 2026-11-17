import { describe, expect, it } from 'vitest';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { PtMm } from 'lib/pattern-import/types';
import {
  alignSelectedCadTablePiecesV1,
  cadTablePieceRigidTransformV1,
  cadTablePieceSvgTransformV1,
  compactPatternImportDxfPhaseECadTablePieceOffsetsV1 as compact,
  createPatternImportDxfPhaseECadTablePieceLayoutSessionV1 as create,
  displayedPatternImportDxfPhaseECadTablePieceBoundsV1 as bounds,
  fitPatternImportDxfPhaseECadTablePieceBoundsV1 as fit,
  nextPatternImportDxfPhaseECadTablePieceHitV1 as hit,
  reconcilePatternImportDxfPhaseECadTablePieceLayoutSessionV1 as reconcile,
  rotateSelectedCadTablePiecesV1 as rotate,
  selectPatternImportDxfPhaseECadTablePiecesInLassoV1 as lasso,
  selectPatternImportDxfPhaseECadTablePiecesV1 as select,
  translateSelectedPatternImportDxfPhaseECadTablePiecesV1 as move,
} from './cad-table-piece-layout-session-v1';

type Piece = PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number];
type XY = [number, number];
function contour(
  role: Piece['contours'][number]['role'],
  points: XY[],
  closed = true,
): Piece['contours'][number] {
  return {
    contourId: role,
    role,
    closed,
    vertices: points.map(([x, y], ordinal) => ({
      vertexId: role + ordinal,
      ordinal,
      normalizedArc: ordinal / points.length,
      pointMm: { x, y },
    })),
  };
}
function piece(id: string, contours: Piece['contours']): Piece {
  const points = contours.flatMap(({ vertices }) => vertices.map(({ pointMm }) => pointMm));
  return {
    pieceId: id,
    pieceLineKey: 'line-' + id,
    contours,
    cameraMm: {
      minX: Math.min(...points.map((p) => p.x)),
      maxX: Math.max(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxY: Math.max(...points.map((p) => p.y)),
      padding: 0,
    },
  };
}
function at(point: PtMm, expected: PtMm) {
  expect(point.x).toBeCloseTo(expected.x, 10);
  expect(point.y).toBeCloseTo(expected.y, 10);
}
const shell = piece('shell', [
  contour('cut-boundary', [
    [0, 0],
    [12, 0],
    [12, 4],
    [4, 4],
    [4, 10],
    [0, 10],
  ]),
  contour('hole', [
    [1, 1],
    [3, 1],
    [3, 3],
    [1, 3],
  ]),
]);
const back = piece('back', [
  contour('cut-boundary', [
    [0, 0],
    [12, 0],
    [12, 10],
    [0, 10],
  ]),
]);
const square = (x: number, y: number) => [
  { x: x - 0.2, y: y - 0.2 },
  { x: x + 0.2, y: y - 0.2 },
  { x: x + 0.2, y: y + 0.2 },
  { x: x - 0.2, y: y + 0.2 },
];

describe('CAD table session-only rigid transforms', () => {
  it('preserves legacy translation, both SVG axis conventions, source lengths and exact identities', () => {
    const original = structuredClone(shell);
    const initial = create([shell]);
    const key = initial.pieces[0]!.identity.key;
    const moved = move(select(initial, [key]), { x: 20, y: -5 });
    const legacy = {
      ...moved.pieces[0]!,
      rotationDegrees: undefined,
      sourceContourPoints: undefined,
    };
    expect(cadTablePieceSvgTransformV1(legacy, 'inverted')).toBe('translate(20 5)');
    expect(cadTablePieceRigidTransformV1(legacy).toSource({ x: 28, y: 4 })).toEqual({ x: 8, y: 9 });
    const state = rotate(moved, 37);
    const rotated = state.pieces[0]!;
    expect(cadTablePieceSvgTransformV1(rotated, 'source')).toBe('translate(20 -5) rotate(37 6 5)');
    expect(cadTablePieceSvgTransformV1(rotated, 'inverted')).toBe(
      'translate(20 5) rotate(-37 6 -5)',
    );
    const map = cadTablePieceRigidTransformV1(rotated);
    const [from, to] = shell.contours[0]!.vertices.map(({ pointMm }) => pointMm);
    const a = map.toDisplay(from!);
    const b = map.toDisplay(to!);
    at(map.toSource(a), from!);
    at(map.toSource(b), to!);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(12, 12);
    expect(reconcile(state, [shell]).pieces[0]).toEqual(rotated);
    expect(reconcile(state, [{ ...shell, pieceLineKey: 'replacement' }]).pieces[0]).toMatchObject({
      rotationDegrees: 0,
      offsetMm: { x: 0, y: 0 },
    });
    expect(shell).toEqual(original);
    expect(() => rotate(moved, NaN)).toThrow(/finite/);
    expect(rotate(state, 720)).toBe(state);
  });

  it('tests the displayed concavity, holes and overlap in the same source frame at a free angle', () => {
    const initial = create([back, shell]);
    const [under, over] = initial.pieces.map((p) => p.identity.key);
    const layout = rotate(move(select(initial, [under!, over!]), { x: 55, y: -10 }), 37);
    const map = cadTablePieceRigidTransformV1(layout.pieces[1]!);
    const selectedTop = select(layout, [over!]);
    const selectedBottom = select(layout, [under!]);
    for (const [x, y] of [
      [6, 2],
      [2, 8],
    ]) {
      expect(lasso(layout, square(x!, y!).map(map.toDisplay)).selectedPieceKeys).toEqual([
        under,
        over,
      ]);
      expect(hit(selectedTop, over!, map.toDisplay({ x: x!, y: y! }))).toBe(under);
    }
    for (const [x, y] of [
      [2, 2],
      [9, 8],
    ]) {
      expect(lasso(layout, square(x!, y!).map(map.toDisplay)).selectedPieceKeys).toEqual([under]);
      expect(hit(selectedBottom, under!, map.toDisplay({ x: x!, y: y! }))).toBe(under);
    }
    expect(hit(selectedTop, over!, map.toDisplay({ x: 4, y: 7 }))).toBe(under);
    expect(hit(selectedTop, over!, map.toDisplay({ x: 1, y: 2 }))).toBe(under);
    expect(lasso(layout, square(100, 100)).selectedPieceKeys).toEqual([]);
    // A narrow diagonal lasso crosses the material without containing a material vertex.
    expect(
      lasso(
        layout,
        [
          { x: 6, y: -2 },
          { x: 6.2, y: -2 },
          { x: 8.2, y: 5 },
          { x: 8, y: 5 },
        ].map(map.toDisplay),
      ).selectedPieceKeys,
    ).toEqual([under, over]);
  });

  it('fits transformed contour vertices including open paths without fitting empty rotated box corners', () => {
    const triangle = piece('triangle', [
      contour('cut-boundary', [
        [0, 0],
        [8, 0],
        [0, 6],
      ]),
      contour(
        'sewing-boundary',
        [
          [1, 2],
          [1, 8],
        ],
        false,
      ),
    ]);
    const initial = create([triangle]);
    const rotated = rotate(select(initial, [initial.pieces[0]!.identity.key]), 45);
    const box = fit(rotated, 2)!;
    expect(box.minX).toBeCloseTo(4 - 7 / Math.SQRT2 - 2, 12);
    expect(box.maxX).toBeCloseTo(4 + 8 / Math.SQRT2 + 2, 12);
    expect(box.minY).toBeCloseTo(4 - 8 / Math.SQRT2 - 2, 12);
    expect(box.maxY).toBeCloseTo(4 + 1 / Math.SQRT2 + 2, 12);
  });

  it('rotates a translated group and aligns its displayed extents with unselected pieces fixed', () => {
    const state = create([back, shell, piece('spare', back.contours)]);
    const [a, b] = state.pieces.map((p) => p.identity.key);
    const grouped = select(move(select(state, [b!]), { x: 30, y: 8 }), [a!, b!]);
    const rotated = rotate(grouped, 90);
    expect(rotated.pieces[0]!.offsetMm).toEqual({ x: 19, y: -11 });
    expect(rotated.pieces[1]!.offsetMm).toEqual({ x: 11, y: 19 });
    expect(rotate(rotated, -90)).toEqual(grouped);
    for (const [mode, key] of [
      ['left', 'minX'],
      ['right', 'maxX'],
      ['bottom', 'minY'],
      ['top', 'maxY'],
    ] as const) {
      const aligned = alignSelectedCadTablePiecesV1(rotated, mode);
      expect(bounds(aligned.pieces[0]!)[key]).toBeCloseTo(bounds(aligned.pieces[1]!)[key], 12);
      expect(aligned.pieces[2]).toEqual(state.pieces[2]);
      expect(aligned.pieces[0]!.rotationDegrees).toBe(90);
    }
    for (const [mode, min, max] of [
      ['center-x', 'minX', 'maxX'],
      ['center-y', 'minY', 'maxY'],
    ] as const) {
      const aligned = alignSelectedCadTablePiecesV1(rotated, mode).pieces.map(bounds);
      expect(aligned[0]![min] + aligned[0]![max]).toBeCloseTo(
        aligned[1]![min] + aligned[1]![max],
        12,
      );
    }
    const packed = compact(rotated, 4);
    expect(bounds(packed.pieces[0]!)).toMatchObject({ minX: 0, minY: 0 });
    expect(packed.pieces[0]!.rotationDegrees).toBe(90);
  });
});
