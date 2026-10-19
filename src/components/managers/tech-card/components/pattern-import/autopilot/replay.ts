// AP-replay — a re-import of the same source files into the same card reuses the answers the last
// import ended with (its manifest's `replay` record, replay-record.ts), so an unchanged file asks
// nothing again.
//
//   · WHICH import: a sheet of this card (`existingPatterns[].manifest`, the card's own id) whose
//     source files are these files by sha256 — all of them (exact), else some (partial: only the
//     answers about a matching file's pages are reused). The newest exact one wins.
//   · WHAT lands: an answer is matched by its VALUE, never its subject (words for people) — a scale
//     candidate of the same factor and method, a legend row of the same signature, a source size of
//     the same rank and label going to a card size that still exists, a piece of the same outline
//     (area and centroid within tolerance) with its grain ends still on it, a fold edge the details
//     step still offers … An answer that does not land is not given: the question stays the
//     operator's (or the autopilot's) and the answer is listed "not replayed: why".
//   · HOW: as the step's own answers (the inputs and events its controls send, `ANSWERS`), through
//     the drive (auto-drive.ts): `resolve` answers a question a step asks, `prefill` gives what the
//     last import answered unasked (a typed name, a fabric tick) on a step that asks nothing.
//   · D5: every replayed answer is an assumption (rule "replay of <sheet> · <date>", who answered
//     it the first time) in the run's list — on screen and in the manifest. Nothing the last import
//     did not explicitly answer is ever given; a step's question that nothing answers goes to the
//     autopilot (autopilot mode) or stays for the operator. The gate stays the judge of the export.
import type {
  CardSize,
  ChainAssign,
  FileId,
  GridOverride,
  ImportSession,
  PageMaskEdit,
  PieceEdit,
  PtMm,
  ReplayAnswer,
  Seed,
  SeedId,
  SheetAnswer,
  SizeMapEntry,
  SourceFileInfo,
  WizardEvent,
  WizardStep,
  ConversionManifest,
  BackgroundKind,
  PageClass,
  ChainRole,
  FabricPurposeKey,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { heldCells } from 'lib/pattern-import/assemble/holes';
import { cardSizeKindOf, sizeKindOf } from 'lib/pattern-import/sizes/map';
import { grainOutsideMm } from 'lib/pattern-import/semantics/grain-inside';
import type { CardContext } from '../client';
import type { Inputs, LegendEdit } from '../use-import-session';
import {
  PAGE_SURE,
  asideDigests,
  openAsides,
  sizeFlags,
  weakAsides,
  type AutoResolver,
} from '../auto-advance';
import { PREFILL_QUESTION } from '../auto-drive';
import { answersNowOf, liveAnswers, liveDrawnSizes, openQuestions, questionKey } from '../answers';
import { assumptionKey, mergeAssumptions, type Assumption, type AssumptionKind } from './types';
import {
  BY_AUTOPILOT,
  BY_OPERATOR,
  REPLAY_RULE,
  anchorOf,
  chainPrint,
  editChains,
  editSeeds,
  flagPrint,
  gridPrint,
  isReplayed,
  inside,
  legendKeyOf,
  loopAt,
  mappedRanks,
  nameString,
  outlineOf,
  variantsAt,
  type Anchor,
  type EncEdit,
} from './replay-record';
import { movePoints, placedAnswers, wasLayout } from './replay-sheets';
import {
  sheetAnswerEdits,
  sheetLegendQuestion,
  sheetQuestion,
} from 'lib/pattern-import/pieces/sheets';

// ── which previous import ───────────────────────────────────────────────────────────────────────

/** LINEFIX: a recorded line answer's value back as the session input (null = not one). */
export function lineAssignOf(v: unknown): ChainAssign | null {
  if (!v || typeof v !== 'object') return null;
  const x = v as { sheet?: unknown; keys?: unknown; to?: unknown };
  const to = (x.to ?? null) as { rank?: unknown; row?: unknown; cls?: unknown } | null;
  if (typeof x.sheet !== 'number' || !Array.isArray(x.keys) || !to) return null;
  const keys = x.keys.filter((k): k is string => typeof k === 'string');
  const t: ChainAssign['to'] | null =
    typeof to.rank === 'number'
      ? { rank: to.rank }
      : typeof to.row === 'string'
        ? { row: to.row }
        : to.cls === 'common' || to.cls === 'ignore'
          ? { cls: to.cls }
          : null;
  return t && keys.length ? { sheet: x.sheet, keys, to: t } : null;
}

function lineAnswers(c: Ctx): Out | null {
  const all = c.prior.answers.filter((a) => a.kind === 'line-assign');
  if (!all.length || c.i.chainAssign?.length || !c.fresh('line-assign', { ref: 'line-assign' }))
    return null;
  const drawn = new Set((c.s.chains?.chainLines ?? []).map((l) => `${l.sheet}|${l.key}`));
  const classes = c.s.chains?.classes ?? [];
  // the row the answer named must still be read: a size of that nesting rank, a row of that key
  const hasTarget = (to: ChainAssign['to']) =>
    'cls' in to ||
    ('rank' in to
      ? classes.filter(
          (k) =>
            k.role === 'size' &&
            k.evidence.some((x) => x.kind === 'nesting-order' && x.rank === to.rank),
        ).length === 1
      : classes.some((k) => legendKeyOf(k) === to.row));
  const assign: ChainAssign[] = [];
  for (const a of all) {
    const e = lineAssignOf(a.value);
    if (!e) continue;
    if (!hasTarget(e.to)) {
      c.miss(
        `line-assign|to|${JSON.stringify(e.to)}`,
        'lines were put in a size row that is not read now',
      );
      continue;
    }
    const keys = e.keys.filter((k) => drawn.has(`${e.sheet}|${k}`));
    for (const k of e.keys)
      if (!keys.includes(k))
        c.miss(`line-assign|${e.sheet}|${k}`, 'a line put in a size last time is not drawn now');
    if (keys.length) assign.push({ ...e, keys });
  }
  if (!assign.length) return null;
  const n = assign.reduce((t, e) => t + e.keys.length, 0);
  return {
    events: [{ type: 'line-assign', assign }],
    as: [
      R(
        c,
        all[0],
        'line-assign',
        `${n} ${n === 1 ? 'line' : 'lines'} put in their sizes as before`,
        [sameFiles(c), 'the same lines (line key)'],
        { ref: 'line-assign', subject: 'lines put in a size by hand' },
      ),
    ],
  };
}

/** The previous import a re-import replays. */
export type Prior = {
  /** Identity (the sheet row + when it was converted): the operator's on/off is kept per prior. */
  key: string;
  /** "front.dxf · 2026-10-11 21:40" — what the replayed assumptions name as their source. */
  label: string;
  /** Every source file matches by sha256 (and no other file was dropped this time). */
  exact: boolean;
  matched: number;
  of: number;
  /** The previous import's file index → this run's file id (matching files only). */
  files: Map<number, FileId>;
  answers: ReplayAnswer[];
  /** The record is the autopilot's assumption list of an import made before the replay record. */
  legacy: boolean;
  /** What a legacy record cannot replay (no piece outline recorded), said once. */
  skipped: string[];
  /** The previous import's worst tile residual (legacy residual answers). */
  residualMm: number | null;
};

/** The previous import of these files on this card, or null (no sha256 match, nothing recorded). */
export function priorOf(
  card: Pick<CardContext, 'techCardId' | 'existingPatterns'>,
  files: readonly Pick<SourceFileInfo, 'id' | 'sha256'>[],
): Prior | null {
  if (!files.length || files.some((f) => !f.sha256)) return null;
  let best: { p: Prior; rank: number[] } | null = null;
  for (const x of card.existingPatterns ?? []) {
    const m = x.manifest;
    if (!m || m.techCardId !== card.techCardId || !m.source?.files?.length) continue;
    const own = m.replay?.answers ?? [];
    const legacy = own.length ? null : legacyAnswers(m);
    const answers = own.length ? own : legacy?.answers ?? [];
    if (!answers.length) continue;
    const used = new Set<FileId>();
    const map = new Map<number, FileId>();
    m.source.files.forEach((f, k) => {
      if (!f.sha256) return;
      const hit = files.find((c) => c.sha256 === f.sha256 && !used.has(c.id));
      if (hit) {
        used.add(hit.id);
        map.set(k, hit.id);
      }
    });
    if (!map.size) continue;
    const exact = map.size === m.source.files.length && m.source.files.length === files.length;
    const when = m.createdAt.slice(0, 16).replace('T', ' ');
    const p: Prior = {
      key: `${x.url}|${m.createdAt}`,
      label: `${x.name || x.filename} · ${when}`,
      exact,
      matched: map.size,
      of: Math.max(files.length, m.source.files.length),
      files: map,
      answers,
      legacy: !!legacy,
      skipped: legacy?.skipped ?? [],
      residualMm: m.source.sheet?.maxResidualMm ?? null,
    };
    const rank = [
      exact ? 1 : 0,
      map.size,
      own.length ? 1 : 0,
      Date.parse(m.createdAt) || 0,
      /MAIN$/.test(x.scopeKey) ? 1 : 0,
    ];
    if (!best || before(rank, best.rank)) best = { p, rank };
  }
  return best?.p ?? null;
}

/** Lexicographic: `a` ranks before `b` (higher first). */
const before = (a: readonly number[], b: readonly number[]) => {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] > b[k];
  return false;
};

/**
 * A manifest written before the replay record: the autopilot's assumptions carry their values
 * (kind + value). File-level answers are read into the record's form; per-piece ones carry no
 * outline to land on and are skipped (said once).
 */
function legacyAnswers(m: ConversionManifest): { answers: ReplayAnswer[]; skipped: string[] } {
  const list = m.autopilot?.assumptions ?? [];
  const out: ReplayAnswer[] = [];
  const skipped = new Set<string>();
  const obj = (v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  const clean: EncEdit[] = [];
  const pages: { f: number; p: number; as: string }[] = [];
  const legend: { c: number; s?: string; r: string; l: string | null }[] = [];
  const asked: string[] = [];
  const sizes: { r: number; l: string; c: { id: number; t: string } | null }[] = [];
  let sheet = 0;
  for (const a of list) {
    const v = obj(a.value);
    const at = {
      step: a.step,
      subject: a.subject,
      ...(a.strong ? { strong: true } : {}),
      auto: true,
    };
    if (!v) {
      if (a.value !== undefined) skipped.add(a.kind);
      continue;
    }
    switch (a.kind) {
      case 'scale-confirmed':
      case 'scale-1to1':
      case 'scale-anisotropic':
        if (typeof v.factor === 'number' && typeof v.method === 'string')
          out.push({
            ...at,
            kind: 'scale',
            value: { factor: v.factor, method: v.method, measured: null, confirmed: true },
          });
        break;
      case 'clean-accept':
        if (typeof v.kind === 'string') clean.push({ k: v.kind, keep: false });
        break;
      case 'pages-as-read':
        if (typeof v.file === 'number' && typeof v.page === 'number' && typeof v.as === 'string')
          pages.push({ f: v.file, p: v.page, as: v.as });
        break;
      case 'sheet-choice':
        if (typeof v.sheet === 'number') {
          sheet = v.sheet;
          out.push({ ...at, kind: 'sheet-choice', value: { sheet: v.sheet } });
        }
        break;
      case 'residuals':
        if (m.source.sheet?.maxResidualMm != null)
          out.push({ ...at, kind: 'residuals', value: { worstMm: m.source.sheet.maxResidualMm } });
        break;
      case 'drawn-sizes':
        if (typeof v.n === 'number')
          out.push({ ...at, kind: 'drawn-sizes', value: { n: v.n, sheet: -1 } });
        break;
      case 'legend-row':
        if (typeof v.legendConfirmed === 'string') asked.push(v.legendConfirmed);
        break;
      case 'legend-outline':
        if (typeof v.classId === 'number' && typeof v.role === 'string')
          legend.push({
            c: v.classId,
            ...(typeof v.sig === 'string' ? { s: v.sig } : {}),
            r: v.role,
            l: typeof v.sizeLabel === 'string' ? v.sizeLabel : null,
          });
        break;
      case 'size-ordinal':
      case 'size-guess':
      case 'size-dropped': {
        const c = obj(v.card);
        if (typeof v.rank === 'number' && typeof v.label === 'string')
          sizes.push({
            r: v.rank,
            l: v.label,
            c:
              c && typeof c.sizeId === 'number' && typeof c.token === 'string'
                ? { id: c.sizeId, t: c.token }
                : null,
          });
        break;
      }
      case 'model':
        if (typeof v.variant === 'string')
          out.push({ ...at, kind: 'model', value: { variant: v.variant } });
        break;
      case 'outline':
        if ((v.meaning === 'cut' || v.meaning === 'seam') && typeof v.allowanceMm === 'number')
          out.push({
            ...at,
            kind: 'outline',
            value: { meaning: v.meaning, allowanceMm: v.allowanceMm },
          });
        break;
      default:
        skipped.add(a.kind);
    }
  }
  const base = { auto: true as const };
  if (clean.length)
    out.push({
      ...base,
      step: 'files',
      kind: 'clean-edits',
      subject: 'the mask',
      value: { edits: clean },
    });
  if (pages.length)
    out.push({
      ...base,
      step: 'files',
      kind: 'files-passed',
      subject: 'pages',
      value: { items: [], pages },
    });
  if (legend.length)
    out.push({ ...base, step: 'sizes', kind: 'legend', subject: 'legend rows', value: legend });
  // the autopilot's outline row was given with the rows it confirmed: the chains were rebuilt
  if (asked.length)
    out.push({
      ...base,
      step: 'sizes',
      kind: 'legend-confirmed',
      subject: 'legend rows',
      value: legend.length ? { rebuilt: asked, asked: [] } : { rebuilt: [], asked },
    });
  if (sizes.length)
    out.push({
      ...base,
      step: 'sizes',
      kind: 'size-map',
      subject: 'sizes',
      value: { entries: sizes },
    });
  for (const a of out) if (a.kind === 'drawn-sizes') (a.value as { sheet: number }).sheet = sheet;
  return {
    answers: out,
    skipped: [...skipped].map(
      (k) => `${k}: recorded before replays anchored pieces and offers — answered again`,
    ),
  };
}

// ── one answer ──────────────────────────────────────────────────────────────────────────────────

export type ReplayMiss = { key: string; why: string };

/** What the replay reads: the snapshot the drive asks with, the card, the hook's extras. */
export type ReplaySnapshot = {
  session: ImportSession;
  inputs: Inputs;
  card: CardContext;
  baseSeeds: Seed[] | null;
  presegmented: boolean;
  /** The step's question (blocker, else offer); null = a prefill (the step asks nothing). */
  question: string | null;
};

/** The replay's answer in the drive's terms (N1 `AutoAnswer` + proceed + the assumptions). */
export type ReplayResult = {
  answer: {
    patch?: Partial<Inputs>;
    events?: WizardEvent[];
    proceed?: boolean;
    assumptions: Assumption[];
  } | null;
  misses: ReplayMiss[];
};

type Out = { patch?: Partial<Inputs>; events?: WizardEvent[]; proceed?: boolean; as: Assumption[] };

type Ctx = ReplaySnapshot & {
  s: ImportSession;
  i: Inputs;
  prior: Prior;
  misses: ReplayMiss[];
  get: (kind: string) => ReplayAnswer | undefined;
  fileOf: (k: number) => FileId | null;
  miss: (key: string, why: string) => void;
  /**
   * Fill-only, once (Codex review): an answer this run already replayed (its assumption is in the
   * list) is never given again — the operator may have changed it since, and that stands.
   */
  fresh: (kind: AssumptionKind, o: { seed?: SeedId; ref?: string; subject?: string }) => boolean;
  /** D6: a point of the record → the drawing now (its sheet's shift; far away = not here). */
  move: (p: PtMm) => PtMm;
};

const near = (a: PtMm, b: PtMm, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** An anchor lands on another: area within 0.5 % (5 mm² floor), centroid within 1.5 mm. */
const ANCHOR_AREA = 0.005;
const ANCHOR_MM = 1.5;
const landsOn = (now: Anchor, was: Anchor) =>
  Math.abs(now.a - was.a) <= Math.max(5, ANCHOR_AREA * was.a) && near(now, was, ANCHOR_MM);

/** Replays what the previous import answered on the session's step (null answer = nothing). */
export function replayAnswer(x: ReplaySnapshot, prior: Prior): ReplayResult {
  const misses: ReplayMiss[] = [];
  const done = new Set(x.inputs.autopilot.filter(isReplayed).map(assumptionKey));
  // D6: the record's points in the drawing now (every tile sheet side by side)
  const placed = placedAnswers(prior.answers, x.session, (k) => prior.files.get(k) ?? null);
  prior = { ...prior, answers: placed.answers };
  const c: Ctx = {
    ...x,
    s: x.session,
    i: x.inputs,
    prior,
    misses,
    move: placed.move,
    get: (kind) => prior.answers.find((a) => a.kind === kind),
    fileOf: (k) => prior.files.get(k) ?? null,
    miss: (key, why) => {
      if (!misses.some((m) => m.key === key)) misses.push({ key, why });
    },
    fresh: (kind, o) =>
      !done.has(assumptionKey({ kind, subject: o.subject ?? '', seed: o.seed, ref: o.ref })),
  };
  for (const k of prior.skipped) c.miss(`legacy|${k}`, k);
  const s = x.session;
  if (s.busy || s.error) return { answer: null, misses };
  let out: Out | null = null;
  if (!prior.exact && s.step !== 'files') {
    if (x.question)
      c.miss(
        'partial',
        `only ${prior.matched} of ${prior.of} source files are the same: only their pages' answers are reused`,
      );
  } else
    switch (s.step) {
      case 'files':
        out = filesStep(c);
        break;
      case 'scale':
        out = scaleStep(c);
        break;
      case 'sheet':
        out = sheetStep(c);
        break;
      case 'sizes':
        out = sizesStep(c);
        break;
      case 'pieces':
        out = piecesStep(c);
        break;
      case 'meaning':
        out = meaningStep(c);
        break;
      case 'fabrics':
        out = fabricsStep(c);
        break;
      default:
        out = null;
    }
  if (!out) {
    if (x.question && !misses.some((m) => !m.key.startsWith('legacy|')))
      c.miss(
        `${s.step}|${x.question}`,
        `${s.step}: not answered on the previous import — ${x.question}`,
      );
    return { answer: null, misses };
  }
  return {
    answer: {
      ...(out.patch || out.as.length
        ? {
            patch: {
              ...(out.patch ?? {}),
              autopilot: mergeAssumptions(x.inputs.autopilot, out.as),
            },
          }
        : {}),
      ...(out.events?.length ? { events: out.events } : {}),
      ...(out.proceed ? { proceed: true } : {}),
      assumptions: out.as,
    },
    misses,
  };
}

/** One replayed assumption (D5): the answer, who gave it the first time, the replay's source. */
function R(
  c: Ctx,
  e: ReplayAnswer,
  kind: AssumptionKind,
  answer: string,
  evidence: string[],
  o: {
    seed?: SeedId;
    ref?: string;
    subject?: string;
    auto?: boolean;
    strong?: boolean;
    value?: ReplayAnswer['value'];
  } = {},
): Assumption {
  const auto = o.auto ?? !!e.auto;
  return {
    step: e.step,
    kind,
    subject: o.subject ?? e.subject,
    answer,
    rule: `${REPLAY_RULE} ${c.prior.label}`,
    evidence: [auto ? BY_AUTOPILOT : BY_OPERATOR, ...evidence].slice(0, 4),
    confidence: auto ? 0.6 : 0.9,
    strong: o.strong ?? !!e.strong,
    ...(o.seed != null ? { seed: o.seed } : {}),
    ...(o.ref != null ? { ref: o.ref } : {}),
    value: o.value ?? e.value,
  };
}

const sameFiles = (c: Ctx) =>
  c.prior.exact
    ? 'the same source files (sha256)'
    : `${c.prior.matched} of ${c.prior.of} source files the same (sha256)`;

// ── files ───────────────────────────────────────────────────────────────────────────────────────

const editKey = (e: PageMaskEdit) =>
  'role' in e
    ? `r:${e.file}:${e.page}`
    : 'item' in e
      ? `i:${e.item}`
      : `k:${e.kind}:${e.file ?? ''}:${e.page ?? ''}`;

/**
 * The edits with these added — fill-only: a target this run already has an edit for keeps it (the
 * operator's, or one replayed before). null = nothing to add.
 */
function mergeEdits(
  cur: readonly PageMaskEdit[],
  add: readonly PageMaskEdit[],
): PageMaskEdit[] | null {
  const have = new Set(cur.map(editKey));
  const more = add.filter((e) => !have.has(editKey(e)));
  return more.length ? [...cur, ...more] : null;
}

/**
 * The previous mask edits that land in this run, at one level: 'page' (kinds, page roles, page
 * items) or 'sheet' (the sheet pass's items). A partial match keeps only the edits of a matching
 * file; a kind edit for every file needs every file.
 */
function landedEdits(c: Ctx, e: ReplayAnswer, level: 'page' | 'sheet'): PageMaskEdit[] {
  const list = (e.value as { edits?: EncEdit[] }).edits ?? [];
  const pageItems = new Set((c.s.clean?.pages ?? []).flatMap((p) => p.items.map((m) => m.id)));
  const sheetItems = new Set((c.s.sheet?.clean?.items ?? []).map((m) => m.id));
  const out: PageMaskEdit[] = [];
  list.forEach((x, k) => {
    const key = `clean-edits|${k}`;
    const file = 'f' in x && x.f !== undefined ? c.fileOf(x.f) : undefined;
    if (file === null)
      return c.miss(key, `a mask edit of a file that changed (file ${(x as { f: number }).f + 1})`);
    if (file === undefined && !c.prior.exact)
      return c.miss(key, 'a mask edit for every file, and not every file is the same');
    if ('role' in x) {
      if (level !== 'page') return;
      if (!c.s.pages.some((p) => p.file === file && p.page === x.p))
        return c.miss(key, `page ${x.p + 1} is not in the file now`);
      out.push({ file: file!, page: x.p, role: x.role as PageClass });
      return;
    }
    if ('i' in x) {
      const id = file !== undefined ? `${file}:${x.i}` : x.i;
      const atSheet = id.startsWith('sheet:');
      if (level === 'page' && atSheet) return;
      if (level === 'sheet' && !atSheet) return;
      if (!(level === 'page' ? pageItems : sheetItems).has(id))
        return c.miss(key, `the mask item ${id} is not offered now`);
      out.push({ item: id, keep: x.keep });
      return;
    }
    if (level !== 'page') return;
    out.push({
      kind: x.k as BackgroundKind,
      keep: x.keep,
      ...(file !== undefined ? { file } : {}),
      ...(x.p !== undefined ? { page: x.p } : {}),
    });
  });
  return out;
}

function filesStep(c: Ctx): Out | null {
  const { s, i } = c;
  if (!s.clean) return null;
  const e = c.get('clean-edits');
  if (e && c.fresh('clean-accept', { ref: 'mask' })) {
    const landed = landedEdits(c, e, 'page');
    const next = mergeEdits(i.cleanEdits, landed);
    if (next)
      return {
        events: [{ type: 'clean', edits: next }],
        as: [
          R(c, e, 'clean-accept', `${landed.length} mask edits as before`, [sameFiles(c)], {
            ref: 'mask',
          }),
        ],
      };
  }
  if (!c.question || c.presegmented) return null;
  // the offer the previous import went on past: the same suggestions, the same pages to check
  const roleSet = new Set(
    i.cleanEdits.flatMap((x) => ('role' in x ? [`${x.file}:${x.page}`] : [])),
  );
  const waiting = s.clean.pages
    .flatMap((p) => p.items)
    .filter((it) => it.status === 'suggest' && !it.applied);
  const pages = [
    ...s.clean.dropped
      .filter((d) => d.status === 'suggest')
      .map((d) => ({ file: d.file, page: d.page, as: `set aside (${d.cls})` })),
    ...s.pages
      .filter(
        (p) =>
          !roleSet.has(`${p.file}:${p.page}`) && (p.cls === 'unknown' || p.confidence < PAGE_SURE),
      )
      .map((p) => ({ file: p.file, page: p.page, as: `read as ${p.cls}` })),
  ];
  if (!waiting.length && !pages.length) return null;
  const pe = c.get('files-passed');
  if (!pe) return null;
  const v = pe.value as {
    items?: { f?: number; i: string }[];
    pages?: { f: number; p: number; as: string }[];
  };
  const items = new Set(
    (v.items ?? []).flatMap((x) => {
      const f = x.f !== undefined ? c.fileOf(x.f) : undefined;
      return f === null ? [] : [f !== undefined ? `${f}:${x.i}` : x.i];
    }),
  );
  const was = new Set(
    (v.pages ?? []).flatMap((x) => {
      const f = c.fileOf(x.f);
      return f == null ? [] : [`${f}:${x.p}:${x.as}`];
    }),
  );
  const openItems = waiting.filter((it) => !items.has(it.id));
  const openPages = pages.filter((p) => !was.has(`${p.file}:${p.page}:${p.as}`));
  for (const it of openItems)
    c.miss(
      `files-passed|${it.id}`,
      `a suggestion to set aside (${it.kind}) was not on offer last time`,
    );
  for (const p of openPages)
    c.miss(
      `files-passed|${p.file}:${p.page}`,
      `${fileLabel(s, p.file)} · page ${p.page + 1} is ${p.as} now — not so on the previous import`,
    );
  if (openItems.length || openPages.length) return null;
  return {
    proceed: true,
    as: [
      R(
        c,
        pe,
        'pages-as-read',
        pages.length
          ? `gone on: ${pages.map((p) => `page ${p.page + 1} ${p.as}`).join(', ')}`
          : 'gone on with the lines kept',
        [
          sameFiles(c),
          'the same pages and suggestions were on offer and the previous import went on past them',
        ],
        { ref: 'files-passed' },
      ),
    ],
  };
}

const fileLabel = (s: ImportSession, id: FileId) =>
  s.files.find((f) => f.id === id)?.name ?? `file ${id}`;

// ── scale ───────────────────────────────────────────────────────────────────────────────────────

function scaleStep(c: Ctx): Out | null {
  const { s, i } = c;
  const e = c.get('scale');
  // fill-only: a scale the operator confirmed or measured in this run stands
  if (!e || i.scaleConfirmed || i.manualMeasuredMm || !c.fresh('scale-confirmed', e)) return null;
  const v = e.value as {
    factor: number;
    method: string;
    declared?: number | null;
    measured?: number | null;
    confirmed?: boolean;
  };
  const k = s.scale.candidates.findIndex(
    (cd) =>
      cd.method === v.method &&
      Math.abs(cd.factor - v.factor) <= 1e-9 * Math.max(1, Math.abs(v.factor)) &&
      (v.declared === undefined || (cd.declaredMm ?? null) === v.declared),
  );
  if (k < 0) {
    c.miss('scale', `the scale ×${v.factor.toFixed(4)} (${v.method}) is not a candidate now`);
    return null;
  }
  const target = {
    scaleIndex: k,
    manualMeasuredMm: v.measured ?? null,
    scaleConfirmed: !!v.confirmed,
  };
  if (
    i.scaleIndex === k &&
    i.manualMeasuredMm === target.manualMeasuredMm &&
    i.scaleConfirmed === target.scaleConfirmed
  )
    return null;
  return {
    patch: target,
    as: [
      R(
        c,
        e,
        'scale-confirmed',
        `×${v.factor.toFixed(4)} (${v.method})${v.measured ? `, square measured ${v.measured} mm` : ''}`,
        [sameFiles(c), 'the same candidate (factor and method) is offered'],
      ),
    ],
  };
}

// ── sheet ───────────────────────────────────────────────────────────────────────────────────────

function gridOf(c: Ctx): { grid: GridOverride; e: ReplayAnswer } | null {
  const e = c.get('sheet-grid');
  if (!e) return null;
  const v = e.value as {
    rows: number;
    cols: number;
    sx: number;
    sy: number;
    order: GridOverride['order'];
    f: number;
    p: number;
  };
  const file = c.fileOf(v.f);
  if (!file || !c.s.pages.some((p) => p.file === file && p.page === v.p)) {
    c.miss('sheet-grid', 'the hand-set tile grid starts on a page that is not in the files now');
    return null;
  }
  return {
    e,
    grid: {
      rows: v.rows,
      cols: v.cols,
      stepXMm: v.sx,
      stepYMm: v.sy,
      order: v.order,
      originPage: { file, page: v.p },
    },
  };
}

function sheetStep(c: Ctx): Out | null {
  const { s, i } = c;
  const grid = gridOf(c);
  // D6: no sheet is picked (every one is in the drawing); a hand grid is set on its own sheet
  if (grid && !i.gridOverride && c.fresh('sheet-grid', grid.e))
    return {
      events: [
        {
          type: 'sheet',
          sheet:
            s.pages.find(
              (p) =>
                p.cls === 'tile' &&
                p.file === grid.grid.originPage.file &&
                p.page === grid.grid.originPage.page,
            )?.sheet ?? 0,
          override: grid.grid,
        },
      ],
      as: [
        R(c, grid.e, 'sheet-grid', `${grid.grid.rows}×${grid.grid.cols} tiles, as set by hand`, [
          sameFiles(c),
        ]),
      ],
    };
  const ce = c.get('clean-edits');
  if (ce && c.fresh('clean-accept', { ref: 'sheet-mask' })) {
    const landed = landedEdits(c, ce, 'sheet');
    const next = mergeEdits(i.cleanEdits, landed);
    if (next)
      return {
        events: [{ type: 'clean', edits: next }],
        as: [
          R(c, ce, 'clean-accept', `${landed.length} sheet mask edits as before`, [sameFiles(c)], {
            ref: 'sheet-mask',
          }),
        ],
      };
  }
  // UXHOOKS: missing tiles taken as blank pages last time — the same cells missing now
  const missing = s.sheet?.sheet.missing ?? [];
  if (missing.length && !s.sheet?.sheet.refused?.length) {
    const me = c.get('missing-accepted');
    type WasHole = {
      sheet: number;
      row: number;
      col: number;
      /** The file by its index in the record's source.files (`c.fileOf`). */
      f?: number;
      origin?: 'operator' | 'autopilot';
    };
    const was = (me?.value as { holes?: WasHole[] } | undefined)?.holes ?? [];
    // the same cell (and the same file, when the record names one) missing again
    const wasOf = (m: (typeof missing)[number]) =>
      was.find(
        (w) =>
          w.sheet === (m.sheet ?? 0) &&
          w.row === m.row &&
          w.col === m.col &&
          // a record without the file (one file per sheet) matches any file
          (w.f == null || (c.fileOf(w.f) != null && c.fileOf(w.f) === m.file)),
      );
    const hit = missing.filter((m) => !!wasOf(m));
    if (me && hit.length && c.fresh('missing-accepted', { ref: 'holes' })) {
      const sheets = [...new Set(hit.map((m) => m.sheet ?? 0))];
      return {
        events: sheets.map(
          (k): WizardEvent => ({
            type: 'sheet-accept-missing',
            sheet: k,
            cells: [
              ...heldCells(s.sheet?.sheet, k),
              ...hit
                .filter((m) => (m.sheet ?? 0) === k)
                .map((m) => ({
                  row: m.row,
                  col: m.col,
                  ...(m.file != null ? { file: m.file } : {}),
                  origin: wasOf(m)?.origin ?? 'operator',
                })),
            ],
          }),
        ),
        as: [
          R(
            c,
            me,
            'missing-accepted',
            `${hit.length} missing ${hit.length === 1 ? 'tile' : 'tiles'} as blank pages`,
            [sameFiles(c), 'the same cells are missing'],
            { ref: 'holes' },
          ),
        ],
      };
    }
  }
  const worst = Math.max(0, ...(s.sheet?.sheet.poses.map((p) => p.residualMm) ?? [0]));
  if (worst > PATIMPORT.registrationMaxResidualMm && !i.residualsAccepted) {
    const e = c.get('residuals');
    if (!e || !c.fresh('residuals', e)) return null;
    const was = (e.value as { worstMm?: number }).worstMm ?? c.prior.residualMm;
    if (was == null || worst > was + 0.005) {
      c.miss(
        'residuals',
        `the tiles close at ${worst.toFixed(2)} mm now, ${was?.toFixed(2) ?? '?'} mm was accepted`,
      );
      return null;
    }
    return {
      patch: { residualsAccepted: true },
      as: [
        R(c, e, 'residuals', `accepted ${worst.toFixed(2)} mm`, [
          sameFiles(c),
          `${was.toFixed(2)} mm was accepted`,
        ]),
      ],
    };
  }
  if (!c.question) return null;
  const waiting = (s.sheet?.clean?.items ?? []).filter(
    (it) => it.status === 'suggest' && !it.applied,
  );
  if (!waiting.length) return null;
  const pe = c.get('sheet-passed');
  if (!pe) return null;
  const was = new Set((pe.value as { items?: string[] }).items ?? []);
  const open = waiting.filter((it) => !was.has(it.id));
  for (const it of open)
    c.miss(`sheet-passed|${it.id}`, `a sheet suggestion (${it.kind}) was not on offer last time`);
  if (open.length) return null;
  return {
    proceed: true,
    as: [
      R(c, pe, 'sheet-passed', 'gone on with the lines kept', [
        sameFiles(c),
        'the same suggestions were on offer',
      ]),
    ],
  };
}

// ── the drawing the answers were given on ─────────────────────────────────────────────────────

/**
 * Codex review: the answers after the sheet step (legend, sizes, pieces, details, fabrics) were
 * given on ONE drawing — a tile sheet, its grid and, from the model on, a model. Another drawing of
 * the same files is another set of questions: why not, or null = the same drawing.
 */
function offScope(c: Ctx, model: boolean): string | null {
  const e = c.get('scope');
  const v = (e?.value ?? null) as {
    sheet: number;
    grid: ReturnType<typeof gridPrint>;
    variant: string | null;
  } | null;
  // D6: the drawing is every tile sheet; the previous answers stand on the sheets they were given
  // on, as long as those are in the drawing now
  const now = new Set((c.s.sheet?.sheet.parts ?? [{ sheet: 0 }]).map((p) => p.sheet));
  const gone = wasLayout(c.prior.answers).parts.filter((w) => !now.has(w.k));
  if (gone.length)
    return `the previous answers were given on tile sheet ${gone[0].k + 1}, which is not in the drawing now`;
  if (v) {
    const now = gridPrint(c.i.gridOverride);
    const was = v.grid ? { ...v.grid, f: c.fileOf(v.grid.f) } : null;
    const cur = now && c.i.gridOverride ? { ...now, f: c.i.gridOverride.originPage.file } : null;
    if (!same(was, cur)) return 'the previous answers were given on another tile grid';
  }
  if (model) {
    const variant = v
      ? v.variant
      : (c.get('model')?.value as { variant?: string } | undefined)?.variant ?? null;
    if ((c.s.variant ?? null) !== variant)
      return `the previous answers were given for ${variant ? `model "${variant}"` : 'every model'}, this run is on ${c.s.variant ? `model "${c.s.variant}"` : 'every model'}`;
  }
  return null;
}

/**
 * D6: a record from before D6 that imported ONE tile sheet, replayed on a drawing of several: its
 * size answers (the count, the size map by rank) were read on that sheet's lines alone — the ranks
 * of the whole drawing may differ, so they are asked again. Null = not such a record.
 */
function aloneBefore(c: Ctx): string | null {
  const parts = c.s.sheet?.sheet.parts ?? [];
  const { parts: was, legacy } = wasLayout(c.prior.answers);
  return legacy && parts.length > 1 ? `tile sheet ${was[0].k + 1} alone (before D6)` : null;
}

/** Off scope: said once (on a question), nothing replayed. */
const outOfScope = (c: Ctx, model: boolean) => {
  const why = offScope(c, model);
  if (why) c.miss('scope', why);
  return !!why;
};

// ── sizes ───────────────────────────────────────────────────────────────────────────────────────

function sizesStep(c: Ctx): Out | null {
  const { s, i, card } = c;
  const classes = s.chains?.classes ?? [];
  if (!s.sizes || !s.chains) return null;
  if (outOfScope(c, false)) return null;
  const lc = c.get('legend-confirmed');
  const lcv = (lc?.value ?? {}) as { rebuilt?: string[]; asked?: string[] };
  const keys = new Set(classes.map(legendKeyOf));
  // 1 · the legend rows the previous import changed (by the row's signature)
  const le = c.get('legend');
  if (le && c.fresh('legend-outline', { ref: 'legend' })) {
    const target: LegendEdit[] = [];
    for (const x of (le.value as unknown as {
      c: number;
      s?: string;
      r: string;
      l: string | null;
    }[]) ?? []) {
      const row = x.s
        ? classes.find((k) => k.sig === x.s)
        : classes.find((k) => k.id === x.c && !k.sig);
      if (!row) {
        c.miss(
          `legend|${x.s ?? x.c}`,
          `a legend row answered last time (${x.r}${x.l ? ` ${x.l}` : ''}) is not read now`,
        );
        continue;
      }
      target.push({
        classId: row.id,
        role: x.r as ChainRole,
        sizeLabel: x.l,
        ...(x.s ? { sig: x.s } : {}),
      });
    }
    // fill-only: a row this run already answered keeps its answer
    const have = new Set(i.legend.map((e) => e.sig ?? `#${e.classId}`));
    const more = target.filter((e) => !have.has(e.sig ?? `#${e.classId}`));
    if (more.length) {
      const add = (lcv.rebuilt ?? []).filter((k) => keys.has(k) && !i.legendConfirmed.includes(k));
      return {
        ...(add.length ? { patch: { legendConfirmed: [...i.legendConfirmed, ...add] } } : {}),
        events: [{ type: 'legend', edits: [...i.legend, ...more] }],
        as: [
          R(
            c,
            le,
            'legend-outline',
            `${more.length} legend rows as answered before`,
            [sameFiles(c), 'the same rows (signature)'],
            { ref: 'legend' },
          ),
          ...(add.length && lc
            ? [
                R(c, lc, 'legend-row', `${add.length} rows confirmed as read`, [sameFiles(c)], {
                  ref: 'legend-rebuilt',
                }),
              ]
            : []),
        ],
      };
    }
  }
  // 2 · rows below 0.6 confirmed as read (the chains rebuilt with them, or only asked — as before)
  const clash = (k: (typeof classes)[number]) =>
    k.evidence.some((x) => x.kind === 'face-graded' && !!x.sourceOne);
  const pending = classes.filter(
    (k) => k.confidence < 0.6 && !i.legendConfirmed.includes(legendKeyOf(k)) && !clash(k),
  );
  if (pending.length && lc) {
    const rebuilt = pending
      .filter((k) => (lcv.rebuilt ?? []).includes(legendKeyOf(k)))
      .map(legendKeyOf);
    if (rebuilt.length)
      return {
        patch: { legendConfirmed: [...i.legendConfirmed, ...rebuilt] },
        events: [{ type: 'legend', edits: i.legend }],
        as: [
          R(
            c,
            lc,
            'legend-row',
            `${rebuilt.length} rows confirmed as read`,
            [sameFiles(c), 'the same rows (signature)'],
            { ref: 'legend-rebuilt' },
          ),
        ],
      };
  }
  // 2a · LINEFIX: the lines the operator put in a size (by line key) — only lines drawn now, only
  // while this run has no line answers of its own (fill-only)
  const la = lineAnswers(c);
  if (la) return la;
  // 2b · D6: the tile sheets draw different size rows — confirmed last time for the SAME rows on
  // the same sheets (the signature), else asked again
  const sl = c.get('sheet-legend');
  const leg = s.sizes.sheetLegend;
  if (sl && leg && sheetLegendQuestion(leg, i.sheetLegendOk)) {
    const sig = (sl.value as { sig?: string }).sig;
    if (sig !== leg.sig)
      c.miss('sheet-legend', 'the tile sheets draw other size rows than when they were confirmed');
    else if (c.fresh('sheet-legend', { ref: 'sheet-legend' }))
      return {
        patch: { sheetLegendOk: sig },
        as: [
          R(
            c,
            sl,
            'sheet-legend',
            'the tile sheets share the legend as read',
            [sameFiles(c), 'the same size rows on the same sheets (signature)'],
            { ref: 'sheet-legend' },
          ),
        ],
      };
  }
  // 3 · how many sizes the sheet draws
  const de = c.get('drawn-sizes');
  if (de) {
    const v = de.value as { n: number; sheet: number };
    // D6: the size count is the document's — one answered on a tile sheet alone (a record from
    // before D6) is asked again when the drawing now has more sheets
    const alone = aloneBefore(c);
    if (alone)
      c.miss(
        'drawn-sizes',
        `the size count was answered on ${alone} — the drawing now has every sheet`,
      );
    else if (liveDrawnSizes(i, i) == null && c.fresh('drawn-sizes', de))
      return {
        events: [{ type: 'drawn-sizes', n: v.n }],
        as: [
          R(c, de, 'drawn-sizes', `${v.n} ${v.n === 1 ? 'size' : 'sizes'} drawn`, [sameFiles(c)]),
        ],
      };
  }
  // 4 · the size map: a source size of the same rank AND label to a card size that still exists
  const me = c.get('size-map');
  const alone = aloneBefore(c);
  if (me && alone)
    c.miss('size-map', `the size map was answered on ${alone} — the drawing now has every sheet`);
  else if (me) {
    const prior =
      (me.value as { entries?: { r: number; l: string; c: { id: number; t: string } | null }[] })
        .entries ?? [];
    const replayed: SizeMapEntry[] = [];
    for (const e of s.sizes.map.entries) {
      const p = prior.find((x) => x.r === e.source.rank && x.l === e.source.label);
      if (!p) continue;
      const want: CardSize | null = p.c
        ? card.sizes.find((k) => k.sizeId === p.c!.id && k.token === p.c!.t) ?? null
        : null;
      if (p.c && !want) {
        c.miss(
          `size-map|${p.r}`,
          `size ${p.l || `rank ${p.r}`} went to ${p.c.t}, which is not on the card now`,
        );
        continue;
      }
      // Ф6: a size across kinds (38 → M, 4/6 → 14) is never replayed — the record does not say
      // the operator chose it, and the autopilot may not; it is asked again
      const sk = sizeKindOf(e.source.label);
      const ck = want ? cardSizeKindOf(want) : null;
      if (sk != null && ck != null && sk !== ck) {
        c.miss(
          `size-map|${p.r}`,
          `size ${p.l} went to ${want!.token}, another size kind — asked again, not replayed`,
        );
        continue;
      }
      // fill-only: a size this run answered keeps its answer; one replayed before is not again
      if (e.origin === 'operator' || !c.fresh('size-guess', { ref: `rank:${e.source.rank}` }))
        continue;
      replayed.push({ ...e, card: want, origin: 'operator' });
    }
    if (replayed.length)
      return {
        events: [
          {
            type: 'size-map',
            entries: [
              ...(i.sizeMap ?? []).filter(
                (x) => !replayed.some((r) => r.source.rank === x.source.rank),
              ),
              ...replayed,
            ],
          },
        ],
        as: replayed.map((r) =>
          R(
            c,
            me,
            'size-guess',
            `${r.source.label || `rank ${r.source.rank}`} → ${r.card?.token ?? 'not exported'}`,
            [sameFiles(c), 'the same source size (rank and label)'],
            {
              ref: `rank:${r.source.rank}`,
              subject: r.source.label
                ? `size ${r.source.label}`
                : `drawn size ${r.source.rank + 1}`,
              value: {
                rank: r.source.rank,
                label: r.source.label,
                card: r.card ? { sizeId: r.card.sizeId, token: r.card.token } : null,
              },
            },
          ),
        ),
      };
  }
  // 2b · rows only asked (an inputs-only answer, last: it leaves the stage outputs as they were,
  //      and the drive must not take the same question over the same outputs for a loop)
  if (pending.length && lc) {
    const asked = pending
      .filter((k) => (lcv.asked ?? []).includes(legendKeyOf(k)))
      .map(legendKeyOf);
    if (asked.length)
      return {
        patch: { legendConfirmed: [...i.legendConfirmed, ...asked] },
        as: [
          R(
            c,
            lc,
            'legend-row',
            `${asked.length} rows confirmed as read`,
            [sameFiles(c), 'the same rows (signature)'],
            { ref: 'legend-asked' },
          ),
        ],
      };
  }
  for (const k of pending)
    c.miss(
      `legend-row|${legendKeyOf(k)}`,
      `legend row ${k.role}${k.sizeLabel ? ` ${k.sizeLabel}` : ''} was not confirmed last time`,
    );
  // 5 · the reader's flags, gone on past as before
  if (!c.question) return null;
  const flags = sizeFlags(s.chains.ambiguities, s.sizes.expected?.n);
  const fe = c.get('size-flags');
  if (!flags.length || !fe) return null;
  const was = new Set((fe.value as { flags?: string[] }).flags ?? []);
  const open = flags.filter((f) => !was.has(flagPrint(f)));
  for (const f of open)
    c.miss(
      `size-flags|${flagPrint(f)}`,
      `the reader flag "${f.message.slice(0, 80)}" was not on offer last time`,
    );
  if (open.length) return null;
  return {
    proceed: true,
    as: [
      R(
        c,
        fe,
        'size-flag',
        `gone on past ${flags.length} reader flags`,
        [sameFiles(c), 'the same flags were on offer'],
        { ref: 'size-flags' },
      ),
    ],
  };
}

// ── pieces ──────────────────────────────────────────────────────────────────────────────────────

/**
 * The piece edits of the previous import, put back together from their one-per-edit answers (a
 * record missing one of them — dropped as too long — replays none).
 */
function editsOf(c: Ctx): ReplayAnswer | undefined {
  const parts = c.prior.answers.filter((a) => a.kind === 'piece-edit');
  const want = (c.get('scope')?.value as { edits?: number } | undefined)?.edits ?? 0;
  if (!parts.length) {
    if (want > 0) c.miss('piece-edits', `the record lost the ${want} piece edits — none is reused`);
    return undefined;
  }
  type Part = {
    n: number;
    k: number;
    part: number;
    parts: number;
    text: string;
    seeds?: Record<string, { at: PtMm; click: boolean }>;
    chains?: Record<string, number[] | null>;
  };
  const vs = parts.map((a) => a.value as unknown as Part);
  const n = vs[0].n;
  const edits: PieceEdit[] = [];
  const seeds: Record<string, { at: PtMm; click: boolean }> = {};
  const chains: Record<string, number[] | null> = {};
  let whole = vs.every((v) => v.n === n) && (!want || want === n);
  for (let k = 0; whole && k < n; k++) {
    const mine = vs.filter((v) => v.k === k).sort((a, b) => a.part - b.part);
    const count = mine[0]?.parts ?? 0;
    if (!count || mine.length !== count || mine.some((v, j) => v.part !== j || v.parts !== count)) {
      whole = false;
      break;
    }
    try {
      edits.push(movePoints(JSON.parse(mine.map((v) => v.text).join('')), c.move) as PieceEdit);
    } catch {
      whole = false;
      break;
    }
    Object.assign(seeds, mine[0].seeds ?? {});
    Object.assign(chains, mine[0].chains ?? {});
  }
  if (!whole) {
    c.miss('piece-edits', `the record does not hold all ${n} piece edits whole — none is reused`);
    return undefined;
  }
  return {
    step: 'pieces',
    kind: 'piece-edits',
    subject: `${n} piece edits`,
    value: { edits, seeds, chains } as unknown as ReplayAnswer['value'],
    ...(parts.some((a) => a.strong) ? { strong: true } : {}),
    ...(parts.some((a) => a.auto) ? { auto: true } : {}),
  };
}

type ClickRec = { id: number; at: PtMm; text?: boolean; aside?: number; loop?: Anchor | null };

function piecesStep(c: Ctx): Out | null {
  const { s, i } = c;
  if (!s.pieces) return null;
  if (outOfScope(c, false)) return null;
  const seeds = s.pieces.seeds ?? [];
  const variants = variantsAt(seeds, c.baseSeeds, s.pieces.variants);
  if (variants.length > 1 && !s.variant) {
    const e = c.get('model');
    if (!e || !c.fresh('model', e)) return null;
    const variant = (e.value as { variant: string }).variant;
    if (!variants.includes(variant)) {
      c.miss('model', `the model "${variant}" is not on the sheet now`);
      return null;
    }
    return {
      events: [{ type: 'variant', variant }],
      as: [
        R(c, e, 'model', `model "${variant}"`, [sameFiles(c), 'the same model is on the sheet']),
      ],
    };
  }
  const preview = s.chains?.chainPreview;
  if (outOfScope(c, true)) return null;
  // the clicks and the piece edits, put back together as the previous import ended with them
  // (once each: the operator may click or undo afterwards, and that stands)
  const ce0 = c.get('seed-clicks');
  const ce = ce0 && c.fresh('seed-click', { ref: 'seed-clicks' }) ? ce0 : undefined;
  const ee0 = editsOf(c);
  const ee = ee0 && c.fresh('piece-edits', { ref: 'piece-edits' }) ? ee0 : undefined;
  if (ce || ee) {
    const base = c.baseSeeds ?? [];
    const asides = s.pieces.setAside ?? [];
    const target: Seed[] = [];
    const idMap = new Map<number, number>();
    for (const k of (ce?.value as { seeds?: ClickRec[] } | undefined)?.seeds ?? []) {
      const nextId = Math.max(0, ...[...base, ...target].map((x) => x.id)) + 1;
      let seed: Seed | null = null;
      if (k.text) {
        const a = asides.find((x) => x.seed && x.seed.id === k.id && near(x.seed.at, k.at, 0.5));
        if (a?.seed) seed = a.seed;
        else
          c.miss(
            `seed-clicks|${k.id}`,
            `the outline made a piece last time (its text seed) is not set aside now`,
          );
      } else if (k.aside != null) {
        const a = asides.find((x) => x.id === k.aside && near(x.at, k.at, 0.5));
        if (a) seed = { id: nextId, at: a.at, origin: 'click', variant: i.variant, aside: a.id };
        else
          c.miss(
            `seed-clicks|${k.id}`,
            `the outline made a piece last time (set aside ${k.aside}) is not set aside now`,
          );
      } else {
        const now = loopAt(preview, k.at);
        const ok = k.loop ? !!now && landsOn(now, k.loop) : !now;
        if (ok) seed = { id: nextId, at: k.at, origin: 'click', variant: i.variant };
        else
          c.miss(
            `seed-clicks|${k.id}`,
            `the click at (${Math.round(k.at.x)}, ${Math.round(k.at.y)}) mm no longer falls in the same closed outline`,
          );
      }
      if (seed) {
        idMap.set(k.id, seed.id);
        target.push(seed);
      }
    }
    // the clicks already made in this run must be the start of the same list
    const sig = (x: Seed) => [x.id, x.at.x, x.at.y, x.origin, x.aside ?? null];
    if (
      ce &&
      i.clickSeeds.length &&
      !same(i.clickSeeds.map(sig), target.slice(0, i.clickSeeds.length).map(sig))
    ) {
      c.miss(
        'seed-clicks',
        'pieces were clicked differently in this run — the previous clicks are not added',
      );
      return null;
    }
    let edits = i.edits;
    if (ee) {
      const v = ee.value as unknown as {
        edits: PieceEdit[];
        seeds: Record<string, { at: PtMm; click: boolean }>;
        chains: Record<string, number[] | null>;
      };
      const why: string[] = [];
      const seedOf = (id: SeedId): SeedId | null => {
        const w = v.seeds[id];
        if (!w) return null;
        if (w.click) return idMap.get(id) ?? null;
        const b = base.find((x) => x.id === id);
        return b && near(b.at, w.at, 0.5) ? id : null;
      };
      const mapped = v.edits.map((e): PieceEdit | null => {
        for (const ch of editChains(e))
          if (!same(chainPrint(preview, ch), v.chains[ch] ?? null)) {
            why.push(`line ${ch} is not the same line now`);
            return null;
          }
        const ids = editSeeds(e).map(seedOf);
        if (ids.some((x) => x == null)) {
          why.push(`a piece it names (seed ${editSeeds(e).join(', ')}) is not seeded the same now`);
          return null;
        }
        const m = new Map(editSeeds(e).map((k, j) => [k, ids[j]!] as const));
        switch (e.kind) {
          case 'merge':
            return { ...e, seeds: e.seeds.map((k) => m.get(k)!) };
          case 'split':
          case 'not-a-piece':
          case 'reseed':
          case 'wall-override':
            return { ...e, seed: m.get(e.seed)! } as PieceEdit;
          case 'bridge':
            return { ...e, seed: e.seed != null ? m.get(e.seed)! : null };
          default:
            return e;
        }
      });
      if (why.length) c.miss('piece-edits', `the piece edits are not reused: ${why[0]}`);
      else {
        const all = mapped as PieceEdit[];
        if (!same(i.edits, all.slice(0, i.edits.length)))
          c.miss(
            'piece-edits',
            'the pieces were edited differently in this run — the previous edits are not added',
          );
        else if (!same(i.edits, all)) edits = all;
      }
    }
    const clicks = !ce || same(i.clickSeeds, target) ? i.clickSeeds : target;
    if (clicks !== i.clickSeeds || edits !== i.edits) {
      const as: Assumption[] = [];
      if (ce && clicks !== i.clickSeeds)
        as.push(
          R(
            c,
            ce,
            'seed-click',
            `${target.length} pieces clicked as before`,
            [sameFiles(c), 'each click falls in the same closed outline'],
            { ref: 'seed-clicks' },
          ),
        );
      if (ee && edits !== i.edits)
        as.push(
          R(
            c,
            ee,
            'piece-edits',
            `${edits.length} piece edits as before`,
            [sameFiles(c), 'the pieces and lines they name are the same'],
            { ref: 'piece-edits' },
          ),
        );
      return {
        ...(clicks !== i.clickSeeds ? { patch: { clickSeeds: clicks } } : {}),
        events: [{ type: 'piece-edits', edits }],
        as,
      };
    }
  }
  // the outlines kept aside on a guess, gone on past as before
  if (!c.question) return null;
  const weak = weakAsides(s.pieces.setAside, s.pieces.families, s.pieces.seeds);
  // D6: the cross-sheet answers kept by key ("copy" / "keep" came back as the piece edits above)
  const sq = sheetQuestion(s.pieces.sheets, i.sheetAnswers);
  const se = c.get('sheet-pieces');
  if (sq && se) {
    const was = (se.value as { answers?: [string, SheetAnswer][] }).answers ?? [];
    const hit = was.find(([k]) => k === sq.key);
    const kind = sq.kind === 'alternative' ? 'sheet-alternative' : 'sheet-copy';
    if (hit && c.fresh(kind, { ref: sq.key }))
      return {
        events: [
          {
            type: 'sheet-answer',
            key: sq.key,
            answer: hit[1],
            edits: sheetAnswerEdits(s.pieces.sheets, sq.key, hit[1]),
          },
        ],
        as: [
          R(c, se, kind, hit[1], [sameFiles(c), 'the same pieces on the same sheets'], {
            ref: sq.key,
          }),
        ],
      };
    if (!hit)
      c.miss(`sheet-pieces|${sq.key}`, `pieces: not answered on the previous import — ${sq.text}`);
  }
  // UXHOOKS: the operator's "looked at the outlines set aside", on the same set (digest) only
  const parts = s.sheet?.sheet.parts;
  const open = openAsides(weak, parts, i.asideReviewed);
  const re = c.get('asides-reviewed');
  if (open.length && re && c.fresh('asides-reviewed', { ref: 'asides' })) {
    const was = (re.value as { digests?: Record<string, string> }).digests ?? {};
    const now = asideDigests(open, parts);
    const back = Object.fromEntries(Object.entries(now).filter(([k, d]) => was[k] === d)) as Record<
      number,
      string
    >;
    if (Object.keys(back).length)
      return {
        patch: { asideReviewed: { ...i.asideReviewed, ...back } },
        as: [
          R(
            c,
            re,
            'asides-reviewed',
            'looked at as before',
            [sameFiles(c), 'the same outlines set aside (place and area)'],
            { ref: 'asides', auto: false },
          ),
        ],
      };
  }
  const ae = c.get('asides-passed');
  if (!open.length || !ae) return null;
  const was = (ae.value as { asides?: { id: number; at: PtMm; a: number }[] }).asides ?? [];
  const unseen = open.filter(
    (a) =>
      !was.some(
        (w) =>
          w.id === a.id &&
          near(w.at, a.at, 1) &&
          Math.abs(w.a - a.areaMm2) <= Math.max(5, 0.01 * w.a),
      ),
  );
  for (const a of unseen)
    c.miss(
      `asides-passed|${a.id}`,
      `the outline at (${Math.round(a.at.x)}, ${Math.round(a.at.y)}) mm set aside (${a.reason}) was not kept aside last time`,
    );
  if (unseen.length) return null;
  return {
    proceed: true,
    as: [
      R(
        c,
        ae,
        'set-aside',
        `${weak.length} outlines kept aside as before`,
        [sameFiles(c), 'the same outlines (place and area)'],
        { ref: 'asides-passed' },
      ),
    ],
  };
}

// ── details ─────────────────────────────────────────────────────────────────────────────────────

type PieceRec = {
  pc: Anchor;
  seed?: number;
  name?: { code: string; mods: string[]; displayName: string };
  named?: string;
  qty?: string;
  ov?: Record<string, unknown>;
  grain?: { a: PtMm; b: PtMm; acc?: string[] };
  /** `half`: exported as the half with its fold line marked (L13). */
  fold?: { a: PtMm; b: PtMm; half?: true };
  fab?: string[];
  auto?: string[];
  strong?: string[];
};

/** Distance from a point to a ring's edges. */
function ringDist(p: PtMm, ring: readonly PtMm[]): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/** The pieces of this run, each with its anchor and outline; the previous piece each one is. */
function piecesNow(c: Ctx) {
  const mapped = mappedRanks(c.s.sizes?.map);
  const now = (c.s.pieces?.families ?? []).flatMap((f) => {
    const pc = anchorOf(f, mapped);
    const ring = outlineOf(f, mapped);
    // every size's outline: an answer drawn on one size (a proposal's grain) lies on that one
    const rings = f.candidates
      .filter((k) => k.outcome === 'closed' && k.outer.length > 2)
      .map((k) => k.outer);
    // GRAIN lane: the sizes a grain answer is applied to (as drawn, to every one of them)
    const exported = f.candidates
      .filter(
        (k) => k.outcome === 'closed' && k.outer.length > 2 && (!mapped || mapped.has(k.rank)),
      )
      .map((k) => k.outer);
    return pc && ring ? [{ seed: f.seed, pc, ring, rings, exported }] : [];
  });
  const taken = new Set<SeedId>();
  const matches: {
    rec: ReplayAnswer;
    v: PieceRec;
    seed: SeedId;
    ring: PtMm[];
    rings: PtMm[][];
    exported: PtMm[][];
  }[] = [];
  for (const rec of c.prior.answers.filter((a) => a.kind === 'piece')) {
    const v = rec.value as unknown as PieceRec;
    const hits = now
      .filter((n) => !taken.has(n.seed) && landsOn(n.pc, v.pc))
      .sort(
        (a, b) =>
          Math.hypot(a.pc.x - v.pc.x, a.pc.y - v.pc.y) -
          Math.hypot(b.pc.x - v.pc.x, b.pc.y - v.pc.y),
      );
    if (!hits.length) {
      c.miss(
        `piece|${v.pc.x},${v.pc.y}`,
        `${rec.subject}: no piece of this outline now (${v.pc.a} mm² at ${Math.round(v.pc.x)}, ${Math.round(v.pc.y)} mm) — its answers are asked again`,
      );
      continue;
    }
    taken.add(hits[0].seed);
    matches.push({
      rec,
      v,
      seed: hits[0].seed,
      ring: hits[0].ring,
      rings: hits[0].rings,
      exported: hits[0].exported,
    });
  }
  return matches;
}

function meaningStep(c: Ctx): Out | null {
  const { s, i } = c;
  const sem = s.semantics;
  if (!sem) return null;
  if (outOfScope(c, true)) return null;
  const now = answersNowOf(s, i);
  const live = liveAnswers(i, now);
  const open = openQuestions(sem, s.names, i, now);
  const overrides = { ...i.overrides };
  const operatorGrain = { ...i.operatorGrain };
  const operatorFold = { ...i.operatorFold };
  const confirmedQuantities = { ...i.confirmedQuantities };
  const confirmedNames = new Set(i.confirmedNames);
  const editedNames = new Set(i.editedNames);
  let names = s.names;
  const changed = new Set<string>();
  const as: Assumption[] = [];
  let fileAllowance = i.fileAllowance;
  let foldListChecked = i.foldListChecked;
  for (const m of piecesNow(c)) {
    const { rec, v, seed: sd, rings, exported } = m;
    /** On the piece: inside one of its sizes' outlines, or within the anchor tolerance of one. */
    const onPiece = (p: PtMm) => rings.some((r) => inside(p, r) || ringDist(p, r) <= ANCHOR_MM);
    const onEdge = (p: PtMm) => rings.some((r) => ringDist(p, r) <= ANCHOR_MM);
    const spec = sem.pieces.find((p) => p.seed === sd);
    const subject = spec ? `${spec.identity} (seed ${sd})` : `${rec.subject} (seed ${sd})`;
    const by = (field: string) => ({
      auto: (v.auto ?? []).includes(field),
      strong: (v.strong ?? []).includes(field),
    });
    const landed = `the same piece outline (${v.pc.a} mm², centroid within ${ANCHOR_MM} mm)`;
    const field = (
      f: string,
      kind: AssumptionKind,
      answer: string,
      value: ReplayAnswer['value'],
      ev: string[] = [],
    ) => as.push(R(c, rec, kind, answer, [landed, ...ev], { seed: sd, subject, value, ...by(f) }));
    // fill-only, once: a name the operator typed in this run (or one replayed before) stands
    const typed = overrides[sd]?.nameOrigin === 'operator' || editedNames.has(sd);
    if (
      v.name &&
      !typed &&
      c.fresh('name-typed', { seed: sd }) &&
      c.fresh('name-code', { seed: sd })
    ) {
      const row = names.find((n) => n.seed === sd);
      if (row) {
        if (nameString(row) !== nameString(v.name) || !editedNames.has(sd)) {
          names = names.map((n) => (n.seed === sd ? { ...n, ...v.name! } : n));
          editedNames.add(sd);
          confirmedNames.add(sd);
          changed.add('names').add('editedNames').add('confirmedNames');
          field('name', 'name-typed', [v.name.code, ...v.name.mods].join('_'), v.name);
        }
      } else {
        const o = overrides[sd] ?? {};
        if (
          o.code !== v.name.code ||
          !same(o.mods ?? [], v.name.mods) ||
          (o.displayName ?? '') !== v.name.displayName ||
          o.nameOrigin !== 'operator'
        ) {
          overrides[sd] = {
            ...o,
            code: v.name.code,
            mods: v.name.mods,
            displayName: v.name.displayName,
            nameOrigin: 'operator',
          };
          changed.add('overrides');
          field('name', 'name-code', [v.name.code, ...v.name.mods].join('_'), v.name);
        }
      }
    }
    if (v.named && !live.confirmedNames.includes(sd) && !confirmedNames.has(sd)) {
      const asked = open.name.some((u) => u.seed === sd) || open.aiNames.some((n) => n.seed === sd);
      if (asked) {
        if (spec && nameString(spec) === v.named) {
          confirmedNames.add(sd);
          changed.add('confirmedNames');
          field(
            'named',
            'name-confirmed',
            `${spec.code}${spec.mods.length ? `_${spec.mods.join('_')}` : ''}`,
            v.named,
          );
        } else
          c.miss(
            `piece|${sd}|named`,
            `${subject}: the name shown now is not the one confirmed last time`,
          );
      }
    }
    if (v.qty) {
      const u = open.quantity.find((x) => x.seed === sd);
      if (u) {
        if (`${u.kind}|${u.shown}|${u.detail}` === v.qty) {
          confirmedQuantities[sd] = questionKey(u, now);
          changed.add('confirmedQuantities');
          field('qty', 'quantity', u.shown, v.qty, [
            'the same count is shown, for the same reason',
          ]);
        } else
          c.miss(
            `piece|${sd}|qty`,
            `${subject}: the count shown now (${u.shown}) is not the one confirmed last time`,
          );
      }
    }
    if (v.ov) {
      const o = { ...(overrides[sd] ?? {}) } as Record<string, unknown>;
      // fill-only: an answer the run already has (the operator's, or one replayed) stands
      const diff = c.fresh('piece-override', { seed: sd })
        ? Object.entries(v.ov).filter(([k]) => o[k] === undefined)
        : [];
      if (diff.length) {
        for (const [k, x] of diff) o[k] = x;
        overrides[sd] = o as (typeof overrides)[number];
        changed.add('overrides');
        field(
          'ov',
          'piece-override',
          diff.map(([k, x]) => `${k} ${JSON.stringify(x)}`).join(', '),
          v.ov as ReplayAnswer['value'],
        );
      }
    }
    if (v.grain) {
      const g = operatorGrain[sd];
      if (!g && c.fresh('grain-proposal', { seed: sd }) && c.fresh('grain-axis', { seed: sd })) {
        // an accepted proposal lands when the run proposes the very same line (a fold piece's
        // proposal spans the unfolded piece, off the drawn half); a drawn one lies on the piece
        const pr = sem.grainProposals?.find((x) => x.seed === sd);
        const g0 = v.grain;
        const proposed =
          !!g0.acc &&
          !!pr &&
          ((near(pr.a, g0.a, 0.5) && near(pr.b, g0.b, 0.5)) ||
            (near(pr.a, g0.b, 0.5) && near(pr.b, g0.a, 0.5)));
        // GRAIN lane: a stored line lands only where it lies on every size it is applied to
        // (G5 refuses one off its piece); the run's own proposal is vetted already
        if (
          proposed ||
          (onPiece(g0.a) &&
            onPiece(g0.b) &&
            grainOutsideMm(g0.a, g0.b, exported.length ? exported : rings, ANCHOR_MM) === 0)
        ) {
          operatorGrain[sd] = {
            a: v.grain.a,
            b: v.grain.b,
            ...(v.grain.acc ? { accepted: v.grain.acc as never } : {}),
          };
          changed.add('operatorGrain');
          const ang =
            ((Math.atan2(v.grain.b.y - v.grain.a.y, v.grain.b.x - v.grain.a.x) * 180) / Math.PI +
              360) %
            180;
          field(
            'grain',
            v.grain.acc ? 'grain-proposal' : 'grain-axis',
            `${ang.toFixed(0)}°`,
            v.grain as unknown as ReplayAnswer['value'],
            [proposed ? 'the same line is proposed' : 'both ends on the piece'],
          );
        } else
          c.miss(
            `piece|${sd}|grain`,
            `${subject}: the grainline is not on the piece now (nor the same proposal)`,
          );
      }
    }
    if (v.fold) {
      const f = operatorFold[sd];
      // "not a fold" answered in this run stands
      if (!f && overrides[sd]?.unfoldedFold !== false && c.fresh('fold-edge', { seed: sd })) {
        const ask = sem.folds?.find((q) => q.seed === sd);
        const fold = v.fold;
        // L13: a half's fold edge is the half offer's edge (a straight run, maybe no hull edge)
        const same = (e: { a: PtMm; b: PtMm }) =>
          (near(e.a, fold.a, 1) && near(e.b, fold.b, 1)) ||
          (near(e.a, fold.b, 1) && near(e.b, fold.a, 1));
        const ok = ask
          ? fold.half
            ? !!ask.half && same(ask.half.edge)
            : ask.edges.some(same)
          : onEdge(fold.a) && onEdge(fold.b);
        if (ok) {
          operatorFold[sd] = {
            a: fold.a,
            b: fold.b,
            ...(fold.half ? { half: true as const } : {}),
          };
          changed.add('operatorFold');
          field(
            'fold',
            'fold-edge',
            fold.half
              ? `half on fold: the fold line along the ${Math.round(Math.hypot(fold.b.x - fold.a.x, fold.b.y - fold.a.y))} mm edge`
              : `unfolded across the ${Math.round(Math.hypot(fold.b.x - fold.a.x, fold.b.y - fold.a.y))} mm edge`,
            fold as unknown as ReplayAnswer['value'],
            ['the same edge of the outline'],
          );
        } else
          c.miss(
            `piece|${sd}|fold`,
            `${subject}: the fold edge picked last time is not an edge of the piece now`,
          );
      }
    }
  }
  const oe = c.get('outline');
  if (oe) {
    const v = oe.value as { meaning: 'cut' | 'seam'; allowanceMm: number };
    if (fileAllowance?.origin !== 'operator' && c.fresh('outline', oe)) {
      fileAllowance = {
        meaning: v.meaning,
        allowanceMm: v.allowanceMm,
        origin: 'operator',
        evidence: [`${REPLAY_RULE} ${c.prior.label}`],
      };
      changed.add('fileAllowance');
      as.push(
        R(
          c,
          oe,
          'outline',
          v.meaning === 'cut'
            ? 'the drawn outline is the cut line'
            : `the drawn outline is the seam line + ${v.allowanceMm} mm`,
          [sameFiles(c)],
        ),
      );
    }
  }
  if (sem.foldList) {
    const fe = c.get('fold-list');
    const was = new Set((fe?.value as { entries?: string[] } | undefined)?.entries ?? []);
    const entries = sem.foldList.entries;
    const missing = entries.filter((e) => !was.has(e));
    if (fe && !missing.length && entries.some((e) => !foldListChecked.includes(e))) {
      foldListChecked = [...new Set([...foldListChecked, ...entries])];
      changed.add('foldListChecked');
      as.push(
        R(c, fe, 'cutting-list', `${entries.length} entries checked as before`, [
          sameFiles(c),
          'the same entries are printed',
        ]),
      );
    } else if (missing.length)
      c.miss('fold-list', `the cutting list names ${missing.length} entries not checked last time`);
  }
  if (!changed.size) return null;
  const patch: Partial<Inputs> = {};
  if (changed.has('overrides')) patch.overrides = overrides;
  if (changed.has('operatorGrain')) patch.operatorGrain = operatorGrain;
  if (changed.has('operatorFold')) patch.operatorFold = operatorFold;
  if (changed.has('confirmedQuantities')) patch.confirmedQuantities = confirmedQuantities;
  if (changed.has('confirmedNames')) patch.confirmedNames = [...confirmedNames];
  if (changed.has('editedNames')) patch.editedNames = [...editedNames];
  if (changed.has('fileAllowance')) patch.fileAllowance = fileAllowance;
  if (changed.has('foldListChecked')) patch.foldListChecked = foldListChecked;
  // the names table re-submitted re-runs semantics on the live answers (the details answer)
  return { patch, events: [{ type: 'names', decisions: names }], as };
}

// ── fabrics ─────────────────────────────────────────────────────────────────────────────────────

function fabricsStep(c: Ctx): Out | null {
  const { s, i, card } = c;
  const a = s.fabrics;
  // fill-only: an assignment the operator touched in this run (or one replayed) stands
  if (!a || i.assignment != null || !c.get('fabrics')) return null;
  if (outOfScope(c, true)) return null;
  const exported = new Set((s.semantics?.pieces ?? []).map((p) => p.seed));
  const known = new Set<string>([
    ...card.scopes.map((x) => x.fabricPurpose),
    ...Object.keys(a.byPurpose),
  ]);
  const byPurpose: Record<string, SeedId[]> = Object.fromEntries(
    Object.entries(a.byPurpose).map(([k, xs]) => [k, [...xs]]),
  );
  const aiOnly = (a.aiOnly ?? []).map((x) => ({ ...x }));
  // the offer "main only because nothing names a fabric" (while the operator touched nothing)
  const defaulted = new Set(
    c.question && i.assignment == null ? (a.defaulted ?? []).filter((sd) => exported.has(sd)) : [],
  );
  const matched = new Set<SeedId>();
  const as: Assumption[] = [];
  let moved = false;
  for (const m of piecesNow(c)) {
    const { v, seed: sd, rec } = m;
    if (!v.fab || !exported.has(sd)) continue;
    const bad = v.fab.filter((p) => !known.has(p));
    if (bad.length) {
      c.miss(
        `piece|${sd}|fab`,
        `${rec.subject}: was cut from ${bad.join(', ')}, which is not a fabric of the BOM now`,
      );
      continue;
    }
    matched.add(sd);
    const cur = Object.entries(byPurpose)
      .filter(([, xs]) => xs.includes(sd))
      .map(([p]) => p)
      .sort();
    const want = [...v.fab].sort();
    const change = !same(cur, want);
    if (change) {
      for (const [p, xs] of Object.entries(byPurpose))
        if (!want.includes(p) && xs.includes(sd)) byPurpose[p] = xs.filter((x) => x !== sd);
      for (const p of want)
        if (!(byPurpose[p] ?? []).includes(sd)) byPurpose[p] = [...(byPurpose[p] ?? []), sd];
      moved = true;
    }
    const ai = aiOnly.find((x) => x.seed === sd && x.needsConfirm);
    if (ai) ai.needsConfirm = false;
    if (change || ai || defaulted.has(sd))
      as.push(
        R(
          c,
          rec,
          'fabric',
          want.map((p) => p.replace('TECH_CARD_BOM_PURPOSE_', '').toLowerCase()).join(' + '),
          [`the same piece outline (${v.pc.a} mm²)`],
          {
            seed: sd,
            subject: `${rec.subject} (seed ${sd})`,
            auto: (v.auto ?? []).includes('fab'),
            strong: (v.strong ?? []).includes('fab'),
            value: v.fab,
          },
        ),
      );
  }
  // what the step asks that the previous import did not answer for a piece of the same outline
  const askAi = (a.aiOnly ?? []).filter((x) => x.needsConfirm && !matched.has(x.seed));
  const askDefault = [...defaulted].filter((sd) => !matched.has(sd));
  for (const x of [...askAi.map((y) => y.seed), ...askDefault])
    c.miss(`piece|${x}|fab`, `piece seed ${x}: its fabric was not answered last time`);
  // an assignment sent back ends the "main by default" offer for EVERY piece: never while one of
  // them is not the previous import's answer (it stays the operator's question)
  if (askDefault.length || !as.length) return null;
  return {
    events: [
      {
        type: 'fabrics',
        assignment:
          moved || aiOnly.some((x, k) => x.needsConfirm !== a.aiOnly?.[k]?.needsConfirm)
            ? { ...a, byPurpose: byPurpose as Record<FabricPurposeKey, SeedId[]>, aiOnly }
            : a,
      },
    ],
    as,
  };
}

// ── the drive ───────────────────────────────────────────────────────────────────────────────────

/** What the replay is told about the run (read on every question, the latest). */
export type ReplaySource = () => {
  prior: Prior | null;
  card: CardContext;
  baseSeeds: Seed[] | null;
  presegmented: boolean;
};

export type ReplayLog = {
  /** A previous answer that did not land, or a question it did not answer (once per key). */
  miss?: (m: ReplayMiss) => void;
  /** The replay answered (the step's question, or `PREFILL_QUESTION`). */
  answered?: (step: WizardStep, question: string) => void;
  /** A question the replay had no answer for (it goes to `inner`, or stops for the operator). */
  asked?: (step: WizardStep, question: string) => void;
};

/**
 * The replay as the drive's two hooks: `resolve` answers a step's question from the previous import
 * first, then hands it to `inner` (the autopilot) or stops for the operator; `prefill` gives the
 * previous import's unasked answers on a step that asks nothing.
 */
export function replayDrive(
  src: ReplaySource,
  inner?: AutoResolver<Inputs>,
  log: ReplayLog = {},
): { resolve: AutoResolver<Inputs>; prefill: AutoResolver<Inputs> } {
  const run = (snap: { session: ImportSession; inputs: Inputs }, question: string | null) => {
    const x = src();
    if (!x.prior) return null;
    const r = replayAnswer(
      {
        session: snap.session,
        inputs: snap.inputs,
        card: x.card,
        baseSeeds: x.baseSeeds,
        presegmented: x.presegmented,
        question,
      },
      x.prior,
    );
    for (const m of r.misses) log.miss?.(m);
    return r.answer;
  };
  return {
    resolve: async (snap) => {
      const a = run(snap, snap.question);
      if (a) {
        log.answered?.(snap.step, snap.question);
        return a;
      }
      log.asked?.(snap.step, snap.question);
      if (inner) return inner(snap);
      return {
        stop: true,
        reason: { step: snap.step, reason: snap.question },
        assumptions: [],
      } as never;
    },
    prefill: (snap) => {
      const a = run(snap, null);
      if (a) log.answered?.(snap.step, PREFILL_QUESTION);
      return a;
    },
  };
}
