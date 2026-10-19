// The piece's own frame and its runs — what an anchor is written in and resolved against.
//
// Frame: the sewing loop (`PieceGeom.rs`, mm, CCW) turned upright by its grain line (lib/pom
// `grainRotation`: within ±8° of vertical, else the drawing frame stays), then its bbox as the unit
// square. Invariant to the start vertex, re-segmentation (a run is found by where it lies, not by
// its corner number), translation and scale (grading); a 180° turn or a mirrored export is covered
// by trying the other frames at resolution time.

import type { Edge, EdgeId, PieceGeom, Pt2, SkeletonFacts } from 'lib/assembly-skeleton/types';
import { grainRotation, rotatePt } from 'lib/pom/upright';
import type { Frame } from './types';

export const SHARES = [0, 0.25, 0.5, 0.75, 1] as const;

export type PieceFrame = {
  pieceKey: string;
  deg: number;
  c: Pt2;
  x0: number;
  y0: number;
  w: number;
  h: number;
};

/** Grain turn per piece key, from the card facts (the PieceDTO carries the grain line). */
export function grainDegOf(facts: SkeletonFacts): Map<string, number> {
  return new Map(facts.pieces.map((p) => [p.pieceKey, grainRotation(p.piece)]));
}

export function frameOf(piece: PieceGeom, deg = 0): PieceFrame {
  const bb = (pts: readonly Pt2[]) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of pts) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1 };
  };
  const rs = piece.rs.length ? piece.rs : ([[0, 0]] as Pt2[]);
  const b0 = bb(rs);
  const c: Pt2 = [(b0.x0 + b0.x1) / 2, (b0.y0 + b0.y1) / 2];
  const b = deg ? bb(rs.map((p) => rotatePt(p, deg, c))) : b0;
  return {
    pieceKey: piece.pieceKey,
    deg,
    c,
    x0: b.x0,
    y0: b.y0,
    w: Math.max(b.x1 - b.x0, 1e-6),
    h: Math.max(b.y1 - b.y0, 1e-6),
  };
}

/** A drawing point (mm, `rs` frame) → the piece's unit square. */
export function toUV(f: PieceFrame, p: Pt2): Pt2 {
  const q = f.deg ? rotatePt(p, f.deg, f.c) : p;
  return [(q[0] - f.x0) / f.w, (q[1] - f.y0) / f.h];
}

/** Points at the given shares of the polyline's arc length. */
export function sampleAt(pts: readonly Pt2[], shares: readonly number[]): Pt2[] {
  if (pts.length === 0) return shares.map(() => [0, 0]);
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const out: Pt2[] = [];
  let j = 0;
  for (const s of shares) {
    const t = s * total;
    while (j < cum.length - 2 && cum[j + 1] < t) j++;
    if (pts.length === 1) {
      out.push([pts[0][0], pts[0][1]]);
      continue;
    }
    const f = Math.max(0, Math.min(1, (t - cum[j]) / (cum[j + 1] - cum[j] || 1)));
    out.push([
      pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f,
      pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f,
    ]);
  }
  return out;
}

/** A single edge or up to `maxChain` neighbouring edges of one piece, read as one run. */
export type SeamRun = {
  id: EdgeId;
  edges: Edge[];
  pts: Pt2[];
  lenMm: number;
  notches: number;
  turnDeg: number;
};

/** Every edge, and every chain of 2..maxChain contiguous neighbours (never the whole loop). */
export function runsOfPiece(piece: PieceGeom, maxChain = 3): SeamRun[] {
  const es = piece.edges;
  const out: SeamRun[] = es.map((e) => ({
    id: e.id,
    edges: [e],
    pts: e.pts,
    lenMm: e.lenMm,
    notches: e.notchesMm.length,
    turnDeg: e.turnDeg,
  }));
  for (let len = 2; len <= maxChain && len < es.length; len++) {
    for (let i = 0; i < es.length; i++) {
      const chain: Edge[] = [es[i]];
      for (let j = 1; j < len; j++) {
        const next = es[(i + j) % es.length];
        if (next.s !== chain[chain.length - 1].e) break;
        chain.push(next);
      }
      if (chain.length !== len) continue;
      const pts = chain.flatMap((e, k) => (k === 0 ? e.pts : e.pts.slice(1)));
      out.push({
        id: `${piece.pieceKey}#${chain.map((e) => e.k).join('+')}`,
        edges: chain,
        pts,
        lenMm: chain.reduce((s, e) => s + e.lenMm, 0),
        notches: chain.reduce((s, e) => s + e.notchesMm.length, 0),
        turnDeg: chain.reduce((s, e) => s + e.turnDeg, 0),
      });
    }
  }
  return out;
}

/** The run a stored hint names on this piece, if the piece still has it. */
export function runById(piece: PieceGeom, id: EdgeId, maxChain = 3): SeamRun | undefined {
  return runsOfPiece(piece, maxChain).find((r) => r.id === id);
}

/** Five samples of a run in the piece's unit square, walk order. */
export function runSamples(f: PieceFrame, run: { pts: readonly Pt2[] }): Pt2[] {
  return sampleAt(run.pts, SHARES).map((p) => toUV(f, p));
}

/** Candidate samples read in the ANCHOR's frame, given how today's piece sits against it. */
export function inFrame(samples: readonly Pt2[], frame: Frame): Pt2[] {
  switch (frame) {
    case 'asis':
      return samples.map((p) => [p[0], p[1]]);
    case 'rot180':
      return samples.map((p) => [1 - p[0], 1 - p[1]]);
    // A mirrored export is re-walked CCW, so the run's direction flips with it.
    case 'mirrorU':
      return [...samples].reverse().map((p) => [1 - p[0], p[1]]);
    case 'mirrorV':
      return [...samples].reverse().map((p) => [p[0], 1 - p[1]]);
  }
}

export const FRAMES: readonly Frame[] = ['asis', 'rot180', 'mirrorU', 'mirrorV'];
export const reverses = (f: Frame) => f === 'mirrorU' || f === 'mirrorV';

export function rmsFit(a: readonly Pt2[], b: readonly Pt2[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i][0] - b[i][0]) ** 2 + (a[i][1] - b[i][1]) ** 2;
  return Math.sqrt(s / Math.max(1, a.length));
}

// ── contour signature (fast path guard) ───────────────────────────────────────────────────────

function fnv(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 16 hex over the piece's segmentation as the engine numbers it: perimeter, area, and each edge's
 * index, length, notch count and start point in the unit square — so a re-export that moves the
 * start vertex, mirrors the piece or shifts a corner changes it, and the stored `edgeHint` is not
 * trusted there.
 */
export function contourSig(piece: PieceGeom, f: PieceFrame): string {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const body = [
    Math.round(piece.perimMm),
    Math.round(piece.areaMm2 / 100),
    ...piece.edges.map((e) => {
      const [u, v] = toUV(f, e.pts[0]);
      return `${e.k}:${Math.round(e.lenMm)}:${e.notchesMm.length}:${r2(u)},${r2(v)}`;
    }),
  ].join('|');
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return hex(fnv(body, 0x811c9dc5)) + hex(fnv(body, 0x050c5d1f));
}
