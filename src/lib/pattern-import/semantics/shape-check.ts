// SHAPE (owner 16.10, card 49): one piece is ONE shape graded across sizes — every size carries the
// same features (notches, drills) and the same outline structure; only the dimensions change. This
// module measures a size's structure and compares the sizes of one family; the writer's gate uses it
// to hold a family whose sizes differ (D3: a question, never a silent pass).
//
// Corners: the cut line simplified at 0.4 mm, a vertex is a corner when the line turns there by more
// than CORNER_STRONG_DEG over ±CORNER_REACH_MM of line. Grading moves corners and bends curves a
// little, so the comparison uses hysteresis: a size whose STRONG corners outnumber another size's
// WEAK ones (turn > CORNER_WEAK_DEG) has a corner the other lacks — an extra bump, a notch cut into
// the line, a step.

import { simplify } from '../write/geom';
import type { PieceSizeSpec, PtMm } from '../types';

export const CORNER_STRONG_DEG = 60;
export const CORNER_WEAK_DEG = 25;
/** the turn at a vertex is measured between the line this far before and after it, mm */
export const CORNER_REACH_MM = 1.5;

export type SizeShape = {
  notches: number;
  drills: number;
  /** strong corners (turn > CORNER_STRONG_DEG) */
  corners: PtMm[];
  /** weak corners (turn > CORNER_WEAK_DEG), counted */
  weak: number;
  /** per scale × convex / concave: strong and weak turn counts (the comparison's input) */
  events: { key: string; strong: number; weak: number; at: PtMm[] }[];
};

/** The point `d` mm along the closed polyline from vertex i, forward (dir 1) or back (dir −1). */
function along(pts: readonly PtMm[], i: number, d: number, dir: 1 | -1): PtMm {
  const n = pts.length;
  let k = i;
  let left = d;
  for (let s = 0; s < n; s++) {
    const a = pts[k];
    const j = (k + dir + n) % n;
    const b = pts[j];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L >= left && L > 0)
      return { x: a.x + ((b.x - a.x) * left) / L, y: a.y + ((b.y - a.y) * left) / L };
    left -= L;
    k = j;
  }
  return pts[k];
}

/**
 * Signed turn angles (deg; > 0 = left turn on the counter-clockwise outline, i.e. convex) at each
 * vertex of the simplified closed outline, measured between the line `reach` mm before and after
 * it; local maxima at least 2·reach apart.
 */
export function turnsOf(
  outline: readonly PtMm[],
  reach = CORNER_REACH_MM,
): { at: PtMm; deg: number }[] {
  let pts = simplify(outline, true, 0.4);
  if (
    pts.length > 2 &&
    Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6
  )
    pts = pts.slice(0, -1);
  if (pts.length < 3) return [];
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    area += p.x * q.y - q.x * p.y;
  }
  if (area < 0) pts = [...pts].reverse();
  const out: { at: PtMm; deg: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = along(pts, i, reach, -1);
    const b = along(pts, i, reach, 1);
    const u = { x: p.x - a.x, y: p.y - a.y };
    const v = { x: b.x - p.x, y: b.y - p.y };
    const lu = Math.hypot(u.x, u.y);
    const lv = Math.hypot(v.x, v.y);
    if (lu < 1e-6 || lv < 1e-6) continue;
    const c = Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (lu * lv)));
    const sign = u.x * v.y - u.y * v.x >= 0 ? 1 : -1;
    out.push({ at: p, deg: (sign * Math.acos(c) * 180) / Math.PI });
  }
  // a corner turned over two close vertices counts once: keep local maxima 2·reach apart
  const keep: { at: PtMm; deg: number }[] = [];
  const order = out.map((_, i) => i).sort((x, y) => Math.abs(out[y].deg) - Math.abs(out[x].deg));
  for (const i of order) {
    const t = out[i];
    if (keep.some((k) => Math.hypot(k.at.x - t.at.x, k.at.y - t.at.y) < 2 * reach)) continue;
    keep.push(t);
  }
  return keep;
}

/**
 * Two scales: sharp corners (±1.5 mm, strong 60° / weak 25°) and notch-sized bends (±6 mm, strong
 * 45° / weak 20° — a smooth Ø 11 mm dip or bump turns well past 45° there, a garment curve of
 * radius ≥ 20 mm stays under 35°), each split into convex and concave events.
 */
const SCALES = [
  { reach: CORNER_REACH_MM, strong: CORNER_STRONG_DEG, weak: CORNER_WEAK_DEG },
  { reach: 6, strong: 45, weak: 20 },
] as const;

function eventsOf(cut: readonly PtMm[]): {
  corners: PtMm[];
  weak: number;
  events: { key: string; strong: number; weak: number; at: PtMm[] }[];
} {
  const events: { key: string; strong: number; weak: number; at: PtMm[] }[] = [];
  let corners: PtMm[] = [];
  let weak = 0;
  SCALES.forEach((sc, k) => {
    const t = turnsOf(cut, sc.reach);
    if (k === 0) {
      corners = t.filter((x) => Math.abs(x.deg) > sc.strong).map((x) => x.at);
      weak = t.filter((x) => Math.abs(x.deg) > sc.weak).length;
    }
    for (const sign of [1, -1]) {
      const own = t.filter((x) => x.deg * sign > 0);
      events.push({
        key: `${sc.reach}mm ${sign > 0 ? 'convex' : 'concave'}`,
        strong: own.filter((x) => Math.abs(x.deg) > sc.strong).length,
        weak: own.filter((x) => Math.abs(x.deg) > sc.weak).length,
        at: own.filter((x) => Math.abs(x.deg) > sc.strong).map((x) => x.at),
      });
    }
  });
  return { corners, weak, events };
}

/** The same, from a written block: its cut line and the counts read back from the file. */
export function shapeOfCut(cut: readonly PtMm[], notches: number, drills: number): SizeShape {
  return { notches, drills, ...eventsOf(cut) };
}

export function shapeOf(z: Pick<PieceSizeSpec, 'cut' | 'notches' | 'drills'>): SizeShape {
  return { notches: z.notches.length, drills: z.drills.length, ...eventsOf(z.cut) };
}

/**
 * SHAPE soft rule (coordinator 17.10): a difference in the cut line's TURN structure holds the
 * export; a notch / drill COUNT difference between sizes is a recorded warning (gate warn check,
 * manifest passport digest) unless this switch is on (GRADE P1's notch transfer will turn it on).
 */
export function countsHold(): boolean {
  // node probes: SHAPE_COUNTS_HOLD=1; the browser worker: the build flag VITE_SHAPE_COUNTS_HOLD=1
  if (typeof process !== 'undefined' && process.env?.SHAPE_COUNTS_HOLD) return true;
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.VITE_SHAPE_COUNTS_HOLD === '1';
}

/** The first notch / drill count difference between the sizes, or null. */
export function countMismatch(
  sh: readonly SizeShape[],
): { what: string; a: number; b: number } | null {
  for (let i = 1; i < sh.length; i++) {
    if (sh[i].notches !== sh[0].notches)
      return { what: `notches ${sh[0].notches}≠${sh[i].notches}`, a: 0, b: i };
    if (sh[i].drills !== sh[0].drills)
      return { what: `drills ${sh[0].drills}≠${sh[i].drills}`, a: 0, b: i };
  }
  return null;
}

/**
 * The first turn-structure difference: a size with more strong events of one kind (scale ×
 * convex / concave) than another size has weak ones. Indices are into the given array.
 */
export function turnMismatch(
  sh: readonly SizeShape[],
): { what: string; a: number; b: number; at?: PtMm[] } | null {
  for (let i = 0; i < sh.length; i++)
    for (let j = 0; j < sh.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < sh[i].events.length; k++) {
        const a = sh[i].events[k];
        const b = sh[j].events[k];
        if (b && a.strong > b.weak)
          return { what: `corners ${a.key} ${a.strong}>${b.weak}`, a: i, b: j, at: a.at };
      }
    }
  return null;
}

/** Either difference, counts first (the probe's single summary). */
export function shapeMismatch(
  sh: readonly SizeShape[],
): { what: string; a: number; b: number; at?: PtMm[] } | null {
  return countMismatch(sh) ?? turnMismatch(sh);
}

/**
 * The same notes from what the file holds: the manifest's blocks (identity, size token, notch and
 * drill counts as written). UNI blocks are one geometry for every size and are skipped.
 */
export function countNotesOfBlocks(
  blocks: readonly {
    identity: string;
    sizeToken: string;
    notches: number;
    drills: number;
    internal?: number;
    notchesGraded?: number;
  }[],
  uniToken = 'UNI',
  /** GRADE P1: per identity, the count kinds the operator answered "intended" */
  intendedOf: (identity: string) => readonly string[] | undefined = () => undefined,
): { identity: string; note: string }[] {
  const by = new Map<string, (typeof blocks)[number][]>();
  for (const b of blocks) {
    if (b.sizeToken === uniToken) continue;
    by.set(b.identity, [...(by.get(b.identity) ?? []), b]);
  }
  const out: { identity: string; note: string }[] = [];
  for (const [identity, bs] of by) {
    if (bs.length < 2) continue;
    const intended = new Set(intendedOf(identity) ?? []);
    const parts: string[] = [];
    const yes: string[] = [];
    for (const k of ['notches', 'drills', 'internal'] as const) {
      const v = (b: (typeof bs)[number]) => b[k] ?? 0;
      if (!bs.some((b) => v(b) !== v(bs[0]))) continue;
      const line = `${k}: ${bs.map((b) => `${b.sizeToken} ${v(b)}`).join(', ')}`;
      if (intended.has(k)) yes.push(line);
      // internal lines: recorded only when the operator answered (the gate counts notches / drills)
      else if (k !== 'internal') parts.push(line);
    }
    if (parts.length) out.push({ identity, note: `${parts.join('; ')} — one piece, one shape` });
    if (yes.length) out.push({ identity, note: `${yes.join('; ')} — intended (operator)` });
    // GRADE P1 (D5): notches placed from the sizes that draw them
    const g = bs.filter((b) => (b.notchesGraded ?? 0) > 0);
    if (g.length)
      out.push({
        identity,
        note: `notches graded (not drawn): ${g.map((b) => `${b.sizeToken} ${b.notchesGraded}`).join(', ')}`,
      });
  }
  return out;
}

/**
 * Per piece whose sizes differ in notch / drill counts: "notches: XS 1, S 2, M 2 — one piece, one
 * shape" (drills likewise) — the warning the manifest carries.
 */
export function countNotes(
  pieces: readonly {
    identity: string;
    ungraded: boolean;
    sizes: readonly {
      sizeToken: string;
      notches: readonly unknown[];
      drills: readonly unknown[];
    }[];
  }[],
): { identity: string; note: string }[] {
  const out: { identity: string; note: string }[] = [];
  for (const p of pieces) {
    if (p.ungraded || p.sizes.length < 2) continue;
    const parts: string[] = [];
    for (const k of ['notches', 'drills'] as const) {
      const n = p.sizes.map((z) => z[k].length);
      if (n.some((v) => v !== n[0]))
        parts.push(`${k}: ${p.sizes.map((z, i) => `${z.sizeToken} ${n[i]}`).join(', ')}`);
    }
    if (parts.length)
      out.push({ identity: p.identity, note: `${parts.join('; ')} — one piece, one shape` });
  }
  return out;
}
