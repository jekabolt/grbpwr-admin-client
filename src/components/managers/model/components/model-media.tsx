import { common_MediaFull, common_Model } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import {
  MediaViewer,
  mediaFullToViewerItem,
  useMediaViewer,
} from 'components/shared/media-viewer/media-viewer';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { Close, TILE_QUIET } from 'ui';
import { ModelFormData } from './schema';

/**
 * ═══ THE MODEL'S PHOTO — ONE, 3:4, AS WIDE AS ITS COLUMN ═════════════════════════════════════════
 *
 * Empty: the slot itself is the door (click → library, ⌘V, drop), the same three gestures as every
 * picture slot. Filled: the photo and `×` top-right (remove), quiet on a desktop (hover / focus
 * inside) and always shown on a touch screen.
 *
 * WHITE BG IS NOT HERE ON PURPOSE (owner, 19.10: being re-specified). Its wired route stays in
 * `./white-bg.ts`, unmounted.
 *
 * ⚠ ONE PHOTO IN A LIST FIELD. `mediaIds` stays a list (storage unchanged: `thumbnailId` is
 * `mediaIds[0]`, the rest is the model's media). A model saved by the old gallery may carry several;
 * this shows the first, and every change here touches THAT ONE ONLY: a pick replaces it
 * (`[new, ...rest]`), `×` takes it out (`rest`, so the next one becomes the photo). The others are
 * not on screen, and detaching them as a side effect of changing the photo would be a loss nobody
 * asked for and nobody could see.
 */
export function ModelMedia({ model }: { model?: common_Model }) {
  const { control } = useFormContext<ModelFormData>();
  const { field } = useController({ control, name: 'mediaIds' });
  // A RESOLUTION CACHE, NOT THE CHOICE (the choice is `field.value`): a picked photo is not in
  // `model.media` until the model is saved and re-read.
  const [known, setKnown] = useState<common_MediaFull[]>([]);
  const viewer = useMediaViewer();

  const ids = field.value ?? [];
  const photoId = ids[0] ?? 0;
  const rest = ids.slice(1);
  const photo =
    photoId > 0 ? [...known, ...(model?.media ?? [])].find((m) => m.id === photoId) : undefined;
  const photoUrl =
    photo?.media?.compressed?.mediaUrl ||
    photo?.media?.fullSize?.mediaUrl ||
    photo?.media?.thumbnail?.mediaUrl ||
    '';

  const onSelect = (picked: common_MediaFull[]) => {
    const m = picked.find((p) => (p.id ?? 0) > 0);
    if (!m?.id) return;
    const id = m.id;
    setKnown((prev) => (prev.some((p) => p.id === id) ? prev : [...prev, m]));
    // Picking one of the hidden ones moves it to the front instead of listing it twice.
    field.onChange([id, ...rest.filter((r) => r !== id)]);
  };

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
          <Close
            size='sm'
            aria-label='remove photo'
            title='remove'
            onClick={() => field.onChange(rest)}
            className={cn(
              'absolute right-1 top-1 z-10 border border-borderColor bg-bgColor',
              TILE_QUIET,
            )}
          />
          <MediaViewer items={[mediaFullToViewerItem(photo)]} {...viewer} />
        </>
      )}
    </div>
  );
}
