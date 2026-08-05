import type { Pt, RotationDeg } from '../types';

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function bounds(poly: readonly Pt[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// Shoelace, signed: positive = CCW.
export function signedArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function area(poly: readonly Pt[]): number {
  return Math.abs(signedArea(poly));
}

export function ensureCCW(poly: Pt[]): Pt[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

// Exact for the four axis rotations the nesting uses — no trig drift on 90° multiples.
export function rotatePt(p: Pt, rot: RotationDeg): Pt {
  switch (rot) {
    case 0:
      return p;
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
}

export function rotatePoly(poly: readonly Pt[], rot: RotationDeg): Pt[] {
  if (rot === 0) return [...poly];
  return poly.map((p) => rotatePt(p, rot));
}

export function translatePoly(poly: readonly Pt[], dx: number, dy: number): Pt[] {
  return poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

// Ray-casting point-in-polygon; boundary counts as inside (good enough for the
// containment forest, where loops nest strictly or not at all).
export function pointInPolygon(pt: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y) {
      const xCross = ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x;
      if (pt.x < xCross) inside = !inside;
    }
  }
  return inside;
}

// Drop consecutive points closer than eps (also closes the dedupe across the wrap).
export function stripDegenerate(poly: readonly Pt[], eps: number): Pt[] {
  const out: Pt[] = [];
  const e2 = eps * eps;
  for (const p of poly) {
    const last = out[out.length - 1];
    if (last && (last.x - p.x) ** 2 + (last.y - p.y) ** 2 < e2) continue;
    out.push(p);
  }
  while (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if ((first.x - last.x) ** 2 + (first.y - last.y) ** 2 < e2) out.pop();
    else break;
  }
  return out;
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
