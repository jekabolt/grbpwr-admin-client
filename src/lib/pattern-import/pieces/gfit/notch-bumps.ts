// pieces/gfit · GRADE P1 (owner: an arc / semicircle / V notch drawn AS the outline is a notch, never
// outline geometry): a notch-shaped in/out stretch of one size's drawn line — 1–8 mm deep, mouth ≤
// 15 mm, both legs on the chord's line (outline.ts excursionsOf; looser semicircles and slits:
// bumpSpans) — is cut off by its chord and becomes a notch mark at the chord, ONLY with a second
// evidence (D3): the same bump at a grade-consistent place on the piece's canonical topology in EVERY
// size (notch-grade.ts tracks). A bump in some sizes only stays as drawn (the G5 turn check asks).
// Pure, mm. The chord and the bump it replaced go to the gate (G3/G4 measure the drawn line, which
// still carries the bump) as `NotchChord`s.
import type { PtMm } from 'lib/pattern-import/types';
import { dist, signedArea } from 'lib/pattern-import/pieces/geom';

import { gradeNotches } from './notch-grade';
import { analyseOutline, bumpSpans, EXC_DEPTH_MAX_MM, EXC_DEPTH_MIN_MM } from './outline';

export type NotchBump = {
  /** chord ends ON the drawn line, in its order (CCW ring) */
  p: PtMm;
  q: PtMm;
  /** the drawn stretch p → q (the bump) */
  bump: PtMm[];
  /** signed depth from the chord: + outward (a bump), − inward (a dip) */
  depth: number;
  /** chord middle (the notch's place) and the unit normal pointing into the piece */
  at: PtMm;
  inward: PtMm;
};

/** The chord and the drawn bump it replaced (gate: the bump's walls are no longer the line). */
export type NotchChord = { chord: [PtMm, PtMm]; bump: PtMm[] };

/** Notch-shaped stretches of one drawn line (CCW resampled ring), excursions first. */
export function bumpsOf(outer: readonly PtMm[]): NotchBump[] {
  const o = analyseOutline(outer);
  if (!o) return [];
  const r = o.raw;
  const n = r.length;
  const spans: [number, number][] = o.excursions.map((e) => [e.i0, e.i0 + ((e.i1 - e.i0 + n) % n)]);
  const taken = (a: number, b: number) =>
    spans.some(([x, y]) => {
      for (let i = a; i <= b; i++) {
        const j = ((i % n) + n) % n;
        const off = (((j - x) % n) + n) % n;
        if (off <= y - x) return true;
      }
      return false;
    });
  for (const [a, b] of bumpSpans(r)) if (!taken(a, b)) spans.push([a, b]);
  const out: NotchBump[] = [];
  for (const [a, b] of spans) {
    const P = r[((a % n) + n) % n];
    const Q = r[((b % n) + n) % n];
    const L = dist(P, Q);
    const bump: PtMm[] = [];
    for (let i = a; i <= b; i++) bump.push(r[((i % n) + n) % n]);
    // depth from the chord (left of P→Q = inside of a CCW ring)
    let dmax = 0;
    const ux = L > 1e-9 ? (Q.x - P.x) / L : 0;
    const uy = L > 1e-9 ? (Q.y - P.y) / L : 0;
    for (const t of bump) {
      const d = (t.x - P.x) * -uy + (t.y - P.y) * ux;
      if (Math.abs(d) > Math.abs(dmax)) dmax = d;
    }
    const depth = -dmax;
    if (Math.abs(depth) < EXC_DEPTH_MIN_MM || Math.abs(depth) > EXC_DEPTH_MAX_MM) continue;
    // a slit (no mouth) has no chord direction: the inward normal of the line around it
    let inward = { x: -uy, y: ux };
    if (L < 0.5) {
      const A = r[(((a - 6) % n) + n) % n];
      const B = r[(b + 6) % n];
      const l = dist(A, B) || 1;
      inward = { x: -(B.y - A.y) / l, y: (B.x - A.x) / l };
    }
    out.push({ p: P, q: Q, bump, depth, at: { x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 }, inward });
  }
  return out;
}

/**
 * One family's sizes (any order): per size index, the bumps that are notches — the same bump at a
 * grade-consistent place in every size (a graded series of one drawn notch).
 */
export function notchBumpSeries(
  sizes: readonly { rank: number; token: string; outer: readonly PtMm[] }[],
): Map<number, NotchBump[]> {
  const out = new Map<number, NotchBump[]>();
  if (sizes.length < 2) return out;
  const rings = sizes.map((s) => (signedArea(s.outer) < 0 ? [...s.outer].reverse() : [...s.outer]));
  const bumps = rings.map((r) => bumpsOf(r));
  if (bumps.filter((b) => b.length).length < 2) return out;
  // place every bump by its chord middle on the canonical topology; a track of ≥ 2 sizes at a
  // grade-consistent place is one notch drawn as outline in each of them
  const g = gradeNotches(
    sizes.map((s, k) => ({
      rank: s.rank,
      token: s.token,
      ring: rings[k],
      notches: bumps[k].map((b) => ({ at: b.at, depthMm: Math.abs(b.depth) })),
    })),
    -1,
  );
  if (!g.ok) return out;
  for (const t of g.tracks) {
    // EVERY size draws it (a bump in some sizes only is not proven a notch — r4454 P08: 2 of 6 sizes,
    // polupalto CUF: the two extreme sizes only; crossing those would invent a notch in all of them)
    if (!t.consistent || t.members.length < sizes.length) continue;
    // one sign: a bump out in some sizes and a dip in others is not one notch's copies
    const signs = new Set(t.members.map((m) => Math.sign(bumps[m.k][m.n].depth)));
    if (signs.size > 1) continue;
    for (const m of t.members) out.set(m.k, [...(out.get(m.k) ?? []), bumps[m.k][m.n]]);
  }
  return out;
}

/** The drawn line with each bump replaced by its chord (the line's own vertices elsewhere). */
export function chordAcross(outer: readonly PtMm[], bumps: readonly NotchBump[]): PtMm[] {
  let ring = signedArea(outer) < 0 ? [...outer].reverse() : [...outer];
  for (const b of bumps) {
    const n = ring.length;
    // the ring's parameter of p and q (nearest segment), then drop everything strictly between
    const near = (x: PtMm) => {
      let best = { i: 0, t: 0, d: Infinity };
      for (let i = 0; i < n; i++) {
        const A = ring[i];
        const B = ring[(i + 1) % n];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const L2 = dx * dx + dy * dy;
        const t =
          L2 > 1e-12 ? Math.max(0, Math.min(1, ((x.x - A.x) * dx + (x.y - A.y) * dy) / L2)) : 0;
        const d = Math.hypot(A.x + dx * t - x.x, A.y + dy * t - x.y);
        if (d < best.d) best = { i, t, d };
      }
      return best;
    };
    const a = near(b.p);
    const c = near(b.q);
    if (a.d > 0.5 || c.d > 0.5) continue;
    // walk forward from p to q (the bump runs p → q on the CCW ring); refuse a walk longer than
    // the bump itself (it would be the rest of the piece)
    const res: PtMm[] = [];
    let k = (c.i + 1) % n;
    // keep q → … → p (everything outside the bump), then the chord p → q closes it
    res.push(b.q);
    let walked = 0;
    for (let s = 0; s < n; s++) {
      res.push(ring[k]);
      if (k === a.i) break;
      k = (k + 1) % n;
      walked++;
    }
    res.push(b.p);
    // the dropped part (p → q forward) must be the short way
    const kept = walked + 1;
    if (n - kept > b.bump.length * 4 + 8) continue;
    ring = res;
  }
  return ring;
}
