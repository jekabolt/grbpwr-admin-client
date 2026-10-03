import type { common_DesignPicture } from 'api/proto-http/admin';
import { useEffect } from 'react';
import { Button } from 'ui/components/button';

import { pictureHandle } from '../handles';
import { SplitError, SplitQuietActions, SplitStage, useSplitCut } from '../split-modal';
import { closeSurface, openSurface } from './bench-store';

/**
 * ═══ THE SPLIT, INLINE ON THE BENCH (03.10, owner item 19, T20) ═══════════════════════════════════
 *
 * Owner, verbatim: «в LATEST GENERATION если мы имеем дело с не сплитнутой картинкой нам это прямо
 * в этом же блоке надо разметить и спилтнуть и кропнуть должны видеть то что на скриншоте и снизу
 * кнопка confirm».
 *
 * An uncut sheet on the FLAT bench is not a tile with a SPLIT corner: it is the sheet itself at the
 * block's width, its frames pre-placed from the declared views, each with its black chip (the chip
 * is the view picker), dragged and resized in place, and one `confirm` under it. `confirm` is the
 * popup's cut: the same `useSplitCut`, the same `SplitDesignPicture` payload, `for_input` false
 * (a cut on the bench lays a sheet out into views; it does not feed the prompt, T-15).
 *
 * THE BENCH HOLDS WHILE SOMEBODY CUTS. The first touch of a frame (or the press of `confirm`) opens
 * a surface of this run (`bench-store.ts`), exactly as the popup did on open: a newer run landing on
 * a poll does not swap the sheet out from under the frames, and the pieces land here. Merely seeing
 * the editor holds nothing. The surface goes when the editor does, which is when the band re-read
 * brings the pieces and the bench draws them instead (`piecesInPlace`).
 */
export function InlineSplit({
  techCardId,
  picture,
  views,
  runId,
}: {
  techCardId: number;
  picture: common_DesignPicture;
  /** The views the frames are seeded from — the tile gate's own reading (`splitViewsOf`). */
  views: readonly string[];
  runId: number;
}) {
  const pictureId = picture.id ?? 0;
  const surface = `split:inline:${pictureId}`;
  const cut = useSplitCut({
    techCardId,
    picture,
    views,
    forInput: false,
    active: true,
    onTouch: () => openSurface(techCardId, surface, runId),
  });
  useEffect(() => () => closeSurface(techCardId, surface), [techCardId, surface]);

  const handle = pictureHandle(picture);
  return (
    <div data-inline-split={pictureId} className='space-y-2'>
      <SplitStage cut={cut} nameInFrame maxHeight={560} />
      <div className='flex items-center justify-between gap-3'>
        <SplitQuietActions cut={cut} />
        <Button
          type='button'
          variant='main'
          size='sm'
          data-split-confirm={pictureId}
          aria-label={`cut ${handle} into ${cut.frames.length} pictures`}
          title={cut.viewless > 0 ? 'name every side' : undefined}
          disabled={!cut.ready || cut.pending || cut.landed}
          onClick={cut.submit}
        >
          confirm
        </Button>
      </div>
      <SplitError cut={cut} />
    </div>
  );
}
