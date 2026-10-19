import { common_MediaFull, common_Model } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { PictureBusy } from 'components/managers/tech-card/annotation/picture-busy';
import {
  MediaViewer,
  mediaFullToViewerItem,
  useMediaViewer,
} from 'components/shared/media-viewer/media-viewer';
import { notify } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { Button, Close, TILE_QUIET } from 'ui';
import { ModelFormData } from './schema';
import { useWhiteBg, useWhiteBgCard } from './white-bg';

/** The white-bg glyph: a frame with a figure in it — «the ground behind the person». */
function WhiteBgGlyph() {
  return (
    <svg
      viewBox='0 0 16 16'
      aria-hidden='true'
      className='mx-auto block size-3.5'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.25'
    >
      <rect x='1.5' y='1.5' width='13' height='13' />
      <circle cx='8' cy='6' r='2' />
      <path d='M4 14.5c0-2.5 1.8-4.25 4-4.25s4 1.75 4 4.25' />
    </svg>
  );
}

/**
 * ═══ THE MODEL'S PHOTO — ONE, 3:4, AS WIDE AS ITS COLUMN ═════════════════════════════════════════
 *
 * Empty: the slot itself is the door (click → library, ⌘V, drop), the same three gestures as every
 * picture slot. Filled: the photo, `×` top-right (remove) and `white bg` bottom-right, both quiet on
 * a desktop (hover / focus inside) and always shown on a touch screen.
 *
 * ⚠ ONE PHOTO IN A LIST FIELD. `mediaIds` stays a list (storage unchanged: `thumbnailId` is
 * `mediaIds[0]`, the rest is the model's media). A model saved by the old gallery may carry several;
 * this shows the first and leaves the others attached and untouched — nothing on screen claims them,
 * and dropping them silently on a save the person made for another field would be a loss nobody
 * asked for. The moment the photo itself is changed (picked, replaced, removed, made white) the form
 * states the new truth: `[new]` or `[]`.
 */
export function ModelMedia({ model }: { model?: common_Model }) {
  const { control, getValues } = useFormContext<ModelFormData>();
  const { field } = useController({ control, name: 'mediaIds' });
  // A RESOLUTION CACHE, NOT THE CHOICE (the choice is `field.value`): a picked or white photo is not
  // in `model.media` until the model is saved and re-read.
  const [known, setKnown] = useState<common_MediaFull[]>([]);
  // Photos made white here: pressing again would pay to cut out what is already cut out.
  const [whiteIds, setWhiteIds] = useState<number[]>([]);
  const viewer = useMediaViewer();

  const remember = (m: common_MediaFull) =>
    setKnown((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));

  const photoId = (field.value ?? [])[0] ?? 0;
  const photo =
    photoId > 0 ? [...known, ...(model?.media ?? [])].find((m) => m.id === photoId) : undefined;
  const photoUrl =
    photo?.media?.compressed?.mediaUrl ||
    photo?.media?.fullSize?.mediaUrl ||
    photo?.media?.thumbnail?.mediaUrl ||
    '';

  const card = useWhiteBgCard(model?.id);
  const white = useWhiteBg({
    card,
    onLanded: (original, result) => {
      remember(result);
      setWhiteIds((prev) => [...prev, result.id ?? 0]);
      // Changed or removed while the cut-out was out: the white copy stays in the library only.
      if ((getValues('mediaIds') ?? [])[0] !== original.id) {
        notify({ sev: 'warn', subject: 'WHITE BG', text: 'not placed', bad: 'photo changed' });
        return;
      }
      field.onChange([result.id]);
    },
  });

  const onSelect = (picked: common_MediaFull[]) => {
    const m = picked.find((p) => (p.id ?? 0) > 0);
    if (!m) return;
    remember(m);
    field.onChange([m.id]);
  };

  const busy = !!photo && white.busyId === photo.id;
  const isWhite = !!photo && whiteIds.includes(photo.id ?? 0);

  return (
    <div className='group relative w-full'>
      <MediaSlot
        mediaUrl={photoUrl || undefined}
        alt='model photo'
        aspectRatio={['3:4']}
        frameAspect='3/4'
        label='+ photo'
        hint={null}
        purpose='model photos'
        showVideos={false}
        toolbar={false}
        onSelect={onSelect}
        onOpenViewer={photo ? () => viewer.openAt(0) : undefined}
      />
      {photo && photoUrl && (
        <>
          {busy && <PictureBusy kind='cut' />}
          <Close
            size='sm'
            aria-label='remove photo'
            title='remove'
            onClick={() => field.onChange([])}
            className={cn(
              'absolute right-1 top-1 z-10 border border-borderColor bg-bgColor',
              TILE_QUIET,
            )}
          />
          <Button
            variant='simpleReverseWithBorder'
            aria-label='white bg'
            title={card > 0 ? 'white bg' : 'needs a fitting'}
            aria-busy={busy || undefined}
            disabled={busy || isWhite || !(card > 0) || white.busyId > 0}
            onClick={() => white.start(photo)}
            className={cn(
              'absolute bottom-1 right-1 z-10 size-6 text-micro leading-none hover:border-textColor disabled:text-borderColor disabled:hover:border-borderColor',
              TILE_QUIET,
              busy && 'opacity-100 disabled:text-textColor',
            )}
          >
            {busy ? '…' : <WhiteBgGlyph />}
          </Button>
          <MediaViewer items={[mediaFullToViewerItem(photo)]} {...viewer} />
        </>
      )}
    </div>
  );
}
