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
 * THE WORDS A FLAT RUN SENDS (wave 10 → M14). The card's «garment: <class>» line — the first
 * «garment:» line of the description with a class (the description itself is model-seeded as often
 * as human-written and nothing records which, so none of its prose is sent:
 * designgen.FlatWordsCarryDescription) — then the person's own flat words (`flatWords`, typed in
 * FLAT › WORDS and written by nothing else) as typed: each line trimmed, blank lines dropped. Mirror
 * of designgen.FlatGarmentNote, byte for byte (the same cases stand in both repos' tests). '' when
 * there is neither.
 */
export function flatWordsSent(description: string, human = ''): string {
  let cls = '';
  for (const raw of description.split('\n')) {
    // as the server reads a line: trimmed, a list dash dropped, trimmed again (a CRLF line too)
    let line = raw.trim();
    if (line.startsWith('- ')) line = line.slice(2).trim();
    const m = /^garment\s*:\s*(.*)$/i.exec(line);
    if (m && m[1].trim()) {
      cls = `garment: ${m[1].trim()}`;
      break;
    }
  }
  const words = flatHumanWords(human);
  if (!words) return cls;
  return cls ? `${cls}\n${words}` : words;
}

/** The person's flat words as they travel (designgen.FlatHumanWords): lines trimmed, blanks dropped. */
export function flatHumanWords(human: string): string {
  return human
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * THE PERSON'S LINES A FLAT RUN WAS GIVEN — what `recall ▸` puts back into FLAT › WORDS (`flatWords`).
 *
 * A flat run freezes `garmentNote` = the «garment: class» line, then the person's own lines (M14). Only
 * those lines come back: the class line follows the card's category and is never typed. '' for:
 *   · another kind — a render run's note IS the description, model-written prose that must not land
 *     in a field whose every line travels as the person's word;
 *   · a flat run older than M14 on beta (FLAT_WORDS_SINCE) — its lines after the class line were the
 *     description's clauses (before 06.10) or nothing;
 *   · a rerun — it rides its parent's frozen snapshot, which may be older than M14 (recall the
 *     parent for its words).
 */
export const FLAT_WORDS_SINCE = Date.parse('2026-10-07T10:56:13Z');

export function runFlatWords(run: {
  kind?: string;
  createdAt?: string;
  rerunOf?: number;
  inputs?: { garmentNote?: string };
}): string {
  if ((run.kind ?? '') !== 'flat' || (run.rerunOf ?? 0) > 0) return '';
  const at = Date.parse(run.createdAt ?? '');
  if (!(at >= FLAT_WORDS_SINCE)) return '';
  const lines = (run.inputs?.garmentNote ?? '').split('\n');
  const first = lines.findIndex((l) => l.trim() !== '');
  const rest =
    first >= 0 && /^garment\s*:/i.test(lines[first].trim()) ? lines.slice(first + 1) : lines;
  return flatHumanWords(rest.join('\n'));
}

/**
 * THE CEILING OF THE FLAT WORDS (the server refuses a flat run above it: designMaxFlatWordsRunes) — a
 * few lines under the class line, not a second description.
 */
export const FLAT_WORDS_MAX = 1000;

/**
 * THE CLASS LINE FOLLOWS THE CATEGORY (M10). WORDS are seeded once with «garment: <the category's
 * name>» (`composeWords`), and a later category change left that line behind: card 38 moved from
 * `short sleeve shirt` to `tank top` and every flat still told the model «short sleeve shirt». The
 * first class line (the one `flatWordsSent` / the server's `FlatConstructionNote` read) is swapped for
 * `current` when it names some OTHER category of the dictionary (`seeded` — the set of every
 * category's name, `garmentNameOf`); a class the designer wrote themselves is kept, and WORDS with
 * no class line are left alone. Returns `words` unchanged when nothing moves.
 */
export function followCategory(
  words: string,
  current: string,
  seeded: ReadonlySet<string>,
): string {
  const now = current.trim();
  if (!now) return words;
  const lines = words.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*(?:- )?garment\s*:\s*)(.*)$/i.exec(lines[i]);
    const cls = m ? m[2].trim() : '';
    if (!m || !cls) continue;
    if (cls.toLowerCase() === now.toLowerCase() || !seeded.has(cls.toLowerCase())) return words;
    lines[i] = `${m[1]}${now}`;
    return lines.join('\n');
  }
  return words;
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
