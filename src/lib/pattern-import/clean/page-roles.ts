// clean/ (A9) — the AI's page roles as evidence on the pages the classifier set aside (plan
// auto/00-PLAN §A9; owner 11.10). The AI reads ONLY the page (its picture, its words, its size —
// none of our geometry, so its answer is independent of it): evidence №1. The page's own geometry
// is №2, in two strengths:
//
//   EXCLUSIONARY (with the AI ≥ 0.85 in a non-pattern role → set aside by itself, "AI + geometry"):
//     (a) every piece-sized closed outline on the page is a reduced copy (scale ≤ 0.35, ≥ 2 different pieces) of the
//         pieces of this file's own 1:1 tile sheet — ≥ 80 % of its outlines matched, none of piece
//         size unexplained (clean/reduced-copy.ts);
//     (b) the page draws no piece-sized outline and no line longer than 100 mm, and it is not part
//         of the tile grid (it carries no tile chrome, it registers with no tile);
//   SUGGESTIVE (never enough, even with the AI — a suggestion, the autopilot's pre-filled stop):
//     another page format than the tiles, no tile chrome, text-dominant, does not register.
//
// The AI never removes a page the classifier placed in the tile grid, and never a page holding a
// piece-sized outline that is not a reduced copy.
import { PATIMPORT } from '../types';
import type { AiPageHint, AiPageRole, CleanOutput, IRPage, PageStats, TileMarkSig } from '../types';
import { buildRegPage, furnitureOf } from '../assemble/regpage';
import { recurrenceLinks } from '../assemble/recurrence';
import { CLEAN, type Found } from './detect';
import type { PageChains } from './page-chains';
import { shapesOf } from './reduced-copy';

export const AI_PAGES = {
  /** The AI's confidence in a non-pattern role that, WITH a geometric evidence, sets a page aside. */
  autoMin: 0.85,
  /** "Pattern" from the AI at this confidence offers a set-aside page back as a tile. */
  patternMin: 0.5,
  /** Text-dominant: at least this many characters… */
  textMinChars: 300,
  /** …and at least this many per metre of line work. */
  textCharsPerM: 150,
  /** Page format tolerance (the classifier's: 170.5 prints as 170.49 on one page, 170.51 on the next). */
  formatTolMm: 1.5,
  /** One call per file: at most this many pages (F9-style limit; the rest go without the AI). */
  maxPages: 40,
  excerptRunes: 600,
  /** Tiles a reference sheet is built from at most (`tileGridTester`). */
  gridMaxTiles: 60,
  /** The reference's registered component must cover this share of its sheet. */
  gridCover: 0.6,
  /** Thumbnail long side, px. */
  thumbPx: 1024,
  /**
   * (a): a reduced copy draws the pieces at most at this scale (Codex re-check #1: instruction and
   * overview diagrams are 1:4–1:10 — robe 1:6; a sheet at 1:2 may be a real smaller pattern) …
   */
  copyMaxScale: 0.35,
  /** … and matches at least this many DIFFERENT tile pieces (the tile sheet's piece set). */
  copyMinPieces: 2,
  /** (b): no line longer than this (mm) — the classifier's "pattern-like" line. */
  longLineMm: 100,
};

export const NOT_PATTERN_ROLES: ReadonlySet<AiPageRole> = new Set<AiPageRole>([
  'instructions',
  'overview',
  'cover',
  'table',
  'cutting_layout',
]);
export const PATTERN_ROLES: ReadonlySet<AiPageRole> = new Set<AiPageRole>([
  'pattern_tile',
  'pattern_sheet',
]);
const ROLES: readonly AiPageRole[] = [
  'pattern_tile',
  'pattern_sheet',
  'overview',
  'instructions',
  'cutting_layout',
  'cover',
  'table',
  'other',
];

/** A wire role ("instructions", "PATTERN_PAGE_ROLE_INSTRUCTIONS", "cutting-layout") → ours; null = unknown. */
export function aiRoleOf(x: unknown): AiPageRole | null {
  const s = String(x ?? '')
    .trim()
    .toLowerCase()
    .replace(/^pattern_page_role_/, '')
    .replace(/[-\s]+/g, '_');
  return (ROLES as readonly string[]).includes(s) ? (s as AiPageRole) : null;
}

const sigOf = (pc: PageChains, i: number): TileMarkSig => {
  const b = pc.box[i];
  return {
    cx: (b.minX + b.maxX) / 2,
    cy: (b.minY + b.maxY) / 2,
    w: b.maxX - b.minX,
    h: b.maxY - b.minY,
    len: pc.chains[i].lengthMm,
  };
};

/** `repetition`'s comparator: the same page place (± 1 mm), size and length (± 3 %). */
const sameSig = (a: TileMarkSig, b: TileMarkSig) => {
  const t = CLEAN.repeatTolMm;
  return (
    Math.abs(a.cx - b.cx) <= t &&
    Math.abs(a.cy - b.cy) <= t &&
    Math.abs(a.w - b.w) <= t &&
    Math.abs(a.h - b.h) <= t &&
    Math.abs(a.len - b.len) <= 0.03 * b.len + 0.5
  );
};

/**
 * The tile chrome of one file: the chains the clean stage found as chrome (frames, marks, stroke
 * tile labels) that repeat at one page place on ≥ 80 % of the file's tiles (and ≥ 3). Empty = the
 * tiles carry none (the evidence is then unknown, never "no marks").
 */
export function tileMarkSigs(
  pcs: readonly PageChains[],
  rep: readonly number[][],
  found: readonly Found[][],
): TileMarkSig[] {
  const need = Math.max(CLEAN.repeatMinPages, Math.ceil(CLEAN.markTileShare * pcs.length));
  if (pcs.length < CLEAN.repeatMinPages) return [];
  const out: TileMarkSig[] = [];
  pcs.forEach((pc, k) => {
    for (const f of found[k] ?? []) {
      if (!f.chrome && !(f.repeated && f.kind === 'tile-label')) continue;
      for (const i of f.chains) {
        if ((rep[k]?.[i] ?? 0) < need) continue;
        const s = sigOf(pc, i);
        if (!out.some((o) => sameSig(o, s))) out.push(s);
        if (out.length >= 200) return;
      }
    }
  });
  return out;
}

/** How many of the tile chrome's chains are on this page at their place. */
export function marksOn(pc: PageChains, sigs: readonly TileMarkSig[]): number {
  if (!sigs.length) return 0;
  const mine = pc.chains.map((_, i) => sigOf(pc, i));
  return sigs.filter((s) => mine.some((m) => sameSig(m, s))).length;
}

const dimsOf = (w: number, h: number) => [Math.min(w, h), Math.max(w, h)] as const;
/** Same paper, either way round. */
export const sameFormat = (
  a: { widthMm: number; heightMm: number },
  b: { widthMm: number; heightMm: number },
) => {
  const x = dimsOf(a.widthMm, a.heightMm);
  const y = dimsOf(b.widthMm, b.heightMm);
  return (
    Math.abs(x[0] - y[0]) <= AI_PAGES.formatTolMm && Math.abs(x[1] - y[1]) <= AI_PAGES.formatTolMm
  );
};
/** Same paper the same way round (the chrome's page places compare). */
const sameOrientation = (
  a: { widthMm: number; heightMm: number },
  b: { widthMm: number; heightMm: number },
) =>
  Math.abs(a.widthMm - b.widthMm) <= AI_PAGES.formatTolMm &&
  Math.abs(a.heightMm - b.heightMm) <= AI_PAGES.formatTolMm;

/** The page's words in reading order (top to bottom, left to right), and their character count. */
export function textOf(pg: IRPage): { chars: number; excerpt: string } {
  const live = pg.texts.filter((t) => !t.background && t.text.trim());
  const chars = live.reduce((a, t) => a + t.text.trim().length, 0);
  const sorted = [...live].sort(
    (a, b) => Math.round(b.anchor.y / 3) - Math.round(a.anchor.y / 3) || a.anchor.x - b.anchor.x,
  );
  const all = sorted
    .map((t) => t.text.trim())
    .join(' ')
    .replace(/\s+/g, ' ');
  return { chars, excerpt: [...all].slice(0, AI_PAGES.excerptRunes).join('') };
}

export type FileMarks = NonNullable<CleanOutput['tileMarks']>[number];

export type GridVerdict = 'registers' | 'apart' | null;

/**
 * Is the page in the tile grid? Registration by recurrence (assemble/recurrence.ts) against a
 * REFERENCE (Codex #2): the tiles of the page's own sheet (its classification's, else the file's
 * only sheet), whose recurrence links must form ONE connected component covering ≥ 60 % of that
 * sheet (≥ 3 tiles). 'registers' = the page shares a long drawing operation with a tile (it may BE
 * one: never set aside); 'apart' = the reference holds and the page links to none of it; null = no
 * evidence (no tiles, a partial reference, several sheets and the page in none of them).
 * One tester per clean run: the tiles' registration pages are built once per sheet.
 */
export function tileGridTester(tiles: readonly { pg: IRPage; sheet?: number }[]) {
  type Ref = { pages: IRPage[]; ok: boolean; why: string };
  const refs = new Map<string, Ref>();
  const sheetsOf = (file: string) =>
    [...new Set(tiles.filter((t) => t.pg.file === file).map((t) => t.sheet ?? -1))].sort();
  const refOf = (file: string, sheet: number): Ref => {
    const k = `${file}:${sheet}`;
    let r = refs.get(k);
    if (r) return r;
    const pages = tiles
      .filter((t) => t.pg.file === file && (t.sheet ?? -1) === sheet)
      .map((t) => t.pg)
      .slice(0, AI_PAGES.gridMaxTiles);
    let ok = false;
    let why = 'too few tiles';
    if (pages.length >= 3) {
      const fur = furnitureOf(pages);
      const regs = pages.map((p, i) => buildRegPage(p, i + 1, 0, fur));
      const parent = regs.map((_, i) => i);
      const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
      const at = new Map(regs.map((g, i) => [g, i]));
      for (const l of recurrenceLinks(regs)) parent[find(at.get(l.a)!)] = find(at.get(l.b)!);
      const size = new Map<number, number>();
      regs.forEach((_, i) => size.set(find(i), (size.get(find(i)) ?? 0) + 1));
      const big = Math.max(...size.values());
      ok = big >= Math.max(3, AI_PAGES.gridCover * pages.length);
      why = `${big} of ${pages.length} tiles in one registered component`;
    }
    r = { pages, ok, why };
    refs.set(k, r);
    return r;
  };
  return (pg: IRPage, sheet: number | undefined): { verdict: GridVerdict; why: string } => {
    const all = sheetsOf(pg.file);
    if (!all.length) return { verdict: null, why: 'no tiles in the file' };
    // the page's sheet; a page of no sheet in a file of several: the reference is mixed
    const s = sheet ?? (all.length === 1 ? all[0] : null);
    const candidates =
      s === null
        ? tiles.filter((t) => t.pg.file === pg.file).map((t) => t.pg)
        : refOf(pg.file, s).pages;
    // registration is tested against every candidate tile (sharing a line with one is enough)
    const near = [...candidates]
      .sort((a, b) => Math.abs(a.page - pg.page) - Math.abs(b.page - pg.page))
      .slice(0, AI_PAGES.gridMaxTiles);
    const run = [pg, ...near];
    const fur = furnitureOf(run);
    const regs = run.map((p, i) => buildRegPage(p, i, 0, fur));
    if (recurrenceLinks(regs).some((l) => l.a === regs[0] || l.b === regs[0]))
      return { verdict: 'registers', why: 'shares a long drawing operation with a tile' };
    if (s === null)
      return { verdict: null, why: 'the file has several sheets — a mixed reference' };
    const r = refOf(pg.file, s);
    return r.ok
      ? { verdict: 'apart', why: r.why }
      : { verdict: null, why: `partial reference: ${r.why}` };
  };
}

/** The stats a page's thumbnail is sent with (PatternPageEvidence) — and the rule reads. */
export function pageStats(pg: IRPage, pc: PageChains, marks?: FileMarks | null): PageStats {
  const len = pc.chains.reduce((a, c) => a + c.lengthMm, 0);
  const { chars, excerpt } = textOf(pg);
  return {
    file: pg.file,
    page: pg.page,
    widthMm: pg.widthMm,
    heightMm: pg.heightMm,
    lineLengthM: Math.round(len / 10) / 100,
    pieceSizedOutlines: shapesOf(pc.chains, PATIMPORT.minPieceAreaMm2).length,
    hasTileMarks:
      marks && marks.sigs.length && sameOrientation(pg, marks.tile)
        ? marksOn(pc, marks.sigs) > 0
        : undefined,
    textChars: chars,
    textExcerpt: excerpt,
  };
}

/**
 * SUGGESTIVE geometric facts that a page set aside is not pattern — never enough to set it aside,
 * even with the AI (another format, no chrome, text-dominant, no registration). Empty = silent.
 */
export function geoEvidence(
  st: PageStats,
  marks: FileMarks | null | undefined,
  grid: 'registers' | 'apart' | null = null,
): string[] {
  const out: string[] = [];
  if (grid === 'apart')
    out.push(
      'registers with none of the tiles (the tiles register with each other by shared line work)',
    );
  const fmt = (w: number, h: number) => `${Math.round(w)}×${Math.round(h)} mm`;
  if (marks && !sameFormat(st, marks.tile))
    out.push(
      `another page format (${fmt(st.widthMm, st.heightMm)}) than the tiles (${fmt(marks.tile.widthMm, marks.tile.heightMm)})`,
    );
  if (st.hasTileMarks === false && marks)
    out.push(
      `none of the ${marks.sigs.length} tile marks every tile carries at one page place is on it`,
    );
  if (
    st.textChars >= AI_PAGES.textMinChars &&
    st.textChars >= AI_PAGES.textCharsPerM * st.lineLengthM
  )
    out.push(`text-dominant: ${st.textChars} characters on ${st.lineLengthM} m of line`);
  return out;
}

/**
 * The EXCLUSIONARY fact (a) or (b) — the only geometry that, with the AI, sets a page aside. Null =
 * none: the page may hold a piece.
 */
export function exclusionOf(
  pc: PageChains,
  st: PageStats,
  copy: { matches: number; of: number; scale: number; pieces?: number; clustered?: boolean } | null,
  grid: 'registers' | 'apart' | null,
): string | null {
  if (grid === 'registers') return null;
  if (
    copy &&
    copy.scale <= AI_PAGES.copyMaxScale &&
    copy.clustered === true &&
    (copy.pieces ?? 0) >= AI_PAGES.copyMinPieces
  )
    return `its outlines are the file's tile pieces at 1:${Math.round(1 / copy.scale)} (${copy.matches} of ${copy.of} matched, ${copy.pieces} different pieces at one scale, none of piece size unexplained) — a reduced copy`;
  // (b): a rectangle of piece size counts as a piece here (a waistband, a pocket bag is one)
  const longest = pc.chains.reduce((a, c) => Math.max(a, c.lengthMm), 0);
  if (closedPieceSized(pc) === 0 && longest <= AI_PAGES.longLineMm && st.hasTileMarks !== true)
    return `no piece-sized outline, no line over ${AI_PAGES.longLineMm} mm (longest ${Math.round(longest)} mm), no tile chrome — not part of the tile grid`;
  return null;
}

/** Closed outlines of piece size, rectangles included (`minPieceAreaMm2`). */
export function closedPieceSized(pc: PageChains): number {
  let n = 0;
  for (const c of pc.chains) {
    if (!c.closed) continue;
    let a = 0;
    const q = c.pts;
    for (let k = 0, j = q.length - 1; k < q.length; j = k++)
      a += (q[j].x + q[k].x) * (q[j].y - q[k].y);
    if (Math.abs(a) / 2 >= PATIMPORT.minPieceAreaMm2) n++;
  }
  return n;
}

/** "instructions 0.92" */
export const aiWords = (a: { role: AiPageRole; confidence: number }) =>
  `${a.role.replace('_', ' ')} ${a.confidence.toFixed(2)}`;

/**
 * The rule on one page set aside (it holds line work: status 'suggest'): AI ≥ 0.85 in a non-pattern
 * role (a fresh answer) AND an exclusionary geometric fact → set aside by itself. Anything less
 * stays a suggestion (the operator's one click; the autopilot's stop with the answer pre-filled).
 */
export function aiAsides(
  d: Pick<CleanOutput['dropped'][number], 'status'>,
  ai: Pick<AiPageHint, 'role' | 'confidence' | 'stale'> | undefined,
  exclusion: string | null,
): boolean {
  return (
    d.status === 'suggest' &&
    !!ai &&
    !ai.stale &&
    NOT_PATTERN_ROLES.has(ai.role) &&
    ai.confidence >= AI_PAGES.autoMin &&
    !!exclusion
  );
}
