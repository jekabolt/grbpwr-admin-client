// Grade map · a small constrained triangulation (no dependency in package.json fits; earcut is only
// transitive and unconstrained). The ring is ear-clipped (its edges are constraints by
// construction), Lawson flips make it Delaunay away from constraints, interior points are inserted
// one by one (triangle or edge split + flips), then constraint segments are forced in by flipping
// the edges they cross (Sloan). A point outside the ring or a segment that would cross another
// constraint or run through a vertex is skipped and counted.

import type { PtMm } from 'lib/pattern-import/types';

export type Tri = [number, number, number];
export type Triangulation = {
  pts: PtMm[];
  tris: Tri[];
  skippedPoints: number;
  skippedSegments: number;
  /** null when the ring could not be triangulated (a self-touching or degenerate ring). */
  failed: string | null;
};

const EPS_AREA = 1e-9;

const orient = (a: PtMm, b: PtMm, c: PtMm) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function inCircle(a: PtMm, b: PtMm, c: PtMm, d: PtMm): number {
  const adx = a.x - d.x;
  const ady = a.y - d.y;
  const bdx = b.x - d.x;
  const bdy = b.y - d.y;
  const cdx = c.x - d.x;
  const cdy = c.y - d.y;
  const ad = adx * adx + ady * ady;
  const bd = bdx * bdx + bdy * bdy;
  const cd = cdx * cdx + cdy * cdy;
  return adx * (bdy * cd - bd * cdy) - ady * (bdx * cd - bd * cdx) + ad * (bdx * cdy - bdy * cdx);
}

class Mesh {
  tris: (Tri | null)[] = [];
  dir = new Map<number, number>();
  cons = new Set<number>();
  constructor(
    readonly P: PtMm[],
    readonly N: number,
  ) {}
  key = (u: number, v: number) => u * this.N + v;
  ukey = (u: number, v: number) => (u < v ? u * this.N + v : v * this.N + u);
  add(a: number, b: number, c: number): number {
    const id = this.tris.length;
    this.tris.push([a, b, c]);
    this.dir.set(this.key(a, b), id);
    this.dir.set(this.key(b, c), id);
    this.dir.set(this.key(c, a), id);
    return id;
  }
  remove(id: number) {
    const t = this.tris[id]!;
    for (let k = 0; k < 3; k++) {
      const kk = this.key(t[k], t[(k + 1) % 3]);
      if (this.dir.get(kk) === id) this.dir.delete(kk);
    }
    this.tris[id] = null;
  }
  third(id: number, u: number, v: number): number {
    const t = this.tris[id]!;
    return t.find((x) => x !== u && x !== v)!;
  }
  /** Flip edge u-v if both triangles exist and the quad is strictly convex; returns the new edge. */
  flip(u: number, v: number): [number, number] | null {
    const t1 = this.dir.get(this.key(u, v));
    const t2 = this.dir.get(this.key(v, u));
    if (t1 === undefined || t2 === undefined) return null;
    const p = this.third(t1, u, v);
    const q = this.third(t2, v, u);
    const P = this.P;
    if (orient(P[u], P[q], P[p]) <= EPS_AREA || orient(P[q], P[v], P[p]) <= EPS_AREA) return null;
    this.remove(t1);
    this.remove(t2);
    this.add(u, q, p);
    this.add(q, v, p);
    return [p, q];
  }
  legalize(stack: [number, number][]) {
    let guard = 0;
    while (stack.length && guard++ < 200000) {
      const [u, v] = stack.pop()!;
      if (this.cons.has(this.ukey(u, v))) continue;
      const t1 = this.dir.get(this.key(u, v));
      const t2 = this.dir.get(this.key(v, u));
      if (t1 === undefined || t2 === undefined) continue;
      const p = this.third(t1, u, v);
      const q = this.third(t2, v, u);
      const P = this.P;
      const scale = Math.max(1, Math.abs(orient(P[u], P[v], P[p])) ** 2);
      if (inCircle(P[u], P[v], P[p], P[q]) <= 1e-9 * scale) continue;
      if (!this.flip(u, v)) continue;
      stack.push([u, q], [q, v], [v, p], [p, u]);
    }
  }
}

function earClip(m: Mesh, n: number): string | null {
  const P = m.P;
  const prev = Array.from({ length: n }, (_, i) => (i + n - 1) % n);
  const next = Array.from({ length: n }, (_, i) => (i + 1) % n);
  const reflex = new Set<number>();
  const isReflex = (i: number) => orient(P[prev[i]], P[i], P[next[i]]) <= EPS_AREA;
  for (let i = 0; i < n; i++) if (isReflex(i)) reflex.add(i);
  const inside = (p: PtMm, a: PtMm, b: PtMm, c: PtMm) =>
    orient(a, b, p) >= -EPS_AREA && orient(b, c, p) >= -EPS_AREA && orient(c, a, p) >= -EPS_AREA;
  const isEar = (i: number) => {
    if (reflex.has(i)) return false;
    const a = P[prev[i]];
    const b = P[i];
    const c = P[next[i]];
    for (const r of reflex) {
      if (r === prev[i] || r === next[i]) continue;
      const q = P[r];
      if ((q.x === a.x && q.y === a.y) || (q.x === c.x && q.y === c.y)) continue;
      if (inside(q, a, b, c)) return false;
    }
    return true;
  };
  let count = n;
  let i = 0;
  while (count > 3) {
    let found = -1;
    for (let k = 0, j = i; k < count; k++, j = next[j])
      if (isEar(j)) {
        found = j;
        break;
      }
    if (found < 0) return 'ear clipping found no ear (self-touching ring)';
    const a = prev[found];
    const c = next[found];
    m.add(a, found, c);
    next[a] = c;
    prev[c] = a;
    reflex.delete(found);
    count--;
    for (const v of [a, c]) {
      if (isReflex(v)) reflex.add(v);
      else reflex.delete(v);
    }
    i = a;
  }
  const a = i;
  const b = next[a];
  const c = next[b];
  if (orient(P[a], P[b], P[c]) <= EPS_AREA) return 'ear clipping left a degenerate triangle';
  m.add(a, b, c);
  return null;
}

function segCross(a: PtMm, b: PtMm, c: PtMm, d: PtMm): boolean {
  const d1 = orient(a, b, c);
  const d2 = orient(a, b, d);
  const d3 = orient(c, d, a);
  const d4 = orient(c, d, b);
  return (
    ((d1 > EPS_AREA && d2 < -EPS_AREA) || (d1 < -EPS_AREA && d2 > EPS_AREA)) &&
    ((d3 > EPS_AREA && d4 < -EPS_AREA) || (d3 < -EPS_AREA && d4 > EPS_AREA))
  );
}

/**
 * Walk from the newest triangle toward p across the edge p lies outside of. Returns a triangle id
 * that holds p, or -1 when the walk reaches the ring (a concave domain) or loops; the caller then
 * scans every triangle.
 */
function walk(m: Mesh, p: PtMm): number {
  const P = m.P;
  let id = m.tris.length - 1;
  while (id >= 0 && !m.tris[id]) id--;
  for (let steps = 0; id >= 0 && steps < m.tris.length + 8; steps++) {
    const t = m.tris[id]!;
    const eps = 1e-9 * Math.max(1, orient(P[t[0]], P[t[1]], P[t[2]]));
    let next = id;
    for (let k = 0; k < 3; k++) {
      const u = t[k];
      const v = t[(k + 1) % 3];
      if (orient(P[u], P[v], p) < -eps) {
        const nb = m.dir.get(m.key(v, u));
        if (nb === undefined) return -1;
        next = nb;
        break;
      }
    }
    if (next === id) return id;
    id = next;
  }
  return -1;
}

function insertPoint(m: Mesh, k: number): boolean {
  const start = walk(m, m.P[k]);
  if (start >= 0 && splitAt(m, start, k)) return true;
  for (let id = 0; id < m.tris.length; id++) if (splitAt(m, id, k)) return true;
  return false;
}

/** Split triangle id (or the edge p lies on, with its neighbour) at point k; false if p is outside it. */
function splitAt(m: Mesh, id: number, k: number): boolean {
  const P = m.P;
  const p = P[k];
  const t = m.tris[id];
  if (!t) return false;
  const [a, b, c] = t;
  const w = [orient(P[b], P[c], p), orient(P[c], P[a], p), orient(P[a], P[b], p)];
  const area = orient(P[a], P[b], P[c]);
  const eps = 1e-9 * Math.max(1, area);
  if (w.some((x) => x < -eps)) return false;
  const zero = w.findIndex((x) => x <= eps);
  if (zero < 0) {
    m.remove(id);
    m.add(a, b, k);
    m.add(b, c, k);
    m.add(c, a, k);
    m.legalize([
      [a, b],
      [b, c],
      [c, a],
    ]);
    return true;
  }
  // on an edge: the edge opposite the zero weight
  const u = t[(zero + 1) % 3];
  const v = t[(zero + 2) % 3];
  const o = t[zero];
  const other = m.dir.get(m.key(v, u));
  const wasCons = m.cons.has(m.ukey(u, v));
  m.remove(id);
  m.add(u, k, o);
  m.add(k, v, o);
  const stack: [number, number][] = [
    [v, o],
    [o, u],
  ];
  if (other !== undefined) {
    const d = m.third(other, v, u);
    m.remove(other);
    m.add(v, k, d);
    m.add(k, u, d);
    stack.push([u, d], [d, v]);
  }
  if (wasCons) {
    m.cons.delete(m.ukey(u, v));
    m.cons.add(m.ukey(u, k));
    m.cons.add(m.ukey(k, v));
  }
  m.legalize(stack);
  return true;
}

function insertSegment(m: Mesh, a: number, b: number): boolean {
  if (a === b) return false;
  const P = m.P;
  if (m.dir.has(m.key(a, b)) || m.dir.has(m.key(b, a))) {
    m.cons.add(m.ukey(a, b));
    return true;
  }
  const A = P[a];
  const B = P[b];
  const len2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2;
  // a vertex on the open segment: skip
  for (let i = 0; i < P.length; i++) {
    if (i === a || i === b || !m.dir.size) continue;
    const q = P[i];
    if (Math.abs(orient(A, B, q)) > 1e-6 * Math.sqrt(len2)) continue;
    const t = ((q.x - A.x) * (B.x - A.x) + (q.y - A.y) * (B.y - A.y)) / len2;
    if (t > 1e-9 && t < 1 - 1e-9) return false;
  }
  const crossing: [number, number][] = [];
  const seen = new Set<number>();
  for (const t of m.tris) {
    if (!t) continue;
    for (let k = 0; k < 3; k++) {
      const u = t[k];
      const v = t[(k + 1) % 3];
      const uk = m.ukey(u, v);
      if (seen.has(uk)) continue;
      seen.add(uk);
      if (u === a || u === b || v === a || v === b) continue;
      if (segCross(A, B, P[u], P[v])) {
        if (m.cons.has(uk)) return false;
        crossing.push([u, v]);
      }
    }
  }
  const fresh: [number, number][] = [];
  let guard = 0;
  while (crossing.length && guard++ < 50000) {
    const [u, v] = crossing.shift()!;
    if (!m.dir.has(m.key(u, v)) && !m.dir.has(m.key(v, u))) continue;
    const e = m.dir.has(m.key(u, v)) ? m.flip(u, v) : m.flip(v, u);
    if (!e) {
      crossing.push([u, v]);
      continue;
    }
    const [p, q] = e;
    if (p !== a && p !== b && q !== a && q !== b && segCross(A, B, P[p], P[q]))
      crossing.push([p, q]);
    else fresh.push([p, q]);
  }
  if (!(m.dir.has(m.key(a, b)) || m.dir.has(m.key(b, a)))) return false;
  m.cons.add(m.ukey(a, b));
  m.legalize(fresh.filter(([p, q]) => m.ukey(p, q) !== m.ukey(a, b)));
  return true;
}

/**
 * Ring (counter-clockwise, indices 0..ring.length-1) + interior points + constraint segments (indices
 * into ring ++ points).
 */
export function triangulate(
  ring: readonly PtMm[],
  points: readonly PtMm[],
  segments: readonly [number, number][],
): Triangulation {
  const pts = [...ring, ...points];
  const m = new Mesh(pts, pts.length + 1);
  for (let i = 0; i < ring.length; i++) m.cons.add(m.ukey(i, (i + 1) % ring.length));
  const failed = ring.length < 3 ? 'ring has < 3 points' : earClip(m, ring.length);
  if (failed)
    return {
      pts,
      tris: [],
      skippedPoints: points.length,
      skippedSegments: segments.length,
      failed,
    };
  const interior: [number, number][] = [];
  for (const t of m.tris) if (t) for (let k = 0; k < 3; k++) interior.push([t[k], t[(k + 1) % 3]]);
  m.legalize(interior);
  let skippedPoints = 0;
  const placed = new Set<number>();
  for (let k = ring.length; k < pts.length; k++) {
    if (insertPoint(m, k)) placed.add(k);
    else skippedPoints++;
  }
  let skippedSegments = 0;
  for (const [a, b] of segments) {
    const ok =
      (a < ring.length || placed.has(a)) &&
      (b < ring.length || placed.has(b)) &&
      insertSegment(m, a, b);
    if (!ok) skippedSegments++;
  }
  const tris = m.tris.filter((t): t is Tri => !!t);
  return { pts, tris, skippedPoints, skippedSegments, failed: null };
}

export { orient };
