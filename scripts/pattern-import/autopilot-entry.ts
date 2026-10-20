// PATTERN-IMPORT · A10 AUTOPILOT METRIC — every e2e corpus case through the REAL wizard hook
// (use-import-session.ts, React replaced by the one-component shim) over an in-process worker
// Session, with the autopilot answering every question instead of the TRUTH-driven operator:
// 0 clicks, no AI names (headless). Per case: reached apply (gate passed) or stopped (step +
// reason); then the export against corpus/truth.json — pieces matched, counts, folds, sizes,
// outline, fabric, model — each wrong item attributed to the assumption that gave it (or to the
// sheet's own evidence when nothing was assumed). Grain has no truth: the fallback rule is scored
// against the grainlines the sheets DO draw (A1 'detected').
//   node scripts/pattern-import/autopilot.mjs [case…] [--mutate=qty|size]
//   (yarn patimport:autopilot · yarn patimport:e2e --autopilot)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { readManifest } from 'lib/pattern-import/manifest';
import { sizeKey } from 'lib/pattern-import/sizes/map';
import { PATIMPORT, SLIVER_MM } from 'lib/pattern-import/types';
import { answersNowOf } from 'components/managers/tech-card/components/pattern-import/answers';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import { toWireError } from 'lib/pattern-import/worker/errors';
import type {
  CardSize,
  DraftScopeTarget,
  PageClassification,
  PieceFamily,
  Seed,
  SeedId,
  SizeMapEntry,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';
import type {
  CardContext,
  ImportClient,
} from 'components/managers/tech-card/components/pattern-import/client';
import { stubBuildDraft } from 'components/managers/tech-card/components/pattern-import/stub-client';
import {
  exportedRanks,
  useImportSession,
  variantsOf,
  type ImportSessionApi,
} from 'components/managers/tech-card/components/pattern-import/use-import-session';
import {
  angleDiff180,
  autopilotAnswer,
  autopilotRecordOf,
  autopilotApply,
  hookDriveCtx,
  resolverFor,
  fallbackGrain,
  longestStraight,
  modelFromCard,
  principalAxis,
  sheetFromCard,
  type Assumption,
  type AutopilotAnswer,
  type AutopilotSnapshot,
} from 'components/managers/tech-card/components/pattern-import/autopilot';

import { CARD_ID, CASES } from './e2e-entry';
import { mountHook, rerender } from './react-hook-shim';
import {
  driveTick,
  newDriveState,
} from 'components/managers/tech-card/components/pattern-import/auto-drive';
import { splitSize } from './worker-entry';
import { fixturePageRoleDeps } from './page-roles-fixture';

type Case = (typeof CASES)[number] & {
  /** A10 card controls: the run must stop ON this question, never pick (unreached = FAIL). */
  expectStop?: 'pieces';
  /** The stop must be the card question (not another one of the step). */
  expectReason?: RegExp;
  /**
   * The control's harness answers the files step's page-role question the way TRUTH reads those
   * pages (instructions / overview: they stay aside) — the question this control is not about,
   * which today stops the run before the sheet (A9's lane).
   */
  operatorPages?: boolean;
  /** Rename during the run: once the model is picked the card's name becomes this. */
  renameTo?: string;
  /** The model the run must end on (the rename control: the choice is made again). */
  expectVariant?: RegExp;
  /** Operator bypass: on the sheet question, "next" must not import the default sheet. */
  bypass?: boolean;
  /**
   * D6 control: the drawing must hold this many tile sheets and the run must never stop on the
   * sheet step (no sheet is ever picked). Unreached (stopped before the sheet step) FAILS.
   */
  expectSheets?: number;
  /** The uploaded files' names, as given (a misleading file name). */
  renameFiles?: string[];
};

const MODEL_Q = /models? \(.*\) and /;
/**
 * A10 controls of the card match (Codex review of 48068988): a card that names nothing, a model
 * not on the sheet, two models (written apart and as a compact list), a misleading file name, two
 * sheets, a model spread over the sheets with an explicit sheet, a bare number on the card, a
 * rename during the run, the operator's "next" past the sheet question. Each must STOP on its
 * question (never pick); one that does not reach the question FAILS. Not counted in "reached
 * apply". `--mutate=card` injects a pick at each control's question: every one must be caught.
 */
const fromCase = (id: string, over: Partial<Case> & { id: string }): Case[] => {
  const base = CASES.find((c) => c.id === id);
  return base ? [{ ...base, ...over }] : [];
};
const CONTROLS: Case[] = [
  ...(
    [
      ['none', 'Phoebe Jumpsuit', []],
      ['foreign', 'Phoebe Jumpsuit · Style C', []],
      ['two', 'Phoebe Jumpsuit · Style A / Style B', []],
      ['compact', 'Phoebe Jumpsuit · Style A/B', []],
      ['file-against', 'Phoebe Jumpsuit · Style B', ['phoebe_style_A.pdf']],
      ['file-only', 'Phoebe Jumpsuit', ['phoebe_style_B.pdf']],
    ] as const
  ).flatMap(([k, name, files]) =>
    fromCase('kombinezon-B', {
      id: `control:kombinezon-card-${k}`,
      cardName: name,
      ...(files.length ? { renameFiles: [...files] } : {}),
      expectStop: 'pieces',
      expectReason: MODEL_Q,
    }),
  ),
  ...fromCase('kombinezon-B', {
    id: 'control:kombinezon-card-rename',
    cardName: 'Phoebe Jumpsuit · Style B',
    renameTo: 'Phoebe Jumpsuit · Style A',
    expectVariant: /Style A/,
    // after the rename the card IS Style A: scored as kombinezon-A
    variant: /A/,
    truth: { id: 'kombinezon', variant: 0 },
  }),
  // D6 (one PDF = one garment): a file of several tile sheets is never a sheet question — whatever
  // the card names (a sheet letter, nothing, a model spread over both), the run imports EVERY sheet
  // and never stops on the sheet step. (Replaces the A10 "pick the sheet" controls of 11.10.)
  ...(
    [
      ['none', 'Mantel & Jacke 44-54'],
      ['sheetB', 'Mantel & Jacke · Bogen B'],
      ['spread', 'Mantel & Jacke Mod. 7142 · Bogen B'],
    ] as const
  ).flatMap(([k, name]) =>
    fromCase('polupalto', {
      id: `control:polupalto-d6-${k}`,
      cardName: name,
      expectSheets: 2,
      operatorPages: true,
    }),
  ),
  ...fromCase('r4454', {
    id: 'control:r4454-d6',
    expectSheets: 2,
    operatorPages: true,
  }),
];
const ALL: Case[] = [...CASES, ...CONTROLS];

// ── the card match on its own: adversarial rows, each with a twin that must flip ────────────────
// Every row expects no pick (or a suggestion the autopilot stops on); its twin — the same input
// with the one fact the guard is about put right — must give the strong pick, so a row cannot pass
// for an unrelated reason (the row's mutation).
type Expect = 'none' | 'weak' | `strong:${string}`;
type Row = {
  id: string;
  name?: string;
  style?: string;
  files?: string[];
  labels?: string[];
  pages?: PageClassification[];
  expect: Expect;
  twin: {
    name?: string;
    style?: string;
    files?: string[];
    pages?: PageClassification[];
    expect: Expect;
  };
};
const pg = (
  cls: PageClassification['cls'],
  sheet: number | undefined,
  models?: string[],
  sheets?: string[],
): PageClassification => ({
  file: '0',
  page: 0,
  cls,
  ...(sheet != null ? { sheet } : {}),
  confidence: 1,
  why: '',
  ...(models || sheets
    ? { labels: { ...(models ? { models } : {}), ...(sheets ? { sheets } : {}) } }
    : {}),
});
const M3 = ['Mod. 112', 'Mod. 113', 'Mod. 2026'];
const AB = ['Style A', 'Style B'];
const ROWS: Row[] = [
  // an article / SKU / ref number in any spelling is never a model token (style field and name)
  {
    id: 'article-style-1',
    style: 'Art.-Nr. 112',
    labels: M3,
    expect: 'none',
    twin: { style: '112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-name-1',
    name: 'Coat Art.-Nr. 112',
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Mod. 112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-style-2',
    style: 'Article No. 112',
    labels: M3,
    expect: 'none',
    twin: { style: '112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-name-2',
    name: 'Coat Article No. 112',
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Mod. 112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-style-3',
    style: 'Art-Nr 112',
    labels: M3,
    expect: 'none',
    twin: { style: '112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-name-3',
    name: 'Coat Art-Nr 112',
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Mod. 112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-style-4',
    style: 'Artikelnummer 112',
    labels: M3,
    expect: 'none',
    twin: { style: '112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-name-4',
    name: 'Coat Artikelnummer 112',
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Mod. 112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-style-5',
    style: 'SKU 112',
    labels: M3,
    expect: 'none',
    twin: { style: '112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-name-5',
    name: 'Coat SKU 112',
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Mod. 112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-style-6',
    style: 'Ref. 112',
    labels: M3,
    expect: 'none',
    twin: { style: '112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-name-6',
    name: 'Coat Ref. 112',
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Mod. 112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-style-7',
    style: 'артикул 112',
    labels: M3,
    expect: 'none',
    twin: { style: '112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-name-7',
    name: 'Coat артикул 112',
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Mod. 112', expect: 'strong:Mod. 112' },
  },
  // a style-number field with more than the bare value: a suggestion only
  {
    id: 'style-field-not-bare',
    style: 'FW26 112',
    labels: M3,
    expect: 'weak',
    twin: { style: '112', expect: 'strong:Mod. 112' },
  },

  // Codex re-check #2: an article number is another namespace; prefixes match within their family
  {
    id: 'article-explicit',
    name: 'Coat Art. 112',
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Mod. 112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'article-style-field',
    style: 'Artikel 112',
    labels: M3,
    expect: 'none',
    twin: { style: '112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'family-mod-vs-style',
    name: 'Phoebe Model A',
    labels: AB,
    expect: 'none',
    twin: { name: 'Phoebe Style A', expect: 'strong:Style A' },
  },
  {
    id: 'family-style-vs-mod',
    name: 'Coat Style 112',
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Modell 112', expect: 'strong:Mod. 112' },
  },
  // Codex re-check #1: a tile-local legend listing several models proves no ownership
  {
    id: 'tile-legend-mixed',
    name: 'Coat Mod. 112',
    pages: [pg('tile', 0, ['Mod. 112', 'Mod. 114']), pg('tile', 1, ['Mod. 114'])],
    expect: 'none',
    twin: {
      name: 'Coat Mod. 112',
      pages: [
        pg('tile', 0, ['Mod. 112', 'Mod. 114']),
        pg('tile', 0, ['Mod. 112']),
        pg('tile', 1, ['Mod. 114']),
      ],
      expect: 'strong:0',
    },
  },
  {
    id: 'tile-legend-every-sheet',
    name: 'Coat Mod. 114',
    pages: [pg('tile', 0, ['Mod. 112', 'Mod. 114']), pg('tile', 1, ['Mod. 114'])],
    expect: 'none',
    twin: {
      name: 'Coat Mod. 114',
      pages: [pg('tile', 0, ['Mod. 112']), pg('tile', 1, ['Mod. 114'])],
      expect: 'strong:1',
    },
  },

  {
    id: 'dimension',
    name: 'Coat 112 cm',
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Mod. 112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'season',
    name: 'Coat FW 2026',
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Mod. 2026', expect: 'strong:Mod. 2026' },
  },
  {
    id: 'article-bare',
    name: 'Coat 112',
    labels: M3,
    expect: 'weak',
    twin: { name: 'Coat', style: '112', expect: 'strong:Mod. 112' },
  },
  {
    id: 'serial-zero',
    style: 'FW26-012',
    labels: ['Mod. 12', 'Mod. 13'],
    expect: 'none',
    twin: { style: 'Mod. 012', expect: 'strong:Mod. 12' },
  },
  {
    id: 'file-dimension',
    name: 'Coat',
    files: ['page_112_cm.pdf'],
    labels: M3,
    expect: 'none',
    twin: { name: 'Coat Mod. 112', files: ['page_112_cm.pdf'], expect: 'strong:Mod. 112' },
  },
  {
    id: 'file-against-card',
    name: 'Phoebe Style A',
    files: ['phoebe_style_B.pdf'],
    labels: AB,
    expect: 'none',
    twin: { name: 'Phoebe Style A', files: ['phoebe_style_A.pdf'], expect: 'strong:Style A' },
  },
  {
    id: 'file-only',
    name: 'Phoebe',
    files: ['phoebe_style_B.pdf'],
    labels: AB,
    expect: 'weak',
    twin: { name: 'Phoebe Style B', files: ['phoebe_style_B.pdf'], expect: 'strong:Style B' },
  },
  {
    id: 'compact-slash',
    name: 'Phoebe Style A/B',
    labels: AB,
    expect: 'none',
    twin: { name: 'Phoebe Style B', expect: 'strong:Style B' },
  },
  {
    id: 'compact-and',
    name: 'Phoebe Styles A & B',
    labels: AB,
    expect: 'none',
    twin: { name: 'Phoebe Styles B', expect: 'strong:Style B' },
  },
  {
    id: 'foreign',
    name: 'Phoebe Style C',
    labels: AB,
    expect: 'none',
    twin: { name: 'Phoebe Style A', expect: 'strong:Style A' },
  },
  {
    id: 'a-line',
    name: 'Style A-line dress',
    labels: AB,
    expect: 'none',
    twin: { name: 'Style A dress', expect: 'strong:Style A' },
  },
  // sheets
  {
    id: 'instructions-contamination',
    name: 'Coat Mod. 112',
    pages: [
      pg('instructions', undefined, ['Mod. 112', 'Mod. 114']),
      pg('tile', 0),
      pg('tile', 1, ['Mod. 114']),
    ],
    expect: 'none',
    twin: {
      name: 'Coat Mod. 112',
      pages: [
        pg('instructions', undefined, ['Mod. 112', 'Mod. 114']),
        pg('tile', 0, ['Mod. 112']),
        pg('tile', 1, ['Mod. 114']),
      ],
      expect: 'strong:0',
    },
  },
  {
    id: 'overview-contamination',
    name: 'Coat Mod. 112',
    pages: [
      pg('overview', 0, ['Mod. 112', 'Mod. 114']),
      pg('tile', 0),
      pg('tile', 1, ['Mod. 114']),
    ],
    expect: 'none',
    twin: {
      name: 'Coat Mod. 112',
      pages: [
        pg('overview', 0, ['Mod. 112', 'Mod. 114']),
        pg('tile', 0, ['Mod. 112']),
        pg('tile', 1, ['Mod. 114']),
      ],
      expect: 'strong:0',
    },
  },
  {
    id: 'spread-with-sheet',
    name: 'Coat Mod. 112 · Bogen B',
    pages: [
      pg('overview', 0, undefined, ['A']),
      pg('tile', 0, ['Mod. 112']),
      pg('overview', 1, undefined, ['B']),
      pg('tile', 1, ['Mod. 112']),
    ],
    expect: 'none',
    twin: {
      name: 'Coat Mod. 112 · Bogen B',
      pages: [
        pg('overview', 0, undefined, ['A']),
        pg('tile', 0),
        pg('overview', 1, undefined, ['B']),
        pg('tile', 1, ['Mod. 112']),
      ],
      expect: 'strong:1',
    },
  },
  {
    id: 'sheet-by-order',
    name: 'Coat · sheet 2',
    pages: [pg('tile', 0), pg('tile', 1)],
    expect: 'weak',
    twin: {
      name: 'Coat · Bogen B',
      pages: [pg('tile', 0, undefined, ['A']), pg('tile', 1, undefined, ['B'])],
      expect: 'strong:1',
    },
  },
  {
    id: 'sheet-file-against',
    name: 'Coat · Bogen A',
    files: ['coat_bogen_B.pdf'],
    pages: [pg('tile', 0, undefined, ['A']), pg('tile', 1, undefined, ['B'])],
    expect: 'none',
    twin: {
      name: 'Coat · Bogen A',
      files: ['coat_bogen_A.pdf'],
      pages: [pg('tile', 0, undefined, ['A']), pg('tile', 1, undefined, ['B'])],
      expect: 'strong:0',
    },
  },
  {
    id: 'sheet-compact',
    name: 'Coat · Bogen A/B',
    pages: [pg('tile', 0, undefined, ['A']), pg('tile', 1, undefined, ['B'])],
    expect: 'none',
    twin: {
      name: 'Coat · Bogen B',
      pages: [pg('tile', 0, undefined, ['A']), pg('tile', 1, undefined, ['B'])],
      expect: 'strong:1',
    },
  },
  {
    id: 'sheet-unsheeted-pages',
    name: 'Coat Mod. 112',
    pages: [
      pg('cover', undefined, ['Mod. 112']),
      pg('unknown', undefined, ['Mod. 112']),
      pg('tile', 0),
      pg('tile', 1),
    ],
    expect: 'none',
    twin: {
      name: 'Coat Mod. 112',
      pages: [pg('cover', undefined, ['Mod. 112']), pg('tile', 0, ['Mod. 112']), pg('tile', 1)],
      expect: 'strong:0',
    },
  },
];
function cardMatchTable(): Record<string, unknown> {
  const sizes = cardSizes(['44', '46', '48', 'S', 'M']);
  const run = (
    r: { name?: string; style?: string; files?: string[]; pages?: PageClassification[] },
    labels?: string[],
  ) => {
    const cc: CardContext = {
      techCardId: CARD_ID,
      sizes,
      scopes: SCOPES,
      existingPieces: [],
      styleLabel: '',
      cardName: r.name ?? '',
      styleNumber: r.style ?? '',
    };
    const p = r.pages
      ? sheetFromCard(r.pages, cc, r.files ?? [])
      : modelFromCard(labels ?? [], cc, r.files ?? []);
    return p.pick == null
      ? { got: 'none' as Expect, why: p.why }
      : { got: (p.strong ? `strong:${p.pick}` : 'weak') as Expect, why: p.evidence.join(' · ') };
  };
  const rows = ROWS.map((r) => {
    const a = run(r, r.labels);
    const t = run({ ...r, ...r.twin }, r.labels);
    return {
      id: r.id,
      ok: a.got === r.expect,
      got: a.got,
      why: a.why,
      twinOk: t.got === r.twin.expect,
      twin: t.got,
    };
  });
  const bad = rows.filter((x) => !x.ok || !x.twinOk);
  return {
    id: 'control:card-match-table',
    group: 'control',
    verdict: 'stopped',
    rows,
    control: {
      expect: 'table',
      reached: true,
      picked: false,
      ok: !bad.length,
      failed: bad.map((x) => `${x.id}: ${x.got}${x.twinOk ? '' : ` (twin ${x.twin})`}`),
    },
    assumptions: { total: 0, strong: 0 },
    wrong: { total: 0 },
  };
}

/** Labelled points inside the truth pieces (sheet mm), from the click fixture of the truth id. */
function truthPoints(c: Case): { label: string; at: { x: number; y: number } }[] {
  // per-case truth points first (fixtures/truth-points.json: a case whose sheet frame differs from
  // the click fixture's), else the click fixture of the truth id
  try {
    const own = JSON.parse(
      readFileSync(
        resolve(
          process.env.PATIMPORT_REPO ?? process.cwd(),
          'scripts/pattern-import/fixtures/truth-points.json',
        ),
        'utf8',
      ),
    ) as Record<string, { label: string; at: [number, number] }[] | string>;
    const mine = own[c.id];
    if (Array.isArray(mine))
      return mine.map((k) => ({ label: k.label, at: { x: k.at[0], y: k.at[1] } }));
  } catch {
    /* no per-case points */
  }
  const tid = c.truth?.id;
  const key =
    c.clicks ?? (tid ? CASES.find((x) => x.truth?.id === tid && x.clicks)?.clicks : undefined);
  if (!key) return [];
  try {
    const fx = JSON.parse(
      readFileSync(
        resolve(
          process.env.PATIMPORT_REPO ?? process.cwd(),
          'scripts/pattern-import/fixtures/pieces-clicks.json',
        ),
        'utf8',
      ),
    ) as Record<string, { clicks?: { label: string; at: [number, number] }[] }>;
    return (fx[key]?.clicks ?? []).map((k) => ({ label: k.label, at: { x: k.at[0], y: k.at[1] } }));
  } catch {
    return [];
  }
}

/** A point inside an outline (the middle of the longest inside run of the box's middle row). */
function innerPoint(q: readonly { x: number; y: number }[] | undefined): string {
  if (!q?.length) return '—';
  const ys = q.map((p) => p.y);
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xs: number[] = [];
  for (let i = 0, j = q.length - 1; i < q.length; j = i++)
    if (q[i].y > y !== q[j].y > y)
      xs.push(q[i].x + ((y - q[i].y) / (q[j].y - q[i].y)) * (q[j].x - q[i].x));
  xs.sort((a, b) => a - b);
  let best = [0, 0];
  for (let k = 0; k + 1 < xs.length; k += 2)
    if (xs[k + 1] - xs[k] > best[1] - best[0]) best = [xs[k], xs[k + 1]];
  return `${Math.round((best[0] + best[1]) / 2)},${Math.round(y)}`;
}

/** Even-odd point in polygon. */
function insidePoly(p: { x: number; y: number }, q: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++)
    if (
      q[i].y > p.y !== q[j].y > p.y &&
      p.x < ((q[j].x - q[i].x) * (p.y - q[i].y)) / (q[j].y - q[i].y) + q[i].x
    )
      inside = !inside;
  return inside;
}

const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';

export const SCOPES: DraftScopeTarget[] = [
  ['MAIN', 'L1', 'main', false, 'FABRIC'],
  ['LINING', 'L2', 'lining', false, 'LINING'],
  ['INTERLINING', 'L3', 'interlining', true, 'INTERLINING'],
].map(([p, line, label, inter, sec]) => ({
  scopeKey: `TECH_CARD_BOM_PURPOSE_${p}`,
  fabricPurpose: `TECH_CARD_BOM_PURPOSE_${p}`,
  bomLineKey: line as string,
  label: label as string,
  isInterlining: inter as boolean,
  sections: [`TECH_CARD_BOM_SECTION_${sec}`],
}));

export const cardSizes = (tokens: string[]): CardSize[] =>
  tokens.map((t, i) => ({ sizeId: 100 + i, name: t, token: t, rank: i, spellings: [t] }));

export function filesOf(c: Pick<Case, 'files'>): { name: string; bytes: ArrayBuffer }[] {
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

/** The worker session in-process, behind the wizard's client seam; every stage output kept. */
export function sessionClient() {
  let s: Session | null = null;
  const outs: Partial<Record<StageName, unknown>> = {};
  const ctx: StageCtx = { checkCancel: () => {}, progress: () => {} };
  const client: ImportClient = {
    kind: 'worker',
    async open(files) {
      s?.close();
      s = new Session(1, files);
      return { sessionId: 1, files: s.files };
    },
    async run(_id, stage, input) {
      if (!s) throw new Error('no session');
      // headless: the SoM render is for the AI namer only, and there is no AI here
      if (stage === 'render-som') return { sheetPng: new Blob([]), crops: [], marks: [] } as never;
      // A9: no canvas here — the page stats only (the recorded answers need no picture)
      if (stage === 'render-pages')
        return (await s.runStage(
          stage,
          { ...(input as StageIO['render-pages']['in']), pictures: false },
          ctx,
        )) as never;
      const out = await s.runStage(stage, input as never, ctx);
      outs[stage] = out;
      return out as never;
    },
    cancel() {},
    async close() {
      s?.close();
      s = null;
    },
    alive: () => true,
  };
  return { client, outs };
}

// ── truth ───────────────────────────────────────────────────────────────────────────────────────

type TPiece = { label: string; qty: unknown; fold: unknown; fabric?: unknown };
type TSample = {
  id: string;
  sizes?: { list?: unknown };
  seam_allowance?: { included?: unknown };
  variants: { pieces: TPiece[] }[];
};
let TRUTH: TSample[] | null = null;
function truthOf(c: Case): TSample | null {
  if (!c.truth) return null;
  TRUTH ??= (
    JSON.parse(readFileSync(resolve(CORPUS, 'truth.json'), 'utf8')) as { samples: TSample[] }
  ).samples;
  return TRUTH.find((x) => x.id === c.truth!.id) ?? null;
}
const norm = (x: string) =>
  x
    .toLowerCase()
    .replace(/^piece\s+/, '')
    .replace(/\.$/, '')
    .trim();
// the wizard's own size key: a paired «4/6» is never the «46» its digits concatenate to
const bare = sizeKey;
const fabricOf = (f: unknown): string => {
  const t = String(f ?? '').toLowerCase();
  if (/^lining/.test(t)) return 'TECH_CARD_BOM_PURPOSE_LINING';
  if (/^(interfacing|interlining)/.test(t)) return 'TECH_CARD_BOM_PURPOSE_INTERLINING';
  return 'TECH_CARD_BOM_PURPOSE_MAIN';
};

type Wrong = { kind: string; subject: string; got: string; want: string; assumed: string | null };

type GoldenAnswers = {
  pages?: boolean;
  asides?: boolean;
  outline?: 'cut' | 'seam';
  sizes?: Record<string, string>;
  /**
   * L13: the fold question of a seed (`fold:<seed>=half|no|edge:<n>` in cases.tsv) — export the
   * half with a fold line, not a fold, or unfold across the question's edge n.
   */
  folds?: Record<string, string>;
  /** The count of a piece drawn once with nothing said (`qty:<seed>=<n>` in cases.tsv). */
  qty?: Record<string, number>;
  /**
   * BACK-VARIANT: the variant notch the chosen model keeps (`notch:<word>` in cases.tsv) — the
   * option of every open «which …: a / b?» question that carries the word.
   */
  notch?: string;
};
const golden = (): GoldenAnswers | null =>
  process.env.GOLDEN_ANSWERS ? (JSON.parse(process.env.GOLDEN_ANSWERS) as GoldenAnswers) : null;

// ── one case ────────────────────────────────────────────────────────────────────────────────────

export async function runCase(c: Case, mutate: string | null) {
  const T0 = Date.now();
  const rec: Record<string, unknown> = {
    id: c.id,
    group: c.expectStop || c.renameTo || c.expectSheets ? 'control' : c.group,
  };
  // `let`: the rename control gives the hook a renamed card mid-run (a new object, as a form does)
  let card: CardContext = {
    techCardId: CARD_ID,
    sizes: cardSizes(c.card),
    scopes: SCOPES,
    existingPieces: [],
    styleLabel: 'autopilot',
    ...(c.cardName ? { cardName: c.cardName } : {}),
  };
  const { client, outs } = sessionClient();
  // A9: `--page-roles` = the recorded AI page roles (fixtures/page-roles.json, never a paid call);
  // `--mutate=page-role` = with a real tile answered "instructions" 0.99 in every call
  const roles =
    process.env.AUTOPILOT_PAGE_ROLES || mutate === 'page-role'
      ? fixturePageRoleDeps(mutate === 'page-role' ? 'tile-instructions' : null)
      : null;
  let api!: ImportSessionApi;
  mountHook(() => {
    api = useImportSession({
      client,
      card,
      ...(roles ? { pageRoles: roles.deps } : {}),
      namer: async () => [],
      buildDraft: stubBuildDraft,
      applyDraft: async () => ({ ok: true, uploaded: [] }),
    });
  });
  const settle = async () => {
    for (let k = 0; k < 4; k++) await Promise.resolve();
    rerender();
  };
  const st = newDriveState();
  let done: null | { ok: true } | { ok: false; stop: { step: string; reason: string } } = null;
  let ticks = 0;
  const mutated: string[] = [];
  const wrapped = (snap: AutopilotSnapshot): AutopilotAnswer => {
    // the policy's own fingerprint of "now" must be the wizard's (answers.ts answersNowOf)
    const mine = JSON.stringify(answersNowOf(snap.session, snap.inputs));
    if (mine !== JSON.stringify(api.answersNow)) fingerprintDrift++;
    const a = autopilotAnswer(snap);
    // the control's operator: the page-role question of the files step, answered as TRUTH reads
    // those pages (they stay aside) — the question the control is not about. PASSPORT Ф1
    // diagnostic: env AUTOPILOT_ORACLE_PAGES=1 answers it so on every case, to see the NEXT stop
    // (never in the suite's numbers)
    if (
      (c.operatorPages || !!process.env.AUTOPILOT_ORACLE_PAGES) &&
      a.stop &&
      a.reason?.step === 'files' &&
      /is it a pattern page\?/.test(a.reason.reason)
    ) {
      operatorAnswers++;
      return { proceed: true, assumptions: [] };
    }
    // golden Pass B (env GOLDEN_ANSWERS, JSON): the answers a real operator gives, recorded per
    // case in golden/cases.tsv — never in the suite's numbers
    const ga = golden();
    if (ga && a.stop && a.reason) {
      const { step, reason } = a.reason;
      if (ga.pages && step === 'files' && /is it a pattern page\?/.test(reason)) {
        operatorAnswers++;
        return { proceed: true, assumptions: [] };
      }
      if (ga.asides && step === 'pieces' && /set aside on a guess/.test(reason)) {
        operatorAnswers++;
        return { proceed: true, assumptions: [] };
      }
      if (ga.outline && step === 'meaning' && /the cut line .* or the seam line\?/.test(reason)) {
        operatorAnswers++;
        return {
          patch: {
            fileAllowance: {
              meaning: ga.outline,
              allowanceMm: PATIMPORT.defaultAllowanceMm,
              origin: 'operator',
              evidence: [],
            },
          },
          events: [{ type: 'names', decisions: snap.session.names }],
          assumptions: [],
        };
      }
      const sem = snap.session.semantics;
      if (ga.folds && step === 'meaning' && /cut on fold/.test(reason) && sem) {
        const b = sem.blocked.find(
          (x) => x.reason === 'fold-question' && ga.folds![String(x.seed)] != null,
        );
        const want = b ? ga.folds[String(b.seed)] : null;
        const ask = b ? sem.folds?.find((f) => f.seed === b.seed) : undefined;
        const n = /^edge:(\d+)$/.exec(want ?? '')?.[1];
        const sug = ask && ask.suggested != null ? ask.edges[ask.suggested] : null;
        const e =
          want === 'half' ? ask?.half?.edge ?? sug : n != null ? ask?.edges[+n] ?? null : null;
        const patch =
          b && want === 'no'
            ? {
                overrides: {
                  ...snap.inputs.overrides,
                  [b.seed]: { ...(snap.inputs.overrides[b.seed] ?? {}), unfoldedFold: false },
                },
              }
            : b && e
              ? {
                  operatorFold: {
                    ...snap.inputs.operatorFold,
                    [b.seed]: {
                      a: e.a,
                      b: e.b,
                      ...(want === 'half' ? { half: true as const } : {}),
                    },
                  },
                }
              : null;
        if (patch) {
          operatorAnswers++;
          return {
            patch,
            events: [{ type: 'names', decisions: snap.session.names }],
            assumptions: [],
          };
        }
      }
      const nvAsks = (sem?.notchVariantAsks ?? []).filter(
        (q) => snap.inputs.overrides[q.seed]?.notchVariant === undefined,
      );
      if (ga.notch && step === 'meaning' && nvAsks.length) {
        const w = ga.notch.toLowerCase();
        const overrides = { ...snap.inputs.overrides };
        for (const q of nvAsks) {
          const o = q.options.find((x) => x.key.split(' ').includes(w));
          if (o) overrides[q.seed] = { ...(overrides[q.seed] ?? {}), notchVariant: o.key };
        }
        if (nvAsks.some((q) => overrides[q.seed]?.notchVariant !== undefined)) {
          operatorAnswers++;
          return {
            patch: { overrides },
            events: [{ type: 'names', decisions: snap.session.names }],
            assumptions: [],
          };
        }
      }
      const qs = /\(seed (\d+)\) is drawn once and nothing on the sheet says how many/.exec(
        reason,
      )?.[1];
      if (ga.qty && step === 'meaning' && qs != null && ga.qty[qs] != null) {
        const sd = +qs as SeedId;
        operatorAnswers++;
        return {
          patch: {
            overrides: {
              ...snap.inputs.overrides,
              [sd]: { ...(snap.inputs.overrides[sd] ?? {}), piecesPerGarment: ga.qty[qs] },
            },
          },
          events: [{ type: 'names', decisions: snap.session.names }],
          assumptions: [],
        };
      }
      const entries = snap.session.sizes?.map.entries;
      if (ga.sizes && step === 'sizes' && entries) {
        operatorAnswers++;
        const sizes = api.runCard?.sizes ?? card.sizes;
        return {
          events: [
            {
              type: 'size-map',
              entries: entries.map((e) => ({
                ...e,
                card: sizes.find((z) => z.token === ga.sizes![e.source.label]) ?? null,
                origin: 'operator' as const,
              })),
            },
          ],
          assumptions: [],
        };
      }
    }
    // --mutate=card: a pick injected at the control's own question — the control must catch it
    if (
      mutate === 'card' &&
      c.expectStop &&
      a.stop &&
      a.reason?.step === c.expectStop &&
      !mutated.length
    ) {
      const v = variantsOf(
        snap.session.pieces?.seeds ?? [],
        snap.baseSeeds ?? null,
        snap.session.pieces?.variants,
      );
      if (c.expectStop === 'pieces' && v.length) {
        mutated.push(`picked model ${v[0]}`);
        return { events: [{ type: 'variant', variant: v[0] }], assumptions: [] };
      }
    }
    return mutate && mutate !== 'card' ? mutateAnswer(mutate, snap, a, mutated, c) : a;
  };
  let operatorAnswers = 0;
  let fingerprintDrift = 0;
  let renamed: { before: string; stale: string | null } | null = null;
  let bypassed: boolean | null = null;
  const trace: string[] = [];
  let files: { name: string; bytes: ArrayBuffer }[] = [];
  try {
    files = filesOf(c);
    if (c.renameFiles) files = files.map((f, k) => ({ ...f, name: c.renameFiles![k] ?? f.name }));
  } catch (e) {
    rec.verdict = 'crashed';
    rec.error = String(e);
    return rec;
  }
  try {
    await api.dispatch({
      type: 'files',
      files: files.map((f) => new File([f.bytes], f.name)),
    });
    await settle();
    // the wizard's own drive tick (auto-drive.ts), the autopilot's resolver, then — on a green
    // gate — the autopilot's explicit apply path: the same code the wizard runs
    const resolve = resolverFor(card, () => api);
    const answer = (snap: Parameters<typeof resolve>[0]) => {
      const x = {
        ...snap,
        // the run's snapshot of the card, as the wizard's resolver reads it (Codex #5)
        card: api.runCard,
        baseSeeds: api.baseSeeds,
        presegmented: !!api.extracted.presegmented,
      };
      return wrapped(x);
    };
    for (let t = 0; t < 400 && !done; t++) {
      ticks++;
      const step = api.session.step;
      const r = await driveTick(
        st,
        hookDriveCtx(() => api, settle, answer),
      );
      await settle();
      trace.push(
        `${step}:${r.kind === 'answered' ? 'answer' : r.kind === 'moved' ? 'next' : r.kind}`,
      );
      // rename during the run: once the model is picked the card's name changes — apply must
      // refuse, and going back chooses the model again against the new name
      if (c.renameTo && !renamed && api.session.variant) {
        renamed = { before: api.session.variant, stale: null };
        card = { ...card, cardName: c.renameTo };
        await settle();
        renamed.stale = api.cardStale();
        await api.dispatch({ type: 'back', to: 'sizes' });
        await settle();
        continue;
      }
      if (r.kind !== 'stopped') continue;
      if (r.why === 'auto-stop' && api.session.step === 'check') {
        const o = await autopilotApply(() => api, card, settle);
        trace.push(o.ok ? 'apply:done' : `${o.step}:stop`);
        done = o.ok ? { ok: true } : { ok: false, stop: { step: o.step, reason: o.reason } };
      } else
        done = {
          ok: false,
          stop: { step: r.step, reason: `${r.why}: ${r.reason ?? r.question ?? ''}` },
        };
    }
  } catch (e) {
    rec.error = String((e as Error)?.stack ?? e).slice(0, 600);
  }
  const s = api.session;
  rec.trace = compress(trace);
  if (roles) {
    rec.pageRoles = {
      calls: roles.log.calls.map(
        (k) =>
          `${k.file}: sent ${k.sent.length}, answered ${k.answered.length}${k.missing.length ? `, NOT RECORDED ${k.missing.join(',')}` : ''}`,
      ),
      aiAside: (s.clean?.dropped ?? []).filter((d) => d.aiAside).map((d) => `p${d.page + 1}`),
      note: api.pageRoleNote,
    };
    // the control: a real tile the AI called instructions stays in the tile grid
    if (mutate === 'page-role')
      for (const m of roles.log.mutated) {
        const f = s.files.find((x) => x.name === m.file)?.id;
        const kept =
          s.clean?.classes.find((c) => c.file === f && c.page === m.pageNo - 1)?.cls === 'tile' &&
          !s.clean?.dropped.some((d) => d.file === f && d.page === m.pageNo - 1);
        mutated.push(
          `${m.file} p${m.pageNo} → instructions 0.99: ${kept ? 'kept as a tile' : 'SET ASIDE'}`,
        );
      }
  }
  // the pages clean set aside "to check", with the facts the policy reads (A10 r4)
  rec.pagesAside = (s.clean?.dropped ?? [])
    .filter((d) => d.status === 'suggest')
    .map((d) => {
      const c = s.pages.find((p) => p.file === d.file && p.page === d.page);
      return `${d.cls} p${d.page + 1}${d.face ? ' face' : ''}${d.reducedCopy ? ` copy ${d.reducedCopy.matches}@${d.reducedCopy.scale}` : ''}${c?.ink ? ` ink ${c.ink.strokeM}m/${c.ink.texts}t` : ''}`;
    });
  rec.setAside = (s.pieces?.setAside ?? []).map(
    (a) => `${a.reason} ${Math.round(a.areaMm2 / 100)}cm² ${a.seed?.text?.text ?? ''}`,
  );
  rec.sizesRead = s.sizes
    ? {
        labels: s.sizes.run.sizes.map((x) => x.label),
        expected: s.sizes.expected,
        countAsk: s.sizes.countAsk,
        map: s.sizes.map.entries.map((e) => `${e.source.label || '∅'}→${e.card?.token ?? '—'}`),
      }
    : null;
  rec.legend = (s.chains?.classes ?? []).map(
    (k) =>
      `${k.role}${k.sizeLabel ? ` ${k.sizeLabel}` : ''} ${k.confidence.toFixed(2)} ${Math.round(k.totalLengthMm)}mm`,
  );
  rec.ticks = ticks;
  rec.clicks = 0;
  rec.verdict = done?.ok ? 'apply' : 'stopped';
  if (done && !done.ok) rec.stop = done.stop;
  else if (!done) rec.stop = { step: s.step, reason: 'tick budget spent' };
  if (rec.verdict === 'stopped' && c.group === 'refusal') rec.expectedStop = true;
  // A10 card match, dry: what the card names against the pages' own labels (models, sheet
  // letters) as read at extraction — scored even when the run stopped before the question
  const fileNames = s.files.map((f) => f.name);
  const tileIds = new Set(s.pages.filter((p) => p.cls === 'tile').map((p) => p.sheet ?? 0));
  const pageModels = [...new Set(s.pages.flatMap((p) => p.labels?.models ?? []))].sort();
  const dry: {
    sheet?: number | null;
    model?: string | null;
    sheetStrong?: boolean;
    modelStrong?: boolean;
    why: string[];
    wrong: string[];
  } = { why: [], wrong: [] };
  if (pageModels.length > 1) {
    const r = modelFromCard(pageModels, card, fileNames);
    dry.model = r.pick;
    dry.modelStrong = !!r.strong;
    dry.why.push(...(r.evidence ?? (r.why ? [r.why] : [])));
    const want = c.variant ?? c.cardModel;
    if (r.pick != null && want && !want.test(r.pick)) dry.wrong.push(`model ${r.pick} ≠ ${want}`);
  }
  rec.cardMatch = dry;
  rec.operatorAnswers = operatorAnswers || undefined;
  if (c.expectStop || c.renameTo) {
    const st = rec.stop as { step: string; reason: string } | undefined;
    // picked = the run chose, or the card match would let the autopilot choose (a suggestion
    // the autopilot stops on is not a pick)
    const picked =
      c.expectStop === 'pieces'
        ? s.variant != null || (dry.model != null && !!dry.modelStrong)
        : false;
    // reached = stopped ON the card question (the step and its wording); unreached FAILS
    const reached = c.expectStop
      ? rec.verdict === 'stopped' &&
        st?.step === c.expectStop &&
        (!c.expectReason || c.expectReason.test(st.reason))
      : true;
    const renameOk = c.renameTo
      ? !!renamed?.stale &&
        /name \/ style number/.test(renamed.stale) &&
        !!s.variant &&
        !!c.expectVariant?.test(s.variant)
      : true;
    rec.control = {
      expect: c.expectStop ?? 'rename',
      reached,
      picked,
      ...(renamed ? { renamed: { ...renamed, after: s.variant } } : {}),
      ...(bypassed != null ? { bypassed } : {}),
      ok: reached && !picked && renameOk && bypassed !== true,
    };
  }
  if (c.expectSheets) {
    const st = rec.stop as { step: string; reason: string } | undefined;
    const parts = s.sheet?.sheet.parts?.length ?? 0;
    rec.control = {
      expect: `${c.expectSheets} sheets`,
      reached: !!s.sheet,
      picked: st?.step === 'sheet' && /tile sheets/.test(st.reason),
      sheets: parts,
      ok: !!s.sheet && parts === c.expectSheets && st?.step !== 'sheet',
    };
  }
  rec.fingerprintDrift = fingerprintDrift;
  // the run's assumptions as the wizard keeps them (merged into its inputs, one per question)
  const as = api.inputs.autopilot;
  rec.assumptions = {
    total: as.length,
    strong: as.filter((a) => a.strong).length,
    byKind: countBy(as.map((a) => a.kind)),
    strongByKind: countBy(as.filter((a) => a.strong).map((a) => a.kind)),
    list: as.map((a) => `${a.strong ? '!' : ' '}${a.kind} · ${a.subject} → ${a.answer}`),
  };
  if (mutated.length) rec.mutated = mutated;
  // AP-tail: the pieces as named at the end, and the autopilot's own codes (code probe §6)
  rec.named = {
    pieces: (s.semantics?.pieces ?? []).map((p) => ({
      seed: p.seed,
      identity: p.identity,
      code: p.code,
      mods: p.mods,
      pairHand: p.pairHand,
      pairOf: p.pairOf,
    })),
    codes: as
      .filter((a) => a.kind === 'name-code' && a.seed != null)
      .map((a) => ({ seed: a.seed!, answer: a.answer, value: a.value ?? null })),
  };

  // the written files: gate, manifest round trip (the assumptions ride in every manifest)
  const wr = outs.write as StageIO['write']['out'] | undefined;
  // golden harness: env AUTOPILOT_DXF_OUT = keep every written scope's DXF on disk (one per scope)
  if (wr && process.env.AUTOPILOT_DXF_OUT) {
    mkdirSync(process.env.AUTOPILOT_DXF_OUT, { recursive: true });
    for (const sc of wr.scopes)
      writeFileSync(resolve(process.env.AUTOPILOT_DXF_OUT, `${sc.target.label}.dxf`), sc.dxfText);
  }
  if (wr && s.step !== 'fabrics') {
    const want = autopilotRecordOf(as, new Set((s.semantics?.pieces ?? []).map((p) => p.seed)))
      .assumptions.length;
    rec.write = wr.scopes.map((sc) => {
      const m = readManifest(sc.dxfText);
      const g = wr.gate[sc.target.scopeKey];
      return {
        scope: sc.target.label,
        passed: !!g?.passed,
        blocks: sc.manifest.blocks.length,
        blocking: (g?.checks ?? []).filter((k) => !k.ok && k.severity === 'block').map((k) => k.id),
        manifestAssumptions: m?.autopilot?.assumptions.length ?? null,
        manifestOk:
          !!m &&
          m.techCardId === CARD_ID &&
          // no assumption = no autopilot field (an operator-shaped manifest)
          (want ? m.autopilot?.assumptions.length === Math.min(want, 400) : !m.autopilot),
      };
    });
  }

  // the export against TRUTH
  const seeds = [...(api.baseSeeds ?? []), ...(s.pieces?.seeds ?? [])];
  const labelOf = (sd: SeedId) => seeds.find((x) => x.id === sd)?.text?.text ?? null;
  const assumedOn = (seed: SeedId | null, kinds: string[], subject?: string) =>
    as.find(
      (a) =>
        kinds.includes(a.kind) &&
        (seed != null ? a.seed === seed : subject != null ? a.subject === subject : true),
    )?.kind ?? null;
  const wrong: Wrong[] = [];
  const truth = truthOf(c);
  const sem = s.semantics;
  const reached = rec.verdict === 'apply';
  if (truth && sem) {
    const tps = truth.variants[c.truth?.variant ?? 0]?.pieces ?? [];
    const byLabel = (sd: SeedId) => {
      const l = labelOf(sd);
      if (!l) return null;
      const n = norm(l);
      return tps.find((x) => norm(x.label) === n || norm(x.label.split(' / ')[0]) === n) ?? null;
    };
    // geometry first (A10 r4): a truth point (a labelled click inside each truth piece, sheet mm —
    // fixtures/pieces-clicks.json, by the case's truth id) inside the exported piece's outline; a
    // label decides only a tie (several points in one outline) or where no truth point exists
    const pts = truthPoints(c);
    const outerOf = (sd: SeedId) => {
      const fam = s.pieces?.families.find((f) => f.seed === sd);
      const best = fam?.candidates
        .filter((x) => x.outcome === 'closed' && x.outer.length > 2)
        .sort((x, y) => y.areaMm2 - x.areaMm2)[0];
      return best ? { outer: best.outer, area: best.areaMm2 } : null;
    };
    // one truth point per exported piece: the point must lie INSIDE a piece-sized exported
    // outline; inside several (a piece drawn inside another — wm's collar on the back) it goes to
    // the smallest; a label breaks a tie only. No 'near' credit: a stray outline next to a missing
    // piece's point never counts as that piece
    const geo = new Map<SeedId, string>();
    if (pts.length) {
      const seedsAll = [...new Set(sem.pieces.map((p) => p.seed))];
      const outs = new Map(seedsAll.map((sd) => [sd, outerOf(sd)] as const));
      for (const p of pts) {
        // only a piece-sized outline can be a truth piece (a stray loop around the point is not)
        const owners = seedsAll
          .filter((sd) => {
            const o = outs.get(sd);
            return (
              !!o &&
              !geo.has(sd) &&
              o.area >= PATIMPORT.minPieceAreaMm2 &&
              insidePoly(p.at, o.outer)
            );
          })
          .sort((x, y) => outs.get(x)!.area - outs.get(y)!.area);
        const lab = owners.find((sd) => byLabel(sd) && norm(byLabel(sd)!.label) === norm(p.label));
        const sd = lab ?? owners[0];
        if (sd == null) continue;
        geo.set(sd, p.label);
      }
      rec.geo = seedsAll.map(
        (sd) =>
          `seed ${sd} → ${geo.get(sd) ?? '—'}${geo.has(sd) ? '' : ` (an inner point ${innerPoint(outs.get(sd)?.outer)})`}`,
      );
    }
    const match = (sd: SeedId) => {
      if (!pts.length) return byLabel(sd);
      const l = geo.get(sd);
      return l ? tps.find((x) => norm(x.label) === norm(l)) ?? null : null;
    };
    const bySeed = new Map<SeedId, typeof sem.pieces>();
    for (const p of sem.pieces) bySeed.set(p.seed, [...(bySeed.get(p.seed) ?? []), p]);
    // mutation control 'drop' (a check of this matcher, so on every case with truth pieces): one
    // truth-matched piece left out of the export → must count missing
    if (mutate === 'drop') {
      const sd = [...bySeed.keys()].find((k) => match(k));
      if (sd != null) {
        bySeed.delete(sd);
        mutated.push(`drop seed ${sd}`);
        rec.mutated = mutated;
      }
    }
    // Codex #6: a BIJECTIVE match truth ↔ export (by the piece's printed label): one exported
    // piece per truth piece; a second one on the same label is an extra
    const taken = new Set<TPiece>();
    let matched = 0;
    let extra = 0;
    for (const [sd, ps] of bySeed) {
      const t0 = match(sd);
      const t = t0 && !taken.has(t0) ? t0 : null;
      const subject = `seed ${sd}${labelOf(sd) ? ` · ${labelOf(sd)}` : ''}`;
      if (!t) {
        extra++;
        wrong.push({
          kind: 'piece-set',
          subject,
          got: 'exported',
          want: t0 ? 'one piece per label' : 'no such piece (no truth label)',
          assumed: assumedOn(sd, ['seed-click', 'name-code']),
        });
        continue;
      }
      taken.add(t);
      matched++;
      const qty = typeof t.qty === 'number' ? t.qty : parseInt(String(t.qty), 10);
      const got = ps.reduce((a, p) => a + p.piecesPerGarment, 0);
      if (Number.isFinite(qty) && got !== qty)
        wrong.push({
          kind: 'quantity',
          subject,
          got: String(got),
          want: String(qty),
          assumed: assumedOn(sd, ['quantity', 'fold-edge', 'not-a-fold']),
        });
      // the fold, both ways: a fold piece not unfolded, a piece unfolded that is not cut on fold
      // L13: a half exported on fold with its fold line marked (owner decision 19.10 a) IS the
      // piece cut on fold
      const half = ps.some((p) => !!p.halfFold);
      const unfolded = half || ps.some((p) => p.unfoldedFold);
      if ((t.fold === true) !== unfolded && (t.fold === true || t.fold === false))
        wrong.push({
          kind: 'fold',
          subject,
          got: half ? 'half on fold' : unfolded ? 'unfolded' : 'not unfolded',
          want: t.fold === true ? 'unfolded' : 'as drawn',
          assumed:
            assumedOn(sd, ['fold-edge', 'not-a-fold', 'cutting-list']) ??
            assumedOn(null, ['cutting-list']),
        });
      const fab = fabricOf(t.fabric);
      const inFab = (s.fabrics?.byPurpose[fab] ?? []).includes(sd);
      if (s.fabrics && !inFab)
        wrong.push({
          kind: 'fabric',
          subject,
          got: Object.entries(s.fabrics?.byPurpose ?? {})
            .filter(([, v]) => v.includes(sd))
            .map(([k]) => k.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase())
            .join('+'),
          want: fab.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase(),
          assumed: assumedOn(sd, ['fabric']) ?? assumedOn(null, ['fabric'], 'every piece'),
        });
    }
    // a truth piece the export misses: set aside by the autopilot (with or without a label), by
    // the reader, or never found
    const want = c.truth?.expect ?? tps.length;
    const asides = as.filter((a) => ['set-aside', 'not-a-piece', 'dropped-piece'].includes(a.kind));
    const labelled = (a: Assumption) =>
      tps.find((t) => a.subject.toLowerCase().includes(`«${norm(t.label)}`)) ?? null;
    // with truth points: each missing truth piece pinned to what holds ITS point — the autopilot's
    // answer on a seed whose outline holds it, else the smallest outline set aside around it (the
    // autopilot's 'set-aside', or silently by the reader), else never found. Without points: in
    // order, as before (no geometry to pin by).
    const missingN = Math.max(0, want - matched);
    if (pts.length) {
      const lost = pts
        .filter((p) => ![...taken].some((t) => norm(t.label) === norm(p.label)))
        .slice(0, missingN);
      const outerAt = (sd: SeedId | undefined, p: { x: number; y: number }) => {
        if (sd == null) return false;
        const o = outerOf(sd);
        if (o) return insidePoly(p, o.outer);
        const b = seeds.find((x) => x.id === sd)?.face?.box;
        return !!b && p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
      };
      const pinned = new Set<Assumption>();
      for (const p of lost) {
        const dropped = asides.find(
          (a) => a.kind !== 'set-aside' && !pinned.has(a) && outerAt(a.seed, p.at),
        );
        // the outline set aside around the point: one that could be the piece (piece-sized, wider
        // than a sliver between two sizes' lines) before a sliver of a nest it crosses; smallest
        const boxArea = (x: { box: { minX: number; minY: number; maxX: number; maxY: number } }) =>
          (x.box.maxX - x.box.minX) * (x.box.maxY - x.box.minY);
        const pieceLike = (x: { areaMm2: number; copy?: { clearMm: number } }) =>
          x.areaMm2 >= PATIMPORT.minPieceAreaMm2 && (x.copy?.clearMm ?? Infinity) > SLIVER_MM;
        const box = (s.pieces?.setAside ?? [])
          .filter(
            (x) =>
              x.areaMm2 > 0 &&
              p.at.x >= x.box.minX &&
              p.at.x <= x.box.maxX &&
              p.at.y >= x.box.minY &&
              p.at.y <= x.box.maxY,
          )
          .sort((x, y) => +pieceLike(y) - +pieceLike(x) || boxArea(x) - boxArea(y))[0];
        const answer =
          dropped ??
          (box ? asides.find((a) => a.kind === 'set-aside' && a.ref === `aside:${box.id}`) : null);
        if (answer) pinned.add(answer);
        // a seed whose outline holds the point, not exported (the run stopped before, or dropped)
        const unexported =
          !answer && !box
            ? s.pieces?.families.find((f) => !bySeed.has(f.seed) && outerAt(f.seed, p.at))
            : undefined;
        wrong.push({
          kind: 'piece-set',
          subject: answer
            ? `${answer.subject}${labelled(answer) ? ' (a truth label)' : ''} · truth «${p.label}»`
            : box
              ? `outline ${box.id} set aside silently (${box.reason}${box.copy ? ` ${box.copy.how}` : ''}, ${Math.round(box.areaMm2 / 100)} cm²) · truth «${p.label}»`
              : unexported
                ? `seed ${unexported.seed} not exported · truth «${p.label}»`
                : `truth piece «${p.label}» (never found)`,
          got: 'missing',
          want: 'exported',
          assumed: answer ? answer.kind : box ? `silent ${box.reason}` : null,
        });
      }
      for (let k = lost.length; k < missingN; k++)
        wrong.push({
          kind: 'piece-set',
          subject: `truth piece ${k + 1}`,
          got: 'missing',
          want: 'exported',
          assumed: null,
        });
    } else
      for (let k = 0; k < missingN; k++) {
        const a = asides[k] ?? null;
        wrong.push({
          kind: 'piece-set',
          subject: a
            ? `${a.subject}${labelled(a) ? ' (a truth label)' : ''}`
            : `truth piece ${k + 1}`,
          got: 'missing',
          want: 'exported',
          assumed: a ? a.kind : null,
        });
      }
    rec.truth = {
      pieces: want,
      matched,
      exported: bySeed.size,
      extra,
      missing: Math.max(0, want - matched),
    };
    // the outline
    const inc = truth.seam_allowance?.included;
    const wantMeaning = inc === true ? 'cut' : inc === false ? 'seam' : null;
    if (wantMeaning) {
      const off = sem.pieces.filter(
        (p) => p.allowance.meaning !== 'both' && p.allowance.meaning !== wantMeaning,
      );
      if (off.length)
        wrong.push({
          kind: 'outline',
          subject: `${off.length} pieces`,
          got: off[0].allowance.meaning,
          want: wantMeaning,
          assumed: assumedOn(null, ['outline']),
        });
    }
  }
  // sizes: the written source label against the card token it went to (and the truth's run)
  if (wr && truth?.sizes && Array.isArray(truth.sizes.list)) {
    const list = truth.sizes.list as string[];
    const tokens = new Set(c.card.map(bare));
    const sizes = wr.scopes[0]?.manifest.sizes ?? [];
    const runN = s.sizes?.run.sizes.length ?? 0;
    for (const z of sizes) {
      const lab = bare(z.sourceLabel ?? '');
      const want = tokens.has(lab)
        ? lab
        : runN === list.length && list[z.rank] && tokens.has(bare(list[z.rank]))
          ? bare(list[z.rank])
          : null;
      if (want != null && want !== bare(z.token))
        wrong.push({
          kind: 'size',
          subject: `source ${z.sourceLabel || `rank ${z.rank}`}`,
          got: z.token,
          want,
          assumed:
            assumedOn(
              null,
              ['size-ordinal', 'size-guess', 'drawn-sizes'],
              `source ${z.sourceLabel || `rank ${z.rank}`}`,
            ) ?? assumedOn(null, ['drawn-sizes']),
        });
    }
  }
  // the model / the sheet
  const wantModel = c.variant ?? c.cardModel;
  if (wantModel && s.variant && !wantModel.test(s.variant))
    wrong.push({
      kind: 'model',
      subject: 'the sheet',
      got: s.variant,
      want: String(wantModel),
      assumed: assumedOn(null, ['model']),
    });
  // D6: a run that assembled the drawing has EVERY tile sheet of the file in it (none dropped)
  const inDrawing = s.sheet?.sheet.parts?.map((p) => p.sheet) ?? (s.sheet ? [0] : null);
  if (inDrawing && tileIds.size > inDrawing.length)
    wrong.push({
      kind: 'sheet',
      subject: 'the file',
      got: `${inDrawing.length} tile sheets in the drawing`,
      want: `${tileIds.size}`,
      assumed: null,
    });
  rec.wrong = {
    total: wrong.length,
    byKind: countBy(wrong.map((w) => w.kind)),
    assumedByKind: countBy(wrong.filter((w) => w.assumed).map((w) => w.assumed!)),
    items: wrong.map(
      (w) =>
        `${w.kind} · ${w.subject}: ${w.got} ≠ ${w.want}${w.assumed ? ` [${w.assumed}]` : ' [sheet]'}`,
    ),
  };
  rec.wrongPassing = reached ? wrong.length : 0;

  // grain: the fallback rule against the grainlines the sheet draws
  if (sem && s.pieces) {
    const mapped = exportedRanks(s.sizes?.map);
    const seen = new Set<SeedId>();
    const errs: number[] = [];
    const grainRows: Record<string, unknown>[] = [];
    for (const p of sem.pieces) {
      if (seen.has(p.seed) || p.unfoldedFold) continue;
      seen.add(p.seed);
      const z = p.sizes[p.sizes.length - 1];
      const g = z?.grain;
      // a grain the sheet DRAWS: detected, or an accepted proposal resting on a drawn line
      const drawnLine = (g?.evidence ?? []).some(
        (e) => e !== 'geometry' && e !== 'accepted' && e !== 'operator',
      );
      if (!g || (g.origin !== 'detected' && !drawnLine)) continue;
      // the written cut line: the grain's own frame (a DXF block's outline may lie turned)
      const ring =
        z.cut.length > 2
          ? z.cut
          : ringOf(
              s.pieces.families.find((f) => f.seed === p.seed),
              mapped,
              z.rank,
            );
      const fb = ring ? fallbackGrain(ring) : null;
      if (!fb) continue;
      const ga = (Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) * 180) / Math.PI;
      errs.push(angleDiff180(fb.angleDeg, ga));
      // the rule's parts, for tuning it: drawn grain vs the edge, the axis, the sheet vertical
      const ax = principalAxis(ring!);
      const ed = longestStraight(ring!);
      let per = 0;
      for (let k = 0; k < ring!.length; k++)
        per += Math.hypot(
          ring![(k + 1) % ring!.length].x - ring![k].x,
          ring![(k + 1) % ring!.length].y - ring![k].y,
        );
      grainRows.push({
        piece: `${p.identity}`,
        drawn: +((ga + 360) % 180).toFixed(1),
        rule: +fb.angleDeg.toFixed(1),
        from: fb.from,
        edge: ed ? +ed.angleDeg.toFixed(1) : null,
        edgeShare: ed ? +(ed.lenMm / per).toFixed(2) : null,
        axis: ax ? +ax.angleDeg.toFixed(1) : null,
        elong: ax ? +ax.elongation.toFixed(2) : null,
      });
    }
    errs.sort((a, b) => a - b);
    rec.grainRule = {
      n: errs.length,
      within5: errs.filter((e) => e <= 5).length,
      within15: errs.filter((e) => e <= 15).length,
      median: errs.length ? +errs[Math.floor(errs.length / 2)].toFixed(1) : null,
      rows: grainRows,
      // a DXF always carries its grain (the rule never runs there); CLO lays its blocks turned
      dxf: !!api.extracted.presegmented,
    };
  }
  rec.ms = Date.now() - T0;
  rec.peakRssMb = Math.round(process.resourceUsage().maxRSS / 1024);
  await client.close(1);
  return rec;
}

function ringOf(f: PieceFamily | undefined, mapped: Set<number> | null, rank: number) {
  if (!f) return null;
  const c =
    f.candidates.find((x) => x.rank === rank && x.outer.length > 2) ??
    f.candidates.find((x) => (!mapped || mapped.has(x.rank)) && x.outer.length > 2);
  return c?.outer ?? null;
}

/**
 * The metric's own control: a WRONG answer injected into the policy's answer. `qty` — with the
 * details step's "confirm as shown", the first truth-labelled piece's count + 1 (an operator-shaped
 * override); `size` — with the first answer on the sizes step, the first two mapped sizes swapped.
 * The metric must count it, attributed to the assumption.
 */
function mutateAnswer(
  kind: string,
  snap: AutopilotSnapshot,
  a: AutopilotAnswer,
  mutated: string[],
  c: Case,
): AutopilotAnswer {
  const s = snap.session;
  if (a.stop || mutated.length) return a;
  const withA = (
    x: Assumption[],
    patch: AutopilotAnswer['patch'],
    events: AutopilotAnswer['events'],
  ) => ({
    ...a,
    patch: {
      ...a.patch,
      ...patch,
      autopilot: [...(a.patch?.autopilot ?? snap.inputs.autopilot), ...x],
    },
    events: [...(a.events ?? []), ...(events ?? [])],
    assumptions: [...a.assumptions, ...x],
  });
  if (kind === 'qty' && s.step === 'meaning' && a.patch?.confirmedQuantities && s.semantics) {
    const seeds = [...(snap.baseSeeds ?? []), ...(s.pieces?.seeds ?? [])];
    const lab = (sd: SeedId) => seeds.find((x: Seed) => x.id === sd)?.text?.text;
    const tps = truthOf(c)?.variants[c.truth?.variant ?? 0]?.pieces ?? [];
    // only a piece TRUTH knows: elsewhere a wrong count is invisible to any metric
    const p = s.semantics.pieces.find((x) => {
      const l = lab(x.seed);
      return l && tps.some((t) => norm(t.label) === norm(l));
    });
    if (!p) return a;
    const ppg = p.piecesPerGarment + 1;
    mutated.push(`qty seed ${p.seed}: ${p.piecesPerGarment} → ${ppg}`);
    const overrides = {
      ...snap.inputs.overrides,
      [p.seed]: { ...(snap.inputs.overrides[p.seed] ?? {}), piecesPerGarment: ppg },
    };
    const x: Assumption = {
      step: 'meaning',
      kind: 'quantity',
      subject: `seed ${p.seed}${lab(p.seed) ? ` · ${lab(p.seed)}` : ''}`,
      answer: `×${ppg} (MUTATED)`,
      rule: 'mutation control',
      evidence: [],
      confidence: 0,
      strong: false,
      seed: p.seed,
    };
    return withA([x], { overrides }, [{ type: 'names', decisions: s.names }]);
  }
  if (kind === 'size' && s.step === 'sizes' && s.sizes) {
    const m = s.sizes.map.entries.filter((e) => e.card);
    if (m.length < 2) return a;
    const [x, y] = m;
    mutated.push(`size ${x.source.label}→${y.card!.token}, ${y.source.label}→${x.card!.token}`);
    const entries: SizeMapEntry[] = s.sizes.map.entries.map((e) =>
      e === x
        ? { ...e, card: y.card, origin: 'operator' }
        : e === y
          ? { ...e, card: x.card, origin: 'operator' }
          : { ...e, origin: 'operator' },
    );
    const sub = (e: SizeMapEntry) => `source ${e.source.label || `rank ${e.source.rank}`}`;
    const mk = (e: SizeMapEntry, to: string): Assumption => ({
      step: 'sizes',
      kind: 'size-guess',
      subject: sub(e),
      answer: `→ ${to} (MUTATED)`,
      rule: 'mutation control',
      evidence: [],
      confidence: 0,
      strong: false,
    });
    return withA([mk(x, y.card!.token), mk(y, x.card!.token)], {}, [{ type: 'size-map', entries }]);
  }
  return a;
}

const countBy = (xs: string[]) =>
  xs.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {});

/** "meaning:semantics ×3" for runs of the same tick. */
function compress(xs: string[]): string[] {
  const out: string[] = [];
  for (const x of xs) {
    const last = out[out.length - 1];
    const m = last?.match(/^(.*) ×(\d+)$/);
    if (last === x) out[out.length - 1] = `${x} ×2`;
    else if (m && m[1] === x) out[out.length - 1] = `${x} ×${+m[2] + 1}`;
    else out.push(x);
  }
  return out;
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'list') {
    console.log(JSON.stringify([...ALL.map((c) => c.id), 'control:card-match-table']));
    return 0;
  }
  if (!args.length || args.includes('control:card-match-table'))
    console.log(`@@RESULT ${JSON.stringify(cardMatchTable())}`);
  const mutate = process.env.AUTOPILOT_MUTATE || null;
  const want = args.length ? ALL.filter((c) => args.includes(c.id)) : ALL;
  for (const c of want) {
    let r: Record<string, unknown>;
    try {
      r = await runCase(c, mutate);
    } catch (e) {
      r = { id: c.id, verdict: 'crashed', error: toWireError(e).message.slice(0, 600) };
    }
    console.log(`@@RESULT ${JSON.stringify(r)}`);
  }
  return 0;
}
