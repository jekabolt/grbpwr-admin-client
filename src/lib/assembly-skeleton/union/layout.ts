// UNION LAYOUT — where each piece of a unit lies so that its sewn edges coincide (C1).
//
// Port of probe/union.mjs with the corrections 00-FEASIBILITY §F/§G asked for:
//   • the spanning tree starts at the BIGGEST piece and grows along the LONGEST seam on the
//     frontier (the probe went BFS from the first seam in the list);
//   • overlap is measured as AREA by a 1 mm scanline raster (overlap.ts), not by contour samples;
//   • a placement whose best option still overlaps more than SKELETON.overlapMax is deferred, retried
//     once the rest of the unit is down, and otherwise goes to `overflow` («shown apart»);
//   • identical layers (collar / under-collar, yoke / yoke facing) are STACKED into one shape («×n»);
//   • composite / 3D joins (sleeve cap into armhole, collar onto neckline) are HUNG: laid against
//     the first edge, then pulled off it by a small gap and marked «~»;
//   • surface joins (patch pocket, appliqué) lie ON the host, drawn last;
//   • interfacing is never a shape of its own — it is an underlay of the piece it is fused to;
//   • pieces with no seam to the rest of the unit (L/R halves without a centre seam) stand beside.
//
// Pure: PieceGeom in, UnionLayout out. Coordinates are the pieces' own (mm, y up, as the resample).
// The layout is a PICTOGRAM, never a drawing: it says which edges meet, not where cloth goes —
// components render it as SVG and never hand the numbers on (01-PLAN §5).

import {
  SKELETON,
  type Affine,
  type EdgeId,
  type PieceGeom,
  type Pt2,
  type SeamCandidate,
  type UnionLayout,
  type UnionPlacement,
} from '../types';
import { apply, compose, det, IDENTITY, rigid, translate } from './affine';
import { pairOverlap, rasterize, thin, type Raster } from './overlap';

export type UnionOptions = {
  /** Largest overlap a placement may leave (share of the smaller piece). */
  overlapMax?: number;
  /** Raster row step, mm. */
  rasterMm?: number;
  /**
   * An eased seam whose far end misses by more than this is drawn «adjacent», not «coincident»
   * (00-FEASIBILITY §F: tolerable to ~30 mm) — the placement is marked `approx`.
   */
  hangErrMm?: number;
};

type ResolvedEdge = { id: EdgeId; pieceKey: string; pts: Pt2[]; len: number };

const polyLen = (pts: readonly Pt2[]) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++)
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
};

export const pieceKeyOf = (id: EdgeId): string => {
  const at = id.lastIndexOf('#');
  return at < 0 ? id : id.slice(0, at);
};

function signedArea(pts: readonly Pt2[]): number {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

const areaOf = (g: PieceGeom) => (g.areaMm2 > 0 ? g.areaMm2 : Math.abs(signedArea(g.rs)));

function centroid(pts: readonly Pt2[]): Pt2 {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

function bboxOf(pts: Iterable<Pt2>) {
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
}

/** Edge points: `Edge.pts` when the geometry carries them, else the slice s→e of the resample. */
export function resolveEdge(
  id: EdgeId,
  geoms: ReadonlyMap<string, PieceGeom>,
): ResolvedEdge | null {
  const pieceKey = pieceKeyOf(id);
  const g = geoms.get(pieceKey);
  if (!g) return null;
  // A chain (`P#3+4`, two neighbouring edges A3 matched as one): its edges' points end to end.
  if (id.includes('+', pieceKey.length)) {
    const parts = id
      .slice(pieceKey.length + 1)
      .split('+')
      .map((k) => resolveEdge(`${pieceKey}#${k}`, geoms));
    if (parts.some((x) => !x)) return null;
    const pts = parts.flatMap((x, i) => (i === 0 ? x!.pts : x!.pts.slice(1)));
    return { id, pieceKey, pts, len: parts.reduce((s, x) => s + x!.len, 0) };
  }
  const k = Number(id.slice(pieceKey.length + 1));
  const e = g.edges.find((x) => x.id === id) ?? g.edges.find((x) => x.k === k);
  if (!e) return null;
  let pts: Pt2[] = e.pts ?? [];
  if (pts.length < 2) {
    const n = g.rs.length;
    if (n < 2) return null;
    const span = e.e > e.s ? e.e - e.s : n - e.s + e.e;
    pts = [];
    for (let j = 0; j <= span; j++) pts.push(g.rs[(e.s + j) % n]);
  }
  return { id, pieceKey, pts, len: e.lenMm > 0 ? e.lenMm : polyLen(pts) };
}

const isIdentical = (s: SeamCandidate, a: PieceGeom, bKey: string) =>
  s.evidence?.twin === 'identical' ||
  a.twinOf.some((t) => t.key === bKey && t.kind === 'identical');

type Link = {
  seam: SeamCandidate;
  /** The side already on the table / the side being placed. */
  from: ResolvedEdge | null;
  to: ResolvedEdge | null;
  fromKey: string;
  toKey: string;
  len: number;
};

type Trial = {
  T: Affine;
  overlap: number;
  endErr: number;
  mode: 'edge' | 'stack' | 'hung' | 'surface';
  via?: EdgeId;
  /** A surface part laid by its placement mark — not a guess. */
  exact?: boolean;
};

/**
 * Lay a unit's pieces out so that the seams between them coincide.
 *
 * `unitPieces` — the unit's piece keys; `seams` — any seams (only those with both pieces in the
 * unit are used; `closure-not-seam` never joins); `geoms` — PieceGeom by pieceKey (or a list).
 */
export function unionLayout(
  unitPieces: readonly string[],
  seams: readonly SeamCandidate[],
  geoms: ReadonlyMap<string, PieceGeom> | readonly PieceGeom[],
  opts: UnionOptions = {},
): UnionLayout {
  const G: ReadonlyMap<string, PieceGeom> =
    geoms instanceof Map
      ? geoms
      : new Map((geoms as readonly PieceGeom[]).map((g) => [g.pieceKey, g]));
  const overlapMax = opts.overlapMax ?? SKELETON.overlapMax;
  const step = opts.rasterMm ?? SKELETON.resampleMm;
  const hangErr = opts.hangErrMm ?? 30;

  const keys = [...new Set(unitPieces)];
  const overflow: string[] = [];
  const underlay: string[] = [];
  const pieces: string[] = [];
  for (const k of keys) {
    const g = G.get(k);
    if (!g || g.rs.length < 3) overflow.push(k);
    else if (g.cloth === 'interfacing') underlay.push(k);
    else pieces.push(k);
  }
  const inUnit = new Set(pieces);

  // Usable links, both directions, longest first.
  const links: Link[] = [];
  for (const s of seams) {
    if (s.kind === 'closure-not-seam') continue;
    const ka = pieceKeyOf(s.a);
    const kb = pieceKeyOf(s.b);
    if (ka === kb || !inUnit.has(ka) || !inUnit.has(kb)) continue;
    const ea = resolveEdge(s.a, G);
    const eb = resolveEdge(s.b, G);
    if (s.kind !== 'surface' && (!ea || !eb)) continue;
    const S = s.kind === 'surface' ? s.surface : undefined;
    if (S && inUnit.has(S.host) && inUnit.has(S.part)) {
      // A part on its placement mark (P2 lane S): exactly where the host's mark says, before any
      // edge link could lay it elsewhere; only from the host (the bigger piece, placed first).
      const toHost = S.host === ka;
      const [from, to] = toHost ? [ea, eb] : [eb, ea];
      links.push({ seam: s, from, to, fromKey: S.host, toKey: S.part, len: 1e9 });
      continue;
    }
    const len = Math.max(ea?.len ?? 0, eb?.len ?? 0);
    links.push({ seam: s, from: ea, to: eb, fromKey: ka, toKey: kb, len });
    links.push({ seam: s, from: eb, to: ea, fromKey: kb, toKey: ka, len });
  }
  links.sort((p, q) => q.len - p.len);

  const placed = new Map<string, UnionPlacement>();
  const order: string[] = [];
  const rasters = new Map<string, Raster>(); // the shapes that count for overlap
  const leaderOf = new Map<string, string>(); // stacked follower → leader
  const stacks = new Map<string, string[]>(); // leader → [leader, …followers]
  const hung: string[] = [];
  const surface: string[] = [];
  const deferred = new Set<string>();
  const overflowSet = new Set(overflow);

  const local = new Map<string, Pt2[]>();
  const thinOf = (k: string) => {
    let t = local.get(k);
    if (!t) local.set(k, (t = thin(G.get(k)!.rs)));
    return t;
  };
  const rasterOf = (k: string, T: Affine) =>
    rasterize(
      thinOf(k).map((p) => apply(T, p)),
      step,
    );
  const worldPts = (k: string, T: Affine) => G.get(k)!.rs.map((p) => apply(T, p));

  const maxOverlap = (r: Raster, skip?: string) => {
    let m = 0;
    for (const [k, other] of rasters) {
      if (k === skip) continue;
      const o = pairOverlap(r, other);
      if (o > m) m = o;
    }
    return m;
  };

  const put = (k: string, T: Affine, extra: Partial<UnionPlacement>, counts: boolean) => {
    placed.set(k, { pieceKey: k, T, mirrored: det(T) < 0, ...extra });
    order.push(k);
    if (counts) rasters.set(k, rasterOf(k, T));
  };

  // ── one placement trial along one link ──────────────────────────────────────────────────
  const trial = (l: Link): Trial | null => {
    const host = placed.get(l.fromKey)!;
    const toGeom = G.get(l.toKey)!;

    const S = l.seam.surface;
    if (l.seam.kind === 'surface' && S && S.host === l.fromKey && S.part === l.toKey) {
      // On the host's placement mark: T_world = host.T ∘ surface.T.
      return { T: compose(host.T, S.T), overlap: 0, endErr: 0, mode: 'surface', exact: true };
    }
    if (l.seam.kind === 'surface') {
      // On the host, in its lower-right quadrant, own orientation (§G: no placement mark known).
      const hb = bboxOf(worldPts(l.fromKey, host.T));
      const pb = bboxOf(toGeom.rs);
      const cx = hb.x0 + 0.68 * (hb.x1 - hb.x0);
      const cy = hb.y0 + 0.32 * (hb.y1 - hb.y0);
      const T = translate(cx - (pb.x0 + pb.x1) / 2, cy - (pb.y0 + pb.y1) / 2);
      return { T, overlap: 0, endErr: 0, mode: 'surface' };
    }
    if (!l.from || !l.to) return null;

    const A = l.from.pts.map((p) => apply(host.T, p));
    const a0 = A[0];
    const a1 = A[A.length - 1];
    const B = l.to.pts;
    const stack = isIdentical(l.seam, G.get(l.fromKey)!, l.toKey);
    const fromLeader = leaderOf.get(l.fromKey) ?? l.fromKey;
    let best: Trial | null = null;
    let bestScore = Infinity;
    for (const rev of [false, true])
      for (const mir of [false, true]) {
        const q0 = rev ? B[B.length - 1] : B[0];
        const q1 = rev ? B[0] : B[B.length - 1];
        const T = rigid(a0, a1, q0, q1, mir);
        const e1 = apply(T, q1);
        const endErr = Math.hypot(e1[0] - a1[0], e1[1] - a1[1]);
        const r = rasterOf(l.toKey, T);
        let overlap: number;
        let score: number;
        if (stack) {
          // A layer goes ON its twin: the option that covers it best wins.
          const lr = rasters.get(fromLeader);
          overlap = lr ? pairOverlap(r, lr) : 0;
          score = -overlap * 1000 + endErr;
        } else {
          overlap = maxOverlap(r);
          // Mirror costs 5 points of overlap: pieces sewn and opened lie FACE UP side by side, so a
          // flip is only worth it when it clearly un-tangles the picture (a hand drawn the other way).
          score = overlap * 1000 + endErr + (mir ? 50 : 0);
        }
        if (score < bestScore) {
          bestScore = score;
          best = { T, overlap, endErr, mode: stack ? 'stack' : 'edge', via: l.from.id };
        }
      }
    if (!best) return null;

    if (l.seam.kind === 'composite' && best.mode === 'edge') {
      // Hang it: pull the piece off the edge along the edge normal, away from the host body.
      const dx = a1[0] - a0[0];
      const dy = a1[1] - a0[1];
      const len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len;
      let ny = dx / len;
      const hc = centroid(worldPts(l.fromKey, host.T));
      const mid: Pt2 = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
      if ((hc[0] - mid[0]) * nx + (hc[1] - mid[1]) * ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const hb = bboxOf(worldPts(l.fromKey, host.T));
      const gap = Math.max(4, 0.05 * Math.hypot(hb.x1 - hb.x0, hb.y1 - hb.y0));
      const T = compose(translate(nx * gap, ny * gap), best.T);
      return { ...best, T, overlap: maxOverlap(rasterOf(l.toKey, T)), mode: 'hung' };
    }
    return best;
  };

  const commit = (l: Link, t: Trial) => {
    const k = l.toKey;
    if (t.mode === 'stack') {
      const leader = leaderOf.get(l.fromKey) ?? l.fromKey;
      leaderOf.set(k, leader);
      stacks.set(leader, [...(stacks.get(leader) ?? [leader]), k]);
      put(k, t.T, { attachedVia: t.via }, false);
      return;
    }
    if (t.mode === 'surface') {
      surface.push(k);
      put(k, t.T, t.exact ? {} : { approx: true }, false);
      return;
    }
    const approx = t.mode === 'hung' || t.endErr > hangErr;
    if (t.mode === 'hung') hung.push(k);
    put(k, t.T, { attachedVia: t.via, ...(approx ? { approx: true } : {}) }, true);
  };

  const fits = (t: Trial) =>
    t.mode === 'stack' || t.mode === 'surface' || t.overlap <= overlapMax + 1e-9;

  /** Try every link from the table to `k`, longest first; place on the first that fits. */
  const tryPiece = (k: string): boolean => {
    for (const l of links) {
      if (l.toKey !== k || !placed.has(l.fromKey)) continue;
      const t = trial(l);
      if (t && fits(t)) {
        commit(l, t);
        return true;
      }
    }
    return false;
  };

  const grow = () => {
    for (;;) {
      let progressed = false;
      // Longest seam on the frontier first.
      for (const l of links) {
        if (!placed.has(l.fromKey) || placed.has(l.toKey)) continue;
        if (deferred.has(l.toKey) || overflowSet.has(l.toKey)) continue;
        if (!tryPiece(l.toKey)) deferred.add(l.toKey);
        progressed = true;
        break;
      }
      if (progressed) continue;
      // Frontier exhausted: give the deferred ones one more go against everything now placed.
      let retried = false;
      for (const k of [...deferred]) {
        deferred.delete(k);
        if (tryPiece(k)) retried = true;
        else {
          overflow.push(k);
          overflowSet.add(k);
        }
      }
      if (!retried) return;
    }
  };

  // Components, biggest piece first; each later component stands beside the ones before it.
  for (;;) {
    const rest = pieces.filter((k) => !placed.has(k) && !overflowSet.has(k));
    if (rest.length === 0) break;
    const root = rest.reduce((m, k) => (areaOf(G.get(k)!) > areaOf(G.get(m)!) ? k : m));
    let T: Affine = IDENTITY;
    if (placed.size > 0) {
      const all = bboxOf([...placed.values()].flatMap((p) => worldPts(p.pieceKey, p.T)));
      const rb = bboxOf(G.get(root)!.rs);
      const gap = 0.08 * Math.max(all.x1 - all.x0, all.y1 - all.y0);
      T = translate(all.x1 + gap - rb.x0, all.y0 - rb.y0);
    }
    put(root, T, {}, true);
    grow();
  }

  // Draw order: body pieces as placed, surface pieces on top.
  const surfaceSet = new Set(surface);
  const placements = [
    ...order.filter((k) => !surfaceSet.has(k)),
    ...order.filter((k) => surfaceSet.has(k)),
  ].map((k) => placed.get(k)!);

  let overlap = 0;
  const drawn = [...rasters.entries()];
  for (let i = 0; i < drawn.length; i++)
    for (let j = i + 1; j < drawn.length; j++)
      overlap = Math.max(overlap, pairOverlap(drawn[i][1], drawn[j][1]));

  const bbox =
    placements.length > 0
      ? bboxOf(placements.flatMap((p) => worldPts(p.pieceKey, p.T)))
      : { x0: 0, y0: 0, x1: 0, y1: 0 };

  return {
    placements,
    bbox,
    stacked: [...stacks.values()],
    hung,
    overflow,
    surface,
    underlay,
    overlap,
  };
}
