/**
 * Continuity's missing axis: grade ORDER (open-lines journal, 15 Nov).
 *
 * `continuityVerdicts` judges a continuity closure by shape alone — area growth, Hausdorff, Hu,
 * perimeter/√area — and its Hausdorff allowance grows with the steps to the nearest anchor (98 mm at
 * 4 steps). Far from an anchor it accepts nearly any outline of the right shape, even one walked
 * along a size several steps away: Taos G 0's waist ran on ring 16, past 2…14, and the concave waist
 * made it the SMALLER area, so growth passed too. Tightening hAllow is the wrong fix; this adds the
 * axis it lacks: along the outline, size r must lie between its closed neighbours r−1 and r+1
 * (an end size: not past r±1 towards r±2).
 *
 * Neighbours are cells closed by anything but continuity, so two wrong continuity closures cannot
 * vouch for each other. Where the two neighbour lines lie within `minGapMm` (converging caps, tied
 * grade pairs, shared lines) the sample carries no order and is skipped; an end size looks up to
 * `endPick` ranks further for a line that does separate. The excess must be ≥ max(tolMm, gap / 2),
 * half a local step. Only a run ≥ `runMm` counts.
 */
import type { PtMm } from '../types';

export type OrderRun = { mm: number; at: PtMm; vs: [number, number] };

type Ring = { rank: number; outer: readonly PtMm[] };

const CELL = 8;

type Seg = [PtMm, PtMm];

function gridOf(ring: readonly PtMm[]): Map<string, Seg[]> {
  const g = new Map<string, Seg[]>();
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    for (
      let x = Math.floor(Math.min(a.x, b.x) / CELL);
      x <= Math.floor(Math.max(a.x, b.x) / CELL);
      x++
    )
      for (
        let y = Math.floor(Math.min(a.y, b.y) / CELL);
        y <= Math.floor(Math.max(a.y, b.y) / CELL);
        y++
      ) {
        const k = `${x},${y}`;
        let s = g.get(k);
        if (!s) g.set(k, (s = []));
        s.push([a, b]);
      }
  }
  return g;
}

/** nearest point of a gridded ring to q within `rMax` mm, else null */
function nearestOn(g: Map<string, Seg[]>, q: PtMm, rMax = 60): PtMm | null {
  const cx = Math.floor(q.x / CELL);
  const cy = Math.floor(q.y / CELL);
  let best: PtMm | null = null;
  let bd = rMax;
  for (let r = 0; r * CELL <= rMax + CELL; r++) {
    for (let x = cx - r; x <= cx + r; x++)
      for (let y = cy - r; y <= cy + r; y++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        for (const [a, b] of g.get(`${x},${y}`) ?? []) {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const L = dx * dx + dy * dy;
          const t = L ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L)) : 0;
          const c = { x: a.x + t * dx, y: a.y + t * dy };
          const d = Math.hypot(c.x - q.x, c.y - q.y);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
      }
    // every cell within ring r is searched: a hit closer than r·CELL cannot be beaten further out
    if (best && bd < r * CELL) break;
  }
  return best;
}

function areaOf(r: readonly PtMm[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function sample(ring: readonly PtMm[], step = 1): PtMm[] {
  const out: PtMm[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 0; k < n; k++)
      out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/**
 * The longest stretch of `c`'s outline that lies outside its neighbours' order, or null when
 * there are fewer than 2 neighbours or no stretch reaches `runMm`.
 */
export function gradeOrderRun(
  c: Ring,
  neighbours: readonly Ring[],
  { tolMm = 2, minGapMm = 3, endPick = 3, runMm = 50 } = {},
): OrderRun | null {
  const ns = [...neighbours]
    .filter((n) => n.rank !== c.rank && n.outer.length >= 3)
    .sort((a, b) => a.rank - b.rank);
  const lo = ns.filter((n) => n.rank < c.rank).reverse();
  const hi = ns.filter((n) => n.rank > c.rank);
  if (lo.length + hi.length < 2) return null;
  const grids = new Map<number, Map<string, Seg[]>>();
  const G = (n: Ring) => {
    let g = grids.get(n.rank);
    if (!g) grids.set(n.rank, (g = gridOf(n.outer)));
    return g;
  };
  const mid = lo.length > 0 && hi.length > 0;
  const side = lo.length ? lo : hi;
  // the reference pair must itself be in grade order (a smaller rank, a smaller area): a neighbour
  // closed on a far line would otherwise refuse a correct size
  const [small, big] = mid ? [lo[0], hi[0]] : lo.length ? [side[1], side[0]] : [side[0], side[1]];
  if (small && big && areaOf(small.outer) > 1.01 * areaOf(big.outer)) return null; // ties carry no order
  const S = sample(c.outer);
  const vs: [number, number] = mid ? [lo[0].rank, hi[0].rank] : [side[0].rank, side[1]?.rank ?? -1];
  const bad = S.map((p) => {
    let qa: PtMm | null;
    let qb: PtMm | null = null;
    if (mid) {
      qa = nearestOn(G(lo[0]), p);
      qb = qa && nearestOn(G(hi[0]), qa);
    } else {
      qa = nearestOn(G(side[0]), p);
      if (qa)
        for (const n of side.slice(1, 1 + endPick)) {
          const q = nearestOn(G(n), qa);
          if (q && Math.hypot(q.x - qa.x, q.y - qa.y) >= minGapMm) {
            qb = q;
            break;
          }
        }
    }
    if (!qa || !qb) return false;
    const L = Math.hypot(qb.x - qa.x, qb.y - qa.y);
    if (L < minGapMm) return false;
    const s = ((p.x - qa.x) * (qb.x - qa.x) + (p.y - qa.y) * (qb.y - qa.y)) / L;
    const t = Math.max(tolMm, L / 2);
    return mid ? s < -t || s > L + t : s > t;
  });
  // run length in mm of arc, not in samples: a dense polyline must not lengthen it
  const n = S.length;
  const seg = (i: number) => {
    const b = S[(i + 1) % n];
    return Math.hypot(b.x - S[i].x, b.y - S[i].y);
  };
  let start = bad.indexOf(false);
  if (start < 0) start = 0;
  let run = 0;
  let from = 0;
  let best: OrderRun | null = null;
  const close = (end: number) => {
    if (run >= runMm && (!best || run > best.mm))
      best = { mm: run, at: S[(from + ((end - from + n) % n >> 1)) % n], vs };
    run = 0;
  };
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (bad[i]) {
      if (run === 0) from = i;
      run += seg(i);
      continue;
    }
    close(i);
  }
  close(start);
  return best;
}
