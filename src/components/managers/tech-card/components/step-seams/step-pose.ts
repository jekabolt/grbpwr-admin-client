// A PIECE PLACED BY HAND (P8) — a pose row says where one piece lies in a step's picture, in the
// frame of another piece (its host), with the numbers a surface placement uses. `stepLayout` lays
// everything as before and pins the posed pieces LAST: the posed piece goes where its row says on
// its host, the pieces hung on it go with it, and no seam pulls it anywhere afterwards.
//
// Pure, below step-picture (which imports it): no import of step-picture here.

import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { breakPoints } from 'lib/assembly-skeleton/geometry';
import { pieceKeyOf, resolveEdge, STACKED_TWIN_OFFSET_MM } from 'lib/assembly-skeleton/union';
import { apply, compose, IDENTITY, rigid, translate } from 'lib/assembly-skeleton/union/affine';
import {
  expandSidePart,
  normalizeParts,
  poseOf,
  poseRow,
  type SeamPlacement,
  type SidePart,
  type StoredPose,
} from 'lib/seams';

/** A posed piece as the layout reads it: on `host`, at `placement` (the surface encoding). */
export type PosePin = { host: string; placement: SeamPlacement; seamKey?: string };

export type PoseEditResolution = {
  edits: Map<string, PosePin>;
  /** Pieces whose stored pose must be removed. */
  drop: Set<string>;
};

export type SpanFit = { T: Affine; angleDeg: number; gapMm: number };

export type FitSides = { a: readonly SidePart[]; b: readonly SidePart[] };

export type FitSource = FitSides & { key: string };

type FitSideInput = { a: readonly (SidePart | string)[]; b: readonly (SidePart | string)[] };

const fitPartsOf = (side: readonly (SidePart | string)[]): SidePart[] =>
  side.map((part) => (typeof part === 'string' ? { target: part } : part));

const fitSourceKey = (sides: FitSides) =>
  (['a', 'b'] as const)
    .map((side) =>
      sides[side]
        .map(({ target, range }) => `${target}@${range ? `${range[0]}:${range[1]}` : '*'}`)
        .sort()
        .join('+'),
    )
    .join('~');

/** The complete live pick wins; an optional selected stored row supplies its ranged parts. */
export function fitSourceOf(
  current: FitSideInput | null | undefined,
  stored?: FitSides | null,
): FitSource | null {
  const live = current ? { a: fitPartsOf(current.a), b: fitPartsOf(current.b) } : { a: [], b: [] };
  const sides = live.a.length && live.b.length ? live : stored;
  if (!sides?.a.length || !sides.b.length) return null;
  return { a: [...sides.a], b: [...sides.b], key: fitSourceKey(sides) };
}

const pointAlong = (points: readonly Pt2[], share: number): Pt2 => {
  if (points.length < 2) return points[0] ?? [0, 0];
  const lengths = [0];
  for (let index = 1; index < points.length; index++)
    lengths.push(
      lengths[index - 1] +
        Math.hypot(
          points[index][0] - points[index - 1][0],
          points[index][1] - points[index - 1][1],
        ),
    );
  const target = Math.max(0, Math.min(1, share)) * lengths[lengths.length - 1];
  let index = 1;
  while (index < lengths.length - 1 && lengths[index] < target) index++;
  const length = lengths[index] - lengths[index - 1];
  const at = length ? (target - lengths[index - 1]) / length : 0;
  return [
    points[index - 1][0] + at * (points[index][0] - points[index - 1][0]),
    points[index - 1][1] + at * (points[index][1] - points[index - 1][1]),
  ];
};

/** Rigid, never mirrored, span-end fit. Reversed lays the first span's start on the second's end. */
export function fitSpan(
  from: readonly Pt2[],
  onto: readonly Pt2[],
  opts: { reversed: boolean },
): SpanFit {
  if (from.length < 2 || onto.length < 2) return { T: IDENTITY, angleDeg: 0, gapMm: Infinity };
  const targetStart = opts.reversed ? onto[onto.length - 1] : onto[0];
  const targetEnd = opts.reversed ? onto[0] : onto[onto.length - 1];
  const T = rigid(targetStart, targetEnd, from[0], from[from.length - 1], false);
  const samples = 32;
  let gap = 0;
  for (let index = 0; index <= samples; index++) {
    const share = index / samples;
    const moved = apply(T, pointAlong(from, share));
    const target = pointAlong(onto, opts.reversed ? 1 - share : share);
    gap += Math.hypot(moved[0] - target[0], moved[1] - target[1]);
  }
  const angleDeg = (Math.atan2(T[1], T[0]) * 180) / Math.PI;
  return { T, angleDeg, gapMm: gap / (samples + 1) };
}

const rangedPoints = (
  points: readonly Pt2[],
  range: readonly [number, number] | undefined,
  targetLength: number,
): Pt2[] => {
  if (!range || points.length < 2 || !(targetLength > 0)) return [...points];
  const lengths = [0];
  for (let index = 1; index < points.length; index++)
    lengths.push(
      lengths[index - 1] +
        Math.hypot(
          points[index][0] - points[index - 1][0],
          points[index][1] - points[index - 1][1],
        ),
    );
  const total = lengths[lengths.length - 1];
  const start = (Math.max(0, Math.min(targetLength, range[0])) / targetLength) * total;
  const end = (Math.max(start, Math.min(targetLength, range[1])) / targetLength) * total;
  const out: Pt2[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = lengths[index - 1];
    const to = lengths[index];
    const length = to - from;
    if (!(length > 0) || to < start || from > end) continue;
    const at = (distance: number): Pt2 => {
      const share = Math.max(0, Math.min(1, (distance - from) / length));
      return [
        points[index - 1][0] + share * (points[index][0] - points[index - 1][0]),
        points[index - 1][1] + share * (points[index][1] - points[index - 1][1]),
      ];
    };
    if (!out.length) out.push(at(Math.max(start, from)));
    out.push(at(Math.min(end, to)));
    if (to >= end) break;
  }
  return out.length >= 2 ? out : [...points];
};

const stackedOffsets = (stacked: readonly (readonly string[])[]) => {
  const out = new Map<string, Pt2>();
  stacked.forEach((group) =>
    group.slice(1).forEach((piece, index) => {
      const offset = STACKED_TWIN_OFFSET_MM * (index + 1);
      out.set(piece, [offset, -offset]);
    }),
  );
  return out;
};

const partWorldPoints = (
  part: SidePart,
  transforms: ReadonlyMap<string, Affine>,
  geoms: ReadonlyMap<string, PieceGeom>,
  offsets: ReadonlyMap<string, Pt2>,
): Pt2[] => {
  const edge = resolveEdge(part.target, geoms);
  const T = edge ? transforms.get(edge.pieceKey) : undefined;
  if (!edge || !T) return [];
  const [ox, oy] = offsets.get(edge.pieceKey) ?? [0, 0];
  return rangedPoints(edge.pts, part.range, edge.len).map((point) => {
    const world = apply(T, point);
    return [world[0] + ox, world[1] + oy];
  });
};

/** Join already-laid outline parts by their nearest ends, without adding resampled candidates. */
const joinedWorldPoints = (
  parts: readonly SidePart[],
  transforms: ReadonlyMap<string, Affine>,
  geoms: ReadonlyMap<string, PieceGeom>,
  offsets: ReadonlyMap<string, Pt2>,
): Pt2[] => {
  const remaining = normalizeParts(parts, geoms)
    .flatMap((part) => expandSidePart(part, geoms))
    .map((part) => partWorldPoints(part, transforms, geoms, offsets))
    .filter((points) => points.length >= 2);
  const joined = remaining.shift() ?? [];
  while (remaining.length && joined.length) {
    const end = joined[joined.length - 1];
    let best = { index: 0, reverse: false, distance: Infinity };
    remaining.forEach((points, index) => {
      for (const reverse of [false, true]) {
        const next = reverse ? points[points.length - 1] : points[0];
        const distance = Math.hypot(next[0] - end[0], next[1] - end[1]);
        if (distance < best.distance) best = { index, reverse, distance };
      }
    });
    const next = remaining.splice(best.index, 1)[0];
    if (best.reverse) next.reverse();
    joined.push(...next.slice(best.distance <= 0.05 ? 1 : 0));
  }
  return joined;
};

export type SpanFitPlan = {
  piece: string;
  host: string;
  group: string[];
  D: Affine;
  fit: SpanFit;
  reversed: boolean;
  sourceKey: string;
};

/**
 * Plan one FIT press from the exact current world layout. Side A moves when both sides have one
 * part; otherwise the only one-part side moves. Both multi-part sides are deliberately disabled.
 */
export function fitPlan(
  source: FitSource,
  layout: PoseBlockLayout & { stacked?: readonly (readonly string[])[] },
  geoms: ReadonlyMap<string, PieceGeom>,
  alternate = false,
): SpanFitPlan | null {
  const movingSide = source.a.length === 1 ? source.a : source.b.length === 1 ? source.b : null;
  const fixedSide = movingSide === source.a ? source.b : movingSide === source.b ? source.a : null;
  if (!movingSide || !fixedSide?.length) return null;
  const piece = pieceKeyOf(movingSide[0].target);
  const host = pieceKeyOf(fixedSide[0].target);
  if (!piece || !host || piece === host) return null;
  const pickup = posePickup(piece, layout, geoms);
  if (!pickup.group.length || pickup.group.includes(host)) return null;
  const offsets = stackedOffsets(layout.stacked ?? []);
  const from = joinedWorldPoints(movingSide, layout.transforms, geoms, offsets);
  const onto = joinedWorldPoints(fixedSide, layout.transforms, geoms, offsets);
  if (from.length < 2 || onto.length < 2) return null;
  const choices = [false, true]
    .map((reversed) => ({ reversed, fit: fitSpan(from, onto, { reversed }) }))
    .sort((a, b) => Math.abs(a.fit.angleDeg) - Math.abs(b.fit.angleDeg));
  const choice = choices[alternate ? 1 : 0];
  const [ox, oy] = offsets.get(piece) ?? [0, 0];
  // FIT measures the drawn stacked offset. Conjugate it back into the stored piece transform.
  const D =
    ox || oy
      ? compose(translate(-ox, -oy), compose(choice.fit.T, translate(ox, oy)))
      : choice.fit.T;
  return {
    piece,
    host,
    group: pickup.group,
    D,
    fit: choice.fit,
    reversed: choice.reversed,
    sourceKey: source.key,
  };
}

/** Encode a span fit as the same placement a dropped pose writes. */
export function poseRowFromFit(args: {
  seamKey: string;
  piece: PieceGeom;
  host: PieceGeom;
  fit: SpanFit;
  pieceT?: Affine;
  hostT?: Affine;
  grainDeg?: ReadonlyMap<string, number>;
}): StoredPose {
  const pieceT = args.pieceT ?? IDENTITY;
  const hostT = args.hostT ?? IDENTITY;
  return poseRow({
    seamKey: args.seamKey,
    piece: args.piece,
    host: args.host,
    placement: poseAt(args.host, args.piece, hostT, compose(args.fit.T, pieceT)),
    grainDeg: args.grainDeg,
  });
}

/**
 * Record one pose edit without allowing a host cycle. The new edge wins: when its host already
 * reaches the moved piece, that host's older pose is removed (pending edit and stored row alike).
 */
export function resolvePoseEdit(
  storedHosts: ReadonlyMap<string, string>,
  current: { edits: ReadonlyMap<string, PosePin>; drop: ReadonlySet<string> },
  piece: string,
  edit: PosePin,
): PoseEditResolution {
  const edits = new Map(current.edits);
  const drop = new Set(current.drop);
  if (piece === edit.host) return { edits, drop };

  // Re-setting a piece is the latest edit, including after an earlier cycle dropped its pose.
  edits.delete(piece);
  edits.set(piece, edit);
  drop.delete(piece);

  const hostOf = (key: string) =>
    edits.get(key)?.host ?? (drop.has(key) ? undefined : storedHosts.get(key));
  const seen = new Set<string>();
  let cursor: string | undefined = edit.host;
  while (cursor && !seen.has(cursor) && cursor !== piece) {
    seen.add(cursor);
    cursor = hostOf(cursor);
  }
  if (cursor === piece) {
    edits.delete(edit.host);
    drop.add(edit.host);
  }
  return { edits, drop };
}

/** Recheck a complete pending save; map order is edit order, so the last move wins. */
export function resolvePoseEdits(
  storedHosts: ReadonlyMap<string, string>,
  edits: ReadonlyMap<string, PosePin>,
  drop: ReadonlySet<string> = new Set(),
): PoseEditResolution {
  let resolved: PoseEditResolution = { edits: new Map(edits), drop: new Set(drop) };
  for (const [piece, edit] of edits) resolved = resolvePoseEdit(storedHosts, resolved, piece, edit);
  return resolved;
}

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
 * What a focused picture keeps, with the host of every kept posed piece put back (and its host's in
 * turn): a pose is laid on its host, so a posed piece drawn without it would fall back to the
 * layout. `drawable`: the step's pieces — a host off the step stays out.
 */
export function withPoseHosts(
  keep: Iterable<string>,
  drawable: ReadonlySet<string>,
  pose: ReadonlyMap<string, PosePin> | undefined,
): Set<string> {
  const out = new Set(keep);
  if (!pose?.size) return out;
  const queue = [...out];
  while (queue.length) {
    const host = pose.get(queue.pop()!)?.host;
    if (!host || out.has(host) || !drawable.has(host)) continue;
    out.add(host);
    queue.push(host);
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

/** The result metadata needed to choose a rigid PLACE pickup. */
export type PoseBlockLayout = {
  blocks: readonly { pieces: readonly string[] }[];
  transforms: ReadonlyMap<string, Affine>;
  /** Piece-level [input, host] links from this step's laid result. */
  hung?: readonly (readonly [string, string])[];
};

/** The rigid pieces and fixed host captured when PLACE starts dragging. */
export type PosePickup = { group: string[]; host: string | null };

const blockIndexOf = (layout: Pick<PoseBlockLayout, 'blocks'>) => {
  const out = new Map<string, number>();
  layout.blocks.forEach((block, index) => {
    for (const piece of block.pieces) if (!out.has(piece)) out.set(piece, index);
  });
  return out;
};

/**
 * The grabbed input block plus input blocks hanging from it by this step. The fixed host's block is
 * always cut out, so replaying the row moves exactly the same rigid side of the join.
 */
export function poseBlockGroup(
  piece: string,
  host: string | null,
  layout: Pick<PoseBlockLayout, 'blocks' | 'hung'>,
): string[] {
  const input = blockIndexOf(layout);
  const own = input.get(piece);
  if (own == null) return [piece];
  const hostInput = host == null ? null : input.get(host);
  const links = (layout.hung ?? []).flatMap(([child, parent]) => {
    const from = input.get(child);
    const to = input.get(parent);
    return from == null || to == null || from === to ? [] : [[from, to] as const];
  });
  const included = new Set([own]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const [child, parent] of links) {
      if (!included.has(parent) || included.has(child) || child === hostInput) continue;
      included.add(child);
      changed = true;
    }
  }
  return layout.blocks.flatMap((block, index) => (included.has(index) ? block.pieces : []));
}

/**
 * Capture a PLACE drag. A seam-linked parent is the fixed host; otherwise the largest other input
 * by total cut area supplies its largest drawn piece. The group and host are stable until drop.
 */
export function posePickup(
  piece: string,
  layout: PoseBlockLayout,
  geoms: ReadonlyMap<string, PieceGeom>,
): PosePickup {
  const input = blockIndexOf(layout);
  const own = input.get(piece);
  if (own == null) return { group: [piece], host: null };
  let host: string | null = null;
  for (const [child, parent] of layout.hung ?? []) {
    if (input.get(child) !== own || input.get(parent) == null || input.get(parent) === own)
      continue;
    host = parent;
    break;
  }
  if (!host) {
    const areaOfPiece = (key: string) => Math.abs(geoms.get(key)?.areaMm2 ?? 0);
    const candidates = layout.blocks
      .map((block, index) => ({
        index,
        area: block.pieces.reduce((sum, key) => sum + areaOfPiece(key), 0),
      }))
      .filter(({ index }) => index !== own);
    const other = candidates.reduce<(typeof candidates)[number] | null>(
      (best, candidate) => (!best || candidate.area > best.area ? candidate : best),
      null,
    );
    const pieces = other?.index == null ? [] : layout.blocks[other.index].pieces;
    host =
      pieces.reduce<string | null>(
        (best, key) => (!best || areaOfPiece(key) > areaOfPiece(best) ? key : best),
        null,
      ) ?? null;
  }
  return { group: poseBlockGroup(piece, host, layout), host };
}

/** A dropped pose value ready to be wrapped in `poseRow`. */
export type DroppedPose = { piece: string; host: string; placement: SeamPlacement };

/**
 * Encode a drop against the host captured at pickup. No snap target or nearby piece participates,
 * so the row cannot be re-hosted while it is written.
 */
export function poseAfterDrop(
  piece: string,
  droppedT: Affine,
  pickup: Pick<PosePickup, 'host'>,
  layout: Pick<PoseBlockLayout, 'transforms'>,
  geoms: ReadonlyMap<string, PieceGeom>,
): DroppedPose | null {
  const host = pickup.host;
  const pieceGeom = geoms.get(piece);
  const hostGeom = host ? geoms.get(host) : undefined;
  const hostT = host ? layout.transforms.get(host) : undefined;
  if (!host || !pieceGeom || !hostGeom || !hostT || host === piece) return null;
  return { piece, host, placement: poseAt(hostGeom, pieceGeom, hostT, droppedT) };
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
  opts: {
    /** Additive override for result layouts: every member of the piece's rigid input moves. */
    groupOf?: (piece: string, host: string) => readonly string[];
  } = {},
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
    pins.map(
      ([k, p]) =>
        [
          k,
          (opts.groupOf?.(k, p.host) ?? poseGroup(k, p.host, links)).filter((m) => T.has(m)),
        ] as const,
    ),
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

/** A drop's snap: the shift that lays an allowed point of the dragged pieces on `host` at `at`. */
export type PoseSnap = { dx: number; dy: number; at: Pt2; host: string };

export type PoseSnapPoint = { piece: string; at: Pt2 };

export type PoseSnapCandidates = {
  spanEnds: readonly PoseSnapPoint[];
  notches: readonly PoseSnapPoint[];
  corners: readonly PoseSnapPoint[];
};

/** First candidate class with a hit wins; distance only decides within that class. */
export function snapPose(
  moving: PoseSnapCandidates,
  others: PoseSnapCandidates,
  reach: number,
): PoseSnap | null {
  if (!(reach > 0)) return null;
  for (const kind of ['spanEnds', 'notches', 'corners'] as const) {
    let best: (PoseSnap & { distance: number }) | null = null;
    for (const from of moving[kind])
      for (const onto of others[kind]) {
        const distance = Math.hypot(onto.at[0] - from.at[0], onto.at[1] - from.at[1]);
        if (distance > reach || (best && distance >= best.distance)) continue;
        best = {
          distance,
          dx: onto.at[0] - from.at[0],
          dy: onto.at[1] - from.at[1],
          at: onto.at,
          host: onto.piece,
        };
      }
    if (best) return { dx: best.dx, dy: best.dy, at: best.at, host: best.host };
  }
  return null;
}

const pointAtMm = (points: readonly Pt2[], atMm: number, targetLength: number): Pt2 | null => {
  if (points.length < 2 || !(targetLength > 0)) return points[0] ?? null;
  const total = points.reduce(
    (sum, point, index) =>
      index
        ? sum + Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1])
        : sum,
    0,
  );
  const target = (Math.max(0, Math.min(targetLength, atMm)) / targetLength) * total;
  let walked = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (walked + length >= target) {
      const share = length ? (target - walked) / length : 0;
      return [a[0] + share * (b[0] - a[0]), a[1] + share * (b[1] - a[1])];
    }
    walked += length;
  }
  return points[points.length - 1];
};

const uniqueSnapPoints = (points: PoseSnapPoint[]) => {
  const seen = new Set<string>();
  return points.filter(({ piece, at }) => {
    const key = `${piece}:${at[0].toFixed(4)}:${at[1].toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const snapCandidatesOf = (
  pieces: readonly string[],
  transforms: ReadonlyMap<string, Affine>,
  geoms: ReadonlyMap<string, PieceGeom>,
  source?: FitSource | null,
): PoseSnapCandidates => {
  const present = new Set(pieces);
  const spanParts = source ? [...source.a, ...source.b] : [];
  const spanEnds: PoseSnapPoint[] = [];
  const notches: PoseSnapPoint[] = [];
  const corners: PoseSnapPoint[] = [];
  for (const piece of pieces) {
    const geom = geoms.get(piece);
    const T = transforms.get(piece);
    if (!geom || !T) continue;
    for (const part of spanParts) {
      const edge = resolveEdge(part.target, geoms);
      if (!edge || edge.pieceKey !== piece) continue;
      const points = rangedPoints(edge.pts, part.range, edge.len);
      if (points.length < 2) continue;
      spanEnds.push({ piece, at: apply(T, points[0]) });
      spanEnds.push({ piece, at: apply(T, points[points.length - 1]) });
    }
    for (const edge of geom.edges)
      for (const point of breakPoints(geom, edge)) {
        const at = pointAtMm(edge.pts, point.atMm, edge.lenMm);
        if (!at) continue;
        const candidate = { piece, at: apply(T, at) };
        if (point.kind === 'notch') notches.push(candidate);
        else corners.push(candidate);
      }
  }
  return {
    spanEnds: uniqueSnapPoints(spanEnds.filter(({ piece }) => present.has(piece))),
    notches: uniqueSnapPoints(notches),
    corners: uniqueSnapPoints(corners),
  };
};

/** The snap candidate for the current drag delta, from the same geometry the drop will store. */
export function snapPoseForDrag(
  group: readonly string[],
  D: Affine,
  transforms: ReadonlyMap<string, Affine>,
  geoms: ReadonlyMap<string, PieceGeom>,
  stacked: ReadonlySet<string>,
  reach: number,
  source?: FitSource | null,
): PoseSnap | null {
  const movingKeys = new Set(group);
  const movedTransforms = new Map(transforms);
  for (const piece of group) {
    const T = transforms.get(piece);
    if (T) movedTransforms.set(piece, compose(D, T));
  }
  const otherKeys = [...transforms.keys()].filter(
    (piece) =>
      !movingKeys.has(piece) && !stacked.has(piece) && (geoms.get(piece)?.rs.length ?? 0) >= 3,
  );
  const moving = snapCandidatesOf(group, movedTransforms, geoms, source);
  const others = snapCandidatesOf(otherKeys, transforms, geoms, source);
  return snapPose(moving, others, reach);
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

export type PoseRotation = { D: Affine; angleDeg: number };

/** Pointer rotation about a fixed block centre, rounded to the requested degree step. */
export function rotatePoseDrag(
  centre: Pt2,
  start: Pt2,
  current: Pt2,
  stepDeg: 1 | 15,
): PoseRotation {
  const startAngle = Math.atan2(start[1] - centre[1], start[0] - centre[0]);
  const currentAngle = Math.atan2(current[1] - centre[1], current[0] - centre[0]);
  const raw =
    (Math.atan2(Math.sin(currentAngle - startAngle), Math.cos(currentAngle - startAngle)) * 180) /
    Math.PI;
  const angleDeg = Math.round(raw / stepDeg) * stepDeg;
  if (angleDeg === 0) return { D: IDENTITY, angleDeg: 0 };
  const angle = (angleDeg * Math.PI) / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const R: Affine = [c, s, -s, c, 0, 0];
  return {
    D: compose(translate(centre[0], centre[1]), compose(R, translate(-centre[0], -centre[1]))),
    angleDeg,
  };
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

const quarterLinear = (quarter: number): Affine => {
  const normalized = ((quarter % 4) + 4) % 4;
  if (normalized === 1) return [0, 1, -1, 0, 0, 0];
  if (normalized === 2) return [-1, 0, 0, -1, 0, 0];
  if (normalized === 3) return [0, -1, 1, 0, 0, 0];
  return IDENTITY;
};

/** Delta that replaces `T`'s linear part while keeping the piece's cut-box centre fixed. */
const grainDelta = (piece: PieceGeom, T: Affine, linear: Affine): Affine => {
  const b = box(piece.rs);
  const centre: Pt2 = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  const fixed = apply(T, centre);
  const turned = apply(linear, centre);
  const next: Affine = [
    linear[0],
    linear[1],
    linear[2],
    linear[3],
    fixed[0] - turned[0],
    fixed[1] - turned[1],
  ];
  return compose(next, invert(T));
};

/**
 * ⟲ (`1`) or ⟳ (`-1`) to the next exact 90° grain-up multiple. Applying the returned delta to
 * `T` never carries an off-angle such as 37° forward by another 90°.
 */
export function turnToGrain(piece: PieceGeom, T: Affine, direction: -1 | 1): Affine {
  const flipped = T[0] * T[3] - T[1] * T[2] < 0;
  const angle = Math.atan2(flipped ? -T[1] : T[1], flipped ? -T[0] : T[0]) / (Math.PI / 2);
  // A saved angle a hair off a quarter (89.99°) counts as that quarter: ⟲ must visibly turn.
  const eps = 0.25 / 90;
  const quarter = direction === 1 ? Math.floor(angle + eps) + 1 : Math.ceil(angle - eps) - 1;
  const rotation = quarterLinear(quarter);
  const linear = flipped ? compose(rotation, [-1, 0, 0, 1, 0, 0]) : rotation;
  return grainDelta(piece, T, linear);
}

/** Delta to rotation 0 in the grain-up frame, with any mirror cleared. */
export function upright(piece: PieceGeom, T: Affine): Affine {
  return grainDelta(piece, T, IDENTITY);
}

/** The placement of `piece` laid at `T` on `host` laid at `hostT` (both picture frame). */
export function poseAt(host: PieceGeom, piece: PieceGeom, hostT: Affine, T: Affine): SeamPlacement {
  return placementOf(host, piece, compose(invert(hostT), T));
}

/** A twin's rs frame onto this piece's rs frame: their boxes laid on each other, mirrored in x. */
function twinMap(from: PieceGeom, to: PieceGeom, kind: 'mirror' | 'identical'): Affine {
  const f = box(from.rs);
  const t = box(to.rs);
  return kind === 'mirror'
    ? [-1, 0, 0, 1, t.x0 + f.x1, t.y0 - f.y0]
    : [1, 0, 0, 1, t.x0 - f.x0, t.y0 - f.y0];
}

/**
 * `mirror left` for a surface or pose placement: the twin part (the left placket) laid at `at` on
 * the twin host (the left sleeve) gives the placement that lays `part` on `host` (the right ones)
 * as its mirror image. `hostKind`/`partKind`: how each right piece relates to its left twin
 * (`PieceGeom.twinOf`); a part that is its own twin passes itself with 'identical'. Two mirror
 * twins keep the face (no flip added); a mirrored host with an identical part lays it face down.
 */
export function mirrorPlacement(
  twinHost: PieceGeom,
  twinPart: PieceGeom,
  at: SeamPlacement,
  host: PieceGeom,
  part: PieceGeom,
  hostKind: 'mirror' | 'identical',
  partKind: 'mirror' | 'identical',
): SeamPlacement {
  const R = placementT(twinHost, twinPart, at);
  const Sh = twinMap(twinHost, host, hostKind);
  const Sp = twinMap(twinPart, part, partKind);
  return placementOf(host, part, compose(Sh, compose(R, invert(Sp))));
}
