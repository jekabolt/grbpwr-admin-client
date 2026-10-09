// pieces/ (F4) — fillPieces: seed × size rank → closed contour, snapped to the vector chains.
//
// Per rank r (walls.ts decides which chains are walls): draw the walls on a `cellMm` raster, flood
// the EXTERIOR from the raster border once, then for every seed take the 4-connected component of
// NOT-exterior pixels holding it. Internal lines (grain, fold, pocket placement) never split a
// piece — they are inside. Outcomes are explicit and never papered over:
//   leak    the seed pixel is exterior: the contour has a gap. Where it is: the walls are
//           thickened 1–4 mm until the seed is enclosed, and the first pixel a breadth-first walk
//           from the seed takes OUT of that closure is the mouth (leakAt).
//   merged  another seed (another label) lies in the same region — the operator splits it.
//   tiny    the region is below PATIMPORT.minPieceAreaMm2.
// A closed region is opened morphologically (spurs of lines sticking out of the outline go), its
// boundary traced along pixel edges and snapped onto the wall chains (snap.ts) → outer, walls,
// coverage, p95. Area/bbox come from the vector outline.
//
// Variant: seeds of other variants are skipped; the chosen variant's "cutting line" chains act as
// knives — the region is cut along them and the seed's side kept (kombinezon Style A/B waists).
import type {
  BoxMm,
  ChainId,
  ChainSet,
  FillOpts,
  FillPiecesFn,
  PieceCandidate,
  PieceFamily,
  PtMm,
  Seed,
  Sheet,
  SizeRun,
  TextId,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { bboxOf, dist, pointInPoly, signedArea } from './geom';
import { drawPolyline, exterior, flood, Grid, openMask, regionOf, traceOuter } from './raster';
import { seedLabel } from './seeds';
import { snapOutline, type WallItem } from './snap';
import { variantKnives } from './variants';
import { localRanks } from './bundle-rank';
import {
  frameLike,
  itemsOf,
  landingPlugs,
  lonePortions,
  rescuedIgnored,
  wallModel,
  type WallModel,
} from './walls';

export type RankFrom = NonNullable<PieceCandidate['rankFrom']>;

export type FillDiag = {
  model: Pick<WallModel, 'mode' | 'n' | 'emptyRanks'>;
  /** Seeds dropped as duplicates of another seed with the same label in the same region. */
  duplicates: { seed: number; of: number }[];
  /** Per seed/rank: unbacked outline stretches and raster↔vector agreement. */
  cand: Map<
    string,
    { gaps: { at: PtMm; lengthMm: number }[]; agreement: number; seedMovedMm: number }
  >;
  /** Pass C: lines given a local rank (orphans) and "common" lines found inside full bundles. */
  reranked?: { orphans: number; moved: number; demotedCommon: number };
  /** Frame-like chains dropped from the walls after they enclosed several seeds. */
  frames: ChainId[];
  /** 'ignore' chains brought back as walls (both ends on outline lines). */
  rescued: number;
  ms: number;
};

const key = (seed: number, rank: number) => `${seed}:${rank}`;

function grow(b: BoxMm, m: number): BoxMm {
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

/** Nearest pixel to p that is not a wall (≤ 8 px away), preferring non-exterior ones. */
function seedPixel(g: Grid, wall: Uint8Array, ext: Uint8Array | null, p: PtMm) {
  const x0 = g.ix(p.x);
  const y0 = g.iy(p.y);
  let best = -1;
  let bd = Infinity;
  let bestExt = true;
  for (let r = 0; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        if (!g.inside(x, y)) continue;
        const k = y * g.W + x;
        if (wall[k]) continue;
        const isExt = ext ? ext[k] === 1 : false;
        const d = dx * dx + dy * dy;
        if ((bestExt && !isExt) || (bestExt === isExt && d < bd)) {
          best = k;
          bd = d;
          bestExt = isExt;
        }
      }
    if (best >= 0 && !bestExt) break;
  }
  if (best < 0) best = Math.max(0, Math.min(g.W * g.H - 1, y0 * g.W + x0));
  return { k: best, movedMm: Math.sqrt(bd === Infinity ? 0 : bd) * g.cell };
}

/** Thicken the walls until the seed is enclosed; the mouth is where a walk from the seed leaves. */
function leakMouth(g: Grid, wall: Uint8Array, k: number): PtMm | undefined {
  for (const r of [2, 4, 8]) {
    const thick = new Uint8Array(wall.length);
    const W = g.W;
    for (let y = 0; y < g.H; y++)
      for (let x = 0; x < W; x++) {
        if (!wall[y * W + x]) continue;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= g.H) continue;
          for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < W) thick[yy * W + xx] = 1;
          }
        }
      }
    if (thick[k]) continue;
    const ext2 = exterior(g, thick);
    if (ext2[k]) continue;
    // region of the closure (not exterior), then BFS from the seed over original non-wall pixels
    const inside = new Uint8Array(wall.length);
    flood(g, ext2, [k], inside);
    const seen = new Uint8Array(wall.length);
    const q = new Int32Array(wall.length);
    let h = 0;
    let t = 0;
    q[t++] = k;
    seen[k] = 1;
    while (h < t) {
      const c = q[h++];
      if (!inside[c]) {
        const y = (c / W) | 0;
        return g.centre(c - y * W, y);
      }
      const y = (c / W) | 0;
      const x = c - y * W;
      const nb = [
        x > 0 ? c - 1 : -1,
        x + 1 < W ? c + 1 : -1,
        y > 0 ? c - W : -1,
        y + 1 < g.H ? c + W : -1,
      ];
      for (const j of nb) {
        if (j < 0 || seen[j] || wall[j]) continue;
        seen[j] = 1;
        q[t++] = j;
      }
    }
  }
  return undefined;
}

type RankCtx = { g: Grid; wall: Uint8Array; ext: Uint8Array; items: WallItem[] };

function buildRank(box: BoxMm, cell: number, items: WallItem[]): RankCtx {
  const g = new Grid(box, cell);
  const wall = new Uint8Array(g.W * g.H);
  for (const it of items) drawPolyline(g, wall, it.pts, it.closed);
  return { g, wall, ext: exterior(g, wall), items };
}

/** File-per-size: where a seed placed on one size's drawing lands on another's. */
function fileShift(set: ChainSet, m: WallModel) {
  const boxes = m.byRank.map((ids) =>
    ids.length ? bboxOf(ids.flatMap((i) => set.chains[i].pts)) : null,
  );
  return (p: PtMm, r: number): PtMm => {
    if (m.mode !== 'file') return p;
    const home = boxes.findIndex(
      (b) => b && p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY,
    );
    const a = home >= 0 ? boxes[home] : null;
    const b = boxes[r];
    if (!a || !b || home === r) return p;
    // overlapping drawings share a frame; side-by-side ones move by their top-left corners
    const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    if (ox > 0.5 * Math.min(a.maxX - a.minX, b.maxX - b.minX)) return p;
    return { x: p.x - a.minX + b.minX, y: p.y - a.maxY + b.maxY };
  };
}

/** Edits that change the walls themselves (the wizard's wall override, "not a wall" on a frame). */
export type WallEdits = {
  /** Never a wall (any rank). */
  exclude?: ChainId[];
  /** Extra walls per rank (the operator's "use this line"). */
  include?: { rank: number; ids: ChainId[] }[];
};

export function fillPiecesDetailed(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  opts: FillOpts,
  progress?: (done: number, total: number, note?: string) => void,
  edits: WallEdits = {},
): { families: PieceFamily[]; diag: FillDiag } {
  const t0 = Date.now();
  const cell = opts.cellMm || PATIMPORT.fillCellMm;
  const model = wallModel(set, run);
  const use = seeds.filter(
    (s) => opts.variant == null || s.variant == null || s.variant === opts.variant,
  );
  const knives = opts.variant ? variantKnives(sheet, set, opts.variant) : [];
  const knifeItems = itemsOf(set, knives);
  const knifeSet = new Set(knives);
  const shift = fileShift(set, model);
  const diag: FillDiag = {
    model: { mode: model.mode, n: model.n, emptyRanks: model.emptyRanks },
    duplicates: [],
    cand: new Map(),
    frames: [],
    rescued: 0,
    ms: 0,
  };
  const cands = new Map<number, PieceCandidate[]>(use.map((s) => [s.id, []]));
  const dropped = new Set<number>();
  const box = grow(sheet.bbox, 15);
  const lone = lonePortions(set, model);
  const rescued = rescuedIgnored(set, model);
  diag.rescued = rescued.length;
  const textCentres = sheet.texts.map((t) => ({
    id: t.id,
    at: { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 },
  }));
  // pass C model: orphans ranked by their local bundles, graded-looking "common" lines demoted
  let reranked: { model: WallModel; lone: WallItem[]; demoted: Set<ChainId> } | null = null;
  const rerank = () => {
    if (reranked) return reranked;
    const lr = localRanks(set, model);
    const byRank = model.byRank.map((ids) => ids.filter((id) => !lr.has(id)));
    const demoted = new Set<ChainId>();
    const commonSet = new Set(model.common);
    let moved = 0;
    for (const [id, v] of lr) {
      byRank[v.rank].push(id);
      if (commonSet.has(id)) demoted.add(id);
      else if (!set.orphans.includes(id)) moved++;
    }
    const m2: WallModel = {
      ...model,
      byRank,
      common: model.common.filter((id) => !demoted.has(id)),
    };
    reranked = { model: m2, lone: lonePortions(set, m2), demoted };
    diag.reranked = { orphans: lr.size - demoted.size - moved, moved, demotedCommon: demoted.size };
    return reranked;
  };
  const userExcl = new Set(edits.exclude ?? []);
  const extraOf = (r: number) =>
    (edits.include ?? []).filter((x) => x.rank === r).flatMap((x) => x.ids);

  /** One rank, every seed; returns the candidates and the frame chains found around merges. */
  const rankPass = (r: number, excl: Set<ChainId>) => {
    const keep = (it: WallItem) => !excl.has(it.chain) && !knifeSet.has(it.chain);
    const ownIds = model.mode === 'single' ? [] : model.byRank[r];
    const base = buildRank(
      box,
      cell,
      [...itemsOf(set, [...model.common, ...ownIds, ...rescued, ...extraOf(r)]), ...lone].filter(
        keep,
      ),
    );
    const pts = use.map((s) => shift(s.at, r));
    const px = pts.map((p) => seedPixel(base.g, base.wall, base.ext, p));
    // passes after A, built lazily once per rank
    const later: { from: RankFrom; build: () => RankCtx }[] =
      model.mode === 'single'
        ? []
        : [
            {
              from: 'innerPlug',
              build: () => {
                const plugs = landingPlugs(set, model, r, lone).filter(keep);
                return plugs.length ? buildRank(box, cell, [...base.items, ...plugs]) : base;
              },
            },
            {
              from: 'bundleRank',
              build: () => {
                const rr = rerank();
                const items = [
                  ...itemsOf(set, [
                    ...rr.model.common,
                    ...rr.model.byRank[r],
                    ...rescued,
                    ...extraOf(r),
                  ]),
                  ...rr.lone,
                ];
                const plugs = landingPlugs(set, rr.model, r, rr.lone);
                return buildRank(box, cell, [...items, ...plugs].filter(keep));
              },
            },
          ];
    const built: (RankCtx | null)[] = later.map(() => null);
    const out = new Map<number, PieceCandidate>();
    const frames = new Set<ChainId>();
    for (let si = 0; si < use.length; si++) {
      const seed = use[si];
      if (dropped.has(seed.id)) continue;
      let ctx = base;
      let rankFrom: RankFrom = model.mode === 'single' ? 'single' : 'class';
      let { k, movedMm } = px[si];
      for (let pi = 0; pi < later.length && ctx.ext[k]; pi++) {
        if (pi === 1 && !rerank().model.byRank[r].length) break;
        const c = built[pi] ?? (built[pi] = later[pi].build());
        const p2 = seedPixel(c.g, c.wall, c.ext, pts[si]);
        if (!c.ext[p2.k]) {
          ctx = c;
          k = p2.k;
          movedMm = p2.movedMm;
          rankFrom = later[pi].from;
        }
      }
      const { g } = ctx;
      const cand: PieceCandidate = {
        seed: seed.id,
        rank: r,
        outer: [],
        walls: [],
        inside: [],
        textsInside: [],
        outcome: 'closed',
        areaMm2: 0,
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        sourceCoverage: 0,
        p95Mm: 0,
        rankFrom,
      };
      if (ctx.ext[k]) {
        cand.outcome = 'leak';
        cand.leakAt = leakMouth(ctx.g, ctx.wall, k) ?? pts[si];
        out.set(seed.id, cand);
        continue;
      }
      let { mask } = regionOf(g, ctx.ext, k);
      // knives (variant cutting lines) crossing the region: cut and keep the seed's side
      if (knifeItems.length) {
        const kn = new Uint8Array(mask.length);
        for (const it of knifeItems) drawPolyline(g, kn, it.pts, it.closed);
        let hit = false;
        for (let j = 0; j < mask.length; j++)
          if (mask[j] && kn[j]) {
            hit = true;
            break;
          }
        if (hit) {
          const cut = new Uint8Array(mask.length);
          const blocked = new Uint8Array(mask.length);
          for (let j = 0; j < mask.length; j++) blocked[j] = mask[j] && !kn[j] ? 0 : 1;
          flood(g, blocked, [k], cut);
          if (cut.some((v) => v)) mask = cut;
        }
      }
      // other seeds in this region
      const others: number[] = [];
      for (let sj = 0; sj < use.length; sj++) {
        if (sj === si || dropped.has(use[sj].id)) continue;
        const kj = ctx === base ? px[sj].k : seedPixel(g, ctx.wall, ctx.ext, pts[sj]).k;
        if (mask[kj]) others.push(sj);
      }
      const lab = seedLabel(seed);
      for (const sj of others) {
        const lj = seedLabel(use[sj]);
        if (lab && lj && lab === lj && r === 0) {
          // the same piece labelled twice: keep the first seed
          dropped.add(use[sj].id);
          diag.duplicates.push({ seed: use[sj].id, of: seed.id });
        }
      }
      const merged = others.some((sj) => !dropped.has(use[sj].id));
      const opened = openMask(g, mask, 2, k);
      const raster = traceOuter(g, opened);
      if (raster.length < 4) {
        cand.outcome = 'tiny';
        out.set(seed.id, cand);
        continue;
      }
      const sn = snapOutline(raster, ctx.items.concat(knifeItems), {
        stepMm: 1,
        reachMm: 2.5,
        snapMm: opts.snapMm || PATIMPORT.snapMm,
      });
      const outer = signedArea(sn.outer) < 0 ? sn.outer.slice().reverse() : sn.outer;
      cand.outer = outer;
      cand.walls = sn.walls;
      cand.areaMm2 = Math.abs(signedArea(outer));
      cand.bbox = bboxOf(outer);
      cand.sourceCoverage = sn.coverage;
      cand.p95Mm = sn.p95Mm;
      cand.outcome = merged
        ? 'merged'
        : cand.areaMm2 < PATIMPORT.minPieceAreaMm2
          ? 'tiny'
          : 'closed';
      if (merged)
        // a region holding several pieces bounded by frame-like lines: tile frames / a border
        for (const id of sn.walls)
          if (!userExcl.has(id) && frameLike(set.chains[id].pts)) frames.add(id);
      // a label frame: the text seed sits in a small closed loop drawn around it (an oval round
      // "Piece 8 / cut x1 pair") — a decoration, not the piece; fill again without it
      if (
        seed.origin === 'text' &&
        sn.walls.length === 1 &&
        set.chains[sn.walls[0]]?.closed &&
        cand.areaMm2 < 3000 &&
        !userExcl.has(sn.walls[0])
      )
        frames.add(sn.walls[0]);
      // texts and chains inside
      const tIn: TextId[] = [];
      for (const t of textCentres) {
        const x = g.ix(t.at.x);
        const y = g.iy(t.at.y);
        if (g.inside(x, y) && opened[y * g.W + x]) tIn.push(t.id);
      }
      cand.textsInside = tIn;
      const wallSet = new Set<ChainId>(sn.walls);
      const inside: ChainId[] = [];
      for (const c of set.chains) {
        if (wallSet.has(c.id) || c.pts.length < 2) continue;
        const b = bboxOf(c.pts);
        if (
          b.minX < cand.bbox.minX ||
          b.maxX > cand.bbox.maxX ||
          b.minY < cand.bbox.minY ||
          b.maxY > cand.bbox.maxY
        )
          continue;
        const step = Math.max(1, Math.floor(c.pts.length / 8));
        let ok = true;
        for (let i = 0; i < c.pts.length && ok; i += step) ok = pointInPoly(c.pts[i], outer);
        if (ok && pointInPoly(c.pts[c.pts.length - 1], outer)) inside.push(c.id);
      }
      cand.inside = inside;
      diag.cand.set(key(seed.id, r), {
        gaps: sn.gaps,
        agreement: sn.agreement,
        seedMovedMm: movedMm,
      });
      out.set(seed.id, cand);
    }
    return { out, frames };
  };

  const excl = new Set<ChainId>(userExcl);
  for (let r = 0; r < model.n; r++) {
    progress?.(r, model.n, `rank ${r}`);
    let res = rankPass(r, excl);
    // frames found around merged regions are not walls: drop them and fill this rank again
    for (let attempt = 0; attempt < 3 && res.frames.size; attempt++) {
      for (const id of res.frames) {
        excl.add(id);
        diag.frames.push(id);
      }
      res = rankPass(r, excl);
    }
    for (const s of use) {
      const c = res.out.get(s.id);
      if (c) cands.get(s.id)!.push(c);
    }
  }
  const families: PieceFamily[] = [];
  for (const s of use) {
    if (dropped.has(s.id)) continue;
    const c = cands.get(s.id)!;
    families.push({ seed: s.id, candidates: c, monotone: isMonotone(c) });
  }
  diag.ms = Date.now() - t0;
  progress?.(model.n, model.n);
  return { families, diag };
}

/**
 * Area strictly grows with rank over the closed candidates (gate G8). Equal areas fail too: a graded
 * piece whose ranks all came out alike lost its size lines (or it is ungraded — the operator says so).
 */
export function isMonotone(c: PieceCandidate[]): boolean {
  const a = c.filter((x) => x.outcome === 'closed').sort((x, y) => x.rank - y.rank);
  for (let i = 1; i < a.length; i++) if (a[i].areaMm2 <= a[i - 1].areaMm2 * 1.0005) return false;
  return true;
}

export const fillPieces: FillPiecesFn = (sheet, set, run, seeds, opts, progress) =>
  fillPiecesDetailed(sheet, set, run, seeds, opts, progress).families;

export { dist };
