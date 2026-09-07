import type { common_MediaFull } from 'api/proto-http/admin';
import { useCallback, useRef, useState } from 'react';

import {
  EMPTY_PLAYGROUND,
  PLAYGROUND_ITEMS_MAX,
  REGIONS_PER_ITEM_MAX,
  addItems,
  type PlaygroundItem,
  type PlaygroundRegion,
  type PlaygroundRole,
  type PlaygroundState,
} from './model';

/**
 * ═══ THE DRAFT OF THE PLAYGROUND — one hook, one card, and it dies with the card ══════════════
 *
 * IT LIVES IN THE TAB AND REACHES THE SERVER EXACTLY ONCE, inside `StartDesignRun.params`. From
 * then on the run's own frozen input snapshot answers «what was on the table» — never this.
 *
 * ⚠ NOTHING HERE IS A FORM FIELD, and that is a decision with a name: the card's RHF form is
 * guarded by `payload-gate.ts`, and a draft that is not saved with the card has no business in the
 * payload. It is also why nothing is seeded from the past: the table is what a person laid on it
 * in this sitting.
 *
 * ═══ ⚠ IT DIES WITH THE CARD, NOT WITH THE TAB — AND THAT COSTS A PAID RUN (invariant 12) ══════
 *
 * `StudioTab` IS NOT REMOUNTED between card A and card B. The measured cost of the same omission
 * on ON MODEL: A's photographs stayed in the strip over B's screen, and GENERATE bought a run
 * against the wrong card with pictures of the wrong garment coming back onto it. So this hook
 * carries the card it was filled for and empties itself the moment that number changes, IN THE
 * BODY OF THE RENDER. Not in an effect: an effect leaves one COMMITTED frame in which the card is
 * already B and the table is still A's, and one frame is enough to press a button on.
 *
 * ⚠ TESTING THIS ON A COLD CARD PROVES NOTHING. A card not yet visited answers `isLoading`, the
 * composer swaps the step for «loading…» and the block unmounts on its own. The dangerous walk is
 * the ordinary one, A → B → A, where the band is cached and the node lives.
 *
 * ═══ THE LIST IS MIRRORED IN A REF, AND EVERY WRITER KEEPS THE MIRROR TRUE ═════════════════════
 *
 * Two `add`s in ONE task (a paste answered in two chunks, a picker handing several) both read the
 * pre-render list, and the second write overwrites the first. The ref is what the next gesture in
 * the same tick composes with; the render re-syncs it from state. The count of what LANDED then
 * costs nothing and cannot be stale — the neighbouring screen printed «6 did not go in» over six
 * that had all gone in before it learned this.
 */
export type PlaygroundDraft = {
  state: PlaygroundState;
  /** Adds what is not already on the table, up to the cap; says how many actually landed. */
  add: (media: readonly common_MediaFull[], role?: PlaygroundRole) => number;
  remove: (mediaId: number) => void;
  setRole: (mediaId: number, role: PlaygroundRole) => void;
  /** The whole area list of one picture — the mark mode writes it as a unit. */
  setRegions: (mediaId: number, regions: PlaygroundRegion[]) => void;
  setRegionText: (mediaId: number, index: number, text: string) => void;
  setPreset: (key: string) => void;
  setAsk: (words: string) => void;
  clear: () => void;
  /** Put a past run's table back, pictures and areas together (`recall`). */
  adopt: (items: PlaygroundItem[], preset: string, ask: string) => void;
};

export function usePlaygroundDraft(techCardId: number | undefined): PlaygroundDraft {
  const [state, setState] = useState<PlaygroundState>(EMPTY_PLAYGROUND);

  const latest = useRef<PlaygroundState>(state);
  latest.current = state;

  /** The card this table was laid for — see the file header. */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    // By VALUE: an equal-but-fresh object would cost a render that changes nothing on screen.
    if (state.items.length || state.preset || state.ask) {
      latest.current = EMPTY_PLAYGROUND;
      setState(EMPTY_PLAYGROUND);
    }
  }

  const write = useCallback((next: PlaygroundState) => {
    latest.current = next;
    setState(next);
  }, []);

  const mapItem = useCallback(
    (mediaId: number, fn: (item: PlaygroundItem) => PlaygroundItem) => {
      const prev = latest.current;
      write({
        ...prev,
        items: prev.items.map((i) => ((i.media.id ?? 0) === mediaId ? fn(i) : i)),
      });
    },
    [write],
  );

  return {
    state,
    add: (media, role = '') => {
      const grown = addItems(latest.current.items, media, role);
      const landed = grown.length - latest.current.items.length;
      if (landed > 0) write({ ...latest.current, items: grown });
      return landed;
    },
    remove: useCallback(
      (mediaId: number) => {
        const prev = latest.current;
        write({ ...prev, items: prev.items.filter((i) => (i.media.id ?? 0) !== mediaId) });
      },
      [write],
    ),
    setRole: useCallback(
      (mediaId: number, role: PlaygroundRole) => {
        /* ONE PICTURE PER ROLE THE PRESET NAMES ONCE. «The hardware» is one thing; a second
           picture claiming the role would leave the craft sentence pointing at two images and the
           server picking one of them silently. Taking a role therefore takes it OFF whoever held
           it — a move, not a second claim. */
        const prev = latest.current;
        write({
          ...prev,
          items: prev.items.map((i) => {
            const mine = (i.media.id ?? 0) === mediaId;
            if (mine) return { ...i, role };
            if (role && i.role === role) return { ...i, role: '' as PlaygroundRole };
            return i;
          }),
        });
      },
      [write],
    ),
    setRegions: useCallback(
      (mediaId: number, regions: PlaygroundRegion[]) => {
        mapItem(mediaId, (i) => ({ ...i, regions: regions.slice(0, REGIONS_PER_ITEM_MAX) }));
      },
      [mapItem],
    ),
    setRegionText: useCallback(
      (mediaId: number, index: number, text: string) => {
        mapItem(mediaId, (i) => ({
          ...i,
          regions: i.regions.map((r, n) => (n === index ? { ...r, text } : r)),
        }));
      },
      [mapItem],
    ),
    setPreset: useCallback(
      (key: string) => {
        write({ ...latest.current, preset: key });
      },
      [write],
    ),
    setAsk: useCallback(
      (words: string) => {
        write({ ...latest.current, ask: words });
      },
      [write],
    ),
    clear: useCallback(() => write(EMPTY_PLAYGROUND), [write]),
    adopt: useCallback(
      (items: PlaygroundItem[], preset: string, ask: string) => {
        write({ items: items.slice(0, PLAYGROUND_ITEMS_MAX), preset, ask });
      },
      [write],
    ),
  };
}
