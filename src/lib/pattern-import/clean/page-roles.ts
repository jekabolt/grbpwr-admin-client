// clean/ (A9) — the AI's page roles as evidence on the pages the classifier set aside (plan
// auto/00-PLAN §A9; owner 11.10). In autopilot every real PDF of the corpus stopped on "page N was
// set aside as instructions / overview but holds line work": the classifier's word alone is one
// evidence. The AI reading the page's thumbnail is evidence №1, the page's OWN geometry №2:
//
//   · another page format than the file's tiles — the page cannot sit in the tile grid;
//   · no tile chrome where the tiles carry it (the marks / frame / labels every tile repeats at one
//     page place are not on this page);
//   · text-dominant (≥ 300 characters and ≥ 150 per metre of line work);
//   · a reduced copy of the tiles' pieces (clean/reduced-copy.ts, an overview).
//
// D3 still holds: both → the page is set aside by itself ('auto', shown "set aside · AI +
// geometry", one click undoes it); the AI alone or the geometry alone → a suggestion; the AI's
// `pattern_*` on a page set aside → "read it as a tile" offered. The AI never removes a page the
// classifier placed in the tile grid — such pages are not set aside here at all.
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
  /** The tiles nearest the page its registration is tested against (`tileGrid`). */
  gridTiles: 8,
  /** Thumbnail long side, px. */
  thumbPx: 1024,
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

/**
 * Is the page in the tile grid? Registration by recurrence (assemble/recurrence.ts) of the page
 * with the file's nearest tiles: 'registers' = it shares a long drawing operation with a tile (it
 * may BE one — the AI never sets it aside); 'apart' = the tiles register with each other this way
 * and the page with none of them; null = the test says nothing (too few tiles, or tiles that do
 * not register by recurrence — clipped tiles, stitched at their edges instead).
 */
export function tileGrid(pg: IRPage, tiles: readonly IRPage[]): 'registers' | 'apart' | null {
  if (tiles.length < 2) return null;
  const near = [...tiles]
    .sort((a, b) => Math.abs(a.page - pg.page) - Math.abs(b.page - pg.page))
    .slice(0, AI_PAGES.gridTiles);
  const run = [pg, ...near];
  const fur = furnitureOf(run);
  const regs = run.map((p, i) => buildRegPage(p, i, 0, fur));
  const links = recurrenceLinks(regs);
  if (links.some((l) => l.a === regs[0] || l.b === regs[0])) return 'registers';
  return links.length ? 'apart' : null;
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
        : null,
    textChars: chars,
    textExcerpt: excerpt,
  };
}

/**
 * Geometric evidence (№2) that a page set aside is not pattern — each independent of the AI. Empty
 * = the geometry does not say.
 */
export function geoEvidence(
  st: PageStats,
  marks: FileMarks | null | undefined,
  reducedCopy?: { matches: number; of: number; scale: number },
  grid: 'registers' | 'apart' | null = null,
): string[] {
  const out: string[] = [];
  if (grid === 'apart')
    out.push(
      'registers with none of the tiles (they register with each other by shared line work) — not in the tile grid',
    );
  const fmt = (w: number, h: number) => `${Math.round(w)}×${Math.round(h)} mm`;
  if (marks && !sameFormat(st, marks.tile))
    out.push(
      `another page format (${fmt(st.widthMm, st.heightMm)}) than the tiles (${fmt(marks.tile.widthMm, marks.tile.heightMm)}) — not in the tile grid`,
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
  if (reducedCopy)
    out.push(
      `${reducedCopy.matches} of its ${reducedCopy.of} outlines are tile pieces at 1:${Math.round(1 / reducedCopy.scale)} (a reduced copy)`,
    );
  return out;
}

/** "instructions 0.92" */
export const aiWords = (a: { role: AiPageRole; confidence: number }) =>
  `${a.role.replace('_', ' ')} ${a.confidence.toFixed(2)}`;

/**
 * The rule on one page set aside (it holds line work: status 'suggest'): AI ≥ 0.85 in a non-pattern
 * role AND a geometric evidence → set aside by itself. Anything less stays a suggestion (the
 * operator's one click; the autopilot's stop with the answer pre-filled).
 */
export function aiAsides(
  d: Pick<CleanOutput['dropped'][number], 'status'>,
  ai: Pick<AiPageHint, 'role' | 'confidence'> | undefined,
  geo: readonly string[],
): boolean {
  return (
    d.status === 'suggest' &&
    !!ai &&
    NOT_PATTERN_ROLES.has(ai.role) &&
    ai.confidence >= AI_PAGES.autoMin &&
    geo.length > 0
  );
}
