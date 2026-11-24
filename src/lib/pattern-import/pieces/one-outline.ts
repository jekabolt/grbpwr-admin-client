// A piece drawn ONCE for every size.
//
// A pocket bag, a welt, a belt loop is often the same in every size: the sheet draws one outline in
// a line that carries no size. No size class holds it, so no rank closes and every size of the
// piece leaks (Venice MDF477 «J - POCKETS»: 18 sizes open; half the outline was read as a common
// line and half as an inner line).
//
// The outline is the smallest closed walk round the piece label over the lines that carry no size
// (common, inner, seam lines and lines of no row). Ends that meet within 3 mm are joined; where two
// sides meet at an angle the vertex is the intersection of the two sides. Nothing is drawn across a
// gap. A walk the size of a page is the tile frame, not a piece.
//
// It is applied only to a piece none of whose sizes closed, and gives every one of them the same
// outline (`rankFrom: 'one-outline'`).
import type {
  ChainSet,
  PagePose,
  PieceCandidate,
  PtMm,
  Seed,
  Sheet,
} from 'lib/pattern-import/types';

import { bboxOf, dist, pointInPoly, signedArea } from './geom';

export const ONE_OUTLINE = {
  /** Lines farther than this from the label are not the piece's, mm. */
  reachMm: 450,
  /** Two ends this close are one point, mm. */
  tightMm: 3,
  /** A corner is built when the sides, extended by at most this, meet, mm… */
  extendMm: 30,
  /** …or cut back by at most this, mm. */
  cutBackMm: 15,
  /** Sides closer to parallel than this (sine of the angle) have no corner. */
  minSin: 0.34,
  /** An outline shorter than this is a mark, mm. */
  minPerimeterMm: 150,
  /** A page-sized box within this of a page's own size is the tile frame, mm. */
  frameTolMm: 3,
};

type Edge = { chain: number; pts: PtMm[]; len: number };
type End = { e: Edge; w: 0 | 1; pt: PtMm; out: PtMm };
type Join = { to: End; cost: number; corner?: { at: PtMm; cutPrev: number; cutNext: number } };

const polyLen = (pts: readonly PtMm[]) =>
  pts.reduce((a, p, i) => (i ? a + dist(p, pts[i - 1]) : 0), 0);

/** The point `mm` back along the edge from its end `w`. */
function backPt(pts: readonly PtMm[], w: 0 | 1, mm: number): PtMm {
  const p = w ? [...pts].reverse() : pts;
  let acc = 0;
  for (let k = 1; k < p.length; k++) {
    acc += dist(p[k], p[k - 1]);
    if (acc >= mm) return p[k];
  }
  return p[p.length - 1];
}

/** `pts` without `head` mm at its start and `tail` mm at its end. */
function trimmed(pts: PtMm[], head: number, tail: number): PtMm[] {
  const cut = (arr: PtMm[], mm: number): PtMm[] => {
    let acc = 0;
    for (let k = 1; k < arr.length; k++) {
      const L = dist(arr[k], arr[k - 1]);
      if (acc + L >= mm) {
        const u = (mm - acc) / (L || 1);
        const p = {
          x: arr[k - 1].x + (arr[k].x - arr[k - 1].x) * u,
          y: arr[k - 1].y + (arr[k].y - arr[k - 1].y) * u,
        };
        return [p, ...arr.slice(k)];
      }
      acc += L;
    }
    return arr.slice(-1);
  };
  let a = pts;
  if (head > 0) a = cut(a, head);
  if (tail > 0) a = cut([...a].reverse(), tail).reverse();
  return a;
}

export type OneOutline = { outer: PtMm[]; chains: number[] };

/**
 * The outline of a piece drawn once, round `at`, over the chains `plain` (ids into `chains`).
 * null = no closed walk goes round the label.
 */
export function oneOutlineAt(
  chains: ChainSet['chains'],
  plain: readonly number[],
  at: PtMm,
  poses: readonly Pick<PagePose, 'widthMm' | 'heightMm'>[] = [],
): OneOutline | null {
  const C = ONE_OUTLINE;
  const box = {
    minX: at.x - C.reachMm,
    maxX: at.x + C.reachMm,
    minY: at.y - C.reachMm,
    maxY: at.y + C.reachMm,
  };
  const inBox = (p: PtMm) =>
    p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  // edges: the chains, each cut to its parts inside the reach
  const edges: Edge[] = [];
  for (const id of plain) {
    const ch = chains[id];
    if (!ch || ch.pts.length < 2) continue;
    const pts = ch.closed ? [...ch.pts, ch.pts[0]] : ch.pts;
    let cur: PtMm[] = [];
    const flush = () => {
      if (cur.length >= 2 && polyLen(cur) >= 3)
        edges.push({ chain: id, pts: cur, len: polyLen(cur) });
      cur = [];
    };
    for (const p of pts) {
      if (inBox(p)) cur.push(p);
      else flush();
    }
    flush();
  }
  if (!edges.length) return null;
  const ends: End[] = [];
  for (const e of edges)
    for (const w of [0, 1] as const) {
      const pt = w ? e.pts[e.pts.length - 1] : e.pts[0];
      const from = backPt(e.pts, w, 5);
      const L = dist(from, pt) || 1;
      ends.push({ e, w, pt, out: { x: (pt.x - from.x) / L, y: (pt.y - from.y) / L } });
    }
  const other = (o: End) => ends.find((q) => q.e === o.e && q.w !== o.w)!;
  const cache = new Map<End, Join[]>();
  const joinsOf = (o: End): Join[] => {
    const hit = cache.get(o);
    if (hit) return hit;
    const out: Join[] = [];
    for (const q of ends) {
      if (q === o) continue;
      const d = dist(q.pt, o.pt);
      if (d > C.extendMm + C.cutBackMm + C.tightMm) continue;
      const cr = o.out.x * q.out.y - o.out.y * q.out.x;
      if (Math.abs(cr) >= C.minSin) {
        const wx = q.pt.x - o.pt.x;
        const wy = q.pt.y - o.pt.y;
        const t = (wx * q.out.y - wy * q.out.x) / cr;
        const r = (wx * o.out.y - wy * o.out.x) / cr;
        if (
          t >= -C.cutBackMm &&
          r >= -C.cutBackMm &&
          t <= C.extendMm &&
          r <= C.extendMm &&
          Math.min(o.e.len, q.e.len) > Math.max(-t, -r) + 2
        ) {
          out.push({
            to: q,
            cost: Math.abs(t) + Math.abs(r) + 1,
            corner: {
              at: { x: o.pt.x + t * o.out.x, y: o.pt.y + t * o.out.y },
              cutPrev: Math.max(0, -t),
              cutNext: Math.max(0, -r),
            },
          });
          continue;
        }
      }
      if (d <= C.tightMm) {
        const turn = Math.acos(Math.max(-1, Math.min(1, -(o.out.x * q.out.x + o.out.y * q.out.y))));
        out.push({ to: q, cost: d + 1.5 * turn });
      }
    }
    out.sort((a, b) => a.cost - b.cost);
    const top = out.slice(0, 4);
    cache.set(o, top);
    return top;
  };
  // closed walks from the lines nearest the label
  const nearLabel = (e: Edge) => Math.min(...e.pts.map((p) => dist(p, at)));
  const starts = edges
    .filter((e) => e.len >= 20)
    .sort((a, b) => nearLabel(a) - nearLabel(b))
    .slice(0, 6);
  let best: (OneOutline & { area: number }) | null = null;
  for (const start of starts) {
    const from = ends.find((o) => o.e === start && o.w === 1)!;
    const goal = ends.find((o) => o.e === start && o.w === 0)!;
    type State = {
      at: End;
      path: { e: Edge; rev: boolean }[];
      joins: Join[];
      cost: number;
      seen: Set<Edge>;
    };
    const stack: State[] = [
      { at: from, path: [{ e: start, rev: false }], joins: [], cost: 0, seen: new Set([start]) },
    ];
    let found = 0;
    for (let steps = 0; stack.length && found < 4 && steps < 20000; steps++) {
      stack.sort((a, b) => b.cost - a.cost);
      const cur = stack.pop()!;
      for (const j of joinsOf(cur.at)) {
        if (j.to === goal) {
          found++;
          const joins = [...cur.joins, j];
          const n = cur.path.length;
          const outer: PtMm[] = [];
          cur.path.forEach((x, k) => {
            const prev = joins[(k - 1 + n) % n];
            const next = joins[k];
            outer.push(
              ...trimmed(
                x.rev ? [...x.e.pts].reverse() : x.e.pts,
                prev.corner?.cutNext ?? 0,
                next.corner?.cutPrev ?? 0,
              ),
            );
            if (next.corner) outer.push(next.corner.at);
          });
          if (outer.length < 3 || !pointInPoly(at, outer)) continue;
          if (polyLen([...outer, outer[0]]) < C.minPerimeterMm) continue;
          const b = bboxOf(outer);
          const w = b.maxX - b.minX;
          const h = b.maxY - b.minY;
          const frame = poses.some(
            (p) =>
              (Math.abs(w - p.widthMm) <= C.frameTolMm &&
                Math.abs(h - p.heightMm) <= C.frameTolMm) ||
              (Math.abs(w - p.heightMm) <= C.frameTolMm && Math.abs(h - p.widthMm) <= C.frameTolMm),
          );
          if (frame) continue;
          const area = Math.abs(signedArea(outer));
          if (!best || area < best.area)
            best = { outer, chains: [...new Set(cur.path.map((x) => x.e.chain))], area };
          continue;
        }
        if (cur.seen.has(j.to.e)) continue;
        stack.push({
          at: other(j.to),
          path: [...cur.path, { e: j.to.e, rev: j.to.w === 1 }],
          joins: [...cur.joins, j],
          cost: cur.cost + j.cost,
          seen: new Set([...cur.seen, j.to.e]),
        });
      }
    }
  }
  return best ? { outer: best.outer, chains: best.chains } : null;
}

/** The chains that carry no size: common, inner and seam lines, and lines of no row (≥ 20 mm). */
export function sizelessChains(set: ChainSet): number[] {
  const inRow = new Set<number>();
  const out: number[] = [];
  for (const c of set.classes) {
    for (const id of c.chains) inRow.add(id);
    if (c.role === 'common' || c.role === 'internal' || c.role === 'seam') out.push(...c.chains);
  }
  for (const ch of set.chains) if (!inRow.has(ch.id) && ch.lengthMm >= 20) out.push(ch.id);
  return out;
}

/**
 * Pieces none of whose sizes closed: where one outline of size-less lines goes round the label,
 * every size of the piece gets it.
 */
export function applyOneOutline(
  sheet: Pick<Sheet, 'poses' | 'texts'>,
  set: ChainSet,
  seeds: readonly Seed[],
  cands: Map<number, PieceCandidate[]>,
  excluded: ReadonlySet<number>,
): void {
  let plain: number[] | null = null;
  for (const seed of seeds) {
    const list = cands.get(seed.id);
    if (!list?.length || seed.origin !== 'text') continue;
    if (list.some((c) => c.outcome !== 'leak' || c.hole)) continue;
    plain ??= sizelessChains(set).filter((id) => !excluded.has(id));
    const found = oneOutlineAt(set.chains, plain, seed.at, sheet.poses);
    if (!found) continue;
    const outer = found.outer;
    const bbox = bboxOf(outer);
    const wallIds = new Set(found.chains);
    const inside = set.chains
      .filter(
        (c) =>
          !wallIds.has(c.id) &&
          c.pts.length > 1 &&
          c.pts.every(
            (p) =>
              p.x >= bbox.minX &&
              p.x <= bbox.maxX &&
              p.y >= bbox.minY &&
              p.y <= bbox.maxY &&
              pointInPoly(p, outer),
          ),
      )
      .map((c) => c.id);
    const textsInside = sheet.texts
      .filter((t) =>
        pointInPoly(
          { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 },
          outer,
        ),
      )
      .map((t) => t.id);
    for (const c of list) {
      Object.assign(c, {
        outer,
        walls: [...wallIds],
        inside,
        textsInside,
        bbox,
        areaMm2: Math.abs(signedArea(outer)),
        rankFrom: 'one-outline',
        outcome: 'closed',
        derived: [],
      });
      delete c.leakAt;
      delete c.repair;
      delete c.gradeHint;
      delete c.gradeRefusal;
      delete c.gradeTryWhy;
      if (c.nest?.state === 'refused') c.nest = { ...c.nest, state: 'unchecked' };
    }
  }
}
