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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { buildChainsDetailed } from 'lib/pattern-import/chains/build';
import { fillPiecesDetailed, hausdorffP95, proposeSeeds, seedLabel, variantKnives, type FillDiag } from 'lib/pattern-import/pieces';
import { SegGrid, segNearest } from 'lib/pattern-import/pieces/geom';
import { bboxOfPts, GRADE_TUNING, gradeRanks, type GradeResult } from 'lib/pattern-import/pieces/grade';
import { detectSizeRun } from 'lib/pattern-import/sizes/detect';
import { nestPairs, portionPts, rankMasks, tracksIn } from 'lib/pattern-import/pieces/grade/choose';
import { HOOK_DEBUG } from 'lib/pattern-import/pieces/grade/hook';
import { ranksAt } from 'lib/pattern-import/pieces/grade/model';
import { drawPolyline, Grid } from 'lib/pattern-import/pieces/raster';
import type { BoxMm, CardSize, ChainSet, ExpectedSizes, FillOpts, PieceFamily, PtMm, Seed, Sheet, SizeRun } from 'lib/pattern-import/types';
import { expectedSizes, runForExpected } from 'lib/pattern-import/pieces/grade/expected';
import { runFixtures } from './grade-fixtures';
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
/**
 * Encoded truth that is itself wrong: kept in the tables, out of the rates AND out of the wrong count
 * (listed separately). 'label' = the whole piece, 'label/rN' = one rank.
 *   kombinezon 5, 7  belts drawn ×8: encoded F4 closes one band for every size (02-DESIGN §1, §4)
 *   palto 27         five lapel lines all rank 0 in the truth (02-DESIGN §1)
 *   palto 24 r0–r3   H1: encoded F3 classes the largest size's line on the right curve 'common', so
 *                    every encoded rank's contour follows the OUTERMOST line there (overlay
 *                    h1/palto-L1-truth-24.png: black curve; h1/debug/palto-L1-walls-24-r2.png)
 */
const NOISE: Record<string, string[]> = {
  kombinezon: ['5', '7'],
  palto: ['27', '24/r0', '24/r1', '24/r2', '24/r3'],
};
const isNoise = (sample: string, label: string, r: number) => {
  const l = NOISE[sample] ?? [];
  return l.includes(label) || l.includes(`${label}/r${r}`);
};
const ACCEPT_SAMPLES = ['robe', 'kombinezon', 'palto'];

const mk = (d: string) => {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  return d;
};
const loadBench = (id: string, level: Level) =>
  JSON.parse(readFileSync(resolve(BENCH, `${id}-${level}.json`), 'utf8')) as Bench;

/** The wizard's path: chains WITHOUT a size count (the wizard passes none), then the size run. */
function chainsOf(b: Bench, _n?: number): { set: ChainSet; run: SizeRun } {
  const { set } = buildChainsDetailed(
    b.sheet,
    {
      joinGapMm: PATIMPORT.joinGapMm,
      joinAngleDeg: PATIMPORT.joinAngleDeg,
      joinLateralMm: PATIMPORT.joinLateralMm,
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

/** A card run of n sizes (the converter runs inside the card; the bench's card has b.n sizes). */
const cardOf = (n: number): CardSize[] =>
  Array.from({ length: n }, (_, r) => ({ sizeId: 100 + r, name: `S${r}`, token: `s${r}`, rank: r }));

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
  /** every produced candidate (all ranks the fill produced, not only the truth's b.n) */
  produced: number;
  closed: number;
  correct: number;
  wrong: number;
  /** matches the truth contour, but < OWN_MIN of it lies on its own size's / common lines */
  provenance: string[];
  unknown: number;
  refused: number;
  leaks: number;
  /** (piece, rank) with truth, noise pieces excluded */
  withTruth: number;
  correctAcc: number;
  wrongAcc: number;
  wrongList: string[];
  /** closed contours that differ from truth-noise entries (not counted as wrong; listed) */
  noiseWrong: string[];
  /** audited overrides judged by provenance (correct at ≥ OWN_AUDIT, else wrong) */
  audited: string[];
  /** own-line share of every closed contour, for the report */
  ownShares: number[];
};

/**
 * Audited truth overrides: the bench's truth contour for these (piece, rank) is KNOWN wrong, checked
 * by eye on the named overlay — our contour is then judged by provenance alone (≥ OWN_AUDIT of it on
 * its own size's / common source lines), never dropped from the count.
 */
const KOMB_2 = {
  pieces: { '2': [0, 1, 2, 3, 4, 6, 7] },
  why:
    "the Style A cutting line F4 finds (variantKnives) includes SIZE 5's crotch curve; the encoded " +
    'truth run cut every size with it, so the truth contours of r0–r4 leave their own crotch curve ' +
    "for size 5's (r6/r7: the cut also trims them). On the drawn lines the r0 crotch is the red " +
    'curve that meets the red r0 inseam in a corner — ours runs 100 % on its own lines there',
  image: 'hard-sizes/h1/kombinezon-L2-truth-2-zoom.png + hard-sizes/h1/kombinezon-L1-walls-2-r0.png',
};
const AUDITED: Record<string, { pieces: Record<string, number[]>; why: string; image: string }> = {
  'kombinezon-L1': KOMB_2,
  'kombinezon-L2': KOMB_2,
};
const auditedOf = (b: Bench, label: string, r: number) =>
  AUDITED[`${b.sample}-${b.level}`]?.pieces[label]?.includes(r) ?? false;

/**
 * Every produced candidate is scored. C = closed, p95 ≤ 1 mm to the truth AND ≥ 90 % on its own
 * size's lines · P = matches the truth but not on its own lines (not correct; listed) · A = audited
 * override, on its own lines · W = closed and wrong (also: closed where the truth has no such size)
 * · n = differs from a known-noise truth · ? = closed, the piece has no truth at all · r = refused ·
 * L/M/t/- = not closed.
 */
function scoreContours(b: Bench, got: Got[], truthRank: (label: string, r: number) => number = (_, r) => r): Score {
  const sc: Score = { perPiece: {}, produced: 0, closed: 0, correct: 0, wrong: 0, provenance: [], unknown: 0, refused: 0, leaks: 0, withTruth: 0, correctAcc: 0, wrongAcc: 0, wrongList: [], noiseWrong: [], audited: [], ownShares: [] };
  const labels = [...new Set(b.seeds.map((s) => seedLabel(s) ?? String(s.id)))];
  for (const label of labels) {
    let row = '';
    const ranks = new Set<number>(Array.from({ length: b.n }, (_, r) => r));
    for (const g of got) if (g.label === label) ranks.add(g.rank);
    for (const r of [...ranks].sort((x, y) => x - y)) {
      const g = got.find((x) => x.label === label && x.rank === r);
      const t = r < b.n ? b.cands.find((x) => x.label === label && x.rank === truthRank(label, r)) : undefined;
      const audited = auditedOf(b, label, r);
      const counted = (!!t || audited) && !isNoise(b.sample, label, r);
      if (counted) sc.withTruth++;
      if (g) sc.produced++;
      if (!g || g.outcome !== 'closed') {
        row += g ? (g.outcome === 'refused' ? 'r' : g.outcome === 'leak' ? 'L' : g.outcome === 'merged' ? 'M' : 't') : '-';
        if (g?.outcome === 'refused') sc.refused++;
        else sc.leaks++;
        continue;
      }
      sc.closed++;
      const own = ownShare(b, g.outer, r < b.n ? truthRank(label, r) : -1);
      sc.ownShares.push(own);
      const id = `${label}/r${r}`;
      if (audited && !isNoise(b.sample, label, r)) {
        sc.audited.push(`${id} own ${(own * 100).toFixed(0)}%`);
        if (own >= OWN_AUDIT) {
          row += 'A';
          sc.correct++;
          sc.correctAcc++;
        } else {
          row += 'W';
          sc.wrong++;
          sc.wrongAcc++;
          sc.wrongList.push(id);
        }
        continue;
      }
      if (!t) {
        if (r >= b.n) {
          // a size the drawing does not have (n+1 control): closing it is inventing a contour
          row += 'W';
          sc.wrong++;
          sc.wrongList.push(id);
        } else {
          row += '?';
          sc.unknown++;
          if (own < OWN_MIN) sc.provenance.push(`${id} (no truth) own ${(own * 100).toFixed(0)}%`);
        }
        continue;
      }
      if (process.env.DIST && (process.env.DIST === '1' || process.env.DIST === label)) {
        const miss: PtMm[] = [];
        ownShare(b, g.outer, truthRank(label, r), miss);
        console.log(`      dist ${id}: p95=${hausdorffP95(g.outer, t.outer).toFixed(2)} own ${(own * 100).toFixed(0)}% truth own ${(ownShare(b, t.outer, truthRank(label, r)) * 100).toFixed(0)}%${miss.length ? ` misses ${miss.length} in ${JSON.stringify(bboxOfPts(miss), (_, v) => (typeof v === 'number' ? Math.round(v) : v))}` : ''}`);
      }
      const match = hausdorffP95(g.outer, t.outer) <= 1.0;
      if (!counted) {
        row += match ? 'c' : 'n';
        if (!match) sc.noiseWrong.push(id);
        continue;
      }
      if (match && own >= OWN_MIN) {
        row += 'C';
        sc.correct++;
        sc.correctAcc++;
      } else if (match) {
        row += 'P';
        sc.provenance.push(`${id} own ${(own * 100).toFixed(0)}%`);
      } else {
        row += 'W';
        sc.wrong++;
        sc.wrongAcc++;
        sc.wrongList.push(id);
      }
    }
    sc.perPiece[label] = row;
  }
  return sc;
}

/** A closed contour is CORRECT only when it matches the truth contour AND runs on its own size's lines. */
const OWN_MIN = 0.9;
/** A point on another size's line is this size's own when this size draws nothing within this reach. */
const SHARED_REACH_MM = 12;
/** A contour point is on a line within this distance (the same 1 mm as the contour match). */
const PROV_MM = 1.0;
/** An audited truth override judges our contour by provenance alone, at this stricter share. */
const OWN_AUDIT = 0.95;
const pathGrids = new WeakMap<Bench, SegGrid>();
/**
 * Share of a contour (sampled every quarter segment) lying ≤ 0.3 mm from a source line that is not
 * ANOTHER size's line (truth size `rank`, common, cutting / internal lines, or a line drawn once that
 * serves `rank` too) — the contour runs on its own size's lines. Independent of the
 * truth contours (which F4 built on the encoded original and can be noise, see NOISE).
 */
function ownShare(b: Bench, o: PtMm[], rank: number, miss?: PtMm[]): number {
  let grid = pathGrids.get(b);
  const pts = (k: number) => (b.sheet.paths[k].closed ? [...b.sheet.paths[k].pts, b.sheet.paths[k].pts[0]] : b.sheet.paths[k].pts);
  if (!grid) {
    grid = new SegGrid(4);
    for (let k = 0; k < b.sheet.paths.length; k++) grid.addPolyline(k, pts(k));
    pathGrids.set(b, grid);
  }
  let own = 0;
  let tot = 0;
  const oo = [...o, o[0]];
  for (let i = 0; i + 1 < oo.length; i++)
    for (let u = 0; u < 1; u += 0.25) {
      const q = { x: oo[i].x + (oo[i + 1].x - oo[i].x) * u, y: oo[i].y + (oo[i + 1].y - oo[i].y) * u };
      let hit = false;
      let onLine = false;
      // within the contour tolerance (p95 ≤ 1 mm): sizes drawn within a millimetre of each other
      // are one line for the cut
      grid.near(q, PROV_MM, (pk, j) => {
        if (hit) return;
        const pp = pts(pk);
        if (segNearest(q, pp[j], pp[j + 1]).d > PROV_MM) return;
        onLine = true;
        const t = b.truth[b.origOfPath[b.sheet.paths[pk].id]];
        // provenance asks one thing: is this stretch on ANOTHER size's line? common lines, the
        // variant's cutting lines and every other non-size line are not
        if (t.role !== 'size' || t.rank === rank) hit = true;
      });
      // a line drawn ONCE for several sizes carries one size's label in the original: it serves
      // this size too when this size has no line of its own within SHARED_REACH_MM here
      if (!hit && onLine) {
        let ownNear = false;
        grid.near(q, SHARED_REACH_MM, (pk, j) => {
          if (ownNear) return;
          const t = b.truth[b.origOfPath[b.sheet.paths[pk].id]];
          if (t.role !== 'size' || t.rank !== rank) return;
          const pp = pts(pk);
          if (segNearest(q, pp[j], pp[j + 1]).d <= SHARED_REACH_MM) ownNear = true;
        });
        if (!ownNear) hit = true;
      }
      tot++;
      if (hit) own++;
      else {
        miss?.push(q);
        if (process.env.MISSDBG) {
          const roles: string[] = [];
          grid.near(q, 1.5, (pk, j) => {
            const pp = pts(pk);
            const d = segNearest(q, pp[j], pp[j + 1]).d;
            if (d > 1.5) return;
            const t = b.truth[b.origOfPath[b.sheet.paths[pk].id]];
            roles.push(`${t.role}${t.rank ?? ''}@${d.toFixed(2)}`);
          });
          console.log(`        miss r${rank} (${q.x.toFixed(0)},${q.y.toFixed(0)}) ${[...new Set(roles)].slice(0, 6).join(' ')}`);
        }
      }
    }
  return tot ? own / tot : 0;
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

const fillOpts = (variant: string | null, grade: FillOpts['grade'], expected?: ExpectedSizes): FillOpts => ({
  cellMm: PATIMPORT.fillCellMm,
  snapMm: PATIMPORT.snapMm,
  variant,
  grade,
  ...(expected ? { expectedSizes: expected } : {}),
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

/**
 * The worker's path: the size run from the chains, the expected size count from the source, else
 * the card (`cardN` sizes; 0 = an empty card run, nobody answered → expected unknown).
 */
function runFill(b: Bench, mode: FillOpts['grade'], cardN: number = b.n) {
  const t0 = Date.now();
  const { set, run: read } = chainsOf(b);
  const expected = expectedSizes(read, cardOf(cardN), null, set) ?? undefined;
  const run = runForExpected(read, expected ?? null);
  const { families, diag } = fillPiecesDetailed(b.sheet, set, run, b.seeds, fillOpts(VARIANT[b.sample] ?? null, mode, expected));
  return { set, run, families, diag, ms: Date.now() - t0, expected };
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
        return [seedLabel(sd) ?? String(sd.id), `${x.accepted ? 'ok' : x.refusal} ${x.reason} comps=${x.components.length} best=${ar} cm² nest=${x.chosen?.nest?.toFixed(3)} alt=${x.alternatives.map((a) => `${a.score.toFixed(1)}/${a.nest?.toFixed(2)}`).join(',')} score=${x.chosen?.score.toFixed(1)}`];
      }),
    ),
    ms,
  };
}

function printRow(r: RunRow) {
  const s = r.score;
  console.log(
    `${r.sample.padEnd(10)} ${r.level} ${r.mode.padEnd(8)} n=${r.n} produced=${s.produced} closed=${s.closed} correct=${s.correct} WRONG=${s.wrong} prov=${s.provenance.length} unknown=${s.unknown} refused=${s.refused} leaks=${s.leaks} | acc ${s.correctAcc}/${s.withTruth} = ${pct(s.withTruth ? s.correctAcc / s.withTruth : 0)}` +
      (r.ranks ? ` | rankAcc ${pct(r.ranks.rankAcc)} wrong ${pct(r.ranks.rankWrong)} unresolved ${pct(r.ranks.rankUnresolved)}` : '') +
      ` | refused ${JSON.stringify(r.refused)} amb ${r.ambiguities}${r.sizeCountAmb ? ' size-count' : ''} | ${(r.ms / 1000).toFixed(1)} s`,
  );
  if (r.diag) console.log(`      step0 ${r.diag.step0} reach ${r.diag.reach.toFixed(0)} tracks ${r.diag.tracks} full ${r.diag.fullTuples} parity ${r.diag.parityConflicts} lane ${r.diag.laneConflicts} bandMode ${r.diag.bandMode}`);
  for (const [k, v] of Object.entries(s.perPiece)) console.log(`      ${k.padEnd(6)} ${v.padEnd(10)} ${r.reasons[k] ?? ''}`);
  if (s.wrongList.length) console.log(`      wrong: ${s.wrongList.join(' ')}`);
  if (s.noiseWrong.length) console.log(`      differs from truth-noise: ${s.noiseWrong.join(' ')}`);
  if (s.audited.length) console.log(`      audited truth overrides (judged by own lines ≥ ${OWN_AUDIT * 100}%): ${s.audited.join(' · ')}`);
  if (s.provenance.length) console.log(`      provenance below ${OWN_MIN * 100}% (not correct): ${s.provenance.join(' · ')}`);
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
    for (const c of tc) if (!process.env.TRUTHRANK || c.rank === +process.env.TRUTHRANK) ts.push({ pts: c.outer, closed: true, color: '#00a', width: 0.6, dash: '4 3' });
    const zb = process.env.ZOOMBOX?.split(',').map(Number);
    const zbox = zb ? { minX: zb[0], minY: zb[1], maxX: zb[2], maxY: zb[3] } : box;
    renderPng(resolve(dir, `${b.sample}-${b.level}-truth-${lab}${zb ? '-zoom' : ''}.png`), zbox, ts, [{ at: sd.at, text: lab, color: '#00f', size: 14 }], zb ? +(process.env.PX ?? 4) : 2);
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

/** families of the last solve per sample/level (controls reuse them for the shuffled truth) */
const SOLVED = new Map<string, PieceFamily[]>();

function solve(rest: string[]): RunRow[] {
  const rows: RunRow[] = [];
  const zi = rest.indexOf('--zoom');
  const zoom = zi >= 0 ? rest[zi + 1].split(',') : [];
  for (const L of levelsOf(rest))
    for (const id of samplesOf(rest)) {
      const b = loadBench(id, L);
      const f = runFill(b, 'solve');
      SOLVED.set(`${id}-${L}`, f.families);
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
      // the card says one size fewer / more than the drawing has, or nothing at all (an empty card
      // run nobody answered: the count is unknown — graded-looking pieces must be refused)
      for (const [tag, n] of [['n-1', b.n - 1], ['n+1', b.n + 1], ['nocount', 0]] as const) {
        const f = runFill(b, 'solve', n);
        // the truth is in b.n ranks: a closed contour is wrong unless it is the truth's same rank
        const row = summarize(b, tag, f.families, f.diag, f.ms, n);
        printRow(row);
        out.push(row);
      }
      // shuffled truth: rescore the real run against permuted rank labels
      const fam = SOLVED.get(`${id}-${L}`) ?? runFill(b, 'solve').families;
      const got = gotOf(b, fam);
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

/** The adversarial fixtures (grade-fixtures.ts) + the bench solved with maxFree below its component count. */
function fixtures() {
  const out = runFixtures(() =>
    (['robe', 'kombinezon'] as const).map((id) => {
      const b = loadBench(id, 'L1');
      const f = runFill(b, 'solve');
      const sc = scoreContours(b, gotOf(b, f.families));
      return { name: `${id} L1`, wrong: sc.wrongList, note: Object.entries(sc.perPiece).map(([k, v]) => `${k}:${v}`).join(' ') };
    }),
  );
  for (const f of out) console.log(`fixture ${f.ok ? 'ok  ' : 'FAIL'} ${f.name.padEnd(34)} ${f.why}`);
  return out;
}

/** Encoded inputs: the hook stays out and F4's output is byte-identical with grade 'solve' vs 'off'. */
function encoded() {
  const out: unknown[] = [];
  const f4cache = resolve(tmpdir(), 'patimport-f4-cache');
  const extra = existsSync(f4cache)
    ? readdirSync(f4cache).filter((f) => /^prep-.*\.json$/.test(f)).map((f) => ({ id: `${f.replace(/^prep-|\.json$/g, '')} (F4 probe cache)`, file: resolve(f4cache, f) }))
    : [];
  const list = [
    ...['robe', 'kombinezon', 'palto', 'reef', 'polupalto'].map((id) => ({ id, file: resolve(PREP, `prep-${id}.json`) })),
    ...extra,
  ];
  for (const { id: label, file } of list) {
    const id = label.split(/[- ]/)[0];
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
    console.log(`${label.padEnd(30)} encoded: F4 mode ${a.mode}, hook invoked ${c.hook}, families byte-identical ${same} (${a.json.length} bytes)`);
    out.push({ sample: label, mode: a.mode, hook: c.hook, identical: same });
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
  const ci = rest.indexOf('--chain');
  if (ci >= 0) {
    const c = set.chains[+rest[ci + 1]];
    const f = (p: PtMm) => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`;
    console.log(`chain c${c.id} len ${c.lengthMm.toFixed(1)} pts ${c.pts.length} ${f(c.pts[0])} → ${f(c.pts[c.pts.length - 1])}`);
    for (const r of c.ranges) {
      const q = b.sheet.paths[r.path];
      const t = b.truth[b.origOfPath[r.path]];
      console.log(`  path ${r.path} ${t.role}${t.rank ?? ''} ${f(q.pts[0])} → ${f(q.pts[q.pts.length - 1])} n=${q.pts.length}`);
    }
    for (const e of M.els.filter((x) => x.chain === c.id)) console.log(`  element e${e.id} [${e.from.toFixed(1)}..${e.to.toFixed(1)}]`);
  }
  const ei = rest.indexOf('--ends');
  if (ei >= 0) {
    const [x, y] = rest[ei + 1].split(',').map(Number);
    for (const e of M.els)
      for (const end of [0, 1] as const) {
        const p = end ? e.pts[e.pts.length - 1] : e.pts[0];
        const d = Math.hypot(p.x - x, p.y - y);
        if (d > 4) continue;
        const q = end ? e.pts[Math.max(0, e.pts.length - 4)] : e.pts[Math.min(e.pts.length - 1, 3)];
        const tr = M.tracks.find((t) => t.items.some((it) => it.el === e.id));
        console.log(`  end e${e.id}.${end} chain c${e.chain} truth ${truthOfChain(e.chain)} at (${p.x.toFixed(2)},${p.y.toFixed(2)}) d=${d.toFixed(2)} out→(${(p.x - q.x).toFixed(2)},${(p.y - q.y).toFixed(2)}) len ${(e.to - e.from).toFixed(1)} track t${tr?.id}`);
      }
  }
  if (rest.includes('--purity')) {
    for (const [tr, pu] of [...M.purity].sort((a, b2) => a[1] - b2[1])) {
      if (pu > (process.env.PUMAX ? +process.env.PUMAX : 0.95)) continue;
      const t = M.tracks[tr];
      const truth = [...new Set(t.items.map((it) => truthOfChain(M.els[it.el].chain)))].join('+');
      const fin = [...new Set((M.samplesOf.get(tr) ?? []).map((_, i) => ranksAt(M, tr, i, G.bits).join('') || '_'))].slice(0, 4).join('/');
      console.log(`  purity t${tr} ${pu.toFixed(2)} len ${t.lengthMm.toFixed(0)} truth ${truth} final ${fin}`);
    }
  }
  // per-element truth: nearest stripped path at the element's samples
  const pg = new SegGrid(4);
  const ppts = b.sheet.paths.map((q) => (q.closed ? [...q.pts, q.pts[0]] : q.pts));
  ppts.forEach((q, k) => pg.addPolyline(k, q));
  const elTruth = (ei: number) => {
    const e = M.els[ei];
    const w = new Map<string, number>();
    for (let k = 0; k < e.pts.length; k++) {
      const q = e.pts[k];
      let best = -1;
      let bd = 0.2;
      pg.near(q, 0.2, (pk, j) => {
        const d = segNearest(q, ppts[pk][j], ppts[pk][j + 1]).d;
        if (d < bd) {
          bd = d;
          best = pk;
        }
      });
      if (best < 0) continue;
      const t = b.truth[b.origOfPath[b.sheet.paths[best].id]];
      const key = `${t.role[0]}${t.rank ?? ''}`;
      w.set(key, (w.get(key) ?? 0) + 1);
    }
    return [...w].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}${w.size > 1 ? `:${v}` : ''}`).join('|');
  };
  const xi = rest.indexOf('--elements');
  if (xi >= 0)
    for (const tr of rest[xi + 1].split(',').map(Number)) {
      const t = M.tracks[tr];
      console.log(`track t${tr} rank0=${M.rank0[tr]} sub=${M.subOf[tr]} final=${[...new Set((M.samplesOf.get(tr) ?? []).map((_, i) => ranksAt(M, tr, i, G.bits).join('') || '_'))].join('/')}: ${t.items.map((it) => `e${it.el}[${elTruth(it.el)}]${process.env.XY ? `(${M.els[it.el].pts[0].x.toFixed(1)},${M.els[it.el].pts[0].y.toFixed(1)})` : ''}`).join(' ')}`);
    }
  const ti = rest.indexOf('--track');
  if (ti >= 0) {
    const tr = +rest[ti + 1];
    const t = M.tracks[tr];
    console.log(`track t${tr} len ${t.lengthMm.toFixed(0)} closed ${t.closed} items ${t.items.map((it) => `e${it.el}(c${M.els[it.el].chain}${it.rev ? 'r' : ''} ${it.at.toFixed(0)}+${it.L.toFixed(0)} truth ${truthOfChain(M.els[it.el].chain)})`).join(' ')}`);
    for (const it of t.items) {
      const e = M.els[it.el];
      const f = (p: PtMm) => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`;
      console.log(`   e${it.el} chain c${e.chain} [${e.from.toFixed(1)}..${e.to.toFixed(1)}] ${f(e.pts[0])} → ${f(e.pts[e.pts.length - 1])} chainRanges ${set.chains[e.chain].ranges.length}`);
    }
    for (const s of (M.samplesOf.get(tr) ?? []).filter((_, i) => i % +(process.env.EVERY ?? 10) === 0))
      console.log(`  u=${s.u.toFixed(0)} p=(${s.p.x.toFixed(0)},${s.p.y.toFixed(0)}) lanes ${s.lanes.map((l) => `t${l.track}@${l.s.toFixed(1)}`).join(' ')} sets ${(M.sets.get(tr)?.[s.idx] ?? []).map((e) => `c${e.comp}:${e.ranks.join('')}`).join(' ')}`);
  }
  for (const lab of labs.split(',')) {
    const sd = seeds.find((s) => seedLabel(s) === lab);
    const gs = G.seeds.find((s) => s.seed === sd?.id);
    if (!sd || !gs) continue;
    {
      const ps = portionPts(M, G.bits, tracksIn(M, gs.box).inBox);
      const { masks } = rankMasks(gs.box, 0.5, ps, b.n, sd.at);
      console.log(`  nest pairs (excess/growth px): ${nestPairs(masks).map((q) => `r${q.r}:${q.excess}/${q.growth}`).join(' ')}`);
    }
    console.log(`  comp support: ${gs.components.map((c) => `c${c}:${M.compSupport[c]}`).join(' ')}`);
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
      const fin = (M.samplesOf.get(t.id) ?? []).map((_, i) => ranksAt(M, t.id, i, G.bits).join('') || '_');
      if (rest.includes('--tracks'))
        console.log(`  t${t.id} len=${t.lengthMm.toFixed(0)} truth=${tr} FINAL=${[...new Set(fin)].slice(0, 6).join('/')} rank0=${M.rank0[t.id]} comp=${M.compOf[t.id]}/${M.compOfSet.get(t.id) ?? ''} common=${M.common.has(t.id)} frame=${M.frames.has(t.id)} lanes=${(M.samplesOf.get(t.id) ?? []).map((s) => s.lanes.length).join('').slice(0, 40)} sets=${(M.sets.get(t.id) ?? []).map((e) => e.map((x) => x.ranks.join('')).join('/') || '_').join(' ').slice(0, 160)}`);
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
  if (process.env.HOOK_DEBUG) HOOK_DEBUG.on = true;
  if (process.env.GRADE_ONE_READING) GRADE_TUNING.twoReadings = false;
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
  else if (mode === 'runinfo') {
    for (const L of levelsOf(rest))
      for (const id of samplesOf(rest)) {
        const b = loadBench(id, L);
        const { set, run } = chainsOf(b);
        const ex = expectedSizes(run, cardOf(b.n), null, set);
        console.log(`${id} ${L}: encoding ${run.encoding} sizes ${run.sizes.length} [${run.sizes.map((z) => z.label || '·').join(',')}] classes ${set.classes.map((c) => `${c.role}${c.chains.length}`).join(' ')} expected ${JSON.stringify(ex)} truth n ${b.n}`);
      }
    return 0;
  } else if (mode === 'fixtures') {
    const fx = fixtures();
    return fx.every((f) => f.ok) ? 0 : 1;
  } else if (mode === 'all') {
    const data = {
      at: new Date().toISOString(),
      baseline: baseline(rest),
      solve: solve(rest),
      controls: controls(rest),
      encoded: encoded(),
      fixtures: fixtures(),
    };
    writeFileSync(resolve(mk(OUT), 'REPORT-data.json'), JSON.stringify(data, null, 1));
    const sol = data.solve as RunRow[];
    const guard = (data.baseline as RunRow[]).filter((r) => r.mode === 'guard');
    const ctl = data.controls as { mode: string; score?: Score; sizeCountAmb?: boolean; real?: { correct: number }; shuffled?: { correct: number } }[];
    const enc = data.encoded as { sample: string; hook: boolean; identical: boolean }[];
    const wrong = [...sol, ...guard].reduce((a, r) => a + r.score.wrong, 0);
    const ctlWrong = ctl.reduce((a, r) => a + (r.score?.wrong ?? 0), 0);
    const ctlNoAmb = ctl.filter((r) => r.score && !r.sizeCountAmb).length;
    const encBad = enc.filter((r) => r.hook || !r.identical).map((r) => r.sample);
    // the gate: SAFETY (no wrong closed contour anywhere, every control raises the size-count
    // question and closes nothing wrong, encoded inputs untouched, the adversarial fixtures hold)
    // AND the documented accuracy targets. `--informational` reports accuracy without failing on it.
    const fx = data.fixtures as { name: string; ok: boolean; why: string }[];
    const fxBad = fx.filter((f) => !f.ok).map((f) => f.name);
    const safe = wrong === 0 && ctlWrong === 0 && ctlNoAmb === 0 && encBad.length === 0 && fxBad.length === 0;
    console.log(`\nH1 safety: wrong closed ${wrong} (solve + guard), controls wrong ${ctlWrong}, controls without size-count ambiguity ${ctlNoAmb}, encoded regressions ${encBad.length ? encBad.join(' ') : 'none'}, fixtures failing ${fxBad.length ? fxBad.join(' ') : 'none'} → ${safe ? 'PASS' : 'FAIL'}`);
    let accurate = true;
    for (const r of sol) {
      if (!ACCEPT_SAMPLES.includes(r.sample)) continue;
      const acc = r.score.withTruth ? r.score.correctAcc / r.score.withTruth : 0;
      const target = r.level === 'L1' ? 0.9 : 0.75;
      if (acc < target) accurate = false;
      console.log(`H1 accuracy ${r.sample.padEnd(10)} ${r.level}: ${r.score.correctAcc}/${r.score.withTruth} = ${pct(acc)} (target ${pct(target)}) ${acc >= target ? 'met' : 'NOT MET'}`);
    }
    const informational = rest.includes('--informational');
    console.log(`H1 gate: safety ${safe ? 'PASS' : 'FAIL'}, accuracy ${accurate ? 'PASS' : 'NOT MET'}${informational ? ' (informational run: accuracy not gated)' : ''}`);
    return safe && (accurate || informational) ? 0 : 1;
  } else {
    console.log('modes: all | baseline | solve | controls | encoded');
    return 1;
  }
  return 0;
}
