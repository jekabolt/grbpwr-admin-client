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
// Some sheets print that one outline once per size, every copy on the same place (Clark MDF271
// «H - POCKET LINING»: 32 copies). The reader joins the copies end to end into one closed line
// that goes round 32 times; a point inside it counts as outside and its length is 32 outlines.
// Such a line is read as one lap, and copies of one line count once.
//
// The fill may have set the outline aside as a frame: a pocket bag with straight sides looks like
// one once the fill leaks through it. Only the lines the operator excluded are kept out here; a
// frame is told by what it holds — a page, or the label of another piece.
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

import { bboxOf, dist, pointInPoly, segNearest, signedArea } from './geom';

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
  /** A copy of a line lies within this of the line it repeats, mm. */
  copyMm: 0.5,
  /** The walk starts from this many lines nearest the label… */
  nearStarts: 6,
  /** …and from this many first lines met on each of the four straight ways out of the label. */
  wayStarts: 3,
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

/**
 * One lap of a closed line that goes round the same path several times; `pts` (first point
 * repeated at the end) when it goes round once or its further laps leave the first.
 */
export function oneLap(pts: PtMm[]): PtMm[] {
  const tol = ONE_OUTLINE.copyMm;
  const a = pts[0];
  let acc = 0;
  let lap: PtMm[] | null = null;
  for (let k = 1; k < pts.length - 1 && !lap; k++) {
    const near = segNearest(a, pts[k - 1], pts[k]);
    if (near.d <= tol && acc + dist(pts[k - 1], near.q) > 20) lap = [...pts.slice(0, k), a];
    acc += dist(pts[k], pts[k - 1]);
  }
  if (!lap) return pts;
  const total = polyLen(pts);
  const one = polyLen(lap);
  const laps = Math.round(total / one);
  if (laps < 2 || Math.abs(total - laps * one) > laps * tol * 4) return pts;
  const onLap = (p: PtMm) => lap.some((q, i) => i > 0 && segNearest(p, lap[i - 1], q).d <= tol);
  return pts.every(onLap) ? lap : pts;
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
  const copies = new Set<string>();
  const g = (v: number) => Math.round(v / C.copyMm);
  for (const id of plain) {
    const ch = chains[id];
    if (!ch || ch.pts.length < 2) continue;
    const pts = ch.closed ? oneLap([...ch.pts, ch.pts[0]]) : ch.pts;
    let cur: PtMm[] = [];
    const flush = () => {
      const len = cur.length >= 2 ? polyLen(cur) : 0;
      if (len >= 3) {
        // a copy of a line already taken: same ends, same middle, same length
        const mid = cur[cur.length >> 1];
        const z = cur[cur.length - 1];
        const [p, q] = [`${g(cur[0].x)},${g(cur[0].y)}`, `${g(z.x)},${g(z.y)}`].sort();
        const key = `${p} ${q} ${g(mid.x)},${g(mid.y)} ${g(len)}`;
        if (!copies.has(key)) edges.push({ chain: id, pts: cur, len });
        copies.add(key);
      }
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
  // closed walks from the lines nearest the label, and from the first lines met going straight
  // out of it: an outline round the label crosses each of the four ways
  const nearLabel = (e: Edge) => Math.min(...e.pts.map((p) => dist(p, at)));
  const long = edges.filter((e) => e.len >= 20);
  const startSet = new Set(
    [...long].sort((a, b) => nearLabel(a) - nearLabel(b)).slice(0, C.nearStarts),
  );
  const ways: { e: Edge; d: number }[][] = [[], [], [], []];
  for (const e of long) {
    const hit = [Infinity, Infinity, Infinity, Infinity];
    for (let k = 1; k < e.pts.length; k++) {
      const [p, q] = [e.pts[k - 1], e.pts[k]];
      if (p.y !== q.y && (p.y - at.y) * (q.y - at.y) <= 0) {
        const dx = p.x + ((at.y - p.y) / (q.y - p.y)) * (q.x - p.x) - at.x;
        const w = dx >= 0 ? 0 : 1;
        hit[w] = Math.min(hit[w], Math.abs(dx));
      }
      if (p.x !== q.x && (p.x - at.x) * (q.x - at.x) <= 0) {
        const dy = p.y + ((at.x - p.x) / (q.x - p.x)) * (q.y - p.y) - at.y;
        const w = dy >= 0 ? 2 : 3;
        hit[w] = Math.min(hit[w], Math.abs(dy));
      }
    }
    hit.forEach((d, w) => d < Infinity && ways[w].push({ e, d }));
  }
  for (const way of ways)
    for (const h of way.sort((a, b) => a.d - b.d).slice(0, C.wayStarts)) startSet.add(h.e);
  const starts = [...startSet];
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
 * every size of the piece gets it. `excluded`: the lines the operator took out.
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
    // an outline round two labels is a border round several pieces, not a piece
    if (seeds.some((o) => o !== seed && o.origin === 'text' && pointInPoly(o.at, outer))) continue;
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
