// The step's zone narrows which pieces it sews: a FRONT step sets a placket along the front, not
// on a pocket piece. Pairs of roles the zone expects get a small bonus, pairs it rules out a small
// penalty; zones that say nothing (outer, other, lining, unknown) stay silent.

import { rolesOf } from './names';
import type { SignalFn, SignalOp, SignalSide } from './types';

const ZONE_PREFIX = 'TECH_CARD_GARMENT_ZONE_';

/** `TECH_CARD_GARMENT_ZONE_FRONT` and `front` read alike. */
export function zoneOf(zone: string | undefined): string {
  return (zone ?? '').trim().toUpperCase().replace(ZONE_PREFIX, '').toLowerCase();
}

type Pair = readonly [string, string];
type ZoneRule = { fits: readonly Pair[]; not: readonly Pair[] };

const BODY = ['front', 'back', 'side', 'yoke'] as const;
const NECK = ['collar', 'stand', 'rib', 'hood'] as const;
const each = (xs: readonly string[], ys: readonly string[]): Pair[] =>
  xs.flatMap((x) => ys.map((y) => [x, y] as const));

const RULES: Readonly<Record<string, ZoneRule>> = {
  front: {
    fits: [...each(['placket', 'facing', 'pocket', 'yoke'], ['front']), ['front', 'front']],
    not: [
      ['placket', 'pocket'],
      ['placket', 'placket'],
    ],
  },
  back: { fits: [...each(['back', 'yoke', 'pocket'], ['back'])], not: [] },
  sleeve: {
    fits: [...each(['placket', 'cuff', 'sleeve', 'facing'], ['sleeve'])],
    not: [['placket', 'placket']],
  },
  collar: { fits: [...each(['collar', 'stand'], ['collar', 'stand'])], not: [] },
  neckline: { fits: each(NECK, [...BODY, 'facing']), not: [] },
  shoulder: { fits: [['front', 'back'], ...each(['yoke'], ['front', 'back'])], not: [] },
  armhole: { fits: each(['sleeve'], BODY), not: [] },
  pocket: { fits: each(['pocket'], [...BODY, 'pocket', 'sleeve']), not: [] },
  waist: { fits: each(['waistband'], [...BODY, 'skirt']), not: [] },
  hem: { fits: each(['hemband', 'facing'], [...BODY, 'skirt', 'sleeve']), not: [] },
};

const FIT = -0.04;
const NOT = 0.04;
/** A placket set along a front uses its long edge: a short end on the front is not that seam. */
const LONG_SHARE = 0.3;

const has = (pairs: readonly Pair[], x: string, y: string) =>
  pairs.some(([p, q]) => (p === x && q === y) || (p === y && q === x));

export const zoneSignal: SignalFn = (a, b, { op, geoms }) => {
  const rule = RULES[zoneOf(op?.zone)];
  if (!rule) return null;
  const ra = rolesOf(a.pieces, geoms);
  const rb = rolesOf(b.pieces, geoms);
  const known = (rs: (string | null)[]): rs is string[] => rs.length > 0 && rs.every(Boolean);
  if (!known(ra) || !known(rb)) return null;
  const zone = zoneOf(op?.zone);
  for (const x of ra)
    for (const y of rb)
      if (has(rule.not, x, y)) return { term: 'zone', delta: NOT, reason: `${zone}: ${x}↔${y}` };
  const fits = ra.every((x) => rb.every((y) => has(rule.fits, x, y)));
  if (!fits) return null;
  if (!longEnough(a, ra, geoms) || !longEnough(b, rb, geoms)) return null;
  return { term: 'zone', delta: FIT, reason: `${zone}: ${ra[0]}↔${rb[0]}` };
};

/**
 * Whether the step's zone allows this pair of sides: true / false when the zone names its parts,
 * null when it says nothing (outer, other, lining, unknown, a piece of unknown role).
 */
export function zoneAllows(
  a: SignalSide,
  b: SignalSide,
  op: SignalOp | undefined,
  geoms: Parameters<SignalFn>[2]['geoms'],
): boolean | null {
  const rule = RULES[zoneOf(op?.zone)];
  if (!rule) return null;
  const ra = rolesOf(a.pieces, geoms);
  const rb = rolesOf(b.pieces, geoms);
  if (!ra.length || !rb.length || !ra.every(Boolean) || !rb.every(Boolean)) return null;
  return ra.every((x) => rb.every((y) => has(rule.fits, x as string, y as string)));
}

/** A placket's side counts for the zone only along its long edge. */
function longEnough(
  side: SignalSide,
  roles: readonly string[],
  geoms: Parameters<SignalFn>[2]['geoms'],
): boolean {
  if (!roles.includes('placket') || side.pieces.length !== 1) return true;
  const g = geoms.get(side.pieces[0]);
  return !g || side.lenMm >= LONG_SHARE * g.perimMm;
}
