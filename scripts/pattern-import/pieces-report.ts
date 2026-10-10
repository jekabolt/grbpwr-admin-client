// PATTERN-IMPORT · F4 probe — acceptance run: every sample, truth comparison, negative control,
// overlays → reports/F4-<date>.json + F4.md + F4-shots/*.png. Probe-only.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  addBridge,
  applyPieceEdits,
  fillPiecesDetailed,
  ignoreChain,
  setWall,
  type PieceSession,
  proposeSeeds,
  proposeVariants,
  seedLabel,
} from 'lib/pattern-import/pieces';
import type {
  ChainId,
  ChainSet,
  PieceCandidate,
  PieceFamily,
  PtMm,
  Seed,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { CORPUS, REPORTS, type Prepared, type Sample } from './pieces-entry';
import {
  clickSeeds,
  fillOptsOf,
  fillSample,
  renderRun,
  type ClickFile,
  type OperatorOp,
  type SampleRun,
} from './pieces-run';

/** The chain nearest a sheet point (operator ops name walls by a point on them). */
function chainNear(set: ChainSet, x: number, y: number): ChainId {
  let best = -1;
  let bd = Infinity;
  for (const c of set.chains)
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a = c.pts[i];
      const b = c.pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = dx * dx + dy * dy;
      const u = L ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L)) : 0;
      const d = Math.hypot(x - a.x - u * dx, y - a.y - u * dy);
      if (d < bd) {
        bd = d;
        best = c.id;
      }
    }
  return best;
}

/** Apply the fixture's operator ops through the operator API; returns the session and a log. */
function operate(sr: SampleRun, ops: OperatorOp[]): { s: PieceSession; log: string[] } {
  let s: PieceSession = {
    sheet: sr.p.sheet,
    set: sr.p.set,
    run: sr.p.run,
    seeds: sr.seeds,
    opts: fillOptsOf(sr.p, sr.variant),
    walls: { exclude: [], include: [], bridges: [] },
    families: sr.families,
  };
  const log: string[] = [];
  for (const o of ops) {
    const before = s.families;
    if (o.op === 'setWall' || o.op === 'ignoreChain') {
      const id = chainNear(s.set, o.near[0], o.near[1]);
      s = o.op === 'setWall' ? setWall(s, id, o.rank ?? null) : ignoreChain(s, id);
      const touched = s.families.filter((f, i) => f !== before[i]).map((f) => f.seed);
      log.push(
        `${o.op}(${id}) → refilled seeds ${touched.map((t) => seedLabel(s.seeds.find((x) => x.id === t)!)).join(',')} — ${o.why}`,
      );
    } else {
      const sd = s.seeds.find((x) => seedLabel(x) === o.seed);
      if (!sd) continue;
      s = addBridge(s, sd.id, o.rank, { x: o.from[0], y: o.from[1] }, { x: o.to[0], y: o.to[1] });
      log.push(`addBridge(${o.seed}, r${o.rank}) — ${o.why}`);
    }
  }
  return { s, log };
}

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
    fillOptsOf(sr.p, sr.variant),
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

/** Resample a polyline's arc position s → point. */
function atArc(pts: readonly PtMm[], s: number): { p: PtMm; i: number } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + L >= s) {
      const u = L ? (s - acc) / L : 0;
      return {
        p: {
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u,
        },
        i,
      };
    }
    acc += L;
  }
  return { p: pts[pts.length - 1], i: pts.length - 1 };
}

/**
 * Gap control (F4b auto-bridges): cut a gap of `gapMm` into the middle of the candidate's longest
 * own-rank wall and fill again. ≤ 3 mm must close again with a derived 'bridge'; longer must leak.
 */
function gapControl(p: Prepared, sr: SampleRun, label: string, gapMm: number) {
  const seed = sr.seeds.find((s) => normLabel(seedLabel(s) ?? '') === label);
  const fam = seed && sr.families.find((f) => f.seed === seed.id);
  const ok = fam?.candidates.filter((c) => c.outcome === 'closed') ?? [];
  if (!seed || !ok.length) return { label, gapMm, result: 'no closed candidate', pass: false };
  const cand = ok[Math.floor(ok.length / 2)];
  const own = new Set(
    p.set.classes
      .filter((c) => c.role === 'size')
      .find((c) => c.id === p.run.sizes[cand.rank]?.classId)?.chains ?? [],
  );
  const wall = cand.walls
    .filter((w) => own.has(w) && !p.set.chains[w].closed)
    .sort((a, b) => p.set.chains[b].lengthMm - p.set.chains[a].lengthMm)[0];
  if (wall === undefined) return { label, gapMm, result: 'no open own wall', pass: false };
  const c = p.set.chains[wall];
  const mid = c.lengthMm / 2;
  const a = atArc(c.pts, mid - gapMm / 2);
  const b = atArc(c.pts, mid + gapMm / 2);
  const first = [...c.pts.slice(0, a.i), a.p];
  const second = [b.p, ...c.pts.slice(b.i)];
  const nid = p.set.chains.length;
  const set: ChainSet = {
    ...p.set,
    chains: [
      ...p.set.chains.map((x) =>
        x.id === wall ? { ...x, pts: first, lengthMm: mid - gapMm / 2 } : x,
      ),
      { ...c, id: nid, pts: second, lengthMm: c.lengthMm - mid - gapMm / 2 },
    ],
    classes: p.set.classes.map((k) =>
      k.chains.includes(wall) ? { ...k, chains: [...k.chains, nid] } : k,
    ),
  };
  const { families } = fillPiecesDetailed(
    p.sheet,
    set,
    p.run,
    [seed],
    fillOptsOf(sr.p, sr.variant),
  );
  const after = families[0]?.candidates.find((x) => x.rank === cand.rank);
  const bridged = !!after?.derived?.some((d) => d.kind === 'bridge');
  const res = after
    ? `${after.outcome}${bridged ? ' with a derived bridge' : ''}${after.outcome === 'closed' ? ` (area ${(after.areaMm2 / 100).toFixed(0)} vs ${(cand.areaMm2 / 100).toFixed(0)} cm²)` : ''}`
    : 'missing';
  // a gap too long to bridge is the operator's: addBridge over it refills this seed only
  let operator: string | undefined;
  let opPass = true;
  if (gapMm > 3 && after?.outcome === 'leak') {
    const ses: PieceSession = {
      sheet: p.sheet,
      set,
      run: p.run,
      seeds: [seed],
      opts: fillOptsOf(sr.p, sr.variant),
      walls: { exclude: [], include: [], bridges: [] },
      families,
    };
    const s2 = addBridge(ses, seed.id, cand.rank, a.p, b.p);
    const c2 = s2.families[0]?.candidates.find((x) => x.rank === cand.rank);
    const opB = !!c2?.derived?.some((d) => d.kind === 'operator-bridge');
    operator = `addBridge → ${c2?.outcome}${opB ? ' with an operator bridge' : ''}${c2?.outcome === 'closed' ? ` (area ${(c2.areaMm2 / 100).toFixed(0)} cm²)` : ''}`;
    opPass = c2?.outcome === 'closed' && opB;
  }
  return {
    label,
    rank: cand.rank,
    chain: wall,
    gapMm,
    result: res,
    operator,
    pass:
      (gapMm <= 3 ? after?.outcome === 'closed' && bridged : after?.outcome === 'leak') && opPass,
  };
}

/**
 * Band control (F4b band ladders): fill again with the band repair off; every family that is not a
 * band must come out identical (no real piece is cut by it).
 */
function bandControl(p: Prepared, sr: SampleRun) {
  const prev = process.env.F4_NOBANDS;
  process.env.F4_NOBANDS = '1';
  const { families } = fillPiecesDetailed(
    p.sheet,
    p.set,
    p.run,
    sr.seeds,
    fillOptsOf(sr.p, sr.variant),
  );
  if (prev === undefined) delete process.env.F4_NOBANDS;
  else process.env.F4_NOBANDS = prev;
  const sig = (f: PieceFamily) =>
    f.candidates.map((c) => `${c.outcome}:${Math.round(c.areaMm2 / 100)}`).join(' ');
  const changed: string[] = [];
  for (const f of sr.families) {
    const g = families.find((x) => x.seed === f.seed);
    if (!g || sig(f) !== sig(g))
      changed.push(seedLabel(sr.seeds.find((s) => s.id === f.seed)!) ?? '?');
  }
  return { changedFamilies: changed };
}

/** applyPieceEdits on real families: reseed keeps the piece, not-a-piece drops, split cuts a merge. */
function editChecks(p: Prepared, sr: SampleRun) {
  const ctx = {
    sheet: p.sheet,
    set: p.set,
    run: p.run,
    opts: fillOptsOf(sr.p, sr.variant),
  };
  const byLabel = (l: string) =>
    sr.seeds.find((s) => normLabel(seedLabel(s) ?? '') === normLabel(l));
  const areas = (f?: PieceFamily) =>
    f?.candidates.map((c) => `${c.outcome}:${Math.round(c.areaMm2 / 100)}`).join(' ');
  const res: Record<string, unknown>[] = [];
  if (p.sample.id === 'robe') {
    const s = byLabel('67')!;
    const before = sr.families.find((f) => f.seed === s.id);
    const after = applyPieceEdits(
      sr.families,
      [{ kind: 'reseed', seed: s.id, at: { x: s.at.x + 40, y: s.at.y - 30 } }],
      ctx,
    );
    const a2 = after.find((f) => f.seed === s.id);
    res.push({
      sample: 'robe',
      edit: 'reseed 67 (+40,-30 mm)',
      before: areas(before),
      after: areas(a2),
      pass: areas(before) === areas(a2),
    });
    const dropped = applyPieceEdits(sr.families, [{ kind: 'not-a-piece', seed: s.id }], ctx);
    res.push({
      sample: 'robe',
      edit: 'not-a-piece 67',
      families: `${sr.families.length} → ${dropped.length}`,
      pass: dropped.length === sr.families.length - 1,
    });
  }
  if (p.sample.id === 'blazer') {
    const s = byLabel('MANGA')!;
    const before = sr.families.find((f) => f.seed === s.id);
    const lasso = [
      { x: -10, y: 560 },
      { x: 780, y: 560 },
      { x: 780, y: 1035 },
      { x: -10, y: 1035 },
    ];
    const after = applyPieceEdits(
      sr.families,
      [{ kind: 'split', seed: s.id, lassoMm: lasso }],
      ctx,
    );
    const c = after.find((f) => f.seed === s.id)?.candidates[0];
    res.push({
      sample: 'blazer',
      edit: 'split MANGA (merged with CUELLO) by a lasso y 560–1035',
      before: areas(before),
      after: c
        ? `${c.outcome}:${Math.round(c.areaMm2 / 100)} cm² bbox ${Math.round(c.bbox.maxX - c.bbox.minX)}×${Math.round(c.bbox.maxY - c.bbox.minY)} coverage ${c.sourceCoverage.toFixed(3)}`
        : 'none',
      pass: !!c && c.outcome === 'closed',
    });
  }
  return res;
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
  const edits: Record<string, unknown>[] = [];
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
    const passedAny = traceable.reduce((a, r) => a + r.passed, 0);
    // headline: gate-passing candidates of families whose areas grow with rank (G8)
    const passed = traceable.reduce((a, r) => a + (r.monotone ? r.passed : 0), 0);
    const full = traceable.filter((r) => r.passed === r.ranks && r.monotone).length;
    const autoFamilies = sr.families;
    // operator-assisted: the fixture's wall edits through the operator API (F13c's calls)
    const ops = plan.seeds === 'click' ? clicks[s.id]?.operator ?? [] : [];
    let operator: Record<string, unknown> | null = null;
    if (ops.length) {
      const { s: ses, log } = operate(sr, ops);
      const sr2: SampleRun = { ...sr, families: ses.families };
      const rows2 = rowsOf(sr2, truth, plan.skip ?? {}).filter(
        (r) => !r.note?.startsWith('not traceable'),
      );
      const passed2 = rows2.reduce((a, r) => a + (r.monotone ? r.passed : 0), 0);
      operator = {
        ops: log,
        passed: passed2,
        closedShare: total ? +(passed2 / total).toFixed(3) : 0,
        fullFamilies: rows2.filter((r) => r.passed === r.ranks && r.monotone).length,
        rows: rows2.map((r) => `${r.label} ${r.outcomes}${r.monotone ? '' : '¬m'}`),
      };
      sr.families = ses.families;
      for (const l of log) console.log(`   operator: ${l}`);
      console.log(
        `   with operator edits: candidates ${passed2}/${total} (${((100 * passed2) / Math.max(1, total)).toFixed(0)} %)`,
      );
    }
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
      passedIgnoringMonotone: passedAny,
      closedShare: total ? +(passed / total).toFixed(3) : 0,
      fullFamilies: full,
      extraSeeds: extra,
      operator,
      rows,
      overlay: file,
    };
    out.push(rec);
    console.log(
      `${s.id.padEnd(10)} ${plan.seeds} seeds=${seeds.length} pieces ${full}/${traceable.length} full, candidates ${passed}/${total} (${((100 * passed) / Math.max(1, total)).toFixed(0)} %; ${passedAny} ignoring monotone) ${sr.diag.ms} ms`,
    );
    for (const r of rows)
      console.log(
        `   ${r.label.padEnd(16)} ${r.outcomes.padEnd(10)} ${r.monotone ? 'mono' : 'NON-MONO'} cov≥${r.minCoverage ?? '-'} p95≤${r.maxP95 ?? '-'} bbox ${r.bboxLargest?.join('×') ?? '-'} vs ${r.bboxTruth?.join('×') ?? '?'} ${r.note ?? ''}`,
      );
    if (s.id === 'palto') negs.push({ sample: 'palto', ...negative(p, sr, '22') });
    if (s.id === 'robe')
      for (const gap of [2, 5])
        negs.push({ sample: 'robe', control: 'gap', ...gapControl(p, sr, '67', gap) });
    if (s.id === 'palto')
      for (const gap of [2, 5])
        negs.push({ sample: 'palto', control: 'gap', ...gapControl(p, sr, '22', gap) });
    if (['robe', 'palto', 'kombinezon', 'reef', 'viola', 'r4454'].includes(s.id)) {
      const b = bandControl(p, { ...sr, families: autoFamilies });
      const bandSeeds = s.id === 'reef' ? ['I', 'J'] : [];
      negs.push({
        sample: s.id,
        control: 'bands off',
        changedFamilies: b.changedFamilies,
        expectChanged: bandSeeds,
        pass: b.changedFamilies.every((l) => bandSeeds.includes(l)),
      });
    }
    if (s.id === 'robe' || s.id === 'blazer') edits.push(...editChecks(p, sr));
    if (s.id === 'robe') negs.push({ sample: 'robe', ...negative(p, sr, '67') });
    if (s.id === 'kombinezon') negs.push({ sample: 'kombinezon', ...negative(p, sr, '1') });
  }
  for (const n of negs) console.log('negative control', JSON.stringify(n));
  const md: string[] = [
    '| sample | seeds | pieces (traceable) | full families | candidates closed (gate + monotone) | share | per piece: C gate-pass, c closed-below-gate, L leak, M merged, t tiny |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const o of out as {
    sample: string;
    seeds: string;
    traceable: number;
    fullFamilies: number;
    passed: number;
    candidates: number;
    closedShare: number;
    rows: Row[];
  }[])
    md.push(
      `| ${o.sample} | ${o.seeds} | ${o.traceable} | ${o.fullFamilies} | ${o.passed}/${o.candidates} | ${(100 * o.closedShare).toFixed(0)} % | ${o.rows
        .filter((r) => !r.note?.startsWith('not traceable'))
        .map((r) => `${r.label} ${r.outcomes || '—'}${r.monotone ? '' : '¬m'}`)
        .join(' · ')} |`,
    );
  writeFileSync(resolve(REPORTS, `F4-${date}-table.md`), md.join('\n') + '\n');
  const json = resolve(REPORTS, `F4-${date}.json`);
  for (const e of edits) console.log('edit check', JSON.stringify(e));
  writeFileSync(json, JSON.stringify({ date, samples: out, negative: negs, edits }, null, 1));
  console.log(json);
  return 0;
}
