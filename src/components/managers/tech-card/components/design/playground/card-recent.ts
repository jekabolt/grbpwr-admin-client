import type { GetDesignBandResponse, common_DesignRun } from 'api/proto-http/admin';

import { RECENT_TEXT_MAX, mergeRecentText } from './recent';
import { workflowOfRun } from './registry/run-workflow';

/**
 * ═══ RECENTLY USED «ON THIS CARD» — THE CARD'S OWN PAST WORDS, FROM THE BAND (PLAYGROUND C-16) ════
 *
 * Phase 2's «recently used» is per browser (`./recent.ts`): a colleague's words, or one's own from
 * another machine, never show. The band already carries them: its first page of runs, each with the
 * `ask` it was bought with and its frozen `params` (`design_band.go` fills both). So the menu gets a
 * second group, «on this card», read from there — no new request, no new button.
 *
 * WHICH TEXT A RUN GAVE A FIELD — one table, keyed like `PROMPT_IDEAS` (`workflow.field`); a pair
 * not in it reads `[]`:
 *   · the fields whose words travel as the run's `ask` (tile 1 pose, 2 region, 3/4/5 garment,
 *     6 placement, 7 variation, 11 prompt) → `run.ask`;
 *   · `virtual_try_on.scene` → `params.freeform.options.sceneText`;
 *   · `retouch_zone.change_text` → a phase-2 retouch: `params.freeform.items[0].texts[0]`; a mask
 *     retouch (kind `inpaint`, phase 3): `run.ask`.
 * A run is the field's when `workflowOfRun` (the server's rule) files it under that workflow; a mask
 * retouch is filed under `retouch_zone` here by its kind, so the list is right before and after the
 * kind lands in `workflowOfRun`. An off-page stub (no params) gives its `ask` and nothing else.
 *
 * Newest first (the band's order), trimmed, no blanks, no repeats by the `mergeRecentText` rule, at
 * most eight. The browser's group wins a repeat: `recentMenu` drops from «on this card» what «in this
 * browser» already shows.
 */

type Source = (run: common_DesignRun) => string;

const isMaskRetouch = (run: common_DesignRun) =>
  (run.kind ?? '').trim().toLowerCase() === 'inpaint';

const ask: Source = (run) => run.ask ?? '';
const sceneText: Source = (run) => run.params?.freeform?.options?.sceneText ?? '';
const retouchWords: Source = (run) =>
  isMaskRetouch(run) ? run.ask ?? '' : run.params?.freeform?.items?.[0]?.texts?.[0] ?? '';

export const CARD_RECENT_SOURCES: Readonly<Record<string, Readonly<Record<string, Source>>>> = {
  virtual_try_on: { pose: ask, scene: sceneText },
  fabric_to_image: { region: ask },
  ghost_mannequin: { garment: ask },
  change_color: { garment: ask },
  swap_fabrics: { garment: ask },
  add_logo: { placement: ask },
  design_variations: { variation: ask },
  create_edit: { prompt: ask },
  retouch_zone: { change_text: retouchWords },
};

const workflowOf = (run: common_DesignRun): string =>
  isMaskRetouch(run) ? 'retouch_zone' : workflowOfRun(run) ?? '';

/** The card's own past texts of one field, newest first, at most eight. */
export function cardRecentTexts(
  band: Pick<GetDesignBandResponse, 'runs'>,
  workflowKey: string,
  fieldKey: string,
): string[] {
  const source = CARD_RECENT_SOURCES[workflowKey]?.[fieldKey];
  if (!source) return [];
  const texts: string[] = [];
  for (const run of band.runs ?? []) {
    if (workflowOf(run) !== workflowKey) continue;
    // A stub states no params: every source but `ask` reads '' from it.
    const text = source(run);
    if (text.trim()) texts.push(text);
  }
  return mergeRecentText(texts, [], RECENT_TEXT_MAX);
}

const norm = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

/** The two groups of the menu: the card's minus what the browser already lists; either may be empty. */
export function recentMenu(
  card: readonly string[],
  browser: readonly string[],
): { card: readonly string[]; browser: readonly string[] } {
  const shown = new Set(browser.map(norm));
  return { card: card.filter((t) => !shown.has(norm(t))), browser };
}
