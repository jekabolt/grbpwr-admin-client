import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { frameOf, fromUV, toUV } from './geom';
import {
  foldedOutline,
  foldFromWire,
  foldMap,
  foldSection,
  foldToWire,
  resolveFolds,
  type FlatFold,
  type FoldKind,
  type PleatKind,
  type StoredFold,
} from './index';

// Mockup BP: apex at the waist, a 70 mm opening at the neck, 569 mm wide.
const back: Pt2[] = [
  [0, 0],
  [569, 0],
  [569, 662],
  [0, 662],
];
const apex: Pt2 = [285, 14];
const fan = (kind: FoldKind, flipAt: Pt2 = [285, 14]): FlatFold[] => [
  { a: apex, b: [250, 662], flipAt, kind },
  { a: apex, b: [285, 662], flipAt, kind },
  { a: apex, b: [320, 662], flipAt, kind },
];
const piece = { pieceKey: 'BP', name: 'BP', rs: back, edges: [] } as unknown as PieceGeom;
const row = (
  seq: number,
  kind: PleatKind,
  line: [Pt2, Pt2],
  deg = 0,
  geom: PieceGeom = piece,
  frame: (uv: Pt2) => Pt2 = (uv) => uv,
): StoredFold => {
  const f = frameOf(geom, deg);
  return {
    foldKey: `fold-${seq}`,
    pieceKey: geom.pieceKey,
    seq,
    kind,
    source: 'dxf',
    line: [frame(toUV(f, line[0])), frame(toUV(f, line[1]))],
    flipAt: frame(toUV(f, [line[1][0] + 40, line[1][1] - 300])),
    edge: null,
    contourSig: '',
    anchoredSize: 'M',
    note: '',
    stale: false,
  };
};
const legs: [Pt2, Pt2][] = [
  [apex, [250, 662]],
  [apex, [285, 662]],
  [apex, [320, 662]],
];
const laid = (kind: PleatKind, frame?: (uv: Pt2) => Pt2): FlatFold[] => {
  const rows = legs.map((line, i) => row(i + 1, kind, line, 0, piece, frame));
  const { folds, unresolved } = resolveFolds(rows, [piece]);
  expect(unresolved).toEqual([]);
  const f = frameOf(piece, 0);
  return folds.BP.map((fold) => ({
    a: fromUV(f, fold.a),
    b: fromUV(f, fold.b),
    flipAt: fromUV(f, fold.flipAt),
    kind: fold.kind,
  }));
};
const xs = (points: readonly Pt2[]) => points.map((point) => point[0]);

describe('pleat direction', () => {
  it('round-trips all three kinds on the wire', () => {
    for (const [kind, wire] of [
      ['pleat', 'TECH_CARD_PIECE_FOLD_KIND_PLEAT'],
      ['pleat_l', 'TECH_CARD_PIECE_FOLD_KIND_PLEAT_LEFT'],
      ['pleat_r', 'TECH_CARD_PIECE_FOLD_KIND_PLEAT_RIGHT'],
    ] as const) {
      const out = foldToWire(row(1, kind, legs[0]));
      expect(out.kind).toBe(wire);
      expect(foldFromWire(out)?.kind).toBe(kind);
    }
  });

  it('→ hides everything left of the centre line, full opening width at the neck', () => {
    const [pleat] = foldedOutline(back, laid('pleat_r')).pleats;
    expect(pleat.kind).toBe('pleat_r');
    expect(Math.min(...xs(pleat.wedge))).toBeCloseTo(250, 6);
    expect(Math.max(...xs(pleat.wedge))).toBeCloseTo(285, 6);
    expect(pleat.edges).toEqual([[apex, [250, 662]]]);
    expect(pleat.openingMm).toBeCloseTo(70, 6);
  });

  it('← is the mirror', () => {
    const [pleat] = foldedOutline(back, laid('pleat_l')).pleats;
    expect(Math.min(...xs(pleat.wedge))).toBeCloseTo(285, 6);
    expect(Math.max(...xs(pleat.wedge))).toBeCloseTo(320, 6);
    expect(pleat.edges).toEqual([[apex, [320, 662]]]);
  });

  it('· keeps the even intake on both sides with two dashed edges', () => {
    const [pleat] = foldedOutline(back, fan('pleat', [270, 340])).pleats;
    expect(pleat.edges).toHaveLength(2);
    expect(Math.min(...xs(pleat.wedge))).toBeLessThan(285);
    expect(Math.max(...xs(pleat.wedge))).toBeGreaterThan(285);
  });

  it('lays the two halves in the same place for all three kinds', () => {
    const marks: Pt2[] = [
      [0, 662],
      [569, 662],
      [0, 0],
      [569, 0],
      [250, 662],
      [320, 662],
    ];
    const at = (folds: FlatFold[]) =>
      foldMap({ rings: [back], edges: [], marks, innerLines: [] }, folds).marks;
    const faces = (folds: FlatFold[]) =>
      foldedOutline(back, folds)
        .plies.filter((ply) => !ply.hidden)
        .map((ply) => ply.poly);
    const even = fan('pleat', [270, 340]);
    for (const kind of ['pleat_l', 'pleat_r'] as const) {
      expect(at(laid(kind))).toEqual(at(even));
      expect(faces(laid(kind))).toEqual(faces(even));
    }
  });

  it('lays the intake as a Z on the hidden side', () => {
    const neck: Pt2 = [285, 662];
    const lay = (kind: PleatKind) =>
      foldMap(
        { rings: [back], edges: [], marks: [neck, [260, 662], [310, 662]], innerLines: [] },
        laid(kind),
      ).marks;
    // The old centre crease lands a leg's width out on the hidden side, every other point between.
    expect(lay('pleat_r')[0][0]).toBeCloseTo(250, 0);
    expect(lay('pleat_l')[0][0]).toBeCloseTo(320, 0);
    for (const [x] of lay('pleat_r')) expect(x).toBeLessThanOrEqual(285 + 1e-6);
    for (const [x] of lay('pleat_l')) expect(x).toBeGreaterThanOrEqual(285 - 1e-6);
  });

  it('never lets the stored flip point decide the side', () => {
    const rows = legs.map((line, i) => ({
      ...row(i + 1, 'pleat_r', line),
      flipAt: [0.9, 0.5] as Pt2,
    }));
    const f = frameOf(piece, 0);
    const flat = resolveFolds(rows, [piece]).folds.BP.map((fold) => ({
      a: fromUV(f, fold.a),
      b: fromUV(f, fold.b),
      flipAt: fromUV(f, fold.flipAt),
      kind: fold.kind,
    }));
    expect(Math.max(...xs(foldedOutline(back, flat).pleats[0].wedge))).toBeCloseTo(285, 6);
  });

  it('keeps the word on a drawing found mirrored: the kind is read in today upright view', () => {
    // Off-centre, so only the mirrored frame fits the drawn lines on today's piece.
    const off = (line: [Pt2, Pt2]): [Pt2, Pt2] => [
      [line[0][0] - 135, line[0][1]],
      [line[1][0] - 135, line[1][1]],
    ];
    const f = frameOf(piece, 0);
    const mirrored = (uv: Pt2): Pt2 => [1 - uv[0], uv[1]];
    const rows = legs.map((line, i) => row(i + 1, 'pleat_r', off(line), 0, piece, mirrored));
    const { folds, via } = resolveFolds(rows, [piece], {
      innerLines: new Map([['BP', legs.map(off)]]),
    });
    expect(Object.values(via)).toEqual(['inner', 'inner', 'inner']);
    const flat = folds.BP.map((fold) => ({
      a: fromUV(f, fold.a),
      b: fromUV(f, fold.b),
      flipAt: fromUV(f, fold.flipAt),
      kind: fold.kind,
    }));
    const [pleat] = foldedOutline(back, flat).pleats;
    expect(pleat.kind).toBe('pleat_r');
    expect(Math.min(...xs(pleat.wedge))).toBeCloseTo(115, 6);
    expect(Math.max(...xs(pleat.wedge))).toBeCloseTo(150, 6);
  });

  it('reads left and right through the grain turn, not in the raw frame', () => {
    // The pattern lies on its side: grain turns it upright by 90 degrees.
    const turned: Pt2[] = back.map(([x, y]) => [662 - y, x]);
    const turn = ([x, y]: Pt2): Pt2 => [662 - y, x];
    const geom = { ...piece, rs: turned } as PieceGeom;
    const upright = (kind: PleatKind) => {
      const deg = 90;
      const rows = legs.map((line, i) =>
        row(i + 1, kind, [turn(line[0]), turn(line[1])], deg, geom),
      );
      const { folds } = resolveFolds(rows, [geom], { grainDeg: new Map([['BP', deg]]) });
      const f = frameOf(geom, deg);
      const flat = folds.BP.map((fold) => ({
        a: fromUV(f, fold.a),
        b: fromUV(f, fold.b),
        flipAt: fromUV(f, fold.flipAt),
        kind: fold.kind,
      }));
      const [pleat] = foldedOutline(turned, flat).pleats;
      return [toUV(f, pleat.wedge[1])[0], toUV(f, pleat.centre[1])[0]];
    };
    const [hiddenR, centreR] = upright('pleat_r');
    expect(hiddenR).toBeLessThan(centreR);
    const [hiddenL, centreL] = upright('pleat_l');
    expect(hiddenL).toBeGreaterThan(centreL);
  });

  it('hands the section its kind and opening', () => {
    expect(foldSection(back, laid('pleat_r'))?.pleat).toEqual({
      kind: 'pleat_r',
      openingMm: expect.closeTo(70, 6),
    });
  });

  it('keeps every part-one rule for a lone or a broken directional row', () => {
    const lone = foldedOutline(back, [fan('pleat_r')[0]]);
    expect(lone.pleats).toEqual([]);
    expect(lone.plies).toHaveLength(1);
  });
});
