// PATTERN-IMPORT · MOOD probe (MOOD-DIAG §4 "mood-probe") — a fixed ~24-file sample of the Mood
// Fabrics archive through the E2E run (runCase: the wizard's session, the cheapest operator
// answers, write + gate), scored WITHOUT hand labels:
//   (1) the key = the printed size key's labels (exact text);
//   (2) identity: the pen a written size's outline lies on = the pen of its label's key sample
//       (the sample read here independently: the short line printed under / beside the label);
//   (3) pieces named = the overview's piece letters ("A - FRONT"), "Cut N" texts;
//   (5) grading: area grows with size, no step past 2× the family's median step;
//   (6) no two outlines of one size from different pieces overlap > 5 % (not nested).
// A block that PASSES the gate (no failing block-severity check names it) and fails (2), (5) or
// (6) is `wrongPassing` — must be 0. `closed` = closed candidates / family × size candidates.
//   node scripts/pattern-import/mood.mjs [id…]   env PATIMPORT_MOOD_DIR (default: the archive),
//   PATIMPORT_REPORTS (reports go there only), MOOD_PAR (parallel children), MOOD_CAP_S (per file)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  Chain,
  ChainSet,
  IRText,
  PieceFamily,
  PtMm,
  Sheet,
  StageIO,
  Style,
} from 'lib/pattern-import/types';
import { chainLook, overlapArea, type Look } from 'lib/pattern-import/pieces/identity';
import { sameDashShape } from 'lib/pattern-import/chains/motif';
import {
  bboxOf,
  pointInPoly,
  segNearest,
  SegGrid,
  signedArea,
} from 'lib/pattern-import/pieces/geom';
import type { Session } from 'lib/pattern-import/worker/session';
import { buildChainsDetailed } from 'lib/pattern-import/chains';
import { PATIMPORT } from 'lib/pattern-import/types';

import { runCase } from './e2e-entry';

export const ARCHIVE = '/Users/jekabolt/Downloads/archive 600 pcs';
const DIR = process.env.PATIMPORT_MOOD_DIR ?? ARCHIVE;
export const MOOD_DIR = DIR;

const NUM18 = [
  '00',
  '0',
  '2',
  '4',
  '6',
  '8',
  '10',
  '12',
  '14',
  '16',
  '18',
  '20',
  '22',
  '24',
  '26',
  '28',
  '30',
  '32',
];
const XXS9 = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
const XS9 = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
const PAIR9 = ['00-0', '2-4', '6-8', '10-12', '14-16', '18-20', '22-24', '26-28', '30-32'];
const G0 = ['0/2', '4/6', '8/10', '12/14', '16/18', '20/22', '24/26', '28/30'];

type Sample = { id: string; gen: string; path: string; key: string[] };
/** The fixed sample (MOOD-DIAG §4), key labels as the archive scan read them (fullscan.json). */
export const SAMPLE: Sample[] = [
  {
    id: 'vixen',
    gen: 'G1-motif',
    path: 'dresses/MDF371-The-Vixen-Slip-Dress-Sizes-00-32-A4-Letter-Patterns.pdf',
    key: NUM18,
  },
  {
    id: 'paris',
    gen: 'G1-motif',
    path: 'dresses/MDF387-The-Paris-Mini-Dress-Sizes-00-32-A4-Letter-Patterns.pdf',
    key: NUM18,
  },
  {
    id: 'margaux',
    gen: 'G1-motif',
    path: 'dresses/MDF415-The-Margaux-Bodycon-Dress-Sizes-00-32-A4-Letter-Patterns-1.pdf',
    key: NUM18,
  },
  {
    id: 'london',
    gen: 'G1-motif',
    path: 'dresses/MDF386-The-London-Gown-Sizes-00-32-A4-Letter-Patterns.pdf',
    key: NUM18,
  },
  {
    id: 'cirrus',
    gen: 'G1-motif',
    path: 'jumpsuits/MDF380-The-Cirrus-Romper-Sizes-00-32-A4-Letter-Patterns-1.pdf',
    key: NUM18,
  },
  {
    id: 'dreamline',
    gen: 'G1-motif',
    path: 'kids/MDF376-The-Dreamline-Baby-Doll-Dress-00-32-A4-Letter-Patterns.pdf',
    key: NUM18,
  },
  {
    id: 'camden',
    gen: 'G1-dash',
    path: 'activewear/MoodFabrics.com-MDF337-Camden-Letter-A4-Tiled.pdf',
    key: NUM18,
  },
  {
    id: 'florence',
    gen: 'G1-dash',
    path: 'shirts_tops/MoodFabrics.com-MDF325-Florence-Letter-A4-Tiled.pdf',
    key: NUM18,
  },
  {
    id: 'erica',
    gen: 'G1-dash',
    path: 'skirts/MoodFabrics.com-MDF106-Erica-Letter-A4-Tiled-copy.pdf',
    key: NUM18,
  },
  {
    id: 'roselle',
    gen: 'G1-dash',
    path: 'jumpsuits/MoodFabrics.com-MDF307-Roselle-Pattern-Letter-A4-Tiled.pdf',
    key: NUM18,
  },
  {
    id: 'hilde',
    gen: 'G2',
    path: 'dresses/MDF392-The-Hilde-Ruffled-Dress-Sizes-XXS-4XL-A4-Letter-Patterns.pdf',
    key: XXS9,
  },
  {
    id: 'marostica',
    gen: 'G2',
    path: 'dresses/MDF417-The-Marostica-Midi-Dress-Sizes-XXS-4XL-A4-Letter-Patterns.pdf',
    key: XXS9,
  },
  {
    id: 'tropea',
    gen: 'G2',
    path: 'dresses/MDF449-Tropea-High-Slit-Slip-Dress-Free-Sewing-Pattern-Sizes-XS-5XL-A4-Letter-Patterns-Mood-Fabrics.pdf',
    key: XS9,
  },
  {
    id: 'palermo',
    gen: 'G2',
    path: 'lingerie_swim/MDF424-Palermo-Pajamas-Free-Sewing-Pattern-Sizes-XXS-4XL-A4-Letter-Patterns-Mood-Fabrics.pdf',
    key: XXS9,
  },
  {
    id: 'naxos',
    gen: 'G2',
    path: 'suits/MDF444-Naxos-Swim-Suit-Free-Sewing-Pattern-Sizes-XS-5XL-A4-Letter-Patterns-Mood-Fabrics.pdf',
    key: XS9,
  },
  {
    id: 'nolita',
    gen: 'G2',
    path: 'skirts/MDF467-Nolita-Skirt-Free-Sewing-Pattern-A4-Letter-Patterns-Mood-Fabrics-Sewciety-Blog.pdf',
    key: XS9,
  },
  {
    id: 'spoleto',
    gen: 'G2p',
    path: 'skirts/MDF560-Spoleto-A-Line-Skirt-Free-Sewing-Pattern-A4-Letter-Patterns-Mood-Fabrics-Sewciety-Blog.pdf',
    key: PAIR9,
  },
  {
    id: 'obsidian',
    gen: 'G2p',
    path: 'pants_shorts/MDF555-Obsidian-Barrel-Leg-Jeans-Free-Sewing-Pattern-A4-Letter-Patterns-Mood-Fabrics-Sewciety-Blog.pdf',
    key: PAIR9,
  },
  {
    id: 'chamonix',
    gen: 'G2p',
    path: 'activewear/MDF511-Chamonix-Color-Block-Sweatsuit-Free-Sewing-Pattern-A4-Letter-Patterns-Mood-Fabrics-Sewciety-Blog.pdf',
    key: PAIR9,
  },
  {
    id: 'oahu',
    gen: 'G2p',
    path: 'suits/MDF437-Oahu-Swim-Suit-Free-Sewing-Pattern-Sizes-00-2-30-32-A4-Letter-Patterns-Mood-Fabrics.pdf',
    key: PAIR9,
  },
  { id: 'ulmus', gen: 'G0', path: 'dresses/MDF065-Ulmus-Dress.pdf', key: G0 },
  {
    id: 'honeysuckle',
    gen: 'G0',
    path: 'dresses/MoodFabrics.com-MDF159-Honeysuckle-Pattern.pdf',
    key: G0,
  },
  {
    id: 'douglas',
    gen: 'G0',
    path: 'pants_shorts/MoodFabrics.com-MDF102-Douglas-Pattern.pdf',
    key: G0,
  },
  {
    id: 'bergen',
    gen: 'mixed',
    path: 'outerwear/MDF423-Bergen-Coat-Free-Sewing-Pattern-Sizes-XXS-4XL-A4-Letter-Patterns-Mood-Fabrics.pdf',
    key: NUM18,
  },
];
/**
 * MOOD_SAMPLES=<file.json>: extra samples ([{id, gen, path, key}]) — the probe runs them like the
 * fixed sample when named on the command line (SILENT: the GRADE-REVIEW families through write + gate).
 */
if (typeof process !== 'undefined' && process.env?.MOOD_SAMPLES)
  SAMPLE.push(...(JSON.parse(readFileSync(process.env.MOOD_SAMPLES, 'utf8')) as Sample[]));

// ── the key, read independently ───────────────────────────────────────────────────────────

const canon = (s: string) =>
  s
    .toUpperCase()
    .replace(/^SIZES?\s*/, '')
    .replace(/\s+/g, '')
    .replace(/–|—/g, '-')
    .replace(/^XXL$/, '2XL')
    .replace(/^XXXL$/, '3XL');

type KeyRow = { label: string; at: PtMm; look: Look | null; sample: number[] };

/**
 * The key's rows. A row's sample is the short stroke with a look NEAREST its label's box (≤ 5 mm, on
 * any side: Mood prints the label rotated 0/90/180°, its sample on the label's baseline), labels and
 * strokes paired one-to-one nearest first — as the engine's legendEndHits does. A band under the label
 * holding the LONGEST stroke read the next row's sample (rows 3.9 mm apart, band 4.8 mm; G0 samples
 * 32.1 mm, 12/14's 32.3 mm): 24/26 = 28/30's pen, 8/10 = 12/14's (g0key, 17.10).
 */
/**
 * The key's rows, read two ways — the stroke NEAREST each label (one-to-one; Mood G0 stacks its rows
 * 3.9 mm apart, a 4.8 mm band under the label holds the next row's sample too) and the old band
 * under the label (longest stroke). The band stands unless the nearest reading tells more pens apart
 * (the band read a neighbour's row: Apricot's 24/26 = 28/30, Moonflower's six rows on one chain);
 * florence's key reads right only by the band. SILENT: the judge must not invent a wrong from a
 * misread key.
 */
function readKey(
  sheet: Sheet,
  set: ChainSet,
  labels: string[],
  styles: Map<number, Style>,
): KeyRow[] {
  const a = readKeyNearest(sheet, set, labels, styles);
  const b = readKeyBand(sheet, set, labels, styles);
  const distinct = (rows: KeyRow[]) => {
    const ls: Look[] = [];
    for (const r of rows) if (r.look && !ls.some((x) => looseSame(x, r.look!))) ls.push(r.look);
    return ls.length;
  };
  // MOOD_KEY=band|nearest: one reading only (diagnosis)
  const force = typeof process !== 'undefined' ? process.env?.MOOD_KEY : undefined;
  if (force === 'band') return b;
  if (force === 'nearest') return a;
  // the band reading stands unless the nearest one tells more pens apart
  return distinct(a) > distinct(b) ? a : b;
}

function readKeyNearest(
  sheet: Sheet,
  set: ChainSet,
  labels: string[],
  styles: Map<number, Style>,
): KeyRow[] {
  const want = new Set(labels.map(canon));
  const head = sheet.texts.filter((t) => /line\s*key|size\s*key/i.test(t.text));
  const near = (t: IRText) =>
    !head.length ||
    head.some((h) => Math.hypot(h.anchor.x - t.anchor.x, h.anchor.y - t.anchor.y) < 300);
  const grid = new SegGrid(10);
  set.chains.forEach((c) => c.pts.length > 1 && grid.addPolyline(c.id, c.pts));
  const byId = new Map(set.chains.map((c) => [c.id, c]));
  const pairs: { label: string; at: PtMm; c: Chain; d: number }[] = [];
  for (const t of sheet.texts) {
    const l = canon(t.text);
    if (!want.has(l) || !near(t)) continue;
    const b = t.bbox;
    const best = new Map<number, number>();
    grid.near({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, 40, (id, si) => {
      const c = byId.get(id);
      if (!c || c.lengthMm > 80 || !chainLook(c, styles)) return;
      const p = c.pts[si];
      const q = c.pts[si + 1] ?? p;
      for (const s of [p, q, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }]) {
        const dx = Math.max(b.minX - s.x, 0, s.x - b.maxX);
        const dy = Math.max(b.minY - s.y, 0, s.y - b.maxY);
        const d = Math.hypot(dx, dy);
        if (d <= 5 && d < (best.get(id) ?? Infinity)) best.set(id, d);
      }
    });
    for (const [id, d] of best) pairs.push({ label: l, at: t.anchor, c: byId.get(id)!, d });
  }
  pairs.sort((a, b) => a.d - b.d || b.c.lengthMm - a.c.lengthMm);
  const rows: KeyRow[] = [];
  const seen = new Set<string>();
  const used = new Set<number>();
  for (const p of pairs) {
    if (seen.has(p.label) || used.has(p.c.id)) continue;
    seen.add(p.label);
    used.add(p.c.id);
    rows.push({ label: p.label, at: p.at, look: chainLook(p.c, styles), sample: [p.c.id] });
  }
  return rows;
}

function readKeyBand(
  sheet: Sheet,
  set: ChainSet,
  labels: string[],
  styles: Map<number, Style>,
): KeyRow[] {
  const want = new Set(labels.map(canon));
  const head = sheet.texts.filter((t) => /line\s*key|size\s*key/i.test(t.text));
  const near = (t: IRText) =>
    !head.length ||
    head.some((h) => Math.hypot(h.anchor.x - t.anchor.x, h.anchor.y - t.anchor.y) < 300);
  const rows: KeyRow[] = [];
  const seen = new Set<string>();
  const grid = new SegGrid(10);
  set.chains.forEach((c) => c.pts.length > 1 && grid.addPolyline(c.id, c.pts));
  for (const t of sheet.texts) {
    const l = canon(t.text);
    if (!want.has(l) || seen.has(l) || !near(t)) continue;
    const h = t.bbox.maxY - t.bbox.minY;
    // the row's band: from the label's foot down to ~1 line height, from its left edge right 70 mm
    const box = {
      minX: t.bbox.minX - 4,
      maxX: t.bbox.minX + 70,
      minY: t.bbox.minY - Math.max(4, h),
      maxY: t.bbox.minY + 0.8,
    };
    const ids = new Set<number>();
    grid.near({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }, 40, (id) => {
      const b = bboxOf(set.chains[id].pts);
      if (b.minX >= box.minX && b.maxX <= box.maxX + 10 && b.minY >= box.minY && b.maxY <= box.maxY)
        ids.add(id);
    });
    const cs = [...ids].map((id) => set.chains[id]).sort((a, b) => b.lengthMm - a.lengthMm);
    if (!cs.length) continue;
    // a sample is short (≤ 80 mm) and horizontal-ish
    const looked = cs.find((c) => c.lengthMm <= 80 && chainLook(c, styles));
    rows.push({
      label: l,
      at: t.anchor,
      look: looked ? chainLook(looked, styles) : null,
      sample: cs.map((c) => c.id),
    });
    seen.add(l);
  }
  return rows;
}

const looseSame = (a: Look, b: Look): boolean => {
  if (a.kind === 'solid' || b.kind === 'solid')
    return a.kind === 'solid' && b.kind === 'solid' && Math.abs(a.w - b.w) <= 0.03;
  if (a.kind === 'dash' && b.kind === 'dash') return sameDashShape(a.d, b.d, 0.3, 0.12);
  const ma = a.kind === 'dash' ? a.d : a.m;
  const mb = b.kind === 'dash' ? b.d : b.m;
  if (ma.length !== mb.length) return false;
  const sa = ma.reduce((x, y) => x + y, 0);
  const sb = mb.reduce((x, y) => x + y, 0);
  if (!sa || !sb) return false;
  // one pen at about one scale (a [2, 1] and a [6, 3] rhythm are two pens)
  if (sa / sb < 0.6 || sb / sa < 0.6) return false;
  return ma.every(
    (v, i) => Math.abs(v / sa - mb[i] / sb) <= Math.max(0.03, 0.15 * Math.max(v / sa, mb[i] / sb)),
  );
};

// ── per-block truth ───────────────────────────────────────────────────────────────────────

type BlockTruth = {
  block: string;
  label: string;
  seed: number;
  rank: number;
  passes: boolean;
  /** The checks that block it (G3, G22 …). */
  by: string[];
  areaCm2: number;
  pen: { own: number | null; best: string | null; bestShare: number };
  /** (4) stretches off its own pen's lines (null: no key sample for its label). */
  kinks: number | null;
  /** (4) where: "x,y/length" per kink. */
  kinkAt?: string[];
  wrong: string[];
  unverified?: string;
};

function sharesOn(outer: PtMm[], set: ChainSet, styles: Map<number, Style>, key: KeyRow[]) {
  const b = bboxOf(outer);
  const grid = new SegGrid(4);
  const looks = new Map<number, Look>();
  for (const c of set.chains) {
    if (c.pts.length < 2) continue;
    const cb = bboxOf(c.pts);
    if (
      cb.maxX < b.minX - 2 ||
      cb.minX > b.maxX + 2 ||
      cb.maxY < b.minY - 2 ||
      cb.minY > b.maxY + 2
    )
      continue;
    const l = chainLook(c, styles);
    if (!l) continue;
    looks.set(c.id, l);
    grid.addPolyline(c.id, c.closed ? [...c.pts, c.pts[0]] : c.pts);
  }
  const rowOf = new Map<number, Set<string>>();
  for (const [id, l] of looks) {
    const s = new Set<string>();
    for (const r of key) if (r.look && looseSame(l, r.look)) s.add(r.label);
    if (s.size) rowOf.set(id, s);
  }
  // samples every 1 mm along the ring
  const hits = new Map<string, number>();
  let n = 0;
  for (let i = 0; i < outer.length; i++) {
    const p = outer[i];
    const q = outer[(i + 1) % outer.length];
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    for (let t = 0; t < L; t += 1) {
      const x = { x: p.x + ((q.x - p.x) * t) / L, y: p.y + ((q.y - p.y) * t) / L };
      n++;
      const got = new Set<string>();
      grid.near(x, 0.6, (id, s) => {
        const rs = rowOf.get(id);
        if (!rs) return;
        const pts = set.chains[id].pts;
        const a = pts[s];
        const bb = pts[(s + 1) % pts.length];
        if (segNearest(x, a, bb).d <= 0.6) for (const r of rs) got.add(r);
      });
      for (const r of got) hits.set(r, (hits.get(r) ?? 0) + 1);
    }
  }
  const share = new Map<string, number>();
  for (const [r, k] of hits) share.set(r, n ? k / n : 0);
  return share;
}

/**
 * The kink reference: the sheet's chains as drawn, read again with the Ф2 corner pass off — the
 * points a corner pass adds to a size's line (stub, ramp, vertex) must not vouch for themselves.
 */
const refMemo = new WeakMap<object, ChainSet>();
function drawnChains(s: Session): ChainSet {
  const S = s as unknown as { sheet: Sheet; docTexts: string[]; fileNames: Map<string, string> };
  const hit = refMemo.get(S.sheet);
  if (hit) return hit;
  const prev = process.env.MOOD_F2_OFF;
  process.env.MOOD_F2_OFF = '1';
  try {
    const set = buildChainsDetailed(
      S.sheet,
      {
        joinGapMm: PATIMPORT.joinGapMm,
        joinAngleDeg: PATIMPORT.joinAngleDeg,
        joinLateralMm: PATIMPORT.joinLateralMm,
      },
      { extraTexts: S.docTexts, fileNames: S.fileNames },
    ).set;
    refMemo.set(S.sheet, set);
    return set;
  } finally {
    if (prev === undefined) delete process.env.MOOD_F2_OFF;
    else process.env.MOOD_F2_OFF = prev;
  }
}

/** A corner's own closure (stub, ramp, extended edge) lies on its edges' tangents within this. */
const KINK_EXT_MM = 12;
const KINK_OFF_MM = 0.5;
const KINK_RUN_MM = 2;

/**
 * (4) KINKS (MOOD-DIAG §4 Ф2): stretches longer than 2 mm where the outline is more than 0.5 mm
 * off its own pen's lines — the key sample's look — and off their end tangents carried 12 mm (a
 * corner closed by its own stub, ramp or extended edges lies on them; a step onto a neighbouring
 * size's line does not). Count of such stretches per outline.
 */
function kinksOf(
  outer: PtMm[],
  set: ChainSet,
  styles: Map<number, Style>,
  look: Look,
  /** Where each kink is ("x,y/length"), when given. */
  at?: string[],
  /** Each kink's stretch (first / middle / last off sample, length), when given. */
  runs?: { a: PtMm; m: PtMm; b: PtMm; len: number }[],
): number {
  const at0: string[] = [];
  const xs: PtMm[] = [];
  const b = bboxOf(outer);
  const pad = KINK_EXT_MM + 2;
  const segs: [PtMm, PtMm][] = [];
  const grid = new SegGrid(4);
  const add = (a: PtMm, c: PtMm) => {
    grid.addSeg(segs.length, 0, a, c);
    segs.push([a, c]);
  };
  for (const c of set.chains) {
    if (c.pts.length < 2) continue;
    const cb = bboxOf(c.pts);
    if (
      cb.maxX < b.minX - pad ||
      cb.minX > b.maxX + pad ||
      cb.maxY < b.minY - pad ||
      cb.minY > b.maxY + pad
    )
      continue;
    const l = chainLook(c, styles);
    if (!l || !looseSame(l, look)) continue;
    const pts = c.closed ? [...c.pts, c.pts[0]] : c.pts;
    for (let i = 0; i + 1 < pts.length; i++) add(pts[i], pts[i + 1]);
    if (c.closed || c.lengthMm < 3) continue;
    for (const end of [0, 1] as const) {
      const p = end ? pts[pts.length - 1] : pts[0];
      // the tangent from ~2 mm back
      let k = end ? pts.length - 1 : 0;
      const step = end ? -1 : 1;
      let acc = 0;
      while (k + step >= 0 && k + step < pts.length && acc < 2) {
        acc += Math.hypot(pts[k].x - pts[k + step].x, pts[k].y - pts[k + step].y);
        k += step;
      }
      const q = pts[k];
      const L = Math.hypot(p.x - q.x, p.y - q.y);
      if (L < 1e-6) continue;
      add(p, {
        x: p.x + ((p.x - q.x) / L) * KINK_EXT_MM,
        y: p.y + ((p.y - q.y) / L) * KINK_EXT_MM,
      });
    }
  }
  // samples every 0.25 mm; off = farther than 0.5 mm from every own segment
  const off: boolean[] = [];
  const STEP = 0.25;
  for (let i = 0; i < outer.length; i++) {
    const p = outer[i];
    const q = outer[(i + 1) % outer.length];
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    for (let t = 0; t < L; t += STEP) {
      const x = { x: p.x + ((q.x - p.x) * t) / L, y: p.y + ((q.y - p.y) * t) / L };
      let on = false;
      grid.near(x, KINK_OFF_MM, (s) => {
        if (!on && segNearest(x, segs[s][0], segs[s][1]).d <= KINK_OFF_MM) on = true;
      });
      off.push(!on);
      at0.push(`${x.x.toFixed(0)},${x.y.toFixed(0)}`);
      xs.push(x);
    }
  }
  const n = off.length;
  const first = off.indexOf(false);
  if (first < 0) return n ? 1 : 0;
  let kinks = 0;
  let run = 0;
  for (let k = 1; k <= n; k++) {
    if (off[(first + k) % n]) run++;
    else {
      if (run * STEP > KINK_RUN_MM) {
        kinks++;
        at?.push(`${at0[(first + k - Math.ceil(run / 2)) % n]}/${(run * STEP).toFixed(1)}`);
        runs?.push({
          a: xs[(first + k - run) % n],
          m: xs[(first + k - Math.ceil(run / 2)) % n],
          b: xs[(first + k - 1) % n],
          len: run * STEP,
        });
      }
      run = 0;
    }
  }
  return kinks;
}

/** Per written block (scope|block): the failing block-severity checks that name it ([] = passes). */
function blockingOf(out: StageIO['write']['out']): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const sc of out.scopes) {
    const g = out.gate[sc.target.scopeKey];
    const blocks = sc.manifest.blocks.map((b) => b.block);
    for (const b of blocks) by.set(`${sc.target.scopeKey}|${b}`, []);
    for (const k of g?.checks ?? []) {
      if (k.ok || k.severity !== 'block') continue;
      const all = !k.blocks.length || k.blocks.includes('*');
      for (const x of blocks)
        if (all || k.blocks.some((b) => x === b || x.startsWith(`${b}_`)))
          by.get(`${sc.target.scopeKey}|${x}`)!.push(k.id.split('-')[0]);
    }
  }
  return by;
}

type FileRec = Record<string, unknown> & { id: string; wrongPassing: number };

export async function probeOne(sm: Sample): Promise<FileRec> {
  const file = resolve(DIR, sm.path);
  const card = sm.key;
  let analysis: Partial<FileRec> = {};
  let autoK: Partial<FileRec> = {};
  const rec = await runCase(
    { id: `mood:${sm.id}`, group: 'pdf', files: [file], card } as Parameters<typeof runCase>[0],
    {
      onAutoPieces: (s: Session, pc) => {
        try {
          autoK = autoKinks(sm, s, pc.families);
        } catch (e) {
          autoK = { autoKinkError: String((e as Error)?.stack ?? e).slice(0, 400) };
        }
      },
      onWrite: (s: Session, out) => {
        try {
          analysis = analyse(sm, s, out);
        } catch (e) {
          analysis = { analyseError: String((e as Error)?.stack ?? e).slice(0, 400) };
        }
      },
    },
  );
  const auto = rec.auto as
    | { candidates?: number; closedCandidates?: number; families?: number }
    | undefined;
  const r: FileRec = {
    id: sm.id,
    gen: sm.gen,
    verdict: rec.verdict,
    reason: rec.reason ?? (rec.error as string | undefined)?.split('\n')[0],
    ...(rec.error ? { error: rec.error } : {}),
    encoding: (rec.sizes as { encoding?: string } | undefined)?.encoding,
    found: ((rec.sizes as { found?: string[] } | undefined)?.found ?? []).length,
    keyN: sm.key.length,
    families: auto?.families ?? 0,
    candidates: auto?.candidates ?? 0,
    closed: auto?.closedCandidates ?? 0,
    ms: rec.totalMs,
    wrongPassing: 0,
    ...autoK,
    ...analysis,
  };
  return r;
}

/**
 * (4) over every CLOSED candidate of the first automatic pieces run (written or not — a file the
 * wizard stops on writes nothing): kinks per closed outline whose label has a key sample.
 */
function autoKinks(sm: Sample, s: Session, families: PieceFamily[]): Partial<FileRec> {
  const S = s as unknown as {
    sheet: Sheet;
    wallSet: ChainSet | null;
    chains: ChainSet;
    run: { sizes: { label: string }[] } | null;
  };
  const set = S.wallSet ?? S.chains;
  const styles = new Map(S.sheet.styles.map((x) => [x.id, x]));
  const key = readKey(S.sheet, set, sm.key, styles);
  let judged = 0;
  let kinks = 0;
  let outlines = 0;
  const per: string[] = [];
  const at: string[] = [];
  for (const f of families)
    for (const c of f.candidates) {
      if (c.outcome !== 'closed' || c.outer.length < 3) continue;
      const label = canon(S.run?.sizes[c.rank]?.label ?? '');
      const row = key.find((r) => r.label === label && r.look);
      if (!row?.look) continue;
      const where: string[] = [];
      const k = kinksOf(c.outer, drawnChains(s), styles, row.look, where);
      judged++;
      kinks += k;
      if (k) outlines++;
      per.push(`${f.seed}:${label}:${k}`);
      if (k) at.push(`${f.seed}:${label}:r${c.rank} ${where.join(' ')}`);
    }
  // MOOD_DUMP=<dir>: the first automatic pieces run as the diagnosis scripts read it
  const dump = process.env.MOOD_DUMP;
  if (dump) {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const P = (p: PtMm) => [r2(p.x), r2(p.y)];
    const w = (k: string, v: unknown) =>
      writeFileSync(resolve(dump, `${sm.id}-${k}.json`), JSON.stringify(v));
    w('rawchains', {
      styles: S.sheet.styles,
      texts: [],
      chains: set.chains.map((c) => ({
        style: c.style,
        len: r2(c.lengthMm),
        closed: c.closed,
        pts: c.pts.map(P),
      })),
    });
    w('chains', {
      classes: set.classes.map((k) => ({
        id: k.id,
        role: k.role,
        sizeLabel: k.sizeLabel,
        chains: k.chains,
      })),
    });
    w('rec', { sizes2: { labels: (S.run?.sizes ?? []).map((z, r) => `${z.label}:r${r}`) } });
    w(
      'pieces',
      families.map((f) => ({
        seed: f.seed,
        cands: f.candidates.map((c) => ({
          rank: c.rank,
          outcome: c.outcome,
          outer: c.outer.map(P),
          walls: c.walls,
        })),
      })),
    );
  }
  return {
    autoKinkJudged: judged,
    autoKinks: kinks,
    autoKinkOutlines: outlines,
    autoKinkPer: per,
    autoKinkAt: at,
  };
}

/**
 * MOOD_KINK_DUMP=<dir>: one JSON per kinked written outline — the outline, its kinks, the drawn
 * line work near each kink (each chain with the key labels whose pen it matches) and the chains
 * the session built the outline from (walls, corner walls, derived / continuity stretches).
 */
function dumpKink(
  sm: Sample,
  s: Session,
  set: ChainSet,
  styles: Map<number, Style>,
  key: KeyRow[],
  cand: PieceFamily['candidates'][number],
  t: BlockTruth,
  runs: { a: PtMm; m: PtMm; b: PtMm; len: number }[],
  scope: string,
) {
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const P = (p: PtMm) => [r2(p.x), r2(p.y)];
  // everything drawn over the outline's box (+15 mm): the kinks are judged against it
  const ob = bboxOf(cand.outer);
  const nearAny = (pts: PtMm[]) => {
    const b = bboxOf(pts);
    return !(
      b.maxX < ob.minX - 15 ||
      b.minX > ob.maxX + 15 ||
      b.maxY < ob.minY - 15 ||
      b.minY > ob.maxY + 15
    );
  };
  const lab = (c: Chain) => {
    const l = chainLook(c, styles);
    return l ? key.filter((r) => r.look && looseSame(l, r.look)).map((r) => r.label) : [];
  };
  const pick = (cs: Chain[]) =>
    cs
      .filter((c) => c.pts.length > 1 && nearAny(c.pts))
      .map((c) => ({
        id: c.id,
        closed: c.closed,
        style: c.style,
        motif: c.motif,
        labels: lab(c),
        pts: c.pts.map(P),
      }));
  const classOf = new Map<number, string>();
  for (const k of set.classes)
    for (const id of k.chains)
      classOf.set(
        id,
        `${k.role}:${k.sizeLabel ?? ''} ${JSON.stringify(
          k.evidence.map((e) =>
            e.kind === 'face-stray'
              ? { kind: e.kind, why: e.byWhy?.find((w) => w.chains.includes(id))?.why ?? e.why }
              : e,
          ),
        ).slice(0, 200)}`,
      );
  const sess = pick(set.chains).map((c) => ({
    ...c,
    cls: classOf.get(c.id) ?? null,
    wall: cand.walls.includes(c.id),
  }));
  const out = {
    id: sm.id,
    scope,
    block: t.block,
    label: t.label,
    rank: t.rank,
    seed: t.seed,
    passes: t.passes,
    by: t.by,
    rankFrom: cand.rankFrom ?? null,
    outer: cand.outer.map(P),
    runs: runs.map((k) => ({ a: P(k.a), m: P(k.m), b: P(k.b), len: k.len })),
    drawn: pick(drawnChains(s).chains),
    session: sess,
    corner: (set.cornerWalls ?? [])
      .filter((w) => nearAny(w.pts))
      .map((w) => ({ rule: w.rule, ends: w.ends, own: w.own, pts: w.pts.map(P) })),
    derived: (cand.derived ?? []).map((d) => ({ kind: d.kind, pts: d.pts.map(P) })),
    continuity: (cand.continuity ?? []).map((c) => ({
      pts: (c as { pts: PtMm[] }).pts.map(P),
      chains: (c as { chains: number[] }).chains,
    })),
  };
  writeFileSync(
    resolve(process.env.MOOD_KINK_DUMP!, `${sm.id}-${t.block.replace(/\//g, '_')}.json`),
    JSON.stringify(out),
  );
}

export function analyse(sm: Sample, s: Session, out: StageIO['write']['out']): Partial<FileRec> {
  const S = s as unknown as {
    sheet: Sheet;
    wallSet: ChainSet | null;
    chains: ChainSet;
    families: PieceFamily[];
    semantics: {
      pieces: {
        identity: string;
        seed: number;
        pairOf: string | null;
        ungraded: boolean;
        sizes: { rank: number }[];
      }[];
    } | null;
  };
  const sheet = S.sheet;
  const set = S.wallSet ?? S.chains;
  const styles = new Map(sheet.styles.map((x) => [x.id, x]));
  const key = readKey(sheet, set, sm.key, styles);
  const blocking = blockingOf(out);
  const famBy = new Map(S.families.map((f) => [f.seed, f]));
  const specs = S.semantics?.pieces ?? [];
  const truths: BlockTruth[] = [];
  const seenCand = new Set<string>();
  const unmatched: string[] = [];
  for (const sc of out.scopes) {
    const sizeOf = new Map(sc.manifest.sizes.map((z) => [z.token, z]));
    for (const mb of sc.manifest.blocks) {
      const id0 = mb.identity.replace(/^LIN_/, '');
      const spec =
        specs.find((p) => p.identity === mb.identity) ??
        specs.find((p) => p.identity === id0) ??
        specs.find((p) => p.pairOf === mb.identity || p.pairOf === id0);
      // a one-size piece (UNI): one geometry for every size — judged by overlap only
      const uni = mb.sizeToken === 'UNI' && spec?.ungraded;
      const z = uni
        ? { rank: spec!.sizes[0]?.rank ?? 0, sourceLabel: 'UNI', token: 'UNI' }
        : sizeOf.get(mb.sizeToken);
      if (!z || !spec) {
        unmatched.push(`${mb.block}: ${!z ? 'size' : 'spec'}`);
        continue;
      }
      const cand = famBy.get(spec.seed)?.candidates.find((c) => c.rank === z.rank);
      if (!cand || cand.outer.length < 3) {
        unmatched.push(`${mb.block}: candidate r${z.rank}`);
        continue;
      }
      // a pair's mirror and a lining copy carry the same source outline: judge it once per scope
      const k = `${sc.target.scopeKey}|${spec.seed}|${z.rank}`;
      if (seenCand.has(k)) continue;
      seenCand.add(k);
      const label = canon(z.sourceLabel || z.token);
      const sh = sharesOn(cand.outer, set, styles, key);
      const ownRow = key.find((r) => r.label === label && r.look);
      const own = ownRow ? sh.get(label) ?? 0 : null;
      let best: string | null = null;
      let bestShare = 0;
      for (const [l, v] of sh)
        if (v > bestShare) {
          best = l;
          bestShare = v;
        }
      const t: BlockTruth = {
        block: mb.block,
        label,
        seed: spec.seed,
        rank: z.rank,
        passes: !(blocking.get(`${sc.target.scopeKey}|${mb.block}`)?.length ?? 1),
        by: [...new Set(blocking.get(`${sc.target.scopeKey}|${mb.block}`) ?? ['?'])],
        areaCm2: Math.round(Math.abs(signedArea(cand.outer)) / 100),
        pen: { own: own == null ? null : +own.toFixed(2), best, bestShare: +bestShare.toFixed(2) },
        kinks: null,
        wrong: [],
      };
      if (ownRow?.look) {
        const runs: { a: PtMm; m: PtMm; b: PtMm; len: number }[] = [];
        t.kinks = kinksOf(cand.outer, drawnChains(s), styles, ownRow.look, undefined, runs);
        if (runs.length)
          t.kinkAt = runs.map((r) => `${r.m.x.toFixed(0)},${r.m.y.toFixed(0)}/${r.len}`);
        if (runs.length && process.env.MOOD_KINK_DUMP)
          dumpKink(sm, s, set, styles, key, cand, t, runs, sc.target.scopeKey);
      }
      if (uni) t.unverified = 'one-size piece';
      else if (best && best !== label && bestShare >= 0.5 && bestShare >= (own ?? 0) + 0.15)
        t.wrong.push(
          `outline on ${best}'s pen (${Math.round(bestShare * 100)} %, own ${own == null ? '?' : Math.round(own * 100)} %)`,
        );
      else if (own == null) t.unverified = 'no key sample for its label';
      else if (own < 0.7) t.unverified = `own pen ${Math.round(own * 100)} %`;
      truths.push(t);
      void cand;
    }
  }
  // (5) grading per family (written sizes of one seed, per scope)
  const byFam = new Map<string, BlockTruth[]>();
  for (const t of truths) {
    const k = `${t.seed}`;
    const a = byFam.get(k) ?? [];
    if (t.label !== 'UNI' && !a.some((x) => x.rank === t.rank)) a.push(t);
    byFam.set(k, a);
  }
  for (const rows0 of byFam.values()) {
    const rows = rows0.sort((a, b) => a.rank - b.rank);
    const steps = rows
      .slice(1)
      .map((r, i) => (r.areaCm2 - rows[i].areaCm2) / Math.max(1, r.rank - rows[i].rank));
    const pos = steps.filter((v) => v > 0).sort((a, b) => a - b);
    const med = pos.length ? pos[pos.length >> 1] : 0;
    rows.slice(1).forEach((r, i) => {
      if (r.label === 'UNI') return;
      if (steps[i] <= 0) {
        r.wrong.push(`area ${r.areaCm2} cm² ≤ the size below (${rows[i].areaCm2})`);
        return;
      }
      // a step past ×1.25 its neighbours' AND ≥ 1.75 median steps over them: a face that grew by
      // another piece (a grade break — Mood's 14 → 16 — stays within it)
      const nb = [steps[i - 1], steps[i + 1]].filter((v) => Number.isFinite(v) && v > 0);
      if (!nb.length || !med) return;
      const top = Math.max(...nb);
      if (steps[i] > 1.25 * top && steps[i] - top >= 1.75 * med)
        r.wrong.push(
          `area step ${steps[i].toFixed(0)} cm² vs neighbours ${top.toFixed(0)} (median ${med.toFixed(0)})`,
        );
    });
  }
  // (6) one rank, two pieces' outlines overlapping (not nested)
  const outerOf = (t: BlockTruth) =>
    famBy.get(t.seed)?.candidates.find((c) => c.rank === t.rank)?.outer ?? [];
  const uniq = [...new Map(truths.map((t) => [`${t.seed}:${t.rank}`, t])).values()];
  for (let i = 0; i < uniq.length; i++)
    for (let j = i + 1; j < uniq.length; j++) {
      const A = uniq[i];
      const B = uniq[j];
      if (A.rank !== B.rank || A.seed === B.seed) continue;
      const a = outerOf(A);
      const b = outerOf(B);
      const ov = overlapArea(a, b, 2) / 100;
      const small = Math.min(A.areaCm2, B.areaCm2);
      if (!small || ov <= 0.05 * small) continue;
      const [Sm, L] = A.areaCm2 <= B.areaCm2 ? [a, b] : [b, a];
      if (ov >= 0.98 * small && Sm.every((p) => pointInPoly(p, L))) continue;
      for (const t of [A, B])
        t.wrong.push(
          `overlaps seed ${t === A ? B.seed : A.seed} at the same size by ${Math.round((100 * ov) / small)} %`,
        );
    }
  // propagate the per-candidate verdict to every written block of it (pairs, lining copies)
  const wrongOf = new Map(truths.map((t) => [`${t.seed}:${t.rank}`, t.wrong]));
  for (const t of truths) t.wrong = wrongOf.get(`${t.seed}:${t.rank}`) ?? t.wrong;
  const passing = truths.filter((t) => t.passes);
  const wrongPassing = passing.filter((t) => t.wrong.length);
  const notchBlocks = out.scopes.flatMap((sc) =>
    sc.manifest.blocks
      .filter((b) => b.notches > 0)
      .map((b) => ({ scope: sc.target.label, block: b.block, notches: b.notches })),
  );
  // (3) pieces named: overview letters "A - FRONT"
  const letters = new Set(
    sheet.texts.flatMap((t) => {
      const m = /^([A-Z])\s*[-–]\s+\S/.exec(t.text.trim());
      return m ? [m[1]] : [];
    }),
  );
  return {
    unmatched: unmatched.length,
    unmatchedList: unmatched.slice(0, 10),
    keyRead: key.length,
    keyWithPen: key.filter((r) => r.look).length,
    piecesNamed: letters.size,
    blocks: truths.length,
    passing: passing.length,
    passingRight: passing.filter((t) => !t.wrong.length && !t.unverified).length,
    passingUnverified: passing.filter((t) => !t.wrong.length && t.unverified).length,
    wrongPassing: wrongPassing.length,
    wrongBlocked: truths.filter((t) => !t.passes && t.wrong.length).length,
    notches: notchBlocks.reduce((n, b) => n + b.notches, 0),
    notchBlocks,
    // (4) kinks over the written outlines judged by their own pen, and over the passing ones
    kinkJudged: truths.filter((t) => t.kinks != null).length,
    kinks: truths.reduce((a, t) => a + (t.kinks ?? 0), 0),
    kinkOutlines: truths.filter((t) => (t.kinks ?? 0) > 0).length,
    kinksPassing: passing.reduce((a, t) => a + (t.kinks ?? 0), 0),
    // pen-verified right blocks the gate holds back, by check
    rightBlockedBy: truths
      .filter((t) => !t.passes && !t.wrong.length && !t.unverified)
      .reduce((a: Record<string, number>, t) => {
        for (const k of t.by) a[k] = (a[k] ?? 0) + 1;
        return a;
      }, {}),
    wrongList: wrongPassing
      .slice(0, 20)
      .map((t) => `${t.block}[${t.label}]: ${t.wrong.join('; ')}`),
    // MOOD_PERBLOCK=1: per written block, where it came from and whether it passes (SILENT review)
    ...(process.env.MOOD_PERBLOCK
      ? {
          perBlock: truths.map((t) => {
            const o = outerOf(t);
            const b = o.length ? bboxOf(o) : null;
            return {
              block: t.block,
              seed: t.seed,
              rank: t.rank,
              label: t.label,
              passes: t.passes,
              by: t.by,
              areaCm2: t.areaCm2,
              box: b ? [b.minX, b.minY, b.maxX, b.maxY].map((v) => Math.round(v)) : null,
              wrong: t.wrong,
            };
          }),
          gateNotes: out.scopes.flatMap((sc) =>
            (out.gate[sc.target.scopeKey]?.checks ?? [])
              .filter((k) => !k.ok)
              .map((k) => `${k.id}:${k.severity}: ${k.note.slice(0, 600)}`),
          ),
        }
      : {}),
    truth: truths.map(
      (t) =>
        `${t.block}${t.passes ? '✓' : `✗${t.by.join('+')}`} ${t.label} own=${t.pen.own} best=${t.pen.best}:${t.pen.bestShare} kinks=${t.kinks}${t.kinkAt ? ` at ${t.kinkAt.join(' ')}` : ''}${t.wrong.length ? ` WRONG ${t.wrong.join('; ')}` : ''}`,
    ),
  };
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'list') {
    console.log(JSON.stringify(SAMPLE.map((s) => s.id)));
    return 0;
  }
  for (const sm of SAMPLE.filter((s) => args.includes(s.id))) {
    const r = await probeOne(sm);
    console.log(`@@RESULT ${JSON.stringify(r)}`);
  }
  return 0;
}

export type { Chain };
