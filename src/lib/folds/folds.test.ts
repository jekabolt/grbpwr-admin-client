import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { FoundPiece } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import { pieceRefKey } from 'components/managers/tech-card/components/piece-block-refs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StepFoldsGroup } from 'components/managers/tech-card/components/assembly-folds/step-folds-row';
import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import type { PieceGeom, PieceMark, Pt2, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { frameOf } from 'lib/seams/frame';
import { fromUV } from './geom';
import {
  foldFromHint,
  foldFromLine,
  foldFromWire,
  foldHints,
  foldToWire,
  resolveFolds,
  type DollFold,
  type StoredFold,
} from './index';

const KEY = '01PLACKETPIECE000000000001';

type Inner = NonNullable<PieceDTO['inner']>;

/** A rectangle piece, w × h cm, CCW, origin at the bbox min (the PieceDTO convention). */
function dto(wCm: number, hCm: number, inner: Inner = [], unfolded = false): PieceDTO {
  return {
    name: 'PLACKET',
    layer: '1',
    poly: [
      { x: 0, y: 0 },
      { x: wCm, y: 0 },
      { x: wCm, y: hCm },
      { x: 0, y: hCm },
    ],
    inner,
    manifest: unfolded ? { unfolded: true, halfFold: false } : undefined,
  } as unknown as PieceDTO;
}

function input(piece: PieceDTO): SkeletonPieceInput {
  return {
    pieceKey: KEY,
    name: 'PLACKET',
    piece,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  };
}

const geomOf = (wCm: number, hCm: number): PieceGeom => segmentPiece(input(dto(wCm, hCm)));

/** The resolved line back in mm on that size: the y of both ends (a horizontal hem). */
function yMm(piece: PieceGeom, fold: DollFold): [number, number] {
  const f = frameOf(piece, 0);
  return [fromUV(f, fold.a)[1], fromUV(f, fold.b)[1]];
}

function lineMm(piece: PieceGeom, fold: DollFold): [Pt2, Pt2] {
  const f = frameOf(piece, 0);
  return [fromUV(f, fold.a), fromUV(f, fold.b)];
}

const S = geomOf(40, 30);
const L = geomOf(44, 33);
const XS = geomOf(36, 27);

// A 30 mm hem along the bottom edge, drawn on size S, the bottom strip flips.
const hemS = (edge?: null): StoredFold =>
  foldFromLine(
    S,
    [
      [0, 30],
      [400, 30],
    ],
    [200, 15],
    { seq: 1, kind: 'inward', source: 'owner', foldKey: '01FDKEY0000000000000000001', edge },
  );

describe('foldFromLine', () => {
  it('finds the edge the line runs along and measures the offset from it', () => {
    const row = hemS();
    expect(row.edge).not.toBeNull();
    expect(row.edge!.offsetMm).toBeCloseTo(30, 1);
    expect(row.edge!.samples).toHaveLength(5);
    for (const [, v] of row.edge!.samples) expect(v).toBeCloseTo(0, 3);
    expect(row.line[0][1]).toBeCloseTo(0.1, 3);
    expect(row.contourSig).toMatch(/^[0-9a-f]{16}$/);
  });

  it('does not give a short internal line a full-width edge locator', () => {
    const row = foldFromLine(
      S,
      [
        [100, 30],
        [200, 30],
      ],
      [150, 15],
      { seq: 1, kind: 'inward', source: 'dxf' },
    );

    expect(row.edge).toBeNull();
    const fold = resolveFolds([row], [S]).folds[KEY][0];
    expect(fold.a).toEqual([0.25, 0.1]);
    expect(fold.b).toEqual([0.5, 0.1]);
  });

  it('keeps a saved row that is not a drawn inner line full width', () => {
    const line: [Pt2, Pt2] = [
      [100, 30],
      [200, 30],
    ];
    const row = foldFromLine(S, line, [150, 15], { seq: 1, kind: 'inward', source: 'owner' });

    const fold = resolveFolds([row], [S]).folds[KEY][0];
    expect(fold.a).toEqual([0, 0.1]);
    expect(fold.b).toEqual([1, 0.1]);
  });
});

describe('PLEAT wire kind', () => {
  it('round trips the generated enum value', () => {
    const row = { ...hemS(), kind: 'pleat' as const };
    expect(foldToWire(row).kind).toBe('TECH_CARD_PIECE_FOLD_KIND_PLEAT');
    expect(foldFromWire(foldToWire(row))?.kind).toBe('pleat');
  });
});

describe('resolveFolds — grading keeps offset_mm', () => {
  it('lays the hem 30 mm from its edge on S, L and XS', () => {
    const row = hemS();
    for (const piece of [S, L, XS]) {
      const r = resolveFolds([row], [piece]);
      expect(r.unresolved).toEqual([]);
      const fold = r.folds[KEY][0];
      const [ya, yb] = yMm(piece, fold);
      expect(ya).toBeCloseTo(30, 0);
      expect(yb).toBeCloseTo(30, 0);
      expect(Math.abs(ya - 30)).toBeLessThan(0.5);
      // The line spans the piece and keeps its direction; the bottom strip still flips.
      expect(fold.a[0]).toBeCloseTo(0, 3);
      expect(fold.b[0]).toBeCloseTo(1, 3);
      expect(fold.flipAt[1]).toBeLessThan(fold.a[1]);
      expect(fold.kind).toBe('inward');
      expect(fold.seq).toBe(1);
    }
    expect(resolveFolds([row], [S]).via[row.foldKey]).toBe('hint');
    expect(resolveFolds([row], [L]).via[row.foldKey]).toBe('shape');
  });

  it('survives the wire (three-decimal samples)', () => {
    const back = foldFromWire(foldToWire(hemS()));
    expect(back).not.toBeNull();
    const fold = resolveFolds([back!], [L]).folds[KEY][0];
    expect(Math.abs(yMm(L, fold)[0] - 30)).toBeLessThan(0.5);
  });

  it('without a locator scales with the piece (the (u, v) fallback)', () => {
    const row = hemS(null);
    expect(row.edge).toBeNull();
    const r = resolveFolds([row], [L]);
    expect(r.via[row.foldKey]).toBe('uv');
    expect(yMm(L, r.folds[KEY][0])[0]).toBeCloseTo(33, 0);
  });

  // Р1 (owner, 11.11): a fold tied to an edge that is gone is NOT laid by its frame position; it is
  // reported as not found. The (u, v) fallback stays for rows without an edge.
  it('reports a fold whose edge is not on the piece any more, never guesses it by the frame', () => {
    const row = hemS();
    // Samples of an edge no run of this piece matches.
    row.edge = {
      ...row.edge!,
      hint: '',
      samples: row.edge!.samples.map(([u]) => [u * 0.3, 0.5] as Pt2),
    };
    const r = resolveFolds([row], [L]);
    expect(r.folds[KEY]).toBeUndefined();
    expect(r.via[row.foldKey]).toBeUndefined();
    expect(r.unresolved.map((u) => [u.foldKey, u.seq])).toEqual([[row.foldKey, row.seq]]);
    expect(r.unresolved[0].words).toMatch(/edge/);
  });
});

describe('resolveFolds — bounded line across real grading', () => {
  // Production fixture load-balance-SS26-005, detail SLV_M_R on layer 14. This is the exact
  // bounding frame and one layer-8 construction line from each parsed size.
  const sleeveSizes = [
    {
      size: 'XS',
      geom: geomOf(26.171, 66.1377),
      line: [
        [28.269143, 1.611882],
        [26.460305, 121.598271],
      ] as [Pt2, Pt2],
    },
    {
      size: 'M',
      geom: geomOf(29.171, 67.1398),
      line: [
        [29.238869, 1.629948],
        [27.240578, 121.616154],
      ] as [Pt2, Pt2],
    },
    {
      size: 'L',
      geom: geomOf(30.6711, 67.6501),
      line: [
        [30.186891, 1.611882],
        [28.093385, 121.598271],
      ] as [Pt2, Pt2],
    },
  ];

  it('uses the corresponding construction line on XS, M and L', () => {
    const base = sleeveSizes.find((entry) => entry.size === 'M')!;
    const row = foldFromLine(base.geom, base.line, [45, 60], {
      seq: 1,
      kind: 'inward',
      source: 'dxf',
      anchoredSize: 'M',
      edge: null,
    });

    const lengths = sleeveSizes.map(({ size, geom, line }) => {
      const result = resolveFolds([row], [geom], {
        innerLines: new Map([[KEY, [line]]]),
      });
      expect(result.unresolved, size).toEqual([]);
      expect(result.via[row.foldKey], size).toBe('inner');
      const actual = lineMm(geom, result.folds[KEY][0]);
      const direct = Math.hypot(
        actual[0][0] - line[0][0],
        actual[0][1] - line[0][1],
        actual[1][0] - line[1][0],
        actual[1][1] - line[1][1],
      );
      const reverse = Math.hypot(
        actual[1][0] - line[0][0],
        actual[1][1] - line[0][1],
        actual[0][0] - line[1][0],
        actual[0][1] - line[1][1],
      );
      expect(Math.min(direct, reverse), size).toBeLessThan(0.01);
      return Math.hypot(actual[1][0] - actual[0][0], actual[1][1] - actual[0][1]);
    });

    expect(lengths[0]).toBeCloseTo(120.0, 2);
    expect(lengths[1]).toBeCloseTo(120.003, 2);
    expect(lengths[2]).toBeCloseTo(120.005, 2);
  });
});

describe('resolveFolds — order and refusals', () => {
  it('orders a piece by seq', () => {
    const one = hemS();
    const two = foldFromLine(
      S,
      [
        [0, 60],
        [400, 60],
      ],
      [200, 45],
      { seq: 2, kind: 'outward', source: 'owner', foldKey: '01FDKEY0000000000000000002' },
    );
    const r = resolveFolds([two, one], [L]);
    expect(r.folds[KEY].map((f) => f.seq)).toEqual([1, 2]);
    expect(r.folds[KEY][1].kind).toBe('outward');
  });

  it('reports a stale row and a missing piece in words, never a key', () => {
    const stale = { ...hemS(), stale: true };
    const orphan = {
      ...hemS(),
      foldKey: '01FDKEY0000000000000000003',
      pieceKey: '01GONEPIECE000000000000001',
    };
    const r = resolveFolds([stale, orphan], [L], {
      nameOf: (k) => (k === KEY ? 'placket' : 'cuff'),
    });
    expect(r.folds).toEqual({});
    expect(r.unresolved).toHaveLength(2);
    for (const u of r.unresolved) {
      expect(u.words).not.toMatch(/[0-9A-Z]{26}/);
    }
    expect(r.unresolved.map((u) => u.words).join(' ')).toContain('placket');
  });

  it('re-synthesises flipAt when the stored point falls off the piece', () => {
    const row = hemS();
    row.flipAt = [0.5, 0.0005]; // on the very edge: outside after rounding on another size
    const fold = resolveFolds([row], [L]).folds[KEY][0];
    expect(fold.flipAt[1]).toBeLessThan(fold.a[1]);
    expect(fold.flipAt[1]).toBeGreaterThan(0);
  });
});

describe('foldHints', () => {
  const vertical8: Inner[number] = {
    layer: '8',
    closed: false,
    pts: [
      { x: 20, y: 0 },
      { x: 20, y: 30 },
    ],
  };
  const vertical6: Inner[number] = { ...vertical8, layer: '6' };
  const short8: Inner[number] = {
    layer: '8',
    closed: false,
    pts: [
      { x: 5, y: 10 },
      { x: 15, y: 10 },
    ],
  };

  it('reads the layer-8 line of an unfolded piece as a strong dxf hint across the piece', () => {
    const piece = dto(40, 30, [vertical8, short8], true);
    const hints = foldHints(input(piece), segmentPiece(input(piece)));
    expect(hints).toHaveLength(1);
    const [h] = hints;
    expect(h.origin).toBe('unfolded');
    expect(h.strength).toBe('strong');
    expect(h.source).toBe('dxf');
    expect(h.line[0][0]).toBeCloseTo(0.5, 3);
    expect(Math.abs(h.lineMm[1][1] - h.lineMm[0][1])).toBeCloseTo(300, 0);
  });

  it('keeps one hint for a hem line that stops in the middle, with its own ends', () => {
    const line: Inner[number] = {
      layer: '8',
      closed: false,
      pts: [
        { x: 0, y: 2 },
        { x: 20, y: 2 },
      ],
    };
    const piece = dto(40, 30, [line], false);
    const geom = segmentPiece(input(piece));
    expect(geom.marks?.some((mark) => mark.kind === 'fold')).toBe(true);
    const hints = foldHints(input(piece), geom, {
      innerLines: [
        [
          [0, 20],
          [200, 20],
        ],
      ],
    });
    expect(hints).toHaveLength(1);
    expect(hints[0].origin).toBe('inner');
    expect(hints[0].lineMm[1][0]).toBeCloseTo(200, 0);
  });

  it('keeps one hint across the piece for a hem line just short of the contour', () => {
    const line: Inner[number] = {
      layer: '8',
      closed: false,
      pts: [
        { x: 1, y: 2 },
        { x: 39, y: 2 },
      ],
    };
    const piece = dto(40, 30, [line], false);
    const hints = foldHints(input(piece), segmentPiece(input(piece)), {
      innerLines: [
        [
          [10, 20],
          [390, 20],
        ],
      ],
    });
    expect(hints).toHaveLength(1);
    expect(hints[0].origin).toBe('mark');
    expect(Math.abs(hints[0].lineMm[1][0] - hints[0].lineMm[0][0])).toBeCloseTo(400, 0);
  });

  it('ignores layer 8 on a piece that was not unfolded unless the manifest says so', () => {
    const piece = dto(40, 30, [vertical8], false);
    expect(foldHints(input(piece), segmentPiece(input(piece)))).toEqual([]);
    expect(
      foldHints(input(piece), segmentPiece(input(piece)), { unfoldedFold: true }),
    ).toHaveLength(1);
  });

  it('reads the layer-6 mirror line as a weak hint and collapses duplicates', () => {
    const only6 = dto(40, 30, [vertical6]);
    const h6 = foldHints(input(only6), segmentPiece(input(only6)));
    expect(h6.map((h) => [h.origin, h.strength])).toEqual([['mirror', 'weak']]);
    const both = dto(40, 30, [vertical8, vertical6], true);
    const hb = foldHints(input(both), segmentPiece(input(both)));
    expect(hb.map((h) => h.origin)).toEqual(['unfolded']);
  });

  it('turns a fold mark into a hem hint that, accepted, keeps 30 mm on another size', () => {
    const piece = dto(40, 30);
    const mark: PieceMark = {
      id: `${KEY}@0`,
      kind: 'fold',
      layer: '8',
      closed: false,
      pts: [
        [10, 30],
        [390, 30],
      ],
      bbox: { w: 380, h: 0, cx: 200, cy: 30 },
      lenMm: 380,
    };
    const geom = { ...segmentPiece(input(piece)), marks: [mark] };
    const [h] = foldHints(input(piece), geom);
    expect(h.origin).toBe('mark');
    expect(h.source).toBe('accepted_hint');
    expect(h.edge?.offsetMm).toBeCloseTo(30, 1);
    expect(h.lineMm[0][0]).toBeCloseTo(0, 0); // extended to the contour

    const row = foldFromHint(geom, h, { seq: 1, kind: 'inward' });
    expect(row).not.toBeNull();
    expect(row!.source).toBe('accepted_hint');
    const fold = resolveFolds([row!], [L]).folds[KEY][0];
    expect(Math.abs(yMm(L, fold)[0] - 30)).toBeLessThan(0.5);
    expect(fold.flipAt[1]).toBeLessThan(fold.a[1]); // the allowance strip flips by default
  });

  it('offers a straight 204 mm assembly-map inner line as a weak dxf hint', () => {
    const piece = dto(20.4, 30);
    const geom = segmentPiece(input(piece));
    const hints = foldHints(input(piece), geom, {
      innerLines: [
        [
          [0, 150],
          [204, 150],
        ],
      ],
    });

    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({
      id: `${KEY}:inner:0`,
      origin: 'inner',
      strength: 'weak',
      source: 'dxf',
    });
    const row = foldFromHint(geom, hints[0], { seq: 1, kind: 'inward' });
    expect(row).not.toBeNull();
    expect(row!.source).toBe('dxf');
  });

  it('keeps an inner vent line bounded by its own ends', () => {
    const piece = dto(40, 30);
    const geom = segmentPiece(input(piece));
    const [hint] = foldHints(input(piece), geom, {
      innerLines: [
        [
          [200, 90],
          [200, 210],
        ],
      ],
    });

    expect(hint.origin).toBe('inner');
    expect(hint.lineMm).toEqual([
      [200, 90],
      [200, 210],
    ]);
    expect(hint.edge).toBeNull();
    const row = foldFromHint(geom, hint, { seq: 1, kind: 'inward' });
    expect(row).not.toBeNull();
    const resolved = resolveFolds([row!], [geom]).folds[KEY][0];
    expect(yMm(geom, resolved)).toEqual([90, 210]);
  });

  it('does not offer 3, 12 or 25 mm inner lines', () => {
    const piece = dto(40, 30);
    const geom = segmentPiece(input(piece));
    expect(
      foldHints(input(piece), geom, {
        innerLines: [
          [
            [50, 50],
            [53, 50],
          ],
          [
            [50, 80],
            [62, 80],
          ],
          [
            [50, 110],
            [75, 110],
          ],
        ],
      }),
    ).toEqual([]);
  });

  it('does not offer a curved inner line', () => {
    const piece = dto(20.4, 30);
    const geom = segmentPiece(input(piece));
    expect(
      foldHints(input(piece), geom, {
        innerLines: [
          [
            [0, 150],
            [102, 175],
            [204, 150],
          ],
        ],
      }),
    ).toEqual([]);
  });

  it('does not offer an inner line running along the contour', () => {
    const piece = dto(20.4, 30);
    const geom = segmentPiece(input(piece));
    expect(
      foldHints(input(piece), geom, {
        innerLines: [
          [
            [0, 0],
            [204, 0],
          ],
        ],
      }),
    ).toEqual([]);
  });

  it('keeps an identical fold mark as the one hint', () => {
    const piece = dto(20.4, 30);
    const line: [Pt2, Pt2] = [
      [0, 150],
      [204, 150],
    ];
    const mark: PieceMark = {
      id: `${KEY}@0`,
      kind: 'fold',
      layer: '8',
      closed: false,
      pts: line,
      bbox: { w: 204, h: 0, cx: 102, cy: 150 },
      lenMm: 204,
    };
    const geom = { ...segmentPiece(input(piece)), marks: [mark] };
    const hints = foldHints(input(piece), geom, { innerLines: [line] });

    expect(hints).toHaveLength(1);
    expect(hints[0].origin).toBe('mark');
    expect(hints[0].id).toBe(`${KEY}:mark:0`);
  });
});

describe('StepFoldsGroup', () => {
  it('draws inner polylines without a dashed hint line or row icon', () => {
    const piece = dto(20.4, 30);
    const geom = segmentPiece(input(piece));
    const found: FoundPiece = {
      piece,
      block: 'PLACKET',
      size: 'M',
      instances: 1,
      layer: '1',
      sizes: ['M'],
    };
    const markup = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(StepFoldsGroup, {
          stepKey: 'test',
          pieces: [geom],
          shapes: new Map([[pieceRefKey(KEY), found]]),
          grainDeg: new Map([[KEY, 0]]),
          innerLines: new Map<string, Pt2[][]>([
            [
              KEY,
              [
                [
                  [0, 150],
                  [204, 150],
                ],
              ],
            ],
          ]),
          cardId: undefined,
          frozen: false,
        }),
      ),
    );

    expect(markup).toContain('data-fold-inner=""');
    expect(markup).not.toContain('stroke-dasharray');
  });
});
