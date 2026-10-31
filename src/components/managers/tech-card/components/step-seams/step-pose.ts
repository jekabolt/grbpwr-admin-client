// A PIECE PLACED BY HAND (P8) — a pose row says where one piece lies in a step's picture, in the
// frame of another piece (its host), with the numbers a surface placement uses. `stepLayout` lays
// everything as before and pins the posed pieces LAST: the posed piece goes where its row says on
// its host, the pieces hung on it go with it, and no seam pulls it anywhere afterwards.
//
// Pure, below step-picture (which imports it): no import of step-picture here.

import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply, compose, IDENTITY, translate } from 'lib/assembly-skeleton/union/affine';
import { poseOf, type SeamPlacement, type StoredPose } from 'lib/seams';

/** A posed piece as the layout reads it: on `host`, at `placement` (the surface encoding). */
export type PosePin = { host: string; placement: SeamPlacement; seamKey?: string };

const FLIP_Y: Affine = [1, 0, 0, -1, 0, 0];

type Box = { x0: number; y0: number; x1: number; y1: number };

// The very box `boxOf` reads (step-picture), kept here so this module stays below it.
function box(pts: Iterable<Pt2>): Box {
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
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 1, y1: 1 };
}

/** A piece's cut box in the drawing frame (y down), where a placement is measured. */
export const downBox = (g: PieceGeom): Box => box(g.rs.map((p) => apply(FLIP_Y, p)));

/**
 * The part's rs frame into the host's rs frame (both y up) for a placement: the part's cut-box
 * corner `xMm`/`yMm` from the host's (drawing frame, y down), turned by `rotDeg`, face down when
 * `flip` — the surface seam encoding (`surfaceSeam` lays a stored surface part by this very call).
 */
export function placementT(host: PieceGeom, part: PieceGeom, at: SeamPlacement): Affine {
  const hb = downBox(host);
  const pb = downBox(part);
  const th = (at.rotDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const flip: Affine = at.flip ? [-1, 0, 0, 1, 2 * pb.x0, 0] : IDENTITY;
  const M = compose(
    translate(hb.x0 + at.xMm, hb.y0 + at.yMm),
    compose([c, s, -s, c, 0, 0], compose(translate(-pb.x0, -pb.y0), flip)),
  );
  return compose(FLIP_Y, compose(M, FLIP_Y));
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const turn = (deg: number) => {
  const r = round(((deg % 360) + 360) % 360, 2);
  return r >= 360 ? 0 : r;
};

/**
 * The placement that lays `part` at `R` (its rs frame into the host's rs frame) — `placementT`
 * read back: the face from the sign of the turn, the angle from its first column, the corner from
 * the translation left once the turn is taken out. Millimetres and degrees to 0.01.
 */
export function placementOf(host: PieceGeom, part: PieceGeom, R: Affine): SeamPlacement {
  const M = compose(FLIP_Y, compose(R, FLIP_Y));
  const flip = M[0] * M[3] - M[1] * M[2] < 0;
  const rotDeg = turn(((flip ? Math.atan2(-M[1], -M[0]) : Math.atan2(M[1], M[0])) * 180) / Math.PI);
  const M0 = compose(
    FLIP_Y,
    compose(placementT(host, part, { xMm: 0, yMm: 0, rotDeg, flip }), FLIP_Y),
  );
  return { xMm: round(M[4] - M0[4], 2), yMm: round(M[5] - M0[5], 2), rotDeg, flip };
}

/**
 * The poses a step's views lay: the rows its own and every earlier step's `poseKeys` name (a later
 * step inherits them), a later step's pose of a piece winning over an earlier one's.
 */
export function posePinsOf(
  steps: readonly { poseKeys?: readonly string[] }[],
  rows: ReadonlyMap<string, StoredPose> | undefined,
): Map<string, PosePin> {
  const out = new Map<string, PosePin>();
  if (!rows?.size) return out;
  for (const step of steps)
    for (const key of step.poseKeys ?? []) {
      const row = rows.get(key);
      const pose = row ? poseOf(row) : null;
      if (!pose) continue;
      out.delete(pose.piece);
      out.set(pose.piece, { host: pose.host, placement: pose.placement, seamKey: key });
    }
  return out;
}

/**
 * What moves with a posed piece: the pieces hung on it (`links`: [piece, what it hangs on]) — its
 * side once its own hold is cut; the piece alone when its host hangs on that side too.
 */
export function poseGroup(
  piece: string,
  host: string,
  links: readonly (readonly [string, string])[],
): string[] {
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => adj.set(a, [...(adj.get(a) ?? []), b]);
  for (const [k, h] of links) {
    if (k === piece || k === h) continue;
    link(k, h);
    link(h, k);
  }
  const seen = new Set([piece]);
  const queue = [piece];
  while (queue.length)
    for (const n of adj.get(queue.shift()!) ?? [])
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  return seen.has(host) ? [piece] : [...seen];
}

function invert(T: Affine): Affine {
  const [a, b, c, d, e, f] = T;
  const k = a * d - b * c || 1;
  return [d / k, -b / k, -c / k, a / k, (c * f - d * e) / k, (b * e - a * f) / k];
}

const still = (D: Affine) =>
  Math.abs(D[0] - 1) + Math.abs(D[1]) + Math.abs(D[2]) + Math.abs(D[3] - 1) < 1e-9 &&
  Math.abs(D[4]) + Math.abs(D[5]) < 1e-6;

/**
 * Pin the posed pieces of a laid picture, in place: each where its row says on its host (`T` of
 * the host as laid), its group with it. A pose whose piece or host is not drawn is left out. Passes
 * until nothing moves (a pose on a posed host follows it), at most one per pose and one more.
 * Returns the pieces pinned and whether any of them moved.
 */
export function pinPoses(
  T: Map<string, Affine>,
  pose: ReadonlyMap<string, PosePin>,
  geoms: ReadonlyMap<string, PieceGeom>,
  links: readonly (readonly [string, string])[],
): { pinned: string[]; moved: boolean } {
  const pins = [...pose].filter(
    ([k, p]) =>
      k !== p.host &&
      T.has(k) &&
      T.has(p.host) &&
      (geoms.get(k)?.rs.length ?? 0) >= 3 &&
      (geoms.get(p.host)?.rs.length ?? 0) >= 3,
  );
  if (!pins.length) return { pinned: [], moved: false };
  const groups = new Map(
    pins.map(([k, p]) => [k, poseGroup(k, p.host, links).filter((m) => T.has(m))] as const),
  );
  let any = false;
  for (let pass = 0; pass <= pins.length; pass++) {
    let moved = false;
    for (const [k, p] of pins) {
      const want = compose(
        T.get(p.host)!,
        placementT(geoms.get(p.host)!, geoms.get(k)!, p.placement),
      );
      const D = compose(want, invert(T.get(k)!));
      if (still(D)) continue;
      for (const m of groups.get(k)!) T.set(m, m === k ? want : compose(D, T.get(m)!));
      moved = true;
    }
    if (!moved) break;
    any = true;
  }
  return { pinned: pins.map(([k]) => k), moved: any };
}

/** A drop's snap: the shift that lays a vertex of the dragged pieces on `host` at `at`. */
export type PoseSnap = { dx: number; dy: number; at: Pt2; host: string };

/**
 * Where a drop snaps (picture frame): a vertex of the dragged pieces onto a vertex of another piece
 * within `reach`, else onto the nearest point of its outline within `reach`; null — it stays put.
 */
export function snapPose(
  moving: readonly Pt2[],
  others: readonly { piece: string; ring: readonly Pt2[] }[],
  reach: number,
): PoseSnap | null {
  if (!moving.length || !(reach > 0)) return null;
  const mb = box(moving);
  let vertex: (PoseSnap & { d: number }) | null = null;
  let edge: (PoseSnap & { d: number }) | null = null;
  for (const o of others) {
    const ob = box(o.ring);
    if (
      ob.x0 > mb.x1 + reach ||
      ob.x1 < mb.x0 - reach ||
      ob.y0 > mb.y1 + reach ||
      ob.y1 < mb.y0 - reach
    )
      continue;
    const r = o.ring;
    for (const v of moving)
      for (let i = 0; i < r.length; i++) {
        const a = r[i];
        const b = r[(i + 1) % r.length];
        const dv = Math.hypot(a[0] - v[0], a[1] - v[1]);
        if (dv <= reach && (!vertex || dv < vertex.d))
          vertex = { d: dv, dx: a[0] - v[0], dy: a[1] - v[1], at: a, host: o.piece };
        const ex = b[0] - a[0];
        const ey = b[1] - a[1];
        const l2 = ex * ex + ey * ey;
        const t = l2 ? Math.max(0, Math.min(1, ((v[0] - a[0]) * ex + (v[1] - a[1]) * ey) / l2)) : 0;
        const p: Pt2 = [a[0] + ex * t, a[1] + ey * t];
        const de = Math.hypot(p[0] - v[0], p[1] - v[1]);
        if (de <= reach && (!edge || de < edge.d))
          edge = { d: de, dx: p[0] - v[0], dy: p[1] - v[1], at: p, host: o.piece };
      }
  }
  const best = vertex ?? edge;
  return best ? { dx: best.dx, dy: best.dy, at: best.at, host: best.host } : null;
}

/**
 * The host of a piece placed with no snap — the block's root: the biggest drawn piece of the first
 * input of its cluster that is neither the piece nor dragged with it, then of the other inputs.
 */
export function poseHostOf(
  piece: string,
  group: readonly string[],
  layout: {
    T: ReadonlyMap<string, Affine>;
    input: ReadonlyMap<string, number>;
    clusters: readonly (readonly number[])[];
  },
  geoms: ReadonlyMap<string, PieceGeom>,
): string | null {
  const skip = new Set([piece, ...group]);
  const own = layout.input.get(piece);
  const cluster = layout.clusters.find((c) => own != null && c.includes(own)) ?? [];
  const inputs = [...new Set(layout.input.values())].sort((a, b) => a - b);
  const area = (k: string) => Math.abs(geoms.get(k)?.areaMm2 ?? 0);
  for (const j of [...cluster, ...inputs.filter((i) => !cluster.includes(i))]) {
    const keys = [...layout.T.keys()].filter(
      (k) => layout.input.get(k) === j && !skip.has(k) && (geoms.get(k)?.rs.length ?? 0) >= 3,
    );
    if (keys.length) return keys.reduce((best, k) => (area(k) > area(best) ? k : best));
  }
  return null;
}

/** A quarter turn (⟲ +1, ⟳ −1) or a flip (0) of a piece about its box centre, picture frame. */
export function turnAbout(ring: readonly Pt2[], quarter: -1 | 0 | 1): Affine {
  const b = box(ring);
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const L: Affine =
    quarter === 1
      ? [0, 1, -1, 0, 0, 0]
      : quarter === -1
        ? [0, -1, 1, 0, 0, 0]
        : [-1, 0, 0, 1, 0, 0];
  return compose(translate(cx, cy), compose(L, translate(-cx, -cy)));
}

/** The placement of `piece` laid at `T` on `host` laid at `hostT` (both picture frame). */
export function poseAt(host: PieceGeom, piece: PieceGeom, hostT: Affine, T: Affine): SeamPlacement {
  return placementOf(host, piece, compose(invert(hostT), T));
}
