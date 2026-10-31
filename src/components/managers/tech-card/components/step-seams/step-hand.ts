import type { Affine, EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { apply, compose, rigid } from 'lib/assembly-skeleton/union/affine';
import type { EdgeAnchor, SeamPlacement, StoredPose, StoredSeam } from 'lib/seams';
import { runsOfSide } from '../assembly-seams/seam-actions';
import { posePinsOf, type PosePin } from './step-pose';
import { parseInner, pieceOfTarget, type TargetId } from './step-seams-model';

/** A piece placed by hand along one of its stored seam runs. */
export type HandPlace = {
  /** The part lies on the partner's material side; false opens it across the seam. */
  inside: boolean;
  /** Quarter-turns around the attached seam, in degrees. */
  rotDeg: number;
  /** The material is face down. */
  flip: boolean;
  /** Offset from the centred fit along the partner's current run. */
  slideMm: number;
};

export const DEFAULT_HAND: HandPlace = { inside: false, rotDeg: 0, flip: false, slideMm: 0 };

/**
 * A hand placement as the layout reads it: on the seam to `partner` (a piece on the seam's other
 * side) when it names one — a piece sewn twice keeps its placement on the seam it was set on.
 */
export type HandOn = HandPlace & { partner?: string };

export const isHandSeamKind = (kind: StoredSeam['kind']) =>
  kind === 'edge' || kind === 'partial' || kind === 'composite';

const finite = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

export const normalizeHandRotation = (deg: number) => ((finite(deg) % 360) + 360) % 360;

/** Encode the non-surface interpretation documented on `SeamPlacement`. */
export function encodeHandPlace(hand: HandPlace): SeamPlacement {
  return {
    xMm: round(finite(hand.slideMm), 1),
    yMm: hand.inside ? 1 : 0,
    rotDeg: normalizeHandRotation(hand.rotDeg),
    flip: hand.flip,
  };
}

/** Decode a placement from an edge, partial, or composite anchor. */
export function decodeHandPlace(placement: SeamPlacement | undefined): HandPlace | undefined {
  if (!placement) return undefined;
  return {
    inside: placement.yMm >= 0.5,
    rotDeg: normalizeHandRotation(placement.rotDeg),
    flip: placement.flip,
    slideMm: finite(placement.xMm),
  };
}

/**
 * Every moved piece encoded on edge-like seam anchors, with the partner across the seam it was set
 * on, ready for `stepLayout`'s `hand` option.
 */
export function handsFromSeams(rows: readonly StoredSeam[]): Map<string, HandOn> {
  const hand = new Map<string, HandOn>();
  for (const row of rows) {
    if (!isHandSeamKind(row.kind)) continue;
    for (const [own, other] of [
      [row.sideA, row.sideB],
      [row.sideB, row.sideA],
    ] as const)
      for (const anchor of own) {
        const decoded = decodeHandPlace(anchor.placement);
        if (!decoded) continue;
        const partner = other.find((a) => a.piece !== anchor.piece)?.piece;
        hand.set(anchor.piece, partner ? { ...decoded, partner } : decoded);
      }
  }
  return hand;
}

/**
 * The hand placements a step's views lay: its own and every earlier step's; twins read the card's.
 * `pose` (P8): the pieces placed by hand at a free spot, pinned last (absent: none).
 */
export type StepHands = {
  hand: ReadonlyMap<string, HandOn>;
  twinHand: ReadonlyMap<string, HandOn>;
  pose?: ReadonlyMap<string, PosePin>;
};

/**
 * The placements stored on this step's seams and the earlier ones' (a later step inherits them),
 * and the whole card's for twins (the right bag mirrors the left one placed a step later); the
 * poses this step's and the earlier steps' `poseKeys` name, the same way.
 */
export function stepHandsOf(
  ops: readonly { seamKeys?: readonly string[]; poseKeys?: readonly string[] }[],
  index: number,
  byKey: ReadonlyMap<string, StoredSeam>,
  poses?: ReadonlyMap<string, StoredPose>,
): StepHands {
  const rows = (steps: readonly { seamKeys?: readonly string[] }[]) =>
    steps.flatMap((step) => (step.seamKeys ?? []).flatMap((key) => byKey.get(key) ?? []));
  const pose = posePinsOf(ops.slice(0, index + 1), poses);
  return {
    hand: handsFromSeams(rows(ops.slice(0, index + 1))),
    twinHand: handsFromSeams(rows(ops)),
    ...(pose.size ? { pose } : {}),
  };
}

/** Put or clear a hand placement on every anchor of the moved piece, leaving its partner alone. */
export function withHandPlace(
  row: StoredSeam,
  piece: string,
  hand: HandPlace | undefined,
): StoredSeam {
  const place = (anchor: EdgeAnchor): EdgeAnchor => {
    if (anchor.piece !== piece) return anchor;
    const plain = { ...anchor };
    delete plain.placement;
    return hand ? { ...plain, placement: encodeHandPlace(hand) } : plain;
  };
  return { ...row, sideA: row.sideA.map(place), sideB: row.sideB.map(place) };
}

const runLength = (run: readonly Pt2[]) => {
  let length = 0;
  for (let i = 1; i < run.length; i++)
    length += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
  return length;
};

const atLength = (run: readonly Pt2[], distance: number): Pt2 => {
  if (run.length === 0) return [0, 0];
  if (run.length === 1) return run[0];
  let left = Math.max(0, Math.min(runLength(run), distance));
  for (let i = 1; i < run.length; i++) {
    const a = run[i - 1];
    const b = run[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= length || i === run.length - 1) {
      const share = length > 0 ? Math.min(1, left / length) : 0;
      return [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share];
    }
    left -= length;
  }
  return run[run.length - 1];
};

/** The legal centred offset while the shorter run remains wholly on the longer partner run. */
export function clampHandSlide(
  seamRunPart: readonly Pt2[],
  seamRunPartner: readonly Pt2[],
  slideMm: number,
): number {
  const room = Math.max(0, runLength(seamRunPartner) - runLength(seamRunPart));
  const limit = room / 2;
  return Math.max(-limit, Math.min(limit, finite(slideMm)));
}

const centreOf = (piece: PieceGeom): Pt2 => {
  const points = piece.rs;
  if (points.length === 0) return [0, 0];
  const total = points.reduce<Pt2>((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
};

const sideOf = (a: Pt2, b: Pt2, point: Pt2) =>
  (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);

/**
 * Orthographic projection of a turn around the seam axis. The seam is fixed point-for-point; the
 * part's distance normal to it is multiplied by cos(turn), as a piece folded in 3D reads on paper.
 */
const turnAboutSeam = (a: Pt2, b: Pt2, rotDeg: number): Affine => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const tx = (b[0] - a[0]) / length;
  const ty = (b[1] - a[1]) / length;
  const nx = -ty;
  const ny = tx;
  const normalScale = Math.cos((normalizeHandRotation(rotDeg) * Math.PI) / 180);
  const aa = tx * tx + normalScale * nx * nx;
  const bb = tx * ty + normalScale * nx * ny;
  const dd = ty * ty + normalScale * ny * ny;
  return [aa, bb, bb, dd, a[0] - aa * a[0] - bb * a[1], a[1] - bb * a[0] - dd * a[1]];
};

/**
 * Place `part` in `partner`'s frame. The current runs, not stored x/y coordinates, define the
 * attachment. Slide is clamped to the partner run. A turn is a fold around the attached seam, so
 * every point of that seam stays fixed; flip preserves the seam too and changes the face.
 */
export function snapHand(
  part: PieceGeom,
  partner: PieceGeom,
  seamRunPart: readonly Pt2[],
  seamRunPartner: readonly Pt2[],
  hand: HandPlace,
): Affine {
  if (seamRunPart.length < 2 || seamRunPartner.length < 2) return [1, 0, 0, 1, 0, 0];

  const partLength = runLength(seamRunPart);
  const partnerLength = runLength(seamRunPartner);
  const span = Math.min(partLength, partnerLength);
  const slide = clampHandSlide(seamRunPart, seamRunPartner, hand.slideMm);
  const start = (partnerLength - span) / 2 + slide;
  const target0 = atLength(seamRunPartner, start);
  const target1 = atLength(seamRunPartner, start + span);
  const part0 = seamRunPart[0];
  const part1 = seamRunPart[seamRunPart.length - 1];
  const turn = turnAboutSeam(target0, target1, hand.rotDeg);
  const partnerSide = sideOf(target0, target1, centreOf(partner));
  const candidates = [false, true].map((reverse) => {
    const from0 = reverse ? part1 : part0;
    const from1 = reverse ? part0 : part1;
    const base = rigid(target0, target1, from0, from1, hand.flip);
    const placed = compose(turn, base);
    // At a 90° fold the projected part is edge-on. Its pre-fold side still records whether it was
    // folded inward or opened out, and makes the choice stable across that singular view.
    const partCentre = apply(placed, centreOf(part));
    const baseCentre = apply(base, centreOf(part));
    const projectedSide = sideOf(target0, target1, partCentre);
    const partSide =
      Math.abs(projectedSide) > 1e-7 ? projectedSide : sideOf(target0, target1, baseCentre);
    const sameSide = partnerSide === 0 || partSide === 0 || partnerSide * partSide > 0;
    const sideMiss = sameSide === hand.inside ? 0 : 1;
    const end = apply(placed, from1);
    const endpointError = Math.hypot(end[0] - target1[0], end[1] - target1[1]);
    return { placed, score: sideMiss * 1_000_000 + endpointError };
  });
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0].placed;
}

// ── where a hand placement snaps: the seam it lies on ──

/** The seam a piece's hand placement re-snaps on: its own longest run there, the partner's across. */
export type HandTarget = {
  piece: string;
  /** The piece of the other side's longest run. */
  partner: string;
  /** Every piece on the seam's other side. */
  across: string[];
  part: PieceGeom;
  partnerGeom: PieceGeom;
  partRun: readonly Pt2[];
  partnerRun: readonly Pt2[];
};

const edgeTargets = (ids: readonly TargetId[]): EdgeId[] =>
  ids.filter((id): id is EdgeId => !parseInner(id));

const bestRun = (
  ids: readonly TargetId[],
  geoms: ReadonlyMap<string, PieceGeom>,
  piece?: string,
) => {
  let best: ReturnType<typeof resolveEdge> = null;
  for (const id of runsOfSide(edgeTargets(ids), geoms)) {
    const run = resolveEdge(id, geoms);
    if (!run || (piece && run.pieceKey !== piece) || (best && best.len >= run.len)) continue;
    best = run;
  }
  return best;
};

/** `piece`'s target on a seam of two sides (null: not on it, or nothing to snap onto). */
export function targetOfSides(
  piece: string,
  sides: { a: readonly TargetId[]; b: readonly TargetId[] },
  geoms: ReadonlyMap<string, PieceGeom>,
): HandTarget | null {
  const ownSide = sides.a.some((id) => pieceOfTarget(id) === piece)
    ? sides.a
    : sides.b.some((id) => pieceOfTarget(id) === piece)
      ? sides.b
      : null;
  if (!ownSide) return null;
  const otherSide = ownSide === sides.a ? sides.b : sides.a;
  const partRun = bestRun(ownSide, geoms, piece);
  const partnerRun = bestRun(otherSide, geoms);
  if (!partRun || !partnerRun || partRun.pieceKey === partnerRun.pieceKey) return null;
  const part = geoms.get(partRun.pieceKey);
  const partnerGeom = geoms.get(partnerRun.pieceKey);
  if (!part || !partnerGeom) return null;
  return {
    piece: part.pieceKey,
    partner: partnerGeom.pieceKey,
    across: [...new Set(otherSide.map(pieceOfTarget))].filter((k) => k !== piece),
    part,
    partnerGeom,
    partRun: partRun.pts,
    partnerRun: partnerRun.pts,
  };
}

/** Every piece's targets on these seams (edge-like ones: a surface or a closure has none), in order. */
export function handTargetsOf(
  seams: readonly SeamCandidate[],
  geoms: ReadonlyMap<string, PieceGeom>,
): Map<string, HandTarget[]> {
  const out = new Map<string, HandTarget[]>();
  for (const seam of seams) {
    if (seam.kind === 'surface' || seam.kind === 'closure-not-seam') continue;
    const sides = { a: seam.aParts ?? [seam.a], b: seam.bParts ?? [seam.b] };
    for (const piece of new Set([...sides.a, ...sides.b].map(pieceOfTarget))) {
      const target = targetOfSides(piece, sides, geoms);
      if (!target) continue;
      const list = out.get(piece) ?? [];
      list.push(target);
      out.set(piece, list);
    }
  }
  return out;
}

/**
 * The seam a placement lies on: the last one to the partner it names, else the piece's last seam
 * (none when the named partner is not across any of them — it is not sewn here yet).
 */
export function pickHandTarget(
  targets: readonly HandTarget[] | undefined,
  hand?: HandOn,
): HandTarget | undefined {
  if (!targets?.length) return undefined;
  const want = hand?.partner;
  if (!want) return targets[targets.length - 1];
  for (let i = targets.length - 1; i >= 0; i--)
    if (targets[i].across.includes(want)) return targets[i];
  return undefined;
}

/**
 * A twin's placement read for a piece with none of its own: `twin` (the left bag) placed by hand on
 * the seam to `twinPartner` (the left back) lays this piece the same way on `target` when the seam's
 * other side holds a twin of that partner (the right back). Along a mirrored partner the slide runs
 * the other way: its run is digitised in the other direction.
 */
export function mirrorHand(
  hand: HandOn,
  target: HandTarget,
  geoms: ReadonlyMap<string, PieceGeom>,
): HandOn | undefined {
  const q = hand.partner;
  let kind: 'mirror' | 'identical' | undefined;
  for (const x of target.across) {
    const link = geoms.get(x)?.twinOf.find((t) => (q ? t.key === q : true));
    if (link) {
      kind = link.kind;
      break;
    }
  }
  if (!kind) return undefined;
  return {
    inside: hand.inside,
    rotDeg: hand.rotDeg,
    flip: hand.flip,
    slideMm: kind === 'mirror' ? -hand.slideMm : hand.slideMm,
    partner: target.partner,
  };
}

/** A hand placement as laid: what places the piece, on which seam, and whether a twin lent it. */
export type LaidHand = { place: HandOn; target: HandTarget; twin: boolean };

/**
 * The hand placements a step lays, piece by piece: a piece's own (on the seam it names), else its
 * twin's, mirrored — from `twinHand`, the card's placements anywhere (default: `hand`). `drawn`: a
 * target whose partner is not drawn lays nothing.
 */
export function laidHands(
  targets: ReadonlyMap<string, readonly HandTarget[]>,
  geoms: ReadonlyMap<string, PieceGeom>,
  hand: ReadonlyMap<string, HandOn>,
  twinHand: ReadonlyMap<string, HandOn> = hand,
  drawn: (piece: string) => boolean = () => true,
): Map<string, LaidHand> {
  const out = new Map<string, LaidHand>();
  for (const [piece, all] of targets) {
    if (!drawn(piece)) continue;
    const list = all.filter((t) => drawn(t.partner));
    const own = hand.get(piece);
    if (own) {
      const target = pickHandTarget(list, own);
      if (target) out.set(piece, { place: own, target, twin: false });
      continue;
    }
    // A twin's placement, on the last seam that matches it.
    const twins = geoms.get(piece)?.twinOf ?? [];
    let found: LaidHand | undefined;
    for (let i = list.length - 1; i >= 0 && !found; i--)
      for (const t of twins) {
        const theirs = twinHand.get(t.key) ?? hand.get(t.key);
        const place = theirs ? mirrorHand(theirs, list[i], geoms) : undefined;
        if (place) {
          found = { place, target: list[i], twin: true };
          break;
        }
      }
    if (found) out.set(piece, found);
  }
  return out;
}

/** Placements equal as stored (the partner they name aside). */
export const sameHand = (a: HandPlace | undefined, b: HandPlace | undefined) =>
  !a || !b
    ? a === b
    : a.inside === b.inside &&
      normalizeHandRotation(a.rotDeg) === normalizeHandRotation(b.rotDeg) &&
      a.flip === b.flip &&
      Math.abs(a.slideMm - b.slideMm) < 0.05;

/**
 * The twin's seam among `rows` (a step's own stored seams) that a placement of `piece` across
 * `partner` mirrors onto: a twin of the piece on one side, a twin of the partner on the other — with
 * the twin and the placement it takes (null: no such seam).
 */
export function twinRowOf(
  rows: readonly StoredSeam[],
  piece: string,
  partner: string,
  hand: HandPlace | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
): {
  row: StoredSeam;
  twin: string;
  place: HandPlace | undefined;
  current: HandPlace | undefined;
} | null {
  const twins = geoms.get(piece)?.twinOf ?? [];
  const partnerTwins = geoms.get(partner)?.twinOf ?? [];
  for (const row of rows) {
    if (!isHandSeamKind(row.kind)) continue;
    for (const [own, other] of [
      [row.sideA, row.sideB],
      [row.sideB, row.sideA],
    ] as const) {
      const twin = twins.find((t) => t.key !== piece && own.some((a) => a.piece === t.key));
      const link = partnerTwins.find(
        (t) => t.key !== partner && other.some((a) => a.piece === t.key),
      );
      if (!twin || !link) continue;
      const current = decodeHandPlace(own.find((a) => a.piece === twin.key)?.placement);
      const place = hand
        ? { ...hand, slideMm: link.kind === 'mirror' ? -hand.slideMm : hand.slideMm }
        : undefined;
      return { row, twin: twin.key, place: place && strip(place), current };
    }
  }
  return null;
}

const strip = ({ inside, rotDeg, flip, slideMm }: HandPlace): HandPlace => ({
  inside,
  rotDeg,
  flip,
  slideMm,
});
