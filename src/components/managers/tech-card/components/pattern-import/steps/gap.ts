// The gap a leaking outline ran out through (pure geometry, no React): the pieces step's one-click
// "close the gap" and the scripts that measure it read the same function.
import type { PtMm } from 'lib/pattern-import/types';

/** Each drawn line's box (minX, minY, maxX, maxY per chain), once per previews array. */
const BOXES = new WeakMap<readonly Float32Array[], Float32Array>();
export function chainBoxes(previews: readonly Float32Array[]): Float32Array {
  let b = BOXES.get(previews);
  if (b) return b;
  b = new Float32Array(previews.length * 4);
  previews.forEach((a, i) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k + 1 < a.length; k += 2) {
      x0 = Math.min(x0, a[k]);
      x1 = Math.max(x1, a[k]);
      y0 = Math.min(y0, a[k + 1]);
      y1 = Math.max(y1, a[k + 1]);
    }
    b!.set([x0, y0, x1, y1], i * 4);
  });
  BOXES.set(previews, b);
  return b;
}

/** Where an outline is open: the two line ends either side of the gap, and the line each ends. */
export type GapGuess = {
  from: PtMm;
  to: PtMm;
  /** The gap's width, mm. */
  mm: number;
  /** Both ends point at each other (a line broken in two, not two lines passing). */
  facing: boolean;
  /** The lines that end there (index = ChainId). */
  chains: number[];
};

/**
 * The gap the fill ran out through: the open line ends round the ring (`at`), paired nearest
 * first — two ends that point at each other before two that only lie close.
 */
export function findGap(
  at: PtMm,
  previews: readonly Float32Array[],
  skip: ReadonlySet<number> = new Set(),
  reach = 40,
  /** Only the ends of these lines (the leaking outline's own walls). */
  only?: ReadonlySet<number>,
): GapGuess | null {
  const bx = chainBoxes(previews);
  type End = { p: PtMm; d: PtMm; chain: number };
  const ends: End[] = [];
  previews.forEach((a, i) => {
    if (skip.has(i) || a.length < 4 || (only && !only.has(i))) return;
    if (bx[i * 4] > at.x + reach || bx[i * 4 + 2] < at.x - reach) return;
    if (bx[i * 4 + 1] > at.y + reach || bx[i * 4 + 3] < at.y - reach) return;
    const n = a.length;
    if (Math.hypot(a[0] - a[n - 2], a[1] - a[n - 1]) <= 0.5) return;
    // each end and the way the line runs out of it (over its last few mm)
    const dirAt = (k: number, back: number) => {
      let j = k;
      while (j !== back && Math.hypot(a[j] - a[k], a[j + 1] - a[k + 1]) < 3) j += k < back ? 2 : -2;
      const dx = a[k] - a[j];
      const dy = a[k + 1] - a[j + 1];
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    };
    for (const [k, back] of [
      [0, n - 2],
      [n - 2, 0],
    ]) {
      const p = { x: a[k], y: a[k + 1] };
      if (Math.hypot(p.x - at.x, p.y - at.y) <= reach)
        ends.push({ p, d: dirAt(k, back), chain: i });
    }
  });
  let best: (GapGuess & { score: number }) | null = null;
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) {
      const A = ends[i];
      const B = ends[j];
      const dx = B.p.x - A.p.x;
      const dy = B.p.y - A.p.y;
      const mm = Math.hypot(dx, dy);
      if (mm < 0.05) continue;
      const facing = (A.d.x * dx + A.d.y * dy) / mm > 0.7 && (B.d.x * -dx + B.d.y * -dy) / mm > 0.7;
      // the gap lies at the ring: its middle near where the fill got out
      const mid = Math.hypot((A.p.x + B.p.x) / 2 - at.x, (A.p.y + B.p.y) / 2 - at.y);
      const score = (mm + mid * 0.5) * (facing ? 1 : 2.5);
      if (!best || score < best.score)
        best = { from: A.p, to: B.p, mm, facing, chains: [...new Set([A.chain, B.chain])], score };
    }
  if (!best) return null;
  const { score: _s, ...g } = best;
  void _s;
  return g;
}
