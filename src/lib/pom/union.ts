// The flat union of a group of pieces (body panels, the panels of one sleeve, one leg): every
// piece stays upright and is only TRANSLATED so that its sewn edges meet. Levels (chest, bicep,
// thigh) are horizontal lines of this frame; widths are read per piece in its own frame.
//
// A seam of equal lengths is met end to end (mean of its two end offsets). A partial / eased seam
// is anchored at the end where the shorter edge's shape trues up with the longer one (the same
// question A4 asks), and the residual is kept: a girth over a badly fitting seam is approximate.

import type { EdgeId, Pt2 } from 'lib/assembly-skeleton/types';
import { dist, pointAt, polyLen } from './geom';
import { pieceOf, type Model } from './model';
import type { EdgeRole } from './types';

export type Placement = {
  dx: number;
  dy: number;
  via: string | null;
  rmsMm: number;
  partial: boolean;
  /**
   * How unsure the LEVEL of this piece is, mm: for an equal seam half the vertical disagreement of
   * its two ends; for a partial seam 0 when its shorter side trues up (fit ≤ 3 mm) at one end,
   * else the fit residual. A girth across a placement above POM.alignRmsMm is approximate.
   */
  levelErrMm: number;
};

export type Union = {
  pieces: string[];
  at: Map<string, Placement>;
  /** Connected parts of the group (by the seams allowed); [0] holds the root. */
  components: string[][];
};

const SAMPLES = 24;

/** Concatenated points of a seam side (parts in their listed order). */
function sidePts(model: Model, ids: EdgeId[]): Pt2[] {
  const out: Pt2[] = [];
  for (const id of ids) {
    const e = model.edges.get(id);
    if (e) out.push(...e.pts);
  }
  return out;
}

type Fit = { t: Pt2; rms: number; partial: boolean; levelErr: number };

/**
 * Translation that brings side B (piece b's frame) onto side A (piece a's frame). Readings: B runs
 * against A ('rev', two face-up pieces) or along it ('same'); the better fit wins.
 */
export function fitSeam(A: Pt2[], B: Pt2[]): Fit | null {
  if (A.length < 2 || B.length < 2) return null;
  const la = polyLen(A);
  const lb = polyLen(B);
  const equal = Math.abs(la - lb) <= Math.max(3, 0.015 * Math.max(la, lb));
  type Cand = Fit & { anchor: 'start' | 'end' | 'mid'; anchorY: number };
  const cands: Cand[] = [];
  for (const rev of [true, false]) {
    const Bd = rev ? [...B].reverse() : B;
    const anchors: ('start' | 'end' | 'mid')[] = equal ? ['start'] : ['start', 'end', 'mid'];
    for (const anchor of anchors) {
      const L = Math.min(la, lb);
      const d: Pt2[] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const s = (L * i) / SAMPLES;
        const sa = equal
          ? (la * i) / SAMPLES
          : anchor === 'start'
            ? s
            : anchor === 'end'
              ? la - s
              : la / 2 + s - L / 2;
        const sb = equal
          ? (lb * i) / SAMPLES
          : anchor === 'start'
            ? s
            : anchor === 'end'
              ? lb - s
              : lb / 2 + s - L / 2;
        const pa = pointAt(A, sa);
        const pb = pointAt(Bd, sb);
        d.push([pa[0] - pb[0], pa[1] - pb[1]]);
      }
      // Equal seam: met end to end (mean of the two ends). When its ends disagree in height (two
      // differently curved edges of one length) a vertical seam is met at its LOWER end — panels
      // are sewn from the hem — and the disagreement is kept as the level's uncertainty.
      const vert = Math.abs(A[A.length - 1][1] - A[0][1]) > Math.abs(A[A.length - 1][0] - A[0][0]);
      const lowerIsStart = A[0][1] <= A[A.length - 1][1];
      const ends = Math.abs(d[0][1] - d[SAMPLES][1]) / 2;
      const t: Pt2 = equal
        ? vert && ends > 6
          ? lowerIsStart
            ? [d[0][0], d[0][1]]
            : [d[SAMPLES][0], d[SAMPLES][1]]
          : [(d[0][0] + d[SAMPLES][0]) / 2, (d[0][1] + d[SAMPLES][1]) / 2]
        : anchor === 'mid'
          ? [d[SAMPLES / 2][0], d[SAMPLES / 2][1]]
          : [d[0][0], d[0][1]];
      const rms = Math.sqrt(d.reduce((s, q) => s + dist(q, t) ** 2, 0) / d.length);
      const levelErr = equal ? ends : rms <= 3 ? 0 : rms;
      const anchorY =
        anchor === 'start'
          ? A[0][1]
          : anchor === 'end'
            ? A[A.length - 1][1]
            : pointAt(A, la / 2)[1];
      cands.push({ t, rms, partial: !equal, levelErr, anchor, anchorY });
    }
  }
  cands.sort((x, y) => x.rms - y.rms);
  const best = cands[0];
  if (!best || equal || best.rms <= 3) return best ?? null;
  // A partial seam that trues up at no end: panels are sewn from the hem, so a vertical seam is
  // met at its LOWER end; a horizontal one (a yoke over a pleated back) at its middle.
  const a0 = A[0];
  const a1 = A[A.length - 1];
  const vertical = Math.abs(a1[1] - a0[1]) > Math.abs(a1[0] - a0[0]);
  const pick = vertical
    ? cands
        .filter((c) => c.anchor !== 'mid')
        .sort((x, y) => x.anchorY - y.anchorY || x.rms - y.rms)[0]
    : cands.filter((c) => c.anchor === 'mid')[0];
  return pick ?? best;
}

export function layoutUnion(
  model: Model,
  pieces: string[],
  roles: ReadonlySet<EdgeRole>,
  extra: { a: EdgeId[]; b: EdgeId[] }[] = [],
): Union {
  const inGroup = new Set(pieces);
  const okSide = (ids: EdgeId[]) =>
    ids.length > 0 &&
    ids.every((id) => inGroup.has(pieceOf(id))) &&
    new Set(ids.map(pieceOf)).size === 1 &&
    ids.some((id) => roles.has(model.roles.get(id)?.role ?? 'unknown'));
  type Link = { a: string; b: string; fit: Fit; label: string };
  const links: Link[] = [];
  for (const s of [...model.seams.filter((x) => x.kind !== 'closure-not-seam'), ...extra]) {
    if (!okSide(s.a) || !okSide(s.b)) continue;
    const pa = pieceOf(s.a[0]);
    const pb = pieceOf(s.b[0]);
    if (pa === pb) continue;
    const fit = fitSeam(sidePts(model, s.a), sidePts(model, s.b));
    if (fit) links.push({ a: pa, b: pb, fit, label: `${s.a.join('+')}~${s.b.join('+')}` });
  }
  links.sort((x, y) => x.fit.rms - y.fit.rms);
  const area = (k: string) => model.geoms.get(k)?.areaMm2 ?? 0;
  const at = new Map<string, Placement>();
  const components: string[][] = [];
  const left = [...pieces].sort((x, y) => area(y) - area(x));
  while (left.length) {
    const root = left.shift()!;
    at.set(root, { dx: 0, dy: 0, via: null, rmsMm: 0, partial: false, levelErrMm: 0 });
    const comp = [root];
    // Prim-like growth: always take the best-fitting seam out of the placed set.
    for (;;) {
      const next = links.find(
        (l) => at.has(l.a) !== at.has(l.b) && comp.includes(at.has(l.a) ? l.a : l.b),
      );
      if (!next) break;
      const placedIsA = at.has(next.a);
      const base = at.get(placedIsA ? next.a : next.b)!;
      const t = placedIsA ? next.fit.t : ([-next.fit.t[0], -next.fit.t[1]] as Pt2);
      const nk = placedIsA ? next.b : next.a;
      at.set(nk, {
        dx: base.dx + t[0],
        dy: base.dy + t[1],
        via: next.label,
        rmsMm: next.fit.rms,
        partial: next.fit.partial,
        levelErrMm: next.fit.levelErr,
      });
      comp.push(nk);
      left.splice(left.indexOf(nk), 1);
    }
    components.push(comp);
  }
  return { pieces, at, components };
}

export const toUnion = (u: Union, key: string, p: Pt2): Pt2 => {
  const t = u.at.get(key) ?? { dx: 0, dy: 0 };
  return [p[0] + t.dx, p[1] + t.dy];
};
