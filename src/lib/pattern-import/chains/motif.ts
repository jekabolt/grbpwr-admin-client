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
const DECOR_KINDS = ['tick', 'ring', 'ringL', 'dot'] as const;
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
};

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
  for (const l of items) if (l.it.kind !== 'bead') byStyle.set(l.it.style, (byStyle.get(l.it.style) ?? 0) + l.it.len);
  let bk: number | null = null;
  let bl = -1;
  for (const [s, L] of byStyle)
    if (L > bl) {
      bl = L;
      bk = s;
    }
  const backbone = bk === null ? null : styles.get(bk) ?? null;
  const declared = backbone?.dash && backbone.dash.some((v) => v > 0.01) ? normDash(backbone.dash) : null;

  // piece lengths and gaps along the chain (oriented end → start of the next)
  let prevEnd = null as null | { x: number; y: number };
  const rawGaps: number[] = [];
  for (let k = 0; k < items.length; k++) {
    const pts = linkPts(items[k]);
    const len = items[k].it.kind === 'bead' ? items[k].it.len : items[k].it.len;
    if (prevEnd) rawGaps.push(dist(prevEnd, pts[0]) - (items[k].it.kind === 'bead' ? items[k].it.len / 2 : 0));
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

  const decorPer10 = { tick: 0, ring: 0, ringL: 0, dot: 0 };
  // beads inside the chain itself (palto's dots are subpaths) count as pieces; free beads as decor
  const kindOf = (it: { bead?: string; size?: number }) =>
    (it.bead === 'ring' && (it.size ?? 0) >= 1.6 ? 'ringL' : it.bead ?? 'dot') as (typeof DECOR_KINDS)[number];
  for (const d of ch.decor) decorPer10[kindOf(d)] += 1;
  for (const l of items) if (l.it.kind === 'bead') decorPer10[kindOf(l.it)] += 1;
  for (const k of DECOR_KINDS) decorPer10[k] = lengthMm > 0 ? (10 * decorPer10[k]) / lengthMm : 0;

  const V = new Float64Array(2 * NB + 1 + DECOR_KINDS.length + NW + 1);
  const offG = NB;
  const offS = 2 * NB;
  const offD = offS + 1;
  const offW = offD + DECOR_KINDS.length;
  if (declared) {
    for (let i = 0; i < declared.length; i += 2) {
      addHist(V, 0, declared[i]);
      addHist(V, offG, declared[i + 1] ?? 0);
    }
  } else {
    for (const x of innerPieces) addHist(V, 0, Math.min(x, NB * BIN - BIN));
    for (const x of gaps) addHist(V, offG, Math.min(x, NB * BIN - BIN));
    if (solid) V[offS] = 1;
  }
  DECOR_KINDS.forEach((k, i) => (V[offD + i] = Math.min(3, decorPer10[k])));
  if (backbone) {
    const fillDash = backbone.fill && backbone.widthMm === 0;
    if (fillDash) V[offW + NW] = 1;
    else V[offW + Math.min(NW - 1, Math.round(backbone.widthMm / 0.05))] = 1;
  }
  normBlock(V, 0, NB, 1);
  normBlock(V, offG, 2 * NB, 1);
  normBlock(V, offD, offD + DECOR_KINDS.length, 0.8);
  normBlock(V, offW, offW + NW + 1, 0.6);
  const reliable = !!declared || (solid ? lengthMm >= 15 : innerPieces.length >= 3 && lengthMm >= 12);
  const motif = declared ? declared.map(q) : solid ? null : recoverMotif(merged.slice(1), gaps.slice(1));
  return { vec: V, pieces: innerPieces, gaps, decorPer10, solid, declared, reliable, motif, backbone };
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
  const w = s.backbone ? (s.backbone.fill && s.backbone.widthMm === 0 ? 'fill' : `w${s.backbone.widthMm.toFixed(2)}`) : '';
  const dec = Object.entries(s.decorPer10)
    .filter(([, v]) => v > 0.3)
    .map(([k, v]) => `${k}/${(10 / v).toFixed(1)}mm`)
    .join(' ');
  const m = s.declared ? `dash ${s.declared.map((v) => v.toFixed(2)).join('/')}` : s.solid ? 'solid' : s.motif ? `rhythm ${s.motif.map((v) => v.toFixed(2)).join('/')}` : 'irregular';
  return [m, w, dec].filter(Boolean).join(' ');
}
