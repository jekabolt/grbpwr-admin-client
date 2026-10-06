import type { common_DesignBenchSlot } from 'api/proto-http/admin';

import type { FlatMode } from './flat-mode';

/**
 * ═══ ONE GENERATE, NO SETTINGS (flat-consistency 82-INPUT-REDESIGN, owner request 8, 06.10) ══════
 *
 * The run row is `GENERATE · target ▾ · (from my flat) · what the model gets ▸`. Everything that
 * used to be a choice is a constant or a rule here:
 *   · the views run is always the four sides on ONE picture (`VIEWS_ORDER`);
 *   · the target is `views` (or `views again`) first, then each detail not generated yet — the
 *     details stay disabled until FRONT and BACK hold a picture;
 *   · the route is chosen in code (`routeOf`): detail → photos n1; «from my flat» on → hand_flat;
 *     else photos. The server owns the count.
 * The construction (join list, ASK questions, the `straps & openings` route) is gone from the flat
 * (owner 07.10, M7 — 100-CONSTRUCTION-DEADEND): nothing about it gates, asks or routes a press.
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

/**
 * WHERE ONE REFERENCE GOES ON A FLAT RUN — the client half of the server's two filters, so «what the
 * model gets ▸» lists exactly what is sent:
 *   · `designFlatOnlyRoledPhotos` — a mood picture, a `mood` role and a roleless picture never travel;
 *   · `designFlatDetailOnlyItsRefs` (T74, owner 06.10 «если генерим деталь — только картинки этой
 *     детали»): on a detail target only a `detail` reference tied to THAT slot travels; the
 *     accepted FRONT/BACK flats go with it as bench plates, not as references.
 * `detailSlotId` 0 = the views run.
 */
export type FlatRefFate = 'sent' | 'mood' | 'roleless' | 'not_this_detail';

export function flatRefFate(
  ref: { mediaId?: number; role?: string; detailSlotId?: number },
  moodIds: Set<number>,
  detailSlotId: number,
): FlatRefFate {
  const role = (ref.role ?? '').trim();
  if ((ref.mediaId != null && moodIds.has(ref.mediaId)) || role === 'mood') return 'mood';
  if (!role) return 'roleless';
  if (detailSlotId > 0 && (role !== 'detail' || (ref.detailSlotId ?? 0) !== detailSlotId)) {
    return 'not_this_detail';
  }
  return 'sent';
}

/**
 * THE WORDS A FLAT RUN SENDS (wave 10): only the card's «garment: <class>» line — the description is
 * model-seeded as often as human-written and nothing records which, so the server sends none of it
 * (designgen.FlatWordsCarryDescription). Mirror of FlatConstructionNote: the first «garment:» line
 * with a class, or ''.
 */
export function flatWordsSent(words: string): string {
  for (const line of words.split('\n')) {
    const m = /^\s*(?:- )?garment\s*:\s*(.*)$/i.exec(line);
    if (m && m[1].trim()) return `garment: ${m[1].trim()}`;
  }
  return '';
}

/**
 * THE PICTURES A FLAT RUN SENDS, IN THE SERVER'S ORDER (wave 10): the card's references by ordinal,
 * each media once, kept by `flatRefFate` = 'sent' — the mirror of designAssembleInputs →
 * designFlatOnlyRoledPhotos → designFlatDetailOnlyItsRefs. «what the model gets» lists exactly these.
 */
export function flatSentRefs<
  R extends { mediaId?: number; role?: string; detailSlotId?: number; ordinal?: number },
>(references: readonly R[], moodIds: Set<number>, detailSlotId: number): R[] {
  const seen = new Set<number>();
  return [...references]
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    .filter((r) => {
      const id = r.mediaId ?? 0;
      if (id <= 0 || seen.has(id)) return false;
      seen.add(id);
      return flatRefFate(r, moodIds, detailSlotId) === 'sent';
    });
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

export type FlatRoute = 'photos' | 'hand_flat' | 'detail';

/**
 * THE ROUTE, IN CODE (§3.4). `structure` = the «from my flat» picks still on the card; the toggle
 * without a pick is not a route.
 */
export function routeOf(input: {
  target: FlatTarget;
  fromMyFlat: boolean;
  structure: number;
}): FlatRoute {
  if (targetSlotId(input.target) > 0) return 'detail';
  if (input.fromMyFlat && input.structure > 0) return 'hand_flat';
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
