// Zero-width out-and-back spikes on a closed outline (F14 follow-up, HARD-SIZES finding).
//
// A spike is a stretch of the ring that leaves a point and comes back along itself: reef HB_4XL's
// snapped outline overshoots a corner by 0.57 mm and returns (…, p, tip, p, …); a raster trace
// that wanders up a bundle of internal lines and back writes a needle many mm long. Either way the
// enclosed area is ~0, and in a DXF it is a needle on the cutting line — a knife cut into the
// fabric that no pattern draws. `stripSpikes` removes them (in semantics, from every candidate outline
// before fold and offset — a traced scan outline is made simple there by its own union — and again
// in the writer); `findSpikes` names any that remain (gate G4 blocks on them).
//
// The test is local and iterated, so a spike of ANY length peels away tip by tip: at a vertex v
// with neighbours a, c (the nearest ones farther than `widthMm` from v — a flat tip of two
// vertices 0.02 mm apart is one tip) the path turns back by at least `turnDeg`, and the end of the
// shorter leg lies within `widthMm` of the longer leg. Removing v leaves a → c, which runs back
// along a → v; the next tip is then a or c, and so on until the ring no longer folds back. A real
// narrow V (a notch, a dart, a zig-zag edge — corpus: polupalto's cuff zig-zag 0.43 mm wide, its
// pocket V 0.59 mm, leonie's 0.14 mm) has width > `widthMm` and is kept.
import type { PtMm } from './types';

/** A fold-back narrower than this (mm) is a spike. Corpus spikes: 0.000–0.013 mm wide. */
export const SPIKE_WIDTH_MM = 0.05;
/** …and it turns back by at least this much (deg) at its tip. */
export const SPIKE_TURN_DEG = 150;
/**
 * Gate (G4): a written ring blocks when it still folds back by ≥ 175° within this width (mm) —
 * twice the strip width, so a needle the strip somehow left can never pass silently.
 */
export const SPIKE_GATE_WIDTH_MM = 0.1;
export const SPIKE_GATE_TURN_DEG = 175;

const d2 = (a: PtMm, b: PtMm) => Math.hypot(b.x - a.x, b.y - a.y);

function segDist(p: PtMm, a: PtMm, b: PtMm): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = dx * dx + dy * dy;
  const t = l > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export type Spike = { at: PtMm; turnDeg: number; widthMm: number };

/** The fold-back at v between a and c, or null when the ring does not fold back there. */
function foldAt(a: PtMm, v: PtMm, c: PtMm, widthMm: number, turnDeg: number): Spike | null {
  const l1 = d2(a, v);
  const l2 = d2(v, c);
  if (!(l1 > 0) || !(l2 > 0)) return null;
  const cos = ((v.x - a.x) * (c.x - v.x) + (v.y - a.y) * (c.y - v.y)) / (l1 * l2);
  if (!(cos <= Math.cos((turnDeg * Math.PI) / 180))) return null;
  const width = l2 <= l1 ? segDist(c, a, v) : segDist(a, v, c);
  if (!(width <= widthMm)) return null;
  return {
    at: v,
    turnDeg: (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI,
    widthMm: width,
  };
}

/** Drop a closing duplicate; the ring is handled without it and returned the same way. */
function open(ring: readonly PtMm[]): { pts: PtMm[]; dup: boolean } {
  const pts = ring.slice();
  const dup = pts.length > 1 && d2(pts[0], pts[pts.length - 1]) <= 1e-9;
  if (dup) pts.pop();
  return { pts, dup };
}

/**
 * The ring without its zero-width spikes (closed ring, closing duplicate kept as given), and how
 * many tips were removed. Consecutive duplicates left behind are merged. Never shrinks a ring
 * below 3 vertices.
 */
export function stripSpikes(
  ring: readonly PtMm[],
  widthMm = SPIKE_WIDTH_MM,
  turnDeg = SPIKE_TURN_DEG,
): { ring: PtMm[]; spikes: number } {
  const { pts: P, dup } = open(ring);
  const n = P.length;
  if (n < 4) return { ring: ring.slice(), spikes: 0 };
  const next = Array.from({ length: n }, (_, i) => (i + 1) % n);
  const prev = Array.from({ length: n }, (_, i) => (i - 1 + n) % n);
  const alive = new Array<boolean>(n).fill(true);
  let count = n;
  const work: number[] = [];
  const queued = new Array<boolean>(n).fill(true);
  for (let i = n - 1; i >= 0; i--) work.push(i);
  let spikes = 0;
  const far = (v: number, step: number[]) => {
    let x = step[v];
    for (let k = 0; x !== v && k < count && d2(P[x], P[v]) <= widthMm; k++) x = step[x];
    return x;
  };
  while (work.length && count > 3) {
    const v = work.pop()!;
    queued[v] = false;
    if (!alive[v]) continue;
    const a = far(v, prev);
    const c = far(v, next);
    if (a === v || c === v || a === c || !alive[a] || !alive[c]) continue;
    if (!foldAt(P[a], P[v], P[c], widthMm, turnDeg)) continue;
    // v and the near vertices on either side of it go; a → c runs back along a → v
    let gone = 0;
    for (let x = next[a]; x !== c; x = next[x]) gone++;
    if (count - gone < 3) break;
    for (let x = next[a]; x !== c; ) {
      const nx = next[x];
      alive[x] = false;
      x = nx;
    }
    count -= gone;
    next[a] = c;
    prev[c] = a;
    spikes++;
    for (const y of [a, c])
      if (!queued[y]) {
        queued[y] = true;
        work.push(y);
      }
  }
  if (!spikes) return { ring: ring.slice(), spikes: 0 };
  let start = 0;
  while (!alive[start]) start++;
  const out: PtMm[] = [];
  let x = start;
  do {
    if (!out.length || d2(out[out.length - 1], P[x]) > 1e-9) out.push(P[x]);
    x = next[x];
  } while (x !== start);
  if (out.length > 1 && d2(out[0], out[out.length - 1]) <= 1e-9) out.pop();
  if (dup) out.push(out[0]);
  return { ring: out, spikes };
}

/** Every vertex of the closed ring where it folds back on itself (the gate's test). */
export function findSpikes(
  ring: readonly PtMm[],
  widthMm = SPIKE_GATE_WIDTH_MM,
  turnDeg = SPIKE_GATE_TURN_DEG,
): Spike[] {
  const { pts: P } = open(ring);
  const n = P.length;
  if (n < 3) return [];
  const out: Spike[] = [];
  for (let v = 0; v < n; v++) {
    let a = (v - 1 + n) % n;
    for (let k = 0; a !== v && k < n && d2(P[a], P[v]) <= widthMm; k++) a = (a - 1 + n) % n;
    let c = (v + 1) % n;
    for (let k = 0; c !== v && k < n && d2(P[c], P[v]) <= widthMm; k++) c = (c + 1) % n;
    if (a === v || c === v || a === c) continue;
    const s = foldAt(P[a], P[v], P[c], widthMm, turnDeg);
    if (s) out.push(s);
  }
  return out;
}
