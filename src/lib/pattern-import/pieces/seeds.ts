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

const EXPLICIT = [
  /^(?:pattern\s+)?piece\s*(?:no\.?|#)?\s*(\d{1,3}[a-z]?)$/i,
  /^(?:teil|schnittteil|деталь|pièce|pieza)\s*(?:nr\.?|№|#)?\s*(\d{1,3}[a-z]?)$/i,
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

/** Sheet → page frame for one text (inverse of its page's pose). */
function pageRel(sheet: Sheet, t: IRText): PtMm | null {
  const pose = poseOf(sheet, t);
  if (!pose) return null;
  const { a, b, c, d, e, f } = pose.toSheet;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  const x = t.anchor.x - e;
  const y = t.anchor.y - f;
  return { x: (d * x - c * y) / det, y: (-b * x + a * y) / det };
}

/** Numbers printed once per page at one page-relative spot = tile labels. */
function tileLabelIds(sheet: Sheet, nums: IRText[]): Set<number> {
  const out = new Set<number>();
  const groups = new Map<number, IRText[]>();
  for (const t of nums) {
    const k = Math.round(t.fontSizeMm * 2);
    const g = groups.get(k);
    if (g) g.push(t);
    else groups.set(k, [t]);
  }
  for (const g of groups.values()) {
    if (g.length < 4) continue;
    const rel = g.map((t) => ({ t, p: pageRel(sheet, t) })).filter((x) => x.p);
    // the most common page-relative spot (15 mm cells)
    const votes = new Map<string, IRText[]>();
    for (const { t, p } of rel) {
      const key = `${Math.round(p!.x / 15)},${Math.round(p!.y / 15)}`;
      const v = votes.get(key);
      if (v) v.push(t);
      else votes.set(key, [t]);
    }
    const pages = new Set(rel.map(({ t }) => `${t.src.file}:${t.src.page}`)).size;
    for (const v of votes.values()) {
      const vp = new Set(v.map((t) => `${t.src.file}:${t.src.page}`)).size;
      if (vp >= 4 && vp >= 0.5 * pages) for (const t of v) out.add(t.id);
    }
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
