import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply } from 'lib/assembly-skeleton/union/affine';
import type { StoredFold } from 'lib/folds';
import { describe, expect, it } from 'vitest';
import {
  cardFoldsOf,
  closingFoldsOf,
  foldedActionGlyphs,
  foldedActionLines,
  foldedDrawing,
  foldOnceOf,
  foldPartnersOf,
} from './step-folds';
import { candidateOf, stepLayout } from './step-picture';

const row = (foldKey: string, pieceKey: string, seq = 1): StoredFold =>
  ({ foldKey, pieceKey, seq }) as StoredFold;

describe('closingFoldsOf', () => {
  it('names the piece whose fold closes here, with every fold it holds by then', () => {
    const ops = [{ foldKeys: ['a'] }, {}, { foldKeys: ['b'] }];
    const rows = [row('a', 'FLAP_L', 1), row('b', 'flap_l', 2), row('c', 'FLAP_R')];
    expect(closingFoldsOf(ops, 0, rows)).toEqual([{ pieceKey: 'FLAP_L', rows: [rows[0]] }]);
    expect(closingFoldsOf(ops, 1, rows)).toEqual([]);
    expect(closingFoldsOf(ops, 2, rows)).toEqual([
      { pieceKey: 'flap_l', rows: [rows[0], rows[1]] },
    ]);
  });

  it('a fold no step names stays flat', () => {
    expect(closingFoldsOf([{}, {}], 1, [row('a', 'FLAP_L')])).toEqual([]);
  });
});

// A rectangle in the fold tests' frame: 80 × 200, edge k walks bottom, right, top, left.
const flap = (pieceKey = 'FLAP', width = 80, height = 200): PieceGeom => {
  const rs: Pt2[] = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ];
  return {
    pieceKey,
    name: pieceKey,
    hand: null,
    cloth: null,
    rs,
    corners: [0, 1, 2, 3],
    notchIdx: [],
    edges: rs.map((point, k) => {
      const next = rs[(k + 1) % 4];
      const lenMm = Math.hypot(next[0] - point[0], next[1] - point[1]);
      return {
        id: `${pieceKey}#${k}`,
        pieceKey,
        k,
        s: k,
        e: (k + 1) % 4,
        pts: [point, next],
        lenMm,
        chordMm: lenMm,
        turnDeg: 0,
        notchesMm: [],
        kind: 'edge' as const,
      };
    }),
    rect: true,
    areaMm2: width * height,
    perimMm: 2 * (width + height),
    twinOf: [],
  } as PieceGeom;
};

const midFold = (pieceKey = 'FLAP', foldKey = 'fold', u = 0.5, flipU = 0.25): StoredFold => ({
  foldKey,
  pieceKey,
  seq: 1,
  kind: 'inward',
  source: 'owner',
  line: [
    [u, 0],
    [u, 1],
  ],
  flipAt: [flipU, 0.5],
  edge: null,
  contourSig: '',
  anchoredSize: 'M',
  note: '',
  stale: false,
});

const boxX = (ring: readonly Pt2[]) => {
  const xs = ring.map((point) => point[0]);
  return [Math.min(...xs), Math.max(...xs)];
};

describe('cardFoldsOf', () => {
  const geoms = new Map([['FLAP', flap()]]);
  const card = { rows: [midFold()], grainDeg: new Map([['FLAP', 0]]) };

  it('no step names a fold: nothing changes anywhere', () => {
    expect(cardFoldsOf([{}, { foldKeys: [] }], card, geoms)).toBeNull();
    expect(cardFoldsOf([{ foldKeys: ['fold'] }], undefined, geoms)).toBeNull();
  });

  it('flat before the step, closing on it, folded after it, one fold set one drawing', () => {
    const at = cardFoldsOf([{}, { foldKeys: ['fold'] }, {}, {}], card, geoms)!;
    expect(at(0)).toBeNull();
    expect(at(1)?.closing).toEqual(['FLAP']);
    expect(at(2)?.closing).toEqual([]);
    expect(at(1)?.flat.get('FLAP')).toHaveLength(1);
    expect(at(3)?.flat).toBe(at(1)?.flat);
  });

  it('a row that cannot be laid on this size stays flat', () => {
    const at = cardFoldsOf(
      [{ foldKeys: ['fold'] }],
      { rows: [midFold('GONE')], grainDeg: new Map() },
      geoms,
    );
    expect(at?.(0) ?? null).toBeNull();
  });
});

describe('foldedDrawing', () => {
  const geoms = new Map([['FLAP', flap()]]);
  const innerLines = new Map<string, Pt2[][]>([
    [
      'FLAP',
      [
        [
          [0, 50],
          [80, 50],
        ],
      ],
    ],
  ]);
  const stepOf = (rows = [midFold()], pieces = geoms) =>
    cardFoldsOf(
      [{ foldKeys: rows.map((row) => row.foldKey) }],
      { rows, grainDeg: new Map() },
      pieces,
    )!(0)!;

  it('hands back the very maps it got when nothing is folded', () => {
    const drawing = foldedDrawing(geoms, innerLines, undefined);
    expect(drawing.geoms).toBe(geoms);
    expect(drawing.innerLines).toBe(innerLines);
    expect(drawing.turned.size).toBe(0);
  });

  it('draws the 80 wide piece 40 wide on its never-moved half, flat geoms untouched', () => {
    const before = JSON.stringify(geoms.get('FLAP'));
    const drawing = foldedDrawing(geoms, innerLines, stepOf().flat);
    const folded = drawing.geoms.get('FLAP')!;
    expect(boxX(folded.rs)).toEqual([40, 80]);
    expect(JSON.stringify(geoms.get('FLAP'))).toBe(before);
    expect(folded.edges.map((edge) => [edge.id, edge.k])).toEqual(
      geoms.get('FLAP')!.edges.map((edge) => [edge.id, edge.k]),
    );
    // the left edge, moved, lies on the right one; the arc of the bottom edge keeps its 80 mm
    expect(boxX(folded.edges[3].pts)).toEqual([80, 80]);
    expect(boxX(folded.edges[1].pts)).toEqual([80, 80]);
    const bottom = folded.edges[0].pts;
    const arc = bottom
      .slice(1)
      .reduce(
        (sum, point, index) =>
          sum + Math.hypot(point[0] - bottom[index][0], point[1] - bottom[index][1]),
        0,
      );
    expect(arc).toBeCloseTo(80, 6);
    expect(boxX(drawing.innerLines!.get('FLAP')![0])).toEqual([40, 80]);
    expect(drawing.turned.get('FLAP')?.some((ply) => ply.under)).toBe(true);
  });

  it('is computed once per fold set', () => {
    const { flat } = stepOf();
    expect(foldedDrawing(geoms, innerLines, flat)).toBe(foldedDrawing(geoms, innerLines, flat));
  });

  it('the larger part folds away: the ring covers it, the kept ply stays the frame', () => {
    const wide = new Map([['WIDE', flap('WIDE', 100, 200)]]);
    const { flat } = stepOf([midFold('WIDE', 'fold', 0.7, 0.1)], wide);
    const drawing = foldedDrawing(wide, undefined, flat);
    expect(boxX(drawing.geoms.get('WIDE')!.rs)).toEqual([70, 140]);
    const kept = drawing.turned.get('WIDE')?.find((ply) => !ply.under && boxX(ply.ring)[1] === 100);
    expect(kept && boxX(kept.ring)).toEqual([70, 100]);
  });
});

describe('fold marks', () => {
  const geoms = new Map([['FLAP', flap()]]);
  const { flat } = cardFoldsOf(
    [{ foldKeys: ['fold'] }],
    { rows: [midFold()], grainDeg: new Map() },
    geoms,
  )!(0)!;

  it('keeps the same arrays when nothing is folded', () => {
    const lines = [{ piece: 'FLAP', points: [[0, 0] as Pt2] }];
    const glyphs = [{ piece: 'FLAP', point: [0, 0] as Pt2 }];
    expect(foldedActionLines(lines, undefined)).toBe(lines);
    expect(foldedActionGlyphs(glyphs, new Map())).toBe(glyphs);
  });

  it('turns a mark on the moved half with the cloth', () => {
    const [line] = foldedActionLines(
      [
        {
          piece: 'FLAP',
          points: [
            [10, 0],
            [10, 200],
          ] as Pt2[],
        },
      ],
      flat,
    );
    expect(line.points).toEqual([
      [70, 0],
      [70, 200],
    ]);
    const [glyph] = foldedActionGlyphs(
      [
        {
          piece: 'FLAP',
          point: [10, 100] as Pt2,
          direction: [1, 0] as Pt2,
          markBox: { cx: 20, cy: 40 },
        },
      ],
      flat,
    );
    expect(glyph.point).toEqual([70, 100]);
    expect(glyph.direction?.[0]).toBeCloseTo(-1, 6);
    expect(glyph.markBox).toEqual({ cx: 60, cy: 40 });
  });
});

describe('coincident folded edges', () => {
  const geoms = new Map([['FLAP', flap()]]);
  const step = cardFoldsOf(
    [{ foldKeys: ['fold'] }],
    { rows: [midFold()], grainDeg: new Map() },
    geoms,
  )!(0)!;

  it('a click takes both flat edges, the clicked one first', () => {
    expect(foldPartnersOf('FLAP#3', step, geoms, undefined)).toEqual(['FLAP#3', 'FLAP#1']);
    expect(foldPartnersOf('FLAP#1', step, geoms, undefined)).toEqual(['FLAP#1', 'FLAP#3']);
  });

  it('an edge nothing folds onto, and any edge with no fold, stands for itself', () => {
    expect(foldPartnersOf('FLAP#0', step, geoms, undefined)).toEqual(['FLAP#0']);
    expect(foldPartnersOf('FLAP#3', undefined, geoms, undefined)).toEqual(['FLAP#3']);
  });

  it('the fit keeps the never-moved edge of a run folded onto itself', () => {
    const part = (k: number) => ({
      id: `FLAP#${k}`,
      piece: 'FLAP',
      pts: geoms.get('FLAP')!.edges[k].pts,
      lenMm: 200,
    });
    expect(foldOnceOf(step, geoms, undefined)([part(3), part(1)])).toEqual(['FLAP#1']);
  });
});

describe('manual fit across a closed fold', () => {
  const geoms = new Map([
    ['FLAP', flap()],
    ['SIDE', flap('SIDE', 40, 200)],
  ]);
  const step = cardFoldsOf(
    [{ foldKeys: ['fold'] }],
    { rows: [midFold()], grainDeg: new Map() },
    geoms,
  )!(0)!;
  const seam = candidateOf({ a: ['SIDE#1'], b: ['FLAP#1', 'FLAP#3'] }, geoms)!;
  const midOf = (layout: ReturnType<typeof stepLayout>, key: string, k: number) => {
    const [a, b] = geoms.get(key)!.edges[k].pts.map((point) => apply(layout.T.get(key)!, point));
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };

  it('takes the coincident run once, on the never-moved edge', () => {
    const layout = stepLayout([['SIDE'], ['FLAP']], [seam], geoms, {
      manualFit: true,
      foldOnce: foldOnceOf(step, geoms, undefined),
    });
    const [sx, sy] = midOf(layout, 'SIDE', 1);
    const [fx, fy] = midOf(layout, 'FLAP', 1);
    expect(Math.hypot(sx - fx, sy - fy)).toBeLessThanOrEqual(0.5);
  });

  it('without a fold the run stays what it was', () => {
    const plain = stepLayout([['SIDE'], ['FLAP']], [seam], geoms, { manualFit: true });
    const same = stepLayout([['SIDE'], ['FLAP']], [seam], geoms, {
      manualFit: true,
      foldOnce: () => ['FLAP#1', 'FLAP#3'],
    });
    expect([...same.T]).toEqual([...plain.T]);
  });
});
