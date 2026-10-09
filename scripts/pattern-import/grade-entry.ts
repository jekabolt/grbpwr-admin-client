// PATTERN-IMPORT · HARD-SIZES H1 probe entry (bundled by grade.mjs). The bench (H0) is the
// corpus with every size encoding stripped: one solid style, no layers, no size texts, paths =
// the encoded F3 chains (L1, as drawn) or those chains cut at every crossing (L2, CAD export /
// trace). Truth = the encoded F3 rank per chain and the encoded F4 contours.
// Modes:
//   baseline [sample…] [L1|L2]   current core (grade 'off') vs the guard ('guard')
//   solve [sample…] [L1|L2]      grade 'solve' through fillPieces → contours + rank metrics
//   controls [sample…]           n−1 / n+1 (no wrong closed, ambiguity raised), shuffled truth
//   encoded                      encoded (non-stripped) inputs: hook not invoked, F4 byte-identical
//   all                          every mode, every sample, L1 + L2 → <out>/REPORT-data.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildChainsDetailed } from 'lib/pattern-import/chains/build';
import { fillPiecesDetailed, hausdorffP95, proposeSeeds, seedLabel, variantKnives, type FillDiag } from 'lib/pattern-import/pieces';
import { SegGrid, segNearest } from 'lib/pattern-import/pieces/geom';
import { bboxOfPts, gradeRanks, type GradeResult } from 'lib/pattern-import/pieces/grade';
import { detectSizeRun } from 'lib/pattern-import/sizes/detect';
import { drawPolyline, Grid } from 'lib/pattern-import/pieces/raster';
import type { BoxMm, ChainSet, FillOpts, PieceFamily, PtMm, Seed, Sheet, SizeRun } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { PALETTE, renderPng, type Label, type Stroke } from './sizes-render';

const HS = '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/hard-sizes/';
const BENCH = process.env.PATIMPORT_GRADE_BENCH ?? resolve(HS, 'h0/bench');
const OUT = process.env.PATIMPORT_GRADE_OUT ?? resolve(HS, 'h1');
const PREP = resolve(HS, 'h0/cache');

type Level = 'L1' | 'L2';
type ChainTruth = { role: string; rank: number | null };
type TruthCand = { label: string; seed: number; rank: number; outer: PtMm[]; areaMm2: number };
type Bench = {
  sample: string;
  level: Level;
  n: number;
  sizes: string[];
  sheet: Sheet;
  origOfPath: number[];
  truth: ChainTruth[];
  seeds: Seed[];
  cands: TruthCand[];
  files: { id: string; name: string }[];
};

const SAMPLES = ['robe', 'kombinezon', 'palto', 'reef'];
const VARIANT: Record<string, string | null> = { kombinezon: 'Style A' };
/** Pieces whose encoded truth is itself wrong (02-DESIGN §1, §4): kept in the tables, out of the rates. */
const NOISE: Record<string, string[]> = { kombinezon: ['5', '7'], palto: ['27'] };
const ACCEPT_SAMPLES = ['robe', 'kombinezon', 'palto'];

const mk = (d: string) => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
};
const loadBench = (id: string, level: Level) =>
  JSON.parse(readFileSync(resolve(BENCH, `${id}-${level}.json`), 'utf8')) as Bench;

function chainsOf(b: Bench, n: number): { set: ChainSet; run: SizeRun } {
  const { set } = buildChainsDetailed(
    b.sheet,
    {
      joinGapMm: PATIMPORT.joinGapMm,
      joinAngleDeg: PATIMPORT.joinAngleDeg,
      joinLateralMm: PATIMPORT.joinLateralMm,
      sizeCount: n,
    },
    { extraTexts: [] },
  );
  const run = detectSizeRun(
    b.sheet,
    set,
    b.files.map((f) => ({ id: f.id, name: f.name, kind: 'pdf', pages: 1, bytes: 0 }) as never),
  );
  return { set, run };
}

/** A run with n sizes (negative controls: the stripped sheet's run says b.n). */
function runWith(run: SizeRun, n: number): SizeRun {
  const sizes = Array.from({ length: n }, (_, r) => run.sizes[r] ?? { label: `x${r}`, rank: r, classId: null, file: null });
  return { ...run, sizes: sizes.map((s, r) => ({ ...s, rank: r })) };
}

type Got = { label: string; rank: number; outer: PtMm[]; outcome: string; refusal?: string };

function gotOf(b: Bench, families: PieceFamily[]): Got[] {
  const out: Got[] = [];
  for (const f of families) {
    const sd = b.seeds.find((x) => x.id === f.seed)!;
    for (const c of f.candidates)
      out.push({ label: seedLabel(sd) ?? String(sd.id), rank: c.rank, outer: c.outer, outcome: c.outcome, refusal: c.gradeRefusal });
  }
  return out;
}

type Score = {
  perPiece: Record<string, string>;
  closed: number;
  correct: number;
  wrong: number;
  unknown: number;
  leaks: number;
  /** (piece, rank) with truth, noise pieces excluded */
  withTruth: number;
  correctAcc: number;
  wrongAcc: number;
  wrongList: string[];
};

/** C = closed and p95 ≤ 1 mm to the truth contour · W = closed, off · ? = closed, no truth · L/M/t/- = not closed. */
function scoreContours(b: Bench, got: Got[], truthRank: (label: string, r: number) => number = (_, r) => r): Score {
  const noise = new Set(NOISE[b.sample] ?? []);
  const sc: Score = { perPiece: {}, closed: 0, correct: 0, wrong: 0, unknown: 0, leaks: 0, withTruth: 0, correctAcc: 0, wrongAcc: 0, wrongList: [] };
  const labels = [...new Set(b.seeds.map((s) => seedLabel(s) ?? String(s.id)))];
  for (const label of labels) {
    let row = '';
    for (let r = 0; r < b.n; r++) {
      const g = got.find((x) => x.label === label && x.rank === r);
      const t = b.cands.find((x) => x.label === label && x.rank === truthRank(label, r));
      const counted = !!t && !noise.has(label);
      if (counted) sc.withTruth++;
      if (!g || g.outcome !== 'closed') {
        row += g ? (g.outcome === 'leak' ? (g.refusal ? 'r' : 'L') : g.outcome === 'merged' ? 'M' : 't') : '-';
        sc.leaks++;
        continue;
      }
      sc.closed++;
      if (!t) {
        row += '?';
        sc.unknown++;
        continue;
      }
      if (process.env.DIST && (process.env.DIST === '1' || process.env.DIST === label)) {
        const area = (o: PtMm[]) => Math.abs(o.reduce((a, p, i) => { const q = o[(i + 1) % o.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2);
        const bb = (o: PtMm[]) => { const xs = o.map((p) => p.x); const ys = o.map((p) => p.y); return `[${Math.min(...xs).toFixed(0)},${Math.min(...ys).toFixed(0)}..${Math.max(...xs).toFixed(0)},${Math.max(...ys).toFixed(0)}]`; };
        console.log(`      dist ${label}/r${r}: p95=${hausdorffP95(g.outer, t.outer).toFixed(2)} got ${(area(g.outer) / 100).toFixed(1)} cm² ${bb(g.outer)} truth ${(t.areaMm2 / 100).toFixed(1)} cm² ${bb(t.outer)}`);
      }
      if (hausdorffP95(g.outer, t.outer) <= 1.0) {
        row += 'C';
        sc.correct++;
        if (counted) sc.correctAcc++;
      } else {
        row += 'W';
        sc.wrong++;
        sc.wrongList.push(`${label}/r${r}`);
        if (counted) sc.wrongAcc++;
      }
    }
    sc.perPiece[label] = row;
  }
  return sc;
}

/** Rank metrics by length of the TRUE size lines: right / wrong / unresolved (02-DESIGN §4). */
function rankMetrics(b: Bench, G: GradeResult) {
  const grid = new SegGrid(4);
  const paths = b.sheet.paths.map((p) => (p.closed ? [...p.pts, p.pts[0]] : p.pts));
  paths.forEach((p, k) => grid.addPolyline(k, p));
  let sizeLen = 0;
  b.sheet.paths.forEach((p, k) => {
    const t = b.truth[b.origOfPath[p.id]];
    if (t.role !== 'size') return;
    const q = paths[k];
    for (let i = 1; i < q.length; i++) sizeLen += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y);
  });
  let ok = 0;
  let wrong = 0;
  const step = 2;
  for (const p of G.portions) {
    if (p.ranks.length === G.n) continue; // "every size" on a size line = unresolved
    const pts = p.pts;
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      for (let s = step / 2; s < L; s += step) {
        const u = s / L;
        const q = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u };
        let best = -1;
        let bd = 0.3;
        grid.near(q, 0.3, (k, j) => {
          const d = segNearest(q, paths[k][j], paths[k][j + 1]).d;
          if (d < bd) {
            bd = d;
            best = k;
          }
        });
        if (best < 0) continue;
        const t = b.truth[b.origOfPath[b.sheet.paths[best].id]];
        if (t.role !== 'size' || t.rank == null) continue;
        const w = Math.min(step, L - s + step / 2);
        if (p.ranks.includes(t.rank)) ok += w;
        else wrong += w;
      }
    }
  }
  ok = Math.min(ok, sizeLen);
  return { rankAcc: ok / sizeLen, rankWrong: wrong / sizeLen, rankUnresolved: Math.max(0, 1 - (ok + wrong) / sizeLen) };
}

const fillOpts = (variant: string | null, grade: FillOpts['grade'], sizeCount?: number): FillOpts => ({
  cellMm: PATIMPORT.fillCellMm,
  snapMm: PATIMPORT.snapMm,
  variant,
  grade,
  ...(sizeCount ? { sizeCount } : {}),
});

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

type RunRow = {
  sample: string;
  level: Level;
  mode: string;
  n: number;
  score: Score;
  ranks?: { rankAcc: number; rankWrong: number; rankUnresolved: number };
  refused: Record<string, number>;
  ambiguities: number;
  sizeCountAmb: boolean;
  diag?: GradeResult['diag'];
  reasons: Record<string, string>;
  ms: number;
};

function runFill(b: Bench, mode: FillOpts['grade'], nOverride?: number) {
  const t0 = Date.now();
  const { set, run } = chainsOf(b, nOverride ?? b.n);
  const r2 = nOverride ? runWith(run, nOverride) : run;
  const { families, diag } = fillPiecesDetailed(b.sheet, set, r2, b.seeds, fillOpts(VARIANT[b.sample] ?? null, mode));
  return { set, run: r2, families, diag, ms: Date.now() - t0 };
}

function summarize(b: Bench, mode: string, families: PieceFamily[], diag: FillDiag, ms: number, n: number): RunRow {
  const got = gotOf(b, families);
  const score = scoreContours(b, got);
  const refused: Record<string, number> = {};
  for (const g of got) if (g.refusal) refused[g.refusal] = (refused[g.refusal] ?? 0) + 1;
  const G = diag.grade?.result ?? null;
  return {
    sample: b.sample,
    level: b.level,
    mode,
    n,
    score,
    ...(G && diag.grade?.walls ? { ranks: rankMetrics(b, G) } : {}),
    refused,
    ambiguities: diag.grade?.ambiguities.length ?? 0,
    sizeCountAmb: !!diag.grade?.ambiguities.some((a) => a.kind === 'size-count'),
    ...(G ? { diag: G.diag } : {}),
    reasons: Object.fromEntries(
      (G?.seeds ?? []).map((x) => {
        const sd = b.seeds.find((q) => q.id === x.seed)!;
        const ar = x.chosen ? x.chosen.areasMm2.map((a) => (a < 0 ? '-' : (a / 100).toFixed(0))).join('/') : '';
        return [seedLabel(sd) ?? String(sd.id), `${x.accepted ? 'ok' : x.refusal} ${x.reason} comps=${x.components.length} best=${ar} cm²`];
      }),
    ),
    ms,
  };
}

function printRow(r: RunRow) {
  const s = r.score;
  console.log(
    `${r.sample.padEnd(10)} ${r.level} ${r.mode.padEnd(8)} n=${r.n} closed=${s.closed} correct=${s.correct} WRONG=${s.wrong} unknown=${s.unknown} leaks=${s.leaks} | acc ${s.correctAcc}/${s.withTruth} = ${pct(s.withTruth ? s.correctAcc / s.withTruth : 0)}` +
      (r.ranks ? ` | rankAcc ${pct(r.ranks.rankAcc)} wrong ${pct(r.ranks.rankWrong)} unresolved ${pct(r.ranks.rankUnresolved)}` : '') +
      ` | refused ${JSON.stringify(r.refused)} amb ${r.ambiguities}${r.sizeCountAmb ? ' size-count' : ''} | ${(r.ms / 1000).toFixed(1)} s`,
  );
  if (r.diag) console.log(`      step0 ${r.diag.step0} reach ${r.diag.reach.toFixed(0)} tracks ${r.diag.tracks} full ${r.diag.fullTuples} parity ${r.diag.parityConflicts} lane ${r.diag.laneConflicts} bandMode ${r.diag.bandMode}`);
  for (const [k, v] of Object.entries(s.perPiece)) console.log(`      ${k.padEnd(6)} ${v.padEnd(10)} ${r.reasons[k] ?? ''}`);
  if (s.wrongList.length) console.log(`      wrong: ${s.wrongList.join(' ')}`);
}

// ── overlays ─────────────────────────────────────────────────────────────────────────────────

function truthColor(t: ChainTruth | undefined): string {
  if (!t) return '#ccc';
  if (t.role === 'size') return PALETTE[(t.rank ?? 0) % PALETTE.length];
  if (t.role === 'common') return '#000';
  return '#999';
}

function render(b: Bench, families: PieceFamily[], diag: FillDiag, tag: string, zoom: string[]) {
  const dir = mk(OUT);
  const G = diag.grade?.result ?? null;
  const got = gotOf(b, families);
  const sc = scoreContours(b, got);
  const strokes: Stroke[] = [];
  for (const q of b.sheet.paths) strokes.push({ pts: q.closed ? [...q.pts, q.pts[0]] : q.pts, color: '#ccc', width: 0.5 });
  if (G)
    for (const p of G.portions)
      strokes.push({
        pts: p.pts,
        color: p.ranks.length === G.n ? '#000' : PALETTE[p.ranks[0] % PALETTE.length],
        width: p.ranks.length === G.n ? 0.7 : 1.0,
        dash: p.ranks.length > 1 && p.ranks.length < G.n ? '3 2' : undefined,
      });
  const labels: Label[] = [];
  for (const f of families) {
    const sd = b.seeds.find((x) => x.id === f.seed)!;
    const lab = seedLabel(sd) ?? String(sd.id);
    for (const c of f.candidates) {
      const t = b.cands.find((x) => x.label === lab && x.rank === c.rank);
      if (c.outcome === 'closed' && c.outer.length > 2) {
        const ok = t && hausdorffP95(c.outer, t.outer) <= 1;
        strokes.push({ pts: c.outer, closed: true, color: ok ? '#00a' : t ? '#f00' : '#a0a', width: ok ? 0.9 : 2.2, dash: ok ? '5 3' : undefined });
      }
      if (c.outcome === 'leak' && c.leakAt && !c.gradeRefusal) labels.push({ at: c.leakAt, text: `x r${c.rank}`, color: '#d00', size: 10 });
    }
    const gs = G?.seeds.find((x) => x.seed === sd.id);
    labels.push({
      at: sd.at,
      text: `${lab} ${sc.perPiece[lab] ?? ''}${gs && !gs.accepted ? ` [${gs.refusal}: ${gs.reason}]` : ''}`,
      color: gs && !gs.accepted ? '#c60' : '#00f',
      size: 14,
    });
  }
  const legend = [
    { color: '#00a', text: 'closed, matches truth (p95 ≤ 1 mm)' },
    { color: '#f00', text: 'closed, WRONG' },
    { color: '#c60', text: 'refused (leak-like): reason' },
    { color: '#000', text: 'wall of every size' },
  ];
  renderPng(resolve(dir, `${b.sample}-${b.level}-${tag}.png`), b.sheet.bbox, strokes, labels, 0.5, legend);
  for (const lab of zoom) {
    const tc = b.cands.filter((c) => c.label === lab);
    const sd = b.seeds.find((s) => seedLabel(s) === lab);
    if (!sd) continue;
    let box = { minX: sd.at.x - 250, minY: sd.at.y - 250, maxX: sd.at.x + 250, maxY: sd.at.y + 250 };
    if (tc.length) {
      const xs = tc.flatMap((c) => c.outer.map((p) => p.x));
      const ys = tc.flatMap((c) => c.outer.map((p) => p.y));
      box = { minX: Math.min(...xs) - 20, minY: Math.min(...ys) - 20, maxX: Math.max(...xs) + 20, maxY: Math.max(...ys) + 20 };
    }
    renderPng(resolve(dir, `${b.sample}-${b.level}-${tag}-${lab}.png`), box, strokes, labels, 2, legend);
    // truth beside it
    const ts: Stroke[] = b.sheet.paths.map((q) => ({ pts: q.closed ? [...q.pts, q.pts[0]] : q.pts, color: truthColor(b.truth[b.origOfPath[q.id]]), width: 1.0 }));
    for (const c of tc) ts.push({ pts: c.outer, closed: true, color: '#00a', width: 0.6, dash: '4 3' });
    renderPng(resolve(dir, `${b.sample}-${b.level}-truth-${lab}.png`), box, ts, [{ at: sd.at, text: lab, color: '#00f', size: 14 }], 2);
  }
}

// ── modes ────────────────────────────────────────────────────────────────────────────────────

const levelsOf = (rest: string[]): Level[] =>
  rest.includes('L1') && !rest.includes('L2') ? ['L1'] : rest.includes('L2') && !rest.includes('L1') ? ['L2'] : ['L1', 'L2'];
const samplesOf = (rest: string[]) => {
  const s = rest.filter((r) => SAMPLES.includes(r));
  return s.length ? s : SAMPLES;
};

function baseline(rest: string[]): RunRow[] {
  const rows: RunRow[] = [];
  for (const L of levelsOf(rest))
    for (const id of samplesOf(rest)) {
      const b = loadBench(id, L);
      for (const mode of ['off', 'guard'] as const) {
        const f = runFill(b, mode);
        const row = summarize(b, mode, f.families, f.diag, f.ms, b.n);
        printRow(row);
        rows.push(row);
      }
    }
  return rows;
}

function solve(rest: string[]): RunRow[] {
  const rows: RunRow[] = [];
  const zi = rest.indexOf('--zoom');
  const zoom = zi >= 0 ? rest[zi + 1].split(',') : [];
  for (const L of levelsOf(rest))
    for (const id of samplesOf(rest)) {
      const b = loadBench(id, L);
      const f = runFill(b, 'solve');
      const row = summarize(b, 'solve', f.families, f.diag, f.ms, b.n);
      printRow(row);
      rows.push(row);
      if (!rest.includes('--no-render')) render(b, f.families, f.diag, 'solve', zoom);
    }
  return rows;
}

function controls(rest: string[]) {
  const out: unknown[] = [];
  for (const L of levelsOf(rest))
    for (const id of samplesOf(rest)) {
      const b = loadBench(id, L);
      for (const dn of [-1, 1]) {
        const n = b.n + dn;
        const f = runFill(b, 'solve', n);
        // the truth is in b.n ranks: a closed contour is wrong unless it is the truth's same rank
        const row = summarize(b, `n${dn > 0 ? '+1' : '-1'}`, f.families, f.diag, f.ms, n);
        printRow(row);
        out.push(row);
      }
      // shuffled truth: rescore the real run against permuted rank labels
      const f = runFill(b, 'solve');
      const got = gotOf(b, f.families);
      const real = scoreContours(b, got);
      const perm = (label: string, r: number) => {
        // a fixed derangement per piece: reverse, and rotate by one when the middle would stay
        const k = b.n - 1 - r;
        return k === r ? (r + 1) % b.n : k;
      };
      const shuf = scoreContours(b, got, (l, r) => perm(l, r));
      console.log(
        `${id.padEnd(10)} ${L} shuffled-truth: real ${real.correctAcc}/${real.withTruth} correct, ${real.wrong} wrong → shuffled ${shuf.correctAcc}/${shuf.withTruth} correct, ${shuf.wrong} wrong`,
      );
      out.push({ sample: id, level: L, mode: 'shuffled', real: { correct: real.correctAcc, wrong: real.wrong, withTruth: real.withTruth }, shuffled: { correct: shuf.correctAcc, wrong: shuf.wrong, withTruth: shuf.withTruth } });
    }
  return out;
}

/** Encoded inputs: the hook stays out and F4's output is byte-identical with grade 'solve' vs 'off'. */
function encoded() {
  const out: unknown[] = [];
  for (const id of ['robe', 'kombinezon', 'palto', 'reef', 'polupalto']) {
    const file = resolve(PREP, `prep-${id}.json`);
    if (!existsSync(file)) {
      console.log(`${id}: no encoded prep cache (${file})`);
      continue;
    }
    const p = JSON.parse(readFileSync(file, 'utf8')) as { sheet: Sheet; set: ChainSet; run: SizeRun };
    const v = VARIANT[id] ?? null;
    const seeds = proposeSeeds(p.sheet, p.set).filter((s) => !v || !s.variant || s.variant === v);
    const run = (mode: FillOpts['grade']) => {
      const { families, diag } = fillPiecesDetailed(p.sheet, p.set, p.run, seeds, fillOpts(VARIANT[id] ?? null, mode));
      return { json: JSON.stringify(families), hook: !!diag.grade, mode: diag.model.mode };
    };
    const a = run('off');
    const c = run('solve');
    const same = a.json === c.json;
    console.log(`${id.padEnd(10)} encoded: F4 mode ${a.mode}, hook invoked ${c.hook}, families byte-identical ${same} (${a.json.length} bytes)`);
    out.push({ sample: id, mode: a.mode, hook: c.hook, identical: same });
  }
  return out;
}

/** BFS from the seed to the box border over non-wall pixels: the path, or null when closed. */
function leakPath(box: BoxMm, lines: PtMm[][], at: PtMm): PtMm[] | null {
  const g = new Grid(box, 0.5);
  const wall = new Uint8Array(g.W * g.H);
  for (const l of lines) drawPolyline(g, wall, l);
  const k0 = g.iy(at.y) * g.W + g.ix(at.x);
  const from = new Int32Array(wall.length).fill(-2);
  const q = new Int32Array(wall.length);
  let h = 0;
  let t = 0;
  q[t++] = k0;
  from[k0] = -1;
  while (h < t) {
    const c = q[h++];
    const y = (c / g.W) | 0;
    const x = c - y * g.W;
    if (x === 0 || y === 0 || x === g.W - 1 || y === g.H - 1) {
      const out: PtMm[] = [];
      for (let p = c; p >= 0; p = from[p]) {
        const py = (p / g.W) | 0;
        out.push(g.centre(p - py * g.W, py));
      }
      // keep the stretch nearest the walls' crossing: the last 40 mm before leaving the piece
      return out.reverse();
    }
    for (const j of [c - 1, c + 1, c - g.W, c + g.W]) {
      if (j < 0 || j >= wall.length || from[j] !== -2 || wall[j]) continue;
      from[j] = c;
      q[t++] = j;
    }
  }
  return null;
}

/** walls <sample> <L1|L2> <label>[,<label>…]: per-rank walls of the solver around a piece, track ids. */
function walls(rest: string[]) {
  const [id, L, labs] = rest;
  const b = loadBench(id, L as Level);
  const { set } = chainsOf(b, b.n);
  const v = VARIANT[id] ?? null;
  const seeds = b.seeds.filter((s) => !v || !s.variant || s.variant === v);
  const G = gradeRanks(b.sheet, set, seeds, b.n, { cellMm: PATIMPORT.fillCellMm, keepModel: true, log: (x) => console.log(x) });
  const M = G.model!;
  const dir = mk(resolve(OUT, 'debug'));
  // truth per track: majority over its elements' chains' source paths
  const truthOfChain = (cid: number) => {
    const c = set.chains[cid];
    const w = new Map<string, number>();
    for (const r of c.ranges) {
      const t = b.truth[b.origOfPath[r.path]];
      const k = `${t.role[0]}${t.rank ?? ''}`;
      w.set(k, (w.get(k) ?? 0) + Math.max(1, r.to - r.from));
    }
    return [...w].sort((x, y) => y[1] - x[1]).map(([k]) => k).join('|');
  };
  if (v) {
    const kn = variantKnives(b.sheet, set, v);
    console.log(`knives for ${v}: ${kn.map((k) => `c${k}(${set.chains[k].lengthMm.toFixed(0)}mm y≈${set.chains[k].pts[0].y.toFixed(0)})`).join(' ')}; texts: ${b.sheet.texts.filter((t) => /cut/i.test(t.text)).map((t) => `"${t.text}"@${t.anchor.y.toFixed(0)}`).join(' ')}`);
  }
  const ti = rest.indexOf('--track');
  if (ti >= 0) {
    const tr = +rest[ti + 1];
    const t = M.tracks[tr];
    console.log(`track t${tr} len ${t.lengthMm.toFixed(0)} closed ${t.closed} items ${t.items.map((it) => `e${it.el}(c${M.els[it.el].chain}${it.rev ? 'r' : ''} ${it.at.toFixed(0)}+${it.L.toFixed(0)})`).join(' ')}`);
    for (const s of (M.samplesOf.get(tr) ?? []).filter((_, i) => i % +(process.env.EVERY ?? 10) === 0))
      console.log(`  u=${s.u.toFixed(0)} p=(${s.p.x.toFixed(0)},${s.p.y.toFixed(0)}) lanes ${s.lanes.map((l) => `t${l.track}@${l.s.toFixed(1)}`).join(' ')} sets ${(M.sets.get(tr)?.[s.idx] ?? []).map((e) => `c${e.comp}:${e.ranks.join('')}`).join(' ')}`);
  }
  for (const lab of labs.split(',')) {
    const sd = seeds.find((s) => seedLabel(s) === lab);
    const gs = G.seeds.find((s) => s.seed === sd?.id);
    if (!sd || !gs) continue;
    console.log(`piece ${lab}: ${gs.accepted ? 'ok' : gs.refusal} ${gs.reason} comps=${gs.components.join(',')} areas=${gs.areasMm2.map((a) => (a / 100).toFixed(0)).join('/')}`);
    const zb = process.env.ZOOMBOX?.split(',').map(Number);
    const box = zb ? { minX: zb[0], minY: zb[1], maxX: zb[2], maxY: zb[3] } : gs.box;
    const labels: Label[] = [];
    for (const t of M.tracks) {
      const bb = bboxOfPts(t.pts);
      if (bb.maxX < box.minX || bb.minX > box.maxX || bb.maxY < box.minY || bb.minY > box.maxY) continue;
      const mid = t.pts[t.pts.length >> 1];
      const tr = [...new Set(t.items.map((it) => truthOfChain(M.els[it.el].chain)))].join('+');
      labels.push({ at: mid, text: `t${t.id}:${tr}`, color: '#555', size: 8 });
      if (rest.includes('--tracks'))
        console.log(`  t${t.id} len=${t.lengthMm.toFixed(0)} truth=${tr} rank0=${M.rank0[t.id]} comp=${M.compOf[t.id]}/${M.compOfSet.get(t.id) ?? ''} common=${M.common.has(t.id)} frame=${M.frames.has(t.id)} lanes=${(M.samplesOf.get(t.id) ?? []).map((s) => s.lanes.length).join('').slice(0, 40)} sets=${(M.sets.get(t.id) ?? []).map((e) => e.map((x) => x.ranks.join('')).join('/') || '_').join(' ').slice(0, 160)}`);
    }
    labels.push({ at: sd.at, text: `● ${lab}`, color: '#00f', size: 14 });
    for (let r = 0; r < b.n; r++) {
      const strokes: Stroke[] = M.tracks.map((t) => ({ pts: t.pts, color: '#ddd', width: 0.5 }));
      for (const p of G.portions) if (p.ranks.includes(r)) strokes.push({ pts: p.pts, color: p.ranks.length === b.n ? '#000' : PALETTE[r % PALETTE.length], width: 1.4 });
      for (const c of b.cands) if (c.label === lab && c.rank === r) strokes.push({ pts: c.outer, closed: true, color: '#0a0', width: 0.6, dash: '3 3' });
      if (v) for (const k of variantKnives(b.sheet, set, v)) strokes.push({ pts: set.chains[k].pts, color: '#f0f', width: 0.8, dash: '2 2' });
      const leak = leakPath(box, G.portions.filter((p) => p.ranks.includes(r)).map((p) => p.pts), sd.at);
      if (leak) {
        strokes.push({ pts: leak, color: '#f00', width: 1.5 });
        console.log(`  r${r} LEAK path crosses walls near (${leak[leak.length - 1].x.toFixed(0)},${leak[leak.length - 1].y.toFixed(0)})`);
      }
      renderPng(resolve(dir, `${id}-${L}-walls-${lab}-r${r}.png`), box, strokes, labels, +(process.env.PX ?? 2));
    }
  }
}

export async function main(argv: string[]) {
  const [mode = 'all', ...rest] = argv;
  if (mode === 'baseline') baseline(rest);
  else if (mode === 'solve') solve(rest);
  else if (mode === 'controls') controls(rest);
  else if (mode === 'encoded') encoded();
  else if (mode === 'walls') walls(rest);
  else if (mode === 'rank') {
    // the solver alone (no F4): rank metrics with the grown region vs the prototype's truth box
    for (const L of levelsOf(rest))
      for (const id of samplesOf(rest)) {
        const b = loadBench(id, L);
        const { set } = chainsOf(b, b.n);
        const v = VARIANT[id] ?? null;
        const seeds = b.seeds.filter((s) => !v || !s.variant || s.variant === v);
        for (const truthBox of [false, true]) {
          const region = (sd: Seed) => {
            const lab = seedLabel(sd);
            const tc = b.cands.filter((c) => c.label === lab);
            if (!tc.length) return { minX: sd.at.x - 300, minY: sd.at.y - 300, maxX: sd.at.x + 300, maxY: sd.at.y + 300 };
            const big = tc.reduce((a, c) => (c.areaMm2 > a.areaMm2 ? c : a));
            const bb = bboxOfPts(big.outer);
            const mg = 8 + 2 * 8 * (b.n - big.rank);
            return { minX: bb.minX - mg, minY: bb.minY - mg, maxX: bb.maxX + mg, maxY: bb.maxY + mg };
          };
          const t0 = Date.now();
          const G = gradeRanks(b.sheet, set, seeds, b.n, { cellMm: 0.5, ...(truthBox ? { region } : {}) });
          const m = rankMetrics(b, G);
          console.log(`${id} ${L} ${truthBox ? 'truth-box' : 'grown   '}: rankAcc ${pct(m.rankAcc)} wrong ${pct(m.rankWrong)} unresolved ${pct(m.rankUnresolved)} comps ${G.components} bits ${G.bits.join('')} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
          for (const x of G.seeds) {
            const sd = seeds.find((q) => q.id === x.seed)!;
            console.log(`    ${(seedLabel(sd) ?? '').padEnd(4)} ${x.rankOk.map((o) => (o ? 'o' : '.')).join('')} ${x.accepted ? 'ok' : x.refusal} ${x.reason} areas=${x.areasMm2.map((a) => (a < 0 ? '-' : (a / 100).toFixed(0))).join('/')} box=${(x.box.maxX - x.box.minX).toFixed(0)}x${(x.box.maxY - x.box.minY).toFixed(0)}`);
          }
        }
      }
  }
  else if (mode === 'knife') {
    const b = loadBench('kombinezon', 'L1');
    const { set, run } = chainsOf(b, b.n);
    const P = JSON.parse(readFileSync(resolve(PREP, 'prep-kombinezon.json'), 'utf8')) as { sheet: Sheet; set: ChainSet; run: SizeRun };
    for (const k of variantKnives(P.sheet, P.set, 'Style A')) { const c = P.set.chains[k]; const xs = c.pts.map((p) => p.x); const ys = c.pts.map((p) => p.y); const cl = P.set.classes.find((q) => q.chains.includes(k)); console.log(`ENC knife c${k} ${cl?.role} x ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)} y ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}`); }
    const G = gradeRanks(b.sheet, set, b.seeds, b.n, { cellMm: 0.5 });
    for (const k of variantKnives(b.sheet, set, 'Style A')) { const c = set.chains[k]; const xs = c.pts.map((p) => p.x); const ys = c.pts.map((p) => p.y); console.log(`knife c${k} x ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)} y ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}`); }
    for (const p of G.portions) {
      const ys = p.pts.map((q) => q.y); const xs = p.pts.map((q) => q.x);
      if (Math.min(...xs) > 870 && Math.max(...xs) < 960 && Math.min(...ys) < 1000 && Math.max(...ys) > 950) console.log(`portion c${p.chain} ${p.fromMm.toFixed(0)}..${p.toMm.toFixed(0)} ranks ${p.ranks.join('')} x ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)} y ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}`);
    }
    for (const v of ['Style A', null]) {
      const { families } = fillPiecesDetailed(b.sheet, set, run, b.seeds, fillOpts(v, 'solve'));
      const f = families.find((x) => x.seed === 5)!;
      console.log(v, f.candidates.map((c) => `${c.rank}:${c.outcome}:${(c.areaMm2 / 100).toFixed(0)}:${c.bbox.minY.toFixed(0)}`).join(' '));
    }
  }
  else if (mode === 'all') {
    const data = {
      at: new Date().toISOString(),
      baseline: baseline(rest),
      solve: solve(rest),
      controls: controls(rest),
      encoded: encoded(),
    };
    writeFileSync(resolve(mk(OUT), 'REPORT-data.json'), JSON.stringify(data, null, 1));
    const sol = data.solve as RunRow[];
    const wrong = sol.reduce((a, r) => a + r.score.wrong, 0) + (data.baseline as RunRow[]).filter((r) => r.mode === 'guard').reduce((a, r) => a + r.score.wrong, 0);
    let ok = wrong === 0;
    for (const r of sol) {
      if (!ACCEPT_SAMPLES.includes(r.sample)) continue;
      const acc = r.score.withTruth ? r.score.correctAcc / r.score.withTruth : 0;
      if (acc < (r.level === 'L1' ? 0.9 : 0.75)) ok = false;
    }
    console.log(`\nH1 acceptance: wrong closed ${wrong} → ${ok ? 'PASS' : 'FAIL'}`);
    return ok ? 0 : 1;
  } else {
    console.log('modes: all | baseline | solve | controls | encoded');
    return 1;
  }
  return 0;
}
