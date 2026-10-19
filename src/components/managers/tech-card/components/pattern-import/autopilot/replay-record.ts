// AP-replay · THE RECORD — every answer a run ended with, the operator's and the autopilot's alike,
// in a form a re-import of the same source files can reuse (`ReplayRecord`, manifest `replay`).
//
// Derived once, at the write, from the run's final inputs and outputs — not from the operator's
// clicks — so every answer counts however it was given (a control, the autopilot, a replay) and an
// answer that no longer counts (settled away, S3) is not in it. The value is what the wizard input
// took, made reproducible:
//   · a file by its index in `source.files` (its sha256 is there), a mask item by its file + rest;
//   · a piece by its outline (area + centroid of its largest exported size: `Anchor`), never by its
//     seed number or its name (the subject is for people only);
//   · a point / a grain / a fold edge in sheet millimetres, as the input held them (unrounded: the
//     replay must put back the very same input).
// What a step OFFERED and the run went on past (pages to check, flags, outlines set aside on a
// guess, main fabric by default) is recorded as passed, with what was on offer — a replay goes on
// past the same offer only.
import type { CardContext } from '../client';
import type {
  ChainAssign,
  FileId,
  ImportSession,
  PageMaskEdit,
  PieceEdit,
  PieceFamily,
  PtMm,
  ReplayAnswer,
  ReplayRecord,
  Seed,
  SeedId,
  SizeMap,
} from 'lib/pattern-import/types';
import type { Inputs } from '../use-import-session';
import { answersNowOf, liveAnswers, liveDrawnSizes, REV_SEP } from '../answers';
import {
  PAGE_SURE,
  defaultedFabrics,
  liveAsideReviewed,
  openAsides,
  sizeFlags,
  weakAsides,
} from '../auto-advance';
import { SHEET_LAYOUT, layoutValue } from './replay-sheets';
import type { Assumption } from './types';

/** The rule every replayed assumption carries first ("replay of <sheet> · <date>"). */
export const REPLAY_RULE = 'replay of';
/** The first evidence line of a replayed assumption: who gave the answer the first time. */
export const BY_OPERATOR = 'the operator answered it on the previous import';
export const BY_AUTOPILOT = 'the autopilot answered it on the previous import';
export const isReplayed = (a: Pick<Assumption, 'rule'>) => a.rule.startsWith(REPLAY_RULE);

/** A piece by its outline: area (mm²) and centroid (0.1 mm) of its largest exported size. */
export type Anchor = { a: number; x: number; y: number };

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Signed-area centroid of a ring (falls back to the vertex mean on a degenerate ring). */
export function centroidOf(ring: readonly PtMm[]): { x: number; y: number; area: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j].x * ring[i].y - ring[i].x * ring[j].y;
    a += f;
    cx += (ring[j].x + ring[i].x) * f;
    cy += (ring[j].y + ring[i].y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, ring.length);
    return {
      x: ring.reduce((s, p) => s + p.x, 0) / n,
      y: ring.reduce((s, p) => s + p.y, 0) / n,
      area: 0,
    };
  }
  return { x: cx / (3 * a), y: cy / (3 * a), area: Math.abs(a) / 2 };
}

/** Source ranks written to the card (null = no map: every rank) — use-import-session's rule. */
export function mappedRanks(map: SizeMap | undefined): Set<number> | null {
  if (!map) return null;
  return new Set(map.entries.flatMap((e) => (e.card ? [e.source.rank] : [])));
}

/** The outline a piece's answers are read against: its largest closed exported size. */
export function outlineOf(f: PieceFamily, mapped: Set<number> | null): PtMm[] | null {
  const cs = f.candidates
    .filter((c) => c.outcome === 'closed' && c.outer.length > 2 && (!mapped || mapped.has(c.rank)))
    .sort((a, b) => b.areaMm2 - a.areaMm2);
  return cs[0]?.outer ?? null;
}

export function anchorOf(f: PieceFamily, mapped: Set<number> | null): Anchor | null {
  const ring = outlineOf(f, mapped);
  if (!ring) return null;
  const c = centroidOf(ring);
  return { a: Math.round(c.area), x: r1(c.x), y: r1(c.y) };
}

/** The legend row key (use-import-session `legendKey`): the row's signature, else its number. */
export const legendKeyOf = (c: { id: number; sig?: string }) => c.sig ?? `#${c.id}`;

/** The models to choose from (use-import-session `variantsOf`). */
export const variantsAt = (seeds: Seed[], base: Seed[] | null, named: readonly string[] = []) =>
  [
    ...new Set([
      ...[...(base ?? []), ...seeds].flatMap((s) => (s.variant ? [s.variant] : [])),
      ...named,
    ]),
  ].sort();

/** A file id as the record writes it: its index in the manifest's `source.files`. */
export const fileIndex = (id: FileId): number => Number(id);

/** A mask edit with its file as an index (`f`) and a page item's id without its file prefix. */
export type EncEdit =
  | { k: string; keep: boolean; f?: number; p?: number }
  | { i: string; keep: boolean; f?: number }
  | { f: number; p: number; role: string };

/** `${file}:${page}:${kind}:${n}` → its file and the rest; `sheet:…` stays whole. */
export function splitItemId(id: string, files: readonly { id: FileId }[]) {
  const f = files.find((x) => id.startsWith(`${x.id}:`));
  return f ? { f: fileIndex(f.id), i: id.slice(f.id.length + 1) } : { i: id };
}

export function encodeEdit(e: PageMaskEdit, files: readonly { id: FileId }[]): EncEdit {
  if ('role' in e) return { f: fileIndex(e.file), p: e.page, role: e.role };
  if ('item' in e) return { ...splitItemId(e.item, files), keep: e.keep };
  return {
    k: e.kind,
    keep: e.keep,
    ...(e.file !== undefined ? { f: fileIndex(e.file) } : {}),
    ...(e.page !== undefined ? { p: e.page } : {}),
  };
}

/** A chain as the preview draws it: both ends and its vertex count (an id is only as good as this). */
export function chainPrint(preview: readonly Float32Array[] | undefined, id: number) {
  const a = preview?.[id];
  if (!a || a.length < 4) return null;
  const n = a.length / 2;
  return [r1(a[0]), r1(a[1]), r1(a[2 * n - 2]), r1(a[2 * n - 1]), n];
}

/** The smallest closed chain loop holding a point (area, centroid) — what a free click fell in. */
export function loopAt(preview: readonly Float32Array[] | undefined, at: PtMm): Anchor | null {
  let best: { area: number; x: number; y: number } | null = null;
  for (const a of preview ?? []) {
    if (a.length < 8) continue;
    const n = a.length / 2;
    if (Math.hypot(a[0] - a[2 * n - 2], a[1] - a[2 * n - 1]) > 1) continue;
    const ring: PtMm[] = [];
    for (let i = 0; i < n; i++) ring.push({ x: a[2 * i], y: a[2 * i + 1] });
    if (!inside(at, ring)) continue;
    const c = centroidOf(ring);
    if (!best || c.area < best.area) best = c;
  }
  return best ? { a: Math.round(best.area), x: r1(best.x), y: r1(best.y) } : null;
}

export function inside(p: PtMm, poly: readonly PtMm[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** The ids of every seed a piece edit names. */
export function editSeeds(e: PieceEdit): SeedId[] {
  switch (e.kind) {
    case 'merge':
      return [...e.seeds];
    case 'split':
    case 'not-a-piece':
    case 'reseed':
    case 'wall-override':
      return [e.seed];
    case 'bridge':
      return e.seed != null ? [e.seed] : [];
    default:
      return [];
  }
}

/** The ids of every chain a piece edit names. */
export function editChains(e: PieceEdit): number[] {
  switch (e.kind) {
    case 'wall-override':
      return [e.use, e.instead];
    case 'ignore-line':
    case 'set-wall':
      return [e.chain];
    default:
      return [];
  }
}

/** The name a piece is exported with, as one string (code | mods | display name). */
export const nameString = (p: { code: string; mods: readonly string[]; displayName: string }) =>
  `${p.code}|${p.mods.join('_')}|${p.displayName}`;

/** LINEFIX: a line answer is written with at most this many keys (≈ 50 chars each). */
export const LINE_PART = 200;

/**
 * LINEFIX provenance: the operator's per-line answers as replay answers — the entry as given
 * (`sheet`, `keys`, `to`), the flags the chains stage raised on its keys and its stale count; the
 * subject says it for people ("operator put 2 lines in size 8 · 1 against its pen").
 */
export function lineAssignAnswers(
  list: readonly ChainAssign[],
  chains: ImportSession['chains'],
): { subject: string; value: Record<string, unknown> }[] {
  const rep = chains?.lineAssign;
  const classes = chains?.classes ?? [];
  const rowName = (to: ChainAssign['to']) => {
    if ('cls' in to) return to.cls === 'common' ? 'common (every size)' : 'no size line';
    const row =
      'rank' in to
        ? classes.find(
            (c) =>
              c.role === 'size' &&
              c.evidence.some((e) => e.kind === 'nesting-order' && e.rank === to.rank),
          )
        : classes.find((c) => legendKeyOf(c) === to.row);
    return row?.sizeLabel
      ? `size ${row.sizeLabel}`
      : 'rank' in to
        ? `size rank ${to.rank}`
        : `row ${to.row}`;
  };
  const out: { subject: string; value: Record<string, unknown> }[] = [];
  list.forEach((e, entry) => {
    for (let j = 0; j < e.keys.length; j += LINE_PART) {
      const keys = e.keys.slice(j, j + LINE_PART);
      const mine = new Set(keys);
      const landed = (rep?.applied ?? []).filter((a) => a.entry === entry && mine.has(a.key));
      const ids = new Set(landed.flatMap((a) => a.chains));
      const lines = ids.size;
      const stale = (rep?.stale ?? []).filter((a) => a.entry === entry && mine.has(a.key)).length;
      const flags = (rep?.flags ?? [])
        .filter((f) => ids.has(f.chain))
        .map((f) => ({ k: f.key, f: f.kind, d: f.detail }));
      const pen = flags.filter((f) => f.f === 'pen').length;
      const two = flags.filter((f) => f.f === 'two-sizes').length;
      // LINEASSIGN-2: against its pen, but the graded nest explains the pen (the drawing's slip)
      const notes = (rep?.notes ?? [])
        .filter((f) => ids.has(f.chain))
        .map((f) => ({ k: f.key, f: f.kind, d: f.detail }));
      out.push({
        subject: [
          `operator put ${lines} ${lines === 1 ? 'line' : 'lines'} in ${rowName(e.to)}`,
          ...(pen ? [`${pen} against its pen`] : []),
          ...(two ? [`${two} in two sizes`] : []),
          ...(notes.length ? [`${notes.length} against a pen the drawing slipped`] : []),
          ...(stale ? [`${stale} not found`] : []),
        ].join(' · '),
        value: { sheet: e.sheet, keys, to: e.to, flags, stale, ...(notes.length ? { notes } : {}) },
      });
    }
  });
  return out;
}

/** A piece edit's JSON is written in parts of this many characters (under REPLAY_VALUE_MAX). */
export const EDIT_PART = 8000;

/** Which autopilot kinds answer which record kind (who answered: the operator or the autopilot). */
const AUTO_KINDS: Record<string, string[]> = {
  'clean-edits': ['clean-accept'],
  'files-passed': ['pages-as-read'],
  scale: ['scale-confirmed', 'scale-1to1', 'scale-anisotropic'],
  'sheet-choice': ['sheet-choice'],
  'sheet-grid': ['sheet-grid'],
  residuals: ['residuals'],
  // UXHOOKS: missing tiles taken as blank pages (the operator's, or the autopilot's on 2 evidences)
  'missing-accepted': ['missing-accepted'],
  'sheet-passed': ['sheet-passed'],
  legend: ['legend-outline'],
  'legend-confirmed': ['legend-row'],
  // LINEFIX: the operator's own answer — the autopilot never puts a line in a size
  'line-assign': [],
  'drawn-sizes': ['drawn-sizes'],
  'sheet-legend': ['sheet-legend'],
  'size-map': ['size-guess', 'size-ordinal', 'size-dropped'],
  'size-flags': ['size-flag'],
  model: ['model'],
  'seed-clicks': ['seed-click'],
  'piece-edit': ['piece-edits'],
  'sheet-pieces': ['sheet-copy', 'sheet-alternative'],
  'asides-passed': ['set-aside'],
  outline: ['outline'],
  'fold-list': ['cutting-list'],
  fabrics: ['fabric'],
};
/** Per piece field: the autopilot kinds that answer it. */
export const PIECE_FIELD_KINDS: Record<string, string[]> = {
  name: ['name-code', 'name-typed'],
  named: ['name-confirmed'],
  qty: ['quantity'],
  ov: ['piece-override'],
  grain: ['grain-proposal', 'grain-axis'],
  fold: ['fold-edge'],
  fab: ['fabric'],
};

/** An assumption given by the autopilot (a replay of an operator answer is the operator's). */
const byAutopilot = (a: Assumption) => !isReplayed(a) || a.evidence[0] === BY_AUTOPILOT;

/**
 * The run's answers as a replay record (undefined = nothing was answered). Pure; reads the final
 * session and inputs as the write sees them.
 */
export function answerRecordOf(
  s: ImportSession,
  i: Inputs,
  baseSeeds: readonly Seed[] | null,
  card: Pick<CardContext, 'scopes'>,
  presegmented: boolean,
): ReplayRecord | undefined {
  const out: ReplayAnswer[] = [];
  const from = (kind: string, seed?: SeedId) =>
    i.autopilot.filter(
      (a) => (AUTO_KINDS[kind] ?? []).includes(a.kind) && (seed == null || a.seed === seed),
    );
  // plain JSON (no undefined members): what the manifest round trip gives back
  const push = (step: string, kind: string, subject: string, value: unknown) => {
    const by = from(kind);
    out.push({
      step,
      kind,
      subject,
      value: JSON.parse(JSON.stringify(value)) as ReplayAnswer['value'],
      ...(by.some((a) => a.strong) ? { strong: true } : {}),
      ...(by.some(byAutopilot) ? { auto: true } : {}),
    });
  };
  const files = s.files;
  const fileName = (id: FileId) => files.find((f) => f.id === id)?.name ?? `file ${id}`;

  // ── files ──
  if (i.cleanEdits.length)
    push('files', 'clean-edits', `${i.cleanEdits.length} mask edits`, {
      edits: i.cleanEdits.map((e) => encodeEdit(e, files)),
    });
  if (s.clean && !presegmented) {
    const roleSet = new Set(
      i.cleanEdits.flatMap((e) => ('role' in e ? [`${e.file}:${e.page}`] : [])),
    );
    const items = s.clean.pages
      .flatMap((p) => p.items)
      .filter((it) => it.status === 'suggest' && !it.applied)
      .map((it) => splitItemId(it.id, files));
    const pages = [
      ...s.clean.dropped
        .filter((d) => d.status === 'suggest')
        .map((d) => ({ f: fileIndex(d.file), p: d.page, as: `set aside (${d.cls})` })),
      ...s.pages
        .filter(
          (p) =>
            !roleSet.has(`${p.file}:${p.page}`) &&
            (p.cls === 'unknown' || p.confidence < PAGE_SURE),
        )
        .map((p) => ({ f: fileIndex(p.file), p: p.page, as: `read as ${p.cls}` })),
    ];
    if (items.length || pages.length)
      push(
        'files',
        'files-passed',
        pages.length
          ? pages.map((p) => `${fileName(String(p.f))} · page ${p.p + 1}`).join(', ')
          : `${items.length} suggestions left as they were`,
        { items, pages },
      );
  }

  // ── scale ──
  const cands = s.scale.candidates;
  const best = cands.reduce((b, c, k) => (c.confidence > cands[b].confidence ? k : b), 0);
  const sc = cands[i.scaleIndex];
  if (sc && (i.scaleConfirmed || i.manualMeasuredMm || i.scaleIndex !== best))
    push('scale', 'scale', 'the file', {
      factor: sc.factor,
      method: sc.method,
      declared: sc.declaredMm ?? null,
      measured: i.manualMeasuredMm ?? null,
      confirmed: i.scaleConfirmed,
    });

  // ── sheet ──
  // D6: the drawing is every tile sheet, side by side — where each sat (by index + its pages), so a
  // replay puts every point back on its own sheet (replay-sheets.ts); nothing is picked
  const parts = s.sheet?.sheet.parts ?? [];
  if (parts.length > 1)
    push('sheet', SHEET_LAYOUT, `${parts.length} tile sheets`, layoutValue(parts));
  if (i.gridOverride) {
    const g = i.gridOverride;
    push('sheet', 'sheet-grid', 'the tile grid', {
      rows: g.rows,
      cols: g.cols,
      sx: g.stepXMm,
      sy: g.stepYMm,
      order: g.order,
      f: fileIndex(g.originPage.file),
      p: g.originPage.page,
    });
  }
  // the drawing every later answer was given on: the tile sheet, its grid, the model
  push('sheet', 'scope', 'the drawing', {
    // how many piece edits the run ended with: a record that lost them all is told apart
    edits: i.edits.length,
    sheet: i.sheetIndex,
    grid: gridPrint(i.gridOverride),
    variant: s.variant ?? null,
  });
  if (i.residualsAccepted) {
    const worst = Math.max(0, ...(s.sheet?.sheet.poses.map((p) => p.residualMm) ?? [0]));
    push('sheet', 'residuals', 'the tile grid', { worstMm: worst });
  }
  // UXHOOKS: the missing tiles that count now (moved to `holes`), per sheet, as accepted
  const holes = s.sheet?.sheet.holes ?? [];
  if (holes.length)
    push(
      'sheet',
      'missing-accepted',
      `${holes.length} missing ${holes.length === 1 ? 'tile' : 'tiles'} taken as blank pages`,
      {
        holes: holes.map((h) => ({
          sheet: h.sheet,
          row: h.row,
          col: h.col,
          // the file by its index in source.files (a re-import may number its files otherwise)
          ...(h.file != null ? { f: fileIndex(h.file) } : {}),
          origin: h.origin,
        })),
      },
    );
  const sheetWaiting = (s.sheet?.clean?.items ?? []).filter(
    (it) => it.status === 'suggest' && !it.applied,
  );
  if (sheetWaiting.length)
    push(
      'sheet',
      'sheet-passed',
      `${sheetWaiting.length} suggestions on the sheet left as they were`,
      {
        items: sheetWaiting.map((it) => it.id),
      },
    );

  // ── sizes ──
  if (i.legend.length)
    push(
      'sizes',
      'legend',
      `${i.legend.length} legend rows`,
      i.legend.map((e) => ({
        c: e.classId,
        ...(e.sig ? { s: e.sig } : {}),
        r: e.role,
        l: e.sizeLabel,
      })),
    );
  if (i.legendConfirmed.length) {
    const classes = s.chains?.classes ?? [];
    const rebuilt: string[] = [];
    const asked: string[] = [];
    for (const key of i.legendConfirmed) {
      const row = classes.find((c) => legendKeyOf(c) === key);
      if (!row) continue;
      // confirmRows sets an answered row to 1: the chains were rebuilt with it (else: only asked)
      (row.confidence >= 0.999 ? rebuilt : asked).push(key);
    }
    if (rebuilt.length || asked.length)
      push('sizes', 'legend-confirmed', `${rebuilt.length + asked.length} legend rows confirmed`, {
        rebuilt,
        asked,
      });
  }
  // LINEFIX: "these lines are size N" — one answer per entry (≤ LINE_PART keys each), with what
  // the run flagged on them (D3: two sizes, another size's pen) and how many keys were stale
  for (const a of lineAssignAnswers(i.chainAssign ?? [], s.chains))
    push('sizes', 'line-assign', a.subject, a.value);
  // D6: the tile sheets' different size rows, confirmed as read (bound to what each sheet drew)
  if (i.sheetLegendOk && s.sizes?.sheetLegend?.sig === i.sheetLegendOk)
    push('sizes', 'sheet-legend', 'the tile sheets share the legend as read', {
      sig: i.sheetLegendOk,
    });
  const drawn = liveDrawnSizes(i, i);
  if (drawn != null) push('sizes', 'drawn-sizes', 'the sheet', { n: drawn, sheet: i.sheetIndex });
  const own = (s.sizes?.map.entries ?? []).filter((e) => e.origin === 'operator');
  if (own.length)
    push(
      'sizes',
      'size-map',
      own
        .map((e) => `${e.source.label || `rank ${e.source.rank}`} → ${e.card?.token ?? '—'}`)
        .join(', '),
      {
        entries: own.map((e) => ({
          r: e.source.rank,
          l: e.source.label,
          c: e.card ? { id: e.card.sizeId, t: e.card.token } : null,
        })),
      },
    );
  const flags = sizeFlags(s.chains?.ambiguities, s.sizes?.expected?.n);
  if (flags.length)
    push('sizes', 'size-flags', `${flags.length} reader flags gone on with`, {
      flags: flags.map(flagPrint),
    });

  // ── pieces ──
  const seeds = s.pieces?.seeds ?? [];
  if (s.variant && variantsAt(seeds, baseSeeds as Seed[] | null, s.pieces?.variants).length > 1)
    push('pieces', 'model', 'the sheet', { variant: s.variant });
  const preview = s.chains?.chainPreview;
  if (i.clickSeeds.length)
    push('pieces', 'seed-clicks', `${i.clickSeeds.length} pieces clicked`, {
      seeds: i.clickSeeds.map((c) => ({
        id: c.id,
        at: { x: c.at.x, y: c.at.y },
        ...(c.origin === 'text' ? { text: true } : {}),
        ...(c.aside != null ? { aside: c.aside } : {}),
        loop: loopAt(preview, c.at),
      })),
    });
  // one answer per edit (a split's lasso is long: each is bounded on its own), each knowing how
  // many there are — a record missing one replays none of them
  if (i.edits.length) {
    const all = [...(baseSeeds ?? []), ...i.clickSeeds];
    i.edits.forEach((e, k) => {
      const sd: Record<string, { at: PtMm; click: boolean }> = {};
      for (const id of editSeeds(e)) {
        const x = all.find((y) => y.id === id);
        if (x) sd[id] = { at: { x: x.at.x, y: x.at.y }, click: i.clickSeeds.includes(x) };
      }
      const ch: Record<string, ReturnType<typeof chainPrint>> = {};
      for (const id of editChains(e)) ch[id] = chainPrint(preview, id);
      // the edit as JSON text in bounded parts (a split's lasso can run to thousands of points)
      const text = JSON.stringify(e);
      const parts = Math.max(1, Math.ceil(text.length / EDIT_PART));
      for (let j = 0; j < parts; j++)
        push('pieces', 'piece-edit', `piece edit ${k + 1} of ${i.edits.length} (${e.kind})`, {
          n: i.edits.length,
          k,
          part: j,
          parts,
          text: text.slice(j * EDIT_PART, (j + 1) * EDIT_PART),
          ...(j === 0 ? { seeds: sd, chains: ch } : {}),
        });
    });
  }
  // D6: the cross-sheet answers (a copy / an alternative / a split), by their geometric key
  const sa = Object.entries(i.sheetAnswers ?? {});
  if (sa.length)
    push('pieces', 'sheet-pieces', `${sa.length} cross-sheet answers`, { answers: sa });
  const weakAll = weakAsides(s.pieces?.setAside, s.pieces?.families, s.pieces?.seeds);
  const sheetParts = s.sheet?.sheet.parts;
  // UXHOOKS: "I looked at the outlines set aside" — the operator's answer (never the autopilot's),
  // per sheet by the digest of the set it was given on; only the part that still holds counts
  const reviewed = liveAsideReviewed(weakAll, sheetParts, i.asideReviewed);
  if (Object.keys(reviewed).length)
    push('pieces', 'asides-reviewed', 'the outlines set aside, looked at', { digests: reviewed });
  const weak = openAsides(weakAll, sheetParts, i.asideReviewed);
  if (weak.length)
    push('pieces', 'asides-passed', `${weak.length} outlines kept aside`, {
      asides: weak.map((a) => ({
        id: a.id,
        at: { x: r1(a.at.x), y: r1(a.at.y) },
        a: Math.round(a.areaMm2),
      })),
    });

  // ── details ──
  if (i.fileAllowance?.origin === 'operator')
    push('meaning', 'outline', 'the file', {
      meaning: i.fileAllowance.meaning,
      allowanceMm: i.fileAllowance.allowanceMm,
    });
  if (i.foldListChecked.length)
    push('meaning', 'fold-list', 'the cutting list', { entries: [...i.foldListChecked] });

  // ── fabrics ── (answered: the operator's ticks, an AI cloth confirmed, main by default gone on)
  const sem = s.semantics;
  const exported = [...new Set((sem?.pieces ?? []).map((p) => p.seed))];
  // the assignment sent back (the operator's ticks, an AI cloth confirmed) answers every piece; the
  // offer "main because nothing names a fabric" gone on past answers the pieces it was about only
  const defaulted = defaultedFabrics(s.fabrics, card.scopes.length, false, exported);
  const fabSeeds = !s.fabrics
    ? new Set<SeedId>()
    : new Set<SeedId>(i.assignment != null ? exported : defaulted);
  if (fabSeeds.size) push('fabrics', 'fabrics', 'the pieces', { answered: true });

  // ── per piece (by its outline) ──
  const live = liveAnswers(i, answersNowOf(s, i));
  const mapped = mappedRanks(s.sizes?.map);
  for (const f of s.pieces?.families ?? []) {
    const sd = f.seed;
    const pc = anchorOf(f, mapped);
    if (!pc) continue;
    const v: Record<string, unknown> = {};
    const ov = live.overrides[sd];
    if (ov?.nameOrigin === 'operator' && ov.code)
      v.name = { code: ov.code, mods: [...(ov.mods ?? [])], displayName: ov.displayName ?? '' };
    const spec = sem?.pieces.find((p) => p.seed === sd);
    if (!v.name && live.confirmedNames.includes(sd) && spec) v.named = nameString(spec);
    const q = live.confirmedQuantities[sd];
    if (q) v.qty = q.split(REV_SEP)[0];
    const keep: Record<string, unknown> = {};
    for (const k of ['pairHand', 'unfoldedFold', 'piecesPerGarment', 'allowance'] as const)
      if (ov && ov[k] !== undefined) keep[k] = JSON.parse(JSON.stringify(ov[k]));
    if (Object.keys(keep).length) v.ov = keep;
    const g = live.operatorGrain[sd];
    if (g)
      v.grain = {
        a: { x: g.a.x, y: g.a.y },
        b: { x: g.b.x, y: g.b.y },
        ...(g.accepted ? { acc: [...g.accepted] } : {}),
      };
    const fo = live.operatorFold[sd];
    if (fo)
      v.fold = {
        a: { x: fo.a.x, y: fo.a.y },
        b: { x: fo.b.x, y: fo.b.y },
        ...(fo.half ? { half: true as const } : {}),
      };
    if (s.fabrics && fabSeeds.has(sd))
      v.fab = Object.entries(s.fabrics.byPurpose)
        .filter(([, xs]) => xs.includes(sd))
        .map(([p]) => p)
        .sort();
    if (!Object.keys(v).length) continue;
    // who answered which field (a replay of a strong assumption stays strong)
    const auto: string[] = [];
    const strong: string[] = [];
    for (const k of Object.keys(v)) {
      const by = i.autopilot.filter(
        (a) => a.seed === sd && (PIECE_FIELD_KINDS[k] ?? []).includes(a.kind),
      );
      if (by.some(byAutopilot)) auto.push(k);
      if (by.some((a) => a.strong)) strong.push(k);
    }
    const label = spec
      ? `${spec.identity}`
      : `piece at (${Math.round(pc.x)}, ${Math.round(pc.y)}) mm`;
    out.push({
      step: 'meaning',
      kind: 'piece',
      subject: label,
      value: JSON.parse(
        JSON.stringify({
          pc,
          seed: sd,
          ...v,
          ...(auto.length ? { auto } : {}),
          ...(strong.length ? { strong } : {}),
        }),
      ) as ReplayAnswer['value'],
    });
  }
  return out.some((a) => a.kind !== 'scope') ? { v: 1, answers: out } : undefined;
}

/** A hand-set tile grid as the record writes it (its first page's file by index); null = none. */
export const gridPrint = (g: Inputs['gridOverride']) =>
  g
    ? {
        rows: g.rows,
        cols: g.cols,
        sx: g.stepXMm,
        sy: g.stepYMm,
        order: g.order,
        f: fileIndex(g.originPage.file),
        p: g.originPage.page,
      }
    : null;

/** A reader flag as one string (what a replay must find again to go on past it). */
export const flagPrint = (f: {
  kind: string;
  message: string;
  classes: readonly number[];
  chains: readonly number[];
}) => `${f.kind}|${f.classes.join(',')}|${f.chains.length}|${f.message}`;
