// Intake marked on a waist edge, read from EVIDENCE alone — the same rule the paper doll folds
// by (lib/doll foldEvidence): pleats = two or more notch pairs of one width (± 3 mm or 15 %)
// 15–80 mm apart on one piece (a lone pair is a balance mark and never folds); darts = a run of two
// or more short edges (< 35 mm, ≤ 130 mm in all) drawn in the outline that converges (its chord
// under half its length: a slit, a V) and touches a waist edge, spanning the notches within 15 mm
// on either side when the piece carries them (the dart's legs). What is folded is sewn away: the
// legs' waist seam is that much shorter than the edges laid flat.

import type { Edge, PieceGeom } from 'lib/assembly-skeleton/types';

import { dist, first, last } from './geom';

export type WaistFold = { kind: 'pleat' | 'dart'; mm: number; edge: string };

export function waistFolds(g: PieceGeom, waist: readonly Edge[]): WaistFold[] {
  const out: WaistFold[] = [];
  const waistIds = new Set(waist.map((e) => e.id));
  // Pleats: notch pairs along the waist edges, consumed in pairs as they come.
  const pairs: { w: number; edge: string }[] = [];
  for (const e of waist) {
    const ns = [...e.notchesMm].sort((a, b) => a - b);
    for (let i = 0; i + 1 < ns.length; i++) {
      const d = ns[i + 1] - ns[i];
      if (d >= 15 && d <= 80) {
        pairs.push({ w: d, edge: e.id });
        i++;
      }
    }
  }
  for (const p of pairs) {
    const alike = pairs.filter((q) => Math.abs(q.w - p.w) <= Math.max(3, 0.15 * p.w));
    if (alike.length >= 2) out.push({ kind: 'pleat', mm: p.w, edge: p.edge });
  }
  // Darts: runs of short edges in ring order, next to a waist edge.
  const ring = g.edges.filter((e) => e.kind === 'edge').sort((a, b) => a.k - b.k);
  const n = ring.length;
  if (n >= 3) {
    let i = 0;
    while (i < n) {
      if (ring[i].lenMm >= 35) {
        i++;
        continue;
      }
      let j = i;
      let total = 0;
      while (j < n && ring[j].lenMm < 35 && total + ring[j].lenMm <= 130) {
        total += ring[j].lenMm;
        j++;
      }
      const run = ring.slice(i, j);
      const prev = ring[(i - 1 + n) % n];
      const next = ring[j % n];
      if (
        run.length >= 2 &&
        (waistIds.has(prev.id) || waistIds.has(next.id)) &&
        dist(first(run[0]), last(run[run.length - 1])) <= 0.5 * total
      ) {
        let mm = total;
        // The dart's legs run on to the notches just beside the slit.
        const before = prev.notchesMm.filter((s) => prev.lenMm - s <= 15);
        if (before.length) mm += prev.lenMm - Math.min(...before);
        const after = next.notchesMm.filter((s) => s <= 15);
        if (after.length) mm += Math.max(...after);
        out.push({ kind: 'dart', mm, edge: run.map((e) => e.id).join('+') });
      }
      i = Math.max(j, i + 1);
    }
  }
  return out;
}

/** Sum of the folds, mm. */
export const foldedMm = (folds: readonly WaistFold[]) => folds.reduce((t, f) => t + f.mm, 0);

/** The folds in words: «2 pleats 25 + 25, a dart 38 mm». */
export function foldWords(folds: readonly WaistFold[]): string {
  const pl = folds.filter((f) => f.kind === 'pleat');
  const da = folds.filter((f) => f.kind === 'dart');
  const part = (xs: WaistFold[], one: string, many: string) =>
    xs.length
      ? `${xs.length === 1 ? `a ${one}` : `${xs.length} ${many}`} ${xs.map((f) => f.mm.toFixed(0)).join(' + ')} mm`
      : '';
  return [part(pl, 'pleat', 'pleats'), part(da, 'dart', 'darts')].filter(Boolean).join(', ');
}
