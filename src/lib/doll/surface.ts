// SURFACE PIECES — a fly, a pocket bag, a flap sewn onto a panel's face, not edge to edge.
//
// Which panel carries one is read from the technologist's order (the first join that sews it to a
// drawn panel); where on that panel from the drawing: a mark inside the panel the piece's size (a
// fly's J-stitch, a pocket's placement line), else the panel corner the piece fits — its two edges
// along the panel's two edges, the piece kept face up (grain within 20°), wholly on the panel. The
// piece is then lifted onto the solved panel (barycentric, a couple of mm under its face — inside the garment): it is
// drawn where it is sewn, not solved, and its place is a reading, said in words.

import { readName } from 'lib/assembly-skeleton/skeleton';
import { apply, rigid } from 'lib/assembly-skeleton/union/affine';
import type { Affine, Edge, EdgeId, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

import type { DeclaredJoin } from './joins';

export type SurfaceHost = { host: string; join: string };

type FlapRow = {
  status: 'confirmed' | 'rejected';
  sideA: readonly { piece: string }[];
  sideB: readonly { piece: string }[];
};

export type InferredFlapPlacement = {
  part: string;
  host: string;
  pocket: string;
  T: Affine;
  attach: EdgeId;
  mouth: EdgeId;
  how: string;
};

/**
 * The panel each surface piece is sewn onto, from the order: the first join (in the order's
 * sequence) whose other side holds a drawn panel — the largest of them when it holds several.
 */
export function surfaceHosts(
  surface: readonly string[],
  joins: readonly DeclaredJoin[],
  drawnArea: ReadonlyMap<string, number>,
): Map<string, SurfaceHost> {
  const out = new Map<string, SurfaceHost>();
  for (const k of surface)
    for (const J of joins) {
      const mine = J.parts.findIndex((X) => X.includes(k));
      if (mine < 0) continue;
      let best: string | null = null;
      for (const [i, X] of J.parts.entries()) {
        if (i === mine) continue;
        for (const o of X)
          if (drawnArea.has(o) && (!best || drawnArea.get(o)! > drawnArea.get(best)!)) best = o;
      }
      if (best) {
        out.set(k, { host: best, join: J.label });
        break;
      }
    }
  return out;
}

export type SurfaceFit = {
  /** Piece frame → host frame (a point past the host's edge comes back folded under it). */
  map: (p: Pt2) => Pt2;
  /** The piece lies face down (mirrored) on the host. */
  flip: boolean;
  /** Share of the piece's contour on the host panel, as drawn (after the fold). */
  cover: number;
  /** Share of the piece that reached past the host's edge before the fold, 0..1. */
  past: number;
  /** The point (piece frame) lies on the part folded under the host's edge. */
  under?: (p: Pt2) => boolean;
  /** How the place was read, in words. */
  how: string;
};

/**
 * A point past the host's edge folded back under the host: reflected across the nearest edge
 * segment's line — the fold line IS the panel's edge (a fly shield turned to the inside, a facing
 * pressed round the edge). A point on the host is returned as it is.
 */
function foldUnder(q: Pt2, ring: readonly Pt2[], H: PolyIndex): Pt2 {
  if (H.covers(q)) return q;
  let best: [Pt2, Pt2] | null = null;
  let bd = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = segD(q, ring[j], ring[i]);
    if (d < bd) {
      bd = d;
      best = [ring[j], ring[i]];
    }
  }
  if (!best) return q;
  const [a, b] = best;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return q;
  const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2;
  const px = a[0] + t * dx;
  const py = a[1] + t * dy;
  return [2 * px - q[0], 2 * py - q[1]];
}

const box = (pts: readonly Pt2[]) => {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
};

const segD = (p: Pt2, a: Pt2, b: Pt2) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
};
const ringD = (p: Pt2, ring: readonly Pt2[]) => {
  let d = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    d = Math.min(d, segD(p, ring[j], ring[i]));
  return d;
};

const ROW = 8;
const CELL = 8;
/**
 * A host contour indexed for the cover test — exactly `pointInPolygon(p, ring) || ringD(p, ring)
 * <= 3`, without walking the whole contour for every point: the even–odd crossing test runs over
 * the segments whose y-span holds the point (rows of ROW mm), the 3 mm line test over the segments
 * within one cell of it (a grid of CELL mm). 11.10 corpus: SS26-011's pocket bags against a
 * 2 700-point leg panel, tried in every corner both ways round, took 2 s of a 3.4 s solve here.
 */
class PolyIndex {
  private readonly x0: number;
  private readonly y0: number;
  private readonly x1: number;
  private readonly y1: number;
  private readonly rows: number[][] = [];
  private readonly cells = new Map<number, number[]>();
  private readonly nx: number;
  constructor(private readonly ring: readonly Pt2[]) {
    const b = box(ring);
    this.x0 = b.x0;
    this.y0 = b.y0;
    this.x1 = b.x1;
    this.y1 = b.y1;
    this.nx = Math.floor(b.w / CELL) + 1;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = ring[i];
      const c = ring[j];
      // Rows: a segment straddles only a y inside [min, max).
      const r0 = Math.floor((Math.min(a[1], c[1]) - this.y0) / ROW);
      const r1 = Math.floor((Math.max(a[1], c[1]) - this.y0) / ROW);
      for (let r = r0; r <= r1; r++) (this.rows[r] ??= []).push(i);
      // Cells: every cell the segment's box touches.
      const cx0 = Math.floor((Math.min(a[0], c[0]) - this.x0) / CELL);
      const cx1 = Math.floor((Math.max(a[0], c[0]) - this.x0) / CELL);
      const cy0 = Math.floor((Math.min(a[1], c[1]) - this.y0) / CELL);
      const cy1 = Math.floor((Math.max(a[1], c[1]) - this.y0) / CELL);
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = cy * this.nx + cx;
          const list = this.cells.get(key);
          if (list) list.push(i);
          else this.cells.set(key, [i]);
        }
    }
  }
  /** Inside, or within 3 mm of the line. */
  covers(p: Pt2): boolean {
    if (p[0] < this.x0 - 3 || p[0] > this.x1 + 3 || p[1] < this.y0 - 3 || p[1] > this.y1 + 3)
      return false;
    const ring = this.ring;
    const n = ring.length;
    const row = this.rows[Math.floor((p[1] - this.y0) / ROW)];
    let inside = false;
    if (row)
      for (const i of row) {
        const a = ring[i];
        const b = ring[(i + n - 1) % n];
        if (a[1] > p[1] !== b[1] > p[1]) {
          const x = ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
          if (p[0] < x) inside = !inside;
        }
      }
    if (inside) return true;
    const cx0 = Math.max(0, Math.floor((p[0] - 3 - this.x0) / CELL));
    const cx1 = Math.min(this.nx - 1, Math.floor((p[0] + 3 - this.x0) / CELL));
    const cy0 = Math.max(0, Math.floor((p[1] - 3 - this.y0) / CELL));
    const cy1 = Math.floor((p[1] + 3 - this.y0) / CELL);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        const list = this.cells.get(cy * this.nx + cx);
        if (!list) continue;
        for (const i of list) if (segD(p, ring[(i + n - 1) % n], ring[i]) <= 3) return true;
      }
    return false;
  }
}

/**
 * Share of `pts` on the host polygon (inside, or within 3 mm of its line). With `need`, the count
 * stops once the share can no longer reach it (the value returned is then only «below need»).
 */
function coverOf(pts: readonly Pt2[], H: PolyIndex, need = 0): number {
  let n = 0;
  let miss = 0;
  // Misses the share can still take (an integer: the verdict must be the one a full count gives).
  const allow = Math.floor((1 - need) * pts.length + 1e-6);
  for (const p of pts) {
    if (H.covers(p)) n++;
    else if (++miss > allow) break;
  }
  return pts.length ? n / pts.length : 0;
}

const wrap = (a: number) => {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
};
const DEG = Math.PI / 180;

/** Point `d` mm along the ring from index i, forward (+1) or back (−1), stopping at index `stop`. */
function along(ring: readonly Pt2[], i: number, dir: 1 | -1, d: number, stop: number): Pt2 {
  const n = ring.length;
  let at = i;
  let left = d;
  for (let guard = 0; guard < n; guard++) {
    const nx = (at + dir + n) % n;
    const a = ring[at];
    const b = ring[nx];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l >= left) {
      const t = left / Math.max(1e-9, l);
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    left -= l;
    at = nx;
    if (at === stop) return ring[at];
  }
  return ring[at];
}

type Corner = { p: Pt2; out: number; in: number; y: number };

/** Corners (edge starts) of a CCW ring: the directions of the edge leaving and the edge arriving. */
function cornersOf(ring: readonly Pt2[], idx: readonly number[]): Corner[] {
  const s = [...new Set(idx)].sort((a, b) => a - b);
  return s.map((i, k) => {
    const next = s[(k + 1) % s.length];
    const prev = s[(k - 1 + s.length) % s.length];
    const p = ring[i];
    const o = along(ring, i, 1, 25, next);
    const b = along(ring, i, -1, 25, prev);
    return {
      p,
      out: Math.atan2(o[1] - p[1], o[0] - p[0]),
      in: Math.atan2(b[1] - p[1], b[0] - p[0]),
      y: p[1],
    };
  });
}

const straight = (e: Edge) => e.lenMm >= 40 && e.chordMm >= 0.97 * e.lenMm;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b, 1);

/**
 * Rejected-only small paired pieces can still be read as a pocket flap: both plies share one width,
 * that width matches a same-hand pocket mouth, and a same-hand front has the matching mouth edge.
 * They are placed as proposals only; no rejected row becomes a seam.
 */
export function inferFlapPlacements(
  pieces: readonly PieceGeom[],
  rows: readonly FlapRow[],
): InferredFlapPlacement[] {
  if (!rows.length || !pieces.length) return [];
  const byKey = new Map(pieces.map((piece) => [piece.pieceKey, piece]));
  const live = new Set(
    rows
      .filter((row) => row.status !== 'rejected')
      .flatMap((row) => [...row.sideA, ...row.sideB].map((anchor) => anchor.piece)),
  );
  const maxArea = Math.max(...pieces.map((piece) => Math.abs(piece.areaMm2)), 1);
  const small = (piece: PieceGeom) => {
    const role = readName(piece.name).role;
    return (
      !live.has(piece.pieceKey) &&
      Math.abs(piece.areaMm2) <= 0.2 * maxArea &&
      (!role || role === 'pocket')
    );
  };
  type Pair = { parts: [PieceGeom, PieceGeom]; width: number; score: number };
  const pairs: Pair[] = [];
  const seenPair = new Set<string>();
  for (const row of rows) {
    if (row.status !== 'rejected') continue;
    const A = [...new Set(row.sideA.map((anchor) => anchor.piece))];
    const B = [...new Set(row.sideB.map((anchor) => anchor.piece))];
    if (A.length !== 1 || B.length !== 1 || A[0] === B[0]) continue;
    const a = byKey.get(A[0]);
    const b = byKey.get(B[0]);
    if (!a || !b || !small(a) || !small(b) || a.hand !== b.hand) continue;
    const ae = a.edges.filter(straight);
    const be = b.edges.filter(straight);
    let best: { a: Edge; b: Edge; score: number } | null = null;
    for (const ea of ae)
      for (const eb of be) {
        const score = rel(ea.lenMm, eb.lenMm);
        if (score <= 0.12 && (!best || score < best.score)) best = { a: ea, b: eb, score };
      }
    if (!best) continue;
    const key = [a.pieceKey, b.pieceKey].sort().join('~');
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    pairs.push({
      parts: [a, b],
      width: (best.a.lenMm + best.b.lenMm) / 2,
      score: best.score,
    });
  }

  type Mouth = { pocket: PieceGeom; len: number; mark: boolean };
  const mouths: Mouth[] = [];
  for (const pocket of pieces) {
    if (readName(pocket.name).role !== 'pocket') continue;
    for (const mark of pocket.marks ?? []) {
      if (mark.pts.length < 2 || mark.lenMm < 50) continue;
      const a = mark.pts[0];
      const b = mark.pts[mark.pts.length - 1];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.97 * mark.lenMm)
        mouths.push({ pocket, len: mark.lenMm, mark: true });
    }
    if (!(pocket.marks ?? []).some((mark) => mark.lenMm >= 50))
      for (const edge of pocket.edges.filter(straight))
        mouths.push({ pocket, len: edge.lenMm, mark: false });
  }

  const used = new Set<string>();
  const out: InferredFlapPlacement[] = [];
  for (const pair of pairs.sort((a, b) => a.score - b.score)) {
    if (pair.parts.some((part) => used.has(part.pieceKey))) continue;
    const hand = pair.parts[0].hand;
    const mouth = mouths
      .filter(
        (candidate) =>
          candidate.pocket.hand === hand &&
          !pair.parts.includes(candidate.pocket) &&
          rel(candidate.len, pair.width) <= 0.25,
      )
      .sort(
        (a, b) =>
          Number(!a.mark) - Number(!b.mark) || rel(a.len, pair.width) - rel(b.len, pair.width),
      )[0];
    if (!mouth) continue;
    const targets = pieces.flatMap((host) => {
      const role = readName(host.name).role;
      if (
        (role !== 'front' && role !== null) ||
        host.hand !== hand ||
        Math.abs(host.areaMm2) < 2 * Math.max(...pair.parts.map((part) => Math.abs(part.areaMm2)))
      )
        return [];
      return host.edges
        .filter((edge) => straight(edge) && rel(edge.lenMm, mouth.len) <= 0.15)
        .map((edge) => ({ host, edge }));
    });
    targets.sort(
      (a, b) =>
        rel(a.edge.lenMm, mouth.len) - rel(b.edge.lenMm, mouth.len) ||
        Math.abs(b.host.areaMm2) - Math.abs(a.host.areaMm2),
    );
    const target = targets[0];
    if (!target) continue;
    const tb = target.edge.pts;
    const ta = tb[0];
    const tz = tb[tb.length - 1];
    const tl = Math.hypot(tz[0] - ta[0], tz[1] - ta[1]);
    if (tl < 1) continue;
    const ux = (tz[0] - ta[0]) / tl;
    const uy = (tz[1] - ta[1]) / tl;
    const mid: Pt2 = [(ta[0] + tz[0]) / 2, (ta[1] + tz[1]) / 2];
    const H = new PolyIndex(target.host.rs);
    const placed: InferredFlapPlacement[] = [];
    for (const part of [...pair.parts].sort((a, b) => Math.abs(a.areaMm2) - Math.abs(b.areaMm2))) {
      let best: { T: Affine; edge: Edge; cover: number } | null = null;
      for (const edge of part.edges.filter(
        (candidate) => straight(candidate) && rel(candidate.lenMm, pair.width) <= 0.15,
      )) {
        const q0 = edge.pts[0];
        const q1 = edge.pts[edge.pts.length - 1];
        const half = edge.chordMm / 2;
        for (const direction of [1, -1]) {
          const p0: Pt2 = [mid[0] - direction * ux * half, mid[1] - direction * uy * half];
          const p1: Pt2 = [mid[0] + direction * ux * half, mid[1] + direction * uy * half];
          const T = rigid(p0, p1, q0, q1, false);
          const cover = coverOf(
            part.rs.map((point) => apply(T, point)),
            H,
          );
          if (!best || cover > best.cover) best = { T, edge, cover };
        }
      }
      if (!best || best.cover < 0.7) {
        placed.splice(0);
        break;
      }
      placed.push({
        part: part.pieceKey,
        host: target.host.pieceKey,
        pocket: mouth.pocket.pieceKey,
        T: best.T,
        attach: best.edge.id,
        mouth: target.edge.id,
        how: `doll proposal: rejected-only paired piece, ${Math.round(best.edge.lenMm)} mm wide against the same-side pocket mouth ${Math.round(mouth.len)} mm`,
      });
    }
    if (placed.length !== 2) continue;
    for (const placement of placed) used.add(placement.part);
    out.push(...placed);
  }
  return out;
}

/**
 * Where the surface piece `S` lies on its host `H`, in H's frame: by a mark of the piece's size
 * inside H, else by the corner of H it fits. Null when neither puts it on the panel.
 */
export function surfaceFit(S: PieceGeom, H: PieceGeom): SurfaceFit | null {
  const sb = box(S.rs);
  const hb = box(H.rs);
  const HI = new PolyIndex(H.rs);
  // 1. A mark inside the host the piece's height: its own outline; its stitch line (a fly's J
  //    sews the fly on along its inner edge — the fly, a shield folded double, reaches from there to
  //    the centre front: up to twice the stitch line's width); or a pocket's placement outline the
  //    pocket bag fills from the panel's edge (half the outline's width or more).
  let mark: { x0: number; x1: number; cy: number; w: number; e: number; kind: string } | null =
    null;
  for (const m of H.marks ?? []) {
    if (m.kind !== 'vee' && m.kind !== 'placement' && m.kind !== 'other') continue;
    const { w, h, cx, cy } = m.bbox;
    if (w < 30 || h < 30 || w > 0.8 * hb.w || h > 0.8 * hb.h) continue;
    const eh = Math.abs(h - sb.h) / sb.h;
    const r = sb.w / w;
    if (eh > 0.08 || r < 0.5 || r > 2.1) continue;
    const e = eh + 0.1 * Math.abs(Math.log(r));
    if (!mark || e < mark.e) mark = { x0: cx - w / 2, x1: cx + w / 2, cy, w, e, kind: m.kind };
  }
  if (mark) {
    // A piece of the mark's width sits on it; a wider or a narrower one reaches the panel's edge
    // nearer the mark (wider: from the mark's far side; narrower: from its near side).
    const cx = (mark.x0 + mark.x1) / 2;
    const leftNear = ringD([mark.x0, mark.cy], H.rs) <= ringD([mark.x1, mark.cy], H.rs);
    const wide = sb.w > 1.1 * mark.w;
    const narrow = sb.w < 0.9 * mark.w;
    const tx = wide
      ? leftNear
        ? mark.x1 - sb.x1
        : mark.x0 - sb.x0
      : narrow
        ? leftNear
          ? mark.x0 - sb.x0
          : mark.x1 - sb.x1
        : cx - (sb.x0 + sb.x1) / 2;
    const dy = mark.cy - (sb.y0 + sb.y1) / 2;
    const raw = (p: Pt2): Pt2 => [p[0] + tx, p[1] + dy];
    const coverRaw = coverOf(S.rs.map(raw), HI);
    if (coverRaw >= (wide ? 0.45 : 0.6)) {
      // What reaches past the panel's edge is folded under it (a shield turned to the inside):
      // never left standing off the panel.
      const map = (p: Pt2): Pt2 => foldUnder(raw(p), H.rs, HI);
      const cover = coverOf(S.rs.map(map), HI);
      const past = 1 - coverRaw;
      return {
        map,
        flip: false,
        cover,
        past,
        ...(past > 0.02 ? { under: (p: Pt2) => !HI.covers(raw(p)) } : {}),
        how: `on the ${mark.kind === 'vee' ? 'stitch line' : 'placement mark'} drawn on it (piece ${Math.round(sb.w)}×${Math.round(sb.h)} mm, mark ${Math.round(mark.w)} mm wide, heights within ${Math.round(100 * mark.e)} %)${past > 0.02 ? ` — ${Math.round(100 * past)} % of it reaches past the panel's edge: folded under the panel along that edge (a shield turned to the inside)${cover < 0.95 ? `, ${Math.round(100 * (1 - cover))} % still past it` : ''}` : ''}`,
      };
    }
  }
  // 2. The corner of the host the piece fits: a corner of the piece with its two edges along the
  //    two edges of a host corner, face up (or face down — penalised), wholly on the panel.
  const hc = cornersOf(
    H.rs,
    H.edges.map((e) => e.s),
  );
  let best: (SurfaceFit & { score: number }) | null = null;
  for (const flip of [false, true]) {
    const ring: Pt2[] = flip ? S.rs.map(([x, y]) => [-x, y] as Pt2).reverse() : S.rs.slice();
    const n = S.rs.length;
    const idx = S.edges.map((e) => (flip ? (n - 1 - e.s + n) % n : e.s));
    const sc = cornersOf(ring, idx);
    for (const a of sc)
      for (const b of hc) {
        const angA = wrap(a.in - a.out);
        const angB = wrap(b.in - b.out);
        const mismatch = Math.abs(wrap(angA - angB));
        if (mismatch > 25 * DEG) continue;
        for (const th of [wrap(b.out - a.out), wrap(b.in - a.in)]) {
          if (Math.abs(th) > 20 * DEG) continue;
          const c = Math.cos(th);
          const s = Math.sin(th);
          const map0 = (p: Pt2): Pt2 => {
            const x = p[0] - a.p[0];
            const y = p[1] - a.p[1];
            return [b.p[0] + c * x - s * y, b.p[1] + s * x + c * y];
          };
          const cover = coverOf(ring.map(map0), HI, 0.9);
          if (cover < 0.9) continue;
          // Ties (a rectangle fits every square corner): the corner nearer the waist / top wins —
          // pockets and flies open at the top of a panel.
          const top = (b.y - hb.y0) / Math.max(1, hb.h);
          const score =
            cover -
            mismatch / (90 * DEG) -
            Math.abs(th) / (60 * DEG) +
            0.1 * top -
            (flip ? 0.15 : 0);
          if (!best || score > best.score + 1e-9) {
            const map = flip ? (p: Pt2): Pt2 => map0([-p[0], p[1]]) : map0;
            best = {
              map,
              flip,
              cover,
              past: 1 - cover,
              score,
              how: `no placement mark on it — laid into the panel corner it fits (${Math.round((angB / DEG + 360) % 360)}° corner at ${top > 0.66 ? 'the top' : top < 0.33 ? 'the bottom' : 'mid-height'} of the panel${flip ? ', face down' : ''}): a reading of the shapes, not a drawn position`,
            };
          }
        }
      }
  }
  return best
    ? { map: best.map, flip: best.flip, cover: best.cover, past: best.past, how: best.how }
    : null;
}
