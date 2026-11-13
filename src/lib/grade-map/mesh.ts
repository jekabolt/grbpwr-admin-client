// Grade map · transfer inside a piece: one constrained triangulation of the base piece (cut ring at
// its nodes plus points at most 5 mm apart, bound notches and internal lines as constraints, drills
// as points; no interior Steiner grid), the same connectivity in every size, piecewise-affine forward
// and an analytic inverse found through a bucket grid. A flipped or degenerate triangle in a size
// refuses that size pair — after the mark tracks whose vertices sit in flipped triangles have been
// dropped from the mesh, worst first (one connectivity for all sizes, so such a track leaves every
// size's mesh). firstPass keeps what the strict rule (every mark in) would have refused.

import type { PtMm } from 'lib/pattern-import/types';
import { triangulate, type Tri } from './cdt';
import { dist, distanceToPolyline, pathOf, pointAt, pointInRing, project } from './geom';
import type { TrackKind } from './types';

/**
 * An interior point closer to the ring than this is not inserted (snapped to a ring vertex when one
 * is this near): two vertices this close with their own images make a sliver that flips on any
 * relative motion, and what such a point carries is the cut's own displacement within 0.1 mm.
 */
const RING_CLEAR_MM = 1;
/** Interior points closer than this to an accepted vertex merge into it, or to another mark's line are dropped. */
const MERGE_MM = 1;
/** Consecutive ring vertices closer than this merge. */
const RING_MERGE_MM = 0.05;
/** An image triangle smaller than this share of its base triangle is degenerate. */
const DEGENERATE_SHARE = 1e-3;
/** Mark tracks dropped from the mesh and rebuilt at most this many times. */
const MAX_REBUILDS = 24;
/** A flip within this distance of a base notch node is a notch flip. */
const NOTCH_NEAR_MM = 3;
/** A flip within this distance of a sharp concave cut corner is a dart flip. */
const DART_NEAR_MM = 5;
/** A cut corner turning further than this (degrees, inward) over ±2 mm is sharp and concave. */
const DART_TURN_DEG = 60;

/** One element of the mesh: its base polyline and each size's image of it (same length). */
export type MeshPart = {
  /** Index of the track in the piece. */
  track: number;
  kind: TrackKind;
  closed: boolean;
  base: PtMm[];
  images: Map<number, PtMm[]>;
};

export type MeshSource = {
  /** The cut, base ring counter-clockwise; its images are each carried size's cut. */
  ring: MeshPart;
  /** Notches and internal lines (constrained polylines), drills (single points); each carried in every size. */
  parts: MeshPart[];
  /** Base nodes of notches on the cut (for classifying flips). */
  notchNodes: PtMm[];
  /** The live base cut (for classifying flips at sharp concave corners). */
  baseCut: PtMm[];
  /** The sizes the cut is carried to. */
  sizes: number[];
};

type Grid = {
  minX: number;
  minY: number;
  cell: number;
  nx: number;
  ny: number;
  cells: number[][];
};

export type GmSizeMesh =
  | { ok: true; pts: PtMm[]; grid: Grid }
  | { ok: false; reason: string; flips: number; degenerate: number };

export type GmMesh = {
  pts: PtMm[];
  tris: Tri[];
  grid: Grid | null;
  /** Mark tracks dropped from the mesh because their vertices flipped in some size. */
  excluded: number[];
  skippedPoints: number;
  skippedSegments: number;
  failed: string | null;
  sizes: Map<number, GmSizeMesh>;
  /** Per size: bad (flipped or degenerate) triangles with every carried mark in the mesh. */
  firstPass: Map<number, number>;
};

const area2 = (a: PtMm, b: PtMm, c: PtMm) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function gridOf(pts: readonly PtMm[], tris: readonly Tri[]): Grid {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const side = Math.max(1, Math.ceil(Math.sqrt(tris.length)));
  const cell = Math.max((maxX - minX) / side, (maxY - minY) / side, 1e-3);
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
  const ny = Math.max(1, Math.ceil((maxY - minY) / cell) + 1);
  const cells: number[][] = Array.from({ length: nx * ny }, () => []);
  tris.forEach(([a, b, c], id) => {
    const xs = [pts[a].x, pts[b].x, pts[c].x];
    const ys = [pts[a].y, pts[b].y, pts[c].y];
    const x0 = Math.floor((Math.min(...xs) - minX) / cell);
    const x1 = Math.floor((Math.max(...xs) - minX) / cell);
    const y0 = Math.floor((Math.min(...ys) - minY) / cell);
    const y1 = Math.floor((Math.max(...ys) - minY) / cell);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * nx + x].push(id);
  });
  return { minX, minY, cell, nx, ny, cells };
}

function bary(p: PtMm, a: PtMm, b: PtMm, c: PtMm): [number, number, number] {
  const d = area2(a, b, c);
  const u = area2(p, b, c) / d;
  const v = area2(a, p, c) / d;
  return [u, v, 1 - u - v];
}

function distToTri(p: PtMm, a: PtMm, b: PtMm, c: PtMm): number {
  const [u, v, w] = bary(p, a, b, c);
  if (u >= 0 && v >= 0 && w >= 0) return 0;
  return distanceToPolyline(p, [a, b, c], true);
}

/** The triangle holding p (or the nearest one) and p's barycentric weights in it. */
function locate(
  pts: readonly PtMm[],
  tris: readonly Tri[],
  grid: Grid,
  p: PtMm,
): { id: number; w: [number, number, number] } | null {
  if (!tris.length) return null;
  const x = Math.floor((p.x - grid.minX) / grid.cell);
  const y = Math.floor((p.y - grid.minY) / grid.cell);
  if (x >= 0 && y >= 0 && x < grid.nx && y < grid.ny) {
    let best = -1;
    let bestMin = -Infinity;
    for (const id of grid.cells[y * grid.nx + x]) {
      const [a, b, c] = tris[id];
      const w = bary(p, pts[a], pts[b], pts[c]);
      const m = Math.min(...w);
      if (m > bestMin) [best, bestMin] = [id, m];
      if (m >= 0) return { id, w };
    }
    if (best >= 0 && bestMin > -1e-9) {
      const [a, b, c] = tris[best];
      return { id: best, w: bary(p, pts[a], pts[b], pts[c]) };
    }
  }
  // outside every triangle: the nearest one, extrapolated
  let best = 0;
  let bestD = Infinity;
  tris.forEach(([a, b, c], id) => {
    const d = distToTri(p, pts[a], pts[b], pts[c]);
    if (d < bestD) [best, bestD] = [id, d];
  });
  const [a, b, c] = tris[best];
  return { id: best, w: bary(p, pts[a], pts[b], pts[c]) };
}

function apply(pts: readonly PtMm[], t: Tri, w: [number, number, number]): PtMm {
  const [a, b, c] = t;
  return {
    x: w[0] * pts[a].x + w[1] * pts[b].x + w[2] * pts[c].x,
    y: w[0] * pts[a].y + w[1] * pts[b].y + w[2] * pts[c].y,
  };
}

/** Base → size. null when the size pair is refused. */
export function forward(mesh: GmMesh, sizeId: number, p: PtMm): PtMm | null {
  const s = mesh.sizes.get(sizeId);
  if (!s?.ok || !mesh.grid) return null;
  const at = locate(mesh.pts, mesh.tris, mesh.grid, p);
  return at ? apply(s.pts, mesh.tris[at.id], at.w) : null;
}

/** Size → base, the analytic inverse of forward. null when the size pair is refused. */
export function inverse(mesh: GmMesh, sizeId: number, q: PtMm): PtMm | null {
  const s = mesh.sizes.get(sizeId);
  if (!s?.ok) return null;
  const at = locate(s.pts, mesh.tris, s.grid, q);
  return at ? apply(mesh.pts, mesh.tris[at.id], at.w) : null;
}

type Assembled = {
  ring: PtMm[];
  pts: PtMm[];
  /** Per vertex: owning track (-1 = cut) and each size's image. */
  owner: number[];
  images: Map<number, PtMm[]>;
  segments: [number, number][];
};

/** Indices bucketed by 2 mm cells: every query below looks no further than 1 mm. */
class Buckets {
  private readonly cells = new Map<number, number[]>();
  private static readonly CELL = 2;
  private static key(ix: number, iy: number) {
    return (ix + 500000) * 1000000 + (iy + 500000);
  }
  private push(ix: number, iy: number, i: number) {
    const k = Buckets.key(ix, iy);
    const c = this.cells.get(k);
    if (c) c.push(i);
    else this.cells.set(k, [i]);
  }
  addBox(i: number, a: PtMm, b: PtMm) {
    const C = Buckets.CELL;
    for (
      let ix = Math.floor(Math.min(a.x, b.x) / C);
      ix <= Math.floor(Math.max(a.x, b.x) / C);
      ix++
    )
      for (
        let iy = Math.floor(Math.min(a.y, b.y) / C);
        iy <= Math.floor(Math.max(a.y, b.y) / C);
        iy++
      )
        this.push(ix, iy, i);
  }
  /** Every index whose box touches the 3 × 3 cells around p (an index may repeat). */
  near(p: PtMm): number[] {
    const C = Buckets.CELL;
    const ix = Math.floor(p.x / C);
    const iy = Math.floor(p.y / C);
    const out: number[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const c = this.cells.get(Buckets.key(ix + dx, iy + dy));
        if (c) out.push(...c);
      }
    return out;
  }
}

function assemble(src: MeshSource, excluded: ReadonlySet<number>): Assembled {
  const ring: PtMm[] = [];
  const owner: number[] = [];
  const images = new Map<number, PtMm[]>(src.sizes.map((z) => [z, []]));
  src.ring.base.forEach((p, i) => {
    if (ring.length && dist(ring[ring.length - 1], p) < RING_MERGE_MM) return;
    if (i === src.ring.base.length - 1 && ring.length && dist(ring[0], p) < RING_MERGE_MM) return;
    ring.push(p);
    owner.push(-1);
    for (const z of src.sizes) images.get(z)!.push(src.ring.images.get(z)![i]);
  });
  const pts = [...ring];
  const segments: [number, number][] = [];
  const ringEdges = new Buckets();
  ring.forEach((p, i) => ringEdges.addBox(i, p, ring[(i + 1) % ring.length]));
  const vertices = new Buckets();
  const segs = new Buckets();
  const nearRing = (p: PtMm): boolean =>
    ringEdges
      .near(p)
      .some(
        (i) => distanceToPolyline(p, [ring[i], ring[(i + 1) % ring.length]], false) < RING_CLEAR_MM,
      );
  const nearRingVertex = (p: PtMm): number => {
    let best = -1;
    let bestD = RING_CLEAR_MM;
    for (const i of ringEdges.near(p)) {
      const d = dist(ring[i], p);
      if (d < bestD || (d === bestD && i > best)) [best, bestD] = [i, d];
    }
    return best;
  };
  const mergeInto = (p: PtMm): number => {
    let k = -1;
    for (const j of vertices.near(p)) if (dist(pts[j], p) < MERGE_MM && (k < 0 || j < k)) k = j;
    return k;
  };
  // a point hugging another mark's line would make a sliver that flips on any relative motion
  const nearSegment = (p: PtMm, track: number): boolean =>
    segs.near(p).some((si) => {
      const [a, b] = segments[si];
      return (
        owner[a] !== track &&
        owner[b] !== track &&
        distanceToPolyline(p, [pts[a], pts[b]], false) < MERGE_MM
      );
    });
  for (const part of src.parts) {
    if (excluded.has(part.track)) continue;
    const ids: number[] = part.base.map((p, i) => {
      if (nearRing(p)) return nearRingVertex(p);
      const k = mergeInto(p);
      if (k >= 0) return k;
      if (nearSegment(p, part.track)) return -1;
      pts.push(p);
      owner.push(part.track);
      for (const z of src.sizes) images.get(z)!.push(part.images.get(z)![i]);
      vertices.addBox(pts.length - 1, p, p);
      return pts.length - 1;
    });
    if (part.kind === 'drill') continue;
    const n = ids.length;
    for (let i = 0; i < (part.closed ? n : n - 1); i++) {
      const a = ids[i];
      const b = ids[(i + 1) % n];
      if (a >= 0 && b >= 0 && a !== b) {
        segments.push([a, b]);
        segs.addBox(segments.length - 1, pts[a], pts[b]);
      }
    }
  }
  return { ring, pts, owner, images, segments };
}

/** Inward turn (degrees) of the base cut at each point, read over ±2 mm of arc. */
function sharpConcave(baseCut: readonly PtMm[]): PtMm[] {
  const path = pathOf(baseCut, true);
  if (!path) return [];
  const out: PtMm[] = [];
  for (let i = 0; i < path.pts.length; i++) {
    const s = path.cum[i];
    const a = pointAt(path, s - 2);
    const p = path.pts[i];
    const b = pointAt(path, s + 2);
    const turn =
      (Math.atan2(
        (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x),
        (p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y),
      ) *
        180) /
      Math.PI;
    if (turn < -DART_TURN_DEG) out.push(p);
  }
  return out;
}

export function buildMesh(src: MeshSource): GmMesh {
  const excluded = new Set<number>();
  const firstPass = new Map<number, number>();
  for (let attempt = 0; ; attempt++) {
    const asm = assemble(src, excluded);
    const points = asm.pts.slice(asm.ring.length);
    const tri = triangulate(asm.ring, points, asm.segments);
    const sizes = new Map<number, GmSizeMesh>();
    if (tri.failed) {
      for (const z of src.sizes)
        sizes.set(z, { ok: false, reason: `ring: ${tri.failed}`, flips: 0, degenerate: 0 });
      return {
        pts: tri.pts,
        tris: [],
        grid: null,
        excluded: [...excluded].sort((a, b) => a - b),
        skippedPoints: tri.skippedPoints,
        skippedSegments: tri.skippedSegments,
        failed: tri.failed,
        sizes,
        firstPass,
      };
    }
    const badBy = new Map<number, number[]>();
    const culprits = new Map<number, number>();
    for (const z of src.sizes) {
      const img = asm.images.get(z)!;
      const bad: number[] = [];
      tri.tris.forEach(([a, b, c], id) => {
        const A0 = area2(tri.pts[a], tri.pts[b], tri.pts[c]);
        const A1 = area2(img[a], img[b], img[c]);
        if (A1 <= 0 || A1 < DEGENERATE_SHARE * A0) bad.push(id);
      });
      badBy.set(z, bad);
      if (!attempt) firstPass.set(z, bad.length);
      for (const id of bad)
        for (const v of tri.tris[id]) {
          const t = asm.owner[v];
          if (t >= 0) culprits.set(t, (culprits.get(t) ?? 0) + 1);
        }
    }
    if (culprits.size && attempt < MAX_REBUILDS) {
      // worst first: the tracks in most bad triangles leave; their neighbours get another chance
      const most = Math.max(...culprits.values());
      for (const [t, n] of culprits) if (n * 2 >= most) excluded.add(t);
      continue;
    }
    const sharp = sharpConcave(src.baseCut);
    for (const z of src.sizes) {
      const img = asm.images.get(z)!;
      const bad = badBy.get(z)!;
      if (!bad.length) {
        sizes.set(z, { ok: true, pts: img, grid: gridOf(img, tri.tris) });
        continue;
      }
      let flips = 0;
      let degenerate = 0;
      let nearNotch = 0;
      let nearDart = 0;
      for (const id of bad) {
        const [a, b, c] = tri.tris[id];
        const A1 = area2(img[a], img[b], img[c]);
        if (A1 <= 0) flips++;
        else degenerate++;
        const corners = [tri.pts[a], tri.pts[b], tri.pts[c]];
        if (src.notchNodes.some((n) => corners.some((p) => dist(p, n) <= NOTCH_NEAR_MM)))
          nearNotch++;
        else if (sharp.some((n) => corners.some((p) => dist(p, n) <= DART_NEAR_MM))) nearDart++;
      }
      const where =
        nearNotch >= Math.max(nearDart, bad.length - nearNotch - nearDart)
          ? 'notch'
          : nearDart >= bad.length - nearNotch - nearDart
            ? 'dart'
            : 'cut';
      const what = flips ? 'flip' : 'degenerate';
      sizes.set(z, {
        ok: false,
        reason: `${what}-${where}: ${flips} flipped, ${degenerate} degenerate of ${tri.tris.length}`,
        flips,
        degenerate,
      });
    }
    return {
      pts: tri.pts,
      tris: tri.tris,
      grid: gridOf(tri.pts, tri.tris),
      excluded: [...excluded].sort((a, b) => a - b),
      skippedPoints: tri.skippedPoints,
      skippedSegments: tri.skippedSegments,
      failed: null,
      sizes,
      firstPass,
    };
  }
}

/** Points inside the base mesh, quasi-random (Halton 2, 3) and deterministic. */
export function samplesInside(mesh: GmMesh, ring: readonly PtMm[], n: number): PtMm[] {
  if (!mesh.tris.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const halton = (i: number, b: number) => {
    let f = 1;
    let r = 0;
    while (i > 0) {
      f /= b;
      r += f * (i % b);
      i = Math.floor(i / b);
    }
    return r;
  };
  const out: PtMm[] = [];
  const path = pathOf(ring, true);
  for (let i = 1; out.length < n && i < n * 200; i++) {
    const p = { x: minX + (maxX - minX) * halton(i, 2), y: minY + (maxY - minY) * halton(i, 3) };
    if (!pointInRing(p, ring)) continue;
    if (path && project(path, p).d < 0.01) continue;
    out.push(p);
  }
  return out;
}
