import type { Pt2 } from 'lib/assembly-skeleton/types';

import { add, cross, mul, sub } from './geom';

export const PLEAT_APEX_TOLERANCE_MM = 5;
const MIN_GAP_RAD = (0.25 * Math.PI) / 180;
const MAX_GAP_RAD = (30 * Math.PI) / 180;
const SYMMETRY_FLOOR_RAD = (1.5 * Math.PI) / 180;
const EPS = 1e-9;

export type PleatLineLike = { line: [Pt2, Pt2] };

export type PleatFanGeometry<T extends PleatLineLike = PleatLineLike> = {
  /** Storage/display order: leg, centre, leg. */
  lines: [T, T, T];
  apex: Pt2;
  centre: T;
  /** The two legs by signed angle around the centre ray. */
  negative: T;
  positive: T;
  far: Map<T, Pt2>;
  negativeGapRad: number;
  positiveGapRad: number;
  symmetryErrorRad: number;
};

const dot = (a: Pt2, b: Pt2) => a[0] * b[0] + a[1] * b[1];
const len = (v: Pt2) => Math.hypot(v[0], v[1]);

const intersection = (left: [Pt2, Pt2], right: [Pt2, Pt2]): Pt2 | null => {
  const r = sub(left[1], left[0]);
  const s = sub(right[1], right[0]);
  const den = cross(r, s);
  if (Math.abs(den) <= EPS * Math.max(1, len(r) * len(s))) return null;
  const t = cross(sub(right[0], left[0]), s) / den;
  return add(left[0], mul(r, t));
};

const signedAngle = (from: Pt2, to: Pt2) => Math.atan2(cross(from, to), dot(from, to));

const endpointDistance = (line: [Pt2, Pt2], point: Pt2) =>
  Math.min(len(sub(line[0], point)), len(sub(line[1], point)));

const farEnd = (line: [Pt2, Pt2], apex: Pt2): Pt2 =>
  len(sub(line[0], apex)) >= len(sub(line[1], apex)) ? line[0] : line[1];

/** Three legs form one fan only when their intersections and apex ends agree in millimetres. */
export function pleatFanGeometry<T extends PleatLineLike>(
  input: readonly [T, T, T],
  toleranceMm = PLEAT_APEX_TOLERANCE_MM,
): PleatFanGeometry<T> | null {
  const hits = [
    intersection(input[0].line, input[1].line),
    intersection(input[0].line, input[2].line),
    intersection(input[1].line, input[2].line),
  ];
  if (hits.some((point) => !point)) return null;
  const apex: Pt2 = [
    hits.reduce((sum, point) => sum + point![0], 0) / hits.length,
    hits.reduce((sum, point) => sum + point![1], 0) / hits.length,
  ];
  if (hits.some((point) => len(sub(point!, apex)) > toleranceMm)) return null;
  if (input.some((item) => endpointDistance(item.line, apex) > toleranceMm)) return null;

  const far = new Map<T, Pt2>(input.map((item) => [item, farEnd(item.line, apex)]));
  let middle: { centre: T; negative: T; positive: T; neg: number; pos: number } | null = null;
  for (const centre of input) {
    const ray = sub(far.get(centre)!, apex);
    const other = input.filter((item) => item !== centre);
    const angles = other.map((item) => ({
      item,
      angle: signedAngle(ray, sub(far.get(item)!, apex)),
    }));
    const negative = angles.find(({ angle }) => angle < -MIN_GAP_RAD);
    const positive = angles.find(({ angle }) => angle > MIN_GAP_RAD);
    if (!negative || !positive) continue;
    const neg = -negative.angle;
    const pos = positive.angle;
    if (neg > MAX_GAP_RAD || pos > MAX_GAP_RAD) continue;
    const error = Math.abs(neg - pos);
    if (error > Math.max(SYMMETRY_FLOOR_RAD, 0.25 * Math.max(neg, pos))) continue;
    if (!middle || error < Math.abs(middle.neg - middle.pos))
      middle = { centre, negative: negative.item, positive: positive.item, neg, pos };
  }
  if (!middle) return null;

  const outer = input.filter((item) => item !== middle!.centre) as [T, T];
  return {
    lines: [outer[0], middle.centre, outer[1]],
    apex,
    centre: middle.centre,
    negative: middle.negative,
    positive: middle.positive,
    far,
    negativeGapRad: middle.neg,
    positiveGapRad: middle.pos,
    symmetryErrorRad: Math.abs(middle.neg - middle.pos),
  };
}

/** Every disjoint three-line fan, stable in the input's line order. */
export function findPleatFans<T extends PleatLineLike>(
  lines: readonly T[],
  toleranceMm = PLEAT_APEX_TOLERANCE_MM,
): PleatFanGeometry<T>[] {
  const candidates: Array<{ fan: PleatFanGeometry<T>; indices: [number, number, number] }> = [];
  for (let a = 0; a + 2 < lines.length; a++)
    for (let b = a + 1; b + 1 < lines.length; b++)
      for (let c = b + 1; c < lines.length; c++) {
        const fan = pleatFanGeometry([lines[a], lines[b], lines[c]], toleranceMm);
        if (fan) candidates.push({ fan, indices: [a, b, c] });
      }
  candidates.sort(
    (left, right) =>
      left.indices[0] - right.indices[0] ||
      left.fan.symmetryErrorRad - right.fan.symmetryErrorRad ||
      left.indices[1] - right.indices[1] ||
      left.indices[2] - right.indices[2],
  );
  const used = new Set<number>();
  const out: PleatFanGeometry<T>[] = [];
  for (const candidate of candidates) {
    if (candidate.indices.some((index) => used.has(index))) continue;
    candidate.indices.forEach((index) => used.add(index));
    out.push(candidate.fan);
  }
  return out;
}

export function rotateAround(point: Pt2, centre: Pt2, angle: number): Pt2 {
  const x = point[0] - centre[0];
  const y = point[1] - centre[1];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [centre[0] + x * c - y * s, centre[1] + x * s + y * c];
}

/**
 * Plan view of a closed pleat. The two face-up halves rotate rigidly until each leg reaches the
 * centre. Points in the hidden intake stay on their own side and occupy half its opening.
 */
export function mapPleatPoint<T extends PleatLineLike>(
  point: Pt2,
  fan: PleatFanGeometry<T>,
  probe: Pt2 = point,
): Pt2 {
  const centreRay = sub(fan.far.get(fan.centre)!, fan.apex);
  const probeRay = sub(probe, fan.apex);
  const pointRay = sub(point, fan.apex);
  if (len(pointRay) <= EPS) return [...fan.apex];
  const angle = signedAngle(centreRay, len(probeRay) > EPS ? probeRay : pointRay);
  if (angle <= -fan.negativeGapRad + EPS) return rotateAround(point, fan.apex, fan.negativeGapRad);
  if (angle >= fan.positiveGapRad - EPS) return rotateAround(point, fan.apex, -fan.positiveGapRad);
  const ownAngle = signedAngle(centreRay, pointRay);
  return rotateAround(point, fan.apex, -ownAngle / 2);
}
