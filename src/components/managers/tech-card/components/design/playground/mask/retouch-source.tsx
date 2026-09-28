import type { JSX } from 'react';

import { PictureTile } from '../../picture-tile';
import { mediaThumb } from '../../render/model';
import { ImageSlots } from '../fields';
import { useFocusReturn } from '../focus';
import { imagesOf, textOf } from '../registry/common';
import {
  RETOUCH_MASKING_KEY,
  RETOUCH_SOURCE_KEY,
  RETOUCH_WORDS_KEY,
} from '../registry/tiles/retouch-zone';
import type { CustomFieldProps, Draft } from '../registry/types';
import { MaskEditor } from './mask-editor';

/**
 * ═══ TILE 10's ONE PICTURE — OPEN OR UPLOAD ANY PICTURE, THEN MASK IT (G-02 M-1) ═══════════════
 *
 * The owner's 12.png: «Open or upload any picture …, press Mask». The results' `mask` corners reach
 * only what the playground made; this slot reaches everything else — an upload, a paste, a moodboard
 * or fitting photograph, a fabric picture (the empty slot is the library door, `Reuse` the rest:
 * `ImageSlots`, the same grammar as every tile's picture). The door takes any picture of this card
 * or a fresh upload (backend `design_freeform.go`, case retouch; D2 media rule).
 *
 * A PICK OPENS THE SAME `MaskEditor` the result tiles open. A filled slot is the picture with two
 * corners — `mask` (open the editor again) and `✕` (take it out) — and nothing else: the one GENERATE
 * is the editor's; the panel has none.
 *
 * STATE LIVES IN THE DRAFT (`images[RETOUCH_SOURCE_KEY]`, `flags[RETOUCH_MASKING_KEY]`), per card and
 * workflow like every other form: «run that again» on a retouch lays its picture here with the editor
 * open on it (the tile's `recall`), and a card switch forgets both.
 */

/** The slot's `mask` corner — focus lands there when the editor closes and its opener is gone. */
function sourceMaskDoor(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-retouch-source] button[aria-label^="mask this picture"]',
  );
}

export function RetouchSource({
  band,
  techCardId,
  draft,
  onDraft,
  disabled,
}: CustomFieldProps): JSX.Element {
  const picture = imagesOf(draft, RETOUCH_SOURCE_KEY)[0] ?? null;
  const masking = !!picture && !disabled && (draft.flags[RETOUCH_MASKING_KEY] ?? false);
  const focus = useFocusReturn(sourceMaskDoor);

  const write = (fn: (d: Draft) => Partial<Draft>) => onDraft((d) => ({ ...d, ...fn(d) }));
  const setMasking = (on: boolean) =>
    write((d) => ({ flags: { ...d.flags, [RETOUCH_MASKING_KEY]: on } }));

  if (!picture) {
    return (
      <div data-retouch-source=''>
        <ImageSlots
          mode='grow'
          max={1}
          value={[]}
          onChange={(list) => {
            const media = list[0];
            if (!media) return;
            // The pick is the press: the editor opens on the picture at once.
            write((d) => ({
              images: { ...d.images, [RETOUCH_SOURCE_KEY]: [media] },
              flags: { ...d.flags, [RETOUCH_MASKING_KEY]: !disabled },
            }));
          }}
          band={band}
          techCardId={techCardId}
          purpose='retouch a zone'
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className='w-32' data-retouch-source={picture.id ?? 0}>
      <PictureTile
        url={mediaThumb(picture)}
        alt='the picture to retouch'
        aspect='1/1'
        fit='cover'
        className='w-full bg-bgColor'
        onMask={
          disabled
            ? undefined
            : {
                onClick: () => {
                  focus.remember();
                  setMasking(true);
                },
                ariaLabel: 'mask this picture — paint a zone to retouch',
                title:
                  'paint a zone of this picture and say what should be there — a NEW picture comes back',
              }
        }
        onRemove={
          disabled
            ? undefined
            : {
                onClick: () =>
                  write((d) => ({
                    images: { ...d.images, [RETOUCH_SOURCE_KEY]: [] },
                    flags: { ...d.flags, [RETOUCH_MASKING_KEY]: false },
                  })),
                ariaLabel: 'remove the picture to retouch',
                title: 'take it out',
              }
        }
      />
      {masking && (
        <MaskEditor
          key={picture.id ?? 0}
          open
          onOpenChange={(next: boolean) => !next && setMasking(false)}
          onCloseAutoFocus={focus.onCloseAutoFocus}
          techCardId={techCardId}
          media={picture}
          label='your picture'
          initialWords={textOf(draft, RETOUCH_WORDS_KEY)}
          disabled={disabled}
        />
      )}
    </div>
  );
}
