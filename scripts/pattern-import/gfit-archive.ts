// PATTERN-IMPORT · GRADE P0 — the archive side of the gfit probe (archive-entry, ARCHIVE_PERSIZE=1):
// per family per size how it closes today (native = on its own lines / continuity / other closed /
// leak / refused / …), the gfit check over the closed sizes, the BRACKETED leaks (a leaking size
// strictly between two native sizes) with how much of the predicted outline the size's own and
// common lines cover (the P2 evidence E1/E2), and the Mood pen judge on every disagreeing size.
// Probe only: nothing here is product code.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  Chain,
  ChainSet,
  IRText,
  PieceCandidate,
  PieceFamily,
  PtMm,
  Seed,
  Sheet,
  SizeRun,
  Style,
} from 'lib/pattern-import/types';
import {
  analyseOutline as analyse,
  fitFamily,
  GFIT_TOL_CAD,
  GFIT_TOL_DEFAULT,
  GFIT_TOL_P0,
  type GfitFamily,
  type GfitTol,
} from 'lib/pattern-import/pieces/gfit';
import { isAnchor } from 'lib/pattern-import/pieces/fill';
import { wallModel } from 'lib/pattern-import/pieces/walls';
import { seedLabel } from 'lib/pattern-import/pieces/seeds';
import { chainLook, type Look } from 'lib/pattern-import/pieces/identity';
import { sameDashShape } from 'lib/pattern-import/chains/motif';
import { bboxOf, segNearest, SegGrid } from 'lib/pattern-import/pieces/geom';
import { sizeRunProblems } from 'lib/pattern-import/pieces/gfit/silent';
import { silentRead } from 'lib/pattern-import/pieces/gfit/silent-inputs';

import { PALETTE, renderPng, type Label, type Stroke } from './sizes-render';

/** A loose set: bounds how much of the disagreement is recognition noise (pen width, snapping). */
export const GFIT_TOL_LOOSE: GfitTol = {
  ptMm: 1.5,
  ptStep: 0.15,
  edgeMm: 1.5,
  edgeStep: 0.15,
  extrapMul: 2,
};

/**
 * Tolerance sets, the first one primary: env GFIT_TOL="ptMm,ptStep,edgeMm,edgeStep[,extrapMul];…",
 * else [P0 proposal (PDF-recognised CAD grading), CAD DXF pure, the design's start values, loose].
 */
export function tolSets(): GfitTol[] {
  const env = process.env.GFIT_TOL;
  if (env) {
    const sets = env
      .split(';')
      .map((x) => x.split(',').map(Number))
      .filter((t) => t.length >= 4 && t.every(Number.isFinite))
      .map((t) => ({
        ptMm: t[0],
        ptStep: t[1],
        edgeMm: t[2],
        edgeStep: t[3],
        extrapMul: t[4] ?? 1,
      }));
    if (sets.length) return sets;
  }
  return [GFIT_TOL_P0, GFIT_TOL_CAD, GFIT_TOL_DEFAULT, GFIT_TOL_LOOSE];
}

/** One letter per rank: N native, C continuity, D other closed (plug / derived / rerank), L leak,
 * R refused, T tiny, M merged, - no candidate. */
export function outcomeOf(c: PieceCandidate | undefined): string {
  if (!c) return '-';
  if (c.outcome === 'closed') return isAnchor(c) ? 'N' : c.rankFrom === 'continuity' ? 'C' : 'D';
  return { leak: 'L', refused: 'R', tiny: 'T', merged: 'M' }[c.outcome] ?? '?';
}

// ── the Mood pen judge (a copy of mood-entry's key reading; that file is another lane's) ──────

const canon = (s: string) =>
  s
    .toUpperCase()
    .replace(/^SIZES?\s*/, '')
    .replace(/\s+/g, '')
    .replace(/–|—/g, '-')
    .replace(/^XXL$/, '2XL')
    .replace(/^XXXL$/, '3XL');

type KeyRow = { label: string; look: Look | null };

/**
 * The key's rows. A row's sample is the short stroke with a look NEAREST its label's box (≤ 5 mm, on
 * any side: Mood prints the label rotated 0/90/180°, its sample on the label's baseline), labels and
 * strokes paired one-to-one nearest first — as the engine's legendEndHits does. A band under the label
 * holding the LONGEST stroke read the next row's sample (rows 3.9 mm apart, band 4.8 mm; G0 samples
 * 32.1 mm, 12/14's 32.3 mm): 24/26 = 28/30's pen, 8/10 = 12/14's (g0key, 17.10).
 */
/**
 * The key's rows, read two ways — the stroke NEAREST each label (one-to-one; Mood G0 stacks its rows
 * 3.9 mm apart, a 4.8 mm band under the label holds the next row's sample too) and the old band
 * under the label (longest stroke). The band stands unless the nearest reading tells more pens apart
 * (the band read a neighbour's row: Apricot's 24/26 = 28/30, Moonflower's six rows on one chain);
 * florence's key reads right only by the band. SILENT: the judge must not invent a wrong from a
 * misread key.
 */
function readKey(sheet: Sheet, set: ChainSet, labels: string[], styles: Map<number, Style>): KeyRow[] {
  const a = readKeyNearest(sheet, set, labels, styles);
  const b = readKeyBand(sheet, set, labels, styles);
  const distinct = (rows: KeyRow[]) => {
    const ls: Look[] = [];
    for (const r of rows) if (r.look && !ls.some((x) => looseSame(x, r.look!))) ls.push(r.look);
    return ls.length;
  };
  // the band reading stands unless the nearest one tells more pens apart
  return distinct(a) > distinct(b) ? a : b;
}

function readKeyNearest(sheet: Sheet, set: ChainSet, labels: string[], styles: Map<number, Style>) {
  const want = new Set(labels.map(canon));
  const head = sheet.texts.filter((t) => /line\s*key|size\s*key/i.test(t.text));
  const near = (t: IRText) =>
    !head.length ||
    head.some((h) => Math.hypot(h.anchor.x - t.anchor.x, h.anchor.y - t.anchor.y) < 300);
  const grid = new SegGrid(10);
  set.chains.forEach((c) => c.pts.length > 1 && grid.addPolyline(c.id, c.pts));
  const byId = new Map(set.chains.map((c) => [c.id, c]));
  const pairs: { label: string; c: Chain; d: number }[] = [];
  for (const t of sheet.texts) {
    const l = canon(t.text);
    if (!want.has(l) || !near(t)) continue;
    const b = t.bbox;
    const best = new Map<number, number>();
    grid.near({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, 40, (id, si) => {
      const c = byId.get(id);
      if (!c || c.lengthMm > 80 || !chainLook(c, styles)) return;
      const p = c.pts[si];
      const q = c.pts[si + 1] ?? p;
      for (const s of [p, q, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }]) {
        const dx = Math.max(b.minX - s.x, 0, s.x - b.maxX);
        const dy = Math.max(b.minY - s.y, 0, s.y - b.maxY);
        const d = Math.hypot(dx, dy);
        if (d <= 5 && d < (best.get(id) ?? Infinity)) best.set(id, d);
      }
    });
    for (const [id, d] of best) pairs.push({ label: l, c: byId.get(id)!, d });
  }
  pairs.sort((a, b) => a.d - b.d || b.c.lengthMm - a.c.lengthMm);
  const rows: KeyRow[] = [];
  const seen = new Set<string>();
  const used = new Set<number>();
  for (const p of pairs) {
    if (seen.has(p.label) || used.has(p.c.id)) continue;
    seen.add(p.label);
    used.add(p.c.id);
    rows.push({ label: p.label, look: chainLook(p.c, styles) });
  }
  return rows;
}

function readKeyBand(sheet: Sheet, set: ChainSet, labels: string[], styles: Map<number, Style>) {
  const want = new Set(labels.map(canon));
  const head = sheet.texts.filter((t) => /line\s*key|size\s*key/i.test(t.text));
  const near = (t: IRText) =>
    !head.length ||
    head.some((h) => Math.hypot(h.anchor.x - t.anchor.x, h.anchor.y - t.anchor.y) < 300);
  const rows: KeyRow[] = [];
  const seen = new Set<string>();
  const grid = new SegGrid(10);
  set.chains.forEach((c) => c.pts.length > 1 && grid.addPolyline(c.id, c.pts));
  const byId = new Map(set.chains.map((c) => [c.id, c]));
  for (const t of sheet.texts) {
    const l = canon(t.text);
    if (!want.has(l) || seen.has(l) || !near(t)) continue;
    const h = t.bbox.maxY - t.bbox.minY;
    const box = {
      minX: t.bbox.minX - 4,
      maxX: t.bbox.minX + 70,
      minY: t.bbox.minY - Math.max(4, h),
      maxY: t.bbox.minY + 0.8,
    };
    const ids = new Set<number>();
    grid.near({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }, 40, (id) => {
      const c = byId.get(id);
      if (!c) return;
      const b = bboxOf(c.pts);
      if (b.minX >= box.minX && b.maxX <= box.maxX + 10 && b.minY >= box.minY && b.maxY <= box.maxY)
        ids.add(id);
    });
    const cs = [...ids].map((id) => byId.get(id)!).sort((a, b) => b.lengthMm - a.lengthMm);
    if (!cs.length) continue;
    const looked = cs.find((c) => c.lengthMm <= 80 && chainLook(c, styles));
    rows.push({ label: l, look: looked ? chainLook(looked, styles) : null });
    seen.add(l);
  }
  return rows;
}

const looseSame = (a: Look, b: Look): boolean => {
  if (a.kind === 'solid' || b.kind === 'solid')
    return a.kind === 'solid' && b.kind === 'solid' && Math.abs(a.w - b.w) <= 0.03;
  if (a.kind === 'dash' && b.kind === 'dash') return sameDashShape(a.d, b.d, 0.3, 0.12);
  const ma = a.kind === 'dash' ? a.d : a.m;
  const mb = b.kind === 'dash' ? b.d : b.m;
  if (ma.length !== mb.length) return false;
  const sa = ma.reduce((x, y) => x + y, 0);
  const sb = mb.reduce((x, y) => x + y, 0);
  if (!sa || !sb) return false;
  if (sa / sb < 0.6 || sb / sa < 0.6) return false;
  return ma.every(
    (v, i) => Math.abs(v / sa - mb[i] / sb) <= Math.max(0.03, 0.15 * Math.max(v / sa, mb[i] / sb)),
  );
};

function penShares(outer: PtMm[], set: ChainSet, styles: Map<number, Style>, key: KeyRow[]) {
  const b = bboxOf(outer);
  const grid = new SegGrid(4);
  const rowOf = new Map<number, Set<string>>();
  const byId = new Map<number, Chain>();
  for (const c of set.chains) {
    if (c.pts.length < 2) continue;
    const cb = bboxOf(c.pts);
    if (
      cb.maxX < b.minX - 2 ||
      cb.minX > b.maxX + 2 ||
      cb.maxY < b.minY - 2 ||
      cb.minY > b.maxY + 2
    )
      continue;
    const l = chainLook(c, styles);
    if (!l) continue;
    const s = new Set<string>();
    for (const r of key) if (r.look && looseSame(l, r.look)) s.add(r.label);
    if (!s.size) continue;
    rowOf.set(c.id, s);
    byId.set(c.id, c);
    grid.addPolyline(c.id, c.closed ? [...c.pts, c.pts[0]] : c.pts);
  }
  const hits = new Map<string, number>();
  let n = 0;
  for (let i = 0; i < outer.length; i++) {
    const p = outer[i];
    const q = outer[(i + 1) % outer.length];
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    for (let t = 0; t < L; t += 1) {
      const x = { x: p.x + ((q.x - p.x) * t) / L, y: p.y + ((q.y - p.y) * t) / L };
      n++;
      const got = new Set<string>();
      grid.near(x, 0.6, (id, s) => {
        const rs = rowOf.get(id);
        const c = byId.get(id);
        if (!rs || !c) return;
        const a = c.pts[s];
        const bb = c.pts[(s + 1) % c.pts.length];
        if (segNearest(x, a, bb).d <= 0.6) for (const r of rs) got.add(r);
      });
      for (const r of got) hits.set(r, (hits.get(r) ?? 0) + 1);
    }
  }
  const share = new Map<string, number>();
  for (const [r, k] of hits) share.set(r, n ? k / n : 0);
  return share;
}

/** right / wrong / unverified, as the mood judge reads one outline of a size. */
function judgeOne(
  outer: PtMm[],
  label: string,
  set: ChainSet,
  styles: Map<number, Style>,
  key: KeyRow[],
): string {
  const l = canon(label);
  const row = key.find((r) => r.label === l && r.look);
  if (!row) return 'unverified:no-key-sample';
  const sh = penShares(outer, set, styles, key);
  const own = sh.get(l) ?? 0;
  let best: string | null = null;
  let bestShare = 0;
  for (const [k, v] of sh)
    if (v > bestShare) {
      best = k;
      bestShare = v;
    }
  if (best && best !== l && bestShare >= 0.5 && bestShare >= own + 0.15)
    return `wrong:${best}@${Math.round(bestShare * 100)}`;
  if (own < 0.7) return `unverified:own${Math.round(own * 100)}`;
  return `right:own${Math.round(own * 100)}`;
}

// ── coverage of a predicted outline by a size's own + common lines (P2 E1/E2) ─────────────────

function coverage(
  pred: { pts: PtMm[]; step: number[] },
  own: readonly Chain[],
): { cov: number; maxGap: number; gapShare: number } {
  const grid = new SegGrid(3);
  const byId = new Map<number, Chain>();
  for (const c of own) {
    if (c.pts.length < 2) continue;
    byId.set(c.id, c);
    grid.addPolyline(c.id, c.pts, c.closed);
  }
  const n = pred.pts.length;
  const seg = (i: number) => {
    const a = pred.pts[i];
    const b = pred.pts[(i + 1) % n];
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  let L = 0;
  const on = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    L += seg(i);
    const eps = 0.6 + 0.25 * pred.step[i];
    const p = pred.pts[i];
    let hit = false;
    grid.near(p, eps, (id, s) => {
      if (hit) return;
      const c = byId.get(id)!;
      const a = c.pts[s];
      const b = c.pts[(s + 1) % c.pts.length];
      if (segNearest(p, a, b).d <= eps) hit = true;
    });
    on[i] = hit ? 1 : 0;
  }
  let covL = 0;
  for (let i = 0; i < n; i++) if (on[i]) covL += seg(i);
  // gaps (cyclic runs of uncovered samples)
  let maxGap = 0;
  let gapSum = 0;
  const start = on.indexOf(1);
  if (start < 0) return { cov: 0, maxGap: L, gapShare: 1 };
  let run = 0;
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (!on[i]) run += seg(i);
    else if (run) {
      maxGap = Math.max(maxGap, run);
      gapSum += run;
      run = 0;
    }
  }
  return { cov: L ? covL / L : 0, maxGap, gapShare: L ? gapSum / L : 1 };
}

// ── one file ─────────────────────────────────────────────────────────────────────────────────

export type GfitArchiveCtx = {
  families: PieceFamily[];
  seeds: Seed[];
  run: SizeRun | null;
  set: ChainSet | null;
  sheet: Sheet | null;
  /** The printed key labels for the pen judge (Mood); empty = no judge. */
  key: string[];
  png?: { dir: string; prefix: string; all: boolean };
  /** GRADE REVIEW: the traced (raw) chain set, for the review dump (GFIT_REVIEW_DIR). */
  raw?: ChainSet | null;
};

const r2 = (x: number) => Math.round(x * 100) / 100;

export function gfitArchive(ctx: GfitArchiveCtx): Record<string, unknown> {
  const { families, run, set, sheet } = ctx;
  const nRanks = Math.max(
    1,
    run?.sizes.length ?? 1,
    ...families.flatMap((f) => f.candidates.map((c) => c.rank + 1)),
  );
  const tols = tolSets();
  const styles = new Map((sheet?.styles ?? []).map((x) => [x.id, x]));
  const wm = set && run ? wallModel(set, run, sheet?.texts ?? [], styles) : null;
  const chainById = new Map((set?.chains ?? []).map((c) => [c.id, c]));
  const key = set && sheet && ctx.key.length ? readKey(sheet, set, ctx.key, styles) : [];
  const out: Record<string, unknown>[] = [];
  // SILENT: the product's grade reading of the sheet (G22/G26 holds, warnings, drawsOwn) and the
  // size-run sanity of every family's closed sizes (G8 on the outlines, before the allowance)
  const t0s = Date.now();
  const sr = set && wm ? silentRead(families, set, wm) : null;
  const silentMs = Date.now() - t0s;
  // GFIT_DUMP=<file.json>: the families as the check reads them (gfit.mjs fam replays it offline)
  if (process.env.GFIT_DUMP)
    writeFileSync(
      process.env.GFIT_DUMP,
      JSON.stringify({
        labels: (run?.sizes ?? []).map((x) => x.label),
        families: families.map((f) => ({
          seed: f.seed,
          cands: f.candidates.map((c) => ({
            rank: c.rank,
            o: outcomeOf(c),
            outer: c.outer.map((p) => [
              Math.round(p.x * 1000) / 1000,
              Math.round(p.y * 1000) / 1000,
            ]),
          })),
        })),
      }),
    );
  for (const f of families) {
    const byRank = new Map<number, PieceCandidate>();
    for (const c of f.candidates) if (!byRank.has(c.rank)) byRank.set(c.rank, c);
    const ranks = Array.from({ length: nRanks }, (_, r) => outcomeOf(byRank.get(r))).join('');
    const seed = ctx.seeds.find((s) => s.id === f.seed);
    const rec: Record<string, unknown> = {
      seed: f.seed,
      label: seed ? (seedLabel(seed) ?? '').slice(0, 30) : '',
      ranks,
    };
    const closed = f.candidates.filter((c) => c.outcome === 'closed' && c.outer.length > 2);
    const box = closed.length ? bboxOf(closed.flatMap((c) => c.outer)) : null;
    const nlMemo = new Map<number, PtMm[][]>();
    const neighbourLines = (r: number): PtMm[][] => {
      let hit = nlMemo.get(r);
      if (!hit) nlMemo.set(r, (hit = neighbourLines0(r)));
      return hit;
    };
    const neighbourLines0 = (r: number): PtMm[][] => {
      if (!wm || !box) return [];
      const mine = new Set([...(wm.byRank[r] ?? []), ...wm.common]);
      const out2: PtMm[][] = [];
      wm.byRank.forEach((ids, k) => {
        if (k === r) return;
        for (const id of ids) {
          if (mine.has(id)) continue;
          const c = chainById.get(id);
          if (!c) continue;
          const b = bboxOf(c.pts);
          if (
            b.maxX < box.minX - 5 ||
            b.minX > box.maxX + 5 ||
            b.maxY < box.minY - 5 ||
            b.minY > box.maxY + 5
          )
            continue;
          out2.push(c.closed ? [...c.pts, c.pts[0]] : c.pts);
        }
      });
      return out2;
    };
    let fam: GfitFamily | null = null;
    const sizesIn = closed.map((c) => ({ rank: c.rank, outer: c.outer, anchor: isAnchor(c) }));
    try {
      fam = fitFamily(sizesIn, { tol: tols[0], neighbourLines });
      // the other tolerance sets: status per size only
      rec.alt = (process.env.GFIT_NO_ALT ? [] : tols.slice(1)).map((tol) => {
        const f2 = fitFamily(sizesIn, { tol, neighbourLines });
        return f2.sizes
          .map((v) => `${v.rank}:${v.status[0]}${v.cause ? `/${v.cause}` : ''}:${r2(v.score)}`)
          .join(' ');
      });
    } catch (e) {
      rec.error = String((e as Error)?.message ?? e).slice(0, 200);
    }
    if (fam) {
      rec.model = fam.model;
      if (fam.why) rec.why = fam.why;
      rec.frame = fam.frame;
      rec.gp = fam.gradePoints;
      rec.stepMm = r2(fam.stepMm);
      rec.sgp = fam.strongGradePoints;
      rec.topoSkips = fam.topoSkips;
      rec.ratio = Number.isFinite(fam.minRatio) ? r2(fam.minRatio) : null;
      rec.trusted = fam.trusted.join(',');
      rec.st = fam.sizes
        .map((v) => `${v.rank}:${v.status[0]}${v.cause ? `/${v.cause}` : ''}:${r2(v.score)}`)
        .join(' ');
      // raw residuals per checked size: rank:how:worst strong point mm:worst edge p95 mm
      rec.raw = fam.sizes
        .filter((v) => v.how)
        .map(
          (v) =>
            `${v.rank}:${v.how![0]}:${r2(Math.max(0, ...v.points.filter((x) => x.strong).map((x) => x.resid)))}:${r2(Math.max(0, ...v.edges.map((x) => x.p95)))}`,
        )
        .join(' ');
      const dis = fam.sizes.filter((v) => v.status === 'disagrees');
      if (dis.length)
        rec.dis = dis.map((v) => {
          const c = byRank.get(v.rank);
          const label = run?.sizes[v.rank]?.label ?? '';
          return {
            r: v.rank,
            label,
            o: outcomeOf(c),
            cause: v.cause,
            score: r2(v.score),
            how: v.how,
            run: r2(v.offRunMm ?? 0),
            onN: r2(v.onNeighbour ?? 0),
            at: v.offAt ? [Math.round(v.offAt.x), Math.round(v.offAt.y)] : null,
            judge: key.length && set && c ? judgeOne(c.outer, label, set, styles, key) : null,
          };
        });
      const topo = fam.sizes.filter((v) => v.status === 'topology').map((v) => v.rank);
      if (topo.length) rec.topo = topo;
      // notch candidates in the outline: e<edge>:<kind> (+ the sizes without it when split)
      if (fam.notches.length)
        rec.notches = fam.notches.map(
          (x) => `e${x.e}:${x.kind}${x.missing.length ? `-${x.missing.join('.')}` : ''}`,
        );
      rec.exc = fam.sizes.map((v) => v.excursions.length).join(',');
    }
    if (sr) {
      const closedRows = closed.map((c) => ({ key: String(c.rank), rank: c.rank, ring: c.outer }));
      const ev = (r: number) => sr.evidence(f.seed, r);
      const runP = sizeRunProblems(closedRows).filter(
        (p) => !(p.kind === 'collapse' && p.keys.every((k) => ev(Number(k))?.drawsOwn === false)),
      );
      const sil: Record<string, unknown> = {};
      const holds = closed.filter((c) => ev(c.rank)?.hold).map((c) => c.rank);
      const warns = closed.filter((c) => ev(c.rank)?.warn).map((c) => c.rank);
      if (holds.length) sil.hold = holds;
      if (warns.length) sil.warn = warns;
      if (runP.length) sil.run = runP.map((p) => `${p.kind}:${p.keys.join('+')}`);
      const vs = sr.grade()?.verdicts.filter((v) => v.seed === f.seed) ?? [];
      if (vs.length)
        sil.v = vs.map(
          (v) =>
            `${v.rank}:${v.cause}:${r2(v.residMm)}${v.hold ? ':H' : ''}${v.excused ? ':brk' : ''}${v.ownAtPrediction != null ? `:own${r2(v.ownAtPrediction)}` : ''}`,
        );
      if (Object.keys(sil).length) rec.silent = sil;
    }
    // bracketed leaks: a leak strictly between two native sizes
    const natives = [...byRank.values()].filter((c) => outcomeOf(c) === 'N').map((c) => c.rank);
    const brackets: Record<string, unknown>[] = [];
    for (let r = 0; r < nRanks; r++) {
      if (outcomeOf(byRank.get(r)) !== 'L') continue;
      if (!natives.some((x) => x < r) || !natives.some((x) => x > r)) continue;
      const b: Record<string, unknown> = { r };
      if (fam?.model && wm) {
        const opts2 = fam.predict(r);
        if (opts2.length) {
          const own = [...(wm.byRank[r] ?? []), ...wm.common]
            .map((id) => chainById.get(id))
            .filter((c): c is Chain => !!c);
          // the drawn own lines decide which prediction (interp / a break side) is this size
          const cvs = opts2.map((p) => ({ how: p.how, ...coverage(p, own) }));
          const cv = cvs.reduce((a, x) => (x.cov > a.cov ? x : a));
          b.how = cv.how;
          b.cov = r2(cv.cov);
          b.maxGap = r2(cv.maxGap);
          b.gapShare = r2(cv.gapShare);
          b.e12 = cv.cov >= 0.92 && cv.maxGap <= 15 && cv.gapShare <= 0.04;
        } else b.pred = 'none';
      }
      brackets.push(b);
    }
    if (brackets.length) rec.brackets = brackets;
    out.push(rec);
    // GRADE REVIEW: GFIT_REVIEW_DIR=<dir> — a JSON per flagged family: the sizes' outlines, the verdicts,
    // the predictions of the disagreeing sizes, and the line work around the family (raw + wall chains
    // with their pen look, the printed key rows each pen matches, and the wall model's size classes).
    const rvDir = process.env.GFIT_REVIEW_DIR;
    if (rvDir && fam && (rec.dis || rec.silent) && box && ctx.png) {
      try {
        const R = (x: number) => Math.round(x * 100) / 100;
        const P = (ps: readonly PtMm[]) => ps.map((p) => [R(p.x), R(p.y)]);
        const m = 25;
        const near = (c: Chain) => {
          const b = bboxOf(c.pts);
          return !(
            b.maxX < box.minX - m ||
            b.minX > box.maxX + m ||
            b.maxY < box.minY - m ||
            b.minY > box.maxY + m
          );
        };
        const wmRanks = new Map<number, number[]>();
        wm?.byRank.forEach((ids, k) => {
          for (const id of ids) wmRanks.set(id, [...(wmRanks.get(id) ?? []), k]);
        });
        const common = new Set(wm?.common ?? []);
        const chainOut = (c: Chain) => {
          const l = chainLook(c, styles);
          return {
            id: c.id,
            closed: !!c.closed,
            look: l,
            keys: l ? key.filter((r) => r.look && looseSame(l, r.look)).map((r) => r.label) : [],
            wm: wmRanks.get(c.id) ?? [],
            common: common.has(c.id),
            pts: P(c.pts),
          };
        };
        const json = {
          prefix: ctx.png.prefix,
          seed: f.seed,
          label: rec.label,
          ranks,
          labels: (run?.sizes ?? []).map((x) => x.label),
          key: key.map((r) => ({ label: r.label, look: r.look })),
          model: fam.model,
          why: fam.why ?? null,
          frame: fam.frame,
          trusted: fam.trusted,
          stepMm: fam.stepMm,
          cands: f.candidates.map((c) => ({ rank: c.rank, o: outcomeOf(c), outer: P(c.outer) })),
          sizes: fam.sizes.map((v) => ({
            rank: v.rank,
            status: v.status,
            cause: v.cause ?? null,
            score: v.score,
            how: v.how ?? null,
            from: v.from ?? null,
            offAt: v.offAt ? [R(v.offAt.x), R(v.offAt.y)] : null,
            offRunMm: v.offRunMm ?? null,
            onNeighbour: v.onNeighbour ?? null,
            worstEdge: v.worstEdge ?? null,
            pointsMax: Math.max(0, ...v.points.filter((x) => x.strong).map((x) => x.resid)),
            edges: v.edges.map((e) => ({ e: e.e, p95: R(e.p95), max: R(e.max), run: R(e.run), offAt: e.offAt ? [R(e.offAt.x), R(e.offAt.y)] : null })),
          })),
          preds: Object.fromEntries(
            fam.sizes
              .filter((v) => v.status === 'disagrees')
              .map((v) => [v.rank, fam!.predict(v.rank).map((p) => ({ how: p.how, from: p.from, pts: P(p.pts) }))]),
          ),
          wall: (set?.chains ?? []).filter((c) => c.pts.length > 1 && near(c)).map(chainOut),
          raw: (ctx.raw && ctx.raw !== set ? ctx.raw.chains : [])
            .filter((c) => c.pts.length > 1 && near(c))
            .map(chainOut),
        };
        mkdirSync(rvDir, { recursive: true });
        writeFileSync(`${rvDir}/${ctx.png.prefix}__seed${f.seed}.json`, JSON.stringify(json));
      } catch (e) {
        rec.reviewError = String((e as Error)?.stack ?? e).slice(0, 300);
      }
    }
    if (ctx.png && fam && (ctx.png.all || rec.dis))
      try {
        renderGfit(
          `${ctx.png.dir}/${ctx.png.prefix}__seed${f.seed}_${String(rec.label).replace(/[^\w-]+/g, '_')}.png`,
          f.candidates.map((c) => ({ rank: c.rank, outer: c.outer, outcome: outcomeOf(c) })),
          fam,
          `${ctx.png.prefix} seed ${f.seed} ${rec.label} ${ranks}`,
          (run?.sizes ?? []).map((s) => s.label),
        );
      } catch (e) {
        rec.pngError = String(e).slice(0, 120);
      }
  }
  return {
    families: out,
    ranks: nRanks,
    labels: (run?.sizes ?? []).map((s) => s.label),
    ...(sr
      ? {
          silentMs: silentMs + (sr.grade()?.ms ?? 0),
          breaks: Object.fromEntries([...(sr.grade()?.breaks ?? [])].map(([r, b]) => [r, r2(b)])),
        }
      : {}),
  };
}

/** A family's sizes (rank colours; leaks dashed), corners (strong ●, weak ·), notch candidates (magenta),
 * the disagreeing sizes' prediction (black dashed) and their worst place (red). */
export function renderGfit(
  file: string,
  cands: { rank: number; outer: PtMm[]; outcome: string }[],
  fam: GfitFamily,
  title: string,
  labels: string[],
) {
  const all = cands.filter((c) => c.outer.length > 2);
  if (!all.length) return;
  mkdirSync(dirname(file), { recursive: true });
  const b0 = bboxOf(all.flatMap((c) => c.outer));
  const m = 15;
  const box = { minX: b0.minX - m, minY: b0.minY - m - 60, maxX: b0.maxX + m, maxY: b0.maxY + m };
  const strokes: Stroke[] = [];
  const marks: Label[] = [];
  const cross = (p: PtMm, r: number, color: string, width: number) => {
    strokes.push({
      pts: [
        { x: p.x - r, y: p.y },
        { x: p.x + r, y: p.y },
      ],
      color,
      width,
    });
    strokes.push({
      pts: [
        { x: p.x, y: p.y - r },
        { x: p.x, y: p.y + r },
      ],
      color,
      width,
    });
  };
  for (const c of all) {
    const ok =
      c.outcome === 'N' || c.outcome === 'C' || c.outcome === 'D' || c.outcome === 'closed';
    strokes.push({
      pts: c.outer,
      closed: true,
      color: PALETTE[c.rank % PALETTE.length],
      width: ok ? 1.2 : 0.8,
      ...(ok ? {} : { dash: '5 4' }),
    });
  }
  // corners and excursions of each size read again (the module's own reading)
  const legend: { color: string; text: string }[] = [{ color: '#000', text: title }];
  legend.push({
    color: '#000',
    text: `model ${fam.model ? 'yes' : `no (${fam.why})`} · ${fam.frame} · grade pts ${fam.gradePoints} (strong ${fam.strongGradePoints}) · topo skips ${fam.topoSkips} · uniq ${Number.isFinite(fam.minRatio) ? fam.minRatio.toFixed(1) : '-'} · trusted ${fam.trusted.join(',')}`,
  });
  for (const v of fam.sizes) {
    const c = all.find((x) => x.rank === v.rank);
    legend.push({
      color: PALETTE[v.rank % PALETTE.length],
      text: `r${v.rank} ${labels[v.rank] ?? ''} ${c?.outcome ?? ''} corners ${v.corners.strong}/${v.corners.weak} notch-cand ${v.excursions.length} ${v.status}${v.cause ? `/${v.cause}` : ''} score ${v.score.toFixed(2)}${v.how ? ` ${v.how} ${v.from?.join('-')}` : ''}`,
    });
  }
  if (fam.notches.length)
    legend.push({
      color: '#d0d',
      text: `notch candidates in the outline: ${fam.notches.map((x) => `edge ${x.e} ${x.kind}${x.missing.length ? ` (not in r${x.missing.join(',')})` : ''}`).join(' | ')}`,
    });
  // corner + excursion marks: the module's own reading of each outline
  for (const c of all) {
    const v = fam.sizes.find((x) => x.rank === c.rank);
    if (!v) continue;
    const col = PALETTE[c.rank % PALETTE.length];
    const o = analyse(c.outer);
    if (!o) continue;
    for (const k of o.corners) cross(k.p, k.strong ? 2.5 : 1.2, col, k.strong ? 1.6 : 0.8);
    for (const x of o.excursions) {
      strokes.push({ pts: o.raw.slice(x.i0, x.i1 + 1), color: '#d0d', width: 3 });
      marks.push({
        at: x.p,
        text: `${x.depth > 0 ? '+' : ''}${x.depth.toFixed(1)}`,
        color: '#a0a',
        size: 10,
      });
    }
    if (v.status === 'disagrees') {
      const ps = fam.predict(v.rank);
      const p = ps.find((x) => x.from[0] === v.from?.[0] && x.from[1] === v.from?.[1]) ?? ps[0];
      if (p) strokes.push({ pts: p.pts, closed: true, color: '#000', width: 0.8, dash: '3 3' });
      if (v.offAt) {
        cross(v.offAt, 6, '#f00', 2.5);
        marks.push({
          at: { x: v.offAt.x + 4, y: v.offAt.y + 4 },
          text: `r${v.rank} ${v.cause}`,
          color: '#f00',
          size: 12,
        });
      }
    }
  }
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  renderPng(file, box, strokes, marks, Math.min(4, 1800 / span), legend);
}
