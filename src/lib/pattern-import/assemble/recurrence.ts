// assemble (F2) — registration by RECURRENCE. Windowed tiles (Burda, kombinezon, blazer) carry the
// same long drawing operation, unclipped, on every tile it crosses; the difference of its first
// vertex between two pages IS the tile offset, exactly (palto/robe 170.0 × 257.0, kombinezon
// 190.0 × 280.0). Shapes are keyed by their vertices relative to the first vertex, quantised to
// 0.1 mm (PATIMPORT.registrationStepMm); the offset is then the mean of the exact differences.

import { PATIMPORT } from 'lib/pattern-import/types';

import type { RegPage } from './regpage';

export type RawLink = {
  a: RegPage;
  b: RegPage;
  /** Translation b-frame → a-frame: t_b = t_a + (dx, dy) (registration frames, sheet axes). */
  dx: number;
  dy: number;
  method: 'recurrence' | 'edge-stitch';
  /** Votes in the winning cluster. */
  n: number;
  /** Votes of the best competing cluster (≥ 1 mm away). */
  n2: number;
  /** Max deviation of the individual measurements from the mean, mm. */
  spreadMm: number;
};

function shapeHash(pts: { x: number; y: number }[], q: number): string {
  // FNV-1a over the quantised relative vertices, plus the count — collisions are re-checked.
  const x0 = pts[0].x;
  const y0 = pts[0].y;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const p of pts) {
    const ix = Math.round((p.x - x0) / q);
    const iy = Math.round((p.y - y0) / q);
    h1 = Math.imul(h1 ^ ix, 0x01000193) >>> 0;
    h1 = Math.imul(h1 ^ iy, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ix * 31 + iy), 0x5bd1e995) >>> 0;
  }
  return `${pts.length}:${h1.toString(36)}:${h2.toString(36)}`;
}

function sameShape(
  a: { x: number; y: number }[],
  b: { x: number; y: number }[],
  tol: number,
): boolean {
  if (a.length !== b.length) return false;
  const dx = a[0].x - b[0].x;
  const dy = a[0].y - b[0].y;
  const step = Math.max(1, Math.floor(a.length / 16));
  for (let i = 0; i < a.length; i += step)
    if (Math.abs(a[i].x - b[i].x - dx) > tol || Math.abs(a[i].y - b[i].y - dy) > tol) return false;
  return true;
}

/**
 * Pairwise links from shapes that recur on several pages. A shape that occurs twice on one page
 * (two identical darts) or on more than `maxOcc` pages (a logo) is ambiguous and skipped.
 */
export function recurrenceLinks(pages: RegPage[], maxOcc = 12): RawLink[] {
  const q = PATIMPORT.registrationStepMm;
  const occ = new Map<string, { p: RegPage; s: RegPage['shapes'][number] }[]>();
  for (const p of pages)
    for (const s of p.shapes) {
      const k = shapeHash(s.pts, q);
      const list = occ.get(k);
      if (list) list.push({ p, s });
      else occ.set(k, [{ p, s }]);
    }
  type Acc = { a: RegPage; b: RegPage; ds: { dx: number; dy: number }[] };
  const acc = new Map<string, Acc>();
  for (const list of occ.values()) {
    if (list.length < 2 || list.length > maxOcc) continue;
    if (new Set(list.map((o) => o.p.key)).size !== list.length) continue;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        let A = list[i];
        let B = list[j];
        if (A.p.idx > B.p.idx) [A, B] = [B, A];
        if (!sameShape(A.s.pts, B.s.pts, 2 * q)) continue;
        const key = `${A.p.key}|${B.p.key}`;
        const e = acc.get(key) ?? { a: A.p, b: B.p, ds: [] };
        // Same point: a + t_a = b + t_b → t_b = t_a + (a − b).
        e.ds.push({ dx: A.s.pts[0].x - B.s.pts[0].x, dy: A.s.pts[0].y - B.s.pts[0].y });
        acc.set(key, e);
      }
  }
  const links: RawLink[] = [];
  for (const e of acc.values()) {
    const best = cluster(e.ds, 0.25);
    if (!best) continue;
    const { n, n2, dx, dy, spread } = best;
    const total = e.ds.length;
    if (n < 2 || n < 0.6 * total || n < PATIMPORT.registrationMinPeakRatio * n2) continue;
    links.push({ a: e.a, b: e.b, dx, dy, method: 'recurrence', n, n2, spreadMm: spread });
  }
  return links;
}

/** Densest cluster of 2-D measurements (radius r); n2 = densest cluster ≥ 1 mm away. */
export function cluster(
  ds: { dx: number; dy: number }[],
  r: number,
): { dx: number; dy: number; n: number; n2: number; spread: number } | null {
  if (!ds.length) return null;
  const bins = new Map<string, { dx: number; dy: number }[]>();
  for (const d of ds) {
    const k = `${Math.round(d.dx / 0.5)},${Math.round(d.dy / 0.5)}`;
    const l = bins.get(k);
    if (l) l.push(d);
    else bins.set(k, [d]);
  }
  // Seed = biggest 0.5 mm bin; members = everything within r of the seed's median.
  const ranked = [...bins.values()].sort((a, b) => b.length - a.length);
  const seed = ranked[0];
  const mx = median(seed.map((d) => d.dx));
  const my = median(seed.map((d) => d.dy));
  const members = ds.filter((d) => Math.abs(d.dx - mx) <= r && Math.abs(d.dy - my) <= r);
  const dx = members.reduce((s, d) => s + d.dx, 0) / members.length;
  const dy = members.reduce((s, d) => s + d.dy, 0) / members.length;
  let spread = 0;
  for (const d of members) spread = Math.max(spread, Math.abs(d.dx - dx), Math.abs(d.dy - dy));
  let n2 = 0;
  for (const l of ranked) {
    const lx = median(l.map((d) => d.dx));
    const ly = median(l.map((d) => d.dy));
    if (Math.hypot(lx - dx, ly - dy) < 1) continue;
    n2 = Math.max(n2, l.length);
  }
  return { dx, dy, n: members.length, n2, spread };
}

export function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
