// A knife pleat closed in the doll's mesh, and the folds that cross it.
//
// A pleat fan (leg, centre, leg — three rows meeting at one apex) closes as lib/folds/pleat
// `mapPleatPoint` plans it: the two halves turn rigidly about the apex until the legs meet, the
// intake lies as a Z under the half its flip point names. A fold row that crosses the fan (a hem
// turned up through a pleat that runs out at the hem) is straight once the pleat is closed, not as
// cut: a hem of one depth along a hem edge that the pleat bends. As cut such a fold is bent where it
// crosses the pleat lines, so the mesh takes it as one straight line per region, each the closed
// line carried back through that region's own move.
//
// Millimetres in the piece's `rs` frame throughout. Pure geometry: the mesh and the fold that use
// it live in doll.ts (foldCreases, foldPanel).

import type { Pt2 } from 'lib/assembly-skeleton/types';
import {
  findPleatFans,
  mapPleatPoint,
  pleatSideOf,
  rotateAround,
  type PleatFanGeometry,
  type PleatLineLike,
} from 'lib/folds/pleat';

/** A fold row as the planner reads it: its index among the piece's folds, the line as cut. */
export type PlanRow = { k: number; kind: string; a: Pt2; b: Pt2; flipAt: Pt2 };

type FanRow = PleatLineLike & { k: number; kind: string; flipAt: Pt2 };

/** Where a point as cut lies around a fan: a half (open or hidden) or the intake on either side. */
export type PleatRegion = 'open' | 'openIntake' | 'hiddenIntake' | 'hidden';

export type MeshPleat = {
  fan: PleatFanGeometry<FanRow>;
  /** The side of the centre ray the intake lies on (lib/folds/pleat sign). */
  hidden: 1 | -1;
  /** Fold indices: the centre row, the leg on the hidden side, the other leg. */
  centre: number;
  hiddenLeg: number;
  openLeg: number;
  regionOf: (q: Pt2) => PleatRegion;
  /** A point as cut → its place with the pleat closed; `probe` names the region (default: q). */
  map: (q: Pt2, probe?: Pt2) => Pt2;
  /** A point well inside each half, as cut: a probe that carries a line as part of that half. */
  probeOpen: Pt2;
  probeHidden: Pt2;
};

/** A fold row across a closed pleat: one line per region as cut, all one line once closed. */
export type BentFold = {
  k: number;
  /** Index into `PleatPlan.pleats`. */
  pleat: number;
  /** The row's ends on the contour as cut: the one in the open half, the one in the hidden half. */
  endOpen: Pt2;
  endHidden: Pt2;
  /** The row with the pleat closed: through the closed places of its two ends. */
  closed: [Pt2, Pt2];
  /** As cut, per region: each is `closed` carried back through that region's move. */
  open: [Pt2, Pt2];
  intake: [Pt2, Pt2];
  hidden: [Pt2, Pt2];
  /** Where `open` meets the centre row and `hidden` meets the hidden leg, as cut. */
  atCentre: Pt2;
  atLeg: Pt2;
  /** The mesh's lines (each centred on its crossing, so the contour ends found are the right ones). */
  meshOpen: [Pt2, Pt2];
  meshHidden: [Pt2, Pt2];
};

export type PleatPlan = {
  pleats: MeshPleat[];
  bent: Map<number, BentFold>;
  /** Fold indices of the rows of the pleats closed in the mesh. */
  rows: Set<number>;
  /** Fans left flat, in words (an even pleat, a fold across it that cannot be read). */
  words: string[];
};

const EPS = 1e-9;
const sub = (a: Pt2, b: Pt2): Pt2 => [a[0] - b[0], a[1] - b[1]];
const crossOf = (a: Pt2, b: Pt2) => a[0] * b[1] - a[1] * b[0];
const dotOf = (a: Pt2, b: Pt2) => a[0] * b[0] + a[1] * b[1];
const signedAngle = (from: Pt2, to: Pt2) => Math.atan2(crossOf(from, to), dotOf(from, to));

/** Where the lines a–b and c–d meet (infinite lines), or null when parallel. */
export function meetOf(a: Pt2, b: Pt2, c: Pt2, d: Pt2): Pt2 | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = crossOf(r, s);
  if (Math.abs(den) <= EPS * Math.max(1, Math.hypot(...r) * Math.hypot(...s))) return null;
  const t = crossOf(sub(c, a), s) / den;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

/** `p` mirrored over the line through `o` along the unit direction `d`. */
const mirror = (p: Pt2, o: Pt2, d: Pt2): Pt2 => {
  const v = sub(p, o);
  const t = dotOf(v, d);
  return [o[0] + 2 * t * d[0] - v[0], o[1] + 2 * t * d[1] - v[1]];
};

/** The side of the line a–b a point is on: +1, −1 (0 on it). */
export const sideOfLine = (q: Pt2, [a, b]: readonly [Pt2, Pt2]) =>
  Math.sign((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]));

/**
 * Plan the knife pleats of one piece and the fold rows that cross them. `endsOf` = where a line,
 * extended, leaves the piece on either side of its middle (null when it does not cross it). Even
 * pleats stay flat (their intake folds in two on a line no row draws); so does a fan a fold row
 * crosses in a way the plan cannot read (an end in the intake, or no crossing on the centre row).
 */
export function planPleats(
  rows: readonly PlanRow[],
  endsOf: (a: Pt2, b: Pt2) => [Pt2, Pt2] | null,
  inPiece: (q: Pt2) => boolean,
): PleatPlan {
  const plan: PleatPlan = { pleats: [], bent: new Map(), rows: new Set(), words: [] };
  const pleatRows = rows.filter((r) => r.kind !== 'inward' && r.kind !== 'outward');
  if (pleatRows.length < 3) return plan;
  const fans = findPleatFans(
    pleatRows.map((r): FanRow => ({ line: [r.a, r.b], k: r.k, kind: r.kind, flipAt: r.flipAt })),
  );
  const turns = rows.filter((r) => r.kind === 'inward' || r.kind === 'outward');
  for (const fan of fans) {
    if (plan.pleats.length) {
      plan.words.push(
        `pleat at rows ${fan.lines.map((l) => l.k + 1).join(', ')}: one pleat per piece closes in the doll, this one stays flat`,
      );
      continue;
    }
    if (fan.centre.kind === 'pleat') {
      plan.words.push(
        `pleat at rows ${fan.lines.map((l) => l.k + 1).join(', ')}: an even pleat stays flat in the doll`,
      );
      continue;
    }
    const hidden = pleatSideOf(fan, fan.centre.flipAt);
    const apex = fan.apex;
    const centreRay = sub(fan.far.get(fan.centre)!, apex);
    const centreLen = Math.hypot(...centreRay);
    const gH = hidden > 0 ? fan.positiveGapRad : fan.negativeGapRad;
    const gO = hidden > 0 ? fan.negativeGapRad : fan.positiveGapRad;
    const hiddenLeg = hidden > 0 ? fan.positive : fan.negative;
    const openLeg = hidden > 0 ? fan.negative : fan.positive;
    const regionOf = (q: Pt2): PleatRegion => {
      const v = sub(q, apex);
      if (Math.hypot(...v) <= 1e-6) return 'openIntake';
      const t = signedAngle(centreRay, v) * hidden;
      if (t >= gH - EPS) return 'hidden';
      if (t > EPS) return 'hiddenIntake';
      if (t > -gO + EPS) return 'openIntake';
      return 'open';
    };
    // Probes: half way up the centre row, turned well into each half.
    const mid: Pt2 = [apex[0] + centreRay[0] / 2, apex[1] + centreRay[1] / 2];
    const probeHidden = rotateAround(mid, apex, hidden * (gH + 0.35));
    const probeOpen = rotateAround(mid, apex, -hidden * (gO + 0.35));
    const map = (q: Pt2, probe: Pt2 = q) => mapPleatPoint(q, fan, probe, hidden);
    // The open half turns by this about the apex, the hidden half by that (lib/folds/pleat).
    const turnOpen = hidden > 0 ? fan.negativeGapRad : -fan.positiveGapRad;
    const turnHidden = hidden > 0 ? -fan.positiveGapRad : fan.negativeGapRad;
    const intakeDir: Pt2 = (() => {
      const d = rotateAround(
        [apex[0] + centreRay[0], apex[1] + centreRay[1]],
        apex,
        (hidden * gH) / 2,
      );
      const v = sub(d, apex);
      const l = Math.hypot(...v) || 1;
      return [v[0] / l, v[1] / l];
    })();
    const index = plan.pleats.length;
    const bent: BentFold[] = [];
    let refused = '';
    for (const r of turns) {
      const ends = endsOf(r.a, r.b);
      if (!ends) continue;
      // Does the row run through the fan at all (an end or a point of it off its own half)?
      const regions = new Set<PleatRegion>();
      for (let j = 0; j <= 64; j++) {
        const q: Pt2 = [
          ends[0][0] + ((ends[1][0] - ends[0][0]) * j) / 64,
          ends[0][1] + ((ends[1][1] - ends[0][1]) * j) / 64,
        ];
        // Only where the fan is: between the apex and the far ends of its rows.
        const along = dotOf(sub(q, apex), centreRay) / (centreLen * centreLen);
        if (along < 0 || along > 1) continue;
        regions.add(regionOf(q));
      }
      if (regions.size <= 1) continue;
      const r0 = regionOf(ends[0]);
      const r1 = regionOf(ends[1]);
      const pair =
        r0 === 'open' && r1 === 'hidden'
          ? ends
          : r0 === 'hidden' && r1 === 'open'
            ? [ends[1], ends[0]]
            : null;
      if (!pair) {
        refused = `fold row ${r.k + 1} crosses the pleat with an end in its intake`;
        break;
      }
      const [endOpen, endHidden] = pair as [Pt2, Pt2];
      const closed: [Pt2, Pt2] = [map(endOpen), map(endHidden)];
      const open: [Pt2, Pt2] = [
        rotateAround(closed[0], apex, -turnOpen),
        rotateAround(closed[1], apex, -turnOpen),
      ];
      const hiddenLine: [Pt2, Pt2] = [
        rotateAround(closed[0], apex, -turnHidden),
        rotateAround(closed[1], apex, -turnHidden),
      ];
      const intake: [Pt2, Pt2] = [
        mirror(closed[0], apex, intakeDir),
        mirror(closed[1], apex, intakeDir),
      ];
      const far = fan.far.get(fan.centre)!;
      const atCentre = meetOf(open[0], open[1], apex, far);
      const legFar = fan.far.get(hiddenLeg)!;
      const atLeg = meetOf(hiddenLine[0], hiddenLine[1], apex, legFar);
      const onRay = (p: Pt2 | null, end: Pt2) => {
        if (!p) return false;
        const ray = sub(end, apex);
        const t = dotOf(sub(p, apex), ray) / dotOf(ray, ray);
        return t > 0.005 && t < 0.995 && inPiece(p);
      };
      if (!onRay(atCentre, far) || !onRay(atLeg, legFar)) {
        refused = `fold row ${r.k + 1} does not cross the pleat inside the piece`;
        break;
      }
      const c = atCentre!;
      const l = atLeg!;
      bent.push({
        k: r.k,
        pleat: index,
        endOpen,
        endHidden,
        closed,
        open,
        intake,
        hidden: hiddenLine,
        atCentre: c,
        atLeg: l,
        meshOpen: [endOpen, [2 * c[0] - endOpen[0], 2 * c[1] - endOpen[1]]],
        meshHidden: [endHidden, [2 * l[0] - endHidden[0], 2 * l[1] - endHidden[1]]],
      });
    }
    if (refused) {
      plan.words.push(
        `pleat at rows ${fan.lines.map((x) => x.k + 1).join(', ')} stays flat: ${refused}`,
      );
      continue;
    }
    plan.pleats.push({
      fan,
      hidden,
      centre: fan.centre.k,
      hiddenLeg: hiddenLeg.k,
      openLeg: openLeg.k,
      regionOf,
      map,
      probeOpen,
      probeHidden,
    });
    for (const x of fan.lines) plan.rows.add(x.k);
    for (const b of bent) plan.bent.set(b.k, b);
  }
  return plan;
}
