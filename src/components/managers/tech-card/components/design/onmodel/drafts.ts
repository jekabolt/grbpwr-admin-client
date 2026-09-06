import { useCallback, useState } from 'react';

import { hexIsPaintable } from '../render/model';
import { NO_PAINT, type OnModelPaint, type OnModelShot } from './model';

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
 * ⚠ NEITHER DRAFT IS SEEDED FROM THE PAST. The paint is a property of THE SHOT («the paint is kept
 * on the shot»), and a shot picked a minute ago has no past. Seeding the hex from the card's last
 * recipe — the render draft's habit — is exactly how a screen came to open with an invisible cloth
 * in its draft and a live GENERATE over an empty colour; the card's known colours stand as TILES
 * instead (`flatColours`), visible and picked by hand.
 *
 * ⚠ `words` IS NOT HERE. On the wire it is one field with two meanings — cloth on FABRIC RENDER,
 * colour on ON MODEL (invariant 8) — and this screen draws no free text at all; the wire field
 * leaves empty. The render draft (`render/drafts.ts`) is not shared with this file and must not be.
 */

export type ShotDraft = {
  shot: OnModelShot | null;
  /** Replaces whatever stood in the slot. The question before a replacement is the caller's. */
  put: (next: OnModelShot) => void;
  clear: () => void;
};

export function useOnModelShot(): ShotDraft {
  const [shot, setShot] = useState<OnModelShot | null>(null);
  return {
    shot,
    put: useCallback((next: OnModelShot) => setShot((next.media.id ?? 0) > 0 ? next : null), []),
    clear: useCallback(() => setShot(null), []),
  };
}

export type PaintDraft = {
  paint: OnModelPaint;
  /** Toggle: the same texture again takes it off; another texture replaces it AND the colour. */
  pickTexture: (assetId: number) => void;
  /** Toggle — a TILE: the same colour again takes it off; another replaces it AND the texture. */
  toggleColour: (hex: string) => void;
  /** Set — the PICKER, which fires while the person drags: never a toggle. Empty takes it off. */
  setColour: (hex: string) => void;
  clear: () => void;
};

/**
 * EXACTLY ONE OF TWO, KEPT BY THE STATE. Any gesture on one axis wipes the other: a person who
 * picked a cloth and then a colour has said «a colour», and the group's pill says so too. The
 * server would accept both at once (a re-clothed garment re-tinted); the aside speaks the
 * prototype's grammar — «what it is repainted in · one of three» — and a pair is not one.
 */
export function useOnModelPaint(): PaintDraft {
  const [paint, setPaint] = useState<OnModelPaint>(NO_PAINT);
  const sameHex = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return {
    paint,
    pickTexture: useCallback((assetId: number) => {
      setPaint((prev) =>
        assetId <= 0 || (prev.mode === 'texture' && prev.assetId === assetId)
          ? NO_PAINT
          : { mode: 'texture', assetId, hex: '' },
      );
    }, []),
    toggleColour: useCallback((hex: string) => {
      const value = (hex ?? '').trim();
      if (!hexIsPaintable(value)) return;
      setPaint((prev) =>
        prev.mode === 'colour' && sameHex(prev.hex, value)
          ? NO_PAINT
          : { mode: 'colour', assetId: 0, hex: value },
      );
    }, []),
    setColour: useCallback((hex: string) => {
      const value = (hex ?? '').trim();
      setPaint((prev) => {
        if (!value) return prev.mode === 'colour' ? NO_PAINT : prev;
        if (prev.mode === 'colour' && prev.hex === value) return prev;
        return { mode: 'colour', assetId: 0, hex: value };
      });
    }, []),
    clear: useCallback(() => setPaint(NO_PAINT), []),
  };
}
