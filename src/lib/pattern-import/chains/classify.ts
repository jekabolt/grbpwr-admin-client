// chains/ (F3) — page furniture to ignore, and "looks": clusters of chains drawn alike.
//
// A look is NOT a size: palto's 5 sizes show up as more looks (one style fragments when dash phase
// or decorations differ) and two sizes can share a look; viola draws 8 sizes in ~8 looks of 3
// line weights. Looks are evidence; sizes are decided in sizes/recover.ts with bundles.
import type { Chain, ClassEvidence, LineClass, PtMm, Style } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { bboxOf, dist } from './geom';
import { normDash } from './link';
import { cosine, type Signature } from './motif';

export const LOOK = { minCos: 0.88, attachCos: 0.93 };

function straightAxis(c: Chain): { axis: 'x' | 'y' | null; straight: boolean } {
  const a = c.pts[0];
  const b = c.pts[c.pts.length - 1];
  const L = dist(a, b);
  if (L < 1e-6) return { axis: null, straight: false };
  let dev = 0;
  for (const p of c.pts) {
    const d = Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / L;
    if (d > dev) dev = d;
  }
  const straight = dev < 0.3 && c.lengthMm < L * 1.01;
  const ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)) % 180;
  const axis = ang < 0.3 || ang > 179.7 ? 'x' : Math.abs(ang - 90) < 0.3 ? 'y' : null;
  return { axis, straight };
}

/**
 * Page furniture per chain (null = line work): sheet grids and watermarks (light grey), tile
 * frames (axis-aligned rectangles or straight lines repeated ≥ 3 times with the same size — every
 * tile prints one), dashed guides (long axis-aligned dashed lines, thin).
 */
export function furniture(chains: Chain[], styles: Map<number, Style>): (string | null)[] {
  const out: (string | null)[] = chains.map(() => null);
  const rects = new Map<string, number[]>();
  const lines = new Map<string, number[]>();
  chains.forEach((c, i) => {
    const st = styles.get(c.style);
    if (st?.strokeRgb) {
      const [r, g, b] = st.strokeRgb;
      const mn = Math.min(r, g, b);
      const mx = Math.max(r, g, b);
      if (mn >= 140 && mx - mn < 40) {
        out[i] = 'light grey (grid / watermark)';
        return;
      }
    }
    const { axis, straight } = straightAxis(c);
    if (straight && axis && c.lengthMm >= 40) {
      if (st?.dash && (st.widthMm <= 0.2 || c.lengthMm >= 150)) {
        out[i] = 'dashed guide';
        return;
      }
      if (c.lengthMm >= 100) {
        const k = `${axis}|${Math.round(c.lengthMm)}`;
        const a = lines.get(k);
        if (a) a.push(i);
        else lines.set(k, [i]);
      }
      return;
    }
    // closed axis-aligned rectangle
    const bb = bboxOf(c.pts);
    const w = bb.maxX - bb.minX;
    const h = bb.maxY - bb.minY;
    if (w < 80 || h < 80) return;
    const onBox = c.pts.every(
      (p) =>
        Math.min(Math.abs(p.x - bb.minX), Math.abs(p.x - bb.maxX)) < 0.3 ||
        Math.min(Math.abs(p.y - bb.minY), Math.abs(p.y - bb.maxY)) < 0.3,
    );
    const a0 = c.pts[0];
    const a1 = c.pts[c.pts.length - 1];
    if (onBox && dist(a0, a1) < 1 && Math.abs(c.lengthMm - 2 * (w + h)) < 2) {
      const k = `${Math.round(w)}x${Math.round(h)}`;
      const a = rects.get(k);
      if (a) a.push(i);
      else rects.set(k, [i]);
    }
  });
  for (const a of rects.values()) if (a.length >= 3) for (const i of a) out[i] = 'tile frame';
  for (const a of lines.values()) if (a.length >= 3) for (const i of a) out[i] = 'tile frame / cut mark';
  return out;
}

/** Greedy cosine clustering, longest reliable chains first. Returns look per chain (-1 = none). */
export function clusterLooks(chains: Chain[], sigs: Signature[], include: boolean[]): { look: number[]; centroids: Float64Array[]; weight: number[] } {
  const look = new Array(chains.length).fill(-1);
  const centroids: Float64Array[] = [];
  const weight: number[] = [];
  const order = chains
    .map((_, i) => i)
    .filter((i) => include[i] && sigs[i].reliable)
    .sort((a, b) => chains[b].lengthMm - chains[a].lengthMm);
  for (const i of order) {
    const v = sigs[i].vec;
    let best = -1;
    let bc = 0;
    centroids.forEach((c, k) => {
      const s = cosine(v, c);
      if (s > bc) {
        bc = s;
        best = k;
      }
    });
    if (best >= 0 && bc >= LOOK.minCos) {
      const w = weight[best];
      const L = chains[i].lengthMm;
      const c = centroids[best];
      for (let k = 0; k < c.length; k++) c[k] = (c[k] * w + v[k] * L) / (w + L);
      weight[best] = w + L;
      look[i] = best;
    } else {
      centroids.push(Float64Array.from(v));
      weight.push(chains[i].lengthMm);
      look[i] = centroids.length - 1;
    }
  }
  // unreliable chains join a look only when they match it closely
  chains.forEach((c, i) => {
    if (!include[i] || look[i] >= 0) return;
    let best = -1;
    let bc = 0;
    centroids.forEach((cc, k) => {
      const s = cosine(sigs[i].vec, cc);
      if (s > bc) {
        bc = s;
        best = k;
      }
    });
    if (best >= 0 && bc >= LOOK.attachCos) look[i] = best;
  });
  return { look, centroids, weight };
}

/**
 * Public, data-only classification (contract `classifyChains`): chains drawn with the same style and
 * the same (quantised) motif form one class. No roles are guessed here beyond 'internal'; the
 * pipeline (buildChains) assigns sizes and common lines with bundles and evidence.
 */
export function classifyChains(chains: Chain[]): LineClass[] {
  const groups = new Map<string, Chain[]>();
  for (const c of chains) {
    const m = c.motif ? c.motif.map((v) => (Math.round(v / PATIMPORT.motifQuantMm) * PATIMPORT.motifQuantMm).toFixed(2)).join('/') : 'solid';
    const k = `${c.style}|${m}`;
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  let id = 0;
  return [...groups.values()]
    .map((g) => {
      const ev: ClassEvidence[] = g[0].motif ? [{ kind: 'recovered-motif', motif: g[0].motif }] : [];
      return {
        id: id++,
        role: 'internal' as const,
        sizeLabel: null,
        chains: g.map((c) => c.id),
        totalLengthMm: g.reduce((a, c) => a + c.lengthMm, 0),
        evidence: ev,
        confidence: 0.3,
      };
    })
    .sort((a, b) => b.totalLengthMm - a.totalLengthMm);
}

/** Declared dash clusters (3 % tolerance, Ф0: reef 4.88/4.89/4.90 are one style). */
export function dashCluster(dashes: { dash: number[]; len: number }[]): { rep: number[]; members: number[]; len: number }[] {
  const out: { rep: number[]; members: number[]; len: number }[] = [];
  const order = dashes.map((_, i) => i).sort((a, b) => dashes[b].len - dashes[a].len);
  for (const i of order) {
    const d = normDash(dashes[i].dash);
    const hit = out.find((c) => c.rep.length === d.length && c.rep.every((v, k) => Math.abs(v - d[k]) <= Math.max(0.06, 0.03 * Math.max(v, d[k]))));
    if (hit) {
      hit.members.push(i);
      hit.len += dashes[i].len;
    } else out.push({ rep: d, members: [i], len: dashes[i].len });
  }
  return out;
}

export function midPoint(c: Chain): PtMm {
  return c.pts[Math.floor(c.pts.length / 2)];
}

export { bboxOf };
