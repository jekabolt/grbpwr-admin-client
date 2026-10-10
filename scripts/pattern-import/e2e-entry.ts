// PATTERN-IMPORT · E2E probe — every corpus sample through the worker SESSION the way the wizard
// drives it (read → scale → sheet → legend/sizes → pieces → semantics → fabrics → write → gate),
// with NO geometry clicks on the automatic pass. What the wizard would stop on is recorded as an
// operator action; the run then simulates the cheapest operator answer (confirm the scale, accept
// the size guesses, pick the model, "not a piece" on open regions, two grain clicks, a typed code)
// so every sample reaches the gate, and the record says which answers it took.
//   node --expose-gc scripts/pattern-import/e2e.mjs [case…]   (one child process per case)
//   env PATIMPORT_CORPUS, E2E_OUT (default tmp/plans/pdf-to-dxf/reports/E2E-out)
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import { setPdfjsLoader, type PdfjsModule } from 'lib/pattern-import/adapters/pdf';
import { setRasterPdfjsLoader } from 'lib/pattern-import/adapters/raster';
import { readPieceText } from 'lib/pattern-import/dictionary';
import { planScopes } from 'lib/pattern-import/fabrics/scope';
import { isTitleLabel } from 'lib/pattern-import/semantics/names';
import { contourMm, roundTrip } from 'lib/pattern-import/gate/roundtrip';
import { readManifest } from 'lib/pattern-import/manifest';
import type {
  CardSize,
  DraftScopeTarget,
  IRText,
  PageMaskEdit,
  PieceEdit,
  PieceFamily,
  PtMm,
  Seed,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { toWireError } from 'lib/pattern-import/worker/errors';
import { guardPdfjs } from 'lib/pattern-import/worker/pdf-guard';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import { wallsUsedBy } from 'lib/pattern-import/worker/walls-used';

import { singlePageSheet } from 'components/managers/tech-card/components/pattern-import/sheet-skip';
import {
  scaleUncertain,
  stepOffer,
  type OfferCtx,
} from 'components/managers/tech-card/components/pattern-import/auto-advance';

import { synthDrawables, synthTruth } from './raster-entry';

import { PALETTE, renderPng, type Label, type Stroke } from './sizes-render';
import { splitSize } from './worker-entry';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const OUT =
  process.env.PATIMPORT_E2E_OUT ??
  process.env.E2E_OUT ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/E2E-out';
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
const loadGuarded = () => (import(LEGACY) as Promise<PdfjsModule>).then((m) => guardPdfjs(m));
setPdfjsLoader(loadGuarded);
setRasterPdfjsLoader(loadGuarded);

// ── cases ───────────────────────────────────────────────────────────────────────────────

type TruthRef = { id: string; variant?: number; expect?: number; note?: string };
type Case = {
  id: string;
  group: 'pdf' | 'dxf' | 'synthetic' | 'refusal';
  files: string[]; // corpus-relative, or 'split:<size>' for the per-size DXF set
  card: string[];
  /** The model the operator picks when the sheet offers several (regex on the variant label). */
  variant?: RegExp;
  sheet?: number;
  truth?: TruthRef;
  /** F4 click fixture id (scripts/pattern-import/fixtures/pieces-clicks.json) for the operator pass. */
  clicks?: string;
  /** Card sizes the operator answers "not exported" on the sizes step (a size whose lines leak). */
  notExported?: string[];
  /** The operator's "sizes drawn on this sheet" answer when the file does not say (default: 1 for a one-size card). */
  drawn?: number;
  /** The operator's "the drawn outline is" answer on the details step (default: the seam line). */
  meaning?: 'seam' | 'cut';
  /** The F11 synthetic scan: its vector truth is drawn under the overlays (not registered). */
  scanTruth?: boolean;
  /**
   * D3: the operator's answer when the run asks what the drawn outline is (no allowance evidence).
   * From the E2E-1010 truth: blazer, wm and leonie draw the cut line (allowance included).
   * Absent = the operator confirms what is shown.
   */
  outline?: 'cut' | 'seam';
  /**
   * E4: pieces (seed labels) whose count question the operator answers "cut on fold" — the fold
   * the sheet draws with curves only (redcafe спинка: ЗАДНЯЯ СЕРЕДИНА СГИБ).
   */
  foldOnCount?: string[];
  /**
   * The operator's legend edit: the class that draws the piece outlines (the longest class that is
   * not set aside) is a size line — the live smoke's answer on inkscape-pieces-mm.svg, whose cut
   * lines the legend read as `internal`.
   */
  outlinesAreSize?: boolean;
  /** The operator maps the source sizes, in rank order, to these card tokens (smoke: 38 → M). */
  mapTo?: string[];
};

const NUM = (a: number, b: number, step = 2) =>
  Array.from({ length: (b - a) / step + 1 }, (_, i) => String(a + i * step));
const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL'];
const W = (s: string) => `pdf/wm_kka_15_01_${s}_wykroj.pdf`;

export const CASES: Case[] = [
  // vector / raster PDF
  { id: 'robe', group: 'pdf', files: ['pdf/robe.pdf'], card: NUM(36, 46), truth: { id: 'robe' } },
  {
    id: 'palto',
    group: 'pdf',
    files: ['pdf/palto.pdf'],
    card: NUM(72, 88, 4),
    variant: /125/,
    truth: { id: 'palto', expect: 7, note: '9 listed, 2 are "trace from 21" (no own outline)' },
  },
  {
    id: 'kombinezon-A',
    group: 'pdf',
    files: ['pdf/kombinezon.pdf'],
    card: NUM(6, 20),
    variant: /A/,
    truth: { id: 'kombinezon', variant: 0 },
  },
  {
    id: 'kombinezon-B',
    group: 'pdf',
    files: ['pdf/kombinezon.pdf'],
    card: NUM(6, 20),
    variant: /B/,
    truth: { id: 'kombinezon', variant: 1 },
  },
  {
    id: 'viola',
    group: 'pdf',
    files: ['pdf/viola.pdf'],
    card: NUM(34, 48),
    truth: { id: 'viola' },
  },
  {
    id: 'reef',
    group: 'pdf',
    files: ['pdf/reef.pdf'],
    card: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
    truth: { id: 'reef' },
  },
  {
    id: 'zhaket',
    group: 'pdf',
    files: ['pdf/zhaket.pdf'],
    card: NUM(36, 44),
    truth: { id: 'zhaket' },
  },
  {
    id: 'leonie',
    group: 'pdf',
    files: ['pdf/leonie.pdf'],
    card: NUM(36, 46),
    truth: { id: 'leonie' },
    clicks: 'leonie',
    // the browser run (E2E-1010 §4): the back leg leaks only in 38 → 38 is not exported
    notExported: ['38'],
  },
  // E3: the F11 synthetic scan (300 dpi PNG: 0.3° rotation, +0.5 % x stretch, blur, noise) —
  // a 5-size graded piece with known geometry (reports/F11-work: the PNG `patimport:raster` makes,
  // wrapped as a one-page A4 PDF by `sips -s format pdf`, as a scanner's PDF would carry it)
  {
    id: 'scan:synth',
    group: 'synthetic',
    files: ['../reports/F11-work/synth-scan.pdf'],
    card: NUM(34, 46),
    clicks: 'synth-scan',
    // 7 colour classes: ranks 0–1 carry only the arcs; the largest size (purple) does not close
    notExported: ['34', '36', '46'],
    scanTruth: true,
  },
  // E3: the same scan with "the drawn outline is the cut line" (the seam line is derived inward).
  // 36 is not exported: its outline carries a strip the fill merged in through a neck narrower
  // than 2 × 10 mm, so the inward seam line splits there (2 loops) — G6 refuses it, rightly.
  {
    id: 'leonie:cut',
    group: 'pdf',
    files: ['pdf/leonie.pdf'],
    card: NUM(36, 46),
    clicks: 'leonie',
    notExported: ['36', '38'],
    meaning: 'cut',
  },
  // E3: the operator also drops 36 (the fill merged a strip into the leg) and 46 (the outline
  // follows the size digits for 13 mm) — what is left must pass the gate
  {
    id: 'leonie:40-44',
    group: 'pdf',
    files: ['pdf/leonie.pdf'],
    card: NUM(36, 46),
    clicks: 'leonie',
    notExported: ['36', '38', '46'],
  },
  {
    id: 'blazer',
    group: 'pdf',
    files: ['pdf/blazer.pdf'],
    card: ['M'],
    truth: { id: 'blazer' },
    clicks: 'blazer',
    outline: 'cut',
  },
  {
    id: 'r4454',
    group: 'pdf',
    files: ['pdf/r4454.pdf'],
    card: NUM(44, 54),
    truth: {
      id: 'r4454',
      expect: 13,
      note: '11 main (9, 11 cut by measurement, no outline) + 4 interfacing',
    },
    clicks: 'r4454',
  },
  {
    id: 'redcafe',
    group: 'pdf',
    files: ['44', '46', '48', '50', '52', '54'].map((n) => `pdf/${n}.pdf`),
    card: NUM(44, 54),
    truth: { id: 'redcafe_tolstovka' },
    clicks: 'redcafe',
    foldOnCount: ['спинка'],
  },
  {
    id: 'wm',
    group: 'pdf',
    files: ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'].map(W),
    card: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    truth: { id: 'wm_kka_15_01' },
    clicks: 'wm',
    outline: 'cut',
  },
  // A2: the owner's beta case of 10.10 — wm M alone (one file, one size), no click fixture
  {
    id: 'wm-M',
    group: 'pdf',
    files: [W('m')],
    card: ['M'],
    truth: { id: 'wm_kka_15_01' },
    outline: 'cut',
  },
  {
    id: 'polupalto-sheetA',
    group: 'pdf',
    files: ['pdf/polupalto.pdf'],
    card: NUM(44, 54),
    sheet: 0,
    variant: /A/,
    truth: { id: 'polupalto' },
  },
  {
    id: 'polupalto-sheetB',
    group: 'pdf',
    files: ['pdf/polupalto.pdf'],
    card: NUM(44, 54),
    sheet: 1,
    variant: /B/,
    truth: { id: 'polupalto' },
  },
  // DXF (CLO, lekalo, Gerber) — fast path
  ...[
    'allsizes.dxf',
    'allsizes-merged.dxf',
    'ALLSIZES_DXF.dxf',
    'Allsizes_with_notches.dxf',
    'POCKETS.dxf',
    'blazer.dxf',
    'summer men.dxf',
    'summer men_ganjubas_gerber.dxf',
    'RC28-RC28-001-test-2.dxf',
    'RC28-RC28-001-test-3.dxf',
    'RC28-RC28-001-Shell_Fabric_-_Alt_(substitute).dxf',
  ].map(
    (f): Case => ({
      id: `dxf:${f.replace(/\.dxf$/, '')}`,
      group: 'dxf',
      files: [`dxf-clo/${f}`],
      card: [...LETTERS, ...NUM(32, 60)],
    }),
  ),
  {
    id: 'dxf-set:allsizes-merged×5',
    group: 'dxf',
    files: ['XS', 'S', 'M', 'L', 'XL'].map((s) => `split:${s}`),
    card: ['XS', 'S', 'M', 'L', 'XL'],
  },
  // synthetic HPGL / SVG / AI (one size, truth = f12-truth.json)
  ...[
    'gerber-front.plt',
    'optitex-hpgl2-pe.plt',
    'lectra-back-sc.plt',
    'pe-malformed.plt',
    'inkscape-pieces-mm.svg',
    'illustrator-back-72dpi.svg',
    'seamly2d-qt-collar.svg',
    'px-only-square.svg',
    'pdf-compatible.ai',
    'ps-wrapped-pdf.ai',
    'illustrator8-postscript.ai',
  ].map(
    (f): Case => ({ id: `syn:${f}`, group: 'synthetic', files: [`synthetic/${f}`], card: ['M'] }),
  ),
  // A7: the live beta smoke of 10.10 (auto/01-TASKS Журнал): card #55 S/M/L, the operator's answers
  // as given there — outlines → size line, 1 size drawn, 38 → M, a seed per piece, grainlines, the
  // outline is the cut line as drawn
  {
    id: 'syn:inkscape-smoke-SML',
    group: 'synthetic',
    files: ['synthetic/inkscape-pieces-mm.svg'],
    card: ['S', 'M', 'L'],
    outlinesAreSize: true,
    drawn: 1,
    mapTo: ['M'],
    outline: 'cut',
  },
  ...['binary-garbage.plt', 'not-really.svg', 'postscript-only.eps', 'dos-binary-header.eps'].map(
    (f): Case => ({ id: `syn:${f}`, group: 'refusal', files: [`synthetic/${f}`], card: ['M'] }),
  ),
];

// ── A7 click metric ─────────────────────────────────────────────────────────────────────
// One unit = one operator action (auto/00-PLAN §1, A7): a click, a pick, a typed code = 2, a
// grainline = 3 (the row + its two ends), "not a piece" = 2, a size map = 1 per size. Navigation of
// the linear wizard = file 1 + read 1 + next ×7 (files…fabrics) + next to apply 1 + apply 1 +
// download 1 = 12; a screen the run skips takes its "next" away. N1: the wizard runs forward by itself (auto-advance.ts) through every
// screen of files…fabrics that asks nothing — no answer here, no offer waiting (`stepOffer`) — so
// such a screen costs 0; the screen it lands on costs its one "next" after the answers. The DXF
// fast path never shows the sheet, nor the pieces unless the sizes stopped it; A0.2 passes a
// one-page sheet. A screen the run never reached (it failed before) is priced as before.

export const CLICKS = {
  scale: 1,
  'legend-row': 1,
  'size-guess': 1,
  'size-map': 1,
  'drawn-sizes': 1,
  model: 1,
  seed: 1,
  'use-line': 2,
  'not-a-piece': 2,
  code: 2,
  grain: 3,
  // A1: "review N proposed grainlines" + "accept these N" in the overview that shows them all
  'grain-accept': 2,
  'fold-suggested': 1,
  'fold-pick': 2,
  outline: 1,
  'bulk-confirm': 1,
  fabrics: 1,
  // answers the simulated operator gives that the plan's table does not name
  residual: 1, // "accept tile residual" tick
  'fold-no': 1, // "not a fold"
  'cutting-list': 1, // confirm the cutting list + 1 per piece marked
  'count-answer': 1, // "cut on fold" in a count row
  // N1: "accept all N suggestions" on the files step (the clean stage's offers), one click
  'clean-accept': 1,
  blocker: 0,
  note: 0,
} as const;
export type OpKind = keyof typeof CLICKS;
/** N1: the screens whose "next" the wizard takes by itself when they ask nothing. */
export const AUTO_SCREENS = [
  'files',
  'scale',
  'sheet',
  'sizes',
  'pieces',
  'details',
  'fabrics',
] as const;
export type Screen = (typeof AUTO_SCREENS)[number] | 'check';
export type Op = { label: string; kind: OpKind; clicks: number; screen?: Screen };
export type Clicks = { total: number; byKind: Partial<Record<OpKind, number>>; nav: number };
export const NAV_LINEAR = 12;

export function clicksOf(ops: readonly Op[], skippedScreens: number): Clicks {
  const byKind: Partial<Record<OpKind, number>> = {};
  for (const o of ops) if (o.clicks) byKind[o.kind] = (byKind[o.kind] ?? 0) + o.clicks;
  const nav = NAV_LINEAR - skippedScreens;
  return { total: nav + ops.reduce((a, o) => a + o.clicks, 0), byKind, nav };
}

/** The card id every case writes for (nonzero: B1 wrote 0 and the e2e did not see it). */
export const CARD_ID = 4242;

// ── helpers ─────────────────────────────────────────────────────────────────────────────

const mb = (n: number) => Math.round(n / 1048576);
const peakMb = () => Math.round(process.resourceUsage().maxRSS / 1024);
const ctx = (): StageCtx => ({ checkCancel: () => {}, progress: () => {} });
const card = (tokens: string[]): CardSize[] =>
  tokens.map((t, i) => ({ sizeId: 100 + i, name: t, token: t, rank: i, spellings: [t] }));
const SCOPES: DraftScopeTarget[] = [
  {
    scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
    fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
    bomLineKey: 'L1',
    label: 'main',
    isInterlining: false,
    sections: ['TECH_CARD_BOM_SECTION_FABRIC'],
  },
  {
    scopeKey: 'TECH_CARD_BOM_PURPOSE_LINING',
    fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING',
    bomLineKey: 'L2',
    label: 'lining',
    isInterlining: false,
    sections: ['TECH_CARD_BOM_SECTION_LINING'],
  },
  {
    scopeKey: 'TECH_CARD_BOM_PURPOSE_INTERLINING',
    fabricPurpose: 'TECH_CARD_BOM_PURPOSE_INTERLINING',
    bomLineKey: 'L3',
    label: 'interlining',
    isInterlining: true,
    sections: ['TECH_CARD_BOM_SECTION_INTERLINING'],
  },
];

function filesOf(c: Case): { name: string; bytes: ArrayBuffer }[] {
  const enc = (b: Buffer) =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  if (c.files[0]?.startsWith('split:')) {
    const graded = readFileSync(resolve(CORPUS, 'dxf-clo/allsizes-merged.dxf')).toString('latin1');
    return c.files.map((f) => {
      const s = f.slice(6);
      return {
        name: `coat_${s.toLowerCase()}.dxf`,
        bytes: enc(Buffer.from(splitSize(graded, s), 'latin1')),
      };
    });
  }
  return c.files.map((f) => ({ name: basename(f), bytes: enc(readFileSync(resolve(CORPUS, f))) }));
}

const OC: Record<string, string> = {
  closed: 'C',
  leak: 'L',
  merged: 'M',
  tiny: 't',
  // pieces/grade (H1): a size held back, not guessed
  refused: 'R',
};

function famStats(
  fams: PieceFamily[],
  exported: Set<number> | null,
  label: (seed: number) => string,
) {
  const inScope = (r: number) => !exported || exported.has(r);
  const per = fams.map((f) => {
    const cs = f.candidates.filter((c) => inScope(c.rank));
    return {
      seed: f.seed,
      label: label(f.seed),
      outcomes: cs.map((c) => OC[c.outcome] ?? '?').join(''),
      monotone: f.monotone,
      closed: cs.length > 0 && cs.every((c) => c.outcome === 'closed'),
      derived: cs.flatMap((c) => (c.derived ?? []).map((d) => d.kind)),
      rankFrom: [...new Set(cs.map((c) => c.rankFrom ?? '-'))].join(','),
      areasCm2: cs.map((c) => Math.round(c.areaMm2 / 100)),
      // pieces/grade (H1): why sizes were held back
      refused: [...new Set(cs.flatMap((c) => (c.gradeRefusal ? [c.gradeRefusal] : [])))],
    };
  });
  const cands = per.flatMap((p) => p.outcomes.split(''));
  return {
    families: fams.length,
    closedFamilies: per.filter((p) => p.closed).length,
    nonMonotone: per.filter((p) => !p.monotone).length,
    candidates: cands.length,
    closedCandidates: cands.filter((x) => x === 'C').length,
    leak: cands.filter((x) => x === 'L').length,
    merged: cands.filter((x) => x === 'M').length,
    tiny: cands.filter((x) => x === 't').length,
    per,
  };
}

function nearestChain(preview: Float32Array[], at: PtMm): number {
  let best = -1;
  let bd = Infinity;
  preview.forEach((a, id) => {
    for (let i = 0; i + 3 < a.length; i += 2) {
      const ax = a[i],
        ay = a[i + 1],
        bx = a[i + 2],
        by = a[i + 3];
      const dx = bx - ax,
        dy = by - ay;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((at.x - ax) * dx + (at.y - ay) * dy) / L2));
      const d = Math.hypot(ax + t * dx - at.x, ay + t * dy - at.y);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
  });
  return best;
}

// ── one case ────────────────────────────────────────────────────────────────────────────

type Rec = Record<string, unknown> & {
  id: string;
  ops: Op[];
  ms: Record<string, number>;
  clicks?: Clicks;
};

/** Probe hooks (clean.mjs): the clean stage's edits, and the session once the pieces are found. */
export type CaseHooks = {
  cleanEdits?: PageMaskEdit[];
  onPieces?: (s: Session) => void;
  /** A2 probe: the automatic pieces run (text + face seeds, no operator answer yet). */
  onAutoPieces?: (s: Session, out: StageIO['pieces']['out']) => void;
};

export async function runCase(c: Case, hooks: CaseHooks = {}): Promise<Rec> {
  const rec: Rec = { id: c.id, group: c.group, files: c.files, ops: [], ms: {} };
  /** One operator answer: `count` units of `kind` (A7: clicks = CLICKS[kind] × count). */
  /** N1: the screen the simulated operator is on, every screen reached, and where it stopped. */
  let screen: Screen = 'files';
  const reached = new Set<Screen>(['files']);
  const at = (sc: Screen) => {
    screen = sc;
    reached.add(sc);
  };
  const stops = new Map<Screen, string>();
  const stop = (why: string) => {
    if (!stops.has(screen)) stops.set(screen, why);
  };
  const op = (kind: OpKind, label: string, count = 1) => {
    rec.ops.push({ label, kind, clicks: CLICKS[kind] * count, screen });
    stop(kind);
  };
  /** A7: the wizard screens the run skipped (nav = NAV_LINEAR − skipped). */
  const skipped: string[] = [];
  /** N1: screens passed whatever they hold (the fast path, a one-page sheet). */
  const passed = new Set<Screen>();
  /** N1: the wizard's own offer rule (auto-advance.ts) on what this run holds so far. */
  const offerOn = (step: OfferCtx['step'], part: Partial<OfferCtx>, presegmented = false) =>
    stepOffer({
      step,
      clean: null,
      pages: [],
      sheet: null,
      chains: null,
      sizes: null,
      pieces: null,
      fabrics: null,
      semantics: null,
      presegmented,
      cleanEdits: hooks.cleanEdits ?? [],
      scopes: SCOPES.length,
      fabricsEdited: false,
      ...part,
    });
  const dir = resolve(OUT, c.id.replace(/[^\w.-]+/g, '_'));
  mkdirSync(dir, { recursive: true });
  const T0 = Date.now();
  const timed = async <X>(k: string, f: () => Promise<X>) => {
    const t = Date.now();
    const x = await f();
    rec.ms[k] = (rec.ms[k] ?? 0) + Date.now() - t;
    return x;
  };
  let s: Session;
  try {
    s = new Session(1, filesOf(c));
  } catch (e) {
    rec.refused = toWireError(e);
    rec.verdict = 'refused';
    return rec;
  }
  const run = <S extends StageName>(st: S, input: StageIO[S]['in']) =>
    timed(st, () => s.runStage(st, input, ctx()));
  try {
    // 1 · files
    const ex = await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
    // A8: the input pages cleaned before anything is parsed (no operator edit on the e2e pass)
    const cl = await run('clean', { edits: hooks.cleanEdits ?? [] });
    const pageCls: Record<string, number> = {};
    for (const p of cl.classes) pageCls[p.cls] = (pageCls[p.cls] ?? 0) + 1;
    rec.clean = {
      summary: cl.summary,
      offered: cl.offered,
      dropped: cl.dropped.length,
      squares: cl.scaleHints.map((h) => `${h.declaredMm} mm conf ${h.confidence}`),
      notes: cl.notes.slice(0, 4),
    };
    // N1: what the files step offers without blocking (suggestions, pages to check) stops the run
    {
      const accepted = (hooks.cleanEdits ?? []).filter((e) => 'keep' in e && !e.keep).length;
      if (accepted) op('clean-accept', `accept all ${accepted} suggested kinds (one click)`);
      const offer = offerOn('files', { clean: cl, pages: cl.classes }, !!ex.presegmented);
      if (offer) stop(offer);
    }
    const best = cl.scale[0];
    rec.read = {
      kinds: [...new Set(ex.files.map((f) => f.kind))].join(','),
      pages: ex.pages.length,
      pageCls,
      presegmented: !!ex.presegmented,
      scanPages: ex.calibrations?.length ?? 0,
      warnings: ex.warnings.slice(0, 6),
      scale: best
        ? { factor: +best.factor.toFixed(5), method: best.method, confidence: best.confidence }
        : null,
      tileSheets: new Set(ex.pages.filter((p) => p.cls === 'tile').map((p) => p.sheet)).size,
    };
    rec.rssAfterExtractMb = mb(process.memoryUsage().rss);
    if (!best) throw new Error('no scale candidate');
    // 2 · scale (the wizard asks for a confirmation when the detection is not certain)
    at('scale');
    // the scale blocker's rule: a page calibration below sure (an inherited one) asks too
    const needsHuman = scaleUncertain(best, best.factor, ex.calibrations);
    // the fast path shows an uncertain scale too, and asks the same confirmation
    if (needsHuman)
      op(
        'scale',
        `confirm scale (${best.method}, conf ${best.confidence.toFixed(2)}, ×${best.factor.toFixed(4)})`,
      );
    await run('scale', {
      decision: { factor: best.factor, method: best.method, operatorConfirmed: needsHuman },
    });
    // 3 · sheet — the DXF fast path never shows it (use-import-session)
    at('sheet');
    if (ex.presegmented) passed.add('sheet');
    const as = await run('assemble', { sheet: c.sheet ?? 0 });
    if (as.clean) (rec.clean as Record<string, unknown>).sheet = as.clean.summary;
    // A0.2: the wizard passes over a one-page sheet (sheet-skip.ts, the same rule)
    if (!ex.presegmented && singlePageSheet(ex.pages, as)) passed.add('sheet');
    {
      const offer = offerOn('sheet', { sheet: as });
      if (offer) stop(offer);
    }
    const worst = Math.max(0, ...as.sheet.poses.map((p) => p.residualMm));
    rec.sheet = {
      tiles: as.sheet.poses.length,
      missing: as.sheet.missing.length,
      worstResidualMm: +worst.toFixed(3),
      bboxMm: [
        Math.round(as.sheet.bbox.maxX - as.sheet.bbox.minX),
        Math.round(as.sheet.bbox.maxY - as.sheet.bbox.minY),
      ],
      originMm: [Math.round(as.sheet.bbox.minX), Math.round(as.sheet.bbox.maxY)],
    };
    if (as.sheet.missing.length)
      op('blocker', `BLOCKER: ${as.sheet.missing.length} pages missing → set the grid by hand`);
    if (worst > PATIMPORT.registrationMaxResidualMm)
      op('residual', `accept tile residual ${worst.toFixed(2)} mm`);
    // 4 · legend + sizes
    at('sizes');
    let ch = await run('chains', {
      opts: {
        joinGapMm: PATIMPORT.joinGapMm,
        joinAngleDeg: PATIMPORT.joinAngleDeg,
        joinLateralMm: PATIMPORT.joinLateralMm,
      },
    });
    const roles: Record<string, number> = {};
    for (const k of ch.classes) roles[k.role] = (roles[k.role] ?? 0) + 1;
    const pending = ch.classes.filter((k) => k.confidence < 0.6);
    rec.legend = {
      classes: ch.classes.length,
      roles,
      sizeRows: ch.classes.filter((k) => k.role === 'size').map((k) => k.sizeLabel ?? '?'),
      lowConfidence: pending.length,
      flags: ch.ambiguities?.length ?? 0,
      chains: ch.chainPreview.length,
    };
    let legendRows = pending.length;
    if (c.outlinesAreSize) {
      const k = ch.classes
        .filter((x) => x.role !== 'ignore')
        .sort((a, b) => b.totalLengthMm - a.totalLengthMm)[0];
      // A0.3: an outline row the faces already made ('common' for a one-size sheet) needs no edit
      if (k && k.role !== 'size' && k.role !== 'common') {
        if (!pending.some((x) => x.id === k.id)) legendRows++;
        ch = await run('chains', {
          opts: {
            joinGapMm: PATIMPORT.joinGapMm,
            joinAngleDeg: PATIMPORT.joinAngleDeg,
            joinLateralMm: PATIMPORT.joinLateralMm,
          },
          legend: [{ classId: k.id, role: 'size', sizeLabel: null }],
        });
        (rec.legend as Record<string, unknown>).edited =
          `${k.role}→size (${k.chains.length} chains)`;
      }
    }
    if (legendRows) op('legend-row', `confirm ${legendRows} legend rows`, legendRows);
    const CARD = card(c.card);
    let sz = await run('sizes', { card: CARD });
    // D1: what the sizes step asks, and what the lines suggest (offered, never applied)
    const askOf = (a: typeof sz.countAsk) =>
      !a
        ? 'not asked'
        : a.auto?.applied
          ? `${sz.expected?.n} · AUTO · ${a.auto.evidence
              .filter((e) => e.counts)
              .map((e) => e.kind)
              .join(' + ')}`
          : a.inferred
            ? `${a.inferred.n} · from the lines`
            : 'asked, no suggestion';
    const ask0 = askOf(sz.countAsk);
    // A6: the count the sheet's evidences agree on is pre-answered (0 clicks); where the case's
    // truth says otherwise the operator takes the AUTO pill back and answers (2)
    const truthDrawn = c.drawn ?? (CARD.length === 1 ? 1 : undefined);
    let autoWrong = false;
    if (sz.expected?.from === 'inferred') {
      if (truthDrawn != null && truthDrawn !== sz.expected.n) {
        autoWrong = true;
        op(
          'drawn-sizes',
          `AUTO ${sz.expected.n} is wrong (truth ${truthDrawn}): take it back, answer ${truthDrawn}`,
          2,
        );
        sz = await run('sizes', { card: CARD, drawnSizes: truthDrawn });
      } else op('note', `"sizes drawn on this sheet" pre-answered: ${ask0}`);
    }
    // H1c-3/4: a sheet that does not state its size count needs the operator's answer (the card's
    // run is never the count). The operator answers from the drawing: `drawn`, else "1" where one
    // size is drawn (one size read off the sheet, or a one-size card)
    const drawn = sz.expected
      ? undefined
      : c.drawn ?? (sz.run.sizes.length === 1 || CARD.length === 1 ? 1 : undefined);
    const ask = drawn ? { drawnSizes: drawn } : autoWrong ? { drawnSizes: truthDrawn } : {};
    if (!sz.expected) {
      if (drawn) {
        op('drawn-sizes', `answer ${drawn} for "sizes drawn on this sheet"`);
        sz = await run('sizes', { card: CARD, ...ask });
      } else op('note', '"sizes drawn on this sheet" not answered (no ground truth in the case)');
      // the sizes step blocks on the count question whether or not the case answers it
      stop('drawn-sizes');
    }
    const guesses = sz.map.entries.filter(
      (e) => e.origin === 'auto' && !!e.card && (e.confidence ?? 1) < 0.9,
    );
    rec.sizes = {
      encoding: sz.run.encoding,
      found: sz.run.sizes.map((x) => x.label),
      map: sz.map.entries.map(
        (e) =>
          `${e.source.label}→${e.card?.token ?? '—'}${e.origin === 'auto' && e.card && (e.confidence ?? 1) < 0.9 ? '?' : ''}`,
      ),
      unmappedCard: sz.map.unmapped.length,
      countAsk: ask0,
      ...(sz.countAsk?.auto
        ? {
            countEvidence: sz.countAsk.auto.evidence.map(
              (e) => `${e.kind} ${e.n.join('/')}${e.counts ? '' : ' (not counted)'}: ${e.detail}`,
            ),
          }
        : {}),
      ...(autoWrong ? { autoWrong: true } : {}),
    };
    if (c.mapTo) {
      const to = c.mapTo;
      const n = Math.min(to.length, sz.map.entries.length);
      // a suggestion already on the answer is one confirm click; a map already on it is none
      const head = sz.map.entries.slice(0, n);
      const hand = head.filter((e, i) => e.card?.token !== to[i]);
      const onIt = head.filter(
        (e, i) => e.card?.token === to[i] && e.origin === 'auto' && (e.confidence ?? 1) < 0.9,
      );
      if (onIt.length)
        op(
          'size-guess',
          `confirm ${onIt.length} suggested sizes: ${onIt.map((e) => `${e.source.label || '∅'}→${e.card?.token}`).join(', ')}`,
          onIt.length,
        );
      if (hand.length)
        op(
          'size-map',
          `map ${hand.length} source sizes by hand: ${head
            .map((e, i) => (hand.includes(e) ? `${e.source.label || '∅'}→${to[i]}` : null))
            .filter(Boolean)
            .join(', ')}`,
          hand.length,
        );
      sz = await run('sizes', {
        card: CARD,
        ...ask,
        operatorMap: sz.map.entries.map((e, i) => ({
          ...e,
          card: i < n ? CARD.find((k) => k.token === to[i]) ?? null : null,
          origin: 'operator',
        })),
      });
    } else if (guesses.length) {
      op('size-guess', `confirm ${guesses.length} size guesses`, guesses.length);
      sz = await run('sizes', {
        card: CARD,
        ...ask,
        operatorMap: sz.map.entries.map((e) => ({ ...e, origin: e.card ? 'operator' : e.origin })),
      });
    }
    if (!sz.map.entries.some((e) => e.card) && sz.map.entries.length) {
      // the operator maps the source sizes to the card by hand, in rank order
      const n = Math.min(sz.map.entries.length, CARD.length);
      op(
        'size-map',
        `map ${n} of ${sz.map.entries.length} source sizes to the card by hand (labels: [${sz.map.entries.map((e) => e.source.label || '∅').join(',')}])`,
        n,
      );
      sz = await run('sizes', {
        card: CARD,
        ...ask,
        operatorMap: sz.map.entries.map((e, i) => ({
          ...e,
          card: i < n ? CARD[i] : null,
          origin: 'operator',
        })),
      });
    }
    if (c.notExported?.length) {
      const drop = new Set(c.notExported);
      op('size-map', `size(s) ${c.notExported.join(', ')} not exported`, c.notExported.length);
      sz = await run('sizes', {
        card: CARD,
        ...ask,
        operatorMap: sz.map.entries.map((e) => ({
          ...e,
          card: e.card && drop.has(e.card.token) ? null : e.card,
          origin: 'operator',
        })),
      });
    }
    if (!sz.map.entries.some((e) => e.card)) {
      op('blocker', 'BLOCKER: no source size maps to the card');
      rec.verdict = 'fails';
      rec.reason = 'no size maps to the card';
      return rec;
    }
    // the fast path stops on the sizes step only when something there needs an answer; else it
    // lands on details without showing the pieces
    if (ex.presegmented && !stops.has('sizes')) passed.add('pieces');
    {
      // N1: the flags the legend could not settle stop the run on the sizes step
      const offer = offerOn('sizes', { chains: ch, sizes: sz });
      if (offer) stop(offer);
    }
    const exported = new Set(sz.map.entries.flatMap((e) => (e.card ? [e.source.rank] : [])));
    // 5 · pieces — automatic seeds (text / DXF blocks), first run shows every model
    at('pieces');
    const FILL = { cellMm: PATIMPORT.fillCellMm, snapMm: PATIMPORT.snapMm };
    let pc = await run('pieces', { edits: [], opts: { ...FILL, variant: null } });
    const textSeeds = pc.seeds.filter((x) => x.origin !== 'face');
    const labelOf = (seeds: Seed[]) => (seed: number) => {
      const sd = seeds.find((x) => x.id === seed);
      return (sd?.text?.text ?? sd?.origin ?? String(seed)).slice(0, 24);
    };
    rec.seeds = {
      count: pc.seeds.length,
      byOrigin: pc.seeds.reduce<Record<string, number>>(
        (a, x) => ((a[x.origin] = (a[x.origin] ?? 0) + 1), a),
        {},
      ),
      variants: pc.variants ?? [],
    };
    let variant: string | null = null;
    const variants = pc.variants ?? [];
    if (variants.length > 1) {
      variant = variants.find((v) => c.variant?.test(v)) ?? variants[0];
      op('model', `pick model "${variant}" of [${variants.join(' | ')}]`);
      pc = await run('pieces', { edits: [], opts: { ...FILL, variant } });
    } else if (variants.length === 1) variant = null;
    rec.variant = variant;
    let seedsNow = pc.seeds;
    rec.auto = famStats(pc.families, exported, labelOf(seedsNow));
    hooks.onAutoPieces?.(s, pc);
    let seedsIn: Seed[] | undefined;
    let wallEdits: PieceEdit[] = [];
    // operator pass: the F4 click fixture where there is one, else "click inside every outline"
    // (an oracle: one click inside the innermost of each nest of closed lines) when the sheet gave
    // no seed at all. Text seeds that the clicks supersede are answered "not a piece".
    let clickList: { label: string; at: [number, number] }[] | null = null;
    let fxOps: { op: string; near?: [number, number]; rank?: number | null }[] = [];
    if (c.clicks) {
      const fx = JSON.parse(
        readFileSync(resolve(REPO, 'scripts/pattern-import/fixtures/pieces-clicks.json'), 'utf8'),
      )[c.clicks] as {
        clicks: { label: string; at: [number, number] }[];
        operator?: { op: string; near?: [number, number]; rank?: number | null }[];
      };
      clickList = fx.clicks;
      fxOps = fx.operator ?? [];
    } else if (!pc.families.length && !ex.presegmented) {
      clickList = oracleClicks(ch.chainPreview);
    }
    let textDrops: PieceEdit[] = [];
    if (clickList) {
      // A2: the operator does not click an outline a face seed already closed — that face seed
      // takes the click's label (the name the operator gives it); a face seed no click falls in
      // is junk → "not a piece"
      const faceSeeds = pc.seeds.filter((x) => x.origin === 'face');
      const holder = (at: PtMm) =>
        faceSeeds.find((fs) =>
          pc.families
            .find((f) => f.seed === fs.id)
            ?.candidates.some(
              (cd) => cd.outcome === 'closed' && cd.outer.length > 2 && insidePoly(at, cd.outer),
            ),
        );
      const covered = new Map<number, string>();
      const clicksLeft: typeof clickList = [];
      for (const k of clickList) {
        const fs = holder({ x: k.at[0], y: k.at[1] });
        if (fs && !covered.has(fs.id)) covered.set(fs.id, k.label);
        else clicksLeft.push(k);
      }
      // a face seed in whose outline the operator still clicks is superseded by the click
      const inBox = (fs: Seed, k: { at: [number, number] }) =>
        !!fs.face &&
        k.at[0] >= fs.face.box.minX &&
        k.at[0] <= fs.face.box.maxX &&
        k.at[1] >= fs.face.box.minY &&
        k.at[1] <= fs.face.box.maxY;
      const superseded = new Set(
        faceSeeds
          .filter((fs) => !covered.has(fs.id) && clicksLeft.some((k) => inBox(fs, k)))
          .map((fs) => fs.id),
      );
      const junkFaces = faceSeeds.filter((fs) => !covered.has(fs.id) && !superseded.has(fs.id));
      rec.faceSeeds = {
        offered: faceSeeds.length,
        took: covered.size,
        junk: junkFaces.length,
        superseded: superseded.size,
        clicksSaved: clickList.length - clicksLeft.length,
      };
      clickList = clicksLeft;
      const pseudo = (label: string, at: PtMm, i: number): IRText => ({
        id: -1 - i,
        text: label,
        anchor: at,
        bbox: { minX: at.x, minY: at.y, maxX: at.x, maxY: at.y },
        fontSizeMm: 0,
        rotationDeg: 0,
        layer: null,
        src: { file: 'click', page: -1, op: -1, sub: 0 },
      });
      const keptFaces: Seed[] = faceSeeds.flatMap((fs, i) =>
        covered.has(fs.id) ? [{ ...fs, text: pseudo(covered.get(fs.id)!, fs.at, 1000 + i) }] : [],
      );
      const base = Math.max(0, ...pc.seeds.map((x) => x.id)) + 1;
      const clickSeeds: Seed[] = clickList.map((k, i) => ({
        id: base + i,
        at: { x: k.at[0], y: k.at[1] },
        origin: 'click',
        variant,
        text: {
          id: -1 - i,
          text: k.label,
          anchor: { x: k.at[0], y: k.at[1] },
          bbox: { minX: k.at[0], minY: k.at[1], maxX: k.at[0], maxY: k.at[1] },
          fontSizeMm: 0,
          rotationDeg: 0,
          layer: null,
          src: { file: 'click', page: -1, op: -1, sub: 0 },
        },
      }));
      seedsIn = process.env.E2E_CLICKS_ONLY
        ? clickSeeds
        : [...textSeeds, ...keptFaces, ...clickSeeds];
      textDrops = (process.env.E2E_CLICKS_ONLY ? [] : textSeeds).map(
        (x): PieceEdit => ({ kind: 'not-a-piece', seed: x.id }),
      );
      // junk face seeds are not passed on: "not a piece" on each (2 clicks) is counted below
      const faceDrops = process.env.E2E_CLICKS_ONLY ? 0 : junkFaces.length;
      wallEdits = fxOps.flatMap((o): PieceEdit[] =>
        o.op === 'setWall' && o.near
          ? [
              {
                kind: 'set-wall',
                chain: nearestChain(ch.chainPreview, { x: o.near[0], y: o.near[1] }),
                rank: o.rank ?? null,
              },
            ]
          : o.op === 'ignoreChain' && o.near
            ? [
                {
                  kind: 'ignore-line',
                  chain: nearestChain(ch.chainPreview, { x: o.near[0], y: o.near[1] }),
                },
              ]
            : [],
      );
      pc = await run('pieces', {
        seeds: seedsIn,
        edits: [...textDrops, ...wallEdits],
        opts: { ...FILL, variant },
      });
      seedsNow = pc.seeds;
      if (clickSeeds.length)
        op(
          'seed',
          `${clickSeeds.length} seed clicks${c.clicks ? ' (F4 fixture)' : ' (oracle: one per closed outline)'}`,
          clickSeeds.length,
        );
      if (wallEdits.length) op('use-line', `${wallEdits.length} "use line"`, wallEdits.length);
      if (textDrops.length)
        op('not-a-piece', `"not a piece" on ${textDrops.length} text seeds`, textDrops.length);
      if (faceDrops)
        op('not-a-piece', `"not a piece" on ${faceDrops} face seeds no piece is in`, faceDrops);
      rec.withClicks = famStats(pc.families, exported, labelOf(seedsNow));
      wallEdits = [...textDrops, ...wallEdits];
    }
    const lastStats = (rec.withClicks ?? rec.auto) as ReturnType<typeof famStats>;
    renderPieces(dir, ch.chainPreview, pc.families, seedsNow, exported, as.sheet.bbox);
    if (!pc.families.length) {
      rec.verdict = 'fails';
      rec.reason =
        'no pieces seeded automatically (no text seeds) — operator must click every piece';
      op('blocker', 'BLOCKER: click inside every piece');
      return rec;
    }
    // open regions → "not a piece" (the cheapest answer that lets the wizard move on)
    const open = lastStats.per.filter((p) => !p.closed);
    let edits: PieceEdit[] = [...wallEdits];
    if (open.length) {
      op(
        'not-a-piece',
        `"not a piece" on ${open.length} open regions (${open.map((p) => `${p.label}:${p.outcomes}`).join(' ')})`,
        open.length,
      );
      edits = [...edits, ...open.map((p): PieceEdit => ({ kind: 'not-a-piece', seed: p.seed }))];
      pc = await run('pieces', { seeds: seedsIn ?? pc.seeds, edits, opts: { ...FILL, variant } });
    }
    if (!pc.families.length) {
      rec.verdict = 'fails';
      rec.reason = 'no region closes';
      return rec;
    }
    hooks.onPieces?.(s);
    {
      // N1: piece-sized outlines set aside on a guess stop the run on the pieces step
      const offer = offerOn('pieces', { pieces: pc });
      if (offer) stop(offer);
    }
    if (process.env.E2E_DUMP)
      writeFileSync(
        resolve(dir, 'families.json'),
        JSON.stringify(
          pc.families.map((f) => ({
            seed: f.seed,
            candidates: f.candidates.map((x) => ({
              rank: x.rank,
              outcome: x.outcome,
              outer: x.outer,
            })),
          })),
        ),
      );
    // 6 · meaning (no AI names in a headless run: printed text names only)
    at('details');
    let fileAllowance: StageIO['semantics']['in']['fileAllowance'] = {
      meaning: c.meaning ?? ('seam' as const),
      allowanceMm: PATIMPORT.defaultAllowanceMm,
      origin: c.meaning ? ('operator' as const) : ('default' as const),
      evidence: [],
    };
    const overrides: StageIO['semantics']['in']['pieceOverrides'] = {};
    const grain: StageIO['semantics']['in']['operatorGrain'] = {};
    const foldPick: NonNullable<StageIO['semantics']['in']['operatorFold']> = {};
    let foldListChecked: string[] = [];
    // E1a: the simulated operator answers fold questions from K0 truth (corpus/truth.json) — the
    // person at the wizard knows the garment; a piece truth does not list is "not a fold"
    const truthFold = (() => {
      if (!c.truth) return () => null;
      try {
        const t = JSON.parse(readFileSync(resolve(CORPUS, 'truth.json'), 'utf8')) as {
          samples: { id: string; variants: { pieces: { label: string; fold: unknown }[] }[] }[];
        };
        const sample = t.samples.find((x) => x.id === c.truth!.id);
        const pieces = sample?.variants[c.truth!.variant ?? 0]?.pieces ?? [];
        return (label: string): boolean | null => {
          const p = pieces.find((x) => x.label === label);
          return p ? p.fold === true : null;
        };
      } catch {
        return () => null;
      }
    })();
    let sem = await run('semantics', {
      fileAllowance,
      pieceOverrides: overrides,
      operatorGrain: grain,
      operatorFold: foldPick,
    });
    // the wizard's details step shows the allowance it read; a found one becomes the file decision
    const found = sem.pieces.find(
      (p) => p.allowance.origin === 'text' || p.allowance.origin === 'measured',
    )?.allowance;
    rec.semAuto = {
      pieces: new Set(sem.pieces.map((p) => p.seed)).size,
      identities: sem.pieces.map((p) => p.identity),
      nameOrigin: sem.pieces.reduce<Record<string, number>>(
        (a, p) => ((a[p.nameOrigin] = (a[p.nameOrigin] ?? 0) + 1), a),
        {},
      ),
      blocked: sem.blocked.map((b) => `${b.reason}:${labelOf(seedsNow)(b.seed)}`),
      allowance: [
        ...new Set(
          sem.pieces.map(
            (p) => `${p.allowance.meaning}/${p.allowance.allowanceMm}/${p.allowance.origin}`,
          ),
        ),
      ],
      warnings: sem.warnings.slice(0, 5),
      // E1a: the fold questions the wizard asks before any answer
      folds: (sem.folds ?? []).map((q) => ({
        piece: labelOf(seedsNow)(q.seed),
        why: q.why,
        evidence: q.evidence,
        edges: q.edges.length,
        suggested: q.suggested,
        truthFold: truthFold(labelOf(seedsNow)(q.seed)),
      })),
      foldList: sem.foldList ?? null,
      unfolded: sem.pieces.filter((p) => p.unfoldedFold).map((p) => p.identity),
      // A1: where each piece's grain came from before any answer (first size), and the proposals
      grains: [
        ...sem.pieces.map((p) => {
          const g = p.sizes[0]?.grain;
          return `${labelOf(seedsNow)(p.seed)}:${g ? `${g.origin}[${(g.evidence ?? []).join('+')}] ${g.angleDeg.toFixed(0)}°` : 'none'}`;
        }),
        ...sem.blocked
          .filter((b) => b.reason === 'no-grain')
          .map((b) => {
            const pr = sem.grainProposals?.find((x) => x.seed === b.seed);
            return `${labelOf(seedsNow)(b.seed)}:${pr ? `proposed(${pr.why}) ${((Math.atan2(pr.b.y - pr.a.y, pr.b.x - pr.a.x) * 180) / Math.PI).toFixed(0)}°` : 'no-grain'}`;
          }),
      ],
    };
    const fams = pc.families;
    const dropped: string[] = [];
    const firstProposal = new Map<number, NonNullable<typeof sem.grainProposals>[number]>();
    for (let pass = 0; pass < 5 && (sem.blocked.length || sem.foldList); pass++) {
      const byReason = new Map<string, number[]>();
      for (const b of sem.blocked)
        byReason.set(b.reason, [...(byReason.get(b.reason) ?? []), b.seed]);
      const noGrain = byReason.get('no-grain') ?? [];
      for (const g of sem.grainProposals ?? [])
        if (!firstProposal.has(g.seed)) firstProposal.set(g.seed, g);
      // A1: the proposals first — one click accepts them all; the rest are drawn by hand
      const proposals = (sem.grainProposals ?? []).filter((g) => noGrain.includes(g.seed));
      for (const g of proposals) grain[g.seed] = { a: g.a, b: g.b, accepted: g.evidence };
      if (proposals.length)
        op(
          'grain-accept',
          `accept ${proposals.length} proposed grainlines (${[...new Set(proposals.map((g) => g.why))].join(', ')})`,
        );
      const drawn = noGrain.filter((sd) => !proposals.some((g) => g.seed === sd));
      for (const sd of drawn) {
        const f = fams.find((x) => x.seed === sd);
        if (!f) continue;
        const bb = f.candidates[0].bbox;
        const cx = (bb.minX + bb.maxX) / 2;
        grain[sd] = { a: { x: cx, y: bb.minY + 30 }, b: { x: cx, y: bb.maxY - 30 } };
      }
      if (drawn.length)
        op('grain', `draw grain on ${drawn.length} pieces (row + 2 ends each)`, drawn.length);
      const named = [
        ...(byReason.get('grammar') ?? []),
        ...(byReason.get('duplicate-identity') ?? []),
      ];
      named.forEach((sd, i) => {
        overrides[sd] = {
          ...(overrides[sd] ?? {}),
          code: 'BP',
          mods: [String(50 + pass * 20 + i)],
          displayName: `piece ${sd}`,
          nameOrigin: 'operator',
        };
      });
      if (named.length)
        op('code', `type a code for ${named.length} pieces (grammar/duplicate)`, named.length);
      // E1a fold question: a fold piece (truth) takes the suggested edge, anything else "not a fold"
      const asks = sem.folds ?? [];
      for (const q of asks) {
        const lab = labelOf(seedsNow)(q.seed);
        const fold = truthFold(lab) === true;
        const e = fold && q.suggested != null ? q.edges[q.suggested] : null;
        if (e) foldPick[q.seed] = { a: e.a, b: e.b };
        else overrides[q.seed] = { ...(overrides[q.seed] ?? {}), unfoldedFold: false };
        op(
          e ? 'fold-suggested' : 'fold-no',
          `fold? ${lab}: ${e ? `pick the suggested ${e.lenMm.toFixed(0)} mm edge` : fold ? 'fold, but NO suggested edge → "not a fold"' : '"not a fold"'}`,
        );
      }
      // E1a cutting list: mark the list's pieces (truth) as fold — they come back as questions
      if (sem.foldList && sem.foldList.entries.some((e) => !foldListChecked.includes(e))) {
        // the operator marks a fold piece (truth) only where an entry names it by its number
        const names = (label: string) => {
          const n = label.replace(/\.$/, '').trim();
          const re = new RegExp(`(^|[^\\d])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\d]|$)`);
          return /\d/.test(n) && sem.foldList!.entries.some((e) => re.test(e));
        };
        const marked = fams.filter(
          (f) =>
            truthFold(labelOf(seedsNow)(f.seed)) === true &&
            names(labelOf(seedsNow)(f.seed)) &&
            overrides[f.seed]?.unfoldedFold === undefined &&
            !foldPick[f.seed] &&
            !sem.pieces.some((p) => p.seed === f.seed && p.unfoldedFold),
        );
        for (const f of marked)
          overrides[f.seed] = { ...(overrides[f.seed] ?? {}), unfoldedFold: true };
        foldListChecked = [...new Set([...foldListChecked, ...sem.foldList.entries])];
        op(
          'cutting-list',
          `cutting list names ${sem.foldList.entries.length} fold pieces, ${sem.foldList.unfolded} unfolded → mark ${marked.map((f) => labelOf(seedsNow)(f.seed)).join(',') || 'none'}, confirm the list`,
          1 + marked.length,
        );
      }
      const other = sem.blocked.filter(
        (b) => !['no-grain', 'grammar', 'duplicate-identity', 'fold-question'].includes(b.reason),
      );
      if (other.length) {
        dropped.push(...other.map((b) => `${b.reason}:${labelOf(seedsNow)(b.seed)}`));
        op(
          'not-a-piece',
          `drop ${other.length} blocked pieces (${[...new Set(other.map((b) => b.reason))].join(',')})`,
          other.length,
        );
        edits = [...edits, ...other.map((b): PieceEdit => ({ kind: 'not-a-piece', seed: b.seed }))];
        pc = await run('pieces', { seeds: seedsIn ?? pc.seeds, edits, opts: { ...FILL, variant } });
      }
      sem = await run('semantics', {
        fileAllowance: c.meaning ? fileAllowance : found ?? fileAllowance,
        pieceOverrides: overrides,
        operatorGrain: grain,
        operatorFold: foldPick,
        foldListChecked,
      });
    }
    rec.droppedAtMeaning = dropped;
    // D3: what the drawing does not prove — the wizard stops on it (footer) until answered.
    // Allowance: one explicit answer for the file ("cut line" / "seam line + N mm"); quantities and
    // sheet-note names: one bulk "confirm all as shown" (per-piece corrections are the operator's).
    const lab = labelOf(seedsNow);
    const askAllowance = sem.unproven.filter((u) => u.kind === 'allowance');
    const confirm: Record<string, unknown> = {};
    if (askAllowance.length) {
      const shown = askAllowance[0].shown;
      const meaning = c.outline ?? (shown.startsWith('cut') ? 'cut' : 'seam');
      confirm.allowance = { pieces: askAllowance.length, shown, answer: meaning };
      op(
        'outline',
        `answer the outline question: ${meaning === 'cut' ? 'cut line' : `seam line + ${PATIMPORT.defaultAllowanceMm} mm`} (shown ${shown}, ${askAllowance.length} pieces)`,
      );
      fileAllowance = {
        meaning,
        allowanceMm: PATIMPORT.defaultAllowanceMm,
        origin: 'operator',
        evidence: [],
      };
      sem = await run('semantics', {
        fileAllowance,
        pieceOverrides: overrides,
        operatorGrain: grain,
        operatorFold: foldPick,
        foldListChecked,
      });
    }
    // E4: the count question of a piece the case names (`foldOnCount`, a fold the sheet draws
    // with curves) is answered "cut on fold" in the same row; the fold question that follows takes
    // the suggested edge
    const onFold = sem.unproven.filter(
      (u) =>
        u.kind === 'quantity' &&
        (c.foldOnCount ?? []).includes(lab(u.seed)) &&
        !sem.pieces.some((p) => p.seed === u.seed && p.unfoldedFold),
    );
    if (onFold.length) {
      for (const u of onFold)
        overrides[u.seed] = { ...(overrides[u.seed] ?? {}), unfoldedFold: true };
      const semIn = () => ({
        fileAllowance,
        pieceOverrides: overrides,
        operatorGrain: grain,
        operatorFold: foldPick,
        foldListChecked,
      });
      sem = await run('semantics', semIn());
      for (const u of onFold) {
        const q = sem.folds?.find((x) => x.seed === u.seed);
        const e = q && q.suggested != null ? q.edges[q.suggested] : null;
        if (e) foldPick[u.seed] = { a: e.a, b: e.b };
        op(
          'count-answer',
          `count question on ${lab(u.seed)}${u.foldAlt ? ' (cut on fold suggested)' : ''}: "cut on fold"`,
        );
        op(
          e ? 'fold-suggested' : 'note',
          e ? `pick the suggested ${e.lenMm.toFixed(0)} mm fold edge` : 'NO fold edge to pick',
        );
      }
      sem = await run('semantics', semIn());
    }
    const asks = sem.unproven.filter((u) => u.kind !== 'allowance');
    confirm.quantity = asks
      .filter((u) => u.kind === 'quantity')
      .map((u) => `${lab(u.seed)}=${u.shown}${u.foldAlt ? ' (or cut on fold?)' : ''}`);
    confirm.name = asks
      .filter((u) => u.kind === 'name')
      .map((u) => `${lab(u.seed)}=${u.shown} (${u.detail})`);
    confirm.leftAfterAllowance = sem.unproven.filter((u) => u.kind === 'allowance').length;
    confirm.clicks = (askAllowance.length ? 1 : 0) + (asks.length ? 1 : 0);
    rec.confirm = confirm;
    if (asks.length)
      op(
        'bulk-confirm',
        `confirm all as shown: ${(confirm.quantity as string[]).length} quantities, ${(confirm.name as string[]).length} names (1 click)`,
      );
    // A1 probe: E2E_GRAIN_PNG=1 → grain-<piece>.png per piece: the sheet's lines (grey), the
    // outlines, the first proposal (blue, dashed) and the written grain (red)
    if (process.env.E2E_GRAIN_PNG) {
      const grey: Stroke[] = ch.chainPreview.map((a) => {
        const pts: PtMm[] = [];
        for (let i = 0; i + 1 < a.length; i += 2) pts.push({ x: a[i], y: a[i + 1] });
        return { pts, color: '#bbbbbb', width: 0.7 };
      });
      for (const f of fams) {
        const c0 = f.candidates[0];
        if (!c0 || c0.outer.length < 3) continue;
        const b = c0.bbox;
        const box = { minX: b.minX - 15, minY: b.minY - 15, maxX: b.maxX + 15, maxY: b.maxY + 15 };
        const strokes: Stroke[] = [...grey];
        for (const c of f.candidates)
          if (c.outer.length > 2)
            strokes.push({ pts: c.outer, closed: true, color: '#000', width: 1 });
        const labels: Label[] = [];
        const pr = firstProposal.get(f.seed);
        if (pr) {
          strokes.push({ pts: [pr.a, pr.b], color: '#1f5fd6', width: 4, dash: '10 5' });
          labels.push({ at: pr.a, text: `PROPOSED · ${pr.why}`, color: '#1f5fd6', size: 14 });
        }
        const g = sem.pieces.find((p) => p.seed === f.seed)?.sizes[0]?.grain;
        if (g) {
          strokes.push({ pts: [g.a, g.b], color: '#e00000', width: 2 });
          labels.push({
            at: g.b,
            text: `${g.origin} [${(g.evidence ?? []).join('+')}]`,
            color: '#e00000',
            size: 14,
          });
        }
        const px = Math.min(3, 900 / Math.max(box.maxX - box.minX, box.maxY - box.minY));
        renderPng(
          resolve(dir, `grain-${labelOf(seedsNow)(f.seed).replace(/[^\w.-]+/g, '_')}.png`),
          box,
          strokes,
          labels,
          px,
        );
      }
    }
    rec.semFinal = {
      pieces: new Set(sem.pieces.map((p) => p.seed)).size,
      specs: sem.pieces.length,
      blocked: sem.blocked.map((b) => `${b.reason}:${b.detail.slice(0, 80)}`),
      foldList: sem.foldList ?? null,
      // A1: the written grain per identity (first size): origin, evidence, angle, ends
      grains: sem.pieces.map((p) => {
        const g = p.sizes[0]?.grain;
        return g
          ? `${p.identity}:${g.origin}[${(g.evidence ?? []).join('+')}] ${g.angleDeg.toFixed(0)}° (${g.a.x.toFixed(0)},${g.a.y.toFixed(0)})-(${g.b.x.toFixed(0)},${g.b.y.toFixed(0)})`
          : `${p.identity}:none`;
      }),
      pieceInfo: sem.pieces.map((p) => ({
        identity: p.identity,
        seed: p.seed,
        label: labelOf(seedsNow)(p.seed),
        // D3 probe: every text inside the piece that names one, T = title label, N = a note
        texts: (() => {
          const f = pc.families.find((x) => x.seed === p.seed);
          const cand = f?.candidates[f.candidates.length - 1];
          // the session's own sheet (the stage output omits texts): a probe may look inside
          const texts = (s as unknown as { sheet: { texts: IRText[] } }).sheet?.texts ?? [];
          const byId = new Map(texts.map((t) => [t.id, t]));
          const inside = (cand?.textsInside ?? []).flatMap((id) => byId.get(id) ?? []);
          return inside
            .filter((t) => process.env.E2E_TEXTS_ALL || readPieceText(t.text).code)
            .map(
              (t) =>
                `${isTitleLabel(t, inside, cand!.bbox) ? 'T' : 'N'}:${readPieceText(t.text).code}:${t.text.slice(0, 40)}@${t.fontSizeMm.toFixed(1)}`,
            )
            .slice(0, process.env.E2E_TEXTS_ALL ? 60 : 8);
        })(),
        name: p.displayName,
        nameOrigin: p.nameOrigin,
        ppg: p.piecesPerGarment,
        pair: p.pairHand,
        fold: p.unfoldedFold,
        fabrics: p.fabrics,
        allowance: `${p.allowance.meaning}/${p.allowance.allowanceMm}/${p.allowance.origin}`,
        sizes: p.sizes.map((z) => z.sizeToken),
        areasCm2: p.sizes.map((z) => Math.round(z.areaMm2 / 100)),
        bboxLargest: (() => {
          const z = p.sizes[p.sizes.length - 1];
          return z
            ? [Math.round(z.bbox.maxX - z.bbox.minX), Math.round(z.bbox.maxY - z.bbox.minY)]
            : null;
        })(),
      })),
    };
    if (sem.blocked.length) {
      rec.verdict = 'fails';
      rec.reason = `semantics still blocked: ${sem.blocked.map((b) => b.reason).join(',')}`;
      return rec;
    }
    if (!sem.pieces.length) {
      rec.verdict = 'fails';
      rec.reason = 'no pieces left after the meaning step';
      return rec;
    }
    // 7 · fabrics
    at('fabrics');
    let fab = await run('fabrics', { bom: SCOPES });
    {
      // N1: pieces on main by default (several fabric scopes) stop the run on the fabrics step
      const offer = offerOn('fabrics', { fabrics: fab, semantics: sem });
      if (offer) stop(offer);
    }
    const plan = planScopes(sem.pieces, fab, SCOPES);
    rec.fabrics = {
      byPurpose: Object.fromEntries(
        Object.entries(fab.byPurpose).map(([k, v]) => [
          k.replace('TECH_CARD_BOM_PURPOSE_', ''),
          v.length,
        ]),
      ),
      refused: (fab.refused ?? []).map((r) => `${r.label}:${r.seeds.length}`),
      proposals: fab.proposals.length,
      problems: plan.problems.map((p) => p.message),
    };
    if (plan.problems.length) {
      op(
        'fabrics',
        `fabrics step blocks: ${plan.problems[0].message.slice(0, 80)} → all pieces to main`,
      );
      fab = {
        ...fab,
        byPurpose: { TECH_CARD_BOM_PURPOSE_MAIN: [...new Set(sem.pieces.map((p) => p.seed))] },
      };
    }
    // 8 · write + gate — the run always stops on check
    at('check');
    const writeSizes = sz.map.entries.flatMap((e) =>
      e.card
        ? [
            {
              token: e.card.token,
              sizeId: e.card.sizeId,
              name: e.card.name,
              sourceLabel: e.source.label,
              rank: e.source.rank,
            },
          ]
        : [],
    );
    const wr = await run('write', {
      techCardId: CARD_ID,
      scopes: SCOPES,
      assignment: fab,
      sizes: writeSizes,
      dialect: 'r12',
      generator: 'e2e-probe',
    });
    // A0.5 (B1): what the card will read back from each written file — the manifest embedded in
    // the DXF — must be the card, the scope and the sizes this run was given
    const manifestProblems: string[] = [];
    for (const sc of wr.scopes) {
      const want = SCOPES.find((x) => x.scopeKey === sc.target.scopeKey);
      const m = readManifest(sc.dxfText);
      const at = sc.target.scopeKey.replace('TECH_CARD_BOM_PURPOSE_', '');
      if (!want) manifestProblems.push(`${at}: scope not among the run's scopes`);
      if (!m) {
        manifestProblems.push(`${at}: no manifest in the written file`);
        continue;
      }
      if (m.techCardId !== CARD_ID)
        manifestProblems.push(`${at}: techCardId ${m.techCardId} ≠ ${CARD_ID}`);
      if (
        want &&
        (m.scope.fabricPurpose !== want.fabricPurpose || m.scope.bomLineKey !== want.bomLineKey)
      )
        manifestProblems.push(
          `${at}: scope ${m.scope.fabricPurpose}/${m.scope.bomLineKey} ≠ ${want.fabricPurpose}/${want.bomLineKey}`,
        );
      const got = m.sizes.map((z) => `${z.token}#${z.sizeId}`).join(',');
      const exp = writeSizes.map((z) => `${z.token}#${z.sizeId}`).join(',');
      if (got !== exp) manifestProblems.push(`${at}: sizes [${got}] ≠ [${exp}]`);
    }
    rec.manifestCheck = { ok: manifestProblems.length === 0, problems: manifestProblems };
    const scopes = [];
    for (const sc of wr.scopes) {
      const g = wr.gate[sc.target.scopeKey];
      const blocking = g?.checks.filter((k) => !k.ok && k.severity === 'block') ?? [];
      const warns = g?.checks.filter((k) => !k.ok && k.severity === 'warn') ?? [];
      const blocks = sc.manifest.blocks.map((b) => b.block);
      const bad = new Set<string>();
      for (const k of blocking)
        for (const b of k.blocks) {
          if (blocks.includes(b)) bad.add(b);
          else for (const x of blocks) if (x.startsWith(`${b}_`) || x === b) bad.add(x);
        }
      const allBad = blocking.some((k) => !k.blocks.length);
      const file = resolve(dir, sc.filename.replace(/[^\w.-]+/g, '_'));
      writeFileSync(file, sc.dxfText);
      const png = file.replace(/\.dxf$/i, '') + '.png';
      const rt = await renderDxf(sc.dxfText, png);
      scopes.push({
        scope: sc.target.label,
        file,
        png,
        identities: sc.identities.length,
        blocks: blocks.length,
        blocksPassing: allBad ? 0 : blocks.length - bad.size,
        passed: !!g?.passed,
        blocking: blocking.map(
          (k) =>
            `${k.id}[${k.blocks.slice(0, 6).join(',')}${k.blocks.length > 6 ? `,+${k.blocks.length - 6}` : ''}] ${k.note.slice(0, 160)}`,
        ),
        warns: warns.map((k) => `${k.id}: ${k.note.slice(0, 120)}`),
        roundtripPieces: rt,
        manifestBlocks: sc.manifest.blocks.map((b) => ({
          block: b.block,
          size: b.sizeToken,
          area: Math.round(b.areaMm2 / 100),
          bbox: [Math.round(b.bboxMm[2] - b.bboxMm[0]), Math.round(b.bboxMm[3] - b.bboxMm[1])],
        })),
      });
    }
    rec.write = scopes;
    const tc = truthCheckOf(c, (rec.semFinal as { pieceInfo: PieceInfo[] }).pieceInfo);
    if (tc) {
      rec.truthCheck = tc;
      rec.wrongPassing = scopes.length && scopes.every((x) => x.passed) ? tc.wrong.length : 0;
    }
    // traced (scan) sources: per written size, the cleaned line over the traced outline and the
    // source walls — the proof that the outline the offset ran on stays on the scan (E3)
    if ((rec.read as { scanPages?: number })?.scanPages)
      rec.traced = tracedOverlays(
        dir,
        sem,
        pc.families,
        (s as unknown as { wallsOf: ((id: string, rank: number) => PtMm[][] | undefined) | null })
          .wallsOf,
        c.scanTruth
          ? synthTruth(synthDrawables())
              .filter((t) => t.group === 'piece')
              .map((t) => t.pts)
          : undefined,
      );
    const allPassed =
      scopes.length > 0 && scopes.every((x) => x.passed) && manifestProblems.length === 0;
    const hard = rec.ops.filter((o) => o.kind === 'blocker');
    rec.verdict = !allPassed
      ? 'fails'
      : rec.ops.length === 0
        ? 'auto'
        : hard.length
          ? 'fails'
          : 'needs operator';
    if (manifestProblems.length) rec.reason = `manifest round trip: ${manifestProblems.join('; ')}`;
    else if (!allPassed)
      rec.reason = `gate blocks: ${scopes.flatMap((x) => x.blocking.map((b) => b.split('[')[0])).join(',')}`;
  } catch (e) {
    rec.verdict = 'fails';
    rec.error = String((e as Error)?.stack ?? e).slice(0, 600);
  } finally {
    // N1: a reached screen that asked nothing is passed by the wizard; the fast path / one-page
    // sheet pass theirs whatever they hold; a screen never reached keeps its "next"
    for (const sc of AUTO_SCREENS)
      if (passed.has(sc) || (reached.has(sc) && !stops.has(sc))) skipped.push(sc);
    rec.clicks = clicksOf(rec.ops, skipped.length);
    rec.skippedScreens = skipped;
    rec.stops = Object.fromEntries(stops);
    rec.totalMs = Date.now() - T0;
    rec.peakRssMb = peakMb();
    s.close();
  }
  return rec;
}

/** Distances from samples of `a` (every 0.5 mm) to the nearest of `lines`, mm. */
function distsTo(
  a: PtMm[],
  lines: PtMm[][],
  closed: boolean,
  aClosed = true,
): { p: PtMm; d: number }[] {
  const segs: [PtMm, PtMm][] = [];
  for (const l of lines)
    for (let i = 0; i < (closed ? l.length : l.length - 1); i++)
      segs.push([l[i], l[(i + 1) % l.length]]);
  const C = 5;
  const grid = new Map<string, number[]>();
  segs.forEach(([p, q], k) => {
    for (let x = Math.floor(Math.min(p.x, q.x) / C); x <= Math.floor(Math.max(p.x, q.x) / C); x++)
      for (let y = Math.floor(Math.min(p.y, q.y) / C); y <= Math.floor(Math.max(p.y, q.y) / C); y++)
        grid.set(`${x},${y}`, [...(grid.get(`${x},${y}`) ?? []), k]);
  });
  const out: { p: PtMm; d: number }[] = [];
  for (let i = 0; i < (aClosed ? a.length : a.length - 1); i++) {
    const p0 = a[i];
    const p1 = a[(i + 1) % a.length];
    const n = Math.max(1, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y) / 0.5));
    for (let j = 0; j < n; j++) {
      const p = { x: p0.x + ((p1.x - p0.x) * j) / n, y: p0.y + ((p1.y - p0.y) * j) / n };
      let best = Infinity;
      const cx = Math.floor(p.x / C);
      const cy = Math.floor(p.y / C);
      for (let x = cx - 1; x <= cx + 1; x++)
        for (let y = cy - 1; y <= cy + 1; y++)
          for (const k of grid.get(`${x},${y}`) ?? []) {
            const [u, v] = segs[k];
            const dx = v.x - u.x;
            const dy = v.y - u.y;
            const L2 = dx * dx + dy * dy;
            const t = L2 ? Math.max(0, Math.min(1, ((p.x - u.x) * dx + (p.y - u.y) * dy) / L2)) : 0;
            best = Math.min(best, Math.hypot(p.x - u.x - t * dx, p.y - u.y - t * dy));
          }
      out.push({ p, d: best });
    }
  }
  return out;
}

function tracedOverlays(
  dir: string,
  sem: StageIO['semantics']['out'],
  fams: PieceFamily[],
  wallsOf: ((id: string, rank: number) => PtMm[][] | undefined) | null,
  truth?: PtMm[][],
) {
  const rows: Record<string, unknown>[] = [];
  const q = (xs: number[], k: number) => {
    const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
    return v.length ? +v[Math.min(v.length - 1, Math.floor(k * v.length))].toFixed(3) : null;
  };
  for (const sp of sem.pieces) {
    for (const z of sp.sizes) {
      const raw = fams.find((f) => f.seed === sp.seed)?.candidates.find((c) => c.rank === z.rank);
      if (!raw?.outer.length) continue;
      const drawn = sp.allowance.meaning === 'seam' ? z.seam ?? z.cut : z.cut;
      const other = sp.allowance.meaning === 'seam' ? z.cut : z.seam;
      const walls = wallsOf?.(sp.identity, z.rank) ?? [];
      const toRaw = distsTo(drawn, [raw.outer], true).map((x) => x.d);
      const toWalls = walls.length ? distsTo(drawn, walls, false) : [];
      const far = toWalls.filter((x) => x.d > PATIMPORT.snapMm);
      // G3's side: the used wall stretches (voted by the written line, as the write stage does on
      // a scan) that the written line leaves
      const used = walls.length ? wallsUsedBy(walls, drawn) : [];
      const left = used
        .flatMap((w) => distsTo(w, [drawn], true, false))
        .filter((x) => x.d > PATIMPORT.snapMm);
      const xs = raw.outer.map((p) => p.x);
      const ys = raw.outer.map((p) => p.y);
      const box = {
        minX: Math.min(...xs) - 15,
        maxX: Math.max(...xs) + 15,
        minY: Math.min(...ys) - 15,
        maxY: Math.max(...ys) + 15,
      };
      const file = resolve(dir, `traced-${sp.identity}-${z.sizeToken}.png`);
      renderPng(
        file,
        box,
        [
          ...walls.map((w) => ({ pts: w, color: '#bbbbbb', width: 2.4 })),
          ...(truth ?? []).map((t) => ({ pts: t, closed: true, color: '#000000', width: 0.4 })),
          { pts: raw.outer, closed: true, color: '#e03030', width: 0.8, dash: '3 2' },
          { pts: drawn, closed: true, color: '#1050d0', width: 0.9 },
          ...(other ? [{ pts: other, closed: true, color: '#20a050', width: 0.9 }] : []),
        ],
        [
          ...far
            .filter((_, i) => i % 4 === 0)
            .map((x) => ({ at: x.p, text: '•', color: '#d00', size: 8 })),
          ...left
            .filter((_, i) => i % 4 === 0)
            .map((x) => ({ at: x.p, text: '◦', color: '#a0a', size: 8 })),
        ],
        Math.min(10, Math.max(2, 1400 / Math.max(box.maxX - box.minX, box.maxY - box.minY))),
        [
          { color: '#bbbbbb', text: 'source walls (traced chains)' },
          { color: '#e03030', text: 'traced outline (fill)' },
          { color: '#1050d0', text: `written ${sp.allowance.meaning} line (cleaned)` },
          { color: '#20a050', text: 'derived line (offset)' },
          ...(truth
            ? [
                {
                  color: '#000000',
                  text: 'vector truth, all sizes (printed frame, not registered)',
                },
              ]
            : []),
        ],
      );
      rows.push({
        block: `${sp.identity}_${z.sizeToken}`,
        png: file,
        writtenToTracedMaxMm: q(toRaw, 1),
        writtenToWallsP95Mm: q(
          toWalls.map((x) => x.d),
          0.95,
        ),
        writtenToWallsMaxMm: q(
          toWalls.map((x) => x.d),
          1,
        ),
        writtenOffWallsMm: +(far.length * 0.5).toFixed(1),
        usedWallsOffLineMm: +(left.length * 0.5).toFixed(1),
        usedWallsOffHist: [0.5, 0.75, 1, 2, Infinity].map(
          (t, i, a) => left.filter((x) => x.d <= t && (i === 0 || x.d > a[i - 1])).length * 0.5,
        ),
        usedWallsOffAt: left.length ? [Math.round(left[0].p.x), Math.round(left[0].p.y)] : null,
        offset: z.offset
          ? { ok: z.offset.ok, loops: z.offset.loops, devMm: +z.offset.maxDeviationMm.toFixed(3) }
          : null,
      });
    }
  }
  return rows;
}

/** One interior point per nest of closed lines (the innermost loop of the nest ≥ 50 % of its area). */
function oracleClicks(preview: Float32Array[]): { label: string; at: [number, number] }[] {
  type L = {
    pts: PtMm[];
    area: number;
    box: { minX: number; minY: number; maxX: number; maxY: number };
  };
  const loops: L[] = [];
  for (const a of preview) {
    if (a.length < 8) continue;
    const n = a.length / 2;
    if (Math.hypot(a[0] - a[2 * n - 2], a[1] - a[2 * n - 1]) > 1) continue;
    const pts: PtMm[] = [];
    for (let i = 0; i < n; i++) pts.push({ x: a[2 * i], y: a[2 * i + 1] });
    let s = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    const area = Math.abs(s) / 2;
    if (area < 2000) continue; // 20 cm²
    const box = {
      minX: Math.min(...pts.map((p) => p.x)),
      minY: Math.min(...pts.map((p) => p.y)),
      maxX: Math.max(...pts.map((p) => p.x)),
      maxY: Math.max(...pts.map((p) => p.y)),
    };
    loops.push({ pts, area, box });
  }
  const inside = (p: PtMm, poly: PtMm[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i],
        b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  loops.sort((x, y) => y.area - x.area);
  const outer = loops.filter(
    (l, i) =>
      !loops
        .slice(0, i)
        .some((o) => inside(l.pts[0], o.pts) && inside(l.pts[Math.floor(l.pts.length / 2)], o.pts)),
  );
  const out: { label: string; at: [number, number] }[] = [];
  outer.forEach((o, k) => {
    const nest = loops.filter(
      (l) => (l.area >= 0.5 * o.area && l.area <= o.area && inside(l.pts[0], o.pts)) || l === o,
    );
    const inner = nest[nest.length - 1];
    // a point inside the innermost loop: scan rows of its box
    for (let r = 1; r < 20; r++) {
      const y = inner.box.minY + ((inner.box.maxY - inner.box.minY) * r) / 20;
      const xs: number[] = [];
      for (let i = 0, j = inner.pts.length - 1; i < inner.pts.length; j = i++) {
        const a = inner.pts[i],
          b = inner.pts[j];
        if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
      }
      xs.sort((p, q) => p - q);
      if (xs.length >= 2 && xs[1] - xs[0] > 20 && r >= 8) {
        out.push({ label: `click ${k + 1}`, at: [(xs[0] + xs[1]) / 2, y] });
        return;
      }
    }
  });
  return out;
}

// ── A7 truth check (light) ──────────────────────────────────────────────────────────────
// Per written piece whose seed label names a K0 truth piece (corpus/truth.json): the count per
// garment (Σ pieces per garment over its identities, a pair = 2) against `qty`, and `fold` truth ⇒
// the piece was unfolded. A piece the gate passes with either wrong is "wrong but passing".
// TODO(A7): area ±20 % to `bbox_mm_est` (the estimate is of the largest size, ±10–15 %).

type PieceInfo = { seed: number; label: string; ppg: number; fold: boolean };

export function truthCheckOf(c: Case, info: readonly PieceInfo[]) {
  if (!c.truth) return null;
  let pieces: { label: string; qty: unknown; fold: unknown }[] = [];
  try {
    const t = JSON.parse(readFileSync(resolve(CORPUS, 'truth.json'), 'utf8')) as {
      samples: { id: string; variants: { pieces: typeof pieces }[] }[];
    };
    pieces =
      t.samples.find((x) => x.id === c.truth!.id)?.variants[c.truth.variant ?? 0]?.pieces ?? [];
  } catch {
    return null;
  }
  const norm = (x: string) =>
    x
      .toLowerCase()
      .replace(/^piece\s+/, '')
      .replace(/\.$/, '')
      .trim();
  const bySeed = new Map<number, PieceInfo[]>();
  for (const p of info) bySeed.set(p.seed, [...(bySeed.get(p.seed) ?? []), p]);
  const wrong: string[] = [];
  let matched = 0;
  for (const [, ps] of bySeed) {
    const lab = norm(ps[0].label);
    const t = pieces.find((x) => norm(x.label) === lab || norm(x.label.split(' / ')[0]) === lab);
    if (!t) continue;
    matched++;
    const qty = typeof t.qty === 'number' ? t.qty : parseInt(String(t.qty), 10);
    const got = ps.reduce((a, p) => a + p.ppg, 0);
    if (Number.isFinite(qty) && got !== qty) wrong.push(`${ps[0].label}: qty ${got} ≠ ${qty}`);
    if (t.fold === true && !ps.some((p) => p.fold)) wrong.push(`${ps[0].label}: not unfolded`);
  }
  return { truthPieces: pieces.length, matched, wrong };
}

// ── renders ─────────────────────────────────────────────────────────────────────────────

function renderPieces(
  dir: string,
  preview: Float32Array[],
  fams: PieceFamily[],
  seeds: Seed[],
  exported: Set<number>,
  sheetBox: { minX: number; minY: number; maxX: number; maxY: number },
) {
  const chains: Stroke[] = preview.map((a) => {
    const pts: PtMm[] = [];
    for (let i = 0; i + 1 < a.length; i += 2) pts.push({ x: a[i], y: a[i + 1] });
    return { pts, color: '#c8c8c8', width: 0.6 };
  });
  const sheetStrokes: Stroke[] = [...chains];
  const sheetLabels: Label[] = [];
  fams.forEach((f, i) => {
    const sd = seeds.find((x) => x.id === f.seed);
    const lab = (sd?.text?.text ?? sd?.origin ?? '?').slice(0, 20);
    const strokes: Stroke[] = [...chains];
    const labels: Label[] = [];
    let box = null as null | { minX: number; minY: number; maxX: number; maxY: number };
    for (const c of f.candidates) {
      if (!exported.has(c.rank)) continue;
      const col = PALETTE[c.rank % PALETTE.length];
      if (c.outcome === 'leak' && c.leakAt)
        labels.push({ at: c.leakAt, text: `LEAK r${c.rank}`, color: '#d00', size: 12 });
      if (c.outer.length < 3) continue;
      const st = {
        pts: c.outer,
        closed: true,
        color: c.outcome === 'closed' ? col : '#d00',
        width: 1.4,
        dash: c.outcome === 'closed' ? undefined : '6 3',
      };
      strokes.push(st);
      sheetStrokes.push({ ...st, width: 1 });
      const top = c.outer.reduce((a, b) => (b.y > a.y ? b : a));
      labels.push({
        at: { x: top.x + 2 + c.rank * 10, y: top.y + 4 },
        text: String(c.rank),
        color: col,
        size: 11,
      });
      if (c.outcome === 'closed') {
        const b = c.bbox;
        box = box
          ? {
              minX: Math.min(box.minX, b.minX),
              minY: Math.min(box.minY, b.minY),
              maxX: Math.max(box.maxX, b.maxX),
              maxY: Math.max(box.maxY, b.maxY),
            }
          : { ...b };
      }
    }
    if (sd) {
      labels.push({
        at: sd.at,
        text: `● ${lab}${f.monotone ? '' : ' NOT-MONO'}`,
        color: '#000',
        size: 16,
      });
      sheetLabels.push({ at: sd.at, text: lab, color: '#000', size: 16 });
    }
    if (!box) return;
    const pad = 25;
    const bx = {
      minX: box.minX - pad,
      minY: box.minY - pad,
      maxX: box.maxX + pad,
      maxY: box.maxY + pad,
    };
    const span = Math.max(bx.maxX - bx.minX, bx.maxY - bx.minY);
    const px = Math.min(3, 1400 / span);
    try {
      renderPng(
        resolve(dir, `piece-${String(i + 1).padStart(2, '0')}-${lab.replace(/[^\w]+/g, '_')}.png`),
        bx,
        strokes,
        labels,
        px,
      );
    } catch {
      /* rsvg missing: renders are optional */
    }
  });
  const span = Math.max(sheetBox.maxX - sheetBox.minX, sheetBox.maxY - sheetBox.minY);
  try {
    renderPng(
      resolve(dir, 'sheet.png'),
      sheetBox,
      sheetStrokes,
      sheetLabels,
      Math.min(1, 2400 / span),
    );
  } catch {
    /* optional */
  }
}

/** The written DXF through the CARD's parser (G1's view), drawn as the card would see it. */
async function renderDxf(text: string, png: string) {
  const rt = await roundTrip(text);
  const strokes: Stroke[] = [];
  const labels: Label[] = [];
  let box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const sizesSeen: string[] = [];
  const largest = new Map<string, { at: PtMm; area: number }>();
  for (const p of rt.pieces) {
    const pts = contourMm(p);
    const name = p.blockName ?? p.name;
    const tok = name.split('_').pop() ?? '';
    if (!sizesSeen.includes(tok)) sizesSeen.push(tok);
    const col = PALETTE[sizesSeen.indexOf(tok) % PALETTE.length];
    strokes.push({ pts, closed: true, color: col, width: 1 });
    for (const q of pts) {
      box = {
        minX: Math.min(box.minX, q.x),
        minY: Math.min(box.minY, q.y),
        maxX: Math.max(box.maxX, q.x),
        maxY: Math.max(box.maxY, q.y),
      };
    }
    const id = name.slice(0, name.lastIndexOf('_')) || name;
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
    const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
    if (!largest.has(id) || Math.abs(a) > largest.get(id)!.area)
      largest.set(id, { at: { x: cx, y: cy }, area: Math.abs(a) });
  }
  for (const [id, v] of largest) labels.push({ at: v.at, text: id, color: '#000', size: 14 });
  if (Number.isFinite(box.minX)) {
    const pad = 20;
    const bx = {
      minX: box.minX - pad,
      minY: box.minY - pad,
      maxX: box.maxX + pad,
      maxY: box.maxY + pad,
    };
    const span = Math.max(bx.maxX - bx.minX, bx.maxY - bx.minY);
    try {
      renderPng(
        png,
        bx,
        strokes,
        labels,
        Math.min(2, 2000 / span),
        sizesSeen.map((t, i) => ({ color: PALETTE[i % PALETTE.length], text: t })),
      );
    } catch {
      /* optional */
    }
  }
  return {
    pieces: rt.pieces.length,
    blocks: rt.blockNames?.length ?? null,
    failedFiles: rt.failedFiles ?? 0,
    warnings: (rt.warnings ?? []).slice(0, 3),
  };
}

// ── f17 sweep: every odd input is refused at open with a typed reason (or read) ──────────

export function f17Sweep() {
  const dir = resolve(CORPUS, 'synthetic/f17');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((f) => {
    const b = readFileSync(resolve(dir, f));
    try {
      new Session(1, [
        {
          name: f,
          bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
        },
      ]).close();
      return { file: f, opened: true };
    } catch (e) {
      const w = toWireError(e);
      return { file: f, opened: false, code: w.code, message: w.message.slice(0, 140) };
    }
  });
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'list') {
    console.log(JSON.stringify(CASES.map((c) => c.id)));
    return 0;
  }
  if (args[0] === 'cmp') {
    for (const r of await cmpDxf(args[1], args[2])) console.log(r);
    return 0;
  }
  if (args[0] === 'f17') {
    console.log(`@@RESULT ${JSON.stringify({ id: 'f17', sweep: f17Sweep() })}`);
    return 0;
  }
  const want = args.length ? CASES.filter((c) => args.includes(c.id)) : CASES;
  for (const c of want) {
    const r = await runCase(c);
    console.log(`@@RESULT ${JSON.stringify(r)}`);
  }
  return 0;
}

/**
 * `cmp <source.dxf> <written.dxf>`: per block name and layer, the source contour area vs the written
 * one, through the card's parser — catches a cut line that moved (allowance added twice, wrong layer).
 */
export async function cmpDxf(src: string, out: string) {
  const area = (pts: PtMm[]) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(a) / 2 / 100;
  };
  const read = async (p: string) => {
    const r = await roundTrip(readFileSync(p).toString('latin1'), basename(p));
    const m = new Map<string, Record<string, number>>();
    for (const q of r.pieces) {
      const k = (q.blockName ?? q.name).toUpperCase();
      const e = m.get(k) ?? {};
      e[q.layer ?? '?'] = Math.round(area(contourMm(q)));
      m.set(k, e);
    }
    return m;
  };
  const a = await read(src);
  const b = await read(out);
  const rows: string[] = [];
  for (const [k, v] of b) {
    const s =
      a.get(k) ??
      [...a.entries()].find(
        ([n]) => n.replace(/[^A-Z0-9]/g, '') === k.replace(/[^A-Z0-9]/g, ''),
      )?.[1];
    rows.push(`${k.padEnd(24)} out ${JSON.stringify(v)}  src ${JSON.stringify(s ?? null)}`);
  }
  return rows;
}

/** Even-odd point in polygon (A2: does a fixture click fall in a face seed's closed outline). */
function insidePoly(p: PtMm, poly: readonly PtMm[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
