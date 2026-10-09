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

import { bboxOf, dist, pointInPoly, segNearest, signedArea } from './geom';
import {
  components,
  drawPolyline,
  exterior,
  flood,
  Grid,
  openMask,
  regionOf,
  splitByCells,
  traceOuter,
} from './raster';
import { pageMarginIds } from 'lib/pattern-import/chains/classify';

import { type Bridge, wallBridges } from './bridges';
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
  sheetModule,
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
  /** Candidates of an undrawn end size copied from the neighbour's contour ('shared-rank'). */
  sharedRank?: number;
  /** Seeds whose piece is drawn identically in every size layer (equal areas accepted). */
  ungraded?: number[];
  /** Seeds whose family was ranked upside down in its piece and re-ranked (areas shrank). */
  reversed?: number[];
  /** Candidates closed by derived bridges (family-corroborated). */
  bridged?: number;
  /** Merged outer regions split by cells (touching pieces). */
  split?: number;
  /** File-per-size: seed placements moved to the matching region of another size's file. */
  moved?: number;
  ms: number;
};

const key = (seed: number, rank: number) => `${seed}:${rank}`;

function grow(b: BoxMm, m: number): BoxMm {
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

/** Nearest pixel to p that is not a wall (≤ 8 px away); among equally near ones, a non-exterior one. */
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
    // the nearest ring with a free pixel decides (inside it, a non-exterior pixel wins): never
    // walk further to dodge a leak — a seed hopping into a notch circle hides the real gap
    if (best >= 0) break;
  }
  if (best < 0) best = Math.max(0, Math.min(g.W * g.H - 1, y0 * g.W + x0));
  return { k: best, movedMm: Math.sqrt(bd === Infinity ? 0 : bd) * g.cell };
}

/**
 * Where the outside gets in. With a `ref` outline (the same piece closed at another rank) the
 * walk from the seed runs until it is outside `ref` grown by 15 mm (a concave edge of a larger size
 * lies inside a smaller one); the mouth is the narrowest point of that path.
 * Without one, the walls are thickened 1–4 mm until the seed is enclosed and the mouth is where the
 * walk leaves that closure. Undefined when neither finds it (a gap wider than 8 mm).
 */
function leakMouth(g: Grid, wall: Uint8Array, k: number, ref?: PtMm[]): PtMm | undefined {
  const W = g.W;
  const bfsOut = (inside: (c: number) => boolean) => {
    const seen = new Uint8Array(wall.length);
    const from = new Int32Array(wall.length).fill(-1);
    const q = new Int32Array(wall.length);
    let h = 0;
    let t = 0;
    q[t++] = k;
    seen[k] = 1;
    while (h < t) {
      const c = q[h++];
      const y = (c / W) | 0;
      const x = c - y * W;
      if (!inside(c)) {
        // back along the path: the gap is its narrowest point — walls close on BOTH sides
        const reach = 8;
        const toWall = (px: number, py: number, dx: number, dy: number) => {
          for (let d = 1; d <= reach; d++) {
            const xx = px + dx * d;
            const yy = py + dy * d;
            if (xx < 0 || yy < 0 || xx >= W || yy >= g.H) return Infinity;
            if (wall[yy * W + xx]) return d;
          }
          return Infinity;
        };
        let best = c;
        let bw = Infinity;
        for (let p = c; p >= 0; p = from[p]) {
          const py = (p / W) | 0;
          const px = p - py * W;
          for (const [dx, dy] of [
            [1, 0],
            [0, 1],
            [1, 1],
            [1, -1],
          ]) {
            const span = toWall(px, py, dx, dy) + toWall(px, py, -dx, -dy);
            if (span < bw) {
              bw = span;
              best = p;
            }
          }
        }
        const by = (best / W) | 0;
        return g.centre(best - by * W, by);
      }
      const nb = [
        x > 0 ? c - 1 : -1,
        x + 1 < W ? c + 1 : -1,
        y > 0 ? c - W : -1,
        y + 1 < g.H ? c + W : -1,
      ];
      for (const j of nb) {
        if (j < 0 || seen[j] || wall[j]) continue;
        seen[j] = 1;
        from[j] = c;
        q[t++] = j;
      }
    }
    return undefined;
  };
  if (ref && ref.length > 2) {
    // ref polygon rasterised and grown by 3 mm
    const inRef = new Uint8Array(wall.length);
    const grow = Math.ceil(15 / g.cell);
    for (let j = 0; j < g.H; j++) {
      const y = g.box.maxY - (j - 1 + 0.5) * g.cell;
      const xs: number[] = [];
      for (let i = 0, m = ref.length - 1; i < ref.length; m = i++) {
        const a = ref[i];
        const c = ref[m];
        if (a.y > y !== c.y > y) xs.push(a.x + ((y - a.y) * (c.x - a.x)) / (c.y - a.y));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const i0 = Math.max(0, g.ix(xs[i]) - grow);
        const i1 = Math.min(W - 1, g.ix(xs[i + 1]) + grow);
        for (let x = i0; x <= i1; x++) inRef[j * W + x] = 1;
      }
    }
    // vertical growth
    const grown = inRef.slice();
    for (let j = 0; j < g.H; j++)
      for (let x = 0; x < W; x++)
        if (inRef[j * W + x])
          for (let d = 1; d <= grow; d++) {
            if (j - d >= 0) grown[(j - d) * W + x] = 1;
            if (j + d < g.H) grown[(j + d) * W + x] = 1;
          }
    const p = bfsOut((c) => grown[c] === 1);
    if (p) return p;
  }
  for (const r of [2, 4, 8]) {
    const thick = new Uint8Array(wall.length);
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
    const inside = new Uint8Array(wall.length);
    flood(g, ext2, [k], inside);
    const p = bfsOut((c) => inside[c] === 1);
    if (p) return p;
  }
  return undefined;
}

type RankCtx = { g: Grid; wall: Uint8Array; ext: Uint8Array; items: WallItem[] };

/** The exterior pixel nearest (x, y) — a square spiral out to 2000 px; −1 when none. */
function nearestExterior(c: { g: Grid; ext: Uint8Array }, x: number, y: number): number {
  for (let r = 0; r < 2000; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (!c.g.inside(xx, yy)) continue;
        const k = yy * c.g.W + xx;
        if (c.ext[k]) return k;
      }
  return -1;
}

let pathBuf: Int32Array | null = null;
let queueBuf: Int32Array | null = null;

/**
 * Shortest 4-connected path through non-wall pixels from `k` to the grid border (`to` null: a
 * leak) or to any pixel of `to` (a merge). Returns the path's pixels, or null when none.
 */
function escapePath(g: Grid, wall: Uint8Array, k: number, to: Set<number> | null) {
  const N = g.W * g.H;
  if (!pathBuf || pathBuf.length < N) pathBuf = new Int32Array(N);
  const prev = pathBuf;
  prev.fill(-2, 0, N);
  prev[k] = -1;
  if (!queueBuf || queueBuf.length < N) queueBuf = new Int32Array(N);
  const q = queueBuf;
  let head = 0;
  let tail = 0;
  q[tail++] = k;
  let hit = -1;
  while (head < tail) {
    const c = q[head++];
    const y = (c / g.W) | 0;
    const x = c - y * g.W;
    if (to ? to.has(c) : x === 0 || y === 0 || x === g.W - 1 || y === g.H - 1) {
      hit = c;
      break;
    }
    if (x > 0 && prev[c - 1] === -2 && !wall[c - 1]) (prev[c - 1] = c), (q[tail++] = c - 1);
    if (x < g.W - 1 && prev[c + 1] === -2 && !wall[c + 1]) (prev[c + 1] = c), (q[tail++] = c + 1);
    if (y > 0 && prev[c - g.W] === -2 && !wall[c - g.W]) (prev[c - g.W] = c), (q[tail++] = c - g.W);
    if (y < g.H - 1 && prev[c + g.W] === -2 && !wall[c + g.W])
      (prev[c + g.W] = c), (q[tail++] = c + g.W);
  }
  if (hit < 0) return null;
  const path = new Set<number>();
  for (let c = hit; c >= 0; c = prev[c]) path.add(c);
  return path;
}

/** A bridge segment's pixels (± 1) meet the path. */
function crossesPath(g: Grid, b: Bridge, path: Set<number>): boolean {
  const n = Math.max(2, Math.ceil(dist(b.from, b.to) / (g.cell / 2)));
  for (let i = 0; i <= n; i++) {
    const x = g.ix(b.from.x + ((b.to.x - b.from.x) * i) / n);
    const y = g.iy(b.from.y + ((b.to.y - b.from.y) * i) / n);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (path.has((y + dy) * g.W + x + dx)) return true;
  }
  return false;
}

function buildRank(box: BoxMm, cell: number, items: WallItem[]): RankCtx {
  const g = new Grid(box, cell);
  const wall = new Uint8Array(g.W * g.H);
  for (const it of items) drawPolyline(g, wall, it.pts, it.closed);
  return { g, wall, ext: exterior(g, wall), items };
}

/** File-per-size: each rank's drawing box (its own chains). */
function rankBoxes(set: ChainSet, m: WallModel): (BoxMm | null)[] {
  return m.byRank.map((ids) => (ids.length ? bboxOf(ids.flatMap((i) => set.chains[i].pts)) : null));
}

/** File-per-size: the rank whose drawing holds a point (−1 none). */
function homeRank(boxes: (BoxMm | null)[], p: PtMm): number {
  return boxes.findIndex(
    (b) => b && p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY,
  );
}

/** File-per-size: where a seed placed on one size's drawing lands on another's. */
function fileShift(m: WallModel, boxes: (BoxMm | null)[]) {
  return (p: PtMm, r: number): PtMm => {
    if (m.mode !== 'file') return p;
    const home = homeRank(boxes, p);
    const a = home >= 0 ? boxes[home] : null;
    const b = boxes[r];
    if (!a || !b || home === r) return p;
    // overlapping drawings share a frame; side-by-side ones move by their top-left corners
    const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    if (ox > 0.5 * Math.min(a.maxX - a.minX, b.maxX - b.minX)) return p;
    return { x: p.x - a.minX + b.minX, y: p.y - a.maxY + b.maxY };
  };
}

/**
 * How unlike two regions are, for file-per-size correspondence: area, bbox sides and the position
 * inside their own size's drawing (top-left anchored, as fraction of the drawing). One size step
 * changes area by a few per cent; a different piece differs in size or place.
 */
function unlike(
  a: { area: number; box: BoxMm },
  ab: BoxMm,
  b: { area: number; box: BoxMm },
  bb: BoxMm,
): number {
  const w = (x: BoxMm) => Math.max(1, x.maxX - x.minX);
  const h = (x: BoxMm) => Math.max(1, x.maxY - x.minY);
  const nx = (x: BoxMm, f: BoxMm) => ((x.minX + x.maxX) / 2 - f.minX) / w(f);
  const ny = (x: BoxMm, f: BoxMm) => (f.maxY - (x.minY + x.maxY) / 2) / h(f);
  return (
    2 * Math.abs(Math.log(Math.max(1, b.area) / Math.max(1, a.area))) +
    Math.abs(Math.log(w(b.box) / w(a.box))) +
    Math.abs(Math.log(h(b.box) / h(a.box))) +
    2 * (Math.abs(nx(b.box, bb) - nx(a.box, ab)) + Math.abs(ny(b.box, bb) - ny(a.box, ab)))
  );
}

/** Edits that change the walls themselves (the wizard's wall override, "not a wall" on a frame). */
export type WallEdits = {
  /** Never a wall (any rank). */
  exclude?: ChainId[];
  /** Extra walls per rank (the operator's "use this line"); rank null = every rank. */
  include?: { rank: number | null; ids: ChainId[] }[];
  /** Operator bridges: straight walls the source does not draw, per rank. */
  bridges?: { rank: number; from: PtMm; to: PtMm }[];
};

export function fillPiecesDetailed(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  opts: FillOpts & { splitTouching?: boolean; only?: ReadonlySet<number> },
  progress?: (done: number, total: number, note?: string) => void,
  edits: WallEdits = {},
): { families: PieceFamily[]; diag: FillDiag } {
  const t0 = Date.now();
  const cell = opts.cellMm || PATIMPORT.fillCellMm;
  const model = wallModel(set, run, sheet.texts);
  const use = seeds.filter(
    (s) => opts.variant == null || s.variant == null || s.variant === opts.variant,
  );
  const knives = opts.variant ? variantKnives(sheet, set, opts.variant) : [];
  const knifeItems = itemsOf(set, knives);
  // a variant's cutting line drawn once per size cuts only its own size (kombinezon's 4XL pants
  // were trimmed at the 2XL cut line inside them); unranked knives cut every size
  const rankOfKnife = new Map<ChainId, number>();
  model.byRank.forEach((ids, r) => ids.forEach((id) => rankOfKnife.set(id, r)));
  const knivesOf = (r: number) =>
    knifeItems.filter((it) => {
      const kr = rankOfKnife.get(it.chain);
      return kr === undefined || kr === r || model.mode === 'single';
    });
  const boxes = rankBoxes(set, model);
  const shift = fileShift(model, boxes);
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
  const module = sheetModule(sheet);
  const rescued = rescuedIgnored(
    set,
    model,
    1.5,
    15,
    module,
    pageMarginIds(set.chains, sheet.poses),
  );
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
    (edits.include ?? []).filter((x) => x.rank === r || x.rank === null).flatMap((x) => x.ids);
  const opBridges = (r: number) => (edits.bridges ?? []).filter((b) => b.rank === r);
  const bandCuts = (r: number) => (model.bandCuts ?? []).filter((b) => b.rank === r);

  /** Pass A walls of one rank: common + own + rescued + the operator's + lone stretches. */
  const baseItems = (r: number, excl: Set<ChainId>) => {
    const ownIds = model.mode === 'single' ? [] : model.byRank[r];
    return [
      ...itemsOf(set, [...model.common, ...ownIds, ...rescued, ...extraOf(r)]),
      ...lone,
      ...opBridges(r).map((b) => ({ chain: -2, pts: [b.from, b.to] })),
      ...bandCuts(r).map((b) => ({ chain: -3, pts: [b.from, b.to] })),
    ].filter((it) => !excl.has(it.chain));
  };

  /** One rank, every seed; returns the candidates and the frame chains found around merges. */
  const rankPass = (
    r: number,
    excl: Set<ChainId>,
    override?: Map<number, PtMm>,
    /** Seeds to bridge, with the least area the family's trend allows (0: none known). */
    bridgeFor?: Map<number, number>,
  ) => {
    // knives stay walls where they are this rank's lines: the variant's cutting line is the
    // piece's edge (taken out, kombinezon's 4XL front leaked through it); the cut below still
    // trims any region that crosses one
    const keep = (it: WallItem) => !excl.has(it.chain);
    const base = buildRank(box, cell, baseItems(r, excl));
    const pts = use.map((s) => override?.get(s.id) ?? shift(s.at, r));
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
    const bridgedCache = new Map<RankCtx, Bridge[]>();
    const bridgedOf = (c0: RankCtx) => {
      let v = bridgedCache.get(c0);
      if (!v) bridgedCache.set(c0, (v = wallBridges(c0.items, opts.autoBridgeMm ?? 3)));
      return v;
    };
    const out = new Map<number, PieceCandidate>();
    const frames = new Set<ChainId>();
    for (let si = 0; si < use.length; si++) {
      const seed = use[si];
      if (dropped.has(seed.id)) continue;
      if (opts.only && !opts.only.has(seed.id)) continue;
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
      /** The seed's region in a context: knife cut, sliver opening, other seeds inside. */
      const regionAt = (c: RankCtx, kk: number) => {
        const { g: gg } = c;
        let { mask } = regionOf(gg, c.ext, kk);
        // knives (variant cutting lines) crossing the region: cut and keep the seed's side
        const kis = knivesOf(r);
        if (kis.length) {
          const kn = new Uint8Array(mask.length);
          for (const it of kis) drawPolyline(gg, kn, it.pts, it.closed);
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
            flood(gg, blocked, [kk], cut);
            if (cut.some((v) => v)) mask = cut;
          }
        }
        // the opening cuts slivers (< 2 mm) off the seed's region: two pieces joined only through
        // a hairline gap between their walls come apart here, so "merged" is judged after it
        let opened = openMask(gg, mask, 2, kk);
        const others: number[] = [];
        const kOf = new Map<number, number>();
        for (let sj = 0; sj < use.length; sj++) {
          if (sj === si || dropped.has(use[sj].id)) continue;
          const kj = c === base ? px[sj].k : seedPixel(gg, c.wall, c.ext, pts[sj]).k;
          kOf.set(sj, kj);
          if (opened[kj]) others.push(sj);
        }
        // touching pieces (one outer region, each seed in its own cell): split by cells
        const live = others.filter((sj) => !dropped.has(use[sj].id));
        if (live.length && opts.splitTouching !== false) {
          const part = splitByCells(
            gg,
            c.wall,
            mask,
            [kk, ...live.map((sj) => kOf.get(sj)!)],
            0,
            c.items,
          );
          if (part) {
            opened = openMask(gg, part, 2, kk);
            diag.split = (diag.split ?? 0) + 1;
            return { opened, others: others.filter((sj) => !live.includes(sj)) };
          }
        }
        return { opened, others };
      };
      const isMerged = (o: number[]) => o.some((sj) => !dropped.has(use[sj].id));
      let reg = ctx.ext[k] ? null : regionAt(ctx, k);
      // leak or merge: close the gap the fill escapes through with short derived bridges (≤ 3 mm,
      // dangling end → nearest wall of this rank). Only bridges crossing the escape path are
      // added (to the sheet border for a leak, to the other seed for a merge), one round at a
      // time — never a bridge elsewhere that would cut the piece itself.
      let bridges: Bridge[] = [];
      if (bridgeFor?.has(seed.id) && (!reg || isMerged(reg.others)))
        for (const c0 of ctx === base ? [base] : [ctx, base]) {
          const all = bridgedOf(c0);
          if (!all.length) continue;
          let chosen: Bridge[] = [];
          let c = c0;
          let done = false;
          const minArea = bridgeFor?.get(seed.id) ?? 0;
          for (let round = 0; round < 6 && !done; round++) {
            const p2 = seedPixel(c.g, c.wall, c.ext, pts[si]);
            const rg = c.ext[p2.k] ? null : regionAt(c, p2.k);
            // closed, but well short of the family's trend: a wall across the piece (a grain
            // line from edge to edge) closed one side while the other still leaks — escape from
            // the exterior just across it, nearest the region's middle
            if (rg && !isMerged(rg.others) && minArea) {
              let n = 0;
              let sx = 0;
              let sy = 0;
              for (let j = 0; j < rg.opened.length; j++)
                if (rg.opened[j]) {
                  n++;
                  const y = (j / c.g.W) | 0;
                  sx += j - y * c.g.W;
                  sy += y;
                }
              if (n * cell * cell < minArea) {
                const start = nearestExterior(c, Math.round(sx / n), Math.round(sy / n));
                const path = start >= 0 ? escapePath(c.g, c.wall, start, null) : null;
                const add = path
                  ? all.filter((b) => !chosen.includes(b) && crossesPath(c.g, b, path))
                  : [];
                if (!add.length) break;
                chosen = chosen.concat(add);
                c = buildRank(box, cell, [
                  ...c0.items,
                  ...chosen.map((b) => ({ chain: -1, pts: [b.from, b.to] })),
                ]);
                continue;
              }
            }
            if (rg && !isMerged(rg.others)) {
              if (chosen.length) {
                if (c0 === base && ctx !== base)
                  rankFrom = model.mode === 'single' ? 'single' : 'class';
                ctx = c;
                k = p2.k;
                movedMm = p2.movedMm;
                reg = rg;
                bridges = chosen;
              }
              done = true;
              break;
            }
            const to = rg
              ? new Set(
                  rg.others
                    .filter((sj) => !dropped.has(use[sj].id))
                    .map((sj) => seedPixel(c.g, c.wall, c.ext, pts[sj]).k),
                )
              : null;
            const path = escapePath(c.g, c.wall, p2.k, to);
            if (!path) break;
            const add = all.filter((b) => !chosen.includes(b) && crossesPath(c.g, b, path));
            if (!add.length) break;
            chosen = chosen.concat(add);
            c = buildRank(box, cell, [
              ...c0.items,
              ...chosen.map((b) => ({ chain: -1, pts: [b.from, b.to] })),
            ]);
          }
          if (bridges.length) break;
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
      if (!reg) {
        cand.outcome = 'leak';
        cand.leakAt = pts[si]; // refined after every rank is filled (leak mouths, below)
        out.set(seed.id, cand);
        continue;
      }
      const { opened, others } = reg;
      const lab = seedLabel(seed);
      for (const sj of others) {
        const lj = seedLabel(use[sj]);
        if (lab && lj && lab === lj && r === 0) {
          // the same piece labelled twice: keep the first seed
          dropped.add(use[sj].id);
          diag.duplicates.push({ seed: use[sj].id, of: seed.id });
        }
      }
      const merged = isMerged(others);
      const raster = traceOuter(g, opened);
      if (raster.length < 4) {
        cand.outcome = 'tiny';
        out.set(seed.id, cand);
        continue;
      }
      const sn = snapOutline(raster, ctx.items.concat(knivesOf(r)), {
        stepMm: 1,
        reachMm: 2.5,
        snapMm: opts.snapMm || PATIMPORT.snapMm,
      });
      const outer = signedArea(sn.outer) < 0 ? sn.outer.slice().reverse() : sn.outer;
      cand.outer = outer;
      cand.walls = sn.walls.filter((id) => id >= 0);
      // bridges the outline runs along are derived edges the operator must see
      const usedB = bridges.filter((b) => {
        const m = { x: (b.from.x + b.to.x) / 2, y: (b.from.y + b.to.y) / 2 };
        let d = Infinity;
        for (let i = 0; i < outer.length && d > 1; i++)
          d = Math.min(d, segNearest(m, outer[i], outer[(i + 1) % outer.length]).d);
        return d <= 1;
      });
      const usedOp = opBridges(r).filter((b) => {
        const m = { x: (b.from.x + b.to.x) / 2, y: (b.from.y + b.to.y) / 2 };
        let d = Infinity;
        for (let i = 0; i < outer.length && d > 1; i++)
          d = Math.min(d, segNearest(m, outer[i], outer[(i + 1) % outer.length]).d);
        return d <= 1;
      });
      const onOutline = (b: { from: PtMm; to: PtMm }) => {
        const m = { x: (b.from.x + b.to.x) / 2, y: (b.from.y + b.to.y) / 2 };
        let d = Infinity;
        for (let i = 0; i < outer.length && d > 1; i++)
          d = Math.min(d, segNearest(m, outer[i], outer[(i + 1) % outer.length]).d);
        return d <= 1;
      };
      const der = [
        ...usedB.map((b) => ({ kind: 'bridge' as const, pts: [b.from, b.to] })),
        ...usedOp.map((b) => ({ kind: 'operator-bridge' as const, pts: [b.from, b.to] })),
        ...bandCuts(r)
          .filter(onOutline)
          .map((b) => ({ kind: 'band-cut' as const, pts: [b.from, b.to] })),
      ];
      if (der.length) cand.derived = der;
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
          if (!userExcl.has(id) && frameLike(set.chains[id].pts, 60, module)) frames.add(id);
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

  /**
   * File-per-size: a click lands on one size's drawing; on the other files the pieces sit elsewhere
   * (larger sizes push their neighbours along). Each seed's home-rank piece is the reference; on
   * every other rank the enclosed regions of that file are matched to the references (greedy, one
   * region per seed, by area, sides and place in the drawing) and the seed is moved into its match
   * when the shifted click fell into another region (or none).
   */
  const placed = new Map<string, PtMm>();
  const correspond = (excl: Set<ChainId>) => {
    const refs = new Map<number, { cand: PieceCandidate; home: number }>();
    for (const s of use) {
      const home = homeRank(boxes, s.at);
      const c = cands.get(s.id)!.find((x) => x.rank === home && x.outcome === 'closed');
      if (home >= 0 && c) refs.set(s.id, { cand: c, home });
    }
    if (!refs.size) return;
    for (let r = 0; r < model.n; r++) {
      const fb = boxes[r];
      if (!fb) continue;
      const ctx = buildRank(box, cell, baseItems(r, excl));
      const { comps, labelAt } = components(
        ctx.g,
        ctx.wall,
        ctx.ext,
        grow(fb, 2),
        PATIMPORT.minPieceAreaMm2 / (cell * cell),
      );
      if (!comps.length) continue;
      const pairs: { sid: number; ci: number; d: number }[] = [];
      for (const [sid, { cand, home }] of refs) {
        if (home === r) continue;
        const hb = boxes[home]!;
        comps.forEach((cp, ci) =>
          pairs.push({
            sid,
            ci,
            d: unlike(
              { area: cand.areaMm2, box: cand.bbox },
              hb,
              { area: cp.count * cell * cell, box: cp.box },
              fb,
            ),
          }),
        );
      }
      pairs.sort((a, b) => a.d - b.d);
      const takenS = new Set<number>();
      const takenC = new Set<number>();
      const override = new Map<number, PtMm>();
      for (const p of pairs) {
        if (takenS.has(p.sid) || takenC.has(p.ci) || p.d > 1.5) continue;
        takenS.add(p.sid);
        takenC.add(p.ci);
        const s = use.find((x) => x.id === p.sid)!;
        const now = seedPixel(ctx.g, ctx.wall, ctx.ext, shift(s.at, r));
        const cp = comps[p.ci];
        if (ctx.ext[now.k] || labelAt(now.k) !== cp.id) {
          const y = (cp.k / ctx.g.W) | 0;
          override.set(p.sid, ctx.g.centre(cp.k - y * ctx.g.W, y));
        }
      }
      if (!override.size) continue;
      const res = rankPass(r, excl, override);
      for (const [sid, at] of override) placed.set(key(sid, r), at);
      for (const sid of override.keys()) {
        const c = res.out.get(sid);
        const list = cands.get(sid)!;
        const i = list.findIndex((x) => x.rank === r);
        if (c && i >= 0) list[i] = c;
      }
      diag.moved = (diag.moved ?? 0) + override.size;
    }
  };

  /**
   * Derived bridges, per leaking / merged candidate, after every rank is filled: the bridged region
   * is kept only when the family corroborates it — its area must sit on the trend of the seed's
   * closed, unbridged ranks (a bridge that closes half a piece behind a grain line does not).
   * Without such a rank nothing is bridged.
   */
  const bridgePass = (excl: Set<ChainId>) => {
    for (let r = 0; r < model.n; r++) {
      const want = new Set<number>();
      for (const s of use) {
        const c = cands.get(s.id)?.find((x) => x.rank === r);
        if (c && (c.outcome === 'leak' || c.outcome === 'merged') && expectedArea(s.id, r))
          want.add(s.id);
      }
      if (!want.size) continue;
      const override = new Map<number, PtMm>();
      for (const sid of want) {
        const at = placed.get(key(sid, r));
        if (at) override.set(sid, at);
      }
      const res = rankPass(
        r,
        excl,
        override,
        new Map(
          [...want].map((sid) => {
            const ex = expectedArea(sid, r);
            return [sid, ex ? ex.area * (1 - ex.tol) : 0];
          }),
        ),
      );
      for (const sid of want) {
        const c = res.out.get(sid);
        const ex = expectedArea(sid, r);
        if (!c || c.outcome !== 'closed' || !c.derived?.length) continue;
        if (!ex || Math.abs(c.areaMm2 - ex.area) > ex.tol * ex.area) continue;
        const list = cands.get(sid)!;
        const i = list.findIndex((x) => x.rank === r);
        if (i >= 0) list[i] = c;
        diag.bridged = (diag.bridged ?? 0) + 1;
      }
    }
  };
  /** The family's area trend at rank r from its closed, unbridged ranks (null: none). */
  const expectedArea = (sid: number, r: number) => {
    const ok = (cands.get(sid) ?? []).filter(
      (x) => x.outcome === 'closed' && !x.derived?.length && x.rank !== r,
    );
    if (!ok.length) return null;
    if (ok.length === 1) {
      const d = Math.abs(r - ok[0].rank);
      return { area: ok[0].areaMm2 * (1 + 0.04 * (r - ok[0].rank)), tol: 0.05 + 0.03 * d };
    }
    const n = ok.length;
    const mx = ok.reduce((a, x) => a + x.rank, 0) / n;
    const my = ok.reduce((a, x) => a + x.areaMm2, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (const x of ok) {
      sxy += (x.rank - mx) * (x.areaMm2 - my);
      sxx += (x.rank - mx) ** 2;
    }
    const slope = sxx ? sxy / sxx : 0;
    const near = Math.min(...ok.map((x) => Math.abs(x.rank - r)));
    return { area: my + slope * (r - mx), tol: 0.05 + 0.02 * near };
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
  if (model.mode === 'file') correspond(excl);
  if (opts.autoBridgeMm !== 0) bridgePass(excl);
  // leak mouths: per rank, walk from the seed until it leaves the piece as another rank closed it
  // (or, with no closed rank, the thickened-wall closure)
  for (let r = 0; r < model.n; r++) {
    const leaks = use
      .map((s, si) => ({ s, si, c: cands.get(s.id)!.find((x) => x.rank === r) }))
      .filter((x) => x.c && x.c.outcome === 'leak');
    if (!leaks.length) continue;
    const ctx = buildRank(box, cell, baseItems(r, excl));
    for (const { s, c } of leaks) {
      const closed = cands
        .get(s.id)!
        .filter((x) => x.outcome === 'closed' && x.outer.length > 2)
        // the next LARGER closed size encloses this one: the escape crosses its outline just
        // past the gap (a smaller one is crossed deep inside, far from it)
        .sort(
          (a, b) =>
            (a.rank > r ? 0 : 1000) +
            Math.abs(a.rank - r) -
            (b.rank > r ? 0 : 1000) -
            Math.abs(b.rank - r),
        );
      const at = shift(s.at, r);
      const { k } = seedPixel(ctx.g, ctx.wall, null, at);
      // file-per-size: the reference rank sits in another file — move its outline over
      let ref = closed[0]?.outer;
      if (ref && model.mode === 'file') {
        const from = shift(s.at, closed[0].rank);
        const dx = at.x - from.x;
        const dy = at.y - from.y;
        ref = ref.map((q) => ({ x: q.x + dx, y: q.y + dy }));
      }
      c!.leakAt = leakMouth(ctx.g, ctx.wall, k, ref) ?? at;
    }
  }
  // a size the run lists but no line draws (viola's 34: every bundle has 7 lines for 8 sizes — the
  // smallest is drawn on the next one's line): at the end of the run, that rank's piece IS its
  // neighbour's contour. Copied, flagged 'shared-rank' so the operator sees it is not drawn.
  if (model.mode === 'graded' && model.n > 2)
    for (const r of model.emptyRanks) {
      const from = r === 0 ? 1 : r === model.n - 1 ? model.n - 2 : -1;
      if (from < 0 || model.emptyRanks.includes(from)) continue;
      for (const s of use) {
        const list = cands.get(s.id);
        const src = list?.find((x) => x.rank === from && x.outcome === 'closed');
        const i = list?.findIndex((x) => x.rank === r) ?? -1;
        if (!list || !src || i < 0 || list[i].outcome === 'closed') continue;
        list[i] = {
          ...src,
          rank: r,
          derived: [...(src.derived ?? []), { kind: 'shared-rank', pts: [] }],
        };
        diag.sharedRank = (diag.sharedRank ?? 0) + 1;
      }
    }
  // an UNGRADED piece is drawn identically in every size layer (kombinezon's piece 8: eight equal
  // rectangles, F3 keeps one as common and marks the rest duplicates). Equal areas are right
  // there — only when every wall of its outline has a copy at the same place in ≥ n − 1 layers.
  const dupCount = (id: ChainId) => {
    const c = set.chains[id];
    if (!c) return 0;
    const b = bboxOf(c.pts);
    let k = 0;
    for (const o of set.chains) {
      if (o.id === id || Math.abs(o.lengthMm - c.lengthMm) > 0.2) continue;
      const q = bboxOf(o.pts);
      if (
        Math.abs(q.minX - b.minX) < 0.2 &&
        Math.abs(q.minY - b.minY) < 0.2 &&
        Math.abs(q.maxX - b.maxX) < 0.2 &&
        Math.abs(q.maxY - b.maxY) < 0.2
      )
        k++;
    }
    return k;
  };
  const ungraded = (c: PieceCandidate[]) => {
    if (model.mode !== 'graded') return false;
    const cl = c.filter((x) => x.outcome === 'closed');
    if (cl.length !== model.n) return false;
    const a0 = cl[0].areaMm2;
    if (!cl.every((x) => Math.abs(x.areaMm2 - a0) <= 0.001 * a0)) return false;
    const walls = new Set(cl.flatMap((x) => x.walls));
    if (!walls.size || ![...walls].every((id) => dupCount(id) >= model.n - 1)) return false;
    (diag.ungraded ??= []).push(c[0].seed);
    return true;
  };
  const families: PieceFamily[] = [];
  for (const s of use) {
    if (dropped.has(s.id)) continue;
    let c = cands.get(s.id)!;
    // a family whose closed areas strictly SHRINK with rank (≥ 3 of them) was ranked upside down
    // in that piece (F3 read its nesting from the wrong side): the outline of rank r belongs to
    // size n−1−r. Re-rank it when the reversed family is monotone, and say so.
    if (model.mode === 'graded' && !isMonotone(c)) {
      const cl = c.filter((x) => x.outcome === 'closed').sort((a, b) => a.rank - b.rank);
      const shrinks =
        cl.length >= 3 && cl.every((x, i) => i === 0 || x.areaMm2 < cl[i - 1].areaMm2);
      const rev = c
        .map((x) => ({ ...x, rank: model.n - 1 - x.rank }))
        .sort((a, b) => a.rank - b.rank);
      if (shrinks && isMonotone(rev)) {
        c = rev;
        cands.set(s.id, c);
        (diag.reversed ??= []).push(s.id);
      }
    }
    families.push({ seed: s.id, candidates: c, monotone: isMonotone(c) || ungraded(c) });
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
  // a rank drawn on its neighbour's line shares its area by construction
  const a = c
    .filter((x) => x.outcome === 'closed' && !x.derived?.some((d) => d.kind === 'shared-rank'))
    .sort((x, y) => x.rank - y.rank);
  for (let i = 1; i < a.length; i++) if (a[i].areaMm2 <= a[i - 1].areaMm2 * 1.0005) return false;
  // one size step changes a piece by a few per cent; a rank 25 % off the next closed one closed
  // a different region (half a skirt behind a centre line, a neighbour's band) — not a grade
  for (let i = 1; i < a.length; i++) {
    const step = a[i].rank - a[i - 1].rank;
    if (a[i].areaMm2 > a[i - 1].areaMm2 * (1 + 0.25 * step)) return false;
  }
  return true;
}

export const fillPieces: FillPiecesFn = (sheet, set, run, seeds, opts, progress) =>
  fillPiecesDetailed(sheet, set, run, seeds, opts, progress).families;

export { dist };
