import { useCallback, useState } from 'react';

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
export function useOnModelShot(): ShotDraft {
  const [shots, setShots] = useState<OnModelShot[]>([]);
  const add = useCallback((next: readonly OnModelShot[]) => {
    let landed = 0;
    setShots((prev) => {
      const grown = addShots(prev, next);
      landed = grown.length - prev.length;
      return grown;
    });
    return landed;
  }, []);
  return {
    shots,
    /**
     * ⚠ THE COUNT IS READ OUT OF THE UPDATER, WHICH RUNS SYNCHRONOUSLY HERE AND ONLY HERE. React
     * calls a functional updater during the dispatch on the first `setState` of a batch; the
     * caller uses the number for a SENTENCE («2 of 6 were already in the strip»), never for state,
     * so a stale zero would cost a line of prose, not a photograph. The alternative — recomputing
     * `addShots` outside the updater — reads `shots` from the closure and is the stale one.
     */
    add,
    remove: useCallback((mediaId: number) => {
      setShots((prev) => prev.filter((s) => (s.media.id ?? 0) !== mediaId));
    }, []),
    clear: useCallback(() => setShots([]), []),
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
export function useOnModelPaint(): PaintDraft {
  const [paint, setPaint] = useState<OnModelPaint>(NO_PAINT);
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
