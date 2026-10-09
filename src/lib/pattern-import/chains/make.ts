// chains/ (F3) — working chains → contract Chains (+ their signatures, kept on the side).
import type { Chain, ChainOpts, Sheet, Style } from 'lib/pattern-import/types';

import { polyLen, simplify } from './geom';
import { linkItems, linkPts, rangesOf, type WChain } from './link';
import { signatureOf, type Signature } from './motif';

export type ChainBuild = {
  chains: Chain[];
  sigs: Signature[];
  work: WChain[];
  stats: { items: number; freeBeads: number; ignoredPaths: number };
};

/** Simplification of a chain polyline: removes dot centres' jitter, keeps curves within 0.08 mm. */
export const SIMPLIFY_MM = 0.08;

/** ≥ half of the in-chain beads touch both neighbours (gap < 0.05 mm): a saw-tooth line. */
export function isZigzag(ch: WChain): boolean {
  let beads = 0;
  let glued = 0;
  for (let k = 1; k + 1 < ch.items.length; k++) {
    if (ch.items[k].it.kind !== 'bead' || ch.items[k].it.bead !== 'tick') continue;
    beads++;
    const a = linkPts(ch.items[k - 1]);
    const b = linkPts(ch.items[k + 1]);
    const t = ch.items[k].it.pts;
    const ae = a[a.length - 1];
    const bs = b[0];
    const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    const t0 = t[0];
    const t1 = t[t.length - 1];
    if ((d(ae, t0) < 0.05 && d(t1, bs) < 0.05) || (d(ae, t1) < 0.05 && d(t0, bs) < 0.05)) glued++;
  }
  return beads >= 4 && glued >= beads / 2;
}

function zigzagPts(strokes: WChain['items']): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  strokes.forEach((l, k) => {
    const p = linkPts(l);
    if (k === 0) out.push(p[0]);
    const a = p[0];
    const b = p[p.length - 1];
    out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    if (k === strokes.length - 1) out.push(b);
  });
  return out;
}

export function makeChains(sheet: Sheet, opts: ChainOpts): ChainBuild {
  const styles = new Map<number, Style>(sheet.styles.map((s) => [s.id, s]));
  const res = linkItems(sheet, opts);
  const chains: Chain[] = [];
  const sigs: Signature[] = [];
  const work: WChain[] = [];
  for (const ch of res.chains) {
    // Beads (dots, cross ticks) carry rhythm, not geometry: a tick's centre sits half a tick off
    // the line. The line is drawn through the strokes; a chain of beads only keeps their centres.
    // Zigzag lines (palto «dashdot»: 3 mm strokes joined end-to-end by 0.37 mm cross ticks) are a
    // saw-tooth around the true line: there the line runs through the strokes' MIDPOINTS.
    const strokes = ch.items.filter((l) => l.it.kind !== 'bead');
    const raw = !strokes.length
      ? ch.items.flatMap(linkPts)
      : isZigzag(ch)
        ? zigzagPts(strokes)
        : strokes.flatMap(linkPts);
    const dedup = raw.filter((p, i) => i === 0 || Math.abs(p.x - raw[i - 1].x) + Math.abs(p.y - raw[i - 1].y) > 1e-6);
    if (dedup.length < 2) continue;
    const pts = simplify(dedup, SIMPLIFY_MM);
    const lengthMm = polyLen(pts);
    if (lengthMm < 0.5) continue;
    const sig = signatureOf(ch, styles, lengthMm);
    const first = pts[0];
    const last = pts[pts.length - 1];
    const closed = pts.length > 3 && Math.hypot(first.x - last.x, first.y - last.y) < 0.05;
    chains.push({
      id: chains.length,
      pts,
      closed,
      ranges: rangesOf(ch),
      motif: sig.motif,
      style: sig.backbone?.id ?? ch.items[0].it.style,
      lengthMm,
    });
    sigs.push(sig);
    work.push(ch);
  }
  return { chains, sigs, work, stats: { items: res.items, freeBeads: res.freeBeads, ignoredPaths: res.ignoredPaths } };
}
