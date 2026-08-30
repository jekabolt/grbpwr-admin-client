import type { common_MediaFull } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';

/**
 * The address of a picture's smallest usable rendition. Thumbnail first, then compressed, then the
 * original — a run panel draws a dozen of these at 44px, and pulling full-size files for that is how
 * opening a history costs ten megabytes.
 *
 * Empty string when the media carries no address at all, which is a real state: an input snapshot
 * whose media has since been deleted serves `media` unset and `deleted` true.
 */
export function thumbUrl(media?: common_MediaFull | null): string {
  const m = media?.media;
  return m?.thumbnail?.mediaUrl || m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || '';
}

/**
 * A fixed-size picture cell. `object-contain` and never `cover`: these are flats and photographs of
 * garments, and a crop that eats the hem to fill a square is a different picture from the one the
 * run produced.
 */
export function Thumb({
  media,
  alt,
  className,
  gone,
}: {
  media?: common_MediaFull | null;
  alt?: string;
  className?: string;
  /** The snapshot froze a media id that no longer resolves — say so instead of drawing a hole. */
  gone?: boolean;
}) {
  const src = thumbUrl(media);
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden bg-bgSecondary',
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? ''}
          loading='lazy'
          className='block h-full w-full'
          style={{ objectFit: 'contain' }}
        />
      ) : (
        <Text size='nano' variant='label' component='span' className='px-0.5 text-center'>
          {gone ? 'deleted' : 'no image'}
        </Text>
      )}
    </span>
  );
}
