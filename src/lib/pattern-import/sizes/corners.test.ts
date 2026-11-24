import { describe, expect, it } from 'vitest';

import type { Chain, PtMm, Style } from '../types';
import { type CornerMark, closeCorners } from './corners';

// MOOD Ф2 EXTEND carries two open own ends of one size to the crossing of their tangents only with
// a second evidence. With no neighbouring size to show the trend, the only one left is CROSS: the
// PDF inks the corner as a crossing — each edge runs on past the vertex in a short solid piece of
// the size's ink and pen width (Valentina's hem corners, drawn in another graphic state).

const style = (id: number, widthMm: number): Style => ({
  id,
  strokeRgb: [32, 29, 30],
  widthMm,
  dash: null,
  layer: null,
  fill: false,
  clip: null,
});
const STYLES = new Map<number, Style>([
  [0, style(0, 0.35)],
  [1, style(1, 0.49)],
  [2, style(2, 0.7)],
]);

let next = 0;
function poly(pts: PtMm[], style = 0): Chain {
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { id: next++, pts, closed: false, ranges: [], motif: null, style, lengthMm: len };
}
/** A straight chain, a vertex every mm. */
function line(a: PtMm, b: PtMm, style = 0): Chain {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.ceil(len));
  return poly(
    Array.from({ length: n + 1 }, (_, i) => ({
      x: a.x + ((b.x - a.x) * i) / n,
      y: a.y + ((b.y - a.y) * i) / n,
    })),
    style,
  );
}

/**
 * Ten corners closed by their stubs (the sheet's convention) and one open corner at (2000, 0)
 * whose own ends stop 4 mm short of it; `witnesses` are drawn through that vertex.
 */
function run(
  witnesses: Chain[],
  ownWidths: number[] = [0],
  marks: CornerMark[] = [],
  taken: number[] = [],
  ownTaken: [number, number[]] | [] = [],
  through: PtMm[] = [],
) {
  next = 0;
  const own: Chain[] = [];
  const other: Chain[] = [];
  for (let k = 0; k < 10; k++) {
    const x = k * 100;
    own.push(line({ x: x - 50, y: 0 }, { x: x - 5, y: 0 }));
    own.push(line({ x, y: 50 }, { x, y: 5 }));
    other.push(
      poly([
        { x: x - 5, y: 0 },
        { x, y: 0 },
        { x, y: 5 },
      ]),
    );
  }
  own.push(line({ x: 1950, y: 0 }, { x: 1996, y: 0 }));
  own.push(line({ x: 2000, y: 50 }, { x: 2000, y: 4 }));
  // a far line of the same size in each further pen width
  for (const w of ownWidths.slice(1))
    own.push(line({ x: 0, y: 500 + 50 * w }, { x: 300, y: 500 + 50 * w }, w));
  // the size's own glyph: its first line is drawn in 1 mm circles (path 900)
  if (marks.length) own[0] = { ...own[0], ranges: [{ path: 900, from: 0, to: 1 }] };
  // glyphs `ownTaken` are made into `line` (an own line of the size: 0, or the joined edge: 20)
  const [onto, ids] = ownTaken;
  if (onto !== undefined && ids?.length)
    own[onto] = { ...own[onto], ranges: ids.map((path) => ({ path, from: 0, to: 1 })) };
  // the joined edge (own line 20) drawn on from its far end along `through` first
  if (through.length) own[20] = poly([...through, ...own[20].pts]);
  const chains = [...own, ...other].map((c, id) => ({ ...c, id }));
  for (const w of witnesses) chains.push({ ...w, id: chains.length });
  const rankOf = new Map(own.map((_, i) => [i, 0]));
  // another size's line that took these glyphs
  if (taken.length) {
    const c = line({ x: 0, y: 900 }, { x: 300, y: 900 });
    rankOf.set(chains.length, 1);
    chains.push({
      ...c,
      id: chains.length,
      ranges: taken.map((path) => ({ path, from: 0, to: 1 })),
    });
  }
  const all = marks.length ? [glyph(900, 500, 500), ...marks] : [];
  return closeCorners(
    chains,
    rankOf,
    STYLES,
    (c) => rankOf.get(c) === 0,
    (c) => !rankOf.has(c),
    taken.length ? 2 : 1,
    all,
  );
}

function glyph(path: number, x: number, y: number, size = 1, closed = true): CornerMark {
  return { path, c: { x, y }, size, closed, style: 0 };
}
/** Glyphs running from each own end into the vertex (2000, 0), 2 mm apart. */
const glyphsX = (size = 1, closed = true) => [
  glyph(901, 1997.5, 0, size, closed),
  glyph(902, 1999.5, 0, size, closed),
];
const glyphsY = () => [glyph(903, 2000, 2.5), glyph(904, 2000, 0.5)];

const alongX = (style = 0) => line({ x: 1998.5, y: 0 }, { x: 2001.5, y: 0 }, style);
const alongY = (style = 0) => line({ x: 2000, y: -1.5 }, { x: 2000, y: 1.5 }, style);

describe('closeCorners · EXTEND with CROSS', () => {
  it('without a second evidence the open corner stays open (off the trend)', () => {
    const out = run([]);
    expect(out.stubs).toBe(10);
    expect(out.extended).toBe(0);
    expect(out.refused['extend: off the trend']).toBe(1);
  });

  it('closes the corner when both edges run on through the vertex', () => {
    const out = run([alongX(), alongY()]);
    expect(out.extended).toBe(1);
    expect(out.crossed).toBe(1);
  });

  it('a crossing piece on one edge only is not enough', () => {
    const out = run([alongX()]);
    expect(out.extended).toBe(0);
    expect(out.refused['extend: off the trend']).toBe(1);
  });

  it('accepts a witness in another width the size pen uses, refuses a foreign width', () => {
    // a pre-dashed pen draws the size in two widths: the other one counts once a line of the size
    // is drawn in it
    expect(run([alongX(), alongY(1)]).extended).toBe(0);
    expect(run([alongX(), alongY(1)], [0, 1]).crossed).toBe(1);
    expect(run([alongX(), alongY(2)], [0, 1]).extended).toBe(0);
  });
});

describe('closeCorners · EXTEND with MARKS', () => {
  it("closes the corner when both edges run into the vertex in the size's own glyphs", () => {
    const out = run([], [0], [...glyphsX(), ...glyphsY()]);
    expect(out.extended).toBe(1);
    expect(out.marked).toBe(1);
  });

  it('a glyph run on one edge only is not enough', () => {
    const out = run([], [0], glyphsX());
    expect(out.extended).toBe(0);
    expect(out.refused['extend: off the trend']).toBe(1);
  });

  it('a mark in another shape (an open stroke, a larger glyph) is not the size', () => {
    expect(run([], [0], [...glyphsX(1, false), ...glyphsY()]).extended).toBe(0);
    expect(run([], [0], [...glyphsX(2), ...glyphsY()]).extended).toBe(0);
  });

  it("a glyph another size's line is made of is not this size's", () => {
    // control: a second size whose line takes a glyph off the corner changes nothing
    expect(run([], [0], [...glyphsX(), ...glyphsY()], [900]).marked).toBe(1);
    expect(run([], [0], [...glyphsX(), ...glyphsY()], [902]).extended).toBe(0);
  });

  it('a glyph the joined line itself runs through is that line, not a mark (Ambrosia 26)', () => {
    // the joined edge's line comes back past its own head through the glyph at 1999.5: the
    // glyph "leads" into the vertex but is the line itself
    const hook = [
      { x: 1999.5, y: -0.3 },
      { x: 1999.5, y: -20 },
      { x: 1950, y: -20 },
    ];
    expect(run([], [0], [...glyphsX(), ...glyphsY()], [], [], hook).marked).toBe(0);
  });

  it("a glyph in the joined line's PDF path, off its geometry, still marks (Estoril 3XL)", () => {
    // one PDF path carries many glyphs; the line made of part of it does not own the rest
    expect(run([], [0], [...glyphsX(), ...glyphsY()], [], [20, [902]]).marked).toBe(1);
  });

  it('one edge crossing, the other marked, closes as marked', () => {
    const out = run([alongX()], [0], glyphsY());
    expect(out.extended).toBe(1);
    expect(out.crossed).toBe(0);
    expect(out.marked).toBe(1);
  });
});

/**
 * One corner graded over 8 sizes: size k's vertex at (3000 + 1.5k, −1.5k), a horizontal edge in
 * from the left and a vertical edge down from above. `closed` sizes draw the corner through the
 * vertex; size `open` stops `short` mm before it on both edges. Ten stubbed corners of size 0
 * elsewhere give the sheet its stub convention.
 */
function graded(closed: number[], open: number, short: number, shift = 0) {
  next = 0;
  const chains: Chain[] = [];
  const rankOf = new Map<number, number>();
  const add = (c: Chain, r: number) => {
    rankOf.set(chains.length, r);
    chains.push({ ...c, id: chains.length });
  };
  for (let k = 0; k < 10; k++) {
    const x = k * 100;
    add(line({ x: x - 50, y: 0 }, { x: x - 5, y: 0 }), 0);
    add(line({ x, y: 50 }, { x, y: 5 }), 0);
  }
  for (let k = 0; k < 10; k++) {
    const x = k * 100;
    chains.push({
      ...poly([
        { x: x - 5, y: 0 },
        { x, y: 0 },
        { x, y: 5 },
      ]),
      id: chains.length,
    });
  }
  const v = (k: number) => ({ x: 3000 + 1.5 * k, y: -1.5 * k });
  for (const k of closed)
    add(
      poly([
        { x: 2950, y: v(k).y },
        { x: v(k).x - 1, y: v(k).y },
        v(k),
        { x: v(k).x, y: v(k).y + 1 },
        { x: v(k).x, y: 50 },
      ]),
      k,
    );
  const o = { x: v(open).x + shift, y: v(open).y - shift };
  add(line({ x: 2950, y: o.y }, { x: o.x - short, y: o.y }), open);
  add(line({ x: o.x, y: 50 }, { x: o.x, y: o.y + short }), open);
  return closeCorners(
    chains,
    rankOf,
    STYLES,
    (c) => rankOf.has(c),
    (c) => !rankOf.has(c),
    8,
    [],
  );
}

describe('closeCorners · EXTEND by the trend of the whole run', () => {
  it('leans on closed sizes more than 3 sizes away (Leah size 8)', () => {
    // sizes 5, 6, 7 are closed; size 1 has no closed neighbour within 3 sizes
    const out = graded([5, 6, 7], 1, 4);
    expect(out.extended).toBe(1);
    expect(out.wide).toBe(0);
  });

  it('continuing a far step needs a third witness on the grading line', () => {
    const out = graded([5, 6], 1, 4);
    expect(out.extended).toBe(0);
    expect(out.refused['extend: off the trend']).toBe(1);
  });

  it('a vertex off the grading line stays open', () => {
    // control: on the grade it closes; 2 mm out on both axes (2.8 mm, step 2.1 mm) it does not
    expect(graded([0, 2, 3], 1, 4).extended).toBe(1);
    const off = graded([0, 2, 3], 1, 4, 2);
    expect(off.extended).toBe(0);
    expect(off.refused['extend: off the trend']).toBe(1);
  });
});

describe('closeCorners · WIDE extend (ends past 8 mm)', () => {
  it('closes on the trend of three closed sizes (Leah size 4)', () => {
    const out = graded([0, 2, 3], 1, 6);
    expect(out.extended).toBe(1);
    expect(out.wide).toBe(1);
  });

  it('two closed sizes are not enough for a wide extend', () => {
    const out = graded([0, 2], 1, 6);
    expect(out.extended).toBe(0);
    expect(out.refused['extend: wide, trend too thin']).toBe(1);
  });

  it('past 15 mm nothing is a candidate', () => {
    const out = graded([0, 2, 3], 1, 11);
    expect(out.extended).toBe(0);
  });
});
