import { useCallback, useRef, useState } from 'react';

import { hexIsPaintable } from '../render/model';
import { NO_PAINT, addShots, type OnModelPaint, type OnModelShot } from './model';

/**
 * ═══ THE TWO DRAFTS OF THE ASIDE — the shot and the paint — and nothing else ══════════════════
 *
 * BOTH LIVE IN THE TAB AND DIE WITH IT. Each reaches the server exactly once, inside
 * `StartDesignRun.params` (`extra_input_media_ids` for the shot, `colour` for the paint); from
 * then on the run's own input snapshot answers «what was repainted, in what» — never these two.
 *
 * ⚠ THE SHOT IS NOT FILED AS A `DesignPicture` OF THE CARD, and that is a decision. The upload
 * verb knows three kinds — flat | render | threed — and none of them means «a photograph of the
 * garment on a person». Filed as a flat it would appear on the render's candidate strip as a
 * drawing and ride into the prompt as one. `extra_input_media_ids` is an FK on `media(id)` and the
 * contract names it, for a recolour, THE PHOTOGRAPH BEING RECOLOURED — so the media travels as
 * media.
 *
 * ⚠ NEITHER DRAFT IS SEEDED FROM THE PAST. The paint is a property of THE RUN, and a strip filled
 * a minute ago has no past. Seeding the hex from the card's last recipe — the render draft's
 * habit — is exactly how a screen came to open with an invisible cloth in its draft and a live
 * GENERATE over an empty colour; here both axes start empty and are picked by hand.
 *
 * ⚠ `words` IS NOT HERE. On the wire it is one field with two meanings — cloth on FABRIC RENDER,
 * colour on ON MODEL (invariant 8) — and this screen draws no free text at all; the wire field
 * leaves empty. The render draft (`render/drafts.ts`) is not shared with this file and must not be.
 *
 * ═══ ⚠ BOTH DRAFTS DIE WITH THE CARD, NOT WITH THE TAB — AND THAT COSTS A PAID RUN ═════════════
 *
 * `StudioTab` IS NOT REMOUNTED when the person walks from card A to card B (invariant 12): the
 * composer resets what it holds in the body of its own render, and until this round these two
 * drafts held nothing of the sort. The measured outcome: four photographs of A's fitting and A's
 * pantone stayed in the strip over B's screen, and a GENERATE pressed there sent A's media ids as
 * `extra_input_media_ids` under B's `tech_card_id` — a run bought against the wrong card, with
 * pictures of the wrong garment coming back onto it.
 *
 * SO EACH HOOK CARRIES THE CARD IT WAS FILLED FOR and empties itself the moment that number
 * changes, IN THE BODY OF THE RENDER (invariant 12, the pattern of `head/construction-draft.tsx`).
 * Not in an effect: an effect would leave one COMMITTED frame in which the card is already B and
 * the strip is still A's, and one frame is enough to press a button on.
 *
 * ⚠ TESTING THIS ON A COLD CARD PROVES NOTHING, and that is how the reset gets deleted later. A
 * card not yet visited in this session answers `isLoading: true`, `StudioTab` swaps the whole step
 * for «loading…», and the block unmounts on its own — the state disappears with or without the
 * reset. The dangerous walk is the ordinary one, A → B → A, where the band is cached, the step is
 * never swapped and the node lives (scene «cards» of `probe-aside.mjs` warms both cards first).
 */

export type ShotDraft = {
  /** The strip, in the order it will leave. Never longer than `RECOLOR_SOURCES_MAX`. */
  shots: OnModelShot[];
  /** Adds what is not already in the strip, up to the cap; says how many actually landed. */
  add: (next: readonly OnModelShot[]) => number;
  remove: (mediaId: number) => void;
  clear: () => void;
};

/**
 * ⚠ THE STRIP REPLACED A SLOT, AND THE QUESTION BEFORE A REPLACEMENT WENT WITH IT (r3 п.42). While
 * one photograph stood alone, picking another DESTROYED it, and a destroyed pick deserved an
 * «are you sure». Adding to a list destroys nothing: the wrong photograph is taken off by its own
 * ✕ on its own cell. A confirmation over an additive gesture is a click that answers nothing.
 */
export function useOnModelShot(techCardId: number | undefined): ShotDraft {
  const [shots, setShots] = useState<OnModelShot[]>([]);

  /**
   * ═══ THE STRIP, MIRRORED IN A REF — ONE LIST, TWO READERS, NEITHER OF THEM STALE ══════════════
   *
   * ⚠ THE COUNT USED TO BE READ OUT OF A FUNCTIONAL UPDATER, on the claim that React runs one
   * synchronously here. It runs one synchronously only on the EAGER path — when the fiber has no
   * pending update — and off that path `landed` stayed 0, `dropped` became `next.length`, and the
   * strip printed «6 of them did not go in» over six photographs that had all gone in. That is a
   * lie on screen, not the missing line of prose the old comment settled for.
   *
   * ⚠ AND THE OBVIOUS REPAIR — recomputing `addShots(shots, next)` from the render's own closure —
   * TRADES THE LIE FOR A LOST PHOTOGRAPH: two `add`s in ONE task (a handler that adds twice, a
   * paste answered in two chunks) both read the pre-render list, and the second write overwrites
   * the first. So the list is mirrored in a ref, and EVERY writer keeps the mirror true: the ref is
   * what the next gesture in the same tick composes with, and the render re-syncs it from state.
   * The count then costs nothing, the updater is not needed, and neither reader can be stale.
   */
  const latest = useRef<OnModelShot[]>(shots);
  latest.current = shots;

  /** The card this strip was filled for — see the file header. */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (shots.length) {
      latest.current = [];
      setShots([]);
    }
  }

  const write = useCallback((next: OnModelShot[]) => {
    latest.current = next;
    setShots(next);
  }, []);

  return {
    shots,
    add: (next: readonly OnModelShot[]) => {
      const grown = addShots(latest.current, next);
      const landed = grown.length - latest.current.length;
      if (landed > 0) write(grown);
      return landed;
    },
    remove: useCallback(
      (mediaId: number) => {
        write(latest.current.filter((s) => (s.media.id ?? 0) !== mediaId));
      },
      [write],
    ),
    clear: useCallback(() => write([]), [write]),
  };
}

export type PaintDraft = {
  paint: OnModelPaint;
  /** Toggle: the same cloth again takes it off. The colour is NOT touched (r3 п.43). */
  pickTexture: (assetId: number) => void;
  /** The pantone reference and its screen hex. Empty code AND empty hex take the colour off. */
  setColour: (hex: string, code: string) => void;
  clear: () => void;
};

/**
 * ═══ TWO INDEPENDENT AXES, AND THAT IS THE OWNER'S OWN ANSWER (r3 п.43) ═══════════════════════
 *
 * This hook used to keep the two mutually exclusive — «any gesture on one axis wipes the other» —
 * and argued it from the prototype's grammar («one of three»). The server never had that rule: a
 * re-clothed garment re-tinted is one call it prices and one sentence it builds. The owner asked
 * for both together by name, so the wipe is gone and nothing replaced it: a cloth toggles a cloth,
 * a colour sets a colour.
 */
export function useOnModelPaint(techCardId: number | undefined): PaintDraft {
  const [paint, setPaint] = useState<OnModelPaint>(NO_PAINT);

  /**
   * The card this paint was mixed for — see the file header. A cloth is `design_asset.id` OF THAT
   * CARD, so carrying it over is not merely stale: the id names a shelf B does not have.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    // By VALUE, not by identity: `setColour('', '')` leaves an equal-but-fresh object, and
    // rewriting it would cost a render that changes nothing on screen.
    if (paint.assetId || paint.hex || paint.code) setPaint(NO_PAINT);
  }

  return {
    paint,
    pickTexture: useCallback((assetId: number) => {
      setPaint((prev) =>
        assetId <= 0 || prev.assetId === assetId
          ? { ...prev, assetId: 0 }
          : { ...prev, assetId },
      );
    }, []),
    setColour: useCallback((hex: string, code: string) => {
      const value = (hex ?? '').trim();
      const ref = (code ?? '').trim();
      setPaint((prev) => ({
        ...prev,
        // A reference the swatch list cannot colour is still a reference (the dyehouse's own
        // number): it rides as `code` with an empty hex, exactly as the picker shows it.
        hex: hexIsPaintable(value) ? value : '',
        code: ref,
      }));
    }, []),
    clear: useCallback(() => setPaint(NO_PAINT), []),
  };
}
