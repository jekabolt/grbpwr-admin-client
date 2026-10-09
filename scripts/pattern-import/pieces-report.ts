// PATTERN-IMPORT · F4 probe — acceptance run: every sample, truth comparison, negative control,
// overlays → reports/F4-<date>.json + F4.md + F4-shots/*.png. Probe-only.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  fillPiecesDetailed,
  proposeSeeds,
  proposeVariants,
  seedLabel,
} from 'lib/pattern-import/pieces';
import type { PieceCandidate, PieceFamily, Seed } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { CORPUS, REPORTS, type Prepared, type Sample } from './pieces-entry';
import { clickSeeds, fillSample, renderRun, type ClickFile, type SampleRun } from './pieces-run';

type Pick = (ids: string[]) => Sample[];
type Prep = (s: Sample, fresh?: boolean) => Promise<Prepared>;

/** How each sample is seeded in the acceptance run, and which truth rows count. */
const PLAN: Record<
  string,
  {
    truthId: string;
    seeds: 'text' | 'click';
    variant: string | null;
    truthVariant?: string;
    /** Truth labels that have no contour of their own on this sheet (with the reason). */
    skip?: Record<string, string>;
  }
> = {
  kombinezon: { truthId: 'kombinezon', seeds: 'text', variant: 'Style A', truthVariant: 'Style A' },
  robe: { truthId: 'robe', seeds: 'text', variant: null },
  palto: {
    truthId: 'palto',
    seeds: 'text',
    variant: null,
    skip: {
      '21 (traced)': 'facing and pocket bag are traced from 21 — no contour of their own (K0)',
    },
  },
  viola: { truthId: 'viola', seeds: 'text', variant: null },
  reef: { truthId: 'reef', seeds: 'text', variant: null },
  r4454: {
    truthId: 'r4454',
    seeds: 'click',
    variant: null,
    skip: {
      '9': 'cut by dimensions, no contour (K0)',
      '11': 'cut by dimensions, no contour (K0)',
      'I-1': 'interfacing sheet (sheet 1), not this sheet',
      'I-2': 'interfacing sheet (sheet 1), not this sheet',
      'I-3': 'interfacing sheet (sheet 1), not this sheet',
      'I-4': 'interfacing sheet (sheet 1), not this sheet',
    },
  },
  blazer: { truthId: 'blazer', seeds: 'click', variant: null },
  redcafe: {
    truthId: 'redcafe_tolstovka',
    seeds: 'click',
    variant: null,
    skip: { подкладка: 'role unclear in K0, no click placed' },
  },
  wm: { truthId: 'wm_kka_15_01', seeds: 'click', variant: null },
};

type TruthPiece = { label: string; name_en?: string; bbox_mm_est?: string | null };

function truthPieces(truthId: string, variant?: string): TruthPiece[] {
  const t = JSON.parse(readFileSync(resolve(CORPUS, 'truth.json'), 'utf8')) as {
    samples: { id: string; variants: { name: string; pieces?: TruthPiece[] }[] }[];
  };
  const s = t.samples.find((x) => x.id === truthId);
  if (!s) return [];
  const v = (variant && s.variants.find((x) => x.name.startsWith(variant))) || s.variants[0];
  return v.pieces ?? [];
}

const normLabel = (l: string) =>
  l
    .replace(/^piece\s+/i, '')
    .replace(/\.$/, '')
    .trim()
    .toUpperCase();

function bboxEst(s?: string | null): [number, number] | null {
  const m = s?.match(/(\d{2,4})\s*x\s*(\d{2,4})/);
  return m ? [+m[1], +m[2]] : null;
}

const passes = (c: PieceCandidate) =>
  c.outcome === 'closed' &&
  c.sourceCoverage >= PATIMPORT.coverageBlock &&
  c.p95Mm <= PATIMPORT.hausdorffP95VectorMm;

type Row = {
  label: string;
  name: string;
  seed: string;
  outcomes: string;
  passed: number;
  ranks: number;
  monotone: boolean;
  minCoverage: number | null;
  maxP95: number | null;
  areasCm2: number[];
  bboxLargest: [number, number] | null;
  bboxTruth: [number, number] | null;
  bboxOk: boolean | null;
  rankFrom: string;
  leaks: { rank: number; at: [number, number] }[];
  note?: string;
};

function rowsOf(sr: SampleRun, truth: TruthPiece[], skip: Record<string, string>): Row[] {
  const n = sr.diag.model.n;
  return truth.map((tp) => {
    const lab = normLabel(tp.label);
    const bt = bboxEst(tp.bbox_mm_est);
    if (skip[tp.label])
      return {
        label: tp.label,
        name: tp.name_en ?? '',
        seed: '-',
        outcomes: '',
        passed: 0,
        ranks: 0,
        monotone: true,
        minCoverage: null,
        maxP95: null,
        areasCm2: [],
        bboxLargest: null,
        bboxTruth: bt,
        bboxOk: null,
        rankFrom: '',
        leaks: [],
        note: `not traceable: ${skip[tp.label]}`,
      };
    const seed = sr.seeds.find((s) => normLabel(seedLabel(s) ?? '') === lab);
    const fam: PieceFamily | undefined = seed && sr.families.find((f) => f.seed === seed.id);
    const c = fam?.candidates ?? [];
    const closed = c.filter((x) => x.outcome === 'closed');
    const big = closed.length ? closed.reduce((a, b) => (b.areaMm2 > a.areaMm2 ? b : a)) : null;
    const bl: [number, number] | null = big
      ? [Math.round(big.bbox.maxX - big.bbox.minX), Math.round(big.bbox.maxY - big.bbox.minY)]
      : null;
    let bboxOk: boolean | null = null;
    if (bl && bt) {
      const a = [...bl].sort((x, y) => x - y);
      const b = [...bt].sort((x, y) => x - y);
      bboxOk = a.every((v, i) => Math.abs(v - b[i]) <= 0.25 * b[i] + 15);
    }
    const OC: Record<string, string> = { closed: 'C', leak: 'L', merged: 'M', tiny: 't' };
    return {
      label: tp.label,
      name: tp.name_en ?? '',
      seed: seed ? seed.origin : 'none',
      outcomes: c
        .map((x) => (passes(x) ? 'C' : x.outcome === 'closed' ? 'c' : OC[x.outcome]))
        .join(''),
      passed: c.filter(passes).length,
      ranks: n,
      monotone: fam?.monotone ?? false,
      minCoverage: closed.length
        ? +Math.min(...closed.map((x) => x.sourceCoverage)).toFixed(3)
        : null,
      maxP95: closed.length ? +Math.max(...closed.map((x) => x.p95Mm)).toFixed(3) : null,
      areasCm2: c.map((x) => Math.round(x.areaMm2 / 100)),
      bboxLargest: bl,
      bboxTruth: bt,
      bboxOk,
      rankFrom: [
        ...new Set(c.filter((x) => x.outcome === 'closed').map((x) => x.rankFrom ?? '')),
      ].join('+'),
      leaks: c
        .filter((x) => x.outcome === 'leak' && x.leakAt)
        .map((x) => ({
          rank: x.rank,
          at: [Math.round(x.leakAt!.x), Math.round(x.leakAt!.y)] as [number, number],
        })),
      note: !seed ? 'no seed (no text label found)' : undefined,
    };
  });
}

/** Negative control: drop one wall of a closed candidate → that rank must leak, not close otherwise. */
function negative(p: Prepared, sr: SampleRun, label: string) {
  const seed = sr.seeds.find((s) => normLabel(seedLabel(s) ?? '') === label);
  const fam = seed && sr.families.find((f) => f.seed === seed.id);
  const ok = fam?.candidates.filter((c) => c.outcome === 'closed') ?? [];
  if (!seed || !ok.length) return { label, result: 'no closed candidate to test', pass: false };
  const cand = ok[Math.floor(ok.length / 2)];
  // the longest own-rank wall (a size line of this rank, not a shared one)
  const own = new Set(
    p.set.classes
      .filter((c) => c.role === 'size')
      .find((c) => c.id === p.run.sizes[cand.rank]?.classId)?.chains ?? [],
  );
  const pick = cand.walls
    .filter((w) => own.has(w))
    .sort((a, b) => p.set.chains[b].lengthMm - p.set.chains[a].lengthMm)[0];
  const wall =
    pick ?? [...cand.walls].sort((a, b) => p.set.chains[b].lengthMm - p.set.chains[a].lengthMm)[0];
  const { families } = fillPiecesDetailed(
    p.sheet,
    p.set,
    p.run,
    [seed],
    { cellMm: PATIMPORT.fillCellMm, snapMm: PATIMPORT.snapMm, variant: sr.variant },
    undefined,
    { exclude: [wall] },
  );
  const after = families[0]?.candidates.find((c) => c.rank === cand.rank);
  const res = after
    ? after.outcome === 'closed'
      ? `CLOSED again (area ${(after.areaMm2 / 100).toFixed(0)} vs ${(cand.areaMm2 / 100).toFixed(0)} cm², coverage ${after.sourceCoverage.toFixed(3)})`
      : `${after.outcome}${after.leakAt ? ` at ${after.leakAt.x.toFixed(0)},${after.leakAt.y.toFixed(0)}` : ''}`
    : 'missing';
  return {
    label,
    rank: cand.rank,
    removedChain: wall,
    removedLengthMm: Math.round(p.set.chains[wall].lengthMm),
    result: res,
    pass: !!after && after.outcome === 'leak',
  };
}

export async function runAll(rest: string[], pick: Pick, prepare: Prep): Promise<number> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const shots = resolve(REPORTS, 'F4-shots');
  mkdirSync(shots, { recursive: true });
  const here = resolve(process.env.PATIMPORT_REPO ?? process.cwd(), 'scripts/pattern-import');
  const clicks = JSON.parse(
    readFileSync(resolve(here, 'fixtures/pieces-clicks.json'), 'utf8'),
  ) as ClickFile;
  const ids = rest.length ? rest : Object.keys(PLAN);
  const out: Record<string, unknown>[] = [];
  const negs: Record<string, unknown>[] = [];
  for (const s of pick(ids)) {
    const plan = PLAN[s.id];
    if (!plan) continue;
    const p = await prepare(s);
    const seeds: Seed[] =
      plan.seeds === 'text' ? proposeSeeds(p.sheet, p.set) : clickSeeds(clicks, s.id);
    const textSeeds = plan.seeds === 'text' ? seeds.length : proposeSeeds(p.sheet, p.set).length;
    const sr = fillSample(p, seeds, plan.variant);
    const truth = truthPieces(plan.truthId, plan.truthVariant);
    const rows = rowsOf(sr, truth, plan.skip ?? {});
    const traceable = rows.filter((r) => !r.note?.startsWith('not traceable'));
    const total = traceable.reduce((a, r) => a + r.ranks, 0);
    const passed = traceable.reduce((a, r) => a + r.passed, 0);
    const full = traceable.filter((r) => r.passed === r.ranks && r.monotone).length;
    const file = resolve(shots, `${s.id}.png`);
    renderRun(sr, file);
    const extra = sr.families
      .filter((f) => {
        const sd = sr.seeds.find((x) => x.id === f.seed);
        return !truth.some((t) => normLabel(t.label) === normLabel(seedLabel(sd!) ?? ''));
      })
      .map((f) => seedLabel(sr.seeds.find((x) => x.id === f.seed)!) ?? '?');
    const rec = {
      sample: s.id,
      seeds: plan.seeds,
      textSeedsFound: textSeeds,
      variant: plan.variant,
      variants: proposeVariants(p.sheet, p.set, p.docTexts).map((v) => ({
        label: v.label,
        knives: v.knives.length,
      })),
      encoding: p.run.encoding,
      sizes: p.run.sizes.map((x) => x.label),
      mode: sr.diag.model.mode,
      emptyRanks: sr.diag.model.emptyRanks,
      rerank: sr.diag.reranked ?? null,
      framesDropped: sr.diag.frames.length,
      rescuedIgnore: sr.diag.rescued,
      ms: sr.diag.ms,
      truthPieces: truth.length,
      traceable: traceable.length,
      candidates: total,
      passed,
      closedShare: total ? +(passed / total).toFixed(3) : 0,
      fullFamilies: full,
      extraSeeds: extra,
      rows,
      overlay: file,
    };
    out.push(rec);
    console.log(
      `${s.id.padEnd(10)} ${plan.seeds} seeds=${seeds.length} pieces ${full}/${traceable.length} full, candidates ${passed}/${total} (${((100 * passed) / Math.max(1, total)).toFixed(0)} %) ${sr.diag.ms} ms`,
    );
    for (const r of rows)
      console.log(
        `   ${r.label.padEnd(16)} ${r.outcomes.padEnd(10)} ${r.monotone ? 'mono' : 'NON-MONO'} cov≥${r.minCoverage ?? '-'} p95≤${r.maxP95 ?? '-'} bbox ${r.bboxLargest?.join('×') ?? '-'} vs ${r.bboxTruth?.join('×') ?? '?'} ${r.note ?? ''}`,
      );
    if (s.id === 'palto') negs.push({ sample: 'palto', ...negative(p, sr, '22') });
    if (s.id === 'robe') negs.push({ sample: 'robe', ...negative(p, sr, '67') });
    if (s.id === 'kombinezon') negs.push({ sample: 'kombinezon', ...negative(p, sr, '1') });
  }
  for (const n of negs) console.log('negative control', JSON.stringify(n));
  const json = resolve(REPORTS, `F4-${date}.json`);
  writeFileSync(json, JSON.stringify({ date, samples: out, negative: negs }, null, 1));
  console.log(json);
  return 0;
}
