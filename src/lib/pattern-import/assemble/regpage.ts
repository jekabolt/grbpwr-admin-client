// assemble (F2) — the registration view of one page: vertices for edge voting, whole drawing ops
// for recurrence, the page rectangle, all in the page's REGISTRATION FRAME = the page frame turned
// about its origin by `rot` (a quarter turn for a page whose orientation differs from its group).
// Out-of-page geometry is kept on purpose (Codex H6 / 08-CONTRACT §1): tiles of windowed sheets
// (Burda, kombinezon, blazer) carry the whole neighbouring drawing beyond their edge, and that is
// exactly what recurrence registers on.

import type { BoxMm, FileId, IRPage, PageIndex, PtMm } from 'lib/pattern-import/types';

export type Rot = 0 | 90 | 180 | 270;

/** Page frame → registration frame: rotation by `rot` degrees CCW about the page origin. */
export function rotPt(p: PtMm, rot: Rot): PtMm {
  switch (rot) {
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
    default:
      return p;
  }
}

export function rotBox(b: BoxMm, rot: Rot): BoxMm {
  const a = rotPt({ x: b.minX, y: b.minY }, rot);
  const c = rotPt({ x: b.maxX, y: b.maxY }, rot);
  return {
    minX: Math.min(a.x, c.x),
    minY: Math.min(a.y, c.y),
    maxX: Math.max(a.x, c.x),
    maxY: Math.max(a.y, c.y),
  };
}

export const pageKey = (file: FileId, page: PageIndex) => `${file}:${page}`;

/** One drawing operation (all subpaths of one PDF path op) — the unit that recurs across tiles. */
export type OpShape = { op: number; pts: PtMm[]; lengthMm: number };

export type RegPage = {
  key: string;
  file: FileId;
  page: PageIndex;
  /** Index inside its tile group (reading order of the file). */
  idx: number;
  rot: Rot;
  /** Page rectangle in the registration frame. */
  rect: BoxMm;
  /**
   * CONTENT vertices (registration frame): strokes minus rulings and page furniture. They decide
   * WHO is whose neighbour — furniture sits at the same page position on every tile and would
   * make any two pages look adjacent.
   */
  xs: Float64Array;
  ys: Float64Array;
  /**
   * ALL stroke vertices, furniture and rulings included. Once adjacency is known they measure the
   * offset — the corner targets and frame ticks ARE the printed alignment marks (reef row F has
   * only horizontal hem lines, which fit any horizontal shift; its targets do not).
   */
  axs: Float64Array;
  ays: Float64Array;
  /** Long ops for recurrence, registration frame. */
  shapes: OpShape[];
  src: IRPage;
};

const AXIS_EPS = 0.02;

/**
 * Paths that look like a printed ruling (1 cm grid, sheet grid, page frame): straight, axis-aligned,
 * 2 points, ≥ 20 mm, in a style that has many of them. They are identical on every tile, so they
 * vote for every pair of pages alike — useless for deciding who is whose neighbour.
 */
function rulingPaths(page: IRPage): Set<number> {
  const byStyle = new Map<number, { all: number; axis: number[] }>();
  for (const p of page.paths) {
    const e = byStyle.get(p.style) ?? { all: 0, axis: [] };
    e.all++;
    if (p.pts.length === 2) {
      const [a, b] = p.pts;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len >= 20 && (Math.abs(a.x - b.x) < AXIS_EPS || Math.abs(a.y - b.y) < AXIS_EPS))
        e.axis.push(p.id);
    }
    byStyle.set(p.style, e);
  }
  const out = new Set<number>();
  for (const e of byStyle.values())
    if (e.axis.length >= 8 && e.axis.length >= 0.5 * e.all) for (const id of e.axis) out.add(id);
  return out;
}

const posKey = (x: number, y: number) => `${Math.round(x * 10)},${Math.round(y * 10)}`;

/**
 * Vertices that sit at the same PAGE position on many pages of a group are page furniture — the
 * frame, overlap rulers, corner ticks, glue triangles, logos. They vote for the page pitch between
 * ANY two pages (reef: every pair "agrees" on dy = −266.7 through its frame), so they are removed
 * from stitch voting. Real drawing never repeats at one page position on most tiles.
 */
export function furnitureOf(pages: IRPage[]): Set<string> {
  const out = new Set<string>();
  if (pages.length < 3) return out;
  const count = new Map<string, number>();
  for (const pg of pages) {
    const seen = new Set<string>();
    for (const p of pg.paths) for (const q of p.pts) seen.add(posKey(q.x, q.y));
    for (const k of seen) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const min = Math.max(3, Math.ceil(0.4 * pages.length));
  for (const [k, n] of count) if (n >= min) out.add(k);
  return out;
}

export function buildRegPage(
  src: IRPage,
  idx: number,
  rot: Rot,
  furniture: Set<string> = new Set(),
  minShapeMm = 150,
): RegPage {
  const ruling = rulingPaths(src);
  // Filled paths (letters drawn as curves, arrows) repeat along a line at regular spacing and vote
  // for that spacing exactly (reef: 12.05 / 16.07 mm runner-up peaks); stitching uses strokes.
  const isFill = (p: IRPage['paths'][number]) =>
    src.styles[p.style]?.fill === true && src.styles[p.style]?.widthMm === 0;
  const isContent = (p: IRPage['paths'][number], q: PtMm) =>
    !ruling.has(p.id) && !(furniture.size && furniture.has(posKey(q.x, q.y)));
  let n = 0;
  let na = 0;
  for (const p of src.paths) {
    if (isFill(p)) continue;
    na += p.pts.length;
    for (const q of p.pts) if (isContent(p, q)) n++;
  }
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const axs = new Float64Array(na);
  const ays = new Float64Array(na);
  let k = 0;
  let ka = 0;
  // Ops: subpaths of one paint operator, in subpath order.
  const ops = new Map<number, PtMm[][]>();
  for (const p of src.paths) {
    const pts = rot ? p.pts.map((q) => rotPt(q, rot)) : p.pts;
    if (!isFill(p)) {
      for (let i = 0; i < pts.length; i++) {
        axs[ka] = pts[i].x;
        ays[ka] = pts[i].y;
        ka++;
        if (!isContent(p, p.pts[i])) continue;
        xs[k] = pts[i].x;
        ys[k] = pts[i].y;
        k++;
      }
    }
    // Recurrence uses stroked drawing only: a filled logo or label printed on every piece
    // (blazer's TACHYS mark) recurs between DIFFERENT instances and fakes offsets.
    if (isFill(p)) continue;
    const list = ops.get(p.src.op);
    if (list) list.push(pts);
    else ops.set(p.src.op, [pts]);
  }
  const shapes: OpShape[] = [];
  for (const [op, subs] of ops) {
    let len = 0;
    let count = 0;
    for (const s of subs) {
      count += s.length;
      for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    }
    if (count < 6 || len < minShapeMm) continue;
    shapes.push({ op, pts: subs.flat(), lengthMm: len });
  }
  return {
    key: pageKey(src.file, src.page),
    file: src.file,
    page: src.page,
    idx,
    rot,
    rect: rotBox({ minX: 0, minY: 0, maxX: src.widthMm, maxY: src.heightMm }, rot),
    xs,
    ys,
    axs,
    ays,
    shapes,
    src,
  };
}
