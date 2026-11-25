// REFERENCE SET — outlines the owner judged by eye on the review page (reference-export.ts), kept as
// points. A piece is found again by geometry, never by seed number or the bench's `geo` hash: both
// change with any code change, the outline on the sheet does not.
//
//   reference.json  = ReferencePiece[]   (built by reference-build.ts, checked by reference-check.ts)

export type P = { x: number; y: number };

export type ReferenceSize = {
  size: string;
  /** ok = the outline runs on the cut line; bad = it does not (the owner marked it). */
  verdict: 'ok' | 'bad';
  /** The outline the owner saw, flat [x0, y0, x1, y1, …] mm, closed implicitly. */
  outer: number[];
};

export type ReferencePiece = {
  /** Stable id from the pick list — the key of the owner's answer. */
  id: string;
  /** Shot dir the snapshot lives in, relative to the repo root (e.g. `.runs/snap-set40`). */
  root: string;
  /** Snapshot dir name substring. */
  file: string;
  label: string | null;
  group: string;
  note?: string;
  /** set: 'tune' rules may be fitted on it, 'confirm' only confirms (as set40 / holdout40). */
  set: 'tune' | 'confirm';
  sizes: ReferenceSize[];
};

export const unflat = (d: readonly number[]): P[] => {
  const out: P[] = [];
  for (let k = 0; k + 1 < d.length; k += 2) out.push({ x: d[k], y: d[k + 1] });
  return out;
};

export type Box = { x0: number; y0: number; x1: number; y1: number };
export const boxOf = (pts: readonly P[]): Box => {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of pts) {
    b.x0 = Math.min(b.x0, p.x);
    b.y0 = Math.min(b.y0, p.y);
    b.x1 = Math.max(b.x1, p.x);
    b.y1 = Math.max(b.y1, p.y);
  }
  return b;
};
/** Largest corner shift between two boxes — a cheap filter before the real distance. */
export const boxShift = (a: Box, b: Box) =>
  Math.max(
    Math.abs(a.x0 - b.x0),
    Math.abs(a.y0 - b.y0),
    Math.abs(a.x1 - b.x1),
    Math.abs(a.y1 - b.y1),
  );

/** Points every `step` mm along the closed ring. */
function sample(ring: readonly P[], step: number): P[] {
  const out: P[] = [];
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i < n; i++)
      out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  }
  return out;
}

/** Distance from p to the closed ring, mm. */
function toRing(p: P, ring: readonly P[]): number {
  let best = Infinity;
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    const d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    if (d < best) best = d;
  }
  return best;
}

/**
 * How far two closed outlines are apart, both ways: `max` is the Hausdorff distance (the worst
 * spot of either outline), `p95` the spread without a single stray corner.
 */
export function ringDistance(
  a: readonly P[],
  b: readonly P[],
  step = 1,
): { max: number; p95: number } {
  const ds = [
    ...sample(a, step).map((p) => toRing(p, b)),
    ...sample(b, step).map((p) => toRing(p, a)),
  ].sort((x, y) => x - y);
  return { max: ds[ds.length - 1] ?? Infinity, p95: ds[Math.floor(ds.length * 0.95)] ?? Infinity };
}
