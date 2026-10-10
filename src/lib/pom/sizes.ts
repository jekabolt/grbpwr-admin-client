// Per size (§5.5): the edge roles and seams are read ONCE on the base size and carried to every
// graded block by edge index. When grading changed a piece's corners (a different edge count, or
// edges whose lengths no longer correspond), that piece is re-segmented on its own, its edges are
// matched to the base edges by position, and the size says so («regraded»).

import { drillPoints, segmentPiece } from 'lib/assembly-skeleton/geometry';
import type { Edge, EdgeId, PieceGeom, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import { bboxOf, chordTilt, meanX, meanY } from './geom';
import { edgeMap, type Model, type ModelSeam } from './model';
import type { RoleReading } from './types';
import { classifyEdges } from './roles';
import { grainRotation, rotatePt, uprightGeom, type Upright } from './upright';

const LEN_RATIO = [0.8, 1.25] as const;

/**
 * The same edges in the same order, possibly starting at another corner (a graded contour can
 * begin anywhere): the cyclic shift that pairs every edge with one of corresponding length and
 * direction, or null when grading changed the corners.
 */
function cyclicShift(a: PieceGeom, b: PieceGeom): number | null {
  const n = a.edges.length;
  if (!n || n !== b.edges.length) return null;
  let best: { r: number; cost: number } | null = null;
  for (let r = 0; r < n; r++) {
    let cost = 0;
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const e = a.edges[i];
      const f = b.edges[(i + r) % n];
      const ratio = f.lenMm / Math.max(1, e.lenMm);
      if (
        ratio < LEN_RATIO[0] ||
        ratio > LEN_RATIO[1] ||
        Math.abs(chordTilt(e) - chordTilt(f)) > 15
      )
        ok = false;
      cost += Math.abs(Math.log(Math.max(ratio, 1e-6)));
    }
    if (ok && (!best || cost < best.cost)) best = { r, cost };
  }
  return best?.r ?? null;
}

/** Base edge id → size edge id, by normalized position + tilt + length. */
function matchByPosition(base: PieceGeom, size: PieceGeom): Map<EdgeId, EdgeId> {
  const norm = (g: PieceGeom) => {
    const bb = bboxOf(g.rs);
    return (e: Edge) => ({
      u: (meanX(e.pts) - bb.x0) / Math.max(1, bb.w),
      v: (meanY(e.pts) - bb.y0) / Math.max(1, bb.h),
      t: chordTilt(e) / 90,
      l: e.lenMm / Math.max(1, g.perimMm),
    });
  };
  const nb = norm(base);
  const ns = norm(size);
  const pairs: { b: Edge; s: Edge; c: number }[] = [];
  for (const b of base.edges) {
    const fb = nb(b);
    for (const s of size.edges) {
      const fs = ns(s);
      pairs.push({
        b,
        s,
        c:
          Math.abs(fb.u - fs.u) +
          Math.abs(fb.v - fs.v) +
          0.5 * Math.abs(fb.t - fs.t) +
          2 * Math.abs(fb.l - fs.l),
      });
    }
  }
  pairs.sort((x, y) => x.c - y.c);
  const out = new Map<EdgeId, EdgeId>();
  const used = new Set<EdgeId>();
  for (const p of pairs) {
    if (out.has(p.b.id) || used.has(p.s.id) || p.c > 0.35) continue;
    out.set(p.b.id, p.s.id);
    used.add(p.s.id);
  }
  return out;
}

/** The base model carried onto one graded size. */
export function transferModel(
  base: Model,
  size: string,
  inputs: readonly SkeletonPieceInput[],
): { model: Model; regraded: string[] } {
  const byKey = new Map(inputs.map((p) => [p.pieceKey, p]));
  const geoms = new Map<string, PieceGeom>();
  const drills = new Map<string, [number, number][]>();
  const upright = new Map<string, Upright>();
  const idMap = new Map<EdgeId, EdgeId>();
  const regraded: string[] = [];
  const warnings: string[] = [];
  for (const [key, bg] of base.geoms) {
    const inp = byKey.get(key);
    if (!inp) {
      warnings.push(`${key} has no block in size ${size}`);
      continue;
    }
    const { geom: g, up } = uprightGeom(
      { ...segmentPiece(inp), twinOf: bg.twinOf },
      grainRotation(inp.piece),
    );
    geoms.set(key, g);
    upright.set(key, up);
    drills.set(
      key,
      drillPoints(inp.piece).map((p) => rotatePt(p, up.deg, up.c)),
    );
    const shift = cyclicShift(bg, g);
    if (shift != null)
      bg.edges.forEach((e, i) => idMap.set(e.id, g.edges[(i + shift) % g.edges.length].id));
    else {
      regraded.push(key);
      for (const [b, s] of matchByPosition(bg, g)) idMap.set(b, s);
    }
  }
  const seams: ModelSeam[] = [];
  for (const s of base.seams) {
    const a = s.a.map((id) => idMap.get(id));
    const b = s.b.map((id) => idMap.get(id));
    if (a.every(Boolean) && b.every(Boolean))
      seams.push({ ...s, a: a as EdgeId[], b: b as EdgeId[] });
  }
  const model: Model = {
    size,
    garment: base.garment,
    geoms,
    info: base.info,
    edges: edgeMap(geoms.values()),
    seams,
    roles: new Map(),
    drills,
    upright,
    warnings,
  };
  // A regraded piece is read again on its own (its seams carried by position); every other piece
  // keeps the base size's roles edge for edge.
  const fresh = regraded.length ? classifyEdges(model) : new Map<EdgeId, RoleReading>();
  const roles = new Map<EdgeId, RoleReading>();
  for (const [id, r] of fresh) {
    if (regraded.includes(id.slice(0, id.lastIndexOf('#'))))
      roles.set(id, { ...r, why: `${r.why} (read again: grading changed the contour)` });
  }
  for (const [b, r] of base.roles) {
    if (regraded.includes(b.slice(0, b.lastIndexOf('#')))) continue;
    const s = idMap.get(b);
    if (s) roles.set(s, r);
  }
  model.roles = roles;
  return { model, regraded };
}
