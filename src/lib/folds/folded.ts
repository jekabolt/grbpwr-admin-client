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
import {
  add,
  clipThrough,
  cross,
  distToPoly,
  inside,
  mul,
  perp,
  sideDist,
  sub,
  unit,
} from './geom';
import { mapPleatPoint, pleatFanGeometry, rotateAround, type PleatFanGeometry } from './pleat';
import { FOLDS, type FoldKind } from './types';

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
  /** The intake under a PLEAT: grey convention layer, never a turned wrong side. */
  hidden?: boolean;
  /** A rigid face-up half moved by PLEAT, not a reflected flap. */
  pleatFace?: boolean;
  /** The latest ordinary turn laid this ply under the face. */
  under?: boolean;
};

export type FoldPleat = {
  apex: Pt2;
  /** The grey plan-view convention for the intake, half the opening on either side. */
  wedge: [Pt2, Pt2, Pt2];
  /** Both hidden edges are dashed. */
  edges: [[Pt2, Pt2], [Pt2, Pt2]];
  /** The centre crease stays solid on top. */
  centre: [Pt2, Pt2];
  by: number;
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
  /** Closed PLEAT drawing conventions, transformed through any later folds. */
  pleats: FoldPleat[];
};

const area = (p: readonly Pt2[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += cross(p[i], p[(i + 1) % p.length]);
  return Math.abs(s) / 2;
};

const DOT_EPS = 1e-9;

/**
 * A line that reaches the contour at both ends keeps the old infinite-line fold. A line extended
 * past the contour does too when its two perpendicular end planes already enclose the whole piece.
 */
export function isFoldBounded(poly: readonly Pt2[], fold: FlatFold): boolean {
  const d = sub(fold.b, fold.a);
  const l2 = d[0] ** 2 + d[1] ** 2;
  const reach = Math.max(
    FOLDS.onContourMm,
    Math.min(FOLDS.markReachMm, FOLDS.reachShare * Math.sqrt(l2)),
  );
  if (distToPoly(poly, fold.a) <= reach && distToPoly(poly, fold.b) <= reach) return false;
  if (l2 <= DOT_EPS) return false;
  return poly.some((q) => {
    const t = (sub(q, fold.a)[0] * d[0] + sub(q, fold.a)[1] * d[1]) / l2;
    return t < -DOT_EPS || t > 1 + DOT_EPS;
  });
}

/** Whether `point` lies between the perpendiculars through a fold segment's ends. */
export function inFoldBand(point: Pt2, fold: FlatFold): boolean {
  const d = sub(fold.b, fold.a);
  const l2 = d[0] ** 2 + d[1] ** 2;
  if (l2 <= DOT_EPS) return true;
  const t = (sub(point, fold.a)[0] * d[0] + sub(point, fold.a)[1] * d[1]) / l2;
  return t >= -DOT_EPS && t <= 1 + DOT_EPS;
}

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

const useful = (poly: Pt2[]) => poly.length > 2 && area(poly) > 1;

/** Split one ply into the stationary pieces and the one moving piece of a fold. */
function splitFoldPly(
  poly: readonly Pt2[],
  fold: FlatFold,
  side: number,
  bounded: boolean,
): { fixed: Pt2[][]; moving: Pt2[] } {
  const near = clipSide(poly, fold.a, fold.b, -side);
  const far = clipSide(poly, fold.a, fold.b, side);
  if (!bounded || !useful(far)) return { fixed: useful(near) ? [near] : [], moving: far };

  const d = sub(fold.b, fold.a);
  // cross(-perp(d), q-a) = dot(d, q-a): positive is beyond the start.
  const startDir = mul(perp(d), -1);
  const before = clipSide(far, fold.a, add(fold.a, startDir), -1);
  const afterStart = clipSide(far, fold.a, add(fold.a, startDir), 1);
  // cross(perp(d), q-b) = -dot(d, q-b): positive is before the end.
  const endDir = perp(d);
  const moving = clipSide(afterStart, fold.b, add(fold.b, endDir), 1);
  const after = clipSide(afterStart, fold.b, add(fold.b, endDir), -1);
  return { fixed: [near, before, after].filter(useful), moving };
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
  const fold: FlatFold = { a, b, flipAt: a, kind: 'inward' };
  const bounded = isFoldBounded(poly, fold);
  const sideArea = (side: 1 | -1) =>
    area(bounded ? splitFoldPly(poly, fold, side, true).moving : clipSide(poly, a, b, side));
  return sideArea(1) <= sideArea(-1) ? 1 : -1;
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
  const fold: FlatFold = { a, b, flipAt: a, kind: 'inward' };
  const bounded = isFoldBounded(poly, fold);
  const moving = bounded ? splitFoldPly(poly, fold, s, true).moving : clipSide(poly, a, b, s);
  let ext = 0;
  for (const q of moving) ext = Math.max(ext, sub(q, a)[0] * dir[0] + sub(q, a)[1] * dir[1]);
  const sh = mul(dir, ext / 2);
  const shifted: [Pt2, Pt2] = [add(a, sh), add(b, sh)];
  // On a tapered piece the shifted ends of a full fold can miss the contour; it must stay full.
  const stillFull =
    !bounded &&
    isFoldBounded(poly, { ...fold, a: shifted[0], b: shifted[1] }) &&
    clipThrough(poly, mul(add(shifted[0], shifted[1]), 0.5), sub(b, a));
  return [stillFull || shifted, [a, b]];
}

const pointKey = ([x, y]: Pt2) => `${Math.round(x * 1e7)},${Math.round(y * 1e7)}`;

/** Join adjacent stationary clipping cells back into the fixed outline. */
function joinedOutline(polys: readonly Pt2[][]): Pt2[] {
  if (polys.length === 1) return polys[0];
  const vertices = polys.flat();
  const coords = new Map(vertices.map((p) => [pointKey(p), p]));
  const boundary = new Map<string, { a: string; b: string; direction: number }>();

  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ab = sub(b, a);
      const l2 = ab[0] ** 2 + ab[1] ** 2;
      if (l2 <= DOT_EPS) continue;
      const cuts = vertices
        .map((p) => {
          const ap = sub(p, a);
          const t = (ap[0] * ab[0] + ap[1] * ab[1]) / l2;
          const off = Math.abs(cross(ab, ap)) / Math.sqrt(l2);
          return { p, t, off };
        })
        .filter(({ t, off }) => t >= -DOT_EPS && t <= 1 + DOT_EPS && off <= 1e-7)
        .sort((x, y) => x.t - y.t);
      for (let j = 0; j + 1 < cuts.length; j++) {
        const ak = pointKey(cuts[j].p);
        const bk = pointKey(cuts[j + 1].p);
        if (ak === bk) continue;
        const forward = ak < bk;
        const key = forward ? `${ak}|${bk}` : `${bk}|${ak}`;
        const direction = forward ? 1 : -1;
        const old = boundary.get(key);
        if (!old) boundary.set(key, { a: ak, b: bk, direction });
        else if (old.direction + direction === 0) boundary.delete(key);
      }
    }
  }

  const edges = [...boundary.values()].map(({ a, b }) => ({ a, b }));
  const rings: Pt2[][] = [];
  while (edges.length) {
    const first = edges.pop()!;
    const keys = [first.a, first.b];
    while (keys[keys.length - 1] !== keys[0]) {
      const at = keys[keys.length - 1];
      const next = edges.findIndex((edge) => edge.a === at);
      if (next < 0) break;
      keys.push(edges.splice(next, 1)[0].b);
    }
    const ring = keys.slice(0, -1).map((key) => coords.get(key)!);
    if (ring.length > 2) rings.push(ring);
  }
  return rings.length
    ? rings.reduce((largest, ring) => (area(ring) > area(largest) ? ring : largest))
    : polys.reduce((largest, poly) => (area(poly) > area(largest) ? poly : largest));
}

const lerp = (p: Pt2, q: Pt2, t: number): Pt2 => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
];

export type FoldedOptions = {
  /** Animation: folds before `index` are laid, fold `index` is `t` of the way, later ones not yet. */
  progress?: { index: number; t: number };
};

type FanLine = { line: [Pt2, Pt2]; fold: FlatFold; index: number };
type FoldProgramOp =
  | { kind: 'ordinary'; fold: FlatFold; bounded: boolean; index: number }
  | { kind: 'pleat'; fan: PleatFanGeometry<FanLine>; index: number };

const currentPointMoves = (point: Pt2, probe: Pt2, fold: FlatFold, bounded: boolean) => {
  const side = sideDist(fold.a, fold.b, point);
  const probeSide = sideDist(fold.a, fold.b, probe);
  const tested = Math.abs(side) <= 1e-7 ? probeSide : side;
  return (
    Math.sign(tested) === sideOf(fold.a, fold.b, fold.flipAt) &&
    (!bounded || inFoldBand(point, fold))
  );
};

/** Consecutive PLEAT rows are one event. A lone/broken row is deliberately a no-op. */
function foldProgram(poly: readonly Pt2[], folds: readonly FlatFold[]): FoldProgramOp[] {
  const ops: FoldProgramOp[] = [];
  let mapper: (point: Pt2, probe?: Pt2) => Pt2 = (point) => point;
  let mappedPoly = [...poly];
  for (let i = 0; i < folds.length; ) {
    if (folds[i].kind === 'pleat') {
      const triple = folds.slice(i, i + 3);
      if (triple.length === 3 && triple.every((fold) => fold.kind === 'pleat')) {
        const inputs = triple.map(
          (fold, offset): FanLine => ({
            fold,
            index: i + offset,
            line: [mapper(fold.a), mapper(fold.b)],
          }),
        ) as [FanLine, FanLine, FanLine];
        const fan = pleatFanGeometry(inputs);
        if (fan) {
          ops.push({ kind: 'pleat', fan, index: i });
          const before = mapper;
          mapper = (point, probe = point) => {
            const mappedProbe = before(probe, probe);
            return mapPleatPoint(before(point, probe), fan, mappedProbe);
          };
          mappedPoly = poly.map((point) => mapper(point));
          i += 3;
          continue;
        }
      }
      i++;
      continue;
    }
    const source = folds[i];
    const fold: FlatFold = {
      ...source,
      a: mapper(source.a),
      b: mapper(source.b),
      flipAt: mapper(source.flipAt),
    };
    const bounded = isFoldBounded(mappedPoly, fold);
    ops.push({ kind: 'ordinary', fold, bounded, index: i });
    const before = mapper;
    mapper = (point, probe = point) => {
      const q = before(point, probe);
      const qp = before(probe, probe);
      return currentPointMoves(q, qp, fold, bounded) ? reflect(q, fold.a, fold.b) : q;
    };
    mappedPoly = poly.map((point) => mapper(point));
    i++;
  }
  return ops;
}

/** One flat point through rigid PLEAT rotations and every later ordinary fold. */
export function foldedPoint(
  poly: readonly Pt2[],
  folds: readonly FlatFold[],
  point: Pt2,
  probe: Pt2 = point,
): Pt2 {
  let p: Pt2 = point;
  let q: Pt2 = probe;
  for (const op of foldProgram(poly, folds)) {
    if (op.kind === 'pleat') {
      p = mapPleatPoint(p, op.fan, q);
      q = mapPleatPoint(q, op.fan, q);
    } else {
      if (currentPointMoves(p, q, op.fold, op.bounded)) p = reflect(p, op.fold.a, op.fold.b);
      if (currentPointMoves(q, q, op.fold, op.bounded)) q = reflect(q, op.fold.a, op.fold.b);
    }
  }
  return p;
}

const mapLineByOrdinary = (line: [Pt2, Pt2], fold: FlatFold, bounded: boolean): [Pt2, Pt2] => {
  const probe = mul(add(line[0], line[1]), 0.5);
  return line.map((point) =>
    currentPointMoves(point, probe, fold, bounded) ? reflect(point, fold.a, fold.b) : point,
  ) as [Pt2, Pt2];
};

const mapPleatByOrdinary = (pleat: FoldPleat, fold: FlatFold, bounded: boolean): FoldPleat => {
  const map = (point: Pt2, probe: Pt2) =>
    currentPointMoves(point, probe, fold, bounded) ? reflect(point, fold.a, fold.b) : point;
  const wedgeProbe = pleat.wedge.reduce<Pt2>((sum, point) => add(sum, point), [0, 0]);
  const probe = mul(wedgeProbe, 1 / 3);
  const wedge = pleat.wedge.map((point) => map(point, probe)) as [Pt2, Pt2, Pt2];
  const centre = mapLineByOrdinary(pleat.centre, fold, bounded);
  return {
    ...pleat,
    wedge,
    edges: [
      [wedge[0], wedge[1]],
      [wedge[0], wedge[2]],
    ],
    centre,
  };
};

function foldedPleatOutline(poly: readonly Pt2[], folds: readonly FlatFold[]): FoldedShape {
  let plies: FoldPly[] = [{ poly: [...poly], flipped: false, by: 0, t: 1 }];
  let creases: [Pt2, Pt2][] = [];
  let pleats: FoldPleat[] = [];
  const program = foldProgram(poly, folds);
  for (const op of program) {
    if (op.kind === 'ordinary') {
      const near: FoldPly[] = [];
      const far: FoldPly[] = [];
      for (const ply of plies) {
        const side = sideOf(op.fold.a, op.fold.b, op.fold.flipAt);
        const split = splitFoldPly(ply.poly, op.fold, side, op.bounded);
        near.push(...split.fixed.map((part) => ({ ...ply, poly: part })));
        if (useful(split.moving))
          far.push({
            ...ply,
            poly: split.moving.map((point) => reflect(point, op.fold.a, op.fold.b)),
            flipped: ply.hidden ? false : !ply.flipped,
            by: op.index + 1,
            pleatFace: false,
            under: op.fold.kind === 'inward',
          });
      }
      far.reverse();
      plies = op.fold.kind === 'outward' ? [...near, ...far] : [...far, ...near];
      creases = creases.map((line) => mapLineByOrdinary(line, op.fold, op.bounded));
      pleats = pleats.map((pleat) => mapPleatByOrdinary(pleat, op.fold, op.bounded));
      creases.push([op.fold.a, op.fold.b]);
      continue;
    }

    const fan = op.fan;
    const centreFar = fan.far.get(fan.centre)!;
    const visible: FoldPly[] = [];
    for (const ply of plies.filter((item) => !item.hidden)) {
      const splitOutside = (leg: FanLine, angle: number) => {
        const centreSide = sideOf(leg.line[0], leg.line[1], centreFar);
        const part = clipSide(ply.poly, leg.line[0], leg.line[1], -centreSide);
        if (useful(part))
          visible.push({
            ...ply,
            poly: part.map((point) => rotateAround(point, fan.apex, angle)),
            flipped: ply.flipped,
            by: op.index + 1,
            pleatFace: true,
          });
      };
      splitOutside(fan.negative, fan.negativeGapRad);
      splitOutside(fan.positive, -fan.positiveGapRad);
    }
    const left = rotateAround(fan.far.get(fan.negative)!, fan.apex, fan.negativeGapRad / 2);
    const right = rotateAround(fan.far.get(fan.positive)!, fan.apex, -fan.positiveGapRad / 2);
    const wedge: [Pt2, Pt2, Pt2] = [[...fan.apex], left, right];
    const hidden: FoldPly = {
      poly: wedge,
      flipped: false,
      by: op.index + 1,
      t: 1,
      hidden: true,
    };
    plies = [...visible, hidden];
    creases = creases.map(
      (line) =>
        line.map((point) => mapPleatPoint(point, fan, mul(add(line[0], line[1]), 0.5))) as [
          Pt2,
          Pt2,
        ],
    );
    const centre: [Pt2, Pt2] = [[...fan.apex], [...centreFar]];
    creases.push(centre);
    pleats.push({
      apex: [...fan.apex],
      wedge,
      edges: [
        [wedge[0], wedge[1]],
        [wedge[0], wedge[2]],
      ],
      centre,
      by: op.index + 1,
    });
  }

  const face = plies.filter((ply) => !ply.hidden && useful(ply.poly));
  const outline = face.length ? joinedOutline(face.map((ply) => ply.poly)) : [];
  const last = program.at(-1);
  const lastLine: [Pt2, Pt2] | undefined =
    last?.kind === 'pleat'
      ? last.fan.centre.line
      : last?.kind === 'ordinary'
        ? [last.fold.a, last.fold.b]
        : undefined;
  const n = lastLine ? perp(unit(sub(lastLine[1], lastLine[0]))) : ([1, 0] as Pt2);
  const span = (polys: readonly (readonly Pt2[])[]) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const points of polys)
      for (const point of points) {
        const at = point[0] * n[0] + point[1] * n[1];
        lo = Math.min(lo, at);
        hi = Math.max(hi, at);
      }
    return hi > lo ? hi - lo : 0;
  };
  return {
    outline,
    plies,
    finishedWidthMm: span(face.map((ply) => ply.poly)),
    cutWidthMm: span([poly]),
    creases,
    pleats,
  };
}

/** Two fold segments cross inside both of them (a shared end, as in a pleat fan, is no crossing). */
export function foldsCross(folds: readonly FlatFold[]): boolean {
  const END = 1e-3;
  for (let i = 0; i < folds.length; i++)
    for (let j = i + 1; j < folds.length; j++) {
      const p = folds[i];
      const q = folds[j];
      const r = sub(p.b, p.a);
      const e = sub(q.b, q.a);
      const den = cross(r, e);
      if (Math.abs(den) <= DOT_EPS) continue;
      const w = sub(q.a, p.a);
      const t = cross(w, e) / den;
      const u = cross(w, r) / den;
      if (t > END && t < 1 - END && u > END && u < 1 - END) return true;
    }
  return false;
}

/**
 * The creases a flat point crosses from the part that stays, nearest first. A crease farther out
 * goes after the crease it lies beyond, whatever order the two were made in.
 */
export function insertCrease(chain: readonly FlatFold[], fold: FlatFold): FlatFold[] {
  const s = sideOf(fold.a, fold.b, fold.flipAt);
  const at = chain.findIndex((c) => sideOf(fold.a, fold.b, mul(add(c.a, c.b), 0.5)) === s);
  return at < 0 ? [...chain, fold] : [...chain.slice(0, at), fold, ...chain.slice(at)];
}

export const throughCreases = (p: Pt2, chain: readonly FlatFold[]): Pt2 =>
  chain.reduceRight((q, c) => reflect(q, c.a, c.b), p);

export function foldedOutline(
  poly: readonly Pt2[],
  folds: readonly FlatFold[],
  opts: FoldedOptions = {},
): FoldedShape {
  if (folds.some((fold) => fold.kind === 'pleat')) return foldedPleatOutline(poly, folds);
  // Each ply is cut on the flat piece, so a fold moves only what lies beyond its own line on the
  // flat piece, not what an earlier fold happened to lay there. Crossing lines have no such order.
  const byFlat = !foldsCross(folds);
  let plies: (FoldPly & { flat: Pt2[]; chain: FlatFold[] })[] = [
    { poly: [...poly], flat: [...poly], chain: [], flipped: false, by: 0, t: 1 },
  ];
  const creases: [Pt2, Pt2][] = [];
  let hasBoundedFold = false;
  folds.forEach((f, i) => {
    const pr = opts.progress;
    const t = !pr || i < pr.index ? 1 : i === pr.index ? Math.max(0, Math.min(1, pr.t)) : 0;
    creases.push([f.a, f.b]);
    if (t <= 0) return;
    const s = sideOf(f.a, f.b, f.flipAt);
    const bounded = isFoldBounded(poly, f);
    hasBoundedFold ||= bounded;
    const near: typeof plies = [];
    const far: typeof plies = [];
    for (const y of plies) {
      const { fixed, moving } = splitFoldPly(byFlat ? y.flat : y.poly, f, s, bounded);
      near.push(
        ...fixed.map((part) =>
          byFlat
            ? { ...y, flat: part, poly: part.map((q) => throughCreases(q, y.chain)) }
            : { ...y, poly: part },
        ),
      );
      if (!useful(moving)) continue;
      const chain = byFlat ? insertCrease(y.chain, f) : [];
      far.push({
        poly: byFlat
          ? moving.map((q) => lerp(throughCreases(q, y.chain), throughCreases(q, chain), t))
          : moving.map((q) => lerp(q, reflect(q, f.a, f.b), t)),
        flat: moving,
        chain,
        flipped: !y.flipped,
        by: i + 1,
        t,
      });
    }
    // A turned stack lands in reverse order: its top ply ends up at the bottom.
    far.reverse();
    plies = f.kind === 'outward' ? [...near, ...far] : [...far, ...near];
  });
  if (byFlat && !opts.progress) {
    // A crease lies where the ply on its edge landed.
    creases.forEach(([a, b], i) => {
      const mid = mul(add(a, b), 0.5);
      const owner = plies.find((y) => distToPoly(y.flat, mid) <= 1e-6);
      if (owner) creases[i] = [throughCreases(a, owner.chain), throughCreases(b, owner.chain)];
    });
  }

  const still = plies.filter((y) => y.by === 0);
  const outline = still.length
    ? hasBoundedFold
      ? joinedOutline(still.map((y) => y.poly))
      : still.reduce((m, y) => (area(y.poly) > area(m.poly) ? y : m)).poly
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
    plies: plies.map(({ poly: ply, flipped, by, t }) => ({ poly: ply, flipped, by, t })),
    finishedWidthMm: span(
      plies.map((y) => y.poly),
      n,
    ),
    cutWidthMm: span([poly], n),
    creases,
    pleats: [],
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

/**
 * The stack across the first fold's normal (the folds of one piece are parallel in v1). A bounded
 * fold also keeps the projected flat ply that exists beyond either end of its segment.
 */
export function foldSection(poly: readonly Pt2[], folds: readonly FlatFold[]): FoldSection | null {
  if (!folds.length) return null;
  if (folds.some((fold) => fold.kind === 'pleat')) {
    const shape = foldedOutline(poly, folds);
    const centre = shape.pleats[0]?.centre;
    if (!centre) return null;
    const n = perp(unit(sub(centre[1], centre[0])));
    const dot = (point: Pt2) => point[0] * n[0] + point[1] * n[1];
    const extent = (points: readonly Pt2[]) => {
      const values = points.map(dot);
      return { lo: Math.min(...values), hi: Math.max(...values) };
    };
    const cut = extent(poly);
    const sectionPlies = shape.plies
      .filter((ply) => useful(ply.poly))
      .map((ply, id) => ({ id, ...extent(ply.poly), flipped: false }));
    const fin = sectionPlies.reduce(
      (out, ply) => ({ lo: Math.min(out.lo, ply.lo), hi: Math.max(out.hi, ply.hi) }),
      { lo: Infinity, hi: -Infinity },
    );
    return { plies: sectionPlies, joins: [], cut, fin };
  }
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
    const bounded = isFoldBounded(poly, f);
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
      // Outside the endpoint band this same ply stays flat, so its aggregate projection stays whole.
      if (bounded && fr) nr = [X.lo, X.hi];
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
