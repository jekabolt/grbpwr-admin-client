// Mesh one piece: the seam-line contour sampled every ~0.6 h (every corner and notch kept exactly),
// a triangular lattice of step h inside, Delaunay (Bowyer–Watson with adjacency + walk), triangles
// outside the contour dropped. Deterministic, no dependencies. Coordinates: the piece's own mm.

import type { Pt2 } from 'lib/assembly-skeleton/types';

export type PieceMesh = {
  pts: Pt2[];
  /** CCW triangles (in the pattern plane), local ids. */
  tris: Uint32Array;
  /** Boundary vertices in contour order: local vertex id + the `rs` index it sits on. */
  bVert: number[];
  bRs: number[];
};

const orient = (a: Pt2, b: Pt2, c: Pt2) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

export function pointInPolygon(p: Pt2, ring: readonly Pt2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a[1] > p[1] !== b[1] > p[1]) {
      const x = ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (p[0] < x) inside = !inside;
    }
  }
  return inside;
}

function segDist2(p: Pt2, a: Pt2, b: Pt2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a[0] + t * dx - p[0];
  const y = a[1] + t * dy - p[1];
  return x * x + y * y;
}

/** Bowyer–Watson over `pts`; returns CCW triangles of real vertices (super triangle removed). */
export function delaunay(input: readonly Pt2[]): number[] {
  const n = input.length;
  if (n < 3) return [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of input) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  const span = Math.max(x1 - x0, y1 - y0, 1);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const P: Pt2[] = [
    ...input,
    [cx - 20 * span, cy - 10 * span],
    [cx + 20 * span, cy - 10 * span],
    [cx, cy + 20 * span],
  ];

  // Triangle store: V (3 per tri), N neighbour across edge k=(v[k], v[k+1]), circumcircle.
  let cap = 4 * n + 16;
  let V = new Int32Array(cap * 3);
  let N = new Int32Array(cap * 3);
  let C = new Float64Array(cap * 3);
  let alive = new Uint8Array(cap);
  let count = 0;
  const grow = () => {
    cap *= 2;
    const v2 = new Int32Array(cap * 3);
    v2.set(V);
    V = v2;
    const n2 = new Int32Array(cap * 3);
    n2.set(N);
    N = n2;
    const c2 = new Float64Array(cap * 3);
    c2.set(C);
    C = c2;
    const a2 = new Uint8Array(cap);
    a2.set(alive);
    alive = a2;
  };
  const make = (a: number, b: number, c: number): number => {
    if (count >= cap) grow();
    const t = count++;
    V[3 * t] = a;
    V[3 * t + 1] = b;
    V[3 * t + 2] = c;
    N[3 * t] = N[3 * t + 1] = N[3 * t + 2] = -1;
    const A = P[a];
    const B = P[b];
    const Cc = P[c];
    const bx = B[0] - A[0];
    const by = B[1] - A[1];
    const qx = Cc[0] - A[0];
    const qy = Cc[1] - A[1];
    const d = 2 * (bx * qy - by * qx);
    const b2 = bx * bx + by * by;
    const c2 = qx * qx + qy * qy;
    const ux = d !== 0 ? (qy * b2 - by * c2) / d : 0;
    const uy = d !== 0 ? (bx * c2 - qx * b2) / d : 0;
    C[3 * t] = A[0] + ux;
    C[3 * t + 1] = A[1] + uy;
    C[3 * t + 2] = d !== 0 ? ux * ux + uy * uy : Infinity;
    alive[t] = 1;
    return t;
  };
  const inCircle = (t: number, p: Pt2) => {
    const dx = p[0] - C[3 * t];
    const dy = p[1] - C[3 * t + 1];
    const r2 = C[3 * t + 2];
    return dx * dx + dy * dy < r2 * (1 - 1e-10);
  };
  make(n, n + 1, n + 2);

  // Insert in a serpentine row order so the walk stays short.
  const order = [...Array(n).keys()];
  const rowH = span / Math.max(1, Math.round(Math.sqrt(n) / 2));
  order.sort((i, j) => {
    const ri = Math.floor((P[i][1] - y0) / rowH);
    const rj = Math.floor((P[j][1] - y0) / rowH);
    if (ri !== rj) return ri - rj;
    return ri % 2 ? P[j][0] - P[i][0] : P[i][0] - P[j][0];
  });

  let last = 0;
  const bad: number[] = [];
  const mark = new Int32Array(0);
  void mark;
  const stamp: number[] = [];
  let stampId = 0;
  for (const pi of order) {
    const p = P[pi];
    // Walk to a triangle containing p.
    let t = alive[last] ? last : -1;
    if (t < 0)
      for (let k = count - 1; k >= 0; k--)
        if (alive[k]) {
          t = k;
          break;
        }
    for (let steps = 0; steps < 4 * count + 10; steps++) {
      let moved = false;
      for (let k = 0; k < 3; k++) {
        const a = P[V[3 * t + k]];
        const b = P[V[3 * t + ((k + 1) % 3)]];
        if (orient(a, b, p) < 0) {
          const nb = N[3 * t + k];
          if (nb >= 0) {
            t = nb;
            moved = true;
            break;
          }
        }
      }
      if (!moved) break;
    }
    if (!inCircle(t, p)) {
      // Fallback (degenerate walk): any triangle whose circle holds p.
      let found = -1;
      for (let k = 0; k < count; k++)
        if (alive[k] && inCircle(k, p)) {
          found = k;
          break;
        }
      if (found < 0) continue;
      t = found;
    }
    // Cavity by flood fill.
    stampId++;
    while (stamp.length < count) stamp.push(0);
    bad.length = 0;
    const stack = [t];
    stamp[t] = stampId;
    while (stack.length) {
      const u = stack.pop()!;
      bad.push(u);
      for (let k = 0; k < 3; k++) {
        const nb = N[3 * u + k];
        if (nb < 0 || stamp[nb] === stampId) continue;
        if (inCircle(nb, p)) {
          stamp[nb] = stampId;
          stack.push(nb);
        }
      }
    }
    // Boundary of the cavity → fan to p.
    const fresh: number[] = [];
    const byStart = new Map<number, number>(); // edge start vertex → new triangle (edge a→b, p)
    for (const u of bad) {
      for (let k = 0; k < 3; k++) {
        const nb = N[3 * u + k];
        if (nb >= 0 && stamp[nb] === stampId) continue;
        const a = V[3 * u + k];
        const b = V[3 * u + ((k + 1) % 3)];
        const nt = make(a, b, pi);
        N[3 * nt] = nb;
        if (nb >= 0) {
          for (let q = 0; q < 3; q++) {
            if (V[3 * nb + q] === b && V[3 * nb + ((q + 1) % 3)] === a) N[3 * nb + q] = nt;
          }
        }
        fresh.push(nt);
        byStart.set(a, nt);
      }
    }
    for (const u of bad) alive[u] = 0;
    // Link the fan: triangle (a,b,p) edge 1 = (b,p) meets triangle starting at b, edge 2 = (p,b).
    for (const nt of fresh) {
      const b = V[3 * nt + 1];
      const other = byStart.get(b);
      if (other !== undefined) {
        N[3 * nt + 1] = other;
        N[3 * other + 2] = nt;
      }
    }
    last = fresh.length ? fresh[fresh.length - 1] : last;
  }
  const out: number[] = [];
  for (let t = 0; t < count; t++) {
    if (!alive[t]) continue;
    const a = V[3 * t];
    const b = V[3 * t + 1];
    const c = V[3 * t + 2];
    if (a >= n || b >= n || c >= n) continue;
    out.push(a, b, c);
  }
  return out;
}

/**
 * Mesh a piece. `keep` = rs indices that must be vertices (edge ends, notches); `h` = lattice step.
 */
export function meshPiece(rs: readonly Pt2[], keep: readonly number[], h: number): PieceMesh {
  const n = rs.length;
  const forced = [...new Set(keep.map((i) => ((i % n) + n) % n))].sort((a, b) => a - b);
  if (forced.length === 0) forced.push(0);
  const step = Math.max(2, 0.6 * h); // rs is 1 mm resampled: index distance ≈ mm
  const bRs: number[] = [];
  for (let k = 0; k < forced.length; k++) {
    const s = forced[k];
    const e = k + 1 < forced.length ? forced[k + 1] : forced[0] + n;
    const span = e - s;
    const parts = Math.max(1, Math.round(span / step));
    for (let j = 0; j < parts; j++) bRs.push((s + Math.round((span * j) / parts)) % n);
  }
  const pts: Pt2[] = bRs.map((i) => [rs[i][0], rs[i][1]]);
  const ring: Pt2[] = pts.slice();

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of rs) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  const dy = (h * Math.sqrt(3)) / 2;
  const clear2 = (0.55 * h) ** 2;
  // Bucket boundary segments by row band for the clearance test.
  for (let row = 0, y = y0 + dy / 2; y < y1; y += dy, row++) {
    const shift = row % 2 ? h / 2 : 0;
    // Segments near this row.
    const near: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (Math.min(a[1], b[1]) - h > y || Math.max(a[1], b[1]) + h < y) continue;
      near.push(i);
    }
    for (let x = x0 + h / 2 + shift; x < x1; x += h) {
      const q: Pt2 = [x, y];
      if (!pointInPolygon(q, ring)) continue;
      let ok = true;
      for (const i of near) {
        if (segDist2(q, ring[i], ring[(i + 1) % ring.length]) < clear2) {
          ok = false;
          break;
        }
      }
      if (ok) pts.push(q);
    }
  }

  const raw = delaunay(pts);
  const nb = bRs.length;
  const tris: number[] = [];
  for (let t = 0; t < raw.length; t += 3) {
    const a = raw[t];
    const b = raw[t + 1];
    const c = raw[t + 2];
    const onB = (a < nb ? 1 : 0) + (b < nb ? 1 : 0) + (c < nb ? 1 : 0);
    if (onB >= 2) {
      const pa = pts[a];
      const pb = pts[b];
      const pc = pts[c];
      const g: Pt2 = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3];
      if (!pointInPolygon(g, ring)) continue;
      const mids: Pt2[] = [
        [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2],
        [(pb[0] + pc[0]) / 2, (pb[1] + pc[1]) / 2],
        [(pc[0] + pa[0]) / 2, (pc[1] + pa[1]) / 2],
      ];
      // A boundary–boundary edge is fine when it is a contour step; otherwise its midpoint must be in.
      const isStep = (i: number, j: number) =>
        i < nb && j < nb && (Math.abs(i - j) === 1 || Math.abs(i - j) === nb - 1);
      if (!isStep(a, b) && !pointInPolygon(mids[0], ring)) continue;
      if (!isStep(b, c) && !pointInPolygon(mids[1], ring)) continue;
      if (!isStep(c, a) && !pointInPolygon(mids[2], ring)) continue;
      if (Math.abs(orient(pa, pb, pc)) < 1e-6) continue;
    }
    tris.push(a, b, c);
  }
  // Make every triangle CCW in the pattern plane.
  for (let t = 0; t < tris.length; t += 3) {
    if (orient(pts[tris[t]], pts[tris[t + 1]], pts[tris[t + 2]]) < 0) {
      const s = tris[t + 1];
      tris[t + 1] = tris[t + 2];
      tris[t + 2] = s;
    }
  }
  return { pts, tris: Uint32Array.from(tris), bVert: bRs.map((_, i) => i), bRs };
}
