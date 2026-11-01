// The folded shape of a flat piece — pure 2D, millimetres in whatever frame `poly` is in.
//
// Each fold reflects the part on its `flipAt` side across the line, applied in order: a double turn-up
// is two folds. `in` turns the part toward the wrong side (it goes UNDER the face), `out` toward the
// face (it lands ON TOP). The plies come back bottom → top as seen from the face; the outline is the
// part that never moved (the folded footprint whenever the smaller part flips, the default).
//
// `foldedOutline(poly, folds)` keeps the signature the doll lane (SPEC-T3) promised for
// `src/lib/doll`, so the picker can swap to that one when it lands.

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { add, cross, inside, mul, perp, sub, unit } from './geom';
import type { FoldKind } from './types';

/** One fold in the same frame as the polygon. */
export type FlatFold = { a: Pt2; b: Pt2; flipAt: Pt2; kind: FoldKind };

export type FoldPly = {
  poly: Pt2[];
  /** The ply was turned an odd number of times: its wrong side faces up. */
  flipped: boolean;
  /** 0 = never moved; otherwise the fold (1-based) that last moved it. */
  by: number;
  /** Animation: how far through its own turn this ply is (1 = laid down). */
  t: number;
};

export type FoldedShape = {
  outline: Pt2[];
  plies: FoldPly[];
  /** Across the last fold line: the folded stack's width, mm. */
  finishedWidthMm: number;
  /** …and the flat piece's width on the same axis. */
  cutWidthMm: number;
  /** The fold lines where they lie after folding (the new edges). */
  creases: [Pt2, Pt2][];
};

const area = (p: readonly Pt2[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += cross(p[i], p[(i + 1) % p.length]);
  return Math.abs(s) / 2;
};

/** The part of `poly` on side `s` of the line a→b (s = +1 left, −1 right). Sutherland–Hodgman. */
export function clipSide(poly: readonly Pt2[], a: Pt2, b: Pt2, s: number): Pt2[] {
  const d = sub(b, a);
  const side = (p: Pt2) => cross(d, sub(p, a)) * s;
  const out: Pt2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i];
    const n = poly[(i + 1) % poly.length];
    const sc = side(c);
    const sn = side(n);
    if (sc >= 0) out.push(c);
    if (sc * sn < 0) out.push(add(c, mul(sub(n, c), sc / (sc - sn))));
  }
  return out;
}

export function reflect(p: Pt2, a: Pt2, b: Pt2): Pt2 {
  const d = unit(sub(b, a));
  const v = sub(p, a);
  const k = v[0] * d[0] + v[1] * d[1];
  return sub(mul(add(a, mul(d, k)), 2), p);
}

/** Which side of a→b a point is on: +1 left, −1 right. */
export const sideOf = (a: Pt2, b: Pt2, p: Pt2): 1 | -1 =>
  cross(sub(b, a), sub(p, a)) >= 0 ? 1 : -1;

/** The side of a→b holding the smaller part of the piece — the one that flips by default. */
export function smallerSide(poly: readonly Pt2[], a: Pt2, b: Pt2): 1 | -1 {
  return area(clipSide(poly, a, b, 1)) <= area(clipSide(poly, a, b, -1)) ? 1 : -1;
}

/** A point inside the piece on side `s` of a→b, near the middle of the line; null when none. */
export function pointOnSide(poly: readonly Pt2[], a: Pt2, b: Pt2, s: number): Pt2 | null {
  const mid = mul(add(a, b), 0.5);
  const n = mul(perp(unit(sub(b, a))), s);
  for (const step of [5, 2, 1, 10, 20, 40]) {
    const p = add(mid, mul(n, step));
    if (inside(poly, p)) return p;
  }
  return null;
}

/**
 * «double»: two equal turns toward the wrong side from one line. The first fold sits halfway between
 * the line and the far edge of the flipping part, the second on the line itself.
 */
export function doubleTurn(poly: readonly Pt2[], a: Pt2, b: Pt2, s: number): [Pt2, Pt2][] {
  const dir = mul(perp(unit(sub(b, a))), s);
  let ext = 0;
  for (const q of clipSide(poly, a, b, s))
    ext = Math.max(ext, sub(q, a)[0] * dir[0] + sub(q, a)[1] * dir[1]);
  const sh = mul(dir, ext / 2);
  return [
    [add(a, sh), add(b, sh)],
    [a, b],
  ];
}

const lerp = (p: Pt2, q: Pt2, t: number): Pt2 => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
];

export type FoldedOptions = {
  /** Animation: folds before `index` are laid, fold `index` is `t` of the way, later ones not yet. */
  progress?: { index: number; t: number };
};

export function foldedOutline(
  poly: readonly Pt2[],
  folds: readonly FlatFold[],
  opts: FoldedOptions = {},
): FoldedShape {
  let plies: FoldPly[] = [{ poly: [...poly], flipped: false, by: 0, t: 1 }];
  const creases: [Pt2, Pt2][] = [];
  folds.forEach((f, i) => {
    const pr = opts.progress;
    const t = !pr || i < pr.index ? 1 : i === pr.index ? Math.max(0, Math.min(1, pr.t)) : 0;
    creases.push([f.a, f.b]);
    if (t <= 0) return;
    const s = sideOf(f.a, f.b, f.flipAt);
    const near: FoldPly[] = [];
    const far: FoldPly[] = [];
    for (const y of plies) {
      const nb = clipSide(y.poly, f.a, f.b, -s);
      const fb = clipSide(y.poly, f.a, f.b, s);
      if (nb.length > 2 && area(nb) > 1) near.push({ ...y, poly: nb });
      if (fb.length > 2 && area(fb) > 1)
        far.push({
          poly: fb.map((q) => lerp(q, reflect(q, f.a, f.b), t)),
          flipped: !y.flipped,
          by: i + 1,
          t,
        });
    }
    // A turned stack lands in reverse order: its top ply ends up at the bottom.
    far.reverse();
    plies = f.kind === 'outward' ? [...near, ...far] : [...far, ...near];
  });

  const still = plies.filter((y) => y.by === 0);
  const outline = still.length
    ? still.reduce((m, y) => (area(y.poly) > area(m.poly) ? y : m)).poly
    : [];
  const last = folds[folds.length - 1];
  const span = (polys: readonly (readonly Pt2[])[], n: Pt2) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of polys)
      for (const q of p) {
        const v = q[0] * n[0] + q[1] * n[1];
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    return hi > lo ? hi - lo : 0;
  };
  const n = last ? perp(unit(sub(last.b, last.a))) : ([1, 0] as Pt2);
  return {
    outline,
    plies,
    finishedWidthMm: span(
      plies.map((y) => y.poly),
      n,
    ),
    cutWidthMm: span([poly], n),
    creases,
  };
}

// ── cross-section: a 1D slice across the folds ──────────────────────────────────────────────

export type SectionPly = { id: number; lo: number; hi: number; flipped: boolean };
export type SectionJoin = { a: number; b: number; c: number };
export type FoldSection = {
  /** Bottom → top, as seen from the face. */
  plies: SectionPly[];
  /** The turns: ply a meets ply b at coordinate c. */
  joins: SectionJoin[];
  cut: { lo: number; hi: number };
  fin: { lo: number; hi: number };
};

/** The stack across the first fold's normal (the folds of one piece are parallel in v1). */
export function foldSection(poly: readonly Pt2[], folds: readonly FlatFold[]): FoldSection | null {
  if (!folds.length) return null;
  const n = perp(unit(sub(folds[0].b, folds[0].a)));
  const dot = (p: Pt2) => p[0] * n[0] + p[1] * n[1];
  let lo = Infinity;
  let hi = -Infinity;
  for (const q of poly) {
    lo = Math.min(lo, dot(q));
    hi = Math.max(hi, dot(q));
  }
  let plies: SectionPly[] = [{ id: 0, lo, hi, flipped: false }];
  let joins: (SectionJoin & { fresh?: boolean })[] = [];
  let nid = 1;
  for (const f of folds) {
    const nl = perp(unit(sub(f.b, f.a)));
    const c = dot(f.a);
    const s = sideOf(f.a, f.b, f.flipAt);
    // tt > 0: the flipping side is where the coordinate grows past c.
    const tt = s * (nl[0] * n[0] + nl[1] * n[1] >= 0 ? 1 : -1);
    const near: SectionPly[] = [];
    const far: SectionPly[] = [];
    const map: Record<number, { n?: number; f?: number }> = {};
    for (const X of plies) {
      let nr: [number, number] | null = null;
      let fr: [number, number] | null = null;
      if (tt > 0) {
        if (X.lo < c - 1e-6) nr = [X.lo, Math.min(X.hi, c)];
        if (X.hi > c + 1e-6) fr = [Math.max(X.lo, c), X.hi];
      } else {
        if (X.hi > c + 1e-6) nr = [Math.max(X.lo, c), X.hi];
        if (X.lo < c - 1e-6) fr = [X.lo, Math.min(X.hi, c)];
      }
      if (nr && nr[1] - nr[0] < 0.01) nr = null;
      if (fr && fr[1] - fr[0] < 0.01) fr = null;
      map[X.id] = {};
      if (nr) {
        near.push({ id: X.id, lo: nr[0], hi: nr[1], flipped: X.flipped });
        map[X.id].n = X.id;
      }
      if (fr) {
        const id = nr ? nid++ : X.id;
        far.push({ id, lo: 2 * c - fr[1], hi: 2 * c - fr[0], flipped: !X.flipped });
        map[X.id].f = id;
      }
      if (nr && fr) joins.push({ a: X.id, b: map[X.id].f!, c, fresh: true });
    }
    joins = joins.map((j) => {
      if (j.fresh) return { a: j.a, b: j.b, c: j.c };
      const isFar = (j.c - c) * tt > 1e-6;
      const side = isFar ? 'f' : 'n';
      return {
        a: map[j.a]?.[side] ?? j.a,
        b: map[j.b]?.[side] ?? j.b,
        c: isFar ? 2 * c - j.c : j.c,
      };
    });
    far.reverse();
    plies = f.kind === 'outward' ? [...near, ...far] : [...far, ...near];
  }
  let flo = Infinity;
  let fhi = -Infinity;
  for (const y of plies) {
    flo = Math.min(flo, y.lo);
    fhi = Math.max(fhi, y.hi);
  }
  return { plies, joins, cut: { lo, hi }, fin: { lo: flo, hi: fhi } };
}
