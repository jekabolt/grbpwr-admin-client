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
  /**
   * TILESTEP: `shapes` plus the long ops of 4–5 vertices (a rectangle, a marker's simple piece) —
   * used only to CHECK a step got elsewhere (group.ts latticeCheck), never to set one.
   */
  loose: OpShape[];
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
 * Furniture within ±0.3 mm: a row of tiles may print its frame a hair off the others' (Alghero
 * rows K–L sit 0.2 mm lower — their corner crosses would otherwise read as drawing on the edge).
 */
export function nearFurniture(furniture: Set<string>, v: { x: number; y: number }): boolean {
  if (!furniture.size) return false;
  const kx = Math.round(v.x * 10);
  const ky = Math.round(v.y * 10);
  for (let dx = -3; dx <= 3; dx++)
    for (let dy = -3; dy <= 3; dy++) if (furniture.has(`${kx + dx},${ky + dy}`)) return true;
  return false;
}

export type Side = 'L' | 'R' | 'T' | 'B';

// The clean stage's background flags are not read: registration works on the page as printed
// (the overlap strip a tile repeats may be flagged on one tile and not its neighbour).
const drawable = (path: IRPage['paths'][number], furniture: Set<string>) =>
  path.pts.length >= 2 && !path.pts.every((v) => nearFurniture(furniture, v));

/**
 * Where the drawing meets one edge of the page: endpoints of open strokes within 1 mm of it (a
 * line cut at the tile edge) and points where a segment crosses it (a line drawn whole, the page a
 * window onto it — Alghero's column lines run the length of the sheet on every tile — or a dash
 * mark straddling the edge). Page furniture (±0.3 mm), lines lying along the edge, and the first
 * and last `marginMm` of the edge (the overlap corners: registration targets) are left out.
 * Drawing that meets a tile's edge goes on in the tile beyond it — the evidence for a missing
 * tile, and against a misplaced one.
 */
export function edgeCrossings(
  pg: IRPage,
  side: Side,
  furniture: Set<string>,
  marginMm = 0,
): (PtMm & { mark: boolean })[] {
  const W = pg.widthMm;
  const H = pg.heightMm;
  const vertical = side === 'L' || side === 'R';
  const at = side === 'R' ? W : side === 'T' ? H : 0;
  const len = vertical ? H : W;
  const across = (v: { x: number; y: number }) => (vertical ? v.x : v.y) - at;
  const along = (v: { x: number; y: number }) => (vertical ? v.y : v.x);
  const out: (PtMm & { mark: boolean })[] = [];
  let mark = false;
  const push = (t: number) => {
    if (t < marginMm || t > len - marginMm) return;
    const v = vertical ? { x: at, y: t } : { x: t, y: at };
    if (!nearFurniture(furniture, v)) out.push({ ...v, mark });
  };
  for (const path of pg.paths) {
    if (!drawable(path, furniture)) continue;
    // a line along the edge (a frame side, a trim line) — not a mark that straddles it
    if (path.pts.every((v) => Math.abs(across(v)) < 1)) {
      const ts = path.pts.map(along);
      if (Math.max(...ts) - Math.min(...ts) > 3) continue;
    }
    const pts = path.closed ? [...path.pts, path.pts[0]] : path.pts;
    const st = pg.styles[path.style];
    const stroke = !(st?.fill && !st.widthMm);
    // a dash mark (Alghero draws its dashed lines as rows of tiny filled triangles): it says the
    // line goes on, but the next tile prints its own marks at their own phase
    const xs = path.pts.map((v) => v.x);
    const ys = path.pts.map((v) => v.y);
    mark = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 5;
    if (!path.closed && stroke)
      for (const v of [pts[0], pts[pts.length - 1]])
        if (Math.abs(across(v)) < 1 && !nearFurniture(furniture, v)) push(along(v));
    for (let i = 1; i < pts.length; i++) {
      const a = across(pts[i - 1]);
      const b = across(pts[i]);
      if (!(a < -1e-6 && b > 1e-6) && !(a > 1e-6 && b < -1e-6)) continue;
      const t = along(pts[i - 1]) + ((along(pts[i]) - along(pts[i - 1])) * a) / (a - b);
      push(t);
    }
  }
  return out;
}

const segCache = new WeakMap<IRPage, Map<Set<string>, Float64Array>>();

/** Does the page's drawing (furniture aside) pass within `tolMm` of the point? */
export function drawsThrough(
  pg: IRPage,
  q: { x: number; y: number },
  furniture: Set<string>,
  tolMm: number,
): boolean {
  let byFur = segCache.get(pg);
  if (!byFur) segCache.set(pg, (byFur = new Map()));
  let segs = byFur.get(furniture);
  if (!segs) {
    const list: number[] = [];
    for (const path of pg.paths) {
      if (!drawable(path, furniture)) continue;
      const pts = path.closed ? [...path.pts, path.pts[0]] : path.pts;
      for (let i = 1; i < pts.length; i++)
        list.push(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    }
    segs = Float64Array.from(list);
    byFur.set(furniture, segs);
  }
  for (let k = 0; k < segs.length; k += 4) {
    const ax = segs[k];
    const ay = segs[k + 1];
    const dx = segs[k + 2] - ax;
    const dy = segs[k + 3] - ay;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.y - ay) * dy) / L2)) : 0;
    if (Math.hypot(ax + t * dx - q.x, ay + t * dy - q.y) <= tolMm) return true;
  }
  return false;
}

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

/**
 * The tile's printed area. A page traced from a raster (F11) is tiled by its IMAGE, not by the
 * paper: leonie's images abut exactly (A1 ends at x 200.8 where A2 starts at x 9.0) while the
 * A4 page around them is margin. Vector pages: the page rectangle.
 */
export function tileRectOf(src: IRPage): BoxMm {
  if (src.calibration && src.rasters.length) {
    let best = src.rasters[0];
    const area = (r: typeof best) => (r.bbox.maxX - r.bbox.minX) * (r.bbox.maxY - r.bbox.minY);
    for (const r of src.rasters) if (area(r) > area(best)) best = r;
    return { ...best.bbox };
  }
  return { minX: 0, minY: 0, maxX: src.widthMm, maxY: src.heightMm };
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
  const loose: OpShape[] = [];
  for (const [op, subs] of ops) {
    let len = 0;
    let count = 0;
    for (const s of subs) {
      count += s.length;
      for (let i = 1; i < s.length; i++)
        len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
    }
    if (count < 4 || len < minShapeMm) continue;
    const sh = { op, pts: subs.flat(), lengthMm: len };
    loose.push(sh);
    if (count >= 6) shapes.push(sh);
  }
  return {
    key: pageKey(src.file, src.page),
    file: src.file,
    page: src.page,
    idx,
    rot,
    rect: rotBox(tileRectOf(src), rot),
    xs,
    ys,
    axs,
    ays,
    shapes,
    loose,
    src,
  };
}
