import type { common_DesignBenchSlot, common_DesignJoins } from 'api/proto-http/admin';

import { suggestsStraps, type FlatMode } from './flat-mode';

/**
 * ═══ ONE GENERATE, NO SETTINGS (flat-consistency 82-INPUT-REDESIGN, owner request 8, 06.10) ══════
 *
 * The run row is `GENERATE · target ▾ · (from my flat) · what the model gets ▸`. Everything that
 * used to be a choice is a constant or a rule here:
 *   · the views run is always the four sides on ONE picture (`VIEWS_PARAMS`);
 *   · the target is `views` (or `views again`) first, then each detail not generated yet — the
 *     details stay disabled until FRONT and BACK hold a picture;
 *   · the route is chosen in code (`routeOf`): detail → photos n1; «from my flat» on → hand_flat;
 *     a strap or an opening that runs on → straps; else photos. The server owns the count.
 */

/** The target value of the select: `views`, or `d:<slot id>` for a detail. */
export type FlatTarget = string;

export const VIEWS_TARGET: FlatTarget = 'views';

export const detailTarget = (slotId: number): FlatTarget => `d:${slotId}`;

/** The detail slot id of a target; 0 = the views. */
export function targetSlotId(target: FlatTarget): number {
  if (!target.startsWith('d:')) return 0;
  const id = Number(target.slice(2));
  return Number.isInteger(id) && id > 0 ? id : 0;
}

export type TargetItem = {
  value: FlatTarget;
  label: string;
  disabled: boolean;
  title: string;
};

const filled = (slot: common_DesignBenchSlot | null | undefined) => (slot?.pictureId ?? 0) > 0;

/**
 * THE ITEMS OF `target ▾`, IN ORDER. `views` / `views again` first and always enabled; then one item
 * per bench detail (bench order) that is empty, or filled but stale and not kept. A filled, fresh
 * detail leaves the list — it comes back when discarded (emptied) or when the views move past it.
 * Details are disabled until FRONT and BACK both hold a picture: a detail is drawn to agree with
 * the views, and there is nothing to agree with yet.
 */
export function flatTargets(input: {
  sides: readonly { view: string; slot: common_DesignBenchSlot | null }[];
  details: readonly common_DesignBenchSlot[];
  nameOf: (slot: common_DesignBenchSlot) => string;
  proposed: (slotId: number) => boolean;
  stale: (slot: common_DesignBenchSlot) => boolean;
}): TargetItem[] {
  const side = (v: string) => input.sides.find((s) => s.view === v)?.slot ?? null;
  const anySide = input.sides.some((s) => filled(s.slot));
  const viewsReady = filled(side('front')) && filled(side('back'));
  const out: TargetItem[] = [
    {
      value: VIEWS_TARGET,
      label: anySide ? 'views again' : 'views',
      disabled: false,
      title: anySide
        ? 'draw the four views again — a new picture, cut into the four slots'
        : 'draw front, back and both sides on one picture, cut into the four slots',
    },
  ];
  for (const d of input.details) {
    const id = d.id ?? 0;
    if (id <= 0) continue;
    const stale = filled(d) && input.stale(d);
    if (filled(d) && !stale) continue;
    const name = input.nameOf(d);
    const suffix = input.proposed(id) ? ' · proposed' : stale ? ' · stale' : '';
    out.push({
      value: detailTarget(id),
      label: `detail · ${name}${suffix}`,
      disabled: !viewsReady,
      title: viewsReady
        ? `draw the detail ${name}, agreeing with the front and back flats`
        : 'generate the views first',
    });
  }
  return out;
}

/**
 * The target the row stands on: the remembered one while it is still in the list and enabled, else
 * the first item (`views`).
 */
export function settleTarget(target: FlatTarget, items: readonly TargetItem[]): FlatTarget {
  const hit = items.find((i) => i.value === target);
  return hit && !hit.disabled ? target : items[0]?.value ?? VIEWS_TARGET;
}

export type FlatRoute = 'photos' | 'hand_flat' | 'straps' | 'detail';

export const ROUTE_WORD: Record<FlatRoute, string> = {
  photos: 'photos',
  hand_flat: 'from my flat',
  straps: 'straps & openings',
  detail: 'detail',
};

export const ROUTE_WHY: Record<FlatRoute, string> = {
  photos: 'drawn from the reference photos',
  hand_flat: 'your flats carry the construction; the list is not read',
  straps: 'a strap or an opening runs on — the construction list is confirmed first',
  detail: 'one sketch of the detail, agreeing with the front and back flats',
};

/**
 * THE ROUTE, IN CODE (§3.4). `structure` = the «from my flat» picks still on the card; the toggle
 * without a pick is not a route.
 */
export function routeOf(input: {
  target: FlatTarget;
  fromMyFlat: boolean;
  structure: number;
  joins: common_DesignJoins | null | undefined;
}): FlatRoute {
  if (targetSlotId(input.target) > 0) return 'detail';
  if (input.fromMyFlat && input.structure > 0) return 'hand_flat';
  if (suggestsStraps(input.joins)) return 'straps';
  return 'photos';
}

/** The wire mode of a route: a detail run carries no flat block (the server refuses one there). */
export function modeOfRoute(route: FlatRoute): FlatMode | null {
  return route === 'detail' ? null : route;
}

/** The four sides, one picture — the only views run there is. */
export const VIEWS_ORDER = ['front', 'back', 'side_l', 'side_r'] as const;

/**
 * THE FRONT AND BACK SLOTS A DETAIL RUN READS (owner 06.10 answer 3): the filled ones, front first.
 * Empty → the detail may not run (the target is disabled).
 */
export function detailFlatSlotIds(
  sides: readonly { view: string; slot: common_DesignBenchSlot | null }[],
): number[] {
  return ['front', 'back']
    .map((v) => sides.find((s) => s.view === v)?.slot ?? null)
    .filter((s): s is common_DesignBenchSlot => !!s && filled(s) && (s.id ?? 0) > 0)
    .map((s) => s.id ?? 0);
}
