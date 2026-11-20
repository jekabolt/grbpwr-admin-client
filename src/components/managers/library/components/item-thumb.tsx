import { matchesSlotRatio } from 'components/managers/media/utils/calculate-aspect';
import { extensionOf, formatBytes } from 'components/managers/files/utils/format';
import { isVideo } from 'lib/features/filterContentType';
import { Media, Pill, Placeholder, Tile } from 'ui';
import { KIND_WORD, type LibraryItem } from '../api/types';

/** The tile frame: one 4:5 cell for the whole grid, the picture fitted inside it. */
const FRAME_RATIO = '4/5';

/** The picture of a row: media thumbnail, file preview, or the extension plate. */
function ItemPicture({ item, load }: { item: LibraryItem; load: boolean }) {
  if (item.media) {
    const src = item.media.media?.thumbnail?.mediaUrl ?? '';
    return (
      <Media
        src={src}
        type={isVideo(src) ? 'video' : 'image'}
        alt={item.name || KIND_WORD[item.kind ?? 'LIBRARY_KIND_UNSPECIFIED']}
        blurhash={item.media.media?.blurhash}
        controls={false}
        preload={load ? 'metadata' : 'none'}
        load={load}
        muted
        aspectRatio={FRAME_RATIO}
        fit='contain'
      />
    );
  }
  const preview = item.file?.previewUrl ?? '';
  if (preview) {
    return (
      <Media
        src={preview}
        type='image'
        alt={item.name ?? ''}
        load={load}
        aspectRatio={FRAME_RATIO}
        fit='contain'
      />
    );
  }
  return (
    <Placeholder
      label={extensionOf(item.name ?? '')}
      className='w-full'
      style={{ aspectRatio: FRAME_RATIO }}
    />
  );
}

/**
 * One tile of the unified library. MEDIA shows its thumbnail (video by its url), FILE its
 * preview or the extension plate. Caption: the name, or the kind word for a nameless old media
 * row (ids are never shown). With `targetRatios`, a picture of another ratio carries «crop».
 */
export function ItemThumb({
  item,
  selected,
  onClick,
  targetRatios,
  load = true,
}: {
  item: LibraryItem;
  selected?: boolean;
  onClick?: () => void;
  targetRatios?: number[];
  /** Fetch the picture now (default). A virtual grid passes false while scrolling fast. */
  load?: boolean;
}) {
  const kind = item.kind ?? 'LIBRARY_KIND_UNSPECIFIED';
  const name = item.name || KIND_WORD[kind];
  const size = Number(item.sizeBytes ?? 0);
  const croppable = kind === 'LIBRARY_KIND_IMAGE' && !!item.media;
  const needsCrop =
    croppable &&
    !!targetRatios?.length &&
    !!item.width &&
    !!item.height &&
    !matchesSlotRatio(item.width, item.height, targetRatios);

  return (
    <Tile
      media={
        <span className='relative block w-full bg-pageBg'>
          <ItemPicture item={item} load={load} />
          {needsCrop && (
            <Pill tone='mut' className='absolute bottom-1 left-1 bg-bgColor'>
              crop
            </Pill>
          )}
        </span>
      }
      name={name}
      sub={size > 0 ? formatBytes(size) : undefined}
      title={item.name || undefined}
      selected={selected}
      pressed={onClick ? !!selected : undefined}
      onClick={onClick}
      lowercase
    />
  );
}
