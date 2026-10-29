import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply, compose, rigid } from 'lib/assembly-skeleton/union/affine';
import type { EdgeAnchor, SeamPlacement, StoredSeam } from 'lib/seams';

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

/** Every moved piece encoded on edge-like seam anchors, ready for `stepLayout`'s `hand` option. */
export function handsFromSeams(rows: readonly StoredSeam[]): Map<string, HandPlace> {
  const hand = new Map<string, HandPlace>();
  for (const row of rows) {
    if (!isHandSeamKind(row.kind)) continue;
    for (const anchor of [...row.sideA, ...row.sideB]) {
      const decoded = decodeHandPlace(anchor.placement);
      if (decoded) hand.set(anchor.piece, decoded);
    }
  }
  return hand;
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
