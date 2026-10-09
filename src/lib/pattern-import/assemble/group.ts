// assemble (F2) — one tile group (the tiles of ONE sheet in ONE file, in reading order) → poses.
//
//   1. recurrence links over all pages (exact where tiles are windows onto the drawing);
//   2. the sheet pitch (right and below neighbour offsets): from recurrence, else from edge votes
//      over ALL stroke vertices — page furniture (frame ticks, corner targets) agrees on it
//      between any two pages;
//   3. the layout (row, col of every page): printed cell labels when every page has one, else
//      the line segmentation that maximises CONTENT seam votes at that pitch (layout.ts);
//   4. one measured pair per layout seam (recurrence where present, else edge stitch measured on
//      all vertices at the pitch), plus every other recurrence link;
//   5. the global least-squares solve with loop-closure rejection (solve.ts);
//   6. checks: each page's deviation from the ideal lattice.
// Pages turned a quarter relative to the group are registered by recurrence with rotDeg 90/270.

import type { IRPage, PagePose, PairTransform } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { cellLabelOf } from './labels';
import { bestLayout, type Flow, type Layout, type Order } from './layout';
import { median, recurrenceLinks, type RawLink } from './recurrence';
import { buildRegPage, furnitureOf, pageKey, type RegPage, type Rot } from './regpage';
import { solvePosesDetailed } from './solve';
import {
  DEFAULT_STITCH,
  TRACED_STITCH,
  accepted,
  refine,
  stitchFree,
  type Rel,
  type StitchOpts,
} from './stitch';

export type Vec = { dx: number; dy: number };
export type Pitch = {
  right: Vec;
  below: Vec;
  from: 'recurrence' | 'edge-votes' | 'raster-frame' | 'page-size';
};

export type GroupResult = {
  file: string;
  pages: number[];
  poses: PagePose[];
  pairs: PairTransform[];
  residuals: number[];
  rejected: { pair: PairTransform; residualMm: number }[];
  pitch: Pitch;
  /** Pitch re-fitted to the solved poses (null with < 3 geometric pages). */
  fitted: { right: Vec; below: Vec } | null;
  layout: Layout;
  layoutFrom: 'labels' | 'recurrence' | 'votes' | 'manual';
  /** Max |pose − ideal lattice position|, mm, over pages placed by geometry. */
  latticeMaxMm: number;
  /** Most vertices beyond the page edge (windows onto the drawing: Burda, kombinezon, blazer). */
  windowed: boolean;
  /** Pages placed by the grid alone (no geometric seam evidence). */
  unverified: number[];
  warnings: string[];
  ms: number;
};

export type GroupOpts = {
  /** Content votes a layout seam needs to count as geometric evidence. */
  minSeamVotes: number;
};

export const DEFAULT_GROUP_OPTS: GroupOpts = { minSeamVotes: 3 };

const toPair = (l: RawLink, rotA: Rot, rotB: Rot): PairTransform => ({
  from: { file: l.a.file, page: l.a.page },
  to: { file: l.b.file, page: l.b.page },
  dxMm: l.dx,
  dyMm: l.dy,
  rotDeg: ((((rotB - rotA) % 360) + 360) % 360) as PairTransform['rotDeg'],
  method: l.method,
  score: l.n,
  secondBestRatio: l.n ? l.n2 / l.n : 0,
});

type Cand = { dx: number; dy: number; w: number; n: number };

/** Clusters of measured neighbour offsets along one axis, sign-normalised, heaviest first. */
function clustersOf(vs: { v: Vec; w: number }[], axis: 'x' | 'y'): Cand[] {
  const groups: Cand[] = [];
  for (const { v, w } of vs) {
    const s = axis === 'x' ? Math.sign(v.dx) || 1 : -(Math.sign(v.dy) || 1);
    const d = { dx: v.dx * s, dy: v.dy * s };
    const g = groups.find((q) => Math.abs(q.dx - d.dx) < 0.3 && Math.abs(q.dy - d.dy) < 0.3);
    if (g) {
      g.dx = (g.dx * g.w + d.dx * w) / (g.w + w);
      g.dy = (g.dy * g.w + d.dy * w) / (g.w + w);
      g.w += w;
      g.n++;
    } else groups.push({ ...d, w, n: 1 });
  }
  return groups.sort((a, b) => b.w - a.w);
}

/** ONE step: the smallest magnitude among the clusters with real support (multiples follow). */
function stepOf(groups: Cand[], axis: 'x' | 'y', minShare = 0.2): Cand[] {
  if (!groups.length) return [];
  const maxW = groups[0].w;
  const strong = groups.filter((g) => g.w >= minShare * maxW);
  const mag = (g: Cand) => (axis === 'x' ? Math.abs(g.dx) : Math.abs(g.dy));
  // Multiples of a smaller strong step (340 = 2 × 170) are the same answer; anything else that is
  // strong competes (blazer: 280 vs a logo pair at 271.3 with equal weight).
  const out: Cand[] = [];
  for (const g of [...strong].sort((a, b) => mag(a) - mag(b))) {
    const isMultiple = out.some((o) => {
      const k = Math.round(mag(g) / mag(o));
      return k >= 2 && Math.abs(g.dx - k * o.dx) < 1 && Math.abs(g.dy - k * o.dy) < 1;
    });
    if (!isMultiple) out.push(g);
  }
  return out;
}

export function estimatePitch(
  regs: RegPage[],
  recs: RawLink[],
  st: StitchOpts = DEFAULT_STITCH,
  supportTolMm = 0.05,
): Pitch {
  const W = median(regs.map((r) => r.rect.maxX - r.rect.minX));
  const H = median(regs.map((r) => r.rect.maxY - r.rect.minY));
  const n = regs.length;
  const sample: [number, number][] = [];
  for (let i = 0; i < Math.min(6, n - 1); i++)
    for (let k = 1; k <= Math.min(12, n - 1 - i); k++) sample.push([i, i + k]);
  const support = (c: Vec) =>
    sample.reduce((s, [i, j]) => s + refine(regs[i], regs[j], c, supportTolMm, 'all').n, 0);
  const edge = (rel: Rel): Cand[] => {
    const vs: { v: Vec; w: number }[] = [];
    for (const [i, j] of sample) {
      const l = stitchFree(regs[i], regs[j], rel, st, 'all');
      if (accepted(l, st)) vs.push({ v: l, w: l.n });
    }
    return stepOf(clustersOf(vs, rel === 'right' ? 'x' : 'y'), rel === 'right' ? 'x' : 'y');
  };
  /**
   * Recurrence candidates first; when they are missing, or two different steps compete with
   * comparable weight (an identical motif paired across different instances), edge votes add a
   * candidate and the one that most vertex pairs agree with wins.
   */
  const choose = (recC: Cand[], rel: Rel): { v: Vec | null; from: Pitch['from'] } => {
    if (recC.length === 1) return { v: recC[0], from: 'recurrence' };
    const all = [...recC, ...edge(rel)];
    if (!all.length) return { v: null, from: 'page-size' };
    if (all.length === 1) return { v: all[0], from: recC.length ? 'recurrence' : 'edge-votes' };
    let best = all[0];
    let bs = -1;
    for (const c of all) {
      const sc = support(c);
      if (sc > bs) [best, bs] = [c, sc];
    }
    return { v: best, from: recC.includes(best) ? 'recurrence' : 'edge-votes' };
  };
  const horiz: { v: Vec; w: number }[] = [];
  for (const l of recs) {
    if (l.a.rot !== l.b.rot) continue;
    if (Math.abs(l.dy) < 3 && Math.abs(l.dx) > 0.4 * W) horiz.push({ v: l, w: l.n });
  }
  const R = choose(stepOf(clustersOf(horiz, 'x'), 'x', 0.5), 'right');
  const vert: { v: Vec; w: number }[] = [];
  for (const l of recs) {
    if (l.a.rot !== l.b.rot) continue;
    // Diagonal links count for the vertical step once the horizontal one is taken out
    // (blazer's only row-to-row links are p10→p15 = (190, −280) and its multiples).
    const k = R.v ? Math.round(l.dx / R.v.dx) : 0;
    const v = R.v ? { dx: l.dx - k * R.v.dx, dy: l.dy - k * R.v.dy } : l;
    if (Math.abs(v.dx) < 3 && Math.abs(v.dy) > 0.4 * H) vert.push({ v, w: l.n });
  }
  const B = choose(stepOf(clustersOf(vert, 'y'), 'y', 0.5), 'below');
  const from: Pitch['from'] =
    !R.v || !B.v
      ? 'page-size'
      : R.from === 'recurrence' && B.from === 'recurrence'
        ? 'recurrence'
        : 'edge-votes';
  return {
    right: R.v ? { dx: R.v.dx, dy: R.v.dy } : { dx: W, dy: 0 },
    below: B.v ? { dx: B.v.dx, dy: B.v.dy } : { dx: 0, dy: -H },
    from,
  };
}

const ROTS: Rot[] = [90, 270];

export function assembleGroup(
  pages: IRPage[],
  opts: GroupOpts = DEFAULT_GROUP_OPTS,
  forceOrder?: Order,
): GroupResult {
  const t0 = Date.now();
  const warnings: string[] = [];
  const file = pages[0]?.file ?? '0';
  // 1. Orientation: the majority is the group's frame; the rest are tried a quarter turn.
  const portrait = (p: IRPage) => p.heightMm >= p.widthMm;
  const nPortrait = pages.filter(portrait).length;
  const majorityPortrait = nPortrait * 2 >= pages.length;
  const main = pages.filter((p) => portrait(p) === majorityPortrait);
  const turned = pages.filter((p) => portrait(p) !== majorityPortrait);
  const furniture = furnitureOf(main);
  const regs = main.map((p, i) => buildRegPage(p, i, 0, furniture));
  const turnedRegs = turned.flatMap((p) =>
    ROTS.map((r) => buildRegPage(p, main.length + turned.indexOf(p), r)),
  );
  // 2. Recurrence.
  const recAll = recurrenceLinks([...regs, ...turnedRegs]);
  // A turned page keeps the quarter turn with the most recurrence votes.
  const turnChoice = new Map<string, Rot>();
  for (const p of turned) {
    let best: Rot | null = null;
    let bestN = 0;
    for (const r of ROTS) {
      const n = recAll
        .filter(
          (l) =>
            (l.a.key === pageKey(p.file, p.page) && l.a.rot === r) ||
            (l.b.key === pageKey(p.file, p.page) && l.b.rot === r),
        )
        .reduce((s, l) => s + l.n, 0);
      if (n > bestN) [best, bestN] = [r, n];
    }
    if (best !== null) turnChoice.set(pageKey(p.file, p.page), best);
    else
      warnings.push(
        `page ${p.page + 1}: orientation differs from its sheet and no recurrence placed it — ` +
          `left out (place it with a grid override)`,
      );
  }
  const keepTurned = (r: RegPage) => r.rot === 0 || turnChoice.get(r.key) === r.rot;
  // 3. Pitch, then drop recurrence links that are not a lattice step: an identical shape printed
  // at two different places (blazer's TACHYS logo on every piece) pairs DIFFERENT instances.
  // Pages traced from a raster (F11) carry resampled vertices: a seam agrees to ~0.3 mm, not 0.01.
  const traced = pages.some((p) => !!p.calibration);
  const st = traced ? TRACED_STITCH : DEFAULT_STITCH;
  const fineTol = traced ? 0.3 : 0.05;
  // Traced pages: the images abut, so the pitch is image edge to image edge (the commonest left /
  // right / top / bottom edges: the first and last tile of a row are cut on their outer side).
  const pitch: Pitch = traced
    ? {
        right: {
          dx: median(regs.map((r) => r.rect.maxX)) - median(regs.map((r) => r.rect.minX)),
          dy: 0,
        },
        below: {
          dx: 0,
          dy: median(regs.map((r) => r.rect.minY)) - median(regs.map((r) => r.rect.maxY)),
        },
        from: 'raster-frame',
      }
    : estimatePitch(
        regs,
        recAll.filter((l) => keepTurned(l.a) && keepTurned(l.b)),
        st,
        fineTol,
      );
  if (pitch.from === 'page-size')
    warnings.push('no seam evidence for the tile pitch — assumed page size (check the seams)');
  const onLattice = (l: RawLink) => {
    if (l.a.rot !== 0 || l.b.rot !== 0) return true;
    const det = pitch.right.dx * pitch.below.dy - pitch.right.dy * pitch.below.dx;
    if (!det) return true;
    const i = Math.round((l.dx * pitch.below.dy - l.dy * pitch.below.dx) / det);
    const j = Math.round((pitch.right.dx * l.dy - pitch.right.dy * l.dx) / det);
    const ex = i * pitch.right.dx + j * pitch.below.dx;
    const ey = i * pitch.right.dy + j * pitch.below.dy;
    return Math.hypot(l.dx - ex, l.dy - ey) <= 1.0;
  };
  const rec: RawLink[] = [];
  let offLattice = 0;
  for (const l of recAll) {
    if (!keepTurned(l.a) || !keepTurned(l.b)) continue;
    if (pitch.from === 'recurrence' && !onLattice(l)) offLattice++;
    else rec.push(l);
  }
  if (offLattice)
    warnings.push(`${offLattice} recurrence link(s) off the tile lattice ignored (repeated motif)`);
  const expect = (rel: Rel) =>
    rel === 'right' ? pitch.right : { dx: pitch.below.dx, dy: pitch.below.dy };
  const recBetween = new Map<string, RawLink>();
  for (const l of rec) recBetween.set(`${l.a.key}|${l.b.key}`, l);
  // Content votes at the pitch. 0.3 mm (the seam snap) because a drawing can sit a little off its
  // own printed grid (wm: drawing 274.15 vs grid 274.32 per row).
  // Windowed tiles (most vertices beyond the page edge: Burda, kombinezon, blazer) agree far past
  // the seam, so the vote region widens — and tightens to 0.05 mm, where only true duplicates hit.
  const outShare = (p: IRPage) => {
    let o = 0;
    let t = 0;
    for (const q of p.paths)
      for (const v of q.pts) {
        t++;
        if (v.x < -1 || v.y < -1 || v.x > p.widthMm + 1 || v.y > p.heightMm + 1) o++;
      }
    return t ? o / t : 0;
  };
  const windowed = median(main.map(outShare)) > 0.3;
  const voteMargin = windowed ? 40 : 2;
  const voteTol = traced ? 0.6 : windowed ? 0.05 : PATIMPORT.snapMm;
  const contentMemo = new Map<string, number>();
  const contentVotes = (i: number, j: number, rel: Rel) => {
    const k = `${i}|${j}|${rel}`;
    const m = contentMemo.get(k);
    if (m !== undefined) return m;
    const v = refine(regs[i], regs[j], expect(rel), voteTol, 'content', voteMargin).n;
    contentMemo.set(k, v);
    return v;
  };
  const recAgrees = (i: number, j: number, rel: Rel) => {
    const l = recBetween.get(`${regs[i].key}|${regs[j].key}`);
    const e = expect(rel);
    if (l) return Math.abs(l.dx - e.dx) < 1 && Math.abs(l.dy - e.dy) < 1;
    const r = recBetween.get(`${regs[j].key}|${regs[i].key}`);
    return !!r && Math.abs(-r.dx - e.dx) < 1 && Math.abs(-r.dy - e.dy) < 1;
  };
  const score = (i: number, j: number, rel: Rel | 'above'): number => {
    if (rel === 'above') return score(j, i, 'below');
    return contentVotes(i, j, rel) + (recAgrees(i, j, rel) ? 1000 : 0);
  };
  // 4. Layout.
  const labels = regs.map((r) => cellLabelOf(r.src));
  const labelled = labels.filter(Boolean).length;
  const uniq = new Set(labels.filter(Boolean).map((c) => `${c?.row},${c?.col}`)).size;
  let layout: Layout;
  let layoutFrom: GroupResult['layoutFrom'];
  const turnedCells = new Map<string, { row: number; col: number }>();
  const turnedChosen = turnedRegs.filter((r) => turnChoice.get(r.key) === r.rot);
  const fromRec =
    pitch.from === 'recurrence' ? layoutFromRecurrence(regs, turnedChosen, rec, pitch) : null;
  if (regs.length && labelled === regs.length && uniq === regs.length) {
    const cells = labels.map((c) => ({ row: c?.row ?? 0, col: c?.col ?? 0 }));
    layout = { order: 'row-major', flow: 'down', lines: [], cells, score: 0 };
    layoutFrom = 'labels';
  } else if (fromRec) {
    // Windowed tiles: the recurrence poses ARE the layout (a gap or a turned page in the reading
    // order cannot shift it); pages without recurrence fill the empty cells in reading order.
    layout = fromRec.layout;
    layoutFrom = 'recurrence';
    for (const [k, c] of fromRec.turned) turnedCells.set(k, c);
    if (fromRec.note) warnings.push(fromRec.note);
  } else {
    if (labelled)
      warnings.push(`cell labels on ${labelled}/${regs.length} pages only — layout from seams`);
    const cands: Layout[] = [];
    const orders: Order[] = forceOrder ? [forceOrder] : ['row-major', 'col-major'];
    for (const o of orders)
      for (const fl of (o === 'row-major' ? ['down', 'up'] : ['right']) as Flow[])
        cands.push(bestLayout(regs.length, o, score, fl));
    layout = cands.sort((a, b) => b.score - a.score)[0];
    layoutFrom = 'votes';
  }
  // 5. Pairs: recurrence links + one measured pair per layout seam without one.
  const pairs: PairTransform[] = rec.map((l) => toPair(l, l.a.rot, l.b.rot));
  const cellIdx = new Map<string, number>();
  layout.cells.forEach((c, i) => cellIdx.set(`${c.row},${c.col}`, i));
  const hasPair = (i: number, j: number) =>
    recBetween.has(`${regs[i].key}|${regs[j].key}`) ||
    recBetween.has(`${regs[j].key}|${regs[i].key}`);
  const evidence = new Set<number>();
  for (const l of rec) {
    if (l.a.rot === 0) evidence.add(l.a.idx);
    if (l.b.rot === 0) evidence.add(l.b.idx);
  }
  const weakSeams: string[] = [];
  layout.cells.forEach((c, i) => {
    for (const rel of ['right', 'below'] as Rel[]) {
      const j = cellIdx.get(rel === 'right' ? `${c.row},${c.col + 1}` : `${c.row + 1},${c.col}`);
      if (j === undefined || hasPair(i, j)) continue;
      const e = expect(rel);
      const cv = contentVotes(i, j, rel);
      // Drawing across the seam measures it; failing that, the printed marks (all vertices).
      let m = { n: 0, dx: e.dx, dy: e.dy, spread: 0 };
      let geometric = false;
      if (cv >= opts.minSeamVotes) {
        const c1 = refine(regs[i], regs[j], e, voteTol, 'content', voteMargin);
        const c2 = refine(regs[i], regs[j], c1, fineTol, 'content', voteMargin);
        m = c2.n >= opts.minSeamVotes ? c2 : c1;
        geometric = true;
      } else {
        const a1 = refine(regs[i], regs[j], e, PATIMPORT.snapMm, 'all');
        const a2 = a1.n ? refine(regs[i], regs[j], a1, fineTol, 'all') : a1;
        if (a2.n >= 4) m = a2;
      }
      if (!geometric) weakSeams.push(`${regs[i].page + 1}→${regs[j].page + 1}`);
      pairs.push({
        from: { file: regs[i].file, page: regs[i].page },
        to: { file: regs[j].file, page: regs[j].page },
        dxMm: m.n ? m.dx : e.dx,
        dyMm: m.n ? m.dy : e.dy,
        rotDeg: 0,
        method: geometric ? 'edge-stitch' : 'grid-label',
        score: cv,
        secondBestRatio: 0,
      });
      if (geometric) {
        evidence.add(i);
        evidence.add(j);
      }
    }
  });
  if (weakSeams.length)
    warnings.push(
      `${weakSeams.length} seam(s) with no drawing across them, placed by ` +
        (layoutFrom === 'labels' ? 'the printed cell labels' : 'the tile grid') +
        ': ' +
        weakSeams.slice(0, 12).join(', ') +
        (weakSeams.length > 12 ? ', …' : ''),
    );
  // A page with no pair at all (an island cell) gets a grid prior to page 0.
  const touched = new Set<number>();
  const idxOfPage = new Map(regs.map((r) => [r.page, r.idx]));
  for (const p of pairs)
    for (const e of [p.from, p.to]) {
      const i = idxOfPage.get(e.page);
      if (i !== undefined) touched.add(i);
    }
  const c0 = layout.cells[0];
  const lattice = (i: number) => {
    const c = layout.cells[i];
    return {
      dx: (c.col - c0.col) * pitch.right.dx + (c.row - c0.row) * pitch.below.dx,
      dy: (c.col - c0.col) * pitch.right.dy + (c.row - c0.row) * pitch.below.dy,
    };
  };
  for (let i = 1; i < regs.length; i++)
    if (!touched.has(i)) {
      const e = lattice(i);
      pairs.push({
        from: { file: regs[0].file, page: regs[0].page },
        to: { file: regs[i].file, page: regs[i].page },
        dxMm: e.dx,
        dyMm: e.dy,
        rotDeg: 0,
        method: 'grid-label',
        score: 0,
        secondBestRatio: 0,
      });
    }
  // 6. Solve.
  const solved = solvePosesDetailed(
    pairs,
    new Map(),
    pages.map((p) => ({ file: p.file, page: p.page, widthMm: p.widthMm, heightMm: p.heightMm })),
  );
  warnings.push(...solved.warnings);
  const poseOf = new Map(solved.poses.map((p) => [pageKey(p.file, p.page), p]));
  regs.forEach((r, i) => {
    const pose = poseOf.get(r.key);
    if (!pose) return;
    pose.row = layout.cells[i].row;
    pose.col = layout.cells[i].col;
  });
  for (const [k, c] of turnedCells) {
    const pose = poseOf.get(k);
    if (pose) {
      pose.row = c.row;
      pose.col = c.col;
    }
  }
  // 7. Lattice regularity: fit t = t0 + col·R + row·B to the pages placed by geometry and report
  // each one's deviation (a seam measured on the wrong feature shows up here even when the pair
  // graph has no cycle through it).
  const geo = regs.filter((r) => evidence.has(r.idx));
  const fit = fitLattice(
    geo.map((r) => ({
      row: layout.cells[r.idx].row,
      col: layout.cells[r.idx].col,
      x: poseOf.get(r.key)?.toSheet.e ?? 0,
      y: poseOf.get(r.key)?.toSheet.f ?? 0,
    })),
  );
  let latticeMax = 0;
  for (const r of geo) {
    const pose = poseOf.get(r.key);
    if (!pose || !fit) continue;
    const c = layout.cells[r.idx];
    const dev = Math.hypot(
      pose.toSheet.e - (fit.x0 + c.col * fit.rx + c.row * fit.bx),
      pose.toSheet.f - (fit.y0 + c.col * fit.ry + c.row * fit.by),
    );
    latticeMax = Math.max(latticeMax, dev);
    if (dev > PATIMPORT.registrationMaxResidualMm)
      warnings.push(`page ${r.page + 1} is ${dev.toFixed(2)} mm off the fitted tile grid`);
  }
  const unverified = regs
    .filter((r) => !evidence.has(r.idx))
    .map((r) => r.page)
    .filter(() => layoutFrom !== 'labels');
  if (unverified.length)
    warnings.push(
      `pages placed by the tile grid alone (nothing drawn across their seams): ${unverified
        .map((p) => p + 1)
        .join(', ')}`,
    );
  const included = new Set([...regs.map((r) => r.key), ...turnChoice.keys()]);
  return {
    file,
    pages: pages.map((p) => p.page).filter((p) => included.has(pageKey(file, p))),
    poses: solved.poses.filter((p) => included.has(pageKey(p.file, p.page))),
    pairs: solved.kept,
    residuals: solved.residuals,
    rejected: solved.rejected,
    pitch,
    fitted: fit ? { right: { dx: fit.rx, dy: fit.ry }, below: { dx: fit.bx, dy: fit.by } } : null,
    layout,
    layoutFrom,
    latticeMaxMm: latticeMax,
    windowed,
    unverified,
    warnings,
    ms: Date.now() - t0,
  };
}

/** Least squares t = t0 + col·R + row·B (6 unknowns, two independent 3×3 systems). */
export function fitLattice(
  pts: { row: number; col: number; x: number; y: number }[],
): { x0: number; y0: number; rx: number; ry: number; bx: number; by: number } | null {
  if (pts.length < 3) return null;
  const cols = new Set(pts.map((p) => p.col)).size;
  const rows = new Set(pts.map((p) => p.row)).size;
  const M = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const bx = [0, 0, 0];
  const by = [0, 0, 0];
  for (const p of pts) {
    const v = [1, p.col, p.row];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) M[a][b] += v[a] * v[b];
      bx[a] += v[a] * p.x;
      by[a] += v[a] * p.y;
    }
  }
  // A single row or column leaves one step undetermined: pin it to 0 (it is not used then).
  if (cols < 2) M[1][1] += 1e-6;
  if (rows < 2) M[2][2] += 1e-6;
  const solve3 = (A: number[][], b: number[]) => {
    const m = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      [m[c], m[p]] = [m[p], m[c]];
      for (let r = 0; r < 3; r++) {
        if (r === c || !m[c][c]) continue;
        const f = m[r][c] / m[c][c];
        for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
      }
    }
    return m.map((r, i) => (r[i] ? r[3] / r[i] : 0));
  };
  const sx = solve3(M, bx);
  const sy = solve3(M, by);
  return { x0: sx[0], y0: sy[0], rx: sx[1], ry: sy[1], bx: sx[2], by: sy[2] };
}

/**
 * Layout from recurrence (windowed tiles): solve the recurrence pairs alone, read each linked
 * page's cell off its pose (page-centre on the pitch lattice), learn the reading order from the
 * linked pages, and give the unlinked pages the empty cells between their linked neighbours in
 * that order. null when recurrence links too few pages or cells collide.
 */
function layoutFromRecurrence(
  regs: RegPage[],
  turned: RegPage[],
  rec: RawLink[],
  pitch: Pitch,
): { layout: Layout; turned: Map<string, { row: number; col: number }>; note?: string } | null {
  if (!rec.length) return null;
  const all = [...regs, ...turned];
  const sol = solvePosesDetailed(
    rec.map((l) => toPair(l, l.a.rot, l.b.rot)),
    new Map(),
    all.map((r) => ({ file: r.file, page: r.page })),
  );
  // Largest component = the pages the recurrence pairs reach from the first linked page.
  const adj = new Map<string, string[]>();
  for (const l of rec) {
    adj.set(l.a.key, [...(adj.get(l.a.key) ?? []), l.b.key]);
    adj.set(l.b.key, [...(adj.get(l.b.key) ?? []), l.a.key]);
  }
  let comp = new Set<string>();
  for (const start of adj.keys()) {
    if (comp.has(start)) continue;
    const seen = new Set([start]);
    const q = [start];
    while (q.length)
      for (const n of adj.get(q.shift() as string) ?? []) if (!seen.has(n)) seen.add(n), q.push(n);
    if (seen.size > comp.size) comp = seen;
  }
  if (comp.size < Math.max(2, 0.5 * regs.length)) return null;
  const pose = new Map(sol.poses.map((p) => [pageKey(p.file, p.page), p]));
  const det = pitch.right.dx * pitch.below.dy - pitch.right.dy * pitch.below.dx;
  if (!det) return null;
  const centre = (r: RegPage) => {
    const pp = pose.get(r.key);
    if (!pp) return null;
    const cx = r.src.widthMm / 2;
    const cy = r.src.heightMm / 2;
    const m = pp.toSheet;
    return { x: m.a * cx + m.c * cy + m.e, y: m.b * cx + m.d * cy + m.f };
  };
  const linked = all.filter((r) => comp.has(r.key));
  const c0 = centre(linked[0]);
  if (!c0) return null;
  const cellAt = (r: RegPage) => {
    const c = centre(r) as { x: number; y: number };
    const dx = c.x - c0.x;
    const dy = c.y - c0.y;
    // (dx, dy) = col·R + row·B ; rows grow DOWN the sheet (B points down, y-up frame).
    const col = Math.round((dx * pitch.below.dy - dy * pitch.below.dx) / det);
    const row = Math.round((pitch.right.dx * dy - pitch.right.dy * dx) / det);
    return { row, col };
  };
  const cell = new Map<string, { row: number; col: number }>();
  const used = new Set<string>();
  for (const r of linked) {
    const c = cellAt(r);
    const k = `${c.row},${c.col}`;
    if (used.has(k)) return null; // two tiles in one cell: not a lattice
    used.add(k);
    cell.set(r.key, c);
  }
  // Reading order of the linked pages: which of row-major ↓, row-major ↑, col-major → fits.
  const byPage = [...all].sort((a, b) => a.page - b.page);
  const orders: { order: Order; flow: Flow; key: (c: { row: number; col: number }) => number }[] = [
    { order: 'row-major', flow: 'down', key: (c) => c.row * 1000 + c.col },
    { order: 'row-major', flow: 'up', key: (c) => -c.row * 1000 + c.col },
    { order: 'col-major', flow: 'right', key: (c) => c.col * 1000 + c.row },
  ];
  let best = orders[0];
  let bestOk = -1;
  for (const o of orders) {
    let ok = 0;
    let prev: number | null = null;
    for (const r of byPage) {
      const c = cell.get(r.key);
      if (!c) continue;
      const v = o.key(c);
      if (prev !== null && v > prev) ok++;
      prev = v;
    }
    if (ok > bestOk) [best, bestOk] = [o, ok];
  }
  // The lattice's cells in reading order (bounding box of the linked cells).
  const rows = [...cell.values()].map((c) => c.row);
  const cols = [...cell.values()].map((c) => c.col);
  const r0 = Math.min(...rows);
  const r1 = Math.max(...rows);
  const q0 = Math.min(...cols);
  const q1 = Math.max(...cols);
  const lattice: { row: number; col: number }[] = [];
  for (let r = r0; r <= r1; r++) for (let c = q0; c <= q1; c++) lattice.push({ row: r, col: c });
  lattice.sort((a, b) => best.key(a) - best.key(b));
  const pos = new Map(lattice.map((c, i) => [`${c.row},${c.col}`, i]));
  // Unlinked pages: between the linked neighbours in reading order, the empty cells in order.
  let unplaced = 0;
  for (let i = 0; i < byPage.length; i++) {
    const r = byPage[i];
    if (cell.has(r.key)) continue;
    let a = i - 1;
    while (a >= 0 && !cell.has(byPage[a].key)) a--;
    let b = i + 1;
    while (b < byPage.length && !cell.has(byPage[b].key)) b++;
    const lo =
      a >= 0
        ? pos.get(`${cell.get(byPage[a].key)?.row},${cell.get(byPage[a].key)?.col}`) ?? -1
        : -1;
    const hi =
      b < byPage.length
        ? pos.get(`${cell.get(byPage[b].key)?.row},${cell.get(byPage[b].key)?.col}`) ??
          lattice.length
        : lattice.length;
    let placed = false;
    for (let k = lo + 1; k < hi && k < lattice.length; k++) {
      const c = lattice[k];
      const key = `${c.row},${c.col}`;
      if (used.has(key)) continue;
      used.add(key);
      cell.set(r.key, c);
      placed = true;
      break;
    }
    if (!placed) unplaced++;
  }
  if (unplaced) return null;
  const minR = Math.min(...[...cell.values()].map((c) => c.row));
  const minC = Math.min(...[...cell.values()].map((c) => c.col));
  const norm = (c: { row: number; col: number }) => ({ row: c.row - minR, col: c.col - minC });
  const cells = regs.map((r) => norm(cell.get(r.key) as { row: number; col: number }));
  const turnedCells = new Map(
    turned.map((r) => [r.key, norm(cell.get(r.key) as { row: number; col: number })]),
  );
  const lineOf = (c: { row: number; col: number }) => (best.order === 'row-major' ? c.row : c.col);
  const lines = new Map<number, number>();
  for (const c of [...cells, ...turnedCells.values()])
    lines.set(lineOf(c), (lines.get(lineOf(c)) ?? 0) + 1);
  return {
    layout: {
      order: best.order,
      flow: best.flow,
      lines: [...lines.entries()].sort((x, y) => x[0] - y[0]).map((e) => e[1]),
      cells,
      score: comp.size,
    },
    turned: turnedCells,
    note:
      comp.size < all.length
        ? `${all.length - comp.size} page(s) placed into empty cells by reading order`
        : undefined,
  };
}
