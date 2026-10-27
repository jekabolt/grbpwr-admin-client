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
  /**
   * Largest lean (rad) a placement may give a piece from its own up — the angle of its y axis,
   * mirrored or not. A link whose every option leans more is not taken (the piece stands apart).
   * Absent = any; a stacked layer under its identical twin is never held to it.
   */
  uprightMax?: number;
};

/** How far a placement leans a piece from its own up, mirrored or not. */
export const tiltOf = (T: Affine) => Math.atan2(Math.abs(T[2]), T[3]);

/**
 * How far a placement leans THIS piece: a rectangle turned half round is the same shape (a cuff
 * hangs from a sleeve's hem by whichever long edge the seam names), any other piece is not.
 */
export const pieceTilt = (g: Pick<PieceGeom, 'rect'>, T: Affine) => {
  const t = tiltOf(T);
  return g.rect ? Math.min(t, Math.PI - t) : t;
};

type ResolvedEdge = { id: EdgeId; pieceKey: string; pts: Pt2[]; len: number };

/** One piece's edge of a side that runs across several pieces. */
export type RunPart = { key: string; pts: Pt2[]; len: number };

/**
 * A side's parts in world, end to end: each part by its piece's placement, turned so it carries on
 * from the one before (the model lists them in walking order, but each in its own ring's sense).
 * Null when a part's piece has no placement yet.
 */
export function runOf(
  parts: readonly RunPart[],
  at: (key: string) => Affine | undefined,
): Pt2[] | null {
  const world: Pt2[][] = [];
  for (const part of parts) {
    const T = at(part.key);
    if (!T) return null;
    world.push(part.pts.map((p) => apply(T, p)));
  }
  const d = (p: Pt2, q: Pt2) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const first = (r: Pt2[]) => r[0];
  const last = (r: Pt2[]) => r[r.length - 1];
  let out: Pt2[] = world[0];
  if (world.length > 1) {
    const next = world[1];
    const near = (p: Pt2) => Math.min(d(p, first(next)), d(p, last(next)));
    if (near(first(out)) < near(last(out))) out = [...out].reverse();
  }
  for (let i = 1; i < world.length; i++) {
    const r = world[i];
    const seg = d(last(out), first(r)) <= d(last(out), last(r)) ? r : [...r].reverse();
    out = [...out, ...seg];
  }
  return out;
}

/**
 * A piece set into a run that would tilt it past upright — a sleeve into an opened armhole, which
 * lies flat as a slit between the shoulder points — lies sideways instead: an end of its sewn edge
 * at the run's chord midpoint (the shoulder point), the piece turned a quarter, pointing away from
 * what it is sewn to. Every candidate: either edge end at the point, turned either way, mirrored or
 * not; the caller keeps the clear, unmirrored one that points away.
 */
export function sidewaysTrials(
  A: readonly Pt2[],
  B: readonly Pt2[],
): { T: Affine; mirrored: boolean }[] {
  const a0 = A[0];
  const a1 = A[A.length - 1];
  const anchor: Pt2 = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
  const out: { T: Affine; mirrored: boolean }[] = [];
  for (const q of [B[0], B[B.length - 1]])
    for (const s of [1, -1])
      for (const mirrored of [false, true]) {
        const R: Affine = compose([0, s, -s, 0, 0, 0], mirrored ? [-1, 0, 0, 1, 0, 0] : IDENTITY);
        const m = apply(R, q);
        out.push({ T: compose(translate(anchor[0] - m[0], anchor[1] - m[1]), R), mirrored });
      }
  return out;
}

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
  /** The placed side when it runs across several pieces (an armhole of front + back). */
  fromParts?: RunPart[];
  fromKey: string;
  toKey: string;
  len: number;
};

type Trial = {
  T: Affine;
  overlap: number;
  endErr: number;
  mode: 'edge' | 'stack' | 'hung' | 'surface' | 'run';
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
    // A side across several pieces of the unit is laid along as one run (once they are all on
    // the table); the piece it places still goes by its one longest edge.
    const partsOf = (ids: readonly EdgeId[] | undefined): RunPart[] | undefined => {
      if (!ids || ids.length < 2) return undefined;
      const parts: RunPart[] = [];
      for (const id of ids) {
        const e = resolveEdge(id, G);
        if (!e || !inUnit.has(e.pieceKey)) return undefined;
        parts.push({ key: e.pieceKey, pts: e.pts, len: e.len });
      }
      return parts;
    };
    const pa = partsOf(s.aParts);
    const pb = partsOf(s.bParts);
    const runLen = (parts: RunPart[] | undefined, e: ResolvedEdge | null) =>
      parts ? parts.reduce((t, p) => t + p.len, 0) : e?.len ?? 0;
    const len = Math.max(runLen(pa, ea), runLen(pb, eb));
    links.push({ seam: s, from: ea, to: eb, fromParts: pa, fromKey: ka, toKey: kb, len });
    links.push({ seam: s, from: eb, to: ea, fromParts: pb, fromKey: kb, toKey: ka, len });
  }
  // What the card sews (a stored row, a step's seam) shapes the unit before the engine's own
  // readings, whatever their length: a front goes on the back's side it is sewn to, not on the
  // placket the engine would pair with its centre; longest first within each.
  const tier = (s: SeamCandidate) => (s.provenance || s.sewn ? 1 : 0);
  links.sort((p, q) => tier(q.seam) - tier(p.seam) || q.len - p.len);

  const placed = new Map<string, UnionPlacement>();
  const order: string[] = [];
  const rasters = new Map<string, Raster>(); // the shapes that count for overlap
  const leaderOf = new Map<string, string>(); // stacked follower → leader
  const stacks = new Map<string, string[]>(); // leader → [leader, …followers]
  const hung: string[] = [];
  const onRuns: string[] = [];
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

  /** A run's chord midpoint, its normal pointing away from the pieces it runs across, their extent. */
  const awayOf = (A: readonly Pt2[], hostKeys: readonly string[]) => {
    const a0 = A[0];
    const a1 = A[A.length - 1];
    const mid: Pt2 = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
    const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) || 1;
    let n: Pt2 = [-(a1[1] - a0[1]) / len, (a1[0] - a0[0]) / len];
    const hostPts = hostKeys.flatMap((k) => worldPts(k, placed.get(k)!.T));
    const hc = centroid(hostPts);
    if ((hc[0] - mid[0]) * n[0] + (hc[1] - mid[1]) * n[1] > 0) n = [-n[0], -n[1]];
    const hb = bboxOf(hostPts);
    return { mid, n, hc, extent: Math.hypot(hb.x1 - hb.x0, hb.y1 - hb.y0) };
  };

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

    // A run across pieces waits until every one of them is on the table.
    const run = l.fromParts ? runOf(l.fromParts, (k) => placed.get(k)?.T) : null;
    if (l.fromParts && !run) return null;
    const A = run ?? l.from.pts.map((p) => apply(host.T, p));
    const a0 = A[0];
    const a1 = A[A.length - 1];
    const B = l.to.pts;
    const stack = isIdentical(l.seam, G.get(l.fromKey)!, l.toKey);
    const fromLeader = leaderOf.get(l.fromKey) ?? l.fromKey;
    // A piece set into a run (a sleeve into an opened armhole) points away from what it is sewn
    // to: the run's normal is its way up, whatever the page says.
    const away =
      run && l.fromParts
        ? awayOf(
            A,
            l.fromParts.map((p) => p.key),
          )
        : null;
    let best: Trial | null = null;
    let bestScore = Infinity;
    for (const rev of [false, true])
      for (const mir of [false, true]) {
        const q0 = rev ? B[B.length - 1] : B[0];
        const q1 = rev ? B[0] : B[B.length - 1];
        let T = rigid(a0, a1, q0, q1, mir);
        if (run) {
          // A cap on an armhole run hangs from its middle, not from one end of it.
          const m0 = apply(T, q0);
          const m1 = apply(T, q1);
          T = compose(
            translate((a0[0] + a1[0] - m0[0] - m1[0]) / 2, (a0[1] + a1[1] - m0[1] - m1[1]) / 2),
            T,
          );
        }
        if (!stack && opts.uprightMax != null && pieceTilt(toGeom, T) > opts.uprightMax) continue;
        if (!stack && away) {
          const c = centroid(worldPts(l.toKey, T));
          if ((c[0] - away.mid[0]) * away.n[0] + (c[1] - away.mid[1]) * away.n[1] <= 0) continue;
        }
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
    if (!best && away && !stack) {
      // Along the run it would lie past upright (a slit of an armhole): sideways, pointing away.
      const dx = away.mid[0] - away.hc[0];
      const dy = away.mid[1] - away.hc[1];
      for (const s of sidewaysTrials(A, B)) {
        const c = centroid(worldPts(l.toKey, s.T));
        if ((c[0] - away.mid[0]) * dx + (c[1] - away.mid[1]) * dy <= 0) continue;
        const overlap = maxOverlap(rasterOf(l.toKey, s.T));
        const score = overlap * 1000 + (s.mirrored ? 50 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = { T: s.T, overlap, endErr: 0, mode: 'edge', via: l.from.id };
        }
      }
    }
    if (!best) return null;

    if (away && best.mode === 'edge') {
      // Off the run along its normal until clear: a cap wider than the opened armhole sits over it.
      let T = best.T;
      let overlap = best.overlap;
      for (let n = 1; overlap > overlapMax && n <= 12; n++) {
        const off = n * 0.02 * away.extent;
        T = compose(translate(away.n[0] * off, away.n[1] * off), best.T);
        overlap = maxOverlap(rasterOf(l.toKey, T));
      }
      return { ...best, T, overlap, mode: 'run' };
    }
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
    if (t.mode === 'run') onRuns.push(k);
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
    onRuns,
    overflow,
    surface,
    underlay,
    overlap,
  };
}
