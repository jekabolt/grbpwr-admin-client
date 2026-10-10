// pieces/ (F4) — operator edits on the families (wizard step 5), applied in order.
//
//   not-a-piece    the family is dropped.
//   reseed         the seed moves (a click inside the right region) and is filled again.
//   wall-override  at one rank, chain `instead` stops being a wall and `use` becomes one; that
//                  rank is filled again from a point inside the old outline.
//   merge          two or more families become one: per rank the union of their outlines, cut
//                  along the shared walls; the first seed keeps the family.
//   split          a merged region is cut by the lasso: this seed keeps region ∩ lasso. Lasso
//                  edges that run along no wall stay unbacked — coverage drops, the gate sees it.
// Seeds are not in the ctx, so a refill starts from an interior point of the family's own outline.
import type {
  ApplyPieceEditsFn,
  ChainSet,
  PieceCandidate,
  PieceFamily,
  PtMm,
  Seed,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { fillPiecesDetailed, isMonotone } from './fill';
import { bboxOf, signedArea } from './geom';
import { Grid, openMask, traceOuter } from './raster';
import { snapOutline, type WallItem } from './snap';

/** A point inside a simple polygon: the midpoint of the widest span on the middle scan line. */
export function interiorPoint(poly: readonly PtMm[]): PtMm | null {
  if (poly.length < 3) return null;
  const b = bboxOf(poly);
  let best: PtMm | null = null;
  let bw = 0;
  for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const y = b.minY + (b.maxY - b.minY) * f;
    const xs: number[] = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const c = poly[j];
      if (a.y > y !== c.y > y) xs.push(a.x + ((y - a.y) * (c.x - a.x)) / (c.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2)
      if (xs[k + 1] - xs[k] > bw) {
        bw = xs[k + 1] - xs[k];
        best = { x: (xs[k] + xs[k + 1]) / 2, y };
      }
  }
  return best;
}

function seedPointOf(f: PieceFamily): PtMm | null {
  const c = [...f.candidates].sort(
    (a, b) => (a.outcome === 'closed' ? -1 : 1) - (b.outcome === 'closed' ? -1 : 1),
  );
  for (const x of c) {
    const p = interiorPoint(x.outer);
    if (p) return p;
  }
  return null;
}

/** Scanline fill of a polygon into `buf` (value 1). */
function fillPoly(g: Grid, buf: Uint8Array, poly: readonly PtMm[]) {
  for (let j = 0; j < g.H; j++) {
    const y = g.box.maxY - (j - 1 + 0.5) * g.cell;
    const xs: number[] = [];
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const a = poly[i];
      const c = poly[k];
      if (a.y > y !== c.y > y) xs.push(a.x + ((y - a.y) * (c.x - a.x)) / (c.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, g.ix(xs[k]));
      const i1 = Math.min(g.W - 1, g.ix(xs[k + 1]));
      for (let i = i0; i <= i1; i++) buf[j * g.W + i] = 1;
    }
  }
}

/** Raster set operation on outlines → one snapped candidate (walls of all inputs + extra edges). */
function combine(
  set: ChainSet,
  base: PieceCandidate,
  polys: { poly: PtMm[]; op: 'or' | 'and' }[],
  extraEdges: PtMm[][],
  snapMm: number,
): PieceCandidate {
  const all = polys.flatMap((p) => p.poly);
  const b = bboxOf(all);
  const g = new Grid(
    { minX: b.minX - 5, minY: b.minY - 5, maxX: b.maxX + 5, maxY: b.maxY + 5 },
    PATIMPORT.fillCellMm,
  );
  let acc: Uint8Array | null = null;
  for (const p of polys) {
    const m = new Uint8Array(g.W * g.H);
    fillPoly(g, m, p.poly);
    if (!acc) acc = m;
    else for (let k = 0; k < m.length; k++) acc[k] = p.op === 'or' ? acc[k] | m[k] : acc[k] & m[k];
  }
  const mask = acc ?? new Uint8Array(g.W * g.H);
  // close the seam between touching outlines (one wall's width), then keep one piece
  const W = g.W;
  const closed = mask.slice();
  for (let k = 0; k < mask.length; k++)
    if (!mask[k]) {
      const x = k % W;
      const at = (j: number, ok: boolean) => (ok && mask[j] ? 1 : 0);
      const n =
        at(k - 1, x > 0) +
        at(k + 1, x + 1 < W) +
        at(k - W, k >= W) +
        at(k + W, k + W < mask.length);
      if (n >= 2) closed[k] = 1;
    }
  let start = -1;
  for (let k = 0; k < closed.length; k++)
    if (closed[k]) {
      start = k;
      break;
    }
  const out: PieceCandidate = { ...base, outer: [], walls: [], outcome: 'closed' };
  if (start < 0) return { ...out, outcome: 'tiny', areaMm2: 0 };
  const opened = openMask(g, closed, 1, start);
  const raster = traceOuter(g, opened);
  const items: WallItem[] = [];
  for (const id of new Set(base.walls)) {
    const c = set.chains[id];
    if (c) items.push({ chain: c.id, pts: c.pts, closed: c.closed });
  }
  extraEdges.forEach((pts, i) => items.push({ chain: -1 - i, pts, closed: true }));
  const sn = snapOutline(raster, items, { stepMm: 1, reachMm: 2.5, snapMm });
  const outer = signedArea(sn.outer) < 0 ? sn.outer.slice().reverse() : sn.outer;
  // lasso edges are not source walls: coverage is measured against the chains only
  const chainsOnly = items.filter((it) => it.chain >= 0);
  const cov = snapOutline(raster, chainsOnly.length ? chainsOnly : items, {
    stepMm: 1,
    reachMm: 2.5,
    snapMm,
  });
  return {
    ...out,
    outer,
    walls: sn.walls.filter((w) => w >= 0),
    areaMm2: Math.abs(signedArea(outer)),
    bbox: bboxOf(outer),
    sourceCoverage: Math.min(sn.coverage, chainsOnly.length ? cov.coverage : 0),
    p95Mm: Math.max(sn.p95Mm, chainsOnly.length ? cov.p95Mm : 0),
    outcome: Math.abs(signedArea(outer)) < PATIMPORT.minPieceAreaMm2 ? 'tiny' : 'closed',
  };
}

export const applyPieceEdits: ApplyPieceEditsFn = (families, edits, ctx) => {
  let fams = families.map((f) => ({ ...f, candidates: f.candidates.slice() }));
  const snapMm = ctx.opts.snapMm || PATIMPORT.snapMm;
  const refill = (
    seedId: number,
    at: PtMm,
    wall?: { rank: number; use: number; instead: number },
  ) => {
    const seed: Seed = { id: seedId, at, origin: 'click', variant: null };
    const { families: fs } = fillPiecesDetailed(
      ctx.sheet,
      ctx.set,
      ctx.run,
      [seed],
      { ...ctx.opts, variant: null },
      undefined,
      {
        exclude: [...(ctx.walls?.exclude ?? []), ...(wall ? [wall.instead] : [])],
        include: [
          ...(ctx.walls?.include ?? []),
          ...(wall ? [{ rank: wall.rank, ids: [wall.use] }] : []),
        ],
        bridges: ctx.walls?.bridges ?? [],
      },
    );
    return fs[0] ?? null;
  };
  for (const e of edits) {
    if (e.kind === 'not-a-piece') {
      fams = fams.filter((f) => f.seed !== e.seed);
    } else if (e.kind === 'reseed') {
      const f = refill(e.seed, e.at);
      fams = fams.map((x) => (x.seed === e.seed && f ? f : x));
    } else if (e.kind === 'wall-override') {
      const cur = fams.find((f) => f.seed === e.seed);
      const at = cur && seedPointOf(cur);
      if (!cur || !at) continue;
      const f = refill(e.seed, at, e);
      const c = f?.candidates.find((x) => x.rank === e.rank);
      if (!c) continue;
      cur.candidates = cur.candidates.map((x) => (x.rank === e.rank ? c : x));
      cur.monotone = isMonotone(cur.candidates);
    } else if (e.kind === 'merge') {
      const parts = e.seeds
        .map((s) => fams.find((f) => f.seed === s))
        .filter(Boolean) as PieceFamily[];
      if (parts.length < 2) continue;
      const [head] = parts;
      const ranks = [...new Set(parts.flatMap((p) => p.candidates.map((c) => c.rank)))].sort(
        (a, b) => a - b,
      );
      const cands: PieceCandidate[] = [];
      for (const r of ranks) {
        const cs = parts.map((p) => p.candidates.find((c) => c.rank === r));
        const base = cs[0] ?? cs.find(Boolean)!;
        // H1: a refused size stays refused (merging does not prove which line is which size)
        const refused = cs.find((c) => c?.outcome === 'refused');
        if (refused) {
          cands.push({ ...refused, seed: head.seed });
          continue;
        }
        if (cs.some((c) => !c || c.outer.length < 3 || c.outcome === 'leak')) {
          cands.push({ ...base, seed: head.seed, outcome: 'leak', outer: [] });
          continue;
        }
        const walls = [...new Set(cs.flatMap((c) => c!.walls))];
        cands.push(
          combine(
            ctx.set,
            { ...base, seed: head.seed, walls },
            cs.map((c) => ({ poly: c!.outer, op: 'or' as const })),
            [],
            snapMm,
          ),
        );
      }
      fams = fams.filter((f) => !e.seeds.includes(f.seed) || f.seed === head.seed);
      fams = fams.map((f) =>
        f.seed === head.seed ? { ...f, candidates: cands, monotone: isMonotone(cands) } : f,
      );
    } else if (e.kind === 'split') {
      const cur = fams.find((f) => f.seed === e.seed);
      if (!cur || e.lassoMm.length < 3) continue;
      cur.candidates = cur.candidates.map((c) =>
        c.outer.length < 3
          ? c
          : combine(
              ctx.set,
              c,
              [
                { poly: c.outer, op: 'or' },
                { poly: e.lassoMm, op: 'and' },
              ],
              [e.lassoMm],
              snapMm,
            ),
      );
      cur.monotone = isMonotone(cur.candidates);
    }
  }
  return fams;
};
