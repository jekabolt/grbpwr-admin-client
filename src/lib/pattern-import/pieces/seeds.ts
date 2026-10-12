// pieces/ (F4) — seeds from the sheet's text, and the variant labels the operator chooses from.
//
// A seed is a point inside a piece. Text gives it where the source prints piece labels as text:
//   1. explicit labels — "Piece 3", "Teil 21", "ID: 2", "A - TOP BACK UPPER" (one letter + name);
//      when any exist, bare numbers are not used (kombinezon prints tile numbers 25 mm high);
//   2. else bare piece numbers ("21", "6.", "71" split into "7" + "1") — after dropping tile
//      labels (a number group printed at one page-relative spot on every page) and size labels
//      of the run, keeping the large ones (≥ 60 % of the largest remaining number, ≥ 5 mm).
// Copies of one label (an OCG per size repeats every text) collapse to one seed. Labels drawn as
// curves (reef body, r4454, wm, Redcafe) give nothing here — the wizard adds clicks or AI marks
// (origin 'click' / 'ai'); fillPieces treats every origin alike.
import type { ChainSet, IRText, PagePose, PtMm, Seed, Sheet } from 'lib/pattern-import/types';

import { dist } from './geom';

/**
 * The piece-number grammar ("7", "21", "123", "2a"), shared with the cutting-list reader
 * (semantics/fold.ts `foldListEntries`) so a number a seed accepts is never dropped from the list.
 */
export const PIECE_NO_SRC = String.raw`\d{1,3}[a-z]?`;

const EXPLICIT = [
  new RegExp(String.raw`^(?:pattern\s+)?piece\s*(?:no\.?|#)?\s*(${PIECE_NO_SRC})$`, 'i'),
  new RegExp(
    String.raw`^(?:teil|schnittteil|деталь|pièce|pieza)\s*(?:nr\.?|№|#)?\s*(${PIECE_NO_SRC})$`,
    'i',
  ),
  /^id\s*:?\s*(\d{1,3})(?:\s|$)/i,
];
const LETTER_NAME = /^([A-Z]{1,2})\s*[-–—:]\s+\S.{1,60}$/;
const NUMBER = /^(\d{1,3})\.?$/;
const VARIANT = [
  /^(?:style|view|version|variante?)\s+([A-Z0-9]{1,3})\b/i,
  /^mod(?:ell?|el)?\.?\s*(\d{2,4}|[A-Z])\b/i,
];

export type TextSeed = { label: string; name: string | null; at: PtMm; text: IRText; size: number };

const centre = (t: IRText): PtMm => ({
  x: (t.bbox.minX + t.bbox.maxX) / 2,
  y: (t.bbox.minY + t.bbox.maxY) / 2,
});

function poseOf(sheet: Sheet, t: IRText): PagePose | undefined {
  return sheet.poses.find((p) => p.file === t.src.file && p.page === t.src.page);
}

/**
 * Sheet → page frame for one text (inverse of its page's pose), at the CENTRE of its box: a tile
 * number centred on its page has one spot whether it prints "9" or "19" (the anchor is the left
 * edge and moves by a digit).
 */
function pageRel(sheet: Sheet, t: IRText): PtMm | null {
  const pose = poseOf(sheet, t);
  if (!pose) return null;
  const { a, b, c, d, e, f } = pose.toSheet;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  const m = centre(t);
  const x = m.x - e;
  const y = m.y - f;
  return { x: (d * x - c * y) / det, y: (-b * x + a * y) / det };
}

/**
 * Numbers printed once per page at one page-relative spot = tile labels: a group of one print size
 * whose page-relative centres lie within 20 mm of each other on ≥ 4 pages and ≥ half the pages
 * that print such numbers — or whose values follow the page order (n = page + k on ≥ 4 pages,
 * BLAZER: 1 … 24, one per tile, 80 mm tall in the middle of the tile).
 */
function tileLabelIds(sheet: Sheet, nums: IRText[]): Set<number> {
  const out = new Set<number>();
  const groups = new Map<number, IRText[]>();
  for (const t of nums) {
    const k = Math.round(t.fontSizeMm * 2);
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  const pageOf = (t: IRText) => `${t.src.file}:${t.src.page}`;
  for (const g of groups.values()) {
    if (g.length < 4) continue;
    const rel = g.map((t) => ({ t, p: pageRel(sheet, t) })).filter((x) => x.p);
    // spots: page-relative centres within 20 mm of a spot's first member
    const spots: { at: PtMm; ts: IRText[] }[] = [];
    for (const { t, p } of rel) {
      const s = spots.find((q) => dist(q.at, p!) <= 20);
      if (s) s.ts.push(t);
      else spots.push({ at: p!, ts: [t] });
    }
    const pages = new Set(rel.map(({ t }) => pageOf(t))).size;
    for (const v of spots) {
      const vp = new Set(v.ts.map(pageOf)).size;
      if (vp >= 4 && vp >= 0.5 * pages) for (const t of v.ts) out.add(t.id);
    }
    // the page sequence: the number minus the page index is one constant on ≥ 4 pages
    const k = new Map<string, IRText[]>();
    for (const t of g) {
      const n = parseInt(t.text.trim(), 10);
      if (!Number.isFinite(n)) continue;
      const key = `${t.src.file}|${n - t.src.page}`;
      const a = k.get(key);
      if (a) a.push(t);
      else k.set(key, [t]);
    }
    for (const a of k.values())
      if (new Set(a.map(pageOf)).size >= 4 && a.length >= 0.5 * g.length)
        for (const t of a) out.add(t.id);
  }
  return out;
}

/** Single digits printed as separate items ("7" + "1" = "71"): join neighbours of one size. */
function joinDigits(texts: IRText[]): { joined: IRText[]; parts: Set<number> } {
  const digits = texts.filter((t) => /^\d$/.test(t.text.trim()));
  const used = new Set<number>();
  const out: IRText[] = [];
  for (const t of digits) {
    if (used.has(t.id)) continue;
    const near = digits.filter(
      (u) =>
        u.id !== t.id &&
        !used.has(u.id) &&
        Math.abs(u.fontSizeMm - t.fontSizeMm) < 0.2 &&
        dist(centre(u), centre(t)) < 0.9 * t.fontSizeMm,
    );
    if (!near.length) continue;
    const group = [t, ...near];
    const r = (t.rotationDeg * Math.PI) / 180;
    const dir = { x: Math.cos(r), y: Math.sin(r) };
    group.sort(
      (a, b) => a.anchor.x * dir.x + a.anchor.y * dir.y - (b.anchor.x * dir.x + b.anchor.y * dir.y),
    );
    for (const g of group) used.add(g.id);
    const bbox = {
      minX: Math.min(...group.map((g) => g.bbox.minX)),
      minY: Math.min(...group.map((g) => g.bbox.minY)),
      maxX: Math.max(...group.map((g) => g.bbox.maxX)),
      maxY: Math.max(...group.map((g) => g.bbox.maxY)),
    };
    out.push({ ...group[0], text: group.map((g) => g.text.trim()).join(''), bbox });
  }
  return { joined: out, parts: used };
}

export function textSeeds(sheet: Sheet, sizeLabels: ReadonlySet<string> = new Set()): TextSeed[] {
  const texts = sheet.texts.filter((t) => t.text.trim());
  const explicit: TextSeed[] = [];
  for (const t of texts) {
    const s = t.text.trim();
    for (const re of EXPLICIT) {
      const m = s.match(re);
      if (m)
        explicit.push({
          label: m[1].toUpperCase(),
          name: null,
          at: centre(t),
          text: t,
          size: t.fontSizeMm,
        });
    }
    const m = s.match(LETTER_NAME);
    if (m && t.fontSizeMm >= 4)
      explicit.push({
        label: m[1],
        name: s.slice(m[0].indexOf(m[1]) + m[1].length).replace(/^\s*[-–—:]\s*/, ''),
        at: centre(t),
        text: t,
        size: t.fontSizeMm,
      });
  }
  if (explicit.length) return dedupe(explicit);
  const jd = joinDigits(texts);
  const nums = [
    ...texts.filter((t) => NUMBER.test(t.text.trim()) && !jd.parts.has(t.id)),
    ...jd.joined,
  ];
  const tiles = tileLabelIds(sheet, nums);
  const cand = nums.filter(
    (t) => !tiles.has(t.id) && !sizeLabels.has(t.text.trim().replace(/\.$/, '')),
  );
  if (!cand.length) return [];
  const big = Math.max(...cand.map((t) => t.fontSizeMm));
  const keep = cand.filter((t) => t.fontSizeMm >= Math.max(5, 0.6 * big));
  return dedupe(
    keep.map((t) => ({
      label: t.text.trim().replace(/\.$/, ''),
      name: null,
      at: centre(t),
      text: t,
      size: t.fontSizeMm,
    })),
  );
}

/** One seed per label per place: copies within 60 mm collapse (the largest print wins). */
function dedupe(s: TextSeed[]): TextSeed[] {
  const out: TextSeed[] = [];
  for (const x of [...s].sort((a, b) => b.size - a.size)) {
    if (out.some((o) => o.label === x.label && dist(o.at, x.at) < 60)) continue;
    out.push(x);
  }
  return out;
}

/** Variant labels printed on the sheet ("Style A", "Mod. 125"), as the operator picks them. */
export function variantLabels(texts: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of texts) {
    const s = raw.trim();
    for (const re of VARIANT) {
      const m = s.match(re);
      // "STYLE NO. 1042" is the pattern's number, not a model
      if (m && !/^(?:no|nr)$/i.test(m[1]))
        out.add(re === VARIANT[0] ? `Style ${m[1].toUpperCase()}` : `Mod. ${m[1].toUpperCase()}`);
    }
    // "Mod. 123,124,125" lists several models
    const list = s.match(/^mod\.?\s*((?:\d{2,4}\s*,\s*)+\d{2,4})/i);
    if (list) for (const v of list[1].split(/\s*,\s*/)) out.add(`Mod. ${v}`);
  }
  return [...out].sort();
}

/**
 * A10 · the labels a page prints that tell one tile sheet from another: the models it names
 * (`variantLabels`, the same spelling the pieces step offers) and a sheet letter ("Bogen A",
 * "Sheet B", "Лист Б"). Letters only — "Sheet 3" is a tile number on most files.
 */
export function pageLabels(texts: readonly string[]): { models?: string[]; sheets?: string[] } {
  const models = variantLabels(texts);
  const sheets = new Set<string>();
  for (const raw of texts) for (const m of raw.matchAll(SHEET_NAME)) sheets.add(m[1].toUpperCase());
  return {
    ...(models.length ? { models } : {}),
    ...(sheets.size ? { sheets: [...sheets].sort() } : {}),
  };
}
const SHEET_NAME =
  /(?<![\p{L}\p{N}])(?:schnitt)?(?:bogen|sheet|лист|arkusz|feuille|planche|hoja|foglio)[\s_#№:.-]+(\p{L})(?![\p{L}\p{N}])/giu;

/** A variant label printed near a seed (not a "Cutting line …" label): the seed is that variant's. */
export function variantNear(sheet: Sheet, at: PtMm, reachMm = 45): string | null {
  for (const t of sheet.texts) {
    const s = t.text.trim();
    if (/cutting|line|linie|линия/i.test(s)) continue;
    if (dist(centre(t), at) > reachMm) continue;
    const m = s.match(/^(?:style|view|version)\s+([A-Z0-9]{1,3})$/i);
    if (m) return `Style ${m[1].toUpperCase()}`;
  }
  return null;
}

export const proposeSeedsFrom = (sheet: Sheet, set?: ChainSet): Seed[] => {
  const sizeLabels = new Set(
    (set?.classes ?? []).filter((c) => c.role === 'size' && c.sizeLabel).map((c) => c.sizeLabel!),
  );
  return textSeeds(sheet, sizeLabels).map((s, id) => ({
    id,
    at: s.at,
    origin: 'text' as const,
    text: s.text,
    variant: variantNear(sheet, s.at),
  }));
};

/**
 * NAP · a bare-number seed that is a fragment of a printed CODE, not a piece label — the article
 * strip of a Burda sheet prints "00 15" / "0 015" beside "7142" and "fashion" in a smaller type,
 * and each fragment passed the number filter (≥ 60 % of the largest number) as its own seed. Two
 * independent evidences, both required (D3):
 *   type    the sheet prints its piece numbers in one type (the print size most number seeds share,
 *           ≥ 3 of them), and this one is clearly smaller (≤ 80 % of it);
 *   string  the digits on its baseline, in its type, each within half a type height of the next,
 *           read as one number of 4+ digits ("00" + "15" = "0015") — longer than any piece
 *           number (≤ 3 digits), with digits outside its own box (a joined "015" holds its own
 *           "1"): a piece number stands alone, and one split in two ("1" + "5") is 2 digits.
 * Explicit labels ("Piece 3", "A - TOP BACK") are never codes. The result is a reason per seed
 * id; the session holds such a seed back as a set-aside (D3: listed, one click from a piece), and
 * the outline it sits in, if any, is seeded as an outline of its own.
 */
/** Probe switches (mutation): drop an evidence, count a number's own digits, any run length. */
export type CodeTextSwitch = 'type' | 'string' | 'parts' | 'long';
export function codeTextSeeds(
  sheet: Pick<Sheet, 'texts'>,
  seeds: readonly Seed[],
  o: { off?: ReadonlySet<CodeTextSwitch> } = {},
): Map<number, string> {
  const out = new Map<number, string>();
  const nums = seeds.filter(
    (s) => s.origin === 'text' && s.text && NUMBER.test(s.text.text.trim()),
  );
  if (nums.length < 2) return out;
  // the piece-label type: the print size (0.5 mm bins) most number seeds share
  const bins = new Map<number, number>();
  for (const s of nums) {
    const k = Math.round(s.text!.fontSizeMm * 2);
    bins.set(k, (bins.get(k) ?? 0) + 1);
  }
  const [labelBin, labelCount] = [...bins].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  const labelMm = labelBin / 2;
  const digits = sheet.texts.filter((t) => /^\d+$/.test(t.text.trim()));
  for (const s of nums) {
    const t = s.text!;
    const fs = t.fontSizeMm;
    const small = labelCount >= 3 && fs <= 0.8 * labelMm;
    if (!small && !o.off?.has('type')) continue;
    // the run of digits on its baseline, in its type, each within half a type height of the run
    // (the burda strip: 0.25; a cut count "15 X 2" sits a whole type height and more away)
    const r = (t.rotationDeg * Math.PI) / 180;
    const u = { x: Math.cos(r), y: Math.sin(r) };
    const c = centre(t);
    const span = (b: IRText['bbox']): [number, number] => {
      const h = (Math.abs(u.x) * (b.maxX - b.minX) + Math.abs(u.y) * (b.maxY - b.minY)) / 2;
      const m = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
      const along = (m.x - c.x) * u.x + (m.y - c.y) * u.y;
      return [along - h, along + h];
    };
    const own = span(t.bbox);
    const line = digits
      .filter((d) => {
        if (Math.abs(d.fontSizeMm - fs) > 0.05 * fs) return false;
        if (Math.abs(d.rotationDeg - t.rotationDeg) > 2) return false;
        const dc = centre(d);
        return Math.abs(-(dc.x - c.x) * u.y + (dc.y - c.y) * u.x) <= 0.3 * fs;
      })
      .map((d) => ({ d, s: span(d.bbox) }));
    const run = new Set<(typeof line)[number]>();
    let [lo, hi] = own;
    for (let grew = true; grew; ) {
      grew = false;
      for (const x of line) {
        if (run.has(x) || x.s[1] < lo - 0.5 * fs || x.s[0] > hi + 0.5 * fs) continue;
        run.add(x);
        lo = Math.min(lo, x.s[0]);
        hi = Math.max(hi, x.s[1]);
        grew = true;
      }
    }
    // digits BESIDE it, not its own: its parts (a joined "015" = "0" + "1" + "5") and copies of
    // it (an OCG per size prints the label again, at or near its spot) overlap its box, and a
    // copy of its text is never its string, wherever it sits
    const label = t.text.trim();
    const outside = [...run].filter(
      (x) =>
        x.d.id !== t.id &&
        (o.off?.has('parts') ||
          ((x.s[0] >= own[1] - 0.25 * fs || x.s[1] <= own[0] + 0.25 * fs) &&
            x.d.text.trim() !== label)),
    );
    // what the line reads: one print per place — the seed itself, then each digit run that
    // overlaps no print kept so far by more than a quarter type (its parts, an OCG copy over it
    // or over a neighbour are the same print), in order along the line
    const kept: { s: [number, number]; text: string }[] = [{ s: own, text: label }];
    for (const x of [...run].sort((p, q) => p.s[0] - q.s[0]))
      if (
        x.d.id !== t.id &&
        (!!o.off?.has('parts') ||
          kept.every((k) => Math.min(k.s[1], x.s[1]) - Math.max(k.s[0], x.s[0]) <= 0.25 * fs))
      )
        kept.push({ s: x.s, text: x.d.text.trim() });
    const reads = kept
      .sort((p, q) => p.s[0] - q.s[0])
      .map((k) => k.text)
      .join('');
    // longer than any piece number (PIECE_NO_SRC: ≤ 3 digits) — a split "1" + "5" stays a label
    const string = outside.length > 0 && (reads.length >= 4 || !!o.off?.has('long'));
    if (!string && !o.off?.has('string')) continue;
    out.set(
      s.id,
      `“${t.text.trim()}” in ${fs.toFixed(1)} mm type (the piece numbers: ${labelMm.toFixed(1)} mm)${outside.length ? `, one line of digits reads “${reads}”` : ''}`,
    );
  }
  return out;
}

/** The label a seed carries (piece number / letter), for the names table and the probe. */
export function labelOf(text: string): string | null {
  const s = text.trim();
  for (const re of EXPLICIT) {
    const m = s.match(re);
    if (m) return m[1].toUpperCase();
  }
  const m = s.match(LETTER_NAME);
  if (m) return m[1];
  const n = s.match(NUMBER);
  return n ? n[1] : null;
}

export const seedLabel = (seed: Seed): string | null =>
  !seed.text
    ? null
    : seed.origin === 'text'
      ? labelOf(seed.text.text)
      : seed.text.text.trim() || null;
