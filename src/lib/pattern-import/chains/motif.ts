// chains/ (F3) — the "look" of a line: dash rhythm, decorations, stroke.
//
// A signature vector per chain = [piece-length histogram | gap histogram | solid | decorations |
// stroke width/fill], each block L2-normalised, blocks weighted. Two chains drawn the same way
// have cosine ≥ ~0.9 even when their dash phase or length differ. The recovered motif (Chain.motif)
// is the period of (dash, gap, …) quantised to PATIMPORT.motifQuantMm.
import type { Mm, Style } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { dist, median } from './geom';
import { LINK, linkPts, normDash, type WChain } from './link';

const BIN = 0.25;
const NB = 80; // 0 … 20 mm
const DECOR_KINDS = ['tick', 'ring', 'ringL', 'dot', 'dotL'] as const;
const NW = 32; // width buckets of 0.05 mm

export type Signature = {
  vec: Float64Array;
  /** Drawn pieces (inner ones), gaps (> dashGapMm) and decorations per 10 mm. */
  pieces: number[];
  gaps: number[];
  decorPer10: Record<(typeof DECOR_KINDS)[number], number>;
  solid: boolean;
  declared: Mm[] | null;
  /** Reliable enough to cluster on (long enough, enough repetitions). */
  reliable: boolean;
  motif: Mm[] | null;
  backbone: Style | null;
  /**
   * R7: diameters of the line's beads (dots, rings, filled marks), share per 0.1 mm bin over
   * 0…3 mm; null = no bead. Mood draws S and L (and 2 / 6) in one rhythm of triangles and dots —
   * only the dots' size tells them apart. Not part of `vec`: a tie-break between key samples.
   */
  beadHist: number[] | null;
  /** R7: the order of elements in one period, rotation-canonical (= dash · t tick · d dot · o ring,
   * upper case = the larger of two bead sizes): «dtdtt» vs «DDttd»; null = no clear period. */
  period: string | null;
};

const BEAD_BIN = 0.1;
const BEAD_NB = 30;

/** Bead diameter (mm) as drawn, null when unknown (a 1-mm stroke tick has its length only). */
function beadSize(it: { kind: string; bead?: string; size?: number; len: number }): number | null {
  if (it.kind !== 'bead') return null;
  if (it.size != null) return it.size;
  return it.bead === 'tick' && it.len > 0 ? it.len : null;
}
/** Round beads only (dots, rings) go into the histogram: ticks and triangles are one size on
 * every Mood line and would drown the dots that tell S from L. */
const round = (it: { kind: string; bead?: string }) =>
  it.kind === 'bead' && (it.bead === 'dot' || it.bead === 'ring');

/** Share of beads per diameter bin (smoothed over ±1 bin), or null without beads. */
function beadHistOf(sizes: number[]): number[] | null {
  if (!sizes.length) return null;
  const h = new Array(BEAD_NB).fill(0);
  for (const d of sizes) {
    const k = Math.min(BEAD_NB - 1, Math.max(0, Math.round(d / BEAD_BIN)));
    h[k] += 0.5;
    if (k > 0) h[k - 1] += 0.25;
    if (k < BEAD_NB - 1) h[k + 1] += 0.25;
  }
  const t = h.reduce((a, b) => a + b, 0);
  return h.map((v) => v / t);
}

/**
 * How differently two lines size their beads: 0 = alike … 1 = no bead size in common. A key prints
 * its samples at its own scale (Mood: 0.85 of the sheet): one histogram may sit up to 0.3 mm off
 * the other — the best shift counts; the SHAPE (one dot size or two) is what tells lines apart.
 */
export function beadContrast(a: number[] | null, b: number[] | null): number {
  if (!a || !b) return 0;
  let best = 1;
  for (let sh = -3; sh <= 3; sh++) {
    let d = 0;
    for (let i = 0; i < BEAD_NB; i++) d += Math.abs(a[i] - (b[i + sh] ?? 0));
    // what fell off the end of b by the shift is a difference too
    for (let i = 0; i < BEAD_NB; i++) if (i - sh < 0 || i - sh >= BEAD_NB) d += b[i] ?? 0;
    best = Math.min(best, d / 2);
  }
  return best;
}

/** The element order of one period of a sequence of symbols, canonical over rotation and
 * direction. */
function periodOf(sym: string[]): string | null {
  const n = sym.length;
  if (n < 6) return null;
  for (let p = 1; p <= 8 && 2 * p <= n; p++) {
    let ok = 0;
    for (let i = p; i < n; i++) if (sym[i] === sym[i - p]) ok++;
    if (ok < 0.85 * (n - p)) continue;
    // the most frequent symbol per phase, then the smallest rotation
    const per: string[] = [];
    for (let k = 0; k < p; k++) {
      const cnt = new Map<string, number>();
      for (let i = k; i < n; i += p) cnt.set(sym[i], (cnt.get(sym[i]) ?? 0) + 1);
      per.push([...cnt].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0][0]);
    }
    // a line is read in either direction: the smallest rotation of the period or of its reverse
    let best = per.join('');
    for (const seq of [per, per.slice().reverse()])
      for (let r = 0; r < p; r++) {
        const rot = [...seq.slice(r), ...seq.slice(0, r)].join('');
        if (rot < best) best = rot;
      }
    return best;
  }
  return null;
}

const q = (v: number) => Math.round(v / PATIMPORT.motifQuantMm) * PATIMPORT.motifQuantMm;

function addHist(v: Float64Array, off: number, x: number, w = 1) {
  const k = Math.min(NB - 1, Math.max(0, Math.round(x / BIN)));
  v[off + k] += w;
  if (k > 0) v[off + k - 1] += 0.5 * w;
  if (k < NB - 1) v[off + k + 1] += 0.5 * w;
}

function normBlock(v: Float64Array, from: number, to: number, weight: number) {
  let n = 0;
  for (let i = from; i < to; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (n < 1e-12) return;
  for (let i = from; i < to; i++) v[i] = (v[i] / n) * weight;
}

/** Period of a (dash, gap) sequence: medians of the best period up to 4 dash/gap pairs. */
export function recoverMotif(pieces: number[], gaps: number[]): Mm[] | null {
  const n = Math.min(pieces.length, gaps.length);
  if (n < 3) return null;
  for (let p = 1; p <= 4; p++) {
    if (n < 2 * p) break;
    const dash: number[][] = Array.from({ length: p }, () => []);
    const gap: number[][] = Array.from({ length: p }, () => []);
    for (let i = 0; i < n; i++) {
      dash[i % p].push(pieces[i]);
      gap[i % p].push(gaps[i]);
    }
    let dev = 0;
    let cnt = 0;
    const mot: number[] = [];
    for (let k = 0; k < p; k++) {
      const md = median(dash[k]);
      const mg = median(gap[k]);
      for (const x of dash[k]) dev += Math.abs(x - md);
      for (const x of gap[k]) dev += Math.abs(x - mg);
      cnt += dash[k].length + gap[k].length;
      mot.push(q(md), q(mg));
    }
    if (dev / cnt <= 0.3) {
      // rotate so the longest dash leads
      let best = 0;
      for (let k = 0; k < p; k++) if (mot[2 * k] > mot[2 * best]) best = k;
      return [...mot.slice(2 * best), ...mot.slice(0, 2 * best)];
    }
  }
  return null;
}

export function signatureOf(ch: WChain, styles: Map<number, Style>, lengthMm: number): Signature {
  const pieces: number[] = [];
  const gaps: number[] = [];
  const items = ch.items;
  // backbone = the style carrying most drawn length
  const byStyle = new Map<number, number>();
  for (const l of items)
    if (l.it.kind !== 'bead') byStyle.set(l.it.style, (byStyle.get(l.it.style) ?? 0) + l.it.len);
  let bk: number | null = null;
  let bl = -1;
  for (const [s, L] of byStyle)
    if (L > bl) {
      bl = L;
      bk = s;
    }
  const backbone = bk === null ? null : styles.get(bk) ?? null;
  const declared =
    backbone?.dash && backbone.dash.some((v) => v > 0.01) ? normDash(backbone.dash) : null;

  // piece lengths and gaps along the chain (oriented end → start of the next)
  let prevEnd = null as null | { x: number; y: number };
  const rawGaps: number[] = [];
  for (let k = 0; k < items.length; k++) {
    const pts = linkPts(items[k]);
    const len = items[k].it.kind === 'bead' ? items[k].it.len : items[k].it.len;
    if (prevEnd)
      rawGaps.push(dist(prevEnd, pts[0]) - (items[k].it.kind === 'bead' ? items[k].it.len / 2 : 0));
    prevEnd = pts[pts.length - 1];
    if (k > 0 && k < items.length - 1) pieces.push(len);
  }
  for (const g of rawGaps) if (g > LINK.dashGapMm) gaps.push(g);
  // merge pieces separated by tiny gaps (viola: "solid" cut into 4/13/24 mm with 0.3 mm gaps)
  const merged: number[] = [];
  {
    let acc = 0;
    for (let k = 0; k < items.length; k++) {
      acc += items[k].it.len;
      const g = k < rawGaps.length ? rawGaps[k] : Infinity;
      if (g > LINK.dashGapMm) {
        merged.push(acc);
        acc = 0;
      } else acc += Math.max(0, g);
    }
  }
  const innerPieces = merged.slice(1, -1);
  const solid = !declared && gaps.length === 0;

  const decorPer10 = { tick: 0, ring: 0, ringL: 0, dot: 0, dotL: 0 };
  // beads inside the chain itself (palto's dots are subpaths) count as pieces; free beads as decor
  // ring / dot diameter tells sizes apart (reef: zigzag with small vs with large dots)
  const kindOf = (it: { bead?: string; size?: number }) =>
    (it.bead === 'ring' && (it.size ?? 0) >= 1.6
      ? 'ringL'
      : it.bead === 'dot' && (it.size ?? 0) >= 1.05
        ? 'dotL'
        : it.bead ?? 'dot') as (typeof DECOR_KINDS)[number];
  for (const d of ch.decor) decorPer10[kindOf(d)] += 1;
  for (const l of items) if (l.it.kind === 'bead') decorPer10[kindOf(l.it)] += 1;
  for (const k of DECOR_KINDS) decorPer10[k] = lengthMm > 0 ? (10 * decorPer10[k]) / lengthMm : 0;

  // R7: bead diameters (items and decoration) and the element order along the chain
  const sizes: number[] = [];
  for (const d of ch.decor) {
    const v = beadSize(d);
    if (v != null && round(d)) sizes.push(v);
  }
  const seq: { k: string; size: number | null }[] = [];
  for (const l of items) {
    const it = l.it;
    const v = beadSize(it);
    if (v != null && round(it)) sizes.push(v);
    // '=' a dash (a stroke, a filled dash, a dash-mark of a row of marks)
    if (it.kind !== 'bead') seq.push({ k: it.len > 1.5 ? '=' : 't', size: null });
    else if (it.bead === 'tick' && it.size == null && it.len > 1.5)
      seq.push({ k: '=', size: null });
    else seq.push({ k: it.bead === 'ring' ? 'o' : it.bead === 'tick' ? 't' : 'd', size: v });
  }
  // two bead sizes of one kind on one line (Mood L: «▲▲●●» small and large dots): upper case = large
  const sym = seq.map((e) => e.k);
  for (const k of ['d', 'o', 't']) {
    const vs = seq
      .filter((e) => e.k === k && e.size != null)
      .map((e) => e.size!)
      .sort((a, b) => a - b);
    if (vs.length < 4) continue;
    // two sizes only when the sizes fall apart in two real groups (a clear gap, each ≥ 20 %):
    // one dot size printed a little bigger on some tiles is still one size
    let gi = 0;
    for (let i = 1; i + 1 < vs.length; i++) if (vs[i + 1] - vs[i] > vs[gi + 1] - vs[gi]) gi = i;
    const nLo = gi + 1;
    if (nLo < 0.2 * vs.length || vs.length - nLo < 0.2 * vs.length) continue;
    if (vs[gi + 1] < 1.25 * vs[gi]) continue;
    const cut = (vs[gi] + vs[gi + 1]) / 2;
    seq.forEach((e, i) => {
      if (e.k === k && e.size != null && e.size > cut) sym[i] = k.toUpperCase();
    });
  }
  const beadHist = beadHistOf(sizes);
  const period = periodOf(sym);

  const V = vecOf({ declared, innerPieces, gaps, solid, decorPer10, backbone });
  const reliable =
    !!declared || (solid ? lengthMm >= 15 : innerPieces.length >= 3 && lengthMm >= 12);
  const motif = declared
    ? declared.map(q)
    : solid
      ? null
      : recoverMotif(merged.slice(1), gaps.slice(1));
  return {
    vec: V,
    pieces: innerPieces,
    gaps,
    decorPer10,
    solid,
    declared,
    reliable,
    motif,
    backbone,
    beadHist,
    period,
  };
}

type VecParts = Pick<Signature, 'declared' | 'gaps' | 'solid' | 'decorPer10' | 'backbone'> & {
  innerPieces: number[];
};

/** The signature vector; `scale` stretches the rhythm (a legend printed at another scale). */
function vecOf(s: VecParts, scale = 1): Float64Array {
  const V = new Float64Array(2 * NB + 1 + DECOR_KINDS.length + NW + 1);
  const offG = NB;
  const offS = 2 * NB;
  const offD = offS + 1;
  const offW = offD + DECOR_KINDS.length;
  if (s.declared) {
    for (let i = 0; i < s.declared.length; i += 2) {
      addHist(V, 0, s.declared[i] * scale);
      addHist(V, offG, (s.declared[i + 1] ?? 0) * scale);
    }
  } else {
    for (const x of s.innerPieces) addHist(V, 0, Math.min(x * scale, NB * BIN - BIN));
    for (const x of s.gaps) addHist(V, offG, Math.min(x * scale, NB * BIN - BIN));
    if (s.solid) V[offS] = 1;
  }
  let dsum = 0;
  DECOR_KINDS.forEach((k, i) => {
    V[offD + i] = Math.min(3, s.decorPer10[k] / scale);
    dsum += V[offD + i];
  });
  if (s.backbone) {
    const fillDash = s.backbone.fill && s.backbone.widthMm === 0;
    if (fillDash) V[offW + NW] = 1;
    else V[offW + Math.min(NW - 1, Math.round(s.backbone.widthMm / 0.05))] = 1;
  }
  normBlock(V, 0, NB, 1);
  normBlock(V, offG, 2 * NB, 1);
  // sparse decorations (a notch tick every 14 mm, a stray ring) weigh less than a beaded line's
  normBlock(V, offD, offD + DECOR_KINDS.length, 0.8 * Math.min(1, dsum / 2));
  normBlock(V, offW, offW + NW + 1, 0.6);
  return V;
}

/** `a`'s vector re-drawn at scales 0.8…1.25 (a legend printed at another scale than the sheet). */
export function scaledVecs(a: Signature): Float64Array[] {
  const out: Float64Array[] = [];
  for (let f = 0.8; f <= 1.251; f += 0.025) out.push(vecOf({ ...a, innerPieces: a.pieces }, f));
  return out;
}

/** Best shapeCosine of any of `as` (scaledVecs of a sample) against `b`. */
export function shapeCosineBest(as: Float64Array[], b: Float64Array): number {
  let best = 0;
  for (const v of as) best = Math.max(best, shapeCosine(v, b));
  return best;
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return d / (Math.sqrt(na * nb) || 1);
}

/** Short human description of a motif for the legend ("3.0 1.5 0.5 1.5", "solid w0.35"). */
export function describeSig(s: Signature): string {
  const w = s.backbone
    ? s.backbone.fill && s.backbone.widthMm === 0
      ? 'fill'
      : `w${s.backbone.widthMm.toFixed(2)}`
    : '';
  const dec = Object.entries(s.decorPer10)
    .filter(([, v]) => v > 0.3)
    .map(([k, v]) => `${k}/${(10 / v).toFixed(1)}mm`)
    .join(' ');
  const m = s.declared
    ? `dash ${s.declared.map((v) => v.toFixed(2)).join('/')}`
    : s.solid
      ? 'solid'
      : s.motif
        ? `rhythm ${s.motif.map((v) => v.toFixed(2)).join('/')}`
        : 'irregular';
  return [m, w, dec].filter(Boolean).join(' ');
}

/** Cosine over the rhythm and decoration blocks only (no stroke width / fill): a legend sample
 * drawn as a declared dash and the same size drawn as filled dashes on the sheet still match. */
export function shapeCosine(a: Float64Array, b: Float64Array): number {
  const end = 2 * NB + 1 + DECOR_KINDS.length;
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < end; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return d / (Math.sqrt(na * nb) || 1);
}

/** Same width bucket (or both fill-only) — 1, else 0; for tie-breaking legend matches. */
export function sameStroke(a: Float64Array, b: Float64Array): number {
  const off = 2 * NB + 1 + DECOR_KINDS.length;
  for (let i = off; i < a.length; i++) if (a[i] > 0 && b[i] > 0) return 1;
  return 0;
}

/** Declared dash patterns of the same shape at another scale (reef: one size's dash prints
 * 9.63/1.03/0.34 on most tiles, 9.29/1.00/0.33 on some and 8.17/0.87/0.29 in the key). */
export function sameDashShape(a: number[], b: number[], scaleTol = 0.25, shapeTol = 0.1): boolean {
  if (a.length !== b.length || !a.length) return false;
  const sa = a.reduce((x, y) => x + y, 0);
  const sb = b.reduce((x, y) => x + y, 0);
  if (sa <= 0 || sb <= 0) return false;
  const r = sa / sb;
  if (r < 1 - scaleTol || r > 1 / (1 - scaleTol)) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] / sa;
    const y = b[i] / sb;
    if (Math.abs(x - y) > Math.max(0.012, shapeTol * Math.max(x, y))) return false;
  }
  return true;
}
