// Intake marked on a waist edge, read from EVIDENCE alone — the same rule the paper doll folds
// by (lib/doll foldEvidence): pleats = two or more notch pairs of one width (± 3 mm or 15 %)
// 15–80 mm apart on one piece (a lone pair is a balance mark and never folds); darts = a maximal
// run of two or more short edges (< 35 mm, ≤ 130 mm in all) drawn in the outline that converges
// (its chord under half its length: a slit, a V) and touches a waist edge, spanning the notches
// within 15 mm on either side when the piece carries them (the dart's legs). What is folded is
// sewn away: the legs' waist seam is that much shorter than the WAIST edges laid flat — so a
// dart's intake counts only what lies on those edges (its slit, when the slit is not a waist
// edge, was never in the flat sum).

import type { Edge, PieceGeom } from 'lib/assembly-skeleton/types';

import { dist, first, last } from './geom';

export type WaistFold = {
  kind: 'pleat' | 'dart';
  /** Intake taken off the waist edges' flat length, mm. */
  mm: number;
  edge: string;
};

export function waistFolds(g: PieceGeom, waist: readonly Edge[]): WaistFold[] {
  const out: WaistFold[] = [];
  const waistIds = new Set(waist.map((e) => e.id));
  const ring = g.edges.filter((e) => e.kind === 'edge').sort((a, b) => a.k - b.k);
  const n = ring.length;
  // Pleats: notches along the waist ARC (consecutive waist edges in ring order joined end to
  // end), paired as they come — a pair may straddle two edges' joint.
  const pairs: { w: number; edge: string }[] = [];
  const arcs: { s: number; edge: string }[][] = [];
  let cur: { s: number; edge: string }[] | null = null;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const e = ring[i];
    if (!waistIds.has(e.id)) {
      if (cur) arcs.push(cur);
      cur = null;
      acc = 0;
      continue;
    }
    if (!cur) cur = [];
    for (const s of e.notchesMm) cur.push({ s: acc + s, edge: e.id });
    acc += e.lenMm;
  }
  if (cur) arcs.push(cur);
  // (a waist arc running over the ring's start: its two parts are joined)
  if (arcs.length >= 2 && waistIds.has(ring[0]?.id) && waistIds.has(ring[n - 1]?.id)) {
    const head = arcs.shift()!;
    const tail = arcs.pop()!;
    let tailLen = 0;
    for (let i = n - 1; i >= 0 && waistIds.has(ring[i].id); i--) tailLen += ring[i].lenMm;
    arcs.push([...tail, ...head.map((x) => ({ ...x, s: x.s + tailLen }))]);
  }
  for (const arc of arcs) {
    const ns = [...arc].sort((a, b) => a.s - b.s);
    for (let i = 0; i + 1 < ns.length; i++) {
      const d = ns[i + 1].s - ns[i].s;
      if (d >= 15 && d <= 80) {
        pairs.push({ w: d, edge: ns[i].edge });
        i++;
      }
    }
  }
  for (const p of pairs) {
    const alike = pairs.filter((q) => Math.abs(q.w - p.w) <= Math.max(3, 0.15 * p.w));
    if (alike.length >= 2) out.push({ kind: 'pleat', mm: p.w, edge: p.edge });
  }
  // Darts: MAXIMAL runs of short edges, read round the ring from a long edge so no run is cut
  // at the ring's start; a run over 130 mm is no dart at all.
  if (n >= 3) {
    const start = ring.findIndex((e) => e.lenMm >= 35);
    if (start >= 0) {
      let i = 0;
      while (i < n) {
        const e = ring[(start + i) % n];
        if (e.lenMm >= 35) {
          i++;
          continue;
        }
        let j = i;
        let total = 0;
        const run: Edge[] = [];
        while (j < n && ring[(start + j) % n].lenMm < 35) {
          run.push(ring[(start + j) % n]);
          total += ring[(start + j) % n].lenMm;
          j++;
        }
        const prev = ring[(start + i - 1 + n) % n];
        const next = ring[(start + j) % n];
        if (
          run.length >= 2 &&
          total <= 130 &&
          (waistIds.has(prev.id) || waistIds.has(next.id)) &&
          dist(first(run[0]), last(run[run.length - 1])) <= 0.5 * total
        ) {
          // Only what the waist edges' flat sum holds: slit edges that are waist edges, and the
          // legs running on to the notches beside the slit on the neighbouring waist edges.
          let mm = run.filter((x) => waistIds.has(x.id)).reduce((t, x) => t + x.lenMm, 0);
          if (waistIds.has(prev.id)) {
            const before = prev.notchesMm.filter((s) => prev.lenMm - s <= 15);
            if (before.length) mm += prev.lenMm - Math.min(...before);
          }
          if (waistIds.has(next.id)) {
            const after = next.notchesMm.filter((s) => s <= 15);
            if (after.length) mm += Math.max(...after);
          }
          if (mm > 0) out.push({ kind: 'dart', mm, edge: run.map((x) => x.id).join('+') });
        }
        i = Math.max(j, i + 1);
      }
    }
  }
  return out;
}

/** Sum of the folds, mm. */
export const foldedMm = (folds: readonly WaistFold[]) => folds.reduce((t, f) => t + f.mm, 0);

/** The folds in words: «2 pleats 25 + 25 mm, a dart 20 mm». */
export function foldWords(folds: readonly WaistFold[]): string {
  const pl = folds.filter((f) => f.kind === 'pleat');
  const da = folds.filter((f) => f.kind === 'dart');
  const part = (xs: WaistFold[], one: string, many: string) =>
    xs.length
      ? `${xs.length === 1 ? `a ${one}` : `${xs.length} ${many}`} ${xs.map((f) => f.mm.toFixed(0)).join(' + ')} mm`
      : '';
  return [part(pl, 'pleat', 'pleats'), part(da, 'dart', 'darts')].filter(Boolean).join(', ');
}
