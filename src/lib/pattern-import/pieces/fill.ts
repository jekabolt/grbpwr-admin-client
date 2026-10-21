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
  ContinuityVerdict,
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

import { bboxOf, dist, pointInPoly, resample, SegGrid, segNearest, signedArea } from './geom';
import {
  components,
  drawPolyline,
  exterior,
  flood,
  Grid,
  openMask,
  maskBox,
  regionOf,
  splitByCells,
  traceOuter,
} from './raster';
import { pageMarginIds } from 'lib/pattern-import/chains/classify';
import { chainView, partAt, sheetView } from 'lib/pattern-import/assemble/composite';
import { gradeView } from 'lib/pattern-import/chains/face-role';

import { type Bridge, wallBridges } from './bridges';
import { gradeHook, SOLVER_MODEL, type GradeHook } from './grade/hook';
import { seedFaces, type SeedFaceDiag } from './seed-face';
import { seedLabel } from './seeds';
import { snapOutline, type WallItem } from './snap';
import { cutTails, LineIndex, type TailCut } from './tails';
import { variantKnifeItems } from './variants';
import { localRanks } from './bundle-rank';
import {
  continuityWalls,
  type ContinuityWall,
  frameLike,
  itemsOf,
  landingPlugs,
  lonePortions,
  overlayLines,
  rescuedIgnored,
  copyRanks,
  copyWallsOf,
  cornerSources,
  sheetModule,
  wallModel,
  type WallModel,
} from './walls';
import { rankLooks } from './identity';
import { gradeP2Off, repairPass, type RepairDiag } from './gfit/repair-hook';
import type { OverlayLines } from '../sizes/overlay';

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
  /** MOOD Ф3.2: continuity walls walked along an overlay (built, before the verdicts). */
  overlayWalls?: number;
  /** Seeds whose family was ranked upside down in its piece and re-ranked (areas shrank). */
  reversed?: number[];
  /** Candidates closed by derived bridges (family-corroborated). */
  bridged?: number;
  /** Marking tails cut off a size's outline at its own line (pieces/tails). */
  tails?: (TailCut & { seed: number; rank: number })[];
  /** Merged outer regions split by cells (touching pieces). */
  split?: number;
  /** File-per-size: seed placements moved to the matching region of another size's file. */
  moved?: number;
  /** P3 file-per-size: click seeds carried to another size's file by their face (pieces/seed-face). */
  faced?: SeedFaceDiag[];
  /** pieces/grade (H1): the alike-drawn-sizes hook, when it ran. */
  grade?: GradeHook;
  /** D4: the sub-fill of a mixed sheet's guarded seeds (on the solver's walls). */
  subGrade?: FillDiag[];
  /**
   * P1: candidates closed through continuity walls — kept (the family stayed consistent) and
   * refused (left as the leak they were, with the reason).
   */
  continuity?: {
    kept: number;
    refused: {
      seed: number;
      rank: number;
      why: string;
      areaMm2: number;
      outer: PtMm[];
      continuity: PieceCandidate['continuity'];
    }[];
  };
  /** GRADE P2 (hook A): sizes repaired from their family's grade, and the refusals by reason. */
  repair?: RepairDiag;
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

/** Probe switch (node only): P1_NOCONT turns continuity walls off (negative control). */
function contOff(): boolean {
  return typeof process !== 'undefined' && !!process.env?.P1_NOCONT;
}

/** Probe switch (node only): MOOD_F3_OFF turns the Ф3 overlay readings off (the "before" column). */
function f3Off(): boolean {
  return typeof process !== 'undefined' && !!process.env?.MOOD_F3_OFF;
}

/** Probe switch: keep the marking tails (pieces/tails) the fill takes. */
function tailOff(): boolean {
  return typeof process !== 'undefined' && !!process.env?.M_TAIL_OFF;
}

/** Share of a polyline (sampled every 0.5 mm) within `tol` of a closed outline. */
function alongShare(pts: readonly PtMm[], outer: readonly PtMm[], tol: number): number {
  if (pts.length < 2 || outer.length < 3) return 0;
  const g = new SegGrid(4);
  g.addPolyline(0, outer, true);
  let n = 0;
  let hit = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const m = Math.max(1, Math.ceil(dist(a, b) / 0.5));
    for (let k = 0; k < m; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / m, y: a.y + ((b.y - a.y) * k) / m };
      n++;
      let ok = false;
      g.near(p, tol, (_o, s) => {
        if (ok) return;
        const q1 = outer[(s + 1) % outer.length];
        if (segNearest(p, outer[s], q1).d <= tol) ok = true;
      });
      if (ok) hit++;
    }
  }
  return n ? hit / n : 0;
}

/**
 * D6 (one PDF = one garment, every tile sheet in one drawing): the pieces of each tile sheet are
 * filled on THAT sheet alone — its lines, texts and tiles (`sheetView`), the other sheets' chains
 * masked (`chainView`). Nothing the fill measures across a sheet (the grade model's lane step, the
 * wall model's label ranks, frames, lone portions) can then mix two sheets: every sheet's pieces
 * come out as they did when the sheet was imported alone. One sheet = the fill as before.
 */
export function fillPiecesDetailed(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  opts: FillOpts & { splitTouching?: boolean; only?: ReadonlySet<number> },
  progress?: (done: number, total: number, note?: string) => void,
  edits: WallEdits = {},
  /** D4: a sub-fill of a mixed sheet's guarded seeds, on the solver's walls only */
  solved?: GradeHook,
): { families: PieceFamily[]; diag: FillDiag } {
  const parts = sheet.parts;
  if (!parts || parts.length < 2)
    return fillOneSheet(sheet, set, run, seeds, opts, progress, edits, solved);
  const t0 = Date.now();
  const families: PieceFamily[] = [];
  let diag: FillDiag | null = null;
  const amb: NonNullable<GradeHook['ambiguities']> = [];
  parts.forEach((part, k) => {
    const mine = seeds.filter((s) => partAt(parts, s.at)?.sheet === part.sheet);
    if (!mine.length) return;
    if (opts.only && !mine.some((s) => opts.only!.has(s.id))) return;
    const sub = progress
      ? (d: number, t: number, n?: string) =>
          progress(k * 100 + (d / Math.max(1, t)) * 100, parts.length * 100, n)
      : undefined;
    const r = fillOneSheet(
      sheetView(sheet, part),
      chainView(set, parts, part.sheet),
      run,
      mine,
      opts,
      sub,
      edits,
      solved,
    );
    families.push(...r.families);
    amb.push(...(r.diag.grade?.ambiguities ?? []));
    diag = !diag
      ? r.diag
      : {
          ...diag,
          duplicates: [...diag.duplicates, ...r.diag.duplicates],
          cand: new Map([...diag.cand, ...r.diag.cand]),
          frames: [...diag.frames, ...r.diag.frames],
          rescued: diag.rescued + r.diag.rescued,
          grade: diag.grade ?? r.diag.grade,
        };
  });
  const d: FillDiag = diag ?? {
    model: { mode: 'single', n: 0, emptyRanks: [] },
    duplicates: [],
    cand: new Map(),
    frames: [],
    rescued: 0,
    ms: 0,
  };
  if (d.grade) d.grade = { ...d.grade, ambiguities: amb };
  d.ms = Date.now() - t0;
  return { families, diag: d };
}

function fillOneSheet(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun,
  seeds: Seed[],
  opts: FillOpts & { splitTouching?: boolean; only?: ReadonlySet<number> },
  progress?: (done: number, total: number, note?: string) => void,
  edits: WallEdits = {},
  solved?: GradeHook,
): { families: PieceFamily[]; diag: FillDiag } {
  const t0 = Date.now();
  const cell = opts.cellMm || PATIMPORT.fillCellMm;
  const styleMap = new Map(sheet.styles.map((s) => [s.id, s]));
  const model = solved ? SOLVER_MODEL : wallModel(set, run, sheet.texts, styleMap);
  // MOOD Ф3.2: the size lines as overlay evidence for continuity — identity runs only (a rank by
  // nesting alone proves no pen); built on first use
  let overlayEv: OverlayLines | null | undefined;
  const overlayOf = () =>
    overlayEv !== undefined
      ? overlayEv
      : (overlayEv =
          model.mode === 'graded' && !f3Off() && rankLooks(set, run, styleMap).identity
            ? overlayLines(set, model.byRank)
            : null);
  const use = seeds.filter(
    (s) => opts.variant == null || s.variant == null || s.variant === opts.variant,
  );
  // H1: sizes drawn alike — the solver's per-rank walls, or refusals (null = F4 as before)
  // (the face pass's unconfirmed strays are lines to the size checks: chains/face-role gradeView)
  const graded =
    solved ?? gradeHook(sheet, gradeView(set), run, use, model, opts, progress, edits.exclude);
  const nRanks = graded?.n ?? model.n;
  // the variant's certain marks: cutting lines across a piece, and the outline edge a label names
  const knifeItems = opts.variant ? variantKnifeItems(sheet, set, opts.variant) : [];
  // a variant's cutting line drawn once per size cuts only its own size (kombinezon's 4XL pants
  // were trimmed at the 2XL cut line inside them); unranked knives cut every size
  const rankOfKnife = new Map<ChainId, number>();
  model.byRank.forEach((ids, r) => ids.forEach((id) => rankOfKnife.set(id, r)));
  const knivesOf = (r: number) =>
    knifeItems.filter((it) => {
      if (graded?.notKnife.has(it.chain)) return false; // H1: a size line, not a knife
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
  const margins = pageMarginIds(set.chains, sheet.poses);
  const corners = cornerSources(model);
  const rescued = rescuedIgnored(set, model, 1.5, 15, module, new Set([...margins, ...corners]));
  /** P1: chains never continuity walls — page margins, every chain the fill excludes, and the
   *  stubs / ramps a size's corner wall already stands for (MOOD Ф2). */
  const contSkip = (excl: ReadonlySet<ChainId>) =>
    new Set<ChainId>([...margins, ...excl, ...corners]);
  diag.rescued = rescued.length;
  // COPY RANKS: a rescued copy of one size's line walls the other sizes only where they coincide
  // with it (walls.ts copyWallsOf); per rank, built on first use
  const copies = copyRanks(set, model, rescued);
  const rescuedOf = new Map<number, WallItem[]>();
  const rescuedItems = (r: number): WallItem[] => {
    let v = rescuedOf.get(r);
    if (!v)
      rescuedOf.set(
        r,
        (v = copies.size ? copyWallsOf(set, model, copies, rescued, r) : itemsOf(set, rescued)),
      );
    return v;
  };
  // MARKING TAILS: a marking drawn once per size runs past a smaller size's outline; where its
  // strokes are closed off out there, the strip between them is enclosed and the fill takes it.
  // Cut at the size's own line when the tail proves itself (pieces/tails cutTails).
  const tailsOn = model.mode === 'graded' && !graded?.walls && !tailOff();
  let commonIdx: LineIndex | null = null;
  const ownIdx = new Map<string, LineIndex>();
  const untail = (outer: PtMm[], seedId: number, r: number, from: RankFrom): PtMm[] => {
    if (!tailsOn) return outer;
    const re = from === 'bundleRank' || from === 'continuity';
    const k = `${r}:${re ? 1 : 0}`;
    let own = ownIdx.get(k);
    if (!own) {
      const ids = new Set(model.byRank[r] ?? []);
      if (re) for (const id of rerank().model.byRank[r] ?? []) ids.add(id);
      ownIdx.set(k, (own = new LineIndex(itemsOf(set, ids))));
    }
    commonIdx ??= new LineIndex(itemsOf(set, model.common));
    const t = cutTails(outer, own, commonIdx);
    if (!t.cuts.length) return outer;
    (diag.tails ??= []).push(...t.cuts.map((c) => ({ ...c, seed: seedId, rank: r })));
    return t.outer;
  };
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
  /** MOOD Ф2: rank r's corners closed by its own stub / ramps / extended edges (derived walls). */
  const cornerItems = (r: number): WallItem[] =>
    (model.corners ?? []).filter((c) => c.rank === r).map((c) => ({ chain: -4, pts: c.pts }));

  // MOOD TICKS: each size's proven end tick across a strip (pieces/ticks.ts)
  const endTicks = model.endTicks ?? [];
  const ticksDebug = typeof process !== 'undefined' && !!process.env?.MOOD_TICKS_DEBUG;
  const tickItems = (r: number): WallItem[] => [
    ...itemsOf(
      set,
      endTicks.filter((t) => t.rank === r).map((t) => t.chain),
    ),
    ...tickCarried(r).map((b) => ({ chain: -3, pts: [b.from, b.to] })),
  ];
  /** The stretches a proven tick is carried past its drawn ends to the strip's sides: snapped to
   *  and listed as derived band cuts on the outline — never walls (Codex: a wall here could close
   *  another piece of the rank). */
  const tickCarried = (r: number) =>
    endTicks
      .filter((t) => t.rank === r)
      .flatMap((t) => t.carried.map(([from, to]) => ({ from, to, ticks: [t.chain] })));
  /**
   * Rank r's region cut along its own end ticks (each carried to the strip's sides), the body side
   * kept; null = the region runs past one of r's ticks after the cut (the knife did not part it) or
   * past a larger size's proven end tick. The same region when no tick of the sheet crosses it.
   */
  const cutAtTicks = (
    gg: Grid,
    mask0: Uint8Array,
    r: number,
    seedAt: PtMm,
    seedK: number,
  ): Uint8Array | null => {
    const px = (p: PtMm) => {
      const x = gg.ix(p.x);
      const y = gg.iy(p.y);
      return gg.inside(x, y) ? y * gg.W + x : -1;
    };
    const inM = (m: Uint8Array, p: PtMm) => {
      const k = px(p);
      return k >= 0 && m[k] === 1;
    };
    // a tick speaks for a region that is its strip: not one holding the strip and more (a strap
    // drawn inside a dress front, vixen) — the strip's outside at the tick is not in it
    // …and whose seed lies across the strip (between its sides): a region of several strips joined
    // at a shared end (nolita's ruffles) answers only to the ticks of its seed's strip
    const mine = (m: Uint8Array, t: (typeof endTicks)[number]) => {
      if (inM(m, t.beside[0]) || inM(m, t.beside[1])) return false;
      const [k0, k1] = t.knife;
      const L = dist(k0, k1) || 1;
      const al = ((seedAt.x - k0.x) * (k1.x - k0.x) + (seedAt.y - k0.y) * (k1.y - k0.y)) / L;
      return al >= 0 && al <= L;
    };
    let mask = mask0;
    for (const t of endTicks) {
      if (t.rank !== r || !inM(mask, t.inPt) || !inM(mask, t.outPt) || !mine(mask, t)) continue;
      // the cut runs on the region's own box (a strip, not the sheet: Codex — full-sheet rasters
      // per seed × rank × retry)
      const bb = maskBox(gg, mask);
      const W = bb.x1 - bb.x0 + 1;
      const H = bb.y1 - bb.y0 + 1;
      const lg = {
        W,
        H,
        ix: (x: number) => gg.ix(x) - bb.x0,
        iy: (y: number) => gg.iy(y) - bb.y0,
      } as unknown as Grid;
      const lk = (p: PtMm) => {
        const x = gg.ix(p.x) - bb.x0;
        const y = gg.iy(p.y) - bb.y0;
        return x >= 0 && y >= 0 && x < W && y < H ? y * W + x : -1;
      };
      const blocked = new Uint8Array(W * H);
      drawPolyline(lg, blocked, t.knife);
      for (let y = 0; y < H; y++) {
        const row = (y + bb.y0) * gg.W + bb.x0;
        for (let x = 0; x < W; x++) if (!mask[row + x]) blocked[y * W + x] = 1;
      }
      const k0 = lk(t.inPt);
      if (k0 < 0 || blocked[k0]) {
        if (ticksDebug) console.log(`TICKCUT r${r} c${t.chain}: body point blocked`);
        return null;
      }
      const local = new Uint8Array(W * H);
      flood(lg, blocked, [k0], local);
      const ko = lk(t.outPt);
      if (ko >= 0 && local[ko]) {
        if (ticksDebug)
          console.log(`TICKCUT r${r} c${t.chain}: the knife does not part the region`);
        return null;
      }
      // the seed is beyond r's end: its piece is not r's outline here
      const sx = (seedK % gg.W) - bb.x0;
      const sy = Math.floor(seedK / gg.W) - bb.y0;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H || !local[sy * W + sx]) {
        if (ticksDebug) console.log(`TICKCUT r${r} c${t.chain}: the seed lies past r's end`);
        return null;
      }
      // r keeps the body side: the rest of the box leaves the region, in place (regionAt's mask is
      // a fresh array of this call alone)
      const part = mask;
      for (let y = 0; y < H; y++) {
        const row = (y + bb.y0) * gg.W + bb.x0;
        for (let x = 0; x < W; x++) if (!local[y * W + x]) part[row + x] = 0;
      }
      mask = part;
    }
    // the region ENDS at a smaller size's proven end (its body in, the far side out): a larger
    // size closed on a smaller size's line (cirrus 30 and 32 on 28's tick) — unless r's own end
    // tick lies there too (two sizes of one length)
    for (const q of endTicks) {
      if (q.rank >= r || !inM(mask, q.inPt) || inM(mask, q.outPt) || !mine(mask, q)) continue;
      const own = endTicks.some(
        (t) => t.rank === r && t.strip === q.strip && dist(t.inPt, q.inPt) <= 1,
      );
      if (own) continue;
      if (ticksDebug) console.log(`TICKCUT r${r}: ends at c${q.chain} (r${q.rank})`);
      return null;
    }
    // the region runs past a larger size's end: it closed on another size's lines
    for (const t of endTicks)
      if (t.rank > r && inM(mask, t.inPt) && inM(mask, t.outPt) && mine(mask, t)) {
        if (ticksDebug) console.log(`TICKCUT r${r}: runs past c${t.chain} (r${t.rank})`);
        return null;
      }
    return mask;
  };

  /** Pass A walls of one rank: common + own + rescued + the operator's + lone stretches. */
  const baseItems = (r: number, excl: Set<ChainId>) => {
    const ownIds = model.mode === 'single' ? [] : model.byRank[r];
    return [
      ...(graded?.walls
        ? graded.walls(r)
        : [...itemsOf(set, [...model.common, ...ownIds, ...extraOf(r)]), ...rescuedItems(r)]),
      ...lone,
      ...opBridges(r).map((b) => ({ chain: -2, pts: [b.from, b.to] })),
      ...bandCuts(r).map((b) => ({ chain: -3, pts: [b.from, b.to] })),
      ...(graded?.walls ? [] : cornerItems(r)),
    ].filter((it) => !excl.has(it.chain));
  };

  // P3: a click carried to the other size files by its face, not by its coordinate
  const faced =
    model.mode === 'file' && !solved && !(typeof process !== 'undefined' && process.env?.P3_NOFACE)
      ? seedFaces(
          nRanks,
          use,
          (r) => buildRank(box, cell, baseItems(r, userExcl)),
          (c, p) => seedPixel(c.g, c.wall, c.ext, p).k,
          shift,
        )
      : null;
  if (faced?.diag.length) diag.faced = faced.diag;
  const carry = (s: Seed, r: number) => faced?.at.get(key(s.id, r)) ?? shift(s.at, r);

  /** One rank, every seed; returns the candidates and the frame chains found around merges. */
  const rankPass = (
    r: number,
    excl: Set<ChainId>,
    override?: Map<number, PtMm>,
    /** Seeds to bridge, with the least area the family's trend allows (0: none known). */
    bridgeFor?: Map<number, number>,
  ) => {
    // P1: continuity walls — a graded rank closed only through lines the source draws between its
    // own dangling ends (never on the solver's walls, never in the derived-bridge pass, whose
    // closures are judged by the area trend instead)
    const continuity =
      model.mode === 'graded' &&
      !graded?.walls &&
      !bridgeFor &&
      !model.emptyRanks.includes(r) &&
      !contOff();
    let contWalls: ContinuityWall[] = [];
    // knives stay walls where they are this rank's lines: the variant's cutting line is the
    // piece's edge (taken out, kombinezon's 4XL front leaked through it); the cut below still
    // trims any region that crosses one
    const keep = (it: WallItem) => !excl.has(it.chain);
    const base = buildRank(box, cell, baseItems(r, excl));
    const pts = use.map((s) => override?.get(s.id) ?? carry(s, r));
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
                  ...itemsOf(set, [...rr.model.common, ...rr.model.byRank[r], ...extraOf(r)]),
                  ...rescuedItems(r),
                  ...rr.lone,
                  ...cornerItems(r),
                ];
                const plugs = landingPlugs(set, rr.model, r, rr.lone);
                return buildRank(box, cell, [...items, ...plugs].filter(keep));
              },
            },
            ...(continuity
              ? [
                  {
                    from: 'continuity' as RankFrom,
                    build: () => {
                      const plugged = built[0] ?? (built[0] = later[0].build());
                      // the hard beside test runs against every effective wall of r: the lines
                      // reranked to r and the operator's are walls too
                      const reranked = itemsOf(set, rerank().model.byRank[r] ?? []);
                      contWalls = continuityWalls(set, model, r, plugged.items, contSkip(excl), {
                        beside: reranked,
                        overlay: overlayOf(),
                      });
                      const ov = contWalls.filter((w) => w.overlay).length;
                      if (ov) diag.overlayWalls = (diag.overlayWalls ?? 0) + ov;
                      return contWalls.length
                        ? buildRank(box, cell, [...plugged.items, ...contWalls])
                        : plugged;
                    },
                  },
                ]
              : []),
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
      if (dropped.has(seed.id) || graded?.skip.has(seed.id)) continue;
      if (opts.only && !opts.only.has(seed.id)) continue;
      let ctx = base;
      let rankFrom: RankFrom = model.mode === 'single' ? 'single' : 'class';
      let { k, movedMm } = px[si];
      for (let pi = 0; pi < later.length && ctx.ext[k]; pi++) {
        if (later[pi].from === 'bundleRank' && !rerank().model.byRank[r].length) continue;
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
        // MOOD TICKS: rank r's proven end ticks cut its region; r keeps its body side. A region of
        // r that still runs past an end tick (a gap the knife cannot part), or past a LARGER size's
        // proven end, is no outline of r — a leak
        if (endTicks.length) {
          const cut = cutAtTicks(gg, mask, r, pts[si], kk);
          if (!cut) return null;
          mask = cut;
        }
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
        if (lab && lj && lab === lj && r === 0 && rankFrom !== 'continuity') {
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
      const sn = snapOutline(
        raster,
        ctx.items.concat(
          knivesOf(r).filter((it) => !it.edge),
          tickItems(r),
        ),
        {
          stepMm: 1,
          reachMm: 2.5,
          snapMm: opts.snapMm || PATIMPORT.snapMm,
        },
      );
      const outer = untail(
        signedArea(sn.outer) < 0 ? sn.outer.slice().reverse() : sn.outer,
        seed.id,
        r,
        rankFrom,
      );
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
        ...[...bandCuts(r), ...tickCarried(r)]
          .filter(onOutline)
          .map((b) => ({ kind: 'band-cut' as const, pts: [b.from, b.to], chains: [...b.ticks] })),
      ];
      if (der.length) cand.derived = der;
      if (rankFrom === 'continuity') {
        // provenance: the continuity walls the outline runs along (≥ 90 % of them within 1 mm —
        // gate G21 re-checks that the written line follows each one)
        const used = contWalls.filter((w) => alongShare(w.pts, outer, 1) >= 0.9);
        cand.continuity = used.map((w) => ({
          rule: w.rule,
          chains: [...w.chains],
          pts: w.pts,
          ...(w.bracket ? { bracket: true } : {}),
          ...(w.overlay ? { overlay: true } : {}),
        }));
      }
      cand.areaMm2 = Math.abs(signedArea(outer));
      cand.bbox = bboxOf(outer);
      cand.sourceCoverage = sn.coverage;
      cand.p95Mm = sn.p95Mm;
      cand.outcome = merged
        ? 'merged'
        : cand.areaMm2 < PATIMPORT.minPieceAreaMm2
          ? 'tiny'
          : 'closed';
      if (merged && rankFrom !== 'continuity')
        // a region holding several pieces bounded by frame-like lines: tile frames / a border
        // synthetic walls (bridges, band cuts, MOOD Ф2 corners) carry negative ids: no chain
        for (const id of sn.walls)
          if (id >= 0 && !userExcl.has(id) && frameLike(set.chains[id].pts, 60, module))
            frames.add(id);
      // a label frame: the text seed sits in a small closed loop drawn around it (an oval round
      // "Piece 8 / cut x1 pair") — a decoration, not the piece; fill again without it
      if (
        rankFrom !== 'continuity' &&
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
        if (home === r || faced?.at.has(key(sid, r))) continue;
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
        const now = seedPixel(ctx.g, ctx.wall, ctx.ext, carry(s, r));
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
  /**
   * D3: per family, every candidate closed through continuity walls is checked against the
   * family's anchor ranks (`continuityVerdicts`). One that fails goes back to the leak it was: a
   * stop, never a wrong closed piece; one that stands carries its verdict.
   */
  const continuityPass = () => {
    for (const s of use) {
      const list = cands.get(s.id);
      if (!list?.some((c) => c.rankFrom === 'continuity')) continue;
      const { refused, kept } = continuityVerdicts(list);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.rankFrom !== 'continuity') continue;
        const why = refused.get(c.rank);
        diag.continuity ??= { kept: 0, refused: [] };
        if (!why) {
          diag.continuity.kept++;
          list[i] = { ...c, continuityVerdict: kept.get(c.rank) };
          continue;
        }
        diag.continuity.refused.push({
          seed: s.id,
          rank: c.rank,
          why,
          areaMm2: c.areaMm2,
          outer: c.outer,
          continuity: c.continuity,
        });
        list[i] = {
          seed: s.id,
          rank: c.rank,
          outer: [],
          walls: [],
          inside: [],
          textsInside: [],
          outcome: 'leak',
          areaMm2: 0,
          bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
          sourceCoverage: 0,
          p95Mm: 0,
          rankFrom: 'class',
          leakAt: shift(s.at, c.rank),
        };
        diag.cand.delete(key(s.id, c.rank));
      }
    }
  };
  for (let r = 0; r < nRanks && !(graded && graded.skip.size >= use.length); r++) {
    progress?.(r, nRanks, `rank ${r}`);
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
  // P1 · D3: a closure through continuity walls stands only when the family stays consistent
  continuityPass();
  if (model.mode === 'file') correspond(excl);
  // derived bridges are not the solver's lines: a graded fill closes on proven walls only
  if (opts.autoBridgeMm !== 0 && !graded?.walls) bridgePass(excl);
  // GRADE P2 (hook A): a size that leaks between two anchors — or closed on another size's line —
  // repaired from the grade on its own and common lines (E1–E4), before the leak mouths and before
  // the semantics block the family. Graded sheets on F4's own walls only (never the H1 solver's)
  if (model.mode === 'graded' && !graded?.walls && !solved && !gradeP2Off()) {
    const live = (ids: readonly ChainId[]) => itemsOf(set, ids).filter((it) => !excl.has(it.chain));
    diag.repair = repairPass(
      cands,
      {
        set,
        own: (r) => live(model.byRank[r] ?? []),
        // the lines every size closes on in pass A: the common class, the LONE stretches (a shared
        // edge drawn once, in one size's style) and the rescued 'ignore' edges (both ends on walls)
        common: [
          ...live([...model.common, ...rescued]),
          ...(typeof process !== 'undefined' && process.env?.GRADE_P2_NOLONE
            ? []
            : lone.filter((it) => !excl.has(it.chain))),
        ],
        wm: model,
        texts: textCentres,
      },
      new Set([...dropped, ...(graded?.skip ?? [])]),
    );
  }
  // leak mouths: per rank, walk from the seed until it leaves the piece as another rank closed it
  // (or, with no closed rank, the thickened-wall closure)
  for (let r = 0; r < nRanks; r++) {
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
  // a size the run lists but no line draws (viola's 34: every bundle has 7 lines for 8 sizes) is
  // NOT filled from its neighbour: it is not drawn on this sheet — the sizes step leaves it out of
  // the export (sizes/map markNotDrawn) and its candidates stay as the fill found them
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
  graded?.finish(cands);
  for (const part of graded?.sub ?? []) {
    // D4: the guarded seeds of a mixed sheet, filled again on the solver's walls; its proven ranks
    // (and its own refusals) replace the refusals `finish` gave them
    const ids = new Set(part.seeds);
    const sub = fillPiecesDetailed(
      sheet,
      set,
      run,
      use.filter((s) => ids.has(s.id)),
      opts,
      progress,
      edits,
      part.hook,
    );
    for (const f of sub.families) if (cands.has(f.seed)) cands.set(f.seed, f.candidates);
    (diag.subGrade ??= []).push(sub.diag);
  }
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
  if (graded) diag.grade = graded;
  diag.ms = Date.now() - t0;
  progress?.(nRanks, nRanks);
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

/**
 * A2: a piece drawn inside another (wm's collar inside the back) is a piece of its own — its outline
 * and the lines inside it are not the host's internal lines (they were written on the host's
 * layer 8 as a rectangle). Per size, a closed candidate lying wholly inside a larger closed one of
 * another family gives the host back none of its chains.
 */
export function exceptNested(families: PieceFamily[]): PieceFamily[] {
  const ranks = new Set(families.flatMap((f) => f.candidates.map((c) => c.rank)));
  let out = families;
  for (const r of ranks) {
    const cs = out.flatMap((f) =>
      f.candidates.filter((c) => c.rank === r && c.outcome === 'closed' && c.outer.length > 2),
    );
    if (cs.length < 2) continue;
    const drop = new Map<PieceCandidate, Set<ChainId>>();
    for (const h of cs)
      for (const n of cs) {
        if (n === h || n.seed === h.seed || n.areaMm2 >= h.areaMm2) continue;
        const b = n.bbox;
        if (
          b.minX < h.bbox.minX ||
          b.maxX > h.bbox.maxX ||
          b.minY < h.bbox.minY ||
          b.maxY > h.bbox.maxY
        )
          continue;
        const step = Math.max(1, Math.floor(n.outer.length / 16));
        let ok = true;
        for (let i = 0; i < n.outer.length && ok; i += step) ok = pointInPoly(n.outer[i], h.outer);
        if (!ok) continue;
        const set = drop.get(h) ?? new Set<ChainId>();
        for (const id of [...n.walls, ...n.inside]) set.add(id);
        drop.set(h, set);
      }
    if (!drop.size) continue;
    out = out.map((f) => ({
      ...f,
      candidates: f.candidates.map((c) => {
        const d = drop.get(c);
        return d ? { ...c, inside: c.inside.filter((id) => !d.has(id)) } : c;
      }),
    }));
  }
  return out;
}

export const fillPieces: FillPiecesFn = (sheet, set, run, seeds, opts, progress) =>
  fillPiecesDetailed(sheet, set, run, seeds, opts, progress).families;

export { dist };

// ── P1 · D3: is a continuity closure consistent with its family? ──────────────────────────────

/** Symmetric Hausdorff distance between two closed outlines (sampled every 2 mm), mm. */
export function hausdorffMm(a: readonly PtMm[], b: readonly PtMm[]): number {
  const directed = (p: readonly PtMm[], q: readonly PtMm[]) => {
    const g = new SegGrid(8);
    g.addPolyline(0, q, true);
    let worst = 0;
    for (const x of resample(p as PtMm[], 2, true)) {
      let best = Infinity;
      for (let r = 8; r <= 4096 && best === Infinity; r *= 4)
        g.near(x, r, (_o, s) => {
          const d = segNearest(x, q[s], q[(s + 1) % q.length]).d;
          if (d <= r && d < best) best = d;
        });
      if (best === Infinity) best = 4096;
      if (best > worst) worst = best;
    }
    return worst;
  };
  if (a.length < 3 || b.length < 3) return Infinity;
  return Math.max(directed(a, b), directed(b, a));
}

/** Hu's first four moment invariants of a simple polygon (exact polygon moments, centred). */
export function huInvariants(poly: readonly PtMm[]): number[] {
  const n = poly.length;
  let A = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const c = p.x * q.y - q.x * p.y;
    A += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  A /= 2;
  if (Math.abs(A) < 1e-9) return [0, 0, 0, 0];
  cx /= 6 * A;
  cy /= 6 * A;
  let m00 = 0;
  let m20 = 0;
  let m02 = 0;
  let m11 = 0;
  let m30 = 0;
  let m03 = 0;
  let m21 = 0;
  let m12 = 0;
  for (let i = 0; i < n; i++) {
    const x0 = poly[i].x - cx;
    const y0 = poly[i].y - cy;
    const x1 = poly[(i + 1) % n].x - cx;
    const y1 = poly[(i + 1) % n].y - cy;
    const a = x0 * y1 - x1 * y0;
    m00 += a / 2;
    m20 += (a * (x0 * x0 + x0 * x1 + x1 * x1)) / 12;
    m02 += (a * (y0 * y0 + y0 * y1 + y1 * y1)) / 12;
    m11 += (a * (2 * x0 * y0 + x0 * y1 + x1 * y0 + 2 * x1 * y1)) / 24;
    m30 += (a * (x0 ** 3 + x0 * x0 * x1 + x0 * x1 * x1 + x1 ** 3)) / 20;
    m03 += (a * (y0 ** 3 + y0 * y0 * y1 + y0 * y1 * y1 + y1 ** 3)) / 20;
    m21 += (a * (x0 * x0 * (3 * y0 + y1) + 2 * x0 * x1 * (y0 + y1) + x1 * x1 * (y0 + 3 * y1))) / 60;
    m12 += (a * (y0 * y0 * (3 * x0 + x1) + 2 * y0 * y1 * (x0 + x1) + y1 * y1 * (x0 + 3 * x1))) / 60;
  }
  const s = Math.sign(m00);
  const mu = Math.abs(m00);
  const e2 = (v: number) => (s * v) / mu ** 2;
  const e3 = (v: number) => (s * v) / mu ** 2.5;
  const n20 = e2(m20);
  const n02 = e2(m02);
  const n11 = e2(m11);
  const n30 = e3(m30);
  const n03 = e3(m03);
  const n21 = e3(m21);
  const n12 = e3(m12);
  return [
    n20 + n02,
    (n20 - n02) ** 2 + 4 * n11 * n11,
    (n30 - 3 * n12) ** 2 + (3 * n21 - n03) ** 2,
    (n30 + n12) ** 2 + (n21 + n03) ** 2,
  ];
}

/**
 * How unlike two outlines' shapes are: the Hu invariants compared on a log scale, each relative
 * to the size of the leading one (h2…h4 of a near-symmetric piece are tiny and noisy alone).
 */
export function huDistance(a: readonly PtMm[], b: readonly PtMm[]): number {
  const ha = huInvariants(a);
  const hb = huInvariants(b);
  if (ha[0] <= 0 || hb[0] <= 0) return Infinity;
  let d = Math.abs(Math.log(ha[0] / hb[0]));
  // the higher invariants in units of h1^k: a floor keeps noise on a symmetric piece from counting
  for (const [i, k] of [
    [1, 2],
    [2, 3],
    [3, 3],
  ] as const) {
    const f = 0.01 * ((ha[0] + hb[0]) / 2) ** k;
    d += 0.5 * Math.abs(Math.log((ha[i] + f) / (hb[i] + f)));
  }
  return d;
}

/**
 * D3 caps on the per-step spread a family's anchors may claim (a family whose anchors themselves
 * jump would otherwise license anything): Hausdorff mm and Hu distance per size step. Corpus native
 * neighbours (viola / leonie / synth): Hausdorff ≤ 24 mm per step (viola's widest grade), Hu ≤ 0.4.
 */
export const CONT_CAP = { hMm: 25, hu: 0.45 };
/** D3: the most two neighbouring ranks' compactness (perimeter / √area) may differ, |ln ratio|. */
export const CONT_K_MAX = 0.08;

function perimeterOf(o: readonly PtMm[]): number {
  let L = 0;
  for (let i = 0; i < o.length; i++) L += dist(o[i], o[(i + 1) % o.length]);
  return L;
}

/** An ANCHOR: a rank closed on its own class lines alone — no plug, no rerank, no derived edge. */
export const isAnchor = (c: PieceCandidate) =>
  c.outcome === 'closed' &&
  c.outer.length > 2 &&
  (c.rankFrom === 'class' || c.rankFrom === undefined) &&
  !c.derived?.length;

export type ContinuityJudgement = {
  refused: Map<number, string>;
  kept: Map<number, ContinuityVerdict>;
};

/**
 * P1 · D3: which continuity closures of a family stand. The family must have ≥ 2 ANCHOR ranks
 * (closed on their own lines only) whose neighbouring pairs grade cleanly (area growing, ≤ 25 % a
 * step); they give the family's growth band (ln area ratio per step, between their slowest and
 * fastest pair, with slack) and its LOCAL spread (the anchor pair around — else nearest to — the
 * rank: Hausdorff and Hu distance per step, ×1.5 and capped by `CONT_CAP`). Fewer anchors: no
 * continuity closure at all — the leak stays. A closure is then judged against its nearest anchors
 * (below and above): growth inside the band, outline within the local spread, the same shape, as
 * compact (`CONT_K_MAX`: a closure into teeth or slivers grows its perimeter, not its area); a
 * closure through an ignore / unclassified path needs anchors on BOTH sides. Then the survivors
 * together, the worst violator refused first. Kept closures carry their verdict and metrics.
 */
export function continuityVerdicts(
  list: readonly PieceCandidate[],
  /** GRADE P2: the anchors the judgement stands on (default: closed on their own lines alone) */
  anchorOf: (c: PieceCandidate) => boolean = isAnchor,
): ContinuityJudgement {
  const refused = new Map<number, string>();
  const kept = new Map<number, ContinuityVerdict>();
  const conts = list.filter((c) => c.rankFrom === 'continuity');
  for (const c of conts)
    if (c.outcome !== 'closed' || c.outer.length < 3)
      refused.set(c.rank, `not closed (${c.outcome})`);
    else if (!c.continuity?.length)
      refused.set(c.rank, 'the outline runs along none of its continuity walls');
  const hd = new Map<string, number>();
  const H = (a: PieceCandidate, b: PieceCandidate) => {
    const k = a.rank < b.rank ? `${a.rank}:${b.rank}` : `${b.rank}:${a.rank}`;
    let v = hd.get(k);
    if (v === undefined) hd.set(k, (v = hausdorffMm(a.outer, b.outer)));
    return v;
  };
  const kOf = (c: PieceCandidate) => perimeterOf(c.outer) / Math.sqrt(Math.max(1, c.areaMm2));
  const anchors = list.filter(anchorOf).sort((a, b) => a.rank - b.rank);
  type Pair = { lo: number; hi: number; h: number; hu: number; g: number };
  const pairs: Pair[] = [];
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1];
    const b = anchors[i];
    const st = b.rank - a.rank;
    const ratio = b.areaMm2 / Math.max(1, a.areaMm2);
    if (ratio <= 1.0005 || ratio > 1 + 0.25 * st) continue;
    pairs.push({
      lo: a.rank,
      hi: b.rank,
      h: H(a, b) / st,
      hu: huDistance(a.outer, b.outer) / st,
      g: Math.log(ratio) / st,
    });
  }
  const clean = new Set(pairs.flatMap((p) => [p.lo, p.hi]));
  // MOOD Ф3.2 · Ф5: ONE outline in every size that closes on its own lines (a cuff, a strap drawn by
  // every size in one place) — no growth to anchor on. A closure walked along the overlay of those
  // sizes' pens is kept when it IS that outline: within 1 mm (Hausdorff) and 0.1 % in area of ≥ 2
  // anchors, every stretch of it on the overlay. Anything else is judged as before (and refused).
  const flat =
    anchors.length >= 2 &&
    anchors.every((x) => Math.abs(x.areaMm2 - anchors[0].areaMm2) <= 5e-4 * anchors[0].areaMm2);
  if (clean.size < 2 && flat) {
    const r3f = (v: number) => Math.round(v * 1000) / 1000;
    const kOfF = (c: PieceCandidate) => perimeterOf(c.outer) / Math.sqrt(Math.max(1, c.areaMm2));
    for (const c of conts) {
      if (refused.has(c.rank)) continue;
      if (!c.continuity?.every((e) => e.overlay)) {
        refused.set(
          c.rank,
          'the sizes that close on their own lines are one outline: only a closure along the overlay of their pens can be that outline',
        );
        continue;
      }
      const checks: ContinuityVerdict['checks'] = [];
      let why: string | null = null;
      for (const n of anchors) {
        const h = hausdorffMm(c.outer, n.outer);
        const hu = huDistance(c.outer, n.outer);
        const g =
          Math.log(c.areaMm2 / Math.max(1, n.areaMm2)) / Math.max(1, Math.abs(c.rank - n.rank));
        const dk = Math.abs(Math.log(kOfF(c) / kOfF(n)));
        if (h > 1 || Math.abs(g) > 1e-3 || hu > 0.05 || dk > CONT_K_MAX) {
          why = `not the one outline of rank ${n.rank}: ${h.toFixed(1)} mm off, ${(100 * (Math.exp(g) - 1)).toFixed(2)} % in area`;
          break;
        }
        checks.push({
          vs: n.rank,
          steps: Math.abs(c.rank - n.rank),
          hMm: r3f(h),
          hAllowMm: 1,
          hu: r3f(hu),
          huAllow: 0.05,
          growth: r3f(g),
          band: [-0.001, 0.001],
          dk: r3f(dk),
          kMax: CONT_K_MAX,
        });
      }
      if (why) refused.set(c.rank, why);
      else kept.set(c.rank, { anchors: anchors.map((x) => x.rank), checks });
    }
    return { refused, kept };
  }
  if (clean.size < 2) {
    for (const c of conts)
      if (!refused.has(c.rank))
        refused.set(
          c.rank,
          `fewer than 2 ranks of this piece close cleanly on their own lines (${clean.size}) — nothing anchors a continuity closure`,
        );
    return { refused, kept };
  }
  const gs = pairs.map((p) => p.g);
  const band: [number, number] = [0.5 * Math.min(...gs), 1.5 * Math.max(...gs) + 0.003];
  /** the anchor pair around rank r, else the nearest */
  const localOf = (r: number) =>
    pairs.find((p) => p.lo <= r && r <= p.hi) ??
    [...pairs].sort(
      (a, b) =>
        Math.min(Math.abs(a.lo - r), Math.abs(a.hi - r)) -
        Math.min(Math.abs(b.lo - r), Math.abs(b.hi - r)),
    )[0];
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  /** how badly c fails against neighbour n (> 1 fails), why, and the measured check */
  const judge = (
    c: PieceCandidate,
    n: PieceCandidate,
  ): [number, string, ContinuityVerdict['checks'][number]] => {
    const steps = Math.abs(c.rank - n.rank);
    const [lo, hi] = n.rank < c.rank ? [n, c] : [c, n];
    const ratio = hi.areaMm2 / Math.max(1, lo.areaMm2);
    const g = ratio > 0 ? Math.log(ratio) / steps : -Infinity;
    const loc = localOf(c.rank);
    const hAllow = Math.min(CONT_CAP.hMm, 1.5 * loc.h + 1) * steps + 2;
    const huAllow = Math.min(CONT_CAP.hu, 1.5 * loc.hu + 0.05) * steps + 0.1;
    const h = H(c, n);
    const hu = huDistance(c.outer, n.outer);
    const dk = Math.abs(Math.log(kOf(c) / kOf(n)));
    let score = 0;
    let why = '';
    const fail = (v: number, w: string) => {
      if (v > score) {
        score = v;
        why = w;
      }
    };
    const a = (x: PieceCandidate) => `rank ${x.rank} ${(x.areaMm2 / 100).toFixed(0)} cm²`;
    if (g < band[0] || g > band[1])
      fail(
        2 + 100 * Math.max(band[0] - g, g - band[1]),
        `growth ${a(lo)} → ${a(hi)} is ${(Math.exp(g) * 100 - 100).toFixed(1)} % a size, the anchors grow ${(Math.exp(band[0]) * 100 - 100).toFixed(1)}–${(Math.exp(band[1]) * 100 - 100).toFixed(1)} %`,
      );
    if (h > hAllow)
      fail(
        h / hAllow,
        `outline ${h.toFixed(1)} mm from rank ${n.rank} (spread ${hAllow.toFixed(1)} mm)`,
      );
    if (hu > huAllow)
      fail(
        hu / huAllow,
        `shape unlike rank ${n.rank} (Hu ${hu.toFixed(3)} > ${huAllow.toFixed(3)})`,
      );
    if (dk > CONT_K_MAX)
      fail(
        dk / CONT_K_MAX,
        `perimeter / √area ${dk.toFixed(3)} off rank ${n.rank} (teeth or slivers)`,
      );
    return [
      score,
      why,
      {
        vs: n.rank,
        steps,
        hMm: r3(h),
        hAllowMm: r3(hAllow),
        hu: r3(hu),
        huAllow: r3(huAllow),
        growth: r3(g),
        band: [r3(band[0]), r3(band[1])],
        dk: r3(dk),
        kMax: CONT_K_MAX,
      },
    ];
  };
  const nearest = (c: PieceCandidate, pool: PieceCandidate[]) => {
    const below = pool.filter((x) => x.rank < c.rank).pop();
    const above = pool.find((x) => x.rank > c.rank);
    return [below, above].filter(Boolean) as PieceCandidate[];
  };
  const anchorPool = anchors.filter((x) => clean.has(x.rank));
  // 1) against the anchors; an ignore / unclassified path needs them on both sides
  for (const c of conts) {
    if (refused.has(c.rank)) continue;
    const nb = nearest(c, anchorPool);
    if (c.continuity?.some((e) => e.bracket) && nb.length < 2) {
      refused.set(
        c.rank,
        'closed through an unclassified / ignore line without anchor ranks on both sides',
      );
      continue;
    }
    for (const n of nb) {
      const [score, why] = judge(c, n);
      if (score > 1) {
        refused.set(c.rank, why);
        break;
      }
    }
  }
  // 2) the survivors together, worst first
  const ok = (x: PieceCandidate) =>
    !refused.has(x.rank) && (clean.has(x.rank) ? anchorOf(x) : x.rankFrom === 'continuity');
  for (let round = 0; round <= conts.length; round++) {
    const live = list
      .filter((x) => x.outcome === 'closed' && ok(x))
      .sort((a, b) => a.rank - b.rank);
    let worst: { rank: number; score: number; why: string } | null = null;
    for (const c of live) {
      if (c.rankFrom !== 'continuity') continue;
      let score = 0;
      let why = '';
      for (const n of nearest(
        c,
        live.filter((x) => x !== c),
      )) {
        const [s2, w2] = judge(c, n);
        if (s2 > score) [score, why] = [s2, w2];
      }
      if (score > 1 && (!worst || score > worst.score)) worst = { rank: c.rank, score, why };
    }
    if (!worst) break;
    refused.set(worst.rank, worst.why);
  }
  for (const c of conts) {
    if (refused.has(c.rank)) continue;
    kept.set(c.rank, {
      anchors: anchorPool.map((x) => x.rank),
      checks: nearest(c, anchorPool).map((n) => judge(c, n)[2]),
    });
  }
  return { refused, kept };
}
