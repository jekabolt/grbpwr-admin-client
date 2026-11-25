import { ringDistance, unflat, type P } from '../reference-lib';
export { ringDistance, unflat, type P };
export const ORDER = ['00', '0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24', '26', '28', '30', '32'];
export const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
// one piece never mixes scales, so numeric and letter sizes may share index values
export const idx = (s: string) => {
  const h = s.split(/[-/]/)[0];
  if (ORDER.includes(s)) return ORDER.indexOf(s);
  if (LETTERS.includes(s)) return LETTERS.indexOf(s);
  if (/^\d+$/.test(s)) return Number(s) / 2; // another even scale (34–52): one step per 2
  if (/^\d+$/.test(h) && !ORDER.includes(h)) return Number(h) / 2 + 0.5;
  return (ORDER.includes(h) ? ORDER.indexOf(h) : LETTERS.indexOf(h)) + 0.5;
};
export function sample(ring: readonly P[], step = 1): P[] {
  const out: P[] = [];
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i < n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  }
  return out;
}
export function nearestOn(p: P, ring: readonly P[]): P {
  let best = Infinity, q = ring[0];
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    const x = a.x + t * dx, y = a.y + t * dy, d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < best) { best = d; q = { x, y }; }
  }
  return q;
}
/** Points of A carried to B along nearest-point correspondence: a "grade vector" field. */
export const carry = (A: readonly P[], B: readonly P[]) => sample(A).map((p) => ({ p, q: nearestOn(p, B) }));
/** Predict the outline at parameter t (0 → A, 1 → B, >1 extrapolates past B) as a point cloud. */
export const predict = (A: readonly P[], B: readonly P[], t: number): P[] =>
  carry(A, B).map(({ p, q }) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }));
/** Hausdorff between a dense point cloud and a ring (cloud points → ring, ring samples → nearest cloud point). */
export function cloudToRing(cloud: readonly P[], ring: readonly P[]): { max: number; p95: number } {
  const a = cloud.map((p) => { const q = nearestOn(p, ring); return Math.hypot(p.x - q.x, p.y - q.y); });
  const b = sample(ring).map((p) => Math.min(...cloud.map((c) => Math.hypot(p.x - c.x, p.y - c.y))));
  const ds = [...a, ...b].sort((x, y) => x - y);
  return { max: ds[ds.length - 1], p95: ds[Math.floor(ds.length * 0.95)] };
}
export const q = (a: number[], f: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * f))] : NaN);

// ---- corner-based correspondence: grade points sit at corners, curves between them follow by arc share
const area = (r: readonly P[]) => r.reduce((s, p, k) => { const b = r[(k + 1) % r.length]; return s + p.x * b.y - b.x * p.y; }, 0) / 2;
export const ccw = (r: readonly P[]) => (area(r) < 0 ? [...r].reverse() : [...r]);
/** Dense ring (1 mm) and the indices of its corners (turn > minDeg over a ±w mm window). */
export function corners(ring: readonly P[], minDeg = 30, w = 4): { pts: P[]; c: number[] } {
  const pts = sample(ccw(ring), 1), n = pts.length, turn: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - w + n) % n], b = pts[i], c = pts[(i + w) % n];
    const t1 = Math.atan2(b.y - a.y, b.x - a.x), t2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(t2 - t1); if (d > Math.PI) d = 2 * Math.PI - d; turn.push((d * 180) / Math.PI);
  }
  const c: number[] = [];
  for (let i = 0; i < n; i++) {
    if (turn[i] < minDeg) continue;
    let peak = true;
    for (let j = -8; j <= 8 && peak; j++) if (j && turn[(i + j + n) % n] > turn[i] + (j > 0 ? 0 : 1e-9)) peak = false;
    if (peak) c.push(i);
  }
  return { pts, c };
}
/** Pair corners of A and B: mutual nearest within reach, kept only while cyclic order holds. */
export function matchCorners(A: ReturnType<typeof corners>, B: ReturnType<typeof corners>, reach = 40): [number, number][] | null {
  const d = (i: number, j: number) => Math.hypot(A.pts[i].x - B.pts[j].x, A.pts[i].y - B.pts[j].y);
  const nb = (i: number) => B.c.reduce((b, j) => (d(i, j) < d(i, b) ? j : b), B.c[0]);
  const na = (j: number) => A.c.reduce((b, i) => (d(i, j) < d(b, j) ? i : b), A.c[0]);
  let m: [number, number][] = A.c.flatMap((i) => { const j = nb(i); return na(j) === i && d(i, j) <= reach ? [[i, j] as [number, number]] : []; });
  // cyclic order: B indices must increase (mod n) as A's do; drop pairs that break it
  const n = B.pts.length;
  for (let changed = true; changed && m.length > 2; ) {
    changed = false;
    for (let k = 0; k < m.length; k++) {
      const a = m[(k - 1 + m.length) % m.length][1], b = m[k][1], c = m[(k + 1) % m.length][1];
      const ab = (b - a + n) % n, bc = (c - b + n) % n, ac = (c - a + n) % n;
      if (ab + bc !== ac && m.length > 2) { m = m.filter((_, x) => x !== k); changed = true; break; }
    }
  }
  return m.length >= 2 ? m : null;
}
const arcAt = (pts: P[], from: number, to: number, f: number): P => {
  const n = pts.length, len = ((to - from + n) % n) || n;
  const x = f * len, i = Math.floor(x), r = x - i;
  const a = pts[(from + i) % n], b = pts[(from + i + 1) % n];
  return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
};
/** Corresponding point pairs A→B (one per mm of A), or null when the corners do not match. */
export function pairs(A0: readonly P[], B0: readonly P[]): { p: P; q: P }[] | null {
  const A = corners(A0), B = corners(B0), m = matchCorners(A, B);
  if (!m) return null;
  const out: { p: P; q: P }[] = [], n = m.length;
  for (let k = 0; k < n; k++) {
    const [a0, b0] = m[k], [a1, b1] = m[(k + 1) % n];
    const la = ((a1 - a0 + A.pts.length) % A.pts.length) || A.pts.length;
    for (let i = 0; i < la; i++) out.push({ p: arcAt(A.pts, a0, a1, i / la), q: arcAt(B.pts, b0, b1, i / la) });
  }
  return out;
}
export const predictC = (A: readonly P[], B: readonly P[], t: number): P[] | null =>
  pairs(A, B)?.map(({ p, q }) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })) ?? null;
/** Fast cloud→ring both ways: grid of cloud points. */
export function cloudToRingFast(cloud: readonly P[], ring: readonly P[]): { max: number; p95: number } {
  const a = cloud.map((p) => { const q = nearestOn(p, ring); return Math.hypot(p.x - q.x, p.y - q.y); });
  const G = new Map<string, P[]>(), key = (x: number, y: number) => `${Math.floor(x / 5)},${Math.floor(y / 5)}`;
  for (const c of cloud) { const k = key(c.x, c.y); (G.get(k) ?? G.set(k, []).get(k)!).push(c); }
  const b = sample(ring).map((p) => {
    for (let r = 0; r < 60; r++) {
      let best = Infinity; const gx = Math.floor(p.x / 5), gy = Math.floor(p.y / 5);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (const c of G.get(`${gx + i},${gy + j}`) ?? []) best = Math.min(best, Math.hypot(p.x - c.x, p.y - c.y));
      if (best <= r * 5) return best;
    }
    return 300;
  });
  const ds = [...a, ...b].sort((x, y) => x - y);
  return { max: ds[ds.length - 1], p95: ds[Math.floor(ds.length * 0.95)] };
}
