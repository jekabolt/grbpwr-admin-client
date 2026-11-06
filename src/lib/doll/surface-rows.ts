// Surface pieces laid by the card's rows (owner mode). A pocket bag, a fly shield, a facing is laid
// on the panel its confirmed row sews it to, along the sewn stretch — never by its name. Pure 2D:
// each part gets the motion from its own pattern frame into a drawn panel's pattern frame.

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import { apply, compose, IDENTITY } from 'lib/assembly-skeleton/union/affine';
import type { Affine, EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { pointInPolygon } from './mesh';

const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
const dist = (p: Pt2, q: Pt2) => Math.hypot(q[0] - p[0], q[1] - p[1]);

/** One stretch of a row's side: an edge, cut to the sewn range (mm along the edge) when stored. */
export type RowPart = { id: EdgeId; piece: string; range?: [number, number] };

/** A fold of the part on itself, before it is laid: the side n points to is turned over. */
export type RowFold = { a: Pt2; n: Pt2 };

export type RowLay = {
  /** The drawn panel the part lies on. */
  host: string;
  /** Part pattern frame (after the fold) → host pattern frame. */
  T: Affine;
  fold?: RowFold;
  /** Share of the part's contour on the host. */
  cover: number;
  /** The row it is laid along, `a~b`. */
  row: string;
  /** The piece it is laid against: the host, or a part laid before it. */
  on: string;
  /** Parts laid under it first (0 = laid straight on a drawn panel). */
  depth: number;
  how: string;
};

/** A row's side as its stretches, in the stored walk order. */
export function rowParts(c: SeamCandidate, side: 'a' | 'b'): RowPart[] {
  const ids = (side === 'a' ? c.aParts ?? edgeIdsOf(c.a) : c.bParts ?? edgeIdsOf(c.b)).flatMap(
    (id) => edgeIdsOf(id),
  );
  return ids.map((id) => {
    const r = ids.length === 1 && c.range ? c.range[side] : c.partRange?.[id];
    return { id, piece: pk(id), ...(r ? { range: [r[0], r[1]] as [number, number] } : {}) };
  });
}

/** A polyline cut to [r0, r1] mm of its arc. */
export function arcCrop(pts: readonly Pt2[], r?: readonly [number, number]): Pt2[] {
  if (!r || pts.length < 2) return [...pts];
  const out: Pt2[] = [];
  let s = 0;
  const at = (i: number, t: number): Pt2 => [
    pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
    pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
  ];
  for (let i = 0; i + 1 < pts.length; i++) {
    const L = dist(pts[i], pts[i + 1]);
    const s1 = s + L;
    if (s1 >= r[0] && s <= r[1]) {
      if (!out.length) out.push(L > 0 ? at(i, Math.max(0, (r[0] - s) / L)) : pts[i]);
      if (s1 <= r[1]) out.push(pts[i + 1]);
      else {
        out.push(at(i, (r[1] - s) / L));
        break;
      }
    }
    s = s1;
  }
  return out.length >= 2 ? out : [...pts];
}

export const arcLen = (pts: readonly Pt2[]) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
};

/** n points at equal shares of the arc. */
export function resample(pts: readonly Pt2[], n: number): Pt2[] {
  const L = arcLen(pts);
  if (pts.length < 2 || L < 1e-9) return Array.from({ length: n }, () => pts[0]);
  const out: Pt2[] = [];
  let i = 0;
  let s = 0;
  for (let k = 0; k < n; k++) {
    const want = (k / (n - 1)) * L;
    while (i + 1 < pts.length - 1 && s + dist(pts[i], pts[i + 1]) < want) {
      s += dist(pts[i], pts[i + 1]);
      i++;
    }
    const seg = dist(pts[i], pts[i + 1]) || 1;
    const t = Math.max(0, Math.min(1, (want - s) / seg));
    out.push([
      pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
      pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
    ]);
  }
  return out;
}

/** The rigid motion (optionally mirrored first) that lays X on Y best, point for point. */
export function procrustes(
  X: readonly Pt2[],
  Y: readonly Pt2[],
  mirror: boolean,
): { T: Affine; err: number } {
  const M: Affine = mirror ? [-1, 0, 0, 1, 0, 0] : IDENTITY;
  const Xm = X.map((p) => apply(M, p));
  const n = Xm.length;
  let cx0 = 0;
  let cx1 = 0;
  let cy0 = 0;
  let cy1 = 0;
  for (let i = 0; i < n; i++) {
    cx0 += Xm[i][0] / n;
    cx1 += Xm[i][1] / n;
    cy0 += Y[i][0] / n;
    cy1 += Y[i][1] / n;
  }
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    const x0 = Xm[i][0] - cx0;
    const x1 = Xm[i][1] - cx1;
    const y0 = Y[i][0] - cy0;
    const y1 = Y[i][1] - cy1;
    a += x0 * y0 + x1 * y1;
    b += x0 * y1 - x1 * y0;
  }
  const th = Math.atan2(b, a);
  const c = Math.cos(th);
  const s = Math.sin(th);
  const R: Affine = [c, s, -s, c, cy0 - (c * cx0 - s * cx1), cy1 - (s * cx0 + c * cx1)];
  const T = compose(R, M);
  let err = 0;
  for (let i = 0; i < n; i++) err += dist(apply(T, X[i]), Y[i]) / n;
  return { T, err };
}

export const foldPt = (f: RowFold | undefined, p: Pt2): Pt2 => {
  if (!f) return p;
  const d = (p[0] - f.a[0]) * f.n[0] + (p[1] - f.a[1]) * f.n[1];
  return d > 0 ? [p[0] - 2 * d * f.n[0], p[1] - 2 * d * f.n[1]] : p;
};
export const foldedUnder = (f: RowFold | undefined, p: Pt2) =>
  !!f && (p[0] - f.a[0]) * f.n[0] + (p[1] - f.a[1]) * f.n[1] > 0;

/** Share of the points inside the ring. */
const coverOf = (pts: readonly Pt2[], ring: readonly Pt2[]) =>
  pts.length ? pts.filter((p) => pointInPolygon(p, ring)).length / pts.length : 0;

const N_FIT = 24;

/**
 * Lay the surface parts by the confirmed rows. A part is laid along the row that sews it to one
 * edge of a drawn panel, or of a part laid before it (a pocket's second bag over the first): the
 * rigid motion that lays its stretch on that edge's stretch, the side and direction the stretch's
 * own shape takes; of those left, the one that continues a waistband's walk where a row walks it
 * (a fly shield's top runs on past the centre front), else the one that lies most on the piece it
 * is sewn to. A part sewn by both its edges onto one edge is folded on itself first. A part that
 * lies off its panel across a seam of that panel lies on the panel across the seam.
 */
export function planSurfaceByRows(args: {
  parts: readonly string[];
  /** Parts already placed (owner surface rows): part → host panel and motion. */
  fixed: ReadonlyMap<string, { host: string; T: Affine }>;
  /** Drawn panels a part may lie on (legs, the body). */
  hosts: ReadonlySet<string>;
  geoms: ReadonlyMap<string, PieceGeom>;
  rows: readonly SeamCandidate[];
}): Map<string, RowLay> {
  const { geoms } = args;
  const out = new Map<string, RowLay>();
  const sides = args.rows.map((c) => ({
    c,
    id: `${c.a}~${c.b}`,
    a: rowParts(c, 'a'),
    b: rowParts(c, 'b'),
  }));
  const edgeOf = (id: EdgeId) => geoms.get(pk(id))?.edges.find((e) => e.id === id);
  const stretch = (p: RowPart): Pt2[] | null => {
    const e = edgeOf(p.id);
    return e && e.pts.length >= 2 ? arcCrop(e.pts, p.range) : null;
  };
  const ringSample = (g: PieceGeom) => g.rs.filter((_, i) => i % 4 === 0);
  /** Where a piece is: a drawn panel (identity), or a part laid before. */
  const frameOf = (piece: string): { host: string; T: Affine; depth: number } | null => {
    if (args.hosts.has(piece)) return { host: piece, T: IDENTITY, depth: -1 };
    const f = args.fixed.get(piece);
    if (f) return { host: f.host, T: f.T, depth: 0 };
    const l = out.get(piece);
    return l ? { host: l.host, T: l.T, depth: l.depth } : null;
  };
  /**
   * Walk continuity: a row walks a part of `on` and then a part of `k` (a waistband over the front
   * and on over the fly shield) — under T the k stretch starts where the on stretch ends and runs
   * on, never back over it. +1 kept, −1 broken, 0 no such walk.
   */
  const continuity = (k: string, on: string, T: Affine, fold?: RowFold) => {
    let verdict = 0;
    for (const s of sides)
      for (const parts of [s.a, s.b])
        for (let i = 0; i + 1 < parts.length; i++) {
          const [x, y] = [parts[i], parts[i + 1]];
          const hp =
            x.piece === on && y.piece === k ? x : y.piece === on && x.piece === k ? y : null;
          if (!hp) continue;
          const kp = hp === x ? y : x;
          const H = stretch(hp);
          const K0 = stretch(kp);
          if (!H || !K0) continue;
          const K = K0.map((p) => apply(T, foldPt(fold, p)));
          const lenK = arcLen(K);
          const ends: [Pt2, Pt2] = [K[0], K[K.length - 1]];
          const hEnds: [Pt2, Pt2] = [H[0], H[H.length - 1]];
          let join = Infinity;
          let far = ends[1];
          for (const e of ends)
            for (const h of hEnds)
              if (dist(e, h) < join) {
                join = dist(e, h);
                far = e === ends[0] ? ends[1] : ends[0];
              }
          let farD = Infinity;
          for (const h of resample(H, N_FIT)) farD = Math.min(farD, dist(h, far));
          const ok = join <= Math.max(12, 0.15 * lenK) && farD >= 0.4 * lenK;
          verdict = ok ? Math.max(verdict, 1) : verdict === 0 ? -1 : verdict;
        }
    return verdict;
  };
  /** The fold that turns stretch m2 over onto m1 (both sewn onto one edge), or null. */
  const foldOf = (m1: Pt2[], m2: Pt2[]): RowFold | null => {
    const A = resample(m1, N_FIT);
    let best: { f: RowFold; err: number } | null = null;
    for (const rev of [false, true]) {
      const B = resample(rev ? [...m2].reverse() : m2, N_FIT);
      const p = A[0];
      const r = B[0];
      const L = dist(p, r);
      if (L < 5) continue;
      const n: Pt2 = [(r[0] - p[0]) / L, (r[1] - p[1]) / L];
      const f: RowFold = { a: [(p[0] + r[0]) / 2, (p[1] + r[1]) / 2], n };
      let err = 0;
      for (let i = 0; i < N_FIT; i++) err += dist(foldPt(f, B[i]), A[i]) / N_FIT;
      if (!best || err < best.err) best = { f, err };
    }
    return best && best.err <= 4 ? best.f : null;
  };

  const todo = args.parts.filter((k) => !args.fixed.has(k) && geoms.has(k));
  for (let pass = 0; pass < 6; pass++) {
    const known = new Set([...args.hosts, ...args.fixed.keys(), ...out.keys()]);
    let moved = false;
    for (const k of todo) {
      if (out.has(k)) continue;
      const S = geoms.get(k)!;
      type Opt = RowLay & { cont: number; len: number; err: number; onCover: number };
      let best: Opt | null = null;
      for (const s of sides)
        for (const [mine, other] of [
          [s.a, s.b],
          [s.b, s.a],
        ] as const) {
          if (!mine.length || mine.some((p) => p.piece !== k)) continue;
          // A stored composite may continue from the shell onto a piece already laid there. The
          // surface part belongs in the shell's frame; resolving the whole side to the nested piece
          // instead puts a pocket bag on an unrelated panel. Try every drawable stretch and, when
          // the row gives equally continuous readings, prefer the shallowest (shell-first) frame.
          const targets = other.filter((p) => known.has(p.piece) && p.piece !== k);
          for (const target of targets) {
            const on = target.piece;
            const F = frameOf(on);
            const Q = stretch(target);
            const G = geoms.get(on);
            if (!F || !Q || !G) continue;
            const lenQ = arcLen(Q);
            // The part's stretch nearest the other side's length; two of them that long: a fold.
            // Against one stretch of a composite, fit the matching share of a one-edge side. The
            // whole pocket edge spans the shell and its laid continuation; fitting all of it to
            // either stretch makes the nested piece's exact duplicate win instead.
            const ms = mine
              .map((m) => ({ m, P: stretch(m) }))
              .filter((x): x is { m: RowPart; P: Pt2[] } => !!x.P)
              .sort((x, y) => Math.abs(arcLen(x.P) - lenQ) - Math.abs(arcLen(y.P) - lenQ));
            if (!ms.length) continue;
            let fold: RowFold | undefined;
            if (
              ms.length >= 2 &&
              Math.abs(arcLen(ms[1].P) - lenQ) <= 0.1 * lenQ &&
              Math.abs(arcLen(ms[0].P) - lenQ) <= 0.1 * lenQ
            )
              fold = foldOf(ms[0].P, ms[1].P) ?? undefined;
            const targetRuns = other.map(stretch);
            const targetLens = targetRuns.map((run) => (run ? arcLen(run) : 0));
            const targetTotal = targetLens.reduce((sum, len) => sum + len, 0);
            const targetAt = other.indexOf(target);
            const before = targetLens.slice(0, targetAt).reduce((sum, len) => sum + len, 0);
            const from = targetTotal > 0 ? before / targetTotal : 0;
            const to = targetTotal > 0 ? (before + lenQ) / targetTotal : 1;
            const wholeP = ms[0].P;
            const wholeLen = arcLen(wholeP);
            const fitRuns =
              other.length > 1 && ms.length === 1
                ? [
                    arcCrop(wholeP, [from * wholeLen, to * wholeLen]),
                    arcCrop(wholeP, [(1 - to) * wholeLen, (1 - from) * wholeLen]),
                  ]
                : [wholeP];
            const Ys = resample(Q, N_FIT);
            const ring = ringSample(S).map((p) => foldPt(fold, p));
            for (const P of fitRuns) {
              const lenP = arcLen(P);
              if (Math.min(lenP, lenQ) < 20) continue;
              for (const same of [true, false])
                for (const mirror of [false, true]) {
                  const Xs = resample(same ? P : [...P].reverse(), N_FIT);
                  const { T: t, err } = procrustes(Xs, Ys, mirror);
                  if (err > Math.max(4, 0.03 * Math.min(lenP, lenQ))) continue;
                  const onCover = coverOf(
                    ring.map((p) => apply(t, p)),
                    G.rs,
                  );
                  const cont = continuity(k, on, t, fold);
                  const len = Math.min(lenP, lenQ);
                  const T = compose(F.T, t);
                  const o: Opt = {
                    host: F.host,
                    T,
                    ...(fold ? { fold } : {}),
                    cover: 0,
                    row: s.id,
                    on,
                    depth: F.depth + 1,
                    how: '',
                    cont,
                    len,
                    err,
                    onCover,
                  };
                  const better =
                    !best ||
                    o.cont > best.cont ||
                    (o.cont === best.cont &&
                      (o.depth < best.depth ||
                        (o.depth === best.depth &&
                          (Math.round(10 * o.onCover) > Math.round(10 * best.onCover) ||
                            (Math.round(10 * o.onCover) === Math.round(10 * best.onCover) &&
                              (o.len > best.len + 5 ||
                                (Math.abs(o.len - best.len) <= 5 && o.err < best.err)))))));
                  if (better) best = o;
                }
            }
          }
        }
      if (!best) continue;
      const H = geoms.get(best.host)!;
      const ring = ringSample(S).map((p) => apply(best!.T, foldPt(best!.fold, p)));
      const cover = coverOf(ring, H.rs);
      out.set(k, {
        host: best.host,
        T: best.T,
        ...(best.fold ? { fold: best.fold } : {}),
        cover,
        row: best.row,
        on: best.on,
        depth: best.depth,
        how: `laid along its row ${best.row} on ${best.on}${best.fold ? ', folded on itself (both its edges sewn onto one)' : ''}`,
      });
      moved = true;
    }
    if (!moved) break;
  }

  // Off its panel across a seam: on the panel across it (a fly shield past the centre front lies
  // under the other front).
  for (const [k, l] of out) {
    if (l.cover >= 0.5) continue;
    const S = geoms.get(k)!;
    const ring = ringSample(S).map((p) => apply(l.T, foldPt(l.fold, p)));
    let bestN: { host: string; T: Affine; cover: number } | null = null;
    for (const s of sides) {
      if (s.a.length !== 1 || s.b.length !== 1) continue;
      const [x, y] = s.a[0].piece === l.host ? [s.a[0], s.b[0]] : [s.b[0], s.a[0]];
      if (x.piece !== l.host || y.piece === l.host || !args.hosts.has(y.piece)) continue;
      const R = geoms.get(l.host)!;
      const Nn = geoms.get(y.piece);
      const X = stretch(x);
      const Y = stretch(y);
      if (!Nn || !X || !Y) continue;
      const lenX = arcLen(X);
      const Ys = resample(Y, N_FIT);
      let pick: { U: Affine; overlap: number } | null = null;
      for (const same of [true, false])
        for (const mirror of [false, true]) {
          const { T: U, err } = procrustes(
            resample(same ? X : [...X].reverse(), N_FIT),
            Ys,
            mirror,
          );
          if (err > Math.max(4, 0.03 * lenX)) continue;
          const overlap = coverOf(
            ringSample(R).map((p) => apply(U, p)),
            Nn.rs,
          );
          if (!pick || overlap < pick.overlap) pick = { U, overlap };
        }
      if (!pick || pick.overlap > 0.2) continue;
      const cover = coverOf(
        ring.map((p) => apply(pick!.U, p)),
        Nn.rs,
      );
      if (!bestN || cover > bestN.cover) bestN = { host: y.piece, T: compose(pick.U, l.T), cover };
    }
    if (bestN && bestN.cover > l.cover + 0.25)
      out.set(k, {
        ...l,
        host: bestN.host,
        T: bestN.T,
        cover: bestN.cover,
        how: `${l.how}; it lies past ${l.host}'s edge, on ${bestN.host} across their seam`,
      });
  }
  return out;
}
